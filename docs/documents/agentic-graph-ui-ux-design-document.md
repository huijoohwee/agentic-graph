# agentic-graph UI/UX Design: Universal Interaction Specification

## Design Mantras

```
- [ ] Affordances; preserve user interactions; forbid breaking UI gestures
- [ ] Clarity; communicate state explicitly; forbid implicit behavior
- [ ] Consistency; align UI and schema semantics; forbid divergent vocabularies
- [ ] Mobile-first; design narrow screens first; forbid desktop-only acceptance
- [ ] Neutrality; support any domain content; forbid domain-specific UI assumptions
- [ ] Performance; keep interactions responsive; forbid unthrottled hot-path work
- [ ] Stability; cleanup listeners and timers; forbid memory leaks
```

---

## Universal Design Principles

| Context        | Intent                         | Directive                                                                   |
|----------------|--------------------------------|-----------------------------------------------------------------------------|
| Interaction    | Preserve affordance contracts  | - [ ] Keep gestures stable; forbid hidden breaking changes                  |
| Observability  | Make state legible             | - [ ] Surface selection/filters/modes; forbid invisible mode changes        |
| Performance    | Maintain frame budget          | - [ ] Debounce/throttle hot events; forbid per-mousemove heavy computation  |
| Responsive     | Preserve primary workflows     | - [ ] Start from mobile viewport contracts; forbid desktop-only controls    |
| Neutrality     | Avoid domain coupling          | - [ ] Drive labels and semantics via config; forbid dataset-specific UX     |
| Accessibility  | Support inclusive usage        | - [ ] Use semantic roles/labels; forbid inaccessible controls               |

---

## UI Architecture

**Component Stack**: Canvas Page → Canvas Renderer → Panels → Editors → Tooling

**Interaction Flow**: Input → Selection → Inspection → Edit → Persist → Render refresh

**Responsive Baseline**: Mobile viewport → tablet split view → desktop multi-panel canvas → wide-canvas inspection. Wider layouts may reveal more simultaneous surfaces, but the mobile path owns the primary task order.

**Execution Companion**: Use `docs/documents/agentic-graph-mobile-first-enhancement-plan.md` as the canonical source-owned priority list for the next mobile-first improvements. It keeps grammar reachability, heavy-runtime gating, virtual-keyboard proof, and Dev -> Prod -> Cloudflare parity in one place.

**Workflow Evidence Companion**: Use `docs/documents/agentic-graph-feature-map.md` as the source-owned mobile route-and-action matrix. Heavy-runtime activation decisions for phones must follow that matrix instead of ad hoc local judgement.

## Mobile-First Responsive Contract

| Surface | Mobile-First Directive | Forbidden Drift |
|---------|------------------------|-----------------|
| MainPanel Integrations | Collapse provider setup into a touch-safe setup flow with reachable inputs, validation states, and actions. | Desktop-only forms, hidden submit actions, route-specific mobile patches |
| FloatingPanel Chat UI | Stay usable above the virtual keyboard and preserve visible context while tool traces or streamed output update. | Scroll traps, keyboard overlap, unbounded auto-scroll, duplicate chat shells |
| Editor Workspace | Keep Markdown/source editing reachable with toolbar, touch-sized Markdown/Viewer pane toggles, Explorer, editor panes, Monaco host, textarea fallback, and compact overlay width defaults that prioritize editing while preserving the canonical canvas gutter. Viewer preview toggles must keep an editable source pane visible. | Overlapping fixed bars, inaccessible editor controls, cramped side-by-side editors, tiny pane checkboxes, preview-only dead ends, local gutter literals, second preview mounts |
| Toolbar and Same-Row Controls | Scroll horizontally within the active row from shared toolbar row-scroll classes, keep primary and workspace-open canvas toolbars plus the narrow MainPanel sheet thumb-reachable inside safe-area bounds on mobile, preserve the editor-pane boundary only on wider viewports, and keep icon buttons, launch/dropdown menu rows, design controls, settings previews, chips, labels, table tag lists, data-view actions, and reorder indicators clipped through one responsive element-row primitive. | Wrapped icon rows, duplicated overflow classes, component-local scroll rules, top-edge-only mobile toolbars, mobile docks constrained by desktop pane boundaries, Toolbar-local safe-area sheet geometry, use-site reorder-line geometry |
| Canvas | Preserve pan, zoom, fit, selection, quick edit, inspect actions, and Design editor chrome through touch and pointer input inside shared safe-area-aware bounds. | Component-local breakpoints, hardcoded coordinates, fixed editor-chrome offsets, resize-observer loops |
| Rich Media Panel | Keep media playback, fallback states, and metadata inspection reachable inside safe-area-aware bounds. | Offscreen-only controls, silent clipping, desktop-only playback affordances |
| Generated Widgets | Emit responsive bounds, min sizes, fit strategy, edge anchors, and overflow behavior as metadata. | One-off fixed scenes, stale desktop coordinates, hidden edge handles |

