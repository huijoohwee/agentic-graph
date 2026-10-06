from __future__ import annotations

from pathlib import Path
import hashlib
import json
import os
import re
from typing import Any, TypedDict
from urllib.parse import parse_qsl, unquote, urlparse


PROOF_LOCAL_BLOCKED_PATH_PREFIXES = (
    "/api",
    "/__",
    "/.well-known",
    "/control-plane",
    "/agentic-os/control-plane",
    "/mcp",
)
PROOF_LOCAL_WORKSPACE_LIST_PATH = "/__agentic_os_fs_list"
GEO_PROVIDER_PROXY_PATH = "/__grabmaps_proxy"
AUTHORING_MIRROR_PATH = "/__agentic_os_fs_reveal"
AUTHORING_MIRROR_MAX_BYTES = 500_000


class AuthoringMirrorRequest(TypedDict):
    workspacePath: str
    text: str
    sha256: str
    bytes: int


class AuthoringMirrorReceipt(TypedDict):
    workspacePath: str
    sha256: str
    status: int
    contentType: str
    result: Any


def _unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate authoring mirror field")
        result[key] = value
    return result


def _is_managed_inventory(text: str, workspace_path: str) -> bool:
    """Validate the existing portable v2 index wire format, not a new writer."""
    match = re.fullmatch(r"<!-- workspace-import-index:v2 checksum=([a-f0-9]{8}) -->\n(.+)<!-- /workspace-import-index -->\n", text, re.S)
    if not match:
        return False
    checksum, body = match.groups()
    encoded = body.encode("utf-16-le")
    digest = 0x811C9DC5
    for index in range(0, len(encoded), 2):
        digest = ((digest ^ int.from_bytes(encoded[index:index + 2], "little")) * 0x01000193) & 0xFFFFFFFF
    if f"{digest:08x}" != checksum:
        return False
    lines = body.splitlines()
    if len(lines) < 8 or lines[0] != "# Import index" or any(lines[index] for index in (1, 3, 5)):
        return False
    summary = re.fullmatch(r"(\d+) known sources · (\d+) imported · (\d+) not fully imported", lines[2])
    columns = ["Source", "Status", "Saved documents", "Detail", "Input digest", "Output digest", "Checked at (ms)", "Check result", "ETag", "Last modified"]
    if (not summary or not lines[4].startswith("All known discoveries and selected inputs are retained here.")
        or len(lines[4]) > 384 or [part.strip() for part in re.split(r"(?<!\\)\|", lines[6])[1:-1]] != columns
        or [part.strip() for part in re.split(r"(?<!\\)\|", lines[7])[1:-1]] != ["---"] * 10):
        return False
    statuses = {}
    for line in lines[8:]:
        cells = [part.strip() for part in re.split(r"(?<!\\)\|", line)]
        if len(cells) != 12 or cells[0] or cells[-1]:
            return False
        row = cells[1:-1]
        link = re.fullmatch(r"\[.+\]\(<(https?://[^<>\s]+)>\)", row[0])
        if not link or row[1] not in {"imported", "not imported", "pending", "missing"}:
            return False
        source = urlparse(link.group(1))
        host = re.sub(r"[^a-zA-Z0-9._-]", "-", source.netloc)
        host = re.sub(r"-+", "-", host).strip("-.")[:64]
        if (source.username or source.password or source.fragment
            or not source.netloc or workspace_path != f"/websites/{host}/_import-index.md"
            or (link.group(1) in statuses and statuses[link.group(1)] != row[1])
            or any(value and not re.fullmatch(r"[a-f0-9]{64}", value) for value in row[4:6])
            or (row[6] and not re.fullmatch(r"\d+(?:\.\d+)?", row[6]))
            or row[7] not in {"", "imported", "unchanged"}
            or len(row[3]) > 24_576
            or (row[2] and not re.fullmatch(r"\[.+\]\(</[^<>\s]+>\)", row[2]))):
            return False
        statuses[link.group(1)] = row[1]
    known, imported, incomplete = map(int, summary.groups())
    return known == len(statuses) and imported == sum(status == "imported" for status in statuses.values()) and known == imported + incomplete


