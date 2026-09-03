# agentic-graph Canvas Frontend: Universal Technical Specification

> Canonical index document. Keep this file sub-600; continue interaction and operations detail in `agentic-graph-frontend-document-interactions-and-operations.md`.

## Design Mantras

```
- [ ] Observability; expose graph state visibly; forbid opaque transformations
- [ ] Schema-driven; validate against type definitions; forbid untyped mutations
- [ ] Centralized state; use single store; forbid scattered local state
- [ ] Shallow selectors; minimize re-renders; forbid broad subscriptions
- [ ] UI density control; configure icons centrally; forbid hardcoded sizes
- [ ] Panel isolation; separate concerns by view; forbid cross-panel coupling
- [ ] Persistence clarity; localStorage for preferences; forbid implicit defaults
- [ ] Reproducibility; serialize workflows; forbid non-deterministic configs
```

---

## Universal Design Principles

| Context             | Intent                              | Directive                                                                                      |
|---------------------|-------------------------------------|------------------------------------------------------------------------------------------------|
| Abstraction         | Separate graph from presentation    | - [ ] Define clear store interfaces; hide implementation; forbid direct DOM manipulation      |
| Atomicity           | Ensure state consistency            | - [ ] Update graph/schema atomically; rollback on error; forbid partial updates               |
| Caching             | Optimize graph computations         | - [ ] Cache derived layers; invalidate on mutations; forbid stale community data              |
| Composition         | Build from reusable components      | - [ ] Compose panels from primitives; enable reuse; forbid monolithic views                   |
| Configuration       | Externalize behavior                | - [ ] Define workflow/schema configs; document presets; forbid embedded constants             |
| Consistency         | Maintain uniform patterns           | - [ ] Apply icon/density patterns uniformly; document conventions; forbid arbitrary exceptions|
| Decoupling          | Minimize panel dependencies         | - [ ] Use store selectors; inject configs; forbid tight panel-to-panel coupling              |
| Determinism         | Ensure reproducible workflows       | - [ ] Fix parser/workflow seeds; normalize inputs; forbid non-deterministic graph builds      |
| Documentation       | Explain architecture decisions      | - [ ] Document panel flows; provide diagrams; forbid undocumented magic                       |
| Encapsulation       | Hide store internals                | - [ ] Expose minimal store actions; version slices; forbid direct state mutation              |
| Error Handling      | Fail gracefully in UI               | - [ ] Validate schema inputs; return descriptive errors; forbid silent parser failures        |
| Extensibility       | Support new panels/parsers          | - [ ] Design plugin points for parsers; version schemas; forbid closed architectures          |
| Idempotence         | Guarantee safe re-runs              | - [ ] Parse/import idempotently; avoid side effects; forbid duplicate node creation           |
| Immutability        | Preserve graph integrity            | - [ ] Copy before transform; avoid in-place edits; forbid source graph corruption             |
| Instrumentation     | Enable UI observability             | - [ ] Emit panel events; expose metrics; forbid black-box rendering                           |
| Locality            | Bound component scope               | - [ ] Keep panels focused; single responsibility; forbid sprawling components                 |
| Modularity          | Isolate panel responsibilities      | - [ ] Define clear panel boundaries; minimize coupling; forbid cross-concern mixing           |
| Naming              | Use consistent conventions          | - [ ] Follow React/TS standards; be descriptive; forbid cryptic abbreviations                 |
| Neutrality          | Abstract domain logic               | - [ ] Use general graph algorithms; configure specifics; forbid workflow-specific assumptions |
| Performance         | Optimize render paths               | - [ ] Profile hot render paths; target shallow selectors; forbid premature optimization       |
| Provenance          | Track graph lineage                 | - [ ] Record sources; timestamp changes; forbid orphaned markdown nodes                       |
| Reusability         | Share common UI logic               | - [ ] Extract utilities; parameterize components; forbid copy-paste duplication               |
| Scalability         | Handle large graphs                 | - [ ] Design for thousands of nodes; test limits; forbid O(n²) layout algorithms             |
| Security            | Protect against threats             | - [ ] Validate parser inputs; sanitize outputs; forbid XSS in markdown rendering              |
| Separation          | Divide UI concerns                  | - [ ] Layer panels/store/canvas; forbid mixing presentation/business/state logic              |
| Simplicity          | Prefer straightforward solutions    | - [ ] Choose simple over clever; forbid unnecessary complexity                                |
| Testability         | Enable automated verification       | - [ ] Inject store dependencies; expose test hooks; forbid untestable components              |
| Transparency        | Make state visible                  | - [ ] Log store actions; expose panel state; forbid opaque operations                         |
| Validation          | Verify all graph inputs             | - [ ] Check schema preconditions; enforce invariants; forbid assumption-based processing      |
| Versioning          | Track schema evolution              | - [ ] Namespace schemas; deprecate gracefully; forbid breaking changes without migration      |

---

## agentic-graph Canvas Architecture

**UI Stack**: Canvas Visualization → Panel System → Zustand Store → Graph Data Model → Schema Catalog

**Data Flow**: Source Files → Parsers → useGraphStore → React Components → User Interaction → State Mutations

**Design Principles**: Schema-Driven | Observable State | Panel Isolation | Centralized Configuration

### High-Level Components

