---
title: "{{product}} · Chat → AI Markdown Pipeline"
product: agentic-graph Canvas
pipeline: canvas → chat context → user intent → AI markdown → validation → render/save
status: canonical
---

# {{product}} · Chat → AI Markdown Pipeline

## Purpose
Define the end-to-end pipeline from FloatingPanel Chat input to Workspace-ingestible Markdown that can be parsed and rendered across Infinite Canvas, Workspace Editor, Multi-dimensional Table, and Kanban.

## Pipeline
`{{pipeline}}`.

## Phase 1 · Context Packaging (`packContext()`)
Chat prepends a system prompt that bundles:
- `selected_node`: id/label/type + clipped properties/metadata
- `connected_edges`: up to 50 incident edges
- `frontmatter`: active markdown document frontmatter (clipped)
- `graph_summary`: bounded graph summary string
- `guideline_digest`: condensed syntax rules and validator ids

Canonical source: `docs/documents/markdown-syntax-guidelines.md`.

## Phase 2 · AI Markdown Generation
Chat uses the provider proxy and sends:
- Base contract system prompt (`chatBaseAgenticOsResponseContractPrompt.ts` for `chatAgenticGraph`, `chatBaseResponseContractPrompt.ts` for standard chat; re-exported by `chatResponseBaseContract.ts`)
- `packContext()` system prompt
- Optional bounded subgraph context and workspace-wide context
- Conversation history
- A thin submit shell delegates the async lifecycle to `floatingPanelChatSubmitCoordinator.ts`, which composes request-build, transport, streaming, and AGENTIC_OS retry helpers instead of re-owning that logic inside the hook
- Raw SSE JSON chunks remain owned by the shared streaming helper; provider extensions must not add a second streaming client stack
- The shared Storyboard template contract is injected through `chatStoryboardTemplateContract.ts`: no-slash chat remains a plain Markdown/`response:` contract, while recognized Agentic OS invocations such as `/prd-tad.create` select the structured AGENTIC_OS contract and receive Storyboard slash/#/@ directive context without cloning the source template or authorizing Prod/Cloudflare.
- Recognized invocation routes are metadata, not answer content. `chatRuntimeInvocationQuery.ts` separates the leading route token from the remaining user request before provider payload shaping, AGENTIC_OS profiling, storage fallback, and stream relevance, so `/prd-tad.create [attached image]` keeps PRD/TAD defaults while the model sees the remaining query/media.

### Chat Thread Streaming Contract
- Submit materializes the user turn and exactly one assistant row before transport returns content. The assistant row begins as a visible, busy pending bubble, receives cumulative streamed text in place, and becomes the final settled bubble without a duplicate placeholder or tail row.
- `useFloatingPanelChatThreadFollow.ts` owns chat-thread follow intent. A stream starts pinned to the tail, subsequent content and status revisions preserve that pre-update decision even when one chunk adds more than the near-tail threshold, and explicit user scrolling disables follow until the next stream begins.
- Reasoning, usage, finish, and workspace-write status stay chronological after the live assistant row. They must not move into a sticky header, generic toast, second graph-apply runtime, or provider-local chat surface.

