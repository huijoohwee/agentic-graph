import os
from typing import List

from .common import DEFAULT_AGENTIC_RAG_SCHEMA_URL, safe_relpath, to_yaml


def build_orchestrator_config_yaml(
    repo_root: str,
    graph_id: str,
    graph_jsonld_path: str,
    schema_jsonld_path: str,
    parser_entrypoint: str,
    markdown_path: str,
    top_section_ids: List[str],
    top_section_titles: List[str],
    *,
    agentic_rag_schema_url: str = DEFAULT_AGENTIC_RAG_SCHEMA_URL,
) -> str:
    abs_root = os.path.abspath(repo_root)
    md_abs = os.path.abspath(markdown_path)
    md_rel = safe_relpath(md_abs, abs_root) or md_abs
    parser_value = str(parser_entrypoint or "").strip()
    if parser_value and os.path.exists(parser_value):
        parser_value = safe_relpath(parser_value, abs_root) or parser_value
    cfg = {
        "graph": {
            "id": graph_id,
            "codebase_root": ".",
            "index_jsonld": safe_relpath(graph_jsonld_path, abs_root) or graph_jsonld_path,
            "index_schema": safe_relpath(schema_jsonld_path, abs_root) or schema_jsonld_path,
        },
        "orchestrator": {
            "parser_script": parser_value,
        },
        "agentic_rag": {
            "schema": agentic_rag_schema_url,
            "node_view_type": "AgenticRagNodeView",
            "primary_fields": ["chunk_text", "provenance"],
            "traversal_edges": ["hasSection", "hasBlock", "hasItem", "linksTo", "next"],
            "graph_rag_paths": [
                {
                    "owner_id": top_section_ids[0] if top_section_ids else f"doc:{graph_id}",
                    "query": f"What is the structure and key content of {os.path.basename(md_rel)}?",
                    "traverse": top_section_ids[:10],
                    "steps": top_section_titles[:10],
                    "context": f"Summarize the markdown document at {md_rel} into a navigable graph structure.",
                }
            ],
        },
    }
    return to_yaml(cfg).rstrip() + "\n"
