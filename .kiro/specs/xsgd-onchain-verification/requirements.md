---
title: "XSGD On-Chain Verification - Requirements"
doc_type: "Requirements"
id: "xsgd-onchain-verification-requirements"
spec: "xsgd-onchain-verification"
version: "0.1.0"
status: "requirements-draft"
created: "2026-08-13"
updated: "2026-08-13"
author: "airvio / joohwee"
domain: "agenticgraph"
lang: "en-US"
frontmatter_contract: "required"
upstream_spec: ".kiro/specs/agenticgraph-payments/requirements.md"
upstream_owned_requirements: ["R13", "R14", "R15", "R16", "R17"]
guidelines: "huijoohwee.github.io/guidelines/prd-tad-adr-guidelines.md"
deployment_topology: "Dev authoring only; Prod mirror and Cloudflare deployment require separate explicit authority"
chain_evidence_sources:
  - id: "avalanche-data-api"
    role: "hosted indexed read path for C-Chain EVM balances, transfers, blocks"
    reference: "https://build.avax.network/docs/api-reference/data-api"
  - id: "straitsx-provider-credit"
    role: "authoritative account credit and deposit-address authority"
    reference: "https://docs.straitsx.com/docs/introduction"
constraints: ["browser-first", "local-first", "offline-first", "mobile-first", "foss-first", "tco-zero", "token-economical", "harness-first", "zero-egress-default", "read-only-chain-access", "provider-agnostic-adapter-boundary"]
tags: ["payments", "xsgd", "avalanche", "c-chain", "data-api", "straitsx", "reconciliation", "offline-first"]
related:
  - ".kiro/specs/agenticgraph-payments/requirements.md"
  - "grph-shared/src/payments/straitsxPaymentSsot.ts"
  - "grph-shared/src/payments/agenticPurchaseReadinessContract.ts"
  - "grph-shared/src/payments/agenticPurchaseRuntimeContract.ts"
  - "grph-shared/src/payments/paymentRecordDocument.ts"
  - "cloudflare/workers/agenticgraph-payment"
---

# Requirements Document

## Introduction

AgenticGraph's Singapore agentic-purchase lifecycle funds a non-custodial XSGD position on Avalanche C-Chain before an
AI agent may discover an item, receive a disposable virtual card, and execute checkout. The accepted upstream spec
owns that lifecycle, but its Funding gate can only be believed, not observed: its evidence is provider credit plus
an accepted chain receipt, with no indexed on-chain read path and no chain reference bound to the offline receipt.

This increment adds one typed chain-evidence boundary and one hosted read adapter over it, so Funding carries
on-chain evidence independent of provider credit. The boundary is read-only: it signs nothing, broadcasts nothing,
and grants no spend authority. Its output is a funding-state projection that downstream lifecycle gates consume as
a precondition.

