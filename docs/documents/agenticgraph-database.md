# Legacy AgenticGraph Database — From 0 to 1 (RxDB → PostgreSQL)

> Legacy planning note: this document describes an older RxDB-to-PostgreSQL proposal. The current authority is Git-backed authored Markdown/frontmatter; Cloudflare D1 and the browser-local store are structured and working projections. See `agenticgraph-storage-sync-document.md` and `agenticgraph-storage-schemas-document.md` for the active contract.

This document describes a **lean, MVP** database path for AgenticGraph:

- **Local-first** data in the UI using **RxDB**
- **Optional sync / publish** to a **PostgreSQL** backend
- **JSON-first** storage and transport (SSOT: GraphData + operational documents)

It includes **User Flow**, **Work Flow**, and **Data Flow** for “RxDB → PostgreSQL”.

> Context: Dev (`${AG_GITHUB_ROOT}/agenticgraph`) -> Prod artifact mirror (`${AG_GITHUB_ROOT}/huijoohwee/content/agenticgraph`) -> Cloudflare Pages (`airvio.co/agenticgraph`).
>
> Constraint: Cloudflare Pages is static hosting. If you want a real PostgreSQL-backed API, you need a backend runtime (e.g., Cloudflare Workers + managed Postgres, or any other free-tier-friendly host).

---

## 1) Goals (MVP)

### 1.1 What RxDB is used for (frontend)

RxDB provides:

- Offline-first persistence for:
  - workspace state
  - GraphData snapshots
  - editor documents (markdown, JSON)
  - user settings and UI state
- Fast local queries and incremental updates
- Realtime reactive UI

### 1.2 What PostgreSQL is used for (backend)

PostgreSQL provides:

- A shared source for multi-device / multi-user collaboration
- Durable storage for:
  - versioned GraphData snapshots
  - workspace documents (JSON/markdown)
  - sync metadata (revisions, conflict state)
- Server-side indexing hooks (optional): e.g., codebase index runs, GraphRAG artifact storage

### 1.3 JSON-first principle (SSOT)

Keep SSOT in portable artifacts:

- **GraphData JSON** (canonical graph)
- **Workspace docs** (Markdown, JSON-LD, JSON)
- **Config** (schema-config JSON-LD, orchestrator YAML, etc.)

The database stores these as JSON documents + minimal metadata (ids, timestamps, revision, owner, visibility).

---

## 2) From 0 to 1 (setup checklist)

### 2.1 Step 0 — Decide the operating mode

Pick one:

1. **Local-only (RxDB only)**:
   - Best for: single-user, low TCO, free-tier
   - Cloudflare Pages can host UI with no backend
2. **Sync mode (RxDB + PostgreSQL)**:
   - Best for: publish/share, multi-device, collaboration
   - Requires a backend API that talks to PostgreSQL

### 2.2 Step 1 — Define the minimal domain objects

MVP objects (JSON documents):

- `Workspace`
- `WorkspaceDocument` (markdown/json)
- `GraphSnapshot` (GraphData JSON)
- `SchemaConfig` (jsonld)
- `SyncState` (lastSyncedRev, deviceId, etc.)

### 2.3 Step 2 — Define IDs and versioning rules

Recommended:

- IDs are stable, string-based (uuid or slug+uuid)
- Every write increments a **monotonic revision** (per document)
- Store:
  - `id`
  - `rev` (integer) or `updatedAtMs`
  - `deleted` (soft delete tombstone)

### 2.4 Step 3 — Choose the sync transport (MVP)

Two MVP-friendly approaches:

1. **Pull/push JSON over HTTP** (simplest)
2. **Batch sync** (less chatty; better for cost)

Either way, keep server endpoints coarse-grained:

- `GET /sync/pull?since=<cursor>`
- `POST /sync/push` (batch of mutated docs)

---

## 3) User Flow (what a user experiences)

### 3.1 Local-first (RxDB only)

1. User opens `airvio.co/agenticgraph`
2. Creates/edits:
   - graph
   - workspace markdown notes
   - settings
3. Everything persists locally (RxDB)
4. Export/share happens via:
   - “Export GraphData JSON / JSON-LD / CSV”
   - file download or Git commit (manual)

### 3.2 Sync to PostgreSQL (publish/share)

1. User signs in (or gets a workspace token)
2. User creates/edits locally (RxDB)
3. Background sync runs:
   - upload local changes to server
   - download remote changes into RxDB
4. User can:
   - open the same workspace on another device
   - share a read-only link (backed by server storage)

---

## 4) Work Flow (operational steps)

