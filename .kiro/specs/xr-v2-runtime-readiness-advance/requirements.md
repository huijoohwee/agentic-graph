# Requirements Document

## Introduction

This increment advances the Knowgrph AR/VR/XR layer from its current mixed
posture to a defensible runtime-readiness posture for
`docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md` v3.0.0. It is
remediation-plus-extension work: three blockers currently make every downstream
claim unverifiable, four document/code divergences make the pinned contract
misleading, and one whole feature slice (Feature C, AC-13 through AC-17) is
specified but absent from the tree.

The work is Dev-only: no Prod mirror, Cloudflare, or release authority. All paths
are repository-relative or `$GITHUB_ROOT`-relative; no machine-specific absolute
path may appear in any authored artifact produced under this spec.

`requirements.md` is the normative requirements source of truth. The pinned
PRD/TAD/ADR remains the product-intent and architecture-decision authority;
`design.md` maps these requirements to repository owners and `tasks.md` sequences
delivery.

## Authority and scope

The XR v2 readiness gate treats the PRD/TAD/ADR as an immutable byte-pinned
requirements authority. Advancing the pin is therefore a coordinated
multi-surface change, not a constant edit.

**Correction to the intake brief**: the pin triple is duplicated across **nine**
authored surfaces, not three. Verified by direct inspection:

| # | Surface | Pinned values held |
|---|---|---|
| 1 | `scripts/xr-v2/readiness-doc-contract.mjs` | revision, blob, bytes, sha256 |
| 2 | `canvas/src/features/xr-v2/pinnedContractConformance.ts` | `XR_V2_PINNED_SOURCE_REVISION` |
| 3 | `canvas/src/features/xr-v2/xrV2InvocationRegistry.ts` | `XR_V2_PINNED_INVOCATION_SOURCE_REVISION` |
| 4 | `scripts/video-editor/clean-room-source-contract.mjs` | `PINNED_XR_AUTHORITY_BYTES`, `PINNED_XR_AUTHORITY_SHA256` |
| 5 | `docs/documents/knowgrph-xr-v2-runtime-readiness.md` | frontmatter triple + prose byte count |
| 6 | `docs/workspace-seeds/README.md` | revision, blob, sha256, version label |
| 7 | `docs/workspace-seeds/knowgrph-ar-vr-xr-runtime-readiness-demo.md` | version, commit, blob, sha256, immutable URL |
| 8 | `docs/TESTING.md` | revision, version label |
| 9 | `docs/runtime-api.md` | revision |

Generated build output under `canvas/dist/` also carries the values and is
excluded from the authored surface set.

The readiness rung vocabulary is closed: `undocumented`, `spec-complete`,
`dev-proven`, `runtime-ready`, `production-verified`. No requirement in this
document may introduce another rung token.

All implementation, prose, schemas, fixtures, and assets for this increment
must be source-authored for Knowgrph and may use only existing
repository-owned runtime dependencies. Introducing a new third-party runtime
dependency requires an explicit ADR under this spec.

## Glossary

