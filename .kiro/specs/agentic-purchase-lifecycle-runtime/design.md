---
title: "Agentic Purchase Lifecycle Runtime - Design"
doc_type: "Design"
id: "agentic-purchase-lifecycle-runtime-design"
spec: "agentic-purchase-lifecycle-runtime"
version: "0.1.0"
status: "design-draft"
created: "2026-08-14"
updated: "2026-08-14"
author: "airvio / joohwee"
domain: "knowgrph"
lang: "en-US"
frontmatter_contract: "required"
requirements_source: ".kiro/specs/agentic-purchase-lifecycle-runtime/requirements.md"
upstream_spec: ".kiro/specs/knowgrph-payments/requirements.md"
sibling_spec: ".kiro/specs/xsgd-onchain-verification/design.md"
guidelines: "huijoohwee.github.io/guidelines/prd-tad-adr-guidelines.md"
deployment_topology: "Dev authoring only; Prod mirror and Cloudflare deployment require separate explicit authority"
constraints: ["browser-first", "local-first", "offline-first", "mobile-first", "foss-first", "tco-zero", "token-economical", "harness-first", "zero-egress-default", "no-signer-in-repository", "provider-agnostic-adapter-boundary", "single-paywall-surface"]
tags: ["payments", "agentic-commerce", "xsgd", "avalanche", "straitsx", "virtual-card", "discovery", "issuance", "execution"]
---

# Design Document

## Overview

The runtime is one phase machine plus four phase owners, all inside the existing `knowgrph-payment` Worker. Every
durable fact already has a table; every validation already has an owner. This design adds the sequencing, the two
missing adapter boundaries (card issuance, secure broker handle), the discovery cost ledger, and one migration.

The controlling invariant: **only the Lifecycle_Orchestrator writes phase state, and it writes only through
compare-and-swap on `revision`.** Phase owners return typed results; they never transition themselves. That single
rule is what makes the ten correctness properties provable in isolation.

### Repository grounding (verified, not assumed)

| Existing owner | What it already provides | How this design uses it |
|---|---|---|
| `grph-shared/src/payments/agenticPurchaseRuntimeContract.ts` | `AGENTIC_PURCHASE_PHASES`, `AGENTIC_PURCHASE_PHASE_STATES`, `AGENTIC_PURCHASE_LIMITS`, `AGENTIC_PURCHASE_AVALANCHE_NETWORK`, envelope/candidate/observation validators, `assertAgenticPurchaseDataMinimized` | Sole vocabulary, limits, and validation source. Not re-declared. |
| `grph-shared/src/payments/agenticPurchaseReadinessContract.ts` | The twenty readiness checks, `buildAgenticPurchaseReadiness`, `buildAgenticPurchaseLifecyclePreview`, `cancelAgenticPurchaseLifecycle` | Readiness derivation and cancellation semantics reused, extended only with runtime evidence inputs. |
| `cloudflare/workers/knowgrph-payment/agenticPurchaseSafetyPersistence.ts` | `createAgenticPurchaseLifecycle`, `registerAgenticPurchaseApproval`, `consumeAgenticPurchaseApproval`, `reserveAgenticPurchaseFunding`, `releaseAgenticPurchaseFundingReservation`, `claimAgenticPurchaseAuthorization`, `closeAgenticPurchaseCardWhenSafe` | The atomic gates. This design calls them; it does not reimplement or wrap their guarantees. |
| `cloudflare/d1/migrations/0010_...lifecycle.sql` | `payment_purchase_lifecycles` with `revision`, `cancellation_requested`, `financial_state_exists`, plus reservations, approvals, cards, authorizations, receipts | The lifecycle store. Migration 0012 adds only what 0010 lacks. |
| `grph-shared/src/payments/chainEvidenceContract.ts` | `FundingVerificationProjection` with `evidenceState`, `providerCreditState`, `observationBlockHeight`, `evidenceObservationTime`, `evidenceFreshness`, `agreement` | Read-only input to the funding gate. No chain call from this increment. |
| `grph-shared/src/payments/paymentRecordDocument.ts` | Exact-key record document with the sibling `chain_evidence` key and byte-identical round-trip | The receipt printer and parser. |
| `cloudflare/d1/migrations/0009_...runtime.sql` | `payment_cost_entries` with `CHECK (model_call_count = 0)` | Reused for zero-model provider calls. Discovery model calls need a separate table because this constraint forbids them. |
| `cloudflare/workers/shared/d1.ts` | `readDb(env)`, `D1DatabaseLike`, `queryAll`, normalizers | The only binding access path for the two new persistence owners. |
| `canvas/src/features/payments/AgenticPurchaseLifecycleView.tsx`, `PaywallOverlay.tsx` | The single existing Paywall and lifecycle view | The only surface. Extended with phase rows and one next action. |

