---
title: "Strytree Part C and C1-C5"
doc_type: "TAD Companion"
status: "implementation-contract"
lang: "en-US"
frontmatter_contract: "required"
source_contract: "./agentic-graph-strytree-prd-tad.md"
---

[Canonical PRD/TAD and section index](./agentic-graph-strytree-prd-tad.md).

# Part C - Technical Architecture Document

## C1. Architecture Overview

From prototype to production:

```mermaid
flowchart TB
  Browser["Strytree UI in agentic-graph"]
  ForkCompare["ForkCompare Workbench (existing card/SVG surface)"]
  Auth["Auth Middleware (JWT validate)"]
  Worker["Strytree Worker API"]
  D1["Cloudflare D1 relational store"]
  R2["Cloudflare R2 media store"]
  KV["Workers KV cache / flags / budget counters"]
  Queue["Cloudflare Queue (async generation jobs)"]
  Consumer["Queue Consumer Worker (external video provider poll + R2 write)"]
  CandidateScorer["Candidate scorecard harness"]
  Commerce["Commerce adapter and Stripe Checkout"]
  Webhook["Payment webhook handler"]
  Ledger["Credit-token ledger service"]
  external video provider["external video provider provider API"]
  Audit["Audit and cost events"]

  Browser --> Auth
  Browser --> ForkCompare
  ForkCompare --> Auth
  Auth --> Worker
  Worker --> D1
  Worker --> R2
  Worker --> KV
  Worker --> Commerce
  Commerce --> Webhook
  Webhook --> Ledger
  Worker --> Ledger
  Worker --> Queue
  Queue --> Consumer
  Consumer --> external video provider
  Worker --> CandidateScorer
  CandidateScorer --> D1
  Consumer --> R2
  Consumer --> D1
  Worker --> Audit
  Ledger --> D1
  Audit --> D1
```

The client remains responsible for local interaction, SVG layout, preview UI, and optimistic disabled states. The server owns anything that grants or spends value.

## C2. Journey To System Mapping

| Journey Stage | Workflow | Data Flow | Component |
|---|---|---|---|
| Discover | Fetch public story | Story snapshot read | Storytree Snapshot API |
| Preview | Open node panel | Entitlement hint and media URL | Access Policy Service |
| Commit | Quote spend | Cost quote read | Credit Ledger Service |
| Generate | Submit generation | Debit/hold -> external video provider job -> artifact | Generation Harness |
| Compare | Request candidate alternatives | Frozen deterministic candidates -> completed scorecards -> selected publication | ForkCompare Workbench |
| Publish | Attach result | Generation result -> node insert -> graph snapshot | Story Graph Service |
| Purchase | Buy credits | Checkout session -> webhook -> ledger credit | Commerce Adapter |
| Unlock | Unlock branch | Frozen actor debit -> replayable D1 entitlement/count/audit batch | Unlock Transaction Service |

## C3. Target Components

