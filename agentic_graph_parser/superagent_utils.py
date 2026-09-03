import json
import os
import re
from datetime import datetime, timezone
from typing import Any, List, Optional, Tuple

from .common import read_text, sha256_text, slugify
from .superagent_contracts import JsonDict

def read_trace_events(trace_path: str) -> List[JsonDict]:
    events: List[JsonDict] = []
    if not os.path.exists(trace_path):
        return events
    with open(trace_path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                value = json.loads(line)
                if isinstance(value, dict):
                    events.append(value)
            except Exception:
                continue
    return events


def summarize_payload(payload: Any, *, depth: int = 0) -> Any:
    if depth > 2:
        return summarize_scalar(payload)
    if isinstance(payload, dict):
        out: JsonDict = {}
        for key, value in list(payload.items())[:18]:
            if key in {"brief_text", "body", "goal_text"}:
                out[key] = {"chars": len(str(value)), "sha256": sha256_text(str(value))[:12]}
            elif key == "state":
                out[key] = {
                    "run_id": str(value.get("run", {}).get("run_id") if isinstance(value, dict) else ""),
                    "completed": len(value.get("completed_task_ids") or []) if isinstance(value, dict) else 0,
                }
            else:
                out[key] = summarize_payload(value, depth=depth + 1)
        return out
    if isinstance(payload, list):
        return [summarize_payload(item, depth=depth + 1) for item in payload[:8]]
    return summarize_scalar(payload)


def summarize_scalar(value: Any) -> Any:
    if isinstance(value, str):
        if len(value) > 160:
            return {"chars": len(value), "prefix": value[:80], "sha256": sha256_text(value)[:12]}
        return value
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(type(value).__name__)


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def clip_sentence(value: str, limit: int) -> str:
    text = normalize_space(value)
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "..."


def color_pair_from_text(text: str) -> Tuple[str, str]:
    digest = sha256_text(text)
    colors = ["#79c2a8", "#e6b85c", "#83a6d6", "#d9878b", "#9fbf70", "#c59bd8"]
    accents = ["#126b5b", "#8a5b10", "#2f5f9f", "#93434c", "#557a21", "#754d91"]
    idx = int(digest[:2], 16) % len(colors)
    return colors[idx], accents[idx]


def default_output_dir(base_dir: str, run_id: str) -> str:
    return os.path.join(base_dir, "data", "superagent-runs", run_id)


def build_run_id(input_path: Optional[str], goal_text: str, provided: str = "") -> str:
    if provided.strip():
        return slugify(provided)
    seed = f"{input_path or ''}:{sha256_text(goal_text)[:16]}:{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    return f"run-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{sha256_text(seed)[:8]}"


def load_goal_text(goal_file: str, base_dir: str) -> str:
    if goal_file.strip():
        path = os.path.abspath(goal_file)
    else:
        path = os.path.join(base_dir, "goal")
    if os.path.exists(path):
        return read_text(path)
    return "Build and run a universal super-agent harness for rich media canvas generation."
