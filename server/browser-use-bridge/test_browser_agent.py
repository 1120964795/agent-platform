import asyncio

from browser_agent import BrowserAgentPool, BrowserTask


class FakeBrowser:
    instances = []

    def __init__(self, headless=True, keep_alive=None):
        self.requested_headless = headless
        self.requested_keep_alive = keep_alive
        self.closed = False
        FakeBrowser.instances.append(self)

    async def close(self):
        self.closed = True


def reset_fake_browser():
    FakeBrowser.instances = []


def test_reuses_browser_without_reading_browser_session_headless(monkeypatch):
    import browser_agent

    reset_fake_browser()
    monkeypatch.setattr(browser_agent, "Browser", FakeBrowser)
    pool = BrowserAgentPool()

    first = asyncio.run(pool._ensure_browser(True, False))
    second = asyncio.run(pool._ensure_browser(True, False))

    assert second is first
    assert len(FakeBrowser.instances) == 1


def test_recreates_browser_when_headless_mode_changes(monkeypatch):
    import browser_agent

    reset_fake_browser()
    monkeypatch.setattr(browser_agent, "Browser", FakeBrowser)
    pool = BrowserAgentPool()

    first = asyncio.run(pool._ensure_browser(True, False))
    second = asyncio.run(pool._ensure_browser(False, True))

    assert second is not first
    assert first.closed is True
    assert second.requested_headless is False
    assert second.requested_keep_alive is True
    assert len(FakeBrowser.instances) == 2


def test_recreates_browser_when_keep_alive_mode_changes(monkeypatch):
    import browser_agent

    reset_fake_browser()
    monkeypatch.setattr(browser_agent, "Browser", FakeBrowser)
    pool = BrowserAgentPool()

    first = asyncio.run(pool._ensure_browser(False, True))
    second = asyncio.run(pool._ensure_browser(False, False))

    assert second is not first
    assert first.closed is True
    assert second.requested_headless is False
    assert second.requested_keep_alive is False
    assert len(FakeBrowser.instances) == 2


def test_run_task_respects_disabled_vision_env(monkeypatch):
    import browser_agent

    class FakeHistory:
        def urls(self):
            return ["https://example.com"]

        def final_result(self):
            return "Example Domain"

        def number_of_steps(self):
            return 1

        def total_duration_seconds(self):
            return 0.25

        def is_successful(self):
            return True

    captured = {}

    class FakeAgent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def run(self, max_steps):
            return FakeHistory()

    reset_fake_browser()
    monkeypatch.setenv("BROWSER_USE_VISION_ENABLED", "false")
    monkeypatch.setattr(browser_agent, "Browser", FakeBrowser)
    monkeypatch.setattr(browser_agent, "Agent", FakeAgent)
    monkeypatch.setattr(BrowserAgentPool, "_build_llm", lambda self: object())

    result = asyncio.run(BrowserAgentPool().run_task(BrowserTask(
        goal="Open https://example.com and tell me the page title.",
    )))

    assert result.success is True
    assert captured["use_vision"] is False


def test_recreates_browser_with_kill_lifecycle_fallback(monkeypatch):
    import browser_agent

    class FakeKillBrowser:
        instances = []

        def __init__(self, headless=True, keep_alive=None):
            self.requested_headless = headless
            self.requested_keep_alive = keep_alive
            self.killed = False
            FakeKillBrowser.instances.append(self)

        async def kill(self):
            self.killed = True

    monkeypatch.setattr(browser_agent, "Browser", FakeKillBrowser)
    pool = BrowserAgentPool()

    first = asyncio.run(pool._ensure_browser(True, False))
    second = asyncio.run(pool._ensure_browser(False, True))

    assert first.killed is True
    assert second is not first
    assert second.requested_headless is False
    assert second.requested_keep_alive is True
    assert len(FakeKillBrowser.instances) == 2


