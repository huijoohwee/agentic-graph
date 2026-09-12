---
title: "agentic-graph Queryable Corpus Graph - PRD and TAD"
doc_type: "PRD-TAD-ADR-MVP-GTM"
id: "agentic-graph-query-prd-tad"
version: "0.3.1"
status: "implemented-finetune-contract"
created: "2026-05-29"
updated: "2026-07-22"
author: "airvio / joohwee"
domain: "agentic-graph"
lang: "en-US"
frontmatter_contract: "required"
deployment_topology: "Dev -> Prod -> Cloudflare"
dev_root: "$GITHUB_ROOT/agentic-graph"
prod_mirror: "$GITHUB_ROOT/huijoohwee/content/agentic-graph"
cloudflare_route: "https://airvio.co/agentic-graph"
implementation_policy: "Independent native implementation with no copied parser generator or separate graph runtime."
constraints:
  - "universal"
  - "neutral"
  - "project-agnostic"
  - "file-agnostic"
  - "native in-repo"
  - "foss-first"
  - "tco-zero"
  - "token-economical"
  - "harness-first"
tags:
  - "queryable-graph"
  - "source-files"
  - "import-folder"
  - "import-file"
  - "floating-panel-chat"
  - "editor-workspace"
  - "canvas"
  - "rendering-pipeline"
  - "corpus-index"
  - "graphrag"
  - "prd"
  - "tad"
related:
  - "huijoohwee.github.io/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
  - "docs/documents/agentic-graph-source-files-import-document.md"
  - "docs/documents/agentic-graph-chat-ai-markdown-pipeline-document.md"
  - "docs/documents/agentic-graph-agent-ready-prd-tad-adr-mvp-gtm.md"
  - "docs/documents/agentic-graph-deterministic-agent-graph-runtime.md"
date: "2026-09-12"
owner: "Product maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-QUERY-PRD-TAD-ADR-MVP-GTM"
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

# Reference implementation: agentic-graph Queryable Corpus Graph - PRD and TAD

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-QUERY-PRD-TAD-ADR-MVP-GTM@0.3.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="executive-summary"></a>
- [Executive Summary](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#executive-summary)
<a id="directive-commitments"></a>
- [Directive Commitments](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#directive-commitments)
<a id="independent-implementation-boundary"></a>
- [Independent Implementation Boundary](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#independent-implementation-boundary)
<a id="current-implementation-baseline"></a>
- [Current Implementation Baseline](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#current-implementation-baseline)
<a id="product-requirements"></a>
- [Product Requirements](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#product-requirements)
<a id="problem-statement"></a>
- [Problem Statement](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#problem-statement)
<a id="personas"></a>
- [Personas](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#personas)
<a id="user-journey"></a>
- [User Journey](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#user-journey)
<a id="epics-and-user-stories"></a>
- [Epics and User Stories](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#epics-and-user-stories)
<a id="prd-e01-universal-corpus-import"></a>
- [PRD-E01: Universal Corpus Import](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#prd-e01-universal-corpus-import)
<a id="prd-e02-file-agnostic-extraction"></a>
- [PRD-E02: File-Agnostic Extraction](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#prd-e02-file-agnostic-extraction)
<a id="prd-e03-queryable-graph-chat"></a>
- [PRD-E03: Queryable Graph Chat](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#prd-e03-queryable-graph-chat)
<a id="prd-e04-cache-update-and-provenance"></a>
- [PRD-E04: Cache, Update, and Provenance](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#prd-e04-cache-update-and-provenance)
<a id="prd-e05-e2e-rendering-and-query-readiness"></a>
- [PRD-E05: E2E Rendering and Query Readiness](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#prd-e05-e2e-rendering-and-query-readiness)
<a id="success-metrics"></a>
- [Success Metrics](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#success-metrics)
<a id="moscow-priority"></a>
- [MoSCoW Priority](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority)
<a id="min-viable-scope"></a>
- [Min-Viable Scope](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope)
<a id="technical-architecture"></a>
- [Technical Architecture](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#technical-architecture)
<a id="overview"></a>
- [Overview](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#overview)
<a id="source-unit-contract"></a>
- [Source Unit Contract](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#source-unit-contract)
<a id="graph-fragment-contract"></a>
- [Graph Fragment Contract](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#graph-fragment-contract)
<a id="query-evidence-pack-contract"></a>
- [Query Evidence Pack Contract](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#query-evidence-pack-contract)
<a id="component-specifications"></a>
- [Component Specifications](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#component-specifications)
<a id="current-implementation-evidence"></a>
- [Current Implementation Evidence](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#current-implementation-evidence)
<a id="ai-harness-contract"></a>
- [AI Harness Contract](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#ai-harness-contract)
<a id="import-adapter-matrix"></a>
- [Import Adapter Matrix](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#import-adapter-matrix)
<a id="query-modes"></a>
- [Query Modes](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#query-modes)
<a id="integration-contracts"></a>
- [Integration Contracts](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#integration-contracts)
<a id="architectural-decisions"></a>
- [Architectural Decisions](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions)
<a id="adr-001-enhance-existing-e2e-import-rendering-and-chat-owners"></a>
- [ADR-001: Enhance Existing E2E Import, Rendering, and Chat Owners](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#adr-001-enhance-existing-e2e-import-rendering-and-chat-owners)
<a id="context"></a>
- [Context](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#context)
<a id="decision"></a>
- [Decision](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#decision)
<a id="alternatives-considered"></a>
- [Alternatives Considered](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#alternatives-considered)
<a id="adr-002-graph-traversal-before-llm-answering"></a>
- [ADR-002: Graph Traversal Before LLM Answering](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#adr-002-graph-traversal-before-llm-answering)
<a id="context-1"></a>
- [Context](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#context-1)
<a id="decision-1"></a>
- [Decision](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#decision-1)
<a id="alternatives-considered-1"></a>
- [Alternatives Considered](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#alternatives-considered-1)
<a id="adr-003-evidence-kind-is-required-on-edges"></a>
- [ADR-003: Evidence Kind Is Required on Edges](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#adr-003-evidence-kind-is-required-on-edges)
<a id="context-2"></a>
- [Context](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#context-2)
<a id="decision-2"></a>
- [Decision](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#decision-2)
<a id="alternatives-considered-2"></a>
- [Alternatives Considered](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered-2)
<a id="deployment-strategy"></a>
- [Deployment Strategy](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#deployment-strategy)
<a id="validation-plan"></a>
- [Validation Plan](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#validation-plan)
<a id="traceability-matrix"></a>
- [Traceability Matrix](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#traceability-matrix)
<a id="implementation-phases"></a>
- [Implementation Phases](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#implementation-phases)
<a id="acceptance-gate"></a>
- [Acceptance Gate](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#acceptance-gate)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#planning-gaps--reference-implementation)

<a id="agentic-graph-queryable-corpus-graph---prd-and-tad"></a> [agentic-graph Queryable Corpus Graph - PRD and TAD](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#agentic-graph-queryable-corpus-graph---prd-and-tad)
