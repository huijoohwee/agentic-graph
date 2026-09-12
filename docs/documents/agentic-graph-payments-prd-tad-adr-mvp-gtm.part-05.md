---
title: "Reference implementation: agentic-graph-payments-prd-tad-adr-mvp-gtm section 5"
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
source_section_lines: "1559-2020"
---

[Combined planning owner](agentic-graph-payments-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-PAYMENTS-PRD-TAD-ADR-MVP-GTM@1.3.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### Reference implementation: Component Specifications

R1-R17 VCC identities below originate in requirements version 0.4.0. Unless a **Current Dev
candidate** is explicitly identified, a component specification remains a target contract
and not a claim that provider-backed or canonical runtime behavior exists.

---

**Component**: `Payment_Surface`
**Current Dev candidate**: the existing Paywall remains lazy-mounted by `CanvasViewport`
under the provider-neutral `payments.paywallEnabled` owner. It accepts only the unexported
identity-bound direct-import host seam, validates before state/storage mutation, renders four
blocked lifecycle phases, suppresses the ordinary checkout controller while active, and
cancels with zero provider calls. This is source/component evidence, not live-browser or
provider evidence.
**Target responsibility**: The surface renders exactly one payment state and its next action from
the single client-owned snapshot and projects the four agentic-purchase phases from the
single server-owned lifecycle snapshot.
**Target interfaces**: reads the client payment snapshot; posts an intent to `Payment_API`; emits a
retry that reuses the existing `Client_Intent_Key`; creates, reads, approves, cancels, and
resumes one `Purchase_Lifecycle_Coordinator` lifecycle.
**Dependencies**: `Payment_API`, `Intent_Queue`, `Receipt_Projection`,
`Purchase_Lifecycle_Coordinator`.
**Target configuration**: one provider-neutral Paywall enablement owner. Implementation atomically
migrates the existing provider-specific Paywall setting/key to that owner and removes the
legacy name; no alias or second setting remains. The specified rail-neutral payment states and
the separate four-phase lifecycle projection remain distinct.
**Invocation contract**: the existing `CanvasViewport` lazy mount remains the only
owner and retains its current setting-plus-Chat preconditions. Increment 2 additionally
requires a trusted host instruction before creating a lifecycle. Merchant page content
cannot mount, reopen, approve, or mutate it. Hidden/closed before first financial approval
creates zero provider/financial calls; after financial state exists it blocks new spend while
required unreserve/read/reconcile/block/safe-close cleanup continues. External `/`, `#`, `@`,
and MCP invocation stays blocked under OQ-24.
**FOSS / Vendor**: FOSS, repository-owned. Extends the existing paywall overlay owner.
**VCC Conditions**: R8-VCC1 (nine states each render a distinct label and documented next
action), R8-VCC2 (no horizontal overflow at 375×812; every control keyboard reachable; state
announced as text), R8-VCC3 (surface holds no local payment state field), R13-VCC1 (one
existing Paywall and one lifecycle), R13-VCC2 (four phases and next actions render mobile
first), R13-VCC3 (pre-approval invalid/hidden/unapproved triggers make zero calls and
post-state cancellation permits only mandatory cleanup), R13-VCC4 (no parallel owner).
**Evidence References**: fixed Canvas suite 14/14; broader payment selector 27/27; TypeScript
check passed. No live-browser result.
**Readiness rung**: Local `dev-proven`; Delivered `undocumented`.

---

**Component**: `Purchase_Lifecycle_Coordinator`
**Responsibility**: The coordinator advances one immutable purchase envelope through Funding,
Discovery, Issuance, Execution, and a terminal or explicitly unresolved result.
**Interfaces**: create/read/cancel lifecycle; compare-and-swap phase transition; consume one
approval; release an unused funding reservation; reconcile funding/card/authorization/order
references; block later authorization; drive source-bound safe closure; emit minimized
snapshot.
**Dependencies**: `Payment_Surface`, `Approval_Gate`, `Funding_Adapter`,
`Commerce_Discovery_Harness`, `Card_Issuer_Adapter`, `Card_Authorization_Ingress`,
`Payment_Record_Store`, `Receipt_Projection`.
**Configuration**: lifecycle expiry; candidate freshness; card disposal deadline; transition
table; terminal-close safety policy.
**FOSS / Vendor**: FOSS, repository-owned, inside the existing payment Worker.
**VCC Conditions**: R13-VCC1 … R13-VCC4; R14-VCC1 (unused reservation released once);
R17-VCC1 (mismatch before authorization), R17-VCC3 (uncertain outcome never
reissues/resubmits), R17-VCC5 (one minimized receipt).
**Evidence References**: fixed shared and Worker suites exercise immutable lifecycle,
same-D1 replay, approval consumption, authorization identity, cancellation, receipt, and
risk-aware close against migration `0010`.
**Readiness rung**: Local `dev-proven` for the deterministic safety kernel; Delivered
`undocumented`.

---

**Component**: `Funding_Adapter`
**Responsibility**: The adapter proves that one KYC-bound provider account has one exact XSGD
reservation for one lifecycle without holding a private key.
**Interfaces**: read KYC/product/network/token/deposit-address/balance capability; submit an
approved signer request; observe chain receipt; authenticate provider credit callback; read
authoritative credit; release reservation.
**Dependencies**: approved external signer, XSGD account API, Avalanche-compatible JSON-RPC,
`Provider_Event_Ingress`, `Payment_Record_Store`, `Cost_Observer`.
**Configuration**: environment; provider account and product grant; exact network/chain id;
XSGD contract from an authenticated capability source; RPC endpoints; callback secret;
bounded credit-read schedule; gas ceiling. Deposit addresses are provider responses and are
never derived from the token contract.
**FOSS / Vendor**: FOSS adapter over proprietary regulated-account APIs and a FOSS public
chain. See ADR-7.
**VCC Conditions**: R14-VCC1 (one transfer/credit under replay and unused local reservation
released exactly once without a return transfer), R14-VCC2 (wrong tuple fails before egress),
R14-VCC3 (chain receipt alone never advances), R14-VCC4 (no private key/KYC leakage).
**Evidence References**: exact XSGD/Avalanche tuple and local reservation/release/no-return
contracts pass; production-only account capability, signer, provider credit, transfer, and
financial proof require separate authorization.
**Readiness rung**: Local `spec-complete`; Delivered `undocumented`.

---

**Component**: `Commerce_Discovery_Harness`
**Responsibility**: The harness finds schema-valid purchase candidates on allowed merchant
origins without letting page content alter policy or trigger a financial tool.
**Interfaces**: H2 non-financial semantic match; deterministic DOM/structured-data extractor;
Candidate_Validator; cancellation signal; page/action/model counters.
**Dependencies**: canonical browser-control owner selected under OQ-23, `Cost_Observer`,
`Purchase_Lifecycle_Coordinator`.
**Configuration**: allowed origins; maximum five product pages, twelve browser actions, and
two model calls; 12,000 prompt plus 2,000 completion token lifecycle ceiling; model price and
cache target; blocked URL/content types; candidate freshness.
**FOSS / Vendor**: FOSS harness over a configurable model dependency. Deterministic extraction
is the zero-model default.
**Harness Contract**: H2. Model input contains semantic query/attribute and sanitized
non-financial text facts only. Amount, price, total, currency, lifecycle, funding, card,
authorization, order, and payment-record fields are structurally excluded.
**VCC Conditions**: R15-VCC1 (fixture matrix aborts on any injection signal), R15-VCC2
(candidate schema/envelope match), R15-VCC3 (all bounds, cancellation before the next action,
and per-call logs), R15-VCC4 (all failures/cancellations make zero card/authorization calls).
**Evidence References**: immutable candidate, injection/cancellation, page/action/model bounds,
and cost-log contracts pass in the shared suite. No canonical browser adapter or merchant run.
**Readiness rung**: Local `dev-proven` for shared deterministic contracts; browser/provider
execution remains `spec-complete`; Delivered `undocumented`.

---

**Component**: `Card_Issuer_Adapter`
**Responsibility**: The adapter creates, activates, controls, reconciles, and closes one
approval-bound virtual card without exposing card credentials.
**Interfaces**: obtain server-side access token; create/read user and card; activate card;
create spend limit; prepare 3DS; read status; close card; reconcile uncertain create/close.
**Dependencies**: `Approval_Gate`, Card Program API, `Secure_Card_Broker`,
`Payment_Record_Store`, `Cost_Observer`.
**Configuration**: separate sandbox/live hosts and client credentials; issuer group, issuing
plan, instant virtual-card product, funding source, account currency, card pool,
provider-native controls, repository-owned RHA controls, 3DS method, secure credential path,
and close semantics. Every approved restriction is enforced by at least one side of that
effective control union; every value is provider-assigned or operator-configured, never
inferred.
**FOSS / Vendor**: Proprietary card-program dependency behind a repository-owned adapter. See
ADR-8.
**VCC Conditions**: R16-VCC1 (idempotent one-card result), R16-VCC2 (effective
provider-plus-RHA controls cover the approval), R16-VCC3 (grant/pool/control/broker failures
yield no usable card), R16-VCC4 (card-field canaries absent), R16-VCC5 (atomic authorization
identity claim and safe one-time disposal), R16-VCC6 (durable single-use approval TTL,
restart, atomic consumption, unchanged replay, changed replay denial, and zero provider calls
on rejection).
**Evidence References**: durable approval consumption, replay, first authorization identity,
secret canaries, concurrency, and safe-close persistence pass locally; account/program,
issuance, effective-control, RHA, and sandbox evidence are absent.
**Readiness rung**: Local `spec-complete`; Delivered `undocumented`.

---

**Component**: `Secure_Card_Broker`
**Responsibility**: The broker injects provider-held card credentials into one allowed
merchant checkout without exposing them to the model or general application runtime.
**Interfaces**: prepare one provider credential session; bind it to lifecycle, merchant
origin, form, and expiry; inject fields; return success/failure only; destroy session.
**Dependencies**: provider-hosted or PCI-scoped credential surface, allowed merchant browser
session, `Card_Issuer_Adapter`.
**Configuration**: approved PCI mode; screenshot/telemetry redaction; allowed form/origin;
ephemeral-session TTL; cleanup guarantee.
**FOSS / Vendor**: unresolved proprietary/provider-hosted boundary. Capability remains false
until OQ-19 closes; a generic DOM script is forbidden.
**VCC Conditions**: R16-VCC3, R16-VCC4, R17-VCC2 (model-blind injection), R17-VCC4
(buyer-authentication isolation).
**Evidence References**: none; OQ-19 blocker.
**Readiness rung**: Local `spec-complete`; Delivered `undocumented`.

---

**Component**: `Card_Authorization_Ingress`
**Responsibility**: The ingress authenticates each card-network authorization request,
atomically reserves or rejects the approved amount, and reconciles follow-up events exactly
once.
**Interfaces**: provider-called authorization endpoint; separate authenticated webhook;
atomic authorization-identity claim, reservation/release/settle, exact-duplicate prior
decision, concurrent-later-identity denial; lifecycle status read.
**Dependencies**: Card Program API, `Purchase_Lifecycle_Coordinator`,
`Payment_Record_Store`, server-side secret storage.
**Configuration**: separate authorization bearer secret and webhook signing secret; provider
deadline with an internal safety margin; amount/currency/merchant/transaction-type policy;
hold/completion/reversal/refund state table.
**FOSS / Vendor**: FOSS route on the existing always-online Worker; provider callback
contract is proprietary. Offline client operation cannot approve a live card authorization.
**VCC Conditions**: R16-VCC5; R17-VCC1 … R17-VCC5, including atomic first-identity claim,
concurrency, exact duplicate, timeout, hold/completion, reversal, and mismatch fixtures.
**Evidence References**: local authorization-identity claim, exact replay, competing-identity
denial, and reservation safety pass against the real migration. No authenticated provider
ingress, deadline, hold, or event proof exists.
**Readiness rung**: Local `dev-proven` for the persistence kernel; provider ingress remains
`spec-complete`; Delivered `undocumented`.

---

**Component**: `Intent_Queue`
**Responsibility**: The queue durably holds intents created while `Payment_API` is
unreachable.
**Interfaces**: local append, ordered read by creation ordinal, mark-submitted; survives a
client reload.
**Dependencies**: browser-local durable storage.
**Configuration**: maximum queue depth (bound required, see OQ-12).
**FOSS / Vendor**: FOSS, browser platform storage. Zero egress while offline.
**VCC Conditions**: R6-VCC1 (queued record persists with a UUID key and survives reload),
R6-VCC5 (persisted queue holds no credential, card, or bank identifier field).

---

**Component**: `Reconciler`
**Responsibility**: The reconciler resolves every submitted intent to a terminal state from
provider-read state under a bounded retry schedule.
**Interfaces**: reconnect trigger; ordered submission, one `Client_Intent_Key` at a time;
bounded retry with a stated maximum attempt count.
**Dependencies**: `Intent_Queue`, `Payment_API`, both rail adapters, `Payment_Record_Store`.
**Configuration**: maximum attempt count per record; retry backoff schedule.
**FOSS / Vendor**: FOSS, repository-owned.
**VCC Conditions**: R6-VCC2 (one provider object across 100 generated interleavings of the
same key), R6-VCC3 (terminal state only from provider-read state; queue state alone never
unlocks capability), R6-VCC4 (stops at the attempt bound and reports
`reconciliation_unresolved`), R3-VCC5 (indeterminate provider outcomes remain unresolved and
object-specific states are not conflated).

---

**Component**: `Receipt_Projection`
**Responsibility**: The projection serializes terminal records to a byte-stable document and
parses that document back without loss.
**Interfaces**: `serialize(records) → bytes`; `parse(bytes) → records | typed parse error`;
offline render from local storage.
**Dependencies**: `Payment_Record_Document`, `Payment_API` (refresh only).
**Configuration**: document location; entry field order.
**FOSS / Vendor**: FOSS, repository-owned.
**VCC Conditions**: R7-VCC1 (one entry per terminal record with all nine fields), R7-VCC2
(parse-then-print byte-identical across 100 generated documents), R7-VCC3
(print-parse-print byte-identical across 100 generated record sets), R7-VCC4 (malformed
document yields a typed error naming the failing line; bytes unchanged), R7-VCC5 (no
prohibited field across 100 generated records), R7-VCC6 (renders with zero network requests).

The two round-trip properties are why this component is trustworthy rather than merely
present. They are property-based tests, not examples.

---

**Component**: `Payment_API`
**Responsibility**: The route surface accepts payment operations, enforces the approval
precondition for agent-originated calls, and returns rail-neutral typed results.
**Interfaces**: intent create; public status read returning exactly four fields; refund
request; read-view route for H0.
**Dependencies**: `Rail_Router`, `Payment_Record_Store`, `Approval_Gate`, `Cost_Observer`.
**Configuration**: sandbox mode flag; per-rail enablement; pinned card-rail request and
webhook API versions; SGD-rail integration model and granted products.
**FOSS / Vendor**: FOSS, repository-owned, on the existing zero-cost Worker runtime.
**VCC Conditions**: R1-VCC1 (no secret name or value in client bundle output or visible
Worker variables; a planted secret fails the check), R1-VCC3 (one API-version owner reflected
in every outbound Stripe request), R9-VCC5 (identical result shape across rails), R12-VCC4
(public status response carries exactly the four permitted fields).

---

**Component**: `Rail_Router`
**Responsibility**: The router selects exactly one rail per intent from currency, settlement
asset, and per-rail readiness.
**Interfaces**: pure selection function returning `{rail, reason}`; result persisted before
any provider call.
**Dependencies**: readiness state in `Payment_Record_Store`. No network access.
**Configuration**: per-rail enablement; the card-settled currency set.
**FOSS / Vendor**: FOSS, repository-owned. No dependency.
**VCC Conditions**: R2-VCC1 (selection table covers ready and unready SGD fiat, separately
ready and unready XSGD, supported card currency, single-eligible-rail, and no-eligible-rail),
R2-VCC2 (rail and reason persisted before any provider call), R2-VCC3 (identical inputs yield
identical output across 100 generated cases with zero provider calls during the property run).

Determinism here is a property, not a convention. It is what makes offline replay and agent
retry safe to reason about.

---

**Component**: `Stripe_Rail_Adapter`
**Responsibility**: The adapter creates and reads card-rail payment objects with
deterministic idempotency.
**Interfaces**: create and read the authoritative hosted Checkout Session; create refund.
**Dependencies**: server-side secret storage, `Cost_Observer`, `Payment_Record_Store`.
**Configuration**: independently pinned request and webhook API versions; return origin;
separate restricted keys for this adapter and autonomous MCP access.
**FOSS / Vendor**: Proprietary provider. See ADR-1.
**VCC Conditions**: R3-VCC1 (key ≤ 255 characters, derived from the intent key, no email or
personal identifier), R3-VCC2 (replay yields exactly one provider object), R3-VCC3 (simulated
`idempotency_error` yields typed `intent_parameter_conflict`), R3-VCC4 (provider object id and
`Request-Id` persisted per call), R3-VCC5 (uncertain outcomes stay unresolved and object-type
states are not conflated), R10-VCC1 (each documented error type maps to a distinct typed
result).

Upstream basis: API v1 replays the first result for an idempotency key, including `500`; a
`500` is still an indeterminate outcome, so the adapter retains the key and reconciles rather
than manufacturing a fresh request ([idempotent requests](https://docs.stripe.com/api/idempotent_requests),
[advanced error handling](https://docs.stripe.com/error-low-level)).

---

**Component**: `StraitsX_Rail_Adapter`
**Responsibility**: The adapter creates and reads SGD fiat collections under exactly one
approved integration model and fails closed for unbound XSGD or refund operations.
**Interfaces**: create a Payment API collection valid for the configured model and granted
product; read authoritative payment state; return `capability_unavailable` for XSGD and
`provider_operation_unverified` for refunds while their source gates remain open.
**Dependencies**: server-side secret storage, `Cost_Observer`, `Payment_Record_Store`.
**Configuration**: integration model (one per deployment); sandbox base URL
`https://api-sandbox.straitsx.com`; granted products; signing mode; callback signing secret;
secret names.
**FOSS / Vendor**: Proprietary provider. See ADR-2.
**VCC Conditions**: R1-VCC2 (mandatory header always present; signed mode additionally emits
the key id, timestamp, never-reused nonce, and Ed25519 signature over the canonical request),
R4-VCC1 (single approved integration-model and product-grant owner; unsupported flow makes
zero provider calls), R4-VCC2 (instruction matches the provider response byte-for-byte),
R4-VCC3 (unbound XSGD makes zero provider calls), R4-VCC4 (stable transactional key plus
provider read after uncertainty), R4-VCC5 (environment host matches mode), R10-VCC2 (provider
error envelope preserved).

The byte-for-byte instruction rule exists because a reformatted payment reference or amount
produces an unmatchable payment. agentic-graph presents provider instructions; it never rewrites
them.

---

**Component**: `Provider_Event_Ingress`
**Responsibility**: The ingress authenticates, deduplicates, and applies provider events at
most once.
**Interfaces**: per-rail inbound receiver; event identity ledger carrying processing status
and processing error; provider state read before settlement.
**Dependencies**: server-side secret storage (signing secret), both rail adapters,
`Payment_Record_Store`.
**Configuration**: per-endpoint signing secret name; Stripe timestamp tolerance; StraitsX
callback signing secret and documented source addresses; source-address header (see OQ-8).
**FOSS / Vendor**: FOSS, repository-owned. Extends the existing webhook processing-state
pattern, keeping in-flight and failed claims retryable rather than frozen.
**VCC Conditions**: R5-VCC1 (raw-body mutation, wrong secret, or stale Stripe timestamp
rejected with zero state change), R5-VCC2 (StraitsX HMAC and source checks pass before parsing,
then a provider read occurs), R5-VCC3 (Stripe event-id and object/type duplicates yield one
side effect), R5-VCC4 (delivery order never drives state), R5-VCC5 (failed identity
reprocessed on redelivery), R5-VCC6 (success state, amount, currency, or intent mismatch
leaves the record unpaid).

Both rails are cryptographically verified over exact raw bodies before parsing. The SGD rail
also applies the provider source-address allowlist and always performs an authoritative
provider read; OQ-6 is resolved, but the read remains a defense against stale or misleading
callback content.

---

**Component**: `Payment_Record_Store`
**Responsibility**: The store persists intent records, event identities, and cost ledger rows
for the payment Worker, plus minimized agentic lifecycle, candidate, funding reservation,
opaque card, durable approval consumption, authorization reservation, order-reference, and
disposal state.
**Interfaces**: intent/lifecycle row read and compare-and-swap write; event identity claim and
status update; funding release; approval claim/consume; card/authorization reservation; cost
ledger append; readiness snapshot read.
**Dependencies**: the existing D1 binding on the payment Worker.
**Configuration**: additive migration only. No second store.
**FOSS / Vendor**: FOSS schema on an existing zero-cost managed binding.
**VCC Conditions**: R12-VCC1 (no schema field can hold a card number, CVV, full expiry, private
key, KYC document, or full bank account number; a planted value is rejected), R12-VCC6 (no
second payment worker, store, or settings registry introduced), R13-VCC4, R14-VCC1,
R16-VCC1, R16-VCC6, R17-VCC3.

---

**Component**: `Cost_Observer`
**Responsibility**: The observer records one cost log entry per provider call and per model
call, plus bounded browser page/action counters for commerce discovery.
**Interfaces**: provider entry `{rail, operation, providerRequestId?, outcome, elapsedMs}`;
model entry `{model, prompt_tokens, completion_tokens, cache_hits, estimated_cost_usd}`.
**Dependencies**: `Payment_Record_Store`.
**Configuration**: ledger retention.
**FOSS / Vendor**: FOSS, repository-owned.
**Harness Contract**: observer role in H0, H1, and H2.
**Token Budget**: 0 prompt + 0 completion on every payment-path operation.
**Orchestration Topology**: sequential observer, no loop.
**VCC Conditions**: R11-VCC1 (every provider call in a recorded run has exactly one entry
with the five named fields), R11-VCC2 (a full intent-to-settlement run reports model cost
`0.00` and zero model calls), R11-VCC6 (read views return typed output with zero mutation and
zero model calls), R15-VCC3 (H2 records page/action/model counters and one cost row per model
call). Provider-cost log failure on a financial path flags an observability gap but cannot
rewrite or suppress settlement. H2 model-cost log persistence is stricter: failure aborts
candidate selection before any financial action. Funding, issuance, authorization,
settlement, disposal, and receipt paths remain zero-model-call.

---

**Component**: `Agent_Discovery_Surface`
**Responsibility**: The surface publishes payment capability metadata and registers
approval-gated payment tools over existing transports.
**Interfaces**: capability metadata read (zero model calls); payment tool registrations on
existing MCP transports; federation of the hosted card-rail MCP transport.
**Dependencies**: `Payment_API`, `Approval_Gate`, existing MCP transport owner.
**Configuration**: federated transport URL `https://mcp.stripe.com`; local
confirmation-required registration for every tool; OAuth preference; autonomous restricted-key reference; connected-account
restricted-key reference plus `Stripe-Account`; separate sandbox/live sessions; reviewed
tool allowlist.
**FOSS / Vendor**: FOSS surface over one proprietary federated transport. See ADR-4.
**Harness Contract**: H0 for read views. Input `{view}`; output `{entries[],
unavailableSources[]}`; cost log with `modelCostUsd: 0.00`; fallback names every unreachable
source rather than dropping it.
**Token Budget**: 0 prompt + 0 completion at any cache hit rate = `0.00` per call.
**Orchestration Topology**: sequential, max 1 iteration, circuit-breaker on any attempted
model call or state write.
**VCC Conditions**: R9-VCC1 (discovery validates against the published schema and reports
model cost zero), R9-VCC2 (local registration marks all hosted tools confirmation-required; unapproved mutations
make zero provider calls), R9-VCC3 (endpoint and current allowlist match official docs),
R9-VCC4 (OAuth, autonomous restricted-key fallback, connected-account exception, and
environment separation are explicit), R9-VCC6 (no new transport or proxy component).

Upstream basis: OAuth is preferred where supported, human confirmation is recommended,
prompt-injection caution applies when combining servers, autonomous clients may use a
vault-held restricted key, and connected-account calls use restricted keys with an account
header rather than OAuth ([Stripe MCP](https://docs.stripe.com/mcp)).

---

**Component**: `Readiness_Gate`
**Responsibility**: The gate reports per-rail configuration completeness and mutates nothing.
**Interfaces**: per-rail and combined commands; report on stdout plus a process exit code.
**Dependencies**: secret-store name listing, client bundle output, visible Worker variables,
provider reachability probe, environment and clock checks, callback verification
configuration, `Payment_Record_Store` sandbox evidence.
**Configuration**: required credential names per rail; enabled-rail set; request and webhook
version pins; integration model; granted products.
**FOSS / Vendor**: FOSS, repository-owned. Extends the existing payment readiness script
family.
**VCC Conditions**: R11-VCC3 (lists credential names without values, performs zero writes,
fails on missing input, mismatch, stale clock, absent callback verification, or absent
version pin), R11-VCC4 (Hello alone cannot promote readiness; authenticated callback plus
provider read and rail-specific success are required), R11-VCC5 (output names both Stripe
version pins and the StraitsX model/grants), R1-VCC1 (leak check), R12-VCC5
(`mode_mismatch` makes zero provider calls).

The SGD rail's cheapest check is deliberately first: Hello HTTP `200` proves that request's
connectivity and API-key authentication without creating a financial object, but it does not
prove Payment API or settlement readiness
([StraitsX Say Hello](https://docs.straitsx.com/reference/say-hello)).

---

**Component**: `Approval_Gate` (existing owner, extended not rebuilt)
**Responsibility**: The gate authorizes spend-bearing tool calls before they execute and owns
the target durable single-use issuance approval.
**Interfaces**: the existing external-tool approval contract; Increment 2 adds an atomic
claim/consume/read result beneath that owner, bound to lifecycle/candidate/amount/policy and
surviving restart.
**Dependencies**: existing owner.
**Configuration**: existing plus an Increment 2 approval TTL of thirty minutes or shorter.
**FOSS / Vendor**: FOSS, repository-owned.
**VCC Conditions**: R9-VCC2; R16-VCC6 (TTL, restart, single consumption, unchanged replay,
changed replay denial, and zero provider calls on expiry/rejection).

---

**Component**: `Payment_Record_Document`
**Responsibility**: The document holds the serialized terminal payment entries readable
without a network.
**Interfaces**: append-only write by `Receipt_Projection`; whole-document read by the parser.
**Dependencies**: local device storage.
**Configuration**: stable field order; base-10 minor units; LF line endings; single trailing
newline.
**FOSS / Vendor**: FOSS, plain text.
**VCC Conditions**: R7-VCC2, R7-VCC3, R7-VCC5.

