---
title: "Knowgrph XR Spatial Capture Fallback Readiness"
doc_type: "Runtime Readiness Contract"
status: "runtime-ready-dev"
lang: "en-US"
frontmatter_contract: "required"
runtime_scope: "XR entry capability detection and spatial-capture fallback"
deploy_boundary: "Dev-only"
---

# Knowgrph XR Spatial Capture Fallback Readiness

## Acceptance owner

`npm run xr:review-ready` is the one-command reviewer path for the current
browser-native XR fallback slice. It chains the repo-owned source proof and the
local runtime/browser acceptance command without widening scope.

`npm run xr:runtime-ready` is the local acceptance command for the current
browser-native XR fallback slice. It runs the repo-native source bundle
`test:smoke:xr-spatial-capture-fallback:source` and the real browser smoke
`test:smoke:xr-spatial-capture-fallback:browser`.

`npm run xr:source-runner:test` is the repo-owned source proof command for that
same slice. It pins the exact source verification ledger behind
`test:smoke:xr-spatial-capture-fallback:source`.

The source bundle covers the focused native-session policy source contract
`canvas.xrMode.nativeSessionPolicy` and the XR spatial-capture browser-smoke
contract `xr.spatialCaptureFallback.browserSmokeContract` through the
repo-owned runner `scripts/run-xr-spatial-capture-fallback-source-smoke.mjs`
without launching a browser.

The aggregate is intentionally narrow. It proves that one non-immersive browser
with camera capture available resolves `knowgrph-xr-capability-snapshot/v1` to
`recommended_entry_mode: monocular-capture`, publishes the expected DOM
capability markers, and keeps the proof on a fresh runner-owned Vite server.

## Evidence boundary

The source contract covers shared session-policy ownership in
`canvas/src/lib/three/ThreeGraphXrSessionPolicy.ts`, including explicit
capability resolution, reason-code emission, and the DOM marker wiring consumed
by the entry owner in `canvas/src/lib/three/ThreeGraphXr.tsx`.

The browser smoke contract covers the route, page, runner, and verifier seam:
`/__smoke__/xr-spatial-capture-fallback`,
`XrSpatialCaptureFallbackSmokePage.tsx`,
`run_xr_spatial_capture_fallback_browser_smoke.mjs`, and
`verify_xr_spatial_capture_fallback_browser_smoke.mjs`.

The live browser proof is bounded to one local Dev server, one local Chromium session, and ignored local evidence written to `data/outputs/xr-spatial-capture-fallback-browser-smoke.json`. It does not claim immersive hardware support, physical camera quality, production deployment, or Cloudflare mutation.

## Promotion rule

`npm run xr:runtime-ready` and `npm run xr:source-runner:test` establish the
Dev-local runtime and source-proof boundary for the first spatial-capture
fallback slice only. Broader XR acceptance, immersive-device coverage,
native-handoff UX, and release authority remain separate gates.
