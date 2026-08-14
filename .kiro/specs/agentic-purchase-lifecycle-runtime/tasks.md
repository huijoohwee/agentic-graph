---
title: "Agentic Purchase Lifecycle Runtime - Implementation Plan"
doc_type: "Tasks"
id: "agentic-purchase-lifecycle-runtime-tasks"
spec: "agentic-purchase-lifecycle-runtime"
version: "0.1.0"
status: "tasks-draft"
created: "2026-08-14"
updated: "2026-08-14"
author: "airvio / joohwee"
domain: "knowgrph"
lang: "en-US"
frontmatter_contract: "required"
requirements_source: ".kiro/specs/agentic-purchase-lifecycle-runtime/requirements.md"
design_source: ".kiro/specs/agentic-purchase-lifecycle-runtime/design.md"
upstream_spec: ".kiro/specs/knowgrph-payments/requirements.md"
sibling_spec: ".kiro/specs/xsgd-onchain-verification/tasks.md"
guidelines: "huijoohwee.github.io/guidelines/prd-tad-adr-guidelines.md"
deployment_topology: "Dev authoring only; Prod mirror and Cloudflare deployment require separate explicit authority"
constraints: ["browser-first", "local-first", "offline-first", "mobile-first", "foss-first", "tco-zero", "token-economical", "harness-first", "zero-egress-default", "no-signer-in-repository", "provider-agnostic-adapter-boundary", "single-paywall-surface"]
tags: ["payments", "agentic-commerce", "xsgd", "avalanche", "straitsx", "virtual-card", "discovery", "issuance", "execution"]
---

# Implementation Plan

## Overview

Build bottom-up: policy source and pure contracts first, then the migration and persistence owners, then the
orchestrator, then the four phase owners in lifecycle order, ending with route wiring, the Paywall surface, and the
readiness extension.

`requirements.md` is normative and `design.md` owns every structural decision; this plan only sequences the work those
two documents already specify. TypeScript for source, `.mjs` for shared and script test suites, matching the existing
payment owners.

Standing rules for every task below:

- No signer, key material, broadcast path, chain write, or automatic return transfer is introduced.
- No second Paywall, panel, payment controller, Worker, D1 binding, payment store, crawler service, or queue service.
- No new readiness command; the existing `payment:runtime:readiness` gate is extended.
- No policy literal (adapter id, program reference, ceiling, deadline, attempt count) is hardcoded in source or
  tests. Runtime values resolve from `purchaseLifecycleRuntimeSsot.ts`, discovery ceilings from
  `AGENTIC_PURCHASE_LIMITS`, chain and funding values from `xsgdChainEvidenceSsot.ts`. Tests build explicit policy
  objects.
- No PAN, CVV, or full-expiry field name appears in any Knowgrph type, and no Runtime_Canary_Set member appears
  outside a fixture body.
- Every existing atomic gate in `agenticPurchaseSafetyPersistence.ts` is called, never reimplemented or wrapped.
- Every authored file stays below 600 lines.
- Fixtures use synthetic origins, products, digests, and references, so no test needs network or credentials.
- Property test files carry the tag comment
  `Feature: agentic-purchase-lifecycle-runtime, Property {n}: {statement}`.
- Dev authoring only: no Prod mirror edit and no Cloudflare deployment step appears in this plan.

Sub-tasks marked `*` are test tasks and may be skipped for a faster first pass; every other sub-task is required.

## Tasks