- **Graph Visualization**:
  - `canvas/src/components/GraphCanvas.tsx` implements node/edge rendering, selection handling, and layout modes (semantic, document, schema-centric).
- **Panel System**:
  - `canvas/src/features/panels/` organizes main panel (workflow, schema, settings), floating panels (props, Graph Traversal), quick bottom-surface tabs (stats, history), and shared Graph Data / editor workspace surfaces implemented in canonical `canvas/src/features/*` and `canvas/src/lib/*` modules.
- **State Management**:
  - `canvas/src/hooks/store/useGraphStore.ts` coordinates graph data, schema, workflows, UI settings, and panel layout via Zustand slices.
- **Parsers & Loaders**:
  - `canvas/src/parsers/` transforms CSV, JSON, JSON-LD, and markdown into normalized graph representation.

### Multi-dimensional Table / Graph Data Table (Host)

- The Editor/Table workspace hosts a **Multi-dimensional Table**: a local-first Graph Data Table backed by the minimal persisted `GraphRecordDb` cache (`kg:graph-table`) with logical `nodes`/`edges` tables over JSON `GraphData`, inferred property columns, per-table views, and sync metadata.
- The UI surface is a canvas fast-grid optimized for large datasets and selection-sync with Canvas and TOC.
- The surface must be observer-safe and scroll-stable: avoid ResizeObserver→state loops, avoid scroll/resize feedback loops, and ensure pinned header/columns are fully opaque (no bleed-through).
- Implementation notes and guardrails live in `docs/documents/agentic-graph-graph-data-table-fast-grid-document.md`.

### Integration Bridge: Product View ↔ Engineer View

| Product Mental Model            | Technical Implementation                 | Configuration Controls                                    |
|---------------------------------|------------------------------------------|-----------------------------------------------------------|
| Graph IDE "code editor"         | GraphCanvas component + selection state  | layoutMode, zoom, selection context                       |
| Debuggers & inspectors          | MainPanel tabs (workflow, schema, help)  | activeMainPanelTab, panel visibility toggles              |
| Consoles & tools                | Graph Data Table, Editor workspace, and quick bottom-surface tabs | panel surface state, workspace sync settings |
| Runnable pipelines              | Orchestrator workflows + GraphRAG config | workflow presets, orchestrator context                    |

### Graph Traversal Orchestrator (SSOT)

- Canonical surface: Floating Panel → Graph Traversal.
- Orchestrator UI hosts traversal presets, traversal sequence, and AgenticRAG context/ignore filters.
- Workflow editing is shared through the Editor workspace and Workflow Manager; avoid duplicated controls with divergent copy/tooltips.
- Tooltip semantics are standardized:
  - Key tooltips follow Role → Actions → Outcome (≤ 50 words).
  - Value tooltips follow Default/Min/Max/Interval (when applicable) + impact (≤ 15 words).

---

## Frontend Layer Specifications

### Layer 1: Graph Canvas & Visualization

**From user interaction to visual feedback**: User selects nodes → Canvas updates selection state → Store notifies subscribers → Props panel updates → Minimap highlights selection.

**Rendering Pattern**: React-based canvas with SVG/HTML rendering, using Zustand selectors to minimize re-renders on graph mutations.

**Storyboard Widget deferred draw**: When a workspace overlay opens (e.g., Editor Workspace), the Storyboard Widget canvas defers its next native draw until the overlay transition settles. This prevents a visible blank flash caused by a zero-dimension viewport during the overlay animation. The deferred draw reuses the same `fitAllTransform` SSOT and preserves centroid-centered layouts.

**Storyboard Widget viewport settle retry**: After workspace-open overlay transitions, the Flow canvas retries centroid-centered fit if the initial viewport settle produces an offscreen or degenerate transform. See `agentic-graph-storyboard-widget-pan-zoom-overlay-failsafe-document.md`.

**Configuration Schema (core sections)**:

```yaml
graph_visualization:
  scope: system_global
  type: object
  mutability: runtime_configurable
  validation: must contain nodes array, edges array, layoutMode enum
  impact: controls node positioning, edge routing, selection behavior

layout_modes:
  scope: deployment_configurable
  type: enum (semantic | document | schema_centric)
  mutability: runtime_configurable
  validation: one of allowed values
  impact: determines node clustering and positioning algorithm

selection_state:
  scope: module_local
  type: object
  mutability: runtime_configurable
  validation: selectedNodes, hoveredNode, focusedNode must reference existing IDs
  impact: drives props panel, highlights, and interaction feedback
```

**Interface Pattern**: `handleNodeClick(nodeId)` → validate node exists → update selection state → trigger panel updates → [complexity: O(1)]

**Design Compliance**:

| Context          | Intent                     | Directive                                                                                   | Module/Component | Class/Object | Function/Method | Dependency | Input                | Output              | Decision Logic                   |
|------------------|----------------------------|---------------------------------------------------------------------------------------------|------------------|--------------|-----------------|------------|----------------------|---------------------|----------------------------------|
| Node Selection   | Update focus context       | - [ ] Validate node ID; update store; forbid invalid selections                            | GraphCanvas      | —            | handleNodeClick | useGraphStore | nodeId (string)   | void                | ID validation + store update     |
| Layout Switching | Recompute positions        | - [ ] Apply layout algorithm; preserve selection; forbid layout thrashing                   | GraphCanvas      | —            | switchLayout    | layout library | layoutMode (enum) | node positions      | Force-directed or hierarchical   |
| Minimap Updates  | Reflect viewport           | - [ ] Compute visible bounds; render thumbnail; forbid stale minimap                        | Minimap          | —            | updateViewport  | canvas state | viewport bounds   | minimap SVG         | Scale viewport to minimap space  |

