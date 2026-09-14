---
title: "XR Frame Transport PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.1.0"
date: "2026-09-14"
lang: "en-US"
frontmatter_contract: "required"
continuity_id: "XR-FRAME-TRANSPORT-001"
prd_revision: "1.1.0"
tad_revision: "1.1.0"
adr_revision: "1.1.0"
mvp_revision: "1.1.0"
gtm_revision: "1.1.0"
owner: "agentic-graph"
status: "implementation"
load_policy: "on-demand"
source_revision: "68dc87ee3e42aaa6e09dfeda8c8cd8742737f757"
---

# XR frame transport

## PRD

`XR-FRAME-TRANSPORT-001@1.1.0`: a solo builder rehearses an authored XR product
demonstration at quarter speed, pauses on consecutive frames, and reads the same
position through BottomPanel Timeline and the existing local animation tool.
The prior shared-store tolerance was 0.001 timeline units: in fractional minutes
that discards a 30 fps seek. Buyer demand and willingness to pay are unvalidated.

Context: the existing Physics Playground, Animation, Motion Control and Game Mode
share the retained XR surface. Intent: reduce repeated manual scrubbing when
checking a demo. Directive: repair the shared transport owner and reuse the local
animation invocation. Role/Subject: builder. Action/Verb: inspect. Object:
authored scene frames. Outcome: repeatable frame and speed readback.

| Criterion | Acceptance | Source owner / validation |
|---|---|---|
| F01 | Authored 12/24/30 fps seeks agree in both stores; the shared store also accepts a 60 fps seek. | `uiSliceInitialState.ts`; animation runtime regression |
| F02 | Quarter speed is selectable in the existing Timeline and through the existing invocation; pause/resume retains it. | `timelineTransport.ts`, `TimelineTransportControls.tsx`, `xrAnimationTransportRuntime.ts` |
| F03 | Frame seeks pause, clamp to the authored duration, and leave authored motion and FPS unchanged. | `xrAnimationTransportRuntime.ts`; animation runtime regression |
| F04 | Invalid, duplicate, conflicting, or unsupported arguments fail before effects; another document cannot supply inspection state. | `xrAnimationMcpRuntime.ts`; animation runtime regression |
| F05 | Repeating an unchanged store update publishes no new state. | `uiSliceInitialState.ts`; animation runtime regression |
| F06 | Given an open document, previous/next Timeline buttons pause on the exact adjacent authored frame, preserve playback rate, show the shared frame and disable at its bounds; absent documents disable stepping. | `XrTimelineRehearsalControls.tsx`; mounted component test plus existing animation runtime |
| F07 | The pinned Timeline stays inside the mobile safe-area insets and desktop centering remains intact. | `responsive-canvas-toolbar.css`; real-browser geometry at 390 x 844 |

## TAD and ADR

TAD `1.1.0` consumes PRD `1.1.0`; ADR `1.1.0` binds that design. F01–F07 share
the continuity ID above. Keep the existing transport store and panel; extract its
animation adapter into one helper loaded with the existing XR animation feature.
Use authored FPS for frame targeting and the shared rate list for validation.
Reject a separate playback timer, physics engine, panel, storage schema or service.
The core Physics Playground simulation and Game Mode tick ownership stay with
their existing owners. Frame seeking samples authored animation/camera tracks;
it is not a replay or rewind of interactive physics or gameplay.

The existing `agentic-graph.control_local_animation` invocation input accepts:

```text
/animation.control @canvas operation=play rate=0.25
/animation.control @canvas operation=scrub frame=next
/animation.control @canvas operation=scrub frame=previous
/animation.control @canvas operation=scrub frame=30
```

`rate` is optional on `play` and accepts the shared Timeline rates. `frame`
accepts a nonnegative safe integer, `next`, or `previous`; it is mutually
exclusive with `time`. Existing structured play/pause/scrub inputs are unchanged.
Inspection reports document key, playing state, rate choices, seconds, frame and
FPS through `runtime.transport`. This is browser-local and requires an open
document. No remote provider, model, credential or network call is added.

## MVP, GTM and evidence

Open the [Physics Playground](../workspace-seeds/agentic-graph-physics-playground-demo.md),
choose Animation, apply a compatible authored motion, and use BottomPanel
Timeline for quarter-speed rehearsal. Existing Motion Control and Game Mode
remain on the same surface; this slice adds no competing controls to them.
Use the invocations above to inspect consecutive authored frames.

