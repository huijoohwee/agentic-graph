---
title: "agentic-graph Agentic Travel Agencies — Flight Booking, Comparison Shopping & Shared-Canvas Primitive"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.6.1"
date: "2026-09-12"
lang: "en-US"
owner: "Solo Founder / AI Orchestrator"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
historical_delivered_rung: "protected-main-integrated"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-AGENTIC-TRAVEL-AGENCIES-PRD-TAD-ADR-MVP-GTM"
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.6.0"
prd_revision: "0.6.1"
tad_revision: "0.6.1"
adr_revision: "0.6.1"
mvp_revision: "0.6.1"
gtm_revision: "0.6.1"
---

The prior [inherited specification](agentic-graph-agentic-travel-agencies-prd-tad-adr-mvp-gtm.md) remains byte-exact because the travel-commerce reused-interface evidence pins it. This planning successor supplies the current five-role structure; it does not replace the inherited interface baseline or renew its runtime evidence.

# Reference implementation: agentic-graph Agentic Travel Agencies — Flight Booking, Comparison Shopping & Shared-Canvas Primitive

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-AGENTIC-TRAVEL-AGENCIES-PRD-TAD-ADR-MVP-GTM@0.6.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="feature-agentic-travel-agency--flagship-flows--shared-canvas-primitive"></a>
- [Feature: Agentic Travel Agency — Flagship Flows & Shared-Canvas Primitive](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#feature-agentic-travel-agency--flagship-flows--shared-canvas-primitive)
<a id="problem-statement"></a>
- [Problem Statement](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#problem-statement)
<a id="personas"></a>
- [Personas](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#personas)
<a id="user-journey-stage"></a>
- [User Journey Stage](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#user-journey-stage)
<a id="user-stories"></a>
- [User Stories](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#user-stories)
<a id="acceptance-criteria"></a>
- [Acceptance Criteria](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria)
<a id="success-metrics"></a>
- [Success Metrics](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#success-metrics)
<a id="moscow-priority"></a>
- [MoSCoW Priority](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority)
<a id="min-viable-scope"></a>
- [Min-Viable Scope](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope)
<a id="out-of-scope"></a>
- [Out of Scope](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope)
<a id="dependencies"></a>
- [Dependencies](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#dependencies)
<a id="open-questions"></a>
- [Open Questions](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#open-questions)
<a id="architecture-flight-booking-comparison-shopping--shared-canvas-primitive"></a>
- [Architecture: Flight Booking, Comparison Shopping & Shared-Canvas Primitive](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#architecture-flight-booking-comparison-shopping--shared-canvas-primitive)
<a id="overview"></a>
- [Overview](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#overview)
<a id="journey--system-mapping"></a>
- [Journey → System Mapping](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#journey--system-mapping)
<a id="topology"></a>
- [Topology](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#topology)
<a id="orchestrationharness-flows"></a>
- [Orchestration/Harness Flows](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#orchestrationharness-flows)
<a id="component-specifications"></a>
- [Component Specifications](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#component-specifications)
<a id="integration-contracts"></a>
- [Integration Contracts](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#integration-contracts)
<a id="architectural-decisions"></a>
- [Architectural Decisions](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions)
<a id="quality-attributes"></a>
- [Quality Attributes](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#quality-attributes)
<a id="deployment-strategy"></a>
- [Deployment Strategy](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#deployment-strategy)
<a id="component-inventory"></a>
- [Component Inventory](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#component-inventory)
<a id="deploy-boundary-register"></a>
- [Deploy Boundary Register](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#deploy-boundary-register)
<a id="adr-1-shared-canvas-node-as-crdt-backed-single-source"></a>
- [ADR-1: Shared Canvas Node as CRDT-Backed Single Source](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#adr-1-shared-canvas-node-as-crdt-backed-single-source)
<a id="context"></a>
- [Context](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#context)
<a id="decision"></a>
- [Decision](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#decision)
<a id="alternatives-considered"></a>
- [Alternatives Considered](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#alternatives-considered)
<a id="rationale"></a>
- [Rationale](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#rationale)
<a id="tco-impact"></a>
- [TCO Impact](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#tco-impact)
<a id="consequences"></a>
- [Consequences](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#consequences)
<a id="adr-2-flight-booking-via-reference-implementation-gds-api"></a>
- [ADR-2: Flight Booking via Reference-Implementation GDS API](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#adr-2-flight-booking-via-reference-implementation-gds-api)
<a id="context-1"></a>
- [Context](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#context-1)
<a id="decision-1"></a>
- [Decision](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#decision-1)
<a id="alternatives-considered-1"></a>
- [Alternatives Considered](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#alternatives-considered-1)
<a id="rationale-1"></a>
- [Rationale](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#rationale-1)
<a id="tco-impact-1"></a>
- [TCO Impact](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-1)
<a id="consequences-1"></a>
- [Consequences](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#consequences-1)
<a id="adr-3-card-issuance-via-reference-implementation-stablecoin-payments-api"></a>
- [ADR-3: Card Issuance via Reference-Implementation Stablecoin Payments API](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#adr-3-card-issuance-via-reference-implementation-stablecoin-payments-api)
<a id="context-2"></a>
- [Context](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#context-2)
<a id="decision-2"></a>
- [Decision](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#decision-2)
<a id="alternatives-considered-2"></a>
- [Alternatives Considered](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered-2)
<a id="rationale-2"></a>
- [Rationale](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#rationale-2)
<a id="tco-impact-2"></a>
- [TCO Impact](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-2)
<a id="consequences-2"></a>
- [Consequences](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#consequences-2)
<a id="adr-4-self-custody-wallet-selection--coreapp-replacing-genericmetamask-assumption"></a>
- [ADR-4: Self-Custody Wallet Selection — Core.app (Replacing Generic/MetaMask Assumption)](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#adr-4-self-custody-wallet-selection--coreapp-replacing-genericmetamask-assumption)
<a id="context-3"></a>
- [Context](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#context-3)
<a id="decision-3"></a>
- [Decision](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#decision-3)
<a id="alternatives-considered-3"></a>
- [Alternatives Considered](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered-3)
<a id="rationale-3"></a>
- [Rationale](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#rationale-3)
<a id="tco-impact-3"></a>
- [TCO Impact](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-3)
<a id="consequences-3"></a>
- [Consequences](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#consequences-3)
<a id="adr-5-dual-settlement-path--on-chain-direct-path-a-vs-straitsx-mediated-only-path-b"></a>
- [ADR-5: Dual Settlement Path — On-Chain-Direct (Path A) vs. StraitsX-Mediated Only (Path B)](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#adr-5-dual-settlement-path--on-chain-direct-path-a-vs-straitsx-mediated-only-path-b)
<a id="context-4"></a>
- [Context](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#context-4)
<a id="decision-4"></a>
- [Decision](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#decision-4)
<a id="alternatives-considered-4"></a>
- [Alternatives Considered](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered-4)
<a id="rationale-4"></a>
- [Rationale](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#rationale-4)
<a id="tco-impact-4"></a>
- [TCO Impact](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-4)
<a id="consequences-4"></a>
- [Consequences](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#consequences-4)
<a id="adr-6-card-issuance-transport--funding-mechanism--correcting-adr-3"></a>
- [ADR-6: Card Issuance Transport & Funding Mechanism — Correcting ADR-3](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#adr-6-card-issuance-transport--funding-mechanism--correcting-adr-3)
<a id="context-5"></a>
- [Context](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#context-5)
<a id="decision-5"></a>
- [Decision](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#decision-5)
<a id="alternatives-considered-5"></a>
- [Alternatives Considered](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered-5)
<a id="rationale-5"></a>
- [Rationale](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#rationale-5)
<a id="tco-impact-5"></a>
- [TCO Impact](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-5)
<a id="consequences-5"></a>
- [Consequences](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#consequences-5)
<a id="adr-7-notification-channel-selection--telegram-primary-whatsapp-follow-on-web-push-complementary-footnote"></a>
- [ADR-7: Notification Channel Selection — Telegram (Primary), WhatsApp (Follow-on), Web Push (Complementary Footnote)](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#adr-7-notification-channel-selection--telegram-primary-whatsapp-follow-on-web-push-complementary-footnote)
<a id="context-6"></a>
- [Context](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#context-6)
<a id="decision-6"></a>
- [Decision](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#decision-6)
<a id="alternatives-considered-6"></a>
- [Alternatives Considered](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered-6)
<a id="rationale-6"></a>
- [Rationale](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#rationale-6)
<a id="tco-impact-6"></a>
- [TCO Impact](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-6)
<a id="consequences-6"></a>
- [Consequences](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#consequences-6)
<a id="alignment-note-condensed"></a>
- [Alignment Note (condensed)](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#alignment-note-condensed)
<a id="latest-progress--2026-08-18"></a>
- [Latest Progress — 2026-08-18](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#latest-progress--2026-08-18)
<a id="latest-validation--2026-08-18"></a>
- [Latest Validation — 2026-08-18](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#latest-validation--2026-08-18)
<a id="next-steps"></a>
- [Next Steps](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#next-steps)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#planning-gaps--reference-implementation)

<a id="agentic-graph-agentic-travel-agencies--combined-prd-tad-adr-mvp-gtm"></a> [agentic-graph Agentic Travel Agencies — Combined PRD-TAD-ADR-MVP-GTM](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#agentic-graph-agentic-travel-agencies--combined-prd-tad-adr-mvp-gtm)
