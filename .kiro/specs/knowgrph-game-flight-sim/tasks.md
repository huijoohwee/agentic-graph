# Implementation Plan: Knowgrph Native Flight Simulator

## Overview

Implement one browser-local, deterministic Flight Sim mission as an overlay on the authored Knowgrph XR Canvas. This repository-tracked Kiro package is the normative source of truth; the PRD/TAD and workspace seed are derived implementation/proof projections, and any workspace-root Kiro copy is byte-identical local projection only. The source/runtime implementation is complete; final evidence remains a separate exact-revision activity. The plan preserves four journaled `World_Tick` systems, post-system Cost_Log ownership, post-commit projection ownership, Decisions-only persistence, and a deterministic committed-local asset boundary.

---

## Tasks

- [x] 1. Establish source identity and shared-XR ownership
  - [x] Register the source-authored `flight-sim` run-ready id with fail-closed identity conflict handling.
  - [x] Mount Flight actors and HUD on the retained authored XR Canvas without a second Canvas, renderer, camera owner, terrain, or world.
  - _Requirements: 1, 12, 14, 23_

- [x] 2. Implement deterministic native ECS flight
  - [x] Advance on an exact fixed `1 / 60` second step with at most five catch-up ticks.
  - [x] Run exactly four meaningful journaled systems in order: `InputIntegrationSystem`, `FlightModelSystem`, `CollisionResolverSystem`, `ObjectiveSystem`.
  - [x] Keep Cost_Log emission in the Agentic ECS post-systems harness and immutable renderer/HUD projection after commit.
  - [x] Reject out-of-transaction mutations and preserve deterministic replay.
  - _Requirements: 2, 5, 6, 7, 8_

- [x] 3. Implement offline asset admission
  - [x] Admit the required aircraft through one diffable TypeScript + JSON Asset_Spec.
  - [x] Admit only the optional beacon through the repository-owned deterministic offline GLB generator, committed-local bytes, exact SHA-256, CC0-1.0 license, and self-contained GLB validation.
  - [x] Reject remote, traversal, missing, malformed, unlicensed, hash-drifted, or untracked asset candidates.
  - _Requirements: 3, 4, 9, 10, 11_

- [x] 4. Implement input, camera, and lifecycle
  - [x] Normalize keyboard, pointer, touch, standard gamepad, optional Motion Control, and MCP input into one frame.
  - [x] Preserve Fixed Follow / Free Orbit ownership in the shared camera catalog and Timeline camera-mark round-trip.
  - [x] Support `open`, `start`, `stop`, `restart`, `throttle`, `save`, and `exit`, including tick-zero hold and exact Stop-to-Start resume.
  - _Requirements: 15, 16, 18, 21_

- [x] 5. Implement mission and Decisions-only persistence
  - [x] Require three ordered waypoint captures followed by the landing pad.
  - [x] Keep terminal Decisions pending until explicit Save.
  - [x] Persist only validated Decisions through browser-local WorkspaceFs; preserve authored bytes and support hydration Reset / write Retry.
  - _Requirements: 17, 19, 20_

- [x] 6. Implement bounded agent control and local failure handling
  - [x] Enforce exact `/flight.sim @canvas #flight` grammar and exactly two browser WebMCP tools.
  - [x] Keep the private ECS stdio surface unchanged and enforce finite control deadlines.
  - [x] Fail closed locally for WebGL, network, inference, asset, persistence, and activation errors.
  - _Requirements: 1, 2, 12, 13, 21_

- [x] 7. Add source/runtime verification
  - [x] Cover the 45 named properties, focused source tests, dependency/license checks, generic clean-room boundary scan, TypeScript check, and production build.
  - [x] Run runtime and browser verification in child-owned exact local workspaces so failed tracked/untracked mutations are discarded and prior browser evidence is restored transactionally.
  - [x] Attest source-authored provenance; document that the named scanner cannot prove the absence of arbitrary derived code.
  - [x] Require the tracked Kiro authority inventory and hash it during Flight Sim readiness.
  - _Requirements: 3, 4, 22_

- [x] 8. Add mission-based training across the six existing FloatingPanel owners
  - [x] Add foundation, night, and systems-recovery missions with deterministic route, stability, energy, recovery, score, and grade outcomes.
  - [x] Add bounded power-loss, unreliable-instrument, and control-bias practice failures to the captured tick-input owner.
  - [x] Project one shared training state into Media, Animation, Motion Control, Game Mode, Flight Sim, and Camera without a second Canvas or world.
  - [x] Add explicit browser voice coaching with visible text fallback, shared-owner night atmosphere, terminal debrief Decisions, and MCP `/` `@` `#` operations.
  - [x] Retry transient mission-stage dynamic-import fetch failures at the shared loader boundary.
  - _Requirements: 4, 12, 13, 14, 18, 19, 24_

- [ ] 9. Complete final exact-revision evidence and protected integration
  - [ ] Run the aggregate source/runtime gate on a clean exact candidate revision.
  - [ ] Run two fresh serial browser proofs on that same revision, including mission completion and a touch-control interaction if those are required browser acceptance claims.
  - [ ] Preserve the honest boundary between source proof, browser proof, protected integration, and release/deployment proof.
  - [ ] Integrate through the protected PR gate; do not deploy from this task.
  - _Requirements: 22_

---

## Proof Boundary

Checked implementation tasks describe source present in the repository. The final unchecked task is intentionally separate: no exact-HEAD browser, protected integration, production, or deployment claim follows from source completion alone.
