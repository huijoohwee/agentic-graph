---
title: "Knowgrph Storage Schemas and Route Contracts"
id: "md:knowgrph-storage-schemas-document"
version: "2.5.0"
updated: "2026-07-23"
status: "active"
doc_type: "Schema and Route Reference"
frontmatter_contract: "required"
document_runtime_status: "runtime-ready-dev"
runtime_scope: "Frontmatter parsing, source validation, MCP grammar resolution, and read-only Source Files discovery; route deployment status remains section-specific."
deploy_boundary: "No migration, Prod mirror, or Cloudflare mutation is authorized by this document."
mcp:
  grammar_tool: "knowgrph.agentic_canvas_os.docs.invoke"
  published_source_tools: ["search", "fetch"]
  webmcp_source_tools: ["knowgrph.list_source_files", "knowgrph.read_source_file"]
  source_availability: "Read-only after the document is present in the configured published Source Files workspace."
invocation:
  normalize: "/source.normalize @source.frontmatter @source.body #frontmatter #no-legacy"
  verify: "/runtime-ready.check @local-harness @runtime-proof #runtime-ready #vcc"
---

# Knowgrph Storage Schemas & Route Contracts

**Context**: Schema appendix for the Knowgrph storage and sync system.
**Intent**: Single reference for all record shapes, D1 tables, browser-local cache collections, and API route contracts.
**Directive**: Keep this file as a pure reference; architectural decisions and runtime wiring live in `knowgrph-storage-sync-document.md`.

---

**Version**: 2.5.0
**Date**: 2026-07-23
**Canonical index**: `knowgrph-storage-sync-document.md`
**See also**: `knowgrph-storage-schemas-extensions-document.md` (deferred auth relay and PostgreSQL extensions), `knowgrph-multi-user-collaboration-prd.tad.md` (auth tables, role-based access extension)

## Schema Principles

- Keep Git markdown as authoring truth.
- Store raw markdown once per document revision.
- Persist chunks and graph snapshots separately.
- Keep stable ids and monotonic revisions.
- Use hashes for dedupe and bounded prompt reuse.
- Keep browser-local names stable across the persisted-cache contract.
- Reject canonical paths longer than 1,024 characters and preserve identity for same-workspace/same-path upserts.
- Retain `sync_events` at or below 24 hours and prune only records older than that boundary.
- Skip D1 writes when every persisted field already matches.

## Implemented Browser And Sync Bounds

| Contract | Bound |
|---|---:|
| Push timeout | 30 seconds |
| Push attempts | 3 total |
| Backoff | 1 second, then 2 seconds; 30-second cap |
| Poll interval | 120 seconds |
| Local document revisions | Most recent 10 or more |
| Document version snapshots | Most recent 50 per path |
| Cloud read-back | At most 3 attempts |
| Canonical path | 1,024 characters |
| Import body | 10,485,760 bytes |
| URL import timeout | 30 seconds |
| `sync_events` TTL | 24 hours |

The browser implementation maps `documentRevision` to remote `revision` and `isDeleted` to remote `deleted` at the contract boundary. Dexie restores each record type independently and stores a separate durable collaboration update outbox. Equal document/chunk hashes reuse stored artifacts; semantic chunk references with a known hash carry zero markdown bytes. JSON-LD graph export also preserves its canonicalized edge id across repeated parse/print cycles.

## Shared Contract

Primary file: `canvas/src/lib/storage/knowgrphStorageSyncContract.ts`

```ts
export const KNOWGRPH_STORAGE_API_VERSION = '2026-05-04'

export const KNOWGRPH_STORAGE_ROUTE_PATHS = {
  push: '/api/storage/push',
  pull: '/api/storage/pull',
  collabSave: '/api/storage/collab/save',
  exportPrefix: '/api/storage/export/',
  docPrefix: '/api/storage/doc/',
  defaultDocPrefix: '/api/storage/doc-default/',
} as const
```

### Remote Document Shape

```ts
type KgDocumentRecord = {
  id: string
  workspaceId: string
  canonicalPath: string
  title: string | null
  docType: string | null
  lang: string | null
  graphId: string | null
  sourceKind: 'markdown'
  contentMd: string
  contentHash: string
  parserVersion: string
  revision: number
  updatedAtMs: number
  deleted: boolean
}
```

### Remote Chunk Shape

```ts
type KgDocumentChunkRecord = {
  id: string
  documentId: string
  workspaceId: string
  chunkKey: string
  chunkOrder: number
  heading: string | null
  markdown: string
  tokenEstimate: number
  contentHash: string
  updatedAtMs: number
}
```

### Remote Graph Snapshot Shape

```ts
type KgGraphSnapshotRecord = {
  id: string
  documentId: string
  workspaceId: string
  graphRevision: number
  graphHash: string
  graphJson: Record<string, unknown>
  layoutJson: Record<string, unknown> | null
  derivedFromDocumentRevision: number
  updatedAtMs: number
}
```

