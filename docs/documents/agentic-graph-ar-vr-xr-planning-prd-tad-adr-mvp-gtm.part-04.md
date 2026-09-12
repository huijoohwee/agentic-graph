---
title: "Reference implementation: agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm section 4"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "3.0.1"
date: "2026-09-12"
lang: "en-US"
owner: "Solo Founder / AI Orchestrator"
continuity_id: "PLAN-AGENTIC-GRAPH-AR-VR-XR-PRD-TAD-ADR-MVP-GTM"
prd_revision: "3.0.1"
tad_revision: "3.0.1"
adr_revision: "3.0.1"
mvp_revision: "3.0.1"
gtm_revision: "3.0.1"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "1333-1380"
---

[Combined planning owner](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-AR-VR-XR-PRD-TAD-ADR-MVP-GTM@3.0.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

## Part VII — Validation Checklist Status

*(Pre-Implementation Gate items applicable at this authoring stage; unresolved items are explicit open items, not silent gaps.)*

- [x] Development team confirms TAD provides sufficient guidance *(solo-dev context — self-confirmed at authoring time; re-confirm at Phase 2 gate)*
- [x] QA confirms acceptance criteria are objectively testable *(all 17 ACs carry a VCC translation)*
- [x] Success metrics defined with baseline, target, and timeline *(all three features)*
- [x] Quality attributes specified with measurable scenarios; token cost and TCO attributes present *(all three features)*
- [ ] Open questions resolved or formally tracked *(9 open questions across all three features; tracked, not yet resolved)*
- [ ] TTV validated on a clean environment *(estimates only; walk-through pending Phase 3, all three features)*
- [x] Topology diagram corrected to the existing native physics owner and immediate AC-14 adapter; AC-13/15/16/17 remain outside the delivered topology
- [ ] Token budget actuals vs. estimates reviewed *(no actuals yet — pre-implementation)*
- [x] ADR-10/11 ownership corrected to the existing root ECS and native TypeScript physics owners; no new dependency admitted
- [ ] Agent-platform execution order reviewed *(n/a — all three dimensions explicitly Won't this increment, see Part IV)*
- [x] Readiness gap matrix present *(Part VI covers all three features and explicitly defers the separate FPS/MMORPG multiplayer scope)*
- [ ] License text re-verified for the pinned versions of the packages named in ADR-5, ADR-6, and ADR-8's Reference implementation lines, before Phase 2 merge *(tracked in each ADR's Consequences; not yet performed)*
- [ ] AC-14 implementation and exact-revision source/runtime/browser evidence completed *(documentation correction alone is not readiness proof)*

**Coverage ratio**: 17 of 17 PRD acceptance criteria map to a VCC (17/17); 20 of 20 TAD component rows carry a stated Readiness rung (20/20). Advisory-only guidance items are not counted in this ratio.

**Alignment status**: the authority correction is documentation-only. AC-14 is `spec-complete` and still lacks implementation and exact-revision evidence. AC-13, AC-15, AC-16, and AC-17 remain `undocumented` follow-on slices. No runtime-ready, production-verified, Prod, Cloudflare, Apple-device, Xcode, visionOS Simulator, or live-browser claim follows from this edit.

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-AR-VR-XR-PRD-TAD-ADR-MVP-GTM@3.0.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Part I — Product Requirements (PRD)](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#part-i--product-requirements-prd) |
| TAD | [Part II — Technical Architecture (TAD)](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-01.md#part-ii--technical-architecture-tad) |
| ADR | [Part III — Architectural Decision Records (ADR)](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-02.md#part-iii--architectural-decision-records-adr) |
| MVP | [MVP — reference implementation](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-04.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-ar-vr-xr-planning-prd-tad-adr-mvp-gtm.part-04.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`canvas/src/features/three/xrSpatialPhysicsAdapter.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/three/xrSpatialPhysicsAdapter.ts), [`canvas/src/features/xr-v2/behaviorDispatcher.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/xr-v2/behaviorDispatcher.ts), [`canvas/src/features/three/xrSceneMcpContract.mjs`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/three/xrSceneMcpContract.mjs). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