- [ ] 1. Runtime policy source and pure discovery contract

  - [ ] 1.1 Create the runtime policy source
    - Create `grph-shared/src/payments/purchaseLifecycleRuntimeSsot.ts` exporting
      `resolvePurchaseLifecycleRuntimePolicy(env)`.
    - Include exactly the four design groups: adapters (card issuance id, broker id, browser control owner id, fixture
      mode flag), card program (grant reference, product id, pool id, control-read capability flag), reconciliation
      (maximum attempts, maximum wall-clock seconds, callback replay window seconds), execution (per-request deadline
      ms, maximum submission attempts, authentication handoff timeout seconds), plus three secret presence flags.
    - Every value required with no default; never read from a caller, a merchant response, a provider response, or a
      cached row. Absence returns `purchase_runtime_disabled` naming every absent input with zero external requests.
    - Do not re-declare discovery ceilings, chain id, token contract, or confirmation depth; import
      `AGENTIC_PURCHASE_LIMITS` and delegate chain values to the sibling source.
    - _Requirements: 9.1, 9.2, 9.5_

  - [ ] 1.2 Create the pure discovery contract
    - Create `grph-shared/src/payments/purchaseDiscoveryContract.ts` with `DiscoveryBudget`,
      `DiscoveryConsumption`, `ExtractionResult`, `DiscoveryFailureCode`, `DiscoveryRunResult`, and
      `evaluateExtraction`, all `Readonly`.
    - `evaluateExtraction` is total, synchronous, clock-free, and randomness-free, and decides abort codes in the
      design's fixed precedence order: expired envelope, blocked origin, injection detected, invalid quantity,
      unknown mandatory cost, price drift, total over budget, no conforming item.
    - Amounts are integer SGD minor units only; no floating-point arithmetic and no currency conversion.
    - _Requirements: 3.1, 3.5, 3.6_

  - [ ]* 1.3 Write the fail-closed admission property test
    - Create `grph-shared/__tests__/purchase-lifecycle-policy.test.mjs` with `fast-check` at `{ numRuns: 100 }`.
    - **Consolidated fail-closed admission property**: for any generated subset of required policy inputs, an
      incomplete policy returns `purchase_runtime_disabled`, names every absent input, opens no phase, and reports
      zero external requests.
    - **Validates: Requirements 9.1, 9.2**

  - [ ]* 1.4 Write the extraction precedence unit tests
    - One fixture per abort code plus overlapping-condition cases asserting the declared precedence order.
    - Assert integer-minor-unit handling and that a merchant-supplied instruction, tool request, origin, or policy
      change is discarded rather than applied.
    - _Requirements: 3.1, 3.6, 3.7_

- [ ] 2. Migration 0012 and the two new persistence owners

  - [ ] 2.1 Create the migration
    - Create `cloudflare/d1/migrations/0012_knowgrph_purchase_lifecycle_runtime.sql` with the three designed tables:
      `payment_purchase_discovery_runs`, `payment_purchase_discovery_costs`,
      `payment_purchase_execution_outcomes`, plus the designed index.
    - Include every `CHECK` exactly as designed, the discovery-cost `UNIQUE (lifecycle_id, run_key, operation,
      attempt_index)`, `model_call_count IN (0, 1)`, the outcome enum, and the discovery-run composite primary key.
    - Add no column to migrations 0010 or 0011 and add no `DELETE` path on execution outcomes.
    - _Requirements: 3.3, 3.4, 7.3, 7.4_

  - [ ] 2.2 Create the discovery persistence owner
    - Create `cloudflare/workers/knowgrph-payment/purchaseDiscoveryPersistence.ts` reading the binding through the
      existing `readDb(env)` helper in `cloudflare/workers/shared/d1.ts`.
    - `appendDiscoveryCostEntry` writes the pre-call row with `model_call_count` `1` for a model call and `0` for a
      deterministic step, idempotent on the unique key; `completeDiscoveryCostEntry` records outcome and elapsed ms.
    - `upsertDiscoveryRun` records consumption and outcome keyed by `(lifecycle_id, run_key)`; run keys come from the
      existing `buildAgenticCommerceSemanticKey`.
    - Store no merchant URL beyond the canonical product URL digest and no address or provider identifier.
    - Every storage failure returns `purchase_storage_unavailable` and mutates nothing.
    - _Requirements: 3.4, 9.4_

  - [ ] 2.3 Create the execution persistence owner
    - Create `cloudflare/workers/knowgrph-payment/purchaseExecutionPersistence.ts` with
      `recordExecutionRevalidation`, `recordExecutionOutcome`, and `readExecutionOutcome`, reading the binding through
      the same `readDb(env)` helper.
    - `recordExecutionOutcome` uses the designed guarded update so a recorded terminal outcome is never replaced and
      `reconcile_attempts` only increments.
    - Merchant order and issuer result are stored as digests only.
    - Every storage failure returns `purchase_storage_unavailable` and mutates nothing.
    - _Requirements: 7.2, 7.3, 7.4, 9.4_

  - [ ]* 2.4 Write the cost-entry pairing property test
    - Create `cloudflare/workers/knowgrph-payment/__tests__/purchase-discovery-persistence.test.ts`
      (`node --import tsx --test`, `fast-check` at `{ numRuns: 100 }`).
    - **Property 5: Cost-entry pairing** — for any discovery run, rows with `model_call_count = 1` equal the model
      calls made, a duplicate attempt writes no second row, and a failed cost write leaves the action count unchanged.
    - **Validates: Requirements 3.4**

  - [ ]* 2.5 Write the terminal non-regression unit tests
    - A recorded terminal outcome survives every later write attempt; a repeated callback increments attempts without
      changing the outcome; a failing write returns `purchase_storage_unavailable` and mutates nothing.
    - _Requirements: 7.3, 7.4_

