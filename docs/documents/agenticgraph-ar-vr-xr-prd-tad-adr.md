---
title: "AgenticGraph AR/VR/XR — Device-Agnostic Capture, Viewing, Native In-Repo Spatial Authoring & Game Simulation"
doc_type: "PRD/TAD/ADR"
version: "3.0.0"
date: "2026-08-06"
lang: "en-US"
frontmatter_contract: "required"
owner: "Solo Founder / AI Orchestrator"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: "false"
---

# AgenticGraph AR/VR/XR — Device-Agnostic Capture, Viewing, Native In-Repo Spatial Authoring & Game Simulation

**Contents**: Part I — PRD (Feature A: Capture & Viewing · Feature B: Native In-Repo Spatial Authoring Toolkit · Feature C: Native In-Repo Game Simulation Layer) · Part II — TAD · Part III — ADR-1 through ADR-12 · Part IV — Agent-Platform Readiness · Part V — Invocation Register · Part VI — Readiness Gap Matrix · Part VII — Validation Checklist Status

**Revision note (v3.0.0, corrected 2026-08-08)**: supersedes v2.0.0. Feature A and Feature B, and ADR-1 through ADR-9, are carried forward. Feature C records one immediate increment, AC-14 collision-to-behavior routing, by adapting the existing native spatial-physics event stream to the existing behavior dispatcher. AC-13, AC-15, AC-16, and AC-17 remain explicit follow-on slices and carry no implementation or readiness claim here. ADR-10 and ADR-11 correct the ECS and physics ownership record; ADR-12 remains proposed.

---

## Part I — Product Requirements (PRD)

### Feature A: Device-Agnostic AR/VR/XR Capture & Immersive Viewing Layer

#### Problem Statement
Users capturing real-world footage (event flyovers, launches, performances, or everyday spatial documentation) via a phone camera cannot currently connect that footage into AgenticGraph's canvas/graph as an immersive, device-independent asset. Existing immersive-capture pipelines require dedicated calibrated stereo hardware or platform-locked native AR SDKs, defeating the browser-native, zero-TCO, min-viable-max-value orientation of the product. Meanwhile, no unified capability layer exists inside the repo to detect what a given device/browser can actually do (immersive session support, monocular-camera-only, or native handoff) and degrade gracefully. The opportunity: a capability-detected, progressive-enhancement XR layer that turns any phone camera into a usable spatial-capture device and any supported headset/browser into a compatible viewer, without new paid infrastructure.

#### Personas
- **Solo Builder / Operator** (primary; also the Founder) — captures event or product footage on a personal phone, wants it to render immersively inside AgenticGraph's canvas and be viewable by others on whatever device they own.
- **Node/Graph Viewer** — opens a AgenticGraph node on a phone, desktop, an Android-class immersive-capable headset, or an iOS-headset-class device, and expects a reasonable spatial experience regardless of device, without installing a native app.

#### User Journey Stage
Addresses the "capture → publish → view" segment of the AgenticGraph asset lifecycle journey — the stage after a canvas node is created and before it is available as a shareable spatial artifact.

##### Journey: Solo Builder — Capture and publish a spatial asset from a phone

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Wants to document a live event or object as a spatial asset | AgenticGraph canvas, "capture" affordance | No existing capture path exists in-canvas | Add first-class capture entry point |
| Discover | Opens capture UI on whatever phone is on hand | Browser camera permission prompt | Uncertainty whether device is "AR capable" | Capability badge shown before capture starts |
| Engage | Records footage; sees live depth/parallax preview | In-canvas capture widget | Frame drops / thermal throttling on live synthesis | Default-to-live with automatic fallback to post-process |
| Complete | Footage becomes a viewable spatial node | Canvas node, asset contract | Output quality inconsistent across devices | Explicit capability tier stored with the asset, so viewers know what to expect |
| Return | Views the same node later on a different device | Canvas / headset viewer | No universal viewer path | Progressive-enhancement viewer (flat → parallax → immersive session) |

#### User Stories

**As a** solo builder **I want** to capture spatial video from any phone's camera **So that** I don't need dedicated stereo/immersive hardware to add spatial assets to a AgenticGraph canvas. *(Journey: Trigger/Engage)*

**As a** solo builder **I want** the capture pipeline to run live depth-based stereo synthesis by default **So that** I get an immediate spatial preview without a separate processing step. *(Journey: Engage)*

**As a** solo builder **I want** live synthesis to fall back automatically to a post-process step **So that** capture never fails or drops frames on lower-powered devices. *(Journey: Engage/Complete)*

**As a** node/graph viewer **I want** the canvas to detect my device's XR capability **So that** I see the best available spatial experience without manual configuration. *(Journey: Discover/Return)*

**As a** node/graph viewer on a capable headset **I want** to open the same spatial asset in an immersive session where supported **So that** I don't need a separate native app to view AgenticGraph content immersively. *(Journey: Return)*

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
Addresses the "author → preview → publish" segment of the AgenticGraph asset lifecycle — upstream of Feature A's "capture → publish → view" segment, converging on the same asset-contract publish step.

##### Journey: Solo Builder — Author a spatial scene entirely in-browser

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Wants to build a spatial scene or behavior without opening a native authoring app | AgenticGraph canvas, "author" affordance | No in-canvas authoring surface exists | Add first-class authoring entry point |
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
AgenticGraph already owns a native browser-local 3D physics engine, XR physics adapter/runtime, collision and sensor events, fixed stepping, impulses, scene queries, snapshots, and the `/xr.physics @canvas` control grammar. The current gap is narrower: `xrSpatialPhysicsAdapter.ts` drains and discards `SpatialPhysicsEvent` values instead of routing collision transitions to `behaviorDispatcher.ts`. This increment closes only that AC-14 seam. Forces/joints (AC-13), spatial audio (AC-15), portal pixels (AC-16), and unified pointer/touch/hand-ray input (AC-17) require separate owner-aligned increments and are not represented as existing or delivered here.

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

### Architecture: Device-Agnostic Capture, Viewing, Native In-Repo Spatial Authoring & Game Simulation

#### Overview
**From phone camera feed and in-browser authoring to a published, simulated spatial asset**: [Capture Surface | Authoring Toolkit | Game Simulation Layer] → Capability Detection / ECS Core → asset-contract publish → Progressive-Enhancement Viewer → delivers a spatial asset viewable at the best tier any given device supports, authorable and simulatable entirely in-browser, with zero incremental infrastructure cost and zero native-application dependency.

#### Journey → System Mapping

| Journey Stage | Workflow | Data Flow | Orchestration/Harness Flow | Topology Node(s) | Component |
|---|---|---|---|---|---|
| Capture: Trigger/Discover | Capture Init Workflow | — | — | Capture Surface | Capability Detector |
| Capture: Engage | Live Capture Workflow | Capture Data Flow | Depth Synthesis Harness Flow | Capture Surface, Inference Runtime | Monocular Depth Component, DIBR Synthesizer |
| Capture: Complete | Save & Publish Workflow | Capture Data Flow | Post-Process Fallback Harness Flow (conditional) | Asset Store | Asset Contract Writer |
| Capture: Return | View Workflow | Viewer Data Flow | — | Viewer Surface | Progressive Viewer |
| Author: Trigger/Discover | Authoring Init Workflow | — | — | Authoring Surface | ECS Core |
| Author: Engage | Scene Composition Workflow | Authoring Data Flow | — (deterministic compilers; no AI-powered pipeline) | Authoring Surface | Material Graph Compiler, Behavior Graph Compiler, Particle System Component, Timeline Sequencer |
| Author: Complete | Save & Publish Workflow | Authoring Data Flow | — | Asset Store | Container Muxer, Asset Contract Writer |
| Author: Return | Live Preview Workflow | Viewer Data Flow | — | Authoring Surface, Viewer Surface | Live Preview Channel |
| Simulate: Trigger/Discover | Existing XR Physics Workflow | — | — | Authoring Surface | Native Spatial Physics Runtime |
| Simulate: Engage | AC-14 Collision Dispatch Workflow | Simulation Data Flow | — (deterministic event adapter; no AI-powered pipeline) | Authoring Surface | Native Spatial Physics Runtime, Collision Event Bridge, Behavior Dispatcher |
| Simulate: Complete | Save & Publish Workflow | Authoring Data Flow | — | Asset Store | Asset Contract Writer *(shared with Feature A/B)* |

#### Topology
**Version**: 3 — 2026-08-06
**Boundaries**: Client runtime (browser, any device); no server-side boundary crossed by any feature in this document

