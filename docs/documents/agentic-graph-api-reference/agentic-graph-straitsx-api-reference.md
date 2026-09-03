---
title: "Reference implementation: agentic-graph - StraitsX API Reference"
id: "md:agentic-graph-straitsx-api-reference"
doc_type: "Reference"
version: "0.2.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.api-reference.straitsx"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
guideline_version: "1.7.0"
doc_path: "docs/documents/agentic-graph-api-reference/agentic-graph-straitsx-api-reference.md"
ssot_upstream: "https://docs.straitsx.com/docs/introduction"
ssot_captured: "2026-07-28"
upstream_last_updated: "about 1 year before capture, per the upstream page footer"
sandbox_base_url: "https://api-sandbox.straitsx.com/v1"
attribution: "Summarized and paraphrased from the StraitsX API Guides. Content was rephrased for compliance with licensing restrictions."
consumers:
  - "docs/documents/agentic-graph-payments-prd-tad.md"
  - ".kiro/specs/agentic-graph-payments/requirements.md"
companion_reference: "docs/documents/agentic-graph-api-reference/agentic-graph-straitsx-authentication-reference.md"
acos_invocation:
  commands: ["/payment.rail.select", "/payment.intent.create", "/payment.event.settle"]
  bindings: ["@payment-rail", "@payment-provider"]
  tags: ["#payment-rail-selection", "#payment-settlement-integrity"]
  owner: "agentic-canvas-os/docs/MCP-GATEWAY.md"
tags:
  - "straitsx"
  - "xsgd"
  - "paynow"
  - "sgd"
  - "payments"
  - "payouts"
---

# Reference implementation: agentic-graph - StraitsX API Reference