- [ ] 3. Lifecycle orchestrator

  - [ ] 3.1 Implement the orchestrator
    - Create `cloudflare/workers/knowgrph-payment/purchaseLifecycleOrchestrator.ts` as the only module that writes
      `phase`, `phase_state`, `next_action`, `financial_state_exists`, `terminal_at`, or `revision`.
    - Every write is a compare-and-swap predicated on the read `revision`; a losing write re-reads, re-derives, and
      applies no stale transition.
    - `derivePhaseGate` evaluates exactly one phase per request in the order funding, discovery, issuance, execution,
      returning `waiting` for any phase whose predecessor is not `complete`.
    - Map each `Phase_Gate_Result` to a phase state exactly as the design's state-machine table specifies, keeping
      `complete`, `cancelled`, and a recorded terminal outcome forward-only.
    - Project one `AgenticPurchaseLifecycleSnapshot` using only the existing phase and phase-state vocabularies, with
      exactly one next action.
    - A cancelled lifecycle returns `cancelled` for every gate and permits only reservation release, provider reads,
      outcome reconciliation, authorization blocking, and safe card closure.
    - An absent row, unknown phase or state, or an envelope digest that does not match the recomputed digest returns
      `lifecycle_state_invalid` with zero writes.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8_

  - [ ] 3.2 Wire lifecycle creation through the existing owners
    - Admit envelopes only through `validateAgenticPurchaseEnvelope`; create rows only through
      `createAgenticPurchaseLifecycle`; keep `financial_state_exists` at `0` until approval consumption.
    - Before financial state exists, hidden, closed, cancelled, malformed, page-originated, and unapproved
      invocations perform zero provider and zero financial calls.
    - _Requirements: 1.6, 1.7, 4.2_

  - [ ]* 3.3 Write the phase monotonicity property test
    - Create `cloudflare/workers/knowgrph-payment/__tests__/purchase-lifecycle-orchestrator.test.ts`.
    - **Property 1: Single-writer phase monotonicity** — for any interleaving of concurrent transitions, one write per
      revision succeeds and `complete`, `cancelled`, and terminal outcomes never weaken.
    - **Validates: Requirements 1.1, 1.4**

  - [ ]* 3.4 Write the gate-ordering property test
    - Create `grph-shared/__tests__/purchase-phase-gate.test.mjs`.
    - **Property 2: Gate ordering** — for any phase and phase-state combination, every phase whose predecessor is not
      `complete` returns `waiting` and no later-phase owner is invoked.
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 3.5 Write unit tests for invalid state and cancellation
    - Absent row, unknown phase, unknown state, and digest mismatch each return `lifecycle_state_invalid` with zero
      writes.
    - A cancelled lifecycle returns `cancelled` for all four gates and permits only the five allowlisted cleanup
      classes.
    - Add a focused check asserting exactly one writer of the lifecycle phase columns.
    - _Requirements: 1.1, 1.5, 1.8_

- [ ] 4. Checkpoint - policy, storage, and orchestrator
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Funding gate bound to chain-evidence agreement

  - [ ] 5.1 Implement the funding gate
    - Create `cloudflare/workers/knowgrph-payment/purchaseFundingGate.ts` returning `open` only when the sibling
      `FundingVerificationProjection` reports `agreement` true, `evidenceState` `chain_confirmed`,
      `providerCreditState` `credited`, and `evidenceFreshness` `fresh`.
    - Read the projection through the sibling boundary only: construct no chain request, no adapter instance, and no
      confirmation comparison here.
    - Any other projection combination returns `waiting` or `blocked` with the projection's own state named, opening
      no later phase and creating no approval, card, or authorization.
    - Reserve funding only through `reserveAgenticPurchaseFunding`; release only through
      `releaseAgenticPurchaseFundingReservation`, exactly once, with no return transfer created.
    - A disabled or policy-incomplete verification path blocks with the sibling's own named failure, zero external
      requests, and no reservation change.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 5.2 Write the funding agreement property test
    - Create `grph-shared/__tests__/purchase-funding-gate.test.mjs`.
    - **Property 3: Funding agreement necessity** — for any generated projection, the gate returns `open` if and only
      if agreement, `chain_confirmed`, `credited`, and `fresh` all hold.
    - **Validates: Requirements 2.1, 2.3**

  - [ ]* 5.3 Write unit tests for reservation and boundary purity
    - Replay one funding key across a simulated restart and assert one reservation and one transfer identity.
    - Cancellation before an authorization claim releases one reservation exactly once with `returnTransferCreated`
      false.
    - A contract address supplied as a deposit address is rejected; key, seed-phrase, raw-transaction, and
      deposit-address canaries never appear in the gate result.
    - Add a focused check asserting no chain adapter construction or confirmation-depth comparison in this module.
    - _Requirements: 2.2, 2.4, 2.5, 2.6_

