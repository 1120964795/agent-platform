"""browser-use bridge — FastAPI server on 127.0.0.1.

Endpoints:
  GET  /health     → { ok, runtime, version, ready }
  POST /execute    → SSE stream of { type, ... }
  POST /cancel     → cancels in-flight task
"""
import json
import os
import sys

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from browser_agent import BrowserTask, env_bool, get_pool

app = FastAPI(title="browser-use-bridge", version="0.1.0")


class ExecuteRequest(BaseModel):
    goal: str
    max_steps: int = 15
    start_url: str | None = None
    headless: bool | None = None
    keep_alive: bool | None = None


@app.get("/health")
async def health():
    return {
        "ok": True,
        "runtime": "browser-use",
        "version": "0.1.0",
        "ready": True,
    }


def sse_event(event_type: str, data: dict | str):
    if isinstance(data, dict):
        data = json.dumps(data, ensure_ascii=False, default=str)
    return f"event: {event_type}\ndata: {data}\n\n"


@app.post("/execute")
async def execute(req: ExecuteRequest):
    """Run a browser task, streaming SSE events back to the client."""
    pool = get_pool()

    async def event_stream():
        import time
        started = time.time()

        # Emit start event
        yield sse_event("start", {
            "goal": req.goal,
            "max_steps": req.max_steps,
            "start_url": req.start_url,
        })

        task = BrowserTask(
            goal=req.goal,
            max_steps=req.max_steps,
            start_url=req.start_url,
            headless=req.headless if req.headless is not None else env_bool("BROWSER_USE_HEADLESS", True),
            keep_alive=req.keep_alive,
        )

        result = await pool.run_task(task)

        # Emit result
        yield sse_event("result", {
            "success": result.success,
            "summary": result.summary,
            "final_url": result.final_url,
            "steps_completed": result.steps_completed,
            "duration_ms": result.duration_ms,
            "error": result.error,
        })

        # Emit done
        yield sse_event("done", {
            "duration_ms": int((time.time() - started) * 1000),
        })

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/cancel")
async def cancel_task():
    pool = get_pool()
    await pool.cancel_current()
    return {"ok": True, "message": "已请求取消当前任务。"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("BROWSER_USE_PORT", sys.argv[1] if len(sys.argv) > 1 else "8780"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