| Layer | Component | Responsibility | Implemented Owner |
|---|---|---|---|
| UI | Strytree Entry Surface | Opens Strybldr/Storytree mode from existing renderer controls and floating panel. | `canvas/src/features/strybldr/StrybldrFloatingPanelView.tsx`; `canvas/src/components/StoryboardCanvas.tsx` |
| UI | Storytree SVG Renderer | Renders nodes and node panel and PROJECTS parent_node_id-derived edges through the shared renderer contract (view state only; no edge recomputation), with pan and zoom, on the existing Storyboard/Strybldr canvas. | `canvas/src/components/StoryboardCanvas.tsx`; `canvas/src/features/strybldr/strybldrStoryboard.ts` |
| UI | Generation Action Surface | Collects or drafts continuation prompts through existing storytree card actions and Run all handoff. | `canvas/src/components/StoryboardCanvas.tsx`; `canvas/src/features/strybldr/strytreeWorkflow.ts` |
| UI | Wallet/Unlock Controls | Displays quote/unlock controls and local proof states while server-owned wallet APIs own mutation. | `canvas/src/components/StoryboardCanvas.tsx`; `cloudflare/workers/agentic-graph-payment/strytreeApi.ts` |
| UI | ForkCompare Workbench | Renders up to three private candidate cards, scorecards, merge controls, and publish eligibility inside the existing card/SVG surface. | `canvas/src/components/StoryboardCanvas.tsx`; `canvas/src/features/strybldr/strytreeWorkflow.ts` |
| API | Auth Middleware | Validates Strytree session bearer tokens at Worker edge; attaches session context to every request. | `cloudflare/workers/agentic-graph-payment/strytreeApi.ts` |
| API | Storytree Snapshot API | Serves public graph snapshot plus entitlement hints. | `cloudflare/workers/agentic-graph-payment/strytreeApi.ts` |
| API | Story Graph Service | Persists stories, nodes, assets, stats, and status. | `cloudflare/workers/agentic-graph-payment/strytreeApi.ts`; `cloudflare/d1/migrations/0004_strytree_storytree.sql` |
| API | Access Policy Service | Resolves free-window, ownership, and unlock entitlement. | `cloudflare/workers/agentic-graph-payment/strytreeApi.ts` |
| API | Credit Ledger Service | Owns per-buyer SQLite balance/event commits and validated replay; separately projects the authoritative event to D1. | `cloudflare/workers/agentic-graph-payment/strytreeCreditLedger.ts`; `strytreeData.ts` |
| API | Commerce Adapter | Creates checkout sessions and receives signed webhooks. | `cloudflare/workers/agentic-graph-payment/strytreeApi.ts`; `cloudflare/workers/agentic-graph-payment/index.ts` |
| API | Unlock Transaction Service | Recovers frozen actor debit, then atomically finalizes entitlement/count/audit in D1 with exact completion proof. | `cloudflare/workers/agentic-graph-payment/strytreeStory.ts`; `strytreeData.ts` |
| API | Generation Harness | Freezes request intent before debit, dispatches recoverable jobs, and finalizes provider outcomes. | `cloudflare/workers/agentic-graph-payment/strytreeGeneration.ts`; `strytreeGenerationDispatch.ts`; `strytreeGenerationProvider.ts` |
| API | Candidate Run Service | Freezes bounded deterministic candidates before debit; atomically completes rows/audit/run and publishes a selected complete candidate. | `cloudflare/workers/agentic-graph-payment/strytreeCandidates.ts` |
| API | Candidate Scorecard Harness | Scores completed candidates for continuity, inherited asset coverage, moderation state, latency, and credit cost without adding hidden model calls. | `cloudflare/workers/agentic-graph-payment/strytreeApi.ts`; `canvas/src/features/strybldr/strybldrStoryboard.ts` |
| Async | Async Job Queue | Decouples generation submission from provider polling; consumer Worker polls external video provider and writes R2. | `cloudflare/workers/agentic-graph-payment/index.ts`; `cloudflare/workers/agentic-graph-payment/strytreeApi.ts` |
| API | Audit Event Service | Records all value-changing actions with idempotency key, actor, and cost fields where Strytree routes mutate state. | `cloudflare/workers/agentic-graph-payment/strytreeApi.ts` |
| Data | D1 | Relational graph, wallet ledger, entitlements, audit events. | Cloudflare D1 |
| Data | R2 | Videos, posters, thumbnails, prompt artifacts, provider outputs. | Cloudflare R2 |
| Data | KV | Read-heavy graph cache, feature flags, idempotency short cache, budget counters. | Workers KV |
| Runtime | Durable Object | Per-user atomic credit-ledger mutation actor for debit, credit, refund, and idempotent replay; future live branch editing room. | `StrytreeCreditLedgerActor` |

## C4. Data Model

The SQL below preserves the base model. Executable schema belongs to the committed migrations, including `cloudflare/d1/migrations/0014_strytree_ledger_authority.sql` for ledger `semantic_digest`, `authority_version`, and provider claims. The actor owns its SQLite authority schema; D1 is its validated projection, not a substitute mutation authority.

