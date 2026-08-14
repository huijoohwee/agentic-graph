---
title: "Agentic Purchase Lifecycle Runtime - Requirements"
doc_type: "Requirements"
id: "agentic-purchase-lifecycle-runtime-requirements"
spec: "agentic-purchase-lifecycle-runtime"
version: "0.1.0"
status: "requirements-draft"
created: "2026-08-14"
updated: "2026-08-14"
author: "airvio / joohwee"
domain: "knowgrph"
lang: "en-US"
frontmatter_contract: "required"
upstream_spec: ".kiro/specs/knowgrph-payments/requirements.md"
upstream_owned_requirements: ["R13", "R14", "R15", "R16", "R17"]
sibling_spec: ".kiro/specs/xsgd-onchain-verification/requirements.md"
sibling_owned_requirements: ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"]
guidelines: "huijoohwee.github.io/guidelines/prd-tad-adr-guidelines.md"
deployment_topology: "Dev authoring only; Prod mirror and Cloudflare deployment require separate explicit authority"
integration_sources:
  - id: "straitsx-provider-account"
    role: "KYC-verified account, XSGD product grant, deposit address authority, provider credit reads and callbacks"
    reference: "https://docs.straitsx.com/docs/introduction"
  - id: "avalanche-data-api"
    role: "hosted indexed read path already bound by the sibling chain-evidence increment"
    reference: "https://build.avax.network/docs/api-reference/data-api"
constraints: ["browser-first", "local-first", "offline-first", "mobile-first", "foss-first", "tco-zero", "token-economical", "harness-first", "zero-egress-default", "no-signer-in-repository", "provider-agnostic-adapter-boundary", "single-paywall-surface"]
tags: ["payments", "agentic-commerce", "xsgd", "avalanche", "straitsx", "virtual-card", "discovery", "issuance", "execution"]
related:
  - ".kiro/specs/knowgrph-payments/requirements.md"
  - ".kiro/specs/xsgd-onchain-verification/design.md"
  - "grph-shared/src/payments/agenticPurchaseRuntimeContract.ts"
  - "grph-shared/src/payments/agenticPurchaseReadinessContract.ts"
  - "grph-shared/src/payments/chainEvidenceContract.ts"
  - "cloudflare/workers/knowgrph-payment/agenticPurchaseSafetyPersistence.ts"
  - "cloudflare/d1/migrations/0010_knowgrph_agentic_purchase_lifecycle.sql"
  - "canvas/src/features/payments/AgenticPurchaseLifecycleView.tsx"
---

# Requirements Document

## Introduction

Knowgrph already owns the declarative half of the autonomous agentic-purchase lifecycle: the phase vocabulary,
envelope and candidate validators, the twenty readiness checks, the durable lifecycle, approval, card,
authorization, and receipt tables, and the funding chain-evidence boundary delivered by the sibling increment. What
does not exist is the runtime that moves one lifecycle through its four milestones under those contracts.

This increment adds that runtime, and only that runtime:

| Milestone | Runtime obligation added here |
|---|---|
| Funding | Bind the existing funding reservation and provider credit read to the sibling `Funding_Verification_Projection`, so the phase opens only on agreement between provider credit and confirmed on-chain XSGD evidence. |
| Discovery | One bounded harness that receives a purchase instruction and locates one conforming item inside the immutable envelope, deterministic extraction first, at most two model calls, every model call cost-recorded. |
| Issuance | One approval gate consumption and one disposable virtual-card issuance behind a typed provider-agnostic card boundary whose effective controls are never weaker than the approved candidate. |
| Execution | One pre-submission revalidation, one secure-broker credential injection, one authorization claim, and terminal reconciliation that never creates a second card or checkout. |

Funding rests on the existing StraitsX account, XSGD product grant, and deposit-address authority for provider
credit, and on the already-specified Avalanche C-Chain read path for independent chain evidence. This increment adds
no new rail, no signer, no chain write path, no second Paywall, no second Worker, and no second payment store.

Provider behavior is grounded only in the documentation cited inline; anything unconfirmed is recorded under Open
Questions rather than assumed. Content from referenced sources was paraphrased for compliance with licensing
restrictions.

### Authority and Scope

| Concern | Owner |
|---|---|
| Paywall surface existence, envelope shape, phase vocabulary, cancellation semantics | knowgrph-payments R13 |
| Funding tuple validation, signer authority, provider credit authority, reservation semantics | knowgrph-payments R14 |
| Discovery bounds, candidate shape, injection and drift abort semantics | knowgrph-payments R15 |
| Approval binding, card control union, authorization uniqueness, disposal, card-field secrecy | knowgrph-payments R16 |
| Secure broker boundary, revalidation set, terminal reconciliation, receipt minimization | knowgrph-payments R17 |
| Chain-evidence adapter, confirmation policy, reconciliation, funding projection, evidence cache | xsgd-onchain-verification R1-R9 |
| Lifecycle orchestrator, phase transition authority, next-action derivation | This file, R1 |
| Funding gate binding to the chain-evidence projection | This file, R2 |
| Bounded discovery harness and its cost ledger | This file, R3 |
| Approval consumption sequencing and issuance orchestration | This file, R4, R5 |
| Authorization claim, revalidation, and secure execution sequencing | This file, R6 |
| Terminal reconciliation, safe closure, minimized receipt writing | This file, R7 |
| Runtime readiness reporting across the twenty declared checks | This file, R8 |
| Data minimization, canary boundary, and zero-egress default for the runtime | This file, R9 |

