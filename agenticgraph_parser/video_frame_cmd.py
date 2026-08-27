import argparse
import json
import os
import subprocess
import sys
import tempfile
from shutil import which
from typing import Any, Dict, List, Optional, Sequence, Tuple


def _json_error(message: str) -> int:
    print(json.dumps({"ok": False, "error": str(message or "Video frame extraction failed")}, ensure_ascii=False))
    return 0


def _normalize_time_seconds(value: Any) -> int:
    raw = float(str(value if value is not None else "").strip())
    if raw < 0:
        return 0
    return int(raw)


def _normalize_format(value: Any) -> str:
    raw = str(value or "").strip().lower()
    return "jpg" if raw in {"jpg", "jpeg"} else "png"


def _run_cmd(args: List[str], *, cwd: Optional[str], timeout_s: int) -> Tuple[int, str, str]:
    res = subprocess.run(
        args,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=max(1, int(timeout_s or 1)),
    )
    return int(res.returncode or 0), str(res.stdout or ""), str(res.stderr or "")


def _yt_dlp_cmd() -> List[str]:
    exe = which("yt-dlp")
    if exe:
        return [exe]
    return [sys.executable, "-m", "yt_dlp"]


def _yt_dlp_extractor_args_raw() -> str:
    return str(os.environ.get("KG_VIDEO_FRAME_YTDLP_EXTRACTOR_ARGS") or "youtube:player_client=android").strip()


def _yt_dlp_cli_common_args() -> List[str]:
    out: List[str] = []
    extractor_args = _yt_dlp_extractor_args_raw()
    if extractor_args:
        out.extend(["--extractor-args", extractor_args])
    cookies = str(os.environ.get("KG_VIDEO_FRAME_YTDLP_COOKIES") or "").strip()
    if cookies:
        out.extend(["--cookies", cookies])
    cookies_from_browser = str(os.environ.get("KG_VIDEO_FRAME_YTDLP_COOKIES_FROM_BROWSER") or "").strip()
    if cookies_from_browser:
        out.extend(["--cookies-from-browser", cookies_from_browser])
    return out


def _yt_dlp_extractor_args_api() -> Dict[str, Dict[str, List[str]]]:
    raw = _yt_dlp_extractor_args_raw()
    out: Dict[str, Dict[str, List[str]]] = {}
    if raw.startswith("youtube:"):
        values: Dict[str, List[str]] = {}
        body = raw.split(":", 1)[1]
        for chunk in body.split(";"):
            if "=" not in chunk:
                continue
            key, value = chunk.split("=", 1)
            key = key.strip()
            parts = [part.strip() for part in value.split(",") if part.strip()]
            if key and parts:
                values[key] = parts
        if values:
            out["youtube"] = values
    return out


def _apply_yt_dlp_auth_api_opts(opts: Dict[str, Any]) -> Dict[str, Any]:
    cookies = str(os.environ.get("KG_VIDEO_FRAME_YTDLP_COOKIES") or "").strip()
    if cookies:
        opts["cookiefile"] = cookies
    cookies_from_browser = str(os.environ.get("KG_VIDEO_FRAME_YTDLP_COOKIES_FROM_BROWSER") or "").strip()
    if cookies_from_browser:
        opts["cookiesfrombrowser"] = tuple(part.strip() for part in cookies_from_browser.split(":") if part.strip())
    extractor_args = _yt_dlp_extractor_args_api()
    if extractor_args:
        opts["extractor_args"] = extractor_args
    return opts


def _ffmpeg_cmd() -> str:
    exe = which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg  # type: ignore

        bundled = imageio_ffmpeg.get_ffmpeg_exe()
        if bundled and os.path.exists(bundled):
            return bundled
    except Exception:
        pass
    raise RuntimeError("ffmpeg is not installed or not on PATH; install ffmpeg or the imageio-ffmpeg Python package")


def _pick_stream_url_with_cli(url: str, *, timeout_s: int) -> str:
    if not str(url or "").strip():
        raise RuntimeError("missing video url")
    cmd = [
        *_yt_dlp_cmd(),
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        *_yt_dlp_cli_common_args(),
        "-f",
        "bv*[height<=720][ext=mp4]/bv*[height<=720]/bestvideo[height<=720]/best[height<=720]/best",
        "--get-url",
        str(url),
    ]
    code, stdout, stderr = _run_cmd(cmd, cwd=None, timeout_s=timeout_s)
    if code != 0:
        detail = (stderr or stdout or "").strip()
        raise RuntimeError(detail or f"yt-dlp failed with exit code {code}")
    stream_url = ""
    for line in stdout.splitlines():
        candidate = line.strip()
        if candidate.startswith(("http://", "https://")):
            stream_url = candidate
            break
    if not stream_url:
        raise RuntimeError("yt-dlp returned no direct video stream URL")
    return stream_url


