---
title: "agentic-graph Choreography Studio"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.1.2"
date: "2026-09-24"
lang: "en-US"
frontmatter_contract: "required"
owner: "agentic-graph"
continuity_id: "CHOREOGRAPHY-STUDIO-001"
source_status: "spec-complete"
runtime_status: "implemented-in-part"
delivery_status: "undocumented"
deployment_status: "not-requested"
---

# agentic-graph Choreography Studio

## Source ownership

This is the editable, product-owned specification for the Choreography Studio
demo. Its implementation and evidence live in this repository because the
native XR stage, timeline, subject movement, camera choreography, persistence,
and browser-local agent controls live here. It supersedes no runtime contract:
the XR Motion Reference remains the detailed runtime-design authority for its
existing modules.

The demo is a browser-local previs and rehearsal surface. It does not claim a
physical-space capture pipeline, identity inference, device control, rendered
video delivery, hosted collaboration, or production deployment. Those require
separate source-owned scopes and evidence.

| Native concern | Existing owner | Current evidence |
|---|---|---|
| Editor and Canvas workspace shell | `canvas/src/features/markdown-workspace/main/MarkdownWorkspaceMain.tsx` | The existing split workspace owns source-file editing and Canvas pane visibility. |
| Plan, placed subjects, tracks, and marks | `canvas/src/features/three/xrMotionReferenceModel.ts` | Versioned graph metadata normalizes the authored plan. |
| Draft and stage projection | `xrMotionReferenceRuntime.ts`, `XrMotionReferenceStage.tsx` | One bounded snapshot feeds the panels and XR stage. |
| Timeline and rehearsal transport | `xrMotionReferenceTimeline.ts`, `XrRehearsalStatus.tsx` | The shared Timeline owns playhead and rehearsal state. |
| Subject and camera movement | `threeKeyboardChoreography.ts`, `XrKeyboardChoreographyRuntime.tsx` | Keyboard, pointer, and agent callers share constraint-aware movement. |
| Authoring controls | `XrChoreographyInspector.tsx`, `XrAnimationFloatingPanelView.tsx`, `XrCameraMotionSection.tsx` | Existing panels project the same persisted plan. |
| Browser-local agent surface | `canvas/src/features/agent-ready/webMcpRuntime.ts` and XR control runtimes | Existing guarded browser controls reuse native state owners. |
| Authored scene questions | `xrSceneSemantic.ts`, `xrSceneMcpRuntime.ts` | A bounded, revision-tagged projection reads the XR plan and native stage. |
| Guided rehearsal | `xrSceneExercises.ts`, `XrChoreographyInspector.tsx` | Three deterministic checks read the same plan and constraint owner. |

## PRD

### Problem

An operator needs a compact way to block a scene, assign native motions, place
timed subject and camera marks, rehearse the same plan, and hand off an
unambiguous reference. Existing Graph XR features provide those capabilities,
but the product intent, boundary, and validation target need one owner document.

### Primary user and outcome

The primary user is an operator preparing a short scene in a mobile or desktop
browser. In one local session they choose an original environment, place and
label subjects, assign an available motion, create bounded marks, rehearse the
Timeline, and export the existing deterministic reference package.

### MVP scope

1. Keep the existing Editor Workspace and Canvas pane open, switch Canvas to
   XR Surface Mode, and select an original in-repository environment and
   subject catalog item.
2. Persist subject placement, labels, action assignments, cast marks, and
   camera marks through the canonical XR plan owner.
3. Rehearse through the existing Timeline transport and inspect the stage at a
   deterministic playhead instant.
4. Move selected subject or camera marks through the shared keyboard/pointer or
   existing browser-local control path; enforce stage, collision, and
   physics-ownership constraints.
5. Export the existing deterministic motion-reference package locally.
6. Inspect authored subjects and stage structures by category, proximity, or
   area, with the native playhead as the sample time.
7. Work through three guided checks: reach a cast mark, pass a stationary
   subject without collision, and align a camera mark to the cast ending.

### Out of scope

- Automatic understanding, reconstruction, or capture of a real-world space.
- Camera-derived identities, biometric inference, retained camera frames, or
  pose history.
- Hardware actuation, device synchronization, provider-specific generation,
  paid APIs, or network-required authoring.
- Video rendering, remote publication, billing, and deployment proof.

### Acceptance criteria