This increment carries development authority only. Prod mirror publication and Cloudflare deployment require a
separate explicit instruction.

### Compounding Lens Commitments

| Lens | Product rule for the lifecycle runtime | Anchors |
|---|---|---|
| Min-viable-max-value | One orchestrator, one harness, one card boundary, one execution path. No agent framework, no second surface, no provider-specific branch outside an adapter. | R1, R3, R5, R6 |
| TCO-zero | Runs inside the existing `knowgrph-payment` Worker, its D1 binding, and browser-local storage. One migration, no new store, no proxy tier, no queue service. | R1, R7, R9 |
| Token economics | At most two model calls per discovery run, zero model calls in funding, issuance, execution, reconciliation, and readiness. Every model call carries exactly one persisted cost entry. | R3, R8, R9 |
| Harness-first | Every phase step is a typed request with a typed result, an explicit ceiling, a persisted cost entry, and a typed blocked state that opens no later phase. | R1, R3, R6, R7 |
| Time-to-value | The operator reaches a first observable lifecycle from fixtures with no provider account and no credentials. | R8 |

---

## Glossary

Reused unchanged from knowgrph-payments: **Payment_Trust_Boundary**, **Payment_Surface**, **Funding_Adapter**,
**Commerce_Discovery_Harness**, **Approval_Gate**, **Secure_Card_Broker**, **Cost_Observer**, **Reconciler**,
**Provider_Terminal_State**.

Reused unchanged from xsgd-onchain-verification: **Funding_Verification_Projection**, **Evidence_State**,
**Evidence_Freshness_Label**, **Chain_Evidence_Record**.

- **Lifecycle_Orchestrator**: The single Worker-side owner that reads one durable lifecycle row, derives its phase, phase state, and one next action, and is the only component permitted to write a phase transition.
- **Phase_Gate_Result**: The typed answer to "may this phase open": `open`, `waiting`, `blocked` with a named blocking code, or `cancelled`. Never a provider result and never a spend authorization.
- **Discovery_Run**: One bounded attempt to locate a conforming candidate, carrying consumed page count, browser action count, model call count, and elapsed milliseconds against the source-owned ceilings.
- **Discovery_Budget**: The typed ceilings for one Discovery_Run, read only from `AGENTIC_PURCHASE_LIMITS`: at most five product pages, twelve browser actions, two model calls.
- **Extraction_Result**: The deterministic DOM and structured-data reading of one product page, produced before any model call, carrying evidence selectors and observed amounts as integer SGD minor units.
- **Candidate_Approval**: The durable record binding lifecycle, envelope digest, candidate digest, amount, currency, merchant policy, and an expiry at most thirty minutes after issue.
- **Card_Issuance_Adapter**: The typed provider-agnostic boundary that creates, reads, and closes one disposable virtual card reference. Never returns PAN, CVV, or full expiry to Knowgrph code.
- **Effective_Control_Set**: The union of provider-native card controls and repository-owned remote-host authorization policy, compared field-by-field against the approved candidate before a card is usable.
- **Authorization_Claim**: The atomic single-winner reservation of the first authenticated provider authorization identity for one lifecycle.
- **Revalidation_Set**: Merchant origin, product, variant, quantity, total, currency, delivery terms, and prohibited add-ons, re-read immediately before submission and compared against the approved candidate.
- **Purchase_Outcome**: `purchase_succeeded`, `purchase_failed`, `purchase_cancelled`, `purchase_expired`, or `purchase_outcome_unknown`.
- **Closure_Safety_Evidence**: The source-bound evidence set that permits exactly one card closure: no active local reservation, no open hold, and no unresolved capture, reversal, refund, or force-post risk.
- **Lifecycle_Receipt**: The one minimized terminal record linking only opaque funding, candidate, card, authorization, order, cost, and disposal references.
- **Runtime_Canary_Set**: Private key, seed phrase, raw signed transaction, deposit address, KYC payload field, PAN, CVV, full expiry, and provider customer identifier, planted in fixtures so a boundary sweep has something to find.

---

## User Journeys

Journeys JX-Trigger, JX-Funding, JX-Discovery, JX-Issuance, JX-Execution, and JX-Return remain owned by
knowgrph-payments R13-R17. The two journeys below are the runtime views added here.

### Journey JR: Buying_Agent - one instruction to one reconciled order

| Stage | Action | Touchpoint | Pain point | Opportunity |
|---|---|---|---|---|
| JR-Open | Trusted host supplies one purchase envelope | Payment_Surface, Lifecycle_Orchestrator | Contracts exist, nothing advances them | One orchestrator derives phase and next action |
| JR-Fund | Provider credit plus confirmed chain evidence agree | Funding_Adapter, Funding_Verification_Projection | Funding could be believed, not proven | Agreement is the only gate opener |
| JR-Find | Agent extracts, then reasons at most twice, to locate one item | Commerce_Discovery_Harness | Unbounded browsing and token spend | Hard ceilings with a persisted cost entry per model call |
| JR-Approve | Buyer approves one candidate, gate consumes it once | Approval_Gate | Replay could create a second card | Atomic single consumption surviving restart |
| JR-Issue | One disposable card is issued with controls no weaker than approved | Card_Issuance_Adapter | Provider control drift | Effective_Control_Set compared field-by-field |
| JR-Buy | Agent revalidates, then a broker injects credentials | Secure_Card_Broker | Drift at submission time | Mismatch stops before injection |
| JR-Settle | Merchant order read and issuer result agree, or stay unknown | Reconciler | Timeout could double-buy | One lifecycle reconciles without a second card |
| JR-Return | Buyer reopens and reads one minimized receipt | Lifecycle_Receipt | Receipt leaks or lacks references | Opaque references only |

