---
title: "Knowgrph Browser-Native AR/VR/XR Capability Slice"
id: "md:knowgrph-ar-vr-xr-prd-tad-adr"
doc_type: "PRD/TAD/ADR"
version: "0.1.0"
date: "2026-08-02"
status: "spec-complete"
lang: "en-US"
frontmatter_contract: "required"
owner: "XR Surface Architecture"
governing_lenses:
  - "min-viable-max-value"
  - "TCO-zero"
  - "browser-native"
  - "progressive-enhancement"
---

# Knowgrph Browser-Native AR/VR/XR Capability Slice

## 1. Authority

This document owns the first implementation slice for browser-native immersive
capture and viewing in Knowgrph: capability detection, monocular camera
fallback, and deterministic viewer handoff.

It does not own full scene rendering, Gaussian splat editing, native mobile
SDKs, multi-user XR, or production deployment. Those remain downstream
consumers of the capability and handoff contract defined here.

## 2. Problem statement

Users capturing real-world footage such as event flyovers, launches,
performances, or everyday spatial documentation via a phone camera cannot
currently connect that footage into Knowgrph's canvas or graph as an immersive,
device-independent asset. Existing immersive-capture pipelines require
dedicated calibrated stereo hardware or platform-locked native AR SDKs, which
conflicts with the browser-native, zero-TCO, min-viable-max-value orientation
of the product.

Meanwhile, the repo has no unified capability layer that can determine what a
given browser or device can actually do and then degrade gracefully across
immersive session support, inline-only viewing, monocular capture, or explicit
native handoff.

## 3. Hypothesis and outcome

If Knowgrph resolves XR capabilities before entry and chooses one exact
browser-native path per device, then any supported phone can become a usable
spatial-capture source and any supported browser or headset can become a usable
viewer without paid infrastructure.

The first successful outcome is not perfect spatial reconstruction. It is a
deterministic browser contract that:

- detects viewer and capture capabilities before XR entry,
- records a usable monocular capture package when immersive sessions are not
  available,
- opens the best available viewer path without hidden fallback behavior,
- preserves one explicit handoff trail into the canvas and graph.

## 4. First shippable slice

The first slice is intentionally narrow:

1. Detect capabilities at runtime and emit one immutable capability snapshot.
2. Prefer inline browser viewing before immersive session entry.
3. Allow monocular phone capture plus bounded motion metadata when immersive
   viewing is unavailable.
4. Use an explicit native handoff record only when the browser cannot provide a
   sufficient viewer or capture surface.

This slice forbids paid capture vendors, dedicated stereo rigs, hidden
platform-specific remaps, and any second persistence owner outside existing
Knowgrph document and asset authority.

## 5. Capability matrix

| Tier | Device/browser reality | Required capabilities | Entry mode | Capture mode | Handoff rule |
|---|---|---|---|---|---|
| `tier-a-immersive-viewer` | Browser supports inline rendering and immersive XR session entry | `inline_viewer`, `immersive_viewer` | `immersive-session` only after inline preview | optional | Fall back to `inline-viewer`; never fail open |
| `tier-b-inline-viewer` | Browser can render inline XR stage but cannot enter immersive session | `inline_viewer` | `inline-viewer` | optional | No native handoff unless operator requests it |
| `tier-c-monocular-capture` | Phone camera is available but immersive session support is absent or blocked | `inline_viewer`, `monocular_capture` | `inline-viewer` | `monocular-capture` | Create a capture package and keep viewer inline |
| `tier-d-native-handoff` | Browser cannot provide a stable local viewer or capture path | `native_handoff` | `native-handoff` | none | Emit explicit handoff target and reason codes |
| `tier-e-unsupported` | Browser lacks a usable viewer and capture surface | none | `unsupported` | none | Fail closed with exact missing capabilities |

## 6. Runtime contract

### 6.1 `XrCapabilitySnapshot`

| Field | Type | Rule |
|---|---|---|
| `schema` | literal | exactly `knowgrph-xr-capability-snapshot/v1` |
| `inline_viewer` | boolean | true only when the browser can mount the inline XR stage |
| `immersive_viewer` | boolean | true only when immersive session support is detected and user activation can request entry |
| `monocular_capture` | boolean | true only when camera capture can start in-browser |
| `capture_motion` | boolean | true only when bounded orientation or motion metadata can be sampled |
| `native_handoff` | boolean | true only when the browser can package an explicit external handoff |
| `recommended_entry_mode` | enum | one of `immersive-session`, `inline-viewer`, `monocular-capture`, `native-handoff`, `unsupported` |
| `reason_codes` | string[] | exact explanation for every denied or downgraded capability |

### 6.2 `XrCaptureDraft`

