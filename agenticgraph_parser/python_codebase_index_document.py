import json
import os
from typing import Any, Dict, List, Optional, Tuple

from .common import DEFAULT_AGENTIC_RAG_SCHEMA_URL, DEFAULT_TERM_IRI_BASE, KG_PREFIX, utc_now_iso
from .codebase_index_artifacts import normalize_rel_path
from .config_paths import UNIVERSAL_SCHEMA_CONFIG_REL, repo_path
from .runtime_events import add_runtime_events
from .python_codebase_index_graph import GraphNodeRecord


def extract_runtime_event_specs(config: Dict[str, Any]) -> List[Dict[str, Any]]:
    agentic_cfg = config.get("agentic_rag") or {}
    if not isinstance(agentic_cfg, dict):
        return []
    raw_events = agentic_cfg.get("runtime_events")
    if not isinstance(raw_events, list):
        return []
    events: List[Dict[str, Any]] = []
    for item in raw_events:
        if not isinstance(item, dict):
            continue
        node_id = item.get("node_id") or item.get("nodeId")
        if not isinstance(node_id, str) or not node_id.strip():
            continue
        spec: Dict[str, Any] = {"node_id": node_id.strip()}
        key = item.get("key") or item.get("id") or item.get("event_key")
        if isinstance(key, str) and key.strip():
            spec["key"] = key.strip()
        event_type = item.get("eventType") or item.get("event_type") or item.get("type")
        if isinstance(event_type, str) and event_type.strip():
            spec["eventType"] = event_type.strip()
        status = item.get("status")
        if isinstance(status, str) and status.strip():
            spec["status"] = status.strip()
        duration = item.get("durationMs") or item.get("duration_ms") or item.get("duration")
        if isinstance(duration, (int, float)):
            spec["durationMs"] = float(duration)
        stack = item.get("stackTraceSnippet") or item.get("stack") or item.get("trace")
        if isinstance(stack, str) and stack.strip():
            spec["stackTraceSnippet"] = stack.strip()
        events.append(spec)
    return events


def apply_graphrag_paths(nodes_by_id: Dict[str, GraphNodeRecord], graphrag_paths: List[Dict[str, Any]]) -> None:
    if not graphrag_paths:
        return
    for spec in graphrag_paths:
        owner_id = spec.get("owner_id")
        if not isinstance(owner_id, str):
            continue
        owner_key = owner_id.strip()
        if not owner_key:
            continue
        if owner_key.startswith(KG_PREFIX):
            owner_key = owner_key[len(KG_PREFIX) :]
        node = nodes_by_id.get(owner_key)
        if not node:
            continue
        query_value = spec.get("query")
        traverse_value = spec.get("traverse")
        if not isinstance(query_value, str) or not query_value.strip():
            continue
        if not isinstance(traverse_value, list) or not traverse_value:
            continue
        graph_rag_path: Dict[str, Any] = {"query": query_value.strip(), "traverse": traverse_value}
        example_value = spec.get("example")
        if isinstance(example_value, str) and example_value.strip():
            graph_rag_path["example"] = example_value.strip()
        multi_hop_value = spec.get("multiHop") or spec.get("hops") or spec.get("steps")
        if isinstance(multi_hop_value, list) and multi_hop_value:
            steps: List[str] = []
            for entry in multi_hop_value:
                if entry is None:
                    continue
                text = str(entry).strip()
                if text:
                    steps.append(text)
            if steps:
                graph_rag_path["multiHop"] = steps
        context_value = spec.get("context")
        if isinstance(context_value, str) and context_value.strip():
            graph_rag_path["context"] = context_value.strip()
        node.properties["graphRAGPath"] = graph_rag_path

        parts: List[str] = []
        parts.append("Query: " + graph_rag_path["query"])
        traverse_items: List[str] = []
        for entry in graph_rag_path.get("traverse", []):
            if entry is None:
                continue
            item_text = str(entry).strip()
            if item_text:
                traverse_items.append(item_text)
        if traverse_items:
            parts.append("Traverse: " + " -> ".join(traverse_items))
        example = graph_rag_path.get("example")
        if isinstance(example, str) and example:
            parts.append("Example: " + example)
        hops = graph_rag_path.get("multiHop")
        if isinstance(hops, list) and hops:
            hop_items: List[str] = []
            for entry in hops:
                if entry is None:
                    continue
                text = str(entry).strip()
                if text:
                    hop_items.append(text)
            if hop_items:
                parts.append("Steps: " + " | ".join(hop_items))
        context_text = graph_rag_path.get("context")
        if isinstance(context_text, str) and context_text:
            parts.append("Context: " + context_text)
        if parts:
            node.properties["chunk_text"] = " | ".join(parts)