### Authority and Scope

This design owns sequencing only. It introduces no rail, signer, chain write, second surface, second Worker, or
second store. Provider-specific behavior lives behind two adapter boundaries and one fixture implementation each.

---

## Architecture

### Component structure inside the existing Worker

```
knowgrph-payment Worker
├─ purchaseLifecycleRoutes.ts        (route admission, envelope admission, snapshot response)
├─ purchaseLifecycleOrchestrator.ts  ← ONLY writer of phase columns; CAS on revision
│   ├─ purchaseFundingGate.ts        (reads Funding_Verification_Projection; no chain call)
│   ├─ purchaseDiscoveryRun.ts       (bounded harness; cost ledger; candidate emission)
│   ├─ purchaseIssuanceRun.ts        (approval consumption → Card_Issuance_Adapter)
│   ├─ purchaseExecutionRun.ts       (revalidation → broker handle → Authorization_Claim)
│   └─ purchaseReconciliationRun.ts  (terminal outcome, safe closure, receipt write)
├─ cardIssuanceAdapter.ts            (typed boundary: create | read | close)
├─ fixtureCardIssuanceAdapter.ts     (fixture implementation; no network, no credentials)
├─ purchaseDiscoveryPersistence.ts   (discovery runs + model cost entries, migration 0012)
├─ purchaseExecutionPersistence.ts   (execution outcomes, monotonic terminal guard)
└─ agenticPurchaseSafetyPersistence.ts   (existing atomic gates — unchanged)

grph-shared/src/payments
├─ purchaseLifecycleRuntimeSsot.ts   (the single policy source; 100% required, no defaults)
├─ purchaseDiscoveryContract.ts      (types + pure candidate evaluation)
├─ purchaseIssuanceContract.ts       (types + pure Effective_Control_Set comparison)
└─ purchaseExecutionContract.ts      (types + pure revalidation and outcome derivation)

canvas/src
├─ features/payments/AgenticPurchaseLifecycleView.tsx   (modified: phase rows, one next action)
└─ lib/storage/purchaseLifecycleCache.ts                (offline snapshot read, no egress)
```

Pure logic lives in `grph-shared`; every side effect lives in the Worker. That split is what lets the property tests
run without a network, a database, or credentials.

### Phase sequence

```
open(envelope)
  → validateAgenticPurchaseEnvelope           (existing)
  → createAgenticPurchaseLifecycle            (existing, idempotent on lifecycle_key)
  → orchestrator.derive()                     → funding gate

funding
  → reserveAgenticPurchaseFunding             (existing, one per funding key)
  → read Funding_Verification_Projection      (sibling boundary, read-only)
  → agreement ∧ chain_confirmed ∧ credited ∧ fresh ?  complete : waiting|blocked

discovery
  → deterministic Extraction_Result per page  (≤5 pages, ≤12 actions)
  → pre-write cost entry → model call         (≤2 calls; abort if cost write fails)
  → validateAgenticPurchaseCandidate          (existing)
  → complete with candidate digest, or typed abort

issuance
  → registerAgenticPurchaseApproval           (existing)
  → buyer approval via existing Paywall
  → consumeAgenticPurchaseApproval            (existing, atomic, sets financial_state_exists)
  → cardIssuanceAdapter.create → read controls
  → compareEffectiveControls(approved, effective)  → usable : closure_pending + blocked

execution
  → re-read Revalidation_Set → compareRevalidationSet
  → mismatch ? stop before injection : broker handle → inject → submit
  → claimAgenticPurchaseAuthorization         (existing, single winner)
  → merchant order read + issuer result

terminal
  → derivePurchaseOutcome(merchantRead, issuerResult)
  → succeeded | failed | cancelled | expired | outcome_unknown (bounded reconcile)
  → closeAgenticPurchaseCardWhenSafe          (existing, once)
  → write one Lifecycle_Receipt               (record document round-trip)
```

