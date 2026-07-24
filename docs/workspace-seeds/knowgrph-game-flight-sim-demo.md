---
title: "Knowgrph Native Flight Sim"
doc_type: "Workspace Demo"
status: "runtime-ready"
runtime_status: "runtime-ready"
runtime_claim: "local-runtime-ready"
evidence_status: "exact-head source and browser proof required at every handoff"
publish_scope: "local-only"
authority_role: "derived runtime activation/proof projection"
normative_kiro_authority: "/.kiro/specs/knowgrph-game-flight-sim/"
workspace_root_kiro_projection: "byte-identical local projection only; never a second authority"
kgCanvasSurfaceMode: "xr"
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
  canonical_consumers: ["workspace", "xr-mode"]
  dev_command: "npm run dev"
  canonical_source_file: "/docs/workspace-seeds/knowgrph-game-flight-sim-demo.md"
  env_selector: "VITE_KNOWGRPH_RUN_READY_DEMO=flight-sim"
  validation_seed_path: "/knowgrph-game-flight-sim-demo.md"
  source_root: "knowgrph/docs"
  source_backed: true
  clean_canvas_recommended: true
  native_runtime: true
  presentation: "shared-xr-gameplay-overlay"
  document_presentation: "runtime-ready-workspace-demo"
  auto_start: true
  external_dependencies: []
  forbid_external_copy_or_dependency: true
shared_xr_scene:
  source_authority: "/docs/workspace-seeds/knowgrph-physics-playground-demo.md"
  world_ownership: "overlay-only"
  surface_owner: "XR Mode"
  renderer_owner: "canvas/src/lib/three/ThreeGraph.impl.tsx"
  collider_owner: "canvas/src/features/three/xrCanonicalSceneSpatialSource.ts"
  camera_owner: "canvas/src/features/three/useXrNativeControllerDemoCamera.ts"
  second_canvas_forbidden: true
native_flight_demo:
  runtime_owner: "Flight Sim surface on the shared XR Canvas"
  default_aircraft: "vehicle-airplane"
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
    driver_owner: "canvas/src/features/three/useXrNativeControllerDemoCamera.ts"
    follow_target: "Flight supplies a pure aircraft follow/framing descriptor; the shared Physics controller hook alone mutates the camera and OrbitControls"
  scene: "procedural Singapore waterfront terrain"
  terrain:
    default: "singapore"
    selector: "XR Terrain / Environment catalog"
    available: ["singapore", "tropical-playground"]
  objective: "capture exactly three ordered waypoints, then the marked landing pad"
  waypoint_count: 3
  landing_pad_count: 1
  capture_radius_meters: 50
  out_of_order_waypoint_behavior: "no route progression"
  interactive_props: ["three waypoint rings", "marked landing pad", "optional beacon"]
  input:
    keyboard:
      pitch_roll: ["W", "A", "S", "D", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]
      throttle_up: "Shift"
      throttle_down: "Control"
      yaw: ["Q", "E"]
    touch: "direction buttons + throttle slider"
    gamepad:
      pitch_roll: "standard left stick"
      yaw: "standard shoulder axes"
      throttle: "standard triggers"
    multi_device_conflict: "select the largest absolute value independently per axis"
  lifecycle: ["develop-and-run", "pause", "resume", "reset", "exit"]
