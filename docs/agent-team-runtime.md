---
title: "Knowgrph Role-Based Agent Team Runtime"
doc_type: "Runtime Contract"
status: "registered-local-stdio-host-configuration-required"
schema: "knowgrph-agent-team-runtime-doc/v1"
invocation: "/agent.team #role-based-agent-team @agent-team"
runtime_owner: "mcp/agent-team-runtime.js"
remote_worker_parity: "not-implemented"
---

# Role-Based Agent Team Runtime

Knowgrph registers the canonical Agentic Canvas OS tuple through four local
stdio MCP tools:

- `knowgrph.agent_team.plan`
- `knowgrph.agent_team.start`
- `knowgrph.agent_team.list`
- `knowgrph.agent_team.control`

The existing `knowgrph.agentic_canvas_os.docs.invoke` tool remains read-only.
Planning resolves all three invocation tokens through that source-revision-fenced
catalog and fails closed when the requested revision or token kind differs. A
host-owned verifier must also resolve every exact Agent Definition, workflow,
branch, and review-policy revision before a plan is admitted. The canonical
stdio construction intentionally supplies no reference verifier, execution
adapter, control authorizer, or review-receipt verifier.

## Source Contract

The caller supplies the URI and digest of a workspace-local JSON team contract.
The runtime opens only a bounded regular file strictly below `KNOWGRPH_ROOT`.
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

## Lifecycle

`plan` is read-only, zero-model, and zero-spend. It resolves the exact
invocation and local source, applies the lowest source/caller/hard bound, and
returns a deterministic ephemeral `planId` and immutable `planDigest`. A
different request cannot reuse the same plan idempotency key. Without an
injected host reference verifier it returns `reference_verifier_unavailable`
before admitting or caching a plan.

`start` accepts only the planned id, digest, team revision, planned state
version, and a new idempotency key. It does not accept a provider, model,
adapter, reference verifier, role, workflow, or tool override. An embedding
host must construct the registrar or runtime with an exact reference verifier,
a revisioned replay-safe adapter whose estimate is explicitly zero-spend, a
control authorizer, and a review-receipt verifier. These are private host
dependencies, never MCP arguments. With a
verifier but without an exact configured adapter, start returns
`execution_adapter_unavailable` before creating durable state or spending
tokens.

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

Durable state lives below `.knowgrph-workspace/agent-team-runs`. Each bounded
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

## Execution And Ownership

Knowgrph does not define another Agent Definition registry, orchestration
workflow registry, model router, tool gateway, or Agent Swarm scheduler. The
host adapter resolves and executes each allowlisted branch through the existing
Agent Orchestration owner.

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

## Current Surface Boundary

This change registers the four descriptors and fail-closed dispatcher on the
canonical local stdio MCP server. That default server injects no reference
verifier, execution adapter, control authorizer, or review-receipt verifier: it
can list the tools and durable runs, but it cannot admit a plan, start
execution, authorize a new control, or validate review continuation. An
embedding host must construct `createLocalRunRuntimeRegistrar` or
`createAgentTeamRuntime` with all four dependencies through the private
initialization API; MCP callers cannot configure any of them.

Remote Cloudflare Worker parity is intentionally not claimed. Adding partial
registration would make local and remote execution appear equivalent when no
durable Worker adapter or store exists. A future remote change needs its own
durable owner, exact verifier, replay-safe adapter, control authorization,
review-receipt verification, lifecycle tests, and surface-equivalence proof.

No Canvas UI execution path is added. Existing `/`, `#`, and `@` discovery and
prompt behavior remains unchanged.

## Clean-Room Note

[CrewAI](https://github.com/crewaiinc/crewai) informed only the abstract idea
that specialized agents may collaborate. No upstream code, prose, prompts,
schemas, identifiers, examples, tests, fixtures, dependency, generated output,
or runtime service is copied, imported, vendored, or required. The local
contract and implementation are independently authored from Knowgrph and
Agentic Canvas OS ownership requirements.

## Verification

Run:

```sh
npm run agent-team:check
node --test mcp/__tests__/agent-team-stdio-e2e.test.mjs
npm run hygiene:check
```

The focused proof is deterministic, validates the closed operation-specific
output schemas, uses temporary local state, and injects
fake verifier, adapter, control-authorizer, and review-verifier dependencies
only in-process. It makes no provider or network call and does not mutate
Cloudflare or production. Its canonical stdio case proves registration plus
typed refusal while those dependencies are absent; it does not claim
executable start by default.
