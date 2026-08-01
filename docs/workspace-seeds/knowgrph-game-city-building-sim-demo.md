---
title: "Knowgrph City Simulation"
doc_type: "Workspace Demo"
status: "proof-pending"
runtime_status: "proof-pending"
runtime_claim: "none until exact-head focused tests and neutral browser proof pass"
evidence_status: "pending"
publish_scope: "local-only"
authority_role: "derived runtime activation and proof projection"
normative_kiro_authority: "/.kiro/specs/knowgrph-city-building-sim/requirements.md"
kgCanvasSurfaceMode: "geo-xr"
kgCanvasRenderMode: "3d"
kgCanvas3dMode: "xr"
kgFloatingPanelOpen: true
kgFloatingPanelView: "cityBuilder"
kgBottomPanelOpen: false
kgBottomPanelTab: "timeline"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
run_ready_demo:
  id: "city-sim"
  activation: "applied-source-document"
  identity_authority: "source-authored run_ready_demo.id"
  imported_path_alias_required: false
  identity_conflict: "fail closed when a known path and source identity disagree"
  canonical_consumers: ["workspace", "geo-xr-mode", "city-builder", "city-maplibre-overlay"]
  dev_command: "npm run dev"
  canonical_source_file: "/docs/workspace-seeds/knowgrph-game-city-building-sim-demo.md"
  env_selector: "VITE_KNOWGRPH_RUN_READY_DEMO=city-sim"
  validation_seed_path: "/knowgrph-game-city-building-sim-demo.md"
  source_root: "knowgrph/docs"
  source_backed: true
  clean_canvas_recommended: true
  native_runtime: true
  presentation: "native-maplibre-geo-xr-city-surface"
  document_presentation: "proof-pending-workspace-demo"
  auto_start: false
  external_dependencies: []
  forbid_external_copy_or_dependency: true
city_runtime:
  schema_id: "knowgrph-city-poi-zoning/v1"
  runtime_owner: "one browser-local City Runtime"
  surface_owner: "native MapLibre Geo+XR surface wrapped by SemanticMediaFigure"
  fixed_step_ms: 1000
  world_ownership: "overlay-only"
  renderer_rule: "reuse one native MapLibre map; create or activate zero City Three presentation; any retained shared Canvas remains inactive, invisible, and pointer-transparent"
  gameplay_surface_rule: "use the shared exclusive-overlay lifecycle"
  lifecycle: ["open", "start", "stop", "restart", "zone", "advise", "save", "reset", "exit"]
  zone_types: ["unzoned", "residential", "commercial", "industrial"]
  source_authored_only: true
  runtime_dependencies_added: 0
city_regional_poi_zoning:
  profile_identity_source: "city_initial.regional_poi_profile_id"
  surface_owner: "Geo+XR Mode"
  geo_host_owner: "native MapLibre Geo host"
  geo_policy_owner: "canvas/src/components/CanvasViewportGeospatialOverlay.tsx"
  city_surface_owner: "native MapLibre Geo+XR host wrapped by the City semantic media figure"
  basemap_owner: "one real native MapLibre basemap"
  parcel_input_owner: "one City Runtime selectedParcelId shared by MapLibre POI clicks and City Builder POI controls"
  parcel_identity_policy: "each parcel_id exactly equals one RegionalPoiIdentity.id from the selected profile; one-to-one coverage; no alias or remap"
  ordering_policy: "row and column are deterministic UI ordering only and never geometry"
  composition: "one real native MapLibre basemap with companion-owned regional geographic POI surfaces carrying read-only City zoning state; existing Flight aircraft and route layers remain independently owned; zero City-authored geometry, Flight data, Three presentation, or HTML POI markers"
  layer_order: ["regional-context", "city", "flight"]
  native_xr_physics_stage_active: false
  authored_graph_scene_active: false
  duplicate_map_or_canvas_forbidden: true
city_poi_zoning_projection:
  source_owner: "gympgrph/src/cityGeoOverlay.ts"
  source_id: "kg-city-sim:geo-overlay"
  layer_owner: "gympgrph/src/cityGeoOverlayMapLibre.ts"
  layers: ["fill", "extrusion", "outline", "selected-poi"]
  state_owner: "one live City Runtime snapshot"
  framing_owner: "gympgrph/src/cityGeoOverlayMapLibreController.ts"
  camera_policy: "fit the selected regional POI profile bounds into the visible panel-adjusted aperture and restore prior padding"
  duplicate_source_or_layer_ids_forbidden: true
