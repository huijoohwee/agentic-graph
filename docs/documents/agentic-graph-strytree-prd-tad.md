---
title: "agentic-graph Strytree Storytree - PRD and TAD"
doc_type: "Combined PRD/TAD"
id: "agentic-graph-strytree-prd-tad"
version: "0.2.2"
status: "implementation-contract"
created: "2026-05-30"
updated: "2026-06-10"
author: "airvio / joohwee"
domain: "agentic-graph"
lang: "en-US"
frontmatter_contract: "required"
deployment_topology: "Dev -> Prod -> Cloudflare"
cloudflare_route: "https://airvio.co/agentic-graph"
source_repo: "https://github.com/huijoohwee/agentic-graph"
source_reference: "external static storytree prototype"
source_snapshot_utc: "2026-05-30T09:52:51Z"
orientation:
  - "solo-dev"
  - "AI-native"
  - "min-viable-max-value"
  - "TCO-zero"
  - "FOSS-first"
  - "token-economical"
  - "harness-first"
constraints:
  - "production access state must be server-owned"
  - "credit-token ledger must not trust client mutation"
  - "external video provider credentials must never ship to the browser"
  - "story edges derive from parent_node_id unless a later graph index is justified"
  - "static prototype behavior must be documented separately from target implementation"
  - "no new paid dependency without ADR-level TCO comparison"
  - "no new external graph-rendering dependency for the Strytree workbench"
  - "no hosted database dependency outside the Cloudflare topology"
  - "no alternate app hosting path outside Dev -> Prod -> Cloudflare"
  - "story edge rendering must bind to kgSharedRendererContract@shared-renderer-contract/v1 and buildScopedGraphSemanticKey; no local/downstream/hardcoded edge logic"
  - "story edge projection must use the canonical Storyboard renderer through kgSharedRendererContract; no per-renderer edge path, hardcode, or fork"
tags:
  - "strytree"
  - "storytree"
  - "interactive-story-graph"
  - "external_video_provider"
  - "credit-ledger"
  - "payments"
  - "cloudflare-d1"
  - "cloudflare-r2"
  - "storyboard"
  - "forkcompare"
  - "branch-candidate-workbench"
related:
  - "huijoohwee.github.io/guidelines/prd-tad-guidelines.md"
  - "docs/documents/agentic-graph-strytree-prd-tad.md"
  - "docs/documents/agentic-graph-strybldr-prd-tad.md"
  - "docs/documents/agentic-graph-agentic-commerce-prd-tad.md"
  - "docs/documents/agentic-graph-mainpanel-commerce-prd-tad.md"
kgCanvas2dRendererCapability:
  supportedRenderers: ["storyboard"]
  selectionModel: "projected-data"          # renderers project this set; they do not branch on it
  edgeProjectionInvariance: "identical-across-supportedRenderers"
kgSharedRendererContract:
  version: "shared-renderer-contract/v1"
  semanticIdentity: "buildScopedGraphSemanticKey"
  edgeModel: "active graph edges from the selected source graph"
  edgeSource: "strytree_nodes.parent_node_id"   # source/upstream derivation, no edge table
  rendererPolicy: "frontmatter and source payloads own data; renderers project view state only"
socket_types:
  idea_signal: {color: "#14b8a6", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [idea_signal]}
  evidence_signal: {color: "#22c55e", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [evidence_signal]}
  approval_signal: {color: "#f59e0b", edgeWidthPx: 3, handleStrokeWidthPx: 3, accepts: [approval_signal]}
  artifact_signal: {color: "#8b5cf6", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [artifact_signal]}
flow:
  direction: "LR"
  edgeType: "smoothstep"
  # Per-node handles + flow:portTypes are the shared, agnostic edge-projection driver.
  # For Strytree, each node carries a single inbound handle keyed to its parent_node_id-derived edge.
  storyEdgeProjection:
    handleModel: "per-node source/target handles derived from parent_node_id"
    portTypeDefault: "idea_signal"            # story-edge semantic mapping (single typed projection)
    semanticKeyRule: "buildScopedGraphSemanticKey(storyId, parentNodeId, childNodeId)"
edgeContractForbid:
  - "backfill"
  - "churn"
  - "conflict"
  - "duplicate"
  - "freeze"
  - "infinite-loop"
  - "hardcode"
  - "legacy"
  - "re-calculation"
  - "re-computation"
  - "re-rendering"
  - "stale-state"
  - "renderer-specific-edge-path"
  - "per-renderer-hardcode"
  - "alias-stacking"
  - "local-or-downstream-patch"
  - "backward-compat-remap"
edgeContractCleanup:
  rule: "root/source/upstream neutralization; remove 100% of legacy/stale/conflicting edge spec, hardcoded fixtures, and tests; NO backward-compatibility remapping"
edgeContractPrinciples: ["universality", "neutrality", "agnosticity", "modularity", "spec-complete-runtime-ready", "forbid-hardcode-in-repo"]
---

# agentic-graph Strytree Storytree - PRD and TAD

## Document Map

This index retains the PRD and historical source analysis. Its source-owned companions are:

- [C1-C5: architecture, components, data model and access policy](./agentic-graph-strytree-tad-architecture.md).
- [C6-C7: payment and delivery workflows and API contracts](./agentic-graph-strytree-tad-workflows-api.md).
- [C8-C13: harnesses, runtime flows, quality and traceability](./agentic-graph-strytree-tad-runtime-validation.md).
- [ADR-001-008 and validation plan](./agentic-graph-strytree-adr-validation.md).

This combined PRD/TAD follows `guidelines/prd-tad-guidelines.md` (repo root of `huijoohwee.github.io`).

The document has two jobs:

1. Record what the observed Strytree prototype actually does without retaining the prototype URL in this repo.
2. Define the production agentic-graph contract for a Strytree-style interactive storytree with real access control, persistence, wallet/credit-token accounting, payment settlement, graph rendering, and external video provider generation harnessing.

The observed page is a static edge-hosted HTML/CSS/vanilla-JS app. It has convincing UI behavior but no real auth, no database, no durable wallet, no real payment settlement, and no active external video provider generation in the live configuration. This PRD/TAD preserves the useful product pattern while replacing mock client state with server-owned ledgers and auditable data flows.

---

# Part A - Source Analysis

## A1. Observed Strytree Prototype

> **Historical source analysis only.** Part A records observed prototype behavior as historical source analysis only. It is NOT the target implementation contract; the runtime edge contract is defined in the frontmatter `kgSharedRendererContract` + `flow.storyEdgeProjection` and in Part C "Edge Rendering Contract".

### Delivery Shape

| Area | Observed Implementation |
|---|---|
| Hosting | Third-party static edge hosting |
| App shell | One standalone static HTML artifact |
| Framework | None detected; plain HTML, CSS, and vanilla JavaScript |
| Graph rendering | SVG story tree with HTML cards embedded through `foreignObject` |
| Decorative canvas | One fixed `<canvas id="starfield">` for background stars only |
| State | In-memory JavaScript object `S` |
| Persistence | None; reload resets changes |
| Auth | None |
| Payment | Mocked client-side unlock toast |
| Credit tokens | Mocked client-side integer counter |
| external video provider | API path scaffolded but `DEMO_MODE: true` and empty API key |

### Prototype State Object

The page keeps runtime state in one browser object:

```js
S = {
  nodes,
  tokenBalance,
  unlockedNodes,
  likedNodes,
  currentPage,
  selectedNodeId,
  modalParentId,
  modalPhase,
  modalResult,
  modalPrompt,
  modalSelectedChars,
  modalSelectedScene,
  treeTransform,
  treePositions
}
```

This is the entire "database" for active user behavior. It is not persisted to disk, storage, or a backend.

### Prototype Node Shape

Each story branch is a node:

```js
{
  nodeId,
  parentId,
  storyId,
  title,
  synopsis,
  prompt,
  authorId,
  authorName,
  duration,
  ageDays,
  isFreeWindow,
  unlockPrice,
  likes,
  impressions,
  paidUnlocks,
  isProtected,
  status,
  videoUrl,
  ownAssetIds
}
```

Edges are not stored independently. The prototype derives an edge when a node has a `parentId`.

### Prototype Access Behavior

Access is a display check:

```js
isUnlocked = node.isFreeWindow || S.unlockedNodes.has(nodeId)
```

If unlocked, the panel shows the branch video. If locked, it shows a blurred preview and an unlock button. There is no identity proof, entitlement record, server validation, or persistence.

### Prototype Credit-Token Behavior

Generation starts with:

```js
tokenBalance: 100
```

Each generation request requires 5 credit tokens:

```js
if (S.tokenBalance < 5) reject
S.tokenBalance -= 5
```

On generation failure, the prototype refunds the in-memory counter:

```js
S.tokenBalance += 5
```

This is not a ledger. It can be edited in DevTools and disappears on reload.

### Prototype Unlock Payment Behavior

Unlocking a locked branch calls:

```js
S.unlockedNodes.add(nodeId)
toast("paid mock: creator CNY 1.5, platform CNY 0.4")
```

No payment processor is called. No creator balance is credited. No platform fee is booked. `paidUnlocks` is not durably incremented.

### Prototype external video provider Behavior

The live configuration has:

```js
EXTERNAL_VIDEO_PROVIDER_API_KEY: ""
DEMO_MODE: true
EXTERNAL_VIDEO_PROVIDER_BASE: "https://app-api.external_video_provider.ai"
```

The code includes a real generation path for `/openapi/v2/video/fusion/generate` and polling through `/openapi/v2/video/result/{video_id}`, but the live page falls back to preset demo results because demo mode is enabled and the API key is empty.

### Prototype Calculation Engine

| Calculation | Prototype Rule |
|---|---|
| Active branch count | `nodes where status !== "dropped"` |
| Total likes | Sum of all `node.likes` |
| Like rate | `likes / impressions * 100`, one decimal, or `-` |
| Hot node color | `likes > 100` |
| Dropped node color | `status === "dropped"` |
| Locked state | Special `node_locked` id or not free and no video |
| Edge existence | `parentId` exists (historical prototype only) |
| Edge shape | SVG cubic Bezier from parent card right edge to child card left edge (historical prototype only) |
| Layout x | `depth * 240 + 80` |
| Layout y | Center parent over recursive subtree leaf height with `Y_GAP = 130` |
| Zoom | SVG root group `scale(k)`, clamped from `0.3` to `2` |

The observed logic is a deterministic recursive tree layout, not a graph database, graph algorithm library, canvas engine, or physics simulation.

---

# Part B - Product Requirements Document

## B1. Problem Statement

Interactive AI video storytelling needs more than a polished graph UI. A user must be able to enter a story universe, fork a branch, spend credits to generate media, unlock paid branches, and trust that every entitlement, creator credit, and platform fee is recorded durably.

The Strytree prototype proves the interaction model: a visual story tree, branch cards, inherited visual assets, token-gated generation, and paid unlock affordances. The production gap is that all sensitive state is client-side mock state.

agentic-graph can turn this pattern into a reliable product slice by preserving the min-viable graph UX while moving identity, persistence, wallet, payment, generation, and access decisions behind server-owned contracts.

## B2. Falsifiable Hypothesis

If agentic-graph implements a Strytree-style storytree with:

- server-owned story graph persistence,
- durable anonymous-to-authenticated user access,
- an append-only credit-token ledger,
- webhook-confirmed token purchases,
- transactional branch unlocks,
- external video provider calls behind a harness boundary,
- and client-side SVG rendering fed by signed graph snapshots,

then users can co-create and monetize story branches without trusting mutable browser state, while agentic-graph keeps the MVP within a low-TCO Cloudflare topology.

## B3. Personas

| Persona | Job To Be Done | Constraint |
|---|---|---|
| Viewer | Browse a story universe and preview branches. | Should not need an account for public/free synopsis access. |
| Co-creator | Fork a branch and generate a new video continuation. | Needs clear credit-token cost, retry/refund handling, and publish confirmation. |
| Paying fan | Unlock a protected branch. | Needs durable entitlement after reload and across devices. |
| Creator | Earn from unlocks of protected branches. | Needs auditable split and payout-ready ledger entries. |
| agentic-graph operator | Run the system cheaply and safely. | Needs server-side keys, low egress, traceable jobs, and bounded provider spend. |

