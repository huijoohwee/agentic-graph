---
title: "Knowgrph XR v2 — Pinned Runtime-Readiness Evidence"
doc_type: "runtime-readiness"
version: "3.2.0"
date: "2026-08-06"
owner: "Knowgrph XR runtime"
status: "review-candidate"
local_rung: "browser-local-runtime-ready"
readiness_scope: "pinned-ac1-ac12-conformance"
pinned_source_revision: "42005d7572380beb421da0cb16055cf56ae4f2c4"
pinned_source_blob: "12aab1a46c230d5e006f78f4a87e3d0db93ed494"
pinned_source_sha256: "38099b9a9838929dfa287e3be8317e7828562288a8303f43b1579728053d7bab"
deploy_boundary: "Dev-only"
---

# Knowgrph XR v2 — Pinned Runtime-Readiness Evidence

## Result

The immutable requirements authority is the exact 101,752-byte document from
commit `42005d7572380beb421da0cb16055cf56ae4f2c4`; the repository gate rejects
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

Saved captures are local-first IndexedDB records. A client-only adapter now
publishes verified raw/frame parts and a deterministic manifest through the
existing Asset Contract Writer path, lists that existing document inventory,
and atomically rehydrates verified bytes on another client. It performs no I/O until an explicit user action. The inherited blob/document boundary does not
enforce workspace authentication or recompute uploaded digests, so Production
cross-device promotion remains blocked without inventing a new server surface.

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
| AC-2 | Explicit Spatial Start consumes the already-authorized canonical camera stream, runs bounded local Depth Anything V2 inference, and renders live left/right DIBR previews; Explorer mount keeps camera off | source-ready; deterministic browser path backed | Camera quality, thermal, and sustained frame-budget run on named phones |
| AC-3 | Consecutive live-budget misses retain raw capture, persist raw/depth references, and atomically enqueue one typed post-process job; owner-fenced leases reclaim expired running work, cancellation requeues, and only one atomic completion can publish immutable inferred artifacts | browser-backed | Long-duration quota, crash, interruption, and resume run on named phones |
| AC-4 | A real persisted capture survives reload and explicit catalog reopen; timestamp-synchronized canvas and Three/WebXR paths require two distinct attached frame/timestamp renders, while raw fallback requires playback time advance—listing, selection, `canplay`, or immersive entry alone is never evidence | browser-observable after temporal saved-asset render | Physical four-tier viewer matrix, hardened shared storage, and two-device reopen |
| AC-5 | Canonical feature matrix prevents iOS from selecting a WebXR tier without user-agent branching | source-backed | Named iOS Safari prompt/session run |
| AC-6 | Seed-authored ECS entities reach the mounted root-ECS projection, including entity zero | browser-backed | Physical GPU/device matrix |
| AC-7 | Seed-authored material graph compiles and applies to the caller-owned Three.js mesh | browser-backed | Representative texture/shader assets |
| AC-8 | The exact four-key `kgc-behavior-graph/v1` interchange contract is persisted/read back, then projected into a separate internal dispatch graph that proves exact-once wired and zero-callback unwired behavior | browser-backed | Author usability study, if required |
| AC-9 | Bounded particle emitter runs with deterministic capacity and lifetime cleanup | browser-backed | Physical GPU stress observation |
| AC-10 | Timeline interpolation and rig commands reach the mounted authoring scene | browser-backed | Representative rig/device playback |
| AC-11 | `Verify packaging` binds the opened raw clip/session/frame bundle, produces encoded tracks before mux, decodes every source sample, verifies codec/count/payload byte preservation, and credits evidence only after the mounted WebM advances | browser-backed after successful explicit action | Target-browser user-capture tracks plus Safari/headset codec matrix |
| AC-12 | `Run local preview` derives one exact mounted-scene edit, transports it across ICE-server-free WebRTC peers, paints the distinct attached viewer canvas in a later browser frame, then acknowledges within the bound without reload | browser-backed after successful explicit action | Physical two-device measured latency run |

The pinned tiers `webxr-ar`, `webxr-vr`, `pseudo-ar-depth-parallax`, and
`flat-fallback` are a compatibility projection over the canonical entry modes
`immersive-session`, `inline-viewer`, `monocular-capture`, `native-handoff`,
and `unsupported`. The canonical policy remains the sole decision owner.