### Journey JO: Solo_Operator - first observable lifecycle from zero state

| Stage | Action | Touchpoint | Pain point | Opportunity |
|---|---|---|---|---|
| JO-Discover | Operator reads which of the twenty checks are unmet | readiness gate output | Unknown prerequisites | Every missing input named |
| JO-Engage | Operator runs the fixture lifecycle with no credentials | fixture merchant, fixture adapters | Provider onboarding blocks all progress | Fixture path exercises all four phases |
| JO-Complete | Operator observes one fixture lifecycle reach a terminal receipt | Payment_Surface | No end-to-end proof | One observable terminal state |
| JO-Return | Operator re-runs the gate after a change | readiness gate output | Silent drift | Read-only gate, zero writes |

---

## Time-to-Value

| Dimension | Estimate | Target ceiling | Validation method |
|---|---|---|---|
| TTV steps (Solo_Operator, zero state to first fixture lifecycle) | 3 steps | <= 6 steps | Walk-through on a clean checkout, no credentials |
| TTV elapsed (Solo_Operator) | ~20 min | <= 45 min | Timed first run on a clean checkout |
| TTV steps (Buyer_SG, envelope to approval prompt) | 1 step | <= 2 steps | Existing Paywall walk-through |
| TTV elapsed (one fixture lifecycle, warm) | ~8 s | <= 30 s | Timed run against recorded fixtures |
| First-value action | One fixture lifecycle reaches `purchase_succeeded` with one minimized receipt | - | Observable terminal state plus one receipt row |
| Persona | Solo_Operator, Buyer_SG, Buying_Agent | - | Defined in User Journeys |

Operator TTV excludes provider account approval, Card Program grant, and Data API plan approval, which are outside
Knowgrph control and tracked under Open Questions.

---

## Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---|---|---|
| Lifecycles opening Discovery without funding agreement | not measured | 0 | Increment 1 |
| Discovery runs exceeding five pages, twelve actions, or two model calls | not measured | 0 | Increment 1 |
| Model calls without exactly one persisted cost entry | not measured | 0 | Increment 1 |
| Lifecycles producing more than one card reference | not measured | 0 | Increment 1 |
| Lifecycles producing more than one authorization reservation | not measured | 0 | Increment 1 |
| Credential injections preceded by a failed revalidation | not measured | 0 | Increment 1 |
| Ambiguous outcomes resolved by a second card or checkout | not measured | 0 | Increment 1 |
| Cards closed while Closure_Safety_Evidence is unmet | not measured | 0 | Increment 1 |
| Runtime_Canary_Set members reaching a model, general store, log, screenshot, or receipt | not measured | 0 | Increment 1 |
| Egress requests while the runtime is unconfigured or cancelled | not measured | 0 | Increment 1 |
| Token cost / month outside discovery reasoning | not measured | $0.00 | Continuous |
| Monthly TCO (fixed infrastructure) | $0.00 (existing Worker plus D1 free tier) | $0.00 | Continuous |
| ROI score (capability aggregate) | - | >= 8 | Increment 1 |

---

## MoSCoW Priority

ROI uses `ROI = (User Impact x Reach) / (Build Hours + Monthly TCO + Token Cost per Month)`, with Reach expressed in
lifecycles per month at launch and Impact on a 1-5 scale.

| Tier | Feature | Req | Impact x Reach | Build hours | Monthly TCO | Token cost / month | ROI |
|---|---|---|---|---|---|---|---|
| Must | Lifecycle orchestrator and phase projection | R1 | 5 x 30 = 150 | 6 | $0.00 | $0.00 | 25.0 |
| Must | Funding gate bound to chain-evidence agreement | R2 | 5 x 30 = 150 | 4 | $0.00 | $0.00 | 37.5 |
| Must | Bounded discovery harness with cost ledger | R3 | 5 x 30 = 150 | 8 | $0.00 | ~$0.02 | 18.7 |
| Must | Approval consumption sequencing | R4 | 5 x 30 = 150 | 3 | $0.00 | $0.00 | 50.0 |
| Must | Disposable card issuance boundary and control union | R5 | 5 x 30 = 150 | 7 | $0.00 | $0.00 | 21.4 |
| Must | Authorization claim and secure execution sequencing | R6 | 5 x 30 = 150 | 7 | $0.00 | $0.00 | 21.4 |
| Must | Terminal reconciliation, safe closure, minimized receipt | R7 | 5 x 30 = 150 | 6 | $0.00 | $0.00 | 25.0 |
| Must | Data minimization and zero-egress default | R9 | 5 x 30 = 150 | 3 | $0.00 | $0.00 | 50.0 |
| Should | Runtime readiness reporting across twenty checks | R8 | 4 x 15 = 60 | 4 | $0.00 | $0.00 | 15.0 |
| Could | Operator-visible discovery evidence trail in the Paywall | - | 2 x 10 = 20 | 4 | $0.00 | $0.00 | 5.0 |
| Could | A second Card_Issuance_Adapter behind the same boundary | - | 3 x 5 = 15 | 6 | $0.00 | $0.00 | 2.5 |
| Won't (this increment) | New rails, signer or key custody in the repository, chain writes, multi-item or quantity above one, subscriptions, refunds initiated by Knowgrph, a second Paywall or Worker, autonomous approval without a buyer | - | - | - | - | - | - |