- **Pinned_Document**: `docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md`, the byte-pinned immutable requirements authority.
- **Pin_Triple**: the tuple (source revision, Git blob SHA-1, byte length, content SHA-256) identifying one exact Pinned_Document revision.
- **Pin_Surface_Set**: the nine authored surfaces enumerated in Authority and scope that hold any Pin_Triple member.
- **Readiness_Doc_Contract**: `scripts/xr-v2/readiness-doc-contract.mjs`; its `verifyXrV2ReadinessDocumentation` enforces the pin and the evidence-document marker set.
- **Pinned_Conformance_Module**: `canvas/src/features/xr-v2/pinnedContractConformance.ts`, owner of the criterion identifier union, `CRITERION_IDS`, the frozen `acceptanceLedger`, and the runtime-observation record.
- **Browser_Smoke_Contract**: `scripts/xr-v2/browser-smoke-contract.mjs`, browser-side assertion owner for the acceptance ledger.
- **Workspace_Seed_Authority**: `scripts/workspace-seed-authority.mjs`, which asserts the seed frontmatter carries the exact criterion ledger.
- **Evidence_Document**: `docs/documents/knowgrph-xr-v2-runtime-readiness.md`.
- **Pin_Consistency_Checker**: a new repository-owned check proving every Pin_Surface_Set member agrees on one Pin_Triple.
- **Canonical_Restoration_Procedure**: the operator-run sequence moving uncommitted canonical `main` authoring into one admitted `agent/<device>/<semantic-scope>` task lane under `$GITHUB_ROOT/agentic-canvas-os/docs/START-WORKFLOW.md`.
- **Rapier_Independence_Boundary**: `scripts/lib/rapier-independence-boundary.mjs`, which rejects any `@dimforge/rapier*` dependency reference repository-wide and any case-insensitive `rapier` substring under `canvas/src/features/physics`.
- **Native_Physics_Solvers**: `canvas/src/features/physics/spatialPhysicsEngine.ts` and `canvas/src/features/physics/planarPhysicsEngine.ts`.
- **Physics_Component**: the ECS-attachable rigid-body component required by AC-13, backed by Native_Physics_Solvers.
- **Collision_Event_Bridge**: the owner routing contact events into the existing behavior dispatcher, required by AC-14.
- **Spatial_Audio_Component**: the positional-audio component required by AC-15.
- **Portal_Component**: the stencil-plus-render-target portal owner required by AC-16 under ADR-12.
- **Interaction_Component**: the unified pointer/touch/hand-tracking input component required by AC-17.
- **Rung_Vocabulary_Validator**: `scripts/check-storage-docs-runtime.mjs`, which enforces the closed rung vocabulary over its declared document paths.
- **Property_Suite**: the property-based test set introduced by this increment.
- **Runtime_Observation**: one of the eight named observation keys in Pinned_Conformance_Module (`liveDepthModel`, `referenceFrameBudget`, `physicalDeviceMatrix`, `progressiveViewerMatrix`, `mountedEcsRendering`, `compiledShaderMeshRender`, `trackPreservingContainerMux`, `connectedPreviewTransport`).

---

## Requirements

### Requirement 1: Canonical-lane restoration

**User Story:** As a solo operator, I want the uncommitted v3.0.0 PRD bytes moved
out of canonical `main` into one admitted task lane, so that canonical runtime
and mutation stop reporting `blocked-canonical`.

#### Acceptance Criteria

1. THE Canonical_Restoration_Procedure SHALL preserve the working-tree
   Pinned_Document content byte-for-byte, such that the restored content in the
   admitted task lane has content SHA-256
   `8f0839fea7a30b9714ab7d8a46ffb1073fa54144257ee746977f96ae7969b12f` and byte
   length 107090.
2. THE Canonical_Restoration_Procedure SHALL bind the preserved bytes to exactly
   one registered `agent/<device>/<semantic-scope>` task worktree with one
   unexpired writer lease, one recorded lease epoch, and one recorded fence
   revision.
3. IF any step of the Canonical_Restoration_Procedure would delete, stash,
   ignore-mask, relocate outside the admitted task lane, or adopt the preserved
   bytes under another session, THEN THE Canonical_Restoration_Procedure SHALL
   halt and report the attempted operation as a blocking failure.
4. WHEN the Canonical_Restoration_Procedure completes, THE canonical `knowgrph`
   `main` worktree SHALL report a clean status equal to fetched `origin/main`.
5. WHEN the Canonical_Restoration_Procedure completes, THE
   Canonical_Restoration_Procedure SHALL record an Overlap Preservation Receipt
   naming the physical owning worktree, semantic scope, writer session, lease
   epoch, branch, and pull request.
6. THE Canonical_Restoration_Procedure SHALL record the restoration outcome
   without granting release, Prod mirror, Cloudflare, or force-push authority.

---

### Requirement 2: ADR-11 physics contradiction resolution

