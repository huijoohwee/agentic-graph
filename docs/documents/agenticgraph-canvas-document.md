# AgenticGraph Canvas Document

## Agentic GraphRAG/Knowledge Graph Pipeline Guidelines

Canonical guidelines: `agenticgraph/docs/documents/agenticgraph-pipeline-document.md` and `huijoohwee.github.io/schema/AgenticRAG/README.md`.

Export HTML Canvas specifics: `agenticgraph/docs/documents/agenticgraph-html-canvas-export-document.md`.

## Design Mantras

```
- [ ] Configuration; externalize behavior via schema; forbid embedded constants
- [ ] Determinism; cache by viewKey and layout key; forbid cross-mode contamination
- [ ] Fit; apply aspect ratio and fill policies; forbid viewport-specific assumptions
- [ ] Locality; keep layout logic modular; forbid sprawling responsibilities
- [ ] Neutrality; operate on any graph; forbid dataset-tied behavior
- [x] Non-Overlap; enforce node and group bbox collision; forbid visual intersections
- [ ] Observability; keep options discoverable; forbid undocumented defaults
```

---

## Universal Design Principles

| Context | Intent | Directive |
|---|---|---|
| Anti-Line Force | Break long linear concentrations | - [ ] Apply perpendicular jitter to linear clusters; forbid long unbalanced concentrations |
| Aspect Ratio | Prevent inconsistent fit behavior across viewports | - [ ] Fit via `schema.layout.fitTargetAspectRatio` (default: use container aspect ratio); forbid hardcoded viewport assumptions |
| Centering | Keep zoom and fit stable across intents | - [ ] Center by centroid for all zoom/fit intents; forbid skew from bounding box bias |
| Clusters | Avoid distortion from distant outliers | - [ ] Filter outliers when fitting (`schema.layout.fitDetectClusters`); forbid distortion from distant nodes |
| Cross-mode Cache | Prevent layout drift when switching modes | - [ ] Key layout caches by `semanticMode + frontmatterMode + layoutMode + renderMode + renderVariant + layoutVariant + viewKey + mediaPanelDensity + renderMediaAsNodes`; apply presentation updates without changing cache keys; forbid cross-mode contamination |
| Documentation | Keep behavior discoverable and auditable | - [ ] Keep schema options discoverable; forbid undocumented behaviors or hidden defaults |
| Fit Frame | Prevent over-zoom on large viewports | - [ ] Compute fit scale based on actual viewport dimensions; forbid 4k/ultrawide over-zoom via max scale caps |
| Fit-to-Screen | Keep fit consistent with UI chrome changes | - [ ] Enforce 80/20 fill ratio via `targetFillRatio = 0.8`; forbid inconsistent viewport fill |
| Integration | Keep parsing, schema, and rendering aligned | - [ ] Use schema-driven fit and Mermaid layout paths; forbid bypass of configuration flow |
| Keyword Mode | Make text-derived graph views tunable and portable | - [ ] Derive keyword nodes/edges from document text; remove stopwords; map frequency/strength to sizes with schema tunables; preserve overlays; forbid stopword noise and selection-only dashboards |
| Padding | Avoid clipped nodes and labels | - [ ] Apply `fitPadding` and node padding; forbid edge clipping or truncation |
| Port Handles | Keep edge routing explicit and configurable | - [ ] Route 2D edge endpoints via `schema.behavior.portHandles.*`; forbid interference with tree or Mermaid layouts |
| Rectangular Nodes | Keep node sizing stable across layout modes | - [ ] Size via minimap-relative defaults (tree and port handles); forbid drift across layouts |
| Scaling | Keep zoom limits safe and predictable | - [ ] Clamp zoom scale via `schema.performance.zoom.{minScale,maxScale}`; forbid hardcoded scale extents |
| Schema | Centralize layout and sizing policies | - [ ] Route layout and label sizing through `schema.layout.*`; forbid embedded constants or dataset ties |
| Subgraph Containment | Prevent nodes escaping group bounds | - [x] Clamp member nodes within group bounds; forbid escape or touching borders |
| Verification | Make layout and fit changes regression-resistant | - [ ] Cover fit and layout behaviors via bounded tests; forbid brittle dataset-specific assertions |
| Zoom State | Prevent stale transforms across view toggles | - [ ] Cache zoom state by viewKey across mode/layout toggles; apply presentation updates without changing zoom keys; forbid stale transforms when switching layers/modes/labels/groups |
| Renderer Exclusivity | Prevent inactive/off mode interference | - [ ] Mount exactly one *active* renderer/mode at a time (2D: D3/Flow/Design/Storyboard, 3D, Geospatial); inactive surfaces may be warm-mounted but must be effect-gated (no draw loops, no request consumption, no shared-cache writes) |

---

## Renderer Modes (D3 / GitGraph / Flow / 3D / Geospatial)

### Mode Model (SSOT)

- **Canvas render mode**: `canvasRenderMode` selects the primary graph renderer surface:
  - `2d` (graph)
  - `3d` (graph)
