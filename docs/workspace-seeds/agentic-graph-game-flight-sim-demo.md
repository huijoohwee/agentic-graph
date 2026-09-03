---
title: "agentic-graph Native Flight Sim"
doc_type: "Workspace Demo"
status: "runtime-ready"
runtime_status: "runtime-ready"
runtime_claim: "local-runtime-ready"
evidence_status: "exact-head source and browser proof required at every handoff"
publish_scope: "local-only"
authority_role: "derived runtime activation/proof projection"
normative_kiro_authority: "/.kiro/specs/agentic-graph-game-flight-sim/"
workspace_root_kiro_projection: "byte-identical local projection only; never a second authority"
kgCanvasSurfaceMode: "geo-xr"
kgCanvasRenderMode: "3d"
kgCanvas3dMode: "xr"
kgFloatingPanelOpen: true
kgFloatingPanelView: "flightSim"
kgBottomPanelOpen: false
kgBottomPanelTab: "timeline"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
run_ready_demo:
  id: "flight-sim"
  activation: "applied-source-document"
  identity_authority: "source-authored run_ready_demo.id"
  imported_path_alias_required: false
  identity_conflict: "fail closed when path and source identity disagree"
  canonical_consumers: ["workspace", "geo-xr-mode"]
  dev_command: "npm run dev"
  canonical_source_file: "/docs/workspace-seeds/agentic-graph-game-flight-sim-demo.md"
  env_selector: "VITE_AGENTIC_OS_RUN_READY_DEMO=flight-sim"
  validation_seed_path: "/agentic-graph-game-flight-sim-demo.md"
  source_root: "agentic-graph/docs"
  source_backed: true
  clean_canvas_recommended: true
  native_runtime: true
  presentation: "shared-geo-xr-gameplay-overlay"
  document_presentation: "runtime-ready-workspace-demo"
  auto_start: true
  external_dependencies: []
  forbid_external_copy_or_dependency: true
shared_xr_scene:
  source_authority: "/docs/workspace-seeds/agentic-graph-physics-playground-demo.md"
  world_ownership: "overlay-only"
  surface_owner: "Geo+XR Mode"
  renderer_owner: "canvas/src/lib/three/ThreeGraph.impl.tsx"
  collider_owner: "canvas/src/features/three/xrCanonicalSceneSpatialSource.ts"
  camera_owner: "canvas/src/features/three/useXrNativeControllerDemoCamera.ts"
  second_r3f_canvas_forbidden: true
geo_flight_overlay:
  activation: "selected authored environment plus source-authored Flight identity"
  renderer_owner: "native MapLibre Geo host"
  geo_policy_owner: "canvas/src/components/CanvasViewportGeospatialOverlay.tsx"
  presentation_owner: "gympgrph/src/GeospatialHost.tsx"
  render_policy: "native MapLibre owns every visible Flight route and aircraft mark"
  maplibre_views: ["2d-classic", "2d-modern", "3d-classic", "3d-modern"]
  basemap: "selected native MapLibre provider view"
  maplibre_runtime_started: true
  provider_transport_owner: "gympgrph Geo runtime; independent from Flight gameplay"
  flight_gameplay_transport: "none"
  control_owner: "canvas/src/features/game-flight-sim/useFlightSimSurfaceControls.ts"
  route_projection_owner: "canvas/src/features/game-flight-sim/flightSimGeospatialProjection.ts"
  xr_canvas_mounted: true
  duplicate_r3f_environment_mounted: false
  composition: "MapLibre owns the geospatial world plus all visible Flight route/waypoint/aircraft geometry; the existing transparent R3F Canvas retains simulation/input/readiness and paints no Flight or XR geometry"
clean_room_policy:
  boundary: "External references inform conceptual principles only. Maintainers attest that implementation and instructional content are source-authored. Copying or deriving source, prose, prompts, schemas, algorithms, tests, binaries, or assets is forbidden. External project identity and URL are forbidden in product source and runtime metadata. There is no external project dependency. The deterministic locator gate cannot prove the absence of arbitrary derived code."
