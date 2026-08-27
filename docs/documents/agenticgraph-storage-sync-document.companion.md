---
title: "Reference implementation: AgenticGraph Storage and Synchronization Owner Appendix"
id: "md:agenticgraph-storage-sync-document.companion"
doc_type: "TAD Companion"
version: "5.0.0"
date: "2026-08-06"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.storage.sync.companion"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/agenticgraph-storage-sync-document.companion.md"
parent: "docs/documents/agenticgraph-storage-sync-prd-tad-adr.md"
parent_version: "5.0.0"
invocation_authority: "The typed route-path source module owns runtime route identities; this appendix declares no invocation route."
---

# Reference implementation: AgenticGraph Storage and Synchronization Owner Appendix

## Purpose

This appendix keeps file-level ownership and current gaps out of the combined storage PRD/TAD/ADR. It does
not define a second product contract, invocation dictionary, topology, or readiness ladder.

## Browser ownership

| Concern | Owner | Invariant |
|---|---|---|
| Record schemas and binding names | `canvas/src/lib/storage/agenticgraphStorageSyncContract.ts` | shared types remain the contract |
| Route constants/builders | `canvas/src/lib/storage/agenticgraphStorageRoutePaths.ts` | runtime paths are not duplicated in prose |
| Local collections | IndexedDB/Dexie storage modules | documents, chunks, snapshots, outbox, cursor stay explicit |
| Memory fallback | storage adapter selection | fallback is visible and not called durable |
| Source authority | `canvas/src/features/source-files/` | local/shared records remain projections |
| CRDT local persistence | Room-provider adapter using a `y-indexeddb`-equivalent store | room data stays alongside, never replaces, the canonical working-store contract |
| Proposed projection envelope | parent storage contract until a typed schema owner is admitted | target binds source repository/path/revision/content digest before provider identifiers; no current parity claim |
| Workspace materialization | Source Files/workspace owners | one path applies source to graph/canvas |

## Shared-source ownership

| Concern | Owner | Invariant |
|---|---|---|
| Worker dispatch | `cloudflare/workers/agenticgraph-storage/index.ts` | source implementation is not delivery evidence |
| D1 structured records | Worker DB modules/migrations | revision/conflict behavior remains typed; push/pull/export currently have no authorization gate |
| Generic blobs | `cloudflare/workers/agenticgraph-storage/blob.ts` | unauthenticated and overwriteable until hardened |
| Run media | `cloudflare/workers/agenticgraph-storage/media.ts` | expiry/run-id token check only |
| Media auth | `cloudflare/workers/agenticgraph-storage/mediaAuth.ts` | current base64url token is not a signed entitlement |
| Collaboration room | selected Source Files Yjs adapter / one Durable Object per document | exactly one active room owner; ephemeral merged state is never authoring authority |
| CRDT candidate squash | room adapter plus the existing S9 candidate/review path | merged Yjs state becomes Markdown/frontmatter candidate bytes; only protected review may accept them |
| Git/file relay | storage-relay modules | bounded roots/hosts/auth and typed conflicts |
| Lark projection/import | Feishu Base and Lark App contracts | host-owned permissions and tokens; external edits become reviewed candidates |

## Failure and recovery matrix

| Failure | Required state | Recovery |
|---|---|---|
| IndexedDB unavailable | explicit memory/failure state | preserve active edit; retry/select durable adapter |
| Push timeout | outbox retained | bounded retry; operator-visible failure |
| Revision conflict | conflict row retained | pull/review/reapply; no silent last-write-wins |
| Shared Worker unavailable | local authoring remains usable | defer sync |
| Missing binding/migration | typed server error | configure/migrate before retry |
| Blob/media auth gap | delivery boundary closed | harden and prove security VCC |
| Unauthorized shared request | reject before read or write | configure and prove the S7 authorization gate before retry |
| Room provider unavailable | source/local edit remains primary | reconnect-and-resync or disable the one selected provider |
| CRDT squash failure | prior room snapshot retained | repair/retry candidate generation; never direct-write canonical source |
| Lark scope/revision missing | immutable snapshot rejected | correct host-owned scope or provider revision; do not invent repair |
| Delivery check fails | prior delivered state identified | follow separate Worker rollback runbook |

## Current evidence gaps

- No Evidence Reference in this document proves a configured shared Worker, database, bucket, KV
  namespace, or collaboration service.
- No cryptographic issuer verifies the current run-media token.
- The generic blob handler has no auth/entitlement check.
- Structured push, pull, and export routes dispatch without authorization; current browser clients
  send content type but no credential.
- Clean-environment TTV, scale, offline recovery, conflict replay, backup/restore, migration, and
  deletion evidence are not attached.
- The protected Pages release does not deploy the storage Worker.
- No named S4a suite proves Yjs concurrent merge and squash-to-candidate behavior.
- No remote Lark Base/Wiki/Docs discovery, event verification, or write-back adapter is evidenced.
- No projection-envelope check currently proves source revision/digest parity across Lark and Cloudflare stores.

## Validation hosts

| Scope | Invocable host | Recorded result |
|---|---|---|
| S1/S3 local durability and source authority | `npm run check && npm test` | not recorded for this revision |
| S2/S4 typed sync and one-room behavior | `npm run runtime:test` | not recorded for this revision |
| S4a CRDT merge and candidate squash | future named CRDT suite | no satisfying check exists |
| S5 binary routes | media/blob unit tests named by the binary contract | not recorded |
| S6 delivery/security/rollback | separately protected Worker validation | not recorded |
| S7 shared-route authorization | future negative push/pull/export authorization suite | no satisfying check exists |
| S8 projection provenance | future source-revision/content-digest envelope suite | no satisfying check exists |
| S9 Lark candidate review | future candidate/conflict/idempotency adapter suite | remote adapter is not implemented |

## References

- Parent contract: `docs/documents/agenticgraph-storage-sync-prd-tad-adr.md`
- Superseded v4.1 contract pointer: `docs/documents/agenticgraph-storage-sync-document.md`
- Binary security contract: `docs/documents/agenticgraph-artifact-media-storage-architecture.md`
- Superseded ADR archive: `docs/documents/agenticgraph-storage-sync-adrs-document.md`
- Feishu Base contract: `docs/documents/agenticgraph-mcp/agenticgraph-feishu-base-mcp-prd-tad.md`
- Lark App contract: `docs/documents/agenticgraph-mcp/agenticgraph-lark-app-mcp-prd-tad.md`
- Lark Docs API overview: https://open.larksuite.com/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN
