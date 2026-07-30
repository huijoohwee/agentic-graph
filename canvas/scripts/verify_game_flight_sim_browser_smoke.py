from __future__ import annotations

import json
import os
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

from lib.game_flight_sim_smoke_deadlines import (
    GAMEPLAY_WEBSOCKET_PROBE_PATH,
)
from lib.game_flight_sim_smoke_ledger import (
    BrowserVerificationLedger,
    REQUIRED_BROWSER_VERIFICATION_NAMES,
)
from lib.game_flight_sim_smoke_network import (
    assert_transport_ownership,
    request_is_geo_provider_read,
    request_is_proof_local_read,
    summarize_websocket_attempts,
)
from lib.game_flight_sim_smoke_runtime_phases import (
    run_flight_runtime_verifications,
)
from lib.game_flight_sim_smoke_source import SOURCE_BASENAME


BASE_URL = os.environ.get(
    "KG_GAME_FLIGHT_SIM_SMOKE_BASE_URL",
    "http://localhost:4187",
).rstrip("/")
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "data" / "outputs"
RUN_INDEX = int(os.environ.get("KG_GAME_FLIGHT_SIM_SMOKE_RUN_INDEX", "1"))
RUN_COUNT = int(os.environ.get("KG_GAME_FLIGHT_SIM_SMOKE_RUN_COUNT", "1"))
EXPECTED_HEAD = os.environ.get("KG_GAME_FLIGHT_SIM_EXPECTED_HEAD", "").strip()
EXPECTED_TREE = os.environ.get("KG_GAME_FLIGHT_SIM_EXPECTED_TREE", "").strip()
EXPECTED_BRANCH = os.environ.get(
    "KG_GAME_FLIGHT_SIM_EXPECTED_BRANCH",
    "",
).strip()
EXPECTED_SOURCE_SHA256 = os.environ.get(
    "KG_GAME_FLIGHT_SIM_EXPECTED_SOURCE_SHA256",
    "",
).strip()
OUTPUT_STEM = f"game-flight-sim-browser-smoke-run-{RUN_INDEX}"
SCREENSHOT_PATH = OUTPUT_DIR / f"{OUTPUT_STEM}.png"
EVIDENCE_PATH = OUTPUT_DIR / f"{OUTPUT_STEM}.json"
FIRST_PLAYABLE_FRAME_LIMIT_MS = 3_000


def local_chromium_executable() -> str | None:
    explicit = os.environ.get(
        "KG_GAME_FLIGHT_SIM_CHROMIUM_EXECUTABLE",
        "",
    ).strip()
    candidates = [
        Path(explicit) if explicit else None,
        Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
        Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
    ]
    for candidate in candidates:
        if candidate and candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def request_record(request: Any) -> dict[str, str]:
    return {
        "method": str(request.method),
        "url": str(request.url),
        "path": urlparse(request.url).path,
        "owner": (
            "service-worker"
            if request.service_worker is not None
            else "frame"
        ),
    }


def build_websocket_probe_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise AssertionError(
            f"Flight browser proof requires an HTTP(S) base URL: {base_url}"
        )
    return parsed._replace(
        scheme="wss" if parsed.scheme == "https" else "ws",
        path=GAMEPLAY_WEBSOCKET_PROBE_PATH,
        params="",
        query="",
        fragment="",
    ).geturl()


