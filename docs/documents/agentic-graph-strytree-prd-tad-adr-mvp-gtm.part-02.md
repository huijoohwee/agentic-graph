---
title: "Reference implementation: agentic-graph-strytree-prd-tad-adr-mvp-gtm section 2"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.2.3"
date: "2026-09-12"
lang: "en-US"
owner: "Product maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-STRYTREE-PRD-TAD-ADR-MVP-GTM"
prd_revision: "0.2.3"
tad_revision: "0.2.3"
adr_revision: "0.2.3"
mvp_revision: "0.2.3"
gtm_revision: "0.2.3"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-strytree-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "464-508"
---

[Combined planning owner](agentic-graph-strytree-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-STRYTREE-PRD-TAD-ADR-MVP-GTM@0.2.3`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

## B7. Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---:|---:|---|
| Public tree load success | Prototype static only | 99% API snapshot success in preview | MVP |
| Durable branch publish | 0 | 1 persisted child branch after reload | MVP |
| Ledger double-spend incidents | Not applicable | 0 duplicate debits under retry tests | MVP |
| Webhook duplicate credit incidents | Not applicable | 0 duplicate credits under replay fixture | MVP |
| Generation refund correctness | Mock refund only | 100% provider failure refunds in tests | MVP |
| Unlock entitlement persistence | In-memory only | Entitlement survives reload and new device session | MVP |
| Credit-token cost per generation | 5 mock credits | Configurable server quote, default 5 credits | MVP |
| Monthly TCO | Static hosting only | Cloudflare free/low tier plus payment/provider variable cost | MVP |
| LLM/model token budget | None | Cost log per AI/provider call | MVP |
| Candidate compare cost transparency | None | 100% candidate cards show credit cost, elapsed time, fallback status, and publish eligibility | Add-on |
| Candidate merge correctness | None | Exactly one selected candidate becomes a public child node per publish action | Add-on |
| Candidate provider waste | Unknown | Rejected candidate artifacts stay private and auditable; no public graph mutation | Add-on |

---

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-STRYTREE-PRD-TAD-ADR-MVP-GTM@0.2.3`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Part B - Product Requirements Document](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#part-b---product-requirements-document) |
| TAD | [Part C - Technical Architecture Document](agentic-graph-strytree-prd-tad-adr-mvp-gtm-architecture.md#part-c---technical-architecture-document) |
| ADR | [Part D - Architectural Decisions](agentic-graph-strytree-prd-tad-adr-mvp-gtm-validation.md#part-d---architectural-decisions) |
| MVP | [MVP — reference implementation](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run travel-commerce:strytree-ledger:test` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`canvas/src/components/StoryboardCanvas.tsx`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/components/StoryboardCanvas.tsx), [`canvas/src/features/strybldr/strybldrStoryboard.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/strybldr/strybldrStoryboard.ts), [`canvas/src/features/strybldr/strytreeWorkflow.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/strybldr/strytreeWorkflow.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