- [ ] 6. Bounded discovery harness

  - [ ] 6.1 Create the merchant fixture set
    - Create `cloudflare/workers/knowgrph-payment/__tests__/fixtures/purchase-discovery/` as checked-in JSON page
      snapshots with synthetic HTTPS origins and products.
    - Cover: deterministic match, model-assisted match, no conforming item, unknown mandatory cost, price drift
      between observations, total over budget, blocked origin, instruction-injection body, quantity above one,
      expired envelope, cancellation between steps, page-count overrun, action-count overrun, model-call overrun, and
      a cost-write failure.
    - Embed the Runtime_Canary_Set inside fixture bodies so later boundary sweeps have something to find.
    - _Requirements: 3.2, 3.3, 3.6, 3.7, 3.8, 9.3_

  - [ ] 6.2 Implement the discovery run
    - Create `cloudflare/workers/knowgrph-payment/purchaseDiscoveryRun.ts` reading ceilings only from
      `AGENTIC_PURCHASE_LIMITS` and treating the validated envelope as immutable for the run.
    - Run deterministic DOM and structured-data extraction first and make zero model calls when extraction already
      yields a conforming candidate.
    - Write the pre-call cost entry before each model call leaves the boundary; a failed cost write aborts with
      `discovery_cost_write_failed` before any further browser or model action.
    - Track consumed pages, actions, model calls, and elapsed ms; report the reached ceiling and consumption with
      `discovery_budget_exhausted`.
    - Emit candidates only through `validateAgenticPurchaseCandidate`; persist the run through
      `upsertDiscoveryRun`.
    - Discard every merchant-supplied instruction, tool request, origin, price authority, and policy change, and keep
      model input free of every canary member.
    - Observe cancellation between steps and stop with `discovery_cancelled` plus consumption.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 6.3 Write the discovery boundedness property test
    - Create `cloudflare/workers/knowgrph-payment/__tests__/purchase-discovery-run.test.ts`.
    - **Property 4: Discovery boundedness** — for any generated fixture sequence, consumed pages, actions, and model
      calls never exceed the source ceilings, and the run ends in a candidate or a named typed code with consumption
      reported.
    - **Validates: Requirements 3.3, 3.6**

  - [ ]* 6.4 Write unit tests for the fixture matrix
    - Each fixture from 6.1 produces its designated typed result and creates zero approval, card, and authorization
      records.
    - The deterministic-match fixture consumes zero model calls; the model-assisted fixture consumes exactly one cost
      row per model call.
    - Every emitted candidate passes the existing validator with integer minor units and no extra key.
    - _Requirements: 3.2, 3.4, 3.5, 3.6_

- [ ] 7. Checkpoint - funding and discovery
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Card issuance boundary and fixture adapter

  - [ ] 8.1 Create the pure issuance contract
    - Create `grph-shared/src/payments/purchaseIssuanceContract.ts` with `CardControlField`, `EffectiveControlSet`,
      `ControlComparison`, `CardIssuanceRequest`, `CardIssuanceResult`, `CardControlReadResult`, `CardCloseResult`,
      `CardIssuanceAdapter`, and `compareEffectiveControls`.
    - `compareEffectiveControls` computes the per-field union as the more restrictive of provider-native and
      remote-host policy, treats a `null` on either side as unreadable, and reports unreadable as weaker.
    - A field restricted by neither source is weaker. Result names every weaker and unreadable field.
    - No type declares a PAN, CVV, or full-expiry member; `CardIssuanceResult` carries only `cardReference`,
      `brokerHandle`, `expiresAt`, and the control set.
    - _Requirements: 5.1, 5.3, 5.5, 5.7_

  - [ ] 8.2 Create the adapter boundary and fixture implementation
    - Create `cloudflare/workers/knowgrph-payment/cardIssuanceAdapter.ts` exposing exactly `create`, `read`, and
      `close`, selected by adapter identifier from the runtime policy source.
    - Create `cloudflare/workers/knowgrph-payment/fixtureCardIssuanceAdapter.ts` with no network path and no
      credential read, covering: full-control card, weaker-amount card, weaker-time-window card, unreadable-control
      card, exhausted-pool failure, missing-program failure, missing-product failure, and unavailable-injection
      failure.
    - _Requirements: 5.1, 5.4, 5.7_

  - [ ]* 8.3 Write the control-union property test
    - Create `grph-shared/__tests__/purchase-issuance-controls.test.mjs`.
    - **Property 7: Control-union non-weakening** — for any approved set and any provider-native and remote-host
      inputs, the comparison passes only when every field is at least as restrictive as approved, with unreadable
      always weaker.
    - **Validates: Requirements 5.3, 5.7**

  - [ ]* 8.4 Write unit tests for substitutability and field secrecy
    - A second fixture-backed adapter satisfies the same request and result types with no boundary change.
    - A focused check asserts no PAN, CVV, or full-expiry name is reachable from the boundary types.
    - _Requirements: 5.1, 5.5_

