---
title: AgenticGraph LLM Prompt Contract PRD-TAD (Implemented E2E)
id: agenticgraph-llm-prompt-contract-prd-tad
schema: kgc-computing-flow/v1
doc_type: prd-tad
version: 0.5.0
date: 2026-07-30
lang: en-US
owner: llm-response-requirements
local_rung: dev-proven
delivered_rung: undocumented
lane: authoring
universal_scope: true
created: 2026-05-21
updated: 2026-07-30
author: "@airvio"
repo_dev: $GITHUB_ROOT/agenticgraph
repo_prod: $GITHUB_ROOT/huijoohwee/content/agenticgraph
deploy_url: airvio.co/agenticgraph
stack_ref: kgc-computing-flow/v1
related_docs:
  - docs/documents/agenticgraph-llm-prompt-contract.md
  - canvas/src/features/chat/chatResponseBaseContract.ts
  - canvas/src/__tests__/chatResponseContractPrompt.test.ts
  - canvas/src/features/parsers/markdownFrontmatterFlowGraph.core.ts
  - canvas/src/features/parsers/kgcSemanticGraph.ts
  - canvas/src/lib/graph/kgcSemanticQuery.ts
  - canvas/src/features/workspace-fs/applyWorkspaceImportToCanvas.ts
  - canvas/src/features/chat/chatResponseStructuredContent.ts
epics:
  - PRD-E1: MainPanel And FloatingPanel Chat Integration
  - PRD-E2: KGC Prompt Contract Hardening
  - PRD-E3: Workspace-First KGC Persistence And Apply
  - PRD-E4: Frontmatter Flow Graph And Group Pipeline
  - PRD-E5: Shared Semantic Key And Stale-Path Elimination
  - PRD-E6: Typed KGC Semantic Graph Extraction
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
    summary: Rewritten to be implementation-aligned. Removes speculative chat orchestrator, bridge, and parser owners. Anchors the E2E contract to the current MainPanel settings, FloatingPanel chat, workspace KGC persistence, frontmatter-flow parser, workspace import/apply, and group derivation pipeline. Enhances the LLM prompt contract with explicit anti-stale and anti-duplicate rules for nodes, edges, subgraphs, clusters, and canvas application.
  - version: 0.3.1
    date: 2026-05-22
    summary: Realigns the submit-flow documentation with the current thin-hook plus helper architecture. Documents preflight, coordinator, request-build, transport, streaming, and KGC retry/validation ownership explicitly so the PRD-TAD matches the in-repo runtime.
  - version: 0.3.2
    date: 2026-05-27
    summary: Promotes the original file to the sub-600 canonical index, moves TAD and validation detail into a companion, and aligns streaming docs with raw SSE chunk capture, workspace stream artifacts, and share/report URL dereference on the shared pipeline.
  - version: 0.3.3
    date: 2026-05-29
    summary: Promotes the implementation-aligned contract from proposed naming to canonical accepted/implemented naming and preserves the companion split.
  - version: 0.3.4
    date: 2026-05-29
    summary: Documents the typed KGC semantic graph parser and query helpers as implemented parser owners for inline `@node:type:id` and `@edge:predicate:source->target` sigils, with no legacy untyped remap.
  - version: 0.3.5
    date: 2026-06-04
    summary: Adds the shared generated-output and audio media rendering contract so headless chat and Storyboard Widget responses land in editable Card/Storyboard rows and render audio through existing card, panel, overlay, inventory, importer, and HTML export owners.
  - version: 0.3.6
    date: 2026-06-04
    summary: Adds MCP-shaped chat structured-content projection so standard, recovered, or already-accepted FloatingPanel Chat KGC responses can materialize widgets, panels, cards, media, and authored edges as canonical Rich Media Panel nodes and frontmatter-flow edges.
  - version: 0.3.7
    date: 2026-06-04
    summary: Keeps accepted-KGC widget-bundle overlay metadata aligned by appending projected MCP-shaped response node ids to existing `widget_bundle.graph.nodes_ref` before parser and Storyboard Widget rendering.
  - version: 0.3.8
    date: 2026-06-04
    summary: Normalizes AgenticGraph-native typed `{key,type,value}` envelopes and `properties[]` KTV rows inside MCP-shaped chat structured-content records before projecting Rich Media Panel nodes and edges.
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
    summary: Documents submit-path acceptance for literal MCP structured results that already contain a renderable structured surface, finalizing without KGC retry or synthetic KGC text.
  - version: 0.3.15
    date: 2026-07-08
    summary: Documents slash-invoked chatResponseBaseContract variants for Storybuilding and registry-backed Investment Research, SME Care, and Video agents, with no leading slash falling back to the plain vanilla base contract.
  - version: 0.3.16
    date: 2026-07-08
    summary: Keeps no-slash provider trace fallbacks clean-slate by treating active-stream/no-content traces as no-answer evidence and neutralizing markdown image runtime URLs before request-profile fallback generation.
  - version: 0.3.17
    date: 2026-07-08
    summary: Routes no-slash trace-only/no-content fallbacks through the plain base KGC contract instead of the computing-flow template scaffold, keeping attached-image prompts query-responsive without product/title backfill.
  - version: 0.4.0
    date: 2026-07-29
    summary: Rejects provider-incomplete or length-limited assistant fragments as successful terminal responses and defines response and optional provider-exposed thinking as distinct, neutral Rich Media publications under one headless run identity.
  - version: 0.4.1
    date: 2026-07-30
    summary: Restores upstream Editor Workspace Viewer selection for newly owned Markdown Rich Media output while preserving explicit authored targets and the compact-surface opt-out.
  - version: 0.5.0
    date: 2026-07-30
    summary: Defines one generic shared Rich Media coordinator for canvas-bound generated collections, preserves source-or-selected-parent semantic lineage, adds a render-only viewport-aware fan-out, and restores the canonical load budget by relocating TAD sequence detail to the companion.
