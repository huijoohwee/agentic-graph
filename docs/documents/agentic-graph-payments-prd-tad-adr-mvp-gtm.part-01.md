---
title: "Reference implementation: agentic-graph-payments-prd-tad-adr-mvp-gtm section 1"
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
source_section_lines: "1-464"
---

[Combined planning owner](agentic-graph-payments-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-PAYMENTS-PRD-TAD-ADR-MVP-GTM@1.3.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.



# Reference implementation: agentic-graph Payments PRD-TAD-ADR-MVP-GTM

## Status

| Scope | Local rung | Delivered rung | Derivation |
|---|---|---|---|
| This combined PRD/TAD | `dev-proven` | `undocumented` | Requirements version 0.4.0 and a source-digest-bound Dev candidate carry executable deterministic evidence for R1-R17. Provider, browser, protected integration, mirror, and delivery remain independently unproven. |
| Provider activation and paid two-rail operation | `spec-complete` | `undocumented` | Provider contracts are documented; credentials, commercial approval, sandbox settlement, callback delivery, and paid two-rail proof remain external gates. |
| Agent-platform payment surfaces | `dev-proven` | `undocumented` | The existing OS status owner exposes a read-only `agentic_purchase_readiness` view with zero model/provider calls. External Increment 2 `/`, `#`, `@`, and MCP identities remain blocked under OQ-24. |
| Singapore agentic purchase lifecycle | `dev-proven` | `undocumented` | Shared contracts, same-D1 lifecycle safety, trusted existing-Paywall projection, and fail-closed readiness are executable in the Dev candidate. No XSGD transfer, Card Program call, secure credential injection, merchant checkout, or live-browser proof was authorized or run. |
| Normative requirements alignment | `dev-proven` | `undocumented` | Requirements version 0.4.0 accepts R13-R17 and preserves every external capability as an independently evidenced gate. |

Development-authoring authority only. This revision makes no `runtime-ready` or
`production-verified` claim. Official provider documentation establishes reference contracts,
not account configuration, payment success, protected integration, browser proof, mirror
publication, or public deployment.

This document is the source-checked PRD/TAD projection of the `agentic-graph-payments`
requirements at `.kiro/specs/agentic-graph-payments/requirements.md` version 0.4.0.
The spec remains the normative requirements source of truth. This document supplies
architecture, VCC mapping, and Evidence References without creating a competing
requirements owner.

The implementation evidence is a Dev-only candidate carried by this exact source revision
in the protected release lane. A branch name is transport metadata, not runtime evidence.
The candidate does not prove protected integration, provider access, a browser run, mirror
parity, or public delivery.

## Authority and Scope

| Concern | Owner | This document's position |
|---|---|---|
| Payments requirements SSOT | `.kiro/specs/agentic-graph-payments/requirements.md` | Version 0.4.0 remains the normative owner and accepts the R1-R17 contracts projected here. |
| Operator surface for commerce and payments | `docs/documents/agentic-graph-mainpanel-commerce-prd-tad-adr-mvp-gtm.md` | MainPanel Commerce remains the canonical operator surface. Payments stays a Commerce subsection and never becomes a top-level tab. |
| Seller-side ACP checkout, Web3 settlement, Solana Pay, OpenBOX, proof and trace runtime | `docs/documents/agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.md` | Remains the agentic-graph-as-seller runtime owner and the authority for server-owned agentic-graph offers and prices. This document adds a distinct buyer-side, third-party-merchant purchase lifecycle; it does not route a StraitsX-issued card through ACP, relax seller price authority, or duplicate the commerce proof runtime. |
| Stripe MCP readiness, connection mode, tool confirmation policy | `docs/documents/agentic-graph-mcp/agentic-graph-stripe-mcp-service.md` | Remains the MCP readiness owner. This document references that transport for federation only. |
| `/`, `#`, `@`, and payment MCP invocation metadata | `agentic-canvas-os/docs/DICTIONARY-COMMAND.md`, `DICTIONARY-SEMANTIC.md`, `DICTIONARY-BINDING.md`, and `MCP-GATEWAY.md` | These files remain the invocation SSOT. This document consumes their exact payment routes and wire identities; it creates no parallel registry or alias. |
| Execution roles, task decomposition, tool blast radius, and run-state authority | `huijoohwee.github.io/guidelines/adlc-guidelines.md` | Companion execution authority; this PRD/TAD does not redefine its contracts. |
| Settings row rendering and generated schema | existing settings architecture owner | Reused. No second payment settings registry. |

New surface area introduced by this document: an explicit rail-selection contract, the StraitsX rail adapter, a client-owned offline intent queue with reconnect reconciliation, a serialized payment record with a round-trip guarantee, and a stated agent-platform readiness posture for payment tools. Version 1.2 additionally specifies a bounded buyer-agent lifecycle that funds one KYC-verified provider account with XSGD, discovers one purchase candidate, issues one disposable virtual card, and executes one approved checkout through the existing Paywall owner.

Excluded by construction: a second payment Worker, a second payment store, a second commerce worker, a second Paywall or parallel panel framework, a unified MCP proxy tier, a copied invocation registry, agentic-graph custody of funds or private keys, autonomous approval, live-mode payments, and any production mirror or Cloudflare deployment action.

### Normative requirements reconciliation

The requirements and PRD/TAD were updated atomically. This table records the version
0.4.0 disposition rather than an outstanding handoff.

| Requirements area | Source-current contract | Version 0.4.0 disposition |
|---|---|---|
| Frontmatter and companion state | Canonical guideline is `prd-tad-adr-mvp-gtm-guidelines.md`; this companion is populated and uses separate local/delivered rungs | Reconciled |
| R1 | Separate least-privilege credentials per adapter/agent/environment; independently pin request and webhook versions; bind exact signed-request contract | Reconciled |
| R2 | `admissionRails` permits only fully configured sandbox attempts while proof-complete `rails` remains false until paid evidence; exactly one server-owned buyer product is defined by the three `PAYMENT_BUYER_PRODUCT_*` variables | Reconciled |
| R4 | XSGD has separate capability readiness; `STRAITSX_FUND_FLOW` must match the configured integration model before authentication or egress; transactional retries reuse a stable provider key | Reconciled |
| R3 and R10 | A transport or `5xx` outcome can be indeterminate and remains `provider_outcome_unknown` through same-key reconciliation | Reconciled |
| R5 | Both rails cryptographically verify exact raw callback bytes; the SGD rail also applies source filtering and a provider read | Reconciled |
| R9 | Hosted tool inventory/auth is current; every hosted tool is confirmation-required, mutations additionally pass Approval_Gate, and only the excluded Treasury capability is Public Preview | Reconciled |
| R7, R8, and R10 | `refunded` is a distinct tenth public/surface/MCP/receipt terminal state and never projects as `paid`; SGD-rail refund stays zero-call until an exact official contract is bound | Reconciled |
| R11 and economics | Sandbox admission, proof-complete rail status, source-digest-bound local VCCs, provider sandbox, browser, protected integration, mirror, and delivery remain separate; provider-inclusive TCO is unknown | Reconciled |
| R13 | The single existing Paywall owns one four-phase lifecycle and rejects non-trusted or malformed invocation before state, storage, or egress | Reconciled |
| R14 | XSGD/Avalanche tuple, one funding reservation, provider-credit authority, external signer, and no-return-transfer cancellation are separate fail-closed capabilities | Reconciled |
| R15 | Discovery owns an immutable envelope, injection/cancellation stops, five-page/twelve-action/two-model-call bounds, and one cost row per model call; a real browser owner and merchant remain external | Reconciled |
| R16 | Approval TTL/restart/atomic consumption, first authorization identity, local reservation, secret canaries, and safe close are durable; provider card grants and secure credentials remain unavailable | Reconciled |
| R17 | Checkout revalidation, secure injection, merchant/issuer agreement, outcome uncertainty, receipt, and disposal are required; no external checkout is enabled by local conformance | Reconciled |

---

# PART I - PRD

## Feature: Two-Rail Payments Capability

### Problem Statement

A agentic-graph buyer in Singapore is offered a card-only checkout, and a agentic-graph client that is browser-first, local-first, offline-first, and mobile-first cannot structurally hold a payment secret. The result is three concrete losses. Buyers who transact with PayNow or SGD bank transfer abandon at the payment step. Buyers on an intermittent mobile connection tap twice and fear a double charge, because no client-generated identity ties the retry to the first attempt. Operators cannot tell whether a rail is configured well enough to accept money, because readiness lives in undocumented manual steps.

The opportunity is one payments capability with two provider-neutral rails behind one
deterministic selection contract: a global card rail and an SGD fiat rail, with XSGD exposed
only after its separate capability gate closes. The client keeps no credential, retries are
replay-safe, provider events are authenticated, and terminal payments project into one
locally readable record. The fixed-infrastructure target is 0.00 USD; total cost remains
unknown until provider commercial schedules and usage are known.

A second, buyer-side opportunity is now explicit. A Singapore user can delegate a bounded
e-commerce purchase to an agent only if four milestones close in order: a KYC-verified
provider account is funded with XSGD, the agent finds an item without accepting instructions
from the merchant page, one disposable virtual card is issued inside the approved spend
envelope, and checkout completes without exposing card credentials to a model, log, or local
store. Today those steps have no single control surface and no shared completion record.
Version 1.2 extends the existing Paywall as that control surface; it does not introduce a
second Paywall, panel, route owner, or client controller.

### Personas

| Persona | Job to be done | Primary pain | Success signal |
|---|---|---|---|
| Buyer_SG | Unlock a paid agentic-graph capability paying in SGD from a phone on an unreliable connection | Card-only checkout excludes PayNow; a lost tap looks like a possible double charge | Payment reaches a terminal state within 90 seconds and a local receipt is readable offline |
| Buyer_Global | Pay by card in a non-SGD currency and retry safely | A retried card payment may create a second charge | Exactly one provider object exists per purchase attempt |
| Buying_Agent | Find and purchase one instructed e-commerce item with an XSGD-backed disposable card | No structured purchase envelope, card-credential boundary, or end-to-end lifecycle proof | One approved item, one bounded card, one checkout, no credential reaches a model or store, and every financial transition is auditable |
| Solo_Operator | Enable a rail from zero state and prove it works before exposing it | Unknown prerequisites; silent configuration drift; secrets leaking into visible config | One command per rail names every missing input and exits non-zero when the rail is not ready |

Buyer_Global is the non-SGD variant of the Buyer_SG journey and shares journey JB. It is named separately because R3 is written from its perspective.

### Journey JB: Buyer_SG - complete a purchase with an unreliable connection

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Buyer decides to unlock a paid capability | Payment_Surface | Unclear which currency and method apply | Rail selected from locale and currency without asking |
| Discover | Buyer sees the price in SGD and the available method | Payment_Surface | Card-only checkout excludes PayNow users | SGD rail offers an account-granted PayNow method; XSGD is shown only when independently ready |
| Engage | Buyer confirms while the connection is intermittent | Payment_Surface plus Intent_Queue | Tap is lost; buyer retaps and fears a double charge | Client_Intent_Key makes the retry replay-safe |
| Complete | Payment confirms and the capability unlocks | Payment_Surface | Silent pending state with no explanation | Explicit pending, paid, and failed states each with a next action |
| Return | Buyer reopens later and reads a receipt | Payment_Record_Document | Receipt exists only in a provider dashboard | Local receipt projection readable with zero network requests |

### Journey JA: Buying_Agent - purchase on behalf of a buyer

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Agent receives a purchase intent | Agent host | No structured payment target | Discoverable payment capability |
| Discover | Agent reads discovery metadata at zero token cost | Agent_Discovery_Surface | HTML scraping | Machine-readable capability document with typed schemas |
| Engage | Agent requests a payment intent | Agent_Discovery_Surface plus Approval_Gate | Unbounded agent spend | Approval gate authorizes before money moves |
| Complete | Payment settles and the agent receives a typed result | Agent_Discovery_Surface | Result shape varies per rail | One rail-neutral result schema |
| Return | Agent reads the settlement proof | Payment_Record_Document | No audit trail | Record carrying the provider reference and a cost log entry |

### Journey JX: Buying_Agent - complete an XSGD-backed e-commerce purchase

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Buyer gives one typed purchase instruction and opens the existing Paywall | FloatingPanel Chat plus Payment_Surface | Natural-language scope can hide budget, merchant, and deadline ambiguity | Paywall normalizes one immutable purchase envelope before any financial call |
| Discover | Buyer authorizes XSGD funding, then the agent searches only allowed merchant origins | Payment_Surface plus Commerce_Discovery_Harness | Wrong network or page prompt injection can redirect money or change the requested item | Funding fails closed on network, token, KYC, and balance mismatch; page content is untrusted data |
| Engage | Buyer reviews one item candidate and approves one disposable card | Payment_Surface plus Approval_Gate | A reusable or overfunded credential creates unbounded spend | Card amount, currency, merchant policy, e-commerce-only use, and expiry are bound to the approval |
| Complete | Agent fills the merchant checkout, completes required buyer authentication, and waits for both merchant and issuer results | Secure_Card_Broker plus external merchant checkout | Price drift, add-ons, 3DS, timeout, or an ambiguous authorization can create an unsafe partial purchase | Mismatch stops before authorization; indeterminate results reconcile before retry; later authorizations stop immediately and permanent close waits for the source-bound safe point |
| Return | Buyer reopens the same Paywall and reads the lifecycle receipt offline | Payment_Surface plus Payment_Record_Document | Funding, card, and order evidence live in separate systems | One minimized record links funding, candidate, card reference, authorization, order, cost, and disposal status |

#### Existing Paywall lifecycle crosswalk

**Current Dev candidate**: the canonical overlay remains mounted by `CanvasViewport` when
the provider-neutral `payments.paywallEnabled` setting (persisted as
`kg:payments:paywallEnabled`) is enabled and FloatingPanel Chat is open. A one-time migration
reads and removes the legacy Stripe-specific key. The same overlay now accepts one
identity-bound direct-import invocation, validates the immutable purchase envelope before
state or storage mutation, and renders Funding, Discovery, Issuance, and Execution as
mobile-safe blocked phases.

This is deterministic source/component evidence only. Merchant page content cannot invoke,
approve, or change the frozen purchase envelope; no event, query, `postMessage`, storage, or
global invocation channel was added. Closing before the first financial approval causes zero
provider or financial calls. Once a funding reservation, transfer, card, or authorization
exists, closing/cancelling stops new spend-bearing calls and later phases but does not
suppress mandatory reservation release, provider reads, outcome reconciliation,
authorization blocking, or source-bound safe closure. No real-browser pixels or provider
transaction are claimed.

| Lifecycle milestone | Target enhancement of the existing Paywall | Required buyer action | Completion signal |
|---|---|---|---|
| Funding | Show KYC eligibility, network, token, requested XSGD amount, gas readiness, and provider-credit status | Approve the exact funding transfer or cancel | On-chain receipt plus authoritative provider account credit; Issuance stays disabled until the card-settlement bridge is verified |
| Discovery | Show bounded search progress and one or more schema-valid item candidates | Select one candidate or refine/cancel the original instruction | Candidate matches allowed origin, item constraints, amount ceiling, and freshness window |
| Issuance | Show the final amount/currency, merchant policy, expiry, and disposal rule; never show PAN or CVV | Approve one issuance envelope | One active virtual-card reference with exact controls and secure-injection readiness |
| Execution | Show checkout progress, any buyer-authentication handoff, issuer authorization, merchant order result, and card disposal state | Complete provider-hosted authentication if required; otherwise observe/cancel | Merchant and issuer agree, receipt persists, later authorizations are blocked, and disposal is `closure_pending` or safely closed |

### Journey JO: Solo_Operator - enable a rail from zero state

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Operator decides to accept payment on a new rail | MainPanel Commerce, Payments subsection | Unknown prerequisites | Readiness_Gate names every missing input |
| Discover | Operator reads which credentials the rail needs | Readiness_Gate output | Secrets leak into visible config | Gate fails when a secret name appears in visible variables |
| Engage | Operator configures sandbox credentials | Server-side secret store | Manual undocumented steps | One command per rail |
| Complete | Operator observes a confirmed sandbox payment | Payment_Surface plus Readiness_Gate | No end-to-end proof | Sandbox payment reaches a terminal state |
| Return | Operator re-runs the gate after a change | Readiness_Gate output | Silent drift | Gate reports per-rail status and mutates nothing |

### User Stories

| ID | Story | Journey stage | Requirement |
|---|---|---|---|
| PS-1 | As a Solo_Operator I want every payment credential held only server-side so that a local-first browser client can never leak a payment secret. | JO-Discover, JO-Engage | R1 |
| PS-2 | As a Buyer_SG I want the right rail chosen for my currency and region without being asked so that I can pay with a method I already use. | JB-Trigger, JB-Discover | R2 |
| PS-3 | As a Buyer_Global I want a card payment I can retry safely so that a lost response never charges me twice. | JB-Engage | R3 |
| PS-4 | As a Buyer_SG I want to pay in SGD with PayNow or bank transfer, or settle in XSGD, so that I am not forced onto a card rail. | JB-Discover, JB-Engage | R4 |
| PS-5 | As a Solo_Operator I want provider callbacks authenticated and applied exactly once so that a replayed or forged event cannot unlock a paid capability. | JB-Complete, JA-Complete | R5 |
| PS-6 | As a Buyer_SG I want a purchase started with no connection to resolve correctly when the connection returns so that I neither lose the purchase nor pay twice. | JB-Engage, JB-Complete | R6 |
| PS-7 | As a Solo_Operator I want terminal payments written to one inspectable local document so that I can audit and show a receipt without opening a provider dashboard. | JB-Return, JA-Return | R7 |
| PS-8 | As a Buyer_SG on a phone I want the payment state and my next action always visible so that I am never left guessing whether I paid. | JB-Discover, JB-Complete | R8 |
| PS-9 | As a Buying_Agent I want zero-token discovery and an approval-gated payment tool so that automated purchase is possible without unbounded spend. | JA-Discover, JA-Engage | R9 |
| PS-10 | As a Solo_Operator I want every failure typed and every refund traceable so that I can resolve a buyer problem without guessing. | JB-Complete, JO-Return | R10 |
| PS-11 | As a Solo_Operator I want per-rail readiness and per-call cost visible before I accept a payment so that I never expose a half-configured rail and never pay for hidden model calls. | JO-Trigger, JO-Complete, JO-Return | R11 |
| PS-12 | As a Solo_Operator I want the capability to hold as little regulated data as possible and stay inside Dev authority so that compliance exposure and release risk stay bounded. | JO-Discover, JO-Return | R12 |
| PS-13 | As a Buyer_SG I want one existing Paywall to show the complete agentic purchase lifecycle so that I can understand and stop the agent at every financial boundary. | JX-Trigger, JX-Return | R13 |
| PS-14 | As a Buyer_SG I want the exact approved XSGD amount moved on the intended network into my KYC-verified provider account so that the issued card is backed without agentic-graph taking custody. | JX-Discover | R14 |
| PS-15 | As a Buyer_SG I want the agent to find only an item matching my immutable instruction so that merchant content cannot expand the domain, product, quantity, or budget. | JX-Discover | R15 |
| PS-16 | As a Buyer_SG I want one disposable virtual card issued only after I approve the chosen item so that a compromised checkout cannot spend beyond that purchase. | JX-Engage | R16 |
| PS-17 | As a Buyer_SG I want checkout to stop on price drift, authentication failure, or uncertain issuer state, block repeat authorization immediately, and complete safe closure when settlement permits so that one instruction cannot become repeated spend. | JX-Complete, JX-Return | R17 |

### Acceptance Criteria

R1-R12 summarize the requirements source in Given-When-Then form and translate its existing
Verifiable Completion Conditions without weakening them. R13-R17 are accepted follow-on VCCs
in requirements version 0.4.0; their provider, browser, protected-integration, mirror, and
delivery evidence remains independently blocked.

#### R1 - Server-side trust boundary and secret custody

**Given** a browser-first Payment_Client and a server-side Payment_Trust_Boundary, **When** any payment or provider-tool operation runs, **Then** only the trust boundary sends a provider credential, each service and environment uses a separate least-privilege credential, every provider request and callback meets its authenticated and versioned contract, raw URL-encoded StraitsX query pairs are sorted lexicographically without decode/re-encode before signing, a signing failure stops before fetch and records zero provider calls, and a planted secret in client output or visible configuration fails readiness with configuration unchanged.

> **VCC translation**: `Verify a focused check reports zero secret-name or secret-value occurrences in client output and visible configuration and fails when a secret is planted; verify adapter, agent, sandbox, and live credential owners are distinct and least-privilege; verify every enabled provider contract reports authenticated request, authenticated callback, and explicit version configuration; verify repeated raw query pairs retain their encodings and sort byte-lexicographically in the canonical request; verify a signing failure stops before fetch with providerCallCount=0; verify the check performs zero writes`

#### R2 - Rail selection

**Given** a requested currency, requested settlement asset, and per-capability sandbox
admission,
**When** the Rail_Router runs, **Then** exactly one rail is selected before any provider call:
SGD fiat may select the admitted SGD rail, XSGD selects it only when the separate XSGD
capability is admitted, and a supported card-settled currency may select the admitted card
rail. A single
eligible rail records reason `only_ready_rail`; no eligible rail returns `rail_unavailable`
with zero provider objects; identical inputs return identical rail and reason. Complete
sandbox configuration can set `admissionRails` true without promoting proof-complete `rails`.
The request must exactly match the one server-owned buyer product; missing authority or a
caller price, currency, or settlement-asset mismatch returns `capability_unavailable` before
D1 or provider contact.

> **VCC translation**: `Verify a selection table covers admitted and unadmitted SGD fiat, separately admitted and unadmitted XSGD, supported card currency, single-eligible-rail, and no-eligible-rail; verify rail and reason persist before any provider call; verify identical inputs return identical output across 100 generated cases with zero provider calls; verify admissionRails can be true while proof-complete rails remains false; verify the exact server-owned buyer product is projected and caller mismatches fail before D1 or provider contact`

#### R3 - Card-rail intent creation and idempotency

**Given** the Rail_Router selected the card rail and the reference implementation identifies
its hosted checkout session as the authoritative object, **When** that rail creates or retries
a payment, **Then** one Client_Intent_Key owns at most one provider object, changed parameters
return `intent_parameter_conflict`, provider and correlation identifiers are recorded, an
indeterminate response remains `provider_outcome_unknown` until reconciled without a new
operation key, provider create is never re-POSTed once local intent age reaches the 23-hour
safety window, and paid capability unlocks only from the authoritative object's financially
successful state.

> **VCC translation**: `Verify the hosted checkout session is the one authoritative card object; verify replay and delayed replay leave one provider object and one local record; verify changed parameters return intent_parameter_conflict; verify transport and provider uncertainty preserve provider_outcome_unknown and reconcile without a new logical key; verify provider create is never retried at or after the 23-hour local safety window; verify a non-financially-successful state unlocks nothing and nested object states are not conflated`

#### R4 - StraitsX rail for SGD fiat and XSGD

**Given** exactly one configured SGD-rail integration model, one required
`STRAITSX_FUND_FLOW`, and its granted prerequisites, **When** the Rail_Router selects that
rail, **Then** the model-flow pair is validated before authentication, signing, or fetch; an
SGD collection uses only the granted method, preserves the returned payment instruction,
owns one stable logical operation identity across retries, reconciles uncertain results
before retry, and unlocks only from provider-confirmed completion. A missing or invalid flow,
model-flow mismatch, signing failure, unsupported environment, XSGD request, or unbound
refund reports an empty provider call list and zero provider calls. XSGD remains
`capability_unavailable` until its exact account-granted endpoint, network, and settlement
contracts are bound.

> **VCC translation**: `Verify one configured model, STRAITSX_FUND_FLOW, and granted-product owner; verify missing or invalid flow returns fund_flow_unresolved and a model-flow mismatch returns integration_model_unsupported before authentication or fetch with calls=[] and providerCallCount=0; verify signing/config failures, xsgd, and unbound refund likewise make zero provider calls; verify the buyer instruction matches provider output; verify uncertain retries preserve one logical operation and one completed record`

#### R5 - Provider event authentication and replay-safe settlement

**Given** an inbound provider event, **When** the Provider_Event_Ingress processes it, **Then** it cryptographically authenticates the exact received bytes before parsing, applies any provider-specific replay and source controls, deduplicates repeated and semantically duplicate events without assuming delivery order, durably claims the event, acknowledges successful receipt promptly, and applies settlement at most once. Any authenticity failure changes no state; paid capability unlocks only after an authoritative provider read matches success state, intent identifier, minor-unit amount, and currency.

> **VCC translation**: `Verify altered bytes, wrong secret, stale replay input, or disallowed source is rejected before parse with zero state change; verify repeated, semantic-duplicate, and reordered events produce one settlement side effect; verify successful receipt is acknowledged promptly, failed claims remain reprocessable, and any success-state, amount, currency, or intent mismatch leaves the record unpaid`

#### R6 - Offline intent queue and reconnect reconciliation

**Given** an unreachable Payment_Trust_Boundary, **When** a buyer requests a payment, **Then** the client persists only an unsent intent record with a UUID Client_Intent_Key generated once per purchase attempt and displays `queued_offline`; it creates no provider object, QR code, destination, or provider-derived status while offline. The queue survives reload, and on reconnect the trust boundary submits records in creation order one key at a time, preserves durable local uniqueness beyond any provider idempotency-retention window, returns an existing record for an already-owned key, and accepts a terminal state only from an authenticated provider read or event. Once local intent age reaches the 23-hour provider-create safety window, reconciliation does not re-POST provider create and requires provider-read or operator resolution. An unresolved record stops at a stated bound as `reconciliation_unresolved`, paid capability remains locked, the queue stores no credential or card or bank identifier, and a 101st enqueue fails closed without evicting any of the 100 existing records.

> **VCC translation**: `Verify an offline request persists queued_offline and survives reload while producing no provider call, QR code, destination, or provider status; verify submitting one Client_Intent_Key N times creates at most one provider object across 100 generated interleavings; verify a queued intent at or after the 23-hour provider-create safety window is not re-POSTed and requires provider-read or operator resolution; verify only an authenticated provider read or event can establish terminal state; verify an unresolvable record stops at the stated bound, unlocks nothing, and the queue contains no credential, card, or bank identifier; verify a 101st enqueue returns queue_capacity_reached and preserves all 100 existing records`

#### R7 - Payment record serialization and receipt round-trip

**Given** an intent record reaching a terminal state, **When** the Record_Serializer runs, **Then** one entry is appended carrying the intent identifier, Client_Intent_Key, selected rail, minor-unit amount, currency, settlement asset, terminal state, provider object identifier, and terminal timestamp, entries are emitted in a stable order with base-10 integer minor units, LF line endings, and a single trailing newline, parsing then re-serializing any valid document is byte-identical, serializing then parsing then serializing any valid record set is byte-identical, a malformed document yields a typed parse error naming the failing line with document bytes unchanged, no entry carries a card number, bank account number, credential, buyer email address, or provider customer identifier, `refunded` remains `refunded` rather than `paid`, and the offline receipt view renders from local storage with zero network requests.

> **VCC translation**: `Verify every terminal record produces exactly one entry with all nine named fields populated; verify parse then print is byte-identical for 100 generated valid documents; verify print then parse then print is byte-identical for 100 generated record sets; verify a malformed document yields a typed parse error naming the failing line with file bytes unchanged; verify no entry contains a card number, bank account number, credential, email address, or provider customer identifier across 100 generated records; verify refunded round-trips distinctly from paid; verify the receipt view renders from local state with zero network requests`

#### R8 - Buyer payment surface states

**Given** the server-owned buyer product or an active intent record, **When** the Payment_Surface renders, **Then** it displays exactly one of `idle`, `queued_offline`, `pending_provider`, `paid`, `refunded`, `no_payment_required`, `failed`, `expired`, `cancelled`, or `reconciliation_unresolved` together with the server-owned product amount before intent creation and the matching persisted amount, selected rail, and payment instruction afterward. The `queued_offline` state states that the payment is held locally and will be submitted on reconnect; `refunded` is labelled distinctly, exposes a refund-receipt action, and withholds paid capability. State changes come from the single client-owned snapshot with no surface-derived payment state, a failure shows a buyer-safe reason and one retry action reusing the existing Client_Intent_Key, the surface has no horizontal overflow at 375 by 812 CSS pixels, and every control is keyboard reachable with the current state exposed to assistive technology as text.

> **VCC translation**: `Verify each of the ten states renders a distinct labelled state and documented next action; verify idle price comes from the server-owned buyer product; verify refunded never projects as paid; verify no horizontal overflow at 375x812 and every control is keyboard reachable with a text state announcement; verify the surface reads the shared payment snapshot and holds no local payment state field`

#### R9 - Agent payment discovery and approval-gated tools

**Given** an external agent, **When** it discovers and invokes the payment capability, **Then**
machine-readable metadata, the one resolved server-owned buyer product, and typed schemas are
returned with zero model calls and zero model cost, without a multi-product or entitlement
catalog. agentic-graph's local policy marks every hosted provider tool confirmation-required, and
state-changing or spend-bearing calls additionally pass the existing Approval_Gate before
provider contact. Interactive, autonomous, connected-account, sandbox, and live access remain
explicitly separated under least-privilege authentication. The provider tool inventory is
reconciled against its current official contract, one rail-neutral result shape is returned,
and no new proxy tier is added. Public HTTP `origin = "agent"` creation is denial-only:
an arbitrary caller-supplied `approvalRef` returns `approval_missing` before D1 access, and only
the approved MCP host can reach agent-create service execution. After verification, that host
derives a non-secret `payment-action:<tokenId-or-issuedAt>` correlation reference and strips
the raw approval token before invoking the Worker adapter.

> **VCC translation**: `Verify discovery validates, projects only the resolved server-owned buyer product, introduces no catalog, and reports zero model cost; verify local registration marks every hosted tool confirmation-required and an unapproved mutation makes zero provider calls; verify public HTTP origin=agent create rejects an arbitrary approvalRef before D1; verify the approved MCP host derives a non-secret payment-action approvalRef only after validation and strips the raw token before one adapter call; verify each access mode resolves only its least-privilege authentication and environment; verify current allowlisted tools match the official provider manifest while excluded capabilities stay unavailable; verify both rails return one result shape and no new proxy exists`

#### R10 - Typed failures and refunds

**Given** a provider failure or an Approval_Gate-authorized MCP-host refund request, **When** the trust boundary handles it, **Then** the operator record preserves the provider's typed error and correlation details while buyer output remains safe. The public HTTP refund path returns `approval_missing` before D1 access and cannot call the refund service. Transport or provider uncertainty stays `provider_outcome_unknown` through bounded same-operation reconciliation and is never mislabeled failed. A verified refund on a paid record is idempotent and traceable; successful refund or authoritative provider-read refund state remains `refunded` across the public status, MCP result, Payment_Surface, and receipt and never projects as `paid`; an unbound rail refund returns `provider_operation_unverified` with zero provider calls; and a refund on a non-paid record returns `refund_not_applicable` with zero provider contact.

> **VCC translation**: `Verify each provider error class maps to distinct operator output with internals excluded from buyer output; verify uncertain cases retain provider_outcome_unknown, preserve one operation identity, and never create a second object; verify public HTTP refund returns approval_missing before D1 access and only the approved MCP host can reach refund execution; verify a supported paid-record refund records one reference under replay and projects refunded distinctly across public, MCP, surface, and receipt contracts; verify unbound and non-paid refunds make zero provider calls with their respective typed results`

#### R11 - Cost observability, token economics, and readiness gates

**Given** a configured Authoring-lane runtime, **When** payments run and the Readiness_Gate is
invoked, **Then** every provider call has one cost entry, deterministic payment paths make
zero model calls, and optional explanation remains typed, bounded, costed, and fallback-safe.
The non-mutating gate reports credential-name presence without values, environment and version
configuration, the three server buyer-product inputs, the StraitsX integration model,
`STRAITSX_FUND_FLOW`, account grants, callback/signature readiness, and clock health.
`admissionRails` omits paid-settlement evidence only and can allow a fully configured first
sandbox attempt, while proof-complete `rails` remains false until an authenticated paid
sandbox record round-trips. A connectivity probe or admission entry cannot mark a rail ready.
Local `runtime-ready` requires satisfying Evidence References for every attached VCC,
including a recorded authenticated sandbox event plus authoritative provider read reaching
the rail-specific success state; no local result advances delivered readiness.

> **VCC translation**: `Verify every provider call has one cost entry and a deterministic run reports zero model calls and 0.00 model cost; verify the gate exposes no credential values, performs zero writes, and fails closed on every missing or mismatched readiness input; verify admissionRails can be true while rails remains false and cannot promote any readiness or delivery rung; verify connectivity evidence alone cannot promote the rail; verify runtime-ready requires a satisfying Evidence Reference for every VCC, including authenticated event, provider read, and rail-specific success; verify delivered rung remains independent`

#### R12 - Data minimization, compliance boundary, and release boundary

**Given** the payments capability in Dev authority, **When** any payment data is stored, transmitted, or released, **Then** no card number, card verification value, or full bank account number is stored in any agentic-graph store, buyer identity verification is delegated to the selected provider, idempotency keys and provider metadata exclude email addresses and personal identifiers, no payment record field enters a model prompt, the public status response carries exactly the intent identifier, state, minor-unit amount, and currency, a live-mode credential under sandbox mode returns typed `mode_mismatch` with zero provider contact, no production mirror change and no Cloudflare deployment occurs without a separate explicit release instruction, and no second payment Worker, payment store, or payment settings registry is added.

> **VCC translation**: `Verify no store schema field can hold a card number, CVV, or full bank account number and a planted value is rejected; verify no idempotency key or provider metadata value contains an email address or personal identifier across 100 generated records; verify no payment record field appears in any model prompt in a recorded run; verify the public status response contains exactly the four permitted fields; verify a live-mode credential under sandbox mode returns mode_mismatch and contacts no provider; verify the change set touches no production mirror path and no Cloudflare deployment target and introduces no second payment worker, store, or settings registry`

Provider-side customer profiles, KYC, and bank-account linking are documented provider capabilities, not agentic-graph capabilities ([StraitsX API guides](https://docs.straitsx.com/docs/introduction)). Metadata limits of up to 50 keys, key names at most 40 characters, values at most 500 characters, no square brackets in key names, and the prohibition on storing bank account numbers or card details in metadata or `description` are Stripe-documented ([Stripe API](https://docs.stripe.com/api)).

#### R13 - Existing Paywall invocation and lifecycle control

**Given** one trusted buyer instruction containing an allowed merchant set, item constraints,
quantity, maximum total, currency, and expiry, **When** the buyer starts an agentic purchase,
**Then** the single existing Paywall opens and projects Funding, Discovery, Issuance, and
Execution in order under one lifecycle identifier. Before the first financial approval,
closing, hiding, cancellation, malformed input, or a page-originated trigger makes zero
provider or financial calls. After financial state exists, cancellation blocks new
spend-bearing calls and later phases while mandatory reservation release, provider reads,
outcome reconciliation, authorization blocking, and safe closure continue. Lifecycle phases
compose with, rather than replace, the specified rail-neutral payment states. No second
Paywall, top-level tab, route owner, payment controller, Worker, or store is created.

> **VCC translation**: `Verify one trusted instruction mounts exactly one existing Paywall and one lifecycle identifier; verify the four phase labels and next actions render without horizontal overflow at 375×812; verify pre-approval hidden, closed, malformed, page-originated, cancelled, and unapproved triggers make zero provider or financial calls; cancel at Funding, Discovery, Issuance, and Execution and verify zero new spend-bearing calls while only required unreserve/read/reconcile/block/safe-close work continues; verify the implementation adds no second Paywall, panel, route owner, client payment controller, Worker, or store`

#### R14 - KYC-bound XSGD funding

**Given** a provider-confirmed KYC-verified account, an approved funding amount, and an
account-granted XSGD network, **When** Funding runs, **Then** the runtime validates the exact
network identity, token contract, destination deposit address, signer authority, gas
readiness, amount, and provider product grant before transfer. One funding key produces at
most one transfer. The phase completes only after both an accepted on-chain receipt and an
authoritative provider balance read credit the expected XSGD amount; a token contract address
is never treated as a deposit address. Wrong network, token, destination, KYC state, grant,
amount, or signer state fails before egress. On cancellation, expiry, discovery failure, or
issuance failure before authorization, Purchase_Lifecycle_Coordinator instructs
Funding_Adapter to atomically release the unused local balance reservation exactly once.
Already credited XSGD remains in the buyer's provider account; agentic-graph never broadcasts an
automatic return transfer, stores a private key, or takes custody.

> **VCC translation**: `Verify the approved funding command produces one transaction hash and one provider-credit reference under replay; verify wrong chain, token, destination, KYC, grant, amount, gas, or signer fixtures produce typed failures with zero egress; verify an accepted chain receipt without matching provider credit does not advance Funding; cancel or fail after funding and verify the unused local reservation is released exactly once, credited XSGD remains in the buyer provider account, and no return transfer is broadcast; verify no private key, seed phrase, raw signed transaction, or regulated identity field enters client state, logs, records, or model input`

#### R15 - Bounded e-commerce discovery

**Given** a funded lifecycle and one immutable purchase envelope, **When** Discovery scans an
allowed e-commerce origin, **Then** merchant content is treated only as untrusted data and
cannot change the allowed origins, item constraints, quantity, budget, currency, deadline,
approval policy, or tool access. Deterministic DOM and structured-data extraction runs before
any model call. The loop visits at most five product pages, performs at most twelve browser
actions, makes at most two model calls, and returns typed candidates containing merchant
origin, canonical product URL, product/variant, quantity, item amount, shipping, tax, total,
currency, observation time, and evidence selectors. Unknown mandatory cost, price drift,
blocked access, prompt injection, cancellation, or no conforming item aborts the discovery run
before another browser/model action and exits without issuing a card.

> **VCC translation**: `Verify deterministic fixtures for matching, no-match, unknown total, price drift, blocked origin, prompt injection, and cancellation before and between every browser/model action; verify every candidate matches the typed schema and original envelope; verify counters never exceed five product pages, twelve browser actions, or two model calls and every model call has one persisted cost log; verify every failure or cancellation branch creates zero cards and zero payment authorizations`

#### R16 - Approval-bound disposable virtual-card issuance

**Given** one fresh candidate, sufficient provider-confirmed funding, a KYC-eligible user, a
granted instant-issuance product, and one unconsumed approval bound to the final amount and
merchant policy, **When** Issuance runs, **Then** the Approval_Gate atomically consumes one
durable approval after final validation and before provider card creation. The approval has a
thirty-minute-or-shorter TTL, survives a process restart, and cannot authorize a changed or
second lifecycle. One lifecycle key creates at most one virtual card, activates it, and
enforces every approved e-commerce, amount, currency, merchant, geography, and time
restriction through the union of provider-native controls and repository-owned RHA policy.
If that effective union is weaker than the approval, Issuance fails before a usable card.
The card becomes one-use when the first authenticated authorization request is successfully
claimed and atomically reserved by Card_Authorization_Ingress; concurrent later requests are
denied, while a duplicate of the same provider authorization identity returns the prior
decision without a second reservation. Buyer cancellation or card expiry also blocks new
authorizations. The card then enters `closure_pending` until the exact hold, capture,
reversal, refund, and force-post contract says permanent close is safe, and is closed exactly
once. Pool exhaustion, unavailable secure credential injection, or changed candidate data
fails closed.
PAN, CVV, and full expiry never enter a model, general application store, log, screenshot, or
receipt.

> **VCC translation**: `Verify replay creates one provider card and one local card reference; verify the enforced union of provider-native controls and RHA policy covers every approved amount, currency, e-commerce, merchant, geography, time, expiry, and disposal restriction and fails before a usable card when weaker; verify pool exhaustion, changed candidate, missing grant, ineffective controls, and unavailable secure injection create no usable card; verify planted PAN, CVV, and full-expiry canaries are rejected from model input, stores, logs, screenshots, and receipts; verify the first authenticated authorization identity successfully claimed and reserved blocks concurrent later identities, an exact duplicate returns the prior decision without another reservation, cancellation/expiry also block new authorizations, closure_pending persists while capture/reversal/refund risk exists, and close occurs exactly once when safe; verify approval TTL, restart survival, atomic single consumption, unchanged replay reconciliation, changed-envelope denial, and zero provider calls for expired/rejected approval`

The final durable-approval clause is `R16-VCC6`; authorization identity and disposal remain
`R16-VCC5`.

#### R17 - Agent checkout execution and terminal reconciliation

**Given** an active disposable card and the unchanged approved candidate, **When** Execution
fills and submits checkout, **Then** only the secure credential boundary can inject card
fields, the model cannot read them, and the agent revalidates merchant origin, product,
variant, quantity, total, currency, delivery terms, and prohibited add-ons immediately before
submission. Any mismatch stops before authorization. Buyer authentication is surfaced as an
explicit Paywall handoff. The lifecycle reaches success only when the merchant order and
authoritative issuer result agree; timeout or disagreement remains
`purchase_outcome_unknown` and reconciles without a second card or checkout. A terminal
success, failure, cancellation, or expiry blocks new authorizations, records
`closure_pending` while capture/reversal/refund risk remains, closes exactly once when safe,
and writes one minimized lifecycle receipt with the current disposal state.

> **VCC translation**: `Verify sandbox merchant runs for success, decline, price drift, add-on injection, merchant-origin change, buyer-authentication required, authorization timeout, duplicate callback, merchant-only success, issuer-only success, cancellation, expiry, hold, completion, reversal, refund, and force-post fixtures; verify mismatches submit no authorization, uncertain results do not reissue or resubmit, card-field values are absent from model and telemetry output, terminal outcomes block new authorizations immediately and remain closure_pending until safe, one card closes exactly once, and one minimized receipt links funding, candidate, card reference, authorization, order, cost, and disposal state`

### Time-to-Value

| Step | Persona | Named action | Cumulative steps |
|---|---|---|---|
| T0 | Solo_Operator | Zero state: repository checked out, no provider credential configured | 0 |
| T1 | Solo_Operator | Obtain sandbox credentials for the target rail | 1 |
| T2 | Solo_Operator | Write credentials into server-side secret storage with the per-rail configure command | 2 |
| T3 | Solo_Operator | Record rail mode, Stripe request and webhook API-version pins, and the StraitsX integration model and product grant in visible configuration | 3 |
| T4 | Solo_Operator | Run the StraitsX sandbox reachability probe and the per-rail readiness gate | 4 |
| T5 | Solo_Operator | Resolve every input the gate reports as missing | 5 |
| T6 | Solo_Operator | Start one sandbox payment from the Payment_Surface | 6 |
| T7 | Solo_Operator | Drive the sandbox settlement using the provider sandbox simulation for that rail | 7 |
| T-check | Solo_Operator | Observe the intent reach a terminal state and appear in the Payment_Record_Document | 8 |

The follow-on steady-state walkthrough starts only after provider onboarding, one
KYC-eligible test/program user, one granted instant-card product, one allowed merchant
fixture, and a provider-confirmed spendable test balance exist. A real-XSGD golden path also
requires OQ-18 to establish one environment-consistent card-settlement bridge plus separate
financial authority. Those operator prerequisites are external gates, not hidden buyer steps.

| Step | Persona | Named action | Cumulative steps |
|---|---|---|---|
| AX0 | Buyer_SG | Enter one purchase instruction with item, allowed merchant, quantity, maximum total, currency, and expiry | 1 |
| AX1 | Buyer_SG | Review and approve exact XSGD funding | 2 |
| AX2 | Buyer_SG | Review and select one discovered item candidate | 3 |
| AX3 | Buyer_SG | Approve the exact issuance and execution envelope | 4 |
| AX4 | Buyer_SG | Complete provider-hosted buyer authentication only if requested | 5 |
| AX-check | Buyer_SG | Observe matching merchant and issuer results, one receipt, no permitted later authorization, and disposal `closure_pending` or safely closed | 6 |

| Dimension | Estimate | Target ceiling | Validation method |
|---|---|---|---|
| TTV steps (Solo_Operator, zero state to first confirmed sandbox payment) | 8 steps | 10 steps or fewer | Walk-through on a clean checkout with sandbox credentials |
| TTV elapsed (Solo_Operator) | about 30 min | 45 min or less | Timed first-run on a clean checkout |
| TTV steps (Buyer_SG, price shown to paid) | 3 steps | 4 steps or fewer | Timed sandbox purchase on a 375 px viewport |
| TTV elapsed (Buyer_SG) | about 45 s | 90 s or less | Timed sandbox purchase |
| TTV steps (Buying_Agent, discovery to typed result) | 3 calls | 4 calls or fewer | Scripted agent run against sandbox |
| Steady-state completion steps (Buying_Agent, pre-provisioned agentic purchase) | 6 buyer actions including optional authentication | 6 actions or fewer | Timed run against one allowed sandbox merchant |
| Steady-state completion elapsed (Buying_Agent, pre-provisioned agentic purchase) | unknown | 5 min or less | Timed end-to-end run with provider onboarding, KYC, product/card-pool grant, allowed merchant, and spendable account balance already provisioned |
| Zero-state TTV (Buying_Agent ecosystem) | unknown | One measured duration required before demo scheduling; no numeric ceiling until OQ-25 closes | Time from initial provider application through KYC/program/product/funding setup to the first golden-path receipt and safe disposal |
| First-value action | A sandbox payment reaches a terminal state and the Payment_Surface reflects it | - | Observable state transition plus a Payment_Record_Document entry |
| First-value action (agentic purchase) | One approved item produces one matching merchant order and authoritative issuer result, blocks later authorization, and records disposal as `closure_pending` or safely closed | - | Lifecycle receipt plus provider and merchant reads |

The five-minute agentic measure is deliberately a **steady-state completion time**, not TTV
from zero. True zero-state TTV includes provider application/approval, KYC, issuer-group,
plan/product/card-pool, XSGD funding/credit, secure-broker, and merchant setup; it is unknown
until OQ-25 is measured. StraitsX access depends on an approved use case and assigned
integration model ([StraitsX API guides](https://docs.straitsx.com/docs/introduction)). No TTV
walk-through has been executed because it requires operator-provided credentials and provider
grants; measurement is a pre-sign-off gate, not a claim.

