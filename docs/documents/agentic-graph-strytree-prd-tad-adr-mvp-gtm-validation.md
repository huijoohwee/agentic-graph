---
title: "Strytree Part D ADR-001 through ADR-008 and Part E validation plan/references"
doc_type: "PRD-TAD-ADR-MVP-GTM"
status: "implementation-contract"
lang: "en-US"
frontmatter_contract: "required"
source_contract: "./agentic-graph-strytree-prd-tad-adr-mvp-gtm.md"
version: "0.2.3"
date: "2026-09-12"
owner: "Product maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-STRYTREE-PRD-TAD-ADR-MVP-GTM"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.2.2"
prd_revision: "0.2.3"
tad_revision: "0.2.3"
adr_revision: "0.2.3"
mvp_revision: "0.2.3"
gtm_revision: "0.2.3"
---

[Canonical PRD/TAD and section index](./agentic-graph-strytree-prd-tad-adr-mvp-gtm.md).

# Part D - Architectural Decisions

## ADR-001: Use Cloudflare D1, R2, and KV for MVP persistence

**Status**: Accepted / implemented for Strytree ledger mutations

**Date**: 2026-05-30

### Context

The Strytree prototype has no database. agentic-graph needs durable graph state, media references, wallet ledger, entitlement records, and audit events while preserving the Dev -> Prod -> Cloudflare deployment topology.

### Decision

Use D1 for relational persistence and validated ledger projections, R2 for media objects, and KV for read-heavy cache/feature flags. ADR-006 already uses a per-buyer Durable Object for authoritative ledger mutations. Only additional live-collaboration or per-story actors remain deferred.

### Alternatives Considered

1. Browser-only storage: zero backend but cannot enforce wallet, unlock, payment, or cross-device persistence.
2. **FOSS self-hosted stack** (explicit FOSS alternative): PocketBase on Oracle Always Free ARM (PostgreSQL backend) + MinIO or Cloudflare R2-compatible object store + pg-boss job queue. Full FOSS, zero vendor lock-in, $0 egress on Oracle Always Free. Cons: higher ops burden; requires self-managed migrations, backups, and uptime monitoring outside Cloudflare topology.
3. External hosted Postgres: familiar SQL but adds an external vendor dependency and likely monthly cost above free tier.

### TCO Impact

| Dimension | Chosen Option (CF D1/R2/KV) | Best FOSS Alternative (PocketBase + MinIO + pg-boss) | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (free tier: 5M D1 reads, 10 GB R2) | $0/mo (Oracle Always Free ARM) | $0 |
| Egress cost | $0/mo (R2 zero egress to CF Workers) | $0/mo (Oracle Always Free outbound) | $0 |
| Token cost | Not applicable | Not applicable | $0 |
| Ops burden | Low (managed; no server to patch) | Medium (self-managed DB, object store, queue) | — |
| Vendor risk | Medium (CF platform lock-in) | Low (FOSS; portable to any host) | Accepted for topology fit |

### Consequences

- Positive: Minimal operational footprint and aligned with agentic-graph Cloudflare deployment.
- Negative: D1 constraints require careful migration and query design.
- Neutral: Durable Objects remain available when real-time collaboration is justified.

## ADR-002: Make credit tokens an append-only server ledger

**Status**: Accepted / implementation contract

**Date**: 2026-05-30

### Context

The prototype stores `tokenBalance` in browser memory. Production spend and unlock flows cannot trust client mutation.

### Decision

Represent app credit tokens as an append-only ledger with idempotency keys, event types, related object references, and balance-after fields.

### Alternatives Considered

1. Mutable wallet balance column only: simpler but weak audit and replay protection.
2. Client-side balance: zero backend but insecure.
3. FOSS accounting ledger service: more complete but too much scope for MVP.

### TCO Impact

| Dimension | Chosen Option (append-only D1 ledger) | Best FOSS Alternative (pg-boss + Postgres) | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (included in D1 free tier) | $0/mo (Oracle Always Free Postgres) | $0 |
| Egress cost | $0/mo | $0/mo | $0 |
| Token cost | None | None | $0 |
| Vendor risk | Medium (D1 schema migrations are CF-specific) | Low (standard SQL; portable) | Accepted |

### Consequences

- Positive: Auditable, replay-safe, refund-friendly.
- Negative: Requires transaction discipline and tests.
- Neutral: Can later export to a full accounting system.

## ADR-003: Derive story edges from `parent_node_id`

