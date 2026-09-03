---
title: "agentic-graph Role-Based Agent Team Runtime"
doc_type: "Runtime Contract"
status: "runtime-ready-dev-local-model-configuration-required"
schema: "agentic-graph-agent-team-runtime-doc/v1"
invocation: "/agent.team #role-based-agent-team @agent-team"
runtime_owner: "mcp/agent-team-runtime.js"
remote_worker_parity: "not-implemented"
---

# Role-Based Agent Team Runtime

agentic-graph registers the canonical Agentic Canvas OS tuple through four local
stdio MCP tools:

- `agentic-graph.agent_team.plan`
- `agentic-graph.agent_team.start`
- `agentic-graph.agent_team.list`
- `agentic-graph.agent_team.control`

The existing `agentic-graph.agentic_canvas_os.docs.invoke` tool remains read-only.
Planning resolves all three invocation tokens through that source-revision-fenced
catalog and fails closed when the requested revision or token kind differs. A
host-owned verifier must also resolve every exact Agent Definition, workflow,
branch, and review-policy revision before a plan is admitted. The canonical
stdio construction supplies that verifier, a local control authorizer, a
file-backed review-receipt verifier, and a durable local Ollama execution
adapter. Execution remains disabled until the operator selects an exact local
model through host environment configuration.

## Source Contract

The caller supplies the URI and digest of a workspace-local JSON team contract.
The runtime opens only a bounded regular file strictly below `AGENTIC_OS_ROOT`.
Network, scheme-based, external, and symlink sources are rejected.

The document names:

- one exact team id and immutable team revision;
- one manager and one through fifteen specialists;
- exact participant, Agent Definition, and Agent Definition revision ids;
- descriptive role, goal, and persona metadata;
- one existing Agent Orchestration workflow id and revision;
- an ordered allowlist of registered branch ids;
- one exact review-policy id and revision;
- source-owned hard bounds.

The source digest is canonical SHA-256 over the JSON document with only
`source.digest` omitted. The source URI remains inside that digest. This avoids
a self-referential digest while fencing every role, revision, workflow,
review-policy, and bound.

Roles, goals, and personas are descriptive metadata. They do not grant facts,
instructions, identity, tools, models, credentials, approval, branch routing,
conversation ownership, or final-answer ownership. The runtime passes
`personaAuthority: false` to the host adapter.

The checked-in runtime-ready source is
`data/config/agents/agent-teams/collaborative-intelligence.json`. It binds one
collaboration manager, one evidence scout, and one risk reviewer to the exact
`workflow.collaborative-intelligence@1.0.0` two-branch workflow and
`review.local-operator@1.0.0`. The owner registry lives at
`data/config/agents/agent-team-workflows.json`; callers cannot alter or extend
it through MCP.

## Lifecycle

`plan` is read-only, zero-model, and zero-spend. It resolves the exact
invocation and local source, applies the lowest source/caller/hard bound, and
returns a deterministic ephemeral `planId` and immutable `planDigest`. A
different request cannot reuse the same plan idempotency key. The canonical
local host resolves only exact checked-in Agent Definition, workflow, branch,
and review-policy revisions. Drift fails before admitting or caching a plan.

`start` accepts only the planned id, digest, team revision, planned state
version, and a new idempotency key. It does not accept a provider, model,
adapter, reference verifier, role, workflow, or tool override. The canonical
registrar privately installs an exact reference verifier, a revisioned
replay-safe local Ollama adapter whose estimate is explicitly zero-spend, a
local control authorizer, and a file-backed review-receipt verifier. These are
host dependencies, never MCP arguments. Without an exact configured model,
start returns `execution_adapter_unavailable` before creating durable state or
spending tokens.

