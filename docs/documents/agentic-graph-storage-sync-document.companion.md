---
title: "Reference implementation: agentic-graph Storage and Synchronization Owner Appendix"
id: "md:agentic-graph-storage-sync-document.companion"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "5.1.0"
date: "2026-09-15"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.storage.sync.companion"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/agentic-graph-storage-sync-document.companion.md"
parent: "docs/documents/agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md"
parent_version: "5.1.0"
invocation_authority: "The typed route-path source module owns runtime route identities; this appendix declares no invocation route."
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-STORAGE-SYNC-PRD-TAD-ADR-MVP-GTM"
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "5.0.2"
prd_revision: "5.1.0"
tad_revision: "5.1.0"
adr_revision: "5.1.0"
mvp_revision: "5.1.0"
gtm_revision: "5.1.0"
---

# Reference implementation: agentic-graph Storage and Synchronization Owner Appendix

## Purpose

This appendix keeps file-level ownership and current gaps out of the combined storage PRD/TAD/ADR. It does
not define a second product contract, invocation dictionary, topology, or readiness ladder.

## Browser ownership

| Concern | Owner | Invariant |
|---|---|---|
| Record schemas and binding names | `canvas/src/lib/storage/agentic-graph-storage-sync-contract.ts` | shared types remain the contract |
| Route constants/builders | `canvas/src/lib/storage/agentic-graph-storage-route-paths.ts` | runtime paths are not duplicated in prose |
| Local collections | IndexedDB/Dexie storage modules | documents, chunks, snapshots, outbox, cursor stay explicit |
| Memory fallback | storage adapter selection | fallback is visible and not called durable |
| Source authority | `canvas/src/features/source-files/` | local/shared records remain projections |
| CRDT local persistence | Room-provider adapter using a `y-indexeddb`-equivalent store | room data stays alongside, never replaces, the canonical working-store contract |
| Proposed projection envelope | parent storage contract until a typed schema owner is admitted | target binds source repository/path/revision/content digest before provider identifiers; no current parity claim |
| Workspace materialization | Source Files/workspace owners | one path applies source to graph/canvas |

## Shared-source ownership

| Concern | Owner | Invariant |
|---|---|---|
| Worker dispatch | `cloudflare/workers/agentic-graph-storage/index.ts` | source implementation is not delivery evidence |
| D1 structured records | Worker DB modules/migrations | push/pull/export require a configured browser session or bearer session and workspace role; explicit local runtime bypass is development-only |
| Explicit document sharing | `sourceFileShareUrl.ts` → `storagePublication.ts` | durable sync precedes exact revision/hash publication and anonymous byte verification; ordinary sync remains private |
| Public document reads | `storageDocumentStream.ts` | every bounded byte segment requires the same document identity and current publication |
| Generic blobs | `cloudflare/workers/agentic-graph-storage/storagePublicRouteSecurity.ts` → `blob.ts` | active workspace session and matching read/write role; overwriteable |
| Run media | `cloudflare/workers/agentic-graph-storage/storageMediaCapability.ts` | signed workspace/object/operation/expiry capabilities; no payment entitlement |
| Media auth | `cloudflare/workers/agentic-graph-storage/storageSyncSecurity.ts` | shared configured session/workspace checks; local bypass must remain disabled for delivery |
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
| Binary auth delivery evidence missing | delivery boundary closed | prove the binary contract security VCCs against the exact deployed runtime |
| Unauthorized shared request | reject before read or write | configure and prove the S7 authorization gate before retry |
| Room provider unavailable | source/local edit remains primary | reconnect-and-resync or disable the one selected provider |
| CRDT squash failure | prior room snapshot retained | repair/retry candidate generation; never direct-write canonical source |
| Lark scope/revision missing | immutable snapshot rejected | correct host-owned scope or provider revision; do not invent repair |
| Delivery check fails | prior delivered state identified | follow separate Worker rollback runbook |

## Current evidence gaps

- No Evidence Reference in this document proves a configured shared Worker, database, bucket, KV
  namespace, or collaboration service.
- Legacy unsigned run tokens apply only to explicit local-runtime fallback.
- Current binary authorization/overwrite semantics are owned by
  `docs/documents/agentic-graph-artifact-media-storage-architecture.md`; source checks do not prove delivered security.
