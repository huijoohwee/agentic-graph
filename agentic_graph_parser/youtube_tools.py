import json
import os
import re
import subprocess
import tempfile
from shutil import which
from typing import Any, Dict, List, Optional, Tuple


_TS_RE = re.compile(r"^(?:(\d+):)?(\d{1,2}):(\d{2})\.(\d{3})$")
_TAG_RE = re.compile(r"<[^>]+>")


def _parse_ts_to_seconds(raw: str) -> float:
    s = str(raw or "").strip()
    m = _TS_RE.match(s)
    if not m:
        return 0.0
    h = int(m.group(1) or 0)
    mm = int(m.group(2) or 0)
    ss = int(m.group(3) or 0)
    ms = int(m.group(4) or 0)
    return float(h * 3600 + mm * 60 + ss) + float(ms) / 1000.0


def _strip_vtt_tags(text: str) -> str:
    s = str(text or "").strip()
    if not s:
        return ""
    s = _TAG_RE.sub("", s)
    s = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return " ".join(s.split()).strip()


def parse_vtt_segments(vtt_text: str) -> List[Dict[str, Any]]:
    lines = [str(l or "").rstrip("\n") for l in str(vtt_text or "").splitlines()]
    out: List[Dict[str, Any]] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line or line.upper() == "WEBVTT":
            i += 1
            continue
        if "-->" not in line:
            i += 1
            continue
        parts = [p.strip() for p in line.split("-->", 1)]
        start_s = _parse_ts_to_seconds(parts[0])
        end_token = (parts[1].split() or [""])[0]
        end_s = _parse_ts_to_seconds(end_token)
        i += 1
        texts: List[str] = []
        while i < len(lines):
            t = lines[i].strip()
            if not t:
                break
            if "-->" in t:
                i -= 1
                break
            if t.isdigit():
                i += 1
                continue
            cleaned = _strip_vtt_tags(t)
            if cleaned:
                texts.append(cleaned)
            i += 1
        text = " ".join(texts).strip()
        if text:
            out.append({"text": text, "start": float(start_s), "duration": float(max(0.0, end_s - start_s))})
        i += 1
    out.sort(key=lambda x: float(x.get("start", 0.0) or 0.0))
    return out


def _run_cmd(args: List[str], *, cwd: Optional[str], timeout_s: int) -> Tuple[int, str, str]:
    res = subprocess.run(
        args,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=max(1, int(timeout_s or 1)),
    )
    return int(res.returncode or 0), str(res.stdout or ""), str(res.stderr or "")


def try_fetch_segments_with_ytdlp_subtitles(
    url_or_id: str, *, languages: List[str], timeout_s: int
) -> Optional[Tuple[List[Dict[str, Any]], Dict[str, Any]]]:
    if not which("yt-dlp"):
        return None
    url = str(url_or_id or "").strip()
    if not url:
        return None
    langs = ",".join([str(l or "").strip() for l in (languages or []) if str(l or "").strip()]) or "en"
    with tempfile.TemporaryDirectory(prefix="kg-ytdlp-vtt-") as tmp:
        out_tmpl = os.path.join(tmp, "%(id)s.%(ext)s")
        cmd = [
            "yt-dlp",
            "--no-playlist",
            "--quiet",
            "--no-warnings",
            "--skip-download",
            "--write-sub",
            "--write-auto-sub",
            "--sub-format",
            "vtt",
            "--sub-lang",
            langs,
            "-o",
            out_tmpl,
            url,
        ]
        code, _stdout, _stderr = _run_cmd(cmd, cwd=tmp, timeout_s=timeout_s)
        if code != 0:
            return None
        vtt_files = [os.path.join(tmp, f) for f in os.listdir(tmp) if f.lower().endswith(".vtt")]
        if not vtt_files:
            return None
        vtt_files.sort(key=lambda p: os.path.getsize(p) if os.path.exists(p) else 0, reverse=True)
        best = vtt_files[0]
        try:
            text = open(best, "r", encoding="utf-8", errors="replace").read()
        except Exception:
            return None
        segs = parse_vtt_segments(text)
        if not segs:
            return None
        selected_lang: Optional[str] = None
        m = re.search(r"\.([a-zA-Z-]+)\.vtt$", os.path.basename(best))
        if m:
            selected_lang = str(m.group(1) or "").strip().lower() or None
        meta = {
            "selected_language_code": selected_lang,
            "selected_language": selected_lang,
            "is_generated": True,
            "is_translatable": False,
            "translation_languages": [],
        }
        return segs, meta


def try_transcribe_with_whisper(
    url_or_id: str, *, language_code: str, timeout_s: int, whisper_model: str
) -> Optional[Dict[str, Any]]:
    if not which("yt-dlp") or not which("whisper"):
        return None
    url = str(url_or_id or "").strip()
    if not url:
        return None
    lang = str(language_code or "").strip().lower()
    model = str(whisper_model or "").strip() or "base"
    with tempfile.TemporaryDirectory(prefix="kg-ytdlp-whisper-") as tmp:
        out_tmpl = os.path.join(tmp, "audio.%(ext)s")
        dl_cmd = [
            "yt-dlp",
            "--no-playlist",
            "--quiet",
            "--no-warnings",
            "-x",
            "--audio-format",
            "wav",
            "-o",
            out_tmpl,
            url,
        ]
        code, _stdout, _stderr = _run_cmd(dl_cmd, cwd=tmp, timeout_s=timeout_s)
        if code != 0:
            return None
        wav_files = [os.path.join(tmp, f) for f in os.listdir(tmp) if f.lower().endswith(".wav")]
        if not wav_files:
            return None
        wav_files.sort(key=lambda p: os.path.getsize(p) if os.path.exists(p) else 0, reverse=True)
        wav_path = wav_files[0]
        wh_cmd = [
            "whisper",
            wav_path,
            "--model",
            model,
            "--task",
            "transcribe",
            "--output_format",
            "json",
            "--output_dir",
            tmp,
            "--fp16",
            "False",
        ]
        if lang:
            wh_cmd.extend(["--language", lang])
        code2, _stdout2, _stderr2 = _run_cmd(wh_cmd, cwd=tmp, timeout_s=timeout_s)
        if code2 != 0:
            return None
        json_files = [os.path.join(tmp, f) for f in os.listdir(tmp) if f.lower().endswith(".json")]
        if not json_files:
            return None
        json_files.sort(key=lambda p: os.path.getsize(p) if os.path.exists(p) else 0, reverse=True)
        try:
            obj = json.loads(open(json_files[0], "r", encoding="utf-8", errors="replace").read() or "{}")
        except Exception:
            return None
        return obj if isinstance(obj, dict) else None

