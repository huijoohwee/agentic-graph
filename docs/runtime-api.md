# Runtime API

## XR v2.0.0 pinned conformance adapters

The public XR v2 surface traces the requirements authority at
`5679d4101f5470fb85816b6df4f2ec0af6ca4eb7`. Import only from the public
barrel:

```ts
import {
  bindMaterialGraphToMeshStandardMaterial,
  createExactOnceBehaviorDispatcher,
  createParticleEmitter,
  createPreviewDeltaChannel,
  createXrV2CaptureSession,
  createXrV2ReadinessSnapshot,
  interpolateBoneTimeline,
  negotiateBrowserRecordingPlan,
  projectAuthoringEcsRows,
  projectCanonicalAuthoringEcsWorld,
  resolveXrV2PinnedCapabilityTier,
  resolveXrV2CapabilityProjection,
  runXrV2PinnedContractConformanceProbe,
  validateXrV2PinnedContractConformanceEvidence,
  XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA,
  XR_V2_PINNED_CONFORMANCE_SCHEMA,
  XR_V2_PINNED_SOURCE_REVISION,
  XrV2AuthoringStatusPanel,
} from '@/features/xr-v2'
```

`XR_V2_PINNED_SOURCE_REVISION` is the immutable source authority.
`XR_V2_PINNED_CONFORMANCE_SCHEMA` is
`knowgrph-xr-v2-pinned-contract-conformance/v1`. The conformance result is
`partial` while any pinned runtime blocker remains not observed.

### Ownership boundary

XR v2 is an adapter layer. The canonical capability decision still returns
`immersive-session`, `inline-viewer`, `monocular-capture`, `native-handoff`, or
`unsupported`. Existing feature-policy, WebXR, camera, scene, ECS, authoring,
recording, export, collaboration, and viewer owners retain their lifecycles.

The adapter does not classify platforms from user-agent strings, request
camera/session permission, create a renderer/world, publish assets, implement
a collaboration transport, or package already-encoded tracks.

### Pinned contract conformance

`runXrV2PinnedContractConformanceProbe()` executes bounded internal fixtures for
the deterministic slices of pinned AC-1–AC-12. The fixtures exercise the
existing capture, ECS projection, material, behavior, particle, timeline, and
preview owners; callers cannot inject observations that promote the result. It
returns evidence tied to the pinned revision rather than promoting the existing
readiness snapshot.

`validateXrV2PinnedContractConformanceEvidence(value)` validates the closed
shape and invariants. It rejects missing criteria, invalid evidence states,
wrong source/schema identity, or erased blockers. Validation is not readiness
authority.

The runtime blocker fields are:

- `liveDepthModel`
- `referenceFrameBudget`
- `physicalDeviceMatrix`
- `progressiveViewerMatrix`
- `mountedEcsRendering`
- `compiledShaderMeshRender`
- `trackPreservingContainerMux`
- `connectedPreviewTransport`

The probe may establish deterministic/source and bounded browser observations,
but full pinned readiness stays blocked until all eight claims have admitted
runtime proof.

### Capability projection (AC-1, AC-4, AC-5)

`resolveXrV2CapabilityProjection({ capability, depthEstimatorAvailable })`
accepts the canonical `XrCapabilitySnapshot`. It returns the unchanged
canonical recommendation and an explicit-user-action capture path.

The pinned conformance probe also produces exactly one compatibility tier from
`webxr-ar`, `webxr-vr`, `pseudo-ar-depth-parallax`, or `flat-fallback`. This is
a requirements projection, not a second decision owner or asset field. iOS
constraints use injected platform/feature facts; the XR adapter never reads
browser identity. `resolveXrV2PinnedCapabilityTier(input)` is that pure
compatibility projection; its `platformWebXrAllowed` fact must come from an
admitted owner rather than browser-name classification.

### Capture and fallback (AC-2, AC-3)

