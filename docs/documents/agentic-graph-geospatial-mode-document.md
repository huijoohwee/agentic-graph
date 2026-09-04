# agentic-graph Geospatial Mode Document

**Context**: Map-oriented exploration on top of the 2D infinite canvas  
**Intent**: Overlay basemap + geo layers without breaking graph-first affordances  
**Directive**: Drive behavior via configuration (no hardcoded datasets/providers), bound all fetch/parse work, and preserve graph-first defaults (overlay is off until explicitly enabled, except optional auto-enable on geo imports)

---

## Status (2026-07-29)

- **Implementation state: candidate-ready; exact-candidate browser and protected
  exact-main proof pending.** The prior enhanced-layer baseline has structured
  operator controls and focused source proof. This four-mode Flight/Geo/XR
  candidate does not claim `runtime-ready-dev` until its repository browser
  gate passes on the sealed candidate and again on the protected-main revision
  produced by integration.
- agentic-graph keeps Geospatial Mode logic out of its codebase and loads it on-demand from the sibling repo `gympgrph` (implementation lives in `gympgrph/src/`).
- agentic-graph exposes a toolbar entrypoint (**Geospatial Mode**, right of **3D Mode**) that opens the Floating Panel **Geo** view and toggles the gympgrph overlay.
- **3D render mode uses MapLibre exclusively** (Cesium has been removed). The
  3D overlay renders through the same runtime path and consumes the selected
  regional companion's oblique presentation policy before yielding to the
  selected simulation or operator camera. Both 2D variants consume that
  companion's north-up planar policy. Regional values and their non-boundary
  semantics live in the
  [ADM0 environment companion](./agentic-graph-adm0-singapore-prd-tad-ard.companion.md).
- Enhanced layers are additive and configuration-driven: polygon datasets may
  opt into native MapLibre `fill-extrusion`, while source-authored bounded mesh
  descriptors may opt into the MapLibre custom-layer path. With no enhanced
  configuration, the existing SVG, 2D MapLibre, and 3D MapLibre behavior is
  unchanged.
- The browser bundle adds no GIS engine, model loader, or runtime dependency.
  The clean pre-enhancement baseline is **6,023,998 gzipped JavaScript bytes**;
  the deterministic readiness baseline is **6,027,959 bytes**; and a previously
  measured renderer candidate was **6,041,082 bytes**. The current
  operator-control candidate measures **6,050,442 bytes**, a
  **22,483-byte** delta from the deterministic readiness baseline.
  `npm run geospatial-mode:check` enforces a maximum **250 KiB** measured delta.

## Enhanced-layer runtime contract

Enhanced entries use deterministic source precedence: a present
`kg:ui:geospatial:enhancedLayers` local value, otherwise
`VITE_GEOSPATIAL_DATASETS_JSON`, otherwise an empty catalog. A present local
value—including `[]`—wins. Invalid environment JSON fails closed with an
`invalid-config` diagnostic naming the environment key. The runtime reads no
compiled dataset or asset URL.

### Enhanced layers operator control surface

The Floating Panel **Geo** view owns a structured **Enhanced layers** catalog.
It is the user-facing path for configuring the enhanced entries described
below; environment configuration and direct localStorage mutation are not
acceptable substitutes.

- A source badge reports **Environment**, **Local**, or **Empty** for the
  effective catalog and exposes `data-kg-geo-enhanced-config-source` for
  deterministic proof.
- The catalog lists every building extrusion, road extrusion, and 3D asset with
  its stable ID, kind, visibility status, **Edit**, **Remove**, and
  keyboard-operable visible/hidden **Toggle** controls. Accessible action names are
  `Toggle enhanced layer <id>`, `Edit enhanced layer <id>`, and
  `Remove enhanced layer <id>`.
- **Add enhanced layer** and **Edit** expose the URL, mandatory `timeoutMs` and
  `maxBytes`, and kind-specific render fields. A successful save atomically
  persists the complete local catalog and updates the mounted map in the same
  tab without reload.