def _pick_stream(url: str, *, timeout_s: int) -> Tuple[str, Dict[str, str]]:
    if not str(url or "").strip():
        raise RuntimeError("missing video url")
    try:
        import yt_dlp  # type: ignore

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "noplaylist": True,
            "format": "bv*[height<=720][ext=mp4]/bv*[height<=720]/bestvideo[height<=720]/best[height<=720]/best",
            "socket_timeout": max(5, int(timeout_s or 15)),
            "retries": 1,
            "extractor_retries": 1,
        }
        _apply_yt_dlp_auth_api_opts(ydl_opts)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(str(url), download=False)
        candidates: List[Dict[str, Any]] = []
        if isinstance(info, dict):
            candidates.append(info)
            for key in ("requested_downloads", "requested_formats", "formats"):
                value = info.get(key)
                if isinstance(value, list):
                    candidates.extend(item for item in value if isinstance(item, dict))
        base_headers = info.get("http_headers") if isinstance(info, dict) and isinstance(info.get("http_headers"), dict) else {}
        for candidate in candidates:
            stream_url = str(candidate.get("url") or "").strip()
            if not stream_url.startswith(("http://", "https://")):
                continue
            candidate_headers = candidate.get("http_headers") if isinstance(candidate.get("http_headers"), dict) else {}
            headers = {
                str(k): str(v)
                for k, v in {**base_headers, **candidate_headers}.items()
                if str(k).strip() and str(v).strip()
            }
            return stream_url, headers
    except Exception as exc:
        cli_url = _pick_stream_url_with_cli(url, timeout_s=timeout_s)
        return cli_url, {"User-Agent": "Mozilla/5.0", "X-Knowgrph-YtDlpFallback": str(exc)[:240]}
    raise RuntimeError("yt-dlp returned no direct video stream URL")


def _ffmpeg_headers_args(headers: Dict[str, str]) -> List[str]:
    safe_headers = {
        str(k).strip(): str(v).replace("\r", " ").replace("\n", " ").strip()
        for k, v in (headers or {}).items()
        if str(k).strip() and str(v).strip()
    }
    out: List[str] = []
    user_agent = safe_headers.get("User-Agent") or safe_headers.get("user-agent") or ""
    if user_agent:
        out.extend(["-user_agent", user_agent])
    referer = safe_headers.get("Referer") or safe_headers.get("referer") or ""
    if referer:
        out.extend(["-referer", referer])
    header_lines = [
        f"{name}: {value}"
        for name, value in safe_headers.items()
        if name.lower() not in {"user-agent", "referer"}
    ]
    if header_lines:
        out.extend(["-headers", "\r\n".join(header_lines) + "\r\n"])
    return out


def _download_video_for_frame(url: str, *, output_dir: str, timeout_s: int) -> str:
    max_mib = 96
    try:
        max_mib = max(8, min(512, int(os.environ.get("KG_VIDEO_FRAME_DOWNLOAD_MAX_MIB", "96") or "96")))
    except Exception:
        max_mib = 96
    output_template = os.path.join(output_dir, "source.%(ext)s")
    cmd = [
        *_yt_dlp_cmd(),
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        *_yt_dlp_cli_common_args(),
        "-f",
        "bv*[height<=480][ext=mp4]/bv*[height<=480]/best[height<=480]/worst",
        "--max-filesize",
        f"{max_mib}M",
        "-o",
        output_template,
        str(url),
    ]
    code, stdout, stderr = _run_cmd(cmd, cwd=None, timeout_s=timeout_s)
    if code != 0:
        detail = (stderr or stdout or "").strip()
        raise RuntimeError(detail or f"yt-dlp temporary download failed with exit code {code}")
    candidates = [
        os.path.join(output_dir, name)
        for name in os.listdir(output_dir)
        if name.startswith("source.") and os.path.isfile(os.path.join(output_dir, name))
    ]
    candidates.sort(key=lambda item: os.path.getsize(item), reverse=True)
    for candidate in candidates:
        if os.path.getsize(candidate) > 0:
            return candidate
    raise RuntimeError("yt-dlp temporary download produced no video file")