- [ ] 9. Issuance run

  - [ ] 9.1 Implement the issuance run
    - Create `cloudflare/workers/knowgrph-payment/purchaseIssuanceRun.ts` registering the approval through
      `registerAgenticPurchaseApproval` with lifecycle, envelope digest, candidate digest, amount in SGD minor units,
      currency, merchant policy, and an expiry at most `maximumApprovalTtlMs` after issue.
    - Consume through `consumeAgenticPurchaseApproval` after final validation and before any card creation request;
      consumption is the boundary that sets `financial_state_exists` through the orchestrator.
    - Reject consumption when the candidate digest, envelope digest, amount, currency, or merchant policy differs, or
      the approval expired, naming the differing field with zero provider requests.
    - Reject a second registration on a lifecycle holding a consumed approval and never reopen a consumed approval.
    - Create at most one card reference per lifecycle; an exact replay returns the prior reference.
    - Read controls, run `compareEffectiveControls`, and on failure record `card_controls_weaker_than_approved` with
      every weaker field, move the card to `closure_pending`, and grant no execution.
    - Missing program grant, product, pool, or injection capability fails before a usable card exists, names each
      missing input, and leaves the approval consumed with no card reference recorded.
    - Cap issued expiry at the approval ceiling and never beyond the envelope expiry.
    - An issuance failure after consumption keeps the approval consumed, records the failure, and requires a new buyer
      approval before another attempt.
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 5.2, 5.3, 5.4, 5.6, 5.7_

  - [ ]* 9.2 Write the approval single-consumption property test
    - Create `cloudflare/workers/knowgrph-payment/__tests__/purchase-issuance-run.test.ts`.
    - **Property 6: Approval single consumption** — for any number of concurrent consumers and any restart point,
      exactly one consumption succeeds and the consumed state survives.
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 9.3 Write unit tests for the issuance matrix
    - Race 100 identical issuance requests and assert one card reference with exact replay returning the prior result.
    - Each changed approval field and an expired approval reject consumption by field name with zero provider calls.
    - Weaker, unreadable, exhausted, and missing-program fixtures create no usable card.
    - Issued expiry never exceeds the approval ceiling or the envelope expiry.
    - _Requirements: 4.4, 5.2, 5.3, 5.4, 5.6, 5.7_

- [ ] 10. Checkpoint - issuance
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Execution contract and run

  - [ ] 11.1 Create the pure execution contract
    - Create `grph-shared/src/payments/purchaseExecutionContract.ts` with `RevalidationMember`,
      `compareRevalidationSet`, `MerchantOrderRead`, `IssuerAuthorizationResult`, `PurchaseOutcome`, and
      `derivePurchaseOutcome`.
    - `compareRevalidationSet` compares all eight members as exact values with amounts as integer minor units and
      names every mismatch.
    - `derivePurchaseOutcome` returns `purchase_succeeded` only when both sides are present and agree on order
      reference, total minor units, and currency; one side, a disagreement, or neither yields
      `purchase_outcome_unknown` with `reconcileRequired` true; a non-null recorded terminal is returned unchanged.
    - Clock-free and randomness-free.
    - _Requirements: 6.1, 6.2, 7.1, 7.2, 7.3_

  - [ ] 11.2 Implement the execution run
    - Create `cloudflare/workers/knowgrph-payment/purchaseExecutionRun.ts` re-reading the Revalidation_Set
      immediately before submission and comparing it against the approved candidate.
    - A mismatch stops with `execution_revalidation_failed` naming each member, before credential injection, before
      submission, and before an authorization claim; record the revalidation digest either way.
    - Pass the opaque `brokerHandle` to the browser control owner; no Knowgrph module outside the broker boundary
      receives a card field, and the browser model, screenshots, telemetry, logs, and general state never read one.
    - Claim the authorization through `claimAgenticPurchaseAuthorization`: exact duplicate returns the prior decision;
      every later competing identity, cancellation, or expiry is denied.
    - An authentication-required result hands off to the existing Paywall explicitly with no bypass or simulation.
    - Zero model calls; one `payment_cost_entries` row per provider request with `model_call_count` zero.
    - Cancellation before injection stops with `execution_cancelled`, makes no submission, and leaves the card
      `closure_pending`.
    - Enforce the source-owned maximum submission attempts of one.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 11.3 Write the authorization single-winner property test
    - Create `cloudflare/workers/knowgrph-payment/__tests__/purchase-execution-run.test.ts`.
    - **Property 8: Authorization single winner** — for any set of authorization identities, one is reserved, an exact
      duplicate returns the prior decision, and every competing identity is denied.
    - **Validates: Requirements 6.4**

  - [ ]* 11.4 Write unit tests for the revalidation matrix and broker boundary
    - Price drift, add-on, origin change, variant change, quantity change, currency change, and delivery-term
      fixtures each stop before injection with the member named and zero submissions.
    - An authentication-required fixture produces an explicit Paywall handoff with no simulated completion.
    - A focused check asserts card-field access only inside the broker boundary and that canaries never reach model,
      screenshot, telemetry, or log paths.
    - Execution records zero model calls and one cost entry per provider request.
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 6.7_