### Outbox Shape

```ts
type KnowgrphStorageOutboxRecord = {
  id: string
  workspaceId: string
  deviceId: string
  entity: 'document' | 'documentChunk' | 'graphSnapshot'
  op: 'upsert' | 'delete'
  recordId: string
  baseRevision: number | null
  payload: Record<string, unknown>
  payloadHash: string
  attemptCount: number
  lastAckStatus: 'applied' | 'conflict' | 'rejected' | 'deferred' | ''
  lastAckMessage: string | null
  createdAtMs: number
  updatedAtMs: number
}
```

### Collaboration Update Outbox Shape

The Yjs collaboration outbox is browser-local and separate from the D1 document sync outbox. A failed PocketBase write must remain durable and visible to retry logic; it must never be swallowed.

```ts
type CollaborationUpdateOutboxRecord = {
  updateId: string
  workspaceId: string
  documentKey: string
  provider: 'pocketbase' | 'durable-object'
  clientSeq: number
  updateBase64: string
  attemptCount: number
  acknowledgedAtMs: number | null
  createdAtMs: number
  updatedAtMs: number
}
```

Replay is idempotent by `updateId`, ordered per document, and retained until provider acknowledgement. Joining a room applies its compacted snapshot and ordered remote updates before replaying unacknowledged local records.

### Source Files Ownership Projection

This display model is derived at runtime and is not a new browser, D1, or PocketBase collection:

```ts
type SourceFilesOwnershipProjection = {
  knowgrphDocs: 'GitHub/knowgrph/docs'
  workspaceDocs: 'GitHub/huijoohwee/docs'
  workspaceSeeds: 'GitHub/knowgrph/docs/workspace-seeds'
  offlineFallback: 'IndexedDB'
}
```

The path resolver selects `workspaceSeeds` for `/docs/workspace-seeds/**`, rejects `huijoohwee/docs/workspace-seeds/**`, and refuses Agentic Canvas OS write targets. Explorer consumes the same constants, so labels cannot drift from save-bridge authority. The Agentic seed file remains a protected byte-identical runtime projection outside this write model.

The local filesystem bridge applies the same invariant. A seed mutation is valid only when its workspace key and resolved host path agree on `$GITHUB_ROOT/knowgrph/docs/workspace-seeds/**`; nested deletes are supported for rename/delete convergence, while deleting the root or omitting the ownership key is forbidden.

`WorkspaceDocsMirrorEntry.authority` distinguishes `knowgrph-workspace-seeds-local` from `knowgrph-workspace-seeds-bundled`. Either value admits exact subtree reconciliation; absence of both prevents stale-cache pruning. The bundled value identifies the complete six-file artifact built from the protected source revision, not a second writable repository. This marker is transient bootstrap metadata and is not added to PocketBase or D1 document rows.

---

## Browser-Local Cache Schema

Primary file: `canvas/src/lib/storage/knowgrphStorageDb.ts`

### Why Local Shapes Differ

The local cache keeps existing browser-local field names, so the store uses:

- `documentRevision` instead of remote `revision`
- `isDeleted` instead of remote `deleted`

### Collections

1. `documents`
2. `documentChunks`
3. `graphSnapshots`
4. `syncOutbox`
5. `syncCursor`

### Local Document Shape

```ts
type KgDocumentLocalRecord = {
  id: string
  workspaceId: string
  canonicalPath: string
  title: string | null
  docType: string | null
  lang: string | null
  graphId: string | null
  sourceKind: 'markdown'
  contentMd: string
  contentHash: string
  parserVersion: string
  documentRevision: number
  updatedAtMs: number
  isDeleted: boolean
}
```

### Index Guidance

| Collection | Index fields |
|---|---|
| `documents` | `workspaceId`, `canonicalPath`, `updatedAtMs` |
| `documentChunks` | `documentId`, `[documentId, chunkKey]`, `updatedAtMs` |
| `graphSnapshots` | `documentId`, `graphRevision`, `updatedAtMs` |
| `syncOutbox` | `workspaceId`, `updatedAtMs` |
| `syncCursor` | `workspaceId` |

### Local Role

- Working copy store
- Offline restore cache
- Prompt reuse cache
- Mutation outbox
- Pull cursor cache

---

## Cloudflare D1 Schema

Primary migration: `cloudflare/d1/migrations/0001_knowgrph_storage.sql`

### Media Asset Persistence Extension

AI/LLM-generated and user-uploaded media records use the Storage Worker media route as the runtime boundary. R2 owns the binary bytes, D1 owns searchable metadata and provenance, KV owns only short-lived access URL cache entries, and Durable Objects own room sync notifications for collaborators. Browser object URLs and provider URLs are not persistence records.

