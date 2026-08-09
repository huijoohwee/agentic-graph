---
title: "Knowgrph AR/VR/XR Runtime-readiness Demo"
doc_type: "Workspace Demo"
status: "runtime-ready"
runtime_status: "browser-demo-ready"
runtime_claim: "local-browser-demo-runtime-ready"
runtime_claim_scope: "AC-1 through AC-12 exact-candidate browser proof only; AC-14 remains source-only"
pinned_contract_status: "partial"
publish_scope: "local-only"
deploy_boundary: "Dev-only"
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "3d"
kgCanvas3dMode: "graph"
kgFloatingPanelOpen: true
kgFloatingPanelView: "motionControl"
kgBottomPanelOpen: false
kgBottomPanelTab: "timeline"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
run_ready_demo:
  id: "xr-v2"
  activation: "applied-source-document"
  identity_authority: "source-authored run_ready_demo.id"
  imported_path_alias_required: false
  identity_conflict: "fail closed when path and source identity disagree"
  canonical_consumers: ["workspace"]
  dev_command: "npm run dev"
  canonical_source_file: "/docs/workspace-seeds/knowgrph-ar-vr-xr-runtime-readiness-demo.md"
  env_selector: "VITE_KNOWGRPH_RUN_READY_DEMO=xr-v2"
  validation_seed_path: "/knowgrph-ar-vr-xr-runtime-readiness-demo.md"
  source_root: "knowgrph/docs"
  source_backed: true
  clean_canvas_recommended: true
  native_runtime: true
  canonical_xr_world_owner: "docs/workspace-seeds/knowgrph-physics-playground-demo.md"
  presentation: "pinned-xr-v2-runtime-readiness"
  document_presentation: "workspace-runtime-readiness-demo"
  auto_start: true
  external_dependencies: []
pinned_source:
  repository: "huijoohwee/knowgrph"
  path: "docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md"
  version: "3.0.0"
  commit: "42005d7572380beb421da0cb16055cf56ae4f2c4"
  git_blob_sha1: "12aab1a46c230d5e006f78f4a87e3d0db93ed494"
  content_sha256: "38099b9a9838929dfa287e3be8317e7828562288a8303f43b1579728053d7bab"
  immutable_url: "https://github.com/huijoohwee/knowgrph/blob/42005d7572380beb421da0cb16055cf56ae4f2c4/docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md"
runtime_readiness:
  schema: "knowgrph-xr-v2-pinned-contract-conformance/v1"
  scope: "pinned-ac1-ac12-conformance"
  focused_gate: "npm run xr-v2:review-ready"
  browser_demo_status: "runtime-ready"
  browser_demo_evidence: "clean exact-candidate source, unit, and Chromium smoke gates for AC-1 through AC-12; AC-14 remains source-only"
  pinned_contract_status: "partial"
  physical_device_certification: "external-required"
  production_availability: "not-claimed"
  deployment_authority: false
  missing_promotion_proof: ["named reference-device frame budget", "named camera and sensor lifecycle matrix", "physical-headset behavior", "track-preserving mux", "connected viewer transport"]
permission_control:
  owner: "user"
  default_state: "disabled"
  camera: "user-enable-disable"
  sensors: "user-enable-disable"
  enable_boundary: "explicit user action and browser permission grant"
  disable_boundary: "user stop action tears down tracks, sessions, and sensor listeners"
  production_host_policy: "allow camera and required sensors for the application origin so the user can opt in; never auto-start capture or sensors"
  denial_behavior: "fail closed to the non-capture viewer without blocking the workspace"
acceptance_criteria:
  - {id: "AC-1", evidence: "source-backed", promotion_boundary: "named physical capability matrix"}
  - {id: "AC-2", evidence: "browser-backed", promotion_boundary: "named reference-device frame budget"}
  - {id: "AC-3", evidence: "source-backed", promotion_boundary: "connected durable post-process execution"}
  - {id: "AC-4", evidence: "browser-backed", promotion_boundary: "physical four-tier viewer matrix"}
  - {id: "AC-5", evidence: "source-backed", promotion_boundary: "named iOS device/browser pass"}
  - {id: "AC-6", evidence: "browser-backed", promotion_boundary: "complete mounted scene rendering proof"}
  - {id: "AC-7", evidence: "browser-backed", promotion_boundary: "texture and shader graph on the canonical target mesh"}
  - {id: "AC-8", evidence: "source-backed", promotion_boundary: "none for deterministic exact-once behavior"}
  - {id: "AC-9", evidence: "source-backed", promotion_boundary: "mounted GPU authoring surface"}
  - {id: "AC-10", evidence: "source-backed", promotion_boundary: "rigged mounted playback"}
  - {id: "AC-11", evidence: "browser-backed", promotion_boundary: "already-encoded track and codec preservation"}
  - {id: "AC-12", evidence: "source-backed", promotion_boundary: "connected viewer transport and measured latency"}
