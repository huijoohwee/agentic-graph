# Reference implementation: agentic-graph

**The frontmatter is the program. Git is the audit trail. Projections do not replace the source.**

agentic-graph is a markdown file that runs. Its YAML frontmatter is a typed widget graph — nodes are **widgets** (input, compute, rich-media panels), edges are typed **sockets** — and that same file is the thing an LLM/MCP agent (or a human) can **run, gate, persist, and replay**. The Git-backed `.md` file is the authored graph, audit trail, and runnable program. Browser stores, shared indexes, media objects, and collaboration rooms support that source without becoming a hidden replacement for it.

The same file is three things at once:

- a **human-readable Markdown doc** (read it in any editor or on the web),
- a **typed widget graph** (`kgc-computing-flow/v1` frontmatter — nodes, edges, sockets, run actions), and
- a **runnable agent program** (compute nodes, approval gates, budget meters, and media outputs that an LLM/MCP agent can execute end to end).

agentic-graph is provider-neutral and project-agnostic: it operates on a brief, canvas graph, tool schema, or media provider without making that adapter the source owner. The narrower claim is that authored graph/program state lives in the Markdown/frontmatter document; runtime projections and supporting stores remain explicit.

## Why agentic-graph exists

Most agent frameworks separate "the agent's memory" from "the knowledge the human actually owns." That split creates two problems:

- **Vendor lock-in on state**: an agent's reasoning trail lives in a proprietary checkpointer or scene format you can't easily inspect, diff, or version.
- **Knowledge that agents can't operate on**: docs, notes, and diagrams sit in formats agents can read but not meaningfully edit, run, or extend.

agentic-graph closes that gap with **KGC (Knowledge Graph Canvas) markdown** — computing-flow-style KTV (`{key, type, value}`) frontmatter rows for graph-level fields, nodes, and widget metadata, with `flow.edges[]` as explicit, source-owned socket links. A plain markdown file *is* the graph, the audit trail, the human-readable doc, and the runnable program, all at once. Git is the provenance layer, for free.

> If you've used LangGraph, AutoGPT, or a Notion/Obsidian-style knowledge base and wished they were the same system — this is aimed at that gap.

## Where agentic-graph sits

Infinite-canvas and agent tools split roughly into a few tiers today:

- **Drawing surfaces** — Excalidraw, tldraw, FigJam. The canvas stores shapes and strokes; it doesn't understand them.
- **Collaboration surfaces adding agents** — Miro's 2026 Canvas update is the most direct validation that this space is real: it added Mermaid/Markdown/HTML widget formats specifically so agents can write to the board "natively," plus MCP support to pull Markdown from a codebase onto the canvas and push decisions back. Markdown is still an *import/export format* for a proprietary, cloud-hosted board underneath — not the board's source of truth.
- **Knowledge surfaces** — Obsidian Canvas and similar. Cards are real notes, but the canvas layout (JSON Canvas) is a sidecar file separate from the notes themselves.
- **Thinking surfaces** — Storyflow-style tools, where an AI reads the whole board as context. Closer to agentic-graph in spirit, but cloud-hosted with proprietary storage.
- **Orchestration libraries** — LangGraph. No canvas at all; state lives in a checkpointer, not a plain file.
- **Self-improving agent runtimes** — Hermes Agent (Nous Research). No canvas at all either, but a genuinely self-evolving skill loop — the real version of a claim easy to overstate elsewhere.

**agentic-graph's difference is structural, not cosmetic**: the `.md` file owns authored node/edge data and provenance. Parsed graph state, renderer layout, browser persistence, hosted indexes, binary objects, and collaboration state have explicit supporting roles. Making Markdown/frontmatter the authored source—rather than a lossy export—is the architectural bet.

