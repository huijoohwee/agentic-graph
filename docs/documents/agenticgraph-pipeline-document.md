---
title: "Reference implementation: AgenticGraph Graph Pipeline"
doc_type: "Technical Design Reference"
version: "1.0.1"
date: "2026-07-30"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.pipeline.graph"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
---

# Reference implementation: AgenticGraph Graph Pipeline

This legacy reference has no well-formed VCC or attached Evidence Reference. Its local and
delivered rungs therefore remain `undocumented`; checklists and source-path inventories below do
not establish a readiness claim.

## Design Mantras

```
- [ ] Configurability; externalize thresholds; forbid hardcoded parameters
- [ ] Neutrality; compute statistical features; forbid domain vocabularies
- [ ] Reproducibility; track all decisions; forbid non-deterministic behavior
- [ ] Composability; stack independent layers; forbid monolithic processing
- [ ] Observability; expose quality metrics; forbid black-box pipelines
- [ ] Validation; test across corpora; forbid single-domain optimization
- [ ] Separation; isolate ML from domain; forbid embedded ontologies
```

---

## Universal Design Principles

| Context             | Intent                              | Directive                                                                                      |
|---------------------|-------------------------------------|------------------------------------------------------------------------------------------------|
| Feature Engineering | Compute statistical signals         | - [ ] Extract numerical features; apply transforms; forbid vocabulary lookups                 |
| Token Linking       | Merge spans via coherence           | - [ ] Use embedding similarity; configure thresholds; forbid term lists                       |
| Edge Scoring        | Weight relationships numerically    | - [ ] Combine syntactic/semantic features; forbid pattern matching on entity types            |
| Threshold Selection | Optimize on validation sets         | - [ ] Grid search with stratified splits; target metrics; forbid manual tuning                |
| Entity Unification  | Consolidate equivalent entities     | - [ ] Compute canonical entity IDs; merge deterministically; forbid identity assumptions      |
| Quality Monitoring  | Track metrics continuously          | - [ ] Maintain rolling windows; detect drift; forbid silent degradation                       |
| Corpus Reasoning    | Aggregate graph-wide patterns       | - [ ] Compute centrality; mine frequent patterns; forbid dataset-specific heuristics          |
| Query Execution     | Fuse multi-strategy retrieval       | - [ ] Parse to features; rank by confidence; forbid hardcoded query templates                 |
| Neutrality Testing  | Validate across domains             | - [ ] Run on diverse corpora; measure consistency; forbid domain-dependent metrics            |
| Reproducibility     | Version all artifacts               | - [ ] Hash configuration and data; seed randomness; forbid environment dependencies           |
| Configuration       | Expose all behavior externally      | - [ ] Define YAML schemas; document defaults; forbid embedded constants                       |
| Environment Wiring  | Control via env variables           | - [ ] Map variables to paths; inject at runtime; forbid hardcoded file locations             |

---

## Agentic GraphRAG/Knowledge Graph Pipeline Guidelines

## COMPLY
`/GitHub/{huijoohwee.github.io/guidelines/{codebase-neutrality-guidelines.md,codebase-maintainability-guidelines.md},agentic-canvas-os/docs/{AGENTS.md,TODO.md}}`

## ALIGN (Semantic Definition)
- **GRAPHS Elements:** nodes, edges, graph layers (subgraphs, groups, clusters, communities), labels, text
- **GRAPHS Configs:** grouping, positioning, collisions, timing, knobs

## Pipeline Discipline (Runtime Import → Render)
- Scope: `/GitHub/{agenticgraph,gympgrph,singabldr}` → import → render.
- Support repo-owned fixtures under `data/test-data/` plus explicit operator-provided fixture paths; no implicit sibling-checkout dependencies.
- Centralize configs (labels, boxes, collisions, timing, knobs); reuse shared utilities.
- For arbitrary JSON ingest, render only explicit graph entities (`nodes`/`edges`); forbid synthetic placeholder/fallback graph construction when entities are absent.
- Keep the computing-flow sample and its pipeline docs aligned as the canonical ingest→parse→render fixture/docs pair; oversized docs may split into companion files, but the original filename remains the sub-600 canonical index with continuation links.
- Long-horizon SuperAgent harness metadata is upstream orchestration context only: it may plan research, code, and create slices, but parser, GraphData, Storyboard Widget, and Rich Media Panel ownership must remain on the shared ingest→parse→render pipeline.
- DeerFlow may inform harness concepts or act as an optional provider gateway; do not copy DeerFlow code, architecture, prompts, skills, memory layout, or create DeerFlow-specific parser/render/apply branches.
- Embedded Markdown GeoJSON must extract requests through one shared helper, then reuse the same graph-load and geospatial auto-enable contract as file imports.
- Resolve cross‑repo conflicts; remove legacy/conflicting/stale code.
- Test only bounded diffs; forbid indefinite runs.

### HackaMap Public Graph Contract

