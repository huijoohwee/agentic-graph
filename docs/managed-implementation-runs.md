---
title: "Managed Implementation Runs"
doc_type: "Operator Runbook"
status: "active"
frontmatter_contract: "required"
runtime: "local-stdio-mcp"
terminal_state: "delivery_ready"
automatic_merge: false
automatic_deployment: false
---

# Managed Implementation Runs

agentic-graph can turn one bounded work item into a durable, worktree-isolated implementation run. The local stdio MCP owns planning, state, retries, process recovery, verification evidence, and controls. Agentic Canvas OS (ACOS) owns the fenced task branch, worktree, writer lease, and pull-request handoff. A successful run stops at `delivery_ready`: the pull request is ready for human review, with no automatic merge, publish, or deployment.

The implementation is original agentic-graph/ACOS work. It copies no Symphony code and has no runtime, package, service, or network dependency on `openai/symphony`.

## Required host authority

Set all four authority variables on the MCP server process. Paths must be absolute, real host paths. Keep secrets out of the JSON registries; runner and verifier credentials are named by allowlist and read from the process environment only when that exact profile is selected.

```sh
export AGENTIC_OS_IMPLEMENTATION_ACOS_ROOT="/srv/repos/agentic-canvas-os"
export AGENTIC_OS_IMPLEMENTATION_RUNNERS_JSON='{
  "team_runner": {
    "executable": "/srv/bin/team-runner",
    "args": ["--request", "{{requestPath}}", "--workspace", "{{workspacePath}}"],
    "environment": ["TEAM_RUNNER_TOKEN"]
  }
}'
export AGENTIC_OS_IMPLEMENTATION_VERIFIERS_JSON='{
  "unit_tests": {
    "executable": "/usr/bin/npm",
    "args": ["test"],
    "environment": [],
    "timeoutMs": 600000
  }
}'
export AGENTIC_OS_IMPLEMENTATION_REPOSITORIES_JSON='[
  {
    "repoRoot": "/srv/repos/agentic-graph",
    "worktreeRoot": "/srv/repos/.worktrees/agentic-graph"
  }
]'
```

Runner entries accept only `executable`, exact argv `args`, and environment-variable names in `environment`. Supported runner placeholders are `{{requestPath}}`, `{{workspacePath}}`, and `{{runId}}`. Verifier entries are host-owned exact profiles: `executable`, placeholder-free `args`, `environment`, fixed workspace cwd, and `timeoutMs`. A work item can select a profile ID but cannot supply or alter verifier argv. General-purpose deployment/evaluation forms such as `git push`, `npm publish`, shell `-c`, and `node -e` are rejected even in the host registry. Repository entries accept only `repoRoot` and `worktreeRoot`; the worktree root must be the real sibling-derived `.worktrees/<repository-name>` directory. The configured ACOS root and each canonical repository must be clean `main` exactly at `origin/main`. Fetch and push origin identities must be one identical credential-free URL.

Start the configured stdio service with `npm --prefix mcp start`, or point an MCP client directly at the absolute `mcp/server.js` path.

The repository-owned `sandboxPolicyPath` must be a non-symlink regular file tracked in the exact planned source revision, match that Git blob byte-for-byte, remain at most 256 KiB, and authorize the exact runner and verifier profiles, declared write paths, and named credential environments. Its Git blob, compiled digest, file identity, and SHA-256 are pinned and rechecked before execution and every verifier. For example:

```json
{
  "schema": "agentic-graph-agent-sandbox-policy/v1",
  "policy_id": "managed-implementation",
  "filesystem": {"read": ["."], "write": ["src", "tests"]},
  "process": {
    "executables": ["/srv/bin/team-runner", "/usr/bin/npm"],
    "max_runtime_ms": 1800000,
    "max_output_bytes": 1048576
  },
  "network": {"default": "deny", "rules": []},
  "credentials": {"environment": ["TEAM_RUNNER_TOKEN"]},
  "audit": {"decision_log": "required", "redact_values": true}
}
```

This policy is application authorization, not enforcement isolation. Durable state, revision events, attempt/revision-scoped runner requests, and redacted/bounded log artifacts are stored under `<repoRoot>/.agentic-graph-workspace/implementation-runs/<runId>/` with owner-only modes. Evidence artifacts are immutable: retries create new names, and receipts record artifact name, SHA-256 digest, byte count, and truncation state while prior receipts remain in revision events.

## Invocation and tools

Every specification declares the exact ACOS vocabulary `/implementation.run`, `#managed-implementation-run`, `@work-item`, and `@implementation-run`. The local run surface exposes five tools:

