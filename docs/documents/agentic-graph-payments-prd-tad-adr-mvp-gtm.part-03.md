---
title: "Reference implementation: agentic-graph-payments-prd-tad-adr-mvp-gtm section 3"
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
source_section_lines: "892-1333"
---

[Combined planning owner](agentic-graph-payments-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-PAYMENTS-PRD-TAD-ADR-MVP-GTM@1.3.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### Workflow Specifications

#### Workflow W1: Rail selection and intent creation

**Trigger**: Buyer confirms a payment on the Payment_Surface, or an approved agent tool call requests a payment intent.

**Actors**: Buyer_SG or Buying_Agent, Payment_Surface, Payment_API, Approval_Gate, Rail_Router, Stripe_Rail_Adapter, StraitsX_Rail_Adapter, Payment_Record_Store, Cost_Observer.

**Happy path**:
1. Payment_Surface generates a Client_Intent_Key UUID once for the attempt and posts the intent to Payment_API over HTTPS.
2. For an agent-originated call, Payment_API requires a valid Approval_Gate authorization before any provider contact.
3. Rail_Router selects exactly one rail from currency, settlement asset, and per-rail readiness, then writes the rail identifier and selection reason to Payment_Record_Store before any provider call.
4. The selected adapter creates the provider object using one stable provider idempotency value derived from the Client_Intent_Key: a Stripe API v1 idempotency key or a StraitsX `referenceId`/`idempotency_id` under the approved integration model.
5. The adapter records the provider object identifier and, for Stripe, the `Request-Id` response header value on the intent record. Cost_Observer writes one cost log entry.
6. Payment_API returns the rail-neutral typed result and the rail's payment instruction. The record state is `pending_provider`.

**Alternate paths**:
- Only one rail is ready: Rail_Router selects it and records reason `only_ready_rail`.
- Retry with the same Client_Intent_Key and identical parameters: the adapter reuses the same provider key; after an uncertain response it reads provider state before retrying, so exactly one logical provider operation remains owned.
- Agent call with no valid approval: rejected with a zero-cost rejection entry and zero provider contact.

**Error paths**:
- No ready rail for the requested currency and settlement asset: typed `rail_unavailable`, zero provider objects created.
- Retry with the same key and different parameters: Stripe returns the `idempotency_error` type and the adapter records typed `intent_parameter_conflict` with no additional provider object ([Stripe API](https://docs.stripe.com/api)).
- Requested fund flow outside the configured StraitsX integration model: typed `integration_model_unsupported`, zero provider objects created.
- Live-mode credential detected under sandbox mode: typed `mode_mismatch`, zero provider contact.
- Transport or `5xx` provider result: record `provider_outcome_unknown`, perform bounded same-key retry plus provider reads, and leave settlement locked for later reconciliation if uncertainty remains.

**Postconditions**: exactly one intent record exists for the Client_Intent_Key, carrying the rail identifier, selection reason, provider object identifier where one was created, and one cost log entry per provider call. No credential left the trust boundary. Paid capability remains withheld.

#### Workflow W2: Provider event ingestion and settlement

**Trigger**: Stripe webhook delivery or StraitsX callback delivery to Provider_Event_Ingress.

**Actors**: Stripe API, StraitsX API, Provider_Event_Ingress, Payment_Record_Store, Payment_Surface.

**Happy path**:
1. Provider_Event_Ingress authenticates the delivery before parsing. Stripe deliveries verify `Stripe-Signature`, the endpoint signing secret, and timestamp tolerance over the unmodified raw body. StraitsX deliveries verify `Xfers-Signature` by HMAC-SHA256 over the unmodified raw body and pass the documented source-address allowlist.
2. The event identity is claimed in Payment_Record_Store with a processing status.
3. Provider state is read before any settlement is applied.
4. Settlement applies only when provider-reported paid state, intent identifier, minor-unit amount, and currency all match the stored record. The record moves to `paid`.
5. Payment_Surface reflects the new state from the shared snapshot and Receipt_Projection appends the terminal entry.

**Alternate paths**:
- Repeat delivery of a processed identity with an equivalent payload: acknowledged with success, zero additional state change.
- Identity previously recorded as failed or as a stale in-flight claim: a later delivery is processed to a terminal outcome. The receiver returns success quickly after the durable claim; provider retries remain safe because processing is idempotent.

**Error paths**:
- Signature verification failure or a tampered body: typed `signature_verification_failed`, zero state change.
- Callback from an address outside the documented source addresses: rejected, zero state change.
- Reordered Stripe events: process from provider-authoritative state; never infer state from delivery order.
- Conflicting payload for a recorded identity: rejected, prior state preserved.
- Amount, currency, or intent-identifier mismatch: the record stays unpaid.

**Postconditions**: the event identity is recorded exactly once with a terminal processing status, settlement side effects applied at most once, and the intent record either reached `paid` with a matched amount and currency or remained unpaid with a typed rejection recorded.

#### Workflow W3: Offline queue and reconnect reconciliation

**Trigger**: Buyer confirms a payment while the Payment_Trust_Boundary is unreachable.

**Actors**: Buyer_SG, Payment_Surface, Intent_Queue, Reconciler, Payment_API, provider APIs.

**Happy path**:
1. Payment_Surface generates the Client_Intent_Key, persists a queued intent record to Intent_Queue, and displays `queued_offline` with the statement that the payment is held locally and will be submitted on reconnect.
   No provider object, QR code, payment destination, or provider-derived state exists yet.
2. On reconnect, Reconciler submits queued records in creation order, one Client_Intent_Key at a time.
3. Payment_API returns the existing record for an already-recorded key and creates no additional provider object.
4. Reconciler resolves each record to a terminal state from provider-read state and Receipt_Projection appends the terminal entry.

**Alternate paths**:
- Client reload while offline: the queue and its keys survive and the display remains `queued_offline`.
- Provider object already created before the disconnection: reconciliation reads provider state and adopts the terminal outcome without creating anything.

**Error paths**:
- A record that cannot reach a terminal state within the stated attempt bound: marked `reconciliation_unresolved`, retries stop, an operator-visible entry is surfaced.
- Provider unavailable during reconciliation: bounded same-key retry plus provider reads, then `provider_outcome_unknown`; the record stays non-terminal until a later drain.

**Postconditions**: every queued record is either terminal from provider-read state or explicitly `reconciliation_unresolved`. Exactly one provider object exists per Client_Intent_Key. Paid capability was never unlocked from queue state alone. The persisted queue holds no credential and no card or bank identifier.

#### Workflow W4: Receipt projection

**Trigger**: An intent record reaches a terminal state, or the buyer opens the receipt view.

**Actors**: Payment_Record_Store, Receipt_Projection, Payment_Record_Document, Payment_Surface.

**Happy path**: the terminal record is appended as one entry with the nine named fields in stable order, base-10 integer minor units, LF line endings, and a single trailing newline. The receipt view renders the document from local storage with zero network requests.

**Alternate path**: the document is parsed and re-serialized during verification and the output is byte-identical to the input.

**Error path**: a malformed document yields a typed parse error naming the failing line and leaves the document bytes unchanged.

**Postconditions**: one entry per terminal record, byte-stable under round trip, containing no card number, bank account number, credential, email address, or provider customer identifier.

#### Workflow W5: Agent discovery

**Trigger**: An external agent resolves the agentic-graph payment capability.

**Actors**: Buying_Agent, Agent_Discovery_Surface, existing MCP transports, hosted Stripe MCP, Approval_Gate.

**Happy path**: the agent reads capability metadata naming both rails, supported currencies, supported settlement assets, and the typed request and result schemas, with zero model calls and a recorded model cost of zero. Execution requests route through Payment_API and the existing Approval_Gate.

**Alternate path**: the hosted Stripe MCP transport is federated as one additional external
transport. agentic-graph registers every hosted tool as confirmation-required; spend-bearing and
state-changing tools also require Approval_Gate authorization. OAuth is preferred for
supported interactive clients, while autonomous access uses a dedicated restricted key
([Stripe MCP](https://docs.stripe.com/mcp)).

**Error path**: an unreachable federated transport is listed as unavailable in the discovery response rather than failing the whole response, and no new proxy tier is introduced to compensate.

**Postconditions**: the discovery response validates against the published schema, reports a model cost of zero, and adds no transport beyond the existing set plus the federated Stripe MCP endpoint.

#### Workflow W6: Rail readiness

**Trigger**: Operator invokes the per-rail readiness gate, or opens the Payments subsection inside MainPanel Commerce.

**Actors**: Solo_Operator, Readiness_Gate, secret-store metadata, provider sandbox APIs, Payment_Record_Store.

**Happy path**: the gate reports per rail the required credential names, their presence in
server-side secret storage, environment match, Stripe request and webhook version pins,
StraitsX integration model and granted product, callback verification configuration, and
signing-clock health. A rail can reach local `runtime-ready` only when every attached VCC has
a satisfying Authoring-lane Evidence Reference, including an authenticated callback plus
provider read establishing its rail-specific success state in a recorded sandbox run.

**Alternate path**: `GET https://api-sandbox.straitsx.com/v1/authorize/hello` returning HTTP `200` is recorded only as sandbox connectivity and API-key-authentication evidence. It does not prove Payment API access, integration-model approval, callback delivery, or settlement readiness ([StraitsX Say Hello](https://docs.straitsx.com/reference/say-hello)).

**Error paths**:
- A required input for an enabled rail is missing: the gate exits non-zero and mutates nothing.
- A credential name appears in visible configuration or in client bundle output: the gate reports failure and leaves configuration unchanged.

**Postconditions**: the gate wrote nothing, made zero model calls, and produced a per-rail readiness snapshot that the Commerce Payments subsection renders read-only.

#### Workflow W7: Typed failure and refund

**Trigger**: A provider call fails, or an operator requests a refund.

**Actors**: Solo_Operator, Payment_API, rail adapters, provider APIs, Payment_Record_Store.

**Happy path**: when the settling rail has a source-verified refund contract, a refund on a
`paid` record is created on that rail and its reference is recorded.

**Alternate paths**:
- Repeated refund request for the same record: the refunded amount is unchanged.
- Stripe card failure carrying a `decline_code`: the code is recorded and only a buyer-safe message reaches the surface.
- StraitsX refund requested while OQ-16 is open: typed `provider_operation_unverified`, zero provider contact.

**Error paths**:
- Refund requested for a non-`paid` record: typed `refund_not_applicable`, zero provider contact.
- Transport or `5xx` failure: preserve `provider_outcome_unknown`, perform bounded same-key retry and provider reads, and never relabel the operation failed while the outcome is indeterminate.

**Postconditions**: every failure carries a typed agentic-graph result preserving the provider error type or HTTP status and the provider request identifier where supplied, and no buyer-visible message contains provider internals.

#### Workflow W8: Existing-Paywall lifecycle coordination

**Trigger**: A trusted host receives one schema-valid buyer purchase instruction while the
single Paywall capability is enabled.

**Actors**: Buyer_SG, Buying_Agent, Payment_Surface, Purchase_Lifecycle_Coordinator,
Approval_Gate.

**Happy path**:
1. Payment_Surface validates the instruction and creates one lifecycle identity.
2. Purchase_Lifecycle_Coordinator freezes the purchase envelope and projects Funding,
   Discovery, Issuance, and Execution through the existing Paywall.
3. Each phase consumes the prior phase's typed result and pauses at its financial approval
   boundary.

**Alternate paths**:
- Buyer closes or cancels before the first financial approval: lifecycle becomes
  `cancelled`, performs zero provider/financial calls, and runs no later phase.
- Buyer closes or cancels after financial state exists: lifecycle becomes `cancelled`,
  blocks new spend-bearing calls and later phases, atomically releases any unused local XSGD
  reservation, keeps already credited XSGD in the buyer's provider account, reconciles any
  indeterminate provider/order state, blocks new card authorizations, and applies the
  source-bound safe-close policy. Cleanup is not treated as new spend.
- Same instruction/lifecycle key is replayed unchanged: the existing lifecycle is returned.

**Error paths**:
- Page-originated, malformed, expired, or unapproved instruction: typed
  `purchase_instruction_rejected`, zero financial calls.
- Same key with changed envelope: typed `purchase_instruction_conflict`, original unchanged.

**Postconditions**: exactly one lifecycle, one existing Paywall instance, one frozen envelope,
phase-specific cancellation cleanup completed or explicitly pending, and no parallel
route/UI/controller/store owner.

#### Workflow W9: KYC-bound XSGD funding

**Trigger**: Funding has a fresh approval and the lifecycle is not already funded.

**Actors**: Buyer_SG, Approval_Gate, Funding_Adapter, approved signer, XSGD account API,
Avalanche C-Chain, Provider_Event_Ingress.

**Happy path**:
1. Funding_Adapter reads KYC, product, supported-network, deposit-address, token-contract,
   signer, gas, and balance readiness.
2. The approved signer sends the exact XSGD amount to the exact returned deposit address on
   the configured network using one stable funding key.
3. The adapter observes an accepted chain receipt but keeps the phase pending.
4. Provider_Event_Ingress authenticates the raw callback and the adapter reads the
   authoritative account balance/credit.
5. Matching token, network, address, amount, transaction, credit, and account advance Funding.

**Alternate paths**:
- Provider-confirmed spendable XSGD already covers the exact approved reservation: reserve it
  atomically and record `existing_balance`; no transfer is broadcast.
- Transfer is accepted but provider credit is pending: remain `funding_pending`, poll/read
  under a bounded schedule, and never advance on chain observation alone.
- Lifecycle cancels/expires or Discovery/Issuance fails before authorization: atomically
  release the unused local reservation exactly once. Already credited XSGD remains in the
  buyer's provider account; do not broadcast a return transfer.

**Error paths**:
- Deposit-address creation is unavailable in the configured environment or account: typed
  `xsgd_funding_unavailable`, zero transfer.
- Any KYC, grant, chain, contract, destination, amount, signer, gas, callback, or credit
  mismatch: typed failure; no issuance.

**Postconditions**: one provider-confirmed XSGD reservation funds one lifecycle or is
released exactly once by Funding_Adapter on a pre-authorization terminal branch; no private
key or KYC document enters agentic-graph state and no automatic return transfer exists.

#### Workflow W10: Bounded commerce discovery

**Trigger**: Funding is provider-confirmed and the immutable purchase envelope is unexpired.

**Actors**: Buying_Agent, Payment_Surface, Commerce_Discovery_Harness, allowed external
merchant, Cost_Observer.

**Happy path**:
1. Dispatcher validates the envelope and origin allowlist before browser or model spend.
2. Executor inspects structured data and DOM, visits at most five product pages, and performs
   at most twelve browser actions.
3. Only unresolved semantic matching may use a model, at most twice.
4. Harness validates typed candidates and returns them to the existing Paywall for selection.

**Alternate paths**:
- Structured data yields a unique valid candidate: return it with zero model calls.
- Multiple valid candidates: pause for buyer selection; do not rank with a financial action.

**Error paths**:
- Page instruction asks the agent to change policy, call a tool, reveal data, or leave the
  origin allowlist: record a prompt-injection signal, abort the whole discovery run before
  another browser/model action, and create no candidate, card, or authorization.
- Buyer cancellation signal: abort before the next browser action or model call, release the
  unused funding reservation through W8/W9, and create no card or authorization.
- Unknown total, blocked page, no match, changed currency, or action/model bound reached:
  typed discovery failure and zero card creation.

**Postconditions**: zero or more schema-valid candidates, one bounded cost log, and no new
financial state. Cancellation, expiry, injection, or another terminal discovery failure
causes Purchase_Lifecycle_Coordinator to release the unused local funding reservation exactly
once; a non-terminal buyer refinement keeps the same bounded lifecycle.

#### Workflow W11: Approval-bound disposable card issuance

**Trigger**: Buyer selects one fresh candidate and grants one issuance/execution approval.

**Actors**: Buyer_SG, Approval_Gate, Purchase_Lifecycle_Coordinator, Card_Issuer_Adapter, Card
Program API, Secure_Card_Broker.

**Happy path**:
1. Coordinator revalidates funding reservation, candidate freshness, total, currency,
   merchant policy, approval TTL/digest, program grant, product, pool, and secure credential
   path.
2. Approval_Gate atomically consumes the durable single-use approval; its state survives
   restart and an expired/rejected/changed approval makes zero provider calls.
3. Card_Issuer_Adapter creates at most one virtual card using the lifecycle idempotency key.
4. The adapter activates the card and combines provider-native controls with
   repository-owned RHA enforcement so their effective union covers every approved
   restriction; it prepares 3DS and records only opaque/truncated references.
5. Secure_Card_Broker reports ready without exposing PAN, CVV, or full expiry.

**Alternate paths**:
- Unchanged retry after an uncertain create: reconcile by opaque card reference and return the
  existing card; never issue another.
- Unchanged replay after approval consumption: return/reconcile the same lifecycle/card;
  never consume a second approval. A changed replay is denied.
- Provider lacks a native one-use control: RHA atomic reservation plus permanent close is the
  proposed disposal mechanism and remains capability-gated until OQ-21 closes.

**Error paths**:
- Pool empty, product/grant missing, card remains inactive, the effective provider-plus-RHA
  control union is weaker than approval, 3DS is unavailable where required, or secure broker
  is unavailable: close any pre-authorization partial card and fail closed.
- Candidate or approval changed: reject with zero card create.

**Postconditions**: one active, approval-bound card reference and one thirty-minute-or-shorter
disposal deadline, or no usable card.

#### Workflow W12: Secure checkout, authorization, reconciliation, and disposal

**Trigger**: One disposable card is active and the approved candidate remains fresh.

**Actors**: Buying_Agent, Secure_Card_Broker, allowed external merchant,
Card_Authorization_Ingress, Card Program API, Purchase_Lifecycle_Coordinator,
Payment_Record_Store.

**Happy path**:
1. Agent revalidates origin, item, variant, quantity, total, currency, delivery terms, and
   prohibited add-ons.
2. Secure_Card_Broker injects card fields into the merchant form without model visibility.
3. Card_Authorization_Ingress authenticates the provider request, atomically claims its
   authorization identity, and reserves the exact authorization before responding inside the
   provider deadline. This first successful claim is the one-use trigger; an exact duplicate
   returns the prior decision and a concurrent different identity is denied.
4. Buyer completes provider-hosted authentication if requested.
5. Coordinator reconciles authorization/webhook state with the merchant order, records the
   terminal result, blocks further authorizations, releases or settles the reservation,
   records `closure_pending` while capture/reversal/refund risk remains, closes exactly once
   when safe, and projects one receipt.

**Alternate paths**:
- Hold then completion: retain the reservation through completion/reversal under OQ-21's
  exact contract; do not close until a safe terminal point.
- Buyer authentication required: pause the Paywall; never let the agent impersonate the
  buyer or read the authentication secret.

**Error paths**:
- Price, currency, merchant, item, quantity, delivery, or add-on mismatch: stop before form
  submission and return to candidate review.
- Authorization timeout, merchant-only success, issuer-only success, or missing webhook:
  remain `purchase_outcome_unknown`, reconcile without new card or submission, and escalate
  before disposal if capture risk remains.

**Postconditions**: merchant and issuer agree on one terminal result, or the lifecycle remains
explicitly unresolved; new authorizations are blocked after the first successfully claimed
authorization identity, cancellation, or expiry; one card is `closure_pending` or closed
exactly once according to the source-bound safety contract; and one minimized record captures
the audit chain.

### Data Flows

#### DF1: Intent ingest

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Payment_API | `{clientIntentKey: uuid, amountMinor: int, currency: iso4217-lower, settlementAsset: "fiat" \| "xsgd", origin: "buyer" \| "agent", approvalRef?: string}` JSON over HTTPS | Validated intent command plus `receivedAt` | None in the route layer | Schema rejection before any provider call; typed error returned |
| Transform | Rail_Router | Validated intent command plus per-rail readiness snapshot | `{rail: "stripe" \| "straitsx", reason: enum}` | None | Typed `rail_unavailable`; no provider object |
| Store | Payment_Record_Store | Intent record with rail and reason | Persisted row with `state: "pending_provider"` | D1 table on the payment Worker binding, retained for audit | Write failure aborts before the provider call; typed error returned |
| Serve | Payment_API | Intent identifier | `{intentId, state, amountMinor, currency}` only | None | Typed error; never a provider payload |

#### DF2: Provider create

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Stripe_Rail_Adapter | Intent record plus derived API v1 idempotency key | Form-encoded request for the configured authoritative object type | None | Typed `intent_parameter_conflict`; transport and 5xx results stay `provider_outcome_unknown` through same-key reconciliation |
| Ingest | StraitsX_Rail_Adapter | Intent record plus stable `referenceId` or `idempotency_id` | JSON request with API-key auth and, in signed mode, the documented Ed25519 headers | None | Typed `integration_model_unsupported`; provider state read after uncertainty before a same-key retry |
| Transform | Rail adapters | Provider JSON response | Rail-neutral typed result plus rail payment instruction | None | Provider error mapped to a typed agentic-graph result |
| Store | Payment_Record_Store | Provider object identifier, request identifier, cost log entry | Row update plus one cost ledger row | D1, Cloudflare-managed region | State transition rolled back; typed error returned |
| Serve | Payment_API | Intent identifier | Rail-neutral result plus rail payment instruction; the public status response omits hosted payment URLs | None | Typed error |

#### DF3: Event ingest and settlement

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Provider_Event_Ingress | Exact raw body bytes, signature headers, and source address | Authenticated event envelope `{provider, eventId, type, payload}` | Event identity row claimed with a processing status | Stripe signature/timestamp or StraitsX HMAC/source failure produces zero state change |
| Transform | Provider_Event_Ingress | Event envelope plus provider state read | `{intentId, providerPaid: bool, amountMinor, currency}` | None | Mismatch leaves the record unpaid |
| Store | Payment_Record_Store | Matched settlement decision | Intent row at `paid` plus event identity marked processed | D1, Cloudflare-managed region | Conflicting payload rejected with prior state preserved; a failed identity stays reprocessable |
| Serve | Payment_API | Intent identifier | `{intentId, state, amountMinor, currency}` | None | Typed error |

#### DF4: Queue persistence

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Payment_Surface | Buyer confirmation plus generated `clientIntentKey` | Queued intent record with no credential and no card or bank identifier field | Browser-local durable store on the end-user device | Rejected if any prohibited field is present |
| Transform | Reconciler | Queued records ordered by creation time | One submission per Client_Intent_Key | None | Bounded retry schedule with a stated maximum attempt count |
| Store | Payment_Record_Store | Submitted intent | Existing row for a known key, otherwise a new row | D1, Cloudflare-managed region | A duplicate key never creates a second provider object |
| Serve | Payment_Surface | Local queue plus server snapshot | One displayed state from the shared snapshot | None | `reconciliation_unresolved` surfaced with an operator-visible entry |

#### DF5: Record serialization

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Receipt_Projection | Terminal intent record with the nine named fields | Normalized entry with base-10 integer minor units | None | A missing field aborts the append |
| Transform | Record_Serializer role of Receipt_Projection | Normalized entries in stable order | Text document, LF line endings, single trailing newline | None | Deterministic output required; nondeterminism is a defect |
| Store | Payment_Record_Document | Serialized text | Appended document | End-user device or operator workstation | Malformed input yields a typed parse error naming the failing line; bytes unchanged |
| Serve | Payment_Surface receipt view | Local document bytes | Rendered receipt list | None, zero network requests | Parse error surfaced as a typed message |

#### DF6: Capability metadata read

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Agent_Discovery_Surface | Discovery request, no body | Read-time capability snapshot request | None | Typed error; zero model calls |
| Transform | Agent_Discovery_Surface | Rail catalog plus schema registry plus federated transport list | `{rails[], currencies[], settlementAssets[], requestSchema, resultSchema, transports[], unavailableTransports[]}` | None | An unreachable transport is listed in `unavailableTransports[]` and the response still succeeds |
| Store | None | - | - | No new persistent store | - |
| Serve | Agent_Discovery_Surface | Discovery request | JSON metadata with `modelCostUsd: 0.00` | None | Typed error |

#### DF7: Readiness snapshot

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Readiness_Gate | Rail identifier plus configuration and secret-store metadata | Required-input checklist per rail | None | A missing input is recorded and nothing is written |
| Transform | Readiness_Gate | Checklist plus environment, version pins, signing/callback health, Hello result, and authenticated sandbox settlement evidence | `{rail, requiredCredentialNames[], presentInSecretStore[], leakedIntoVisibleConfig[], environmentMatch, requestApiVersion?, webhookApiVersion?, integrationModel?, grantedProducts[], callbackVerified, helloAuthenticated, localRung}` | None | Non-zero exit on a missing input, mismatch, absent version pin, or unverified callback; Hello never promotes readiness alone |
| Store | None | - | - | Read-only, no configuration mutation | - |
| Serve | MainPanel Commerce Payments subsection | Readiness snapshot | Read-only rendered rows | None | Row marked not ready; no write path exposed |

#### DF8: Agentic lifecycle state

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Payment_Surface | `{lifecycleKey: uuid, allowedOrigins: https-origin[], item: {query, requiredAttributes}, quantity: 1, maximumTotalMinor: int, currency: "sgd", expiresAt: rfc3339}` | Schema-valid immutable `Purchase_Envelope` | None in client view | Malformed, expired, page-originated, or conflicting input rejected before financial calls |
| Transform | Purchase_Lifecycle_Coordinator | Envelope plus approvals and phase results | `{lifecycleId, phase, phaseState, nextAction, candidateSummary?, fundingRef?, cardRef?, orderRef?, error?}` | No transform-local state | Invalid transition rejected; prior phase remains authoritative |
| Store | Payment_Record_Store | Minimized lifecycle event with monotone revision | Lifecycle row plus append-only transition/event identities | Existing managed payment store | Compare-and-swap conflict returns typed retry; no second store |
| Serve | Payment_Surface | Minimized lifecycle snapshot | Four-phase Paywall projection with one next action | Browser snapshot only; offline receipt for terminal state | Unreachable server shows explicit offline/read-only state and creates no financial request |

#### DF9: XSGD funding

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Funding_Adapter | `{lifecycleId, fundingKey, amountMinor, asset: "xsgd", network, accountRef, approvalRef}` plus account readiness | Validated `Funding_Command` | None | Wrong KYC/grant/network/token/address/amount/signer/gas fails before egress |
| Transform | Funding_Adapter | Deposit address, signed transfer result, chain receipt, authenticated provider callback/read | `{fundingRef, txHash, providerCreditRef, creditedAmountMinor, asset, network, state}` | No private key or raw signed transaction | Chain-only success remains pending; mismatch fails closed |
| Store | Payment_Record_Store | Minimized transaction and provider-credit references | Funding reservation, release state, and dedupe identities | Existing managed payment store | Duplicate tx/credit/release applies once; conflicting tuple rejected |
| Serve | Payment_Surface | Funding state projection | Network, amount, status, next action; no KYC data or address secret | Browser snapshot | `xsgd_funding_unavailable` or `funding_pending` remains explicit |

#### DF10: Commerce candidate extraction

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Commerce_Discovery_Harness | Immutable Purchase_Envelope plus allowed-origin page DOM/structured data | Sanitized typed page facts; page instructions excluded | Ephemeral browser memory | Origin violation, blocked page, or injection signal aborts/fails typed |
| Transform | Commerce_Discovery_Harness | Page facts and optional bounded semantic match | `{merchantOrigin, productUrl, title, variant, quantity, itemAmountMinor, shippingMinor, taxMinor, totalMinor, currency, observedAt, evidenceSelectors[]}` | No raw page snapshot persisted | Unknown mandatory cost or schema failure yields no candidate |
| Store | Payment_Record_Store | Selected minimized candidate and envelope digest | Candidate fields plus digest/revision | Existing managed payment store | Stale observation or changed total invalidates selection |
| Serve | Payment_Surface | Candidate summaries | Review/select/refine/cancel actions | Browser snapshot | No candidate means no card issuance |

#### DF11: Virtual-card issuance

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Approval_Gate plus Card_Issuer_Adapter | `{lifecycleId, candidateDigest, amountMinor, currency, merchantPolicy, expiresAt, approvalRef}` plus provider program/grant state | Atomically consumed durable approval plus validated `Card_Issue_Command` | Approval consumption in existing managed store | Expired, consumed, changed, funding, grant, product, pool, or secure-broker failure rejects before provider contact or usable card as applicable |
| Transform | Card_Issuer_Adapter | Provider create/activate/control responses | `{cardRef, userRef, programRef, truncatedDisplay?, status, controls, disposalAt, credentialBrokerRef}` | No PAN, CVV, or full expiry | Uncertain create reconciles by stable key; partial card is closed on failure |
| Store | Payment_Record_Store | Opaque card references, controls, approval digest, disposal state | One card row/reservation in existing store | Existing managed payment store | Compare-and-swap prevents two cards; closure idempotent |
| Serve | Payment_Surface | Minimized card readiness | Controls, expiry/disposal, status; never card credentials | Browser snapshot | `card_issuance_unavailable` or `secure_injection_unavailable` |

#### DF12: Checkout execution and authorization

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Secure_Card_Broker plus Card_Authorization_Ingress | Frozen checkout facts; PCI-scoped card fields; issuer authorization payload | Credential injection result and validated authorization request | Card fields ephemeral only | Any candidate/merchant/amount/currency/add-on mismatch stops before authorization |
| Transform | Card_Authorization_Ingress plus Purchase_Lifecycle_Coordinator | Atomic balance reservation, issuer webhook/read, merchant order read | `{authorizationRef, issuerState, orderRef?, merchantState, lifecycleState, disposalState}` | No card credential persistence | Timeout/disagreement becomes `purchase_outcome_unknown`; no replayed checkout |
| Store | Payment_Record_Store | Reservation, event identities, order/authorization refs, terminal lifecycle record | Existing store plus Payment_Record_Document projection | Existing managed store and local minimized receipt | Duplicate events apply once; unresolved capture risk blocks disposal completion |
| Serve | Payment_Surface | Terminal or unresolved lifecycle snapshot | Buyer-authentication handoff, reconcile/cancel/escalate, or receipt | Browser snapshot and offline receipt | No false success; card closure shown only after authoritative confirmation |

