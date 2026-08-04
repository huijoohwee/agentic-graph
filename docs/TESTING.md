# Testing

## XR v2 authoring and edited-media delivery

XR v2 uses separate unit, source, clean-room, browser, and aggregate gates.
All checks are Dev-only and grant no integration, release, or deployment
authority.

Run the XR v2 unit suite:

```bash
npm run xr-v2:unit
npm run video-editor:unit
```

Validate the source-runner ledger and its failure aggregation:

```bash
node --test scripts/__tests__/xr-v2-source-smoke.test.mjs
```

Validate the public adapter surface, canonical five-mode policy, authored-file
budgets, browser-smoke source, target PRD/TAD/ADR, and readiness docs:

```bash
node scripts/run-xr-v2-source-smoke.mjs
```

Validate the no-copy policy, exact attribution channel, identifiable external
lineage, vendor/generated paths, and direct or transitive editor dependencies:

```bash
node --test scripts/__tests__/video-editor-source-smoke.test.mjs
node scripts/run-video-editor-source-smoke.mjs
```

After the source ledgers pass, run fresh local Chromium evidence:

```bash
node canvas/scripts/run_xr_v2_browser_smoke.mjs
```

The runner forbids existing-server reuse and opens the dedicated test route. It
exercises the focused XR authoring adapters and real mounted Timeline control,
invokes the existing Timeline exporter over the committed same-origin media
fixture, attaches the
non-empty result to a video element, waits for decoded metadata/readiness, and
performs bounded playback. It writes
`data/outputs/xr-v2-browser-smoke.json` with schema
`knowgrph-xr-v2-browser-smoke/v1`.

The artifact requires a clean exact task commit and must bind:

- branch, task revision, commit-tree identity, deterministic worktree-state
  digest/dirty count, and the locally observed `origin/main` remote-tracking
  revision (not a fetch-freshness receipt);
- `knowgrph-xr-v2-readiness/v1`;
- `knowgrph-xr-v2-dev-runtime-evidence/v1`;
- the canonical entry mode;
- ECS/material/Timeline authoring observations;
- output byte size and MIME type;
- decoded video width, height, duration, and playback observation;
- retained model-asset/reference-device and physical-device blockers; and
- empty page, console, and media error arrays.

Run the focused aggregate:

```bash
npm run xr-v2:review-candidate
npm run xr-v2:review-ready
```

The candidate aggregate includes the repository TypeScript check; the review
aggregate adds both source-runner contract suites. Neither promotes the
source-ready runtime snapshot.

The established camera-fallback compatibility aggregate remains:

```bash
npm run xr:review-ready
```

The five canonical entry modes are `immersive-session`, `inline-viewer`,
`monocular-capture`, `native-handoff`, and `unsupported`.

Passing the aggregate establishes clean exact-commit review evidence only for
XR authoring and edited-media delivery. Canonical runtime readiness still
requires protected integration and canonical-main proof. Live depth remains
blocked until a same-origin model-asset and named reference-device frame-budget
proof are admitted.
Physical XR/camera behavior remains blocked until named physical-device proof
exists. Production and deployment remain blocked.
