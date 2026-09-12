---
title: "Reference implementation: agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm section 1"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "3.0.1"
date: "2026-09-12"
lang: "en-US"
owner: "Solo Founder / AI Orchestrator"
continuity_id: "PLAN-AGENTIC-GRAPH-AR-VR-XR-PRD-TAD-ADR-MVP-GTM"
prd_revision: "3.0.1"
tad_revision: "3.0.1"
adr_revision: "3.0.1"
mvp_revision: "3.0.1"
gtm_revision: "3.0.1"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "1-402"
---

[Combined planning owner](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-AR-VR-XR-PRD-TAD-ADR-MVP-GTM@3.0.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.



# agentic-graph AR/VR/XR — Device-Agnostic Capture, Viewing, Native In-Repo Spatial Authoring & Game Simulation

**Contents**: Part I — PRD (Feature A: Capture & Viewing · Feature B: Native In-Repo Spatial Authoring Toolkit · Feature C: Native In-Repo Game Simulation Layer) · Part II — TAD · Part III — ADR-1 through ADR-12 · Part IV — Agent-Platform Readiness · Part V — Invocation Register · Part VI — Readiness Gap Matrix · Part VII — Validation Checklist Status

**Revision note (v3.0.0, corrected 2026-08-08)**: supersedes v2.0.0. Feature A and Feature B, and ADR-1 through ADR-9, are carried forward. Feature C records one immediate increment, AC-14 collision-to-behavior routing, by adapting the existing native spatial-physics event stream to the existing behavior dispatcher. AC-13, AC-15, AC-16, and AC-17 remain explicit follow-on slices and carry no implementation or readiness claim here. ADR-10 and ADR-11 correct the ECS and physics ownership record; ADR-12 remains proposed.

---

## Part I — Product Requirements (PRD)

### Feature A: Device-Agnostic AR/VR/XR Capture & Immersive Viewing Layer

#### Problem Statement
Users capturing real-world footage (event flyovers, launches, performances, or everyday spatial documentation) via a phone camera cannot currently connect that footage into agentic-graph's canvas/graph as an immersive, device-independent asset. Existing immersive-capture pipelines require dedicated calibrated stereo hardware or platform-locked native AR SDKs, defeating the browser-native, zero-TCO, min-viable-max-value orientation of the product. Meanwhile, no unified capability layer exists inside the repo to detect what a given device/browser can actually do (immersive session support, monocular-camera-only, or native handoff) and degrade gracefully. The opportunity: a capability-detected, progressive-enhancement XR layer that turns any phone camera into a usable spatial-capture device and any supported headset/browser into a compatible viewer, without new paid infrastructure.

#### Personas
- **Solo Builder / Operator** (primary; also the Founder) — captures event or product footage on a personal phone, wants it to render immersively inside agentic-graph's canvas and be viewable by others on whatever device they own.
- **Node/Graph Viewer** — opens a agentic-graph node on a phone, desktop, an Android-class immersive-capable headset, or an iOS-headset-class device, and expects a reasonable spatial experience regardless of device, without installing a native app.

#### User Journey Stage
Addresses the "capture → publish → view" segment of the agentic-graph asset lifecycle journey — the stage after a canvas node is created and before it is available as a shareable spatial artifact.

##### Journey: Solo Builder — Capture and publish a spatial asset from a phone

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Wants to document a live event or object as a spatial asset | agentic-graph canvas, "capture" affordance | No existing capture path exists in-canvas | Add first-class capture entry point |
| Discover | Opens capture UI on whatever phone is on hand | Browser camera permission prompt | Uncertainty whether device is "AR capable" | Capability badge shown before capture starts |
| Engage | Records footage; sees live depth/parallax preview | In-canvas capture widget | Frame drops / thermal throttling on live synthesis | Default-to-live with automatic fallback to post-process |
| Complete | Footage becomes a viewable spatial node | Canvas node, asset contract | Output quality inconsistent across devices | Explicit capability tier stored with the asset, so viewers know what to expect |
| Return | Views the same node later on a different device | Canvas / headset viewer | No universal viewer path | Progressive-enhancement viewer (flat → parallax → immersive session) |

#### User Stories

**As a** solo builder **I want** to capture spatial video from any phone's camera **So that** I don't need dedicated stereo/immersive hardware to add spatial assets to a agentic-graph canvas. *(Journey: Trigger/Engage)*

**As a** solo builder **I want** the capture pipeline to run live depth-based stereo synthesis by default **So that** I get an immediate spatial preview without a separate processing step. *(Journey: Engage)*

**As a** solo builder **I want** live synthesis to fall back automatically to a post-process step **So that** capture never fails or drops frames on lower-powered devices. *(Journey: Engage/Complete)*

**As a** node/graph viewer **I want** the canvas to detect my device's XR capability **So that** I see the best available spatial experience without manual configuration. *(Journey: Discover/Return)*

**As a** node/graph viewer on a capable headset **I want** to open the same spatial asset in an immersive session where supported **So that** I don't need a separate native app to view agentic-graph content immersively. *(Journey: Return)*

#### Acceptance Criteria

**AC-1 — Capability detection**
**Given** a user opens the capture or viewer surface on any device **When** the page loads **Then** the runtime reports exactly one capability tier (`webxr-ar`, `webxr-vr`, `pseudo-ar-depth-parallax`, `flat-fallback`) before any capture or session action is offered.

> **VCC translation**: `Verify the capability-detection function returns exactly one tier value from the closed enum for a mocked device-feature matrix covering iOS-class, Android-class, headset-class, and desktop devices, and no tier is inferred from a user-agent string alone`

**AC-2 — Live capture default**
**Given** a device reports sufficient frame budget **When** the user starts capture **Then** monocular-depth-based stereo synthesis runs per-frame during capture and a live parallax preview is shown.

> **VCC translation**: `Verify the capture session emits a synthesized stereo frame pair for ≥90% of captured frames in a fixed-length test clip at target frame budget, with no frame written twice`

**AC-3 — Automatic post-process fallback**
**Given** live synthesis cannot sustain the frame budget **When** frame time exceeds the configured threshold for N consecutive frames **Then** the session drops to raw-capture-plus-depth-metadata mode and queues a post-process synthesis job on save, without failing the capture.

> **VCC translation**: `Verify a simulated frame-budget breach triggers fallback within N frames, capture continues to completion, and a post-process job record is written with the raw clip and depth-metadata reference`

**AC-4 — Progressive-enhancement viewing**
**Given** a saved spatial asset **When** it is opened on any supported device **Then** the viewer renders the asset at the highest tier the capability detection reports, and at minimum renders a flat 3D fallback on every device.

> **VCC translation**: `Verify the viewer component renders without throwing for each of the four capability tiers in a mocked matrix, and the flat-fallback tier is reachable with zero optional dependencies loaded`

**AC-5 — iOS engine reality**
**Given** the device is iOS-class (any installed browser on that platform) **When** capability is detected **Then** the tier never reports `webxr-ar` or `webxr-vr`, and resolves to `pseudo-ar-depth-parallax` or `flat-fallback` only.

> **VCC translation**: `Verify capability detection on an iOS-class user-agent/feature matrix never returns a webxr-* tier, for every browser variant in the test matrix`

#### Success Metrics

| Metric | Baseline | Target | Timeline |
|--------|----------|--------|----------|
| Capture sessions completed without failure | — (feature does not exist) | ≥95% of started sessions reach a saved asset | 30 days post-ship |
| Live-synthesis sustain rate (devices meeting frame budget) | — | ≥60% of capture sessions stay in live mode without triggering fallback | 30 days post-ship |
| Readiness rung (local / delivered) | `undocumented` / `undocumented` | `runtime-ready` / `runtime-ready` | Phase 3 gate |
| Time-to-value (TTV steps) | n/a | ≤3 steps (open capture → grant camera → start capture) | Phase 0 estimate, validated Phase 3 |
| Time-to-value (TTV elapsed) | n/a | ≤60 sec to first live parallax preview frame | Phase 0 estimate, validated Phase 3 |
| Token cost / month | n/a | $0.00 (all inference client-side; no LLM token spend in this feature) | Ongoing |
| Monthly TCO | n/a | $0.00 incremental (no new server compute, no new storage class) | Ongoing |
| ROI Score | — | ≥ solo-dev threshold (see ROI Calculation) | Sprint 1 |

**Time-to-Value detail**:

| Dimension | Estimate | Target ceiling | Validation method |
|---|---|---|---|
| TTV steps | 3 steps | ≤3 steps | Walk-through on clean env |
| TTV elapsed time | ~45 sec | ≤60 sec | Timed first-run test |
| First-value action | Live parallax preview frame rendered after camera grant | — | Observable output defined |
| Persona | Solo Builder / Operator | — | Persona defined above |

**ROI Calculation**:
```
User Impact = 4  (solo builder currently has no spatial-capture path at all; high pain, moderate frequency)
Reach       = 1  (solo operator + early node viewers; single-digit monthly sessions at this stage)
Build Hours = 40 (capability detection + capture layer + fallback + viewer wiring, estimate)
Monthly TCO = 0
Token Cost  = 0

ROI Score = (4 × 1) / (40 + 0 + 0) = 0.10
```
Low absolute reach keeps the raw ROI score low; the item is scoped Must-tier anyway because it unblocks the asset-contract's spatial-media class entirely (foundational, not reach-driven). This is an explicit MoSCoW override, documented below, consistent with the Min-Viable-Max-Value lens.

#### MoSCoW Priority

| Tier | Item | ROI score | Rationale |
|---|---|---|---|
| **Must** | Capability detection (4-tier enum) | n/a (foundational) | Every other item depends on a correct tier value; zero build cost to defer risk |
| **Must** | Capture layer: camera feed + monocular depth + live synthesis | 0.10 | Core deliverable; unblocks spatial-asset class |
| **Must** | Automatic post-process fallback | n/a (safety) | Prevents capture failure on lower-powered devices; required for AC-3 |
| **Should** | Progressive-enhancement viewer (flat → parallax → immersive session) | n/a (paired with capture) | Needed to consume what capture produces; can ship one tier at a time |
| **Should** | Markerless anchoring fallback for iOS-class in-canvas AR | n/a | Improves iOS-class experience but flat/parallax viewing works without it |
| **Could** | Native AR handoff for full 6DoF placement | n/a | High-fidelity but leaves the canvas runtime; defer until Must-tier proves demand |
| **Won't (this increment)** | Calibrated-stereo capture (purpose-built immersive-camera ingestion) | n/a | Out of zero-TCO envelope; a hardware-tier gap, not a browser-native capability gap |
| **Won't (this increment)** | Proprietary spatial-video container encoding | n/a | Requires a native toolchain outside the browser runtime; tracked as an explicit exclusion |

#### Min-Viable Scope
The smallest deliverable satisfying Must-tier acceptance criteria: capability detection returning one of four tiers; live capture with per-frame monocular-depth-based stereo synthesis; automatic fallback to raw-capture-plus-metadata with a queued post-process job when frame budget is exceeded. Explicitly excludes the viewer's immersive-session wiring, native AR handoff, and any calibrated-stereo or proprietary-container encoding path.

#### Out of Scope
- Purpose-built calibrated-stereo camera ingestion (hardware-tier capture)
- Proprietary spatial-video container encoding (native-toolchain-only muxing)
- Multi-device synchronized playback
- Server-side depth inference (this feature is client-side-only by design)

#### Dependencies
- Existing canvas rendering runtime (rendering baseline)
- Existing browser-native CV inference layer (monocular depth model, already selected under the FOSS gate — see ADR-2)
- Existing markerless-tracking component (already selected under the FOSS gate — see ADR-1)
- Existing native-handoff component for 3D model presentation (already selected under the FOSS gate — see ADR-1)
- The existing asset-contract schema, extended with an XR-capability field (see TAD Integration Contracts)

#### Open Questions
- What frame-time threshold (ms) should trigger the live→post-process fallback, and should it be device-class-tunable or a single global constant?
- Should the post-process job run as a foreground "processing…" state on the asset node, or a background job the user can navigate away from?
- Does the `pseudo-ar-depth-parallax` tier need its own explicit user-facing label, or should it be presented identically to `flat-fallback` with parallax as an invisible enhancement?

---

### Feature B: Native In-Repo Spatial Authoring Toolkit

#### Problem Statement
To author spatial scenes, materials, behaviors, particle effects, rigged animation, or to manage and package immersive video libraries, the solo builder currently has to leave the repo entirely and use native desktop applications — a visual spatial-authoring IDE with node-based material/behavior/particle graphs, a consumer-grade AR scene composer, a dedicated immersive-video library/packaging utility, and a full 3D content-creation suite. Each is native-desktop-only, breaking the zero-install, browser-native, single-codebase posture, and introducing a platform dependency that blocks the cross-platform SEA/China market orientation. The opportunity: build the equivalent authoring capability natively in-repo, running entirely in-browser, with zero dependency on any native desktop application.

#### Personas
- **Solo Builder / Operator** (primary) — authors spatial scenes, materials, behaviors, particle effects, and animation without leaving the browser or requiring a specific desktop OS.
- **Node/Graph Viewer** — benefits indirectly: assets authored through this toolkit conform to the same asset contract as Feature A's captured assets, so viewing behavior is unaffected by which tool authored the content.

#### User Journey Stage
Addresses the "author → preview → publish" segment of the agentic-graph asset lifecycle — upstream of Feature A's "capture → publish → view" segment, converging on the same asset-contract publish step.

##### Journey: Solo Builder — Author a spatial scene entirely in-browser

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Wants to build a spatial scene or behavior without opening a native authoring app | agentic-graph canvas, "author" affordance | No in-canvas authoring surface exists | Add first-class authoring entry point |
| Discover | Opens in-canvas authoring surface | Authoring UI shell | Uncertainty about what's authorable in-browser vs. native-only | Explicit capability/feature-parity notice |
| Engage | Composes entities/components, wires material and behavior graphs, authors particles, sequences animation | Node graph editor, timeline, viewport | Authoring tools historically require a native IDE | Full authoring loop stays in one browser tab |
| Complete | Scene exports as a published asset | Canvas node, asset contract | Format lock-in to a native-only container | Publishes through the same asset-contract path as captured assets |
| Return | Edits the scene later | Authoring UI | Round-tripping through a native app to make a small change | Same in-browser editor reopens the same scene |

#### User Stories

**As a** solo builder **I want** to compose scenes from entities and components in-browser **So that** I don't need a native entity-component-system authoring environment. *(Journey: Engage)*

**As a** solo builder **I want** to author materials visually via a node graph **So that** I don't need a native shader-graph tool. *(Journey: Engage)*

**As a** solo builder **I want** to wire trigger-to-behavior logic visually **So that** I don't need a native behavior/script-graph tool. *(Journey: Engage)*

**As a** solo builder **I want** to author and preview GPU particle effects in-canvas **So that** I don't need a native particle-authoring tool. *(Journey: Engage)*

**As a** solo builder **I want** to rig and sequence animation on a timeline **So that** I don't need a native DCC's animation/timeline editor. *(Journey: Engage)*

**As a** solo builder **I want** to manage and package captured immersive video into deliverable containers in-browser **So that** I don't need a native immersive-video library utility. *(Journey: Engage/Complete)*

**As a** solo builder **I want** live edit-to-device preview **So that** I don't need a native live-preview-plus-companion-display workflow. *(Journey: Engage)*

#### Acceptance Criteria

**AC-6 — ECS scene composition**
**Given** an empty canvas **When** the builder adds an entity and attaches components **Then** the entity renders with those components applied and the scene is queryable by component type.

> **VCC translation**: `Verify a test scene with N entities and M component types returns the correct entity set for a component-type query, with no entity duplicated in the result`

**AC-7 — Node-based material authoring**
**Given** a node-material graph is wired **When** it is compiled **Then** the resulting material renders on the target mesh matching the graph's evaluated output.

> **VCC translation**: `Verify a reference node graph (e.g. albedo × texture → output) produces a compiled shader that renders without error on a test mesh`

**AC-8 — Visual behavior/script graph**
**Given** a trigger node is connected to an action node **When** the trigger event fires **Then** the action node's effect is invoked exactly once.

> **VCC translation**: `Verify a simulated trigger event invokes the wired action callback exactly once, and an unwired trigger produces no callback`

**AC-9 — Particle authoring**
**Given** a particle-emitter configuration **When** the emitter runs **Then** particle count stays within the configured rate/lifetime/ceiling bounds.

> **VCC translation**: `Verify particle count never exceeds the configured ceiling over a fixed-duration test run`

**AC-10 — Animation timeline/sequencing**
**Given** a rigged entity and a keyframe sequence **When** played back **Then** interpolated bone/property values match expected values between keyframes.

> **VCC translation**: `Verify interpolated values at a sampled time match expected values within tolerance for a reference keyframe set`

**AC-11 — In-browser packaging**
**Given** a captured raw clip and its encoded tracks **When** packaging runs **Then** a single deliverable container is produced containing those tracks, playable in a standard browser video element.

> **VCC translation**: `Verify the produced container's track count and codec match the input, and the file plays back without error in a headless browser test`

**AC-12 — Live edit-to-device preview**
**Given** an authoring session and a connected viewer session **When** an edit is made **Then** the change appears in the viewer session within a bounded latency, without a build step.

> **VCC translation**: `Verify a test edit event propagates to a mock viewer session within N ms, with no full-page reload triggered`

#### Success Metrics

| Metric | Baseline | Target | Timeline |
|--------|----------|--------|----------|
| Authoring sessions completed without a native-app handoff | — (feature does not exist) | 100% of scenes authored end-to-end in-browser | 30 days post-ship |
| Live-preview propagation latency | — | ≤ N ms (see Open Questions) | 30 days post-ship |
| Readiness rung (local / delivered) | `undocumented` / `undocumented` | `runtime-ready` / `runtime-ready` | Phase 3 gate |
| Time-to-value (TTV steps) | n/a | ≤4 steps (open authoring UI → add entity → attach component → see it render) | Phase 0 estimate, validated Phase 3 |
| Time-to-value (TTV elapsed) | n/a | ≤90 sec to first rendered entity | Phase 0 estimate, validated Phase 3 |
| Token cost / month | n/a | $0.00 (no LLM-backed component in this feature) | Ongoing |
| Monthly TCO | n/a | $0.00 incremental | Ongoing |
| ROI Score | — | ≥ solo-dev threshold (see ROI Calculation) | Sprint 1 |

**ROI Calculation**:
```
User Impact = 4  (currently requires leaving the repo for native tools entirely; high pain, recurring)
Reach       = 1  (solo operator at this stage)
Build Hours = 90 (ECS core + node graph engine + two compiler backends, estimate; excludes Could-tier items)
Monthly TCO = 0
Token Cost  = 0

ROI Score = (4 × 1) / (90 + 0 + 0) = 0.04
```
Even lower raw ROI than Feature A given the larger build-hour estimate; retained as Must/Should-tier for the ECS core and material graph specifically because they are foundational (every other authoring primitive depends on them), consistent with the Min-Viable-Max-Value lens's foundational-item override.

#### MoSCoW Priority

| Tier | Item | ROI score | Rationale |
|---|---|---|---|
| **Must** | ECS Core (custom in-repo scene model) | n/a (foundational) | Every other authoring primitive attaches to this |
| **Must** | Material Graph Compiler (node-based) | 0.04 | Highest-value single authoring primitive; replaces the most-used native tool surface |
| **Should** | Behavior Graph Compiler (node-based) | n/a | Depends on ECS Core and the shared graph engine from the Material Graph Compiler item |
| **Should** | Container Muxer (in-browser packaging) | n/a | Closes the loop with Feature A's capture output; narrow, bounded scope |
| **Could** | Particle System Component | n/a | Polish item; not blocking for a first authored scene |
| **Could** | Timeline Sequencer | n/a | Polish item; depends on ECS Core and rigging, larger build cost |
| **Could** | Live Preview Channel | n/a | Ergonomics improvement; authoring works without it via manual refresh |
| **Won't (this increment)** | Full mesh sculpting / topology editing | n/a | DCC-grade modeling is a separate, large scope; not evaluated in this increment |
| **Won't (this increment)** | OpenUSD scene interchange | n/a | License gate failure at current OpenUSD terms; see ADR-9 |

#### Min-Viable Scope
The smallest deliverable satisfying Must-tier acceptance criteria: ECS Core (entity/component storage and query) and the Material Graph Compiler (node-based material authoring compiling to the existing shading-language node-material system). Explicitly excludes the Behavior Graph Compiler, Particle System Component, Timeline Sequencer, Container Muxer, and Live Preview Channel.

#### Out of Scope
- Full mesh sculpting / topology editing (DCC-grade modeling)
- OpenUSD-based scene composition (see ADR-9)
- Multi-user real-time collaborative editing
- Any server-side rendering or compute for authoring (client-side-only by design, matching Feature A)

#### Dependencies
- Existing canvas rendering runtime (shared with Feature A)
- Existing asset-contract schema, extended with a behavior-graph contract (see TAD Integration Contracts)
- Existing generative-asset-creation pipeline (unchanged by this feature; referenced, not modified, for any future "generate a starting asset" affordance)
- Feature A's Asset Contract Writer and Progressive Viewer (shared publish/view path)

#### Open Questions
- Should Feature A's Capture Surface and Inference Runtime eventually migrate onto ECS Core as their scene model, or remain independent function-based components indefinitely?
- Should the behavior-graph contract be a new top-level schema or a nested extension of the existing asset-contract schema?
- What is the acceptable live-preview propagation latency ceiling (drives AC-12's `N ms` parameter)?

---

### Feature C: Native In-Repo Game Simulation Layer

#### Problem Statement
agentic-graph already owns a native browser-local 3D physics engine, XR physics adapter/runtime, collision and sensor events, fixed stepping, impulses, scene queries, snapshots, and the `/xr.physics @canvas` control grammar. The current gap is narrower: `xrSpatialPhysicsAdapter.ts` drains and discards `SpatialPhysicsEvent` values instead of routing collision transitions to `behaviorDispatcher.ts`. This increment closes only that AC-14 seam. Forces/joints (AC-13), spatial audio (AC-15), portal pixels (AC-16), and unified pointer/touch/hand-ray input (AC-17) require separate owner-aligned increments and are not represented as existing or delivered here.

#### Personas
- **Solo Builder / Operator** (primary) — builds interactive spatial games or game-like experiences without a native game engine.
- **Node/Graph Viewer** — plays or interacts with a published game-mode node across devices, benefiting from the same progressive-enhancement viewing path as every other asset class in this document.

#### User Journey Stage
Extends Feature B's "author → preview → publish" segment with a simulation step between authoring and publish — physics, collisions, audio, and interaction all need to be authorable and testable before a scene is published as a playable node.

##### Journey: Solo Builder — Build an interactive spatial scene with physics and behavior

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Wants an existing XR physics contact to invoke authored behavior | Existing XR scene and `/xr.physics` controls | Collision transitions are generated but discarded by the adapter | Preserve and normalize the native event stream |
| Discover | Binds a collision transition to a behavior source entity | Existing behavior graph/runtime | Collision triggers are not in the dispatcher's closed trigger union | Add explicit collision-begin/end triggers at the canonical dispatcher |
| Engage | Simulates a contact and observes its bound action | XR physics runtime and behavior dispatcher | No canonical bridge currently connects the two owners | Route each normalized transition exactly once through the existing dispatcher |
| Complete | Scene simulates correctly and publishes | Canvas node, asset contract | Simulation-authored scenes have no clear publish/test boundary | Reuses Feature A/B's existing publish path unchanged |
| Return | Tunes physics/audio/portal parameters later | Authoring UI | Round-tripping through a native engine to retune values | Same in-browser editor reopens the same scene |

#### User Stories

**As a** solo builder **I want** entities to have rigid-body physics with mass, forces, and joints **So that** I don't need a native physics engine integration to prototype game mechanics. *(Journey: Trigger/Engage)*

**As a** solo builder **I want** collision/contact events to drive the existing behavior graph **So that** physics interactions can trigger authored behaviors without custom glue code. *(Journey: Engage)*

**As a** solo builder **I want** entities to emit spatial/positional audio **So that** I don't need a native spatial-audio framework. *(Journey: Engage)*

**As a** solo builder **I want** to render a portal that shows another scene or region through a masked opening **So that** I don't need a native portal-rendering framework. *(Journey: Engage)*

**As a** solo builder **I want** a unified hover/interaction input model across mouse, touch, and hand-tracking **So that** I don't need separate native input handling per platform. *(Journey: Engage)*

#### Acceptance Criteria

**AC-13 — Rigid-body forces and joints (follow-on; not implemented by this increment)**
**Given** an entity with a Physics Component and a force applied **When** the simulation steps **Then** the entity's position/velocity update according to rigid-body dynamics, and any configured joints/constraints stay within their defined limits.

> **VCC translation**: `Verify a reference rigid body under a known force reaches an expected position within tolerance after N simulation steps, and a configured joint constrains relative motion within its defined limits`

**AC-14 — Collision event → behavior trigger**
**Given** two entities with Physics Components collide **When** contact begins **Then** a collision event is dispatched, and if a Behavior Graph trigger node is bound to that entity pair, the bound action fires exactly once per contact.

> **VCC translation**: `Verify a simulated contact between two bodies dispatches exactly one collision-begin event, and a bound behavior-graph trigger invokes its action exactly once for that event`

**AC-15 — Spatial audio (follow-on; not implemented by this increment)**
**Given** an entity with a Spatial Audio Component and an active audio source **When** the listener moves relative to the entity **Then** the perceived audio pans and attenuates according to relative position.

> **VCC translation**: `Verify a reference listener-position sweep produces monotonically changing pan/gain values consistent with increasing or decreasing distance and angle from the source entity`

**AC-16 — Portal rendering (follow-on; not implemented by this increment)**
**Given** a Portal Component bound to a masked region and a target scene/camera **When** the portal is in view **Then** the masked region renders the target scene's view instead of the primary scene, without leaking outside the mask boundary.

> **VCC translation**: `Verify a rendered frame's pixels inside the portal mask sample from the target scene's render target, and pixels outside the mask sample from the primary scene, for a reference camera position`

**AC-17 — Unified interaction input (follow-on; no hand-ray source exists today)**
**Given** an Interaction Component on an entity and an active input source (mouse, touch, or hand-tracking ray) **When** the input targets the entity **Then** a hover or select event fires through the same event interface regardless of input source.

> **VCC translation**: `Verify a mocked mouse, touch, and hand-tracking-ray input each produce an equivalent hover/select event shape for the same targeted entity, with no input-source-specific branching visible to the event consumer`

#### Success Metrics

| Metric | Baseline | Target | Timeline |
|--------|----------|--------|----------|
| Existing native spatial-physics regression stability | Existing focused runtime; evidence remains separate from this document | No regression caused by the AC-14 adapter | Candidate gate |
| Collision-event dispatch accuracy | No collision-to-behavior bridge | 100% of admitted collision transitions dispatch once; unbound transitions invoke zero actions | AC-14 focused proof |
| Readiness rung (local / delivered) | `spec-complete` / `undocumented` for AC-14 | Advance only from exact-revision evidence; no target rung is predeclared | Evidence gate |
| Time-to-value (TTV steps) | n/a | ≤4 steps (start the existing physics world → create a collision → bind its collider pair → observe one action) | Phase 0 estimate, validated Phase 3 |
| Time-to-value (TTV elapsed) | n/a | ≤90 sec to first simulated collision | Phase 0 estimate, validated Phase 3 |
| Token cost / month | n/a | $0.00 (no LLM-backed component in this feature) | Ongoing |
| Monthly TCO | n/a | $0.00 incremental | Ongoing |
| ROI Score | — | ≥ solo-dev threshold (see ROI Calculation) | Sprint 1 |

**ROI Calculation**:
```
User Impact = 4  (native physics exists, but collision transitions cannot yet reach authored behaviors; high-value orchestration seam)
Reach       = 1  (solo operator at this stage)
Build Hours = 12 (bounded AC-14 adapter, dispatcher extension, and focused proof estimate)
Monthly TCO = 0
Token Cost  = 0

ROI Score = (4 × 1) / (12 + 0 + 0) = 0.33
```
The bounded bridge reuses both runtime owners and avoids a new engine, dependency, infrastructure surface, or invocation vocabulary.

#### MoSCoW Priority

| Tier | Item | ROI score | Rationale |
|---|---|---|---|
| **Must** | Collision Event Bridge (native physics events → existing behavior dispatcher) | 0.33 | Immediate AC-14 seam; reuses the canonical owners |
| **Won't (this increment)** | AC-13 force accumulation and joints | n/a | Existing native engine supports impulses but not a force accumulator, angular state, or joints; requires a separate design |
| **Won't (this increment)** | AC-15 spatial audio | n/a | Requires a separate media-lifecycle and user-gesture design |
| **Won't (this increment)** | AC-16 portal rendering | n/a | Requires implementation on the sole existing Three/R3F renderer plus pixel proof; ADR-12 remains proposed |
| **Won't (this increment)** | AC-17 unified input | n/a | Pointer/touch adapters and a real hand-ray source are not yet implemented; Apple sensor input is not a hand-ray adapter |
| **Won't (this increment)** | Soft-body, cloth, or fluid simulation | n/a | Outside the admitted native spatial-physics scope; any specialist solver evaluation is a separate increment, not a gap in AC-14 |
| **Won't (this increment)** | Networked/multiplayer physics synchronization | n/a | Tracked under the project's separate FPS/MMORPG PRD/TAD's existing multiplayer plan; not duplicated here |

#### Min-Viable Scope
The smallest deliverable is AC-14 only: return the existing native physics events instead of discarding them, normalize stable collider/body identities, route collision begin/end through the existing exact-once behavior dispatcher, and prove unbound transitions invoke no actions. AC-13, AC-15, AC-16, and AC-17 are excluded.

#### Out of Scope
- Soft-body, cloth, or fluid simulation — outside the admitted native spatial-physics scope; evaluating a specialist solver is a distinct future increment, not a silent AC-14 gap
- Networked/multiplayer physics synchronization — owned by the project's separate FPS/MMORPG PRD/TAD, not duplicated here
- Nested/recursive portal rendering (portal-through-portal) — deferred, see Open Questions and ADR-12
- Any server-side physics computation (client-side-only by design, matching Features A and B)

#### Dependencies
- Native spatial physics: `canvas/src/features/physics/`.
- XR adapter/runtime: `canvas/src/features/three/xrSpatialPhysicsAdapter.ts` and `xrPhysicsRuntime.ts`.
- Existing exact-once behavior owner: `canvas/src/features/xr-v2/behaviorDispatcher.ts`.
- Existing invocation owner: `canvas/src/features/three/xrSceneMcpContract.mjs` and `xrSceneMcpRuntime.ts`; reuse `/xr.physics @canvas #world|#body|#impulse|#controller` without aliases.
- Root `ecs/` remains the agentic ECS owner; this increment does not attach a duplicate physics component or change its numeric-only field contract.

#### Open Questions
- What bounded replay identity and capacity should AC-14 use across pause/reset/restore?
- How should a stable XR subject identifier resolve to the numeric behavior `sourceEntityId` without transferring ECS ownership?
- AC-13, AC-15, AC-16, and AC-17 retain separate design questions and cannot advance on AC-14 evidence.

---

## Part II — Technical Architecture (TAD)