regional_geographic_poi_projection:
  profile_identity_source: "city_initial.regional_poi_profile_id"
  profile_fact_authority: "/docs/documents/knowgrph-adm0-singapore-prd-tad-ard.companion.md"
  source_id: "kg-geo-xr:regional-poi"
  layers: ["kg-geo-xr:regional-poi:fill", "kg-geo-xr:regional-poi:extrusion", "kg-geo-xr:regional-poi:outline", "kg-geo-xr:regional-poi:locator", "kg-geo-xr:regional-poi:label"]
  feature_contract: "companion-authored exact geographic Polygon rings with real-metre base/height, accuracy, and provenance plus one topology-aware representative Point locator per POI"
  presentation_policy: "read-only MapLibre regional-context band below City parcels and Flight route/aircraft; surface-only massing plus fixed-pixel locators and collision-aware variable-anchor labels"
  storage_policy: "checked-in"
  runtime_network_required: false
  city_fact_ownership: false
  local_xr_environment_identity: false
  three_r3f_or_html_marker_forbidden: true
city_semantic_media:
  owner: "canvas/src/lib/cards/SemanticMediaFigure.tsx"
  child_owner: "canvas/src/components/CanvasViewportGeospatialOverlay.tsx"
  native_canvas_semantic_owner: "gympgrph/src/features/geospatial/mapLibreCanvasSemanticOwner.ts"
  element: "figure"
  accessible_name: "Interactive City simulation media stage"
  selection_marker_owner: "canvas/src/lib/cards/mediaPreviewSurfaceSelection.ts"
  selection_target: "live MapLibre canvas while City runtime active"
  direct_canvas_accessible_name_required: true
  figure_selection_marker_forbidden: true
  pointer_capture_owner: "none; MapLibre owns Geo+XR viewport gestures and City Builder POI controls own parcel selection"
  wrapper_added_generic_div_or_aria_hidden_forbidden: true
city_camera:
  framing: "selected regional geographic POI bounds in the visible MapLibre aperture"
  projection: "MapLibre"
  canvas_mode: "geo-xr"
  owner: "native MapLibre Geo host"
  resize_rule: "observe the map and occluding workspace panels, refit without cumulative padding, restore prior padding on handoff"
city_initial:
  city_name: "Civic Seed"
  regional_poi_profile_id: "adm0:SGP:major-pois/v1"
  rows: 2
  columns: 3
  tick: 0
  treasury_cents: 100000
  tax_rate_basis_points: 1000
  selected_parcel_id: null
  run_state: "ready"
economy_v1:
  residential: {population_delta: 2, land_value_delta_cents: 200, pollution_delta: 0}
  commercial: {population_delta: 1, land_value_delta_cents: 100, pollution_delta: 0}
  industrial: {population_delta: 0, land_value_delta_cents: -50, pollution_delta: 1}
  unzoned: {population_delta: 0, land_value_delta_cents: 0, pollution_delta: 0}
  tax_revenue: "floor(total_population * tax_rate_basis_points / 100)"
  treasury_delta: "tax_revenue + 300 * commercial_count + 500 * industrial_count - 100 * zoned_count"
  commit: "validate a complete safe-integer candidate, then atomically publish all or none"
floating_panel:
  primary_view: "cityBuilder"
  primary_controls: ["Open", "Start", "Stop", "Restart", "Zone", "Advise", "Save", "Reset", "Exit"]
  shared_snapshot: "all projections subscribe to one immutable City Runtime revision"
  projections:
    media: "palette and regional POI zoning appearance; handoff to City Builder"
    animation: "fixed-step playback and Start or Stop delegation"
    motionControl: "normalized input and selected regional POI"
    gameMode: "exclusive city-overlay state and enter or exit handoff"
    flightSim: "independently owned existing Flight overlay status; no City-authored aircraft or route"
    camera: "native MapLibre framing"
