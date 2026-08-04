---
title: "Knowgrph XR v2 Runtime Readiness"
doc_type: "Runtime Readiness Contract"
version: "2.1.0"
status: "review-candidate; canonical runtime proof blocked"
date: "2026-08-04"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
deploy_boundary: "Dev-only"
runtime_owner: "canvas/src/features/xr-v2; canvas/src/components/timeline; canvas/src/features/gitgraph"
runtime_proof: "scripts/run-xr-v2-source-smoke.mjs; scripts/run-video-editor-source-smoke.mjs; canvas/scripts/run_xr_v2_browser_smoke.mjs"
---

# Knowgrph XR v2 Runtime Readiness

## Decision

XR v2 is a review candidate for **XR authoring and native edited-media
delivery**. It supplies typed adapters around the canonical XR policy, ECS,
Three.js material boundary, and existing Timeline/video editor. A focused
Chromium check records an edited video through the existing browser-native
exporter, decodes the result, performs bounded playback, and binds the
observation to a clean exact task commit.

The machine-readable readiness scope is
`xr-authoring-edited-media-delivery`.

The runtime schema is `knowgrph-xr-v2-readiness/v1` and remains
`source-ready`. The browser artifact is `knowgrph-xr-v2-browser-smoke/v1`.
`knowgrph-xr-v2-dev-runtime-evidence/v1` validates bounded observations only;
it is not a readiness receipt, and caller-supplied values cannot promote the
snapshot or erase blocked gates.

This task-lane evidence cannot establish canonical runtime readiness. Live depth
synthesis is blocked by model-asset admission and reference-device performance
evidence. Physical XR/camera readiness is blocked by missing physical-device
proof. Production and deployment are blocked by the Dev-only boundary.

## Preserved entry policy

XR v2 projects the canonical feature-probed modes:

| Entry mode | Existing owner retained | XR v2 role |
|---|---|---|
| `immersive-session` | WebXR session policy and shared renderer | Project the selected capability path |
| `inline-viewer` | Shared Three.js/Viewer surface | Expose authoring without requesting a session |
| `monocular-capture` | Spatial Capture and Motion Control | Preserve explicit-user-action camera entry |
| `native-handoff` | Canonical handoff policy | Preserve the recommendation result |
| `unsupported` | Canonical capability policy | Preserve a typed unavailable state |

Capability selection does not infer device class from browser identity.

## Implemented runtime contracts

The public XR v2 surface is `canvas/src/features/xr-v2/index.ts`.

- Capability projection retains the canonical entry-mode union.
- Capture state and injected ports preserve raw input and bounded fallback.
- Canonical-ECS projection accepts entity identifier zero and consumes
  existing-owner query rows without owning another world.
- The closed material graph compiles to bounded parameters and applies them to
  an actual caller-supplied Three.js material in focused proof; normal mounted
  renderer wiring is not claimed, and binding cleanup never disposes the
  caller-owned material.
- Behavior, particle, and interpolation modules remain deterministic adapters;
  they do not claim a separate UI or renderer.
- The canonical Gantt/video-sequence Timeline remains the editor. Its optional
  typed command adapter permits an external XR owner to handle an edit without
  also executing the default Markdown mutation.
- The existing preview and exporter negotiate browser-native recording output.
- The browser smoke attaches the emitted Blob to a video element and observes
  nonzero bytes, supported type, decoded metadata, positive dimensions and
  finite-positive or explicitly browser-unbounded duration semantics, bounded
  playback, cleanup, and no observed page/media errors.
- The editor clean-room ledger rejects external-lineage markers,
  vendor/generated paths, symlink escapes, and runtime/dependency references;
  the exact approved citation is documentation-only.

No new command namespace, asset registry, camera lifecycle, transport, editor
state store, or hosted service is introduced.

## Evidence matrix

