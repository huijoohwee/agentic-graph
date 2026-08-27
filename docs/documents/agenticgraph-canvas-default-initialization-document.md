# AgenticGraph Canvas Default Initialization Document

## Design Mantras

```
- [ ] Defaults; enforce predictable startup state; forbid implicit persisted drift
- [ ] Separation; keep layout concerns schema-driven; forbid UI hardcoding
- [ ] Determinism; stabilize initial view across sessions; forbid random initial toggles
- [ ] Document-first startup; derive initial Canvas View from initialization-file frontmatter; forbid downstream startup overrides
- [ ] Safety; prefer reversible toggles; forbid one-way initialization side effects
```

---

## Universal Design Principles

| Context           | Intent                         | Directive                                                                 |
|------------------|--------------------------------|---------------------------------------------------------------------------|
| Configuration    | Externalize behavior            | - [ ] Drive layout via schema + store flags; forbid inline UI-only state  |
| Consistency      | Match user mental model         | - [ ] Apply the same startup defaults every init; forbid drift             |
| Determinism      | Repeatable startup              | - [ ] Normalize schema on init; forbid hidden variability                  |
| Separation       | Isolate responsibilities        | - [ ] Keep schema defaults in schema.ts; keep init normalization in store  |
| Reliability      | Avoid conflicting defaults      | - [ ] Remove contradicting initial values; forbid duplicate truth sources  |
| Performance      | Avoid unnecessary work          | - [ ] Skip initial simulation layout if stable; forbid redundant recalculation |

---

## Canvas Initialization Architecture

**Stack**: Store Initialization → Schema Normalization → Graph Derivation → Force Simulation → Render

**Flow**: App mount → load schema (storage or default) → apply init normalization → render force layout (skip seed if stable).

**Design Principles**: Consistency | Determinism | Separation | Configuration

### Initialization-File Bootstrap Contract

- **Bootstrap source roots**:
  - The editorial, video-validation, and geospatial seeds remain sourced from `huijoohwee/docs` and materialized into the workspace root.
  - The default XR physics seed is owned at `agenticgraph/docs/workspace-seeds/agenticgraph-physics-playground-demo.md`, published under the canonical path resolved by `XR_PHYSICS_DEMO_PUBLISHED_CANONICAL_PATH`, and materialized at `/docs/workspace-seeds/agenticgraph-physics-playground-demo.md`.
- **Canonical initialization-file family**:
  - `/workspace-readme.md`
  - `/agenticgraph-agentic-video-canvas-demo.md`
  - `/agenticgraph-maps-places.md`
  - `/docs/workspace-seeds/agenticgraph-physics-playground-demo.md`
- **Materialization rule**:
  - The three legacy initialization files stay root-level for deterministic explorer ordering and stable source-file ids. The physics seed keeps its source-owned `/docs/workspace-seeds/...` path so Dev, D1 publication, opaque share identity, and runtime selection resolve one document.
- **Frontmatter SSOT**:
  - `workspace-readme.md` lands on `2d + d3 + Frontmatter Mode`.
  - `agenticgraph-agentic-video-canvas-demo.md` lands on `2d + Storyboard Widget + Frontmatter Mode` and remains the explicit agentic-video validation/loading demo.
  - `Load preset` must refresh its runtime `/docs/agenticgraph-agentic-video-canvas-demo.md` mirror from this canonical initialization source before parsing, so generated runtime projections cannot replace the authored text/image/video stage graph across local ports.
  - `agenticgraph-maps-places.md` lands on `Geospatial Mode` from frontmatter and keeps document/frontmatter semantics enabled.
  - `agenticgraph-physics-playground-demo.md` is the cold-start default and lands on `XR + 3D`, opens Motion Control, and auto-starts the native physics runtime from frontmatter. A custom `VITE_AGENTICGRAPH_TEST_VALIDATION_SEED` remains an explicit validation-only override.
- **Activation precedence**:
  - On workspace bootstrap and exact UI import, the activated initialization file becomes the raw-frontmatter authority before composed source-file replay or metadata/layout helpers run.
  - A previously active document must not reapply stale frontmatter over the newly activated initialization file.
- **Override rule**:
  - Layout autosuggest and post-parse metadata helpers must not override an explicit frontmatter-selected renderer or surface mode for these initialization files.

### High-Level Components

- **Schema Defaults**:
  - [schema.ts](../../canvas/src/lib/graph/schema.ts) defines the baseline schema defaults for new sessions.
- **Initialization Normalization**:
  - [useGraphStore.ts](../../canvas/src/hooks/useGraphStore.ts) enforces the startup defaults by applying an initialization schema normalizer.
