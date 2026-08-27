import argparse
import json
import os
from typing import Any, Dict, List, Optional

from .codebase_index_config import (
    extract_graph_rag_paths,
    extract_ignored_paths,
    extract_traversal_edges,
    load_yaml,
)
from .config_paths import (
    UNIVERSAL_ORCHESTRATOR_CONFIG_REL,
    UNIVERSAL_SCHEMA_CONFIG_REL,
    repo_path,
)
from .python_codebase_index_document import (
    build_jsonld_document,
    ensure_orchestrator_config_file,
    ensure_schema_config_file,
    extract_runtime_event_specs,
    resolve_default_ignore_patterns,
)
from .python_codebase_index_graph import build_code_graph


def main(argv: Optional[List[str]] = None, *, base_dir: str, parser_script_path: str) -> int:
    default_index_jsonld = os.path.join(base_dir, "data", "outputs", "codebase-index-viz.jsonld")
    default_schema_config = repo_path(base_dir, UNIVERSAL_SCHEMA_CONFIG_REL)
    default_orchestrator_config = repo_path(base_dir, UNIVERSAL_ORCHESTRATOR_CONFIG_REL)

    parser = argparse.ArgumentParser(prog="python-codebase-index", add_help=True)
    parser.add_argument("--codebase-root", "-r", default=None)
    parser.add_argument("--output", "-o", default=None)
    parser.add_argument("--schema-config", "-s", default=None)
    parser.add_argument("--config", "-c", default=default_orchestrator_config)
    parser.add_argument("--codebase-id", "-b", default=None)
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    codebase_root: Optional[str] = os.path.abspath(str(arguments.codebase_root)) if arguments.codebase_root is not None else None
    index_jsonld_path: Optional[str] = os.path.abspath(str(arguments.output)) if arguments.output is not None else None
    schema_config_path: Optional[str] = os.path.abspath(str(arguments.schema_config)) if arguments.schema_config is not None else None
    orchestrator_config_path = os.path.abspath(str(arguments.config))

    traversal_edges: List[str] = ["imports", "contains", "calls"]
    graphrag_paths: List[Dict[str, Any]] = []
    runtime_event_specs: List[Dict[str, Any]] = []
    raw_ignored_patterns: List[str] = []
    ignored_paths: List[str] = []
    source_name = "codebase-index"
    if os.path.exists(orchestrator_config_path):
        config = load_yaml(orchestrator_config_path)
        graph_cfg = config.get("graph") or {}
        if isinstance(graph_cfg, dict):
            root_value = graph_cfg.get("codebase_root")
            index_value = graph_cfg.get("index_jsonld")
            schema_value = graph_cfg.get("index_schema")
            graph_id_value = graph_cfg.get("id")
            if isinstance(graph_id_value, str) and graph_id_value.strip():
                source_name = graph_id_value.strip()
            if isinstance(root_value, str) and root_value and codebase_root is None:
                codebase_root = os.path.abspath(os.path.join(base_dir, root_value))
            if isinstance(index_value, str) and index_value and index_jsonld_path is None:
                index_jsonld_path = os.path.abspath(os.path.join(base_dir, index_value))
            if isinstance(schema_value, str) and schema_value and schema_config_path is None:
                schema_config_path = os.path.abspath(os.path.join(base_dir, schema_value))
        traversal_edges = extract_traversal_edges(config) or traversal_edges
        graphrag_paths = extract_graph_rag_paths(config)
        runtime_event_specs = extract_runtime_event_specs(config)
        raw_ignored_patterns, ignored_paths = extract_ignored_paths(config)

    if codebase_root is None:
        codebase_root = os.path.abspath(os.getcwd())
    if index_jsonld_path is None:
        index_jsonld_path = os.path.abspath(str(default_index_jsonld))
    if schema_config_path is None:
        schema_config_path = os.path.abspath(str(default_schema_config))
    if not raw_ignored_patterns and not ignored_paths:
        raw_ignored_patterns, ignored_paths = resolve_default_ignore_patterns()

    nodes_by_id = build_code_graph(codebase_root, ignored_paths)
    codebase_id = (
        str(arguments.codebase_id).strip()
        if arguments.codebase_id is not None and str(arguments.codebase_id).strip()
        else os.path.basename(codebase_root.rstrip(os.sep)) or "codebase"
    )

    document = build_jsonld_document(
        nodes_by_id,
        codebase_id=codebase_id,
        source_name=source_name,
        traversal_edges=traversal_edges,
        ignored_paths=ignored_paths,
        raw_ignored_patterns=raw_ignored_patterns,
        graphrag_paths=graphrag_paths,
        runtime_event_specs=runtime_event_specs,
    )
    directory = os.path.dirname(index_jsonld_path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(index_jsonld_path, "w", encoding="utf-8") as handle:
        json.dump(document, handle, ensure_ascii=False, indent=2)
    ensure_schema_config_file(schema_config_path, base_dir=base_dir)
    ensure_orchestrator_config_file(
        orchestrator_config_path,
        base_dir=base_dir,
        parser_entrypoint=parser_script_path,
        codebase_root=codebase_root,
        index_jsonld_path=index_jsonld_path,
        schema_config_path=schema_config_path,
        traversal_edges=traversal_edges,
        ignore_patterns=raw_ignored_patterns,
    )
    print(f"Wrote codebase index JSON-LD to {index_jsonld_path}")
    print(f"Ensured schema config at {schema_config_path}")
    print(f"Ensured orchestrator config at {orchestrator_config_path}")
    return 0