- **Remove** deletes exactly one entry, clears that entry's stale visibility
  override, retains siblings, and persists `[]` when the operator intentionally
  removes the final local entry.
- **Reset to environment defaults** removes the local catalog and all enhanced
  visibility overrides; it never writes `[]`. The runtime then resolves the
  environment catalog, or the empty catalog when no environment value exists,
  and updates without reload.
- Invalid drafts show field-level, actionable errors and perform no storage,
  event, or runtime mutation. The previously rendered catalog remains active.
- The catalog and forms remain usable by keyboard at desktop and mobile panel
  widths.

Both `timeoutMs` and `maxBytes` are mandatory for every enhanced request;
missing bounds abort before `fetch`. The effective deadline is
`min(timeoutMs, 10_000)`. Bodies are read incrementally and cancelled when the
deadline or byte limit is crossed; partial payloads and late cache writes are
discarded.

Cached resources can render without a network request. The current-tab cache is
a byte-accounted LRU bounded to 32 MiB and 32 entries, returns copies, and
rechecks each caller's current `maxBytes`. Eviction or page reload may require a
new request; this is not persistent offline storage.

```jsonc
[
  {
    "id": "configured-buildings",
    "url": "<SAME_ORIGIN_OR_OPERATOR_URL>",
    "enabled": true,
    "render": {
      "kind": "extrusion",
      "extrusionKind": "building",
      "heightProperty": "height_m",
      "defaultHeightMeters": 8,
      "baseHeightMeters": 0,
      "fillColor": "#9aa5b1",
      "fillOpacity": 0.85,
      "tags": ["#city"]
    },
    "fetchBounds": { "timeoutMs": 20000, "maxBytes": 26214400 }
  },
  {
    "id": "configured-landmark",
    "url": "<SAME_ORIGIN_OR_OPERATOR_URL>",
    "render": {
      "kind": "asset3d",
      "lat": 1.3,
      "lng": 103.8,
      "altitudeMeters": 0,
      "scale": 1,
      "rotationDegrees": 0,
      "tags": ["#landmarks"]
    },
    "fetchBounds": { "timeoutMs": 20000, "maxBytes": 2097152 }
  }
]
```

Extrusion heights come from the configured property only. Missing, non-numeric,
negative, or above-10,000-meter values use the configured fallback and produce
a diagnostic without dropping the feature. Both building and road polygons use
the same normalizer. Base height is clamped by the effective height; color and
opacity remain configuration-owned.

The asset descriptor is intentionally small and source-authored:

```json
{
  "schemaId": "agentic-graph-geo-asset-mesh/v1",
  "positions": [0, 0, 0, 1, 0, 0, 0, 1, 0],
  "indices": [0, 1, 2],
  "color": [0.6, 0.65, 0.7, 1]
}
```

Positions are model-space meters. The custom layer implements MapLibre's public
`MercatorCoordinate` equations locally and composes those normalized
coordinates with `defaultProjectionData.mainMatrix` plus the source-mesh z-up
transform. It never reads the private `map.transform` object or statically
imports the MapLibre runtime. The custom-mesh path is Mercator-only and fails
closed outside the supported latitude range or while MapLibre reports a
non-zero globe projection transition. Geo+XR environment, domain, and
dynamic-subject composition follows the
[Geo+XR Mode PRD/TAD/ADR](./agentic-graph-geo-xr-mode-prd-tad-ard.md). The selected
authored environment remains visible without a parallel rendered world; this
plain-Geospatial document does not own composed-surface arbitration.

The layer shares MapLibre's WebGL context, restores host program/buffer/vertex
array state, releases owned buffers/programs/vertex arrays on teardown, and
recreates them after context restoration. Invalid coordinates, matrices, or
mesh descriptors skip only the affected asset.

### Invocation and optional authoring

