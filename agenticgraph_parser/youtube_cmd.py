import argparse
import http.cookiejar
import gzip
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, build_opener, HTTPCookieProcessor

from .common import slugify
from .youtube_tools import try_fetch_segments_with_ytdlp_subtitles, try_transcribe_with_whisper


def _unwrap_user_provided_text(text: str) -> str:
    raw = str(text or "").strip()
    if not raw:
        return ""
    s = raw
    for _ in range(6):
        s2 = s.strip()
        if len(s2) >= 2 and s2[0] == "`" and s2[-1] == "`":
            s = s2[1:-1]
            continue
        if len(s2) >= 2 and s2[0] == "(" and s2[-1] == ")":
            s = s2[1:-1]
            continue
        if len(s2) >= 2 and s2[0] == "<" and s2[-1] == ">":
            s = s2[1:-1]
            continue
        if len(s2) >= 2 and s2[0] == "[" and s2[-1] == "]":
            s = s2[1:-1]
            continue
        if len(s2) >= 2 and s2[0] == "{" and s2[-1] == "}":
            s = s2[1:-1]
            continue
        s = s2
        break
    s = s.strip()
    s = s.strip(" \t\r\n`'\".,;:!?")
    if s.startswith("(") and s.endswith(")"):
        s = s[1:-1].strip()
    if s.startswith("<") and s.endswith(">"):
        s = s[1:-1].strip()
    return s.strip()


def _extract_youtube_video_id(url_or_id: str) -> Optional[str]:
    raw = _unwrap_user_provided_text(str(url_or_id or ""))
    if not raw:
        return None
    if len(raw) == 11 and all(c.isalnum() or c in "_-" for c in raw):
        return raw
    
    # Attempt to strip trailing punctuation if length is > 11
    cleaned = raw.rstrip("!.,;:?")
    if len(cleaned) == 11 and all(c.isalnum() or c in "_-" for c in cleaned):
        return cleaned

    try:
        parsed = urlparse(raw)
    except Exception:
        return None
    if not parsed.scheme and not parsed.netloc:
        return None
    host = (parsed.netloc or "").lower()
    path = parsed.path or ""
    query = parse_qs(parsed.query or "")
    if "v" in query and query["v"]:
        candidate = str(query["v"][0] or "").strip()
        if len(candidate) == 11:
            return candidate
    if host.endswith("youtu.be"):
        candidate = path.strip("/").split("/")[0] if path else ""
        if len(candidate) == 11:
            return candidate
    parts = [p for p in path.split("/") if p]
    for idx, part in enumerate(parts):
        if part in {"embed", "shorts"} and idx + 1 < len(parts):
            candidate = parts[idx + 1]
            if len(candidate) == 11:
                return candidate
    for part in parts:
        if len(part) == 11:
            return part
    return None


def _parse_language_codes(raw: str) -> List[str]:
    s = str(raw or "").strip()
    if not s:
        return ["en"]
    out: List[str] = []
    seen: set[str] = set()
    for part in s.split(","):
        code = str(part or "").strip().lower()
        if not code:
            continue
        if code in seen:
            continue
        seen.add(code)
        out.append(code)
    return out or ["en"]


def _build_youtube_source_url(video_id: str, start_s: int) -> str:
    vid = str(video_id or "").strip()
    if not vid:
        return ""
    t = int(start_s or 0)
    if t > 0:
        return f"https://youtu.be/{vid}?t={t}"
    return f"https://youtu.be/{vid}"


def _parse_time_to_seconds(raw: str) -> int:
    s = str(raw or "").strip().lower()
    if not s:
        return 0
    if s.isdigit():
        return int(s)
    m = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", s)
    if not m:
        return 0
    h = int(m.group(1) or 0)
    mm = int(m.group(2) or 0)
    ss = int(m.group(3) or 0)
    return h * 3600 + mm * 60 + ss