def build_jsonld_document(
    nodes_by_id: Dict[str, GraphNodeRecord],
    *,
    codebase_id: str,
    source_name: str,
    traversal_edges: List[str],
    ignored_paths: List[str],
    raw_ignored_patterns: List[str],
    graphrag_paths: Optional[List[Dict[str, Any]]] = None,
    runtime_event_specs: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    timestamp = utc_now_iso()
    if graphrag_paths:
        apply_graphrag_paths(nodes_by_id, graphrag_paths)

    context: Dict[str, Any] = {
        "@vocab": DEFAULT_TERM_IRI_BASE,
        "schema": "https://schema.org/",
        "name": "schema:name",
        "path": "schema:path",
        "labels": "schema:additionalType",
        "properties": f"{DEFAULT_TERM_IRI_BASE}properties",
        "graphRAGPath": f"{DEFAULT_TERM_IRI_BASE}graphRAGPath",
        "chunk_text": f"{DEFAULT_TERM_IRI_BASE}chunkText",
        "embedding": f"{DEFAULT_TERM_IRI_BASE}embedding",
        "metadata": f"{DEFAULT_TERM_IRI_BASE}metadata",
        "hasRuntimeEvent": {"@id": f"{DEFAULT_TERM_IRI_BASE}hasRuntimeEvent", "@type": "@id"},
        "runtimeOf": {"@id": f"{DEFAULT_TERM_IRI_BASE}runtimeOf", "@type": "@id"},
        "eventType": f"{DEFAULT_TERM_IRI_BASE}eventType",
        "status": f"{DEFAULT_TERM_IRI_BASE}status",
        "durationMs": f"{DEFAULT_TERM_IRI_BASE}durationMs",
        "occurredAt": f"{DEFAULT_TERM_IRI_BASE}occurredAt",
        "stackTraceSnippet": f"{DEFAULT_TERM_IRI_BASE}stackTraceSnippet",
    }

    id_to_node: Dict[str, Dict[str, Any]] = {}
    edge_labels: List[str] = []
    for record in nodes_by_id.values():
        node_obj: Dict[str, Any] = {"@id": f"{KG_PREFIX}{record.id}", "@type": record.type, "name": record.name}
        if record.path:
            node_obj["path"] = normalize_rel_path(record.path)
        if record.labels:
            node_obj["labels"] = list(record.labels)
        graph_rag_path_value = record.properties.get("graphRAGPath")
        chunk_text_value = record.properties.get("chunk_text")
        properties_obj: Dict[str, Any] = {}
        for key, value in record.properties.items():
            if key in ("graphRAGPath", "chunk_text"):
                continue
            properties_obj[key] = value
        if properties_obj:
            node_obj["properties"] = properties_obj
        if isinstance(graph_rag_path_value, dict):
            node_obj["graphRAGPath"] = graph_rag_path_value
        if isinstance(chunk_text_value, str) and chunk_text_value:
            node_obj["chunk_text"] = chunk_text_value

        provenance: Dict[str, Any] = {"source": source_name, "timestamp": timestamp}
        if codebase_id:
            provenance["codebaseId"] = codebase_id
        if record.path:
            rel_path = normalize_rel_path(record.path).lstrip("./")
            provenance["codebasePath"] = rel_path
            area = rel_path.split("/", 1)[0] if "/" in rel_path else ""
            if area:
                provenance["codebaseArea"] = area
        node_obj["metadata"] = provenance

        for label, targets in record.relations.items():
            if not targets:
                continue
            edge_labels.append(label)
            node_obj[label] = [f"{KG_PREFIX}{target}" for target in sorted(targets)]
        id_to_node[record.id] = node_obj

    if runtime_event_specs:
        add_runtime_events(id_to_node, timestamp, runtime_event_specs)
        edge_labels.extend(["hasRuntimeEvent", "runtimeOf"])

    unique_labels = sorted({label for label in edge_labels if label})
    for label in unique_labels:
        context[label] = {"@id": f"{DEFAULT_TERM_IRI_BASE}{label}", "@type": "@id"}

    selected_relations: List[str] = []
    if traversal_edges:
        for label in unique_labels:
            if label in traversal_edges:
                selected_relations.append(label)
    else:
        selected_relations = list(unique_labels)

    metadata: Dict[str, Any] = {
        "schema": DEFAULT_AGENTIC_RAG_SCHEMA_URL,
        "source": source_name,
        "graphType": "codebase-index",
    }
    if codebase_id:
        metadata["codebaseId"] = codebase_id
    if raw_ignored_patterns:
        metadata["ignoreCodebasePaths"] = raw_ignored_patterns
    if ignored_paths:
        metadata["ignoreCodebasePathsResolved"] = ignored_paths
    if selected_relations:
        metadata["jsonLdMapping"] = {"contextEdgeProperties": selected_relations}
    metadata["layers"] = {
        "indexing": {"description": "Static codebase index of Python files, modules, classes, and functions."},
        "traversal": {"edgeLabels": selected_relations or unique_labels},
        "tracing": {"eventTypes": ["call", "return", "exception"], "linkProperties": ["hasRuntimeEvent", "runtimeOf"]},
    }
    return {"@context": context, "@graph": list(id_to_node.values()), "metadata": metadata}


def ensure_schema_config_file(path: str, *, base_dir: Optional[str] = None) -> None:
    if os.path.exists(path):
        return
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    resolved_base = os.path.abspath(base_dir) if base_dir else os.path.abspath(os.getcwd())
    ssot_path = repo_path(resolved_base, UNIVERSAL_SCHEMA_CONFIG_REL)
    if os.path.exists(ssot_path):
        try:
            with open(ssot_path, "r", encoding="utf-8") as handle:
                text = handle.read()
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(text)
            return
        except Exception:
            pass
    schema: Dict[str, Any] = {
        "nodeStyles": {},
        "edgeStyles": {},
        "rules": [],
        "metadata": {
            "agenticRagSchema": DEFAULT_AGENTIC_RAG_SCHEMA_URL,
            "generatedBy": "knowgrph_parser.python_codebase_index_document.ensure_schema_config_file",
        },
        "catalog": {"nodeTypes": [], "edgeLabels": []},
        "propertySchemas": {"node": {}, "edge": {}},
        "serialization": {"context": {"@vocab": DEFAULT_TERM_IRI_BASE, "schema": "https://schema.org/", "name": "schema:name"}},
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(schema, handle, ensure_ascii=False, indent=2)


def build_python_codebase_orchestrator_config_object(
    *,
    base_dir: str,
    parser_entrypoint: str,
    codebase_root: str,
    index_jsonld_path: str,
    schema_config_path: str,
    traversal_edges: List[str],
    ignore_patterns: List[str],
    graph_id: str = "codebase-index",
    agentic_rag_schema_url: str = DEFAULT_AGENTIC_RAG_SCHEMA_URL,
) -> Dict[str, Any]:
    def rel_or_abs(path: str) -> str:
        try:
            return normalize_rel_path(os.path.relpath(path, base_dir))
        except Exception:
            return normalize_rel_path(path)

    parser_value = str(parser_entrypoint or "").strip()
    if parser_value and os.path.exists(parser_value):
        parser_value = rel_or_abs(parser_value)

    ignore_list = [p for p in ignore_patterns if isinstance(p, str) and p.strip()]
    cfg: Dict[str, Any] = {
        "graph": {
            "id": graph_id,
            "codebase_root": rel_or_abs(codebase_root),
            "index_jsonld": rel_or_abs(index_jsonld_path),
            "index_schema": rel_or_abs(schema_config_path),
        },
        "orchestrator": {"parser_script": parser_value},
        "agentic_rag": {
            "schema": agentic_rag_schema_url,
            "node_view_type": "AgenticRagNodeView",
            "primary_fields": ["chunk_text", "embedding", "provenance"],
            "traversal_edges": traversal_edges or ["imports", "contains", "calls"],
            "ignore_codebase_paths": ignore_list,
        },
    }
    return cfg


def build_python_codebase_orchestrator_config_yaml(
    *,
    base_dir: str,
    parser_entrypoint: str,
    codebase_root: str,
    index_jsonld_path: str,
    schema_config_path: str,
    traversal_edges: List[str],
    ignore_patterns: List[str],
    graph_id: str = "codebase-index",
    agentic_rag_schema_url: str = DEFAULT_AGENTIC_RAG_SCHEMA_URL,
) -> str:
    cfg = build_python_codebase_orchestrator_config_object(
        base_dir=base_dir,
        parser_entrypoint=parser_entrypoint,
        codebase_root=codebase_root,
        index_jsonld_path=index_jsonld_path,
        schema_config_path=schema_config_path,
        traversal_edges=traversal_edges,
        ignore_patterns=ignore_patterns,
        graph_id=graph_id,
        agentic_rag_schema_url=agentic_rag_schema_url,
    )

    lines: List[str] = []
    lines.append("graph:")
    for k in ["id", "codebase_root", "index_jsonld", "index_schema"]:
        lines.append(f"  {k}: {cfg['graph'][k]}")
    lines.append("")
    lines.append("orchestrator:")
    lines.append(f"  parser_script: {cfg['orchestrator']['parser_script']}")
    lines.append("")
    lines.append("agentic_rag:")
    lines.append(f"  schema: {cfg['agentic_rag']['schema']}")
    lines.append(f"  node_view_type: {cfg['agentic_rag']['node_view_type']}")
    lines.append("  primary_fields:")
    for item in cfg["agentic_rag"]["primary_fields"]:
        lines.append(f"    - {item}")
    lines.append("  traversal_edges:")
    for edge in cfg["agentic_rag"]["traversal_edges"]:
        lines.append(f"    - {edge}")
    lines.append("  ignore_codebase_paths:")
    for pattern in cfg["agentic_rag"]["ignore_codebase_paths"]:
        lines.append(f"    - {pattern}")
    return "\n".join(lines).rstrip() + "\n"


def ensure_orchestrator_config_file(
    path: str,
    *,
    base_dir: str,
    parser_entrypoint: str,
    codebase_root: str,
    index_jsonld_path: str,
    schema_config_path: str,
    traversal_edges: List[str],
    ignore_patterns: List[str],
    graph_id: str = "codebase-index",
) -> None:
    if os.path.exists(path):
        return
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    lowered = path.lower()
    if lowered.endswith(".json") or lowered.endswith(".jsonld") or lowered.endswith(".json-ld"):
        cfg = build_python_codebase_orchestrator_config_object(
            base_dir=base_dir,
            parser_entrypoint=parser_entrypoint,
            codebase_root=codebase_root,
            index_jsonld_path=index_jsonld_path,
            schema_config_path=schema_config_path,
            traversal_edges=traversal_edges,
            ignore_patterns=ignore_patterns,
            graph_id=graph_id,
        )
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(cfg, handle, ensure_ascii=False, indent=2)
        return
    text = build_python_codebase_orchestrator_config_yaml(
        base_dir=base_dir,
        parser_entrypoint=parser_entrypoint,
        codebase_root=codebase_root,
        index_jsonld_path=index_jsonld_path,
        schema_config_path=schema_config_path,
        traversal_edges=traversal_edges,
        ignore_patterns=ignore_patterns,
        graph_id=graph_id,
    )
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def resolve_default_ignore_patterns() -> Tuple[List[str], List[str]]:
    raw = ["dir:.git", "dir:.venv", "dir:__pycache__"]
    resolved: List[str] = []
    for value in raw:
        from .codebase_index_config import resolve_ignore_pattern

        item = resolve_ignore_pattern(value)
        if item:
            resolved.append(item)
    return raw, resolved