def read_proof_authoring_mirror_request(
    request: Any,
    local_origin: str,
    expected_output_root: Path,
    *,
    bootstrap_open: bool,
    owned_store_root: Path | None = None,
    repository_root: Path | None = None,
    diagnostics: dict[str, Any] | None = None,
) -> AuthoringMirrorRequest | None:
    """Only the native bootstrap inventory mirror may write in this proof."""
    def reject(reason: str) -> None:
        if diagnostics is not None:
            diagnostics["reason"] = reason
        return None

    try:
        parsed = urlparse(str(request.url))
    except ValueError:
        return None
    if parsed.netloc != local_origin or parsed.path != AUTHORING_MIRROR_PATH:
        return None
    if not bootstrap_open or str(request.method) != "POST":
        return reject("bootstrap-method-contract")
    try:
        headers = {str(key).lower(): str(value) for key, value in request.all_headers().items()}
    except Exception:
        return reject("transport-headers")
    owned_store_valid = False
    if (owned_store_root is not None and repository_root is not None
        and os.environ.get("AGENTIC_OS_WORKSPACE_STORE_ROOT") == str(owned_store_root)):
        try:
            assert_authoring_mirror_fixture(owned_store_root, repository_root)
            owned_store_valid = True
        except AssertionError:
            pass
    try:
        frame = request.frame
        frame_url = urlparse(str(frame.url))
        main_frame_matches = (frame.parent_frame is None and frame_url.scheme == parsed.scheme
                              and frame_url.netloc == local_origin and frame_url.path in {"/", "/index.html"}
                              and not frame_url.params and not frame_url.fragment
                              and parse_qsl(frame_url.query, keep_blank_values=True) == [("kgFlightSimBrowserProof", "1")])
    except Exception:
        main_frame_matches = False
    fetch_site = headers.get("sec-fetch-site")
    fetch_site_allowed = fetch_site == "same-origin" or (fetch_site is None and main_frame_matches and owned_store_valid)
    raw = request.post_data
    if diagnostics is not None:
        diagnostics.update(bootstrapOpen=bootstrap_open, isPost=str(request.method) == "POST",
                           jsonContentType=headers.get("content-type", "").split(";")[0].strip().lower() == "application/json",
                           originMatches=headers.get("origin") == f"{parsed.scheme}://{local_origin}",
                           fetchSitePresent=fetch_site is not None, fetchSiteAllowed=fetch_site_allowed,
                           mainFrameMatches=main_frame_matches, ownedStoreValid=owned_store_valid)
    if (
        not bootstrap_open or str(request.method) != "POST"
        or parsed.scheme not in {"http", "https"}
        or parsed.netloc != local_origin or parsed.path != AUTHORING_MIRROR_PATH
        or parsed.params or parsed.query or parsed.fragment
        or getattr(request, "service_worker", None) is not None
        or headers.get("content-type", "").split(";")[0].strip().lower() != "application/json"
        or headers.get("origin") != f"{parsed.scheme}://{local_origin}"
        or not fetch_site_allowed
        or not isinstance(raw, str)
    ):
        return reject("transport-contract")
    try:
        raw_bytes = len(raw.encode("utf-8"))
        if diagnostics is not None:
            diagnostics["requestBytes"] = raw_bytes
        if raw_bytes > AUTHORING_MIRROR_MAX_BYTES:
            return reject("request-size")
        body = json.loads(raw, object_pairs_hook=_unique_json_object)
    except (TypeError, ValueError, UnicodeError):
        return reject("request-json")
    if diagnostics is not None and isinstance(body, dict):
        diagnostics.update(knownBodyFields=sorted(set(body) & {"saveOnly", "kind", "outputRoot", "snapshot"}),
                           unknownBodyFieldCount=len(set(body) - {"saveOnly", "kind", "outputRoot", "snapshot"}),
                           outputRootPresent="outputRoot" in body,
                           explicitOutputRootMatches=body.get("outputRoot") == str(expected_output_root))
    if (not isinstance(body, dict)
        or set(body) not in ({"saveOnly", "kind", "outputRoot", "snapshot"}, {"saveOnly", "kind", "snapshot"})
        or body["saveOnly"] is not True or body["kind"] != "file"
        or ("outputRoot" in body and body["outputRoot"] != str(expected_output_root))):
        return reject("body-contract")
    if "outputRoot" not in body:
        if not owned_store_valid:
            return reject("owned-store-contract")
    snapshot = body["snapshot"]
    if not isinstance(snapshot, dict) or set(snapshot) != {"workspacePath", "text"}:
        return reject("snapshot-contract")
    workspace_path, text = snapshot["workspacePath"], snapshot["text"]
    if (not isinstance(workspace_path, str)
        or not re.fullmatch(r"/websites/[A-Za-z0-9_][A-Za-z0-9._-]{0,63}/_import-index\.md", workspace_path)
        or workspace_path.split("/")[2].endswith((".", "-"))
        or re.match(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", workspace_path.split("/")[2], re.I)
        or not isinstance(text, str)):
        return reject("workspace-path-contract")
    try:
        data = text.encode("utf-8")
        if diagnostics is not None:
            diagnostics["textBytes"] = len(data)
        if not _is_managed_inventory(text, workspace_path):
            return reject("managed-inventory-contract")
    except (UnicodeError, ValueError):
        return reject("managed-inventory-contract")
    return {"workspacePath": workspace_path, "text": text,
            "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


def assert_authoring_mirror_fixture(store_root: Path, repository_root: Path) -> None:
    """The existing launcher owns one fresh sibling store and removes it."""
    if (not store_root.is_absolute() or not store_root.is_dir()
        or store_root.is_symlink() or store_root.parent != repository_root.parent
        or not store_root.name.startswith(".browser-smoke-store-")):
        raise AssertionError("native website mirror requires the owned isolated browser store")


def assert_authoring_mirror_ownership(
    *,
    requests: list[AuthoringMirrorRequest],
    receipts: list[AuthoringMirrorReceipt],
    store_root: Path,
    repository_root: Path,
    native_workspace_texts: dict[str, Any],
) -> dict[str, Any]:
    assert_authoring_mirror_fixture(store_root, repository_root)
    if not requests:
        raise AssertionError("native authoring fixture produced no website mirror receipt")
    expected = [(item["workspacePath"], item["sha256"]) for item in requests]
    received = [(item["workspacePath"], item["sha256"]) for item in receipts]
    if sorted(expected) != sorted(received):
        raise AssertionError("native website mirror requires one HTTP receipt per admitted request")
    for receipt in receipts:
        target = store_root / receipt["workspacePath"].lstrip("/")
        result = receipt["result"]
        if (receipt["status"] != 200
            or receipt["contentType"].split(";")[0].strip().lower() != "application/json"
            or not isinstance(result, dict) or set(result) != {"ok", "path", "message"}
            or result["ok"] is not True or result["path"] != str(target)
            or result["message"] != "Saved website document"):
            raise AssertionError("native website mirror has an invalid HTTP save receipt")
    latest = {item["workspacePath"]: item for item in requests}
    files = []
    for workspace_path, item in latest.items():
        if native_workspace_texts.get(workspace_path) != item["text"]:
            raise AssertionError("native website mirror differs from its WorkspaceFs source bytes")
        target = store_root / workspace_path.lstrip("/")
        try:
            resolved = target.resolve(strict=True)
        except OSError as error:
            raise AssertionError("native website mirror physical receipt is missing") from error
        if (resolved != target or not resolved.is_relative_to(store_root)
            or not resolved.is_file() or resolved.read_bytes() != item["text"].encode("utf-8")):
            raise AssertionError("native website mirror physical receipt differs from admitted bytes")
        files.append({"workspacePath": workspace_path, "path": str(resolved),
                      "sha256": item["sha256"], "bytes": item["bytes"], "workspaceByteIdentical": True})
    return {"owner": "native website inventory authoring", "phase": "bootstrap",
            "storeRoot": str(store_root), "requestCount": len(requests),
            "receiptCount": len(receipts), "files": files,
            "gameplayWritesAllowed": False, "fileManagerAllowed": False}
PROOF_LOCAL_STATIC_EXACT_PATHS = {
    "/",
    "/index.html",
    "/evidence-analysis/fixtures/scene-wsss-v1.json",
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
