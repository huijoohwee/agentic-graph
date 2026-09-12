---
title: "agentic-graph AR/VR/XR — Device-Agnostic Capture, Viewing, Native In-Repo Spatial Authoring & Game Simulation"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "3.0.1"
date: "2026-09-12"
lang: "en-US"
frontmatter_contract: "required"
owner: "Solo Founder / AI Orchestrator"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
continuity_id: "PLAN-AGENTIC-GRAPH-AR-VR-XR-PRD-TAD-ADR-MVP-GTM"
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "3.0.0"
prd_revision: "3.0.1"
tad_revision: "3.0.1"
adr_revision: "3.0.1"
mvp_revision: "3.0.1"
gtm_revision: "3.0.1"
---

The prior [XR specification](agentic-graph-ar-vr-xr-prd-tad-adr-mvp-gtm.md) remains byte-exact because the XR v2 runtime checks pin its historical AC-1–AC-12 authority. This successor supplies the current planning structure; it does not replace that pinned conformance baseline or renew its runtime evidence.

# Reference implementation: agentic-graph AR/VR/XR — Device-Agnostic Capture, Viewing, Native In-Repo Spatial Authoring & Game Simulation

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-AR-VR-XR-PRD-TAD-ADR-MVP-GTM@3.0.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="part-i--product-requirements-prd"></a>
- [Part I — Product Requirements (PRD)](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#part-i--product-requirements-prd)
<a id="feature-a-device-agnostic-arvrxr-capture--immersive-viewing-layer"></a>
- [Feature A: Device-Agnostic AR/VR/XR Capture & Immersive Viewing Layer](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#feature-a-device-agnostic-arvrxr-capture--immersive-viewing-layer)
<a id="problem-statement"></a>
- [Problem Statement](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#problem-statement)
<a id="personas"></a>
- [Personas](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#personas)
<a id="user-journey-stage"></a>
- [User Journey Stage](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#user-journey-stage)
<a id="journey-solo-builder--capture-and-publish-a-spatial-asset-from-a-phone"></a>
- [Journey: Solo Builder — Capture and publish a spatial asset from a phone](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#journey-solo-builder--capture-and-publish-a-spatial-asset-from-a-phone)
<a id="user-stories"></a>
- [User Stories](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#user-stories)
<a id="acceptance-criteria"></a>
- [Acceptance Criteria](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria)
<a id="success-metrics"></a>
- [Success Metrics](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#success-metrics)
<a id="moscow-priority"></a>
- [MoSCoW Priority](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority)
<a id="min-viable-scope"></a>
- [Min-Viable Scope](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope)
<a id="out-of-scope"></a>
- [Out of Scope](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope)
<a id="dependencies"></a>
- [Dependencies](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#dependencies)
<a id="open-questions"></a>
- [Open Questions](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#open-questions)
<a id="feature-b-native-in-repo-spatial-authoring-toolkit"></a>
- [Feature B: Native In-Repo Spatial Authoring Toolkit](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#feature-b-native-in-repo-spatial-authoring-toolkit)
<a id="problem-statement-1"></a>
- [Problem Statement](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#problem-statement-1)
<a id="personas-1"></a>
- [Personas](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#personas-1)
<a id="user-journey-stage-1"></a>
- [User Journey Stage](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#user-journey-stage-1)
<a id="journey-solo-builder--author-a-spatial-scene-entirely-in-browser"></a>
- [Journey: Solo Builder — Author a spatial scene entirely in-browser](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#journey-solo-builder--author-a-spatial-scene-entirely-in-browser)
<a id="user-stories-1"></a>
- [User Stories](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#user-stories-1)
<a id="acceptance-criteria-1"></a>
- [Acceptance Criteria](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria-1)
<a id="success-metrics-1"></a>
- [Success Metrics](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#success-metrics-1)
<a id="moscow-priority-1"></a>
- [MoSCoW Priority](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority-1)
<a id="min-viable-scope-1"></a>
- [Min-Viable Scope](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope-1)
<a id="out-of-scope-1"></a>
- [Out of Scope](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope-1)
<a id="dependencies-1"></a>
- [Dependencies](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#dependencies-1)
<a id="open-questions-1"></a>
- [Open Questions](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#open-questions-1)
<a id="feature-c-native-in-repo-game-simulation-layer"></a>
- [Feature C: Native In-Repo Game Simulation Layer](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#feature-c-native-in-repo-game-simulation-layer)
<a id="problem-statement-2"></a>
- [Problem Statement](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#problem-statement-2)
<a id="personas-2"></a>
- [Personas](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#personas-2)
<a id="user-journey-stage-2"></a>
- [User Journey Stage](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#user-journey-stage-2)
<a id="journey-solo-builder--build-an-interactive-spatial-scene-with-physics-and-behavior"></a>
- [Journey: Solo Builder — Build an interactive spatial scene with physics and behavior](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#journey-solo-builder--build-an-interactive-spatial-scene-with-physics-and-behavior)
<a id="user-stories-2"></a>
- [User Stories](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#user-stories-2)
<a id="acceptance-criteria-2"></a>
- [Acceptance Criteria](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria-2)
<a id="success-metrics-2"></a>
- [Success Metrics](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#success-metrics-2)
<a id="moscow-priority-2"></a>
- [MoSCoW Priority](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority-2)
<a id="min-viable-scope-2"></a>
- [Min-Viable Scope](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope-2)
<a id="out-of-scope-2"></a>
- [Out of Scope](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope-2)
<a id="dependencies-2"></a>
- [Dependencies](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#dependencies-2)
<a id="open-questions-2"></a>
- [Open Questions](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#open-questions-2)
<a id="part-ii--technical-architecture-tad"></a>
- [Part II — Technical Architecture (TAD)](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#part-ii--technical-architecture-tad)
<a id="architecture-device-agnostic-capture-viewing-native-in-repo-spatial-authoring--game-simulation"></a>
- [Architecture: Device-Agnostic Capture, Viewing, Native In-Repo Spatial Authoring & Game Simulation](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#architecture-device-agnostic-capture-viewing-native-in-repo-spatial-authoring--game-simulation)
<a id="overview"></a>
- [Overview](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#overview)
<a id="journey--system-mapping"></a>
- [Journey → System Mapping](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#journey--system-mapping)
<a id="topology"></a>
- [Topology](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#topology)
<a id="orchestrationharness-flows"></a>
- [Orchestration/Harness Flows](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#orchestrationharness-flows)
<a id="component-specifications"></a>
- [Component Specifications](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#component-specifications)
<a id="integration-contracts"></a>
- [Integration Contracts](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#integration-contracts)
<a id="architectural-decisions"></a>
- [Architectural Decisions](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#architectural-decisions)
<a id="quality-attributes"></a>
- [Quality Attributes](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#quality-attributes)
<a id="deployment-strategy"></a>
- [Deployment Strategy](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#deployment-strategy)
<a id="architecture-diagrams"></a>
- [Architecture Diagrams](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#architecture-diagrams)
<a id="component-inventory"></a>
- [Component Inventory](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#component-inventory)
<a id="deploy-boundary-register"></a>
- [Deploy Boundary Register](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#deploy-boundary-register)
<a id="part-iii--architectural-decision-records-adr"></a>
- [Part III — Architectural Decision Records (ADR)](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#part-iii--architectural-decision-records-adr)
<a id="adr-1-anchoring--tracking-layer-selection"></a>
- [ADR-1: Anchoring & Tracking Layer Selection](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#adr-1-anchoring--tracking-layer-selection)
<a id="context"></a>
- [Context](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#context)
<a id="decision"></a>
- [Decision](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#decision)
<a id="alternatives-considered"></a>
- [Alternatives Considered](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#alternatives-considered)
<a id="rationale"></a>
- [Rationale](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#rationale)
<a id="tco-impact"></a>
- [TCO Impact](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#tco-impact)
<a id="consequences"></a>
- [Consequences](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#consequences)
<a id="adr-2-monocular-depth-inference-layer-selection"></a>
- [ADR-2: Monocular Depth Inference Layer Selection](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#adr-2-monocular-depth-inference-layer-selection)
<a id="context-1"></a>
- [Context](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#context-1)
<a id="decision-1"></a>
- [Decision](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#decision-1)
<a id="alternatives-considered-1"></a>
- [Alternatives Considered](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#alternatives-considered-1)
<a id="rationale-1"></a>
- [Rationale](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#rationale-1)
<a id="tco-impact-1"></a>
- [TCO Impact](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#tco-impact-1)
<a id="consequences-1"></a>
- [Consequences](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#consequences-1)
<a id="adr-3-browser-native-capture-strategy-vs-native-app-capture"></a>
- [ADR-3: Browser-Native Capture Strategy vs. Native-App Capture](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#adr-3-browser-native-capture-strategy-vs-native-app-capture)
<a id="context-2"></a>
- [Context](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#context-2)
<a id="decision-2"></a>
- [Decision](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#decision-2)
<a id="alternatives-considered-2"></a>
- [Alternatives Considered](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#alternatives-considered-2)
<a id="rationale-2"></a>
- [Rationale](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#rationale-2)
<a id="tco-impact-2"></a>
- [TCO Impact](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#tco-impact-2)
<a id="consequences-2"></a>
- [Consequences](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#consequences-2)
<a id="adr-4-entity-component-system-scene-model"></a>
- [ADR-4: Entity-Component-System Scene Model](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#adr-4-entity-component-system-scene-model)
<a id="context-3"></a>
- [Context](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#context-3)
<a id="decision-3"></a>
- [Decision](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#decision-3)
<a id="alternatives-considered-3"></a>
- [Alternatives Considered](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#alternatives-considered-3)
<a id="rationale-3"></a>
- [Rationale](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#rationale-3)
<a id="tco-impact-3"></a>
- [TCO Impact](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#tco-impact-3)
<a id="consequences-3"></a>
- [Consequences](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#consequences-3)
<a id="adr-5-node-based-visual-graph-framework-selection"></a>
- [ADR-5: Node-Based Visual Graph Framework Selection](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#adr-5-node-based-visual-graph-framework-selection)
<a id="context-4"></a>
- [Context](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#context-4)
<a id="decision-4"></a>
- [Decision](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#decision-4)
<a id="alternatives-considered-4"></a>
- [Alternatives Considered](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#alternatives-considered-4)
<a id="rationale-4"></a>
- [Rationale](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#rationale-4)
<a id="tco-impact-4"></a>
- [TCO Impact](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#tco-impact-4)
<a id="consequences-4"></a>
- [Consequences](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#consequences-4)
<a id="adr-6-gpu-particle-system-selection"></a>
- [ADR-6: GPU Particle System Selection](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#adr-6-gpu-particle-system-selection)
<a id="context-5"></a>
- [Context](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#context-5)
<a id="decision-5"></a>
- [Decision](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#decision-5)
<a id="alternatives-considered-5"></a>
- [Alternatives Considered](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#alternatives-considered-5)
<a id="rationale-5"></a>
- [Rationale](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#rationale-5)
<a id="tco-impact-5"></a>
- [TCO Impact](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#tco-impact-5)
<a id="consequences-5"></a>
- [Consequences](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#consequences-5)
<a id="adr-7-media-container-muxing-strategy"></a>
- [ADR-7: Media Container Muxing Strategy](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#adr-7-media-container-muxing-strategy)
<a id="context-6"></a>
- [Context](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#context-6)
<a id="decision-6"></a>
- [Decision](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#decision-6)
<a id="alternatives-considered-6"></a>
- [Alternatives Considered](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#alternatives-considered-6)
<a id="rationale-6"></a>
- [Rationale](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#rationale-6)
<a id="tco-impact-6"></a>
- [TCO Impact](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#tco-impact-6)
<a id="consequences-6"></a>
- [Consequences](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#consequences-6)
<a id="adr-8-animation-timeline--sequencer-selection"></a>
- [ADR-8: Animation Timeline / Sequencer Selection](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#adr-8-animation-timeline--sequencer-selection)
<a id="context-7"></a>
- [Context](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#context-7)
<a id="decision-7"></a>
- [Decision](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#decision-7)
<a id="alternatives-considered-7"></a>
- [Alternatives Considered](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#alternatives-considered-7)
<a id="rationale-7"></a>
- [Rationale](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#rationale-7)
<a id="tco-impact-7"></a>
- [TCO Impact](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#tco-impact-7)
<a id="consequences-7"></a>
- [Consequences](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#consequences-7)
<a id="adr-9-scene-interchange-format"></a>
- [ADR-9: Scene Interchange Format](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#adr-9-scene-interchange-format)
<a id="context-8"></a>
- [Context](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#context-8)
<a id="decision-8"></a>
- [Decision](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#decision-8)
<a id="alternatives-considered-8"></a>
- [Alternatives Considered](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#alternatives-considered-8)
<a id="rationale-8"></a>
- [Rationale](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#rationale-8)
<a id="tco-impact-8"></a>
- [TCO Impact](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#tco-impact-8)
<a id="consequences-8"></a>
- [Consequences](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#consequences-8)
<a id="adr-10-existing-ecs-and-xr-ownership-boundary"></a>
- [ADR-10: Existing ECS and XR Ownership Boundary](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#adr-10-existing-ecs-and-xr-ownership-boundary)
<a id="context-9"></a>
- [Context](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#context-9)
<a id="decision-9"></a>
- [Decision](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#decision-9)
<a id="consequences-9"></a>
- [Consequences](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#consequences-9)
<a id="adr-11-reuse-independent-native-spatial-physics"></a>
- [ADR-11: Reuse Independent Native Spatial Physics](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#adr-11-reuse-independent-native-spatial-physics)
<a id="context-10"></a>
- [Context](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#context-10)
<a id="decision-10"></a>
- [Decision](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#decision-10)
<a id="tco-impact-9"></a>
- [TCO Impact](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#tco-impact-9)
<a id="consequences-10"></a>
- [Consequences](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#consequences-10)
<a id="adr-12-portal-rendering-technique-selection"></a>
- [ADR-12: Portal Rendering Technique Selection](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#adr-12-portal-rendering-technique-selection)
<a id="context-11"></a>
- [Context](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#context-11)
<a id="decision-11"></a>
- [Decision](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#decision-11)
<a id="alternatives-considered-9"></a>
- [Alternatives Considered](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#alternatives-considered-9)
<a id="rationale-9"></a>
- [Rationale](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#rationale-9)
<a id="tco-impact-10"></a>
- [TCO Impact](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#tco-impact-10)
<a id="consequences-11"></a>
- [Consequences](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#consequences-11)
<a id="part-iv--agent-platform-readiness"></a>
- [Part IV — Agent-Platform Readiness](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#part-iv--agent-platform-readiness)
<a id="part-v--invocation-register-agentic-graph-arvrxr-layer"></a>
- [Part V — Invocation Register: agentic-graph AR/VR/XR Layer](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#part-v--invocation-register-agentic-graph-arvrxr-layer)
<a id="part-vi--readiness-gap-matrix"></a>
- [Part VI — Readiness Gap Matrix](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-03.md#part-vi--readiness-gap-matrix)
<a id="part-vii--validation-checklist-status"></a>
- [Part VII — Validation Checklist Status](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-04.md#part-vii--validation-checklist-status)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-04.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-04.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-04.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-04.md#planning-gaps--reference-implementation)

<a id="agentic-graph-arvrxr--device-agnostic-capture-viewing-native-in-repo-spatial-authoring--game-simulation"></a> [agentic-graph AR/VR/XR — Device-Agnostic Capture, Viewing, Native In-Repo Spatial Authoring & Game Simulation](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#agentic-graph-arvrxr--device-agnostic-capture-viewing-native-in-repo-spatial-authoring--game-simulation)
