from __future__ import annotations

from urllib.error import HTTPError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen


MAX_SOURCE_BYTES = 2_000_000
Origin = tuple[str, str, int]


def normalized_origin(value: str) -> Origin:
    parsed = urlparse(value)
    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").lower()
    default_port = 443 if scheme == "https" else 80
    return scheme, hostname, parsed.port or default_port


def origin_label(origin: Origin) -> str:
    return f"{origin[0]}://{origin[1]}:{origin[2]}"


def parse_validation_source(validation_share_url: str) -> tuple[str, str, Origin]:
    if not validation_share_url:
        raise AssertionError("AG_GAME_MODE_VALIDATION_SHARE_URL is required")
    parsed = urlparse(validation_share_url)
    path_parts = [part for part in parsed.path.split("/") if part]
    token = unquote(path_parts[-1]).strip() if path_parts else ""
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or not token:
        raise AssertionError(
            "validation share input must be an absolute HTTP(S) URL with an opaque path token"
        )
    if parsed.username or parsed.password:
        raise AssertionError("validation share input must not contain user credentials")
    return validation_share_url, token, normalized_origin(validation_share_url)


def fetch_validation_markdown(share_url: str, allowed_origin: Origin) -> bytes:
    request = Request(
        share_url,
        headers={
            "Accept": "text/markdown",
            "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/138 Safari/537.36",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            if normalized_origin(response.geturl()) != allowed_origin:
                raise AssertionError("validation source redirected outside its supplied origin")
            if response.status != 200:
                raise AssertionError(f"validation source returned HTTP {response.status}")
            content_type = str(response.headers.get("content-type") or "").lower()
            if "markdown" not in content_type and "text/plain" not in content_type:
                raise AssertionError("validation source did not return Markdown")
            body = response.read(MAX_SOURCE_BYTES + 1)
            if len(body) > MAX_SOURCE_BYTES:
                raise AssertionError("validation source exceeded the browser-smoke size limit")
            body.decode("utf-8")
            return body
    except AssertionError:
        raise
    except HTTPError as error:
        raise AssertionError(f"validation source returned HTTP {error.code}") from None
    except Exception as error:
        raise AssertionError(
            f"validation source could not be fetched ({type(error).__name__})"
        ) from None
