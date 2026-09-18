---
title: agentic-graph AR/VR/XR Runtime-readiness Demo
doc_type: Workspace Demo
status: runtime-ready
runtime_status: browser-local-runtime-ready
runtime_claim: local-browser-demo-runtime-ready
runtime_claim_scope: AC-1 through AC-12 exact-candidate browser proof only; AC-14 remains source-only
pinned_contract_status: partial
browser_local_mount_status: mounted-after-explorer-selection
publish_scope: local-first-explicit-existing-storage
saved_asset_persistence: device-local-indexeddb-with-explicit-existing-storage-publish
cross_device_reopen_status: client-adapter-ready-external-promotion-blocked
cross_device_reopen_blocker: shared-storage-auth-and-server-digest-not-enforced
deploy_boundary: Dev-only
kgCanvasSurfaceMode: 3d
kgCanvasRenderMode: 3d
kgCanvas3dMode: 3d
kgFloatingPanelOpen: true
kgFloatingPanelView: motionControl
kgBottomPanelOpen: false
kgBottomPanelTab: timeline
kgDocumentSemanticMode: document
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
run_ready_demo:
  id: xr-v2
  activation: applied-source-document
  identity_authority: source-authored run_ready_demo.id
  imported_path_alias_required: false
  identity_conflict: fail closed when path and source identity disagree
  canonical_consumers:
    - home-apex
    - workspace
    - game-mode-overlay
  dev_command: npm run dev
  canonical_source_file: /docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md
  validation_seed_path: /docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md
  source_root: agentic-graph/docs
  source_backed: true
  clean_canvas_recommended: true
  native_runtime: true
  browser_activation_evidence: actual Explorer Source Files row selection; no environment selector
  mount_status: mounted-after-applied-source-document
  canonical_xr_world_owner: docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md
  presentation: full-frame-playground
  document_presentation: workspace-playground
  auto_start: true
  external_dependencies: []
shared_xr_scene:
  source_authority: /docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md
  world_ownership: source-authored
  surface_owner: canonical XR Physics shared Three surface
  renderer_owner: canvas/src/lib/three/ThreeGraph.impl.tsx
  second_r3f_canvas_forbidden: true
pinned_source:
  repository: huijoohwee/agentic-graph
  path: docs/documents/agentic-graph-ar-vr-xr-prd-tad-adr-mvp-gtm.md
  version: 3.0.0
  commit: 1272bae345edf0d132e6fc750d5c5c7eade00b29
  git_blob_sha1: ff41649ac8562b62c7c539baed2d226402fdfe51
  content_sha256: 5067f019a099a94ec02d3f7581963cf2c514ab46bf5a853020df8dfe85d5ef45
  immutable_url: https://github.com/huijoohwee/agentic-graph/blob/1272bae345edf0d132e6fc750d5c5c7eade00b29/docs/documents/agentic-graph-ar-vr-xr-prd-tad-adr-mvp-gtm.md
runtime_readiness:
  schema: agentic-graph-xr-v2-pinned-contract-conformance/v1
  scope: pinned-ac1-ac12-conformance
  focused_gate: npm run xr-v2:review-ready
  browser_demo_status: runtime-ready
  browser_demo_evidence: clean exact-candidate source, unit, and Chromium smoke gates for AC-1 through AC-12; actual Explorer seed selection mounts the shared 3D/XR surface and independent permission controls; AC-14 remains source-only
  browser_local_mount_status: mounted
  capture_frame_budget_ms: 100
  capture_consecutive_budget_breaches: 2
  capture_max_frames: 24
  capture_max_duration_ms: 12000
  pinned_contract_status: partial
  physical_device_certification: external-required
  production_availability: not-claimed
  deployment_authority: false
  external_promotion_evidence_required:
    - named reference-device frame budget
    - named camera and sensor lifecycle matrix
    - physical-headset behavior
    - target-browser captured-track mux
    - physical connected viewer transport
    - shared-storage workspace authentication and server-side digest enforcement
    - physical cross-device reopen
permission_control:
  owner: user
  default_state: disabled
  camera: user-enable-disable
  sensors: user-enable-disable
  immersive_session: user-enable-disable-after-pinned-tier
  enable_boundary: explicit user action and browser permission grant
  disable_boundary: user stop action tears down tracks, sessions, and sensor listeners
  production_host_policy: allow camera and required sensors for the application origin so the user can opt in; never auto-start capture or sensors
  denial_behavior: fail closed to the non-capture viewer without blocking the workspace
acceptance_criteria:
  - id: AC-1
    evidence: source-backed
    promotion_boundary: named physical capability matrix
  - id: AC-2
    evidence: browser-backed
    promotion_boundary: named reference-device frame budget
  - id: AC-3
    evidence: browser-backed
    promotion_boundary: named-device quota, interruption, and resume run
  - id: AC-4
    evidence: browser-observable-after-selected-saved-asset render
    promotion_boundary: physical four-tier viewer matrix, hardened shared storage, and two-device reopen
  - id: AC-5
    evidence: source-backed
    promotion_boundary: named iOS device/browser pass
  - id: AC-6
    evidence: browser-backed
    promotion_boundary: complete mounted scene rendering proof
  - id: AC-7
    evidence: browser-backed
    promotion_boundary: texture and shader graph on the canonical target mesh
  - id: AC-8
    evidence: source-backed
    promotion_boundary: none for deterministic exact-once behavior
  - id: AC-9
    evidence: source-backed
    promotion_boundary: mounted GPU authoring surface
  - id: AC-10
    evidence: source-backed
    promotion_boundary: rigged mounted playback
  - id: AC-11
    evidence: browser-observable-after-explicit-package-and-play action
    promotion_boundary: target-browser user-capture track and codec preservation
  - id: AC-12
    evidence: browser-observable-after-explicit-local-connected-preview action
    promotion_boundary: physical two-device transport and measured latency
