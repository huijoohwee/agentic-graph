---
title: "Reference implementation: Stripe MCP and Checkout Boundary Companion"
id: "md:agenticgraph-stripe-mcp-service.companion"
doc_type: "Technical Companion"
version: "0.3.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.mcp.stripe.companion"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/agenticgraph-mcp/agenticgraph-stripe-mcp-service.companion.md"
guideline_version: "1.7.0"
reference_implementation_label: "reference implementation"
parent: "agenticgraph-stripe-mcp-service.md"
parent_version: "0.4.0"
---

# Reference implementation: Stripe MCP and Checkout Boundary Companion

## Reference implementation ownership detail

This companion supplies file-level facts for
[the parent contract](agenticgraph-stripe-mcp-service.md). It replaces the former
optional schema and go/no-go material; those sections had no source owner or
recorded evidence. This file is not a second product contract or Invocation
Register.

| Scope | Local rung | Delivered rung | Basis |
|---|---|---|---|
| Companion detail | `spec-complete` | `undocumented` | Source seams and VCC hosts are named; no satisfying external-host or delivery Evidence Reference is attached. |

### MCP source contract

| Concern | Canonical owner | Source-present invariant |
|---|---|---|
| Constants | `grph-shared/src/payments/stripeMcpSsot.ts` | One remote URL string, one local package/launcher, one sandbox restricted-key reference, 60,000 ms startup timeout. |
| Tool policy | Same SSOT | Exactly 10 included tool names; `get_balance_summary` is explicitly excluded. |
| Confirmation | Same SSOT | Every hosted tool requires human confirmation; state/spend also requires the AgenticGraph Approval Gate. |
| Config builders | `canvas/src/features/panels/views/stripeMcpApiDocs.ts` | Remote JSON has URL only; local JSON has command/args and an environment reference, not a key value. |
| MainPanel projection | `canvas/src/features/panels/views/settingsMcpDocEntries.ts` | Fourteen virtual entries; no provider call. |

The 10 included source names are:

1. `stripe_api_search`
2. `stripe_api_details`
3. `stripe_api_read`
4. `stripe_api_write`
5. `get_stripe_account_info`
6. `create_refund`
7. `search_stripe_documentation`
8. `stripe_implementation_planner`
9. `send_stripe_mcp_feedback`
10. `stripe_report`

The UI's `accept_payment_ready` row is display vocabulary. Its value must not
be ingested as readiness evidence.

### Checkout source contract

| Concern | Canonical owner | Source-present behavior |
|---|---|---|
| Route/path and env constants | `grph-shared/src/payments/stripePaymentSsot.ts` | Owns checkout-session/webhook path identities, secret names, price authority, return-origin rules, quantity/id bounds, and API versions. |
| Browser checkout | `canvas/src/features/payments/stripeCheckout.ts` | Sends typed requests to the server-managed route. |
| Browser return | `canvas/src/features/payments/StripeCheckoutReturnRuntime.tsx` and `stripeCheckoutReturn.ts` | Reads minimal owned status and keeps unpaid/cancelled state locked. |
| Worker routing | `cloudflare/workers/agenticgraph-payment/index.ts` and `payments.ts` | Dispatches checkout create/status and webhook methods. |
| Provider adapter | `cloudflare/workers/agenticgraph-payment/stripeHostedCheckout.ts` | Creates/retrieves/expires provider sessions and maps typed results. |
| Durable records | D1 migrations `0002_stripe_payments.sql` and `0006_stripe_webhook_processing_state.sql` | Checkout-session and webhook-processing tables/columns. |
| ACP settlement | `agenticCommerceSettlement.ts` and related owners | Settles only matching typed session/amount/currency metadata. |

Source tests use provider/D1 fixtures. They do not establish Worker deployment,
actual secrets, provider account state, or public reachability.

### Secret and configuration boundary

| Data class | Allowed owner | Forbidden owner |
|---|---|---|
| OAuth session/restricted MCP key | External MCP host or server secret store | Browser settings, docs, fixtures |
| Payment API key/webhook secret | Payment Worker secret store | Visible Worker vars, Pages vars as substitute, browser |
| Checkout price/mode/return origin | Payment Worker visible config as source contract permits | Secret input when the readiness/config scripts forbid it |
| Provider session URL/customer metadata | Worker/D1 settlement path | General browser status response or logs |
| Config placeholder/reference | MainPanel copy text | Must never be replaced with a real key in source |

