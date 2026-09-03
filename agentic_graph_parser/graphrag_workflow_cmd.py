import argparse
import json
import os
from typing import Any, Dict, Optional, Sequence

try:
    import yaml  # type: ignore
except Exception:
    yaml = None

from .config_paths import (
    GRAPHRAG_CONFIG_REL,
    UNIVERSAL_ORCHESTRATOR_CONFIG_REL,
    repo_path,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DEFAULT_CONFIG = repo_path(BASE_DIR, GRAPHRAG_CONFIG_REL)
DEFAULT_GRAPH_ID = "codebase-index"
DEFAULT_OUTPUT = os.path.join(BASE_DIR, "data", "graphrag", "graphrag-workflow.jsonld")
DEFAULT_ORCHESTRATOR = repo_path(BASE_DIR, UNIVERSAL_ORCHESTRATOR_CONFIG_REL)


def load_yaml(path: str) -> Dict[str, Any]:
    if not yaml:
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        data: Any = yaml.safe_load(handle)
    return data if isinstance(data, dict) else {}


def ensure_parent_dir(path: str) -> None:
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def write_json(path: str, obj: Any) -> str:
    ensure_parent_dir(path)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(obj, handle, ensure_ascii=False, indent=2)
    return path


def to_graphrag_workflow_from_yaml(cfg: Dict[str, Any], graph_id: str) -> Dict[str, Any]:
    root: Dict[str, Any] = cfg or {}
    if not isinstance(root, dict):
        root = {}
    dataset = root.get("dataset") or {}
    if not isinstance(dataset, dict):
        dataset = {}
    chunking = root.get("chunking") or {}
    if not isinstance(chunking, dict):
        chunking = {}
    embeddings = root.get("embeddings") or {}
    if not isinstance(embeddings, dict):
        embeddings = {}
    safe_graph_id = graph_id.strip() if isinstance(graph_id, str) and graph_id.strip() else "graph"
    doc: Dict[str, Any] = {
        "@context": {
            "rag": "http://example.org/rag#",
        },
        "@type": "rag:GraphRAGWorkflow",
        "@id": f"example:graphrag-config-{safe_graph_id}",
        "graphId": safe_graph_id,
        "name": "GraphRAG Workflow",
        "retrievalMethod": "graph-traversal",
        "maxHops": 3,
        "traversalRules": [],
        "contextWindow": {
            "@type": "rag:ContextWindow",
            "contextSize": 8192,
            "contextStrategy": "ranked-by-relevance",
        },
    }
    dataset_cfg: Dict[str, Any] = {}
    input_dir = dataset.get("input_dir")
    output_dir = dataset.get("output_dir")
    if isinstance(input_dir, str) and input_dir:
        dataset_cfg["inputDir"] = input_dir
    if isinstance(output_dir, str) and output_dir:
        dataset_cfg["outputDir"] = output_dir
    if dataset_cfg:
        doc["dataset"] = dataset_cfg
    chunking_cfg: Dict[str, Any] = {
        "@type": "rag:ChunkingConfig",
    }
    method = chunking.get("method")
    if isinstance(method, str) and method:
        chunking_cfg["method"] = method
    size_value = chunking.get("chunk_size")
    if isinstance(size_value, (int, float)) and size_value == size_value:
        chunking_cfg["chunkSize"] = int(size_value)
    if len(chunking_cfg) > 1:
        doc["chunking"] = chunking_cfg
    embedding_cfg: Dict[str, Any] = {
        "@type": "rag:EmbeddingModel",
    }
    provider = embeddings.get("provider")
    model = embeddings.get("model")
    if isinstance(provider, str) and provider:
        embedding_cfg["provider"] = provider
    if isinstance(model, str) and model:
        embedding_cfg["modelName"] = model
    if len(embedding_cfg) > 1:
        doc["embeddingModel"] = embedding_cfg
    return doc


def update_orchestrator_config(
    orchestrator_path: str,
    workflow_json_rel: str,
    graphrag_config_rel: str,
) -> None:
    if not os.path.exists(orchestrator_path):
        return
    lowered = orchestrator_path.lower()
    if lowered.endswith(".json") or lowered.endswith(".jsonld") or lowered.endswith(".json-ld"):
        try:
            with open(orchestrator_path, "r", encoding="utf-8") as handle:
                data: Any = json.load(handle)
        except Exception:
            data = {}
        if not isinstance(data, dict):
            data = {}
        graph_block = data.get("graph")
        if not isinstance(graph_block, dict):
            graph_block = {}
        graph_block["workflow_json"] = workflow_json_rel
        if "graphrag_workflow" not in graph_block or not graph_block["graphrag_workflow"]:
            graph_block["graphrag_workflow"] = graphrag_config_rel
        data["graph"] = graph_block
        with open(orchestrator_path, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
        return
    if not yaml:
        return
    with open(orchestrator_path, "r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        data = {}
    graph_block = data.get("graph")
    if not isinstance(graph_block, dict):
        graph_block = {}
    graph_block["workflow_json"] = workflow_json_rel
    if "graphrag_workflow" not in graph_block or not graph_block["graphrag_workflow"]:
        graph_block["graphrag_workflow"] = graphrag_config_rel
    data["graph"] = graph_block
    with open(orchestrator_path, "w", encoding="utf-8") as handle:
        yaml.safe_dump(data, handle, default_flow_style=False, sort_keys=False)


def main(argv: Optional[Sequence[str]] = None, *, base_dir: str = BASE_DIR) -> int:
    parser = argparse.ArgumentParser(prog="graphrag-workflow", add_help=True)
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--graph-id", default=DEFAULT_GRAPH_ID)
    parser.add_argument("--out", default=DEFAULT_OUTPUT)
    parser.add_argument("--orchestrator", default=DEFAULT_ORCHESTRATOR)
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    config_path = os.path.abspath(str(arguments.config))
    graph_id = str(arguments.graph_id or "").strip() or DEFAULT_GRAPH_ID
    out_path = os.path.abspath(str(arguments.out))
    orchestrator_path = os.path.abspath(str(arguments.orchestrator)) if arguments.orchestrator else ""

    cfg = load_yaml(config_path)
    workflow_doc = to_graphrag_workflow_from_yaml(cfg, graph_id)
    write_json(out_path, workflow_doc)

    if orchestrator_path:
        try:
            workflow_rel = os.path.relpath(out_path, base_dir).replace(os.sep, "/")
            config_rel = os.path.relpath(config_path, base_dir).replace(os.sep, "/")
        except Exception:
            workflow_rel = out_path
            config_rel = config_path
        update_orchestrator_config(orchestrator_path, workflow_rel, config_rel)

    return 0