```sql
CREATE TABLE IF NOT EXISTS media_artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  run_id TEXT,
  room_id TEXT,
  card_id TEXT,
  field_key TEXT,
  media_kind TEXT NOT NULL,
  content_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_object_key TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  source_action TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  access_url_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, r2_object_key)
);

CREATE INDEX IF NOT EXISTS idx_media_artifacts_workspace_updated
  ON media_artifacts(workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_artifacts_room_updated
  ON media_artifacts(room_id, updated_at DESC);
```

| Field | Purpose |
|---|---|
| `media_kind` | Normalized `image`, `audio`, or `video` kind used by FloatingPanel Media and `@` insertion. |
| `r2_object_key` | Canonical R2 object key for the binary blob; never a browser object URL. |
| `provenance_json` | Provider/upload source, prompt/run/card context, operator action, and sync status evidence. |
| `access_url_expires_at` | Optional KV-backed access URL expiry; null when no KV namespace is bound. |

### Tables

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  canonical_path TEXT NOT NULL,
  title TEXT,
  doc_type TEXT,
  lang TEXT,
  graph_id TEXT,
  source_kind TEXT NOT NULL DEFAULT 'markdown',
  content_md TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  revision INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, canonical_path)
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  chunk_key TEXT NOT NULL,
  chunk_order INTEGER NOT NULL,
  heading TEXT,
  markdown TEXT NOT NULL,
  token_estimate INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (document_id, chunk_key)
);

CREATE TABLE IF NOT EXISTS graph_snapshots (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  graph_revision INTEGER NOT NULL,
  graph_hash TEXT NOT NULL,
  graph_json TEXT NOT NULL,
  layout_json TEXT,
  derived_from_document_revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (document_id, graph_revision)
);

CREATE TABLE IF NOT EXISTS sync_devices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  device_label TEXT,
  last_pull_cursor TEXT,
  last_push_cursor TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES sync_devices(id) ON DELETE CASCADE
);
```

### Planned Authenticated Collaboration And Chat Relay Extension

Deferred authenticated relay tables, PocketBase provider-owned collaboration collections, route inputs, index guidance, and authorization rules live in `knowgrph-storage-schemas-extensions-document.md`. PocketBase collections are not D1 tables. The shipped anonymous D1 baseline remains `workspaces`, `documents`, `document_chunks`, `graph_snapshots`, `sync_devices`, and `sync_events`.

### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_documents_workspace_updated
  ON documents(workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_order
  ON document_chunks(document_id, chunk_order ASC);

CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_key
  ON document_chunks(document_id, chunk_key);

CREATE INDEX IF NOT EXISTS idx_graph_snapshots_doc_rev
  ON graph_snapshots(document_id, graph_revision DESC);

CREATE INDEX IF NOT EXISTS idx_sync_events_workspace_created
  ON sync_events(workspace_id, created_at DESC);
```

### D1 Table Reference

| Table | Purpose | Primary Key | Unique Constraint |
|---|---|---|---|
| `workspaces` | Workspace identity and metadata | `id` | `slug` |
| `documents` | Markdown source files with content and revision | `id` | `(workspace_id, canonical_path)` |
| `document_chunks` | Token-bounded document segments for search/RAG | `id` | `(document_id, chunk_key)` |
| `graph_snapshots` | Parsed graph JSON per document revision | `id` | `(document_id, graph_revision)` |
| `sync_devices` | Registered client devices per workspace | `id` | — |
| `sync_events` | Push-only audit log (24h TTL, pruned on each push) | `id` | — |

### D1 Role

- First shared operational store
- Cursor-based pull source
- Shared push target
- Conflict-check boundary
- Cloudflare-native low-TCO persistence

---

## Route Contracts

### Push Route

- **Method**: `POST`
- **Path**: `/api/storage/push`
- **Purpose**: Send batched local mutations to the shared store
- **Behavior**: Apply, reject, defer, or mark conflicts per mutation

Request:

```json
{
  "apiVersion": "2026-05-04",
  "workspaceId": "kgws:abc123",
  "deviceId": "dev:local-browser-1",
  "mutations": [
    {
      "entity": "document",
      "op": "upsert",
      "recordId": "sf:source-file-id",
      "baseRevision": 3,
      "record": {
        "id": "sf:source-file-id",
        "workspaceId": "kgws:abc123",
        "canonicalPath": "workspace:/README.md",
        "title": "README.md",
        "docType": "markdown",
        "contentMd": "# Hello",
        "contentHash": "sha256hex",
        "revision": 4,
        "updatedAtMs": 1778151345000,
        "deleted": false
      }
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "apiVersion": "2026-05-04",
  "workspaceId": "kgws:abc123",
  "ackCursor": "2026-05-07T00:00:00.000Z",
  "serverTimeMs": 1778151345000,
  "acknowledgements": [
    {
      "mutationId": "mut_doc_1",
      "recordId": "sf:source-file-id",
      "entity": "document",
      "status": "applied",
      "serverRevision": 4,
      "message": null
    }
  ]
}
```