- **2D renderer**: `canvas2dRenderer` selects the active 2D implementation:
  - `d3` (`GraphCanvas` SVG/D3 renderer)
  - `gitGraph` (`MermaidGitGraphCanvas` Mermaid GitGraph SVG renderer)
  - `flow` (`FlowCanvas` native Canvas2D renderer)
  - `design` (`DesignCanvas` 2D design surface)
  - `storyboard` (`StoryboardWidgetCanvas` Storyboard surface; Display Controls choose Card or Widget presentation)
- **Geospatial Mode**: hosted by `gympgrph` and treated as a mutually exclusive overlay mode.

### Exclusivity Rules (Non-Negotiable)

- Only one renderer surface is active at a time (2D: D3/GitGraph/Flow/Design/Storyboard, 3D, Geospatial).
- The host may warm-mount inactive surfaces to reduce switch lag, but inactive surfaces must be effect-gated (no draw loops, no request consumption, no shared-cache writes).
- Only the active renderer may consume shared requests (e.g. `zoomRequest`) and own interactive listeners.
- Switching modes must preserve selection and avoid cross-mode cache contamination by keying layout/zoom caches with mode + renderer.

---

## Workspace View Modes (Canvas vs Editor)

### Mode Model

- **Canvas mode** is the default full-screen graph workspace with the Toolbar, the quick-review bottom surface, and the optional right floating panel.
- **Editor mode** is a VS Code-like embedded workspace that reuses the existing Markdown Workspace SSOT (files + editor/viewer/split/presentation + import + apply-to-graph) and shares the same Canvas pane.
- **Graph Data Table mode** is a table-first workspace for Nodes/Edges inspection that also shares the same Canvas pane.

- The right FloatingPanel shell is a single FloatingPanel primitive (semantic complementary shell via `FloatingPanel semantic shell`) and must not be re-implemented with ad-hoc containers.
- Only the active FloatingPanel tab is mounted; inactive tabs must not render hidden panels to avoid background work and cross-mode interference.
- FloatingPanel tabs header must use semantic navigation elements (`<header>` + `<nav>`/`<menu>`), not generic wrappers.
- MainPanel tab behavior must come from one metadata path for tab labels, searchable tabs, search placeholders, and footer copy; headers, search rows, footers, and key/value rows must wrap responsively on narrow widths instead of overlapping, and Settings lazy-load helpers must not depend on toolbar-owned init chunks.
- FloatingPanel shell behavior must come from one metadata path for view buttons, shared header status chips, full-height body views, and renderer-only header actions; cap shell width to the viewport, let header/status rows wrap, and keep inactive views unmounted.
- FloatingPanel Chat UI must expose its runtime context as state-derived semantic chips (`Scope`, `Sources`, `Workspace`, `Selection`, `Memory`, `Context`) and quick prompt actions as ordinary controlled input updates, not as provider-specific tools or duplicated submit paths. The controlled composer reuses the shared command-menu listbox, chat skill/command registries, Markdown variable helpers, media candidate projection, inline media thumbnail renderer, and keyword catalog: `/` filters canonical chat commands; `@` inserts canonical `{{key}}` workspace references or image/audio/video embeds from workspace text and FloatingPanel Media; rendered media variables such as `{{mediaUrl}}` reuse the same mini-thumbnail renderer; and `#` selects registered runtime directives such as scoped memory, media context, agent, model, and MCP routing. FloatingPanel Chat and card editing consume one cached uploaded-media inventory adapter, so opening both surfaces does not repeat the storage listing request. Runtime directives add a bounded system contract with the active provider/model and exact registered tool names; missing scope or unavailable tools must yield a handoff, never fabricated execution, while `#media` may consume only referenced workspace/media assets and must not invent URLs. A semantic `Ingest -> Parse -> Render` status strip derives only from existing Source File lifecycle and graph state; each stage may seed a diagnostic prompt but must not create a second pipeline runtime. Prompt actions still execute through `useFloatingPanelChatSubmit` and the shared submit coordinator. Workspace-context cache status is scope-aware: selection-only turns do not carry a workspace/source cache key, while workspace/hybrid turns surface cache readiness from the shared prompt cache. Cache identity hashes exact active-document and source text through the bounded shared text-hash cache so same-length middle edits cannot reuse stale context.
- FloatingPanel Chat response and persistence contract: enforce markdown-syntax-guidelines-aligned output (variables/sigils/tables/flow blocks). Standard chat responses may include one optional `response:` YAML metadata block for Storyboard Widget (2D) + Multi-dimensional Table + Kanban follow-up parameterization, while `chatAgenticGraph` accepts the structured KGC contract or a literal MCP result whose `structuredContent` already extracts to renderable Widgets, Rich Media Panels, Cards, Text/Image/Audio/Video media, safe inline compute, and handle-bearing edges. `useFloatingPanelChatSubmit` stays a thin shell for request guards and optimistic state, and the async submit lifecycle remains owned by `floatingPanelChatSubmitCoordinator.ts` plus the existing request, transport, streaming, validation, and recovery helpers. Commit one final chat bubble: concise bullets (≤50 words) plus a workspace link to the current canonical workspace document under `chatLocalStorageRootPath`, using the session-folder contract `/chat-log/YYYYMMDDTHHmmssZ/kgc_YYYYMMDDTHHmmssZ.md` (no per-message files). In `chatAgenticGraph` mode, `New Chat` must create/open a fresh session folder plus canonical `kgc_*.md` and route the next turn to that file. For `chatAgenticGraph`, saved KGC remains one standalone frontmatter-first parser-valid computing-flow-compatible document for direct ingest/render, while renderable literal MCP structured surfaces finalize without KGC retry or synthetic KGC text and then project through the same Editor Workspace -> Source Files -> frontmatter-flow -> Canvas path. Streaming keeps the canonical document parseable via deterministic fallback and upstream recovery while preserving the substantive answer content inside the canonical KGC document.