- Structured push, pull, export and explicit sharing have source authorization checks; deployed
  browser Access configuration and schema compatibility require independent runtime evidence.
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
| S7 shared-route authorization | storage relay security and browser-session tests | local source coverage; no delivered proof recorded |
| S8 projection provenance | future source-revision/content-digest envelope suite | no satisfying check exists |
| S9 Lark candidate review | future candidate/conflict/idempotency adapter suite | remote adapter is not implemented |

## Publication and sync identity

The Share action publishes only the selected hydrated bytes after durable sync confirms their
document identity. The publication write compares workspace, document, path, revision and hash
inside one SQL statement. The client verifies anonymous bytes before returning a share URL.
Public reads recheck that identity on every 16,384-byte segment; edits or revocation stop later
segments. Byte reads preserve Unicode, BOM and NUL content without buffering the whole document.

Migration `0019_storage_chunk_document_identity.sql` advances the visible chunk-backed parent
revision when chunk content, order or ownership changes. Metadata-only and unchanged updates
leave the parent revision intact. Its companion inclusive pull boundary receives same-millisecond
changes while strict page positions prevent repeated pages; identical cached records avoid extra
writes. Deploy and verify both inclusive readers before applying the separately authorized
migration, and retain compatible readers during rollback. Adding milliseconds to every chunk
write would push documents beyond the page snapshot and can delay their visibility. Clients
that checkpointed past an earlier missed change need reconciliation or a full pull.
The migration must be reviewed against the actual deployed schema before application.
These source changes do not apply remote migrations or establish deployment readiness.
The native SQLite publication tests require Node 22; the runtime gate uses the same Node
major as the integration and release workflows.

Document, chunk and graph upserts use SQLite statement time for stored `updated_at`; a device's
`updatedAtMs` does not set the pull watermark. After revision checks pass, equal stored fields
return the existing acknowledgement without another write or timestamp change. Document byte
changes advance revision even when legacy stored hash metadata matches the new payload hash.
This protects newly accepted writes from device clock skew; it does not repair previously missed
rows, provide a transactional change cursor, or remove Worker/SQLite clock differences. Explicit
stale revisions remain conflicts.

The source Worker uses `agentic-graph-storage-sync/v2` for push and pull. Migration
`0020_storage_child_sync_state.sql` retains indexed child deletion identities and assigns a
monotonic `syncRevision` independently of document or graph payload revisions. Child writes
compare that revision inside their transaction; acknowledgements include the resulting child
state. Pull pages carry live revisions and explicit deletion records from one bounded SQL
statement. Equal-time pages seek by timestamp, entity and identity; cursors bind workspace,
boundary, snapshot and sync/export mode. Full exports omit historical child deletions.

Authenticated native SQLite tests cover stale edits, restore/delete races, rollback, equal-time
pagination, missing schema and byte limits. The client push path now uses v2 and validates the
entire acknowledgement response before effects. Applied child acknowledgements persist two
directly addressed state markers for physical and natural identity together with exact queue
removal; unchanged cached payloads receive their observed sync revision in that transaction.
Older state cannot overwrite a later move or restoration. A never-published draft deletion
does not invent a server revision or tombstone. New child edits retain their observed sync
base, independently of graph payload revisions; legacy queued child edits retain their payload
and require conflict review before retry. Queue acknowledgements compare the complete sent record
inside the local write transaction. A replacement retains its bytes, attempts and conflict data;
malformed or foreign acknowledgements reject before acknowledgement effects. The shared memory and
IndexedDB adapters support conditional mutation units; IndexedDB conditions and revision history
share the same read/write transaction, including detection of newly inserted pending records.
Conditional writes fail when persistence is degraded. Client pull now uses v2, validates the
response before effects, and checks pending local rows inside each cache transaction. Rejected
and exhausted edits retain their authored bytes and remote candidates. A local deferred queue
preserves cache-to-projection work across reloads; successful projection retires the exact
observed records before the pull cursor advances. Text is rebuilt from remaining cached chunks,
including an explicit empty result after final-chunk deletion. Older tombstones preserve newer
restored identities, and canonical aliases converge without duplicating chunks.
Child conflict review distinguishes deletion from an unavailable candidate. Keep Local rebases
the sync revision while preserving authored graph revisions; Accept Remote can accept deletion.
Conditional completion retains new concurrent edits, and visible source observations guard
asynchronous reviewed projection. Native Worker/SQLite tests exercise deletion, acceptance and
restoration; IndexedDB test connections cover contention and recovery. The separate Chromium
two-tab proof below covers local recovery; full-suite reconciliation and deployed compatibility
remain separate requirements.
The earlier reader-first guidance for `0019` does not authorize deploying this incompatible
protocol. Deployment requires a reviewed schema/client/Worker transition and separate authority;
no remote `0020` migration or end-to-end v2 browser readiness is established here.

