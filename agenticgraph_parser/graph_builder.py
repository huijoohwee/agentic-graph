import os
import re
from typing import Any, Dict, List, Optional, Tuple

from .common import (
    DEFAULT_AGENTIC_RAG_CONTEXT_URL,
    DEFAULT_AGENTIC_RAG_SCHEMA_URL,
    DEFAULT_TERM_IRI_BASE,
    find_repo_root,
    read_text,
    safe_relpath,
    sha256_text,
    slugify,
    utc_now_iso,
)
from .markdown_blocks import Block, parse_blocks, split_lines, parse_frontmatter, extract_images, extract_links
from .config_utils import (
    env_float,
    env_int,
    env_bool,
    parse_bool,
    parse_float,
    parse_int,
)

def _make_meta(
    start_line: int,
    end_line: int,
    provenance_source: Optional[str],
    root_norm: Optional[str],
    rel_norm: Optional[str],
    source_uri: Optional[str],
    source_path: Optional[str],
    raw_content: Optional[str] = None
) -> Dict[str, Any]:
    meta: Dict[str, Any] = {"parsedAt": utc_now_iso()}
    src = str(provenance_source or "").strip()
    if src:
        meta["source"] = src
    if root_norm:
        meta["codebaseRoot"] = root_norm.replace("\\", "/")
    if rel_norm:
        meta["codebaseRelPath"] = rel_norm
        meta["documentPath"] = rel_norm
    if source_uri:
        meta["sourceUri"] = source_uri
    if source_path:
        meta["sourcePath"] = source_path.replace("\\", "/")
        frag = f"#L{start_line}" if start_line == end_line else f"#L{start_line}-{end_line}"
        if rel_norm:
            meta["codebasePath"] = f"{rel_norm}{frag}"
        else:
            meta["codebasePath"] = f"{os.path.abspath(source_path)}{frag}"
    meta["lineStart"] = int(start_line)
    meta["lineEnd"] = int(end_line)
    if raw_content:
        meta["sourceSha256"] = sha256_text(raw_content)
    return meta