**Capture & Viewing nodes** *(unchanged from v1)*:

| Node | Role | Type | Lane | Connects to | Connection type | Data residency |
|---|---|---|---|---|---|---|
| Capability Detector | Producer | Function (client-side) | Authoring | Capture Surface, Progressive Viewer | Sync in-process call | Local (device memory only) |
| Capture Surface | Producer/Consumer | Function (client-side) | Authoring | Inference Runtime, Asset Contract Writer | Sync in-process call | Local (device memory) |
| Inference Runtime | Producer | Function (client-side model runtime) | Authoring | Capture Surface | Sync in-process call | Local (device memory; no network egress) |
| Asset Contract Writer | Consumer/Store | Function → Storage adapter | Authoring/Delivery | Existing asset store | Async write | Region (existing storage residency, unchanged) |
| Progressive Viewer | Consumer | Function (client-side) | Delivery | Asset Contract Writer (read) | Async read | Region (same as Asset Contract Writer) |

**Authoring Toolkit nodes** *(unchanged from v2)*:

| Node | Role | Type | Lane | Connects to | Connection type | Data residency |
|---|---|---|---|---|---|---|
| ECS Core | Store/Router | Function (client-side, in-repo) | Authoring | Material Graph Compiler, Behavior Graph Compiler, Particle System Component, Timeline Sequencer, Live Preview Channel | Sync in-process call | Local (device memory only) |
| Material Graph Compiler | Producer | Function (client-side) | Authoring | ECS Core | Sync in-process call | Local |
| Behavior Graph Compiler | Producer | Function (client-side) | Authoring | ECS Core, *Collision Event Bridge (new)* | Sync in-process call | Local |
| Particle System Component | Producer | Function (client-side, GPU-backed) | Authoring | ECS Core | Sync in-process call | Local |
| Timeline Sequencer | Producer | Function (client-side) | Authoring | ECS Core | Sync in-process call | Local |
| Container Muxer | Consumer | Function (client-side) | Authoring | Asset Contract Writer *(shared with Feature A)* | Async write | Region (existing storage residency) |
| Live Preview Channel | Router | Function (client-side) + existing transport | Authoring/Delivery | Progressive Viewer *(shared with Feature A)* | Async stream | Local/Region (no new persistence) |

**Game Simulation Layer nodes** *(corrected v3 boundary)*:

| Node | Role | Type | Lane | Connects to | Connection type | Data residency |
|---|---|---|---|---|---|---|
| Native Spatial Physics Runtime | Producer/Router | Existing TypeScript runtime under `canvas/src/features/physics/` and `canvas/src/features/three/` | Authoring | Collision Event Bridge | Sync in-process call | Local (device memory only) |
| Collision Event Bridge | Router | Immediate AC-14 adapter | Authoring | Native Spatial Physics Runtime, existing Behavior Dispatcher | Sync in-process call | Local |
| Spatial Audio Component | Follow-on | Not implemented in this increment | Authoring | Undecided | — | Local only if later admitted |
| Portal Component | Follow-on | Not implemented; ADR-12 remains proposed | Authoring | Sole existing Three/R3F renderer | — | Local only if later admitted |
| Interaction Component | Follow-on | Pointer/touch/hand-ray adapters not implemented | Authoring | Existing Behavior Dispatcher | — | Local only if later admitted |

```mermaid
flowchart TB
  subgraph Capture["Capture & Viewing — client runtime, browser-only"]
    CD([Capability Detector])
    CS([Capture Surface])
    IR([Inference Runtime])
    CD -- sync --> CS
    CS -- sync --> IR
    IR -- sync --> CS
  end
  subgraph Authoring["Authoring Toolkit — client runtime, browser-only"]
    ECS([ECS Core])
    MGC([Material Graph Compiler])
    BGC([Behavior Graph Compiler])
    PSC([Particle System Component])
    TS([Timeline Sequencer])
    LPC([Live Preview Channel])
    ECS -- sync --> MGC
    ECS -- sync --> BGC
    ECS -- sync --> PSC
    ECS -- sync --> TS
    ECS -. sync .-> LPC
  end
  subgraph Simulation["AC-14 increment — client runtime, browser-only"]
    PHY([Native Spatial Physics Runtime])
    CEB([Collision Event Bridge])
    PHY -- sync --> CEB
    CEB -- sync --> BGC
  end
  subgraph Delivery["Existing storage + delivery boundary"]
    CM([Container Muxer])
    ACW([Asset Contract Writer])
    PV([Progressive Viewer])
  end
  CS -- async write --> ACW
  ECS -- sync --> CM
  CM -- async write --> ACW
  ACW -- async read --> PV
  CD -. sync .-> PV
  LPC -. async stream .-> PV
```

**Version notes**: corrected v3 reuses the existing native spatial-physics and exact-once behavior owners and adds only the AC-14 adapter seam. It does not attach a duplicate physics component to root `ecs/`, add a second dispatcher, or claim AC-13/15/16/17 implementation. No storage class, dependency, or network-egress path changes.

#### Orchestration/Harness Flows

**Pipeline**: Depth Synthesis Harness Flow *(unchanged from v1)*
**Topology pattern**: Sequential | **Max iterations**: 1 per frame | **Circuit-breaker**: N consecutive frame-budget breaches triggers fallback exit
**Token budget**: 0 prompt + 0 completion = $0.00 / call

| Role | Component | Input schema | Output schema | Cost log | Fallback |
|---|---|---|---|---|---|
| Dispatcher | Capture Surface | `{ frame: ImageBitmap, timestamp }` | `{ frame, depthRequest }` | — | Drop frame, continue capture |
| Executor | Inference Runtime | `{ frame, depthRequest }` | `{ depthMap, confidence }` | ✓ (frame_ms, model_id, device_class) | Frame-budget breach → exit to Post-Process Fallback Harness Flow |
| Observer | In-session frame-time logger | `{ frame_ms stream }` | `{ rolling avg, breach count }` | — | Silent fail; capture continues |
| Consumer | DIBR Synthesizer | `{ frame, depthMap }` | `{ stereoPairFrame }` | — | Upstream error → raw frame retained, depth discarded for that frame |

**Postconditions**: every captured frame is either a synthesized stereo pair or a raw frame with retained depth metadata; no frame lost; no unbounded retry loop; zero token spend.

---

**Pipeline**: Post-Process Fallback Harness Flow *(unchanged from v1)*
**Topology pattern**: Sequential | **Max iterations**: 1 pass over the saved clip | **Circuit-breaker**: n/a (single bounded pass)
**Token budget**: 0 prompt + 0 completion = $0.00 / call

| Role | Component | Input schema | Output schema | Cost log | Fallback |
|---|---|---|---|---|---|
| Dispatcher | Asset Contract Writer | `{ rawClipRef, depthMetadataRef }` | `{ jobRecord }` | — | Reject with typed error if clip ref unresolvable |
| Executor | Inference Runtime (batch mode) | `{ frame stream }` | `{ depthMap stream }` | ✓ required | Degraded mode: publish asset at `flat-fallback` tier without stereo synthesis |
| Observer | Job status logger | `{ progress stream }` | `{ percent complete }` | — | Silent fail; job continues |
| Consumer | Asset Contract Writer | `{ stereoPairFrame stream }` | `{ published asset, xr_capability_tier }` | — | Upstream error propagation to asset status field |

**Postconditions**: asset's `xr_capability_tier` field reflects the actually-achieved output tier; job record persisted; no unbounded retry.

---

**AC-14 introduces no model-backed harness.** The existing native physics step and the new collision adapter are deterministic client-side functions with zero token spend. AC-13/15/16/17 remain follow-on slices and are not counted as components delivered by this increment.

#### Component Specifications

*(Feature A and Feature B components are unchanged from v1/v2; carried forward for traceability continuity with ADR-1, ADR-2, ADR-4, ADR-5, ADR-6, ADR-7, ADR-8.)*

**Component**: Capability Detector
**Responsibility**: Capability Detector determines the client's XR tier from feature probes, never from user-agent string matching alone.
**Interfaces**: `detectXRCapabilities(): { tier: 'webxr-ar'|'webxr-vr'|'pseudo-ar-depth-parallax'|'flat-fallback', modules: {...} }`
**Dependencies**: Browser feature APIs only; no external service call
**Configuration**: None externalized; tier enum is closed and versioned with this component
**FOSS / Vendor**: FOSS (standard browser APIs only; no dependency to evaluate)
**VCC Conditions**: AC-1, AC-5
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