## User-controlled permissions

Production hosts and same-origin embeds delegate camera, accelerometer,
gyroscope, magnetometer, and `xr-spatial-tracking`; delegation does not activate
them. Camera, sensors, and immersive entry have independent visible controls.
None is requested on seed load, mount, or capability probe. Camera Stop remains
available at any time and cancels spatial capture without waiting for its
post-processing path. Stop/disable releases every track, session, and listener
on user action, hidden visibility, `pagehide`, unmount, or seed
deactivation. Capture and authoring frames and sensor samples have no
network-egress path before the separate explicit saved-asset Publish action.

Saved spatial assets use IndexedDB as the offline authority. They are not
silently uploaded on mount, capture, save, catalog load, or playback. The
visible existing-storage preview exposes separate Publish, Refresh shared, and
Reopen actions. Its manifest-last adapter binds source/workspace identity,
returns typed conflict/deferred/cancel/deadline outcomes, verifies actual
SHA-256/size/content type on read, and commits rehydration atomically. Production
promotion still requires workspace authentication and server-side digest
recomputation in the shared storage owner.

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

`kgc-behavior-graph/v1` remains the exact persisted interchange interface with
only `graph_id`, `nodes`, `edges`, and `bound_entity` at its root. The richer
runtime-only action/behavior projection uses
`knowgrph-xr-v2-behavior-dispatch-graph/v1`; it cannot silently widen the pinned
interchange shape.

Rete.js, three.quarks, Theatre.js, and the custom muxer are retained as pinned
ADR lineage. Existing in-repository equivalents meet the observable AC outcomes
without introducing duplicate renderer, ECS, media, or timeline owners.

## Browser evidence contract

`node canvas/scripts/run_xr_v2_workspace_seed_browser_smoke.mjs` starts fresh
Vite without `VITE_KNOWGRPH_RUN_READY_DEMO`, opens the editor with
`?openEditorWorkspace=1`, resolves the exact `Source files` navigation, expands
docs → workspace-seeds, and clicks the checked-in `xr-v2` row. It proves that
selection mounts the shared 3D/XR owner and readiness surface while camera and
sensors remain off behind separate explicit user actions. It proves the
spatial-capture action is gated until an explicit canonical-camera start,
captures through the fake-device browser adapter, stops the camera, reloads the
whole page, reselects the Explorer row, finds the real IndexedDB asset, opens
it, and requires a real viewer render before AC-4 evidence opens. It then binds
AC-11 to that exact opened asset, verifies its raw binding and pre-mux encoded
track inventory, and executes AC-12 against an edit painted by the attached
viewer canvas. Both explicit actions must update their panel and canonical
ledger evidence. The existing-storage panel is also present with zero mount-time
I/O and its inherited promotion blocker visible. Sensors and
immersive entry remain off throughout; the fake camera is automation evidence,
not physical-device certification.

`node canvas/scripts/run_xr_v2_browser_smoke.mjs` retains the comprehensive
deterministic/adaptor observation for capability, local model routing,
capture/fallback persistence, viewer fallback, mounted authoring, fixture mux
playback, attached-viewer WebRTC transport, cleanup, and empty page/media error
arrays. The aggregate browser gate runs both scripts so visible Explorer
evidence cannot replace AC-11/AC-12 adaptor evidence, or vice versa.

## Reviewer commands

Run from the repository root:

```sh
npm run xr-v2:source-runner:test
node scripts/run-xr-v2-source-smoke.mjs
npm run xr-v2:unit
node scripts/run-video-editor-source-smoke.mjs
node canvas/scripts/run_xr_v2_browser_smoke.mjs
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
| Cross-device saved assets | Client adapter and atomic rehydrate tests pass; harden shared workspace authentication/server-side digest verification and capture physical second-device reopen evidence |
| Cloudflare | Observe deployed `Permissions-Policy`, assets, cache, rollback, and health |
| Production | Separately authorized protected integration, release, delivery, and rollback receipts |

The AC-1–AC-12 implementation and exact-candidate browser gate pass; AC-14
remains a source-only candidate. Production certification remains an evidence
decision made from the register above, not a status string written by source
code.
