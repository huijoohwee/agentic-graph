---
title: "Reference implementation: agentic-graph Import-to-Render Pipeline Deep Dive"
doc_type: "Technical Design Reference"
version: "1.0.1"
date: "2026-07-30"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.pipeline.import-render"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
---

# Reference implementation: agentic-graph Import-to-Render Pipeline Deep Dive

This reference has no well-formed VCC or attached Evidence Reference. Its local and delivered
rungs therefore remain `undocumented`; source-path descriptions below are not readiness evidence.

## Design Mantras

```
- [ ] Neutrality; preserve domain independence; forbid domain-coupled logic
- [ ] Determinism; stabilize derived artifacts; forbid non-idempotent recomputation
- [ ] Immutability; isolate store state; forbid renderer mutations of source data
- [ ] Performance; bound hot paths; forbid synchronous heavy computation on render
- [ ] Transparency; document pipeline stages; forbid opaque transformations
- [ ] Validation; gate build artifacts; forbid unchecked docs and schema drift
```

---

## Universal Design Principles

| Context        | Intent                            | Directive                                                                 |
|----------------|-----------------------------------|---------------------------------------------------------------------------|
| Data Flow      | Keep a unidirectional pipeline    | - [ ] Ingest → Store → Derive → Layout → Render; forbid circular updates |
| Derivation     | Compute stable render inputs      | - [ ] Derive from explicit config; forbid hidden dependencies             |
| Immutability   | Protect canonical graph state      | - [ ] Copy before render; forbid D3 mutations leaking into store          |
| Memoization    | Avoid redundant recomputation      | - [ ] Memoize by minimal deps; forbid re-derive on unrelated changes      |
| Performance    | Maintain UI responsiveness         | - [ ] Defer heavy work; forbid blocking operations in render              |
| Provenance     | Track transformation lineage       | - [ ] Attach metadata; forbid orphaned derived edges/nodes                |

---

## Pipeline Architecture

**Layer Stack**: Import → Parse → Normalize → Store → Derive (Layer Mode) → Layout → Render

**Processing Flow**: Source input → `GraphData` (store) → renderer graph snapshot → scene state → visual output (Canvas/exports).

**Multi-dimensional Table Flow**: Canonical `GraphData` (store) → persisted `GraphRecordDb` cache (`kg:graph-table`) → host Multi-dimensional Table fast-grid + Record Inspector view.

**Design Principles**: Config-driven derivation | single source of truth | bounded caches | stable references

```text
Source (URL / File / Workspace)
  │
  ▼
Import / Parse / Normalize
  │
  ▼
Canonical GraphData (Zustand store)
  ├──► Canvas branch
  │      ├─ Derive (layer mode: document / keyword / semantic / frontmatter)
  │      ├─ Layout (seed + cache + collision relax)
  │      └─ Render (2D/3D Canvas, Rich Media overlays, exports)
  │
  └──► Multi-dimensional Table branch
         ├─ Persisted GraphRecordDb cache (kg:graph-table: tables/columns/rows/views/meta)
         └─ Host Multi-dimensional Table workspace (fast-grid + Record Inspector)
```

---

## Pipeline Map (Loadable Graph)

**Artifact**: `docs/assets/agentic-graph-canvas-import-parse-derive-layout-render-pipeline-map.jsonld`

**Goal**: Load the repo’s own pipeline map into Canvas (nodes=modules/functions; edges=calls/artifacts) and use node `reference/documentUrl` links to jump to source.

**Load steps**:
- Toolbar → Source Files → Import → JSON‑LD → Local → select the JSON‑LD file above
- Optional: apply `data/config/schema/agentic-graph-universal-schema-config.jsonld` to get pipeline-friendly styles (`contains/calls/invokes/next`)

---

## Stage Specifications

### Stage 1: Import

**From/To**: User input → Loader → raw text/bytes → enables parser selection.

- UI import entrypoints (format-specific):
  - Markdown: [markdownImportAction.ts](../../canvas/src/features/toolbar/markdownImportAction.ts)
  - HTML → Markdown: [htmlImportAction.ts](../../canvas/src/features/toolbar/htmlImportAction.ts)
  - PDF → Markdown: [pdfImportAction.ts](../../canvas/src/features/toolbar/pdfImportAction.ts)
  - YouTube → Markdown (+ transcript JSON): [youtubeImportAction.ts](../../canvas/src/features/toolbar/youtubeImportAction.ts) (Source Files → YouTube)
  - JSON/JSON-LD/CSV: [jsonImportAction.ts](../../canvas/src/features/toolbar/jsonImportAction.ts)