**Min-viable scope**: the eight Must rows. One orchestrator, one funding gate, one harness, one approval
consumption, one card boundary, one execution path, one reconciliation, one minimization sweep.

---

## Requirements

### Requirement 1: Lifecycle orchestrator and phase projection

**User Story:** As a Buyer_SG, I want one component to own how my purchase advances, so that no phase can open
itself and no second controller can move money.

**Journey stage:** JR-Open, JX-Trigger, JX-Return

**Lens fit:** min-viable-max-value (one owner), TCO-zero (existing Worker and store), token economics (zero model
calls), harness-first (typed gate result per phase).

#### Acceptance Criteria

1. THE Lifecycle_Orchestrator SHALL be the only component that writes `phase`, `phase_state`, `next_action`, `financial_state_exists`, `terminal_at`, or `revision` on a `payment_purchase_lifecycles` row, and every write SHALL be a compare-and-swap on the read `revision`.
2. THE Lifecycle_Orchestrator SHALL derive a Phase_Gate_Result for exactly one phase per request, in the fixed order `funding`, `discovery`, `issuance`, `execution`, and SHALL return `waiting` for any later phase whose predecessor is not `complete`.
3. THE Lifecycle_Orchestrator SHALL project one `AgenticPurchaseLifecycleSnapshot` containing the four phases, each phase state, and exactly one next action, using only the existing `AGENTIC_PURCHASE_PHASES` and `AGENTIC_PURCHASE_PHASE_STATES` vocabularies.
4. WHEN a compare-and-swap write loses to a concurrent revision, THE Lifecycle_Orchestrator SHALL re-read the row, SHALL re-derive the gate, and SHALL apply no phase transition derived from the stale revision.
5. WHERE `cancellation_requested` is set, THE Lifecycle_Orchestrator SHALL return `cancelled` for every phase gate and SHALL permit only reservation release, provider reads, outcome reconciliation, authorization blocking, and safe card closure to continue.
6. WHERE `financial_state_exists` is `0`, THE Lifecycle_Orchestrator SHALL send zero provider and zero financial requests for a hidden, closed, cancelled, malformed, page-originated, or unapproved invocation.
7. THE runtime SHALL add no second Paywall, top-level panel, payment controller, Worker, D1 binding, or payment store, and SHALL reuse `validateAgenticPurchaseEnvelope` as the only envelope admission path.
8. IF a lifecycle row is absent, carries an unknown phase or phase state, or carries an envelope digest that does not equal the digest recomputed from its stored envelope, THEN THE Lifecycle_Orchestrator SHALL return a typed `lifecycle_state_invalid` result, SHALL write nothing, and SHALL open no phase.

**Verifiable Completion Conditions**

- `Verify a focused check finds exactly one writer of the lifecycle phase columns and every write carries a revision predicate` (criterion 1)
- `Verify gate order: each later phase returns waiting until its predecessor is complete, across all phase-state combinations` (criterion 2)
- `Race 100 concurrent transitions on one lifecycle and verify every losing writer re-reads and applies no stale transition` (criterion 4)
- `Verify a cancelled lifecycle returns cancelled for all four gates and permits only the five allowlisted cleanup classes` (criterion 5)
- `Verify hidden, closed, cancelled, malformed, page-originated, and unapproved invocations produce zero provider and financial calls before financial state exists` (criterion 6)
- `Verify the change set adds no second surface, controller, Worker, binding, or store, and no envelope path bypasses the existing validator` (criterion 7)
- `Verify an absent row, unknown phase, unknown state, and digest mismatch each return lifecycle_state_invalid with zero writes` (criterion 8)

---

### Requirement 2: Funding gate bound to chain-evidence agreement

**User Story:** As a Buyer_SG, I want Discovery to open only after my XSGD funding is proven twice, so that a single
provider claim cannot start spending.

**Journey stage:** JR-Fund, JX-Funding

**Lens fit:** min-viable-max-value (reuse the sibling projection), TCO-zero (no new read path), token economics
(deterministic comparison), harness-first (typed gate result, named blocking code).

#### Acceptance Criteria

1. THE funding gate SHALL return `open` only when the sibling Funding_Verification_Projection reports `agreement` true, `evidenceState` `chain_confirmed`, `providerCreditState` `credited`, and `evidenceFreshness` `fresh`.
2. THE funding gate SHALL read that projection through the sibling boundary only and SHALL construct no chain request, no adapter instance, and no confirmation decision of its own.
3. WHERE the projection reports `chain_pending`, `chain_unobserved`, `chain_disagreement`, `chain_verification_unresolved`, a non-`fresh` freshness label, or `agreement` false, THE funding gate SHALL return `waiting` or `blocked` with the projection's own state named, SHALL open no later phase, and SHALL create no card, approval, or authorization.
4. THE funding gate SHALL require exactly one `payment_purchase_funding_reservations` row per lifecycle through the existing `reserveAgenticPurchaseFunding` owner, and one funding key SHALL create at most one reservation under concurrent replay and restart.
5. WHEN cancellation or failure occurs before an Authorization_Claim exists, THE runtime SHALL release the unused reservation exactly once through the existing release owner, SHALL leave credited XSGD in the buyer's provider account, and SHALL create no return transfer.
6. THE funding gate SHALL hold no private key, seed phrase, or raw signed transaction, SHALL never accept a token contract address as a deposit address, and SHALL never derive funding completion from a callback payload alone.
7. IF the projection is unavailable because chain verification is disabled or its policy is incomplete, THEN THE funding gate SHALL return `blocked` with the sibling's own named failure, SHALL send zero external requests, and SHALL leave the reservation state unchanged.

