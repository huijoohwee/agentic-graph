# Infinite Canvas Interaction & Performance (agentic-graph)

## Scope

This document describes the implemented interaction surfaces and performance safeguards for the infinite canvas graph workspace.
It is strictly code-backed: it documents the current behavior and forbids duplicate/legacy panels that reintroduce conflicting gesture ownership or rerender/recompute loops.

## UI Surfaces (SSOT)

### Floating Panel (Tool Menu)

- The Floating Panel is the single SSOT shell for Canvas tool surfaces.
- The active view is switchable (Props / Inspector / Chat / Geo / Renderer / Graph Traversal).

### Props Panel + Interaction Panel (paired)

- When the Floating Panel view is **Props**, Interaction is available as a dedicated **Interaction** tab in the same Floating Panel shell.
- Interaction is intentionally separated from Props but co-located in the Floating Panel so pointer/scroll interactions remain stable and do not require opening a separate “Arrange” surface.
- Forbid any additional “Arrange” panel variants (canvas overlays, editor tabs, or legacy floating panels) that duplicate these controls.

#### Interaction tab contents

- **Viewport**
  - Read-only zoom/center pill: `Zoom {k}% · Center {x} {y}` (derived from the active 2D zoom transform and viewport dimensions).
  - Read-only field groups that surface the implemented zoom and interaction SSOT:
    - Readout: viewport size, zoom percent, center x/y.
    - Transform: zoom scale `k`, transform x/y, min/max scale (`schema.performance.zoom.minScale/maxScale` via `readZoomScaleExtent`).
    - Zoom Modes: Pin View, Fit to Screen, Zoom to Selection, animation durations (`zoomDurationFitMs/zoomDurationSelectionMs`).
    - Wheel: wheel behavior (pan/zoom/preset), ctrl/meta boost multiplier, viewport controls preset (`viewportControlsPreset=map|design`).
    - Speeds: schema zoom speed/pan speed and global interaction/pan speed multipliers.
    - Flow: Flow wheel zoom speed and increment multipliers, Flow wheel smoothing range, Storyboard Widget selection-on-drag and overlay wheel proxy flags.
  - Viewport fields are read-only; the user edits the underlying settings in the Render and Settings panels. Interaction uses these fields as the canonical 2D viewport scope map and must not introduce separate mutable copies.
- **Interaction**
  - `Select/Drag` vs `Pan` (mode is stored in the host state and respected by both zoom/pan and D3 drag).
  - Layout selector: `Force` / `Radial` (writes `schema.layout.mode`).
- **Centering / Centroid**
  - Center on Selection (centroid of selected nodes).
  - Center on All Items (centroid of all nodes).
- **Even Spread**
  - Distribute Horizontally / Vertically (requires 3+ selected nodes).
- **Performance**
  - Optional perf overlay toggle that enables structural-only perf events and shows:
    - Render updates/sec.
    - State updates/sec.
    - Last layout init (ms).

## Interaction Ownership Rules

- Pan/drag/zoom must not conflict: pointer mode gates node/edge drag and allows pan-on-node in Pan mode.
- Interaction handlers must not capture stale state:
  - Prefer stable handlers + store getters/refs for hot paths.
  - Avoid per-frame React rerenders during pan/zoom.

## Quick Reference: User Flow, Workflow, Data Flow

