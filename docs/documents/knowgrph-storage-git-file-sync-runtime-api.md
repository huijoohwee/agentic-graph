---
title: "Knowgrph Browser Git and Multi-Provider File Sync Runtime API"
id: "md:knowgrph-storage-git-file-sync-runtime-api"
author: "airvio / joohwee"
date: "2026-07-24"
updated: "2026-07-24"
version: "1.0.0"
status: "runtime-ready-dev; provider credentials and release remain operator-owned"
doc_type: "Runtime API"
lang: "en-US"
frontmatter_contract: "required"
document_runtime_status: "runtime-ready-dev"
runtime_scope: "MCP grammar resolution and browser-local Git/file-sync execution against an explicit loopback Dev Worker; no Production execution."
deploy_boundary: "No Prod mirror or Cloudflare mutation is authorized by this document."
domain: "knowgrph"
mcp:
  grammar_tool: "knowgrph.agentic_canvas_os.docs.invoke"
  published_source_tools: ["search", "fetch"]
  webmcp_source_tools: ["knowgrph.list_source_files", "knowgrph.read_source_file"]
  source_availability: "Read-only after the document is present in the configured published Source Files workspace."
invocation:
  normalize: "/git.run @local-git-repository @git-remote #git-remote"
  verify: "/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync"
owner: "Knowgrph storage runtime"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "storyboard"
---

# Browser Git and Multi-Provider File Sync Runtime API

This API adds a Knowgrph-owned browser Git engine and provider-neutral file synchronization to the existing Storage Sync contract. It introduces no external Git implementation, rclone binary, file-sync library, browser credential field, Production mirror writer, or Cloudflare provisioning action.

The executable owner is browser WebMCP because the local repository, provider cache, ledger, and operation queues live in IndexedDB. Local stdio MCP validates the same structured or `/`, `@`, `#` inputs and returns a typed `BROWSER_RUNTIME_REQUIRED` handoff; it does not substitute a filesystem repository or memory-only cache and does not perform a network request.

## Runtime boundaries

| Boundary | Contract |
|---|---|
| Persistence | Mutation tools require active IndexedDB for the document cache and storage-engine cache. A degraded memory fallback is inspectable but cannot execute Git or provider mutations. |
| Credentials | Browser inputs contain only opaque `remoteId` or `providerId` values. Git and provider credentials remain Worker environment secrets. |
| Worker scope | Relay routes require an explicit Dev enable flag, a loopback request hostname, a loopback `Origin`, an active bearer session, workspace membership, and write role for mutation. |
| Transfer | One cumulative 30-second deadline and 10,485,760-byte maximum applies per Git operation or file transfer. |
| Retry | The browser outbox owns at most three attempts with 1-second then 2-second delays. The Worker performs no retry loop. |
| Release | These routes are local/Dev only. No Worker deploy, binding change, remote D1 migration, Production mirror write, or Cloudflare resource mutation is part of runtime execution. |

## Browser WebMCP

| Tool | Annotation and result |
|---|---|
| `knowgrph.inspect_local_git_repository` | Read-only, local-only inspection of repositories, refs, object counts, retained operations, persistence, bounds, and grammar. It returns no object bytes or credentials. |
| `knowgrph.control_local_git_repository` | Mutating/open-world Git clone, fetch, commit, or push. It accepts structured input or the exact Git invocation below. |
| `knowgrph.inspect_local_file_sync` | Read-only, local-only inspection of registered opaque providers, ledger counts, retained transfers, persistence, bounds, and grammar. It returns no file bytes or credentials. |
| `knowgrph.control_local_file_sync` | Mutating/open-world pull or push for one explicit prefix. It accepts structured input or the exact file-sync invocation below. |

Mutation tools fail closed unless persistence reports exactly `mode=indexeddb` and `status=active`.

## Local stdio MCP

| Tool | Behavior |
|---|---|
| `knowgrph.git.run` | Validates Git input and returns a structured handoff to `knowgrph.control_local_git_repository`. |
| `knowgrph.file.sync` | Validates file-sync input and returns a structured handoff to `knowgrph.control_local_file_sync`. |

The handoff schema is `knowgrph-storage-stdio-handoff/v1` with `ok=false`, `status=blocked`, `errorCode=BROWSER_RUNTIME_REQUIRED`, `surface=local-stdio`, `executableSurface=browser-webmcp`, a credential-free normalized invocation, and the required browser tool name.

