---
title: "Reference implementation: agentic-graph Codebase Responsibility Flow PRD-TAD-ADR-MVP-GTM"
id: "md:agentic-graph-codebase-responsibility-flow-prd-tad"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.4.1"
date: "2026-09-12"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.codebase-responsibility-flow"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.md"
deployment_topology: "Authoring only; Mirror and Delivery require separate authority"
scope: "responsibility-ownership index for registered agentic-graph canvas settings"
source_of_truth: "settings registry, deterministic taxonomy, and source-literal provenance"
generated_outputs:
  - "docs/agentic-graph-codebase-responsibility-flow.md"
  - "docs/agentic-graph-codebase-responsibility-flow/part-*.md"
  - "canvas/public/settings-flow.json"
  - "canvas/src/features/settings/settings-flow.schema.json"
related:
  - "../../../huijoohwee.github.io/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
  - "docs/agentic-graph-codebase-responsibility-flow.md"
  - "docs/documents/agentic-graph-modularity-prd-tad-adr-mvp-gtm.md"
  - "docs/documents/agentic-graph-settings-document.md"
  - "docs/documents/agentic-graph-codebase-index-document.md"
  - ".kiro/specs/tech-stack-optimization/requirements.md"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-CODEBASE-RESPONSIBILITY-FLOW-PRD-TAD-ADR-MVP-GTM"
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "1.4.0"
prd_revision: "1.4.1"
tad_revision: "1.4.1"
adr_revision: "1.4.1"
mvp_revision: "1.4.1"
gtm_revision: "1.4.1"
---

# Reference implementation: Reference implementation: agentic-graph Codebase Responsibility Flow PRD-TAD-ADR-MVP-GTM

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-CODEBASE-RESPONSIBILITY-FLOW-PRD-TAD-ADR-MVP-GTM@1.4.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="executive-summary"></a>
- [Executive Summary](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#executive-summary)
<a id="directive-commitments"></a>
- [Directive Commitments](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#directive-commitments)
<a id="prd"></a>
- [PRD](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#prd)
<a id="feature-codebase-responsibility-flow-index"></a>
- [Feature: Codebase Responsibility Flow Index](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#feature-codebase-responsibility-flow-index)
<a id="problem-statement"></a>
- [Problem Statement](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#problem-statement)
<a id="personas"></a>
- [Personas](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#personas)
<a id="user-journey-stage"></a>
- [User Journey Stage](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#user-journey-stage)
<a id="journey-solo-maintainer--locate-the-owner-of-a-concern"></a>
- [Journey: Solo Maintainer — Locate the owner of a concern](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#journey-solo-maintainer--locate-the-owner-of-a-concern)
<a id="user-stories"></a>
- [User Stories](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#user-stories)
<a id="acceptance-criteria"></a>
- [Acceptance Criteria](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria)
<a id="success-metrics"></a>
- [Success Metrics](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#success-metrics)
<a id="moscow-priority"></a>
- [MoSCoW Priority](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority)
<a id="min-viable-scope"></a>
- [Min-Viable Scope](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope)
<a id="out-of-scope"></a>
- [Out of Scope](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope)
<a id="dependencies"></a>
- [Dependencies](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#dependencies)
<a id="open-questions"></a>
- [Open Questions](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#open-questions)
<a id="tad"></a>
- [TAD](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#tad)
<a id="architecture-codebase-responsibility-flow-index"></a>
- [Architecture: Codebase Responsibility Flow Index](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#architecture-codebase-responsibility-flow-index)
<a id="overview"></a>
- [Overview](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#overview)
<a id="journey--system-mapping"></a>
- [Journey → System Mapping](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#journey--system-mapping)
<a id="topology"></a>
- [Topology](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#topology)
<a id="orchestrationharness-flows"></a>
- [Orchestration/Harness Flows](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#orchestrationharness-flows)
<a id="component-specifications"></a>
- [Component Specifications](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#component-specifications)
<a id="integration-contracts"></a>
- [Integration Contracts](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#integration-contracts)
<a id="architectural-decisions"></a>
- [Architectural Decisions](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions)
<a id="adr-1-deterministic-static-extraction-no-llm-in-the-generation-path"></a>
- [ADR-1: Deterministic static extraction, no LLM in the generation path](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#adr-1-deterministic-static-extraction-no-llm-in-the-generation-path)
<a id="context"></a>
- [Context](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#context)
<a id="decision"></a>
- [Decision](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#decision)
<a id="alternatives-considered"></a>
- [Alternatives Considered](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#alternatives-considered)
<a id="rationale"></a>
- [Rationale](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#rationale)
<a id="tco-impact"></a>
- [TCO Impact](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#tco-impact)
<a id="consequences"></a>
- [Consequences](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#consequences)
<a id="adr-2-commit-the-index-as-a-local-markdown-file-rather-than-a-hostedqueryable-service"></a>
- [ADR-2: Commit the index as a local Markdown file rather than a hosted/queryable service](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#adr-2-commit-the-index-as-a-local-markdown-file-rather-than-a-hostedqueryable-service)
<a id="context-1"></a>
- [Context](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#context-1)
<a id="decision-1"></a>
- [Decision](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#decision-1)
<a id="alternatives-considered-1"></a>
- [Alternatives Considered](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#alternatives-considered-1)
<a id="rationale-1"></a>
- [Rationale](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#rationale-1)
<a id="tco-impact-1"></a>
- [TCO Impact](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#tco-impact-1)
<a id="consequences-1"></a>
- [Consequences](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#consequences-1)
<a id="adr-3-adopt-tailwind-v4-as-a-styling-backing-defer-htmx-to-keep-a-single-stack-spa"></a>
- [ADR-3: Adopt Tailwind v4 as a styling backing; defer HTMX to keep a single-stack SPA](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#adr-3-adopt-tailwind-v4-as-a-styling-backing-defer-htmx-to-keep-a-single-stack-spa)
<a id="context-2"></a>
- [Context](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#context-2)
<a id="decision-2"></a>
- [Decision](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#decision-2)
<a id="alternatives-considered-2"></a>
- [Alternatives Considered](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#alternatives-considered-2)
<a id="rationale-2"></a>
- [Rationale](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#rationale-2)
<a id="tco-impact-2"></a>
- [TCO Impact](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-2)
<a id="consequences-2"></a>
- [Consequences](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#consequences-2)
<a id="quality-attributes"></a>
- [Quality Attributes](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#quality-attributes)
<a id="deployment-strategy"></a>
- [Deployment Strategy](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#deployment-strategy)
<a id="deploy-boundary-register"></a>
- [Deploy Boundary Register](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#deploy-boundary-register)
<a id="architecture-diagrams"></a>
- [Architecture Diagrams](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#architecture-diagrams)
<a id="component-inventory"></a>
- [Component Inventory](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#component-inventory)
<a id="prd--tad-traceability"></a>
- [PRD ↔ TAD Traceability](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#prd--tad-traceability)
<a id="time-to-value-codebase-responsibility-flow-index"></a>
- [Time-to-Value: Codebase Responsibility Flow Index](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#time-to-value-codebase-responsibility-flow-index)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#planning-gaps--reference-implementation)

<a id="reference-implementation-agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm"></a> [Reference implementation: agentic-graph Codebase Responsibility Flow PRD-TAD-ADR-MVP-GTM](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#reference-implementation-agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm)