native_flight_demo:
  runtime_owner: "Flight Sim projection on the active shared XR or Geo Canvas surface"
  aircraft_visual_owner: "one MapLibre Point feature plus fixed-pixel symbol stack"
  deterministic_step: true
  fixed_step: "exactly 1/60 second (approximately 16.667 ms, 60 Hz)"
  max_catch_up_ticks_per_advance: 5
  mission_meter_transform: "20 meters per authored Singapore scene unit"
  spatial_profile_scale_id: "flight-meters-20"
  flight_model: "in-repo thrust/pitch/roll/yaw with bounded lift/drag/gravity approximation; no external physics engine"
  collision: "swept authored XR AABB slab catalog plus perimeter, ground, and ceiling; earliest hit with stable id tie-break; at least 0.001 meter separation; no mesh colliders or navmesh"
  camera_mode: "fixed-follow"
  camera:
    default: "fixed-follow"
    selector: "FloatingPanel Camera / SHOOT / Camera source"
    available: ["fixed-follow", "free-orbit"]
    invocation: "/camera.select @camera #camera camera=fixed-follow|free-orbit"
    timeline_override: "camera-mark playback temporarily owns framing"
    catalog_owner: "canvas/src/features/three/xrNativeControllerCameraCatalog.ts"
    selection_owner: "canvas/src/features/three/xrNativeControllerCameraRuntime.ts"
    driver_owner: "gympgrph/src/flightGeoOverlayMapLibreCamera.ts"
    runtime_canvas_driver_owner: "canvas/src/features/three/useXrNativeControllerDemoCamera.ts"
    follow_target: "Fixed Follow drives the visible MapLibre center, bearing, pitch, and zoom; Free Orbit yields pan and zoom to MapLibre"
    flight_views: ["chase", "cockpit", "survey"]
    flight_view_owner: "canvas/src/features/game-flight-sim/flightSimCameraRuntime.ts"
    flight_view_control: "Flight panel, HUD, or C key while Fixed Follow owns framing"
  navigation_inset:
    orientation: "north-up"
    source: "authored mission spawn, ordered waypoints, landing pad, and aircraft snapshot"
    projection_owner: "canvas/src/features/game-flight-sim/flightSimNavigationProjection.ts"
    route_guidance_owner: "canvas/src/features/game-flight-sim/flightSimRouteGuidance.ts"
    objective_guide: "one conditional aircraft-to-active-objective segment shared with native MapLibre, exclusive plain Geo, and the HUD"
    hud_cue: "objective label, rounded distance, and signed left/right heading error; per-tick cue is not a live region"
    runtime_network_calls: 0
    external_map_or_token_required: false
  scene: "procedural Singapore waterfront terrain"
  terrain:
    default: "singapore"
    selector: "FloatingPanel Media Terrain / Environment Kits; the Media Geo action stages the selected authored environment before opening FloatingPanel Geo"
    available: ["singapore", "tropical-playground", "neutral-volume", "street-grid", "loading-bay", "downtown", "residential-street", "supermarket", "movie-theater", "train-car", "backyard-pool", "aerial-sky"]
    geo_handoff: "successful stage selection opens the shared Geo panel and preserves its selected native MapLibre Classic/Modern view; rejected selection remains in Media"
    flight_entry: "the next Flight open derives its local collision profile and deterministic mission from the selected authored environment, suppresses duplicate R3F terrain, and projects aircraft plus route above the native Geo surface"
  objective: "capture exactly three ordered waypoints, then the marked landing pad"
  waypoint_count: 3
  landing_pad_count: 1
  capture_radius_meters: 50
  out_of_order_waypoint_behavior: "no route progression"
  interactive_props: ["three route waypoints", "marked landing objective"]
  input:
    keyboard:
      pitch_roll: ["W", "A", "S", "D", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]
      throttle_up: "Shift"
      throttle_down: "Control"
      yaw: ["Q", "E"]
      camera_cycle: "C"
    touch: "direction buttons + throttle slider"
    gamepad:
      pitch_roll: "standard left stick"
      yaw: "standard shoulder axes"
      throttle: "standard triggers"
    multi_device_conflict: "select the largest absolute value independently per axis"
  lifecycle: ["develop-and-run", "pause", "resume", "reset", "exit"]
