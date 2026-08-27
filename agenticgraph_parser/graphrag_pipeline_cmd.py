import argparse
import json
import os
import subprocess
from typing import Any, Dict, List, Optional, Sequence

try:
    import yaml  # type: ignore
except Exception:
    yaml = None

from .config_paths import GRAPHRAG_CONFIG_REL, repo_path
from .pipeline_cmd import write_a0_csv, write_jsonld

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DEFAULT_OUTPUT_DIR = os.path.join(DATA_DIR, "graphrag")
DEFAULT_INPUT_DIR = os.path.join(DATA_DIR, "raw")
DEFAULT_CONFIG = repo_path(BASE_DIR, GRAPHRAG_CONFIG_REL)


def ensure_output_dir(out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)


def load_yaml(path: str) -> Dict[str, Any]:
    if not yaml:
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        data: Any = yaml.safe_load(handle) or {}
    return data if isinstance(data, dict) else {}


def run_graphrag(config_path: str, input_dir: str, out_dir: str) -> None:
    cmd = ["graphrag", "index", "--root", input_dir, "--config", config_path]
    try:
        subprocess.run(cmd, check=True)
    except Exception:
        pass
    os.makedirs(out_dir, exist_ok=True)


def read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, obj: Any) -> str:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(obj, handle, ensure_ascii=False, indent=2)
    return path


def to_graphrag_workflow_from_yaml(cfg: Dict[str, Any], graph_id: str) -> Dict[str, Any]:
    root = cfg or {}
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
    safe_graph_id = graph_id.strip() if graph_id and isinstance(graph_id, str) else "graph"
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


def to_graphdata_from_graphrag(obj: Dict[str, Any]) -> Dict[str, Any]:
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    ent = obj.get("entities") or []
    rel = obj.get("relationships") or []
    chunks = obj.get("chunks") or []
    for e in ent:
        nid = str(e.get("id") or e.get("name") or f"entity-{len(nodes)}")
        label = str(e.get("name") or nid)
        ntype = str(e.get("type") or "Entity")
        props = dict(e.get("properties") or {})
        nodes.append({"id": nid, "label": label, "type": ntype, "properties": props})
    for c in chunks:
        cid = str(c.get("id") or f"chunk-{len(nodes)}")
        label = str(c.get("label") or c.get("title") or f"Chunk {cid}")
        props = dict(c)
        nodes.append({"id": cid, "label": label, "type": "Chunk", "properties": props})
    for r in rel:
        sid = str(r.get("source") or r.get("from") or "")
        tid = str(r.get("target") or r.get("to") or "")
        if not sid or not tid:
            continue
        rid = str(r.get("id") or f"{sid}-{tid}-{len(edges)}")
        label = str(r.get("label") or r.get("type") or "relatedTo")
        props = dict(r.get("properties") or {})
        edges.append({"id": rid, "source": sid, "target": tid, "label": label, "properties": props})
    return {"context": "graphrag", "type": "Graph", "nodes": nodes, "edges": edges}


def read_graphrag_bundle(out_dir: str) -> Dict[str, Any]:
    bundle_path = os.path.join(out_dir, "graph_bundle.json")
    graph_path = os.path.join(out_dir, "graph.json")
    if os.path.exists(graph_path):
        value = read_json(graph_path)
        return value if isinstance(value, dict) else {"entities": [], "relationships": [], "chunks": []}
    if os.path.exists(bundle_path):
        value = read_json(bundle_path)
        return value if isinstance(value, dict) else {"entities": [], "relationships": [], "chunks": []}
    return {"entities": [], "relationships": [], "chunks": []}


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="graphrag-pipeline", add_help=True)
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--input", default=DEFAULT_INPUT_DIR)
    parser.add_argument("--out", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--graph-id", default="graph")
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    out_dir = os.path.abspath(str(arguments.out))
    ensure_output_dir(out_dir)
    config_path = os.path.abspath(str(arguments.config))
    input_dir = os.path.abspath(str(arguments.input))
    graph_id = str(arguments.graph_id or "").strip() or "graph"

    cfg = load_yaml(config_path)
    workflow_doc = to_graphrag_workflow_from_yaml(cfg, graph_id)
    try:
        write_json(os.path.join(out_dir, "graphrag-workflow.jsonld"), workflow_doc)
    except Exception:
        pass

    run_graphrag(config_path, input_dir, out_dir)

    graph_obj = read_graphrag_bundle(out_dir)
    data = to_graphdata_from_graphrag(graph_obj)
    write_json(os.path.join(out_dir, "graph.json"), data)

    embeddings_path = os.path.join(out_dir, "embeddings.json")
    if os.path.exists(embeddings_path):
        em = read_json(embeddings_path)
        write_json(os.path.join(out_dir, "embeddings.json"), em)

    outputs_dir = os.path.join(BASE_DIR, "data", "outputs")
    os.makedirs(outputs_dir, exist_ok=True)
    nodes = data.get("nodes", []) if isinstance(data, dict) else []
    edges = data.get("edges", []) if isinstance(data, dict) else []
    safe_nodes = nodes if isinstance(nodes, list) else []
    safe_edges = edges if isinstance(edges, list) else []
    write_a0_csv(outputs_dir, safe_nodes, safe_edges)
    write_jsonld(outputs_dir, safe_nodes, safe_edges)

    return 0