| Flow type | Entry point (UI) | Primary behavior | Data path (high level) | Notes |
| --- | --- | --- | --- | --- |
| User flow | Interaction tab → Viewport → zoom/center readout | User pans/zooms the canvas; Viewport pill updates with current zoom percent and center coordinates. | D3 zoom transform (`zoomState`) + canvas dimensions (`canvasDims`) → `viewportCenterToWorld` → read-only fields in Viewport section. | Viewport is read-only; changes come from camera state, not from editing the pill. |
| User flow | Interaction tab → Interaction section → Select/Drag vs Pan | User switches between selecting/dragging nodes and panning the canvas. | Interaction buttons write `canvasPointerMode2d` in the graph store; D3 drag/zoom handlers read this mode to gate gesture behavior. | Pointer mode is SSOT for interaction behavior; forbid alternate mode toggles elsewhere. |
| Workflow | Interaction tab → Interaction section → Layout selector | User changes layout mode between Force and Radial. | Layout select updates `schema.layout.mode`; layout engine reads this field and recomputes positions using cached layout seeds. | Layout changes go through schema only; no parallel layout flags in other stores. |
| Workflow | Interaction tab → Centering / Centroid section | User recenters the camera on the current selection or on all items. | Buttons call `requestGraphCanvasArrange` with `{type: 'center', scope: 'selection|all'}`; arranger computes centroid from graph data and updates `zoomState`. | Centering is always mediated by the arranger; Viewport just reflects the resulting state. |
| Workflow | Interaction tab → Even Spread section | User distributes nodes horizontally/vertically when 3+ nodes are selected. | Buttons call `requestGraphCanvasArrange` with `{type: 'distribute', axis: 'x|y'}`; arranger computes new positions and writes back to graph data. | Guard text explains the 3+ node requirement; Interaction does not bypass arrange invariants. |
| Data flow | Interaction tab → Viewport → Zoom Modes group | User configures Fit to Screen / Zoom to Selection behavior in settings; Interaction shows the active modes. | Settings/Render panels edit `fitToScreenMode`, `zoomToSelectionMode`, `zoomDurationFitMs`, `zoomDurationSelectionMs`; Interaction Viewport section reads them from the store and groups them as Zoom Modes. | Interaction must not mutate these settings; it is the SSOT viewer, not the editor. |
| Data flow | Interaction tab → Viewport → Wheel group | User configures wheel behavior and modifiers in settings; Interaction shows the resolved behavior. | Settings/Render panels edit wheel behavior schema + `viewportControlsPreset`, `wheelZoomCtrlMetaBoostMultiplier`; Viewport section resolves behavior via `readWheelBehavior` and displays it. | Keeps wheel behavior consistent across canvas and Flow; forbid per-surface overrides. |
| Data flow | Interaction tab → Viewport → Speeds + Flow groups | User configures interaction/pan speed and Flow wheel zoom tuning; Interaction shows the effective multipliers. | Settings store persists `canvasInteractionSpeedMultiplier`, `canvasPanSpeedMultiplier`, Flow wheel speed/increment/smoothing settings; Viewport section surfaces them in Speeds/Flow groups. | Canonical mapping for AgenticRAG settings → UI groups; used as scope map for tools and agents. |

### Scope Map: Viewport Groups → Settings → AgenticRAG