## Workspace export freshness

Configured filesystem roots retain at most four settled datasets for the existing one-second
TTL. Retention requires at most 500 entries and 1,048,576 UTF-16 code units across their
paths and text; larger successful results pass through intact without being cached. Concurrent
same-root readers share pending work and receive independent entry copies. These limits bound
settled retention only.

Mirror filesystem and document requests share the existing eight-second header/body budget.
The timeout wrapper calls the supplied fetch function without substituting an object receiver.
Native browser `fetch` therefore retains its required invocation behavior; explicit credentials,
abort handling, Response identity and the original body deadline remain unchanged.
Late headers and rejected-status bodies are cancelled; stalled readers settle without awaiting
producer cleanup. Incremental reads keep the original deadline even for always-ready chunks.
Mirrors retain their existing accepted sizes and native UTF-8 replacement decoding, while the
storage JSON parser keeps its strict 8 MiB policy. Successful text bytes are preserved and
negative-cache TTL is unchanged. Only the current text request may publish or retire its cache entry after a reset.
These request limits do not preempt synchronous JSON parsing or bound a multi-request workflow.

Active document resolution (`workspace.active-document-recovery`) reuses that request deadline
for direct local docs-root reads and cancels rejected bodies while preserving exact successful
whitespace and Unicode. Each supplied active-entry snapshot resolves canonical text once;
parser-confirmed repeated-residue repair changes only the returned projection. One fresh filesystem
read must still match the supplied raw text; a newer edit or clear wins, deletion stays unavailable,
and a failed read propagates. Snapshot reads never write local or host bytes. Persisting a repaired
document requires the existing explicit document-write path. This removes unsafe read-side repair
writes; it does not make localStorage snapshots atomic across tabs or add cross-call caching.

The active editor separately retains its displayed load baseline and the raw WorkspaceFs text
observed for that load, with the owning FS reference. Canonical/mirror display precedence stays
unchanged; a fresh raw comparison discards a projection overtaken by an edit, clear or deletion.
Missing raw text (`null`), empty text and unknown read authority remain distinct. Read failures
may still display the existing fallback, with unknown authority that holds autosave/selection
commit for reload. Display-only reapply preserves a same-path observation. Only accepted current
persistence advances the raw baseline; skipped writes do not. Autosave uses the captured raw
baseline and FS identity, while dirty comparison uses displayed text. It never samples new bytes
at Save to authorize an unseen overwrite. This retains the existing check-then-write gap and
same-runtime revision scope; it is not a cross-tab or physical-disk CAS guarantee. Explicit Save
keeps its existing user-action policy. Observed read coalescing is limited to the same FS,
selection key, fallback owner and source revision, and settles without retaining the raw pair.

Shared remote text (`workspace.remote-response-lifecycle`) keeps each request's deadline active
through headers and body consumption. It cancels late or unused bodies and releases abandoned
readers without waiting for producer cleanup. Streaming UTF-8 decoding avoids a second complete
byte buffer while retaining the existing byte cap and decoding behavior. Known HTTP failures
remain authoritative even if their diagnostic body stalls; that does not authorize another
transport attempt. Invalid timeout/byte options use the existing 12-second/2,000,000-byte defaults;
explicit zero-byte limits remain valid. Preflight and alternate transports retain separate budgets.
This does not bound the complete seed workflow or its separate binary loading path.

Mutable workspace refreshes share an active request but revalidate settled results on the next
read. Published documentation explicitly opts into the existing 30-second, 64-entry cache;
each caller receives its own entries. An active refresh supersedes cached bytes for every
caller, and a failed refresh permits retry without restoring the older snapshot.

Both workspace readers use the native authenticated export pages. A completed mirror requires
all pages; missing or repeated cursors and invalid workspace responses fail before partial
results enter the cache. Reconstruction preserves empty and whitespace chunks, separators and
UTF-8 binary ordering for equal chunk positions. The shared reader bounds retained data and
keeps optional storage failure outside cache population so local fallback remains available.

