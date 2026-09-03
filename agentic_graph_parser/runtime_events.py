import json
import os
from typing import Any, Dict, List


def normalize_runtime_node_id(node_id: str) -> str:
    value = node_id.strip()
    if value.startswith("kg:"):
        value = value[3:]
    if value.startswith("./"):
        value = value[2:]
    return value.replace("\\", "/")


def parse_runtime_log_line(line: str) -> Dict[str, Any]:
    text = line.strip()
    if not text:
        return {}
    if not (text.startswith("{") and text.endswith("}")):
        return {}
    try:
        obj: Any = json.loads(text)
    except Exception:
        return {}
    if not isinstance(obj, dict):
        return {}
    key_value = obj.get("key") or obj.get("id") or obj.get("event_key")
    node_value = obj.get("node_id") or obj.get("node") or obj.get("target")
    if not isinstance(key_value, str) or not key_value:
        return {}
    if not isinstance(node_value, str) or not node_value:
        return {}
    result: Dict[str, Any] = {
        "key": str(key_value),
        "node_id": normalize_runtime_node_id(str(node_value)),
    }
    event_type = obj.get("eventType") or obj.get("event_type") or obj.get("type")
    status = obj.get("status")
    duration = obj.get("durationMs") or obj.get("duration_ms") or obj.get("duration")
    stack = obj.get("stackTraceSnippet") or obj.get("stack") or obj.get("trace")
    if isinstance(event_type, str) and event_type:
        result["eventType"] = event_type
    if isinstance(status, str) and status:
        result["status"] = status
    if isinstance(duration, (int, float)):
        result["durationMs"] = float(duration)
    if isinstance(stack, str) and stack:
        result["stackTraceSnippet"] = stack
    return result


def load_runtime_events_from_log(path: str) -> List[Dict[str, Any]]:
    specs: List[Dict[str, Any]] = []
    if not path or not os.path.exists(path):
        return specs
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                spec = parse_runtime_log_line(raw_line)
                if not spec:
                    continue
                key_value = spec.get("key")
                node_value = spec.get("node_id")
                if not isinstance(key_value, str) or not key_value:
                    continue
                if not isinstance(node_value, str) or not node_value:
                    continue
                specs.append(spec)
    except Exception:
        return []
    return specs


def add_runtime_events(
    id_to_node: Dict[str, Dict[str, Any]],
    timestamp: str,
    extra_specs: Any = None,
) -> None:
    runtime_specs: List[Dict[str, Any]] = []
    if isinstance(extra_specs, list):
        for extra in extra_specs:
            if isinstance(extra, dict):
                runtime_specs.append(extra)
    for spec in runtime_specs:
        node_id = spec.get("node_id")
        if not isinstance(node_id, str) or not node_id:
            continue
        normalized_node_id = normalize_runtime_node_id(node_id)
        target_node = id_to_node.get(normalized_node_id)
        if not target_node:
            continue
        target_iri = target_node.get("@id")
        if not isinstance(target_iri, str) or not target_iri:
            continue
        key = spec.get("key")
        if not isinstance(key, str) or not key:
            continue
        event_iri = f"kg:{key}"
        if key in id_to_node:
            event_node = id_to_node[key]
        else:
            event_node = {
                "@id": event_iri,
                "@type": "RuntimeEvent",
            }
            id_to_node[key] = event_node
        event_type = spec.get("eventType")
        status = spec.get("status")
        duration = spec.get("durationMs")
        stack_snippet = spec.get("stackTraceSnippet")
        if isinstance(event_type, str) and event_type:
            event_node["eventType"] = event_type
        if isinstance(status, str) and status:
            event_node["status"] = status
        if isinstance(duration, (int, float)):
            event_node["durationMs"] = float(duration)
        event_node["occurredAt"] = timestamp
        event_node["runtimeOf"] = [target_iri]
        if isinstance(stack_snippet, str) and stack_snippet:
            event_node["stackTraceSnippet"] = stack_snippet
        existing_events = target_node.get("hasRuntimeEvent")
        if isinstance(existing_events, list):
            if event_iri not in existing_events:
                existing_events.append(event_iri)
        else:
            target_node["hasRuntimeEvent"] = [event_iri]

