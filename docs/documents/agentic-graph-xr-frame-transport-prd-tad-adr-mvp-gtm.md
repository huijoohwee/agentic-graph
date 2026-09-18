---
title: "XR Frame Transport PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.4.2"
date: "2026-09-18"
lang: "en-US"
frontmatter_contract: "required"
continuity_id: "XR-FRAME-TRANSPORT-001"
prd_revision: "1.4.2"
tad_revision: "1.4.2"
adr_revision: "1.4.2"
mvp_revision: "1.4.2"
gtm_revision: "1.4.2"
owner: "agentic-graph"
status: "implementation"
load_policy: "on-demand"
source_revision: "dddf1ab47ab0227eb5a21a7cbf49cba45ae8f322"
---

# XR frame transport

## PRD

`XR-FRAME-TRANSPORT-001@1.4.2`: a solo builder rehearses an authored XR product
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
| F08 | Home Apex loads the explicitly configured canonical Canvas catalog and opens Physics Playground through Demo. | `config.env.ts`; local Apex browser activation |
| F09 | The canonical Physics Playground seed describes frame controls, local save and canonical refresh; the ownership row does not imply every local store uses IndexedDB or that cloud sync succeeded. | `agentic-graph-physics-playground-demo.md`, `documentRepositoryAuthority.ts`; source authority, ownership projection and browser refresh/readback |
| F10 | Source Files saves path-keyed records in IndexedDB, imports legacy localStorage atomically once without deleting its bytes, survives database close/reopen, and rejects stale or failed durable writes. Git-backed Markdown remains canonical. | `workspaceFsIndexedDb.ts`, shared `indexedDbCollectionStore.ts`; `workspaceFs.indexedDb` registered migration, reopen, conflict and write-failure cases |
| F11 | Existing cast and Camera track markers pause and seek their exact cue times on click or keyboard activation, preserve speed, and use shared object/mark selection. Existing animation effect clips select their shared object and seek the animation start; no second animation marker is added. Dragging a cast or Camera mark retimes without seeking. Double-clicking empty object-track space creates a frame-snapped mark from its sampled pose; existing times select without duplication. The selected mark editor also offers Add at playhead. | [cue projection](../../canvas/src/features/three/xrTimelineSceneProjection.ts), [cue navigation](../../canvas/src/features/three/xrTimelineCueRuntime.ts); `canvas.xrMode.timeline.sceneCues` |
| F12 | Existing object lanes display sampled authored position and path state at the shared playhead. Lane selection leaves playback position unchanged. Authored object and Camera tracks precede simulation/NPC tracks. No separate overview, beat picker, object list, or transport is mounted. | Existing `xrShotTargets.ts` and `xrMotionReferenceSampling.ts`; mounted Timeline regression and desktop/mobile browser checks |
| F13 | Camera, Motion Control, Animation, Game Mode and Media display the same authored frame, FPS, playback rate and play/pause state. Selecting a Timeline object lane clears a prior NPC focus through the existing shared target controller. | [shared readout](../../canvas/src/features/three/XrRehearsalStatus.tsx), `XrSharedAssetControls.tsx`, `XrAnimationFloatingPanelView.tsx`; mounted regression and cross-panel browser checks |
| F14 | Updating authored XR choreography writes the current plan back to its flow document, active Source File and native workspace write queue, so editor text and source reparse preserve cues and assignments. Inline and block YAML sections are replaced once; unrelated frontmatter and body remain intact. | `graphDataFrontmatterFlowSync.ts`, extracted `graphDataFrontmatterSections.ts`; `canvas.xrMode.timeline.sourceReparse` |

| F15 | Action Paths cards show the assigned preset and target. Apply/Clear from either panel updates the same Timeline selector; replacing a path retains a valid native mark selection. Choreography reflects that mark and preset, while Timeline owns parameter editing. | `xrAnimationAssignmentRuntime.ts`, `XrAnimationFloatingPanelView.tsx`, `XrChoreographyInspector.tsx`; bidirectional mounted `canvas.xrMode.timeline.sceneCues` regression |

## TAD and ADR

TAD `1.4.2` consumes PRD `1.4.2`; ADR `1.4.2` binds that design. F01–F15 share
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

## Source Files storage decision — 2026-09-14

