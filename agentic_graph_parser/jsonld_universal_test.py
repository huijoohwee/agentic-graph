import unittest

from .jsonld_universal import normalize_context, parse_jsonld_default


class JsonldUniversalTest(unittest.TestCase):
    def test_list_context_and_explicit_edge_items_survive_graphdata_conversion(self) -> None:
        document = {
            "@context": [
                "https://example.test/context.jsonld",
                {
                    "source": {"@type": "@id"},
                    "target": {"@type": "@id"},
                },
            ],
            "@graph": [
                {"@id": "node:a", "@type": "Entity", "name": "A"},
                {"@id": "node:b", "@type": "Entity", "name": "B"},
                {
                    "@id": "edge:a-b",
                    "@type": "Edge",
                    "source": "node:a",
                    "target": "node:b",
                    "relation": "relatedTo",
                    "properties": {"weight": 0.75},
                },
            ],
        }

        graph = parse_jsonld_default(document)

        self.assertEqual(len(graph["nodes"]), 2)
        self.assertEqual(len(graph["edges"]), 1)
        self.assertEqual(graph["edges"][0]["source"], "node:a")
        self.assertEqual(graph["edges"][0]["target"], "node:b")
        self.assertEqual(graph["edges"][0]["data"]["type"], "relatedTo")
        self.assertEqual(graph["edges"][0]["data"]["weight"], 0.75)

    def test_context_arrays_merge_inline_id_terms(self) -> None:
        context = normalize_context([
            "https://example.test/context.jsonld",
            {"source": {"@type": "@id"}},
            {"target": {"@type": "@id"}},
        ])

        self.assertEqual(context["source"], {"@type": "@id"})
        self.assertEqual(context["target"], {"@type": "@id"})


if __name__ == "__main__":
    unittest.main()
