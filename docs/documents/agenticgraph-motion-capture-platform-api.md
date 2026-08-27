---
title: "AgenticGraph Motion Capture Platform API"
doc_type: "Runtime and Invocation Contract"
status: "runtime-ready"
lang: "en-US"
frontmatter_contract: "required"
runtime_scope: "XR Mode, Motion Control, Skills & Commands, and Media"
deploy_boundary: "Dev-only"
---

# AgenticGraph Motion Capture Platform API

## Product boundary

AgenticGraph provides a browser-local, provider-neutral motion-capture session behind **FloatingPanel → Motion Control**. The same canonical session is projected into **Skills & Commands** and **Media** while **Surface Mode → XR Mode** owns the Canvas. A built-in browser camera is the lowest-cost source, but the platform contract also admits derived landmarks from video, depth, landmark-stream, and explicitly shared peer sources without binding the session to a camera vendor, operating system, inference package, or hosted coordinator.

The platform is evidence graded. A built-in monocular pose is useful for `single-view-control`; it is never labeled research-ready. `time-aligned-multi-source` requires at least two aligned and synchronized sources. `calibrated-metric-reconstruction` and `researchReady=true` additionally require one validated `agenticgraph.motion-capture-research-evidence/v1` manifest. The manifest binds explicit SI right/up/forward coordinates, a rigid sensor-to-world transform per source, pinhole intrinsics and reprojection evidence for video, measured source-local clock evidence where applicable, calibration sample/pose coverage, measurement error, a known-distance scale check, and triangulated-sample coverage into one content-derived SHA-256 reconstruction identity. Live grading then requires at least 30 qualified sequenced samples per source spanning at least 1,000 ms, bounded uncertainty/skew/jitter/failure rate, observation confidence of at least `0.5`, and visibility plus presence of at least `0.5` on at least half of each observation's landmarks. These defaults may be tightened per session but never relaxed. Caller-supplied digests or scalar status fields alone never qualify; a failed condition produces a warning instead of a stronger claim.

## Canonical runtime owners

| Concern | Owner | Contract |
|---|---|---|
| Provider contract | `motionCaptureProviderRuntime.ts` and `motionCapturePlatformContract.ts` | The versioned `window.__agenticgraphMotionCaptureProvider` capability boundary connects browser-local, host-bridge, or network-peer adapters. Each handle can mutate only its owned opaque sources. Finite source, observation, quality, recording, and export schemas remain provider independent. |
| Research evidence | `motionCaptureResearchEvidence.ts` | Strictly validates and canonicalizes the metric frame, transforms, projection, clock, calibration-coverage, scale, and triangulation manifest; derives all binding digests with WebCrypto; and atomically constructs source/reconstruction state. |
| Session and evidence | `motionCaptureSessionRuntime.ts` | One browser singleton strictly registers sources, ingests derived observations with capture-time timestamps, calculates quality/evidence, bounds recording memory, publishes immutable snapshots, and emits a bounded revision when the latest source crosses its staleness deadline. |
| Deterministic export | `motionCaptureExport.ts` | Canonical JSON and tidy CSV from the same stopped recording; stable ordering and SHA-256 metadata; no frame or tensor export. |
| Built-in pose bridge | `motionControlCapturePlatformBridge.ts` | Registers the existing LiteRT pose runtime as a model-relative source and forwards accepted or missing derived samples using the timestamp taken before inference. |
| Decentralized transport | `p2pCollaborationExtensionRuntime.ts` and `motionCapturePeerRuntime.ts` | Explicit opt-in, bounded namespaced messages over the existing WebRTC data channels. Only derived pose observations are shared; invalid or unregistered messages fail closed. |
| Invocation and WebMCP | `motionControlMcpRuntime.ts`, `motionControlAgentReadyContract.mjs`, and `motionControlWebMcpTools.ts` | The existing inspect/control tool pair and `/motion.control @canvas #pose` grammar remain the sole agent mutation path. |
| Surface projections | `MotionCapturePlatformProjection.tsx` | Motion Control owns full controls; Skills & Commands and Media render compact projections over the same runtime rather than parallel stores. |