- [ ] 12. Terminal reconciliation, safe closure, and receipt

  - [ ] 12.1 Implement the reconciliation run
    - Create `cloudflare/workers/knowgrph-payment/purchaseReconciliationRun.ts` deriving the outcome through
      `derivePurchaseOutcome` and persisting it through `recordExecutionOutcome`.
    - Bound reconciliation by the source-owned maximum attempts and wall-clock seconds; make it idempotent for a
      repeated callback inside the source-owned replay window; never weaken a recorded terminal outcome.
    - An unknown outcome reconciles under the same lifecycle identifier and creates no second card, approval,
      authorization, or submission.
    - On a terminal outcome, block every new authorization immediately and set `terminal_at` exactly once through the
      orchestrator.
    - Keep the card `closure_pending` while Closure_Safety_Evidence is unmet, treating an unresolved hold, capture,
      reversal, refund, or force-post risk as unmet, and close exactly once through
      `closeAgenticPurchaseCardWhenSafe`.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 12.2 Write the minimized lifecycle receipt
    - Write exactly one receipt per lifecycle into the existing `payment_purchase_receipts` owner, carrying only
      opaque funding, candidate, card, authorization, order, cost, and disposal references.
    - Serialize through the existing `paymentRecordDocument.ts` printer so the sibling `chain_evidence` key is
      included and the document round-trips byte-identically.
    - Exclude every Runtime_Canary_Set member; a failed write returns `receipt_write_failed`, preserves the terminal
      outcome, and creates no second receipt on retry.
    - _Requirements: 7.6, 7.7, 7.8, 9.3_

  - [ ]* 12.3 Write the reconciliation confluence property test
    - Create `grph-shared/__tests__/purchase-reconciliation.test.mjs`.
    - **Property 9: Reconciliation idempotence and terminal non-regression** — for any order of merchant reads,
      issuer results, and duplicate callbacks, the derived outcome is order-independent, a recorded terminal outcome
      is never replaced, and no second card, approval, authorization, or submission is created.
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

  - [ ]* 12.4 Write unit tests for the terminal fixture matrix
    - Success, decline, timeout, duplicate callback, merchant-only, issuer-only, disagreement, cancellation, expiry,
      hold, capture, reversal, refund, and force-post fixtures each produce the designated outcome.
    - Closure stays pending while any risk fixture is active, then closes once under replay.
    - One receipt per lifecycle carries only opaque references and round-trips byte-identically; a failed write
      creates no second receipt.
    - _Requirements: 7.1, 7.2, 7.5, 7.6, 7.7, 7.8_

- [ ] 13. Checkpoint - execution and reconciliation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Route wiring inside the existing Worker

  - [ ] 14.1 Add the lifecycle routes
    - Create `cloudflare/workers/knowgrph-payment/purchaseLifecycleRoutes.ts` exposing open, snapshot, approve,
      advance, and cancel operations, each delegating to the orchestrator and returning the projected snapshot.
    - Register the paths in the existing route table and dispatch from `index.ts`; add no second Worker, binding, or
      route owner, and reuse the existing CORS, JSON, and error helpers.
    - Reject a request whose envelope fails the existing validator before any store or provider call.
    - _Requirements: 1.3, 1.6, 1.7_

  - [ ]* 14.2 Write route admission tests
    - Malformed envelope, unknown lifecycle, cancelled lifecycle, and unconfigured runtime each return a typed
      response with zero provider requests and zero writes.
    - The snapshot response carries the four phases, four states, and exactly one next action.
    - _Requirements: 1.3, 1.6, 1.8, 9.1_