## Mobile Workflow Evidence Contract

| Workflow class | Mobile requirement | Evidence owner |
|---|---|---|
| Default-shell workflows | Chat ask, stream review, inline markdown edit, and standard 2D browse remain reachable without activating Monaco, Mermaid, MapLibre, or Three. | `docs/documents/agentic-graph-feature-map.md` |
| Explicit-intent workflows | Full editor activation, diagram activation, geospatial preview, and 3D preview require one explicit touch action before their heavy runtime loads. | `docs/documents/agentic-graph-feature-map.md` plus focused browser smoke or contract proof |
| Fallback-first workflows | Phone users get a usable fallback before Monaco, Mermaid, MapLibre, or Three activate. | Shared surface owner plus focused proof path |
| Release review | If a workflow changes from immediate to deferred, or loses its fallback, the feature-map matrix and mobile proof docs must update in the same change. | `docs/documents/agentic-graph-mobile-first-enhancement-plan.md` and `docs/documents/agentic-graph-cross-repo-publish-topology.md` |

---

## Core User Journeys

### Journey A: Import → Inspect → Navigate

**From/To**: User selects input → parser loads graph → renderer draws scene → user navigates via pan/zoom and selection.

- Canvas entry: [Canvas.tsx](../../canvas/src/pages/Canvas.tsx)
- Renderer: [GraphCanvas.tsx](../../canvas/src/components/GraphCanvas.tsx)
- Store: `canvas/src/hooks/useGraphStore.ts`

### Journey B: Mode Switching (Layer + Layout)

**From/To**: User changes schema settings → graph derivation/layout updates → view remains stable (bounded reflow).

- Layer derivation: [layerDerivation.ts](../../canvas/src/lib/graph/layerDerivation.ts)
- Layout caching: [positioning.ts](../../canvas/src/components/GraphCanvas/layout/positioning.ts)

### Journey C: Edit Graph (Nodes/Edges)

**From/To**: User edits node/edge → store updates immutably → renderer reflects changes → selection preserved.

- Edit interactions: `canvas/src/features/*`
- Visual highlight: `canvas/src/components/GraphCanvas/highlight.ts`

### Journey D: Editor / Multi-dimensional Table Workspace (Markdown or Graph Table + Canvas Pane)

**From/To**: User toggles Editor or Graph Data Table mode → edits Markdown or inspects Graph Data → verifies changes in the shared Canvas pane.

- Editor mode shell: [EmbeddedEditorShell.tsx](../../canvas/src/components/EmbeddedEditorShell.tsx)
- Workspace view mode: `LS_KEYS.workspaceViewMode` (`Canvas | Editor | Table`)
- Editor sections:
  - Markdown Workspace (SSOT text + Explorer)
  - Multi-dimensional Table (host-owned Graph Data Table: canvas fast-grid + Record Inspector split, backed by the persisted GraphRecordDb cache over JSON GraphData; opened only via Workspace toolbar “Workspace: Multi-dimensional Table”, never via Document Mode “Multi-dimensional Table Mode” which is canvas-layout only).

**Stability constraints**
- The Canvas is mounted once (single `CanvasViewport`) and resized into the right Canvas pane for Editor/Table; do not mount a second preview surface.
- Selection sync is bidirectional but must not induce scroll-jump loops:
  - Table selection sets `selectionSource='table'`.
  - Canvas selection sets `selectionSource='canvas'`.
  - Explorer TOC focus is requested via an event (Table → TOC) and must reuse stable heading ids.

