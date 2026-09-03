---
title: "agentic-graph Token Economics Model — PRD & TAD"
doc_type: "PRD+TAD"
doc_id: "TEM-001"
version: "0.2.0"
status: "Accepted implemented baseline; ingestion and NLQ extensions planned"
date: "2026-05-29"
authors:
  - "airvio"
schema: "kgc-computing-flow/v1"
lang: "en-US"
frontmatter_contract: "required"
epics:
  - id: "TEM-E1"
    title: "Token Economics Schema Extension"
  - id: "TEM-E2"
    title: "Queryable Path Engine"
  - id: "TEM-E3"
    title: "Cost Log Ingestion Pipeline"
  - id: "TEM-E4"
    title: "Interactive Canvas Renderer"
node_types:
  - metric
  - lever
  - cost
  - outcome
  - component
edge_predicates:
  - drives
  - reduces
  - caps
  - accumulates
  - penalises
  - emits
  - bounds
  - informs
  - sequences
  - improves
  - lowers
  - triggers
  - feeds
  - wraps
  - validates
  - produces
  - consumes
tags:
  - "token-economics"
  - "kgc"
  - "knowledge-graph"
  - "harness"
  - "tco"
  - "foss"
  - "observability"
  - "queryable"
---

# agentic-graph Token Economics Model — PRD & TAD

---

## Overview

The Token Economics Model (TEM) is a queryable knowledge graph embedded within the `kgc-computing-flow/v1` schema that makes LLM token spend causally transparent. Its implemented baseline reuses the KGC semantic graph parser and query helpers: `canvas/src/features/parsers/kgcSemanticGraph.ts` parses typed `@node:type:id` and `@edge:predicate:source→target` sigils, while `canvas/src/lib/graph/kgcSemanticQuery.ts` exposes BFS path, type filter, search, ancestors, and descendants helpers. Cost-log ingestion, budget alerts, NLQ, and specialized renderer features remain planned extensions that must reuse this shared semantic graph owner instead of introducing a separate TEM parser/query stack.

**Governing lenses**: min-viable-max-value · TCO-zero · token economics · harness-first.

---

## Part 1 — PRD

---

### Epic TEM-E1 — Token Economics Schema Extension

#### Problem Statement

The `kgc-computing-flow/v1` schema provides `@node`, `@edge`, and `@cluster` sigils for general graph construction, but carries no semantic type system for token economics concepts. Relationships between metrics (`prompt_tokens`), levers (`cache_hit_rate`), costs (`estimated_cost_usd`), and outcomes (`roi_score`) exist only as prose in TAD documents — they are invisible to harness queries, cannot be traversed programmatically, and produce no observable signal when a lever value changes. The impact: token cost overruns are discovered in sprint retrospectives rather than traced in real time to their causal node.

#### Personas

**Solo Dev / AI Orchestrator** — runs all harness pipelines; needs a machine-readable representation of token economics relationships so that a cost overrun can be traced to its causal lever without manual document cross-referencing; jobs-to-be-done: *build pipelines*, *control costs*, *pass gate reviews*.

**Technical Reviewer** — audits PRD/TAD documents for completeness; needs to verify that every AI component's token budget is traceable to a lever with an observable control; jobs-to-be-done: *approve gate*, *flag uncosted decisions*, *enforce FOSS-first rule*.

#### User Journey — Solo Dev: Cost Overrun Trace

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Sprint review shows actual token cost 2× estimate | `harness-proof.json` cost log | No causal graph; manual diff required | TEM graph shows exactly which node drove the overrun |
| Discover | Open TEM canvas; see `estimated_cost_usd` node highlighted red | TEM canvas renderer | Node exists but has no upstream trace | Typed edge `drives` exposes `prompt_tokens → estimated_cost_usd` |
| Engage | Click `prompt_tokens` node; inspect fields | Detail panel | Field values are stale estimates | Cost log ingestor updates node state with actuals |
| Complete | Identify `prompt_compression` lever is unused; activate it | Lever node → TAD component spec | No actionable link from graph to spec | `@node:lever:prompt_compression` links to TAD section |
| Return | Next sprint: cost at target; cache hit rate improved | Sprint review | No closed-loop feedback | TEM graph shows actuals converged to budget |

