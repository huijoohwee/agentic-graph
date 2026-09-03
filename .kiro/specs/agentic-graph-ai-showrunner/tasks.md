# Implementation Plan: agentic-graph AI Showrunner

## Overview

Implements the AI Showrunner orchestration layer for agentic-graph across three creative pipeline
scenarios (podcast, narrative game, writers' room). All 15 new files land exclusively under
`canvas/src/features/ai-showrunner/` plus two MCP/Vdeoxpln registration extension points.
No existing owners are modified beyond those two append-only registration calls.

Build order follows hard dependencies: types → foundation → core stores → orchestrator →
pipelines (parallel) → integration → test harness → validation.

---

## Tasks

- [ ] 1. Foundation layer — types, semantic key wiring, script schema, brief parser

  - [ ] 1.1 Create `showrunnerTypes.ts` — all shared TypeScript types and Zod schemas
    - Define `ShowrunnerBriefSpec`, `AgentRoleEntry`, `NarratorVoiceMapEntry`
    - Define `CreativeStateEntry`, `MessageBusMessage`, `MessageBusMessageType`
    - Define `PipelineRunState`, `PipelineRunStatus`, `CostLogEntry`
    - Define `Script`, `ScriptSegment`
    - Define `ShowrunnerError`, `ShowrunnerErrorCode` (all 12 codes)
    - Define `LifecycleEvent` union, `FailureReport`, `RunListFilter`
    - Export all interfaces: `IBriefParser`, `IScriptSchema`, `ICreativeStateStore`,
      `IMessageBus`, `IShowrunnerOrchestrator`, `ITokenAttribution`, `IPipelineRunLifecycle`
    - All identifiers imported from `buildScopedGraphSemanticKey` — no UUID literals
    - _Requirements: 1.1, 1.2, 3.1, 4.3, 5.3, 9.1, 10.1, 13.1_

  - [ ] 1.2 Create `briefParser.ts` — `ShowrunnerBriefSpec` parse / print
    - Implement `IBriefParser.parse()`: validate frontmatter-first Markdown against
      `schema: agentic-graph-showrunner-brief/v1`; return `{ ok: false; errors[] }` on any
      missing required field (`run_type`, `title`, `token_budget`, `agent_role[]`)
    - Implement `IBriefParser.print()`: format `ShowrunnerBriefSpec` → valid
      `agentic-graph-showrunner-brief/v1` Markdown with frontmatter
    - Call `buildScopedGraphSemanticKey()` for all run-scoped id derivations; zero hardcoded literals
    - No provider-specific logic; pure parse/print contract
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8_

  - [ ]* 1.3 Write property test for brief round-trip
    - Create `canvas/src/features/ai-showrunner/__tests__/arbitraries.ts` with `arbBriefSpec`,
      `arbScript`, `arbStateEntry`, `arbTokenBudget`, `arbNegativeBudget`, `arbVoiceMap`
      using fast-check; minimum 100 iterations
    - Create `canvas/src/features/ai-showrunner/__tests__/briefParser.test.ts`
    - **Property 1: Brief Round-Trip** — `parse(print(spec))` produces equivalent spec
    - **Validates: Requirements 1.6, 1.7, 1.8**

  - [ ] 1.4 Create `scriptSchema.ts` — `Script` parse / print (`agentic-graph-script/v1`)
    - Implement `IScriptSchema.parse()`: validate `schema: agentic-graph-script/v1`; require
      `title`, `run_id`, and `segments[]` with `speaker` + `text` per segment
    - Implement `IScriptSchema.print()`: format `Script` → valid `agentic-graph-script/v1` Markdown
    - Round-trip guarantee: `parse(print(script))` produces equivalent `Script`
    - _Requirements: 5.3, 5.4, 5.5, 5.6_

  - [ ]* 1.5 Write property test for script round-trip
    - Create `canvas/src/features/ai-showrunner/__tests__/scriptSchema.test.ts`
    - **Property 2: Script Round-Trip** — `parse(print(script))` produces equivalent script
      for 1–20 segments with varying optional fields
    - **Validates: Requirements 5.4, 5.5, 5.6**

- [ ] 2. Core store — Creative State Store, Message Bus, Token Attribution, Pipeline Lifecycle

  - [ ] 2.1 Create `creativeStateStore.ts` — append-only Creative_State log
    - Implement `ICreativeStateStore.append()`: write entry keyed by `run_id`,
      `agent_role`, `turn_index`, `content_hash`; reject with `DUPLICATE_CONTENT_HASH`
      if `content_hash` already exists for `run_id`
    - Implement `ICreativeStateStore.readContext(runId, tokenBudget)`: return most-recent
      entries fitting `tokenBudget` using `agentic-graph.memory.assemble_prompt` token-estimation;
      return empty context + structured `INVALID_TOKEN_BUDGET` error when `tokenBudget ≤ 0`
    - Persist entries as Source_Files under `showrunner/runs/<run_id>/state/` via existing
      Source_Files owner exclusively — no second persistence path
    - Plain-text / JSON content only; zero provider-specific message format
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 10.5_

  - [ ]* 2.2 Write property tests for Creative State Store
    - Create `canvas/src/features/ai-showrunner/__tests__/creativeStateStore.test.ts`
    - **Property 3: Append-Only Monotonic Growth** — N distinct appends → log size exactly N,
      in append order
    - **Property 4: Deduplication by content_hash** — second append with same
      `(run_id, content_hash)` returns structured error; log size unchanged
    - **Property 7: Zero-or-Negative Token Budget** — `readContext(run_id, budget ≤ 0)`
      returns empty entries, `estimatedTokens: 0`, non-null `error`, no thrown exception
    - **Validates: Requirements 3.1, 3.2, 3.5**

  - [ ] 2.3 Create `messageBus.ts` — typed pub/sub routing between agent roles
    - Implement `IMessageBus.publish()`: route typed `MessageBusMessage` by `run_id` +
      `target_role`; return `UNREGISTERED_ROLE` error if `target_role` not in brief
    - Implement `IMessageBus.drainInbox(runId, role)`: return and clear pending messages
      for role; messages delivered before the role's next turn
    - Implement `IMessageBus.flush(runId)`: persist all pending inbox entries to
      Creative_State store before run archives; no silent discard
    - Persist all delivered messages as append-only records in Creative_State store
    - Support all 6 message types: `draft`, `critique`, `revision_request`, `approval`,
      `choice_signal`, `narration_segment`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 2.4 Write property tests for Message Bus
    - Create `canvas/src/features/ai-showrunner/__tests__/messageBus.test.ts`
    - **Property 8: Unregistered Target Role Returns Structured Error** — any message where
      `target_role` is absent from `brief.agent_roles` → `{ ok: false, error: <non-empty> }`
      and no silent discard
    - **Validates: Requirements 4.4**

  - [ ] 2.5 Create `tokenAttribution.ts` — per-turn cost_log + budget enforcement
    - Implement `ITokenAttribution.record(entry)`: append `CostLogEntry` to
      `showrunner/runs/<run_id>/cost-log.jsonl` via Source_Files owner; entries appended,
      never overwritten
    - Implement `ITokenAttribution.checkBudget(runId, estimatedTokens)`: return `true`
      if `run_token_total + estimatedTokens ≤ token_budget`
    - Implement `ITokenAttribution.estimate(text)`: use shared token-estimate helper from
      memory layer; no provider call
    - Set `estimated: true` in `CostLogEntry` when provider omits token counts
    - Use `input_tokens` / `output_tokens` field names; provider-neutral
    - _Requirements: 10.1, 10.2, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 2.6 Write property tests for Token Attribution
    - Create `canvas/src/features/ai-showrunner/__tests__/tokenAttribution.test.ts`
    - **Property 12: Token Budget Safety Invariant** — for any token_budget B and any
      sequence of turn costs, orchestrator never dispatches turn k if
      `sum(c_1..c_{k-1}) + estimated_cost(turn_k) > B`; `run_token_total` never
      exceeds `token_budget` at dispatch time
    - **Validates: Requirements 10.2**

  - [ ] 2.7 Create `pipelineRunLifecycle.ts` — state machine + failure report + archive
    - Define exactly 6 states: `queued`, `running`, `awaiting_review`, `complete`,
      `failed`, `archived`; no additional states
    - Implement `IPipelineRunLifecycle.transition(runId, event)`: enforce only the 7 valid
      transitions (table in design §State Machine); return structured `INVALID_RUN_STATE`
      error for invalid transitions
    - Implement `writeFailureReport(runId, report)`: write `failure_report.md` with
      `failing_role`, `turn_index`, `error_code`, `error_message` to run directory via
      Source_Files owner before halting
    - Implement `writeArtifactManifest(runId)`: produce final `manifest.md` listing all
      Source_Files written during run and their content hashes
    - Persist `state.json` on every transition via Source_Files / storage sync; no second state store
    - Implement `list_runs(filter)`: filter by state, run_type, date range; no full
      Creative_State loaded into memory
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7_

  - [ ] 2.8 Checkpoint — unit tests for core stores pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Showrunner Orchestrator

  - [ ] 3.1 Create `showrunnerOrchestrator.ts` — Pipeline_Run sequencing, routing, resume, approval
    - Implement `IShowrunnerOrchestrator.startRun(briefOrPath)`: validate brief via
      `IBriefParser`; persist to `showrunner/briefs/<run_id>/brief.md`; derive all
      identifiers via `buildScopedGraphSemanticKey()`; transition `queued → running`
    - Implement agent-role sequencing: dispatch each role in `agent_pipeline` order; after
      each turn append output to Creative_State store before invoking next role
    - Implement budget gate: call `tokenAttribution.checkBudget()` before every agent
      invocation; emit `BUDGET_GATE` lifecycle event on budget overflow → `awaiting_review`
    - Implement retry logic: on structured error increment `retry_counts[role]` in state.json;
      re-dispatch up to `max_retries`; on exhaustion transition to `failed` + write
      `failure_report.md`
    - Implement `IShowrunnerOrchestrator.runStatus(runId)`: return `PipelineRunState`
      including `run_token_total`, `token_budget`, `token_budget_remaining`; read-only,
      no state mutation
    - Implement `IShowrunnerOrchestrator.resumeRun(runId)`: load state.json; resume from
      `current_turn_index + 1`; do not re-execute completed turns
    - Implement `IShowrunnerOrchestrator.approveStage(runId, stageId)`: release approval
      gate; transition `awaiting_review → running` within one orchestrator cycle
    - On `complete`: write `manifest.md` via Source_Files
    - Call `agentic-graph.memory.add` after each turn + `agentic-graph.memory.search` before each
      turn using `run_id` + `agent_role` scopes; handle empty recall via `MEMORY_RECALL_EMPTY`
      event (no halt)
    - Dispatch LLM agent turns through `chatAgenticOsCanvasApply.ts` exclusively; no direct
      provider calls
    - Provider-neutral: zero provider-specific forks
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 10.1, 10.2, 10.3, 12.1, 12.2, 12.3, 12.4, 12.5, 13.2_

  - [ ]* 3.2 Write property tests for Showrunner Orchestrator
    - Create `canvas/src/features/ai-showrunner/__tests__/showrunnerOrchestrator.test.ts`
    - **Property 5: run_status is Read-Only and Idempotent** — N calls to `runStatus(runId)`
      return same `PipelineRunState`; `state.json` unchanged
    - **Property 6: Orchestrator Re-entrance on Resume** — resume from `current_turn_index = K`
      dispatches from K+1; no re-execution or re-append of turns ≤ K
    - **Validates: Requirements 2.5, 2.8**

  - [ ] 3.3 Checkpoint — orchestrator state machine tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Pipelines — Podcast, Narrative Game Engine, Writers' Room (implement in parallel)

  - [ ] 4.1 Create `podcastPipeline.ts` — researcher → scriptwriter → director → narrator_router
    - Wire the 4-role sequence when `run_type: podcast`
    - Researcher role: invoke existing `research.scout` contract from SuperAgent harness;
      write research pack to Creative_State store — reuse owner, no duplication
    - Scriptwriter role: produce `Script` conforming to `agentic-graph-script/v1` via `scriptSchema.ts`
    - Director role: process directed_script; append to Creative_State
    - narrator_router role: resolve each `Script.segment.speaker` against
      `Narrator_Voice_Map` from runtime brief; zero hardcoded voice endpoints
    - On missing speaker: emit structured `VOICE_MAP_GAP` gap-report entry and continue
      remaining segments (no run failure)
    - Write narration manifest to `showrunner/runs/<run_id>/narration-manifest.md` via
      Source_Files before any TTS call
    - On operator approval of narration manifest: invoke TTS through `richMediaRun.ts`
      audio path exclusively; no parallel audio rendering path
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 5.8, 5.9, 5.10_

  - [ ]* 4.2 Write property tests for Podcast Pipeline voice map coverage
    - Create `canvas/src/features/ai-showrunner/__tests__/podcastPipeline.test.ts`
    - **Property 9: Narrator Voice Map Covers All Speakers or Emits Gap-Report** — for any
      `Script` with N distinct speakers and any `Narrator_Voice_Map`, sum of resolved segments
      + gap_report entries = N; run continues in either case
    - **Validates: Requirements 5.7, 5.8**

  - [ ] 4.3 Create `narrativeGameEngine.ts` — Choice_Graph runtime API extending Strytree
    - Implement `NarrativeGameEngine.extendChoiceGraph()`: generate candidate branch nodes and
      submit them to Strytree `forkcompare` workbench; do not commit without review gate
    - Route player choice signals through Message_Bus as `choice_signal` to `story_agent`
    - After each choice resolution: write `world_state` record to Creative_State store
      (active_branch_id, narrative context summary, turn_index)
    - Bound world_state context to `max_context_tokens` from brief using `readContext()`
      before each agent turn
    - On `max_retries` exhausted for branch generation: surface last partial branch +
      structured `BRANCH_GENERATION_FAILED` error to operator (no silent stall)
    - Persist Choice_Graph to `showrunner/runs/<run_id>/choice-graph.md` on each branch commit
    - Renderer-agnostic: Choice_Graph renders through existing Strytree + Storyboard projections;
      no NGE-specific renderer branch
    - Extend Strytree at `forkcompare` contract level only; do not replace or fork
      Strytree renderer or edge-projection contract
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [ ]* 4.4 Write property tests for Narrative Game Engine
    - Create `canvas/src/features/ai-showrunner/__tests__/narrativeGameEngine.test.ts`
    - **Property 10: world_state Written After Every Choice Resolution** — M choice signals
      → Creative_State contains exactly M `world_state` entries with strictly increasing
      `turn_index` values
    - **Validates: Requirements 6.4**

  - [ ] 4.5 Create `writersRoomSession.ts` — brainstormer → drafter → critic → revisor loop
    - Wire the 4-role base sequence when `run_type: writers_room`
    - brainstormer: write `IdeaSet` record to Creative_State before drafter is invoked
    - drafter: assign monotonically increasing `draft_version`; persist
      `showrunner/runs/<run_id>/drafts/v<N>.md` via Source_Files
    - critic: constrain context to current `draft_version` + `IdeaSet` only; no prior
      draft re-injection unless explicitly requested
    - Critic → revisor: route `critique` message via Message_Bus
    - revisor: produce revised draft; increment `draft_version`; persist before next cycle
    - Repeat `critic → revisor` up to `max_revision_cycles`; on exhaustion emit
      `CONVERGENCE_TIMEOUT` event and surface all draft versions for manual selection
    - Persist `revision-history.md` (all versions, critic scores, revisor change summaries)
    - Agent-count-agnostic: additional roles in brief require no session logic changes
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [ ]* 4.6 Write property tests for Writers' Room Session
    - Create `canvas/src/features/ai-showrunner/__tests__/writersRoomSession.test.ts`
    - **Property 11: draft_version is Monotonically Increasing** — sequence of
      `draft_version` values is strictly increasing; no repeat, skip, or decrement
    - **Validates: Requirements 7.3**

  - [ ] 4.7 Checkpoint — pipeline unit tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Integration — MCP tools registration, Storyboard Widget node, Vdeoxpln registration

  - [ ] 5.1 Create `showrunnerMcpTools.ts` — 6 MCP tool definitions
    - Export frozen `SHOWRUNNER_MCP_TOOL_NAMES` constant (6 tool name strings)
    - Define input schemas for all 6 tools following design §MCP Tool Schemas:
      `start_run`, `run_status`, `post_choice`, `submit_critique`, `approve_stage`,
      `get_artifact`
    - Annotate `run_status` and `get_artifact` with `readOnlyHint: true`,
      `idempotentHint: true`, `destructiveHint: false` matching `READ_ONLY_TOOL_ANNOTATIONS`
    - Validate `start_run` input; return structured `BRIEF_VALIDATION_ERROR` on failure
    - `post_choice` returns `INVALID_RUN_STATE` error if run not in `running` state
    - `approve_stage` releases gate; transitions `awaiting_review → running`
    - `run_status` and `get_artifact` never mutate Creative_State or trigger agent turns
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 5.2 Register MCP tools in `mcp/local-tool-contract.js` (extension point only)
    - Append the 6 showrunner tool definitions to the array returned by
      `buildAgenticGraphLocalMcpToolDefinitions()` following the existing
      `withLocalMcpDescriptorDefaults()` pattern
    - Zero modifications to any other logic in that file
    - No parallel MCP server created
    - _Requirements: 8.6, 13.4_

  - [ ] 5.3 Create `showrunnerFlowNode.ts` — Storyboard Widget node registration
    - Export `SHOWRUNNER_WIDGET_ENTRY: WidgetRegistryEntry` with
      `nodeTypeId: "showrunner"`, `widgetTypeId: "agentic-graph-showrunner"`,
      `formId: "showrunner-form"`
    - Declare input ports: `brief_path`, `run_id`, `dry_run`
    - Declare output ports: `run_status`, `latest_artifact_path`, `token_spend_summary`
    - Follow `SwarmPrediction` and `TextGeneration` registration patterns exactly
    - On run: start or resume Pipeline_Run; write outputs through connected-value /
      Rich_Media_Panel owner
    - Surface approval widget via existing approval-gate + budget-meter primitives;
      no second approval UX
    - Render Choice_Graph, script draft, revision history through existing Strytree,
      Strybldr and Storyboard projections; no new renderer
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ] 5.4 Create `showrunnerVdeoxpln.ts` — Vdeoxpln skill registry entry
    - Export `agentic-graph-ai-showrunner` `RAW_VDEOXPLN` entry with showrunner triggers,
      owners, local MCP tool names, and AI policy
    - Reference `SHOWRUNNER_WIDGET_ENTRY` in `owners`
    - List all 6 showrunner MCP tool names in `tools.local`
    - Follow the `agentic-graph-memory-layer` pattern from `agentic-graph-vdeoxpln-contract.mjs`
    - _Requirements: 11.6_

  - [ ] 5.5 Register Vdeoxpln entry in `agentic-graph-vdeoxpln-contract.mjs` (extension point only)
    - Append `AGENTIC_OS_VDEOXPLN_IDS.aiShowrunner = "agentic-graph-ai-showrunner"` to the
      existing frozen `AGENTIC_OS_LOCAL_MCP_TOOL_NAMES` object following the `memoryAdd`,
      `memorySearch` pattern
    - Append the `showrunnerVdeoxpln.ts` entry to `RAW_VDEOXPLN`
    - Zero modifications to any other logic in that file
    - _Requirements: 11.6, 13.1_

  - [ ] 5.6 Checkpoint — MCP + Storyboard Widget integration wired
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Test harness — dry-run mode, unit tests, PBT tests

  - [ ] 6.1 Create `showrunnerDryRun.ts` — deterministic mock provider + dry-run harness
    - Implement `IMockProvider` interface with `generate(role, turnIndex, context)` returning
      deterministic, structurally valid fixture responses per role (no randomness)
    - Implement `buildDeterministicMockProvider()` factory; canned fixtures cover all roles:
      researcher, scriptwriter, director, narrator_router, brainstormer, drafter, critic,
      revisor, story_agent, plus a default fallback
    - When `dry_run: true`: route all agent dispatches to mock provider; set
      `paidCallCount: 0` in manifest; never increment `paidCallCount`
    - Full lifecycle executes in dry-run: state transitions, Creative_State appends,
      cost-log entries, Source_File writes, manifest production — all with mock content
    - Artifact structure identical to live run: same file paths, same frontmatter schema
    - Manifest includes `{ "mode": "dry-run", "paidCallCount": 0, "validation": { "ok": true, "artifactStructureMatch": true } }`
    - _Requirements: 14.1, 14.2, 14.7_

  - [ ]* 6.2 Write property tests for dry-run harness
    - Create `canvas/src/features/ai-showrunner/__tests__/showrunnerDryRun.test.ts`
    - **Property 13: Dry-Run Produces Full Artifact Structure with paidCallCount = 0** —
      for any valid `ShowrunnerBriefSpec` with `dry_run: true`, complete run produces
      same Source_File paths as live run; `paidCallCount = 0`
    - **Validates: Requirements 14.1, 14.2**

  - [ ]* 6.3 Write remaining unit tests for pipeline lifecycle and orchestrator
    - Create `canvas/src/features/ai-showrunner/__tests__/pipelineRunLifecycle.test.ts`
      — every valid transition succeeds; invalid transitions return structured error;
      resume skips completed turns
    - Verify failure report written before halt; `failure_report.md` contains
      `failing_role`, `turn_index`, `error_code`
    - _Requirements: 9.2, 9.3, 9.5, 14.3_

  - [ ] 6.4 Checkpoint — full test suite passes (unit + PBT)
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Validation — typecheck, vdeoxpln:check, hygiene:check, dry-run end-to-end

  - [ ] 7.1 Wire typecheck validation
    - Confirm all 15 new `.ts` files are included in the canvas `tsconfig` compilation scope
    - All types imported from `showrunnerTypes.ts`; zero inline redeclarations
    - Zero `any` escapes that would mask type errors
    - _Requirements: 14.6_

  - [ ] 7.2 Wire vdeoxpln:check validation
    - Confirm `showrunnerVdeoxpln.ts` entry is present in `agentic-graph-vdeoxpln-contract.mjs`
      so `npm run vdeoxpln:check` picks it up without an extra registration step
    - _Requirements: 14.5_

  - [ ] 7.3 Wire hygiene:check validation
    - Confirm no new hygiene violations: no hardcoded IDs / routes / API keys / voice endpoints,
      no duplicate owners, no provider forks, no unbounded loops, no `any` escapes,
      no backward-compat aliases
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 14.6_

  - [ ] 7.4 Final checkpoint — all validation commands pass
    - `npm --prefix canvas run typecheck` — zero new errors
    - `npm --prefix canvas run test:ci:unit` — all showrunner tests pass
    - `npm run vdeoxpln:check` — `agentic-graph-ai-showrunner` present in registry
    - `npm run hygiene:check` — zero new hygiene violations
    - Dry-run end-to-end: `paidCallCount: 0`, full artifact structure produced

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP iteration
- All PBT tests use fast-check with minimum 100 iterations per property
- Implementation is FORBID-guarded: do not edit outside `canvas/src/features/ai-showrunner/`
  or the two registration extension points until user instructs
- No paid API calls until dry-run passes; no Cloudflare/Prod deployment until user instructs
- Each task references specific requirements for full traceability
- Checkpoints after each layer ensure incremental validation without full-suite runs

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["1.3", "1.5"] },
    { "id": 3, "tasks": ["2.1", "2.3", "2.5", "2.7"] },
    { "id": 4, "tasks": ["2.2", "2.4", "2.6"] },
    { "id": 5, "tasks": ["3.1"] },
    { "id": 6, "tasks": ["3.2"] },
    { "id": 7, "tasks": ["4.1", "4.3", "4.5"] },
    { "id": 8, "tasks": ["4.2", "4.4", "4.6"] },
    { "id": 9, "tasks": ["5.1"] },
    { "id": 10, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 11, "tasks": ["5.5"] },
    { "id": 12, "tasks": ["6.1"] },
    { "id": 13, "tasks": ["6.2", "6.3"] },
    { "id": 14, "tasks": ["7.1", "7.2", "7.3"] }
  ]
}
```