---

# AgenticGraph - LLM Prompt Contract PRD-TAD (Implemented E2E)

> Scope: MainPanel integrations -> FloatingPanel chat UI -> raw SSE JSON chunks -> workspace stream artifacts -> Markdown YAML frontmatter output -> canvas nodes / subgraphs / groups / clusters / edges.
>
> This revision is implementation-accurate first, enhancement-oriented second. It forbids speculative or conflicting architecture that does not exist in-repo.

---

## 1. Executive Summary

The current repo already has a working upstream path for chat-generated structured Markdown to become live canvas state. That path is not a future standalone orchestrator, a separate JSONB-to-Markdown bridge, or a direct downstream `graphDataSlice` patch. The canonical path today is:

1. MainPanel `SettingsView` and `useSettingsChatAssist` shape chat provider, model, auth, endpoint, and context-scope configuration.
2. FloatingPanel mounts `FloatingPanelChat` when `floatingPanelView === 'chat'`.
3. `useFloatingPanelChatSubmit` is a thin submit shell: it resolves the request URL, initializes optimistic UI state, and delegates the async runtime to `executeFloatingPanelChatSubmitCoordinator()`.
4. `floatingPanelChatSubmitCoordinator.ts` owns the async submit lifecycle by composing dedicated helpers for draft bootstrap, request assembly, provider transport fallback, streaming draft writes, and KGC retry/validation.
5. The streaming helpers capture raw SSE JSON chunks, keep the editor on the live `kgc-trace_<session>.md` draft, fold the raw stream log into that trace document, and keep report/dereferenced share artifacts as additive workspace companions in the same session folder.
6. `useFinalizeAssistantSuccess` writes the canonical `kgc_<session>.md` workspace document from that folder and calls `applyChatKgcWorkspaceDocumentToCanvas()`.
7. `applyChatKgcWorkspaceDocumentToCanvas()` materializes the saved Markdown through `applyWorkspaceImportToCanvas()` for Source Files, then loads it into `setActiveMarkdownDocument({ applyViewPreset: true, applyToGraph: true, forceApplyToGraph: true })`.
8. The Markdown parser prefers `tryParseMarkdownFrontmatterFlowGraph()` before generic Markdown or JSON-LD parsing.
9. Typed KGC semantic sigils are parsed by `parseKgcSemanticGraphFromMarkdown()` and merged through the shared Markdown parser without replacing frontmatter-flow ownership.
10. Frontmatter-flow metadata becomes `GraphData` with `context: 'frontmatter-flow'`.
11. `flow.subgraphs` are normalized into `kg:subgraphs`, then `readSubgraphs()` and `deriveGraphGroups()` project them into rendered groups and cluster underlays.

This document enhances that existing path. It does not invent a second one.

When a standard, recovered, literal MCP, or already-accepted KGC chat answer includes structured content as `response.structuredContent`, `result.structuredContent`, or a structured block inside `result.content[]` text parts, the same path converts declared `widgets[]` form records into real Storyboard widget nodes with document-scoped `flow:widgetRegistry` entries, and converts undeclared widgets, panels, cards, media, nodes, and authored edges into canonical frontmatter-flow Rich Media Panel endpoints and edges before workspace apply. Literal MCP results that already extract to a renderable structured surface are accepted by the submit validation owner and finalize without retrying for a KGC block or synthesizing KGC text. Plain scalar records, exact typed `{key,type,value}` envelopes, and `properties[]` KTV rows normalize to the same record shape. Declared widget records may also carry safe `flow:compute` data that reads incoming handle keys from `inputs` and emits output-port values through `computeFlowConnectedValuesBySchemaPath()`, so inline compute and live dataflow stay on the shared widget runtime; Storyboard Widget workflow execution resolves those computed output schema paths and writes them through the shared workflow writeback helper before any provider TextGeneration branch. Typed Mermaid and Geospatial requests preserve Mermaid diagram source, typed `flow_diagrams` entries (`mermaid_flowchart`, `mermaid_gitgraph`, `mermaid_architecture`, `mermaid_eventmodeling`, `mermaid_gantt`), or GeoJSON/FeatureCollection payloads under neutral `geoJson`/`geojson`/coordinate fields as frontmatter or structured-content data inputs. Routed Mermaid diagram records render through FloatingPanel row-list and BottomPanel chart surfaces; ordinary generated outputs and geospatial panels may still render through source/card/widget -> safe compute -> Rich Media Panel `outputSrcDoc`. They must not reuse the document version-control GitGraph state, renderer-local Timeline state, Geospatial Mode toggles, or static panel backfill as authority. D3 Graph, Flow Canvas, Dashboard, 3D Mode, and XR Mode requests preserve renderer/surface/model intent as neutral `kgCanvas2dRenderer`, `kgCanvasSurfaceMode`, `kgCanvasRenderMode`, `kgCanvas3dMode`, and `kgAsset*` frontmatter fields while the applied `GraphData`, inline compute, Storyboard cards, and Rich Media Panels remain shared dataflow output. Projected output fields stay inline-editable through the shared card patch/updateNode path, which keeps flattened fields and any native `properties` mirror aligned before frontmatter writeback. If an accepted KGC already uses `widget_bundle.graph.nodes_ref`, projection extends that upstream overlay list so Storyboard opens the generated response widgets without a renderer-local exception.

Rich Media Panel text is a stricter Markdown lane: `kind: text` writes `output` as a byte-zero YAML-frontmatter document using `schema: agenticgraph-rich-media-text/v1`, `media_kind: text`, and `content_type: text/markdown`. Text MUST NOT be materialized as `html`, `srcDoc`, or `outputSrcDoc`; those fields remain reserved for genuinely interactive non-text media. The panel therefore projects through the shared Editor Workspace Viewer/Markdown read-edit core instead of an iframe.

