from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, unquote, urlparse


PROOF_LOCAL_BLOCKED_PATH_PREFIXES = (
    "/api",
    "/__",
    "/.well-known",
    "/control-plane",
    "/agentic-os/control-plane",
    "/mcp",
)
PROOF_LOCAL_WORKSPACE_LIST_PATH = "/__kg_fs_list"
GEO_PROVIDER_PROXY_PATH = "/__grabmaps_proxy"
PROOF_LOCAL_STATIC_EXACT_PATHS = {
    "/",
    "/index.html",
}
PROOF_LOCAL_STATIC_PATH_PREFIXES = (
    "/assets/",
    "/fonts/",
    "/icons/",
    "/images/",
    "/models/",
    "/public/",
    "/textures/",
)
PROOF_LOCAL_STATIC_SUFFIXES = (
    ".avif",
    ".bin",
    ".css",
    ".gif",
    ".glb",
    ".gltf",
    ".ico",
    ".jpeg",
    ".jpg",
    ".js",
    ".json",
    ".map",
    ".mjs",
    ".mp3",
    ".mp4",
    ".ogg",
    ".png",
    ".svg",
    ".wasm",
    ".webm",
    ".webmanifest",
    ".webp",
    ".woff",
    ".woff2",
)
GEO_PROVIDER_READ_PATHS = {
    "maps.grab.com": {
        "exact": {"/api/style.json"},
        "prefixes": ("/api/maps/tiles/v2/",),
    },
    "demotiles.maplibre.org": {
        "exact": {"/style.json", "/globe.json"},
        "prefixes": ("/font/", "/fonts/", "/terrain/", "/tiles/"),
    },
    "tiles.openfreemap.org": {
        "exact": {"/planet", "/styles/liberty"},
        "prefixes": (
            "/fonts/",
            "/natural_earth/",
            "/planet/",
            "/sprites/",
            "/styles/liberty/",
        ),
    },
}


def request_is_proof_local_read(request: Any, local_origin: str) -> bool:
    parsed = urlparse(str(request.url))
    method = str(request.method).upper()
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.netloc != local_origin
    ):
        return False
    if (
        method == "POST"
        and parsed.path == PROOF_LOCAL_WORKSPACE_LIST_PATH
    ):
        return True
    if method not in {"GET", "HEAD"}:
        return False
    if (
        "%" in parsed.path
        or "\\" in parsed.path
        or any(segment in {".", ".."} for segment in parsed.path.split("/"))
    ):
        return False
    normalized_path = parsed.path.lower()
    blocked = any(
        (
            normalized_path.startswith(prefix)
            if prefix == "/__"
            else (
                normalized_path == prefix
                or normalized_path.startswith(f"{prefix}/")
            )
        )
        for prefix in PROOF_LOCAL_BLOCKED_PATH_PREFIXES
    )
    if blocked:
        return False
    if parsed.path in PROOF_LOCAL_STATIC_EXACT_PATHS:
        return True
    if parsed.path.startswith(PROOF_LOCAL_STATIC_PATH_PREFIXES):
        return True
    root_asset = (
        parsed.path.startswith("/")
        and parsed.path.count("/") == 1
        and parsed.path.lower().endswith(PROOF_LOCAL_STATIC_SUFFIXES)
    )
    return root_asset


def _fully_decode_provider_path(raw_path: str) -> str | None:
    decoded = raw_path
    for _ in range(8):
        for index, character in enumerate(decoded):
            if character != "%":
                continue
            escape = decoded[index + 1:index + 3]
            if (
                len(escape) != 2
                or any(value not in "0123456789abcdefABCDEF" for value in escape)
            ):
                return None
        try:
            next_decoded = unquote(decoded, errors="strict")
        except UnicodeDecodeError:
            return None
        if next_decoded == decoded:
            return decoded
        decoded = next_decoded
    return None


def _url_is_geo_provider_read(raw_url: str, method: str) -> bool:
    try:
        parsed = urlparse(raw_url)
        port = parsed.port
    except ValueError:
        return False
    decoded_path = _fully_decode_provider_path(parsed.path)
    if decoded_path is None:
        return False
    paths = GEO_PROVIDER_READ_PATHS.get(str(parsed.hostname or ""))
    if paths is None:
        return False
    return (
        parsed.scheme == "https"
        and method in {"GET", "HEAD"}
        and parsed.username is None
        and parsed.password is None
        and port in {None, 443}
        and not parsed.params
        and not parsed.fragment
        and "\\" not in decoded_path
        and all(
            segment not in {".", ".."}
            for segment in decoded_path.split("/")
        )
        and (
            decoded_path in paths["exact"]
            or decoded_path.startswith(paths["prefixes"])
        )
    )


def request_is_geo_provider_read(
    request: Any,
    local_origin: str | None = None,
) -> bool:
    method = str(request.method).upper()
    raw_url = str(request.url)
    if _url_is_geo_provider_read(raw_url, method):
        return True
    if not local_origin or method not in {"GET", "HEAD"}:
        return False
    parsed = urlparse(raw_url)
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.netloc != local_origin
        or parsed.path != GEO_PROVIDER_PROXY_PATH
        or parsed.params
        or parsed.fragment
    ):
        return False
    try:
        query = parse_qsl(
            parsed.query,
            keep_blank_values=True,
            strict_parsing=True,
        )
    except ValueError:
        return False
    if len(query) != 1 or query[0][0] != "url" or not query[0][1]:
        return False
    return _url_is_geo_provider_read(query[0][1], method)


def summarize_websocket_attempts(
    expected_probe_url: str,
    websocket_events: list[str],
    websocket_route_hits: list[str],
) -> dict[str, list[str]]:
    return {
        "probeEvents": [
            url for url in websocket_events if url == expected_probe_url
        ],
        "probeRouteHits": [
            url for url in websocket_route_hits if url == expected_probe_url
        ],
        "unexpectedEvents": [
            url for url in websocket_events if url != expected_probe_url
        ],
        "unexpectedRouteHits": [
            url for url in websocket_route_hits if url != expected_probe_url
        ],
    }


def assert_transport_ownership(
    *,
    geo_provider_requests: list[str],
    unexpected_non_local_requests: list[str],
    blocked_requests: list[dict[str, str]],
    websocket_events: list[str],
    websocket_route_hits: list[str],
) -> None:
    failures: list[str] = []
    if not geo_provider_requests:
        failures.append(
            "native MapLibre did not request its existing Geo provider"
        )
    if unexpected_non_local_requests:
        failures.append(
            "unexpected non-local requests="
            f"{unexpected_non_local_requests}"
        )
    if blocked_requests:
        failures.append(f"blocked requests={blocked_requests}")
    if websocket_events or websocket_route_hits:
        failures.append(
            f"webSocketEvents={websocket_events}, "
            f"webSocketRouteHits={websocket_route_hits}"
        )
    if failures:
        raise AssertionError(
            "Flight/Geo transport ownership failed: " + "; ".join(failures)
        )


def assert_workspace_seed_list_authority(
    *,
    requests: list[dict[str, Any]],
    expected_seed_root: Path,
) -> None:
    invalid_requests = [
        request
        for request in requests
        if (
            request["method"] != "POST"
            or not request["path"]
            or Path(request["path"]).resolve() != expected_seed_root.resolve()
        )
    ]
    if invalid_requests:
        raise AssertionError(
            "Flight bootstrap scanned an unrelated docs mirror: "
            f"requests={requests}, invalid={invalid_requests}"
        )