### Group Shape Toggle
- **Toggle**: Button with Square/Hexagon icon next to Frontmatter Mode.
- **Function**: Switches `schema.layout.groups.shape` between `rect` (default) and `geo`.
- **Visuals**:
  - `rect`: Renders groups as rectangular bounding boxes.
  - `geo`: Renders groups as native convex rings around member nodes.

### Frontmatter Mode

---

## Interaction Contracts

| Interaction | Trigger | Effect | Stability Constraint |
|------------|---------|--------|----------------------|
| Select node | Click node | Store selection updates | Must not trigger full scene rebuild unnecessarily |
| Select edge | Click edge | Store selection updates | Must not invalidate layout caches |
| Context menu | Right click canvas | Open props/actions | Must cleanup listeners on close/unmount |
| Markdown text selection | Click / double click / triple click in Viewer/Presentation | Native selection only (caret anchor / word / paragraph) | Must not hijack native selection gestures |
| Markdown “Show on/in …” | Right click in Editor/Viewer/Presentation | Open Selection Toolbar at exact pointer position | Must not “fly out”; must not use Monaco default context menu |
| Markdown apply + toggle | Cmd/Ctrl+Enter in Markdown section | Apply (when in Editor) and toggle Editor↔Viewer | Must be scoped to the markdown workspace root (no global hijack) |
| Pan/zoom | Drag/scroll | Update viewport transform | Must keep updates throttled and stable |
| 2D zoom parity | Wheel / trackpad pinch | D3 / Flow / Storyboard Widget must share one SSOT wheel normalization + sensitivity | Forbid per-renderer ad-hoc wheel scaling or passive wheel handlers that allow page scroll |
| Flow drag safety | Pointer drag on Flow/Storyboard Widget | Disable text selection and browser dragstart during canvas interactions | Forbid selection/copy cursors or panel text selection while pointer is captured |
| Viewport metrics | Toolbar → Status | Open Status Panel that surfaces zoom/pan/selection/renderer metrics | Forbid floating HUD/status duplication; keep one SSOT surface |
| Toast notification | Store adds toast | Surface transient status/errors | Must not overlap; newest stays at default Y and pushes older downward |

---

## Typography & Icon Alignment

| Context | Intent | Directive |
|---------|--------|-----------|
| UI Controls | Keep icon+text rows visually stable | - [ ] Use `inline-flex items-center` for icon+text; forbid baseline drift from mixed inline layout |
| Icons (Lucide) | Align icon glyphs with text | - [ ] Apply shared icon baseline alignment; forbid per-component ad-hoc offsets |
| SVG Labels | Keep label center alignment consistent | - [ ] Anchor and baseline-align SVG text; forbid default-anchor mismatches that overlap nodes |
| Titles & ellipsis | Keep long titles readable and stable | - [ ] Render long titles truncated with ellipsis at rest; on inline edit, reuse typography and reveal full text via horizontal scroll; forbid alternate WYSIWYG title stacks or layout/spacing drift when entering edit |

**Reference implementations**
- Global Lucide icon alignment: [index.css](../../canvas/src/index.css)
- Icon+text combobox controls: `singabldr/src/features/graph-data-table/ui/GraphDataTableUiPrimitives.tsx`
- Canvas node label anchoring/baseline: [labels.ts](../../canvas/src/components/GraphCanvas/layers/labels.ts)

---

## Global appearance authority

This is the canonical application design guide; do not create a competing `DESIGN.md`.
Implementation and release acceptance are joined in
[UI appearance PRD–TAD–ADR–MVP–GTM](./prd-tad-adr-mvp-gtm-ui-appearance.md).