**Component**: Capture Surface
**Responsibility**: Capture Surface reads the device camera feed and dispatches frames to the synthesis harness at the capability-appropriate rate.
**Interfaces**: `startCapture(tier): CaptureSession`; `CaptureSession.onFrame(callback)`
**Dependencies**: Capability Detector, Inference Runtime, Asset Contract Writer
**Configuration**: Frame-budget breach threshold (ms), consecutive-breach count N — externalized
**FOSS / Vendor**: FOSS (standard browser media-capture API)
**VCC Conditions**: AC-2, AC-3
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

**Component**: Inference Runtime (monocular depth estimation)
**Responsibility**: Inference Runtime produces a per-frame depth map from a single camera frame without a server round-trip.
**Interfaces**: `estimateDepth(frame: ImageBitmap): { depthMap, confidence }`
**Dependencies**: Browser-native model-inference runtime (already selected under the FOSS gate — see ADR-2)
**Configuration**: Model variant selectable by device-class, externalized
**FOSS / Vendor**: FOSS — see **Reference implementation** in ADR-2
**Harness Contract**:
  - Input schema: `{ frame: ImageBitmap }`
  - Output schema: `{ depthMap: Float32Array, confidence: number }`
  - Cost log fields: `{ model: 'depth-estimator', prompt_tokens: 0, completion_tokens: 0, cache_hits: 0, estimated_cost_usd: 0.00 }`
  - Fallback path: degraded response (skip stereo synthesis for that frame)
**Token Budget**: 0 + 0 @ n/a cache rate = $0.00/request
**Orchestration Topology**: Sequential — max 1 iteration per frame; no retry, drop-and-continue on failure
**VCC Conditions**: AC-2, AC-3
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

**Component**: DIBR Synthesizer
**Responsibility**: DIBR Synthesizer produces a stereo pair frame from a raw frame and its depth map using depth-image-based rendering.
**Interfaces**: `synthesizeStereoPair(frame, depthMap): { left, right }`
**Dependencies**: Inference Runtime output
**Configuration**: Baseline eye-separation constant, externalized
**FOSS / Vendor**: FOSS (implemented in-repo; no external dependency)
**VCC Conditions**: AC-2
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

**Component**: Markerless Anchoring Fallback *(Should-tier)*
**Responsibility**: Markerless Anchoring Fallback provides in-canvas image/face-target tracking on devices without a native immersive-session API.
**Interfaces**: `startAnchoredSession(target): AnchorSession`
**Dependencies**: Capability Detector (`pseudo-ar-depth-parallax` tier)
**Configuration**: Target asset reference
**FOSS / Vendor**: FOSS — see **Reference implementation** in ADR-1
**VCC Conditions**: *(deferred to a follow-on Phase 1 pass)*
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `undocumented` / Delivered: `undocumented`

---

**Component**: Native Handoff Bridge *(Could-tier)*
**Responsibility**: Native Handoff Bridge hands a placement-ready 3D asset to the platform's native AR viewer for full positional tracking.
**Interfaces**: exposes a platform-native model-viewing link generated from the published asset
**Dependencies**: Asset Contract Writer output
**Configuration**: None
**FOSS / Vendor**: FOSS — see **Reference implementation** in ADR-1
**VCC Conditions**: *(deferred)*
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `undocumented` / Delivered: `undocumented`

---

**Component**: Progressive Viewer
**Responsibility**: Progressive Viewer renders a published spatial asset at the highest capability tier the current device reports.
**Interfaces**: `renderAsset(assetRef): ViewerSession`
**Dependencies**: Capability Detector, Asset Contract Writer (read), Live Preview Channel (optional, authoring-time only), Portal Component (optional, if the asset contains a portal)
**Configuration**: Tier-to-renderer mapping table, externalized
**FOSS / Vendor**: FOSS (existing canvas runtime; immersive-session entry point uses the standard browser immersive-session API where reported available)
**VCC Conditions**: AC-4
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

**Component**: ECS Core
**Responsibility**: ECS Core stores entities and components in typed arrays and executes systems per frame, providing the shared scene model for every Authoring Toolkit and Game Simulation Layer component.
**Interfaces**: `createWorld()`, `addEntity(world)`, `addComponent(world, eid, Component)`, `query(world, [Components])`
**Dependencies**: None (self-contained, in-repo)
**Configuration**: Component schema registry, externalized
**FOSS / Vendor**: FOSS — custom in-repo build (see ADR-4 and ADR-10; no external dependency)
**VCC Conditions**: AC-6
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

**Component**: Material Graph Compiler
**Responsibility**: Material Graph Compiler evaluates a node-material graph into a compiled shader targeting the existing node-material rendering system.
**Interfaces**: `compileMaterialGraph(graphDef): CompiledMaterial`
**Dependencies**: ECS Core (entity/material binding), shared Node Graph Engine
**Configuration**: Node-type registry, externalized
**FOSS / Vendor**: FOSS — see **Reference implementation** in ADR-5
**VCC Conditions**: AC-7
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

**Component**: Behavior Graph Compiler
**Responsibility**: Behavior Graph Compiler evaluates a node-based trigger/action graph into typed event-dispatch bindings against ECS Core, now receiving triggers from both the Collision Event Bridge and the Interaction Component in addition to authoring-time-defined triggers.
**Interfaces**: `compileBehaviorGraph(graphDef): CompiledBehavior`
**Dependencies**: ECS Core, shared Node Graph Engine, the `kgc-behavior-graph/v1` contract (see Integration Contracts), *Collision Event Bridge and Interaction Component (new upstream sources)*
**Configuration**: Trigger/action node-type registry, externalized
**FOSS / Vendor**: FOSS — see **Reference implementation** in ADR-5
**VCC Conditions**: AC-8, AC-14, AC-17
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

**Component**: Particle System Component *(Could-tier)*
**Responsibility**: Particle System Component manages GPU particle emitters bound to ECS entities within configured rate/lifetime/count bounds.
**Interfaces**: `createEmitter(config): EmitterHandle`
**Dependencies**: ECS Core
**Configuration**: Emitter presets, externalized
**FOSS / Vendor**: FOSS — see **Reference implementation** in ADR-6
**VCC Conditions**: AC-9
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

**Component**: Timeline Sequencer *(Could-tier)*
**Responsibility**: Timeline Sequencer interpolates keyframed bone/property values over a scrubbable timeline for a rigged entity.
**Interfaces**: `createSequence(entity, keyframes): SequenceHandle`
**Dependencies**: ECS Core
**Configuration**: Interpolation-curve presets, externalized
**FOSS / Vendor**: FOSS — see **Reference implementation** in ADR-8
**VCC Conditions**: AC-10
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