| | agentic-graph | Miro Canvas (2026) | Excalidraw / tldraw | Obsidian Canvas | Storyflow-style thinking canvas | LangGraph (raw) | Hermes Agent (Nous Research) |
|---|---|---|---|---|---|---|---|
| **Primary category** | Runnable knowledge-graph canvas | Commercial collaboration whiteboard | Drawing/sketching surface | Personal-knowledge canvas plugin | Cloud "thinking surface" canvas | Agent orchestration library | Self-improving personal agent runtime |
| **Canvas/graph surface** | ✅ native, typed widget graph | ✅ primary product (agent-generated widgets) | ✅ primary (shapes/strokes only) | ✅ JSON Canvas sidecar | ✅ AI reads board as structured cards | Partial (Studio debug/trace view, not authoring) | ❌ none (chat/messaging + dashboard) |
| **Markdown/frontmatter is authored graph/program state** | ✅ | ❌ (import/export only) | ❌ (JSON canvas format) | Partial (notes yes; layout is a separate sidecar) | ❌ (cloud/proprietary) | ❌ (checkpointer) | ❌ (its own skills/memory store) |
| **State is git-diffable** | ✅ | ❌ | ❌ | Partial (notes only) | ❌ | ❌ | ❌ |
| **Nodes/widgets are runnable** (compute, gate, persist, replay) | ✅ | ❌ | ❌ | ❌ | Partial | ✅ (state only, no canvas) | N/A (task loop, no graph nodes) |
| **Orchestration model** | Native typed runtimes and bounded harnesses over KGC Markdown | None (human-driven) | None | None | AI reasons over board context | Multi-node `StateGraph` — the library's core value prop | Single agent loop + skill retrieval |
| **Genuinely self-evolving?** | **No** — scoped; `probe.evolve` evolves one conversation branch, not the agent's own code | No | No | No | No | No | **Yes** — real skill-creation/refinement loop, its core differentiator |
| **License / openness** | FOSS, provider-neutral, project-agnostic | Proprietary, cloud SaaS | FOSS (Excalidraw MIT; tldraw core FOSS) | Core proprietary; Canvas format is open JSON Canvas spec | Proprietary | MIT/Apache (LangChain org) | MIT, self-hosted |
| **Deployment model** | Local-first source; local stdio plus separate public-read, browser-local, and control-plane implementations; delivery requires its own evidence | Cloud SaaS | Self-hostable / embeddable SDK | Local-first desktop app | Cloud-only | Embedded library in your own app/infra | Self-hosted, multi-platform messaging gateway |
| **Best fit** | The document itself should be the agent-runnable, git-versioned program | Your team already collaborates in Miro and wants agents to read/write boards | You want a polished freehand whiteboard/sketching UX | You keep a personal knowledge base and want simple visual note-linking | You want an AI-native thinking board and don't mind cloud lock-in | You're building custom multi-step orchestration and own the state layer yourself | You want a persistent personal agent that improves at repeated tasks over time |

**The honest tradeoff:** Miro, Excalidraw, and tldraw have years of polish on collaboration and drawing UX that agentic-graph doesn't try to compete with. What agentic-graph optimizes for is the layer underneath — a graph an agent can actually own, run, and version for free in a tool already on every machine: git.

**Why Hermes Agent is on this list despite having no canvas:** it makes the boundary concrete. agentic-graph does not claim a self-modifying agent kernel; it focuses on a canvas/graph authored as Markdown. An external agent runtime can integrate through the same typed source and tool boundaries without becoming agentic-graph's core executor.

## What "self-runnable agentic widget canvas" means

- **Markdown-native.** The source of truth is a Markdown file. Its YAML frontmatter declares the flow (`flow.nodes[]`, `flow.edges[]`, `socket_types`, `modelSelection`) with computing-flow-style KTV rows so the document is parseable, diffable, and version-control friendly — no proprietary binary scene format.
- **Widget canvas.** Nodes are typed widgets — `InputWidget`, `ComputeWidget`, `RichMediaPanel` (text, image, video) — laid out on a balanced, mobile-first canvas with readable, socket-typed edges.
- **Self-runnable.** Compute widgets carry a `canvas:runAction` (pure, inspectable functions) so a node can run from a button, a chat instruction, an MCP tool call, or a CLI/Codex entrypoint and write its outputs back into the same document.
- **Storyboard-projectable.** A frontmatter-owned 2D Storyboard can use source, ideation, invocation, projection, validation, and deploy-guard nodes to create cards, reusable elements, rich-media panels, and timeline lanes without hardcoded provider artifacts.
- **Agent-native.** Agents reach the canvas through local stdio MCP (`mcp/server.js`), read-only Pages HTTP MCP where deployed, Browser WebMCP, FloatingPanel Chat, or parser CLI/Codex entrypoints. Model or media calls are host-owned runtime decisions; paid, mutating, browser-auth, terminal, filesystem, egress, and deploy actions stay approval-gated.
- **Gated, persisted, replayable.** Runs are dry-run first; live spend halts at the first unapproved gate with zero paid actions. Outputs persist through the active Source Files, workspace, local artifact, or Cloudflare storage owner for the current lane.

