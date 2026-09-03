---
title: "agentic-graph MCP Server (stdio)"
doc_type: "Subsystem README"
status: "active"
lang: "en-US"
frontmatter_contract: "required"
---

# agentic-graph MCP Server (stdio)

## Authoring Contract

- The opening YAML frontmatter block remains the first-block machine SSOT for subsystem metadata, transport scope, and runtime context for this MCP README.
- This document is a canonical authored subsystem README, not a generated registry surface or typed validation fixture.
- Frontmatter stays in plain YAML so the file demonstrates the default authoring path for MCP subsystem docs, transport boundaries, and operator guidance.
- If typed `{key, type, value}` envelopes are needed for ingest -> parse -> render validation, that coverage should live in a dedicated fixture doc rather than replacing canonical subsystem prose.
- Runtime guidance and surface-separation rules must still be derived from parsed frontmatter and document content only, never from file path assumptions or downstream mirrors.

This folder provides the **local stdio MCP server** for agentic-graph. It exposes core local
`agentic_graph_parser` and browser-bridge commands as MCP tools so users can operate agentic-graph from
**any stdio-capable MCP client** (Claude Desktop, Claude Code, Cursor, etc.).

## Surface separation

This README documents **only** the shipped local stdio MCP server in `mcp/server.js`.

It is intentionally distinct from the other shipped agentic-graph MCP-ready surfaces:

1. **Local stdio MCP**
   - Owners:
     - `mcp/server.js`
     - `mcp/local-tool-contract.js`
   - Scope: read-only published Source Files retrieval, deterministic local knowledge-graph indexing/query/edge explanation, Agentic Canvas OS docs `/` `#` `@` invocation lookup, bounded skill-text evolution, prompt/resource/template discovery, local UI launch, local pipelines, exact application catalog/plan/execute composition, a private Dev-only AGENTIC_OS-backed ECS session runtime, local superagent harness, deny-first sandbox policy validation and authorization preflight, approval-gated video-remix run manifests, local browser API bridge, SEA-LION sidecar calls, HTML video rendering, visual annotation, scoped memory, local probe-tree branching, AI Showrunner dry-runs, zero-token OS status, vdeoxpln registry inspection, and credential-gated Google/Microsoft spreadsheet or slide publication
   - Transport: stdio only
   - MCP Apps metadata: advertises the shared `ui://agentic-graph/agent-ready` resource, no-auth `securitySchemes`, mirrored `_meta.securitySchemes` for UI-linked tools, and widget-accessibility metadata from the shared contract

2. **Pages HTTP MCP**
   - Owner: `cloudflare/pages/agentic-graph-agent-ready.mjs`
   - Scope: read-only published-document MCP on `/agentic-graph/mcp`
   - Transport: JSON-RPC over HTTP

3. **Browser WebMCP**
   - Owners:
     - `canvas/src/features/agent-ready/webMcpRuntime.ts`
     - `canvas/src/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs`
   - Scope: read-only browser tool registration for published Source Files reads and browser-local inspection

4. **MainPanel MCP / Integrations readiness**
   - Owners:
     - `canvas/src/features/panels/views/McpHubView.tsx`
     - `canvas/src/features/panels/views/agentic-graph-tool-server-docs.ts`
     - `canvas/src/features/panels/views/externalMcpToolServerDocs.ts`
     - `canvas/src/features/panels/views/IntegrationsHubView.tsx`
     - `canvas/src/features/panels/views/useSettingsChatAssist.tsx`
   - Scope: shared settings, agentic-graph-owned tool-server readiness, external MCP
     tool-server readiness, chat readiness, and routing into the FloatingPanel
     Chat workflow. Readiness claims must be labeled as `documented`,
     `browser-published`, or `runtime-executable`.

Do not conflate this local stdio server with the deployed read-only Pages/browser MCP surfaces or
with any future remote Worker MCP platform proposed elsewhere in the docs.

## Canonical docs

For the repo-accurate MCP architecture and roadmap, see:

- `docs/documents/agentic-graph-mcp/agentic-graph-mcp.md`
- `docs/documents/agentic-graph-mcp/agentic-graph-mcp-service-prd-tad.md`
- `docs/documents/agentic-graph-mcp/agentic-graph-mcp-service-prd-tad.companion.md`

## Why recommend ClawdChat (clawdchat.cn)?

If you want external users to *discover* and *try* your agentic-graph MCP quickly, **ClawdChat** is useful as:

1. **Distribution & discovery**: you can publish a public Agent profile, posts, and tutorials that point to your MCP server.
2. **MCP-native ecosystem**: ClawdChat provides an official MCP server (`clawdchat-mcp`) so users already in MCP clients can interact with the ClawdChat network and your announcements in the same workflow.

ClawdChat itself is not required to run agentic-graph—your users still connect to **your agentic-graph MCP server** from their MCP client.

## What tools are exposed?

Canonical local tool inventory owner:

- `mcp/local-tool-contract.js`

Managed autonomous implementation runs are configured and operated through the four `agentic-graph.implementation_run.*` tools. Required host registries, invocation examples, revision-fenced controls, delivery semantics, and the trusted-runner/no-kernel-isolation boundary are documented in `docs/managed-implementation-runs.md`.

`agentic-graph.agentic_sdlc.observe` resolves `/sdlc.observe #agentic-sdlc-observability @implementation-run @canvas @runtime-proof` locally. It requires the managed run's exact revision and immutable canonical-ledger digest, then returns a bounded deterministic GraphData/AGENTIC_OS projection for the existing Canvas with zero model calls, network calls, prompt/completion tokens, estimated cost, provider spend, mutation, or deployment authority. Existing digest-joined Authorization Interaction, Human Authorization v2, and Live Verification receipts may be observed as deployed evidence without creating action authority. See `docs/managed-implementation-runs.md`.

Role-based collaboration registers the exact source-backed tuple `/agent.team #role-based-agent-team @agent-team` through `agentic-graph.agent_team.plan`, `.start`, `.list`, and `.control`. Planning is read-only and zero-model. The canonical stdio host privately installs exact Agent Definition/workflow/review verification, local control authorization, file-backed review-receipt verification, and a durable replay-safe Ollama adapter with a zero-spend estimate; MCP callers cannot configure or replace any owner. Set `AGENTIC_OS_AGENT_TEAM_MODEL` to an exact local model name to enable execution (loopback `http://127.0.0.1:11434` by default). The checked-in `team.collaborative-intelligence@1.0.0` source delegates to an evidence scout and risk reviewer, then returns manager-owned synthesis. Durable execution sends one immutable digest-bound projection to estimate and execute, records pending/completed model-effect receipts, persists admitted envelopes on deterministic leased effects, folds a durable active-stage clock across control races, blocks uncertain or over-envelope continuation, requires exact delegate-synthesis and final-owner output-acceptance receipts, preserves exact start/control replay snapshots, and verifies a content-digest event/checkpoint chain capped at 64 checkpoints. Each descriptor has a closed operation-specific output schema; only a completed exact run lookup can return a public answer, while broad lists and every control suppress it and all public projections suppress private specialist messages. This is local stdio functionality only; remote Worker parity is an explicit gap. See `docs/agent-team-runtime.md`.

