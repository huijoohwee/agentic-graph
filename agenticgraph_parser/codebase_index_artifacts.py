import os
from typing import Any, Dict, List

from .codebase_index_config import load_yaml, build_ignore_matcher


def normalize_rel_path(path: str) -> str:
    return path.replace("\\", "/")


def ensure_node(document: Dict[str, Any], rel_path: str, node_type: str) -> Dict[str, Any]:
    graph = document.setdefault("@graph", [])
    for node in graph:
        node_path = node.get("path")
        if isinstance(node_path, str) and normalize_rel_path(node_path) == rel_path:
            return node
    name = os.path.basename(rel_path) or rel_path
    node: Dict[str, Any] = {
        "@id": f"kg:{rel_path}",
        "@type": node_type,
        "name": name,
        "path": rel_path,
    }
    graph.append(node)
    return node


def append_relation(node: Dict[str, Any], label: str, target_id: str) -> None:
    existing = node.get(label)
    if isinstance(existing, list):
        if target_id in existing:
            return
        existing.append(target_id)
        return
    node[label] = [target_id]


def append_orchestrator_config(
    document: Dict[str, Any],
    config_path: str,
    ignored_paths: List[str],
    *,
    base_dir: str,
    parser_script_path: str,
) -> str:
    if not config_path or not os.path.exists(config_path):
        return ""
    ignore_match = build_ignore_matcher(ignored_paths)
    config = load_yaml(config_path)
    if not config:
        return ""
    graph_cfg = config.get("graph") or {}
    if not isinstance(graph_cfg, dict):
        graph_cfg = {}
    workflow_json_value = graph_cfg.get("workflow_json")
    index_jsonld_value = graph_cfg.get("index_jsonld")
    orchestrator_cfg = config.get("orchestrator") or {}
    if not isinstance(orchestrator_cfg, dict):
        orchestrator_cfg = {}
    parser_script_value = orchestrator_cfg.get("parser_script")
    pipeline_artifacts = orchestrator_cfg.get("pipeline_artifacts") or {}
    if not isinstance(pipeline_artifacts, dict):
        pipeline_artifacts = {}
    workflow_rel = ""
    index_rel = ""
    parser_script_rel = ""
    nodes_csv_rel = ""
    edges_csv_rel = ""
    summary_json_rel = ""
    if isinstance(workflow_json_value, str) and workflow_json_value:
        workflow_rel = normalize_rel_path(workflow_json_value)
    if isinstance(index_jsonld_value, str) and index_jsonld_value:
        index_rel = normalize_rel_path(index_jsonld_value)
    if isinstance(parser_script_value, str) and parser_script_value:
        parser_script_rel = normalize_rel_path(parser_script_value)
    nodes_csv_value = pipeline_artifacts.get("nodes_csv")
    edges_csv_value = pipeline_artifacts.get("edges_csv")
    summary_json_value = pipeline_artifacts.get("summary_json")
    if isinstance(nodes_csv_value, str) and nodes_csv_value:
        nodes_csv_rel = normalize_rel_path(nodes_csv_value)
    if isinstance(edges_csv_value, str) and edges_csv_value:
        edges_csv_rel = normalize_rel_path(edges_csv_value)
    if isinstance(summary_json_value, str) and summary_json_value:
        summary_json_rel = normalize_rel_path(summary_json_value)
    config_rel = normalize_rel_path(os.path.relpath(config_path, base_dir))
    allow_config = bool(config_rel and not ignore_match(config_rel))
    allow_workflow = bool(workflow_rel and not ignore_match(workflow_rel))
    allow_index = bool(index_rel and not ignore_match(index_rel))
    allow_nodes_csv = bool(nodes_csv_rel and not ignore_match(nodes_csv_rel))
    allow_edges_csv = bool(edges_csv_rel and not ignore_match(edges_csv_rel))
    allow_summary_json = bool(summary_json_rel and not ignore_match(summary_json_rel))
    allow_parser_script = bool(parser_script_rel and not ignore_match(parser_script_rel))
    if allow_config:
        ensure_node(document, config_rel, "Artifact")
    if allow_workflow:
        ensure_node(document, workflow_rel, "Artifact")
    if allow_index:
        ensure_node(document, index_rel, "Artifact")
    if allow_nodes_csv:
        ensure_node(document, nodes_csv_rel, "Artifact")
    if allow_edges_csv:
        ensure_node(document, edges_csv_rel, "Artifact")
    if allow_summary_json:
        ensure_node(document, summary_json_rel, "Artifact")
    if allow_parser_script:
        script_rel = normalize_rel_path(os.path.relpath(parser_script_path, base_dir))
        if script_rel and not ignore_match(script_rel):
            parser_node = ensure_node(document, script_rel, "File")
            if allow_workflow:
                append_relation(parser_node, "consumesInput", f"kg:{workflow_rel}")
            if allow_nodes_csv:
                append_relation(parser_node, "producesOutput", f"kg:{nodes_csv_rel}")
            if allow_edges_csv:
                append_relation(parser_node, "producesOutput", f"kg:{edges_csv_rel}")
            if allow_summary_json:
                append_relation(parser_node, "producesOutput", f"kg:{summary_json_rel}")
            return script_rel
    return ""


def append_graphrag_workflow(
    document: Dict[str, Any],
    workflow_rel: str,
    ignored_paths: List[str],
) -> None:
    ignore_match = build_ignore_matcher(ignored_paths)
    if not workflow_rel:
        return
    if ignore_match(workflow_rel):
        return
    config_node = ensure_node(document, workflow_rel, "Artifact")
    output_rel = normalize_rel_path("data/graphrag/graphrag-workflow.jsonld")
    if ignore_match(output_rel):
        return
    output_node = ensure_node(document, output_rel, "Artifact")
    pipeline_node = ensure_node(document, "knowgrph_parser/graphrag_pipeline_cmd.py", "File")
    append_relation(pipeline_node, "consumesInput", config_node["@id"])
    append_relation(pipeline_node, "producesOutput", output_node["@id"])
    root_pipeline = ensure_node(document, "knowgrph_parser/pipeline_cmd.py", "File")
    append_relation(root_pipeline, "invokes", pipeline_node["@id"])
