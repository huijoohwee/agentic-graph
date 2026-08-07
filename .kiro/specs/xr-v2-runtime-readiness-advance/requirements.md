# XR v2 Runtime-Readiness Recovery Requirements

## Authority

This repository-tracked Kiro package is the normative plan for correcting
`docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md` and implementing one bounded
runtime increment: AC-14 collision-to-behavior dispatch.

Task declaration:

- Action: `/change`
- Scope: `#xr.v2.runtime-readiness-recovery`
- Actor: `@codex-xr-v2-runtime-readiness-recovery-20260808`
- Base: `9abc08dcab2597ab05901e27cf0ab9ac37c11c33`

The work is Dev-only. It grants no Prod mirror, Cloudflare, deployment,
protected-merge, or release authority. Authored files use repository-relative
paths and introduce no machine-specific path.

## Recovered authority

The recovered pre-correction ADR bytes are historical preservation evidence:

- Byte length: `107090`
- SHA-256: `8f0839fea7a30b9714ab7d8a46ffb1073fa54144257ee746977f96ae7969b12f`

That digest MUST NOT become a target pin. It identifies the malformed recovered
input only. The future pin source is the final committed, corrected ADR. Until
that revision exists, every current pin surface remains unchanged.

The authored pin surface set contains:

1. `scripts/xr-v2/readiness-doc-contract.mjs`
2. `canvas/src/features/xr-v2/pinnedContractConformance.ts`
3. `canvas/src/features/xr-v2/xrV2InvocationRegistry.ts`
4. `scripts/video-editor/clean-room-source-contract.mjs`
5. `docs/documents/knowgrph-xr-v2-runtime-readiness.md`
6. `docs/workspace-seeds/README.md`
7. `docs/workspace-seeds/knowgrph-ar-vr-xr-runtime-readiness-demo.md`
8. `docs/TESTING.md`
9. `docs/runtime-api.md`

## Canonical owners

- Native spatial physics:
  `canvas/src/features/physics/spatialPhysicsEngine.ts` and sibling physics
  modules.
- XR physics model, adapter, and runtime:
  `canvas/src/features/three/xrPhysicsModel.ts`,
  `xrSpatialPhysicsAdapter.ts`, and `xrPhysicsRuntime.ts`.
- Existing behavior dispatch:
  `canvas/src/features/xr-v2/behaviorDispatcher.ts`.
- Existing XR invocation grammar:
  `canvas/src/features/three/xrSceneMcpContract.mjs` and
  `xrSceneMcpRuntime.ts`.
- Agentic ECS:
  root `ecs/`; it remains independent of the XR renderer and physics owner.
- Sole Three/R3F renderer and camera:
  `canvas/src/lib/three/ThreeGraph.impl.tsx`.
- HTML viewer runtime:
  `canvas/src/lib/graph/htmlViewer/runtimeTemplate.ts`.
- Apple device-sensor input:
  `packages/apple-spatial-input`; it is not a hand-ray target adapter.

## Requirements

### Requirement 1: Preserve recovery evidence without pinning it

1. The lane SHALL preserve the recovered ADR bytes in Git staging until the
   owner chooses a commit action.
2. The correction SHALL restore valid opening YAML frontmatter.
3. The correction SHALL retain the recovered digest only as historical
   evidence and SHALL NOT copy it into any target pin.
4. No task SHALL stash, reset, replace, or delete the preserved lane.

### Requirement 2: Correct the ADR ownership record

1. ADR-10 SHALL state that root `ecs/` is the existing agentic ECS owner and
   SHALL forbid a second ECS or renderer/physics ownership transfer.
2. ADR-10 SHALL reflect the numeric-only field types and atomic entity
   allocation contract instead of proposing unsupported `string` or
   `float64` component fields.
3. ADR-11 SHALL select the existing in-repo TypeScript spatial-physics owner,
   with no external engine, WASM bundle, alias, or compatibility layer.
4. ADR-11 SHALL state that the current engine supports fixed stepping,
   impulses, collision/sensor transitions, queries, and snapshots, but not
   force accumulation, 3D angular state, or joints.
5. ADR-12 SHALL remain proposed. It SHALL name the sole renderer/camera and
   actual HTML viewer path and SHALL NOT treat a plan as AC-16 pixel evidence.
6. The invocation register SHALL reuse `/xr.physics @canvas` with
   `#world`, `#body`, `#impulse`, and `#controller`. It SHALL retire the
   duplicate `/xr.simulate`, `#physics-world`, and
   `@xr-physics-contract` claims.

### Requirement 3: Pin only the final corrected revision

1. While the corrected ADR is uncommitted, the pin operation SHALL report
   blocked and SHALL leave all nine pin surfaces unchanged.