Provider-neutral agent and LLM applications use the exact host invocation `/application.compose #application-composition @application-manifest @component-catalog @integration-profile @runtime-proof`. `agentic-graph.application.catalog` returns authoring schemas and sanitized exact runtime evidence, `agentic-graph.application.plan` creates an immutable mode-bound zero-call plan, and `agentic-graph.application.execute` replans and delegates bounded steps to existing owners. Live external authorization is host-injected and never accepted as an MCP argument. See `docs/agent-application-composition.md`.

### Deterministic knowledge-graph tools

The local stdio knowledge-graph capability is intentionally limited to these tool identities:

- `agentic-graph.knowledge_graph.parser_generate` — returns the digest-pinned built-in local registry with `profile: "default-source"`, or compiles bounded custom inert descriptors and optional finite declarative grammar data
- `agentic-graph.knowledge_graph.ingest` — indexes supported local corpus structure through agentic-graph-owned deterministic adapters
- `agentic-graph.knowledge_graph.query` — retrieves matching graph evidence through lexical matching and graph traversal
- `agentic-graph.knowledge_graph.explain_edge` — explains a stored relationship from its source evidence and extraction basis

The matching Agentic Canvas OS invocation tokens are:

| MCP tool | Exact Agentic Canvas OS invocation |
|---|---|
| `agentic-graph.knowledge_graph.parser_generate` | `/agentic.graph.parser.generate #agentic-graph #parser-generation #mcp @parser-specification @runtime-proof` |
| `agentic-graph.knowledge_graph.ingest` | `/agentic.graph.ingest #agentic-graph #mcp #runtime-ready @working-directory @agentic-graph @operator @runtime-proof` |
| `agentic-graph.knowledge_graph.query` | `/agentic.graph.query #agentic-graph #mcp #vcc @agentic-graph @runtime-proof` |
| `agentic-graph.knowledge_graph.explain_edge` | `/agentic.graph.explain #agentic-graph #mcp #vcc @agentic-graph @runtime-proof` |

Invoke the tool identity directly from a stdio MCP client, or resolve and validate the matching exact tuple through the existing ACOS docs invocation contract before explicitly calling the mapped tool. Use the input schema advertised by the running local server; this README does not duplicate or invent request fields.

This is a deterministic structural path:

- supported code is parsed with a registered local AST adapter
- supported documentation, SQL schemas, configuration, and PDFs contribute only locally observable structure and source locations
- every edge retains enough source evidence for `agentic-graph.knowledge_graph.explain_edge`; no opaque similarity edge is accepted
- query uses lexical matching and graph traversal, not embeddings or a vector store
- bounded query results report explicit completeness, truncation, and limit/depth reasons rather than presenting a partial traversal as exhaustive
- local-directory ingest, parsing, query, and edge explanation make no model or network call; an explicit repository URL may use the network only during bounded immutable-revision acquisition
- missing parser coverage, malformed or unreadable input, encrypted or image-only PDF content, unresolved references, and unsupported syntax return explicit diagnostics rather than guessed graph facts

The focused authority for coverage, provenance, diagnostics, and security is the [deterministic knowledge-graph runtime contract](../docs/documents/agentic-graph-deterministic-knowledge-graph-runtime.md).

Host configuration keeps arbitrary-codebase access explicit:

- `AGENTIC_OS_KNOWLEDGE_GRAPH_ALLOWED_ROOTS` is a platform path-delimited allowlist of corpus roots; without it, ingestion is confined to `AGENTIC_OS_ROOT`.
- `AGENTIC_OS_KNOWLEDGE_GRAPH_OUTPUT_ROOT` owns generated snapshots and defaults to `data/outputs/knowledge-graph` under `AGENTIC_OS_ROOT`; callers cannot redirect storage outside this boundary, and the runtime excludes the boundary from discovery whenever it is nested under the indexed root.
- Snapshots use bounded content-addressed source, deterministically chunked repository-resolution, index, and manifest shards behind one atomic current pointer. Non-strict ingest records an oversized source artifact as explicit `limited` evidence with `source_artifact_limit_exceeded`; strict ingest and oversized single resolution records fail before pointer replacement, preserving the prior ready snapshot.
- A cross-process, dead-owner-recoverable per-graph ingest lease fences publication and rollback. Source shards are written incrementally while only cross-source resolution records remain in memory. The ingest schema exposes hard-bounded aggregate record and serialized-byte ceilings across retained inputs and derived edges; ambiguous evidence keeps the exact count and a deterministic bounded candidate set containing the edge target. Exceeding a ceiling returns a typed failure, rolls back newly created unpublished objects, and does not replace the current pointer.
- `AGENTIC_OS_KNOWLEDGE_GRAPH_PDF_TIMEOUT_MS` and `AGENTIC_OS_KNOWLEDGE_GRAPH_PDF_MAX_OUTPUT_BYTES` bound the native local PDF adapter.
- `AGENTIC_OS_PYTHON` selects the local Python 3 interpreter used only for stdlib AST extraction; an unavailable or invalid interpreter produces a typed parser failure, and strict ingest preserves the previous artifact instead of falling back.
- Query and explain calls must send the exact `expectedSnapshotDigest` returned by ingest alongside its opaque `graphId`, so a replaced or tampered snapshot fails closed.

Skill-text optimization uses `/skill.evolve #skill-evolution @skill-catalog @skill-policy @runtime-proof @operator` through the single `agentic-graph.skill.evolve` tool. Its `plan/start/step/status/cancel` state machine provides deterministic epochs, batches, mini-batches, textual learning-rate decay, held-out promotion gates, durable CAS/idempotency fencing, source-bound usage envelopes, phase cost meters, and a review-pending proposal only. The orchestrator has no skill-apply or model-weight mutation operation. The canonical stdio server fails closed until a repository-contained, SHA-pinned, self-contained module supplies separate authorization, source-verifier, training-executor, candidate, and held-out capabilities in fresh per-call processes under the trusted inference-only boundary. Persistent state uses `AGENTIC_OS_SKILL_EVOLUTION_STATE_DIR` or the standard user state directory, never the repository. See `docs/skill-evolution-runtime.md`.