def test_visible_task_keeps_browser_alive_by_default(monkeypatch):
    import browser_agent

    class FakeHistory:
        def urls(self):
            return ["https://example.com"]

        def final_result(self):
            return "Example Domain"

        def number_of_steps(self):
            return 1

        def total_duration_seconds(self):
            return 0.25

        def is_successful(self):
            return True

    class FakeAgent:
        def __init__(self, **kwargs):
            pass

        async def run(self, max_steps):
            return FakeHistory()

    reset_fake_browser()
    monkeypatch.delenv("BROWSER_USE_KEEP_ALIVE", raising=False)
    monkeypatch.setattr(browser_agent, "Browser", FakeBrowser)
    monkeypatch.setattr(browser_agent, "Agent", FakeAgent)
    monkeypatch.setattr(BrowserAgentPool, "_build_llm", lambda self: object())

    result = asyncio.run(BrowserAgentPool().run_task(BrowserTask(
        goal="Open https://example.com and tell me the page title.",
        headless=False,
    )))

    assert result.success is True
    assert FakeBrowser.instances[0].requested_keep_alive is True


def test_run_task_opens_detected_start_url_in_new_tab(monkeypatch):
    import browser_agent

    class FakeHistory:
        def urls(self):
            return ["https://example.com"]

        def final_result(self):
            return "Example Domain"

        def number_of_steps(self):
            return 1

        def total_duration_seconds(self):
            return 0.25

        def is_successful(self):
            return True

    captured = {}

    class FakeAgent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def run(self, max_steps):
            return FakeHistory()

    reset_fake_browser()
    monkeypatch.setattr(browser_agent, "Browser", FakeBrowser)
    monkeypatch.setattr(browser_agent, "Agent", FakeAgent)
    monkeypatch.setattr(BrowserAgentPool, "_build_llm", lambda self: object())

    result = asyncio.run(BrowserAgentPool().run_task(BrowserTask(
        goal="Open https://example.com and tell me the page title.",
        headless=False,
    )))

    assert result.success is True
    assert captured["initial_actions"] == [
        {"navigate": {"url": "https://example.com", "new_tab": True}}
    ]
    assert captured["directly_open_url"] is False


def test_run_task_opens_blank_new_tab_when_no_start_url(monkeypatch):
    import browser_agent

    class FakeHistory:
        def urls(self):
            return ["https://www.google.com/search?q=weather"]

        def final_result(self):
            return "Weather results"

        def number_of_steps(self):
            return 2

        def total_duration_seconds(self):
            return 0.5

        def is_successful(self):
            return True

    captured = {}

    class FakeAgent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def run(self, max_steps):
            return FakeHistory()

    reset_fake_browser()
    monkeypatch.setattr(browser_agent, "Browser", FakeBrowser)
    monkeypatch.setattr(browser_agent, "Agent", FakeAgent)
    monkeypatch.setattr(BrowserAgentPool, "_build_llm", lambda self: object())

    result = asyncio.run(BrowserAgentPool().run_task(BrowserTask(
        goal="Search the web for today's weather.",
        headless=False,
    )))

    assert result.success is True
    assert captured["initial_actions"] == [
        {"navigate": {"url": "about:blank", "new_tab": True}}
    ]
    assert captured["directly_open_url"] is False


def test_build_llm_defaults_to_zenmux_endpoint_and_model(monkeypatch):
    import browser_agent

    captured = {}

    class FakeChatOpenAI:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.delenv("BROWSER_USE_MODEL_ENDPOINT", raising=False)
    monkeypatch.delenv("BROWSER_USE_MODEL_NAME", raising=False)
    monkeypatch.setenv("BROWSER_USE_MODEL_API_KEY", "sk-test")
    monkeypatch.setattr(browser_agent, "ChatOpenAI", FakeChatOpenAI)

    llm = BrowserAgentPool()._build_llm()

    assert isinstance(llm, FakeChatOpenAI)
    assert captured == {
        "model": "openai/gpt-5.5",
        "base_url": "https://zenmux.ai/api/v1",
        "api_key": "sk-test",
    }


