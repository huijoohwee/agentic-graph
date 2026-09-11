---
title: "agentic-graph Workspace Seed Authority"
doc_type: "Source Ownership Contract"
status: "runtime-ready"
source_root: "agentic-graph/docs"
---

# Workspace Seed Authority

`agentic-graph/docs/workspace-seeds` is the only authored source for agentic-graph
workspace seeds.

The dedicated XR v2 source is
`agentic-graph-ar-vr-xr-runtime-readiness-demo.md`. Its source-authored
`run_ready_demo.id` (`xr-v2`), immutable v3.0.0 authority identity,
mounted-fixture graph, AC-1–AC-12 browser evidence chain, separate AC-14
implementation candidate, XR/3D/Motion Control presentation, and user-controlled camera/sensor
boundary are edited here first. The local browser demo can be runtime-ready
while the full pinned contract remains partial: AC-14 browser/device evidence,
named physical-device lifecycle, headset, connected-transport, and Production
certification remain separate gates.

Saved assets stay device-local by default. Cross-device publish, refresh, and
reopen are separate explicit actions through the existing storage surface; the
adapter reports the inherited authentication and server-side digest gap as a
Production promotion blocker.

The XR Physics source is `agentic-graph-physics-playground-demo.md`; its
`run_ready_demo.id`, source identity, scene composition, Motion Control, and
optional Game Mode projection are edited here first. The Flight Sim source is
`agentic-graph-game-flight-sim-demo.md`; its `run_ready_demo.id` (`flight-sim`),
source identity, native flight demo, asset pipeline, shared Camera catalog,
Motion Control handoff, and Flight Sim projection are edited here first. It is
an XR Mode overlay on the Physics-authored world and supplies a pure aircraft
follow/framing descriptor to the canonical Physics controller camera; it owns
no second rendered XR world, scene owner, Canvas, or camera driver.

The City Sim source is `agentic-graph-game-city-building-sim-demo.md`; its
`run_ready_demo.id` (`city-sim`), source-authored initial grid and geographic
profile, Geo+XR composition, deterministic civic state, local persistence, and
projections across the existing Media, Animation, Motion Control, Game Mode,
Flight Sim, and Camera panels are edited here first. City retains one real
native MapLibre basemap and resolves one exact companion-owned regional POI
profile into the checked-in `kg-geo-xr:regional-poi` band: one exact surface
feature per admitted surface plus one fixed-pixel identity locator per POI
across five layers. It projects live parcels from source-authored meter
dimensions and gaps once through `kg-city-sim:geo-overlay`, frames the union of
regional and parcel bounds inside the visible aperture, and binds semantic
selection directly to the live canvas inside `SemanticMediaFigure`. It does not
project the Flight-local XR environment. A separate read-only aircraft/route
overlay is reused above City with presentation owner `city`; it does not
activate or borrow Flight bootstrap, camera, gameplay, environment, or
readiness ownership. City creates zero Three presentation; any retained shared
Canvas remains inactive, invisible, and pointer-transparent. It mounts no HTML
POI marker or alternate world.

The MMORPG source is `agentic-graph-game-mmorpg-demo.md`; its planned
`run_ready_demo.id` (`mmorpg`), source identity, native offline RPG world,
three-track asset provenance pipeline, camera source, and MMORPG World
projection are edited here first. Draft seeds use `planned_run_ready_demo` and
do not become activation authorities until their runtime-readiness and
browser-smoke gates exist and pass.

## Source Files inventory

Explorer → Source Files must reconcile this exact authored inventory in both repository-local Dev and the release-pinned Prod dataset:

- `README.md`
- `agentic-graph-agentic-canvas-os-demo.md`
- `agentic-graph-agentic-video-canvas-demo.md`
- `agentic-graph-animatic-demo.md`
- `agentic-graph-ar-vr-xr-runtime-readiness-demo.md`
- `agentic-graph-care-agent-demo.md`
- `agentic-graph-game-city-building-sim-demo.md`
- `agentic-graph-game-flight-sim-demo.companion.md`
- `agentic-graph-game-flight-sim-demo.md`
- `agentic-graph-game-mmorpg-demo.companion.md`
- `agentic-graph-game-mmorpg-demo.md`
- `agentic-graph-hackamap.md`
- `agentic-graph-maps-places-reference.md`
- `agentic-graph-maps-places.md`
- `agentic-graph-missalph-demo.md`
- `agentic-graph-physics-playground-demo.md`
- `agentic-graph-ralphthon-video-demo.md`
- `agentic-graph-research-agent-demo.md`
- `agentic-graph-sme-care-agent-demo.md`
- `agentic-graph-storyboard-demo-index.md`
- `agentic-graph-storyboard-demo.md`
- `agentic-graph-storyboard-neutral-schema-contract-demo.md`
- `agentic-graph-storyboard-product-ui-demo.md`
- `agentic-graph-storyboard-widget-computing-flow-template.md`
- `agentic-graph-strybldr-demo.md`
- `agentic-graph-strybldr-starter-template.md`
- `agentic-graph-video-demo.md`

The MMORPG draft and both projection companion notes are visible, editable records but remain non-activating and use the neutral 2D Flow Canvas presentation with panels closed. Drafts and companions must not request XR/3D, a runtime FloatingPanel view, applied-document activation, an implemented native runtime, or auto-start. The Flight companion records projection state only; the source itself is the local activation authority. None of these files grants deployment authority.

The protected app build packages these exact source files as revision-pinned, read-only bootstrap artifacts, with each Markdown module imported lazily when seed reconciliation is requested. Production and offline startup reconcile from that artifact without discovering seed names through the GitHub API. Repository-local Dev reads this directory from the exact running agentic-graph checkout or worktree, never by deriving another agentic-graph checkout from the collaborative-docs root. `VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT` may override only that bounded read projection. Browser seed mutations carry only a logical `/docs/workspace-seeds/**` `workspacePath`; the server bridge derives the exact `$GITHUB_ROOT/agentic-graph/docs/workspace-seeds/**` host target. Client-supplied absolute mutation paths or mutation-root environment variables are forbidden.

## Authored seed registry

| Seed source | `run_ready_demo.id` | Surface | Status | Notes |
|---|---|---|---|---|
| `agentic-graph-ar-vr-xr-runtime-readiness-demo.md` | `xr-v2` | XR + 3D + Motion Control workspace graph | browser-demo-ready for AC-1–AC-12; AC-14 source-only; full pinned contract partial | Immutable v3.0.0 authority at commit `1272bae345edf0d132e6fc750d5c5c7eade00b29`, blob `ff41649ac8562b62c7c539baed2d226402fdfe51`, SHA-256 `5067f019a099a94ec02d3f7581963cf2c514ab46bf5a853020df8dfe85d5ef45`; source-authors the mounted AC-1–AC-12 chain while AC-14 remains a separate source implementation; saved assets require explicit publish/refresh/reopen actions; camera/sensors are user enable/disable; `npm run xr-v2:review-ready` is the bounded local proof gate but cannot establish AC-14 browser/device proof, named physical-device, hardened shared storage, headset, Production, or deployment certification |
| `agentic-graph-physics-playground-demo.md` | `xr-physics` | Shared XR Canvas (physics playground, optional Game Mode) | runtime-ready | Canonical XR terrain, controllers, Motion Control, camera source |
| `agentic-graph-game-flight-sim-demo.md` | `flight-sim` | XR Mode overlay on the Physics-authored world | runtime-ready | Native deterministic flight, Media environment-kit selection into the shared Geo panel and next Flight spatial profile, exactly three ordered waypoints then a landing pad, shared Fixed Follow / Free Orbit ownership with Chase/Cockpit/Survey descriptors and a local north-up route inset, spec-primary required aircraft plus one committed-local optional opaque beacon, strict browser-local invocation, Decisions-only WorkspaceFs; prove with `npm run game-flight-sim:runtime-ready` and `npm run game-flight-sim:browser-smoke` |
| `agentic-graph-game-city-building-sim-demo.md` | `city-sim` | Geo+XR: one semantic MapLibre canvas with checked-in regional context, meter-scaled City parcels, and stopped Flight context | implementation candidate | Applied source selects one exact regional POI profile and authors the City grid/geographic profile; the regional band contains every admitted surface plus one identity locator per POI; layer order is regional context, City, then Flight; the Flight-local XR environment and HTML POI markers remain absent; City creates no Three presentation and any retained shared canvas is inactive and pointer-transparent; runtime-ready status follows exact-head source and browser proof |
| `agentic-graph-game-mmorpg-demo.md` | planned `mmorpg` | 2D Flow design record (planned shared-XR MMORPG World) | draft | Non-activating design seed until its runtime-readiness and browser-smoke gates exist and pass; proposed offline single-player MMO-style RPG world (no networked multiplayer, no Supabase); proposed three-track asset provenance |

