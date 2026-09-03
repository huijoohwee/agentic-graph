import os
from typing import Any, Optional

def env_float(key: str, fallback: float) -> float:
    raw = os.getenv(key, "").strip()
    if not raw:
        return float(fallback)
    try:
        val = float(raw)
        if val != val:
            return float(fallback)
        return float(val)
    except Exception:
        return float(fallback)


def env_int(key: str, fallback: int) -> int:
    raw = os.getenv(key, "").strip()
    if not raw:
        return int(fallback)
    try:
        val = int(float(raw))
        return int(val)
    except Exception:
        return int(fallback)


def env_bool(key: str, fallback: bool) -> bool:
    raw = os.getenv(key, "").strip().lower()
    if not raw:
        return bool(fallback)
    if raw in {"1", "true", "yes", "y", "on"}:
        return True
    if raw in {"0", "false", "no", "n", "off"}:
        return False
    return bool(fallback)


def parse_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    if not text:
        return None
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return None


def parse_float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        val = float(value)
        return val if val == val else None
    text = str(value or "").strip()
    if not text:
        return None
    try:
        val = float(text)
        return val if val == val else None
    except Exception:
        return None


def parse_int(value: Any) -> Optional[int]:
    if isinstance(value, int) and not isinstance(value, bool):
        return int(value)
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return int(float(text))
    except Exception:
        return None

def clamp01(x: float) -> float:
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return x