### Phase state machine

Per phase, the orchestrator maps a Phase_Gate_Result to one `AGENTIC_PURCHASE_PHASE_STATES` value:

| Gate result | Phase state | Later phases | Writes |
|---|---|---|---|
| `open` and owner not yet run | `ready` | `waiting` | CAS next action only |
| `open` and owner running | `in_progress` | `waiting` | CAS next action only |
| `open` and owner returned success | `complete` | next phase evaluated | CAS phase advance |
| `waiting` | `waiting` | `waiting` | CAS next action only |
| `blocked` with named code | `blocked` | `waiting` | CAS blocking code into next action |
| `cancelled` | `cancelled` | `cancelled` | CAS terminal, cleanup classes only |
| terminal outcome unknown | `outcome_unknown` | `outcome_unknown` | CAS once, reconcile in place |
| card risk unresolved | `closure_pending` | unchanged | CAS once |

Transitions are forward-only per lifecycle: `complete`, `cancelled`, and a recorded terminal outcome never weaken. A
losing CAS re-reads and re-derives; it never replays a stale transition.

---

## Components and Interfaces

### The single policy source — `purchaseLifecycleRuntimeSsot.ts`

`resolvePurchaseLifecycleRuntimePolicy(env)` returns either a complete frozen policy or a typed
`purchase_runtime_disabled` failure naming every absent input. No value has a default, and no value is ever read
from a caller, a merchant response, a provider response, or a cached row.

| Group | Values |
|---|---|
| Adapters | card issuance adapter id, secure broker adapter id, browser control owner id, fixture mode flag |
| Card program | program grant reference, virtual-card product id, card pool id, control-read capability flag |
| Reconciliation | maximum reconcile attempts, maximum reconcile wall-clock seconds, callback replay window seconds |
| Execution | per-request deadline milliseconds, maximum submission attempts (`1`), authentication handoff timeout seconds |
| Secrets (presence only) | provider issuance credential, provider order-read credential, broker injection credential |

Discovery ceilings are **not** re-declared here: they resolve from `AGENTIC_PURCHASE_LIMITS`. Chain and funding
values resolve from the sibling `xsgdChainEvidenceSsot.ts`. Secret values are reported as presence flags only.

### Pure contracts

```ts
// purchaseDiscoveryContract.ts
export type DiscoveryBudget = Readonly<{
  maximumProductPages: number; maximumBrowserActions: number; maximumModelCalls: number
}>

export type DiscoveryConsumption = Readonly<{
  productPages: number; browserActions: number; modelCalls: number; elapsedMs: number
}>

export type ExtractionResult = Readonly<{
  merchantOrigin: string; canonicalProductUrl: string; product: string; variant: string | null
  quantity: 1; itemAmountMinor: number | null; shippingMinor: number | null; taxMinor: number | null
  totalMinor: number | null; currency: 'SGD'; observedAt: string
  evidenceSelectors: ReadonlyArray<string>; instructionLikeContentFound: boolean
}>

export type DiscoveryFailureCode =
  | 'discovery_budget_exhausted' | 'discovery_cost_write_failed' | 'discovery_cancelled'
  | 'discovery_unknown_mandatory_cost' | 'discovery_total_over_budget' | 'discovery_price_drift'
  | 'discovery_origin_not_allowed' | 'discovery_injection_detected'
  | 'discovery_quantity_invalid' | 'discovery_envelope_expired' | 'discovery_no_conforming_item'

export type DiscoveryRunResult =
  | Readonly<{ ok: true; candidate: AgenticPurchaseCandidate; consumption: DiscoveryConsumption }>
  | Readonly<{ ok: false; code: DiscoveryFailureCode
               reachedCeiling: keyof DiscoveryBudget | null; consumption: DiscoveryConsumption
               offendingFields: ReadonlyArray<string> }>

export const evaluateExtraction: (args: Readonly<{
  envelope: AgenticPurchaseEnvelope; extraction: ExtractionResult
  priorObservation: ExtractionResult | null
}>) => Readonly<{ conforming: boolean; code: DiscoveryFailureCode | null
                  offendingFields: ReadonlyArray<string> }>
```