Imperative generation is terminal intent. When the selected user input begins with a generation verb such as `generate`, `create`, `draft`, or `produce`, the runtime generates that deliverable and MUST NOT substitute generic clarification wrappers, use-case-specific hardcoded content, or another Probe-Tree round.

Canvas-bound collection generation uses one shared headless materialization topology. The source or selected semantic parent remains the execution and lineage owner of generated Widget Cards, while the existing source-owned Rich Media Panel coordinates their presentation. The overlay may therefore show `source -> coordinator -> generated cards` without adding coordinator-to-card execution edges or changing downstream Run targets. On a wide viewport the coordinator occupies its own lane before one ordered top-down fan-out lane; on a constrained natural-size 100% viewport the source remains stable and only the downstream coordinator plus fan-out collapse into one rightward top-down column.

---

## 2. Architecture Truths

### 2.1 Canonical E2E Owners

| Stage | Canonical owner | Current file(s) | Implementation truth |
|---|---|---|---|
| MainPanel chat configuration | MainPanel Settings + settings assist | `canvas/src/features/panels/MainPanel.tsx`, `canvas/src/features/panels/views/SettingsView.tsx`, `canvas/src/features/panels/views/useSettingsChatAssist.tsx` | MainPanel owns chat settings and model discovery, not chat rendering. |
| Floating chat mount | FloatingPanel toolbar view switch | `canvas/src/lib/toolbar/ToolbarToolMenu.impl.tsx`, `canvas/src/components/ui/FloatingPanel.tsx` | FloatingPanel mounts `FloatingPanelChatLazy` when the chat panel is selected. |
| Chat UI | Floating panel chat feature | `canvas/src/features/chat/FloatingPanelChat.tsx` | FloatingPanelChat is the active runtime owner for LLM chat UI state and graph/workspace context reads. |
| System prompt contract | Base chat response contracts | `canvas/src/features/chat/chatBaseKgcResponseContractPrompt.ts`, `canvas/src/features/chat/chatBaseResponseContractPrompt.ts`, re-exported by `canvas/src/features/chat/chatResponseBaseContract.ts` | `CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT` is the current chatAgenticGraph KGC contract owner; the generic chat prompt stays in its sibling prompt module. |
| Slash response variants | Canonical agent-definition registry plus submit request builder | `data/config/agents/agent-definitions.json`, `contracts/agent-runtime.schema.js`, `canvas/src/features/chat/chatSkillRegistry.ts`, `canvas/src/features/chat/floatingPanelChat/floatingPanelChatSubmitRequest.ts` | A leading `/storybuilding`, `/investment-research-agent`, `/sme-care-agent`, or `/video-agent` invokes a narrow chatResponseBaseContract variant over the active base contract; no leading slash uses the plain vanilla base contract, unknown `/*-agent` variants fail typed, and trace-only/no-content fallbacks must not escalate into the computing-flow template scaffold unless computing-flow intent is explicit. |
| Chat structured-content projection | MCP-shaped chat response materializer | `canvas/src/features/chat/chatResponseStructuredContent.ts`, `canvas/src/features/chat/chatResponseStructuredContentProjector.ts`, `canvas/src/features/chat/chatHistoryWorkspace.kgc.baseFallback.ts`, `canvas/src/features/chat/chatHistoryWorkspace.kgc.build.ts`, `canvas/src/features/parsers/markdownFrontmatterFlowGraph.flowEnvelope.ts`, `canvas/src/features/parsers/markdownFrontmatterFlowGraph.core.ts`, `canvas/src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunInputs.ts` | Extracts `response.structuredContent`, literal MCP `result.structuredContent`, and structured `result.content[]` text blocks from standard, recovered, literal MCP, or accepted KGC assistant YAML/JSON/frontmatter, normalizes plain fields plus typed KTV envelopes, projects declared widget forms as real Storyboard Widget nodes with document-scoped widget registry entries, preserves safe `flow:compute` widget data for the shared connected-value runtime and provider-free workflow-run output writeback, and projects neutral render records into Rich Media Panel endpoints, canonical `flow.edges`, and existing `widget_bundle.graph.nodes_ref` before parser/canvas apply. |
| Submit hook shell | Submit hook shell | `canvas/src/features/chat/floatingPanelChat/useFloatingPanelChatSubmit.ts` | Thin hook shell that resolves endpoint guards, initializes optimistic state, and delegates the async submit lifecycle. |
| Submit preflight | Preflight helpers | `canvas/src/features/chat/floatingPanelChat/floatingPanelChatSubmitPreflight.ts` | Owns endpoint/model guards, optimistic message setup, cache updates, and trace-draft bootstrap. |
| Submit coordinator | Submit coordinator | `canvas/src/features/chat/floatingPanelChat/floatingPanelChatSubmitCoordinator.ts` | Owns the async submit lifecycle and composes request-build, transport, streaming, KGC retry/validation, and terminal state helpers. |
| Request build and transport | Submit request and transport helpers | `canvas/src/features/chat/floatingPanelChat/floatingPanelChatSubmitRequest.ts`, `canvas/src/features/chat/floatingPanelChat/floatingPanelChatSubmitTransport.ts` | Builds packed context and payload messages, resolves token-limit strategy, retries transport safely, and falls back models upstream. |
| Streaming and KGC retry | Streaming, recovery, validation, and stream artifacts | `canvas/src/features/chat/floatingPanelChat/floatingPanelChatStreaming.ts`, `canvas/src/features/chat/floatingPanelChat/floatingPanelChatKgcAttempt.ts`, `canvas/src/features/chat/chatMarkdownValidation.ts`, `canvas/src/features/chat/chatHistoryWorkspace.kgc.recovery.ts`, `canvas/src/features/chat/chatStreamArtifacts.ts` | Parses raw SSE chunks into live drafts, canonical KGC candidates, literal MCP structured-surface acceptances, session stream artifacts, and correction-prompt retries without downstream reinterpretation. |
| Final persistence and apply | Finalize success runtime | `canvas/src/features/chat/floatingPanelChat/useFinalizeAssistantSuccess.ts` | Writes the canonical KGC workspace file, follows it in Editor Workspace, and applies it through the workspace-document path. |
| Workspace KGC apply | Chat KGC canvas bridge + workspace import owner | `canvas/src/features/chat/chatKgcCanvasApply.ts`, `canvas/src/features/workspace-fs/applyWorkspaceImportToCanvas.ts` | Materializes the saved Markdown into Source Files, then reuses `setActiveMarkdownDocument`, not local graph patching. |
| Storyboard Widget run output | Shared widget run artifact owner | `canvas/src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetWorkflowActions.ts`, `canvas/src/features/chat/richMediaRun.ts`, `canvas/src/features/chat/chatHistoryWorkspace.output.ts`, `canvas/src/features/workspace-fs/applyWorkspaceImportToCanvas.ts` | Persists final text/transcript output as sibling workspace Markdown, persists image/video binaries with editable Markdown manifests, routes audio media URLs through shared card/panel/output owners, passively registers text and media manifests in Source Files, and carries workspace paths through widgets and Rich Media Panels. |
| Shared collection materialization | Run execution anchor, Rich Media publication, and overlay projection | `canvas/src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRunExecutionAnchor.ts`, `canvas/src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPublication.ts`, `canvas/src/lib/storyboardWidget/runMaterializationProjection.ts`, `canvas/src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph.ts` | Captures the source and visible viewport at Run, plans a generic source/coordinator/top-down fan-out, keeps semantic edges unchanged for lineage and execution, and projects generated card edges from the coordinator only in the Storyboard overlay. |
| Markdown parse priority | Default parser pipeline | `canvas/src/features/parsers/default.ts` | `tryParseMarkdownFrontmatterFlowGraph()` runs before generic Markdown/JSON-LD parsing. |
| Frontmatter-flow parse | Frontmatter-flow parser core | `canvas/src/features/parsers/markdownFrontmatterFlowGraph.core.ts` plus supporting parser modules | Parses canonical YAML frontmatter `flow:` blocks, nodes, edges, subgraphs, clusters, and metadata. Body text is a human projection or typed KGC semantic-reference surface, not a second Storyboard Widget topology layer. |
| Typed KGC semantic graph | KGC semantic parser and query helpers | `canvas/src/features/parsers/kgcSemanticGraph.ts`, `canvas/src/lib/graph/kgcSemanticQuery.ts`, `canvas/src/hooks/active-graph-data/workspaceStructuredGraph.ts` | Parses typed inline `@node:type:id` / `@edge:predicate:source->target` sigils, emits semantic-keyed GraphData, and keeps untyped legacy references out of the graph. |
| Interactive import replay | Workspace import path | `canvas/src/features/workspace-fs/applyWorkspaceImportToCanvas.ts`, `canvas/src/features/parsers/frontmatterFlowImportMode.ts`, `canvas/src/features/parsers/applyGraphDataCanonicalBootstrap.ts` | Applies graph data and view presets through canonical import helpers. |
| Group and cluster render | Group derivation and rendering | `canvas/src/lib/graph/subgraphs.ts`, `canvas/src/components/GraphCanvas/layout/graphGroups.ts` | `kg:subgraphs` is the group SSOT; rendered group IDs are `subgraph:${id}`. |
| Graph cache identity | Shared semantic-key helpers | `canvas/src/lib/graph/semanticKey.ts`, `canvas/src/lib/graph/lookupCache.ts` | `buildScopedGraphSemanticKey()` is the upstream semantic signature helper reused across MainPanel, chat, preview, workspace, and canvas flows. |