---

### Layer 2: Panel System

**From panel activation to content display**: User clicks toolbar button → Store updates activeMainPanelTab → MainPanel switch renders appropriate component → Component reads from store via selectors → UI updates.

**Panel Organization**: Main panel (workflow, schema, settings), bottom surface (quick stats/history), Floating panels (props, orchestrator, renderer), and shared workspace surfaces (markdown workspace, Graph Data Table, editor workspace) with independent state slices.

- Floating Panel (tool menu) hosts the Props/Inspector/etc views.
- Floating Panel default geometry is top-right canvas aligned through `floatingPanelGeometry.ts`; its default width is 20% wider (`0.3` viewport ratio / `21.6rem` minimum), and its right inset reuses the same canvas edge-gap token as the toolbar top inset. GitGraph command CRUD is hosted as the `gitGraph` FloatingPanel view instead of a duplicate canvas-local command panel.
- Floating Panel hosts a dedicated `media` view to the right of `View`, and that view reuses the same lightweight FloatingPanel contract instead of introducing a foreign command-palette shell. FloatingPanel `media` is the SSOT for current `@` image, audio, video, webpage, iframe, YouTube, and graph rich-media browsing; it owns a native grid/list selector where grid renders semantic media cards and list renders three-row media items instead of the legacy KTV three-column projection. MainPanel Help → Command Menu owns the full `/`, `@`, and `#` catalog reference. FloatingPanel `motionControl` sits between Animation and Camera and reuses `FloatingPanelCatalogHeader`, catalog body/surface classes, shared form controls, and Markdown sigil rendering; it owns explicit Start/Stop, local mirrored preview/pose overlay, backend preference, telemetry, and compact 3D for XR/Animation target projections. Its default-off **Bounding box** preference projects the existing single-person camera ROI plus catalog-authored outlines in both XR branches without camera object detection or identity inference. The 3D card joins canonical scene, shot-target selection, and physics snapshots; its object selector and **Fine-tune physics** action reuse the existing XR selection and Simulation-workbench owners. Both target cards still open canonical Media or Animation and render those owners' existing WebMCP plus `/ @ #` invocations rather than duplicating an asset catalog, preset catalog, target state, physics mutation path, tool, or schema. The headless runtime owns camera, LiteRT, scheduling, and cleanup; XR consumes one transient normalized pose that overrides only the selected compatible humanoid while authored preset/path state remains canonical and resumes afterward. Entering XR opens Motion Control only when the FloatingPanel was closed and preserves an already-open view. One observable Media catalog-mode owner lets the stable toolbar lifecycle guard retain capture only for Motion Control, Media's explicit 3D for XR submode, and Animation while XR and the FloatingPanel remain open; Stop, panel close, ordinary Media or another unrelated view, XR exit, page lifecycle loss, camera end, lifecycle-owner unmount, or runtime failure releases it without persisting live pose or pose history.
- Document versioning records bounded local snapshots from Editor Workspace saves, Source Files writeback, and GitGraph CRUD through `documentVersioning.ts`; Source Files rows expose version counts, Editor Workspace `[ ] diff` opens the shared Timeline bottom panel in GitGraph view after `[ ] Markdown`, and the bottom panel exposes GitGraph immediately to the right of the Timeline icon. MainPanel History does not own a document-version Docs surface.
- Interaction controls for infinite-canvas workflows live in a dedicated **Interaction** floating panel that is positioned adjacent to the Floating Panel when the Props view is active.
- Forbid any legacy “Arrange” panels (canvas overlays, editor tabs, or floating panels) that duplicate Interaction/Arrange actions.
- Shared panel activation events, default panel sizing, and panel-role ownership must live under `canvas/src/features/panels/*`; forbid a parallel `features/bottom-panel/*` helper namespace or duplicate bottom-surface ownership labels in shared config.
- Bottom-surface tabs stay thin surfaces over the shared panel contract: lightweight tabs render local quick-review content only, without duplicating workspace or renderer ownership.
- Shared inline command management belongs to one owner path. `/` slash actions, `@` variable or media actions, and `#` keyword actions must reuse the same command catalog, search, item rendering, and insertion contracts across MainPanel Help Command Menu, MainPanel Workflow Manager graph fields, canvas card inline editors, Markdown Viewer or WYSIWYG blocks, and Floating Panel media browsing. Floating Panel media thumbnails and Storyboard card/reference media previews use the shared hover/focus-appearing translucent overlay utilities for kind, info, open-link, and Download Media actions while visible uploaded-media rows expose editable media descriptions and `#` metadata fields instead of storage-status copy.
- FloatingPanel `strybldr` owns Storyboard presentation controls for Strybldr work: card aspect defaults to `16:9` with an explicit `9:16` portrait option, board layout defaults to `flex` with an explicit `fixed` lane-strip option, and `StoryboardCanvas` consumes only the persisted shared settings.
- Main Toolbar owns one native Zoom menu via `ZoomModeSelect`: zoom in/out, pin, fit to view, fit to screen, zoom to selection, and percentage presets live in that menu instead of duplicated toolbar buttons. `toolbarZoomMenuModel.ts` owns preset/readout math and reuses the shared active 2D zoom key plus viewport-center transform helpers.

