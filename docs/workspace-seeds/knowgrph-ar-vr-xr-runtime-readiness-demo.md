---
title: Knowgrph AR/VR/XR Runtime-readiness Demo
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
    - workspace
  dev_command: npm run dev
  canonical_source_file: /docs/workspace-seeds/knowgrph-ar-vr-xr-runtime-readiness-demo.md
  validation_seed_path: /docs/workspace-seeds/knowgrph-ar-vr-xr-runtime-readiness-demo.md
  source_root: knowgrph/docs
  source_backed: true
  clean_canvas_recommended: true
  native_runtime: true
  browser_activation_evidence: actual Explorer Source Files row selection; no environment selector
  mount_status: mounted-after-applied-source-document
  canonical_xr_world_owner: docs/workspace-seeds/knowgrph-physics-playground-demo.md
  presentation: pinned-xr-v2-runtime-readiness
  document_presentation: workspace-runtime-readiness-demo
  auto_start: true
  external_dependencies: []
shared_xr_scene:
  source_authority: /docs/workspace-seeds/knowgrph-physics-playground-demo.md
  world_ownership: overlay-only
  surface_owner: canonical XR Physics shared Three surface
  renderer_owner: canvas/src/lib/three/ThreeGraph.impl.tsx
  second_r3f_canvas_forbidden: true
pinned_source:
  repository: huijoohwee/knowgrph
  path: docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md
  version: 3.0.0
  commit: 2dd8712443c1fd50a1bdd1bf8bc886100147c62e
  git_blob_sha1: c8be9e394919f86c3563292aff18e597e1e67c93
  content_sha256: b4d471a055c15efbb6beeac8a81d6e9a65398f341ccef4a2a6f8e188da2ff35d
  immutable_url: https://github.com/huijoohwee/knowgrph/blob/2dd8712443c1fd50a1bdd1bf8bc886100147c62e/docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md