### D1 Tables

```sql
CREATE TABLE strytree_users (
  id TEXT PRIMARY KEY,
  auth_subject TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE strytree_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  anonymous_subject TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  linked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES strytree_users(id)
);

CREATE TABLE strytree_stories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  tagline TEXT,
  status TEXT NOT NULL,
  poster_object_key TEXT,
  root_node_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE strytree_nodes (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  parent_node_id TEXT,
  creator_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  synopsis TEXT NOT NULL,
  prompt TEXT,
  status TEXT NOT NULL,
  visibility TEXT NOT NULL,
  is_free_window INTEGER NOT NULL DEFAULT 1,
  unlock_price_credits INTEGER NOT NULL DEFAULT 0,
  video_object_key TEXT,
  thumbnail_object_key TEXT,
  age_days INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  impressions_count INTEGER NOT NULL DEFAULT 0,
  paid_unlocks_count INTEGER NOT NULL DEFAULT 0,
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (story_id) REFERENCES strytree_stories(id),
  FOREIGN KEY (parent_node_id) REFERENCES strytree_nodes(id),
  FOREIGN KEY (creator_user_id) REFERENCES strytree_users(id)
);

CREATE INDEX idx_strytree_nodes_story_parent
  ON strytree_nodes(story_id, parent_node_id);

CREATE TABLE strytree_assets (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  owner_node_id TEXT,
  asset_type TEXT NOT NULL,
  name TEXT NOT NULL,
  ref_name TEXT,
  external_provider_image_id TEXT,
  object_key TEXT,
  prompt_prefix TEXT,
  negative_prompt TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (story_id) REFERENCES strytree_stories(id),
  FOREIGN KEY (owner_node_id) REFERENCES strytree_nodes(id)
);

CREATE TABLE strytree_node_asset_refs (
  node_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  ref_role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (node_id, asset_id, ref_role),
  FOREIGN KEY (node_id) REFERENCES strytree_nodes(id),
  FOREIGN KEY (asset_id) REFERENCES strytree_assets(id)
);

CREATE TABLE strytree_unlocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  ledger_event_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, node_id),
  FOREIGN KEY (user_id) REFERENCES strytree_users(id),
  FOREIGN KEY (node_id) REFERENCES strytree_nodes(id)
);

CREATE TABLE strytree_token_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  amount_credits INTEGER NOT NULL,
  balance_after_credits INTEGER NOT NULL,
  related_object_type TEXT,
  related_object_id TEXT,
  provider_event_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES strytree_users(id)
);

CREATE TABLE strytree_generation_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  parent_node_id TEXT NOT NULL,
  status TEXT NOT NULL,
  debit_ledger_event_id TEXT,
  refund_ledger_event_id TEXT,
  provider TEXT NOT NULL,
  provider_job_id TEXT,
  request_json TEXT NOT NULL,
  result_json TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE strytree_candidate_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  parent_node_id TEXT NOT NULL,
  status TEXT NOT NULL,
  max_candidates INTEGER NOT NULL,
  quoted_cost_credits INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_json TEXT NOT NULL,
  scorecard_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES strytree_users(id),
  FOREIGN KEY (story_id) REFERENCES strytree_stories(id),
  FOREIGN KEY (parent_node_id) REFERENCES strytree_nodes(id)
);

CREATE TABLE strytree_branch_candidates (
  id TEXT PRIMARY KEY,
  candidate_run_id TEXT NOT NULL,
  generation_job_id TEXT,
  user_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  parent_node_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT,
  synopsis TEXT,
  prompt TEXT,
  video_object_key TEXT,
  thumbnail_object_key TEXT,
  credit_cost INTEGER NOT NULL DEFAULT 0,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  inherited_asset_count INTEGER NOT NULL DEFAULT 0,
  continuity_score REAL NOT NULL DEFAULT 0,
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  publish_eligible INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  token_cost_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_run_id) REFERENCES strytree_candidate_runs(id),
  FOREIGN KEY (generation_job_id) REFERENCES strytree_generation_jobs(id),
  FOREIGN KEY (user_id) REFERENCES strytree_users(id),
  FOREIGN KEY (story_id) REFERENCES strytree_stories(id),
  FOREIGN KEY (parent_node_id) REFERENCES strytree_nodes(id)
);

CREATE TABLE strytree_candidate_merge_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  parent_node_id TEXT NOT NULL,
  selected_candidate_id TEXT NOT NULL,
  status TEXT NOT NULL,
  merge_json TEXT NOT NULL,
  published_node_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES strytree_users(id),
  FOREIGN KEY (story_id) REFERENCES strytree_stories(id),
  FOREIGN KEY (parent_node_id) REFERENCES strytree_nodes(id),
  FOREIGN KEY (selected_candidate_id) REFERENCES strytree_branch_candidates(id),
  FOREIGN KEY (published_node_id) REFERENCES strytree_nodes(id)
);

CREATE TABLE strytree_audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
```