- Local/URL loader bridge (markdown workspace): [useMarkdownLoader.ts](../../canvas/src/features/markdown-workspace/useMarkdownLoader.ts)
- Parser loader (text → GraphData): [loader.ts](../../canvas/src/features/parsers/loader.ts)
- Import side-effects (SSOT sync into Markdown Editor + Recents): [importSideEffects.ts](../../canvas/src/features/toolbar/importSideEffects.ts) (`applyImportedMarkdownToStore`)
- Dev/Preview in-repo artifact fetching (no absolute `/@fs` paths in client): [markdownPipelineActions.ts](../../canvas/src/features/panels/hooks/markdownPipelineActions.ts) via `GET /__codebase_file?path=<repoRel>`
- Responsibility (S-V-O): Import action reads source → resolves text → hands off to parser loader → updates store.

**YouTube import**:
- Status: Active. The import action calls `/__youtube_transcript` (Vite middleware) which runs `python3 -m agentic_graph_parser youtube --emit json` to produce:
  - Markdown for Markdown Editor/Preview/Slides
  - Transcript JSON for JSON-backed markdown workspace / UI Editor flows (`jsonSourceDocumentText`)

### Stage 2: Parse

**From/To**: Raw source → Parser registry → `GraphData` → enables store ingestion.

- Parser registry and execution:
  - Registry: [registry.ts](../../canvas/src/features/parsers/registry.ts)
  - Built-in parser specs: [default.ts](../../canvas/src/features/parsers/default.ts)
  - Loader entry: [loader.ts](../../canvas/src/features/parsers/loader.ts)
- Worker fast-path (for production/off-main-thread):
  - Client: [parseWorker.ts](../../canvas/src/lib/graph/parseWorker.ts)
  - Worker: [graphParser.worker.ts](../../canvas/src/workers/graphParser.worker.ts)
  - Bounded execution: singleton worker with per-request timeouts; returns `null` on timeout/error; resets worker on `onerror` (no indefinite hangs). Requests are abortable (optional `AbortSignal`) so stale work does not leak results or UI warnings. SSOT helper: [singletonWorkerClient.ts](../../canvas/src/lib/workers/singletonWorkerClient.ts)
- Parser result cache (prevents re-parse churn for identical inputs):
  - Cache surface: [cache.ts](../../canvas/src/features/parsers/cache.ts), [config.ts](../../canvas/src/features/parsers/config.ts)
  - Key SSOT: `parserId|name|hashText(text)|cfgKey` (bounded LRU + TTL); supports targeted invalidation by parser ID.
- HTML → Markdown async conversion (keeps UI responsive on large HTML):
  - Idle yielding: [idle.ts](../../canvas/src/features/panels/utils/idle.ts) via [html-parser.ts](../../canvas/src/features/parsers/html-parser.ts)
  - Unified fallback: [htmlToMarkdownUnified.ts](../../canvas/src/lib/markdown/htmlToMarkdownUnified.ts) (dynamic imports + bounded LRU cache)
- Format-specific worker parsing (when enabled):
  - Python Tree-sitter worker client: [tsWorkerClient.ts](../../canvas/src/features/parsers/python/tsWorkerClient.ts) (singleton worker + per-request timeout)
- Format adapter for `.csv/.json/.jsonld` and workflow bundles:
  - Adapter: [adapter.ts](../../canvas/src/lib/graph/io/adapter.ts)
- JSON-LD edge inference alignment (no surprise edges):
  - `@context` keys with `{"@type":"@id"}` are eligible to become edges
  - `metadata.jsonLdMapping.contextEdgeProperties` can be used as an explicit allow-list for relation keys when the context is incomplete
  - Implementation: [parseJsonLd](../../canvas/src/lib/graph/jsonld/parse.ts)
- Parse-time metrics (inspection only; no semantic coupling):
  - Markdown ingestion timings stored in `graphData.metadata.ingestionMetrics`: [default.ts](../../canvas/src/features/parsers/default.ts)
  - Agentic RAG pipeline metrics stored in `graphData.metadata.pipelineMetrics`: [agenticRag.ts](../../canvas/src/features/parsers/agenticRag.ts)
- Output contract (render + storage):
  - `GraphData { type, context?, metadata?, nodes, edges }`: [types.ts](../../canvas/src/lib/graph/types.ts)

### Stage 3: Normalize

**From/To**: Parsed `GraphData` → normalizers → consistent node/edge shape → enables deterministic downstream behavior.

- Edge normalization for simulation: [utils.ts](../../canvas/src/components/GraphCanvas/utils.ts)

### Stage 4: Store

**From/To**: `GraphData` → Zustand store → canonical application state → enables coordinated UI state.

