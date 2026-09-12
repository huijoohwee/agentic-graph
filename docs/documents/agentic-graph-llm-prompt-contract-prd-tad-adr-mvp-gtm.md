---
title: agentic-graph LLM Prompt Contract PRD-TAD-ADR-MVP-GTM (Implemented E2E)
id: agentic-graph-llm-prompt-contract-prd-tad
schema: agentic-os-computing-flow/v1
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.5.1"
date: "2026-09-12"
lang: "en-US"
owner: "llm-response-requirements"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
created: 2026-05-21
updated: 2026-07-30
author: "@airvio"
repo_dev: $GITHUB_ROOT/agentic-graph
repo_prod: $GITHUB_ROOT/huijoohwee/content/agentic-graph
deploy_url: airvio.co/agentic-graph
stack_ref: agentic-os-computing-flow/v1
related_docs:
  - docs/documents/agentic-graph-llm-prompt-contract.md
  - canvas/src/features/chat/chatResponseBaseContract.ts
  - canvas/src/__tests__/chatResponseContractPrompt.test.ts
  - canvas/src/features/parsers/markdownFrontmatterFlowGraph.core.ts
  - canvas/src/features/parsers/agenticOsSemanticGraph.ts
  - canvas/src/lib/graph/agenticOsSemanticQuery.ts
  - canvas/src/features/workspace-fs/applyWorkspaceImportToCanvas.ts
  - canvas/src/features/chat/chatResponseStructuredContent.ts
epics:
  - PRD-E1: MainPanel And FloatingPanel Chat Integration
  - PRD-E2: AGENTIC_OS Prompt Contract Hardening
  - PRD-E3: Workspace-First AGENTIC_OS Persistence And Apply
  - PRD-E4: Frontmatter Flow Graph And Group Pipeline
  - PRD-E5: Shared Semantic Key And Stale-Path Elimination
  - PRD-E6: Typed AGENTIC_OS Semantic Graph Extraction
constraints:
  lean_mvp: true
  single_source_of_truth: true
  no_parallel_orchestrator: true
  no_downstream_graph_patch_layer: true
  no_legacy_alias_backcompat: true
  no_stale_duplicate_contracts: true