#### User Stories

**TEM-E1-S1**: As a Solo Dev, I want to declare token economics nodes and typed edges in KGC Markdown using semantic sigil extensions, so that the graph is machine-readable by the query engine and harness tools without bespoke parsing.

**TEM-E1-S2**: As a Technical Reviewer, I want every AI component's TAD spec to reference at least one TEM lever node, so that I can verify token budget decisions are observable and controllable.

#### Acceptance Criteria

**TEM-E1-S1-AC1**: Given a KGC Markdown file containing `@node:metric:prompt_tokens`, `@node:lever:token_budget`, and `@edge:caps:token_budget→prompt_tokens`, when `parseKgcSemanticGraphFromMarkdown()` processes the file, then it returns semantic-keyed GraphData with two typed nodes (`type: metric`, `type: lever`) and one directed edge (`predicate: caps`, `source: token_budget`, `target: prompt_tokens`) within 50 ms.

> **`/goal` translation**: `npm --prefix canvas run test:ci:unit -- "parser.kgcSemantic.typedSigilsNoLegacyRemap" passes; parsed GraphData contains nodes with correct type fields and edge with predicate "caps"`

**TEM-E1-S2-AC1**: Given a TAD component spec for any AI-powered component, when a linter runs `tem-lint` against the spec file, then it confirms at least one `@node:lever` reference is present and exits 0; if absent it exits 1 with a structured error identifying the missing lever reference.

> **Future `/goal` translation**: `a linter reuses KGC semantic GraphData to validate lever references; no second TEM parser is introduced`

#### Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---|---|---|
| Schema parse latency (p95) | n/a | < 50 ms per document | Sprint 1 |
| Lint coverage: AI components with lever reference | 0% | 100% | Sprint 1 |
| Token cost / month (schema extension itself) | n/a | $0 (no LLM call) | Sprint 1 |
| Monthly TCO | n/a | $0 | Sprint 1 |
| ROI Score | — | ≥ 12 | Sprint 1 |

**ROI Score (TEM-E1)**:
```
Impact = 4 (makes token economics structurally visible; removes manual cross-referencing)
Reach  = 50 harness runs/month (all pipelines reference schema)
Build  = 4h
TCO    = $0/month
Token  = $0/month (no LLM)

ROI = (4 × 50) / (4 + 0 + 0) = 50 — well above threshold
```

#### MoSCoW Priority

| Tier | Feature | ROI Score | Rationale |
|---|---|---|---|
| Must | `@node:{type}:{id}` sigil extension (5 semantic types) | 50 | Structural enabler for all downstream epics |
| Must | Typed edge predicate set (15 predicates) | 50 | Enables causal query; zero runtime cost |
| Must | KGC semantic parser GraphData output | 50 | Single canonical parse; all consumers read GraphData |
| Must | `tem-lint` lever-reference enforcer | 20 | Gate enforcement for TAD quality |
| Should | JSON-LD `@context` export from IR | 8 | Interoperability; not required for internal queries |
| Could | OWL/RDFS ontology serialization | 3 | Heavy; no consumer at current scale |
| Won't | GraphQL schema auto-generation | 2 | Overkill; BFS engine covers all query needs |

#### Min-Viable Scope (TEM-E1)

`kgcSemanticGraph.ts`: typed sigil extraction → semantic-keyed GraphData `{ nodes, edges, metadata }`. `tem-lint` remains a future guard; it must read the same typed semantic graph instead of implementing a second parser. No database, no API, no UI.

#### Out of Scope

Runtime schema evolution (adding node types without parser update); multi-document graph merge; external ontology alignment.

#### Dependencies