### 2.2 Runtime Detail Continuation

The current end-to-end sequence and frontmatter output reality remain TAD detail in companion sections 7.6 and 7.7, keeping this canonical requirements index below its load-budget ceiling.

---

## 3. Stale And Conflicting Architecture Is Forbidden

### 3.1 Hard Prohibitions

The implementation and all future changes under this scope MUST NOT introduce any of the following:

1. A parallel chat orchestrator that bypasses `FloatingPanelChat` or `useFloatingPanelChatSubmit`.
2. A separate chat-path JSONB-to-Markdown bridge for canvas apply. The chat path already persists Markdown directly.
3. A Mermaid-only fast path that bypasses `tryParseMarkdownFrontmatterFlowGraph()` as the first Markdown graph parser.
4. A direct downstream `graphDataSlice` merge from assistant text that skips workspace document persistence and `setActiveMarkdownDocument()`.
5. A second grouping model separate from `flow.subgraphs -> kg:subgraphs -> readSubgraphs() -> deriveGraphGroups()`.
6. Local ad hoc graph signature helpers when `buildScopedGraphSemanticKey()` already exists.
7. Legacy alias remaps such as duplicate `clusters` or duplicate grouping payloads when `flow.subgraphs` already owns grouping semantics.
8. Untyped KGC sigil remaps such as `@node:n-trigger`; typed semantic extraction must require explicit `@node:type:id` or declared `@edge:predicate:source->target` syntax.
9. Request boilerplate or copied fixture prose that causes duplicate sections, stale labels, hardcoded actors, hardcoded model IDs, or hardcoded retry counts.
10. Passive import-mode seepage that mutates canvas view state during passive source switching.
11. Backward-compatibility shims that preserve stale conflicting owners instead of deleting them.

### 3.2 Upstream SSOT Rules

- Chat contract SSOT: `CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT`.
- Chat submit shell SSOT: `useFloatingPanelChatSubmit`.
- Chat submit lifecycle SSOT: `floatingPanelChatSubmitCoordinator.ts` plus its dedicated helper modules.
- Chat finalize/apply SSOT: `useFinalizeAssistantSuccess` plus `applyChatKgcWorkspaceDocumentToCanvas`.
- Markdown graph parse SSOT: `tryParseMarkdownFrontmatterFlowGraph()`.
- Canvas grouping SSOT: `flow.subgraphs` normalized to `kg:subgraphs`.
- Graph identity/cache SSOT: `buildScopedGraphSemanticKey()`.