## The runnable document model

A agentic-graph document's frontmatter flow is the program. Minimal shape:

```yaml
---
schema: "kgc-computing-flow/v1"
kgCanvas2dRenderer: "storyboard"
socket_types:
  idea_signal: {color: "#14b8a6", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [idea_signal]}
  artifact_signal: {color: "#8b5cf6", edgeWidthPx: 3, handleStrokeWidthPx: 3, accepts: [artifact_signal]}
flow:
  direction: {key: direction, type: string, value: "LR"}
  edgeType: {key: edgeType, type: string, value: "smoothstep"}
  balancedViewportPreset: {key: balancedViewportPreset, type: string, value: "widgetFrontmatter"}
  computed: {key: computed, type: boolean, value: true}
  snapToGrid: {key: snapToGrid, type: boolean, value: true}
  nodes:
    - id: {key: id, type: string, value: "source_input"}
      type: {key: type, type: string, value: "InputWidget"}
      label: {key: label, type: string, value: "Source Input"}
      handles: {key: handles, type: object, value: {"source":["idea"]}}
      "flow:portTypes": {key: "flow:portTypes", type: object, value: {"out":{"idea":"idea_signal"}}}
    - id: {key: id, type: string, value: "compute_summary"}
      type: {key: type, type: string, value: "ComputeWidget"}
      label: {key: label, type: string, value: "Compute Summary"}
      handles: {key: handles, type: object, value: {"target":["idea"],"source":["artifact"]}}
      "flow:portTypes": {key: "flow:portTypes", type: object, value: {"in":{"idea":"idea_signal"},"out":{"artifact":"artifact_signal"}}}
  edges:
    - {"id":"edge_source_to_compute","source":"source_input","sourceHandle":"idea","target":"compute_summary","targetHandle":"idea","type":"idea_signal"}
---

# Body markdown renders alongside the canvas.
```

- **Nodes** carry KTV fields, typed handles, a `canvas:widgetCard` (preview + actions), and, for compute nodes, a `canvas:runAction` describing inputs, outputs, and side effects.
- **Edges** connect source/target handles with a declared `socket_type`, so the canvas can validate and route connections.
- **Run** a compute node and its outputs (text, image, video, dashboards) flow to the connected `RichMediaPanel` widgets and persist to storage.
- **Project** a 2D Storyboard from frontmatter using the shared renderer contract: `flow.nodes[]` and `flow.edges[]` stay the source-owned SSOT, while Cards, Widgets, Rich Media Panels, BottomPanel Timeline, Gantt, and flowchart views render as projections.

## How it's built

A few terms get thrown around loosely in this space. Here's what agentic-graph specifically means by each, tied to an actual artifact — not as a headline claim, but as evidence:

- **Harness** — the offline SuperAgent path is dry-run first; blocked live spend halts at the approval gate. Its run artifacts include `harness-proof.json`, `state.json`, and `trace.jsonl`; other harnesses keep their own typed contracts and do not inherit those artifact names.
- **Orchestration** — native bounded runtimes own probe-tree, SuperAgent, Agent Team, implementation-run, and video-remix behavior. They are distinct harnesses with typed state and limits; no LangGraph or DeerFlow runtime package is the core executor.
- **SuperAgent** — a specific local CLI/stdio capability, not a claim about the whole system. Any SuperAgent-scoped demo is explicitly labeled as scoped.

What agentic-graph does **not** claim: this is not a self-modifying or self-improving system. `probe.evolve` evolves a conversation branch within probe-tree — it does not rewrite the agent's own code or capabilities. If a claim needs a footnote to walk it back, it doesn't belong here; the scoping above is the whole claim, not a preview of a bigger one.

## Agentic Canvas OS

agentic-graph is the Dev source for an **Agentic Canvas OS**: a local-first control plane where Markdown, KTV YAML frontmatter, Source Files, Canvas, chat, and MCP expose the same typed runtime state. The sibling `agentic-canvas-os/docs` tree is the current documentation control surface for this OS contract, defining the shared `/`, `#`, and `@` invocation dictionaries, runtime-readiness gates, MCP gateway rules, harness contracts, KTV computing-flow shape, and proof ledger.

