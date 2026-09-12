---
title: "SME Care-Agent — Growth-Stage Risk & Coverage Copilot"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.2.1"
date: "2026-09-12"
updated: "2026-09-05"
lang: "en-SG"
frontmatter_contract: "required"
owner: "SME care-agent product and architecture"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
doc_path: "docs/documents/sme-care-agent-prd-tad-adr-mvp-gtm.md"
production_release_authorized: false
evidence_references:
  - check: "npm run ci:integration"
    result: "passed: affected integration gate including repository runtime tests"
    surface: "authoring"
    observed_at: "2026-09-05"
graphId: "md:sme-care-agent-prd-tad"
schema: "agentic-os-prd-tad/v1"
guidelines_ref: "huijoohwee.github.io/guidelines/prd-tad-adr-mvp-gtm-guidelines.md@2.4.0"
lifecycle_status: "active"
parent: ""
parent_version: ""
continuity_id: "PLAN-SME-CARE-AGENT-PRD-TAD-ADR-MVP-GTM"
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

# Reference implementation: SME Care-Agent — Growth-Stage Risk & Coverage Copilot

This combined planning artifact joins `PLAN-SME-CARE-AGENT-PRD-TAD-ADR-MVP-GTM@0.2.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="scope--neutrality-contract"></a>
- [Scope & Neutrality Contract](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#scope--neutrality-contract)
<a id="feature-sme-growth-stage-risk--coverage-copilot"></a>
- [Feature: SME Growth-Stage Risk & Coverage Copilot](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#feature-sme-growth-stage-risk--coverage-copilot)
<a id="problem-statement"></a>
- [Problem Statement](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#problem-statement)
<a id="personas"></a>
- [Personas](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#personas)
<a id="user-journey-stage"></a>
- [User Journey Stage](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#user-journey-stage)
<a id="journey-sme-owner--close-my-coverage-gap-before-it-costs-me"></a>
- [Journey: SME Owner — Close My Coverage Gap Before It Costs Me](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#journey-sme-owner--close-my-coverage-gap-before-it-costs-me)
<a id="user-stories"></a>
- [User Stories](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#user-stories)
<a id="acceptance-criteria"></a>
- [Acceptance Criteria](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria)
<a id="success-metrics"></a>
- [Success Metrics](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#success-metrics)
<a id="time-to-value-sme-care-agent-first-reg--first-flagged-gap"></a>
- [Time-to-Value: SME Care-Agent (First REG + First Flagged Gap)](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#time-to-value-sme-care-agent-first-reg--first-flagged-gap)
<a id="moscow-priority"></a>
- [MoSCoW Priority](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority)
<a id="min-viable-scope"></a>
- [Min-Viable Scope](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope)
<a id="out-of-scope"></a>
- [Out of Scope](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope)
<a id="dependencies"></a>
- [Dependencies](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#dependencies)
<a id="open-questions"></a>
- [Open Questions](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#open-questions)
<a id="architecture-sme-care-agent--growth-stage-risk--coverage-copilot"></a>
- [Architecture: SME Care-Agent — Growth-Stage Risk & Coverage Copilot](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#architecture-sme-care-agent--growth-stage-risk--coverage-copilot)
<a id="overview"></a>
- [Overview](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#overview)
<a id="journey--system-mapping"></a>
- [Journey → System Mapping](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#journey--system-mapping)
<a id="topology"></a>
- [Topology](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#topology)
<a id="orchestrationharness-flows"></a>
- [Orchestration/Harness Flows](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#orchestrationharness-flows)
<a id="component-specifications"></a>
- [Component Specifications](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#component-specifications)
<a id="integration-contracts"></a>
- [Integration Contracts](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#integration-contracts)
<a id="architectural-decisions"></a>
- [Architectural Decisions](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions)
<a id="adr-1-reuse-the-existing-probe-tree-runtime-for-growth-stage-intake"></a>
- [ADR-1: Reuse the Existing Probe-Tree Runtime for Growth-Stage Intake](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#adr-1-reuse-the-existing-probe-tree-runtime-for-growth-stage-intake)
<a id="context"></a>
- [Context](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#context)
<a id="decision"></a>
- [Decision](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#decision)
<a id="alternatives-considered"></a>
- [Alternatives Considered](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#alternatives-considered)
<a id="rationale"></a>
- [Rationale](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#rationale)
<a id="tco-impact"></a>
- [TCO Impact](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#tco-impact)
<a id="consequences"></a>
- [Consequences](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#consequences)
<a id="adr-2-multilingual-adapter--local-model-vs-regional-managed-api"></a>
- [ADR-2: Multilingual Adapter — Local Model vs Regional Managed API](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#adr-2-multilingual-adapter--local-model-vs-regional-managed-api)
<a id="context-1"></a>
- [Context](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#context-1)
<a id="decision-1"></a>
- [Decision](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#decision-1)
<a id="alternatives-considered-1"></a>
- [Alternatives Considered](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#alternatives-considered-1)
<a id="rationale-1"></a>
- [Rationale](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#rationale-1)
<a id="tco-impact-1"></a>
- [TCO Impact](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-1)
<a id="consequences-1"></a>
- [Consequences](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#consequences-1)
<a id="adr-3-coverage-catalog-source--openmock-catalog-vs-live-insurer-api"></a>
- [ADR-3: Coverage Catalog Source — Open/Mock Catalog vs Live Insurer API](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#adr-3-coverage-catalog-source--openmock-catalog-vs-live-insurer-api)
<a id="context-2"></a>
- [Context](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#context-2)
<a id="decision-2"></a>
- [Decision](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#decision-2)
<a id="alternatives-considered-2"></a>
- [Alternatives Considered](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered-2)
<a id="rationale-2"></a>
- [Rationale](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#rationale-2)
<a id="tco-impact-2"></a>
- [TCO Impact](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-2)
<a id="consequences-2"></a>
- [Consequences](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#consequences-2)
<a id="quality-attributes"></a>
- [Quality Attributes](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#quality-attributes)
<a id="deployment-strategy"></a>
- [Deployment Strategy](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#deployment-strategy)
<a id="architecture-diagrams"></a>
- [Architecture Diagrams](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#architecture-diagrams)
<a id="component-inventory"></a>
- [Component Inventory](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#component-inventory)
<a id="agent-platform-readiness-validation-and-traceability"></a>
- [Agent-Platform Readiness, Validation, and Traceability](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#agent-platform-readiness-validation-and-traceability)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#planning-gaps--reference-implementation)

<a id="sme-care-agent--growth-stage-risk--coverage-copilot"></a> [SME Care-Agent — Growth-Stage Risk & Coverage Copilot](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#sme-care-agent--growth-stage-risk--coverage-copilot)
<a id="part-i--product-requirements-prd"></a> [Part I — Product Requirements (PRD)](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#part-i--product-requirements-prd)
<a id="part-ii--technical-architecture-tad"></a> [Part II — Technical Architecture (TAD)](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#part-ii--technical-architecture-tad)