**Upstream SSOT**: [StraitsX API Guides](https://docs.straitsx.com/docs/introduction), captured 2026-07-28.
**Companion**: authentication headers, signing mode, and the endpoint index live in
`agentic-graph-straitsx-authentication-reference.md`.

Content was rephrased for compliance with licensing restrictions. Details absent upstream are
recorded as `not documented upstream` rather than inferred.

## Access Precondition

API access is granted against an approved use case, and that approved use case determines which
integration model and which endpoints apply
([StraitsX API Guides](https://docs.straitsx.com/docs/introduction)). agentic-graph therefore treats
the integration model as configuration input rather than a runtime choice: exactly one model per
deployment, recorded in the payment Worker configuration.

## Integration Models

Three models are documented. They differ by whose funds move and who the counterparty may be.

| Model | Fit (paraphrased) | Funds may come from | Funds may be sent to |
|---|---|---|---|
| [First Party Transfer (Customer Profile)](https://docs.straitsx.com/docs/first-party-transfer) | Platforms moving funds for their own verified end users, such as crypto exchanges | The end user's own bank account only | The same end user's own bank account only; no third parties |
| [Third Party Transfer (Customer Profile)](https://docs.straitsx.com/docs/third-party-transfer) | Platforms collecting and disbursing on behalf of their users, such as payment service providers and marketplaces | Flows the partner initiates on behalf of its users | Users, merchants, or third parties as the partner directs |
| [Regular Transfer](https://docs.straitsx.com/docs/regular-transfer) | Businesses collecting and paying out for themselves, such as corporate treasury | Any of the partner's own corporate bank accounts | Users, merchants, or linked corporate bank accounts |

Upstream framing per model, condensed:

- **First Party Transfer** - KYC-verified end users deposit from and withdraw to their own
  accounts, with the provider enforcing the compliance and tracking boundary. Chosen for
  regulatory containment when the platform serves identified users.
- **Third Party Transfer** - the partner collects user KYC details, users transact through the
  partner's surface, and the partner initiates provider calls. Chosen for scaled,
  marketplace-shaped fund flows.
- **Regular Transfer** - the partner uses its own funds and initiates internal transfers between
  linked accounts. Chosen for treasury-shaped movement with no third-party users.

### agentic-graph selection note

A solo operator collecting payment for its own product, with no end-user custody and no
disbursement to third parties, most closely matches **Regular Transfer**. This stays an open
question until confirmed with the provider, because the model is granted against the approved
use case rather than self-selected. Tracked as OQ-2 in
`docs/documents/agentic-graph-payments-prd-tad.md`.

## Product API Families

Six families are documented. Availability per account depends on the integration model and the
access granted ([StraitsX API Guides](https://docs.straitsx.com/docs/introduction)).

| Family | Capability summary (paraphrased) | agentic-graph relevance this increment |
|---|---|---|
| Customer Profiles API | Create, update, and retrieve end-user profiles; hold per-user transaction history; satisfy KYC obligations; link bank accounts to users. Two profile variants exist (CP and CP+), documented separately. | Only if the granted model requires customer profiles. Not required for self-collection. |
| Payment API | One-time collections; PayNow and bank transfer methods; dynamic and persistent PayNow QR codes; real-time payment status reads. | **Primary.** The SGD fiat collection rail. |
| Payout API | Disbursement to bank accounts, bulk payout handling, payout status tracking and reporting. | Out of scope (Could tier). |
| Swap API | Real-time swap quotes, execution between stablecoins and supported digital assets, historical swap retrieval, price and liquidity monitoring. | Out of scope (Could tier: XSGD to SGD conversion). |
| Blockchain API | On-chain deposits and withdrawals for supported assets, address whitelisting, network fee estimation, multi-network support. | **Secondary.** XSGD inbound acceptance via deposit address. |
| Transaction Limit API (CP+ merchants only) | Read current transaction limits, request limit changes, read change-request detail. | Out of scope. |

## Rail Capability Map for agentic-graph

| agentic-graph need | Family | Endpoint group | Reference |
|---|---|---|---|
| SGD collection, QR-first and mobile-first | Payment API | Dynamic PayNow payment (create, get) | [Create a dynamic PayNow payment](https://docs.straitsx.com/reference/create-dynamic-paynow-payment) |
| SGD collection, reusable acceptance point | Payment API | Persistent PayNow payment method (create, get) | [Create a persistent PayNow payment method](https://docs.straitsx.com/reference/create-persistent-paynow-payment-method) |
| SGD collection via bank transfer | Payment API | Virtual bank account (create, get, delete) | [Create a virtual bank account](https://docs.straitsx.com/reference/create-virtual-bank-account) |
| Authoritative payment state read | Payment API | Get a payment; get a list of payments | [Get a payment](https://docs.straitsx.com/reference/get-a-payment) |
| XSGD inbound acceptance | Blockchain API | Create a deposit address; list deposit addresses | [Create a deposit address](https://docs.straitsx.com/reference/create-deposit-address) |
| Network allowlist for XSGD | Blockchain API | Get a list of supported blockchains | [Supported blockchains](https://docs.straitsx.com/reference/get-a-list-of-supported-blockchains) |
| Settlement event delivery | Webhooks | Get webhooks; update webhooks; resend callback (single, list, by event type) | [Webhooks](https://docs.straitsx.com/reference/webhooks) |
| Sandbox payment simulation | Payment API (sandbox) | Mock PayNow payment; mock bank transfer payment; mock status updates | [Sandbox mock PayNow payment](https://docs.straitsx.com/reference/sandbox-create-mock-paynow-payment) |
| Balance and reconciliation reads | Account Balance / Account Statement | Get account balance v2; get account statement | [Get account balance v2](https://docs.straitsx.com/reference/get-account-balance-v2) |

## Sandbox Posture

The documented sandbox base URL is `https://api-sandbox.straitsx.com/v1`
([Say Hello](https://docs.straitsx.com/reference/say-hello)). The reference set includes explicit
sandbox-only mutators for mocking payment creation, payment status transitions, bank account
verification status, blockchain address verification, withdrawal status, RFI questions, and
account top-up. That mock surface is what makes a zero-real-money end-to-end terminal-state
proof possible before any live credential exists, which is the basis of the agentic-graph per-rail
readiness gate invoked through `/payment.readiness`.

## Known Gaps

1. **Idempotency.** No request-level idempotency key header is documented for payment or payout
   creation. `not documented upstream`. agentic-graph compensates with a per-attempt request reference
   plus an authoritative provider state read before recording a second attempt.
2. **Callback authenticity.** Source-address allowlisting is documented; no signature header is
   ([Webhooks](https://docs.straitsx.com/reference/webhooks)). agentic-graph compensates by reading
   provider state before applying settlement.
3. **Commercial pricing.** Transaction, FX, and network fee schedules are not published in the
   referenced guides. `not documented upstream`. Blocks the revenue model in the payments
   PRD/TAD.
4. **MCP surface.** No MCP server is described for this provider. `not documented upstream`, so
   no parity with the hosted card-rail MCP transport can be promised.
5. **Upstream freshness.** The introduction page reports its own last update as roughly one year
   before capture. Re-verify the integration-model wording before sign-off.

## References

- [StraitsX API Guides](https://docs.straitsx.com/docs/introduction)
- [StraitsX API Reference index](https://docs.straitsx.com/reference/say-hello)
- [StraitsX Getting Started](https://docs.straitsx.com/docs/getting-started)
- [StraitsX Webhooks](https://docs.straitsx.com/reference/webhooks)
- [StraitsX Changelog](https://docs.straitsx.com/changelog)
- [StraitsX support](https://docs.straitsx.com/docs/support)
