---
title: "AgenticGraph Game FPS Runtime Readiness"
doc_type: "Runtime Proof Checklist"
status: "runtime-ready"
date: "2026-07-21"
updated: "2026-07-21"
frontmatter_contract: "required"
execution_boundary: "dev-only"
publish_scope: "local-only"
source_contract: "docs/documents/agenticgraph-game-fps-prd-tad.md"
workspace_seed: "docs/workspace-seeds/agenticgraph-physics-playground-demo.md"
activation: "explicit /game.mode @canvas #gameplay overlay on xr-physics"
baseline_protected_commit: "fbb615be92ea58e6e4cfc981feb2122ea81e79b2"
baseline_verified_at: "2026-07-21T07:50:51Z"
baseline_protected_pull_request: "https://github.com/huijoohwee/agentic-graph/pull/263"
follow_up_pull_request: "https://github.com/huijoohwee/agentic-graph/pull/273"
follow_up_protected_merge_commit: "0b0e70787edb80e71d368d56c1478ffd9655ce0d"
exact_main_runtime_commit: "0b0e70787edb80e71d368d56c1478ffd9655ce0d"
follow_up_verified_at: "2026-07-21T10:08:11Z"
follow_up_status: "protected PR #273 and exact-main acceptance passed"
agentic_runtime_docs_commit: "41cd9855dbcec074b2182a9eaea455c54c117fe4"
deployment: "not authorized"
---

# AgenticGraph Game FPS Runtime Readiness

This file is the evidence ledger for the local/Dev Game Mode increment. PR #263 established the pre-follow-up baseline at protected main commit `fbb615be92ea58e6e4cfc981feb2122ea81e79b2`. PR #273 then merged the authored-XR composition, spatial-profile, and ready-clock follow-up, and source, build, core-browser, external-source, XR/Motion, invocation, persistence, and no-hardcode gates reran on exact main commit `0b0e70787edb80e71d368d56c1478ffd9655ce0d`. This is a local runtime-readiness claim only; production remains unauthorized.

## Canonical commands

```bash
npm run game-fps:runtime-ready
npm run game-fps:browser-smoke
npm run demo:xr-physics
AG_GAME_MODE_VALIDATION_SHARE_URL='<operator-supplied share URL>' npm -C canvas run test:smoke:game-mode-xr-share:browser
```

The runtime-ready and core-browser commands cover game unit/integration tests, deterministic replay, Agentic ECS proof, Canvas type checking, a production-format local build, canonical Physics-source validation, explicit Game Mode activation, and local interaction/persistence. They require no non-local request. The opt-in share command accepts its source only through the environment, performs one allowlisted verifier preflight read to establish exact bytes plus exactly one product/browser document fetch, and runs those bytes against the local exact-main runtime. The supplied URL, opaque token, decoded path, and content checksum must never be written into repository bytes or proof artifacts. None of these commands deploys or performs a public mutation.

## Evidence ledger

| Gate | Required evidence | State |
|---|---|---|
| Source scope | One canonical authored XR scene/profile, four NPCs, one hitscan weapon, no alternate environment or new runtime dependency | passed for PR #273 retention baseline |
| Determinism | Two identical seeds/input traces produce byte-identical canonical results | passed |
| Collision/weapon | Stable AABB movement plus normalized slab hitscan ordered by `(distance, entityRef)` | passed |
| NPC policy | Closed scored actions on a 12-tick interval with stable tie-breaking and no reasoning request | passed |
| Cost | Exactly one canonical zero Cost_Log per successful no-reasoning tick | passed |
| Game Mode lifecycle | FloatingPanel open/start/stop/restart/fire/reload/save/exit uses one central runtime | passed |
| Controls | Desktop release/re-entry, pointer aim/fire, mobile touch, and Motion Control input composition | passed |
| Invocation | Exactly `/game.mode @canvas #gameplay`; duplicate/mixed/unknown input fails closed | passed |
| Browser WebMCP | Strict `agenticgraph-game-mode-mcp/v1` inspect/control registration and duplicate-binding rejection | passed |
| Persistence | Explicit Decisions-only WorkspaceFs Save, idempotent resume, retry retention, and read-back rollback; no terminal autosave | passed |
| Malformed save | Hydration blocks Start/Restart, bytes remain intact, HUD names the path, only explicit Reset replaces | passed |
| WebGL | Synchronous capability gate keeps an unsupported mission stopped and renders a local error | passed |
| Canvas/XR | One existing R3F Canvas; XR pauses for Game Mode, restores exactly, and continues afterward | passed |
| XR visual fidelity follow-up | Authored XR atmosphere, terrain, props, and scene anchors stay mounted under Game Mode | exact-main passed |
| Scene-authority cleanup | Delete the fallback scene/environment implementation and standalone Game FPS source/auto-start route, forbid renamed/conditional variants, and preserve one Canvas/world across Media, Animation, Motion Control, Game Mode, and Camera | source cleanup implemented; protected and exact-main proof required |
| Home XR source authority | Persist `sourcePath` plus decoded URL as one validated document identity; delete conflicts, migrate local Physics aliases to the canonical share, delete the mixed `XrGraphStage` owner, and lazy-load Motion Reference only for noncanonical authored XR | focused source/unit proof passed; protected and public stale-session proof required |
| XR profile admission follow-up | All catalogued XR presets filter walkable/overhead slabs, admit five non-overlapping ground-actor spawns, and replace stale profiles across live/stopped surface or terrain changes | exact-main passed |
| Ready clock follow-up | Tick, health, and Decisions stay unchanged until normalized desktop, pointer, touch, Motion Control, or MCP engagement | exact-main passed |
| Stop/Start | Stop preserves current tick/player state; Start resumes that same in-memory mission | passed |
| Source identity | `xr-physics` is the only XR/Game source-authored run-ready identity; Game Mode requires explicit invocation and no standalone game seed/env route exists | current follow-up proof required |
| Core browser | Visible movement, fire, four score rows, completion, explicit save, reload, malformed-save reset | passed |
| External source | Exact supplied Markdown bytes, strict WebMCP, Motion/XR round trip, stable Canvas, allowlisted network | passed |
| Hardcode guard | Supplied URL/token and its decoded canonical path are absent from repository bytes | passed |
| Network | Core gameplay made no non-local request; external acceptance made one verifier preflight read plus one exact product/browser source fetch | passed |
| Focused integration | Exact-main source, ECS, Canvas typecheck, build, and browser gates pass | passed |
| Protected integration | PR #263 baseline and PR #273 follow-up Integration Gates and protected squash merges | passed |
| Release boundary | No Pages/Worker/Cloudflare deployment performed | passed |