advisor:
  implementation: "deterministic browser-local heuristic"
  loop: "generate -> select -> clarify -> evolve"
  round_cap: 2
  scopes: ["parcel", "district"]
  tie_rule: "clarify when top-two delta is below epsilon; no parcel mutation"
  cap_resolution: "greater current land value, then lexicographically smaller parcel id; retain tie flag"
  model: "none"
  prompt_tokens: 0
  completion_tokens: 0
  estimated_cost_usd: 0
persistence:
  owner: "existing WorkspaceFs"
  path: "/game-city-sim/city-poi-zoning.md"
  schema_id: "knowgrph-city-poi-zoning/v1"
  format: "ordered KGC frontmatter plus canonical CSV parcel table"
  save_policy: "explicit Save only"
  verification: "write, read same path, compare bytes, parse, compare committed state"
  malformed_policy: "preserve bytes; block Start and Restart; Reset changes memory only"
invocation:
  prefix: "/game.city @canvas #civic"
  keys: ["operation", "parcel", "type", "scope"]
  operations: ["open", "start", "stop", "restart", "zone", "advise", "save", "reset", "exit"]
  zone: "/game.city @canvas #civic operation=zone parcel=<regional-poi-identity-id> type=residential|commercial|industrial"
  advise: "/game.city @canvas #civic operation=advise scope=parcel|district"
  rejection: "typed diagnostic and no state mutation"
mcp:
  schema_id: "knowgrph-city-sim-mcp/v1"
  inspect_tool: "knowgrph.inspect_local_city_sim"
  control_tool: "knowgrph.control_local_city_sim"
  tool_count: 2
  transport: "existing local discovery and approval-gated control owners"
proof_contract:
  start: "neutral browser with the native MapLibre basemap, no persisted city state, no Flight-local XR environment source/layers, no kg-city-sim:geo-overlay source/layers, and no kg-geo-xr:regional-poi source/layers"
  activation: "apply this Source File after Source Files bootstrap is ready"
  assertions: ["Geo+XR Mode", "one real native MapLibre basemap wrapped by SemanticMediaFigure", "live MapLibre canvas has the direct City accessible name and sole selection marker", "all exact companion-selected regional geographic POI surfaces plus one visible fixed-pixel identity locator and label per POI", "six City parcels keyed one-to-one by canonical RegionalPoiIdentity ids", "visible City zone and selection layers on companion-owned POI geometry", "no City-authored geographic or Flight fields", "regional-context then City then independently owned Flight layer order", "regional POI MapLibre framing and gestures", "zero City-created, active, or visible Three stage, mesh, camera, or pointer owner; retained shared canvas is inactive and pointer-transparent", "zero HTML POI marker, generic selectable wrapper, or aria-hidden decoration", "Flight bootstrap, camera, gameplay, and readiness inactive", "no duplicate map or source/layer ids", "authored metrics", "clean console"]
  actions: ["Select POI", "Zone", "one Tick", "Stop fence", "Advice", "Save and read-back", "six panel projections", "Exit clears City-selected regional presentation and restores prior regional/FloatingPanel/Canvas state exactly once"]
  exact_sha_required: true
  repeatability: "repeat from neutral state and compare initial serialized bytes and regional feature/provenance digest"
release_boundary:
  development_only: true
  protected_integration_is_separate: true
  production_release_is_separate: true
  cloud_release_is_separate: true
flow:
  direction: {key: direction, type: string, value: "LR"}
  edgeType: {key: edgeType, type: string, value: "smoothstep"}
  balancedViewportPreset: {key: balancedViewportPreset, type: string, value: "widgetFrontmatter"}
  nodes:
    - id: {key: id, type: string, value: "city_source"}
      type: {key: type, type: string, value: "CitySourceActivation"}
      label: {key: label, type: string, value: "Apply City Source"}
      position: {key: position, type: object, value: {"x":0,"y":-180}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:city_source"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Apply this source from a neutral workspace to request City Builder activation."}
      state: {key: state, type: string, value: "proof-pending"}
    - id: {key: id, type: string, value: "city_poi_zoning"}
      type: {key: type, type: string, value: "CityPoiZoning"}
      label: {key: label, type: string, value: "Deterministic POI Zoning"}
      position: {key: position, type: object, value: {"x":0,"y":40}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:city_poi_zoning"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Zone a canonical regional POI, commit one deterministic economy tick, and inspect the shared revision."}
      state: {key: state, type: string, value: "proof-pending"}
    - id: {key: id, type: string, value: "city_save"}
      type: {key: type, type: string, value: "CitySaveReadback"}
      label: {key: label, type: string, value: "Save and Read Back"}
      position: {key: position, type: object, value: {"x":0,"y":260}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:city_save"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Save canonical KGC plus CSV and verify the same WorkspaceFs path."}
      state: {key: state, type: string, value: "proof-pending"}
  edges:
---

# Knowgrph City Simulation

This Source Files document is the derived local activation and proof projection
for a deterministic city simulation. Applying it requests `cityBuilder` and
Geo+XR Mode. The existing native MapLibre Geo host owns the geographic visual
renderer, camera, and viewport gestures. `SemanticMediaFigure` wraps that
geospatial projection directly as a labeled semantic City media stage; City
creates and activates zero Three.js/React Three Fiber stage, mesh, camera, or
pointer owner. Any retained shared Canvas remains invisible, inactive, and
pointer-transparent. MapLibre POI clicks and City Builder controls dispatch
to the same City Runtime selection owner.

The source parser initializes one POI-zoning state from this document. Its
`regional_poi_profile_id` resolves one immutable geographic profile whose
identities, exact rings, real-metre heights, accuracy, and provenance remain
solely in the selected companion. Every City `parcel_id` must equal exactly one
`RegionalPoiIdentity.id`, and the six rows must cover that selected profile
one-to-one in profile order. Row and column fields are deterministic UI order
only; they never generate, position, scale, rotate, or otherwise modify
geometry. `kg-city-sim:geo-overlay` projects only live zone and selection state
onto the companion-owned surfaces. City authors no geographic anchor,
dimensions, gaps, bearing, route, aircraft, or height.

The existing MapLibre host and regional POI utilities own geographic context
and camera framing. Existing Flight route and aircraft overlays remain
independently owned and may compose above City without City copying, adapting,
or activating Flight data. City does not project a Flight-local XR environment
or install Flight bootstrap, camera, padding, gameplay, controls, mission, or
readiness. City creates no duplicate map, source/layer ids, Canvas, renderer,
or parallel HTML POI marker layer.

City never starts the native XR physics playground. The Three renderer excludes
the authored/native graph for City source intent, and any retained shared
Canvas remains inactive, invisible, and pointer-transparent. One labeled
semantic `figure` wraps the native MapLibre
Geo+XR host directly. Its live MapLibre `canvas` carries the direct City
accessible name and the sole media-selection marker while City is active; the
figure keeps its `figcaption` but carries no competing selection marker. Neither
wrapper nor canvas adds `aria-hidden` or captures pointer input, so selection
tooling can identify the stage without stealing MapLibre gestures or City
Builder POI input. No generic replacement wrapper or regional HTML marker
creates a competing selection target.

The normative requirements live at
`.kiro/specs/knowgrph-city-building-sim/requirements.md`. This document does
not establish runtime readiness by declaration. Its status stays
`proof-pending` until focused tests and neutral browser evidence pass at the
exact candidate SHA.

## Authored initial POI zoning

The source parser must initialize the City Runtime from exactly this POI-zoning
table and the `city_initial` metadata in frontmatter:

```csv
parcel_id,row,column,zone,land_value_cents,population,pollution
marina-bay-sands,0,0,residential,10000,10,0
singapore-flyer,0,1,commercial,9000,5,0
gardens-by-the-bay,0,2,unzoned,5000,0,0
esplanade-theatres-on-the-bay,1,0,industrial,7000,0,2
the-fullerton-hotel,1,1,unzoned,5000,0,0
raffles-hotel,1,2,unzoned,5000,0,0
```

## Local use

1. Run the repository-owned development command.
2. Start from a browser with the native MapLibre basemap, no persisted city
   state, no URL selection, and no previously open city runtime.
3. Confirm City Builder is closed, the City media figure is presentational and
   inactive, and Flight gameplay is inactive.