Existing KGC `kgc-computing-flow/v1` schema (SSOT); TypeScript runtime (Cloudflare Worker-compatible).

#### Open Questions

- Should `@edge` predicate validation be strict (reject unknown predicates) or warn-only at MVP?
- Does `tem-lint` run as a pre-commit hook, a CI step, or both?

---

### Epic TEM-E2 — Queryable Path Engine

#### Problem Statement

Even with typed GraphData from TEM-E1, maintainers need a programmatic way to ask "what is the causal path from `prompt_tokens` to `roi_score`?" or "which nodes are of type `lever`?". The implemented KGC semantic query helper converts typed Markdown graph output into a live, queryable system without a separate graph database or duplicate TEM query stack.

#### Personas

**Solo Dev / AI Orchestrator** — needs to ask "what levers reduce `estimated_cost_usd`?" before selecting an optimization strategy; needs this answer in < 100 ms with no manual traversal.

**Future NLQ harness** (system actor) — needs a deterministic, typed query interface to receive structured params from NLQ interpretation and execute them against KGC semantic GraphData.

#### User Journey — Solo Dev: Lever Discovery

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Cost per call exceeds token budget threshold | Alert / sprint review | No automated lever suggestion | Query engine finds all `lever` nodes with outbound edge to cost node |
| Discover | Click "Cache → Cost path" query chip | TEM canvas | Path not obvious from visual inspection alone | BFS returns `cache_hit_rate → estimated_cost_usd` in < 10 ms |
| Engage | Inspect all intermediate nodes on the path | Detail panel | No intermediate node visibility | Path highlights every edge and node in the causal chain |
| Complete | Activate `prompt_compression` lever; update TAD spec | TAD component spec | No link from graph result to action | Query result surfaces lever node ID → TAD field reference |
| Return | Confirm reduced cost next sprint | Sprint retrospective | No before/after comparison | Sprint-over-sprint node state delta (TEM-E3) |

#### User Stories

**TEM-E2-S1**: As a Solo Dev, I want to execute a BFS path query between any two node IDs, so that I can trace the causal path between a lever and a cost or outcome without manual graph traversal.

**TEM-E2-S2**: As a Solo Dev, I want to filter the graph by node type and search nodes by label or ID, so that I can locate all levers or metrics relevant to a cost optimization decision in a single operation.

#### Acceptance Criteria

**TEM-E2-S1-AC1**: Given loaded KGC semantic GraphData with at least two nodes connected by a directed path, when `bfsKgcSemanticPath({ graphData, startId, endId })` is called, then it returns an ordered array of node IDs representing the shortest directed path within 10 ms; if no path exists it returns an empty array.

> **`/goal` translation**: `npm --prefix canvas run test:ci:unit -- "parser.kgcSemantic.queryEnginePathFilterSearch" passes; BFS returns correct path for fixture graphs`

**TEM-E2-S2-AC1**: Given loaded KGC semantic GraphData, when `filterKgcSemanticNodeIdsByType({ graphData, type })` is called with a valid semantic type, then it returns all node IDs of that type within 5 ms; when `searchKgcSemanticNodeIds({ graphData, term })` is called, then it returns all node IDs whose label, ID, type, or description contains the search term (case-insensitive) within 5 ms.

> **`/goal` translation**: `npm --prefix canvas run test:ci:unit -- "parser.kgcSemantic.queryEnginePathFilterSearch" passes; type filter, search, ancestors, and descendants cases return correct subsets`

#### Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---|---|---|
| BFS path query latency (p95) | n/a | < 10 ms | Sprint 2 |
| Type filter latency (p95) | n/a | < 5 ms | Sprint 2 |
| Query accuracy (correct path returned) | n/a | 100% on fixture suite | Sprint 2 |
| Token cost / month | n/a | $0 (pure function, no LLM) | Sprint 2 |
| Monthly TCO | n/a | $0 | Sprint 2 |
| ROI Score | — | ≥ 13 | Sprint 2 |