**Component**: Container Muxer
**Responsibility**: Container Muxer packages already-encoded WebCodecs track output into a single standard, browser-playable deliverable container.
**Interfaces**: `muxTracks(encodedChunks[]): ContainerFile`
**Dependencies**: Browser-native WebCodecs API output (from Feature A's capture pipeline or Authoring Toolkit exports)
**Configuration**: Target container format (MP4 | WebM), externalized
**FOSS / Vendor**: FOSS — custom in-repo build (see ADR-7; no external dependency)
**VCC Conditions**: AC-11
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

**Component**: Live Preview Channel *(Could-tier)*
**Responsibility**: Live Preview Channel propagates authoring-session edit deltas to connected viewer sessions with bounded latency.
**Interfaces**: `publishEdit(delta)`, `subscribeToEdits(callback)`
**Dependencies**: ECS Core, Progressive Viewer, existing dev-transport infrastructure already in the stack
**Configuration**: Propagation-latency ceiling, externalized
**FOSS / Vendor**: FOSS (zero new dependency; reuses existing transport infrastructure)
**VCC Conditions**: AC-12
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

*(New Game Simulation Layer components — Feature C.)*

**Component**: Physics Component
**Responsibility**: Existing native spatial physics owns fixed stepping, gravity, dynamic/static/kinematic bodies, impulses, sphere/cuboid colliders, collision/sensor transitions, queries, and snapshots. It does not currently own force accumulation, 3D angular state, or joints.
**Interfaces**: `SpatialPhysicsEngine`, `stepXrPhysicsSimulation`, and `xrPhysicsRuntime` controls
**Dependencies**: Existing repository-owned TypeScript modules; independent of root agentic `ecs/`
**Configuration**: Existing XR physics world contract
**FOSS / Vendor**: Source-authored in-repo; zero new dependency
**VCC Conditions**: Existing focused physics checks remain separate; AC-13 is follow-on
**Evidence References**: *(no new readiness evidence asserted by this document)*
**Readiness rung**: Existing runtime status unchanged; AC-13 Local: `undocumented` / Delivered: `undocumented`

---

**Component**: Collision Event Bridge
**Responsibility**: Preserve existing `SpatialPhysicsEvent` values currently discarded by `xrSpatialPhysicsAdapter.ts`, normalize stable identities, and route collision begin/end through `createExactOnceBehaviorDispatcher`.
**Interfaces**: A typed adapter over `SpatialPhysicsEvent` plus the existing `BehaviorDispatchEvent`; no second event bus
**Dependencies**: Native spatial physics, XR adapter/runtime, existing behavior dispatcher
**Configuration**: Bounded subject/entity binding and replay ledger; fail closed at capacity
**FOSS / Vendor**: FOSS (implemented in-repo; no external dependency)
**VCC Conditions**: AC-14
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

---

**Component**: Spatial Audio Component
**Responsibility**: Follow-on AC-15 concept only; no implementation is claimed.
**Interfaces**: Undecided pending browser media lifecycle and user-gesture design
**Dependencies**: Undecided; must reuse the active camera/listener owner
**Configuration**: Undecided
**FOSS / Vendor**: No dependency decision in this increment
**VCC Conditions**: AC-15
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `undocumented` / Delivered: `undocumented`

---

**Component**: Portal Component *(Could-tier)*
**Responsibility**: Follow-on AC-16 concept only; ADR-12 remains proposed and no pixels are implemented by this document.
**Interfaces**: Undecided; any implementation must stay inside the sole renderer/camera owner in `canvas/src/lib/three/ThreeGraph.impl.tsx`
**Dependencies**: Existing Three/R3F canvas and the actual HTML viewer runtime at `canvas/src/lib/graph/htmlViewer/runtimeTemplate.ts`
**Configuration**: Undecided, including visible-portal ceiling
**FOSS / Vendor**: No new dependency proposed
**VCC Conditions**: AC-16
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `undocumented` / Delivered: `undocumented`

---

**Component**: Interaction Component
**Responsibility**: Follow-on AC-17 concept only. Mouse/touch adapters and a hand-ray target adapter are not implemented by this increment.
**Interfaces**: Undecided pending source-specific adapters into the existing behavior dispatcher
**Dependencies**: Existing R3F pointer/touch owners. `packages/apple-spatial-input` owns device sensor axes/filter/lifecycle and must not be described as a hand-ray source.
**Configuration**: Undecided
**FOSS / Vendor**: No new dependency proposed
**VCC Conditions**: AC-17
**Evidence References**: *(none yet)*
**Readiness rung**: Local: `undocumented` / Delivered: `undocumented`

#### Integration Contracts

**Interface**: `xr_capability_tier` asset field *(unchanged from v1)* | **Protocol**: In-process function call + existing storage adapter | **Format**: JSON (extends the existing asset-contract schema) | **Errors**: Unresolvable clip/metadata reference → typed error surfaced to the Asset Contract Writer caller; asset not published

```json
{
  "xr_capability_tier": "webxr-ar | webxr-vr | pseudo-ar-depth-parallax | flat-fallback",
  "synthesis_mode": "live | post-process | none",
  "depth_metadata_ref": "string | null",
  "fallback_triggered": "boolean"
}
```

**Interface**: `agenticgraph-xr-behavior-graph/v1` *(existing owner; AC-14 extension pending)* | **Protocol**: In-process call through `createExactOnceBehaviorDispatcher` | **Format**: Existing `AuthoringBehaviorGraph` / `BehaviorDispatchEvent` types | **Errors**: invalid, stale, out-of-order, or reentrant events fail closed through the existing dispatcher result

```json
{
  "schema": "agenticgraph-xr-behavior-graph/v1",
  "actions": [],
  "behaviors": [ { "trigger": "collision-begin | collision-end", "sourceEntityId": 0, "actionIds": [] } ]
}
```
*AC-14 may add only `collision-begin` and `collision-end` to the canonical closed trigger union. AC-17 input triggers are not part of this increment.*

**Interface**: existing XR physics world contract | **Protocol**: `xrPhysicsRuntime` and `/xr.physics @canvas` | **Format**: existing `XrPhysicsWorldConfig`; not a new root-ECS component | **Errors**: existing configuration functions reject invalid updates without adding a compatibility path

```json
{
  "command": "/xr.physics",
  "binding": "@canvas",
  "semantic": "#world | #body | #impulse | #controller"
}
```

#### Architectural Decisions
See ADR-1 (anchoring/tracking layer selection), ADR-2 (monocular depth inference layer selection), ADR-3 (browser-native vs. native-app capture strategy), ADR-4 (ECS scene model), ADR-5 (node-based visual graph framework), ADR-6 (GPU particle system), ADR-7 (media container muxing strategy), ADR-8 (animation timeline/sequencer), ADR-9 (scene interchange format), ADR-10 (ECS consistency resolution across the project), ADR-11 (physics engine selection), ADR-12 (portal rendering technique) below.

#### Quality Attributes

*Applies uniformly to Features A, B, and C — all three share the same client-side-only, zero-egress architecture posture.*

| Attribute | Scenario | Pattern | Validation |
|---|---|---|---|
| Performance | Live synthesis, live authoring/preview, and live physics simulation must sustain target frame budget on a mid-tier device | Frame-budget monitor + automatic fallback exit (capture); direct-manipulation editing (authoring); fixed-timestep solver decoupled from render loop (simulation) | Timed capture, authoring, and simulation sessions on reference device; frame-time and physics-step-time histograms |
| Scalability | N/A — client-side only, no server component to scale | — | — |
| Security | Camera access must be user-granted per session; no frame, authoring, or simulation data leaves the device until publish | Browser permission API; no network call in Inference Runtime, Authoring Toolkit compilers, or Game Simulation Layer components | Manual permission-denial pass; network-tab audit showing zero egress during capture, authoring, and simulation |
| Observability | Frame-time breaches, fallback triggers, graph-compile errors, and physics-solver instability must be visible in local session diagnostics | In-session logger (no network telemetry) | Manual diagnostics-panel review during a forced-fallback test, a forced-compile-error test, and a forced-solver-instability test |
| Token Cost | All inference, authoring compilation, and physics simulation is local; target is $0.00/session regardless of load | Client-side model runtime, deterministic compilers, and the existing in-repo TypeScript physics runtime; no hosted LLM call | Cost log sampling confirms `estimated_cost_usd: 0` on every frame, every graph compile, and every physics step |
| Offline Behaviour | Capture, live synthesis, authoring, and simulation must work with no network connectivity; publish step queues if offline | Local-first state with deferred publish reconciliation | Airplane-mode capture, authoring, and simulation pass; reconciliation replay test on reconnect |
| TCO | Zero incremental infrastructure cost across all three features — no new compute, storage class, or egress path | Client-side-only architecture | Monthly cost audit shows no delta attributable to any feature |
| Device Reach | Must run acceptably on iOS-class, Android-class, headset-class, and desktop devices for capture, authoring, and simulation | Progressive enhancement; feature probes, not user-agent branching | Cross-device manual pass covering all four capability tiers, for all three features |
| Physics Stability | Rigid-body simulation must not diverge (NaN, unbounded velocity) under normal authored configurations | Fixed timestep, solver iteration cap, configuration validation at `attachPhysicsBody` | Reference-scene regression suite run per Physics Component change |

#### Deployment Strategy
The AC-14 increment is client-side-only and reuses bundled TypeScript runtime owners; it adds no WASM binary, external dependency, server surface, storage migration, invocation alias, Prod authority, or Cloudflare authority. Dev integration, protected release authorization, deployment, and live verification remain separate gates.

#### Architecture Diagrams
See Topology diagram above; see Orchestration/Harness Flow tables above. Sequence-level diagrams are added at implementation time per the Guideline Load Budget.

#### Component Inventory

| Feature | Layer | Component | File / Module | Local rung | Delivered rung |
|---|---|---|---|---|---|
| A | Capability | Capability Detector | `xr/capability-detector` *(indicative)* | `spec-complete` | `undocumented` |
| A | Capture | Capture Surface | `xr/capture-surface` | `spec-complete` | `undocumented` |
| A | Inference | Inference Runtime | `xr/depth-inference` | `spec-complete` | `undocumented` |
| A | Synthesis | DIBR Synthesizer | `xr/dibr-synthesizer` | `spec-complete` | `undocumented` |
| A | Anchoring | Markerless Anchoring Fallback | `xr/anchoring-fallback` | `undocumented` | `undocumented` |
| A | Handoff | Native Handoff Bridge | `xr/native-handoff` | `undocumented` | `undocumented` |
| A | Viewer | Progressive Viewer | `xr/progressive-viewer` | `spec-complete` | `undocumented` |
| B | Scene model | ECS Core | `xr/authoring/ecs-core` *(indicative)* | `spec-complete` | `undocumented` |
| B | Materials | Material Graph Compiler | `xr/authoring/material-graph` | `spec-complete` | `undocumented` |
| B | Behavior | Behavior Graph Compiler | `xr/authoring/behavior-graph` | `spec-complete` | `undocumented` |
| B | Particles | Particle System Component | `xr/authoring/particle-system` | `spec-complete` | `undocumented` |
| B | Animation | Timeline Sequencer | `xr/authoring/timeline-sequencer` | `spec-complete` | `undocumented` |
| B | Packaging | Container Muxer | `xr/authoring/container-muxer` | `spec-complete` | `undocumented` |
| B | Preview | Live Preview Channel | `xr/authoring/live-preview-channel` | `spec-complete` | `undocumented` |
| C | Physics | Existing Native Spatial Physics | `canvas/src/features/physics/`, `canvas/src/features/three/xrPhysicsRuntime.ts` | existing focused runtime; rung unchanged | `undocumented` |
| C | Physics | Collision Event Bridge (AC-14) | `canvas/src/features/xr-v2/collisionEventBridge.ts` | `spec-complete` | `undocumented` |
| C | Physics | Force Accumulation and Joints (AC-13) | no admitted module | `undocumented` | `undocumented` |
| C | Audio | Spatial Audio Component (AC-15) | no admitted module | `undocumented` | `undocumented` |
| C | Rendering | Portal Component (AC-16) | no admitted module; ADR-12 proposed | `undocumented` | `undocumented` |
| C | Input | Interaction Component (AC-17) | no admitted module | `undocumented` | `undocumented` |

#### Deploy Boundary Register

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement | State |
|---|---|---|---|---|---|---|
| Authoring → Mirror | Authoring | Mirror | *(named local test suite pass — recorded at Phase 3)* | none | Revert to prior canvas bundle version | `closed` |
| Mirror → Delivery | Mirror | Delivery | *(named mirror-environment pass — recorded at Phase 3)* | none | Revert to the prior published bundle; AC-14 adds no persisted-data migration | `closed` |

---

## Part III — Architectural Decision Records (ADR)

### ADR-1: Anchoring & Tracking Layer Selection
**Status**: Proposed
**Date**: 2026-08-02

#### Context
Real-world anchoring/tracking must work across a fragmented capability landscape: native session-based hit-testing on some platforms, no equivalent API at all on others. A single anchoring strategy cannot cover every device.

#### Decision
Use a tiered anchoring strategy: native session-based hit-testing where the platform reports it, a markerless image/face-target tracking library as the universal client-side fallback, and a native-viewer handoff path for devices that support it, as a Could-tier enhancement rather than the default path.

#### Alternatives Considered
1. **Native session-based hit-testing only**: Pros — highest fidelity, real-world plane anchoring. Cons — unavailable on a large share of target devices (see PRD AC-5); would leave those devices with no AR path at all.
2. **Markerless tracking library (FOSS alternative)**: Pros — works identically across every browser, no platform-API dependency, permissively licensed. Cons — target-anchored rather than free-floating-surface-anchored; not a full substitute for real 6DoF placement.
3. **Native-viewer handoff only**: Pros — full native fidelity when it fires. Cons — leaves the in-canvas experience entirely; not usable as a default path for an in-canvas feature.

#### Rationale
No single option covers the full device matrix at zero TCO. The markerless tracking library is selected as the default/universal layer because it is the only option that works everywhere without a platform-API dependency; native hit-testing and native-viewer handoff are layered on top as capability-detected enhancements, not replacements.

**Reference implementation**: markerless tracking is implemented via MindAR.js (MIT license); native-viewer handoff is implemented via a `<model-viewer>`-class web component (Apache-2.0 license) generating a platform-native model-viewing link.

#### TCO Impact

| Dimension | Chosen Option [Provisioned/Self-Managed — bundled client library] | Best FOSS Alternative [same variant] | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo | $0/mo | $0 |
| Egress cost | $0/mo | $0/mo | $0 |
| Token cost | $0/mo | $0/mo | $0 |
| Ops burden | Low | Low | — |
| Vendor risk | Low — permissive license, no vendor lock-in | Low | — |

#### Consequences
- **Positive**: universal device coverage at $0 TCO; no new vendor dependency beyond what's already FOSS-gated
- **Negative**: markerless tracking is target-anchored, not free-surface-anchored
- **Neutral**: native-viewer handoff remains a Could-tier item, tracked separately

---

### ADR-2: Monocular Depth Inference Layer Selection
**Status**: Proposed
**Date**: 2026-08-02

#### Context
Stereo/spatial synthesis needs a depth signal from a single phone camera, without relying on platform-specific depth sensors (unevenly available) or a server round-trip.

#### Decision
Run a monocular depth-estimation model entirely client-side, using it as the universal depth source regardless of whether a platform-native depth sensor exists.

#### Alternatives Considered
1. **Platform-native depth-sensing API (where available)**: Pros — hardware-accurate depth. Cons — inconsistent availability; would leave most devices with no depth signal if made primary.
2. **Server-side depth inference (FOSS alternative model, hosted)**: Pros — offloads compute. Cons — network round-trip, egress cost, server dependency this feature avoids by design.
3. **Client-side monocular depth model (chosen)**: Pros — works on any device with a camera, zero egress, zero server cost. Cons — relative depth only, needs additional smoothing.

#### Rationale
Only the client-side monocular option satisfies zero-egress, universal-device-coverage simultaneously; the accuracy tradeoff is acceptable since the use case is parallax synthesis, not measurement.

**Reference implementation**: monocular depth inference is implemented via Depth Anything V2 Small (Apache-2.0 license), run through the browser-native transformer-model inference runtime already established in the project's CV stack.

#### TCO Impact

| Dimension | Chosen Option [Provisioned/Self-Managed — client-side model] | Best FOSS Alternative [Managed/Serverless — hosted inference] | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo | Non-zero at projected volume | Negative (favors chosen option) |
| Egress cost | $0/mo | Non-zero | Negative (favors chosen option) |
| Token cost | $0/mo | Non-zero | Negative (favors chosen option) |
| Ops burden | Low | Medium | — |
| Vendor risk | Low | Low–Medium | — |

#### Consequences
- **Positive**: zero server cost, zero egress, works offline once cached
- **Negative**: relative depth only; frame-to-frame flicker needs a smoothing pass not yet scoped
- **Neutral**: model asset adds to bundle/cache size — acceptable tradeoff

---

### ADR-3: Browser-Native Capture Strategy vs. Native-App Capture
**Status**: Accepted
**Date**: 2026-08-02

#### Context
An immersive-capture feature could be built as a native mobile app or as a browser-native, capability-detected layer inside the existing canvas.

#### Decision
Build entirely browser-native, inside the existing canvas runtime, with capability detection driving progressive enhancement.

#### Alternatives Considered
1. **Native mobile app per platform**: Pros — full native API access. Cons — doubles the delivery surface, breaks the zero-install product posture, moves capture outside the existing pipeline.
2. **Browser-native, capability-detected (chosen)**: Pros — single codebase, zero install friction, fits existing Deploy Boundary unchanged. Cons — cannot reach native-only capabilities on any device.

#### Rationale
The product's browser-native, mobile-first, zero-TCO orientation rules out a native-app default path; the capability gap is mitigated, not eliminated, by ADR-1's native-viewer handoff item.

#### TCO Impact

| Dimension | Chosen Option [browser-native] | Best FOSS Alternative [native app, per-platform build] | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo | $0/mo toolchain, non-modeled distribution overhead | Different cost class |
| Egress cost | $0/mo | $0/mo | $0 |
| Token cost | $0/mo | $0/mo | $0 |
| Ops burden | Low — one bundle, one release pipeline | High — additional native release pipelines, platform review cycles | — |
| Vendor risk | Low | Medium (app-store policy dependency) | — |

#### Consequences
- **Positive**: single delivery surface, zero install friction
- **Negative**: hard capability ceiling on tracking fidelity
- **Neutral**: revisit if native-viewer-handoff proves insufficient

---

### ADR-4: Entity-Component-System Scene Model
**Status**: Proposed
**Date**: 2026-08-03

#### Context
Native spatial-authoring environments in this reference class are built on an entity-component-system architecture. Adopting an equivalent pattern in-repo gives every Authoring Toolkit primitive (materials, behaviors, particles, animation) a single, typed scene model instead of ad-hoc component wiring.

#### Decision
Implement a minimal ECS core in-repo (typed-array-backed entity/component storage plus a query function), rather than importing a third-party ECS package.

#### Alternatives Considered
1. **Third-party high-performance ECS package (FOSS alternative)**: Pros — mature, battle-tested, typed-array performance patterns already solved. Cons — the most widely used option in this space carries an MPL-2.0 license, which sits outside the MIT/Apache-2.0-only gate without an explicit exception; no clean MIT/Apache-2.0 alternative was found at time of writing.
2. **Custom in-repo ECS (chosen)**: Pros — zero dependency; satisfies both the license gate and the literal no-external-dependency constraint on this toolkit; scoped exactly to the query patterns this project needs. Cons — higher build-hour cost than adopting a mature package; the project takes on maintenance of a foundational primitive.

#### Rationale
Because the closest well-known FOSS candidate fails the license gate as currently licensed, and because typed-array storage plus query is a well-understood, boundable pattern, building in-repo is preferred over spending a review cycle on a license exception.

*Note: this decision's scope is extended project-wide in ADR-10, after this document's Feature C work surfaced an inconsistency with a separate PRD/TAD's ECS choice.*

#### TCO Impact

| Dimension | Chosen Option [Provisioned/Self-Managed — custom, client-side] | Best FOSS Alternative [same variant — license-blocked] | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo | $0/mo | $0 |
| Egress cost | $0/mo | $0/mo | $0 |
| Token cost | $0/mo | $0/mo | $0 |
| Ops burden | Low — self-maintained, small scope | Low, but license-blocked | — |
| Vendor risk | Low — no dependency | Medium — license non-compliance risk under this gate | — |

#### Consequences
- **Positive**: zero license risk, zero dependency footprint, full control over query performance
- **Negative**: higher initial build-hour cost; ongoing maintenance of a foundational primitive
- **Neutral**: revisit if a clean MIT/Apache-2.0 ECS package becomes available — the interface is small enough for a low-risk future swap

---

### ADR-5: Node-Based Visual Graph Framework Selection
**Status**: Proposed
**Date**: 2026-08-03

#### Context
Material authoring and behavior/script authoring both need a node-graph editor UI and evaluation engine. Building this from scratch is a substantially larger undertaking than ADR-4's ECS core.

#### Decision
Adopt a FOSS node-based visual-programming framework as the shared graph editor/evaluation engine, with compiler backends for the Material Graph Compiler (targeting the existing shading-language node-material system) and the Behavior Graph Compiler (targeting typed event dispatch against ECS Core, now including collision and interaction trigger sources per Feature C).

#### Alternatives Considered
1. **Custom in-repo node-graph editor**: Pros — zero dependency. Cons — a full graph-editor UI (drag/connect/serialize/undo/redo) is a multi-week build on its own; poor ROI relative to adopting a maintained framework for this UI-heavy primitive, unlike the small, self-contained ECS case.
2. **FOSS node-graph framework (chosen)**: Pros — mature drag/connect/serialize UI, active maintenance, permissively licensed at time of writing. Cons — external dependency; license text must be re-verified against the exact pinned version before merge, per this project's standing practice.

#### Rationale
Unlike ADR-4, the marginal build-hour cost of a custom graph-editor UI is high enough, and the license checks out cleanly, that adoption is the better ROI call. The "forbid external dependency" instruction that motivated ADR-4 and ADR-7 is interpreted as forbidding dependency on the native reference applications, not all in-browser FOSS libraries — consistent with this project's existing FOSS-first practice.

**Reference implementation**: Rete.js (MIT license), a JavaScript/TypeScript visual-programming framework.

#### TCO Impact

| Dimension | Chosen Option [package] | Best FOSS Alternative [custom build] | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo | $0/mo | $0 |
| Egress cost | $0/mo | $0/mo | $0 |
| Token cost | $0/mo | $0/mo | $0 |
| Ops burden | Low — maintained upstream | High one-time build-hour cost, then low | — |
| Vendor risk | Low — permissive license, self-hostable | Low — no dependency | — |

#### Consequences
- **Positive**: fastest path to a working graph editor; permissive license fits the gate
- **Negative**: introduces a UI-framework dependency; license text should be re-confirmed against the pinned version before merge
- **Neutral**: both compiler backends share one editor instance, keeping the authoring surface consistent; Feature C's collision/interaction triggers reuse this same editor rather than introducing a second graph UI

---

### ADR-6: GPU Particle System Selection
**Status**: Proposed
**Date**: 2026-08-03

#### Context
Particle authoring is a Could-tier item in this increment; still worth a licensed, low-effort path rather than deferring the decision entirely.

#### Decision
Adopt a FOSS GPU particle library built for the existing rendering engine rather than building a custom particle system from scratch.

#### Alternatives Considered
1. **Custom in-repo particle system**: Pros — zero dependency. Cons — GPU particle systems (compute-shader-driven emission, curves, collision) are a substantial build for a Could-tier item; poor ROI at this priority level.
2. **FOSS particle library (chosen)**: Pros — purpose-built for the existing engine, permissively licensed at time of writing, GPU-driven. Cons — external dependency; license re-verification required at implementation time.

#### Rationale
Same build-hour-vs-license logic as ADR-5: adoption wins for a UI/feature-heavy, license-clean candidate at this priority tier.

**Reference implementation**: three.quarks (MIT license), a GPU particle system for the existing rendering engine.

#### TCO Impact

| Dimension | Chosen Option [package] | Best FOSS Alternative [custom build] | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo | $0/mo | $0 |
| Egress cost | $0/mo | $0/mo | $0 |
| Token cost | $0/mo | $0/mo | $0 |
| Ops burden | Low | High one-time build-hour cost | — |
| Vendor risk | Low — permissive license | Low — no dependency | — |

#### Consequences
- **Positive**: low build-hour cost for a Could-tier item
- **Negative**: another dependency to track licenses for over time
- **Neutral**: deferred until Must/Should-tier items ship, per MoSCoW

---

### ADR-7: Media Container Muxing Strategy
**Status**: Proposed
**Date**: 2026-08-03

#### Context
Feature B's in-browser packaging need (AC-11) is narrow: mux already-encoded WebCodecs output into a standard playable container. It does not need full transcoding, demuxing, or format-conversion breadth.

#### Decision
Implement a minimal in-repo MP4/WebM box writer over WebCodecs' encoded-chunk output, rather than adopting a general-purpose media-toolkit package.

#### Alternatives Considered
1. **General-purpose FOSS media toolkit (FOSS alternative)**: Pros — handles many codecs/containers, actively maintained. Cons — the actively maintained option in this space carries an MPL-2.0 license (its predecessor package is deprecated outright), outside the MIT/Apache-2.0-only gate without an exception; also far broader in scope than this project's narrow muxing-only need.
2. **Custom in-repo minimal muxer (chosen)**: Pros — zero dependency, scoped exactly to "mux pre-encoded chunks into one container," a bounded, well-documented format-writing task; satisfies both the license gate and the literal external-dependency constraint. Cons — narrower feature set; manual extension needed for broader container/codec support later.

#### Rationale
Same pattern as ADR-4: the mature FOSS option fails the strict license gate as currently licensed, and the actual need is narrow enough that a custom, bounded implementation is both lower-risk and appropriately scoped.

#### TCO Impact

| Dimension | Chosen Option [Provisioned/Self-Managed — custom, client-side] | Best FOSS Alternative [same variant — license-blocked] | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo | $0/mo | $0 |
| Egress cost | $0/mo | $0/mo | $0 |
| Token cost | $0/mo | $0/mo | $0 |
| Ops burden | Low — bounded scope | Low, but license-blocked | — |
| Vendor risk | Low — no dependency | Medium — license non-compliance risk under this gate | — |

#### Consequences
- **Positive**: zero license risk, scoped exactly to the need
- **Negative**: future support for additional containers/codecs is manual work, not a config flag
- **Neutral**: revisit if a clean-licensed alternative emerges or scope grows beyond simple muxing

---

### ADR-8: Animation Timeline / Sequencer Selection
**Status**: Proposed
**Date**: 2026-08-03

#### Context
Keyframe sequencing and interpolation over a scrubbable timeline (AC-10) is a well-solved problem in the existing web ecosystem, and is a Could-tier item in this increment.

#### Decision
Adopt a FOSS animation-sequencing library built for the existing rendering ecosystem rather than building a custom timeline/keyframe engine from scratch.

#### Alternatives Considered
1. **Custom in-repo timeline/keyframe engine**: Pros — zero dependency. Cons — a scrubbable, undo/redo-capable, multi-track keyframe sequencer is a substantial build; poor ROI at Could-tier priority.
2. **FOSS animation-sequencing library (chosen)**: Pros — purpose-built motion-design editor for the web, integrates with the existing rendering ecosystem, permissively licensed at time of writing. Cons — external dependency; license re-verification required at implementation time.

#### Rationale
Same build-hour-vs-license logic as ADR-5 and ADR-6.

[OpenCut](https://github.com/opencut-app/opencut) is an attribution-only product-workflow reference.

**Reference implementation**: Theatre.js, a motion-design/animation editor for the web.

#### TCO Impact

| Dimension | Chosen Option [package] | Best FOSS Alternative [custom build] | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo | $0/mo | $0 |
| Egress cost | $0/mo | $0/mo | $0 |
| Token cost | $0/mo | $0/mo | $0 |
| Ops burden | Low | High one-time build-hour cost | — |
| Vendor risk | Low, pending final license confirmation | Low — no dependency | — |

#### Consequences
- **Positive**: low build-hour cost for a Could-tier item, mature scrubbing/keyframe UI
- **Negative**: another dependency to track
- **Neutral**: deferred until Must/Should-tier items ship

---

### ADR-9: Scene Interchange Format
**Status**: Accepted
**Date**: 2026-08-03

#### Context
Native spatial-authoring tools in this reference class increasingly treat a universal-scene-description format as a composition backbone; this project already standardized on a glTF-family format as its delivery format for the AR/XR asset pipeline.

#### Decision
Continue using the existing glTF-family format as the single scene-interchange and delivery format for Features A, B, and C output; do not adopt a universal-scene-description format as an interchange format in this increment.

#### Alternatives Considered
1. **Universal-scene-description format (FOSS-adjacent alternative)**: Pros — richer scene-composition semantics (layering, variants, references) than the existing format natively supports. Cons — ships under a modified permissive license with additional terms, not a clean OSI-approved license, which does not clear this project's stated MIT/Apache-2.0-only gate as written; would also introduce a second scene-interchange format alongside the already-adopted pipeline.
2. **Existing glTF-family format via a programmatic toolkit (chosen)**: Pros — already the established format for this project's AR/XR asset pipeline; clean MIT license; single interchange format end-to-end. Cons — lacks native support for non-destructive scene composition/layering; any such capability must be built as an in-repo convention on top of the existing asset-contract schema rather than inherited from the format itself.

#### Rationale
The universal-scene-description alternative fails the license gate as currently licensed, and adopting it would fragment a scene-interchange decision this project has already consolidated; composition-layering needs are better served by extending the existing schema than by adopting a second binary interchange format.

**Reference implementation**: glTF-Transform (MIT license), a programmatic glTF authoring/optimization toolkit.

#### TCO Impact

| Dimension | Chosen Option [existing glTF pipeline] | Best FOSS Alternative [universal-scene-description format] | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo | $0/mo | $0 |
| Egress cost | $0/mo | $0/mo | $0 |
| Token cost | $0/mo | $0/mo | $0 |
| Ops burden | Low | Low | — |
| Vendor risk | Low — clean license | Medium — license ambiguity under this gate | — |

#### Consequences
- **Positive**: single interchange format, no license ambiguity
- **Negative**: scene-composition/layering features remain a custom convention rather than an inherited format capability
- **Neutral**: revisit if the alternative's licensing changes or a compelling composition-layering need emerges

---

### ADR-10: Existing ECS and XR Ownership Boundary
**Status**: Accepted (corrected)
**Date**: 2026-08-08

#### Context
The repository already owns the agentic ECS under root `ecs/`, and the game-mode lines already consume that owner. Its public component schema is numeric typed-array data (`f32`, `f64`, signed integers, and unsigned integers); entity components are attached atomically at allocation. The XR renderer contract intentionally prevents the agentic ECS from becoming a competing browser scene, renderer, camera, or physics owner.

#### Decision
Keep root `ecs/` as the sole agentic ECS owner and keep the existing XR scene/physics runtime as the browser simulation owner. Feature C adds neither a second ECS nor an `xr_physics_config` compatibility component. AC-14 is an adapter from existing `SpatialPhysicsEvent` values to the existing behavior dispatcher.

#### Consequences
- **Positive**: no duplicate world, renderer, physics engine, component schema, or migration path.
- **Negative**: subject-to-numeric-entity resolution must be explicit at the AC-14 boundary.
- **Neutral**: AC-13 may later propose ECS-facing projections, but must honor the numeric schema and allocation contract instead of inventing `string` or `float64` field types.

---

### ADR-11: Reuse Independent Native Spatial Physics
**Status**: Accepted (corrected)
**Date**: 2026-08-08

#### Context
AgenticGraph already owns `SpatialPhysicsEngine`, XR model/adapter/runtime layers, fixed stepping, impulses, collision and sensor transitions, queries, and snapshots. The prior text incorrectly selected an external WASM engine and claimed force, joint, and angular capabilities that are not present.

#### Decision
Reuse the existing in-repo TypeScript spatial-physics owner for AC-14. Add no external engine, WASM bundle, dependency alias, or compatibility layer. Preserve and route the native event stream that the XR adapter currently drains. AC-13 force accumulation and joints require a separate amendment: the present engine has no force accumulator, 3D orientation/angular velocity, or joint solver, so a hinge/revolute joint cannot be represented honestly as a positional projection.

#### TCO Impact

| Dimension | Existing native owner | New external engine | Delta / 12 months |
|---|---|---|---|
| Infra, egress, token cost | $0/mo | $0/mo runtime, but added supply-chain/bundle cost | $0 direct |
| Ops burden | Focused adapter and tests | Duplicate engine integration and migration | Lower with existing owner |
| Vendor risk | None added | New dependency and version surface | Lower with existing owner |

#### Consequences
- **Positive**: minimum change, zero new dependency, and one physics owner.
- **Negative**: AC-13 remains unimplemented until its missing state and solver model are designed and proved.
- **Neutral**: existing physics readiness evidence remains separate from AC-14 evidence; neither implies production verification.

---

### ADR-12: Portal Rendering Technique Selection
**Status**: Proposed
**Date**: 2026-08-06

#### Context
Portal Component (AC-16) needs to render a masked region showing a different scene or camera view — a technique demonstrated as portal enhancements in the reference game documentation this feature is modeled on.

#### Decision
If AC-16 is admitted in a later increment, implement it within the sole existing Three/R3F renderer and camera owner at `canvas/src/lib/three/ThreeGraph.impl.tsx`, using the existing HTML viewer runtime at `canvas/src/lib/graph/htmlViewer/runtimeTemplate.ts` where HTML projection is involved. The implementation must produce pixel-level browser proof; this proposed plan is not implementation or readiness evidence.

#### Alternatives Considered
1. **Clip-plane-only technique (no stencil, no second render target)**: Pros — simplest, cheapest. Cons — can only clip geometry at a plane; cannot actually show a different scene or camera view through the opening, so it does not satisfy AC-16's requirement that the masked region render the target scene's view.
2. **Stencil + render-target compositing (chosen)**: Pros — correctly renders a distinct camera view inside the masked region, a standard real-time-rendering technique, zero new dependency since the rendering engine already exposes stencil-buffer and render-target primitives. Cons — a second render-target pass per visible portal adds a render-cost multiplier; needs a cap on simultaneously visible portals for performance.
3. **Full recursive scene-graph portal system (nested portals, portal-through-portal)**: Pros — most capable. Cons — substantially higher complexity and render cost than this increment's Could-tier scope warrants; deferred per Feature C's Open Questions on nested portals.

#### Rationale
The stencil-plus-render-target technique is the minimum approach that actually satisfies AC-16 without introducing a dependency, and it defers the higher-complexity recursive case to a later increment rather than over-building a Could-tier item.

#### TCO Impact

| Dimension | Chosen Option [stencil + render-target, native] | Best FOSS Alternative [clip-plane-only, native — fails AC-16] | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo | $0/mo | $0 |
| Egress cost | $0/mo | $0/mo | $0 |
| Token cost | $0/mo | $0/mo | $0 |
| Ops burden | Low — native technique | Low, but does not meet the acceptance criterion | — |
| Vendor risk | Low — no dependency | Low — no dependency | — |

#### Consequences
- **Positive**: preserves one renderer/camera owner and proposes no new dependency
- **Negative**: render-cost multiplier per visible portal; requires a visible-portal cap
- **Neutral**: nested/recursive portals are explicitly deferred, tracked in Feature C's Open Questions

---

## Part IV — Agent-Platform Readiness

**Explicit scope declaration** (ambiguous "agent-ready" claims are forbidden — every dimension is named here, not implied):

| Dimension | Status this increment |
|---|---|
| Agentic OS-ready | **Won't (this increment)** — none of the capture/viewing, authoring, or game-simulation layers expose harness run state, a capability catalog, or a cost ledger beyond the local client-side cost logs already specified; no OS Status Surface is added |
| AI Agent-ready | **Won't (this increment)** — AC-14 introduces no external-agent-invocable surface; it is an internal deterministic adapter, while AC-13/15/16/17 remain unimplemented concepts with no readiness claim |
| MCP Gateway-ready | **Won't (this increment)** — no new tool transport is introduced; nothing to federate |

Rationale: all three features in this document are client-side capture/authoring/simulation/viewing surfaces, not agent-facing surfaces. Declaring these dimensions `undocumented` on the Readiness Ladder satisfies the directive against ambiguous agent-readiness claims.

---

## Part V — Invocation Register: AgenticGraph AR/VR/XR Layer

| Route | Kind | Owner | Typed arguments | Trust boundary | Token cost |
|---|---|---|---|---|---|
| `/xr.capture` | Command | Capture Surface owner | `{ tier?: capability-tier }` | local | 0 |
| `/xr.author` | Command | ECS Core owner | `{ sceneRef?: string }` | local | 0 |
| `/xr.physics` | Command | Existing XR scene physics owner | `@canvas #world|#body|#impulse|#controller operation=<typed-operation>` | local | 0 |
| `#xr-capability-tier` | Tag | Capability Detector owner | — | read | 0 |
| `#ecs-world` | Tag | ECS Core owner | — | read | 0 |
| `#node-graph` | Tag | Material/Behavior Graph Compiler owners | — | read | 0 |
| `#world` / `#body` / `#impulse` / `#controller` | Tag | Existing XR scene physics owner | — | read | 0 |
| `@xr-capture-contract` | Binding | Asset Contract Writer owner | — | read | 0 |
| `@kgc-behavior-graph-contract` | Binding | Behavior Graph Compiler owner | — | read | 0 |
| `@xr-authoring-runtime` | Binding | ECS Core owner | — | read | 0 |
| `@canvas` | Binding | Existing XR scene physics owner | — | read | 0 |

*No tool-identity entries (`[ns].[tool]`) apply — none of the three features introduces an external-agent-invocable tool, consistent with Part IV.*

---

## Part VI — Readiness Gap Matrix

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criteria (VCC) |
|---|---|---|---|---|---|
| Capability detection | `spec-complete` | `undocumented` | No Evidence Reference recorded yet | major | AC-1, AC-5 pass on device-feature matrix |
| Live capture + synthesis | `spec-complete` | `undocumented` | No Evidence Reference recorded yet | major | AC-2 passes on reference device |
| Post-process fallback | `spec-complete` | `undocumented` | No Evidence Reference recorded yet | major | AC-3 passes under simulated frame-budget breach |
| Progressive viewer | `spec-complete` | `undocumented` | No Evidence Reference recorded yet | major | AC-4 passes across 4-tier mocked matrix |
| Markerless anchoring fallback | `undocumented` | `undocumented` | Not yet a VCC-bearing story (Should-tier) | minor | Deferred to next Phase 1 pass |
| Native handoff bridge | `undocumented` | `undocumented` | Not yet a VCC-bearing story (Could-tier) | none | Deferred |
| ECS Core | `spec-complete` | `undocumented` | No Evidence Reference recorded yet | major | AC-6 passes on test scene |
| Material Graph Compiler | `spec-complete` | `undocumented` | No Evidence Reference recorded yet | major | AC-7 passes on reference node graph |
| Behavior Graph / dispatcher | `spec-complete` | `undocumented` | Existing dispatcher lacks collision-begin/end triggers; AC-17 is follow-on | major | AC-8 remains separate; AC-14 focused dispatch proof passes |
| Particle System Component | `spec-complete` | `undocumented` | No Evidence Reference recorded yet | minor | AC-9 passes under fixed-duration run |
| Timeline Sequencer | `spec-complete` | `undocumented` | No Evidence Reference recorded yet | minor | AC-10 passes on reference keyframe set |
| Container Muxer | `spec-complete` | `undocumented` | No Evidence Reference recorded yet | major | AC-11 passes on headless playback test |
| Live Preview Channel | `spec-complete` | `undocumented` | No Evidence Reference recorded yet | minor | AC-12 passes within latency bound |
| Existing native spatial physics | existing focused runtime; rung unchanged | `undocumented` | AC-14 must preserve existing behavior and evidence boundaries | major | Existing focused physics checks plus no-regression proof |
| Collision Event Bridge (AC-14) | `spec-complete` | `undocumented` | Implementation and exact-revision evidence pending | major | Collision begin/end dispatch exactly once; unbound transition invokes zero actions |
| Force accumulation and joints (AC-13) | `undocumented` | `undocumented` | Engine lacks force accumulator, angular state, and joints | deferred | Separate accepted design and focused proof |
| Spatial Audio Component (AC-15) | `undocumented` | `undocumented` | No admitted implementation | deferred | Separate user-gesture/lifecycle design and listener-sweep proof |
| Portal Component (AC-16) | `undocumented` | `undocumented` | ADR-12 proposed; no implementation or pixel evidence | deferred | Sole-renderer implementation plus masked-region pixel proof |
| Interaction Component (AC-17) | `undocumented` | `undocumented` | No hand-ray target adapter exists | deferred | Pointer/touch proof plus separately admitted real hand-ray source |

---

## Part VII — Validation Checklist Status

*(Pre-Implementation Gate items applicable at this authoring stage; unresolved items are explicit open items, not silent gaps.)*

- [x] Development team confirms TAD provides sufficient guidance *(solo-dev context — self-confirmed at authoring time; re-confirm at Phase 2 gate)*
- [x] QA confirms acceptance criteria are objectively testable *(all 17 ACs carry a VCC translation)*
- [x] Success metrics defined with baseline, target, and timeline *(all three features)*
- [x] Quality attributes specified with measurable scenarios; token cost and TCO attributes present *(all three features)*
- [ ] Open questions resolved or formally tracked *(9 open questions across all three features; tracked, not yet resolved)*
- [ ] TTV validated on a clean environment *(estimates only; walk-through pending Phase 3, all three features)*
- [x] Topology diagram corrected to the existing native physics owner and immediate AC-14 adapter; AC-13/15/16/17 remain outside the delivered topology
- [ ] Token budget actuals vs. estimates reviewed *(no actuals yet — pre-implementation)*
- [x] ADR-10/11 ownership corrected to the existing root ECS and native TypeScript physics owners; no new dependency admitted
- [ ] Agent-platform execution order reviewed *(n/a — all three dimensions explicitly Won't this increment, see Part IV)*
- [x] Readiness gap matrix present *(Part VI covers all three features and explicitly defers the separate FPS/MMORPG multiplayer scope)*
- [ ] License text re-verified for the pinned versions of the packages named in ADR-5, ADR-6, and ADR-8's Reference implementation lines, before Phase 2 merge *(tracked in each ADR's Consequences; not yet performed)*
- [ ] AC-14 implementation and exact-revision source/runtime/browser evidence completed *(documentation correction alone is not readiness proof)*

**Coverage ratio**: 17 of 17 PRD acceptance criteria map to a VCC (17/17); 20 of 20 TAD component rows carry a stated Readiness rung (20/20). Advisory-only guidance items are not counted in this ratio.

**Alignment status**: the authority correction is documentation-only. AC-14 is `spec-complete` and still lacks implementation and exact-revision evidence. AC-13, AC-15, AC-16, and AC-17 remain `undocumented` follow-on slices. No runtime-ready, production-verified, Prod, Cloudflare, Apple-device, Xcode, visionOS Simulator, or live-browser claim follows from this edit.