All writes converge on `gympgrphBridge`; invocation surfaces never receive a map
reference.

- `/geo on|off`
- `/geo extrusion <id> show|hide`
- `/geo asset <id> show|hide`
- `@<geo-node-id>` fits validated node bounds
- `#<tag> show|hide` changes exactly the matching enhanced layers
- MCP tool `agentic-graph.geospatial.command` produces the same validated command
  envelope and a local Canvas deep link

Unknown actions, targets, unbounded nodes, and unmatched tags return actionable
errors without state mutation. Successful writes synchronously emit the
documented geospatial change event.

The chat activator runs before generic provider preflight, so valid local
commands require no chat endpoint. `/geo` and `/geospatial` are claimed only at
a command boundary; `#` requires explicit `show|hide`; and `@` is claimed only
for an existing graph node. Unrelated invocation tokens retain their existing
meaning. MCP envelopes are validated, consumed once, and executed through the
same graph-aware bridge. Failed on-demand package loading restores the prior
mode preference without changing the view mode.

The optional geo-authoring harness is off by default. When explicitly invoked,
it validates input before any model call, clamps loops to 1–50 iterations and
timeouts to 1–300 seconds, validates every draft and canonical cost log, applies
no partial configuration, and returns typed timeout, budget, iteration, input,
or output errors. An absent adapter, timeout, or transport failure returns a
typed `model-unavailable` error plus a deterministic disabled draft. The
fallback has an empty URL, remains invisible, and is never passed to
`applyDraft` automatically.

### Source and runtime-readiness proof

`npm run geospatial-mode:check` owns the focused source/build proof:

- shared and extracted-package TypeScript builds;
- generative tests at 120 runs plus deterministic projection, GL lifecycle,
  bounded streaming, LRU, deadline, progress, configuration, invocation, fit,
  authoring-fallback, catalog editor, persistence, validation, and live-toggle
  tests;
- MCP catalog/envelope tests and filtered Canvas geospatial-invocation
  integration tests;
- an ordered evidence manifest for all **44 correctness properties**;
- a production build followed by dependency, hardcoded-URL, file-size,
  document, property-manifest, and gzip-delta guards.

Browser proof has two mandatory, separately recorded gates:

1. **Owned task-worktree diagnostic:** start from a fresh candidate origin with
   environment extrusion and asset entries. From the Geo panel, verify the
   Environment source badge; Add, Edit, Remove, and reload a local entry; hide
   and show one layer without reload; submit an invalid draft without mutation;
   then **Reset to environment defaults** and confirm the original environment
   entries and visibility return without reload. This pre-integration
   diagnostic is deliberately unsealed and cannot establish runtime readiness.
2. **Exact main SHA:** after protected integration, repeat the source-badge,
   local persistence/reload, per-layer Toggle, invalid-draft, and reset flow on
   the exact integrated revision.

Both passes assert native extrusion and asset readiness markers, a nonzero
MapLibre canvas, the 3D/globe view, keyboard operation, a mobile viewport, and
no critical page or request failure. The protected exact-main pass is the
runtime-readiness gate. This is deterministic desktop-browser proof, not
physical-device or production proof.

The production/Cloudflare route remains outside this implementation authority;
source readiness does not claim deployment or physical-device proof.

## Current Status (Runtime Overlay)