**ROI Score (TEM-E2)**:
```
Impact = 4 (removes manual graph traversal; enables harness-callable query)
Reach  = 20 queries/month (sprint reviews, debugging sessions, NLQ calls)
Build  = 6h
TCO    = $0/month
Token  = $0/month (no LLM in query engine itself)

ROI = (4 × 20) / (6 + 0 + 0) ≈ 13.3 — above threshold
```

#### MoSCoW Priority

| Tier | Feature | ROI Score | Rationale |
|---|---|---|---|
| Must | `bfsKgcSemanticPath({ graphData, startId, endId })` → `string[]` | 13 | Core causal trace; used by canvas + NLQ harness |
| Must | `filterKgcSemanticNodeIdsByType({ graphData, type })` → `string[]` | 13 | Type-scoped queries; required by canvas filter bar |
| Must | `searchKgcSemanticNodeIds({ graphData, term })` → `string[]` | 10 | Label/ID search; required by canvas search box |
| Should | `ancestorsKgcSemanticNodeIds({ graphData, nodeId })` → `string[]` | 7 | "What drives this cost?" query pattern |
| Should | `descendantsKgcSemanticNodeIds({ graphData, nodeId })` → `string[]` | 7 | "What does this lever affect?" query pattern |
| Could | Weighted shortest path (Dijkstra) | 4 | Useful if edges gain cost-impact weights (future) |
| Won't | SPARQL endpoint | 1 | Over-engineered; BFS covers all current query needs |

#### Min-Viable Scope (TEM-E2)

`kgcSemanticQuery.ts`: pure functions (`bfsKgcSemanticPath`, `filterKgcSemanticNodeIdsByType`, `searchKgcSemanticNodeIds`, `ancestorsKgcSemanticNodeIds`, `descendantsKgcSemanticNodeIds`) operating on GraphData from TEM-E1. No external dependency. Importable by any TypeScript module.

#### Out of Scope

Persistent query result caching; query history log; multi-graph federation.

#### Dependencies

TEM-E1 (`kgcSemanticGraph.ts` GraphData output as input to the KGC semantic query helpers).

#### Open Questions

- Should `bfsPath` return all paths or only the shortest? Current design: shortest only (BFS guarantees this for unweighted graphs).
- Should `ancestors` / `descendants` be depth-limited to prevent full-graph traversal on dense graphs?

---

### Epic TEM-E3 — Cost Log Ingestion Pipeline

#### Problem Statement

The token economics graph built by TEM-E1/E2 is static: node field values are authoring-time estimates, not actuals. Every harness run emits a `cost_log` entry — `{ model, prompt_tokens, completion_tokens, cache_hits, estimated_cost_usd }` — into `harness-proof.json`, but these actuals are never fed back into the TEM graph. The result: the graph's `prompt_tokens`, `completion_tokens`, `cache_hit_rate`, and `estimated_cost_usd` nodes always show estimates, never actuals. Sprint-over-sprint drift between estimates and actuals is invisible until a retrospective. The ingestion pipeline closes this loop.

#### Personas

**Solo Dev / AI Orchestrator** — runs harnesses continuously; needs the TEM graph to reflect actual token spend without manual data entry; jobs-to-be-done: *trust graph state*, *act on actuals not estimates*, *detect budget overruns in real time*.

#### User Journey — Solo Dev: Actual vs Estimate Reconciliation

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Harness completes; `harness-proof.json` updated | CI / local run | Actuals not surfaced anywhere queryable | Ingestor triggers on file write; updates node state |
| Discover | TEM canvas shows updated node field values | Canvas renderer | Node values stale | Ingestor pushes delta to graph store; renderer re-draws |
| Engage | Click `estimated_cost_usd` node; see actual vs budget | Detail panel | No comparison field | Node state carries both `estimated` and `actual` fields |
| Complete | Actual < budget → sprint passes; actual > budget → trigger lever review | Sprint gate | Manual comparison | Ingestor emits `budget_alert` event if actual > `token_budget` node value |
| Return | Trend data accumulates sprint over sprint | Sprint history | No longitudinal view | Graph store accumulates `sprint_actuals[]` array per node |