- [ ] 15. Paywall surface and offline snapshot cache

  - [ ] 15.1 Render the four phases in the existing Paywall
    - Modify `canvas/src/features/payments/AgenticPurchaseLifecycleView.tsx` to render Funding, Discovery, Issuance,
      and Execution in order with each phase state, one next action, and the buyer approval action.
    - Render the funding projection facet as rows inside the funding phase item, reusing the sibling projection rows;
      add no second surface, overlay, or controller.
    - Each row carries an accessible name on the semantic element that owns it, with no selectable visual structure
      hidden as `aria-hidden` decoration.
    - _Requirements: 1.3, 1.7_

  - [ ] 15.2 Implement the offline snapshot cache
    - Create `canvas/src/lib/storage/purchaseLifecycleCache.ts` and register one collection in the existing
      `kg:knowgrph-storage` database, storing only the projected snapshot keyed by lifecycle identifier.
    - Store no candidate URL, address, card reference, or provider identifier; perform zero egress on read.
    - _Requirements: 9.3, 9.4_

  - [ ]* 15.3 Write surface and cache tests
    - Every phase-state combination renders at a 375 by 812 CSS-pixel viewport with no horizontal overflow and an
      accessible name per row.
    - An offline snapshot read records zero external requests and stores no minimized-field violation.
    - _Requirements: 1.3, 9.3_

- [ ] 16. Readiness reporting and registration

  - [ ] 16.1 Extend the readiness gate
    - Modify `scripts/lib/knowgrph-payments-readiness.mjs` to report all twenty
      `AGENTIC_PURCHASE_READINESS_CHECKS` entries independently inside the existing `gates` map, naming every missing
      input for a false check, and deriving none from another.
    - Delegate the funding checks to the sibling adapter-admission and proof-complete statuses rather than
      recomputing them, surfacing a sibling stale digest as the sibling's own stale result.
    - Report phase, phase state, Evidence_State, and consumed discovery counts; report no watched address, provider
      customer identifier, KYC field, card field, or key value.
    - Report fixture mode explicitly and never report a provider-backed check as met while fixture adapters are
      configured.
    - Read-only: zero writes, zero provider requests, zero chain requests, zero model calls. Exit non-zero for any
      false required check, a missing declared suite, or a source-evidence digest mismatch. Add no new command.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ] 16.2 Register the new suites and manifest entries
    - Add every new suite to `KNOWGRPH_PAYMENTS_LOCAL_VCC_SUITES` in `scripts/lib/knowgrph-payments-local-vcc.mjs`
      and the matching entries to `scripts/knowgrph-payments-readiness-properties.json`, so the digest-bound
      attestation covers Properties 1 through 10.
    - _Requirements: 8.3, 8.5_

  - [ ]* 16.3 Write the readiness derivation property test
    - Create `scripts/__tests__/knowgrph-purchase-lifecycle-readiness.test.mjs`.
    - **Readiness derivation property** — over generated policy, lifecycle, and record states, all twenty checks are
      independently derived, a changed source digest yields the stale result, and the exit code is non-zero for
      exactly the designated failing conditions.
    - **Validates: Requirements 8.1, 8.3, 8.5**

  - [ ]* 16.4 Write unit tests for reported output and fixture mode
    - A planted credential name or value in visible vars, bundle output, browser storage, a URL, a log, a cost entry,
      or a receipt fails the gate and changes no configuration.
    - Reported output carries no address, customer identifier, KYC field, card field, or key value, and fixture mode
      is explicit with no provider-backed check reported met.
    - _Requirements: 8.6, 8.7, 9.2_

- [ ] 17. Zero-egress and minimization sweep

  - [ ] 17.1 Add the boundary sweeps
    - Add focused source checks asserting: exactly one writer of the lifecycle phase columns; no PAN, CVV, or
      full-expiry name outside the broker fixture; no canary member outside a fixture body; every authored file below
      600 lines; no duplicated existing semantic-key, digest, validation, or persistence helper.
    - _Requirements: 9.3, 9.6_

  - [ ]* 17.2 Write the zero-egress property test
    - Create `cloudflare/workers/knowgrph-payment/__tests__/purchase-runtime-egress.test.ts` with a transport stub
      that throws on any invocation.
    - **Property 10: Zero egress and no canary leakage** — for any unconfigured policy, cancelled lifecycle, or
      rejected admission, the external request count is zero and no canary member appears in model input,
      screenshots, telemetry, logs, the general store, or the receipt.
    - **Validates: Requirements 9.1, 9.2, 9.3, 6.3, 5.5**

- [ ] 18. Final checkpoint - full verification
  - Run the full repository check and the extended payments readiness gate.
  - Confirm every property test from 1 through 10 is registered in the manifest and the local verification registry.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Sub-tasks marked `*` are optional property and unit test tasks. They may be skipped for a faster first pass; every
  sub-task without `*` is required.