Native push, pull, export, media and binary requests share one deadline across headers and
body: the default is 30 seconds per request, with caller timeouts retained. The shared parser
gives direct responses a 30-second body budget. Incremental reads preserve strict UTF-8 and
the 8 MiB response limit; progress cannot extend the deadline. Timed-out reads remain
retryable, and unused error or status-only media bodies are cancelled without waiting for
the producer. Per-request limits do not bound hashing or an entire multi-request workflow;
an expired mutation may already have completed remotely.

XR asset operations retain their existing whole-operation deadline and combine it with each
request's cancellation signal through body consumption. Expiry settles the caller even when
a dependency ignores cancellation; guards prevent its late completion from starting manifest
publication or local import. Stalled readers receive cancellation without awaiting producer
cleanup and release their lock. Already-started mutations and uploaded parts are retained.
XR manifest and part responses rejected by status or content type are cancelled before the
existing error outcome returns. Headers arriving after request cancellation are disposed
before catalog or manifest readers can consume them; producer cleanup is never awaited.

These are source behavior contracts. The full registry and deployed schema remain separate
release gates; local cache or export checks do not establish payment or Production readiness.

## Workspace text fidelity

CID `workspace.mirror-text-fidelity`: the shared text reader represents an unavailable
response as `null` and preserves successful content exactly, including empty documents,
whitespace and Unicode. Successful empty content stops alias and disk fallback reads.
Default document-view projection keeps successful remote text and resolves only the missing
selected files through existing source-record hydration, within the existing file limit.
Failed hydration preserves the original authored text; reads do not rewrite source records.
Meaningful-seed and active-repair guards still reject blank candidates. Complete-dataset
selection, cache lifetimes, capacity bounds and negative-cache behavior remain unchanged.

## Reconciliation cache ownership

CID `workspace.mirror-reconciliation`: reuse is limited to pure document preparation.
Every sync reads its destination and current source ownership; completion in another store,
prior scope, or removed database cannot suppress reconciliation. Unchanged destination rows,
including mount folders, remain write-free. Ordered path, text, timestamp and authority are
observed exactly; returned maps and entries cannot mutate retained preparation.
One preparation is retained up to 500 input and expanded rows and 128,000 UTF-16 units across
its input/output text fields. Larger inputs and invalid timestamps bypass retention without
truncating content. Calls sharing an entries collection execute in order across scopes;
other collections proceed independently. Supplied arguments are captured on invocation.
The queue admits at most 32 active/waiting calls per destination and rejects overflow visibly.
Failures release queued work; reset clears preparation while preserving live queue ownership.
This ordering covers reconciliation callers, not arbitrary external collection writers.

## Active-entry cache isolation

CID `workspace.active-entry-cache`: filesystem identity and normalized path own cached text.
Cache reads and provided snapshots return independent arrays and primitive entry copies.
Explicit inline strings and successful filesystem reads preserve empty and whitespace-only
content; omitted or unavailable text remains `undefined` for later hydration. A missing read
cannot become a reusable empty document through snapshot reuse. Only nonempty corrupt
canonical content remains eligible for the existing repair path.
Each read owns a token. Newer reads, path/global invalidation and eviction retire old tokens,
so delayed completion cannot replace retained text. A single LRU bounds all owners to 12
pending/complete slots, 500,000 characters per slot and 1,500,000 total retained characters,
including pending paths and entry metadata. Oversized results remain complete without cache
retention. Weak owner identifiers avoid retaining a filesystem through its cache identity.
These fences govern cache installation; callers still own selection and document-write races.

## Reviewed document concurrency

CID `storage.reviewed-document`: accepting remote content or retaining a local retry is
bound to the exact queued bytes, conflict candidates and cached workspace records observed
for that review. Both the cache write and final queue cleanup use conditional transactions.
A replaced mutation, newly queued child or newer remote candidate retains the conflict for
review instead of deleting newer work. Visible-source checks share the inbound projection's
ID and canonical-path matcher, so changed-ID aliases receive the same protection.
Legacy child outbox payloads and their hashes remain unchanged by numeric repair until an
explicit sync-revision migration can establish their v2 meaning. Invalid remote numeric
revisions fail validation before any cache or cursor mutation.