- The Geo panel exposes three explicit view selections: **2D (MapLibre)**, **2D (SVG fallback)**, and **3D (MapLibre)**.
- **2D (MapLibre)** and **3D (MapLibre)** run through the restored MapLibre runtime path and support explicit style URL overrides.
- **2D (SVG fallback)** remains a dedicated high-fidelity fallback surface with no MapLibre runtime dependency.
- The overlay supports interaction gating (**Off / Hold Space / Always**). Default interaction mode is **Always** for immediate navigation, and users can switch in the Geo panel.
- Geospatial Mode is a canvas rendering mode: when **ON**, the canvas suppresses agent-graph rendering (nodes/edges/layers/rich media) so the map overlay and geospatial datasets are the primary surface.
- Floating Panel open/close does not toggle Geospatial Mode.
- When a non-default MapLibre path is enabled, the extracted module still owns the required MapLibre CSS so host runtimes do not need to import it separately.
- **Default Style**: A blank/default basemap style resolves to the MapLibre default style URL (`https://demotiles.maplibre.org/style.json`) for MapLibre modes.
- **Style URL Note**: Explicit `http(s)` style URLs remain supported for MapLibre modes; the SVG fallback sentinel (`kg:style:svg-fallback`) keeps MapLibre off only for explicit SVG fallback mode.
- **Legacy/Raster Note**: Legacy square raster fallback paths remain forbidden and are not used by any default or fallback mode.
- Dataset layers can be added as http(s) URLs (GeoJSON or record-style JSON) and rendered as points/lines/polygons.
- Same-origin datasets can also be referenced as absolute paths (starting with `/`) so hosts can serve local GeoJSON/JSON without CORS.
 - Host-side JSON imports that contain geo fields (e.g. `lat/lon` or `geo.{lat,lng}`) can be ingested as **sampled geodata** without parsing the entire JSON payload (prevents UI freezes on very large object-map datasets).
- Loading a fenced Markdown `geojson` block as GraphData must reuse the same auto-enable helper as `.geojson` imports, and embedded block extraction should flow through one shared request path. The computing-flow sample keeps one generic FeatureCollection for ingest→parse→render validation. Forbid Markdown-only toggles or duplicate enable state.
- Clicking a rendered **POI** selects it:
  - Graph-node POIs select the corresponding graph node in the main canvas (selectionSource aligns with canvas clicks).
  - Dataset POIs show a lightweight selection marker + popup with dataset/feature details.
  - Dataset POIs may also open a bounded, right-side details panel when the feature carries markdown/media properties (dataset-agnostic; driven by feature metadata).
  - POI clicking follows the interaction gating (Off / Hold Space / Always).
- Dataset point layers can optionally render as clusters (MapLibre GeoJSON source clustering). Clustering is configuration-driven and dataset-agnostic.
- When GraphData nodes carry geo fields, the overlay may render both **graph nodes** (points) and **graph edges** (lines) directly on the basemap, as a pure view projection of GraphData (no ingest-time derivation in the overlay).
- Geo fields are read from `GraphData` node properties when present (the module does not derive geo fields during ingest).
- “Fit to data” computes a bounded bbox and updates the overlay camera (optional animation).
- Regional camera, anchor, local-metre projection, and presentation-framing
  values are owned by the selected
  [ADM0 environment companion](./agentic-graph-adm0-singapore-prd-tad-ard.companion.md).
  Presentation bounds are never inferred as an administrative or legal
  boundary. Planar and volumetric views consume the companion's respective
  camera policies without moving camera ownership into the regional profile.
- In 3D render mode, the overlay auto-fits to active geo bounds so the globe doesn’t appear “blank” by default.
- In 3D render mode, when a graph selection contains geo-capable nodes, auto-fit prefers the selection bounds so Zoom-to-Selection stays aligned with the map.

### Reliability Notes

