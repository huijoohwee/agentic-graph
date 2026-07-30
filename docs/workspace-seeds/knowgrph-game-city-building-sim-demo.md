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
  canonical_consumers: ["workspace", "geo-xr-mode", "city-builder", "maplibre-flight-overlay"]
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
  schema_id: "knowgrph-city-grid/v1"
  runtime_owner: "one browser-local City Runtime"
  surface_owner: "native MapLibre Geo+XR surface wrapped by CitySimMediaFigure"
  fixed_step_ms: 1000
  world_ownership: "overlay-only"
  renderer_rule: "reuse one native MapLibre map; mount zero City Three Canvas"
  gameplay_surface_rule: "use the shared exclusive-overlay lifecycle"
  lifecycle: ["open", "start", "stop", "restart", "zone", "advise", "save", "reset", "exit"]
  zone_types: ["unzoned", "residential", "commercial", "industrial"]
  source_authored_only: true
  runtime_dependencies_added: 0
city_geo_xr:
  surface_owner: "Geo+XR Mode"
  geo_host_owner: "native MapLibre Geo host"
  geo_policy_owner: "canvas/src/components/CanvasViewportGeospatialOverlay.tsx"
  city_surface_owner: "native MapLibre Geo+XR host wrapped by the City semantic media figure"
  parcel_input_owner: "City Builder coordinate controls"
  composition: "one native MapLibre map with its existing Flight Geo source and layers; zero City Three Canvas"
  native_xr_physics_stage_active: false
  authored_graph_scene_active: false
  duplicate_map_or_canvas_forbidden: true
city_semantic_media:
  owner: "canvas/src/features/game-city-sim/CitySimMediaFigure.tsx"
  child_owner: "canvas/src/components/CanvasViewportGeospatialOverlay.tsx"
  element: "figure"
  accessible_name: "Interactive City simulation media stage"
  selection_marker_owner: "canvas/src/lib/cards/mediaPreviewSurfaceSelection.ts"
  selection_marker_when: "City runtime active only"
  pointer_capture_owner: "none; MapLibre owns Geo+XR viewport gestures and City Builder coordinate controls own parcel selection"
  wrapper_added_generic_div_or_aria_hidden_forbidden: true
city_aerial_projection:
  behavior: "deterministic read-only stopped aircraft and route"
  phase: "stopped"
  spatial_source: "current selected authored XR spatial profile"
  environment: null
  adapter_owner: "canvas/src/features/game-city-sim/citySimAerialInspectionProjection.ts"
  adapter_function: "projectCitySimAerialInspectionToGeospatialOverlay"
  flight_projection_owner: "canvas/src/features/game-flight-sim/flightSimGeospatialProjection.ts"
  overlay_store_owner: "gympgrph/src/flightGeoOverlay.ts"
  maplibre_projection_owner: "gympgrph/src/flightGeoOverlayMapLibre.ts"
  shared_publisher_owner: "canvas/src/components/CanvasViewportGeospatialOverlay.tsx"
  flight_gameplay_active: false
  flight_readiness_claimed: false
  duplicate_source_or_layers_forbidden: true
city_camera:
  framing: "native MapLibre camera in Geo+XR"
  projection: "MapLibre"
  canvas_mode: "geo-xr"
  owner: "native MapLibre Geo host"
  resize_rule: "native MapLibre viewport handling"
city_default:
  city_name: "Civic Seed"
  rows: 4
  columns: 4
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
    media: "palette and parcel appearance; handoff to City Builder"
    animation: "fixed-step playback and Start or Stop delegation"
    motionControl: "normalized input and selected parcel"
    gameMode: "exclusive city-overlay state and enter or exit handoff"
    flightSim: "read-only aerial-inspection handoff; no second city world"
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
  path: "/game-city-sim/city-grid.md"
  schema_id: "knowgrph-city-grid/v1"
  format: "ordered KGC frontmatter plus canonical CSV parcel table"
  save_policy: "explicit Save only"
  verification: "write, read same path, compare bytes, parse, compare committed state"
  malformed_policy: "preserve bytes; block Start and Restart; Reset changes memory only"