Hypothesis: precise rehearsal reduces a solo builder's time to produce a
demonstrable offer. Measure elapsed rehearsal time and missed seeks, then seek
one actual buyer commitment. No price, revenue or paid-loop success is inferred
from this technical change.

Validation owner: `canvas/src/__tests__/xrAnimationRuntime.test.ts` invokes the
frame/store cases in `timelineTransportEditModeStore.test.ts`; run
`npm -C canvas run test:ci:unit -- canvas.xrMode.animationRuntime`, then the
repository check, regression suite and applicable browser gates. Test results
and exact revisions belong in the delivery handoff. Production, protected
integration and browser success require separate receipts.

Graph owns executable code and this contract. Canvas consumes the existing
source seed; the website's AgenticRAG map is regenerated after source integration.
Production mirrors are emitted only by the protected release workflow.
Increment: one helper, no dependencies, no added always-load instructions.

## Rehearsal integration handover — 2026-09-14

The user requested all three rehearsal, gameplay and Commerce outcomes end to end.
This authoring lane implements F06–F07 under that grant. The new on-demand component
projects the existing local command and store; it adds no clock, dependency,
provider, persistence, payment authority or always-loaded content. Existing
Timeline duration/FPS controls retain their owner. Native objective controls are
validated at their [physics adapter plan](agentic-graph-native-physics-engines-prd-tad-adr-mvp-gtm.md).

Commerce retains its separate `edge-commerce-agent-mvp@0.6.0` sandbox contract.
At Commerce `134c41f0d77af6ffd2fe401520bc3b1438df47e6`, the local full profile-specific
check passed all eleven browser groups: private offer preparation, exact review,
sandbox creation, fixture-confirmed payment, receipt/sample download, cancellation,
and offline/replay boundaries. The provider success in this run is a local fixture.
The deployed runtime reports sandbox source `50cc1d7e1a81af4ca89c2c4584bc50aee89ec55f`
and Worker `927f0fa9-8aa2-4a9d-9dcc-1e104220ce3b`; current checkout has identical
`public/local-first` and `src/local-first` trees. All eleven deployed browser
checks passed, including pending payment, cancellation and offline boundaries.
A separate browser recovered an existing successful sandbox session: a fresh
provider status check and both receipt/sample downloads succeeded. This was a
recovered order, not a new hosted payment submission or actual collection.

Graph change budget: four runtime files (including CSS, one new component), two
component tests, two registry entries and two existing plans, under 20 kB added
source. The oversized Timeline file shrinks. Dependencies and always-load deltas
are zero. The shared responsive CSS owns the mobile centering correction, so
Timeline consumers share the fix. No Canvas or website runtime fork is needed.
Fleet ownership passed for eight roots, 544 artifacts, 17 responsibilities and
88 planning families.

Validation uses the exact pinned Canvas docs at
`96e835bb576b004e31162f34845d07c3e0704e8a` through
`AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT`; canonical sibling checkouts are preserved.
`npm -C canvas run test:ci:unit -- canvas.xrMode` passed 66 tests, including F06
and HUD-01 mounted controls registered in the normal suite. Browser frame clicks
pause precisely, preserve quarter speed and reach frame zero. At 390 x 844,
Timeline bounds changed from x=-179..195 to x=8..382. Controls use 44 px targets.

Game Mode's real mobile browser check completed movement, fire, win, save, reload
and malformed-save recovery with one Canvas and zero nonlocal requests.
Motion Control's browser check exercised the Wasm model with a Chromium virtual
camera, then released every track; physical-camera/person detection is unproven.
Standalone 2D/3D export and its browser checks passed.

The requested full Graph registry ran 4,871 tests: 4,825 passed and 46 failed.
After correcting the sibling pin, a dependency-aware recheck ran 150 relevant
tests: 130 passed and 20 failed, in host acquisition and existing source/doc
contracts (including the XR preset and permissions-policy expectations).
The `ui.three.objectDrag` failure did not reproduce in this focused run; therefore
full-suite parity is not established. Logs are retained locally under
`/tmp/xr-graph-full-suite.log` and `/tmp/xr-graph-failure-recheck-pinned.log`.
No passing subset, sandbox result or URL establishes new production readiness.
Protected integration, candidate authorization, production delivery, and real
buyer willingness to pay remain separate evidence boundaries.
