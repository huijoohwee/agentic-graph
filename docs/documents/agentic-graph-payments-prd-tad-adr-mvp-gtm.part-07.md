---
title: "Reference implementation: agentic-graph-payments-prd-tad-adr-mvp-gtm section 7"
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
source_section_lines: "2290-2729"
---

[Combined planning owner](agentic-graph-payments-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-PAYMENTS-PRD-TAD-ADR-MVP-GTM@1.3.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### Architectural Decisions

Figures are at launch scale: 40 payments per month, one selection path, one event ingestion
path, one small relational store. All costs are monthly unless stated. Provider transaction
fees are variable cost of revenue and are deliberately absent from the infrastructure rows,
because including an unknown schedule would hide which alternative changes fixed cost. These
tables compare infrastructure and operations only; provider-inclusive TCO and financial ROI
remain open under OQ-1 for Increment 1 collection and OQ-22 for Increment 2 card, PCI,
blockchain, dispute, and model economics.

---

#### ADR-1: Use a provider-hosted checkout session for the card rail

**Status**: Accepted
**Date**: 2026-07-28

**Context.** agentic-graph needs global card acceptance from a browser-first client that must never
touch raw card data. Two shapes exist: redirect to a provider-hosted payment page, or build a
card-entry surface inside agentic-graph against a payment-element SDK.

**Decision.** Create the card-rail payment object as a provider-hosted Checkout Session and
redirect the current browser window. agentic-graph renders no card field.

**Alternatives Considered**
1. **In-app payment element with a client secret**: Pros — no redirect, tighter visual
   control. Cons — pulls a client-side SDK into the bundle, moves agentic-graph toward card-data
   adjacency, and adds a second confirmation failure mode with no revenue gain at launch
   reach.
2. **FOSS alternative — self-operated payment router in front of an acquirer**: Pros — no
   vendor-owned checkout surface, multi-acquirer routing. Cons — the acquirer relationship and
   its per-transaction fee persist, so no variable cost is removed; it adds a provisioned
   runtime, PCI scope, and ops burden a solo operator cannot carry; TTV gets longer, not
   shorter.
3. **FOSS alternative — self-hosted invoicing plus manual bank transfer**: Pros — genuinely
   zero provider fee. Cons — no card acceptance at all, manual reconciliation, TTV in days.

**Rationale.** Hosted checkout is the smallest artifact delivering global card acceptance with
zero card data in agentic-graph. The FOSS router is rejected on ops burden and PCI scope, not on
licence: it converts a $0 fixed-cost architecture into a provisioned one while leaving the
acquirer fee intact, failing the zero-new-fixed-infra and min-viable-max-value constraints
simultaneously.

**TCO Impact**

| Dimension | Hosted checkout on existing Worker [Managed/Serverless] | Self-operated router [Provisioned/Self-Managed] | Self-operated router [Hybrid/Consolidated] | Delta / 12 months |
|---|---|---|---|---|
| Infra cost | $0.00 (existing free-tier Worker and D1) | ~$12.00 (always-on host plus managed DB floor) | ~$5.00 (shares one provisioned host with other workloads) | +$60 to +$144 for the FOSS variants |
| Egress cost | $0.00 (zero-egress default) | ~$1.00 (metered host egress) | ~$1.00 | +$12 |
| Token cost | $0.00 | $0.00 | $0.00 | $0.00 |
| Ops burden | Near-zero: provider patches and scales the runtime | High: OS patching, DB backup, TLS renewal, failover, plus PCI scope | Medium-high: same duties amortized across workloads; PCI scope still applies | — |
| Vendor risk | Medium: checkout surface and API versioning are provider-controlled | Low on the router; the acquirer dependency persists | Low on the router; acquirer dependency persists | — |

The consolidated variant is shown because agentic-graph could realistically place such a router on
a shared host rather than a dedicated one. Even consolidated it loses on ops burden and PCI
scope, so the comparison is not decided by infra dollars alone.

**Consequences**
- **Positive**: zero card data in agentic-graph; no card SDK in the bundle; $0 fixed
  infrastructure; shortest TTV to a working card payment.
- **Negative**: a full-page redirect in the buyer flow; checkout appearance is
  provider-controlled; one API version must be pinned and maintained because major releases
  are not backward compatible ([Stripe API](https://docs.stripe.com/api)).
- **Neutral**: refunds and disputes stay provider-mediated.

---

#### ADR-2: Add an SGD fiat rail and defer XSGD until its exact provider contract is bound

**Status**: Accepted
**Date**: 2026-07-28

**Context.** The card rail can process SGD and can expose PayNow as a payment method through
the acquirer. A second provider means a second credential set, a second event authenticity
model, and a second integration contract, so the capability gain must be real.

**Decision.** Add a distinct SGD rail for the account-granted PayNow or bank-transfer
collection method, selected by the deterministic router. The production-only XSGD
deposit-address and supported-blockchain contracts are source-bound, but keep capability
fail-closed as `capability_unavailable` until authenticated account-grant, returned-address,
provider-credit, settlement, and applicable-rail evidence is attached.

**Alternatives Considered**
1. **Card rail only, PayNow through the acquirer**: Pros — one provider, one credential set,
   one authenticity model, materially lower build cost. Cons — no SGD-pegged stablecoin
   settlement, no direct virtual-bank-account collection, no local issuer relationship; the
   agent rail is left with no non-card settlement path.
2. **FOSS alternative — direct bank API integration**: Pros — no payment-provider fee layer.
   Cons — a regulated banking relationship, per-bank integration work, no stablecoin issuance;
   not reachable by a solo operator in this increment.
3. **FOSS alternative — self-custodied on-chain acceptance only**: Pros — near-zero provider
   fee, no provider onboarding. Cons — agentic-graph would custody buyer funds, explicitly out of
   scope, and SGD buyers largely do not hold stablecoin.

**Rationale.** The second rail is justified by direct SGD collection capability, not an
unproven stablecoin promise. Both FOSS alternatives fail on regulatory reachability for a solo
operator. Cost stays contained because both rails share one router, one ingestion path, one
intent record, and one store; unresolved XSGD creates no provider traffic.

**TCO Impact**

| Dimension | Second rail on existing Worker [Managed/Serverless] | Direct bank integration [Provisioned/Self-Managed] | Direct bank integration [Hybrid/Consolidated] | Delta / 12 months |
|---|---|---|---|---|
| Infra cost | $0.00 (same Worker, same D1) | ~$12.00 (provisioned integration host) | ~$5.00 (shared provisioned host) | +$60 to +$144 |
| Egress cost | $0.00 | ~$1.00 | ~$1.00 | +$12 |
| Token cost | $0.00 | $0.00 | $0.00 | $0.00 |
| Ops burden | Near-zero infra; medium provider ops (integration-model approval, credential rotation, signing-mode setup) | Very high: banking relationship, per-bank protocol maintenance, settlement file handling | High: same duties on an amortized host | — |
| Vendor risk | Medium: access is granted against an approved use case (OQ-2); pricing unpublished (OQ-1) | Medium-high: per-bank dependency | Medium-high | — |

**Consequences**
- **Positive**: SGD buyers can receive a locally familiar method after account approval; the
  card rail stops being a single point of commercial failure.
- **Negative**: pricing remains unknown (OQ-1), the integration model is granted rather than
  chosen (OQ-2), and XSGD remains deferred (OQ-9).
- **Neutral**: transactional idempotency and callback HMAC are now documented; StraitsX
  refund execution remains blocked pending OQ-16.

---

#### ADR-3: Treat provider state as authoritative and inbound events as hints

**Status**: Accepted
**Date**: 2026-07-28

**Context.** Both rails cryptographically authenticate exact raw callback bodies, and the SGD
rail additionally documents source-address allowlisting. Neither callback payload alone is
the final authority for a local entitlement.

**Decision.** Never settle from an event payload alone. Authenticate the event, read provider
state, then require intent identifier, minor-unit amount, and currency to all match before a
record moves to `paid`.

**Alternatives Considered**
1. **Trust the signed card-rail payload directly and read state only for the SGD rail**:
   Pros — one fewer provider call on the card path, marginally faster settlement. Cons — two
   settlement code paths with different trust assumptions, which is precisely the shape that
   produces a subtle unlock bug under replay.
2. **FOSS alternative — self-hosted event broker with its own signing layer in front of both
   providers**: Pros — one uniform authenticity model inside agentic-graph. Cons — a new
   provisioned tier and a new store, both forbidden by scope; and it cannot manufacture
   authenticity the upstream provider never asserted.

**Rationale.** One provider-authoritative rule is cheaper to verify than two settlement
semantics. The extra read costs one HTTPS call and no model tokens. OQ-6 is resolved, but
signature verification and source filtering do not replace amount, currency, intent, and
terminal-state reconciliation.

**TCO Impact**

| Dimension | Provider-state-authoritative on existing Worker [Managed/Serverless] | Self-hosted event broker [Provisioned/Self-Managed] | Self-hosted event broker [Hybrid/Consolidated] | Delta / 12 months |
|---|---|---|---|---|
| Infra cost | $0.00 | ~$10.00 (broker host plus persistence) | ~$4.00 (shared host) | +$48 to +$120 |
| Egress cost | $0.00 (one extra provider read; inbound is unbilled at this scale) | ~$1.00 | ~$1.00 | +$12 |
| Token cost | $0.00 | $0.00 | $0.00 | $0.00 |
| Ops burden | Near-zero | High: broker availability becomes a settlement dependency | Medium-high | — |
| Vendor risk | Low: no new vendor | Low | Low | — |

**Consequences**
- **Positive**: replay, forgery, and payload mutation all fail the same check; one settlement
  path to test.
- **Negative**: one additional provider read per settlement; settlement latency now depends on
  provider read availability.
- **Neutral**: provider redelivery remains the recovery mechanism for transient failures.

---

#### ADR-4: Federate the existing hosted MCP transport instead of building a payment gateway proxy

**Status**: Accepted
**Date**: 2026-07-28

**Context.** Agent-initiated purchase needs a tool surface. agentic-graph already operates MCP
transports and an approval gate, and the card-rail provider publishes a hosted MCP server. The
choice is discovery-first federation over existing transports versus a unified agentic-graph payment
proxy tier fronting everything.

**Decision.** Register the hosted transport as one external transport alongside existing
agentic-graph transports. Mark every hosted tool confirmation-required in local policy; additionally
route state-changing and spend-bearing tools through the existing approval gate. Prefer OAuth where
supported, use a dedicated restricted-key fallback for autonomous access, and add no proxy
tier.

**Alternatives Considered**
1. **Unified agentic-graph payment MCP proxy**: Pros — one endpoint for agents, uniform tool
   naming, provider changes absorbed centrally. Cons — duplicates the existing dispatch layer,
   puts a new always-on component on the money path, becomes a single point of failure for
   both rails, and concentrates tools in a way that widens prompt-injection blast radius.
2. **FOSS alternative — self-hosted MCP gateway fronting both rails**: Pros — FOSS licence,
   vendor-neutral tool naming. Cons — the same duplication as option 1 plus a provisioned
   runtime; and no SGD-rail MCP surface is documented upstream (OQ-3), so the gateway would
   front exactly one real transport.
3. **No agent surface this increment**: Pros — zero cost, zero risk. Cons — forfeits journey
   JA entirely; agent commerce is the differentiating reach for the SGD rail.

**Rationale.** Federation reuses what exists and adds no runtime. The proxy alternatives buy
uniform naming at the price of a new tier on the money path, which scope forbids. Upstream also
recommends human confirmation of tools and warns about prompt injection when combining servers
([Stripe MCP](https://docs.stripe.com/mcp)); concentrating tools behind one proxy would work
against that guidance rather than with it.

**TCO Impact**

| Dimension | Discovery-first federation [Managed/Serverless] | Self-hosted MCP gateway [Provisioned/Self-Managed] | Self-hosted MCP gateway [Hybrid/Consolidated] | Delta / 12 months |
|---|---|---|---|---|
| Infra cost | $0.00 (no new component) | ~$8.00 (gateway host) | ~$3.00 (shared host) | +$36 to +$96 |
| Egress cost | $0.00 | ~$1.00 | ~$1.00 | +$12 |
| Token cost | $0.00 on discovery | $0.00 on discovery | $0.00 on discovery | $0.00 |
| Ops burden | Near-zero; the transport is provider-operated | High: gateway availability gates agent commerce | Medium-high | — |
| Vendor risk | Medium: the provider-owned tool inventory can change and must be reconciled against an allowlist (OQ-4) | Low on the gateway; the provider dependency persists | Low on the gateway | — |

**Consequences**
- **Positive**: zero new runtime; the existing approval gate stays the single spend authority;
  discovery costs `0.00`.
- **Negative**: provider-owned tool identity can shift, so the federated allowlist must be
  re-verified and unknown tools refused (OQ-4).
- **Neutral**: no SGD-rail MCP parity is claimed, because none is documented upstream.

---

#### ADR-5: Own the offline intent queue in the client rather than deferring to server-side retry

**Status**: Accepted
**Date**: 2026-07-28

**Context.** The client is offline-first. A payment confirmed with no network path must not be
lost and must not become a second charge when the network returns.

**Decision.** Persist unsent intents in browser-local durable storage keyed by a
client-generated UUID, submit them in creation order on reconnect, and resolve each to a
terminal state from provider state under a bounded retry schedule.

**Alternatives Considered**
1. **Fail fast with no queue**: Pros — no client state, simplest implementation. Cons —
   abandons the offline-first claim; the purchase intent is lost; retry behaviour becomes
   buyer-improvised, which is exactly where double charges originate.
2. **FOSS alternative — server-side durable queue**: Pros — one queue, server-owned ordering.
   Cons — it cannot receive the intent while the client has no network path, so it does not
   address the stated failure; and it adds a binding the increment does not need.

**Rationale.** The failure being defended against is the absence of a network path, so the
queue must sit on the client side of that gap. Correctness comes from the client-generated
intent key plus provider-authoritative resolution, not from the queue: the queue preserves
intent and never asserts payment.

**TCO Impact**

| Dimension | Client-local queue [Managed/Serverless] | Server-side durable queue [Managed/Serverless] | Server-side durable queue [Provisioned/Self-Managed] | Delta / 12 months |
|---|---|---|---|---|
| Infra cost | $0.00 (browser storage) | $0.00 at this volume (free-tier binding) | ~$10.00 (provisioned broker) | $0 to +$120 |
| Egress cost | $0.00 while offline | $0.00 | ~$1.00 | +$12 on the provisioned variant |
| Token cost | $0.00 | $0.00 | $0.00 | $0.00 |
| Ops burden | Near-zero; storage quota is the only concern | Low; one more binding to configure and monitor | High: broker availability, retention, dead-letter handling | — |
| Vendor risk | Low: platform storage | Low | Low | — |

**Consequences**
- **Positive**: offline-first becomes honest rather than aspirational; zero egress while
  offline; replay safety proven by a property test over generated interleavings.
- **Negative**: client storage quota and eviction become failure modes; queue depth needs a
  stated bound (OQ-12); a device wipe loses unsent intents, though no payment, since nothing
  was sent.
- **Neutral**: one intent key powers both offline replay and online retry, so there is one
  retry concept rather than two.

---

#### ADR-6: Enhance the existing Paywall as the single agentic-purchase control surface

**Status**: Proposed
**Date**: 2026-07-29

**Context.** The buyer needs a visible approval and recovery surface across Funding,
Discovery, Issuance, and Execution. The repository already has one Paywall overlay,
conditional Canvas mount, Commerce settings owner, and Stripe return runtime. It does not
currently have the target lifecycle controller or receipt projection. A new panel would split
state and make it unclear which surface owns approval.

**Decision.** Extend the existing Paywall and its current mount. Introduce exactly one future
controller and receipt projection beneath that owner. Add a separate server-owned lifecycle
projection that composes with the specified rail-neutral payment state; do not add lifecycle
values to the payment-state enum merely to drive UI. Atomically migrate the one
provider-specific Paywall configuration owner to a provider-neutral owner and remove the
legacy name rather than retaining an alias.

**Alternatives Considered**
1. New agent-shopping panel/route [FOSS]: duplicates approval, mobile layout, lifecycle
   recovery, receipt, and settings ownership.
2. Headless agent only [FOSS]: least UI code, but removes the buyer's explicit financial
   boundary and fails mobile observability.
3. Existing Paywall extension [FOSS, chosen]: smallest UI delta and one ownership chain.

**Rationale.** Reuse delivers the highest value per build hour, preserves the current entry
point, and makes "one instruction, one surface, one lifecycle" mechanically testable.

**TCO Impact**

| Dimension | Existing Paywall extension [Managed/Serverless] | New panel on same runtime [Managed/Serverless] | Separate shopping app [Provisioned/Self-Managed] | Delta / 12 months |
|---|---|---|---|---|
| Infra cost | 0.00 USD/month incremental | 0.00 USD/month incremental | Unknown hosting/runtime | Existing path avoids a new runtime |
| Egress cost | Existing provider/browser traffic only | Same plus duplicated status reads | Additional app/API traffic | Lower on chosen path |
| Token cost | H2 only; UI/read paths 0.00 | H2 only | Unknown | No token delta |
| Ops burden | Low | Medium, two UI/state owners | High | Chosen avoids duplicate support |
| Vendor risk | Low | Low | Low infrastructure risk; higher lifecycle drift | Chosen |

**Consequences**
- **Positive**: no second UI, controller, Worker, store, or approval surface.
- **Negative**: the current provider-specific setting name requires a root migration and
  focused regression proof.
- **Neutral**: seller-side ACP checkout remains owned by the Agentic Commerce document.

---

#### ADR-7: Gate XSGD-on-Avalanche funding on chain and provider-account authority

**Status**: Proposed
**Date**: 2026-07-29

**Context.** A public-chain transfer can finalize while the regulated provider account remains
uncredited, the wrong account/network tuple is configured, or the address is merely the token
contract. Funding also risks private-key custody and real-value loss.

**Decision.** Use a provider-returned authenticated deposit address and an external
buyer-approved signer. Bind mainnet chain id, token contract, network/product grant, and amount
before signing. Treat the chain receipt as necessary but insufficient; only a matching
authenticated provider callback plus authoritative balance/credit read completes Funding.
Keep real-value transfer and production-only address creation behind separate explicit
financial authority. Do not infer the Card Program settlement bridge.

**Alternatives Considered**
1. Chain receipt only [FOSS]: low latency but cannot prove regulated account credit.
2. agentic-graph-held wallet/private key [FOSS libraries]: creates custody, key security, recovery,
   and regulatory scope; rejected.
3. Provider address plus external signer and dual reconciliation [chosen]: preserves custody
   boundary and exact account proof.
4. Self-hosted AvalancheGo [FOSS]: sovereign RPC, but unnecessary for the min-viable path and
   adds storage, patching, uptime, and monitoring.

**Rationale.** Dual authority is the smallest safe bridge from public-chain movement to a
regulated spendable balance. It prevents fast finality from becoming a false funding claim.

**TCO Impact**

| Dimension | Configurable managed RPC + provider account [Managed/Serverless] | AvalancheGo node [Provisioned/Self-Managed] | Shared AvalancheGo node [Hybrid/Consolidated] | Delta / 12 months |
|---|---|---|---|---|
| Infra cost | 0.00 USD fixed target; provider/network fees unknown | Compute/storage cost unknown | Shared compute/storage cost unknown | Must be priced before live proof |
| Egress cost | RPC/provider usage-dependent | Node bandwidth/storage egress | Shared bandwidth/storage | Chosen scales to zero |
| Token cost | 0.00 | 0.00 | 0.00 | None |
| Ops burden | Low | High: patching, sync, backup, failover, monitoring | Medium/High shared ops | Chosen |
| Vendor risk | Medium account/RPC dependency | Low RPC vendor risk | Low/Medium | Dual RPC fallback remains possible |

**Consequences**
- **Positive**: no agentic-graph key custody; wrong-chain/address failures occur before value moves.
- **Negative**: provider credit and production account grants can dominate latency and block
  sandbox proof.
- **Neutral**: public-chain data remains public; KYC/order/card data stays off-chain.

---

#### ADR-8: Implement disposable-card behavior as source-bound authorization plus safe closure

**Status**: Proposed
**Date**: 2026-07-29

**Context.** Current Singapore-capable reference documentation establishes instant virtual
cards, spend limits, remote authorization, and permanent close, but not a native
single-use/disposable control, merchant lock, caller-selected expiry, or generic non-PCI
credential injection. A provider-native single-use alternative exists outside current
Singapore availability and cannot establish local readiness.

**Decision.** Keep a provider-neutral Card_Issuer_Adapter, with the StraitsX Card Program as
the current Singapore reference implementation. Require one durably consumed approval-bound
card. Enforce every approval restriction through the effective union of provider-native card
controls and repository-owned RHA policy; fail before a usable card when that union is weaker.
Define one-use at the first authenticated authorization identity successfully claimed and
atomically reserved by Card_Authorization_Ingress: an exact duplicate returns the prior
decision and concurrent later identities are rejected. Retain `closure_pending` through
source-bound hold/capture/reversal/refund risk and permanently close when safe. Require a
provider-hosted or PCI-scoped Secure_Card_Broker; raw browser scripting and model-visible
credentials are forbidden. Capability stays false until OQ-17-OQ-21 close.
([Card Issuing API](https://docs.straitsx.com/v1-CARDS/docs/introduction))

**Alternatives Considered**
1. Stripe Issuing lifecycle controls [proprietary]: native single-use behavior, but current
   official availability excludes Singapore; cannot be the local reference without explicit
   account eligibility ([Issuing availability](https://docs.stripe.com/issuing/global),
   [lifecycle controls](https://docs.stripe.com/issuing/controls/lifecycle-controls)).
2. Self-built/FOSS issuer processor [FOSS components]: no card-network membership, regulated
   program, KYC, fraud, 3DS, disputes, or settlement reach; rejected.
3. Direct XSGD merchant payment [FOSS rail]: avoids card credentials but does not work at
   ordinary card-only e-commerce sites.
4. Provider Card Program plus RHA and safe close [chosen reference]: matches the requested
   merchant reach, subject to commercial/program/PCI gates.

**Rationale.** The adapter isolates proprietary contracts while the authorization ledger
turns "disposable" into a precise, race-testable behavior instead of a marketing label.

**TCO Impact**

| Dimension | Provider Card Program [Managed/Serverless] | FOSS issuer core [Provisioned/Self-Managed] | Shared issuer core [Hybrid/Consolidated] | Delta / 12 months |
|---|---|---|---|---|
| Infra cost | Existing Worker/D1 fixed target 0.00; provider/card/PCI fees unknown | Runtime, HSM, ledger, compliance, network program unknown | Shared runtime/HSM/compliance unknown | OQ-22 blocks commercial claim |
| Egress cost | Provider/merchant traffic usage-dependent | Card network/provider connectors plus ops traffic | Shared connectors | Unknown |
| Token cost | 0.00 on issuance/authorization/execution | 0.00 | 0.00 | None |
| Ops burden | Medium: always-online RHA, reconciliation, disputes | Very high: security, availability, compliance, settlement | High | Managed reference preferred |
| Vendor risk | High until grants and pricing recorded | Low software lock-in, prohibitive regulatory reach | Medium | Adapter limits coupling |

**Consequences**
- **Positive**: amount/use/race/disposal semantics become testable; credentials remain outside
  the model and general store.
- **Negative**: RHA requires an online low-latency endpoint; the agentic purchase is not
  offline-executable even though Paywall state and receipts remain offline-readable.
- **Neutral**: no live or sandbox readiness is inherited from documentation or marketing.

### Quality Attributes

| Attribute | Scenario | Pattern | Validation |
|---|---|---|---|
| Performance | Buyer on a 4G mobile connection expects intent creation to return within 1.5 s at p95 | One provider call per creation; selection is pure computation; zero model calls | Timed sandbox run asserting p95 on the creation route |
| Performance | Settlement adds one provider state read per event; terminal state within 60 s of the event | Single ingestion path; claim then read; no queue hop | Timed sandbox event-to-terminal measurement |
| Scalability | Growth to 10× launch reach (400 payments/month) must require no new component | Stateless Worker plus one relational store; per-intent work is constant | Synthetic 400-payment month against sandbox; assert no new binding is required |
| Scalability | Event redelivery storms must not multiply side effects | Event identity ledger with at-most-once side effects | Replay one identity N times; assert a single side effect |
| Security | A forged or replayed provider event attempts to unlock a paid capability | Raw-body cryptographic verification on both rails; timestamp check on the card rail; source allowlist plus provider read on the SGD rail; terminal-state and three-field match before `paid` | R5 VCC suite: tampered body, wrong secret, stale timestamp, foreign source address, duplicate forms, reordered delivery, amount and currency mismatch |
| Security | A provider secret leaks into the client bundle or visible Worker variables | Secrets only in server-side secret storage; gate fails on any name or value found in a visible surface | R1-VCC1 with a planted secret; the check must exit non-zero |
| Security | Regulated data minimization: no card number, CVV, or full bank account number anywhere in agentic-graph | Provider-hosted collection; no schema field capable of holding them; prohibited-field assertion in the serializer | R12 VCC suite across 100 generated records |
| Security | Agent-initiated spend without authorization | Local registration marks every hosted tool confirmation-required; spend-bearing and state-changing tools pass Approval_Gate before provider contact; issuance consumes one durable TTL-bound approval atomically | R9-VCC2, R9-VCC3, R16-VCC6 |
| Observability | Operator must answer "did this settle, on which rail, and what did the provider say" without a provider dashboard | One cost log entry per provider call carrying rail, operation, provider request id, outcome, elapsed ms; provider request id persisted on the intent record | R11-VCC1 over a recorded run; R3-VCC4 |
| Observability | Provider-cost log emission fails during a financial path | Observer flags a gap without rewriting/suppressing settlement; H2 is stricter and aborts candidate selection if a model-cost row cannot persist | Inject provider-log failure and assert settlement continues with a gap; inject H2 model-log failure and assert zero candidate/card/authorization |
| Token Cost | Target load 400 payments/month with a money-path budget of 0 tokens per request | Zero model calls in selection, creation, ingestion, reconciliation, serialization | R11-VCC2: a full run reports `0.00` and zero model calls |
| Token Cost | The optional explanation harness must not become a hidden cost | H1 ships disabled, with typed schemas, a stated retry bound, a per-call cost log, and a deterministic fallback; a ceiling must be stated before enablement (OQ-13) | Cost log sampling on H1 once enabled; alert on p95 overrun of the stated ceiling |
| Token Cost | H2 commerce discovery at 40 lifecycle runs/month | Deterministic extraction first; max two model calls, 12,000 prompt plus 2,000 completion tokens per lifecycle, at least 50 percent cache-hit target | R15-VCC3, prompt-schema canary, monthly actual-versus-estimate review |
| Security | Merchant page attempts prompt injection, cross-origin navigation, or budget mutation | Page content remains untrusted facts; H2 structurally excludes financial/provider fields; deterministic validator owns origin, amount, currency, and freshness | R15 fixture matrix with zero card/authorization calls on every rejection |
| Security | Card fields, OTP, KYC data, or private key reaches a model, screenshot, log, store, or receipt | External signer, provider-hosted KYC, PCI-scoped Secure_Card_Broker, planted-secret guards, no general schema fields | R14-VCC4, R16-VCC4, R17-VCC2/R17-VCC4 |
| Correctness | On-chain XSGD transfer and provider account credit diverge | Dual chain/provider reconciliation with one funding key and authenticated callback/read | R14 property and provider-proof gates |
| Correctness | Concurrent or replayed card authorizations try to exceed one approved order | First authenticated authorization identity atomically claimed/reserved; exact duplicate returns prior decision; concurrent later identity denied; explicit hold/completion/reversal/refund states and safe close | R16-R17 race/state fixtures |
| Performance | Remote authorization must answer inside the provider's six-second timeout | Existing always-online Worker, no model call, indexed atomic reservation, internal deadline safety margin | Focused p95/p99 load result and timeout auto-decline fixture |
| Offline Behaviour | Client loses connectivity mid-lifecycle | Last minimized state/receipt remains locally readable; every financial/browser phase pauses or fails explicitly; live authorization cannot run offline | Airplane-mode and reconnect tests; no offline success claim |
| Device Reach | Buyer reviews and controls all phases at 375×812 | Existing Paywall, one next action, provider-hosted authentication handoff, no native-only UI | R13/R17 mobile browser pass across success, errors, unresolved, and `closure_pending` |
| Fixed infrastructure | 12-month projected fixed spend must stay at $0.00 against a zero-new-fixed-infra target | Existing free-tier Worker and D1; browser-local storage; zero-egress default; no new binding, tier, or store | Monthly fixed-infrastructure audit; ADR review; assert the change set adds no second worker, store, or settings registry (R12-VCC6) |
| TCO | A cheaper self-managed alternative appears for any dependency | Deployment-model variants compared separately in every ADR with ops burden stated per variant | 12-month re-evaluation per the FOSS-first rule |
| Provider-inclusive TCO | Card program, XSGD network, RPC, PCI path, settlement, disputes, and model pricing are unknown | Commercial gate separate from fixed-infrastructure target; no live enablement or zero-total-cost claim | OQ-22 12-month schedule and ROI recomputation |

