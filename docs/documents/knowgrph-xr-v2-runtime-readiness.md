---
title: "Knowgrph XR v2 — Pinned Runtime-Readiness Evidence"
doc_type: "runtime-readiness"
version: "3.0.0"
date: "2026-08-06"
owner: "Knowgrph XR runtime"
status: "review-candidate"
local_rung: "browser-demo-ready"
readiness_scope: "pinned-ac1-ac12-conformance"
pinned_source_revision: "b41cc13b0798fb4e66ec9b3e8086ee13f6d72d99"
pinned_source_blob: "12aab1a46c230d5e006f78f4a87e3d0db93ed494"
pinned_source_sha256: "38099b9a9838929dfa287e3be8317e7828562288a8303f43b1579728053d7bab"
deploy_boundary: "Dev-only"
---

# Knowgrph XR v2 — Pinned Runtime-Readiness Evidence

## Result

The immutable requirements authority is the exact 101,752-byte document from
commit `b41cc13b0798fb4e66ec9b3e8086ee13f6d72d99`; the repository gate rejects
any byte drift at its canonical path. This separate evidence overlay binds the
implementation and evidence path for every pinned AC-1–AC-12 criterion through
the real `xr-v2` workspace seed.

The v3.0.0 authority adds AC-13–AC-17 while preserving the existing AC-1–AC-12
browser ledger. This candidate implements only the bounded AC-14 source seam:
native collision events survive fixed-step aggregation and enter the existing
exact-once behavior dispatcher through one fail-closed bridge. AC-13, AC-15,
AC-16, and AC-17 remain `undocumented`; AC-14 browser/device evidence is not
inferred from the existing AC-1–AC-12 demo.

The clean exact-candidate gate now proves the AC-1–AC-12 local browser demo.
AC-14 remains source-only: its collision bridge is not promoted by that mounted
demo observation. Neither the bounded browser evidence nor the AC-14 source
candidate completes AC-13–AC-17 or manufactures physical-device certification
or Production deployment authority.
Named reference/physical devices and deployed Cloudflare observation remain
external promotion evidence and therefore `blocked` until separately captured.
The task lane is Dev-only and cannot merge or deploy itself.
Target-browser track-preserving mux proof and a two-device connected live transport
observation are likewise recorded as external promotion evidence.

## Evidence vocabulary

| State | Meaning |
|---|---|
| `source-backed` | Owner, bounds, failure behavior, and focused source/unit checks exist |
| `browser-backed` | The actual workspace seed executes the stated behavior in fresh Chromium |
| `source-ready` | A contained deterministic owner is ready for browser observation |
| `blocked` | External evidence is still required; this never means missing demo code |

The evidence schemas remain
`knowgrph-xr-v2-pinned-contract-conformance/v1`,
`knowgrph-xr-v2-readiness/v1`,
`knowgrph-xr-v2-dev-runtime-evidence/v1`, and
`knowgrph-xr-v2-browser-smoke/v1`.

## AC-1–AC-12 evidence ledger

| AC | Production-reachable demo path | State | External promotion evidence |
|---|---|---|---|
| AC-1 | Async WebXR probes freeze exactly one of the four pinned tiers before enabling immersive actions | browser-backed | Named handset/headset matrix |
| AC-2 | Explicit camera start feeds bounded local Depth Anything V2 inference and DIBR stereo synthesis | browser-backed | Camera-quality, thermal, and frame-budget run on named phones |
| AC-3 | Media recording stays independent; repeated budget misses atomically persist raw/depth metadata and enqueue post-process | browser-backed | Long-duration quota/interruption run |
| AC-4 | Progressive viewer attempts WebXR, pseudo-parallax, then mandatory flat video without optional imports | browser-backed | Physical four-tier viewer matrix |
| AC-5 | Canonical feature matrix prevents iOS from selecting a WebXR tier without user-agent branching | source-backed | Named iOS Safari prompt/session run |
| AC-6 | Seed-authored ECS entities reach the mounted root-ECS projection, including entity zero | browser-backed | Physical GPU/device matrix |
| AC-7 | Seed-authored material graph compiles and applies to the caller-owned Three.js mesh | browser-backed | Representative texture/shader assets |
| AC-8 | `kgc-behavior-graph/v1` dispatch proves exact-once wired and zero-callback unwired behavior | browser-backed | Author usability study, if required |
| AC-9 | Bounded particle emitter runs with deterministic capacity and lifetime cleanup | browser-backed | Physical GPU stress observation |
| AC-10 | Timeline interpolation and rig commands reach the mounted authoring scene | browser-backed | Representative rig/device playback |
| AC-11 | Already-encoded left/right tracks are muxed, inventoried, and browser-played without transcoding | browser-backed | Additional Safari/headset codec matrix |
| AC-12 | Connected preview uses bounded WebRTC delivery, acknowledgements, desync recovery, and disposal | browser-backed | Two-device measured latency run |

