---
title: "Knowgrph Agentic Commerce Platform — Agent Marketplace & Orchestration Hub, with Platform Roadmap"
doc_type: "Combined PRD/TAD/ADR"
version: "0.2.0"
date: "2026-08-19"
lang: "en-US"
owner: "Solo Founder / AI Orchestrator"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "agent/trae/knowgrph-agentic-commerce"
universal_scope: false
---

# Knowgrph Agentic Commerce Platform — Combined PRD/TAD/ADR

**Conformance note**: this document authors against `prd-tad-adr-guidelines.md` v1.7.0. `universal_scope: false` for the same reason as its source document — this names real chosen dependencies, not swappable neutral examples — and each is still introduced under "reference implementation" per the Scope & Neutrality Contract. `local_rung: dev-proven` applies only to the three components this document introduces (Agent Registry/Router, Agent Definition Validator, Marketplace Registry Canvas) plus their invocation, offline, payment-ordering, and deploy-boundary helper surfaces; every reused component below inherits whatever rung it already carries in `knowgrph-agentic-travel-agencies-prd-tad-adr.md` v0.6.0 — this document claims no new proof for old components, only new scope. `delivered_rung` stays `undocumented` until the protected Dev → Prod/Cloudflare release workflow publishes and verifies the integrated branch.

**Revision note (v0.2.0 — implementation lane)**: the `agent/trae/knowgrph-agentic-commerce` lane now contains the deterministic Agent Definition Validator, Agent Registry/Router, Marketplace Registry Canvas projection helpers, MCP invocation surface, revalidation gate, pending offline queue, session log, startup/deploy boundary checks, and property/process/unit/integration tests. The lane preserves the same platform generalization goal as v0.1.0 — promoting the Funding → Discovery → Issuance → Execution lifecycle already proven and spec'd for one vertical (travel) into a domain-agnostic marketplace substrate — while adding local runtime evidence before protected integration.

---

## Feature: Agent Marketplace & Orchestration Hub — Domain-Agnostic Commerce Substrate

### Problem Statement

The travel-agencies document proved a real, guardrail-enforced, human-confirmed payment lifecycle — but wired it directly into one vertical's Intent Parser and two hand-picked Discovery Harnesses (flights, general comparison shopping). Any other agent — internal or a third-party team's — wanting the same protections (budget guardrail, human confirmation, disposable-card issuance, on-chain settlement verification, shared audit record) would today have to re-derive Guardrail Gate, Issuance Service's MCP/x402 binding, Settlement Verifier, and Shared Canvas Node from scratch. That is the exact "two unsynchronized copies" anti-pattern the travel document's own Problem Statement named once, now recurring at platform scale: every new vertical becomes its own private, unaudited reimplementation of the same trust-critical plumbing. The opportunity is to expose the already-proven lifecycle as one MCP-invocable marketplace primitive — a canvas where Discovery agents register in, and Knowgrph becomes the shared substrate that terminates any of them in the same protected transaction.

### Personas

| Persona | Jobs-to-be-done |
|---|---|
| **Agent Builder / Third-Party Developer** | Wants to register a Discovery agent against a fixed, allowlisted contract, without reimplementing guardrail, issuance, or settlement plumbing themselves |
| **Shopper-Agent Principal** *(reused from travel doc)* | Wants one guardrail-enforced, human-confirmed checkout path that behaves identically no matter which registered vertical agent found the item |
| **Platform Operator** *(Joohwee, acting as marketplace operator)* | Needs one canvas view of every registered agent — its Agent Definition, tool allowlist, and trust/verification status — without reading code or redeploying to find out what's live |

### User Journey Stage

Four stages, one new: **Register** (an Agent Builder onboards a Discovery agent against the Invocation Surface Contract) is new to this document. **Discover → Engage → Complete** are the same three stages the travel-agencies document already proved out — now serving whichever registered agent matched the request, instead of one hardcoded vertical.

### User Stories