The runtime direction:

- command routes describe bounded actions, semantic tags scope intent/proof/cost, and bindings name the selected source or runtime surface;
- exact route identities and typed arguments live only in their owning Invocation Registers;
- the deterministic knowledge-graph lane resolves ACOS-owned `/`, `#`, and `@` tuples to explicit local stdio tool calls; dictionary lookup remains metadata-only.
- MainPanel MCP shows readiness and non-secret setup metadata. It does not execute tools or store credentials in browser settings.
- MainPanel readiness claims name the source owner and keep local and delivered ladder rungs
  separate; documentation, browser snapshots, and executable owners do not collapse into one label.
- FloatingPanel Chat and KGC keep source-backed runtime materialization on the existing Markdown → KTV frontmatter → Canvas path.
- Local MCP, Pages HTTP MCP, Browser WebMCP, and approved Cloudflare control-plane owners are separate surfaces with explicit transport boundaries.

This README describes the Dev repo. `agentic-canvas-os/docs` remains the documentation control surface. Production is not triggered by an ordinary `main` push: `.github/workflows/release.yml` requires an exact reviewed `main` SHA, a localhost-review candidate, manual dispatch, and protected `production` approval.

### Deterministic local knowledge graph

The current local stdio extension adds four direct tool identities: `agentic-graph.knowledge_graph.parser_generate`, `agentic-graph.knowledge_graph.ingest`, `agentic-graph.knowledge_graph.query`, and `agentic-graph.knowledge_graph.explain_edge`. A local MCP client invokes those names directly. The parser generator accepts either `profile: "default-source"` for the digest-pinned built-in local registry or bounded custom descriptors with optional finite declarative grammar data. ACOS-capable hosts use `/agentic.graph.parser.generate #agentic-graph #parser-generation #mcp @parser-specification @runtime-proof`, `/agentic.graph.ingest #agentic-graph #mcp #runtime-ready @working-directory @agentic-graph @operator @runtime-proof`, `/agentic.graph.query #agentic-graph #mcp #vcc @agentic-graph @runtime-proof`, or `/agentic.graph.explain #agentic-graph #mcp #vcc @agentic-graph @runtime-proof` before the explicit mapped tool call.

This path uses registered deterministic AST parsing for supported code and deterministic structural extraction for supported docs, SQL schemas, configs, and PDFs. Queries use lexical matching plus graph traversal, and every returned edge must be explainable from stored source evidence. Unsupported languages, file forms, PDF content, syntax, or relationships produce explicit diagnostics rather than guessed facts. Parsing, query, and edge explanation require no embeddings, vector store, model call, or network service; an explicit repository URL uses a separately bounded network acquisition phase before local parsing.

The authoritative scope, provenance, diagnostics, and security requirements are in the [deterministic knowledge-graph runtime contract](docs/documents/agentic-graph-deterministic-knowledge-graph-runtime.md).

### 2D Renderer: Storyboard template

The canonical neutral Storyboard seed sets `kgCanvasSurfaceMode: "2d"`, `kgCanvasRenderMode: "2d"`, and `kgCanvas2dRenderer: "storyboard"` so a source document can project into Cards, Widgets, Rich Media Panels, and BottomPanel Timeline without moving ownership out of frontmatter.

Its `flow` uses KTV rows for `direction`, `edgeType`, `balancedViewportPreset`, `computed`, `snapToGrid`, every node id/type/label, handles, port types, and runtime invocation fields. `socket_types` owns the allowed edge/port vocabulary, and every `flow.edges[]` entry references a declared socket type.

That template is intentionally local-first:

- runtime outputs start blank until an operator-approved local or live run returns evidence;
- `paid_call_count` starts at `0`;
- `source_url`, provider job ids, stream URLs, generated asset URLs, and runtime proof paths stay operator-supplied or runtime-generated;
- Mirror and Delivery are blocked from local, pull-request, and unprotected Authoring activity; only the manually dispatched protected release owns promotion;
- Storyboard projection is view state only: authored frontmatter and source payloads own data, while visible connectors are projections of `flow.edges`;
- semantic HTML projection should use landmarks such as `main`, `section`, `article`, `header`, `nav`, `aside`, `figure`, `figcaption`, and `table` before falling back to generic layout wrappers.

