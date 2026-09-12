---
title: "agentic-graph Vdeoxpln PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
id: "agentic-graph-vdeoxpln-prd-tad"
version: "0.3.1"
status: "implemented-e2e-contract"
created: "2026-05-30"
updated: "2026-05-30"
author: "airvio / joohwee"
domain: "agentic-graph"
lang: "en-US"
frontmatter_contract: "required"
deployment_topology: "Dev -> Prod -> Cloudflare"
dev_root: "$GITHUB_ROOT/agentic-graph"
prod_mirror: "$GITHUB_ROOT/huijoohwee/content/agentic-graph"
cloudflare_route: "https://airvio.co/agentic-graph"
source_repo: "https://github.com/huijoohwee/agentic-graph"
reference_repo: "https://github.com/Starryyu77/papermotion"
reference_reviewed_commit: "1385bde"
reference_boundary: "concept-only; no source, assets, prompts, schemas, examples, or prose copied"
scope: "vdeoxpln enhancement over existing agentic-graph owners"
orientation:
  - "solo-dev"
  - "AI-native"
  - "min-viable-max-value"
  - "TCO-zero"
  - "FOSS-first"
  - "token-economical"
  - "harness-first"
constraints:
  - "universal"
  - "neutral"
  - "project-agnostic"
  - "file-agnostic"
  - "source-owned"
  - "semantic-keyed"
  - "manifest-governed"
  - "no hardcoded routes, files, fixtures, demo names, or provider keys"
  - "no compatibility aliases for stale skill names"
  - "no downstream local patch stacks"
tags:
  - "vdeoxpln"
  - "agent-ready"
  - "webmcp"
  - "mcp"
  - "source-files"
  - "floating-panel-chat"
  - "canvas"
  - "semantic-key"
  - "prd"
  - "tad"
related:
  - "huijoohwee.github.io/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
  - "docs/documents/agentic-graph-agent-ready-prd-tad-adr-mvp-gtm.md"
  - "docs/documents/agentic-graph-mcp/agentic-graph-mcp-service-prd-tad-adr-mvp-gtm.md"
  - "docs/documents/agentic-graph-query-prd-tad-adr-mvp-gtm.md"
  - "docs/documents/agentic-graph-modularity-prd-tad-adr-mvp-gtm.md"
  - "docs/documents/agentic-graph-strybldr-prd-tad-adr-mvp-gtm.md"
date: "2026-09-12"
owner: "Product maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-VDEOXPLN-PRD-TAD-ADR-MVP-GTM"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.3.0"
prd_revision: "0.3.1"
tad_revision: "0.3.1"
adr_revision: "0.3.1"
mvp_revision: "0.3.1"
gtm_revision: "0.3.1"
---

