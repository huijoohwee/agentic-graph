---
title: "Knowgrph Native MMORPG World"
doc_type: "Workspace Demo"
status: "draft"
runtime_status: "draft"
runtime_claim: "planned-contract-only"
publish_scope: "local-only"
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "flow"
kgFloatingPanelOpen: false
kgBottomPanelOpen: false
kgBottomPanelTab: "timeline"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
planned_run_ready_demo:
  id: "mmorpg"
  activation: "disabled-until-runtime-ready"
  identity_authority: "future source-authored run_ready_demo.id after runtime-readiness approval"
  imported_path_alias_required: false
  identity_conflict: "fail closed when path and source identity disagree"
  dev_command: "npm run dev"
  canonical_source_file: "/docs/workspace-seeds/knowgrph-game-mmorpg-demo.md"
  env_selector: "VITE_KNOWGRPH_RUN_READY_DEMO=mmorpg"
  validation_seed_path: "/knowgrph-game-mmorpg-demo.md"
  source_root: "knowgrph/docs"
  source_backed: true
  clean_canvas_recommended: true
  native_runtime: false
  presentation: "design-only-flow-canvas"
  document_presentation: "workspace-design-record"
  auto_start: false
  external_dependencies: []
  forbid_external_copy_or_dependency: true
scope_reconciliation:
  tension: "a networked massively-multiplayer shared world conflicts with the zero-infra, local-first, offline-first, and no-Supabase constraints"
  resolution: "the planned runtime is an offline, single-player, MMO-style RPG world; networked shared-world play is deferred and out of scope"
planned_native_mmorpg_demo:
  runtime_owner: "MMORPG World surface on the shared XR Canvas"
  multiplayer: "none — offline single-player only in this increment"
  deterministic_step: true
  world_model: "in-repo deterministic movement, AABB zone collision, NPC scoring, dialogue, quests, and inventory; no external engine, navmesh, or LLM"
  collision: "authored XR AABB slab catalog (shared canonical spatial source); no mesh colliders or navmesh"
  camera_mode: "fixed-follow"
  camera:
    default: "fixed-follow"
    selector: "FloatingPanel Camera / SHOOT / Camera source"
    available: ["fixed-follow", "free-orbit"]
    invocation: "/camera.select @camera #camera camera=fixed-follow|free-orbit"
    timeline_override: "camera-mark playback temporarily owns framing"
  scene: "procedural Singapore waterfront zone"
  terrain:
    default: "singapore"
    selector: "XR Terrain / Environment catalog"
    available: ["singapore", "tropical-playground"]
  world_content:
    npcs: "3-5 authored NPCs with one deterministic dialogue tree"
    quest: "one quest with a completion objective"
    inventory: "small bounded inventory with one pickup item"
    objective: "accept the quest, complete its objective, and return"
  input:
    keyboard:
      movement: ["W", "A", "S", "D", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]
      interact: "E"
      inventory: "I"
    touch: "virtual stick + interact button"
    gamepad:
      movement: "standard left stick"
      interact: "standard primary action"
  lifecycle: ["develop-and-run", "pause", "resume", "reset", "exit"]
planned_asset_provenance_pipeline:
  tracks:
    procedural: "Track A (preferred) — in-repo deterministic TypeScript + JSON generators (zones, props, loot); diffable"
    ai_generated: "Track B — img2threejs TypeScript + JSON scene spec (primary) with TRELLIS.2 opaque binary GLB (fallback); offline authoring"
    internet_sourced: "Track C — FOSS/redistributable assets committed local with a provenance + license manifest; license-gated"
  provenance_record: "{ assetId, track, origin, license, attribution, representation, diffable }"
  loader_preference: "prefer a diffable spec/procedural representation whenever more than one exists"
  license_gate: "fail closed on missing/incompatible license or empty origin"
  runtime_model_calls: 0
  runtime_network_calls: 0
  runtime_asset_generation_calls: 0
  authoring_step: "offline only; no image-to-3D model, asset generator, network fetch, or Cloudflare resource is invoked at runtime to obtain any asset"
  diffability: "diffable procedural/spec assets preferred; opaque-binary and internet-sourced counts tracked and minimized"
  native_in_repo: true
  forbid_external_copy_or_dependency: true
  inspiration_reference_only: "github.com/Julian-adv/OpenMMO (inspiration only; no source copy, no dependency)"
planned_motion_control:
  runtime: "browser-local LiteRT.js"
  model: "Google BlazePose GHUM Full"
  permission: "explicit Start action"
  frame_upload: false
  frame_persistence: false
  world_role: "optional normalized player input only; never an NPC, dialogue, or quest policy"
  invocation: "/motion.control @canvas #pose operation=start backend=auto"