### Canvas Interaction Panel (Floating)

- In Canvas mode, interaction + arrangement actions are consolidated into a single **Interaction** tab inside the Floating Panel (adjacent to the **Props** view in the header). Toolbar shortcuts (3D toggle, Canvas Interaction Mode, Workspace Sync Mode) are thin views over the same SSOT settings used by this panel and by the Settings view.
- The Interaction tab hosts:
  - **Viewport**: read-only Viewport status and SSOT field groups (Readout, Transform, Zoom Modes, Wheel, Speeds, Flow) derived from the active 2D renderer state, schema zoom settings, and canvas interaction settings (including Canvas Interaction Mode).
  - **Interaction**: pointer mode (Pan vs Select/Drag) and layout selector (Force/Radial) that writes `schema.layout.mode`.
  - **Centering / Centroid**: Center on Selection and Center on All Items.
  - **Even Spread**: Distribute Horizontally/Vertically with a 3+ node guard and selection count helper text.
  - **Performance**: opt-in perf overlay toggle plus read-only perf metrics (render updates/sec, state updates/sec, last layout init).
  - **Interaction Modes**:
    - **Canvas Interaction Mode**: `infiniteCanvasInteractionMode∈{static,interactive}` controls how aggressively the infinite canvas applies force-directed layout and overlay interactivity:
      - `static` (default) runs D3 force layout to a bounded stable state and then freezes simulation; rich media and markdown overlays forward wheel/pan to the canvas so drag/pan/zoom stay primary; Graph Data Table and GraphRecordDb treat position-only updates as non-syncing metadata (no background churn).
      - `interactive` keeps D3 forces running continuously and enables full overlay interactivity (iframes/images/videos/markdown blocks accept wheel/pointer events and do not forward to canvas) while preserving the same SSOT GraphData and layout keys.
    - **Workspace Sync Mode**: `canvasWorkspaceSyncMode∈{manual,realtime}` controls when Canvas↔Graph Table syncing happens:
      - `manual` (default) disables automatic GraphRecordDb sync from Canvas and surfaces a single **Sync now** action in the Graph Table toolbar; Canvas edits only sync to tables on explicit user actions.
      - `realtime` enables automatic sync, still gated by revision+viewKey to avoid loops: in static mode the sync key is `graphContentRevision` (structure-only), in interactive mode it is `graphDataRevision` (including position-only changes).
- Viewport field groups are read-only views over the existing settings and schema; mutating the underlying behavior remains the responsibility of the Render and Settings panels.
- Forbid duplicate/legacy “Arrange” surfaces (canvas overlays or editor tabs) that reintroduce conflicting gesture ownership, parallel Interaction UIs, or duplicate actions.

### Agentic Canvas OS Dashboard Document/Runtime Model