runtime_readiness:
  schema: knowgrph-xr-v2-pinned-contract-conformance/v1
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
behavior_graph_interface: kgc-behavior-graph/v1
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
behavior_runtime_dispatch_schema: knowgrph-xr-v2-behavior-dispatch-graph/v1
flow:
  direction: LR
  edgeType: smoothstep
  balancedViewportPreset: widgetFrontmatter
  nodes:
    - id: schema:XrParticleEmitter
      type: EcsComponentSchema
      label: XrParticleEmitter
      position:
        x: 0
        y: -2760
      ecsComponent:
        name: XrParticleEmitter
        fields:
          rate: f32
          lifetime: f32
          ceiling: u16
          size: f32
          color: u32
      properties:
        ecsComponent:
          name: XrParticleEmitter
          fields:
            rate: f32
            lifetime: f32
            ceiling: u16
            size: f32
            color: u32
    - id: schema:XrRenderable
      type: EcsComponentSchema
      label: XrRenderable
      position:
        x: 0
        y: -2520
      ecsComponent:
        name: XrRenderable
        fields:
          geometryKind: u8
          visible: u8
      properties:
        ecsComponent:
          name: XrRenderable
          fields:
            geometryKind: u8
            visible: u8
    - id: schema:XrRig
      type: EcsComponentSchema
      label: XrRig
      position:
        x: 0
        y: -2280
      ecsComponent:
        name: XrRig
        fields:
          enabled: u8
      properties:
        ecsComponent:
          name: XrRig
          fields:
            enabled: u8
    - id: schema:XrTransform
      type: EcsComponentSchema
      label: XrTransform
      position:
        x: 0
        y: -2040
      ecsComponent:
        name: XrTransform
        fields:
          px: f32
          py: f32
          pz: f32
          qx: f32
          qy: f32
          qz: f32
          qw: f32
          sx: f32
          sy: f32
          sz: f32
      properties:
        ecsComponent:
          name: XrTransform
          fields:
            px: f32
            py: f32
            pz: f32
            qx: f32
            qy: f32
            qz: f32
            qw: f32
            sx: f32
            sy: f32
            sz: f32
    - id: entity:scene.hero
      type: EcsEntity
      label: Hero
      position:
        x: 0
        y: -1800
      ecsEntity:
        entityRef: scene.hero
        components:
          XrTransform:
            px: 0
            py: 0
            pz: 0
            qx: 0
            qy: 0
            qz: 0
            qw: 1
            sx: 1
            sy: 1
            sz: 1
          XrRenderable:
            geometryKind: 0
            visible: 1
          XrParticleEmitter:
            rate: 12
            lifetime: 0.75
            ceiling: 64
            size: 0.06
            color: 6737151
          XrRig:
            enabled: 1
      properties:
        ecsEntity:
          entityRef: scene.hero
          components:
            XrTransform:
              px: 0
              py: 0
              pz: 0
              qx: 0
              qy: 0
              qz: 0
              qw: 1
              sx: 1
              sy: 1
              sz: 1
            XrRenderable:
              geometryKind: 0
              visible: 1
            XrParticleEmitter:
              rate: 12
              lifetime: 0.75
              ceiling: 64
              size: 0.06
              color: 6737151
            XrRig:
              enabled: 1
    - id: entity:scene.marker
      type: EcsEntity
      label: Marker
      position:
        x: 0
        y: -1560
      ecsEntity:
        entityRef: scene.marker
        components:
          XrTransform:
            px: -1.5
            py: -0.5
            pz: 0
            qx: 0
            qy: 0
            qz: 0
            qw: 1
            sx: 1
            sy: 1
            sz: 1
      properties:
        ecsEntity:
          entityRef: scene.marker
          components:
            XrTransform:
              px: -1.5
              py: -0.5
              pz: 0
              qx: 0
              qy: 0
              qz: 0
              qw: 1
              sx: 1
              sy: 1
              sz: 1
    - id: action:hero:burst
      type: XrBehaviorAction
      label: Burst particles
      position:
        x: 0
        y: -1320
      properties:
        xrBehaviorAction:
          actionId: hero-burst
          kind: emit-particle-burst
          targetEntityRef: scene.hero
          parameters:
            count: 8
      xrBehaviorAction:
        actionId: hero-burst
        kind: emit-particle-burst
        targetEntityRef: scene.hero
        parameters:
          count: 8
    - id: behavior:hero:select
      type: XrBehaviorTrigger
      label: Select hero
      position:
        x: 0
        y: -1080
      properties:
        xrBehaviorTrigger:
          behaviorId: hero-select
          trigger: select
          sourceEntityRef: scene.hero
      xrBehaviorTrigger:
        behaviorId: hero-select
        trigger: select
        sourceEntityRef: scene.hero
    - id: xr_v2_demo_entry
      type: XrDemoControl
      label: Run XR v2 Browser Demo
      position:
        x: 0
        y: -840
      output: Apply this source document, then run npm run xr-v2:review-ready for the clean browser evidence gate.
      properties:
        role: lifecycle
        state: browser-demo-ready
        output: Apply this source document, then run npm run xr-v2:review-ready for the clean browser evidence gate.
      role: lifecycle
      state: browser-demo-ready
    - id: xr_v2_ac_01
      type: XrDemoValidation
      label: AC-1 Capability detection
      position:
        x: 0
        y: -600
      criterion: AC-1
      evidenceState: source-backed
      output: Resolve exactly one pinned capability tier; physical matrix remains external certification.
      properties:
        criterion: AC-1
        evidenceState: source-backed
        output: Resolve exactly one pinned capability tier; physical matrix remains external certification.
    - id: xr_v2_ac_02
      type: XrDemoValidation
      label: AC-2 Live capture default
      position:
        x: 0
        y: -360
      criterion: AC-2
      evidenceState: browser-backed
      output: After explicit camera Start, sample the canonical stream through local depth inference and render live DIBR stereo previews; named-device frame budget remains external proof.
      properties:
        criterion: AC-2
        evidenceState: browser-backed
        output: After explicit camera Start, sample the canonical stream through local depth inference and render live DIBR stereo previews; named-device frame budget remains external proof.
    - id: xr_v2_ac_03
      type: XrDemoValidation
      label: AC-3 Post-process fallback
      position:
        x: 0
        y: -120
      criterion: AC-3
      evidenceState: browser-backed
      output: On consecutive frame-budget breaches, continue raw capture and atomically persist the flat asset plus one typed post-process job on save.
      properties:
        criterion: AC-3
        evidenceState: browser-backed
        output: On consecutive frame-budget breaches, continue raw capture and atomically persist the flat asset plus one typed post-process job on save.
    - id: xr_v2_ac_04
      type: XrDemoValidation
      label: AC-4 Progressive viewer
      position:
        x: 0
        y: 120
      criterion: AC-4
      evidenceState: browser-observable-after-saved-asset-render
      output: Keep evidence not-observed until a persisted capture survives reload and explicit open, then two distinct timestamped frames render on an attached depth/Three surface or raw-video playback time advances; listing, selection, canplay, or session entry alone is never evidence.
      properties:
        criterion: AC-4
        evidenceState: browser-observable-after-saved-asset-render
        output: Keep evidence not-observed until a persisted capture survives reload and explicit open, then two distinct timestamped frames render on an attached depth/Three surface or raw-video playback time advances; listing, selection, canplay, or session entry alone is never evidence.
    - id: xr_v2_ac_05
      type: XrDemoValidation
      label: AC-5 iOS constraint
      position:
        x: 0
        y: 360
      criterion: AC-5
      evidenceState: source-backed
      output: Fail closed from WebXR tiers when platform facts disallow WebXR; named iOS proof remains external.
      properties:
        criterion: AC-5
        evidenceState: source-backed
        output: Fail closed from WebXR tiers when platform facts disallow WebXR; named iOS proof remains external.
    - id: xr_v2_ac_06
      type: XrDemoValidation
      label: AC-6 ECS composition
      position:
        x: 0
        y: 600
      criterion: AC-6
      evidenceState: browser-backed
      output: Project the mounted fixture entities and component schemas without duplicate query results.
      properties:
        criterion: AC-6
        evidenceState: browser-backed
        output: Project the mounted fixture entities and component schemas without duplicate query results.
    - id: xr_v2_ac_07
      type: XrDemoValidation
      label: AC-7 Material graph
      position:
        x: 0
        y: 840
      criterion: AC-7
      evidenceState: browser-backed
      output: Compile and apply the checker material graph to the Hero target.
      properties:
        criterion: AC-7
        evidenceState: browser-backed
        output: Compile and apply the checker material graph to the Hero target.
    - id: xr_v2_ac_08
      type: XrDemoValidation
      label: AC-8 Behavior graph
      position:
        x: 0
        y: 1080
      criterion: AC-8
      evidenceState: source-backed
      output: Dispatch the wired Hero select action exactly once and keep unwired triggers inert.
      properties:
        criterion: AC-8
        evidenceState: source-backed
        output: Dispatch the wired Hero select action exactly once and keep unwired triggers inert.
    - id: xr_v2_ac_09
      type: XrDemoValidation
      label: AC-9 Particles
      position:
        x: 0
        y: 1320
      criterion: AC-9
      evidenceState: source-backed
      output: Keep the Hero emitter within rate, lifetime, and ceiling bounds.
      properties:
        criterion: AC-9
        evidenceState: source-backed
        output: Keep the Hero emitter within rate, lifetime, and ceiling bounds.
    - id: xr_v2_ac_10
      type: XrDemoValidation
      label: AC-10 Timeline
      position:
        x: 0
        y: 1560
      criterion: AC-10
      evidenceState: source-backed
      output: Interpolate the Hero Arm bone-pose track at the mounted playhead.
      properties:
        criterion: AC-10
        evidenceState: source-backed
        output: Interpolate the Hero Arm bone-pose track at the mounted playhead.
    - id: xr_v2_ac_11
      type: XrDemoValidation
      label: AC-11 Packaging
      position:
        x: 0
        y: 1800
      criterion: AC-11
      evidenceState: browser-observable-after-explicit-action
      output: Use Verify packaging on the explicitly opened identity-bound capture; evidence appears only after every pre-mux encoded source sample decodes, the mux preserves exact codec/count/payload bytes, and the mounted WebM advances.
      properties:
        criterion: AC-11
        evidenceState: browser-observable-after-explicit-action
        output: Use Verify packaging on the explicitly opened identity-bound capture; evidence appears only after every pre-mux encoded source sample decodes, the mux preserves exact codec/count/payload bytes, and the mounted WebM advances.
    - id: xr_v2_ac_12
      type: XrDemoValidation
      label: AC-12 Connected preview
      position:
        x: 0
        y: 2040
      criterion: AC-12
      evidenceState: browser-observable-after-explicit-action
      output: Use Run local preview; evidence appears only after an exact mounted-scene edit crosses real WebRTC peers, paints the attached viewer canvas in a later frame, and is then acknowledged within the bound without reload.
      properties:
        criterion: AC-12
        evidenceState: browser-observable-after-explicit-action
        output: Use Run local preview; evidence appears only after an exact mounted-scene edit crosses real WebRTC peers, paints the attached viewer canvas in a later frame, and is then acknowledged within the bound without reload.
    - id: xr_v2_certification_boundary
      type: XrDemoValidation
      label: External Physical-device Certification
      position:
        x: 0
        y: 2280
      browserDemoState: runtime-ready
      browserLocalMountState: mounted
      output: Browser demo proof never substitutes for named camera, sensor, headset, device, or Production certification.
      physicalDeviceState: external-required
      pinnedContractState: partial
      productionState: not-claimed
      properties:
        role: promotion-boundary
        browserDemoState: runtime-ready
        browserLocalMountState: mounted
        pinnedContractState: partial
        physicalDeviceState: external-required
        productionState: not-claimed
        output: Browser demo proof never substitutes for named camera, sensor, headset, device, or Production certification.
      role: promotion-boundary
    - id: material:hero
      type: XrMaterialGraph
      label: Hero checker material
      position:
        x: 0
        y: 2520
      properties:
        xrMaterialGraph:
          schema: knowgrph-xr-material-graph/v1
          nodes:
            - id: albedo
              type: color
              value: "#336699"
            - id: surface
              type: texture-2d
              assetId: builtin:checker-v1
            - id: roughness
              type: number
              value: 0.35
            - id: output
              type: mesh-standard-output
              bindings:
                color: albedo
                map: surface
                roughness: roughness
      xrMaterialGraph:
        schema: knowgrph-xr-material-graph/v1
        nodes:
          - id: albedo
            type: color
            value: "#336699"
          - id: surface
            type: texture-2d
            assetId: builtin:checker-v1
          - id: roughness
            type: number
            value: 0.35
          - id: output
            type: mesh-standard-output
            bindings:
              color: albedo
              map: surface
              roughness: roughness
    - id: timeline:hero
      type: XrTimelineSequence
      label: Hero arm animation
      position:
        x: 0
        y: 2760
      properties:
        xrTimelineSequence:
          schema: knowgrph-xr-timeline-sequence/v1
          durationSeconds: 2
          loop: false
          tracks:
            - id: arm-pose
              kind: bone-pose
              targetName: Arm
              keyframes:
                - timeSeconds: 0
                  value:
                    translation:
                      - 0
                      - 0
                      - 0
                    rotation:
                      - 0
                      - 0
                      - 0
                      - 1
                    scale:
                      - 1
                      - 1
                      - 1
                - timeSeconds: 2
                  value:
                    translation:
                      - 0
                      - 1
                      - 0
                    rotation:
                      - 0
                      - 1
                      - 0
                      - 0
                    scale:
                      - 1
                      - 1
                      - 1
      xrTimelineSequence:
        schema: knowgrph-xr-timeline-sequence/v1
        durationSeconds: 2
        loop: false
        tracks:
          - id: arm-pose
            kind: bone-pose
            targetName: Arm
            keyframes:
              - timeSeconds: 0
                value:
                  translation:
                    - 0
                    - 0
                    - 0
                  rotation:
                    - 0
                    - 0
                    - 0
                    - 1
                  scale:
                    - 1
                    - 1
                    - 1
              - timeSeconds: 2
                value:
                  translation:
                    - 0
                    - 1
                    - 0
                  rotation:
                    - 0
                    - 1
                    - 0
                    - 0
                  scale:
                    - 1
                    - 1
                    - 1
  connections:
    - from: material:hero
      to: entity:scene.hero
      label: xr-material-target
    - from: behavior:hero:select
      to: action:hero:burst
      label: xr-behavior-wire
    - from: timeline:hero
      to: entity:scene.hero
      label: xr-timeline-target
    - from: xr_v2_demo_entry
      to: xr_v2_ac_01
      label: validate AC-1
    - from: xr_v2_ac_01
      to: xr_v2_ac_02
      label: validate AC-2
    - from: xr_v2_ac_02
      to: xr_v2_ac_03
      label: validate AC-3
    - from: xr_v2_ac_03
      to: xr_v2_ac_04
      label: validate AC-4
    - from: xr_v2_ac_04
      to: xr_v2_ac_05
      label: validate AC-5
    - from: xr_v2_ac_05
      to: xr_v2_ac_06
      label: validate AC-6
    - from: xr_v2_ac_06
      to: xr_v2_ac_07
      label: validate AC-7
    - from: xr_v2_ac_07
      to: xr_v2_ac_08
      label: validate AC-8
    - from: xr_v2_ac_08
      to: xr_v2_ac_09
      label: validate AC-9
    - from: xr_v2_ac_09
      to: xr_v2_ac_10
      label: validate AC-10
    - from: xr_v2_ac_10
      to: xr_v2_ac_11
      label: validate AC-11
    - from: xr_v2_ac_11
      to: xr_v2_ac_12
      label: validate AC-12
    - from: xr_v2_ac_12
      to: xr_v2_certification_boundary
      label: stop at external certification
