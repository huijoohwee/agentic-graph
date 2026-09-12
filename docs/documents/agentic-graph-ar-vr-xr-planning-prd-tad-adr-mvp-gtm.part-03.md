---
title: "Reference implementation: agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm section 3"
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
source_section_lines: "872-1332"
---

[Combined planning owner](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-AR-VR-XR-PRD-TAD-ADR-MVP-GTM@3.0.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

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
agentic-graph already owns `SpatialPhysicsEngine`, XR model/adapter/runtime layers, fixed stepping, impulses, collision and sensor transitions, queries, and snapshots. The prior text incorrectly selected an external WASM engine and claimed force, joint, and angular capabilities that are not present.

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

## Part V — Invocation Register: agentic-graph AR/VR/XR Layer

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
| `@agentic-os-behavior-graph-contract` | Binding | Behavior Graph Compiler owner | — | read | 0 |
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

