from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import urlparse


SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_ROOT))

from playwright.sync_api import WebSocketRoute, sync_playwright
from verify_game_flight_sim_browser_smoke import local_chromium_executable


def main() -> None:
    base_url = os.environ.get(
        "KG_GAME_FLIGHT_SIM_PREVIEW_PREFLIGHT_BASE_URL",
        "",
    ).rstrip("/")
    parsed_base_url = urlparse(base_url)
    if parsed_base_url.scheme != "http" or not parsed_base_url.netloc:
        raise AssertionError(
            "KG_GAME_FLIGHT_SIM_PREVIEW_PREFLIGHT_BASE_URL must be an HTTP URL"
        )

    websocket_events: list[str] = []
    websocket_route_hits: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=local_chromium_executable(),
        )
        context = browser.new_context(service_workers="block")

        def block_websocket(websocket_route: WebSocketRoute) -> None:
            websocket_route_hits.append(str(websocket_route.url))

        context.route_web_socket("**/*", block_websocket)
        page = context.new_page()
        page.on(
            "websocket",
            lambda websocket: websocket_events.append(str(websocket.url)),
        )
        response = page.goto(
            f"{base_url}/",
            wait_until="domcontentloaded",
            timeout=60_000,
        )
        if response is None or not response.ok:
            status = response.status if response is not None else "none"
            raise AssertionError(
                "Flight preview preflight did not load the real preview page: "
                f"{status}"
            )
        page.wait_for_selector(
            '[data-kg-flight-sim-preactivation-ready="1"]',
            state="attached",
            timeout=30_000,
        )
        page.wait_for_timeout(500)
        if page.locator('[data-kg-flight-sim-hud="1"]').count() != 0:
            raise AssertionError(
                "Flight preview preflight activated Flight before navigation"
            )
        browser.close()

    if websocket_events or websocket_route_hits:
        raise AssertionError(
            "Flight preview preflight observed harness WebSocket attempts "
            f"before Flight activation: events={websocket_events}, "
            f"routeHits={websocket_route_hits}"
        )
    print(
        "Flight preview preflight passed: real preview page executed with zero "
        "pre-Flight WebSocket attempts."
    )


if __name__ == "__main__":
    main()
