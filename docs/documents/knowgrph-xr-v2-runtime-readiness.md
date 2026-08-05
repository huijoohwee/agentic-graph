---
title: "Knowgrph XR v2 — Pinned Runtime-Readiness Evidence"
doc_type: "runtime-readiness"
version: "2.1.0"
date: "2026-08-05"
owner: "Knowgrph XR runtime"
status: "review-candidate"
local_rung: "source-ready"
readiness_scope: "pinned-ac1-ac12-conformance"
pinned_source_revision: "5679d4101f5470fb85816b6df4f2ec0af6ca4eb7"
deploy_boundary: "Dev-only"
---

# Knowgrph XR v2 — Pinned Runtime-Readiness Evidence

## Result

This evidence contract implements traceability and executable conformance for
the v2.0.0 requirements pinned at
`5679d4101f5470fb85816b6df4f2ec0af6ca4eb7`. It does not replace those
requirements with the later `xr-authoring-edited-media-delivery` slice. That
slice remains useful browser evidence, but the authority is pinned AC-1 through
AC-12.

Current result:

- all twelve acceptance criteria have a checked-in owner, executable probe, or
  explicit blocker;
- deterministic/source-backed and specific browser-backed slices are eligible
  for review-candidate evidence;
- full pinned runtime readiness is **blocked** on admitted model bytes, named
  reference/physical devices, connected live transport, and track-preserving
  mux proof; and
- the scope is Dev-only and carries no Production or deployment authority.

## Evidence vocabulary

| State | Meaning |
|---|---|
| `source-backed` | Owner, contract, bounds, and focused source/unit checks exist |
| `browser-backed` | A clean exact-commit browser route executes the stated behavior |
| `blocked` | The requirement lacks admitted runtime evidence named in this document |

The schemas are `knowgrph-xr-v2-pinned-contract-conformance/v1`,
`knowgrph-xr-v2-readiness/v1`,
`knowgrph-xr-v2-dev-runtime-evidence/v1`, and
`knowgrph-xr-v2-browser-smoke/v1`. Validating any payload shape cannot promote
its readiness state.

## AC-1–AC-12 evidence ledger

| AC | Current evidence | State | Missing promotion proof |
|---|---|---|---|
| AC-1 | Canonical feature policy plus exact-one pinned tier projection | source-backed | Named physical matrix |
| AC-2 | Bounded capture session, raw-first writes, stereo synthesis, ≥90% deterministic probe | source-backed | Admitted model asset and named reference-device live preview |
| AC-3 | Consecutive-breach fallback and typed post-process job through injected ports | source-backed | Connected durable job execution |
| AC-4 | Canonical entry route and four-tier compatibility/browser probe | browser-backed | Physical four-tier viewer matrix |
| AC-5 | Feature-matrix iOS constraint with no user-agent branch | source-backed | Named iOS device/browser pass |
| AC-6 | Root-ECS projection, component query, entity-zero observation | browser-backed | Complete mounted scene rendering proof |
| AC-7 | Closed graph applied to a real caller-owned material | browser-backed | Texture/shader graph on canonical target mesh |
| AC-8 | Wired exact-once and unwired no-callback probe | source-backed | Visual graph UI/schema publication, if later admitted |
| AC-9 | Bounded fixed-duration emitter probe | source-backed | Mounted GPU authoring surface |
| AC-10 | Numeric/bone interpolation tolerance probe | source-backed | Rigged mounted playback |
| AC-11 | Existing edited-media output decodes and plays in Chromium | browser-backed | Already-encoded input track/codec preservation |
| AC-12 | Bounded process-local delta delivery and no-reload observation | source-backed | Connected viewer transport and measured latency |

The pinned four-tier terms are a compatibility projection over the canonical
five entry modes: `immersive-session`, `inline-viewer`, `monocular-capture`,
`native-handoff`, and `unsupported`. The canonical policy remains the single
decision owner.

## Runtime owner boundaries

- `canvas/src/lib/three/ThreeGraphXrSessionPolicy.ts` owns feature probes and
  canonical entry selection.
- Existing mounted Three.js/R3F owners retain renderer, session, camera, scene,
  mesh, and GPU lifecycles.
- Root `ecs` owns allocation, storage, query, and snapshots.
- `canvas/src/features/xr-v2` owns bounded adapters and the pinned conformance
  ledger; it does not acquire media or publish assets.
- Existing Gantt/video-sequence Timeline and gitgraph modules own edit state,
  preview, export, and typed external-command routing.
- The existing collaboration owner must provide any future connected live
  transport; the preview delta channel is process-local and transport-neutral.

Historical `/xr.capture`, `/xr.author`, and `kgc-behavior-graph/v1` rows and the
Depth Anything V2, Rete.js, three.quarks, Theatre.js, and custom muxer ADRs are
lineage only. They are not restored runtime routes, persisted contracts,
packages, or owners by this change.

## Browser evidence contract

`node canvas/scripts/run_xr_v2_browser_smoke.mjs` starts a fresh local Vite
process and uses the dedicated route. Its clean exact-commit artifact records
source identity, canonical capability output, pinned conformance observations,
ECS/material/Timeline probes, edited-media bytes/type, decoded dimensions and
duration semantics, bounded playback, cleanup, and empty page/media error
arrays.

The artifact schema is `knowgrph-xr-v2-browser-smoke/v1`; its bounded runtime
payload is `knowgrph-xr-v2-dev-runtime-evidence/v1`. The observation is local
review evidence only. It does not claim real capture, live depth, a physical
headset, connected transport, track-preserving mux, release, or deployment.

## Reviewer commands

Run from the repository root:

```sh
node --test scripts/__tests__/xr-v2-source-smoke.test.mjs
node scripts/run-xr-v2-source-smoke.mjs
npm run xr-v2:unit
node --test scripts/__tests__/video-editor-source-smoke.test.mjs
node scripts/run-video-editor-source-smoke.mjs
node canvas/scripts/run_xr_v2_browser_smoke.mjs
npm run xr-v2:review-candidate
npm run xr-v2:review-ready
npm run xr:review-ready
```

`npm run xr-v2:review-candidate` joins TypeScript, focused unit/source checks,
the clean-room ledger, and fresh Chromium evidence. `npm run
xr-v2:review-ready` adds runner contract tests and is the focused affected-CI
gate. Neither command promotes a task-lane observation or deploys.

## Promotion register

| Blocker | Required evidence |
|---|---|
| Model bytes | Version, immutable digest, license, same-origin asset path, input/output and memory budgets |
| Reference/physical devices | Named hardware/browser, frame budget, permission/session lifecycle, interruption and teardown |
| Track-preserving mux | Already-encoded input/output track counts and codecs plus standard-browser playback |
| Connected live transport | Canonical transport, author/viewer sessions, bounded latency, no build, no full-page reload |
| Production | Separately authorized integration, release, delivery, and rollback proof |

Until every required row is admitted, pinned conformance remains `partial` and
full runtime readiness remains blocked, even where individual deterministic or
browser slices are ready. The contained existing readiness snapshot remains
`source-ready`; it is not the state of the full pinned contract.
