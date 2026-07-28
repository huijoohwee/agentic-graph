---
title: "Knowgrph Payments - Requirements"
doc_type: "Requirements"
id: "knowgrph-payments-requirements"
spec: "knowgrph-payments"
version: "0.1.0"
status: "requirements-draft"
created: "2026-07-28"
updated: "2026-07-28"
author: "airvio / joohwee"
domain: "knowgrph"
lang: "en-US"
frontmatter_contract: "required"
companion_document: "docs/documents/knowgrph-payments-prd-tad.md"
companion_document_state: "empty; to be populated in the design phase"
guidelines: "huijoohwee.github.io/guidelines/prd-tad-guidelines.md"
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
  - "docs/documents/knowgrph-agentic-commerce-prd-tad.md"
  - "docs/documents/knowgrph-mainpanel-commerce-prd-tad.md"
  - "docs/documents/knowgrph-api-reference/knowgrph-stripe-api-reference.md"
  - "grph-shared/src/payments/stripePaymentSsot.ts"
  - "grph-shared/src/payments/stripeMcpSsot.ts"
  - "grph-shared/src/payments/agenticCommerceSsot.ts"
  - "cloudflare/workers/knowgrph-payment"
---

# Requirements Document

## Introduction

Knowgrph needs one payments capability with two payment rails: Stripe for card and
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
`docs/documents/knowgrph-agentic-commerce-prd-tad.md` and
`docs/documents/knowgrph-mainpanel-commerce-prd-tad.md`. The genuinely new surface
area in this spec is: an explicit rail-selection contract, the StraitsX rail, an
offline intent queue with reconnect reconciliation, a serialized payment record and
receipt projection with a round-trip guarantee, and a stated agent-platform
readiness posture for payment tools.

Provider behavior in the acceptance criteria is grounded in the published provider
documentation cited inline. Where a provider detail could not be confirmed from the
documentation, it is recorded under Open Questions rather than assumed.

### Authority and Scope

This file is the normative requirements source of truth for the Knowgrph Payments
capability. The companion PRD/TAD at
`docs/documents/knowgrph-payments-prd-tad.md` is currently empty and is populated in
the design phase; it will carry architecture, topology, ADRs, and harness contracts.
`design.md` maps these requirements to repository owners and `tasks.md` sequences
delivery.

This increment carries development authority only. Production mirror publication and
Cloudflare deployment require a separate explicit instruction.

### Compounding Lens Commitments

| Lens | Product rule for payments | Requirement anchors |
|---|---|---|
| Min-viable-max-value | One rail-selection contract, two rails, one ledger record. No storefront, no subscriptions, no marketplace split in this increment. | R2, R3, R4, R7 |
| TCO-zero | Payment routing runs on the existing Cloudflare Worker and D1 free-tier bindings; no new persistent store, no new proxy tier, no metered egress by default. Provider transaction fees are variable cost of revenue, not fixed TCO. | R1, R9, R11 |
| Token economics | The payment path performs zero model calls. Any model use stays outside settlement and carries a cost log. | R11 |
| Harness-first | Every provider call is a typed request with a typed result and a cost log; agent-initiated spend routes through an approval gate. | R9, R11 |

---

## Glossary

- **Payment_Trust_Boundary**: The server-side execution context that holds payment
  provider credentials and is the only component permitted to call a provider API.
  Realized by the existing `knowgrph-payment` Cloudflare Worker.
- **Payment_Client**: The browser-first, local-first Knowgrph canvas surface. Holds
  no payment credential.
- **Rail**: One provider-backed settlement path. This increment defines exactly two:
  `stripe` and `straitsx`.
- **Rail_Router**: The component inside the Payment_Trust_Boundary that selects
  exactly one Rail per payment intent from stated inputs.