- Agentic Canvas OS Dashboard is a Canvas-rendered Source Files Markdown document, not a new Canvas runtime. The canonical document path pattern is `agentic-os/<runId>/dashboard.agentic-os.md`.
- The dashboard document owns stable frontmatter and human-readable body sections; the run manifest owns volatile runtime facts such as tool attempts, approval states, cost logs, artifacts, and failures.
- Canvas renders the dashboard through the existing Editor Workspace -> Source Files -> frontmatter-flow -> Storyboard/shared widget-runtime path. It must not mount a dashboard-only graph store, renderer, preview, inspector, or mutation bridge.
- The dashboard document may contain `AgenticOSProfile`, `AgenticOSPlan`, `AgenticOSToolCall`, `AgenticOSApprovalGate`, `AgenticOSBudget`, `AgenticOSEvidencePack`, `AgenticOSArtifact`, `AgenticOSFailure`, and `AgenticOSDemoPack` nodes. These are ordinary GraphData nodes projected from frontmatter-flow, not bespoke React component types.
- Market validation and real-browser research extend the same document model. The dashboard document may also contain `AgenticOSMarketReport`, `AgenticOSSourceCard`, `AgenticOSBrowserSession`, and `AgenticOSMediaEvidence` nodes for source-backed social/community/product research, evidence levels, screenshots/media artifacts, and browser capture status.
- Starter repo planning extends the same document model. The dashboard document may contain `AgenticOSStarterRepo`, `AgenticOSAuthBoundary`, `AgenticOSGatewayPolicy`, and `AgenticOSDeploymentPreflight` nodes for secured React frontend, agent backend, auth, tool policy, IaC choice, tests, docs, and deployment readiness.
- Self-improving agent memory extends the same document model. The dashboard document may also contain `AgenticOSLearningLoop`, `AgenticOSRecallCard`, `AgenticOSSkill`, `AgenticOSIdentityFacet`, and `AgenticOSLearningNudge` nodes for finalized-trace learning, bounded past-conversation recall, reviewed skills, editable identity facets, and persistence prompts.
- Runtime state may be inspected read-only by browser WebMCP, but write, deploy, paid-call, and Stripe/payment actions remain dry-run or blocked unless a source-owned approval contract and focused validation exist.
- Updating runtime state must write through Source Files or accepted MCP `structuredContent` projection before Canvas apply. Direct external evidence -> Canvas graph mutation is forbidden.
- Browser evidence nodes are local-only inspection artifacts. They may describe an approved dedicated Chrome profile, scoped domains/tabs, rendered DOM summaries, network provenance, screenshots, and media resources, but must not expose credentials, cookies, private messages, unrelated tabs, unscoped network bodies, or direct social-platform actions.
- Market report nodes must keep claim ids tied to source-card ids and evidence levels. Canvas can visualize confidence, gaps, and next-test recommendations, but it must not upgrade weak evidence into strong claims or mutate product-roadmap graph state without a separate approved apply step.
- Starter repo nodes must remain dry-run blueprint state until approval; Canvas may visualize file manifests and preflight gaps, but it must not imply copied scaffolds, generated secrets, or deployed infrastructure.
- Learning nodes must keep source trace ids, confidence, scope, expiry/review state, redaction status, and approval state visible. Canvas can visualize candidate skills and identity facets, but it must not auto-promote skills, hide identity drift, learn from draft/aborted turns, or send private memory to deployed public MCP surfaces.
- Detailed lane payloads live in `agenticgraph-mcp-agentic-os-prd-tad.companion.md`; this Canvas document owns renderer/path invariants only.
- The dashboard runtime state machine is bounded to `draft -> profiled -> planned -> dry_run_ready -> approval_required -> approved -> executing -> verified/failed/blocked -> archived`; loops must honor the Agentic Canvas OS max-iteration and token/TCO budget contract.

### Preview Contract (SSOT)

- **Editor/Table split view**: the Canvas is mounted once (single `CanvasViewport`) and resized into the right-side Canvas pane. The Editor workspace and Graph Data Table must not mount a second “Canvas Preview” instance.
- **Embedded preview mode (external embed)**: if an `iframe` is used for embedding outside the workspace (marked with `data-kg-preview="1"` or `?kgPreview=1`), preview-only rendering must apply (no Toolbar, no bottom surface, no floating panels) so it cannot recursively enter Editor mode and cannot consume unnecessary UI resources.
- For embedded preview mode, the host may sync preview state via same-origin messaging (`kind: 'kg-preview-sync'` for graph/schema/render/selection) and via persisted geospatial state (`kg:ui:geospatial:overlayEnabled` via `storage` events).
- Preview sync handlers must ignore identical schema/graph payloads (hash/signature compare) to prevent rerender loops and React update-depth errors.
- Preview sync graph hashing must ignore store-injected `metadata.graphDataRevision` and `metadata.hash` fields so preview ↔ host echoes do not trigger infinite sync loops.

- A small non-interactive viewport readout overlay may be shown in Canvas mode for debugging drift (zoom % and viewport center). If shown, it must remain single-surface and must not trigger per-frame React rerenders.

### Rich Media Rendering (2D/3D, Viewer, Export)

