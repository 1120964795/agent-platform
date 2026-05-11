"""browser-use Agent wrapper — single concurrency, configurable LLM backend."""
import asyncio
import os
import traceback
from dataclasses import dataclass
from typing import Optional

from browser_use import Agent, Browser, ChatOpenAI


DEFAULT_BROWSER_USE_ENDPOINT = "https://zenmux.ai/api/v1"
DEFAULT_BROWSER_USE_MODEL = "openai/gpt-5.5"


def env_bool(name: str, default: bool = True) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def extract_single_start_url(goal: str) -> Optional[str]:
    import re

    text = re.sub(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", "", goal or "")
    patterns = [
        r"https?://[^\s<>\"']+",
        r"(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}(?:/[^\s<>\"']*)?",
    ]
    excluded_extensions = {
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
        "txt", "md", "csv", "json", "xml", "yaml", "yml",
        "zip", "rar", "7z", "jpg", "jpeg", "png", "gif", "webp",
        "mp3", "mp4", "avi", "mkv", "mov", "py", "js", "css",
    }

    found = []
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            url = re.sub(r"[.,;:!?()\[\]]+$", "", match.group(0))
            url_lower = url.lower()
            if any(f".{ext}" in url_lower for ext in excluded_extensions):
                continue
            context_start = max(0, match.start() - 20)
            context = text[context_start:match.start()].lower()
            if any(word in context for word in ("never", "dont", "don't", "not")):
                continue
            if not url.startswith(("http://", "https://")):
                url = "https://" + url
            found.append(url)

    unique = list(dict.fromkeys(found))
    return unique[0] if len(unique) == 1 else None


@dataclass
class BrowserTask:
    goal: str
    max_steps: int = 15
    start_url: Optional[str] = None
    headless: bool = True
    keep_alive: Optional[bool] = None


@dataclass
class BrowserResult:
    success: bool
    summary: str
    final_url: str = ""
    screenshot_base64: Optional[str] = None
    error: Optional[str] = None
    steps_completed: int = 0
    duration_ms: int = 0


class BrowserAgentPool:
    """Single-concurrency browser agent pool.

    Only one task runs at a time. An in-flight task can be cancelled
    via cancel_current().
    """

    def __init__(self):
        self._current_task: Optional[asyncio.Task] = None
        self._browser: Optional[Browser] = None
        self._browser_headless: Optional[bool] = None
        self._browser_keep_alive: Optional[bool] = None
        self._browser_disconnect_poll_seconds = 0.25

    def _build_llm(self):
        endpoint = os.environ.get("BROWSER_USE_MODEL_ENDPOINT", DEFAULT_BROWSER_USE_ENDPOINT)
        api_key = os.environ.get("BROWSER_USE_MODEL_API_KEY", "")
        model_name = os.environ.get("BROWSER_USE_MODEL_NAME", DEFAULT_BROWSER_USE_MODEL)

        if endpoint and api_key:
            return ChatOpenAI(
                model=model_name,
                base_url=endpoint,
                api_key=api_key,
            )
        # Fallback: try standard OpenAI env vars
        return ChatOpenAI(model="gpt-4o")

    def _use_vision(self) -> bool:
        return env_bool("BROWSER_USE_VISION_ENABLED", True)

    def _keep_alive(self, task: BrowserTask) -> bool:
        if task.keep_alive is not None:
            return task.keep_alive
        return env_bool("BROWSER_USE_KEEP_ALIVE", not task.headless)

    def _initial_actions_for_task(self, task: BrowserTask):
        start_url = task.start_url or extract_single_start_url(task.goal)
        return [{"navigate": {"url": start_url or "about:blank", "new_tab": True}}]

    def _browser_connected_state(self, browser) -> Optional[bool]:
        try:
            connected = getattr(browser, "is_cdp_connected", None)
            if callable(connected):
                connected = connected()
            return connected if isinstance(connected, bool) else None
        except Exception:
            return False

    def _browser_page_target_ids(self, browser) -> Optional[set[str]]:
        try:
            get_page_targets = getattr(browser, "get_page_targets", None)
            if not callable(get_page_targets):
                return set()
            target_ids = set()
            for target in get_page_targets() or []:
                if isinstance(target, dict):
                    target_id = target.get("targetId") or target.get("target_id")
                else:
                    target_id = (
                        getattr(target, "target_id", None)
                        or getattr(target, "targetId", None)
                        or getattr(target, "_target_id", None)
                    )
                if target_id:
                    target_ids.add(str(target_id))
            return target_ids
        except Exception:
            return None

    async def _wait_for_browser_disconnect(self, browser) -> bool:
        saw_connected = False
        saw_page_targets = False
        saw_focused_target = False
        while self._browser is browser:
            connected = self._browser_connected_state(browser)
            if connected is True:
                saw_connected = True
            elif connected is False and saw_connected:
                return True

            page_target_ids = self._browser_page_target_ids(browser)
            if page_target_ids is not None:
                if page_target_ids:
                    saw_page_targets = True
                elif saw_page_targets:
                    return True

                focused_target_id = getattr(browser, "agent_focus_target_id", None)
                if focused_target_id:
                    if str(focused_target_id) in page_target_ids:
                        saw_focused_target = True
                    elif saw_focused_target:
                        return True

            await asyncio.sleep(self._browser_disconnect_poll_seconds)
        return False

    def _forget_browser(self, browser):
        if self._browser is not browser:
            return
        self._browser = None
        self._browser_headless = None
        self._browser_keep_alive = None

    def _looks_like_browser_closed_error(self, exc: Exception) -> bool:
        text = f"{type(exc).__name__}: {exc}".lower()
        markers = (
            "browser has been closed",
            "target page, context or browser has been closed",
            "connection closed",
            "websocket",
            "cdp",
        )
        return any(marker in text for marker in markers)

    async def _close_browser(self):
        if not self._browser:
            return
        for method_name in ("kill", "close", "stop", "reset"):
            method = getattr(self._browser, method_name, None)
            if not callable(method):
                continue
            result = method()
            if hasattr(result, "__await__"):
                await result
            return

    async def _ensure_browser(self, headless: bool, keep_alive: bool) -> Browser:
        if self._browser is None:
            self._browser = Browser(headless=headless, keep_alive=keep_alive)
            self._browser_headless = headless
            self._browser_keep_alive = keep_alive
        elif self._browser_headless != headless or self._browser_keep_alive != keep_alive:
            try:
                await self._close_browser()
            except Exception:
                pass
            self._browser = Browser(headless=headless, keep_alive=keep_alive)
            self._browser_headless = headless
            self._browser_keep_alive = keep_alive
        return self._browser

    def _read_result_value(self, result, name, fallback=None):
        value = getattr(result, name, fallback)
        return value() if callable(value) else value

    def _normalize_run_result(self, result, task: BrowserTask) -> BrowserResult:
        urls = self._read_result_value(result, "urls", []) or []
        final = self._read_result_value(result, "final_result", None)
        steps = self._read_result_value(result, "number_of_steps", 0) or 0
        dur = self._read_result_value(result, "total_duration_seconds", 0) or 0
        raw_success = bool(self._read_result_value(result, "is_successful", False))

        summary = "" if final is None else str(final).strip()
        if summary.lower() in {"none", "null"}:
            summary = ""

        final_url = urls[-1] if urls else ""
        reasons = []
        if not summary:
            reasons.append("summary_missing")
        if task.start_url and final_url.lower() in {"", "about:blank"}:
            reasons.append("final_url_about_blank")

        return BrowserResult(
            success=raw_success and not reasons,
            summary=summary or "browser-use did not return a usable page result.",
            final_url=final_url,
            error=f"BROWSER_TASK_INCOMPLETE: {', '.join(reasons)}" if reasons else None,
            steps_completed=steps,
            duration_ms=int(dur * 1000) if dur else 0,
        )

    async def run_task(self, task: BrowserTask):
        import time
        started = time.time()

        async def _run():
            llm = self._build_llm()
            browser = await self._ensure_browser(task.headless, self._keep_alive(task))

            agent = Agent(
                task=task.goal,
                llm=llm,
                browser=browser,
                use_vision=self._use_vision(),
                initial_actions=self._initial_actions_for_task(task),
                directly_open_url=False,
            )

            agent_task = asyncio.create_task(agent.run(max_steps=task.max_steps))
            disconnect_task = asyncio.create_task(self._wait_for_browser_disconnect(browser))
            try:
                done, _pending = await asyncio.wait(
                    {agent_task, disconnect_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )

                if disconnect_task in done and disconnect_task.result():
                    agent_task.cancel()
                    try:
                        await agent_task
                    except asyncio.CancelledError:
                        pass
                    self._forget_browser(browser)
                    return BrowserResult(
                        success=False,
                        summary="浏览器窗口已关闭，任务已停止。",
                        error="BROWSER_CLOSED",
                        duration_ms=int((time.time() - started) * 1000),
                    )

                try:
                    result = await agent_task
                except Exception as exc:
                    if self._looks_like_browser_closed_error(exc) or self._browser_connected_state(browser) is False:
                        self._forget_browser(browser)
                        return BrowserResult(
                            success=False,
                            summary="浏览器窗口已关闭，任务已停止。",
                            error="BROWSER_CLOSED",
                            duration_ms=int((time.time() - started) * 1000),
                        )
                    raise
            finally:
                disconnect_task.cancel()
                try:
                    await disconnect_task
                except asyncio.CancelledError:
                    pass

            return self._normalize_run_result(result, task)

        self._current_task = asyncio.ensure_future(_run())
        try:
            return await self._current_task
        except asyncio.CancelledError:
            return BrowserResult(
                success=False,
                summary="任务已被取消。",
                error="CANCELLED",
                duration_ms=int((time.time() - started) * 1000),
            )
        except Exception as exc:
            return BrowserResult(
                success=False,
                summary=f"browser-use 执行失败：{exc}",
                error=traceback.format_exc(),
                duration_ms=int((time.time() - started) * 1000),
            )
        finally:
            self._current_task = None

    async def cancel_current(self):
        if self._current_task and not self._current_task.done():
            self._current_task.cancel()
            try:
                await self._current_task
            except asyncio.CancelledError:
                pass

    async def close(self):
        await self.cancel_current()
        if self._browser:
            try:
                await self._close_browser()
            except Exception:
                pass
            self._browser = None
            self._browser_headless = None
            self._browser_keep_alive = None

    def browser_alive(self) -> bool:
        return self._browser is not None


# Module-level singleton
_pool: Optional[BrowserAgentPool] = None


def get_pool() -> BrowserAgentPool:
    global _pool
    if _pool is None:
        _pool = BrowserAgentPool()
    return _pool
