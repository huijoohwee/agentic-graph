---
title: "Graph Design and Theme Production Release Recovery"
doc_type: "PRD-TAD-ADR-MVP-GTM"
status: "recovery-in-progress"
version: "0.6.5"
date: "2026-09-24"
owner: "agentic-graph"
continuity_id: "PLAN-AGENTIC-GRAPH-DESIGN-EDITOR-BASELINE-PRD-TAD-ADR-MVP-GTM"
local_rung: "source-validation"
delivered_rung: "unverified"
---

# Graph Design and Theme Production Release Recovery

This is the delivery companion to the [implemented Design and theme record](./agentic-graph-design-editor-baseline-prd-tad-adr-mvp-gtm.md). It records the production failure without changing that record's product or buyer claims.

## PRD · outcome and acceptance

Graph PR #1245 integrated the native Design and theme changes at `6d5a47d3e983ff02af2ceb1ae230f2808a80cf86`. The authorized [production run #35987098995](https://github.com/huijoohwee/agentic-graph/actions/runs/35987098995) deployed the exact candidate, but returning-user service-worker convergence hit its 12-minute bound. Travel-mesh and Pages rollback steps succeeded; D1 rollback readback and the terminal carrier failed. The user needs an exact, verified release or a complete verified rollback, with no assertion from a partial effect.

Stable Pages and the public custom domain subsequently reported retained predecessor `272862cc4d130616497a392605bcb4caf25c3a5a` and artifact digest `0d7722096fa55cff553cd7c48b983ba08643c9fe7f3a3a5fa77e83b3fd3a25ed`. The forward D1 readback digest matched the predeploy digest `c1bcc14d0ba8a90ed5401e2e15607503503a03708f5abdc29b2fe3b164abdf50`; a final post-rollback D1 readback is missing. Production release remains unverified.

| ID | Given → when → then | Evidence |
|---|---|---|
| R1 | Given a returning user with the retained worker and 798 cached assets, when the new candidate is served, then the worker, scripts, caches and stored sentinel converge within the protected bound. | Protected browser convergence result and live v2 receipt |
| R2 | Given a prepublication failure, when rollback checks the pinned docs source, then full Git ancestry permits the existing authority check and authoritative D1 readback. | Rollback checkout contract, direct state receipt and rolled-back carrier |
| R3 | Given a successful candidate, when public transport and mirror checks pass, then the protected controller emits a production-complete carrier. | Exact release run and terminal artifact |

## TAD · source owners and budgets

`scripts/verify-production-service-worker-upgrade.mjs` retains response-content checks while matching cached responses in bounded batches of 24. `.github/workflows/release.yml` fetches full history for rollback docs so the existing ancestor-of-`origin/main` guard can validate the pinned revision. `scripts/__tests__/production-release-contract.test.mjs` fixes the checkout expectation. These are Graph-owned release surfaces; the protected workflow alone owns production effects. Sprint cap: 90 minutes, 8 KiB authored delta, five owner files. Refresh if crossed. No added service, paid tier, or always-load rule.

## ADR · preserve the authority boundary

Keep the protected release controller and fail-closed service-worker criteria. Do not extend the timeout, bypass the browser gate, treat matching earlier D1 digests as a final readback, or create a second production path. The recovery is reversible as a reviewed source change; any new production candidate needs exact review and its own environment authorization. The remaining risk is that the full worker upgrade can only be proven after a new candidate is deployed.

## MVP · checks and release rung

The 35-test release contract suite, affected checks, `npm run check`, and local syntax passed. An isolated read-only Chrome profile prewarmed 798 cached predecessor assets in about 56 seconds; the failed protected run spent 5 minutes 35 seconds in prewarm and then timed out after 12 minutes in upgrade verification. That local proof narrows the scan bottleneck but does not prove a deployed upgrade. Protected integration, exact candidate review, production browser validation and a terminal carrier remain open.

## GTM · operator handover

The existing $1 assisted visual-consistency review remains a hypothesis with no buyer receipt. After terminal release or rollback evidence, update the feature list and workspace TODO with separate Development, Production Release and Runtime status. The release operator owns that handover; no sales or adoption metric is inferred from CI or deployment.