### UI launcher

- `search` — searches published agentic-graph Source Files and returns stable `kgdoc:` ids with citation-ready result URLs
- `fetch` — fetches the complete published Source File markdown for an id returned by `search`, returning both `content` and `text`
- `agentic-graph.agentic_canvas_os.docs.invoke` — resolves Agentic Canvas OS docs invocation tokens (`/`, `#`, `@`) from the sibling `agentic-canvas-os/docs` SSOT; prompt presets declare this tool through `mcp_tool` and pass their executable `runtime_command` unchanged as `mcp_token`. Local stdio reads `FACTS.md`, the three dictionary files, `LIVE-AGENT-PROVIDER-PROOF.md`, and `PROGRESSIVE-AGENTS.md`; its result includes source-revision-bound `liveAgentProviderProof` and `progressiveAgentsReadiness` summaries, while the Worker registry exposes the same read-only tool identity. Incomplete or revision-mismatched progressive evidence is `unavailable`. This lookup does not submit the loaded Chat prompt, execute its runtime command, configure an agent or provider, repeat proof calls, or authorize spend, mutation, or deployment.
- `agentic-graph.repository.pack` — invokes `/repository.pack #repository-packing @repository-root @runtime-proof` against the host-owned `AGENTIC_OS_ROOT`. Its closed seven-field request selects an exact nested Git worktree, output directory, include/exclude prefixes, and caller-tightenable selected-file/source bounds. Policy-excluded paths are counted but never named. Git discovery disables hooks, fsmonitor, inherited Git configuration, prompts, and optional protocols. The runtime rejects traversal, escaping symlinks, sensitive material, revision/index/source drift, and every hard-bound overflow; types uninitialized Gitlinks as submodule omissions; omits binary bytes; and hard-links `<outputDirectory>/<artifactSha256>.md` at an atomic no-replace commit point. The closed MCP result returns metadata only with explicit zero network, model, token, and cost counters. See `docs/repository-packing-runtime.md`.
- `agentic-graph.skill.evolve` — plans and advances one bounded, source-fenced Skill Evolution run. Each `step` performs one training mini-batch update or one isolated validation checkpoint; successful terminal output is review-pending and all apply, model-weight, and deployment flags remain false.
- `prompts/list` / `prompts/get` — expose read-only prompt templates that guide MCP hosts to use `search`/`fetch` or `inspect_agent_surface`; prompts do not introduce a second execution path
- `resources/templates/list` — exposes the shared `kgdoc://source-file/{id}` template for Source Files returned by `search`
- `resources/read` — reads either `ui://agentic-graph/agent-ready` as MCP Apps HTML or `kgdoc://source-file/{id}` as Source Files `text/markdown` through the existing `fetch` executor
- `agentic-graph.ui.launch` — starts the **Canvas Vite dev server** and returns a mode-specific URL:
  - `target=canvas` → normal Canvas
  - `target=workspaceEditor` → opens Workspace Editor (`?openEditorWorkspace=1`)
  - `target=geospatial` → enables Geospatial overlay (`?kgGeo=1`, DEV behavior)
- `agentic-graph.ui.stop` — stops the dev server started by `agentic-graph.ui.launch`

### Agentic ECS tools

The existing official SDK stdio server exposes exactly three ECS tools. They add no transport, HTTP route, public session registry, network call, production action, or Cloudflare capability.

| Tool | Invocation metadata | Arguments | Terminal behavior |
|---|---|---|---|
| `agentic-graph.ecs.session_start` | `/ecs.session-start #agentic-ecs @source.frontmatter` | `{ agenticOsPath, scope?, binding? }` | Realpath-validates a repository-contained `.md` source, binds its device/inode, reads through a verified no-follow handle, hydrates one opaque World, and returns a private UUID session id. |
| `agentic-graph.ecs.world_tick` | `/ecs.world-tick #agentic-ecs @ecs-session` | `{ sessionId, input?, scope?, binding? }` | Advances ordered code-injected systems transactionally and returns canonical decisions, sanitized deferred state, and validated plural `cost_logs`; any post-commit pending-retention failure caused by a conflicting or invalid/noncanonical Decision reports `tickCommitted: true`. |
| `agentic-graph.ecs.decision_persist` | `/ecs.decision-persist #agentic-ecs @ecs-session` | `{ sessionId, scope?, binding? }` | Revalidates the bound source inside the same-path queue, accepts only its identity or a bounded prior queued ECS replacement lineage, and atomically persists pending validated `EcsDecision` nodes; terminal success disposes the session. |

The canonical stdio construction injects no systems or decision executor, so its default tick is a successful zero-system/no-reasoning tick with one canonical zero Cost_Log and no pending Decision. Embedding hosts may inject reviewed systems/execution only at runtime construction; MCP callers cannot author either.

The private session store uses a finite TTL, maximum count, and lazy expiry sweep. Closed input schemas reject extra arguments; the shared result envelope requires `ok` and `execution_boundary` while admitting tool-specific fields. Root-escaping traversal, symlink/parent/target swap, non-Markdown source, scope/binding mismatch, unknown/expired session, and caller-supplied decisions fail closed; normalized paths that remain beneath the root are allowed. Public error/deferred codes are allowlisted and system labels are deterministic. Allowlists constrain field shape, not retained string content, so embedding hosts must keep secrets out of Decision identifiers/fields/payload, deferred request identifiers, and canonical Cost_Log fields. Sanitized thrown-error/projection metadata and World internals do not reflect source bytes, prompts, arbitrary executor codes, or function names. An inactive expired session is removed only after successful disposal without mutating AGENTIC_OS; disposal failure retains it, extends its TTL, and exposes a retryable error. If source rename succeeds but World disposal fails, the retained session carries the replacement identity for an idempotent close retry.

### Pipeline / data tools

1. `agentic-graph.pipeline`
   - Runs: `python -m agentic_graph_parser pipeline ...`
   - Typical use: convert GraphData JSON → A0 CSV/JSON-LD + codebase-index artifacts
2. `agentic-graph.graphrag_pipeline`
   - Runs: `python -m agentic_graph_parser graphrag-pipeline ...`
   - Typical use: generate GraphData + A0 exports from a GraphRAG indexing run