`evaluateExtraction` is total, synchronous, clock-free, and randomness-free. It is the only place the abort codes in
R3.6 are decided, and it decides them in a fixed precedence order: `discovery_envelope_expired`,
`discovery_origin_not_allowed`, `discovery_injection_detected`, `discovery_quantity_invalid`,
`discovery_unknown_mandatory_cost`, `discovery_price_drift`, `discovery_total_over_budget`,
`discovery_no_conforming_item`.

```ts
// purchaseIssuanceContract.ts
export type CardControlField =
  | 'amountMinor' | 'currency' | 'channel' | 'merchantPolicy'
  | 'geography' | 'timeWindow' | 'expiry' | 'disposalPolicy'

export type EffectiveControlSet = Readonly<Record<CardControlField, string | number | null>>

export type ControlComparison =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: 'card_controls_weaker_than_approved'
               weakerFields: ReadonlyArray<CardControlField>
               unreadableFields: ReadonlyArray<CardControlField> }>

export const compareEffectiveControls: (args: Readonly<{
  approved: EffectiveControlSet; providerNative: EffectiveControlSet
  remoteHostPolicy: EffectiveControlSet
}>) => ControlComparison

export type CardIssuanceAdapter = Readonly<{
  adapterId: string
  create: (request: CardIssuanceRequest) => Promise<CardIssuanceResult>
  read: (cardReference: string) => Promise<CardControlReadResult>
  close: (cardReference: string) => Promise<CardCloseResult>
}>
```

A `null` in either provider-native or remote-host input is an **unreadable** field, and an unreadable field is
treated as weaker (R5.7). The union is computed per field as the more restrictive of the two sources; a field
restricted by neither is weaker. `CardIssuanceResult` carries `cardReference`, `brokerHandle`, `expiresAt`, and the
control set — never PAN, CVV, or full expiry. A focused check asserts those three names are absent from every type
reachable from the boundary.

```ts
// purchaseExecutionContract.ts
export type RevalidationMember =
  | 'merchantOrigin' | 'product' | 'variant' | 'quantity'
  | 'totalMinor' | 'currency' | 'deliveryTerms' | 'prohibitedAddOns'

export const compareRevalidationSet: (args: Readonly<{
  approved: AgenticPurchaseCandidate; observed: ExtractionResult
  deliveryTerms: string; addOns: ReadonlyArray<string>
}>) => Readonly<{ ok: boolean; mismatchedMembers: ReadonlyArray<RevalidationMember> }>

export type PurchaseOutcome =
  | 'purchase_succeeded' | 'purchase_failed' | 'purchase_cancelled'
  | 'purchase_expired' | 'purchase_outcome_unknown'

export const derivePurchaseOutcome: (args: Readonly<{
  merchantOrder: MerchantOrderRead | null; issuerResult: IssuerAuthorizationResult | null
  cancelled: boolean; expired: boolean; recordedTerminal: PurchaseOutcome | null
}>) => Readonly<{ outcome: PurchaseOutcome; reconcileRequired: boolean }>
```

`derivePurchaseOutcome` returns `purchase_succeeded` only when both sides are present and agree on order reference,
total minor units, and currency. One side present, a disagreement, or either side absent yields
`purchase_outcome_unknown` with `reconcileRequired` true. A non-null `recordedTerminal` is returned unchanged, which
is how terminal non-regression (P9) is enforced in pure code.

