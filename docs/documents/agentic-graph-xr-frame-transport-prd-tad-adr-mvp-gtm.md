---
title: "XR Frame Transport PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.0.0"
date: "2026-09-14"
lang: "en-US"
frontmatter_contract: "required"
continuity_id: "XR-FRAME-TRANSPORT-001"
prd_revision: "1.0.0"
tad_revision: "1.0.0"
adr_revision: "1.0.0"
owner: "agentic-graph"
status: "implementation"
load_policy: "on-demand"
source_revision: "3e4431041f65a1bae38822ab3b98d4508d30d4b6"
---

# XR frame transport

## PRD

`XR-FRAME-TRANSPORT-001@1.0.0`: a solo builder rehearses an authored XR product
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

## TAD and ADR

TAD `1.0.0` consumes PRD `1.0.0`; ADR `1.0.0` binds that design. F01–F05 share
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