**User Story:** As a solo operator, I want the ADR-11 physics decision
reconciled against the enforced repository boundary, so that Feature C can be
built without breaking an existing green gate.

#### Acceptance Criteria

1. THE ADR-11 resolution SHALL record a read-derived finding for the separate
   FPS/MMORPG PRD/TAD stating whether that document selects a third-party WASM
   physics engine, citing the exact document path and heading.
2. WHERE the recorded finding shows the FPS/MMORPG PRD/TAD does not select a
   third-party WASM physics engine, THE ADR-11 resolution SHALL restate ADR-11's
   Decision to Native_Physics_Solvers and correct the false premise sentence
   asserting the engine is already the established choice per ADR-10.
3. WHERE the recorded finding shows the FPS/MMORPG PRD/TAD does select a
   third-party WASM physics engine, THE ADR-11 resolution SHALL open an explicit
   gate-exception review naming Rapier_Independence_Boundary,
   `scripts/check-game-flight-sim-readiness.mjs`, and the affected npm targets,
   and SHALL leave both documents unamended until that review records a decision.
4. WHEN the ADR-11 resolution amends ADR-11, THE amended ADR-11 SHALL carry a
   Status value consistent with the recorded finding, and SHALL carry a
   Superseded-by or Amended-on line naming this spec.
5. WHEN the ADR-11 resolution lands, THE repository SHALL pass
   `npm run native-physics:check` and `npm run game-flight-sim:runtime-ready`.
6. THE ADR-11 resolution SHALL keep every authored file free of any
   `@dimforge/rapier` dependency reference and keep every file under
   `canvas/src/features/physics` free of the case-insensitive substring
   `rapier`.
7. THE ADR-11 resolution SHALL record the outstanding ADR-10 cross-document
   action item state, naming the custom root `ecs/` workspace as the in-repo
   scene model and the FPS/MMORPG PRD/TAD amendment as unperformed or performed.

---

### Requirement 3: Atomic pin advance across the Pin_Surface_Set

**User Story:** As a solo operator, I want the pin advanced to the v3.0.0
revision in one atomic change, so that the XR readiness gate stops failing on
byte drift.

#### Acceptance Criteria

1. THE pin advance SHALL derive the new Pin_Triple from the committed
   Pinned_Document revision produced by Requirement 1, using the recorded commit
   SHA, Git blob SHA-1, byte length, and content SHA-256.
2. WHILE the Pinned_Document bytes remain uncommitted, THE pin advance SHALL
   report a blocked state and SHALL leave every Pin_Surface_Set member unchanged.
3. WHEN the pin advance lands, THE Pin_Surface_Set SHALL hold exactly one
   Pin_Triple, with every member's revision, blob, byte-length, and SHA-256
   value matching the derived Pin_Triple.
4. WHEN the pin advance lands, THE Evidence_Document prose SHALL state the new
   byte length and the new revision, and its frontmatter
   `pinned_source_revision`, `pinned_source_blob`, and `pinned_source_sha256`
   SHALL match the derived Pin_Triple.
5. WHEN the pin advance lands, THE pin advance SHALL update the version label on
   every Pin_Surface_Set member that names a Pinned_Document version, from
   `2.0.0` to `3.0.0`.
6. WHEN the pin advance lands, THE repository SHALL pass
   `npm run xr-v2:source-ready`, `npm run xr-v2:review-candidate`, and
   `npm run xr-v2:review-ready`.
7. IF any Pin_Surface_Set member is updated without the others in the same
   change, THEN THE Pin_Consistency_Checker SHALL fail and name every
   disagreeing surface path and value.
8. THE pin advance SHALL leave every marker in
   Readiness_Doc_Contract's forbidden misleading marker set absent from every
   evidence document.

---

### Requirement 4: Pin duplication reduction and authoring-time drift detection

**User Story:** As a solo operator, I want pin drift detected at authoring time,
so that the next PRD revision does not silently re-break the gate.

#### Acceptance Criteria

1. THE Pin_Consistency_Checker SHALL read every Pin_Surface_Set member and
   report the observed Pin_Triple per surface path.