def test_run_task_marks_blank_browser_result_incomplete(monkeypatch):
    import browser_agent

    class FakeHistory:
        def urls(self):
            return ["about:blank"]

        def final_result(self):
            return None

        def number_of_steps(self):
            return 6

        def total_duration_seconds(self):
            return 1.25

        def is_successful(self):
            return True

    class FakeAgent:
        def __init__(self, **kwargs):
            pass

        async def run(self, max_steps):
            return FakeHistory()

    reset_fake_browser()
    monkeypatch.setattr(browser_agent, "Browser", FakeBrowser)
    monkeypatch.setattr(browser_agent, "Agent", FakeAgent)
    monkeypatch.setattr(BrowserAgentPool, "_build_llm", lambda self: object())

    result = asyncio.run(BrowserAgentPool().run_task(BrowserTask(
        goal="Open https://example.com and tell me the page title.",
        start_url="https://example.com",
    )))

    assert result.success is False
    assert result.summary == "browser-use did not return a usable page result."
    assert result.final_url == "about:blank"
    assert result.error == "BROWSER_TASK_INCOMPLETE: summary_missing, final_url_about_blank"


def test_run_task_stops_when_visible_browser_window_closes(monkeypatch):
    import browser_agent

    class DisconnectingBrowser(FakeBrowser):
        def __init__(self, headless=True, keep_alive=None):
            super().__init__(headless=headless, keep_alive=keep_alive)
            self.polls = 0

        @property
        def is_cdp_connected(self):
            self.polls += 1
            return self.polls == 1

    class HangingAgent:
        cancelled = False

        def __init__(self, **kwargs):
            pass

        async def run(self, max_steps):
            try:
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                HangingAgent.cancelled = True
                raise

    reset_fake_browser()
    monkeypatch.setattr(browser_agent, "Browser", DisconnectingBrowser)
    monkeypatch.setattr(browser_agent, "Agent", HangingAgent)
    monkeypatch.setattr(BrowserAgentPool, "_build_llm", lambda self: object())

    pool = BrowserAgentPool()
    pool._browser_disconnect_poll_seconds = 0.01

    result = asyncio.run(pool.run_task(BrowserTask(
        goal="Open https://example.com and keep checking the page.",
        headless=False,
    )))

    assert result.success is False
    assert result.summary == "浏览器窗口已关闭，任务已停止。"
    assert result.error == "BROWSER_CLOSED"
    assert HangingAgent.cancelled is True
    assert pool.browser_alive() is False


def test_run_task_stops_when_active_browser_page_closes(monkeypatch):
    import browser_agent

    class FakeTarget:
        def __init__(self, target_id):
            self.target_id = target_id

    class ClosingPageBrowser(FakeBrowser):
        def __init__(self, headless=True, keep_alive=None):
            super().__init__(headless=headless, keep_alive=keep_alive)
            self.polls = 0
            self.agent_focus_target_id = "page-1"

        @property
        def is_cdp_connected(self):
            return True

        def get_page_targets(self):
            self.polls += 1
            if self.polls == 1:
                return [FakeTarget("page-1"), FakeTarget("page-2")]
            return [FakeTarget("page-2")]

    class HangingAgent:
        cancelled = False

        def __init__(self, **kwargs):
            pass

        async def run(self, max_steps):
            try:
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                HangingAgent.cancelled = True
                raise

    reset_fake_browser()
    monkeypatch.setattr(browser_agent, "Browser", ClosingPageBrowser)
    monkeypatch.setattr(browser_agent, "Agent", HangingAgent)
    monkeypatch.setattr(BrowserAgentPool, "_build_llm", lambda self: object())

    pool = BrowserAgentPool()
    pool._browser_disconnect_poll_seconds = 0.01

    result = asyncio.run(pool.run_task(BrowserTask(
        goal="Open https://example.com and keep checking the page.",
        headless=False,
    )))

    assert result.success is False
    assert result.summary == "浏览器窗口已关闭，任务已停止。"
    assert result.error == "BROWSER_CLOSED"
    assert HangingAgent.cancelled is True
    assert pool.browser_alive() is False