## Core browser smoke record

| Field | Recorded evidence |
|---|---|
| Exact-main runtime commit | `0b0e70787edb80e71d368d56c1478ffd9655ce0d` |
| Local target | `http://localhost:4185/`, Google Chrome headless |
| Viewport | Mobile acceptance `390x844`; desktop keyboard/fire inputs exercised in the same trace |
| First frame | Canonical Physics frame visible; explicit `/game.mode @canvas #gameplay` activation added four NPCs and touch controls without replacing the world |
| Movement | Player moved from `[0, 2]` to `[0, 0.74]`; key release neutralized input and a second `W` cycle reached Z `-0.03` |
| Browser WebMCP | Registered and active with schema `agenticgraph-game-mode-mcp/v1`; duplicate semantic binding rejected |
| Fire | Ammo changed from `8` to `7`; HUD reported a hit |
| Fixed runtime | Tick remained `0` until input, then advanced to `85` |
| Completion | Phase `won`, enemies alive `0`, pending Decision count `24`, reload observed |
| Save/resume | Explicit Save wrote `24` Decisions to `/game-fps/mission-1-decisions.md`; reload restored phase `won` |
| Malformed save | HUD named `/game-fps/mission-1-decisions.md`; original bytes remained intact; retry stayed hidden; explicit reset returned phase `playing` and save status `saved` |
| Runtime requests | Non-local requests `[]`; local runtime-bridge request paths `[]` |
| Errors | Console errors `[]`; page errors `[]`; failed responses `[]` |
| Local artifacts | `data/outputs/game-fps-browser-smoke.json` and `.png` are ignored proof outputs, not release artifacts |

The core browser smoke exercised the runtime and local persistence directly; the screenshot supplements, but does not replace, the structured record. It made no public request and performed no deployment.

## External XR share smoke record

| Field | Recorded evidence |
|---|---|
| Exact-main runtime commit | `0b0e70787edb80e71d368d56c1478ffd9655ce0d` |
| Source boundary | Environment-only operator input; exact public Markdown bytes at execution time imported into localhost |
| Product fetch | Product deep-link owner derived the document URL; exactly one matching fetch observed |
| Renderer | WebGL supported; exactly one Canvas with stable DOM identity across Game Mode/Motion/XR transitions |
| Game Mode | Shared `xr` surface, phase `playing`, four NPC rows, actions `hold`, `alert`, `engage`, `flee` |
| WebMCP | Strict browser inspect/control path passed; Stop→Start preserved mission state |
| Motion Control | Companion round trip stopped and preserved the mission; XR resumed and progressed while Motion owned the surface |
| XR restore | XR paused during Game Mode; rocket mode, objective, 12 bodies, and frame restored exactly; progress continued after exit |
| Network | Only localhost and the supplied origin were allowed; exact product-document fetch count `1` |
| Errors | Console errors `0`; page errors `0`; failed responses `0` |
| Local artifacts | `data/outputs/game-mode-xr-share-browser-smoke.json` and screenshots are ignored proof outputs |