## B4. User Journey

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | User sees a story universe. | Strytree home or agentic-graph MainPanel entry | Static demos do not retain engagement. | Show living branch count and hot branches from database stats. |
| Discover | User opens the story tree. | SVG storytree canvas | Dense branches can be hard to scan. | Compute deterministic layout and status coloring from graph state. |
| Preview | User selects a branch. | Node panel | Full video may be protected. | Always show free synopsis and entitlement-aware preview. |
| Commit | User chooses to generate or unlock. | Generate modal or unlock button | Users need cost clarity before spending. | Quote credit-token or currency cost before server commit. |
| Generate | User writes a continuation. | external video provider harness modal | Provider calls are slow and paid. | Debit/hold credits transactionally and refund on failed provider job. |
| Publish | User accepts generated result. | Storytree update | New branch must survive reload and sync. | Persist node, media artifact, and parent edge in one server transaction. |
| Return | User revisits later. | Same account/session | Client-only unlocks vanish. | Durable entitlement and wallet ledger restore state. |

## B5. Product Epics And Acceptance Criteria

### PRD-STR-E01 - Access And Identity

As a viewer, I want to browse public story trees without friction, so that discovery is instant.

As a co-creator or payer, I want a durable identity/session, so that unlocks, purchases, and generated branches remain mine after reload.

**PRD-STR-E01-AC-01** — Anonymous public browsing
Given an unauthenticated visitor, when they open a public story, then they can view public metadata, free synopsis, visible branch topology, and free-window videos without creating an account.

> **`/goal` translation**: `anonymous-access tests pass: public story snapshot returns nodes, synopsis, and free-window video URLs without a session cookie; no 401 or redirect is returned`

**PRD-STR-E01-AC-02** — Value-gated action enforcement
Given a visitor attempts to generate, purchase credits, unlock a branch, or publish a branch, when the action is submitted, then the server requires a durable session or authenticated user before spending or granting value.

> **`/goal` translation**: `auth-gate tests pass: generation, checkout, unlock, and publish endpoints return 401 when called without a valid session token; no ledger event or entitlement is created`

**PRD-STR-E01-AC-03** — Anonymous-to-authenticated account linking
Given an anonymous user later authenticates, when account linking succeeds, then eligible anonymous session entitlements and ledger entries are attached to the durable user without duplication.

> **`/goal` translation**: `account-linking tests pass: entitlement count for the durable user after linking equals the anonymous session count and no duplicate ledger events exist`

### PRD-STR-E02 - Persistent Story Graph

As a co-creator, I want a generated branch to become a durable child of the selected node, so that the story tree is shared and reload-safe.

**PRD-STR-E02-AC-01** — Server-fed graph snapshot
Given a story has nodes, when the client fetches the tree, then the API returns a signed graph snapshot with nodes, parent ids, aggregate stats, asset references, and entitlement hints.

> **`/goal` translation**: `snapshot-api tests pass: GET /api/strytree/stories/:id/tree returns all D1-backed nodes with parent_node_id, entitlement_hint, stats, and a snapshot version field`

**PRD-STR-E02-AC-02** — Durable branch publish
Given a branch is published, when the server accepts it, then a node row is inserted with `parent_node_id`, media artifact references, creator id, status, and audit timestamps.

> **`/goal` translation**: `publish tests pass: child node exists in D1 after publish call; reload of the snapshot returns the child node without any client-only state`

**PRD-STR-E02-AC-03** — Edge derivation from parent_node_id
Given a node has `parent_node_id`, when the graph is rendered, then the client derives one edge from the parent to child without needing a separate edge table.

> **`/goal` translation**: `graph-render unit tests pass: edge list derived from nodes with non-null parent_node_id exactly matches expected parent-child pairs; no edge table query is made`

The derived edge SHALL be projected through `kgSharedRendererContract@shared-renderer-contract/v1` using `buildScopedGraphSemanticKey` for identity and the `flow` port/handle/`socket_types` model for typing; local/downstream patches, alias stacking, and hardcoded edge logic are forbidden.

### PRD-STR-E03 - Credit-Token Wallet

As a co-creator, I want generation cost to be debited fairly and refunded on failure, so that paid provider errors do not consume my credits.

