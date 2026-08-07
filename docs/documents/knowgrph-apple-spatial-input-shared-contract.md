---
title: "Knowgrph Apple Spatial Input Shared Contract"
doc_type: "Runtime and Cross-Platform Contract"
status: "source-ready"
lang: "en-US"
frontmatter_contract: "required"
runtime_scope: "browser-local motion control and native adapter parity"
deploy_boundary: "Dev-only"
---

# Knowgrph Apple Spatial Input Shared Contract

## Outcome

Knowgrph reuses GameXR's pure Apple spatial-input shaping contract through
`grph-shared/spatial-input/appleSpatialInput`. The package owns deterministic
calibration, screen-relative mapping, normalized axes, jitter suppression,
elapsed-time smoothing, clamping, profile validation, and schema identity. It
does not own a browser, camera, renderer, scene, native framework, or network.

The existing Knowgrph device-sensor runtime remains the browser lifecycle owner.
Its `knowgrph.motion-control-device-sensors/v2` snapshot preserves raw motion and
orientation telemetry and adds:

- `spatialInputSchema: airvio.apple-spatial-input/v1`;
- the validated `spatialInputProfile`;
- `calibrated`, normalized `pitch` and `roll`, and `screenAngleDegrees`;
- explicit profile configuration and recenter functions.

The native-controller stage consumes the normalized axes as local movement input
before its single physics step. Its existing fixed-follow camera then follows
the resulting player pose. Future scenes, vehicles, avatars, animation
controllers, and RealityKit adapters may consume the same axes; they must not
reinterpret raw beta/gamma or create another filter.

## User-configurable profile

| Field | Default | Valid range | Responsibility |
|---|---:|---:|---|
| `controlRangeDegrees` | 35 | 5-90 | Degrees required to reach a full normalized axis. |
| `jitterThresholdDegrees` | 0.75 | 0-5 | Neutral dead zone before normalization. |
| `settledAxisThreshold` | 0.002 | 0-0.1 | Snaps a decaying neutral axis to zero. |
| `smoothingRatePerSecond` | 12 | 1-60 | Refresh-rate-independent response. |
| `calibrationTimeoutMilliseconds` | 2500 | 250-10000 | Adapter-owned wait before reporting a missing sample. |

Unknown keys, wrong schema identity, missing values, non-finite values, and
out-of-range values fail closed. Changing a valid profile while sensors are
running resets the baseline and axes; the next finite orientation sample becomes
neutral.

## Safari and local-first lifecycle

1. Nothing requests permission on import, mount, inspection, or disable.
2. `DeviceMotionEvent.requestPermission()` and
   `DeviceOrientationEvent.requestPermission()` are called synchronously from
   the explicit Enable Sensors gesture when the constructors expose them.
3. Sensor listeners start only after every available permission request grants.
4. The first finite beta/gamma sample calibrates to zero. Non-finite raw values
   may be displayed as `null` but cannot alter calibration or normalized axes.
5. `screen.orientation.angle` rotates deltas into the displayed screen axes. A
   screen-orientation change, explicit recenter, or profile change resets the
   baseline before more control is published.
6. Disable, page hide, visibility loss, denial, and re-enable clear calibration
   timers and remove sensor, screen-orientation, and page-lifecycle listeners.
7. Samples remain in memory. The runtime contains no fetch, beacon, WebSocket,
   browser storage, IndexedDB, camera, or MCP egress path.

## Apple native adapter boundary

RealityKit, Reality Composer Pro, Swift, SwiftUI, iOS, and visionOS adapters may
emit the same four finite sample values: beta, gamma, screen angle, and monotonic
timestamp. They must keep permission, Core Motion session ownership, scene/entity
mutation, animation playback, and resource cleanup native. A native adapter maps
its platform orientation into the same screen-relative degrees before using the
profile; it must not import DOM types or pretend browser permission proof is
native runtime proof.

The pure package has no Apple-framework version pin and no browser dependency,
so it does not constrain the latest Apple SDK deployment target. Compatibility
still requires separate Xcode compilation and physical iPhone/iPad/Apple Vision
Pro validation at the exact native revision.

## GameXR harmonization boundary

The shared TypeScript implementation is promoted from
`GameXR/shared/apple-spatial-input.ts`. GameXR keeps its local source while
`grph-shared` remains a private `0.0.0` workspace package; a sibling `file:`
dependency or alias fallback would break isolated GitHub and Cloudflare builds.
A future repository-owned distribution boundary can replace the duplicate source
only after both isolated build graphs consume the same immutable package.

## Knowgrph camera-control boundary

While the explicit Motion Control sensor surface is mounted and sensors are
running, calibrated `roll` maps to native-controller horizontal movement and
calibrated `pitch` maps inversely to its forward/backward axis. Keyboard,
gamepad, authored pose motion, and device motion merge once before the shared
deterministic physics step. Multiple motion adapters retain the single `motion`
source identity.

This connection drives only the native-controller player and its existing
`fixed-follow` camera. Free Orbit intentionally remains user-operated. Game FPS,
Flight, and other camera owners do not consume this adapter and require separate
explicit lifecycle and input routes.

## Proof boundary

Focused source proof covers every cardinal screen rotation, shortest-angle wrap,
first-sample neutrality, event-rate-independent smoothing, profile bounds,
jitter suppression, clamping, invalid samples, direct-gesture permissions,
normalized runtime axes, screen rotation/recenter, profile changes, listener
cleanup, and no persistence/egress path.

Source tests also cover inactive and uncalibrated device input, normalized axis
signs, same-source motion merging, and the device-input merge before the native
controller's single physics step.

This change does not claim physical Safari sensor proof, iOS or visionOS native
execution, RealityKit/Reality Composer Pro scene mutation, Production, Cloudflare,
or deployment. Those remain separate exact-revision validation and release gates.