`createXrV2CaptureSession(options)` accepts a stable ID, bounded configuration,
and injected depth-estimator, stereo-synthesizer, artifact-sink, and clock
ports. Raw frames are written before optional processing; indexes are strictly
increasing and each frame is written once. Consecutive errors or budget
breaches move the session to raw capture and produce a typed post-process job
when finalized.

`synthesizeXrV2RgbaStereoPair(input)` is a deterministic admitted-input
transform. Neither function supplies model bytes, acquires a camera, proves a
live parallax preview, persists a remote job, or establishes named-device frame
budget. The AC-2 ≥90% probe is synthetic until those owners provide evidence.

### Authoring adapters (AC-6–AC-10)

`projectAuthoringEcsRows(rows, includeComponents?)` validates bounded query
rows, including canonical entity identifier `0`. It rejects negative IDs,
duplicates, unsafe fields, and unbounded input.

`projectCanonicalAuthoringEcsWorld(world, includeComponents?)` reads through
the repository-owned ECS query/snapshot API without allocating or mutating a
world.

`bindMaterialGraphToMeshStandardMaterial(material)` validates and applies the
closed material graph to a caller-owned `THREE.MeshStandardMaterial`.
`dispose()` only unbinds; the caller retains renderer/GPU disposal authority.
This proves a real standalone material, not a compiled shader/texture graph on
the canonical mounted target mesh.

`createExactOnceBehaviorDispatcher(graph, invoke)` commits each accepted
revision before invoking deduplicated wired actions. Callback failures cannot
replay a committed action, and unwired triggers invoke no callback.

`createParticleEmitter` enforces configured/global particle limits.
`interpolateNumericTimeline` and `interpolateBoneTimeline` provide bounded,
clamped interpolation and normalized shortest-path quaternion rotation. These
are deterministic adapters, not a second visual editor or mounted GPU/rig
runtime.

### Packaging and preview (AC-11, AC-12)

`inspectBrowserRecorderCapabilities` and
`negotiateBrowserRecordingPlan` select supported browser-native recording
output. Existing `renderVideoSequenceExport` owns edited-media rendering. The
browser smoke proves a non-empty artifact can decode and play; it does not
prove that already-encoded input track count/codecs are preserved.

`createPreviewDeltaChannel` is an in-memory, transport-neutral admission layer.
It bounds payload bytes, revisions, replay, and subscribers; clones payloads;
and rejects stale, skipped, oversized, and reentrant updates. Process-local
delivery does not prove a connected viewer, transport latency, or no-reload
behavior across sessions.

Historical illustrative `/xr.capture`, `/xr.author`, and
`kgc-behavior-graph/v1` entries and proposed Depth Anything V2, Rete.js,
three.quarks, Theatre.js, and custom muxer ADRs remain lineage. They are not
public runtime API unless separately canonicalized at an existing owner.

### Existing readiness/browser schemas

`createXrV2ReadinessSnapshot(input)` returns
`knowgrph-xr-v2-readiness/v1`, version `2.0.0`, for the contained
`xr-authoring-edited-media-delivery` slice. It remains `source-ready` in a task
lane and is not the requirements authority for AC-1–AC-12.

`validateXrV2DevRuntimeEvidence(value)` validates
`knowgrph-xr-v2-dev-runtime-evidence/v1` authoring and edited-media browser
observations. The local artifact uses `knowgrph-xr-v2-browser-smoke/v1`.
Neither validator promotes the source snapshot.

### Verification

Run from the repository root:

```bash
node --test scripts/__tests__/xr-v2-source-smoke.test.mjs
node scripts/run-xr-v2-source-smoke.mjs
node canvas/scripts/run_xr_v2_browser_smoke.mjs
npm run xr-v2:review-candidate
npm run xr-v2:review-ready
```

The gates provide Dev-only review-candidate evidence. Full runtime readiness
still requires admitted model bytes, reference/physical device proof,
track-preserving mux proof, and connected live-transport proof. None of these
commands deploys or releases.
