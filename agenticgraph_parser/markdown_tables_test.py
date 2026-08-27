import unittest

from .markdown_tables import serialize_markdown_pipe_table
from .json_to_markdown_cmd import json_to_markdown


class MarkdownPipeTableSerializerTest(unittest.TestCase):
    def test_serializes_cells_without_html(self) -> None:
        lines = serialize_markdown_pipe_table(
            ["Name", "Count"],
            [["A | B", "Line<br>Two"]],
            [None, "right"],
        )
        markdown = "\n".join(lines)
        self.assertIn(r"| A \| B | Line Two |", markdown)
        self.assertRegex(lines[1], r"\| -{3,} \| -{3,}: \|")
        self.assertNotRegex(markdown.lower(), r"<table|<br")

    def test_json_table_generation_reuses_serializer(self) -> None:
        markdown = json_to_markdown([{"name": "A | B", "note": "Line<br>Two"}], mode="table")
        self.assertIn(r"| A \| B | Line Two |", markdown)
        self.assertNotRegex(markdown.lower(), r"<table|<br")


if __name__ == "__main__":
    unittest.main()
