import argparse
import csv
import json
import os
from typing import Any, Dict, List, Optional, Sequence


def load_graph(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        data: Any = json.load(handle)
    if isinstance(data, dict):
        return data
    return {}


def main(argv: Optional[Sequence[str]] = None, *, base_dir: str) -> int:
    parser = argparse.ArgumentParser(prog="workflow-artifacts", add_help=True)
    parser.add_argument(
        "--input",
        "-i",
        default=os.path.join(base_dir, "data", "outputs", "knowgrph-workflow.json"),
    )
    parser.add_argument(
        "--output-dir",
        "-o",
        default=os.path.join(base_dir, "data", "outputs"),
    )
    parser.add_argument("--nodes-csv", default="knowgrph-workflow-nodes.csv")
    parser.add_argument("--edges-csv", default="knowgrph-workflow-edges.csv")
    parser.add_argument("--summary-json", default="knowgrph-workflow-summary.json")
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    input_path = os.path.abspath(str(arguments.input))
    output_dir = os.path.abspath(str(arguments.output_dir))
    os.makedirs(output_dir, exist_ok=True)

    data = load_graph(input_path)
    nodes = data.get("nodes") or []
    edges = data.get("edges") or []
    if not isinstance(nodes, list):
        nodes = []
    if not isinstance(edges, list):
        edges = []

    nodes_csv_path = os.path.join(output_dir, str(arguments.nodes_csv))
    edges_csv_path = os.path.join(output_dir, str(arguments.edges_csv))
    summary_json_path = os.path.join(output_dir, str(arguments.summary_json))

    with open(nodes_csv_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "label", "type", "path"])
        writer.writeheader()
        for entry in nodes:
            if not isinstance(entry, dict):
                continue
            node_id = entry.get("id")
            if not isinstance(node_id, str) or not node_id:
                continue
            data_value = entry.get("data") or {}
            if not isinstance(data_value, dict):
                data_value = {}
            label = str(data_value.get("name") or node_id)
            node_type = str(data_value.get("type") or "Entity")
            path_value = data_value.get("path") or ""
            path_text = str(path_value) if isinstance(path_value, (str, int, float)) else ""
            writer.writerow({"id": node_id, "label": label, "type": node_type, "path": path_text})

    with open(edges_csv_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["source", "label", "target"])
        writer.writeheader()
        for entry in edges:
            if not isinstance(entry, dict):
                continue
            source = entry.get("source")
            target = entry.get("target")
            if not isinstance(source, str) or not isinstance(target, str):
                continue
            data_value = entry.get("data") or {}
            if not isinstance(data_value, dict):
                data_value = {}
            label = str(data_value.get("type") or "relatedTo")
            writer.writerow({"source": source, "label": label, "target": target})

    node_types: Dict[str, int] = {}
    for entry in nodes:
        if not isinstance(entry, dict):
            continue
        data_value = entry.get("data") or {}
        if not isinstance(data_value, dict):
            data_value = {}
        node_type = str(data_value.get("type") or "Entity")
        node_types[node_type] = node_types.get(node_type, 0) + 1

    edge_types: Dict[str, int] = {}
    panel_providers: List[str] = []
    for entry in edges:
        if not isinstance(entry, dict):
            continue
        data_value = entry.get("data") or {}
        if not isinstance(data_value, dict):
            data_value = {}
        edge_type = str(data_value.get("type") or "relatedTo")
        edge_types[edge_type] = edge_types.get(edge_type, 0) + 1
        if edge_type == "providesPanel" and entry.get("target") == "ui:PanelSystem":
            source = entry.get("source")
            if isinstance(source, str) and source:
                panel_providers.append(source)

    summary = {
        "counts": {
            "nodes": len(nodes),
            "edges": len(edges),
            "node_types": node_types,
            "edge_types": edge_types,
        },
        "panel_providers": panel_providers[:50],
    }
    with open(summary_json_path, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)

    print(f"Parsed {input_path}")
    print(f"Wrote {nodes_csv_path}")
    print(f"Wrote {edges_csv_path}")
    print(f"Wrote {summary_json_path}")
    return 0
