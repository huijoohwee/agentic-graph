---
title: "Reference implementation: agentic-graph - StraitsX Authentication and Endpoint Index Reference"
id: "md:agentic-graph-straitsx-authentication-reference"
doc_type: "Reference"
version: "0.2.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.api-reference.straitsx-auth"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
guideline_version: "1.7.0"
doc_path: "docs/documents/agentic-graph-api-reference/agentic-graph-straitsx-authentication-reference.md"
ssot_upstream: "https://docs.straitsx.com/reference/say-hello"
ssot_captured: "2026-07-28"
upstream_last_updated: "about 2 months before capture, per the upstream page footer"
sandbox_base_url: "https://api-sandbox.straitsx.com/v1"
connectivity_probe: "GET /v1/authorize/hello"
attribution: "Summarized and paraphrased from the StraitsX API reference. Content was rephrased for compliance with licensing restrictions."
consumers:
  - "docs/documents/agentic-graph-payments-prd-tad.md"
  - ".kiro/specs/agentic-graph-payments/requirements.md"
companion_reference: "docs/documents/agentic-graph-api-reference/agentic-graph-straitsx-api-reference.md"
tags:
  - "straitsx"
  - "authentication"
  - "request-signing"
  - "sandbox"
  - "endpoint-index"
---

# Reference implementation: agentic-graph - StraitsX Authentication and Endpoint Index Reference