planned_mmorpg_world:
  companion_view: "mmorpgWorld"
  invocation: "/mmorpg @canvas #world operation=open"
  invocation_prefix: "/mmorpg @canvas #world"
  invocation_policy: "exactly one /mmorpg command, one @canvas binding, and one #world semantic"
  operations: ["open", "start", "stop", "restart", "interact", "save", "exit"]
  operation_invocations:
    open: "/mmorpg @canvas #world operation=open"
    start: "/mmorpg @canvas #world operation=start"
    stop: "/mmorpg @canvas #world operation=stop"
    restart: "/mmorpg @canvas #world operation=restart"
    interact: "/mmorpg @canvas #world operation=interact"
    save: "/mmorpg @canvas #world operation=save"
    exit: "/mmorpg @canvas #world operation=exit"
  web_mcp_schema: "knowgrph-mmorpg-mcp/v1"
  inspect_tool: "knowgrph.inspect_local_mmorpg"
  control_tool: "knowgrph.control_local_mmorpg"
  lifecycle: "retain the authored XR scene while suspending its controller input and simulation; restore both on exit"
  renderer_owner: "the existing React Three Fiber Canvas in shared XR Mode; never a second Canvas"
  scene_composition: "authored XR atmosphere, zone, and props plus the player, NPCs, world props, camera, and HUD overlay; no fallback arena"
  simulation_clock: "ready at tick zero until normalized desktop, pointer, touch, gamepad, Motion Control, or MCP input"
  webgl_gate: "synchronous probe; fail closed on the local fallback surface"
  stop_start: "resume the exact in-memory world tick and state"
  decision_persistence: "browser-local WorkspaceFs; terminal Decisions remain pending until explicit Save and are never auto-saved"
  malformed_hydration: "preserve bytes and block Start and Restart until explicit Reset"
  multiplayer_boundary: "no networked multiplayer session, remote sync, Supabase call, or Cloudflare resource is opened or required; fail closed if a remote/multiplayer path is invoked"
  validation_input_forbid_hardcode_in_repo: true
planned_runtime_validation:
  mode_activation: ["xr surface", "3d renderer", "xr stage"]
  required_states: ["ready", "running", "paused"]
  replayable: true
  local_assets_only: true
  required_external_calls: false
  multiplayer_sessions: 0
  asset_provenance_required: true
  asset_license_gate: true
  editor_chrome: true
  status: "pending — no runtime-readiness proof exists yet for this draft module"
planned_mcp_control:
  inspect_tool: "knowgrph.inspect_local_mmorpg"
  control_tool: "knowgrph.control_local_mmorpg"
  launch: "/mmorpg @canvas #world operation=open"
  start: "/mmorpg @canvas #world operation=start"
  reset: "/mmorpg @canvas #world operation=restart"
flow:
  direction: {key: direction, type: string, value: "LR"}
  edgeType: {key: edgeType, type: string, value: "smoothstep"}
  balancedViewportPreset: {key: balancedViewportPreset, type: string, value: "widgetFrontmatter"}
  nodes:
    - id: {key: id, type: string, value: "mmorpg_demo_entry"}
      type: {key: type, type: string, value: "MmorpgDemoControl"}
      label: {key: label, type: string, value: "Design and Gate"}
      position: {key: position, type: object, value: {"x":0,"y":-360}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:mmorpg_demo_entry"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Inspect the planned offline RPG runtime as a non-activating 2D Flow Canvas design; XR launch remains gated."}
      role: {key: role, type: string, value: "lifecycle"}
      state: {key: state, type: string, value: "draft"}
    - id: {key: id, type: string, value: "mmorpg_world"}
      type: {key: type, type: string, value: "MmorpgDemoWorld"}
      label: {key: label, type: string, value: "RPG World"}
      position: {key: position, type: object, value: {"x":0,"y":-120}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:mmorpg_world"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Plan one zone, authored NPC dialogue, a bounded quest, and an item pickup under deterministic in-repo systems."}
      role: {key: role, type: string, value: "controller"}
    - id: {key: id, type: string, value: "mmorpg_asset_provenance"}
      type: {key: type, type: string, value: "MmorpgDemoAssetProvenance"}
      label: {key: label, type: string, value: "Asset Provenance (procedural + AI-gen + sourced)"}
      position: {key: position, type: object, value: {"x":0,"y":120}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:mmorpg_asset_provenance"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Plan committed local assets across three tracks, preferring diffable specs and requiring a provenance + license gate."}
      role: {key: role, type: string, value: "asset"}
    - id: {key: id, type: string, value: "mmorpg_runtime_gate"}
      type: {key: type, type: string, value: "MmorpgDemoValidation"}
      label: {key: label, type: string, value: "Planned Runtime Gate"}
      position: {key: position, type: object, value: {"x":0,"y":360}}
      "flow:widgetFormId": {key: "flow:widgetFormId", type: string, value: "fm:mmorpg_runtime_gate"}
      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}
      output: {key: output, type: string, value: "Target validation must cover deterministic stepping, movement/collision, NPC/quest/inventory, camera source, input, asset provenance/license gating, and the no-multiplayer boundary."}
      role: {key: role, type: string, value: "validation"}
      state: {key: state, type: string, value: "draft"}
  edges:
---

# Native MMORPG World

This Source Files document is the design record for a planned browser-local, **offline single-player MMO-style RPG world**. It opens as a neutral 2D Flow Canvas with operator panels closed; it does not activate XR, mount an MMORPG panel, register MCP tools, or start a runtime.

