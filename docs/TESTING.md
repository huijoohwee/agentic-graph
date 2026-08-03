# Testing

## XR v2.0.0

XR v2 uses focused, directly runnable checks so source conformance, local
browser rendering, and hardware evidence remain separate.

From the repository root, validate the Node harness and its failure
aggregation:

```bash
node --test scripts/__tests__/xr-v2-source-smoke.test.mjs
```

Validate the public adapter surface, canonical five-mode policy, authored-file
budgets, deterministic smoke source, and readiness documentation:

```bash
node scripts/run-xr-v2-source-smoke.mjs
```

The aggregate prints one status for each contract. A successful run is
source-backed evidence only. It does not satisfy any runtime or device gate.

After the source ledger passes, render the deterministic status surface in a
fresh local Chromium session:

```bash
node canvas/scripts/run_xr_v2_browser_smoke.mjs
```

The runner requests the Dev-only application route that lazily imports
`canvas/src/features/testing/XrV2RuntimeSmokePage.tsx`. Its artifact is
`data/outputs/xr-v2-browser-smoke.json`, using schema
`knowgrph-xr-v2-browser-smoke/v1`.

Expected default state:

- `capabilityDetection`, `captureFallback`, and `authoringAdapters` are
  `source-backed`;
- the focused TSX suite covers capture synthesis and fallback, ECS projection,
  material and behavior graphs, particle ceilings, Timeline interpolation,
  recorder negotiation, preview revisions, and evidence-state promotion;
- the overall readiness schema is `knowgrph-xr-v2-readiness/v1` and its status
  is `source-ready`;
- live synthesis is blocked by the model-asset and reference-device gates;
- browser playback is blocked; and
- physical-device behavior is blocked.

The five canonical entry modes remain `immersive-session`, `inline-viewer`,
`monocular-capture`, `native-handoff`, and `unsupported`.

These checks are Dev-only. Browser DOM proof must not be described as camera,
headset, capture-output, model-inference, playback, Production, or deployment
proof.