flight_training:
  missions: ["circuit-foundation", "night-circuit", "systems-recovery"]
  mission_outcomes: ["route progress", "stable attitude", "energy envelope", "failure recovery", "terminal result"]
  score_range: [0, 100]
  terminal_grades: ["A", "B", "C", "D"]
  systems_first: true
  voice_instructor: "explicit browser speech synthesis over the visible deterministic coaching cue; text fallback always remains"
  practice_failures: ["none", "engine-power-loss", "instrument-uncertainty", "control-bias"]
  failure_tick_window: "180 inclusive through 420 exclusive"
  night_owner: "MapLibre Flight-layer and shared HUD palette"
  panel_surfaces: ["media", "animation", "motion-control", "game-mode", "flight-sim", "camera"]
  outcome_schema: "agentic-graph-flight-training-outcome/v1"
  outcome_persistence: "one idempotent dialogue_outcome Decision on explicit terminal Save; never auto-save"
motion_control:
  runtime: "browser-local LiteRT.js"
  model: "Google BlazePose GHUM Full"
  permission: "explicit Start action"
  frame_upload: false
  frame_persistence: false
  flight_role: "optional normalized player input only; never the flight control policy"
  panel_handoff: "opening Motion Control preserves the active Flight mission; returning to Flight Sim preserves camera capture and the calibrated pose input"
  gestures: "lean forward/back for pitch; lean side-to-side for roll; raise both hands for positive throttle; hold hands wide while leaning for yaw"
  invocation: "/motion.control @canvas #pose operation=start backend=auto"
flight_sim:
  companion_view: "flightSim"
  invocation: "/flight.sim @canvas #flight operation=open"
  invocation_prefix: "/flight.sim @canvas #flight"
  invocation_policy: "exactly one /flight.sim command, one @canvas binding, and one #flight semantic"
  operations: ["open", "start", "stop", "restart", "throttle", "mission-foundation", "mission-night", "mission-systems", "failure-none", "failure-engine", "failure-instruments", "failure-controls", "voice-on", "voice-off", "coach", "save", "exit"]
  operation_invocations:
    open: "/flight.sim @canvas #flight operation=open"
    start: "/flight.sim @canvas #flight operation=start"
    stop: "/flight.sim @canvas #flight operation=stop"
    restart: "/flight.sim @canvas #flight operation=restart"
    throttle: "/flight.sim @canvas #flight operation=throttle throttle=0.75"
    mission_foundation: "/flight.sim @canvas #flight operation=mission-foundation"
    mission_night: "/flight.sim @canvas #flight operation=mission-night"
    mission_systems: "/flight.sim @canvas #flight operation=mission-systems"
    failure_none: "/flight.sim @canvas #flight operation=failure-none"
    failure_engine: "/flight.sim @canvas #flight operation=failure-engine"
    failure_instruments: "/flight.sim @canvas #flight operation=failure-instruments"
    failure_controls: "/flight.sim @canvas #flight operation=failure-controls"
    voice_on: "/flight.sim @canvas #flight operation=voice-on"
    voice_off: "/flight.sim @canvas #flight operation=voice-off"
    coach: "/flight.sim @canvas #flight operation=coach"
    save: "/flight.sim @canvas #flight operation=save"
    exit: "/flight.sim @canvas #flight operation=exit"
  web_mcp_schema: "agentic-graph-flight-sim-mcp/v1"
  inspect_tool: "agentic-graph.inspect_local_flight_sim"
  control_tool: "agentic-graph.control_local_flight_sim"
  web_mcp_deadline_ms: 2000
  web_mcp_failure_envelopes: ["timeout", "state unavailable", "execution error", "unsupported operation"]
  native_invocation_diagnostics: "named error code plus the offending required token, duplicate sigil, unknown key, mixed-input field, or unsupported operation"
  lifecycle: "retain the transparent XR runtime while suppressing its visuals; restore prior controller input and simulation on exit"
  exit_world_behavior: "dispose and discard the ECS World, pending state, and unsaved mission progress"
  entry_failure: "leave the existing Canvas, scene graph, and prior controller unchanged; surface a local error"
  restoration_failure: "retain the existing single Canvas without a second renderer; surface a local error"
  controller_handoff: "publish the selected camera source/view with Flight state; Fixed Follow drives MapLibre and Free Orbit yields MapLibre interaction; never mount a Flight-owned camera"
  renderer_owner: "native MapLibre Geo surface for all visible Flight geometry plus the existing transparent React Three Fiber runtime Canvas; never a second R3F Canvas"
  scene_composition: "the selected native MapLibre view owns the geospatial world and renders Flight route/waypoint/aircraft layers; the transparent R3F layer retains simulation/input/readiness only; HUD remains DOM; no XR atmosphere, duplicate terrain, fallback arena, or second R3F Canvas"
  simulation_clock: "exact 1/60-second fixed ticks, at most five catch-up ticks per advance, ready at tick zero until normalized desktop, pointer, touch, gamepad, Motion Control, or MCP input"
  replay_guard: "validate source, seed, input count/order/bytes; halt on the first byte divergence and preserve the last byte-equivalent committed World"
  transactional_system_order: ["InputIntegrationSystem", "FlightModelSystem", "CollisionResolverSystem", "ObjectiveSystem"]
  cost_log_owner: "AgenticECS.worldTick:post-systems"
  projection_owner: "captureFlightSimMission:post-commit"
  system_contract_reconciliation: "four meaningful journaled systems; Cost_Log is harness-owned after systems and render/HUD projection is captured only after commit"
  normal_cost_log: {model: "none", prompt_tokens: 0, completion_tokens: 0, cache_hits: 0, estimated_cost_usd: 0, incomplete: false}
  blocked_inference_cost_log: {model: "none", prompt_tokens: "unknown", completion_tokens: "unknown", cache_hits: 0, estimated_cost_usd: 0, incomplete: true, error: "blocked_inference"}
  webgl_gate: "synchronous probe; fail closed on the local fallback surface"
  stop_start: "resume the exact in-memory mission tick and state"
  decision_persistence: "browser-local WorkspaceFs; terminal Decisions remain pending until explicit Save and are never auto-saved"
  admitted_decision_types: ["dialogue_outcome", "quest_flag", "world_tick_result"]
  malformed_hydration: "preserve bytes and block Start and Restart until explicit Reset"
  validation_input_forbid_hardcode_in_repo: true
