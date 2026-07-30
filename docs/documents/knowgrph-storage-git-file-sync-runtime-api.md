---
title: "Knowgrph Browser Git and Multi-Provider File Sync Runtime API"
id: "md:knowgrph-storage-git-file-sync-runtime-api"
author: "airvio / joohwee"
date: "2026-07-24"
updated: "2026-07-26"
version: "1.1.0"
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
| Worker scope | Mutating relay routes require an explicit Dev enable flag, a loopback request hostname, a loopback `Origin`, an active bearer session, workspace membership, and write role. The read-only capability route remains available to an authenticated loopback member while disabled so readiness can report `relayEnabled=false` truthfully. |
| Transfer | One cumulative 30-second deadline and 10,485,760-byte maximum applies per Git operation or file transfer. |
| Retry | The browser outbox owns at most three attempts with 1-second then 2-second delays. A terminal retained entry is requeued once by a later explicit drain; it is never retried again inside the same drain. The Worker performs no retry loop. |
| Release | These routes are local/Dev only. No Worker deploy, binding change, remote D1 migration, Production mirror write, or Cloudflare resource mutation is part of runtime execution. |

## Browser WebMCP

| Tool | Annotation and result |
|---|---|
| `knowgrph.inspect_local_git_repository` | Read-only, local-only inspection of repositories, refs, object counts, retained operations, persistence, bounds, grammar, and the authenticated Worker capability result. It returns no object bytes or credentials. |
| `knowgrph.control_local_git_repository` | Mutating/open-world Git clone, fetch, commit, or push. It accepts structured input or the exact Git invocation below. |
| `knowgrph.inspect_local_file_sync` | Read-only, local-only inspection of Worker-advertised opaque providers, credential mode, ledger counts, retained transfers, persistence, bounds, and grammar. It returns no file bytes or credentials. |
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
- Remote trees are complete and bounded. Truncated trees, symlinks, submodules, or unverifiable canonical objects fail closed instead of producing a partial repository. An empty supported-document scope is valid, while non-document blobs inside the repository scope are preserved.
- Local blob, tree, and commit IDs use Git SHA-1 over `type + space + byte-length + NUL + body`.
- Commit preflights the complete Markdown/JSON change set through the shared document repository authority. `agentic-canvas-os/**`, `huijoohwee/docs/workspace-seeds/**`, unsupported extensions, unsafe paths, and mixed repository targets reject atomically before a write.
- Commit is Save-Bridge-backed: while online, every preflighted document is written through authenticated `POST /api/storage/collab/save`, then the final remote commit and refs are fetched and durably materialized before completion. The final tree must exactly match the local change set, and its verified single-parent ancestry must reach the original parent; sequential per-document bridge commits are therefore accepted without accepting an unrelated history. While offline the operation remains queued. Sequential bridge writes can partially advance the remote after a transport failure, so the retained operation is recoverable but the batch is not claimed transactional.
- The collaboration Save Bridge accepts explicit `upsert` and `delete` operations. The engine derives deletions only from the verified parent tree, revalidates each path through document repository authority, reads the current GitHub content SHA, and serializes deletes before upserts. Missing remote content is an idempotent delete success; the final fetched tree still must match exactly.
- Push uses the Worker relay, an explicit expected old reference, immutable object creation, a second reference read, and a non-force update. An advanced reference reports through the shared Conflict UX; an already-current target is acknowledged without creating another remote commit, and successful acknowledgement advances the durable remote-tracking ref.
- Offline clone, fetch, commit, and push requests retain FIFO outbox entries with durable monotonic sequence numbers and leased compare-and-ack claims. Git operations have no fixed entry cap; a live oldest claim blocks later eligible work, while bounds, authentication failures, conflicts, transport exhaustion, and retry exhaustion do not discard the entry. A subsequent drain resets one retained terminal entry to queued and can recover after credentials, connectivity, or code support changes.

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
- One complete relay tree snapshot is reused for stat/read and sequential writes in the same browser batch. Writes update the snapshot in memory; a newly created directory is rescanned only when a destructive listing fence is required.
- Retained failed file transfers are requeued by a later drain, with the same bounded attempt policy as the original execution.