**PRD-STR-E03-AC-01** — Pre-call debit or hold
Given a user has a wallet balance, when generation starts, then the server creates an idempotent ledger debit or hold before calling the provider.

> **`/goal` translation**: `ledger-debit tests pass: a ledger event of type generation_debit exists in D1 before any external video provider API call is initiated; no provider call is made when ledger insert fails`

**PRD-STR-E03-AC-02** — Success finalization
Given the provider succeeds, when the generated result is attached, then the hold is finalized or the debit remains committed.

> **`/goal` translation**: `ledger-finalize tests pass: generation_job.status is succeeded and no refund event exists in the ledger after a simulated provider success`

**PRD-STR-E03-AC-03** — Failure refund
Given the provider confirms terminal failure, when the job closes, then the server completes a resumable refund tied to the original debit. An unknown submission outcome or elapsed poll limit alone retains that debit for reconciliation; it does not authorize another submission or an automatic refund.

> **`/goal` translation**: `ledger-refund tests pass: a refund_credit ledger event linked to the original generation_debit exists after a simulated provider failure; user balance_after reflects the refund`

**PRD-STR-E03-AC-04** — Idempotent debit
Given two identical client submissions arrive, when idempotency keys match, then the ledger applies only one debit.

> **`/goal` translation**: `idempotency tests pass: submitting the same generation request twice with the same idempotency_key produces exactly one ledger event and one generation_job row`

### PRD-STR-E04 - Payment-To-Credit Purchase

As a paying user, I want to buy credits through a trusted payment flow, so that my balance is credited only after confirmed payment.

**PRD-STR-E04-AC-01** — Server-side checkout session
Given a user selects a credit package, when checkout begins, then the Worker creates a server-side checkout or payment session with package id, user id, and idempotency metadata.

> **`/goal` translation**: `checkout tests pass: POST /api/strytree/checkout/sessions returns a provider session id and redirect_url; no ledger event exists at session creation time`

**PRD-STR-E04-AC-02** — Webhook-confirmed wallet credit
Given the payment provider sends a success webhook, when the webhook signature and payment status are verified, then the server credits the user's wallet through an append-only ledger event.

> **`/goal` translation**: `webhook-credit tests pass: replaying a valid signed webhook fixture inserts exactly one purchase_credit ledger event; user balance increases by the package credit amount`

**PRD-STR-E04-AC-03** — Pending state before webhook
Given the browser returns to the success page before webhook fulfillment, when the wallet is queried, then the UI shows pending status until the server ledger confirms credit.

> **`/goal` translation**: `wallet-pending tests pass: GET /api/strytree/wallet returns pending_payment status when a checkout session exists but no ledger credit event has been written`

**PRD-STR-E04-AC-04** — Idempotent webhook replay
Given a webhook is replayed, when the event id already exists, then no duplicate credits are issued.

> **`/goal` translation**: `replay tests pass: sending the same webhook payload twice results in exactly one ledger event and one credit increment; second replay returns 200 without writing a second row`

### PRD-STR-E05 - Branch Unlock And Creator Split

As a paying fan, I want to unlock protected branches once, so that I can return to them later.

As a creator, I want unlock revenue to be attributable, so that creator earnings can be audited.

**PRD-STR-E05-AC-01** — Transactional unlock with split
Given a protected branch has an unlock price, when an eligible user confirms unlock, then the per-buyer ledger actor durably records one debit with frozen price and creator/platform allocation; a separate atomic D1 batch grants entitlement, increments the paid-unlock count, and records the success audit. Allocation metadata does not credit a creator wallet or prove payout.

> **`/goal` translation**: `unlock tests pass: POST /api/strytree/nodes/:nodeId/unlock commits one authoritative debit and one complete entitlement/count/audit effect; interrupted finalization retries without another charge, with original allocation preserved — verified by the native ledger and API contract suites`

**PRD-STR-E05-AC-02** — Idempotent re-unlock
Given a user repeats an unlock, when an earlier debit exists for the same buyer, node, and client key, then the server verifies that authoritative effect and completes or returns its entitlement without charging again, preserving original price and creator allocation even when current terms change.

