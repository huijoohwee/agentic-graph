# agentic-graph Graph Elements and Configs Semantics Document

**Context**: Import → Render pipeline vocabulary across Canvas, 2D renderers, and editing overlays
**Intent**: Align a single, neutral semantic definition for graph elements and graph configs across modes/surfaces
**Directive**: Centralize semantics and reuse SSOT types/tokens; forbid cross-surface semantic drift and duplicated “same” concepts

---

## Stack (Surface Journey)

**Canvas → 2D Renderer → Storyboard → Display Controls → Widget**

- **Canvas**: hosts the active render surface and owns renderer/mode gating.
- **2D Renderer**: renders the active graph view (D3 Graph, Flow, Storyboard).
- **Storyboard Widget**: edits a draft graph through the shared Storyboard Widget subsystem and commits explicitly; selection drives overlays.
- **Widget**: an in-canvas overlay for the selected node (semantic HTML; token-driven UI).

---

## GRAPHS Elements (SSOT Semantics)

- **Nodes**
- **Storyboard widgets**
- **Edges**
- **Graph layers**: subgraphs, groups, clusters, communities
- **Labels**
- **Text**

### Nodes

- **Definition**: a graph entity with `id`, optional `label`, and `type`; it carries `properties` and optional `metadata`.
- **Rendering**: rendered by 2D/3D/Flow surfaces from the same SSOT-derived active graph view.
- **Editing**: Storyboard Widget edits a draft copy; the shared widget form maps fields to `node.properties`.

### Edges

- **Definition**: a directed relationship with `id`, `source`, `target`, and `label`; it carries `properties` and optional `metadata`.
- **Rendering**: 2D renderers must route edge endpoints consistently (respecting Port Handles when enabled).

### Labels and Text

- **Label**: short, renderer-visible text associated with a node or edge (typically `label`).
- **Text**: any UI copy or metadata text rendered in panels/overlays (must be SSOT-managed via `UI_LABELS` / `UI_COPY` and typography tokens).

### Graph Layers

- **Definition**: a semantic grouping of render artifacts with controlled visibility and styling.
- **Examples**:
  - **Subgraphs / Groups / Clusters / Communities**: structural or derived groupings rendered as group geometry.
  - **Selection layer**: highlights active selection without mutating base styles.
  - **Overlay layer**: screen-space UI (Storyboard Widget) synchronized to world-space transforms.

### Storyboard widgets

- **Definition**: a screen-space overlay editing surface anchored to a selected node.
- **Contract**:
  - Semantic HTML only (`aside/section/header/nav/menu/form/...`), no generic wrapper sprawl.
  - Token-driven typography + icon sizing (`usePanelTypography`, `UI_THEME_TOKENS`).
  - Pin semantics: pinned anchors to node (drag disabled, blue pin icon); unpinned detaches (floating) and enables header drag.
  - Scroll isolation: overlay scroll must not trigger canvas zoom (wheel-ignore zone).
  - Render isolation: zoom/pan must not re-render heavy form subtrees (DOM transform updates only).
  - Registry-driven fields/ports:
    - Registry entries are authored via Storyboard Widget Manager and resolved per-node by node type + overrides.
    - `isHidden: true` on registry fields/ports hides them in the widget and suppresses Flow port handles.
  - Connected-data semantics:
    - Connected values are derived from port-bound edges and registry port `schemaPath` (plus optional `schemaMappings`).
    - The UI may surface computed “Connected” hints and an explicit “Apply” action, but the compute pipeline must not silently mutate `GraphData`.
    - Connected-value computation is shared across Storyboard Widget and Table Inspector to prevent cross-mode semantic drift.
  - More actions contract:
    - Open in sidepane dispatches the floating panel open event (no graph mutation).
    - Enable Handles sets `schema.behavior.portHandles.enabled=true` and `schema.behavior.portHandles.showAllInputs=true` (gated by baseline lock).
    - Convert to Loop sets `node.type='Loop'` and `node.properties['workflow:kind']='loop'` (draft graph only until commit).

---

## GRAPHS Configs (SSOT Semantics)

- **Grouping**
- **Positioning**
- **Collisions**
- **Timing**
- **Knobs**

### Grouping

- **Definition**: rules and presentation that derive and render group geometry.
- **SSOT knobs**: `schema.layout.groups.*` (shape, padding, corner radius, depth styling).

### Positioning (Layout)

- **Definition**: node placement strategy used by a renderer variant.
- **SSOT knobs**:
  - `schema.layout.mode` (high-level mode)
  - `schema.layout.flow.*` (Flow layout engine + routing knobs)
  - `schema.layout.forces.{antiLineStrength,postFitStrength,postFitAlphaMax}` for 2D D3 spread/fit tuning (surfaced via Floating Panel Layout section)
  - renderer-specific layout caches must be isolated by explicit view/cache keys.

### Collisions

- **Definition**: overlap resolution between nodes and groups during layout and drag.
- **SSOT knobs**: `schema.layout.forces.*` and group collision configs; must be step-bounded and rAF-throttled during drag.

### Timing

- **Definition**: bounded scheduling constraints for UI/interaction work.
- **SSOT knobs**: interaction throttles (rAF and interval gates) and bounded test timeouts (`AG_TEST_TIMEOUT_MS`).

### Knobs

- **Definition**: user-configurable parameters that affect rendering, interaction, and derived views.
- **Rule**: knobs live in schema/config/persistence SSOT (not inline constants); toggles must be cache-keyed when they affect layout/render output.

---

## Success Criteria

- **No semantic drift**: nodes/edges/layers/labels mean the same thing across Canvas, Flow, and Storyboard Widget.
- **SSOT copy**: Storyboard Widget strings come from `UI_LABELS` / `UI_COPY`.
- **SSOT tokens**: panel typography and control styling reuse `usePanelTypography` and `UI_THEME_TOKENS`.
- **Bounded work**: Port Handles, collision relax, and zoom commits stay step/interval bounded (no unbounded loops).