**Status**: Accepted / implementation contract

**Date**: 2026-05-30

### Context

The prototype derives edges from `parentId`. MVP storytrees are trees, not arbitrary graphs.

### Decision

Store `parent_node_id` on `strytree_nodes` as the edge SSOT. Add a separate edge table only after branch merges, edge labels, or graph analytics require it.

### Alternatives Considered

1. Separate `story_edges` table now: flexible but risks drift and more joins.
2. Materialized graph JSON only: fast reads but harder writes and audits.
3. FOSS graph database: powerful but unjustified for tree MVP.

### TCO Impact

| Dimension | Chosen Option (parent_node_id column) | Best FOSS Alternative (separate edge table) | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (one column; no extra table) | $0/mo (same storage tier) | $0 |
| Egress cost | $0/mo | $0/mo | $0 |
| Token cost | None | None | $0 |
| Query complexity | Low (single JOIN on parent_node_id) | Higher (edge table JOIN) | — |
| Vendor risk | Medium (D1) | Low (portable SQL) | Accepted |

### Consequences

- Positive: Simple, deterministic, aligned with prototype.
- Negative: Non-tree features need migration.
- Neutral: A future edge table can be backfilled from `parent_node_id`.

## ADR-004: Keep external video provider behind a harness, never in browser code

**Status**: Accepted / implementation contract

**Date**: 2026-05-30

### Context

The prototype includes a direct browser `fetch` path to external video provider with an API token header, but live demo mode leaves the key empty. Production must not expose provider credentials.

### Decision

Put all external video provider calls behind a Worker or local harness boundary with typed payload validation, bounded polling, server-side credentials, cost logs, and structured fallback.

### Alternatives Considered

1. Direct browser external video provider call: fast prototype but leaks credentials and spend control.
2. Local-only MCP harness: useful for dev but not enough for public hosted product.
3. FOSS video provider only: avoids vendor lock-in but may not match target capability.

### TCO Impact

| Dimension | Chosen Option (Worker harness + external video provider) | Best FOSS Alternative (CogVideoX / Wan2.1 self-hosted) | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (CF Worker included in free tier) | $20–80/mo (GPU compute for video gen) | −$0 CF / +GPU if FOSS |
| Egress cost | Variable (R2 media egress; CF-internal = $0) | Variable (self-hosted egress) | Comparable |
| Token cost | Provider variable (external video provider per-video credit) | $0 direct; GPU compute cost | external video provider cost vs GPU cost at volume |
| Vendor risk | Medium/high (external video provider pricing and availability) | Low (FOSS weights; self-host) | Mitigated by adapter boundary enabling swap |

### Consequences

- Positive: Protects credentials and gives cost control.
- Negative: Adds backend work and provider status handling.
- Neutral: Harness can support BytePlus/external video provider alternatives.

## ADR-005: Credit purchases settle through payment webhooks before wallet credit

**Status**: Accepted / implementation contract

**Date**: 2026-05-30

### Context

The prototype shows credit/token and CNY unlock affordances but performs no real payment. Production must credit wallet only after confirmed payment.

### Decision

Create payment sessions server-side, redirect or present provider UI client-side, then credit the wallet only from verified webhook fulfillment. Reuse existing agentic-graph commerce owners where possible.

### Alternatives Considered

1. Client success redirect credits wallet: simple but forgeable.
2. Manual offline credit grants: low integration cost but poor UX and audit.
3. FOSS self-hosted payment stack: reduces vendor lock-in but increases compliance and ops load.

### TCO Impact

| Dimension | Chosen Option (Stripe/existing commerce webhook) | Best FOSS Alternative (BTCPay Server self-hosted) | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (Stripe fee is per-transaction; no monthly fixed) | $5–15/mo (VPS for BTCPay; already on Oracle ARM = $0) | $0 if Oracle ARM used |
| Egress cost | $0/mo | $0/mo | $0 |
| Token cost | None | None | $0 |
| Vendor risk | Medium (Stripe TOS and availability) | Low (self-hosted; FOSS) | Accepted for payment reliability |

### Consequences

- Positive: Prevents fake wallet credits and supports dispute handling.
- Negative: Requires webhook security and idempotency fixtures.
- Neutral: The ledger can later support other payment rails.

## ADR-006: Atomic Credit Debit — Durable Object vs D1 Row Lock

**Status**: Accepted / implementation contract

**Date**: 2026-05-31

### Context