| Surface | Required owner and behavior | Forbidden variants |
|---|---|---|
| UI icon stroke | `UI_ICON_DEFAULTS.strokeWidth = 1.5`; Settings may override globally within 0.5–4. `CanvasRootRuntime` publishes `--kg-icon-stroke-width`; Lucide and marked custom UI glyphs inherit it. | Local numeric `strokeWidth` on icon components; independent defaults of 2, 1.7 or 1.8; inline CSS stroke overrides. |
| Icon size and alignment | `getIconSizeClass(uiIconScale)`, shared compact/default glyph sizes, centered inline-flex controls. | Ad hoc offsets or a different size for adjacent actions in the same toolbar. |
| Selected icon action | `UI_THEME_TOKENS.button.selectedIcon`: blue glyph + soft blue background, matching Workspace View. Use `button.iconControl`; preserve a visible keyboard focus ring. | White-only selected background, selection extrusion, per-control shadows, record-row left accents on icon actions. |
| Neutral frame/divider | `UI_THEME_TOKENS.border.outline` / `--kg-surface-border`: 1 CSS px. Give every shared edge exactly one owner. | Stacked footer/card lines, neutral 2 px borders, separate gray border palettes. |
| Elevation | Flat controls and in-flow cards; `shadow.raised` for floating toolbars and `shadow.overlay` for menus, popovers and dialogs. Both map to shared light/dark CSS variables. | Per-feature elevation recipes, shadow-based selection, raised in-flow table/code frames. |
| Record selection | Shared `uiSelectedRowStateClassName` / `table.rowSelected` owns the blue fill and inset left accent. | Applying record selection to Explorer navigation or settings/menu toggles; they retain their own soft selected state. |

Exceptions are semantic, not compatibility aliases: authored diagrams, chart series, map overlays,
canvas geometry, resize/drag handles, focus rings, record-selection accents and branding retain
purpose-specific strokes or indicators. A focus ring must not be removed to make a control flat.
Borders specified above are CSS pixels; SVG icon stroke widths use the glyph viewBox units,
consistently across icons of the same shared size.

Existing saved icon widths remain user preferences; Reset restores 1.5. Invalid/nonfinite values
reset to the default, and valid finite values clamp to the supported range. No migration may
silently reinterpret a deliberately saved width as an old default.

`ui.appearance.sharedAuthority` traverses application TSX sources to reject numeric icon stroke
variants and verifies the shared default/reset, selected-state and elevation owners. Changes to
these owners require that guard plus browser checks of Workspace View, code Render/Copy, a
data-view action and Settings in both themes. Preserve authored SVG/chart strokes in review.

Application TS/TSX must not introduce `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl` or
`shadow-2xl`. Use the shared flat, raised or overlay token according to surface role. The
appearance authority test scans application sources; named SVG filters in authored canvas
output retain their separate visual semantics.

---

## Notifications (Toast)

**Primary directive**: Use Toast for transient UI feedback; forbid duplicate “Banner” implementations drifting from toast behavior.

| Context | Intent | Directive |
|---------|--------|-----------|
| Toast stacking | Keep notifications legible | - [ ] Newest toast anchors at default Y; older push downward; forbid overlap |
| Toast lifetime | Avoid sticky noise | - [ ] Default auto-dismiss by TTL; allow persistent “loading” toasts only with explicit dismiss |
| State transitions | Preserve causality | - [ ] For event transitions (loading → loaded/error), emit a new toast event and dismiss loading shortly after; forbid overwriting status so users miss the transition |
| Cleanup | Avoid leaks | - [ ] Clear timers/listeners on unmount; forbid orphaned intervals/timeouts |

## Shared floating guidance

The toolbar floating shell and sequence rows each have one presentation owner:
`components/ui/FloatingPanel.tsx:FloatingPanelShell` and
`features/sequence/SequenceInspectorView.tsx`. Native Graph and the portable guide delegate to them;
application controllers retain state, effects and authority. The portable artifact uses unchanged
native sequence styles and shared appearance tokens, with no consumer stylesheet variant.
Canvas OS is presently a product consumer. Moving UI ownership there requires a standalone export,
acyclic dependencies and migration of every existing consumer; its repository name is not ownership.
Shared guidance provides a named nonmodal panel, a visible close target, initial keyboard focus,
Escape callback and disposal. Hosts restore launcher focus on close or explicitly focus the target
field on action; teardown must not override that target. A selected step is never an acknowledgment.


## Shared panel selection and compact chrome

MainPanel, FloatingPanel and BottomPanel use one bounded transient layer order.
Selecting or focusing any panel raises that panel; capture handlers preserve child
controls. Anchor menus and toasts retain their higher bands. Portable panel shells
accept host callbacks and do not import the application store or policy.

Minimized surfaces consume the toolbar control-height, compact padding, surface
height, shared border and island-radius tokens. Native IconButton, HeaderActions
and PanelViewTab own icon size, stroke and selected-state backgrounds. Do not add
panel-specific replacements. Verify actual overlap hit targets and geometry in the
live app; expanded typography and mobile touch targets remain source-owned.