2. IF two or more Pin_Surface_Set members report different Pin_Triple values,
   THEN THE Pin_Consistency_Checker SHALL exit with a non-zero status and name
   every disagreeing surface path, expected value, and observed value.
3. IF the Pinned_Document working-tree bytes differ from the Pin_Triple held by
   the Pin_Surface_Set, THEN THE Pin_Consistency_Checker SHALL report the drift,
   the observed byte length, and the observed content SHA-256.
4. WHERE two or more authored surfaces hold the same literal Pin_Triple member,
   THE pin duplication reduction SHALL reduce that count to at most two by having
   every other surface import or read the value from a single owning module.
5. WHERE exactly one authored surface holds a given Pin_Triple member, THE pin
   duplication reduction SHALL leave that surface in place unchanged.
6. WHERE a documentation surface cannot import a value, THE
   Pin_Consistency_Checker SHALL cover that surface by text assertion against
   the single owning module.
7. THE Pin_Consistency_Checker SHALL run as part of an existing repository check
   target, and SHALL complete with zero model calls and zero paid calls.

---

### Requirement 5: ADR reference-implementation reconciliation

**User Story:** As a solo operator, I want the ADR reference implementations to
describe what was actually built, so that the pinned contract stops overstating
its dependency and license exposure.

#### Acceptance Criteria

1. THE ADR reconciliation SHALL restate ADR-1, ADR-5, ADR-6, ADR-8, and ADR-9 to
   name the in-repo implementation owner that exists in the tree, and SHALL
   record that the previously named third-party package is absent from every
   repository `package.json` and lockfile.
2. THE ADR reconciliation SHALL name `canvas/src/features/xr-v2/materialGraph.ts`
   and `canvas/src/features/xr-v2/behaviorDispatcher.ts` as the ADR-5 owners,
   `canvas/src/features/xr-v2/particleEmitter.ts` as the ADR-6 owner, and
   `canvas/src/features/xr-v2/timelineInterpolation.ts` and
   `canvas/src/features/xr-v2/timelineSequencer.ts` as the ADR-8 owners.
3. THE ADR reconciliation SHALL narrow ADR-7's container decision to the WebM
   owners `canvas/src/features/xr-v2/webmEncodedTrackMuxer.ts` and
   `canvas/src/features/xr-v2/encodedTrackMuxContracts.ts` with the `vp8` and
   `vp9` codecs, and SHALL record any MP4 box writer as explicit future work
   with its own exit criterion.
4. THE ADR reconciliation SHALL record that
   `canvas/src/features/xr-v2/mediaCapabilityNegotiation.ts` references an MP4
   MIME candidate for media-recorder negotiation only, and that no MP4 box
   writer exists in the repository.
5. WHEN the ADR reconciliation lands, THE Part VII checklist item requiring
   license re-verification for the packages named in ADR-5, ADR-6, and ADR-8
   SHALL be retired with a stated reason that those packages are absent from the
   dependency tree.
6. WHEN the ADR reconciliation lands, THE Part VII checklist SHALL carry a
   dependency and license risk statement consistent with the reconciled ADR set.
7. THE ADR reconciliation SHALL leave ADR-2, ADR-3, and ADR-4 unchanged, and
   SHALL record each as verified against its in-repo owner.

---

### Requirement 6: Rung-vocabulary consistency

**User Story:** As a solo operator, I want one closed rung vocabulary across the
XR document family, so that readiness claims are comparable across documents.

#### Acceptance Criteria

1. THE rung reconciliation SHALL replace the `browser-demo-ready` value in the
   Evidence_Document `local_rung` field with one member of the closed vocabulary
   `undocumented`, `spec-complete`, `dev-proven`, `runtime-ready`,
   `production-verified`.
2. THE rung reconciliation SHALL replace every `browser-demo-ready` occurrence in
   `docs/workspace-seeds/README.md` and every workspace-seed document with a
   closed-vocabulary member or with a separately named evidence-state token that
   is not a rung field value.
