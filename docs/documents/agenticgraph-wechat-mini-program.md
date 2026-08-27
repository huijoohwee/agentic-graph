---
title: AgenticGraph WeChat Mini Program And WeChat Pay Reference
graphId: md:agenticgraph-wechat-mini-program
product: "AgenticGraph Canvas"
doc_type: "Reference PRD/TAD"
version: "0.2.0"
owner: "joohwee"
status: "reference-only-not-implemented"
date: "2026-05-29"
dev_repo: "${AG_GITHUB_ROOT}/agenticgraph"
prod_artifact_mirror: "${AG_GITHUB_ROOT}/huijoohwee/content/agenticgraph"
cloudflare_host: "airvio.co/agenticgraph"
---

# AgenticGraph WeChat Mini Program And WeChat Pay Reference

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

A future WeChat Mini Program could expose a compact AgenticGraph commerce surface for users who want to run image or video generation workflows inside the WeChat ecosystem. The payment flow would need to quote cost before compute, create a WeChat Pay order through a server-owned runtime, and unlock entitlements only after verified payment state.

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