- **Rich Media nodes** are neutral graph nodes whose properties resolve to URL-like media (image, svg, video, iframe) via shared `getNodeMediaSpec` heuristics; the same detection is reused across 2D (D3/Flow/Design), 3D, and Markdown Viewer surfaces.
- **Overlay pool**: Rich Media rendering uses a bounded DOM overlay pool per canvas. Overlays are mounted once, keyed by node id, and scheduled via a shared RAF-coalesced scheduler so drag/pan/zoom/3D motion do not cause per-frame React rerenders or repeated layout computation.
- **2D D3**: media panels render in a dedicated DOM overlay layer positioned over the SVG via zoom transform + layout-derived node centers. Scheduling is idempotent and tolerant of transient NaN/undefined positions; once positioned, overlays do not hide offscreen on bad frames and do not clamp to viewport borders during workspace pane resizes.
- **3D**: media panels render in a DOM overlay layer driven by the 3D camera and synchronized every render frame via `useFrame`. Overlay distance, pool size, and density (base width, min/max px) are schema/settings-driven; panels are sorted by depth and clamped by a bounded visibility budget to avoid unbounded DOM growth.
- **Viewer + Script/Imgs/Fid**: Script/Imgs/Fid defaults are auto and driven by the same rich-media + iframe heuristics used by Markdown Viewer and Canvas; per-doc frontmatter (`kgWebpageScriptPolicy`, `kgWebpageIncludeImages`, `kgWebpageFidelityLevel`) is optional and treated as an escape hatch only.
- **Export HTML Canvas (2D/3D)**: Canvas HTML export reuses the same Rich Media overlays and layout SSOT. 2D exports prefer centered SVG markup; PNG fallbacks are captured via a pixelRatio-aware snapshot API (hi-DPI, bounded to a safe max) and embedded as `<img>` in the export HTML. 3D exports embed a GLB + module script plus an immediate hi-DPI PNG snapshot that displays while Three.js initializes, then hides after the first successful render.
  - Export must rewrite local proxy URLs inside SVG and overlays for standalone fidelity: unwrap `/__fetch_remote?url=...`, `/__webpage_proxy?url=...`, and `/__webpage_asset_path/...` to absolute URLs; inline `/__codebase_file?path=...` and `/__codebase_asset?path=...` assets into `data:*;base64,...` up to a bounded max per asset.
- **Single-surface invariant**: at most one Rich Media overlay surface per canvas is allowed (2D overlay layer or 3D overlay layer); Editor/Table split and embedded preview must reuse the same canvas overlay layer and must not mount second “preview-only” Rich Media surfaces.
  - Exported HTML Canvas viewer uses a full-viewport canvas (100vw×100vh) with the same pan/zoom semantics as Canvas mode and a compact HUD exposing 2D↔3D, Rich, Media, and Frontmatter toggles. These toggles are strictly view-only and may only gate renderer/overlay/media interaction, not GraphData or layout derivation.

#### How to use HTML Canvas export (end-user)

- In Canvas mode, open the toolbar Export menu and choose **HTML Canvas**.
- Pick **Scope** (Current viewport or Fit to content), background (transparent or solid), and pixel ratio, then download the HTML file.
- Open the downloaded HTML in a browser and use pan/zoom and HUD toggles (2D/3D, Rich, Media, Frontmatter) just like in Canvas.
- Prefer 2D exports for static graph snapshots and flow diagrams; prefer 3D exports when depth, overlap, or camera motion is important for understanding the graph.

### Editor Workspace Sections (Markdown vs Graph Data Table)

- The Editor workspace reuses the **Markdown Workspace** as the SSOT for document text (Explorer + Editor/Viewer/Split/Presentation), while `2D Renderer: Gallery` projects the active Markdown document from Canvas View Mode.
- Import Folder in Markdown Workspace must be lazy: create file/folder entries and pending stubs without reading contents; clicking a file triggers indexing/loading/parsing/rendering (including on-demand PDF conversion) and shows an `Indexing` progress pill using the shared `label • n/n • kb/kb` formatting.
- Switching files and switching webpage view modes must not toggle `frontmatterModeEnabled` or trigger graph/layout/zoom recomputation; webpage view switches are strictly Viewer/Presentation-only and must not apply-to-graph.
- Workspace file CRUD (create/edit/delete/clear) must sync to the Source Files list (with stable IDs keyed by `workspace:<path>`); file open should reuse cached `parsedGraphData` from Source Files when the text hash matches.
- Markdown Workspace layout controls (Explorer open/closed, Canvas pane open/closed, Editor/Viewer/Split/Presentation) are UI-only state; toggling them must not rewrite graph state or invalidate layout/zoom caches.
- In Viewer and Split modes, the rendered Markdown article content width must remain a stable 80% of the Viewer `section` width even when the Canvas pane or Explorer is toggled.
- `Save As...` in the Markdown header may export Markdown/JSON/JSON-LD and must support PDF export via a print pipeline that does not rely on pop-up windows.
- GeoJSON/JSON files that contain geodata must render as a normal graph by converting geodata into nodes with `properties.geo.{lat,lng}` (supporting FeatureCollection and record arrays), so both Canvas and Geospatial Mode can display the dataset.
- Editor mode must not mount any separate Selection/Record Inspector dock (forbid extra inspector `<header>/<section>` surfaces in Editor mode).
- If a Graph Table section exists, it is treated as an optional tool surface; it must not introduce a second inspector dock outside the table workspace.

### Multi-dimensional Table / Graph Data Table (Editor Workspace) Contract

