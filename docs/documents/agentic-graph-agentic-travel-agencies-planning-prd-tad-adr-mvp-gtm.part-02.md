---
title: "Reference implementation: agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm section 2"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.6.1"
date: "2026-09-12"
lang: "en-US"
owner: "Solo Founder / AI Orchestrator"
continuity_id: "PLAN-AGENTIC-GRAPH-AGENTIC-TRAVEL-AGENCIES-PRD-TAD-ADR-MVP-GTM"
prd_revision: "0.6.1"
tad_revision: "0.6.1"
adr_revision: "0.6.1"
mvp_revision: "0.6.1"
gtm_revision: "0.6.1"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "481-741"
---

[Combined planning owner](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-AGENTIC-TRAVEL-AGENCIES-PRD-TAD-ADR-MVP-GTM@0.6.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### TCO Impact

| Dimension | Chosen: Atlas API (sandbox) | FOSS Alternative: OpenSky (verification-only) | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0 (sandbox/UAT tier) | $0 | $0 |
| Egress cost | $0 | $0 | $0 |
| Token cost | $0 (non-LLM API) | $0 | $0 |
| Ops burden | Medium (UAT validation flow required before production) | Low | — |
| Vendor risk | Medium (single booking-API dependency; no FOSS fallback exists) | Low | — |

### Consequences
- **Positive**: genuinely bookable fares, documented dedup/void handling directly usable by the Guardrail Gate.
- **Negative**: no FOSS fallback exists — this is a named, accepted vendor dependency, not a gap to be silently tolerated.
- **Neutral**: sandbox coverage of SEA low-cost carriers is unconfirmed (see Open Questions).

---

## ADR-3: Card Issuance via Reference-Implementation Stablecoin Payments API
**Status**: Proposed
**Date**: 2026-08-15

### Context
US-1 and US-2 both need a disposable, exact-amount-scoped payment instrument the Guardrail Gate can trust as unforgeable.

### Decision
Bind the Issuance Service to a regulated stablecoin-funded card product, **reference implementation: StraitsX Cards** (`v1-CARDS`), funded from the existing StraitsX Payment product line.

### Alternatives Considered
1. **Build a custom card-issuance program directly on Avalanche**: Pros — full control; Cons — requires a card-network/regulatory relationship agentic-graph does not have and should not attempt to build for a pilot-scale product.
2. **FOSS alternative — none exists** for regulated card issuance; this is a category where no FOSS substitute is possible by definition (card issuance requires a licensed entity), and that is stated here rather than papered over with a token FOSS comparison.

### Rationale
StraitsX is already the established payments/stablecoin partner across the prior research in this thread; using its Cards product line reuses an existing vendor relationship rather than adding a second regulated-payments dependency.

### TCO Impact

| Dimension | Chosen: StraitsX Cards | FOSS Alternative: none exists (regulated category) | Delta / 12 months |
|---|---|---|---|
| Infra cost | Fee schedule TBD (see Open Questions) | N/A | TBD |
| Egress cost | $0 | N/A | $0 |
| Token cost | $0 (non-LLM) | N/A | $0 |
| Ops burden | Medium (KYC/compliance overhead inherent to the category) | N/A | — |
| Vendor risk | Medium (single regulated-payments dependency) | N/A | — |

### Consequences
- **Positive**: reuses an existing vendor relationship; card-scoping directly satisfies the Guardrail Gate's exact-amount requirement.
- **Negative**: fee schedule at micro-transaction sizes is unconfirmed — this ADR should not be treated as closed until that's resolved (carried forward from the Open Questions in the PRD section above).
- **Neutral**: no FOSS alternative is possible in this category by definition; noting that explicitly satisfies the ADR template's FOSS-comparison requirement without fabricating a comparison that doesn't exist.

---

## ADR-4: Self-Custody Wallet Selection — Core.app (Replacing Generic/MetaMask Assumption)
**Status**: Accepted
**Date**: 2026-08-15

### Context
The Settlement Verifier and any future self-custody flow need a concrete signing-wallet reference implementation. The prior version of this document left the wallet layer implicit.

### Decision
Adopt **Core.app (Core Wallet)** as the reference implementation for self-custody Avalanche C-Chain signing, fully replacing any MetaMask assumption.

### Alternatives Considered
1. **MetaMask**: Pros — broadest general EVM-wallet familiarity; Cons — treats Avalanche-native features (X-Chain/P-Chain, subnets, native bridging) as a generic EVM chain, no first-class support.
2. **FOSS alternative — MetaMask itself** (MIT-derived core, genuinely open-source): functionally near-identical to Core.app for the C-Chain-only, XSGD-transfer use case this document currently specs; the two are not a FOSS-vs-proprietary tradeoff so much as an ecosystem-alignment choice.

### Rationale
No functional difference exists for the flows specced today — both are EVM-compatible, both sign C-Chain transactions identically, and Avalanche Data API verification is wallet-agnostic. Core.app is chosen for forward alignment with Avalanche-native features (subnets, staking, native bridging) that may matter if the roadmap extends past simple transfers — a bet on ecosystem fit, not a technical necessity today.

### TCO Impact

| Dimension | Chosen: Core.app | Alternative: MetaMask (also FOSS-licensed) | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0 (user-side, device-local) | $0 | $0 |
| Egress cost | $0 | $0 | $0 |
| Token cost | $0 (non-AI) | $0 | $0 |
| Ops burden | Low, identical integration surface (EVM standard) | Low | — |
| Vendor risk | Low (Ava Labs-maintained, Avalanche-native) | Low (widest ecosystem support) | — |

### Consequences
- **Positive**: zero technical migration cost since this document never committed to MetaMask in a built artifact — this is a documentation-stage correction, not a rip-and-replace.
- **Negative**: narrower general-audience familiarity than MetaMask; some shoppers may need to install a less-recognized wallet.
- **Neutral**: this ADR does not change custody model, trust model, or any VCC already written — only the named reference implementation.

---

## ADR-5: Dual Settlement Path — On-Chain-Direct (Path A) vs. StraitsX-Mediated Only (Path B)
**Status**: Proposed
**Date**: 2026-08-15

### Context
v0.1.0 implicitly assumed every settlement passes through StraitsX custody. Surfacing Core.app as a first-class wallet exposed a real question: should agentic-graph support paying a merchant directly on-chain when StraitsX custody isn't otherwise needed?

### Decision
Support both paths architecturally (US-5), but scope this increment's **Must/Should** commitment to the *linking* half of Path A only (Wallet-Linking Service, US-5's easier half) and explicitly defer guardrail enforcement for *unlinked* Path-A settlement to a Follow-on increment (see MoSCoW `Won't (this increment)`).