### 3.3 Root Fix Requirement

If any bug appears anywhere in the chat-to-canvas path, the fix MUST happen at the highest owner in that chain:

- prompt issue -> `chatResponseBaseContract.ts`
- validation issue -> `chatMarkdownValidation`
- persistence/apply issue -> chat workspace persistence or `chatKgcCanvasApply.ts`
- parse issue -> frontmatter-flow parser modules
- typed KGC semantic extraction issue -> `kgcSemanticGraph.ts` and `kgcSemanticQuery.ts`
- grouping issue -> `subgraphs.ts` or `graphGroups.ts`
- cache signature issue -> `semanticKey.ts`

Downstream patches, alias layers, and duplicated transforms are explicitly forbidden.

---

## 4. PRD

### 4.1 Problem Statement

AgenticGraph needs one seamless and deterministic path from user intent to interactive graph state. The current repo already has that path, but the documentation is stale: it mixes real owners with speculative components and understates the existing KGC Markdown contract. That stale documentation creates three concrete risks:

1. Engineers may build duplicate chat routing, duplicate parsing, or duplicate graph-apply paths.
2. The LLM prompt contract may regress toward generic prose or minimal frontmatter, causing incomplete or weakly structured canvas imports.
3. Group, cluster, and subgraph semantics may drift if future work treats them as separate parallel concepts instead of one normalized metadata pipeline.

The requirement is to harden the current upstream contract, document the actual runtime, and explicitly forbid stale or conflicting architecture at the source.

### 4.2 Product Goal

A user configures chat from MainPanel, opens FloatingPanel chat, submits a request, receives one request-shaped KGC Markdown document, and sees the resulting nodes, edges, subgraphs, groups, and clusters applied through the canonical workspace-document import path without duplicate transforms, stale aliases, or local graph patch layers.

### 4.3 Personas

| ID | Persona | Job to be done | Pain today |
|---|---|---|---|
| P1 | Solo founder / primary operator | Turn a prompt into an immediately usable graph document and canvas graph | Stale docs obscure the real pipeline and invite duplicate implementation paths. |
| P2 | Maintainer | Extend chat-to-canvas behavior safely | Mixed proposed-vs-real architecture makes root ownership unclear. |
| P3 | Future agent / automation loop | Rely on deterministic KGC Markdown output | Weak contracts can produce prose or malformed KGC documents that need retry or fallback. |

### 4.4 In Scope

- MainPanel chat settings and integration posture.
- FloatingPanel chat mounting and FloatingPanelChat ownership.
- KGC structured Markdown prompt contract for `chatAgenticGraph`.
- Streaming draft persistence, correction retry, canonical workspace persistence, and canvas apply.
- Frontmatter-flow parsing of nodes, edges, subgraphs, clusters, groups, and import modes.
- Shared semantic-key reuse and stale-path elimination.
- Typed KGC semantic sigil extraction and queryable graph helpers.
- Shared headless coordinator and viewport-aware fan-out presentation for generated canvas collections without a second execution topology.

### 4.5 Out Of Scope

- External agent frameworks.
- A separate seeder / JSONB / bridge pipeline for the chat path.
- Replacing the workspace-document apply path with direct store mutations.
- Reworking Cloudflare deployment topology.
- Schema-config authoring beyond noting its adjacency to this chat KGC contract.

---

## 5. PRD Epics And Acceptance Criteria

### PRD-E1 - MainPanel And FloatingPanel Chat Integration

#### User story

As a maintainer, I want MainPanel settings and FloatingPanel chat to remain one connected runtime so that provider, model, auth, endpoint, and context scope are configured upstream once and consumed downstream once.

#### Acceptance criteria

**PRD-E1-AC1**  
Given a user changes provider, endpoint, model, or context scope in MainPanel settings,  
when FloatingPanel chat submits a request,  
then `useFloatingPanelChatSubmit` MUST use those same store-backed values for request URL, headers, provider options, and context packing.

**PRD-E1-AC2**  
Given the user opens the chat floating view,  
when `floatingPanelView === 'chat'`,  
then the UI MUST mount `FloatingPanelChatLazy` and no second chat renderer or second request path may exist.

**PRD-E1-AC3**  
Given the graph is active,  
when MainPanel and FloatingPanelChat both need graph-aware context,  
then both paths MUST reuse the shared semantic-key and cached lookup helpers instead of computing local incompatible signatures.

#### Success metric

- Zero duplicate chat runtime owners.
- Zero alternate chat request pipelines.
- Shared graph-context identity remains cache-stable across MainPanel and chat surfaces.

---

### PRD-E2 - KGC Prompt Contract Hardening

#### User story

As a graph author, I want `chatAgenticGraph` to always request and persist one valid KGC structured Markdown document so that the canvas can apply it directly and predictably.

#### Acceptance criteria

**PRD-E2-AC1**  
Given `chatStorageTarget === 'chatAgenticGraph'`,  
when a request is submitted,  
then the first system prompt MUST be `CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT`, not the generic chat response contract.

**PRD-E2-AC2**  
Given the LLM streams a response for `chatAgenticGraph`,  
when the response is complete,  
then it MUST contain exactly one parseable standalone KGC Markdown document that begins with YAML frontmatter and is accepted by `isKgcStructuredMarkdown()`.

**PRD-E2-AC3**  
Given the KGC document includes graph structure,  
when it references nodes, edges, and groups,  
then `pipeline`, `flow.nodes`, `flow.edges`, `mermaid`, and `flow.subgraphs` MUST remain in sync and MUST NOT introduce duplicate cluster aliases or stale parallel grouping blocks.

