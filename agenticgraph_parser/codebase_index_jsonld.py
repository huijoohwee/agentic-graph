from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .common import (
    DEFAULT_AGENTIC_RAG_SCHEMA_URL,
    DEFAULT_TERM_IRI_BASE,
    KG_PREFIX,
)
from .codebase_index_artifacts import normalize_rel_path
from .codebase_index_config import build_ignore_matcher
from .runtime_events import add_runtime_events


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def build_jsonld(
    graph: Dict[str, Any],
    *,
    codebase_id: str,
    traversal_edges: List[str],
    ignored_paths: List[str],
    raw_ignored_patterns: List[str],
    runtime_event_specs: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    ignore_match = build_ignore_matcher(ignored_paths)
    nodes_value = graph.get("nodes") or []
    edges_value = graph.get("edges") or []
    if not isinstance(nodes_value, list):
        nodes_value = []
    if not isinstance(edges_value, list):
        edges_value = []
    id_to_node: Dict[str, Dict[str, Any]] = {}
    canonical_node_id_by_input_id: Dict[str, str] = {}
    timestamp = utc_timestamp()
    for raw_node in nodes_value:
        if not isinstance(raw_node, dict):
            continue
        raw_id = raw_node.get("id")
        original_node_id = str(raw_id) if raw_id is not None else ""
        if not original_node_id:
            continue
        raw_data = raw_node.get("data") or {}
        if not isinstance(raw_data, dict):
            raw_data = {}
        node_type = str(raw_data.get("type") or "Entity")
        raw_name = raw_data.get("name") or original_node_id
        name = str(raw_name)
        node_obj: Dict[str, Any] = {
            "@id": f"{KG_PREFIX}{original_node_id}",
            "@type": node_type,
            "name": name,
        }
        chunk_text_value = raw_data.get("chunk_text")
        if isinstance(chunk_text_value, str) and chunk_text_value.strip():
            node_obj["chunk_text"] = chunk_text_value
        raw_path = raw_data.get("path")
        if isinstance(raw_path, str) and raw_path:
            if ignore_match(raw_path):
                continue
            node_obj["path"] = normalize_rel_path(raw_path).lstrip("./")
        node_id = original_node_id
        if node_type == "File" and isinstance(node_obj.get("path"), str) and node_obj["path"]:
            node_id = node_obj["path"]
        if node_id != original_node_id:
            canonical_node_id_by_input_id[original_node_id] = node_id
            node_obj["@id"] = f"{KG_PREFIX}{node_id}"
        owner_value = raw_data.get("owner")
        if isinstance(owner_value, str) and owner_value:
            node_obj["owner"] = owner_value
        coverage_value = raw_data.get("testCoverage")
        coverage_number = None
        if isinstance(coverage_value, (int, float, str)):
            try:
                coverage_number = float(coverage_value)
            except (TypeError, ValueError):
                coverage_number = None
        if coverage_number is not None:
            node_obj["testCoverage"] = coverage_number
        graph_rag_path = raw_data.get("graphRAGPath")
        if isinstance(graph_rag_path, dict):
            node_obj["graphRAGPath"] = graph_rag_path
            chunk_text_parts: List[str] = []
            query_value = graph_rag_path.get("query")
            if isinstance(query_value, str) and query_value:
                chunk_text_parts.append(f"Query: {query_value}")
            traverse_value = graph_rag_path.get("traverse")
            if isinstance(traverse_value, list) and traverse_value:
                traverse_items: List[str] = []
                for item in traverse_value:
                    if item is None:
                        continue
                    item_text = str(item)
                    if not item_text:
                        continue
                    traverse_items.append(item_text)
                if traverse_items:
                    chunk_text_parts.append("Traverse: " + " -> ".join(traverse_items))
            example_value = graph_rag_path.get("example")
            if isinstance(example_value, str) and example_value:
                chunk_text_parts.append(f"Example: {example_value}")
            multi_hop_value = graph_rag_path.get("multiHop")
            if isinstance(multi_hop_value, list) and multi_hop_value:
                hop_items: List[str] = []
                for item in multi_hop_value:
                    item_text = str(item).strip()
                    if item_text:
                        hop_items.append(item_text)
                if hop_items:
                    chunk_text_parts.append("Steps: " + " | ".join(hop_items))
            context_value = graph_rag_path.get("context")
            if isinstance(context_value, str) and context_value:
                chunk_text_parts.append(f"Context: {context_value}")
            if chunk_text_parts:
                node_obj["chunk_text"] = " | ".join(chunk_text_parts)
        provenance: Dict[str, Any] = {}
        provenance["source"] = "knowgrph-codebase-index"
        provenance["timestamp"] = timestamp
        node_codebase_id = ""
        raw_codebase_id = raw_data.get("codebaseId")
        if isinstance(raw_codebase_id, str) and raw_codebase_id:
            node_codebase_id = raw_codebase_id
        elif codebase_id:
            node_codebase_id = codebase_id
        if node_codebase_id:
            provenance["codebaseId"] = node_codebase_id
        if isinstance(raw_path, str) and raw_path:
            rel_path = normalize_rel_path(raw_path).lstrip("./")
            provenance["codebasePath"] = rel_path
            area = rel_path.split("/", 1)[0] if "/" in rel_path else ""
            if area:
                provenance["codebaseArea"] = area
        if isinstance(owner_value, str) and owner_value:
            provenance["curator"] = owner_value
        if coverage_number is not None:
            provenance["coverage"] = coverage_number
            provenance["confidence"] = max(0.0, min(1.0, coverage_number / 100.0))
        if provenance:
            node_obj["metadata"] = provenance
        existing = id_to_node.get(node_id)
        if existing:
            existing_name = existing.get("name")
            if (
                isinstance(existing_name, str)
                and existing_name.strip() == node_id
                and name
                and name.strip() != node_id
            ):
                existing["name"] = name
            if "path" in node_obj and "path" not in existing:
                existing["path"] = node_obj["path"]
            if "owner" in node_obj and "owner" not in existing:
                existing["owner"] = node_obj["owner"]
            existing_coverage = existing.get("testCoverage")
            if isinstance(coverage_number, (int, float)):
                if not isinstance(existing_coverage, (int, float)) or float(coverage_number) > float(existing_coverage):
                    existing["testCoverage"] = float(coverage_number)
            existing_graphrag = existing.get("graphRAGPath")
            incoming_graphrag = node_obj.get("graphRAGPath")
            if isinstance(incoming_graphrag, dict):
                if not isinstance(existing_graphrag, dict) or len(incoming_graphrag) > len(existing_graphrag):
                    existing["graphRAGPath"] = incoming_graphrag
                    if "chunk_text" in node_obj:
                        existing["chunk_text"] = node_obj["chunk_text"]
            existing_meta = existing.get("metadata")
            incoming_meta = node_obj.get("metadata")
            if isinstance(existing_meta, dict) and isinstance(incoming_meta, dict):
                existing_cov = existing_meta.get("coverage")
                incoming_cov = incoming_meta.get("coverage")
                if isinstance(incoming_cov, (int, float)):
                    if not isinstance(existing_cov, (int, float)) or float(incoming_cov) > float(existing_cov):
                        existing_meta["coverage"] = float(incoming_cov)
                existing_conf = existing_meta.get("confidence")
                incoming_conf = incoming_meta.get("confidence")
                if isinstance(incoming_conf, (int, float)):
                    if not isinstance(existing_conf, (int, float)) or float(incoming_conf) > float(existing_conf):
                        existing_meta["confidence"] = float(incoming_conf)
                for key, value in incoming_meta.items():
                    if key in {"coverage", "confidence"}:
                        continue
                    if key not in existing_meta and value is not None:
                        existing_meta[key] = value
        else:
            id_to_node[node_id] = node_obj
    outgoing: Dict[str, Dict[str, List[str]]] = {}
    edge_labels: List[str] = []
    for raw_edge in edges_value:
        if not isinstance(raw_edge, dict):
            continue
        source_value = raw_edge.get("source")
        target_value = raw_edge.get("target")
        source_id = str(source_value) if source_value is not None else ""
        target_id = str(target_value) if target_value is not None else ""
        if not source_id or not target_id:
            continue
        source_id = canonical_node_id_by_input_id.get(source_id, source_id)
        target_id = canonical_node_id_by_input_id.get(target_id, target_id)
        if source_id not in id_to_node or target_id not in id_to_node:
            continue
        raw_data = raw_edge.get("data") or {}
        if not isinstance(raw_data, dict):
            raw_data = {}
        label_value = raw_data.get("type") or "relatedTo"
        label = str(label_value)
        if label:
            edge_labels.append(label)
        source_map = outgoing.setdefault(source_id, {})
        targets = source_map.setdefault(label, [])
        if target_id not in targets:
            targets.append(target_id)
    for node_id, predicates in outgoing.items():
        node_obj = id_to_node.get(node_id)
        if not node_obj:
            continue
        for label, targets in predicates.items():
            if not targets or not label:
                continue
            node_obj[label] = [f"kg:{target_id}" for target_id in targets]
    unique_labels = sorted({label for label in edge_labels if label})
    if runtime_event_specs:
        add_runtime_events(id_to_node, timestamp, runtime_event_specs)
    context: Dict[str, Any] = {
        "@vocab": DEFAULT_TERM_IRI_BASE,
        "schema": "https://schema.org/",
        "name": "schema:name",
        "path": "schema:path",
        "owner": "schema:owner",
        "testCoverage": "schema:testCoverage",
        "graphRAGPath": "schema:graphRAGPath",
        "hasRuntimeEvent": {"@id": f"{DEFAULT_TERM_IRI_BASE}hasRuntimeEvent", "@type": "@id"},
        "runtimeOf": {"@id": f"{DEFAULT_TERM_IRI_BASE}runtimeOf", "@type": "@id"},
        "eventType": f"{DEFAULT_TERM_IRI_BASE}eventType",
        "status": f"{DEFAULT_TERM_IRI_BASE}status",
        "durationMs": f"{DEFAULT_TERM_IRI_BASE}durationMs",
        "occurredAt": f"{DEFAULT_TERM_IRI_BASE}occurredAt",
        "stackTraceSnippet": f"{DEFAULT_TERM_IRI_BASE}stackTraceSnippet",
    }
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
        "source": "knowgrph-codebase-traversal",
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
        "indexing": {"description": "Static codebase index of files, modules, artifacts, stores, and panel systems."},
        "traversal": {"edgeLabels": selected_relations or unique_labels},
        "tracing": {
            "eventTypes": ["call", "return", "exception"],
            "linkProperties": ["hasRuntimeEvent", "runtimeOf"],
        },
    }
    return {"@context": context, "@graph": list(id_to_node.values()), "metadata": metadata}