## 4.1 Frontend write path (RxDB)

1. UI event → validate input
2. Write to RxDB collection(s)
3. RxDB emits reactive updates → UI re-renders
4. (optional) enqueue “outbox” sync item

### 4.2 Sync loop (RxDB → server → RxDB)

**Push phase (client → server)**

1. Collect local mutations since `lastPushedCursor`
2. Batch into a JSON payload
3. POST to server
4. Server returns ack + conflicts (if any)

**Pull phase (server → client)**

1. Client requests changes since `lastPulledCursor`
2. Server returns changed docs (JSON)
3. Client upserts into RxDB
4. Update cursors

### 4.3 Conflict handling (MVP)

Pick one MVP strategy:

1. **Last write wins** (lowest effort; acceptable for personal workflows)
2. **Field-level merge** for specific docs (only if needed)
3. **Manual conflict documents** (server returns “conflict records” and UI asks user)

Recommendation for MVP:

- Start with **last write wins** + emit conflict metadata for audit (do not silently discard).

---

## 5) Data Flow (RxDB → PostgreSQL)

### 5.1 Logical pipeline

```
UI actions
  → RxDB (local collections)
    → Outbox (mutations)
      → Sync API (JSON)
        → PostgreSQL (JSONB + metadata)
          → Sync API (JSON)
            → RxDB (remote upserts)
```

### 5.2 What gets stored as JSON

Store the SSOT payloads directly:

1. `GraphSnapshot.graph` (GraphData JSON)
2. `WorkspaceDocument.content` (Markdown string or structured JSON)
3. `SchemaConfig.document` (JSON-LD)

In PostgreSQL, use JSONB to retain JSON structure while enabling indexing later.

### 5.3 Suggested PostgreSQL tables (MVP)

Keep schema MECE and minimal:

1. `workspaces`
   - `id`, `owner_id`, `created_at`, `updated_at`, `visibility`, `title`
2. `documents`
   - `id`, `workspace_id`, `type`, `rev`, `updated_at`, `deleted`
   - `content_jsonb` (for JSON docs) and/or `content_text` (for markdown)
3. `graph_snapshots`
   - `id`, `workspace_id`, `rev`, `updated_at`, `deleted`
   - `graph_jsonb` (GraphData JSON)
4. `sync_events` (optional audit)
   - `id`, `workspace_id`, `device_id`, `pushed_at`, `pulled_at`, `stats_jsonb`

### 5.4 Suggested indexes (MVP)

- `(workspace_id, updated_at)`
- `(workspace_id, rev)`
- `(workspace_id, deleted)`

Avoid heavy JSONB indexes until you have a concrete query need (cost control).

---

## 6) Integration boundaries (Dev → Prod → Cloudflare)

### 6.1 Cloudflare Pages (UI)

- Hosts static UI bundle
- RxDB runs fully in the browser
- No secrets in the UI bundle

### 6.2 Backend API (required for PostgreSQL)

If you want PostgreSQL, you need:

- a runtime service to expose sync endpoints
- secure auth / workspace access control
- database connectivity

Cloudflare Pages alone cannot do this; typically you add:

- Cloudflare Workers (API) + a managed PostgreSQL provider

---

## 7) Minimal API surface (JSON endpoints)

MVP endpoints (JSON):

1. `POST /auth/login` (optional; depends on your auth strategy)
2. `POST /sync/push`
   - request: `{ workspaceId, deviceId, mutations: [...] }`
   - response: `{ ackCursor, conflicts: [...], serverTimeMs }`
3. `GET /sync/pull?workspaceId=...&since=...`
   - response: `{ nextCursor, changes: [...] }`
4. `GET /workspace/:id/export`
   - response: `{ graphData, documents, schemaConfigs }` (all JSON)

Keep the payload format stable and versioned:

- Include `apiVersion` in responses.

---

## 8) Security + cost control (free-tier mindset)

### 8.1 Security (minimum viable)

- All writes require auth (token or signed workspace key)
- Server validates `workspaceId` permissions
- Store only what you need (no redundant snapshots unless requested)

### 8.2 Cost control

- Prefer **batch sync** over chatty per-edit requests
- Use cursors and `updated_at` windows to limit transfer size
- Avoid expensive server-side JSONB indexes until query demand is proven

---

## 9) “Good enough” MVP milestones

1. **Local-only stable**: RxDB persists workspace and GraphData reliably
2. **Export/import stable**: JSON/JSON-LD/CSV roundtrips
3. **Sync MVP**: push/pull JSON to PostgreSQL (no fancy merge)
4. **Share MVP**: read-only workspace export via server