### Failure and compensation matrix

| Condition | Source-present response |
|---|---|
| Missing server key or price authority | Fail before returning checkout success. |
| Caller-owned return URL outside the allowed origin | Reject. |
| Provider amount/currency mismatch | Expire where possible and return failure. |
| D1/audit persistence fails after provider create | Attempt expiry/compensation and withhold hosted URL. |
| Unknown local session on status read | Reject before provider lookup. |
| Legacy status parameter alias | Reject. |
| Bad/old webhook signature or wrong API version | Reject without settlement. |
| Duplicate webhook id/same payload | Avoid duplicate side effects. |
| Duplicate webhook id/different payload | Conflict. |
| Failed/stale processing claim | Follow the explicit retry/reclaim rules in source. |

### Economics and execution bounds

| Path | Model tokens | Loop/bound | TCO posture |
|---|---:|---|---|
| Config rendering | 0 | Finite row projection | USD 0 incremental source path |
| Browser checkout/return | 0 | One request plus explicit user-driven status lifecycle | Worker/provider costs unmeasured |
| Optional readiness smoke | 0 | Source timeout is 15,000 ms and the created smoke session must be expired/withheld | No production claim |
| Webhook processing | 0 | Signature tolerance and stale-processing thresholds are numeric in source | D1/Worker actual unmeasured |
| External MCP tool | Host-defined | Confirmation required; no agent loop specified here | Provider/host actual unmeasured |

The parent owns the managed/self-managed/hybrid 12-month comparison and ROI
gate. No optional audit database is proposed here; actual D1 owners remain the
only documented payment persistence.

### Delivery reach and lane boundaries

| Capability | Browser | Mobile | Offline |
|---|---|---|---|
| MCP config rows | Source-present | Not separately evidenced | Readable |
| Commerce checkout client | Source-present | Not separately evidenced | Provider operation unavailable |
| Worker checkout/webhook | Source-present unit | Not a client capability | Unavailable |

| Boundary | State | Required closure evidence |
|---|---|---|
| Authoring → mirror | `closed` | Operator instruction, evidence, target, rollback |
| Mirror → delivery | `closed` | Operator instruction, evidence, target, rollback |
| Browser → payment Worker | Not promoted by this doc | Clean-client/Worker VCC plus route/config evidence |
| Worker → provider | Not promoted by this doc | Sandbox/provider VCC, secret/config proof, compensation result |

Canonical MCP endpoint ownership remains in
[the MCP installation contract](../agenticgraph-mcp-install-contract.md). Payment
HTTP paths remain in their existing API catalog and source SSOT.

### Planned evidence hosts

| VCC | Registered case | Expected result | Evidence Reference |
|---|---|---|---|
| `VCC-STRIPE-C-01` | `ui.mainPanel.mcpHub.surfacesStripeMcpPaymentReadiness` | Source rows render without actual keys. | None recorded |
| `VCC-STRIPE-C-02` | `ui.payments.stripe.checkout.usesServerManagedRoute` | Browser checkout targets the server-owned path. | None recorded |
| `VCC-STRIPE-C-03` | `worker.payments.stripe.checkout.createsSessionServerSide` | Fixture path validates server-side creation/persistence shape. | None recorded |
| `VCC-STRIPE-C-04` | `worker.payments.stripe.webhook.rejectsBadSignature` | Invalid signature fails closed. | None recorded |
| `VCC-STRIPE-C-05` | `worker.payments.stripe.checkout.rejectsUnownedStatusLookup` | Unknown local session is rejected before upstream read. | None recorded |
| `VCC-STRIPE-C-06` | External-host confirmation/approval test | All hosted tools and state/spend gates are proven. | None recorded |

Each registered case must be invoked through `npm run test:ci:unit -- <case>`
from `canvas/` and must report `SUMMARY total=1 ... failed=0`. A future evidence
record must also name commit, lane, time, and distinct evaluator.