| Tool | Effect |
|---|---|
| `agentic-graph.implementation_run.plan` | Validates host authority, source revisions, policy, executable content proofs, paths, and bounds without mutation. |
| `agentic-graph.implementation_run.start` | Idempotently persists the plan and starts its detached durable supervisor. |
| `agentic-graph.implementation_run.list` | Lists bounded work-item projections, current revisions, coordination, evidence summaries, and next actions. |
| `agentic-graph.implementation_run.control` | Uses revision compare-and-swap for `pause`, `cancel`, `retry`, or `review`. |
| `agentic-graph.agentic_sdlc.observe` | Read-only projection of one exact immutable `agentic-sdlc-run/v1` ledger into deterministic paged GraphData and source-backed AGENTIC_OS Markdown for the existing Canvas owner. |

Minimal plan/start arguments:

```json
{
  "invocation": {
    "action": "/implementation.run",
    "semantic": "#managed-implementation-run",
    "bindings": ["@work-item", "@implementation-run"]
  },
  "workItem": {
    "id": "issue-142",
    "objective": "Implement the accepted cache invalidation change",
    "acceptance": ["Focused tests pass", "A review-ready commit exists"]
  },
  "repoRoot": "/srv/repos/agentic-graph",
  "worktreeRoot": "/srv/repos/.worktrees/agentic-graph",
  "agenticCanvasOsRoot": "/srv/repos/agentic-canvas-os",
  "semanticScope": "issue-142",
  "runnerId": "team_runner",
  "sandboxPolicyPath": "policy.json",
  "agenticSdlcLedgerPath": "evidence/agentic-sdlc-run.json",
  "allowedPaths": ["src", "tests", "evidence"],
  "verification": [{"profileId": "unit_tests"}],
  "idempotencyKey": "project-issue-142-v1",
  "bounds": {
    "maxAttempts": 3,
    "maxRuntimeMs": 1800000,
    "maxOutputBytes": 1048576,
    "leaseTtlSeconds": 1800
  }
}
```

Call `plan` first and inspect `ready`, diagnostics, the pinned target/ACOS revisions, run-owned ACOS semantic scope, 96-bit-suffixed worktree, policy proof, exact verifier profile digest, executable SHA-256 proofs, and containment declaration. Send the same specification to `start`. Reusing its idempotency key with identical content returns the existing run; different content fails closed. Specifications, registries, profile argv/environment sets, plans, durable state, events, process configuration, and child argv/environment all have explicit aggregate UTF-8 byte limits. State creation reserves half of the hard state-file limit for coordination and evidence growth.

`agenticSdlcLedgerPath` is optional for backwards compatibility, but it is
required for full Agentic SDLC observation. It must be a safe
repository-relative path contained by `allowedPaths`. When configured, the
runner request names that path explicitly. After the host-owned verification
profiles pass, the supervisor loads the ledger through the exact clean ACOS
revision pinned by the run, applies the canonical schema and independent
evaluator, copies the original bytes into the run's immutable artifact
directory, and records:

```json
{
  "schema": "agentic-sdlc-ledger-receipt/v1",
  "artifact": "agentic-sdlc-run.a0001.0123456789abcdef.json",
  "digest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "bytes": 12345,
  "canonicalRunId": "run-001",
  "ledgerRevision": 27,
  "acosRevision": "0123456789abcdef0123456789abcdef01234567"
}
```

The receipt is stored only at `state.result.agenticSdlcLedger`. A missing
receipt returns `canonical_ledger_unavailable`; the observer never reconstructs
VCCs, roles, grants, budgets, transitions, findings, Evidence References,
consumption, or receipts from the operational run summary.

## Agentic SDLC Canvas observation

The canonical invocation is:

```text
/sdlc.observe #agentic-sdlc-observability @implementation-run @canvas @runtime-proof
```

Call `agentic-graph.agentic_sdlc.observe` with that exact token tuple, the
implementation-run ID, its current `expectedRevision`, the receipt's
`expectedLedgerDigest`, and one view: `overview`, `plan`, `execution`,
`evidence`, `economics`, `recovery`, `receipts`, or `full`. `limit` is bounded
from 1 to 200. A returned cursor is bound to the projection digest, view, and
offset; any revision or ledger change makes it stale.

The observer rechecks the run revision, durable binding-event revision, receipt,
byte count, SHA-256, ledger schema, canonical run ID, and clean ACOS evaluator
revision before projecting. The evaluator's installed Ajv dependency closure
must also match the exact lockfile-SRI tarballs in the OS user's local npm
content cache; missing cache evidence or any installed-byte drift fails closed
without a network fallback.
Nodes and edges use stable type/identity ordering. GraphData and AGENTIC_OS Markdown
come from the same normalized record set; AGENTIC_OS frontmatter selects the existing
Storyboard renderer. The existing Source Files/active-graph/Canvas owners
decide whether to display or persist that returned document. The MCP tool does
not write a document, create a second graph store, or introduce another
renderer. A small content-addressed in-memory LRU caches derived pages only.

The status fields are deliberately separate:

- `runtimeReady` is the canonical independent evaluator verdict.
- `verified` additionally requires every verified task to join an evaluator-owned
  verified transition to its own passed, in-task Evidence Reference.
- `deliveryReady` means the managed implementation run reached its review-ready
  pull-request handoff.
- `deployed` is observed only when exact digest-valid Candidate, Authorization
  Interaction, consumed Human Authorization v2, and Live Verification receipts
  join on the same candidate, target, human actor, controller, deployed artifact,
  and rollback target.
- `deployBoundary` is always `closed`: observing an existing release receipt
  chain grants no action authority.

Every observation reports exact zero model calls, network calls, prompt tokens,
completion tokens, estimated cost, and provider spend. It neither authorizes a
merge nor creates Human Authorization, Live Verification, Publication, Prod,
or Cloudflare evidence.

## State and controls

Use the revision returned by `list` as `expectedRevision`:

```json
{"runId":"ir_0123456789abcdef01234567","action":"pause","expectedRevision":18}
```

- `pause` stops active child work, demotes a review-ready PR to draft when needed, and parks/releases the lane. ACOS records exact partial-work stash identity; a lost park response is replayed.
- `retry` is allowed from `paused`, `failed`, or `blocked`, within the attempt bound. It resumes a parked lane and restores its exact partial work before relaunch. An unexpectedly expired active lease still fails closed before deliberate same-session reactivation; dirty work is never guessed or auto-stashed outside the explicit pause protocol.
- `cancel` safely resumes a review-ready handoff to draft ownership when needed, then parks it. A not-yet-created worktree cancels as `not_created`.
- `review` requires `delivery_ready`. `accept` records the decision. `changes_requested` durably resumes the ready handoff into an active draft lane before ending paused.

Supervisors and their runner, verifier, and ACOS child process groups use durable PID/start-marker, PGID, and token fencing. Exit listeners attach at spawn, output is accepted only after pipe close, and an inherited pipe that fails to drain within the bounded grace returns `PROCESS_STDIO_DRAIN_TIMEOUT`. Restart recovery performs TERM→KILL against proven process groups before relaunch; leaderless surviving groups, ambiguous PID reuse, indeterminate launch state, executable/policy/source/origin mutation, or lease mismatch block for manual cleanup instead of guessing. A process that deliberately escapes its registered group (for example with `setsid`) cannot be proven portable by this host-user runtime and violates the trusted-runner contract. Output artifacts replace the selected runner/verifier environment values and credential-like key/value labels, then truncate to one combined configured bound; these heuristics cannot identify every secret, so commands must not emit secrets. Public state carries only small receipts.

Broad `list` calls return compact summaries ordered by stable run ID, scan bounded pages, isolate unreadable/oversized state, and expose `nextCursor`/`continuation`. Pass that cursor to enumerate every page; `includeEvents` is available only with an exact `runId`.

## ACOS upgrade boundary

Every run pins the exact clean ACOS commit and device-script proof that created its lifecycle state. Preflight also requires that commit to equal `docs_dependency.ref` in `docs/runtime-readiness-contract.md`; a token-complete checkout at any other clean `main` revision fails with `acos_revision_unsupported` before durable state or a worktree exists. Before promoting a new supported ACOS revision, query `list` page by page and drain active states (`queued`, `claiming`, `provisioning`, `running`, `verifying`, `delivery_ready`, and `paused`) by completing or canceling them; explicitly resolve any parked partial work. Then update the runtime-readiness revision pin and restart the MCP service. A canonical ACOS upgrade intentionally blocks an old run's resume instead of silently migrating lease or stash state across versions.

## Containment and trust boundary

`filesystem: git-worktree-only` means repository organization, not an operating-system security sandbox. Runner and verifier commands execute as the host user with baseline `PATH` and `HOME`; policy checks and environment-name allowlists are application-layer checks. agentic-graph enforces no filesystem, network, process, credential, kernel, container, VM, or user-namespace isolation unless the operator registers separately sandboxed commands. Environment allowlisting does not prevent executed code from reading host-user files or credentials in `HOME`, spawning or escaping into other process groups, or reaching the network. The runner, verifier profiles, and same-user account are therefore trusted by this runtime.

The runner is instructed to change only declared `allowedPaths`, leave a clean committed change beyond the ACOS fence, and avoid push, merge, deployment, or canonical-`main` mutation. As host-user code it can still attempt those side effects; agentic-graph detects changed paths, remote fences, origin identity, and canonical-main drift before handoff but cannot prevent host effects without an external sandbox. agentic-graph itself calls the ACOS review handoff, never the ACOS publish flow.