behavior_graph_interface: agentic-os-behavior-graph/v1
behavior_graph_contract:
  graph_id: xr-v2:hero
  nodes:
    - id: hero-select
      type: trigger
      config:
        trigger: select
        source_entity: "0"
    - id: hero-burst
      type: action
      config:
        action: emit-particle-burst
        target_entity: "0"
        parameters:
          count: 8
  edges:
    - from: hero-select
      to: hero-burst
  bound_entity: "0"
behavior_runtime_dispatch_schema: agentic-graph-xr-v2-behavior-dispatch-graph/v1
game_mode_xr_fidelity_status: "single-source authority contract"
home_apex:
  source_authority: "/docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md"
  scene_authority: "the authored XR Physics Playground world in this document"
  game_mode_projection: "actor, camera, and controls overlay only"
  forbidden_variants: ["fallback arena", "standalone game scene", "duplicate world", "legacy environment"]
native_controller_demo:
  runtime_owner: "XR Simulation workbench"
  default_controller: "ball"
  controller_switching: "preserve active body pose and velocity"
  deterministic_step: true
  camera_mode: "fixed-follow"
  camera:
    default: "fixed-follow"
    selector: "FloatingPanel Camera / SHOOT / Camera source"
    available: ["fixed-follow", "free-orbit"]
    invocation: "/camera.select @camera #camera camera=fixed-follow|free-orbit"
    timeline_override: "camera-mark playback temporarily owns framing"
  scene: "procedural Singapore waterfront terrain"
  terrain:
    default: "singapore"
    selector: "XR Terrain / Environment catalog"
    future_provisioning: "catalog-driven stable terrain IDs"
    available: ["singapore", "tropical-playground"]
  asset_library:
    default: "vehicle-helicopter"
    featured: ["vehicle-helicopter", "vehicle-sedan", "prop-ball"]
  objective: "collect key then unlock treasure"
  interactive_props: ["barrels", "bowling pins", "cannonballs"]
  controllers:
    - id: "ball"
      presentation: "procedural sphere"
      behaviors: ["rolling movement", "grounded jump", "air control", "modifier torque"]
    - id: "rocket"
      presentation: "procedural rocket"
      behaviors: ["directional thrust", "vertical thrust", "bounded tilt", "modifier stabilization"]
  input:
    keyboard:
      movement: ["W", "A", "S", "D", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]
      primary: "Space"
      modifier: "Shift"
    gamepad:
      movement: "standard left stick"
      primary: "standard primary action"
      modifier: "standard shoulder action"
  lifecycle: ["develop-and-run", "pause", "resume", "reset", "exit"]
motion_control:
  runtime: "browser-local LiteRT.js"
  model: "Google BlazePose GHUM Full"
  permission: "explicit Start action"
  frame_upload: false
  frame_persistence: false
  xr_drivers: ["native physics controller", "selected humanoid pose"]
  invocation: "/motion.control @canvas #pose operation=start backend=auto"
  inspect_tool: "agentic-graph.inspect_local_motion_control"
  control_tool: "agentic-graph.control_local_motion_control"
  game_mode_role: "optional normalized player input only; never the NPC decision policy"
game_mode:
  companion_view: "gameMode"
  invocation: "/game.mode @canvas #gameplay operation=open"
  invocation_prefix: "/game.mode @canvas #gameplay"
  invocation_policy: "exactly one /game.mode command, one @canvas binding, and one #gameplay semantic"
  operations: ["open", "start", "stop", "restart", "fire", "reload", "save", "exit"]
  operation_invocations:
    open: "/game.mode @canvas #gameplay operation=open"
    start: "/game.mode @canvas #gameplay operation=start"
    stop: "/game.mode @canvas #gameplay operation=stop"
    restart: "/game.mode @canvas #gameplay operation=restart"
    fire: "/game.mode @canvas #gameplay operation=fire"
    reload: "/game.mode @canvas #gameplay operation=reload"
    save: "/game.mode @canvas #gameplay operation=save"
    exit: "/game.mode @canvas #gameplay operation=exit"
  web_mcp_schema: "agentic-graph-game-mode-mcp/v1"
  inspect_tool: "agentic-graph.inspect_local_game_mode"
  control_tool: "agentic-graph.control_local_game_mode"
  source_authority: "/docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md"
  activation_scope: "optional overlay on the active authored XR world; never a standalone Home source"
  lifecycle: "retain the authored XR scene while suspending its controller input and simulation; restore both on exit"
  controller_handoff: "temporarily suspend the native XR controller stage and restore it on exit"
  renderer_owner: "the existing React Three Fiber Canvas in shared XR Mode; never a second Canvas"
  scene_composition: "one canonical authored XR atmosphere, terrain, props, and paused frame plus the Game Mode first-person actor overlay"
  scene_variant_policy: "fallback, renamed, conditional, duplicate, stale, and legacy arena or environment producers are forbidden"
  spatial_profile: "reuse the canonical active XR stage placement, playable bounds, and projection-aware static colliders; admit deterministic clear spawns and replace stale surface/terrain profiles"
  simulation_clock: "ready at tick zero until normalized desktop, pointer, touch, Motion Control, or MCP input"
  webgl_gate: "synchronous probe; fail closed with the local unsupported state without mounting another scene or renderer"
  stop_start: "resume the exact in-memory mission tick and state"
  decision_persistence: "browser-local WorkspaceFs; terminal Decisions remain pending until explicit Save and are never auto-saved"
  malformed_hydration: "preserve bytes and block Start and Restart until explicit Reset"
  validation_input_forbid_hardcode_in_repo: true