Adapters call `window.__agenticgraphMotionCaptureProvider.connect({ providerId, label, transport })`, retain the returned capability handle, register one or more sources, and ingest only observations belonging to those sources. `removeSource` and `disconnect` cannot mutate another adapter's sources. The global API exposes read-only session inspection and the strict research-manifest admission operation; the visible Motion Control panel also accepts a browser-local JSON manifest capped at 256 KiB. Manifest changes are rejected during recording and fenced across asynchronous hashing. Direct `setSourceClockAlignment`, `setSourceCalibration`, and `setSharedReconstructionEvidence` remain control/diagnostic inputs but deliberately clear the manifest binding, so they cannot manufacture research readiness. Changing or removing any source invalidates active research evidence. Every input and nested evidence/landmark record rejects unknown keys, non-number numeric lookalikes, sparse arrays, non-rigid transforms, out-of-bounds errors, and incomplete video projection evidence. No method accepts a device serial, stable peer identity, executable, model URL, source URL, endpoint, invitation token, or storage path.

## Invocation contract

The canonical tokens are `/motion.control`, `@canvas`, and `#pose`. Structured WebMCP input and native text invocations converge on the same strict parser.

| Operation | Native invocation | Result |
|---|---|---|
| Open | `/motion.control @canvas #pose operation=open` | Activate XR and open Motion Control without camera permission. Optional `boundingBox=true|false` changes only the existing page-session projection preference. |
| Start | `/motion.control @canvas #pose operation=start backend=auto` | Request the local camera and start the existing LiteRT pose source after XR activation succeeds. Backend is exactly `auto`, `webgpu`, or `wasm`. |
| Stop | `/motion.control @canvas #pose operation=stop` | Release camera/inference, peer sharing, and every registered transient source. An active bounded recording is finished and retained for explicit Export or Clear. A built-in camera restart releases only its own source so independently registered providers can coexist. |
| Record | `/motion.control @canvas #pose operation=record` | Begin an explicit bounded local recording of derived observations. |
| Finish | `/motion.control @canvas #pose operation=finish` | Stop appending while retaining the bounded recording for inspection/export. |
| Clear | `/motion.control @canvas #pose operation=clear` | Release the local recording and prepared export state. |
| Export | `/motion.control @canvas #pose operation=export format=json` | Build deterministic `json` or `csv`; WebMCP returns metadata only, while the Media projection performs the operator-initiated local download. |
| Share | `/motion.control @canvas #pose operation=share enabled=true` | Explicitly enable or disable derived-observation sharing over the current peer session. It never creates a peer invitation or endpoint. |

Unknown keys, duplicate pairs, wrong casing, conflicting structured/text input, a format outside `json|csv`, an `enabled` value outside `true|false`, or a field on the wrong operation fails closed. `backend` is valid only for Start, `boundingBox` only for Open, `format` only for Export, and `enabled` only for Share.

Browser WebMCP continues to expose exactly:

- `agenticgraph.inspect_local_motion_control`
- `agenticgraph.control_local_motion_control`

Inspection includes opaque source/session IDs, source capabilities, dimensions/FPS declarations, calibration status and error, research-window duration and manifest-binding status, connected provider descriptors, aggregate aligned/synchronized source counts, skew, jitter, drops, missing samples, evidence warnings, recording counts, export readiness, and peer-sharing state. It excludes camera frames, tensors, landmark arrays, box coordinates, device serials, stable peer identities, invitations, network endpoints, reconstruction evidence content, recording bytes, and export content. Export control returns only format, MIME type, suggested file name, digest, byte length, aggregate counts, manifest count, and the number of synchronized research-ready observation groups.

## Recording, export, and privacy

