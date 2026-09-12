---
title: "agentic-graph Agentic Commerce — PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
doc_id: "AGENTIC_OS-AC-001"
version: "0.2.1"
status: "Accepted and implemented"
date: "2026-09-12"
authors: ["airvio"]
schema: "agentic-os-computing-flow/v1"
lang: "en-US"
frontmatter_contract: "required"
epics:
  - id: "AC-E1"
    title: "ACP-Compatible Agent Checkout"
  - id: "AC-E2"
    title: "Web3 Identity & Payment Extension"
  - id: "AC-E3"
    title: "Governance Overlay"
tags: ["acp", "commerce", "web3", "solana-pay", "openbox", "debox", "mcp", "harness", "foss"]
owner: "Product maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-AGENTIC-COMMERCE-PRD-TAD-ADR-MVP-GTM"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.2.0"
prd_revision: "0.2.1"
tad_revision: "0.2.1"
adr_revision: "0.2.1"
mvp_revision: "0.2.1"
gtm_revision: "0.2.1"
---

# Reference implementation: agentic-graph Agentic Commerce — PRD-TAD-ADR-MVP-GTM

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-AGENTIC-COMMERCE-PRD-TAD-ADR-MVP-GTM@0.2.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="overview"></a>
- [Overview](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#overview)
<a id="part-1--prd"></a>
- [Part 1 — PRD](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#part-1--prd)
<a id="epic-ac-e1--acp-compatible-agent-checkout"></a>
- [Epic AC-E1 — ACP-Compatible Agent Checkout](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#epic-ac-e1--acp-compatible-agent-checkout)
<a id="problem-statement"></a>
- [Problem Statement](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#problem-statement)
<a id="personas"></a>
- [Personas](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#personas)
<a id="user-journey--agent-operator-agent-initiated-purchase"></a>
- [User Journey — Agent Operator: Agent-Initiated Purchase](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#user-journey--agent-operator-agent-initiated-purchase)
<a id="user-stories"></a>
- [User Stories](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#user-stories)
<a id="acceptance-criteria"></a>
- [Acceptance Criteria](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria)
<a id="success-metrics"></a>
- [Success Metrics](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#success-metrics)
<a id="moscow-priority"></a>
- [MoSCoW Priority](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority)
<a id="min-viable-scope-ac-e1"></a>
- [Min-Viable Scope (AC-E1)](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope-ac-e1)
<a id="out-of-scope"></a>
- [Out of Scope](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope)
<a id="dependencies"></a>
- [Dependencies](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#dependencies)
<a id="open-questions"></a>
- [Open Questions](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#open-questions)
<a id="epic-ac-e2--web3-identity--payment-extension"></a>
- [Epic AC-E2 — Web3 Identity & Payment Extension](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#epic-ac-e2--web3-identity--payment-extension)
<a id="problem-statement-1"></a>
- [Problem Statement](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#problem-statement-1)
<a id="personas-1"></a>
- [Personas](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#personas-1)
<a id="user-journey--web3-buyer-did-gated-checkout"></a>
- [User Journey — Web3 Buyer: DID-Gated Checkout](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#user-journey--web3-buyer-did-gated-checkout)
<a id="user-stories-1"></a>
- [User Stories](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#user-stories-1)
<a id="acceptance-criteria-1"></a>
- [Acceptance Criteria](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria-1)
<a id="success-metrics-1"></a>
- [Success Metrics](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#success-metrics-1)
<a id="moscow-priority-1"></a>
- [MoSCoW Priority](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority-1)
<a id="min-viable-scope-ac-e2"></a>
- [Min-Viable Scope (AC-E2)](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope-ac-e2)
<a id="out-of-scope-1"></a>
- [Out of Scope](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope-1)
<a id="dependencies-1"></a>
- [Dependencies](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#dependencies-1)
<a id="open-questions-1"></a>
- [Open Questions](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#open-questions-1)
<a id="epic-ac-e3--governance-overlay"></a>
- [Epic AC-E3 — Governance Overlay](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#epic-ac-e3--governance-overlay)
<a id="problem-statement-2"></a>
- [Problem Statement](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#problem-statement-2)
<a id="personas-2"></a>
- [Personas](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#personas-2)
<a id="user-stories-2"></a>
- [User Stories](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#user-stories-2)
<a id="acceptance-criteria-2"></a>
- [Acceptance Criteria](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria-2)
<a id="moscow-priority-2"></a>
- [MoSCoW Priority](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority-2)
<a id="min-viable-scope-ac-e3"></a>
- [Min-Viable Scope (AC-E3)](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope-ac-e3)
<a id="part-2--tad"></a>
- [Part 2 — TAD](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#part-2--tad)
<a id="architecture-overview"></a>
- [Architecture Overview](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#architecture-overview)
<a id="journey--system-mapping"></a>
- [Journey → System Mapping](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#journey--system-mapping)
<a id="component-specifications"></a>
- [Component Specifications](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#component-specifications)
<a id="integration-contracts"></a>
- [Integration Contracts](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#integration-contracts)
<a id="architectural-decisions"></a>
- [Architectural Decisions](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions)
<a id="adr-1-stripe-as-psp-for-fiat-rail"></a>
- [ADR-1: Stripe as PSP for Fiat Rail](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#adr-1-stripe-as-psp-for-fiat-rail)
<a id="adr-2-openbox-api-as-risk-signal-source"></a>
- [ADR-2: OpenBOX API as Risk Signal Source](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#adr-2-openbox-api-as-risk-signal-source)
<a id="adr-3-cloudflare-workers--d1-for-checkout-infrastructure"></a>
- [ADR-3: Cloudflare Workers + D1 for Checkout Infrastructure](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#adr-3-cloudflare-workers--d1-for-checkout-infrastructure)
<a id="workflow-specifications"></a>
- [Workflow Specifications](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#workflow-specifications)
<a id="workflow-fiat-checkout-session-lifecycle"></a>
- [Workflow: Fiat Checkout Session Lifecycle](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#workflow-fiat-checkout-session-lifecycle)
<a id="workflow-web3-checkout--eas-attestation"></a>
- [Workflow: Web3 Checkout + EAS Attestation](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#workflow-web3-checkout--eas-attestation)
<a id="data-flows"></a>
- [Data Flows](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#data-flows)
<a id="data-flow-acp-checkout-session-state"></a>
- [Data Flow: ACP Checkout Session State](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#data-flow-acp-checkout-session-state)
<a id="data-flow-commerce-proof-emission"></a>
- [Data Flow: Commerce Proof Emission](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#data-flow-commerce-proof-emission)
<a id="quality-attributes"></a>
- [Quality Attributes](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#quality-attributes)
<a id="deployment-strategy"></a>
- [Deployment Strategy](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#deployment-strategy)
<a id="architecture-diagram-component-topology"></a>
- [Architecture Diagram: Component Topology](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#architecture-diagram-component-topology)
<a id="component-inventory"></a>
- [Component Inventory](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#component-inventory)
<a id="prd--tad-traceability"></a>
- [PRD ↔ TAD Traceability](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#prd--tad-traceability)
<a id="open-questions-register"></a>
- [Open Questions Register](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#open-questions-register)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-02.md#planning-gaps--reference-implementation)

<a id="agentic-graph-agentic-commerce--prd-tad-adr-mvp-gtm"></a> [agentic-graph Agentic Commerce — PRD-TAD-ADR-MVP-GTM](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.part-01.md#agentic-graph-agentic-commerce--prd-tad-adr-mvp-gtm)