def _add_edge(
    edges: List[Dict[str, Any]],
    src: str,
    label: str,
    tgt: str,
    *,
    props: Optional[Dict[str, Any]] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    edge_id = f"edge:{slugify(src)}:{slugify(label)}:{slugify(tgt)}:{len(edges)}"
    rec: Dict[str, Any] = {
        "@type": "Edge",
        "@id": edge_id,
        "source": src,
        "target": tgt,
        "relation": label,
    }
    if props:
        rec["properties"] = props
    if meta:
        rec["metadata"] = meta
    edges.append(rec)

def _add_sequence(
    edges: List[Dict[str, Any]],
    prev_id: Optional[str],
    next_id: str,
    *,
    meta: Optional[Dict[str, Any]] = None
) -> None:
    if prev_id:
        _add_edge(edges, prev_id, "next", next_id, meta=meta)

def _process_blocks(
    blocks: List[Block],
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    semantic_sources: List[Dict[str, Any]],
    gid: str,
    doc_node_id: str,
    content_start: int,
    meta_args: Dict[str, Any]
) -> None:
    section_stack: List[Tuple[int, str]] = []
    current_section_id: str = doc_node_id
    last_block_id: Optional[str] = None
    block_index_by_parent: Dict[str, int] = {}
    node_id_set = {str(n.get("@id")) for n in nodes if isinstance(n, dict) and n.get("@id")}

    for b in blocks:
        start_line = b.start_line + content_start
        end_line = b.end_line + content_start
        meta_args_curr = meta_args.copy()
        meta_args_curr["start_line"] = start_line
        meta_args_curr["end_line"] = end_line
        meta_block = _make_meta(**meta_args_curr)

        if b.kind == "heading" and b.level:
            while section_stack and section_stack[-1][0] >= b.level:
                section_stack.pop()
            parent_id = section_stack[-1][1] if section_stack else doc_node_id
            anchor = slugify(b.text)
            sec_id = f"sec:{gid}:{anchor}:{start_line}"
            order = block_index_by_parent.get(parent_id, 0) + 1
            block_index_by_parent[parent_id] = order
            nodes.append({
                "@id": sec_id,
                "@type": "Section",
                "labels": ["Section"],
                "name": b.text,
                "chunk_text": f"{b.text}",
                "properties": {
                    "heading": b.text,
                    "level": b.level,
                    "anchor": anchor,
                    "order": order,
                },
                "metadata": meta_block,
            })
            _add_edge(edges, parent_id, "hasSection", sec_id, props={"order": order}, meta=meta_block)
            _add_sequence(edges, last_block_id, sec_id, meta=meta_block)
            last_block_id = sec_id
            section_stack.append((b.level, sec_id))
            current_section_id = sec_id
            semantic_sources.append({
                "blockId": sec_id,
                "blockType": "Section",
                "text": b.text,
                "meta": meta_block,
            })
            continue

        parent_id = current_section_id or doc_node_id
        order = block_index_by_parent.get(parent_id, 0) + 1
        block_index_by_parent[parent_id] = order

        if b.kind == "paragraph":
            p_id = f"blk:{gid}:p:{start_line}:{order}"
            nodes.append({
                "@id": p_id,
                "@type": "Paragraph",
                "labels": ["Paragraph"],
                "name": f"Paragraph {order}",
                "chunk_text": b.text[:800],
                "properties": {
                    "text": b.text,
                    "order": order,
                    "charCount": len(b.text),
                },
                "metadata": meta_block,
            })
            _add_edge(edges, parent_id, "hasBlock", p_id, props={"order": order}, meta=meta_block)
            _add_sequence(edges, last_block_id, p_id, meta=meta_block)
            last_block_id = p_id
            semantic_sources.append({
                "blockId": p_id,
                "blockType": "Paragraph",
                "text": b.text,
                "meta": meta_block,
            })

            for label, url in extract_links(b.text):
                link_id = f"link:{slugify(url)}"
                if link_id not in node_id_set:
                    nodes.append({
                        "@id": link_id,
                        "@type": "Link",
                        "labels": ["Link"],
                        "name": label,
                        "chunk_text": label[:800] if isinstance(label, str) else "",
                        "properties": {"url": url, "label": label},
                        "metadata": meta_block,
                    })
                    node_id_set.add(link_id)
                _add_edge(edges, p_id, "linksTo", link_id, props={"text": label}, meta=meta_block)

            for alt, url in extract_images(b.text):
                img_id = f"img:{slugify(url)}"
                if img_id not in node_id_set:
                    name = (alt or url).strip() if isinstance(alt, str) else url
                    nodes.append({
                        "@id": img_id,
                        "@type": "Image",
                        "labels": ["Image"],
                        "name": name,
                        "chunk_text": name[:800] if isinstance(name, str) else "",
                        "properties": {
                            "url": url,
                            "alt": alt,
                            "media_kind": "image",
                            "media_url": url,
                            "media": url,
                            "image": url,
                            "visual:shape": "rect",
                        },
                        "metadata": meta_block,
                    })
                    node_id_set.add(img_id)
                _add_edge(edges, p_id, "embedsImage", img_id, props={"alt": alt}, meta=meta_block)
            continue

        if b.kind == "code":
            c_id = f"blk:{gid}:code:{start_line}:{order}"
            props: Dict[str, Any] = {"code": b.text, "order": order, "charCount": len(b.text)}
            if b.extra and isinstance(b.extra.get("language"), str) and b.extra["language"].strip():
                props["language"] = b.extra["language"].strip()
            nodes.append({
                "@id": c_id,
                "@type": "CodeBlock",
                "labels": ["CodeBlock"],
                "name": f"Code {order}",
                "chunk_text": (b.text[:800] if b.text else ""),
                "properties": props,
                "metadata": meta_block,
            })
            _add_edge(edges, parent_id, "hasBlock", c_id, props={"order": order}, meta=meta_block)
            _add_sequence(edges, last_block_id, c_id, meta=meta_block)
            last_block_id = c_id
            semantic_sources.append({
                "blockId": c_id,
                "blockType": "CodeBlock",
                "text": b.text,
                "meta": meta_block,
            })
            continue

        if b.kind == "table":
            t_id = f"blk:{gid}:table:{start_line}:{order}"
            nodes.append({
                "@id": t_id,
                "@type": "Table",
                "labels": ["Table"],
                "name": f"Table {order}",
                "chunk_text": b.text[:800],
                "properties": {"markdown": b.text, "order": order},
                "metadata": meta_block,
            })
            _add_edge(edges, parent_id, "hasBlock", t_id, props={"order": order}, meta=meta_block)
            _add_sequence(edges, last_block_id, t_id, meta=meta_block)
            last_block_id = t_id
            semantic_sources.append({
                "blockId": t_id,
                "blockType": "Table",
                "text": b.text,
                "meta": meta_block,
            })
            continue

        if b.kind == "list":
            l_id = f"blk:{gid}:list:{start_line}:{order}"
            items = (b.extra or {}).get("items") if b.extra else None
            items_list = items if isinstance(items, list) else []
            nodes.append({
                "@id": l_id,
                "@type": "List",
                "labels": ["List"],
                "name": f"List {order}",
                "chunk_text": "\n".join([str((it or {}).get("text") or "") for it in items_list if isinstance(it, dict)])[:800],
                "properties": {"order": order},
                "metadata": meta_block,
            })
            _add_edge(edges, parent_id, "hasBlock", l_id, props={"order": order}, meta=meta_block)
            _add_sequence(edges, last_block_id, l_id, meta=meta_block)
            last_block_id = l_id
            for idx, item in enumerate(items_list):
                txt = item.get("text") if isinstance(item, dict) else ""
                it_id = f"blk:{gid}:li:{start_line}:{idx + 1}"
                nodes.append({
                    "@id": it_id,
                    "@type": "ListItem",
                    "labels": ["ListItem"],
                    "name": txt[:80] if isinstance(txt, str) and txt else f"Item {idx + 1}",
                    "chunk_text": (txt[:800] if isinstance(txt, str) else ""),
                    "properties": {
                        "text": txt,
                        "ordered": bool(item.get("ordered")) if isinstance(item, dict) else False,
                        "index": item.get("index") if isinstance(item, dict) else None,
                        "order": idx + 1,
                    },
                    "metadata": meta_block,
                })
                _add_edge(edges, l_id, "hasItem", it_id, props={"order": idx + 1}, meta=meta_block)
                if isinstance(txt, str) and txt.strip():
                    semantic_sources.append({
                        "blockId": it_id,
                        "blockType": "ListItem",
                        "text": txt,
                        "meta": meta_block,
                    })
            continue

def parse_markdown_text_to_graph_jsonld(
    markdown_text: str,
    *,
    graph_id: Optional[str] = None,
    agentic_rag_schema_url: str = DEFAULT_AGENTIC_RAG_SCHEMA_URL,
    agentic_rag_context_url: str = DEFAULT_AGENTIC_RAG_CONTEXT_URL,
    term_iri_base: str = DEFAULT_TERM_IRI_BASE,
    codebase_root: Optional[str] = None,
    source_path: Optional[str] = None,
    source_uri: Optional[str] = None,
    provenance_source: Optional[str] = None,
    layout_suggest: Optional[Dict[str, Any]] = None,
    semantic_enabled: Optional[bool] = None,
    semantic_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    raw = markdown_text or ""
    lines = split_lines(raw)
    fm, content_start = parse_frontmatter(lines)
    content_lines = lines[content_start:] if content_start > 0 else lines
    blocks = parse_blocks(content_lines)

    gid = str(graph_id or "").strip()
    if not gid:
        fm_gid = str(fm.get("graphId") or fm.get("graph_id") or fm.get("graph") or "").strip()
        if fm_gid:
            gid = fm_gid
    if not gid:
        gid = "md:x"

    fm_schema = str(fm.get("agenticRagSchema") or fm.get("agenticrag_schema") or "").strip()
    if fm_schema:
        agentic_rag_schema_url = fm_schema
    fm_context = str(fm.get("agenticRagContext") or fm.get("agenticrag_context") or "").strip()
    if fm_context:
        agentic_rag_context_url = fm_context
    fm_term_base = str(fm.get("termIriBase") or fm.get("term_iri_base") or "").strip()
    if fm_term_base:
        term_iri_base = fm_term_base

    doc_title = str(fm.get("title") or "").strip()
    if not doc_title:
        for b in blocks:
            if b.kind == "heading" and b.level == 1 and b.text.strip():
                doc_title = b.text.strip()
                break
    if not doc_title:
        doc_title = "Markdown Document"

    doc_node_id = f"doc:{gid}"
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []

    root_norm = os.path.abspath(codebase_root) if isinstance(codebase_root, str) and codebase_root.strip() else None
    rel_norm = safe_relpath(source_path, root_norm) if root_norm and source_path else None

    meta_args = {
        "provenance_source": provenance_source,
        "root_norm": root_norm,
        "rel_norm": rel_norm,
        "source_uri": source_uri,
        "source_path": source_path,
        "raw_content": raw
    }
    
    doc_props: Dict[str, Any] = {"format": "text/markdown", "graphId": gid}
    if rel_norm:
        doc_props["path"] = rel_norm
    if source_uri:
        doc_props["uri"] = source_uri
    elif source_path:
        doc_props["uri"] = f"file://{os.path.abspath(source_path)}"
    doc_chunk = f"{doc_title}\n\nSource: {rel_norm or source_path or 'inline'}"

    doc_meta = _make_meta(1, max(1, len(content_lines)), **meta_args)
    nodes.append({
        "@id": doc_node_id,
        "@type": "Document",
        "labels": ["Document"],
        "name": doc_title,
        "chunk_text": doc_chunk,
        "properties": doc_props,
        "metadata": doc_meta,
    })

    semantic_sources: List[Dict[str, Any]] = []
    _process_blocks(blocks, nodes, edges, semantic_sources, gid, doc_node_id, content_start, meta_args)

    # Semantic Processing
    semantic_enabled_value = semantic_enabled if isinstance(semantic_enabled, bool) else parse_bool(fm.get("semanticEnabled"))
    sem_enabled = True if semantic_enabled_value is None else bool(semantic_enabled_value)

    sem_defaults: Dict[str, Any] = {
        "phrase_boundary_threshold": env_float("KG_PHRASE_BOUNDARY_THRESHOLD", 0.75),
        "max_entity_span_tokens": env_int("KG_MAX_ENTITY_SPAN_TOKENS", 8),
        "coreference_distance_limit": env_int("KG_COREFERENCE_DISTANCE_LIMIT", 5),
        "edge_confidence_threshold": env_float("KG_EDGE_CONFIDENCE_THRESHOLD", 0.65),
        "max_syntactic_path_length": env_int("KG_MAX_SYNTACTIC_PATH_LENGTH", 4),
        "temporal_marker_boost": env_float("KG_TEMPORAL_MARKER_BOOST", 0.15),
        "auto_tune_enabled": env_bool("KG_AUTO_TUNE_ENABLED", True),
        "tuning_sensitivity": env_float("KG_TUNING_SENSITIVITY", 0.1),
        "feedback_window_size": env_int("KG_FEEDBACK_WINDOW_SIZE", 10),
        "min_pattern_support": env_float("KG_MIN_PATTERN_SUPPORT", 0.05),
        "emergent_relationship_threshold": env_float("KG_EMERGENT_RELATIONSHIP_THRESHOLD", 0.7),
        "corpus_centrality_algorithm": os.getenv("KG_CORPUS_CENTRALITY_ALGORITHM", "pagerank").strip() or "pagerank",
    }

    # Override defaults with frontmatter
    for k, v in {
        "phrase_boundary_threshold": fm.get("phraseBoundaryThreshold"),
        "max_entity_span_tokens": fm.get("maxEntitySpanTokens"),
        "coreference_distance_limit": fm.get("coreferenceDistanceLimit"),
        "edge_confidence_threshold": fm.get("edgeConfidenceThreshold"),
        "max_syntactic_path_length": fm.get("maxSyntacticPathLength"),
        "temporal_marker_boost": fm.get("temporalMarkerBoost"),
        "auto_tune_enabled": fm.get("autoTuneEnabled"),
        "tuning_sensitivity": fm.get("tuningSensitivity"),
        "feedback_window_size": fm.get("feedbackWindowSize"),
        "min_pattern_support": fm.get("minPatternSupport"),
        "emergent_relationship_threshold": fm.get("emergentRelationshipThreshold"),
        "corpus_centrality_algorithm": fm.get("corpusCentralityAlgorithm"),
    }.items():
        if v is None:
            continue
        if k == "corpus_centrality_algorithm":
            val = str(v or "").strip()
            if val:
                sem_defaults[k] = val
            continue
        if k == "auto_tune_enabled":
            b = parse_bool(v)
            if b is not None:
                sem_defaults[k] = bool(b)
            continue
        if k in {"max_entity_span_tokens", "max_syntactic_path_length", "coreference_distance_limit", "feedback_window_size"}:
            iv = parse_int(v)
            if iv is not None:
                sem_defaults[k] = int(iv)
            continue
        fv = parse_float(v)
        if fv is not None:
            sem_defaults[k] = float(fv)

    if isinstance(semantic_config, dict) and semantic_config:
        sem_defaults.update(semantic_config)

    semantic_doc_profile: Dict[str, Any] = {}
    if sem_enabled:
        from .semantic_processor import process_semantics

        semantic_doc_profile = process_semantics(
            semantic_sources,
            sem_defaults,
            gid,
            nodes,
            edges,
            _add_edge
        )

    vocab = str(term_iri_base or "").strip()
    if not vocab:
        vocab = DEFAULT_TERM_IRI_BASE
    ctx: Dict[str, Any] = {
        "@vocab": vocab,
        "labels": {"@container": "@list"},
        "embedding": {"@container": "@list"},
        "properties": {"@type": "@json"},
        "metadata": {"@type": "@json"},
        "source": {"@type": "@id"},
        "target": {"@type": "@id"},
    }

    doc_metadata: Dict[str, Any] = {
        "graphId": gid,
        "generatedAt": utc_now_iso(),
        "agenticRagSchema": agentic_rag_schema_url,
        "agenticRagContext": agentic_rag_context_url,
        "layoutMode": "tidy-tree",
        "tidyTree": {"edgeLabels": ["hasSection", "hasBlock", "hasItem"]},
        "defaultLayer": "semantic",
        "layers": {
            "semantic": {
                "nodeTypes": ["Entity"],
                "nodeMetrics": ["mentionCount", "blockFrequency", "centrality"],
                "edgeLabel": "coOccursWith",
                "edgeMetric": "pmi",
                "communityProperty": "communityId",
            },
            "documentStructure": {
                "nodeTypes": [
                    "Document",
                    "Section",
                    "Paragraph",
                    "CodeBlock",
                    "Table",
                    "List",
                    "ListItem",
                ],
                "edgeLabels": ["hasSection", "hasBlock", "hasItem", "next", "linksTo"],
            },
            "property": {
                "nodePropertyContainer": "properties",
                "edgePropertyContainer": "properties",
            },
        },
        "suggestedTraversalEdges": [
            "hasSection",
            "hasBlock",
            "hasItem",
            "linksTo",
            "next",
            "hasMention",
            "mentionOf",
            "refersTo",
            "semanticRelation",
            "coOccursWith",
        ],
    }
    traversal_default_depth = env_int("KG_TRAVERSAL_DEFAULT_DEPTH", 3)
    traversal_max_depth = env_int("KG_TRAVERSAL_MAX_DEPTH", 7)
    semantic_top_k = env_int("KG_SEMANTIC_SEARCH_TOP_K", 20)
    pattern_max_length = env_int("KG_PATTERN_MAX_LENGTH", 5)
    doc_metadata["retrievalStrategies"] = {
        "graphTraversal": {
            "enabled": True,
            "edgeLabels": list(doc_metadata.get("suggestedTraversalEdges", [])),
            "defaultDepth": traversal_default_depth,
            "maxDepth": traversal_max_depth,
        },
        "semanticSearch": {
            "enabled": True,
            "topK": semantic_top_k,
            "similarityThreshold": sem_defaults.get("edge_confidence_threshold"),
        },
        "patternMatching": {
            "enabled": True,
            "minSupport": sem_defaults.get("min_pattern_support"),
            "maxPatternLength": pattern_max_length,
        },
    }
    neutrality_tokens_env = os.getenv("KG_NEUTRALITY_FORBIDDEN_TOKENS", "").strip()
    neutrality_strict_env = os.getenv("KG_NEUTRALITY_STRICT", "").strip()
    if neutrality_tokens_env:
        doc_metadata["neutrality"] = {
            "forbiddenTokensEnvVar": "KG_NEUTRALITY_FORBIDDEN_TOKENS",
            "strictEnvVar": "KG_NEUTRALITY_STRICT",
            "strict": bool(neutrality_strict_env.lower() in ("1", "true", "yes", "on")),
        }
    for key in ("ontologies", "graphLayers"):
        if key in fm:
            value = fm.get(key)
            if isinstance(value, list):
                arr = value
            else:
                text = str(value).strip() if value is not None else ""
                arr = [text] if text else []
            doc_metadata[key] = arr
    if sem_enabled:
        doc_metadata["semanticConfig"] = sem_defaults
        if semantic_doc_profile:
            doc_metadata["documentProfile"] = semantic_doc_profile
        doc_metadata["semanticEnabled"] = True
    if isinstance(layout_suggest, dict) and layout_suggest:
        doc_metadata.update(layout_suggest)

    doc: Dict[str, Any] = {
        "@context": [agentic_rag_context_url, ctx] if agentic_rag_context_url else ctx,
        "@graph": nodes + edges,
        "metadata": doc_metadata,
    }
    return doc

def parse_markdown_to_graph_jsonld(
    markdown_path: str,
    codebase_root: Optional[str] = None,
    graph_id: Optional[str] = None,
    agentic_rag_schema_url: str = DEFAULT_AGENTIC_RAG_SCHEMA_URL,
    agentic_rag_context_url: str = DEFAULT_AGENTIC_RAG_CONTEXT_URL,
    term_iri_base: str = DEFAULT_TERM_IRI_BASE,
) -> Dict[str, Any]:
    abs_path = os.path.abspath(markdown_path)
    raw = read_text(abs_path)
    root = os.path.abspath(codebase_root) if codebase_root else find_repo_root(abs_path)
    rel = safe_relpath(abs_path, root)
    gid = (
        graph_id.strip()
        if isinstance(graph_id, str) and graph_id.strip()
        else f"md:{slugify(os.path.basename(abs_path))}"
    )
    # Strip extension for gid if desired, but basename is fine for now or follow original logic
    # Original logic: slugify(os.path.splitext(os.path.basename(abs_path))[0])
    # Let's match original exactly to be safe.
    gid = (
        graph_id.strip()
        if isinstance(graph_id, str) and graph_id.strip()
        else f"md:{slugify(os.path.splitext(os.path.basename(abs_path))[0])}"
    )
    
    return parse_markdown_text_to_graph_jsonld(
        raw,
        graph_id=gid,
        agentic_rag_schema_url=agentic_rag_schema_url,
        agentic_rag_context_url=agentic_rag_context_url,
        term_iri_base=term_iri_base,
        codebase_root=root,
        source_path=abs_path,
        source_uri=f"file://{abs_path}",
        provenance_source="knowgrph_parser.graph_builder",
    )