## Exact invocation grammar

Git:

```text
/git.run @local-git-repository @git-remote #git-remote operation=<clone|fetch|commit|push> remote=<opaque-id> path=<percent-encoded-canonical-scope> base-ref=<percent-encoded-refs/heads/name> [message=<percent-encoded-text>]
```

`message` is required only for `commit`. Token order is strict. Aliases, additional sigils, duplicate or unknown fields, mixed invocation/structured input, traversal, empty defaults, and caller-supplied URLs, credentials, timeout, retry, byte, queue, or storage-mode overrides are rejected.

File sync:

```text
/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync direction=<pull|push> provider=<opaque-id> prefix=<percent-encoded-canonical-prefix>
```

The prefix is always explicit; an empty value never broadens a request to an entire provider.

Structured Git input:

```json
{
  "operation": "fetch",
  "remoteId": "origin",
  "canonicalPathScope": "knowgrph/docs",
  "baseRef": "refs/heads/main"
}
```

Structured file-sync input:

```json
{
  "direction": "pull",
  "providerId": "google-drive",
  "prefix": "docs/research"
}
```

## Git engine

The local repository persists object metadata, verified content-addressed bytes, refs, repository records, and retained operations under the shared browser storage boundary.

- Clone initializes the local branch and HEAD after verified materialization. A later fetch preserves the local branch and advances only the remote-tracking ref, so divergence remains explicit.
- Cached objects with the same tagged content hash are reused without requesting their bytes again.
- Remote trees are complete and bounded. Truncated trees, symlinks, submodules, empty repositories, or unverifiable canonical objects fail closed instead of producing a partial repository.
- Local blob, tree, and commit IDs use Git SHA-1 over `type + space + byte-length + NUL + body`.
- Commit preflights the complete Markdown/JSON change set through the shared document repository authority. `agentic-canvas-os/**`, `huijoohwee/docs/workspace-seeds/**`, unsupported extensions, unsafe paths, and mixed repository targets reject atomically before a write.
- Commit is Save-Bridge-backed: while online, every preflighted document is written through authenticated `POST /api/storage/collab/save`, then the final remote commit and refs are fetched and durably materialized before completion. The final tree must exactly match the local change set, and its verified single-parent ancestry must reach the original parent; sequential per-document bridge commits are therefore accepted without accepting an unrelated history. While offline the operation remains queued. Sequential bridge writes can partially advance the remote after a transport failure, so the retained operation is recoverable but the batch is not claimed transactional.
- The existing collaboration Save Bridge has no delete operation. If a local commit removes a document, exact-tree attestation retains the operation as failed instead of falsely reporting completion; remote document deletion is not claimed by this Dev runtime.
- Push uses the Worker relay, an explicit expected old reference, immutable object creation, a second reference read, and a non-force update. An advanced reference reports through the shared Conflict UX; an already-current target is acknowledged without creating another remote commit, and successful acknowledgement advances the durable remote-tracking ref.
- Offline clone, fetch, commit, and push requests retain FIFO outbox entries with durable monotonic sequence numbers and leased compare-and-ack claims. Git operations have no fixed entry cap; a live oldest claim blocks later eligible work, while bounds, authentication failures, conflicts, transport exhaustion, and retry exhaustion do not discard the entry.

The GitHub relay reconstructs and verifies canonical object IDs where the upstream representation is sufficient. Unsupported signed or extended commit forms whose canonical bytes cannot be proven are rejected; the runtime does not claim a byte-faithful clone for those histories.

## File synchronization

Every backend implements the same paged/versioned provider interface: list one page, read a file, create a directory, write a file with optimistic concurrency, and move an entry to provider trash.

- Provider registration requires a unique opaque identifier.
- Pull transfers provider directories/files into the persisted cache; push transfers persisted directories/files to the provider.
- Tagged hashes are compared only when their algorithms match. Equal hashes skip content bytes and still advance the sync ledger.
- The ledger stores provider, file key, last local hash, and last remote version. If both sides changed, the engine reports a shared conflict rather than overwriting.
- A failed or oversized file records one error and does not stop the rest of the batch.
- Destructive reconciliation never runs from an incomplete provider listing.
- Offline transfers retain FIFO outbox entries with durable monotonic sequence numbers and leased compare-and-ack claims up to the atomic 10,000-entry cap. At capacity, the new transfer is rejected and existing entries remain unchanged.
- Offline pull queues only entries from the last persisted provider ledger; without a prior manifest it fails closed instead of inventing remote paths.

