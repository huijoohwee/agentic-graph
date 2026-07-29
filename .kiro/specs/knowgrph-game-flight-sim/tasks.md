# Implementation Plan: Knowgrph Native Flight Simulator

## Overview

Implement one browser-local, deterministic Flight Sim mission on the composed Knowgrph Geo+XR surface: native MapLibre renders the selected geospatial world and georeferenced Flight layers while one transparent existing XR Canvas retains simulation/input/readiness and paints no competing geometry. This repository-tracked Kiro package is the normative source of truth; the PRD/TAD and workspace seed are derived implementation/proof projections, and any workspace-root Kiro copy is byte-identical local projection only. The source/runtime implementation is complete; final evidence remains a separate exact-revision activity. The plan preserves four journaled `World_Tick` systems, post-system Cost_Log ownership, post-commit projection ownership, Decisions-only persistence, and a deterministic committed-local asset boundary.

---

## Tasks

- [x] 1. Establish source identity and shared-surface ownership
  - [x] Register the source-authored `flight-sim` run-ready id with fail-closed identity conflict handling.
  - [x] Keep native MapLibre as the Geo world and visible Flight projection owner, retain simulation/input/readiness plus the HUD with one transparent visual-free XR Canvas, and preserve the exclusive plain-Geo projection without a second R3F Canvas.
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
  - [x] Add explicit browser voice coaching with visible text fallback, MapLibre/HUD night palette ownership, terminal debrief Decisions, and MCP `/` `@` `#` operations.
  - [x] Retry transient mission-stage dynamic-import fetch failures at the shared loader boundary.
  - _Requirements: 4, 12, 13, 14, 18, 19, 24_

- [x] 9. Add deterministic flight-envelope guidance
  - [x] Scale pitch, roll, yaw, and bank-turn authority from true airspeed with a bounded non-zero minimum.
  - [x] Add a deterministic low-speed nose-down tendency below the authored stall threshold.
  - [x] Project unreliable-instrument, stall, attitude, and mission-relative energy states into the HUD and all six existing training surfaces.
  - [x] Preserve the single shared camera/Canvas owners and the generic clean-room, zero-dependency boundary.
  - [x] Route each Media environment kit through canonical XR stage selection into FloatingPanel Geo, retain the selected native MapLibre view as the Geo+XR world, settle graph-metadata source-text writes plus their debounced local host-mirror tail before Flight activation, and immediately reactivate the source-authored Flight overlay without replacing the Geo panel.
  - [x] Share fixed-step input ownership across XR and Geo, acknowledge Geo+XR preparation only from a committed native MapLibre render (or exclusive Geo from its committed DOM projection), and forbid the visually suppressed XR demand loop from marking or completing visible presentation readiness.
  - [x] Decouple committed Flight render readiness from desktop input ownership so Motion, touch, and gamepad remain playable while the desktop claim retries after Geo or camera handoff.
  - [x] Derive Cockpit eye clearance from the admitted aircraft collision envelope so the forward view remains above and beyond committed airframe geometry.
  - [x] Add Geo+XR Mode, make the Flight seed select it, retain native MapLibre with topmost georeferenced route/aircraft layers plus the transparent XR simulation/input/readiness layer, and retain exclusive plain Geo plus existing 3D precedence for City and FPS gameplay.
  - [x] Keep native MapLibre mounted for 2D Classic/Modern and 3D Classic/Modern, suppress competing R3F environment and Flight visuals, drive the visible MapLibre camera from Fixed Follow Chase/Cockpit/Survey, and yield pan/zoom to MapLibre in Free Orbit.
  - [x] Derive route state and signed active-objective guidance once, then project its conditional aircraft-to-objective course segment through all four native MapLibre views, exclusive plain Geo, the navigation inset, and a non-live mobile/desktop HUD cue.
  - [x] Prevent the shared Physics base from re-activating an already-active Flight XR surface, and preserve the pending Flight gameplay owner when that base must enter XR.
  - [x] Share the responsive FloatingPanel width policy with the pointer-transparent Flight HUD, reserve its default right-side footprint, and retain mobile controls above bottom choreography surfaces so Motion Control remains operable during flight.
  - [x] Remove Flight's global browser-network replacement, retain explicit gameplay transport rejection at the bounded call seam, and leave existing Geo provider and checked-in Motion Control asset transport with their independent owners.
  - _Requirements: 4, 6, 7, 12, 14, 24, 25, 26, 27_

- [x] 10. Restore the four-mode Singapore Flight/Geo/XR projection
  - [x] Centralize the Singapore local-stage anchor, non-administrative presentation extent, and north-up 2D versus oblique 3D camera policy.
  - [x] Project the selected XR stage footprint, authored structures, and placed subjects into native MapLibre fill/line layers for both 2D modes and native fill extrusion for both 3D modes.
  - [x] Replace the font-dependent aircraft symbol with pose-derived native polygon geometry plus source-generated fixed-pixel day/night icons, and fail closed with exact image/layer diagnostics.
  - [x] Await Flight publication preparation before the Media-to-Geo route so source or layer failure cannot strand the operator on a blank Geo panel.
  - [x] Extend focused source contracts and the two-run exact-candidate browser gate across the environment revision, aircraft geometry, four mode cameras, live movement, and map interaction.
  - [x] Preserve the single MapLibre world/pointer owner, transparent R3F simulation/input/readiness Canvas, zero external simulator dependency, and no-copy boundary.
  - _Requirements: 14, 22, 25_

- [ ] 11. Complete final exact-revision evidence and protected integration
  - [ ] Run the aggregate source/runtime gate on a clean exact candidate revision.
  - [ ] Run two fresh serial browser proofs on that same revision, including mission completion and a touch-control interaction if those are required browser acceptance claims.
  - [ ] Preserve the honest boundary between source proof, browser proof, protected integration, and release/deployment proof.
  - [ ] Integrate through the protected PR gate; do not deploy from this task.
  - _Requirements: 22_

---

## Proof Boundary

Checked implementation tasks describe source present in the repository. The final unchecked task is intentionally separate: no exact-HEAD browser, protected integration, production, or deployment claim follows from source completion alone.
