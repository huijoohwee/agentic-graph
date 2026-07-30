---
title: "Knowgrph Storage Schema Extensions"
id: "md:knowgrph-storage-schemas-extensions-document"
version: "1.4.0"
updated: "2026-07-23"
status: "spec-complete-deferred"
doc_type: "Schema Extension Reference"
frontmatter_contract: "required"
document_runtime_status: "runtime-ready-dev"
runtime_scope: "Frontmatter parsing, source validation, MCP grammar resolution, and read-only Source Files discovery; extension implementation remains deferred."
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

# Knowgrph Storage Schema Extensions

**Context**: Deferred schema extensions for Knowgrph storage and sync.
**Intent**: Keep the shipped D1 baseline in `knowgrph-storage-schemas-document.md` while preserving extension contracts in a focused owner.
**Directive**: Extension material is spec-complete only; do not claim runtime readiness until Worker owners, migrations, and focused tests exist.

---

**Version**: 1.4.0
**Date**: 2026-07-23
**Canonical baseline**: `knowgrph-storage-schemas-document.md`

## Enhancement Readiness Gate

A schema extension is active only when all three inputs are true: a named Worker owner exists, its migration is applied, and its focused test passes. Missing any input leaves the route unexposed and its status deferred. The browser-local Dexie collections, document revision history, and Yjs update outbox are implementation details of the shipped local cache and do not add a D1 extension table.

PocketBase collections remain provider-owned and require version-pinned server deployment, committed `pb_migrations`, authenticated collection rules, update acknowledgement/deduplication, snapshot compaction, and backup/restore proof. PocketBase is recommended for a small-team relay only after those gates pass; it never owns canonical documents, offline fallback, GitHub commits, D1 projection, or Cloudflare resources.

The `serverManaged` relay path remains fail closed: unless the workspace provider policy explicitly enables it, the Worker returns a forbidden response, establishes no relay, and leaves prior policy unchanged. BYOK values are per-request memory inputs and are excluded from IndexedDB, local/session storage, PocketBase rows, and D1.

## Planned Authenticated Collaboration And Chat Relay Extension

The tables below are the concrete D1 extension required before multi-user collaboration can claim authenticated membership, workspace authorization, or server-managed provider relay isolation. They are not part of the shipped anonymous storage baseline until their Worker owners and focused tests exist.

Repository routing is not a deferred schema extension. The shipped collaboration bridge resolves `knowgrph-docs` or `workspace-docs` from the canonical document path, validates the client-supplied target, and uses target-specific server configuration. Repository credentials, local mirror paths, and online/offline preferences must not be stored in these D1 tables.

## PocketBase Collaboration Collections (Provider-Owned)

These collections belong to a version-pinned PocketBase deployment and its committed `pb_migrations`; they are not additions to the D1 schema. The browser joins them only after local import/bootstrap and authenticated workspace admission. PocketBase is one selectable collaboration room provider, not a Cloudflare Worker, GitHub SSOT, or offline dependency.

| Collection | Required fields and constraints | Retention |
|---|---|---|
| `collab_rooms` | `workspaceId`, `documentKey`, `documentKind`, `snapshotBase64`, `snapshotSeq`, `compactedThroughSeq`, `createdBy`; unique `(workspaceId, documentKey)` | Keep while document exists; create races refetch the unique winner. |
| `collab_updates` | `roomId`, globally stable `updateId`, `senderUserId`, `senderPeerId`, `clientSeq`, `serverSeq`, `updateBase64`, `createdAt`; unique `updateId`, ordered `(roomId, serverSeq)` | Prune only updates at or below a verified compacted sequence. |
| `collab_awareness` | `roomId`, `userId`, `peerId`, bounded cursor/selection payload, `lastSeenAt`; unique `(roomId, peerId)` | TTL-prune stale presence; never treat awareness as durable document state. |

Collection list/view/create/update/delete rules must require an authenticated active member of the row's `workspaceId`; room creation and compaction require editor/owner authority. Update records are append-only to clients. A trusted room owner assigns ordering and compacts snapshots, while clients acknowledge update ids and replay their IndexedDB outbox until accepted. The GitHub bridge independently re-derives workspace membership and repository authority and uses compare-and-set content SHA.

Only one room provider may be active for a workspace. A Durable Object migration transfers compacted Yjs state and replay position behind a write fence before authority changes; it must not mirror live writes to both providers.

## Source Files Ownership Projection (No Persisted Extension)

