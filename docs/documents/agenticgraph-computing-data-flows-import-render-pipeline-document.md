# AgenticGraph Computing Data Flows: Import → Render Pipeline (End-to-End)

**Context**: Computing data flows demo workflow
**Intent**: Document the end-to-end import path and the Storyboard Widget presentation contract without file/content hardcoding.
**Directive**: Reuse SSOT parsing, Flow rendering, and panel semantics; keep Storyboard behavior consistent with D3/Flow surfaces and AgenticRAG schema directives.

- Directive: Frontmatter `flow:` imports must centralize `direction`, `edgeType`, and `computed` settings in GraphData metadata so parse, Flow render, and Storyboard Widget runtime consume one SSOT contract without duplicated branching.

---

## Demo Entry Point (User Journey)

- **Toolbar → Editor workspace button**
- Import a local Markdown or JSON graph bundle selected by the user.
- Switch: **Canvas → 2D Renderer → Storyboard → Display Controls → Widget**

Expected result:

- A JSON bundle may be a `kg:flow:widgetBundle` (kind/version guarded) that carries:
  - a shared widget registry snapshot (`registry[]`)
  - a workflow graph payload (`graph`)
- A runnable Markdown document carries its `flow:` graph in the opening YAML frontmatter block with the same port-bound edge semantics.
- Storyboard Widget renders the workflow graph through the shared native Flow runtime.
- Storyboard widgets can be opened concurrently; pinned header drag updates anchor offsets collectively, while detached overlays are draggable and must not overlap by default.

## Markdown Frontmatter And Body Contract

- Frontmatter is the machine SSOT for renderer presets, `socket_types`, `workflow_sections`, `flow.nodes`, `flow.edges`, widget fields, and reusable node summaries.
- The body is a human projection for workflow explanation, validation evidence, and inspection instructions. It may reference node ids, edge ids, and field paths in prose or tables, but it must not re-author them.
- Normalized E2E fixtures may attach `kgc:readingSummary` to node records when KGC-readable summaries are needed. Do not add a body-side `## KGC Reading Layer`, line-start `@node:...`, or line-start `@edge:...` section to mirror frontmatter.
- A Markdown artifact with metadata after a closed frontmatter block is malformed for this pipeline; repair the source document instead of relying on parser recovery.

## Long-Horizon SuperAgent Template Boundary

The publish-side computing-flow template may include `superagent_harness_template` metadata to describe a AgenticGraph-native long-horizon harness envelope. That metadata is documentation and run-planning context only; it must not create a second parser, renderer, provider dispatcher, graph apply stack, or Storyboard Widget registry owner.