#### User Stories

**TEM-E3-S1**: As a Solo Dev, I want actual `cost_log` values from completed harness runs to be automatically ingested into the TEM graph node state, so that the graph reflects real token spend without manual data entry.

**TEM-E3-S2**: As a Solo Dev, I want the ingestor to emit a structured `budget_alert` when any metric node's actual value exceeds its corresponding `token_budget` lever node value, so that overruns are surfaced immediately rather than at sprint retrospective.

#### Acceptance Criteria

**TEM-E3-S1-AC1**: Given a `harness-proof.json` file containing at least one `cost_log` entry, when `tem-cost-log-ingestor` processes it, then the graph store's `prompt_tokens`, `completion_tokens`, `cache_hit_rate`, and `estimated_cost_usd` node state fields are updated with the actual values from the log within 500 ms of file write; previously stored sprint actuals are appended, not overwritten.

> **Future `/goal` translation**: `cost-log ingestion tests prove node state updates and appended sprint_actuals while reusing KGC semantic GraphData`

**TEM-E3-S2-AC1**: Given an ingested `cost_log` where `prompt_tokens` actual exceeds the `token_budget` lever node's cap value, when the ingestor completes processing, then it emits a `budget_alert` event `{ node_id, actual, budget, delta, sprint }` to the configured alert sink within 500 ms; if no overrun exists the event is not emitted.

> **Future `/goal` translation**: `budget-alert tests prove alert emission for overruns and no alert for under-budget fixtures`

#### Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---|---|---|
| Ingest latency (p95) | n/a | < 500 ms from file write | Sprint 3 |
| Node state accuracy vs cost_log | 0% | 100% field match | Sprint 3 |
| Budget alert false positive rate | n/a | 0% | Sprint 3 |
| Token cost / month (ingestor) | n/a | $0 (no LLM call) | Sprint 3 |
| Monthly TCO | n/a | $0 | Sprint 3 |
| ROI Score | — | ≥ 50 | Sprint 3 |

**ROI Score (TEM-E3)**:
```
Impact = 5 (makes graph state truthful from actuals; highest pain — cost drift is invisible without this)
Reach  = 50 harness runs/month (every run produces a cost_log)
Build  = 5h
TCO    = $0/month (reads existing file; no external API)
Token  = $0/month (no LLM)

ROI = (5 × 50) / (5 + 0 + 0) = 50 — highest-priority epic by ROI
```

#### MoSCoW Priority

| Tier | Feature | ROI Score | Rationale |
|---|---|---|---|
| Must | `cost_log` → node state update (4 metric nodes) | 50 | Core data pipeline; makes graph truthful |
| Must | Sprint actuals accumulation (`sprint_actuals[]` append) | 30 | Enables longitudinal trend without overwriting |
| Must | `budget_alert` event emission on overrun | 20 | Closes gate enforcement loop |
| Should | Alert sink: Cloudflare Queue / webhook | 12 | Pluggable delivery; log-only sufficient for MVP |
| Could | Sprint-over-sprint delta chart in canvas | 8 | Longitudinal view; deferred to TEM-E4 enhancement |
| Won't | Real-time streaming (Kafka / SSE) | 3 | Batch per harness run is sufficient at current scale |

#### Min-Viable Scope (TEM-E3)

Future cost-log ingestor: reads `harness-proof.json`, extracts `cost_log` entries, maps to KGC semantic node state updates, appends to `sprint_actuals`, compares to the `token_budget` node, and emits `budget_alert` to stdout (log-only). It must not add a second parser or query engine.

#### Out of Scope

Real-time streaming; multi-pipeline aggregation; cost attribution to individual user sessions.

#### Dependencies