| Context | Directive | Why |
|--------|-----------|-----|
| SSOT | Keep `project/prjt4000-hackamap/site/hackamap-pipeline.json` as the only browser-fetchable HackaMap runtime contract. | Prevent duplicate config paths across scrape, query, publish, dev, and Pages hosts. |
| Runtime API | Expose `/api/graph?view=meta` from dev and Pages using published pipeline, preset, and run artifacts. | Let AgenticGraph read portable runtime knobs and published run options without a second manifest. |
| Published runs | Allow `/api/graph?run=<published-run-id>` to filter the precomputed Flowchart payload by published `events.*.query.json` and `demos.*.query.json` rows only. | Reuse generated query outputs, avoid ad-hoc runtime queries, and keep filtering deterministic. |
| Published-run builder | Compose preset + parameter choices only from published run metadata, compact table counts, highlight top exact-match families, and apply exact matches only. | Keep the public UI safe, deterministic, and easy to scan without ad-hoc query execution. |
| Published run expansion | Grow builder choices by adding verified non-empty city variants with stable suffixes in the SSOT runs catalog. | Improve exact-match usefulness without changing the runtime contract. |
| Published year-series | Add a parameterized published year preset with exact `2024`/`2025`/`2026` runs. | Give the builder a trustworthy second parameter axis with real event and demo subsets. |
| Mobile/PWA | Keep mobile-first behavior source-driven in `agenticgraph/canvas`; consume published `runtime.mobile_pwa` for compact Flowchart controls and safe-area spacing, and mirror generated install metadata via Pages sync. | Avoid hand-edited deploy artifacts, duplicate viewport heuristics, and drift between source and public PWA UX. |
| PWA revision-safe cache | Keep HTML network-owned, precache exact-revision `assets/*` chunks, bypass HTTP caches for the top-level worker and both mutable imports, cache same-origin JSON/JSON-LD/webmanifest payloads, and expose Canvas plus Editor shortcuts from the manifest. | Prevent an old worker or cached imported authority/lifecycle script from projecting a retired release while retaining source-owned install and asset-cache behavior. |
| PWA runtime state | Publish installed-shell/display-mode state from one shared runtime helper, bind immediate plus bounded foreground/online checks to the registered worker, keep failed checks immediately eligible for online recovery, and prune response-typed cached HTML plus prior-revision assets only after the activated controller attests its build revision. | Converge long-lived clients on one canonical revision without deploy-only cache clearing, retained `kg-assets` generations, a failed-update blind spot, successor deletion by an old tab, or duplicate lifecycle state. |
| PWA display modes | Track `standalone`, `fullscreen`, and `minimal-ui` from one runtime helper and publish root datasets for display/install/asset-cache state. | Keep installed-shell UX observable and CSS-driven across mobile relaunch paths without duplicate PWA state stores. |
| Canvas touch ergonomics | Keep toolbar touch sizing, narrow-toolbar overflow handling, viewport touch pan slop, node/group drag intent thresholds, collapsed-group chevron hit targets, resize-handle touch tolerance, active resize feedback with stronger outline/label emphasis, parent/child semantic emphasis, inset handle anchoring, exclusive active handle ownership, active-shape layer raising, and root-owned motion-token transition recipes reused by graph chrome plus action buttons/viewer buttons. | Improve coarse-pointer usability without adding duplicate mobile state or per-surface button forks. |
| Loader telemetry | Finalize `loader:all` for no-match, empty-result, cache-hit, and markdown-fallback paths, and emit a dedicated markdown fallback stage. | Keep ingest→parse→render timing complete, comparable, and free of stale partial metrics. |
| Source-file ingest dedupe | Skip duplicate pending parses when the same source-file text hash is already loading, while preserving stale-job and latest-hash guards before writeback. | Reduce repeated ingest→parse→compose churn during rapid local or URL import updates without changing parser/store SSOT. |
| Frontmatter flow templating | Resolve frontmatter values first, then a second pass of dotted node-scoped refs such as `{{node.data.key}}` before edge labels and node payloads finalize. | Keep markdown sample imports deterministic and prevent stale literal refs from leaking into rendered flow labels. |
| Flowchart source neutrality | Normalize API, fixture, and workspace Flowchart payloads through one source-meta contract and shared edge roles. | Forbid filename-gated workspace JSON detection, sample fallback content, or `/api/graph`-specific styling assumptions in the 2D Flowchart path. |
| Flowchart fixture route | Serve `/__flowchart_fixture` from sibling `hackamap-flowchart-fixture.json` files, with `AGENTICGRAPH_FLOWCHART_FIXTURE_PATH` as the explicit override. | Keep canvas, sibling content/project trees, and local overrides aligned on one fixture basename without stale legacy route aliases. |
| Flowchart workspace source identity | Use neutral workspace source/context ids and inline parse hints in shared workspace JSON fallback parsing. | Prevent residual fake `.json` names or `workspace-json` tokens from leaking file-specific assumptions into the Flowchart workspace path. |
| 2D renderer family neutrality | Centralize D3-like, surface-mount, and minimap decisions in shared renderer helpers; keep workspace JSON fallback parsing generic and workspace flowchart payloads source-tagged. | Reduce branch duplication across D3/Flowchart/Flow Canvas/Design/Storyboard and avoid file-specific fallback cues in the shared 2D pipeline. |
| Adjacent 2D helper neutrality | Reuse shared renderer-id and family helpers in persistence, store bootstrap/setters, minimap/editor gating, and D3 scene/schema activation. | Prevent stale inline allowlists and repeated D3/Flowchart or Storyboard Widget checks in adjacent surfaces after host-level cleanup. |

### Markdown Workspace Import Stability

- Bulk imports must batch change notifications so the UI refreshes once per import, not per file.
- Import actions must be order-safe: late async completions must not steal focus from the current document.
- Source-file ingest must dedupe same-text pending parses and keep latest-text hash verification before state writeback.
- Workspace initialization seeds must load source text from `huijoohwee/docs`, materialize the canonical 3-file family at workspace root (`/README.md`, `/agenticgraph-video-demo.md`, `/agenticgraph-maps-grabmap-multim-demo.md`), and keep those root-level workspace paths as the activation/source-file ids.
- Initialization-file frontmatter remains the Canvas View SSOT: `README.md` selects D3 + Frontmatter Mode, `agenticgraph-video-demo.md` selects Storyboard Widget + Frontmatter Mode, and `agenticgraph-maps-grabmap-multim-demo.md` selects Geospatial Mode.
- Exact UI imports must promote the first imported preset document to the active explorer/document authority before composed source-file replay, so stale previously selected docs cannot overwrite the imported file's frontmatter-selected renderer or surface mode.
- Post-parse layout autosuggest and other metadata helpers must not override explicit initialization-file frontmatter renderer or surface choices.

## Runtime Canvas Pipeline (Import → Render)

This section is the end-to-end *runtime* pipeline inside the Canvas app: user imports text/data → parsers normalize into `GraphData` → store commits → Canvas and Multi-dimensional Table render from the same derived `GraphData`. It is schema-driven and domain-agnostic: node `type` / edge `label` are treated as opaque strings and all domain fields live under `properties`/`metadata` per the AgenticRAG structural contract.

When changing shared packages that are wired via `file:` links (for example `singabldr` or `gympgrph`), restart or rebuild the Canvas dev server so the preview reflects the current checkout and not a stale build.

### Guardrails: No Synthetic Render Data

- `rawToGraphData` must output non-empty graph nodes/edges only from explicit input graph entities.
- If input payloads do not contain valid `nodes` or `edges` arrays, the runtime returns an empty graph envelope (`metadata.empty=true`) instead of inferred placeholder graph content.
- Renderer surfaces must treat this empty envelope as “no data available,” not as a signal to synthesize display nodes.
- `superagent_harness_template`, `superagent_harness_demo`, and related long-horizon metadata must remain metadata unless authored under `flow:` as explicit graph nodes and edges.