- Document Mode “Multi-dimensional Table Mode” controls only canvas `multiDimTableModeEnabled` for graph layout; it must not open or configure the Graph Data Table workspace, and must stay renderer/layout scoped rather than acting as a second entry-point into Workspace Editor table views.
- The **Workspace: Multi-dimensional Table** view is owned by the Markdown workspace data-view renderer. Canvas View Mode “2D Renderer: Multi-dimensional Table” and Workflow Manager both mount the shared `MultiDimTableSurface`, which delegates to `MarkdownWorkspaceDerivedViewer` with `viewerMode="multiDimTable"`.
- Canvas View Mode “2D Renderer: Storyboard” reuses the same `FloatingPanel -> View` data-view registration path through a headless bridge that is mounted only while the `View` tab is active. The bridge derives its settings source from the shared canvas data-view source helper and must not add a Storyboard-local view settings panel, duplicate field inventory, or warm a hidden table renderer.
- Editor Workspace Table / Multi-dimensional Table / Kanban and Storyboard must share the same hover-revealed `New Record` divider-row owner, semantic header/settings structure, persisted data-view config, and viewer-header utilities; do not fork separate Storyboard or renderer-local list/table action rows for the same record-creation affordance.
- Source-attached Markdown with leading YAML frontmatter must project through one editable `Markdown YAML Frontmatter` data-view table plus the `Markdown Body` line table. The frontmatter table keeps generic hierarchy/source columns and derives neutral semantic columns (`Summary`, `Output`, `Action`, `Reference Pack`) from authored YAML keys such as `kgc:readingSummary`, `output*`, `action`, `source_url`, `workspacePath`, and reference URL fields. First render uses shared structured-source presentation defaults that prioritize `Key`, `Type`, generated type-specific value columns such as `Scalar Value`, `List Value`, and `Mermaid Gantt Value`, semantic columns, `Content`, and `Line` while keeping canonical `Value` and the full field inventory available through Properties; the shared settings owner lets users switch the visible preset to a type-generic `Value` column without changing projection or writeback. Data-view tables render drag-resize handles through the shared resize separator runtime, with preview `<colgroup>` widths applied in both row-record and column-record pivots. Typed frontmatter block-scalar payload rows inherit their sibling `type` and keep payload text in the matching type-specific value column. Markdown pipe-table blocks found across adjacent source-line rows render as nested row/column tables with a compact caption (`columns`, `rows`, source line range), continuation markers, and Level-derived indentation for YAML Frontmatter rows; Body/source rows fall back to `Indent` when no `Level` column is present. The source-line rows, line numbers, and writeback map remain intact. The projection must stay file-agnostic and source-line mapped; it must not create Strybldr-only storyboard tables, copied fixtures, or downstream alias/remap paths.
- The table header owns a persisted Row <-> Column pivot toggle through workspace data-view config. Pivoting is render-only: it swaps the visible table axes after search/filter/sort while keeping the canonical Markdown table, YAML source-line map, and `rowId`/`columnId` edit callbacks unchanged. `Pivot: rows as records` must expose Level/Indent-derived nested-row depth through a dedicated leading hierarchy column that owns indentation, default-expanded parent-row collapse toggles, and expand-all/collapse-all for nested descendants. `Pivot: columns as records` must reuse the same nested-row state and toggle behavior through a transposed hierarchy field row so descendant record columns collapse without changing source identity. Semantic fields such as `Key`, `Type`, `Value`, and `Content` stay aligned while collapse remains presentation-only: source rows, nested table grouping, line mapping, and edit callbacks remain source-identity preserving.
- FloatingPanel `View` mounts the shared workspace data-view settings owner. Its query workbench exposes projection orientation and the shared hover-revealed `New Record` action, while the existing `Sort`, `Filter`, and `Group` sections own their respective status and controls, and `Properties` owns the searchable field visibility inventory and field-level actions using the same persisted data-view config as the table header, Storyboard header, and settings sections; it must not import Perspective code, DOM identifiers, or provider-specific table assumptions.
- The table surface must remain self-contained and drift-resistant:
  - Rendering uses the Markdown data-view table/kanban/multi-dimensional table utilities with a single scroll owner.
  - View shaping is driven by the data-view header/settings and persisted through workspace data-view config, not removed graph-table workspace local-storage keys.
  - Canvas and Workflow Manager must not open or warm a separate graph-table workspace route for this mode.
  - Storyboard card and lane surfaces may project graph-backed cards differently, but toolbar/data-view affordances must still reuse the shared Storyboard Widget toolbar, shared Storyboard action/binding helpers, and shared Workspace/Kanban utility owners instead of re-authoring record/table controls per renderer.

### Record Inspector (SSOT)

- The Record Inspector UI is a host-owned SSOT component (`GraphRecordInspector`) and may be reused by inspector surfaces that still consume GraphRecordDb row primitives.
- Editor mode must not mount a standalone inspector dock; inspector surfaces belong to Canvas mode (Floating Panel) or Graph Table workspaces only.
- When Storyboard is in Widget presentation, the shared Storyboard Widget Inspector is consolidated into the same Floating Panel "Inspector" surface via `STORYBOARD_WIDGET_INSPECTOR_PORTAL_SLOT_ID` to avoid duplicate inspector panels.
- The Inspector view must render its layout even with no active selection so the Floating Panel always shows stable structure; inputs may be disabled but the surface must stay visible.
- Editing a field in the inspector updates the persisted Graph Table cache first, then applies a bounded write-through to the graph store to keep `graphDataRevision` and derived render views consistent.