> **`/goal` translation**: `re-unlock tests pass: a second unlock request for the same user-node pair returns entitlement: full and no new ledger debit event`

**PRD-STR-E05-AC-03** — Insufficient balance rejection
Given insufficient balance and no prior matching paid effect, when a new unlock is requested, then no debit or entitlement is created and the API returns a typed insufficient-balance error; a paid retry is recovered before checking the current balance.

> **`/goal` translation**: `insufficient-balance tests pass: unlock request when balance < unlock_price_credits returns 402 with error code insufficient_balance and no strytree_unlocks or ledger row is written`

CID `commerce.request-efficiency.unlock` connects E05 to [C6 recovery](./agentic-graph-strytree-tad-workflows-api.md#workflow-unlock-protected-branch), [ADR-006](./agentic-graph-strytree-adr-validation.md#adr-006-atomic-credit-debit--durable-object-vs-d1-row-lock), and [the current RAO/SVO and evidence boundary](./agentic-graph-mainpanel-commerce-prd-tad.md#paid-unlock-recovery-status).

### PRD-STR-E06 - external video provider Generation Harness

As a co-creator, I want inherited characters and scenes to be assembled into a bounded generation request, so that visual continuity survives branch forks.

**PRD-STR-E06-AC-01** — Ancestor asset inheritance
Given a selected parent node, when the generate modal opens, then inherited character, scene, and style assets are loaded from ancestor assets.

> **`/goal` translation**: `asset-inheritance tests pass: generation modal receives asset_ids from all ancestor nodes in the parent chain up to the story root; no UI-side asset assembly is performed`

**PRD-STR-E06-AC-02** — Typed payload validation before provider call
Given a user submits prompt, selected characters, scene, model, duration, and camera movement, when validation passes, then a typed harness payload is created before any provider call.

> **`/goal` translation**: `harness-validation tests pass: malformed generation requests are rejected at the schema validation step with a typed error and no ledger debit or provider call occurs`

**PRD-STR-E06-AC-03** — Server-side credentials
Given external video provider credentials are configured, when generation is submitted, then the Worker or local harness calls external video provider using server-side secrets, not browser-exposed keys.

> **`/goal` translation**: `credential-audit passes: build scan of client bundle finds no EXTERNAL_VIDEO_PROVIDER_API_KEY string; Worker integration test confirms provider call uses env-injected secret`

**PRD-STR-E06-AC-04** — Structured fallback on provider failure
Given a confirmed provider failure, when generation closes, then the system retains structured failure context and linked refund evidence. Explicit local-mode artifacts remain distinguishable from provider output; unknown submission outcomes require reconciliation.

> **`/goal` translation**: `fallback tests pass: native generation fixtures preserve confirmed failure/refund evidence, retain unknown submissions without repeat submission or refund, and replay frozen finalization bytes after interrupted artifact writes`

### PRD-STR-E07 - Observability And Governance

As a agentic-graph operator, I want every value-changing action to have audit records, so that disputes and cost overruns can be investigated.

**PRD-STR-E07-AC-01** — Audit event coverage
Given a generation, purchase, unlock, refund, publish, or moderation action occurs, when the operation completes, then an audit event exists with actor, object, idempotency key, status, timestamps, and cost fields where applicable.

> **`/goal` translation**: `audit-coverage tests pass: after executing one each of generation, purchase, unlock, refund, publish, and moderation fixture actions, strytree_audit_events contains exactly one row per action with non-null actor_user_id, object_type, object_id, status, and created_at`

**PRD-STR-E07-AC-02** — Budget circuit breaker
Given provider spend exceeds budget, when a new generation is attempted, then a circuit breaker blocks the job and returns a typed budget error.

> **`/goal` translation**: `circuit-breaker tests pass: POST /api/strytree/generation-jobs returns 429 with error code provider_budget_exceeded when the daily provider spend counter in KV is at or above the configured limit; no ledger debit or provider call is made`

**PRD-STR-E07-AC-03** — Moderation gate
Given public content is published, when moderation status is unresolved, then the branch is not promoted to public discovery.

> **`/goal` translation**: `moderation-gate tests pass: a node with moderation_status pending or rejected is absent from the public snapshot response and absent from active_branch_count`

### PRD-STR-E08 - ForkCompare Branch Candidate Workbench

As a solo creator, I want to generate, compare, score, and merge multiple continuation candidates from one parent branch, so that I can choose the highest-value story path without wasting provider credits or losing visual continuity.

As a agentic-graph operator, I want every candidate to carry a cost, latency, moderation, and continuity scorecard, so that Strytree can optimize for token performance, TCO, and publishing quality rather than raw model output volume.

**PRD-STR-E08-AC-01** — Bounded candidate fan-out
Given a creator selects a parent story node, when they request continuation candidates, then the server freezes 1–3 deterministic alternatives and their credit cost before debit, completes them atomically, and invokes no candidate-only queue or provider call. Provider-backed candidate fan-out remains outside the current implementation.

> **`/goal` translation**: `candidate-run tests pass: POST /api/strytree/candidate-runs inserts one bounded run row, rejects max_candidates > 3, writes no provider job before schema validation and quote acceptance, and returns 202 with candidate_run_id`

**PRD-STR-E08-AC-02** — Cost-aware candidate scorecard
Given candidates complete or fail, when the workbench reads the run, then each candidate displays provider, credit cost, elapsed time, fallback status, moderation state, inherited asset coverage, continuity score, and publish eligibility.

> **`/goal` translation**: `candidate-scorecard tests pass: GET /api/strytree/candidate-runs/:id returns scorecards for every candidate with non-null provider, credit_cost, elapsed_ms, moderation_status, inherited_asset_count, continuity_score, and publish_eligible fields`

**PRD-STR-E08-AC-03** — Merge selected candidate into one durable branch
Given the creator selects a candidate, when they publish or merge it, then the server inserts exactly one child node with `parent_node_id`, stores rejected candidates as private audit artifacts, and invalidates the story snapshot cache.

> **`/goal` translation**: `candidate-merge tests pass: POST /api/strytree/candidates/:candidateId/publish creates one strytree_nodes child row, links it to selected_candidate_id, preserves rejected candidates as non-public rows, and the next snapshot includes exactly one new child edge`

**PRD-STR-E08-AC-04** — Existing-surface, Cloudflare-native UI
Given the candidate workbench is enabled, when it renders in agentic-graph, then it uses the existing Strybldr/Storyboard/Strytree SVG/HTML card surface and Cloudflare bindings already in the topology; no external graph UI package, hosted database service, or alternate hosting path is introduced.

> **`/goal` translation**: `candidate-workbench stack guard passes: source scan and dependency lockfile scan show no new graph-rendering package, no new hosted database SDK, and no non-Cloudflare deployment target for Strytree candidate workbench code`

## B6. MoSCoW Prioritization

**ROI formula**: `ROI = (User Impact × Reach) / (Build Hours + Monthly TCO + Token Cost / Month)`
User Impact: 1–5 (pain severity × frequency). Reach: estimated sessions/month at MVP. Build Hours: solo-dev estimate. Monthly TCO: infra + API cost. Token Cost: provider credit cost at target load.

| Priority | Feature | Impact | Reach | Build h | TCO/mo | Token/mo | ROI | Rationale |
|---|---|---:|---:|---:|---:|---:|---:|---|
| **Must** | Persistent story graph with parent-derived edges | 5 | 50 | 10 | 0 | 0 | 25.0 | Zero-dependency schema; highest product foundation value. |
| **Must** | Server-owned credit-token ledger | 5 | 50 | 8 | 0 | 0 | 31.3 | Required before any real payment or generation spend. |
| **Must** | Payment webhook-to-ledger crediting | 5 | 30 | 10 | 0 | 0 | 15.0 | Prevents client-side balance fraud. |
| **Must** | Unlock transaction with entitlement and split | 5 | 30 | 10 | 0 | 0 | 15.0 | Required for monetization claims. |
| **Must** | external video provider server-side harness boundary | 5 | 30 | 12 | 0 | 5 | 8.8 | Prevents browser key exposure; bounds provider spend. |
| **Should** | ForkCompare branch candidate workbench | 4 | 40 | 8 | 0 | 3 | 14.5 | Reuses existing card/SVG surfaces to improve branch quality per credit spent. |
| **Should** | Async job queue for generation polling | 4 | 30 | 6 | 0 | 0 | 20.0 | Decouples HTTP from provider poll; required for > 30 s generation. |
| **Should** | Atomic credit debit via Durable Object or Postgres lock | 4 | 30 | 5 | 0 | 0 | 24.0 | Prevents double-spend under concurrent requests. |
| **Should** | Anonymous-to-authenticated account linking | 4 | 20 | 8 | 0 | 0 | 10.0 | Improves conversion without blocking MVP. |
| **Could** | Durable Objects for live collaborative branch editing | 3 | 10 | 16 | 0 | 0 | 1.9 | Valuable later; not required for async story publishing. |
| **Could** | Graph analytics ranking and recommendations | 2 | 20 | 14 | 0 | 2 | 2.5 | Useful after activity data exists. |
| **Won't** | Client-owned wallet mutation | 0 | — | — | — | — | 0.0 | Security anti-pattern. |
| **Won't** | Exposing external video provider API key in static HTML | 0 | — | — | — | — | 0.0 | Credential leakage anti-pattern. |

### Min-Viable Scope

The smallest production-grade slice is:

1. Public story browsing with server-fed graph snapshot.
2. Durable session/auth gate for value-changing actions.
3. D1-backed story nodes with parent-derived edges.
4. R2-backed media asset references.
5. Append-only credit-token ledger with atomic debit (Durable Object or Postgres row lock).
6. Async job queue (Cloudflare Queue) decoupling generation submission from provider polling.
7. Stripe or existing agentic-graph commerce checkout with webhook-confirmed wallet credit.
8. Transactional branch unlock entitlement.
9. external video provider generation behind a server-side harness with debit/refund.

### Recommended Add-On Scope

The highest-ROI enhancement after the secure Strytree MVP is the **ForkCompare Branch Candidate Workbench**:

1. Creator selects a parent story node and requests up to three continuation candidates.
2. The server freezes a bounded deterministic candidate plan before debit, then completes candidate rows, scorecards, and audit atomically in D1.
3. Candidate-only preparation invokes no provider or queue consumer; its scorecards describe local fallback content and cost, continuity, and moderation fields.
4. The UI renders candidate cards inside the existing Strybldr/Storyboard/Strytree SVG/HTML surface.
5. Creator publishes exactly one selected candidate as a durable child node; rejected candidates remain private audit artifacts.

This add-on is recommended because it converts AI spend into better editorial choice without adding a new graph library, database service, or hosting surface. It is min-viable-max-value: small schema/API/UI extension, bounded local preparation, and explicit token/cost accounting. Buyer value and live generated-media quality still need validation.

### Out Of Scope

- Real-time multi-user branch editing.
- Secondary marketplace payout automation.
- Recommendation ranking beyond basic likes/impressions.
- Native mobile app.
- Blockchain-only payment settlement.
- Biometric identity persistence or face recognition.

## B7. Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---:|---:|---|
| Public tree load success | Prototype static only | 99% API snapshot success in preview | MVP |
| Durable branch publish | 0 | 1 persisted child branch after reload | MVP |
| Ledger double-spend incidents | Not applicable | 0 duplicate debits under retry tests | MVP |
| Webhook duplicate credit incidents | Not applicable | 0 duplicate credits under replay fixture | MVP |
| Generation refund correctness | Mock refund only | 100% provider failure refunds in tests | MVP |
| Unlock entitlement persistence | In-memory only | Entitlement survives reload and new device session | MVP |
| Credit-token cost per generation | 5 mock credits | Configurable server quote, default 5 credits | MVP |
| Monthly TCO | Static hosting only | Cloudflare free/low tier plus payment/provider variable cost | MVP |
| LLM/model token budget | None | Cost log per AI/provider call | MVP |
| Candidate compare cost transparency | None | 100% candidate cards show credit cost, elapsed time, fallback status, and publish eligibility | Add-on |
| Candidate merge correctness | None | Exactly one selected candidate becomes a public child node per publish action | Add-on |
| Candidate provider waste | Unknown | Rejected candidate artifacts stay private and auditable; no public graph mutation | Add-on |

---
