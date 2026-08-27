# AgenticGraph Apple Spatial Input for Swift

This directory is the MIT-licensed Swift surface for AgenticGraph's spatial-input,
flight, and camera domain models. The repository-root `Package.swift` exposes:

- `AgenticGraphSpatialCore`: pure Codable and Sendable Apple filter, spatial-input
  arbitration, canonical lift/gravity/bank-turn flight model, and
  chase/cockpit/survey camera projection.
- `AgenticGraphAppleSpatialInput`: a Core Motion lifecycle controller with an
  injectable source for deterministic testing and host-defined screen axes.
- `AgenticGraphRealityKitFlight`: RealityKit components and a thin system that
  consumes render delta only through a bounded canonical fixed-step
  accumulator before calling the same `FlightSim` model.

The package targets iOS 18, visionOS 2, and macOS 15 in Swift 6 language mode.
Reality Composer content remains a consumer-owned visual asset; it can attach
the exported RealityKit components without becoming a second flight backend.

`Tests/Fixtures/backend-parity.v1.json` is the shared TypeScript/Swift golden
contract for defaults, one integration step, strict arbitration, NaN retention,
and every camera mode. Codable backend objects reject unknown keyed fields.

Host applications must provide `NSMotionUsageDescription` on iOS and visionOS.
They retain responsibility for scene lifecycle calls, permission-facing UI,
and physical-device validation. The controller stops Core Motion on explicit
stop, calibration timeout, restart, and deinitialization.
