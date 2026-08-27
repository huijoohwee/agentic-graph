import argparse
import csv
import json
import os
import subprocess
import sys
import time
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .common import DEFAULT_TERM_IRI_BASE
from .config_paths import UNIVERSAL_ORCHESTRATOR_CONFIG_REL

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PYTHON_BIN = sys.executable
DEFAULT_INPUT_PATH = os.getenv("KG_INPUT_PATH", "").strip()
DEFAULT_OUTPUT_DIR = os.getenv(
    "KG_OUTPUT_DIR",
    os.path.join(BASE_DIR, "data", "outputs"),
)
DEFAULT_EMBEDDINGS_BACKEND_FILE = os.path.join(
    BASE_DIR,
    "knowgrph_parser",
    "codebase-index-embeddings-example.json",
)

CODEBASE_INDEX_ORCHESTRATOR_CONFIG_REL = os.getenv(
    "KG_CODEBASE_INDEX_ORCHESTRATOR_CONFIG",
    UNIVERSAL_ORCHESTRATOR_CONFIG_REL,
)
CODEBASE_INDEX_JSONLD_REL = os.getenv(
    "KG_CODEBASE_INDEX_JSONLD_PATH",
    "data/outputs/codebase-index-viz.jsonld",
)

A0_DEFAULT_PREDICATE = os.getenv("KG_A0_PREDICATE_DEFAULT", "relatedTo").strip() or "relatedTo"
A0_NAME_PREDICATE = os.getenv("KG_A0_NAME_PREDICATE", "hasName").strip() or "hasName"
A0_TYPE_PREDICATE = os.getenv("KG_A0_TYPE_PREDICATE", "hasType").strip() or "hasType"
A0_VOCAB_PREFIX = os.getenv("KG_A0_VOCAB_PREFIX", "kg").strip() or "kg"
A0_NAME_TERM = os.getenv("KG_A0_NAME_TERM", "name").strip() or "name"
A0_WEIGHT_TERM = os.getenv("KG_A0_WEIGHT_TERM", "weight").strip() or "weight"


