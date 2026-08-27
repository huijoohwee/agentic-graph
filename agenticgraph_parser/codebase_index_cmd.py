import argparse
import json
import os
from typing import Any, Dict, List, Optional, Sequence

from .codebase_index_artifacts import append_graphrag_workflow, append_orchestrator_config
from .codebase_index_config import (
    extract_graphrag_workflow_config,
    extract_ignored_paths,
    extract_traversal_edges,
    load_yaml,
)
from .codebase_index_jsonld import build_jsonld
from .config_paths import UNIVERSAL_ORCHESTRATOR_CONFIG_REL, repo_path
from .runtime_events import load_runtime_events_from_log


def load_graph(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        data: Any = json.load(handle)
    if isinstance(data, dict):
        return data
    return {}


def ensure_output_dir(path: str) -> None:
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)


def main(argv: Optional[Sequence[str]] = None, *, base_dir: str, parser_script_path: str) -> int:
    input_default = os.path.join(base_dir, "data", "outputs", "knowgrph-workflow.json")
    output_default = os.path.join(base_dir, "data", "outputs", "codebase-index-viz.jsonld")
    runtime_events_log_default = os.path.join(base_dir, "data", "outputs", "runtime-events.jsonl")
    orchestrator_config_default = repo_path(base_dir, UNIVERSAL_ORCHESTRATOR_CONFIG_REL)
    parser = argparse.ArgumentParser(prog="parse-codebase-index", add_help=True)
    parser.add_argument("--input", "-i", default=input_default)
    parser.add_argument("--output", "-o", default=output_default)
    parser.add_argument("--config", "-c", default=orchestrator_config_default)
    parser.add_argument("--codebase-id", "-b", default="knowgrph")
    parser.add_argument("--runtime-events-log", "-r", action="append", default=[])
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    input_path = os.path.abspath(str(arguments.input))
    output_path = os.path.abspath(str(arguments.output))
    config_path = os.path.abspath(str(arguments.config)) if getattr(arguments, "config", None) else ""
    codebase_id = str(arguments.codebase_id or "").strip() or "codebase"
    runtime_logs_raw = getattr(arguments, "runtime_events_log", None) or []
    runtime_logs: List[str] = []
    if isinstance(runtime_logs_raw, list):
        for item in runtime_logs_raw:
            if isinstance(item, str) and item.strip():
                runtime_logs.append(os.path.abspath(item.strip()))
    if not runtime_logs:
        runtime_logs = [runtime_events_log_default]

    traversal_edges: List[str] = []
    ignored_paths: List[str] = []
    raw_ignored_patterns: List[str] = []
    graphrag_workflow_rel = ""
    if config_path and os.path.exists(config_path):
        config = load_yaml(config_path)
        graph_cfg = config.get("graph") or {}
        if not isinstance(graph_cfg, dict):
            graph_cfg = {}
        workflow_json_value = graph_cfg.get("workflow_json")
        index_jsonld_value = graph_cfg.get("index_jsonld")
        if isinstance(workflow_json_value, str) and workflow_json_value and input_path == os.path.abspath(input_default):
            input_path = os.path.abspath(os.path.join(base_dir, workflow_json_value))
        if isinstance(index_jsonld_value, str) and index_jsonld_value and output_path == os.path.abspath(output_default):
            output_path = os.path.abspath(os.path.join(base_dir, index_jsonld_value))
        traversal_edges = extract_traversal_edges(config)
        raw_ignored_patterns, ignored_paths = extract_ignored_paths(config)
        graphrag_workflow_rel = extract_graphrag_workflow_config(config)

    runtime_specs: List[Dict[str, Any]] = []
    for log_path in runtime_logs:
        runtime_specs.extend(load_runtime_events_from_log(log_path))

    graph = load_graph(input_path)
    document = build_jsonld(
        graph,
        codebase_id=codebase_id,
        traversal_edges=traversal_edges,
        ignored_paths=ignored_paths,
        raw_ignored_patterns=raw_ignored_patterns,
        runtime_event_specs=runtime_specs,
    )

    if config_path and os.path.exists(config_path):
        append_orchestrator_config(
            document,
            config_path,
            ignored_paths,
            base_dir=base_dir,
            parser_script_path=parser_script_path,
        )
        if graphrag_workflow_rel:
            append_graphrag_workflow(document, graphrag_workflow_rel, ignored_paths)

    ensure_output_dir(output_path)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(document, handle, ensure_ascii=False, indent=2)
    print(f"Wrote codebase index JSON-LD to {output_path}")
    return 0
