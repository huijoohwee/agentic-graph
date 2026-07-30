---
title: "Skill Evolution Runtime"
doc_type: "Runtime Contract"
status: "runtime-ready-dev"
lang: "en-US"
schema: "knowgrph-skill-evolution-runtime-doc/v1"
authority: "Knowgrph local stdio MCP execution for the Agentic Canvas OS Skill Evolution contract"
invocation: "/skill.evolve #skill-evolution @skill-catalog @skill-policy @runtime-proof @operator"
mcp_tool: "knowgrph.skill.evolve"
deployment_scope: "Dev local stdio; no Prod or Cloudflare deployment authority"
external_dependency: "forbidden"
---

# Skill Evolution Runtime

## Outcome

Knowgrph provides a bounded, resumable training harness for skill text. It uses epochs, deterministic batches, explicit mini-batches, a decaying textual learning-rate schedule, and held-out validation gates. The orchestrator exposes no gradient or weight-update operation and never applies a skill, commits, merges, releases, or deploys; its immutable safety flags attest only orchestrator behavior inside the documented trusted-adapter boundary.

Agentic Canvas OS owns the canonical `/`, `#`, and `@` invocation and request/result contract. This local runtime owns the single MCP tool `knowgrph.skill.evolve` and its execution state.

The design takes only high-level inspiration from the frozen-model skill-optimization problem described by [Microsoft SkillOpt](https://github.com/microsoft/SkillOpt/blob/61735e3922efc2b90c6d6cab561e62e98452ca90/README.md). No SkillOpt code, prompt, prose, schema, API, defaults, tests, fixture, package, service, generated artifact, or repository layout is copied or required. There is no import, install, subprocess, network call, compatibility layer, or runtime fallback to SkillOpt.

## Invocation Surface

The only accepted tuple is:

```text
/skill.evolve #skill-evolution @skill-catalog @skill-policy @runtime-proof @operator
```

The local MCP descriptor and every request use `knowgrph.skill.evolve`. There is no `/skill.train`, alternate semantic tag, second binding registry, or second dispatcher. Dictionary tokens are invocation metadata; the MCP request remains the executable boundary.

## Operations

| Operation | Mutation | Adapter calls | Result |
|---|---:|---:|---|
| `plan` | None | None | Deterministic schedule at revision `0`, with no stored run. |
| `start` | Insert one run | One zero-model source-verifier capability; no training, candidate, or held-out execution | Ready run at revision `1`. |
| `step` | Exactly one claimed successor revision | One mini-batch update or one validation checkpoint | Running, stopped, failed, or review-pending snapshot. |
| `status` | None | None | Current bounded snapshot. |
| `cancel` | Exactly one claimed successor revision | None | Canceled snapshot with retained aggregate evidence. |

Every mutating transition is revision-fenced and idempotency-keyed; `status` remains read-only and adapter-free. The canonical stdio server uses an atomic file store whose hashed records, linked replay sidecars, fixed-size replay-membership summary, claims, and in-flight intents survive process restarts. Fresh absent replay keys take a constant-time membership path; positive matches traverse the bounded sidecar chain. Transition-sized claims, exact predecessor revisions, TTL cleanup, atomic rename, and directory sync fail closed under competing processes on one local filesystem and OS PID namespace. The mutex uses hard-linked inode ownership, never TTL-steals from a live same-host PID, and checks ownership before each commit; dead same-host owners require two stale observations. Malformed, foreign-host, or abandoned recovery locks fail closed. This is not a distributed or network-filesystem mutex. `KNOWGRPH_SKILL_EVOLUTION_STATE_DIR` may select an outside-repository state directory; otherwise the server derives an outside-repository user-state path namespaced by repository and `KNOWGRPH_SKILL_EVOLUTION_NAMESPACE`. Library callers may explicitly inject the bounded in-memory store for ephemeral tests.

## Adapter Isolation

The canonical host loads one repository-contained, SHA-256-pinned, self-contained module and exposes five exact role boundaries. Every capability call runs in its own dedicated subprocess:

- authorization: `authorize` for `start`, `step`, and `cancel`, including replay;
- source verification: `verifySources` for the exact revision, every digest, the registered gate ids, and exact per-method usage envelopes, plus `verifyMutation` for independently materialized parent and candidate artifacts;
- training execution: `executeTraining` for only the selected training mini-batch;
- candidate proposal: `proposeCandidate` for bounded text hunks from training evidence; and
- held-out work: `executeValidation` and `evaluateValidation` for isolated rollouts, finite scores, and evidence-bound required gates.

Each process receives a sanitized environment and bounded JSON IPC, loads only its exact method surface, redacts child errors, and is terminated after its result, cancellation, or deadline without affecting sibling calls. The source file is evaluated directly; only the explicit static `node:crypto` import is linked, while relative, bare, dynamic, `node:module`, filesystem, and VM imports fail closed. The child receives read grants only for the runtime worker and the configured adapter file, so builtin-mediated loading of another repository file also fails. The configured digest therefore binds the evaluated adapter entry bytes instead of an unpinned repository closure. Node's permission boundary also denies adapter filesystem writes and ungranted process capabilities. It does not deny network access or provide hostile-code containment, so the configured inference-only module remains trusted host code. The candidate process receives training evidence but no validation references, rollout evidence, scores, or gate results. Validation references are passed only to held-out execution; the evaluator receives bounded rollout evidence rather than candidate-generation context.

The canonical stdio server advertises and dispatches the tool with no built-in provider or model adapter. `plan` remains model-free, capability-free, and lazy—it does not initialize durable state; `start` fails closed as `adapter_unavailable` until the host supplies all roles. The stdio entry point accepts only host-owned `KNOWGRPH_SKILL_EVOLUTION_ADAPTER_MODULE` plus its exact lowercase `KNOWGRPH_SKILL_EVOLUTION_ADAPTER_SHA256`; neither value is an MCP argument. The loader realpath-confines the module to the Knowgrph repository, permits only JavaScript modules, verifies its bytes before every call and after evaluation, rejects the forbidden external dependency marker, and requires the exact role surface. Embedding hosts may instead construct `createSkillEvolutionRuntime({ adapter, authorize, store })` directly.

## Training State

- `workingCandidate` is the run-local text candidate under construction during an epoch.
- `champion` is the latest candidate promoted by held-out validation; it begins as the immutable baseline.
- `promotedCandidate` is non-null only for the most recent successful validation checkpoint.
- `proposal` is non-null only at `review_pending` and references the champion.

One candidate step calls the frozen training executor and candidate adapter. One validation checkpoint performs separate champion and working-candidate held-out rollouts, then invokes the evaluator. The planner accounts for all three validation calls before admission.

The zero-based epoch rate is:

```text
max(learningRate.floor, learningRate.initial * learningRate.decay ^ epochIndex)
```

That rate caps changed text characters relative to `baseline.normalizedChars`. It is not a gradient, optimizer coefficient, loss derivative, or model-state update. A proposal must return ordered non-overlapping `{ start, deleteText, insertText }` hunks. After newline normalization, the runtime independently derives mutation operations, inserted-plus-deleted characters, and successor length; adapter-reported aggregate counts cannot bypass the global or per-step limits. The separately isolated source verifier then loads the canonical parent and proposed artifact, confirms every deletion, applies the hunks, and must reproduce the proposed reference, digest, length, operation count, and changed-character count before state can advance.

## Promotion Gate

For metric threshold `T`, working score `W`, champion score `C`, and minimum delta `D`:

- maximize promotes only when `W >= T`, `W > C`, and `W - C >= D`;
- minimize promotes only when `W <= T`, `W < C`, and `C - W >= D`; and
- every required gate must be present and passing.

Equality never promotes, including when `D` is zero. Rejection resets the working candidate to the champion and increments patience. Reaching patience stops the run; an earlier champion may still produce a review-pending proposal.

## Budget And Evidence

At admission, the source verifier supplies exact token, USD-cost, and duration envelopes for each execution method plus the registered gate ids. Planned call counts multiplied by those envelopes must fit the run caps. Before every metered execution call, the runtime passes the exact remaining budget and the method envelope; returned usage must be exact, finite, non-negative, and within both. A missing or malformed failure meter is conservatively charged at the full envelope. USD values are canonicalized to 12 decimal places.

Cost output contains total meters and phase meters:

```text
cost.byPhase.training
cost.byPhase.validation
```

Training plus validation phase values equal total metered adapter calls, tokens, cost, and duration. Validation rollouts cannot be hidden in training accounting. Measured wall time cannot be reduced by a provider meter, malformed failure meters are charged conservatively, and individual retained evidence is capped below the host IPC limit. Raw examples and provider payloads are not persisted; state retains references, digests, aggregate metrics, gates, costs, candidates, and transition replay summaries.

Before metered training or held-out work, a step checkpoints a durable transition intent without advancing revision. Metered execution calls receive stable transition/call ids, an input digest, deadline, ordinal, and state fence; execution adapters must deduplicate call ids. Pure authorization and source-verification preflights remain bounded, cancelable, and side-effect-free. A transition-sized lease covers the two maximum host verifier deadlines where applicable, all metered method envelopes, and settlement grace. Claims renew after each metered call, the fence is checked before commit, and successor state plus replay evidence commit atomically. Same-process cancellation aborts active work and records both step and cancel replay; a competing process fails closed while that intent is live.

Every result includes:

```text
applied: false
modelWeightsMutated: false
deploymentAttempted: false
```

Only `/skill.manage` may later process an operator-reviewed proposal.

## Dev Proof

Run:

```bash
npm run skill-evolution:check
```

The focused suite covers exact MCP schemas, canonical invocation, deterministic shuffling, epoch/batch/mini-batch indexing, textual rate decay, split isolation, exact source envelopes and gate registration, artifact-materialized mutation-hunk verification, decimal cost bounds, durable restart/CAS/TTL/replay behavior, crash intent and call-id replay, active cancellation, deadlines, transition-sized claims, source drift, promotion and rollback math, patience, phase accounting, per-call role isolation and self-contained-module enforcement, review-only safety flags, actual local stdio tool listing/dispatch, and a complete persisted stdio run through a repository-contained SHA-pinned deterministic adapter.

This proof is Dev-only. It does not claim provider availability, model quality, hostile-code containment, Cloudflare exposure, canonical skill application, release, or deployment.
