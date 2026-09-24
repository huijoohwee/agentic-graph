---
title: "Graph Design and Theme Production Release Recovery"
doc_type: "PRD-TAD-ADR-MVP-GTM"
status: "production-verified"
version: "0.6.6"
date: "2026-09-24"
owner: "agentic-graph"
continuity_id: "PLAN-AGENTIC-GRAPH-DESIGN-EDITOR-BASELINE-PRD-TAD-ADR-MVP-GTM"
local_rung: "dev-proven"
delivered_rung: "production-verified"
---

# Graph Design and Theme Production Release Recovery

This is the delivery companion to the [implemented Design and theme record](./agentic-graph-design-editor-baseline-prd-tad-adr-mvp-gtm.md). It retains the failed attempt and records the verified recovery without changing that record's product or buyer claims.

## PRD · outcome and acceptance

Graph PR #1245 integrated the native Design and theme changes at `6d5a47d3e983ff02af2ceb1ae230f2808a80cf86`. The authorized [production run #35987098995](https://github.com/huijoohwee/agentic-graph/actions/runs/35987098995) deployed the exact candidate, but returning-user service-worker convergence hit its 12-minute bound. Travel-mesh and Pages rollback steps succeeded; D1 rollback readback and the terminal carrier failed. The user needs an exact, verified release or a complete verified rollback, with no assertion from a partial effect.

At that failed attempt, stable Pages and the public custom domain reported retained predecessor `272862cc4d130616497a392605bcb4caf25c3a5a` and artifact digest `0d7722096fa55cff553cd7c48b983ba08643c9fe7f3a3a5fa77e83b3fd3a25ed`. The forward D1 readback digest matched the predeploy digest `c1bcc14d0ba8a90ed5401e2e15607503503a03708f5abdc29b2fe3b164abdf50`; a final post-rollback D1 readback for that attempt was missing. That attempt remains unverified, not a successful rollback claim.

| ID | Given → when → then | Evidence |
|---|---|---|
| R1 | Given a returning user with the retained worker and 798 cached assets, when the new candidate is served, then the worker, scripts, caches and stored sentinel converge within the protected bound. | Protected browser convergence result and live v2 receipt |
| R2 | Given a prepublication failure, when rollback checks the pinned docs source, then full Git ancestry permits the existing authority check and authoritative D1 readback. | Rollback checkout contract, direct state receipt and rolled-back carrier |
| R3 | Given a successful candidate, when public transport and mirror checks pass, then the protected controller emits a production-complete carrier. | Exact release run and terminal artifact |

## TAD · source owners and budgets

`scripts/verify-production-service-worker-upgrade.mjs` retains response-content checks while matching cached responses in bounded batches of 24. `.github/workflows/release.yml` fetches full history for rollback docs so the existing ancestor-of-`origin/main` guard can validate the pinned revision. `scripts/__tests__/production-release-contract.test.mjs` fixes the checkout expectation. These are Graph-owned release surfaces; the protected workflow alone owns production effects. Sprint cap: 90 minutes, 8 KiB authored delta, five owner files. Refresh if crossed. No added service, paid tier, or always-load rule.

## ADR · preserve the authority boundary

Keep the protected release controller and fail-closed service-worker criteria. Do not extend the timeout, bypass the browser gate, treat matching earlier D1 digests as a final readback, or create a second production path. The recovery remains reversible as a reviewed source change; any later production candidate needs exact review and its own environment authorization. The successful forward run below proved the full worker upgrade for its candidate, while rollback execution remains unexercised for that run.

## MVP · checks and release rung

The 35-test release contract suite, affected checks, `npm run check`, and local syntax passed for the recovery source. An isolated read-only Chrome profile prewarmed 798 cached predecessor assets in about 56 seconds; the failed protected run spent 5 minutes 35 seconds in prewarm and then timed out after 12 minutes in upgrade verification. That local proof narrowed the scan bottleneck but did not itself prove a deployed upgrade.

**Verified forward release, 2026-09-24.** Graph PR [#1249](https://github.com/huijoohwee/agentic-graph/pull/1249) passed its required Integration Gate and merged as protected `main` revision `f16ad08ac920ed125072b6de81335e96c790e3f3`. The authorized [production run #35996898470](https://github.com/huijoohwee/agentic-graph/actions/runs/35996898470) completed successfully for that exact revision and candidate digest `39c612699069e03f1531d5be59b50e4341d8d7dc46e908395df63df86b28a95e`. Its native lifecycle carrier reported `production-complete`. Pages deployment `5a34a943-15c6-4574-8cc6-e405fdacc3c0` served artifact digest `ac4643f034f618d8c43a468d24eeeb2ac9de97de56ca424eac69628b8b08e493`; the [public readiness marker](https://airvio.co/agentic-graph/.well-known/runtime-readiness.json) resolved the same Graph revision and artifact. Direct D1 readback passed with 31 documents, 10 chunks, zero graphs and digest `c1bcc14d0ba8a90ed5401e2e15607503503a03708f5abdc29b2fe3b164abdf50`. Public routes, returning-user service-worker convergence, browser fidelity and mirror parity passed. This proves R1 and R3 for this candidate. R2's rollback checkout was source-tested, but the successful forward run did not exercise a rollback; do not claim one. A new rollback recapture has identity digest `586fd5ab16235e28f6d408edbaa5084e76e71e2dc8d565189e82bf79eb7649c3`.

## GTM · operator handover

The [feature map](./agentic-graph-feature-map.md) and workspace planning successor distinguish Development, Production Release and Runtime evidence. The existing $1 assisted visual-consistency review remains a hypothesis with no buyer receipt; incremental mobile bytes, operator time and serving cost are unmeasured. The product operator's next bounded action is one consenting mobile browser pilot across Light, Black and Dark Blue, measuring visual corrections, task time and explicit offer response. Its completion check is one dated observation with the browser route, theme, viewport, measured results and buyer response; recheck the current live revision before inviting a participant. No sales or adoption metric is inferred from CI or deployment. This two-document handover is capped at 30 active minutes and 12 KiB diff; it does not change the deployed artifact or authorize another production effect.
