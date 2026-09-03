---
title: "agentic-graph XR Spatial Capture Fallback Readiness"
doc_type: "Runtime Readiness Contract"
status: "runtime-ready-dev"
lang: "en-US"
frontmatter_contract: "required"
runtime_scope: "XR entry capability detection and spatial-capture fallback"
deploy_boundary: "Dev-only"
---

# agentic-graph XR Spatial Capture Fallback Readiness

## Acceptance owner

`npm run xr:review-ready` is the one-command reviewer path for the current
browser-native XR fallback slice. It chains the repo-owned source proof and the
local runtime/browser acceptance command without widening scope.

`npm run xr:runtime-ready` is the local acceptance command. It runs
`test:smoke:xr-spatial-capture-fallback:source` and
`test:smoke:xr-spatial-capture-fallback:browser`.

`npm run xr:source-runner:test` verifies the repo-owned source runner contract.
The runner is `scripts/run-xr-spatial-capture-fallback-source-smoke.mjs`.

## Proven slice

The source bundle covers:

- `canvas.xrMode.nativeSessionPolicy`;
- `xr.spatialCaptureFallback.browserSmokeContract`;
- `xr.spatialCaptureFallback.readiness`; and
- `xr.spatialCaptureFallback.runtimeReady`.

It binds the five-mode `agentic-graph-xr-capability-snapshot/v1` policy to the
entry owner in `ThreeGraphXr.tsx`, including the exact
`recommended_entry_mode: monocular-capture` fallback, capability/reason
markers, and the **Open camera capture** action. Source proof verifies that the
action selects the existing Spatial Capture `capture` mode and opens the
existing Motion Control owner.

The local browser smoke uses a fresh runner-owned Vite server and one local
Chromium session. It removes `navigator.xr`, supplies a camera API stub, and
verifies:

- the spatial-capture surface is mounted;
- immersive support is false;
- the recommended and selected mode is `monocular-capture`;
- the camera capability and reason markers are present; and
- the `open-motion-control` action is visible with the expected label; and
- selecting it changes the existing primary mode to `capture` and opens the
  existing Motion Control surface.

Evidence is written to the ignored local path
`data/outputs/xr-spatial-capture-fallback-browser-smoke.json`.

## Evidence boundary

This is a Dev-local runtime and source-proof boundary. The browser smoke clicks
the fallback route but does not click through a permission prompt, start camera
capture, or consume a physical camera. The camera API is stubbed so the proof
covers deterministic entry resolution and existing-owner routing only.

It does not claim immersive hardware support, physical camera quality, pose
quality, recording, depth, spatial reconstruction, asset publication, native
handoff completion, production deployment, or Cloudflare mutation.

## Promotion rule

Passing `npm run xr:review-ready` makes the bounded fallback slice locally
reviewable. Broader XR readiness requires separate physical-device evidence.
Protected integration, Production, and publication remain governed by their
own authorization and exact-revision gates.