The template's local runtime lane is source → ideation → invocation → Storyboard projection →
runtime validation → deploy guard. The canonical Invocation Registers own the exact command, tag,
binding, and tool identities; this README does not duplicate them.

## Agent + automation surfaces

| Surface | How an agent uses it |
| --- | --- |
| Local stdio MCP (`mcp/server.js`) | Starts from an external MCP client and exposes agentic-graph-owned local tools: deterministic knowledge-graph ingest/query/edge explanation, Source Files search/fetch, UI launch, pipelines, memory, probe tree, showrunner, OS status, SuperAgent, video remix, browser bridge, HTML video, annotation, exact agent/LLM application catalog-plan-execute composition, and vdeoxpln inspection. |
| MainPanel MCP | Browser-local readiness and non-secret setup view for agentic-graph-owned and external MCP tool servers. |
| FloatingPanel Chat | In-canvas assistant with workspace, selection, invocation grammar, KGC generation, and source-aware context. |
| 2D Renderer: Storyboard | Projects frontmatter-owned source, ideation, invocation, runtime, review, and publish lanes into Cards, Widgets, Rich Media Panels, and timeline views. |
| Browser WebMCP | Browser-local read and inspection tools for Apps/WebMCP-capable hosts. |
| Pages HTTP MCP | Read-only published Source Files `search` / `fetch` surface where deployed. |
| Parser CLI / Codex | Run documents and harnesses headlessly from `agentic_graph_parser` or Codex entrypoints. |
| Cloudflare control plane | Pages, Workers, D1, R2, AI Gateway, and payment/runtime owners when an explicit deploy lane is open. |

## MCP source contracts and readiness

The repository contains separate source owners for local stdio, public-read Pages MCP,
browser-local WebMCP, and a protected control-plane Worker. Source presence does not prove that a
public endpoint is currently delivered, configured, or authorized.

**Fastest evidence-bounded path**

1. Start with the local parser or harness in mock mode for zero-spend evaluation.
2. Use the install contract's public-read surface only where a revision-bound delivery result exists.
3. Add the control-plane surface only where the host preserves MCP sessions, supplies the required
   bearer credential, and an operator has authorized the separately deployed Worker.

For the canonical third-party install boundary, host recipes, and the explicit public-discovery vs control-plane split, see [`docs/documents/agentic-graph-mcp-install-contract.md`](docs/documents/agentic-graph-mcp-install-contract.md). For the one-page onboarding path that also links the release note, agent-ready doc, and MCP overview, see [`docs/documents/agentic-graph-mcp-onboarding-index.md`](docs/documents/agentic-graph-mcp-onboarding-index.md).
For the current min-viable-max-value Cloudflare AI Gateway execution queue, see [`docs/documents/agentic-graph-ai-gateway-enhancement-plan.md`](docs/documents/agentic-graph-ai-gateway-enhancement-plan.md).
For the canonical webpage embed boundary, see [`docs/documents/agentic-graph-embeddability-contract.md`](docs/documents/agentic-graph-embeddability-contract.md).

**Current source topology**

| Surface | Role | Local rung | Delivered rung |
| --- | --- | --- | --- |
| Public-read MCP source | seven-tool read-only discovery/retrieval contract | `spec-complete` | `undocumented` |
| Control-plane Worker source | ten-tool approval-gated registry with bearer/session boundary | `spec-complete` | `undocumented` |
| Local stdio MCP | richest repo-local descriptor/executor catalog, configuration-gated per tool | `spec-complete` | `undocumented` |
| Browser WebMCP | page-local inspection and guarded controls | `spec-complete` | `undocumented` |

For local provider-neutral application building and its exact tool identities, see
[`docs/agent-application-composition.md`](docs/agent-application-composition.md).

Baseline runs are provable **offline with deterministic mock providers**. Real providers activate only when host-owned keys are wired and the matching gate is approved.

Hosted platforms that cannot spawn a local process must follow the install contract. A direct
control-plane connection is usable only when the host supports both session preservation and
secret bearer headers; otherwise a separately authorized secret-holding forwarder is required.

**MainPanel readiness** uses only the canonical ladder with separate local and delivered columns:
`undocumented`, `spec-complete`, `dev-proven`, `runtime-ready`, and `production-verified`.

Current repo truth:

