# agentic-graph 2D Renderer Enhancement (Design)

## Scope

- This document defines the 2D renderer enhancement goals and constraints for in-repo, native implementation.
- It applies to 2D render variants (D3 Graph, Flowchart, GitGraph, Flow, Design, Storyboard) and their shared behaviors across touchpoints; 3D and Voxel modes reuse the same SSOT GraphData/layout and canvas.jsonld contracts and are documented in the renderer and AgenticRAG Canvas directives.

## Hard Constraints

- Native in-repo implementation only.
- Forbid hardcoded or runtime dependencies on upstream design-tool repositories.
- Reuse existing SSOT for tokens, typography, icons, labels, and tooltips.
- Maintain unidirectional data flow: Store → Derivation → Render; forbid renderer mutating canonical store graph objects.
- Forbid cross-mode drift: switching touchpoints/modes/layouts/zooms must not change semantics.

### Repo Policy

- Enforced by the repo policy test `forbidPenpotRepoLiteral`.
- Do not include upstream repo identifiers in source, dependencies, tests,
  assets, generated output, or runtime requests. A separately approved
  attribution-only decision ledger may contain its canonical citation without
  granting implementation lineage.

## Renderer Variants (2D)

### D3 Graph (SVG)

- Best for simulation-driven force layouts, immediate interaction, and inspectable DOM.
- Main risk: DOM churn (labels, edge paths) and tick-bound geometry work.

### Flow (Canvas2D)

- Best for high-density graphs and consistent frame budget.
- Main risk: inconsistent semantics vs D3 (fit/zoom, selection, group envelopes) if derivations diverge.

### GitGraph (Mermaid SVG)

- Best for Git history, branch, commit, checkout, and merge diagrams authored in YAML frontmatter `mermaid: |`.
- Main risk: parser drift if GitGraph commands are expanded by the Flowchart topology parser. GitGraph must remain diagram-code rendering unless a future source-owned semantic parser is added.

### Storyboard Widget (Canvas2D + Semantic Overlays)

- Best for editing workflows and storyboard widgets.
- Main risk: overlay re-render churn and viewport transform drift.

### Design (2D Webpage Wireframe)

- Best for DOM-derived webpage wireframes rendered as 2D frames over a neutral layout snapshot graph.
- Uses a browser-native layout export (`webpageLayout` snapshot) and deterministic DOM→graph conversion with domain-agnostic wrapper pruning, layout-glue cleanup, and synthetic section nodes. Export is implemented via a sandboxed hidden iframe (`kg-export-dom` layout mode) with URL-agnostic timing (networkIdle + domQuiet) and bounded snapshot capture.
- Frame layout is snapshot-driven: when a `webpageLayout` graph is available, Design uses DOM-derived coordinates and dimensions as the SSOT; when no snapshot is ready yet, Design shows a single placeholder frame (loading/error/idle) instead of a legacy non-webpage frame grid.
- Shares collective fit/center, zoom view keys, snap-to-grid, lasso, and align/distribute semantics with D3 and Flow, plus renderer-neutral shortcuts for align/distribute and keyboard nudging.
- Wireframe presentation is driven by schema metadata (`renderer:designWireframe`) and rendered via a Floating Panel "Design wireframe" section: controls include label/meta chips, text/media previews, depth fade, optional edges, and label-collision avoidance. These knobs are schema-only; the UI is a thin shell and remains host/URL-agnostic.
- Agent-native video export is owned by `canvas/src/features/design/designAgentVideoSpec.ts` and the existing HTML-video renderer. Design derives semantic HTML, CSS, seekable timing attributes, virtual workspace files, composition rows, source-derived assets, timeline lanes, and data from the active graph, selected layer ids, and shared design-token summaries, then routes the generated renderer flow node through `runHtmlVideoFlowNode` with `createHtmlVideoEngineRegistryFromRuntimeConfig()`. Actual MP4 generation still requires a registered runtime adapter such as the browser-native `canvas-2d` adapter; there is no hardcoded fallback engine or upstream design-tool runtime dependency.

### Media (2D Rich Media + Video Sequence)

