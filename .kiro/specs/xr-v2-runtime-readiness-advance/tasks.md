# XR v2 Runtime-Readiness Recovery Tasks

`requirements.md` is normative. Checked items record completed bounded work;
they do not assert protected integration, device, Production, or release
readiness.

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
- [x] Owner reviews and commits the final corrected ADR.

## 2. Advance the exact pin after the corrected commit

- [x] Derive revision, Git blob, byte length, and SHA-256 from the final
  corrected ADR commit, never from the recovered raw digest.
- [x] Update all ten authored pin surfaces atomically.
- [x] Add or run the pin-consistency check and report every disagreement.
- [ ] Prove source-ready at the exact candidate revision.

The pin derives from corrected authority commit
`b41cc13b0798fb4e66ec9b3e8086ee13f6d72d99`; candidate sealing remains a
separate gate.

## 3. Implement AC-14 event preservation

- [x] Return drained `SpatialPhysicsEvent` values from
  `xrSpatialPhysicsAdapter.ts`.
- [x] Aggregate ordered events through `xrPhysicsRuntime.ts` without changing
  contact counts, snapshots, pause, reset, or invocation behavior.
- [x] Add focused tests for event preservation and no-step empty output.

## 4. Implement the single collision bridge

- [x] Add `collision-begin` and `collision-end` to the canonical behavior
  trigger union and validation set.
- [x] Add one bridge under `canvas/src/features/xr-v2/`; do not add a second
  dispatcher, ECS, or event bus.
- [x] Normalize collider pairs lexically and resolve them through an explicit
  zero-or-one numeric `sourceEntityId` binding.
- [x] Allocate the next dispatcher revision and emit a safe event identifier.
- [x] Admit each transition once through a bounded replay ledger that fails
  closed at capacity.
- [x] Keep sensor transitions outside AC-14 collision mapping.

## 5. Verify AC-14 without overclaim

- [x] Prove collision begin and end mapping.
- [x] Prove one bound action fires exactly once.
- [x] Prove an unbound pair invokes zero actions.
- [x] Prove replay, malformed, reentrant, and capacity-exhausted bridge paths
  fail closed; retain the canonical dispatcher's out-of-order regression.
- [x] Run existing focused XR physics and behavior-dispatch regression tests.
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