### Happy Path Call Graphs (Functions Only)

#### Journey 1: Import JSON/CSV → See Nodes On MapLibre

- `ToolbarToolMenu` and the shared toolbar actions dispatch a format import action → [ToolbarToolMenu.impl.tsx](../../canvas/src/lib/toolbar/ToolbarToolMenu.impl.tsx) and [useToolbarActions.ts](../../canvas/src/features/toolbar/hooks/useToolbarActions.ts)
- The selected Source Files import action resolves `importLocal` or `importUrl` with the requested JSON/CSV format → `performJsonImport` / `performCsvImport`
- `performJsonImport` / `performCsvImport` → [runImportFlow](../../canvas/src/features/toolbar/importFlow.ts) → [loadGraphDataFromTextViaParser](../../canvas/src/features/parsers/loader.ts)
- `loadGraphDataFromTextViaParser` → `bestMatch` → `applyParserAsync` → `useGraphStore.getState().setGraphData(graphData)`
- `GraphCanvas` reads `graphData` → renders nodes/edges → [GraphCanvas](../../canvas/src/components/GraphCanvas.tsx)
- `Canvas` passes `graphData + zoomState + selection` into `gympgrph` hosts → [Canvas](../../canvas/src/pages/Canvas.tsx)
- `GeospatialOverlayHost` applies snapshot into gympgrph store → `gympgrph/src/hostBridge.ts` (`applyHostSnapshot`)
- `GeospatialOverlay` builds GeoJSON points from graph nodes → ensures MapLibre sources/layers → `gympgrph/src/features/geospatial/GeospatialOverlay.tsx`
- `useMapLibreBasemap` creates the MapLibre map instance + style → `gympgrph/src/features/geospatial/useMapLibreBasemap.ts`

#### Journey 2: Click Map POI → Host Selects Node → Canvas + Map Highlight

- Map click event → `GeospatialOverlay.onClick` → `gympgrph/src/features/geospatial/GeospatialOverlay.tsx`
- `pickPoiSelection(...)` returns `{ kind: 'graph-node', nodeId }` → `gympgrph/src/features/geospatial/geospatialPoiSelection.ts`
- `selectNode(nodeId)` (host handler injected via `setHostHandlers`) → updates AgenticGraph `useGraphStore.selectedNodeId` → [Canvas](../../canvas/src/pages/Canvas.tsx)
- `GraphCanvas` reads `selectedNodeId` → updates selection highlight
- `Canvas` snapshots `selectedNodeId/selectedNodeIds` back into gympgrph → `applyHostSnapshot` updates gympgrph store
- `GeospatialOverlay` reacts to `selectedNodeId/selectedNodeIds` → `map.setFilter(GRAPH_SELECTED_LAYER_ID, ...)` highlights the selected node layer

#### Journey 3: Import Widget Bundle → Open Storyboard Widget → See Port-bound Edges

- Toolbar import action reads local JSON and routes through the shared parser loader:
  - [jsonImportAction.ts](../../canvas/src/features/toolbar/jsonImportAction.ts)
  - [importFlow.ts](../../canvas/src/features/toolbar/importFlow.ts)
  - [loader.ts](../../canvas/src/features/parsers/loader.ts)
- JSON adapter detects `kg:flow:widgetBundle` (kind/version) and writes registry entries to `GraphData.metadata['flow:widgetRegistry']`:
  - [widgetImport.ts](../../canvas/src/lib/graph/io/widgetImport.ts)
  - [adapter.ts](../../canvas/src/lib/graph/io/adapter.ts)
- Store commit applies registry metadata into the Storyboard Widget Manager snapshot and enables immediate Storyboard Widget rendering:
  - [graphDataSlice.ts](../../canvas/src/hooks/store/graphDataSlice.ts)
  - [graphDataSliceUtils.ts](../../canvas/src/hooks/store/graphDataSliceUtils.ts)
- Storyboard Widget renders the graph using the shared native Flow runtime (edges use the same 2D Flow edge path; no overlay-only edge renderer):
  - [StoryboardWidgetCanvas.tsx](../../canvas/src/components/StoryboardWidgetCanvas.tsx)
  - [FlowCanvas.tsx](../../canvas/src/components/FlowCanvas.tsx)

### Import

- Toolbar import actions read local files/URLs and call the parser loader:
  - [jsonImportAction.ts](../../canvas/src/features/toolbar/jsonImportAction.ts)
  - [importSideEffects.ts](../../canvas/src/features/toolbar/importSideEffects.ts)
- YouTube import uses an end-to-end native local in-repo pipeline (no external API dependencies) to fetch transcripts/metadata via `youtube_cmd.py` (timedtext/InnerTube) and convert them to Markdown/JSON before following the standard loader path:
  - [youtubeImportAction.ts](../../canvas/src/features/toolbar/youtubeImportAction.ts)
  - [youtube_cmd.py](../../agenticgraph_parser/youtube_cmd.py)

### Parse + Normalize

- Parser selection and orchestration (best-match + optional worker parsing):
  - [loader.ts](../../canvas/src/features/parsers/loader.ts)
  - [registry.ts](../../canvas/src/features/parsers/registry.ts)
  - [graphParser.worker.ts](../../canvas/src/workers/graphParser.worker.ts)
- Format adapters (CSV/JSON/JSON-LD/GeoJSON/record arrays/GraphRAG bundle/n8n):
  - [adapter.ts](../../canvas/src/lib/graph/io/adapter.ts)
- JSON-LD structural interpretation + AgenticRAG context handling:
  - [parse.ts](../../canvas/src/lib/graph/jsonld/parse.ts)
  - [agenticrag.ts](../../canvas/src/lib/agenticrag.ts)

### Validate + Store

- Structural validation (duplicate IDs, dangling edges) + optional schema-config property checks:
  - [validation.ts](../../canvas/src/lib/graph/validation.ts)
- Store commit is centralized in the graph slice (`setGraphData`), which also persists and normalizes:
  - [graphDataSlice.ts](../../canvas/src/hooks/store/graphDataSlice.ts)

### Render

- Render consumes the active `GraphData` view and applies schema-config-driven layout/styling:
  - [GraphCanvas.tsx](../../canvas/src/components/GraphCanvas.tsx)
