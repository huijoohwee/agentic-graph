# Pipeline Refactor & Cleanup Log

## Pipeline Traversal
Mapped the end-to-end pipeline:
1. **Importing**: `loader.ts` -> `registry.ts`
2. **Parsing**: `agenticRag.ts`, `workflowPresets.ts`, etc.
3. **Derivation**: `layerDerivation.ts` (filtering)
4. **Layout**: `positioning.ts` -> `radial.ts` / `simulation.ts`
5. **Render**: `GraphCanvas.tsx` -> `scene.ts` -> `sceneLayers.ts`

## Fixes Implemented

### 1. Circular Dependencies & Cleanups
- **`workflowPresets.ts`**: Fixed circular import from `@/features/parsers` (barrel file) to specific `./registry` and `./types` imports.
- **`radial.ts`**: Refactored to use shared `getAdjacencyMap` from `simulation.ts` instead of recalculating it (reusing cache).
- **`simulation.ts`**: Exported `getAdjacencyMap` for reuse.

### 2. Layout & Performance
- **Radial Layout**:
  - Fixed "drift/fly-away" issue by explicitly disabling force simulation forces (charge, collide, x/y positioning) when in `radial` mode.
  - Previously, `radial` mode calculated positions but the force simulation continued to apply forces, disturbing the layout.
- **Layout Toggle Visibility**:
  - When switching layout modes (Force ↔ Radial) and the view is not pinned, the zoom transform is no longer reused across modes; the scene refits to prevent “blank / offscreen” toggles.
- **Cache Contamination**:
  - Unified adjacency map caching.
  - Ensured `GraphCanvas` correctly determines layout positions based on mode switching.

### 3. UI/UX & Theme
- **Dark Mode Labels**:
  - Fixed an issue where labels appeared black in dark mode or didn't update correctly.
  - Root cause: schema defaults and persisted schemas could lock `labelStyles.color` to black (`#111111`), preventing theme token fallbacks; additionally, style application needed to re-run when scenes rebuild.
  - Fix:
    - Removed hardcoded label colors from schema defaults and schema-editor “clean schema” defaults.
    - Added a storage migration that strips legacy default label colors (`#111111` / `#111`) and halo colors (`#ffffff` / `#fff`) so theme token colors apply.
    - Ensured styles re-apply on data/scene changes.
- **Radial Layout Visuals**:
  - Improved stability by disabling conflicting forces.

## Files Modified
- `canvas/src/features/parsers/workflowPresets.ts`
- `canvas/src/components/GraphCanvas/simulation.ts`
- `canvas/src/components/GraphCanvas/layout/radial.ts`
- `canvas/src/components/GraphCanvas/useGraphCanvasStyles.ts`
- `canvas/src/components/GraphCanvas.tsx`
- `canvas/src/lib/graph/schema.ts`
- `canvas/src/features/schema-editor/utils.ts`
- `canvas/src/hooks/store/schemaSlice.ts`

---

## 2026-01-23: Geospatial Mode runtime overlay (MapLibre + OpenFreeMap + Turf)

- Status: This Geospatial Mode implementation was extracted to `gympgrph` on 2026-01-24; AgenticGraph now loads it on-demand as a plugin via a minimal bridge.

### Pipeline Traversal (Frontend Import → Render)
- **Import UI → ingest**: `features/toolbar/*ImportAction.ts` → `features/toolbar/ingestUtils.ts`
- **Parse/normalize**: `features/parsers/loader.ts` → `lib/graph/io/adapter.ts` → `lib/graph/geo/*`
- **Commit to store**: `hooks/store/graphDataSlice.ts` (AgenticGraph core) + `gympgrph/src/hooks/store/geospatialSlice.ts` (plugin-owned state)
- **Render switch**: `pages/Canvas.tsx` mounts `gympgrph`’s overlay host above `GraphCanvas`/`ThreeGraph` when the Geo tab is active
- **Overlay render**: `gympgrph/src/features/geospatial/GeospatialOverlay.tsx` builds MapLibre layers and loads dataset URLs with bounded fetch limits

### Fixes
- Restored/kept MapLibre runtime overlay and ensured basemap visibility defaults are practical for real usage.
- Extended record-style dataset parsing to accept both arrays and object maps (key → record), matching real-world datasets such as Airports.
- Added globe-mode auto-fit to active geo bounds to avoid “blank” defaults in 3D render mode.
- Extracted MapLibre-style/layer helpers into a dedicated module to keep files <600 lines and reduce conflicting implementations.

### Verification
- Ran bounded geospatial-only tests via the CI runner filter (no full-suite execution).

---

## 2026-01-24: Geospatial overlay interaction + projection + animation controls

- Status: This work now continues in `gympgrph` (AgenticGraph hosts it via a gympgrph plugin bridge).

### Changes
- Added FloatingPanel Map settings for interaction mode, projection mode, camera animation, and 3D auto-fit.
- Centralized basemap lifecycle in a dedicated hook and extracted map interaction toggling utilities.

### Verification
- Ran lint/typecheck for the canvas package after geospatial changes.