**Verifiable Completion Conditions**

- `Verify only the full agreement tuple opens the gate, across generated combinations of evidence state, credit state, freshness, and agreement` (criteria 1, 3)
- `Verify a focused check finds no chain adapter construction, chain request, or confirmation-depth comparison inside the funding gate` (criterion 2)
- `Replay one funding key 100 times across a simulated restart and verify one reservation and one transfer identity` (criterion 4)
- `Verify cancellation before authorization releases one reservation exactly once with returnTransferCreated false` (criterion 5)
- `Verify key, seed-phrase, raw-transaction, and deposit-address canaries never enter the gate result, and a contract address as deposit address is rejected` (criterion 6)
- `Verify a disabled or policy-incomplete verification path blocks with zero egress and no reservation change` (criterion 7)

---

### Requirement 3: Bounded e-commerce discovery harness

**User Story:** As a Buying_Agent, I want to locate one conforming item under hard ceilings, so that merchant content
cannot expand my scope or my token spend.

**Journey stage:** JR-Find, JX-Discovery

**Lens fit:** min-viable-max-value (deterministic first, model last), TCO-zero (browser-side control, no crawler
service), token economics (two calls maximum, each cost-recorded), harness-first (typed run with consumed counters).

#### Acceptance Criteria

1. THE Commerce_Discovery_Harness SHALL treat every merchant response as untrusted data and SHALL read allowed origins, item constraints, quantity, budget, currency, expiry, approval policy, and tool access only from the validated envelope, which SHALL be immutable for the run.
2. THE harness SHALL produce an Extraction_Result from deterministic DOM and structured-data reading before it makes any model call, and SHALL make zero model calls when deterministic extraction already yields a conforming candidate.
3. THE harness SHALL enforce the Discovery_Budget read only from `AGENTIC_PURCHASE_LIMITS`: at most five product pages, at most twelve browser actions, at most two model calls per Discovery_Run, and SHALL return a typed `discovery_budget_exhausted` result naming the reached ceiling and the consumed counts.
4. THE harness SHALL persist exactly one cost entry before each model call leaves the boundary and SHALL complete it with outcome and elapsed milliseconds; IF a cost write fails, THEN the run SHALL abort with `discovery_cost_write_failed` before any further browser or model action.
5. THE harness SHALL emit a candidate only through `validateAgenticPurchaseCandidate`, carrying exactly merchant origin, canonical product URL, product and variant, quantity, item amount, shipping, tax, total, currency, observation time, and evidence selectors, with every amount as integer SGD minor units.
6. IF any mandatory cost is unknown, the observed total exceeds the envelope maximum, the observed total drifts from a prior observation for the same candidate, the origin is not an allowed HTTPS origin, the content attempts instruction injection, quantity is not `1`, the envelope has expired, or no conforming item exists, THEN THE harness SHALL abort with the matching typed code before the next browser or model action and SHALL create no approval, card, or authorization record.
7. THE harness SHALL discard any merchant-supplied instruction, tool request, origin, price authority, or policy change, and SHALL keep the model input free of every Runtime_Canary_Set member.
8. WHEN cancellation is observed between two steps, THE harness SHALL stop before the next browser or model action and SHALL return `discovery_cancelled` with its consumed counts.

**Verifiable Completion Conditions**

- `Verify match, no-match, unknown-total, price-drift, blocked-origin, injection, expired-envelope, wrong-quantity, and cancellation fixtures each produce the named typed result against an immutable envelope` (criteria 1, 6, 8)
- `Verify deterministic extraction runs first and a deterministically resolvable fixture consumes zero model calls` (criterion 2)
- `Verify page, action, and model-call ceilings over generated action sequences, always reporting the reached ceiling and consumed counts` (criterion 3)
- `Verify exactly one cost row per model call and that a failed cost write aborts before the next action` (criterion 4)
- `Verify every emitted candidate passes the existing validator with amounts as integer minor units and no extra key` (criterion 5)
- `Verify merchant-supplied instructions, tool requests, and policy changes are discarded, and no canary member reaches model input` (criterion 7)

---

### Requirement 4: Approval gate consumption sequencing

**User Story:** As a Buyer_SG, I want my approval to be spent exactly once, so that replay or a changed candidate
cannot issue a second card.

**Journey stage:** JR-Approve, JX-Issuance

**Lens fit:** min-viable-max-value (reuse the durable gate), TCO-zero (existing table), token economics (zero model
calls), harness-first (typed consumption result).

#### Acceptance Criteria