`list` returns sanitized summaries. An exact `list({runId})` additionally
returns the final public answer after completion, including completion reached
through review, retry, or recovery; a multi-run list remains summary-only. It
never returns the requested-task text, persona text, private specialist
messages, raw provider payloads, or hidden instructions.
Each MCP descriptor advertises its own closed operation-specific output schema.
`finalAnswer` is forbidden from control responses, non-completed starts,
non-completed exact lookups, and every broad-list item.

`control` uses compare-and-swap state versions and idempotency receipts. It
supports `pause`, `resume`, `cancel`, `retry`, `request_review`, and
`record_review`. Every new control requires a host authorization receipt bound
to the exact run, plan, checkpoint, state version, action, and reason digest.
Review continuation additionally requires a host-verified receipt matching the
exact source review-policy revision. Reject is terminal, while revise requires
a new exact plan; neither outcome can be bypassed with retry.

Durable state lives below `.agentic-graph-workspace/agent-team-runs`. Each bounded
transition writes an atomic checkpoint plus an event-content digest chained to
the prior event and checkpoint. Reads verify the complete bounded ledger,
including missing, forked, tampered, oversized, and unexpected events. One
fully validated uncommitted successor is tolerated after a crash between event
and state renames and is overwritten by the next fenced transition. A run is
limited to 64 checkpoints. Start and control persist exact result snapshots,
and recovery records a missing settled start snapshot, so idempotent replay
returns its original receipt even after later transitions. Run, checkpoint,
and deterministic effect ids are replay fences. Every claimed effect records
its owner, branch, attempt, lease expiry, exact branch-input digest, admitted
envelope, pre-estimate active-time baseline, and estimate time. A live claim is
not stolen. An expired claim can reuse only the same input digest, envelope,
effect id, attempt, and adapter revision, without re-estimating. Recovery
defers live claims; if an expired uncertain effect cannot pass its adapter or
reference fence, recovery clears the claim and branch together, marks cost
unreported, and records the exact settled start receipt.

Before the local adapter sends a model request, it writes a separate
`.agentic-graph-workspace/agent-team-effects/<effectId>.json` pending receipt. A
completed response is atomically replaced with the exact settled result.
Restart replay returns only a completed receipt; a prior pending receipt blocks
as `local_model_effect_unsettled` rather than repeating a model side effect
whose outcome is unknown.

## Execution And Ownership

agentic-graph reuses its existing Agent Definition registry and adds one narrow
host-owned workflow/review registry for this runtime. It does not add an
external model router, tool gateway, Agent Swarm scheduler, or caller-extensible
registry. The local adapter resolves and executes each allowlisted branch
through those exact owners.

Branches run in their source-declared order. The adapter declares
`estimateZeroSpend: true`; estimation is local/model-free and receives the
same immutable, digest-bound branch input as execution, including the complete
task, exact plan metadata, owner-filtered private context, and remaining
bounds. Before every new effect it must provide a reported maximum token, cost,
and time envelope. A call does not start when that envelope or the remaining
checkpoint transitions cannot fit. Both estimation and settlement are
deadline-bounded even if the adapter ignores cancellation. Estimate wall time,
provider-reported execution time, and local settlement time are accounted
conservatively. A durable active-stage clock starts before estimation, is
folded atomically by every winning control or lifecycle transition, and caps
both estimate and execution timers to the remaining run-time bound. A stale
estimator that loses the state-version fence cannot discard elapsed active
time, overwrite a newer claim, or strand a resumed run in `queued`. Actual
usage, delegation depth, and fanout must stay within
both the admitted envelope and effective run bounds. A failed or timed-out
settlement without valid usage is durably marked as unreported cost and blocks
automatic retry; reported usage above an admitted envelope is accounted rather
than reset and permanently fails the adapter trust fence.

