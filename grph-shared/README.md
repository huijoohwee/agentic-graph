# grph-shared

Shared, codebase-neutral utilities consumed across sibling packages.

## Apple spatial input

`grph-shared/spatial-input/appleSpatialInput` is the DOM-neutral control-shaping
contract shared with GameXR. Schema `airvio.apple-spatial-input/v1` converts
finite `DeviceOrientationEvent` beta/gamma samples into screen-relative,
calibrated `pitch` and `roll` axes normalized to `[-1, 1]`.

The versioned profile makes control range, jitter suppression, settled-axis
threshold, elapsed-time smoothing, and adapter-owned calibration timeout
configurable within validated bounds. The first valid sample after reset is
always the neutral pose; callers reset on explicit recenter, screen-orientation
change, lifecycle stop, or profile change.

This package intentionally does not request Safari sensor permission, install
or remove browser listeners, read cameras, call Core Motion, persist samples,
or use the network. App adapters own direct-gesture permission, page and screen
lifecycle, source selection, cleanup, and user-facing controls. Native
RealityKit, Reality Composer Pro, Swift, and SwiftUI clients can implement the
same schema and shaping rules without importing browser APIs.