The [Avalanche Data API](https://build.avax.network/docs/api-reference/data-api) supplies the read path, as a
zero-infrastructure indexed read source: no node, no archive RPC, no new persistent store, and one read-only key.
Its published scope and provenance are recorded under Dependencies.

Provider behavior below is grounded in the documentation cited inline. Details that could not be confirmed from the
documentation are recorded under Open Questions rather than assumed. Content from the referenced sources was
paraphrased and summarized for compliance with licensing restrictions.

### Authority and Scope

| Concern | Owner |
|---|---|
| Paywall surface, lifecycle identifier, phase projection, cancellation | agenticgraph-payments R13 |
| Rail selection, credential custody, provider egress, data minimization | agenticgraph-payments R1, R2, R12 |
| Funding tuple validation, signer authority, funding reservation, provider credit gate | agenticgraph-payments R14 |
| Bounded discovery, card issuance mechanics, merchant checkout execution | agenticgraph-payments R15, R16, R17 |
| Payment record document, parser, printer, round-trip contract | agenticgraph-payments R7 |
| Typed chain-evidence adapter boundary and its hosted read adapter | This file, R1 |
| XSGD balance and transfer verification on C-Chain `43114` | This file, R2 |
| Confirmation-depth policy and monotonic confirmation state | This file, R3 |
| Chain-versus-provider reconciliation including disagreement | This file, R4 |
| Bounded attempts, typed unresolved stopped state, offline cached evidence | This file, R5, R6 |
| Funding-state projection, readiness reporting, cost observation | This file, R7, R8, R9 |

This increment adds no rail, signer, write path, second Worker, or second payment store. It carries development
authority only; production mirror publication and Cloudflare deployment require a separate explicit instruction.

### Compounding Lens Commitments

| Lens | Product rule for on-chain verification | Anchors |
|---|---|---|
| Min-viable-max-value | One read boundary, one adapter, one projection. No indexer, node, wallet, or second chain source. | R1, R2, R7 |
| TCO-zero | Runs on the existing `agenticgraph-payment` Worker, its D1 binding, and browser-local cache. No new store, proxy tier, or default metered egress. | R1, R6, R9 |
| Token economics | Zero model calls; evidence is read, compared, and projected by deterministic code. | R9 |
| Harness-first | Every read is a typed request with a typed result, an attempt budget, a cost entry, and a typed stopped state. | R1, R5, R9 |

---

## Glossary

Reused unchanged from agenticgraph-payments: **Payment_Trust_Boundary**, **Payment_Client**, **Payment_Intent_Record**,
**Readiness_Gate**, **Sandbox_Mode**, **Provider_Terminal_State**, **Reconciliation_Stopped_State**,
**Funding_Adapter**, **Cost_Observer**, **Approval_Gate**, **Reconciler**, **Record_Serializer**, **Record_Parser**.

- **Chain_Evidence_Adapter**: The typed read-only boundary answering one chain-evidence question for one address, token, and chain. An interface with zero or more implementations; never a signer.
- **Data_API_Adapter**: The Chain_Evidence_Adapter implementation backed by the [Avalanche Data API](https://build.avax.network/docs/api-reference/data-api).
- **Chain_Evidence_Record**: The typed result of one verification attempt: chain id, token contract, watched address, observed balance in base units, token decimals, matched transfer references, observation block height, Evidence_State, attempt count.
- **Watched_Address**: The provider-account-returned XSGD deposit address on Avalanche, treated as read-only input. Never a token contract address.
- **Expected_Token_Contract**: The XSGD ERC-20 contract address for C-Chain, resolved from the repository-owned funding verification source, never from a caller, name, or symbol.
- **Confirmation_Policy**: The source-owned minimum confirmation depth in blocks that converts an observed transfer plus the latest indexed height into `chain_confirmed`.
- **Evidence_State**: `chain_unobserved`, `chain_pending`, `chain_confirmed`, `chain_disagreement`, or `chain_verification_unresolved`.
- **Typed_Verification_Failure**: A named result that carries no Evidence_State claim: `chain_verification_disabled`, `chain_token_policy_missing`, `chain_finality_policy_missing`, `chain_evidence_malformed`, a timeout, a transport failure, a rate-limit class, or a storage-unavailability failure.
- **Disagreement_Class**: The single class attached to `chain_disagreement`, drawn from `provider_hold`, `provider_status_conflict`, `chain_amount_under_credit`, `chain_amount_over_credit`, `provider_credit_missing`, `chain_evidence_missing`, and resolved in that fixed precedence order.
- **Evidence_Freshness_Label**: `fresh`, `stale`, or `expired`; derived from the observation block height, the source-owned maximum evidence age, and whether the Funding phase has closed. Only `fresh` may open a downstream gate.
- **Funding_Verification_Projection**: The read-only projection of Evidence_State, provider credit state, observation block height, evidence observation time, Evidence_Freshness_Label, and agreement result that downstream gates read.
- **Chain_Verification_Stopped_State**: `chain_verification_unresolved`; a local bounded stopped state that is neither confirmation nor a Provider_Terminal_State.
- **Attempt_Budget**: The typed maximum adapter requests, pages, and wall-clock run seconds one verification run may consume before reaching Chain_Verification_Stopped_State.
- **Evidence_Cache**: The origin- and profile-scoped local store of Chain_Evidence_Records, keyed by chain id, token contract, watched address, and observation block height, bounded by a source-owned maximum entry count.
- **Adapter_Admission_Status**: Whether an adapter has complete configuration to attempt a first read. Never a verification claim.
- **Proof_Complete_Verification_Status**: Whether a confirmed, provider-agreeing Chain_Evidence_Record exists with a byte-identical record round-trip.

---

## User Journeys

Every user story is anchored to one Journey JV or JO stage. Journey JV runs inside the upstream `JX-Funding` stage
owned by agenticgraph-payments R14 and does not replace it.

### Journey JV: Funding verification - prove the XSGD credit against the chain

| Stage | Action | Touchpoint | Pain point | Opportunity |
|---|---|---|---|---|
| JV-Trigger | Funding reports provider credit for an approved amount | Funding_Adapter | Credit is a single-source claim | A second independent read source |
| JV-Observe | Read XSGD balance and inbound transfers for the watched address | Data_API_Adapter | Node or archive RPC needed | Hosted indexed read, zero infrastructure |
| JV-Confirm | Observed transfer reaches the required confirmation depth | Confirmation_Policy | Shallow reads can regress | Confirmation that never regresses |
| JV-Reconcile | Chain evidence and provider credit are compared | Reconciler | Silent disagreement blocks nothing | Typed disagreement that fails closed |
| JV-Return | Buyer reopens later and reads funding evidence offline | Evidence_Cache, record projection | Receipt has no chain reference | Receipt binds hash and block height |

### Journey JO: Solo_Operator - enable verification from zero state

| Stage | Action | Touchpoint | Pain point | Opportunity |
|---|---|---|---|---|
| JO-Discover | Operator reads what verification needs | Readiness_Gate output | Unknown prerequisites | Gate names every missing input |
| JO-Engage | Operator configures the read key and token contract | Worker secret store, source SSOT | Secrets drift into visible config | Gate fails on a key name or value in visible vars |
| JO-Complete | Operator observes one confirmed evidence record | Readiness_Gate output | No independent funding proof | Proof-complete status separate from admission |
| JO-Return | Operator re-runs the gate after a change | Readiness_Gate output | Silent drift | Read-only gate, zero writes |

---

## Time-to-Value

| Dimension | Estimate | Target ceiling | Validation method |
|---|---|---|---|
| TTV steps (Solo_Operator, zero state to first confirmed evidence) | 4 steps | <= 6 steps | Walk-through on a clean checkout with a read key |
| TTV elapsed (Solo_Operator) | ~15 min | <= 30 min | Timed first run on a clean checkout |
| TTV steps (Buyer_SG, credit to visible chain evidence) | 0 extra steps | 0 extra steps | Verification runs inside the existing Funding phase |
| TTV elapsed (verification run, warm adapter) | ~3 s | <= 10 s | Timed run against recorded adapter fixtures |
| First-value action | One Chain_Evidence_Record reaches `chain_confirmed` and the projection reflects it | - | Observable state transition plus a record entry |
| Persona | Solo_Operator, Buyer_SG | - | Defined in User Journeys |

Operator TTV excludes provider account approval and Data API plan approval, which are outside AgenticGraph control and
tracked under Open Questions.

---

## Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---|---|---|
| Provider-credited funding records carrying an independent on-chain evidence reference | 0 (no indexed read path exists) | 100% | Increment 1 |
| Confirmed records that later regress to a weaker Evidence_State | not measured | 0 | Increment 1 |
| Repeated runs on identical evidence producing a different projection | not measured | 0 | Increment 1 |
| Adapter requests per verification run | undefined | <= Attempt_Budget, typed stop at the limit | Increment 1 |
| Egress requests while the adapter is disabled or offline | not measured | 0 | Increment 1 |
| Cached evidence read without a recorded observation block height | not measured | 0 | Increment 1 |
| Spend authority granted by this layer | not measured | 0 | Increment 1 |
| Token cost / month on the verification path | not measured | $0.00 (zero model calls) | Continuous |
| Monthly TCO (fixed infrastructure) | $0.00 (existing Worker plus D1 free tier) | $0.00 | Continuous |
| Time-to-Value (Solo_Operator) | not measured | <= 30 min, <= 6 steps | Increment 1 |
| ROI score (capability aggregate) | - | >= 8 | Increment 1 |

Metered Data API plan cost is variable observability cost, excluded from monthly TCO; quotas are under Open Questions.

---

## MoSCoW Priority

ROI uses `ROI = (User Impact x Reach) / (Build Hours + Monthly TCO + Token Cost per Month)`, with Reach expressed in
verification runs per month at launch and Impact on a 1-5 scale.

| Tier | Feature | Req | Impact x Reach | Build hours | Monthly TCO | Token cost / month | ROI |
|---|---|---|---|---|---|---|---|
| Must | Typed chain-evidence adapter boundary | R1 | 5 x 40 = 200 | 4 | $0.00 | $0.00 | 50.0 |
| Must | XSGD balance and transfer verification on `43114` | R2 | 5 x 40 = 200 | 6 | $0.00 | $0.00 | 33.3 |
| Must | Confirmation depth and monotonic state | R3 | 5 x 40 = 200 | 4 | $0.00 | $0.00 | 50.0 |
| Must | Chain-versus-provider reconciliation | R4 | 5 x 40 = 200 | 5 | $0.00 | $0.00 | 40.0 |
| Must | Bounded attempts and typed stopped state | R5 | 4 x 40 = 160 | 3 | $0.00 | $0.00 | 53.3 |
| Must | Funding-state projection without spend authority | R7 | 5 x 40 = 200 | 4 | $0.00 | $0.00 | 50.0 |
| Must | Verification readiness reporting | R8 | 4 x 20 = 80 | 3 | $0.00 | $0.00 | 26.7 |
| Must | Read-key custody, minimization, zero model calls | R9 | 5 x 40 = 200 | 3 | $0.00 | $0.00 | 66.7 |
| Should | Offline cached evidence with height-keyed invalidation | R6 | 4 x 25 = 100 | 5 | $0.00 | $0.00 | 20.0 |
| Could | CSV operations export of funding history for audit | - | 2 x 5 = 10 | 4 | $0.00 | $0.00 | 2.5 |
| Could | A second adapter behind the same boundary | - | 3 x 5 = 15 | 6 | $0.00 | $0.00 | 2.5 |
| Won't (this increment) | Chain writes, node or indexer operation, chains beyond `43114`, tokens beyond XSGD, XSGD-to-card settlement movement (upstream OQ-18), a second Worker or chain cache service | - | - | - | - | - | - |

**Min-viable scope**: the eight Must rows. One boundary, one adapter, one confirmation policy, one reconciliation
rule, one projection, one readiness view.

---

## Requirements

### Requirement 1: Typed chain-evidence adapter boundary

**User Story:** As a Solo_Operator, I want chain reads behind one typed read-only boundary, so that a single hosted
provider never becomes the assumed sole source of chain truth.

**Journey stage:** JV-Observe, JO-Engage

**Lens fit:** min-viable-max-value (one interface, one implementation), TCO-zero (inside the existing
Payment_Trust_Boundary), token economics (zero model calls), harness-first (typed request and result, bounded attempts).

#### Acceptance Criteria

1. THE Chain_Evidence_Adapter SHALL accept a typed request containing chain id, token contract address, watched address, and a block range expressed as a start height and an end height, and SHALL return either a Chain_Evidence_Record or a typed failure result carrying a named failure class and the attempt index.
2. THE Chain_Evidence_Adapter SHALL expose read operations only and SHALL hold no private key, seed phrase, signing capability, or transaction-submission path.
3. THE Payment_Trust_Boundary SHALL be the only AgenticGraph component that sends a Chain_Evidence_Adapter request to an external source, and no Chain_Evidence_Adapter implementation SHALL be reachable from Payment_Client bundle output.
4. THE Data_API_Adapter SHALL be one named implementation selected by adapter identifier from the repository-owned funding verification source, SHALL send every request to the single host and API version pinned in that source (OQ-31), and the boundary SHALL accept additional implementations without a change to its request or result types.
5. WHERE a Data API key is configured, THE Data_API_Adapter SHALL send it in the `x-glacier-api-key` header from server-side secret storage, because the Data API documents that header as the key location and warns against exposing keys in public repositories ([Getting Started](https://build.avax.network/docs/api-reference/data-api/getting-started)).
6. WHERE any of the adapter identifier, the pinned host and API version, the read key required until OQ-26 resolves, or the per-request deadline is absent from its owning source, THE verification path SHALL return `chain_verification_disabled`, SHALL name each absent input, SHALL send zero external requests, and SHALL leave every upstream funding gate unchanged.
7. THE verification path SHALL add no second Worker, no second payment store, no new persistent store, and no chain write path.
8. IF a Chain_Evidence_Adapter request omits chain id, token contract address, watched address, start height, or end height, or carries a non-integer height, a height below `0`, or an end height below its start height, THEN THE Chain_Evidence_Adapter SHALL return a typed failure result naming each rejected field, SHALL send zero external requests, and SHALL consume no Attempt_Budget entry.
9. IF an adapter response omits a field the Chain_Evidence_Record requires or carries a value outside its typed domain, THEN THE Chain_Evidence_Adapter SHALL return `chain_evidence_malformed` as a typed failure result, SHALL emit no Chain_Evidence_Record, and SHALL make no Evidence_State claim.
10. WHEN one adapter request exceeds the per-request deadline in milliseconds read from the repository-owned funding verification source, THE Chain_Evidence_Adapter SHALL abandon that request, SHALL return a typed timeout failure result, and SHALL count the abandoned request against the Attempt_Budget owned by R5.

**Verifiable Completion Conditions**

- `Verify the adapter interface exposes only read operations and a focused check finds zero signing, key-material, or transaction-submission symbols reachable from it` (criteria 1, 2)
- `Verify a second recorded-fixture implementation satisfies the same request and result types with no boundary change, and every request targets the single source-pinned host and API version` (criterion 4)
- `Verify the key is read from server-side secret storage, sent only in the x-glacier-api-key header, and absent from bundle output, logs, cache entries, and record projections` (criterion 5)
- `Verify an unconfigured adapter names every absent input, returns chain_verification_disabled with zero external requests and no upstream gate mutation, no adapter implementation is reachable from client bundle output, and the change set adds no second worker, store, or write path` (criteria 3, 6, 7)
- `Verify requests missing a field, carrying a non-integer or negative height, or carrying an end height below its start height are rejected by field name with zero external requests and zero Attempt_Budget consumption` (criterion 8)
- `Verify a response missing a required record field or carrying an out-of-domain value returns chain_evidence_malformed with no Chain_Evidence_Record and no Evidence_State claim` (criterion 9)
- `Verify a fixture exceeding the source-owned per-request deadline is abandoned, returns a typed timeout failure, and counts exactly one attempt against the Attempt_Budget` (criterion 10)

---

### Requirement 2: XSGD balance and transfer verification on Avalanche C-Chain

**User Story:** As a Buyer_SG, I want the XSGD credit to my deposit address observed on chain, so that funding rests
on chain evidence rather than one provider claim.

**Journey stage:** JV-Observe

**Lens fit:** min-viable-max-value (two reads answer the funding question), TCO-zero (hosted index, no node), token
economics (deterministic comparison), harness-first (typed evidence with explicit units).

#### Acceptance Criteria

1. THE verification path SHALL resolve chain id `43114`, the Expected_Token_Contract, and the XSGD token decimals only from the repository-owned funding verification source, and SHALL reject a request that supplies or overrides any of those three values with a typed failure naming the rejected field, zero adapter requests, and no Evidence_State claim.
2. THE verification path SHALL use the provider-account-returned deposit address as the Watched_Address, which the StraitsX deposit-address contract returns with its blockchain and token attributes ([Create a deposit address](https://docs.straitsx.com/reference/create-deposit-address)), SHALL compare every address as case-insensitively normalized EVM hex, and SHALL reject with a typed failure and zero adapter requests any request whose Watched_Address is not a well-formed EVM hex address, equals the Expected_Token_Contract, or carries blockchain and token attributes that do not resolve to the source-owned chain id and XSGD token.
3. THE Data_API_Adapter SHALL read balances through `/v1/chains/{chainId}/addresses/{address}/balances:listErc20` filtered by `contractAddresses`, which the operation documents together with an optional `blockNumber` ([List ERC-20 balances](https://build.avax.network/docs/api-reference/data-api/evm-balances/listErc20Balances)), and SHALL read transfers through `/v1/chains/{chainId}/addresses/{address}/transactions:listErc20`, treating `startBlock` as inclusive and `endBlock` as exclusive as documented ([List ERC-20 transfers](https://build.avax.network/docs/api-reference/data-api/evm-transactions/listErc20Transactions)).
4. THE verification path SHALL match a transfer only when the returned contract address equals the Expected_Token_Contract, the destination equals the Watched_Address, and the returned value as integer base units is greater than or equal to the approved amount expressed in the same base units, and SHALL evaluate each transfer independently without summing values across transfers. Name, symbol, logo, price, spam-filter, and reputation fields SHALL NOT establish token identity, because the documented balance response carries those as provider heuristics ([List ERC-20 balances](https://build.avax.network/docs/api-reference/data-api/evm-balances/listErc20Balances)).
5. IF a returned decimals value is absent, is not a non-negative integer, or differs from the source-owned XSGD decimals, THEN THE verification path SHALL return `chain_evidence_malformed`, SHALL make no Evidence_State claim, and SHALL apply no rescaling, decimals conversion, or floating-point arithmetic to the returned amounts.
6. WHEN no matching transfer is present in the requested range, THE verification path SHALL return Evidence_State `chain_unobserved` with the requested block range and the observation block height, SHALL make no confirmation claim, and SHALL assert no absence of the transfer on chain.
7. IF chain id, the Expected_Token_Contract, or the XSGD token decimals is absent, empty, or malformed in the repository-owned funding verification source, THEN THE verification path SHALL return `chain_token_policy_missing` naming each absent or malformed input, SHALL send zero adapter requests, and SHALL make no Evidence_State claim.
8. IF the requested block range is absent, carries a non-integer or negative bound, or has a start block that is not below its end block, THEN THE verification path SHALL return a typed failure naming the invalid bound, SHALL send zero adapter requests, and SHALL make no Evidence_State claim.
9. THE verification path SHALL record the observed XSGD balance as integer base units together with the block height at which the balance was read, and SHALL require a matched inbound transfer for any Evidence_State other than `chain_unobserved`, so that a non-zero balance alone never establishes a match.

**Verifiable Completion Conditions**

- `Verify chain id, token contract, and decimals come from one source owner, a caller override is rejected before egress, and a watched address that is malformed, equal to the contract address, or carries non-matching blockchain or token attributes fails with zero adapter requests` (criteria 1, 2)
- `Verify fixtures for a matching transfer, an over-amount transfer, a same-symbol different-contract transfer, an outbound transfer, an under-amount transfer, and an empty range mark only the matching and over-amount cases observed` (criteria 3, 4, 6)
- `Verify adjacent half-open block windows count each matching transfer exactly once across 100 generated window splits` (criterion 3)
- `Verify absent, non-integer, and mismatched decimals each return chain_evidence_malformed and yield no Evidence_State claim` (criterion 5)
- `Verify an absent or malformed source-owned chain id, token contract, or decimals value returns chain_token_policy_missing, names each offending input, and records zero adapter requests` (criterion 7)
- `Verify an absent, non-integer, or inverted block range fails with zero adapter requests, and a non-zero balance with no matched inbound transfer stays chain_unobserved with its recorded balance height` (criteria 8, 9)

---

### Requirement 3: Confirmation depth and monotonic confirmation state

**User Story:** As a Buyer_SG, I want a confirmed funding record to stay confirmed, so that a reorganized or shallow
read cannot revoke funding I already received.

**Journey stage:** JV-Confirm

**Lens fit:** min-viable-max-value (one policy value governs confirmation), TCO-zero (one extra block read), token
economics (deterministic comparison), harness-first (typed policy input, typed transition).

#### Acceptance Criteria

1. THE Confirmation_Policy SHALL read exactly one minimum confirmation depth in blocks, as a required integer at or above `1`, from the repository-owned funding verification source once per verification run, and SHALL reject a depth supplied by a caller, a cached record, or an adapter response.
2. IF the configured depth is absent, non-integer, or below `1`, THEN THE verification path SHALL return `chain_finality_policy_missing`, SHALL send zero adapter requests, and SHALL make no confirmation claim.
3. THE verification path SHALL read the latest indexed block height once per verification run through `/v1/chains/{chainId}/blocks` for the same chain id used for the transfer read, which the documented example returns with block number, hash, and timestamp ([Getting Started](https://build.avax.network/docs/api-reference/data-api/getting-started)).
4. WHEN a matching transfer is observed AND the latest indexed height is at or above the transfer block number AND the latest indexed height minus the transfer block number is below the configured depth, THE verification path SHALL return Evidence_State `chain_pending` with the observation block height and the transfer block number, and SHALL make no confirmation claim.
5. WHEN a matching transfer is observed AND the latest indexed height minus the transfer block number is at or above the configured depth, THE verification path SHALL compare the two heights as integer block numbers and SHALL return Evidence_State `chain_confirmed` with the transaction hash, the transfer block number, and the observation block height.
6. WHILE a Chain_Evidence_Record for one chain id, token contract, watched address, and transaction hash holds `chain_confirmed`, WHEN a later observation for that same tuple reports `chain_unobserved`, `chain_pending`, `chain_verification_unresolved`, `chain_evidence_malformed`, or an observation block height at or below the recorded observation block height, THE verification path SHALL retain `chain_confirmed` for that tuple and SHALL record the later observation as a separate observation entry that replaces no recorded field of the confirmed record.
7. WHEN a later observation reports a different transaction hash for an already confirmed lifecycle identifier, THE verification path SHALL record the additional hash and SHALL keep exactly one confirmed funding state for that identifier.
8. IF the latest indexed block height read fails, or returns an absent or non-integer block number, THEN THE verification path SHALL return `chain_verification_unresolved`, SHALL make no confirmation claim, and SHALL leave any recorded `chain_confirmed` state unchanged.
9. IF the latest indexed block height is below the matched transfer block number, or below the highest indexed block height already recorded for the same chain id, THEN THE verification path SHALL treat the read as an index regression, SHALL return Evidence_State `chain_pending` with both the regressed height and the highest recorded indexed height, SHALL make no confirmation claim, and SHALL record the observation as a separate observation entry.

**Verifiable Completion Conditions**

- `Verify a missing, non-integer, or sub-1 depth returns chain_finality_policy_missing with zero adapter requests, and a caller-supplied or response-supplied depth is rejected` (criteria 1, 2)
- `Verify depth-boundary fixtures at depth minus one, exactly depth, and depth plus one yield chain_pending, chain_confirmed, chain_confirmed` (criteria 3-5)
- `Replay 100 generated observation sequences containing regressions, reordering, and duplicates against one confirmed record and verify the confirmed state never weakens` (criterion 6)
- `Verify a second transaction hash for a confirmed lifecycle is recorded without creating a second confirmed funding state` (criterion 7)
- `Verify a failed, absent, or non-integer latest-indexed-height read returns chain_verification_unresolved with no confirmation claim and no change to a recorded chain_confirmed state` (criterion 8)
- `Verify an indexed height below the matched transfer block number and an indexed height below the highest recorded indexed height each yield chain_pending with no confirmation claim across 100 generated regression sequences` (criterion 9)

---

### Requirement 4: Reconciliation of chain evidence against provider credit

**User Story:** As a Solo_Operator, I want chain evidence and provider credit compared explicitly, so that a
disagreement blocks the lifecycle instead of passing silently.

**Journey stage:** JV-Reconcile

**Lens fit:** min-viable-max-value (one comparison replaces per-surface guessing), TCO-zero (reuses existing provider
reads), token economics (zero model calls), harness-first (typed agreement with a named disagreement class).

#### Acceptance Criteria

1. THE Reconciler SHALL compare the Chain_Evidence_Record against the authoritative provider balance read that agenticgraph-payments R14 already requires, keyed on the lifecycle identifier, chain id, Expected_Token_Contract, Watched_Address, and approved amount in integer base units, SHALL return exactly one typed result per comparison, and SHALL treat neither source as sufficient alone. THE result SHALL be identical whichever source was read first, as required by property P9.
2. WHEN evidence is `chain_confirmed` AND the authoritative provider read reports credit equal to the approved amount in integer base units for that lifecycle identifier, THE Reconciler SHALL report agreement and SHALL record the transaction hash, the provider credit reference, and the observation block height. Agreement SHALL be the only result that permits a downstream lifecycle gate to open.
3. WHEN evidence is `chain_confirmed` AND the authoritative provider read reports no credit entry for that lifecycle identifier, THE Reconciler SHALL return `chain_disagreement` with class `provider_credit_missing` and SHALL keep every downstream lifecycle gate closed.
4. WHEN provider credit is present AND evidence remains `chain_unobserved` or `chain_pending` after the Attempt_Budget is exhausted, THE Reconciler SHALL return `chain_disagreement` with class `chain_evidence_missing`, SHALL record the attempt count and the last observation block height, and SHALL keep every downstream lifecycle gate closed.
5. WHERE a StraitsX blockchain deposit callback is received, THE Reconciler SHALL treat its `status`, `transaction_hash`, `blockchain`, `amount`, and `blocked_reasons` fields as untrusted candidate evidence under the callback authentication and replay-safe settlement rules owned by agenticgraph-payments R5, and SHALL require an independent chain observation before agreement, noting the documented `pending`, `completed`, and `failed` statuses and the compliance hold array ([Blockchain Callbacks](https://docs.straitsx.com/docs/blockchain-callbacks)).
6. WHEN an authenticated deposit callback reports a non-empty `blocked_reasons` array, THE Reconciler SHALL return `chain_disagreement` with class `provider_hold`, SHALL keep every downstream lifecycle gate closed, and SHALL retain that class in precedence over confirmed chain evidence until a later authenticated callback for the same lifecycle identifier reports an empty `blocked_reasons` array.
7. THE Reconciler SHALL record every disagreement with its class, the lifecycle identifier, the observation block height, the compared amounts in integer base units, and the compared references, SHALL create no chain transaction, no return transfer, and no provider write in response, and SHALL create no duplicate record when the same chain observation and provider read are reconciled again.
8. THE Reconciler SHALL assign at most one disagreement class per comparison, resolving overlapping cases in the fixed precedence order `provider_hold`, `provider_status_conflict`, `chain_amount_under_credit`, `chain_amount_over_credit`, `provider_credit_missing`, `chain_evidence_missing`.
9. WHEN evidence is `chain_confirmed` AND provider credit is present but differs from the matched transfer value in integer base units, THE Reconciler SHALL return `chain_disagreement` with class `chain_amount_over_credit` when the matched transfer value exceeds the provider credit and class `chain_amount_under_credit` when it is below, and SHALL keep every downstream lifecycle gate closed.
10. WHEN an authenticated deposit callback reports status `failed` for a lifecycle identifier whose evidence is `chain_confirmed`, THE Reconciler SHALL return `chain_disagreement` with class `provider_status_conflict` and SHALL keep every downstream lifecycle gate closed. WHEN provider credit is present AND evidence is `chain_pending` within the Attempt_Budget, THE Reconciler SHALL withhold agreement, SHALL keep every downstream lifecycle gate closed, and SHALL assign no disagreement class.

**Verifiable Completion Conditions**

- `Verify agreement, provider_credit_missing, chain_evidence_missing, and provider_hold fixtures each produce the documented class and keep downstream gates closed, and that agreement is the only gate-opening result` (criteria 2-4, 6)
- `Verify a deposit callback alone never produces agreement without an independent chain observation` (criteria 1, 5)
- `Verify every disagreement path performs zero chain transactions, zero return transfers, and zero provider writes, that each record carries its class, lifecycle identifier, observation block height, compared amounts, and both compared references, and that re-reconciling the same observation and provider read creates no duplicate record` (criterion 7)
- `Verify reconciling a chain observation and a provider credit read in either order yields the same result across 100 generated pairs, and that every overlapping fixture resolves to exactly one class in the documented precedence order` (criteria 1, 8)
- `Verify over-credit and under-credit amount fixtures produce chain_amount_over_credit and chain_amount_under_credit, a failed callback status against confirmed evidence produces provider_status_conflict, a provider_hold persists over confirmed evidence until an empty blocked_reasons callback arrives, and pending-with-credit inside the Attempt_Budget withholds agreement with no disagreement class` (criteria 6, 9, 10)

---

### Requirement 5: Bounded attempts and a typed unresolved stopped state

**User Story:** As a Solo_Operator, I want verification to stop at a named state, so that an unavailable or
rate-limited read source cannot spin an unbounded loop.

**Journey stage:** JV-Observe

**Lens fit:** min-viable-max-value (one budget covers requests and pages), TCO-zero (bounded egress), token economics
(zero model calls on retry), harness-first (typed stop condition instead of polling).

#### Acceptance Criteria

1. THE Attempt_Budget SHALL define a maximum adapter request count, a maximum page count, and a maximum wall-clock run duration in seconds per verification run, all three read from the repository-owned funding verification source.
2. WHEN any Attempt_Budget ceiling is reached without agreement, THE verification path SHALL return `chain_verification_unresolved` with the name of the reached ceiling, the consumed request count, the consumed page count, the elapsed run seconds, and the last observation block height, and SHALL send no further adapter request in that run.
3. THE Chain_Verification_Stopped_State SHALL open no downstream lifecycle gate and SHALL be projected as neither confirmation nor a Provider_Terminal_State.
4. IF the adapter returns HTTP status `429` AND a `retry-after` or `ratelimit-reset` header is present that parses as a non-negative integer number of seconds, THEN THE verification path SHALL stop sending requests for the run, SHALL return `chain_verification_unresolved` with a typed rate-limit class, and SHALL send no request to that adapter until at least the reported seconds have elapsed, because the Data API documents those headers and advises discontinuing requests on rate-limit errors ([Usage Guide](https://build.avax.network/docs/api-reference/data-api/usage)).
5. IF the adapter returns HTTP status `400`, `401`, `403`, or `404`, THEN THE verification path SHALL return a typed failure classified from the documented error body fields `message`, `error`, and `statusCode`, and SHALL retry no request in the same run ([Usage Guide](https://build.avax.network/docs/api-reference/data-api/usage)).
6. IF the adapter returns HTTP status `500`, `502`, or `503`, THEN THE verification path SHALL retry within the Attempt_Budget using a delay that increases with each retry and stays within the minimum delay, maximum delay, and randomized jitter range read from the repository-owned funding verification source, SHALL count every retry against the Attempt_Budget request ceiling, and SHALL return `chain_verification_unresolved` when any ceiling is reached.
7. WHILE paginating, THE verification path SHALL follow only `nextPageToken` values that stay within the Attempt_Budget page and wall-clock ceilings, fall within the documented 24-hour page-token validity window, and differ from every token already followed in the same run, and SHALL return `chain_verification_unresolved` when a token repeats or the validity window has elapsed ([Usage Guide](https://build.avax.network/docs/api-reference/data-api/usage)).
8. IF the adapter returns HTTP status `429` AND no `retry-after` or `ratelimit-reset` header is present, or the present header value does not parse as a non-negative integer number of seconds, THEN THE verification path SHALL stop sending requests for the run, SHALL return `chain_verification_unresolved` with a typed rate-limit class recording the missing or unparsable header, and SHALL send no request to that adapter until at least the source-owned default cool-down seconds read from the repository-owned funding verification source have elapsed ([Usage Guide](https://build.avax.network/docs/api-reference/data-api/usage)).
9. IF an adapter request ends with no HTTP status, including a connection failure, a name-resolution failure, or elapse of the source-owned per-request timeout, THEN THE verification path SHALL count that request against the Attempt_Budget request ceiling, SHALL return a typed transport failure that is neither confirmation nor a Provider_Terminal_State, SHALL leave the most recent cached Chain_Evidence_Record unchanged, and SHALL return `chain_verification_unresolved` when any ceiling is reached.

**Verifiable Completion Conditions**

- `Verify request-count, page-count, and wall-clock ceilings are each enforced, the run stops at chain_verification_unresolved with the reached ceiling name and consumed counts recorded, and that state opens no gate and is never projected as confirmed or terminal` (criteria 1-3)
- `Verify a 429 fixture with a parsable retry-after stops the run and the next run waits at least the reported seconds, and a 429 fixture with an absent or unparsable header waits at least the source-owned default cool-down` (criteria 4, 8)
- `Verify 400, 401, 403, and 404 fixtures return typed classified failures with no in-run retry while 500, 502, and 503 fixtures retry within budget using delays inside the source-owned minimum, maximum, and jitter range` (criteria 5, 6)
- `Verify an over-budget page-token chain, a repeated page token, and an expired page token all stop at a typed state across 100 generated pagination sequences` (criterion 7)
- `Verify connection-failure, name-resolution-failure, and per-request-timeout fixtures each consume one request from the ceiling, return a typed transport failure, leave cached evidence unchanged, and stop at chain_verification_unresolved at the ceiling` (criterion 9)

---

### Requirement 6: Offline cached chain evidence with height-keyed invalidation

**User Story:** As a Buyer_SG, I want the last observed chain evidence readable while offline, so that I can inspect
my funding proof without a network path.

**Journey stage:** JV-Return

**Lens fit:** min-viable-max-value (one cache entry per watched tuple), TCO-zero (existing browser-local storage),
token economics (zero model calls), harness-first (explicit invalidation key, no silent staleness).

#### Acceptance Criteria

1. THE Evidence_Cache SHALL store each Chain_Evidence_Record as one entry per tuple of chain id, token contract address, watched address, and observation block height, SHALL scope every entry to the origin and browser profile of the existing AgenticGraph browser-local storage owner so that entries under a different origin or browser profile are unreadable, and SHALL create a distinct entry rather than replace an existing one when the watched address differs, because deposit-address rotation behaviour is unconfirmed (OQ-34).
2. WHEN a later observation reports a strictly greater observation block height for the same chain id, token contract address, and watched address, THE Evidence_Cache SHALL replace the prior entry for that tuple, SHALL discard a later observation whose observation block height equals the stored height while any other observed field conflicts, leaving the stored entry unchanged, and SHALL retain a `chain_confirmed` state as required by R3.
3. WHILE no network path to the Payment_Trust_Boundary exists, THE Payment_Client SHALL read chain evidence from the Evidence_Cache entries scoped to the current origin and browser profile, SHALL label the read evidence with its observation block height and observation time, and SHALL send zero external requests.
4. THE Record_Serializer SHALL write the chain evidence reference into the existing payment record projection as chain id, token contract address, transaction hash, transfer block number, observation block height, and Evidence_State, and SHALL write no watched address, no provider customer identifier, and no read key.
5. THE Record_Parser SHALL read a written chain evidence reference back into a Chain_Evidence_Record, and re-serializing that record SHALL produce a byte-identical document under the payment record document, parser, and printer round-trip contract owned by agenticgraph-payments R7, which this requirement cites and does not redefine.
6. IF a cached entry carries no observation block height, no observation time, or an incomplete key missing chain id, token contract address, or watched address, THEN THE Payment_Client SHALL treat that entry as absent and SHALL report Evidence_State `chain_unobserved`.
7. IF a cached entry cannot be parsed into a Chain_Evidence_Record, THEN THE Evidence_Cache SHALL evict that entry, SHALL report it to the Payment_Client as absent with Evidence_State `chain_unobserved`, SHALL leave every other entry unchanged, and SHALL send zero external requests.
8. IF a write to the Evidence_Cache fails because the browser-local storage quota is exhausted, THEN THE Evidence_Cache SHALL return a typed storage-unavailability failure naming the affected tuple, SHALL preserve every prior entry unchanged, SHALL preserve the boundary-returned Evidence_State for the current run, and SHALL send zero external requests.
9. WHEN a write would exceed the maximum Evidence_Cache entry count read from the repository-owned funding verification source, THE Evidence_Cache SHALL keep at most one entry per tuple of chain id, token contract address, watched address, and observation block height, and SHALL evict entries whose Evidence_State is not `chain_confirmed` before evicting any `chain_confirmed` entry.

**Verifiable Completion Conditions**

- `Verify entries are keyed by chain id, token contract, watched address, and observation block height, are unreadable from a different origin or browser profile, and that a differing watched address creates a distinct entry rather than a replacement` (criterion 1)
- `Verify a strictly greater observation height replaces the prior entry, an equal-height conflicting observation is discarded with the stored entry unchanged, and a confirmed state persists across both cases` (criterion 2)
- `Verify offline reads render cached evidence with its observation height and time and record zero external requests` (criterion 3)
- `Verify the record projection contains the six permitted chain fields and no watched address, provider customer identifier, or read key, and that parse-then-serialize is byte-identical for 100 generated valid documents containing chain evidence references under the agenticgraph-payments R7 round-trip contract` (criteria 4, 5)
- `Verify an entry missing an observation height, an observation time, or any key component reports chain_unobserved, and an unparseable entry is evicted, reported absent as chain_unobserved, leaves other entries intact, and records zero external requests` (criteria 6, 7)
- `Verify a simulated quota-exhausted write returns a typed storage-unavailability failure naming the tuple, preserves prior entries and the boundary-returned Evidence_State, and records zero external requests` (criterion 8)
- `Verify writes beyond the source-configured maximum entry count keep one entry per tuple and evict every non-confirmed entry before any confirmed entry` (criterion 9)

---

### Requirement 7: Funding-state projection for downstream lifecycle gates

**User Story:** As a Buying_Agent, I want one read-only funding-state projection, so that Discovery, Issuance, and
Execution proceed on verified funding without gaining spend authority.

**Journey stage:** JV-Reconcile, JV-Return

**Lens fit:** min-viable-max-value (one projection serves three gates), TCO-zero (computed once at the owning
boundary), token economics (zero model calls), harness-first (typed read-only projection, no write path).

#### Acceptance Criteria

1. THE Funding_Verification_Projection SHALL be computed once at the Payment_Trust_Boundary and SHALL contain exactly the lifecycle identifier, Evidence_State, provider credit state, observation block height, evidence observation time, evidence freshness label, and agreement result, each as a typed read-only field whose value is drawn only from the supplied evidence, provider credit state, and source-owned policy inputs.
2. THE Funding_Verification_Projection SHALL expose no write path, no adapter request entry point, no card reference, and no spend capability.
3. WHILE the projection does not report Evidence_State `chain_confirmed` with a reported agreement and an evidence freshness label of `fresh`, THE Discovery, Issuance, and Execution gates owned by agenticgraph-payments R15, R16, and R17 SHALL remain closed.
4. WHEN identical chain evidence, an identical provider credit state, an identical Confirmation_Policy, and an identical source-owned maximum evidence age are supplied, THE Funding_Verification_Projection SHALL be byte-identical on every recomputation and SHALL read no wall-clock time, random value, or ambient state outside those supplied inputs.
5. THE Funding_Verification_Projection SHALL grant no approval, and spend authorization SHALL remain with the existing Approval_Gate owned by agenticgraph-payments R16.
6. THE Funding_Verification_Projection SHALL fit a 375 by 812 CSS-pixel viewport inside the existing Paywall Funding phase without horizontal overflow and without a second surface, and each rendered projection row SHALL carry an accessible name on the semantic element that owns it and SHALL NOT hide selectable visual structure as aria-hidden decoration.
7. WHEN the projection is computed, THE Funding_Verification_Projection SHALL set the evidence freshness label to `fresh` while the latest indexed block height minus the observation block height is at or below the source-owned maximum evidence age read from the repository-owned funding verification source, to `stale` while that difference exceeds that maximum, and to `expired` once the Funding phase for that lifecycle identifier has closed, and SHALL report a `stale` or `expired` label together with the recorded observation block height and evidence observation time instead of presenting the earlier observation as current.
8. IF the supplied evidence carries no observation block height, or the source-owned maximum evidence age is absent or not a positive block count, THEN THE Funding_Verification_Projection SHALL report Evidence_State `chain_unobserved`, SHALL keep the Discovery, Issuance, and Execution gates closed, SHALL surface an indication that funding evidence is unavailable, and SHALL retain every recorded evidence entry unchanged.
9. THE Funding_Verification_Projection SHALL be readable by an external agent as a typed document that Record_Serializer writes and Record_Parser reads back into an identical projection, and SHALL consume zero model calls on that read path.

**Verifiable Completion Conditions**

- `Verify the projection type exposes read-only fields and a focused check finds no reachable write, adapter-request, card, or spend symbol` (criteria 1, 2, 5)
- `Verify every non-confirmed, non-agreeing, stale, or expired projection keeps the Discovery, Issuance, and Execution gates closed` (criteria 3, 7)
- `Verify identical inputs produce a byte-identical projection across 100 generated evidence and credit combinations, with no wall-clock or random input on the projection path` (criterion 4)
- `Verify every Evidence_State renders at 375 pixels inside the existing Paywall with no second surface, and every rendered row exposes an accessible name with no aria-hidden selectable structure` (criterion 6)
- `Verify observation ages at, one block past, and far past the source-owned maximum evidence age label the projection fresh, stale, and stale, and a read after the Funding phase closes labels it expired` (criterion 7)
- `Verify a missing observation block height and an absent or non-positive maximum evidence age each yield chain_unobserved, closed gates, and no discarded evidence entry` (criterion 8)
- `Verify a serialized projection parses back into an identical projection with zero model calls recorded on that path` (criterion 9)

---

### Requirement 8: Verification readiness reporting

**User Story:** As a Solo_Operator, I want adapter admission reported separately from completed proof, so that
configuration is never mistaken for verified funding.

**Journey stage:** JO-Discover, JO-Complete, JO-Return

**Lens fit:** min-viable-max-value (one gate extension, no new command), TCO-zero (read-only check), token economics
(zero model calls), harness-first (two named statuses with distinct evidence).

#### Acceptance Criteria

1. THE Readiness_Gate SHALL report Adapter_Admission_Status and Proof_Complete_Verification_Status as two separately named results, SHALL derive neither status from the other, and SHALL never relabel an Adapter_Admission_Status result as verified funding.
2. THE Readiness_Gate SHALL set Adapter_Admission_Status true only when the adapter identifier, chain id, Expected_Token_Contract, XSGD decimals, Confirmation_Policy depth, and both Attempt_Budget ceilings are present and parseable in the repository-owned funding verification source, and SHALL otherwise set it false.
3. THE Readiness_Gate SHALL set Proof_Complete_Verification_Status true only when a `chain_confirmed` Chain_Evidence_Record exists, the Reconciler reports agreement, the record projection round-trips byte-identically, and that evidence is bound to the same current source-evidence digest the gate inspected. An editable manifest claim or caller-authored JSON SHALL NOT set this status true.
4. IF a required Data API key is bound by name or value in visible Worker variables, client bundle output, local storage, or a URL, THEN THE Readiness_Gate SHALL report a failure and SHALL leave configuration unchanged. Static operator documentation MAY name a required credential but SHALL contain no credential value.
5. THE Readiness_Gate SHALL perform read-only checks, SHALL write no configuration, SHALL send zero external adapter requests, and SHALL report each missing or unparseable input by name.
6. THE Readiness_Gate SHALL report the upstream blocked funding gates owned by agenticgraph-payments R14 with their existing blocked status.
7. IF the source-evidence digest bound to an existing confirmed record differs from the current source-evidence digest, THEN THE Readiness_Gate SHALL report Proof_Complete_Verification_Status as a named stale result distinct from both true and false, SHALL name each changed source input, and SHALL report proof complete for no lifecycle identifier.
8. WHEN a run reports Adapter_Admission_Status false, a stale proof-complete result, a key-binding failure, or any missing required input for the enabled adapter, THE Readiness_Gate SHALL exit non-zero, and otherwise SHALL exit zero.
9. THE Readiness_Gate SHALL report Evidence_State, observation block height, and attempt count for the most recent Chain_Evidence_Record, and SHALL report no Watched_Address, no provider customer identifier, and no Data API key value.

**Verifiable Completion Conditions**

- `Verify complete configuration sets Adapter_Admission_Status true while Proof_Complete_Verification_Status stays false until a confirmed, agreeing, round-tripped record bound to the current source-evidence digest exists, and neither status is derived from the other` (criteria 1-3)
- `Verify a planted key name or value in visible vars, bundle output, local storage, or a URL fails the gate and changes no configuration, while documentation naming a credential without a value passes` (criterion 4)
- `Verify the gate performs zero writes and zero external requests, names every missing or unparseable input, and reports upstream blocked funding gates as blocked` (criteria 5, 6)
- `Verify a changed source digest against a prior confirmed record yields the named stale result rather than true or false, and that an editable manifest claim or caller-authored JSON cannot set proof complete` (criteria 3, 7)
- `Verify the gate exits non-zero for false admission, stale proof, planted key binding, and each missing required input, and exits zero only on a fully passing run` (criterion 8)
- `Verify the reported output carries Evidence_State, observation block height, and attempt count, and watched-address, provider-customer, and read-key canaries never appear in it` (criterion 9)

---

### Requirement 9: Cost observation, data minimization, and zero model calls

**User Story:** As a Solo_Operator, I want every chain read observed and minimized, so that verification carries cost
evidence and leaks no address, key, or model prompt.

**Journey stage:** JO-Complete, JV-Observe

**Lens fit:** min-viable-max-value (one cost entry per call), TCO-zero (existing Worker and D1 binding), token
economics (zero model calls on the path), harness-first (cost write precedes continuation).

#### Acceptance Criteria

1. WHEN the verification path dispatches a Chain_Evidence_Adapter request, THE Cost_Observer SHALL write exactly one cost entry before that request leaves the Payment_Trust_Boundary, containing the adapter identifier, the operation name, the attempt index, the chain id, and the lifecycle identifier, and SHALL write no second entry for the same request.
2. IF the pre-dispatch cost entry write fails, THEN THE verification path SHALL send no adapter request for that attempt, SHALL stop the run before any further adapter request, SHALL return a typed failure result identifying the cost write failure, and SHALL leave every previously recorded Chain_Evidence_Record unchanged.
3. THE verification path SHALL make zero model calls, and no Chain_Evidence_Record field SHALL enter a model prompt.
4. THE verification path SHALL keep the Data API key, watched address, provider customer identifier, and KYC fields out of every log, screenshot, client snapshot, record projection, cost entry, and returned failure result, including any adapter-supplied error message, error body field, or stack trace surfaced from a failed request.
5. THE verification path SHALL send to the Data API only the chain id, watched address, token contract filter, and block range required by the requested operation.
6. THE verification path SHALL make no change to the production mirror and no Cloudflare deployment without a separate explicit release instruction.
7. WHEN a Chain_Evidence_Adapter request returns a response or a transport failure, THE Cost_Observer SHALL complete that request's existing cost entry with the response status class, the elapsed duration in milliseconds measured from dispatch, and the response payload size in bytes, and SHALL create no additional entry for that request.
8. IF a cost entry carries no response status class when a later verification run for the same lifecycle identifier begins, THEN THE verification path SHALL complete that entry with a status class indicating an unobserved outcome, SHALL count that entry against the Attempt_Budget, and SHALL derive no confirmation claim from it.
9. THE Cost_Observer SHALL bound stored cost entries by a maximum entry count per lifecycle identifier and a maximum retention age, both read from the repository-owned funding verification source, and SHALL discard entries beyond that bound oldest-first without altering any Chain_Evidence_Record.

**Verifiable Completion Conditions**

- `Verify one cost entry exists per adapter request across 100 generated runs and a failed cost write stops the run before the next request` (criteria 1, 2)
- `Verify a recorded run contains zero model calls and no evidence field appears in any model prompt` (criterion 3)
- `Verify read-key, watched-address, provider-customer, and KYC canaries never reach a log, screenshot, client snapshot, record projection, cost entry, or adapter-supplied error message or stack trace` (criterion 4)
- `Verify each outbound request carries only the permitted parameters and the change set touches no production mirror path or Cloudflare deployment target` (criteria 5, 6)
- `Verify the cost entry is written before dispatch and completed with status class, elapsed milliseconds, and response byte size, and that an interrupted in-flight request is reconciled to an unobserved status class counted against the Attempt_Budget with no confirmation claim` (criteria 7, 8)
- `Verify stored cost entries stay within the source-owned count and age bounds across 100 generated run sequences and that discarded entries leave every Chain_Evidence_Record unchanged` (criterion 9)

---

## Correctness Properties

Each is deterministic, runs against recorded adapter fixtures, and makes zero model calls.

| Property | Class | Statement | Anchors |
|---|---|---|---|
| P1 Replay-safe verification | Idempotence | Verifying twice on identical chain and provider state yields the same record and creates no extra record, request, or reservation. | R1, R7 |
| P2 Deterministic projection | Model-based | Identical evidence, credit state, and Confirmation_Policy always produce an identical projection. | R7 |
| P3 Monotonic confirmation | Invariant | For any observation sequence, once a record is `chain_confirmed` no later observation weakens it. | R3 |
| P4 Receipt round-trip | Round trip | For every valid record document with a chain evidence reference, parse then serialize is byte-identical. | R6 |
| P5 Bounded attempts | Error conditions | For every adapter failure sequence, the run consumes at most the Attempt_Budget and ends in `chain_verification_unresolved` or a typed failure. | R5 |
| P6 Zero egress when unavailable | Invariant | While the adapter is unconfigured or offline, the request count to any external host is zero. | R1, R6 |
| P7 Half-open range exactness | Metamorphic | Splitting a block range at any interior height counts each matching transfer exactly once. | R2 |
| P8 Token identity independence | Invariant | For any entry whose contract address differs from the Expected_Token_Contract, no name, symbol, price, or reputation value produces a match. | R2 |
| P9 Confluence of evidence order | Confluence | Applying a chain observation and a provider credit read in either order yields the same agreement result. | R4 |
| P10 No spend authority | Invariant | For every projection instance, no reachable operation authorizes spend, issues a card, or writes to a provider. | R7 |

---

## Scope Boundaries

### In scope

R1 through R9, enumerated as the MoSCoW Must and Should rows and attributed to this file in the Authority and Scope
table. No item is in scope for this increment unless it appears in both.

### Out of scope

- Any signing, broadcast, approval, transfer, or other chain write path.
- Operating an Avalanche node, an archive RPC, or a custom indexer.
- Chains other than C-Chain `43114` and tokens other than XSGD.
- Rail selection, credential custody, the Paywall surface, card issuance mechanics, and merchant checkout, owned by
  agenticgraph-payments R1, R2, R13, R16, and R17.
- Movement of Avalanche-credited XSGD into a card settlement balance (upstream OQ-18).
- Native AVAX gas accounting, staking data, Primary Network chains, and non-EVM chains.
- Price or valuation display from adapter `price` fields.
- A second Worker, proxy tier, payment store, or chain cache service.
- Production mirror publication and Cloudflare deployment.

---

## Dependencies

| Dependency | Class | Justification |
|---|---|---|
| Existing `agenticgraph-payment` Worker and its D1 binding | Zero-TCO (existing free-tier binding) | Already the Payment_Trust_Boundary; reuse avoids a new tier and keeps secret custody in one place. |
| Existing shared payment SSOT modules (`straitsxPaymentSsot`, `agenticPurchaseReadinessContract`, `agenticPurchaseRuntimeContract`, `paymentRecordDocument`) | FOSS / repository-owned | Provider contract, readiness, lifecycle, and record-document authority already exists; forking would split ownership. |
| Existing browser-local AgenticGraph storage owner | FOSS / platform | Zero egress while offline; no new service and no second store. |
| Avalanche Data API | Proprietary hosted read service, justified inline | Supplies indexed EVM balances, transfers, and blocks without operating a node, and backs the Avalanche Explorer and Core wallet ([Data API](https://build.avax.network/docs/api-reference/data-api)). It sits behind the adapter boundary, so a replacement needs no boundary change. |
| StraitsX API (deposit address, blockchain callbacks, account balance) | Proprietary, justified inline | Regulated XSGD issuance and the authoritative deposit address have no FOSS substitute ([StraitsX API guides](https://docs.straitsx.com/docs/introduction)). |
| Avalanche C-Chain public RPC or AvalancheGo | FOSS alternative, deferred | A self-hosted read path removes the hosted dependency but adds infrastructure and TCO; retained as the documented fallback behind the same boundary ([AvalancheGo](https://github.com/ava-labs/avalanchego)). |

---

## Open Questions

Ids continue the shared `OQ-N` space owned by `.kiro/specs/agenticgraph-payments/requirements.md` and its companion
PRD/TAD; `OQ-1` through `OQ-25` belong there and are never reused. This file owns `OQ-26` through `OQ-34`.

- **OQ-26 - Data API authentication requirement.** The referenced pages document an `x-glacier-api-key` header and state that keys raise rate-limit access, but do not state whether unauthenticated reads are permitted for the balance, transfer, and block operations used here. Until confirmed, a configured key is required and its absence returns `chain_verification_disabled` ([Getting Started](https://build.avax.network/docs/api-reference/data-api/getting-started)).
- **OQ-27 - Reorganization and finality semantics.** The referenced pages publish no reorganization handling or finality guarantee for indexed C-Chain data, so the minimum confirmation depth stays a source-owned policy value with a fail-closed absence rule (R3).
- **OQ-28 - Indexing latency.** No published bound exists between block production and index availability. Until one exists, `chain_unobserved` never implies absence on chain, and the Attempt_Budget is the only stop condition.
- **OQ-29 - Plan rate limits and free-tier quotas.** The Usage Guide documents `429` responses and rate-limit headers but locates numeric policy in plan configuration. Required before the verification cost line in Success Metrics closes ([Usage Guide](https://build.avax.network/docs/api-reference/data-api/usage)).
- **OQ-30 - XSGD contract address on C-Chain.** The referenced provider documentation names Avalanche as a supported XSGD network with the `XSGD_AVAX` identifier but publishes no C-Chain contract address, so the address stays a required source-owned value with a fail-closed absence rule ([Blockchain Callbacks](https://docs.straitsx.com/docs/blockchain-callbacks)).
- **OQ-31 - Host and version pinning.** The referenced pages show requests against both `data-api.avax.network` and `glacier-api.avax.network` under a `/v1` path. Confirm which host and version the adapter pins and whether the two are equivalent ([Usage Guide](https://build.avax.network/docs/api-reference/data-api/usage)).
- **OQ-32 - Sandbox chain evidence.** The StraitsX deposit-address operation is documented as production-only, so a sandbox funding run may have no matching mainnet chain evidence. Confirm whether testnet chain plus mock provider evidence is an acceptable proof path or whether proof requires separate financial authority ([Create a deposit address](https://docs.straitsx.com/reference/create-deposit-address)).
- **OQ-33 - Relationship to upstream OQ-18.** The XSGD-to-card settlement bridge remains unresolved upstream. Confirm whether settlement movement also requires an on-chain evidence reference, which would extend this boundary rather than duplicate it.
- **OQ-34 - Deposit-address rotation.** The referenced documentation does not state whether a deposit address is stable per account and token. Confirm rotation behavior before treating the watched address as a durable cache key component.

---

## Assumptions

1. The existing `agenticgraph-payment` Worker remains the only server-side payment trust boundary; this increment adds a read path inside it rather than a new tier.
2. agenticgraph-payments R13 through R17 remain the owners of the Paywall, funding tuple validation, discovery, issuance, and execution; this increment supplies evidence and a projection they consume.
3. Chain amounts are compared as integer base units, and no floating-point arithmetic participates in an amount comparison.
4. The Avalanche Data API is one adapter behind the boundary, not the definition of chain truth; a self-hosted read path can replace it without changing the boundary types.
5. Any metered Data API plan cost is variable observability cost and is excluded from the monthly TCO figures in Success Metrics.
6. This increment carries development authority only, and no verification result authorizes mirror publication, Cloudflare deployment, or live-mode payment.

---

## Source References

- Data API overview, features, supported chains, EVM and Operations scope: <https://build.avax.network/docs/api-reference/data-api>
- Data API getting started, API key creation, `x-glacier-api-key` header, block read example: <https://build.avax.network/docs/api-reference/data-api/getting-started>
- Data API usage guide, rate-limit headers, error types, pagination and token validity: <https://build.avax.network/docs/api-reference/data-api/usage>
- Data API list ERC-20 balances, contract filter, historical block parameter, spam filter and reputation fields: <https://build.avax.network/docs/api-reference/data-api/evm-balances/listErc20Balances>
- Data API list ERC-20 transfers, inclusive start block and exclusive end block: <https://build.avax.network/docs/api-reference/data-api/evm-transactions/listErc20Transactions>
- Data API supported EVM chains listing: <https://build.avax.network/docs/api-reference/data-api/evm-chains/supportedChains>
- StraitsX API guides and integration models: <https://docs.straitsx.com/docs/introduction>
- StraitsX create a deposit address, production-only note, authentication and signing headers: <https://docs.straitsx.com/reference/create-deposit-address>
- StraitsX blockchain callbacks, deposit statuses, `XSGD_AVAX` identifier, blocked reasons: <https://docs.straitsx.com/docs/blockchain-callbacks>
- StraitsX HTTP request signing: <https://docs.straitsx.com/docs/http-request-signing>
- XSGD stablecoin: <https://www.straitsx.com/xsgd>
- AvalancheGo FOSS reference: <https://github.com/ava-labs/avalanchego>

Content from the sources above was paraphrased and summarized for compliance with licensing restrictions.
