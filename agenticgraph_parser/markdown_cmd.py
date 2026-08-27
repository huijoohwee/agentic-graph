import argparse
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .common import (
    DEFAULT_AGENTIC_RAG_CONTEXT_URL,
    DEFAULT_AGENTIC_RAG_SCHEMA_URL,
    DEFAULT_TERM_IRI_BASE,
    find_repo_root,
    sha256_text,
    slugify,
    write_json,
    write_text,
)
from .doc_markdown import build_knowgrph_doc_markdown
from .graph_builder import parse_markdown_to_graph_jsonld
from .orchestrator_yaml import build_orchestrator_config_yaml
from .schema_config import build_schema_config_jsonld


def _list_markdown_files(input_path: str) -> List[str]:
    if not os.path.isdir(input_path):
        return [input_path]
    out: List[str] = []
    for root, _, files in os.walk(input_path):
        for filename in files:
            lower = filename.lower()
            if not (lower.endswith(".md") or lower.endswith(".markdown")):
                continue
            out.append(os.path.join(root, filename))
    out.sort()
    return out


def _is_entity_node(item: Dict[str, Any]) -> bool:
    if item.get("@type") != "Entity":
        return False
    props = item.get("properties")
    return isinstance(props, dict) and isinstance(props.get("normalizedText"), str) and isinstance(props.get("entityType"), str)


def _canonical_entity_id(entity_type: str, normalized_text: str) -> str:
    key = f"{entity_type}:{normalized_text}".strip().lower()
    digest = sha256_text(key)[:12]
    return f"ent:global:{digest}"


def _get_edge_endpoints(edge_obj: Dict[str, Any]) -> Tuple[str, str]:
    raw_src = edge_obj.get("source") if "source" in edge_obj else edge_obj.get("source_node")
    raw_tgt = edge_obj.get("target") if "target" in edge_obj else edge_obj.get("target_node")
    src = str(raw_src) if isinstance(raw_src, str) else ""
    tgt = str(raw_tgt) if isinstance(raw_tgt, str) else ""
    return src, tgt


def _rewrite_edge_endpoints_to_canonical_entities(
    edge_obj: Dict[str, Any],
    canonical_entity_id_by_source_id: Dict[str, str],
) -> None:
    src, tgt = _get_edge_endpoints(edge_obj)
    if src and src in canonical_entity_id_by_source_id:
        if "source" in edge_obj:
            edge_obj["source"] = canonical_entity_id_by_source_id[src]
        if "source_node" in edge_obj:
            edge_obj["source_node"] = canonical_entity_id_by_source_id[src]
    if tgt and tgt in canonical_entity_id_by_source_id:
        if "target" in edge_obj:
            edge_obj["target"] = canonical_entity_id_by_source_id[tgt]
        if "target_node" in edge_obj:
            edge_obj["target_node"] = canonical_entity_id_by_source_id[tgt]


def _merge_entity(existing: Dict[str, Any], incoming: Dict[str, Any]) -> None:
    existing_name = str(existing.get("name") or "").strip()
    incoming_name = str(incoming.get("name") or "").strip()
    if (not existing_name) or (len(incoming_name) > len(existing_name)):
        if incoming_name:
            existing["name"] = incoming_name
    existing_chunk = str(existing.get("chunk_text") or "")
    incoming_chunk = str(incoming.get("chunk_text") or "")
    if len(incoming_chunk) > len(existing_chunk):
        if incoming_chunk:
            existing["chunk_text"] = incoming_chunk
    existing_props = existing.get("properties")
    incoming_props = incoming.get("properties")
    if isinstance(existing_props, dict) and isinstance(incoming_props, dict):
        for k, v in incoming_props.items():
            if k not in existing_props and v is not None:
                existing_props[k] = v
        existing["properties"] = existing_props