- Active `GraphData` for rendering is SSOT-derived to keep Canvas/D3, Flow, Multi-dimensional Table (`MultiDimTableSurface` over the Markdown data-view renderer), Graph Fields, and Props/Node Editor consistent:
  - Canonical hook: `useActiveGraphRenderData()` (`agenticgraph/canvas/src/hooks/useActiveGraphData.ts`)
  - Derivation order: keyword semantic mode base → optional frontmatter Mermaid filter (document mode only) → optional group collapse (`collapsedGroupIds`)
  - Example SSOT consumers (host): `PreviewPanelView`, `DatasetInspectorSection`, `MultiDimTableSurface`
  - Bounded regression test: `canvas/src/__tests__/graphRecordDb.test.ts` (`testGraphRecordDbSyncsCollapsedGraphViewRows`)
- Layout + zoom correctness at runtime:
  - Layout position caches are isolated by all render-affecting toggles (datasetKey, semantic/frontmatter/layout, renderMode/renderVariant/layoutVariant/viewKey, mediaPanelDensity, renderMediaAsNodes) to prevent cross-mode contamination.
  - Fit-to-screen and zoom-to-selection must react to viewport changes (resize/UI chrome) and must no-op when the view is pinned.

### Schema Contract (SSOT)

- Structural JSON-LD contract: `huijoohwee.github.io/schema/AgenticRAG/README.md`
- The Canvas app resolves schema URLs via `VITE_AGENTIC_RAG_SCHEMA_URL` (fallback: `/schema/AgenticRAG`):
  - [agenticrag.ts](../../canvas/src/lib/agenticrag.ts)

## Pipeline Architecture

**Layer Stack**: Document Ingestion → Statistical Features → Token Linking → Edge Elevation → Threshold Tuning → Document Unification → Feedback Loops → Corpus Reasoning → Agentic RAG

**Processing Flow**: Configuration → Feature Extraction → Graph Construction → Quality Monitoring → Query Execution

**Design Principles**: ML-inspired stages | configuration-driven behavior | domain-agnostic features | reproducible experiments

### Integration Bridge: ML Pipeline → Graph Construction

| ML Stage                    | GraphRAG Equivalent                          | Configuration Controls                                    |
|-----------------------------|----------------------------------------------|-----------------------------------------------------------|
| Data Loading                | Document ingestion into neutral graph        | Loader type, connection params, schema discovery          |
| Feature Engineering         | Statistical computation on tokens/spans      | Window sizes, aggregation methods, normalization          |
| Preprocessing               | Structural normalization, schema validation  | Ignore patterns, validation rules, provenance tracking    |
| Model Training              | Threshold tuning via grid search             | Search spaces, validation strategy, optimization objective|
| Model Evaluation            | Quality monitoring and drift detection       | Metric targets, degradation thresholds, check intervals   |
| Prediction                  | Entity extraction and edge construction      | Confidence thresholds, merge strategies, canonical IDs      |
| Inference                   | Agentic query execution with multi-retrieval | Traversal depth, fusion methods, ranking models           |

---

## Layer 0: Configuration-Driven Architecture

**Universal schema specification**: Configuration → controls all pipeline behavior → eliminates hardcoded domain logic → enables arbitrary corpus processing.

**Configuration Schema (core sections)**:

```yaml
document_sources: {loader_type, connection_params, schema_discovery}
token_linking: {coherence_threshold, max_syntactic_distance, merge_strategy}
edge_elevation: {feature_weights, feature_transforms, boosts}
threshold_tuning: {validation_strategy, search_spaces, optimization}
document_unification: {similarity_metric, merge_threshold, inference_depth}
feedback_loops: {monitoring, quality_targets, degradation_detection, retuning}
corpus_reasoning: {centrality_metrics, pattern_mining, interaction_analysis}
agentic_rag: {query_parsing, retrieval_strategies, fusion, reranking, context_extraction}
provenance_tracking: {track_lineage, versioning_strategy}
```

| Context          | Intent                     | Directive                                                                                   | Module         | Class/Object   | Function/Method  | Dependency      | Input            | Output           | Decision Logic                   |
|------------------|----------------------------|---------------------------------------------------------------------------------------------|----------------|----------------|------------------|-----------------|------------------|------------------|----------------------------------|
| Schema Loading   | Parse YAML configuration   | - [ ] Validate all sections; check types/ranges; forbid invalid configs                    | config_loader  | ConfigLoader   | load_config      | yaml, jsonschema| YAML file path   | Config dict      | jsonschema validation strict mode|
| Default Merging  | Apply sensible defaults    | - [ ] Merge user config with defaults; document all defaults; forbid implicit behavior     | config_loader  | ConfigLoader   | merge_defaults   | —               | User config, defaults | Merged config | dict.update() with precedence    |
| Env Injection    | Override via environment   | - [ ] Map env vars to config keys; validate types; forbid undocumented variables          | config_loader  | ConfigLoader   | inject_env       | os              | Environment dict | Patched config   | Prefix-based key matching        |

---

## Layer 0.5: Statistical Feature Engineering

**From raw tokens to neutral features**: Layer → computes statistical features on tokens and spans → avoids vocabulary lists and domain ontologies → enables domain-agnostic processing.

**Features Computed**: Embedding Coherence | Syntactic Distance | Capitalization Patterns | Token Frequency | Sentence Complexity | Vocabulary Diversity | Temporal Density

**Configuration Schema**: `{embedding_coherence: {window_size, aggregation, similarity_metric}, syntactic_distance: {max_path_length, normalization}, frequency_analysis: {min_frequency, smoothing}, complexity_metrics: {percentile_clip, aggregation}}`

| Context              | Intent                          | Directive                                                                                   | Module            | Class/Object      | Function/Method      | Dependency    | Input                     | Output                | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|-------------------|-------------------|----------------------|---------------|---------------------------|-----------------------|----------------------------------|
| Coherence Scoring    | Measure embedding similarity    | - [ ] Compute cosine similarity; aggregate over windows; forbid vocabulary checks          | feature_extractor | FeatureExtractor  | compute_coherence    | numpy, scipy  | Token embeddings, window  | Coherence scores      | dot(a,b) / (norm(a) * norm(b))  |
| Distance Computation | Calculate syntactic paths       | - [ ] Traverse dependency tree; normalize lengths; forbid type-specific paths              | feature_extractor | FeatureExtractor  | compute_distance     | spacy         | Dependency parse          | Path length matrix    | BFS with max_path_length bound   |
| Frequency Analysis   | Track term statistics           | - [ ] Count tokens; smooth frequencies; forbid stopword filtering                          | feature_extractor | FeatureExtractor  | compute_frequency    | collections   | Token sequence            | Frequency dicts       | Counter with Laplace smoothing   |
| Complexity Scoring   | Measure sentence structure      | - [ ] Count tokens/clauses; compute tree depth; forbid pattern matching                   | feature_extractor | FeatureExtractor  | compute_complexity   | —             | Parse tree                | Complexity scores     | Recursive depth with percentile clip|