- **Canvas Rendering**:
  - [GraphCanvas.tsx](../../canvas/src/components/GraphCanvas.tsx) renders the graph using the normalized schema and current toggle flags.
- **Simulation Control**:
  - [positioning.ts](../../canvas/src/components/GraphCanvas/layout/positioning.ts) determines if simulation should skip initial seed layout (warm start).

---

## Module Specifications

### Module: Store Initialization Normalizer

**Responsibility**: Store initializer loads schema → applies default-init normalization → exposes a consistent startup state.

**Interface Pattern**: `applyCanvasDefaultInitSchema(schema)` → returns normalized schema → complexity: O(1)

**Enforcement Location**:
- [useGraphStore.ts](../../canvas/src/hooks/useGraphStore.ts)

**Design Compliance**:

| Context          | Intent                          | Directive                                                                 | Module/Component | Function/Method                   | Input               | Output              | Decision Logic |
|-----------------|----------------------------------|---------------------------------------------------------------------------|------------------|-----------------------------------|---------------------|---------------------|----------------|
| Defaults        | Stable startup                   | - [ ] Normalize init schema; forbid inconsistent initial toggles          | useGraphStore.ts | applyCanvasDefaultInitSchema       | GraphSchema         | GraphSchema         | force + document + portHandles (default off) |
| Frontmatter     | Enable safe frontmatter focus     | - [ ] Default ON; forbid blank canvas: if no frontmatter Mermaid, fall back to full graph | uiSettingsSlice.ts | frontmatterModeEnabled default   | —                   | boolean             | default true + filter fallback |
| Toolbar Modes   | Prefer document workspace at init | - [ ] Default 2D Storyboard Widget + Frontmatter Mode + unlocked view; forbid panel-local startup drift | config.render.ts + uiSettingsSlice.ts + uiSlice.ts + geospatialSlice.ts | canvas2dRenderer + frontmatterModeEnabled + documentStructureBaselineLock + geospatialModeEnabled | — | boolean/enum | canvas2dRenderer='storyboard'; frontmatterModeEnabled=true; documentStructureBaselineLock=false; geospatialEnabled=false |
| Layer Mode      | Prefer document structure        | - [ ] Default document mode; forbid semantic-first default                | schema.ts        | defaultSchema.layers.mode         | —                   | 'document'          | constant |
| Port Handles    | Disable by default               | - [ ] Default OFF; forbid implicit border anchoring at init               | schema.ts        | defaultSchema.behavior.portHandles | —                   | enabled false       | constant |

---

## Component Responsibility Matrix

| Layer/Subsystem | Path/Module                    | Component           | Interface/Method        | Responsibility (S-V-O)                                                | Dependencies                    | Contracts                             | LOC    |
|-----------------|--------------------------------|---------------------|-------------------------|-----------------------------------------------------------------------|---------------------------------|---------------------------------------|--------|
| Store           | `hooks/useGraphStore.ts`       | useGraphStore       | `applyCanvasDefaultInitSchema` | Store enforces schema defaults → returns normalized schema → guarantees safe init | `schema.ts`                     | Must return valid schema              | ~10    |
| Store           | `hooks/store/uiSettingsSlice.ts`| createUiSettingsSlice| `frontmatterModeEnabled` | Slice initializes UI flags → sets default boolean → controls frontmatter focus mode | `types.ts`                      | Default must be true (safe fallback)  | ~5     |
| Canvas          | `components/GraphCanvas.tsx`   | GraphCanvas         | `useEffect`             | Canvas initializes scene → triggers simulation → renders graph        | `scene.ts`, `simulation.ts`     | Renders SVG from graphData            | ~100   |
| Layout          | `layout/positioning.ts`        | determineLayoutPositions | `determineLayoutPositions` | Logic calculates cache usage → determines skipInitialLayout → optimizes re-render | `types.ts`                      | Returns layout strategy               | ~80    |

---

## Dependency & Integration Standards

**Dependency Declaration**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Store Dependencies   | Centralized state management    | - [ ] Import slices; compose store; forbid circular slice dependencies                     |
| Schema Dependencies  | Type-safe configuration         | - [ ] Import GraphSchema types; use defaultSchema constants; forbid magic strings          |

**Integration Contracts**

