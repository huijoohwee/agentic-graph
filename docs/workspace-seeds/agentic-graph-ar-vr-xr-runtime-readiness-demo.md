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
kgFloatingPanelView: animation
kgBottomPanelOpen: true
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
  schema: agentic-graph-xr-motion-reference/v1
  castSource: subjects-only
  stageId: singapore
  appearance:
    skyColor: '#cddbe6'
    fogColor: '#dce5eb'
    groundColor: '#a9bac6'
    waterColor: '#6a96ad'
    lightColor: '#ffffff'
    lightIntensity: 1.3
    sunAzimuthDegrees: -35
    fogDistanceMeters: 120
    detail: low
    shadows: true
  durationSeconds: 28
  fps: 12
  subjects:
    - id: xr-subject:wolf:1
      assetId: person-adult
      label: The Wolf
      color: '#7c3aed'
      position:
        - -7.4
        - 0
        - 2.6
      rotationYDegrees: 24
      scale: 1.12
    - id: xr-subject:first-pig:1
      assetId: person-child
      label: First Pig
      color: '#f97316'
      position:
        - -3.5
        - 0
        - 1.8
      rotationYDegrees: -18
      scale: 1
    - id: xr-subject:second-pig:1
      assetId: person-child
      label: Second Pig
      color: '#fb7185'
      position:
        - 0.8
        - 0
        - -0.9
      rotationYDegrees: -30
      scale: 1
    - id: xr-subject:third-pig:1
      assetId: person-child
      label: Third Pig
      color: '#38bdf8'
      position:
        - 4.8
        - 0
        - -4.4
      rotationYDegrees: -150
      scale: 1
    - id: xr-subject:straw-house:1
      assetId: prop-crate
      label: Straw House
      color: '#fde68a'
      position:
        - -3.9
        - 0
        - 1.6
      rotationYDegrees: 8
      scale: 1.55
    - id: xr-subject:stick-house:1
      assetId: prop-crate
      label: Stick House
      color: '#c08457'
      position:
        - 0.8
        - 0
        - -0.8
      rotationYDegrees: -12
      scale: 1.65
    - id: xr-subject:brick-house:1
      assetId: prop-crate
      label: Brick House
      color: '#b45309'
      position:
        - 4.8
        - 0
        - -4.2
      rotationYDegrees: 0
      scale: 1.85
    - id: xr-subject:oak:1
      assetId: prop-tree
      label: Oak
      color: '#84cc16'
      position:
        - -8.4
        - 0
        - 1.4
      rotationYDegrees: 0
      scale: 1.15
    - id: xr-subject:soup-pot:1
      assetId: prop-crate
      label: Soup Pot
      color: '#64748b'
      position:
        - 5.4
        - 0
        - -3.3
      rotationYDegrees: 0
      scale: 0.55
  cast:
    - actorId: xr-subject:wolf:1
      label: The Wolf
      animation: null
      marks:
        - timeSeconds: 0
          position:
            - -7.4
            - 0
            - 2.6
          transition: hold
          gait: walk
        - timeSeconds: 3.5
          position:
            - -4.9
            - 0
            - 2
          transition: linear
          gait: walk
        - timeSeconds: 7.8
          position:
            - -0.7
            - 0
            - -0.2
          transition: linear
          gait: walk
        - timeSeconds: 12.4
          position:
            - 3.7
            - 0
            - -3.5
          transition: linear
          gait: walk
        - timeSeconds: 20.2
          position:
            - 4.9
            - 0
            - -3.9
          transition: hold
          gait: walk
        - timeSeconds: 25.6
          position:
            - 7.6
            - 0
            - -1.6
          transition: linear
          gait: run
    - actorId: xr-subject:first-pig:1
      label: First Pig
      animation: null
      marks:
        - timeSeconds: 0
          position:
            - -3.5
            - 0
            - 1.8
          transition: hold
          gait: walk
        - timeSeconds: 4.2
          position:
            - -0.2
            - 0
            - 0.5
          transition: linear
          gait: run
        - timeSeconds: 7.8
          position:
            - 2.2
            - 0
            - -1.8
          transition: linear
          gait: run
    - actorId: xr-subject:second-pig:1
      label: Second Pig
      animation: null
      marks:
        - timeSeconds: 0
          position:
            - 0.8
            - 0
            - -0.9
          transition: hold
          gait: walk
        - timeSeconds: 8.4
          position:
            - 2.4
            - 0
            - -2.4
          transition: linear
          gait: run
        - timeSeconds: 12.4
          position:
            - 4
            - 0
            - -3.7
          transition: hold
          gait: walk
    - actorId: xr-subject:third-pig:1
      label: Third Pig
      animation: null
      marks:
        - timeSeconds: 0
          position:
            - 4.8
            - 0
            - -4.4
          transition: hold
          gait: walk
        - timeSeconds: 20.2
          position:
            - 4.8
            - 0
            - -4.4
          transition: hold
          gait: walk
        - timeSeconds: 25.6
          position:
            - 4.8
            - 0
            - -4.4
          transition: linear
          gait: walk
  camera:
    - timeSeconds: 0
      anchorId: xr-subject:first-pig:1
      moveId: drone-follow
      rig: dolly
      easing: hold
      settings:
        shot: medium
        orbitX: -0.18
        orbitY: -0.12
        focalLengthMm: 42
        focusDistanceMeters: 6
    - timeSeconds: 4.2
      anchorId: xr-subject:wolf:1
      moveId: orbit-clockwise
      rig: handheld
      easing: linear
      settings:
        shot: medium
        orbitX: 0.34
        orbitY: 0.02
        focalLengthMm: 50
        focusDistanceMeters: 5.5
    - timeSeconds: 8.4
      anchorId: xr-subject:second-pig:1
      moveId: drone-follow
      rig: steadicam
      easing: linear
      settings:
        shot: medium
        orbitX: -0.22
        orbitY: -0.08
        focalLengthMm: 46
        focusDistanceMeters: 6.2
    - timeSeconds: 12.4
      anchorId: xr-subject:third-pig:1
      moveId: crane-rise
      rig: crane
      easing: linear
      settings:
        shot: wide
        orbitX: -0.04
        orbitY: -0.46
        focalLengthMm: 35
        focusDistanceMeters: 8.5
    - timeSeconds: 20.2
      anchorId: xr-subject:wolf:1
      moveId: crane-descend
      rig: handheld
      easing: linear
      settings:
        shot: close-up
        orbitX: 0.12
        orbitY: 0.36
        focalLengthMm: 72
        focusDistanceMeters: 4.5
    - timeSeconds: 25.6
      anchorId: xr-subject:third-pig:1
      moveId: drone-follow
      rig: dolly
      easing: hold
      settings:
        shot: wide
        orbitX: -0.16
        orbitY: -0.18
        focalLengthMm: 32
        focusDistanceMeters: 9
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
  playable: true
  default_floating_panel_view: "animation"
  default_bottom_panel_tab: "timeline"
  synchronized_asides: true
  playable_script_id: "three-little-pigs-long-sea-journey"
  quarter_speed: "/animation.control @canvas operation=play rate=0.25"
  next_frame: "/animation.control @canvas operation=scrub frame=next"
  previous_frame: "/animation.control @canvas operation=scrub frame=previous"
  scope: "authored animation and camera tracks; interactive physics and Game Mode are not rewound"
  load_policy: "open Animation and BottomPanel Timeline on demand"