---

## Layer 1: Token Linking with Quality Gates

**TokenLinker**: Links tokens into phrases and entities based on statistical signals.

**Forbidden Patterns**: Domain-specific term checking | Dataset branching | Ontology lookup

**Required Patterns**: Statistical threshold checking | Numerical bound filtering | Feature-based classification

**Algorithm**: Compute features → Apply config thresholds → Validate spans → Track provenance

| Context              | Intent                          | Directive                                                                                   | Module       | Class/Object  | Function/Method   | Dependency        | Input                        | Output           | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|--------------|---------------|-------------------|-------------------|------------------------------|------------------|----------------------------------|
| Span Merging         | Combine coherent tokens         | - [ ] Check coherence threshold; merge greedily; forbid vocabulary matching                | token_linker | TokenLinker   | merge_spans       | FeatureExtractor  | Token features, config       | Merged spans     | while coherence > threshold, extend|
| Distance Filtering   | Link nearby tokens              | - [ ] Measure syntactic distance; filter by max; forbid position heuristics               | token_linker | TokenLinker   | filter_by_distance| FeatureExtractor  | Parse tree, distance matrix  | Linked token pairs| distance < config.max_distance   |
| Type Prediction      | Classify entity types           | - [ ] Extract features; apply classifier; forbid hardcoded types                           | token_linker | TokenLinker   | predict_type      | sklearn           | Span features                | Entity type labels| classifier.predict(features)     |
| Quality Validation   | Filter low-confidence spans     | - [ ] Check confidence scores; filter by threshold; forbid silent failures                 | token_linker | TokenLinker   | validate_quality  | —                 | Spans with confidence        | Validated spans  | confidence >= config.min_confidence|

---

## Layer 2: Edge Elevation

**EdgeElevator**: Scores potential relationships between entities using statistical features.

**Features Extracted**: Syntactic Path Length | Semantic Coherence | Temporal Markers | Modality Indicators | Negation

**Scoring Function**: `score = sum(weight * transform(feature))` → apply boosts → normalize to [0,1]

| Context              | Intent                          | Directive                                                                                   | Module        | Class/Object   | Function/Method       | Dependency        | Input                        | Output              | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|---------------|----------------|-----------------------|-------------------|------------------------------|---------------------|----------------------------------|
| Feature Extraction   | Compute relationship signals    | - [ ] Extract syntactic/semantic features; forbid pattern matching on types               | edge_elevator | EdgeElevator   | extract_features      | FeatureExtractor  | Entity pair, parse tree      | Feature vector      | Apply extractors from config     |
| Transform Application| Normalize feature scales        | - [ ] Apply log/clip/normalize transforms; forbid manual scaling                           | edge_elevator | EdgeElevator   | apply_transforms      | numpy             | Raw features, config         | Transformed features| Match transform type to function |
| Score Computation    | Combine weighted features       | - [ ] Weighted sum of transformed features; forbid arbitrary combinations                  | edge_elevator | EdgeElevator   | compute_score         | numpy             | Features, weights            | Scalar score        | dot(features, weights)           |
| Boost Application    | Enhance specific conditions     | - [ ] Multiply score by configurable boosts; log decisions; forbid implicit boosts        | edge_elevator | EdgeElevator   | apply_boosts          | —                 | Score, marker presence       | Boosted score       | score *= boost if condition      |
| Confidence Mapping   | Normalize to probability        | - [ ] Apply sigmoid; clip to [0,1]; forbid unbounded scores                               | edge_elevator | EdgeElevator   | map_confidence        | numpy             | Raw score                    | Confidence in [0,1] | 1 / (1 + exp(-score))            |

---

## Layer 3: Threshold Tuning

**ThresholdTuner**: Selects optimal thresholds using ML validation patterns.

**Algorithm**: Stratified splits → Grid search → Metric evaluation → Constraint checking → Objective optimization

| Context              | Intent                          | Directive                                                                                   | Module          | Class/Object    | Function/Method   | Dependency    | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|-----------------|-----------------|-------------------|---------------|------------------------------|------------------------|----------------------------------|
| Split Generation     | Create validation folds         | - [ ] Stratify by target distribution; preserve ratios; forbid random-only splits         | threshold_tuner | ThresholdTuner  | generate_splits   | sklearn       | Dataset, config              | Train/val/test splits  | StratifiedKFold with random_state|
| Grid Construction    | Enumerate threshold combos      | - [ ] Cartesian product of search spaces; log size; forbid exhaustive if >10k             | threshold_tuner | ThresholdTuner  | construct_grid    | itertools     | Search space dicts           | Candidate grid         | product over config lists        |
| Metric Evaluation    | Compute quality scores          | - [ ] Run extraction on validation; compute metrics; forbid train set evaluation          | threshold_tuner | ThresholdTuner  | evaluate_metrics  | sklearn       | Predictions, gold labels     | Metric dict            | metrics functions over preds     |
| Constraint Checking  | Filter invalid candidates       | - [ ] Check all constraints; eliminate violations; forbid constraint relaxation           | threshold_tuner | ThresholdTuner  | check_constraints | —             | Metrics, constraints         | Valid candidates       | Boolean filter over conditions   |
| Optimization         | Select best thresholds          | - [ ] Maximize objective subject to constraints; break ties; forbid arbitrary selection   | threshold_tuner | ThresholdTuner  | optimize          | —             | Valid candidates, objective  | Best threshold set     | argmax(objective) with stable sort|

---

## Layer 4: Document Unification

**DocumentUnifier**: Consolidates entities representing the same abstract object under one canonical ID.