Error handling: per-mutation conflicts are returned in `acknowledgements`; malformed requests return 400; unexpected worker/database failures return 500.

### Pull Route

- **Method**: `POST`
- **Path**: `/api/storage/pull`
- **Purpose**: Fetch changed records since the last cursor
- **Behavior**: Return documents, chunks, graph snapshots, and the next cursor. Read-optimized: no D1 writes when no changes exist (ensure* are read-first guards; sync_devices cursor and sync_events are skipped on empty pull).

Request:

```json
{
  "apiVersion": "2026-05-04",
  "workspaceId": "kgws:abc123",
  "deviceId": "dev:local-browser-2",
  "since": "2026-05-07T00:00:00.000Z"
}
```

Response:

```json
{
  "ok": true,
  "apiVersion": "2026-05-04",
  "workspaceId": "kgws:abc123",
  "nextCursor": "2026-05-07T00:00:30.000Z",
  "serverTimeMs": 1778151375000,
  "changes": {
    "documents": [{ "...": "..." }],
    "documentChunks": [{ "...": "..." }],
    "graphSnapshots": [{ "...": "..." }]
  }
}
```

Error handling: 400 on malformed request; 500 on worker/database failures.

### Collaboration Save Bridge Route

- **Method**: `POST`
- **Path**: `/api/storage/collab/save`
- **Purpose**: Commit a saved PocketBase/Yjs document snapshot to its path-scoped GitHub `docs/**` root
- **Behavior**: Validate the saved snapshot and authenticated membership, re-derive repository authority from `documentKey`, reject a mismatched `repositoryTarget`, read the selected room provider state when configured, canonicalize JSON with two-space formatting, reject concurrent JSON saves without Yjs state, and write through a GitHub App/server identity using compare-and-set content SHA. D1 is not touched.

Request:

```json
{
  "apiVersion": "2026-05-04",
  "workspaceId": "kgws:abc123",
  "documentKey": "/docs/shared.json",
  "documentKind": "json",
  "repositoryTarget": "workspace-docs",
  "serializedText": "{\n  \"name\": \"Shared\"\n}\n",
  "yjsStateBase64": "AQID",
  "activePeerCount": 2,
  "pocketBaseRoomId": "pb_room_id",
  "savedByPeerId": "peer_abc",
  "saveBoundary": "explicit"
}
```

Response:

```json
{
  "ok": true,
  "apiVersion": "2026-05-04",
  "workspaceId": "kgws:abc123",
  "documentKey": "/docs/shared.json",
  "repositoryTarget": "workspace-docs",
  "githubPath": "docs/shared.json",
  "commitSha": "commit_sha",
  "contentSha": "content_sha",
  "committedAtMs": 1778151375000
}
```

Repository selection: `knowgrph-docs` reads `KNOWGRPH_STORAGE_GITHUB_KNOWGRPH_REPO`; `workspace-docs` reads `KNOWGRPH_STORAGE_GITHUB_WORKSPACE_REPO`. Both use the server-owned owner, branch, and token. Agentic Canvas OS paths are read-only in this bridge.

Error handling: 400 on malformed request, unsupported path, or target/path mismatch; 401/403 on missing identity or inactive workspace membership; 409 when concurrent JSON lacks Yjs CRDT state or the GitHub content SHA changed; 500 on missing target-specific repository config or GitHub API failures.

The Source Files row upload client uses this route only for explicit Markdown saves, including a newly created empty `.md`. A successful bridge response is necessary but not sufficient for the cloud icon: the client next pushes the same text through the D1 document sync contract and requires exact `GET /api/storage/doc/:workspaceId/:canonicalPath*` read-back. If the GitHub bridge fails, D1 is untouched; if D1 or read-back fails after the commit, the row remains in a retryable failure state.

### Export Route

- **Method**: `GET`
- **Path**: `/api/storage/export/:workspaceId`
- **Purpose**: Export a workspace archive from the shared store
- **Behavior**: Fail whole export on missing workspace; never silently drop records. Pure read — no D1 writes (no sync_device or sync_events side effects).

Error handling: 404 on unknown workspace; 500 on D1 failure.

---

## PostgreSQL Appendix (Deferred)

Deferred PostgreSQL adoption gates and shape deltas live in `knowgrph-storage-schemas-extensions-document.md`. PostgreSQL remains a future migration path, not a current runtime owner.

---

## Continuation

Return to `knowgrph-storage-sync-document.md` for the canonical architecture, PRD, TAD, and conflict resolution flow.