runtime_validation:
  mode_activation: ["xr surface", "3d renderer", "xr stage"]
  required_states: ["ready", "flying", "stopped"]
  replayable: true
  local_assets_only: true
  required_external_calls: false
  automatic_remote_grammar_hydration: "deferred until Source Files identity is ready and disabled for active Flight/Physics offline XR sources"
  first_playable_frame_limit_ms: 3000
  property_proof: "40 named fast-check properties at 100 runs each (4,000 generated cases)"
  focused_source_tests_minimum: 127
  browser_proof: "two fresh serial runs; each evidence record binds clean branch, HEAD, tree, authored seed SHA-256, and source path before launch"
  browser_evidence: ["data/outputs/game-flight-sim-browser-smoke-run-1.json", "data/outputs/game-flight-sim-browser-smoke-run-2.json"]
  editor_chrome: true
  status: "local runtime-ready; exact-head source/browser evidence required at every handoff; protected integration pending"
mcp_control:
  inspect_tool: "agentic-graph.inspect_local_flight_sim"
  control_tool: "agentic-graph.control_local_flight_sim"
  launch: "/flight.sim @canvas #flight operation=open"
  start: "/flight.sim @canvas #flight operation=start"
  night_training: "/flight.sim @canvas #flight operation=mission-night"
  systems_failure: "/flight.sim @canvas #flight operation=failure-engine"
  voice_instructor: "/flight.sim @canvas #flight operation=voice-on"
  coach: "/flight.sim @canvas #flight operation=coach"
  reset: "/flight.sim @canvas #flight operation=restart"
flow:
  direction: {key: direction, type: string, value: "LR"}
  edgeType: {key: edgeType, type: string, value: "smoothstep"}
  balancedViewportPreset: {key: balancedViewportPreset, type: string, value: "widgetFrontmatter"}
  nodes:
    - id: {key: id, type: string, value: "flight_demo_entry"}
      type: {key: type, type: string, value: "FlightDemoControl"}
      label: {key: label, type: string, value: "Launch and Fly"}
      position: {key: position, type: object, value: {"x":0,"y":-360}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:flight_demo_entry"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Apply this source to open the local Flight Sim on the canonical authored XR world."}
      role: {key: role, type: string, value: "lifecycle"}
      state: {key: state, type: string, value: "ready"}
    - id: {key: id, type: string, value: "flight_aircraft"}
      type: {key: type, type: string, value: "FlightDemoAircraft"}
      label: {key: label, type: string, value: "Airplane"}
      position: {key: position, type: object, value: {"x":0,"y":-120}}
      aircraftId: {key: aircraftId, type: string, value: "flight-sim:aircraft"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:flight_aircraft"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Fly with deterministic throttle, pitch, roll, and yaw under bounded in-repo dynamics."}
      role: {key: role, type: string, value: "controller"}
    - id: {key: id, type: string, value: "flight_runtime_gate"}
      type: {key: type, type: string, value: "FlightDemoValidation"}
      label: {key: label, type: string, value: "Runtime Readiness"}
      position: {key: position, type: object, value: {"x":0,"y":360}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:flight_runtime_gate"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Repository gates cover deterministic stepping, collision, input, Decisions-only persistence, strict invocation, and canonical MapLibre presentation."}
      role: {key: role, type: string, value: "validation"}
      state: {key: state, type: string, value: "ready"}
  edges:
---

# Native Flight Sim in Geo+XR Mode

This Source Files document is the local Geo+XR Mode runtime authority for one deterministic, browser-local flight mission. Applying it opens **Flight Sim**, keeps the selected native MapLibre view visible, and projects the route, conditional aircraft-to-active-objective course segment, waypoints, and aircraft through dedicated map layers before preparing a healthy mission at tick zero and waiting for normalized input. The course segment shares one pure route-guidance state with exclusive plain Geo, the north-up inset, and the mobile/desktop HUD, and disappears after mission completion. The existing R3F Canvas remains mounted only for simulation/input/readiness and paints no Flight or XR world geometry. Geo view selection changes the actual MapLibre 2D/3D Classic/Modern presentation. It does not create another R3F Canvas, terrain, collider catalog, Flight-owned map provider/camera, persistence owner, external dependency, or deployment surface.

## Run locally

From the repository root, run `npm run dev`. In agentic-graph, open **Explorer → Source Files → docs → workspace-seeds → agentic-graph-game-flight-sim-demo.md** and apply the document. The source-authored `run_ready_demo.id: flight-sim` activates XR/3D and the Flight Sim panel; an imported path is not required, and a conflicting known path fails closed.

## Controls

| Action | Keyboard | Touch | Standard gamepad |
|---|---|---|---|
| Pitch / roll | W/A/S/D or arrow keys | Discrete Pitch/Roll buttons | Left stick |
| Yaw | Q / E | Discrete Yaw buttons | Shoulder buttons |
| Throttle up / down | Shift / Control | Throttle slider | Triggers |
| Camera view | C cycles Chase / Cockpit / Survey | HUD or FloatingPanel camera buttons | HUD or FloatingPanel camera buttons |
| Pause / Resume / Reset | HUD or FloatingPanel controls | HUD or FloatingPanel controls | HUD or FloatingPanel controls |

The browser-local control contract uses `agentic-graph.control_local_flight_sim` and strict `/flight.sim @canvas #flight`, with schema `agentic-graph-flight-sim-mcp/v1`. Throttle is explicit: `/flight.sim @canvas #flight operation=throttle throttle=0.75`. Duplicate sigils, unknown keys, mixed native/structured input, missing tokens, and invalid lifecycle operations fail closed with a named diagnostic and offending token or field. Inspect and control return deterministic timeout, unavailable, execution, or validation envelopes within a hard 2,000 ms deadline.

**FloatingPanel → Flight Sim** controls Open, Start, Stop, Restart, Throttle, Save, and Exit. The panel projects runtime state only; in Geo+XR, native MapLibre owns visible aircraft/route geometry and the retained R3F mission stage is visual-free.

Camera source is independent of aircraft selection. In **FloatingPanel Camera → SHOOT**, choose the catalog's only two modes: **Fixed Follow** for aircraft-relative MapLibre framing or **Free Orbit** for direct map pan and zoom. While Fixed Follow is active, the Flight panel, HUD, or `C` key selects **Chase**, **Cockpit**, or **Survey**; the Geo host applies the corresponding visible MapLibre center, bearing, pitch, and zoom. Cockpit uses the canonical collision-clear eye to derive its forward look-ahead map center. Flight never mounts a map or camera. Timeline camera-mark playback temporarily maps the sampled authored pose into visible MapLibre center, bearing, pitch, and zoom, then returns to the selected source.

The north-up local navigation inset projects the authored mission spawn, ordered waypoint rings, landing pad, aircraft position, heading, objective distance, bearing, signed heading error, and the same aircraft-to-objective course segment used by MapLibre and exclusive plain Geo. A compact HUD cue names the objective and reports rounded distance plus `HOLD COURSE` or deterministic left/right turn correction; only objective transitions use the polite live region. It is deterministic SVG/DOM over the existing HUD and panel: no map tiles, geocoder, token, network request, alternate terrain, or external runtime dependency. Motion Control is optional normalized player input only and never becomes flight policy. Conflicting device commands resolve independently per axis to the value with the largest absolute magnitude.