The external [bytedance/deer-flow](https://github.com/bytedance/deer-flow) reference is allowed only as conceptual inspiration for message gateway, memory, tools, skills, subagents, sandbox/workspace execution, and bounded minutes-to-hours task management. AgenticGraph must keep implementation ownership in `agenticgraph_parser`, local MCP contracts, shared markdown/frontmatter parsing, GraphData, Storyboard Widget, and Rich Media Panel owners.

Rich-media outputs from the harness stay ordinary Storyboard Widget fields:

- Text output binds to `output`.
- Image output binds to `imageUrl`.
- Chart or HTML output binds to `outputSrcDoc`.
- `outputSrcDoc` remains the render authority when helper text and inline HTML coexist.
- Completed Text Widget and Video Transcriber runs persist final Markdown text as one sibling workspace artifact through the shared text-run artifact helper. Completed Image Generation and Video Generation runs persist the generated binary plus one editable Markdown manifest through the shared rich-media artifact helper. Text artifacts and media manifests register in Source Files passively without graph recomposition.

The Dev-source swarm prediction baseline follows the same rule. `SwarmPrediction`
is a Storyboard widget node, not a renderer fork: seed signals, optional agent
population JSON, and optional intervention JSON enter through declared schema
paths; the deterministic bounded engine emits `output`, `outputSrcDoc`,
`imageUrl`, `eventLogJson`, and `metricsJson`; Rich Media Panel consumes those
fields through the existing connected-value and media-state owners.

---

## Data Contract (Bundle → GraphData)

- Import must treat the demo as a project-agnostic bundle:
  - kind: `kg:flow:widgetBundle`
  - version: `1`
- Import writes registry entries into `GraphData.metadata['flow:widgetRegistry']` so the UI can render Storyboard Widget fields/ports immediately after commit.

Key implementation:

- Bundle parsing + GraphData metadata wiring: [widgetImport.ts](../../canvas/src/lib/graph/io/widgetImport.ts)

---

## Import → Store Commit (Code Path)

- Toolbar local JSON import → parser selection → GraphData normalization:
  - [jsonImportAction.ts](../../canvas/src/features/toolbar/jsonImportAction.ts)
  - [importFlow.ts](../../canvas/src/features/toolbar/importFlow.ts)
  - [loader.ts](../../canvas/src/features/parsers/loader.ts)
  - [frontmatterFlowImportMode.ts](../../canvas/src/features/parsers/frontmatterFlowImportMode.ts)
  - [adapter.ts](../../canvas/src/lib/graph/io/adapter.ts)
- When imported GraphData is detected as `frontmatter-flow`, import/source-compose roots must auto-apply a strict runnable mode contract: `canvasRenderMode=2d`, `canvas2dRenderer=storyboard`, `documentSemanticMode=document`, `frontmatterModeEnabled=true`, and `multiDimTableModeEnabled=false`, without file-name hardcoding.
- Frontmatter-flow metadata projection must preserve top-level authored sections (`Tier B` scalar keys, `runtime`, `pipeline`, `mermaid`, `flow`) in `metadata.frontmatterMeta`; when YAML fallback misses nested blocks, parser fallback should recover those sections from raw frontmatter boundaries upstream.
- MainPanel Workflow Manager should provide section-level controls for `Tier B`, `runtime`, `pipeline`, `mermaid`, and `flow` with default visibility ON, where OFF hides only the manager view while runtime graph execution remains active in background.
- Workflow section configuration edits from MainPanel should patch only `metadata.frontmatterMeta` via one shared helper path and must not introduce renderer-local forks or file-specific coupling.
- Workflow Manager shell should gate legacy tabs at source: when active graph is frontmatter-flow, expose workflow (`graph`) tab only and clear stale apply/reset actions from legacy mapping/spec surfaces.
- Workflow Manager graph surface should also suppress legacy graph-manager controls in workflow mode and render only section processor UI; renderer/node/edge/layer/design controls remain available only in non-workflow manager mode.
- Workflow Manager should derive and display pipeline steps dynamically from `frontmatterMeta.pipeline` (`seq`/`node`/`label`) so Step 1→Step N is source-driven and no step-count hardcoding exists in UI.
- MainPanel must keep one workflow entrypoint keyed as `workflowManager` (Workflow Manager), and Help/Spotlight/Launch navigation must target that key directly without legacy alias/remap paths.
- MainPanel workflow entry should now be keyed and labeled as `workflowManager` (Workflow Manager) with no legacy tab remap path; upstream open events and toolbar/spotlight/help links must target this key directly.
- FloatingPanel `inspector` view must be removed after consolidation; inspector responsibilities should be hosted inside MainPanel Workflow Manager (workflow section processor + inspector section/slot) to avoid duplicate/conflicting edit surfaces.
- Workflow Manager must not keep a separate internal Workflow-vs-Inspector tab switch; inspector content should be embedded in the same workflow manager surface as a unified section block.
- MainPanel must not keep a standalone Graph Fields tab after consolidation; Graph Fields configuration/editing should be embedded inside Workflow Manager and all prior Graph Fields open actions should target `workflowManager`.
- Graph Fields must not duplicate MainPanel Settings workspace/json controls; `Workspace editor view`, `Open Workspace View: Multi-dimensional Table`, `Select panel position`, `JSON import target`, `JSON markdown mode`, and JSON table row/column limits should be configured only from MainPanel Settings SSOT.
- Graph Fields icon legend ownership belongs to MainPanel Help → Icon Library; Workflow Manager Graph Fields should not render a separate legend header copy.
- Workflow Manager should consolidate workflow-mode rendering into existing Graph Fields panes (`Global/Base/Derived Fields` left + `Field Settings` right) and remove dedicated workflow utility/edit surfaces (`Workflow Sections`, `Steps`, `tierB/runtime/pipeline/mermaid/flow`, widget/samples/inspector blocks).
- Workflow Manager must keep Graph Fields in a single top-panel composition; remove stacked top/bottom manager panel splits and render only Graph Fields panes or Multi-dimensional Table in one upstream surface.
- Workflow Manager should reuse workspace preference SSOT for table composition: when `workspaceEditorMode` is `multiDimTable`, render the shared Multi-dimensional Table surface (`MultiDimTableSurface` over `MarkdownWorkspaceDerivedViewer`) in the manager content surface instead of a parallel local table-mode implementation.
- Workflow Manager, FloatingPanel `View`, and Storyboard must reuse the same Workspace/Kanban utility owners for table settings, hover `New Record`, and related data-view chrome whenever they surface equivalent record-management affordances.
- FloatingPanel should not maintain a separate Layer Mode view after consolidation; Layer Mode (including `Switch to Design renderer to view layers.` inactive guidance) must be rendered inside Workflow Manager as the upstream owner surface.
- Workflow Manager may keep legacy workflow labels as click aliases only; clicking those entries must route to embedded Graph Fields selection and open the existing right-pane `Field Settings` instead of restoring separate workflow-specific panels.
- Markdown fenced GeoJSON that becomes GraphData should reuse the same geospatial auto-enable contract as file-based geo imports so ingest→parse→render behavior stays identical.
- The computing-flow markdown sample is the canonical ingest→parse→render fixture; it must validate frontmatter-flow display derivation, embedded GeoJSON extraction, geospatial auto-enable parity, and Block-layout 3D mode.
- Cross-repo pipeline docs may shard oversized markdown into companion files at stable section boundaries, but must keep the original filename as the sub-600 canonical index with explicit continuation links so sync-map references stay stable.
- Registry auto-apply from GraphData metadata during store commit:
  - [graphDataSlice.ts](../../canvas/src/hooks/store/graphDataSlice.ts)
  - [graphDataSliceUtils.ts](../../canvas/src/hooks/store/graphDataSliceUtils.ts)

---

## Render (Storyboard Widget Contract)

### Edges

- Storyboard Widget must reuse the native Flow runtime for edges (routing + styling) so edge appearance matches 2D Flow.
- Port-bound edges are expressed structurally via:
  - `edge.properties['flow:sourcePortKey']`
  - `edge.properties['flow:targetPortKey']`

### Computing Dataflow

- Computing-flow behavior is source-driven by GraphData plus widget registry entries:
  - input/output ports use `portKey`, `direction`, and `schemaPath`
  - registry `schemaMappings[]` can reduce/transform connected input groups into derived node properties
  - node `properties['flow:compute']` may emit output values when `frontmatterFlowSettings.computed=true`
- `computeFlowConnectedValuesBySchemaPath()` is the shared runtime owner for propagation. Storyboard Widget panels receive connected values from that helper and must not recompute graph data locally.
- Text-valued Card inputs remain connected runtime values, not authored target text. The Storyboard renderer presents their deduplicated source-node lineage as compact header chips, keeps the target `Prompt` / `Summary` field independently editable below, and derives an empty editor's field identity from the connected target schema path without copying the source value into GraphData or the edit surface. Non-text media connections continue to project through the shared render-node owner.
- Frontmatter `{key,type,value}` wrappers and widget registry fields resolve through the same normalized schema-path helper. When a declared field row and a functional port share the same normalized schema path, Storyboard Widget renders one inline-editable KTV row with the port handle on that row and suppresses the duplicate read-only port row.
- The semantic port key is the authored `key` / `portKey`; `handles.source` and `handles.target` are declaration sites only. Runtime edges, connected-value lookup, accessible port names, and row ids must not remap those semantic keys to `handles.source`, `handles.target`, or UI-only aliases.
- Multi-handle rows must preserve one structural edge key per semantic port while deriving DOM/control identity from row role + schema path + occurrence. Repeated visible labels or repeated displayed port values must not collapse focus, labels, or click targets.
- Branching is value-driven: `null` / `undefined` output values are stop signals and must not be forwarded into downstream connected values.
- Long directed acyclic graphs should evaluate in topological order. Cyclic or partially cyclic graphs may iterate to a stable value key, bounded by graph size, without fixed demo-specific caps.
- Cache keys must use shared graph semantic keys/signatures and registry shape, not filenames, source URLs, or example ids.
- Rich Media Panel nodes are ordinary flow endpoints. Text output binds to `output`, image output binds to `imageUrl`, audio output binds to `audioUrl`, and chart/HTML output binds to `outputSrcDoc`; when `output` and `outputSrcDoc` coexist, shared Rich Media Panel preview state treats `outputSrcDoc` as the render authority and helper text as metadata.
- Typed `flow_diagrams` frontmatter is an ordinary source-owned input block. Entries such as `type: mermaid_flowchart`, `type: mermaid_gitgraph`, `type: mermaid_architecture`, and `type: mermaid_eventmodeling` must declare their exact routing keys when they should render as first-class diagram surfaces: `flowchart -> flowchart`, `gitgraph -> gitGraph`, `architecture -> architecture`, and `eventmodeling -> eventModeling`. When both `floatingPanelView` and `bottomPanelTab` are present, the parser skips `FlowDiagramSource -> TextGeneration compute -> RichMediaPanel` fallback derivation for that entry and the existing FloatingPanel row-list plus BottomPanel chart read the raw frontmatter source directly. Rich Media Panel nodes remain ordinary output endpoints only. The parser must not inspect demo filenames, regenerate stale templates, or backfill static Rich Media Panel payloads.
- The same typed Mermaid diagram source is resolved for Flowchart/GitGraph/Gantt/Timeline/Architecture/Event Model BottomPanel previews through `mermaidDiagramCode.ts` and `MermaidDiagramPanelView.tsx`; Canvas View Display Controls open those BottomPanel tabs by writing `bottomSurfaceTab` / `bottomSurfaceCollapsed`, and panel rendering must reuse the shared Mermaid SVG renderer instead of creating downstream diagram-specific render branches.
- Swarm prediction nodes are ordinary flow endpoints. They must use the canonical `SwarmPrediction` type and plain schema paths (`properties.seedSignalsJson`, `properties.agentPopulationJson`, `properties.interventionsJson`, `properties.output`, `properties.outputSrcDoc`, `properties.imageUrl`, `properties.eventLogJson`, `properties.metricsJson`) instead of introducing a simulator-specific graph, renderer, or port alias stack.
- Generated response text fields (`output`, `result`, `response`, `transcript`, `outputText`, `output_text`) project into the shared editable Card/Storyboard Output row. Audio media (`audioUrl`, `audio`, `audio_url`, inferred audio resources, or `<audio>` tags) renders through the same `getNodeMediaSpec()` -> `CardMediaPreview` -> Rich Media Panel / overlay / HTML export owners.
- MCP-style chat `response.structuredContent`, literal MCP `result.structuredContent`, and structured `result.content[]` text-part records normalize upstream from fallback text, literal MCP results, or accepted KGC frontmatter into Storyboard Widget nodes plus document-scoped widget registry entries when `widgets[]` declares canonical widget form/type metadata, and into Rich Media Panel flow endpoints otherwise; literal MCP results that already extract to a renderable structured surface finalize through the submit validation owner without KGC retry or synthetic KGC text. Plain scalar records, exact typed `{key,type,value}` envelopes, and `properties[]` KTV rows converge before projection. Declared widget records may preserve safe `flow:compute` data so `computeFlowConnectedValuesBySchemaPath()` can derive output ports from incoming handle values after workspace apply, and the shared Storyboard Widget workflow run path writes those computed output schema paths locally before any provider TextGeneration branch. Inline edits of projected card/panel outputs reuse the shared card patch/updateNode path and keep flattened output fields plus any native `properties` mirror aligned before frontmatter writeback. Accepted KGC documents with `widget_bundle.graph.nodes_ref` append those response node ids there so Storyboard Widget opens them through the existing overlay SSOT.
- MCP-style chat structured-content `edges[]` preserve authored record-to-record or delivery graph relationships by resolving structured-content aliases to canonical node ids and carrying source/target handle keys into frontmatter-flow edges; those same handles are the dataflow path used by shared connected-value recomputation and Storyboard Widget run-all planning.
- Text/transcript widget output persistence is owned by `writeTextWidgetRunOutputArtifact()` plus `applyWorkspaceImportToCanvas({ applyToGraph: false })`. Image/video widget output persistence is owned by `writeRichMediaWidgetRunOutputArtifact()`, which keeps the binary artifact path and registers an editable Markdown manifest in Source Files. Storyboard Widget and Rich Media Panel patches carry the resulting workspace `outputPath` / `outputManifestPath`; they must not create renderer-local workspace writers or graph-apply aliases.
- Storyboard Widget templates must prefer plain YAML for normal authoring. The normalized `{key,type,value}` envelope is valid only for validation fixtures that intentionally prove parser fidelity, inline KTV editing, and semantic port preservation.

### Storyboard widgets

- Multiple Storyboard widgets may be visible at once.
- Detached overlays must:
  - have deterministic default placement (grid/stack)
  - persist detached positions per node id
  - avoid DOM id collisions by scoping form control ids per node
- Pinned overlays must remain node-anchored while header drag applies a shared anchor offset across all pinned overlays.
- Frontmatter envelope field rows that represent authored `{key,type,value}` payloads must stay editable through the same widget-field mutation helper used by registry fields. The Storyboard Widget must not treat generic `Value` rows as read-only simply because their display label repeats across nodes.
- Port handle buttons and read-only port-value rows must expose unique accessible names when multiple rows share the same visible port key; the uniqueness suffix belongs to the UI identity only and must not rewrite edge `flow:sourcePortKey` / `flow:targetPortKey` values.
- For published validation fixtures such as `agenticgraph-video-demo.md` and `agenticgraph-token-economics-model-demo.md`, a driver like `agent_token_take_rate` must render as exactly one editable KTV row with the output handle attached to that row when the field and port resolve to the same schema path.

Storyboard Widget + overlay wiring:

- [StoryboardWidgetCanvas.tsx](../../canvas/src/components/StoryboardWidgetCanvas.tsx)
- [FlowWidgetOverlay.tsx](../../canvas/src/components/StoryboardWidget/FlowWidgetOverlay.tsx)
- [WidgetEditorForm.tsx](../../canvas/src/components/StoryboardWidget/WidgetEditorForm.tsx)
- [WidgetEditorRegistrySection.tsx](../../canvas/src/components/StoryboardWidget/WidgetEditorRegistrySection.tsx)

---

## Non-Hardcoding Rules

- Treat the demo file as a fixture only; do not special-case its node ids, labels, or content.
- All UI behavior (fields, ports, connected values, edge bindings) must be driven by:
  - GraphData
  - registry entries (bundle or GraphData metadata)
  - schema-config toggles
- Validation inputs may be supplied from outside the repo to prove the same pipeline on published/mirrored documents, but tests must not hardcode those paths or backfill empty external files.
- Current focused evidence should include the widget duplicate-value/port-row regression, token-economics Storyboard Widget fixture checks, schema-field port checks, `flowDataflowConnectedValues` computing-flow coverage, and `flowComputeInline` coverage.

---

## Validation Matrix (Storyboard Widget Computing Flow)

| Layer | Required proof | Failure to block |
|---|---|---|
| Ingestion | Source Files/docs mirror exposes the Markdown as `workspace:/docs/<file>.md` without forcing it enabled before selection. | Hidden backfill, stale fallback, or file-name special-casing. |
| Parsing | Markdown parser returns `context=frontmatter-flow`, expected node/edge counts, and zero warnings. | Missing `flow:portTypes`, synthetic handles, malformed YAML, body `flow:` mirrors, or body-side `@node:` / `@edge:` KGC reading layers. |
| Port contract | Authored `key` / `portKey`, `sourceHandle`, `targetHandle`, `flow:sourcePortKey`, and `flow:targetPortKey` survive without alias remaps. | Rewriting semantic ports to `handles.source`, `handles.target`, row labels, or demo ids. |
| Computing | `computeFlowConnectedValuesBySchemaPath()` propagates values and respects null stop signals through the shared graph/registry readers. | Renderer-local recomputation, unbounded iteration, or GraphData mutation during compute. |
| KTV editing | Matching field + port schema paths render as one editable row with row-attached handle. | Duplicate read-only rows, unwritable `Value`, or focus collisions from repeated labels. |
| Rendering | Storyboard Widget mounts `data-kg-storyboard-widget-surface-root`; connected Card text inputs render one deduplicated source chip plus an independent target editor; Rich Media Panel previews resolve through shared panel/media state. | Source text replacing the target editor, duplicate lineage chips, panel-local preview branches, stale `srcDoc`, missing SVG/image output, or edge drift after scroll/zoom. |
| Harness metadata | `superagent_harness_template` parses as frontmatter metadata while graph counts and Storyboard renderer ownership remain stable. | Treating harness metadata as a second parser, renderer, provider, or graph apply stack. |
| Swarm prediction | `SwarmPrediction` runs stay deterministic, bounded, replayable, and rich-media-compatible through ordinary widget registry schema paths. | Provider calls, renderer-local recomputation, unbounded ticks, or copied external-project surface tokens. |
| Browser | Local docs-mirror smoke selects the publish doc and samples stable DOM contracts. | Settled-only proof that ignores mid-load blank/seepage states. |

Focused test families:

- `markdown.frontmatterFlowGraph.*` for frontmatter/body flow parsing, typed handles, implicit semantic ports, and warning behavior.
- `baseline.storyboardWidget.frontmatterFlow.*` for renderer isolation, widget overlay identity, edge anchoring, and contract rows.
- `flow.compute.inline.*` for safe inline compute readers and neutral compute context.
- `flow.dataflow.connectedValues.*` for bounded propagation, transforms, null-stop branching, long DAGs, and runtime validation hardcode guards.
- `swarmPredictionEngine.*` for deterministic replay, run bounds, Storyboard Widget outputs, shared semantic keys, and the no-copy external-inspiration boundary.
- Publish-demo E2E tests should resolve the file from `$GITHUB_ROOT/huijoohwee/docs` through the docs mirror path, but they must not backfill or rewrite that external file when it is absent.
- Publish-demo syntax guards should reject body-side `## KGC Reading Layer`, line-start `@node:`, line-start `@edge:`, and body `flow:` mirrors for frontmatter-driven Storyboard Widget documents.

---

## Canonical Template Contract

Normal runnable templates must keep these keys at the top of YAML frontmatter. Simple Storyboard Widget seeds use `kgMultiDimTableModeEnabled: false`; computing-flow templates that intentionally expose Workflow Manager / Multi-dimensional Table companion views use `kgMultiDimTableModeEnabled: true` plus `kgWorkflowManagerModeEnabled: true`.

```yaml
schema: "kgc-computing-flow/v1"
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "storyboard"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: true
kgDocumentStructureBaselineLock: false
kgWorkflowManagerModeEnabled: true
```

Template `flow:` blocks should include:

- `direction`, `edgeType`, and `computed` under `flow`, consumed as frontmatter-flow settings.
- `socket_types` for every custom semantic edge type used by the template.
- Node `handles` declaring target/source membership and matching `"flow:portTypes"` entries for typed connection validation.
- Input widgets should expose query, context, audience, format, constraints, evidence, and tone as separate typed `{key,type,value}` fields when a reusable template needs recomputable response granularity.
- Edges with explicit `sourceHandle` and `targetHandle` when a concrete field endpoint exists.
- Declared Storyboard Widget nodes with document-scoped registry entries for interactive generated outputs, and Rich Media Panel endpoint nodes for neutral rendered outputs instead of sidecar preview instructions.
- Optional `superagent_harness_template` metadata for long-horizon harness planning; it is not graph authoring data.
- If `superagent_harness_template` is present, it must name native AgenticGraph owners and the no-copy DeerFlow inspiration boundary.

The publish-side reusable template is `huijoohwee/docs/agenticgraph-storyboard-widget-computing-flow-template.md`; it is intentionally generic and should remain project-agnostic.