The credit ledger requires atomic debit operations: read balance, check sufficiency, decrement, and write ledger event — all without double-spend under concurrent requests. D1 is SQLite-based and does not support `SELECT FOR UPDATE`. Two concurrent generation requests for the same user could both read the same balance and both pass the sufficiency check before either debit is committed.

### Decision

Use a per-buyer Cloudflare Durable Object with SQLite authority. A synchronous local transaction validates balance and identity, commits the event, semantic digest, authority version and balance, then projects the committed event to D1 separately. Projection failure cannot authorize a second debit or a direct-D1 fallback.

For unlock, the frozen actor event is the recovery record. Replay checks the legacy raw key first, then `strytree-unlock-v1:` plus SHA-256 of `JSON.stringify(["unlock-v1", buyerId, rawClientKey])`. Reserved keys require matching buyer/type/client-key metadata; owner/node/type/digest/allocation/projection conflicts fail closed. The original price and creator allocation survive retries and current-term changes.

`strytreeStory.ts` separately finalizes the entitlement, paid-unlock count, and success audit in one native D1 batch. Missing batch support blocks a new debit. Concurrent losers roll back; a lost acknowledgement must resolve to exact complete stored evidence. There is no single transaction spanning the actor and D1, and no separate pre-debit D1 unlock-intent journal. Allocation metadata is not a creator wallet credit or payout. Snapshot reads still accept existing entitlement rows directly, so legacy snapshot/media remediation is a distinct boundary.

### Alternatives Considered

1. **Durable Object per user** (chosen): Strongly consistent; single-instance actor serializes concurrent requests. Cons: CF-proprietary; adds DO binding complexity; free tier 100k requests/day is sufficient for MVP load.
2. **FOSS alternative — Postgres `SELECT FOR UPDATE`**: If running PocketBase on Oracle Always Free ARM, use `BEGIN; SELECT balance FROM ledger WHERE user_id = ? FOR UPDATE; INSERT ledger event; COMMIT;`. Strongly consistent; fully FOSS; portable. Cons: requires PocketBase/Postgres to be reachable from CF Workers (extra network hop; not purely CF-native).
3. **Optimistic locking on D1**: Read balance, CAS on update with version column. Cons: retry storms under concurrent load; not strongly consistent without external coordination.
4. **Accept eventual consistency at MVP**: Simple; no extra component. Cons: double-spend risk is a security defect, not a UX tradeoff. Rejected.

### Rationale

At MVP load (solo dev + early users), the DO free tier (100k req/day) is sufficient. The DO boundary also positions cleanly for future live-collaboration coordination (per ADR-001). The FOSS Postgres lock alternative is equally valid if the Oracle Always Free ARM instance is already in the stack; document as the migration path if DO TCO justification fails at scale.

### TCO Impact

| Dimension | Chosen Option (Durable Object) | FOSS Alternative (Postgres FOR UPDATE) | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (free tier: 100k req/day) | $0/mo (Oracle Always Free Postgres) | $0 |
| Egress cost | $0/mo (CF-internal) | $0/mo (Oracle outbound is free-tier) | $0 |
| Token cost | None | None | $0 |
| Vendor risk | Medium (CF DO; proprietary actor model) | Low (standard SQL; portable) | Accepted for CF-native topology |

### Consequences

- **Positive**: Eliminates double-spend race condition; positions for live collaboration without architectural change.
- **Negative**: Requires the existing DO binding and explicit recovery across authority/projection/delivery commits. Native tests use local Worker/D1/DO SQLite; deployed behavior needs separate evidence.
- **Neutral**: FOSS Postgres lock is a documented migration path if DO costs increase or CF topology changes.
- **Implementation**: `strytreeCreditLedger.ts`, `strytreeData.ts`, and `strytreeStory.ts` own authoritative mutation, bounded replay/projection, and unlock finalization. Missing `STRYTREE_CREDIT_LEDGER` fails closed in both runtime and local contracts. CID `commerce.request-efficiency.unlock` joins this decision to E05 and the MainPanel RAO/SVO status.

---

## ADR-007: Generation Job Dispatch — Cloudflare Queue vs Synchronous Worker Polling

**Status**: Accepted / implementation contract

**Date**: 2026-05-31

### Context

external video provider generation jobs can take 30–120 seconds. Cloudflare Workers have a 30-second CPU time limit on the free tier (extended to 30 minutes on paid, but still a single HTTP request lifetime). Keeping provider polling inside the HTTP request Worker causes timeouts for most real-world generation jobs. The client cannot receive the result synchronously.

