import json
from importlib import import_module
from typing import Any, Callable, Dict, List, Tuple

from .common import KG_PREFIX, KG_SUBJECT, KG_PREDICATE, KG_OBJECT


def strip_kg(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    if text.startswith(KG_PREFIX):
        return text[len(KG_PREFIX) :]
    return text


def is_id_property(context: Dict[str, Any], key: str) -> bool:
    raw = context.get(key)
    if isinstance(raw, dict):
        t = raw.get("@type")
        return t == "@id"
    return False


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_context(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, list):
        merged: Dict[str, Any] = {}
        for entry in raw:
            entry_context = normalize_context(entry)
            if entry_context:
                merged.update(entry_context)
        return merged
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


def is_explicit_edge_item(item: Dict[str, Any]) -> bool:
    item_type = item.get("@type") or item.get("type")
    if isinstance(item_type, list):
        item_type = item_type[0] if item_type else ""
    if str(item_type or "").strip().lower() != "edge":
        return False
    return bool(item.get("source") and item.get("target"))


def as_graph_items(root: Any) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    if isinstance(root, dict):
        context = normalize_context(root.get("@context") or root.get("context") or {})
        graph = root.get("@graph") or root.get("graph") or root.get("nodes") or root.get("items")
        if isinstance(graph, list):
            items = [x for x in graph if isinstance(x, dict)]
            return items, context
        if isinstance(root.get("@graph"), dict):
            return [root["@graph"]], context
        if isinstance(root.get("node"), dict):
            return [root["node"]], context
        if "@id" in root or "@type" in root:
            return [root], context
    if isinstance(root, list):
        items = [x for x in root if isinstance(x, dict)]
        return items, {}
    return [], {}


def build_nodes(items: List[Dict[str, Any]], context: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    nodes: List[Dict[str, Any]] = []
    index: Dict[str, Dict[str, Any]] = {}
    edge_items: List[Dict[str, Any]] = []

    for item in items:
        if not isinstance(item, dict):
            continue
        item_id = item.get("@id") or item.get("id")
        item_type = item.get("@type") or item.get("type") or "Entity"
        node_id = strip_kg(item_id)
        if not node_id:
            continue
        if isinstance(item_type, list) and item_type:
            item_type = item_type[0]
        node_type = strip_kg(item_type) or "Entity"

        if (KG_SUBJECT in item and KG_PREDICATE in item and KG_OBJECT in item) or is_explicit_edge_item(item):
            edge_items.append(item)
            continue

        name = item.get("name") or item.get("label") or node_id
        data: Dict[str, Any] = {"type": node_type, "name": str(name)}
        for k, v in item.items():
            if k in {"@id", "@type", "id", "type", "name", "label", "@context", "@graph"}:
                continue
            if v is None:
                continue
            if isinstance(v, list) and v and all(isinstance(x, str) for x in v) and is_id_property(context, k):
                data[k] = [strip_kg(x) for x in v]
                continue
            if isinstance(v, str) and is_id_property(context, k):
                data[k] = strip_kg(v)
                continue
            data[k] = v

        node = {"id": node_id, "data": data}
        nodes.append(node)
        index[node_id] = node

    return nodes, index, edge_items


def build_edges(items: List[Dict[str, Any]], context: Dict[str, Any], node_index: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    edges: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        item_id = item.get("@id") or item.get("id")
        node_id = strip_kg(item_id)
        if not node_id or node_id not in node_index:
            continue

        for k, v in item.items():
            if k in {"@id", "@type", "id", "type", "name", "label", "@context", "@graph"}:
                continue
            if not is_id_property(context, k):
                continue
            targets: List[tuple[str, Dict[str, Any]]] = []
            if isinstance(v, list):
                for entry in v:
                    if isinstance(entry, dict):
                        target_id_raw = entry.get("@id") or entry.get("id")
                        target = strip_kg(target_id_raw)
                        if not target:
                            continue
                        props: Dict[str, Any] = {}
                        for pk, pv in entry.items():
                            if pk in {"@id", "id"}:
                                continue
                            if pv is None:
                                continue
                            props[pk] = pv
                        targets.append((target, props))
                        continue
                    target = strip_kg(entry)
                    if target:
                        targets.append((target, {}))
            elif isinstance(v, dict):
                target_id_raw = v.get("@id") or v.get("id")
                target = strip_kg(target_id_raw)
                if target:
                    props = {pk: pv for pk, pv in v.items() if pk not in {"@id", "id"} and pv is not None}
                    targets.append((target, props))
            else:
                target = strip_kg(v)
                if target:
                    targets.append((target, {}))
            for target_id, props in targets:
                if target_id not in node_index:
                    continue
                data: Dict[str, Any] = {"type": k}
                if props:
                    data.update(props)
                edges.append({"source": node_id, "target": target_id, "data": data})
    return edges


def build_reified_edges(edge_items: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> None:
    for item in edge_items:
        if is_explicit_edge_item(item):
            subj = strip_kg(item.get("source"))
            pred = strip_kg(item.get("relation") or item.get("label") or item.get("predicate") or item.get("type"))
            obj = strip_kg(item.get("target"))
            props = item.get("properties")
            data: Dict[str, Any] = {"type": pred or "relatedTo"}
            if isinstance(props, dict):
                data.update(props)
            metadata = item.get("metadata")
            if isinstance(metadata, dict):
                data["metadata"] = metadata
            edge_id = strip_kg(item.get("@id") or item.get("id"))
            if edge_id:
                data["id"] = edge_id
            if subj and obj:
                edges.append({"source": subj, "target": obj, "data": data})
            continue
        subj = strip_kg(item.get(KG_SUBJECT))
        pred = strip_kg(item.get(KG_PREDICATE))
        obj = strip_kg(item.get(KG_OBJECT))
        if not subj or not pred or not obj:
            continue
        edges.append({"source": subj, "target": obj, "data": {"type": pred}})


def parse_jsonld_default(root: Any) -> Dict[str, Any]:
    if isinstance(root, dict) and isinstance(root.get("nodes"), list) and isinstance(root.get("edges"), list):
        nodes_value = root.get("nodes") or []
        edges_value = root.get("edges") or []
        context_value = root.get("context")
        if isinstance(context_value, str):
            context_text = context_value
        else:
            context_text = json.dumps(context_value or {}, ensure_ascii=False)
        return {"context": context_text, "type": "Graph", "nodes": nodes_value, "edges": edges_value}
    items, context = as_graph_items(root)
    nodes, node_index, edge_items = build_nodes(items, context)
    edges = build_edges(items, context, node_index)
    build_reified_edges(edge_items, edges)
    context_text = json.dumps(context, ensure_ascii=False)
    return {"context": context_text, "type": "Graph", "nodes": nodes, "edges": edges}


def load_external_parser(module_name: str, function_name: str) -> Callable[[Any], Dict[str, Any]]:
    module = import_module(module_name)
    function = getattr(module, function_name)
    return function