---

# AR/VR/XR Runtime-readiness Demo

This Source Files document is the dedicated workspace demo for the immutable
v3.0.0 AR/VR/XR authority. Its source identity is commit
`2dd8712443c1fd50a1bdd1bf8bc886100147c62e`, Git blob
`c8be9e394919f86c3563292aff18e597e1e67c93`, and SHA-256
`b4d471a055c15efbb6beeac8a81d6e9a65398f341ccef4a2a6f8e188da2ff35d`.
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

## Demo checks

- [x] Source-authored `run_ready_demo.id: xr-v2` owns activation and conflicts fail closed.
- [x] Applying the document requests the shared 3D host; the source-authored XR v2 runtime activates the canonical XR stage and Motion Control without a second world owner.
- [x] The canonical `/docs/workspace-seeds/…` row is the validation and activation path; no environment selector bypasses Explorer selection.
- [x] The exact pinned commit, Git blob, and content SHA-256 are recorded.
- [x] The mounted authoring fixture and AC-1 through AC-12 are source-authored as graph nodes and edges.
- [x] User-started canonical camera frames reach local depth inference, DIBR preview, IndexedDB capture artifacts, and bounded raw/post-process fallback.
- [x] Saved assets expose exactly `xr_capability_tier`, `synthesis_mode`, `depth_metadata_ref`, and `fallback_triggered`.
- [x] The browser gate saves a real capture, reloads the page, reopens it from IndexedDB, and publishes AC-4 evidence only after two distinct saved frames render or raw-video time advances.
- [x] Visible AC-11 binds the raw clip and encoded source tracks before exact mux, while AC-12 acknowledges only after the attached viewer canvas paints the transported edit; both begin only on user click.
- [x] Explicit existing-storage publish/list/read is client-only, manifest-last, integrity-checked, atomic on import, and performs no network request on mount.
- [x] Shared-storage workspace authentication and server-side digest recomputation remain named external promotion blockers.
- [x] The focused local browser gate is `npm run xr-v2:review-ready`.
- [x] Camera and sensors remain user-controlled and disabled until explicit opt-in.
- [x] Browser-local mounted runtime readiness is separated from external physical-device certification.
- [x] Production availability and deployment authority remain unclaimed.
