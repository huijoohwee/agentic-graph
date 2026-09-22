---
title: "agentic-graph XR Mode Increment and Evidence History"
doc_type: "Increment and Evidence Companion"
doc_id: "KXR-001-HISTORY"
version: "0.7.1"
date: "2026-09-22"
lang: "en-US"
frontmatter_contract: "required"
owner: "Product maintainers"
status: "spec-complete"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
continuity_id: "PLAN-AGENTIC-GRAPH-XR-MODE-PRD-TAD-ADR-MVP-GTM"
parent: "agentic-graph XR Mode PRD-TAD-ADR-MVP-GTM"
parent_version: "0.7.1"
parent_source: "agentic-graph-xr-mode-prd-tad-adr-mvp-gtm.md"
worktree_id: "device-0232231d4a19--xr-character-authoring"
agent_id: "codex-01a0c491"
historical_source_revision: "620471f120ddb31c7aab6ffcc8296f7be6eb3144"
historical_document_version: "0.6.3"
historical_document_sha256: "8310fd2eded3f51c38db8e7a10310fac0241cecdea45f7812072e0b98f0cb50a"
load_policy: "on-demand"
---

# XR Mode increment and evidence history

This companion preserves the preceding owner's evidence and increment tail verbatim.
Its internal revisions, check results, scopes and links retain their historical
meaning; they do not satisfy newly added authoring criteria or renew release authority.
The [joined owner](agentic-graph-xr-mode-prd-tad-adr-mvp-gtm.md) defines current
requirements, architecture, decisions, MVP and GTM at version 0.7.1. Extraction
keeps both documents below 600 lines without deleting earlier authored evidence.

<!-- preserved-history-begin -->
## Focused proof and readiness

Run:

```sh
npm run xr-mode:source-runner:test
npm run xr-mode:source-ready
npm run xr-mode:runtime-ready
```

`npm run xr-mode:runtime-ready` is the root XR Mode enforcement boundary. It
must execute the complete E1-E4 source ledger and the fresh local-browser
fallback smoke. Individual renderer, asset, session, or fallback tests are
supporting evidence only and cannot independently promote XR Mode to
runtime-ready. The command remains provider-neutral and local-only; its
contract forbids deployment and documentation-update mutations. Canonical
fallback evidence wording and limitations remain in
`docs/documents/agentic-graph-xr-spatial-capture-fallback-readiness.md`.

The local browser proof covers one non-immersive, camera-API-capable Chromium
surface. It does not establish a physical camera, a physical headset, native
SPZ rendering, phone-video asset publication, Production, or Cloudflare.

## Validation checklist

- [x] Current runtime owners are named.
- [x] Capability modes match the source enum.
- [x] AR-first session and reference-space behavior match source.
- [x] Camera fallback routes to the existing owner.
- [x] Asset conversion matches the actual plane compiler.
- [x] Standalone SPZ is documented as recognized and unsupported.
- [x] The second renderer/camera/physics/timeline path is excluded.
- [x] Aggregate XR Mode readiness fails closed if any E1-E4 or browser stage
  fails or if the root command is narrowed.