**PRD-E2-AC4**  
Given the request provides actor, product, objective, or artifact context,  
when the LLM writes the KGC document,  
then it MUST generate request-shaped prose and resolve only context-supported Tier B values; it MUST NOT paste template prose, duplicate sections, or inject stale labels such as `Request Intent`, `Monetization Focus`, or `Stack` unless the user explicitly asked for those labels.

**PRD-E2-AC5**  
Given actor, model, and retry semantics are referenced inside the graph contract,  
when the KGC document is generated,  
then the prompt contract MUST require variable-driven values such as `{{subject}}`, `{{ai_model}}`, and `{{runtime.maxRetry}}`, and MUST forbid hardcoded replacements that desynchronize the graph from the runtime.

#### Success metric

- First-pass structured KGC output is parseable and validator-clean in the majority of chatAgenticGraph runs.
- No stale labels or duplicate sections survive persistence normalization.
- Group and cluster semantics remain canonical through `flow.subgraphs`.

---

### PRD-E3 - Workspace-First KGC Persistence And Apply

#### User story

As a maintainer, I want assistant output to become canvas state only through the saved workspace document path so that streaming, persistence, apply, retries, and replay all stay deterministic.

#### Acceptance criteria

**PRD-E3-AC1**  
Given a chatAgenticGraph request is streaming,  
when assistant deltas arrive,  
then the runtime MUST write a live draft through `upsertChatHistoryWorkspaceDraft()` and follow the trace companion workspace path instead of waiting for the final response before any persisted artifact exists.

**PRD-E3-AC2**  
Given the final assistant response succeeds,  
when `useFinalizeAssistantSuccess` runs,  
then it MUST persist the canonical KGC workspace file and call `applyChatKgcWorkspaceDocumentToCanvas()`.

**PRD-E3-AC3**  
Given `applyChatKgcWorkspaceDocumentToCanvas()` is called,  
when the workspace document is eligible for graph application,  
then the apply path MUST first materialize the saved document through `applyWorkspaceImportToCanvas()` for Source Files and shared renderers, then reuse `setActiveMarkdownDocument({ applyViewPreset: true, applyToGraph: true, forceApplyToGraph: true })`, and MUST NOT patch graph state directly from raw assistant text.

**PRD-E3-AC4**  
Given the provider emits raw SSE JSON chunks or cited share/report URLs,  
when the shared streaming and finalize lifecycle runs,  
then it MUST persist session-folder stream artifacts and dereferenced markdown artifacts on the same workspace path without adding a second fetch or graph-apply runtime.

**PRD-E3-AC5**
Given the first returned KGC Markdown fails structural validation,
when retry budget remains,
then `floatingPanelChatSubmitCoordinator.ts` with `floatingPanelChatKgcAttempt.ts` MUST build a correction prompt from the first validation error and retry the same upstream contract instead of switching to a parallel fallback architecture.

**PRD-E3-AC6**
Given a Storyboard Widget Text Widget or Video Transcriber Widget completes with final Markdown text,
when an active workspace document path exists,
then the run MUST persist one sibling workspace Markdown artifact through `writeTextWidgetRunOutputArtifact()`, register that artifact through `applyWorkspaceImportToCanvas({ applyToGraph: false })`, and pass the resulting `outputPath` through shared widget and Rich Media Panel output patches.

**PRD-E3-AC7**
Given a Storyboard Widget Image Generation or Video Generation Widget completes with a generated binary asset,
when an active workspace document path exists,
then the run MUST persist the generated binary sibling artifact, persist one editable Markdown manifest through `writeRichMediaWidgetRunOutputArtifact()`, register that manifest through `applyWorkspaceImportToCanvas({ applyToGraph: false })`, and pass both `outputPath` and `outputManifestPath` through shared widget and Rich Media Panel output patches.

**PRD-E3-AC8**
Given a chat or Storyboard Widget response includes generated output text and audio media URL fields,
when the response is parsed into graph nodes or Storyboard widgets,
then output/result/response/transcript text MUST appear in the shared editable Card and Storyboard Output row, while audioUrl/audio/audio_url/inferred audio resources MUST render through shared CardMediaPreview, Rich Media Panel, overlay, inventory, importer, and HTML export owners.

**PRD-E3-AC9**
Given a FloatingPanel Chat response includes MCP-style `response.structuredContent`, literal MCP `result.structuredContent`, structured `result.content[]` widgets, panels, cards, media, nodes, or edges, typed diagram records such as `flow_diagrams` with `mermaid_flowchart` / `mermaid_gitgraph` / `mermaid_architecture` / `mermaid_eventmodeling` / `mermaid_gantt`, neutral geospatial records with `geoJson` / FeatureCollection payloads, or renderer/surface/model records for D3 Graph, Flow Canvas, Dashboard, 3D Mode, and XR Mode,
when KGC persistence normalizes a standard, recovered, or accepted assistant response,
then `floatingPanelChatKgcAttempt.ts` MUST accept a renderable literal MCP structured surface without retrying for KGC or synthesizing KGC text, and `chatResponseStructuredContent.ts` MUST normalize plain scalar fields, exact typed `{key,type,value}` envelopes, and `properties[]` KTV rows into the same neutral record shape, MUST preserve declared `widgets[]` form records as canonical Storyboard Widget nodes with widget form metadata, document-scoped widget registry entries, widget source/target handles, and safe `flow:compute` data when authored, MUST project undeclared widget/panel/card/media/node records into canonical KGC `flow.nodes` and `flow.edges` as Rich Media Panel endpoints with `output`, `imageUrl`, `videoUrl`, `audioUrl`, or `outputSrcDoc` fields, MUST route typed Mermaid diagram source through `flow_diagrams` routing keys into FloatingPanel row-list and BottomPanel chart surfaces, MUST route geospatial `geoJson` / FeatureCollection source through typed frontmatter or neutral structured data into compute-backed Rich Media Panel `outputSrcDoc` without mixing it with document version-control GitGraph state, renderer-local Timeline state, or Geospatial Mode toggles, MUST project D3 Graph / Flow Canvas / Dashboard / 3D Mode / XR Mode renderer and model intent into canonical `kgCanvas2dRenderer`, `kgCanvasSurfaceMode`, `kgCanvasRenderMode`, `kgCanvas3dMode`, and `kgAsset*` frontmatter fields without replacing the shared graph dataflow, MUST preserve handle-bearing authored edges between structured-content records or from `n-deliver`, MUST let shared connected-value computation drive downstream panels and run-all eligibility after workspace apply, MUST execute authored `flow:compute` nodes through provider-free shared workflow writeback before TextGeneration provider dispatch, and MUST append projected node ids to an existing `widget_bundle.graph.nodes_ref` without renderer-local graph patching.

