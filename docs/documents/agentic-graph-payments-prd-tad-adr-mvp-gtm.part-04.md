---
title: "Reference implementation: agentic-graph-payments-prd-tad-adr-mvp-gtm section 4"
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
source_section_lines: "1334-1558"
---

[Combined planning owner](agentic-graph-payments-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-PAYMENTS-PRD-TAD-ADR-MVP-GTM@1.3.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### Orchestration/Harness Flows

**No AI model call is in any financial path.** Rail selection, intent creation, provider event
ingestion, funding validation/credit, card issuance, card authorization, reconciliation,
disposal, and record serialization are deterministic and make zero model calls. Only H2
commerce discovery may call a model under its fixed bounds. The read-only OS Status Surface
for payments (rail readiness views and the cost ledger view) costs 0.00 USD in token spend
with zero model calls per view, aggregates at read time over state that already exists in the
payment store, adds no persistent OS-level datastore, and exposes no payment write path. A
non-zero model cost on any financial or read-only view is a defect, not a budget overrun.

#### H0: Payment OS Status Surface read view

**Trigger**: Operator or agent requests a payment readiness or cost view.
**Topology pattern**: Sequential. **Max iterations**: 1. **Circuit-breaker**: any view attempting a model call or a state write aborts the response and reports a defect.
**Token budget**: 0 prompt + 0 completion at any cache hit rate = 0.00 USD per call.

| Role | Component | Input schema | Output schema | Cost log emitted | Fallback |
|---|---|---|---|---|---|
| Dispatcher | Payment_API read route | `{view: "rail_readiness" \| "cost_summary"}` | Routed read request | - | Reject an unknown view with a typed error |
| Executor | Readiness snapshot reader and cost ledger reader, no model | Typed read request | `{entries[], unavailableSources[]}` | Yes, with `modelCostUsd: 0.00` | Move the unreachable source into `unavailableSources[]`; the response still succeeds |
| Observer | Cost_Observer | Cost log stream | Ledger rows and totals | - | Silent fail with a logged gap; the view still returns |
| Consumer | MainPanel Commerce Payments subsection, Agent_Discovery_Surface | `{entries[], unavailableSources[]}` | Rendered rows or JSON | - | Upstream typed error propagated |

**Postconditions**: zero payment state mutation, zero model calls, `modelCostUsd` equal to 0.00, and every unreachable source named rather than silently dropped.

#### H1: Optional payment-adjacent explanation harness, disabled in this increment

R11 criterion 3 allows an optional payment-adjacent model explanation behind a harness. R12 criterion 4 forbids sending any payment record field into a model prompt. Together those constraints leave the harness with no record-derived input, so H1 ships disabled and is specified only so that no ad-hoc model call can appear later without a contract. The tension is recorded as OQ-13.

**Trigger**: Operator explicitly enables the harness and requests a generic explanation of a state label. Never invoked from a selection, creation, ingestion, reconciliation, settlement, or serialization path.
**Topology pattern**: Sequential. **Max iterations**: 1. **Circuit-breaker**: an invalid output schema after one retry, or invocation from any payment path, aborts and returns the deterministic record unchanged.
**Token budget**: not measured. A ceiling must be stated before enablement and the harness stays disabled until then.

| Role | Component | Input schema | Output schema | Cost log emitted | Fallback |
|---|---|---|---|---|---|
| Dispatcher | Payment_API explanation route, disabled by default | `{stateLabel: enum, railLabel: enum}` drawn from the static catalog, with no intent identifier, amount, currency, provider identifier, card, bank, email, or provider customer field | Validated explanation request | - | Reject malformed or record-bearing input before any token spend |
| Executor | Explanation harness plus model | Typed prompt built only from the two catalog labels | `{explanation: string}` validated against schema | Yes, `{model, prompt_tokens, completion_tokens, cache_hits, estimated_cost_usd}` | Return the deterministic record unchanged |
| Observer | Cost_Observer | Cost log stream | Ledger rows and alerts | - | Silent fail with a logged gap |
| Consumer | Receipt_Projection view | `{explanation}` | Rendered annotation, never a stored payment field | - | Upstream error propagated; record unchanged |

**Postconditions**: no payment record field entered a model prompt, the deterministic record is unchanged, and one cost log entry exists per call while the harness is enabled.

#### H2: Bounded non-financial commerce semantic matching

**Trigger**: deterministic structured-data and DOM extraction produced candidate text facts
but cannot decide which candidate satisfies the buyer's semantic item attributes.
**Topology pattern**: Agentic loop.
**Max iterations**: 2 model calls, within the enclosing maximum of five product pages and
twelve browser actions.
**Circuit-breaker**: cancellation is signalled; any input contains lifecycle id, approval,
account, address, transaction, funding, card, authorization, order, amount, price, shipping,
tax, total, currency, or payment record data; deterministic page filtering detects a
tool/policy instruction; output schema fails twice; model budget is exhausted; or the
instruction expires. Cancellation stops before the next browser action or model call.
**Token budget**: at most 6,000 prompt plus 1,000 completion tokens per call; at most 12,000
prompt plus 2,000 completion tokens per lifecycle; target cache hit rate at least 50 percent.
The configured model price converts logged token counts to estimated cost before H2 is
enabled.

| Role | Component | Input schema | Output schema | Cost log emitted | Fallback |
|---|---|---|---|---|---|
| Dispatcher | Commerce_Discovery_Harness | `{semanticQuery, requiredAttributes[], candidates: [{candidateId, title, variantText, descriptionFacts[]}], cancellationSignal}` with every financial/lifecycle/provider field structurally absent | Validated non-financial semantic match request | Input rejection costs zero | Deterministic candidate set or typed `semantic_match_unavailable` |
| Executor | Model adapter inside Commerce_Discovery_Harness | Non-financial semantic match request only | `{matches: [{candidateId, matchedAttributes[], missingAttributes[], confidenceBasis}]}` | `{model, prompt_tokens, completion_tokens, cache_hits, estimated_cost_usd}` per call | At most one retry, then no-match |
| Observer | Cost_Observer | Model cost log plus browser page/action counters | Persisted cost/counter entry | — | Log failure aborts H2 before candidate selection |
| Consumer | Deterministic Candidate_Validator inside Commerce_Discovery_Harness | Model semantic output joined locally with separately held origin, URL, quantity, price, shipping, tax, total, currency, and freshness facts | R15 candidate schema or typed rejection | Zero additional model cost | No candidate; zero card/authorization or other new spend-bearing calls; terminal cleanup may release the existing funding reservation |

**Happy path**:
1. Deterministic filtering admits only instruction-free page facts; any injection signal has
   already aborted the discovery run. Dispatcher validates that the prompt schema cannot
   carry any payment, lifecycle, or provider field.
2. Executor returns schema-valid semantic matches and one cost entry.
3. Deterministic consumer joins the matches with separately held commercial facts, applies
   origin, budget, currency, and freshness rules without a model, and returns candidates.

**Alternate paths**:
- Structured data already resolves the item: H2 is skipped and model cost is `0.00`.
- First output invalid: one bounded retry with the same sanitized input.

**Error paths**:
- Any injection signal, prohibited field, or page instruction reaches filtering/dispatcher:
  abort the whole discovery run before token spend or another browser action.
- Cancellation before or during H2: stop before the next browser action/model call, return a
  typed cancellation, and create no card or authorization.
- Model unavailable, budget exceeded, or second output invalid: return typed no-match and
  create no card.

**Postconditions**: at most one schema-valid non-financial semantic result is joined by
deterministic code to commercial facts; every model call has one cost log; payment records
and financial fields never enter a model prompt.

### Workflow and Harness Diagrams

**W1 plus W2: intent creation through settlement** (multi-actor, `sequenceDiagram`).

```mermaid
sequenceDiagram
  autonumber
  actor Buyer
  participant PS as Payment_Surface
  participant IQ as Intent_Queue
  participant API as Payment_API
  participant RR as Rail_Router
  participant AD as Rail Adapter
  participant PROV as Provider
  participant PEI as Provider_Event_Ingress
  participant D1 as Payment_Record_Store
  participant RP as Receipt_Projection

  Buyer->>PS: Confirm payment
  PS->>PS: Generate Client_Intent_Key (UUID, once per attempt)
  alt Payment_API unreachable
    PS->>IQ: Persist queued intent (queued_offline)
    Note over PS,IQ: Zero egress while offline
    IQ->>API: Drain on reconnect, same Client_Intent_Key
  else Payment_API reachable
    PS->>API: POST intent
  end
  API->>RR: Select rail
  RR->>D1: Write rail + selection reason (before any provider call)
  RR->>AD: Create provider object
  AD->>PROV: POST create (stable provider key)
  PROV-->>AD: Provider object + request identifier
  AD->>D1: Persist provider object id, request id, cost log
  API-->>PS: Rail-neutral typed result, state pending_provider
  Buyer->>PROV: Complete payment at provider surface
  PROV--)PEI: Webhook or callback
  PEI->>PEI: Authenticate, claim event identity
  PEI->>PROV: Read authoritative provider state
  PROV-->>PEI: Paid state, minor-unit amount, currency
  PEI->>D1: Settle once when intent id, amount, currency all match
  D1-->>RP: Terminal record
  RP-->>Buyer: Receipt entry, readable offline
```

**H0 and H1: harness control paths** (`flowchart LR`, loop sections bounded by subgraphs).

```mermaid
flowchart LR
  subgraph H0["H0 - OS Status read view · sequential · max 1 iteration"]
    H0D["Dispatcher<br/>Payment_API read route"] --> H0E["Executor<br/>readiness + ledger readers<br/>no model"]
    H0E --> H0C["Consumer<br/>Commerce subsection / Agent_Discovery_Surface"]
    H0E -. "cost log, modelCostUsd 0.00" .-> H0O["Observer<br/>Cost_Observer"]
    H0E -. "unreachable source" .-> H0F["Fallback<br/>unavailableSources[]"]
  end

  subgraph H1["H1 - explanation harness · sequential · max 1 retry · DISABLED"]
    H1D["Dispatcher<br/>catalog-label validator"] --> H1E["Executor<br/>harness + model"]
    H1E --> H1C["Consumer<br/>Receipt_Projection annotation"]
    H1E -. "cost log" .-> H1O["Observer<br/>Cost_Observer"]
    H1E -. "schema fail after retry" .-> H1F["Fallback<br/>deterministic record unchanged"]
  end
```

Circuit-breaker conditions restated for the diagram: H0 aborts and reports a defect if any
view attempts a model call or a state write. H1 aborts to the deterministic record if the
output schema fails after one retry, or if it is invoked from any selection, creation,
ingestion, reconciliation, settlement, or serialization path.

**W8-W12 plus H2: XSGD-funded agentic purchase lifecycle** (multi-actor
`sequenceDiagram`; financial calls remain outside H2).

```mermaid
sequenceDiagram
  autonumber
  actor Buyer
  participant Paywall as Existing Payment_Surface
  participant PLC as Purchase_Lifecycle_Coordinator
  participant Fund as Funding_Adapter
  participant Chain as Avalanche C-Chain
  participant Account as XSGD account API
  participant Discover as Commerce_Discovery_Harness
  participant Merchant as Allowed merchant
  participant Issuer as Card_Issuer_Adapter
  participant Cards as Card Program API
  participant Broker as Secure_Card_Broker
  participant Auth as Card_Authorization_Ingress

  Buyer->>Paywall: Typed instruction
  Paywall->>PLC: Create one frozen lifecycle
  Buyer->>Paywall: Approve exact funding
  PLC->>Fund: Funding command
  Fund->>Account: Resolve KYC, grant, network, deposit address
  Fund->>Chain: Broadcast approved XSGD transfer
  Chain-->>Fund: Accepted receipt
  Account--)Fund: Authenticated credit callback
  Fund->>Account: Read authoritative credited balance
  Account-->>Fund: Matching XSGD credit
  Fund-->>PLC: Funding complete
  PLC->>Discover: Sanitized non-financial semantic instruction
  Discover->>Merchant: Bounded DOM/structured-data reads
  Discover-->>PLC: Typed candidates with commercial facts joined deterministically
  PLC-->>Paywall: Candidate review
  Buyer->>Paywall: Select item and approve issuance/execution
  PLC->>Issuer: Idempotent issue/activate/control
  Issuer->>Cards: Create one instant virtual card
  Cards-->>Issuer: Opaque card reference
  Issuer-->>PLC: Card and secure-broker readiness
  PLC->>Broker: Execute unchanged candidate
  Broker->>Merchant: Model-blind card-field injection and submit
  Cards--)Auth: Remote authorization request
  Auth-->>Cards: Atomic approve/decline inside deadline
  Merchant-->>PLC: Order result
  Cards--)PLC: Authorization/clearing webhook
  PLC->>Cards: Reconcile and close card when safe
  PLC-->>Paywall: Terminal or explicit unresolved receipt
```

```mermaid
flowchart LR
  subgraph H2["H2 - non-financial semantic matching · max 2 model calls"]
    D2["Dispatcher<br/>instruction-free query + non-financial text facts"] --> E2["Executor<br/>schema-bound semantic matcher"]
    E2 --> V2["Deterministic Candidate_Validator<br/>joins prices and policy locally"]
    V2 --> C2["Consumer<br/>typed candidate or no-match"]
    E2 -. "one cost log per call" .-> O2["Observer<br/>Cost_Observer"]
    D2 -. "cancel / financial field / injection signal" .-> F2["Circuit-breaker<br/>zero token + zero new spend"]
    E2 -. "budget or schema failure" .-> F3["Fallback<br/>typed no-match"]
  end
```

H2 never receives prices, amounts, currency, payment/lifecycle/provider identifiers, or card
data. Deterministic code joins those separately after semantic matching. The lifecycle stops
on any phase mismatch; no branch reissues a card or resubmits checkout while outcome is
unknown.