1. THE runtime SHALL register a Candidate_Approval through the existing `registerAgenticPurchaseApproval` owner, binding lifecycle, envelope digest, candidate digest, amount in SGD minor units, currency, merchant policy, and an expiry at most `maximumApprovalTtlMs` after issue.
2. THE runtime SHALL consume the approval through the existing `consumeAgenticPurchaseApproval` owner after final validation and before any card creation request, and SHALL treat consumption as the boundary that sets `financial_state_exists`.
3. WHEN 100 concurrent consumers race one approval, exactly one SHALL succeed, every other SHALL receive a typed already-consumed result, and the consumed state SHALL survive a simulated restart.
4. IF the candidate digest, envelope digest, amount, currency, or merchant policy differs from the registered approval, or the approval has expired, THEN THE runtime SHALL reject consumption with the differing field named and SHALL send zero provider requests.
5. THE runtime SHALL reject any second approval registration for a lifecycle that already holds a consumed approval, and SHALL never re-open a consumed approval.
6. WHERE consumption succeeded but the following issuance request failed, THE runtime SHALL keep the approval consumed, SHALL record the issuance failure against the same lifecycle, and SHALL require a new buyer approval before another issuance attempt.

**Verifiable Completion Conditions**

- `Verify registration binds all seven fields and rejects a TTL above the source ceiling` (criterion 1)
- `Verify no card creation call can occur before consumption in any ordering, and consumption sets financial_state_exists` (criterion 2)
- `Race 100 consumers across a simulated restart and verify exactly one durable consumption` (criterion 3)
- `Verify each changed field and an expired approval reject consumption by field name with zero provider calls` (criterion 4)
- `Verify a second registration on a consumed lifecycle is rejected and a consumed approval never reopens` (criteria 5, 6)

---

### Requirement 5: Disposable virtual-card issuance boundary

**User Story:** As a Buyer_SG, I want one short-lived card bound to what I approved, so that merchant drift or replay
cannot create unbounded spend.

**Journey stage:** JR-Issue, JX-Issuance

**Lens fit:** min-viable-max-value (one boundary, one fixture adapter), TCO-zero (no new store), token economics
(zero model calls), harness-first (typed issuance request and result).

#### Acceptance Criteria

1. THE Card_Issuance_Adapter SHALL be one typed boundary exposing exactly create, read, and close verbs, selected by adapter identifier from a repository-owned source, and SHALL accept additional implementations without a change to its request or result types.
2. THE runtime SHALL create at most one card reference per lifecycle, enforced by a unique constraint on the existing `payment_purchase_cards` owner, and SHALL return the prior reference for an exact replay.
3. BEFORE a card is treated as usable, THE runtime SHALL compare the Effective_Control_Set field-by-field against the approved candidate for amount, currency, e-commerce channel, merchant policy, geography, time window, expiry, and disposal policy, and SHALL fail with `card_controls_weaker_than_approved` naming each weaker field.
4. IF the Card Program grant, virtual-card product, or card pool is absent, or secure credential injection is unavailable, THEN THE runtime SHALL fail before a usable card exists, SHALL name each missing input, and SHALL leave the approval consumed with no card reference recorded.
5. THE Card_Issuance_Adapter SHALL never return PAN, CVV, or full expiry into Knowgrph memory, logs, storage, receipts, screenshots, or model input, and SHALL expose only an opaque card reference plus a broker handle.
6. THE issued card expiry SHALL be at most `maximumApprovalTtlMs` after issue and SHALL never exceed the envelope expiry.
7. IF the adapter returns a card whose provider-reported controls cannot be read, THEN THE runtime SHALL treat the control set as weaker than approved and SHALL move the card to `closure_pending` without granting execution.

**Verifiable Completion Conditions**

- `Verify a second fixture-backed adapter satisfies the same request and result types with no boundary change` (criterion 1)
- `Race 100 identical issuance requests and verify one card reference with exact replay returning the prior result` (criterion 2)
- `Verify weaker, unreadable, changed, and exhausted control fixtures each fail by field name and create no usable card` (criteria 3, 4, 7)
- `Verify PAN, CVV, and full-expiry canaries never appear in memory snapshots, logs, storage, receipts, or model input` (criterion 5)
- `Verify issued expiry never exceeds the approval ceiling or the envelope expiry` (criterion 6)

---

### Requirement 6: Authorization claim and secure execution sequencing

**User Story:** As a Buying_Agent, I want to complete exactly one approved checkout, so that drift or a retry cannot
buy twice.

**Journey stage:** JR-Buy, JX-Execution

**Lens fit:** min-viable-max-value (one execution path), TCO-zero (existing tables), token economics (zero model
calls in execution), harness-first (typed revalidation result before injection).

#### Acceptance Criteria

1. IMMEDIATELY before submission, THE runtime SHALL re-read the Revalidation_Set from the merchant page and SHALL compare every member against the approved candidate as exact values, with amounts compared as integer SGD minor units.
2. IF any Revalidation_Set member mismatches, THEN THE runtime SHALL stop with `execution_revalidation_failed` naming each mismatched member, before credential injection, before checkout submission, and before an Authorization_Claim.
3. ONLY the Secure_Card_Broker SHALL inject card fields; THE browser model, screenshots, telemetry, general application state, and logs SHALL NOT read them, and no Knowgrph module outside the broker boundary SHALL receive a card field.
4. THE runtime SHALL claim the first authenticated provider authorization identity exactly once through the existing `claimAgenticPurchaseAuthorization` owner; an exact duplicate identity SHALL return the prior decision, and every later competing identity, cancellation, or expiry SHALL be denied.
5. WHERE buyer authentication is required by the merchant or issuer, THE runtime SHALL hand off to the existing Paywall explicitly and SHALL never bypass, simulate, or auto-complete that step.
6. THE runtime SHALL make zero model calls during execution and SHALL record one cost entry per provider request with `model_call_count` zero.
7. WHEN cancellation is observed before injection, THE runtime SHALL stop with `execution_cancelled`, SHALL make no submission, and SHALL leave the card in `closure_pending` for the safety evaluation owned by R7.