changelog:
  - version: 0.1.0
    date: 2026-05-21
    summary: Initial proposed PRD-TAD with speculative pipeline components.
  - version: 0.2.0
    date: 2026-05-22
    summary: Expanded proposed scope, but still mixed actual runtime owners with non-existent components.
  - version: 0.3.0
    date: 2026-05-22
    summary: Rewritten to be implementation-aligned. Removes speculative chat orchestrator, bridge, and parser owners. Anchors the E2E contract to the current MainPanel settings, FloatingPanel chat, workspace AGENTIC_OS persistence, frontmatter-flow parser, workspace import/apply, and group derivation pipeline. Enhances the LLM prompt contract with explicit anti-stale and anti-duplicate rules for nodes, edges, subgraphs, clusters, and canvas application.
  - version: 0.3.1
    date: 2026-05-22
    summary: Realigns the submit-flow documentation with the current thin-hook plus helper architecture. Documents preflight, coordinator, request-build, transport, streaming, and AGENTIC_OS retry/validation ownership explicitly so the PRD-TAD matches the in-repo runtime.
  - version: 0.3.2
    date: 2026-05-27
    summary: Promotes the original file to the sub-600 canonical index, moves TAD and validation detail into a companion, and aligns streaming docs with raw SSE chunk capture, workspace stream artifacts, and share/report URL dereference on the shared pipeline.
  - version: 0.3.3
    date: 2026-05-29
    summary: Promotes the implementation-aligned contract from proposed naming to canonical accepted/implemented naming and preserves the companion split.
  - version: 0.3.4
    date: 2026-05-29
    summary: Documents the typed AGENTIC_OS semantic graph parser and query helpers as implemented parser owners for inline `@node:type:id` and `@edge:predicate:source->target` sigils, with no legacy untyped remap.
  - version: 0.3.5
    date: 2026-06-04
    summary: Adds the shared generated-output and audio media rendering contract so headless chat and Storyboard Widget responses land in editable Card/Storyboard rows and render audio through existing card, panel, overlay, inventory, importer, and HTML export owners.
  - version: 0.3.6
    date: 2026-06-04
    summary: Adds MCP-shaped chat structured-content projection so standard, recovered, or already-accepted FloatingPanel Chat AGENTIC_OS responses can materialize widgets, panels, cards, media, and authored edges as canonical Rich Media Panel nodes and frontmatter-flow edges.
  - version: 0.3.7
    date: 2026-06-04
    summary: Keeps accepted-AGENTIC_OS widget-bundle overlay metadata aligned by appending projected MCP-shaped response node ids to existing `widget_bundle.graph.nodes_ref` before parser and Storyboard Widget rendering.
  - version: 0.3.8
    date: 2026-06-04
    summary: Normalizes agentic-graph-native typed `{key,type,value}` envelopes and `properties[]` KTV rows inside MCP-shaped chat structured-content records before projecting Rich Media Panel nodes and edges.
  - version: 0.3.9
    date: 2026-06-04
    summary: Preserves declared Storyboard Widget forms from MCP-shaped chat structured-content `widgets[]` records as real widget nodes with widget ports, while undeclared panels/cards/media/nodes remain Rich Media Panel endpoints.
  - version: 0.3.10
    date: 2026-06-04
    summary: Adds document-scoped `flow:widgetRegistry` projection and parser merge support so declared chat widget records resolve through Storyboard Widget registry owners without relying on user-local registry state.
  - version: 0.3.11
    date: 2026-06-04
    summary: Makes MCP-shaped chat structured content explicitly compute-aware by preserving safe `flow:compute` widget data, dataflow handle edges, shared connected-value recomputation, and Storyboard Widget run-all eligibility through the workspace apply path.
  - version: 0.3.12
    date: 2026-06-04
    summary: Documents shared inline-edit writeback for projected MCP response output fields, including flattened field and native `properties` mirror alignment through the card patch/updateNode owner.
  - version: 0.3.13
    date: 2026-06-04
    summary: Documents provider-free Storyboard Widget workflow execution for authored `flow:compute` nodes so MCP-projected compute widgets write output through shared workflow writeback before TextGeneration provider dispatch.
  - version: 0.3.14
    date: 2026-06-04
    summary: Documents submit-path acceptance for literal MCP structured results that already contain a renderable structured surface, finalizing without AGENTIC_OS retry or synthetic AGENTIC_OS text.
  - version: 0.3.15
    date: 2026-07-08
    summary: Documents slash-invoked chatResponseBaseContract variants for Storybuilding and registry-backed Investment Research, SME Care, and Video agents, with no leading slash falling back to the plain vanilla base contract.
  - version: 0.3.16
    date: 2026-07-08
    summary: Keeps no-slash provider trace fallbacks clean-slate by treating active-stream/no-content traces as no-answer evidence and neutralizing markdown image runtime URLs before request-profile fallback generation.
  - version: 0.3.17
    date: 2026-07-08
    summary: Routes no-slash trace-only/no-content fallbacks through the plain base AGENTIC_OS contract instead of the computing-flow template scaffold, keeping attached-image prompts query-responsive without product/title backfill.
  - version: 0.4.0
    date: 2026-07-29
    summary: Rejects provider-incomplete or length-limited assistant fragments as successful terminal responses and defines response and optional provider-exposed thinking as distinct, neutral Rich Media publications under one headless run identity.
  - version: 0.4.1
    date: 2026-07-30
    summary: Restores upstream Editor Workspace Viewer selection for newly owned Markdown Rich Media output while preserving explicit authored targets and the compact-surface opt-out.
  - version: 0.5.0
    date: 2026-07-30
    summary: Defines one generic shared Rich Media coordinator for canvas-bound generated collections, preserves source-or-selected-parent semantic lineage, adds a render-only viewport-aware fan-out, and restores the canonical load budget by relocating TAD sequence detail to the companion.
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-LLM-PROMPT-CONTRACT-PRD-TAD-ADR-MVP-GTM"
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.5.0"
prd_revision: "0.5.1"
tad_revision: "0.5.1"
adr_revision: "0.5.1"
mvp_revision: "0.5.1"
gtm_revision: "0.5.1"
---