4. Open Explorer -> Source Files and wait for bootstrap readiness.
5. Open this document and apply it.
6. Confirm Geo+XR Mode shows every companion-selected regional geographic POI
   surface at its exact rings and real-metre height plus one visible fixed-pixel
   identity locator and label per POI, with the six source-authored zoning
   states projected onto those exact surfaces. Confirm no City-authored
   geographic or Flight data exists and the camera frames the regional
   features. Then confirm City Builder opens with tick `0`,
   treasury `100000` cents, and population `15`.
7. If the existing Flight Geo overlay is present, confirm it remains
   independently owned and no City source field controls its route or aircraft.

The simulation does not auto-start and does not auto-save.

## Core loop

Select `gardens-by-the-bay`, assign a zone, Start, observe one committed tick,
then Stop.
The next tick uses the exact v1 coefficients in frontmatter. Stop must fence
queued ticks. Advice returns at most two local heuristic rounds and never
changes a parcel by itself.

Save writes only `/game-city-sim/city-poi-zoning.md`, reads that path back, compares
bytes and parsed state, and reports success only after both comparisons pass.
Malformed existing bytes remain untouched and block Start/Restart; Reset
restores this authored POI zoning in memory without overwriting the path.

## FloatingPanel checks

All projections must report the same runtime revision:

- Media: palette and regional POI zoning appearance;
- Animation: fixed-step playback;
- Motion Control: normalized input and selected regional POI;
- Game Mode: exclusive city-overlay state;
- Flight Sim: independently owned existing Flight overlay status with no
  City-authored aircraft or route;
- Camera: native MapLibre framing.

City Builder remains the complete editing surface. Exit restores the prior
FloatingPanel/Canvas surface state exactly once and neither captures nor
restores a Three camera.

## Validation status

- [ ] Focused economy, codec, Advisor, invocation, runtime, MCP, routing, and
  type checks pass at the exact candidate SHA.
- [ ] Neutral proof records City Builder closed and the City media figure
  presentational/inactive before applying this Source File, with no
  Flight-local XR environment source/layers, no
  `kg-city-sim:geo-overlay` source/layers, and no `kg-geo-xr:regional-poi`
  source/layers.
- [ ] Source application alone selects Geo+XR, retains one native MapLibre host
  wrapped by `SemanticMediaFigure`, and loads the authored POI zoning in City
  Builder.
- [ ] Six live POI zoning features render through the City source/layers;
  MapLibre clicks and City Builder controls share POI selection; one zone
  and selection mutation is visible; and zero City-created, active, or visible
  Three.js/R3F stage/mesh/camera mounts. Any retained shared canvas is inactive
  and pointer-transparent.
- [ ] The real native MapLibre basemap remains the only geographic renderer.
  The companion-selected regional geographic POI collection preserves its
  exact rings, real-metre heights, accuracy, and provenance below City parcels,
  plus one visible identity locator and label per POI; the MapLibre camera
  frames the selected POI profile. No selected
  Flight-local XR environment source or features exist in the City
  presentation. City authors no geometry, height, anchor, dimensions, gaps,
  bearing, route, or aircraft; independent existing Flight source/layers may
  compose above City without Flight bootstrap, camera, padding, gameplay,
  readiness, or duplicate
  map/source/layer ids.
- [ ] The native XR physics playground and authored graph scene remain inactive;
  the active City media `figure` retains its caption, and the live MapLibre
  `canvas` carries the direct City accessible name and sole selection marker
  without intercepting MapLibre gestures. No active or visible City-created
  Three.js/R3F presentation, HTML POI marker, generic selectable wrapper, or
  `aria-hidden` decoration competes with it; any retained shared canvas is
  inactive and pointer-transparent.
- [ ] Zone, one Tick, Stop fencing, Advice, and Save/read-back pass.
- [ ] Media, Animation, Motion Control, Game Mode, Flight Sim, and Camera show
  one shared revision and their contracted projections.
- [ ] Browser console remains free of runtime errors.
- [ ] Exit removes the City zoning source/layers, clears the City-selected
  regional presentation without mutating its companion facts, and restores
  prior regional, FloatingPanel, and Canvas state exactly once.
- [ ] A second neutral run produces byte-identical initial serialization and
  an equal regional feature/provenance digest.
- [ ] Protected integration completes for the verified candidate.

No box may be checked from source inspection alone. Protected integration,
production publication, and cloud release remain separate gates, and this
increment grants none of those release actions.