3. THE rung reconciliation SHALL record a decision on whether
   Rung_Vocabulary_Validator's document path set extends to the XR document
   family, with a stated reason for the chosen scope.
4. WHERE Rung_Vocabulary_Validator's document path set is extended, THE
   Rung_Vocabulary_Validator SHALL exit non-zero for any rung field value outside
   the closed vocabulary in a covered document, and SHALL name the document path
   and offending value.
5. THE rung reconciliation SHALL keep the Evidence_Document free of every marker
   in Readiness_Doc_Contract's forbidden misleading marker set, including
   `local_rung: "runtime-ready"` and `runtime-ready-dev`.
6. WHILE the rung reconciliation is in progress, THE increment SHALL admit a
   failing `npm run xr-v2:source-ready` result without blocking the remaining
   reconciliation steps.
7. WHEN the rung reconciliation completes, THE increment SHALL record the
   `npm run xr-v2:source-ready` result, and SHALL treat a failing result as a
   recorded blocker on the rung claim rather than on reconciliation completion.

---

### Requirement 7: AC-1 through AC-12 runtime-observation closure

**User Story:** As a solo operator, I want each of the eight hardcoded
`not-observed` Runtime_Observation values either genuinely observed or formally
scoped out, so that the acceptance ledger reflects real evidence.

#### Acceptance Criteria

1. THE Runtime_Observation closure SHALL classify each of the eight
   Runtime_Observation keys as `observed`, `deferred-hardware`, or
   `deferred-external`, with a stated reason and a named evidence artifact path
   per key.
2. WHERE a Runtime_Observation key is classified `observed`, THE
   Pinned_Conformance_Module SHALL admit a value other than `not-observed` for
   that key, and its validator SHALL accept that value without reporting
   `runtime-observation-overreach`.
3. WHERE a Runtime_Observation key is classified `deferred-hardware` or
   `deferred-external`, THE Runtime_Observation closure SHALL record the exact
   external evidence required and the device or environment that would produce
   it.
4. THE Runtime_Observation closure SHALL supply deterministic evidence for AC-11
   through the WebM muxer owners, such that the AC-11 ledger entry carries at
   least one deterministic evidence key.
5. WHEN every AC-1 through AC-12 entry carries at least one deterministic
   evidence key, THE Pinned_Conformance_Module SHALL report an `overall` value
   derived from the ledger rather than a frozen literal, independent of the
   Runtime_Observation classification state of any individual key.
6. IF a Runtime_Observation value is admitted without a named evidence artifact
   path, THEN THE Pinned_Conformance_Module validator SHALL reject the evidence
   envelope and report `runtime-observation-overreach`.
7. THE Runtime_Observation closure SHALL keep the AC-1 through AC-12 criterion
   identifiers and their order unchanged.

---

### Requirement 8: Acceptance ledger extension to AC-13 through AC-17

**User Story:** As a solo operator, I want the pinned acceptance ledger widened
to the Feature C criteria, so that AC-13 through AC-17 can carry evidence
instead of being invisible to every gate.

#### Acceptance Criteria

1. THE ledger extension SHALL widen the Pinned_Conformance_Module criterion
   identifier union to `AC-1` through `AC-17`, SHALL set `CRITERION_IDS` to
   length 17, and SHALL return 17 entries from `acceptanceLedger`.
2. THE ledger extension SHALL widen Browser_Smoke_Contract's expected criteria
   list to the same 17 entries in the same order.
3. THE ledger extension SHALL widen Workspace_Seed_Authority's required
   `acceptance_criteria` identifier list to `AC-1` through `AC-17`, and SHALL
   update its failure message to name the widened ledger.
4. WHEN the ledger extension lands, THE Pinned_Conformance_Module,
   Browser_Smoke_Contract, and Workspace_Seed_Authority SHALL agree on the
   criterion identifier set, order, and count.
5. IF one of the three surfaces reports a criterion set that differs from the
   others, THEN the repository check SHALL exit non-zero and name the
   disagreeing surface path and criterion identifier.
6. THE ledger extension SHALL add a Runtime_Observation key per Feature C
   criterion that requires runtime proof, and SHALL classify each key under
   Requirement 7's classification rule.
7. THE ledger extension SHALL land after Requirements 1, 2, 3, and 5 have landed.

---

### Requirement 9: Physics Component with joints (AC-13)

**User Story:** As a solo builder, I want entities to carry rigid-body physics
with mass, forces, and joints, so that I can prototype game mechanics without a
native engine.

#### Acceptance Criteria

1. THE Physics_Component SHALL attach to an ECS entity through the root `ecs/`
   workspace component registration path, and SHALL be queryable by component
   type.
2. WHEN the simulation advances by a fixed step, THE Physics_Component SHALL
   update entity position and velocity through Native_Physics_Solvers using the
   configured `fixedStepSeconds` and `maxSubSteps` values.
3. WHERE a joint or articulation constraint is configured, THE
   Physics_Component SHALL keep the constrained relative motion within the
   declared joint limits for every simulation step.
4. IF a Physics_Component configuration declares a joint limit range whose lower
   bound exceeds its upper bound, THEN THE Physics_Component SHALL reject the
   configuration and report a typed validation error.
5. WHEN a reference rigid body advances N steps under a known constant force,
   THE Physics_Component SHALL report a position within the declared tolerance
   of the analytic expected position.
6. THE Physics_Component SHALL keep every authored file under
   `canvas/src/features/physics` free of the case-insensitive substring
   `rapier`.

---

### Requirement 10: Collision event to behavior bridge (AC-14)

**User Story:** As a solo builder, I want contact events to drive the existing
behavior graph, so that physics interactions trigger authored behaviors without
glue code.

#### Acceptance Criteria

1. WHEN contact begins between two entities carrying a Physics_Component, THE
   Collision_Event_Bridge SHALL dispatch exactly one collision-begin event for
   that contact pair.
2. WHERE a behavior trigger node is bound to a contact pair, THE
   Collision_Event_Bridge SHALL invoke the bound action exactly once per
   collision-begin event through the existing exact-once behavior dispatcher.
3. WHERE no behavior trigger node is bound to a contact pair, THE
   Collision_Event_Bridge SHALL dispatch the collision-begin event and SHALL
   invoke zero actions.
4. WHEN a collision-begin event is replayed with the same event identity and
   revision, THE Collision_Event_Bridge SHALL report a stale dispatch and SHALL
   invoke zero additional actions.
5. WHEN contact ends between two entities, THE Collision_Event_Bridge SHALL
   dispatch exactly one collision-end event for that contact pair.
6. THE Collision_Event_Bridge SHALL consume `SpatialPhysicsEvent` contact events
   from Native_Physics_Solvers as its only contact source.

---

### Requirement 11: Spatial Audio Component (AC-15)

**User Story:** As a solo builder, I want entities to emit positional audio, so
that I do not need a native spatial-audio framework.

#### Acceptance Criteria

1. THE Spatial_Audio_Component SHALL attach to an ECS entity and SHALL expose
   source position, listener position, reference distance, and rolloff as typed
   configuration.
2. WHEN the listener distance from the source entity increases along a fixed
   bearing, THE Spatial_Audio_Component SHALL report a monotonically
   non-increasing gain value.
3. WHEN the listener bearing relative to the source entity sweeps from one side
   to the other at constant distance, THE Spatial_Audio_Component SHALL report a
   monotonically changing pan value.
4. THE Spatial_Audio_Component SHALL create its browser audio graph on an
   explicit user action, and SHALL release every audio node on entity detach,
   hidden document visibility, `pagehide`, and unmount.
5. IF the browser exposes no positional-audio capability, THEN THE
   Spatial_Audio_Component SHALL activate its silent fallback state, SHALL record
   the unsupported capability in its typed diagnostic output only, and SHALL
   leave the scene renderable without presenting a user-facing notification.
