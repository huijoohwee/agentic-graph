import fnmatch
import json
import os
from typing import Any, Callable, Dict, List, Tuple

try:
    import yaml  # type: ignore
except Exception:
    yaml = None


def load_yaml(path: str) -> Dict[str, Any]:
    lowered = path.lower()
    if lowered.endswith(".json") or lowered.endswith(".jsonld") or lowered.endswith(".json-ld"):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                loaded: Any = json.load(handle)
            return loaded if isinstance(loaded, dict) else {}
        except Exception:
            return {}
    if yaml:
        try:
            with open(path, "r", encoding="utf-8") as handle:
                loaded: Any = yaml.safe_load(handle)
        except Exception:
            loaded = None
        if isinstance(loaded, dict):
            return loaded
    result: Dict[str, Any] = {}
    current_section = ""
    current_agentic_list_key = ""
    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.rstrip("\n")
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if not line.startswith("  "):
                if stripped.endswith(":"):
                    current_section = stripped[:-1]
                    if current_section not in result:
                        result[current_section] = {}
                    if current_section != "agentic_rag":
                        current_agentic_list_key = ""
                continue
            if current_section == "graph" and line.startswith("  ") and not line.startswith("    "):
                parts = stripped.split(":", 1)
                if len(parts) != 2:
                    continue
                key = parts[0].strip()
                value = parts[1].strip()
                if not value:
                    continue
                graph_section = result.setdefault("graph", {})
                if isinstance(graph_section, dict):
                    graph_section[key] = value
                continue
            if current_section == "orchestrator":
                if line.startswith("  ") and not line.startswith("    "):
                    parts = stripped.split(":", 1)
                    if len(parts) != 2:
                        continue
                    key = parts[0].strip()
                    value = parts[1].strip()
                    orchestrator_section = result.setdefault("orchestrator", {})
                    if not isinstance(orchestrator_section, dict):
                        continue
                    if key == "pipeline_artifacts":
                        if "pipeline_artifacts" not in orchestrator_section:
                            orchestrator_section["pipeline_artifacts"] = {}
                        continue
                    if value:
                        orchestrator_section[key] = value
                    continue
                if line.startswith("    "):
                    parts = stripped.split(":", 1)
                    if len(parts) != 2:
                        continue
                    key = parts[0].strip()
                    value = parts[1].strip()
                    orchestrator_section = result.setdefault("orchestrator", {})
                    if not isinstance(orchestrator_section, dict):
                        continue
                    pipeline_section = orchestrator_section.setdefault("pipeline_artifacts", {})
                    if not isinstance(pipeline_section, dict):
                        continue
                    if value:
                        pipeline_section[key] = value
            if current_section == "agentic_rag":
                if line.startswith("  ") and not line.startswith("    "):
                    parts = stripped.split(":", 1)
                    if len(parts) != 2:
                        continue
                    key = parts[0].strip()
                    value = parts[1].strip()
                    agentic_section = result.setdefault("agentic_rag", {})
                    if not isinstance(agentic_section, dict):
                        continue
                    if value:
                        agentic_section[key] = value
                        current_agentic_list_key = ""
                    else:
                        current_agentic_list_key = key
                        existing_value = agentic_section.get(key)
                        if not isinstance(existing_value, list):
                            agentic_section[key] = []
                    continue
                if line.startswith("    "):
                    if not current_agentic_list_key:
                        continue
                    if stripped.startswith("- "):
                        item = stripped[2:].strip()
                        if not item:
                            continue
                        agentic_section = result.setdefault("agentic_rag", {})
                        if not isinstance(agentic_section, dict):
                            continue
                        existing_list = agentic_section.get(current_agentic_list_key)
                        if not isinstance(existing_list, list):
                            existing_list = []
                            agentic_section[current_agentic_list_key] = existing_list
                        existing_list.append(item)
        return result


def normalize_rel_path(path: str) -> str:
    return path.replace("\\", "/")


def resolve_ignore_pattern(pattern: str) -> str:
    text = pattern.strip()
    if not text:
        return ""
    if ":" in text:
        prefix, rest = text.split(":", 1)
        key = prefix.strip().lower()
        value = rest.strip()
        if not value:
            return ""
        if key == "dir":
            value_norm = normalize_rel_path(value)
            if not value_norm.endswith("/"):
                value_norm = value_norm + "/"
            return value_norm
        if key == "glob":
            return value
        if key == "path":
            return normalize_rel_path(value)
    return pattern


