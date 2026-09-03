import argparse
import json
import os
from typing import Any, Dict, Optional, Sequence

from .jsonld_universal import load_external_parser, load_json, parse_jsonld_default


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="jsonld-universal", add_help=True)
    parser.add_argument("--input", "-i", required=True)
    parser.add_argument("--output", "-o")
    parser.add_argument("--parser-module")
    parser.add_argument("--parser-func", default="parse_jsonld")
    parser.add_argument("--format", "-f", choices=["graph", "raw"], default="graph")
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    input_path = os.path.abspath(str(arguments.input))
    root = load_json(input_path)
    graph: Dict[str, Any]
    if arguments.parser_module:
        external = load_external_parser(str(arguments.parser_module), str(arguments.parser_func))
        graph = external(root)
    else:
        graph = parse_jsonld_default(root)

    if arguments.format == "graph":
        output_object: Any = graph
    else:
        nodes = graph.get("nodes") if isinstance(graph, dict) else None
        edges = graph.get("edges") if isinstance(graph, dict) else None
        safe_nodes = nodes if isinstance(nodes, list) else []
        safe_edges = edges if isinstance(edges, list) else []
        output_object = {"nodes": safe_nodes, "edges": safe_edges}

    text = json.dumps(output_object, ensure_ascii=False, indent=2)
    if arguments.output:
        output_path = os.path.abspath(str(arguments.output))
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as handle:
            handle.write(text)
    else:
        print(text)
    return 0