### Storyboard Widget Widget Live Sync (Canvas ↔ Editor Workspace ↔ Graph Data Table)

- Storyboard Widget open state is stored in the shared graph view state (`openWidgetNodeIds`) and must not be local to a single renderer.
- Storyboard Widget canvas and Graph Table Inspector must consult the same open list to render widget panels for node rows.
- Editor Workspace must surface Storyboard widgets **as codes** inside the Markdown editor/viewer (JSON/Markdown), not as a second widget panel.
- Switching workspace view modes must preserve the open list unless the underlying nodes are removed from `GraphData`.
- In Storyboard Widget, pinned widgets adjust anchor offsets on header drag; dragging a pinned widget moves all pinned overlays together, while unpinned overlays drag freely and clamp in the viewport.
- WidgetEditor is decomposed into focused modules: `WidgetEditorInner` (orchestrator), `WidgetEditorView` (pure view), `flowWidgetOverlayShared` (types/constants), `useWidgetPlacementRuntime` (position/scale), `useWidgetDragHandlers` (pointer drag), `useWidgetRichMediaToolbar` (rich-media toolbar). See `agenticgraph-storyboard-widget-document.md`.
- Storyboard Widget overlay collision resolution is scheduled on overlay set changes and quantized zoom changes (not every interaction tick). See `agenticgraph-storyboard-widget-pan-zoom-overlay-failsafe-document.md`.
- Graph data commits preserve overlay-carryover state: when a commit modifies graph data, overlay-managed node positions and connected edges are carried over to the new revision so pinned overlays do not drift.
- Widget world positions are stored per graph meta key (`flowWidgetWorldPosByNodeIdByGraphMetaKey`) so positions persist correctly when switching between frontmatter-flow graphs; transient placement authorities are reset on workspace reopen.
- Frontmatter-flow auto-managed widgets (text/image/video generation, rich media panel, video transcriber) use a centralized placement authority (`widgetPlacementAuthority.ts`) that decides auto-placement, pinned-in-canvas defaults, screen-space authority for floating widgets, and balanced collective layout preservation.
- A direct provider-backed TextGeneration Widget Card Run keeps the authored prompt, summary, and other input fields on the source card. When an input edge supplies Rich Media text, the provider prompt carries that value inside a delimited connected-source context and carries the unchanged Widget Card text afterward as the user-authored request; source context must not replace the authored request. The provider infers response-language intent semantically from the authored request, without a fixed language list or script detector. An explicit or otherwise clear output language proceeds directly; only genuine ambiguity about translation versus continuation across different source/request languages asks one concise clarification in the authored-request language. Streaming and terminal generated Markdown belong to one workflow-owned Rich Media Panel connected by the typed `text_out -> output` edge. Repeated Run reuses that panel and edge, snapshots a pre-versioned existing result before the first streamed chunk, appends exactly one immutable terminal Markdown version per successful run, selects the latest result, and exposes older versions through one shared selector: Storyboard projection mounts it in the always-present panel header so vector-painted bodies remain selectable, while non-Storyboard text surfaces mount it above the body. Selecting a version updates `selectedOutputVersionId` without changing the source Widget Card or either edge. An OpenAI Responses stream that terminates `incomplete/max_output_tokens` before visible text receives one bounded retry with minimal reasoning; a second terminal failure remains explicit, and every terminal path refreshes the existing Storyboard edge overlay. Explicit Rich Media targets still win, while Run All retains its separate no-implicit-panel gate.
- Applied markdown document authority must include explicit reapply epochs, not only document path identity: when `applyMarkdownDocument(...)` replays the active source authority, Storyboard Widget draft lifetime must invalidate on the shared applied-document semantic key plus an incremented apply revision even if the path and markdown text are unchanged.
- Same-path same-text source reapply is a real reset boundary: transient Storyboard Widget draft panels, Storyboard Rich Media panels, and authored draft-only edges must clear back to source-owned baseline state before the next render or drop cycle rather than persisting until a path/text change happens.

### Selection Sync (Table ↔ Preview ↔ TOC)

- Table → Preview: selecting a row sets `selectionSource='table'`; the preview auto-zooms to the corresponding node/edge.
- Preview → Table: the preview posts selection changes (same-origin) and the host updates table focus without inducing scroll-jump.
- Table → TOC: when a node row provides a stable TOC id (e.g. `anchorId` or `anchor`), the host requests TOC focus so the Explorer scrolls to and highlights the matching heading.

---

## Repository Architecture

**Module Hierarchy**: schema defaults/types → layout engines (force/radial/block/Mermaid) → collision + overlap resolution → fit + zoom controller → renderer layers (nodes/links/groups)

**Dependency Flow**: schema/config readers → positioning/caching → simulation/constraints → scene composition → zoom state persistence

### High-Level Components

- Graph canvas host:
  - `canvas/src/components/GraphCanvas/*` orchestrates layout, zoom, scene layers, and caching.
- Layout engines:
  - `canvas/src/components/GraphCanvas/layout/*` implements force/radial/block layout pipelines, Mermaid-owned layout handoff, and shared helpers.