### Decision

Use Cloudflare Queue to decouple the generation submission (HTTP Worker, synchronous, fast) from generation polling (Queue Consumer Worker, async, bounded). The HTTP Worker validates queue availability and freezes a D1 request intent before authoritative debit and bounded enqueue, returning `202` for new work or `200` for replay. The consumer claims a renewable 120-second lease, stores provider identity before polling (max 60 per attempt), and freezes finalization bytes before R2 writes. Unknown submission outcomes require reconciliation; confirmed failures use resumable refund intent. The browser polls `GET /api/strytree/generation-jobs/:jobId` for status.

### Alternatives Considered

1. **Cloudflare Queue + Consumer** (chosen): Native CF async; at-least-once delivery; dead-letter on max retries. Free tier: 1M ops/month. Cons: CF-proprietary; requires Queue binding.
2. **FOSS alternative — pg-boss on Postgres**: Job queue backed by Postgres on Oracle Always Free ARM. MIT license; strongly consistent; persistent job log; retry and dead-letter built-in. Cons: requires Postgres reachable from CF Workers; adds network hop; not purely CF-native.
3. **Synchronous polling in HTTP Worker (current prototype pattern)**: Simple. Cons: times out for real jobs; blocks CF Worker CPU budget; not viable for production. Rejected.
4. **WebSocket / Server-Sent Events from Worker**: Real-time push to browser. Cons: requires Durable Object or long-lived connection; higher complexity; deferred to future enhancement.

### Rationale

CF Queue fits the existing CF-native topology at $0 additional cost within free tier. The pg-boss FOSS alternative is equally viable if the Oracle Always Free ARM instance is already running and preferred for FOSS purity; document as migration path.

### TCO Impact

| Dimension | Chosen Option (Cloudflare Queue) | FOSS Alternative (pg-boss + Postgres) | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (free: 1M ops/mo) | $0/mo (Oracle Always Free Postgres) | $0 |
| Egress cost | $0/mo (CF-internal) | $0/mo | $0 |
| Token cost | None | None | $0 |
| Delivery guarantee | At-least-once (CF Queue) | At-least-once (pg-boss) | Equivalent |
| Vendor risk | Medium (CF-proprietary) | Low (FOSS; portable) | Accepted for CF-native topology |

### Consequences

- **Positive**: Decouples HTTP and provider timelines; survives provider latency spikes; enables future fan-out (parallel providers).
- **Negative**: CF-proprietary; consumer Worker requires separate `wrangler.toml` consumer binding; adds local dev complexity.
- **Neutral**: FOSS pg-boss alternative is the documented migration path for FOSS-pure deployments.

---

## ADR-008: Add ForkCompare Workbench Through Existing UI And Cloudflare Bindings

**Status**: Accepted / implementation contract

**Date**: 2026-05-31

### Context

The Strytree product can gain high ROI from a spatial candidate comparison workflow: creators should see multiple continuation options, compare cost and continuity, and publish one selected branch. The risk is recreating the product around a new graph library, a hosted database service, or a separate deployment path, which would raise TCO and split ownership away from agentic-graph's existing Dev -> Prod -> Cloudflare chain.

### Decision

Build ForkCompare as a Strytree add-on that reuses:

1. Existing Strybldr/Storyboard/Strytree card and SVG/HTML rendering surfaces.
2. Existing Cloudflare Worker routes, D1 tables, R2 artifact storage, KV cache invalidation, Queue consumers, and Durable Object debit actor.
3. Existing harness-first generation path and cost log fields.

The add-on must not introduce a new graph-rendering runtime, hosted database SDK, or deployment provider. The reuse list includes planned provider-backed extensions. Current candidate preparation is deterministic, persists private D1 rows with null media keys, and invokes no candidate-only Queue consumer, generation provider, or R2 writer. One selected complete candidate publishes as a normal `strytree_nodes` child row; the separate generation path owns existing Queue/R2 work.

### Alternatives Considered

1. **Existing surface + Cloudflare bindings** (chosen): Lowest TCO; preserves current repo owners; reuses queue, ledger, and snapshot contracts.
2. New graph rendering dependency: visually convenient, but duplicates existing SVG/card ownership and increases bundle, test, and interaction surface.
3. External hosted graph/document backend: convenient persistence, but adds vendor dependency, egress risk, auth duplication, and a second data authority.
4. Separate hosted micro-app: fast prototype, but violates Dev -> Prod -> Cloudflare topology and creates a stale parallel product path.

