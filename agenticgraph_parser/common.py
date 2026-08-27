import hashlib
import json
import os
import re
from datetime import datetime, timezone
from typing import Any, List, Optional

DEFAULT_AGENTIC_RAG_SCHEMA_URL = os.getenv("KG_AGENTIC_RAG_SCHEMA_URL", "https://huijoohwee.github.io/schema/AgenticRAG")
DEFAULT_AGENTIC_RAG_CONTEXT_URL = os.getenv(
    "KG_AGENTIC_RAG_CONTEXT_URL",
    "https://huijoohwee.github.io/schema/AgenticRAG/v1/context.jsonld",
)
DEFAULT_TERM_IRI_BASE = os.getenv("KG_TERM_IRI_BASE", "https://huijoohwee.github.io/knowgrph#")

KG_PREFIX = "kg:"
KG_CLASS_PREFIX = "kg:class:"
KG_PROP_PREFIX = "kg:prop:"
KG_NODE_TYPE_CLASS = "kg:NodeType"
KG_EDGE_LABEL_CLASS = "kg:EdgeLabel"
KG_PROPERTY_CLASS = "kg:Property"
KG_SUBJECT = "kg:subject"
KG_PREDICATE = "kg:predicate"
KG_OBJECT = "kg:object"


def read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_text(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def write_json(path: str, obj: Any) -> None:
    write_text(path, json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


def read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def find_repo_root(start: str) -> str:
    cur = os.path.abspath(start)
    if os.path.isfile(cur):
        cur = os.path.dirname(cur)
    last = ""
    while cur and cur != last:
        if os.path.isdir(os.path.join(cur, ".git")):
            return cur
        last = cur
        cur = os.path.dirname(cur)
    return os.path.abspath(os.path.dirname(start) if os.path.isfile(start) else start)


def safe_relpath(path: str, root: str) -> Optional[str]:
    try:
        abs_path = os.path.abspath(path)
        abs_root = os.path.abspath(root)
        rel = os.path.relpath(abs_path, abs_root)
        if rel.startswith(".."):
            return None
        return rel.replace("\\", "/")
    except Exception:
        return None


def slugify(value: str) -> str:
    s = value.strip().lower()
    s = re.sub(r"[^\w\s\-]+", "", s)
    s = re.sub(r"[\s\-]+", "-", s).strip("-")
    return s or "x"


def compact_id(*parts: str) -> str:
    raw = ":".join([p for p in parts if p])
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
    return f"{slugify(parts[0] if parts else 'x')}:{digest}"


def infer_json_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "string"


def merge_prop_types(a: str, b: str) -> str:
    if a == b:
        return a
    if "object" in (a, b):
        return "object"
    if "array" in (a, b):
        return "array"
    if "string" in (a, b):
        return "string"
    return "string"


def yaml_escape_scalar(s: str) -> str:
    if s == "" or s.strip() != s or any(
        c in s for c in [":", "{", "}", "[", "]", ",", "#", "&", "*", "!", "|", ">", "%", "@", "`", "\"", "'"]
    ):
        return json.dumps(s, ensure_ascii=False)
    return s


def to_yaml(obj: Any, indent: int = 0) -> str:
    pad = "  " * indent
    if obj is None:
        return "null"
    if obj is True:
        return "true"
    if obj is False:
        return "false"
    if isinstance(obj, (int, float)) and not isinstance(obj, bool):
        return str(obj)
    if isinstance(obj, str):
        return yaml_escape_scalar(obj)
    if isinstance(obj, list):
        if len(obj) == 0:
            return "[]"
        lines: List[str] = []
        for item in obj:
            if isinstance(item, (dict, list)):
                lines.append(f"{pad}- {to_yaml(item, indent + 1).lstrip()}")
            else:
                lines.append(f"{pad}- {to_yaml(item, 0)}")
        return "\n".join(lines)
    if isinstance(obj, dict):
        if len(obj) == 0:
            return "{}"
        lines = []
        for k, v in obj.items():
            key = str(k)
            if isinstance(v, (dict, list)):
                lines.append(f"{pad}{key}:")
                lines.append(to_yaml(v, indent + 1))
            else:
                lines.append(f"{pad}{key}: {to_yaml(v, 0)}")
        return "\n".join(lines)
    return yaml_escape_scalar(str(obj))
