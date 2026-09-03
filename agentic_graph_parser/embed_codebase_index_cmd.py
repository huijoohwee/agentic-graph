import argparse
import os
from typing import Dict, List, Optional, Sequence

from .embeddings import (
    add_embeddings_to_document,
    apply_embedding_configuration,
    load_jsonld,
    load_vectors_from_file,
    save_jsonld,
)


def main(argv: Optional[Sequence[str]] = None, *, base_dir: str) -> int:
    parser = argparse.ArgumentParser(prog="embed-codebase-index", add_help=True)
    parser.add_argument(
        "--input",
        "-i",
        default=os.path.join(base_dir, "data", "outputs", "codebase-index-viz.jsonld"),
    )
    parser.add_argument("--output", "-o", default="")
    parser.add_argument("--dimensions", "-d", type=int, default=64)
    parser.add_argument("--model-name", default="text-embedding-3-large")
    parser.add_argument("--provider", default="OpenAI")
    parser.add_argument("--chunk-field", default="chunk_text")
    parser.add_argument("--backend", choices=["hash", "file"], default="hash")
    parser.add_argument("--backend-file", default="")
    arguments = parser.parse_args(list(argv) if argv is not None else None)

    input_path = os.path.abspath(str(arguments.input))
    output_path = str(arguments.output).strip()
    if not output_path:
        output_path = input_path
    output_path = os.path.abspath(output_path)
    backend = str(arguments.backend)
    backend_file = str(arguments.backend_file).strip()
    vectors_by_id: Optional[Dict[str, List[float]]] = None
    backend_dimensions = 0
    if backend == "file":
        if not backend_file:
            raise SystemExit("backend 'file' requires --backend-file")
        backend_path = os.path.abspath(backend_file)
        vectors_by_id, backend_dimensions = load_vectors_from_file(backend_path)
        if not vectors_by_id:
            print("No vectors loaded from backend file, falling back to hash backend")
            backend = "hash"
    dimensions = int(arguments.dimensions)
    if backend == "file" and backend_dimensions > 0 and dimensions <= 0:
        dimensions = backend_dimensions
    document = load_jsonld(input_path)
    count = add_embeddings_to_document(
        document,
        int(dimensions),
        str(arguments.chunk_field),
        vectors_by_id if backend == "file" else None,
    )
    apply_embedding_configuration(
        document,
        str(arguments.model_name),
        str(arguments.provider),
        int(dimensions),
    )
    save_jsonld(output_path, document)
    print(
        f"Updated embeddings for {count} nodes in {output_path} "
        f"using model {arguments.model_name} ({arguments.provider}) "
        f"with dimension {int(dimensions)} using backend {backend}"
    )
    return 0