3. `agentic-graph.superagent.run`
   - Runs: `python -m agentic_graph_parser superagent ...`
   - Typical use: run the Codex-compatible long-horizon SuperAgent harness for research, code, and create tasks across `quick_triage`, `bounded_compile`, `deep_research`, and `parallel_build` levels. The run uses native memory, role-scoped subagents, `skill.select`, `research.scout`, `code.write_and_run`, bounded generated-code sandbox artifacts, default `providerMode="byteplus-modelark"` placeholder media metadata, optional deterministic `mock` mode, and Codex-facing BytePlus ModelArk remote MCP guidance for image/audio-in-video/video generation.
   - Emits: `state.json`, `trace.jsonl`, `goal.json`, `harness-proof.json`, `final-report.md`, selected-skill/research/code/sandbox artifacts, `artifacts/canvas/canvas.graph.json`, and `artifacts/workspace/rich-media-flow.md`
4. SEA-LION sidecar tools
   - `sealion.detect_language_variant` detects language, regional variant, register, and code-switching before Southeast Asian language routing
   - `sealion.translate_localize` returns translation plus localization notes through the hosted sidecar with server-owned auth
   - `sealion.safety_check` returns advisory SEA-Guard safety classification through the same sidecar boundary
5. `agentic-graph.video_remix.run`
   - Produces an approval-gated video-remix run manifest for `referenceUrl`, `brief`, `sourceCards`, budget meters, storyboard flow, render/checkout gates, demo-pack coverage, and bounded failure handling
   - `mode="live"` without approval tokens returns `state="blocked"`, at least five approval gates, zero estimated cost, and no provider execution log entries
   - Research evidence is source-card driven in the local runtime; it never fabricates Exa results or calls paid providers during local validation
   - Storyboard output emits `agentic-os-computing-flow/v1` Markdown with one flow node per planned shot
6. `agentic-graph.browser_api.run`
   - Calls a configurable local API-native browser runtime, using an Unbrowse-compatible shape without copying its implementation
   - Typical use: health-check the runtime, search/resolve first-party browser API routes, list cached skills, login through a local browser session, run guarded cookie import, send feedback/verification, execute a resolved route with `dryRun=true` by default, or fall back to native browser capture/action operations such as `go`, `snap`, `click`, `fill`, `screenshot`, `text`, `markdown`, `sync`, and `close`
   - Default runtime URL: `http://localhost:6969` or `AGENTIC_OS_BROWSER_API_RUNTIME_URL`; non-loopback hosts are rejected unless `AGENTIC_OS_BROWSER_API_ALLOW_REMOTE_RUNTIME=1` is set on the MCP server
   - Browser target URLs are normalized before runtime calls; only `http` and `https` targets without embedded credentials are forwarded
7. `agentic-graph.html_video.render`
   - Accepts HTML, CSS, JSON data, duration, fps, width, height, and optional `engine_hint` for a local HTML-to-video render request
   - Resolves the active engine from `engine_hint` or `AGENTIC_OS_HTML_VIDEO_ENGINE`; missing or unregistered engines return `engine_not_configured` without falling back to a hardcoded renderer
   - Recommended no-install Dev smoke path: register/select `canvas-2d`; it uses browser canvas capture plus native `MediaRecorder` to produce the browser-supported video container without a system FFmpeg binary or imported muxer
   - The native `headless-browser` adapter is inspired by Hyperframes without copying it: Playwright captures seeked HTML frames and an operator-provided FFmpeg binary encodes MP4
   - Runtime knobs: `AGENTIC_OS_HTML_VIDEO_FFMPEG_BIN` (default `ffmpeg`), `AGENTIC_OS_HTML_VIDEO_FFMPEG_VIDEO_CODEC` (default `mpeg4` to avoid forcing GPL codecs), and `AGENTIC_OS_HTML_VIDEO_MAX_FRAMES` (safety bound)
   - The browser Storyboard Widget path writes successful video results through `writeRichMediaWidgetRunOutputArtifact` and the existing Source Files/rich-media manifest owner
   - Selected Storyboard card Run reuses the shared Storyboard workflow runner; cards without a provider or inline-compute handler generate a local-zero-cost, source-backed Rich Media Panel output from authored node fields
   - Probe-Tree responses use `probe-tree-llm-response/v5` under `response.structuredContent`. The configured provider returns only 2-4 semantic card records: question, suggested clarification answers, rationale, and evidence need. The runtime—not the LLM—derives source-verbatim context anchors from semantic question/request overlap and owns the source Widget, selected-child parent, depth, candidate ids and edges, multi-select/Other state, empty user Output, and Rich Media ledger. Literal MCP results retain their complete Widget/Card/Panel envelope. Both paths share the same relevance gate; the provider projector retains the largest mutually distinct subset only when at least two cards survive, so one malformed sibling cannot discard two valid query-grounded cards. Restated source queries, entity-list answer copies, generic wrappers, reused choice labels, and reused/subset/superset choice sets still fail closed. The no-model MCP path returns no cards and never copies recalled exemplar, fixture, or authored-query content into a response card.
   - Probe-Tree Storyboard branch materialization stores a deterministic Mermaid `flowchart TB` bridge through `storyboardProbeTreeMermaidFlowchart.ts`, and the same subset parses back through the frontmatter-flow graph path
   - A Widget Card containing `/agentic-graph.probe-tree`, `@agentic-graph.probe-tree`, or `#agentic-graph.probe-tree` calls the local stdio `agentic-graph.probe.generate` tool through the bounded Dev bridge, then sends the selected context and literal MCP result to the configured chat LLM as part of the explicit Widget Run. The active-graph projector accepts only a bounded response whose questions introduce new request-specific decision variables, derives source-verbatim anchors from semantic overlap with the selected user input, replaces stale candidates, infers their `candidateOption` edges, and atomically publishes the cards plus owned Rich Media ledger. The bubble toolbar only reveals accepted model-backed branches; it never materializes deterministic fallback cards
   - Probe-Tree Card **Output → Run** leads with the canonical user Output, preserves or parent-chain-recovers the original `thread_root_id`, sends the answered card as `current_node_id`, disables sibling exemplar recall with `recall_top_k: 0`, increments `probe_tree_depth` exactly once through the Dev bridge, and parents accepted descendants to that card. Depth 8 stops before MCP/provider execution