### Shared Provider Contract
- MainPanel Integrations and Settings may expose provider-specific readiness rows, but request execution must still converge on the shared FloatingPanel Chat transport path.
- `openai`, `miromind`, and `agnes-ai` stay on the shared upstream provider boundary; Agnes and MiroMind reuse the shared chat-completions request/options shape instead of adding provider-owned submit or finalize branches.
- Provider-specific endpoint defaults, model defaults, auth hints, and proxy normalization belong to `chatEndpoint.ts`; downstream markdown validation, workspace persistence, and canvas apply stay provider-neutral.
- When a provider streams `text/event-stream`, each SSE `data:` frame is treated as one JSON payload or `[DONE]`; provider-specific chunk parsers, graph mutation during streaming, or renderer-specific post-processing are forbidden.
- Agnes readiness is implemented as `MainPanel Integrations -> Agnes AI API -> FloatingPanel Chat`, and the output contract remains one frontmatter-first AGENTIC_OS markdown document on the shared Workspace / Source Files path.
- Long-horizon SuperAgent runs, including DeerFlow-inspired or DeerFlow-gateway-assisted runs, must still emit one frontmatter-first AGENTIC_OS markdown document before any workspace/canvas apply. Harness traces, memories, tools, skills, or subagent plans are upstream run context and must not bypass validation, parser selection, Source Files persistence, or Storyboard Widget/Rich Media Panel ownership.
- Standard, recovered, literal MCP, or already-accepted AGENTIC_OS chat responses that include structured content as `response.structuredContent`, `result.structuredContent`, or a structured block inside `result.content[]` text parts are normalized by `chatResponseStructuredContent.ts` and projected into canonical `flow.nodes` / `flow.edges` before workspace apply. Literal MCP results that extract to a renderable structured surface finalize at `floatingPanelChatAgenticOsAttempt.ts` without AGENTIC_OS retry or synthetic AGENTIC_OS text. Declared `widgets[]` form records become real Storyboard Widget nodes with widget ports and document-scoped `flow:widgetRegistry` entries; undeclared widgets, panels, cards, media, and nodes become Rich Media Panel endpoints. Safe `flow:compute` data on declared widgets is preserved for the shared connected-value runtime, so upstream handle changes can recompute downstream panels without a renderer-local runner; when the shared Storyboard Widget workflow run path executes such a node, inline compute output writes through the shared workflow output helper before any provider TextGeneration branch. Plain fields, exact typed `{key,type,value}` envelopes, and `properties[]` KTV rows converge on the same neutral record shape. Inline edits of projected output fields reuse `CardInlineTextEditor` -> `buildGraphNodeCanonicalTextPatch()` -> `updateNode()`, keeping flattened fields and any native `properties` mirror aligned before frontmatter writeback. When an accepted AGENTIC_OS already declares `widget_bundle.graph.nodes_ref`, the same projection appends response node ids there so Storyboard Widget overlay ownership stays upstream.
- Typed Mermaid and Geospatial requests stay on the same neutral dataflow path. Routed Mermaid diagram source, including typed `flow_diagrams` entries with `type: mermaid_flowchart`, `type: mermaid_gitgraph`, `type: mermaid_architecture`, or `type: mermaid_eventmodeling`, must preserve frontmatter routing keys so FloatingPanel row-list and BottomPanel chart surfaces read the diagram source directly. Geospatial payloads under neutral `geoJson`/`geojson`/coordinate fields and ordinary generated outputs can still feed source/card/widget -> safe compute -> Rich Media Panel `outputSrcDoc`; none of these records may be treated as static panel copies, renderer-local Timeline instructions, document version-control GitGraph state, or Geospatial Mode toggles.
- D3 Graph, Flow Canvas, Dashboard, 3D Mode, and XR Mode requests stay on the same neutral frontmatter path. Structured renderer/surface/model intent is projected as `kgCanvas2dRenderer`, `kgCanvasSurfaceMode`, `kgCanvasRenderMode`, `kgCanvas3dMode`, and `kgAsset*` fields, while graph nodes, edges, inline compute, Storyboard cards, and Rich Media Panels remain shared dataflow outputs rather than renderer-local patches.

When `chatStorageTarget=chatAgenticGraph`, the primary assistant contract is:
- A standalone parseable AGENTIC_OS markdown document aligned to `agentic-os-ai-pipeline-chat-response-base-template.md`
- Deterministic frontmatter↔body variable linkage using `{{}}`
- Canonical pipeline surfaces (`runtime`, `pipeline`, `mermaid`, `flow`) with validation-safe enums and pure compute blocks
- `flow.subgraphs` as the only grouping authoring surface; parallel grouping or legacy cluster aliases are forbidden
- Optional MCP-style structured content as `response.structuredContent.widgets`, `result.structuredContent.widgets`, or structured `result.content[]` text blocks with `panels`, `cards`, `media`, `nodes`, neutral `output`, `imageUrl`, `audioUrl`, `videoUrl`, `outputSrcDoc`, and `edges` fields; declared widget records may also carry `nodeTypeId`, `formId`, `widgetTypeId`, `prompt`, handle keys, and safe `flow:compute` data that reads `inputs` and returns output-port values. Those fields may be plain scalars or exact AGENTIC_OS typed `{key,type,value}` / `properties[]` rows.
- Optional typed diagram records such as `flow_diagrams.flowchart.type: mermaid_flowchart`, `flow_diagrams.gitgraph.type: mermaid_gitgraph`, `flow_diagrams.architecture.type: mermaid_architecture`, `flow_diagrams.event_model.type: mermaid_eventmodeling`, and neutral geospatial records with `geoJson` / FeatureCollection payloads remain frontmatter or structured-content data inputs. Routed Mermaid diagram records render through FloatingPanel row-list and BottomPanel chart surfaces; ordinary generated outputs remain compute-backed Rich Media Panel output, not static backfill.
- Optional renderer/surface/model records for D3 Graph, Flow Canvas, Dashboard, 3D Mode, and XR Mode remain canonical frontmatter data through `kgCanvas2dRenderer`, `kgCanvasSurfaceMode`, `kgCanvasRenderMode`, `kgCanvas3dMode`, and `kgAsset*`; the renderers consume the same applied `GraphData` and asset document metadata.
- Authored structured-content edges preserve source, target, handle, and label semantics after record aliases are normalized to canonical node ids; default `n-deliver` edges are added only for response records that still need a renderable incoming edge, and existing widget-bundle overlay refs are extended rather than bypassed.

## Phase 3 · Validation Gate (`validateMarkdown()`)
When `chatStorageTarget=chatAgenticGraph`, the `agenticOs` block or renderable literal MCP structured surface is validated before final persistence:

### Structural Gate
- Accept one canonical frontmatter-first standalone AGENTIC_OS markdown document; prose wrappers and fenced `agenticOs` shells are rejected by the upstream validator contract.
- The AGENTIC_OS body must stay standalone parseable for Canvas/Workspace/Table/Kanban.
- No nested code fences inside the persisted AGENTIC_OS document.
- Minimal canvas-preset-only fallbacks are rejected; the full canonical AGENTIC_OS contract must remain present.