def _extract_requested_start_time_s(url_or_id: str) -> int:
    raw = _unwrap_user_provided_text(str(url_or_id or ""))
    if not raw:
        return 0
    try:
        parsed = urlparse(raw)
    except Exception:
        return 0
    query = parse_qs(parsed.query or "")
    cand = ""
    if "t" in query and query["t"]:
        cand = str(query["t"][0] or "")
    elif "start" in query and query["start"]:
        cand = str(query["start"][0] or "")
    if not cand and parsed.fragment:
        frag = parsed.fragment
        if "=" in frag:
            frag_qs = parse_qs(frag)
            if "t" in frag_qs and frag_qs["t"]:
                cand = str(frag_qs["t"][0] or "")
        else:
            cand = frag
    return _parse_time_to_seconds(cand)


def _normalize_segments(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for seg in segments or []:
        if not seg or not isinstance(seg, dict):
            continue
        text = str(seg.get("text", "") or "").strip()
        if not text:
            continue
        start: Optional[float] = None
        duration: Optional[float] = None

        if start is None and "start" in seg:
            try:
                start = float(seg.get("start") or 0.0)
            except Exception:
                start = None
        if start is None and "start_s" in seg:
            try:
                start = float(seg.get("start_s") or 0.0)
            except Exception:
                start = None
        if start is None and "start_ms" in seg:
            try:
                start = float(seg.get("start_ms") or 0.0) / 1000.0
            except Exception:
                start = None

        if duration is None and "duration" in seg:
            try:
                duration = float(seg.get("duration") or 0.0)
            except Exception:
                duration = None
        if duration is None and "duration_s" in seg:
            try:
                duration = float(seg.get("duration_s") or 0.0)
            except Exception:
                duration = None

        if (duration is None or duration <= 0.0) and "end" in seg and start is not None:
            try:
                end = float(seg.get("end") or 0.0)
                duration = max(0.0, end - start)
            except Exception:
                duration = duration
        if (duration is None or duration <= 0.0) and "end_ms" in seg and start is not None:
            try:
                end = float(seg.get("end_ms") or 0.0) / 1000.0
                duration = max(0.0, end - start)
            except Exception:
                duration = duration
        if start is None:
            start = 0.0
        if duration is None:
            duration = 0.0
        out.append({"text": text, "start": float(start), "duration": float(duration)})
    out.sort(key=lambda x: float(x.get("start", 0.0) or 0.0))
    return out


def _compute_timing_metrics(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    segs = _normalize_segments(segments or [])
    if not segs:
        return {"start_s": 0.0, "end_s": 0.0, "duration_s": 0.0, "segment_count": 0}
    start_s = min(float(s.get("start") or 0.0) for s in segs)
    end_s = max(float(s.get("start") or 0.0) + float(s.get("duration") or 0.0) for s in segs)
    return {
        "start_s": float(start_s),
        "end_s": float(end_s),
        "duration_s": float(max(0.0, end_s - start_s)),
        "segment_count": int(len(segs)),
    }


def _collect_segments_from_obj(obj: Any) -> List[Dict[str, Any]]:
    if not obj or not isinstance(obj, dict):
        return []
    if isinstance(obj.get("segments"), list):
        return [s for s in obj.get("segments") if isinstance(s, dict)]
    out: List[Dict[str, Any]] = []
    chunks = obj.get("chunks")
    if isinstance(chunks, list):
        for ch in chunks:
            if not isinstance(ch, dict):
                continue
            segs = ch.get("segments")
            if isinstance(segs, list):
                out.extend([s for s in segs if isinstance(s, dict)])
    return out


def _parse_whisper_json_obj(obj: Any) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    if not obj or not isinstance(obj, dict):
        return [], {}
    meta: Dict[str, Any] = {}
    if isinstance(obj.get("language"), str) and obj.get("language"):
        meta["language"] = str(obj.get("language") or "")
    if isinstance(obj.get("text"), str) and obj.get("text"):
        meta["transcript_text"] = str(obj.get("text") or "")
    segments_raw = obj.get("segments")
    segs: List[Dict[str, Any]] = []
    if isinstance(segments_raw, list):
        for s in segments_raw:
            if not isinstance(s, dict):
                continue
            text = str(s.get("text", "") or "").strip()
            if not text:
                continue
            start = float(s.get("start") or 0.0)
            if "duration" in s:
                duration = float(s.get("duration") or 0.0)
            else:
                duration = max(0.0, float(s.get("end") or 0.0) - start)
            segs.append({"text": text, "start": float(start), "duration": float(duration)})
    return _normalize_segments(segs), meta


def _format_transcript_paragraphs(snippets: List[Dict[str, Any]], *, video_id: Optional[str] = None) -> str:
    if not snippets:
        return ""
    vid = str(video_id or "").strip()
    paragraphs: List[str] = []
    current: List[str] = []
    last_end = 0.0
    gap_threshold_s = 2.0
    max_chars = 700
    current_start_s: Optional[int] = None

    for entry in snippets:
        text = str(entry.get("text", "") or "").strip()
        if not text:
            continue
        start = float(entry.get("start", 0.0) or 0.0)
        duration = float(entry.get("duration", 0.0) or 0.0)
        end = start + duration
        gap = start - last_end
        cur_len = sum(len(t) for t in current)
        if current and (gap > gap_threshold_s or cur_len >= max_chars):
            prefix = ""
            if vid and current_start_s is not None:
                prefix = f"https://youtu.be/{vid}?t={int(current_start_s)}\n"
            paragraphs.append(prefix + " ".join(current).strip())
            current = []
            current_start_s = None
        if current_start_s is None:
            current_start_s = int(max(0.0, start))
        current.append(text)
        last_end = end
    if current:
        prefix = ""
        if vid and current_start_s is not None:
            prefix = f"https://youtu.be/{vid}?t={int(current_start_s)}\n"
        paragraphs.append(prefix + " ".join(current).strip())
    return "\n\n".join([p for p in paragraphs if p])


def _build_markdown(*, title: str, video_id: str, source_url: str, thumbnail_url: str, paragraphs: str) -> str:
    safe_title = str(title or "").strip() or f"YouTube Transcript: {video_id}"
    lines = [f"# {safe_title}", "", f"Video ID: {video_id}", f"Source: [{source_url}]({source_url})", ""]
    if thumbnail_url:
        lines.append(f"![Thumbnail]({thumbnail_url})\n")
    if paragraphs.strip():
        lines.append(paragraphs.strip())
    else:
        lines.append("(No transcript text returned.)")
    return "\n".join(lines).rstrip() + "\n"


def _fetch_oembed(*, watch_url: str) -> Optional[Dict[str, Any]]:
    url = str(watch_url or "").strip()
    if not url:
        return None
    endpoint = f"https://www.youtube.com/oembed?url={quote(url, safe='')}&format=json"
    try:
        req = Request(endpoint, headers={"User-Agent": "knowgrph/1.0"})
        with urlopen(req, timeout=5) as resp:
            data = resp.read()
        if not data:
            return None
        parsed = json.loads(data.decode("utf-8", errors="replace"))
        if parsed and isinstance(parsed, dict):
            return parsed
        return None
    except Exception:
        return None


def _normalize_translation_languages(obj: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not obj:
        return out
    if isinstance(obj, list):
        for item in obj:
            if isinstance(item, dict):
                code = str(item.get("language_code", "") or item.get("languageCode", "") or "").strip()
                lang = str(item.get("language", "") or "").strip()
                if code or lang:
                    out.append({"language_code": code or None, "language": lang or None})
            else:
                code = str(getattr(item, "language_code", "") or getattr(item, "languageCode", "") or "").strip()
                lang = str(getattr(item, "language", "") or "").strip()
                if code or lang:
                    out.append({"language_code": code or None, "language": lang or None})
    return out


_COOKIE_JAR = http.cookiejar.CookieJar()
_OPENER = build_opener(HTTPCookieProcessor(_COOKIE_JAR))
_OPENER.addheaders = [
    ("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
    ("Accept-Language", "en-US,en;q=0.9"),
]

# Add CONSENT cookie
_CONSENT_COOKIE = http.cookiejar.Cookie(
    version=0, name='CONSENT', value='YES+cb.20210328-17-p0.en+FX+417',
    port=None, port_specified=False, domain='.youtube.com', domain_specified=True, domain_initial_dot=True,
    path='/', path_specified=True, secure=True, expires=None, discard=True, comment=None, comment_url=None, rest={'HttpOnly': None}, rfc2109=False
)
_COOKIE_JAR.set_cookie(_CONSENT_COOKIE)

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

_REQUESTS_SESSION = None
if HAS_REQUESTS:
    _REQUESTS_SESSION = requests.Session()
    _REQUESTS_SESSION.headers.update({
        "Accept-Language": "en-US",
    })
    # _REQUESTS_SESSION.cookies.set('CONSENT', 'YES+cb.20210328-17-p0.en+FX+417', domain='.youtube.com')

def _fetch_url(url: str, data: Optional[bytes] = None, headers: Optional[Dict[str, str]] = None) -> bytes:
    if HAS_REQUESTS and _REQUESTS_SESSION:
        try:
            method = "POST" if data else "GET"
            resp = _REQUESTS_SESSION.request(method, url, data=data, headers=headers, timeout=10)
            resp.raise_for_status()
            return resp.content
        except Exception:
            # Fallback to urllib if requests fails? Or just fail?
            # If requests is present but fails, likely network issue, urllib would fail too.
            # But let's try urllib just in case?
            pass

    req = Request(url, data=data, headers=headers or {})
    req.add_header('Accept-Encoding', 'gzip')
    with _OPENER.open(req, timeout=10) as resp:
        content = resp.read()
        if resp.headers.get('Content-Encoding') == 'gzip':
            return gzip.decompress(content)
        return content

# --- Native YouTube Transcript Fetching Logic (No External Deps) ---

def _fetch_html(url: str) -> str:
    try:
        return _fetch_url(url).decode("utf-8", errors="ignore")
    except Exception:
        return ""

def _extract_json_from_html(html: str, variable_name: str) -> Optional[Dict[str, Any]]:
    # Find the start of the variable assignment
    # Common patterns: "var ytInitialPlayerResponse =", "ytInitialPlayerResponse =", "ytInitialPlayerResponse="
    # We'll search for the variable name and look for the first '{' after it.
    
    search_start = 0
    while True:
        idx = html.find(variable_name, search_start)
        if idx == -1:
            return None
        
        # Look for the first opening brace after the variable name
        brace_start = html.find('{', idx + len(variable_name))
        if brace_start == -1:
            return None
        
        # Sanity check: ensure the distance isn't too large (e.g. accidental match of variable name elsewhere)
        # usually it's " = {" (3 chars) or similar. Allow up to 50 chars of whitespace/assignment ops.
        if brace_start - (idx + len(variable_name)) > 50:
            search_start = idx + len(variable_name)
            continue

        # Brace counting parser
        balance = 0
        in_string = False
        escape = False
        
        for i in range(brace_start, len(html)):
            char = html[i]
            
            if escape:
                escape = False
                continue
                
            if char == '\\':
                escape = True
                continue
                
            if char == '"':
                in_string = not in_string
                continue
                
            if not in_string:
                if char == '{':
                    balance += 1
                elif char == '}':
                    balance -= 1
                    if balance == 0:
                        # Found the matching closing brace
                        json_candidate = html[brace_start:i+1]
                        try:
                            return json.loads(json_candidate)
                        except json.JSONDecodeError as e:
                            # If parsing fails, it might be the wrong place, try searching again
                            print(f"DEBUG: JSON decode error: {e}", file=sys.stderr)
                            break 
        
        # If we get here, either parsing failed or we ran out of text
        search_start = idx + len(variable_name)
        continue
    return None

def _extract_captions_json(html: str) -> Optional[Dict[str, Any]]:
    return _extract_json_from_html(html, "ytInitialPlayerResponse")

def _fetch_xml_transcript(url: str) -> List[Dict[str, Any]]:
    try:
        xml_data = _fetch_url(url)
        print(f"DEBUG: XML Data Len: {len(xml_data)}", file=sys.stderr)
    except Exception:
        return []
    
    try:
        root = ET.fromstring(xml_data)
    except Exception as e:
        print(f"DEBUG: XML Parse Error: {e}", file=sys.stderr)
        return []

    segments = []
    # Handle both srv1 (<text>) and srv3 (<p>) formats
    # Also handle nested <body> if present
    body = root.find('body')
    elements = body if body is not None else root

    for child in elements:
        print(f"DEBUG: Tag: {child.tag} Attrib: {child.attrib}", file=sys.stderr)
        if child.tag == 'text':
            start = float(child.attrib.get('start', 0))
            dur = float(child.attrib.get('dur', 0))
            text = (child.text or "").replace('&amp;#39;', "'").replace('&#39;', "'").strip()
            # Basic HTML unescaping
            text = text.replace('&quot;', '"').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
            if text:
                segments.append({
                    'text': text,
                    'start': start,
                    'duration': dur
                })
        elif child.tag == 'p':
            start = float(child.attrib.get('t', 0)) / 1000.0
            dur = float(child.attrib.get('d', 0)) / 1000.0
            
            # Text can be direct or in <s> children
            parts = []
            if child.text:
                parts.append(child.text)
            for s in child.findall('s'):
                if s.text:
                    parts.append(s.text)
                if s.tail:
                    parts.append(s.tail)
            
            text = "".join(parts).replace('&amp;#39;', "'").replace('&#39;', "'").strip()
            text = text.replace('&quot;', '"').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
            
            if text:
                segments.append({
                    'text': text,
                    'start': start,
                    'duration': dur
                })
    return segments

def _fetch_innertube_api_key(html: str) -> Optional[str]:
    m = re.search(r'"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"', html)
    return m.group(1) if m else None

def _fetch_innertube_captions(video_id: str, api_key: str) -> Optional[Dict[str, Any]]:
    url = f"https://www.youtube.com/youtubei/v1/player?key={api_key}"
    payload = {
        "context": {
            "client": {
                "clientName": "ANDROID",
                "clientVersion": "20.10.38",
                "androidSdkVersion": 30,
                "userAgent": "com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip",
                "hl": "en",
                "timeZone": "UTC",
                "utcOffsetMinutes": 0
            }
        },
        "videoId": video_id,
        "playbackContext": {
            "contentPlaybackContext": {
                "html5Preference": "HTML5_PREF_WANTS"
            }
        }
    }
    try:
        resp_bytes = _fetch_url(url, data=json.dumps(payload).encode("utf-8"), headers={
            "Content-Type": "application/json",
            "User-Agent": "com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip",
        })
        data = json.loads(resp_bytes.decode("utf-8"))
        return data.get("captions", {}).get("playerCaptionsTracklistRenderer", {})
    except Exception:
        return None

def _fetch_json_transcript(url: str) -> List[Dict[str, Any]]:
    try:
        data = json.loads(_fetch_url(url).decode("utf-8"))
    except Exception:
        return []

    events = data.get("events", [])
    segments = []
    for event in events:
        start_ms = float(event.get("tStartMs", 0))
        duration_ms = float(event.get("dDurationMs", 0))
        segs = event.get("segs", [])
        text = "".join([s.get("utf8", "") for s in segs]).strip()
        if text:
            segments.append({
                "text": text,
                "start": start_ms / 1000.0,
                "duration": duration_ms / 1000.0
            })
    return segments

def _get_transcript_from_captions(captions: Dict[str, Any], languages: List[str]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    caption_tracks = captions.get("captionTracks", [])
    if not caption_tracks:
        return [], {}

    # Sort/Filter by requested languages
    selected_track = None
    for lang in languages:
        for track in caption_tracks:
            track_lang_code = track.get("languageCode", "").lower()
            if track_lang_code == lang.lower():
                selected_track = track
                break
        if selected_track:
            break
            
    # Fallback: if 'en' requested but not found, try auto-generated English
    if not selected_track and "en" in languages:
         for track in caption_tracks:
            if track.get("languageCode", "").lower().startswith("en"):
                selected_track = track
                break

    # Final Fallback: just take the first one
    if not selected_track:
        selected_track = caption_tracks[0]

    if not selected_track:
        return [], {}

    base_url = selected_track.get("baseUrl")
    if not base_url:
        return [], {}
    
    # Try JSON first (more reliable?)
    snippets = _fetch_json_transcript(base_url + "&fmt=json3")
    if not snippets:
        snippets = _fetch_xml_transcript(base_url)
    
    if not snippets:
        return [], {}
    
    # Construct metadata
    is_generated = "kind" in selected_track and selected_track["kind"] == "asr"
    if not is_generated and selected_track.get("vssId", "").startswith("a."):
        is_generated = True

    meta = {
        "selected_language_code": selected_track.get("languageCode"),
        "selected_language": str(selected_track.get("name", {}).get("simpleText", "")),
        "is_generated": is_generated,
        "is_translatable": True,
        "translation_languages": [],
    }
    return snippets, meta

def _fetch_transcript_snippets(video_id: str, *, languages: List[str]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Native implementation to fetch transcript snippets without youtube-transcript-api.
    """
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    html = _fetch_html(watch_url)
    
    # Method 1: HTML Scraping
    player_response = _extract_captions_json(html)
    if player_response:
        captions = player_response.get("captions", {}).get("playerCaptionsTracklistRenderer", {})
        if captions:
            snippets, meta = _get_transcript_from_captions(captions, languages)
            if snippets:
                return snippets, meta
    
    # Method 2: InnerTube API
    api_key = _fetch_innertube_api_key(html)
    if api_key:
        captions = _fetch_innertube_captions(video_id, api_key)
        if captions:
            snippets, meta = _get_transcript_from_captions(captions, languages)
            if snippets:
                return snippets, meta

    raise Exception("Could not retrieve YouTube video information or transcript.")


def main(argv: Optional[Sequence[str]] = None, *, parser_script_path: Optional[str] = None) -> int:
    parser = argparse.ArgumentParser(description="Extract YouTube transcript to Markdown or JSON")
    parser.add_argument("--url", required=True, help="YouTube video URL or ID")
    parser.add_argument("--lang", default="en", help="Language code priority (default: en)")
    parser.add_argument("--emit", choices=["markdown", "json"], default="markdown")
    args = parser.parse_args(list(argv) if argv is not None else None)

    video_id = _extract_youtube_video_id(args.url)
    if not video_id:
        message = f"Could not extract video ID from '{args.url}'"
        if args.emit == "json":
            print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
            return 0
        print(f"Error: {message}", file=sys.stderr)
        return 1

    # NOTE: youtube-transcript-api import removed.

    try:
        requested_languages = _parse_language_codes(getattr(args, "lang", "") or "en")
        if "en" not in requested_languages:
            requested_languages.append("en")
        requested_language_code = requested_languages[0] if requested_languages else "en"
        languages = requested_languages

        requested_start_s = _extract_requested_start_time_s(args.url)
        source_url = _build_youtube_source_url(video_id, requested_start_s)
        watch_url = f"https://www.youtube.com/watch?v={video_id}"

        tools_timeout_s = 180
        try:
            raw = int(os.environ.get("KG_YOUTUBE_TOOLS_TIMEOUT_S", "") or "0")
            if raw > 0:
                tools_timeout_s = max(10, min(3600, raw))
        except Exception:
            tools_timeout_s = 180
        whisper_model = str(os.environ.get("KG_WHISPER_MODEL", "") or "").strip() or "base"

        segments: List[Dict[str, Any]] = []
        meta: Dict[str, Any] = {}
        
        # Primary method: Native Fetch
        try:
            snippets, meta = _fetch_transcript_snippets(video_id, languages=languages)
            segments = _normalize_segments(snippets)
        except Exception as e:
            print(f"DEBUG: Native fetch failed: {e}", file=sys.stderr)
            # Fallback 1: yt-dlp subtitles
            segs_and_meta = try_fetch_segments_with_ytdlp_subtitles(
                args.url, languages=languages, timeout_s=tools_timeout_s
            )
            if segs_and_meta:
                segments = _normalize_segments(segs_and_meta[0])
                meta = dict(segs_and_meta[1] or {})
            
            # Fallback 2: Whisper
            if not segments:
                whisper_obj = try_transcribe_with_whisper(
                    args.url,
                    language_code=requested_language_code,
                    timeout_s=tools_timeout_s,
                    whisper_model=whisper_model,
                )
                if whisper_obj:
                    w_segments, w_meta = _parse_whisper_json_obj(whisper_obj)
                    segments = _normalize_segments(w_segments)
                    w_lang = (
                        str(w_meta.get("language") or "").strip().lower()
                        if isinstance(w_meta.get("language"), str)
                        else ""
                    )
                    selected = w_lang or requested_language_code
                    meta = {
                        "selected_language_code": selected,
                        "selected_language": selected,
                        "is_generated": True,
                        "is_translatable": False,
                        "translation_languages": [],
                    }
        
        if not segments:
            raise Exception("Transcript unavailable via native fetch, yt-dlp, or whisper fallbacks")

        timing = _compute_timing_metrics(segments)
        oembed = _fetch_oembed(watch_url=watch_url) or {}
        title = str(oembed.get("title") or "").strip() or f"YouTube Transcript: {video_id}"
        thumbnail_url = str(oembed.get("thumbnail_url") or "").strip()
        if not thumbnail_url and video_id:
             thumbnail_url = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"

        paragraphs = _format_transcript_paragraphs(segments, video_id=video_id)
        markdown = _build_markdown(title=title, video_id=video_id, source_url=source_url, thumbnail_url=thumbnail_url, paragraphs=paragraphs)
        display_name = f"youtube-{slugify(video_id)}.md"
        generated_at_ms = int(time.time() * 1000)
        selected_language_code = meta.get("selected_language_code")
        selected_language = meta.get("selected_language")
        is_generated = meta.get("is_generated")
        is_translatable = meta.get("is_translatable")
        translation_languages = meta.get("translation_languages") or []
        if not isinstance(selected_language_code, str) or not selected_language_code.strip():
            selected_language_code = requested_language_code
        if not isinstance(selected_language, str) or not selected_language.strip():
            selected_language = selected_language_code
        if not isinstance(is_generated, bool):
            is_generated = True
        if not isinstance(is_translatable, bool):
            is_translatable = False
        if not isinstance(translation_languages, list):
            translation_languages = []

        if args.emit == "json":
            payload: Dict[str, Any] = {
                "ok": True,
                "type": "rag:YouTubeTranscript",
                "title": title,
                "video_id": video_id,
                "source_url": source_url,
                "thumbnail_url": thumbnail_url,
                "requested_language_code": requested_language_code,
                "requested_language": requested_language_code,
                "requested_languages": requested_languages,
                "requested_start_s": int(requested_start_s),
                "selected_language_code": selected_language_code,
                "selected_language": selected_language,
                "is_generated": is_generated,
                "is_translatable": is_translatable,
                "translation_languages": translation_languages,
                "oembed": oembed,
                "start_s": float(timing.get("start_s") or 0.0),
                "end_s": float(timing.get("end_s") or 0.0),
                "duration_s": float(timing.get("duration_s") or 0.0),
                "segment_count": int(timing.get("segment_count") or 0),
                "generated_at_ms": int(generated_at_ms),
                "segments": segments,
                "markdown": markdown,
                "name": display_name,
            }
            print(json.dumps(payload, ensure_ascii=False))
            return 0

        print(markdown, end="")
        return 0

    except Exception as e:
        message = f"Error processing YouTube video: {e}"
        if args.emit == "json":
            print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
            return 0
        print(message, file=sys.stderr)
        return 1