- Best for source-backed rich media inspection and video-sequence preview without forking Timeline ownership.
- Media canvas reuses the shared rich-media inventory and `RichMediaPanel`; video-sequence sources come from `kgVideoSequenceSources`, resolve through the runtime source registry, and must not persist stale blob URLs.
- Media preview playback and Timeline playback state share the same document transport/controller path; media-preview surfaces must not fork transport state or read store internals directly.
- BottomPanel `Timeline` owns video-sequence transport, playhead, cut/splice controls, selected-clip nudge/trim/snap/split editing, luma waveform, chroma vectorscope, histogram, audio waveform/mix monitors, lane slots, and source-backed Mermaid Gantt writeback. Clip edits operate on the grouped source lanes so video, mask, grade, and audio timing remains aligned. Timeline pinch zoom owns bounded multi-step zoom, rounded scale-domain ruler ticks, bar/lane scale parity, and right-side append workspace without changing source-backed scrub or trim math.
- Launch -> Import local files/folder and Import URL materialize video assets as one source-backed `kgVideoSequenceTimeline` document with stacked video tracks, matching audio rows, and `kgsrc_*` source-range tokens. Generated imports must not prefill Mask/Grade operation lanes; those lanes are authored only through Timeline tools.
- FloatingPanel `Timeline` remains the parsed row/list editor for Timeline or Gantt-Timeline frontmatter. For video-sequence Gantt frontmatter it may expose row-list display controls for collapsing task rows and toggling Video/Mask/Grade/Audio section visibility; Video and Audio are visible by default, while Mask and Grade start disabled to keep the row list focused. These row-list display toggles belong only to FloatingPanel `Timeline`; BottomPanel `Timeline` must not expose Mask/Grade visibility configuration or mount a second row-list owner.
- Media canvas, BottomPanel `Timeline`, FloatingPanel `Timeline`, and FloatingPanel `Media` share `timelineAnimationEngine.ts` for native animation data attributes, CSS custom properties, object frame values, SVG frame values, keyframe samples, easing curves, work-area markers, frame-by-frame frame state, vector morph samples, and text-range animation tokens. MotionKit is reference evidence only: the implementation is dependency-free and exposes CSS property, SVG attribute, DOM attribute, JavaScript object, HTML, Canvas 2D, and WebGL/Three.js target semantics through in-repo runtime state.
- Timeline preview sync and activity emphasis stay upstream too: selected-row preview alignment, playhead-active family emphasis, ruler activity markers, and native animation timing must flow through one shared preview-sync plan plus shared source-activity models so Media Canvas, BottomPanel `Timeline`, and FloatingPanel `Timeline` do not fork animation or active-source heuristics.
- BottomPanel `Timeline` keeps MotionKit-style timeline affordances as native lanes and tools: `keyframe` for sampled keyframes/easing, `morph` for vector-path interpolation cues, and `text` for per-range text animation cues. Vector morphing uses the shared native interpolator to emit compatible SVG paths across vector, rectangle, ellipse, polygon, and star families, with boolean-operation intent tokens (`union`, `subtract`, `intersect`, `exclude`) carried on the clip surface. Text animation uses the shared native text keyframe model for per-character, per-segment, and full-node scopes, exposing range keyframes for font size, color, letter spacing, and line height without a separate text editor model. These lanes must remain source-backed Mermaid Gantt rows and must not introduce a second animation-document model.
- Blender is reference evidence for timeline animation semantics, not a copied runtime. The shared native state exposes draggable/trim/extend/batch-move clip settings, frame/playhead/clip-boundary/work-area snapping tokens, animatable properties (`position`, `scale`, `rotation`, `opacity`, `blur`, `shadow`, `corner-radius`, `stroke`, `fill`), modifier tokens (`stroke-trim`, `follow-path`), loop modes (`once`, `loop`, `ping-pong`), and recording-mode metadata that treats playhead movement as automatic keyframe intent.
- Frame-by-frame animation is a native Media/Timeline layer mode, not a separate editor. The shared animation state exposes cel/onion-skin/scrub metadata, independent frame-rate and per-frame timing tokens, and layer-panel affordances for drag sorting, unified context menus, `F2` inline rename, smart grouping, and detached continuous layers for persistent backgrounds, UI chrome, or other non-animated elements.
- Nested animation is a native composition mode across Media canvas, BottomPanel `Timeline`, FloatingPanel `Timeline`, and FloatingPanel `Media`. The shared state exposes `timeline-in-fbf` and `fbf-in-timeline` modes with independent timeline and frame-by-frame FPS tokens, deterministic render-pass order (`detached-continuous -> fbf-frame -> child-timeline -> parent-timeline`), and per-clip nested-composite strips so child timelines and cel clips are rendered through one source-backed compositing contract.
- Cut/splice playback sync maps transport minutes to source media seconds through the compiled sequence plan, including gaps, repeated source segments, masks, grades, transitions, filters, adjustment layers, keyframes, effects, speed rows, images, scenes, and audio lanes.
- Local absolute-path video imports may resolve as `/@fs...` runtime URLs; successful metadata probes must complete without abort-noise cleanup, and repeated imports of the same source should preserve a stable visible media element instead of remounting identical playback surfaces.
- Edited-media export is a derived browser-media surface, not a fourth authoring owner: it reuses the compiled sequence plan plus shared source/metadata helpers, renders through neutral browser media APIs (`captureStream`, `MediaRecorder`, `createMediaElementSource`), and downloads through the shared delayed-revoke blob helper. Successful source probes must stay bound on the success path here too, so export does not reintroduce `@fs` abort churn that preview/import already eliminated. Export teardown is finalized through one shared shutdown path that still stops tracks, disconnects Web Audio, closes `AudioContext`, and clears the video element even if recorder stop/error rejects. Long-running exports also report shared preparing/rendering/finalizing progress labels and honor shared abort/cancel semantics, so BottomPanel controls do not invent panel-local progress state or cancellation behavior. That progress contract is structured upstream: helpers expose `kind`, `phase`, `percentage`, `completedSegments`, and `totalSegments`, while visible labels remain derived presentation rather than the transport format itself. Export-plan validity is shared too: empty plans or plans without any positive-duration source range must fail before recorder/runtime work starts, and BottomPanel export enablement must reuse the same upstream validator. Export error taxonomy is shared as well: abort, capability, plan, source, and runtime failures must resolve through shared export error codes/messages and feedback mapping so surfaces reuse one canonical message contract instead of trimming or inventing local fallback copy. Export outcomes are shared too: successful downloads, cancellations, and failures should surface one structured upstream outcome with canonical message, toast kind, filename, and error-code data so post-export feedback stays renderer-agnostic. Export telemetry is shared too: progress and terminal outcome should emit through one structured event envelope so future surfaces, logs, and history subscribe once instead of forking progress callbacks from outcome callbacks. Export run snapshots are shared too: each run should reduce those events into one bounded session record keyed by run id plus filename-base/kind metadata, preserving timing, progress, and terminal outcome for future history/retry/audit surfaces. Export replay is shared too: retries must resolve through one upstream stale-plan-safe request helper that only replays when the current compiled plan matches the previous run snapshot and no other export is active. Retry surfacing is shared too: BottomPanel should render one latest-session retry control from the shared retry-control helper, using generic disabled copy when no retryable run exists and session-kind-specific copy only when replay is truly available. Recent export rendering is shared too: BottomPanel should render bounded run history through one upstream session-surface model that owns detail labels, empty-state copy, and per-run retry affordances instead of formatting history rows locally. Recent export styling is shared too: run rows should expose upstream tone/style semantics for running, downloaded, cancelled, and failed states so future surfaces reuse one status-to-style contract instead of local class mapping. Recent export selection is shared too: surfaces should choose visible runs through one upstream ordering/filter helper that can prioritize the latest retryable run, keep active runs visible, filter statuses, and then fall back to recency.