Explorer ownership is derived from the shared repository-authority contract, not stored in PocketBase or D1. `workspace-docs` displays `GitHub/huijoohwee/docs`; `knowgrph-docs` displays `GitHub/knowgrph/docs`; `/docs/workspace-seeds/**` displays the narrower `GitHub/knowgrph/docs/workspace-seeds` boundary; IndexedDB displays as offline fallback. Agentic runtime projections and rejected Huijoohwee seed duplicates never become selectable write authorities.

No schema field may override the seed owner. Local mirror requests carry the workspace path and must resolve byte-for-byte to `$GITHUB_ROOT/knowgrph/docs/workspace-seeds/**`; PocketBase room metadata, D1 rows, browser settings, and import payloads cannot select `huijoohwee/docs/workspace-seeds` or another host path.

Seed inventory authority is runtime metadata, not a persisted schema extension. Entries read from the local canonical directory carry `knowgrph-workspace-seeds-local`; entries loaded from the revision-pinned six-file app artifact carry `knowgrph-workspace-seeds-bundled`. Only a complete, non-empty authority-marked inventory can replace and prune the cached `/docs/workspace-seeds/**` subtree.

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  invited_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_provider_policies (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  allow_server_managed INTEGER NOT NULL DEFAULT 0,
  allow_byok INTEGER NOT NULL DEFAULT 1,
  monthly_request_limit INTEGER,
  monthly_token_limit INTEGER,
  monthly_spend_limit_cents INTEGER,
  default_model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, provider_id)
);

CREATE TABLE IF NOT EXISTS chat_proxy_audit (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  auth_mode TEXT NOT NULL,
  request_id TEXT,
  upstream_status INTEGER,
  relay_status TEXT NOT NULL,
  model_id TEXT,
  request_bytes INTEGER,
  response_bytes INTEGER,
  latency_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (membership_id) REFERENCES workspace_memberships(id) ON DELETE CASCADE
);
```

## Authenticated Relay Index Guidance

| Table | Index fields |
|---|---|
| `users` | `email`, `status` |
| `auth_sessions` | `user_id`, `session_hash`, `expires_at` |
| `workspace_memberships` | `workspace_id`, `user_id`, `[workspace_id, role]`, `status` |
| `workspace_provider_policies` | `workspace_id`, `[workspace_id, provider_id]` |
| `chat_proxy_audit` | `workspace_id`, `user_id`, `provider_id`, `created_at`, `[workspace_id, created_at]` |

## Authenticated Relay Route Inputs

```ts
type ChatRelayRequest = {
  workspaceId: string
  providerId: 'openai' | 'miromind' | 'agnes-ai' | 'byteplus-modelark' | 'qwen' | 'google-cloud'
  authMode: 'serverManaged' | 'byok'
  endpointUrl?: string | null
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
  stream?: boolean
}

type ChatRelayResolvedContext = {
  userId: string
  membershipId: string
  workspaceId: string
  role: 'viewer' | 'editor' | 'owner' | 'provider-admin'
  providerPolicy: {
    allowServerManaged: boolean
    allowByok: boolean
    monthlyRequestLimit: number | null
    monthlyTokenLimit: number | null
    monthlySpendLimitCents: number | null
  }
}
```

## Authorization Rules

- `viewer` can read policy metadata but cannot invoke server-managed provider relay by default.
- `editor` can invoke chat relay for workspace-authorized providers when policy permits.
- `owner` can manage memberships and provider policies for the workspace.
- `provider-admin` can rotate provider policy defaults without changing workspace ownership.
- `serverManaged` relay mode must fail closed unless `workspace_provider_policies.allow_server_managed = 1`.
- BYOK mode remains a per-request browser input and must never be written to D1.
- GitHub bridge credentials remain Worker-only; browser settings expose repository roots and transport state, never tokens or repository secrets.

---

## PostgreSQL Appendix

PostgreSQL remains deferred. Documented to preserve the future migration path.

### Adoption Gates

Adopt PostgreSQL only when one or more become materially true:

- Multiple users edit the same workspace concurrently.
- Server-side retrieval queries outgrow D1 ergonomics or performance.
- Vector search becomes a runtime requirement rather than an experiment.
- Tenancy, analytics, or audit requirements justify managed DB overhead.

### Deferred Shape Highlights

- UUID primary keys instead of D1 `TEXT` primary keys.
- `TIMESTAMPTZ` timestamps instead of D1 `TEXT` timestamps.
- `JSONB` for `graph_json` and `layout_json` instead of D1 text payloads.
- `VECTOR(1536)` embedding column on `document_chunks`.
- `metadata_json JSONB` column on `documents` and `document_chunks`.