TEM-E1 (KGC semantic GraphData with typed nodes); TEM-E2 (KGC semantic query helpers for lever lookup); agentic-graph harness runtime (source of `harness-proof.json`).

#### Open Questions

- Should the ingestor be triggered by a file-system watcher (chokidar, FOSS MIT) or a Cloudflare Queue message from the harness webhook?
- How many sprints of `sprint_actuals` should be retained before truncating? Proposed: 12 sprints (3 months).

---

### Epic TEM-E4 — Interactive Canvas Renderer

#### Problem Statement

The TEM graph and its actuals exist in structured data but are opaque to visual inspection. A solo dev reviewing a cost overrun must read JSON and run query functions in a REPL. Stakeholders (investors, advisors, technical reviewers) cannot navigate the graph without code access. An interactive HTML Canvas renderer with zoom/pan, type-filter, BFS path chips, and natural-language query via a single harness call makes the entire token economics model self-documenting and demo-ready.

#### Personas

**Solo Dev / AI Orchestrator** — needs fast visual navigation of the cost graph during sprint review; needs to demonstrate token economics observability to advisors without opening a terminal.

**Advisor / Investor** — no code access; needs to see that token spend is understood, controlled, and traceable; values visual clarity over raw data.

#### User Journey — Solo Dev: Demo-Mode Graph Navigation

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Investor asks "how do you control AI costs?" | Live demo / async share | No visual artifact to point at | TEM canvas opens immediately in browser; no install |
| Discover | Renderer shows all 14 nodes with type-color coding | Canvas | Graph unfamiliar to non-technical viewer | Color-by-type legend and filter bar reduce cognitive load |
| Engage | Click "Model call → ROI path" chip; path highlights amber | Query chips | Non-technical viewer cannot interpret BFS | Path highlighting + detail panel summarise causality in plain language |
| Complete | Click `token_budget` node; actual vs budget shown | Detail panel | Raw numbers without context | Node detail panel shows `estimated`, `actual`, `delta`, `budget` fields |
| Return | Advisor asks follow-up; click "Ask Claude" button | `sendPrompt()` | Cannot answer without switching context | Button sends pre-formed prompt into Claude conversation |

#### User Stories

**TEM-E4-S1**: As a Solo Dev, I want the TEM graph rendered as an interactive HTML Canvas with zoom, pan, type-colour-coding, and clickable nodes, so that I can visually navigate the token economics model without writing code.

**TEM-E4-S2**: As a Solo Dev, I want to enter a natural-language query ("what levers reduce cost the most?") and receive a structured BFS query result with path highlighted on the canvas, so that I can explore the graph without knowing node IDs.

#### Acceptance Criteria

**TEM-E4-S1-AC1**: Given a loaded TEM graph IR, when the canvas renderer mounts, then all nodes are rendered with type-colour coding, all edges are rendered with arrowheads and predicate labels (at zoom > 0.75), and clicking any node populates the detail panel with `label`, `type`, `desc`, and `fields` within 100 ms.

> **Future `/goal` translation**: `renderer tests prove KGC semantic GraphData renders nodes and edges, clicking a node populates the detail panel, and render time stays under 100ms`

**TEM-E4-S2-AC1**: Given a natural-language query string, when a future NLQ harness processes it, then a structured `{ query_type, start_id?, end_id?, filter_type?, search_term? }` object is returned within 2 s; KGC semantic query helpers execute the params; the canvas highlights the result path or type subset within 200 ms of harness response.

> **Future `/goal` translation**: `NLQ harness tests prove structured output for fixture queries, fallback search on invalid output, and no duplicate query engine`

#### Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---|---|---|
| Canvas initial render latency (p95) | n/a | < 100 ms | Sprint 4 |
| NLQ harness response latency (p95) | n/a | < 2 s | Sprint 4 |
| Token cost / NLQ call | n/a | < 450 tokens total | Sprint 4 |
| Token cost / month (NLQ harness at 50 calls) | n/a | < $0.02/month | Sprint 4 |
| Monthly TCO | n/a | $0 (CF Pages free tier) | Sprint 4 |
| ROI Score | — | ≥ 3.5 | Sprint 4 |