- MainPanel Integrations is anchored to the broader Settings-backed provider universe; any demo or SuperAgent subset must be called out as scoped.
- MainPanel MCP can contain both browser-local source rows and connection guidance, but neither
  receives a delivered rung without an Evidence Reference.
- Planned external bridge identities are not current executable runtime owners.

Release-gate checklist and readiness rubric: `docs/documents/agentic-graph-mainpanel-readiness-rubric.md`.

## Quick start: run a document

Execute a agentic-graph canvas document headlessly with the `agentic_graph_parser` CLI. For a fully offline deterministic run, pass `--provider-mode mock`:

```bash
python3 -m agentic_graph_parser run-goal \
  --input docs/documents/your-canvas-doc.md \
  --goal-file goal.md \
  --output-dir data/outputs/my-run \
  --run-id my-run \
  --provider-mode mock \
  --print-summary
```

This writes the run to the output dir:

```text
data/outputs/my-run/
  state.json          # resumable run state
  trace.jsonl         # step-by-step execution trace
  final-report.md     # human-readable run report
  harness-proof.json  # verification manifest
  artifacts/          # generated text/image/video/canvas artifacts
```

Useful flags:

- `--provider-mode byteplus-modelark|mock` — `byteplus-modelark` (default, placeholder-backed media lane) or `mock` for deterministic offline runs.
- `--resume` — resume from `output-dir/state.json`.
- `--stop-after-step N` — checkpoint after N tasks, then stop (interruptible).
- `--fail-once <tool>` — inject one bounded failure for a tool (recovery testing).
- `--max-steps` / `--max-retries` / `--max-wall-seconds` — run budgets.

Convenience wrapper (uses the neutral fixture brief):

```bash
npm run goal:run
```

## Repository role

This repository is the Dev source of truth and the production release source. Normal implementation and pull-request validation stay in Dev. After protected integration, an operator may manually dispatch `.github/workflows/release.yml` for an exact reviewed `main` revision; the protected workflow builds, attests, deploys, browser-verifies, records receipts, and only then publishes the generated mirror. The public surfaces are `https://airvio.co/` and `https://airvio.co/agentic-graph`.

## Workspace surfaces

| Surface | Purpose |
| --- | --- |
| Source Files | Canonical Markdown documents (the runnable canvases), JSON, binary metadata, generated KGC, chat logs, traces. |
| Graph Canvas | Visual exploration + execution of the widget flow: nodes, edges, rich-media panels, layouts. |
| Floating Panel Chat | Agent-native assistant with workspace, selection, and source-aware context. |
| MainPanel Integrations | Provider, endpoint, model, auth-mode, storage, and runtime configuration for the Settings-backed provider universe; any narrower subset must be labeled as scoped. |
| Storyboard Widget | Structured 2D renderer editing over source-backed Markdown documents: Cards, Widgets, Rich Media Panels, reusable elements, and timeline lanes. |
| MainPanel MCP | Readiness rows and connection templates for local stdio, read-only Pages HTTP, Browser WebMCP, and external MCP tool servers, with separate local and delivered ladder rungs. |
| Agentic OS docs | Sibling control surface for `/`, `#`, `@` route dictionaries, MCP gateway policy, harnesses, and runtime proof. |
| Cloudflare Runtime | Pages, Workers (`McpAgent`), D1, R2, AI Gateway, and server-managed provider secrets when deploy is explicitly opened. |

## Repo layout

| Path | Purpose |
| --- | --- |
| `canvas/` | Vite/React app, editor workspace, Source Files, graph canvas, Storyboard Widget, MainPanel, chat UI, and focused tests. |
| `agentic_graph_parser/` | Python parser and command-line tooling for markdown, GraphRAG, webpage, video, and workflow artifacts. |
| `grph-shared/` | Runtime-neutral TypeScript contracts for storage, rich media, markdown, payments, browser helpers, cache, and geometry. |
| `gympgrph/` | Geospatial package consumed by the canvas app. |
| `cloudflare/` | Pages handlers, Workers (incl. the `agentic-graph-mcp` `McpAgent`), storage routes, D1 migrations, and R2-backed binary storage. |
| `mcp/` | Local stdio MCP server, tool contracts, local runtimes, and service documentation. |
| `config/surface-registry.json` | Protection-first authority for private, gated, served, and publicly discoverable artifacts and routes. |
| `config/license-registry.json` | Class-to-terms authority used to validate published artifacts and render the staged reuse declaration. |
| `data/config/` | Canonical config inputs for GraphRAG, schema, orchestrator, and LLM chat boundaries. |
| `docs/documents/` | Authored product, API, architecture, and feature documents. |
| `scripts/surface/` | Deterministic, network-free discovery generation, parsing, scanning, audit, and temp-fixture promotion proof. See [the runtime contract](docs/discoverability-ip-protection-runtime.md). |
| `scripts/` | Repo checks, sync helpers, docs generation, storage seeding, payment readiness, and release tooling. |

