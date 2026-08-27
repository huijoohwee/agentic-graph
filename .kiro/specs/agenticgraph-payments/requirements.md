---
title: "AgenticGraph Payments - Requirements"
doc_type: "Requirements"
id: "agenticgraph-payments-requirements"
spec: "agenticgraph-payments"
version: "0.4.0"
status: "runtime-readiness-implemented-blocked"
created: "2026-07-28"
updated: "2026-07-29"
author: "airvio / joohwee"
domain: "agenticgraph"
lang: "en-US"
frontmatter_contract: "required"
companion_document: "docs/documents/agenticgraph-payments-prd-tad.md"
companion_document_state: "populated"
runtime_readiness_command: "npm run payment:runtime:readiness"
local_vcc_command: "npm run payment:local:vcc"
runtime_readiness_manifest: "scripts/agenticgraph-payments-readiness-properties.json"
runtime_readiness_status: "R1-R17 accepted; deterministic local contracts are executable and fail closed, while XSGD account, card-program, secure-broker, merchant/browser, protected integration, mirror, and deployment remain separate blocked gates"
guidelines: "huijoohwee.github.io/guidelines/prd-tad-adr-guidelines.md"
deployment_topology: "Dev authoring only; Prod mirror and Cloudflare deployment require separate explicit authority"
rails:
  - id: "stripe"
    role: "card and global consumer payments"
    reference: "https://docs.stripe.com/api"
  - id: "straitsx"
    role: "SGD fiat rails and XSGD stablecoin for Southeast Asia"
    reference: "https://docs.straitsx.com/docs/introduction"
agent_platform_readiness:
  agentic_os_ready: "in scope - read-only payment readiness and cost views"
  ai_agent_ready: "in scope - zero-token discovery of payment capability"
  mcp_gateway_ready: "in scope - federate the existing hosted Stripe MCP transport; no new proxy tier"
constraints:
  - "browser-first"
  - "local-first"
  - "offline-first"
  - "mobile-first"
  - "foss-first"
  - "tco-zero"
  - "token-economical"
  - "harness-first"
  - "zero-egress-default"
  - "no-client-side-payment-secret"
tags:
  - "payments"
  - "stripe"
  - "straitsx"
  - "xsgd"
  - "paynow"
  - "idempotency"
  - "webhooks"
  - "offline-first"
  - "mcp"
related:
  - "docs/documents/agenticgraph-agentic-commerce-prd-tad.md"
  - "docs/documents/agenticgraph-mainpanel-commerce-prd-tad.md"
  - "docs/documents/agenticgraph-api-reference/agenticgraph-stripe-api-reference.md"
  - "grph-shared/src/payments/stripePaymentSsot.ts"
  - "grph-shared/src/payments/stripeMcpSsot.ts"
  - "grph-shared/src/payments/paymentBuyerProductSsot.ts"
  - "grph-shared/src/payments/agenticCommerceSsot.ts"
  - "cloudflare/workers/agenticgraph-payment"
---

# Requirements Document

## Introduction

AgenticGraph needs one payments capability with two payment rails: Stripe for card and
global consumer payments, and StraitsX for SGD fiat rails and XSGD stablecoin
settlement in Southeast Asia. The capability must work from a browser-first,
local-first, offline-first, mobile-first client that is structurally unable to hold a
payment secret, so the server-side trust boundary, replay-safe idempotency, and
provider event verification are first-class requirements rather than implementation
details.

This increment consolidates and extends existing repository owners. Stripe hosted
Checkout, Agentic Commerce Protocol checkout sessions, x402 probes, Solana Pay
settlement, D1 webhook processing state, and the MainPanel Commerce surface are
already accepted and implemented under
`docs/documents/agenticgraph-agentic-commerce-prd-tad.md` and
`docs/documents/agenticgraph-mainpanel-commerce-prd-tad.md`. The genuinely new surface
area in this spec is: an explicit rail-selection contract, the StraitsX rail, an
offline intent queue with reconnect reconciliation, a serialized payment record and
receipt projection with a round-trip guarantee, and a stated agent-platform
readiness posture for payment tools. This increment exposes exactly one implicit
server-owned buyer product. A multi-product catalog, entitlement catalog, and
caller-selected price authority are out of scope.

The accepted follow-on scope adds the Singapore agentic-purchase lifecycle to the
single existing Paywall: Funding with XSGD on Avalanche C-Chain, bounded e-commerce
Discovery, approval-bound disposable-card Issuance, and secure checkout Execution.
The local runtime must expose typed, replay-safe, zero-egress behavior while any
provider grant or browser owner is missing. Provider documentation is a contract
reference, never proof that an account, card program, secure broker, merchant, or
payment run is ready.

Provider behavior in the acceptance criteria is grounded in the published provider
documentation cited inline. Where a provider detail could not be confirmed from the
documentation, it is recorded under Open Questions rather than assumed.

### Authority and Scope

This file is the normative requirements source of truth for AgenticGraph Payments. The populated companion PRD/TAD at `docs/documents/agenticgraph-payments-prd-tad.md` carries architecture, topology, ADRs, harness contracts, the implementation gap matrix, and delivery order. No separate `design.md` or `tasks.md` is authoritative for this increment; `payment:runtime:readiness` maps each requirement to repository evidence and reports incomplete owners without relabelling them ready.

This increment carries development authority only; production mirror publication and Cloudflare deployment require a separate explicit instruction.

The local VCC evaluator is a repository-owned executable that runs focused checks and
binds their results to the current source-evidence digest. Editable manifest claims and
caller-authored JSON are not local VCC evidence. The optional `--provider-proof` input
remains unsigned candidate evidence: schema and source-digest validation SHALL NOT be
described as authentication or make either provider rail ready. Provider sandbox,
browser, protected integration, mirror, and deployment evidence remain independently
fail-closed.

### Compounding Lens Commitments

| Lens | Product rule for payments | Requirement anchors |
|---|---|---|
| Min-viable-max-value | One rail-selection contract, two rails, one ledger record. No storefront, no subscriptions, no marketplace split in this increment. | R2, R3, R4, R7 |
| TCO-zero | Payment routing runs on the existing Cloudflare Worker and D1 free-tier bindings; no new persistent store, no new proxy tier, no metered egress by default. Provider transaction fees are variable cost of revenue, not fixed TCO. | R1, R9, R11 |
| Token economics | The payment path performs zero model calls. Any model use stays outside settlement and carries a cost log. | R11 |
| Harness-first | Every provider call is a typed request with a typed result and a cost log; agent-initiated spend routes through an approval gate. | R9, R11 |

---

## Glossary