6. THE Spatial_Audio_Component SHALL keep every audio sample free of any
   network-egress path.

---

### Requirement 12: Portal Component (AC-16)

**User Story:** As a solo builder, I want to render a portal showing another
scene through a masked opening, so that I do not need a native portal framework.

#### Acceptance Criteria

1. THE Portal_Component SHALL render its masked region through a stencil-buffer
   mask combined with a second render-target pass for the target-scene camera,
   per ADR-12.
2. WHEN a Portal_Component is in view, THE Portal_Component SHALL sample pixels
   inside the mask boundary from the target scene's render target and pixels
   outside the mask boundary from the primary scene.
3. THE Portal_Component SHALL require a rendering context created with the
   stencil buffer enabled, and SHALL report a typed unsupported state when the
   context reports `stencil` as disabled.
4. WHERE more Portal_Component instances are visible than the configured
   visible-portal ceiling, THE Portal_Component SHALL render the instances up to
   that ceiling and SHALL report the deferred instance count.
5. IF a Portal_Component declares itself as its own target scene, THEN THE
   Portal_Component SHALL reject the configuration and report a typed validation
   error.
6. THE Portal_Component SHALL treat nested and recursive portals as out of scope
   for this increment and SHALL record that exclusion in its owner
   documentation.

---

### Requirement 13: Interaction Component (AC-17)

**User Story:** As a solo builder, I want one hover and interaction input model
across mouse, touch, and hand tracking, so that I do not write per-platform
input handling.

#### Acceptance Criteria

1. THE Interaction_Component SHALL attach to an ECS entity and SHALL expose one
   typed interaction event set covering hover-enter, hover-exit, select-begin,
   and select-end.
2. WHEN an input source of kind pointer, touch, or hand-tracking targets an
   entity carrying an Interaction_Component, THE Interaction_Component SHALL emit
   the same typed interaction event set regardless of the input source kind.
3. WHILE an entity is hovered by exactly one input source, THE
   Interaction_Component SHALL report exactly one active hover state for that
   entity.
4. WHEN two input sources target the same entity, THE Interaction_Component
   SHALL report one hover state per input source identity and SHALL emit one
   hover-exit event per source when that source stops targeting the entity.
5. IF an input source reports a target entity identifier that is absent from the
   ECS world, THEN THE Interaction_Component SHALL discard the event and report
   a typed unresolved-target diagnostic.
6. THE Interaction_Component SHALL route its select events through the existing
   behavior dispatcher rather than a parallel dispatch path.

---

### Requirement 14: Property-based correctness verification

**User Story:** As a solo operator, I want the invariant-bearing owners covered
by property-based tests, so that edge cases are found by generated input rather
than by hand-picked examples.

#### Acceptance Criteria

1. THE Property_Suite SHALL prove that capability-tier resolution returns exactly
   one member of the closed four-tier enum for every generated device-feature
   matrix.
2. THE Property_Suite SHALL prove that capability-tier resolution returns neither
   `webxr-ar` nor `webxr-vr` for any generated matrix carrying a negative
   platform constraint.
3. THE Property_Suite SHALL prove that every generated progressive-viewer
   degradation chain terminates at `flat-fallback` and contains at most
   `XR_V2_MAX_PROGRESSIVE_VIEWER_ATTEMPTS` attempts.
4. THE Property_Suite SHALL prove that behavior dispatch invokes each wired
   action exactly once across any generated sequence containing replays of the
   same event identity and revision.
5. THE Property_Suite SHALL prove that particle count stays at or below the
   configured ceiling for every generated rate, lifetime, and step sequence.
6. THE Property_Suite SHALL prove that an ECS component-type query returns no
   duplicate entity identifier for every generated entity and component set.
7. THE Property_Suite SHALL prove that muxing preserves input track count and
   codec identity for every generated encoded-track set, and that parsing the
   produced container then re-serializing it yields an equivalent track
   inventory.