## Parity SSOT (Must Match Across Variants)

### 1) Display Graph Derivation

- All variants must derive render inputs from the same display-graph derivation and filtering rules.
- Derivation should output:
  - Display nodes/edges arrays
  - Id lookup maps/sets
  - Group/cluster envelopes (when enabled)

### 2) Fit/Center/Zoom Contract

- Fit must operate on the collective visible graph (post filter/collapse), not per-node centering.
- Initialization must be idempotent:
  - If a valid stored transform is applied, do not also auto-fit in the same init pass.
  - Bounds guard: do not apply stale transforms until graph bounds are computable.
- Initialization group envelopes must derive from the same display-graph AABBs across D3, Flowchart, Flow, Design, and Storyboard Widget; Storyboard Widget extends these envelopes with zoom-aware pinned widget overlay extents so panels remain contained inside cluster/subgraph/layer borders on first paint.

### 3) Layer Stack Ordering

- Centralize 2D z-order ranks so groups/edges/nodes/labels/handles stack consistently.

### 4) Selection Semantics

- Selection applies the same rules in all variants:
  - Node/edge selection, multi-select, hover, and selection zoom behavior.
  - Selection updates must avoid restarting layouts/simulations.
- Multi-select and marquee semantics are SSOT across D3, Flow, and Design:
  - Click semantics: replace vs toggle selection is driven by the same modifier set (Shift/Cmd/Ctrl) and shared selection store.
  - Marquee/lasso semantics: `selectMode=lasso` uses shared add/remove/replace semantics (`Shift/Cmd/Ctrl` to add, `Alt` to remove, default to replace); lasso selection writes via the same expanded node-selection helper.