A remote-deleted parent with retained child edits now has explicit shared History/Log choices:
“Restore document and edits” rebases the parent to the observed remote revision, preserves the
latest authored child payload for each overlapping identity, and queues the parent before its
children. “Discard retained edits” accepts parent deletion and removes only the reviewed queued
child identities from local cache; unrelated cached children and remote records remain intact.
The same source-owned family selector reads parent tombstones retained in conflict candidates,
deferred pulls or the already-deleted cache, so an earlier parent acceptance is recoverable.

The local cache/provisional queue write and final cleanup use conditional workspace snapshots.
Concurrent queue replacements, inserted children, remote candidates and visible edits keep the
review pending; a failed review can be retried. Parent/child writes at the server remain individually
revision-checked, so restoration order is not claimed as one remote transaction. A raced parent or
child remains reviewable. No reciprocal refusal guard, automatic child discard or external service
is introduced. Native SQLite round trips cover restoration, explicit discard, graph payloads,
prior-acceptance recovery and review races. `npm --prefix canvas run test:storage-parent-child-browser-smoke`
runs four Chromium cases with two same-origin tabs and real IndexedDB: restore, discard and each
choice during a concurrent tab's replacement and insertion. Production actions and Source Files
projection execute unchanged. Explicit fault injection pauses before the native cleanup transaction;
the second tab writes through the real database adapter. Both connections close and reload before
exact retained payloads and revision history are checked, and raced reviews remain recoverable.
Cases have 20-second deadlines within a 90-second run deadline, with bounded process cleanup. The affected-CI contract
selects this proof for its storage, projection and harness owners. Before/after observations hash
raw tracked and nonignored untracked source bytes and distinguish the observed tree from a
CI-declared candidate. This local browser proof does not establish eviction survival, other browsers,
server acknowledgements or the separately authorized schema/client/Worker rollout.

CID `storage.notification-memoization`: shared sync and engine diagnostics reuse one 128-entry
LRU. JSON-framed keys retain at most 512 UTF-16 code units and semantic signatures at most
1,024 each: 393,216 bytes of retained string payload, excluding runtime object overhead,
input records, UI logs and transient processing. Oversized events bypass retention and invalidate
an earlier signature for the same bounded key. Changed messages, review revisions, child state,
retained counts and durability remain visible. Resolving one workspace clears its sync hints;
engine hints and neighboring workspaces remain independent. Two linear passes preserve up to
128 existing matches before admitting misses, so a repeated ordered 129-conflict scan adds one
log instead of cascading eviction across every entry. Larger working sets can repeat diagnostics.
Toasts and review actions are always updated; cache eviction never changes records or outbox data.

## References

- Parent contract: `docs/documents/agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md`
- Superseded v4.1 contract pointer: `docs/documents/agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md`
- Binary security contract: `docs/documents/agentic-graph-artifact-media-storage-architecture.md`
- Superseded ADR archive: `docs/documents/agentic-graph-prd-tad-adr-mvp-gtm-decisions.md`
- Feishu Base contract: `docs/documents/agentic-graph-mcp/agentic-graph-feishu-base-mcp-prd-tad-adr-mvp-gtm.md`
- Lark App contract: `docs/documents/agentic-graph-mcp/agentic-graph-lark-app-mcp-prd-tad-adr-mvp-gtm.md`
- Lark Docs API overview: https://open.larksuite.com/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN

## Planning continuity — reference implementation