def main() -> None:
    if RUN_INDEX < 1 or RUN_INDEX > RUN_COUNT:
        raise AssertionError(
            f"invalid serial run identity: {RUN_INDEX}/{RUN_COUNT}"
        )
    if len(EXPECTED_HEAD) != 40 or any(
        character not in "0123456789abcdef" for character in EXPECTED_HEAD
    ):
        raise AssertionError(f"invalid expected candidate HEAD: {EXPECTED_HEAD}")
    if len(EXPECTED_TREE) != 40 or any(
        character not in "0123456789abcdef" for character in EXPECTED_TREE
    ):
        raise AssertionError(f"invalid expected candidate tree: {EXPECTED_TREE}")
    if not EXPECTED_BRANCH:
        raise AssertionError("missing expected candidate branch")
    if len(EXPECTED_SOURCE_SHA256) != 64 or any(
        character not in "0123456789abcdef"
        for character in EXPECTED_SOURCE_SHA256
    ):
        raise AssertionError(
            f"invalid expected source SHA-256: {EXPECTED_SOURCE_SHA256}"
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    target_url = f"{BASE_URL}/?kgFlightSimBrowserProof=1"
    websocket_probe_url = build_websocket_probe_url(BASE_URL)
    local_origin = urlparse(BASE_URL).netloc
    requests: list[dict[str, str]] = []
    blocked_requests: list[dict[str, str]] = []
    fs_list_requests: list[dict[str, Any]] = []
    console_errors: list[str] = []
    page_errors: list[str] = []
    failed_responses: list[dict[str, Any]] = []
    web_mcp_calls: list[dict[str, Any]] = []
    websocket_events: list[str] = []
    websocket_route_hits: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=local_chromium_executable(),
            args=["--enable-webgl", "--use-angle=swiftshader"],
        )
        context = browser.new_context(viewport={"width": 1100, "height": 962})

        def route_websocket(websocket_route: Any) -> None:
            websocket_route_hits.append(str(websocket_route.url))

        def route_request(route: Any, request: Any) -> None:
            if (
                request_is_proof_local_read(request, local_origin)
                or request_is_geo_provider_read(request, local_origin)
            ):
                route.continue_()
                return
            blocked_requests.append(request_record(request))
            route.abort("blockedbyclient")

        def record_websocket(websocket: Any) -> None:
            websocket_events.append(str(websocket.url))

        def record_request(request: Any) -> None:
            requests.append(request_record(request))
            if urlparse(request.url).path != "/__kg_fs_list":
                return
            try:
                body = json.loads(request.post_data or "{}")
            except (TypeError, json.JSONDecodeError):
                body = {}
            fs_list_requests.append(
                {
                    "method": request.method,
                    "path": str(body.get("path") or ""),
                }
            )

        def record_response(response: Any) -> None:
            if response.status < 400:
                return
            failed_responses.append(
                {
                    "status": response.status,
                    "url": response.url,
                    "owner": request_record(response.request)["owner"],
                }
            )

        def reset_observed_errors() -> None:
            requests.clear()
            blocked_requests.clear()
            console_errors.clear()
            page_errors.clear()
            failed_responses.clear()
            websocket_events.clear()
            websocket_route_hits.clear()

        # Every context-level transport observer and route is installed before
        # page creation. This includes requests owned by a Service Worker,
        # whose frame accessor is unavailable by contract.
        context.route("**/*", route_request)
        context.on("request", record_request)
        context.on("response", record_response)
        # Routed sockets do not reach the server unless the handler calls
        # connect_to_server(), which this proof never does.
        context.route_web_socket("**/*", route_websocket)

        page = context.new_page()
        # The Page observer supplies the WebSocket lifecycle event while the
        # pre-page context route owns the fail-closed connection boundary.
        page.on("websocket", record_websocket)
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        try:
            ledger = BrowserVerificationLedger()
            state = run_flight_runtime_verifications(
                page,
                expected_branch=EXPECTED_BRANCH,
                expected_head=EXPECTED_HEAD,
                expected_source_sha256=EXPECTED_SOURCE_SHA256,
                first_frame_limit_ms=FIRST_PLAYABLE_FRAME_LIMIT_MS,
                ledger=ledger,
                reset_observed_errors=reset_observed_errors,
                screenshot_path=SCREENSHOT_PATH,
                target_url=target_url,
                web_mcp_calls=web_mcp_calls,
                websocket_probe_url=websocket_probe_url,
                websocket_probe_events=websocket_events,
                websocket_probe_route_hits=websocket_route_hits,
            )
            geo_provider_requests = sorted(
                {
                    request["url"]
                    for request in requests
                    if request_is_geo_provider_read(
                        SimpleNamespace(
                            method=request["method"],
                            url=request["url"],
                        ),
                        local_origin,
                    )
                }
            )
            unexpected_non_local_requests = sorted(
                {
                    request["url"]
                    for request in requests
                    if urlparse(request["url"]).netloc != local_origin
                    and not request_is_geo_provider_read(
                        SimpleNamespace(
                            method=request["method"],
                            url=request["url"],
                        ),
                        local_origin,
                    )
                }
            )
            local_runtime_paths = sorted(
                {
                    request["path"]
                    for request in requests
                    if urlparse(request["url"]).netloc == local_origin
                    and request["path"].startswith("/__")
                }
            )
            expected_seed_root = (
                Path(__file__).resolve().parents[2]
                / "docs"
                / "workspace-seeds"
            ).resolve()
            invalid_fs_list_requests = [
                request
                for request in fs_list_requests
                if (
                    request["method"] != "POST"
                    or not request["path"]
                    or Path(request["path"]).resolve() != expected_seed_root
                )
            ]
            websocket_attempts = summarize_websocket_attempts(
                websocket_probe_url,
                websocket_events,
                websocket_route_hits,
            )

            def verify_transport_ownership() -> None:
                assert_transport_ownership(
                    geo_provider_requests=geo_provider_requests,
                    unexpected_non_local_requests=(
                        unexpected_non_local_requests
                    ),
                    blocked_requests=blocked_requests,
                    websocket_events=websocket_events,
                    websocket_route_hits=websocket_route_hits,
                )

            def verify_workspace_seed_authority() -> None:
                if not fs_list_requests or invalid_fs_list_requests:
                    raise AssertionError(
                        "Flight bootstrap scanned an unrelated docs mirror: "
                        f"requests={fs_list_requests}, "
                        f"invalid={invalid_fs_list_requests}"
                    )

            def verify_browser_error_surface() -> None:
                if console_errors or page_errors or failed_responses:
                    raise AssertionError(
                        "browser errors: "
                        f"console={console_errors}, page={page_errors}, "
                        f"responses={failed_responses}"
                    )

            ledger.verify(
                "Geo provider transport ownership",
                verify_transport_ownership,
            )
            ledger.verify(
                "workspace seed authority",
                verify_workspace_seed_authority,
            )
            ledger.verify(
                "browser error surface",
                verify_browser_error_surface,
            )
            ledger.assert_success(
                expected_names=REQUIRED_BROWSER_VERIFICATION_NAMES
            )

            source_state = state["source"]
            playable_state = state["playable"]
            active_scene = state["activeScene"]
            stop_start = state["stopStart"]
            desktop = state["desktop"]
            restart = state["restart"]
            navigation_state = state["navigation"]
            camera_state = state["camera"]
            _, inactive_inspection, post_exit = state["exit"]
            initial = playable_state["initial"]
            moved = desktop["moved"]
            evidence = {
                "schema": "knowgrph-flight-sim-browser-run/v5",
                "runIndex": RUN_INDEX,
                "runCount": RUN_COUNT,
                "candidate": {
                    "head": EXPECTED_HEAD,
                    "tree": EXPECTED_TREE,
                    "branch": EXPECTED_BRANCH,
                    "runtimeRevision": source_state["runtimeIdentity"][
                        "knowgrphRevision"
                    ],
                    "runtimeBranch": source_state["runtimeIdentity"]["branch"],
                },
                "targetUrl": target_url,
                "source": source_state["source"],
                "sourceApplication": source_state["sourceApplication"],
                "physicsBaseline": source_state["physicsBaseline"],
                "activation": {
                    "automatic": True,
                    "initialPhase": initial["phase"],
                    "readyHeldAtTickZero":
                        playable_state["readyHeld"]["tick"] == 0,
                    "sourceBasename": SOURCE_BASENAME,
                },
                "renderer": {
                    "canvasCount": active_scene["canvasCount"],
                    "documentCanvasCount":
                        active_scene["documentCanvasCount"],
                    "rendererCanvasCount":
                        active_scene["rendererCanvasCount"],
                    "mapLibreCanvasCount":
                        active_scene["mapLibreCanvasCount"],
                    "visibleMapLibreCanvasCount":
                        active_scene["visibleMapLibreCanvasCount"],
                    "auxiliaryCanvasCount":
                        active_scene["auxiliaryCanvasCount"],
                    "auxiliaryCanvasesLocalOnly":
                        active_scene["auxiliaryCanvasesLocalOnly"],
                    "preFlightCanvasIdentityRetained":
                        active_scene["canvasStable"],
                    "transparentFlightRuntimeCanvas":
                        active_scene["rendererAlpha"],
                    "mapLibreOwnsVisualProjection":
                        active_scene["visualProjection"] == "maplibre",
                    "nativeXrVisualsSuppressed":
                        active_scene["nativeVisualCount"] == 0,
                    "r3fFlightVisualsSuppressed":
                        active_scene["flightVisualCount"] == 0,
                    "physicsSourceSha256":
                        source_state["physicsBaseline"]["sourceSha256"],
                    "visibleSceneSignature":
                        active_scene["visibleSceneSignature"],
                    "optionalBeacon": active_scene["optionalBeacon"],
                },
                "geoXrPresentation": state["geoXrPresentation"],
                "playableFrame": {
                    "firstFrame": True,
                    **playable_state["firstFrame"],
                    "limitMs": FIRST_PLAYABLE_FRAME_LIMIT_MS,
                    "airborneCapable": (
                        playable_state["initialAirspeed"] > 0
                        and initial["aircraft"]["position"][1] > 0
                    ),
                    "initialAltitude": initial["aircraft"]["position"][1],
                    "initialAirspeed": playable_state["initialAirspeed"],
                    "tickBefore": initial["tick"],
                    "tickAfterInput": moved["tick"],
                    "positionBefore": initial["aircraft"]["position"],
                    "positionAfter": moved["aircraft"]["position"],
                    "hudPitch": desktop["hudPitch"],
                    "hudRoll": desktop["hudRoll"],
                },
                "deadlines": state["deadlines"],
                "inputProof": {
                    "desktopInteractionExercised": True,
                    "desktopTickBefore": initial["tick"],
                    "desktopTickAfter": moved["tick"],
                    "motionControlPanelHandoff": state["motionControl"],
                    "webMcpThrottleExercised": True,
                    "touchInteraction": state["touch"],
                },
                "missionProof": state["mission"],
                "webMcp": {
                    **state["webMcp"],
                    "calls": web_mcp_calls,
                    "inactiveInspect": inactive_inspection["result"],
                },
                "lifecycle": {
                    "blurStoppedTick": state["blur"]["stopped"]["tick"],
                    "blurFrozenTick": state["blur"]["frozen"]["tick"],
                    "blurResumedTick": state["blur"]["resumed"]["tick"],
                    "freshInputTick": state["blur"]["freshInput"]["tick"],
                    "stoppedTick": stop_start["stopped"]["tick"],
                    "frozenTick": stop_start["frozen"]["tick"],
                    "resumedTick": stop_start["resumed"]["tick"],
                    "resumedAdvancedTick": moved["tick"],
                    "restartRunId": restart["restarted"]["runId"],
                    "postRestartTick": restart["replayed"]["tick"],
                    "exitStateDiscarded": True,
                    "postExit": post_exit,
                    "surfaceFailurePaths": state["surfaceFailures"],
                },
                "camera": {
                    **camera_state["camera"],
                    "tickAfter": camera_state["advanced"]["tick"],
                },
                "navigation": navigation_state,
                "mobileHud": state["mobileHud"],
                "throttle": 0.75,
                "verificationLedger": ledger.evidence(),
                "geoProviderRequests": geo_provider_requests,
                "unexpectedNonLocalRequests": (
                    unexpected_non_local_requests
                ),
                "blockedRequests": blocked_requests,
                "serviceWorkerRequests": [
                    request
                    for request in requests
                    if request["owner"] == "service-worker"
                ],
                "webSocketProbe": {
                    "url": websocket_probe_url,
                    "events": websocket_attempts["probeEvents"],
                    "routeHits": websocket_attempts["probeRouteHits"],
                    "productionFenceEscapeObserved": bool(
                        websocket_attempts["probeEvents"]
                        or websocket_attempts["probeRouteHits"]
                    ),
                    "serverTransportAllowed": False,
                    "transportObserved": False,
                },
                "webSocketAttempts": {
                    "routePattern": "**/*",
                    "events": websocket_events,
                    "routeHits": websocket_route_hits,
                    "unexpectedEvents":
                        websocket_attempts["unexpectedEvents"],
                    "unexpectedRouteHits":
                        websocket_attempts["unexpectedRouteHits"],
                    "serverTransportAllowed": False,
                },
                "requests": requests,
                "localRuntimeRequestPaths": local_runtime_paths,
                "workspaceSeedListRequests": fs_list_requests,
                "consoleErrors": console_errors,
                "pageErrors": page_errors,
                "failedResponses": failed_responses,
                "screenshot": str(SCREENSHOT_PATH),
            }
            EVIDENCE_PATH.write_text(
                json.dumps(evidence, indent=2) + "\n",
                encoding="utf-8",
            )
            print(f"OK game-flight-sim-browser-smoke {target_url}")
            print(f"Evidence: {EVIDENCE_PATH}")
            print(f"Screenshot: {SCREENSHOT_PATH}")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