| ID | Given / when / then | Native verification target |
|---|---|---|
| CS-01 | Given an XR plan, when the operator places or labels a subject, then one normalized plan is persisted through the canonical graph metadata owner. | `xrChoreographyOwnership.test.tsx` |
| CS-02 | Given a selected cast mark, when keyboard or agent movement is requested, then the shared resolver applies the same bounded displacement or reports the constraint rejection. | `xrKeyboardChoreography.test.ts` |
| CS-03 | Given Timeline rehearsal, when playback, pause, or scrub occurs, then the Timeline remains the playhead authority and conflicting motion writes fail closed. | `xrTimelineRehearsalControls.test.tsx` and `xrAnimationRuntime.test.ts` |
| CS-04 | Given an unchanged valid plan, when it is exported twice, then the native package contract emits equivalent deterministic reference content. | `xrMotionReferencePackage.test.ts` |
| CS-05 | Given a browser-local agent control, when it invokes an existing XR action, then it reuses the guarded native owner and does not introduce a parallel write route. | Focused existing XR and agent-ready tests selected by affected validation. |
| CS-06 | Given an authored plan and playhead, when the operator or local agent inspects a category, nearest entity, or bounded area, then stable entity IDs and sampled positions come from the same revision; incomplete inventory and invalid queries fail explicitly. | `xrSceneSemantic.test.ts`; XR scene inspection contract. |
| CS-07 | Given two cast marks and a stationary obstacle, when the operator rehearses, then the three guided checks report setup, success, or constraint failure from the native plan and collision owner. | `xrSceneSemantic.test.ts`; existing motion-constraint tests. |
| CS-08 | Given a locally saved plan, when the operator reopens it without network access, then subjects, marks, the inspector, and deterministic export agree with the saved revision. | Browser save/reopen and offline proof pending at this change head. |

### Success signals

The MVP is useful when an operator can complete the seven-step local rehearsal
without leaving the browser or losing authored intent between panels. No demand,
revenue, performance, deployment, or production-usage claim is made until
separate recorded evidence exists.

## TAD

### Interaction flow

```mermaid
flowchart LR
  A[Select XR surface] --> B[Choose original stage and subjects]
  B --> C[Persist normalized plan]
  C --> D[Assign motion and timed marks]
  D --> E[Rehearse with shared Timeline]
  E --> F{Constraint and authority checks}
  F -->|accepted| G[Project stage and save]
  F -->|rejected| H[Return explicit local result]
  G --> I[Export deterministic reference package]
```

### Data and authority

`graphData.metadata.kgXrMotionReference` is the persisted plan boundary. The
Editor Workspace retains source-file and pane ownership; the XR inspector
stays in the existing Canvas/FloatingPanel surface. The XR draft runtime is a
bounded local projection; Timeline owns playhead state. The movement resolver
owns key normalization, bounds, collision, and
physics-ownership checks. Panels, pointer input, keyboard input, and guarded
browser-local controls must call these existing owners rather than duplicate
their rules.

The semantic scene is a read-only, bounded projection of the current XR
snapshot. Subject positions use the native cast-mark sampler at the Timeline
playhead; stage structures come from the selected in-repository stage. Queries
carry the scene revision and sample time. An inventory that exceeds its bound
must report partial coverage rather than imply a complete answer. The guided
checks keep no second lesson state or motion writer: each plan revision is
re-evaluated through the native motion-constraint owner.

The data model contains authored stage selection, subject catalog references,
labels, transforms, assigned action paths, cast marks, and camera marks. It
must not contain camera frames, camera-derived identities, live pose history,
or provider credentials.

### Failure behavior

| Condition | Required behavior |
|---|---|
| Malformed plan or mark | Normalize only supported values or reject before mutation. |
| Movement crosses a boundary, peer, or physics-owned body | Reject or clamp through the shared resolver and report the actual outcome. |
| Conflicting writer during Timeline playback | Retain Timeline authority and fail the competing write closed. |
| Browser-local control unavailable | Return an explicit unavailable/timeout result; do not substitute a remote write path. |
| Export cannot be compiled | Leave persisted plan unchanged and report the local error. |
| Invalid semantic query or incomplete stage inventory | Return an explicit failure with no complete-scene claim. |
| Exercise prerequisites absent | Show the missing mark, obstacle, or camera anchor; retain the authored plan. |

## ADR

### ADR-1: Keep the specification with the implementation owner

**Decision:** Store this editable Choreography Studio document in
`agentic-graph/docs/documents`.

**Why:** The actual source, tests, runtime contracts, and native browser
controls are maintained in Agentic Graph. A separate editable copy would drift
from those owners.

**Consequences:** A consumer-facing site may project an approved, versioned
artifact, and an archive may retain a non-editable historical record, but
neither becomes a second source of truth.

### ADR-2: Reuse the native XR plan and controls

**Decision:** Build the demo from the current XR Motion Reference, Timeline,
and existing guarded browser control seams.

**Why:** This preserves one plan model and one set of authority checks across
panels, interactions, and agent assistance.

