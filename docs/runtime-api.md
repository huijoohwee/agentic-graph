# Runtime API

## Agentic OS invocation execution

The browser and headless invocation path shares one canonical WebMCP tool
registry. `createWebMcpToolRegistry()` indexes the exact tool objects assembled
for `document.modelContext`; `getAgenticGraphWebMcpToolRegistry()` exposes that
same frozen registry for direct execution. A caller therefore cannot select a
different executor, alias, or provider adapter than the tool registered with
the browser runtime.

The resolver performs the read-only docs MCP round trip once, then the executor
retains its result as an opaque local capability. `executeAgenticOsInvocation()`
accepts only that unchanged capability while its cached catalog and routing
proof remain fresh. The exact pinned dictionary paths, `/` command, `#`
semantics, `@` bindings, command-to-tool mapping, and displayed selection must
still match. Caller-asserted proof, ambiguous ownership, case drift, selection
movement, non-JSON input, missing required input, or an unavailable tool fails
before dispatch. This local proof check permits a domain-owned offline outbox
without another network call. Input is snapshotted before asynchronous work,
and a valid invocation calls the immutable registry executor exactly once.

Tools annotated with `destructiveHint: true` use a two-step confirmation. The
first call returns `confirmation-required` with a SHA-256 binding fingerprint
and a cryptographically random, expiring challenge bound to the exact
resolution, tool, and input. Only a second call atomically consuming that
one-time challenge may execute; guesses, replay, expiry, proof drift, or input
drift fail before dispatch. The browser renders the tool title, description,
and destructive warning; headless consumers use the same outcome contract.

The executor is transport-neutral and owns no retry loop or generic offline
queue. A feature owner may return `status: queued` from its own domain outbox;
that typed result is preserved but is not promoted to a persistence claim by
the generic executor. A transport failure while offline returns
`offline-unavailable` and never claims persistence. The Agentic Canvas OS
documentation endpoint remains a read-only grammar and proof authority.

The Skills & Commands panel supports touch and keyboard selection of `/`
commands, a structured JSON input editor, duplicate-dispatch fencing, and an
explicit execution action. It retains terminal evidence for the launched
invocation even if another surface retargets selection. `#` and `@` entries
remain invocation modifiers rather than independently executable actions.

## XR v2 pinned conformance adapters (v3.0.0 authority)

The public XR v2 surface traces the requirements authority at
`5e27c0ea4318760aaa3b726dc3951c1957814a9b`. Import only from the public
barrel:

```ts
import {
  bindMaterialGraphToMeshStandardMaterial,
  createXrV2CollisionEventBridge,
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
  XR_V2_COLLISION_BRIDGE_MAX_SEEN_EVENTS,
  XR_V2_PINNED_CONFORMANCE_SCHEMA,
  XR_V2_PINNED_SOURCE_REVISION,
  XrV2AuthoringStatusPanel,
} from '@/features/xr-v2'
```

`XR_V2_PINNED_SOURCE_REVISION` is the immutable source authority.
`XR_V2_PINNED_CONFORMANCE_SCHEMA` is
`agentic-graph-xr-v2-pinned-contract-conformance/v1`. The conformance result is
`partial` while any pinned runtime blocker remains not observed.

### Ownership boundary

XR v2 is an adapter layer. The canonical capability decision still returns
`immersive-session`, `inline-viewer`, `monocular-capture`, `native-handoff`, or
`unsupported`. Existing feature-policy, WebXR, camera, scene, ECS, authoring,
recording, export, collaboration, and viewer owners retain their lifecycles.

The capability and pinned-conformance adapters do not classify platforms from
user-agent strings, request camera/session permission, create a renderer/world,
implement a collaboration transport, or package already-encoded tracks. Saved
asset publication is a separate explicit adapter described below.

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

### Collision-to-behavior bridge (AC-14)

`createXrV2CollisionEventBridge({ dispatcher, bindings, maxSeenEvents? })`
accepts the existing exact-once behavior dispatcher and explicit normalized
collider-pair-to-numeric-entity bindings. It maps only native
`collision-began` and `collision-ended` transitions to `collision-begin` and
`collision-end`; preserved sensor transitions bypass this bridge.

The replay ledger defaults to and cannot exceed
`XR_V2_COLLISION_BRIDGE_MAX_SEEN_EVENTS` (4096). A new identity at capacity
returns `capacity-exhausted` without dispatch or eviction. Replays return the
canonical dispatcher `stale` result, unbound pairs invoke zero actions, and
public event IDs are compact safe identifiers rather than raw collider paths.
Malformed events and invalid bindings fail closed with `TypeError`.

One bridge instance is exactly one replay epoch. A physics reset that starts a
new epoch must construct a new bridge instance; the prior bridge never evicts
or re-admits an identity from its bounded ledger.

The bridge is a deterministic source adapter. It does not create a second
physics engine, event bus, behavior dispatcher, ECS, invocation alias, or
automatic scene binding, and its unit proof is not browser/device evidence.

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

The Explorer-mounted XR readiness surface exposes two explicit browser-local
actions. `runXrV2BrowserPackagingAction` binds the selected raw clip and frame
bundle, produces encoded tracks before mux, decodes every source sample,
verifies exact codec/count/payload preservation, and returns evidence only after
the visible WebM advances. `runXrV2ConnectedPreviewAction` accepts evidence only
after a real WebRTC edit paints the distinct attached viewer canvas in a later
browser frame, is acknowledged within the bound, and causes no navigation.

Spatial captures remain local-first IndexedDB records.
`createXrV2CrossDeviceAssetAdapter` adds explicit publish/list/read through the
existing Asset Contract Writer: blob parts precede a deterministic manifest,
downloads are bounded and SHA/size/content-type checked, and local rehydration
commits raw/blob/catalog state atomically. Construction and mount perform no network request. The inherited shared routes do not enforce workspace
authentication or recompute upload digests; this typed external promotion
blocker is not hidden or upgraded by client code. None of these actions requests
camera, sensors, immersive entry, or remote signalling.

Historical illustrative `/xr.capture`, `/xr.author`, and
`kgc-behavior-graph/v1` entries and proposed Depth Anything V2, Rete.js,
three.quarks, Theatre.js, and custom muxer ADRs remain lineage. They are not
public runtime API unless separately canonicalized at an existing owner.

### Existing readiness/browser schemas

`createXrV2ReadinessSnapshot(input)` returns
`agentic-graph-xr-v2-readiness/v1`, version `2.0.0`, for the contained
`xr-authoring-edited-media-delivery` slice. It remains `source-ready` in a task
lane and is not the requirements authority for AC-1–AC-12.

`validateXrV2DevRuntimeEvidence(value)` validates
`agentic-graph-xr-v2-dev-runtime-evidence/v1` authoring and edited-media browser
observations. The local artifact uses `agentic-graph-xr-v2-browser-smoke/v1`.
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