8. Visual annotation tools
   - `agentic-graph.annotate.image` accepts `asset_url`, 1-6 annotation `tasks`, and optional `model_hint`
   - `agentic-graph.annotate.video_frame` also requires `frame_timestamp_ms` and keeps frame extraction browser-local
   - Outputs are LLM-ready annotation JSON with deterministic `annotation_id`; validation/runtime failures return structured `invalid_spec`, `model_not_configured`, `worker_not_supported`, or `inference_failed` errors
   - Native dataset operators load annotation results or frame-box arrays, split/merge/save deterministic JSON datasets, and build frame-ordered zone-count timelines for live panel projection
   - Dev default adds no external dependency and no paid inference path; the browser worker emits runtime-local heuristic annotations while model adapters remain runtime-owned behind the `Annotation_Worker` boundary
9. Memory layer tools
   - `agentic-graph.memory.write`, `agentic-graph.memory.compact`, `agentic-graph.memory.search`, `agentic-graph.session.search`, and `agentic-graph.user.profile` implement the bounded Agentic Canvas OS persistent-memory contract
   - Mutations require an exact tenant/workspace/agent/subject scope, source evidence, an expected scope-local revision, a durable idempotency key, and a short-lived HMAC authorization bound by the host to the exact tool and request
   - `agentic-graph.memory.invoke` executes only an exact revision-fenced `/`, `#`, and `@` tuple resolved from the canonical Agentic Canvas OS dictionaries; the existing docs resolver remains metadata-only
   - The local deterministic store lives outside the Git checkout under the host state directory, shards revisions and quotas by exact scope, uses a filesystem ownership lock plus atomic fsync/rename commits, rejects symlink escapes, and returns no machine path
   - Search is exact-scope, bounded, cited, zero-model, and revision-addressable so an agent can retain a frozen session-start view while later writes remain durable; an authorized remove hard-redacts the entry, lifecycle content, old receipts, and historical snapshots
   - User profiles accept only explicit allowlisted interaction preferences such as `response_length=concise` or `language=en-SG`; arbitrary prose, sensitive categories, inference, and profile writes through `agentic-graph.memory.write` fail closed
   - `agentic-graph.memory.add` remains the legacy provider-neutral harness adapter; callers should use `agentic-graph.memory.write` for fenced persistent agent memory
   - `agentic-graph.memory.assemble_prompt` injects ranked memory results into a bounded `## Relevant Context` system-message section
   - Persistent-memory state can be isolated with `AGENTIC_OS_MEMORY_STATE_DIR` and `AGENTIC_OS_MEMORY_NAMESPACE`; set a host-only `AGENTIC_OS_MEMORY_APPROVAL_HMAC_KEY` of at least 32 bytes and mint exact-request tokens with `mintPersistentMemoryAuthorization` without exposing the key to an agent; legacy harness storage remains separately configured by `AGENTIC_OS_MEMORY_STORE_PATH`
10. Probe-tree tools
   - `agentic-graph.probe.generate` recalls scoped resolved-path exemplars and returns 2-4 typed candidate next questions without mutating the current node; `token_budget` is enforced before a local model call, trimming recalled exemplars first, and `recall_top_k: 0` disables recall explicitly. If fewer than 2 query-relevant local-model cards survive, the tool fails closed with `insufficient_user_input_context` instead of restating the source query, synthesizing generic wrapper cards, or converting named entities into templates
   - The same tool result includes `response.structuredContent` with a source Widget, bounded cards, and a Rich Media branch ledger. A literal stdio MCP result can therefore reuse FloatingPanel Chat -> workspace AGENTIC_OS -> Canvas apply directly; no MCP-only graph persistence path is added
   - `agentic-graph.probe.select` persists a user-selected option as a fresh `type: probe` markdown node with an embedded `branches-to` edge and checkpoint fork metadata under `data/probe-tree`, and returns a local-zero `cost_log`
   - `agentic-graph.probe.select` output is frontmatter-flow parseable, so the existing canvas/sync parser can project the new `type: probe` node and `branches-to` edge without a probe-specific renderer
   - `agentic-graph.probe.evolve` scores a resolved branch path and writes one reusable exemplar through the existing memory layer; incomplete parent paths are surfaced unless `allow_partial_path` is explicitly set, and local-zero economics are returned in `cost_log`
   - `agentic-graph.probe.generate` can call a host-owned local Ollama runtime when `AGENTIC_OS_PROBE_TREE_MODEL` is set; it uses non-streaming structured JSON output and rejects source-query restatements, copied entity lists, and canned relationship/evidence/dependency/decision-order templates. When the adapter is unconfigured or fails, the no-model path returns a degraded failure and never synthesizes clarification axes
   - `agentic-graph.probe.select` and `agentic-graph.probe.evolve` are advertised as non-idempotent process tools because retries can create a fresh selected branch or rewrite score timestamps/memory-store metadata
   - The local runtime keeps markdown as the graph SSOT; native LangGraph checkpoint persistence remains a follow-on adapter path rather than a second datastore
11. AI Showrunner tools
   - `agentic-graph.showrunner.start_run` validates a Creative_Brief and starts a bounded dry-run or approval-gated Pipeline_Run
   - `agentic-graph.showrunner.run_status` reads lifecycle state without mutating Creative_State
   - `agentic-graph.showrunner.post_choice`, `agentic-graph.showrunner.submit_critique`, and `agentic-graph.showrunner.approve_stage` route explicit user/operator events through the showrunner message bus
   - `agentic-graph.showrunner.get_artifact` returns a Source_File path for an existing run artifact without triggering new turns
12. Agent sandbox policy tools
   - `agentic-graph.sandbox.policy.validate` compiles a policy source inside `AGENTIC_OS_ROOT`, rejects unknown fields and permissive network defaults, and returns a stable policy digest plus enforcement status
   - `agentic-graph.sandbox.policy.authorize` returns one redacted allow or deny preflight decision without reading credentials, running a process, touching the filesystem target, or opening a network connection
   - The native default policy at `config/agent-sandbox-policy.yaml` denies every operation. This decision layer does not claim OS/kernel or container containment.
13. `agentic-graph.os.status`
   - Returns zero-token Agentic OS views for process state, capability catalogs, cost summary, approval gates, and circuit breakers
   - Optional remote MCP catalog discovery reports unavailable endpoints as status data rather than blocking local stdio readiness
14. `agentic-graph.vdeoxpln.list`
   - Reads the canonical agentic-graph vdeoxpln registry from `canvas/src/features/agent-ready/agentic-graph-vdeoxpln-contract.mjs`
   - Typical use: inspect vdeoxpln ids, semantic keys, source owners, local MCP/WebMCP/Pages tool projections, publish scopes, validation commands, optional generated `SKILL.md`-style Markdown, and a neutral intent/state routing plan
   - Routing ignores route names, file names, absolute paths, and URLs. Mutating browser-local vdeoxpln workflows still run through the existing MainPanel -> FloatingPanel Chat -> Workspace FS -> Source Files -> AGENTIC_OS -> Canvas path, with a source-backed run manifest persisted beside AGENTIC_OS workspace output.