| Field | Type | Rule |
|---|---|---|
| `schema` | literal | exactly `knowgrph-xr-capture-draft/v1` |
| `source_document_id` | string | references one existing Knowgrph source owner |
| `media_kind` | enum | one of `video`, `photo-sequence`, `camera-stream` |
| `capture_mode` | enum | first slice admits only `monocular-camera` |
| `pose_sample_mode` | enum | one of `none`, `orientation-only`, `bounded-motion` |
| `viewer_intent` | enum | one of `inline-viewer`, `immersive-session`, `native-handoff` |
| `provenance` | object | records browser-local source and capture timestamp |

### 6.3 `XrViewerHandoff`

| Field | Type | Rule |
|---|---|---|
| `schema` | literal | exactly `knowgrph-xr-viewer-handoff/v1` |
| `source_document_id` | string | points to the authored capture or model source |
| `selected_mode` | enum | one of `inline-viewer`, `immersive-session`, `native-handoff`, `unsupported` |
| `fallback_mode` | enum | lower-capability deterministic fallback for the same source |
| `target_route` | string | exact local route or external target |
| `reason_codes` | string[] | records why a higher-capability mode was not selected |

## 7. Workflow

1. The runtime resolves `XrCapabilitySnapshot` before opening any XR viewer or
   camera action.
2. The UI renders the recommended entry mode and any downgrade reasons before
   the operator commits.
3. If `monocular_capture` is available, the runtime records `XrCaptureDraft`
   under the existing source authority.
4. The viewer opens with one exact `XrViewerHandoff` record.
5. The canvas and graph consume that handoff as an authored asset, not as a
   hidden browser-side cache.

## 8. User stories and acceptance criteria

### Story `KXR-CAP-01`

As an operator, I want Knowgrph to detect XR capability before entry so that I
can see the best supported path on this device.

- Given a supported browser, when XR entry is requested, then the runtime emits
  one `XrCapabilitySnapshot` before any session or capture flow begins.
- Given no immersive support, when the snapshot resolves, then
  `recommended_entry_mode` is not `immersive-session`.

### Story `KXR-CAP-02`

As a phone user, I want a monocular capture fallback so that I can still create
an immersive asset without headset-only or stereo hardware assumptions.

- Given camera permission is granted and immersive viewing is unavailable, when
  capture starts, then the runtime records `capture_mode: monocular-camera`.
- Given motion sampling is unavailable, when the draft is stored, then
  `pose_sample_mode` degrades to `none` or `orientation-only` and does not block
  capture.

### Story `KXR-CAP-03`

As a viewer, I want one deterministic handoff path so that Knowgrph never hides
why it opened inline, immersive, or native.

- Given `immersive_viewer` is true, when the operator promotes from preview,
  then `selected_mode` may become `immersive-session`.
- Given only inline viewing is available, when the viewer opens, then
  `selected_mode` is `inline-viewer` and the handoff record carries the
  downgrade reason.

### Story `KXR-CAP-04`

As a maintainer, I want this slice to stay browser-native and zero-TCO so that
the product does not depend on paid infrastructure to prove basic XR value.

- No acceptance path may require a paid hosted XR service.
- No acceptance path may require platform-locked native AR SDK ownership.

## 9. Architectural decisions

| Decision | Status | Why |
|---|---|---|
| Resolve capabilities before viewer entry | Accepted | Prevents hidden fallback and lets the UI explain downgrades |
| Prefer inline browser viewing before immersive entry | Accepted | Keeps the first value path usable on more devices |
| Ship monocular capture before advanced reconstruction | Accepted | Matches the highest-ROI phone-first slice |
| Keep native handoff explicit and typed | Accepted | Avoids hidden platform-specific escape hatches |

## 10. Out of scope for this slice

- Stereo depth calibration and SLAM-grade reconstruction
- Platform-owned native AR session orchestration
- Multi-user shared immersive sessions
- Paid capture or hosting vendors
- Automatic production deployment claims

## 11. Relationship to existing XR docs

This contract complements, not replaces:

- `docs/documents/knowgrph-xr-mode-prd-tad.md` for the broader XR surface and
  asset pipeline
- `docs/documents/knowgrph-xr-invocation-runtime-api.md` for invocation and
  runtime surface evidence
- `docs/documents/knowgrph-xr-spatial-capture-fallback-readiness.md` for the
  current local acceptance path and proof boundary through
  `npm run xr:runtime-ready` and the repo-owned source proof command
  `npm run xr:source-runner:test`, plus the one-command review path
  `npm run xr:review-ready`
- `docs/documents/knowgrph-geo-xr-mode-prd-tad-ard.md` for composed geographic
  and spatial mode behavior