**ROI Score (TEM-E4)**:
```
Impact = 3 (demo value + visual sprint review; important but non-blocking for cost control)
Reach  = 10 sessions/month (sprint reviews + investor demos)
Build  = 8h
TCO    = $0/month (CF Pages free tier)
Token  = 50 NLQ calls × 450 tokens × $0.80/1M (in) + $4/1M (out) at ~65% cache ≈ $0.014/month

ROI = (3 × 10) / (8 + 0 + 0.014) ≈ 3.75 — above threshold
```

#### MoSCoW Priority

| Tier | Feature | ROI Score | Rationale |
|---|---|---|---|
| Must | Canvas render: nodes + edges + zoom/pan + click | 3.75 | Core visual; minimum viable demo artefact |
| Must | Type-filter bar + label/ID search box | 3.0 | Reduces graph density for non-technical viewers |
| Must | BFS path query chips (4 pre-defined paths) | 3.5 | Zero-input path exploration; highest demo value |
| Must | Node detail panel with actuals vs estimate | 3.5 | Makes cost data accessible without reading JSON |
| Should | Future NLQ harness → structured KGC semantic query | 3.0 | High novelty; enables open-ended graph interrogation |
| Should | `sendPrompt()` "Ask Claude" button per node | 2.5 | Extends graph into Claude conversation naturally |
| Could | Sprint-over-sprint delta trend in detail panel | 2.0 | Longitudinal view; deferred |
| Won't | Node drag-to-reposition (persisted layout) | 1.5 | Layout is auto-derived from schema; persistence adds storage complexity |

#### Min-Viable Scope (TEM-E4)

Future renderer extension plus 4 configured BFS query chips. Type-filter bar and label search must call `kgcSemanticQuery.ts` helpers. Node detail panel reads from GraphData and optional node-state actuals. NLQ remains a Should-tier enhancement.

#### Current Storyboard Widget Computing-Flow Contract

The current demo acceptance surface is the native `2D Renderer: Storyboard`, not a standalone static canvas. The renderer must ingest the token-economics Markdown frontmatter, parse normalized `{key,type,value}` flow fields, render widget KTV rows, and run computing-flow propagation from shared helpers.

- Driver keys such as `agent_token_take_rate` remain semantic port keys across `handles.source`, `sourceHandle`, `targetHandle`, labels, connected-value lookup, and chart computation.
- When a driver field and a functional port resolve to the same normalized schema path, the Storyboard Widget renders one inline-editable KTV row with the port handle attached to that row. It must not render a second non-inline duplicate row for the same key.
- Calculator and Rich Media Panel updates use `computeFlowConnectedValuesBySchemaPath()` semantics, including bounded propagation, branch-stop handling for `null` / `undefined`, and cache keys based on graph/registry shape rather than fixture filenames.
- Validation should exercise the mirrored token-economics demo document as an external fixture input without hardcoding local absolute paths or backfilling missing files.

#### Out of Scope

Server-side rendering; PDF export; 3D visualization; real-time multi-user canvas sync.

#### Dependencies

TEM-E1 (KGC semantic GraphData), TEM-E2 (KGC semantic query helpers), TEM-E3 (node state actuals). Future NLQ requires a server-managed provider secret and must not expose API keys in the browser.

#### Open Questions

- Should the renderer extension be served as a portable static artifact or embedded in the agentic-graph React app?
- NLQ harness: is Haiku sufficient for query parameter extraction, or does cost-accuracy tradeoff require Sonnet? Proposed: Haiku with fallback to keyword search.
---

## Companion Files

| File | Scope |
|---|---|
| `agentic-graph-token-economics-model-prd-tad.companion.md` | TAD architecture, component specs, workflows, data flows, deployment strategy, and PRD-to-TAD traceability. |