def load_graph(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        data: Any = json.load(handle)
    return data if isinstance(data, dict) else {}


def ensure_output_dir(output_dir: str) -> None:
    os.makedirs(output_dir, exist_ok=True)


def append_runtime_event(
    runtime_events_log_path: str,
    key: str,
    node_id: str,
    event_type: str,
    status: str,
    duration_ms: float,
    stack_trace_snippet: str = "",
) -> None:
    try:
        os.makedirs(os.path.dirname(runtime_events_log_path), exist_ok=True)
        payload: Dict[str, Any] = {
            "key": key,
            "node_id": node_id,
            "eventType": event_type,
            "status": status,
            "durationMs": float(duration_ms),
        }
        if stack_trace_snippet:
            payload["stackTraceSnippet"] = stack_trace_snippet
        with open(runtime_events_log_path, "a", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False)
            handle.write("\n")
    except Exception:
        return


def write_a0_csv(
    output_dir: str,
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    *,
    predicate_default: str = A0_DEFAULT_PREDICATE,
) -> str:
    csv_path = os.path.join(output_dir, "a0.csv")
    fields = [
        "subject_id",
        "subject_type",
        "subject_name",
        "predicate",
        "object_id",
        "object_type",
        "object_name",
        "weight",
    ]
    with open(csv_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for node in nodes:
            node_id = node.get("id")
            data = node.get("data", {}) or {}
            node_type = data.get("type")
            node_name = data.get("name") or node_id
            writer.writerow(
                {
                    "subject_id": node_id,
                    "subject_type": node_type,
                    "subject_name": node_name,
                    "predicate": A0_NAME_PREDICATE,
                    "object_id": "",
                    "object_type": "Literal",
                    "object_name": node_name,
                    "weight": "",
                }
            )
            writer.writerow(
                {
                    "subject_id": node_id,
                    "subject_type": node_type,
                    "subject_name": node_name,
                    "predicate": A0_TYPE_PREDICATE,
                    "object_id": node_type,
                    "object_type": "Class",
                    "object_name": node_type,
                    "weight": "",
                }
            )
        for edge in edges:
            edge_data = edge.get("data", {}) or {}
            raw_predicate = edge_data.get("predicate") or edge_data.get("label") or edge_data.get("type")
            predicate = str(raw_predicate).strip() if isinstance(raw_predicate, str) else ""
            if not predicate:
                predicate = predicate_default.strip() or "relatedTo"
            writer.writerow(
                {
                    "subject_id": edge.get("source"),
                    "subject_type": "",
                    "subject_name": "",
                    "predicate": predicate,
                    "object_id": edge.get("target"),
                    "object_type": "",
                    "object_name": "",
                    "weight": str(edge_data.get("weight", "")),
                }
            )
    return csv_path


def write_jsonld(
    output_dir: str,
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    *,
    term_iri_base: str = DEFAULT_TERM_IRI_BASE,
    predicate_default: str = A0_DEFAULT_PREDICATE,
) -> str:
    vocab = str(term_iri_base or DEFAULT_TERM_IRI_BASE).strip() or DEFAULT_TERM_IRI_BASE
    prefix = A0_VOCAB_PREFIX
    context: Dict[str, Any] = {
        "@vocab": vocab,
        prefix: vocab,
        A0_NAME_TERM: f"{vocab}{A0_NAME_TERM}",
        A0_WEIGHT_TERM: f"{vocab}{A0_WEIGHT_TERM}",
    }
    id_to_node: Dict[str, Dict[str, Any]] = {}
    for node in nodes:
        node_id = node.get("id")
        if isinstance(node_id, str) and node_id:
            id_to_node[node_id] = node
    out_nodes: List[Dict[str, Any]] = []
    outgoing: Dict[str, Dict[str, List[str]]] = {}
    for edge in edges:
        edge_data = edge.get("data", {}) or {}
        raw_predicate = edge_data.get("predicate") or edge_data.get("label") or edge_data.get("type")
        predicate = str(raw_predicate).strip() if isinstance(raw_predicate, str) else ""
        if not predicate:
            predicate = predicate_default.strip() or "relatedTo"
        if predicate not in context:
            context[predicate] = {"@type": "@id"}
        source = edge.get("source")
        target = edge.get("target")
        if isinstance(source, str) and isinstance(target, str) and source and target:
            by_predicate = outgoing.setdefault(source, {})
            bucket = by_predicate.setdefault(predicate, [])
            bucket.append(target)
    for node_id, node in id_to_node.items():
        data = node.get("data", {}) or {}
        node_type = data.get("type") or "Entity"
        node_name = data.get("name") or node_id
        obj: Dict[str, Any] = {
            "@id": f"{prefix}:{node_id}",
            "@type": node_type,
            "name": node_name,
        }
        by_predicate = outgoing.get(node_id)
        if isinstance(by_predicate, dict) and by_predicate:
            for predicate, targets in by_predicate.items():
                if not isinstance(predicate, str) or not predicate:
                    continue
                if not isinstance(targets, list) or not targets:
                    continue
                obj[predicate] = [f"{prefix}:{target}" for target in targets if isinstance(target, str) and target]
        out_nodes.append(obj)
    document = {"@context": context, "@graph": out_nodes}
    jsonld_path = os.path.join(output_dir, "a0.jsonld")
    with open(jsonld_path, "w", encoding="utf-8") as handle:
        json.dump(document, handle, ensure_ascii=False, indent=2)
    return jsonld_path


def run_codebase_index_pipeline(output_dir: str, runtime_events_log_path: str, input_path: str) -> Tuple[str, str]:
    orchestrator_config = os.path.join(BASE_DIR, CODEBASE_INDEX_ORCHESTRATOR_CONFIG_REL)
    configured_index_path = os.getenv("KG_CODEBASE_INDEX_JSONLD_PATH", "").strip()
    index_path = (
        os.path.abspath(configured_index_path)
        if os.path.isabs(configured_index_path)
        else os.path.abspath(os.path.join(BASE_DIR, configured_index_path))
        if configured_index_path
        else os.path.join(output_dir, "codebase-index-viz.jsonld")
    )
    embeddings_example = os.getenv("KG_EMBEDDINGS_BACKEND_FILE", DEFAULT_EMBEDDINGS_BACKEND_FILE)
    started = time.perf_counter()
    status = "ok"
    try:
        subprocess.run(
            [
                PYTHON_BIN,
                "-m",
                "knowgrph_parser",
                "parse-codebase-index",
                "--input",
                input_path,
                "--output",
                index_path,
                "-c",
                orchestrator_config,
                "--runtime-events-log",
                runtime_events_log_path,
            ],
            check=True,
        )
    except subprocess.CalledProcessError:
        status = "error"
        raise
    finally:
        duration_ms = (time.perf_counter() - started) * 1000.0
        append_runtime_event(
            runtime_events_log_path,
            "runtime:event:knowgrph_parser:pipeline",
            "knowgrph_parser/pipeline_cmd.py",
            "call",
            status,
            duration_ms,
            "knowgrph_parser/pipeline_cmd.py: run_codebase_index_pipeline",
        )
    subprocess.run(
        [
            PYTHON_BIN,
            "-m",
            "knowgrph_parser",
            "embed-codebase-index",
            "--input",
            index_path,
            "--output",
            index_path,
            "--backend",
            "file",
            "--backend-file",
            embeddings_example,
            "--dimensions",
            "4",
        ],
        check=True,
    )
    subprocess.run(
        [
            PYTHON_BIN,
            "-m",
            "knowgrph_parser",
            "test-embedding-sanity",
            "--input",
            index_path,
            "--dimensions",
            "4",
        ],
        check=True,
    )
    return orchestrator_config, index_path


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="pipeline", add_help=True)
    parser.add_argument(
        "--mode",
        choices=["pipeline"],
        default="pipeline",
    )
    parser.add_argument("--input", "-i", dest="input_path", default=None)
    parser.add_argument("--output-dir", "-o", dest="output_dir", default=None)
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    if arguments.mode == "pipeline":
        input_path = (
            os.path.abspath(str(arguments.input_path))
            if arguments.input_path is not None and str(arguments.input_path).strip()
            else os.getenv("KG_INPUT_PATH", DEFAULT_INPUT_PATH).strip()
        )
        if not input_path:
            raise SystemExit("Missing input graph. Provide --input or set KG_INPUT_PATH.")

        output_dir = (
            os.path.abspath(str(arguments.output_dir))
            if arguments.output_dir is not None and str(arguments.output_dir).strip()
            else os.getenv("KG_OUTPUT_DIR", DEFAULT_OUTPUT_DIR)
        )
        predicate_default = os.getenv("KG_EDGE_PREDICATE_DEFAULT", "relatedTo").strip() or "relatedTo"
        term_iri_base = os.getenv("KG_TERM_IRI_BASE", DEFAULT_TERM_IRI_BASE).strip() or DEFAULT_TERM_IRI_BASE
        runtime_events_log_path = os.path.join(output_dir, "runtime-events.jsonl")

        ensure_output_dir(output_dir)
        data = load_graph(input_path)
        nodes = data.get("nodes", []) or []
        edges = data.get("edges", []) or []
        write_a0_csv(output_dir, nodes, edges, predicate_default=predicate_default)
        write_jsonld(
            output_dir,
            nodes,
            edges,
            term_iri_base=term_iri_base,
            predicate_default=predicate_default,
        )
        run_codebase_index_pipeline(output_dir, runtime_events_log_path, input_path)
        return 0

    raise SystemExit(f"Unknown mode: {arguments.mode}")