For `delegate`, the source participant remains conversation and final-answer
owner. The host adapter is a composite registered delegate-and-synthesis
boundary: it must return a non-empty private target output plus a closed
synthesis receipt binding that output, the exact prior owner-authorized private
context digest, the source participant, and the public output. Only private
messages addressed to the current source owner enter a later branch, and the
same projection is given to estimate and execute. Every public result also
requires a closed output-guardrail acceptance receipt bound to the exact final
owner participant, Agent Definition revision, and output digest. For
`handoff`, conversation and final-answer ownership move together to the
successful target and delegate synthesis fields are forbidden. Failed, stale,
or post-resolution-mutated effects cannot revive a paused or canceled run
because every settlement is cloned immediately and uses the durable
state-version fence.

Only the final settled public answer is projected through MCP. Durable private
messages are intentionally absent from list results and public transition
evidence.

Unknown filesystem, lock, adapter, or host exceptions are reduced to a fixed
typed public error projection. Raw exception messages and absolute local paths
are never reflected through MCP.

## Local Host Configuration

The canonical local stdio MCP server is executable with an operator-selected
Ollama model:

```sh
export AGENTIC_OS_AGENT_TEAM_MODEL="<exact-local-model-name>"
# Optional; defaults to http://127.0.0.1:11434
export AGENTIC_OS_AGENT_TEAM_MODEL_URL="http://127.0.0.1:11434"
```

`AGENTIC_OS_AGENT_TEAM_MODEL_PROVIDER` may be omitted or set to `ollama`.
`AGENTIC_OS_AGENT_TEAM_MODEL_TIMEOUT_MS` is clamped to 1–28 seconds, and
`AGENTIC_OS_AGENT_TEAM_MODEL_MAX_OUTPUT_TOKENS` is clamped to 128–4096 per model
call. Non-loopback URLs fail closed unless the host explicitly sets
`AGENTIC_OS_AGENT_TEAM_MODEL_ALLOW_REMOTE=1`; no request can opt into remote
egress. No model is hard-coded or downloaded by this runtime.

When a run is `review_pending`, the local host owner can issue a short-lived
checkpoint-bound review receipt:

```sh
npm run agent-team:review-receipt -- \
  --run-id=<exact-run-id> \
  --decision=approve \
  --repository=<AGENTIC_OS_ROOT>
```

The command emits the exact `expectedStateVersion` and `reviewReceipt` fields
for `agentic-graph.agent_team.control`. Receipts are stored with mode `0600`, expire
closed, and are valid only for one run, plan, checkpoint, state version,
policy revision, and decision.

## Current Surface Boundary

The canonical local stdio MCP server now admits exact plans, executes starts
through the configured local model, authorizes new controls, and validates
host-issued review continuation. All four dependencies are installed only
through the private registrar; MCP callers cannot replace or configure them.

Remote Cloudflare Worker parity is intentionally not claimed. Adding partial
registration would make local and remote execution appear equivalent when no
durable Worker adapter or store exists. A future remote change needs its own
durable owner, exact verifier, replay-safe adapter, control authorization,
review-receipt verification, lifecycle tests, and surface-equivalence proof.

No new Canvas UI execution path is added. Invocation remains available through
the source-revision-fenced `/agent.team #role-based-agent-team @agent-team`
grammar and the four MCP tools.

## Clean-Room Note

[CrewAI](https://github.com/crewaiinc/crewai) informed only the abstract idea
that specialized agents may collaborate. No upstream code, prose, prompts,
schemas, identifiers, examples, tests, fixtures, dependency, generated output,
or runtime service is copied, imported, vendored, or required. The local
contract and implementation are independently authored from agentic-graph and
Agentic Canvas OS ownership requirements.

## Verification

Run:

```sh
npm run agent-team:check
node --test mcp/__tests__/agent-team-stdio-e2e.test.mjs
npm run hygiene:check
```

The focused proof is deterministic, validates the closed operation-specific
output schemas, uses temporary local state, and starts a loopback fake Ollama
endpoint. Through the canonical stdio MCP server it resolves the checked-in
team, executes both delegated specialist branches plus manager synthesis,
reports zero cost, completes with the manager-owned public answer, and replays
without another model request. It makes no external provider call and does not
mutate Cloudflare or production.