flow:
  direction: "LR"
  edgeType: "smoothstep"
  nodes:
    - id: "xr_v2_demo_entry"
      type: "XrDemoControl"
      label: "Run XR v2 Browser Demo"
      pos: {x: -1240, y: 0}
      properties:
        role: "lifecycle"
        state: "browser-demo-ready"
        output: "Apply this source document, then run npm run xr-v2:review-ready for the clean browser evidence gate."
    - id: "schema:XrTransform"
      type: "EcsComponentSchema"
      label: "XrTransform"
      pos: {x: -980, y: -540}
      properties:
        ecsComponent:
          name: "XrTransform"
          fields: {px: "f32", py: "f32", pz: "f32", qx: "f32", qy: "f32", qz: "f32", qw: "f32", sx: "f32", sy: "f32", sz: "f32"}
    - id: "schema:XrRenderable"
      type: "EcsComponentSchema"
      label: "XrRenderable"
      pos: {x: -980, y: -360}
      properties:
        ecsComponent:
          name: "XrRenderable"
          fields: {geometryKind: "u8", visible: "u8"}
    - id: "schema:XrParticleEmitter"
      type: "EcsComponentSchema"
      label: "XrParticleEmitter"
      pos: {x: -980, y: -180}
      properties:
        ecsComponent:
          name: "XrParticleEmitter"
          fields: {rate: "f32", lifetime: "f32", ceiling: "u16", size: "f32", color: "u32"}
    - id: "schema:XrRig"
      type: "EcsComponentSchema"
      label: "XrRig"
      pos: {x: -980, y: 0}
      properties:
        ecsComponent:
          name: "XrRig"
          fields: {enabled: "u8"}
    - id: "entity:scene.hero"
      type: "EcsEntity"
      label: "Hero"
      pos: {x: -700, y: -300}
      properties:
        ecsEntity:
          entityRef: "scene.hero"
          components:
            XrTransform: {px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, sx: 1, sy: 1, sz: 1}
            XrRenderable: {geometryKind: 0, visible: 1}
            XrParticleEmitter: {rate: 12, lifetime: 0.75, ceiling: 64, size: 0.06, color: 6737151}
            XrRig: {enabled: 1}
    - id: "entity:scene.marker"
      type: "EcsEntity"
      label: "Marker"
      pos: {x: -700, y: -80}
      properties:
        ecsEntity:
          entityRef: "scene.marker"
          components:
            XrTransform: {px: -1.5, py: -0.5, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, sx: 1, sy: 1, sz: 1}
    - id: "material:hero"
      type: "XrMaterialGraph"
      label: "Hero checker material"
      pos: {x: -700, y: 180}
      properties:
        xrMaterialGraph:
          schema: "knowgrph-xr-material-graph/v1"
          nodes:
            - {id: "albedo", type: "color", value: "#336699"}
            - {id: "surface", type: "texture-2d", assetId: "builtin:checker-v1"}
            - {id: "roughness", type: "number", value: 0.35}
            - id: "output"
              type: "mesh-standard-output"
              bindings: {color: "albedo", map: "surface", roughness: "roughness"}
    - id: "behavior:hero:select"
      type: "XrBehaviorTrigger"
      label: "Select hero"
      pos: {x: -700, y: 400}
      properties:
        xrBehaviorTrigger: {behaviorId: "hero-select", trigger: "select", sourceEntityRef: "scene.hero"}
    - id: "action:hero:burst"
      type: "XrBehaviorAction"
      label: "Burst particles"
      pos: {x: -420, y: 400}
      properties:
        xrBehaviorAction:
          actionId: "hero-burst"
          kind: "emit-particle-burst"
          targetEntityRef: "scene.hero"
          parameters: {count: 8}
    - id: "timeline:hero"
      type: "XrTimelineSequence"
      label: "Hero arm animation"
      pos: {x: -700, y: 620}
      properties:
        xrTimelineSequence:
          schema: "knowgrph-xr-timeline-sequence/v1"
          durationSeconds: 2
          loop: false
          tracks:
            - id: "arm-pose"
              kind: "bone-pose"
              targetName: "Arm"
              keyframes:
                - {timeSeconds: 0, value: {translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1]}}
                - {timeSeconds: 2, value: {translation: [0, 1, 0], rotation: [0, 1, 0, 0], scale: [1, 1, 1]}}
    - {id: "xr_v2_ac_01", type: "XrDemoValidation", label: "AC-1 Capability detection", pos: {x: -360, y: -540}, properties: {criterion: "AC-1", evidenceState: "source-backed", output: "Resolve exactly one pinned capability tier; physical matrix remains external certification."}}
    - {id: "xr_v2_ac_02", type: "XrDemoValidation", label: "AC-2 Live capture default", pos: {x: -80, y: -540}, properties: {criterion: "AC-2", evidenceState: "source-backed", output: "Exercise deterministic stereo coverage; live model and reference-device budget remain external proof."}}
    - {id: "xr_v2_ac_03", type: "XrDemoValidation", label: "AC-3 Post-process fallback", pos: {x: 200, y: -540}, properties: {criterion: "AC-3", evidenceState: "source-backed", output: "Trigger consecutive frame-budget fallback and queue the typed post-process record."}}
    - {id: "xr_v2_ac_04", type: "XrDemoValidation", label: "AC-4 Progressive viewer", pos: {x: 480, y: -540}, properties: {criterion: "AC-4", evidenceState: "browser-backed", output: "Observe browser compatibility projection; physical four-tier viewer certification remains external."}}
    - {id: "xr_v2_ac_05", type: "XrDemoValidation", label: "AC-5 iOS constraint", pos: {x: 760, y: -540}, properties: {criterion: "AC-5", evidenceState: "source-backed", output: "Fail closed from WebXR tiers when platform facts disallow WebXR; named iOS proof remains external."}}
    - {id: "xr_v2_ac_06", type: "XrDemoValidation", label: "AC-6 ECS composition", pos: {x: -360, y: -180}, properties: {criterion: "AC-6", evidenceState: "browser-backed", output: "Project the mounted fixture entities and component schemas without duplicate query results."}}
    - {id: "xr_v2_ac_07", type: "XrDemoValidation", label: "AC-7 Material graph", pos: {x: -80, y: -180}, properties: {criterion: "AC-7", evidenceState: "browser-backed", output: "Compile and apply the checker material graph to the Hero target."}}
    - {id: "xr_v2_ac_08", type: "XrDemoValidation", label: "AC-8 Behavior graph", pos: {x: 200, y: -180}, properties: {criterion: "AC-8", evidenceState: "source-backed", output: "Dispatch the wired Hero select action exactly once and keep unwired triggers inert."}}
    - {id: "xr_v2_ac_09", type: "XrDemoValidation", label: "AC-9 Particles", pos: {x: 480, y: -180}, properties: {criterion: "AC-9", evidenceState: "source-backed", output: "Keep the Hero emitter within rate, lifetime, and ceiling bounds."}}
    - {id: "xr_v2_ac_10", type: "XrDemoValidation", label: "AC-10 Timeline", pos: {x: 760, y: -180}, properties: {criterion: "AC-10", evidenceState: "source-backed", output: "Interpolate the Hero Arm bone-pose track at the mounted playhead."}}
    - {id: "xr_v2_ac_11", type: "XrDemoValidation", label: "AC-11 Packaging", pos: {x: 1040, y: -180}, properties: {criterion: "AC-11", evidenceState: "browser-backed", output: "Observe playable edited-media output; input track and codec preservation remains a promotion gate."}}
    - {id: "xr_v2_ac_12", type: "XrDemoValidation", label: "AC-12 Connected preview", pos: {x: 1320, y: -180}, properties: {criterion: "AC-12", evidenceState: "source-backed", output: "Exercise process-local deltas; connected viewer transport and latency certification remain external."}}
    - id: "xr_v2_certification_boundary"
      type: "XrDemoValidation"
      label: "External Physical-device Certification"
      pos: {x: 1600, y: 0}
      properties:
        role: "promotion-boundary"
        browserDemoState: "runtime-ready"
        pinnedContractState: "partial"
        physicalDeviceState: "external-required"
        productionState: "not-claimed"
        output: "Browser demo proof never substitutes for named camera, sensor, headset, device, or Production certification."
  connections:
    - {from: "xr_v2_demo_entry", to: "schema:XrTransform", label: "author schema"}
    - {from: "schema:XrTransform", to: "entity:scene.hero", label: "attach transform"}
    - {from: "schema:XrRenderable", to: "entity:scene.hero", label: "attach renderable"}
    - {from: "schema:XrParticleEmitter", to: "entity:scene.hero", label: "attach emitter"}
    - {from: "schema:XrRig", to: "entity:scene.hero", label: "attach rig"}
    - {from: "schema:XrTransform", to: "entity:scene.marker", label: "attach transform"}
    - {from: "material:hero", to: "entity:scene.hero", label: "xr-material-target"}
    - {from: "behavior:hero:select", to: "action:hero:burst", label: "xr-behavior-wire"}
    - {from: "timeline:hero", to: "entity:scene.hero", label: "xr-timeline-target"}
    - {from: "xr_v2_demo_entry", to: "xr_v2_ac_01", label: "validate AC-1"}
    - {from: "xr_v2_ac_01", to: "xr_v2_ac_02", label: "validate AC-2"}
    - {from: "xr_v2_ac_02", to: "xr_v2_ac_03", label: "validate AC-3"}
    - {from: "xr_v2_ac_03", to: "xr_v2_ac_04", label: "validate AC-4"}
    - {from: "xr_v2_ac_04", to: "xr_v2_ac_05", label: "validate AC-5"}
    - {from: "xr_v2_ac_05", to: "xr_v2_ac_06", label: "validate AC-6"}
    - {from: "xr_v2_ac_06", to: "xr_v2_ac_07", label: "validate AC-7"}
    - {from: "xr_v2_ac_07", to: "xr_v2_ac_08", label: "validate AC-8"}
    - {from: "xr_v2_ac_08", to: "xr_v2_ac_09", label: "validate AC-9"}
    - {from: "xr_v2_ac_09", to: "xr_v2_ac_10", label: "validate AC-10"}
    - {from: "xr_v2_ac_10", to: "xr_v2_ac_11", label: "validate AC-11"}
    - {from: "xr_v2_ac_11", to: "xr_v2_ac_12", label: "validate AC-12"}
    - {from: "xr_v2_ac_12", to: "xr_v2_certification_boundary", label: "stop at external certification"}
