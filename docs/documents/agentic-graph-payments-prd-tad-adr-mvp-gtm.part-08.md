---
title: "Reference implementation: agentic-graph-payments-prd-tad-adr-mvp-gtm section 8"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.3.1"
date: "2026-09-12"
lang: "en-US"
owner: "Payments product and architecture"
continuity_id: "PLAN-AGENTIC-GRAPH-PAYMENTS-PRD-TAD-ADR-MVP-GTM"
prd_revision: "1.3.1"
tad_revision: "1.3.1"
adr_revision: "1.3.1"
mvp_revision: "1.3.1"
gtm_revision: "1.3.1"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-payments-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "2730-3178"
---

[Combined planning owner](agentic-graph-payments-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-PAYMENTS-PRD-TAD-ADR-MVP-GTM@1.3.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### Deployment Strategy

**Environment sequence.** Dev only for this increment. Production mirror publication and
Cloudflare deployment are gated on a separate explicit operator instruction and are not part of
any task in this spec.

**Rollout pattern.** Incremental behind per-rail enablement flags, which act as the canary
mechanism. This document does not inherit or assert the card rail's runtime rung. The SGD rail
ships disabled and can be enabled locally only after every configuration VCC plus an
authenticated sandbox callback, provider read, and rail-specific success result has a
recorded Evidence Reference.

**Order of enablement**
1. Trust boundary and secret custody gating (R1, R12) — no buyer-visible change.
2. `Rail_Router` with the SGD rail disabled (R2) — card-rail behaviour unchanged; selection
   reason now recorded.
3. `Provider_Event_Ingress` hardening (R5) — benefits the existing card rail immediately.
4. `Intent_Queue` and `Reconciler` (R6), then `Receipt_Projection` (R7).
5. `StraitsX_Rail_Adapter` (R4) behind its flag; enable only after the gate passes.
6. `Payment_Surface` states (R8), `Agent_Discovery_Surface` (R9), typed failures and refunds
   (R10).

**Increment 2 follow-on order.** This is a linked follow-on workstream inside the same living
document, not an implied extension of Increment 1 readiness:
1. Authority closure: requirements owner accepts R13-R17; buyer-side ownership and canonical
   invocation identities resolve; seller-side ACP remains unchanged.
2. Deterministic local contracts: lifecycle schemas/state machine, single Paywall migration,
   100 replay/mutation fixtures, H2 bounds, prompt-injection fixtures, and secret canaries.
3. Spend safety: durable single-use approval with TTL/restart/replay proof, external signer
   approval, atomic authorization reservation, later-authorization deny, and zero provider
   calls on rejection.
4. Provider admission: authenticated account/card-program grants close OQ-17-OQ-21; exact
   XSGD-to-card settlement and secure credential contracts are bound.
5. Provider sandbox proof: card create/activate/control, 3DS, Remote Host Authorization,
   webhook/reconciliation, and safe disposal. XSGD/Avalanche proof remains separately gated
   where the provider path is production-only.
6. Browser proof: one allowed merchant at 375×812 covers redirect, injection, price/add-on
   drift, authentication, timeout, partial success, and credential redaction.
7. Golden path: one recorded Funding → Discovery → Issuance → Execution run carries exact
   source revision, TTV, token actuals, provider cost, receipt, and disposal state.
8. Operator UI enablement: only after stages 1-7; the existing Paywall may show unavailable
   readiness earlier but cannot invoke live/provider financial paths.

**Rollback plan.** Each rail is independently disable-able by flag, returning the router to
`only_ready_rail` behaviour without a deploy. Schema changes are additive, so a code rollback
needs no data migration. The offline queue is client-side and versioned; an unreadable queue
version is drained by reconciliation rather than discarded. Increment 2 has a separate
fail-closed capability flag. Disabling it blocks new lifecycle creation and authorizations,
but reconciliation and safe card closure remain enabled until every issued card and
reservation is terminal; rollback never abandons an active card.

**Migration path.** Intent records and the rail-neutral event ledger extend the existing
payment tables rather than introducing a store. The existing webhook processing-state pattern
is reused so in-flight and failed claims stay retryable rather than frozen. Increment 2 adds
revisioned lifecycle/card/reservation tables to the same binding, introduces exactly one
payment controller beneath the existing Paywall owner, and atomically migrates the one
provider-specific Paywall setting owner to the provider-neutral name with the legacy owner
removed.

#### Functional lanes

| Lane | Reference implementation location or surface | Mutation rights | Data residency | Readiness ceiling in this revision |
|---|---|---|---|---|
| Authoring | Dev checkout and local runtime | Source, focused tests, and local state only | Local device plus explicitly invoked sandbox dependencies | `dev-proven`; source-digest-bound 111-test local VCC recorded |
| Mirror | Production-content mirror | Publish-only from an approved whole Authoring state | Mirror repository/content storage | `undocumented`; unchanged |
| Delivery | Public web surfaces | Publish-only from an approved whole Mirror state | Public hosting and its configured stores | `undocumented`; unchanged |

#### Deploy Boundary Register

| Boundary | From → To | Evidence Reference | Operator instruction | Rollback statement and check | State |
|---|---|---|---|---|---|
| `PAYMENTS-AUTHORING-TO-MIRROR` | Authoring → Mirror | None recorded for this revision; source is ineligible for promotion | None. The current user instruction explicitly forbids Prod publication | No promotion occurred. If later opened, retain the prior mirror revision and verify whole-state mirror parity before and after rollback | `closed` |
| `PAYMENTS-MIRROR-TO-DELIVERY` | Mirror → Delivery | None recorded for this revision; no approved mirror candidate exists | None. The current user instruction explicitly forbids public deployment | No deployment occurred. If later opened, retain the last verified delivery revision and re-run the delivery-surface parity check after rollback | `closed` |

No authoring command in this revision mutates either downstream lane. Direct
Authoring-to-Delivery promotion is forbidden.

### Reference implementation: Component Inventory

Every row is conservatively derived from this document's VCCs. The Dev candidate is
source-digest-bound and executable; local results do not inherit provider, browser, protected,
mirror, or delivery proof.

| Layer | Component | File / Module | Local rung | Delivered rung | Evidence Reference |
|---|---|---|---|---|---|
| Client | `Payment_Surface` and trusted lifecycle invocation | `PaywallOverlay.tsx`, `PaymentSurfaceView.tsx`, `paymentSurfaceController.ts`, `AgenticPurchaseLifecycleView.tsx`, `trustedPurchaseInvocation.ts`, existing `CanvasViewport` mount | `dev-proven` | `undocumented` | Source/component cases cover ten distinct states including `refunded`; registered lifecycle tests reject spoofed and malformed invocation before mutation, show all four blocked phases, disable checkout, and cancel with zero provider calls; no live browser run |
| Client | Provider-neutral Paywall setting | `paymentPaywallSetting.ts` plus existing settings/store owners | `dev-proven` | `undocumented` | Generic key is canonical; focused tests prove one-time legacy-key migration and no parallel setting owner |
| Client | `Commerce_Discovery_Harness`, `Secure_Card_Broker` | future extensions under the browser-control owner selected by OQ-23 and the existing payments owner | `spec-complete` | `undocumented` | Shared bounds and candidate validation are executable, but no browser/PCI adapter or proof exists while OQ-19/OQ-23 remain open |
| Client | Checkout initiation and return | `canvas/src/features/payments/stripeCheckout.ts`, `StripeCheckoutReturnRuntime.tsx`, `stripeCheckoutReturn.ts` | `dev-proven` | `undocumented` | Existing return path uses the generic Paywall owner; no provider redirect or browser result is recorded |
| Client | Provider registry | `canvas/src/features/payments/providers.ts` | `dev-proven` | `undocumented` | R2/R4 source contracts pass locally; provider grants remain external |
| Client | Payment API transport | `paymentApiClient.ts` | `dev-proven` | `undocumented` | Typed create, read, reconcile, and refund envelopes bind the sole public route owner; public agent-create and refund requests remain denial-only before D1 |
| Client | `Intent_Queue`, `Reconciler`, `Receipt_Projection` | `paymentIntentQueue.ts`, `paymentReconciler.ts`, `paymentReceiptProjection.ts` | `dev-proven` | `undocumented` | Offline queue, replay, reconciliation, and minimized record contracts pass focused local checks |
| Shared | Payment and lifecycle SSOT owners | `stripePaymentSsot.ts`, `stripeMcpSsot.ts`, `straitsxPaymentSsot.ts`, `paymentBuyerProductSsot.ts`, `paymentRailSsot.ts`, `paymentRuntimeContract.ts`, `paymentRecordDocument.ts`, `agenticPurchaseRuntimeContract.ts`, `agenticPurchaseReadinessContract.ts` | `dev-proven` | `undocumented` | Separate version/credential/tool/signing owners, the exact server-owned buyer product, rail admission versus proof, terminal/refund projection, envelope/candidate, Avalanche chain `43114`, cancellation, cost, and data-minimization contracts pass; no provider capability is inferred |
| Worker | Existing payment trust boundary | `cloudflare/workers/agentic-graph-payment/index.ts`, `payments.ts`, `stripeHostedCheckout.ts`, `paymentRuntimeFailures.ts`, `paymentRuntimeRoutes.ts` | `dev-proven` | `undocumented` | The sole Worker delegates provider-neutral routes while hosted-checkout, typed-failure, read-only `agentic_purchase_readiness`, and denial-only public agent/refund ownership stay split into bounded modules |
| Worker | Router, SGD adapter, event ingress, persistence, cost observer, and host-only mutation boundaries | `paymentRuntimeService.ts`, `paymentRailAdapters.ts`, `paymentEventIngress.ts`, `paymentRuntimePersistence.ts`, `paymentRuntimeRoutes.ts` | `dev-proven` | `undocumented` | Source-bound contracts separate admission from proof and reject product, fund-flow, model-flow, signing, unauthenticated agent-create, and public refund failures before egress or D1 |
| Worker | Lifecycle replay, approval, authorization, and safe-close kernel | `agenticPurchaseSafetyPersistence.ts`, `agenticPurchaseReadiness.ts` | `dev-proven` | `undocumented` | In-memory SQLite tests apply the real migration and prove one lifecycle, restart-safe approval consumption, first authorization identity, exact replay, and risk-aware close under 100-way races; no provider adapter activated |
| Worker | Configuration owner | `cloudflare/workers/agentic-graph-payment/wrangler.toml` | `dev-proven` | `undocumented` | Secret-name and visible-variable checks pass; configured secrets and provider grants remain external |
| Store | Payment runtime ledgers | `cloudflare/d1/migrations/0009_agentic-graph_payment_runtime.sql` | `dev-proven` | `undocumented` | Additive intent, event, and cost schema passes focused local persistence checks |
| Store | Lifecycle, funding reservation, approval, opaque card, authorization, receipt, and disposal state | `cloudflare/d1/migrations/0010_agenticGraph_agentic_purchase_lifecycle.sql` | `dev-proven` | `undocumented` | Real migration is exercised by deterministic SQLite race/restart tests; no remote migration was run |
| Operator | Source-bound readiness and local VCC | `check-agentic-graph-payments-readiness.mjs`, `run-agentic-graph-payments-local-vcc.mjs`, `agentic-graph-agentic-purchase-readiness.mjs` | `dev-proven` | `undocumented` | Source and five-suite local gates pass; provider, browser, protected, mirror, and delivery gates remain separately blocked |
| Agent | Discovery, tools, and OS payment views | `mcp/payment-tool-contract.js`, `mcp/payment-runtime.js`, existing MCP server and `os-status-runtime.js` | `dev-proven` | `undocumented` | MCP contracts derive host-only approval correlation, keep `refunded` distinct, and expose typed read-only `agentic_purchase_readiness` with zero model/provider calls; hosted-provider proof remains external |
| Agent | Buyer-side lifecycle invocation metadata | canonical Agentic Canvas OS dictionaries and gateway catalog, future owner update | `spec-complete` | `undocumented` | R13-R17 schemas stated; exact invocation identities blocked by OQ-24 |
| Reference | Advisory local provider captures | `docs/documents/agentic-graph-api-reference/` | `spec-complete` | `undocumented` | Source bindings recorded below; current official sources remain normative |
| Reference | XSGD account, Card Program, Avalanche C-Chain, and allowed merchant | External official sources and one future sandbox merchant | `undocumented` | `undocumented` | Contracts only; no authenticated grant, transfer, card, authorization, merchant, or browser proof |

---

# PART III - AGENT-PLATFORM READINESS

All three readiness dimensions are in scope. No ambiguous "agent-ready" claim is made: each
dimension below names its surface, tier, spend boundary, and VCCs.

## Agentic OS: agentic-graph Payments

**Tool surface**: one read-only status view on the existing OS status surface owner, taking a
`view` argument (`rail_readiness`, `cost_summary`, `agentic_purchase_readiness`). A single tool with a view argument is chosen
over per-view tools to match the existing OS surface convention and to avoid introducing a new
tool family; see H0 for the harness contract.
**Tier**: Must.
**Token cost**: `$0.00`, zero model calls per view.
**Spend boundary**: strictly read-only. The view must not create, mutate, refund, or reconcile
a payment, and must not issue, verify, or consume an approval token.

| View | Aggregates over | Partial-failure behaviour |
|---|---|---|
| `rail_readiness` | Credential-name presence, environment match, Stripe request/webhook version pins, StraitsX model/grants, signing/callback health, Hello result, and authenticated sandbox settlement evidence | Names every unreachable or unverified source in `unavailableSources[]`; never treats Hello or documentation as runtime proof |
| `cost_summary` | Per-call provider cost log entries, model cost total (expected `0.00`), per-rail counts and outcomes | Reports a log gap explicitly rather than presenting a complete-looking ledger |
| `agentic_purchase_readiness` | Requirements/invocation ownership, Paywall migration, H2 bounds, XSGD account/network/address/credit tuple, card program/product/pool/3DS/RHA grants, credential broker, merchant fixture, browser proof, disposal safety, TTV, and provider-inclusive cost | Returns the deterministic-local phase snapshot, zero provider/model calls, and explicit missing checks. Provider, browser, protected, and deployed claims remain false and cannot be promoted by editable configuration or documentation. |

**VCCs**: R11-VCC6 (typed output, zero mutation, zero model calls), R11-VCC3 and R11-VCC5
(readiness content), R11-VCC1 (ledger completeness per recorded run), R13-R17 readiness
projection (zero-token read only).

## AI Agent Discovery: agentic-graph Payments

**Surface**: machine-readable payment capability metadata plus typed harness contracts,
segmented by trust boundary.
**Tier**: Must.
**Token cost**: `$0.00` on discovery; harness-dependent on execution and always logged.

| Surface | Consumer | Trust boundary | Callable | Approval required |
|---|---|---|---|---|
| Payment capability metadata | External agent, MCP host, browser agent | Public read | No | — |
| Rail, currency, and settlement-asset lists | External agent | Public read | No | — |
| Typed request and result schemas | External agent | Public read | No | — |
| Agentic lifecycle phase/readiness metadata | External agent | Public read | No | — |
| Purchase-envelope and candidate schemas | External agent | Public read | No | — |
| Intent create tool | External agent | Payment Trust Boundary | Yes | Yes |
| Status read tool (four-field projection) | External agent | Public projection | Yes | No |
| Refund tool | Operator-scoped agent | Payment Trust Boundary | Yes | Yes |

**Rules**: metadata discovery paths must not invoke a paid model; H2 may run only after a
trusted lifecycle starts and is not a public discovery read. Execution routes through the
existing `Approval_Gate`; the result shape is rail-neutral so an agent never branches on
rail. Increment 2 callable lifecycle tools remain unavailable until OQ-24 resolves their
canonical owners.
**VCCs**: R9-VCC1, R9-VCC2, R9-VCC5, R13-VCC1, R15-VCC2.

## Canonical Invocation Projection

This is a read-only projection, not a second Invocation Register. Agentic Canvas OS owns the
full-token identities and safety metadata in `DICTIONARY-COMMAND.md`,
`DICTIONARY-SEMANTIC.md`, `DICTIONARY-BINDING.md`, and `MCP-GATEWAY.md`. This document neither
aliases nor redeclares them.

| Kind | Canonical identities consumed here | Owner | Trust and token boundary |
|---|---|---|---|
| Commands | `/payment.rail.select`, `/payment.intent.create`, `/payment.event.settle`, `/payment.reconcile`, `/payment.receipt.project`, `/payment.refund`, `/payment.readiness` | Agentic Canvas OS command dictionary | Reads are zero-token; create/refund are approval-gated; readiness is read-only |
| Semantic tags | `#payment-rail-selection`, `#payment-idempotency`, `#payment-settlement-integrity`, `#offline-intent-queue`, `#payment-data-minimization`, `#payment-readiness` | Agentic Canvas OS semantic dictionary | Metadata only; zero token cost |
| Bindings | `@payment-rail`, `@payment-intent`, `@payment-provider`, `@payment-event`, `@payment-record`, `@payment-readiness` | Agentic Canvas OS binding dictionary | Binding metadata only; credentials remain behind `@payment-provider` |
| MCP tools | `agentic-graph.payment.rail.select`, `agentic-graph.payment.intent.create`, `agentic-graph.payment.status`, `agentic-graph.payment.event.settle`, `agentic-graph.payment.reconcile`, `agentic-graph.payment.receipt.project`, `agentic-graph.payment.refund`, `agentic-graph.payment.readiness` | Agentic Canvas OS MCP gateway | Status/readiness are read-only; intent/refund require approval; execution is zero-model-call |

Increment 2 declares no new canonical sigil or MCP identity here. The current canonical
Paywall invocation is the provider-specific settings toggle plus the open FloatingPanel Chat
mount; it is not a trusted-host lifecycle trigger. R13 proposes adding that trigger beneath
the same mount, but it remains unimplemented and non-callable. External agent invocation
remains `account_gated` until the Agentic Canvas OS dictionary and gateway owners accept exact
full-token identities under OQ-24. This prevents the PRD/TAD from manufacturing an orphan or
duplicate route.

## Gateway Federation: agentic-graph Payments

**Surfaces in federation**: 2.

| Surface | Role | Transport type | Spend routing |
|---|---|---|---|
| Existing agentic-graph MCP transports | Primary tool surface, control plane | Existing in-repo MCP transport | Orchestration and spend route through the existing `Approval_Gate` |
| Hosted card-rail MCP transport (`https://mcp.stripe.com`) | External provider tool surface | Remote MCP over HTTPS | Local policy marks every tool confirmation-required; state-changing and spend-bearing calls also pass Approval_Gate |

**Tier**: Must.
**Token cost**: `$0.00` on federation and discovery.
**No new proxy tier.** Resolution happens across existing transports. ADR-4 records the
comparison against the unified-proxy alternative.
**Known non-parity**: no MCP surface is documented for the SGD rail (OQ-3), so federation covers
one external transport and no parity claim is made.
**VCCs**: R9-VCC3, R9-VCC4, R9-VCC6.

## Execution Order

Must-tier visibility and discovery precede federation, federation precedes spend-safety proof,
and spend safety precedes any live orchestration.

1. `rail_readiness` and `cost_summary` read views (Agentic OS, Must).
2. Payment capability metadata and typed schemas (AI Agent discovery, Must).
3. Hosted transport registration with the local confirmation-required and reviewed-allowlist policy (Gateway federation,
   Must).
4. Approval-gated intent create and refund tools with a zero-cost rejection proof (spend
   safety, Must).
5. An authenticated sandbox callback plus provider read reaching rail-specific success in a
   recorded agent-driven run (local runtime proof, Must).
6. Surfacing the readiness and ledger views inside the MainPanel Commerce Payments subsection
   (Follow-on).

No Follow-on item starts before every Must-tier VCC above it passes. The Singapore
agentic-purchase lifecycle is a linked Increment 2 Follow-on and does not inherit readiness
from steps 1-6. Its evidence order is:

7. Requirements and ownership authority: the requirements owner accepts R13-R17; the existing
   Paywall, Worker, store, browser-control owner, and seller-side Agentic Commerce boundaries
   are confirmed; and OQ-24 either receives canonical invocation identities or remains
   non-callable outside Chat/Paywall.
8. Deterministic local contracts: lifecycle transitions, immutable purchase envelope,
   capability gates, idempotency, replay, secret canaries, cost counters, and failure fixtures
   pass with every financial/provider adapter replaced by a zero-egress fake.
9. Spend safety: durable approval TTL/restart/replay and atomic consumption, atomic
   authorization-identity claim/reservation, exact-duplicate prior decision,
   later-authorization denial, uncertain-outcome reconciliation, and `closure_pending`
   safe-close properties pass concurrency and timeout fixtures.
10. Provider admission: authenticated account reads establish the exact KYC, XSGD/Avalanche,
    Card Program, product, pool, funding-source, authorization, and secure-credential grants
    needed to close OQ-9 and OQ-17-OQ-21.
11. Provider sandbox: non-value or provider-approved test paths prove issuance, activation,
    controls, authorization, event reconciliation, and close behavior. Production-only
    XSGD deposit-address or value-transfer proof remains a separately authorized financial
    action.
12. Browser proof: one allowlisted deterministic merchant fixture passes bounded discovery,
    price revalidation, provider-hosted buyer authentication, credential isolation, mobile
    Paywall control, cancellation, and failure cases.
13. Golden path: one explicitly authorized provider-backed lifecycle links provider credit,
    one candidate, one card, one authorization, one merchant order, one minimized receipt,
    and safe disposal without a manual database correction.
14. UI enablement: only after steps 7-13 have recorded Evidence References may the existing
    provider-neutral Paywall capability advertise the lifecycle as available.

Each numbered Increment 2 step blocks the next. A source link, configured credential, chain
transaction, merchant order, or green test from only one boundary cannot skip an earlier
gate.

The current Dev candidate closes steps 7-9 only: requirements authority, deterministic local
contracts, and local spend-safety persistence are executable. Step 10 and every later
provider/browser/release step remain blocked and were not attempted.

## Readiness Gap Matrix

Local and delivered rungs are independently derived. The source-digest-bound Dev candidate
advances deterministic source/component work to `dev-proven`; it does not exercise a paid
provider sandbox, real browser, protected integration, mirror, or delivery surface, so every
external and delivered gate remains fail closed.

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criteria (VCC) |
|---|---|---|---|---|---|
| Card rail collection | `dev-proven` | `undocumented` | Local adapter, durable identity, indeterminate-outcome reconciliation, and state semantics pass focused checks; authenticated sandbox callback/provider-read and browser proof are absent | major | R3-VCC1 … R3-VCC5 |
| Rail selection | `dev-proven` | `undocumented` | Deterministic selection, persisted reason, and server-owned buyer product pass locally; paid-provider and browser execution remain unproven | blocker | R2-VCC1 … R2-VCC3 |
| SGD rail collection | `dev-proven` | `undocumented` | Stable-key adapter, fund-flow/model guards, exact paths, signing, and zero-egress failure contracts pass; approved model/product, credentials, callback, and authenticated settlement remain external | blocker | R4-VCC1, R4-VCC2, R4-VCC4, R4-VCC5 |
| Increment 1 XSGD acceptance (collection rail) | `spec-complete` | `undocumented` | The production-only account-deposit endpoint and Avalanche network source are documented, but applicability to this collection rail, authenticated account grant/response, returned address, provider credit, and settlement contract remain unproven (OQ-9); this is not Increment 2 card funding | major | R4-VCC3 |
| Event authenticity | `dev-proven` | `undocumented` | Exact-raw-body verification, source filtering, duplicate handling, provider reads, and terminal matching pass focused checks; real signed callbacks remain unproven | blocker | R5-VCC1 … R5-VCC6 |
| Offline continuity | `dev-proven` | `undocumented` | Unsent-only persistence, durable uniqueness, bounded reconciliation, and queue capacity pass locally; live reconnect/timing proof is absent | major | R6-VCC1 … R6-VCC5 |
| Local audit trail | `dev-proven` | `undocumented` | Serializer, parser, field guard, and round-trip properties pass; browser rendering and delivery proof are absent | major | R7-VCC1 … R7-VCC6 |
| Secret custody gating | `dev-proven` | `undocumented` | Separate-key ownership, bundle leakage, mode match, signing, and data-minimization checks pass; configured secrets and authenticated providers remain external | blocker | R1-VCC1 … R1-VCC3, R12-VCC5 |
| Agentic OS views | `dev-proven` | `undocumented` | `rail_readiness`, `cost_summary`, and `agentic_purchase_readiness` are typed, read-only, zero-model local contracts; hosted and delivered views remain unproven | major | R11-VCC1, R11-VCC6 |
| Agent discovery | `dev-proven` | `undocumented` | Metadata, rail-neutral schemas, approval rejection, and read views pass locally; external lifecycle invocation remains blocked by OQ-24 | major | R9-VCC1, R9-VCC5 |
| Gateway federation | `dev-proven` | `undocumented` | Auth modes, local confirmation policy, Approval_Gate rejection, and allowlist pass focused checks; no authenticated hosted session was run | major | R9-VCC3, R9-VCC4, R9-VCC6 |
| Existing-Paywall lifecycle projection | `dev-proven` | `undocumented` | One provider-neutral overlay, four mobile-safe phases, identity-bound direct import, malformed/spoof rejection, disabled financial action, and cancellation are component-proven; no live-browser pixels exist | blocker | R13-VCC1 … R13-VCC4 |
| XSGD/Avalanche lifecycle funding | `dev-proven` | `undocumented` | Exact chain/token/envelope and local reservation/release safety are executable, including no-return-transfer cancellation; authenticated account tuple, deposit address, provider credit, signer, and card-settlement bridge remain absent (OQ-9, OQ-18) | blocker | R14-VCC1 … R14-VCC4 |
| Bounded commerce discovery | `dev-proven` | `undocumented` | Immutable candidate, HTTPS-origin, injection/cancellation, five-page/twelve-action/two-model-call, and cost-log guards pass locally; browser owner, merchant fixture, and actual model/token evidence remain open (OQ-20, OQ-23) | blocker | R15-VCC1 … R15-VCC4 |
| Disposable virtual-card issuance | `dev-proven` | `undocumented` | Durable approval TTL/consume/replay, first authorization identity, exact duplicate handling, concurrency, secret canaries, and safe-close state pass local D1-backed tests; provider grants, issuance, effective controls, RHA, and PCI broker remain absent (OQ-17, OQ-19, OQ-21) | blocker | R16-VCC1 … R16-VCC6 |
| Checkout, authorization, reconciliation, and disposal | `dev-proven` | `undocumented` | Local candidate revalidation, cancellation, authorization identity, uncertainty, receipt, and risk-aware disposal contracts pass; no merchant, secure injection, provider latency, bridge, order, or golden path is recorded (OQ-18-OQ-21) | blocker | R17-VCC1 … R17-VCC5 |
| Increment 2 external invocation | `spec-complete` | `undocumented` | Internal direct-import trust is implemented, but no canonical command, semantic tag, binding, or MCP identity is accepted by Agentic Canvas OS (OQ-24) | blocker | R13-VCC3, R15-VCC2 |
| Payment-adjacent model use | `spec-complete` | `undocumented` | H1 is deliberately disabled while OQ-13 remains open | none | — |
| Live-mode operation | `spec-complete` | `undocumented` | Provider and release approval absent; live remains explicitly out of scope | none | — |
| Mirror and Delivery promotion | `spec-complete` | `undocumented` | Both Deploy Boundaries are closed; no Evidence Reference or operator instruction exists | none | R12-VCC6 and Deploy Boundary Register |

---

# PART IV - TRACEABILITY

## PRD ↔ TAD ↔ VCC

| PRD story | TAD component / interface | VCC set |
|---|---|---|
| `PS-1` (R1) | `TAD-Payment_API-SecretCustody`, `TAD-Readiness_Gate-Report` | R1-VCC1, R1-VCC2, R1-VCC3 |
| `PS-2` (R2) | `TAD-Rail_Router-Select` | R2-VCC1, R2-VCC2, R2-VCC3 |
| `PS-3` (R3) | `TAD-Stripe_Rail_Adapter-CheckoutCreate`, `TAD-Stripe_Rail_Adapter-StateRead` | R3-VCC1 … R3-VCC5 |
| `PS-4` (R4) | `TAD-StraitsX_Rail_Adapter-PaymentCreate`, `TAD-StraitsX_Rail_Adapter-CapabilityGate`, `TAD-StraitsX_Rail_Adapter-StateRead` | R4-VCC1 … R4-VCC5 |
| `PS-5` (R5) | `TAD-Provider_Event_Ingress-CardReceiver`, `TAD-Provider_Event_Ingress-SgdReceiver`, `TAD-Payment_Record_Store-EventLedger` | R5-VCC1 … R5-VCC6 |
| `PS-6` (R6) | `TAD-Intent_Queue-LocalStore`, `TAD-Reconciler-Submit` | R6-VCC1 … R6-VCC5 |
| `PS-7` (R7) | `TAD-Receipt_Projection-Serialize`, `TAD-Receipt_Projection-Parse`, `TAD-Payment_Record_Document` | R7-VCC1 … R7-VCC6 |
| `PS-8` (R8) | `TAD-Payment_Surface-Snapshot` | R8-VCC1, R8-VCC2, R8-VCC3 |
| `PS-9` (R9) | `TAD-Agent_Discovery_Surface-Metadata`, `TAD-Agent_Discovery_Surface-Tools`, `TAD-Approval_Gate-Authorize` | R9-VCC1 … R9-VCC6 |
| `PS-10` (R10) | `TAD-Payment_API-ErrorMap`, `TAD-Stripe_Rail_Adapter-Refund`, `TAD-StraitsX_Rail_Adapter-Refund` | R10-VCC1 … R10-VCC6 |
| `PS-11` (R11) | `TAD-Cost_Observer-Record`, `TAD-Readiness_Gate-Report`, `TAD-Agent_Discovery_Surface-H0` | R11-VCC1 … R11-VCC6 |
| `PS-12` (R12) | `TAD-Payment_API-PublicProjection`, `TAD-Receipt_Projection-FieldGuard`, `TAD-Payment_Record_Store-Schema` | R12-VCC1 … R12-VCC6 |
| `PS-13` (R13) | `TAD-Payment_Surface-LifecycleSnapshot`, `TAD-Purchase_Lifecycle_Coordinator-Transition` | R13-VCC1 … R13-VCC4 |
| `PS-14` (R14) | `TAD-Funding_Adapter-CapabilityRead`, `TAD-Funding_Adapter-CreditReconcile` | R14-VCC1 … R14-VCC4 |
| `PS-15` (R15) | `TAD-Commerce_Discovery_Harness-H2`, `TAD-Commerce_Discovery_Harness-CandidateValidate` | R15-VCC1 … R15-VCC4 |
| `PS-16` (R16) | `TAD-Approval_Gate-Consume`, `TAD-Card_Issuer_Adapter-Create`, `TAD-Secure_Card_Broker-Prepare`, `TAD-Card_Authorization_Ingress-Claim`, `TAD-Card_Issuer_Adapter-Close` | R16-VCC1 … R16-VCC6 |
| `PS-17` (R17) | `TAD-Card_Authorization_Ingress-Authorize`, `TAD-Purchase_Lifecycle_Coordinator-Reconcile`, `TAD-Receipt_Projection-Serialize` | R17-VCC1 … R17-VCC5 |

## Requirement → Flow coverage

| Requirement | Journey | Workflow | Data flow | Harness flow | Topology nodes |
|---|---|---|---|---|---|
| R1 | JO | W6 | DF7 | — | Payment_API, Readiness_Gate, providers |
| R2 | JB, JA | W1 | DF1 | — | Rail_Router, Payment_Record_Store |
| R3 | JB | W1, W2 | DF2, DF3 | — | Stripe_Rail_Adapter, Stripe API, Payment_Record_Store |
| R4 | JB | W1, W2 | DF2, DF3 | — | StraitsX_Rail_Adapter, StraitsX API sandbox, Payment_Record_Store |
| R5 | JB, JA | W2 | DF3 | — | Provider_Event_Ingress, Payment_Record_Store, both providers |
| R6 | JB | W3 | DF4 | — | Payment_Surface, Intent_Queue, Reconciler |
| R7 | JB, JA | W4 | DF5 | H1 (disabled) | Receipt_Projection, Payment_Record_Document |
| R8 | JB | W1, W3 | DF1, DF5 | — | Payment_Surface |
| R9 | JA | W5, W1 | DF6, DF1 | H0 | Agent_Discovery_Surface, Approval_Gate, Payment_API, Hosted Stripe MCP |
| R10 | JB, JO | W7 | DF3, DF5 | — | Payment_API, both rail adapters |
| R11 | JO | W6 | DF7 | H0, H1 | Cost_Observer, Readiness_Gate, Payment_Record_Store |
| R12 | JO | W1, W6 | DF1, DF5 | — | Payment_API, Payment_Record_Store, Payment_Surface |
| R13 | JX | W8 | DF8 | — | Payment_Surface, Purchase_Lifecycle_Coordinator, Approval_Gate |
| R14 | JX | W9 | DF9 | — | Funding_Adapter, XSGD account API, Avalanche C-Chain, Provider_Event_Ingress |
| R15 | JX | W10 | DF10 | H2 | Commerce_Discovery_Harness, allowed merchant, Cost_Observer |
| R16 | JX | W11 | DF11 | — | Approval_Gate, Card_Issuer_Adapter, Secure_Card_Broker, Card Program API |
| R17 | JX | W12 | DF12 | — | Secure_Card_Broker, Card_Authorization_Ingress, Purchase_Lifecycle_Coordinator, allowed merchant |

Every requirement traces to at least one journey, one workflow, and one data flow. No
requirement is orphaned and no flow exists without a requirement.

## Reference source bindings

The original four requested source roots and the current Increment 2 official sources are
bound below. Local captures are advisory snapshots, not normative mirrors; this revision was
checked against the current official pages on 2026-07-29 and does not silently inherit stale
local claims.

| Official source | Advisory local capture | Requirements grounded | 2026-07-29 disposition |
|---|---|---|---|
| [Stripe API](https://docs.stripe.com/api) | `docs/documents/agentic-graph-api-reference/agentic-graph-stripe-api-reference.md` | R1, R3, R10, R12 | Normative root; supplemented by exact official pages for v1 idempotency, errors, webhooks, keys, versions, and object states |
| [Stripe MCP](https://docs.stripe.com/mcp) | `docs/documents/agentic-graph-api-reference/agentic-graph-stripe-mcp-reference.md` | R9, ADR-4 | Normative current inventory/auth source; whole-server Public Preview and two stale resource-tool claims removed |
| [StraitsX introduction](https://docs.straitsx.com/docs/introduction) | `docs/documents/agentic-graph-api-reference/agentic-graph-straitsx-api-reference.md` | R4, R12, ADR-2 | Normative model/product root; Customer Profiles prerequisite and account-grant boundary retained |
| [StraitsX Say Hello](https://docs.straitsx.com/reference/say-hello) | `docs/documents/agentic-graph-api-reference/agentic-graph-straitsx-authentication-reference.md` | R1, R4, R11 | Normative connection probe; HTTP `200` is connectivity/authentication evidence only |
| [StraitsX Agentic Playground brief](https://luma.com/0x4uwpyh) | — | R13-R17 | Problem-source only: Funding, Discovery, Issuance, Execution, and XSGD on Avalanche; it is not an API or runtime-evidence contract |
| [StraitsX Card Program introduction](https://docs.straitsx.com/v1-CARDS/docs/introduction) and [getting started](https://docs.straitsx.com/v1-CARDS/docs/getting-started) | — | R16, R17 | Establishes a separately provisioned Card Program with issuer-group, plan, product, authorization, and card-pool dependencies; no availability is inferred |
| [Instant card issuance](https://docs.straitsx.com/v1-CARDS/docs/instant-card-issuance) and [Create Card](https://docs.straitsx.com/v1-CARDS/reference/create-card) | — | R16 | Grounds virtual-card creation and activation dependencies; does not establish native disposable semantics or this account's product grant |
| [Card Management System](https://docs.straitsx.com/v1-CARDS/docs/card-management-system-cms) | — | R16, R17 | Grounds the documented CMS sandbox and production hosts only; a dashboard login is not API/grant/readiness proof |
| [Remote Host Authorization](https://docs.straitsx.com/v1-CARDS/reference/remote-host-authorization) and [RHA FAQ](https://docs.straitsx.com/v1-CARDS/docs/faqs-rha) | — | R16, R17, ADR-8 | Grounds the synchronous authorization deadline and auto-decline/no-retry behavior; the one-use reservation and safe-close policy remain repository-owned and provider-review gated |
| [Create deposit address](https://docs.straitsx.com/reference/create-deposit-address) and [supported blockchains](https://docs.straitsx.com/reference/get-a-list-of-supported-blockchains) | — | R14 | Grounds a production-only account-scoped `token` plus `blockchain` capability including Avalanche; it does not prove this account's tuple, card bridge, or a completed credit |
| [Avalanche C-Chain integration](https://build.avax.network/docs/primary-network/exchange-integration) | — | R14 | Grounds C-Chain transaction mechanics and mainnet chain ID `43114`; chain inclusion alone is never provider-credit authority |
| [AvalancheGo](https://github.com/ava-labs/avalanchego) | — | R14, ADR-7 | FOSS node/reference implementation option; the min-viable path keeps RPC configurable and adds no required node infrastructure |
| [StraitsX XSGD token addresses](https://support.straitsx.com/support/solutions/articles/157000365664-how-do-i-add-the-xsgd-token-to-my-eth-polygon-avalanche-arbitrum-zilliqa-xrp-ledger-or-hedera-w) | — | R14 | Grounds the current published Avalanche XSGD token address; runtime must still match it to the authenticated provider-supported tuple and must never treat it as a deposit address |

Supplemental official contracts used for exact mechanics are
[Stripe idempotency](https://docs.stripe.com/api/idempotent_requests),
[Stripe advanced errors](https://docs.stripe.com/error-low-level),
[Stripe webhooks](https://docs.stripe.com/webhooks),
[Stripe versioning](https://docs.stripe.com/api/versioning),
[StraitsX signing](https://docs.straitsx.com/docs/http-request-signing),
[StraitsX environments](https://docs.straitsx.com/docs/sandbox-production-environments),
[StraitsX idempotency](https://docs.straitsx.com/docs/idempotent-requests),
[StraitsX transaction safety](https://docs.straitsx.com/docs/transaction-safety),
[StraitsX status](https://docs.straitsx.com/docs/transaction-status),
[StraitsX callback security](https://docs.straitsx.com/docs/securing-your-callback), and
[StraitsX errors](https://docs.straitsx.com/docs/errors). Stripe Issuing
[global availability](https://docs.stripe.com/issuing/global) and
[lifecycle controls](https://docs.stripe.com/issuing/controls/lifecycle-controls) are
comparison sources only: they do not make Stripe Issuing a Singapore reference rail.

No inspected source proves one native path from an arbitrary XSGD Avalanche deposit through
StraitsX provider credit into Card Program settlement. The topology therefore keeps chain
receipt, provider credit, card-funding authority, and merchant settlement as separate gates;
OQ-18 remains a blocker.

---

# PART V - VALIDATION STATUS

## Pre-Implementation

- [x] User journeys mapped before stories; every story anchored to a journey stage
- [x] Workflows defined with trigger, happy path, alternate paths, error paths, postconditions (W1–W12)
- [x] Data flows typed at every stage boundary with persistence and error handling (DF1–DF12)
- [x] User stories in "As a… I want… So that" form (PS-1 … PS-17)
- [x] Acceptance criteria in Given-When-Then with observable outcomes and VCC translations
- [x] Every criterion expressible as a VCC; VCC identities recorded per component
- [x] MoSCoW with ROI score and rationale per feature
- [x] Min-viable scope stated before implementation
- [x] Token budget stated for every harness (H0: 0 + 0; H1: ceiling required before enablement; H2: at most 12,000 prompt plus 2,000 completion tokens over two calls)
- [ ] Provider-inclusive monthly TCO — fixed infrastructure is estimated and FOSS-first ADRs are present; Increment 1 schedules remain open under OQ-1 and Increment 2 card/PCI/blockchain/dispute/model schedules under OQ-22
- [x] Deployment-model variants separated in every TCO table with ops burden per variant
- [x] ROI computed for every Must and Should feature
- [x] TTV estimated with steps and elapsed time; named rows present in success metrics
- [x] Harness flows document dispatcher, executor, observer, and consumer roles with cost log fields and fallback paths
- [x] Loop bounds and circuit-breaker conditions stated (H0 max 1; H1 max 1 retry; H2 max five pages, twelve browser actions, and two model calls)
- [x] Topology version 3 documented with labelled connection types, data residency per store, Mermaid `flowchart TB` with subgraphs per boundary, and a version-2 delta
- [x] Components carry a single responsibility; interfaces specified with explicit contracts
- [x] Harness contracts carry typed input, typed output, cost log fields, and a fallback
- [x] ADRs include a TCO comparison and at least one FOSS alternative
- [x] Diagrams are Mermaid; component inventory tables accompany them
- [x] PRD ↔ TAD ↔ VCC traceability established
- [x] Part I states user outcomes, acceptance outcomes, dependency risks, and open questions; provider protocol mechanics are centralized in the TAD reference-implementation contracts
- [x] Agent-platform readiness documented across all three dimensions with tiers and execution order
- [x] Gateway federation ADR compares discovery-first against a unified-proxy alternative
- [x] Increment 2 enhances the existing Paywall/Worker/store ownership chain and specifies no parallel UI, controller, payment Worker, credential store, or seller-side Agentic Commerce processor
- [x] Increment 2 financial, provider, browser, protected-integration, mirror, and delivery states remain fail-closed and independently evidenced
- [x] R13-R17 accepted into the requirements authority — version 0.4.0 is source-aligned with this projection
- [ ] Increment 2 canonical invocation identities accepted by Agentic Canvas OS — **pending** under OQ-24; the Dev candidate exposes only an internal identity-bound direct import and no external `/`, `#`, `@`, or MCP lifecycle identity
- [ ] TTV walked through on a clean environment — **pending**, blocked on sandbox credential provisioning and measured card-program onboarding (OQ-25)

## Post-Documentation Review

- [ ] Operator validates that Part I addresses the real user problems — pending review
- [x] Implementation confirms Part II gives sufficient guidance — deterministic Dev candidate implemented against W8-W12/DF8-DF12 safety boundaries
- [x] Acceptance criteria confirmed objectively testable — the fixed local VCC executes 111 tests; provider, browser, protected, mirror, and delivery criteria remain independent external gates
- [x] Success metrics defined with baseline, target, and timeline
- [x] Quality attributes specified with measurable scenarios; token cost and TCO attributes present
- [x] Open questions resolved or formally tracked — **tracked** as OQ-1 … OQ-25; resolved questions remain marked in place and unresolved provider/browser/invocation questions fail closed
- [ ] TTV validated on a clean environment — pending
- [x] Topology nodes all map to component specifications; no orphaned nodes; version note present
- [ ] Token budget actuals vs estimates — no actuals yet; review separately after the first Increment 1 run and after the first H2/Increment 2 golden-path run
- [x] FOSS alternatives evaluated per ADR against the 12-month threshold
- [x] Agent-platform execution order recorded; no Follow-on item precedes a Must-tier VCC, and Increment 2 has a separate authority-to-enablement evidence order
- [x] Readiness gap matrix present; local and delivered rungs are separate and use only the Readiness Ladder vocabulary

## Evidence Reference Register

The repository-owned evaluator is mechanically separate from the runtime contracts it checks.
It fixes the suite inventory, builds the client, rejects zero-test or failed suites, and binds
its attestation to the inspected source-evidence digest. Official source links remain contract
references rather than runtime Evidence References. Provider, browser, protected-integration,
mirror, and delivery results are not substituted by this local evidence.

| VCC set | Named invocable check | Recorded result | Surface | Derived rung |
|---|---|---|---|---|
| R1-R17 deterministic aggregate | `npm run payment:local:vcc -- --json` | Exit 0; 5/5 fixed suites and 111/111 tests passed; source evidence and inventory digests are bound in the emitted attestation | Authoring | `dev-proven` |
| Shared payment and purchase contracts | Fixed `shared-payment-contracts` suite | 23/23 passed, including exact envelope/candidate, phase, cancellation, injection/bounds/cost, Avalanche tuple, and secret-canary cases | Authoring | `dev-proven` |
| Worker persistence, adapters, ingress, and host boundaries | Fixed `worker-payment-runtime` suite | 45/45 passed, including the real `0010` migration, 100-way lifecycle/approval/authorization races, restart, replay, zero-D1 unauth rejection, no-return-transfer release, and risk-aware close | Authoring | `dev-proven` |
| Browser-owned source/component contracts | `npm --prefix canvas run test:ci:unit -- ui.payments.runtime` | 14/14 passed; the broader Canvas payment selector passed 27/27 and TypeScript passed; this is source/component evidence, never live-browser proof | Authoring | `dev-proven` |
| Agent and MCP contracts | Fixed `mcp-payment-contracts` suite | 25/25 passed; `agentic_purchase_readiness` is typed, read-only, zero-provider, and zero-model | Authoring | `dev-proven` |
| Evaluator independence and tamper rejection | Fixed `local-vcc-evaluator-contract` suite | 4/4 passed | Authoring | `dev-proven` |
| Layered readiness | `npm run payment:runtime:readiness -- --json` | Expected exit 1 overall with `localDevelopmentReady: true`: source and local VCC gates pass while paid-provider and Increment 2 external capability gates remain blocked | Authoring plus external gates | `dev-proven` locally; `undocumented` delivered |
| Increment 2 provider admission and sandbox | Authenticated account/Card Program capability reads plus provider-approved issuance, authorization, event, and close run | Not run; OQ-9 and OQ-17-OQ-21 remain open | Provider | `undocumented` |
| Increment 2 browser and golden path | Mobile existing-Paywall fixture plus explicitly authorized provider-backed Funding → Discovery → Issuance → Execution run | Not run; OQ-20/OQ-23, provider authority, and financial authorization remain open | Browser / Provider | `undocumented` |
| Protected integration, mirror, and delivery | Exact-head protected check, mirror parity, and public delivery-surface checks | Not run; both Deploy Boundaries remain closed and no release was authorized | Protected / Mirror / Delivery | `undocumented` |