Google Drive native Docs/Sheets/Slides and shortcuts are unsupported for byte-faithful sync. OneDrive `remoteItem` entries are unsupported. Provider pagination URLs, preauthenticated download URLs, upload-session URLs, drive/root IDs, and access or refresh tokens never cross the Worker boundary.

## Worker relay API

The Storage Worker owns two Dev-only routes:

| Method and path | Purpose |
|---|---|
| `POST /api/storage/collab/save` | Apply each Git commit document through the local/Dev-gated, session-authenticated, membership-authorized, path-scoped Save Bridge before final remote materialization. |
| `POST /api/storage/git/relay` | Resolve a fixed branch, read a bounded verified object batch, or push a commit against an expected reference. |
| `POST /api/storage/file-sync/relay` | List providers, list a page, read metadata/content, create a directory, or move an entry to trash. |
| `PUT /api/storage/file-sync/relay` | Upload one bounded file using opaque, signed metadata. |

Remote/provider registries map static opaque IDs to Worker-owned repository, branch, drive, root, and workspace configuration. The default Git IDs are `origin` for `knowgrph-docs` and `workspace-origin` for `workspace-docs`; the Worker keeps them distinct and revalidates the Git commit's remote ID against path-derived repository authority before the first Save Bridge write. Browser callers cannot select an upstream hostname or resource root. Errors are typed and sanitized; provider response bodies, secrets, signed tokens, and upstream URLs are neither logged nor returned.

## Provider notes

Google Drive listings are paged and reject `incompleteSearch`; uploads use a resumable session with read-back verification. OneDrive child listings encapsulate continuation state, downloads follow the preauthenticated redirect only inside the Worker, and uploads use an upload session with conflict behavior `fail` and optimistic version checks. OneDrive QuickXor hashes remain tagged as QuickXor and are never compared as SHA-256.

Provider adapter tests and local mocked Worker proof establish routing, bounds, pagination, hash, retry, conflict, and secret-confinement behavior. Live Google Drive or OneDrive read/write proof requires operator-owned credentials and is not claimed by this document.

## Source owners

| Owner | Path |
|---|---|
| Persistence and outbox | `canvas/src/lib/storage/knowgrphStorageEnginePersistence.ts` |
| Browser Git | `canvas/src/lib/storage/git/` |
| Git Save Bridge binding | `canvas/src/lib/storage/knowgrphStorageGitDocumentAuthority.ts` and `knowgrphStorageGitSaveBridge.ts` |
| Browser provider sync | `canvas/src/lib/storage/file-sync/` |
| Invocation contract | `canvas/src/lib/storage/knowgrphStorageEngineMcpContract.mjs` |
| Browser WebMCP | `canvas/src/features/agent-ready/storageSyncAgentReadyContract.mjs` and `storageSyncWebMcpTools.ts` |
| Local stdio MCP | `mcp/storage-sync-local-tool-contract.mjs` and `mcp/storage-sync-local-runtime.js` |
| Worker relays | `cloudflare/workers/knowgrph-storage/storage-relay/` |
| Global invocation dictionaries | `agentic-canvas-os/docs/DICTIONARY-{COMMAND,BINDING,SEMANTIC}.md` |

## Focused validation

- Properties 40–48 cover Git materialization, Save Bridge authority, FIFO durability, bounds, shared conflicts, bounded retry, object reuse, and credential-safe authentication failure; focused integration regressions also cover fetch divergence, repeated push tracking, bridge-backed commit materialization, and cross-instance outbox claims.
- Properties 49–56 each run at least 100 generated `fast-check` cases covering unique providers, bidirectional transfer, hash skip/transfer, per-file isolation, atomic queue capacity, FIFO retry, credential confinement, and cost boundary.
- MCP checks prove all four browser tools, both stdio handoffs, exact schemas/annotations, strict grammar parsing, and zero stdio filesystem/network/browser-cache side effects.
- Worker checks prove Dev/loopback/Origin/auth/role gates, opaque registry resolution, token tampering rejection, cumulative bounds, Git ref races/tree completeness, provider pagination, optimistic concurrency, and secret non-leakage.

This Dev runtime proof does not authorize a Production or Cloudflare release.