- The MapLibre instance is created once per enable-cycle (not on every dataset/graph update) to avoid cancelling in-flight style loads.
- In React dev StrictMode, effects mount/unmount twice; map creation is deferred to the next tick so the “probe” mount does not trigger aborted style requests.
- When enabling the overlay, if the persisted opacity is `0` the implementation restores a safe default opacity so the overlay cannot be “enabled but invisible”.
- Map style load failures are surfaced (console + toast) instead of silently producing a blank map.
- A persistent “blank overlay” state is prevented by warning when overlay opacity is `0%` and by timing out basemap load with a bounded error message.
- Cross-origin asset proxying is **dev-only**: on localhost, cross-origin map assets (style JSON, sprites, glyphs, tiles, and dataset fetches) can be routed through `/__fetch_remote` to avoid CORS issues; in production/static deploys the proxy does not exist, so assets must load directly.
- The `/__fetch_remote` proxy must not abort upstream fetches on request `close` events; premature aborts truncate style/tile/glyph responses and cause silent “blank basemap” failures in MapLibre.
- Style-relative URLs are resolved against a trailing-slash base (for example `.../styles/liberty/`) so `sprite`, `glyphs`, and `source.url` relative paths resolve correctly.
- Runtime overlay status is surfaced via a native in-app toast (top-right, below the toolbar) so it stays visible above the Floating Panel and other UI layers.
- Hover and click popups are rendered by MapLibre (not by the host UI) to keep POI feedback colocated with the map.
- The SVG fallback is an explicit host mode: ocean/land/frame styling is precomputed, the grid uses memoized `5°` minor and `15°` major graticule layers for higher visual fidelity, and the host must not regress to square raster tiles or other legacy fallback paths.
- If the basemap stays blank after refresh while requests succeed, the most common cause is a **0px-height overlay container** (e.g. `canvas=1728x0`). The overlay is mounted via a portal and forces viewport-sized layout (`100vw/100vh` with px fallbacks) and calls `map.resize()` to avoid this dead state.

### Troubleshooting: “Loaded” but blank

- Symptom: toast shows `styleLoaded=yes`, `tilesLoaded=yes`, `sourceLoaded=yes` but `canvas=...x0` and the basemap is invisible.
- Cause: the overlay DOM element has `height: 0` after refresh/layout transitions, so MapLibre has no drawable area.
- Fix: ensure the overlay is mounted at `document.body` (portal), forced to viewport size, and that `map.resize()` runs after style/load/resize events.

---

## User Journey

1. User loads a dataset into the graph.
2. In the extracted module UI, user enables the runtime overlay.
3. A translucent basemap overlay appears on top of the canvas. In MapLibre modes, the default style is MapLibre Demo Tiles unless the user applies a custom style URL.
4. User optionally configures interaction/projection/animation settings in the overlay panel UI.
5. User adds one or more dataset URLs via **Source Files** (Workspace Actions), optionally registering them as Geo layers to render additional map overlay layers.
   - For local Markdown Source Files, embedded fenced `geojson` code blocks (GeoJSON `FeatureCollection`) can also be registered as overlay datasets by extracting and uploading the blocks to the bounded local dataset cache.
   - For local JSON Source Files, record-style datasets (array-of-records or object-map records) can be converted into a derived GeoJSON Point FeatureCollection and registered as an overlay dataset.
   - For local Markdown itinerary documents (no embedded GeoJSON), implementations may derive POIs from headings + tokens (e.g. airport codes) and resolve coordinates using a bounded, in-memory index built from already-registered point datasets.
   - In the markdown workspace viewer, fenced `geojson` blocks can render an inline MapLibre preview (Render mode) using the same basemap/style loading behavior as Geospatial Mode.
6. User clicks **Fit to data** to move the basemap camera to the combined bounds of the active geo layers.

---

## Data Contract

### Graph Nodes

- Geo-capable nodes carry `node.properties.geo.lat` and `node.properties.geo.lng` as numbers.
- Geo is derived from dataset-agnostic shapes:
  - **GeoJSON**: `FeatureCollection | Feature | Geometry`
    - Each Feature becomes a graph node.
    - Point Features derive `properties.geo` from `[lng, lat]`.
  - **Records**: generic record datasets with common coordinate fields
    - Supported record containers include arrays of objects and object maps (key → record).
    - Supported coordinate shapes include `geo.{lat,lng}` and `lat/lng`, `latitude/longitude`.

### Map Overlay Datasets

