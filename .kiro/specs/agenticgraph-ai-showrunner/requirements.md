---
title: "AgenticGraph AI Showrunner — Gap & Readiness Audit Requirements"
id: "spec:agenticgraph-ai-showrunner"
author: "airvio / joohwee"
date: "2026-06-19"
version: "0.1.0"
status: "draft"
doc_type: "requirements"
lang: "en-US"
domain: "agenticgraph"
spec_type: "feature"
workflow_type: "requirements-first"
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
  - "agnostic"
  - "modular"
  - "spec-complete to runtime-ready"
  - "FORBID edit codebase / deploy to Prod / Cloudflare until user instructs"
  - "no hardcoded IDs, routes, API keys, or provider-specific forks"
  - "no downstream local patch stacks"
  - "no backfill, churn, conflict, duplicate, freeze, or stale"
  - "reuse shared heuristics / semantic-key helpers / headless / unopinionated"
traceability:
  repo_dev: "$GITHUB_ROOT/agenticgraph"
  repo_prod: "$GITHUB_ROOT/huijoohwee/content/agenticgraph"
  cloudflare_route: "https://airvio.co/agenticgraph"
---

# Requirements Document

## Introduction

This document specifies the requirements for making **agenticgraph** a viable platform for
**AI Showrunner** scenarios: systems where AI agents produce, direct, or orchestrate creative
content at scale.

Three concrete use cases anchor the requirements:

1. **Automated Podcast Pipeline** — research topics, write scripts, coordinate multi-voice
   narration across AI voices.
2. **Narrative Game Engine** — AI agents dynamically generate storylines that branch based on
   player choices, maintaining state and continuity.
3. **Multi-Agent Writers' Room** — multiple role-scoped agents brainstorm, draft, critique, and
   revise content collaboratively under a shared creative brief.

The audit baseline is the agenticgraph codebase as of 2026-06-19, including:
Strybldr, Strytree, Vdeoxpln, SuperAgent harness, DeerFlow gateway, memory layer (Mem0),
research-agent compiler, swarm-prediction engine, MCP service, VideoDB integration, storage
sync, and the kgc-computing-flow/v1 canvas.


## Glossary

