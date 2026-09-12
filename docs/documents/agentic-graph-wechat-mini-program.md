---
title: agentic-graph WeChat Mini Program And WeChat Pay Reference
graphId: md:agentic-graph-wechat-mini-program
product: "agentic-graph Canvas"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.2.1"
owner: "joohwee"
status: "reference-only-not-implemented"
date: "2026-09-12"
dev_repo: "${AG_GITHUB_ROOT}/agentic-graph"
prod_artifact_mirror: "${AG_GITHUB_ROOT}/huijoohwee/content/agentic-graph"
cloudflare_host: "airvio.co/agentic-graph"
lang: "en-US"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-WECHAT-MINI-PROGRAM"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.2.0"
prd_revision: "0.2.1"
tad_revision: "0.2.1"
adr_revision: "0.2.1"
mvp_revision: "0.2.1"
gtm_revision: "0.2.1"
---

# agentic-graph WeChat Mini Program And WeChat Pay Reference

## Document Purpose

This document preserves the WeChat Mini Program and WeChat Pay monetization concept as a reference-only PRD/TAD. It is not a shipped runtime path. The repo currently has no WeChat Mini Program container, no WeChat Pay prepay Worker, no WeChat billing MCP service, and no WeChat entitlement ledger.

Current WeChat-related source ownership is limited to webpage import and media handling for WeChat article URLs and WeChat-hosted image assets. That source path must remain separate from Mini Program commerce planning.

## Current Repo State

| Area | Status | Boundary |
|------|--------|----------|
| WeChat article import | Implemented in webpage import/media handling | Existing URL/content owners detect WeChat article and image asset shapes. |
| Mini Program shell | Not implemented | No Mini Program app or runtime package exists in this repo. |
| WeChat Pay checkout | Not implemented | Current payment runtime is Stripe/Commerce-owned. |
| WeChat billing MCP tools | Not implemented | No MCP server, tool registry, or billing command exists. |
| WeChat entitlement ledger | Not implemented | No WeChat-specific entitlement persistence exists. |

## Product Concept

A future WeChat Mini Program could expose a compact agentic-graph commerce surface for users who want to run image or video generation workflows inside the WeChat ecosystem. The payment flow would need to quote cost before compute, create a WeChat Pay order through a server-owned runtime, and unlock entitlements only after verified payment state.

Candidate outcomes:

- User opens a Mini Program surface and selects a generation workflow.
- The surface quotes credits before compute starts.
- WeChat Pay handles checkout inside the Mini Program.
- Server-owned payment verification unlocks entitlements.
- The shared Commerce surface remains the canonical place for checkout, entitlement, reconciliation, and trace readiness.

These outcomes remain inactive until implemented in source.

## Activation Requirements

Before this document can mark WeChat commerce implemented, source owners and tests must exist for:

| Contract | Required proof |
|----------|----------------|
| Mini Program runtime | App package, build path, and deployment instructions. |
| Payment order creation | Server-owned prepay endpoint with no client-side secret handling. |
| Payment verification | Webhook or status verification with replay protection. |
| Entitlements | Shared Commerce-owned entitlement state that does not duplicate Stripe or ACP ledgers. |
| MCP tooling | Tool names, schemas, auth, and confirmation policy if an MCP billing surface is added. |
| UI handoff | MainPanel Commerce remains the canonical checkout and entitlement surface. |
| Validation | Unit tests, docs/source-owner guard, hygiene check, and any required deploy smoke. |

## Technical Direction

An active implementation should reuse the current Commerce ownership model:

- Keep all checkout and entitlement UX in MainPanel Commerce.
- Keep payment secrets and order verification on a server runtime.
- Reuse agentic-commerce quote/proof/trace concepts instead of creating a parallel billing model.
- Reuse shared semantic-key helpers for any derived commerce, entitlement, or trace cache.
- Keep WeChat article import/media handling separate from Mini Program commerce runtime.

## Non-Goals

- No browser-stored payment secrets.
- No WeChat-specific copy of the Commerce tab.
- No WeChat entitlement table unless the shared Commerce contract requires it.
- No unverified client-side unlock.
- No repo-local fixture standing in for a live payment verification path.

## Acceptance Gate

This document can move from reference-only to implemented only when:

1. Source owners exist for Mini Program runtime, payment creation, payment verification, entitlement update, and Commerce handoff.
2. The implementation reuses the existing Commerce ownership model wherever possible.
3. Tests prove that payment state cannot unlock entitlements without server verification.
4. The real workflow passes focused unit tests, `npm run hygiene:check`, TypeScript, and deploy smoke for any server route.

Until then, WeChat Mini Program commerce remains inactive and must not be presented as shipped behavior in UI, docs, tests, or deployment notes.

## ADR: retain the shared commerce owner for future activation

The proposed Mini Program must consume the existing Commerce checkout, verification and entitlement owners described in Technical Direction. Reject a separate client-side billing ledger because it would duplicate authority and reconciliation. The consequence is an inactive concept until the Activation Requirements have source and test evidence; article import remains an independent implemented feature. A provider-specific runtime needs a successor decision and its own measured cost and payment evidence.

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-WECHAT-MINI-PROGRAM@0.2.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Product Concept](agentic-graph-wechat-mini-program.md#product-concept) |
| TAD | [Technical Direction](agentic-graph-wechat-mini-program.md#technical-direction) |
| ADR | [ADR: retain the shared commerce owner for future activation](agentic-graph-wechat-mini-program.md#adr-retain-the-shared-commerce-owner-for-future-activation) |
| MVP | [MVP — reference implementation](agentic-graph-wechat-mini-program.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-wechat-mini-program.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run hygiene:check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. No feature implementation artifact was independently bound by this document review; implementation disposition remains **unverified** pending the document owner’s source-to-VCC check.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