#### Floating Panel Lightweight View Pattern (Props Panel Contract)

Floating Panel views must reuse the same lightweight embedding pattern as Props Panel:

- **Single scroll owner**:
  - Default: the Floating Panel body owns scrolling via `FLOATING_PANEL_SCROLL_CLASSNAME`.
  - Embedded views must be content-only (no `h-full`, no nested `overflow-*` scrollers).
  - If a view must own its own internal scroller (e.g. chat message list), the Floating Panel body must switch to `overflow-hidden` for that view to prevent double-scroll.
  - FloatingPanelChat footer status rows must keep transport connectivity and authenticated relay-policy state separate; relay loading/ready/blocked text must not overwrite the generic endpoint connectivity line.
  - When authenticated relay is active, FloatingPanelChat footer may render a second relay summary row for workspace/policy context (`workspaceId`, resolved role when known, requested auth mode, default model when present) without collapsing that detail into the primary relay status sentence.
  - Relay summary context may expose a lightweight action that reuses the existing History -> Log navigation path for diagnostics; do not fork a separate relay-debug panel for the same log surface.
- **No redundant shell styling**:
  - The Floating Panel shell owns background and base typography (`UI_THEME_TOKENS.panel.bg`, `UI_THEME_TOKENS.text.*`).
  - Embedded views must not re-apply panel background, “card” borders/rounded/shadow, or fixed widths unless the shell explicitly requires it.
- **Layout-only wrappers**:
  - Prefer `div` for layout-only containers inside Floating Panel views to avoid redundant nested `section` semantics.
  - Use semantic elements (`header/nav/section/aside`) only for surface boundaries that carry meaning (e.g. a panel header, a navigation bar).
- **Reusable embedding modes**:
  - Components reused across surfaces must expose an explicit “embedded” mode (example: Inspector supports a parent-scroll embedding mode so it can be mounted inside the Floating Panel without nested scroll/background).
- **Tokenized styling only**:
  - Forbid hardcoded Tailwind palette classes infloating panel bodies (e.g. `bg-gray-*`, `text-gray-*`); use `UI_THEME_TOKENS` so dark mode and density stay consistent.

#### Shared `/`, `@`, And `#` Command Menu Contract

- `/` opens text-structure and action commands from one shared catalog.
- `@` opens variable, reference, image, and video insertion commands from that same shared catalog and search runtime.
- `#` opens keyword commands from that same shared catalog and inserts stable hash tokens for canvas lanes, card fields, media keywords, and graph workflow tags.
- MainPanel Help → Command Menu is the browser over the same command definitions used inline; it must not maintain a second list, second persistence path, or second media-resolution heuristic.
- The Floating Panel `media` view is the current `@` image, audio, video, webpage, iframe, YouTube, and graph rich-media browser. It must reuse the shared media candidate resolver, expose native grid/list projections over the same candidates, render list items as three stacked rows rather than key/type/value columns, feed Preview Panel selection without duplicating the gallery there, and must not display the full `/` command catalog.
- `@` media rows must expose thumbnails or media previews when the shared media candidate resolver can derive them, including imported references and indexed image/video URLs.
- Floating Panel `@` media row names are editable inline and commit through the owning graph node label or markdown link/image-alt line.
- `@` image insertion persists as `![alt](url)`. `@` video insertion persists as `<video src="..." poster="..." title="..." controls></video>` so source URL, optional poster, and human-readable media title remain explicit in authored text.
- MainPanel Dashboard `Keywords` is a full-graph reusable inventory. Its `#` chips and the inline `#` command menu must continue to expose centralized graph tags, keywords, lane/status values, and typed node categories even when other stats sections are scoped to `Selection`.
- Accepting a command from any supported surface must commit through the owning text or graph-field write path so inserted media, placeholders, and references survive blur, rerender, parser reprojection, and Storyboard or Strybldr regeneration.

**Configuration Schema (core sections)**:

```yaml
panel_layout:
  scope: system_global
  type: object
  mutability: runtime_configurable
  validation: activeMainPanelTab, activeBottomSurfaceTab must be valid tab keys
  impact: controls which panel is visible and active

panel_visibility:
  scope: deployment_configurable
  type: object (boolean flags per panel)
  mutability: runtime_configurable
  validation: mainPanelOpen, bottomSurfaceOpen, floatingPanelOpen
  impact: controls panel collapse/expand state

ui_density:
  scope: system_global
  type: object
  mutability: runtime_configurable
  validation: uiIconScale, uiIconStrokeWidth must be valid numbers
  impact: controls icon sizing and visual density across all panels
```

**Interface Pattern**: `openPanel(panelKey, tabKey)` → validate tab key → update store → trigger panel render → [complexity: O(1)]

**Design Compliance**:

| Context          | Intent                     | Directive                                                                                   | Module/Component | Class/Object | Function/Method | Dependency | Input                | Output              | Decision Logic                   |
|------------------|----------------------------|---------------------------------------------------------------------------------------------|------------------|--------------|-----------------|------------|----------------------|---------------------|----------------------------------|
| Panel Switching  | Activate target panel      | - [ ] Validate tab key; update active tab; forbid invalid tab keys                         | MainPanel        | —            | switchTab       | useGraphStore | tabKey (string)   | void                | Tab key validation + store update|
| Density Control  | Adjust UI scale            | - [ ] Update icon scale; apply to all icons; forbid inconsistent sizing                    | UISettings       | —            | setIconScale    | useGraphStore | scale (number)    | void                | Store update + Tailwind class map|
| Panel Persistence| Save preferences           | - [ ] Write to localStorage; restore on load; forbid lost preferences                       | UISettings       | —            | savePreferences | localStorage | preferences (obj) | void                | Serialize to LS_KEYS             |

---

### Layer 3: State Management (useGraphStore)

**From action dispatch to component update**: Component calls store action → Action mutates state slice → Zustand notifies subscribers → Shallow selectors detect changes → Components re-render with new data.

**Store Architecture**: Single Zustand store with domain-specific slices (graph, schema, workflow, UI settings, panel layout) and shallow selector patterns.

**Configuration Schema (core sections)**:

```yaml
graph_data_slice:
  scope: system_global
  type: object
  mutability: runtime_configurable
  validation: nodes/edges must conform to schema
  impact: holds all graph nodes, edges, and derived layers

schema_slice:
  scope: deployment_configurable
  type: object
  mutability: runtime_configurable
  validation: nodeTypes, edgeLabels, properties must be valid definitions
  impact: defines type system and validation rules

workflow_slice:
  scope: deployment_configurable
  type: object
  mutability: runtime_configurable
  validation: graphRagConfig, presets must be serializable
  impact: stores workflow configurations and orchestrator state

ui_settings_slice:
  scope: module_local
  type: object
  mutability: runtime_configurable
  validation: theme, icon settings, panel layout must be valid
  impact: controls visual presentation and localStorage persistence
```

**Interface Pattern**: `updateGraph(mutations)` → validate schema → apply mutations → notify subscribers → [complexity: O(n) for n mutations]

**Design Compliance**:

| Context          | Intent                     | Directive                                                                                   | Module/Component | Class/Object | Function/Method | Dependency | Input                | Output              | Decision Logic                   |
|------------------|----------------------------|---------------------------------------------------------------------------------------------|------------------|--------------|-----------------|------------|----------------------|---------------------|----------------------------------|
| Graph Mutations  | Update nodes/edges         | - [ ] Validate against schema; apply atomically; forbid partial updates                    | graphDataSlice   | —            | updateGraph     | schema validator | mutations (array) | updated graph       | Schema validation + atomic apply |
| Schema Updates   | Modify type definitions    | - [ ] Validate schema structure; migrate data; forbid breaking changes                     | schemaSlice      | —            | updateSchema    | migration tools | schema (object)   | updated schema      | Validation + migration check     |
| Selector Usage   | Read state efficiently     | - [ ] Use shallow selectors; minimize re-renders; forbid broad subscriptions               | useGraphStore    | —            | useShallow      | Zustand    | selector (fn)        | selected state      | Shallow equality check           |

---

### Layer 3.5: UI Notifications (Toast)

**From state changes to user feedback**: Feature pushes/upserts toast → store updates `uiToasts[]` → ToastHost renders stack → prune loop auto-dismisses expired items.

**Implementation**:
- Store slice: `canvas/src/hooks/store/uiToastSlice.ts`
- Host renderer: [ToastHost.tsx](../../canvas/src/components/ui/ToastHost.tsx)

**Contracts**:
- **Stack order**: Store order is visual order; index 0 is the newest at the default Y, older toasts push downward (no overlap).
- **Actions**:
  - `pushUiToast(...)`: event-style notifications (use unique ids for distinct events).
  - `upsertUiToast(...)`: status-style notifications (stable id); moves to front; preserves original createdAt-based expiry.
  - `dismissUiToast(id)`: explicit removal (required for persistent loading toasts where `ttlMs=null`).
- **TTL**: Default TTL is 10s when `ttlMs` is omitted; repeated upserts must not extend expiry unless explicitly desired.

**Design Compliance**:

| Context           | Intent                          | Directive                                                                                  | Module/Component | Function/Method | Input                         | Output                    | Decision Logic |
|------------------|----------------------------------|--------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------------|---------------------------|----------------|
| Toast stacking    | Keep messages legible            | - [ ] Newest stays at default Y; older push downward; forbid overlap                       | ToastHost        | render          | uiToasts[]                     | Stacked toasts            | Render by store order |
| Toast transitions | Preserve status causality        | - [ ] For loading → loaded/error, emit event toast and dismiss loading shortly after       | Feature module   | push/upsert     | status state + messages        | Loading + event toasts    | Stable loading id + unique event ids |
| Auto-dismiss      | Reduce noise safely              | - [ ] Prune expired items on an interval; forbid sticky toasts from unbounded refresh loops | uiToastSlice     | pruneUiToasts   | nowMs                          | Remaining uiToasts[]      | Keep expiresAtMs null or > now |

---

### Layer 4: Parsers & Data Ingestion