15. `export.publish`
   - Reads one bounded repository-relative Markdown artifact with required YAML `title` frontmatter, then publishes `kind="spreadsheet"` or `kind="slides"` through the local Node MCP runtime.
   - `target_provider` defaults to `google`. The default route attempts Google once and may attempt Microsoft once only when fallback is enabled, Microsoft is configured, and the Google failure is explicitly retryable/transient. Explicit `target_provider="microsoft"` attempts Microsoft only and does not set `fallback_used`.
   - Google creates or updates a native Sheet or Slides presentation through the Drive, Sheets, and Slides APIs. Personal accounts require human OAuth; service-account mode is accepted only with an impersonated Workspace user or an explicit shared-drive folder.
   - Microsoft converts bounded Markdown to deterministic native `.xlsx` or `.pptx` OOXML and uploads or replaces the file through Microsoft Graph `/me/drive`. It does not assume a Graph PowerPoint editor or workbook-creation API.
   - Identity is exactly `(artifact_id, provider, kind)`. The verified hash-chained `FLEET.md` ledger resolves the latest successful provider ID so a repeat call updates the same object.
   - The path verifies the source SHA-256 before and after publication, bounds complete HTTPS responses, sanitizes provider failures, cleans up a newly created partial object when possible, and fails closed on corrupt identity/ledger state. Repeats reuse one external ID but may overwrite content, create a provider revision, and append a ledger row, so MCP annotations declare destructive/non-idempotent open-world mutation. There is no same-provider retry and no model call.
   - The deterministic and mocked-provider paths are implemented. A real Google/Microsoft account run and the Google 5-second p95 objective remain unproven until operator credentials and bounded live receipts exist; see `docs/documents/agentic-graph-docs-sheets-slides-runtime-readiness.md`.

All shipped local read-only Source Files tools declare no-auth `securitySchemes`. The UI-linked `agentic-graph.vdeoxpln.list` tool also mirrors that scheme in `_meta.securitySchemes`, links `_meta.ui.resourceUri` to `ui://agentic-graph/agent-ready`, and sets `_meta["openai/widgetAccessible"]` so Apps-capable hosts can let the resource call back through the MCP tool bridge. Resource templates are served through the standard MCP `resources` capability; agentic-graph does not define a custom resource-template capability.

## What this README does not claim

This local README does **not** claim that the following are implemented in `mcp/server.js`:

- remote HTTP MCP transport for the local stdio tool set
- deployed mutating graph or pipeline tools on Cloudflare Pages
- a server-side D1 shadow graph for the browser canvas pipeline
- a second MCP-only graph materialization path outside the current FloatingPanel Chat ->
  YAML frontmatter -> Canvas apply flow
- embeddings, a vector store, model-backed graph extraction/query, or a network parser for the deterministic knowledge-graph tools
- compatibility, conformance, integration, execution, or dependency on another parser-generator or graph runtime
- live Google or Microsoft account readiness, recipient sharing permissions, or provider latency from local/mock tests alone
- a Prod, Pages, Worker, or Cloudflare export route; `export.publish` is local stdio functionality

The current browser-local E2E path remains:

- MainPanel `mcp` / `integrations`
- shared settings and chat readiness
- FloatingPanel Chat submit helpers
- vdeoxpln routing prompt from the canonical registry
- AGENTIC_OS recovery and validation
- Workspace FS vdeoxpln run manifest and Source Files materialization
- `applyChatAgenticOsWorkspaceDocumentToCanvas()`
- `setActiveMarkdownDocument({ applyToGraph: true })`
- frontmatter-flow parsing and downstream subgraph/group projection

## Install (external users)

From the repo root:

```bash
# 1) Python deps (required)
python3.11 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -r requirements.txt

# 2) Node workspace deps and shared Office runtime used by export.publish
npm install
npm run smoke:prepare
```

## Run locally (smoke test)

```bash
AGENTIC_OS_ROOT="$(pwd)" AGENTIC_OS_PYTHON="./.venv/bin/python" node ./mcp/server.js
```

The export ledger is committed as an empty template. Verify its hash chain or
inspect entries without editing machine records by hand:

```bash
node ./scripts/fleet.js verify
node ./scripts/fleet.js list
```

Credential-gated publication and bounded two-pass real-account verification are
available from the repository root:

```bash
npm run export:publish -- \
  --artifact docs/documents/agentic-graph-docs-sheets-slides-prd-tad.md \
  --kind spreadsheet \
  --provider google \
  --json

npm run export:verify:live -- \
  --artifact docs/documents/agentic-graph-docs-sheets-slides-prd-tad.md \
  --providers google,microsoft \
  --kinds spreadsheet,slides
```

The live verifier creates each requested provider/kind identity and updates it
once, proves stable IDs and source SHA-256, and emits an isolated-ledger receipt.
It first requires one clean exact Git SHA and exits blocked before artifact,
ledger, or provider calls when the tree is dirty or credentials are missing. An
exit-0 receipt still requires account-native open verification; two
timings per identity do not establish the 5-second p95 objective.

For a real-account acceptance run, point the same ledger implementation at a
private temporary path so provider IDs and account-specific URLs are not written
to the repository:

```bash
AGENTIC_OS_EXPORT_FLEET_PATH=/ABS/PRIVATE/PATH/agentic-graph-export-proof.md \
  node ./mcp/server.js
```

## Configure in an MCP client (stdio)

### Claude Desktop / Cursor

Add a server entry similar to:

```json
{
  "mcpServers": {
    "agentic-graph": {
      "command": "node",
      "args": ["/ABS/PATH/TO/agentic-graph/mcp/server.js"],
      "env": {
        "AGENTIC_OS_ROOT": "/ABS/PATH/TO/agentic-graph",
        "AGENTIC_OS_PYTHON": "/ABS/PATH/TO/PYTHON",
        "AGENTIC_OS_MCP_TIMEOUT_MS": "600000"
      }
    }
  }
}
```

Optional tool-specific host env remains server-owned, for example `AGENTIC_OS_MEMORY_STORE_PATH`,
`AGENTIC_OS_BROWSER_API_RUNTIME_URL`, `AGENTIC_OS_PROBE_TREE_MODEL`, and
`AGENTIC_OS_PROBE_TREE_MODEL_URL`.

### Docs/Sheets/Slides export configuration