### Secure broker boundary

The broker is a handle, not a data path. `purchaseExecutionRun.ts` receives `brokerHandle` from the issuance result
and passes it to the browser control owner as an opaque token. No Knowgrph type declares a card field, so no
Knowgrph module can read one. The fixture broker asserts that the injection request contains only the handle, the
target origin, and the field names to fill.

---

## Data Models

### Migration `0012_knowgrph_purchase_lifecycle_runtime.sql`

Three tables. `payment_cost_entries` cannot host discovery model calls because it constrains `model_call_count = 0`,
so discovery costs get their own table with the inverse constraint.

```sql
CREATE TABLE IF NOT EXISTS payment_purchase_discovery_runs (
  lifecycle_id TEXT NOT NULL,
  run_key TEXT NOT NULL,
  product_pages INTEGER NOT NULL CHECK (product_pages >= 0 AND product_pages <= 5),
  browser_actions INTEGER NOT NULL CHECK (browser_actions >= 0 AND browser_actions <= 12),
  model_calls INTEGER NOT NULL CHECK (model_calls >= 0 AND model_calls <= 2),
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  outcome TEXT NOT NULL,
  candidate_digest TEXT,
  observed_total_minor INTEGER CHECK (observed_total_minor IS NULL OR observed_total_minor > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (lifecycle_id, run_key)
);

CREATE TABLE IF NOT EXISTS payment_purchase_discovery_costs (
  id TEXT PRIMARY KEY,
  lifecycle_id TEXT NOT NULL,
  run_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  attempt_index INTEGER NOT NULL CHECK (attempt_index >= 0),
  model_call_count INTEGER NOT NULL CHECK (model_call_count IN (0, 1)),
  model_cost_usd REAL NOT NULL DEFAULT 0 CHECK (model_cost_usd >= 0),
  outcome TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (lifecycle_id, run_key, operation, attempt_index)
);

CREATE TABLE IF NOT EXISTS payment_purchase_execution_outcomes (
  lifecycle_id TEXT PRIMARY KEY,
  authorization_key TEXT NOT NULL,
  revalidation_digest TEXT NOT NULL,
  merchant_order_digest TEXT,
  issuer_result_digest TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'purchase_succeeded', 'purchase_failed', 'purchase_cancelled',
    'purchase_expired', 'purchase_outcome_unknown'
  )),
  reconcile_attempts INTEGER NOT NULL DEFAULT 0 CHECK (reconcile_attempts >= 0),
  terminal_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_purchase_discovery_costs_lifecycle
  ON payment_purchase_discovery_costs(lifecycle_id, created_at);
```

`model_call_count IN (0, 1)` makes "exactly one cost entry per model call" (R3.4) a storage-level fact rather than a
convention: the pre-write entry is inserted with `1` for a model call and `0` for a deterministic step, and the
`UNIQUE` key forbids a duplicate for the same attempt.

The terminal write uses a guarded update so a recorded terminal outcome can never be replaced:

```sql
UPDATE payment_purchase_execution_outcomes
   SET outcome = ?1, merchant_order_digest = ?2, issuer_result_digest = ?3,
       reconcile_attempts = reconcile_attempts + 1, terminal_at = ?4, updated_at = ?5
 WHERE lifecycle_id = ?6
   AND (terminal_at IS NULL OR outcome = ?1)
```

### Reused tables

Funding reservations, approvals, cards, authorizations, and receipts stay in migration 0010 with their existing
unique constraints. Chain evidence stays in 0011. No column is added to either.

### Browser-local snapshot cache

`canvas/src/lib/storage/purchaseLifecycleCache.ts` adds one collection to the existing `kg:knowgrph-storage`
database, keyed by lifecycle identifier, holding only the projected snapshot: four phases, four phase states, one
next action, the funding projection facet, and consumed discovery counts. It stores no candidate URL, no address, no
card reference, and no provider identifier, and it performs zero egress on read.

---

## Error Handling