**Upstream SSOT**: [StraitsX Say Hello](https://docs.straitsx.com/reference/say-hello), captured 2026-07-28.
**Companion**: integration models and product families live in
`agentic-graph-straitsx-api-reference.md`.

Content was rephrased for compliance with licensing restrictions. Details absent upstream are
recorded as `not documented upstream`.

## Connectivity Probe

| Key | Value |
|---|---|
| Method and path | `GET /v1/authorize/hello` |
| Sandbox base URL | `https://api-sandbox.straitsx.com/v1` |
| Purpose | Confirm credentials and reachability before building any payment flow |
| Success response | HTTP 200 with an object carrying a single human-readable `msg` string |
| Documented example body | `{ "msg": "Hello world" }` |

Source: [Say Hello](https://docs.straitsx.com/reference/say-hello).

This probe is the agentic-graph readiness gate's first check for the SGD rail: it proves credential
validity without creating any financial object.

## Authentication Headers

| Header | Required | Meaning (paraphrased) |
|---|---|---|
| `X-XFERS-APP-API-KEY` | Always | The account API key from the Dashboard developer tools. Upstream states this header is mandatory for every authentication method, including plain API-key usage and HTTP Request Signing mode. |
| `X-PUBLIC-KEY-ID` | Signing mode only | The key identifier from the Dashboard. |
| `X-TIMESTAMP` | Signing mode only | Current Unix epoch seconds, which must fall within ±300 seconds of provider server time. |
| `X-NONCE` | Signing mode only | A per-request UUID for replay protection, not reusable within the timestamp window. Upstream constrains it with the pattern `/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i`. |
| `X-SIGNATURE` | Signing mode only | Base64-encoded digital signature over the canonical request string. |

Source: [Say Hello](https://docs.straitsx.com/reference/say-hello).

### agentic-graph derived rules

1. All five headers are built inside the payment Worker. None is reachable from the browser.
2. Signing mode is a per-account setting, so the request builder carries two modes, key-only and
   signed. The readiness gate reports which mode is configured.
3. The ±300 second window makes clock skew a real failure mode. The Worker uses a
   provider-derived time reference where available and treats a skew rejection as a typed,
   retryable failure rather than a credential failure.
4. Nonce reuse is a correctness defect, not a warning. One fresh UUID per outbound request
   attempt, never per logical intent.
5. The canonical-request construction is not documented on the captured page. `not documented
   upstream`; the signing string layout must be confirmed before signing mode is enabled.

## Endpoint Index

Grouped as the upstream reference navigation groups them, so the payments design can name owners
without re-deriving the surface each time.

### Identity and onboarding

| Group | Operations |
|---|---|
| Customer Profile (CP) | Create personal profile, create business profile, get profile, list profiles, update personal profile, update business profile, sandbox verification-status update |
| Customer Profile+ (CP+) | Create personal profile, create business profile, get profile, list profiles, update personal profile, sandbox verification-status update |
| Onboarding RFI | List outstanding RFIs, get one RFI request, submit RFI, sandbox simulate RFI questions, sandbox transition RFI status |
| CP/CP+ bank accounts | Create, list, update, delete, sandbox verification-status update |
| User bank accounts | Create, get, list, update, delete, sandbox verification-status update |

### Collections

| Group | Operations |
|---|---|
| First/Third Party bank transfer payments | Create virtual bank account, get virtual bank account, delete customer-profile virtual account, sandbox status and mock-payment mutators |
| First/Third Party PayNow payments | Create persistent PayNow method, get persistent PayNow, create dynamic PayNow payment, get dynamic PayNow, sandbox mock-payment and status mutators |
| First/Third Party general reads | List payment methods for a profile, get a payment for a profile, list payments for a profile (v2) |
| Regular bank transfer payments | Create virtual bank account, get virtual bank account, delete virtual account, sandbox status, mock bank transfer payment, mock dashboard deposit, mock deposit status |
| Regular PayNow payments | Create persistent PayNow method, get persistent PayNow, create dynamic PayNow payment, get dynamic PayNow, sandbox mock-payment and status mutators |
| Regular payment reads | Get a payment, list payment methods, list payments |

### Disbursement

| Group | Operations |
|---|---|
| First Party payouts | Create first-party bank transfer payout, get payout, list payouts, list outbound transfers, sandbox status mutator |
| Third Party payouts | Recipient requirements, create/update/get/list/delete customer-profile payout recipients, create third-party payout, get payout, list payouts, sandbox status mutator |
| Regular payouts | Recipient requirements, create/update/get/list/delete payout recipients, create regular payout, get payout, list payouts, sandbox status mutator |

### Conversion

| Group | Operations |
|---|---|
| Swap transactions | Get supported swap pairs, request quote, get quote, execute quote, get transaction, list transactions, sandbox status mutator |
| Foreign exchange (FX) | Create FX quote, get FX quote, FX payout recipient CRUD, create payout with FX, get payout with FX, list payouts with FX, sandbox status mutator |

### On-chain

| Group | Operations |
|---|---|
| Blockchain address | List blockchain addresses, sandbox create address, sandbox mock address verification status |
| Blockchain withdrawal | List supported blockchains, estimate network fee, create withdrawal, get withdrawal, list withdrawals, sandbox status mutator |
| Blockchain deposit | Create a deposit address, list deposit addresses |

### Account and operations

| Group | Operations |
|---|---|
| Transaction limits (CP+) | Get limit, request limit update, get update request, list update requests, sandbox status mutator |
| User withdrawal | Create withdrawal, get withdrawal, sandbox status mutator |
| Account balance | Get account balance v2, sandbox top-up |
| Account statement | Get account statement |
| Webhooks | Get webhooks, update webhooks, resend callback for one contract, resend callback for a list of contracts, resend callback by event type |
| Supported banks | List supported banks |

Index source: [StraitsX API reference navigation](https://docs.straitsx.com/reference/say-hello).

## agentic-graph Surface Subset

Only these operations are in the payments increment. Everything else in the index above is out of
scope, named here so scope creep stays visible.

| Purpose | Operation group |
|---|---|
| Rail readiness proof | Say Hello |
| SGD collection | Dynamic PayNow payment create and get |
| SGD collection alternative | Virtual bank account create and get |
| Authoritative state read | Get a payment |
| XSGD acceptance | Create deposit address plus list supported blockchains |
| Event delivery configuration and recovery | Get webhooks, update webhooks, resend callback |
| Sandbox proof | Mock PayNow payment plus mock status transition |

## Known Gaps

1. Canonical-request construction for `X-SIGNATURE` is not documented on the captured page.
   `not documented upstream`.
2. No idempotency-key header is documented for any mutating operation.
   `not documented upstream`.
3. No callback signature header is documented; source-address allowlisting is the documented
   control ([Webhooks](https://docs.straitsx.com/reference/webhooks)).
4. The live-mode base URL is not stated on the captured page; only the sandbox base URL is.
   `not documented upstream`.

## References

- [StraitsX Say Hello](https://docs.straitsx.com/reference/say-hello)
- [StraitsX API Guides](https://docs.straitsx.com/docs/introduction)
- [StraitsX Webhooks](https://docs.straitsx.com/reference/webhooks)
- [StraitsX Changelog](https://docs.straitsx.com/changelog)