- Dataset layers are stored as URL references and loaded at runtime.
- Same-origin dataset URLs may be produced by uploading local GeoJSON text (`/__geo_upload` → `/__geo_local/...`), including when the GeoJSON is embedded inside a local Markdown Source File as a fenced `geojson` block.
- The local upload handler must enforce a bounded byte limit and should be configurable (for example `AGENTIC_OS_LOCAL_GEO_DATASET_MAX_BYTES`) so large-but-common fixtures (≈20MB GeoJSON city datasets) remain supported without unbounded growth.
- Load is bounded by fetch size/time limits and uses best-effort parsing:
  - **GeoJSON**: Render directly.
  - **Records**: Derive a GeoJSON Point FeatureCollection when coordinate fields are detected.

---

## Implementation Map (Import → Render)

- agentic-graph pipeline (import → parse → store → render) remains in:
  - Parse routing: `canvas/src/features/parsers/default.ts` → `canvas/src/lib/graph/io/adapter.ts` (`parseGraph`)
  - Store commit: `canvas/src/hooks/store/graphDataSlice.ts` (`setGraphData`)
  - Render: `canvas/src/components/GraphCanvas.tsx` → `canvas/src/components/GraphCanvas/scene.ts`
- Extracted Geospatial Mode implementation lives in `gympgrph/src/`:
  - Overlay render + interaction gating: `gympgrph/src/features/geospatial/GeospatialOverlay.tsx`
  - Basemap lifecycle: `gympgrph/src/features/geospatial/useMapLibreBasemap.ts`
  - Dataset URL loading + layer creation: `gympgrph/src/features/geospatial/geospatialOverlayUtils.ts`
  - POI selection mapping: `gympgrph/src/features/geospatial/geospatialPoiSelection.ts`
  - Geo panel composition: `gympgrph/src/GeospatialPanelHost.tsx`
  - Geo panel display, dataset section, and shared UI:
    `gympgrph/src/GeospatialPanelDisplayControls.tsx`,
    `gympgrph/src/GeospatialPanelDatasetControls.tsx`, and
    `gympgrph/src/geospatialPanelUi.tsx`
  - Enhanced catalog UI:
    `canvas/src/features/geospatial/EnhancedLayerCatalogPanel.tsx`
  - Enhanced form, editor model, and catalog controller:
    `canvas/src/features/geospatial/EnhancedLayerEditorForm.tsx`,
    `canvas/src/features/geospatial/enhancedLayerEditorModel.ts`, and
    `canvas/src/features/geospatial/useEnhancedLayerCatalog.ts`
  - Host-to-package mutation bridge:
    `canvas/src/features/geospatial/gympgrphBridge.ts`
  - Geo derivation helpers: `gympgrph/src/lib/graph/geo/*` and `gympgrph/src/lib/geospatial/*`

---

## Configuration & Persistence

- Enhanced declarations use local-key-present → Vite environment → empty
  precedence. The environment initializes a clean profile; subsequent
  localStorage authoring remains operator-owned.
- The Geo panel reads the effective catalog and source, then routes Add, Edit,
  Remove, Toggle, and Reset through the extracted package's persistence owner.
  UI components never write localStorage directly.
- Add/Edit/Remove atomically write `kg:ui:geospatial:enhancedLayers`.
  Per-layer Toggle writes only
  `kg:ui:geospatial:enhancedLayerVisibility`. Successful actions synchronously
  publish the enhanced-layer change event so the same tab updates without
  reload.
- **Reset to environment defaults** removes both local keys before re-resolving
  environment → empty precedence. It is distinct from intentionally saving an
  empty local catalog.
- agentic-graph defines and reads the Geospatial Mode persistence keys so the host can gate rendering and keep embedded previews in sync, but the write-path lives in `gympgrph`’s store actions (e.g. `setGeospatialOverlayEnabled`).
- Runtime sync uses a shared UI event contract in `grph-shared`:
  - Event name: `GEOSPATIAL_MODE_CHANGED_EVENT`
  - Helpers: `emitGeospatialModeChanged` and `onGeospatialModeChanged`