- [x] Current XR Mode and fallback readiness guides remain below 600 lines; the XR v2 design is an immutable pin.
- [ ] Physical mobile and immersive-device evidence.
- [ ] Native SPZ runtime.
- [ ] Persisted phone-camera spatial asset contract.
- [ ] Protected integration and Production release.

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-XR-MODE-PRD-TAD-ADR-MVP-GTM@0.6.3`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Part A — Product requirements](agentic-graph-xr-mode-prd-tad-adr-mvp-gtm.md#part-a--product-requirements) |
| TAD | [Part B — Technical architecture](agentic-graph-xr-mode-prd-tad-adr-mvp-gtm.md#part-b--technical-architecture) |
| ADR | [Architectural decisions](agentic-graph-xr-mode-prd-tad-adr-mvp-gtm.md#architectural-decisions) |
| MVP | [MVP — reference implementation](agentic-graph-xr-mode-prd-tad-adr-mvp-gtm.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-xr-mode-prd-tad-adr-mvp-gtm.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run xr-mode:runtime-ready` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`canvas/src/__tests__/xrAssetConversionHarness.test.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/__tests__/xrAssetConversionHarness.test.ts), [`canvas/src/features/parsers/canvasFrontmatterPreset.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/parsers/canvasFrontmatterPreset.ts), [`canvas/src/lib/canvas/canvasSurfaceOwnershipRuntime.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/lib/canvas/canvasSurfaceOwnershipRuntime.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.

## Sea journey increment — reference implementation

All five roles join the same continuity ID at **0.6.3**. This bounded increment is authorized by the
2026-09-21 request to enhance the existing XR panels and runtime-readiness demo with the supplied story.
Source baseline: `b242ab5d82c49155808a86b45565c797f8e04f61`; invocation: `/change #xr-sea-journey @huijoohwee`.
Prior evidence above retains its recorded revision; this increment claims no new delivered rung.

| Role | Increment and acceptance |
|---|---|
| PRD | An author needs recognizable cast/props and a complete reproducible story. SJ-1: sail, straw/stick collapse, brick resistance, chimney/soup, escape and reunion follow the supplied script. SJ-2: one Subjects & Props surface includes catalog and placed-instance controls with visual previews. SJ-3: pause, seek, frame-step, replay, camera and Motion Control retain the shared Timeline and selected-target owners. |
| TAD | Extend `xrMotionReferenceModel` marks with optional bounded presentation cues and camera captions; sample them deterministically in `xrStoryPresentation`. Reuse `XrSceneLibrarySubject`, native procedural geometry, Media cards, rehearsal status and the existing seed. No second clock, physics engine, camera owner, service or transport. |
| ADR | Keep seven existing camera beat times and the 28-second demo. Explicit asset IDs and authored cues drive new story visuals; old documents remain valid. Effects illustrate authored events rather than claiming physical structural simulation. Recovery is reverting this scoped source change and reapplying the prior Git-backed seed. |
| MVP | Existing Surface Mode → XR, Source Files seed apply, Animation, Motion Control, Camera, Media and Game Mode routes remain entry points. SJ-1/SJ-3: parsed-seed, cue sampling, serialization, backward seek and panel/runtime tests. SJ-2: rendered preview and filtered placed-instance checks. Run the repository affected planner and its selected checks; browser and protected integration results must be recorded separately. |
| GTM | First pain hypothesis: educators/story authors spend time translating a script into readable choreography. Closest built solution: this existing local rehearsal surface. Test a $1 optional authored-story pilot only after a user observes the complete loop; demand, willingness to pay and revenue remain unvalidated. The free local core remains available. |

Grounding: **confirmed** native shared transport, selectable subjects, Tropical Playground and procedural
houses at the source baseline; **absent** authored collapse/splash cues, explicit story assets and visual
catalog previews; **unverified** physical-device behavior and buyer demand. The pre-existing canonical
seed edit is preserved and is not adopted into this lane. Earlier integrated rehearsal source is reused.

Budget: 60 minutes for source/verification, at most 18 changed source files and 80 KB added bytes;
new dependencies, paid services, remote media and always-load guidance delta: zero. CI/provider waits
require an observed condition and recheck rather than an ETA. No deployment or production claim.

Local verification (2026-09-21): the affected planner selected five owner partitions and all passed;
nine registered journey/seed/Timeline/camera tests passed; seed authority and changed-file hygiene
passed. Browser checks exercised Surface Mode → XR, both Subjects & Props views, the opening
camera beat with all three pigs aboard the sailboat, caption projection and collapsed-house replay
in the native playground. This is local browser evidence, not device or production proof. The
28-second choreography retains nine visible speed sanity warnings for intentionally compressed
travel; no warning threshold was changed. Protected integration remains a separate provider gate.

### Playground selection and Timeline inspector follow-up

The 2026-09-21 browser comments authorize `/change #xr-playground-contract-ready @huijoohwee`.
PS-1: native cannons, landmarks, palms, rocks, treasure and simulated bodies select through the
existing shot-target owner without spawning authored copies. Hidden story geometry must not intercept
picking. PS-2: in-scene Subjects & Props reuse the environment card layout and native illustrations;
keyboard selection opens the same Timeline target. PS-3: authored name, asset, XYZ, rotation, scale,
color and path interpolation have one editor in BottomPanel Timeline. Environment and simulation
objects expose their ownership and position there; their existing runtime retains placement authority.

The implementation extends the existing scene catalog, shot-target resolver and rendered geometry;
there is no second scene, physics world, transport or persistence model. Native targets have no
animatable cast binding, so commands cannot fall through to a previously selected pig or wolf.
Cast edits and retiming preserve presentation cues. Regression coverage exercises all native targets,
no-copy/no-mutation selection, explicit command rejection, hidden geometry, rendered card accessibility,
Timeline transforms and cue preservation. The follow-up cap is 26 source/document files and 80 KB added bytes;
verification includes the seed's pinned-source and default-panel contracts, with provider waits reported separately.
The inventory validator now delegates to the existing XR runtime seed contract, removing contradictory
Animation/Motion Control defaults while retaining the inventory's explicit browser-proof claim boundary.


### Shared choreography and source references

`/change #xr-choreography-source-ready @huijoohwee` consolidates the existing XR authoring flow. All selected subjects, props, and native stage objects use one geometry-following yellow bounding box. FloatingPanel Animation owns path and character presets. BottomPanel Timeline owns mark easing, gait, position, timing, static transforms, selection and transport; Motion Control projects that same selected target, mark and assigned motion. No extra clock or scene is introduced.

The rehearsal body uses existing `{{key}}` references to frontmatter scene fields and camera captions. Dotted array paths resolve their current values in Markdown preview; source tokens remain editable references. Captions are authored once in frontmatter. This local pass is capped at 30 touched files and 80 KB of added source; existing generated/runtime-readiness and release boundaries remain in force.

### Viewer invocations and Timeline parameters

`/fix #viewer-edit-stability @huijoohwee` keeps the shared workspace status owner and Viewer edit notifier stable across renders. Inactive blocks must not replay their state when a parent callback changes. Indexing state changes and Viewer edits must not cancel and restart an unchanged document job; status destinations still rebind when their toast ID changes. Validate indexing completion, subsequent editing, and the mounted Viewer with XR present without nested-update warnings.

`/refactor #xr-viewer-shared-invocations @huijoohwee` projects the existing native XR catalog into Viewer reference chips and the shared searchable Variable commands menu. Stage and asset selections use the existing `/xr.stage @stage` and `/xr.transform @subject #transform asset=asset` builders and `control_local_xr_scene` controller, shared with MCP and WebMCP. There is no Viewer choice schema or independent frontmatter writer. Authored role labels, subject IDs, marks, cues and camera anchors remain stable. Nested caption references resolve catalog words with bounded cycle handling; read-only viewers display values without mutation controls.

Timeline remains the sole mark parameter editor (easing, gait, position and time); Animation keeps presets and mark summaries synchronized with Motion Control. Validation covers shared-menu keyboard selection, canonical invocation routing, persisted source, pending-editor rejection and read-only references. Budget: 30 minutes of implementation and local checks, at most 20 touched files and 60 KB of changes; CI waits are separate.

`/fix #viewer-reference-edit-parity @huijoohwee` keeps paragraph view and click-edit on the same rendered inline surface. Reference-only paragraphs edit their bound frontmatter strings through the existing section writer; body references, nested asset tokens and unrelated metadata survive save/cancel. Asset pills align with prose without adding punctuation spacing. Acceptance covers ordinary inline code, multiple caption references, source mutation, cancellation and repeat editing. Scope: 12 files, 35 KB; local checks precede protected integration.

`/fix #viewer-widget-invocation-parity @huijoohwee` reuses the Skills & Commands token renderer for recognized inline-code invocations in Viewer and Widget Cards. Command, binding and semantic tokens retain their catalog tone, source link and label; command-plus-target invocations retain their chips without invented source links when the catalog is deferred offline. Ordinary code remains code. Click-edit preserves the mounted token appearance and writes the original invocation text and backticks without executing it. Acceptance compares all three read surfaces plus edit/save/cancel. Scope: 8 files, 30 KB; existing MCP/WebMCP owners remain authoritative.

`/fix #shared-black-hover-tips @huijoohwee` reuses the existing Tooltip renderer and source theme tokens for black backgrounds and white text in every theme. One delegated, event-driven owner serves existing native title labels across mounted and dynamically added controls; catalog and inline invocation chips retain full command, binding and semantic descriptions. Existing explicit Tooltip instances remain single owners. Hovering or focusing must not execute commands, alter authored Markdown, intercept clicks, or add layout wrappers. Acceptance covers pointer/focus, dismissal, live title changes, removal, click-edit invocation spans, and light/dark token parity. Scope: 15 files, 40 KB; implementation exceeded the initial 20-minute target while reconciling existing theme ownership; affected validation and external review waits are separate. No new dependency, timer, polling, page traversal or per-chip React tooltip state.

### Shared invocation provenance and Widget media parity

`/fix #widget-media-source-parity @huijoohwee`

Reuse the black tooltip and canonical invocation catalog for descriptions and Source in Skills & Commands, Viewer, and Widget chips. Repair Widget media insertion through the shared Viewer edit surface, preserving authored text and existing media/runtime owners. Validate pointer selection, source persistence, edit/view parity, and affected source checks; no provider or production change.

The shared catalog supplies native subjects, props, and environments as canonical XR invocations; selecting an entry inserts source without executing it. Image, audio, and video share one embed builder and preserve their original markup through further editing. The shared media pill centers its thumbnail on the label in both view and edit. Local browser checks observed matching centers and black/white source tooltips; focused insertion, serializer, and invocation parity tests pass. Final scope is 22 files with existing owner extraction, under 50 KB of added source; exact candidate checks remain separate from publication or production proof.

`/fix #widget-media-source-preservation @huijoohwee` extends the same serializer check to HTML-encoded media URL query parameters. Match the rendered URL after entity decoding while retaining the original embed bytes; keep this repair within the serializer, regression test, and plan owners.

`/fix #shared-media-thumbnail-alignment @huijoohwee` centers every media pill's leading thumbnail through the shared pill class, including XR reference illustrations that lack raster-media attributes. Remove the narrower attribute-specific selector, constrain native fallback artwork to its wrapper, and verify both Viewer and Widget edit/view centers. Three owner files; no new component or dependency.

### XR publication responsiveness

`/fix #xr-publish-responsiveness @huijoohwee` addresses the separate XR browser CI deadline failure.
Cache narrow-phase contact times within one simulation step, retain deterministic time/ID ordering,
and invalidate every remaining contact involving a body moved by resolution. Swept-contact tests and
1,280 differential states match; the dense local fixture measured 5,750 ms before versus 332 ms after.
This is not provider CI or production performance proof. No contact, sensor event or deadline is removed.
The three-file solver change adds under 10 KB, with no new module, dependency or always-load guidance.

The shared workspace text writer reuses `runWorkspaceFsChangedBatch`: artifact creation and missing
folders notify observers once after exact persistence readback. A failed readback still rejects and
releases one notification for partial mutation. Creation, update, failure and batch-release tests pass.
The three-file follow-up adds under 4 KB; local publication measured about 49 seconds versus 54 before. Neither improvement alone resolved provider CI.

`/fix #xr-adaptive-resolution @huijoohwee` bounds pixel work in the existing XR frame owner. At least
one second and eight frames establish sustained pressure below 30 fps; pixel ratio decreases toward
0.5. Ten fast windows restore one quality step, bounded by the renderer's initial ratio. This changes
render resolution only: authored geometry, physics, Timeline time, storage acknowledgements and
publication deadlines remain intact. Hidden, paused, stalled and native immersive frames are excluded.
No second loop, timer, dependency or renderer is introduced. Scope: four existing files, under 8 KB.
Acceptance: deterministic pressure/recovery/reset tests and the existing full browser capture, reload,
publish and second-device reopen contract. One eightfold-throttled diagnostic measured 49.2 seconds
at full resolution versus 38.5 seconds at half resolution; this is provisional local evidence only.
Exact protected integration and recoverable closeout retain separate receipts.
`/workspace.refresh #incremental-work @workspace` reads the local inventory after filesystem mutations and seed-sync completion, without reconciling seeds twice. Explicit refresh and the seed lifecycle still reconcile; coalescing preserves any queued full refresh. Mixed-path batches remain observable. Acceptance covers mounted mutation/explicit refresh, unchanged identity, queue priority and the unmodified XR publication deadline. Scope: three existing files, under 8 KB, no new module or dependency; local timing is diagnostic, not provider proof. `/xr.publish #atomic-storage @workspace` prepares the existing store during uploads, then conditionally commits the manifest document, retained revision and outbox together after verified workspace persistence. A changed local revision returns conflict; cancellation retains any committed pair and prevents late transport. The 60-second deadline and upload acknowledgements remain unchanged. Motion Control subscribes only to its consumed readiness primitives, and static UI tool labels read the canonical contract instead of constructing full runtime inspections. Target inspection reads its existing source owners directly without building unused scene and animation inventories. Scope: eight existing files, under 12 KB, no new module, dependency or cache; rollback restores the preceding owners. Tests cover transaction rollback, concurrent revision changes and cancellation; exact-head browser/provider proof remains required.

### Subject draft source fidelity — 0.7.1

`/fix #xr-subject-draft-fence @huijoohwee` advances A01/A06 independently of part construction. Existing Timeline subject inputs bind drafts to document text, source and authored plan identity; matching subject IDs in another document confer no write authority. Source replacement resets the input; stale commits reject before existing scene controls/persistence. Playhead publications retain the same plan and must not invalidate a draft.

Acceptance: duplicate-ID document switch, same-document reparse, valid edit/save/reparse, and seek-preserved drafts/selection. Scope is the existing editor, one draft helper and two focused tests, plus these joined documents; ten active minutes, six files, no dependency, builder, rig schema, clock or renderer. Full model/rig/agent/export acceptance remains open. Focused and affected verification must be recorded separately; no runtime completion is claimed by this planning entry.

Focused draft-context and mounted-editor regressions passed locally, including persisted Markdown/Source Files reparse and a Timeline seek that preserves the edited input. Full affected checks and browser proof remain pending; these focused results do not complete A01/A06 or the other acceptance criteria.


### Selected-subject construction — S1 implementation checkpoint, 0.7.1

`/change #xr.subject-authoring @codex` consumes protected Graph
`795581f138393e4a89169d1373a9f3e2161cb63e` in the existing admitted private
character lane. This checkpoint remains part of the 0.7.1 join; prior version
and parent-version declarations remain unchanged. Twenty active minutes, two
already-reserved helper modules, no additional checkout, dependency or service.

The selected subject can use the existing bounded text constructor and native
procedural controls. Its optional construction attachment retains the native
session document byte-for-byte, including identity, intent, seed, stable part
IDs, control schema/values, clips, last-valid recipe and rejected draft. The
attachment stores existing workspace companion paths; it does not embed a
second GLB or a second recipe schema. Native workspace/export prepares immutable
companions before the existing scene metadata persistence commits the reference.
Failed or stale completion cannot replace the subject; partial companions follow
the existing workspace writer's recovery behavior. Scene normalization admits
construction through the existing session parser and builder, and its derived
bounds feed the existing placement gate. Catalog subjects retain their previous
serialization/rendering when no attachment exists.

Rendering reuses native parts/pivots and samples the first authored clip from the
existing shared playhead. There is no second scene store, selection or clock.
The native controls expose dimensions/materials and validated JSON for hierarchy,
pivots and clips. Arbitrary code does not execute. Default catalog asset/color
changes on an authored subject reject with guidance to its construction controls;
per-field disable/visibility belongs to `XrMediaLibraryCards` outside this slice.
The preview's first-clip sampling is not full clip selection/keyframe editing or
new joint lanes. Bounds currently describe the admitted construction pose.

The existing registered subject tests gain native-document round-trip, invalid
hierarchy/path rejection, retained last-valid/draft, catalog preservation,
backward joint sampling, mounted controls and seek-preserved editor assertions.
They have not been run for this checkpoint: installed dependencies must first
match this source. No runtime/browser/export acceptance is claimed. Next proof is
focused subject plus existing procedural regressions, affected owner checks and
real save/reopen/controls/shared-playhead browser inspection. A01-A09/B01-B08
remain open; visual part selection/rig UI, multi-clip/keyframe Timeline projection,
shared agent/WebMCP execution, full scene animated GLB, MP4 and cross-surface/demo
parity still need their admitted owners and exact evidence.


S1 repair checkpoint: construction controls now use captured context generations.
Accepting a scene commit gives subsequent edits a fresh generation; old requests
retain their invalidated generation even after selection/source returns to the
same values. Context retirement aborts creation and remounts native controls.
Workspace parent resolution uses the existing ancestor helper, including bare
filenames at root. Mounted regressions cover create, second edit, pending
selection-away-and-back rejection, and a fresh edit after rejection; not yet run.
Malformed attachments now raise `XrSubjectConstructionError` before hydration
mutates prior runtime state. The existing runtime bridge does not catch that
new typed error: user-facing recovery still requires the unreserved
`XrMotionReferenceRuntimeBridge.tsx` owner before this slice is release-ready.

### S1 visual part editing — admitted continuation

`/change #xr.subject.current-base @codex` continues inside the existing private
character reservation. The part inspector selects a stable native part and edits
its parent, primitive, local position, pivot, rotation, dimensions, material and
visibility through the existing recipe/session and workspace publication. Bound
procedural fields retain their control limits and values. Invalid or stale edits
retain the last valid subject; a selection/source change retires pending saves.
No new recipe, scene store, clock or renderer is introduced. Twenty active minutes
to the first checkpoint; six existing files, zero new modules,
checkouts, dependencies or services. Review precedes focused tests. Acceptance
requires part/control agreement, hierarchy rejection, exact save/reparse and
selection/source cancellation. Selected-model GLB uses the same trusted exporter,
with authored local parts/clips, validated bytes and a final current-source check
before native download. It does not claim whole-scene motion or camera export.
Actual GLB reimport must prove edited geometry/material and joint animation, and
selection cancellation must suppress late delivery. This advances S1; the bridge, Timeline, agent and
export acceptance gaps above remain open until their owners are admitted.
The added selected-model export/reimport proof expands this slice's authored-byte
cap from 20 KB to 22 KB; the file, module, checkout and dependency caps are unchanged.
Review, focused part/save/reimport/cancellation cases and Canvas 5.8.3 type checking
passed locally. Real browser UI and whole-scene export remain unverified.

### S1 authored clip playback — admitted continuation

`/change #xr.subject.current-base @codex` continues in seven existing reserved
files, with a 20-active-minute checkpoint, at most 18 KB of added source and zero
new modules, checkouts, dependencies or services. Persist a selected native clip
or explicit rest pose and repeat/hold behavior in the subject construction's
scene attachment. Legacy attachments retain their first-clip repeat behavior.
The renderer samples only the shared Timeline playhead, including backward seeks
and exact non-looping endpoints. Native recipe clips and exported GLB remain
unmodified; scene playback configuration is not claimed as baked GLB behavior.
Unknown or removed clip references reject without replacing last-valid source.
Review before focused admission, actual sampler and mounted persistence checks;
then use the locked Canvas compiler once. Native Timeline rows, keyframe UI,
bridge recovery, agent parity and whole-scene export remain outside this slice.

Independent review found no actionable defects. Mounted clip save/reopen plus
existing GLB/cancellation passed in 1793 ms. The actual mixer regression passed
in 214 ms after replacing an unsuitable angle comparison on identical non-unit
Float32 quaternions with exact array equality; no tolerance was widened and the
sampler was unchanged. A nullable return type annotation was corrected after
Canvas type checking; final compiler validation is recorded in the task receipt.
This proves focused behavior, not browser/mobile or full Timeline acceptance.
