# @knowgrph/apple-spatial-input

FOSS, local-first primitives shared by Knowgrph and visual consumers such as GameXR. The package has no runtime dependencies, persistence, network, analytics, or infrastructure path.

## Public boundary

- `profile` and `filter`: validated Apple motion profiles plus deterministic, screen-relative calibration and smoothing.
- `browser-controller`: an instance-scoped Safari controller. Call `enable()` directly from a user gesture; iOS motion and orientation permission functions are invoked synchronously before the returned promise can settle.
- `input`: deterministic per-axis arbitration. `arbitrateSpatialInput` throws a typed source/axis error for non-finite controls; `mergeFlightSimInputs` deliberately propagates `NaN` to the flight-frame validator, whose result records each rejected axis.
- `flight`: configurable fixed-step aircraft and flight-envelope projections.
- `camera`: configurable chase, cockpit, and survey follow-target projections without renderer dependencies.

All APIs are available from `@knowgrph/apple-spatial-input`; stable subpath exports are also declared. The JSON profile contract is exported as `@knowgrph/apple-spatial-input/schema/apple-spatial-input-profile.v1.schema.json`.

```ts
import {
  BrowserAppleSensorController,
  DEFAULT_APPLE_SPATIAL_INPUT_PROFILE,
} from '@knowgrph/apple-spatial-input'

const controller = new BrowserAppleSensorController({
  profile: DEFAULT_APPLE_SPATIAL_INPUT_PROFILE,
})

enableButton.addEventListener('click', () => {
  void controller.enable()
})
```

Use `disable()` when a surface closes and `dispose()` when its owner is destroyed. Screen rotation, `pagehide`, and hidden-page transitions recenter or clean up automatically.

## Development

```sh
npm install
npm test
npm pack --dry-run
```

`npm test` builds declarations and ESM, runs deterministic source tests, and validates the publish artifact. MIT licensed.