| Evidence claim | State | Current proof or blocker |
|---|---|---|
| Capability adapter | source-backed | Public projection retains the closed canonical modes |
| Capture fallback adapters | source-backed | Pure transitions and injected ports have focused tests |
| Canonical ECS projection | focused-test-backed | Entity-zero projection and ECS integration tests pass |
| Material application | focused-test/browser observation | A standalone real material receives compiled values; mounted-renderer wiring is unproven |
| Timeline command ownership | focused-test/browser observation | Default, handled, rejected, and mounted-panel paths are exercised |
| Edited-media browser delivery | review-candidate observation | Fresh Chromium records, decodes, and plays a non-empty artifact from a clean exact task commit |
| Canonical-main runtime | blocked | Protected integration and canonical runtime proof are absent |
| Live depth synthesis | blocked | Same-origin model-asset and reference-device frame-budget proof are absent |
| Physical XR/camera behavior | blocked | Named physical-device evidence is absent |
| Production availability | blocked | No release or deployment authority is granted |

## Browser evidence contract

`node canvas/scripts/run_xr_v2_browser_smoke.mjs` starts a fresh local Vite
process with existing-server reuse forbidden. The dedicated test route:

1. imports the public XR v2 index and the existing Timeline export owner;
2. exercises the focused authoring adapters and real mounted Timeline control;
3. exports a short edit from the committed same-origin media fixture;
4. creates and later revokes a local object URL;
5. waits for decoded metadata/readiness and bounded playback; and
6. writes `data/outputs/xr-v2-browser-smoke.json`.

The verifier joins:

- exact branch, task revision, commit-tree identity, deterministic
  worktree-state digest/dirty count, and the locally observed `origin/main`
  remote-tracking revision (not a fetch-freshness receipt);
- runtime and browser-evidence schemas;
- canonical entry mode;
- authoring adapter state;
- output byte size and MIME type;
- decoded width, height, and duration;
- playback observation;
- retained live-depth/physical-device blockers; and
- observed page, console, and media errors.

The output is clean-commit review evidence, not a canonical runtime, committed
asset, or release artifact.

## Clean-room boundary

The canonical policy is in the PRD/TAD/ADR. Product source, manifests,
lockfiles, configuration, tests, assets, and generated output must contain no
external editor import, package, vendored implementation, remote request, or
adapted artifact. The source guard runs without network access and fails closed
on identifiable direct and transitive dependency evidence. Its exact citation
and source scans are mechanical enforcement, not a substitute for independent
specification and code review. A permissive upstream license does not weaken
the no-copy rule.

## Focused verification

Run from the repository root:

```sh
node --test scripts/__tests__/xr-v2-source-smoke.test.mjs
node scripts/run-xr-v2-source-smoke.mjs
node --test scripts/__tests__/video-editor-source-smoke.test.mjs
node scripts/run-video-editor-source-smoke.mjs
node canvas/scripts/run_xr_v2_browser_smoke.mjs
npm run xr-v2:review-candidate
npm run xr-v2:review-ready
npm run xr:review-ready
```

`npm run xr-v2:review-candidate` joins the repository TypeScript check with
focused unit, source, clean-room, and fresh browser observation. It requires a
clean exact task commit and never promotes the runtime snapshot.
`npm run xr-v2:review-ready` adds the runner ledgers and is the affected-CI
command for the owned source/doc paths. The established
`npm run xr:review-ready` retains camera-fallback compatibility and aggregates
XR v2. None of these commands deploys.

## Affected-CI contract

`docs/collaboration-runtime-contract.md` owns a dedicated XR v2/video-editor
scope. Any change to the XR v2 adapters, canonical Timeline integration,
browser smoke, source guards, or either readiness document selects:

```sh
npm run xr-v2:review-ready
```

Documentation therefore no longer has an empty proof path for this feature.

## Promotion gates

Promotion beyond this review candidate remains blocked until each claim has an
independent evidence owner:

1. admit a versioned, same-origin depth model with license, hash, input/output,
   memory, and fallback metadata;
2. prove the frame budget on named reference hardware while raw capture remains
   lossless across fallback;
3. prove camera permission, interruption, lifecycle, and teardown on named
   physical mobile devices;
4. prove immersive entry, tracking, placement, and exit on named headsets; and
5. pass protected integration and produce canonical-main runtime proof; and
6. pass separately authorized release workflows.

Until those gates close, canonical-runtime, live-depth, physical-device,
public, and deployed readiness claims remain blocked.