This size/ownership companion consumes `PLAN-AGENTIC-GRAPH-STORAGE-SYNC-PRD-TAD-ADR-MVP-GTM@5.0.1` with [the five-role owner](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md#planning-revision--reference-implementation). Requirements, architecture and decisions remain in their linked owners; MVP and GTM consume them. Historical source checks retain their recorded revision, environment and coverage; this documentation revision renews no readiness, experience rating or paid-demand evidence.


## Source Files connection and transfer

Owner: `canvas/src/features/panels/views/DocumentStorageSyncSettingsRows.tsx`.
The Source Files cloud indicator and Source File Management action open this
existing Settings section. Online explicitly opts into the same-origin storage
service when no deployment switch is supplied; an explicit disabled deployment
switch stays disabled. The workspace comes from the existing storage contract
or its configured environment override. Connection readiness requires an active
browser session and workspace membership, independently of network availability.

`sourceFileCanonicalCloudSync.ts` batches selected Markdown upserts through the
existing durable outbox and verifies remote text after transfer. No canonical
Git commit or missing-file deletion is implied. `sourceFileCloudTransfer.ts`
selects a file or recursive folder boundary, limits each action to 50 files and
5 MiB, and lazily loads from Settings. Downloads rebuild directories in the
browser working copy; differing local text remains intact while cloud text is
saved under a deterministic `.cloud-<digest>` sibling. Repeating a matching
download is a no-op. Download writes do not mutate the Git-backed host mirror.
Binary files and empty directory metadata are not part of the Markdown snapshot
contract. No additional provider, dependency, paid resource, or billing change
is required by this path.

Validation: the registered `sourceFiles.cloudSync` cases cover authentication,
CSRF, read-back, remote conflict retention, directory scope, empty Markdown,
Unicode, repeat downloads, traversal rejection, bounds and actionable setup.
Local and fixture validation does not substitute for a signed-in cloud transfer
receipt or protected production deployment.

This implementation consumes S1/S2/S3/S7 and ADR-1 of the five-role
`PLAN-AGENTIC-GRAPH-STORAGE-SYNC-PRD-TAD-ADR-MVP-GTM@5.0.1` owner: the solo author
can discover setup, retain offline bytes, and request a bounded shared copy.
The existing outbox, authorization, repository mapping and IndexedDB owners are
reused; the new lazy transfer module owns selection and preservation only.
The registered tests above evaluate those source criteria; authenticated
cross-device readback and S6 protected delivery remain open. MVP scope is
Markdown working copies. Buyer demand, WTP, and measured GTM conversion remain
unknown; these checks establish no paid-loop or production claim.

Authentication inventory on 2026-09-14 found the live storage Worker in
`session-exchange` mode, with no Cloudflare Access app or identity provider.
The existing workspace is `kgws:canonical-docs`; membership exists but does not
supply a browser credential. The OAuth implementation below replaces the access-key
prompt with provider sign-in after protected deployment; the Online switch alone
does not configure authentication. GitHub App and Google OAuth clients were created
with owner approval, and their credentials stored in the protected production
environment. Provider setup does not establish deployed runtime readiness.

## Browser sign-in and free quota

### Native account lightbox and private workspace

CID `storage.account-lightbox` continues `storage.browser-signin-presentation`.
The 2026-09-15 user request authorizes native lightbox, account flow and sync
implementation from Graph `5552f031e4eabc938dadbecec77112770f7721ea`.
The buyer need is to sign in and save work without losing the local editor context.

PRD/MVP: offer local use, existing-account sign-in, and explicit creation of a
private workspace through the configured GitHub/Google providers. Never infer
shared-workspace membership from sign-up or an email address. An authenticated
user selects an authorized workspace before continuing the existing sync flow.
Git Markdown stays canonical; IndexedDB and cloud snapshots retain their owners.

TAD/ADR: reuse `PreviewOverlay.tsx` and shared theme tokens. Load the account panel
only on request or a sign-in return; use the browser's modal focus/inert behavior.
The storage Worker provides bounded same-origin provider metadata and authenticated
workspace choices. Provider credentials remain server-only; authorization code,
PKCE, nonce, one-use challenge and HttpOnly cookies retain their current owners.
Explicit sign-up uses one D1 batch for a stable identity, private workspace and
owner membership. A non-contact `identity.invalid` value satisfies the legacy
required email column; it is never an email claim or identity-matching input.
A fixed lifetime reservation admits at most 100 new accounts; failures consume
capacity conservatively. Existing sign-in budgets and Workers/D1 Free remain
required. Browser workspace selection is a routing choice, never an access grant.

Acceptance: keyboard focus stays in the open lightbox and returns on close;
320px and dark/light layouts remain usable; provider failures preserve local work;
sign-up is explicit and same-origin; replays, revoked accounts, concurrent creation,
quota exhaustion and foreign workspace access fail closed. Verify sign-in,
workspace selection and push/pull with real storage handlers and native SQLite;
simulated provider/browser evidence must remain distinct from live OAuth evidence.

GTM: reduce the steps from local draft to first verified cloud save. Activation
and willingness to pay remain unmeasured. Bounds: 26 changed files including
tests/docs, no added dependency, under 600 lines per new module, a lazy auth panel
under 30 kB and the existing 500 kB chunk ceiling. Production still requires a
separate exact-candidate receipt. Roll back the source candidate through the
protected owner workflow; preserve accounts, memberships and local/cloud files.

### Native sign-in presentation

CID `storage.browser-signin-presentation` joins PRD, TAD, ADR, MVP and GTM at
appendix revision `5.0.2`. The user authorized the native design enhancement on
2026-09-15 against source `ae70f31b4499e474c7a0eb306674eae17209dfb7`.
PRD: a returning solo operator can identify a configured provider, continue to
their workspace, or return to local files without confusing sign-in with account linking.
TAD/SVO: `storageOAuthPages.ts` renders the configured authentication choices;
`storageAuthPageStyles.ts` projects the existing shared `kgTokens.ts` palette into
a responsive server-rendered surface. The flow owner still validates return origins,
sessions and linking; presentation introduces no identity or persistence owner.
ADR: reuse the [design guidelines](https://github.com/huijoohwee/huijoohwee.github.io/blob/e9675f27d1eb1e30ae6b8f82669ff7e546d85c65/guidelines/design-guidelines.md),
semantic tokens, native links/forms and system typography. Separate provider sign-in
from authenticated linking. Keep privacy secondary and the offline return explicit.
No email field, signup promise, new provider, client script, external asset or dependency
is introduced. The enhancement replaces the existing login styles only; privacy copy,
permissions, quotas and operator exchange remain owned by their current contracts.
MVP acceptance: desktop and 320px mobile layouts, light/dark themes, visible keyboard
focus, minimum 44px action height, escaped return parameters and same-origin linking
POSTs. The rendered login is capped at 16 KiB; the scope is four files and zero
always-loaded browser bytes. Validate through existing OAuth tests and local browser
review. Recovery is a source revert through protected integration.
GTM: remove sign-in friction before Source Files sync; conversion and willingness to
pay remain unmeasured. Local UI review does not establish callback or cloud-transfer
success, and production deployment requires its own exact-candidate authorization.

The optional `oauth` browser-auth mode uses the existing storage session, identity,
and workspace-membership owners. `storageOAuthProviders.ts` owns GitHub App and
Google adapters; `storageOAuthState.ts` seals five-minute browser state and PKCE;
`storageOAuthQuota.ts` owns atomic D1 admission and one-use challenges;
`storageOAuthFlow.ts` composes them; `storageOAuthPages.ts` owns the sign-in and
public `/api/storage/auth/privacy` notice. No browser SDK or provider token persistence
is added. GitHub requests no repository, organization, or email permissions;
Google requests only `openid`. Email addresses never establish identity ownership.

Enable only after configuring exact callback origins, storing client secrets in
Worker secrets, applying migration `0021_storage_oauth_budget.sql`, and enrolling
the owner's verified stable provider ID in `auth_identities`. A connected account
may explicitly link another provider from the sign-in page, using an active
same-origin session. Linking cannot change users or workspace memberships, overwrite
another identity owner, or survive session revocation. First-time identities have
no shared workspace access; explicit signup creates only their private workspace. Git-backed Markdown remains canonical; cloud copies
and IndexedDB remain synchronized projections with existing conflict preservation.
The protected release controller enrolls the existing human owner's stable GitHub
ID without matching email. Its bounded operator POST exchange remains available for
automated release probes; provider sign-in pages do not request that credential.

The native sign-in budget is 500 admitted starts/callbacks per UTC day and 20 per
minute per keyed client bucket. At most 66 quota rows exist including the lifetime signup counter; expired challenges are
removed at the next admitted start. Atomic SQL prevents concurrent over-admission.
Provider requests have a five-second timeout and 64 KiB response limit; rate-limit
responses stop without retries. Provider tokens are used only for sign-in and discarded.
These are application sub-budgets, not account-wide billing controls. Production must
remain on Workers Free and D1 Free, which reject operations at their limits. Never
upgrade a plan, enable paid overflow, or treat an application counter as evidence of
the provider account plan. No new vector database or paid identity service is needed.

Validation: `cloudflare/workers/agentic-graph-storage/storageOAuth.test.ts` exercises
native SQLite admission, replay rejection, membership checks, signed Google claims,
provider errors and account linking. `storageCoreReadiness.ts` requires both OAuth
tables when this mode is selected. Passing source tests is not live provider or
cloud-transfer proof; those receipts belong to the protected deployment workflow.
