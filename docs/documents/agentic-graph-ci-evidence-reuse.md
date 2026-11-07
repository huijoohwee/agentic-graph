---
title: "Protected source validation reuse"
doc_type: "PRD-TAD-ADR-MVP-GTM"
continuity_id: "CI-EVIDENCE-GRAPH-001"
upstream_continuity_id: "CI-EVIDENCE-001"
version: "1.1.0"
prd_revision: "1.1.0"
tad_revision: "1.1.0"
adr_revision: "1.1.0"
mvp_revision: "1.1.0"
gtm_revision: "1.1.0"
status: "consumer-validation"
owner: "agentic-graph"
load_policy: "on-demand"
---

# Protected source validation reuse

`CI-EVIDENCE-GRAPH-001@1.1.0` joins this consumer's five roles. The shared verifier remains
owned by Agentic OS; the consumer owns affected selection and partition receipt names.

| PRD-TAD-ADR-MVP-GTM | CID | RAO | Updated Date |
|---|---|---|---|
| `CI-EVIDENCE-GRAPH-001@1.1.0` | C: exact-main run 36815216741 attempt 2 reused its standard source checks but repeated browser/core checks after an exclusive receipt collision. I: retain valid reuse for every selected partition and avoid provider work for empty ones. D: fix receipt ownership without changing source identity, freshness, exclusive writes or protected/runtime gates. | R: CI owner · A: CI owner isolates partition receipts and skips empty lookup work · O: independent decisions with conservative fresh fallback · check: repository-validation tests, CI input contract tests and native affected validation | 2026-10-01 |

## PRD

The release operator needs shorter feedback and fewer runner/provider resources while preserving
correct source validation. Historical release run
[34851156370](https://github.com/huijoohwee/agentic-graph/actions/runs/34851156370) repeated source
validation for 862 seconds; its later runtime failure required rollback. Reuse cannot replace runtime proof.

Current criterion C1: successful evidence can serve every nonempty selected partition. C2: an empty
partition performs no input capture or provider lookup. C3: every written partition decision is retained.
C4: mismatch, expired evidence, provider failure or a genuine duplicate write executes fresh checks.
C5: ownership, build, browser, rollback and human production authorization remain independently fresh.
The operator's pain is observed in CI; willingness to pay and cash savings are unknown.

## TAD — reference implementation

Grounding base is Graph `d3a6a3bbc17e626fa37b33029ebb9fb1a655b1ac`:
`scripts/run-affected-ci.mjs` partitions the canonical command plan and delegates proof to the
shared verifier. It previously sent every process to the same `ci-source-reuse.json`; the verifier's
exclusive write allowed only the first decision, and later processes fell back to fresh execution.

`sourcePlanReuse` now selects the requested partition before doing evidence work and writes one
`ci-source-reuse-<partition>.json`. The existing integration upload retains the bounded matching files.
The selector is validated by the existing partition parser. `all` remains a separate supported invocation.
Empty selections return before module import, tool-version capture or provider calls. The complete
owner-input digest still binds all selected paths, commands, environment and exact tool versions.

The publication base includes knowledge-graph merge `750130d1f3358b413d22b0cfbc9c9c38e6c21503`;
its passage owners do not change this CI contract. The package and runtime dependency stay pinned to OS `e0ef770860905830157e64c455f0a342084b6d25`.
Shared verifier diagnostics merged separately in OS PR 320 at
`4530415d3c64609392e6938b1ea01429b30fa536`; this diff does not claim adoption of that newer pin.
The v1 policy serves protected-main-to-release reuse; v2 accepts only the reviewed PR merge tree
under its exact provider and parent-tree proof. No fork or arbitrary branch evidence becomes trusted.

Flow: derive affected plan → select partition → omit empty lookup → reobserve eligible evidence →
retain independent decision → reuse proven stages or execute the original stages. Existing native
validation owns ordering, timeouts and stage observations. No second cache or store is added.

## ADR

Extend the consumer owner and keep immutable shared writes. Replacing `wx` with overwrite, trusting
a previous local receipt without provider reobservation, omitting tool versions, or suppressing fresh
fallback would change the safety contract and is rejected. One shared receipt would require an
additional trusted orchestration lifetime; independent bounded decisions reuse the current process model.

Main attempt 2 used Node 22.23.3 and accepted same-tree evidence: standard 4.02 seconds, browser
473.58 seconds, core 122.87 seconds. Attempt 1 used 22.23.2 and correctly missed the exact version
binding. Removing that mismatch is not a cache policy change. Consistent tool pinning and reviewed
OS adoption remain separate scoped follow-ups; this change neither infers nor promises those savings.

Bounds: five existing files, no dependencies/new modules/browser bytes, at most 20 KB authored delta,
and 30 active minutes for implementation and affected validation. Required external CI has no ETA.
Each file stays below 600 lines. An exception retains fresh execution; it never emits a false reuse result.

## MVP validation

C1–C2: `scripts/__tests__/repository-validation.test.mjs` invokes the owner for standard, extended
and all selections using real exclusive temporary writes. It asserts three independent decisions,
zero calls for empty or non-main selections, and unchanged prior bytes on duplicate fallback.
C3: `scripts/__tests__/ci-evidence-inputs.test.mjs` binds workflow retention to all partition receipts.
C4–C5: the unchanged source execution condition, exact shared verifier and release action contracts
retain the original fresh fallback, input bindings and required gates. The native affected catalog
already selects both changed test owners; no parallel test catalog is introduced.

Local verification passed 28/28 focused tests and all ten native affected owner checks in 33.53 seconds.
The same ten owners passed again in 32.07 seconds after the protected-main join.
Next: native publication and the protected Integration Gate.
Production artifacts do not consume these CI scripts; this is source tooling, with no new production
deployment claimed. Realized savings require an eligible next protected-main run and its partition
receipts; local call counts alone do not establish hosted-runner elapsed time, total cost or full-suite parity.
Rollback is a reviewed source revert; it restores slower fresh checks rather than altering live data.

## GTM

Pilot on the next eligible main integration. Compare recorded partition decisions and selected stage
durations against the exact historical observations, including provider lookup cost and cold inputs.
Acceptance: every eligible nonempty partition reuses; empty partitions make no provider calls;
ineligible evidence runs fresh; required protected checks pass. A changed runner or dependency is
an expected miss. Revisit only on a named failed invariant or measured resource regression.

Zero new spend or service is authorized. Provider billing, energy, token cost, cash savings, paid demand
and acquisition/retention remain unmeasured. Other consumers opt in through their existing input owner.
A source release proves this tool change; production verification and business acceptance stay separate.
