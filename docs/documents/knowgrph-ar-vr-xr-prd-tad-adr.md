---
title: "Knowgrph AR/VR/XR — Pinned Runtime-Readiness Contract"
doc_type: "PRD/TAD/ADR"
version: "2.2.0"
date: "2026-08-05"
lang: "en-US"
frontmatter_contract: "required"
owner: "Knowgrph XR runtime and existing canvas owners"
status: "review-candidate"
local_rung: "source-ready"
readiness_scope: "pinned-ac1-ac12-conformance"
pinned_spec_version: "2.0.0"
pinned_source_revision: "5679d4101f5470fb85816b6df4f2ec0af6ca4eb7"
deployment: "not authorized"
deploy_boundary: "Dev-only"
runtime_owner: "canvas/src/lib/three/ThreeGraphXrSessionPolicy.ts; canvas/src/features/xr-v2; root ecs; canvas/src/components/timeline; canvas/src/features/gitgraph"
runtime_proof: "scripts/run-xr-v2-source-smoke.mjs; canvas/scripts/run_xr_v2_browser_smoke.mjs"
---

# Knowgrph AR/VR/XR — Pinned Runtime-Readiness Contract

## Source authority and decision

The requirements authority for this increment is the historical v2.0.0 document
at commit
[`5679d4101f5470fb85816b6df4f2ec0af6ca4eb7`](https://github.com/huijoohwee/knowgrph/blob/5679d4101f5470fb85816b6df4f2ec0af6ca4eb7/docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md).
This maintained document is its runtime-readiness overlay. It preserves and
traces pinned AC-1 through AC-12 without restoring the stale 1,056-line copy or
creating a second renderer, ECS, camera lifecycle, editor, transport, media
registry, or command/schema owner.

The exact readiness boundary is deliberately narrower than the requirements
authority:

- deterministic adapters, focused tests, source ledgers, and the admitted
  local-browser observations are review-candidate evidence;
- the existing `xr-authoring-edited-media-delivery` snapshot is one contained
  evidence slice, not a replacement authority for pinned AC-1–AC-12;
- full pinned runtime readiness remains **blocked** on admitted model bytes,
  named reference/physical devices, a physical progressive-viewer matrix, and
  canonical cross-document connected-viewer proof; and
- all evidence is Dev-only. It grants no integration, release, deployment, or
  Production authority.

## Canonical ownership

| Concern | Canonical owner retained | XR v2 responsibility |
|---|---|---|
| Feature probes and entry decision | `canvas/src/lib/three/ThreeGraphXrSessionPolicy.ts` | Project the result and provide pinned compatibility evidence |
| Session binding and rendering | Existing mounted Three.js/R3F surface | No renderer, scene, or camera creation |
| Camera permission and capture | Existing Spatial Capture and Motion Control owners | Pure capture state plus injected processing ports |
| Scene data and query | Root `ecs` package | Read-only projection, including entity identifier zero |
| Materials | Existing Three.js material owner | Validate and apply a closed graph to caller-owned material |
| Timeline, preview, collaboration, and export | Existing Timeline/Gantt owners plus the canonical P2P collaboration extension | Deterministic animation, single-viewer connected-preview adapter, and typed command seam |
| XR adapter surface | `canvas/src/features/xr-v2` | Pinned conformance ledger and bounded adapters |
| Evidence | XR source runner and dedicated Chromium smoke | Reproducible source/browser observations, never self-promotion |

The canonical entry-mode union remains `immersive-session`, `inline-viewer`,
`monocular-capture`, `native-handoff`, and `unsupported`. A compatibility
projection may express the pinned four-tier requirement, but does not replace
that owner or infer device class from `navigator.userAgent`.

## Product requirements and acceptance trace

The following table is the normative trace for all acceptance criteria in the
pinned authority. “Backed” means that the checked-in deterministic or browser
slice is executable; it does not erase the named blocker.

| Pinned criterion | Requirement preserved | Executable owner/evidence | Readiness boundary |
|---|---|---|---|
| **AC-1 — Capability detection** | Report exactly one of the pinned four tiers before capture/session action | Canonical feature policy plus pinned conformance projection and matrix tests | Deterministic/source-backed; physical device matrix blocked |
| **AC-2 — Live capture default** | At sufficient budget, synthesize stereo for at least 90% of frames with no duplicate writes and expose live preview | Capture session, deterministic stereo synthesizer, pinned conformance probe | Synthetic/admitted-input proof only; model bytes, real camera, and named-device frame budget blocked |
| **AC-3 — Automatic post-process fallback** | After N consecutive budget breaches, preserve raw capture and produce a typed post-process job without failing capture | Capture-session state machine and injected artifact/job ports | Deterministic/focused-test-backed; durable connected executor proof remains outside this adapter |
| **AC-4 — Progressive-enhancement viewing** | Select the highest supported tier and retain a flat fallback | Canonical five-mode policy, compatibility projection, existing viewer route, browser probe | Selection/browser-route-backed; four-tier physical rendering matrix blocked |
| **AC-5 — iOS engine reality** | iOS-class matrices must not project either pinned immersive tier | Feature-probe compatibility matrix; no user-agent branch | Deterministic/source-backed; named iOS browser/device pass blocked |
| **AC-6 — ECS scene composition** | Component queries return the correct unique entities and applied components render | Root ECS runtime owner plus mounted R3F scene and immutable Chromium evidence | Browser-backed for the committed two-entity fixture; broader authored-scene/device matrix blocked |
| **AC-7 — Node-based material authoring** | A closed graph compiles and applies its evaluated output to a target mesh/material | Closed compiler, atomic target-mesh binding, real texture map UUID, renderer compile, and WebGL render evidence | Browser-backed for `MeshStandardMaterial`; broader node/shader catalog remains out of scope |
| **AC-8 — Visual behavior graph** | A wired trigger invokes its action exactly once; an unwired trigger invokes none | Real canvas pointer dispatch through the exact-once behavior owner, with one action/effect delta | Deterministic and mounted-browser-backed; visual editing UI publication is not claimed |
| **AC-9 — Particle authoring** | Particle count never exceeds configured rate/lifetime/ceiling bounds | Bounded emitter mounted as real GPU `Points`, with buffer-version, draw-range, live/high-water, and disposal evidence | Mounted-browser-backed at the admitted capacity; named GPU/thermal matrix blocked |
| **AC-10 — Animation timeline** | Sampled bone/property interpolation matches keyframes within tolerance | Canonical playhead drives a real mounted `Bone`; sampled and observed poses are compared in immutable evidence | Mounted-browser-backed for the fixture; rig/import compatibility matrix blocked |
| **AC-11 — In-browser packaging** | Preserve input track count and codec in one browser-playable container | Bounded CFR WebM mux, strict EBML inventory, VP8/VP9 byte equality, per-track `VideoDecoder`, and HTML media seek/playback | Browser-backed for admitted VP8/VP9 tracks; wider codec/profile matrix blocked |
| **AC-12 — Live edit-to-device preview** | Propagate an edit to a connected viewer within N ms with no build or reload | Production single-viewer adapter over a real local `RTCDataChannel`, bounded ACK/retry/deadline, revision, and no-navigation evidence | Browser loopback-backed; canonical two-page/device session and viewer UI/store proof blocked |

### Pinned tier compatibility

The pinned vocabulary is retained verbatim for traceability:

- `webxr-ar`
- `webxr-vr`
- `pseudo-ar-depth-parallax`
- `flat-fallback`

Those values describe the v2.0.0 acceptance projection. They do not add an
asset field or reopen a second capability policy. The maintained runtime first
uses feature probes to obtain one canonical entry mode, then a bounded
compatibility adapter may map that result plus admitted platform facts to
exactly one pinned tier for conformance evidence. Platform facts are injected
test inputs or a separate trusted owner’s output, never browser-identity
classification in the XR adapter.

### Runtime-ready user journeys

1. A viewer opens an existing XR surface and receives one canonical entry
   recommendation before choosing a permission-bearing action.
2. A capture owner supplies raw frames to the bounded XR adapter. The adapter
   writes each raw frame once, attempts admitted live processing, and switches
   to raw/post-process mode when the configured consecutive-breach limit is
   reached.
3. An author uses the existing ECS, material, Timeline, preview, and export
   owners. XR v2 validates and projects data but does not seize lifecycle
   ownership.
4. A reviewer runs source/unit checks and a clean exact-commit Chromium smoke.
   The browser evidence remains an observation until a separate authority
   admits it.

## Technical architecture

```mermaid
flowchart LR
  F["Canonical feature policy"] --> P["Pinned compatibility projection"]
  C["Existing camera/capture owner"] --> A["Bounded capture adapter"]
  E["Root ECS"] --> X["XR v2 adapters"]
  M["Existing Three.js material"] --> X
  T["Existing Timeline/editor"] --> X
  X --> B["Dedicated browser evidence route"]
  A --> J["Injected artifact/job ports"]
  X --> L["Pinned AC-1–AC-12 conformance ledger"]
```

### Invariants

- One feature policy, renderer, camera lifecycle, ECS, editor, and export owner.
- Raw capture is admitted before optional processing and never written twice.
- Entity identifier zero is valid; negative, duplicate, unsafe, and unbounded
  ECS input fails closed.
- Graphs, particles, timelines, deltas, and evidence envelopes are bounded.
- Callback failure cannot replay an accepted behavior revision.
- Caller-owned Three.js resources are never disposed by an adapter binding.
- Browser observations cannot promote their own readiness state.
- No adapter performs user-agent classification, camera acquisition, session
  entry, deployment, or direct network-stack ownership; connected preview is
  published only through the canonical collaboration extension port.

### Evidence schemas

| Schema | Role |
|---|---|
| `knowgrph-xr-v2-pinned-contract-conformance/v1` | AC-1–AC-12 result ledger tied to the pinned revision |
| `knowgrph-xr-v2-readiness/v1` | Existing source snapshot for the contained edited-media slice |
| `knowgrph-xr-v2-dev-runtime-evidence/v1` | Validated bounded browser observation payload |
| `knowgrph-xr-v2-browser-smoke/v1` | Clean exact-commit Chromium evidence artifact |
| `knowgrph-xr-v2-mounted-authoring-evidence/v1` | Immutable mounted ECS/material/behavior/particle/Bone/renderer evidence |
| `knowgrph-xr-v2-encoded-track-browser-observation/v1` | Dual-track packaging, exact payload, decode, seek, playback, and cleanup evidence |
| `knowgrph-xr-v2-connected-preview-browser-observation/v1` | Bounded one-viewer WebRTC loopback observation |

## Historical contract and ADR reconciliation

The pinned document included illustrative invocation rows `/xr.capture` and
`/xr.author`, an illustrative `kgc-behavior-graph/v1` contract, and proposed
dependency/implementation ADRs involving Depth Anything V2, Rete.js,
three.quarks, Theatre.js, and a custom muxer. They remain requirements lineage,
not restored command routes, persisted schemas, packages, or duplicate runtime
owners. A proposal becomes executable only after it is canonicalized at an
existing owner with its own license, asset, security, lifecycle, and evidence
review.

The current decisions are:

1. retain the shared Three.js/R3F renderer and feature-probed session policy;
2. treat a depth model as an admitted, hashed, same-origin asset rather than an
   assumed dependency;
3. retain the root ECS and existing node/editor surfaces;
4. implement deterministic adapters in-repository without silently adopting
   the historical candidate packages;
5. retain the existing Timeline and edited-media exporter, while admitting a
   separate bounded already-encoded VP8/VP9 WebM packaging adapter; and
6. bind connected preview to the canonical collaboration extension, require
   exactly one viewer, retry bounded transient pressure, and latch revision
   desynchronization closed until transport recreation.

[OpenCut](https://github.com/opencut-app/opencut) is an attribution-only product-workflow reference.

That citation is documentation-only. It is not a dependency, compatibility
target, source artifact, service, package, runtime request, or readiness proof.
The editor implementation remains independently specified and checked in.

## Readiness states

| Slice | State | Promotion condition |
|---|---|---|
| Pinned lineage and all AC rows | source-backed | Source guard passes against exact pinned SHA and all AC IDs |
| Pure capability/capture/authoring probes | focused-test-backed | Unit and conformance suites pass |
| Existing edited-media output/decode/playback | browser-backed | Clean exact-commit Chromium evidence passes |
| Live monocular depth and frame budget | blocked | Admit model bytes, metadata, and named reference-device results |
| Physical camera/headset behavior | blocked | Admit permission/session/lifecycle proof from named devices |
| Mounted AC-6–AC-10 fixture | browser-backed | Clean Chromium click/scrub/render/disposal observation passes |
| AC-11 VP8/VP9 track preservation | browser-backed | Strict mux inventory plus two `VideoDecoder` streams and HTML seek/playback pass |
| AC-12 single-document WebRTC loopback | browser-backed | One-viewer ACK/revision/latency/no-navigation observation passes |
| AC-12 canonical connected viewer | blocked | Prove two-page/device viewer UI/store application and stable canvas identity |
| Full pinned AC-1–AC-12 runtime readiness | blocked | Every row above has admitted runtime evidence |
| Production/deployment | blocked | Separate release authority and delivery gates pass |

## Verification contract

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

`npm run xr-v2:review-candidate` joins TypeScript, unit, source, clean-room, and
fresh local-browser evidence. `npm run xr-v2:review-ready` adds the runner
contract suites and is the affected-scope reviewer command. The wider
`npm run xr:review-ready` retains existing camera-fallback compatibility.
These commands are Dev-only, make no physical-device inference, and do not
deploy.

## Promotion blockers

Full runtime readiness for the pinned authority requires all of the following:

1. admit immutable model bytes with license, digest, same-origin location,
   input/output contract, memory budget, and fallback metadata;
2. record live-preview quality and the AC-2 90% threshold on named reference
   devices while preserving raw-frame correctness;
3. record camera permission, interruption, lifecycle, and teardown on named
   mobile devices, plus session entry/tracking/exit on named headsets;
4. extend AC-11 beyond the admitted CFR VP8/VP9 fixture when additional codec,
   profile, variable-duration, or streaming requirements are accepted;
5. execute AC-12 across canonical author/viewer documents or devices and prove
   applied viewer UI/store state, stable canvas identity, bounded latency, no
   build, and no page reload; and
6. obtain separately authorized integration, release, Cloudflare deployment,
   and post-deploy proof. Same-origin XR permission headers are checked in, but
   this review candidate does not mutate Cloudflare or Production.

Until then, the honest result is: pinned AC-1–AC-12 are fully traced;
deterministic/source and the mounted authoring, VP8/VP9 mux, and one-document
WebRTC browser slices may be ready; the full runtime, physical-device,
canonical cross-document transport, and Production claims remain blocked.
