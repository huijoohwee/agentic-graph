import hashlib
from typing import Any, Dict, List, Optional, Tuple

from .common import read_json, write_json


def load_jsonld(path: str) -> Dict[str, Any]:
    data: Any = read_json(path)
    if isinstance(data, dict):
        return data
    return {}


def save_jsonld(path: str, document: Dict[str, Any]) -> None:
    write_json(path, document)


def hash_to_embedding(text: str, dimensions: int) -> List[float]:
    result: List[float] = []
    seed = text.encode("utf-8")
    counter = 0
    while len(result) < dimensions:
        counter_bytes = counter.to_bytes(4, byteorder="little", signed=False)
        digest = hashlib.sha256(seed + counter_bytes).digest()
        for value in digest:
            if len(result) >= dimensions:
                break
            normalized = (float(value) / 127.5) - 1.0
            result.append(normalized)
        counter += 1
    return result


def ensure_metadata_root(document: Dict[str, Any]) -> Dict[str, Any]:
    metadata = document.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
        document["metadata"] = metadata
    return metadata


def apply_embedding_configuration(document: Dict[str, Any], model_name: str, provider: str, dimensions: int) -> None:
    metadata = ensure_metadata_root(document)
    config = metadata.get("embeddingConfiguration")
    if not isinstance(config, dict):
        config = {}
        metadata["embeddingConfiguration"] = config
    if "@id" not in config:
        config["@id"] = "example:embedding-config-codebase"
    default_model = config.get("defaultModel")
    if not isinstance(default_model, dict):
        default_model = {}
        config["defaultModel"] = default_model
    if "@id" not in default_model:
        default_model["@id"] = "example:model-codebase-embeddings"
    if "@type" not in default_model:
        default_model["@type"] = "EmbeddingModel"
    default_model["modelName"] = model_name
    default_model["provider"] = provider
    default_model["embeddingDimension"] = int(dimensions)
    if "vectorSpace" not in default_model:
        default_model["vectorSpace"] = "cosine-normalized"


def load_vectors_from_file(path: str) -> Tuple[Dict[str, List[float]], int]:
    data: Any = read_json(path)
    vectors: Dict[str, List[float]] = {}
    dimensions = 0
    if isinstance(data, dict):
        raw_dimensions = data.get("dimensions")
        if isinstance(raw_dimensions, int) and raw_dimensions > 0:
            dimensions = raw_dimensions
        raw_vectors = data.get("vectors")
        if isinstance(raw_vectors, dict):
            for key, value in raw_vectors.items():
                if not isinstance(key, str) or not isinstance(value, list):
                    continue
                floats: List[float] = []
                for entry in value:
                    if isinstance(entry, (int, float)):
                        floats.append(float(entry))
                if floats:
                    vectors[key] = floats
                    if dimensions == 0:
                        dimensions = len(floats)
    return vectors, dimensions


def add_embeddings_to_document(
    document: Dict[str, Any],
    dimensions: int,
    field: str,
    vectors_by_id: Optional[Dict[str, List[float]]] = None,
) -> int:
    graph = document.get("@graph") or []
    if not isinstance(graph, list):
        return 0
    updated = 0
    for item in graph:
        if not isinstance(item, dict):
            continue
        if "embedding" in item and isinstance(item.get("embedding"), list):
            continue
        node_id_value = item.get("@id")
        node_id = str(node_id_value) if node_id_value is not None else ""
        if vectors_by_id and node_id and node_id in vectors_by_id:
            backend_vector = vectors_by_id[node_id]
            if (
                isinstance(backend_vector, list)
                and backend_vector
                and all(isinstance(v, (int, float)) for v in backend_vector)
            ):
                if dimensions <= 0 or len(backend_vector) == dimensions:
                    item["embedding"] = [float(v) for v in backend_vector]
                    updated += 1
                    continue
        chunk_value = item.get(field)
        if not isinstance(chunk_value, str):
            continue
        chunk_text = chunk_value.strip()
        if not chunk_text:
            continue
        embedding = hash_to_embedding(chunk_text, dimensions)
        item["embedding"] = embedding
        updated += 1
    return updated


def verify_embeddings(document: Dict[str, Any], field: str, dimensions: int) -> int:
    graph = document.get("@graph")
    if not isinstance(graph, list):
        return 0
    count = 0
    for node in graph:
        if not isinstance(node, dict):
            continue
        vec = node.get(field)
        if not isinstance(vec, list):
            continue
        if len(vec) != dimensions:
            continue
        ok = True
        for entry in vec:
            if not isinstance(entry, (int, float)):
                ok = False
                break
        if ok:
            count += 1
    return count