- Persistence keys are namespaced to avoid collisions when multiple apps share the same origin:
  - `kg:ui:geospatial:*`
  - The primary host gate is `kg:ui:geospatial:overlayEnabled` (boolean).

### Host ↔ Preview sync (same-origin)

- **Same-document**: `gympgrph` dispatches `kg:geospatialModeChanged` as a `CustomEvent` when toggled so host UI (Toolbar/Canvas) can update immediately.
- **Cross-document**: `gympgrph` writes `kg:ui:geospatial:overlayEnabled` to `localStorage`, and the host listens for the browser `storage` event to keep other tabs and any external embedded preview iframe synchronized.

### Host Integration Notes

- `gympgrph` treats `maplibre-gl` as a host-level dependency (peer) to prevent duplicated nested installs and to allow the host bundler to prebundle the CommonJS/UMD build for ESM dev servers.
- `gympgrph` uses Tailwind utility classes in its UI (panel + overlay). When hosted inside agentic-graph, Tailwind must scan `gympgrph/src` so required classes (including stacking / pointer capture) are generated.
  - agentic-graph host config: `canvas/tailwind.config.js` includes `../gympgrph/src/**/*.{js,ts,jsx,tsx}` in `content`.
- The overlay container hardens critical layout properties (full-screen fixed positioning, z-index, pointer-events) via inline styles to avoid “map visible but non-interactive” failures when utility-class CSS is stale or missing.

### Dataset Fetch Limits (UI)

- Dataset fetch is always bounded by `timeoutMs` and `maxBytes` (user-configurable).
- Enhanced-layer fetches apply `min(timeoutMs, 10_000)` as their readiness
  deadline even when an operator configures a longer general dataset timeout.
- General dataset defaults remain available in **MainPanel Workflow → Step 3
  (Ingest) → Dataset fetch limits** and in the Geo panel Dataset section.
- Every enhanced catalog Add/Edit form separately exposes its mandatory
  per-entry `timeoutMs` and `maxBytes`; global defaults never silently replace
  missing enhanced bounds.
- Default `maxBytes` is sized to handle common public GeoJSON datasets (for example ~20MB city datasets) while still remaining bounded.
- If a dataset is too large (based on Content-Length when available), loading fails early with an actionable error instead of streaming indefinitely.
- Basemap style/tiles are fetched via the local `/__fetch_remote` proxy when running on localhost to avoid CORS issues; binary tile responses are served with a corrected Content-Length to prevent truncated PBF parsing errors.
- Dataset status shows streaming progress when Content-Length is available (bytes + %), and datasets can be reloaded via an icon action without remove/re-add.
- Enhanced network failures use the literal `network-unavailable` status and
  retain already-loaded sibling layers.

### Graph POI Styling (UI)

- Graph-node POIs are rendered as a dedicated overlay layer and are always clickable (an invisible hit layer is used to make selection reliable).
- The Map panel exposes color pickers for:
  - Graph POI color
  - Selected outline color

### Dataset Format (Auto)

- The dataset “format” selector is intentionally removed from the UI: parsing is auto-detected (GeoJSON first, then record-derived points).
- Record datasets support common coordinate shapes (e.g. `lat/lng`, `latitude/longitude`, `geo.{lat,lng}`, `location.{lat,lng}`, `geometry.coordinates`).

### Fit Behavior

- Map panel “Fit to data” is consolidated with existing fit/zoom commands:
  - When Geospatial Mode is active, zoom/fit commands route to the geospatial overlay camera and do not trigger graph-canvas zoom pipelines.
  - When Geospatial Mode is off, zoom/fit commands route to the active graph renderer.

### Host Auto-Enable (Import)