**Consequences:** New functionality must extend the appropriate native owner;
it cannot add a competing timeline, persistence schema, or browser write path.

### ADR-3: Preserve a local, offline-capable MVP boundary

**Decision:** The initial demo remains browser-local and uses existing native
assets and local export only.

**Why:** The first useful rehearsal loop needs no hosted service, paid
inference, or runtime dependency.

**Consequences:** Remote collaboration, external execution, physical-space
automation, and publishing remain separate proposals with their own approval,
security, and deployment evidence.

### ADR-4: Project semantics and feedback from the native plan

**Decision:** Compute scene entities and guided exercise feedback from the
current XR plan, stage catalog, playhead, and existing motion constraints.

**Why:** The inspector, local agent read, and export can describe the same
authored scene without a second simulation or persistence format.

**Consequences:** The scene carries authored dimensions only. Offline
installation, save/reopen, any executable lesson bridge, and buyer value each
require their own evidence before readiness advances.

## MVP and GTM choreography

### Demo script

1. Open the existing Editor Workspace with Canvas visible, switch Canvas to XR
   Surface Mode, and select an original stage.
2. Place two or more catalog subjects and give them clear labels.
3. Assign an available motion and add cast and camera marks.
4. Use the shared keyboard/pointer path to adjust a selected mark; show a
   boundary or collision rejection when applicable.
5. Rehearse, pause, and scrub the Timeline while the stage reflects the same
   plan.
6. Save and export the deterministic local reference package.
7. Open the existing Animation FloatingPanel, inspect one subject category and
   its nearest authored object, and review the three rehearsal checks at a
   paused playhead.

### Readiness register

| Surface | State | Evidence boundary |
|---|---|---|
| Specification | `spec-complete` | This document names owner, scope, and acceptance criteria. |
| Native XR authoring | `implemented-in-part` | Existing modules listed in Source ownership. |
| Semantic inspection and guided checks | `implemented-in-part` | Local source implementation; exact-head tests and browser proof remain required. |
| Offline save/reopen | `unverified` | Installed-cache and disconnected browser proof pending. |
| Focused test evidence | `passed-source-only` | At combined head `7ac187b251820025a997fc36268f5e5c00b9a34f`, semantic/exercises, native inspector and agent save/reopen checks all passed; required affected/browser checks remain separate. |
| Protected integration | `undocumented` | Requires repository workflow receipts. |
| Deployment and market proof | `not-requested` | No deployment or commercial claim in this change. |

### GTM boundary

The first audience is the repository operator validating a local previs loop.
The first artifact is the deterministic reference package, not a hosted product
or a revenue claim. Any public projection must identify this source revision,
preserve the local-only boundary, and obtain its own release evidence.

## Validation plan

For this implementation change, run the repository’s affected validation and
check that every source path named above exists at the exact change head.
Before an implementation change is declared ready, rerun the focused tests for
CS-01 through CS-04 plus the applicable browser-control tests against that
implementation head. A passing local check is not protected integration,
deployment, or production evidence.

The first bounded sprint changes at most four source modules and 24 KiB of
source. Its minimum proof is the semantic/exercise test, native XR owner tests,
and a save/reopen browser run. A subsequent sprint may bind a Python learning
adapter only after its separate runtime owner has protected integration and
bounded execution proof. Demand, first payment, and deployment remain unknown.

## ADLC continuation checkpoint

2026-09-24: PR #1221 remains the immutable predecessor; native successor
`agent/device-0232231d4a19/choreography-closeout` reuses the same checkout and
seven-path reservation. It joined accepted XR PR #1222 main revision
`b3c11bd18196427d15259451663cd209389dcd1f` without conflicts. That repair passed
all five local affected stages and required Integration Gate run `35932570880`
at reviewed head `cdde018b81548ade09709231276381837a8051dc`; native desktop/mobile
MP4 evidence includes exact authored duration and endpoint under encoding delay.
The three Choreography focused checks passed again at combined head
`7ac187b251820025a997fc36268f5e5c00b9a34f`. This checkpoint is the only subsequent
source change before publication. Run the successor's native affected checks and
required exact-head Integration Gate, then retain integration and recoverable
cleanup receipts. Close predecessor PR #1221 only after successor integration.

Existing MainPanel, FloatingPanel and BottomPanel/Timeline remain the shared UI
owners. No deployment is requested. Source worktree closeout and the profile's
separate production-delivery state must be reported independently. Published
candidate bytes remain immutable; record post-publication outcomes in the
workspace `graph-end-adlc-20260924/prd-tad-adr-mvp-gtm-closeout-handover.md` and
native receipts before ending the turn. A later implementation must refresh
this editable source plan before its own publication.