### Alternatives Considered
1. **StraitsX-mediated only, reject Path A entirely**: Pros — one enforcement point (Guardrail Gate), no open enforcement question; Cons — forces every XSGD holder through custodial routing even when a merchant would accept direct payment, defeating a real reason someone holds self-custodied XSGD in the first place.
2. **FOSS alternative — build an on-chain spending-limit smart contract now**: the closest thing to a FOSS-native enforcement point (open-source contract, auditable on-chain); rejected for *this* increment on build-cost grounds, not a compliance verdict — recorded as the likely correct long-term answer to the open question above, not ruled out.

### Rationale
Rejecting Path A outright contradicts the min-viable-max-value lens by removing real user value (self-custody flexibility) to avoid a documentation gap that can instead be stated honestly and deferred. Building the smart-contract enforcement path now is out of proportion to a pilot-stage document with zero Evidence References anywhere yet.

### TCO Impact

| Dimension | Chosen: Support both, defer Path-A enforcement | FOSS Alternative: on-chain spending-limit contract now | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0 | $0 (contract deployment gas only, one-time, negligible) | ~$0 |
| Egress cost | $0 | $0 | $0 |
| Token cost | $0 | $0 | $0 |
| Ops burden | Low now; the deferred question resurfaces as a Follow-on scoping task | Medium now (contract audit, testing) | Shifts burden later vs. now |
| Vendor risk | Low | Low (FOSS, auditable) | — |