8. THE Property_Suite SHALL prove that a configured joint keeps constrained
   relative motion within its declared limits across every generated force and
   step sequence.
9. THE Property_Suite SHALL prove that the Pin_Surface_Set reports one identical
   Pin_Triple for every generated surface read order.
10. THE Property_Suite SHALL run with mocked external boundaries so that no
    generated case performs a paid call or a network request.

---

### Requirement 15: Gate ordering and prerequisite sequencing

**User Story:** As a solo operator, I want the blocked prerequisites enforced as
an ordering constraint, so that no downstream claim is recorded while the gate is
red.

#### Acceptance Criteria

1. WHILE `npm run xr-v2:source-ready` reports a failure, THE increment SHALL
   record every requirement other than Requirements 1, 2, 3, and 4 as
   unverifiable.
2. WHILE the canonical `knowgrph` `main` worktree reports a state other than
   clean and equal to fetched `origin/main`, THE increment SHALL record canonical
   runtime and canonical mutation as blocked.
3. THE increment SHALL sequence Requirement 1 before Requirement 3, because the
   Pin_Triple can be derived only from a committed Pinned_Document revision.
4. THE increment SHALL sequence Requirements 1, 2, 3, and 5 before Requirement 8
   and before Requirements 9 through 13.
5. WHEN Requirements 1, 2, 3, and 4 have landed, THE repository SHALL pass
   `npm run xr-v2:source-ready`, `npm run xr-v2:review-candidate`,
   `npm run xr-v2:review-ready`, `npm run native-physics:check`, and
   `npm run game-flight-sim:runtime-ready`.
6. THE increment SHALL keep every authored file below 600 lines.
7. THE increment SHALL keep every authored artifact free of machine-specific
   absolute paths, resolving locations from `$GITHUB_ROOT` or the repository
   root.

---

### Requirement 16: Readiness claim discipline

**User Story:** As a solo operator, I want readiness claims bounded to the
evidence that exists, so that no document asserts a rung the repository has not
proven.

#### Acceptance Criteria

1. THE increment SHALL record one rung value per workstream in the Pinned_Document
   Readiness Gap Matrix, drawn only from the closed rung vocabulary.
2. WHERE a workstream carries a `deferred-hardware` or `deferred-external`
   Runtime_Observation, THE increment SHALL record its delivered rung as
   `dev-proven` at most.
3. THE increment SHALL record `production-verified` for no workstream, because
   the deploy boundary for this increment is Dev-only.
4. WHEN a readiness claim is recorded, THE increment SHALL name the evidence
   artifact path and the command that produced it.
5. IF a readiness claim names no evidence artifact path, THEN the repository
   check SHALL exit non-zero and report the unsupported claim.
6. THE increment SHALL resolve every `/`, `#`, and `@` invocation token used in
   its authored artifacts through the
   `$GITHUB_ROOT/agentic-canvas-os/docs` dictionaries only.

---

## Open questions

These are tracked, not resolved, and are expected inputs to `design.md`:

1. Which device or environment can produce the `physicalDeviceMatrix`
   observation, and is that hardware available to the solo operator? If not, the
   key is `deferred-hardware` permanently for this increment.
2. What frame-time threshold in milliseconds triggers the live to post-process
   fallback, and is it device-class-tunable or a single constant? Open in the
   Pinned_Document, and it parameterizes AC-3's exact test value.
3. What live-preview propagation latency ceiling parameterizes AC-12's bound?
4. What fixed timestep value parameterizes AC-13's simulation step?
5. Which single module should own the Pin_Triple after Requirement 4's
   deduplication, given that both a script-side and a canvas-side consumer exist?
6. Should the FPS/MMORPG PRD/TAD amendment tracked under ADR-10 land inside this
   spec or as a separate spec, given it mutates a document this spec does not own?
7. Does the closed-vocabulary validator's document path extension belong to this
   spec or to the storage-docs owner that currently owns that validator?
8. Should AC-13 through AC-17 gain their own evidence document, or extend the
   existing Evidence_Document within its 600-line ceiling?