def extract_ignored_paths(config: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    agentic_cfg = config.get("agentic_rag") or {}
    if not isinstance(agentic_cfg, dict):
        return [], []
    raw_paths = agentic_cfg.get("ignore_codebase_paths")
    if not isinstance(raw_paths, list):
        return [], []
    raw_patterns: List[str] = []
    resolved_patterns: List[str] = []
    for item in raw_paths:
        if isinstance(item, str):
            value = item.strip()
            if value:
                raw_patterns.append(value)
                resolved = resolve_ignore_pattern(value)
                if resolved:
                    resolved_patterns.append(resolved)
    return raw_patterns, resolved_patterns


def should_ignore_path(path: str, ignored_paths: List[str]) -> bool:
    if not ignored_paths:
        return False
    normalized_path = normalize_rel_path(path).lstrip("./")
    segments = normalized_path.split("/") if normalized_path else []
    for raw_pattern in ignored_paths:
        pattern = raw_pattern.strip()
        if not pattern:
            continue
        normalized_pattern = normalize_rel_path(pattern)
        if normalized_pattern.startswith("./"):
            normalized_pattern = normalized_pattern[2:]
        if not normalized_pattern:
            continue
        if normalized_pattern.endswith("/"):
            dir_pattern = normalized_pattern.rstrip("/")
            if "/" in dir_pattern:
                if normalized_path == dir_pattern or normalized_path.startswith(dir_pattern + "/"):
                    return True
            else:
                if dir_pattern in segments:
                    return True
            continue
        if any(ch in normalized_pattern for ch in "*?[]"):
            if fnmatch.fnmatch(normalized_path, normalized_pattern):
                return True
            if segments and fnmatch.fnmatch(segments[-1], normalized_pattern):
                return True
            continue
        if "/" in normalized_pattern:
            if normalized_path == normalized_pattern or normalized_path.startswith(normalized_pattern + "/"):
                return True
        else:
            if normalized_pattern in segments:
                return True
    return False


def build_ignore_matcher(ignored_paths: List[str]) -> Callable[[str], bool]:
    compiled: List[Tuple[str, str]] = []
    for raw_pattern in ignored_paths or []:
        pattern = raw_pattern.strip() if isinstance(raw_pattern, str) else ""
        if not pattern:
            continue
        normalized_pattern = normalize_rel_path(pattern)
        if normalized_pattern.startswith("./"):
            normalized_pattern = normalized_pattern[2:]
        if not normalized_pattern:
            continue
        if normalized_pattern.endswith("/"):
            compiled.append(("dir", normalized_pattern.rstrip("/")))
        elif any(ch in normalized_pattern for ch in "*?[]"):
            compiled.append(("glob", normalized_pattern))
        elif "/" in normalized_pattern:
            compiled.append(("path", normalized_pattern))
        else:
            compiled.append(("segment", normalized_pattern))

    cache: Dict[str, bool] = {}

    def matcher(path: str) -> bool:
        if not compiled:
            return False
        normalized_path = normalize_rel_path(path).lstrip("./")
        cached = cache.get(normalized_path)
        if cached is not None:
            return bool(cached)
        segments = normalized_path.split("/") if normalized_path else []
        ignored = False
        for kind, value in compiled:
            if kind == "dir":
                if "/" in value:
                    if normalized_path == value or normalized_path.startswith(value + "/"):
                        ignored = True
                        break
                else:
                    if value in segments:
                        ignored = True
                        break
                continue
            if kind == "glob":
                if fnmatch.fnmatch(normalized_path, value):
                    ignored = True
                    break
                if segments and fnmatch.fnmatch(segments[-1], value):
                    ignored = True
                    break
                continue
            if kind == "path":
                if normalized_path == value or normalized_path.startswith(value + "/"):
                    ignored = True
                    break
                continue
            if kind == "segment":
                if value in segments:
                    ignored = True
                    break
                continue
        cache[normalized_path] = ignored
        if len(cache) > 50000:
            cache.clear()
        return ignored

    return matcher


def extract_graphrag_workflow_config(config: Dict[str, Any]) -> str:
    graph_cfg = config.get("graph") or {}
    if not isinstance(graph_cfg, dict):
        return ""
    value = graph_cfg.get("graphrag_workflow")
    if isinstance(value, str) and value:
        return normalize_rel_path(value)
    return ""


def extract_traversal_edges(config: Dict[str, Any]) -> List[str]:
    agentic_cfg = config.get("agentic_rag") or {}
    if not isinstance(agentic_cfg, dict):
        return []
    raw_edges = agentic_cfg.get("traversal_edges")
    if not isinstance(raw_edges, list):
        return []
    edges: List[str] = []
    for item in raw_edges:
        if isinstance(item, str):
            label = item.strip()
            if label:
                edges.append(label)
    return edges


def extract_graph_rag_paths(config: Dict[str, Any]) -> List[Dict[str, Any]]:
    agentic_cfg = config.get("agentic_rag") or {}
    if not isinstance(agentic_cfg, dict):
        return []
    raw_paths = agentic_cfg.get("graph_rag_paths")
    if not isinstance(raw_paths, list):
        return []
    result: List[Dict[str, Any]] = []
    for item in raw_paths:
        if not isinstance(item, dict):
            continue
        owner_id = item.get("owner_id")
        query = item.get("query")
        traverse = item.get("traverse")
        if not isinstance(owner_id, str) or not owner_id.strip():
            continue
        if not isinstance(query, str) or not query.strip():
            continue
        if not isinstance(traverse, list) or not traverse:
            continue
        traverse_items: List[str] = []
        for entry in traverse:
            if entry is None:
                continue
            text = str(entry).strip()
            if text:
                traverse_items.append(text)
        if not traverse_items:
            continue
        spec: Dict[str, Any] = {
            "owner_id": owner_id.strip(),
            "query": query.strip(),
            "traverse": traverse_items,
        }
        example_value = item.get("example")
        if isinstance(example_value, str) and example_value.strip():
            spec["example"] = example_value.strip()
        steps_value = item.get("multiHop") or item.get("hops") or item.get("steps")
        if isinstance(steps_value, list) and steps_value:
            steps_items: List[str] = []
            for step in steps_value:
                if step is None:
                    continue
                step_text = str(step).strip()
                if step_text:
                    steps_items.append(step_text)
            if steps_items:
                spec["multiHop"] = steps_items
        context_value = item.get("context")
        if isinstance(context_value, str) and context_value.strip():
            spec["context"] = context_value.strip()
        result.append(spec)
    return result