- Overlap resolution:
  - `canvas/src/components/GraphCanvas/layout/{overlap.ts,groupOverlap.ts,relax.ts}` centralize bbox collision and bounded relaxation.
- Fit and zoom:
  - `canvas/src/components/GraphCanvas/{fit.ts,zoom.ts,zoomState.ts,zoomController.ts}` centralize zoom policies and per-view caching.
  - Collective fit+center must be display-consistent across 2D renderers: fit uses display-derived graph bounds (post filters/collapse), includes node dimensions (`visual:width/height` when present) and group envelopes (clusters/subgraphs/layers), and centers the visible graph in the viewport.
- Shared presets:
  - `grph-shared/src/zoom/presets.ts` provides reusable fit/zoom presets reused by fit logic and simulation/layout seeding.

---

## Module Specification

### Module: `GraphCanvas` fit + zoom policy

**Goal**: provide stable Fit-to-Screen/Fit-to-Selection behavior across view toggles and layout modes.

| Context | Intent | Directive | Module | Function/Method | Input | Output | Decision Logic |
|---|---|---|---|---|---|---|---|
| Fit mapping | Keep fit consistent across viewports | - [ ] Fit on actual viewport dimensions with `targetFillRatio = 0.8`; forbid viewport-dependent over-zoom | GraphCanvas | fitAllTransform | viewport, schema | transform | Use container aspect-ratio then scale by fill ratio |
| Zoom centering | Prevent drift between fit and user zoom | - [ ] Scale centered on graph centroid; forbid bbox-bias centering | GraphCanvas | scaleCenteredOnGraphCentroidTransform | centroid, scale | transform | Always compute centroid from rendered nodes |
| Zoom state | Avoid stale transforms when switching views | - [ ] Cache zoom state per viewKey; forbid cross-mode reuse | GraphCanvas | setZoomStateForKey | viewKey, zoomState | persisted state | viewKey includes presentation toggles |

### Module: semantic mode isolation (Document ↔ Keyword)

**Goal**: switching semantic modes must not mutate the canonical document schema or reuse stale selection/collapse state.

| Context | Intent | Directive | Module | Function/Method | Input | Output | Decision Logic |
|---|---|---|---|---|---|---|---|
| Semantic mode switch | Prevent schema/layout bleed across modes | - [ ] Restore schema snapshot per semantic mode; clear selection + collapsed groups on switch | store | setDocumentSemanticMode | next mode | schema + cleared view state | Schema snapshots are stored in-memory as `schemaBySemanticMode` |
| Schema persistence | Keep Document Structure Mode as baseline | - [ ] Persist schema writes only in Document mode; keyword-mode tweaks are non-persistent | store | setSchema | schema edits | persisted schema | Gate `writeSchemaToStorage` by `documentSemanticMode==='document'` |

### Module: layering + group separation knobs

**Goal**: keep nested group borders readable and edges visually subordinate, without hardcoded constants.

| Context | Intent | Directive | Module | Function/Method | Input | Output | Decision Logic |
|---|---|---|---|---|---|---|---|
| Nested group spacing | Prevent group-of-groups borders snapping together | - [ ] Apply depth-based padding using `layout.groups.nestedPaddingStep` | GraphCanvas | createGroupsLayer | schema.layout.groups | separated group boxes | Outer groups get more padding than inner groups |
| Edge underlay readability | Keep edges beneath groups/nodes | - [ ] Use schema-driven 2D edge opacity (`layout.edges.opacity`, `layout.edges.opacityUnderGroups`) | GraphCanvas | useGraphCanvasStyles | schema.layout.edges | readable edges | When groups enabled, pick the lower opacity |
| Fixture neutrality | Avoid local absolute paths | - [ ] Forbid hardcoded sibling-checkout fixture paths in code/tests | policy | testForbidHardcodedExternalFixturePaths | source scan | CI guard | Use explicit env-provided fixtures or repo-local `data/test-data` fixtures |

### Module: collision + overlap SSOT

**Goal**: ensure no node/group overlap and keep collision knobs schema-driven.

| Context | Intent | Directive | Module | Function/Method | Input | Output | Decision Logic |
|---|---|---|---|---|---|---|---|
| Collision config | Centralize tunables | - [x] Read bbox collision settings from schema; forbid ad-hoc constants | layout | readCollisionConfig | schema.layout | config | Single config reader used by all modes |
| Group overlap | Prevent group bbox intersections | - [x] Enforce group bbox collision whenever groups enabled; forbid disabling via legacy knobs | layout | createGroupBboxCollideForce | schema.layout.groups | force | Group membership derived from rendered group key |
| Nested containment | Prevent child inner border touching parent outer envelope | - [x] Use indexed borders (x1..x5 vs x2..x4) with axis-aware nested touch-epsilon; gate Z by explicit depth | layout | createGroupBboxCollideForceByDepth | schema.layout.groups | stable nested spacing | Parent outer uses gap; child inner uses half extents |
