---
title: "Reference implementation: agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm section 1"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.2.1"
date: "2026-09-12"
lang: "en-US"
owner: "Product maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-AGENTIC-COMMERCE-PRD-TAD-ADR-MVP-GTM"
prd_revision: "0.2.1"
tad_revision: "0.2.1"
adr_revision: "0.2.1"
mvp_revision: "0.2.1"
gtm_revision: "0.2.1"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "1-446"
---

[Combined planning owner](agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-AGENTIC-COMMERCE-PRD-TAD-ADR-MVP-GTM@0.2.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.



# agentic-graph Agentic Commerce — PRD-TAD-ADR-MVP-GTM
---

## Overview

agentic-graph exposes a composable MCP-native commerce orchestration layer — `agentic-graph.commerce.*` — that makes any harness-driven workspace agent-buyable via the Agentic Commerce Protocol (ACP, Apache 2.0 / Stripe + OpenAI), while extending ACP with a FOSS Web3 identity sidecar (DeBox DID) and a governance signal adapter (OpenBOX risk scores). The layer operates across fiat (Stripe Shared Payment Token), on-chain EVM (ERC-20 / USDC on L2), and Solana Pay (`solana:` transfer URL + reference + verified transaction signature), routed by capability negotiation at session initiation.

**Governing lenses**: min-viable-max-value · TCO-zero · token economics · harness-first.

---

## Part 1 — PRD

---

### Epic AC-E1 — ACP-Compatible Agent Checkout

#### Problem Statement

AI agents (ChatGPT, Claude, custom harnesses) cannot initiate deterministic programmatic checkout against agentic-graph-powered workspaces or products.
Browser-automation workarounds are fragile, non-auditable, and fail PCI compliance.
ACP defines a standard REST + Delegate Payment interface that any compliant agent can call — agentic-graph must implement the seller-side spec to participate in the emerging agent commerce ecosystem.

#### Personas

**Agent Operator** — runs an AI agent (ChatGPT, agentic-graph harness, third-party) on behalf of a buyer; needs a deterministic, schema-validated checkout endpoint; values PCI safety and session idempotency.

**Seller / Solo Dev** — deploys agentic-graph as a product or data marketplace; wants agent-driven revenue without a bespoke storefront; values zero-infra-cost checkout that plugs into an existing Stripe account.

**Buyer** — interacts with an agent in natural language to purchase a digital good, data product, or harness run; never touches a checkout form directly.

#### User Journey — Agent Operator: Agent-Initiated Purchase

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Buyer expresses purchase intent in agent chat | Agent UI | No structured checkout target | ACP endpoint makes checkout deterministic |
| Discover | Agent calls `GET /.well-known/acp-config` | ACP config URL | Config absent or malformed | agentic-graph auto-publishes config |
| Engage | Agent creates checkout session, presents options | ACP `POST /checkout/sessions` | Session schema mismatch | Typed schema + validation harness |
| Complete | Agent submits payment token, session completes | ACP `POST /checkout/sessions/{id}/complete` | Payment credential exposure | Stripe Delegate Payment isolates credentials |
| Return | Webhook triggers post-purchase harness run | Webhook → harness | No post-purchase orchestration | `agentic-graph.commerce.settle` emits proof node |

#### User Stories

**AC-E1-S1**: As an Agent Operator, I want to discover a agentic-graph seller's ACP configuration via a well-known URL, so that my agent can initiate checkout without bespoke integration.

**AC-E1-S2**: As an Agent Operator, I want to create and complete an ACP checkout session via REST, so that my agent can purchase a digital product on behalf of a buyer without browser automation.

**AC-E1-S3**: As a Seller, I want checkout events to trigger a harness webhook, so that post-purchase orchestration (delivery, attestation, proof generation) is automated.

#### Acceptance Criteria

**AC-E1-S1-AC1**: Given a deployed agentic-graph seller instance, when `GET /.well-known/acp-config` is called by any HTTP client, then a valid ACP capability JSON response is returned within 300 ms with `Content-Type: application/json` and HTTP 200.

> **`/goal` translation**: `npm --prefix canvas run test:ci:unit -- "worker.payments.agenticCommerce.acpConfig" passes; GET /.well-known/acp-config returns HTTP 200 with required ACP fields from the shared Commerce SSOT`

**AC-E1-S2-AC1**: Given a valid ACP checkout session payload, when `POST /checkout/sessions` is called with a schema-valid body, then a session object is returned with `id`, `status: "open"`, and idempotency key echoed within 500 ms.

> **`/goal` translation**: `npm --prefix canvas run test:ci:unit -- "worker.payments.agenticCommerce.checkoutLifecycle" passes; POST /checkout/sessions returns 201 with status "open", persists through D1, and echoes the idempotency key`

**AC-E1-S3-AC1**: Given a completed checkout session, when Stripe emits a first-time `checkout.session.completed` webhook event, then `agentic-graph.commerce.settle` tool is invoked within 5 s, a `harness-proof.json` delta is appended, and the seller receives a 200 acknowledgment; repeated same-payload `processing` or `processed` Stripe event ids are acknowledged without replaying settlement, failure, cancellation, OpenBOX, or proof side effects; conflicting payloads for an existing event id fail closed; and `failed` or stale `processing` event ids remain retryable.

> **`/goal` translation**: `npm --prefix canvas run test:ci:unit -- "worker.payments.agenticCommerce.stripeWebhookSettle" passes; "worker.payments.agenticCommerce.stripeWebhookDuplicateSkipsSettlement" passes; "worker.payments.stripe.webhook.retriesFailedProcessing" passes; harness-proof.json contains a commerce entry with session_id for first-time paid events only, and settle tool call is logged in trace.jsonl`

#### Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---|---|---|
| ACP config endpoint p95 latency | n/a | < 300 ms | Sprint 1 |
| Checkout session creation success rate | 0% | ≥ 99% | Sprint 2 |
| Post-purchase webhook delivery rate | 0% | ≥ 99.5% | Sprint 2 |
| Token cost / checkout session | n/a | < 500 tokens | Sprint 2 |
| Monthly TCO (infra) | n/a | $0 (Cloudflare free tier) | Sprint 1 |
| ROI Score | — | ≥ 4.0 | Sprint 2 |

**ROI Score (AC-E1)**:
```
Impact = 4 (unblocks agent-driven revenue; high pain)
Reach  = est. 50 sessions/month at launch
Build  = 6 hours
TCO    = $0/month (Cloudflare Worker free tier + Stripe fees at variable cost)
Token  = ~500 tokens/session × 50 × $3/1M = ~$0.08/month

ROI = (4 × 50) / (6 + 0 + 0.08) ≈ 33 — well above threshold
```

#### MoSCoW Priority

| Tier | Feature | ROI Score | Rationale |
|---|---|---|---|
| Must | ACP config well-known endpoint | 33 | Zero-build entry point; unlocks all downstream |
| Must | Checkout session CRUD (create, get, complete, cancel) | 33 | Core ACP seller compliance |
| Must | Stripe Delegate Payment token acceptance | 25 | PCI-safe fiat rail; required for ChatGPT compatibility |
| Must | Post-purchase webhook → harness trigger | 18 | Automates delivery; closes commerce loop |
| Should | ACP Extensions capability negotiation | 12 | Enables Web3 sidecar (AC-E2) |
| Could | Seller dashboard for session monitoring | 6 | Nice to have; defer to later sprint |
| Won't | Custom storefront UI | 2 | ACP agent renders checkout; seller UI not required |

#### Min-Viable Scope (AC-E1)

Four Cloudflare Worker routes: `GET /.well-known/acp-config`, `POST /checkout/sessions`, `GET /checkout/sessions/:id`, `POST /checkout/sessions/:id/complete`.
Stripe webhook handler. Session/proof/trace state uses the existing payment Worker D1 binding. No separate store. No UI.

#### Out of Scope

Custom payment processor integrations (non-Stripe); subscription/recurring payment flows; physical goods fulfillment; buyer-facing storefront.

#### Dependencies

Stripe account (existing or new); Cloudflare Workers + D1 (free tier); ACP spec v2026-01-30 (Apache 2.0).

#### Open Questions

- Does the hackathon context require a testnet/mock Stripe environment, or can Stripe test mode suffice?
- Should `acp-config` advertise Web3 extension capability from day 0 or only after AC-E2 is shipped?

---

### Epic AC-E2 — Web3 Identity & Payment Extension

#### Problem Statement

ACP's `payment_method` schema is card/fiat-only. DeBox users authenticate via DID (Decentralized Identity, ERC-based) and transact in ERC-20 tokens (BOX) or stablecoins (USDC), while Solana-native buyers expect Solana Pay transfer URLs and reference-backed transaction verification.
There is no native ACP path for Web3 buyers. Without a bridge, DeBox communities cannot participate in agent commerce flows initiated through agentic-graph, creating a hard exclusion of the Web3 buyer segment.

#### Personas

**Web3 Buyer** — holds a DeBox DID + ERC-20/USDC balance or a Solana wallet with USDC/USDT; wants to transact with AI agents without exporting card credentials to a PSP; values self-custody and DID/reference-based provenance.

**DAO Operator** — runs a DeBox DAO; wants to trigger harness-driven deliverables (analyses, reports, graph builds) funded by DAO treasury; values on-chain auditability of spending.

#### User Journey — Web3 Buyer: DID-Gated Checkout

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Buyer signals Web3 payment intent to agent | Agent chat | ACP has no ERC-20 field | Extension sidecar carries DID in metadata |
| Discover | Agent reads ACP config `x-web3` extension | ACP config URL | Extension absent | Capability negotiation flags Web3 support |
| Engage | Agent initiates session with DID + token intent | ACP session + `x-web3` body | Schema mismatch on standard ACP | Extension fields ignored by non-Web3 sellers |
| Complete | On-chain transfer confirmed; synthetic vault token issued | L2 tx + Cloudflare Worker relay | No deterministic confirmation bridge | Worker polls L2; issues synthetic token on confirm |
| Return | EAS attestation anchored; proof node added to canvas | EAS Base Sepolia + AGENTIC_OS canvas | No provenance trail | `@node:proof` carries tx hash + attestation UID |
| Complete (Solana) | Wallet pays Solana Pay URL and returns signature | Solana Pay wallet + Worker RPC validation | Reference mismatch can unlock unpaid sessions | Worker verifies reference, recipient, amount, token mint, and memo before settlement |

#### User Stories

**AC-E2-S1**: As a Web3 Buyer, I want to signal my DeBox DID and ERC-20 payment intent via an ACP extension field, so that my agent can route payment to an on-chain rail without card credentials.
**AC-E2-S2**: As a DAO Operator, I want a completed on-chain payment to automatically trigger a harness run and anchor its proof as an EAS attestation, so that treasury spend is traceable to a deliverable.
**AC-E2-S3**: As a Solana-native buyer or agent, I want a checkout session to return a Solana Pay URL and settle only after a matching transaction signature is confirmed, so that payment is self-custodied and auditable without a parallel commerce worker.

#### Acceptance Criteria

**AC-E2-S1-AC1**: Given an ACP session with `x-web3.payment_method: "erc20"` and a valid `payer_did`, when the session is created, then the seller accepts the session, sets `status: "pending_onchain"`, and returns the L2 deposit address within 500 ms.
> **`/goal` translation**: `npm --prefix canvas run test:ci:unit -- "worker.payments.agenticCommerce.web3Checkout" passes; POST /checkout/sessions with x-web3 returns 201 with status "pending_onchain" and a deterministic deposit_address`
**AC-E2-S2-AC1**: Given a confirmed L2 transfer matching the session amount, when the Cloudflare Worker polls and detects confirmation, then `agentic-graph.commerce.attest` is called, an EAS attestation UID is returned within 30 s, and a `@node:proof` entry is appended to the active AGENTIC_OS canvas.
> **`/goal` translation**: `npm --prefix canvas run test:ci:unit -- "worker.payments.agenticCommerce.web3SettleRoute" passes; EAS attestation UID is present in harness-proof.json and @node:proof payload contains tx_hash plus attestation_uid`
**AC-E2-S3-AC1**: Given an ACP session with `payment_rail: "solana_pay"` and configured `SOLANA_PAY_RECIPIENT`, `SOLANA_PAY_SPL_TOKEN`, and `SOLANA_PAY_RPC_URL`, when the session is created and then settled with a transaction signature, then the Worker returns a generated Solana Pay transfer URL/reference, verifies the confirmed RPC transaction against the session, emits `agentic-graph.commerce.solana_pay_confirm`, and writes a `@node:proof` entry.
> **`/goal` translation**: `npm --prefix canvas run test:ci:unit -- "worker.payments.agenticCommerce.solanaPay" passes; Solana Pay sessions remain pending until the signature matches the generated reference, recipient, amount, SPL token, and memo`

#### Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---|---|---|
| Web3 session creation latency | n/a | < 500 ms | Sprint 3 |
| L2 confirmation polling latency | n/a | < 30 s (Base Sepolia) | Sprint 3 |
| EAS attestation cost / tx | n/a | < $0.01 (Base L2) | Sprint 3 |
| Monthly TCO (L2 gas) | n/a | < $0.50 at 50 tx/month | Sprint 3 |
| ROI Score | — | ≥ 3.5 | Sprint 3 |

**ROI Score (AC-E2)**:
```
Impact = 4 (unlocks Web3 buyer segment; differentiates from pure ACP)
Reach  = est. 20 sessions/month (Web3 subset)
Build  = 8 hours
TCO    = ~$0.50/month (L2 gas)
Token  = ~300 tokens/session × 20 × $3/1M ≈ $0.02/month

ROI = (4 × 20) / (8 + 0.50 + 0.02) ≈ 9.5 — above threshold
```

#### MoSCoW Priority

| Tier | Feature | ROI Score | Rationale |
|---|---|---|---|
| Must | ACP `x-web3` extension fields in session schema | 12 | Structural enabler; zero runtime cost |
| Must | L2 deposit address generation + polling Worker | 9.5 | Core EVM Web3 payment path |
| Must | Solana Pay transfer URL + RPC signature validation | 9.5 | Core Solana Web3 payment path |
| Should | EAS attestation on settlement | 8 | Provenance; complements OpenBOX (AC-E3) |
| Should | `@node:proof` canvas integration | 7 | Closes loop to AGENTIC_OS graph |
| Could | BOX token price oracle integration | 4 | Nice for UX; not required for MVP |
| Won't | Custom EVM smart contract (escrow) | 2 | Adds audit burden; L2 transfer + Worker is sufficient |

#### Min-Viable Scope (AC-E2)

`x-web3` extension fields in ACP session schema. Cloudflare Worker that generates a deterministic L2 deposit address through the shared semantic-key helper, confirms Base Sepolia transfers, and accepts Solana Pay sessions by generating a `solana:` transfer URL/reference and validating the confirmed signature through Solana RPC. EAS HTTP attestation endpoint. No custom contract.

#### Out of Scope

BOX token price discovery; DEX integration; escrow smart contracts; running a separate Solana Pay gateway process inside the Worker.

#### Dependencies

AC-E2 requires AC-E1 (ACP session infrastructure). EAS SDK (MIT).
Base Sepolia RPC (free public endpoint). `viem` or `ethers.js` (MIT).

#### Open Questions

- Should `payer_did` be validated against DeBox's DID registry on-chain, or is self-asserted DID sufficient for MVP?
- What is the acceptable confirmation block count on Base Sepolia for the hackathon demo (1 block ≈ 2 s)?

---

### Epic AC-E3 — Governance Overlay

#### Problem Statement

OpenBOX provides dynamic risk scoring and cognitive behavior analysis for AI agent actions.
These signals have no structural home in the ACP checkout flow or the agentic-graph harness trace.
Without integration, sellers cannot gate or flag agent-initiated transactions based on behavioral risk, and agents cannot surface governance provenance to buyers or auditors.

#### Personas

**Compliance-Oriented Seller** — deploying AI agents in regulated contexts (fintech, logistics, media); needs per-transaction risk scores attached to the audit trail; cannot approve agent actions without observable risk signals.

**OpenBOX Platform** — wants agentic-graph harness runs to generate governance-enriched proof artifacts that enterprise customers can ingest into their OpenBOX compliance dashboard.

#### User Stories

**AC-E3-S1**: As a Compliance-Oriented Seller, I want OpenBOX risk scores attached to each checkout session's harness proof, so that I can audit agent-initiated transactions against governance policy.

**AC-E3-S2**: As an OpenBOX Platform integrator, I want agentic-graph's `harness-proof.json` to be ingestible as a governance evidence artifact, so that agent commerce actions appear in the OpenBOX audit trail.

#### Acceptance Criteria

**AC-E3-S1-AC1**: Given a completed checkout session, when `agentic-graph.commerce.settle` executes, then the emitted `harness-proof.json` contains an `openbox_risk` block with `score`, `action`, and `session_id` fields sourced from the OpenBOX API response.

> **`/goal` translation**: `npm --prefix canvas run test:ci:unit -- "worker.payments.agenticCommerce.checkoutLifecycle" passes; harness-proof.json fixture contains openbox_risk block with score, action, and session_id`

**AC-E3-S2-AC1**: Given a `harness-proof.json` artifact, when it is POSTed to the OpenBOX ingest endpoint, then OpenBOX returns a 200 response and the run appears in the audit trail within 60 s.

> **`/goal` translation**: `npm --prefix canvas run test:ci:unit -- "worker.payments.agenticCommerce.openboxIngest" passes with HTTP 200 response logged`

#### MoSCoW Priority

| Tier | Feature | ROI Score | Rationale |
|---|---|---|---|
| Must | OpenBOX risk signal in ACP `risk_signals` array | 15 | Direct ACP spec alignment; no schema change |
| Should | `openbox_risk` block in `harness-proof.json` | 10 | Enriches proof artifact for compliance use |
| Could | OpenBOX ingest adapter (POST proof to OpenBOX API) | 6 | Useful for enterprise; not required for hackathon |
| Won't | OpenBOX real-time policy enforcement (block checkout) | 3 | Requires OpenBOX enterprise API; deferred |

#### Min-Viable Scope (AC-E3)

Call OpenBOX risk scoring API at session completion. Map response to ACP `risk_signals` format. Append `openbox_risk` block to `harness-proof.json`. No ingest adapter required for MVP.

---

## Part 2 — TAD

---

### Architecture Overview

**From agent purchase intent to proof-anchored delivery**: Agent → ACP Checkout Worker → agentic-graph Commerce Harness → [Fiat: Stripe | Web3: L2 + EAS] → Post-purchase Harness Run → `harness-proof.json` + Canvas `@node:proof`.

```mermaid
flowchart LR
    A[AI Agent / Buyer] -->|ACP REST| B[Checkout Worker\nCloudflare Worker]
    B -->|session/proof/trace state| C[(D1 tables\npayment Worker)]
    B -->|fiat path| D[Stripe\nDelegate Payment]
    B -->|web3 path| E[L2 Deposit\nBase Sepolia]
    E -->|poll confirm| F[Web3 Settle Worker\nCF Worker]
    F -->|EAS SDK| G[EAS Attestation\nBase Sepolia]
    B -->|webhook| H[Commerce Harness\nagentic-graph.commerce.*]
    H -->|risk signal| I[OpenBOX API]
    H -->|emit| J[harness-proof.json]
    H -->|append| K[AGENTIC_OS Canvas\n@node:proof]
    I -->|score| H
```

### Journey → System Mapping

| Journey Stage | Workflow | Data Flow | Component |
|---|---|---|---|
| Discover | ACP Config Discovery | Agent → Checkout Worker → JSON response | `acp-config` route |
| Engage | Checkout Session Lifecycle | Agent → D1 → Stripe / L2 | `checkout-worker` |
| Complete (fiat) | Delegate Payment Token Exchange | Agent → Stripe PSP → vault token | Stripe integration |
| Complete (web3) | L2 Transfer + Poll | Agent → L2 → Web3 Settle Worker | `web3-settle-worker` |
| Return | Post-purchase Harness + Attestation | Webhook → Harness → EAS → Canvas | `commerce-harness` |

---

### Component Specifications

---

**Component**: `acp-config-route`
**Responsibility**: Serves the ACP capability JSON document at `GET /.well-known/acp-config`, advertising seller checkout endpoint, supported payment methods, and `x-web3` extension flag.
**Interfaces**: `GET /.well-known/acp-config` → `application/json`
**Dependencies**: Cloudflare Worker runtime
**Configuration**: `SELLER_ID`, `CHECKOUT_BASE_URL`, `WEB3_ENABLED` (env vars)
**FOSS / Vendor**: FOSS — Cloudflare Worker (free tier); ACP spec Apache 2.0
**Token Budget**: N/A (no LLM call)

---

**Component**: `checkout-worker`
**Responsibility**: Implements ACP Agentic Checkout REST API (session CRUD + complete + cancel); validates request schemas; routes fiat sessions through hosted Stripe Checkout or the explicit delegate-token completion path, routes EVM Web3 sessions through the `x-web3` extension, routes Solana Pay sessions through generated transfer URLs and verified signatures, and persists session, proof, Stripe, and trace state to D1 through the existing payment Worker owner.
**Interfaces**:
- `POST /checkout/sessions` → `CheckoutSession`
- `GET /checkout/sessions/:id` → `CheckoutSession`
- `POST /checkout/sessions/:id/complete` → `CheckoutSession`
- `POST /checkout/sessions/:id/cancel` → `CheckoutSession`
**Dependencies**: Cloudflare D1 (free tier); hosted Stripe Checkout + webhook verification; optional Stripe delegate-payment endpoint; Base RPC and EAS attestation endpoint for EVM Web3 path; Solana RPC endpoint for Solana Pay signature verification
**Configuration**: `STRIPE_RESTRICTED_KEY` or `STRIPE_SECRET_KEY`, visible Worker `[vars]` checkout price authority (`STRIPE_CHECKOUT_PRICE_ID` or the inline checkout price tuple), `STRIPE_WEBHOOK_SECRET`, `STRIPE_DELEGATE_PAYMENT_URL`, `ACP_BEARER_TOKEN`, `SELLER_ID`, `CHECKOUT_BASE_URL`, `WEB3_ENABLED`, `WEB3_DEPOSIT_ADDRESS`, `BASE_RPC_URL`, `BASE_CONFIRMATION_BLOCKS`, `EAS_ATTEST_URL`, `OPENBOX_API_URL`, `OPENBOX_INGEST_URL`, `OPENBOX_API_KEY`, `X402_NETWORK`, `X402_ASSET`, `X402_AMOUNT`, `X402_FACILITATOR_URL`, `X402_PRICE`, `SOLANA_PAY_RECIPIENT`, `SOLANA_PAY_SPL_TOKEN`, `SOLANA_PAY_RPC_URL`, optional `SOLANA_PAY_AMOUNT_SCALE`, `SOLANA_PAY_NETWORK`, `SOLANA_PAY_LABEL`, and `SOLANA_PAY_COMMITMENT`. Use `npm run payment:stripe:configure` to validate operator-supplied Stripe env, write checkout price authority to `wrangler.toml` only with `-- --write-visible-vars --yes --confirm=apply-stripe-payment-worker-config`, reject mode/return-origin process input, and dry-run Worker secret names before applying secrets with `-- --apply --yes --confirm=apply-stripe-payment-worker-config`; use `npm run payment:agentic:readiness` to verify the remaining visible Worker `[vars]` plus `ACP_BEARER_TOKEN` and `OPENBOX_API_KEY` secret presence before treating the ACP/Web3/Solana surface as production-ready; deploy `payment:worker:deploy` after visible Worker `[vars]` changes, or include `--deploy-visible-vars --apply --yes --confirm=apply-stripe-payment-worker-config` for the explicit deploy path before live Checkout smoke.
**FOSS / Vendor**: FOSS — Cloudflare Worker + D1; ACP spec Apache 2.0; Stripe proprietary (see ADR-1)
**Token Budget**: N/A (no LLM call)

---

**Component**: `web3-settle-worker`
**Responsibility**: Polls Base Sepolia for L2 transfer confirmation matching a pending session; on confirmation, calls `agentic-graph.commerce.attest` to anchor an EAS attestation and returns the attestation UID.
**Interfaces**: Internal — invoked by `checkout-worker` on `pending_onchain` sessions via Cloudflare Queue (free tier)
**Dependencies**: Base Sepolia public RPC; EAS attestation HTTP endpoint
**Configuration**: `BASE_RPC_URL`, `BASE_CONFIRMATION_BLOCKS`, `EAS_ATTEST_URL`
**FOSS / Vendor**: FOSS — Cloudflare Worker + open HTTP integrations; no browser-secret exposure
**Token Budget**: N/A (no LLM call)

---

**Component**: `commerce-harness`
**Responsibility**: Orchestrates post-purchase actions — calls OpenBOX risk API, emits `harness-proof.json` delta, appends `@node:proof` to active AGENTIC_OS canvas — as a structured harness with typed inputs and outputs.
**Interfaces**: MCP tool `agentic-graph.commerce.settle` (input: `CheckoutSession`; output: `CommerceProof`)
**Dependencies**: OpenBOX API; existing agentic-graph harness runtime; AGENTIC_OS canvas writer
**Configuration**: `OPENBOX_API_KEY`, `CANVAS_WORKSPACE_ID`
**FOSS / Vendor**: FOSS — existing harness runtime; OpenBOX API proprietary (see ADR-2)

**Harness Contract**:
- Input schema: `{ session_id: string, buyer_did?: string, amount: number, currency: string, payment_rail: "fiat" | "erc20", attestation_uid?: string }`
- Output schema: `{ proof_id: string, openbox_risk: { score: number, action: "authorized"|"manual_review"|"blocked" }, attestation_uid?: string, canvas_node_id?: string }`
- Cost log fields: `{ model, prompt_tokens, completion_tokens, cache_hits, estimated_cost_usd }`
- Fallback path: if OpenBOX API unavailable → emit proof without risk block; log degraded mode; do not block settlement

**Token Budget**: ~300 prompt + ~150 completion tokens @ ~40% cache hit rate = ~$0.00135/request at `claude-haiku-4-5` pricing

**Orchestration Topology**: Sequential — `[OpenBOX risk call] → [proof emit] → [EAS attest if web3] → [canvas append]`
Max iterations: 1 (no loop); circuit-breaker: N/A (sequential, no retry beyond 2 attempts per step)

**`/goal` Conditions**:
- `harness-proof.json contains commerce entry with session_id, openbox_risk block, and proof_id — verified by worker.payments.agenticCommerce.checkoutLifecycle`
- `@node:proof appended to canvas fixture with attestation_uid present when payment_rail is erc20`

---

### Integration Contracts

| Interface | Protocol | Format | Auth | Errors |
|---|---|---|---|---|
| ACP Checkout API (seller) | HTTPS REST | JSON, `API-Version: 2026-01-30` | Bearer token | 400/401/409/422/429/500 per ACP spec |
| Stripe Delegate Payment | HTTPS REST | JSON | Stripe Secret Key | Stripe error codes; retry on 5xx |
| Base Sepolia RPC | HTTPS JSON-RPC | JSON-RPC 2.0 | None (public) | Retry with backoff; fallback to secondary RPC |
| EAS SDK | In-process | TypeScript | ECDSA private key | SDK throws; catch + log + degrade |
| OpenBOX Risk API | HTTPS REST | JSON | Bearer API key | 429 → backoff; 5xx → degrade (emit proof without risk) |
| AGENTIC_OS Canvas Writer | In-process | `@node:proof` YAML block | N/A | File write error → log + continue |

---

### Architectural Decisions

#### ADR-1: Stripe as PSP for Fiat Rail

**Status**: Accepted
**Date**: 2026-05-28

**Context**: ACP's Delegate Payment spec names Stripe Shared Payment Token as the first compatible PSP. No FOSS PSP implements the ACP Delegate Payment interface.

**Decision**: Use Stripe for fiat checkout. Implement ACP compliance via Stripe's agentic commerce endpoints.

**Alternatives Considered**:
1. **Custom PSP integration**: Full control; 40+ build hours; out of hackathon scope.
2. **Stripe (chosen)**: ACP-native; immediate ChatGPT compatibility; variable fee model.
3. **FOSS PSP (Adyen Open Source, PayPal SDK)**: Neither implements ACP Delegate Payment; would require spec fork.

**TCO Impact**:
| Dimension | Stripe | Best FOSS Alt | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo | $0/mo | $0 |
| Transaction fee | 2.9% + $0.30 | N/A (no ACP compat) | Variable |
| Vendor risk | Low (ACP co-author) | N/A | — |

**Consequences**:
- Positive: ACP-compliant from day 0; ChatGPT-compatible immediately
- Negative: Stripe fee on every fiat transaction (mitigated by Web3 rail for on-chain buyers)
- Neutral: Stripe test mode available at zero cost for hackathon demo

---

#### ADR-2: OpenBOX API as Risk Signal Source

**Status**: Accepted
**Date**: 2026-05-28

**Context**: ACP `risk_signals` array requires at minimum one signal per checkout. OpenBOX provides dynamic risk scoring for agent actions. No FOSS equivalent implements behavioral cognitive analysis for AI agents at the same fidelity.

**Decision**: Call OpenBOX API at session completion to populate `risk_signals`. Degrade gracefully if API unavailable.

**Alternatives Considered**:
1. **Static risk signal (fixed `card_testing` score 0)**: Zero build; passes ACP validation; no real governance value.
2. **OpenBOX API (chosen)**: Real governance signal; aligns with hackathon sponsors; requires API key.
3. **FOSS rule-based risk scorer**: 12+ build hours for meaningful signal; out of scope.

**TCO Impact**:
| Dimension | OpenBOX API | Static Fallback | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0 (free tier per OpenBOX launch) | $0 | $0 |
| Vendor risk | Medium (early-stage) | None | — |

**Consequences**:
- Positive: Real governance signal; hackathon alignment; audit trail value
- Negative: Vendor dependency; degrade path required
- Neutral: OpenBOX launched with no usage limits; re-evaluate at 12 months

---

#### ADR-3: Cloudflare Workers + D1 for Checkout Infrastructure

**Status**: Accepted
**Date**: 2026-05-28

**Context**: ACP checkout endpoints require a stateless compute layer with session, proof, and trace persistence. The FOSS-first, zero-TCO constraint eliminates self-hosted Node servers and separate storage stacks.

**Decision**: Reuse the existing Cloudflare payment Worker plus its D1 binding for all ACP endpoints, sessions, proofs, and trace events.

**Alternatives Considered**:
1. **Vercel Edge Functions**: Similar free tier; vendor lock-in; does not reuse the repo-owned payment Worker.
2. **Cloudflare Workers + D1 (chosen)**: Zero egress; zero cold start; queryable relational persistence; existing airvio stack.
3. **Self-hosted Express + Redis**: $5-15/month; operational overhead.

**TCO Impact**:
| Dimension | CF Workers + D1 | Self-hosted | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (free tier) | ~$10/mo | -$120 |
| Egress cost | $0 | ~$2/mo | -$24 |
| Vendor risk | Low (FOSS-compatible) | None | — |

---