kgXrMotionReference:
  schema: "agentic-graph-xr-motion-reference/v1"
  stageId: "singapore"
  appearance:
    skyColor: "#8ed5f3"
    fogColor: "#c5e8ed"
    groundColor: "#e7dec1"
    waterColor: "#229fad"
    lightColor: "#fff1d0"
    lightIntensity: 1.8
    sunAzimuthDegrees: 35
    fogDistanceMeters: 92
    detail: "standard"
    shadows: true
  durationSeconds: 6
  fps: 12
  subjects:
    - id: "xr-subject:vehicle-helicopter:1"
      assetId: "vehicle-helicopter"
      label: "Helicopter"
      color: "#f59e0b"
      position: [7.2, 0.55, 2.1]
      rotationYDegrees: -31.5
      scale: 0.42
    - id: "xr-subject:vehicle-sedan:1"
      assetId: "vehicle-sedan"
      label: "Car"
      color: "#60a5fa"
      position: [-5.6, 0.15, 3.8]
      rotationYDegrees: -24
      scale: 0.82
  cast:
    - actorId: "xr-subject:vehicle-helicopter:1"
      label: "Helicopter"
      animation: null
      marks:
        - timeSeconds: 0
          position: [7.2, 0.55, 2.1]
          transition: "hold"
          gait: "flight"
    - actorId: "xr-subject:vehicle-sedan:1"
      label: "Car"
      animation: null
      marks:
        - timeSeconds: 0
          position: [-5.6, 0.15, 3.8]
          transition: "hold"
          gait: "wheeled"
  camera: []
runtime_validation:
  baseline_local_candidate_commit: "067ed16d0a8c77d1c612d6f63aa791ae02fba19c"
  baseline_local_verified_at: "2026-07-21T07:01:46Z"
  follow_up_pull_request: 273
  follow_up_protected_merge_commit: "0b0e70787edb80e71d368d56c1478ffd9655ce0d"
  exact_main_runtime_commit: "0b0e70787edb80e71d368d56c1478ffd9655ce0d"
  follow_up_verified_at: "2026-07-21T10:08:11Z"
  mode_activation: ["xr surface", "3d renderer", "xr stage"]
  required_states: ["ready", "running", "paused"]
  controller_parity: ["ball", "rocket"]
  replayable: true
  local_assets_only: true
  required_external_calls: false
  editor_chrome: true
  dedicated_editor_chrome: false
  validation_input_locator_persisted: false
  external_proof: "operator-supplied public document bytes were read into the local exact-main runtime; no deploy or public mutation occurred"
  xr_authoring_edited_media_delivery:
    scope: "xr-authoring-edited-media-delivery"
    projection_role: "downstream scoped evidence; not a second XR readiness authority"
    prd: "/docs/documents/agentic-graph-ar-vr-xr-prd-tad-adr-mvp-gtm.md"
    runtime_owner: "canvas/src/components/timeline; canvas/src/features/gitgraph"
    source_snapshot_schema: "agentic-graph-xr-v2-readiness/v1"
    source_snapshot_status: "source-ready"
    canonical_delivery_status: "runtime-ready"
    canonical_delivery_limit: "XR authoring and native edited-media delivery only"
    reviewed_feature_commit: "fcd69c6b2d42a00779f55be8c1d57a0ab468339b"
    pull_request: 674
    protected_refresh_chain:
      - "48c58307481c96e5c73c9f4d2f53eb2c2f1c8549"
      - "fea5e37b9bf0d648284330cfbc3dcca03890def0"
      - "a6de5722e550e633d0d73f59f187a09ec7388879"
    canonical_main_commit: "a3ddfef7cc55c38385520173273abd66010e9747"
    canonical_main_tree: "76c8e22da9c9284f01c2627c8ace9c9d3abcd682"
    canonical_main_proof:
      workflow: "Integration"
      run_id: 30895597328
      check: "Integration Gate"
      conclusion: "success"
      completed_at: "2026-08-04T09:26:58Z"
      affected_scope: "xr_v2_video_editor"
      focused_gate: "npm run xr-v2:review-ready"
      browser_observation_schema: "agentic-graph-xr-v2-browser-smoke/v1"
      browser_observation: "pass"
    canonical_runtime_reconciliation:
      integration_result_schema: "agentic-device-integration-result/v1"
      integration_status: "runtime_ready"
      readiness_schema: "agentic-local-runtime-readiness/v1"
      feature_runtime_source_revision: "a3ddfef7cc55c38385520173273abd66010e9747"
      feature_runtime_agentic_canvas_os_revision: "217a8a42d6497e059839a6a1f809c2459530ca54"
      feature_runtime_evidence_digest: "fc13db3e3184f69e42985dbec441bab163f52ba2d7e75b959e17194304f8fb23"
      feature_runtime_verified_at: "2026-08-04T09:29:02.924Z"
    proven:
      - "canonical ECS projection including entity zero"
      - "real standalone Three.js material application"
      - "mounted canonical Timeline command routing"
      - "same-origin browser-native edited-media export"
      - "non-empty Blob, decoded metadata, and bounded playback"
      - "media teardown and object-URL revocation without observed page or media errors"
      - "clean-room dependency and source enforcement"
    external_dependencies: []
    no_deployment: true
    deploy_boundary: "Dev-only"
    broader_xr_status: "blocked"
    blocked_claims:
      - "mounted-renderer material wiring"
      - "live depth model and quality"
      - "reference-device frame budget"
      - "camera permission and lifecycle on named physical devices"
      - "physical-headset XR behavior"
      - "Production availability"
      - "deployment authority"
mcp_control:
  inspect_tool: "agentic-graph.inspect_local_xr_scene_assets"
  control_tool: "agentic-graph.control_local_xr_scene"
  launch: "/xr.physics @canvas #controller operation=develop-run mode=ball"
  switch: "/xr.physics @canvas #controller operation=select mode=rocket"
  reset: "/xr.physics @canvas #controller operation=reset"