**Algorithm**: Entity key normalization → Canonical ID assignment → Fill-missing property merge → Edge endpoint rewrite

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object     | Function/Method       | Dependency | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|------------------|-----------------------|------------|------------------------------|------------------------|----------------------------------|
| Entity Keying        | Identify equivalent entities     | - [ ] Normalize entity type and text; hash canonical key; forbid source-id dependence       | document_unifier | DocumentUnifier  | canonical_entity_id   | sha256     | Entity type, normalized text | Canonical entity ID    | sha256(type:text) prefix         |
| Property Merge       | Preserve stable entity fields    | - [ ] Fill missing properties from later documents; preserve existing values deterministically | document_unifier | DocumentUnifier  | merge_entity          | —          | Existing and incoming entity | Updated entity         | first value wins; missing fills  |
| Edge Rewrite         | Keep graph endpoints canonical   | - [ ] Rewrite source/target endpoints through the canonical entity map; forbid stale source IDs | document_unifier | DocumentUnifier  | rewrite_edge_endpoints | —          | Edge and canonical map       | Edge with canonical IDs | map lookup for endpoints         |
| Metadata             | Track unification knobs          | - [ ] Record merge threshold and inference depth; forbid unimplemented strategy flags       | document_unifier | DocumentUnifier  | unify_entities        | —          | Parsed documents             | Unified graph metadata | explicit emitted config keys     |

---

## Layer 5: Feedback Loops and Monitoring

**FeedbackOrchestrator**: Provides continuous quality monitoring and triggers retuning.

**Monitoring Flow**: Batch processing → Metric computation → History tracking → Drift detection → Retuning triggers → Audit logging

| Context              | Intent                          | Directive                                                                                   | Module               | Class/Object         | Function/Method   | Dependency    | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------|----------------------|-------------------|---------------|------------------------------|------------------------|----------------------------------|
| Batch Aggregation    | Group documents for processing  | - [ ] Collect until batch_size; trigger check; forbid unbounded batches                   | feedback_orchestrator| FeedbackOrchestrator | aggregate_batch   | collections   | Document stream              | Document batches       | Buffer until len >= batch_size   |
| Metric Computation   | Calculate quality scores        | - [ ] Compute P/R/F1 over batch; aggregate stats; forbid biased sampling                  | feedback_orchestrator| FeedbackOrchestrator | compute_metrics   | sklearn       | Predictions, labels          | Metric dict            | metrics over batch with averaging|
| Window Maintenance   | Track rolling history           | - [ ] Append new metrics; evict old; maintain size; forbid unbounded memory               | feedback_orchestrator| FeedbackOrchestrator | maintain_window   | collections   | Current metrics, history     | Updated history        | deque with maxlen=window_size    |
| Degradation Test     | Detect quality drops            | - [ ] Statistical test baseline vs current; check significance; forbid threshold-only     | feedback_orchestrator| FeedbackOrchestrator | test_degradation  | scipy         | Baseline, current metrics    | Boolean (degraded)     | stats test with p-value threshold|
| Drift Test           | Detect distribution shifts      | - [ ] KS test on distributions; compare to threshold; forbid visual inspection            | feedback_orchestrator| FeedbackOrchestrator | test_drift        | scipy         | Baseline, current distributions| Boolean (drifted)    | ks_2samp with threshold          |
| Retune Trigger       | Initiate threshold optimization | - [ ] Check cooldown; log trigger; call tuner; forbid concurrent retuning                | feedback_orchestrator| FeedbackOrchestrator | trigger_retune    | ThresholdTuner| Degradation/drift flags      | Retuning job           | if degraded and cooldown_elapsed |

---

## Layer 6: Corpus Reasoning

**CorpusReasoner**: Analyzes graph at corpus scale to identify important entities and patterns.

**Analysis Components**: Centrality Computation | Importance Aggregation | Pattern Mining | Interaction Analysis

| Context              | Intent                          | Directive                                                                                   | Module         | Class/Object   | Function/Method        | Dependency | Input                        | Output               | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------|----------------|------------------------|------------|------------------------------|----------------------|----------------------------------|
| Centrality Computation| Calculate importance scores    | - [ ] Apply graph algorithms from config; normalize; forbid manual scoring                 | corpus_reasoner| CorpusReasoner | compute_centrality     | networkx   | Graph, metric config         | Centrality vectors   | networkx centrality with params  |
| Metric Aggregation   | Combine multiple centralities   | - [ ] Weighted average of metrics; normalize to [0,1]; forbid arbitrary combination        | corpus_reasoner| CorpusReasoner | aggregate_metrics      | numpy      | Centrality vectors, weights  | Importance scores    | average with weights then normalize|
| Pattern Mining       | Extract frequent subgraphs      | - [ ] Apply graph mining; filter by support/confidence; forbid hardcoded patterns         | corpus_reasoner| CorpusReasoner | mine_patterns          | gspan      | Graph, mining params         | Pattern list         | gspan with threshold filtering   |
| Depth Limiting       | Bound interaction analysis      | - [ ] BFS/DFS to max_depth; count frequencies; forbid unbounded search                    | corpus_reasoner| CorpusReasoner | analyze_interactions   | —          | Graph, start nodes, max_depth| Path frequencies     | BFS with depth counter           |

---

## Layer 7: Agentic RAG

**AgenticQueryEngine**: Orchestrates multi-strategy retrieval over the graph.

**Query Processing Flow**: Feature parsing → Strategy execution → Result fusion → Reranking → Context extraction

| Context              | Intent                          | Directive                                                                                   | Module              | Class/Object        | Function/Method    | Dependency        | Input                        | Output              | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|---------------------|---------------------|--------------------|-------------------|------------------------------|---------------------|----------------------------------|
| Query Parsing        | Extract structured query info   | - [ ] Apply NER/pattern matching; extract features; forbid template matching              | agentic_query_engine| AgenticQueryEngine  | parse_query        | spacy             | Query string                 | Feature dict        | spacy NER + regex extractors     |
| Strategy Dispatch    | Execute retrieval methods       | - [ ] Run enabled strategies in parallel; collect results; forbid sequential execution    | agentic_query_engine| AgenticQueryEngine  | dispatch_strategies| concurrent        | Query features, graph        | Strategy results    | ThreadPoolExecutor with futures  |
| Result Fusion        | Combine multi-strategy outputs  | - [ ] Apply fusion method from config; aggregate scores; forbid simple concatenation      | agentic_query_engine| AgenticQueryEngine  | fuse_results       | —                 | Strategy results, weights    | Fused result list   | RRF formula or weighted voting   |
| Reranking            | Score and reorder candidates    | - [ ] Extract ranking features; apply model; sort; forbid position-only ranking           | agentic_query_engine| AgenticQueryEngine  | rerank_results     | sklearn           | Candidates, feature config   | Ranked results      | model or linear combo then argsort|
| Context Chunking     | Extract provenance text         | - [ ] Map results to source text; chunk by size; forbid lossy extraction                 | agentic_query_engine| AgenticQueryEngine  | extract_context    | —                 | Results with provenance      | Context chunks      | Slice by line_range with max_size|