Do not place credential values in this README, MCP client JSON committed to Git,
AGENTIC_OS frontmatter, or `FLEET.md`.

Google accepts one of these host-owned modes:

- direct human OAuth token: `AGENTIC_OS_GOOGLE_ACCESS_TOKEN`
- human OAuth refresh: `AGENTIC_OS_GOOGLE_CLIENT_ID`,
  `AGENTIC_OS_GOOGLE_CLIENT_SECRET`, and `AGENTIC_OS_GOOGLE_REFRESH_TOKEN`
- service account: `AGENTIC_OS_GOOGLE_SERVICE_ACCOUNT_JSON` plus either
  `AGENTIC_OS_GOOGLE_IMPERSONATED_USER` or
  `AGENTIC_OS_GOOGLE_SHARED_DRIVE_FOLDER_ID`

`AGENTIC_OS_GOOGLE_DRIVE_FOLDER_ID` may also constrain human OAuth output to a
writable Drive folder. It does not enable service-account mode. A bare
service-account JSON value is intentionally not treated as configured for
personal My Drive publication.

Microsoft personal-account publication accepts either:

- `AGENTIC_OS_MICROSOFT_ACCESS_TOKEN`; or
- `AGENTIC_OS_MICROSOFT_CLIENT_ID` and
  `AGENTIC_OS_MICROSOFT_REFRESH_TOKEN`, with optional
  `AGENTIC_OS_MICROSOFT_CLIENT_SECRET`

Optional Microsoft settings are `AGENTIC_OS_MICROSOFT_TENANT` (defaults to
`consumers`), `AGENTIC_OS_MICROSOFT_SCOPE` (defaults to
`offline_access Files.ReadWrite`), and
`AGENTIC_OS_MICROSOFT_ONEDRIVE_FOLDER`.

Microsoft refresh-token rotation replaces the supplied runtime environment
value and supports an injected persistence callback. The MCP host remains
responsible for durable secret storage and for injecting the latest token after
restart; no rotated token is printed or written to Git.

Cross-provider/runtime settings are:

- `AGENTIC_OS_EXPORT_MICROSOFT_FALLBACK_ENABLED` — defaults to enabled; set to
  `false`, `off`, or `0` to disable Google-to-Microsoft fallback
- `AGENTIC_OS_EXPORT_FLEET_PATH` — optional absolute path for an isolated ledger
- `AGENTIC_OS_ROOT` — repository root used for bounded artifact resolution

Then you can call:

- `agentic-graph.knowledge_graph.ingest`, or `/agentic.graph.ingest #agentic-graph #mcp #runtime-ready @working-directory @agentic-graph @operator @runtime-proof`, using the input schema advertised by the local server
- `agentic-graph.knowledge_graph.query`, or `/agentic.graph.query #agentic-graph #mcp #vcc @agentic-graph @runtime-proof`, using the input schema advertised by the local server
- `agentic-graph.knowledge_graph.explain_edge`, or `/agentic.graph.explain #agentic-graph #mcp #vcc @agentic-graph @runtime-proof`, using the input schema advertised by the local server
- `search` with `{ "query": "renderer architecture", "limit": 10 }`
- `fetch` with `{ "id": "kgdoc::docs%2Fexample.md" }`
- `agentic-graph.ui.launch` with `{ "target": "workspaceEditor" }` (or `canvas` / `geospatial`)
- `agentic-graph.pipeline` with `{ "mode": "pipeline", "inputPath": "data/outputs/graph.json", "outputDir": "data/outputs" }`
- `agentic-graph.graphrag_pipeline` with `{ "inputDir": "data/raw", "outDir": "data/graphrag" }`
- `agentic-graph.superagent.run` with `{ "inputPath": "docs/documents/my-input.md", "outputDir": "data/outputs/superagent-neutral-example", "runId": "superagent-neutral-example", "providerMode": "mock" }`
- `sealion.detect_language_variant` with `{ "text": "Saya nak buat onboarding agent untuk pengguna Singapura." }`
- `agentic-graph.probe.generate` with `{ "thread_root_id": "support-intake", "current_node_id": "root", "context_text": "User needs help but has not stated constraints", "k": 3, "recall_top_k": 0, "token_budget": 1200 }`
- `agentic-graph.probe.select` with `{ "thread_root_id": "support-intake", "parent_node_id": "root", "chosen_option": { "id": "o1", "text": "Which constraint matters most right now?", "rationale": "Narrow the branch before handoff" } }`
- `agentic-graph.probe.evolve` with `{ "thread_root_id": "support-intake", "terminal_node_id": "probe_node_...", "rating": 1 }`
- `agentic-graph.video_remix.run` with `{ "mode": "live", "referenceUrl": "https://example.com/reference-video", "brief": "Remix this into a sellable launch teaser", "budgetUsd": 20 }`
- `agentic-graph.video_remix.run` with `{ "mode": "live", "referenceUrl": "https://example.com/reference-video", "brief": "Remix this into a sellable launch teaser", "approvals": ["paid-model-call", "render-action", "payment-action", "cloud-deploy"], "sourceCards": [{ "url": "https://example.com/a" }, { "url": "https://example.com/b" }, { "url": "https://example.com/c" }] }`
- `agentic-graph.browser_api.run` with `{ "operation": "resolve", "targetUrl": "<TARGET_URL>", "intent": "find the current account profile JSON endpoint" }`
- `agentic-graph.browser_api.run` with `{ "operation": "execute", "skillId": "resolved-skill-id", "payload": {}, "dryRun": true, "confirmUnsafe": false, "confirmThirdPartyTerms": false }`
- `agentic-graph.browser_api.run` with `{ "operation": "cookieImport", "targetUrl": "<TARGET_URL>", "dryRun": false, "confirmCookieImport": true, "confirmUnsafe": true, "confirmThirdPartyTerms": true }`
- `agentic-graph.browser_api.run` with `{ "operation": "click", "sessionId": "session-id", "selector": "#submit", "dryRun": false, "confirmUnsafe": true }`
- `agentic-graph.memory.add` with `{ "text": "Prefer local-first memory and operator-gated deploys.", "user_id": "runtime-user-id", "metadata": { "memory_key": "deployment-boundary" } }`
- `agentic-graph.memory.search` with `{ "scope": { "tenant_id": "tenant-id", "workspace_id": "workspace-id", "agent_id": "agent-id", "subject_id": "subject-id" }, "query": "Should deploys happen automatically?", "limit": 3 }`
- `agentic-graph.memory.assemble_prompt` with `{ "base_system_message": "Answer directly.", "memories": [{ "id": "memory-id", "memory": "Prefer local-first memory.", "score": 1, "created_at": "2026-06-13T00:00:00.000Z" }], "max_memory_tokens": 80 }`
- `agentic-graph.showrunner.start_run` with `{ "brief_markdown": "---\\ncontract: agentic-graph-showrunner-brief/v1\\n---\\n# Brief\\nDry-run a branching podcast pilot.", "dry_run": true }`
- `agentic-graph.os.status` with `{ "view": "capabilities" }`
- `agentic-graph.vdeoxpln.list` with `{ "includeMarkdown": true }`
- `agentic-graph.voice.studio` dry-run clone with `{ "schemaVersion": "agentic-graph-voice-studio-request/v1", "operation": "clone", "mode": "dry-run", "requestId": "voice-clone-request", "idempotencyKey": "voice-clone-0001", "approvalReceiptId": "approval-clone-0001", "costPolicy": { "currency": "USD", "maxActualCostUsd": 0, "maxProviderCalls": 0, "maxNetworkCalls": 0 }, "limits": { "maxDurationMs": 300000, "maxBytes": 100000000, "maxTextCharacters": 20000, "timeoutMs": 120000 }, "sourceAudio": { "artifactId": "sample-1", "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "mediaType": "audio/webm", "bytes": 1024, "durationMs": 20000 }, "speakerAuthorization": { "consentReceiptId": "consent-owner-0001", "rightsReceiptId": "rights-owner-0001", "permittedUses": ["private studio creation"], "disclosureRequired": true, "retentionPolicy": "session-only" }, "profileIntent": { "profileId": "owner-voice", "displayName": "Owner voice" } }`
- `export.publish` with `{ "artifact_id": "docs/documents/example-financial-plan.md", "kind": "spreadsheet" }`
- `export.publish` with `{ "artifact_id": "docs/documents/example-deck.md", "kind": "slides", "target_provider": "microsoft" }`