def _unify_entities_across_docs(
    docs: List[Dict[str, Any]],
    *,
    entity_merge_threshold: float = 0.85,
    cross_document_inference_depth: int = 2,
) -> Dict[str, Any]:
    if not docs:
        return {}
    base = docs[0]
    base_ctx = base.get("@context")
    merged_items: List[Dict[str, Any]] = []
    entity_by_id: Dict[str, Dict[str, Any]] = {}
    canonical_entity_id_by_source_id: Dict[str, str] = {}
    merged_metadata: Dict[str, Any] = {}
    
    merged_metadata["unificationConfig"] = {
        "entityMergeThreshold": entity_merge_threshold,
        "crossDocumentInferenceDepth": cross_document_inference_depth,
    }

    for d in docs:
        meta = d.get("metadata")
        if isinstance(meta, dict):
            for k, v in meta.items():
                if k not in merged_metadata and v is not None:
                    merged_metadata[k] = v
    merged_metadata["sourceDocuments"] = [
        str((d.get("metadata") or {}).get("documentPath") or "")
        for d in docs
        if isinstance(d.get("metadata"), dict) and isinstance((d.get("metadata") or {}).get("documentPath"), str)
    ]
    for d in docs:
        graph_items = d.get("@graph") or []
        if not isinstance(graph_items, list):
            continue
        for item in graph_items:
            if not isinstance(item, dict):
                continue
            if not _is_entity_node(item):
                continue
            old_id = str(item.get("@id") or "").strip()
            props = item.get("properties") or {}
            entity_type = str(props.get("entityType") or "").strip()
            normalized_text = str(props.get("normalizedText") or "").strip().lower()
            if not old_id or not entity_type or not normalized_text:
                continue
            new_id = _canonical_entity_id(entity_type, normalized_text)
            canonical_entity_id_by_source_id[old_id] = new_id
    for d in docs:
        graph_items = d.get("@graph") or []
        if not isinstance(graph_items, list):
            continue
        for item_any in graph_items:
            if not isinstance(item_any, dict):
                continue
            item = dict(item_any)
            if _is_entity_node(item):
                old_id = str(item.get("@id") or "").strip()
                new_id = canonical_entity_id_by_source_id.get(old_id, old_id)
                item["@id"] = new_id
                existing = entity_by_id.get(new_id)
                if existing:
                    _merge_entity(existing, item)
                else:
                    entity_by_id[new_id] = item
                continue
            if item.get("@type") == "Edge" or "source_node" in item or "target_node" in item or "source" in item or "target" in item:
                _rewrite_edge_endpoints_to_canonical_entities(item, canonical_entity_id_by_source_id)
                merged_items.append(item)
                continue
            merged_items.append(item)
    merged_items.extend(entity_by_id.values())
    return {"@context": base_ctx, "@graph": merged_items, "metadata": merged_metadata}


def _iter_strings(value: Any) -> List[str]:
    out: List[str] = []
    if isinstance(value, str):
        out.append(value)
        return out
    if isinstance(value, dict):
        for k, v in value.items():
            out.extend(_iter_strings(k))
            out.extend(_iter_strings(v))
        return out
    if isinstance(value, (list, tuple)):
        for item in value:
            out.extend(_iter_strings(item))
        return out
    return out


def _load_forbidden_tokens_from_env() -> List[str]:
    raw = os.getenv("KG_NEUTRALITY_FORBIDDEN_TOKENS", "") or ""
    parts = [p.strip() for p in raw.split(",")]
    return [p for p in parts if p]


def _scan_forbidden_tokens(payload: Dict[str, Any], tokens: List[str]) -> List[Dict[str, str]]:
    matches: List[Dict[str, str]] = []
    if not tokens:
        return matches
    token_lower = [t.lower() for t in tokens]
    for s in _iter_strings(payload):
        text = s.lower()
        for idx, t in enumerate(token_lower):
            if t and t in text:
                matches.append({"token": tokens[idx], "value": s})
                break
    return matches


