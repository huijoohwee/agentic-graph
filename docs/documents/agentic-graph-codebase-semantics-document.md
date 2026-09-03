# agentic-graph Codebase Semantics: Universal Index-to-Render Specification

## Design Mantras

```
- [ ] Neutrality; represent codebases generically; forbid project-specific assumptions
- [ ] Provenance; track origins and paths; forbid metadata loss
- [ ] Determinism; canonicalize identifiers; forbid unstable IDs
- [ ] Separation; decouple indexer from renderer; forbid cross-layer imports
- [ ] Performance; bound traversal operations; forbid unbounded scans in UI
```

---

## Universal Design Principles

| Context      | Intent                         | Directive                                                                    |
|--------------|--------------------------------|------------------------------------------------------------------------------|
| Identifiers  | Keep IDs stable across runs     | - [ ] Normalize paths; forbid platform-specific or absolute-path identifiers |
| Semantics    | Preserve meaning in structures  | - [ ] Encode relationships as edges; forbid implicit link semantics          |
| Provenance   | Trace every derived artifact    | - [ ] Attach source/timestamp; forbid orphaned nodes/edges                   |
| Integration  | Maintain clear contracts        | - [ ] Exchange JSON-LD only; forbid renderer depending on Python internals   |
| Traversal    | Keep traversal bounded          | - [ ] Configure depth/labels; forbid hidden traversal rules                  |

---

## Semantic Layers

**Index Layer**: Files, symbols, and references represented as nodes/edges in JSON-LD.

**Traversal Layer**: Configured edge labels and hop patterns used by GraphRAG-like retrieval.

**Render Layer**: Canvas derives views (layer modes + layout modes) from the same JSON-LD graph.

---

## Performance Safeguards

| Context     | Intent                      | Directive |
|------------|-----------------------------|----------|
| Semantics  | Bound sentence pair growth  | - [ ] Cap per-sentence entity pairing by `max_syntactic_path_length`; forbid O(m²) explosions |
| Patterns   | Bound block co-occurrences  | - [ ] Cap per-block entity set size for pattern mining; forbid O(k²) scans on large blocks |
| Counting   | Avoid repeated full scans    | - [ ] Compute mention counts in one pass; forbid O(E·M) rescans |
| Ignore     | Avoid repeated path checks   | - [ ] Precompile ignore matcher + cache per-path results; forbid repeated per-node pattern normalization |

---

## Import-to-Render Bridge

| Stage | Input | Output | Contract |
|------:|-------|--------|----------|
| Index | Codebase files | Index JSON-LD | `@context`, `@graph`, `metadata` required |
| Import | JSON-LD file | `GraphData` | Node/edge arrays normalized |
| Derive | `GraphData` + schema | Render graph | Layer-mode specific filtering/enrichment |
| Render | Render graph | Canvas scene | No mutation of store graph data |

**Context alignment rule**:
- When a graph declares the AgenticRAG context IRI, Canvas materializes `GraphData.context` as an object with `@vocab` + minimal `@type:@id` terms (e.g., `source/target/documentUrl/reference`) so edge inference and UI diagnostics stay schema-aligned.

---

## Primary References

- Codebase index architecture: [agentic-graph-codebase-index-document.md](agentic-graph-codebase-index-document.md)
- Pipeline overview: [agentic-graph-pipeline-document.md](agentic-graph-pipeline-document.md)
- Renderer behavior: [agentic-graph-renderer-document.md](agentic-graph-renderer-document.md)