A **networked massively-multiplayer** shared world conflicts with the zero-infra, local-first, offline-first, and no-Supabase constraints and is **out of scope**. The target design is an offline, single-player, "MMO-flavored" world (zones, NPCs, quests, inventory, progression). See `docs/documents/knowgrph-game-mmorpg-prd-tad.md`.

## Inspect the draft

From the repository root, run `npm run dev`. In Knowgrph, open **Explorer → Source Files → docs → workspace-seeds → knowgrph-game-mmorpg-demo.md**. Applying this document shows its 2D Flow Canvas design while Explorer remains available. It must leave XR and the proposed MMORPG runtime inactive.

## Planned controls

| Action | Keyboard | Touch | Standard gamepad |
|---|---|---|---|
| Move | W/A/S/D or arrow keys | Virtual stick | Left stick |
| Interact (talk / pick up) | E | Interact button | Primary action |
| Inventory | I | Inventory button | Menu action |
| Pause / Resume / Reset | Simulation controls | Simulation controls | Simulation controls |

The planned control contract uses `knowgrph.control_local_mmorpg` and `/mmorpg @canvas #world`, with browser-local schema `knowgrph-mmorpg-mcp/v1`. Those commands and tools are not registered while this document remains draft; their definitions below are acceptance targets, not current runtime claims.

The planned **FloatingPanel → MMORPG World** companion will reuse the same Canvas after implementation. Until then, applying this draft must not open a panel or substitute the generic motion-reference stage for the missing runtime.

The target camera-source contract is independent of world selection. After implementation, **FloatingPanel Camera → SHOOT** will offer **Fixed Follow** or **Free Orbit**; the proposed invocation is `/camera.select @camera #camera camera=fixed-follow|free-orbit`. Motion Control is planned as optional normalized player input only and must never become an NPC, dialogue, or quest policy.

The target persistence contract keeps terminal world results pending and never auto-saves them. **Save** is planned as the only operation that persists validated Decisions (dialogue outcomes, quest flags, world-tick results) through browser-local WorkspaceFs. Malformed saved bytes must remain intact and block **Start** and **Restart** until the operator explicitly chooses **Reset local save**.

## Planned asset provenance (native, in-repo, three-track)

The target world-content pipeline is a governed mix of committed local assets, loaded offline, each with a provenance + license record:

- **Track A — Procedural / programmatic (preferred):** in-repo deterministic TypeScript + JSON generators (zones, props, loot) — most diffable, lowest TCO, deterministic.
- **Track B — AI-generated (offline):** img2threejs TypeScript + JSON scene spec (primary, diffable) with a committed TRELLIS.2 opaque binary GLB fallback where a spec is unavailable.
- **Track C — Internet-sourced:** FOSS/redistributable assets committed local with a mandatory provenance + license manifest (origin, license, attribution); license-gated.

Every future asset must carry `{ assetId, track, origin, license, attribution, representation, diffable }`; the planned loader must prefer a diffable spec/procedural representation, and the planned license gate must fail closed on a missing/incompatible license or empty origin. No image-to-3D model, asset generator, network fetch, or Cloudflare resource may be invoked at runtime to obtain an asset. The asset-mix framing is inspired by an external MMO project but copies none of its source and takes no dependency on it.

## Promotion gates

- [x] Draft source opens a 2D Flow Canvas, closes the FloatingPanel, and does not select XR/3D or auto-start.
- [ ] After promotion to `run_ready_demo`, the source-backed seed activates XR, 3D rendering, and its implemented canonical stage.
- [ ] The offline RPG world runs through one native deterministic simulation owner (in-repo movement/collision/NPC/quest/inventory; no external engine, navmesh, or LLM).
- [ ] Keyboard, touch, and standard gamepad inputs normalize to one world control state.
- [ ] Fixed Follow and Free Orbit are user-selectable through Camera and `/camera.select`; Timeline playback remains the temporary higher-priority framing owner.
- [ ] Normal `npm run dev` exposes this canonical Source Files document exactly once.
- [ ] Applying the document keeps Explorer available and starts the world with a spawned player and NPCs.
- [ ] Every asset resolves to a committed local file across the three tracks, carries a provenance + redistributable-license record, prefers a diffable spec, and passes the license gate; no runtime generation or network/model call runs.
- [ ] FloatingPanel MMORPG World reuses the same shared-XR Canvas and provides Open, Start, Stop, Restart, Interact, Save, and Exit.
- [ ] Strict `/mmorpg @canvas #world` invocation and browser-local WebMCP schema/tools reject duplicate or conflicting bindings.
- [ ] Two identical input traces yield identical canonical world results (deterministic replay).
- [ ] Motion Control is optional player input only; it never becomes an NPC, dialogue, or quest policy.
- [ ] No networked multiplayer session, remote sync, Supabase call, or Cloudflare resource is opened or required; remote/multiplayer paths fail closed.
- [ ] Terminal Decisions remain pending until explicit Save; malformed hydration blocks Start and Restart until explicit Reset.
- [ ] Source-authored `run_ready_demo.id` owns imported activation without a path alias and conflicts fail closed.
- [ ] No remote assets, provider calls, external runtime dependencies, or external source copies are required.