**PRD-E3-AC10** Given a Probe-Tree or other LLM response targets Rich Media Panel text, when the output is published, then it MUST use `output` with the `agenticgraph-rich-media-text/v1` YAML-frontmatter Markdown contract, MUST omit HTML/srcdoc fields, and MUST render and edit through the shared Viewer/Markdown surface. Newly owned Markdown output MUST declare the Viewer capability upstream, an explicit authored target MUST retain its chosen surface, and an explicit `false` MUST remain a compact-surface opt-out; surface selection MUST NOT depend on request domain, language, provider, model, labels, filenames, directories, or example phrases.

**PRD-E3-AC11** Given any headless Chat or Widget run receives streamed assistant text and optional provider-exposed reasoning, when the provider reaches a terminal state, then an incomplete, length-limited, failed, cancelled, or transport-error terminal MUST NOT be accepted as successful merely because provisional assistant text exists; a successful complete answer MUST publish losslessly as the `response` part; a canvas-bound response with non-empty provider-exposed reasoning MUST publish the optional `thinking` part in a separate Rich Media Panel under the same run identity; a Chat-only surface MAY project that same part through its dedicated reasoning UI and stream artifact; absent reasoning MUST create no thinking part; and routing MUST remain independent of request domain, language, provider, model, filenames, directories, or example phrases.

**PRD-E3-AC12** Given one source or selected semantic parent produces a Rich Media coordinator and a collection of generated Widget Cards, when terminal publication materializes the collection, then semantic lineage and downstream Run targeting MUST remain `source-or-selected-parent -> generated-card`, the existing `source -> coordinator` edge MUST remain, and the canvas MUST present the generated collection as branching from that coordinator without adding physical coordinator-to-card execution edges. A wide visible viewport MUST place the coordinator in the first rightward lane and the ordered cards in a second top-down fan-out lane; when natural-size content cannot fit those three stages at 100%, the source MUST remain stable while coordinator and cards form one rightward top-down downstream column with the coordinator first. Placement and projection MUST be derived from graph semantics, measured footprints, viewport, grid, scale, and versioned topology only, never from request-, domain-, language-, provider-, model-, label-, filename-, directory-, or example-specific conditions.

> **VCC translation**: `Verify semantic source/parent-to-card edges and source-to-coordinator edge remain unchanged, the overlay resolves card presentation sources to the coordinator, no coordinator-to-card execution edge exists, wide placement is source/coordinator/fan-out, constrained 100% placement is source plus one coordinator-first downstream stack, and old layout versions migrate once`

#### Success metric

- One canonical saved KGC document per chat turn.
- One trace companion path per KGC session timestamp.
- One timestamped workspace session folder for stream logs, stream reports, and dereferenced share/report artifacts.
- One passive sibling workspace artifact or manifest for each completed Storyboard Widget text, transcript, image, or video run that has an active workspace document.
- MCP-style chat structured-content records parse into declared Storyboard Widget nodes and document-scoped registry entries when form metadata is present, editable Rich Media Panel endpoint nodes otherwise, default delivery edges, authored record-to-record edges, and existing widget-bundle overlay refs through the normalized KGC document, not a provider-specific renderer branch.
- Zero successful terminal publications contain a provider-declared incomplete or length-limited fragment; every non-empty provider-exposed thinking part is distinct from the complete response part.
- Every coordinated generated collection preserves semantic Run lineage while presenting a coordinator-first, rightward, ordered top-down fan-out that fits the captured viewport without scaling or moving the source.
- No direct raw-text-to-graph patch path exists outside workspace-document apply.

---

### PRD-E4 - Frontmatter Flow Graph And Group Pipeline

#### User story

As a graph author, I want chat-generated KGC Markdown to become nodes, edges, subgraphs, groups, and clusters through the canonical parser and group pipeline so that canvas semantics stay consistent across chat, imports, and source-file composition.

#### Acceptance criteria

**PRD-E4-AC1**  
Given a Markdown document enters the parser stack,  
when it contains frontmatter-flow graph content,  
then `default.ts` MUST prefer `tryParseMarkdownFrontmatterFlowGraph()` before generic Markdown or JSON-LD parsing.

**PRD-E4-AC2**  
Given a KGC document contains a YAML frontmatter `flow:` block,
when `tryParseMarkdownFrontmatterFlowGraph()` parses it,  
then it MUST return `GraphData` with `context: 'frontmatter-flow'`, normalized nodes, normalized edges, and metadata built by the frontmatter-flow compose helpers.

**PRD-E4-AC3**  
Given the document defines subgraphs or clusters,  
when parsing completes,  
then `flow.subgraphs` and normalized cluster-derived subgraphs MUST converge into one `kg:subgraphs` metadata channel, and rendered canvas groups MUST be derived from that channel only.

**PRD-E4-AC4**  
Given graph import is interactive,  
when graph data is applied,  
then frontmatter-flow import modes and canvas presets MUST be replayed through the canonical import helpers; passive source switching MUST NOT leak those view mutations.

**PRD-E4-AC5**  
Given a node definition is emitted by the prompt contract,  
when it is parsed into frontmatter-flow graph data,  
then it MUST NOT include manual `position:` overrides because auto layout and import-mode geometry own placement.

#### Success metric

