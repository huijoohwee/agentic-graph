"""Canonical Markdown pipe-table serialization for Python artifact generators."""

import re
from typing import Any, List, Optional, Sequence


MarkdownTableAlignment = Optional[str]


def _clean_cell(value: Any) -> str:
    text = "" if value is None else str(value)
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.IGNORECASE)
    text = text.replace("\r", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text.replace("|", r"\|")


def _separator_cell(column: Any, alignment: MarkdownTableAlignment) -> str:
    label = "" if column is None else str(column).strip()
    width = max(3, min(12, len(label))) if label else 3
    base = "-" * width
    if alignment == "right":
        return f"{base}:"
    if alignment == "center":
        return f":{base}:"
    return base


def serialize_markdown_pipe_table(
    columns: Sequence[Any],
    rows: Sequence[Sequence[Any]],
    alignments: Optional[Sequence[MarkdownTableAlignment]] = None,
) -> List[str]:
    """Return one canonical GFM pipe table without authored HTML cells."""
    normalized_columns = list(columns or [])
    if not normalized_columns:
        return []
    normalized_alignments = list(alignments or [])
    header = "| " + " | ".join(_clean_cell(value) for value in normalized_columns) + " |"
    separator = "| " + " | ".join(
        _separator_cell(column, normalized_alignments[index] if index < len(normalized_alignments) else None)
        for index, column in enumerate(normalized_columns)
    ) + " |"
    body = [
        "| " + " | ".join(
            _clean_cell(row[index] if index < len(row) else "")
            for index in range(len(normalized_columns))
        ) + " |"
        for row in rows
    ]
    return [header, separator, *body]