Recording is opt-in, memory-bounded, browser-local, and composed only of derived landmarks plus quality/evidence metadata. Recording cannot start without a source. Additional samples are rejected when the declared budget is reached and `droppedByBudget` makes that loss visible and blocks a research-ready export. In-window rejected order evidence is retained per source even though the invalid observation is not admitted. Export re-hashes every retained canonical manifest, requires each qualifying sample cohort to reference a present digest, and independently recomputes usable, research-usable, research-duration, low-evidence, missing, sequence-loss, order, and jitter evidence. It earns `researchReady=true` only from the deterministic maximum set of disjoint synchronized observation pairs inside one stable reconstruction/source/evidence/manifest epoch with at least two locally qualified sources. Pre-recording session quality, optional unqualified sources, caller-supplied SHA fields, and groups accumulated across changed cohorts cannot distort the artifact grade. JSON includes the canonical manifest and digest-bound samples; tidy CSV includes manifest count/digest metadata. Both are deterministic local projections and are not written to graph, workspace, D1, Cloudflare, or another host.

Peer sharing is independently opt-in per collaboration session. A session reset disables it and requires fresh explicit consent. The transport reuses the active collaboration session and WebRTC data channels; it neither opens a signaling endpoint nor silently publishes a document. Payload size, namespace, landmark count, numeric finiteness, and message shape are bounded before send and after receipt. Extension observations are limited to 30 publications per second per namespace and dropped with an explicit `throttled` or `backpressure` status before the ordered collaboration channel would exceed a 256 KiB buffered ceiling. The inbound connection/namespace clock survives source-revocation and source-token churn, while the outbound namespace clock survives extension registration churn; both reset only with their owning connection/session. Source-revocation controls receive one immediate priority send without creating a retry queue; host disable also revokes every connection-scoped relay from the other guests before deleting its mapping. Connected-peer counts reconcile when topology opens or closes. Hosts replace each direct guest source token with a connection-scoped opaque relay token, preventing one guest from colliding with the host or another guest. A received peer becomes a session-local `peer-derived` source. Without canonical session-clock or measured source-local alignment, measured metric calibration, monotonic sequence evidence, and shared reconstruction evidence it remains below research-ready regardless of how many peer samples arrive.

## Reference-only inspiration boundary

[FreeMoCap](https://github.com/freemocap/freemocap), its [multi-camera calibration documentation](https://docs.freemocap.org/documentation/multi-camera-calibration.html), [triangulation documentation](https://docs.freemocap.org/documentation/triangulation.html), and [camera-system architecture documentation](https://docs.freemocap.org/skellycam/docs/technical/architecture/) were consulted only for neutral product principles: accessible capture, separable source/capture/processing concerns, multi-camera time alignment, explicit calibration, reconstruction-quality evidence, and open data portability.

FreeMoCap is not a package, service, subprocess, model source, schema source, or runtime/build dependency. AgenticGraph does not copy or adapt its code, algorithms' expression, prose, schemas, file layout, configuration, tests, fixtures, UI, assets, or examples. Repository-wide relevant text and dependency manifests are scanned for forbidden project/owner markers with a narrow attribution/enforcement allowlist. That automated check is a guardrail, not proof of authorship; documentation attribution is the only permitted reference.

## Proof boundary

Focused source tests prove strict source/provider ownership, manifest validation and content-derived binding, rejection of numeric lookalikes and legacy digest-only research claims, one-second live and export thresholds, quality-tier downgrades, bounded memory/imports, deterministic manifest-bearing exports, no-copy/no-dependency enforcement, strict invocation convergence, WebMCP redaction, peer-message rejection, lifecycle teardown, offline grammar-status honesty, and shared UI ownership across Motion Control, Skills & Commands, and Media. Browser proof must separately verify permission prompts, capture timestamps, manifest file admission, Start/Stop cleanup, recording/download controls, two-peer opt-in sharing, XR view switching, and the absence of frame/network persistence.

Source and simulated runtime proof do not establish camera quality, calibrated metric reconstruction, effective WebGPU delegation, multi-device synchronization, Prod, or Cloudflare deployment. Those claims require measured evidence from the specific hardware/session and a separately authorized release.