**US-1 — As an** Agent Builder **I want** my Discovery agent registered against the Invocation Surface Contract before any Shopper request can route to it **So that** an unvetted agent can never receive a live, payment-adjacent request.
> **VCC translation**: `Verify zero Agent Registry routing events reference an agent_id absent from the Agent Definition table, for the full session log`
>
> **Honest gap, stated rather than implied**: registration today checks *presence* in the Agent Definition table — a schema/allowlist check — not runtime sandboxing of what a registered agent's own tool calls actually do beyond its declared allowlist. That is a real capability boundary, not yet built (see ADR-2). This VCC stays `spec-complete` and does not claim a trust guarantee beyond "declared and present," which is deliberately weaker than "verified safe."

**US-2 — As a** Shopper-Agent Principal **I want** a single free-text intent to route automatically to whichever registered agent's declared category matches **So that** I use one interface across verticals instead of a different app per vertical.
> **VCC translation**: `Verify the Agent Registry's routing decision for each session matches the requesting intent's declared category field, and that at most one agent receives a Discovery dispatch per intent — no silent fan-out to non-matching agents`

**US-3 — As a** Platform Operator **I want** a Marketplace Registry Canvas node listing every registered agent's Agent Definition, tool allowlist, and trust/verification status **So that** I can audit what's live without reading code.
> **VCC translation**: `Verify the Marketplace Registry Canvas's rendered agent list checksum matches the underlying Agent Definition table for the same read, with zero entries present in one but not the other`

**US-4 — As a** Shopper-Agent Principal **I want** the same budget guardrail and human-confirmation gate that protects flight bookings to apply identically regardless of which registered agent produced the offer **So that** switching verticals never weakens my protection.
> **VCC translation**: `Verify, for every transaction regardless of agent_id, zero StraitsX Cards issuance calls fire before a recorded guardrail-pass and human-confirm event exist in that session's log — the same VCC as the travel-agencies document's US-1/US-2, now asserted across all agent_id values rather than one hardcoded harness`

**US-5 — As an** Agent Builder **I want** my registered agent's approved spend automatically scoped to a StraitsX-issued disposable card **So that** I don't have to write my own card-issuance integration to participate in the marketplace.
> **VCC translation**: `Verify a registered agent's Discovery output never contains a direct StraitsX or Avalanche API credential or call — Issuance Service remains the sole caller for every agent_id, confirmed by the absence of any non-Issuance-Service caller in the MCP tool-call log`

### Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---|---|---|
| Registered heterogeneous agents proving domain-agnosticism | 0 | ≥ 2 (Flight Discovery Harness + Shopping Discovery Harness, both already spec'd, zero new vendor integration) | at first Evidence Reference |
| Guardrail/confirmation-gate parity across agents (US-4) | N/A | 100% — VCC passes for every registered `agent_id` | at first Evidence Reference |
| Registry-canvas checksum mismatch rate (US-3) | N/A | 0 | at first Evidence Reference |
| New external vendor integrations introduced | N/A | 0 — Router and Registry are Cloudflare-native additions to already-provisioned Durable Objects | Sprint 1 |
| Readiness rung (local / delivered) | `undocumented` / `undocumented` | `dev-proven` / `undocumented` for the three new components | Sprint 1 exit |
| Monthly TCO | $0 (every reused dependency already $0 per travel doc's TCO tables) | $0 | ongoing |
| Token cost / month | $0 (Router is deterministic, non-AI) | ≤ existing travel-doc estimate — no new LLM call introduced by routing itself | Sprint 1 |

### MoSCoW Priority

| Tier | Item | ROI rationale |
|---|---|---|
| **Must** | Agent Registry/Router (US-1, US-2) | The one new node the entire platform pivot depends on; deterministic, $0, reuses Durable Object infra already provisioned |
| **Must** | Guardrail/confirmation-gate parity across registered agents (US-4) | Without this the "marketplace" is just a routing table, not a protected commerce substrate — this is what makes it worth calling a platform |
| **Should** | Marketplace Registry Canvas (US-3) | Not required for the two-agent MVP to function, but required before any third party could ever be safely onboarded |
| **Should** | Agent Definition Validator against the ACOS Invocation Surface Contract (US-1, US-5's registration half) | Ties this document to the already-formalized `acos-agentic-runtime-ready-production-verified-prd-tad-adr.md` instead of inventing a second, divergent allowlist schema — direct FOSS-hard-gate / min-pivot-max-value application |
| **Could** | Runtime capability sandboxing beyond the declarative allowlist (US-1's honest gap) | Real engineering scope, not a wiring task; deferred to Platform Roadmap Phase 2 |
| **Won't (this increment)** | Public third-party self-serve registration UI | The MVP proves the primitive with two internally-controlled agents; opening registration to strangers is a trust/abuse-surface question this document doesn't resolve yet |
| **Won't (this increment)** | On-chain trust/reputation attestation | Logged as Platform Roadmap Phase 2 (Agent Trust & Verification Registry), not built now — see ADR-2 |
| **Won't (this increment)** | Marketplace fee/monetization model | Deferred to roadmap; this increment proves infra, not revenue |

### Min-Viable Scope

Register the two Discovery Harnesses already spec'd in `knowgrph-agentic-travel-agencies-prd-tad-adr.md` (Flight, Shopping) behind one Agent Registry/Router, routed by declared category, both terminating in the same unmodified Guardrail Gate → Shared Canvas Node → Issuance Service → Settlement Verifier → Notification Dispatcher chain. No new external vendor integration is required to prove domain-agnosticism — every dependency needed is already contracted.

### Out of Scope

- Public third-party self-serve onboarding (US-1's trust boundary needs Phase 2 first)
- On-chain trust/reputation attestation (Platform Roadmap Phase 2)
- Marketplace fee/billing model
- Multi-tenant fund segregation beyond the existing shared/personal CRDT key-scoping
- A third net-new vertical (the MVP proves the pattern with two *existing* verticals, deliberately)

### Dependencies

**Reused unchanged** — see `knowgrph-agentic-travel-agencies-prd-tad-adr.md` v0.6.0 for full specs, none re-derived here: Yjs CRDT inside Cloudflare Durable Objects; StraitsX Card MCP Gateway (`card.straitsx.ai/sandbox/sse`); Avalanche Data API + Snowtrace API; Core.app (Core Wallet); Telegram Bot API; Atlas API (aTriptech); eBay Browse API + PricesAPI.

**New to this document**:
- Invocation Surface Contract / Agent Definition schema + tool allowlist — **reference implementation**: `acos-agentic-runtime-ready-production-verified-prd-tad-adr.md`. Reused, not reinvented, per the FOSS-hard-gate / min-pivot-max-value constraint already established for `agentic-canvas-os`.

### Open Questions

- Does routing-by-declared-category need a real classifier (an LLM call) or is a fixed enum sufficient at two registered agents? Affects whether the Router stays $0/non-AI or introduces this platform's first token cost.
- Where does the trust/verification boundary actually enforce — client-side inside the registered agent, inside the Router (pre-dispatch check), or an on-chain attestation contract? Same open-question shape as the travel document's Path-A guardrail-placement question; not resolved here, carried into ADR-2 and Platform Roadmap Phase 2.
- Does a registered agent need its own StraitsX-linked funding source, or does every registered agent draw from one operator-controlled wallet? Affects multi-tenant fund segregation before any third-party agent could be onboarded.
- Marketplace fee model — free infra vs. a take-rate on settled transactions — explicitly deferred so it isn't silently assumed either way.

---

## Architecture: Agent Registry/Router over the Reused Commerce Primitive

### Overview

This document adds exactly **one** new node — Agent Registry/Router — between Intent Parser and Discovery Harness in the pipeline the travel-agencies document already proved out. Every component downstream of Discovery (Guardrail Gate, Shared Canvas Node, Issuance Service, Settlement Verifier, Notification Dispatcher) is reused **unmodified**. This is the purest min-pivot-max-value case in this codebase to date: zero new external vendor integrations, one new internal routing component, five already-spec'd-or-dev-proven components reused as-is.

### Journey → System Mapping

| Journey Stage | Workflow | Data Flow | Orchestration/Harness Flow | Topology Node(s) | Component |
|---|---|---|---|---|---|
| Register | Agent Registration Workflow | Agent Definition + tool allowlist → validation → registered/rejected | Agent Registration Pipeline | Agent Registry/Router, Marketplace Registry Canvas | Agent Definition Validator |
| Discover | Marketplace Routing Workflow | Intent → Router → matched Discovery Harness → scored offers | *(reused)* Flight Booking Pipeline / Comparison Shopping Pipeline, now entered via Router | Agent Registry/Router, Discovery Harnesses | Agent Registry/Router |
| Engage | Guardrail Workflow *(unchanged, reused)* | Offer → Guardrail Gate → gate result | *(deterministic, reused)* | Edge Orchestrator | Guardrail Gate |
| Engage → Complete | Confirmation Workflow *(unchanged, reused)* | Gate result → Shared Canvas Node → both clients | Shared-Canvas Sync Pipeline *(reused)* | Shopper Client, Operator Client, Edge CRDT Store | Shared Canvas Node Store |
| Complete | Settlement Workflow *(unchanged, reused)* | Confirm → Issuance/Settlement Harnesses → provenance write | *(sequential, reused)* | External API nodes | Issuance Service, Settlement Verifier |

### Topology

**Version**: 0.1 — 2026-08-19 (initial spec)
**Boundaries**: Shopper Browser (mobile-first PWA), Platform Operator Browser (mobile-first PWA), Edge Runtime (Cloudflare Workers/Durable Objects — now including the Marketplace zone), Registered-Agent zone (wherever an Agent Builder runs their own Discovery agent — outside Knowgrph's trust boundary by design; Knowgrph never executes third-party agent code, only routes typed intents to it and reads typed offers back), External API zone (unchanged from the travel document — Atlas, StraitsX, Avalanche, Snowtrace, Telegram, none controlled by Knowgrph).

| Node | Role | Type | Lane | Connects to | Connection type | Data residency |
|---|---|---|---|---|---|---|
| **[new]** Agent Registry/Router | Router | Durable Object | Authoring→Delivery | Discovery Harnesses, Agent Definition Validator, Guardrail Gate, Marketplace Registry Canvas | Sync (registry lookups + dispatch) | Edge (Cloudflare region) |
| **[new]** Agent Definition Validator | Executor | Deterministic component | Authoring | Agent Registry/Router | Sync | Edge (Cloudflare region) |
| **[new]** Marketplace Registry Canvas | Store | CRDT (Durable Object) | Delivery | Agent Registry/Router, Operator Client | Async stream | Edge (Cloudflare region) |
| Shopper Client *(reused)* | Consumer | PWA (browser) | Delivery | Edge Orchestrator | Async stream | Local (device) + Edge cache |
| Operator Client *(new role, reused client shell)* | Consumer | PWA (browser) | Delivery | Marketplace Registry Canvas | Async stream | Local (device) + Edge cache |
| Flight Discovery Harness *(reused)* | Executor | Harness + external API | Authoring→Delivery | Atlas API (external), Agent Registry/Router | Sync REST | External (aTriptech-hosted) |
| Shopping Discovery Harness *(reused)* | Executor | Harness + external API | Authoring→Delivery | eBay Browse API, PricesAPI (external), Agent Registry/Router | Sync REST | External (vendor-hosted) |
| Guardrail Gate *(reused, unmodified)* | Router | Deterministic component | Authoring→Delivery | Discovery Harnesses (upstream via Router), Issuance Service (downstream) | Sync REST | Edge (Cloudflare region) |
| Shared Canvas Node Store *(reused, unmodified)* | Store | CRDT (Durable Object) | Delivery | Edge Orchestrator, both Clients | Async stream | Edge (Cloudflare region) |
| Issuance Service *(reused, unmodified)* | Executor | MCP harness (SSE transport) | Authoring→Delivery | StraitsX Card MCP Gateway (external) | MCP/SSE, x402/EIP-3009 | External (StraitsX-hosted) |
| Settlement Verifier *(reused, unmodified)* | Executor | Harness + external APIs (×2) | Authoring→Delivery | Avalanche Data API + Snowtrace API | Sync REST | External |
| Notification Dispatcher *(reused, unmodified)* | Executor | Harness + external API | Authoring→Delivery | Telegram Bot API (external) | Sync REST | External (Telegram-hosted) |

```mermaid
flowchart TB
  subgraph OperatorZone["Platform Operator Browser (Delivery)"]
    OC[Operator Client PWA]
  end
  subgraph ShopperZone["Shopper Browser (Delivery, reused)"]
    SC[Shopper Client PWA]
  end
  subgraph Edge["Edge Runtime (Authoring to Delivery)"]
    EO[Edge Orchestrator — reused]
    AR[Agent Registry / Router\nNEW]
    ADV[Agent Definition Validator\nNEW]
    MRC[Marketplace Registry Canvas\nNEW — Yjs CRDT / Durable Objects]
    GG[Guardrail Gate — reused, unmodified]
    SCN[Shared Canvas Node Store — reused, unmodified]
  end
  subgraph Agents["Registered-Agent zone (outside Knowgrph trust boundary)"]
    FDH[Flight Discovery Harness\nreused — Atlas API]
    SDH[Shopping Discovery Harness\nreused — eBay Browse API + PricesAPI]
    THIRD[future third-party agent\nPlatform Roadmap Phase 2]
  end
  subgraph ExtAPI["External API zone — reused, unmodified"]
    SX[StraitsX Card MCP Gateway]
    AVAX[Avalanche Data API]
    SNOW[Snowtrace API]
    TG[Telegram Bot API]
  end
  SC -- typed intent --> EO
  EO -- route request --> AR
  AR -- registration check --> ADV
  ADV -- pass or reject --> AR
  AR -- dispatch --> FDH
  AR -- dispatch --> SDH
  AR -. future .-> THIRD
  FDH -- typed offer --> GG
  SDH -- typed offer --> GG
  GG -- sync REST/MCP, unmodified --> SX
  GG -- gate result --> SCN
  SCN -- async stream --> SC
  SCN -- normalized event --> ND[Notification Dispatcher — reused]
  ND -- sync REST --> TG
  AR -- registry state --> MRC
  MRC -- async stream --> OC
  SX -.. settlement_tx .. AVAX
  SX -.. settlement_tx .. SNOW
```

**Runtime diagram**: as above. **Version notes**: v0.1.0 — first appearance of the Marketplace zone (Agent Registry/Router, Agent Definition Validator, Marketplace Registry Canvas) and the Operator Client role; every other node and edge is carried over unmodified from `knowgrph-agentic-travel-agencies-prd-tad-adr.md` v0.6.0's runtime diagram, re-drawn here rather than diffed against it since this is a new document, not an increment.

### Orchestration/Harness Flows

**Pipeline**: Agent Registration Pipeline *(new)*
**Topology pattern**: Sequential | **Max iterations**: N/A | **Circuit-breaker**: N/A
**Token budget**: 0 prompt + 0 completion = **$0.00/call** — deterministic schema validation only, no model call

| Role | Component | Input schema | Output schema | Cost log | Fallback |
|---|---|---|---|---|---|
| Dispatcher | Agent Definition Validator | Agent Definition + tool allowlist (per ACOS Invocation Surface Contract) | registered / rejected + reason | — | Reject with typed schema-violation error |
| Consumer | Agent Registry/Router | registered agent record | routing table entry | — | N/A |
| Consumer | Marketplace Registry Canvas | routing table entry | canvas node | — | Upstream error propagation |

**Pipelines**: Flight Booking Pipeline / Comparison Shopping Pipeline *(reused, unmodified — see travel document for full spec)*
**Note on this document's only change to either pipeline**: the Dispatcher role (Intent Parser) now hands its typed intent to Agent Registry/Router, which dispatches to the matched Discovery Harness, rather than the Discovery Harness being invoked directly. Intent Parser's own input/output schema is unchanged; only the hop between it and Discovery is new.

**Pipeline**: Shared-Canvas Sync Pipeline *(reused, unmodified)*
**Note**: Marketplace Registry Canvas is a new *consumer* of the same CRDT merge pattern (Yjs), not a change to the pipeline itself — same "new consumer of an existing dependency" logic the travel document applied to its own Shared Canvas Node Store.

### Component Specifications

**Component**: Agent Registry/Router *(new)*
**Responsibility**: Component receives a typed intent, looks up which registered agent's declared category matches, and dispatches Discovery to exactly that agent.
**Interfaces**: reads typed intent from Edge Orchestrator; reads registered-agent routing table from Agent Definition Validator's output; dispatches to a Discovery Harness's existing sync-REST interface (unchanged on the harness side)
**Dependencies**: Agent Definition Validator (must return "registered" before any dispatch), Edge Orchestrator (upstream), Discovery Harnesses (downstream)
**Configuration**: category-to-agent mapping, externalized per registration, not hardcoded per vertical
**FOSS / Vendor**: FOSS — deterministic component, no external dependency, runs on already-provisioned Cloudflare Durable Objects
**Token Budget**: N/A (non-AI, deterministic — see Open Questions on whether category matching stays a fixed enum or needs a classifier at scale)
**VCC Conditions**: see US-1, US-2 VCCs above
**Evidence References**: none yet — `spec-complete`
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

**Component**: Agent Definition Validator *(new)*
**Responsibility**: Component checks a submitted Agent Definition and tool allowlist against the Invocation Surface Contract schema before the agent can be routed to.
**Interfaces**: **reference implementation**: schema defined in `acos-agentic-runtime-ready-production-verified-prd-tad-adr.md` — reused schema, not a new one authored here
**Dependencies**: Agent Registry/Router (consumer of its pass/reject result)
**Configuration**: N/A — schema is externally defined and versioned by the ACOS document, not by this one
**FOSS / Vendor**: FOSS — deterministic schema validation, no external dependency
**Token Budget**: N/A (non-AI)
**VCC Conditions**: see US-1 VCC above, including its stated honest gap
**Evidence References**: none yet — `spec-complete`
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

**Component**: Marketplace Registry Canvas *(new)*
**Responsibility**: Component renders every registered agent's Agent Definition, tool allowlist, and trust/verification status as a live canvas node for the Platform Operator.
**Interfaces**: CRDT subscription (WebSocket/Durable Object), same persistent-storage key pattern already established (`table_name:record_id`), operator-scoped key rather than shopper/merchant-scoped
**Dependencies**: Agent Registry/Router (source of registry state), Operator Client
**Configuration**: operator-only read scope; not exposed to Shopper or Agent Builder clients in this increment
**FOSS / Vendor**: FOSS — **reference implementation: Yjs** (MIT), same CRDT already adopted for Shared Canvas Node Store; new *node type*, not a new dependency
**Token Budget**: N/A (non-AI, $0 by design)
**VCC Conditions**: see US-3 VCC above
**Evidence References**: none yet — `spec-complete`
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

**Reused components (unchanged) — no new spec written here; see `knowgrph-agentic-travel-agencies-prd-tad-adr.md` v0.6.0 for full component specs, interfaces, and VCC conditions**: Shared Canvas Node Store, Guardrail Gate, Flight Discovery Harness, Shopping Discovery Harness, Issuance Service, Settlement Verifier, Self-Custody Wallet Interface, Wallet-Linking Service, Notification Dispatcher. This document introduces no changes to any of their interfaces, dependencies, or VCC conditions, and re-derives no new Evidence References for them.

### Component Inventory

| Layer | Component | Local rung | Delivered rung | Source |
|---|---|---|---|---|
| Edge | Agent Registry/Router | `spec-complete` | `undocumented` | this document |
| Edge | Agent Definition Validator | `spec-complete` | `undocumented` | this document |
| Edge | Marketplace Registry Canvas | `spec-complete` | `undocumented` | this document |
| Edge | Shared Canvas Node Store | `dev-proven` | `undocumented` | inherited, travel doc v0.6.0 |
| Edge | Guardrail Gate | `dev-proven` | `undocumented` | inherited, travel doc v0.6.0 |
| Harness | Flight Discovery Harness | `spec-complete` | `undocumented` | inherited, travel doc v0.6.0 |
| Harness | Shopping Discovery Harness | `spec-complete` | `undocumented` | inherited, travel doc v0.6.0 |
| Harness | Issuance Service | `dev-proven-fail-closed` | `undocumented` | inherited, travel doc v0.6.0 |
| Harness | Settlement Verifier | `dev-proven` | `undocumented` | inherited, travel doc v0.6.0 |
| Self-Custody | Self-Custody Wallet Interface | `spec-complete` | `undocumented` | inherited, travel doc v0.6.0 |
| Edge | Wallet-Linking Service | `schema-only` | `undocumented` | inherited, travel doc v0.6.0 |
| Harness | Notification Dispatcher | `schema-only` | `undocumented` | inherited, travel doc v0.6.0 |

### Deploy Boundary Register

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement | State |
|---|---|---|---|---|---|---|
| Sandbox-to-Mirror *(reused governance)* | Authoring | Mirror | none yet — no build started against this document | Merge only through protected Integration Gate / PR; direct `main` push forbidden by `agentic-canvas-os/docs/RELEASE-WORKFLOW.md` | Revert candidate branch or protected merge commit before production authorization | `pending-protected-integration` |
| Mirror-to-Delivery *(reused governance)* | Mirror | Delivery | no protected production authorization receipt yet | Deploy only the exact candidate digest authorized by an authenticated human reviewer in the protected GitHub `production` environment | Use immutable rollback/publish workflow for prior authorized candidate | `closed` |
| **[new]** Agent Registration: declarative-allowlist → routable | Authoring | Mirror | none yet — Agent Definition Validator not yet built | Register only agents whose Agent Definition passes the ACOS Invocation Surface Contract schema check; no manual routing-table edits outside the Validator's pass path | Remove the agent's entry from the routing table; no funds-in-flight risk since registration itself moves no money | `closed` |

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

## Platform Roadmap: Toward a Full-Fledged Agentic Commerce Platform

This document's MVP (Phase 1) proves the router primitive with two internally-controlled agents. The phases below sequence the remaining payments/fintech and AI-agent-ecosystem hackathon-ideation items as increments on the **same** reused substrate — Guardrail Gate, Shared Canvas Node, Issuance Service, and Settlement Verifier stay fixed across every phase; each phase's delta is named explicitly, per the min-pivot-max-value discipline applied throughout this document.

| Phase | Feature | Reuse | Delta (new work) | Priority rationale (ROI) |
|---|---|---|---|---|
| **1 — this document** | Agent Marketplace / Orchestration Hub | Guardrail Gate, Shared Canvas Node, Issuance Service, Settlement Verifier, Notification Dispatcher, both Discovery Harnesses | Agent Registry/Router, Agent Definition Validator, Marketplace Registry Canvas | **Must** — everything downstream depends on proving the router works domain-agnostically at $0 marginal infra cost |
| **2** | Agent Trust & Verification Registry | ACOS Invocation Surface Contract, Avalanche (already-adopted network) | On-chain attestation of agent identity/capability as a precondition for routing | **Should** — turns ADR-2's honest gap into a real guarantee; unlocks opening registration beyond internally-controlled agents |
| **2** | Agentic Checkout Copilot (generalized web-agent Discovery) | Full Funding→Discovery→Issuance→Execution lifecycle, Agent Registry/Router | A generic DOM/web-agent Discovery Harness registered as a third marketplace agent — any e-commerce site, not just Atlas/eBay | **Should** — proves the primitive is genuinely domain-agnostic beyond the two harnesses this document ships with |
| **3** | Disposable-Identity Card Issuance-as-a-Service | Issuance Service (StraitsX MCP), Agent Registry/Router's allowlist pattern | Expose Issuance Service itself as a callable MCP tool other teams' agents can invoke directly, not just route through | **Could** — repositions Knowgrph from "an app with agents" to "infra other agents transact through"; higher build cost than Phase 2 items since external callers need their own auth/allowlist scoping |
| **3** | Spend-Policy Guardrails Agent | Guardrail Gate, Self-Custody Wallet Interface, Avalanche | On-chain escrow/spending-limit smart contract gating card issuance on programmable policy (merchant category, cap, time window) | **Could** — resolves the travel-agencies document's US-5 honest gap (no enforcement point for Path-A guardrails) as a platform-wide capability rather than a one-off fix |
| **4** | Multi-Agent Split-Pay / Group Wallet | Shared Canvas Node, Settlement Verifier | Multiple principal-agents each fund a slice of one transaction; Avalanche settles proportional shares | **Won't (this platform increment)** — real multi-party coordination logic, no pilot demand signal yet to justify build cost |
| **4** | Spend Audit & Explainability Agent | On-chain Avalanche logs, git-as-SSOT provenance philosophy | Post-hoc agent reconstructing Funding→Discovery→Issuance→Execution into a human-readable audit trail | **Won't (this platform increment)** — the compliance/trust counterpart to Phase 2's Trust Registry; sequenced after real transaction volume exists to audit |

Phases are dependency-ordered, not calendar-committed. Phase 2 items unlock the honest gaps this document and its predecessor state outright — ADR-2's allowlist-only trust boundary here, and the travel-agencies document's US-5 enforcement gap there — so they carry the next-highest ROI rather than the split-pay or audit items, which need real transaction volume before their build cost is justified.

---

## Alignment Note (condensed)

This document is now an implementation-lane checkpoint — v0.2.0, authored 2026-08-19, with local Evidence References from the commerce lane. Coverage ratio remains 10 PRD-template fields + 7 TAD-template fields + 3 ADRs — **20/20** artifact-bearing template sections present. `local_rung: dev-proven` applies only to the new platform components and their helper surfaces; reused components inherit whatever rung they already carry in `knowgrph-agentic-travel-agencies-prd-tad-adr.md` v0.6.0 rather than being re-claimed here. `delivered_rung` remains `undocumented` until protected integration and Cloudflare publication complete.

### Latest Progress — 2026-08-19

- Implemented the deterministic Agent Definition Validator, Agent Registry/Router, Marketplace Registry Canvas projection, MCP invocation surface, revalidation gate, pending offline queue, session log, startup config checks, payment caller guard, and deploy-boundary checks in `agent/trae/knowgrph-agentic-commerce`.
- Added property, unit, process, scan, and integration coverage for routing exclusivity, registration gate behavior, definition round-trip, registry projection, CRDT confluence, payment ordering, credential non-propagation, malformed definitions, idempotent registration, no-match totality, unrecognized-agent rejection, offline queue order, no schema retention, MCP surface, and runtime wiring.
- Focused validation passed with `npm run check:agentic-commerce-platform` on the commerce lane.
- Canonical `main` remains the protected integration target; direct local `main` mutation and direct Prod/Cloudflare deployment are not treated as evidence until the protected workflow publishes and verifies them.

### Next Steps

1. Push the commerce lane and open or update the protected pull request into canonical `main`.
2. Run the repository integration gates on the PR branch, including commerce platform checks plus affected CI for touched root/package/test/doc surfaces.
3. After protected checks pass, merge through the repository-owned integration path; do not direct-push `main`.
4. Run Dev deployment using the repository-defined Cloudflare commands and capture read-back evidence before any production promotion.
5. Promote to Prod/Cloudflare only through the protected production authorization workflow, then update `delivered_rung` from `undocumented` to the evidence-backed rung.
6. After integration is preserved, remove the residual commerce worktree/lane and keep only canonical `main` plus any active review branch required by policy.
7. Open Phase 2's on-chain trust-attestation scoping (ADR-2) as a dedicated design pass after Phase 1's protected integration evidence exists.
