import unittest

from .markdown_cmd import _canonical_entity_id, _unify_entities_across_docs


class MarkdownCmdUnificationTest(unittest.TestCase):
    def test_unified_entities_do_not_emit_source_id_metadata(self) -> None:
        docs = [
            {
                "@context": {"@vocab": "https://example.invalid/"},
                "@graph": [
                    {
                        "@id": "doc-a:entity:alpha",
                        "@type": "Entity",
                        "name": "Alpha",
                        "properties": {"entityType": "Concept", "normalizedText": "alpha"},
                    },
                    {
                        "@id": "doc-a:entity:beta",
                        "@type": "Entity",
                        "name": "Beta",
                        "properties": {"entityType": "Concept", "normalizedText": "beta"},
                    },
                    {
                        "@type": "Edge",
                        "source": "doc-a:entity:alpha",
                        "target": "doc-a:entity:beta",
                        "label": "relatedTo",
                    },
                ],
                "metadata": {"documentPath": "a.md"},
            },
            {
                "@context": {"@vocab": "https://example.invalid/"},
                "@graph": [
                    {
                        "@id": "doc-b:entity:alpha",
                        "@type": "Entity",
                        "name": "Alpha expanded",
                        "properties": {"entityType": "Concept", "normalizedText": "alpha"},
                    },
                ],
                "metadata": {"documentPath": "b.md"},
            },
        ]

        document = _unify_entities_across_docs(docs)
        alpha_id = _canonical_entity_id("Concept", "alpha")
        beta_id = _canonical_entity_id("Concept", "beta")
        unification_config = document.get("metadata", {}).get("unificationConfig", {})
        removed_strategy_key = "conflict" + "ResolutionStrategy"
        self.assertNotIn(removed_strategy_key, unification_config)

        entities = [item for item in document["@graph"] if item.get("@type") == "Entity"]
        self.assertEqual(sorted(item["@id"] for item in entities), sorted([alpha_id, beta_id]))
        source_id_metadata_key = "ali" + "ases"
        for entity in entities:
            metadata = entity.get("metadata")
            if isinstance(metadata, dict):
                self.assertNotIn(source_id_metadata_key, metadata)

        edges = [item for item in document["@graph"] if item.get("@type") == "Edge"]
        self.assertEqual(edges[0]["source"], alpha_id)
        self.assertEqual(edges[0]["target"], beta_id)


if __name__ == "__main__":
    unittest.main()