Google Drive native Docs/Sheets/Slides and shortcuts are unsupported for byte-faithful sync. OneDrive `remoteItem` entries are unsupported. Provider pagination URLs, preauthenticated download URLs, upload-session URLs, drive/root IDs, and access or refresh tokens never cross the Worker boundary.

## Worker relay API

The Storage Worker owns two Dev-only routes:

| Method and path | Purpose |
|---|---|
| `GET /api/storage/relay/capabilities` | Authenticated, credential-free discovery of configured Git remote IDs, file provider IDs/types, credential mode, and file-signing readiness. Browser inspection reports unavailable rather than treating a configured base URL as ready. |
| `POST /api/storage/collab/save` | Apply each Git commit document through the local/Dev-gated, session-authenticated, membership-authorized, path-scoped Save Bridge before final remote materialization. |
| `POST /api/storage/git/relay` | Resolve a fixed branch, read a bounded verified object batch, or push a commit against an expected reference. |
| `POST /api/storage/file-sync/relay` | List providers, list a page, read metadata/content, create a directory, or move an entry to trash. |
| `PUT /api/storage/file-sync/relay` | Upload one bounded file using opaque, signed metadata. |

Remote/provider registries map static opaque IDs to Worker-owned repository, branch, drive, root, and workspace configuration. The default Git IDs are `origin` for `knowgrph-docs` and `workspace-origin` for `workspace-docs`; the Worker keeps them distinct and revalidates the Git commit's remote ID against path-derived repository authority before the first Save Bridge write. Browser callers cannot select an upstream hostname or resource root. Errors are typed and sanitized; provider response bodies, secrets, signed tokens, and upstream URLs are neither logged nor returned.

Google and Microsoft providers accept either a short-lived static access token or a complete OAuth refresh credential group. Refresh exchange occurs only in the Worker under the same cumulative operation deadline and byte budget, is cached only for that request-scoped provider instance, and never chooses or widens OAuth scopes. A rotated Microsoft refresh token is used for the rest of that request; persistence of the rotated credential remains an operator secret-management responsibility.

## Dev configuration and readiness

Copy `cloudflare/workers/knowgrph-storage/.dev.vars.example` beside `wrangler.toml`, replace every placeholder with operator-owned Dev values, and run:

```text
npm run storage:relay:env:check
npm run storage:worker:types:check
npm run storage:relay:test
```

The environment check prints only readiness booleans and missing key names. It rejects the obsolete `KNOWGRPH_STORAGE_GITHUB_REPO` key, requires distinct repository keys, and accepts either the complete OAuth refresh group or the static access-token fallback for each provider. Generated Wrangler binding types are committed in `worker-configuration.d.ts`; `wrangler.toml` remains the source of truth for D1, R2, and Durable Object bindings.

## Provider notes

Google Drive listings are paged and reject `incompleteSearch`; uploads use a resumable session with read-back verification. OneDrive child listings encapsulate continuation state, downloads follow the preauthenticated redirect only inside the Worker, and non-empty uploads use an upload session with conflict behavior `fail` and optimistic version checks. Zero-byte OneDrive files use the documented simple content endpoint with create/update HTTP preconditions instead of an unsupported empty upload-session commit. OneDrive QuickXor hashes remain tagged as QuickXor and are never compared as SHA-256.

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
- Worker checks prove Dev/loopback/Origin/auth/role gates, authenticated capability discovery, renewable token confinement, opaque registry resolution, token tampering rejection, cumulative bounds, Git ref races/tree completeness and deletion, provider pagination, zero-byte writes, optimistic concurrency, and secret non-leakage.

This Dev runtime proof does not authorize a Production or Cloudflare release.