flow:
  direction: {key: direction, type: string, value: "LR"}
  edgeType: {key: edgeType, type: string, value: "smoothstep"}
  balancedViewportPreset: {key: balancedViewportPreset, type: string, value: "widgetFrontmatter"}
  nodes:
    - id: {key: id, type: string, value: "xr_demo_entry"}
      type: {key: type, type: string, value: "XrDemoControl"}
      label: {key: label, type: string, value: "Develop and Run"}
      position: {key: position, type: object, value: {"x":0,"y":0}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_demo_entry"}
      "frontmatter:autoSeededPos": {key: "frontmatter:autoSeededPos", type: boolean, value: true}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 3}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 0}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 3}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Apply this Source Files document to launch the native demo, then switch controllers without resetting motion."}
      properties: {key: properties, type: object, value: {"role":"lifecycle","state":"runtime-ready","output":"Apply this Source Files document to launch the native demo, then switch controllers without resetting motion."}}
      role: {key: role, type: string, value: "lifecycle"}
      state: {key: state, type: string, value: "runtime-ready"}
      "visual:importance": {key: "visual:importance", type: number, value: 24}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 16.928203230275507}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 0}
    - id: {key: id, type: string, value: "xr_ball_controller"}
      type: {key: type, type: string, value: "XrDemoController"}
      label: {key: label, type: string, value: "Ball Controller"}
      position: {key: position, type: object, value: {"x":360,"y":260}}
      controllerId: {key: controllerId, type: string, value: "ball"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_ball_controller"}
      "frontmatter:autoSeededPos": {key: "frontmatter:autoSeededPos", type: boolean, value: true}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Roll, jump, steer in air, and apply modifier torque."}
      properties: {key: properties, type: object, value: {"role":"controller","controllerId":"ball","output":"Roll, jump, steer in air, and apply modifier torque."}}
      role: {key: role, type: string, value: "controller"}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 1}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 1}
    - id: {key: id, type: string, value: "xr_rocket_controller"}
      type: {key: type, type: string, value: "XrDemoController"}
      label: {key: label, type: string, value: "Rocket Controller"}
      position: {key: position, type: object, value: {"x":360,"y":0}}
      controllerId: {key: controllerId, type: string, value: "rocket"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_rocket_controller"}
      "frontmatter:autoSeededPos": {key: "frontmatter:autoSeededPos", type: boolean, value: true}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Thrust, tilt, steer laterally, and stabilize with the modifier."}
      properties: {key: properties, type: object, value: {"role":"controller","controllerId":"rocket","output":"Thrust, tilt, steer laterally, and stabilize with the modifier."}}
      role: {key: role, type: string, value: "controller"}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 1}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 0}
    - id: {key: id, type: string, value: "xr_runtime_gate"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "Native Runtime Gate"}
      position: {key: position, type: object, value: {"x":720,"y":260}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_runtime_gate"}
      "frontmatter:autoSeededPos": {key: "frontmatter:autoSeededPos", type: boolean, value: true}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 2}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 0}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Verify deterministic stepping, controller switching, camera follow, keyboard input, and gamepad input."}
      properties: {key: properties, type: object, value: {"role":"validation","state":"runtime-ready","output":"Verify deterministic stepping, controller switching, camera follow, keyboard input, and gamepad input."}}
      role: {key: role, type: string, value: "validation"}
      state: {key: state, type: string, value: "runtime-ready"}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 2}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 1}
    - id: {key: id, type: string, value: "xr_edited_media_proof"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "Scoped Edited-media Proof"}
      position: {key: position, type: object, value: {"x":720,"y":520}}
      broaderXrState: {key: broaderXrState, type: string, value: "blocked"}
      canonicalDeliveryState: {key: canonicalDeliveryState, type: string, value: "runtime-ready"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_edited_media_proof"}
      "frontmatter:autoSeededPos": {key: "frontmatter:autoSeededPos", type: boolean, value: true}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 1}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 0}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Inspect the protected-main XR v2 review gate and canonical runtime receipt; applying this seed does not rerun the browser smoke."}
      properties: {key: properties, type: object, value: {"role":"downstream canonical-main evidence projection","scope":"xr-authoring-edited-media-delivery","sourceSnapshotState":"source-ready","canonicalDeliveryState":"runtime-ready","broaderXrState":"blocked","output":"Inspect the protected-main XR v2 review gate and canonical runtime receipt; applying this seed does not rerun the browser smoke."}}
      role: {key: role, type: string, value: "downstream canonical-main evidence projection"}
      scope: {key: scope, type: string, value: "xr-authoring-edited-media-delivery"}
      sourceSnapshotState: {key: sourceSnapshotState, type: string, value: "source-ready"}
      "visual:importance": {key: "visual:importance", type: number, value: 16}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 14}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 2}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 2}
    - id: {key: id, type: string, value: "schema:XrParticleEmitter"}
      type: {key: type, type: string, value: "EcsComponentSchema"}
      label: {key: label, type: string, value: "XrParticleEmitter"}
      position: {key: position, type: object, value: {"x":0,"y":-2760}}
      ecsComponent: {key: ecsComponent, type: object, value: {"name":"XrParticleEmitter","fields":{"rate":"f32","lifetime":"f32","ceiling":"u16","size":"f32","color":"u32"}}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:schema:XrParticleEmitter"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 0}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 0}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 0}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      properties: {key: properties, type: object, value: {"ecsComponent":{"name":"XrParticleEmitter","fields":{"rate":"f32","lifetime":"f32","ceiling":"u16","size":"f32","color":"u32"}}}}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: -13}
    - id: {key: id, type: string, value: "schema:XrRenderable"}
      type: {key: type, type: string, value: "EcsComponentSchema"}
      label: {key: label, type: string, value: "XrRenderable"}
      position: {key: position, type: object, value: {"x":0,"y":-2520}}
      ecsComponent: {key: ecsComponent, type: object, value: {"name":"XrRenderable","fields":{"geometryKind":"u8","visible":"u8"}}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:schema:XrRenderable"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 0}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 0}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 0}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      properties: {key: properties, type: object, value: {"ecsComponent":{"name":"XrRenderable","fields":{"geometryKind":"u8","visible":"u8"}}}}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: -12}
    - id: {key: id, type: string, value: "schema:XrRig"}
      type: {key: type, type: string, value: "EcsComponentSchema"}
      label: {key: label, type: string, value: "XrRig"}
      position: {key: position, type: object, value: {"x":0,"y":-2280}}
      ecsComponent: {key: ecsComponent, type: object, value: {"name":"XrRig","fields":{"enabled":"u8"}}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:schema:XrRig"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 0}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 0}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 0}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      properties: {key: properties, type: object, value: {"ecsComponent":{"name":"XrRig","fields":{"enabled":"u8"}}}}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: -11}
    - id: {key: id, type: string, value: "schema:XrTransform"}
      type: {key: type, type: string, value: "EcsComponentSchema"}
      label: {key: label, type: string, value: "XrTransform"}
      position: {key: position, type: object, value: {"x":0,"y":-2040}}
      ecsComponent: {key: ecsComponent, type: object, value: {"name":"XrTransform","fields":{"px":"f32","py":"f32","pz":"f32","qx":"f32","qy":"f32","qz":"f32","qw":"f32","sx":"f32","sy":"f32","sz":"f32"}}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:schema:XrTransform"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 0}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 0}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 0}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      properties: {key: properties, type: object, value: {"ecsComponent":{"name":"XrTransform","fields":{"px":"f32","py":"f32","pz":"f32","qx":"f32","qy":"f32","qz":"f32","qw":"f32","sx":"f32","sy":"f32","sz":"f32"}}}}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: -10}
    - id: {key: id, type: string, value: "entity:scene.hero"}
      type: {key: type, type: string, value: "EcsEntity"}
      label: {key: label, type: string, value: "Hero"}
      position: {key: position, type: object, value: {"x":0,"y":-1800}}
      ecsEntity: {key: ecsEntity, type: object, value: {"entityRef":"scene.hero","components":{"XrTransform":{"px":0,"py":0,"pz":0,"qx":0,"qy":0,"qz":0,"qw":1,"sx":1,"sy":1,"sz":1},"XrRenderable":{"geometryKind":0,"visible":1},"XrParticleEmitter":{"rate":12,"lifetime":0.75,"ceiling":64,"size":0.06,"color":6737151},"XrRig":{"enabled":1}}}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:entity:scene.hero"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 0}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 0}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 0}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      properties: {key: properties, type: object, value: {"ecsEntity":{"entityRef":"scene.hero","components":{"XrTransform":{"px":0,"py":0,"pz":0,"qx":0,"qy":0,"qz":0,"qw":1,"sx":1,"sy":1,"sz":1},"XrRenderable":{"geometryKind":0,"visible":1},"XrParticleEmitter":{"rate":12,"lifetime":0.75,"ceiling":64,"size":0.06,"color":6737151},"XrRig":{"enabled":1}}}}}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: -9}
    - id: {key: id, type: string, value: "entity:scene.marker"}
      type: {key: type, type: string, value: "EcsEntity"}
      label: {key: label, type: string, value: "Marker"}
      position: {key: position, type: object, value: {"x":0,"y":-1560}}
      ecsEntity: {key: ecsEntity, type: object, value: {"entityRef":"scene.marker","components":{"XrTransform":{"px":-1.5,"py":-0.5,"pz":0,"qx":0,"qy":0,"qz":0,"qw":1,"sx":1,"sy":1,"sz":1}}}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:entity:scene.marker"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 0}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 0}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 0}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      properties: {key: properties, type: object, value: {"ecsEntity":{"entityRef":"scene.marker","components":{"XrTransform":{"px":-1.5,"py":-0.5,"pz":0,"qx":0,"qy":0,"qz":0,"qw":1,"sx":1,"sy":1,"sz":1}}}}}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: -8}
    - id: {key: id, type: string, value: "action:hero:burst"}
      type: {key: type, type: string, value: "XrBehaviorAction"}
      label: {key: label, type: string, value: "Burst particles"}
      position: {key: position, type: object, value: {"x":0,"y":-1320}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:action:hero:burst"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 1}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 0}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      properties: {key: properties, type: object, value: {"xrBehaviorAction":{"actionId":"hero-burst","kind":"emit-particle-burst","targetEntityRef":"scene.hero","parameters":{"count":8}}}}
      "visual:importance": {key: "visual:importance", type: number, value: 16}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 14}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: -6}
      xrBehaviorAction: {key: xrBehaviorAction, type: object, value: {"actionId":"hero-burst","kind":"emit-particle-burst","targetEntityRef":"scene.hero","parameters":{"count":8}}}
    - id: {key: id, type: string, value: "behavior:hero:select"}
      type: {key: type, type: string, value: "XrBehaviorTrigger"}
      label: {key: label, type: string, value: "Select hero"}
      position: {key: position, type: object, value: {"x":0,"y":-1080}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:behavior:hero:select"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 1}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 0}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      properties: {key: properties, type: object, value: {"xrBehaviorTrigger":{"behaviorId":"hero-select","trigger":"select","sourceEntityRef":"scene.hero"}}}
      "visual:importance": {key: "visual:importance", type: number, value: 16}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 14}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: -5}
      xrBehaviorTrigger: {key: xrBehaviorTrigger, type: object, value: {"behaviorId":"hero-select","trigger":"select","sourceEntityRef":"scene.hero"}}
    - id: {key: id, type: string, value: "xr_v2_demo_entry"}
      type: {key: type, type: string, value: "XrDemoControl"}
      label: {key: label, type: string, value: "Run XR v2 Browser Demo"}
      position: {key: position, type: object, value: {"x":0,"y":-840}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_demo_entry"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 1}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 0}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Apply this source document, then run npm run xr-v2:review-ready for the clean browser evidence gate."}
      properties: {key: properties, type: object, value: {"role":"lifecycle","state":"browser-demo-ready","output":"Apply this source document, then run npm run xr-v2:review-ready for the clean browser evidence gate."}}
      role: {key: role, type: string, value: "lifecycle"}
      state: {key: state, type: string, value: "browser-demo-ready"}
      "visual:importance": {key: "visual:importance", type: number, value: 16}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 14}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: -4}
    - id: {key: id, type: string, value: "xr_v2_ac_01"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "AC-1 Capability detection"}
      position: {key: position, type: object, value: {"x":0,"y":-600}}
      criterion: {key: criterion, type: string, value: "AC-1"}
      evidenceState: {key: evidenceState, type: string, value: "source-backed"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_ac_01"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Resolve exactly one pinned capability tier; physical matrix remains external certification."}
      properties: {key: properties, type: object, value: {"criterion":"AC-1","evidenceState":"source-backed","output":"Resolve exactly one pinned capability tier; physical matrix remains external certification."}}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: -3}
    - id: {key: id, type: string, value: "xr_v2_ac_02"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "AC-2 Live capture default"}
      position: {key: position, type: object, value: {"x":0,"y":-360}}
      criterion: {key: criterion, type: string, value: "AC-2"}
      evidenceState: {key: evidenceState, type: string, value: "browser-backed"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_ac_02"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "After explicit camera Start, sample the canonical stream through local depth inference and render live DIBR stereo previews; named-device frame budget remains external proof."}
      properties: {key: properties, type: object, value: {"criterion":"AC-2","evidenceState":"browser-backed","output":"After explicit camera Start, sample the canonical stream through local depth inference and render live DIBR stereo previews; named-device frame budget remains external proof."}}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: -2}
    - id: {key: id, type: string, value: "xr_v2_ac_03"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "AC-3 Post-process fallback"}
      position: {key: position, type: object, value: {"x":0,"y":-120}}
      criterion: {key: criterion, type: string, value: "AC-3"}
      evidenceState: {key: evidenceState, type: string, value: "browser-backed"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_ac_03"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "On consecutive frame-budget breaches, continue raw capture and atomically persist the flat asset plus one typed post-process job on save."}
      properties: {key: properties, type: object, value: {"criterion":"AC-3","evidenceState":"browser-backed","output":"On consecutive frame-budget breaches, continue raw capture and atomically persist the flat asset plus one typed post-process job on save."}}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: -1}
    - id: {key: id, type: string, value: "xr_v2_ac_04"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "AC-4 Progressive viewer"}
      position: {key: position, type: object, value: {"x":0,"y":120}}
      criterion: {key: criterion, type: string, value: "AC-4"}
      evidenceState: {key: evidenceState, type: string, value: "browser-observable-after-saved-asset-render"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_ac_04"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Keep evidence not-observed until a persisted capture survives reload and explicit open, then two distinct timestamped frames render on an attached depth/Three surface or raw-video playback time advances; listing, selection, canplay, or session entry alone is never evidence."}
      properties: {key: properties, type: object, value: {"criterion":"AC-4","evidenceState":"browser-observable-after-saved-asset-render","output":"Keep evidence not-observed until a persisted capture survives reload and explicit open, then two distinct timestamped frames render on an attached depth/Three surface or raw-video playback time advances; listing, selection, canplay, or session entry alone is never evidence."}}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 0}
    - id: {key: id, type: string, value: "xr_v2_ac_05"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "AC-5 iOS constraint"}
      position: {key: position, type: object, value: {"x":0,"y":360}}
      criterion: {key: criterion, type: string, value: "AC-5"}
      evidenceState: {key: evidenceState, type: string, value: "source-backed"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_ac_05"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Fail closed from WebXR tiers when platform facts disallow WebXR; named iOS proof remains external."}
      properties: {key: properties, type: object, value: {"criterion":"AC-5","evidenceState":"source-backed","output":"Fail closed from WebXR tiers when platform facts disallow WebXR; named iOS proof remains external."}}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 1}
    - id: {key: id, type: string, value: "xr_v2_ac_06"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "AC-6 ECS composition"}
      position: {key: position, type: object, value: {"x":0,"y":600}}
      criterion: {key: criterion, type: string, value: "AC-6"}
      evidenceState: {key: evidenceState, type: string, value: "browser-backed"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_ac_06"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Project the mounted fixture entities and component schemas without duplicate query results."}
      properties: {key: properties, type: object, value: {"criterion":"AC-6","evidenceState":"browser-backed","output":"Project the mounted fixture entities and component schemas without duplicate query results."}}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 2}
    - id: {key: id, type: string, value: "xr_v2_ac_07"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "AC-7 Material graph"}
      position: {key: position, type: object, value: {"x":0,"y":840}}
      criterion: {key: criterion, type: string, value: "AC-7"}
      evidenceState: {key: evidenceState, type: string, value: "browser-backed"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_ac_07"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Compile and apply the checker material graph to the Hero target."}
      properties: {key: properties, type: object, value: {"criterion":"AC-7","evidenceState":"browser-backed","output":"Compile and apply the checker material graph to the Hero target."}}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 3}
    - id: {key: id, type: string, value: "xr_v2_ac_08"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "AC-8 Behavior graph"}
      position: {key: position, type: object, value: {"x":0,"y":1080}}
      criterion: {key: criterion, type: string, value: "AC-8"}
      evidenceState: {key: evidenceState, type: string, value: "source-backed"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_ac_08"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Dispatch the wired Hero select action exactly once and keep unwired triggers inert."}
      properties: {key: properties, type: object, value: {"criterion":"AC-8","evidenceState":"source-backed","output":"Dispatch the wired Hero select action exactly once and keep unwired triggers inert."}}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 4}
    - id: {key: id, type: string, value: "xr_v2_ac_09"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "AC-9 Particles"}
      position: {key: position, type: object, value: {"x":0,"y":1320}}
      criterion: {key: criterion, type: string, value: "AC-9"}
      evidenceState: {key: evidenceState, type: string, value: "source-backed"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_ac_09"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Keep the Hero emitter within rate, lifetime, and ceiling bounds."}
      properties: {key: properties, type: object, value: {"criterion":"AC-9","evidenceState":"source-backed","output":"Keep the Hero emitter within rate, lifetime, and ceiling bounds."}}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 6}
    - id: {key: id, type: string, value: "xr_v2_ac_10"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "AC-10 Timeline"}
      position: {key: position, type: object, value: {"x":0,"y":1560}}
      criterion: {key: criterion, type: string, value: "AC-10"}
      evidenceState: {key: evidenceState, type: string, value: "source-backed"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_ac_10"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Interpolate the Hero Arm bone-pose track at the mounted playhead."}
      properties: {key: properties, type: object, value: {"criterion":"AC-10","evidenceState":"source-backed","output":"Interpolate the Hero Arm bone-pose track at the mounted playhead."}}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 7}
    - id: {key: id, type: string, value: "xr_v2_ac_11"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "AC-11 Packaging"}
      position: {key: position, type: object, value: {"x":0,"y":1800}}
      criterion: {key: criterion, type: string, value: "AC-11"}
      evidenceState: {key: evidenceState, type: string, value: "browser-observable-after-explicit-action"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_ac_11"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Use Verify packaging on the explicitly opened identity-bound capture; evidence appears only after every pre-mux encoded source sample decodes, the mux preserves exact codec/count/payload bytes, and the mounted WebM advances."}
      properties: {key: properties, type: object, value: {"criterion":"AC-11","evidenceState":"browser-observable-after-explicit-action","output":"Use Verify packaging on the explicitly opened identity-bound capture; evidence appears only after every pre-mux encoded source sample decodes, the mux preserves exact codec/count/payload bytes, and the mounted WebM advances."}}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 8}
    - id: {key: id, type: string, value: "xr_v2_ac_12"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "AC-12 Connected preview"}
      position: {key: position, type: object, value: {"x":0,"y":2040}}
      criterion: {key: criterion, type: string, value: "AC-12"}
      evidenceState: {key: evidenceState, type: string, value: "browser-observable-after-explicit-action"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_ac_12"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 2}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 1}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Use Run local preview; evidence appears only after an exact mounted-scene edit crosses real WebRTC peers, paints the attached viewer canvas in a later frame, and is then acknowledged within the bound without reload."}
      properties: {key: properties, type: object, value: {"criterion":"AC-12","evidenceState":"browser-observable-after-explicit-action","output":"Use Run local preview; evidence appears only after an exact mounted-scene edit crosses real WebRTC peers, paints the attached viewer canvas in a later frame, and is then acknowledged within the bound without reload."}}
      "visual:importance": {key: "visual:importance", type: number, value: 20}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 15.65685424949238}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 9}
    - id: {key: id, type: string, value: "xr_v2_certification_boundary"}
      type: {key: type, type: string, value: "XrDemoValidation"}
      label: {key: label, type: string, value: "External Physical-device Certification"}
      position: {key: position, type: object, value: {"x":0,"y":2280}}
      browserDemoState: {key: browserDemoState, type: string, value: "runtime-ready"}
      browserLocalMountState: {key: browserLocalMountState, type: string, value: "mounted"}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:xr_v2_certification_boundary"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 1}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 1}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 0}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      output: {key: output, type: string, value: "Browser demo proof never substitutes for named camera, sensor, headset, device, or Production certification."}
      physicalDeviceState: {key: physicalDeviceState, type: string, value: "external-required"}
      pinnedContractState: {key: pinnedContractState, type: string, value: "partial"}
      productionState: {key: productionState, type: string, value: "not-claimed"}
      properties: {key: properties, type: object, value: {"role":"promotion-boundary","browserDemoState":"runtime-ready","browserLocalMountState":"mounted","pinnedContractState":"partial","physicalDeviceState":"external-required","productionState":"not-claimed","output":"Browser demo proof never substitutes for named camera, sensor, headset, device, or Production certification."}}
      role: {key: role, type: string, value: "promotion-boundary"}
      "visual:importance": {key: "visual:importance", type: number, value: 16}
      "visual:nodeSize": {key: "visual:nodeSize", type: number, value: 14}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 10}
    - id: {key: id, type: string, value: "material:hero"}
      type: {key: type, type: string, value: "XrMaterialGraph"}
      label: {key: label, type: string, value: "Hero checker material"}
      position: {key: position, type: object, value: {"x":0,"y":2520}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:material:hero"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 0}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 0}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 0}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      properties: {key: properties, type: object, value: {"xrMaterialGraph":{"schema":"agentic-graph-xr-material-graph/v1","nodes":[{"id":"albedo","type":"color","value":"#336699"},{"id":"surface","type":"texture-2d","assetId":"builtin:checker-v1"},{"id":"roughness","type":"number","value":0.35},{"id":"output","type":"mesh-standard-output","bindings":{"color":"albedo","map":"surface","roughness":"roughness"}}]}}}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 11}
      xrMaterialGraph: {key: xrMaterialGraph, type: object, value: {"schema":"agentic-graph-xr-material-graph/v1","nodes":[{"id":"albedo","type":"color","value":"#336699"},{"id":"surface","type":"texture-2d","assetId":"builtin:checker-v1"},{"id":"roughness","type":"number","value":0.35},{"id":"output","type":"mesh-standard-output","bindings":{"color":"albedo","map":"surface","roughness":"roughness"}}]}}
    - id: {key: id, type: string, value: "timeline:hero"}
      type: {key: type, type: string, value: "XrTimelineSequence"}
      label: {key: label, type: string, value: "Hero arm animation"}
      position: {key: position, type: object, value: {"x":0,"y":2760}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:timeline:hero"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      "graph:degree": {key: "graph:degree", type: number, value: 0}
      "graph:inDegree": {key: "graph:inDegree", type: number, value: 0}
      "graph:outDegree": {key: "graph:outDegree", type: number, value: 0}
      "graph:structuralDegree": {key: "graph:structuralDegree", type: number, value: 0}
      properties: {key: properties, type: object, value: {"xrTimelineSequence":{"schema":"agentic-graph-xr-timeline-sequence/v1","durationSeconds":2,"loop":false,"tracks":[{"id":"arm-pose","kind":"bone-pose","targetName":"Arm","keyframes":[{"timeSeconds":0,"value":{"translation":[0,0,0],"rotation":[0,0,0,1],"scale":[1,1,1]}},{"timeSeconds":2,"value":{"translation":[0,1,0],"rotation":[0,1,0,0],"scale":[1,1,1]}}]}]}}}
      "visual:xIndex": {key: "visual:xIndex", type: number, value: 0}
      "visual:yIndex": {key: "visual:yIndex", type: number, value: 12}
      xrTimelineSequence: {key: xrTimelineSequence, type: object, value: {"schema":"agentic-graph-xr-timeline-sequence/v1","durationSeconds":2,"loop":false,"tracks":[{"id":"arm-pose","kind":"bone-pose","targetName":"Arm","keyframes":[{"timeSeconds":0,"value":{"translation":[0,0,0],"rotation":[0,0,0,1],"scale":[1,1,1]}},{"timeSeconds":2,"value":{"translation":[0,1,0],"rotation":[0,1,0,0],"scale":[1,1,1]}}]}]}}
  edges:
    - id: {key: id, type: string, value: "flow-e01"}
      source: {key: source, type: string, value: "xr_demo_entry"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_ball_controller"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "select ball"}
    - id: {key: id, type: string, value: "flow-e02"}
      source: {key: source, type: string, value: "xr_demo_entry"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_rocket_controller"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "select rocket"}
    - id: {key: id, type: string, value: "flow-e03"}
      source: {key: source, type: string, value: "xr_ball_controller"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_runtime_gate"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate"}
    - id: {key: id, type: string, value: "flow-e04"}
      source: {key: source, type: string, value: "xr_rocket_controller"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_runtime_gate"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate"}
    - id: {key: id, type: string, value: "flow-e05"}
      source: {key: source, type: string, value: "xr_demo_entry"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_edited_media_proof"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "inspect scoped proof"}
    - id: {key: id, type: string, value: "flow-e06"}
      source: {key: source, type: string, value: "material:hero"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "entity:scene.hero"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "xr-material-target"}
      properties: {key: properties, type: object, value: {"graph:endpointState":"unresolved"}}
    - id: {key: id, type: string, value: "flow-e07"}
      source: {key: source, type: string, value: "behavior:hero:select"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "action:hero:burst"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "xr-behavior-wire"}
    - id: {key: id, type: string, value: "flow-e08"}
      source: {key: source, type: string, value: "timeline:hero"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "entity:scene.hero"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "xr-timeline-target"}
      properties: {key: properties, type: object, value: {"graph:endpointState":"unresolved"}}
    - id: {key: id, type: string, value: "flow-e09"}
      source: {key: source, type: string, value: "xr_v2_demo_entry"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_ac_01"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate AC-1"}
    - id: {key: id, type: string, value: "flow-e10"}
      source: {key: source, type: string, value: "xr_v2_ac_01"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_ac_02"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate AC-2"}
    - id: {key: id, type: string, value: "flow-e11"}
      source: {key: source, type: string, value: "xr_v2_ac_02"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_ac_03"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate AC-3"}
    - id: {key: id, type: string, value: "flow-e12"}
      source: {key: source, type: string, value: "xr_v2_ac_03"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_ac_04"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate AC-4"}
    - id: {key: id, type: string, value: "flow-e13"}
      source: {key: source, type: string, value: "xr_v2_ac_04"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_ac_05"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate AC-5"}
    - id: {key: id, type: string, value: "flow-e14"}
      source: {key: source, type: string, value: "xr_v2_ac_05"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_ac_06"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate AC-6"}
    - id: {key: id, type: string, value: "flow-e15"}
      source: {key: source, type: string, value: "xr_v2_ac_06"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_ac_07"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate AC-7"}
    - id: {key: id, type: string, value: "flow-e16"}
      source: {key: source, type: string, value: "xr_v2_ac_07"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_ac_08"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate AC-8"}
    - id: {key: id, type: string, value: "flow-e17"}
      source: {key: source, type: string, value: "xr_v2_ac_08"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_ac_09"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate AC-9"}
    - id: {key: id, type: string, value: "flow-e18"}
      source: {key: source, type: string, value: "xr_v2_ac_09"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_ac_10"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate AC-10"}
    - id: {key: id, type: string, value: "flow-e19"}
      source: {key: source, type: string, value: "xr_v2_ac_10"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_ac_11"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate AC-11"}
    - id: {key: id, type: string, value: "flow-e20"}
      source: {key: source, type: string, value: "xr_v2_ac_11"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_ac_12"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "validate AC-12"}
    - id: {key: id, type: string, value: "flow-e21"}
      source: {key: source, type: string, value: "xr_v2_ac_12"}
      sourceHandle: {key: sourceHandle, type: string, value: "output"}
      target: {key: target, type: string, value: "xr_v2_certification_boundary"}
      targetHandle: {key: targetHandle, type: string, value: "input"}
      label: {key: label, type: string, value: "stop at external certification"}
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

Flow settings, node fields, and edge fields use exact `{key, type, value}`
wrappers. The shared `canvas/src/lib/graph/keyTypeValue.ts` decoder serves the
Editor, graph, panels, and source gates; object values retain their own schemas.
Plain identity and runtime metadata remain ordinary YAML.

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

## Solopreneur MVP loop

This seed is the fastest source-backed path to rehearse the current solo-builder
loop without adding infrastructure: author one XR scene, inspect it in the
workspace, rehearse it from Home Apex, and keep publication, storage, and
commercial proof as separate explicit steps. `npm run dev` owns the authoring
workspace, while `npm run dev:apex` owns the Home-first rehearsal that reuses
this same Physics Playground as the canonical background.

The loop stays lean and fail-closed. This document owns the world, camera,
controller, Motion Control, Timeline rehearsal, and Game Mode overlay for the
shared XR surface. It does not authorize Cloudflare publish, shared-storage
promotion, checkout, settlement, wallet movement, or marketplace mutation.
Those remain separately owned product and release flows with their own evidence.

| Concern | Current owner | Boundary |
| --- | --- | --- |
| Shared lifecycle, invocation grammar, and workspace governance | `agentic-os` | Source-time policy and validation only |
| XR world, Home Apex background, `81rv10` entry background, and Pages publication | `agentic-graph` | Canonical runtime and release owner |
| Generated production artifact mirror | `huijoohwee` | Artifact-only; never patch downstream |
| Spatial standalone frontend | `GameXR` | Separate frontend owner; this seed stays the shared authored world |
| Checkout, settlement replay, and marketplace proof | Existing commerce and payment owners | Never inferred from this local XR demo |

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

### Native staged encounter slice

The next native enhancement slice for this seed is one compact staged encounter
that stays inside the current repo owners: two visible performers, one authored
set-piece cluster, one clear world-state change, and one deterministic replay
path. The repo already has the right primitives for that loop without adding a
second renderer, scene owner, storage path, or external runtime.

| Native primitive | Existing owner in this repo | Staged-use role |
| --- | --- | --- |
| Timeline frame stepping, camera marks, and `0.25x` rehearsal | Timeline plus Animation panels | Beat-by-beat blocking, pause, inspect, and retry |
| Placed Subjects plus the existing procedural asset library | Shared XR scene owner in this seed | Performer and set-piece casting with persistent IDs |
| `agentic-os-behavior-graph/v1` and exact-once dispatch | Seed-authored behavior graph plus native runtime bridge | Trigger one visible world reaction from one bounded event |
| Key, treasure, barrels, bowling pins, cannonballs, and controller swap | Existing deterministic collision world | Escalation, payoff, and reset inside one authored mission |
| Home Apex, workspace XR surface, and `81rv10` background reuse | `agentic-graph` publish/runtime boundary | Rehearse one source-backed demo across Dev and Prod surfaces |

For MVP, keep the authored scene to a small sequence: approach, pressure,
impact, escape, and reset. Express pacing with the existing Timeline and camera
controls, express actor identity through Placed Subjects and the current asset
catalog, and express the world-state change through one behavior-graph event
plus the current objective HUD and Replay action. This keeps the demo source-
backed, local-first, and reviewable under the same `npm run dev`,
`npm run dev:apex`, and `npm run xr-v2:review-ready` workflow.

For GTM, treat that staged encounter as a reusable proof surface for Home Apex,
the canonical workspace, and the generated `81rv10` entry. The commercial step
is still separate: use the scene to demonstrate an agentic product loop, but
keep checkout, settlement, marketplace mutation, and paid evidence with their
existing owners.

### Timeline and choreography asides

The next UI-facing enhancement for this seed is to make the rehearsal surfaces
playable as two cooperating asides rather than readable as one generic
transport plus one generic preset panel. Keep the current owners: BottomPanel
Timeline remains the time and selection owner, while FloatingPanel Animation
remains the cast, camera, and choreography owner. Neither panel creates a
second clock, scene, or runtime authority.

| Aside | Native owner | Must show | Must not claim |
| --- | --- | --- | --- |
| BottomPanel Timeline aside | `TimelineBottomPanelView` -> `XrCameraMotionSection` -> `XrTimelineRehearsalControls` plus `xrTimelineCueRuntime` and the XR timeline command/runtime owners | ordered beat-like rows, current time, selected cast/camera/object lane, parallel actions at the same time, frame stepping, replay path, click-to-jump cue behavior, and visible current-row state | gameplay authority, hidden state mutation, or a second transport |
| FloatingPanel Animation/Choreography aside | `XrAnimationFloatingPanelView` -> `XrChoreographyInspector` plus `xrMotionReferenceRuntime` and `xrSharedAssetControlRuntime` | current cast target, current camera path, selected mark metadata, compatible motions, stage-state warnings, active object targets, and notes that change with the selected cue | publication, export proof, or timeline-time ownership |

For MVP, the BottomPanel aside should play as a performance rail for the active
scene: one ordered list of timed actions with the current row always visible,
parallel rows grouped by identical time, and each row naming the actor or
camera target plus the action in source terms already present in this seed.
Selecting a row should immediately pause, scrub, and focus the corresponding
cast mark, camera mark, or scene event through the existing Timeline selection
bridge and `jumpToXrTimelineCue` path. The current `0.25x`, previous-frame,
next-frame, Pause, Resume, Reset, and Replay controls remain the bounded
transport around that rail, so the aside is directly playable rather than a
static checklist.

For MVP, the FloatingPanel aside should play as the stage-state summary for the
same moment in time: who is currently active, which set pieces or object targets
matter to the selected cue, what the current cast and camera paths are, and
whether any choreography speed warnings need attention. Populate it from the
existing `runtime.plan.cast`, `runtime.plan.camera`, selected actor binding,
shot targets, shared asset controls, and the selected mark metadata that the
rehearsal runtime already exposes. Treat notes as authored operator hints or
diagnostics only; they never widen runtime authority.

For GTM, these two asides become the fastest way to explain the current source-
backed demo to a solo operator or prospect: the BottomPanel answers “what
happens next and when,” and the FloatingPanel answers “who and what are in
play right now.” The value is rehearsal clarity and demonstration speed on the
existing XR surface, Home Apex background, and `81rv10` entry background, not a
new content format or separate runtime. The playable contract is simple:
choose a cue in the BottomPanel, observe the scene jump, then verify the
FloatingPanel updates to the same moment without inventing a second state owner.

#### Playable script: The Three Little Pigs and the Long Sea Journey

Use the following script as the native rehearsal slice for the BottomPanel
Timeline aside and the FloatingPanel Animation/Choreography aside. It should be
treated as one staged sequence with explicit cast, prop, and cue ownership that
can be stepped, replayed, and inspected through the existing XR timeline and
choreography surfaces.

**Story script**

Once upon a time, three little pigs sailed far across the sea to find new
homes.

The first pig built a house of **straw**. A big, hungry wolf came and went
"HUFF and PUFF!" and blew it down. The pig ran away, fast, fast, fast.

The second pig built a house of **sticks**. The wolf came again, "HUFF and
PUFF!", and blew it down too.

The third pig was the cleverest sailor of them all. He built a house of
**brick**, strong and solid, right by the sea. The wolf huffed. The wolf
puffed. But the house did not move, not even a little bit.

So the wolf tried to sneak down the chimney. But the clever pig called out,
"My name is Nobody!" and dropped him straight into a big pot of hot soup.
Splash. The wolf jumped up and ran away, and never, ever came back.

The three pigs lived happily together in the brick house by the sea.

**Playable staging contract**

| Slice | BottomPanel Timeline aside | FloatingPanel Animation/Choreography aside |
| --- | --- | --- |
| Sea arrival | establish opening cue, sea-travel motion, shoreline landing, and home-selection beats | show active cast, vessel or shoreline set pieces, and opening camera path |
| Straw house failure | show wolf approach, huff/puff cue, collapse cue, and first-pig escape path | show straw-house state, collapse target, and first-pig motion target |
| Stick house failure | show second approach, repeated huff/puff cue, collapse cue, and second-pig escape path | show stick-house state, wolf pressure cue, and second-pig path update |
| Brick house stand | show wolf approach, huff/puff attempt, no-collapse outcome, and hold beat on the intact house | show brick-house state, chimney readiness, and intact-structure confirmation |
| Chimney and soup payoff | show chimney descent cue, "My name is Nobody!" line, soup-drop impact, wolf escape, and end-state beat | show chimney target, soup prop, impact state, and final cast arrangement |

For MVP, keep the sequence under one minute and author it as a bounded cue rail:
arrival, straw failure, stick failure, brick stand, chimney payoff, and final
safe-state reset. The BottomPanel aside should let the operator jump directly to
each beat group, while the FloatingPanel aside should update the live cast,
prop, and structure state for the same selected moment.

For TAD and ADR continuity, this script does not add a second narrative engine,
scene graph, or storage shape. It is only a source-backed playable script that
reuses the current Timeline selection, cue jumping, choreography inspection,
cast state, camera state, and object-target owners already present in
`agentic-canvas` and `agentic-graph`.

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