**From source files to graph data**: User uploads file → Parser detects format → Normalize to internal representation → Validate against schema → Update store → Trigger canvas/panel updates.

**Parser Types**: CSV parser (tabular data), JSON/JSON-LD parser (graph interchange), Markdown parser (document-centric graphs with provenance).

**Configuration Schema (core sections)**:

```yaml
parser_config:
  scope: deployment_configurable
  type: object
  mutability: deployment_configurable
  validation: must specify format, normalization rules, schema mapping
  impact: controls how source data maps to graph nodes/edges

markdown_pipeline:
  scope: deployment_configurable
  type: object
  mutability: runtime_configurable
  validation: rendering mode, sync scroll settings, provenance tracking
  impact: controls markdown→graph transformation and bidirectional sync

validation_rules:
  scope: system_global
  type: object
  mutability: deployment_configurable
  validation: duplicate detection, dangling reference checks, required fields
  impact: ensures graph integrity during ingestion
```

**Interface Pattern**: `parseFile(file, format)` → detect format → normalize → validate → update store → [complexity: O(n) for n elements]

**Design Compliance**:

| Context          | Intent                     | Directive                                                                                   | Module/Component | Class/Object | Function/Method | Dependency | Input                | Output              | Decision Logic                   |
|------------------|----------------------------|---------------------------------------------------------------------------------------------|------------------|--------------|-----------------|------------|----------------------|---------------------|----------------------------------|
| Format Detection | Identify source format     | - [ ] Inspect file headers; match patterns; forbid ambiguous detection                     | ParserUtils      | —            | detectFormat    | file API   | file (File)          | format (enum)       | Header pattern matching          |
| Normalization    | Convert to internal model  | - [ ] Map fields to schema; apply defaults; forbid data loss                               | CSVParser        | —            | normalize       | schema     | rows (array)         | nodes/edges         | Field mapping + type coercion    |
| Provenance Track | Link markdown to graph     | - [ ] Record source positions; enable bidirectional sync; forbid orphaned nodes            | MarkdownParser   | —            | trackProvenance | provenance utils | AST + positions | graph + metadata    | Position mapping + ID generation |

---

### Layer 5: Theme System & Visual Consistency

**From theme selection to UI rendering**: User selects theme → Store updates theme mode → Root element updates data-theme attribute → Tailwind applies dark: modifiers → All components re-render with new tokens.

**Theme Architecture**: Centralized theme tokens (`UI_THEME_TOKENS`) provide semantic color/spacing values, consumed by all components to ensure consistency across light/dark modes.

**Configuration Schema (core sections)**:

```yaml
theme_mode:
  scope: system_global
  type: enum (light | dark | system)
  mutability: runtime_configurable
  validation: one of three allowed values
  impact: controls global color palette and component styling

ui_theme_tokens:
  scope: system_global
  type: object
  mutability: deployment_configurable
  validation: must include panel, table, tooltip, status token sets
  impact: provides semantic color/spacing values for all components

icon_configuration:
  scope: system_global
  type: object
  mutability: runtime_configurable
  validation: uiIconScale (number), uiIconStrokeWidth (number)
  impact: controls icon sizing and stroke weight across application

semantic_html:
  scope: deployment_configurable
  type: boolean
  mutability: immutable
  validation: enforced at component level
  impact: ensures accessibility and proper document structure
```

**Interface Pattern**: `setTheme(mode)` → update store → update DOM attributes → trigger re-render → [complexity: O(1)]

**Design Compliance**:

| Context          | Intent                     | Directive                                                                                   | Module/Component | Class/Object | Function/Method | Dependency | Input                | Output              | Decision Logic                   |
|------------------|----------------------------|---------------------------------------------------------------------------------------------|------------------|--------------|-----------------|------------|----------------------|---------------------|----------------------------------|
| Theme Switching  | Update color palette       | - [ ] Set data-theme attribute; toggle dark class; forbid hardcoded colors                | UISettings       | —            | setTheme        | DOM API    | mode (enum)          | void                | Attribute update + class toggle  |
| Token Resolution | Map semantic to concrete   | - [ ] Read UI_THEME_TOKENS; apply to components; forbid direct color values              | ThemeProvider    | —            | resolveToken    | theme config | token key (string) | CSS class/hex       | Token lookup + mode check        |
| Icon Sizing      | Apply consistent scale     | - [ ] Call getIconSizeClass; apply uiIconStrokeWidth; forbid hardcoded sizes             | IconButton       | —            | render          | UISettings | icon component       | styled icon         | Scale/stroke from store          |

---

## Component Responsibility Matrix