- **AI_Showrunner**: The agenticgraph platform layer that enables AI agents to produce, direct, and
  orchestrate creative content pipelines (podcast, narrative game, writers' room) at scale.
- **Showrunner_Orchestrator**: The runtime component that coordinates multi-agent creative
  pipelines — sequencing, routing messages between role-scoped agents, and managing shared
  creative state.
- **Creative_Brief**: A structured, frontmatter-first source document that defines the goal,
  constraints, tone, format, and acceptance criteria for a showrunner run.
- **Agent_Role**: A scoped, named participant in a showrunner pipeline (e.g. Researcher,
  Scriptwriter, Director, Critic, Narrator, Player_Model) with explicit input/output contracts.
- **Creative_State**: The shared, append-only context (story world state, script draft, episode
  outline, choice graph) that all agents in a pipeline read from and contribute to.
- **Pipeline_Run**: A bounded, resumable execution of a showrunner workflow — from brief intake
  through final artifact production.
- **Artifact_Package**: The set of output files produced by a completed Pipeline_Run (scripts,
  audio manifests, storyboards, narrative branches, revision history).
- **Narrator_Voice_Map**: A runtime-supplied mapping of named roles to TTS voice endpoints;
  no voice IDs are hardcoded.
- **Choice_Graph**: A directed graph of narrative decision points and branches produced and
  traversed by the Narrative_Game_Engine agent cluster.
- **Writers_Room_Session**: A bounded multi-agent critique-and-revision cycle over a shared
  draft, producing a revision history and a final accepted draft.
- **Token_Budget**: The operator-configured maximum token spend for a Pipeline_Run, enforced
  via the existing approval-gate and budget-meter primitives.
- **KGC**: AgenticGraph Canvas — the canvas graph apply path (`chatKgcCanvasApply.ts`).
- **MCP**: Model Context Protocol — the tool surface through which agents invoke agenticgraph
  capabilities.
- **Source_Files**: The agenticgraph workspace document store (GitHub `docs/**` as SSOT).
- **Semantic_Key**: A scoped, deterministic identifier built with `buildScopedGraphSemanticKey()`;
  never a hardcoded literal.


## Audit Baseline — Current Capabilities

The following capabilities are **already present** in agenticgraph and must be reused rather than
re-implemented:

| Capability | Owner | Status |
|---|---|---|
| Storyboard renderer (Strybldr) | `canvas/src/features/strybldr/` | Implemented |
| Branching story graph (Strytree) | `canvas/src/features/strytree/` | Implemented |
| Vdeoxpln skill registry and agent projection | `canvas/src/features/agent-ready/agenticgraphVdeoxplnContract.mjs` | Implemented |
| SuperAgent harness (research-code-create loop) | `agenticgraph_parser/superagent_harness.py` | Implemented (local) |
| Role-scoped agent contracts | `superagent_plan.py` (planner/research/code/text/image/video/verifier) | Implemented (local) |
| Long-horizon run memory (state.json + trace.jsonl) | SuperAgent harness artifacts | Implemented (local) |
| AI Agents memory layer (Mem0 / local-json) | `mcp/memory-layer-runtime.js`, `canvas/src/features/memory/` | Implemented (dev) |
| Research compiler (investment thesis logic) | `canvas/src/features/research-agent/researchThesisContract.ts` | Implemented (dev) |
| Swarm prediction engine | `canvas/src/features/swarm-prediction/swarmPredictionEngine.ts` | Implemented (dev) |
| FloatingPanel Chat → KGC → Canvas pipeline | `canvas/src/features/chat/` | Implemented |
| MCP local tool surface | `mcp/server.js`, `mcp/local-tool-contract.js` | Implemented |
| Storyboard Widget computing-flow (kgc-computing-flow/v1) | `canvas/src/features/storyboard-widget-manager/` | Implemented |
| Rich Media Panel (text/image/video/audio) | `canvas/src/features/chat/richMediaRun.ts` | Implemented |
| DeerFlow gateway (SSE, image, video) | `canvas/src/features/chat/deerflowRunGeneration.ts` | Implemented |
| VideoDB (upload/index/search/stream/AI gen) | `canvas/src/features/integrations/videodbSsot.ts` (planned) | Integration contract |
| Token budget / approval gate | `canvas/src/features/token-budget/` | Implemented |
| Source Files + Storage Sync (D1 / R2) | `canvas/src/lib/storage/` | Implemented |
| Semantic key helper | `canvas/src/lib/graph/semanticKey.ts` | Implemented |
| Structured LLM output → frontmatter → canvas | `chatResponseBaseContract.ts` / KGC pipeline | Implemented |

## Audit Baseline — Identified Gaps

The following capabilities are **absent or insufficient** and must be specified in this document:

| Gap Area | Missing Capability | Showrunner Use Case Impacted |
|---|---|---|
| **G1** Multi-agent message bus | No pub/sub or message routing between concurrent role-scoped agents within a single Pipeline_Run | Writers' room, podcast pipeline |
| **G2** Creative_State store | No shared, versioned, append-only creative context store accessible by all agents in a run | All three use cases |
| **G3** Showrunner_Orchestrator | No coordinator that sequences agent roles, routes outputs as inputs to downstream roles, and enforces review gates | All three use cases |
| **G4** Narrative Choice_Graph engine | Strytree supports branching but has no runtime API for an agent to dynamically extend or traverse the graph based on external choice signals | Narrative game engine |
| **G5** TTS / multi-voice narration | No narrator voice routing — no Narrator_Voice_Map contract, no TTS provider harness | Podcast pipeline |
| **G6** Script format & round-trip | No structured script schema (speaker turns, stage directions, segment metadata) and no parse ↔ print round-trip contract | Podcast pipeline, writers' room |
| **G7** Writers' room revision loop | No multi-agent critique/revision cycle — no Draft_Revision tracking, no Critic agent contract, no convergence gate | Writers' room |
| **G8** Showrunner MCP tool surface | No MCP tools for showrunner operations (start run, post to state, advance choice, submit critique) | All three use cases |
| **G9** Pipeline_Run lifecycle | No durable run lifecycle (queued → running → review → complete → archived) accessible from both MCP and canvas UI | All three use cases |
| **G10** Token / cost attribution | Token spend is per-node but not aggregated per Pipeline_Run across multi-agent turns | All three use cases |


## Requirements

### Requirement 1: Creative Brief Intake

**User Story:** As a solo dev operator, I want to define an AI Showrunner run from a structured
Creative_Brief document so that the pipeline has explicit goals, constraints, tone, and
acceptance criteria before any agent is invoked.

#### Acceptance Criteria

1. THE AI_Showrunner SHALL accept a Creative_Brief encoded as a frontmatter-first Markdown
   document with a `schema: agenticgraph-showrunner-brief/v1` field.
2. WHEN a Creative_Brief is submitted to the AI_Showrunner, THE AI_Showrunner SHALL validate
   that the brief contains at minimum: `run_type` (one of `podcast`, `narrative_game`,
   `writers_room`), `title`, `token_budget`, and at least one `agent_role` entry.
3. IF a Creative_Brief fails validation, THEN THE AI_Showrunner SHALL return a structured error
   naming the missing or invalid fields before invoking any agent or charging any tokens.
4. THE AI_Showrunner SHALL persist the validated Creative_Brief as a Source_File under the
   workspace path `showrunner/briefs/<run_id>/brief.md` using the existing Source_Files owner.
5. WHEN a Creative_Brief is persisted, THE AI_Showrunner SHALL derive all run-scoped identifiers
   using `buildScopedGraphSemanticKey()` from the brief's `run_id` field; no identifier shall be
   hardcoded.
6. THE Creative_Brief parser SHALL parse brief documents into a `ShowrunnerBriefSpec` object.
7. THE Creative_Brief printer SHALL format `ShowrunnerBriefSpec` objects back into valid
   `agenticgraph-showrunner-brief/v1` Markdown documents.
8. FOR ALL valid `ShowrunnerBriefSpec` objects, parsing then printing then parsing SHALL produce
   an equivalent object (round-trip property).


### Requirement 2: Showrunner Orchestrator

**User Story:** As a solo dev operator, I want a Showrunner_Orchestrator that sequences
role-scoped agents, routes outputs between them, and enforces review gates so that the
pipeline runs autonomously within the operator-approved budget and stops cleanly at
every approval boundary.

#### Acceptance Criteria

1. THE Showrunner_Orchestrator SHALL accept a validated Creative_Brief and execute agent roles
   in the sequence declared by the brief's `agent_pipeline` field.
2. WHEN a role-scoped agent completes its turn, THE Showrunner_Orchestrator SHALL route the
   agent's output into the Creative_State store as an append-only entry before invoking the
   next agent role.
3. WHILE a Pipeline_Run is in the `running` state, THE Showrunner_Orchestrator SHALL enforce
   the Token_Budget by halting execution and emitting an approval-gate event before any agent
   invocation that would exceed the configured budget.
4. IF an agent turn produces a structured error, THEN THE Showrunner_Orchestrator SHALL record
   the error in the run trace, increment the retry counter, and retry up to the `max_retries`
   value declared in the brief before marking the run `failed`.
5. THE Showrunner_Orchestrator SHALL expose a `run_status` query that returns the current
   pipeline state (`queued`, `running`, `awaiting_review`, `complete`, `failed`, `archived`)
   without mutating any stored state.
6. WHEN a Pipeline_Run reaches `complete`, THE Showrunner_Orchestrator SHALL write an
   Artifact_Package manifest to `showrunner/runs/<run_id>/manifest.md` through the existing
   Source_Files owner.
7. THE Showrunner_Orchestrator SHALL be provider-neutral: agent roles may target any LLM
   provider registered in the agenticgraph chat-endpoint registry without requiring a provider-
   specific orchestrator fork.
8. THE Showrunner_Orchestrator SHALL be re-entrant: a run interrupted by an approval gate or
   crash SHALL resume from the last committed Creative_State entry when restarted with the
   same `run_id`.


### Requirement 3: Creative State Store

**User Story:** As a solo dev operator, I want a shared Creative_State store that all agents in
a Pipeline_Run can read from and append to so that every agent has consistent, up-to-date
context without re-injecting the full history on every call.

#### Acceptance Criteria

1. THE Creative_State store SHALL maintain an ordered, append-only log of agent contributions
   keyed by `run_id`, `agent_role`, `turn_index`, and a `content_hash`.
2. WHEN an agent appends to the Creative_State store, THE store SHALL reject the write if the
   `content_hash` already exists for that `run_id`, preventing duplicate entries without
   explicit deduplication logic in agent code.
3. THE Creative_State store SHALL expose a `read_context(run_id, token_budget)` operation that
   returns the most recent entries fitting within `token_budget` tokens, using the existing
   `assemble_prompt` token-estimation contract from the memory layer.
4. WHILE a Pipeline_Run is running, THE Creative_State store SHALL serve read requests from
   all agent roles concurrently without blocking writes.
5. IF a `read_context` call is made with a `token_budget` of zero or less, THEN THE
   Creative_State store SHALL return an empty context and a structured error without throwing.
6. THE Creative_State store SHALL persist entries as Source_Files under
   `showrunner/runs/<run_id>/state/` using the existing storage sync owner; no second
   persistence path shall be created.
7. THE Creative_State store SHALL be provider-agnostic: entries are plain-text or JSON and do
   not reference provider-specific message formats.


### Requirement 4: Multi-Agent Message Bus

**User Story:** As a solo dev operator, I want a lightweight message bus that lets role-scoped
agents in a Pipeline_Run send typed messages to each other without polling the full
Creative_State so that communication latency and redundant token spend are minimized.

#### Acceptance Criteria

1. THE Message_Bus SHALL route typed messages between agent roles within a single Pipeline_Run
   using `run_id` and `target_role` as the routing keys.
2. WHEN an agent publishes a message to the Message_Bus, THE Message_Bus SHALL deliver it to
   the target role's inbox before that role's next turn begins.
3. THE Message_Bus SHALL support the following message types without requiring a provider-
   specific format: `draft`, `critique`, `revision_request`, `approval`, `choice_signal`,
   and `narration_segment`.
4. IF a message is addressed to a `target_role` that is not registered in the current
   Pipeline_Run's brief, THEN THE Message_Bus SHALL return a structured error and not discard
   the message silently.
5. THE Message_Bus SHALL persist all delivered messages as append-only records in the
   Creative_State store so the full communication trace is recoverable on resume.
6. WHEN a Pipeline_Run completes or fails, THE Message_Bus SHALL flush all pending inbox
   entries to the run trace before archiving the run.


### Requirement 5: Podcast Pipeline

**User Story:** As a solo dev operator, I want to run an automated podcast pipeline that
researches a topic, writes a structured script with speaker turns, and produces a multi-voice
narration manifest so that I can generate a complete podcast episode without leaving agenticgraph.

#### Acceptance Criteria

1. THE Podcast_Pipeline SHALL execute the following agent-role sequence when
   `run_type: podcast` is declared in the brief: `researcher` → `scriptwriter` →
   `director` → `narrator_router`.
2. WHEN the `researcher` agent completes, THE Podcast_Pipeline SHALL write a research pack to
   the Creative_State store using the existing `research.scout` contract from the SuperAgent
   harness, reusing that owner without duplication.
3. WHEN the `scriptwriter` agent completes, THE Podcast_Pipeline SHALL produce a `Script`
   document conforming to the `agenticgraph-script/v1` schema (fields: `title`, `segments[]`,
   where each segment has `speaker`, `text`, `stage_direction`, `duration_estimate_s`).
4. THE Script parser SHALL parse `agenticgraph-script/v1` documents into `Script` objects.
5. THE Script printer SHALL format `Script` objects back into valid `agenticgraph-script/v1`
   Markdown documents.
6. FOR ALL valid `Script` objects, parsing then printing then parsing SHALL produce an
   equivalent object (round-trip property).
7. WHEN the `narrator_router` agent processes a `Script`, THE Podcast_Pipeline SHALL resolve
   each `speaker` value in the script against the `Narrator_Voice_Map` supplied at runtime;
   no voice endpoint shall be hardcoded.
8. IF a `speaker` value in a `Script` has no entry in the `Narrator_Voice_Map`, THEN
   THE Podcast_Pipeline SHALL emit a structured gap-report entry and continue with remaining
   segments rather than failing the entire run.
9. THE Podcast_Pipeline SHALL write a narration manifest to
   `showrunner/runs/<run_id>/narration-manifest.md` listing each segment, its resolved voice
   endpoint, and its estimated duration before any TTS call is made.
10. WHEN the operator approves the narration manifest, THE Podcast_Pipeline SHALL invoke the
    TTS provider for each segment through the existing Rich_Media_Panel audio output path;
    no parallel audio rendering path shall be created.


### Requirement 6: Narrative Game Engine

**User Story:** As a solo dev operator, I want a Narrative_Game_Engine that dynamically extends
and traverses a Choice_Graph based on player choices so that an AI agent can generate
contextually coherent story continuations at runtime without recomputing the full graph.

#### Acceptance Criteria

1. THE Narrative_Game_Engine SHALL extend the existing Strytree Choice_Graph by exposing a
   runtime API for agent-driven branch generation; it SHALL NOT replace or fork the Strytree
   renderer or edge-projection contract.
2. WHEN a player submits a choice signal, THE Narrative_Game_Engine SHALL route the signal
   through the Message_Bus as a `choice_signal` message to the `story_agent` role.
3. WHEN the `story_agent` receives a `choice_signal`, THE Narrative_Game_Engine SHALL generate
   one or more new story branches and append them to the Choice_Graph as candidate nodes using
   the Strytree `forkcompare` workbench contract; no branch shall be committed to the active
   graph without the review gate.
4. THE Narrative_Game_Engine SHALL maintain a `world_state` record in the Creative_State store
   after each choice resolution, recording the active branch id, narrative context summary,
   and turn index; this record SHALL be used as the context window for subsequent agent turns.
5. WHILE a narrative session is active, THE Narrative_Game_Engine SHALL bound the
   `world_state` context to `max_context_tokens` from the brief before each agent turn,
   using the `read_context` operation from the Creative_State store.
6. IF the `story_agent` cannot generate a valid branch within `max_retries` attempts, THEN
   THE Narrative_Game_Engine SHALL present the operator with the last partial branch and a
   structured error rather than silently stalling the session.
7. THE Narrative_Game_Engine SHALL persist the complete Choice_Graph as a Source_File at
   `showrunner/runs/<run_id>/choice-graph.md` on each branch commit using the existing
   storage sync owner.
8. THE Narrative_Game_Engine SHALL be renderer-agnostic: the Choice_Graph renders through
   the existing Strytree and Storyboard projection contracts without a Narrative_Game_Engine-
   specific renderer branch.


### Requirement 7: Multi-Agent Writers' Room

**User Story:** As a solo dev operator, I want a multi-agent Writers' Room session that
brainstorms, drafts, critiques, and revises content collaboratively so that the output
draft has traceable revision history and a clear convergence signal before final
acceptance.

#### Acceptance Criteria

1. THE Writers_Room_Session SHALL execute the following agent-role sequence when
   `run_type: writers_room` is declared in the brief: `brainstormer` → `drafter` →
   `critic` → `revisor`, repeating the `critic` → `revisor` cycle up to `max_revision_cycles`
   before converging.
2. WHEN the `brainstormer` agent completes, THE Writers_Room_Session SHALL write an
   `IdeaSet` record to the Creative_State store listing candidate premises, themes, and
   constraints before the `drafter` is invoked.
3. WHEN the `drafter` agent produces a draft, THE Writers_Room_Session SHALL assign it a
   monotonically increasing `draft_version` and persist it to
   `showrunner/runs/<run_id>/drafts/v<draft_version>.md` through the Source_Files owner.
4. WHEN the `critic` agent receives a draft, THE Writers_Room_Session SHALL constrain the
   critic's context to the current `draft_version` plus the `IdeaSet` from Creative_State;
   no prior draft versions shall be re-injected unless explicitly requested.
5. WHEN the `critic` agent produces a critique, THE Writers_Room_Session SHALL route it to
   the `revisor` via the Message_Bus as a `critique` message.
6. WHEN the `revisor` agent produces a revised draft, THE Writers_Room_Session SHALL
   increment `draft_version` and persist the new draft before the next critic cycle.
7. IF `max_revision_cycles` is reached without operator convergence approval, THEN THE
   Writers_Room_Session SHALL emit a convergence-timeout event and present all draft versions
   for manual operator selection rather than silently picking the latest.
8. THE Writers_Room_Session SHALL produce a `RevisionHistory` record listing all draft
   versions, critic scores, and revisor change summaries, persisted at
   `showrunner/runs/<run_id>/revision-history.md`.
9. THE Writers_Room_Session SHALL be agent-count-agnostic: additional roles (e.g. a second
   `critic` with a different persona) can be declared in the brief without modifying the
   session logic.


### Requirement 8: Showrunner MCP Tool Surface

**User Story:** As an agent or MCP host operator, I want MCP tools that cover the full
showrunner lifecycle so that external agents and automation can start runs, query status,
post state, advance choices, and submit critiques without direct access to the canvas UI.

#### Acceptance Criteria

1. THE Showrunner_MCP SHALL expose the following tools, each following the local MCP tool
   contract pattern from `mcp/local-tool-contract.js`:
   - `agenticgraph.showrunner.start_run` — accepts a Creative_Brief path or inline brief;
     returns `run_id` and initial `run_status`.
   - `agenticgraph.showrunner.run_status` — accepts `run_id`; returns current pipeline state
     and last committed Creative_State entry.
   - `agenticgraph.showrunner.post_choice` — accepts `run_id` and `choice_signal`; routes the
     signal to the Narrative_Game_Engine.
   - `agenticgraph.showrunner.submit_critique` — accepts `run_id`, `draft_version`, and
     `critique_text`; routes the critique through the Writers_Room Message_Bus.
   - `agenticgraph.showrunner.approve_stage` — accepts `run_id` and `stage_id`; releases the
     approval gate for that stage and resumes the orchestrator.
   - `agenticgraph.showrunner.get_artifact` — accepts `run_id` and `artifact_type`; returns
     the Source_File path for the requested artifact.
2. WHEN `agenticgraph.showrunner.start_run` is called, THE Showrunner_MCP SHALL validate the
   brief and return a structured error if validation fails, without starting a run.
3. WHEN `agenticgraph.showrunner.approve_stage` is called for a `run_id` in `awaiting_review`
   state, THE Showrunner_MCP SHALL release the approval gate and transition the run to
   `running` within one orchestrator cycle.
4. IF `agenticgraph.showrunner.post_choice` is called on a run not in `running` state, THEN
   THE Showrunner_MCP SHALL return a structured error naming the current state.
5. THE Showrunner_MCP tools SHALL be read-safe: `run_status` and `get_artifact` SHALL
   never mutate Creative_State or trigger agent turns.
6. THE Showrunner_MCP SHALL register all tools in the existing `buildAgenticGraphLocalMcpToolDefinitions()`
   registry without creating a parallel MCP server.


### Requirement 9: Pipeline Run Lifecycle

**User Story:** As a solo dev operator, I want a durable, observable Pipeline_Run lifecycle
so that I can track every showrunner run from submission through completion, resume
interrupted runs, and archive completed ones without data loss.

#### Acceptance Criteria

1. THE Pipeline_Run lifecycle SHALL define exactly six states: `queued`, `running`,
   `awaiting_review`, `complete`, `failed`, and `archived`; no additional states shall be
   introduced without updating this spec.
2. THE Pipeline_Run SHALL transition states only through defined events:
   - `queued` → `running`: orchestrator picks up the run.
   - `running` → `awaiting_review`: budget gate or review point reached.
   - `awaiting_review` → `running`: operator approval received.
   - `running` → `complete`: final artifact written.
   - `running` → `failed`: unrecoverable error after `max_retries`.
   - `complete` | `failed` → `archived`: explicit archive action.
3. WHEN a Pipeline_Run transitions to `failed`, THE Showrunner_Orchestrator SHALL write
   a `failure_report.md` to the run directory before halting, naming the failing agent role,
   turn index, and structured error.
4. THE Pipeline_Run state SHALL be persisted as a Source_File at
   `showrunner/runs/<run_id>/state.json` and synced through the existing storage sync owner;
   no second state store shall be created.
5. WHEN the platform restarts, THE Showrunner_Orchestrator SHALL resume all runs in `running`
   or `awaiting_review` state from their last committed state.json checkpoint without
   re-executing completed turns.
6. THE Pipeline_Run lifecycle SHALL expose a `list_runs(filter)` operation that returns runs
   by state, run_type, and date range without loading full Creative_State into memory.
7. WHEN a Pipeline_Run is archived, THE Showrunner_Orchestrator SHALL produce a final
   `Artifact_Package` manifest listing all Source_Files written during the run and their
   content hashes.


### Requirement 10: Token Economics and Cost Attribution

**User Story:** As a solo dev operator focused on TCO and token performance, I want
per-run token attribution that tracks spend by agent role and pipeline stage so that I
can optimize the most expensive steps and stay within budget across multi-agent sessions.

#### Acceptance Criteria

1. THE Showrunner_Orchestrator SHALL record a `cost_log` entry for every agent turn,
   capturing `agent_role`, `model_id`, `input_tokens`, `output_tokens`,
   `turn_index`, and `stage_id`.
2. THE Showrunner_Orchestrator SHALL accumulate a `run_token_total` in the Pipeline_Run
   state after each turn and halt execution before the next turn if `run_token_total`
   would exceed the brief's `token_budget`.
3. WHEN the operator queries `run_status`, THE Showrunner_Orchestrator SHALL include
   `run_token_total`, `token_budget`, and `token_budget_remaining` in the response.
4. THE cost_log SHALL be persisted as a Source_File at
   `showrunner/runs/<run_id>/cost-log.jsonl` using the existing storage sync owner; entries
   SHALL be appended, never overwritten.
5. WHEN the `read_context` operation is called, THE Creative_State store SHALL include the
   estimated token cost of the returned context in the response without making a provider
   call, reusing the `agenticgraph.memory.assemble_prompt` token-estimation contract.
6. THE token attribution system SHALL be provider-neutral: cost_log entries use
   `input_tokens` and `output_tokens` fields regardless of the provider's native cost unit.
7. WHERE a provider does not return token counts, THE Showrunner_Orchestrator SHALL estimate
   token counts using the shared token-estimate helper from the memory layer contract and
   record `estimated: true` in the cost_log entry.


### Requirement 11: Canvas Integration and Storyboard Widget Surface

**User Story:** As a solo dev operator, I want to view and manage showrunner runs from
the existing agenticgraph canvas so that the AI Showrunner is a first-class feature of the
editor workspace, not a separate CLI-only tool.

#### Acceptance Criteria

1. THE AI_Showrunner SHALL expose a `showrunner` Storyboard Widget node type in the existing
   `kgc-computing-flow/v1` registry, following the `SwarmPrediction` and `TextGeneration`
   node registration patterns.
2. WHEN a `showrunner` node runs in the Storyboard Widget, THE AI_Showrunner SHALL start or resume
   a Pipeline_Run and write outputs — research pack, script, draft, choice graph — as
   connected node properties through the existing connected-value/Rich_Media_Panel owner.
3. THE showrunner Storyboard Widget node SHALL expose input ports for `brief_path` and
   `run_id` and output ports for `run_status`, `latest_artifact_path`, and
   `token_spend_summary`.
4. WHEN a Pipeline_Run emits a review gate, THE AI_Showrunner SHALL surface an approval
   widget in the Storyboard Widget using the existing approval-gate and budget-meter primitives;
   no second approval UX shall be created.
5. THE showrunner canvas surface SHALL render the Choice_Graph, script draft, and revision
   history through the existing Strytree, Strybldr, and Storyboard projections respectively;
   no new renderer shall be introduced for showrunner outputs.
6. THE AI_Showrunner SHALL register its canvas node in the vdeoxpln agent-skill registry
   following the `agenticgraph-memory-layer` pattern in `agenticgraphVdeoxplnContract.mjs`.


### Requirement 12: Memory and Context Continuity

**User Story:** As a solo dev operator, I want showrunner agents to persist and retrieve
relevant context across turns and runs using the existing memory layer so that agents
do not start cold and do not re-inject stale or duplicate context.

#### Acceptance Criteria

1. THE AI_Showrunner SHALL use the `agenticgraph.memory.add` and `agenticgraph.memory.search`
   MCP tools from the existing memory layer as the exclusive mechanism for cross-turn
   agent memory; no parallel memory store shall be created.
2. WHEN an agent completes a turn, THE Showrunner_Orchestrator SHALL call
   `agenticgraph.memory.add` with the agent's output summary, scoped by `run_id` and
   `agent_role`, before routing the output to the next agent.
3. WHEN a new agent turn begins, THE Showrunner_Orchestrator SHALL call
   `agenticgraph.memory.search` with the incoming context query and `top_k` bounded by the
   brief's `max_memory_tokens`, then assemble the prompt using
   `agenticgraph.memory.assemble_prompt` before dispatching the LLM call.
4. IF `agenticgraph.memory.search` returns an empty result, THE Showrunner_Orchestrator SHALL
   proceed with the base system prompt and record the empty-recall event in the run trace
   without halting.
5. THE memory scope for showrunner runs SHALL use `run_id` as the `run_id` scope and
   `agent_role` as the `agent_id` scope in all memory operations, following the
   existing scope-validation contract.
6. THE AI_Showrunner SHALL not store TTS voice endpoints, provider API keys, or literal
   credential values in the memory store.


### Requirement 13: Anti-Pattern Guards and Platform Neutrality

**User Story:** As a platform maintainer, I want the AI Showrunner to be built against
the same hygiene and neutrality constraints as the rest of agenticgraph so that it does not
introduce hardcoded identifiers, duplicate owners, provider forks, or stale state.

#### Acceptance Criteria

1. THE AI_Showrunner SHALL derive all run-scoped identifiers using
   `buildScopedGraphSemanticKey()`; no `run_id`, `agent_id`, `turn_id`, `draft_version`
   identifier shall be a hardcoded literal in source.
2. THE AI_Showrunner SHALL not introduce a second chat-to-canvas application pipeline;
   all LLM outputs that mutate the canvas SHALL flow through the existing
   `chatKgcCanvasApply.ts` owner.
3. THE AI_Showrunner SHALL not add provider-specific renderer branches; all showrunner
   output types (script, draft, choice graph, narration manifest) SHALL render through
   the existing renderer-contract `kgSharedRendererContract@shared-renderer-contract/v1`.
4. THE AI_Showrunner SHALL not create a parallel MCP server; all showrunner MCP tools
   SHALL be registered in `buildAgenticGraphLocalMcpToolDefinitions()`.
5. THE AI_Showrunner SHALL not hardcode any TTS provider URL, voice ID, model name,
   or API key in source; all provider references SHALL be resolved from runtime
   environment config or the brief's `narrator_voice_map`.
6. WHEN the `npm run hygiene:check` script is executed, THE codebase SHALL pass without
   new violations introduced by the AI Showrunner implementation.
7. THE AI_Showrunner SHALL not introduce backward-compatibility aliases or legacy
   remapping layers; if a contract changes, the old contract SHALL be removed at the
   source, not aliased.
8. THE AI_Showrunner SHALL not perform recursive or unbounded loops; every agent
   iteration, retry, revision cycle, and message-bus delivery SHALL be bounded by
   explicit limits declared in the Creative_Brief or the system defaults.


### Requirement 14: Validation and Dev-Runtime Proof

**User Story:** As a solo dev operator, I want focused tests and a dry-run mode so that
I can prove the showrunner pipeline works end-to-end without incurring paid API calls
and without deploying to Prod or Cloudflare.

#### Acceptance Criteria

1. THE AI_Showrunner SHALL provide a dry-run mode where all agent turns are executed with
   deterministic mock provider responses, producing the same artifact structure as a live
   run with zero paid API calls.
2. WHEN dry-run mode is active, THE Showrunner_Orchestrator SHALL set `paidCallCount: 0`
   in the run manifest, following the Strybldr dry-run proof pattern.
3. THE AI_Showrunner SHALL include focused unit tests for: brief validation, Creative_State
   append/read, Message_Bus routing, orchestrator state transitions, and token attribution —
   following the `npm --prefix canvas run test:ci:unit` runner convention.
4. THE AI_Showrunner SHALL include a round-trip test for the `agenticgraph-showrunner-brief/v1`
   and `agenticgraph-script/v1` parsers.
5. THE AI_Showrunner SHALL register in the vdeoxpln check manifest so that
   `npm run vdeoxpln:check` verifies showrunner agents are present in the skill registry.
6. THE AI_Showrunner implementation SHALL pass `npm --prefix canvas run typecheck` without
   introducing new type errors.
7. THE AI_Showrunner SHALL operate fully in Dev without any Prod or Cloudflare deployment;
   no capability SHALL be gated on a deployed Cloudflare resource until the operator
   explicitly requests deployment.