For pose control, open and start **Motion Control** from the active Flight panel, then use **Flight Sim** in the training card to return to the aircraft. The mission and camera capture remain live across that panel handoff. Lean forward/back for pitch, lean side-to-side for roll, raise both hands for power, and hold hands wide while leaning to yaw; the Flight panel reports whether capture is connected and whether a full-body pose is currently driving the aircraft.

Terminal results remain pending and never auto-save. **Save** is the only operation that persists validated gameplay Decisions through browser-local WorkspaceFs at `/game-flight-sim/mission-1-decisions.md`; explicit **Reset local save** is a separate recovery write of the canonical empty AGENTIC_OS document. Successful hydration preserves the validated active run identifier and ordered waypoint history, Start continues that run, and only Restart mints a fresh run. Malformed bytes remain intact and block Start and Restart until Reset succeeds.

The mission uses the fixed `flight-meters-20` transform: one authored Singapore scene unit equals 20 mission meters. Deterministic mission positions are converted into Singapore-anchored geographic coordinates for MapLibre while the transparent runtime retains the local simulation scale. The simulation advances at exactly `1/60` second (approximately 16.667 ms, 60 Hz) and executes at most five catch-up ticks per advance. Capture exactly three waypoints in authored order and then the marked landing pad; all four objective radii are 50 m, and an out-of-order waypoint cannot advance progress.

Four meaningful systems run in stable transactional order: `InputIntegrationSystem`, `FlightModelSystem`, `CollisionResolverSystem`, and `ObjectiveSystem`. The Agentic ECS harness emits the one post-systems Cost_Log, and immutable render/HUD projection is captured only after the World commits. A failing system rolls back itself while retaining prior same-tick commits. Replay validates source, mission seed, input count/order/bytes, halts on the first divergence, and retains the last byte-equivalent committed World. Exit disposes the ECS World and unsaved in-memory mission state, restores the complete pre-document surface including Geo ownership, and does not acknowledge a prior non-Geo surface until MapLibre has released its active map and canvas for two committed frames.

## Runtime-readiness gates

- [x] Source identity is `flight-sim`, independent of import path, with conflict rejection.
- [x] Flight is a Geo+XR Mode composition: native MapLibre is the geospatial world and visible Flight renderer in all four views, one transparent R3F Canvas retains simulation/input/readiness with zero visuals, and duplicate XR terrain stays unmounted.
- [x] Fixed Follow and Free Orbit come from the shared Camera catalog; Fixed Follow drives visible MapLibre Chase/Cockpit/Survey framing and Free Orbit yields MapLibre pan/zoom.
- [x] Chase, Cockpit, and Survey vary only Flight's pure framing descriptor; Cockpit projects a collision-clear forward look-ahead and the north-up route inset derives entirely from authored local mission state with zero map or token dependency.
- [x] The default load is spec-primary for the required aircraft and contains exactly one committed-local optional opaque GLB; remote and unavailable fallbacks fail closed.
- [x] Exactly 40 named fast-check properties are registered for at least 100 cases each (4,000 generated cases), alongside focused source checks.
- [x] Browser proof enforces a clean exact branch/HEAD/tree and authored-seed SHA-256 before each of two fresh serial runs, including visible MapLibre plus Flight overlay, ≤3 s first-frame, 375×812 HUD, lifecycle, camera, persistence-failure, pointer-lock contract, and provider-attributed transport.
- [x] Runtime and browser verification execute in child-owned exact local workspaces; failed tracked/untracked mutations are discarded, cleanup precedes browser evidence publication, and publication failure restores prior evidence bytes.
- [x] `npm run game-flight-sim:runtime-ready` is the mandatory aggregate gate for the clean final candidate.
- [x] `npm run game-flight-sim:browser-smoke` requires two serial runs on that same exact candidate revision.
- [ ] The protected PR integrates the verified candidate.

The unchecked protected-integration gate is release state, not missing runtime behavior. Every handoff must re-run the exact-head source and browser proof. This scope authorizes no Agentic workspace-seed projection, Prod/Cloudflare deployment, or public release.