- **Stripe_Rail**: Card and global consumer settlement through the Stripe API
  ([Stripe API reference](https://docs.stripe.com/api)).
- **StraitsX_Rail**: SGD fiat and XSGD stablecoin settlement through the StraitsX API
  ([StraitsX API guides](https://docs.straitsx.com/docs/introduction)).
- **Payment_Intent_Record**: The Knowgrph-owned record of a requested payment. Local
  identity, amount in minor units, currency, selected Rail, intent state, and
  Client_Intent_Key. Distinct from any provider object.
- **Client_Intent_Key**: A client-generated UUID that identifies one buyer purchase
  attempt across retries, reconnects, and rail changes.
- **Provider_Idempotency_Key**: The key sent to a provider so a retried create
  request does not create a second provider object.
- **Intent_Queue**: The Payment_Client-owned durable queue of Payment_Intent_Records
  created while the Payment_Client has no network path to the
  Payment_Trust_Boundary.
- **Reconciler**: The component that resolves each queued or in-flight
  Payment_Intent_Record to a terminal state by reading provider state.
- **Event_Ingestor**: The component that receives, authenticates, deduplicates, and
  applies provider event callbacks.
- **Provider_Event**: One inbound callback from a provider. A Stripe webhook event or
  a StraitsX callback.
- **Payment_Record_Document**: The serialized, human-readable projection of terminal
  payment records used for local inspection and receipts.
- **Record_Serializer**: The component that writes a Payment_Record_Document.
- **Record_Parser**: The component that reads a Payment_Record_Document back into
  Payment_Intent_Records.
- **Payment_Surface**: The buyer-facing Knowgrph surface that starts a payment and
  displays payment state.
- **Agent_Payment_Surface**: The machine-readable discovery and tool surface through
  which an external agent learns about and initiates payment.
- **Approval_Gate**: The existing external-tool approval owner that authorizes a
  spend-bearing or money-moving tool call before it executes.
- **Readiness_Gate**: The command-invoked check that reports whether a Rail is
  configured well enough to accept a payment.
- **Cost_Observer**: The component that records a per-call cost log entry for
  provider and model calls.
- **Sandbox_Mode**: Provider test environments. Stripe sandboxes
  ([Stripe API reference](https://docs.stripe.com/api)) and the StraitsX sandbox base
  URL `https://api-sandbox.straitsx.com/v1`
  ([StraitsX Say Hello](https://docs.straitsx.com/reference/say-hello)).
- **Terminal_State**: One of `paid`, `no_payment_required`, `failed`, `expired`, or
  `cancelled`.

---

## User Journeys

Every user story below is anchored to one stage in one of these three journeys.

### Journey JB: Buyer_SG - complete a purchase with an unreliable connection

| Stage | Action | Touchpoint | Pain point | Opportunity |
|---|---|---|---|---|
| JB-Trigger | Buyer decides to unlock a paid Knowgrph capability | Payment_Surface | Unclear which currency and method apply | Rail chosen from locale and currency without asking |
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
| JO-Complete | Operator observes a confirmed sandbox payment | Payment_Surface plus Readiness_Gate | No end-to-end proof | Sandbox payment reaches Terminal_State |
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
| First-value action | A sandbox payment reaches a Terminal_State and the Payment_Surface reflects it | - | Observable state transition plus Payment_Record_Document entry |
| Persona | Solo_Operator, Buyer_SG, Buying_Agent | - | Defined in User Journeys |

Operator TTV excludes provider account approval time, which is outside Knowgrph
control. StraitsX access depends on an approved use case and integration model
([StraitsX API guides](https://docs.straitsx.com/docs/introduction)); that wait is
tracked as an Open Question, not as TTV.

---

## Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---|---|---|
| Rails reaching a confirmed sandbox payment | 1 (Stripe, already implemented) | 2 (Stripe plus StraitsX) | Increment 1 |
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
| Won't (this increment) | Custody of buyer funds or a Knowgrph-operated wallet | - | - | - | - | - | - |
| Won't (this increment) | Stripe Treasury agentic finance tools | - | - | - | - | - | - |
| Won't (this increment) | A second payment Worker, proxy tier, or payment store | - | - | - | - | - | - |

**Min-viable scope**: the ten Must rows. Two rails, one selection contract, one
replay-safe settlement path, one queue, one serialized record, one readiness gate per
rail, all in Sandbox_Mode inside the Dev runtime.

---

## Agent-Platform Readiness

| Dimension | In scope | Position |
|---|---|---|
| Agentic OS-ready | Yes | Payment rail readiness and the payment cost ledger are exposed as read-only views over state that already exists. Zero model calls per view. No payment write path from the status surface. |
| AI Agent-ready | Yes | Discovery of the payment capability and its typed contracts costs zero model tokens. Execution routes through the existing Approval_Gate. |
| MCP Gateway-ready | Yes | The hosted Stripe MCP server at `https://mcp.stripe.com` is federated as one external transport alongside existing Knowgrph transports ([Stripe MCP](https://docs.stripe.com/mcp)). No new monolithic proxy tier is introduced. |
| Stripe Treasury agentic finance tools | No | Excluded this increment; money-movement and card-issuing tools are out of scope. |
| A StraitsX MCP server | No | No MCP server is described in the referenced StraitsX documentation. Recorded under Open Questions. |

Stripe documents its MCP server as a public preview and recommends enabling human
confirmation of tools and exercising caution about prompt injection when combining it
with other servers ([Stripe MCP](https://docs.stripe.com/mcp)). Both points are
binding constraints in R9.

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

1. THE Payment_Trust_Boundary SHALL be the only Knowgrph component that sends a
   payment provider credential to a provider API.
2. THE Payment_Client SHALL request payment operations from the
   Payment_Trust_Boundary over HTTPS and SHALL hold no provider credential in
   source, bundle output, local storage, or URL.
3. THE Payment_Trust_Boundary SHALL read Stripe credentials from server-side secret
   storage, using a restricted key where the operation permits one, because Stripe
   documents that secret and restricted keys must not be embedded in source or
   client-side applications and that requests without authentication over plain HTTP
   fail ([Stripe authentication](https://docs.stripe.com/api/authentication)).
4. THE Payment_Trust_Boundary SHALL read StraitsX credentials from server-side secret
   storage and SHALL send `X-XFERS-APP-API-KEY` on every StraitsX request, which
   StraitsX documents as a mandatory header for all authentication methods
   ([StraitsX Say Hello](https://docs.straitsx.com/reference/say-hello)).
5. WHERE StraitsX HTTP request signing is enabled for the account, THE
   Payment_Trust_Boundary SHALL additionally send `X-PUBLIC-KEY-ID`, `X-TIMESTAMP`
   within 300 seconds of provider server time, a per-request UUID `X-NONCE`, and a
   base64 `X-SIGNATURE` over the canonical request string
   ([StraitsX Say Hello](https://docs.straitsx.com/reference/say-hello)).
6. IF a build or check finds a provider secret name or secret value in
   Payment_Client bundle output or in visible Worker variables, THEN THE
   Readiness_Gate SHALL report a failure and SHALL leave configuration unchanged.
7. THE Payment_Trust_Boundary SHALL pin one Stripe API version per deployment,
   because Stripe releases named versions that are not backward compatible across
   major releases ([Stripe versioning](https://docs.stripe.com/api/versioning)).

**Verifiable Completion Conditions**

- `Verify a repository check reports zero occurrences of Stripe or StraitsX secret names and values in Payment_Client bundle output and in visible Worker vars, and the check exits non-zero when a secret name is planted in either location` (criteria 1, 2, 6)
- `Verify every outbound StraitsX request built by the trust boundary carries X-XFERS-APP-API-KEY, and that the signed-mode builder additionally emits X-PUBLIC-KEY-ID, X-TIMESTAMP, X-NONCE, and X-SIGNATURE with a fresh nonce per request` (criteria 4, 5)
- `Verify the configured Stripe API version is read from one owner and appears in every outbound Stripe request` (criterion 7)

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

1. THE Rail_Router SHALL select exactly one Rail for each Payment_Intent_Record from
   the requested currency, the requested settlement asset, and the per-rail
   readiness status.
2. WHEN the requested currency is `sgd` and the requested settlement asset is fiat
   and the StraitsX_Rail is ready, THE Rail_Router SHALL select `straitsx`.
3. WHEN the requested settlement asset is `xsgd`, THE Rail_Router SHALL select
   `straitsx`, because XSGD is a StraitsX-issued stablecoin pegged one-to-one to the
   Singapore dollar ([XSGD](https://www.straitsx.com/xsgd)).
4. WHEN the requested currency is a card-settled currency other than `sgd`, THE
   Rail_Router SHALL select `stripe`.
5. WHILE exactly one Rail is ready, THE Rail_Router SHALL select that Rail and SHALL
   record the reason `only_ready_rail` in the Payment_Intent_Record.
6. IF no Rail is ready for the requested currency and settlement asset, THEN THE
   Rail_Router SHALL return a typed `rail_unavailable` result and SHALL create no
   provider object.
7. THE Rail_Router SHALL record the selected Rail identifier and the selection reason
   in the Payment_Intent_Record before any provider call is made.
8. WHEN the same selection inputs are supplied twice, THE Rail_Router SHALL return
   the same Rail identifier and the same selection reason.

**Verifiable Completion Conditions**

- `Verify a selection table test covers sgd fiat, xsgd, non-sgd card currency, single-ready-rail, and no-ready-rail cases and each case returns the documented rail identifier and reason` (criteria 1-6)
- `Verify the intent record persisted before any provider call already contains the rail identifier and selection reason` (criterion 7)
- `Verify repeated selection with identical inputs returns identical output across 100 generated input cases` (criterion 8)

---

### Requirement 3: Stripe rail intent creation and idempotency

**User Story:** As a Buyer_Global, I want a card payment I can retry safely, so that
a lost response never charges me twice.

**Journey stage:** JB-Engage

**Lens fit:** min-viable-max-value - hosted Checkout avoids building card UI and
keeps card data out of Knowgrph. TCO-zero - no added infrastructure. Token
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
6. THE Stripe_Rail SHALL store the Knowgrph Payment_Intent_Record identifier on the
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

**Verifiable Completion Conditions**

- `Verify a Stripe create call carries an Idempotency-Key of at most 255 characters derived from the Client_Intent_Key and containing no email or personal identifier` (criteria 2, 3)
- `Verify replaying the same create request with the same Client_Intent_Key yields exactly one Stripe object and one stored provider identifier` (criterion 4)
- `Verify a simulated idempotency_error response produces a typed intent_parameter_conflict result and no second provider object` (criterion 5)
- `Verify the persisted intent record contains the provider object id and the Request-Id for every Stripe call` (criteria 6, 7)
- `Verify an intent whose provider session has expired transitions to expired and unlocks nothing` (criterion 8)

---

### Requirement 4: StraitsX rail for SGD fiat and XSGD

**User Story:** As a Buyer_SG, I want to pay in SGD with PayNow or bank transfer, or
settle in XSGD, so that I am not forced onto a card rail.

**Journey stage:** JB-Discover, JB-Engage

**Lens fit:** min-viable-max-value - reuse StraitsX-hosted payment methods rather
than integrating a bank directly. TCO-zero - no added Knowgrph infrastructure; fees
are variable. Token economics - zero model calls. Harness-first - typed request,
typed result, cost log per provider call.

#### Acceptance Criteria

1. THE StraitsX_Rail SHALL operate under exactly one StraitsX integration model per
   deployment, recorded in configuration, because StraitsX defines First Party
   Transfer, Third Party Transfer, and Regular Transfer as distinct approved models
   with distinct endpoints
   ([StraitsX API guides](https://docs.straitsx.com/docs/introduction)).
2. WHEN the Rail_Router selects `straitsx` for an SGD fiat collection, THE
   StraitsX_Rail SHALL create the collection through a StraitsX Payment API method
   for the configured integration model, using a dynamic PayNow payment or a virtual
   bank account, both of which StraitsX documents as payment creation methods
   ([StraitsX Say Hello and API reference index](https://docs.straitsx.com/reference/say-hello)).
3. THE StraitsX_Rail SHALL present the returned StraitsX payment instruction to the
   Payment_Client without modification of the payment reference, amount, or
   destination account values returned by StraitsX.
4. WHERE the requested settlement asset is `xsgd`, THE StraitsX_Rail SHALL obtain the
   on-chain destination through the StraitsX Blockchain API deposit-address method and
   SHALL restrict the offered networks to the networks returned by the StraitsX
   supported-blockchains method
   ([StraitsX API reference index](https://docs.straitsx.com/reference/say-hello)).
5. THE StraitsX_Rail SHALL record the StraitsX payment identifier on the
   Payment_Intent_Record and SHALL treat the StraitsX GET payment method as the
   authority when local state and provider state disagree.
6. THE StraitsX_Rail SHALL send a per-attempt unique request reference so that a
   retried create attempt for one Client_Intent_Key can be recognized, and SHALL
   confirm the resulting payment count by reading provider state before recording a
   second attempt.
7. IF the configured StraitsX integration model does not permit the requested fund
   flow, THEN THE StraitsX_Rail SHALL return a typed `integration_model_unsupported`
   result and SHALL create no provider object.
8. THE StraitsX_Rail SHALL target the StraitsX sandbox base URL
   `https://api-sandbox.straitsx.com/v1` while Sandbox_Mode is configured
   ([StraitsX Say Hello](https://docs.straitsx.com/reference/say-hello)).

**Verifiable Completion Conditions**

- `Verify the configured StraitsX integration model is read from one owner and that a fund flow outside that model returns integration_model_unsupported with zero provider calls` (criteria 1, 7)
- `Verify an SGD fiat intent produces a StraitsX payment instruction whose reference, amount, and destination match the provider response byte-for-byte` (criteria 2, 3)
- `Verify an xsgd intent offers only networks present in the supported-blockchains response and rejects any other requested network` (criterion 4)
- `Verify a create retry for one Client_Intent_Key reads provider state before recording a second attempt and never records two paid payments for one intent` (criteria 5, 6)
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
3. WHEN a StraitsX callback arrives, THE Event_Ingestor SHALL accept the callback only
   from the StraitsX-documented source addresses `52.221.59.197` and `52.77.136.252`
   and SHALL confirm the referenced payment by reading StraitsX provider state before
   applying any settlement
   ([StraitsX Webhooks](https://docs.straitsx.com/reference/webhooks)).
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

**Verifiable Completion Conditions**

- `Verify an event with a tampered body or wrong signing secret is rejected with signature_verification_failed and zero state change` (criteria 1, 2)
- `Verify a StraitsX callback from an address outside the documented source addresses is rejected, and an accepted callback triggers a provider state read before settlement` (criterion 3)
- `Verify delivering the same event identity twice produces one settlement side effect and a success acknowledgement on the second delivery` (criteria 4, 5)
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
   `queued_offline`.
2. THE Payment_Client SHALL generate the Client_Intent_Key as a UUID once per buyer
   purchase attempt and SHALL reuse that key for every later submission of the same
   attempt.
3. WHEN the Payment_Trust_Boundary becomes reachable, THE Reconciler SHALL submit
   queued Payment_Intent_Records in the order they were created, one Client_Intent_Key
   at a time.
4. WHEN the Payment_Trust_Boundary receives a submission whose Client_Intent_Key is
   already recorded, THE Payment_Trust_Boundary SHALL return the existing
   Payment_Intent_Record and SHALL create no additional provider object.
5. THE Reconciler SHALL resolve every submitted Payment_Intent_Record to a
   Terminal_State by reading provider state, and SHALL not treat local queue state as
   evidence of payment.
6. IF a queued Payment_Intent_Record cannot reach a Terminal_State after a bounded
   number of reconciliation attempts, THEN THE Reconciler SHALL mark it
   `reconciliation_unresolved`, SHALL stop retrying that record, and SHALL surface an
   operator-visible entry.
7. THE Reconciler SHALL apply a bounded retry schedule with a stated maximum attempt
   count per Payment_Intent_Record.
8. WHILE a Payment_Intent_Record is not in a Terminal_State, THE Payment_Surface
   SHALL withhold the paid capability.
9. THE Payment_Client SHALL store no provider credential and no card or bank
   identifier in the Intent_Queue.

**Verifiable Completion Conditions**

- `Verify a payment requested with the trust boundary unreachable persists as queued_offline with a UUID Client_Intent_Key and survives a client reload` (criteria 1, 2)
- `Verify submitting the same Client_Intent_Key N times creates exactly one provider object across 100 generated interleavings` (criteria 3, 4)
- `Verify every reconciled record reaches a Terminal_State only from provider-read state, and queue state alone never unlocks capability` (criteria 5, 8)
- `Verify an unresolvable record stops retrying at the stated attempt bound and is reported as reconciliation_unresolved` (criteria 6, 7)
- `Verify the persisted queue contains no credential, card, or bank identifier field` (criterion 9)

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

1. WHEN a Payment_Intent_Record reaches a Terminal_State, THE Record_Serializer SHALL
   append one entry to the Payment_Record_Document containing the intent identifier,
   the Client_Intent_Key, the selected Rail, the amount in minor units, the currency,
   the settlement asset, the Terminal_State, the provider object identifier, and the
   terminal timestamp.
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

**Verifiable Completion Conditions**

- `Verify every terminal record produces exactly one document entry with all nine named fields populated` (criterion 1)
- `Verify parse then print is byte-identical for 100 generated valid documents` (criteria 3, 4)
- `Verify print then parse then print is byte-identical for 100 generated record sets` (criteria 2, 5)
- `Verify a malformed document yields a typed parse error naming the failing line and the file bytes are unchanged` (criterion 6)
- `Verify no entry contains a card number, bank account number, credential, email address, or provider customer identifier across 100 generated records` (criterion 7)
- `Verify the receipt view renders from local state with zero network requests` (criterion 8)

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
   `pending_provider`, `paid`, `no_payment_required`, `failed`, `expired`,
   `cancelled`, or `reconciliation_unresolved` for the active
   Payment_Intent_Record.
2. THE Payment_Surface SHALL display the amount in the requested currency, the
   selected Rail, and the payment method instruction for that Rail.
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

**Verifiable Completion Conditions**

- `Verify each of the nine states renders a distinct labelled state and the documented next action` (criteria 1, 2, 4, 6)
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
   assets, and the typed request and result schemas.
2. THE Agent_Payment_Surface SHALL serve discovery responses with zero model calls and
   a recorded model cost of zero.
3. WHEN an agent requests a payment-creating or money-moving tool call, THE
   Approval_Gate SHALL authorize the call before the Payment_Trust_Boundary contacts a
   provider.
4. IF an agent tool call has no valid approval, THEN THE Payment_Trust_Boundary SHALL
   reject the call, SHALL create no provider object, and SHALL record a zero-cost
   rejection entry.
5. WHERE the hosted Stripe MCP server is federated, THE Agent_Payment_Surface SHALL
   register it as one external transport at `https://mcp.stripe.com` and SHALL keep
   every payment-mutating Stripe MCP tool behind human confirmation, per Stripe's
   recommendation to enable human confirmation of tools and to exercise caution about
   prompt injection when combining servers ([Stripe MCP](https://docs.stripe.com/mcp)).
6. WHERE Stripe MCP is called with account-scoped authority, THE
   Payment_Trust_Boundary SHALL use a restricted API key with the required
   permissions, because Stripe documents restricted access keys rather than OAuth for
   connected-account MCP calls ([Stripe MCP](https://docs.stripe.com/mcp)).
7. THE Agent_Payment_Surface SHALL return one rail-neutral typed result shape for a
   payment request regardless of the selected Rail.
8. THE Agent_Payment_Surface SHALL add no new proxy tier and SHALL reuse the existing
   Knowgrph MCP transports and the existing Approval_Gate owner.

**Verifiable Completion Conditions**

- `Verify the discovery response validates against the published schema, names both rails, and reports a model cost of zero` (criteria 1, 2)
- `Verify an unapproved payment tool call is rejected with zero provider calls and a zero-cost log entry` (criteria 3, 4)
- `Verify every registered payment-mutating Stripe MCP tool is marked as requiring confirmation and the configured Stripe MCP endpoint matches the documented remote URL` (criterion 5)
- `Verify account-scoped Stripe MCP configuration references a restricted key rather than an unrestricted secret key` (criterion 6)
- `Verify a stripe-selected and a straitsx-selected payment request return the same result shape` (criterion 7)
- `Verify no new transport or proxy component is introduced beyond the existing MCP transports` (criterion 8)

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

1. THE Payment_Trust_Boundary SHALL map every Stripe failure into a typed Knowgrph
   result that preserves the Stripe error type, which Stripe documents as one of
   `api_error`, `card_error`, `idempotency_error`, or `invalid_request_error`
   ([Errors](https://docs.stripe.com/api/errors)).
2. WHERE a Stripe card failure carries a `decline_code`, THE Payment_Trust_Boundary
   SHALL record that code and SHALL surface only a buyer-safe message to the
   Payment_Surface ([Errors](https://docs.stripe.com/api/errors)).
3. THE Payment_Trust_Boundary SHALL map every StraitsX failure into a typed Knowgrph
   result that preserves the provider HTTP status and the provider-reported reason.
4. WHEN a refund is requested for a `paid` Payment_Intent_Record, THE
   Payment_Trust_Boundary SHALL create the refund on the Rail that settled the
   payment and SHALL record the refund reference on that record.
5. WHEN a refund request is retried for the same Payment_Intent_Record, THE
   Payment_Trust_Boundary SHALL leave the refunded amount unchanged.
6. IF a refund is requested for a Payment_Intent_Record that is not `paid`, THEN THE
   Payment_Trust_Boundary SHALL return a typed `refund_not_applicable` result and
   SHALL contact no provider.
7. WHEN a provider call fails with a transport or `5xx` error, THE
   Payment_Trust_Boundary SHALL retry with the same Provider_Idempotency_Key up to a
   stated attempt bound and SHALL then return a typed `provider_unavailable` result.
8. THE Payment_Trust_Boundary SHALL record every failure with the provider request
   identifier where the provider returns one.

**Verifiable Completion Conditions**

- `Verify each documented Stripe error type and a decline_code case map to a distinct typed result and the buyer-visible message excludes provider internals` (criteria 1, 2)
- `Verify a StraitsX error response maps to a typed result carrying the HTTP status and provider reason` (criterion 3)
- `Verify a refund on a paid record records a refund reference on the settling rail, and a repeated refund request leaves the refunded amount unchanged` (criteria 4, 5)
- `Verify a refund request on a non-paid record returns refund_not_applicable with zero provider calls` (criterion 6)
- `Verify a simulated 5xx sequence retries with the same idempotency key to the stated bound and then returns provider_unavailable` (criterion 7)
- `Verify each recorded failure carries the provider request identifier when the provider supplies one` (criterion 8)

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
6. THE Readiness_Gate SHALL report a Rail as ready only when a Sandbox_Mode payment on
   that Rail has reached a Terminal_State at least once.
7. THE Readiness_Gate SHALL report the configured Stripe API version and the
   configured StraitsX integration model in its output.
8. THE Agentic OS read views SHALL expose payment rail readiness and the payment cost
   ledger without mutating payment state and without issuing a model call.

**Verifiable Completion Conditions**

- `Verify every provider call in a recorded run has exactly one cost log entry with the five named fields` (criterion 1)
- `Verify a full intent-to-settlement run reports a model cost of 0.00 and zero model calls` (criterion 2)
- `Verify the readiness gate output lists required credential names per rail, performs zero writes, and exits non-zero when a required input is absent` (criteria 4, 5)
- `Verify a rail without a terminal sandbox payment is reported as not ready` (criterion 6)
- `Verify the gate output names the configured Stripe API version and StraitsX integration model` (criterion 7)
- `Verify the payment read views return typed output with zero state mutation and zero model calls` (criterion 8)

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
   or full bank account number in any Knowgrph store.
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

## Scope Boundaries

### In scope

- A rail-selection contract covering two rails: Stripe and StraitsX.
- Stripe card and global consumer collection through hosted Checkout with
  deterministic idempotency keys.
- StraitsX SGD fiat collection and XSGD stablecoin acceptance under one configured
  integration model.
- Authenticated, replay-safe ingestion of Stripe webhook events and StraitsX
  callbacks.
- A client-owned offline intent queue and a provider-authoritative Reconciler.
- A serialized Payment_Record_Document with a parser, a printer, and a round-trip
  guarantee.
- A mobile-first buyer payment surface with explicit states.
- Agent discovery, approval-gated payment tools, and federation of the hosted Stripe
  MCP transport.
- Typed failures, refunds on the settling rail, per-rail readiness gates, and a
  per-call cost log.
- Sandbox_Mode operation inside the Dev runtime.

### Out of scope

- Subscriptions, recurring billing, invoicing schedules, and dunning.
- Marketplace flows, connected-account fund splitting, and platform fee capture.
- Knowgrph custody of buyer funds, a Knowgrph-operated wallet, or a Knowgrph-operated
  exchange.
- Stripe Treasury agentic finance tools for moving money, paying bills, or issuing
  cards ([Stripe MCP](https://docs.stripe.com/mcp)).
- StraitsX Payout, Swap, and FX flows beyond the Could tier.
- Tax calculation, invoicing compliance, and accounting system integration.
- A custom card-entry form or any component that touches raw card data.
- A second payment Worker, a unified proxy gateway tier, or a second payment store.
- Production mirror publication and Cloudflare deployment.
- Live-mode payments; this increment is Sandbox_Mode only.

---

## Dependencies

| Dependency | Class | Justification |
|---|---|---|
| Existing `knowgrph-payment` Cloudflare Worker and its D1 binding | Zero-TCO (existing free-tier binding) | Already the payment trust boundary; reuse avoids a new tier. |
| Existing shared payment SSOT modules (`stripePaymentSsot`, `stripeMcpSsot`, `agenticCommerceSsot`) | FOSS / repository-owned | Route, secret-name, and MCP configuration authority already exists; duplicating it would split ownership. |
| Existing external-tool Approval_Gate owner | FOSS / repository-owned | Spend authorization must not be reimplemented per rail. |
| Existing MainPanel Commerce surface | FOSS / repository-owned | Payments remains a Commerce subsection, per `knowgrph-mainpanel-commerce-prd-tad.md`. |
| Stripe API and hosted Checkout | Proprietary, justified inline | No FOSS alternative provides global card acquiring. Cost is per-transaction and variable; fixed monthly TCO stays $0. Chosen because Stripe recommends Checkout Sessions for most integrations and documents idempotency and signed webhooks ([Stripe API](https://docs.stripe.com/api)). |
| Stripe MCP hosted server (`https://mcp.stripe.com`) | Proprietary, justified inline, public preview | Only first-party MCP surface for the Stripe account. Federated as an optional transport behind human confirmation; excluding it would require a bespoke tool layer. Preview status is a stated risk ([Stripe MCP](https://docs.stripe.com/mcp)). |
| StraitsX API (sandbox first) | Proprietary, justified inline | Regulated SGD rails, PayNow, and XSGD issuance have no FOSS substitute. Access depends on an approved use case and integration model ([StraitsX API guides](https://docs.straitsx.com/docs/introduction)). |
| Browser-local storage for the Intent_Queue | FOSS / platform | Zero egress while offline; no new service. |

---

## Open Questions

1. **StraitsX callback authenticity beyond source addresses.** The referenced
   webhook documentation names source IP allowlisting
   (`52.221.59.197`, `52.77.136.252`) but no signature header
   ([StraitsX Webhooks](https://docs.straitsx.com/reference/webhooks)). Confirm
   whether a signed callback mechanism exists. Until confirmed, R5 requires a
   provider state read before settlement rather than trusting the callback payload.
2. **StraitsX idempotency semantics.** No idempotency-key header is documented on the
   referenced pages. Confirm whether StraitsX offers request-level idempotency for
   payment and payout creation. Until confirmed, R4 relies on a per-attempt reference
   plus a provider state read.
3. **Source-address verification inside a Cloudflare Worker.** Confirm which request
   header the Worker should read to evaluate the StraitsX source address, and whether
   an additional shared-secret path segment is warranted as defense in depth.
4. **StraitsX integration model.** Confirm whether Regular Transfer, First Party
   Transfer, or Third Party Transfer matches a solo-operator collecting payments for
   its own product
   ([StraitsX API guides](https://docs.straitsx.com/docs/introduction)).
5. **XSGD inbound acceptance path.** Confirm whether the Blockchain API
   deposit-address method is the supported way to accept inbound XSGD for a
   collection, and which networks are enabled for the account via the
   supported-blockchains method.
6. **StraitsX commercial pricing.** Transaction, FX, and network fee schedules are not
   in the referenced documentation. Required before the revenue model in the companion
   PRD/TAD can be completed.
7. **StraitsX MCP surface.** No MCP server is described in the referenced StraitsX
   documentation. Confirm whether one exists before promising parity with the Stripe
   MCP transport.
8. **Exact StraitsX payment method for the first increment.** Dynamic PayNow QR versus
   persistent PayNow versus virtual bank account. The API reference lists all three
   ([StraitsX API reference index](https://docs.straitsx.com/reference/say-hello));
   the choice depends on question 4 and on buyer flow, and is deferred to design.
9. **Stripe API version to pin.** The reference names `2026-06-24.dahlia` as current
   ([Stripe versioning](https://docs.stripe.com/api/versioning)). Confirm the version
   already pinned by the existing payment Worker before changing it.
10. **Intent_Queue durability medium.** Which existing browser-local persistence owner
    holds the queue, and what the queue size bound is, is deferred to design.

## Assumptions

1. The existing `knowgrph-payment` Worker remains the only server-side payment trust
   boundary; this increment extends it rather than replacing it.
2. Stripe hosted Checkout, ACP checkout sessions, x402 probes, and Solana Pay
   settlement remain owned by `knowgrph-agentic-commerce-prd-tad.md`; this spec adds
   rail selection, the StraitsX rail, offline queueing, and record serialization on
   top of them.
3. A Stripe account with sandbox access is available; a StraitsX sandbox account is
   obtainable for the same operator.
4. All amounts are handled as integer minor units, and no floating-point arithmetic
   participates in a payment amount.
5. Payment provider fees are treated as variable cost of revenue and are excluded from
   the monthly TCO figures in Success Metrics.
6. Sandbox_Mode is sufficient to satisfy every acceptance criterion in this increment;
   no live-mode payment is required to close the spec.

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

Content from the sources above was paraphrased and summarized for compliance with
licensing restrictions.
