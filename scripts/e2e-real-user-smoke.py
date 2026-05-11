import argparse
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


ERROR_MARKERS = [
    "MissingParameter",
    "AuthenticationError",
    "InvalidEndpointOrModel",
    "BrowserSession object has no attribute 'headless'",
]


def parse_args():
    parser = argparse.ArgumentParser(description="Run a visible Electron real-user smoke test through CDP.")
    parser.add_argument("--cdp", default="http://127.0.0.1:9222", help="Electron remote debugging endpoint.")
    parser.add_argument("--output-dir", default="output/playwright", help="Directory for screenshots.")
    parser.add_argument("--skip-browser-task", action="store_true", help="Only verify basic chat.")
    parser.add_argument("--timeout", type=int, default=300, help="Timeout per browser-task phase in seconds.")
    return parser.parse_args()


def body_text(page):
    return page.locator("body").inner_text(timeout=5000)


def wait_until(label, predicate, timeout_s=120, interval_s=1):
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        try:
            last = predicate()
            if last:
                return last
        except Exception as exc:
            last = exc
        time.sleep(interval_s)
    raise TimeoutError(f"Timed out waiting for {label}; last={last!r}")


def assert_no_error_markers(text):
    tail = text[-5000:]
    for marker in ERROR_MARKERS:
        if marker in tail:
            raise AssertionError(f"UI contains error marker {marker}: {tail}")


def click_new_chat(page):
    page.locator("aside button").nth(1).click()
    page.wait_for_timeout(800)


def send_message(page, text):
    textarea = page.locator("textarea").first
    textarea.click()
    textarea.fill("")
    textarea.type(text, delay=8)
    page.locator("form").filter(has=page.locator("textarea")).locator('button[type="submit"]').first.click()


def first_page(browser):
    pages = [page for context in browser.contexts for page in context.pages]
    if not pages:
        raise RuntimeError("No Electron pages found on the CDP endpoint.")
    return pages[0]


def run_basic_chat(page, output_dir):
    click_new_chat(page)
    send_message(page, "Reply with exactly: ui-smoke-ok")
    wait_until(
        "assistant ui-smoke-ok reply",
        lambda: body_text(page) if body_text(page).count("ui-smoke-ok") >= 2 else None,
        timeout_s=120,
    )
    text = body_text(page)
    assert_no_error_markers(text)
    page.screenshot(path=str(output_dir / "aionui-smoke-chat.png"), full_page=True)
    print("basic_chat=ok")


def run_browser_task(page, output_dir, timeout_s):
    click_new_chat(page)
    send_message(page, "Open https://example.com and tell me the page title.")

    approvals = 0
    start = time.time()
    final_text = None
    while time.time() - start < timeout_s:
        text = body_text(page)
        assert_no_error_markers(text)
        if "Example Domain" in text[-5000:]:
            final_text = text
            break

        approve = page.locator("button.bg-green-600")
        if approve.count() > 0:
            approvals += 1
            page.screenshot(path=str(output_dir / f"aionui-browser-approval-{approvals}.png"), full_page=True)
            approve.first.click()
            page.wait_for_timeout(1500)
            continue

        page.wait_for_timeout(1500)

    if not final_text:
        page.screenshot(path=str(output_dir / "aionui-browser-timeout.png"), full_page=True)
        raise TimeoutError("Browser task did not produce a final answer containing Example Domain.")

    page.screenshot(path=str(output_dir / "aionui-browser-final.png"), full_page=True)
    print(f"browser_task=ok approvals={approvals}")


def main():
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
      browser = playwright.chromium.connect_over_cdp(args.cdp)
      page = first_page(browser)
      page.wait_for_load_state("domcontentloaded")
      page.wait_for_timeout(1000)

      print(f"url={page.url}")
      print(f"title={page.title()}")
      run_basic_chat(page, output_dir)
      if not args.skip_browser_task:
          run_browser_task(page, output_dir, args.timeout)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"e2e-real-user-smoke failed: {exc}", file=sys.stderr)
        sys.exit(1)
