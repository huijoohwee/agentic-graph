# Runtime API

## XR v2.0.0 adapters

Import XR v2 contracts from the public barrel:

```ts
import {
  compileMeshStandardMaterialGraph,
  createExactOnceBehaviorDispatcher,
  createParticleEmitter,
  createPreviewDeltaChannel,
  createXrV2CaptureSession,
  createXrV2ReadinessSnapshot,
  interpolateBoneTimeline,
  negotiateBrowserRecordingPlan,
  projectAuthoringEcsRows,
  resolveXrV2CapabilityProjection,
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

`projectAuthoringEcsRows(rows, includeComponents?)` consumes results from the
repository-owned ECS. It validates entity IDs, component names, JSON-safe
fields, duplicate rows, and hard bounds; it never allocates or mutates an ECS
world.

`compileMeshStandardMaterialGraph(graph)` evaluates a closed typed graph and
returns a `MeshStandardMaterial` parameter descriptor. It rejects cycles,
unknown references, type mismatches, unsafe values, and unbounded graphs. The
existing Three/R3F owner remains responsible for applying and disposing the
material.

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
container without implementing encoding or packaging. Playback proof remains
an independent blocked gate.

`createPreviewDeltaChannel` is an in-memory, transport-neutral admission
layer. It bounds payload bytes, replay, and subscribers; accepts only the next
revision; clones payloads; rejects stale, skipped, oversized, and reentrant
updates; and leaves delivery to the existing collaboration transport.

### Capture session

`createXrV2CaptureSession(options)` accepts a stable session ID, bounded
configuration, and injected ports:

- a depth estimator;
- a stereo synthesizer;
- an artifact sink; and
- a clock.

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
`knowgrph-xr-v2-readiness/v1` and version `2.0.0`.

Its capability, capture-fallback, and authoring evidence is source-backed.
Live synthesis becomes runtime-backed only when model-asset and named-device
frame-budget inputs are both true. Browser playback and physical-device
evidence are independent inputs. Missing evidence remains blocked and keeps
the overall state at `source-ready`.

`XrV2AuthoringStatusPanel` renders this status in the existing authoring
surface. It does not promote a readiness state.

### Verification

Run source/readiness conformance from the repository root:

```bash
node scripts/run-xr-v2-source-smoke.mjs
```

Run the Dev-only deterministic browser status check separately:

```bash
node canvas/scripts/run_xr_v2_browser_smoke.mjs
```

Neither command supplies model, decoded-playback, or physical-device evidence;
those promotion gates remain blocked.
