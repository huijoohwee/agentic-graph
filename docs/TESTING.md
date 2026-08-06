# Testing

## XR v2 pinned runtime-readiness contract

The XR v2 gates trace the v3.0.0 authority pinned at
`42005d7572380beb421da0cb16055cf56ae4f2c4`. The mounted demo contains the
AC-1 through AC-12 deterministic, source, clean-room, and browser evidence
paths; the exact-candidate reviewer gate proves the current local observation.
The AC-14 collision bridge has separate focused source/unit proof and is not
promoted by the AC-1–AC-12 browser smoke.
AC-13 and AC-15–AC-17 remain undocumented. All checks are Dev-only and grant
no integration, release, Production, or deployment authority.

Run focused unit suites:

```bash
npm run xr-v2:unit
npm run video-editor:unit
```

Validate the source-runner ledger and positive/tamper contracts:

```bash
npm run xr-v2:source-runner:test
node scripts/run-xr-v2-source-smoke.mjs
```

The source gate requires:

- the exact pinned revision and complete AC-1–AC-12 conformance ledger;
- the canonical five-mode policy: `immersive-session`, `inline-viewer`,
  `monocular-capture`, `native-handoff`, and `unsupported`;
- retained existing owners instead of a second renderer, ECS, camera,
  Timeline, transport, or muxer;
- bounded evidence and explicit blockers; and
- every newly authored XR v2 source file to remain below 600 lines, while an
  admitted pre-existing larger owner may not grow past its parent line count.

Validate the independent editor implementation and dependency boundary:

```bash
node --test scripts/__tests__/video-editor-source-smoke.test.mjs
node scripts/run-video-editor-source-smoke.mjs
```

Historical candidate ADRs and illustrative invocations are requirements
lineage. These checks do not install Rete.js, three.quarks, Theatre.js, a depth
model, or a custom muxer, and do not restore `/xr.capture`, `/xr.author`, or
`kgc-behavior-graph/v1` as runtime owners.

After source checks pass, run fresh local Chromium evidence:

```bash
npm -C canvas run test:smoke:xr-v2:browser
```

The aggregate forbids existing-server reuse and runs two distinct observations.
`test:smoke:xr-v2:browser:comprehensive` opens the dedicated diagnostic route,
executes the admitted pinned conformance probes plus the existing XR
authoring/Timeline/media path, and writes
`data/outputs/xr-v2-browser-smoke.json` with schema
`knowgrph-xr-v2-browser-smoke/v1`. `test:smoke:xr-v2:browser:workspace-seed`
starts the normal workspace without `VITE_KNOWGRPH_RUN_READY_DEMO`, opens
`/knowgrph/?openEditorWorkspace=1`, resolves the exact `Source files`
navigation, expands Explorer → Source Files → docs → workspace-seeds, and clicks
`knowgrph-ar-vr-xr-runtime-readiness-demo.md`. It then asserts the mounted 3D/XR
and XR v2 readiness surfaces, camera `off`, sensors `off`, and separate explicit
camera, sensor, spatial-capture, and tier-gated immersive actions. AC-4 must
remain `not-observed` until saved media playback or immersive entry is actually
observed. The XR v2 runtime must be absent before that row is clicked.

The artifact binds clean exact-commit source identity and records:

- `knowgrph-xr-v2-pinned-contract-conformance/v1` lineage and AC results;
- `knowgrph-xr-v2-readiness/v1` for the contained existing slice;
- `knowgrph-xr-v2-dev-runtime-evidence/v1` browser observations;
- canonical entry and pinned capability projection results;
- capture/fallback and AC-8–AC-10 deterministic observations;
- ECS, material, Timeline, and process-local preview observations;
- edited-media bytes/type, decoded dimensions/duration, bounded playback, and
  resource cleanup; and
- empty page, console, and media error arrays.

Run the joined reviewer gates:

```bash
npm run xr-v2:review-candidate
npm run xr-v2:review-ready
npm run xr:review-ready
```

`npm run xr-v2:review-candidate` includes TypeScript, focused unit/source,
clean-room, comprehensive clean exact-commit Chromium evidence, and actual
Explorer-row workspace evidence. `npm run
xr-v2:review-ready` adds the source-runner contract suite and is the affected
scope’s review gate. `npm run xr:review-ready` retains established
camera-fallback compatibility.

Passing those gates establishes a browser-local mounted implementation plus
specific deterministic/adaptor browser evidence. The full pinned AC-1–AC-12
evidence status remains `partial`; readiness remains blocked until all of the
following exist:

- admitted immutable model bytes and named reference-device frame-budget proof;
- named physical camera/headset permission, session, interruption, and teardown
  proof;
- target-browser track-preserving mux proof for user-capture input tracks/codecs;
  and
- physical two-device live-transport latency and no-full-page-reload proof.

No local gate may erase those blockers or promote its own observation.