## Setup

```bash
npm install
npm run setup
```

Prepare linked packages directly when working inside the canvas app:

```bash
npm --prefix canvas run prepare:linked-packages
```

Prepare the shared runtime required by repository smoke checks:

```bash
npm run smoke:prepare
```

The collaboration readiness gate runs this preparation automatically before its focused and browser smoke checks. Agentic Canvas OS supplies run-scoped owner, guest, and worker URLs plus `AG_COLLABORATION_E2E_PERSISTENCE_PATH` and `AG_COLLABORATION_E2E_RESULT_PATH`, so concurrent proofs do not reuse canonical ports or repository-local Wrangler state.

## Local development

Canonical Dev starts only from the primary checkout after it uniquely owns a clean, fetched `main`:

```bash
cd "$GITHUB_ROOT/agentic-graph"
git status --short --branch
npm run dev -- --host 127.0.0.1
```

Use `npm run dev:apex` from that same checkout for the supervised Apex runtime, and use `npm run dev:latest` there only when clean `main` needs a safe fast-forward. A clean linked `main` release worktree is not a canonical Dev substitute.

The same `npm run dev` or `npm run dev:apex` command may run from a registered `agent/<device>/<semantic-scope>` worktree for an isolated task preview. The source guard selects task mode automatically; that preview is not canonical Dev or release proof. If `$GITHUB_ROOT/agentic-graph` is occupied by a task branch or `main` is registered elsewhere, preserve the lane and restore canonical ownership through the repository lifecycle workflow before claiming canonical Dev.

Use focused checks for the behavior being changed:

```bash
npm --prefix canvas run test:ci:unit -- <test-name-or-filter>
npm --prefix canvas run typecheck
npm --prefix canvas run check
npm --prefix canvas run doc:sanity
npm run api-index:check
python3 -m agentic_graph_parser.webpage_cmd_test
```

Avoid broad test, publish, deploy, or remote mutation commands unless the current task requires them.

## Build, publish, deploy

Local build:

```bash
npm run build
```

Publish mirror build and sync:

```bash
npm run pages:build-sync
npm run pages:check-sync
```

Cloudflare deployment (Pages + Workers + `McpAgent`):

```bash
npm run pages:deploy-cloudflare
npm run mcp:worker:deploy
```

Run Cloudflare deployment, D1 mutation, R2 mutation, or production publish commands only after explicit operator instruction.

## Storage and source authority

Source Files are the workspace contract. Git-backed authored Markdown documents remain the source of truth; hosted storage mirrors and generated artifacts must preserve path identity instead of inventing parallel files.

- Keep GitHub-authored docs authoritative first.
- Use D1 and public storage routes as hosted mirrors and runtime indexes.
- Use R2 for binary artifacts (generated image/video) and companion outputs that do not belong inline in markdown. Persist media bytes to R2 on generate and store the durable R2 URL; never store an ephemeral provider URL as the artifact.
- Keep generated KGC, chat logs, traces, and output manifests source-file addressable.
- Use Launch → New .md for one-click authored Markdown creation under `/docs`; the action must reuse the shared Source Files creator and workspace timestamp helpers, then synchronously persist the blank file through the docs mirror instead of a toolbar-local file path.
- Do not hardcode provider, path, route, or demo-specific behavior downstream when a shared Source Files or storage owner should handle it upstream.

## Config and generated artifacts

Canonical config roots live under `data/config/`:

```text
data/config/graphrag/
data/config/llm-chat/
data/config/orchestrator/
data/config/schema/
```

Generated and local runtime outputs should stay ignored:

```text
.agentic-graph-workspace/
data/outputs/
.wrangler/
*.tsbuildinfo
canvas/artifacts/live-verification/
canvas/.tmp-*
canvas/tmp-*
canvas/tmp_*
logs/
```

