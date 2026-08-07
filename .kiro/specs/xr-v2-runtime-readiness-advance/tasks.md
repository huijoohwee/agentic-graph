# XR v2 Runtime-Readiness Recovery Tasks

`requirements.md` is normative. Checked items record completed documentation
work only; they do not assert runtime or release readiness.

## 1. Recover and correct the authority

- [x] Preserve the recovered `107090`-byte ADR and its SHA-256 as historical
  recovery evidence only.
- [x] Restore valid opening YAML frontmatter.
- [x] Correct ADR-10 to the existing root-ECS/XR ownership boundary.
- [x] Correct ADR-11 to reuse the native TypeScript spatial-physics owner.
- [x] Keep ADR-12 proposed and name the sole renderer and actual HTML viewer
  runtime.
- [x] Reuse `/xr.physics @canvas #world|#body|#impulse|#controller` and retire
  the duplicate invocation claims.
- [x] Mark AC-13, AC-15, AC-16, and AC-17 as honest follow-on slices.
- [ ] Owner reviews and commits the final corrected ADR.

## 2. Advance the exact pin after the corrected commit

- [ ] Derive revision, Git blob, byte length, and SHA-256 from the final
  corrected ADR commit, never from the recovered raw digest.
- [ ] Update all nine authored pin surfaces atomically.
- [ ] Add or run the pin-consistency check and report every disagreement.
- [ ] Prove source-ready at the exact candidate revision.

This phase remains blocked while the corrected ADR is uncommitted.

## 3. Implement AC-14 event preservation

- [ ] Return drained `SpatialPhysicsEvent` values from
  `xrSpatialPhysicsAdapter.ts`.
- [ ] Aggregate ordered events through `xrPhysicsRuntime.ts` without changing
  contact counts, snapshots, pause, reset, or invocation behavior.
- [ ] Add focused tests for event preservation and no-step empty output.

## 4. Implement the single collision bridge

- [ ] Add `collision-begin` and `collision-end` to the canonical behavior
  trigger union and validation set.
- [ ] Add one bridge under `canvas/src/features/xr-v2/`; do not add a second
  dispatcher, ECS, or event bus.
- [ ] Normalize collider pairs lexically and resolve them through an explicit
  zero-or-one numeric `sourceEntityId` binding.
- [ ] Allocate the next dispatcher revision and emit a safe event identifier.
- [ ] Admit each transition once through a bounded replay ledger that fails
  closed at capacity.
- [ ] Keep sensor transitions outside AC-14 collision mapping.

## 5. Verify AC-14 without overclaim

- [ ] Prove collision begin and end mapping.
- [ ] Prove one bound action fires exactly once.
- [ ] Prove an unbound pair invokes zero actions.
- [ ] Prove duplicate, malformed, out-of-order, reentrant, and
  capacity-exhausted paths fail closed.
- [ ] Run existing focused XR physics and behavior-dispatch regression tests.
- [ ] Run the repository-owned XR v2 source-ready and bounded browser smoke at
  the exact candidate revision.
- [ ] Record Xcode, visionOS Simulator, Safari, and physical-device evidence
  separately; report missing evidence as missing.

## 6. Follow-on backlog; no current readiness claim

- [ ] AC-13: design force accumulation, orientation/angular state, and joints.
- [ ] AC-15: design user-gesture audio lifecycle and active-listener ownership.
- [ ] AC-16: implement within the sole renderer and capture pixel evidence.
- [ ] AC-17: design pointer/touch adapters and admit a real hand-ray source.

No item in this section can be checked using AC-14 evidence.

## Completion boundary

This package is complete only when the corrected authority is committed and
pinned, AC-14 is implemented and proved at one exact Dev revision, and every
readiness claim matches its recorded evidence. Protected integration, Prod,
Cloudflare, and production verification remain separate authorized gates.