**Verifiable Completion Conditions**

- `Verify price-drift, add-on, origin-change, variant-change, quantity-change, currency-change, and delivery-term fixtures each stop before injection with the member named` (criteria 1, 2)
- `Verify a focused check finds card-field access only inside the broker boundary and canaries never reach model, screenshot, telemetry, or log paths` (criterion 3)
- `Race 100 identical and competing authorization identities and verify one reservation, exact replay returning the prior decision, and denial of every competitor` (criterion 4)
- `Verify an authentication-required fixture produces an explicit Paywall handoff with no simulated completion` (criterion 5)
- `Verify execution records zero model calls and one cost entry per provider request` (criterion 6)
- `Verify cancellation before injection stops with no submission and leaves the card closure_pending` (criterion 7)

---

### Requirement 7: Terminal reconciliation, safe closure, and minimized receipt

**User Story:** As a Buyer_SG, I want an ambiguous outcome resolved without a second purchase, so that a timeout
never costs me twice.

**Journey stage:** JR-Settle, JX-Return

**Lens fit:** min-viable-max-value (one reconciliation owner), TCO-zero (existing receipt table), token economics
(deterministic comparison), harness-first (typed outcome, bounded reconciliation).

#### Acceptance Criteria

1. THE runtime SHALL derive `purchase_succeeded` only from agreement between an authoritative merchant order read and the issuer authorization result for the same Authorization_Claim.
2. WHEN the merchant read times out, only one side reports, or the two sides disagree, THE runtime SHALL hold `purchase_outcome_unknown`, SHALL reconcile under the same lifecycle identifier, and SHALL create no second card, approval, authorization, or checkout submission.
3. THE reconciliation SHALL be bounded by a source-owned attempt and wall-clock ceiling, SHALL be idempotent for a repeated provider callback, and SHALL never weaken an already recorded terminal success or failure.
4. WHEN any Purchase_Outcome becomes terminal, THE runtime SHALL block every new authorization immediately and SHALL set the lifecycle `terminal_at` exactly once.
5. THE runtime SHALL keep the card `closure_pending` while Closure_Safety_Evidence is unmet, SHALL close it exactly once through the existing `closeAgenticPurchaseCardWhenSafe` owner when the evidence permits, and SHALL treat an unresolved hold, capture, reversal, refund, or force-post risk as unmet evidence.
6. THE runtime SHALL write exactly one Lifecycle_Receipt per lifecycle, containing only opaque funding, candidate, card, authorization, order, cost, and disposal references, and SHALL exclude every Runtime_Canary_Set member.
7. THE Lifecycle_Receipt SHALL round-trip byte-identically through the existing payment record document parser and printer, including the sibling `chain_evidence` key.
8. IF receipt writing fails, THEN THE runtime SHALL keep the terminal outcome recorded, SHALL return `receipt_write_failed`, and SHALL create no second receipt on retry.

**Verifiable Completion Conditions**

- `Verify success, decline, timeout, duplicate callback, merchant-only, issuer-only, disagreement, cancellation, expiry, hold, capture, reversal, refund, and force-post fixtures each produce the designated outcome` (criteria 1-3)
- `Verify an unknown outcome creates no second card, approval, authorization, or submission across generated reconciliation sequences` (criterion 2)
- `Verify reconciliation stays inside its ceilings, is idempotent for repeated callbacks, and never weakens a terminal state` (criterion 3)
- `Verify terminal outcomes block new authorization immediately and set terminal_at exactly once under replay` (criterion 4)
- `Verify closure stays pending while any risk fixture is active, then closes once under replay` (criterion 5)
- `Verify one receipt per lifecycle carries only opaque references, excludes every canary, and round-trips byte-identically` (criteria 6, 7)
- `Verify a failed receipt write preserves the terminal outcome and creates no second receipt on retry` (criterion 8)

---

### Requirement 8: Runtime readiness reporting

**User Story:** As a Solo_Operator, I want one read-only gate to tell me exactly which of the twenty checks is unmet,
so that I can reach a first observable lifecycle without guessing.

**Journey stage:** JO-Discover, JO-Complete, JO-Return

**Lens fit:** min-viable-max-value (extend the existing gate), TCO-zero (no new command), token economics (zero
model calls), harness-first (named missing input per check).

#### Acceptance Criteria

1. THE readiness gate SHALL report each of the twenty `AGENTIC_PURCHASE_READINESS_CHECKS` entries independently, SHALL derive none of them from another, and SHALL name every missing input for a false check.
2. THE readiness gate SHALL be read-only: zero writes, zero provider requests, zero chain requests, zero model calls.
3. THE readiness gate SHALL add no new command and SHALL extend the existing payments readiness gate and its digest-bound local verification suite registration.
4. THE readiness gate SHALL report the funding checks by delegating to the sibling adapter-admission and proof-complete statuses rather than recomputing them.
5. THE readiness gate SHALL exit non-zero when any required check is false, when a declared suite is missing from the manifest, or when the source-evidence digest does not match the recorded digest.
6. THE readiness gate SHALL report Evidence_State, phase, phase state, and consumed discovery counts, and SHALL report no watched address, provider customer identifier, KYC field, card field, or key value.
7. WHERE the runtime is configured with fixture adapters only, THE readiness gate SHALL report the fixture mode explicitly and SHALL NOT report a provider-backed check as met.