animation_rehearsal:
  control_tool: "agentic-graph.control_local_animation"
  quarter_speed: "/animation.control @canvas operation=play rate=0.25"
  next_frame: "/animation.control @canvas operation=scrub frame=next"
  previous_frame: "/animation.control @canvas operation=scrub frame=previous"
  scope: "authored animation and camera tracks; interactive physics and Game Mode are not rewound"
  load_policy: "open Animation and BottomPanel Timeline on demand"
flow:
  direction: "LR"
  edgeType: "smoothstep"
  balancedViewportPreset: "widgetFrontmatter"
  nodes:
    - id: "xr_demo_entry"
      type: "XrDemoControl"
      label: "Develop and Run"
      pos: {x: -420, y: 0}
      properties:
        role: "lifecycle"
        state: "runtime-ready"
        output: "Apply this Source Files document to launch the native demo, then switch controllers without resetting motion."
    - id: "xr_ball_controller"
      type: "XrDemoController"
      label: "Ball Controller"
      pos: {x: 0, y: -180}
      properties:
        role: "controller"
        controllerId: "ball"
        output: "Roll, jump, steer in air, and apply modifier torque."
    - id: "xr_rocket_controller"
      type: "XrDemoController"
      label: "Rocket Controller"
      pos: {x: 0, y: 180}
      properties:
        role: "controller"
        controllerId: "rocket"
        output: "Thrust, tilt, steer laterally, and stabilize with the modifier."
    - id: "xr_runtime_gate"
      type: "XrDemoValidation"
      label: "Native Runtime Gate"
      pos: {x: 440, y: 0}
      properties:
        role: "validation"
        state: "runtime-ready"
        output: "Verify deterministic stepping, controller switching, camera follow, keyboard input, and gamepad input."
    - id: "xr_edited_media_proof"
      type: "XrDemoValidation"
      label: "Scoped Edited-media Proof"
      pos: {x: 880, y: 300}
      properties:
        role: "downstream canonical-main evidence projection"
        scope: "xr-authoring-edited-media-delivery"
        sourceSnapshotState: "source-ready"
        canonicalDeliveryState: "runtime-ready"
        broaderXrState: "blocked"
        output: "Inspect the protected-main XR v2 review gate and canonical runtime receipt; applying this seed does not rerun the browser smoke."
    - id: "schema:XrParticleEmitter"
      type: "EcsComponentSchema"
      label: "XrParticleEmitter"
      position: {x: 0, y: -2760}
      properties:
        ecsComponent: {"name": "XrParticleEmitter", "fields": {"rate": "f32", "lifetime": "f32", "ceiling": "u16", "size": "f32", "color": "u32"}}
    - id: "schema:XrRenderable"
      type: "EcsComponentSchema"
      label: "XrRenderable"
      position: {x: 0, y: -2520}
      properties:
        ecsComponent: {"name": "XrRenderable", "fields": {"geometryKind": "u8", "visible": "u8"}}
    - id: "schema:XrRig"
      type: "EcsComponentSchema"
      label: "XrRig"
      position: {x: 0, y: -2280}
      properties:
        ecsComponent: {"name": "XrRig", "fields": {"enabled": "u8"}}
    - id: "schema:XrTransform"
      type: "EcsComponentSchema"
      label: "XrTransform"
      position: {x: 0, y: -2040}
      properties:
        ecsComponent: {"name": "XrTransform", "fields": {"px": "f32", "py": "f32", "pz": "f32", "qx": "f32", "qy": "f32", "qz": "f32", "qw": "f32", "sx": "f32", "sy": "f32", "sz": "f32"}}
    - id: "entity:scene.hero"
      type: "EcsEntity"
      label: "Hero"
      position: {x: 0, y: -1800}
      properties:
        ecsEntity: {"entityRef": "scene.hero", "components": {"XrTransform": {"px": 0, "py": 0, "pz": 0, "qx": 0, "qy": 0, "qz": 0, "qw": 1, "sx": 1, "sy": 1, "sz": 1}, "XrRenderable": {"geometryKind": 0, "visible": 1}, "XrParticleEmitter": {"rate": 12, "lifetime": 0.75, "ceiling": 64, "size": 0.06, "color": 6737151}, "XrRig": {"enabled": 1}}}
    - id: "entity:scene.marker"
      type: "EcsEntity"
      label: "Marker"
      position: {x: 0, y: -1560}
      properties:
        ecsEntity: {"entityRef": "scene.marker", "components": {"XrTransform": {"px": -1.5, "py": -0.5, "pz": 0, "qx": 0, "qy": 0, "qz": 0, "qw": 1, "sx": 1, "sy": 1, "sz": 1}}}
    - id: "action:hero:burst"
      type: "XrBehaviorAction"
      label: "Burst particles"
      position: {x: 0, y: -1320}
      properties:
        xrBehaviorAction: {"actionId": "hero-burst", "kind": "emit-particle-burst", "targetEntityRef": "scene.hero", "parameters": {"count": 8}}
    - id: "behavior:hero:select"
      type: "XrBehaviorTrigger"
      label: "Select hero"
      position: {x: 0, y: -1080}
      properties:
        xrBehaviorTrigger: {"behaviorId": "hero-select", "trigger": "select", "sourceEntityRef": "scene.hero"}
    - id: "xr_v2_demo_entry"
      type: "XrDemoControl"
      label: "Run XR v2 Browser Demo"
      position: {x: 0, y: -840}
      properties:
        role: "lifecycle"
        state: "browser-demo-ready"
        output: "Apply this source document, then run npm run xr-v2:review-ready for the clean browser evidence gate."
    - id: "xr_v2_ac_01"
      type: "XrDemoValidation"
      label: "AC-1 Capability detection"
      position: {x: 0, y: -600}
      properties:
        criterion: "AC-1"
        evidenceState: "source-backed"
        output: "Resolve exactly one pinned capability tier; physical matrix remains external certification."
    - id: "xr_v2_ac_02"
      type: "XrDemoValidation"
      label: "AC-2 Live capture default"
      position: {x: 0, y: -360}
      properties:
        criterion: "AC-2"
        evidenceState: "browser-backed"
        output: "After explicit camera Start, sample the canonical stream through local depth inference and render live DIBR stereo previews; named-device frame budget remains external proof."
    - id: "xr_v2_ac_03"
      type: "XrDemoValidation"
      label: "AC-3 Post-process fallback"
      position: {x: 0, y: -120}
      properties:
        criterion: "AC-3"
        evidenceState: "browser-backed"
        output: "On consecutive frame-budget breaches, continue raw capture and atomically persist the flat asset plus one typed post-process job on save."
    - id: "xr_v2_ac_04"
      type: "XrDemoValidation"
      label: "AC-4 Progressive viewer"
      position: {x: 0, y: 120}
      properties:
        criterion: "AC-4"
        evidenceState: "browser-observable-after-saved-asset-render"
        output: "Keep evidence not-observed until a persisted capture survives reload and explicit open, then two distinct timestamped frames render on an attached depth/Three surface or raw-video playback time advances; listing, selection, canplay, or session entry alone is never evidence."
    - id: "xr_v2_ac_05"
      type: "XrDemoValidation"
      label: "AC-5 iOS constraint"
      position: {x: 0, y: 360}
      properties:
        criterion: "AC-5"
        evidenceState: "source-backed"
        output: "Fail closed from WebXR tiers when platform facts disallow WebXR; named iOS proof remains external."
    - id: "xr_v2_ac_06"
      type: "XrDemoValidation"
      label: "AC-6 ECS composition"
      position: {x: 0, y: 600}
      properties:
        criterion: "AC-6"
        evidenceState: "browser-backed"
        output: "Project the mounted fixture entities and component schemas without duplicate query results."
    - id: "xr_v2_ac_07"
      type: "XrDemoValidation"
      label: "AC-7 Material graph"
      position: {x: 0, y: 840}
      properties:
        criterion: "AC-7"
        evidenceState: "browser-backed"
        output: "Compile and apply the checker material graph to the Hero target."
    - id: "xr_v2_ac_08"
      type: "XrDemoValidation"
      label: "AC-8 Behavior graph"
      position: {x: 0, y: 1080}
      properties:
        criterion: "AC-8"
        evidenceState: "source-backed"
        output: "Dispatch the wired Hero select action exactly once and keep unwired triggers inert."
    - id: "xr_v2_ac_09"
      type: "XrDemoValidation"
      label: "AC-9 Particles"
      position: {x: 0, y: 1320}
      properties:
        criterion: "AC-9"
        evidenceState: "source-backed"
        output: "Keep the Hero emitter within rate, lifetime, and ceiling bounds."
    - id: "xr_v2_ac_10"
      type: "XrDemoValidation"
      label: "AC-10 Timeline"
      position: {x: 0, y: 1560}
      properties:
        criterion: "AC-10"
        evidenceState: "source-backed"
        output: "Interpolate the Hero Arm bone-pose track at the mounted playhead."
    - id: "xr_v2_ac_11"
      type: "XrDemoValidation"
      label: "AC-11 Packaging"
      position: {x: 0, y: 1800}
      properties:
        criterion: "AC-11"
        evidenceState: "browser-observable-after-explicit-action"
        output: "Use Verify packaging on the explicitly opened identity-bound capture; evidence appears only after every pre-mux encoded source sample decodes, the mux preserves exact codec/count/payload bytes, and the mounted WebM advances."
    - id: "xr_v2_ac_12"
      type: "XrDemoValidation"
      label: "AC-12 Connected preview"
      position: {x: 0, y: 2040}
      properties:
        criterion: "AC-12"
        evidenceState: "browser-observable-after-explicit-action"
        output: "Use Run local preview; evidence appears only after an exact mounted-scene edit crosses real WebRTC peers, paints the attached viewer canvas in a later frame, and is then acknowledged within the bound without reload."
    - id: "xr_v2_certification_boundary"
      type: "XrDemoValidation"
      label: "External Physical-device Certification"
      position: {x: 0, y: 2280}
      properties:
        role: "promotion-boundary"
        browserDemoState: "runtime-ready"
        browserLocalMountState: "mounted"
        pinnedContractState: "partial"
        physicalDeviceState: "external-required"
        productionState: "not-claimed"
        output: "Browser demo proof never substitutes for named camera, sensor, headset, device, or Production certification."
    - id: "material:hero"
      type: "XrMaterialGraph"
      label: "Hero checker material"
      position: {x: 0, y: 2520}
      properties:
        xrMaterialGraph: {"schema": "agentic-graph-xr-material-graph/v1", "nodes": [{"id": "albedo", "type": "color", "value": "#336699"}, {"id": "surface", "type": "texture-2d", "assetId": "builtin:checker-v1"}, {"id": "roughness", "type": "number", "value": 0.35}, {"id": "output", "type": "mesh-standard-output", "bindings": {"color": "albedo", "map": "surface", "roughness": "roughness"}}]}
    - id: "timeline:hero"
      type: "XrTimelineSequence"
      label: "Hero arm animation"
      position: {x: 0, y: 2760}
      properties:
        xrTimelineSequence: {"schema": "agentic-graph-xr-timeline-sequence/v1", "durationSeconds": 2, "loop": false, "tracks": [{"id": "arm-pose", "kind": "bone-pose", "targetName": "Arm", "keyframes": [{"timeSeconds": 0, "value": {"translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1]}}, {"timeSeconds": 2, "value": {"translation": [0, 1, 0], "rotation": [0, 1, 0, 0], "scale": [1, 1, 1]}}]}]}
  edges:
    - source: "xr_demo_entry"
      target: "xr_ball_controller"
      label: "select ball"
    - source: "xr_demo_entry"
      target: "xr_rocket_controller"
      label: "select rocket"
    - source: "xr_ball_controller"
      target: "xr_runtime_gate"
      label: "validate"
    - source: "xr_rocket_controller"
      target: "xr_runtime_gate"
      label: "validate"
    - source: "xr_demo_entry"
      target: "xr_edited_media_proof"
      label: "inspect scoped proof"
    - source: "material:hero"
      target: "entity:scene.hero"
      label: "xr-material-target"
    - source: "behavior:hero:select"
      target: "action:hero:burst"
      label: "xr-behavior-wire"
    - source: "timeline:hero"
      target: "entity:scene.hero"
      label: "xr-timeline-target"
    - source: "xr_v2_demo_entry"
      target: "xr_v2_ac_01"
      label: "validate AC-1"
    - source: "xr_v2_ac_01"
      target: "xr_v2_ac_02"
      label: "validate AC-2"
    - source: "xr_v2_ac_02"
      target: "xr_v2_ac_03"
      label: "validate AC-3"
    - source: "xr_v2_ac_03"
      target: "xr_v2_ac_04"
      label: "validate AC-4"
    - source: "xr_v2_ac_04"
      target: "xr_v2_ac_05"
      label: "validate AC-5"
    - source: "xr_v2_ac_05"
      target: "xr_v2_ac_06"
      label: "validate AC-6"
    - source: "xr_v2_ac_06"
      target: "xr_v2_ac_07"
      label: "validate AC-7"
    - source: "xr_v2_ac_07"
      target: "xr_v2_ac_08"
      label: "validate AC-8"
    - source: "xr_v2_ac_08"
      target: "xr_v2_ac_09"
      label: "validate AC-9"
    - source: "xr_v2_ac_09"
      target: "xr_v2_ac_10"
      label: "validate AC-10"
    - source: "xr_v2_ac_10"
      target: "xr_v2_ac_11"
      label: "validate AC-11"
    - source: "xr_v2_ac_11"
      target: "xr_v2_ac_12"
      label: "validate AC-12"
    - source: "xr_v2_ac_12"
      target: "xr_v2_certification_boundary"
      label: "stop at external certification"
---

# AR/VR/XR Runtime-readiness Demo

This Source Files document is the dedicated workspace demo for the immutable
v3.0.0 AR/VR/XR authority. Its source identity is commit
`1272bae345edf0d132e6fc750d5c5c7eade00b29`, Git blob
`ff41649ac8562b62c7c539baed2d226402fdfe51`, and SHA-256
`5067f019a099a94ec02d3f7581963cf2c514ab46bf5a853020df8dfe85d5ef45`.
The mounted browser ledger remains AC-1–AC-12; the authority's AC-14 bridge is
a separate implementation candidate until its exact-revision proof passes,
and later revisions cannot silently expand the demo's evidence claim.

## Run the browser demo

Run `npm run dev`, then apply **Explorer → Source Files → docs →
workspace-seeds → agentic-graph-ar-vr-xr-runtime-readiness-demo.md**. The applied
document activates the existing canonical XR world through the XR v2 runtime
readiness adapter and shared physics lifecycle, and opens Motion Control; this document owns the shared Three/XR world. Run `npm run xr-v2:review-ready` from a clean checkout for the focused
source, unit, and Chromium evidence gate.

The graph source-authors the same ECS schemas, Hero/Marker entities, checker
material graph, exact-once behavior wire, particle emitter, rig, and timeline
sequence used by the mounted XR v2 authoring fixture. The AC-1 through AC-12
validation chain keeps every pinned criterion visible instead of promoting a
narrow edited-media slice into full-contract readiness.

To exercise the spatial-capture path, wait for the closed capability tier, use
**Start** to opt into the canonical Motion Control camera, then use **Start XR
capture**. The bounded local runtime samples that already-authorized stream,
runs the pinned same-origin depth adapter, renders left/right DIBR previews, and
first proves IndexedDB with a bounded real write/delete transaction. It then
persists raw frames plus depth metadata in IndexedDB. Use **Stop & save** to
finalize the raw browser clip and the exact four-field spatial asset metadata.
If consecutive depth/synthesis frames miss the configured budget, raw capture
continues and save atomically writes the flat asset plus one post-process job.
The bounded mounted fallback runner leases queued or expired-running work,
exposes progress, processes an immutable copy of the complete persisted frame
bundle through the admitted local depth adapter when available, and publishes
the upgraded stereo asset only in one owner-fenced atomic commit. Cancellation
requeues the lease; a crash is reclaimed after expiry. A missing model or failed
pass remains a typed degraded state with the original flat capture intact.
The camera remains user-owned and can be stopped independently at any time;
Camera **Stop** cancels spatial capture without waiting for post-processing.
Sensors are a separate opt-in and are never needed for spatial capture.

## Camera and sensor control

Camera and sensor access starts disabled. The production host policy must allow
camera and required sensors for this application origin so the user can choose
to enable them; it must not disable the APIs at the host layer. Actual access
still requires an explicit user action and the browser permission grant. The
user can disable capture or sensors at any time, which must stop tracks,
sessions, and listeners. Denial fails closed to the non-capture viewer without
blocking the workspace.

## Readiness boundary

The v3 local browser demo is runtime-ready for AC-1–AC-12 after its clean
exact-candidate gate. AC-14 remains source-only, and the full pinned contract
remains `partial`. A browser smoke cannot
certify named phone camera/sensor lifecycle, sustained frame budget on reference
hardware, physical-headset behavior, track-preserving mux, or connected viewer
transport. Those are external physical-device and integration certification
gates. Saved captures remain local-first in
IndexedDB. The visible existing Asset Contract Writer preview adds explicit
publish/list/read, deterministic manifests, client SHA/size verification, and
atomic local rehydration without any mount-time request. The inherited shared
blob/document boundary still lacks workspace authentication and server-side
digest recomputation, so Production cross-device promotion and physical
two-device reopen remain blocked. AC-11 and AC-12 are explicit browser-local
validation and make no automatic network, permission, camera, sensor, or
immersive-session request. This seed claims neither Production availability nor
deployment authority.

## Physics Playground

The same Source Files document activates a playable XR physics playground inside the normal agentic-graph workspace. The default Singapore waterfront terrain, player presentations, physics stepping, inputs, controller switching, objective loop, and selectable camera source are owned by agentic-graph runtime modules and need no remote service or downloaded asset.

### Play and author

From the repository root, run `npm run dev`. In agentic-graph, open **Explorer → Source Files → docs → workspace-seeds → agentic-graph-ar-vr-xr-runtime-readiness-demo.md**. Applying this document starts the Beach Ball, playground, camera, and bottom vehicle switcher automatically while Explorer remains available.

Home Apex (`npm run dev:apex`) consumes this same source through **Demo → Physics Playground**. Open **FloatingPanel → Animation** and **BottomPanel → Timeline** when rehearsing; the default keeps Timeline closed to preserve canvas space. Apply a compatible authored motion, choose **0.25x**, then use the previous/next frame controls to pause on consecutive authored frames. The shared frame/FPS readout follows the authored document and disables stepping at its bounds. This samples authored animation and camera tracks; it does not rewind the live physics simulation or a Game Mode mission.

The native objective HUD shows the key-to-treasure objective and provides **Pause / Resume**, **Reset**, and **Replay** after completion. **Motion Control → Start** enables optional local camera input; **Stop** releases it. Pose-input frames are neither stored nor synchronized; explicit XR capture separately saves the authorized spatial clip. Game Mode keeps its existing explicit **Save** action for terminal Decisions.

Use **Timeline → SCENE → Scene appearance** for a look preset, or **FloatingPanel
→ Media → 3D for XR → Scene appearance** for sky, horizon, ground, water,
sunlight, direction, haze, shadows and detail. These edit `kgXrMotionReference.appearance`
in this same source; the Editor, both panels and saved scene agree. Low detail
omits decorative horizon/shore meshes and uses a smaller shadow map. Existing
terrain and Placed Subjects controls swap catalog scenes/assets and edit colour,
position, rotation, scale and motion. Interactive fixtures retain their native
geometry/collision owner. Night flight missions retain their required lighting.

For another device, use the existing **Settings → Workspace sync**: sign in,
enable Online, upload this scene's selected file scope and verify the read-back,
then download it in that workspace on the receiving device. Local conflicts are
retained as separate copies. A local appearance edit alone is not a cloud acknowledgement.

## Source Files storage and refresh

This Git-backed file is the canonical Physics Playground and XR readiness seed. On upgrade, Source Files preserves both retired Playground seed filenames as byte-identical recovered notes under `notes` before removing their old canonical rows. Imported files remain user-owned. After changing it in Dev, restart the serving dev process, reload the page, and use **Source Files → Refresh**; generated demo instances are local working documents. Verify the expected heading or frontmatter change in the editor because Refresh alone may retain an earlier loaded seed. Preserve or export a customized seed before refreshing because canonical seed reconciliation replaces its working copy. A local save, a workspace snapshot upload, and a GitHub commit are distinct results.

The Source Files **Offline: Browser storage** row describes the local layer, not a cloud acknowledgement. Source Files uses IndexedDB for offline working files and retains Git-backed Markdown as the canonical source. The first successful open imports the legacy localStorage snapshot once, preserving its original bytes as a backup. The separate sync engine retains its own IndexedDB database. Browser stores are scoped to the browser origin and app base path and can be removed by clearing site data. A degraded-storage warning means new edits may be held only in memory; export them before closing or reloading. Export important local edits before changing browser, device, or origin. A storage indicator that says **Cloud sync is unavailable** means that no remote acknowledgement is available; it must not be read as synchronized.

For this free-tier MVP, retain local operation without a provider. Configure a real workspace and authenticated transport only when cross-device sync is needed, then require upload/readback agreement and conflict handling before claiming success. The [storage contract](../documents/agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md) owns storage architecture; the [rehearsal plan](../documents/agentic-graph-xr-frame-transport-prd-tad-adr-mvp-gtm.md) records the free-tier recommendation and validation boundaries. This seed adds no provider, database, background polling, or storage schema.

## Scoped XR edited-media evidence

This document projects downstream evidence for `xr-authoring-edited-media-delivery`; applying it starts the native Playground and the readiness controls. It does not load a video sequence, run the dedicated smoke route, or claim that opening the XR choreography Timeline reproduces the edited-media proof.

The checked-in `agentic-graph-xr-v2-readiness/v1` source snapshot remains `source-ready`. Separately, the protected delivery chain is `runtime-ready` for this scope only: reviewed feature commit `fcd69c6b2d42a00779f55be8c1d57a0ab468339b`, protected-refresh head `a6de5722e550e633d0d73f59f187a09ec7388879`, and canonical `main` commit `a3ddfef7cc55c38385520173273abd66010e9747` share the admitted feature lineage. Canonical push run `30895597328` passed **Integration Gate**, selected `npm run xr-v2:review-ready`, and passed the dedicated Chromium edited-media observation. Agentic Canvas OS then reconciled the clean canonical runtime at that exact agentic-graph commit under `agentic-local-runtime-readiness/v1` at revision `217a8a42d6497e059839a6a1f809c2459530ca54`.

To reproduce the focused feature evidence from clean exact canonical agentic-graph `main`, run `npm run xr-v2:review-ready`. It uses the dedicated local XR v2 smoke route and committed same-origin fixture; it does not deploy.

The evidence covers canonical Timeline command routing, browser-native edited-media export, non-empty output, decoded metadata, bounded playback, and resource teardown. It does not establish mounted-renderer material wiring, live depth, a named-device frame budget, camera lifecycle on physical devices, physical-headset behavior, Production availability, or deployment authority. The clean-room editor boundary remains dependency-free and attribution-only; no external editor code, package, generated asset, or runtime/build/test contact is admitted.

## Controls

| Action | Keyboard | Standard gamepad |
|---|---|---|
| Move or steer | W/A/S/D or arrow keys | Left stick |
| Jump or vertical thrust | Space | Primary action |
| Torque or stabilization | Shift | Shoulder action |
| Switch controller | Ball / Rocket buttons | Simulation controls |

The same runtime is MCP-controllable through `agentic-graph.control_local_xr_scene`; use `/xr.physics @canvas #controller operation=develop-run mode=ball`, then `operation=select mode=rocket`, `operation=pause`, `operation=resume`, or `operation=reset`. While this document remains applied, an `exit` transition is immediately reclaimed as a fresh Ball run so the authored editor preview cannot replace the native stage. Applying another document releases the document-owned runtime.

This document is the sole source authority for the Home Apex background, the workspace Physics Playground, and Game Mode when opened from either surface. Game Mode is an optional actor, camera, and controls overlay on this authored world; no standalone Game Mode document, arena, terrain, environment, or second Canvas participates in Home activation.

**FloatingPanel → Game Mode** uses the same React Three Fiber Canvas and authored XR world as **Media**, **Animation**, **Motion Control**, and **Camera**. Its native invocation prefix is exactly `/game.mode @canvas #gameplay`; add one supported operation from **Open**, **Start**, **Stop**, **Restart**, **Fire**, **Reload**, **Save**, or **Exit**. Browser-local WebMCP exposes schema `agentic-graph-game-mode-mcp/v1` through `agentic-graph.inspect_local_game_mode` and `agentic-graph.control_local_game_mode`. The synchronous WebGL probe fails closed before mission start and exposes a visible local unsupported state without mounting another scene or renderer.

Opening Game Mode while XR owns the surface keeps the authored atmosphere, Singapore terrain, props, and exact paused frame visibly mounted in the same Canvas. Only the first-person gameplay camera and actor overlay change. Fallback, renamed, conditional, duplicate, stale, and legacy arena or environment producers are forbidden at source. Start prepares a healthy tick-zero frame and waits for normalized desktop, pointer, touch, Motion Control, or MCP engagement before deterministic ticks begin. Stop followed by Start resumes the exact in-memory Game Mode tick and state. Exiting restores XR input and simulation ownership so its deterministic stage continues. Switching the FloatingPanel among Media, Animation, Motion Control, Game Mode, and Camera preserves the same Canvas and authored scene. Motion Control remains an optional normalized player-input source only; its camera/LiteRT pipeline never becomes the four-action NPC decision policy.

Terminal Game Mode results remain pending and are not auto-saved. **Save** is the only operation that persists validated game Decisions through browser-local WorkspaceFs. Malformed saved bytes remain intact and block **Start** and **Restart** until the operator explicitly chooses **Reset local save**.

Camera source is independent of controller and object selection. In **FloatingPanel Camera → SHOOT**, choose **Fixed Follow** for stage-aware tracking or **Free Orbit** for direct pan, rotate, and zoom. The same choice is invocable through `agentic-graph.control_local_camera` with `/camera.select @camera #camera camera=fixed-follow` or `camera=free-orbit`. Timeline camera-mark playback temporarily takes framing ownership, then returns to the selected source.

The ball rolls across the terrain, jumps only from supported contact, retains bounded air steering, and exposes a stronger torque response while the modifier is held. The rocket applies directional and vertical thrust, visualizes bounded tilt and live exhaust, dampens rotation, and uses the modifier to stabilize toward upright. Rocket altitude stays within the authored terrain scale while the single camera raises and widens into a bounded aerial composition of the procedural Singapore waterfront and skyline.

XR authoring uses the same persisted scene owner. **Terrain / Environment** defaults to **Singapore** and remains catalog-driven for future terrain IDs. The Singapore first frame is a native procedural waterfront composition with Marina Bay towers, the Singapore Flyer, Gardens by the Bay, and source-authored selectable **Helicopter**, **Airplane**, and **Car** subjects. Those subjects use the same persisted 3D Objects / Assets path as anything placed from Media: select them on the Canvas, frame them with Camera, transform or replace their catalog asset, and remove them without a parallel showcase state. **Add 3D Object / Asset** defaults to **Helicopter** and exposes **Helicopter**, **Airplane**, **Car**, and **Ball** as native procedural library choices. Placed subjects remain visible while the controller demo runs and can change asset without changing subject ID, transform, custom label, or persistence path; untouched catalog-default labels and colors follow the selected asset. Buildings, landmark trees, roads, and waterfront geometry remain fixed environment-kit set dressing rather than selectable subjects.

Find the procedural key near the grotto, then return to the treasure chest to unlock it. Barrels, bowling pins, and timed cannonballs share the same deterministic collision world with both vehicles. Press `R` to restore the Beach Ball, player, interactive props, key, treasure, and selected objective state.

Switching between Ball and Rocket changes the active controller and procedural presentation while preserving the simulated body position and velocity. Pause, Resume, and Reset remain deterministic lifecycle actions. Fixed Follow eases toward the active body without creating a second camera owner; selecting Helicopter, Airplane, Car, or another authored object does not change the camera source.

## Validation

Run `npm run xr-v2:review-ready` on the clean candidate for source, runtime, and browser evidence. The separate physical-device and Production boundaries above remain explicit.