2. After an owner commits the final corrected ADR, the pin operation SHALL
   derive the source revision, Git blob, byte length, and SHA-256 from that
   exact commit.
3. One change SHALL update all affected pin surfaces and prove that they agree.
4. A pin checker SHALL fail closed and name every disagreeing path and value.
5. Generated build output SHALL NOT become an authored pin owner.

### Requirement 4: Preserve native physics events

1. The XR physics adapter SHALL return the `SpatialPhysicsEvent` values it
   drains after each fixed step instead of discarding them.
2. The adapter SHALL preserve `collision-began`, `collision-ended`,
   `sensor-began`, and `sensor-ended` without changing their physics
   meaning.
3. AC-14 SHALL consume collision transitions only. Sensor transitions SHALL
   remain a separate proximity path and SHALL NOT be reclassified.
4. Existing body snapshots, contact counts, pause/reset behavior, and
   `/xr.physics` controls SHALL remain compatible without an alias layer.

### Requirement 5: Route AC-14 through the existing dispatcher

1. The canonical `BehaviorTrigger` union SHALL gain only
   `collision-begin` and `collision-end` for this increment.
2. A single collision bridge SHALL map native
   `collision-began`/`collision-ended` transitions to those triggers.
3. The bridge SHALL sort the collider pair lexically before creating its replay
   identity, independent of source ordering.
4. The bridge SHALL resolve an admitted pair to at most one numeric
   `sourceEntityId`; an unresolved or unbound pair SHALL invoke zero actions.
5. The bridge SHALL dispatch through `createExactOnceBehaviorDispatcher`
   only and SHALL allocate the next monotonic dispatcher revision.
6. A repeated native transition SHALL not invoke an action twice.
7. Replay state SHALL be bounded to 4096 admitted identities by default, with
   only a smaller positive construction-time limit permitted. Capacity
   exhaustion SHALL fail closed with a typed result and SHALL NOT evict an
   identity that could permit replay.
8. Event identifiers SHALL satisfy the dispatcher's safe-ID contract and SHALL
   not expose raw internal collider paths.
9. N:N pair binding, networked replay, sensor-to-proximity routing changes, and
   a second event bus are outside this increment.

### Requirement 6: Keep AC-13, AC-15, AC-16, and AC-17 honest

1. AC-13 force accumulation and joints SHALL remain `undocumented` until a
   separate design supplies the missing angular state and solver semantics.
2. AC-15 SHALL remain `undocumented` until a user-gesture, audio lifecycle,
   active-listener, offline, and cleanup design is implemented and proved.
3. AC-16 SHALL remain `undocumented` until the sole renderer owner produces
   actual masked-region pixels and browser evidence.
4. AC-17 SHALL remain `undocumented` until pointer/touch adapters and an
   actual hand-ray target source exist. Apple device sensors SHALL not be
   relabeled as hand rays.
5. Evidence for AC-14 SHALL NOT advance any of AC-13, AC-15, AC-16, or AC-17.

### Requirement 7: Evidence and readiness discipline

1. Documentation correction alone SHALL claim no runtime readiness.
2. AC-14 implementation SHALL have focused unit tests for begin/end mapping,
   lexical pair normalization, exact-once replay, unbound no-op, invalid
   input, sensor exclusion, and bounded-capacity failure.
3. Existing XR physics and behavior-dispatch tests SHALL pass without
   regression.
4. Source-ready and browser-smoke evidence SHALL be bound to the exact
   candidate revision before any local rung advances.
5. Xcode, visionOS Simulator, Safari, and physical-device verification remain
   separate evidence gates; absent proof SHALL be reported as absent.
6. Production verification requires the protected release workflow and cannot
   be inferred from Dev tests.

### Requirement 8: Hygiene and economics

1. The implementation SHALL add no runtime dependency, external service,
   hosted model call, token spend, storage class, or network egress.
2. The change SHALL contain no machine-specific path, stale duplicate
   invocation, downstream patch, alias remapping, or compatibility shim.
3. New source files SHALL remain below 600 lines and 500 KiB.
4. Focused checks SHALL be bounded and SHALL not replace the repository's
   protected Integration Gate.

## Fixed decisions and remaining derivation

- The replay ledger defaults to 4096 identities and may be configured only to
  a smaller positive safe-integer capacity.
- Numeric entity bindings are supplied explicitly when the bridge is created;
  the bridge never infers an entity from a collider or subject string.
- A bridge instance is one replay epoch. A reset that intentionally starts a
  new epoch creates a new bridge; admitted identities are never evicted.
- Final pin values cannot be known until the corrected ADR is committed.