**Verifiable Completion Conditions**

- `Verify all twenty checks are independently derived and every false check names its missing inputs` (criterion 1)
- `Verify the gate performs zero writes, zero provider and chain requests, and zero model calls` (criterion 2)
- `Verify no new command exists and both new suites appear in the manifest and the local verification registry` (criterion 3)
- `Verify funding checks are delegated, not recomputed, and a sibling stale digest surfaces as the sibling's own stale result` (criteria 4, 5)
- `Verify reported output carries no address, customer identifier, KYC field, card field, or key value, and fixture mode is explicit` (criteria 6, 7)

---

### Requirement 9: Data minimization and zero-egress default

**User Story:** As a Solo_Operator, I want the runtime to leak nothing and call nothing until it is configured, so
that an incomplete setup cannot spend money or expose a secret.

**Journey stage:** JO-Engage, JR-Open

**Lens fit:** min-viable-max-value (one sweep), TCO-zero (no egress by default), token economics (zero model calls
outside discovery), harness-first (typed disabled result).

#### Acceptance Criteria

1. WHERE any required runtime input is absent from its owning source, THE runtime SHALL return a typed `purchase_runtime_disabled` result naming each absent input, SHALL send zero external requests, and SHALL write nothing.
2. THE runtime SHALL read every provider credential from Worker secret storage only, and no credential name or value SHALL appear in visible configuration, client bundle output, browser storage, a URL, a log line, a cost entry, or a receipt.
3. THE runtime SHALL keep every Runtime_Canary_Set member out of model input, screenshots, telemetry, the general application store, logs, and the Lifecycle_Receipt.
4. THE runtime SHALL store the deposit address and provider customer identifier only as digests in any row it writes.
5. THE runtime SHALL make zero model calls in funding, issuance, execution, reconciliation, and readiness, and SHALL cap discovery at the source-owned model-call ceiling.
6. THE runtime SHALL keep every authored file below 600 lines and SHALL introduce no duplicate semantic-key, digest, validation, or persistence helper where an existing payments owner already provides it.

**Verifiable Completion Conditions**

- `Verify an unconfigured runtime names every absent input, sends zero requests, and writes nothing` (criterion 1)
- `Verify a planted credential name or value in visible vars, bundle output, browser storage, a URL, a log, a cost entry, or a receipt fails the sweep` (criterion 2)
- `Verify every canary member is absent from model input, screenshots, telemetry, the general store, logs, and the receipt` (criterion 3)
- `Verify written rows carry only digests for deposit address and provider customer identifier` (criterion 4)
- `Verify model-call counts are zero outside discovery and capped inside it` (criterion 5)
- `Verify a focused check finds no authored file at or above 600 lines and no duplicated existing helper` (criterion 6)

---

## Out of Scope

- New payment rails, chain writes, signer or key custody inside the repository, and any automatic return transfer.
- Multi-item carts, quantity above one, subscriptions, and Knowgrph-initiated refunds.
- Autonomous approval without an explicit buyer approval step.
- A second Paywall, panel, controller, Worker, D1 binding, payment store, crawler service, or queue service.
- Prod mirror publication and Cloudflare deployment.

## Dependencies

| Dependency | Role | Readiness |
|---|---|---|
| `knowgrph-payments` R13-R17 | Normative authority for all four milestones | Accepted requirements |
| `xsgd-onchain-verification` R1-R9 | Funding chain evidence, projection, cache, readiness statuses | Design accepted, implementation in progress |
| StraitsX provider account, XSGD product grant, deposit-address contract | KYC-bound funding and provider credit authority | External approval required |
| Card Program grant, virtual-card product, card pool, secure credential injection | Issuance and execution | External approval required, fixture-backed until granted |
| Existing `payment_purchase_*` tables (migration 0010) | Durable lifecycle, approval, card, authorization, receipt state | Present |
| Existing `payment_chain_*` tables (migration 0011) | Chain evidence and confirmed funding | Present |
| Browser control owner for discovery actions | Bounded page reading and action counting | Repository-owned, fixture-backed in tests |

## Open Questions

- OQ-A1: Which provider issues the disposable virtual card, and what are its documented control fields, expiry
  ceiling, and closure semantics? Until answered, only the fixture adapter is implemented and every provider-backed
  readiness check reports unmet.
- OQ-A2: What is the authoritative merchant order read for a general HTTPS merchant, given that R17.5 requires
  agreement with the issuer result? Until answered, the runtime treats a merchant-only signal as
  `purchase_outcome_unknown`.
- OQ-A3: Does the secure credential injection path run inside the browser session or a PCI-scoped remote host, and
  what is its handle lifetime? Until answered, the broker boundary is typed and fixture-backed only.
- OQ-A4: What settlement path moves confirmed XSGD to the card program balance? Carried from upstream OQ-18 and
  excluded from this increment.
- OQ-A5: What reconciliation attempt and wall-clock ceilings does the provider's callback cadence require? Until
  answered, both are required source values with no default.