The pinned tiers `webxr-ar`, `webxr-vr`, `pseudo-ar-depth-parallax`, and
`flat-fallback` are a compatibility projection over the canonical entry modes
`immersive-session`, `inline-viewer`, `monocular-capture`, `native-handoff`,
and `unsupported`. The canonical policy remains the sole decision owner.

## User-controlled permissions

Production hosts and same-origin embeds delegate camera, accelerometer,
gyroscope, magnetometer, and `xr-spatial-tracking`; delegation does not activate
them. Camera and sensors have independent visible controls. Neither is requested
on seed load, mount, or capability probe. Stop/disable releases every track and
listener on user action, hidden visibility, `pagehide`, unmount, or seed
deactivation. Frames and sensor samples have no network-egress path.

## Immutable model assets

`canvas/scripts/prepare-xr-v2-depth-assets.mjs` admits model bytes only for
`onnx-community/depth-anything-v2-small` revision
`4472b7362082ad9968fee890ca0f1e5aca36b93d`:

- `onnx/model_q4f16.onnx`, 19,126,267 bytes;
- SHA-256 `eca72971aea64216d767c70c534160de53b5435b588d362bac6dbd5a73f9bf1e`;
- Apache-2.0 license; and
- same-origin `/xr-v2/models/` plus `/xr-v2/wasm/` runtime paths.

The runtime requests `local_files_only`, rejects remote fallback, limits input
dimensions, and permits one in-flight inference. Workbox caches these large
assets at runtime because the normal three-megabyte precache ceiling excludes
them.

## Runtime owner boundaries

- `canvas/src/lib/three/ThreeGraphXrSessionPolicy.ts` owns feature probes and
  canonical entry selection.
- Existing mounted Three.js/R3F owners retain renderer, session, camera, scene,
  mesh, and GPU lifecycles.
- Root `ecs` owns allocation, storage, query, and snapshots.
- `canvas/src/features/xr-v2` owns bounded capture, inference, persistence,
  progressive viewer, mux, invocation, and connected-preview adapters.
- `canvas/src/components/timeline` and `canvas/src/features/gitgraph` retain
  Timeline/edit command ownership.
- The workspace seed is source authority; the runtime does not inject a hidden
  authoring fixture.

The pinned invocation register is live: `/xr.capture`, `/xr.author`,
`#xr-capability-tier`, `#ecs-world`, `#node-graph`, `@xr-capture-contract`,
`@kgc-behavior-graph-contract`, and `@xr-authoring-runtime` resolve through one
validated registry.

Rete.js, three.quarks, Theatre.js, and the custom muxer are retained as pinned
ADR lineage. Existing in-repository equivalents meet the observable AC outcomes
without introducing duplicate renderer, ECS, media, or timeline owners.

## Browser evidence contract

`node canvas/scripts/run_xr_v2_workspace_seed_browser_smoke.mjs` starts fresh
Vite, activates the checked-in `xr-v2` workspace seed, and records capability,
permission non-auto-start, local model routing, capture/fallback persistence,
viewer fallback, mounted authoring, mux playback, connected transport, cleanup,
and empty page/media error arrays. It supersedes reliance on a hidden smoke-only
route while keeping that diagnostic route available for focused regression.

## Reviewer commands

Run from the repository root:

```sh
npm run xr-v2:source-runner:test
node scripts/run-xr-v2-source-smoke.mjs
npm run xr-v2:unit
node scripts/run-video-editor-source-smoke.mjs
node canvas/scripts/run_xr_v2_workspace_seed_browser_smoke.mjs
npm run workspace-seeds:authority
npm run xr-v2:review-candidate
npm run xr-v2:review-ready
```

The positive/tamper contracts verify both successful execution and fail-closed
behavior. The clean exact-commit browser artifact is review evidence, never a
self-issued release credential. No local gate may erase those blockers that
require physical hardware, deployed response observation, protected merge, or
rollback proof.

## Promotion register

| External gate | Required evidence |
|---|---|
| Reference/physical devices | Named iOS, Android, and headset permission/session/performance evidence |
| Track-preserving mux proof | Deterministic Chromium proof exists; add required target-browser codec observations |
| Connected live transport | Loopback proof exists; add a real two-device bounded-latency observation |
| Cloudflare | Observe deployed `Permissions-Policy`, assets, cache, rollback, and health |
| Production | Separately authorized protected integration, release, delivery, and rollback receipts |

The AC-1–AC-12 implementation and exact-candidate browser gate pass; AC-14
remains a source-only candidate. Production certification remains an evidence
decision made from the register above, not a status string written by source
code.