invocation:
  prefix: "/game.city @canvas #civic"
  keys: ["operation", "parcel", "type", "scope"]
  operations: ["open", "start", "stop", "restart", "zone", "advise", "save", "reset", "exit"]
  zone: "/game.city @canvas #civic operation=zone parcel=<rNNcNN> type=residential|commercial|industrial"
  advise: "/game.city @canvas #civic operation=advise scope=parcel|district"
  rejection: "typed diagnostic and no state mutation"
mcp:
  schema_id: "knowgrph-city-sim-mcp/v1"
  inspect_tool: "knowgrph.inspect_local_city_sim"
  control_tool: "knowgrph.control_local_city_sim"
  tool_count: 2
  transport: "existing local discovery and approval-gated control owners"
proof_contract:
  start: "neutral browser with no environment-selected or persisted city state"
  activation: "apply this Source File after Source Files bootstrap is ready"
  assertions: ["Geo+XR Mode", "one native MapLibre Geo host wrapped by CitySimMediaFigure", "native MapLibre camera and gestures", "City Builder coordinate parcel input", "zero City Three Canvas, stage, mesh, or camera", "stopped aircraft and route through existing Flight Geo layers", "Flight gameplay and readiness inactive", "no duplicate map, source, or layers", "authored metrics", "clean console"]
  actions: ["Zone", "one Tick", "Stop fence", "Advice", "Save and read-back", "six panel projections", "Exit restore"]
  exact_sha_required: true
  repeatability: "repeat from neutral state and compare initial serialized bytes"
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
    - id: {key: id, type: string, value: "city_grid"}
      type: {key: type, type: string, value: "CityGrid"}
      label: {key: label, type: string, value: "Deterministic Parcel Grid"}
      position: {key: position, type: object, value: {"x":0,"y":40}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:city_grid"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Zone a parcel, commit one deterministic economy tick, and inspect the shared revision."}
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
renderer, camera, and viewport gestures. `CitySimMediaFigure` wraps that
geospatial projection directly as a labeled semantic City media stage; City
mounts zero Three.js/React Three Fiber Canvas, stage, mesh, camera, or pointer
handler. City Builder coordinate controls own parcel selection.

City also uses `projectCitySimAerialInspectionToGeospatialOverlay` to derive one
deterministic route and one stopped aircraft from the current selected authored
XR spatial profile. The shared `CanvasViewport` geospatial publisher sends that
result with a null XR environment through the existing Flight projector,
overlay store, and MapLibre source/layers. The pure City adapter does not open Flight
gameplay, accept Flight controls, advance a mission, or claim Flight
runtime/readiness. The shared publisher retains its normal Flight subscriptions
for arbitration. City creates no duplicate map, map source/layer, Canvas, or
renderer.

City never starts or retains the native XR physics playground. The Three
renderer excludes the authored/native graph for City source intent, and City
mounts no Three scene. One labeled semantic `figure` wraps the native MapLibre
Geo+XR host directly and exposes the existing media-selection marker only while
City is active. It has a `figcaption` and no pointer capture, and its wrapper
adds no generic `div` or `aria-hidden`, so selection tooling can find the stage
without stealing MapLibre gestures or City Builder parcel input.

The normative requirements live at
`.kiro/specs/knowgrph-city-building-sim/requirements.md`. This document does
not establish runtime readiness by declaration. Its status stays
`proof-pending` until focused tests and neutral browser evidence pass at the
exact candidate SHA.

## Authored default parcel fixture

The runtime default factory and codec test must serialize exactly this parcel
table under the KGC header described in frontmatter:

```csv
parcel_id,row,column,zone,land_value_cents,population,pollution
r00c00,0,0,residential,10000,10,0
r00c01,0,1,commercial,9000,5,0
r00c02,0,2,unzoned,5000,0,0
r00c03,0,3,unzoned,5000,0,0
r01c00,1,0,industrial,7000,0,2
r01c01,1,1,unzoned,5000,0,0
r01c02,1,2,unzoned,5000,0,0
r01c03,1,3,unzoned,5000,0,0
r02c00,2,0,unzoned,5000,0,0
r02c01,2,1,unzoned,5000,0,0
r02c02,2,2,unzoned,5000,0,0
r02c03,2,3,unzoned,5000,0,0
r03c00,3,0,unzoned,5000,0,0
r03c01,3,1,unzoned,5000,0,0
r03c02,3,2,unzoned,5000,0,0
r03c03,3,3,unzoned,5000,0,0
```

## Local use

1. Run the repository-owned development command.
2. Start from a browser with no city demo environment selector, persisted city
   state, URL selection, or previously open city runtime.
3. Confirm City Builder is closed, the City media figure is presentational and
   inactive, and Flight gameplay is inactive.
4. Open Explorer -> Source Files and wait for bootstrap readiness.
5. Open this document and apply it.
6. Confirm Geo+XR Mode keeps native MapLibre unobscured with its stopped
   aircraft and route overlay, then confirm City Builder opens with tick `0`, treasury `100000`
   cents, population `15`, and the 4 by 4 fixture.
7. Confirm the existing Flight Geo layers show the selected authored XR
   profile's route and stopped aircraft without opening Flight gameplay or
   readiness.

The simulation does not auto-start and does not auto-save.

## Core loop

Select `r00c02`, assign a zone, Start, observe one committed tick, then Stop.
The next tick uses the exact v1 coefficients in frontmatter. Stop must fence
queued ticks. Advice returns at most two local heuristic rounds and never
changes a parcel by itself.

Save writes only `/game-city-sim/city-grid.md`, reads that path back, compares
bytes and parsed state, and reports success only after both comparisons pass.
Malformed existing bytes remain untouched and block Start/Restart; Reset
selects this authored fixture in memory without overwriting the path.

## FloatingPanel checks

All projections must report the same runtime revision:

- Media: palette and parcel appearance;
- Animation: fixed-step playback;
- Motion Control: normalized input and selected parcel;
- Game Mode: exclusive city-overlay state;
- Flight Sim: read-only City aerial handoff with no Flight gameplay or second
  city world;
- Camera: native MapLibre framing.

City Builder remains the complete editing surface. Exit restores the prior
FloatingPanel/Canvas surface state exactly once and neither captures nor
restores a Three camera.

## Validation status

- [ ] Focused economy, codec, Advisor, invocation, runtime, MCP, routing, and
  type checks pass at the exact candidate SHA.
- [ ] Neutral proof records City Builder closed and the City media figure
  presentational/inactive before applying this Source File.
- [ ] Source application alone selects Geo+XR, retains one native MapLibre host
  wrapped by `CitySimMediaFigure`, and loads the authored fixture in City
  Builder.
- [ ] MapLibre gestures remain available, City Builder controls parcel input,
  zero City Three.js/R3F Canvas/stage/mesh/camera mounts, and the existing
  Flight Geo source/layers show the deterministic route and stopped aircraft
  with no duplicate map/source/layer or active Flight gameplay/readiness.
- [ ] The native XR physics playground and authored graph scene remain absent,
  the Flight XR environment source is empty, and the active City media `figure`
  is named and selectable without intercepting MapLibre gestures.
- [ ] Zone, one Tick, Stop fencing, Advice, and Save/read-back pass.
- [ ] Media, Animation, Motion Control, Game Mode, Flight Sim, and Camera show
  one shared revision and their contracted projections.
- [ ] Browser console remains free of runtime errors.
- [ ] Exit restores the prior FloatingPanel/Canvas surface state exactly once.
- [ ] A second neutral run produces byte-identical initial serialization.
- [ ] Protected integration completes for the verified candidate.

No box may be checked from source inspection alone. Protected integration,
production publication, and cloud release remain separate gates, and this
increment grants none of those release actions.