| Class | Codes | Effect |
|---|---|---|
| Admission | `purchase_runtime_disabled`, `lifecycle_state_invalid` | Zero egress, zero writes, no gate opened |
| Funding | sibling codes (`chain_verification_disabled`, `chain_token_policy_missing`, `chain_finality_policy_missing`), `funding_agreement_absent` | `blocked` or `waiting`, reservation state unchanged |
| Discovery | the eleven `DiscoveryFailureCode` values | Abort before next browser or model action; no approval, card, or authorization |
| Issuance | `approval_already_consumed`, `approval_expired`, `approval_field_changed`, `card_program_incomplete`, `card_controls_weaker_than_approved`, `card_reference_exists` | No usable card; approval stays consumed; card moves to `closure_pending` when one exists |
| Execution | `execution_revalidation_failed`, `execution_cancelled`, `authorization_conflict`, `authentication_required` | Stop before injection or submission; no second submission |
| Terminal | `purchase_outcome_unknown`, `receipt_write_failed`, `closure_blocked_by_risk` | Reconcile in place; no second card or checkout; no second receipt |
| Storage | `purchase_storage_unavailable` | Mutate nothing, derive no phase advance |

Every code is returned as a typed result. No code is thrown across the boundary, and no code carries a provider
message, a merchant string, or a canary member.

---

## Correctness Properties

### Property 1: Single-writer phase monotonicity
For any interleaving of concurrent transition attempts on one lifecycle, exactly one write per revision succeeds, and
`complete`, `cancelled`, and a recorded terminal outcome never weaken.

**Validates: Requirements 1.1, 1.4**

### Property 2: Gate ordering
For any combination of phase and phase state, every phase whose predecessor is not `complete` returns `waiting`, and
no later-phase owner is invoked.

**Validates: Requirements 1.2, 1.3**

### Property 3: Funding agreement necessity
For any generated projection, the funding gate returns `open` if and only if agreement, `chain_confirmed`,
`credited`, and `fresh` all hold.

**Validates: Requirements 2.1, 2.3**

### Property 4: Discovery boundedness
For any generated merchant fixture sequence, consumed pages, actions, and model calls never exceed the source
ceilings, and the run ends in a candidate or a named typed code with its consumption reported.

**Validates: Requirements 3.3, 3.6**

### Property 5: Cost-entry pairing
For any discovery run, the number of rows with `model_call_count = 1` equals the number of model calls made, and a
failed cost write leaves the action count unchanged.

**Validates: Requirements 3.4**

### Property 6: Approval single consumption
For any number of concurrent consumers and any restart point, exactly one consumption succeeds and the consumed state
survives.

**Validates: Requirements 4.2, 4.3**

### Property 7: Control-union non-weakening
For any approved control set and any provider-native and remote-host inputs, a card is usable only when every field
is at least as restrictive as approved, with an unreadable field always weaker.

**Validates: Requirements 5.3, 5.7**

### Property 8: Authorization single winner
For any set of authorization identities, one is reserved, an exact duplicate returns the prior decision, and every
competing identity is denied.

**Validates: Requirements 6.4**

### Property 9: Reconciliation idempotence and terminal non-regression
For any order of merchant reads, issuer results, and duplicate callbacks, the derived outcome is order-independent, a
recorded terminal outcome is never replaced, and no second card, approval, authorization, or submission is created.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

### Property 10: Zero egress and no canary leakage
For any unconfigured policy, cancelled lifecycle, or rejected admission, the external request count is zero, and no
Runtime_Canary_Set member appears in model input, screenshots, telemetry, logs, the general store, or the receipt.

**Validates: Requirements 9.1, 9.2, 9.3, 6.3, 5.5**

---

## Testing Strategy

| Layer | Runner | Scope |
|---|---|---|
| `grph-shared` pure logic | `node --test` on `.mjs` suites with `fast-check` at `{ numRuns: 100 }` | Properties 2, 3, 4, 7, 9, and the extraction precedence order |
| Worker persistence and orchestration | `node --import tsx --test` with a D1 double | Properties 1, 5, 6, 8, and storage-unavailable paths |
| Canvas surface and cache | existing canvas test setup | Phase rows at 375 by 812 CSS pixels, offline snapshot read, zero egress |
| Boundary sweeps | focused source checks | Single phase writer, card-field name absence, canary absence, file size below 600 lines |
| Readiness | `scripts/__tests__` `.mjs` suite | Independent derivation of the twenty checks, delegation of funding statuses, exit codes |