Do not commit local screenshots, transient previews, duplicate root-level config, local workspace notes, or runtime artifacts unless a specific test fixture contract requires a bounded source artifact.

## Feature docs

Feature contracts belong in canonical docs. Live task planning belongs only in the Agentic Canvas OS planning control surface, not in repository-local roadmap files:

| Feature | Docs |
| --- | --- |
| Agentic Canvas OS control surface | `../agentic-canvas-os/docs/` |
| Product and architecture | `docs/documents/agentic-graph-prd.md`, `docs/documents/agentic-graph-tad.md`, `docs/documents/agentic-graph-architecture-decisions.md` |
| Live task planning | `../agentic-canvas-os/docs/TODO.md` and its active monthly shard |
| 2D Renderer Storyboard template | `../huijoohwee.github.io/template/agentic-graph-2d-renderer-storyboard-template.md` |
| Agentic Canvas OS PRD/TAD | `docs/documents/agentic-graph-mcp/agentic-graph-mcp-agentic-os-prd-tad.md` |
| AI provider layer (MiroMindAI) | `docs/documents/agentic-graph-api-reference/agentic-graph-miromind-api-prd-tad.md` |
| MCP | `docs/documents/agentic-graph-mcp/` and `mcp/README.md` |
| Storage sync | `docs/documents/agentic-graph-storage-sync-document.companion.md` |
| Strybldr | `docs/documents/agentic-graph-strybldr-prd-tad.md` |
| Strytree | `docs/documents/agentic-graph-strytree-prd-tad.md` |
| Repo hygiene | `docs/documents/agentic-graph-repo-hygiene-document.md` |
| Payment readiness | `docs/documents/agentic-graph-mainpanel-commerce-prd-tad.md` |

## Hygiene rules

- Fix root/source owners instead of layering downstream aliases, remaps, or compatibility shims.
- Keep the AI/agent layer, storage, graph, and Source Files behavior provider-neutral and file-agnostic where possible.
- Reuse shared helpers, semantic keys, and workspace contracts instead of hardcoded repo, file, route, or demo branches.
- Preserve source provenance for generated artifacts (link them to the goal, brief, plan, tool calls, and verification checks).
- Keep secrets out of source and use server-managed environment bindings for hosted provider keys.
- Keep Dev as the implementation source; publish mirror and Cloudflare outputs are generated from Dev.

## E2E Agentic Video Generation

Home **Prompt Presets** and FloatingPanel **Prompt Presets** read the same source-backed catalog and selection runtime. Selecting a preset loads its editable prompt without submitting Chat or approving provider spend. Video Agent additionally exposes its route, provider, specification, and output controls:

```text
/video-agent @provider.byteplus @text @image @audio @video #spec.low @script.md
```

`/video-agent` selects the route; `@provider.byteplus` (default) or `@provider.openai` selects the provider; output `@` tokens select Text/Image/Audio/Video; and `#spec.low|#spec.medium|#spec.high` controls the declared specification. Enabled Markdown scripts remain canonical `workspace:` references but render through the existing `@*.md` inline-chip projection. A source-backed multilingual production request preserves Chinese, Cantonese, and English audio variants with synchronized Chinese/English subtitles, and projects generated artifacts through Cards, Widgets, Rich Media Panels, and BottomPanel Timeline video/FBF/audio lanes. Missing approval, credentials, or provider capability fails closed. This remains Dev-only and does not authorize a paid model call or Cloudflare deployment.

The default Source Files validation document is `../huijoohwee/docs/agentic-graph-agentic-video-canvas-demo.md`; it keeps the supplied video-generation script as an `@`-inserted `workspace:` reference and starts all generated artifact fields blank until a provider returns them.

## Get involved

- ⭐ Star the repo to follow progress
- 🐛 Issues and FOSS-alternative suggestions welcome
- 🤝 PRs should keep the AI/agent layer, storage, and canvas provider-neutral and file-agnostic

Built by [airvio](https://airvio.co) · Singapore, with a SEA-first multilingual orientation (English, Bahasa Malaysia, Mandarin, SEA-LION).

---

*agentic-graph is early-stage and evolving fast. `docs/documents/` and the sibling `agentic-canvas-os/docs` control surface are versioned alongside the code — check the repo for the latest.*
