---
title: "AgenticGraph Apple Spatial Input Shared Contract"
doc_type: "Runtime and Cross-Platform Contract"
status: "source-ready"
lang: "en-US"
frontmatter_contract: "required"
runtime_scope: "browser-local motion control and native adapter parity"
deploy_boundary: "protected source integrated; device certification separate"
---

# AgenticGraph Apple Spatial Input Shared Contract

## Outcome

AgenticGraph is the root source and upstream owner for the portable backend in
`packages/apple-spatial-input`. Its TypeScript modules own deterministic
calibration, screen-relative mapping, normalized-axis arbitration, Safari sensor
lifecycle, flight dynamics and envelope projection, camera follow-target
projection, profile validation, and schema identity. Its SwiftPM products own
the corresponding native value contracts, Core Motion lifecycle adapter, and
RealityKit flight rig. Renderers, authored scenes, visual assets, UI, and product
branding remain frontend concerns.

`BrowserAppleSensorController` is the sole browser sensor-lifecycle owner. The
AgenticGraph `motionControlDeviceSensorRuntime` is a thin frontend adapter that keeps
the existing `agenticgraph.motion-control-device-sensors/v2` projection while
delegating permission, calibration, event, timer, and cleanup behavior. That
projection preserves raw motion and orientation telemetry and adds:

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

The root Swift package exposes `AgenticGraphSpatialCore`,
`AgenticGraphAppleSpatialInput`, and `AgenticGraphRealityKitFlight`. Core Motion session
ownership and resource cleanup stay native; RealityKit flight-entity mutation
stays in the RealityKit product; and camera follow-target projection stays
renderer-neutral in SpatialCore. The consuming app owns actual camera-rig
mutation. SwiftUI and Reality Composer Pro remain consumer presentation and
authoring layers. Native adapters map platform motion to the same finite,
screen-relative sample contract and never import DOM types or treat browser
permission proof as native runtime proof.

The package uses Swift 6 language mode with explicit current Apple platform
floors. Compatibility claims still require `swift test`, Xcode compilation, and
physical iPhone/iPad/Apple Vision Pro validation at the exact protected revision.

## GameXR harmonization boundary

Within this Apple spatial-input, flight, and camera scope, GameXR is a verified
consumer of AgenticGraph's backend and may differ only in frontend and visual
projection. Its offline, zero-infrastructure web build consumes an exact
immutable npm-compatible tarball produced from `packages/apple-spatial-input`;
that tarball is generated distribution, never downstream-authored source.
Its native adapter consumes the AgenticGraph root SwiftPM products. Both routes are
pinned to protected AgenticGraph revision
`1288749a170e1e5790fccd4130e8f76562370745`; GameXR protected revision
`31512869dd041cf02ee6a2140e50ed2c8bb599f1` verifies that consumer boundary.

## AgenticGraph camera-control boundary

While the explicit Motion Control sensor surface is mounted and sensors are
running, calibrated `roll` maps to native-controller horizontal movement and
calibrated `pitch` maps inversely to its forward/backward axis. Keyboard,
gamepad, authored pose motion, and device motion use the shared arbitration
primitive once before the deterministic physics step. Multiple motion adapters
retain the single `motion` source identity.

The package also owns renderer-neutral flight dynamics, envelope projection,
and follow-target computation. AgenticGraph's Fixed Follow, Free Orbit, Timeline,
Game FPS, and Flight UI selection and camera mutation remain with their canonical
frontend owners; they must consume shared backend values instead of forking
sensor filtering, flight integration, or follow-target math.

## Proof boundary

Focused source proof covers every cardinal screen rotation, shortest-angle wrap,
first-sample neutrality, event-rate-independent smoothing, profile bounds,
jitter suppression, clamping, invalid samples, direct-gesture permissions,
normalized runtime axes, screen rotation/recenter, profile changes, listener
cleanup, and no persistence/egress path.

Source tests also cover inactive and uncalibrated device input, normalized axis
signs, same-source motion merging, and the device-input merge before the native
controller's single physics step.

GameXR's exact consumer revision passes automated mobile WebKit permission,
calibration, rotation, recenter, and installed-cache checks; seven Swift package
tests; and iOS and visionOS Simulator test-target execution. These are downstream
consumer proofs, not new backend ownership.

Physical Safari sensor behavior and Apple Vision Pro execution remain pending.
No Reality Composer Pro assets are admitted, and simulator evidence does not
claim physical-device comfort, sensor quality, thermal behavior, or lifecycle
certification. Production deployment receipts remain owned by GameXR's protected
mirror and must not be inferred from this source contract.