- Every leaf sub-task cites either `_Requirements: ..._` or `**Validates: Requirements ...**`, so each unit of work
  traces to a normative clause in `requirements.md`.
- No signer, key material, broadcast path, chain write path, automatic return transfer, second Paywall, second panel,
  second payment controller, second Worker, second D1 binding, or second payment store is introduced anywhere in this
  plan.
- No policy literal is hardcoded in source or tests. Adapter ids, program references, ceilings, deadlines, and attempt
  counts resolve from `purchaseLifecycleRuntimeSsot.ts`; discovery ceilings resolve from `AGENTIC_PURCHASE_LIMITS`;
  chain and funding values resolve from `xsgdChainEvidenceSsot.ts`. Tests build explicit policy objects instead of
  relying on defaults.
- Fixtures are checked-in synthetic JSON with synthetic origins, products, digests, and references, so no task in this
  plan needs a network, a provider account, or credentials.
- Dev authoring only. No task edits a Prod mirror and no task performs a Cloudflare deployment; both require separate
  explicit authority.
- Card fields never enter Knowgrph surfaces: no PAN, CVV, or full-expiry value or field name appears in any Knowgrph
  type, log, screenshot, telemetry path, storage row, receipt, or model input. Execution carries only an opaque
  `brokerHandle`, and no Runtime_Canary_Set member appears outside a fixture body.
- Every existing atomic gate in `agenticPurchaseSafetyPersistence.ts` is called, never reimplemented or wrapped, and
  the existing `payment:runtime:readiness` gate is extended rather than replaced by a new command.
- Checkpoints (tasks 4, 7, 10, 13, 18) are verification barriers, not coding work, so they carry no leaf sub-tasks and
  do not appear in the dependency graph.

## Task Dependency Graph

Wave shape, read top to bottom:

- Waves 0-4 cover tasks 1-3 and end at the checkpoint in task 4. The policy source, the pure discovery contract, and
  the migration are independent openers; the two persistence owners and the orchestrator fan out from them; the
  orchestrator is the first serialization point because every later phase owner consumes its snapshot and its
  single-writer guarantee.
- Waves 5-8 cover tasks 5-6 and end at the checkpoint in task 7. The funding gate and the merchant fixture set are
  independent of each other; the discovery run serializes on both the fixtures and the discovery persistence owner.
- Waves 9-13 cover tasks 8-9 and end at the checkpoint in task 10. The pure issuance contract gates the adapter
  boundary, which gates the issuance run.
- Waves 14-18 cover tasks 11-12 and end at the checkpoint in task 13. The pure execution contract gates the execution
  run; reconciliation and the receipt serialize behind it and behind the execution persistence owner.
- Waves 19-23 cover tasks 14-17 and end at the final checkpoint in task 18. Routes, the Paywall rows, and the offline
  cache are independent of each other but all consume the orchestrator snapshot. The readiness extension and the
  boundary sweeps run once every owner exists, and suite registration (16.2) is the last serialization point because
  it must name every authored suite, including the zero-egress suite from 17.2.
- Test sub-tasks sharing a target file with an adjacent test sub-task are placed one wave apart so no two tasks write
  the same file concurrently.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "2.3", "3.1"] },
    { "id": 2, "tasks": ["1.4", "2.4", "2.5", "3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4"] },
    { "id": 4, "tasks": ["3.5"] },
    { "id": 5, "tasks": ["5.1", "6.1"] },
    { "id": 6, "tasks": ["5.2", "6.2"] },
    { "id": 7, "tasks": ["5.3", "6.3"] },
    { "id": 8, "tasks": ["6.4"] },
    { "id": 9, "tasks": ["8.1"] },
    { "id": 10, "tasks": ["8.2"] },
    { "id": 11, "tasks": ["8.3", "8.4", "9.1"] },
    { "id": 12, "tasks": ["9.2"] },
    { "id": 13, "tasks": ["9.3"] },
    { "id": 14, "tasks": ["11.1"] },
    { "id": 15, "tasks": ["11.2"] },
    { "id": 16, "tasks": ["11.3", "12.1"] },
    { "id": 17, "tasks": ["11.4", "12.2"] },
    { "id": 18, "tasks": ["12.3", "12.4"] },
    { "id": 19, "tasks": ["14.1", "15.1", "15.2"] },
    { "id": 20, "tasks": ["14.2", "15.3", "16.1", "17.1"] },
    { "id": 21, "tasks": ["17.2"] },
    { "id": 22, "tasks": ["16.2"] },
    { "id": 23, "tasks": ["16.3", "16.4"] }
  ]
}
```