- **Initialization Contract**:
  - Must ensure `layout.mode` is 'force'.
  - Must ensure `frontmatterModeEnabled` is true.
  - Must ensure Frontmatter Mode never yields an empty canvas: if no frontmatter Mermaid nodes exist, render the full graph.
  - Must materialize the canonical initialization family: the three legacy root files from `huijoohwee/docs` plus the source-owned physics seed at `/docs/workspace-seeds/agenticgraph-physics-playground-demo.md`.
  - Must preserve each seed's canonical source owner and activation path; no downstream mirror or renderer query may replace frontmatter authority.
  - Must default `workspace-readme.md` to `canvasRenderMode='2d'`, `canvas2dRenderer='d3'`, `documentSemanticMode='document'`, and `frontmatterModeEnabled=true` from frontmatter.
  - Must default `agenticgraph-agentic-video-canvas-demo.md` to `canvasRenderMode='2d'`, `canvas2dRenderer='storyboard'`, `documentSemanticMode='document'`, and `frontmatterModeEnabled=true` from frontmatter.
  - Must choose `agenticgraph-physics-playground-demo.md` for a cold unselected workspace and apply its `canvasSurfaceMode='xr'`, `canvasRenderMode='3d'`, `canvas3dMode='xr'`, and Motion Control state from frontmatter.
  - Must keep geospatial startup opt-in for non-geospatial sessions, while allowing the canonical geospatial initialization file to enable geospatial mode directly from frontmatter.
  - Must keep the generic FloatingPanel baseline closed with `propsPanel`; the canonical physics seed may explicitly open `motionControl` through frontmatter.
  - Must default `View Lock` OFF by initializing `documentStructureBaselineLock` to false in the shared UI slice.
  - Must ensure `graphLayersVisible` is true.
  - Must compute 2D zoom/layout view keys from a shared schema-layout fingerprint (include `schema.layout.flow`) so keyed zoom state and cached layout positions do not drift across D3/Flow/Design/Storyboard Widget.
  - Storyboard Widget camera init must be keyed per dataset when stable (e.g. `path:*`) and must fall back to a per-graph hash when dataset keys collapse to `rev:*`.
  - 2D renderer initialization must be idempotent: if a valid stored initial transform is applied, the same init pass must not immediately re-run auto-fit (forbid “double-fit” jumps).
  - Persisted view restoration must be bounds-guarded: do not apply stored transforms until graph bounds can be computed (e.g., at least one finite node position and non-zero node dimensions); prefer fit/identity over a stale offscreen pan.
  - Scene build and fit must ignore invalid geometry: if positions are only partially available, skip nodes without finite positions (and their incident edges) to prevent one-long stray lines and chaotic redraw on first paint.
  - Cached layout positions must be respected: when a stable per-mode layout position cache exists, apply it and avoid rewriting positions during init; only seed missing node positions or fix unstable/extreme layouts.
  - Fit geometry must use stable per-node dimensions: read `visual:width`/`visual:height` when present, otherwise fall back to the renderer’s default node width/height.
  - Fit must be collective and display-consistent: compute fit from the display-derived graph (post filters/collapse) and include group envelopes (clusters/subgraphs/layers) so the visible graph is fully in-viewport and centered.
  - Reset must behave as Fit-to-View framing: center on collective centroid and fit into a capped 16:9 frame; forbid reset forcing `k=1` when graph is larger than viewport.
  - 2D layer ordering must be SSOT and reused across renderers: centralize ranks for nodes/edges/groups/labels/handles and apply consistently for SVG z-order and native canvas draw order.
  - Collision avoidance must be deterministic and non-destructive: seed any force RNG by node ids; clamp displacement to avoid teleporting; run bounded relax after layouts are produced/frozen; use overlap-pressure heuristics for non-force layouts (avoid persistent overlaps without re-layout thrash).
  - Design frame dragging must forbid overlap: on drag end, resolve collisions with the shared relax runner, pin the dragged frame, and batch position writes to avoid rerender churn.
  - Overlay stacking must be stable: z-index for overlay-only edge routing must be keyed relative to `floatingPanelZIndex` so widgets stay on top without hardcoded constants.
  - Must use actual viewport dimensions for layout and fit when available; fallback to preset only when viewport is invalid (<100px).
  - Must enforce strict node separation via increased collision padding (20px) and charge (-800) to prevent initial clustering.
  - Keyword Mode must remain anchored to Document Structure baseline: seed Keyword node positions from cached Document baseline positions when available; if Keyword cached positions are unstable (extreme/offscreen, overly spread, or overly clustered), override skip-initial-layout and force bounded relayout + post-fit-to-viewport to keep Nodes/Clusters/Edges centered and visible.

---

## Code Organization Framework

**Directory Structure**:

```text
canvas/
├── src/
│   ├── components/
│   │   └── GraphCanvas/
│   │       ├── GraphCanvas.tsx       # Main component
│   │       ├── scene.ts              # Scene setup
│   │       ├── simulation.ts         # Force simulation
│   │       └── layout/
│   │           └── positioning.ts    # Layout strategy
│   ├── hooks/
│   │   ├── useGraphStore.ts          # Store entry point
│   │   └── store/
│   │       ├── uiSettingsSlice.ts    # UI settings
│   │       └── canvasSlice.ts        # Canvas settings
│   └── lib/
│       └── graph/
│           └── schema.ts             # Schema definitions
```

---

## Testing & Quality Standards

**Test Coverage Metrics**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Initialization       | Verify defaults                 | - [ ] Assert initial store state; verify schema normalization; forbid drift                 |
| Re-rendering         | Verify stability                | - [ ] Mount canvas; update props; verify simulation does not restart unnecessarily          |

**Quality Gates**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Default Config       | Ensure user safety              | - [ ] Validate defaults match 'Disjoint Force'; forbid 'Tree'/'Radial' default              |

---

## Data Flow

**Pipeline**: App Load → Store Init → Schema Normalization → Canvas Mount → Simulation Build → Render

| Stage       | Input                          | Output                         | Responsibility                                              | Performance Consideration                    |
|-------------|--------------------------------|--------------------------------|-------------------------------------------------------------|----------------------------------------------|
| Store Init  | LocalStorage / Defaults        | Initial State                  | Merges persisted data with enforced defaults                | Fast sync read                               |
| Normalization| Raw Schema                    | Normalized Schema              | Applies `applyCanvasDefaultInitSchema`                      | O(1)                                         |
| Canvas Mount| GraphData + Schema             | SVG Elements                   | Sets up D3 zoom, layers, simulation                         | Expensive DOM ops (use refs)                 |
| Simulation  | Nodes + Edges                  | Node Positions (x,y)           | Runs force layout (or skips if stable)                      | Heavy CPU (skip if `skipInitialLayout`)      |

---

## Design Decisions & Trade-offs

| Decision             | Rationale                          | Pros                                                  | Cons                                      | Mitigation                                    |
|----------------------|------------------------------------|-------------------------------------------------------|-------------------------------------------|-----------------------------------------------|
| Force 'Force' Mode   | Most general purpose layout        | Handles any graph structure; good for exploration     | Less structured than Tree/Radial          | User can switch modes manually                |
| Skip Initial Layout  | Prevent jitter/recalculation       | Stable rendering on minor updates; better perf        | Might not converge if positions are bad   | Fallback to layout if coverage < 95%          |
| Enforce Defaults     | Consistent user experience         | Users always start in a known state                   | Overrides persisted preference (sometimes)| Persist only specific user preferences        |

---

## Anti-Patterns (Forbidden)

| Context                | Intent                          | Directive                                                                 |
|------------------------|---------------------------------|---------------------------------------------------------------------------|
| Conflicting Defaults   | Single truth                     | - [ ] Align default values; forbid contradictory defaults across slices   |
| Hidden Startup Drift   | Predictable init                 | - [ ] Normalize schema on init; forbid dependence on stale persisted state |
| Layout Mode Leakage    | Correct init layout              | - [ ] Force layout.mode='force'; forbid implicit tree/radial activation   |
| Renderer Seepage       | Preserve frontmatter landing     | - [ ] Respect initialization-file frontmatter; forbid autosuggest coercing Storyboard Widget or Geospatial docs back to flowchart or generic 2D defaults |
| Domain Bias            | SSOT startup                     | - [ ] Keep document-first startup in shared defaults only; forbid panel-local startup heuristics |
| Infinite Re-render     | Performance                      | - [ ] Avoid layout sync in render loop; forbid updating store from simulation tick |

---

## Repository Health Checklist

| Context               | Status | Directive                                                                 |
|----------------------|--------|---------------------------------------------------------------------------|
| Defaults Consistency | ✓      | - [ ] Unify init defaults; forbid contradictory startup flags             |
| Maintainability      | ✓      | - [ ] Centralize startup normalization; forbid scattered init logic       |
| Testability          | ✓      | - [ ] Keep defaults schema-driven; forbid untestable UI-only behavior     |
| Performance          | ✓      | - [ ] Optimize re-rendering; forbid simulation restart on stable state    |

---

## Rebase & Conflict Resolution Notes

- If `scene.ts` is in conflict, keep initialization idempotent: applying a stored `initialZoomTransform` must prevent immediate auto-fit (“double-fit” jump).
- If `fitToScreenMode` behavior diverges across branches, prefer schema-driven fit via `readFitAllOptions` + `fitAllTransform` and keep collision relaxation for layout stability.
- Do not hand-merge `canvas/tsconfig.tsbuildinfo`; regenerate it via `npm --prefix canvas run check` or `npm --prefix canvas run build`.