F09–F10 follow the existing [storage architecture owner](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md). Git-backed Markdown remains canonical. Source Files now delegates its browser working store to `workspaceFsIndexedDb.ts`, which lazy-loads the existing `indexedDbCollectionStore.ts` adapter with workspace paths as record keys. Each save updates the affected record. The sync engine retains its separate database and transport owner; local persistence does not constitute remote acknowledgement. The shared ownership row remains **Browser storage** because unavailable browser storage can enter the existing visible memory fallback.

The first successful open validates and atomically imports the legacy `kg:workspace-fs` snapshot together with a migration marker. Existing IndexedDB records win path conflicts; the original localStorage bytes remain untouched as a migration backup. The marker prevents deleted files from being reimported. Concurrent migration uses conditional transactions; stale rows cannot overwrite a newer stored record. File and folder creation conditionally reserve a free path, retrying bounded suffixes so concurrent creates retain both entries. Malformed backups, failed initialization and failed durable writes raise an error into the existing degraded-storage warning. Edits made after degradation may exist only in memory: export them before closing or reloading. Older app tabs writing the legacy snapshot after migration do not join the new store; reload those tabs before editing.

The database is browser-origin and base-path scoped. Clearing site data can remove it; export and verified sync remain separate safeguards. No browser persistence guarantee, automatic Git commit, cross-device synchronization, cloud resource or paid service is added. [Browser storage behavior](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Validation for F10: `npm -C canvas run test:ci:unit -- workspaceFs.indexedDb` uses actual database close/reopen with the existing fake IndexedDB harness. It checks Unicode/CRLF preservation, source-document caching, CRUD, simultaneous migration, existing-record precedence, stale writes/deletes, malformed legacy bytes and injected quota failures. The unchanged legacy backup is asserted after both successful and failed writes. The storage/workspace regression selection passes 284 cases. A real browser reopened a saved local note after reload and committed a second edit while its network was disabled; the IndexedDB record matched and the retained legacy snapshot hash stayed unchanged. This establishes local working-store behavior, not remote or production synchronization. Candidate-wide results and exact revisions belong in the delivery handoff.

The repository-owned promotion command validates the protected Canvas checks and advances the runtime docs pin to `67229b2886d238838139de403d17ecd30e604dc7`. This repairs the stale pin behind the preceding manifest mismatch; the separate Physics Playground source/projection byte-parity gate still fails.

Use Cloudflare D1 only when shared structured metadata is required. Its Workers Free allowance is 5 million rows read/day, 100,000 rows written/day and 5 GB total storage; queries fail at the daily limit. Keep it a rebuildable projection, enforce bounded reads and writes, retain offline edits when unavailable, and prohibit paid-plan upgrades. [D1 pricing and limits](https://developers.cloudflare.com/d1/platform/pricing/).

Defer R2 for this strict no-overage scope: its included allowance does not prevent billable excess usage. Defer PostgreSQL/pgvector until measured semantic retrieval needs justify operating PostgreSQL; it is a FOSS vector-search extension, not a browser working store. Cloudflare is a managed service, not a FOSS database deployment. No cloud resource or paid service is provisioned by this increment. [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [pgvector source](https://github.com/pgvector/pgvector).

Validation must distinguish local source refresh, browser reload, remote snapshot acknowledgement, protected integration, and production publication. The inspected preview had no unsaved active editor draft, no workspace ID and no configured sync provider. Remote synchronization is therefore unverified; the unavailable state is the expected result. Do not assign a synthetic workspace ID to manufacture a successful sync indicator.

Prior candidate `3784b01d2b281538066e8c435f0de32e302dd42d`: local validation passed 68 XR/ownership cases, 103 workspace cases, 103 seed-authority fixture cases, and `npm run check`. The browser adopted the new `animation_rehearsal` frontmatter and storage heading after the dev server was restarted and the page reloaded; Refresh alone initially retained the old text. This does not establish hot-refresh correctness. The source-only seed validator passed, while cross-repository parity failed because the pinned Canvas projection still contains the previous seed. Preserve that failed receipt until the source-to-consumer delivery chain reconciles it; these results do not establish production or cloud synchronization.

## Rehearsal integration handover — 2026-09-14

The user requested all three rehearsal, gameplay and Commerce outcomes end to end.
This authoring lane implements F06–F08 under that grant. The new on-demand component
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

Graph change budget: five runtime files (including CSS and environment projection, one new component), two
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

Home Apex initially could not load the catalog because the browser environment
reader omitted the configured Canvas docs root even though the local server
allowed it. F08 adds that existing setting to the explicit browser projection.
Apex now lists Physics Playground; Demo opens its canonical source and example
conversation, and the same animation command accepts quarter-speed playback.
No copied catalog or fallback source is introduced. The predecessor commit is
retained while this same-worktree successor supplies the complete source change.


## Scene cues increment — 2026-09-18

CID `XR-FRAME-TRANSPORT-001@1.4.2` carries F11–F14 through PRD, TAD,
ADR, MVP and GTM. Role/Subject: solo builder. Action/Verb: rehearse and inspect.
Object: authored demonstration beats and scene objects. Outcome: jump to a cue
and verify the relevant object without repeatedly dragging the ruler.

TAD/ADR: `XrTimelineRehearsalControls` contributes frame stepping through the
existing Gantt transport's optional toolbar slot. Cue navigation lives in the
existing `CameraMotionMarkRetime` markers. The native plan owns cast/Camera marks
and animation starts. Existing animation effect clips resolve their source-owned row identity and seek
their start time through the same shared transport and target controller.
There is no parallel cue catalog or picker. Pointer clicks and Enter/Space seek
through the existing transport/target owners; drag retiming suppresses the follow-up
click so it cannot unexpectedly seek. Fractional times and playback rate are
retained. Native shot targets deduplicate cast/subject identities, and their sampler
provides authored path state and positions in metres. No timer, persistence schema,
asset, engine or network request is introduced. Authored object and Camera lanes
precede simulation/NPC lanes; those runtime owners remain unchanged.

MVP: open Physics Playground and BottomPanel Timeline. Click or keyboard-activate
a numbered cast/Camera mark or an existing animation effect clip to rehearse that cue.
Inspect path state in the same object lane, then step a frame using the existing
transport. Drag a numbered mark to retime it without changing the playhead.
Double-click empty object-track space to add a mark at that frame, or use Add
at playhead in the selected mark editor with a keyboard or touch. The constrained
plan owner validates creation; the existing Scene Save action persists it. Existing
mark double-clicks and equal-time requests do not duplicate marks.
The toolbar wraps within the same transport at narrow widths. Frame controls have
44 px minimum targets and mount only with the Timeline.
The relevant FloatingPanel views reuse one read-only frame status component. Camera target changes also use the shared selection controller, clearing stale NPC focus without creating another selection owner.
It subscribes only while mounted; camera capture and gameplay retain their
existing activation and tick ownership. Native paused physics stepping is
specified separately in the [physics owner](agentic-graph-native-physics-engines-prd-tad-adr-mvp-gtm.md).

GTM hypothesis: a solo builder can rehearse an agent-commerce product demo with
fewer manual seeks before presenting an offer. Measure cue-to-verification time
and buyer commitment in a real pilot; this UI increment proves neither willingness
to pay nor a payment settlement. No external dependency, account, or paid service
is introduced. Graph remains the sole runtime owner; fleet consumers and
production mirrors follow their existing protected promotion path.

Validation: `npm -C canvas run test:ci:unit -- canvas.xrMode.timeline` covers
fractional seeks, simultaneous beats, camera/cast selection, rate preservation,
object sampling, end bounds, immutable authored plans, disabled documents,
drag-versus-seek behavior, native animation-clip seeking, bounded mark creation and containment in the single existing transport. Candidate-wide checks and browser results belong
in the delivery receipt; protected integration and production require separate evidence.


The flow source serializer now projects `kgXrMotionReference` from current graph
metadata when saving the authored plan. Previously it rewrote flow topology but
retained the old XR frontmatter section, allowing a later source reparse to restore
stale cues. The existing YAML section writer is extracted once and reused for
Timeline and XR sections; inline sections are replaced instead of duplicated.
This fixes the source owner rather than retaining a private panel cache.

Canonical workspace demo refresh continues to restore repository-authored seed content. Persistence acceptance applies to authored flow documents; it does not override that existing source-authority policy.