Fixtures are checked-in JSON with synthetic origins, products, digests, and references. No test needs a network, a
provider account, or credentials. Every property test file carries the tag comment
`Feature: agentic-purchase-lifecycle-runtime, Property {n}: {statement}`.

---

## Design Decisions and Rationale

| Decision | Rationale | Rejected alternative |
|---|---|---|
| One orchestrator owns every phase write | Makes Properties 1 and 2 provable by a single-writer check instead of auditing every call site | Each phase owner transitions itself — unprovable and race-prone |
| Pure evaluation in `grph-shared`, effects in the Worker | Property tests run with clock and randomness stubbed to throw | Testing through the Worker only — slow, needs doubles for pure facts |
| Separate discovery cost table | The existing cost table constrains `model_call_count = 0`; relaxing it would weaken every other payment path | Relax the existing constraint |
| Unreadable control field counts as weaker | Fails closed when a provider cannot report a control | Assume provider default restrictions |
| Broker handle, never card fields, in Knowgrph types | Makes card-field secrecy a type-level fact checkable by a name sweep | Redact card fields at log time |
| Fixture adapters first, provider adapters after OQ-A1 and OQ-A3 | Operator reaches an observable lifecycle with zero credentials, so time-to-value does not depend on external approval | Block the increment on provider onboarding |
| Reuse the existing atomic gates unchanged | Their race and restart guarantees are already proven; wrapping them would create a second authority | Reimplement consumption and claim logic in the orchestrator |
| Single migration with three tables | One reversible schema step, no new store | Add columns across 0010 and 0011 |

---

## Requirements Traceability

| Requirement | Design owner |
|---|---|
| R1 Lifecycle orchestrator | `purchaseLifecycleOrchestrator.ts`, phase state machine table, Properties 1, 2 |
| R2 Funding gate | `purchaseFundingGate.ts`, sibling projection input, Property 3 |
| R3 Discovery harness | `purchaseDiscoveryContract.ts`, `purchaseDiscoveryRun.ts`, `purchaseDiscoveryPersistence.ts`, Properties 4, 5 |
| R4 Approval consumption | `purchaseIssuanceRun.ts` over the existing gate, Property 6 |
| R5 Card issuance boundary | `purchaseIssuanceContract.ts`, `cardIssuanceAdapter.ts`, `fixtureCardIssuanceAdapter.ts`, Properties 7, 10 |
| R6 Execution sequencing | `purchaseExecutionContract.ts`, `purchaseExecutionRun.ts`, Properties 8, 10 |
| R7 Terminal reconciliation | `purchaseReconciliationRun.ts`, `purchaseExecutionPersistence.ts`, record document round-trip, Property 9 |
| R8 Readiness reporting | `scripts/lib/knowgrph-payments-readiness.mjs` extension, local verification registry |
| R9 Minimization and zero egress | `purchaseLifecycleRuntimeSsot.ts`, boundary sweeps, Property 10 |

---

## Open Questions Carried Into Design

- OQ-A1 (card provider): only `fixtureCardIssuanceAdapter.ts` is implemented. The boundary is provider-agnostic, so a
  provider implementation lands without a type change.
- OQ-A2 (authoritative merchant order read): `derivePurchaseOutcome` treats a merchant-only signal as
  `purchase_outcome_unknown`, so resolving this question narrows behavior without changing the contract.
- OQ-A3 (broker location and handle lifetime): the handle is opaque with a source-owned expiry; the fixture broker
  asserts the injection request shape.
- OQ-A4 (XSGD to card-program settlement): excluded. The funding gate proves funding; it does not move it.
- OQ-A5 (reconciliation ceilings): both are required policy values with no default, so an unset ceiling disables the
  runtime rather than guessing a cadence.