This acceptance proves compatibility between the exact supplied public source bytes and the local exact-main runtime. It does not prove the public document contains the new Game Mode block, that the runtime is publicly deployed, or that any public state was mutated.

## XR visual-fidelity exact-main record

| Field | Recorded evidence |
|---|---|
| Protected lane | PR #273 passed Integration Gate and merged as `0b0e70787edb80e71d368d56c1478ffd9655ce0d`; exact-main acceptance reran through `2026-07-21T10:08:11Z` |
| Scene composition | `kg_graph_xr_stage`, `kg_xr_native_controller_demo`, `kg_xr_stage_preset_singapore`, and `kg_xr_playground_treasure` remained exported before and during Game Mode |
| Game overlay | `kg_game_fps_mission` plus four named NPC roots mounted in the same GLTF scene snapshot |
| Historical non-mount proof | The then-named `kg_game_fps_arena` node was absent while the shared surface reported `xr-authored` and retained-scene ownership; this does not prove source deletion or forbid renamed variants |
| Scene-authority deletion gate | The current follow-up deletes the standalone Game FPS seed/registry/auto-start owner and must prove no fallback environment source, generic motion-reference root, empty-world root, alternate clear owner, non-XR collision profile, conditional scene branch, or renamed environment subtree remains on the canonical Physics surface |
| Camera | The existing Canvas DOM node remained stable; Game Mode published its first-person camera framing while OrbitControls stayed suppressed |
| Spatial alignment | The Game overlay shared the authored placement transform/scale and reused the XR native-controller playable bounds and static collider catalog; immersive entry was suspended during gameplay |
| Profile admission | Structural profile identity rejected stale 3D/XR and same-XR terrain geometry; every catalogued preset admitted clear player/NPC spawns after walkable-low and overhead collider filtering |
| Idle admission | After Start, 12.5 seconds without normalized input remained `ready`, tick `0`, health `100`, four NPCs, and no runtime error |
| Engagement | Strict browser WebMCP Fire armed the clock; fixed ticks then advanced and the HUD remained healthy |
| XR lifecycle | The paused XR frame remained byte-equivalent during Game Mode and resumed from that exact frame after exit |
| Network/errors | Only localhost and the supplied origin were allowed; console errors `0`, page errors `0`, failed responses `0` |

The follow-up proof used the environment-only operator source and wrote only ignored local artifacts. The supplied URL, token, decoded path, and checksum are not repository evidence. PR #273 merged through the protected gate, and the same acceptance reran on that exact main SHA. Its exact-name non-mount assertion remains historical evidence only; the stronger deletion/variant-forbid contract requires a new protected result.

## Baseline protected-main command results

At the exact protected main commit:

- `npm run game-fps:runtime-ready` passed the 14-module source contract, 59 Agentic ECS tests, 20 focused Game Mode tests, subset source contracts, Canvas TypeScript, and an 8,519-module production Vite build namespaced under the full candidate SHA.
- `npm run game-fps:browser-smoke` passed desktop/mobile interaction, browser WebMCP, explicit persistence, reload, malformed hydration, explicit Reset, request, and error assertions.
- The opt-in external-source browser smoke passed exact-byte import, one exact product fetch, stable Canvas identity, strict WebMCP, Stop→Start preservation, Motion/XR handoff, exact XR restore, and zero-error assertions.
- Focused XR/Motion contracts, five runtime-doc dependency contracts, the external-input no-hardcode guard, focused ESLint, and `git diff --check` passed.
- Runtime docs resolve Agentic Canvas OS protected commit `41cd9855dbcec074b2182a9eaea455c54c117fe4`; no copied or mutable ref is accepted.

## Follow-up exact-main command results

At exact main commit `0b0e70787edb80e71d368d56c1478ffd9655ce0d`, `npm run game-fps:runtime-ready` passed the 16-module source contract, 59 Agentic ECS tests, 27 focused Game FPS source tests, Canvas TypeScript, and an 8,522-module production Vite build namespaced under the exact SHA. Core browser smoke, the environment-driven no-hardcode gate, and enhanced external XR-share acceptance passed with authored-scene retention, shared placement/collision ownership, all-preset admission, pause fencing, idle-until-engaged behavior, exact XR restoration, and zero browser errors. PR #273's protected Integration Gate passed before the squash merge.

## Promotion rule

Local runtime readiness is achieved when every local evidence row for the claimed scope passes at one exact commit. PR #263 remains the historical baseline; PR #273 and exact-main commit `0b0e70787edb80e71d368d56c1478ffd9655ce0d` carry the authored-XR retention and lifecycle proof, not standalone-source deletion proof. The current scene-authority cleanup must receive its own exact protected result before its pending rows become passed. No result authorizes production, Cloudflare, or public-surface claims.