| Viewport group | UI fields (examples) | Settings keys (store/LS) | AgenticRAG properties | Notes |
| --- | --- | --- | --- | --- |
| Readout | Viewport size, Zoom %, Center x/y | `zoomState`, `canvasDims` (derived state) | n/a (camera state only) | Live camera state, not persisted settings; used as read-only reference for agents and users. |
| Transform | Zoom scale `k`, Transform x/y, Zoom min/max | `schema.performance.zoom.minScale`, `schema.performance.zoom.maxScale` | `schema.performance.zoom.minScale`, `schema.performance.zoom.maxScale` (graph schema) | Min/max come from schema performance zoom fields; scale/translate come from runtime camera transform. |
| Zoom Modes | Pin View, Fit to Screen, Zoom to Selection, durations | `viewPinned`, `fitToScreenMode`, `zoomToSelectionMode`, `zoomDurationFitMs`, `zoomDurationSelectionMs` | `viewPinned`, `fitToScreenMode`, `zoomToSelectionMode`, `zoomDurationFitMs`, `zoomDurationSelectionMs` in `settings.jsonld` | Interaction shows the effective zoom mode state; editing happens via Canvas Zoom Modes settings/Render panels. |
| Wheel | Wheel behavior, Ctrl/Meta boost, Viewport preset | `viewportControlsPreset`, `wheelZoomCtrlMetaBoostMultiplier` | `viewportControlsPreset`, `wheelZoomCtrlMetaBoostMultiplier` in `settings.jsonld` | Viewport resolves behavior via `readWheelBehavior`; must stay in sync with Viewport Controls presets and wheel zoom settings. |
| Speeds | Zoom speed, Pan speed, Interaction/pan multipliers | `zoomSpeed` (schema), `panSpeed` (schema), `canvasInteractionSpeedMultiplier`, `canvasPanSpeedMultiplier` | `canvasInteractionSpeedMultiplier`, `canvasPanSpeedMultiplier` in `settings.jsonld`; zoom/pan speed fields in schema layout/perf | Separates schema-based speeds from global UI multipliers; Interaction surfaces the combined effect in a read-only way. |
| Flow | Flow wheel speed/increment, smoothing min/max, Flow selection/overlay flags | `flowWheelZoomSpeedMultiplier`, `flowWheelZoomIncrementMultiplier`, `flowWheelZoomSmoothMinDurationMs`, `flowWheelZoomSmoothMaxDurationMs`, `storyboardWidgetSelectionOnDrag`, `storyboardWidgetOverlayWheelProxyEnabled` | Corresponding Flow-related properties in `settings-flow.jsonld` and `settings.jsonld` | Ensures Flow viewport tuning is discoverable from Canvas Interaction; AgenticRAG uses these properties to reason about Flow behavior. |

## Performance Safeguards

- Forbid recomputation loops when switching modes/layouts.
- Cache layout positions by the active layout cache key; do not reseed unless inputs change.
- Perf overlay is opt-in and must not run unless the user enables it.
- Canvas Interaction Mode + Workspace Sync Mode must never introduce background churn:
  - **Static** mode keeps D3 forces bounded and frozen post-stabilization and forwards overlay wheel to Canvas so pointer streams remain owned by the canvas; Graph Data Table and GraphRecordDb ignore pure position-only updates and only sync on content changes or explicit Sync commands.
  - **Interactive** mode enables continuous D3 forces and overlay interactivity (no wheel forwarding when safe) but still uses revision+viewKey-gated sync to GraphRecordDb and must not introduce polling loops or cross-view write amplification.
  - **Manual** workspace sync disables auto sync and surfaces a single Sync action that runs a bounded GraphData→GraphRecordDb sync; **Real-time** works via the same code path but is triggered by revision changes, not by timers.
- Low-end devices: gate background renderer warm-mount/prefetch by `navigator.deviceMemory`, `navigator.hardwareConcurrency`, and `navigator.connection` (`saveData`, `effectiveType`); skip prefetch of non-active heavy 2D/3D renderers when memory/CPU are low or `saveData`/`2g` is detected so Canvas entry and Toolbar stay responsive.
- Heavy feature surfaces (Monaco editor, MapLibre GeoJSON previews, Mermaid diagrams, GLTF exporter) must be lazy-loaded per feature surface, and entry/vendor preloads must not auto-mount these modules on page load, especially on low-end or mobile devices.

## Implementation Pointers

- Floating Panel shell + views: `agentic-graph/canvas/src/features/toolbar/ToolbarToolMenu.tsx`
- Interaction tab body (Viewport + Interaction/Centering/Even Spread/Performance groups): `agentic-graph/canvas/src/features/canvas/InfiniteCanvasInteractionPanel.tsx`
- Canvas Interaction Mode + Workspace Sync Mode store+LS wiring: `agentic-graph/canvas/src/hooks/store/{canvasSlice.ts,types.ts}`, `agentic-graph/canvas/src/lib/config.{ls.ts,render.ts}`
- Toolbar toggles for Canvas Interaction Mode and Workspace Sync Mode: `agentic-graph/canvas/src/components/Toolbar.tsx`
- D3 drag guard in Pan mode: `agentic-graph/canvas/src/components/GraphCanvas/drag.ts`
- D3 zoom/pan behavior: `agentic-graph/canvas/src/components/GraphCanvas/zoom.ts`