- Store: `canvas/src/hooks/useGraphStore.ts`
- Canonical commit point:
  - Store slice: [graphDataSlice.ts](../../canvas/src/hooks/store/graphDataSlice.ts)
  - `setGraphData` enforces invariants (e.g. filters dangling edges) and bumps `graphDataRevision`.
- Derivations coupled to commit:
  - Derived field discovery: [graphFields.ts](../../canvas/src/features/graph-fields/graphFields.ts)
  - Sync visible columns and custom fields: [graphDataSliceUtils.ts](../../canvas/src/hooks/store/graphDataSliceUtils.ts)
- Table materialization (Multi-dimensional Table):
  - Persisted `GraphRecordDb` cache (`kg:graph-table`) receives `GraphData` via `syncGraphDataToGraphRecordDb`, writing normalized rows/columns/views/meta for the host Multi-dimensional Table workspace.
  - Sync is gated by revision + view key and reuses the same document-structure baseline graph used for render derivation.
- Responsibility (S-V-O): Store accepts graph data → validates edges → syncs derived fields → notifies subscribers.

### Stage 5: Derive (Layer Mode)

**From/To**: Canonical `GraphData` + schema layer config → derived render graph → enables filtered/augmented rendering.

- Derivation: [layerDerivation.ts](../../canvas/src/lib/graph/layerDerivation.ts)
- Layer modes:
  - `document`: assigns `properties["visual:layer"]` for structural layering
  - `keyword` (semantic mode): derives a keyword graph from active document text (or node labels as fallback) where Subject/Object/Entity keywords become nodes and Verb/Predicate/Relationship keywords become edges; removes common stopwords using the NLTK English stopword list; caches derived graphs by stable text hash; sets `properties["visual:nodeSize"]` by keyword frequency and `properties["visual:width"]` by edge strength for renderer reuse; supports runtime scaling via `schema.three.keywordNodeSizeScale` / `schema.three.keywordEdgeWidthScale`; maps `visual:community` → `visual:layer` so 2D groups and 3D Z-layering can stay consistent; merges media-capable nodes from the base graph so the media overlay toggle remains effective; debounces text-to-graph derivation (preview + full) via settings `keyword.graph.previewDebounceMs` and `keyword.graph.fullDebounceMs`; worker derivations are abortable to suppress stale results/toasts when inputs change rapidly; caches by `(algoVersion, docId, hashText(text))`: [useActiveGraphData.ts](../../canvas/src/hooks/useActiveGraphData.ts), [keywordGraph.ts](../../canvas/src/features/semantic-mode/keywordGraph.ts)
  - `schema`: filters out `Document` nodes to focus on entity/schema nodes
  - `semantic`: enriches with derived similarity edges and `properties["visual:community"]`
  - `frontmatter mode` (UI flag): filters to Mermaid nodes tagged as frontmatter (`mermaidScope` / `isMermaidFrontmatter`)

**Stability directives**:

| Context      | Intent                           | Directive                                                                 |
|--------------|----------------------------------|---------------------------------------------------------------------------|
| Isolation    | Prevent store mutation            | - [ ] Render copies nodes/edges; forbid simulation mutating store objects |
| Memoization  | Avoid redundant derivation        | - [ ] Depend on `schema.layers` only; forbid recompute on unrelated schema|
| Bounded Work | Keep semantic computation bounded | - [ ] Use thresholds/top-k; forbid unbounded pair expansion               |

### Stage 6: Layout

**From/To**: Derived render graph → layout engine → node positions → enables stable viewing.

- Layout selection and caching: [positioning.ts](../../canvas/src/components/GraphCanvas/layout/positioning.ts)
- Layout execution (seed + forces): [simulation.ts](../../canvas/src/components/GraphCanvas/simulation.ts)
- Initialization policy: apply cached positions when available and only reseed/recenter when missing/unstable; this prevents renderer switches from rewriting stable node positions. SSOT helper: [initializeGraphLayout](../../canvas/src/components/GraphCanvas/layout/initialization.ts)
- Collision stabilization (node + group AABB, nested no-touch): [collisionConfig.ts](../../canvas/src/components/GraphCanvas/layout/collisionConfig.ts), [groupOverlapByDepth.ts](../../canvas/src/components/GraphCanvas/layout/groupOverlapByDepth.ts)
  - Broadphase: packed R-tree (Morton/Z-order), O(n log n) neighborhood queries.
  - Nested containment: when a child group is a subset of a parent group, enforce an axis-specific inset margin (`layout.forces.groupBboxCollideNestedTouchEpsilon*`) so the child inner border never touches the parent border; Z only when `groupBboxCollideZEnabled` and both groups have explicit Z.