- Align/distribute and keyboard nudging share renderer-neutral shortcuts:
  - `Alt+Shift+L/H/R/T/V/B/X/Y` align or distribute selected nodes/frames; operations respect snap-grid settings and update layout caches via shared helpers.
  - Arrow-key nudging uses a shared helper for deltas; when snap-grid is enabled, nudges move by grid-sized steps (with Shift-based multipliers) and `Alt` bypasses snapping. Design frame nudges apply batched position patches; Graph/Flow nudges freeze layouts and persist positions via layout-position caches without re-seeding.

## Performance Strategy

### Budgets

- Frame budget: avoid tick-time work that scales worse than O(N + E) per frame.
- Avoid synchronous heavy work during render/interaction (typing, zoom, pan, selection).

### Hot-Path Rules

- Prefer memoized derivations keyed by topology (revision/hash) and minimal renderer config.
- Gate expensive work by mode and by alpha/idle state.
- Prefer rAF coalescing for DOM updates (selection styling, overlays).

### Rendering Optimizations (Incremental)

- D3 Graph:
  - Reduce per-tick edge endpoint computations and avoid per-edge DOM writes when alpha is low.
  - LOD for labels: hide below scale threshold using schema knobs.
  - Batch style updates for selection/hover.
- Flow/Storyboard Widget:
  - Cache token reads and text metrics per theme key.
  - Cache glyphs/text layouts where safe.
  - Avoid per-event full redraw if only overlays changed.

## Shared Utilities (Centralize)

- Viewport math: bounds computation, fit transform, zoom quantization.
- Scheduling: debounce/throttle/rAF coalescing.
- Worker RPC: request/response protocol, abort/timeout semantics.
- Perf instrumentation: stage-based measurements and event dispatch (opt-in).

## Cross-Touchpoint Expectations

- Switching between Editor workspace, Graph Data Table, Graph Fields, Props Panel, Markdown surfaces, Explorer, and Canvas Preview:
  - Must not reset layout unexpectedly.
  - Must preserve pinned/fit/selection zoom semantics.
  - Must not cause hidden renderers to consume shared requests.

## Acceptance Criteria (Bounded)

- No upstream design-tool repository URL literals exist outside an approved
  attribution-only decision ledger.
- 2D render variants share the same display-graph derivation and fit/zoom initialization contract.
- Switching 2D variants preserves mental map: no chaotic clustering or excessive void-space regressions.
- Design video export builds from source graph/tokens and reuses the HTML-video renderer runtime registry; focused `design.editor.agentVideo.*` tests guard semantic HTML, deterministic motion CSS, seekable timeline data attributes, MP4 preview state, and no copied design-engine/fallback path.
- Bounded validation: focused renderer/parser tests and `npm run typecheck` pass; full `npm run test:ci` remains a release-level gate.