---

## Operational Configuration: Environment Wiring

**Markdown Pipeline Environment Variables**:

| Variable                                  | Scope            | Default                                    | Impact                                              |
|-------------------------------------------|------------------|--------------------------------------------|-----------------------------------------------------|
| `VITE_MARKDOWN_PIPELINE_INPUT_REL_PATH`   | deployment       | `docs/agenticgraph-pipeline-document.md`       | Controls which markdown document is parsed          |
| `VITE_MARKDOWN_PIPELINE_OUTPUT_DIR`       | deployment       | `data/outputs/agenticgraph-workflow-preview`   | Controls ignored generated artifact output location |
| `VITE_MARKDOWN_PIPELINE_BASENAME`         | deployment       | `agenticgraph-pipeline-document`               | Controls artifact filename prefixes                 |

**Artifact Generation**: `*-graph-data.jsonld` (neutral node/edge graph) | `*-schema-config.jsonld` (AgenticGraph schema-config, compatible with AgenticRAG structural JSON-LD) | `*-orchestrator-config.yaml` (workflow orchestrator)

**Dev Workflow Integration**:

| Step | Action                                  | Command/Trigger                         | Artifact Consumer                  |
|------|----------------------------------------|------------------------------------------|-------------------------------------|
| 1    | Edit markdown documentation            | Manual editing in `docs/documents/`      | —                                   |
| 2    | Run pipeline via Canvas UI             | Tools menu → "Run codebase index pipeline" | Vite dev server                   |
| 3    | Load generated artifacts               | `runMarkdownPipelineAndLoadArtifacts()`  | Graph Data Table (singabldr), Schema + Workflow views (AgenticGraph host) |
| 4    | Validate in Canvas                     | Visual inspection, traversal tests       | Canvas UI layers                    |
| 5    | Update docs with findings              | `npm run docs:update`                    | Ignored generated preview artifacts |

| Context              | Intent                          | Directive                                                                                   | Module/Component  | Class/Object | Function/Method              | Dependency      | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|-------------------|--------------|------------------------------|-----------------|------------------------------|------------------------|----------------------------------|
| Variable Resolution  | Map env to config paths         | - [ ] Read env variables; construct paths; forbid hardcoded locations                      | Vite Config       | —            | resolveEnvPaths              | path, process   | process.env                  | Path strings           | Path.join(BASE_DIR, env[VAR])    |
| Pipeline Invocation  | Run markdown processor          | - [ ] Execute Python command; wait for completion; forbid silent failures                  | Dev Server        | —            | runMarkdownPipeline          | child_process   | Pipeline command             | Process exit code      | spawn with error handling        |
| Artifact Loading     | Fetch generated files           | - [ ] Fetch JSONâ€'LD/YAML; parse; validate; forbid partial loads                           | Canvas Client     | —            | loadArtifacts                | fetch, yaml     | Artifact paths               | Parsed data structures | fetch then parse with validation |

---

## Component Responsibility Matrix

| Layer | Component                | Interface/Method                 | Responsibility (S-V-O)                                                          | Dependencies                         | Contracts                                      | LOC    |
|-------|--------------------------|----------------------------------|-------------------------------------------------------------------------------|--------------------------------------|-----------------------------------------------|--------|
| 0     | ConfigLoader             | `load_config`                    | Loads YAML config → validates schema → returns merged config dict            | `yaml`, `jsonschema`                 | Validated config dict with all sections       | ~50    |
| 0.5   | FeatureExtractor         | `extract_features`               | Processes tokens → computes statistical features → returns feature vectors   | `numpy`, `scipy`, `spacy`            | Feature dict with normalized values           | ~200   |
| 1     | TokenLinker              | `link_tokens`                    | Analyzes token features → merges spans → returns entity mentions             | `FeatureExtractor`, `ConfigLoader`   | Mention list with confidence scores           | ~300   |
| 2     | EdgeElevator             | `score_relationships`            | Extracts relation features → computes scores → returns weighted edges        | `FeatureExtractor`, `ConfigLoader`   | Edge list with confidence scores              | ~250   |
| 3     | ThresholdTuner           | `tune_thresholds`                | Runs grid search → evaluates metrics → returns optimal thresholds            | `sklearn`, `ConfigLoader`            | Threshold dict with validation metrics        | ~400   |
| 4     | DocumentUnifier          | `unify_entities`                 | Canonicalizes entities → rewrites edges → returns unified graph              | `hashlib`, `ConfigLoader`            | Unified entity dict with provenance           | ~350   |
| 5     | FeedbackOrchestrator     | `monitor_quality`                | Tracks metrics → detects drift → triggers retuning                           | `ThresholdTuner`, `ConfigLoader`     | Quality report with retuning decisions        | ~300   |
| 6     | CorpusReasoner           | `analyze_corpus`                 | Computes centrality → mines patterns → returns importance scores             | `networkx`, `ConfigLoader`           | Importance dict with pattern list             | ~400   |
| 7     | AgenticQueryEngine       | `execute_query`                  | Parses query → fuses retrieval → reranks results                             | `CorpusReasoner`, `ConfigLoader`     | Ranked result list with context chunks        | ~500   |
| —     | NeutralityValidator      | `validate_neutrality`            | Runs cross-corpus tests → measures consistency → reports violations          | All layers, `ConfigLoader`           | Validation report with CV metrics             | ~200   |

---

## Testing & Quality Standards

**Test Coverage by Layer**:

| Layer | Test Type       | Coverage Target | Test Approach                                                                     |
|-------|-----------------|-----------------|-----------------------------------------------------------------------------------|
| 0     | Unit            | 100%            | Config loading, validation, merging with diverse YAML inputs                     |
| 0.5   | Unit            | >90%            | Feature extraction with synthetic token sequences                                |
| 1     | Integration     | >85%            | Token linking on annotated corpora with gold spans                               |
| 2     | Integration     | >85%            | Edge scoring on annotated corpora with gold relations                            |
| 3     | Integration     | >80%            | Threshold tuning on validation sets with known optima                            |
| 4     | Integration     | >80%            | Entity unification on multi-document corpora with ground truth                   |
| 5     | Integration     | >75%            | Feedback loop triggers on simulated drift scenarios                              |
| 6     | Integration     | >75%            | Corpus reasoning on known graphs with expected patterns                          |
| 7     | End-to-end      | >70%            | Query execution on diverse corpora with relevance judgments                      |
| —     | Neutrality      | 100%            | Cross-corpus consistency tests with coefficient-of-variation thresholds          |

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Unit Tests           | Validate components in isolation| - [ ] Mock dependencies; test edge cases; forbid integration leakage                       |
| Integration Tests    | Verify layer interactions       | - [ ] Use realistic fixtures; measure end-to-end metrics; forbid synthetic-only testing    |
| Neutrality Tests     | Ensure domain-agnostic behavior | - [ ] Run on 5+ diverse corpora; check CV < 0.2; forbid single-corpus optimization         |
| Reproducibility Tests| Guarantee deterministic output  | - [ ] Fix seeds; hash configuration and data; compare outputs; forbid environment dependencies |
| Performance Tests    | Maintain efficiency             | - [ ] Profile on large corpora; measure latency/throughput; forbid O(n²) where avoidable   |

---

## Documentation Coverage

**Markdown Sources in `npm run docs:update`**:

| Document                             | Purpose                                                  | Quality Gates           | Steward              |
|--------------------------------------|----------------------------------------------------------|-------------------------|----------------------|
| `agenticgraph-pipeline-document.md`      | Pipeline architecture and configuration                  | docs:update, doc:lint, tests | Technical Writer     |
| `agenticgraph-parser-document.md`        | Parser contracts and behaviors                           | docs:update, doc:lint, tests | Component Documenter |
| `agenticgraph-orchestrator-document.md`  | Orchestrator roles and workflow semantics                | docs:update, doc:lint, tests | Component Documenter |
| `agenticgraph-ontology-document.md`      | Multi-ontology integration patterns                      | docs:update, doc:lint, tests | Schema Documenter    |
| `agenticgraph-schema-document.md`        | Schema-config structure and layering rules               | docs:update, doc:lint, tests | Schema Documenter    |
| `agenticgraph-renderer-document.md`      | Canvas rendering and visualization                       | docs:update, doc:lint, tests | Component Documenter |
| `agenticgraph-semantic-document.md`      | Semantic extraction and neutrality constraints           | docs:update, doc:lint, tests | Component Documenter |
| `agenticgraph-mermaid-frontmatter-document.md` | Mermaid frontmatter parsing                        | docs:update, doc:lint, tests | Component Documenter |
| `agenticgraph-yaml-mermaid-gitgraph-frontmatter-prd-tad.md` | YAML Mermaid GitGraph frontmatter renderer contract | docs:update, doc:lint, tests | Component Documenter |
| `agenticgraph-ui-ux-design-document.md`  | UI/UX flows and interaction models                       | docs:update, doc:lint, tests | Technical Writer     |
| `agenticgraph-codebase-semantics-document.md` | Codebase semantics and traversal                   | docs:update, doc:lint, tests | Component Documenter |
| `agenticgraph-fields-document.md`        | Graph field definitions                                  | docs:update, doc:lint, tests | Schema Documenter    |
| `agenticgraph-metadata-document.md`      | Metadata contracts and layer hints                       | docs:update, doc:lint, tests | Provenance Documenter|
| `agenticgraph-ingestor-document.md`      | Source file ingestion paths                              | docs:update, doc:lint, tests | Component Documenter |
| `agenticgraph-codebase-index-document.md`| Codebase index architecture                              | docs:update, doc:lint, tests | Schema Documenter    |
| `agenticgraph-demo-document.md`          | Demo workflow and interactive tour                       | docs:update, doc:lint, tests | Technical Writer     |
| `agenticgraph-llm-prompt-contract.md`    | LLM prompt contracts and guidance                        | docs:update, doc:lint, tests | API Documenter       |

---

## Anti-Patterns (Forbidden)

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Vocabulary Lists     | Maintain domain neutrality      | - [ ] Compute statistical features only; forbid medical/legal/financial term lists         |
| Dataset Branching    | Preserve generality             | - [ ] Apply uniform logic across corpora; forbid if dataset_name == "X" branches           |
| Embedded Ontologies  | Externalize domain knowledge    | - [ ] Load ontologies from config; forbid hardcoded entity type hierarchies                |
| Magic Thresholds     | Document decisions              | - [ ] Define all thresholds in config; forbid unexplained 0.7, 0.8, etc. in code          |
| Implicit Features    | Expose all signals              | - [ ] Declare feature extractors in config; forbid undocumented feature engineering        |
| Silent Degradation   | Monitor continuously            | - [ ] Log all quality metrics; alert on drift; forbid missing monitoring                   |
| Non-Determinism      | Ensure reproducibility          | - [ ] Seed all randomness; hash inputs; forbid environment-dependent behavior              |
| Single-Corpus Tuning | Validate broadly                | - [ ] Test on 5+ diverse corpora; forbid optimization on one dataset                       |

---

## Repository Health Checklist

**Structural Health**:

| Context              | Evidence result | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Layer Separation     | not recorded | - [ ] Each layer in separate module; clear interfaces; forbid cross-layer coupling      |
| Config Completeness  | not recorded | - [ ] All behavior configurable; documented defaults; forbid hidden parameters          |

**Maintainability**:

| Context              | Evidence result | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Documentation        | not recorded | - [ ] All layers documented; examples provided; forbid undocumented components          |
| Test Coverage        | not recorded | - [ ] >80% overall; neutrality suite; forbid untested features                          |

**Operations**:

| Context              | Evidence result | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Reproducibility      | not recorded | - [ ] Config/data versioning; seeded randomness; forbid environment dependencies        |
| Monitoring           | not recorded | - [ ] Quality metrics logged; drift detection; forbid silent failures                   |

---

## Version Control Standards

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Config Versioning    | Track behavior changes          | - [ ] Version config schema; document migrations; forbid breaking changes without migration|
| Experiment Tracking  | Enable reproducibility          | - [ ] Log config hashes, data hashes, commit SHAs; forbid unversioned experiments          |
| Backward Compatibility| Protect existing pipelines     | - [ ] Deprecate gracefully; support old configs; forbid abrupt API removal                 |