| Layer/Subsystem | Path/Module                                  | Component           | Interface/Method        | Responsibility (S-V-O)                                                              | Dependencies                    | Contracts                             | LOC    |
|-----------------|----------------------------------------------|---------------------|-------------------------|-------------------------------------------------------------------------------------|---------------------------------|---------------------------------------|--------|
| Visualization   | `canvas/src/components/GraphCanvas.tsx`      | GraphCanvas         | `render`                | Canvas renders nodes → positions elements → handles interactions → updates selection | `useGraphStore`, React          | Reads graph data, writes selection    | ~800   |
| Panels          | `canvas/src/features/panels/MainPanel.tsx`   | MainPanel           | `renderActiveTab`       | Panel reads active tab → renders component → subscribes to store → displays content  | `useGraphStore`, panel views    | Renders based on activeMainPanelTab   | ~400   |
| Workflow UI     | `canvas/src/features/panels/views/WorkflowSteps.tsx` | WorkflowSteps | `WorkflowSteps` | Workflow renders 8-step pipeline → uses tooltips for step guidance → keeps layout aligned | `CollapsibleSection`, `Tooltip`, `WORKFLOW_STEP_COPY` | Step headers use Role→Actions→Outcome tooltips; avoid verbose inline descriptions | ~300 |
| State           | `canvas/src/hooks/store/useGraphStore.ts`    | useGraphStore       | `updateGraph`           | Store validates mutations → applies changes → notifies subscribers → triggers renders | Zustand, schema validator       | Maintains graph invariants            | ~2000  |
| Parsers         | `canvas/src/parsers/csvParser.ts`            | CSVParser           | `parse`                 | Parser reads CSV → normalizes rows → validates schema → returns graph data           | PapaParse, schema definitions   | Conforms to internal graph format     | ~300   |
| UI Settings     | `canvas/src/hooks/store/uiSettingsSlice.ts`  | UISettings          | `setIconScale`          | Slice updates scale → writes to localStorage → notifies components → reapplies styles | localStorage, LS_KEYS           | Persists UI density preferences       | ~200   |
| Orchestrator    | `canvas/src/features/orchestrator/`          | Orchestrator        | `executeWorkflow`       | Orchestrator reads config → executes steps → tracks context → surfaces results        | workflow config, GraphRAG       | Serializable workflow state           | ~600   |
| Theme           | `canvas/src/hooks/store/uiSettingsSlice.ts`  | ThemeManager        | `setTheme`              | Manager updates mode → applies DOM attributes → triggers re-renders → persists choice | localStorage, UI_THEME_TOKENS   | Consistent color palette application  | ~150   |
| Markdown        | `singabldr/src/features/markdown/`            | MarkdownSection     | `renderViewer`          | Section lexes tokens → shares with views → syncs scroll → handles selection          | markdown-it, Monaco, useGraphStore | Bidirectional canvas ↔ markdown sync  | ~500   |
| Media Panels    | `canvas/src/components/MediaNode.tsx`        | MediaNode           | `renderPanel`           | Node renders media → scales to density → handles zoom → displays in panel-only mode  | schema, UI_THEME_TOKENS         | 16:9 aspect ratio, minimap sizing     | ~400   |

---

## Theme System & Visual Design Standards

### Theme and Color Palette

**Supported Modes**: Light, Dark, System (OS preference detection)

**Color Palette**: GitHub Tritanopia palette for optimal contrast and accessibility

**Mode-Specific Styling**:
- **Light Mode**: `text-gray-600`, `bg-gray-100` hover states, `bg-white` panels
- **Dark Mode**: `text-gray-300`, `bg-gray-800` hover states, `bg-[#0d1117]` panels

**Theme Token Architecture**:

```yaml
UI_THEME_TOKENS:
  panel:
    bg: theme-adaptive background
    divider: consistent border color
    text: primary text color
  table:
    rowBg: base row background (flat, no zebra striping)
    rowHoverAmber: hover state with amber tint
    rowSelected: selected row highlight (subtle tint)
    header: sticky header styling
    border: cell and column dividers
  tooltip:
    bg: high-contrast overlay (dark in both modes)
    text: tooltip text color
  status:
    success: green feedback
    warning: amber/yellow feedback
    error: red feedback
    neutral: gray feedback
  code:
    bg: code block background
    text: code text color
    headerBg: code header background
    border: code block border
```

**Implementation Standards**:

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Token Usage          | Enforce consistency             | - [ ] Use UI_THEME_TOKENS for all styling; forbid hardcoded Tailwind classes like text-gray-* or bg-blue-* |
| Theme Switching      | Maintain visual coherence       | - [ ] Update data-theme attribute and dark class; trigger re-render; forbid partial updates |
| Canvas Colors        | Match theme in WebGL/SVG        | - [ ] Use UI_THEME_COLORS (raw hex) for D3/WebGL contexts; forbid mismatched palettes     |
| Icon Consistency     | Apply uniform sizing            | - [ ] Use uiIconScale and uiIconStrokeWidth; forbid per-component sizing                   |

### MainPanel Workflow Layout Consistency

**Scope**: MainPanel → Workflow → Workspace Actions (Source Files / Parser / Validation)

- Enforce left/right edge alignment: avoid nested padding wrappers that drift from section headers.
- Enforce consistent control heights: prefer `h-7` for row controls and `h-6` for status pills.
- Reduce inline verbosity: keep guidance in Role → Actions → Outcome tooltips rather than long inline paragraphs.
- Source Files Import uses a table layout (th/td) with Domain/Homepage/Status/Action columns and one URL per row.
- Source Files management uses a fixed-width table: Move/Show/Label/Local-URL/Status/Action = 2%/2%/33%/50%/12%/2%.

### Code Block Styling

**Structure**: Semantic `figure` > `header` > `pre`/`code` hierarchy

**Header Components**:
- Language label
- Beside/Inline view toggle buttons (`name="annotate-display"`, `value="beside" | "inline"`, `aria-current="true"` on active)
- Copy button (writes to clipboard)