### TCO Impact

| Dimension | Chosen Option (existing UI + Cloudflare bindings) | Best FOSS Alternative (self-hosted Postgres + pg-boss + native SVG UI) | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo within existing Cloudflare free/low tier until traffic grows | $0/mo on Oracle Always Free ARM if already operated | $0 |
| Egress cost | $0/mo for Worker/D1/R2 internal paths; public media follows R2 policy | $0/mo if self-host egress remains under free limits | Comparable |
| Token cost | Explicit provider credit quote; deterministic scorecard adds $0 LLM tokens | Same | $0 |
| Build hours | 8-12 h because existing UI/harness surfaces are reused | 16-24 h due to self-host ops and Worker-to-Postgres integration | Chosen saves 8-12 h |
| Vendor risk | Medium (Cloudflare APIs) | Low (portable FOSS stack) | Accepted for topology fit and lower ops burden |

### Consequences

- **Positive**: High creator value per build hour; direct reuse of existing agentic-graph surfaces; bounded provider spend; clear scorecard accounting.
- **Negative**: Cloudflare-native bindings keep some platform lock-in; candidate state must be carefully separated from public graph state.
- **Neutral**: The D1 schema can be exported to a FOSS Postgres/pg-boss stack if future TCO or platform requirements change.

---

# Part E - Validation Plan

## Pre-Implementation Checklist

**PRD**:
- [x] User journey mapped (seven stages: Trigger → Discover → Preview → Commit → Generate → Publish → Return) before stories written
- [x] Every epic anchored to a journey stage
- [x] Workflows defined with trigger, happy path, alternate paths, error paths, and postconditions
- [x] Data flows typed at every stage boundary with persistence and error handling documented
- [x] User stories follow "As a… I want… So that" format
- [x] Acceptance criteria use Given-When-Then with observable outcomes
- [x] Every acceptance criterion has a `/goal` translation: one measurable end state + stated check + scope constraint
- [x] Features prioritized via MoSCoW with ROI score formula and per-feature calculation
- [x] Min-viable scope explicitly stated (9-point list)
- [x] Recommended add-on documented: ForkCompare Branch Candidate Workbench with bounded fan-out, scorecards, merge semantics, and stack guard
- [x] Token budget: external video provider video calls do not expose LLM tokens; cost log records credit_cost, elapsed_ms, estimated_cost_usd per call; $0 LLM token cost for MVP
- [x] Monthly TCO estimated at $0 (CF D1/R2/KV/Queue free tier + Oracle Always Free ARM)
- [x] FOSS-first decisions recorded: FOSS alternatives named in every ADR

**TAD**:
- [x] Components have single responsibility; interfaces specified with explicit typed contracts
- [x] Auth Middleware component specified: PocketBase JWT validation at CF Worker edge
- [x] Async Job Queue component specified: CF Queue + Consumer Worker (ADR-007)
- [x] Atomic debit component specified: Durable Object per user (ADR-006)
- [x] AI harness contract: typed input schema, typed output schema, cost log fields, fallback path, max-iteration bound (60 polls), circuit-breaker conditions (4 stated)
- [x] ForkCompare candidate harness specified: typed candidate-run input/output, deterministic scorecard default, max candidate bound, stack guard, and merge/publish API
- [x] Orchestration topology: fan-out/sequential (HTTP Worker enqueue + Consumer Worker sequential); no unbounded loops
- [x] ADR-001 through ADR-008 documented with FOSS alternatives and TCO comparisons
- [x] Architecture diagrams use Mermaid (component topology, sequence × 3, data flow × 4, harness flow)
- [x] Component inventory table accompanies architecture diagram (C3)
- [x] PRD-to-TAD traceability established at AC level (C13: 23 rows)
- [x] No implementation detail in PRD; no business logic in TAD
- [x] D1 schema migration files created and dry-run validated
- [x] CF Queue consumer binding defined in `wrangler.toml`
- [x] DO namespace binding defined for per-user balance actor
- [x] Durable Object SQLite actor commits authoritative balance/event/version and validates replay before separate D1 projection
- [x] D1-backed snapshot route exists; native API fixtures cover current reads, while legacy partial-entitlement remediation remains unaddressed
- [x] Native unlock controls cover actor debit recovery and atomic D1 entitlement/count/audit; POST completion proof does not establish universal snapshot/media delivery proof
- [x] Candidate routes freeze at most three deterministic alternatives before debit; atomic completion/publication and exact replay are native-tested without candidate-only queue/provider work
- [x] Credit purchase package route maps checkout settlement into `strytree_token_ledger` with idempotent replay guard
- [x] Wallet route returns committed balance plus pending checkout state before webhook credit
- [x] Generation freezes intent before debit/enqueue; leased consumer reuses provider identity/finalization bytes and refunds confirmed failures through resumable intent
- [x] Provider budget circuit breaker blocks generation before ledger debit or queue enqueue when KV spend reaches configured daily limit
- [x] ForkCompare candidate-run dependency guard added to prevent new graph/database/hosting stack drift
- [x] Live external video provider API credentialed polling is wired behind the same Queue consumer contract
- [x] Signed provider webhook fixture invokes the same Strytree checkout settlement owner after signature verification

