from .graph_builder import parse_markdown_text_to_graph_jsonld


def main() -> int:
    doc = parse_markdown_text_to_graph_jsonld(
        """
---
title: Pipeline metadata fixture
ontologies:
  - prefix: prov
    iri: http://www.w3.org/ns/prov#
  - prefix: mex
    iri: http://mex.aksw.org/mex-core#
  - prefix: pplan
    iri: http://purl.org/net/p-plan#
  - prefix: mls
    iri: http://www.w3.org/ns/mls#
  - prefix: geo
    iri: http://www.opengis.net/ont/geosparql#
  - prefix: ro
    iri: https://w3id.org/ro/crate#
graphLayers:
  - competencyHyperspace
  - performanceSpace
  - classDistributionSpace
  - preprocessingCluster
  - modelTypeClusters
  - kpiViolationRegion
  - candidateClusters
  - assessmentRegion
---

# Pipeline metadata fixture
        """.strip(),
        graph_id="metadata-frontmatter",
        semantic_enabled=False,
    )
    meta = doc.get("metadata") or {}
    if "ontologies" not in meta:
        raise SystemExit("metadata.ontologies missing")
    if "graphLayers" not in meta:
        raise SystemExit("metadata.graphLayers missing")

    ontologies = meta["ontologies"]
    graph_layers = meta["graphLayers"]

    if not isinstance(ontologies, list):
        raise SystemExit("metadata.ontologies is not a list")
    if not isinstance(graph_layers, list):
        raise SystemExit("metadata.graphLayers is not a list")

    expected_ontologies = [
        {"prefix": "prov", "iri": "http://www.w3.org/ns/prov#"},
        {"prefix": "mex", "iri": "http://mex.aksw.org/mex-core#"},
        {"prefix": "pplan", "iri": "http://purl.org/net/p-plan#"},
        {"prefix": "mls", "iri": "http://www.w3.org/ns/mls#"},
        {"prefix": "geo", "iri": "http://www.opengis.net/ont/geosparql#"},
        {"prefix": "ro", "iri": "https://w3id.org/ro/crate#"},
    ]
    if len(ontologies) != len(expected_ontologies):
        raise SystemExit(f"metadata.ontologies length {len(ontologies)} != {len(expected_ontologies)}")
    for idx, expected in enumerate(expected_ontologies):
        actual = ontologies[idx]
        if not isinstance(actual, dict):
            raise SystemExit(f"metadata.ontologies[{idx}] is not an object")
        if actual.get("prefix") != expected["prefix"] or actual.get("iri") != expected["iri"]:
            raise SystemExit(
                f"metadata.ontologies[{idx}] mismatch: "
                f"expected prefix={expected['prefix']} iri={expected['iri']}, "
                f"got prefix={actual.get('prefix')} iri={actual.get('iri')}"
            )

    expected_graph_layers = [
        "competencyHyperspace",
        "performanceSpace",
        "classDistributionSpace",
        "preprocessingCluster",
        "modelTypeClusters",
        "kpiViolationRegion",
        "candidateClusters",
        "assessmentRegion",
    ]
    if graph_layers != expected_graph_layers:
        raise SystemExit(f"metadata.graphLayers mismatch: expected {expected_graph_layers}, got {graph_layers}")

    removed_doc = parse_markdown_text_to_graph_jsonld(
        """
---
title: Removed metadata fixture
polygonLayers:
  - removedCluster
---

# Removed metadata fixture
        """.strip(),
        graph_id="removed-metadata-frontmatter",
        semantic_enabled=False,
    )
    removed_meta = removed_doc.get("metadata") or {}
    if "polygonLayers" in removed_meta:
        raise SystemExit("metadata.polygonLayers should not be projected")
    if "graphLayers" in removed_meta:
        raise SystemExit("metadata.graphLayers should not be mapped from removed polygonLayers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