asset_pipeline:
  primary: "img2threejs-style TypeScript + JSON Must-aircraft scene spec (small, diffable, committed in-repo, offline-loadable)"
  admission: "the required vehicle-airplane is admitted only through the exact TypeScript+JSON Asset_Spec; the optional beacon has no Asset_Spec and is the only admitted opaque fallback"
  required_aircraft_asset_spec_count: 1
  required_aircraft_glb_fallback_count: 0
  opaque_binary_fallback: "one committed-local optional-beacon GLB is admitted, marked opaque, and never substitutes for the required aircraft"
  optional_prop_glb_fallback_count: 1
  glb_fallback_count: 1
  optional_glb_path: "canvas/src/features/game-flight-sim/assetSpec/fallbacks/optional-beacon.glb"
  optional_glb_sha256: "be41f87bb745ba35c439336d932dd69c34223d26e117443a3c8556e44fce70cd"
  optional_glb_license: "CC0-1.0"
  fallback_rejection: "remote, absolute, traversal, missing, unreadable, invalid, or unlicensed GLB references fail closed without fetch"
  runtime_model_calls: 0
  runtime_network_calls: 0
  authoring_step: "offline only; no image-to-3D model, network fetch, or Cloudflare resource is invoked at runtime to obtain any asset"
  diffability: "the required aircraft is TypeScript+JSON; the single optional opaque GLB is generated deterministically and pinned by exact bytes and SHA-256"
  text_gate: "every committed Asset_Spec is strict UTF-8 and at most 1 MB"
  dependency_license_gate: "fixed 21-package Flight runtime closure; OSI-approved licenses only"
  native_in_repo: true
  forbid_external_copy_or_dependency: true
  external_reference_policy: "conceptual principles only; external project identity and URL are prohibited in product source and runtime metadata; no external project dependency"
  no_copy_scan_scope: "Flight-owned tracked paths for external repository locators, vendored paths, opaque source binaries, and missing policy markers"
  provenance_attestation: "Knowgrph contributors attest that the Flight Sim implementation, instructional content, and assets are source-authored"
  no_copy_gate_limitation: "the deterministic clean-room scanner cannot prove the absence of arbitrary derived code"
flight_training:
  missions: ["circuit-foundation", "night-circuit", "systems-recovery"]
  mission_outcomes: ["route progress", "stable attitude", "energy envelope", "failure recovery", "terminal result"]
  score_range: [0, 100]
  terminal_grades: ["A", "B", "C", "D"]
  systems_first: true
  voice_instructor: "explicit browser speech synthesis over the visible deterministic coaching cue; text fallback always remains"
  practice_failures: ["none", "engine-power-loss", "instrument-uncertainty", "control-bias"]
  failure_tick_window: "180 inclusive through 420 exclusive"
  night_owner: "shared authored XR atmosphere and lighting"
  panel_surfaces: ["media", "animation", "motion-control", "game-mode", "flight-sim", "camera"]
  outcome_schema: "knowgrph-flight-training-outcome/v1"
  outcome_persistence: "one idempotent dialogue_outcome Decision on explicit terminal Save; never auto-save"
motion_control:
  runtime: "browser-local LiteRT.js"
  model: "Google BlazePose GHUM Full"
  permission: "explicit Start action"
  frame_upload: false
  frame_persistence: false
  flight_role: "optional normalized player input only; never the flight control policy"
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
  web_mcp_schema: "knowgrph-flight-sim-mcp/v1"
  inspect_tool: "knowgrph.inspect_local_flight_sim"
  control_tool: "knowgrph.control_local_flight_sim"
  web_mcp_deadline_ms: 2000
  web_mcp_failure_envelopes: ["timeout", "state unavailable", "execution error", "unsupported operation"]
  native_invocation_diagnostics: "named error code plus the offending required token, duplicate sigil, unknown key, mixed-input field, or unsupported operation"
  lifecycle: "retain the authored XR scene while suspending its controller input and simulation; restore both on exit"
  exit_world_behavior: "dispose and discard the ECS World, pending state, and unsaved mission progress"
  entry_failure: "leave the existing Canvas, scene graph, and prior controller unchanged; surface a local error"
  restoration_failure: "retain the existing single Canvas without a second renderer; surface a local error"
  controller_handoff: "supply a pure aircraft follow/framing descriptor to the shared Physics controller camera; never mount a Flight-owned camera"
  renderer_owner: "the existing React Three Fiber Canvas in shared XR Mode; never a second Canvas"
  scene_composition: "authored XR atmosphere, terrain, and props plus Flight aircraft and waypoint/objective actors with the HUD overlay; no fallback arena or Flight-owned camera"
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
  aircraft_parity: ["vehicle-airplane"]
  replayable: true
  local_assets_only: true
  required_external_calls: false
  automatic_remote_grammar_hydration: "deferred until Source Files identity is ready and disabled for active Flight/Physics offline XR sources"
  asset_spec_primary: true
  required_aircraft_glb_fallback_count: 0
  optional_prop_glb_fallback_count: 1
  glb_fallback_count: 1
  glb_fallback_runtime: "one committed-local, CC0-1.0, SHA-pinned optional beacon; remote or unavailable fallbacks fail closed"
  first_playable_frame_limit_ms: 3000
  property_proof: "45 named fast-check properties at 100 runs each (4,500 generated cases)"
  focused_source_tests_minimum: 127
  browser_proof: "two fresh serial runs; each evidence record binds clean branch, HEAD, tree, authored seed SHA-256, and source path before launch"
  browser_evidence: ["data/outputs/game-flight-sim-browser-smoke-run-1.json", "data/outputs/game-flight-sim-browser-smoke-run-2.json"]
  editor_chrome: true
  status: "local runtime-ready; exact-head source/browser evidence required at every handoff; protected integration pending"
