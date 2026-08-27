from typing import Any, Dict, List

from .common import (
    DEFAULT_AGENTIC_RAG_SCHEMA_URL,
    DEFAULT_TERM_IRI_BASE,
    KG_CLASS_PREFIX,
    KG_EDGE_LABEL_CLASS,
    KG_NODE_TYPE_CLASS,
    KG_PROP_PREFIX,
    KG_PROPERTY_CLASS,
    infer_json_type,
    merge_prop_types,
    slugify,
)


def build_schema_config_jsonld(
    graph_jsonld: Dict[str, Any],
    *,
    agentic_rag_schema_url: str = DEFAULT_AGENTIC_RAG_SCHEMA_URL,
    term_iri_base: str = DEFAULT_TERM_IRI_BASE,
) -> Dict[str, Any]:
    graph = graph_jsonld.get("@graph")
    items = graph if isinstance(graph, list) else []

    node_types: List[str] = []
    edge_labels: List[str] = []
    seen_node_types: set = set()
    seen_edge_labels: set = set()

    prop_types_by_owner: Dict[str, Dict[str, str]] = {}
    edge_prop_types_by_label: Dict[str, Dict[str, str]] = {}

    for item in items:
        if not isinstance(item, dict):
            continue
        if str(item.get("@type") or "") == "knowgrph:Edge" or (
            (("source" in item and "target" in item) or ("source_node" in item and "target_node" in item)) and "relation" in item
        ):
            lbl = str(item.get("relation") or "").strip()
            if lbl and lbl not in seen_edge_labels:
                seen_edge_labels.add(lbl)
                edge_labels.append(lbl)
            props_raw = item.get("properties")
            props = props_raw if isinstance(props_raw, dict) else {}
            for k, v in props.items():
                inferred = infer_json_type(v)
                if lbl not in edge_prop_types_by_label:
                    edge_prop_types_by_label[lbl] = {}
                prev = edge_prop_types_by_label[lbl].get(k)
                edge_prop_types_by_label[lbl][k] = inferred if not prev else merge_prop_types(prev, inferred)
            continue
        t = item.get("@type")
        if isinstance(t, list) and t:
            t = t[0]
        typ = str(t or "").strip() or "Thing"
        if typ not in seen_node_types:
            seen_node_types.add(typ)
            node_types.append(typ)

        owner = typ
        props: Dict[str, Any] = {}
        if "chunk_text" in item:
            props["chunk_text"] = item.get("chunk_text")
        props_raw = item.get("properties")
        if isinstance(props_raw, dict):
            props.update(props_raw)
        for k, v in props.items():
            inferred = infer_json_type(v)
            if owner not in prop_types_by_owner:
                prop_types_by_owner[owner] = {}
            prev = prop_types_by_owner[owner].get(k)
            prop_types_by_owner[owner][k] = inferred if not prev else merge_prop_types(prev, inferred)

    graph_out: List[Dict[str, Any]] = []
    for nt in node_types:
        graph_out.append({"@id": f"{KG_CLASS_PREFIX}{slugify(nt)}", "@type": KG_NODE_TYPE_CLASS, "name": nt})
    for el in edge_labels:
        graph_out.append({"@id": f"{KG_PROP_PREFIX}{slugify(el)}", "@type": KG_EDGE_LABEL_CLASS, "name": el})

    for owner, props in prop_types_by_owner.items():
        for key, rng in sorted(props.items(), key=lambda kv: kv[0]):
            graph_out.append(
                {
                    "@id": f"{KG_PROP_PREFIX}{slugify(owner)}:{slugify(key)}",
                    "@type": KG_PROPERTY_CLASS,
                    "name": key,
                    "owner": owner,
                    "range": rng,
                }
            )

    for owner, props in edge_prop_types_by_label.items():
        for key, rng in sorted(props.items(), key=lambda kv: kv[0]):
            graph_out.append(
                {
                    "@id": f"{KG_PROP_PREFIX}{slugify(owner)}:{slugify(key)}",
                    "@type": KG_PROPERTY_CLASS,
                    "name": key,
                    "owner": owner,
                    "range": rng,
                }
            )

    base_metadata: Dict[str, Any] = {
        "agenticRagSchema": agentic_rag_schema_url,
        "generatedBy": "knowgrph_parser.schema_config",
    }
    src_meta = graph_jsonld.get("metadata")
    if isinstance(src_meta, dict):
        layers_hint = src_meta.get("layers")
        default_layer = src_meta.get("defaultLayer")
        if isinstance(layers_hint, dict) and layers_hint:
            base_metadata.setdefault("layersFromGraph", layers_hint)
        if isinstance(default_layer, str) and default_layer:
            base_metadata.setdefault("defaultLayerFromGraph", default_layer)

    semantic_layer_hint = base_metadata.get("layersFromGraph", {}).get("semantic") if isinstance(base_metadata.get("layersFromGraph"), dict) else None
    document_layer_hint = base_metadata.get("layersFromGraph", {}).get("documentStructure") if isinstance(base_metadata.get("layersFromGraph"), dict) else None

    layers_cfg: Dict[str, Any] = {
        "mode": "semantic",
        "semantic": {
            "similarityMetric": "pmi",
            "similarityEdgeLabel": (
                str(getattr(semantic_layer_hint, "get", lambda _: "coOccursWith")("edgeLabel"))
                if semantic_layer_hint
                else "coOccursWith"
            ),
            "topKEdgesPerNode": 4,
            "minSimilarity": 0.2,
            "hiddenNodeTypes": [],
            "communityDetection": {
                "enabled": True,
                "algorithm": "connected_components",
                "weightProperty": "pmi",
            },
        },
        "documentStructure": {
            "minGroupSize": 2,
        },
    }

    if isinstance(semantic_layer_hint, dict):
        edge_label = semantic_layer_hint.get("edgeLabel")
        if isinstance(edge_label, str) and edge_label.strip():
            layers_cfg["semantic"]["similarityEdgeLabel"] = edge_label.strip()
        node_types = semantic_layer_hint.get("nodeTypes")
        if isinstance(node_types, list) and node_types:
            hidden: List[str] = []
            for t in node_types:
                text = str(t or "").strip()
                if text:
                    hidden.append(text)
            if hidden:
                layers_cfg["semantic"]["hiddenNodeTypes"] = hidden

    if isinstance(document_layer_hint, dict):
        dt_node_types = document_layer_hint.get("nodeTypes")
        if isinstance(dt_node_types, list) and dt_node_types:
            layers_cfg["documentStructure"]["structuralNodeTypes"] = [
                str(t or "").strip()
                for t in dt_node_types
                if str(t or "").strip()
            ]
        dt_edge_labels = document_layer_hint.get("edgeLabels")
        if isinstance(dt_edge_labels, list) and dt_edge_labels:
            layers_cfg["documentStructure"]["structuralEdgeLabels"] = [
                str(e or "").strip()
                for e in dt_edge_labels
                if str(e or "").strip()
            ]

    return {
        "@context": {
            "@vocab": term_iri_base,
            "kg": "http://example.org/kg#",
            "schema": "https://schema.org/",
            "name": "schema:name",
            "owner": "schema:domainIncludes",
            "range": "schema:rangeIncludes",
        },
        "@graph": graph_out,
        "metadata": {**base_metadata, "layers": layers_cfg},
    }