**Syntax Highlighting**:
- Light Mode: GitHub Light theme
- Dark Mode: GitHub Dark theme

**Layout Mode**: Stored in component state, reflected via `data-annotate-display` attribute to reuse lexed tokens without re-rendering

### Semantic HTML Standards

**Enforcement**: All components must use semantic HTML elements over generic `div` containers

| Component            | Semantic Elements                                                                                   |
|----------------------|-----------------------------------------------------------------------------------------------------|
| Toolbar              | `<nav role="navigation">`                                                                          |
| Bottom Surface       | `<section>` (container), `<header>` (tab bar, supports double-click fullscreen), `<article>` (content) |
| Main Panel           | `<section>` (container), `<header>` (tab bar), `<article>` (content)                               |
| Status Bar           | `<footer>`                                                                                         |
| Markdown Viewer      | `<article>` (content), `<nav>` (TOC), `<figure>` (code blocks, Mermaid diagrams)                  |
| Markdown Editor      | `<article>` (editor pane)                                                                          |
| Presentation         | `<section>` (slides container), `<article>` (slide content), `<aside>` (sidebar), `<footer>` (controls) |
| Gallery renderer       | `<section>` (container), `<header>` (slide label/index)                                            |
| Graph Data Table     | `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` wrapped in `<section>`                   |
| Settings View        | `<table>` for technical details (replacing grid of divs)                                           |

### Typography Scale

**Panel Micro Labels**: `uiPanelMicroLabelTextSizeClass` (default 10px)
- Used in: Floating Panels, Table of Contents, Settings headers
- Distinct from standard `uiPanelKeyValueTextSizeClass` for data rows

**Presentation Mode**: Base font size increased to `text-2xl` (~24px) for large screen readability

**Markdown Typography Ladder**: Must be monotonic in both Viewer and Presentation: body < h6 < h5 < h4 < h3 < h2 < h1 (Presentation scales the ladder up without inverting ordering).

### Visual Consistency Standards

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Table Styling        | Unified selection/hover         | - [ ] Use rowHoverAmber for hover; rowSelected for active; forbid legacy blue borders     |
| Gallery renderer       | Match table interactions        | - [ ] Use same hover/selection styles; 16:9 aspect ratio thumbnails; forbid inconsistent styles |
| Settings Panels      | Match table key/value rows      | - [ ] Use rowHoverAmber and rowSelected for interaction; forbid custom hover colors       |
| Graph Data Table     | Clean flat design               | - [ ] Use rowBg (no zebra striping); rowSelected for highlight; forbid outdated styling   |

---

## Media Node Panel Specifications

### Panel Rendering Modes

**Panel-Only Mode**: Hides base circle/rect glyphs, renders standalone media panels

**Header Format**: `Label (Type)` inline display in panel header strip

### Density Modes

**Compact Panels**:
- Height: `MINIMAP_HEIGHT` (fixed constant)
- Width: `round(MINIMAP_HEIGHT * 16 / 9)` (derived for 16:9 aspect ratio)
- Base: Minimap size as reference

**Standard Panels**:
- Tuned for maximum zoom visibility
- At `ZOOM_MAX`: panel appears ~1.5× minimap width and ~1.5× minimap height on screen
- Scaled proportionally at lower zoom levels

### Sizing Constants

**Definition Location**: `canvas/src/features/minimap/math.ts`

```typescript
MINIMAP_WIDTH: number
MINIMAP_HEIGHT: number
ZOOM_MAX: number
```

### Media URL Handling

**Normalization**: `getNodeMediaSpec` in `canvas/src/components/GraphCanvas/helpers.ts`
**Proxy Routing**: `applyMediaProxySrc` routes cross-origin HTTP(S) media through `/__fetch_remote`

**Preferred Formats**: Image (`svg > webp > png > jpeg`), Video (`mp4 > webm`) via the shared media format preference owner.

### Canvas Coordinate System

**2D Canvas**: Panel geometry expressed in graph units, scaled by zoom transform

**Zoom Behavior**: Standard panels visually match "1.5× minimap" sizing at ZOOM_MAX, scale down proportionally at lower zoom

### Content Padding

**Requirements**:
- Image/video content must not touch panel border
- Uniform margin between media frame and outer panel edges

### Media Panel Design Compliance

| Context              | Intent                          | Directive                                                                                   | Module/Component | Function/Method | Input                | Output              | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|----------------------|---------------------|----------------------------------|
| Panel Sizing         | Maintain aspect ratio           | - [ ] Calculate from MINIMAP dimensions; apply 16:9 ratio; forbid hardcoded sizes         | MediaNode        | calculateSize   | density mode         | width/height        | MINIMAP constants × density scale|
| Media URL Resolution | Handle cross-origin             | - [ ] Normalize via getNodeMediaSpec; apply proxy; forbid direct cross-origin loads       | MediaNode        | resolveMediaUrl | node media URL       | proxied URL         | Protocol check + proxy routing   |
| Zoom Scaling         | Maintain visibility             | - [ ] Scale panel with zoom; cap at density target; forbid clipping at max zoom           | GraphCanvas      | renderMediaPanel| zoom level + geometry| scaled panel        | Zoom transform × panel dimensions|

## Continuation: See `agentic-graph-frontend-document-interactions-and-operations.md`.
