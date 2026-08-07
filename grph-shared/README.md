# grph-shared

Shared, codebase-neutral utilities consumed across sibling packages.

Apple spatial input, browser sensor lifecycle, flight dynamics, input
arbitration, and camera-target projection are owned by the standalone
`packages/apple-spatial-input` package. `grph-shared` must not reintroduce a
parallel export or implementation.
