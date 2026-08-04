# Runtime API

## XR v2.0.0 adapters

Import XR v2 contracts from the public barrel:

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
  resolveXrV2CapabilityProjection,
  XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA,
  XrV2AuthoringStatusPanel,
} from '@/features/xr-v2'
```

The package is an adapter layer. The canonical capability decision still
returns `immersive-session`, `inline-viewer`, `monocular-capture`,
`native-handoff`, or `unsupported`. Existing WebXR, camera, scene, authoring,
recording, export, and viewing owners retain their lifecycles.

### Capability projection

`resolveXrV2CapabilityProjection({ capability, depthEstimatorAvailable })`
accepts the canonical `XrCapabilitySnapshot`. It returns
`knowgrph-xr-capability-projection/v2`, the unchanged recommended entry mode,
an explicit-user-action permission state, and a capture pipeline of
`live-depth-preview`, `raw-capture`, or `unavailable`.

The caller admits model availability explicitly. The adapter does not classify
platforms or request permission.

### Authoring adapters

`projectAuthoringEcsRows(rows, includeComponents?)` validates bounded query
rows, including the canonical first entity identifier `0`. It rejects negative
IDs, unsafe fields, duplicates, and unbounded input.

`projectCanonicalAuthoringEcsWorld(world, includeComponents?)` is the read-only
bridge over the repository-owned ECS query and snapshot APIs. It neither
allocates nor mutates a world and fails closed when the supplied world cannot
be read.

`bindMaterialGraphToMeshStandardMaterial(material)` binds the closed material
graph compiler to a caller-supplied `THREE.MeshStandardMaterial`.
`apply(graph)` validates before mutation, updates that real material, and
returns a snapshot. `dispose()` unbinds the adapter and prevents later applies;
it does not call `material.dispose()`. The caller remains the sole owner of the
material and its renderer/GPU lifecycle. The focused proof uses a standalone
material and does not establish normal mounted-renderer wiring. The adapter
does not create a renderer, scene, camera, or mesh.

`createExactOnceBehaviorDispatcher(graph, invoke)` accepts monotonically
revisioned trigger events and commits each accepted revision before invoking a
deduplicated action set. Callback failures are reported without replaying
already accepted actions.

`createParticleEmitter` and its step/burst functions enforce configured and
global particle limits. `interpolateNumericTimeline` and
`interpolateBoneTimeline` provide deterministic clamped interpolation,
including normalized shortest-path quaternion rotation, for the existing
Timeline owner.

`inspectBrowserRecorderCapabilities` and
`negotiateBrowserRecordingPlan` select a supported browser-native recording
container without implementing encoding or packaging.

`createPreviewDeltaChannel` is an in-memory, transport-neutral admission
layer. It bounds payload bytes, replay, and subscribers; accepts only the next
revision; clones payloads; rejects stale, skipped, oversized, and reentrant
updates; and leaves delivery to the existing collaboration transport.

### Timeline command ownership

The existing Gantt/video-sequence editor exposes an optional typed command
boundary:

```ts
import {
  GANTT_TIMELINE_TRANSPORT_COMMAND_SCHEMA,
  routeGanttTimelineTransportCommand,
  type GanttTimelineTransportCommandAdapter,
} from '@/features/gitgraph/ganttTimelineTransportCommandAdapter'
```

An adapter returns `handled`, `unhandled`, or `rejected`. `handled` commits to
the external owner without also invoking the Markdown action. `unhandled`
preserves the current Markdown fallback. `rejected` and thrown adapter errors
fail closed without invoking that fallback. With no adapter, existing editor
behavior is unchanged.

### Edited-media delivery

`renderVideoSequenceExport` remains owned by the existing Timeline export
module. It consumes a bounded export plan, uses browser-supported
Canvas/MediaRecorder capabilities, and returns a Blob. The XR Dev smoke assigns
that Blob to a local video element, waits for decoded metadata, checks positive
dimensions and duration semantics, and observes actual playback. It revokes
the object URL during cleanup.

### Capture session

`createXrV2CaptureSession(options)` accepts a stable session ID, bounded
configuration, and injected depth-estimator, stereo-synthesizer, artifact-sink,
and clock ports.

The session state uses `knowgrph-xr-capture-snapshot/v2`. Raw frames are written
before live processing; increasing frame indexes and `maxFrames` are enforced.
Consecutive processing errors or frame-budget breaches move the session to
raw-capture and produce a typed post-process job when finalized. The adapter
does not acquire a camera, publish assets, or encode media itself.

### Deterministic RGBA synthesis

`synthesizeXrV2RgbaStereoPair(input)` validates equal positive dimensions,
finite normalized-depth values, and a non-negative integer disparity. It
returns `knowgrph-xr-stereo-pair/v2` with left and right RGBA frames. This pure
function is an admitted-input transform, not evidence that a depth model is
loaded or that a spatial result is correct.

### Readiness

`createXrV2ReadinessSnapshot(input)` returns
`knowgrph-xr-v2-readiness/v1`, version `2.0.0`, and the closed scope
`xr-authoring-edited-media-delivery`.

With only an entry mode, capability and capture-fallback evidence are
source-backed, authoring and browser playback remain unpromoted, and the
overall state is `source-ready`.

`validateXrV2DevRuntimeEvidence(value)` accepts
`XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA` only when all three authoring observations
succeeded and edited media has nonzero bytes, a video MIME type, positive
decoded dimensions, valid duration semantics, and observed playback. This is
shape validation, not readiness authority. `createXrV2ReadinessSnapshot` does
not accept that observation and cannot be promoted by caller assertions.

Live depth synthesis remains blocked until a same-origin model and named-device
frame-budget proof are admitted. Physical-device readiness remains blocked
until named mobile/headset evidence exists. Those blockers never disappear
from the source snapshot merely because a caller supplies booleans.

`XrV2AuthoringStatusPanel` renders this status in the existing authoring
surface. It does not promote a readiness state.

### Verification

Run the joined local review proof from the repository root:

```bash
npm run xr-v2:review-ready
```

The command runs the repository TypeScript check, XR unit/source ledgers,
editor clean-room enforcement, and a fresh clean-commit local Chromium
export/decode/playback observation. It does not claim canonical runtime
readiness, request a camera, enter an immersive
session, supply a depth model, prove a physical device, deploy, or release.
