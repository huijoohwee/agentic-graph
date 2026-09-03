import argparse
import os
import sys
from typing import Optional, Sequence

from .embeddings import load_jsonld, verify_embeddings


def main(argv: Optional[Sequence[str]] = None, *, base_dir: str) -> int:
    parser = argparse.ArgumentParser(prog="test-embedding-sanity", add_help=True)
    parser.add_argument(
        "--input",
        "-i",
        default=os.path.join(base_dir, "data", "outputs", "codebase-index-viz.jsonld"),
    )
    parser.add_argument("--dimensions", "-d", type=int, default=64)
    parser.add_argument("--chunk-field", default="embedding")
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    input_path = os.path.abspath(str(arguments.input))
    document = load_jsonld(input_path)
    count = verify_embeddings(document, str(arguments.chunk_field), int(arguments.dimensions))
    if count <= 0:
        print("No embeddings verified", file=sys.stderr)
        return 1
    print(
        f"Verified embeddings for {count} nodes with {arguments.chunk_field} "
        f"in {input_path} (dimensions={int(arguments.dimensions)})"
    )
    return 0

