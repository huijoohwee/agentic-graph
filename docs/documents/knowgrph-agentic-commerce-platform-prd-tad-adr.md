---
title: "AgenticGraph Commerce Platform — Agentic B2C Marketplace Storefront & Orchestration Hub, with Platform Roadmap"
doc_type: "Combined PRD/TAD/ADR"
version: "0.9.0"
date: "2026-08-26"
lang: "en-US"
owner: "Solo Founder / AI Orchestrator"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "agent/trae/agentic-graph-commerce"
universal_scope: false
---

# AgenticGraph Commerce Platform — Combined PRD/TAD/ADR (Agentic B2C Storefront Edition)

**Conformance note**: this document authors against `prd-tad-adr-guidelines.md` v1.7.0. `universal_scope: false` for the same reason as its source document — this names real chosen dependencies, not swappable neutral examples — and each is still introduced under "reference implementation" per the Scope & Neutrality Contract. `local_rung: dev-proven` applies only to the three components this document introduces (Agent Registry/Router, Agent Definition Validator, Marketplace Registry Canvas) plus their invocation, offline, payment-ordering, and deploy-boundary helper surfaces; every reused component below inherits whatever rung it already carries in `agentic-graph-travel-agencies-prd-tad-adr.md` v0.6.0 — this document claims no new proof for old components, only new scope. `delivered_rung` stays `undocumented` until the protected Dev → Prod/Cloudflare release workflow publishes and verifies the integrated branch.

**Revision note (v0.2.0 — implementation lane)**: the `agent/trae/agentic-graph-commerce` lane now contains the deterministic Agent Definition Validator, Agent Registry/Router, Marketplace Registry Canvas projection helpers, MCP invocation surface, revalidation gate, pending offline queue, session log, startup/deploy boundary checks, and property/process/unit/integration tests. The lane preserves the same platform generalization goal as v0.1.0 — promoting the Funding → Discovery → Issuance → Execution lifecycle already proven and spec'd for one vertical (travel) into a domain-agnostic marketplace substrate — while adding local runtime evidence before protected integration.

**Revision note (v0.4.0 — monetization model)**: this document previously deferred any fee model entirely (see the old "Won't (this increment): Marketplace fee/monetization model" row). That default was never neutral — an unspecified fee model can't be tested or refuted. This revision adds a Monetization Model to the Feature section, a new Take-Rate Calculator component (Phase 1, `spec-complete`), and ADR-5 documenting the mechanism choice. It does **not** claim a validated paying customer exists yet — Streams 2 and 3 are explicitly gated on customer segments (registered third-party agents; external infra customers) that don't exist until Phase 2/3, and Stream 1's own gap (no external Shopper volume yet) is stated rather than hidden. See Monetization Model and ADR-5 for the honest gaps.

**Revision note (v0.5.0 — breakthrough rubric assessment)**: this revision adds a formal self-assessment against an external four-level "breakthrough rubric" (L1 common practice → L4 major breakthrough), reframed around this document's *actual* domain object — a multi-vendor cart/session, not an itinerary, since this document has no travel-leg dependency structure at all. The honest finding: this document currently sits **pre-L1** for that object — there is no live change-detection loop on anything a shopper is holding, only dispatch-time and settlement-time checks. This revision does not build the fix; it names the gap precisely (Breakthrough Rubric Assessment, below), adds the missing components to the Platform Roadmap with an explicit Rubric Rung column, and adds ADR-6 documenting the decision to reuse — not reinvent — the dependency-graph primitives already `spec-complete` in the sibling document `knowgrph-agentic-travel-commerce-platform-prd-tad-adr.md` v1.1.0. No existing Evidence Reference, ADR, or inherited rung is altered.