- Zero duplicate grouping channels.
- Zero stale preset replay regressions.
- Nodes, edges, and groups stay round-trippable through the same frontmatter-flow graph contract.

---

### PRD-E5 - Shared Semantic Key And Stale-Path Elimination

#### User story

As a maintainer, I want chat, MainPanel, workspace, and graph views to share one semantic identity model so that cache reuse, diff detection, and apply decisions stay stable without recomputation churn.

#### Acceptance criteria

**PRD-E5-AC1**  
Given any graph-aware UI surface needs a graph identity key,  
when it computes a cache signature,  
then it MUST reuse `buildScopedGraphSemanticKey()` and the shared lookup cache helpers rather than define a local semantic signature scheme.

**PRD-E5-AC2**  
Given workspace import or source-file composition already owns graph application,  
when new work extends the chat-to-canvas path,  
then it MUST reuse those apply helpers and MUST NOT fork duplicate graph-owning compose logic.

**PRD-E5-AC3**  
Given stale or conflicting runtime owners are discovered,  
when the pipeline is updated,  
then the stale path MUST be removed rather than preserved behind compatibility remaps.

#### Success metric

- Reduced duplicate graph recomputation.
- No parallel cache key formats.
- No stale architecture left alive behind aliases.

---

## 6. Enhanced LLM Prompt Contract

### 6.1 Contract Owner

The enhanced contract is an upstream extension of `CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT`. This PRD-TAD does not define a second prompt source.

### 6.2 Contract Goals

The prompt contract MUST produce Markdown that is simultaneously:

- valid as a standalone KGC workspace document
- structurally parseable by the current frontmatter-flow parser path
- request-shaped instead of template-cloned
- headless and renderer-neutral so Editor Workspace, Storyboard Card/Widget, Rich Media Panels, and Edges render the same saved data through shared owners
- compatible with group, cluster, and canvas import semantics already present in-repo
- resistant to stale labels, duplicated sections, hardcodes, and parallel grouping aliases

### 6.3 Required Output Properties

The enhanced contract MUST require all of the following:

1. Exactly one standalone KGC document.
2. YAML frontmatter first chunk.
3. Canonical KGC structural blocks preserved: `$schema`, `spec`, `runner`, `links`, `canvas`, `graph_meta`, `pipeline`, `mermaid`, and `flow`.
4. `flow.subgraphs` emitted as the canonical grouping surface.
5. Node IDs, edge IDs, and group references synchronized across `pipeline`, `flow.nodes`, `flow.edges`, and `mermaid`.
6. Variable-driven actor, model, and retry fields.
7. Request-responsive body prose that adapts to the user request rather than cloning fixture sentences.
8. No duplicate sections or conflicting headings.
9. No manual `position:` on `flow.nodes`.
10. No secrets, no environment-specific paths, and no hardcoded provider credentials.
11. Successful terminal output contains one complete `response` part and, only when explicitly exposed by the provider, a separate optional `thinking` part with the same run identity.
12. A canvas-bound generated collection declares one neutral coordinator/fan-out topology while leaving semantic execution and lineage endpoints unchanged.

### 6.4 Enhanced Anti-Stale Rules

The enhanced contract MUST explicitly forbid:

- returning prose plus a partial KGC fragment instead of one full KGC document
- accepting accumulated stream text as successful after a provider-declared incomplete, length-limited, failed, cancelled, or transport-error terminal
- concatenating provider-exposed thinking into the final response or deriving response-part routing from request subject matter
- adding physical coordinator-to-card edges for presentation, rewriting semantic parents to match visual grouping, or choosing materialization coordinates from request content
- returning a minimal canvas-preset-only document when the chatAgenticGraph path expects the full KGC contract
- duplicate cluster channels such as separate retired `clusters:` payloads when `flow.subgraphs` already owns grouping semantics
- hardcoded domain roles in actor arrays
- hardcoded model identifiers in sys_event or flow node data
- hardcoded retry counts in validation or retry arcs
- stale canned body labels unless the user explicitly requested those labels
- duplicate directive echoing from long prompts
- separate downstream instructions that reinterpret the generated graph outside the saved Markdown document

### 6.5 Frontmatter And Grouping Guidance

The enhanced contract MUST treat grouping semantics as follows:

- `flow.subgraphs` is the authoring surface.
- `kg:subgraphs` is the normalized metadata surface.
- `readSubgraphs()` is the read model.
- `deriveGraphGroups()` is the render projection.

The prompt contract MUST NOT create a second first-class grouping representation for the same graph.

### 6.6 Request-Shaped Section Behavior

The current prompt already supports request-responsive sections. This PRD-TAD tightens that behavior:

- If the user explicitly asks for `Use Case`, `Problem`, `Solution`, `User Flow`, `Work Flow`, `Data Flow`, `Monetization`, or `Integration`, the output SHOULD include those exact labels.
- If the user does not ask for those sections, the prompt MUST NOT inject them as default filler.
- If the request is generic, the output MUST stay neutral and avoid domain-specific carryover.
- If the request includes concrete context, the output SHOULD resolve Tier B identity fields conservatively and keep unresolved values explicit instead of invented.

### 6.7 Validation Contract

The enhanced prompt contract remains coupled to validator behavior:

- `isKgcStructuredMarkdown()` checks structural completeness.
- `validateChatMarkdown()` checks rule compliance.
- `buildCorrectionPrompt()` re-prompts against the first failed rule.

Therefore the prompt contract MUST be authored so that validator failure drives upstream correction, not downstream patching.

---

### Continuation

See continuation in `agenticgraph-llm-prompt-contract-prd-tad.companion.md` for:

- TAD component specifications
- current end-to-end sequence and frontmatter output reality
- data contracts
- validation and traceability
- implementation guidance
- open questions and final decision

---

*Document ID: `agenticgraph-llm-prompt-contract-prd-tad`*  
*Version: `0.5.0`*
*Updated: `2026-07-30`*
