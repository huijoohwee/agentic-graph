---
title: "Protected source validation reuse"
doc_type: "PRD-TAD-ADR-MVP-GTM"
continuity_id: "CI-EVIDENCE-GRAPH-001"
upstream_continuity_id: "CI-EVIDENCE-001"
version: "1.0.0"
prd_revision: "1.0.0"
tad_revision: "1.0.0"
adr_revision: "1.0.0"
mvp_revision: "1.0.0"
gtm_revision: "1.0.0"
status: "consumer-validation"
owner: "agentic-graph"
load_policy: "on-demand"
---

# Protected source validation reuse

This consumer plan implements upstream `CI-EVIDENCE-001@1.0.0`; Agentic OS remains the shared verifier owner.

## PRD

The release operator needs to avoid repeating unchanged source validation while retaining
current ownership and production checks. Release run
[34851156370](https://github.com/huijoohwee/agentic-graph/actions/runs/34851156370)
repeated `ci:integration` for 862 seconds after protected main checks passed. That run
later failed live Canvas source activation and restored its prior production runtime;
CI reuse does not resolve or hide that runtime failure.

## TAD

The [upstream owner](https://github.com/huijoohwee/agentic-os/pull/154) supplies the
on-demand protected evidence verifier at exact revision
`4a8aaa70174a4892612b1d219518db37a287cf75`. The committed policy binds Graph, Canvas docs,
publish mirror and schema mirror Git revisions, Node and runner identity, environment
and the declared command. Graph contributes its existing affected-path/expanded-command
selection and installed Python/Chrome versions. It does not duplicate selection rules.

Main push captures inputs before `ci:integration`, seals them only after the unchanged
required checks and XR gate succeed, and retains a one-day artifact. Release downloads
that exact artifact with the existing pinned GitHub action, then reobserves its run,
attempt, job, successful step and artifact before accepting identical source inputs.

The optional composite action returns `reused=true` only from the shared verifier.
Lookup, download, parse, capture or verification failure runs the original source command.
Current worktree and collaboration checks always run. Build, source/mirror parity,
immutable candidate, isolated/live browser, rollback and human authorization stay fresh.

## ADR

Use exact successful protected-main evidence, with a conservative cache miss. Reject
PR/fork artifacts, newer failed or pending runs, changed dependency commits, mismatched
selection or environment, expired artifacts and incomplete provider inventories. Never
reuse production authorization, provider health or live browser observations.

Bounds: no new dependencies or paid services; one shared verifier and one small Graph
input adapter; 64 KiB evidence; at most one day; bounded provider reads and official
artifact transport. The release workflow remains below 600 lines by delegating transport
to a repository-owned composite action. Browser runtime bundles gain no code.

## MVP validation

`node --test scripts/__tests__/ci-evidence-inputs.test.mjs` checks selected-plan equality,
changed inputs, malformed inventories, event rejection, shell failure before capture,
required producer order and fresh release fallback. The upstream tests exercise provider
and receipt rejection. Required Integration Gate remains authoritative for Dev merge.

Live producer/consumer reuse and realized time savings require a successful protected
main artifact followed by a release on the same source, dependency and runner inputs.
This document records implementation intent and test ownership, not a production receipt.

## GTM

Pilot on Graph's next eligible release. Record source validation disposition and compare
the avoided command duration with lookup/download/verification cost. Adoption by another
repository is opt-in through its own policy and input owner. WTP and revenue are unmeasured.

| Criterion | Owner | Outcome |
|---|---|---|
| C1-C3 | Agentic OS | Exact protected checks and provider reobservation |
| C4 | Graph workflow | Missing or mismatched evidence runs fresh |
| C5 | Graph release controller | Current ownership, runtime and authorization remain independent |
