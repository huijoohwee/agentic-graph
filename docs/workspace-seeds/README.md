---
title: "Knowgrph Workspace Seed Authority"
doc_type: "Source Ownership Contract"
status: "runtime-ready"
source_root: "knowgrph/docs"
---

# Workspace Seed Authority

`knowgrph/docs/workspace-seeds` is the only authored source for Knowgrph workspace seeds. The XR Physics source is `knowgrph-physics-playground-demo.md`; its `run_ready_demo.id`, source identity, scene composition, Motion Control, and optional Game Mode projection are edited here first. The Flight Sim source is `knowgrph-game-flight-sim-demo.md`; its `run_ready_demo.id` (`flight-sim`), source identity, native flight demo, asset pipeline, shared Camera catalog, Motion Control handoff, and Flight Sim projection are edited here first. It is an XR Mode overlay on the Physics-authored world and supplies a pure aircraft follow/framing descriptor to the canonical Physics controller camera; it owns no second rendered XR world, scene owner, Canvas, or camera driver. The City Sim source is `knowgrph-game-city-building-sim-demo.md`; its `run_ready_demo.id` (`city-sim`), deterministic civic state, local persistence, and projections across the existing Media, Animation, Motion Control, Game Mode, Flight Sim, and Camera panels are edited here first. The MMORPG source is `knowgrph-game-mmorpg-demo.md`; its planned `run_ready_demo.id` (`mmorpg`), source identity, native offline RPG world, three-track asset provenance pipeline, camera source, and MMORPG World projection are edited here first. Draft seeds use `planned_run_ready_demo` and do not become activation authorities until their runtime-readiness and browser-smoke gates exist and pass.

## Source Files inventory

Explorer → Source Files must reconcile this exact authored inventory in both repository-local Dev and the release-pinned Prod dataset:

- `README.md`
- `knowgrph-game-city-building-sim-demo.md`
- `knowgrph-game-flight-sim-demo.companion.md`
- `knowgrph-game-flight-sim-demo.md`
- `knowgrph-game-mmorpg-demo.companion.md`
- `knowgrph-game-mmorpg-demo.md`
- `knowgrph-physics-playground-demo.md`

The MMORPG draft and both projection companion notes are visible, editable records but remain non-activating and use the neutral 2D Flow Canvas presentation with panels closed. Drafts and companions must not request XR/3D, a runtime FloatingPanel view, applied-document activation, an implemented native runtime, or auto-start. The Flight companion records projection state only; the source itself is the local activation authority. None of these files grants deployment authority.

The protected app build packages these exact seven source bytes as a revision-pinned, read-only bootstrap artifact. Production and offline startup reconcile from that artifact without discovering seed names through the GitHub API; repository-local Dev still reads this authored directory first so edits remain immediately visible.

## Authored seed registry

| Seed source | `run_ready_demo.id` | Surface | Status | Notes |
|---|---|---|---|---|
| `knowgrph-physics-playground-demo.md` | `xr-physics` | Shared XR Canvas (physics playground, optional Game Mode) | runtime-ready | Canonical XR terrain, controllers, Motion Control, camera source |
| `knowgrph-game-flight-sim-demo.md` | `flight-sim` | XR Mode overlay on the Physics-authored world | runtime-ready | Native deterministic flight, exactly three ordered waypoints then a landing pad, shared Fixed Follow / Free Orbit catalog with Physics-controller camera ownership, spec-primary required aircraft plus one committed-local optional opaque beacon, strict browser-local invocation, Decisions-only WorkspaceFs; prove with `npm run game-flight-sim:runtime-ready` and `npm run game-flight-sim:browser-smoke` |
| `knowgrph-game-city-building-sim-demo.md` | `city-sim` | Additive City Sim overlay on the shared XR Canvas | implementation candidate | Deterministic local grid and economy, explicit KGC + CSV save/read-back, local heuristic advisor, strict browser-local invocation, and six existing-panel projections; runtime-ready status follows exact-head source and browser proof |
| `knowgrph-game-mmorpg-demo.md` | planned `mmorpg` | 2D Flow design record (planned shared-XR MMORPG World) | draft | Non-activating design seed until its runtime-readiness and browser-smoke gates exist and pass; proposed offline single-player MMO-style RPG world (no networked multiplayer, no Supabase); proposed three-track asset provenance |

Every runtime-ready seed, and every draft's target contract, is **native and in-repo**: `run_ready_demo.external_dependencies` or `planned_run_ready_demo.external_dependencies` must be empty, no runtime remote asset/provider/model call is permitted, and no external project source may be copied or depended upon. Local runtime readiness is not protected integration, projection, or release proof. New seeds are registered in this table; stale, renamed, fallback, legacy, conditional, or conflicting seed variants are forbidden rather than aliased or hidden.

The future projection contract for the Flight Sim seed is documented in `knowgrph-game-flight-sim-demo.companion.md`, and for the MMORPG seed in `knowgrph-game-mmorpg-demo.companion.md`. Those companions are documentation notes only — they carry no `run_ready_demo` activation and are not seeds. Flight Sim and MMORPG projection files do not currently exist. The Flight projection remains absent until an exact protected integrated SHA passes its gates and an operator authorizes a protected release.

The exact current `agentic-canvas-os/docs/workspace-seeds` inventory contains only the byte-identical `knowgrph-physics-playground-demo.md` release-pinned default-storage projection. It is not an independent authoring surface. A protected docs update may refresh it only from this source, and cross-repository validation must reject any byte drift. City, Flight, draft, and companion projections are intentionally forbidden from that inventory in this Dev candidate.

Publish repositories must not contain an editable `docs/workspace-seeds` copy. Their runtime assets and public routes are generated by the protected release controller from the verified Knowgrph source. Stale, renamed, fallback, legacy, conditional, or conflicting seed variants are forbidden rather than aliased or hidden.