# Reference implementation: agentic-graph LLM Prompt Contract PRD-TAD-ADR-MVP-GTM (Implemented E2E)

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-LLM-PROMPT-CONTRACT-PRD-TAD-ADR-MVP-GTM@0.5.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="1-executive-summary"></a>
- [1. Executive Summary](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#1-executive-summary)
<a id="2-architecture-truths"></a>
- [2. Architecture Truths](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#2-architecture-truths)
<a id="21-canonical-e2e-owners"></a>
- [2.1 Canonical E2E Owners](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#21-canonical-e2e-owners)
<a id="22-runtime-detail-continuation"></a>
- [2.2 Runtime Detail Continuation](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#22-runtime-detail-continuation)
<a id="3-stale-and-conflicting-architecture-is-forbidden"></a>
- [3. Stale And Conflicting Architecture Is Forbidden](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#3-stale-and-conflicting-architecture-is-forbidden)
<a id="31-hard-prohibitions"></a>
- [3.1 Hard Prohibitions](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#31-hard-prohibitions)
<a id="32-upstream-ssot-rules"></a>
- [3.2 Upstream SSOT Rules](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#32-upstream-ssot-rules)
<a id="33-root-fix-requirement"></a>
- [3.3 Root Fix Requirement](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#33-root-fix-requirement)
<a id="4-prd"></a>
- [4. PRD](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#4-prd)
<a id="41-problem-statement"></a>
- [4.1 Problem Statement](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#41-problem-statement)
<a id="42-product-goal"></a>
- [4.2 Product Goal](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#42-product-goal)
<a id="43-personas"></a>
- [4.3 Personas](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#43-personas)
<a id="44-in-scope"></a>
- [4.4 In Scope](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#44-in-scope)
<a id="45-out-of-scope"></a>
- [4.5 Out Of Scope](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#45-out-of-scope)
<a id="5-prd-epics-and-acceptance-criteria"></a>
- [5. PRD Epics And Acceptance Criteria](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#5-prd-epics-and-acceptance-criteria)
<a id="prd-e1---mainpanel-and-floatingpanel-chat-integration"></a>
- [PRD-E1 - MainPanel And FloatingPanel Chat Integration](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#prd-e1---mainpanel-and-floatingpanel-chat-integration)
<a id="user-story"></a>
- [User story](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#user-story)
<a id="acceptance-criteria"></a>
- [Acceptance criteria](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria)
<a id="success-metric"></a>
- [Success metric](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#success-metric)
<a id="prd-e2---agentic_os-prompt-contract-hardening"></a>
- [PRD-E2 - AGENTIC_OS Prompt Contract Hardening](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#prd-e2---agentic_os-prompt-contract-hardening)
<a id="user-story-1"></a>
- [User story](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#user-story-1)
<a id="acceptance-criteria-1"></a>
- [Acceptance criteria](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria-1)
<a id="success-metric-1"></a>
- [Success metric](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#success-metric-1)
<a id="prd-e3---workspace-first-agentic_os-persistence-and-apply"></a>
- [PRD-E3 - Workspace-First AGENTIC_OS Persistence And Apply](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#prd-e3---workspace-first-agentic_os-persistence-and-apply)
<a id="user-story-2"></a>
- [User story](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#user-story-2)
<a id="acceptance-criteria-2"></a>
- [Acceptance criteria](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria-2)
<a id="success-metric-2"></a>
- [Success metric](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#success-metric-2)
<a id="prd-e4---frontmatter-flow-graph-and-group-pipeline"></a>
- [PRD-E4 - Frontmatter Flow Graph And Group Pipeline](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#prd-e4---frontmatter-flow-graph-and-group-pipeline)
<a id="user-story-3"></a>
- [User story](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#user-story-3)
<a id="acceptance-criteria-3"></a>
- [Acceptance criteria](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria-3)
<a id="success-metric-3"></a>
- [Success metric](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#success-metric-3)
<a id="prd-e5---shared-semantic-key-and-stale-path-elimination"></a>
- [PRD-E5 - Shared Semantic Key And Stale-Path Elimination](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#prd-e5---shared-semantic-key-and-stale-path-elimination)
<a id="user-story-4"></a>
- [User story](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#user-story-4)
<a id="acceptance-criteria-4"></a>
- [Acceptance criteria](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria-4)
<a id="success-metric-4"></a>
- [Success metric](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#success-metric-4)
<a id="6-enhanced-llm-prompt-contract"></a>
- [6. Enhanced LLM Prompt Contract](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#6-enhanced-llm-prompt-contract)
<a id="61-contract-owner"></a>
- [6.1 Contract Owner](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#61-contract-owner)
<a id="62-contract-goals"></a>
- [6.2 Contract Goals](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#62-contract-goals)
<a id="63-required-output-properties"></a>
- [6.3 Required Output Properties](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#63-required-output-properties)
<a id="64-enhanced-anti-stale-rules"></a>
- [6.4 Enhanced Anti-Stale Rules](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#64-enhanced-anti-stale-rules)
<a id="65-frontmatter-and-grouping-guidance"></a>
- [6.5 Frontmatter And Grouping Guidance](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#65-frontmatter-and-grouping-guidance)
<a id="66-request-shaped-section-behavior"></a>
- [6.6 Request-Shaped Section Behavior](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#66-request-shaped-section-behavior)
<a id="67-validation-contract"></a>
- [6.7 Validation Contract](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#67-validation-contract)
<a id="continuation"></a>
- [Continuation](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-02.md#continuation)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-02.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-02.md#planning-gaps--reference-implementation)

<a id="agentic-graph---llm-prompt-contract-prd-tad-adr-mvp-gtm-implemented-e2e"></a> [agentic-graph - LLM Prompt Contract PRD-TAD-ADR-MVP-GTM (Implemented E2E)](agentic-graph-llm-prompt-contract-prd-tad-adr-mvp-gtm.part-01.md#agentic-graph---llm-prompt-contract-prd-tad-adr-mvp-gtm-implemented-e2e)
