---
title: "agentic-graph target-owned ADLC authority enrollment"
doc_type: PRD-TAD-ADR-MVP-GTM
continuity_id: AGENTIC-GRAPH-AUTHORITY-001
version: 0.1.0
prd_revision: 0.1.0
tad_revision: 0.1.0
adr_revision: 0.1.0
mvp_revision: 0.1.0
gtm_revision: 0.1.0
date: "2026-10-07"
owner: agentic-graph
source_revision: f164650ab92abf7a591d1188b62dd529f8ec2967
runtime_readiness_policy: fail-closed
load_policy: on-demand
lifecycle_status: implementation-candidate
---

# Target-owned ADLC authority enrollment

This bounded repository-adapter change supplies the missing Graph-owned authority and transition
policy files required by the pinned Agentic OS completion contract. Its purpose is to unblock
reviewed source integration and closeout for the held aviation lane while preserving that lane's
existing bytes and reservation.

## Current facts and scope

The clean protected Graph revision `f164650ab92abf7a591d1188b62dd529f8ec2967` declares
`authority.runtime=consumer` and `authority.release=consumer`. Agentic OS completion status reads
`.agentic-os/github-transition-policy.json`, `.github/adlc-authority-policy.json`, and the two
repository-owned dispatch workflows. Those four enrollment files are absent from this revision.
The authority contract requires the target repository to own its policy and workflow; an OS-owned
policy for Graph is not Graph's transition authority.

The selected integration is a small local binding to the existing Agentic OS validator, pinned to
the Graph dependency revision `e1cf2c794ca8b8863cce20c267fbeae4639d2117`. Graph owns the exact
repository/ref/workflow bindings. Both dispatch workflows validate read-only and issue no GitHub
write, deployment, promotion, cleanup, or deletion effects. Protected source integration still
requires the current `Integration Gate` check.

The held aviation lane remains untouched, including its dirty PRD and seven out-of-reservation
files. PR #1567 remains the sole selected owner for Graph performance work; this authority scope
uses only the five paths listed below and leaves PRs #1566 and #1556 unchanged.

## PRD — user pain and acceptance contract

The workflow owner cannot complete a protected aviation release while Graph's completion status
cannot identify a target-owned authority root. The immediate user is the repository release owner;
the job is to validate an exact protected candidate without relying on a different repository's
authority. The smallest useful outcome is an exact self-owned policy/workflow binding with no
runtime feature or external service.

| ID | Measurable acceptance | Evidence |
|---|---|---|
| GA1 | Native completion status resolves the Graph authority repository to `github.com/huijoohwee/agentic-graph` and finds all four required policy/workflow files on protected `main`. | Fresh `npm run completion:status -- --ref=<exact-lane>` output after protected integration. |
| GA2 | Authority dispatch is bound to Graph `main`, the exact authority workflow, canonical policy bytes, exact Graph target, and successful `Integration Gate` evidence; invalid repository/ref/workflow/input/digest fails closed. | Pinned Agentic OS validator and targeted contract tests. |
| GA3 | Transition dispatch is bound to Graph `main`, the exact transition workflow, exact self-authority policy, selected Graph target, and the one-hour authority window. | Pinned Agentic OS transition validator and native transition replay. |
| GA4 | The change adds no runtime module, package dependency, prompt bytes, deploy effect, or production claim. | Diff, dependency and always-load review. |
| GA5 | The candidate passes the required protected `Integration Gate` before any merge or aviation-lane readmission. | Exact PR head check run and protected integration receipt. |

This candidate does not claim that an authority dispatch has already issued a grant. Initial issuance,
transition execution, lane integration, delivery, cleanup, and production verification remain separate
effects with separate receipts.

## TAD — technical design

The Graph adapter will bind a canonical transition policy to Graph `main`, the path
`.github/workflows/adlc-transition.yml`, the single Graph target, and the existing
`refs/heads/adlc/authority/` evidence prefix. The authority policy will bind the same canonical
ref, the Graph-owned authority workflow, `Integration Gate`, the existing 3,600-second validity,
and the repository's observed squash-only merge rule. The workflow must additionally check the
exact repository identity because the shared policy schema represents repository owners as
prefixes.

The workflows will use read-only GitHub permissions and check out the exact Agentic OS revision
already pinned by Graph. They will validate dispatch events only; source publication and authority
issuance stay in their existing native owners. No reusable authority implementation is copied into
Graph.

The full dispatch contract is fail-closed: only `workflow_dispatch` on current protected `main`,
the exact GitHub repository, the exact workflow path and revision, canonical policy bytes, exact
input digest, and policy-selected target/checks are accepted. Each runner has a five-minute bound,
uses read-only contents permission, and does not install Graph's full 4 GiB dependency tree.

## ADR — authority boundary

Choose Graph's own protected repository as its authority repository. Agentic OS owns the shared
validators and schemas; Graph owns only its target-specific policies and thin workflows. Reusing the
OS authority repository fails the existing completion contract's target-owner equality check and
the cleanup policy forbids cross-target initial issuance. Adding a second Graph authority runtime
or a shared mutable allowlist would duplicate owners and broaden trust.

## MVP — implementation and verification

Deliver the two canonical policy files and two read-only dispatch workflows, plus this plan. Validate
policy bytes with the exact pinned Agentic OS helpers; parse both workflow files and confirm their
trigger, target, runtime pin, permissions and timeout; then run the affected checks. The candidate
is accepted for review only when these checks pass. A real initial authority issuance is a later,
separately authorized operation after protected integration.

## GTM — rollout and cost

This is an internal release-governance prerequisite, not a buyer-facing feature. The implementation
uses the existing free GitHub and local Agentic OS runtime: incremental spend is `$0`; no paid
plan, add-on, external service, model call or always-load prompt bytes are added. Measured buyer
demand and commercial value are not claimed. After the protected check and merge, rerun native
completion status and resume only the exact held lane. No deployment or cleanup follows from this
policy change.

## Budget, rollback, and remaining work

Time-to-proof cap: 25 minutes (15 for implementation/admission and 10 for focused validation and
handoff); an external review wait is recorded as a blocker and recheck condition, never an ETA.
Implementation cap: five reserved paths, zero new runtime modules or dependencies, zero
always-load bytes, and under 8 KiB of planning text. Run focused policy/workflow validation first,
then the affected integration checks; do not repeat unrelated full-app builds. If any invariant
fails, revert only this lane's five paths and retain the lane and all recovery bytes.

After the candidate is protected-integrated, recheck the exact aviation lane and continue only if
native authority classification changes as specified. The aviation lane still needs its separate
reservation repair, fresh required check, exact source integration, applicable delivery receipts,
and native closeout. This plan grants none of those effects.