# Reference implementation: agentic-graph Vdeoxpln PRD-TAD-ADR-MVP-GTM

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-VDEOXPLN-PRD-TAD-ADR-MVP-GTM@0.3.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="document-map"></a>
- [Document Map](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#document-map)
<a id="reference-boundary"></a>
- [Reference Boundary](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#reference-boundary)
<a id="executive-summary"></a>
- [Executive Summary](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#executive-summary)
<a id="directive-commitments"></a>
- [Directive Commitments](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#directive-commitments)
<a id="current-implementation-baseline"></a>
- [Current Implementation Baseline](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#current-implementation-baseline)
<a id="product-requirements"></a>
- [Product Requirements](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#product-requirements)
<a id="problem-statement"></a>
- [Problem Statement](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#problem-statement)
<a id="hypothesis"></a>
- [Hypothesis](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#hypothesis)
<a id="personas"></a>
- [Personas](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#personas)
<a id="user-journey"></a>
- [User Journey](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#user-journey)
<a id="epics-and-acceptance-criteria"></a>
- [Epics And Acceptance Criteria](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#epics-and-acceptance-criteria)
<a id="prd-sp-01---canonical-vdeoxpln-registry"></a>
- [PRD-SP-01 - Canonical Vdeoxpln Registry](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#prd-sp-01---canonical-vdeoxpln-registry)
<a id="prd-sp-02---source-backed-skill-artifacts"></a>
- [PRD-SP-02 - Source-Backed Skill Artifacts](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#prd-sp-02---source-backed-skill-artifacts)
<a id="prd-sp-03---intent-based-skill-routing"></a>
- [PRD-SP-03 - Intent-Based Skill Routing](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#prd-sp-03---intent-based-skill-routing)
<a id="prd-sp-04---deterministic-and-ai-layer-separation"></a>
- [PRD-SP-04 - Deterministic And AI Layer Separation](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#prd-sp-04---deterministic-and-ai-layer-separation)
<a id="prd-sp-05---published-agent-skills-alignment"></a>
- [PRD-SP-05 - Published Agent-Skills Alignment](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#prd-sp-05---published-agent-skills-alignment)
<a id="prd-sp-06---cleanup-and-drift-prevention"></a>
- [PRD-SP-06 - Cleanup And Drift Prevention](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#prd-sp-06---cleanup-and-drift-prevention)
<a id="scope"></a>
- [Scope](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#scope)
<a id="must"></a>
- [Must](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#must)
<a id="should"></a>
- [Should](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#should)
<a id="could"></a>
- [Could](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#could)
<a id="wont"></a>
- [Won't](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#wont)
<a id="roi-and-tco"></a>
- [ROI And TCO](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#roi-and-tco)
<a id="technical-architecture"></a>
- [Technical Architecture](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#technical-architecture)
<a id="architecture-overview"></a>
- [Architecture Overview](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#architecture-overview)
<a id="vdeoxpln-contract"></a>
- [Vdeoxpln Contract](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#vdeoxpln-contract)
<a id="vdeoxpln-families"></a>
- [Vdeoxpln Families](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#vdeoxpln-families)
<a id="shared-identity-and-churn-control"></a>
- [Shared Identity And Churn Control](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#shared-identity-and-churn-control)
<a id="routing-flow"></a>
- [Routing Flow](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#routing-flow)
<a id="data-flow"></a>
- [Data Flow](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#data-flow)
<a id="integration-contracts"></a>
- [Integration Contracts](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#integration-contracts)
<a id="deployment-topology"></a>
- [Deployment Topology](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#deployment-topology)
<a id="adrs"></a>
- [ADRs](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#adrs)
<a id="adr-sp-001---use-a-canonical-registry-instead-of-per-surface-skill-lists"></a>
- [ADR-SP-001 - Use A Canonical Registry Instead Of Per-Surface Skill Lists](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#adr-sp-001---use-a-canonical-registry-instead-of-per-surface-skill-lists)
<a id="adr-sp-002---reuse-floatingpanel-chat-for-ai-mediated-vdeoxpln-steps"></a>
- [ADR-SP-002 - Reuse FloatingPanel Chat For AI-Mediated Vdeoxpln Steps](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#adr-sp-002---reuse-floatingpanel-chat-for-ai-mediated-vdeoxpln-steps)
<a id="adr-sp-003---remove-stale-skill-ids-instead-of-mapping-them"></a>
- [ADR-SP-003 - Remove Stale Skill Ids Instead Of Mapping Them](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#adr-sp-003---remove-stale-skill-ids-instead-of-mapping-them)
<a id="adr-sp-004---treat-papermotion-as-conceptual-inspiration-only"></a>
- [ADR-SP-004 - Treat PaperMotion As Conceptual Inspiration Only](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#adr-sp-004---treat-papermotion-as-conceptual-inspiration-only)
<a id="validation-contract"></a>
- [Validation Contract](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-02.md#validation-contract)
<a id="implementation-plan"></a>
- [Implementation Plan](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-02.md#implementation-plan)
<a id="open-questions"></a>
- [Open Questions](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-02.md#open-questions)
<a id="change-log"></a>
- [Change Log](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-02.md#change-log)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-02.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-02.md#planning-gaps--reference-implementation)

<a id="agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm"></a> [agentic-graph Vdeoxpln PRD-TAD-ADR-MVP-GTM](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm)