Every runtime-ready seed, and every draft's target contract, is **native and in-repo**: `run_ready_demo.external_dependencies` or `planned_run_ready_demo.external_dependencies` must be empty, no runtime external asset/provider/model dependency call is permitted, and no external project source may be copied or depended upon. The XR v2 seed's explicit Publish, Refresh shared, and Reopen actions may use only the existing first-party Asset Contract Writer/storage boundary; they never run on mount, capture, authoring, save, catalog load, or playback. Local runtime readiness is not protected integration, projection, or release proof. New seeds are registered in this table; stale, renamed, fallback, legacy, conditional, or conflicting seed variants are forbidden rather than aliased or hidden.

The future projection contract for the Flight Sim seed is documented in `agentic-graph-game-flight-sim-demo.companion.md`, and for the MMORPG seed in `agentic-graph-game-mmorpg-demo.companion.md`. Those companions are documentation notes only — they carry no `run_ready_demo` activation and are not seeds. Flight Sim and MMORPG projection files do not currently exist. The Flight projection remains absent until an exact protected integrated SHA passes its gates and an operator authorizes a protected release.

The exact current `agentic-canvas-os/docs/workspace-seeds` inventory contains only the byte-identical `agentic-graph-physics-playground-demo.md` release-pinned default-storage projection. It is not an independent authoring surface. A protected docs update may refresh it only from this source, and cross-repository validation must reject any byte drift. XR v2, City, Flight, draft, and companion projections are intentionally forbidden from that inventory in this Dev candidate.

Publish repositories must not contain an editable `docs/workspace-seeds` copy. Their runtime assets and public routes are generated by the protected release controller from the verified agentic-graph source. Stale, renamed, fallback, legacy, conditional, or conflicting seed variants are forbidden rather than aliased or hidden.

## Commerce and media source recovery

The commerce, Strybldr, HackaMap, MissAlpha, map, Care, storyboard, and video inputs are authored here. `config/workspace-seed-inventory.json` owns the exact inventory consumed by both source validation and the browser bundle. Tests default to this exact checkout instead of a sibling publish repository or a temporary translated corpus. Every recovered source records its original repository, revision, path, and SHA-256; those originals remain unchanged. The map methodology and historical recommendations are split into a non-activating reference to keep each new source below 600 lines.

Run all prepares local drafts where a source declares `local_execution.mode: prepare-only`. Provider requests remain separate explicit invocations; draft text is never a generated media response or provider proof. The Care draft organizes only operator-supplied instructions and makes no diagnosis or treatment recommendation. Historical proof declarations inside recovered sources are archival input, not fresh browser, provider, deployment, payment, or Production certification. Fresh validation is recorded in the delivery handoff.