def main(argv: Optional[Sequence[str]] = None, *, parser_script_path: Optional[str] = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to input markdown file")
    parser.add_argument("--output-graph", default="", help="Path to output graph JSON-LD file")
    parser.add_argument("--output-schema", default="", help="Path to output schema JSON-LD file")
    parser.add_argument("--output-orchestrator", default="", help="Path to output orchestrator YAML file")
    parser.add_argument("--output-doc", default="", help="Path to output generated markdown document")
    parser.add_argument(
        "--output-dir",
        default="",
        help="Optional directory for output artifacts; defaults to data/<stem_YYYYMMDDHHMM> under repo root",
    )
    parser.add_argument("--graph-id", default="", help="Graph id to embed into metadata")
    parser.add_argument("--codebase-root", default="", help="Optional repo/codebase root used for relative paths")
    parser.add_argument(
        "--agenticrag-schema",
        default=DEFAULT_AGENTIC_RAG_SCHEMA_URL,
        help="AgenticRAG schema IRI to record in generated metadata and orchestrator config",
    )
    parser.add_argument(
        "--agenticrag-context",
        default=DEFAULT_AGENTIC_RAG_CONTEXT_URL,
        help="AgenticRAG JSON-LD @context IRI to use as @vocab",
    )
    parser.add_argument(
        "--term-iri-base",
        default=DEFAULT_TERM_IRI_BASE,
        help="Base IRI for Knowgrph relationship terms (e.g. hasSection, next)",
    )
    parser.add_argument(
        "--entity-merge-threshold",
        type=float,
        default=0.85,
        help="Minimum similarity for entity consolidation (0.7-0.95)",
    )
    parser.add_argument(
        "--inference-depth",
        type=int,
        default=2,
        help="Hop distance for cross-document inference (1-5)",
    )
    parser.add_argument(
        "--print-schema-layers",
        action="store_true",
        help="Print derived schema-config.metadata.layers for inspection and exit without writing files",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    input_path = os.path.abspath(args.input)
    root = os.path.abspath(args.codebase_root) if args.codebase_root.strip() else find_repo_root(input_path)
    input_files = _list_markdown_files(input_path)
    if not input_files:
        raise SystemExit(f"No markdown files found under {input_path}")
    input_stem = os.path.splitext(os.path.basename(input_path))[0]
    stem = input_stem if input_stem else "markdown"
    gid = args.graph_id.strip() if args.graph_id.strip() else f"md:{slugify(stem)}"

    docs: List[Dict[str, Any]] = []
    if len(input_files) == 1:
        graph_doc = parse_markdown_to_graph_jsonld(
            input_files[0],
            codebase_root=root,
            graph_id=gid,
            agentic_rag_schema_url=str(args.agenticrag_schema or DEFAULT_AGENTIC_RAG_SCHEMA_URL),
            agentic_rag_context_url=str(args.agenticrag_context or DEFAULT_AGENTIC_RAG_CONTEXT_URL),
            term_iri_base=str(args.term_iri_base or DEFAULT_TERM_IRI_BASE),
        )
    else:
        for idx, path in enumerate(input_files):
            file_stem = os.path.splitext(os.path.basename(path))[0]
            sub_gid = f"{gid}:{slugify(file_stem or str(idx + 1))}"
            docs.append(
                parse_markdown_to_graph_jsonld(
                    path,
                    codebase_root=root,
                    graph_id=sub_gid,
                    agentic_rag_schema_url=str(args.agenticrag_schema or DEFAULT_AGENTIC_RAG_SCHEMA_URL),
                    agentic_rag_context_url=str(args.agenticrag_context or DEFAULT_AGENTIC_RAG_CONTEXT_URL),
                    term_iri_base=str(args.term_iri_base or DEFAULT_TERM_IRI_BASE),
                )
            )
        graph_doc = _unify_entities_across_docs(
            docs,
            entity_merge_threshold=float(args.entity_merge_threshold),
            cross_document_inference_depth=int(args.inference_depth),
        )
    forbidden_tokens = _load_forbidden_tokens_from_env()
    if forbidden_tokens:
        matches = _scan_forbidden_tokens(graph_doc, forbidden_tokens)
        if matches:
            strict_raw = os.getenv("KG_NEUTRALITY_STRICT", "") or ""
            strict = strict_raw.strip().lower() in ("1", "true", "yes", "on")
            summary = {m["token"] for m in matches}
            message = f"Neutrality validation detected forbidden tokens: {', '.join(sorted(summary))}"
            if strict:
                print(message, file=sys.stderr)
                raise SystemExit(1)
            print(message, file=sys.stderr)
    schema_doc = build_schema_config_jsonld(
        graph_doc,
        agentic_rag_schema_url=str(args.agenticrag_schema or DEFAULT_AGENTIC_RAG_SCHEMA_URL),
        term_iri_base=str(args.term_iri_base or DEFAULT_TERM_IRI_BASE),
    )

    if bool(args.print_schema_layers):
        meta = schema_doc.get("metadata") or {}
        layers = meta.get("layers") or {}
        print("schema-config.metadata.layers:")
        try:
            import json as _json

            print(_json.dumps(layers, indent=2, ensure_ascii=False))
        except Exception:
            print(layers)
        return 0

    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    default_dir = os.path.join(root, "data", f"{stem}_{ts}")
    output_dir = os.path.abspath(args.output_dir) if args.output_dir.strip() else default_dir
    os.makedirs(output_dir, exist_ok=True)

    raw_graph_out = str(args.output_graph or "").strip()
    raw_schema_out = str(args.output_schema or "").strip()
    raw_orch_out = str(args.output_orchestrator or "").strip()
    raw_doc_out = str(args.output_doc or "").strip()

    graph_out_path = os.path.abspath(raw_graph_out) if raw_graph_out else os.path.abspath(
        os.path.join(output_dir, f"{stem}-graph-data.jsonld")
    )
    schema_out_path = os.path.abspath(raw_schema_out) if raw_schema_out else os.path.abspath(
        os.path.join(output_dir, f"{stem}-schema-config.jsonld")
    )
    orch_out_path = os.path.abspath(raw_orch_out) if raw_orch_out else os.path.abspath(
        os.path.join(output_dir, f"{stem}-orchestrator-config.yaml")
    )
    doc_out_path = os.path.abspath(raw_doc_out) if raw_doc_out else os.path.abspath(
        os.path.join(output_dir, f"{stem}-document.md")
    )

    sections: List[Tuple[int, str, str]] = []
    top_ids: List[str] = []
    top_titles: List[str] = []
    for item in graph_doc.get("@graph", []):
        if not isinstance(item, dict):
            continue
        if item.get("@type") != "Section":
            continue
        props = item.get("properties")
        props_dict: Dict[str, Any] = props if isinstance(props, dict) else {}
        level = props_dict.get("level")
        heading = props_dict.get("heading")
        anchor = props_dict.get("anchor")
        if isinstance(level, int) and isinstance(heading, str) and isinstance(anchor, str):
            sections.append((level, heading, anchor))
            if level == 1:
                sid = item.get("@id")
                if isinstance(sid, str) and sid.strip():
                    top_ids.append(sid.strip())
                top_titles.append(heading)

    parser_entrypoint = (
        os.path.abspath(parser_script_path)
        if parser_script_path and parser_script_path.strip()
        else f"{sys.executable} -m knowgrph_parser"
    )
    orch_text = build_orchestrator_config_yaml(
        repo_root=root,
        graph_id=gid,
        graph_jsonld_path=graph_out_path,
        schema_jsonld_path=schema_out_path,
        parser_entrypoint=parser_entrypoint,
        markdown_path=input_path,
        top_section_ids=top_ids,
        top_section_titles=top_titles,
        agentic_rag_schema_url=str(args.agenticrag_schema or DEFAULT_AGENTIC_RAG_SCHEMA_URL),
    )

    title = ""
    for item in graph_doc.get("@graph", []):
        if isinstance(item, dict) and item.get("@type") == "Document":
            title = str(item.get("name") or "")
            break
    if not title:
        title = os.path.basename(input_path)

    doc_text = build_knowgrph_doc_markdown(
        title=title,
        graph_id=gid,
        markdown_path=input_path,
        graph_jsonld_path=graph_out_path,
        schema_jsonld_path=schema_out_path,
        orchestrator_yaml_path=orch_out_path,
        sections=sections,
    )

    parser_script_path = os.path.join(output_dir, f"parse_{stem}.py")
    parser_script = (
        "import os\n"
        "import sys\n\n"
        "from knowgrph_parser import markdown_cmd\n\n"
        "def main() -> int:\n"
        f"    markdown_path = os.path.abspath({repr(input_path)})\n"
        "    argv = ['--input', markdown_path] + sys.argv[1:]\n"
        "    return markdown_cmd.main(argv)\n\n"
        "if __name__ == '__main__':\n"
        "    raise SystemExit(main())\n"
    )

    write_json(graph_out_path, graph_doc)
    write_json(schema_out_path, schema_doc)
    write_text(orch_out_path, orch_text)
    write_text(doc_out_path, doc_text)
    write_text(parser_script_path, parser_script)

    return 0