**Revision note (v0.6.0 — data & platform layer, clean-slate decision)**: this document has never formally named its own relational data layer or ruled on PostgreSQL — ADR-4 rejected Postgres for the storefront-concurrency problem specifically, but left the general question open, and every component added since (Take-Rate Calculator, ADR-6's reused Cart Graph Store/Calculation Engine/Envelope Ledger) has been silently assuming *some* structured store without naming one. This revision closes that gap with ADR-7: **D1 for relational structured data, Durable Objects + Yjs CRDT for live/offline-first state, KV for ephemeral cache, Markdown + git for the durable audit trail — Cloudflare remains the primary platform, PostgreSQL is not adopted.** This is a clean-slate confirmation, not a reversal of anything already built: no existing Evidence Reference, ADR, or inherited rung is altered, and no component shipped before this revision changes its storage target. The Topology table and dependency list below are updated to make D1's role explicit rather than implicit.

**Revision note (v0.7.0 — billing/revenue ledger for Monetization Streams 2/3)**: ADR-7 named this document's general data layer but didn't address Stripe-driven billing state specifically — recurring subscriptions, invoices, dunning/retry on failed payments, proration on plan changes — which Monetization Model Streams 2 and 3 both need once either has a real customer. This revision adds ADR-8: **D1 first** for that ledger, using the same Marketplace D1 Store ADR-7 already named, with an explicit, narrowly-scoped migration trigger to Postgres via Supabase — specifically to adopt Stripe's own officially-maintained Sync Engine — if and when billing volume actually justifies it. Vercel was evaluated as part of this pass and is not adopted for any reason: it duplicates Cloudflare Pages/Workers, already this document's storefront host, with no capability gap it closes. No existing Evidence Reference, ADR, or inherited rung is altered.

**Revision note (v0.8.0 — relational/SQL data layer selection criteria)**: ADR-7 named D1 as the general relational store and ADR-8 named a narrow, Stripe-specific migration trigger to Postgres/Supabase. Neither document named the *criteria* a relational/SQL choice has to satisfy for this platform specifically, which left the door open to picking a provider because it's well-known rather than because it fits. This revision adds ADR-9: a requirements-first survey of the relational/SQL landscape — scored against this platform's own constraints (FOSS-hard-gate, zero-infra Cloudflare-primary, local/offline-first, and the AI-native vector-matching need a heterogeneous agent marketplace actually has) — rather than a vendor-preference pick. It rules several mainstream options out on criteria grounds (license, architecture fit, vendor durability), not on unfamiliarity, and logs one option ADR-7 didn't examine (PGlite) as a genuine spike candidate. No existing Evidence Reference, ADR, or inherited rung is altered; ADR-7's D1 decision and ADR-8's Stripe-specific trigger both stand as written.

**Revision note (v0.9.0 — neutral aggregation layer positioning)**: every prior revision specified plumbing (routing, data layer, monetization mechanism, billing ledger) without ever stating the strategic bet those mechanisms serve. That bet was implicit but never named: this platform succeeds by being the **neutral routing/aggregation/compliance layer other agents and merchants plug into**, structurally analogous to how OpenRouter aggregates foundation-model providers behind one standardized interface and a markup, rather than by building a competing shopping agent that tries to out-reason ChatGPT-, Gemini-, or Amazon-class consumer agents. This revision adds ADR-10 to name that bet explicitly, and updates three existing components to serve it rather than adding new ones: Agent Registry/Router gains a stated (not-yet-built) smart-routing and fallback-dispatch surface so routing can be price/quality/latency-aware rather than a fixed enum, matching what makes an aggregator worth routing through instead of around; Marketplace Registry Canvas gains a stated (not-yet-built) public, Agent-Builder-and-Shopper-facing catalog view alongside its existing operator-only view, since an aggregator's catalog is a demand-generation surface, not just an audit tool; and the Monetization Model's Stream 1 language is tightened to name the mechanism plainly as a markup on routed volume, the same mechanism OpenRouter itself runs. No existing Evidence Reference, ADR, or inherited rung is altered by this revision — every addition here is stated at `spec-complete` or as a named Open Question, honest about being unbuilt, consistent with this document's own discipline throughout.

---

## Feature: Agentic B2C Marketplace Storefront & Agent Orchestration Hub — Unified End-User Retail Substrate

**Strategic positioning (added v0.9.0, see ADR-10)**: this platform is deliberately **not** a competing shopping agent. It does not try to out-reason or out-recommend platform-scale consumer agents (ChatGPT, Gemini, Amazon-style shopping assistants) — that fight has better-capitalized, better-distributed incumbents and is explicitly out of scope. Instead, the bet is the same one OpenRouter made for foundation models: be the **neutral aggregation, routing, and compliance layer** that other agents, merchants, and providers plug into — standardized invocation contract, one catalog, one guardrailed settlement path, a markup on routed volume as the entire business model. Every component below is read against that bet from v0.9.0 forward.

### Problem Statement

The travel-agencies document proved a real, guardrail-enforced, human-confirmed payment lifecycle — but wired it directly into one vertical's Intent Parser and two hand-picked Discovery Harnesses (flights, general comparison shopping). While resolving backend routing, this architecture left a massive execution gap for end-users: it lacked a **Consumer Marketplace Storefront UI**. Users were forced to read raw text streams and interact via technical CLI structures instead of a unified, high-concurrency visual shelf. Furthermore, passing multi-vendor agent updates to a direct web-facing user layer brings immense synchronization risks and visual state breakages. The opportunity is to expand the platform's core to support a **high-scale Consumer Storefront Canvas View**, projecting multi-vendor agent listings, real-time product catalogs, and secure checkout bridge states directly into a polished, mobile-first consumer storefront. This storefront leverages ephemeral CDN caching and row-level visual concurrency to prevent the plain-text Markdown file from causing multi-user state locks during heavy retail traffic.

### Personas

| Persona | Jobs-to-be-done |
|---|---|
| **End-User Consumer / Shopper** | Wants a beautiful, intuitive, high-concurrency digital visual storefront to safely browse agent recommendations, inspect rich item card variants, and trigger safe automated payments with a single tap |
| **Agent Builder / Third-Party Developer** | Wants to register a Discovery agent against a fixed, allowlisted contract, and seamlessly present their agent's discovered products on a public storefront shelf without building a frontend UI |
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

### Monetization Model

**Honest starting point**: this section replaces "deferred indefinitely" with three explicit revenue streams, each tied to a specific customer segment and phase. None has a signed paying customer yet — stated plainly rather than implied otherwise. Illustrative rates below are a pricing hypothesis to validate, not a confirmed price.

**Stream 1 — Settlement Take-Rate / Routed-Volume Markup (Phase 1, ships with this increment)**
- **Customer**: the Shopper-Agent Principal already funding transactions through the existing MVP.
- **Mechanism, named plainly (v0.9.0)**: this is a **markup on routed volume** — structurally identical to how OpenRouter charges a percentage on top of provider token cost for every call it routes, not a fee unique to commerce. A config-driven percentage is computed at Issuance Service call time (Take-Rate Calculator, below) and added on top of the settled StraitsX card amount — no schema change to Issuance Service itself. Naming it this way matters for the aggregation-moat bet (ADR-10): the fee only scales if volume routes *through* this platform rather than around it, which is exactly what the smart-routing and public-catalog surfaces above are meant to earn.
- **Illustrative rate**: 2–3% of settled GMV — in line with typical marketplace/affiliate take-rates, and low enough not to conflict with the guardrail-enforced budget cap already promised to the Principal.
- **Honest gap**: this monetizes the platform's *existing* test/demo transaction flow. It is not yet evidence of real paying demand — that requires at least one Shopper-Agent Principal who is not Joohwee, transacting with their own funded wallet, more than once (tracked as a Success Metric below).

**Stream 2 — Agent Builder Registration/Listing Fee (Phase 2, gated on opening third-party registration)**
- **Customer**: Agent Builders / third-party developers (the persona already defined above) who want their Discovery agent listed on the storefront and receiving routed shopper traffic.
- **Mechanism**: a recurring listing fee (illustrative: SGD 49–99/month) or a lighter revenue-share on the GMV their agent originates — whichever a pilot cohort actually prefers.
- **Honest gap**: there is no one to charge yet — ADR-2's allowlist-only trust boundary means third-party registration isn't open. The nearest real validation available *now*, before more of this gets built, is direct outreach to Agent Builders already active in the Singapore/SEA AI and hackathon community, asking whether they'd pay for storefront distribution.
- **Billing ledger**: once there is someone to charge, the recurring-fee variant of this stream needs a subscription/invoice/dunning state machine — see ADR-8 (D1 first, conditional migration to Postgres/Supabase).

**Stream 3 — Issuance-as-a-Service, B2B infra (Phase 3)**
- **Customer**: other teams' agents that need guardrailed, disposable-identity card issuance (StraitsX/XSGD) without building their own compliance and guardrail stack.
- **Mechanism**: usage-based pricing per issued card or per settled call (illustrative: SGD 0.50–2.00 per call) — infra pricing, not marketplace pricing.
- **Why this is the strongest candidate of the three**: it doesn't require winning consumer distribution against ACP/AP2/UCP-backed players; it only requires being cheaper or faster for a small agent team to integrate than building their own StraitsX/guardrail wiring — a narrower, more winnable claim.
- **Honest gap**: no committed customer exists. Next step is direct conversations with 3–5 candidate agent teams — SG/SEA fintech-adjacent builders are the most plausible first cohort — before more infra gets built on spec.
- **Billing ledger**: per-call usage billing needs idempotent event/invoice tracking, not just the take-rate math — see ADR-8 for why that ledger starts on D1 rather than Postgres.

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
| Take-rate computation correctness (new, Stream 1) | N/A | 100% — VCC passes for every settled transaction | at first Evidence Reference |
| External (non-Joohwee) Shopper-Agent Principals transacting more than once (new) | 0 | ≥ 1 — the actual bar for "real paying customer" evidence on Stream 1, not just a working take-rate calculation | Phase 1 exit |

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
| **Must** | Take-Rate Calculator (Monetization Model Stream 1) | Ships the fee mechanism now instead of deferring indefinitely — $0 new infra, no new customer segment required, testable on the transaction flow this document already has |
| **Won't (this increment)** | Agent Builder registration/listing fee (Monetization Stream 2) | Blocked on Phase 2's trust/registration work — no customer to charge yet |
| **Won't (this increment)** | Issuance-as-a-Service pricing (Monetization Stream 3) | Blocked on Phase 3 infra work — no committed customer yet |

### Min-Viable Scope

Register the two Discovery Harnesses already spec'd in `agentic-graph-travel-agencies-prd-tad-adr.md` (Flight, Shopping) behind one Agent Registry/Router, routed by declared category, both terminating in the same unmodified Guardrail Gate → Shared Canvas Node → Issuance Service → Settlement Verifier → Notification Dispatcher chain. No new external vendor integration is required to prove domain-agnosticism — every dependency needed is already contracted.

### Out of Scope

- Public third-party self-serve onboarding (US-1's trust boundary needs Phase 2 first)
- Full traditional centralized SQL multi-tenant cart framework (relies entirely on ephemeral local-first layout slots)
- On-chain trust/reputation attestation (Platform Roadmap Phase 2)
- Agent Builder registration/listing fee and Issuance-as-a-Service pricing (Monetization Model Streams 2–3) — both gated on customer segments that don't exist until Phase 2/3
- Multi-tenant fund segregation beyond the existing shared/personal CRDT key-scoping
- A third net-new vertical (the MVP proves the pattern with two *existing* verticals, deliberately)

### Dependencies

**Reused unchanged** — see `agentic-graph-travel-agencies-prd-tad-adr.md` v0.6.0 for full specs, none re-derived here: Yjs CRDT inside Cloudflare Durable Objects; StraitsX Card MCP Gateway (`card.straitsx.ai/sandbox/sse`); Avalanche Data API + Snowtrace API; Core.app (Core Wallet); Telegram Bot API; Atlas API (aTriptech); eBay Browse API + PricesAPI.

**New to this document**:
- Invocation Surface Contract / Agent Definition schema + tool allowlist — **reference implementation**: `acos-agentic-runtime-ready-production-verified-prd-tad-adr.md`. Reused, not reinvented, per the FOSS-hard-gate / min-pivot-max-value constraint already established for `agentic-canvas-os`.
- Cloudflare D1 — the relational structured-data layer this document has been implicitly assuming since the Take-Rate Calculator and ADR-6's reused Cart Graph Store/Calculation Engine were added; formally named in v0.6.0 (see ADR-7). Same Cloudflare-native, zero-new-vendor pattern as the Durable Object infra already provisioned — not a new infra category, a named one.

### Open Questions

- Does routing-by-declared-category need a real classifier (an LLM call) or is a fixed enum sufficient at two registered agents? Affects whether the Router stays $0/non-AI or introduces this platform's first token cost.
- Where does the trust/verification boundary actually enforce — client-side inside the registered agent, inside the Router (pre-dispatch check), or an on-chain attestation contract? Same open-question shape as the travel document's Path-A guardrail-placement question; not resolved here, carried into ADR-2 and Platform Roadmap Phase 2.
- Does a registered agent need its own StraitsX-linked funding source, or does every registered agent draw from one operator-controlled wallet? Affects multi-tenant fund segregation before any third-party agent could be onboarded.
- Will any Agent Builder in the SG/SEA hackathon community actually pay a listing fee or accept a revenue-share (Monetization Stream 2) before third-party registration/trust (Phase 2) is built — or does registration have to ship first regardless of monetization? Not resolved here; see ADR-5.

---

## Breakthrough Rubric Assessment: Actual Domain Object

**Rubric** (external, four-level): L1 common practice (detect a change, suggest a fix) → L2 interesting touch (a generative/personalization layer) → L3 notable advance (a firewall reconciling conflicting state across sources before it causes a failure) → L4 major breakthrough (treat the object as a dependency graph, autonomously re-derive every downstream part, settle the resulting financial delta in real time).

**Why "cart," not "itinerary"**: this document has no travel-leg dependency structure anywhere in it — it's a multi-vendor marketplace storefront. The fair object to score against this rubric is what this document actually has: a **shopper's cart/session potentially holding offers from several independently-controlled registered agents at once**.

| Rung | Generalized requirement | Present in this document (pre-v0.5.0)? |
|---|---|---|
| L1 | Detect a live change to an already-displayed offer (price, availability, agent deregistration), suggest a fix | **Not present.** Agent Registry/Router checks registration only at initial dispatch; Ephemeral Catalog Cache is a passive TTL expiry (≤1800s), not a change-detection loop |
| L2 | A generative/personalization layer over the raw multi-agent feed | Not present, not attempted |
| L3 | A firewall reconciling overlapping inventory/state across registered agents before a conflict lands (two agents listing the same underlying SKU; a take-rate double-computation across concurrent sessions) | Not present |
| L4 | Treat the cart as a dependency graph across vendors; autonomously re-derive every affected cart line and re-settle the take-rate delta in real time when one vendor's price/availability/registration changes mid-session | Not present — the prerequisite data model doesn't exist either: no multi-line cart object anywhere in this document. Take-Rate Calculator operates on exactly one settled offer amount, singular |

**Honest headline**: this document doesn't just miss L4 — it hasn't cleared L1 for its own actual domain object, because nothing watches a held offer *after* it's been shown or added to a session. Router dispatches once, Validator checks once at registration, Take-Rate Calculator computes once per settled transaction. This is not a criticism of what this document set out to do (storefront rendering and monetization plumbing are real, necessary work); it's a different axis than the one this rubric scores, named explicitly rather than left unstated.

**The distance is smaller than "not present" suggests.** The dependency-graph engine this would need is already `spec-complete` one document over — `knowgrph-agentic-travel-commerce-platform-prd-tad-adr.md` v1.1.0 built exactly this primitive for travel bundles (Bundle Graph Store, Calculation Engine, Envelope Ledger, Re-optimization Worker). The generalization is a domain relabel plus one genuinely new piece:

| Sibling document's primitive (travel bundle) | This document's cart equivalent | Genuinely new, or reused? |
|---|---|---|
| Bundle Graph Store (`legs`/`edges`, DO-per-`bundle_id`) | Cart Graph Store (`cart_lines`/`edges`, DO-per-`cart_id`) | Reused schema, relabeled — see ADR-6 |
| Calculation Engine (stateless pricing function) | Same component, unchanged | Reused directly — a cart line is a degenerate one-leg bundle |
| Envelope Ledger (atomic per-principal holds) | Same component, unchanged | Reused directly — take-rate becomes one more settlement line |
| Re-optimization Worker (bounded BFS, single net settlement call) | Cart Re-Derivation Worker | Reused pattern, retriggered by a new event source |
| *(none — doesn't exist in either document)* | **Agent State-Change Listener** | **Genuinely new** — nothing today watches a registered agent's price/availability/deregistration state after initial dispatch |

The Platform Roadmap below adds both the reused-and-relabeled components and the one genuinely new component, each tagged with the rubric rung it targets.

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
**Boundaries**: Shopper Browser (mobile-first PWA), Platform Operator Browser (mobile-first PWA), Edge Runtime (Cloudflare Workers/Durable Objects — now including the Marketplace zone), Registered-Agent zone (wherever an Agent Builder runs their own Discovery agent — outside AgenticGraph's trust boundary by design; AgenticGraph never executes third-party agent code, only routes typed intents to it and reads typed offers back), External API zone (unchanged from the travel document — Atlas, StraitsX, Avalanche, Snowtrace, Telegram, none controlled by AgenticGraph).

| Node | Role | Type | Lane | Connects to | Connection type | Data residency |
|---|---|---|---|---|---|---|
| **[new]** Consumer Storefront Canvas | Renderer | Edge UI Surface | Delivery | Shopper Client, Ephemeral Catalog Cache, Agent Registry/Router | Async real-time stream / WebSocket | Edge CDN + Local cache |
| **[new]** Ephemeral Catalog Cache | Cache | KV Store / Worker | Delivery | Consumer Storefront Canvas, Discovery Harnesses | Low-latency read/write | Cloudflare KV (Global Edge) |
| **[new]** Agent Registry/Router | Router | Durable Object | Authoring→Delivery | Discovery Harnesses, Agent Definition Validator, Guardrail Gate, Marketplace Registry Canvas | Sync (registry lookups + dispatch) | Edge (Cloudflare region) |
| **[new]** Agent Definition Validator | Executor | Deterministic component | Authoring | Agent Registry/Router | Sync | Edge (Cloudflare region) |
| **[new]** Marketplace Registry Canvas | Store | CRDT (Durable Object) | Delivery | Agent Registry/Router, Operator Client | Async stream | Edge (Cloudflare region) |
| **[new, v0.6.0]** Marketplace D1 Store | Store | Relational (Cloudflare D1) | Authoring→Delivery | Take-Rate Calculator, Cart Graph Store (ADR-6 reuse), Agent Registry/Router (audit log), Billing/Revenue Ledger for Monetization Streams 2/3 (`customers`, `subscriptions`, `invoices`, `dunning_retries` — ADR-8) | Sync (SQL read/write) | Edge (Cloudflare region) |
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
    AR[Agent Registry / Router
NEW]
    ADV[Agent Definition Validator
NEW]
    MRC[Marketplace Registry Canvas
NEW — Yjs CRDT / Durable Objects]
    GG[Guardrail Gate — reused, unmodified]
    SCN[Shared Canvas Node Store — reused, unmodified]
  end
  subgraph Agents["Registered-Agent zone (outside AgenticGraph trust boundary)"]
    FDH[Flight Discovery Harness
reused — Atlas API]
    SDH[Shopping Discovery Harness
reused — eBay Browse API + PricesAPI]
    THIRD[future third-party agent
Platform Roadmap Phase 2]
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

**Runtime diagram**: as above. **Version notes**: v0.1.0 — first appearance of the Marketplace zone (Agent Registry/Router, Agent Definition Validator, Marketplace Registry Canvas) and the Operator Client role; every other node and edge is carried over unmodified from `agentic-graph-travel-agencies-prd-tad-adr.md` v0.6.0's runtime diagram, re-drawn here rather than diffed against it since this is a new document, not an increment.

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

**Component**: Consumer Storefront Canvas *(new)*
**Responsibility**: Projects raw multi-agent discovery payloads into a beautiful, reactive, high-performance visual catalog interface for retail end-users. Resolves card data streams into user-clickable item slots.
**Interfaces**: Streams live JSON-LD schema layouts over WebSockets to mobile-first PWAs; reads product item specifications from the Ephemeral Catalog Cache.
**Dependencies**: Shopper Client, Ephemeral Catalog Cache, Agent Registry/Router
**Configuration**: Storefront theme, asset CDN routes, and retail localization settings.
**FOSS / Vendor**: FOSS — React / Tailwind compiled to static Edge targets running over Cloudflare Pages.
**VCC Conditions**: `Verify zero display lag or text overlap on storefront visual cards under a simulated load of 5,000 concurrent shopper page-views.`
**Readiness rung**: Local: `dev-proven` / Delivered: `undocumented`

**Component**: Ephemeral Catalog Cache *(new)*
**Responsibility**: Safeguards the core Markdown Single Source of Truth (SSOT) from heavy user read spikes by caching transient product catalog data at the Cloudflare Edge layer.
**Interfaces**: Read/write key-value endpoints for agents to stream newly discovered offers into.
**Dependencies**: Consumer Storefront Canvas, Discovery Harnesses
**Configuration**: TTL parameters (defaults to 1800s), cache invalidation policies.
**FOSS / Vendor**: Cloudflare KV Store.
**VCC Conditions**: `Verify zero direct filesystem reads hit the underlying Markdown `.md` document for repeat catalog browsing requests within the designated cache TTL window.`
**Readiness rung**: Local: `dev-proven` / Delivered: `undocumented`

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

**Smart/neutral routing surface *(new, v0.9.0, `spec-complete` — not yet built; see ADR-10)***
**Responsibility**: Extends the current fixed-enum category match with a scored dispatch decision across every registered agent whose declared category matches a given intent — price, declared latency/SLA, and (once Marketplace Registry Canvas's trust/verification status is real per Phase 2/ADR-2) trust score as ranking inputs — so a Shopper or downstream caller is routed to the best-fit registered agent among several, not just the single agent an enum happens to name. This is the mechanism that makes routing *through* this platform worth more than routing around it, the same role OpenRouter's price/latency-aware routing plays for model calls.
**Interfaces**: reads the same registered-agent routing table Agent Registry/Router already reads; adds a ranking/scoring pass before dispatch instead of a first-match lookup
**Honest gap**: this has no build behind it and no Evidence Reference. At two registered agents in two non-overlapping categories, there is nothing to rank — this surface only becomes meaningful once ≥2 registered agents can serve the *same* category, which requires Phase 2's opened registration (ADR-2) first. Stated here as the target shape, not claimed as delivered.
**Fallback dispatch *(new, v0.9.0, `spec-complete` — not yet built)***: today, if a matched agent fails to respond, the Router's only documented behavior is the existing "no-match" state (see Open Questions) — there is no retry-to-next-best-registered-agent logic. An aggregator's reliability case depends on this existing; it is named here as a gap to close, not something this revision builds.
**Readiness rung (smart routing + fallback dispatch)**: Local: `spec-complete` / Delivered: `undocumented`

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

**Public catalog view *(new, v0.9.0, `spec-complete` — not yet built; see ADR-10)***
**Responsibility**: A second, read-only projection of the same underlying registry state — public-facing rather than operator-only — listing registered agents' declared category, capability summary, and (once real, per Phase 2/ADR-2) trust/verification badge, browsable by Shoppers and prospective Agent Builders. This is the demand-generation half of the aggregator bet: an OpenRouter-style public model catalog is itself a distribution channel, not just an internal audit tool, and today's operator-only scope forecloses that entirely.
**Interfaces**: same CRDT source as the existing operator view, projected through a public-read key scope instead of an operator-scoped one; explicitly does **not** expose the operator-only fields (raw tool allowlist internals, any Agent Builder contact/billing data)
**Honest gap**: no build, no Evidence Reference, and a real prerequisite gap ahead of it — publicly listing agents implies a public-facing claim about trust/verification, and ADR-2's allowlist-only enforcement is not yet a claim this document is willing to make to a public audience (see ADR-2's own "must not be marketed as one until Phase 2 lands"). This view should not ship before Phase 2's trust work, even though the projection itself is cheap to build.
**Readiness rung (public catalog view)**: Local: `spec-complete` / Delivered: `undocumented`

**Component**: Take-Rate Calculator *(new)*
**Responsibility**: Computes the config-driven take-rate value against a settled offer amount before the unmodified Issuance Service call fires; attaches the computed take amount to the transaction record for later Settlement Verifier reconciliation.
**Interfaces**: reads offer amount from Guardrail Gate's pass event; reads take-rate config (platform-default or per-agent override) from Agent Registry/Router; writes computed take amount alongside the transaction record Issuance Service already produces
**Dependencies**: Guardrail Gate (upstream), Issuance Service (downstream, unmodified call signature)
**Configuration**: platform-default take-rate percentage; optional per-agent override (e.g., a promotional 0% rate for a pilot Agent Builder)
**FOSS / Vendor**: FOSS — deterministic, non-AI component; $0 infra, same Durable Object pattern already used elsewhere in this document
**Token Budget**: N/A (non-AI)
**VCC Conditions**: `Verify the computed take amount for every settled transaction equals (settled offer amount × configured take-rate), with zero transactions where Issuance Service fires before a take-rate computation exists in that session's log`
**Evidence References**: none yet — `spec-complete`
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

**Component**: Agent State-Change Listener *(new, v0.5.0 — the one genuinely new component identified by the Breakthrough Rubric Assessment)*
**Responsibility**: Subscribes to each registered agent's post-dispatch offer state (price, availability, deregistration) and emits a change event when any of these shift after an offer has already been shown to or held by a shopper. This is the prerequisite L1 capability neither this document nor its predecessors have built — everything downstream (Cart Graph Store, Cart Re-Derivation Worker) depends on this event existing.
**Interfaces**: subscribes to Agent Registry/Router's dispatch log for which offers are currently "live" in a session; polls or subscribes to each registered agent's Discovery Harness for state deltas on those specific offers only (not a blanket re-poll of the whole catalog)
**Dependencies**: Agent Registry/Router (source of which offers are currently held), Marketplace Registry Canvas (deregistration signal)
**Configuration**: poll interval or webhook registration per agent category, externalized rather than hardcoded
**FOSS/Vendor**: FOSS — plain Cloudflare Worker on a scheduled trigger or subscription, no new vendor
**Token Budget**: $0.00 — deterministic state comparison, no model call
**VCC Conditions**: `Verify every held offer's price/availability/registration-status change surfaces a change event within one poll interval, and zero change events are emitted for offers no longer held by any active session`
**Evidence References**: none yet — `spec-complete`
**Readiness rung**: Local: `spec-complete` / Delivered: `undocumented`

**Cross-document reuse (v0.5.0) — not respecified here; see `knowgrph-agentic-travel-commerce-platform-prd-tad-adr.md` v1.1.0 for full specs**: Cart Graph Store (that document's Bundle Graph Store, schema reused with `bundle_id`/`legs` relabeled `cart_id`/`cart_lines` — same `template`-flag dimension, same ~20-node scale boundary, same flat-tables-not-a-graph-database discipline per that document's ADR-4), Calculation Engine (unchanged — a cart line is a degenerate one-leg bundle in exactly that document's own "Shop is the degenerate case of Travel" sense), Envelope Ledger (unchanged), Cart Re-Derivation Worker (that document's Re-optimization Worker, retriggered by Agent State-Change Listener's new event instead of a Shared Canvas Node mutation). See ADR-6 for why this is reuse rather than a local reimplementation.

**Reused components (unchanged) — no new spec written here; see `agentic-graph-travel-agencies-prd-tad-adr.md` v0.6.0 for full component specs, interfaces, and VCC conditions**: Shared Canvas Node Store, Guardrail Gate, Flight Discovery Harness, Shopping Discovery Harness, Issuance Service, Settlement Verifier, Self-Custody Wallet Interface, Wallet-Linking Service, Notification Dispatcher. This document introduces no changes to any of their interfaces, dependencies, or VCC conditions, and re-derives no new Evidence References for them.

### Component Inventory

| Layer | Component | Local rung | Delivered rung | Source |
|---|---|---|---|---|
| Edge | Agent Registry/Router | `spec-complete` | `undocumented` | this document |
| Edge | Agent Registry/Router — smart/neutral routing + fallback dispatch | `spec-complete` | `undocumented` | this document, v0.9.0 |
| Edge | Agent Definition Validator | `spec-complete` | `undocumented` | this document |
| Edge | Marketplace Registry Canvas | `spec-complete` | `undocumented` | this document |
| Edge | Marketplace Registry Canvas — public catalog view | `spec-complete` | `undocumented` | this document, v0.9.0 |
| Edge | Take-Rate Calculator | `spec-complete` | `undocumented` | this document |
| Edge | Agent State-Change Listener | `spec-complete` | `undocumented` | this document, v0.5.0 |
| Edge | Cart Graph Store, Calculation Engine, Envelope Ledger, Cart Re-Derivation Worker | `spec-complete` | `undocumented` | cross-document reuse, `knowgrph-agentic-travel-commerce-platform-prd-tad-adr.md` v1.1.0 |
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

## ADR-4: Ephemeral Edge Caching for the Consumer Storefront (Preventing Markdown File-Locks)
**Status**: Proposed
**Date**: 2026-08-24

### Context
Transitioning to a high-traffic Consumer Marketplace Storefront creates a major technical challenge: plain-text Markdown files lack row-level transactional database locking. If thousands of public consumers hit the visual storefront simultaneously to browse or buy products, reading and writing live states directly to a single Markdown file would cause serious file-system read/write collisions and completely stall the agent runtime.

### Decision
Introduce an **Ephemeral Catalog Cache layer (built over Cloudflare KV)**. All registered discovery agents write their real-time catalog listings, inventory snapshots, and product offers directly to this low-latency edge cache. The **Consumer Storefront Canvas** displays items directly from this cache. The core Markdown SSOT is only read or modified when a consumer initiates a concrete checkout, tracking final order parameters inside the `flow.nodes[]` graph layer.

### Alternatives Considered
1. **Direct Markdown Reading**: Pros — Maintains absolute text purity; Cons — Completely fails under minor retail traffic due to file access bottlenecks.
2. **Migrate Everything to PostgreSQL**: Pros — Standard enterprise commerce pattern; Cons — Completely breaks Airvio's core design principles, inducing vendor lock-in and eliminating Git-diffable data tracking.

### Rationale
Maintains the architectural integrity of the Markdown SSOT while scaling to consumer retail traffic volumes. Cloudflare KV guarantees sub-10ms global reads for storefront visitors without putting load on the local project directory.

### TCO Impact
- **Infra cost**: Near-$0 (utilizing the generous Cloudflare Workers / KV free tier).
- **Ops burden**: Low; requires setting up simple cache eviction timeframes (1800-second default TTL).

### Consequences
- **Positive**: Enables a lightning-fast, consumer-ready retail storefront interface.
- **Negative**: Visual product availability might drift by a few seconds due to cache timing discrepancies.
- **Neutral**: Keeps transactional logic cleanly separate from browsing logic.

---

## ADR-5: Monetization Mechanism — Settlement Take-Rate vs. Registration Fee vs. Subscription
**Status**: Proposed
**Date**: 2026-08-25

### Context
This document previously deferred any fee model. Deferring indefinitely isn't neutral — it silently assumes the platform is free infrastructure, foreclosing any test of whether someone would pay. Three mechanisms were available for the Phase 1 increment specifically: a take-rate on settled transactions, a flat registration/listing fee, or a consumer subscription.

### Decision
Ship a settlement take-rate (Take-Rate Calculator component) for Phase 1, since it's the only mechanism that doesn't require a customer segment that doesn't exist yet — it monetizes the transaction flow the MVP already has, rather than requiring third-party registration (Phase 2) or infra customers (Phase 3) to be onboarded first. Registration fees and Issuance-as-a-Service pricing are logged as Phase 2/3 candidates, explicitly gated on demand validation this document does not claim to have (see Monetization Model, Streams 2–3).

### Alternatives Considered
1. **Flat Agent Builder registration/listing fee now**: Pros — simple, predictable revenue if it works; Cons — there are no registered third-party agents yet (ADR-2's trust boundary is unresolved), so this would charge a customer segment that doesn't exist in this increment.
2. **Consumer subscription (Shopper pays for premium curation/priority routing)**: Pros — recurring revenue, no per-transaction friction; Cons — no evidence a Shopper would pay a subscription for a two-agent marketplace with no unique catalog advantage yet; highest customer-acquisition burden of the three options for a solo-dev project with no consumer distribution.
3. **Defer again (status quo)**: Pros — no execution risk; Cons — this is the choice this document is explicitly reversing, since an unspecified fee model can't be tested or refuted.

### Rationale
Matches this document's own min-pivot-max-value discipline: the take-rate needs one new deterministic $0 component and zero new customers to test, versus the other two options which both require solving a harder problem — third-party trust, or consumer distribution — before a single dollar could be charged.

### TCO Impact

| Dimension | Chosen: Settlement Take-Rate | Alt: Registration Fee | Alt: Consumer Subscription |
|---|---|---|---|
| Infra cost | $0 (one new deterministic Durable Object component) | $0, but blocked on Phase 2 trust work | $0, but needs billing/subscription infra not yet built |
| Ops burden | Low (no new customer relationship to manage) | Medium (agent-builder billing relationships) | Medium-high (consumer billing, churn, support) |
| Time-to-first-dollar | Immediate — works on Phase 1's existing two agents | Blocked until Phase 2 registration ships | Blocked until real consumer distribution exists |

### Consequences
- **Positive**: testable now, with the transaction flow this document already has; doesn't require winning distribution against ACP/AP2/UCP-backed players first.
- **Negative**: at MVP scale (two internally-controlled agents, no external Shopper volume yet), the take-rate has nothing real to tax — it's revenue-model plumbing proven correct, not revenue proven real. That gap is stated in Monetization Model Stream 1, not hidden.
- **Neutral**: doesn't foreclose Streams 2/3 — the take-rate config is designed to coexist with a later registration fee or infra-usage fee once those customer segments actually exist.

---

## ADR-6: Cross-Document Reuse of the Dependency-Graph Engine (Cart) vs. a Local Reimplementation
**Status**: Proposed
**Date**: 2026-08-25

### Context
The Breakthrough Rubric Assessment identifies a real gap: this document has no dependency-graph model for a shopper's cart, which blocks any honest L3/L4 claim. A structurally identical engine — flat `legs`/`edges` tables, a stateless Calculation Engine, a hold-based Envelope Ledger, a bounded-BFS re-derivation worker — already exists, `spec-complete`, in the sibling document `knowgrph-agentic-travel-commerce-platform-prd-tad-adr.md` v1.1.0, built for travel bundles.

### Decision
Reuse that engine directly for the cart domain, relabeling `bundle_id`/`legs` to `cart_id`/`cart_lines` and retriggering it from a new event source (Agent State-Change Listener) instead of building a second, cart-specific dependency-graph implementation.

### Alternatives Considered
1. **Build a cart-specific dependency-graph engine locally**: Pros — no cross-document dependency to track; Cons — this is precisely the "two unsynchronized copies" anti-pattern named in this document's own Problem Statement and reaffirmed in ADR-1 — a second BFS-over-flat-tables implementation, a second stateless pricing function, a second hold-based ledger, all solving the identical problem the sibling document already solved.
2. **Wait for a future "shared primitives" package/library extraction before building either domain's cart/bundle logic further**: Pros — a formal shared package would remove the cross-document pointer entirely; Cons — real extraction work with no concrete driver yet at two call sites; premature abstraction the same way TiDB was correctly declined for a scale problem not yet present.

### Rationale
Directly extends the "new consumer of an existing dependency, not a new dependency" logic used in ADR-1 and ADR-3 of this document, and in ADR-1/ADR-4/ADR-5 of the sibling document — now applied *across* documents rather than within one, which is a natural extension of the same discipline, not a new one.

### TCO Impact

| Dimension | Chosen: cross-document reuse | Alternative: local reimplementation | Alternative: wait for shared package |
|---|---|---|---|
| Infra cost | $0 (same Durable Object patterns already budgeted in the sibling document) | $0 infra, but duplicated schema/logic to maintain | $0, but blocks both domains on unscoped extraction work |
| Ops burden | Low — one engine, two domain relabels | Medium — two engines to keep behaviorally identical over time | Medium-high — extraction work has no deadline pressure to actually happen |
| Correctness risk | Low (proven pattern, single source of truth) | Medium (schema/logic drift between the two implementations over time) | Low once done, but "once done" has no committed timeline |

### Consequences
- **Positive**: closes the L4 gap at genuinely low build cost — this is a domain relabel plus one new trigger source, not a from-scratch dependency-graph build.
- **Negative**: this document now has a real cross-document dependency; a future breaking change to Bundle Graph Store's schema in the sibling document must be checked against this document's Cart Graph Store usage before shipping either independently.
- **Neutral**: if a third domain ever needs the same dependency-graph pattern, that's the point at which formal package extraction (Alternative 2) stops being premature and starts being justified — not before.

---

## ADR-7: Data Layer & Platform Layer — D1 + Durable Objects + KV Native, Cloudflare Primary (Clean-Slate Decision)
**Status**: Proposed
**Date**: 2026-08-25

### Context
This document has never named its own relational data layer. ADR-4 rejected PostgreSQL, but scoped narrowly to the storefront-concurrency problem ("Migrate Everything to PostgreSQL" as an alternative to the Ephemeral Catalog Cache) — it never ruled on the general question. Since then, three components have been added that all implicitly assume *some* structured, queryable store without one being named: the Take-Rate Calculator (ADR-5), and the reused Cart Graph Store/Calculation Engine/Envelope Ledger (ADR-6, pulled in from the sibling `knowgrph` document, where the equivalent tables — `bundle_rules`, and the marketplace layer's `vendor`/`commission_rules`/`vendor_ledger_split` — are already specified against Cloudflare D1). For a clean-slate build, this document should name its data layer explicitly rather than inheriting one by implication from a sibling document's choices.

### Decision
Four-way division of work, none of it new infrastructure:

| Layer | Component | Handles |
|---|---|---|
| Relational/structured data | **Cloudflare D1** (SQLite) | Take-rate transaction history, Agent Registry audit log, and — via ADR-6's reuse — the Cart Graph Store's `cart_lines`/`edges` tables and the marketplace layer's `vendor`/`commission_rules`/`vendor_ledger_split` tables |
| Live collaborative / offline-first state | **Durable Objects + Yjs CRDT** | Marketplace Registry Canvas, Shared Canvas Node Store — already reused unmodified elsewhere in this document; the existing "pending offline queue" (Latest Progress log) already covers reconnection replay, so this document's offline-first requirement is already met without a second database |
| Ephemeral cache | **Cloudflare KV** | Ephemeral Catalog Cache (ADR-4), unchanged |
| Durable audit trail | **Markdown + git** | The SSOT commit written once per completed checkout, per ADR-4's own description — never in the hot path |

PostgreSQL is **not adopted**, for the general case as well as the storefront-specific one ADR-4 already ruled on. Cloudflare remains the primary platform (Workers + Pages + D1 + Durable Objects + KV + R2 + Queues); no external platform was found to offer an equivalent to a Durable Object's single-instance, in-order mutation serialization, which the Guardrail Gate and Envelope Ledger depend on structurally.

### Alternatives Considered
1. **PostgreSQL via Cloudflare Hyperdrive + an external provider (Neon/Supabase)**: technically reachable, but Cloudflare never hosts the Postgres server itself — it always runs on someone else's infra, under a bill that grows with traffic. This is the same vendor-lock-in and Git-diffability loss ADR-4 already named for the narrower storefront-concurrency case; the general case fails for an identical reason.
2. **Turso / Turso Database** (MIT, SQLite-compatible, now supporting concurrent writes and experimental Postgres-wire-protocol access, with genuine on-device embedded replicas): the closest real alternative, and arguably a more literal match for "offline-first" than D1, which has no on-device mode. Not adopted — this document's offline-first surfaces are already served by the CRDT + pending-offline-queue combination; adding Turso would mean operating two SQLite-family systems to solve a problem already solved. Logged as a deliberately deferred option, not a rejected one, should on-device relational querying (joins/filters, not just CRDT merge) become a real requirement.
3. **Fly.io as the primary platform** (real VMs at the edge, could host Postgres and stateful processes natively): would reintroduce VM-level ops — patching, scaling, machine placement — that this document's zero-ops Workers/DO model was chosen specifically to avoid, for no capability this document currently lacks.
4. **A separate D1 table for the Marketplace Registry Canvas instead of the CRDT extension already chosen in ADR-3**: not reopened here — ADR-3 already made this call and ADR-7 doesn't revisit component-level choices already settled, only the previously-unnamed general data-layer question.

### Rationale
D1 gives this document the one thing it was missing — a named, queryable relational store — without adding a new infra category, a new vendor, or a new bill that scales independently of Cloudflare's. Every alternative surveyed either lacks the Durable Object-equivalent serialization guarantee this document's money-handling components depend on, or reintroduces exactly the externally-hosted dependency ADR-4 already excluded for a narrower case. This decision applies identically to whichever document — this one or the sibling `knowgrph`/`agent-graph` document — needs a relational table next; both already converge on D1 independently, and ADR-6's cross-document reuse means they now share the same data-layer answer as well as the same graph engine.

### TCO Impact

| Dimension | Chosen: D1 + DO + KV, Cloudflare-primary | Alt: Postgres via Hyperdrive | Alt: Turso alongside D1 |
|---|---|---|---|
| Infra cost | $0 at this document's current scale — one bill, one dashboard, same Durable Object provisioning already budgeted | $0 Hyperdrive fee, but a recurring external Postgres bill scaling with traffic | $0 (generous free tier), but a second database system to operate |
| Ops burden | Low — no servers, no connection pooling, no second vendor relationship | Medium — a second vendor whose outages are independent of Cloudflare's | Low-medium — additive complexity, not operational burden per se |
| Correctness guarantee for money-handling logic | High — DO serialization is structural, already proven for Guardrail Gate/Envelope Ledger | Requires re-deriving the same guarantee via Postgres transactions | N/A — doesn't touch the money-handling path |
| Premature-build risk | None — D1 closes a gap this document already has (an unnamed structured store) | High — no unmet need currently justifies it | Medium — real capability, no current requirement |

### Consequences
- **Positive**: this document's data layer is now fully named end to end (Markdown/git, CRDT/DO, KV, D1) instead of three of the four being explicit and the fourth implied; converts ADR-4's narrow Postgres rejection into a standing, general answer this document and its siblings can both cite going forward.
- **Negative**: forgoes Postgres's richer feature set (window functions, full-text search extensions, JSONB) — a deliberate trade, not an oversight; reopen this ADR if a future component has a hard requirement only Postgres satisfies.
- **Neutral**: no existing Evidence Reference, ADR, or inherited rung changes — this is a naming and confirmation pass over data-layer decisions already made piecemeal, not new build scope. Turso remains logged as a known, evaluated, deliberately deferred option.

---

## ADR-8: Billing/Revenue Ledger for Monetization Streams 2/3 — D1 First, Conditional Migration to Postgres/Supabase
**Status**: Proposed
**Date**: 2026-08-26

### Context
ADR-7 named this document's general data layer (D1 for relational/structured data) but didn't address Stripe-driven billing state specifically. Once Monetization Stream 2 (Agent Builder registration/listing fee) or Stream 3 (Issuance-as-a-Service usage pricing) has an actual customer, that customer's Stripe activity — a recurring subscription, a per-call usage invoice, a failed-payment retry, a mid-cycle plan change — has to be tracked reliably. This ledger has three jobs neither StraitsX nor Avalanche do: **relational, transactional storage** (subscription and invoice rows with strong consistency, not CRDT-merged documents); **idempotent webhook/event handling** (Stripe redelivers webhooks, so the same `event_id` must never be applied twice); and **state-machine logic** (a subscription moves through `active` → `past_due` → `canceled`; an invoice moves through `draft` → `open` → `paid`/`void`; a failed charge needs a bounded dunning-retry counter; a plan change needs a proration calculation) — none of which the Take-Rate Calculator's single-settlement-amount model was built to hold.

### Decision
Use the Marketplace D1 Store ADR-7 already named for this ledger — add `customers`, `subscriptions`, `invoices`, and `dunning_retries` tables alongside the take-rate/audit tables already provisioned there. A Stripe webhook Worker verifies each event's signature, then inserts against a unique constraint on `event_id` (idempotency: `INSERT ... ON CONFLICT (event_id) DO NOTHING`) before updating the relevant `subscriptions`/`invoices` row's status column — the same flat-relational-tables, no-new-infra-category discipline ADR-7 already established, applied to a fourth table set rather than a new store.

**Conditional migration trigger** (not a default, not scheduled): if billing volume, or a reporting/reconciliation need, ever genuinely exceeds what hand-rolled D1 queries handle comfortably — cross-customer revenue rollups, churn/dunning dashboards, joins against usage data at a scale D1's SQLite model starts to strain under — migrate specifically this ledger (not the rest of the platform) to Postgres via Supabase, in order to adopt Stripe's own Sync Engine. That tool moved from Supabase's repo into Stripe's own in April 2026, after a one-click Supabase-dashboard integration shipped in December 2025: it mirrors Stripe customers/subscriptions/invoices/payments into Postgres via webhooks plus scheduled backfill, with the idempotency and state-machine handling already built and maintained by Stripe's own engineers. **Why Postgres specifically, not "any SQL store"**: that Sync Engine targets Postgres — it doesn't exist for D1 or SQLite — so the migration trigger is really "the point where reusing a maintained pipeline beats maintaining a hand-rolled one," not a claim that D1 becomes structurally wrong at some size.

**Vercel**: evaluated and not adopted, for either the billing ledger or anything else in this document. It duplicates Cloudflare Pages/Workers, which already hosts the Consumer Storefront Canvas, without closing any capability gap — the actual gap was always the missing relational/transactional layer for billing, which Vercel doesn't provide either (it would still need Supabase or another Postgres provider behind it). Adopting it would add a second hosting vendor for no new capability, working against the single-Cloudflare-host principle ADR-7 already re-affirmed.

### Alternatives Considered
1. **Postgres/Supabase from the start**: Pros — immediate access to the maintained Stripe Sync Engine, SQL joins/aggregations for revenue reporting from day one; Cons — a second vendor and a second bill before there's a single Stream 2/3 customer to justify it (both are still pre-outreach per the Monetization Model's own honest gaps) — the same premature-infra reasoning ADR-7 already used to decline Postgres for the general case applies here with equal force.
2. **Hand-roll the same guarantees on Durable Objects instead of D1**: Pros — reuses the CRDT/DO pattern already proven for Guardrail Gate and Envelope Ledger; Cons — a subscription/invoice ledger doesn't need CRDT merge semantics (there's one writer — the webhook handler — not multiple concurrent editors), so this would be forcing a collaborative-document primitive onto a plain transactional-row problem D1 already fits better.
3. **Defer the billing ledger entirely until a customer exists**: Pros — zero build cost now; Cons — this document's own Monetization Model already commits to outreach happening before more infra gets built (see Streams 2/3), and outreach conversations go better with a working, demonstrable billing flow behind them than a promise to build one later.

### Rationale
Matches ADR-7's own logic one level down: D1 closes the gap this ledger actually has (no relational, idempotent, stateful store) at zero new infra cost, while the conditional trigger keeps the door open to Postgres/Supabase's superior *ecosystem fit for Stripe specifically* — without paying for that ecosystem before volume exists to justify it. This is the same "new consumer of an existing dependency, not a new dependency" discipline ADR-1, ADR-3, and ADR-7 already apply, extended to a fourth table set on the same store.

### TCO Impact

| Dimension | Chosen: D1 first (this ADR) | Alt: Postgres/Supabase from the start | Alt: defer entirely |
|---|---|---|---|
| Infra cost | $0 — same Marketplace D1 Store already provisioned (ADR-7) | $0 Supabase free tier initially, but a second vendor bill once volume grows | $0, but no billing flow to show during Stream 2/3 outreach |
| Ops burden | Low — one webhook Worker, four new tables on an existing store | Medium — a second vendor relationship, connection/project management | None yet, but defers the same work to a less-informed later date |
| Time-to-maintained-tooling | None initially — idempotency/state-machine logic is hand-written | Immediate — Stripe's own Sync Engine handles sync/idempotency out of the box | N/A |
| Premature-build risk | Low — reuses an already-decided store, small incremental table set | Medium-high — a second vendor before a paying customer exists for Stream 2 or 3 | None, but blocks outreach on a promise rather than a demo |

### Consequences
- **Positive**: Stream 2/3 outreach can point to a working billing flow instead of a roadmap slide; no new vendor or bill added before either stream has a real customer; stays inside every constraint ADR-7 already set.
- **Negative**: forgoes the maintained Stripe Sync Engine until the migration trigger fires — dunning/state-machine logic on D1 is hand-written and must be kept correct by this project, not by Stripe's own engineers, until that point.
- **Neutral**: this ADR doesn't reopen ADR-7's general Postgres rejection — it names the one specific, narrowly-scoped condition (Stripe ecosystem tooling, Postgres-only) under which migrating *this ledger alone* would be worth revisiting, exactly as ADR-7 already logged Turso as deliberately deferred rather than rejected outright.

---

## ADR-9: Relational/SQL Data Layer — Selection Criteria for an AI-Native Agentic Commerce Marketplace (Not a Vendor Preference)
**Status**: Proposed
**Date**: 2026-08-26

### Context
ADR-7 named D1 as the general relational store and ADR-8 named a narrow, Stripe-specific trigger to Postgres/Supabase. Both were the right calls, but neither named the criteria a relational/SQL choice has to satisfy for *this* platform — an AI-native, agentic commerce marketplace where independently-registered agents plug into a shared router (ADR-1), trust is still allowlist-only (ADR-2), and a shopper's cart is (per the Breakthrough Rubric Assessment) heading toward a real dependency-graph model. Without stated criteria, any future relational decision risks being made because a provider is well-known rather than because it fits — exactly the failure mode ADR-7 and ADR-8 avoided by naming their reasoning explicitly. This ADR does the same for the general landscape, once, so it doesn't have to be re-litigated per-provider each time a new option becomes popular.

### Decision
Score any relational/SQL candidate — present or future — against five criteria specific to this platform, in this priority order:

| # | Criterion | Why it matters *for this platform specifically* |
|---|---|---|
| 1 | **FOSS-hard-gate (MIT/Apache-2.0 self-hostable core)** | Governing constraint across every airvio project — a source-available or time-delayed-open license doesn't satisfy it, regardless of technical merit |
| 2 | **Zero-infra / Cloudflare-primary fit** | ADR-7's standing decision; a candidate that requires a second always-on infra category (VMs, a second region topology) reintroduces exactly the ops burden Workers/D1/DO were chosen to avoid |
| 3 | **Local/offline-first capability** | The Shopper and Operator PWAs, and the pending-offline-queue pattern already built, are a real requirement — not aspirational — so a candidate that only syncs-eventually from a server is a weaker fit than one that can genuinely run on-device |
| 4 | **AI-native fit: vector/embedding support in the same store** | This platform is a marketplace of heterogeneous, independently-registered agents (ADR-1) — matching shopper intent to agent capability, catalog dedup across registered agents, and the Phase 3 Cross-Agent Reconciliation Firewall all become embedding-similarity problems eventually. A store with native vector support (e.g. pgvector) answers this in one system; a store without one requires bolting on a second product (e.g. Cloudflare Vectorize alongside D1) |
| 5 | **Vendor durability** | A relational store is load-bearing infrastructure for money-handling components (Take-Rate Calculator, Envelope Ledger, ADR-8's billing ledger) — a provider that could shut down or pivot (as Gel/EdgeDB's Cloud did in January 2026) is a worse bet than a widely-adopted one, independent of feature comparison |

Applying these five criteria to the current landscape:

| Candidate | 1. FOSS-hard-gate | 2. Zero-infra/CF-primary | 3. Local/offline-first | 4. AI-native (vector) | 5. Vendor durability | Verdict |
|---|---|---|---|---|---|---|
| **Cloudflare D1** (current, ADR-7) | Pass — SQLite core | Pass — native Cloudflare product | Partial — no on-device mode; relies on DO/CRDT for that today | Fail — no vector type; would need Vectorize as a second product | Pass — Cloudflare, already the primary platform | **Stays the default** — nothing here beats it on criteria 1–2 |
| **PGlite** (Electric, WASM Postgres) | Pass — Apache-2.0 | Pass — runs in a Worker/browser, no new always-on infra | Pass — genuinely on-device, not sync-eventually | Pass — pgvector + PostGIS built in | Pass — backed by Electric, an active FOSS project | **Only candidate passing all five** — logged as a spike, not a switch (see Consequences) |
| **Neon** (Postgres-as-a-service) | Partial — storage engine Apache-2.0; managed service is proprietary SaaS, same vendor-pattern as StraitsX/Stripe | Fail — externally-hosted, reintroduces ADR-7's named vendor-lock-in concern | Fail — server-only, no on-device mode | Pass — native pgvector | Pass — mainstream, well-funded | Correct pick **only if** ADR-8's trigger fires *and* the reason is Postgres/vector-search generally rather than Stripe specifically |
| **Supabase** (Postgres-as-a-service) | Partial — same as Neon | Fail — same as Neon | Fail — same as Neon | Pass — native pgvector | Pass — mainstream | Correct pick **only if** ADR-8's trigger fires and the reason is specifically the Stripe Sync Engine (ADR-8's own scope) |
| **CockroachDB** | **Fail** — current versions are BSL (source-available), not MIT/Apache-2.0; only converts to Apache-2.0 after ~4 years | Fail — VM/cluster ops or paid Cloud, not zero-infra | Fail — server-only | Partial — has extensions, not a natural fit | Pass | **Ruled out on criterion 1 alone** — no technical merit changes this |
| **PlanetScale (Postgres)** | Fail — managed-only, not open | Fail — externally-hosted | Fail — server-only | Partial — Neki engine has inconsistent pgvector/extension behavior per its own docs | Pass | **Ruled out** — built for MySQL/Vitess-scale write-sharding this platform doesn't need, and its Postgres layer isn't native Postgres |
| **Convex** | **Fail** — closed-source runtime, no open core at all | Fail — external platform | Partial — has offline support, but not SQL | Fail — not a relational/SQL store, so it's a category mismatch for this comparison regardless | N/A | **Ruled out** — fails criterion 1 more thoroughly than any Postgres-as-a-service option, and isn't SQL to begin with |
| **Xata** | Pass — Apache-2.0 core, self-hostable | Fail — managed service is externally-hosted | Fail — server-only | Pass — pgvector plus built-in search | Partial — relaunched its product model in 2025, free tier already retired once (Feb 2026) | **Not recommended currently** — no documented need for its search differentiator, and its go-to-market has already changed once |
| **Gel (fka EdgeDB)** | Pass (self-hosted OSS project) | Fail — no Cloudflare-native path | Fail — server-only | Partial | **Fail** — its Cloud offering shut down January 2026, team joined Vercel | **Ruled out on criterion 5** — the exact durability risk this criterion exists to catch |

### Rationale
This reframes ADR-7 and ADR-8's already-correct decisions as instances of a general rule, rather than one-off calls: pick against this platform's own five criteria, not against a provider's popularity, feature-list length, or marketing. It also produces a testable prediction — anyone proposing a new relational/SQL provider to this document in the future should score it against the same table above, and the table should be extended, not re-derived from scratch.

### TCO Impact

| Dimension | D1 (status quo) | PGlite (spike candidate) | Neon/Supabase (conditional, per trigger) |
|---|---|---|---|
| Infra cost | $0, already provisioned | $0 — runs inside existing Workers/browser runtime, no new billed resource | $0 initially, recurring bill once past free tier |
| Build cost to evaluate | None — no change | Low — a scoped spike (e.g. porting one read-heavy component) against a WASM Postgres runtime already shipping stable releases | None until ADR-8's trigger or a real vector-search requirement fires |
| Risk if wrong | None — already proven for existing components | Low — spike-scoped, reversible, no production commitment implied | Medium — a second vendor relationship, so ADR-8's own reasoning already treats this as deferred, not default |

### Consequences
- **Positive**: future relational/SQL decisions on this platform — including any pressure to adopt whatever's trending — now have a stated, five-criterion bar to clear, in explicit priority order, instead of being argued fresh each time.
- **Positive**: identifies PGlite as a genuine spike candidate ADR-7 didn't examine — it is the only option that passes all five criteria simultaneously, specifically *because* it's real Postgres running on-device rather than a hosted service synced to. This is logged as a spike to evaluate (e.g., against one existing read-heavy, local-first surface), not a decision to migrate anything — D1 remains the shipped default per ADR-7 until a spike produces actual evidence.
- **Negative**: this ADR doesn't resolve which of Neon or Supabase to use if ADR-8's trigger fires — that remains conditional on *why* it fires (Stripe-specific → Supabase; general Postgres/vector-search → Neon), which is itself a criteria-driven answer, not a default preference for either.
- **Neutral**: ADR-7's D1 decision and ADR-8's Stripe-specific migration trigger are both unchanged by this ADR — this is a criteria layer sitting above both, not a revision of either.

---

## ADR-10: Strategic Positioning — Neutral Aggregation/Routing Layer vs. Competing Shopping Agent
**Status**: Proposed
**Date**: 2026-08-26

### Context
This document has always been architecturally an aggregator — Discovery Harnesses are thin wrappers over external APIs, the Router dispatches rather than reasons, no component in this document independently recommends or negotiates on a shopper's behalf. But that positioning was never stated as a deliberate strategic choice, which left it ambiguous whether "Agentic Checkout Copilot" (Platform Roadmap Phase 2) meant *extending the aggregation pattern to a new Discovery source* or *building a competing consumer shopping agent* against platform-scale incumbents (ChatGPT-, Gemini-, Amazon-class assistants) with orders of magnitude more distribution and capital. Those are different bets with different competitive sets, and conflating them risks scoping Phase 2 work against the wrong competitor.

### Decision
This platform commits to being a **neutral aggregation, routing, and compliance layer that other agents, merchants, and providers plug into** — never a competing shopping agent that tries to out-reason or out-recommend a platform-scale consumer assistant. Concretely: every Discovery capability this document adds (including Phase 2's "Agentic Checkout Copilot") is scoped as *another registered agent behind the Router*, using the same Agent Definition Validator contract as Flight/Shopping Discovery today — never as a standalone consumer-facing agent competing on judgment or recommendation quality. The moat this document is betting on is the same one OpenRouter runs on: one standardized invocation contract (Agent Definition/Invocation Surface Contract), one browsable catalog (Marketplace Registry Canvas + its new public view), neutral routing across registered providers (Agent Registry/Router + its new smart-routing surface), and a markup on routed volume (Take-Rate Calculator) as the entire business model — not proprietary recommendation intelligence.

### Alternatives Considered
1. **Build a differentiated consumer shopping agent (better recommendations, personalization, negotiation)**: Pros — a real product differentiator if it worked; Cons — this is precisely the fight named in the earlier gap analysis (drill-down #4.2) as the one to avoid — platform-scale incumbents already have distribution, capital, and data advantages a solo-dev project cannot match. Pursuing this would also duplicate, not complement, the third-party Discovery Harnesses this document already depends on.
2. **Stay ambiguous, let each new Discovery Harness decide its own positioning ad hoc**: Pros — no upfront constraint; Cons — this is the same "unspecified default isn't neutral" reasoning ADR-5 already used to reject deferring the fee model indefinitely — an unstated positioning can't be tested, defended, or used to scope Phase 2 work consistently, and risks accidentally building 4.2-style competing-agent scope under the "Agentic Checkout Copilot" label.
3. **Position as a vertical-specific booking agent (e.g., travel-only) rather than a horizontal aggregator**: Pros — narrower, possibly easier to reach depth-of-integration in one category; Cons — abandons the domain-agnostic router thesis this entire document (v0.1.0 onward) was built to prove, and the MVP's own Min-Viable Scope explicitly already proves two non-travel-exclusive categories.

### Rationale
This is the same "reuse an existing dependency, don't build a competing one" discipline already applied throughout this document (ADR-1's router-not-reimplementation, ADR-3's CRDT-extension-not-new-store, ADR-6's cross-document engine reuse) — extended from a component-level discipline to the platform's overall competitive stance. It also matches the honest conclusion this document's own Monetization Model already reached independently: Stream 3 (infra/issuance-as-a-service) was picked as "the strongest candidate of the three" specifically *because* it avoids competing for consumer distribution against ACP/AP2/UCP-backed players. ADR-10 generalizes that same reasoning to the platform's entire positioning, not just Stream 3.

### TCO Impact

| Dimension | Chosen: Neutral aggregation layer | Alt: Competing shopping agent | Alt: Vertical-specific booking agent |
|---|---|---|---|
| Build cost | Low incremental — smart routing and public catalog are extensions of existing components, not new agent-intelligence R&D | Very high — recommendation/personalization/negotiation intelligence is a genuinely different, much larger engineering problem | Medium — narrower scope than horizontal, but forecloses the router thesis already invested in |
| Competitive exposure | Low against 4.2-class incumbents (different game entirely); real exposure only on trust/catalog quality vs. other aggregators | Very high — direct fight against better-capitalized, better-distributed platforms | Medium — competes with incumbent OTAs/vertical players instead |
| Consistency with prior ADRs | High — directly extends ADR-1/ADR-3/ADR-6's reuse discipline and Stream 3's own reasoning | Low — reintroduces the "two unsynchronized copies" anti-pattern at platform-positioning scale | Medium — doesn't contradict prior ADRs, but abandons the domain-agnostic thesis they were written to prove |

### Consequences
- **Positive**: gives every future Discovery Harness (including Phase 2's Agentic Checkout Copilot) an unambiguous scoping rule — registered agent behind the Router, never a standalone competing consumer agent — closing the ambiguity this ADR was written to resolve.
- **Negative**: explicitly forecloses building any proprietary recommendation/personalization layer as a differentiator; if aggregation-layer economics alone prove insufficient (e.g., if registered-agent supply never materializes past two internally-controlled agents), this document has no fallback differentiation strategy named.
- **Neutral**: does not change any existing component's spec beyond the two additive, honestly-unbuilt surfaces named in this revision (smart routing, public catalog) — Take-Rate Calculator's mechanism is unchanged, only its description is sharpened.

---

## Platform Roadmap: Toward a Full-Fledged Agentic Commerce Platform

This document's MVP (Phase 1) proves the router primitive with two internally-controlled agents. The phases below sequence the remaining payments/fintech and AI-agent-ecosystem hackathon-ideation items as increments on the **same** reused substrate — Guardrail Gate, Shared Canvas Node, Issuance Service, and Settlement Verifier stay fixed across every phase; each phase's delta is named explicitly, per the min-pivot-max-value discipline applied throughout this document.

| Phase | Feature | Rubric rung | Reuse | Delta (new work) | Priority rationale (ROI) |
|---|---|---|---|---|---|
| **1 — this document** | Consumer Marketplace Storefront | *Pre-L1 — no live offer-change detection exists yet (see Breakthrough Rubric Assessment)* | Guardrail Gate, Shared Canvas Node, Issuance Service, Settlement Verifier, Notification Dispatcher, both Discovery Harnesses | Agent Registry/Router, Agent Definition Validator, Consumer Storefront Canvas, Ephemeral Catalog Cache, Take-Rate Calculator (Monetization Stream 1) | **Must** — bridges backend multi-vendor routing with a beautiful, high-concurrency visual storefront interface for public shoppers, and ships the fee mechanism rather than deferring it |
| **2** | Agent Trust & Verification Registry | *N/A — trust axis, orthogonal to this rubric* | ACOS Invocation Surface Contract, Avalanche (already-adopted network) | On-chain attestation of agent identity/capability as a precondition for routing; unlocks Agent Builder registration/listing fee (Monetization Stream 2) once trust is real | **Should** — turns ADR-2's honest gap into a real guarantee; unlocks opening registration beyond internally-controlled agents, and unlocks Stream 2's customer segment |
| **2** | Agentic Checkout Copilot (generalized web-agent Discovery) | *N/A — coverage axis, orthogonal to this rubric* | Full Funding→Discovery→Issuance→Execution lifecycle, Agent Registry/Router | A generic DOM/web-agent Discovery Harness registered **as a third marketplace agent behind the Router** (per ADR-10 — never a standalone competing consumer agent) — any e-commerce site, not just Atlas/eBay | **Should** — proves the primitive is genuinely domain-agnostic beyond the two harnesses this document ships with, without crossing into ADR-10's excluded competing-agent fight |
| **2** *(v0.9.0)* | Smart/neutral routing (price/latency/trust-aware dispatch) | *N/A — aggregation-moat axis, orthogonal to this rubric* | Agent Registry/Router | Ranking/scoring pass across multiple same-category registered agents; only meaningful once ≥2 agents share a category, which needs Phase 2 registration open first | **Should** — this is the mechanism that makes routing *through* the platform worth more than routing around it (ADR-10); low build cost, but has a hard prerequisite (registration volume) it cannot get ahead of |
| **2** *(v0.9.0)* | Fallback dispatch on registered-agent failure | *N/A — reliability axis, orthogonal to this rubric* | Agent Registry/Router's existing "no-match" state | Retry-to-next-best-registered-agent logic instead of a bare no-match | **Should** — an aggregator's reliability case depends on this; currently undocumented behavior, not just unbuilt |
| **2** *(v0.9.0)* | Public marketplace catalog view | *N/A — distribution axis, orthogonal to this rubric* | Marketplace Registry Canvas | Public-read projection of registry state for Shoppers/prospective Agent Builders — the demand-generation half of the aggregator bet | **Should**, sequenced strictly after Phase 2's trust work (ADR-2) — publicly listing agents implies a trust claim this document isn't willing to make on allowlist-only enforcement |
| **2** *(v0.5.0)* | Agent State-Change Listener | **L1** | Agent Registry/Router (dispatch log), Marketplace Registry Canvas (deregistration signal) | New scheduled/subscription Worker watching held offers' price/availability/registration state post-dispatch — the prerequisite nothing above L1 is reachable without | **Must** — the single highest-leverage new component in this revision; every rung above L1 is blocked until this exists |
| **2** *(v0.5.0)* | Cart Graph Store + Cart Re-Derivation Worker | **L4** | Bundle Graph Store, Calculation Engine, Envelope Ledger, Re-optimization Worker — all cross-document reuse from `knowgrph-agentic-travel-commerce-platform-prd-tad-adr.md` v1.1.0 (see ADR-6) | Domain relabel (`cart_id`/`cart_lines` for `bundle_id`/`legs`), wired to Agent State-Change Listener's new event as trigger source instead of a travel-bundle mutation; Take-Rate Calculator calls Calculation Engine instead of computing inline | **Should** — the largest single rubric-rung jump available in this document, gated strictly on the Listener existing first; genuinely small build cost since the dependency-graph engine itself is already `spec-complete` elsewhere |
| **3** | Disposable-Identity Card Issuance-as-a-Service | *N/A — monetization axis, orthogonal to this rubric* | Issuance Service (StraitsX MCP), Agent Registry/Router's allowlist pattern | Expose Issuance Service itself as a callable MCP tool other teams' agents can invoke directly, not just route through; usage-based pricing per call (Monetization Stream 3) | **Could** — repositions AgenticGraph from "an app with agents" to "infra other agents transact through"; higher build cost than Phase 2 items since external callers need their own auth/allowlist scoping; strongest paying-customer candidate of the three streams (see Monetization Model) |
| **3** | Spend-Policy Guardrails Agent | *N/A — enforcement axis, orthogonal to this rubric* | Guardrail Gate, Self-Custody Wallet Interface, Avalanche | On-chain escrow/spending-limit smart contract gating card issuance on programmable policy (merchant category, cap, time window) | **Could** — resolves the travel-agencies document's US-5 honest gap (no enforcement point for Path-A guardrails) as a platform-wide capability rather than a one-off fix |
| **3** *(v0.5.0)* | Cross-Agent Inventory/Take-Rate Reconciliation Firewall | **L3** | Cart Graph Store's edge model (new "shared-inventory" edge type) | Detect two registered agents referencing the same underlying inventory/SKU across concurrent sessions; reconcile before a double-commit or double-charge | **Could** — sequenced strictly after Cart Graph Store exists (Phase 2); this is the rubric's L3 rung, filled in after L4 rather than before it, since L4's Cart Graph Store is the reused, low-build-cost win and L3 requires genuinely new cross-session reconciliation logic |
| **4** | Multi-Agent Split-Pay / Group Wallet | *N/A — coordination axis, orthogonal to this rubric* | Shared Canvas Node, Settlement Verifier | Multiple principal-agents each fund a slice of one transaction; Avalanche settles proportional shares | **Won't (this platform increment)** — real multi-party coordination logic, no pilot demand signal yet to justify build cost |
| **4** | Spend Audit & Explainability Agent | *N/A — compliance axis, orthogonal to this rubric* | On-chain Avalanche logs, git-as-SSOT provenance philosophy | Post-hoc agent reconstructing Funding→Discovery→Issuance→Execution into a human-readable audit trail | **Won't (this platform increment)** — the compliance/trust counterpart to Phase 2's Trust Registry; sequenced after real transaction volume exists to audit |

**Note on rubric-rung sequencing**: L4 (Cart Graph Store) is reachable before L3 (Reconciliation Firewall) here specifically because L4's engine is reused, not built from scratch — the rubric's own numbering describes difficulty in the general case, not the build-cost-adjusted order for *this* platform, where the hard dependency-graph work already happened once, elsewhere.

Phases are dependency-ordered, not calendar-committed. Phase 2 items unlock the honest gaps this document and its predecessor state outright — ADR-2's allowlist-only trust boundary here, and the travel-agencies document's US-5 enforcement gap there — so they carry the next-highest ROI rather than the split-pay or audit items, which need real transaction volume before their build cost is justified.

---

## Alignment Note (condensed)

This document is now an implementation-lane checkpoint — v0.9.0, authored 2026-08-26, with local Evidence References from the commerce lane. Coverage ratio: 10 PRD-template fields + 7 TAD-template fields + 10 ADRs (ADR-5 added in v0.4.0 for the monetization mechanism; ADR-6 added in v0.5.0 for cross-document dependency-graph reuse; ADR-7 added in v0.6.0 for the data/platform layer decision; ADR-8 added in v0.7.0 for the billing/revenue ledger decision; ADR-9 added in v0.8.0 for criteria-driven relational/SQL data-layer selection; ADR-10 added in v0.9.0 for neutral-aggregation-layer strategic positioning) + 1 Breakthrough Rubric Assessment — **28/28** artifact-bearing template sections present. `local_rung: dev-proven` applies only to the platform components and helper surfaces built in the commerce lane; the v0.5.0 additions (Agent State-Change Listener, and the cross-document Cart Graph Store/Calculation Engine/Envelope Ledger/Cart Re-Derivation Worker pointers), the v0.6.0 addition (Marketplace D1 Store), the v0.7.0 addition (Billing/Revenue Ledger tables and Stripe webhook Worker), and the v0.9.0 additions (Agent Registry/Router's smart-routing + fallback-dispatch surface, Marketplace Registry Canvas's public catalog view) sit at `spec-complete` — none of this revision's new scope has been built yet, only named and reuse-mapped. ADR-9 introduces no new component — it is a selection-criteria layer over ADR-7/ADR-8's existing decisions, so it carries no rung of its own. ADR-10 likewise introduces no new component of its own — it is a strategic-positioning layer that the two v0.9.0 component additions serve, so it carries no rung of its own either. Reused components inherit whatever rung they already carry in `agentic-graph-travel-agencies-prd-tad-adr.md` v0.6.0 or `knowgrph-agentic-travel-commerce-platform-prd-tad-adr.md` v1.1.0 rather than being re-claimed here. `delivered_rung` remains `undocumented` until protected integration and Cloudflare publication complete.

### Latest Progress — 2026-08-19

- Implemented the deterministic Agent Definition Validator, Agent Registry/Router, Marketplace Registry Canvas projection, MCP invocation surface, revalidation gate, pending offline queue, session log, startup config checks, payment caller guard, and deploy-boundary checks in `agent/trae/agentic-graph-commerce`.
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
8. Before building Stream 2 or Stream 3 monetization work, validate demand directly — outreach to Agent Builders in the SG/SEA hackathon community (Stream 2) and 3–5 candidate agent teams for Issuance-as-a-Service (Stream 3) — rather than building further on an unvalidated assumption.
9. Build Agent State-Change Listener first among the v0.5.0 additions — it is the L1 prerequisite everything else in the Breakthrough Rubric Assessment depends on, and the smallest of the new components.
10. Port Cart Graph Store from the sibling document only after the Listener has a working Evidence Reference — porting the engine before there's a live trigger event to feed it would validate nothing.
11. Treat any future schema change to Bundle Graph Store in `knowgrph-agentic-travel-commerce-platform-prd-tad-adr.md` as a breaking-change check against this document's Cart Graph Store usage before shipping either independently (per ADR-6).
12. Provision the Marketplace D1 Store (per ADR-7) as part of the same migration pass that ports Cart Graph Store (Next Step 10) — same table set the sibling document already specifies (`vendor`, `commission_rules`, `vendor_ledger_split`, plus this document's own take-rate history and agent registry audit tables) — rather than standing up D1 schema twice across the two documents.
13. Add the `customers`/`subscriptions`/`invoices`/`dunning_retries` tables and the Stripe webhook Worker (per ADR-8) to that same Marketplace D1 Store provisioning pass, once — and only once — Monetization Stream 2 or 3 outreach (Next Steps already implied by the Monetization Model's honest gaps) produces an actual candidate customer to bill; building the ledger before outreach would validate nothing.
14. Spike PGlite (per ADR-9) against one existing read-heavy, local-first surface — e.g. the Ephemeral Catalog Cache's read path — as a bounded, reversible evaluation, not a migration commitment. If it doesn't clearly outperform the current D1 + KV split for that surface, close the spike and keep D1 as-is; ADR-7's decision doesn't change by default.
15. Scope every future Discovery Harness addition (starting with Phase 2's Agentic Checkout Copilot) explicitly as a registered agent behind the Router per ADR-10 — reject any scope creep toward a standalone competing consumer shopping agent at design-review time, not after build.
16. Build smart/neutral routing (per v0.9.0's addition to Agent Registry/Router) only once Phase 2 registration produces ≥2 registered agents sharing a category — building the ranking/scoring pass earlier would have nothing real to rank, per this revision's own honest gap.
17. Build fallback dispatch (retry-to-next-best-registered-agent) before or alongside smart routing — this closes an existing reliability gap (today's Router has no documented behavior beyond a bare no-match) independent of whether smart routing has shipped yet.
18. Do not ship the Marketplace Registry Canvas's public catalog view until Phase 2's on-chain trust/verification work (ADR-2) lands — publicly listing agents implies a trust claim the current allowlist-only enforcement isn't honest enough to make yet.
