from typing import List, Tuple


def build_knowgrph_doc_markdown(
    title: str,
    graph_id: str,
    markdown_path: str,
    graph_jsonld_path: str,
    schema_jsonld_path: str,
    orchestrator_yaml_path: str,
    sections: List[Tuple[int, str, str]],
) -> str:
    lines: List[str] = []
    lines.append(f"# Knowgrph Document – {title}")
    lines.append("")
    lines.append("## Source")
    lines.append("")
    lines.append(f"- Graph ID: `{graph_id}`")
    lines.append(f"- Markdown: `{markdown_path}`")
    lines.append("")
    lines.append("## Outputs")
    lines.append("")
    lines.append(f"- Graph JSON-LD: `{graph_jsonld_path}`")
    lines.append(f"- Schema JSON-LD: `{schema_jsonld_path}`")
    lines.append(f"- Orchestrator YAML: `{orchestrator_yaml_path}`")
    lines.append("")
    lines.append("## Outline")
    lines.append("")
    for level, heading, anchor in sections:
        indent = "  " * max(0, level - 1)
        lines.append(f"{indent}- {heading} (`{anchor}`)")
    lines.append("")
    lines.append("## Preview")
    lines.append("")
    lines.append(
        "- In Knowgrph Canvas, open the Graph Data Table and click `metadata.codebasePath` to preview the source markdown (supports `#Lstart-end` ranges)."
    )
    lines.append("")
    return "\n".join(lines)

