import unittest

from .codebase_index_jsonld import build_jsonld


class CodebaseIndexJsonldTest(unittest.TestCase):
    def test_graphdata_chunk_text_survives_index_build(self) -> None:
        graph = {
            "nodes": [
                {
                    "id": "node:a",
                    "data": {
                        "type": "Document",
                        "name": "A",
                        "chunk_text": "Grounded parser text for retrieval.",
                    },
                },
            ],
            "edges": [],
        }

        document = build_jsonld(
            graph,
            codebase_id="test",
            traversal_edges=[],
            ignored_paths=[],
            raw_ignored_patterns=[],
        )

        nodes = document["@graph"]
        self.assertEqual(nodes[0]["chunk_text"], "Grounded parser text for retrieval.")

    def test_file_node_ids_are_canonical_without_source_id_metadata(self) -> None:
        graph = {
            "nodes": [
                {
                    "id": "node:file-a",
                    "data": {
                        "type": "File",
                        "name": "A",
                        "path": "./src/a.py",
                    },
                },
                {
                    "id": "node:file-b",
                    "data": {
                        "type": "File",
                        "name": "B",
                        "path": "./src/b.py",
                    },
                },
            ],
            "edges": [
                {
                    "source": "node:file-a",
                    "target": "node:file-b",
                    "data": {"type": "imports"},
                },
            ],
        }

        document = build_jsonld(
            graph,
            codebase_id="test",
            traversal_edges=[],
            ignored_paths=[],
            raw_ignored_patterns=[],
        )

        nodes_by_id = {node["@id"]: node for node in document["@graph"]}
        self.assertIn("kg:src/a.py", nodes_by_id)
        self.assertEqual(nodes_by_id["kg:src/a.py"]["imports"], ["kg:src/b.py"])
        source_id_metadata_key = "ali" + "ases"
        for node in document["@graph"]:
            metadata = node.get("metadata")
            if isinstance(metadata, dict):
                self.assertNotIn(source_id_metadata_key, metadata)


if __name__ == "__main__":
    unittest.main()