---

# AR/VR/XR Runtime-readiness Demo

This Source Files document is the dedicated workspace demo for the immutable
v3.0.0 AR/VR/XR authority. Its source identity is commit
`42005d7572380beb421da0cb16055cf56ae4f2c4`, Git blob
`12aab1a46c230d5e006f78f4a87e3d0db93ed494`, and SHA-256
`38099b9a9838929dfa287e3be8317e7828562288a8303f43b1579728053d7bab`.
The mounted browser ledger remains AC-1–AC-12; the authority's AC-14 bridge is
a separate implementation candidate until its exact-revision proof passes,
and later revisions cannot silently expand the demo's evidence claim.

## Run the browser demo

Run `npm run dev`, then apply **Explorer → Source Files → docs →
workspace-seeds → knowgrph-ar-vr-xr-runtime-readiness-demo.md**. The applied
document activates the existing canonical XR world through the XR v2 runtime
adapter and opens Motion Control; it does not declare a second Three/XR world
owner. Run `npm run xr-v2:review-ready` from a clean checkout for the focused
source, unit, and Chromium evidence gate.

The graph source-authors the same ECS schemas, Hero/Marker entities, checker
material graph, exact-once behavior wire, particle emitter, rig, and timeline
sequence used by the mounted XR v2 authoring fixture. The AC-1 through AC-12
validation chain keeps every pinned criterion visible instead of promoting a
narrow edited-media slice into full-contract readiness.

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
gates. This seed claims neither Production availability nor deployment
authority.

## Demo checks

- [x] Source-authored `run_ready_demo.id: xr-v2` owns activation and conflicts fail closed.
- [x] Applying the document requests XR, 3D, XR stage, and Motion Control presentation.
- [x] The exact pinned commit, Git blob, and content SHA-256 are recorded.
- [x] The mounted authoring fixture and AC-1 through AC-12 are source-authored as graph nodes and edges.
- [x] The focused local browser gate is `npm run xr-v2:review-ready`.
- [x] Camera and sensors remain user-controlled and disabled until explicit opt-in.
- [x] Browser demo readiness is separated from external physical-device certification.
- [x] Production availability and deployment authority remain unclaimed.