- agentic-graph can auto-enable Geospatial Mode immediately after a successful geo-capable import.
- This is controlled by `autoEnableGeospatialOnGeoImport` (persisted under `kg:ui:geospatial:autoEnableOnGeoImport`).

---

## Ordinary Multi-Dataset Demo (Airports + Countries + Cities)

**Purpose**: Show how to register three ordinary point/polygon Geo layers via
Source Files without hardcoding dataset URLs into production code. This is
separate from the structured **Enhanced layers** catalog for extrusions and 3D
assets.

> These are documentation-only examples. The application must not ship with
> hardcoded dataset URLs; users configure ordinary layers through Source Files
> and enhanced layers through the structured catalog or its environment seed.

### Step 1 — Prepare dataset URLs (outside of code)

- **Airports (records)**: public airports dataset in JSON (array or object-map of records with lat/lng fields).
- **Countries (GeoJSON)**: country polygons in GeoJSON.
- **Cities (records)**: city records (with coordinates) in JSON.

Import these URLs through Source Files. Do not embed them in compiled runtime
source.

### Step 2 — Register datasets as layers

In agentic-graph, open **MainPanel Workflow → Step 3 (Ingest) → Source Files**.
Add or select three Source File rows, import each URL, and use the Geo
toggle/checkbox to register it as an ordinary geospatial dataset. This path uses
the existing dataset model and helpers (`addGeospatialDatasetUrl(s)`,
`parseGeospatialDatasetFormat`, `loadDatasetFeatureCollection`).

### Step 3 — Enable Geospatial Mode (MapLibre overlay)

1. In the Canvas toolbar, click **Geospatial Mode** (Geo button) to open the Geo floating-panel tab.
2. Ensure the toolbar Geospatial Mode selection is active and interaction mode
   is `Always` (default).
3. Verify that the MapLibre basemap (default: OpenFreeMap Liberty) is visible as a translucent overlay on top of the 2D canvas.

At this point, Document Mode (graph canvases) and Geospatial Mode share the same GraphData and selection state, but the host enforces **mutual exclusivity**: when Geospatial Mode is enabled, graph canvases are unmounted so they cannot run background rendering/recalculation or consume shared requests.

### Step 4 — Observe multi-layer overlay + clustering

1. In Source Files, confirm that all three rows remain registered for Geo.
2. Ensure each Source File Geo toggle is **enabled**:
   - Countries (GeoJSON polygons) should render as polygon/line layers (fill + outline).
   - Airports / Cities (records) should render as point layers derived from record coordinates.
3. Clustering is optional for ordinary point datasets and is not part of the
   enhanced-layer catalog acceptance gate.

The MapLibre overlay now shows three simultaneous layers:

- A polygon layer for country boundaries.
- A clustered point layer for airports.
- A clustered point layer for cities.

### Step 5 — Use “Fit to data” and verify automatic bounds

1. In the Geo panel, click **Fit to data**.
2. The overlay computes combined bounds across all active datasets (Airports + Countries + Cities) using `computeBoundsFromCollections` (Turf `bbox` under the hood).
3. The MapLibre camera animates (if enabled) to show all layers in a single view:
   - In **2D** render mode, the map uses the same world bounds as the canvas, so graph-first affordances remain intact.
   - In **3D** render mode, the overlay prefers selection bounds if a geo-capable graph selection exists; otherwise it uses dataset bounds.

### Step 6 — Keep configuration neutral and bounded

- Ordinary dataset URLs come from Source Files user input. Enhanced extrusion
  and asset URLs come from the structured catalog or its environment seed.
  Neither is compiled into runtime source.
- Fetch behavior remains bounded:
  - `geospatialDatasetTimeoutMs` and `geospatialDatasetMaxBytes` control timeout and max bytes.
  - Oversized or slow datasets fail with clear, actionable messages (no infinite fetch loops).
- The same pipeline accepts any Airports/Countries/Cities-style dataset that respects the coordinate contract, not just the example sources above.