- Mermaid seeded placement (subgraph spread + centroid recenter): [mermaidSeed.ts](../../canvas/src/components/GraphCanvas/layout/mermaidSeed.ts)
- Mermaid direction parsing (LR/RL/TB/BT): [mermaidDirection.ts](../../canvas/src/components/GraphCanvas/layout/mermaidDirection.ts)
- Cache surface: `layoutPositionCacheByMode` keyed by `(semanticMode, frontmatterMode, layoutMode)` (e.g. `document:default:force`, `keyword:frontmatter:radial`)

### Stage 7: Render

**From/To**: Positioned render graph → scene builder → DOM/SVG updates → enables interaction.

- Render entrypoint: [GraphCanvas.tsx](../../canvas/src/components/GraphCanvas.tsx)
- 3D render entrypoint: [ThreeGraph.impl.tsx](../../canvas/src/lib/three/ThreeGraph.impl.tsx)
- Scene orchestration: [scene.ts](../../canvas/src/components/GraphCanvas/scene.ts)
- Scene layers barrel: [sceneLayers.ts](../../canvas/src/components/GraphCanvas/sceneLayers.ts)
- Presentation updates (no simulation rebuild): [scene.ts](../../canvas/src/components/GraphCanvas/scene.ts)
- Scene derivation caches (prevents re-derive churn on render):
  - Group derivation LRU keyed by graph meta + revision/layer hash + schema group config: [sceneDerivation.ts](../../canvas/src/lib/scene/sceneDerivation.ts)
- UI performance instrumentation (opt-in):
  - Selection latency metric emitted as `CustomEvent('kg-selection-perf')`: [selectionPerf.ts](../../canvas/src/lib/selectionPerf.ts)
- Typography and icon alignment (render fidelity + UI consistency):
  - Node label anchoring and baseline: [labels.ts](../../canvas/src/components/GraphCanvas/layers/labels.ts)
  - Edge label baseline: [edgeLabels.ts](../../canvas/src/components/GraphCanvas/layers/edgeLabels.ts)
  - UI icon baseline alignment (Lucide): [index.css](../../canvas/src/index.css)
- Table surfaces (Multi-dimensional Table):
  - Host Graph Data Table workspace renders a canvas fast-grid over the persisted `GraphRecordDb` materialization and shares the same derived `GraphData` and collapse state used by Canvas.
- UI surfaces:
  - UI icon+text alignment in controls: [GraphDataTableUiPrimitives.tsx](../../canvas/src/features/graph-data-table/ui/GraphDataTableUiPrimitives.tsx)

**Invariant**: UI toggles that affect presentation only (node shape, port handles, group overlay shape, media-as-nodes) update layers in-place and do not trigger re-layout or simulation rebuild.

---

## Component Responsibility Matrix

| Stage | Path/Module | Component | Responsibility (S-V-O) | Input | Output |
|------:|-------------|-----------|-------------------------|-------|--------|
| 1 | `canvas/src/features/parsers/loader.ts` | Loader | Loader reads input → returns parse payload | Source path/bytes | Raw content |
| 2 | `canvas/src/features/parsers/*` | Parser | Parser transforms content → emits graph | Raw content | `GraphData` |
| 4 | `canvas/src/hooks/useGraphStore.ts` | Store | Store persists graph → exposes selectors | `GraphData` | State |
| 5 | `canvas/src/hooks/useActiveGraphData.ts`, `canvas/src/features/semantic-mode/keywordGraph.ts`, `canvas/src/lib/graph/layerDerivation.ts` | Deriver | Deriver selects/derives graph → returns render graph | State + schema | Render graph |
| 6 | `canvas/src/components/GraphCanvas/layout/positioning.ts` | Layout | Layout computes/reuses positions → returns cache decision | Render graph | Positions |
| 7 | `canvas/src/components/GraphCanvas/scene.ts` | Renderer | Renderer builds scene → updates SVG | Render graph + positions | Visual output |

---

## Cross-Repo Documentation Map (AgenticRAG)

- All Canvas pipeline docs under `agentic-graph/docs/documents` are indexed into a JSON-LD documentation graph at `huijoohwee.github.io/schema/AgenticRAG/agentic-graph-documents-map.graph.jsonld`.
- The map is validated via `python3 schema/AgenticRAG/sync_map.py --mode check` in the `huijoohwee.github.io` repo; this ensures cross-repo references stay aligned when pipeline behavior or docs change.
- AgenticRAG schemas (`canvas.jsonld`, `pipeline.jsonld`, `markdown.jsonld`) describe the same import→parse→store→render pipeline and reference these agentic-graph docs as implementation notes; changes to pipeline stages in code must be reflected in both the docs here and the mapped schema comments.