def _run_ffmpeg_frame_extract(
    *,
    ffmpeg: str,
    input_url: str,
    headers: Dict[str, str],
    pre_seek_s: int,
    accurate_offset_s: int,
    output_path: str,
    timeout_s: int,
    cwd: str,
) -> Tuple[int, str, str]:
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
    ]
    if pre_seek_s > 0:
        cmd.extend(["-ss", f"{pre_seek_s:.3f}"])
    cmd.extend(_ffmpeg_headers_args(headers))
    cmd.extend(["-i", input_url])
    if accurate_offset_s > 0:
        cmd.extend(["-ss", f"{accurate_offset_s:.3f}"])
    cmd.extend(["-frames:v", "1", "-an", output_path])
    return _run_cmd(cmd, cwd=cwd, timeout_s=timeout_s)


def _extract_frame(args: argparse.Namespace) -> Dict[str, Any]:
    url = str(args.url or "").strip()
    output_path = os.path.abspath(str(args.output or "").strip())
    if not url:
        raise RuntimeError("missing url")
    if not output_path:
        raise RuntimeError("missing output path")

    time_s = _normalize_time_seconds(args.time)
    fmt = _normalize_format(args.format)
    timeout_s = max(5, min(3600, int(args.timeout_s or 60)))

    if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
        return {
            "ok": True,
            "cached": True,
            "path": output_path,
            "time_s": time_s,
            "format": fmt,
            "bytes": int(os.path.getsize(output_path)),
        }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    stream_timeout_s = max(5, min(timeout_s, max(10, timeout_s // 2)))
    stream_url, stream_headers = _pick_stream(url, timeout_s=stream_timeout_s)
    ffmpeg = _ffmpeg_cmd()

    pre_seek_s = max(0, time_s - 2)
    accurate_offset_s = max(0, time_s - pre_seek_s)

    with tempfile.TemporaryDirectory(prefix="kg-video-frame-") as tmp:
        tmp_out = os.path.join(tmp, f"frame.{fmt}")
        code, stdout, stderr = _run_ffmpeg_frame_extract(
            ffmpeg=ffmpeg,
            input_url=stream_url,
            headers=stream_headers,
            pre_seek_s=pre_seek_s,
            accurate_offset_s=accurate_offset_s,
            output_path=tmp_out,
            timeout_s=timeout_s,
            cwd=tmp,
        )
        if code != 0 and stream_url.startswith(("http://", "https://")):
            local_video = _download_video_for_frame(url, output_dir=tmp, timeout_s=timeout_s)
            code, stdout, stderr = _run_ffmpeg_frame_extract(
                ffmpeg=ffmpeg,
                input_url=local_video,
                headers={},
                pre_seek_s=pre_seek_s,
                accurate_offset_s=accurate_offset_s,
                output_path=tmp_out,
                timeout_s=timeout_s,
                cwd=tmp,
            )
        if code != 0:
            detail = (stderr or stdout or "").strip()
            raise RuntimeError(detail or f"ffmpeg failed with exit code {code}")
        if not os.path.exists(tmp_out) or os.path.getsize(tmp_out) <= 0:
            raise RuntimeError("ffmpeg did not produce a frame image")
        os.replace(tmp_out, output_path)

    return {
        "ok": True,
        "cached": False,
        "path": output_path,
        "time_s": time_s,
        "format": fmt,
        "bytes": int(os.path.getsize(output_path)),
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Extract a single timestamped video frame with yt-dlp and FFmpeg")
    parser.add_argument("--url", required=True, help="Remote video URL")
    parser.add_argument("--time", required=True, help="Timestamp in seconds")
    parser.add_argument("--output", required=True, help="Output PNG/JPEG path")
    parser.add_argument("--format", choices=["png", "jpg", "jpeg"], default="png")
    parser.add_argument("--timeout-s", type=int, default=int(os.environ.get("KG_VIDEO_FRAME_TIMEOUT_S", "60") or "60"))
    parser.add_argument("--emit", choices=["json"], default="json")
    args = parser.parse_args(list(argv) if argv is not None else None)

    try:
        payload = _extract_frame(args)
        print(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as exc:
        return _json_error(str(exc))


if __name__ == "__main__":
    raise SystemExit(main())