- **Payment_Trust_Boundary**: The server-side context that holds provider credentials and alone may call provider APIs, realized by the existing `agenticgraph-payment` Cloudflare Worker.
- **Payment_Client**: The browser-first, local-first AgenticGraph canvas surface; holds no payment credential.
- **Rail**: One provider-backed settlement path; this increment defines exactly `stripe` and `straitsx`.
- **Rail_Router**: The Payment_Trust_Boundary component that selects exactly one Rail per payment intent from stated inputs.
- **Stripe_Rail**: Card and global consumer settlement through the [Stripe API](https://docs.stripe.com/api).
- **StraitsX_Rail**: SGD fiat and XSGD stablecoin settlement through the [StraitsX API](https://docs.straitsx.com/docs/introduction).
- **Payment_Intent_Record**: The AgenticGraph-owned requested-payment record containing local identity, minor-unit amount, currency, selected Rail, intent state, and Client_Intent_Key; distinct from any provider object.
- **Client_Intent_Key**: A client-generated UUID identifying one buyer purchase attempt across retries, reconnects, and rail changes.
- **Provider_Idempotency_Key**: The provider key preventing a retried create request from creating a second provider object.
- **Intent_Queue**: The Payment_Client-owned durable queue of Payment_Intent_Records created without a network path to the Payment_Trust_Boundary.
- **Reconciler**: Resolves each queued or in-flight Payment_Intent_Record to Provider_Terminal_State by reading provider state, or stops locally at Reconciliation_Stopped_State after the bounded attempt limit.
- **Event_Ingestor**: Receives, authenticates, deduplicates, and applies provider event callbacks.
- **Provider_Event**: One provider callback: a Stripe webhook event or StraitsX callback.
- **Payment_Record_Document**: The serialized, human-readable projection of terminal payment records for local inspection and receipts.
- **Record_Serializer**: The component that writes a Payment_Record_Document.
- **Record_Parser**: Reads a Payment_Record_Document back into Payment_Intent_Records.
- **Payment_Surface**: The buyer-facing AgenticGraph surface that starts a payment and displays payment state.
- **Agent_Payment_Surface**: The machine-readable discovery and tool surface through which an external agent learns about and initiates payment.
- **Approval_Gate**: The existing external-tool approval owner authorizing a spend-bearing or money-moving tool call before execution.
- **Buyer_Product_Authority**: The single server-owned product tuple
  `{amountMinor, currency, settlementAsset}` configured through
  `PAYMENT_BUYER_PRODUCT_AMOUNT_MINOR`, `PAYMENT_BUYER_PRODUCT_CURRENCY`, and
  `PAYMENT_BUYER_PRODUCT_SETTLEMENT_ASSET`. Caller values are assertions against
  this tuple, never price authority.
- **Sandbox_Admission_Status**: `admissionRails`; whether a rail has the complete
  sandbox configuration required to attempt the first sandbox payment. It excludes
  paid-settlement evidence and is never a readiness claim.
- **Proof_Complete_Rail_Status**: `rails`; whether authenticated paid sandbox
  settlement, provider-read state, and record round-trip evidence all exist.
- **Readiness_Gate**: The command-invoked, read-only check that reports both
  Sandbox_Admission_Status and Proof_Complete_Rail_Status without conflating them.
- **Cost_Observer**: Records a per-call cost log entry for provider and model calls.
- **Sandbox_Mode**: Provider test environments: [Stripe sandboxes](https://docs.stripe.com/api) and StraitsX at `https://api-sandbox.straitsx.com/v1` ([Say Hello](https://docs.straitsx.com/reference/say-hello)).
- **Provider_Terminal_State**: `paid`, `refunded`, `no_payment_required`, `failed`,
  `expired`, or `cancelled`, established from provider-read state. `refunded` is not
  financial success and never projects as `paid`.
- **Reconciliation_Stopped_State**: `reconciliation_unresolved`, a local bounded stopped state that is not a provider terminal outcome or evidence of payment.
- **Terminal_State**: The record-document union of Provider_Terminal_State and Reconciliation_Stopped_State.

---

## User Journeys

Every user story below is anchored to one stage in one of these three journeys.

### Journey JB: Buyer_SG - complete a purchase with an unreliable connection

| Stage | Action | Touchpoint | Pain point | Opportunity |
|---|---|---|---|---|
| JB-Trigger | Buyer decides to unlock a paid AgenticGraph capability | Payment_Surface | Unclear which currency and method apply | Rail chosen from locale and currency without asking |
| JB-Discover | Buyer sees price in SGD and the available method | Payment_Surface | Card-only checkout excludes PayNow users | StraitsX_Rail offers PayNow and XSGD |
| JB-Engage | Buyer confirms while the connection is intermittent | Payment_Surface plus Intent_Queue | Tap is lost; buyer taps again and fears double charge | Client_Intent_Key makes retry safe |
| JB-Complete | Payment confirms and the capability unlocks | Payment_Surface | Silent pending state with no explanation | Explicit pending, paid, and failed states with next action |
| JB-Return | Buyer reopens later and sees a receipt | Payment_Record_Document | Receipt only exists in provider dashboard | Local receipt projection readable offline |

### Journey JA: Buying_Agent - purchase on behalf of a buyer

| Stage | Action | Touchpoint | Pain point | Opportunity |
|---|---|---|---|---|
| JA-Trigger | Agent receives purchase intent | Agent host | No structured payment target | Discoverable payment capability |
| JA-Discover | Agent reads discovery metadata at zero token cost | Agent_Payment_Surface | HTML scraping | Machine-readable capability document |
| JA-Engage | Agent requests a payment intent | Agent_Payment_Surface | Unbounded agent spend | Approval_Gate authorizes before money moves |
| JA-Complete | Payment settles and the agent receives a typed result | Agent_Payment_Surface | Result shape varies per rail | One rail-neutral result schema |
| JA-Return | Agent reads the proof of settlement | Payment_Record_Document | No audit trail | Record with provider reference and cost log |

### Journey JO: Solo_Operator - enable a rail from zero state

| Stage | Action | Touchpoint | Pain point | Opportunity |
|---|---|---|---|---|
| JO-Trigger | Operator decides to accept payment on a new rail | MainPanel Commerce | Unknown prerequisites | Readiness_Gate names every missing input |
| JO-Discover | Operator reads which credentials the rail needs | Readiness_Gate output | Secrets leak into visible config | Gate fails when a secret name appears in visible vars |
| JO-Engage | Operator configures sandbox credentials | Worker secret store | Manual, undocumented steps | One command per rail |
| JO-Complete | Operator observes a confirmed sandbox payment | Payment_Surface plus Readiness_Gate | No end-to-end proof | Authenticated sandbox payment reaches `paid` from provider-read state |
| JO-Return | Operator re-runs the gate after a change | Readiness_Gate output | Silent drift | Gate reports per-rail status without mutating state |

---

## Time-to-Value

| Dimension | Estimate | Target ceiling | Validation method |
|---|---|---|---|
| TTV steps (Solo_Operator, zero state to first confirmed sandbox payment) | 8 steps | <= 10 steps | Walk-through on a clean checkout with sandbox credentials |
| TTV elapsed (Solo_Operator) | ~30 min | <= 45 min | Timed first-run on a clean checkout |
| TTV steps (Buyer_SG, price shown to paid) | 3 steps | <= 4 steps | Timed sandbox purchase on a 375 px viewport |
| TTV elapsed (Buyer_SG) | ~45 s | <= 90 s | Timed sandbox purchase |
| TTV steps (Buying_Agent, discovery to typed result) | 3 calls | <= 4 calls | Scripted agent run against sandbox |
| First-value action | An authenticated sandbox payment reaches `paid` from provider-read state and the Payment_Surface reflects it | - | Observable state transition plus Payment_Record_Document entry |
| Persona | Solo_Operator, Buyer_SG, Buying_Agent | - | Defined in User Journeys |

Operator TTV excludes provider account approval time, which is outside AgenticGraph
control. StraitsX access depends on an approved use case and integration model
([StraitsX API guides](https://docs.straitsx.com/docs/introduction)); that wait is
tracked as an Open Question, not as TTV.

---

## Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---|---|---|
| Rails with current source-bound authenticated paid sandbox proof | 0; an earlier Stripe implementation exists, but no proof is bound to this readiness evidence | 2 (Stripe plus StraitsX) | Increment 1 |
| Duplicate provider objects created per replayed intent | not measured | 0 | Increment 1 |
| Queued offline intents resolved to a Terminal_State after reconnect | 0% (no queue exists) | 100% within 60 s of reconnect | Increment 1 |
| Provider events applied more than once | not measured | 0 | Increment 1 |
| Unauthenticated Provider_Events accepted | not measured | 0 | Increment 1 |
| Payment secrets reachable from the Payment_Client bundle | 0 (asserted, not gated) | 0 (gated by a check) | Increment 1 |
| Payment_Record_Document round-trip fidelity | not measured | byte-identical re-serialization for every valid document | Increment 1 |
| Token cost / month on the payment path | not measured | $0.00 (zero model calls in intent creation, settlement, reconciliation) | Continuous |
| Monthly TCO (fixed infrastructure) | $0.00 (existing Worker plus D1 free tier) | $0.00 | Continuous |
| Time-to-Value (Solo_Operator) | not measured | <= 45 min, <= 10 steps | Increment 1 |
| Time-to-Value (Buyer_SG) | not measured | <= 90 s, <= 4 steps | Increment 1 |
| ROI score (capability aggregate) | - | >= 8 | Increment 1 |

Provider transaction fees (Stripe processing fees, StraitsX transaction and network
fees) are variable cost of revenue and are excluded from monthly TCO. StraitsX
commercial pricing is not published in the referenced documentation and is recorded
under Open Questions.

---

## MoSCoW Priority

ROI uses the guideline formula
`ROI = (User Impact x Reach) / (Build Hours + Monthly TCO + Token Cost per Month)`,
with Reach expressed in payments per month at launch and Impact on a 1-5 scale.

| Tier | Feature | Requirement | Impact x Reach | Build hours | Monthly TCO | Token cost / month | ROI score |
|---|---|---|---|---|---|---|---|
| Must | Server-side trust boundary and secret custody gate | R1 | 5 x 40 = 200 | 4 | $0.00 | $0.00 | 50.0 |
| Must | Rail selection contract | R2 | 4 x 40 = 160 | 3 | $0.00 | $0.00 | 53.3 |
| Must | Stripe rail intent creation with idempotency | R3 | 4 x 30 = 120 | 5 | $0.00 | $0.00 | 24.0 |
| Must | StraitsX rail: SGD fiat collection | R4 | 5 x 25 = 125 | 10 | $0.00 | $0.00 | 12.5 |
| Must | Provider event authentication and replay-safe settlement | R5 | 5 x 40 = 200 | 6 | $0.00 | $0.00 | 33.3 |
| Must | Offline intent queue and reconnect reconciliation | R6 | 4 x 20 = 80 | 8 | $0.00 | $0.00 | 10.0 |
| Must | Payment record serialization with round-trip guarantee | R7 | 3 x 40 = 120 | 4 | $0.00 | $0.00 | 30.0 |
| Must | Typed failure handling and refunds | R10 | 4 x 15 = 60 | 5 | $0.00 | $0.00 | 12.0 |
| Must | Per-rail readiness gates | R11 | 4 x 20 = 80 | 4 | $0.00 | $0.00 | 20.0 |
| Must | Data minimization and release boundary | R12 | 5 x 40 = 200 | 2 | $0.00 | $0.00 | 100.0 |
| Should | Mobile-first buyer payment surface states | R8 | 3 x 40 = 120 | 5 | $0.00 | $0.00 | 24.0 |
| Should | Agent payment discovery plus approval-gated tool surface | R9 | 4 x 10 = 40 | 6 | $0.00 | $0.00 | 6.7 |
| Should | StraitsX rail: XSGD stablecoin acceptance | R4 | 3 x 8 = 24 | 8 | $0.00 (network fees are variable) | $0.00 | 3.0 |
| Could | XSGD to SGD conversion through the StraitsX Swap API | - | 2 x 5 = 10 | 6 | $0.00 | $0.00 | 1.7 |
| Could | Payout and disbursement rails (StraitsX Payout API) | - | 2 x 3 = 6 | 8 | $0.00 | $0.00 | 0.8 |
| Won't (this increment) | Subscriptions and recurring billing | - | - | - | - | - | - |
| Won't (this increment) | Marketplace or connected-account fund splitting | - | - | - | - | - | - |
| Won't (this increment) | Custody of buyer funds or a AgenticGraph-operated wallet | - | - | - | - | - | - |
| Won't (this increment) | Stripe Treasury agentic finance tools | - | - | - | - | - | - |
| Won't (this increment) | A second payment Worker, proxy tier, or payment store | - | - | - | - | - | - |

**Min-viable scope**: the ten Must rows. Two rails, one selection contract, one
replay-safe settlement path, one queue, one serialized record, one readiness gate per
rail, all in Sandbox_Mode inside the Dev runtime.

---

## Agent-Platform Readiness

These rows define the source contract, not provider, browser, protected, mirror, or
delivery status. Current payment-scoped views and discovery are source-backed and
reported fail-closed by `payment:runtime:readiness`; authenticated hosted federation
and provider settlement remain unproven.

| Dimension | In scope | Target contract |
|---|---|---|
| Agentic OS-ready | Yes | Payment rail readiness and the payment cost ledger SHALL be exposed as read-only views over state that already exists. Each view SHALL make zero model calls, and the status surface SHALL expose no payment write path. |
| AI Agent-ready | Yes | Discovery of the payment capability and its typed contracts SHALL cost zero model tokens. Execution SHALL route through the existing Approval_Gate. |
| MCP Gateway-ready | Yes | The hosted Stripe MCP server at `https://mcp.stripe.com` SHALL be federated as one external transport alongside existing AgenticGraph transports ([Stripe MCP](https://docs.stripe.com/mcp)). No new monolithic proxy tier SHALL be introduced. |
| Stripe Treasury agentic finance tools | No | Excluded this increment; money-movement and card-issuing tools are out of scope. |
| A StraitsX MCP server | No | No MCP server is described in the referenced StraitsX documentation. Recorded under Open Questions. |

Stripe recommends enabling human confirmation for MCP tools and exercising caution
about prompt injection when combining servers ([Stripe MCP](https://docs.stripe.com/mcp)).
That recommendation is a binding constraint in R9. The documented
`get_balance_summary` Treasury tool is Public Preview and is excluded from this
increment; the Stripe MCP server as a whole SHALL NOT be mislabeled Public Preview.

---

## Requirements

### Requirement 1: Server-side trust boundary and secret custody

**User Story:** As a Solo_Operator, I want every payment credential to live only in
the server-side trust boundary, so that a local-first browser client can never leak a
payment secret.

**Journey stage:** JO-Discover, JO-Engage

**Lens fit:** min-viable-max-value - reuses the existing payment Worker instead of
adding a tier. TCO-zero - no new runtime. Token economics - no model call on this
path. Harness-first - every provider call has a typed entry point and a cost log.

#### Acceptance Criteria

1. THE Payment_Trust_Boundary SHALL be the only AgenticGraph component that sends a
   payment provider credential to a provider API.
2. THE Payment_Client SHALL request payment operations from the
   Payment_Trust_Boundary over HTTPS and SHALL hold no provider credential in
   source, bundle output, local storage, or URL.
3. THE Payment_Trust_Boundary SHALL read Stripe credentials from server-side secret
   storage. The payment adapter and autonomous MCP client SHALL use distinct
   least-privilege restricted keys, and sandbox and live credentials SHALL remain
   distinct, because Stripe documents that secret and restricted keys must not be
   embedded in source or client-side applications
   ([Stripe authentication](https://docs.stripe.com/api/authentication),
   [restricted keys](https://docs.stripe.com/keys/restricted-api-keys)).
4. THE Payment_Trust_Boundary SHALL read StraitsX credentials from server-side secret
   storage and SHALL send `X-XFERS-APP-API-KEY` on every StraitsX request, which
   StraitsX documents as a mandatory header for all authentication methods
   ([StraitsX Say Hello](https://docs.straitsx.com/reference/say-hello)).
5. WHERE StraitsX HTTP request signing is enabled for the account, THE
   Payment_Trust_Boundary SHALL additionally send `X-PUBLIC-KEY-ID`, `X-TIMESTAMP`
   within 300 seconds of provider server time, a per-request UUID `X-NONCE`, and a
   base64 `X-SIGNATURE` over
   `METHOD\nPATH\nQUERY\nTIMESTAMP\nNONCE\nBODY`, where the already URL-encoded raw
   query pairs, including repeated keys and their original encodings, are sorted
   lexicographically without decode/re-encode and BODY is the exact transmitted body
   ([HTTP request signing](https://docs.straitsx.com/docs/http-request-signing)). IF
   canonical request construction or signing fails, THEN the operation SHALL return a
   typed failure before fetch, cost observation, or provider-object creation and SHALL
   report zero provider calls.
6. IF a build or check finds a provider credential value in Payment_Client bundle
   output, local storage, or a URL, or finds a required credential bound by name or
   value in visible Worker variables, THEN THE Readiness_Gate SHALL report a failure
   and SHALL leave configuration unchanged. Static operator documentation MAY name a
   required credential but SHALL contain no credential value.
7. THE Payment_Trust_Boundary SHALL independently pin one Stripe request API version
   and one Stripe webhook endpoint API version per deployment. Every outbound Stripe
   request SHALL use the request pin, and event parsing SHALL use the webhook pin,
   because webhook payload shape can otherwise drift independently from request
   behavior ([Stripe versioning](https://docs.stripe.com/api/versioning)).
8. THE payment adapter, hosted-provider tool client, sandbox environment, and live
   environment SHALL have separately named credential owners. No readiness result
   SHALL infer least privilege or environment from a shared generic credential.

**Verifiable Completion Conditions**

- `Verify a focused repository check reports zero credential values in Payment_Client output and zero required credential bindings by name or value in visible Worker vars, exits non-zero when either leak is planted, and performs zero writes` (criteria 1, 2, 6)
- `Verify every outbound StraitsX request carries X-XFERS-APP-API-KEY and the signed-mode builder additionally emits X-PUBLIC-KEY-ID, X-TIMESTAMP, a fresh UUID X-NONCE, and X-SIGNATURE over the documented canonical request, with repeated raw query pairs sorted byte-lexicographically without normalization; verify a signing failure stops before fetch and records zero provider calls` (criteria 4, 5)
- `Verify the Stripe request and webhook API versions are independently read from one owner, every outbound request carries the request pin, event parsing reports the webhook pin, and adapter, MCP, sandbox, and live credential owners are distinct` (criteria 3, 7, 8)

---

### Requirement 2: Rail selection

**User Story:** As a Buyer_SG, I want the right rail chosen for my currency and
region without being asked, so that I can pay with a method I already use.

**Journey stage:** JB-Trigger, JB-Discover

**Lens fit:** min-viable-max-value - one deterministic router replaces per-surface
branching. TCO-zero - selection is pure computation with no external call. Token
economics - zero model calls; selection is rule-based, not inferred. Harness-first -
typed input, typed selection result, logged decision.

#### Acceptance Criteria

1. THE Rail_Router SHALL return exactly one selected Rail or a typed
   `rail_unavailable` result for each Payment_Intent_Record from the requested
   currency, the requested settlement asset, and Sandbox_Admission_Status.
2. WHEN the requested currency is `sgd` and the requested settlement asset is fiat
   and the StraitsX_Rail is sandbox-admitted, THE Rail_Router SHALL select
   `straitsx`.
3. WHEN the requested settlement asset is `xsgd`, THE Rail_Router SHALL select
   `straitsx` only when both the StraitsX rail and the separate XSGD capability are
   sandbox-admitted. An admitted SGD fiat capability SHALL NOT imply XSGD admission
   or readiness.
4. WHEN the requested currency is a supported card-settled currency other than `sgd`
   and the Stripe_Rail is sandbox-admitted, THE Rail_Router SHALL select `stripe`.
5. WHILE more than one Rail is compatible and exactly one compatible Rail is
   sandbox-admitted,
   THE Rail_Router SHALL select that Rail and SHALL record the reason
   `only_ready_rail` in the Payment_Intent_Record. Admission SHALL never make an
   incompatible Rail eligible.
6. IF no compatible Rail is sandbox-admitted for the requested currency and
   settlement asset,
   THEN THE Rail_Router SHALL return a typed `rail_unavailable` result and SHALL
   create no provider object.
7. THE Rail_Router SHALL record the selected Rail identifier and the selection reason
   in the Payment_Intent_Record before any provider call is made.
8. WHEN the same selection inputs are supplied twice, THE Rail_Router SHALL return
   the same Rail identifier and the same selection reason.
9. THE Readiness_Gate SHALL keep `admissionRails` and proof-complete `rails`
   separate. Complete sandbox configuration MAY set an `admissionRails` entry true
   so that the first sandbox payment can be attempted, but SHALL NOT set the
   corresponding proof-complete `rails` entry true without R11 settlement evidence.
10. THE Payment_Trust_Boundary SHALL resolve exactly one Buyer_Product_Authority
    from `PAYMENT_BUYER_PRODUCT_AMOUNT_MINOR`,
    `PAYMENT_BUYER_PRODUCT_CURRENCY`, and
    `PAYMENT_BUYER_PRODUCT_SETTLEMENT_ASSET`. Missing or malformed authority, or a
    caller amount, currency, or settlement asset that differs from it, SHALL return
    `capability_unavailable` before D1 access or provider contact. A multi-product or
    entitlement catalog SHALL NOT be introduced in this increment.

**Verifiable Completion Conditions**

- `Verify a selection table covers admitted and unadmitted SGD fiat, separately admitted and unadmitted XSGD, a supported card currency, a single eligible rail, an incompatible admitted rail, an unsupported currency, and no eligible rail, with the documented identifier and reason and zero provider calls` (criteria 1-6)
- `Verify the intent record persisted before any provider call already contains the rail identifier and selection reason` (criterion 7)
- `Verify repeated selection with identical inputs returns identical output across 100 generated input cases` (criterion 8)
- `Verify complete sandbox configuration can set admissionRails true while proof-complete rails remains false until an authenticated paid sandbox record round-trips, and verify missing server product authority keeps both false` (criterion 9)
- `Verify the exact server-owned buyer product is projected for display and any caller price, currency, or settlement-asset mismatch returns capability_unavailable before D1 or provider contact` (criterion 10)

---

### Requirement 3: Stripe rail intent creation and idempotency

**User Story:** As a Buyer_Global, I want a card payment I can retry safely, so that
a lost response never charges me twice.

**Journey stage:** JB-Engage

**Lens fit:** min-viable-max-value - hosted Checkout avoids building card UI and
keeps card data out of AgenticGraph. TCO-zero - no added infrastructure. Token
economics - zero model calls. Harness-first - typed create request, typed session
result, cost log per provider call.

#### Acceptance Criteria

1. WHEN the Rail_Router selects `stripe`, THE Stripe_Rail SHALL create the provider
   payment object through the Stripe Checkout Sessions API, which Stripe recommends
   for most payment integrations
   ([Checkout Sessions API](https://docs.stripe.com/payments/checkout-sessions),
   [Create a Checkout Session](https://docs.stripe.com/api/checkout/sessions/create)).
2. THE Stripe_Rail SHALL send a Provider_Idempotency_Key on every Stripe POST
   request, derived deterministically from the Client_Intent_Key, because Stripe
   saves the status code and body of the first request for a given idempotency key
   and returns the same result for later requests using that key
   ([Idempotent requests](https://docs.stripe.com/api/idempotent_requests)).
3. THE Stripe_Rail SHALL use a random-string Provider_Idempotency_Key of at most 255
   characters that contains no email address and no personal identifier, per Stripe
   guidance on key length and sensitive data
   ([Idempotent requests](https://docs.stripe.com/api/idempotent_requests)).
4. WHEN a create request is retried with the same Client_Intent_Key and the same
   request parameters, THE Stripe_Rail SHALL return the first stored provider result
   and SHALL leave the count of Stripe objects for that Client_Intent_Key at one.
5. IF Stripe returns an error of type `idempotency_error` because retried parameters
   differ from the original request, THEN THE Stripe_Rail SHALL record a typed
   `intent_parameter_conflict` result and SHALL create no additional provider object
   ([Errors](https://docs.stripe.com/api/errors),
   [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)).
6. THE Stripe_Rail SHALL store the AgenticGraph Payment_Intent_Record identifier on the
   provider object as metadata and SHALL store the returned provider object
   identifier on the Payment_Intent_Record, so that either side resolves the other.
7. THE Stripe_Rail SHALL record the `Request-Id` response header value on the
   Payment_Intent_Record for every Stripe call, because Stripe returns a request
   identifier per request for support correlation
   ([Request IDs](https://docs.stripe.com/api/request_ids)).
8. WHEN a Stripe Checkout Session reaches its provider expiry, THE Reconciler SHALL
   move the Payment_Intent_Record to `expired`, noting that Stripe documents a
   default Checkout Session expiry of 24 hours after creation
   ([Accept a payment](https://docs.stripe.com/payments/accept-a-payment)).
9. IF a Stripe create response is lost, times out, or returns an indeterminate
   transport or provider `5xx` outcome, THE Stripe_Rail SHALL retain state
   `provider_outcome_unknown` and SHALL reconcile the authoritative Checkout Session
   with the same Client_Intent_Key and Provider_Idempotency_Key before any retry. It
   SHALL NOT manufacture a new logical operation key or label the outcome failed
   ([advanced error handling](https://docs.stripe.com/error-low-level)).
10. THE Stripe_Rail SHALL treat the hosted Checkout Session as the authoritative
    card object for this increment. It SHALL unlock paid capability only when that
    Session's `payment_status` is financially successful; it SHALL NOT conflate the
    Checkout Session `status`, PaymentIntent status, and payment status.
11. ONCE a locally owned intent is 23 hours old, THE Reconciler SHALL NOT issue
    another provider create request, even with the same Provider_Idempotency_Key.
    The intent SHALL remain `provider_outcome_unknown` or become
    `reconciliation_unresolved` until an authoritative provider read or operator
    resolution establishes the outcome. This local cutoff precedes Stripe's
    documented ability to prune an idempotency key after at least 24 hours and
    prevents a late retry from creating a second object
    ([Idempotent requests](https://docs.stripe.com/api/idempotent_requests)).

**Verifiable Completion Conditions**

- `Verify a Stripe create call carries an Idempotency-Key of at most 255 characters derived from the Client_Intent_Key and containing no email or personal identifier` (criteria 2, 3)
- `Verify replaying the same create request with the same Client_Intent_Key yields exactly one Stripe object and one stored provider identifier` (criterion 4)
- `Verify a simulated idempotency_error response produces a typed intent_parameter_conflict result and no second provider object` (criterion 5)
- `Verify the persisted intent record contains the provider object id and the Request-Id for every Stripe call` (criteria 6, 7)
- `Verify an expired authoritative Checkout Session transitions to expired and unlocks nothing, while transport or provider uncertainty remains provider_outcome_unknown and reconciles with the same logical key without conflating nested object states` (criteria 8-10)
- `Verify provider create is never retried beyond the 23-hour local safety window, remains unresolved without a provider read, and therefore cannot manufacture a second object after provider idempotency retention may expire` (criterion 11)

---

### Requirement 4: StraitsX rail for SGD fiat and XSGD

**User Story:** As a Buyer_SG, I want to pay in SGD with PayNow or bank transfer, or
settle in XSGD, so that I am not forced onto a card rail.

**Journey stage:** JB-Discover, JB-Engage

**Lens fit:** min-viable-max-value - reuse StraitsX-hosted payment methods rather
than integrating a bank directly. TCO-zero - no added AgenticGraph infrastructure; fees
are variable. Token economics - zero model calls. Harness-first - typed request,
typed result, cost log per provider call.

#### Acceptance Criteria

1. THE StraitsX_Rail SHALL operate under exactly one StraitsX integration model and
   one `STRAITSX_FUND_FLOW` per deployment, recorded in configuration and validated
   as a permitted pair before authentication or egress, because StraitsX defines
   First Party Transfer, Third Party Transfer, and Regular Transfer as distinct
   approved models with distinct fund flows and endpoints
   ([StraitsX API guides](https://docs.straitsx.com/docs/introduction)).
2. WHEN the Rail_Router selects `straitsx` for an SGD fiat collection, THE
   StraitsX_Rail SHALL create the collection only through the source-bound dynamic
   PayNow contract: `POST /v1/payments/paynow`, with exactly
   `data.attributes.referenceId`, `data.attributes.amount`, and
   `data.attributes.expiresAt`. It SHALL read the resulting PayNow identifier through
   `GET /v1/payments/paynow/{paymentId}`. The configured integration model and
   `dynamic_paynow` product SHALL be present in the account's granted products. An
   unbound path, model, method, or grant SHALL return `capability_unavailable` with
   zero provider calls
   ([StraitsX API guides](https://docs.straitsx.com/docs/introduction)).
3. THE StraitsX_Rail SHALL present the returned StraitsX payment instruction to the
   Payment_Client without modification. The response contract SHALL require
   `data.type = "payment"` and nested `data.attributes.status`, `currency`, `amount`,
   `referenceId`, and `paymentMethod`; the provider object identifier SHALL be
   `paymentMethod.id`, `paymentMethod.type` SHALL be `paynow`, and only the documented
   instruction fields SHALL cross the public boundary.
4. WHERE the requested settlement asset is `xsgd`, THE StraitsX_Rail SHALL return
   `capability_unavailable` with zero provider calls until the exact inbound endpoint,
   supported network source, settlement contract, and account grant are all bound.
   Documentation discovery alone SHALL NOT enable XSGD.
5. THE StraitsX_Rail SHALL record the StraitsX payment identifier on the
   Payment_Intent_Record and SHALL treat the StraitsX GET payment method as the
   authority when local state and provider state disagree. An XSGD-denominated
   provider response for an SGD fiat intent SHALL remain
   `provider_outcome_unknown` and SHALL unlock nothing.
6. THE StraitsX_Rail SHALL derive one stable provider operation key from the
   Client_Intent_Key and reuse it for every retry of the same logical create
   operation. An indeterminate response SHALL remain `provider_outcome_unknown`;
   the adapter SHALL read provider state using the same logical identity before
   retrying and SHALL never record two completed provider payments for one intent
   ([StraitsX idempotent requests](https://docs.straitsx.com/docs/idempotent-requests),
   [transaction safety](https://docs.straitsx.com/docs/transaction-safety)).
7. IF `STRAITSX_FUND_FLOW` is absent or invalid, THEN THE StraitsX_Rail SHALL fail
   closed as `fund_flow_unresolved`. IF the configured StraitsX integration model
   does not permit that fund flow, THEN it SHALL return
   `integration_model_unsupported`. Both results SHALL occur before request signing,
   fetch, cost observation, or provider-object creation and SHALL report zero
   provider calls.
8. THE StraitsX_Rail SHALL target the StraitsX sandbox base URL
   `https://api-sandbox.straitsx.com/v1` while Sandbox_Mode is configured
   ([StraitsX Say Hello](https://docs.straitsx.com/reference/say-hello)).

**Verifiable Completion Conditions**

- `Verify STRAITSX_INTEGRATION_MODEL and STRAITSX_FUND_FLOW are read from one owner; missing or invalid flow returns fund_flow_unresolved, a model-flow mismatch returns integration_model_unsupported, and both fail before authentication or fetch with an empty call list and zero provider calls` (criteria 1, 7)
- `Verify an SGD fiat intent uses POST /v1/payments/paynow with exactly the three nested request attributes, derives the read path from paymentMethod.id, accepts only the nested payment/paynow response shape, and projects only the allowlisted instruction fields without modification` (criteria 2, 3)
- `Verify an xsgd intent remains capability_unavailable with zero provider calls while any endpoint, network, settlement, or grant input is absent` (criterion 4)
- `Verify uncertain retries preserve one stable provider operation key, read provider state before retry, remain provider_outcome_unknown until resolved, and produce at most one completed record` (criteria 5, 6)
- `Verify every StraitsX request in Sandbox_Mode targets the sandbox base URL` (criterion 8)

---

### Requirement 5: Provider event authentication and replay-safe settlement

**User Story:** As a Solo_Operator, I want provider callbacks authenticated and
applied exactly once, so that a replayed or forged event cannot unlock a paid
capability.

**Journey stage:** JB-Complete, JA-Complete

**Lens fit:** min-viable-max-value - one ingestion path serves both rails. TCO-zero -
reuses the existing D1 event state table pattern. Token economics - zero model calls
in settlement. Harness-first - typed event, typed settlement outcome, logged
decision.

#### Acceptance Criteria

1. WHEN a Stripe Provider_Event arrives, THE Event_Ingestor SHALL verify the event
   against the `Stripe-Signature` header and the endpoint signing secret before
   reading the event payload, using the unmodified UTF-8 raw request body
   ([Webhook signature verification](https://docs.stripe.com/webhooks/signature)).
2. IF Stripe signature verification fails, THEN THE Event_Ingestor SHALL reject the
   event, SHALL apply no state change, and SHALL record a typed
   `signature_verification_failed` outcome
   ([Webhook signature verification](https://docs.stripe.com/webhooks/signature)).
3. WHEN a StraitsX callback arrives, THE Event_Ingestor SHALL verify the
   `Xfers-Signature` HMAC-SHA256 value over the exact unparsed request body and SHALL
   accept the callback only from the provider-documented source addresses
   `52.221.59.197` and `52.77.136.252`. Both checks SHALL pass before parsing, and the
   ingestor SHALL then confirm the referenced payment through an authoritative
   provider read before applying settlement
   ([securing callbacks](https://docs.straitsx.com/docs/securing-your-callback)).
4. THE Event_Ingestor SHALL record a per-provider event identity with a processing
   status and SHALL apply the settlement side effects for a given event identity at
   most once.
5. WHEN a Provider_Event with an already-processed identity and an equivalent payload
   arrives, THE Event_Ingestor SHALL acknowledge the event with a success response
   and SHALL apply no additional state change.
6. IF a Provider_Event carries an already-recorded identity with a conflicting
   payload, THEN THE Event_Ingestor SHALL reject the event and SHALL preserve the
   previously recorded state.
7. WHILE a Provider_Event identity is recorded as failed or as a stale in-flight
   claim, THE Event_Ingestor SHALL allow a later delivery of that identity to be
   processed, so that provider redelivery resolves transient failures. StraitsX
   supports operator-initiated redelivery through its resend-callback methods
   ([StraitsX Webhooks](https://docs.straitsx.com/reference/webhooks)).
8. THE Event_Ingestor SHALL move a Payment_Intent_Record to `paid` only when the
   provider-reported paid state, the intent identifier, the amount in minor units,
   and the currency all match the stored Payment_Intent_Record.
9. Provider delivery order SHALL NOT determine payment state. Repeated provider event
   ids and semantic duplicates for the same provider object and event type SHALL
   produce at most one settlement side effect.

**Verifiable Completion Conditions**

- `Verify altered raw bytes, a wrong secret, or a stale Stripe timestamp is rejected before parse with signature_verification_failed and zero state change` (criteria 1, 2)
- `Verify a StraitsX callback with a wrong raw-body HMAC or a source outside the allowlist is rejected before parse, and an accepted callback triggers a provider state read before settlement` (criterion 3)
- `Verify repeated event ids, semantic object-and-type duplicates, and reordered delivery produce one settlement side effect and successful duplicate acknowledgement` (criteria 4, 5, 9)
- `Verify a conflicting payload for a recorded event identity is rejected and prior state is unchanged` (criterion 6)
- `Verify an event identity recorded as failed is reprocessed on redelivery and reaches a terminal outcome` (criterion 7)
- `Verify an amount, currency, or intent-identifier mismatch leaves the record unpaid` (criterion 8)

---

### Requirement 6: Offline intent queue and reconnect reconciliation

**User Story:** As a Buyer_SG, I want a purchase started with no connection to
resolve correctly when the connection returns, so that I neither lose the purchase
nor pay twice.

**Journey stage:** JB-Engage, JB-Complete

**Lens fit:** min-viable-max-value - a bounded local queue is the smallest change
that makes offline-first payments honest. TCO-zero - queue lives in existing
browser-local storage; zero egress while offline. Token economics - zero model calls
in queue or reconciliation. Harness-first - typed queue entry, typed reconciliation
outcome, bounded retry.

#### Acceptance Criteria

1. WHILE the Payment_Client has no reachable Payment_Trust_Boundary, THE
   Payment_Client SHALL persist each requested payment as a queued
   Payment_Intent_Record with a Client_Intent_Key and SHALL display the state
   `queued_offline`. It SHALL create no provider object, QR code, destination, or
   provider-derived status while offline.
2. THE Payment_Client SHALL generate the Client_Intent_Key as a UUID once per buyer
   purchase attempt and SHALL reuse that key for every later submission of the same
   attempt.
3. WHEN the Payment_Trust_Boundary becomes reachable, THE Reconciler SHALL submit
   queued Payment_Intent_Records in the order they were created, one Client_Intent_Key
   at a time.
4. WHEN the Payment_Trust_Boundary receives a submission whose Client_Intent_Key is
   already recorded, THE Payment_Trust_Boundary SHALL return the existing
   Payment_Intent_Record and SHALL create no additional provider object. This durable
   local uniqueness SHALL remain authoritative beyond any provider idempotency-key
   retention window.
5. THE Reconciler SHALL resolve every submitted Payment_Intent_Record to a
   Provider_Terminal_State by reading provider state, and SHALL not treat local queue
   state as evidence of payment.
6. IF a queued Payment_Intent_Record cannot reach a Provider_Terminal_State after a
   bounded number of reconciliation attempts, THEN THE Reconciler SHALL mark it
   `reconciliation_unresolved`, SHALL stop retrying that record, and SHALL surface an
   operator-visible entry. `reconciliation_unresolved` SHALL be recorded as a local
   Reconciliation_Stopped_State, not as a provider terminal outcome.
7. THE Reconciler SHALL apply a bounded retry schedule with a stated maximum attempt
   count per Payment_Intent_Record.
8. WHILE a Payment_Intent_Record is not in the `paid` Provider_Terminal_State, THE
   Payment_Surface SHALL withhold the paid capability.
9. THE Payment_Client SHALL store no provider credential and no card or bank
   identifier in the Intent_Queue.
10. THE Intent_Queue SHALL hold at most 100 records. WHEN it is at capacity, THE
    Payment_Client SHALL reject the new enqueue with `queue_capacity_reached` and
    SHALL preserve every existing record without silent eviction.
11. WHEN a previously submitted queued intent reaches the 23-hour local provider
    create safety window without a known provider object, THE Reconciler SHALL NOT
    re-POST it. Durable local ownership SHALL remain authoritative, paid capability
    SHALL remain locked, and resolution SHALL require an authoritative provider read
    or operator action.

**Verifiable Completion Conditions**

- `Verify a payment requested with the trust boundary unreachable persists as queued_offline with a UUID Client_Intent_Key, survives a client reload, and creates no provider call, QR code, destination, or provider-derived status` (criteria 1, 2)
- `Verify submitting the same Client_Intent_Key N times, including after the provider retention window, creates at most one provider object across 100 generated interleavings` (criteria 3, 4)
- `Verify every reconciled record reaches a Provider_Terminal_State only from provider-read state, reconciliation_unresolved remains a local stopped state, and queue or stopped state alone never unlocks capability` (criteria 5, 6, 8)
- `Verify an unresolvable record stops retrying at the stated attempt bound and is reported as reconciliation_unresolved` (criteria 6, 7)
- `Verify the persisted queue contains no credential, card, or bank identifier field` (criterion 9)
- `Verify a 101st enqueue returns queue_capacity_reached and leaves all 100 existing records byte-equivalent` (criterion 10)
- `Verify a queued intent at or beyond the 23-hour provider-create safety window is not re-POSTed, retains durable local ownership, unlocks nothing, and requires provider-read or operator resolution` (criteria 4, 8, 11)

---

### Requirement 7: Payment record serialization and receipt round-trip

**User Story:** As a Solo_Operator, I want terminal payments written to one
inspectable local document, so that I can audit and show a receipt without opening a
provider dashboard.

**Journey stage:** JB-Return, JA-Return

**Lens fit:** min-viable-max-value - one document replaces a reporting UI. TCO-zero -
local file, zero egress to read. Token economics - deterministic serialization with
zero model calls. Harness-first - typed record in, typed document out, parse verified
by round-trip.

#### Acceptance Criteria

1. WHEN a Payment_Intent_Record reaches a Provider_Terminal_State or
   Reconciliation_Stopped_State, THE Record_Serializer SHALL append one entry to the
   Payment_Record_Document containing the intent identifier, the Client_Intent_Key,
   the selected Rail, the amount in minor units, the currency, the settlement asset,
   the resulting Terminal_State, the provider object identifier field, and the
   terminal timestamp. The provider object identifier SHALL be non-null for `paid`
   and MAY be `null` only when no provider object was created.
2. THE Record_Serializer SHALL emit entries in a stable order with base-10 integer
   minor-unit amounts, LF line endings, and a single trailing newline.
3. THE Record_Parser SHALL read a valid Payment_Record_Document into
   Payment_Intent_Records.
4. FOR ALL valid Payment_Record_Documents, parsing and then re-serializing SHALL
   produce a byte-identical document (round-trip property).
5. FOR ALL valid Payment_Intent_Record sets, serializing, parsing, and serializing
   again SHALL produce a byte-identical document.
6. IF a Payment_Record_Document is malformed, THEN THE Record_Parser SHALL return a
   typed parse error naming the failing line and SHALL leave the document bytes
   unchanged.
7. THE Record_Serializer SHALL exclude card numbers, bank account numbers, provider
   credentials, buyer email addresses, and provider customer identifiers from every
   entry.
8. WHEN the Payment_Client has no network connection, THE Payment_Surface SHALL
   render the Payment_Record_Document entries from local storage with zero network
   requests.
9. WHEN a Payment_Intent_Record reaches `refunded`, THE Record_Serializer SHALL
   preserve terminal state `refunded`; it SHALL NOT rewrite or project that record as
   `paid`.

**Verifiable Completion Conditions**

- `Verify every terminal record produces exactly one document entry with all nine named fields present, with a non-null provider object identifier for paid, refunded, and expired, and null permitted only when no provider object was created` (criterion 1)
- `Verify parse then print is byte-identical for 100 generated valid documents` (criteria 3, 4)
- `Verify print then parse then print is byte-identical for 100 generated record sets` (criteria 2, 5)
- `Verify a malformed document yields a typed parse error naming the failing line and the file bytes are unchanged` (criterion 6)
- `Verify no entry contains a card number, bank account number, credential, email address, or provider customer identifier across 100 generated records` (criterion 7)
- `Verify the receipt view renders from local state with zero network requests` (criterion 8)
- `Verify a refunded runtime record round-trips with terminal_state refunded and is never projected as paid` (criterion 9)

---

### Requirement 8: Buyer payment surface states

**User Story:** As a Buyer_SG on a phone, I want the payment state and my next action
always visible, so that I am never left guessing whether I paid.

**Journey stage:** JB-Discover, JB-Complete

**Lens fit:** min-viable-max-value - state clarity over checkout customization.
TCO-zero - reuses the existing canvas surface owners. Token economics - no model call
renders payment state. Harness-first - the surface reads one typed snapshot and owns
no payment logic.

#### Acceptance Criteria

1. THE Payment_Surface SHALL display exactly one of `idle`, `queued_offline`,
   `pending_provider`, `paid`, `refunded`, `no_payment_required`, `failed`, `expired`,
   `cancelled`, or `reconciliation_unresolved` for the active
   Payment_Intent_Record.
2. THE Payment_Surface SHALL display the amount and currency from the server-owned
   Buyer_Product_Authority before an intent exists, then the matching persisted
   amount and currency, selected Rail, and payment instruction for the active intent.
3. THE Payment_Surface SHALL remain usable at 375 by 812 CSS pixels without
   horizontal page overflow.
4. WHILE the state is `queued_offline`, THE Payment_Surface SHALL state that the
   payment is held locally and SHALL state that it will be submitted when the
   connection returns.
5. WHEN the state changes, THE Payment_Surface SHALL update from the single payment
   state snapshot owned by the Payment_Client and SHALL derive no payment state of its
   own.
6. IF a payment fails, THEN THE Payment_Surface SHALL display a buyer-safe reason and
   one retry action that reuses the existing Client_Intent_Key.
7. THE Payment_Surface SHALL keep every payment control reachable by keyboard and
   SHALL expose the current payment state to assistive technology as text.
8. WHEN the state is `refunded`, THE Payment_Surface SHALL label it distinctly from
   `paid`, expose a refund-receipt next action, and withhold the paid capability.

**Verifiable Completion Conditions**

- `Verify each of the ten states renders a distinct labelled state and the documented next action, the idle price comes only from the server-owned buyer product, and refunded never renders as paid` (criteria 1, 2, 4, 6, 8)
- `Verify the surface has no horizontal overflow at 375x812 and every control is keyboard reachable with a text state announcement` (criteria 3, 7)
- `Verify the surface reads the shared payment snapshot and holds no local payment state field` (criterion 5)

---

### Requirement 9: Agent payment discovery and approval-gated tools

**User Story:** As a Buying_Agent, I want to discover the payment capability at zero
token cost and initiate payment through an approval-gated tool, so that automated
purchase is possible without unbounded spend.

**Journey stage:** JA-Discover, JA-Engage

**Lens fit:** min-viable-max-value - federate existing transports instead of building
a gateway. TCO-zero - discovery is a static read with no metered call. Token
economics - discovery costs zero tokens; execution cost is logged. Harness-first -
typed tool contracts and an Approval_Gate before money moves.

#### Acceptance Criteria

1. THE Agent_Payment_Surface SHALL publish machine-readable payment capability
   metadata that names the available Rails, supported currencies, supported settlement
   assets, the one resolved Buyer_Product_Authority, and the typed request and result
   schemas. It SHALL NOT publish or introduce a multi-product or entitlement catalog.
2. THE Agent_Payment_Surface SHALL serve discovery responses with zero model calls and
   a recorded model cost of zero.
3. WHEN an agent requests a payment-creating or money-moving tool call, THE
   Approval_Gate SHALL authorize the call before the Payment_Trust_Boundary contacts a
   provider.
4. IF an agent tool call has no valid approval, THEN THE Payment_Trust_Boundary SHALL
   reject the call, SHALL create no provider object, and SHALL record a zero-cost
   rejection entry.
5. WHERE the hosted Stripe MCP server is federated, THE Agent_Payment_Surface SHALL
   register it as one external transport at `https://mcp.stripe.com`. The allowlist
   SHALL match the current documented inventory exactly:
   `stripe_api_search`, `stripe_api_details`, `stripe_api_read`,
   `stripe_api_write`, `get_stripe_account_info`, `create_refund`,
   `search_stripe_documentation`, `stripe_implementation_planner`,
   `send_stripe_mcp_feedback`, and `stripe_report`. Unknown tools and the excluded
   Public Preview `get_balance_summary` tool SHALL NOT be enabled
   ([Stripe MCP](https://docs.stripe.com/mcp)).
6. THE Agent_Payment_Surface SHALL mark every hosted Stripe MCP tool as requiring
   human confirmation, per Stripe's recommendation. State-changing or spend-bearing
   calls SHALL additionally pass the existing Approval_Gate before dispatch.
7. WHERE an interactive Stripe MCP client supports OAuth, THE
   Payment_Trust_Boundary SHALL prefer OAuth. WHERE an autonomous client cannot use
   OAuth, it SHALL use a vault-held restricted API key limited to the required
   operations. WHERE Stripe MCP is called for a connected account, it SHALL use a
   restricted API key with the required Connect permissions and SHALL send
   `Stripe-Account`, because Stripe documents that connected-account MCP calls cannot
   use OAuth ([Stripe MCP](https://docs.stripe.com/mcp)).
8. THE Payment_Trust_Boundary SHALL keep Stripe MCP sandbox and live authority
   separate and SHALL infer neither environment nor least privilege from one shared
   generic key.
9. THE Agent_Payment_Surface SHALL return one rail-neutral typed result shape for a
   payment request regardless of the selected Rail.
10. THE Agent_Payment_Surface SHALL add no new proxy tier and SHALL reuse the existing
   AgenticGraph MCP transports and the existing Approval_Gate owner.
11. THE public HTTP `POST /api/payments/intents` route SHALL reject
    `origin = "agent"` with `approval_missing` before constructing the payment runtime
    or reading D1, even when the caller supplies an `approvalRef`. Agent-originated
    intent service execution SHALL be host-only and reachable only after the existing
    MCP host verifies Approval_Gate authorization.
12. AFTER Approval_Gate verifies an agent intent token, THE MCP host SHALL derive a
    non-secret `payment-action:<tokenId-or-issuedAt>` approval reference for the Worker
    adapter and SHALL strip the raw approval token before invocation. An unverified
    caller-authored reference SHALL never substitute for this handoff.

**Verifiable Completion Conditions**

- `Verify the discovery response validates against the published schema, names both rails, projects only the resolved server-owned buyer product, introduces no catalog, and reports a model cost of zero` (criteria 1, 2)
- `Verify an unapproved payment tool call is rejected with zero provider calls and a zero-cost log entry` (criteria 3, 4)
- `Verify the Stripe MCP endpoint matches the documented remote URL, the allowlist equals the ten documented non-preview tools exactly, and unknown plus get_balance_summary are excluded` (criterion 5)
- `Verify every hosted Stripe MCP tool requires human confirmation and an unapproved state-changing or spend-bearing call makes zero provider calls` (criteria 3, 4, 6)
- `Verify interactive OAuth is preferred, autonomous and connected-account paths use distinct least-privilege restricted-key owners, connected-account calls require Stripe-Account, and sandbox/live authority cannot alias` (criteria 7, 8)
- `Verify a stripe-selected and a straitsx-selected payment request return the same result shape` (criterion 9)
- `Verify no new transport or proxy component is introduced beyond the existing MCP transports` (criterion 10)
- `Verify a public HTTP origin=agent create carrying an arbitrary approvalRef returns approval_missing before any D1 access, while the approved MCP host remains the only agent-create service caller` (criterion 11)
- `Verify a valid approval immediately precedes one adapter call, the host derives the non-secret payment-action approvalRef, and the raw approval token is absent from adapter arguments` (criterion 12)

---

### Requirement 10: Typed failures and refunds

**User Story:** As a Solo_Operator, I want every payment failure to be typed and
every refund to be traceable, so that I can resolve a buyer problem without guessing.

**Journey stage:** JB-Complete, JO-Return

**Lens fit:** min-viable-max-value - typed errors over a support workflow. TCO-zero -
no added service. Token economics - failure handling makes no model call.
Harness-first - typed error taxonomy surfaced from the harness, never raw provider
payloads.

#### Acceptance Criteria

1. THE Payment_Trust_Boundary SHALL map every Stripe failure into a typed AgenticGraph
   result that preserves the Stripe error type, which Stripe documents as one of
   `api_error`, `card_error`, `idempotency_error`, or `invalid_request_error`
   ([Errors](https://docs.stripe.com/api/errors)).
2. WHERE a Stripe card failure carries a `decline_code`, THE Payment_Trust_Boundary
   SHALL record that code and SHALL surface only a buyer-safe message to the
   Payment_Surface ([Errors](https://docs.stripe.com/api/errors)).
3. THE Payment_Trust_Boundary SHALL map every StraitsX failure into a typed AgenticGraph
   result that preserves the provider HTTP status and the provider-reported reason.
4. WHEN a refund is requested for a `paid` Payment_Intent_Record, THE
   Payment_Trust_Boundary SHALL create the refund on the Rail that settled the
   payment only when an exact provider refund operation, eligibility rule, account
   grant, and idempotency contract are bound, and SHALL record the refund reference
   on that record.
5. WHEN a refund request is retried for the same Payment_Intent_Record, THE
   Payment_Trust_Boundary SHALL reuse one stable refund operation key and SHALL leave
   the refunded amount unchanged. Stripe paid-record refunds SHALL use the bound
   Stripe refund operation and its idempotency key.
6. IF a refund is requested for a Payment_Intent_Record that is not `paid`, THEN THE
   Payment_Trust_Boundary SHALL return a typed `refund_not_applicable` result and
   SHALL contact no provider.
7. WHEN a provider call fails with a transport or `5xx` error, THE
   Payment_Trust_Boundary SHALL record `provider_outcome_unknown`, retry or read
   provider state with the same Provider_Idempotency_Key up to a stated attempt
   bound, and SHALL leave the operation non-terminal if no authoritative provider
   outcome is obtained. It SHALL NOT mint a new operation key or relabel an
   indeterminate financial outcome as terminal `provider_unavailable`.
8. THE Payment_Trust_Boundary SHALL record every failure with the provider request
   identifier where the provider returns one.
9. UNTIL an exact StraitsX refund endpoint, eligibility rule, account grant, and
   idempotency contract are bound, THE Payment_Trust_Boundary SHALL return
   `provider_operation_unverified` for a StraitsX paid-record refund and SHALL make
   zero provider calls.
10. THE public HTTP `POST /api/payments/intents/{intentId}/refund` route SHALL return
    `approval_missing` before constructing the payment runtime or reading D1. Refund
    service execution SHALL be host-only and reachable only after the existing MCP
    host verifies Approval_Gate authorization.
11. WHEN a refund succeeds or an authoritative provider read returns `refunded`, THE
    Payment_Intent_Record, public status, MCP projection, Payment_Surface, and
    Payment_Record_Document SHALL all preserve `refunded` as a distinct terminal
    state. None SHALL project it as `paid`, and paid capability SHALL remain locked.

**Verifiable Completion Conditions**

- `Verify each documented Stripe error type and a decline_code case map to a distinct typed result and the buyer-visible message excludes provider internals` (criteria 1, 2)
- `Verify a StraitsX error response maps to a typed result carrying the HTTP status and provider reason` (criterion 3)
- `Verify a Stripe refund on a paid record records one refund reference and repeated execution with one stable operation key leaves the refunded amount unchanged` (criteria 4, 5)
- `Verify a refund request on a non-paid record returns refund_not_applicable with zero provider calls` (criterion 6)
- `Verify a simulated transport or 5xx sequence preserves provider_outcome_unknown, uses one operation key through bounded reconciliation, creates no second provider object, and never records a false terminal provider failure` (criterion 7)
- `Verify each recorded failure carries the provider request identifier when the provider supplies one` (criterion 8)
- `Verify an unbound StraitsX paid-record refund returns provider_operation_unverified with zero provider calls` (criterion 9)
- `Verify a public HTTP refund attempt returns approval_missing before any D1 access, while the approved MCP host remains the only refund service caller` (criterion 10)
- `Verify successful refund and provider-read refunded records remain refunded across the four-field public status, MCP result, ten-state surface, and nine-field receipt, and never unlock paid capability` (criterion 11)

---

### Requirement 11: Cost observability, token economics, and readiness gates

**User Story:** As a Solo_Operator, I want per-rail readiness and per-call cost
visible before I accept a payment, so that I never expose a half-configured rail and
never pay for hidden model calls.

**Journey stage:** JO-Trigger, JO-Complete, JO-Return

**Lens fit:** min-viable-max-value - one gate per rail replaces manual checklists.
TCO-zero - checks are local commands with no metered call. Token economics - the gate
asserts a zero-token payment path. Harness-first - the cost log is mandatory output,
not optional telemetry.

#### Acceptance Criteria

1. THE Cost_Observer SHALL emit one cost log entry per provider call containing the
   Rail, the operation, the provider request identifier where available, the outcome,
   and the elapsed milliseconds.
2. THE Payment_Trust_Boundary SHALL make zero model calls during rail selection,
   intent creation, event ingestion, reconciliation, and record serialization, and
   THE Cost_Observer SHALL report a model cost of `0.00` for those operations.
3. WHERE a model call supports an optional payment-adjacent explanation, THE
   Payment_Trust_Boundary SHALL run it behind a harness with a typed input schema, a
   typed output schema, a per-call cost log, and a fallback that returns the
   deterministic record unchanged.
4. THE Readiness_Gate SHALL report, per Rail, the required credential names, whether
   each credential is present in server-side secret storage, and whether any
   credential name appears in visible configuration.
5. WHEN the Readiness_Gate runs, THE Readiness_Gate SHALL make no configuration
   change and SHALL exit non-zero when any required input for an enabled Rail is
   missing.
6. THE Readiness_Gate SHALL report a Rail as ready only when an authenticated
   Sandbox_Mode payment on that Rail has reached `paid`, provider state was read, and
   its Payment_Record_Document round trip passed. Other Provider_Terminal_State
   outcomes and Reconciliation_Stopped_State are diagnostic evidence and SHALL NOT
   establish readiness.
7. THE Readiness_Gate SHALL independently report the configured Stripe request API
   version and webhook endpoint API version, plus the configured StraitsX integration
   model, `STRAITSX_FUND_FLOW`, and granted products, plus the three
   `PAYMENT_BUYER_PRODUCT_*` authority inputs, in its output.
8. THE Agentic OS read views SHALL expose payment rail readiness and the payment cost
   ledger without mutating payment state and without issuing a model call.
9. THE local source rung SHALL pass only when a repository-owned evaluator has
   actually executed its exact allowlisted focused suite inventory, every suite has
   exited successfully with a non-zero test count, and the resulting attestation is
   bound to the same source-evidence digest inspected by the Readiness_Gate. Editable
   manifest claims and caller-authored attestation JSON SHALL NOT establish this rung.
10. THE provider sandbox, browser, protected integration, production mirror, and
    deployment rungs SHALL remain separate from the local source rung. Passing local
    VCCs SHALL NOT promote any of those rungs.
11. A successful StraitsX Say Hello request SHALL establish only sandbox
    connectivity and API-key authentication. It SHALL NOT establish Payment API
    grants, callback authenticity, provider-state settlement, or rail readiness.
12. THE runtime readiness snapshot SHALL expose `admissionRails` separately from
    proof-complete `rails`. `admissionRails` SHALL omit only paid-settlement evidence
    so the first fully configured Sandbox_Mode payment can be attempted; `rails`
    SHALL remain false until criterion 6 is satisfied. A true admission entry SHALL
    NOT establish local `runtime-ready`, provider readiness, browser readiness,
    protected integration, mirror publication, or deployment readiness.

**Verifiable Completion Conditions**

- `Verify every provider call in a recorded run has exactly one cost log entry with the five named fields` (criterion 1)
- `Verify a full intent-to-settlement run reports a model cost of 0.00 and zero model calls` (criterion 2)
- `Verify the readiness gate output lists required credential names per rail, performs zero writes, and exits non-zero when a required input is absent` (criteria 4, 5)
- `Verify a rail without an authenticated paid sandbox payment, provider-state read, and record round trip is reported as not ready` (criterion 6)
- `Verify the gate output independently names both Stripe API-version pins, the StraitsX integration model, fund flow, and granted products, and all three server buyer-product inputs` (criterion 7)
- `Verify the payment read views return typed output with zero state mutation and zero model calls` (criterion 8)
- `Verify the repository-owned local VCC evaluator executes its exact allowlist, rejects zero-test or failed suites, binds the result to the current source-evidence digest, and cannot be replaced by caller-authored JSON` (criterion 9)
- `Verify a passing local attestation leaves provider sandbox, browser, protected integration, mirror, and deployment claims unchanged` (criterion 10)
- `Verify a successful Say Hello result cannot promote StraitsX readiness without product grants, authenticated callback evidence, provider read, and paid settlement evidence` (criterion 11)
- `Verify configuration-complete admissionRails can permit the first sandbox attempt while proof-complete rails stays false, and verify admission never promotes any local runtime-ready or delivery rung` (criterion 12)

---

### Requirement 12: Data minimization, compliance boundary, and release boundary

**User Story:** As a Solo_Operator, I want the payments capability to hold as little
regulated data as possible and to stay inside Dev authority, so that compliance
exposure and release risk stay bounded.

**Journey stage:** JO-Discover, JO-Return

**Lens fit:** min-viable-max-value - the smallest data footprint that still supports
audit. TCO-zero - no added storage. Token economics - no payment data enters a model
prompt. Harness-first - data classes are declared at the boundary, not discovered
later.

#### Acceptance Criteria

1. THE Payment_Trust_Boundary SHALL store no card number, card verification value,
   or full bank account number in any AgenticGraph store.
2. THE Payment_Trust_Boundary SHALL delegate buyer identity verification to the
   selected provider, noting that StraitsX documents customer profiles and KYC
   compliance as provider-side capabilities
   ([StraitsX API guides](https://docs.straitsx.com/docs/introduction)).
3. THE Payment_Trust_Boundary SHALL exclude email addresses and personal identifiers
   from Provider_Idempotency_Keys and from provider metadata, per Stripe guidance on
   idempotency keys and metadata
   ([Idempotent requests](https://docs.stripe.com/api/idempotent_requests),
   [Metadata](https://docs.stripe.com/api/metadata)).
4. THE Payment_Trust_Boundary SHALL send no payment record field into a model prompt.
5. THE public payment status response SHALL contain the intent identifier, the state,
   the amount in minor units, and the currency, and SHALL omit provider customer
   identifiers, provider metadata, and hosted payment URLs.
6. WHILE Sandbox_Mode is configured, THE Payment_Trust_Boundary SHALL reject a
   live-mode credential and SHALL record a typed `mode_mismatch` result.
7. THE payments capability SHALL make no change to the production mirror and no
   Cloudflare deployment without a separate explicit release instruction.
8. THE payments capability SHALL add no second payment Worker, no second payment
   store, and no duplicate payment settings registry.

**Verifiable Completion Conditions**

- `Verify no store schema field can hold a card number, CVV, or full bank account number, and a planted value is rejected` (criterion 1)
- `Verify no idempotency key or provider metadata value in a generated run contains an email address or personal identifier across 100 generated records` (criterion 3)
- `Verify no payment record field appears in any model prompt in a recorded run` (criterion 4)
- `Verify the public status response contains exactly the four permitted fields` (criterion 5)
- `Verify a live-mode credential under Sandbox_Mode returns mode_mismatch and contacts no provider` (criterion 6)
- `Verify the change set touches no production mirror path and no Cloudflare deployment target, and introduces no second payment worker, store, or settings registry` (criteria 7, 8)

---

### Requirement 13: Existing Paywall invocation and lifecycle control

**User Story:** As a Buyer_SG, I want one existing Paywall to show and stop the
whole agentic purchase lifecycle, so that no hidden or duplicate payment surface can
move money.

**Journey stage:** JX-Trigger, JX-Return

#### Acceptance Criteria

1. WHEN a trusted host supplies one valid purchase envelope, THE Payment_Surface
   SHALL open the single existing Paywall under one lifecycle identifier and SHALL
   project Funding, Discovery, Issuance, and Execution in order.
2. THE purchase envelope SHALL bind allowed HTTPS merchant origins, item constraints,
   quantity `1`, maximum total in SGD minor units, and an expiry no more than 24 hours
   after invocation.
3. BEFORE the first financial approval, hidden, closed, cancelled, malformed,
   page-originated, or unapproved invocation SHALL produce zero provider and zero
   financial calls.
4. AFTER financial state exists, cancellation SHALL block every new spend-bearing
   call and later phase while allowing only reservation release, provider reads,
   outcome reconciliation, authorization blocking, and safe card closure.
5. THE implementation SHALL add no second Paywall, top-level panel, payment
   controller, Worker, D1 binding, or payment store.
6. THE four phases, their state, and one next action SHALL fit a 375 by 812 CSS-pixel
   viewport without horizontal overflow.

**Verifiable Completion Conditions**

- `Verify one trusted direct-import instruction mounts exactly one existing Paywall and one lifecycle identifier, while page events, query parameters, postMessage, malformed input, hidden/closed state, and cancellation cannot invoke a provider or financial adapter` (criteria 1-3)
- `Verify Funding, Discovery, Issuance, and Execution plus their next actions render through the existing Paywall at 375 pixels without a second controller or store` (criteria 1, 5, 6)
- `Cancel a lifecycle at every phase and verify no new spend-bearing call occurs; before financial state the call count stays zero, and afterward only the five allowlisted cleanup classes can continue` (criterion 4)

---

### Requirement 14: KYC-bound XSGD funding on Avalanche C-Chain

**User Story:** As a Buyer_SG, I want an approved XSGD amount credited to my
KYC-verified account exactly once, so that the card cannot be funded from a wrong
network, token, address, or signer.

**Journey stage:** JX-Funding

#### Acceptance Criteria

1. BEFORE egress, THE Funding_Adapter SHALL validate a provider-confirmed
   KYC-verified account, the granted XSGD product, Avalanche C-Chain ID `43114`, the
   account-returned deposit address, the provider-supported XSGD token contract,
   external signer authority, gas readiness, approved amount, and provider-credit
   authority.
2. A token contract address SHALL never be accepted as the destination deposit
   address, and AgenticGraph SHALL never store a private key, seed phrase, or raw signed
   transaction.
3. ONE funding key SHALL create at most one transfer identity and one local funding
   reservation under concurrent replay and restart.
4. Funding SHALL complete only after both an accepted on-chain receipt and an
   authoritative provider balance read confirm the expected XSGD credit.
5. Wrong network, token, destination, KYC state, grant, amount, gas, or signer state
   SHALL return a typed unavailable result before signer or provider egress.
6. Cancellation or failure before authorization SHALL release the unused local
   reservation exactly once. Credited XSGD SHALL remain in the buyer's provider
   account; AgenticGraph SHALL create no automatic return transfer.

**Verifiable Completion Conditions**

- `Corrupt each funding tuple field independently and verify zero signer, broadcast, or provider calls; verify Avalanche chain 43114 and XSGD are fixed source values rather than caller authority` (criteria 1, 2, 5)
- `Replay one funding key 100 times across a runtime restart and verify one durable reservation, one transfer identity, and no duplicated provider credit` (criterion 3)
- `Verify an accepted chain receipt without matching provider credit remains blocked, and cancellation releases one local reservation while returnTransferCreated remains false` (criteria 4, 6)
- `Verify private-key, seed-phrase, raw-transaction, deposit-address, and KYC-payload canaries cannot enter the client snapshot, general store, log, receipt, or model input` (criterion 2)

---

### Requirement 15: Bounded e-commerce discovery

**User Story:** As a Buying_Agent, I want to locate one conforming item within
explicit bounds, so that merchant content cannot expand the purchase or tool scope.

**Journey stage:** JX-Discovery

#### Acceptance Criteria

1. THE Commerce_Discovery_Harness SHALL treat merchant content only as untrusted data
   and SHALL keep allowed origins, item constraints, quantity, budget, currency,
   expiry, approval policy, and tool access immutable.
2. Deterministic DOM and structured-data extraction SHALL run before any model call.
3. ONE discovery run SHALL visit at most five product pages, perform at most twelve
   browser actions, and make at most two model calls.
4. EVERY model call SHALL have exactly one persisted cost entry; a missing cost write
   SHALL abort before another action.
5. A candidate SHALL contain only merchant origin, canonical product URL,
   product/variant, quantity, item amount, shipping, tax, total, currency,
   observation time, and evidence selectors, and SHALL remain within the envelope.
6. Unknown mandatory cost, price drift, blocked origin, prompt injection,
   cancellation, or no conforming item SHALL abort before the next browser/model
   action and SHALL create no card or authorization.

**Verifiable Completion Conditions**

- `Verify match, no-match, unknown-total, price-drift, blocked-origin, injection, and cancellation fixtures against the immutable envelope` (criteria 1, 5, 6)
- `Verify five-page, twelve-action, and two-model-call ceilings and one cost row per model call; a missing row aborts` (criteria 2-4)
- `Verify every failure returns a typed result and creates zero card and authorization records` (criterion 6)

---

### Requirement 16: Approval-bound disposable virtual-card issuance

**User Story:** As a Buyer_SG, I want one short-lived, single-purpose virtual card
bound to the candidate I approved, so that replay or merchant drift cannot create
unbounded spend.

**Journey stage:** JX-Issuance

#### Acceptance Criteria

1. THE Approval_Gate SHALL durably bind the lifecycle, envelope, candidate, amount,
   SGD currency, merchant policy, and an expiry no more than 30 minutes after issue.
2. AFTER final validation and BEFORE card creation, THE gate SHALL atomically consume
   the approval once; the consumed state SHALL survive restart and reject any changed
   or second lifecycle.
3. ONE lifecycle SHALL create at most one card reference and SHALL enforce the
   approved amount, currency, e-commerce, merchant, geography, time, expiry, and
   disposal policy through the union of provider-native controls and
   repository-owned remote-host authorization policy.
4. Missing Card Program grant/product/pool, weaker effective controls, changed
   candidate, or unavailable secure credential injection SHALL fail before a usable
   card exists.
5. The first authenticated provider authorization identity SHALL be atomically
   claimed and reserved once. An exact duplicate SHALL return the prior decision;
   every later competing identity, cancellation, or expiry SHALL be denied.
6. A card SHALL remain `closure_pending` while hold, capture, reversal, refund, or
   force-post risk exists and SHALL close exactly once when source-bound safety
   evidence permits it.
7. PAN, CVV, and full expiry SHALL never enter a model, general application store,
   log, screenshot, or receipt.

**Verifiable Completion Conditions**

- `Restart after approval registration, race 100 consumers, and verify exactly one durable consumption; expired or changed approval makes zero provider calls` (criteria 1, 2)
- `Race 100 identical issuance and authorization identities, verify one card/reservation, exact replay returns the prior result, and a competing identity conflicts` (criteria 3, 5)
- `Verify provider plus remote-host controls cover every approved restriction and weak, unavailable, changed, or exhausted fixtures create no usable card` (criteria 3, 4)
- `Verify closure stays pending while any local reservation is active, then closes once under replay, and card-field canaries never cross the secure boundary` (criteria 6, 7)

---

### Requirement 17: Secure checkout execution and terminal reconciliation

**User Story:** As a Buying_Agent, I want to complete exactly one approved checkout
and reconcile ambiguous outcomes, so that price drift or a timeout cannot trigger a
second card or order.

**Journey stage:** JX-Execution

#### Acceptance Criteria

1. ONLY an approved PCI-scoped Secure_Card_Broker SHALL inject card fields; the
   browser model, screenshots, telemetry, and general state SHALL not read them.
2. IMMEDIATELY before submission, THE agent SHALL revalidate merchant origin,
   product, variant, quantity, total, currency, delivery terms, and prohibited
   add-ons against the approved candidate.
3. Any mismatch SHALL stop before credential injection, checkout submission, or
   authorization reservation.
4. Buyer authentication SHALL be an explicit Paywall handoff and SHALL not be
   bypassed or simulated.
5. Success SHALL require agreement between an authoritative merchant order read and
   issuer result. Timeout or disagreement SHALL remain
   `purchase_outcome_unknown` and reconcile under the same lifecycle without another
   card or checkout.
6. Terminal success, failure, cancellation, or expiry SHALL block new
   authorizations, preserve `closure_pending` while financial risk exists, close once
   when safe, and write one minimized lifecycle receipt.

**Verifiable Completion Conditions**

- `Verify success, decline, price drift, add-on, origin change, authentication required, timeout, duplicate callback, merchant-only, issuer-only, cancellation, expiry, hold, capture, reversal, refund, and force-post fixtures` (criteria 2-6)
- `Verify mismatches create zero credential injection, submissions, or reservations; uncertain outcomes create no second card or checkout` (criteria 1-5)
- `Verify terminal outcomes block new authorization immediately, safe-close occurs once, and one minimized receipt links only opaque funding, candidate, card, authorization, order, cost, and disposal references` (criterion 6)

---

## Scope Boundaries

### In scope

- A rail-selection contract covering two rails: Stripe and StraitsX.
- Stripe card and global consumer collection through hosted Checkout with
  deterministic idempotency keys.
- StraitsX SGD fiat collection under one configured integration model, plus XSGD
  stablecoin acceptance only when its exact endpoint, network, settlement path, and
  account grant are independently ready.
- Authenticated, replay-safe ingestion of Stripe webhook events and StraitsX
  callbacks.
- A client-owned offline intent queue and a provider-authoritative Reconciler.
- A serialized Payment_Record_Document with a parser, a printer, and a round-trip
  guarantee.
- A mobile-first buyer payment surface with explicit states.
- One implicit server-owned buyer product defined by the three
  `PAYMENT_BUYER_PRODUCT_*` variables.
- Agent discovery, approval-gated payment tools, and federation of the hosted Stripe
  MCP transport.
- Typed failures, refunds on the settling rail, per-rail readiness gates, and a
  per-call cost log.
- Sandbox_Mode operation inside the Dev runtime.
- A fail-closed local lifecycle for Funding, Discovery, Issuance, and Execution
  projected through the existing Paywall.
- Shared envelope/candidate/readiness contracts, same-D1 lifecycle safety records,
  replay-safe approval/authorization/reservation primitives, and a read-only
  `agentic_purchase_readiness` OS status view.

### Out of scope

- Subscriptions, recurring billing, invoicing schedules, and dunning.
- Marketplace flows, connected-account fund splitting, and platform fee capture.
- AgenticGraph custody of buyer funds, a AgenticGraph-operated wallet, or a AgenticGraph-operated
  exchange.
- Stripe Treasury agentic finance tools for moving money, paying bills, or issuing
  cards ([Stripe MCP](https://docs.stripe.com/mcp)).
- StraitsX Payout, Swap, and FX flows beyond the Could tier.
- A multi-product catalog, entitlement catalog, caller-selected price, or
  capability-id routing.
- Tax calculation, invoicing compliance, and accounting system integration.
- A custom card-entry form or any component that touches raw card data.
- A second payment Worker, a unified proxy gateway tier, or a second payment store.
- Production mirror publication and Cloudflare deployment.
- Live-mode payments; this increment is Sandbox_Mode only.
- Provider-backed XSGD transfer, Card Program issuance, raw card credential handling,
  third-party merchant checkout, and public external invocation until OQ-9 and
  OQ-17 through OQ-24 close with separately authorized evidence.

---

## Dependencies

| Dependency | Class | Justification |
|---|---|---|
| Existing `agenticgraph-payment` Cloudflare Worker and its D1 binding | Zero-TCO (existing free-tier binding) | Already the payment trust boundary; reuse avoids a new tier. |
| Existing shared payment SSOT modules (`stripePaymentSsot`, `stripeMcpSsot`, `straitsxPaymentSsot`, `paymentBuyerProductSsot`, `agenticCommerceSsot`) | FOSS / repository-owned | Route, credential-name, provider-contract, fund-flow, buyer-product, and MCP configuration authority already exists; duplicating it would split ownership. |
| Existing external-tool Approval_Gate owner | FOSS / repository-owned | Spend authorization must not be reimplemented per rail. |
| Existing MainPanel Commerce surface | FOSS / repository-owned | Payments remains a Commerce subsection, per `agenticgraph-mainpanel-commerce-prd-tad.md`. |
| Stripe API and hosted Checkout | Proprietary, justified inline | No FOSS alternative provides global card acquiring. Cost is per-transaction and variable; fixed monthly TCO stays $0. Chosen because Stripe recommends Checkout Sessions for most integrations and documents idempotency and signed webhooks ([Stripe API](https://docs.stripe.com/api)). |
| Stripe MCP hosted server (`https://mcp.stripe.com`) | Proprietary, justified inline | Only first-party MCP surface for the Stripe account. Federated as an optional transport behind human confirmation; excluding it would require a bespoke tool layer. The Public Preview `get_balance_summary` Treasury tool is excluded ([Stripe MCP](https://docs.stripe.com/mcp)). |
| StraitsX API (sandbox first) | Proprietary, justified inline | Regulated SGD rails, PayNow, and XSGD issuance have no FOSS substitute. Access depends on an approved use case and integration model ([StraitsX API guides](https://docs.straitsx.com/docs/introduction)). |
| Browser-local storage for the Intent_Queue | FOSS / platform | Zero egress while offline; no new service. |

---

## Open Questions

Open questions use one shared `OQ-N` identifier space with the companion PRD/TAD at
`docs/documents/agenticgraph-payments-prd-tad.md`. An id means the same question in both
documents, so a resolution recorded against `OQ-7` here closes `OQ-7` there. Ids are
never reused or renumbered once assigned; a withdrawn question keeps its id and is
marked resolved.

This document owns the requirements-layer questions below, including `OQ-16` through
`OQ-22` and `OQ-25`.
`OQ-4`, `OQ-5`, `OQ-13`, `OQ-14`, and `OQ-15` are design-layer questions owned by
the companion PRD/TAD. `OQ-23` and `OQ-24` are follow-on design questions owned by
that document. Those ids are intentionally absent here; gaps in the sequence are
expected rather than defects.

- **OQ-1 - StraitsX commercial pricing.** Transaction, FX, and network fee schedules are
  not in the referenced documentation. Required before the revenue model in the
  companion PRD/TAD can be completed.
- **OQ-2 - StraitsX integration model.** Confirm whether Regular Transfer, First Party
  Transfer, or Third Party Transfer matches a solo-operator collecting payments for its
  own product ([StraitsX API guides](https://docs.straitsx.com/docs/introduction)).
- **OQ-3 - StraitsX MCP surface.** No MCP server is described in the referenced StraitsX
  documentation. Confirm whether one exists before promising parity with the Stripe MCP
  transport.
- **OQ-6 - StraitsX callback authenticity beyond source addresses (resolved).**
  The current provider contract uses `Xfers-Signature` as an HMAC-SHA256 over the
  exact raw callback body, applies the documented source-address allowlist before
  parsing, and requires a provider-state read before settlement. R5 owns all three
  checks; callback payload alone is never settlement authority.
- **OQ-7 - StraitsX idempotency semantics (resolved conservatively).** The current
  contract owns one stable provider operation key for the logical payment and uses a
  provider-state read before any retry after an indeterminate outcome. A new
  provider operation SHALL NOT be minted merely because the first response was lost.
- **OQ-8 - Source-address verification inside a Cloudflare Worker (resolved).** The
  callback ingress reads the platform-authenticated `CF-Connecting-IP` value,
  allowlists the documented provider addresses before parsing, and then verifies the
  raw-body HMAC. A secret URL segment would duplicate the HMAC secret boundary and is
  not added.
- **OQ-9 - XSGD inbound acceptance path.** Confirm whether the Blockchain API
  deposit-address method is the supported way to accept inbound XSGD for a collection,
  and which networks are enabled for the account via the supported-blockchains method.
- **OQ-10 - Dynamic PayNow account grant for the first increment.** The local
  reference implementation binds only the dynamic PayNow create/read paths and
  nested response shape. Whether the approved OQ-2 integration model grants
  `dynamic_paynow` remains external provider evidence; configuration stays disabled
  and makes zero provider calls until that grant is recorded. Virtual bank account
  and persistent PayNow remain outside this implementation contract.
- **OQ-11 - Stripe API versions to pin (resolved).** The existing repository owner
  `grph-shared/src/payments/stripePaymentSsot.ts` independently owns the request API
  version and webhook endpoint API version. Runtime readiness reads both owners and
  does not replace either with a documentation-page "current" version.
- **OQ-12 - Intent_Queue durability medium (resolved).** The queue extends the
  existing browser-local AgenticGraph storage owner with an explicit maximum depth of
  100. At capacity it rejects the new enqueue and preserves every existing record;
  it does not introduce a second browser store or silently evict unresolved intent.
- **OQ-16 - Exact StraitsX refund operation.** The inspected official sources do not
  establish an exact refund endpoint, eligibility rule, account grant, or idempotency
  contract. Until all four are bound, R10 returns
  `provider_operation_unverified` with zero provider calls for a StraitsX paid-record
  refund.
- **OQ-17 - Card Program grant.** Confirm the issuer group, plan, instant virtual-card
  product, funding source, account currency, card pool, KYC/cardholder model, 3DS
  method, sandbox hosts, and credential grants.
- **OQ-18 - XSGD-to-card settlement bridge.** Obtain the provider-approved contract
  that moves Avalanche-credited XSGD into the authoritative card settlement balance.
- **OQ-19 - Secure card credential broker.** Select an approved provider-hosted or
  PCI-scoped injection mechanism that keeps PAN, CVV, and expiry outside AgenticGraph
  models, screenshots, logs, and general state.
- **OQ-20 - Merchant golden-path fixture.** Approve one sandbox merchant origin,
  product, terms/robots posture, checkout field contract, shipping/tax behavior, 3DS
  path, CAPTCHA behavior, and authoritative order-read contract.
- **OQ-21 - One-use authorization and disposal policy.** Bind holds, completions,
  reversals, partial captures, refunds, duplicates, concurrency, merchant retries,
  force-post transactions, and the exact safe-close point.
- **OQ-22 - Provider-inclusive economics.** Record card setup, issuance,
  authorization, settlement, blockchain, FX, reserve, dispute, PCI, and model costs
  and recompute the 12-month TCO/ROI comparison before live enablement.
- **OQ-25 - Provider onboarding TTV.** Measure zero-state time to issuer group, card
  product, KYC user, XSGD funding, activation, and sandbox transaction separately
  from the steady-state buyer flow.

## Assumptions

1. The existing `agenticgraph-payment` Worker remains the only server-side payment trust
   boundary; this increment extends it rather than replacing it.
2. Stripe hosted Checkout, ACP checkout sessions, x402 probes, and Solana Pay
   settlement remain owned by `agenticgraph-agentic-commerce-prd-tad.md`; this spec adds
   rail selection, the StraitsX rail, offline queueing, and record serialization on
   top of them.
3. A Stripe account with sandbox access is available; a StraitsX sandbox account is
   obtainable for the same operator.
4. All amounts are handled as integer minor units, and no floating-point arithmetic
   participates in a payment amount.
5. Payment provider fees are treated as variable cost of revenue and are excluded from
   the monthly TCO figures in Success Metrics.
6. Sandbox_Mode is sufficient for card-program and merchant validation, but the
   documented StraitsX XSGD deposit-address flow is production-only. Any
   provider-backed Funding proof therefore requires separate financial authority and
   does not authorize mirror publication or Cloudflare deployment.

---

## Source References

- Stripe API reference, authentication, errors, idempotent requests, metadata,
  request IDs, connected accounts, versioning: <https://docs.stripe.com/api>
- Stripe webhook signature verification: <https://docs.stripe.com/webhooks/signature>
- Stripe Checkout Sessions API: <https://docs.stripe.com/payments/checkout-sessions>
- Stripe Create a Checkout Session: <https://docs.stripe.com/api/checkout/sessions/create>
- Stripe Model Context Protocol server: <https://docs.stripe.com/mcp>
- StraitsX API guides and integration models: <https://docs.straitsx.com/docs/introduction>
- StraitsX API reference, authentication headers, sandbox base URL: <https://docs.straitsx.com/reference/say-hello>
- StraitsX webhooks and callback source addresses: <https://docs.straitsx.com/reference/webhooks>
- XSGD stablecoin: <https://www.straitsx.com/xsgd>
- Avalanche C-Chain integration: <https://build.avax.network/docs/primary-network/exchange-integration>
- AvalancheGo FOSS reference: <https://github.com/ava-labs/avalanchego>

Content from the sources above was paraphrased and summarized for compliance with
licensing restrictions.