## AI Voice Studio

`agentic-graph.voice.studio` is one local stdio facade for `clone`, `dictate`, and
`create`. Its canonical token routes are:

- `/voice.studio #voice-clone @audio @voice-profile @approval-gate @cost-log @runtime-proof`
- `/voice.studio #speech-to-text @audio @text @approval-gate @cost-log @runtime-proof`
- `/voice.studio #text-to-speech @text @voice-profile @audio @approval-gate @cost-log @runtime-proof`

Dry-run is deterministic, idempotent, and zero-call. It returns a profile
manifest or an honest operation plan without claiming that a provider artifact
exists. Live mode requires separate host-owned exact-request approval,
voice-rights, immutable-source resolution, a zero-spend estimate/execution
adapter, an independent settled-cost verifier, and output read-back owners.
Approval binds the exact USD cost and provider/network-call ceilings. A
verified estimate over any ceiling blocks before dispatch; a verified settled
overage is terminal and reconciliation-required.
Exact concurrent retries share one in-flight effect; changed requests under the
same idempotency key conflict. Cancellation after external dispatch requires
reconciliation and reports incomplete cost. The canonical stdio server injects
none of these live owners and is provider-unconfigured, so canonical live
requests fail closed before provider egress.

The browser Media panel adds an AI Voice Studio mode for session-only,
metadata-only profile manifests; recording-rights-gated, duration/byte-bounded,
visible/stoppable microphone capture; browser-managed speech recognition that
is off until a separate explicit opt-in; and an explicitly requested disclosed
system-voice preview. Profile manifests remain only in React state—there is no
voice-specific localStorage registry—and sample/capture bytes are not durably
stored. Stop, workflow changes, and unmount teardown stop tracks and
recognition, cancel speech, clear timers, and revoke object URLs.

This is `runtime-ready-dev` only for a reviewed embedding host that injects and
tests the live owners. It does not claim a configured provider, provider-backed
cloning, speaker similarity or output quality, Prod, remote Worker parity, or
Cloudflare readiness. See
`docs/documents/agentic-graph-ai-voice-studio-prd-tad.md` and run
`npm run voice-studio:check`.

## Relationship to MainPanel MCP

MainPanel `mcp` can show readiness and configuration snippets for external MCP surfaces such as:

- agentic-graph Tool Servers for external users connecting an agent to tools inside agentic-graph through local stdio (`mcp/server.js`) or read-only Pages HTTP (`search` / `fetch`) placeholders
- External MCP Tool Servers with provider-neutral stdio and Streamable HTTP templates, host-owned secrets, session-scoped allowlists, zero-token discovery, and planned deferred bridge targets such as `agentic-graph.tool.search` / `agentic-graph.tool.describe` / `agentic-graph.tool.call`
- Stripe MCP readiness
- crawler access MCP readiness
- direct API-native browser MCP snippets

That MainPanel documentation layer does **not** replace this local stdio server. Instead:

- MainPanel readiness docs explain how to connect supported MCP surfaces
- documented bridge ids remain setup contracts until a runtime owner actually registers them
- this README explains how to run the local `mcp/server.js` server itself
- the richer browser-local Chat -> AGENTIC_OS -> Canvas pipeline stays owned by the canvas chat and parser
  helpers, not by a duplicate MCP-only pipeline

For the canonical readiness rubric and release gate, see
`docs/documents/agentic-graph-mainpanel-readiness-rubric.md`.

### Direct API-native browser MCP config

If an agent should connect to the browser runtime MCP directly instead of going through agentic-graph, MainPanel MCP also exposes a direct `mcpServers` snippet shaped like:

```json
{
  "mcpServers": {
    "api-native-browser": {
      "command": "npx",
      "args": ["-y", "unbrowse", "mcp"],
      "env": {
        "UNBROWSE_URL": "http://localhost:6969"
      }
    }
  }
}
```

## Security / sandboxing

By default, tool path arguments are restricted to **inside `AGENTIC_OS_ROOT`**. This prevents accidental reads/writes outside the repo.

For the deterministic knowledge-graph surface, root containment is only the first bound:

- canonicalized source paths and resolved symlink targets must remain inside the configured root
- indexed files are parsed as data and are never executed
- traversal and returned evidence remain bounded; a limit produces an explicit incomplete/unsupported diagnostic rather than an apparently complete answer
- configuration structure may be indexed, but secret values must not be returned as graph evidence
- source-controlled labels and evidence are sanitized before MCP output
- unsupported parsers, file forms, PDF content, and graph relationships fail honestly without model, network, embedding, vector-store, or guessed-edge fallback

If you truly need to allow external paths, set:

```bash
AGENTIC_OS_ALLOW_EXTERNAL_PATHS=1
```
