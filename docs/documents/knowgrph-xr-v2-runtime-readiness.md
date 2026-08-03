---
title: "Knowgrph XR v2 Runtime Readiness"
doc_type: "Runtime Readiness Contract"
version: "2.0.0"
status: "source-ready-dev"
date: "2026-08-03"
local_rung: "source-ready-dev"
delivered_rung: "undocumented"
lane: "authoring"
deploy_boundary: "Dev-only"
runtime_owner: "canvas/src/features/xr-v2"
runtime_proof: "scripts/run-xr-v2-source-smoke.mjs; canvas/scripts/run_xr_v2_browser_smoke.mjs"
---

# Knowgrph XR v2 Runtime Readiness

## Decision

XR v2.0.0 is a set of typed capability, capture, synthesis, and authoring
adapters around the existing XR runtime. It preserves the existing WebXR
session policy, shared Three.js surface, Motion Control camera path, scene
state, Flow Editor, Timeline, recorder/export path, and Viewer.

The runtime readiness schema is `knowgrph-xr-v2-readiness/v1`. A
`source-ready` result proves that the deterministic contracts are present and
bounded. It is not evidence of a loaded depth model, reference-device frame
budget, live browser playback, physical headset, camera permission, captured
asset, Production release, or Cloudflare deployment.

## Preserved entry policy

XR v2 projects the canonical capability snapshot; it does not replace its
closed recommendation order.

| Entry mode | Existing owner retained | XR v2 role |
|---|---|---|
| `immersive-session` | WebXR session policy and shared renderer | Report the selected capability path |
| `inline-viewer` | Shared Three.js/Viewer surface | Expose authoring readiness without requesting a session |
| `monocular-capture` | Spatial Capture and Motion Control | Admit an explicit-user-action capture adapter |
| `native-handoff` | Canonical native handoff policy | Preserve the recommendation result |
| `unsupported` | Canonical capability policy | Preserve a typed unavailable state |

Capability selection remains feature-probed. XR v2 does not infer a device
class from browser identity.

## Implemented adapter contracts

The public surface is `canvas/src/features/xr-v2/index.ts`.

- `resolveXrV2CapabilityProjection` maps the canonical five-mode capability
  snapshot to live-depth-preview, raw-capture, or unavailable capture state.
- `createXrV2CaptureSession` accepts injected frame, depth-estimator,
  synthesis, artifact-sink, and clock ports. Camera permission and acquisition
  remain with the existing user-action owner.
- `createXrV2CaptureSnapshot` and its transition functions enforce increasing
  frame indexes, bounded capture, consecutive frame-budget fallback, raw-frame
  preservation, and a typed post-process job.
- `synthesizeXrV2RgbaStereoPair` is deterministic pixel displacement over
  admitted RGBA and normalized-depth inputs. It is not a model loader or a
  spatial reconstruction claim.
- `projectAuthoringEcsRows` consumes bounded query rows from the canonical
  ECS and produces a data-only scene projection without owning a world.
- `compileMeshStandardMaterialGraph` compiles a closed, typed graph to safe
  material parameters for the existing renderer.
- `createExactOnceBehaviorDispatcher`, the bounded particle emitter, and the
  numeric/bone interpolation functions supply deterministic behavior,
  particle, and Timeline adapters.
- Recorder negotiation chooses only browser-supported native outputs, while
  the revisioned preview channel validates and bounds deltas before an existing
  transport carries them.
- `XrV2AuthoringStatusPanel` projects readiness inside the existing authoring
  surface. Existing scene, sequencing, recording, export, and viewing owners
  remain authoritative.

No new command namespace or duplicate asset registry is introduced.

## Evidence matrix

| Evidence claim | State | Current proof or blocker |
|---|---|---|
| Capability adapter | source-backed | Public typed projection retains the canonical entry-mode union |
| Capture state and fallback adapters | source-backed | Pure transitions and injected ports are exercised by focused tests |
| Authoring status adapter | source-backed | Existing authoring surface mounts the readiness projection |
| Deterministic browser status surface | locally runnable | Browser smoke verifies DOM output without requesting camera or XR access |
| Live depth synthesis | blocked | model-asset admission and reference-device performance proof are absent |
| Browser media playback | blocked | The deterministic status smoke is not a decoded recording/playback test |
| Physical XR/camera behavior | blocked | physical-device evidence is absent |
| Production availability | blocked | This implementation is Dev-only and has no release authority |

The default snapshot reports `source-ready`, with explicit blockers for a
same-origin depth model asset, reference-device frame-budget evidence, browser
playback evidence, and physical-device evidence. A future `runtime-ready`
result requires all four inputs; source inspection must never manufacture it.

## Focused verification

Run the Node contract tests first:

```bash
node --test scripts/__tests__/xr-v2-source-smoke.test.mjs
```

Run the aggregate source/readiness ledger:

```bash
node scripts/run-xr-v2-source-smoke.mjs
```

Run the deterministic Chromium surface only after source validation passes:

```bash
node canvas/scripts/run_xr_v2_browser_smoke.mjs
```

The browser runner starts a fresh local Vite process, requests the dedicated
Dev-only application route, and writes
`data/outputs/xr-v2-browser-smoke.json`. That artifact proves only the rendered
readiness attributes and absence of observed page/console errors. It does not
request WebXR, camera, model inference, or media recording.

## Promotion gates

Promotion beyond this local Dev slice remains blocked until each claim has its
own evidence owner:

1. admit a versioned, same-origin depth model and publish its license, hash,
   input/output, memory, and fallback contract;
2. prove the configured frame budget on named reference hardware while raw
   capture remains lossless across fallback;
3. prove recorded artifacts decode and play in the target browsers;
4. prove permission, lifecycle, teardown, and presentation on named physical
   camera and XR devices; and
5. pass the repository's protected integration and release process.

Until those gates close, public and deployed readiness claims remain blocked.