### Consequences
- **Positive**: US-5's real value (self-custody flexibility) ships without inventing a false guardrail guarantee.
- **Negative**: Path-A unlinked settlement genuinely has no budget-cap protection today — this must stay visible in every surface that could imply otherwise (PRD Won't-tier, TAD VCC honest-gap note, MoSCoW), not softened in a later revision without new evidence.
- **Neutral**: this decision doesn't foreclose the smart-contract path — it's recorded as the likely Follow-on answer, not discarded.

---

## ADR-6: Card Issuance Transport & Funding Mechanism — Correcting ADR-3
**Status**: Accepted (amends ADR-3, does not replace its vendor decision)
**Date**: 2026-08-15

### Context
ADR-3 (v0.1.0) assumed Issuance Service binds to StraitsX Cards via generic REST, funded from a StraitsX-custodied balance. Direct research into the actual endpoints (`card.straitsx.ai/sandbox/sse`, `card.straitsx.ai/production/sse`) shows the real reference implementation is an **MCP server over SSE**, funded via an **x402/EIP-3009 self-custody-signed** challenge-response, not a custodial-balance debit. The vendor decision in ADR-3 (StraitsX, no FOSS alternative exists) still holds — only the transport and funding mechanism were wrong.

### Decision
Bind Issuance Service to the StraitsX Card MCP Gateway (SSE transport, `get_card_sandbox`/`view_card_sandbox` tools in sandbox), with funding via x402-triggered EIP-3009 signature from the Self-Custody Wallet Interface (Core.app). Treat the sandbox environment as the only confirmed contract; production is scoped `Won't (this increment)` until its tool schema is confirmed (see Open Questions and the Deploy Boundary Register).

### Alternatives Considered
1. **Keep the v0.1.0 generic-REST assumption and build a custom wrapper**: Pros — none identified; Cons — would mean building against an imagined interface instead of the one that actually exists, and discarding the MCP-native fit that's a genuine architectural advantage for an already-MCP-native product.
2. **FOSS alternative**: unchanged from ADR-3 — none exists for regulated card issuance. This ADR only revises *how* the proprietary dependency is called, not whether one is needed.

### Rationale
The MCP/SSE transport is strictly better min-pivot-max-value than a hand-built REST wrapper would have been: agentic-graph's probe-tree already speaks MCP natively, so this harness requires no protocol-translation layer at all — the smallest possible integration surface for the largest possible fit. The x402/EIP-3009 funding mechanism is accepted as discovered, not chosen from alternatives, since it's dictated by the vendor's own gateway design, not a agentic-graph decision point.

### TCO Impact

| Dimension | Chosen: MCP/SSE + x402 (as discovered) | Counterfactual: hand-built REST wrapper around an assumed interface | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0 (sandbox); production TBD pending fee-schedule confirmation | $0 either way | $0 now, TBD later |
| Egress cost | $0 | $0 | $0 |
| Token cost | $0 (non-LLM; MCP tool calls are protocol, not model calls) | $0 | $0 |
| Ops burden | Low — no protocol-translation layer to build or maintain | Medium — would need a REST-to-internal-schema adapter that doesn't correspond to anything the vendor actually exposes | Meaningful reduction |
| Vendor risk | Medium — same single-dependency risk as ADR-3, transport choice doesn't change this | Same | — |

### Consequences
- **Positive**: zero protocol-mismatch risk, since the harness now targets the endpoints and tool names actually documented for this gateway rather than an assumption.
- **Negative**: this ADR surfaces a real scoping gap (per-card cap vs. flight-booking budget) that ADR-3 didn't know existed — that gap is now a `Should`-tier item in MoSCoW rather than something this ADR can resolve on its own.
- **Neutral**: ADR-5's Path-A/Path-B framing is narrowed, not invalidated — Path A (self-custody signing) turns out to be load-bearing for Path B's own funding step in sandbox, which is a more entangled picture than v0.2.0 modeled, and worth remembering the next time this document is revised rather than re-discovering it from scratch.

---

## ADR-7: Notification Channel Selection — Telegram (Primary), WhatsApp (Follow-on), Web Push (Complementary Footnote)
**Status**: Accepted
**Date**: 2026-08-15

### Context
US-6 requires reaching the shopper outside the canvas when a booking's state changes. Several channels were evaluated on cost and SG/MY/SEA reach.

### Decision
Build Notification Dispatcher against **Telegram Bot API** as the primary channel this increment; log WhatsApp Cloud API as a `Should`/`Could`-tier follow-on; note Web Push as a complementary, non-substituting channel in a footnote rather than building it out now; explicitly reject SMS for this use case.

### Alternatives Considered
1. **WhatsApp Cloud API as primary**: Pros — dominant channel in SG/MY/SEA, where most SME customers already are; Cons — Meta business verification and message-template pre-approval cost calendar time (days to weeks), not money, before a single message can send — the same pattern already flagged for TikTok/Instagram elsewhere in this thread's research.
2. **SMS (Twilio-class)**: Pros — universal reach, no app/account needed; Cons — the only channel evaluated with no free tier at any volume, cost from message one — rejected outright for this use case rather than deferred, since transaction confirmations don't need SMS's universal-reach property badly enough to justify being the one paid line item in an otherwise $0 notification layer.
3. **FOSS alternative**: Telegram's Bot API isn't FOSS-licensed itself (it's a free proprietary service, not open-source), but it imposes zero vendor lock-in risk in the way that matters for this document — no fee, no tier, no contract, switchable at will. Web Push (VAPID) is the genuinely open, standards-based alternative and is kept in view as a footnote for exactly that reason, even though it doesn't substitute for Telegram's reach today.

### Rationale
Telegram is the only channel evaluated that is simultaneously $0 at any volume, ships same-day with no approval process, and extends an existing pipeline (Shared-Canvas Sync Pipeline) rather than requiring a new one — the strongest min-pivot-max-value case among the options. WhatsApp's higher reach is real and not dismissed, just sequenced after Telegram proves the pipeline extension works, since its cost is calendar time that shouldn't block a `Should`-tier item from shipping this increment.

### TCO Impact

| Dimension | Chosen: Telegram Bot API | Alternative: WhatsApp Cloud API | Alternative: SMS |
|---|---|---|---|
| Infra cost | $0, no tier, ever | $0 infra; $0.005–$0.08/conversation beyond 1,000 free/month; BSP platform fee if not going direct-to-Meta | No free tier, cost from message one |
| Egress cost | $0 | $0 | Included in per-message cost |
| Token cost | $0 (non-AI) | $0 (non-AI) | $0 (non-AI) |
| Ops burden | Lowest — instant bot creation, no approval | Medium-high — business verification, template pre-approval | Low setup, ongoing cost management |
| Vendor risk | Low (Telegram's free-API commitment is long-standing, 2015–present) | Low-medium (Meta policy changes affect pricing/tiers periodically) | Low |

### Consequences
- **Positive**: US-6 ships this increment at genuinely $0 marginal cost, extending an existing pipeline rather than adding a new one.
- **Negative**: Telegram's SG/MY/SEA reach is real but secondary to WhatsApp's — this decision optimizes cost and speed over maximum reach, a trade-off stated here rather than left implicit.
- **Negative**: Telegram bots cannot cold-initiate a conversation — the user must message the bot once before it can send anything, a one-time onboarding step this document's UX (not yet specced) will need to account for.
- **Neutral**: this ADR doesn't foreclose WhatsApp — it's logged as a follow-on with its own Open Question (direct-to-Meta vs. BSP), not rejected.

---

## Alignment Note (condensed)

This document is now at a local release-candidate checkpoint, not a production-delivered checkpoint. Coverage ratio remains 12 of 12 artifact-bearing template sections present (PRD template fields, TAD template fields, seven ADRs) — **12/12**. Local Evidence References exist for focused development checks only: `npm -C canvas run check`, Commerce MainPanel unit coverage for the Stripe/Travel payment KTV surface, payment-worker travel-agency tests, MCP external-tool SSE tests, shared-node PBT, `git diff --check`, and clean VS Code diagnostics. These receipts justify `local_rung: dev-proven` for the implemented slices, but not `runtime-ready` or `delivered_rung` advancement. Delivered remains `undocumented` until the protected Integration Gate merges the exact candidate, Cloudflare deployment is human-authorized for that candidate digest, and live verification receipts are recorded. Production issuance remains blocked by unconfirmed StraitsX production MCP schema/tool names, Path-A guardrail enforcement, over-cap multi-card funding, wallet linking, escrow metering, notification dispatch, hash-linked provenance completion, readiness derivation, and the unresolved Yjs duplicate-import warning observed during shared-node PBT.

### Latest Progress — 2026-08-18

- Merged the travel-agency release candidate through protected PR #811 into canonical `origin/main` at `57296e28aec0cfe7350ab311061fb79e900d5ee3`.
- Proved tree parity between the PR candidate and canonical `origin/main`, then removed the residual `.worktrees/agentic-graph-travel-agencies` worktree.
- Confirmed canonical `agentic-graph` is clean and only the canonical main worktree remains.
- Kept Cloudflare production dispatch closed because `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_PAGES_PROJECT` are not visible in Trae's active command environment, so rollback identity capture and exact production release input generation cannot run safely.
- Implemented D1 migration scaffolding for travel-agency runtime config, transaction-side authority, wallet/profile links, and notification recipient/suppression records.
- Added role-independent transaction-side authority for storage/shared-node flows instead of deriving `shopper`/`merchant` from membership role.
- Added Shared Canvas Node Store helpers for typed node deltas, subscription/resume surfaces, deterministic checksum calculation, and malformed/oversized-delta rejection without persistent mutation.
- Added OpenAI Responses API-backed typed flight intent parsing with fail-closed runtime configuration validation.
- Added deterministic guardrail retry behaviour for over-budget offers.
- Added durable human-confirmation enforcement before Payment_Call admission.
- Added fail-closed Issuance Service preparation for SSE MCP profile/tool/deadline, exact settlement currency, per-card cap, and production-boundary checks before any provider dispatch.
- Added exact two-source on-chain settlement verification; over-credit is rejected because amount must match exactly.
- Added MCP SSE transport support across external-tool contract, profile registry, and session construction.
- Added Commerce MainPanel Travel Agency Payments settings beside Stripe using the existing KTV documentation/settings layout and non-secret local settings.
- Updated API documentation for the travel-agency intent, issuance-prepare, confirmation-gate, settlement-verifier, and Commerce settings surfaces.

### Latest Validation — 2026-08-18

- PR #811 Integration Gate — passed and auto-merged.
- Canonical parity check — `HEAD = origin/main = 57296e28aec0cfe7350ab311061fb79e900d5ee3`.
- Residual worktree check — `.worktrees/agentic-graph-travel-agencies` absent.
- Production dispatch preflight — blocked: `CLOUDFLARE_ACCOUNT_ID=set`, `CLOUDFLARE_API_TOKEN=missing`, `CLOUDFLARE_PAGES_PROJECT=missing` in Trae's active command environment.
- `npm -C canvas run check` — passed.
- `npm -C canvas run test:ci:unit -- ui.mainPanel.commerce.rendersAgenticCommerceAndStripeSurface` — passed.
- `TSX_TSCONFIG_PATH=canvas/tsconfig.json node --import tsx --test --test-concurrency=1 cloudflare/workers/agentic-graph-payment/__tests__/travel-agency-intent.test.ts cloudflare/workers/agentic-graph-payment/__tests__/travel-agency-settlement.test.ts cloudflare/workers/agentic-graph-payment/__tests__/agentic-purchase-safety.test.ts` — 20/20 passed.
- `node --test --test-concurrency=1 mcp/__tests__/external-tool-gateway-contract.test.mjs mcp/__tests__/external-tool-profile-registry.test.mjs mcp/__tests__/external-tool-session.test.mjs` — 12/12 passed.
- `npm run storage:shared-node:pbt` — 2/2 passed; warning remains: duplicate Yjs import.
- `git diff --check` — passed.
- VS Code diagnostics — clean.

### Next Steps

1. Rotate any Cloudflare token exposed in logs/chat, then provide `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_PAGES_PROJECT` to Trae's active command environment or via a secure one-command scoped invocation.
2. Run read-only rollback identity capture for the current Cloudflare Pages/D1 production state.
3. Generate exact `agentic-local-review-candidate/v1` and `agentic-graph-production-release-evidence/v1` JSON for merged commit `57296e28aec0cfe7350ab311061fb79e900d5ee3`.
4. Dispatch the protected Production Release workflow and complete the protected human authorization gate for the exact candidate digest before Cloudflare mutation.
5. Confirm StraitsX production MCP schema/tool names and card-cap/currency semantics before opening production issuance.
6. Implement wallet linking, escrow meter, notification dispatcher, hash-linked provenance logger, and readiness derivation from evidence references.
7. Resolve Path-A guardrail enforcement, multi-card over-cap funding, duplicate Yjs import warning, and extended shared-node replay/resume/provenance PBT before production traffic.

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-AGENTIC-TRAVEL-AGENCIES-PRD-TAD-ADR-MVP-GTM@0.6.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Feature: Agentic Travel Agency — Flagship Flows & Shared-Canvas Primitive](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#feature-agentic-travel-agency--flagship-flows--shared-canvas-primitive) |
| TAD | [Architecture: Flight Booking, Comparison Shopping & Shared-Canvas Primitive](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#architecture-flight-booking-comparison-shopping--shared-canvas-primitive) |
| ADR | [Architectural Decisions](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions) |
| MVP | [MVP — reference implementation](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-agentic-travel-agencies-planning-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run storage:shared-node:pbt` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`cloudflare/workers/agentic-graph-storage/canvasSyncRoom.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/cloudflare/workers/agentic-graph-storage/canvasSyncRoom.ts), [`cloudflare/workers/agentic-graph-storage/travelAgencySide.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/cloudflare/workers/agentic-graph-storage/travelAgencySide.ts), [`cloudflare/d1/migrations/0012_travel_agency.sql`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/cloudflare/d1/migrations/0012_travel_agency.sql). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
