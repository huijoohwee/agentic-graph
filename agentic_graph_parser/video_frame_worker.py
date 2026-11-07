"""Short-lived source session for the local frame endpoint; stdout is NDJSON only."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
import re
import sys
import threading
import time
from typing import Any, Dict, Optional, Sequence, TextIO, Tuple
from urllib.parse import urlparse

from . import video_frame_cmd as frames

MAX_PENDING_JOBS = 16
MAX_JOB_LINE_BYTES = 16_384
FRAME_FILE_RE = re.compile(r"^frame-[a-f0-9]+-t\d+(?:_\d+)?\.(?:png|jpg)$", re.IGNORECASE)


def _within_root(root: str, value: str) -> bool:
    try:
        return value != root and os.path.commonpath((root, value)) == root
    except ValueError:
        return False


class SourceSession:
    def __init__(self, url: str, input_root: str, timeout_s: int):
        self.url = url
        self.input_root = os.path.realpath(input_root)
        self.deadline = time.monotonic() + timeout_s
        self.lock = threading.Lock()
        self.stream: Optional[Tuple[str, Dict[str, str]]] = None
        self.stream_error: Optional[Exception] = None
        self.local_video: Optional[str] = None
        self.download_error: Optional[Exception] = None

    def remaining(self) -> int:
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Video frame source session deadline expired")
        return max(1, math.ceil(remaining))

    def source(self) -> Tuple[str, Dict[str, str]]:
        with self.lock:
            self.remaining()
            if self.local_video:
                return self.local_video, {}
            if self.stream_error:
                raise self.stream_error
            if self.stream is None:
                try:
                    self.stream = frames._pick_stream(self.url, timeout_s=min(30, self.remaining()))
                except Exception as error:
                    self.stream_error = error
                    raise
            return self.stream

    def fallback(self) -> str:
        with self.lock:
            self.remaining()
            if self.download_error:
                raise self.download_error
            if self.local_video:
                return self.local_video
            try:
                downloaded = frames._download_video_for_frame(
                    self.url, output_dir=self.input_root, timeout_s=self.remaining())
                resolved = os.path.realpath(downloaded)
                if not _within_root(self.input_root, resolved):
                    raise ValueError("Fallback source escaped the private input root")
                size = os.path.getsize(resolved)
                if size <= 0 or size > frames._download_limit_bytes():
                    if size > 0:
                        os.remove(resolved)
                    raise ValueError("Video frame fallback input exceeds the configured byte limit")
                self.local_video = resolved
                return resolved
            except Exception as error:
                self.download_error = error
                raise

    def extract(self, job: Dict[str, Any]) -> Dict[str, Any]:
        args = argparse.Namespace(url=self.url, time=job["timeSeconds"], format=job["format"],
                                  output=job["outputPath"], timeout_s=self.remaining())
        result = frames._extract_frame(args, prepared_source=self.source,
                                       fallback_source=self.fallback, temp_root=self.input_root)
        return {"id": job["id"], "ok": True, "path": result["path"],
                "timeSeconds": result["time_s"], "format": result["format"],
                "bytes": result["bytes"], "cached": result["cached"]}


def _read_job(value: Any, output_root: str) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Frame job must be a JSON object")
    job_id = value.get("id")
    if not isinstance(job_id, str) or not job_id or len(job_id) > 128:
        raise ValueError("Frame job requires an id of at most 128 characters")
    timestamp = value.get("timeSeconds")
    if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)):
        raise ValueError("Frame timestamp must be a finite number")
    if not math.isfinite(timestamp) or not 0 <= timestamp <= 43_200:
        raise ValueError("Frame timestamp is outside the supported range")
    fmt = value.get("format")
    if fmt not in ("png", "jpg"):
        raise ValueError("Frame format must be png or jpg")
    output = value.get("outputPath")
    if not isinstance(output, str) or not os.path.isabs(output) or len(output.encode("utf-8")) > 4096:
        raise ValueError("Frame output must be an absolute path within the output root")
    resolved = os.path.realpath(output)
    if not _within_root(output_root, resolved) or not FRAME_FILE_RE.fullmatch(os.path.basename(resolved)):
        raise ValueError("Frame output escaped the output root or has an invalid filename")
    if not resolved.lower().endswith(f".{fmt}"):
        raise ValueError("Frame output extension does not match its format")
    return {"id": job_id, "timeSeconds": frames._normalize_time_seconds(timestamp),
            "format": fmt, "outputPath": resolved}


def run_worker(*, url: str, output_root: str, input_root: str, timeout_s: int,
               input_stream: TextIO, output_stream: TextIO) -> int:
    if len(url) > 4096 or urlparse(url).scheme not in ("http", "https"):
        raise ValueError("Source session requires a supported HTTP video URL")
    output_root, input_root = os.path.realpath(output_root), os.path.realpath(input_root)
    if output_root == input_root or _within_root(output_root, input_root):
        raise ValueError("Private input root must be separate from the public output root")
    os.makedirs(input_root, mode=0o700, exist_ok=True)
    if os.name != "nt" and os.stat(input_root).st_mode & 0o077:
        raise ValueError("Input root must have private directory permissions")
    session = SourceSession(url, input_root, max(1, min(3600, timeout_s)))
    slots = threading.BoundedSemaphore(MAX_PENDING_JOBS)
    pending_ids, pending_paths = set(), set()
    state_lock, output_lock = threading.Lock(), threading.Lock()

    def emit(payload: Dict[str, Any]) -> None:
        with output_lock:
            output_stream.write(json.dumps(payload, ensure_ascii=True, separators=(",", ":")) + "\n")
            output_stream.flush()

    def error_result(job_id: Any, error: Exception) -> Dict[str, Any]:
        message = str(error).encode("utf-8", errors="replace")[:2000].decode("utf-8", errors="ignore")
        return {"id": job_id if isinstance(job_id, str) and len(job_id) <= 128 else None,
                "ok": False, "error": message or "Video frame extraction failed"}

    def complete(future: Any, job: Dict[str, Any]) -> None:
        try:
            result = future.result()
        except Exception as error:
            result = error_result(job["id"], error)
        with state_lock:
            pending_ids.remove(job["id"])
            pending_paths.remove(job["outputPath"])
            slots.release()
        emit(result)

    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="video-frame") as executor:
        while True:
            line = input_stream.readline(MAX_JOB_LINE_BYTES + 1)
            if not line:
                break
            value = None
            try:
                if len(line.encode("utf-8")) > MAX_JOB_LINE_BYTES:
                    raise ValueError("Frame job exceeds the 16 KB input line limit")
                value = json.loads(line)
                job = _read_job(value, output_root)
                session.remaining()
                with state_lock:
                    if job["id"] in pending_ids or job["outputPath"] in pending_paths:
                        raise ValueError("Duplicate pending frame job")
                    if not slots.acquire(blocking=False):
                        raise ValueError("Source session exceeds the 16 pending frame job limit")
                    pending_ids.add(job["id"])
                    pending_paths.add(job["outputPath"])
                future = executor.submit(session.extract, job)
                future.add_done_callback(lambda finished, submitted=job: complete(finished, submitted))
            except Exception as error:
                emit(error_result(value.get("id") if isinstance(value, dict) else None, error))
                if len(line) > MAX_JOB_LINE_BYTES:
                    break
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Reuse one private source input for bounded frame jobs")
    parser.add_argument("--url", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--input-root", required=True)
    parser.add_argument("--timeout-s", type=int, default=75)
    args = parser.parse_args(list(argv) if argv is not None else None)
    try:
        return run_worker(url=args.url, output_root=args.output_root, input_root=args.input_root,
                          timeout_s=args.timeout_s, input_stream=sys.stdin, output_stream=sys.stdout)
    except Exception as error:
        sys.stderr.write(f"Video frame source session failed: {str(error)[:2000]}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