mcp_control:
  inspect_tool: "knowgrph.inspect_local_flight_sim"
  control_tool: "knowgrph.control_local_flight_sim"
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
      aircraftId: {key: aircraftId, type: string, value: "vehicle-airplane"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:flight_aircraft"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Fly with deterministic throttle, pitch, roll, and yaw under bounded in-repo dynamics."}
      role: {key: role, type: string, value: "controller"}
    - id: {key: id, type: string, value: "flight_asset_spec"}
      type: {key: type, type: string, value: "FlightDemoAssetSpec"}
      label: {key: label, type: string, value: "Asset Spec (img2threejs-style)"}
      position: {key: position, type: object, value: {"x":0,"y":120}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:flight_asset_spec"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Load the committed diffable TypeScript+JSON aircraft spec; the optional beacon alone uses one committed-local, SHA-pinned opaque GLB."}
      role: {key: role, type: string, value: "asset"}
    - id: {key: id, type: string, value: "flight_runtime_gate"}
      type: {key: type, type: string, value: "FlightDemoValidation"}
      label: {key: label, type: string, value: "Runtime Readiness"}
      position: {key: position, type: object, value: {"x":0,"y":360}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:flight_runtime_gate"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Repository gates cover deterministic stepping, collision, input, Decisions-only persistence, strict invocation, and spec-primary loading."}
      role: {key: role, type: string, value: "validation"}
      state: {key: state, type: string, value: "ready"}
  edges:
---

# Native Flight Sim in XR Mode

This Source Files document is the local XR Mode runtime authority for one deterministic, browser-local flight mission. Applying it opens **Flight Sim** on the canonical Physics-authored XR world, prepares a healthy mission at tick zero, and waits for normalized input. It does not create another Canvas, renderer, terrain, collider catalog, camera driver, rendered XR world or scene owner, persistence owner, or deployment surface.

## Run locally

From the repository root, run `npm run dev`. In Knowgrph, open **Explorer → Source Files → docs → workspace-seeds → knowgrph-game-flight-sim-demo.md** and apply the document. The source-authored `run_ready_demo.id: flight-sim` activates XR/3D and the Flight Sim panel; an imported path is not required, and a conflicting known path fails closed.

## Controls

| Action | Keyboard | Touch | Standard gamepad |
|---|---|---|---|
| Pitch / roll | W/A/S/D or arrow keys | Discrete Pitch/Roll buttons | Left stick |
| Yaw | Q / E | Discrete Yaw buttons | Shoulder buttons |
| Throttle up / down | Shift / Control | Throttle slider | Triggers |
| Pause / Resume / Reset | HUD or FloatingPanel controls | HUD or FloatingPanel controls | HUD or FloatingPanel controls |

The browser-local control contract uses `knowgrph.control_local_flight_sim` and strict `/flight.sim @canvas #flight`, with schema `knowgrph-flight-sim-mcp/v1`. Throttle is explicit: `/flight.sim @canvas #flight operation=throttle throttle=0.75`. Duplicate sigils, unknown keys, mixed native/structured input, missing tokens, and invalid lifecycle operations fail closed with a named diagnostic and offending token or field. Inspect and control return deterministic timeout, unavailable, execution, or validation envelopes within a hard 2,000 ms deadline.

**FloatingPanel → Flight Sim** controls Open, Start, Stop, Restart, Throttle, Save, and Exit. The panel projects runtime state only; the aircraft stage remains actor-only inside the shared renderer.

Camera source is independent of aircraft selection. In **FloatingPanel Camera → SHOOT**, choose the catalog's only two modes: **Fixed Follow** for stage-aware aircraft tracking or **Free Orbit** for direct pan, rotate, and zoom. The same shared catalog is invocable through `knowgrph.control_local_camera` with `/camera.select @camera #camera camera=fixed-follow` or `camera=free-orbit`. Flight supplies a pure aircraft follow/framing descriptor; the Physics controller hook alone mutates the camera and OrbitControls. Timeline camera-mark playback temporarily takes framing ownership, then returns to the selected source. Motion Control is optional normalized player input only and never becomes flight policy. Conflicting device commands resolve independently per axis to the value with the largest absolute magnitude.