The checkboxes above retain the original design/implementation inventory; they are not deployment receipts. Dated TCO/free-tier figures are historical estimates, not current pricing verification. Current native evidence is the existing `travel-commerce:strytree-ledger:test` entrypoint over `strytree-ledger`, `strytree-api`, `strytree-checkout`, `strytree-generation`, `strytree-candidates`, and `strytree-candidate-publish` contract modules in `cloudflare/workers/agentic-graph-payment/__tests__`. Local passing controls do not imply the full Canvas registry is green, live provider collection, universal legacy snapshot remediation, creator payout, or production E2E readiness.

## Suggested Implementation Goals

```text
/goal Strytree story snapshot route returns D1-backed nodes with parent_node_id and entitlement_hint, and reload after publishing a branch returns the child node without client-only persistence — verified by native strytree-api and strytree-candidate-publish contracts; assess legacy snapshot rows separately

/goal Strytree native ledger/API/checkout contracts prove purchase credit, generation/refund and unlock debit identity; interrupted unlock returns the original allocation and complete entitlement without another charge. Creator payout and live provider collection remain outside these fixtures — verified by npm run travel-commerce:strytree-ledger:test

/goal Strytree generation harness uses server-side external video provider credentials, validates typed payloads at the HTTP Worker, enqueues to CF Queue, and the consumer Worker writes R2 artifacts and returns structured fallback on provider failure — verified by native strytree-generation contracts; client-secret build scanning remains a separate check

/goal Strytree auth-gate tests pass: all write endpoints return 401 without a valid session token and no ledger event or D1 write occurs — verified by native strytree-api, strytree-candidates, strytree-candidate-publish and strytree-checkout contracts

/goal Strytree circuit-breaker test passes: POST /api/strytree/generation-jobs returns 429 with error_code provider_budget_exceeded when KV budget counter is at the configured daily limit — verified by the existing generation budget controls; do not infer live budget-provider evidence

/goal Strytree ForkCompare tests pass: candidate runs reject max_candidates > 3, write candidate scorecards with cost and continuity fields, publish exactly one selected child node, and dependency guard confirms no new graph UI package, hosted database SDK, or non-Cloudflare deploy target — verified by native strytree-candidates/strytree-candidate-publish contracts and canvas registry strytree.forkCompare.cloudflareNativeStackGuard
```

## References

- Observed prototype: external static storytree prototype snapshot; URL intentionally omitted by hardcode policy.
- PRD/TAD guideline: `guidelines/prd-tad-adr-mvp-gtm-guidelines.md` (repo root of `huijoohwee.github.io`)
- Cloudflare Workers storage options: https://developers.cloudflare.com/workers/platform/storage-options/
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Cloudflare R2: https://developers.cloudflare.com/r2/
- Cloudflare Workers KV: https://developers.cloudflare.com/kv/
- Cloudflare Queues: https://developers.cloudflare.com/queues/
- Cloudflare Durable Objects: https://developers.cloudflare.com/durable-objects/
- Stripe webhooks and Checkout flow: https://docs.stripe.com/webhooks
- Stripe Checkout: https://docs.stripe.com/payments/checkout

## Planning continuity — reference implementation

This size/ownership companion consumes `PLAN-AGENTIC-GRAPH-STRYTREE-PRD-TAD-ADR-MVP-GTM@0.2.3` with [the five-role owner](agentic-graph-strytree-prd-tad-adr-mvp-gtm.md#planning-revision--reference-implementation). Requirements, architecture and decisions remain in their linked owners; MVP and GTM consume them. Historical source checks retain their recorded revision, environment and coverage; this documentation revision renews no readiness, experience rating or paid-demand evidence.
