from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse

from lib.game_mode_xr_share_smoke_source import normalized_origin, origin_label


def audit_request_origins(
    requests: list[str],
    *,
    base_url: str,
    local_origin: tuple[str, str, int],
    supplied_origin: tuple[str, str, int],
    product_document_url: str,
) -> int:
    allowed_origins = {local_origin, supplied_origin}
    unexpected_origins: set[str] = set()
    supplied_origin_requests: list[str] = []
    for request_url in requests:
        parsed = urlparse(request_url)
        if parsed.scheme not in {"http", "https"}:
            continue
        origin = normalized_origin(request_url)
        if origin not in allowed_origins:
            unexpected_origins.add(f"request:{origin_label(origin)}")
        if origin == supplied_origin:
            supplied_origin_requests.append(request_url)
            if request_url != product_document_url:
                unexpected_origins.add("supplied-document:unexpected-target")
        if origin == local_origin and parsed.path == "/__fetch_remote":
            proxied_targets = parse_qs(parsed.query).get("url", [])
            proxy_target_url = (
                urljoin(f"{base_url}/", proxied_targets[0])
                if len(proxied_targets) == 1
                else ""
            )
            proxy_target_origin = (
                normalized_origin(proxy_target_url)
                if proxy_target_url
                else ("", "", 80)
            )
            if len(proxied_targets) != 1 or proxy_target_origin not in allowed_origins:
                unexpected_origins.add(f"proxy:{origin_label(proxy_target_origin)}")
            if proxy_target_origin == supplied_origin and proxy_target_url != product_document_url:
                unexpected_origins.add("proxy-supplied-document:unexpected-target")
    if unexpected_origins:
        raise AssertionError(
            "browser runtime contacted an origin outside the local and supplied allowlist: "
            f"{sorted(unexpected_origins)}"
        )
    fetch_count = len(supplied_origin_requests)
    if fetch_count != 1 or supplied_origin_requests != [product_document_url]:
        raise AssertionError("browser runtime did not fetch the exact product-derived validation document once")
    return fetch_count


def build_browser_evidence(
    *,
    public_markdown_bytes: int,
    panel_scene_continuity: list[str],
    game_scene_delta: dict[str, object],
    grounded_camera_fov: float,
    restored_frame: dict[str, Any],
    progressed_frame: dict[str, Any],
    restored_step_count: int,
    product_document_fetch_count: int,
    console_error_count: int,
    page_error_count: int,
    failed_response_count: int,
    active_screenshot_name: str,
    restored_screenshot_name: str,
) -> dict[str, Any]:
    return {
        "schema": "agenticgraph-game-mode-xr-share-browser-smoke/v1",
        "source": {
            "env": "AG_GAME_MODE_VALIDATION_SHARE_URL",
            "exactPublicMarkdownBytesImported": True,
            "publicMarkdownBytes": public_markdown_bytes,
        },
        "renderer": {
            "canvasCount": 1,
            "stableDomIdentity": True,
            "webglSupported": True,
            "authoredXrNodesRetained": True,
            "authoredSceneIdentityPreserved": True,
            "authoredStageCoordinatesShared": True,
            **game_scene_delta,
            "panelSceneContinuity": panel_scene_continuity,
        },
        "gameMode": {
            "surface": "xr",
            "phase": "playing",
            "npcRows": 4,
            "actions": ["hold", "alert", "engage", "flee"],
            "webMcpStrict": True,
            "stopStartStatePreserved": True,
            "idleUntilEngaged": True,
            "pendingDecisionsStableUntilEngaged": True,
            "xrSpatialProfileReused": True,
            "groundedCameraFov": grounded_camera_fov,
        },
        "motionControl": {
            "companionRoundTrip": True,
            "missionStoppedAndPreserved": True,
            "xrResumedAndProgressed": True,
        },
        "xr": {
            "pausedDuringGameMode": True,
            "frameRestoredExactly": True,
            "mode": restored_frame["mode"],
            "objective": restored_frame["objective"],
            "bodyCount": len(restored_frame["bodies"]),
            "continuedProgress": int(progressed_frame["stepCount"]) > restored_step_count,
        },
        "network": {
            "allowlistOnly": True,
            "sourceFetchObserved": True,
            "productDocumentFetchCount": product_document_fetch_count,
            "consoleErrors": console_error_count,
            "pageErrors": page_error_count,
            "failedResponses": failed_response_count,
        },
        "screenshots": {
            "active": active_screenshot_name,
            "restored": restored_screenshot_name,
        },
    }
