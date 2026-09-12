---
title: "Reference implementation: agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm section 2"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.3.1"
date: "2026-09-12"
lang: "en-US"
owner: "Solo Founder / AI Orchestrator"
continuity_id: "PLAN-AGENTIC-GRAPH-AGENTIC-COMMERCE-PLATFORM-PRD-TAD-ADR-MVP-GTM"
prd_revision: "0.3.1"
tad_revision: "0.3.1"
adr_revision: "0.3.1"
mvp_revision: "0.3.1"
gtm_revision: "0.3.1"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "447-876"
---

[Combined planning owner](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-AGENTIC-COMMERCE-PLATFORM-PRD-TAD-ADR-MVP-GTM@0.3.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### Orchestration/Harness Flows

**Pipeline**: Vendor Onboarding Pipeline *(new)*
**Topology pattern**: Sequential | **Max iterations**: 1 | **Circuit-breaker**: N/A (single deterministic transition per call)
**Token budget**: 0 prompt + 0 completion = **$0.00/call** — deterministic validation and a transition-table lookup, no model call

| Role | Component | Input schema | Output schema | Cost log | Fallback |
|---|---|---|---|---|---|
| Dispatcher | Vendor Registry | vendor record candidate | `registered` \| `reject` + violations | — | Reject with a typed violation list; no partial row written |
| Consumer | Vendor Lifecycle State | current state + requested transition | next state \| `rejected` + reason | — | Reject the transition; the stored state is unchanged |
| Consumer | Vendor Settlement Canvas | vendor row | operator canvas node | — | Upstream error propagation |

**Pipeline**: Split Projection Pipeline *(new)*
**Topology pattern**: Sequential, executed inside the bundle-commit transaction | **Max iterations**: 1 — a split projection is never retried in place, because a partial projection is never committed | **Circuit-breaker**: any violated invariant aborts the enclosing bundle commit
**Token budget**: 0 prompt + 0 completion = **$0.00/call** — integer arithmetic and predicate evaluation only

| Role | Component | Input schema | Output schema | Cost log | Fallback |
|---|---|---|---|---|---|
| Dispatcher | Vendor Ledger Split Projector | committed bundle identity + per-leg breakdown + settled total (minor) | complete split row set \| `abort` + invariant violated | — | Abort the enclosing bundle commit; no bundle reaches committed state without its complete split set |
| Consumer | Commission Rule Evaluator | gross (minor) + vendor + rule revision | commission (minor) + net (minor) + rule revision applied | — | Abort: an unevaluable rule is a projection failure, not a zero commission |
| Consumer | Session Log | split-committed event | ordered entry | — | Abort |

**Pipeline**: Payout Dispatch Pipeline *(new)*
**Topology pattern**: Sequential, alarm-driven, idempotent per `split_id` | **Max iterations**: bounded retry, reusing the existing pending-queue bounds (5 attempts, 30s maximum interval) | **Circuit-breaker**: two consecutive attempts with no change in the recorded dispatch result → terminal `failed`, recorded reason, no further automatic attempts
**Token budget**: 0 prompt + 0 completion = **$0.00/call**

| Role | Component | Input schema | Output schema | Cost log | Fallback |
|---|---|---|---|---|---|
| Dispatcher | Payout Dispatch Coordinator | finalized split + settlement-verified evidence + vendor lifecycle verdict | `dispatched` \| `settled` \| `failed` \| `blocked` + reason | dispatch attempt count and terminal reason recorded per `split_id` | Fail closed to `blocked`; never dispatch on absent verification or non-`active` vendor |
| Consumer | Net Settlement route *(reused)* | single net movement, minor units, sign-encoded | settlement record | — | Retry the same idempotency key; never issue a second movement |
| Consumer | Session Log | payout-dispatched / -settled / -failed | ordered entry | — | Upstream error propagation |

**Pipeline**: Shared-Canvas Sync Pipeline *(reused, unmodified)*
**Note**: Vendor Settlement Canvas is a new *consumer* of the existing operator-scoped CRDT projection pattern, exactly as Marketplace Registry Canvas was in Phase 1. Same reasoning, same key discipline, no new dependency.

### Component Specifications

**Component**: Vendor Registry *(new)*
**Responsibility**: Component owns one row per supplier this platform settles money to, and answers whether a given vendor may currently receive a payout.
**Interfaces**: deterministic accessor over a D1 table; violation-collecting validator on write, following the repository's existing `collectDefinitionViolations` shape (result objects, never thrown control flow); read surface consumed by Commission Rule Evaluator, Payout Dispatch Coordinator, and Vendor Settlement Canvas
**Dependencies**: Vendor Lifecycle State (sole authority for a state change), D1
**Configuration**: none hardcoded — settlement currency and amount bounds are read from existing worker vars, not redeclared here
**FOSS / Vendor**: FOSS — no external dependency; D1 is already provisioned
**Token Budget**: N/A (non-AI, deterministic)
**VCC Conditions**: see US-6 VCC, including its stated honest gap on what `active` does and does not mean
**Evidence References**: `node --test tests/unit/vendor-split-projector.test.mjs tests/props/cp-14-split-conservation.test.mjs tests/props/cp-15-leg-partition.test.mjs tests/props/cp-18-split-reprojection-idempotence.test.mjs` plus `cloudflare/workers/agentic-graph-travel-commerce/test/native-marketplace-runtime.test.ts` — exit 0; proves the pure invariants and same-transaction Bundle Graph Store wiring with persisted split and payout rows.
**Readiness rung**: Local: `dev-proven` / Delivered: `undocumented`

**Component**: Vendor Lifecycle State *(new)*
**Responsibility**: Component decides whether a requested vendor state transition is permitted, and is the only writer of vendor state.
**Interfaces**: pure function over `(currentState, requestedTransition)` returning the next state or a typed rejection; states are `pending_review`, `approved`, `active`, `suspended`; the transition table is a frozen constant, following the repository's existing hand-rolled state modules (`bundle-settlement-state`, `hold-lifecycle`) rather than a state-machine library — see ADR-5
**Dependencies**: none — it is a pure function and is testable standalone, which is why it is first in the build sequence
**Configuration**: N/A
**FOSS / Vendor**: FOSS — zero dependencies
**Token Budget**: N/A (non-AI)
**VCC Conditions**: see US-6 VCC
**Evidence References**: `node --test tests/unit/payout-dispatch-coordinator.test.mjs tests/props/cp-19-payout-dispatch-idempotence.test.mjs tests/props/cp-23-payout-ordering.test.mjs` plus `cloudflare/workers/agentic-graph-travel-commerce/test/native-marketplace-runtime.test.ts` — exit 0; proves exact-split precondition ordering, durable pre-I/O dispatch leasing, bounded retry/circuit breaking, signed net-settlement service-binding dispatch, and settled-state persistence.
**Readiness rung**: Local: `dev-proven` / Delivered: `undocumented`

**Component**: Commission Rule Evaluator *(new)*
**Responsibility**: Component turns a gross amount in minor units into a commission and a net payout, both in minor units, under a declared and versioned rule.
**Interfaces**: pure function over `(grossMinor, rule, currency)` returning `{ commissionMinor, netMinor, ruleRevision }` or a typed rejection; rule shapes are flat rate and tiered rate; rounding is deterministic and specified — largest-remainder allocation so a repeated evaluation of the same inputs reproduces the same integers exactly; hand-rolled predicate evaluation following the repository's existing `model-license-filter` shape, not a rules-engine library — see ADR-5
**Dependencies**: Vendor Registry (source of the vendor's rule reference)
**Configuration**: rule rows are data; the evaluator holds no rate constants
**FOSS / Vendor**: FOSS — zero dependencies
**Token Budget**: N/A (non-AI)
**VCC Conditions**: see US-8 VCC
**Evidence References**: `node --test tests/unit/vendor-settlement-canvas.test.mjs tests/props/cp-22-settlement-canvas-confluence.test.mjs` — exit 0, 3 tests passed including 300 property runs, surface `authoring`.
**Readiness rung**: Local: `dev-proven` / Delivered: `undocumented`

**Component**: Vendor Ledger Split Projector *(new)*
**Responsibility**: Component groups a committed bundle's existing per-leg breakdown by vendor and writes one split row per `(bundle commit, vendor)` inside the same transaction as the bundle commit.
**Interfaces**: reads the per-leg breakdown and settled total already produced upstream; calls Commission Rule Evaluator per vendor group; writes the split row set through the same committed transaction as `BundleGraphStore`; aborts the enclosing commit if any invariant is violated. Invariants, all property-testable: the sum of gross across splits equals the settled total exactly with zero residual; `gross = commission + net` per row; `0 ≤ commission ≤ gross`; every covered leg appears in exactly one split; re-projecting the same committed bundle yields an identical row set
**Dependencies**: Bundle Graph Store (call site extended, interface unchanged), Envelope Ledger (read), Commission Rule Evaluator, Session Log
**Configuration**: settlement currency inherited from the bundle; no per-bundle currency mixing in this increment
**FOSS / Vendor**: FOSS — zero dependencies; reuses provisioned SQLite Durable Objects
**Token Budget**: N/A (non-AI)
**VCC Conditions**: see US-7 and US-10 VCCs
**Evidence References**: none yet — `spec-complete`
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

**Component**: Payout Dispatch Coordinator *(new)*
**Responsibility**: Component moves a finalized split's net amount exactly once, after settlement is verified and the destination vendor is `active`.
**Interfaces**: Durable Object with an alarm-driven attempt loop, following the repository's existing envelope-ledger alarm pattern and service-binding dispatch pattern — **not** a Queues consumer, because no Queues binding exists in this repository (ADR-6); calls the existing in-repo net-settlement route with an idempotency key derived from `split_id`; reads Settlement Verifier evidence and the vendor lifecycle verdict as hard preconditions; records every attempt and every terminal state to the Session Log
**Dependencies**: Net Settlement route (reused, unmodified), Settlement Verifier (reused, unmodified), Vendor Registry, Session Log
**Configuration**: retry bounds and intervals reuse the existing pending-queue constants rather than introducing a second set
**FOSS / Vendor**: FOSS on this platform's side; the settlement rail itself is the already-adopted StraitsX/Avalanche path, and **no new external vendor is introduced by this component**. In particular, the source addendum's Stripe Connect Transfers illustration is *not* adopted: this repository already owns a settlement rail, and adding a second payout provider would introduce exactly the dependency surface ADR-4 declines
**Token Budget**: N/A (non-AI)
**VCC Conditions**: see US-9 VCC
**Evidence References**: none yet — `spec-complete`
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

**Component**: Vendor Settlement Canvas *(new)*
**Responsibility**: Component projects every vendor's lifecycle state, commission rule reference, and outstanding payout position as a live operator-scoped canvas node.
**Interfaces**: same operator-scoped CRDT subscription and `table_name:record_id` key discipline already established by Marketplace Registry Canvas; operator read scope only — not exposed to Shopper or Vendor clients in this increment
**Dependencies**: Vendor Registry, Payout Dispatch Coordinator (payout position), Operator Client
**Configuration**: operator-only read scope, enforced by the existing scope-key guard rather than by a new one
**FOSS / Vendor**: FOSS — **reference implementation: Yjs** (MIT), already adopted; a new node type, not a new dependency
**Token Budget**: N/A (non-AI, $0 by design)
**VCC Conditions**: see US-6 and US-10 VCCs (operator half)
**Evidence References**: none yet — `spec-complete`
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

**Reused components (unchanged)**: Bundle Graph Store, Envelope Ledger, Net Settlement route, Settlement Verifier, Guardrail Gate, Confirmation Gate, Session Log store, Agent Registry/Router, Agent Definition Validator, Marketplace Registry Canvas, Issuance Service, Notification Dispatcher. This feature changes no interface, schema, or contract belonging to any of them. The one behavioural change to a reused component is a *call site*: the bundle-commit transaction additionally writes the split row set, which is what makes US-7's "same committed state" VCC satisfiable at all.

### Component Inventory — v0.3.0 additions

| Layer | Component | Local rung | Delivered rung | Source |
|---|---|---|---|---|
| Edge | Vendor Registry | `dev-proven` | `undocumented` | this document, v0.3.0 |
| Edge | Vendor Lifecycle State | `dev-proven` | `undocumented` | this document, v0.3.0 |
| Edge | Commission Rule Evaluator | `dev-proven` | `undocumented` | this document, v0.3.0 |
| Edge | Vendor Ledger Split Projector | `dev-proven` | `undocumented` | this document, v0.3.0 |
| Edge | Payout Dispatch Coordinator | `dev-proven` | `undocumented` | this document, v0.3.0 |
| Edge | Vendor Settlement Canvas | `dev-proven` | `undocumented` | this document, v0.3.0 |
| Edge | Bundle Graph Store | inherited | `undocumented` | reused; call site extended only |
| Edge | Envelope Ledger | inherited | `undocumented` | reused, unmodified |
| Harness | Net Settlement route | inherited | `undocumented` | reused, unmodified |
| Harness | Settlement Verifier | `dev-proven` | `undocumented` | reused, unmodified |

### Deploy Boundary Register — v0.3.0 additions

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement | State |
|---|---|---|---|---|---|---|
| Vendor lifecycle: `approved` → `active` | Authoring | Authoring | lifecycle named check — exit 0, 3 passed, surface `authoring` | Only an authenticated operator decision may activate a vendor; activation is never inferred from row presence, payout-account presence, or elapsed time | Transition the vendor to `suspended`; already-committed splits freeze rather than dispatch | `closed` |
| Split projection → payout dispatchable | Authoring | Authoring | payout coordinator named check — exit 0, 6 passed, surface `authoring` | A split becomes dispatchable only on a recorded settlement-verified event plus an `active` vendor verdict; neither may be defaulted | Leave the split in `pending`; a non-dispatched split moves no money and is fully reversible | `closed` |
| Payout dispatch → external settlement rail | Authoring | Mirror | `node --test tests/integration/marketplace-wiring.test.mjs tests/process/deploy-boundary.test.mjs` — exit 0, 4 passed, surface `authoring`; stub rail only | Dispatch only through the existing in-repo net-settlement route with a `split_id`-derived idempotency key; no direct external payout provider call from any task | Recorded terminal `failed` state plus operator-led reconciliation; a dispatched movement is **not** locally reversible, which is why this row is `closed` and gated | `closed` |
| Marketplace settlement schema → D1 remote | Authoring | Mirror | `npm run storage:d1:migrate:local` — exit 0, local resource reported no pending migrations, surface `authoring`; remote not invoked | Apply the new migration locally first; remote application is an operator-run irreversible operation requiring its own explicit decision | Forward migration only; a remote schema change is not rolled back by a local revert | `closed` |

---

## ADR-1: Agent Registry/Router as the Sole New Primitive (vs. Rebuilding Verticals Per Agent)
**Status**: Proposed
**Date**: 2026-08-19

### Context
A second vertical (or a third-party agent) could either reimplement its own guardrail/issuance/settlement wiring the way the travel document built its first vertical, or a single router could be inserted so every future vertical reuses the same downstream chain unmodified.

### Decision
Insert Agent Registry/Router as the only new node; zero changes to Guardrail Gate, Shared Canvas Node, Issuance Service, Settlement Verifier, or Notification Dispatcher.

### Alternatives Considered
1. **Per-vertical reimplementation**: Pros — no shared-router failure mode, each vertical fully isolated; Cons — duplicates guardrail/issuance logic per vertical, which is the exact "two unsynchronized copies" anti-pattern this document's own Problem Statement names, now recurring at platform scale.
2. **Full agent-mesh (every agent talks to every other agent directly)**: Pros — no central point of failure; Cons — no single Guardrail Gate can enforce a budget across a mesh without becoming distributed-systems research; wildly over-scoped for a two-agent MVP.

### Rationale
Matches min-pivot-max-value directly: one new deterministic, $0 component reuses five already-spec'd-or-dev-proven components rather than duplicating any of them.

### TCO Impact

| Dimension | Chosen: Agent Registry/Router | Alternative: Per-vertical reimplementation | Alternative: Full agent-mesh |
|---|---|---|---|
| Infra cost | $0 (existing Durable Object provisioning) | $0 infra, but N× code paths to maintain | $0 infra, but N² integration paths |
| Ops burden | Low (one router to reason about) | High (N guardrail implementations to keep correct and in sync) | Very high |
| Vendor risk | Low (no new vendor) | Low per-vertical, but compounding audit risk | Low per-edge, high aggregate |

### Consequences
- **Positive**: closes the routing gap without touching any proven component's code.
- **Negative**: the Router becomes a single dispatch point that needs its own explicit fallback — a "no match" state, not a silent drop, when an intent's category matches no registered agent.
- **Neutral**: reuses Durable Object infrastructure already provisioned for the travel document's own components.

---

## ADR-2: Third-Party Trust Boundary — Declarative Allowlist Now, On-Chain Attestation as Roadmap
**Status**: Proposed
**Date**: 2026-08-19

### Context
US-1's honest gap: the Registry checks presence in the Agent Definition table, not runtime behavior. The two agents registered in this increment are both internally controlled, so the gap is real but currently low-consequence.

### Decision
Ship declarative allowlist-only enforcement for the two-agent MVP; defer on-chain trust/reputation attestation to Platform Roadmap Phase 2 (Agent Trust & Verification Registry).

### Alternatives Considered
1. **Build on-chain attestation now**: Pros — a real trust guarantee before opening registration to strangers; Cons — smart-contract build plus attestation-issuance and verification flow is genuine engineering scope, not schedulable alongside the Router within this increment.
2. **No allowlist at all, route by string match**: Pros — trivial to build; Cons — this is exactly the anti-pattern the Registry exists to prevent; any string could route to a live payment-adjacent path.

### Rationale
Consistent with this document's own "Won't (this increment): public third-party self-serve registration" — since only two internally-controlled agents are registered, allowlist-only enforcement is honest about being interim rather than a claimed guarantee for arbitrary future registrants.

### TCO Impact

| Dimension | Chosen: Declarative allowlist | Alternative: On-chain attestation now |
|---|---|---|
| Infra cost | $0 | $0 infra, but real smart-contract build hours |
| Ops burden | Low | Medium-high (attestation issuance + verification flow to maintain) |
| Vendor risk | Low (no new vendor) | Low (Avalanche already adopted), but adds a new contract surface to audit |

### Consequences
- **Positive**: ships now at $0, unblocks the Router MVP without waiting on unscoped attestation work.
- **Negative**: the marketplace cannot honestly claim a third-party trust guarantee yet, and must not be marketed as one until Phase 2 lands.
- **Neutral**: Phase 2 roadmap item, not abandoned — see Platform Roadmap below.

---

## ADR-3: Marketplace Registry Canvas as a Yjs-Backed Extension (Reuse) vs. a New Store
**Status**: Proposed
**Date**: 2026-08-19

### Context
US-3 needs a live, operator-facing view of registered agents. This could reuse the existing Shared Canvas Node Store's CRDT pattern with a new node type, or stand up a separate registry database.

### Decision
Extend the existing Yjs/Durable Object pattern with a new, operator-scoped node type; no new storage system introduced.

### Alternatives Considered
1. **Separate D1 table only, no CRDT**: Pros — simpler mental model for a single-operator MVP; Cons — no live multi-tab/multi-device sync for the operator view, and diverges from the already-established key-design pattern (`table_name:record_id`) for no real gain at this scale.
2. **FOSS alternative — Automerge**: Pros — comparable CRDT feature set; Cons — the same switching-cost argument the travel document already made against it in its own ADR-1, now doubled since it would diverge from the transaction-node CRDT choice too.

### Rationale
Directly reapplies the travel document's ADR-1 logic: this is a new *consumer* of an existing dependency, not a new dependency — the strongest min-pivot-max-value case available.

### TCO Impact

| Dimension | Chosen: Yjs, new node type | Alternative: separate D1 table | Alternative: Automerge |
|---|---|---|---|
| Infra cost | $0 (existing Durable Object) | $0 (existing D1) | $0 (same infra, different library) |
| Ops burden | Low (already operationally familiar) | Low, but no live sync | Medium (new library to learn) |
| Vendor risk | Low (MIT, already vetted) | Low | Low (MIT) |

### Consequences
- **Positive**: zero new infrastructure or library risk; directly closes US-3.
- **Negative**: registry nodes need their own key-scoping discipline (operator-only) to avoid leaking agent internals to Shopper or Agent Builder clients prematurely.
- **Neutral**: reuses the same `table_name:record_id` key pattern already established.

---

## ADR-4: Clean-Room Native Marketplace Layer — Mercur and Medusa as Inspiration Only
**Status**: Proposed
**Date**: 2026-08-22

### Context
The supply side of a marketplace — vendor entity, vendor lifecycle, commission rules, per-order vendor split, payout dispatch — is solved territory. [`mercurjs/mercur`](https://github.com/mercurjs/mercur) and [`medusajs/medusa`](https://github.com/medusajs/medusa) both ship mature, MIT-licensed implementations that have absorbed years of production traffic. Copying them, forking them, installing them, or standing one up behind an HTTP call are all legally available options. The question is whether this platform should take any of them.

Note that this decision goes **beyond what the MIT licence requires**. MIT would permit copying either codebase outright with attribution. This is not a licence-risk mitigation, and it should not be defended as one if it is ever questioned.

### Decision
Treat both projects as **reference material for shape and problem decomposition only**, and build every module in the v0.3.0 feature from first principles against this repository's own primitives. Specifically forbidden, regardless of licence:

- No `@medusajs/*` or `@mercurjs/*` package in any dependency scope — `dependencies`, `devDependencies`, `optionalDependencies`, workspace, or transitive-by-intent — including as a local-only prototype.
- No copied or "lightly adapted" code, schema DDL, migration, config, test, fixture, or prose from either project, in whole or in part.
- No forking, vendoring, or git-submoduling either project into this repository.
- No runtime HTTP dependency on a hosted Mercur or Medusa instance on any `agentic-graph` critical path.
- No reuse of either project's entity names, field names, or API shapes verbatim. Native vocabulary throughout: `vendor_ledger_split`, not a renamed import of a foreign naming scheme.

Studying READMEs, architecture docs, and blog posts to extract *what problem each module solves and how it is shaped* is explicitly fine and is what happened here. Opening either project's source files to read implementation details is not part of this workflow. Where a module's shape was arrived at by studying their approach, lineage is recorded as a one-line comment describing the pattern — never as a link to, or quotation of, their source.

### Alternatives Considered
1. **Install and use Mercur or Medusa directly**: Pros — years of bug-hardening for free, a vendor dashboard already built, faster time-to-first-payout; Cons — imports a foreign ORM, a foreign module system, and a foreign migration runner into a repository whose entire settlement path is currently raw prepared statements over D1 and SQLite Durable Objects. The dependency surface would exceed what a solo operator can own line-by-line, and the failure modes would arrive from code nobody here has read.
2. **Adopt their schema as a starting point and rename the fields**: Pros — keeps the modelling work; Cons — this is a distinction without a difference from vendoring. Independent derivation is the entire point; renamed inheritance is inheritance.
3. **Run a hosted Mercur instance behind a service call**: Pros — no in-repo dependency at all; Cons — puts a third-party service on the settlement critical path, which is a strictly worse availability and trust position than owning three hundred lines of integer arithmetic. Remains available later and is not foreclosed.
4. **Defer the whole layer until a real second-party vendor exists**: Pros — zero build cost now; Cons — the vendor, commission, and split pieces are small, pure, and independently testable, and the four existing discovery sandboxes can each be modelled as one vendor row immediately. The piece that genuinely should wait — a vendor-facing dashboard — is already deferred under "Won't (this increment)".

### Rationale
The build being declined is not large. Vendor Lifecycle State is a frozen transition table. Commission Rule Evaluator is integer arithmetic with a specified rounding policy. Vendor Ledger Split Projector is a grouping over a per-leg breakdown this repository already computes. That is the whole of the new business logic, and all of it is property-testable in a way a foreign framework's internals are not. Weighed against a foreign ORM, a foreign module system, and a payout provider this platform does not otherwise need, self-containment wins on TCO and on the operator's ability to reason about their own money path.

### TCO Impact

| Dimension | Chosen: clean-room native | Alternative: install Mercur/Medusa | Alternative: hosted instance |
|---|---|---|---|
| Infra cost | $0 — D1, SQLite DOs, DO alarms already provisioned | $0 infra, but a Node/Postgres-shaped runtime this repository does not have | Hosting cost plus a new availability dependency |
| Dependency surface | Zero new packages | A large transitive tree including a foreign ORM and migration runner | Zero in-repo, but a third-party service on the settlement path |
| Ops burden | Low — arithmetic the operator wrote and property-tested | Medium-high — upgrades, migrations, and breaking changes on someone else's schedule | Medium — an external service to monitor and reconcile against |
| Vendor risk | None introduced | Low licence risk, real architectural lock-in | Real — external outage becomes a payout outage |
| Audit burden | One repository to read | Two codebases to reason about during a money dispute | Opaque during a money dispute |

### Consequences
- **Positive**: the marketplace capability exists natively, property-tested, and fully owned, on the same D1 / Durable Object / alarm stack already running, with zero new dependency or infra category and $0 marginal cost.
- **Negative**: this forgoes whatever bug-hardening years of Mercur and Medusa production traffic have already shaken out of equivalent logic. That is a real cost, named honestly, and accepted as the right trade for a solo-dev, self-containment-first build. It also means the split and rounding arithmetic must be property-tested rather than trusted — which the build sequence requires before any payout component ships.
- **Neutral**: this does not foreclose the external option. If a genuine multi-tenant vendor-dashboard need appears, an external Mercur integration remains available as a later, separately scoped decision. This ADR only formalizes how the native path is built in the meantime.

---

## ADR-5: Hand-Rolled Commission Rules and Vendor Lifecycle (vs. json-rules-engine and XState)
**Status**: Proposed
**Date**: 2026-08-22

### Context
The source addendum for this feature proposed `json-rules-engine` for commission tiers and `XState` for the vendor lifecycle, both by analogy to prior recommendations. Neither library is currently a dependency of this repository, in either the root or the canvas workspace. Meanwhile the repository already contains several hand-rolled equivalents of both patterns: deterministic predicate filters and frozen transition tables, each small, each property-tested, each with no external dependency.

### Decision
Hand-roll both. Commission rules become a deterministic predicate evaluator in the same shape as the existing license-filter and violation-collector modules. The vendor lifecycle becomes a frozen transition table in the same shape as the existing settlement-state and hold-lifecycle modules. Neither library is installed.

### Alternatives Considered
1. **Adopt `json-rules-engine` for commission tiers**: Pros — expressive JSON rule authoring, someone else maintains the evaluator; Cons — a commission rule in this increment is a flat rate or a tiered rate over one integer. The library's expressiveness is unused, and its evaluation semantics — particularly around numeric coercion — would sit directly on the money path where this platform's own rule is "safe integers only, never floats, never zero". Importing a general evaluator to compute a percentage of an integer is a poor trade on the one path where determinism matters most.
2. **Adopt `XState` for the vendor lifecycle**: Pros — visualization tooling, formal machine semantics, guards and actions for free; Cons — the lifecycle is four states and a handful of legal edges. The repository already has three hand-rolled machines of comparable complexity, and adding a fourth in a different idiom would fragment the pattern rather than consolidate it. A frozen transition table is exhaustively property-testable in a few dozen lines.
3. **Adopt both for consistency with the source addendum's recommendation**: rejected — the addendum's recommendation was made by analogy rather than from inspection of what this repository already contains. Following it would introduce two dependencies to replace patterns the codebase has already settled.

### Rationale
Both libraries would be net-new dependency surface for logic the repository has already demonstrated it can express in tens of lines, in an established local idiom, with property tests. The tiebreaker is where the code sits: this is the money path, and on the money path "an evaluator whose numeric semantics I fully control" beats "an evaluator with more features".

### TCO Impact

| Dimension | Chosen: hand-rolled | Alternative: json-rules-engine + XState |
|---|---|---|
| Infra cost | $0 | $0 |
| Dependency surface | Zero new packages | Two new runtime packages plus transitives on the settlement path |
| Ops burden | Low — matches three existing in-repo patterns | Medium — two new idioms to maintain alongside the existing three hand-rolled machines |
| Bundle/runtime cost | None | Non-zero, on a worker whose cold-start budget matters |
| Vendor risk | None | Low, but real on the money path |

### Consequences
- **Positive**: zero new dependencies; both modules match idioms already present and already property-tested; numeric semantics on the money path stay fully owned.
- **Negative**: no rule-authoring GUI and no state-machine visualizer come for free. If commission policy later grows into genuinely complex conditional logic — vendor category × time window × volume tier × promotional override — this decision should be revisited rather than extended, because a hand-rolled evaluator that grows unbounded is worse than the library it replaced.
- **Neutral**: the rule shape is stored as data with a revision identifier, so a later swap of the evaluator implementation does not require rewriting stored rules.

---

## ADR-6: Vendor Splits as a Same-Transaction Projection, Dispatched by Durable Object Alarm (vs. a Parallel Ledger and a Queue)
**Status**: Proposed
**Date**: 2026-08-22

### Context
Two structural questions sit under this feature. First: is a vendor split its own ledger, or a projection over the ledger that already exists? The repository already has exactly one authoritative money record — the envelope ledger — plus a bundle graph that owns leg identity and atomic bundle commits. Second: what drives payout dispatch? The source addendum proposed a Cloudflare Queues consumer triggered by a row insert. No Queues binding exists in any wrangler configuration in this repository; deferred and retried work is currently driven by Durable Object alarms and service-binding dispatch.

### Decision
A vendor split is a **projection**, written inside the same committed transaction as the bundle commit, over the per-leg breakdown and settled total that already exist. It is not a second source of truth about money. Payout dispatch is driven by a **Durable Object alarm** with a bounded retry loop and a `split_id`-derived idempotency key, calling the existing in-repo net-settlement route through a service binding. No Queues binding is added.

### Alternatives Considered
1. **A standalone vendor ledger written after the bundle commit**: Pros — decouples split failure from bundle commit, simpler to reason about in isolation; Cons — creates a window in which a bundle is committed and its splits are absent or partial, which makes US-7's VCC unsatisfiable by construction and reintroduces exactly the reconstruct-the-arithmetic-later problem this feature exists to remove. Two records of the same money is the failure mode, not the safety measure.
2. **Add a Cloudflare Queues binding for payout dispatch**: Pros — purpose-built for this, at-least-once delivery, built-in retry and dead-lettering; Cons — a new infra category for this repository, a new binding across three environments, and a second async mechanism alongside the alarm pattern already used by the envelope ledger. The bounded, idempotent, low-volume nature of payout dispatch is well within what an alarm loop handles, and consolidating on one async idiom is worth more here than the queue's extra guarantees. Revisit if payout volume ever makes per-DO alarm scheduling the bottleneck.
3. **Synchronous payout inside the bundle-commit transaction**: Pros — no async machinery at all; Cons — puts an external settlement call inside a transaction, coupling bundle commit availability to payout-rail availability, and makes the commit non-idempotent. Rejected outright.
4. **Adopt an external payout provider (the addendum's Stripe Connect Transfers illustration)**: Pros — mature payout rails, vendor onboarding handled; Cons — this repository already owns a settlement rail on the already-adopted StraitsX/Avalanche path. Adding a second payout provider introduces precisely the dependency surface ADR-4 declines, for a capability that already exists in-repo. Not adopted.

### Rationale
One authoritative money record, one async idiom, one payout rail. Each of the three alternatives trades a real invariant — atomic split completeness, mechanism consolidation, or dependency self-containment — for convenience this feature does not need at its current scale. The projection choice in particular is what makes the conservation invariant checkable at all: if splits are written separately, "sum of gross equals settled total" becomes eventually-true rather than always-true.

### TCO Impact

| Dimension | Chosen: projection + alarm | Alternative: parallel ledger + Queues | Alternative: external payout provider |
|---|---|---|---|
| Infra cost | $0 — existing DOs and alarms | $0 tier, but a new infra category across three environments | Provider fees plus a new external dependency |
| Ops burden | Low — one async idiom, one money record | Medium — reconciliation between two money records, plus queue and dead-letter monitoring | Medium — external reconciliation and onboarding flows |
| Correctness risk | Low — invariants hold at commit time | Real — a partial-split window exists by construction | Moderate — split correctness now spans two systems |
| Vendor risk | None introduced | None introduced | Real |

### Consequences
- **Positive**: the conservation and completeness invariants are always-true rather than eventually-true, which is what makes them property-testable; no new infra category, no new binding, no new provider; payout dispatch reuses retry bounds already defined in-repo rather than inventing a second set.
- **Negative**: a split-projection failure aborts the enclosing bundle commit. That is the intended trade — a bundle with incomplete splits is worse than a bundle that failed to commit — but it does mean a commission-rule defect can block settlement, so the evaluator must be property-tested before the projector ships. Alarm-driven dispatch also carries no dead-letter surface of its own; a terminal `failed` payout requires operator-led reconciliation, and this is recorded as such in the Deploy Boundary Register.
- **Neutral**: nothing here forecloses Queues later. If dispatch volume grows past what alarm scheduling handles comfortably, the coordinator's dispatch trigger is the only thing that changes; the projection, the invariants, and the idempotency key are unaffected.

---

## Platform Roadmap: Toward a Full-Fledged Agentic Commerce Platform

This document's MVP (Phase 1) proves the router primitive with two internally-controlled agents. The phases below sequence the remaining payments/fintech and AI-agent-ecosystem hackathon-ideation items as increments on the **same** reused substrate — Guardrail Gate, Shared Canvas Node, Issuance Service, and Settlement Verifier stay fixed across every phase; each phase's delta is named explicitly, per the min-pivot-max-value discipline applied throughout this document.

| Phase | Feature | Reuse | Delta (new work) | Priority rationale (ROI) |
|---|---|---|---|---|
| **1 — this document, v0.1.0–v0.2.0** | Agent Marketplace / Orchestration Hub (demand side) | Guardrail Gate, Shared Canvas Node, Issuance Service, Settlement Verifier, Notification Dispatcher, both Discovery Harnesses | Agent Registry/Router, Agent Definition Validator, Marketplace Registry Canvas | **Must** — everything downstream depends on proving the router works domain-agnostically at $0 marginal infra cost |
| **1b — this document, v0.3.0** | Clean-Room Native Vendor Settlement Layer (supply side) | Bundle Graph Store, Envelope Ledger, Net Settlement route, Settlement Verifier, Session Log, operator canvas projection pattern | Vendor Registry, Vendor Lifecycle State, Commission Rule Evaluator, Vendor Ledger Split Projector, Payout Dispatch Coordinator, Vendor Settlement Canvas | **Must** — Phase 1 proved who can sell; without a split the platform cannot answer who gets paid. Zero new dependency, zero new infra category, zero new external vendor (ADR-4, ADR-5, ADR-6) |
| **2** | Agent Trust & Verification Registry | ACOS Invocation Surface Contract, Avalanche (already-adopted network) | On-chain attestation of agent identity/capability as a precondition for routing | **Should** — turns ADR-2's honest gap into a real guarantee; unlocks opening registration beyond internally-controlled agents |
| **2** | Agentic Checkout Copilot (generalized web-agent Discovery) | Full Funding→Discovery→Issuance→Execution lifecycle, Agent Registry/Router | A generic DOM/web-agent Discovery Harness registered as a third marketplace agent — any e-commerce site, not just Atlas/eBay | **Should** — proves the primitive is genuinely domain-agnostic beyond the two harnesses this document ships with |
| **3** | Disposable-Identity Card Issuance-as-a-Service | Issuance Service (StraitsX MCP), Agent Registry/Router's allowlist pattern | Expose Issuance Service itself as a callable MCP tool other teams' agents can invoke directly, not just route through | **Could** — repositions agentic-graph from "an app with agents" to "infra other agents transact through"; higher build cost than Phase 2 items since external callers need their own auth/allowlist scoping |
| **3** | Spend-Policy Guardrails Agent | Guardrail Gate, Self-Custody Wallet Interface, Avalanche | On-chain escrow/spending-limit smart contract gating card issuance on programmable policy (merchant category, cap, time window) | **Could** — resolves the travel-agencies document's US-5 honest gap (no enforcement point for Path-A guardrails) as a platform-wide capability rather than a one-off fix |
| **4** | Multi-Agent Split-Pay / Group Wallet | Shared Canvas Node, Settlement Verifier | Multiple principal-agents each fund a slice of one transaction; Avalanche settles proportional shares | **Won't (this platform increment)** — real multi-party coordination logic, no pilot demand signal yet to justify build cost |
| **4** | Spend Audit & Explainability Agent | On-chain Avalanche logs, git-as-SSOT provenance philosophy | Post-hoc agent reconstructing Funding→Discovery→Issuance→Execution into a human-readable audit trail | **Won't (this platform increment)** — the compliance/trust counterpart to Phase 2's Trust Registry; sequenced after real transaction volume exists to audit |

Phases are dependency-ordered, not calendar-committed. Phase 2 items unlock the honest gaps this document and its predecessor state outright — ADR-2's allowlist-only trust boundary here, and the travel-agencies document's US-5 enforcement gap there — so they carry the next-highest ROI rather than the split-pay or audit items, which need real transaction volume before their build cost is justified.

---

## Alignment Note (condensed)

This document is an implementation-lane checkpoint for Phase 1 plus an authoring-lane specification for Phase 1b — v0.3.0, authored 2026-08-22. Coverage: 10 PRD-template fields × 2 features + 7 TAD-template fields × 2 architectures + 6 ADRs — **all artifact-bearing template sections present for both features**.

**Rung scoping, stated precisely so it cannot be over-read.** `local_rung: dev-proven` in the frontmatter applies to the v0.2.0 Phase 1 components and the six v0.3.0 components. Same-transaction Bundle Graph Store integration, D1-backed vendor/rule resolution, Durable Object alarm persistence, service-binding runtime wiring, payout dispatch, and reporting projection now have reproducible local Evidence References. This is production-candidate evidence, not a delivery claim. Reused components inherit whatever rung they already carry in `agentic-graph-agentic-travel-agencies-prd-tad-adr-mvp-gtm.md` v0.6.0. `delivered_rung` remains `undocumented` until the protected Dev → Prod/Cloudflare release workflow integrates, applies migration `0016`, deploys both Workers, and verifies public/runtime readback.

**Clean-room conformance.** The v0.3.0 feature introduces zero new dependencies. ADR-4's directive is an enforced authoring boundary: `node --test tests/scans/no-foreign-commerce-dependency.test.mjs` exited 0 with 2 tests passed on the `authoring` surface, including a synthetic forbidden-specifier fixture proving the scan fails when the boundary is crossed.

**Executable derivation.** The v0.3.0 feature's requirements, design, tasks, and demo script are derived in `.kiro/specs/agentic-graph-native-marketplace-layer/`. Every VCC in this document appears there as a numbered acceptance criterion with a named check; no requirement is introduced downstream of this document.

### Latest Progress — 2026-08-22

- Implemented the deterministic Agent Definition Validator, Agent Registry/Router, Marketplace Registry Canvas projection, MCP invocation surface, revalidation gate, pending offline queue, session log, startup config checks, payment caller guard, and deploy-boundary checks in `agent/trae/agentic-graph-agentic-commerce`.
- Added property, unit, process, scan, and integration coverage for routing exclusivity, registration gate behavior, definition round-trip, registry projection, CRDT confluence, payment ordering, credential non-propagation, malformed definitions, idempotent registration, no-match totality, unrecognized-agent rejection, offline queue order, no schema retention, MCP surface, and runtime wiring.
- Focused validation passed with `npm run check:agentic-commerce-platform` on the commerce lane.
- Implemented the native Marketplace Worker, D1 vendor/rule and reporting schema, Bundle Graph authoritative split/payout tables, same-transaction commit integration, current-state vendor gate, durable dispatch lease, bounded payout alarm, operator transition surface, and Dev/Staging/Production service bindings.
- Added `npm run check:marketplace-settlement`, the Worker/Durable Object runtime test, generated binding types, three-environment dry-run bundles, and `docs/native-marketplace-runtime.md`.
- Canonical `main` remains the protected integration target; direct local `main` mutation and direct Prod/Cloudflare deployment are not treated as evidence until the protected workflow publishes and verifies them.

### Next Steps

1. Push the commerce lane and open or update the protected pull request into canonical `main`.
2. Run the repository integration gates on the PR branch, including commerce platform checks plus affected CI for touched root/package/test/doc surfaces.
3. After protected checks pass, merge through the repository-owned integration path; do not direct-push `main`.
4. Run Dev deployment using the repository-defined Cloudflare commands and capture read-back evidence before any production promotion.
5. Promote to Prod/Cloudflare only through the protected production authorization workflow, then update `delivered_rung` from `undocumented` to the evidence-backed rung.
6. After integration is preserved, remove the residual commerce worktree/lane and keep only canonical `main` plus any active review branch required by policy.
7. Open Phase 2's on-chain trust-attestation scoping (ADR-2) as a dedicated design pass after Phase 1's protected integration evidence exists.

### Next Steps — Phase 1b (v0.3.0, native vendor settlement layer)

These are authoring-lane steps only. None of them crosses a deploy boundary, and none may be bundled into the Phase 1 integration above.

1. Land the clean-room dependency scan first, before any component. ADR-4's directive is unenforced until a check can fail on a forbidden specifier, and a boundary that cannot fail is not a boundary.
2. Build in the source addendum's order, because it is dependency-correct: Vendor Lifecycle State (pure, standalone) → Vendor Registry → Commission Rule Evaluator → Vendor Ledger Split Projector → Payout Dispatch Coordinator → Vendor Settlement Canvas.
3. Property-test the arithmetic before the projector ships. Conservation, `gross = commission + net`, non-negativity, rounding determinism, and re-projection idempotence are the invariants that make ADR-6's same-transaction choice safe; a commission defect blocks bundle commit by design.
4. Author the D1 migration as the next sequential file and apply it locally only. Remote application is an irreversible operator-gated operation with its own Deploy Boundary row.
5. Extend the existing session-log event vocabulary and add a payout-ordering verdict alongside the existing payment-ordering verdict; do not create a second log.
6. Wire a new focused sub-gate into the existing aggregate commerce gate rather than standing up a parallel check pipeline.
7. Build the Payout Dispatch Coordinator last, once the other components are `dev-proven`, since it is the only component that moves real money and the only one whose effects are not locally reversible.
8. Resolve the four Open Questions above — commission base, payout-account identity, suspended-vendor freeze semantics, and platform-as-vendor — as recorded operator decisions before any real second-party vendor is onboarded. None of them blocks the arithmetic; all of them block onboarding.

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-AGENTIC-COMMERCE-PLATFORM-PRD-TAD-ADR-MVP-GTM@0.3.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Feature: Agent Marketplace & Orchestration Hub — Domain-Agnostic Commerce Substrate](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#feature-agent-marketplace--orchestration-hub--domain-agnostic-commerce-substrate) |
| TAD | [Architecture: Agent Registry/Router over the Reused Commerce Primitive](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#architecture-agent-registryrouter-over-the-reused-commerce-primitive) |
| ADR | [ADR-1: Agent Registry/Router as the Sole New Primitive (vs. Rebuilding Verticals Per Agent)](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#adr-1-agent-registryrouter-as-the-sole-new-primitive-vs-rebuilding-verticals-per-agent) |
| MVP | [MVP — reference implementation](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run check:marketplace-settlement` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`cloudflare/workers/agentic-graph-payment/travelAgency/netSettlement.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/cloudflare/workers/agentic-graph-payment/travelAgency/netSettlement.ts), [`cloudflare/workers/agentic-graph-travel-commerce/test/native-marketplace-runtime.test.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/cloudflare/workers/agentic-graph-travel-commerce/test/native-marketplace-runtime.test.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