### Edge Strategy

`strytree_nodes.parent_node_id` is the edge SSOT for MVP. A separate `story_edges` table is rejected until there is a measured need for non-tree graph edges, edge labels, branch merges, or graph analytics that cannot be derived cheaply.

### Edge Rendering Contract

**Renderer-projection policy.** Edges are a pure projection of source-owned data. The frontmatter (`kgSharedRendererContract`, `flow.storyEdgeProjection`) and the source payloads (`strytree_nodes.parent_node_id`) own all edge data; renderers project view state only. Renderers MUST NOT re-calculate, re-compute, or re-render source-owned edges, and MUST NOT own, mutate, or duplicate edge data.

**Renderer-agnostic rule.** The same shared `kgSharedRendererContract@shared-renderer-contract/v1` + `buildScopedGraphSemanticKey` (edge identity) + `socket_types` (edge/socket typing) + the `flow` port/handle model (`flow.edgeType`, `flow.direction`, per-node `handles`, `flow:portTypes`) drives edge projection regardless of the active 2D renderer. Any renderer-specific edge code path, per-renderer hardcode, or per-renderer fork of edge logic is forbidden; the supported renderer set is projected data, never a branch target.

**Cross-document unification rule.** Strytree `parent_node_id`-derived edges and the demo flow nodes/handles resolve to the SAME shared edge projection through the canonical `storyboard` renderer. Switching Card/Widget presentation MUST produce no recompute, duplicate, or stale edge state; the same logical edge projects identically through the shared renderer contract.

## C5. Access Control Contract

### Access Levels

| Access Level | Allowed Behavior | Required State |
|---|---|---|
| Anonymous viewer | Browse public stories, see topology, read synopsis, watch free-window videos. | HMAC session or no session for static public reads. |
| Durable user | Generate branches, buy credits, unlock protected videos, publish branches. | `strytree_users.id` and valid session. |
| Creator | Edit own draft branches, inspect own revenue events. | User owns node or story role grant. |
| Operator | Moderate, hide, refund, inspect audit trails. | Admin/operator role. |

### Entitlement Decision

```text
can_view_full_video =
  node.visibility == "public"
  AND node.moderation_status == "approved"
  AND (
    node.is_free_window == true
    OR user owns node
    OR user has strytree_unlocks(user_id, node_id)
    OR user has operator role
  )
```

The browser can receive an `entitlement_hint`, but the media URL must be generated by the server only after the entitlement decision.

Current boundary: POST unlock requires complete ledger/entitlement/audit proof before reporting paid completion. Snapshot access still uses `strytreeData.ts::readUnlockedNodeIds`, which selects existing entitlement rows directly. Legacy partial entitlement rows are not universally hidden by that snapshot read; remediation and deployed media-delivery proof remain separate work. The decision above is the access-policy requirement, not evidence that every legacy row satisfies it.