### Syntax Rules (V-01..V-07)
- `V-01` Color sigil HEX is exactly 6 uppercase digits.
- `V-02` No quoted span ≥ 15 words.
- `V-03` `{{key}}` refs must resolve from context/frontmatter or inline declarations, and AGENTIC_OS body/`solution_md` must stay substantively linked and non-thin.
- AGENTIC_OS body must carry the real answer content; `{{solution_md}}` may support linkage but must not be the entire body output.
- `V-04` Inline-code arrays must be valid JSON.
- `V-05` `compute: |` blocks are pure (forbid `fetch`, `document`, `window`).
- `V-06` H1–H4 headings must not end with `...`.
- `V-07` `confidence:` values are exactly `low|medium|high`.

### Retry Loop
On failure, Chat re-prompts up to 3 attempts using:
- `@flag:correction`
- `failed_rule: V-0x`
- `reason: ...`
- A truncated invalid output excerpt (reference only)

`floatingPanelChatSubmitCoordinator.ts` owns that lifecycle and delegates AGENTIC_OS validation/recovery plus literal MCP structured-surface acceptance to `floatingPanelChatAgenticOsAttempt.ts`, `chatMarkdownValidation.ts`, and `chatHistoryWorkspace.agenticOs.recovery.ts`.

If attempts are exhausted, Chat persists the best canonical recovered AGENTIC_OS candidate or a parser-safe deterministic AGENTIC_OS fallback while still returning a concise answer; Workspace surfaces never ingest broken Markdown.

## Persistence Contract
- The Workspace `agenticOs_*.md` file is the standalone canonical AGENTIC_OS document.
- `chatAgenticGraph` creates one timestamped session folder and persists `agenticOs_<session>.md` there.
- On write, canonical AGENTIC_OS identity is kept base-template compliant; only `links.self_ref` is normalized from the session-scoped `agenticOs_*.md` filename.
- Structural acceptance requires frontmatter↔body linkage: every body `{{key}}` reference must be declared in YAML frontmatter (base-template allows dotted `runtime.*` refs).
- Base-template Tier B sentinel keys (`product/domain/subject/objective/artifact/owner/version/status`) are allowed as unresolved placeholders when declared in frontmatter.
- Do not append `<!-- kg-chat-history -->` or any chat-history trailer to `agenticOs_*.md`.
- AGENTIC_OS trace outputs keep two canonical session documents: `agentic-os-trace_<session>.md` (trace, finalization, and stream observability) and `agenticOs_<session>.md` (canonical run document plus markdown run/manifest output sections). Binary media outputs may still use explicit media artifacts; markdown `agentic-os-output_*` sidecars must consolidate into `agenticOs_<session>.md`.
- Live draft persistence writes the trace companion path first, then finalize persists the canonical workspace document, materializes it through `applyWorkspaceImportToCanvas()`, and applies it through `setActiveMarkdownDocument()`; raw assistant text must not patch graph state directly.
- Streaming folds relevant stream-log content into `agentic-os-trace_<session>.md`; report/share dereference artifacts remain additive companions and must not become graph-apply sources.
- Recovery and normalization may salvage wrapped model output upstream, but the saved canonical document remains one frontmatter-first AGENTIC_OS document with no duplicate grouping channels beside `flow.subgraphs`.
- AGENTIC_OS normalization may materialize MCP-style `response.structuredContent`, literal MCP `result.structuredContent`, or structured `result.content[]` text blocks from fallback text, literal MCP results, or accepted frontmatter into ordinary frontmatter-flow Storyboard Widget nodes and document-scoped widget registry entries when widget form metadata is declared, Rich Media Panel endpoints otherwise, edges, safe `flow:compute` widget data for shared connected-value recomputation and provider-free workflow-run output writeback, inline-editable output fields that sync flattened and native `properties` mirrors through the shared card patch/updateNode path, and existing `widget_bundle.graph.nodes_ref`; it must not add a provider-specific renderer path.
- Dereferenced share/report URLs must reuse the shared workspace URL-content import pipeline and remain additive artifacts, never a second graph-apply runtime.
- If any chain document grows large, keep the original filename as a sub-600 canonical index and move detailed sections into companion markdown files linked by explicit Continuation notes.
- Workspace Widget exports (Image/Video) must stay in one widget-bundle SSOT so JSON and Markdown projections list both `registry` and `graph` entities from the same bundle source.
- Reusable pitchdeck templates forked from `huijoohwee.github.io/template/pitchdeck-prd-tad-template*.md` must stay on the same frontmatter-first contract: `widget_bundle`, `runner`, `pipeline`, `mermaid`, `flow`, typed envelopes, and Rich Media Panel canonical output surface remain in sync.
- Continuation: fallback recovery details are documented in `docs/documents/agentic-graph-chat-ai-markdown-pipeline-document.fallback-recovery.md`.
- Continuation: artifact promotion retry details are documented in `docs/documents/agentic-graph-chat-ai-markdown-pipeline-document.promotion-retry.md`.