Terminal results remain pending and never auto-save. **Save** is the only operation that persists validated gameplay Decisions through browser-local WorkspaceFs at `/game-flight-sim/mission-1-decisions.md`; explicit **Reset local save** is a separate recovery write of the canonical empty KGC document. Successful hydration preserves the validated active run identifier and ordered waypoint history, Start continues that run, and only Restart mints a fresh run. Malformed bytes remain intact and block Start and Restart until Reset succeeds.

The mission uses the fixed `flight-meters-20` transform: one authored Singapore scene unit equals 20 mission meters, while Flight rendering and camera framing apply the inverse scale on the retained authored XR world. The simulation advances at exactly `1/60` second (approximately 16.667 ms, 60 Hz) and executes at most five catch-up ticks per advance. Capture exactly three waypoints in authored order and then the marked landing pad; all four objective radii are 50 m, and an out-of-order waypoint cannot advance progress.

Four meaningful systems run in stable transactional order: `InputIntegrationSystem`, `FlightModelSystem`, `CollisionResolverSystem`, and `ObjectiveSystem`. The Agentic ECS harness emits the one post-systems Cost_Log, and immutable render/HUD projection is captured only after the World commits. A failing system rolls back itself while retaining prior same-tick commits. Replay validates source, mission seed, input count/order/bytes, halts on the first divergence, and retains the last byte-equivalent committed World. Exit disposes the ECS World and unsaved in-memory mission state.

## Asset pipeline

The required aircraft loads from committed img2threejs-style TypeScript plus `vehicle-airplane.scene.json`: small, diffable, human-auditable, strict UTF-8, at most 1 MB, and offline. Its GLB fallback count is exactly zero. One optional beacon without an Asset_Spec uses the committed-local opaque `optional-beacon.glb`, licensed CC0-1.0 and pinned to SHA-256 `be41f87bb745ba35c439336d932dd69c34223d26e117443a3c8556e44fce70cd`, so the complete default load has one fallback. Remote, absolute, traversal, missing, unreadable, invalid, or unlicensed fallback references fail closed without fetching. Runtime code performs no image-to-3D model call, asset fetch, automatic grammar hydration, or Cloudflare request during Flight/Physics core play. The fixed 21-package Flight runtime closure is license-gated. External references inform conceptual principles only. Knowgrph contributors attest that the implementation, instructional content, and assets are source-authored; external project identity and URL are prohibited in product source and runtime metadata; and there is no external project dependency. The deterministic clean-room scanner cannot prove the absence of arbitrary derived code.

## Runtime-readiness gates

- [x] Source identity is `flight-sim`, independent of import path, with conflict rejection.
- [x] Flight is an XR Mode overlay on the Physics source-authored world; it owns no second rendered XR world, scene owner, or Canvas.
- [x] Fixed Follow and Free Orbit come from the shared Camera catalog, and the Physics controller hook is the sole camera/OrbitControls mutator for the pure Flight framing descriptor.
- [x] The default load is spec-primary for the required aircraft and contains exactly one committed-local optional opaque GLB; remote and unavailable fallbacks fail closed.
- [x] Exactly 45 named fast-check properties are registered for at least 100 cases each (4,500 generated cases), alongside at least 127 focused source checks.
- [x] Browser proof enforces a clean exact branch/HEAD/tree and authored-seed SHA-256 before each of two fresh serial runs, including the ≤3 s first-frame, 375×812 HUD, lifecycle, camera, persistence-failure, pointer-lock contract, and zero-network fences.
- [x] Runtime and browser verification execute in child-owned exact local workspaces; failed tracked/untracked mutations are discarded, cleanup precedes browser evidence publication, and publication failure restores prior evidence bytes.
- [x] `npm run game-flight-sim:runtime-ready` is the mandatory aggregate gate for the clean final candidate.
- [x] `npm run game-flight-sim:browser-smoke` requires two serial runs on that same exact candidate revision.
- [ ] The protected PR integrates the verified candidate.

The unchecked protected-integration gate is release state, not missing runtime behavior. Every handoff must re-run the exact-head source and browser proof. This scope authorizes no Agentic workspace-seed projection, Prod/Cloudflare deployment, or public release.
