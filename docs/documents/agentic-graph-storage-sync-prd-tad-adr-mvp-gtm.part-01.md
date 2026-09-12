---
title: "Reference implementation: agentic-graph-storage-sync-prd-tad-adr-mvp-gtm section 1"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "5.0.1"
date: "2026-09-12"
lang: "en-US"
owner: "docs.storage.sync"
continuity_id: "PLAN-AGENTIC-GRAPH-STORAGE-SYNC-PRD-TAD-ADR-MVP-GTM"
prd_revision: "5.0.1"
tad_revision: "5.0.1"
adr_revision: "5.0.1"
mvp_revision: "5.0.1"
gtm_revision: "5.0.1"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "1-443"
---

[Combined planning owner](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-STORAGE-SYNC-PRD-TAD-ADR-MVP-GTM@5.0.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.



# Reference implementation: agentic-graph Storage and Synchronization

## Authority and readiness

This document owns the product and architecture contract for local working persistence and optional
shared projections. Authored Markdown remains canonical. The portable authority is Git-backed
Markdown plus YAML frontmatter; GitHub is the current protected forge, not an irreplaceable content
database. Browser records, Lark resources, shared D1 rows, R2 objects, collaboration rooms, and
generated mirrors are supporting stores with explicit roles.
The protected Pages release does not deploy storage Worker code.

The source contains working adapters, but no satisfying Evidence Reference is attached here.
Therefore local readiness is `spec-complete` and delivered readiness is `undocumented`.

**Version note (v5.0.0)**: this revision restructures the document to close template gaps against
`prd-tad-adr-mvp-gtm-guidelines.md` v1.7.0 — User Stories, Component Specifications, Integration Contracts,
Quality Attributes, Deployment Strategy, a Readiness Gap Matrix, and three embedded Architectural
Decision Records are added. The joined artifact uses `doc_type: "PRD-TAD-ADR-MVP-GTM"` because
ADR ownership moves from the external `decision_archive` document into this document; the prior
decision archive file is archived, not deleted, per the Phase 4 archival rule. No readiness rung is
raised by this revision: structural gaps are closed, evidence gaps are not, and every new or changed VCC is
tracked honestly at `spec-complete`/`undocumented` in the Readiness Gap Matrix below.

**Traceability scheme**: this document fuses the guideline's `PRD-[Epic]-[Story] ↔
TAD-[Component]-[Interface] ↔ VCC [condition] ↔ Evidence Reference [check + result]` chain into one
identifier per capability, written `S[N]`. Each `S[N]` row in Requirements and VCCs is simultaneously
its own PRD acceptance criterion, its own VCC, and its own traceability anchor; the TAD component(s)
implementing it are named in Component Specifications and Component Inventory below.

## Recommended knowledge-base storage boundary

| Store or format | Decision | Minimum-value use | Forbidden authority claim |
|---|---|---|---|
| Git-backed Markdown/frontmatter | **Choose as SSOT** | Portable authoring, reviewable diffs, provenance, rollback, and agent-readable context | GitHub-specific UI or API state is not the content format. |
| Lark Suite Base + Wiki/Docs | **Integrate as collaboration projection** | Base for structured catalog/workflow fields; Wiki/Docs for navigation, discussion, and review | A Lark row, page, callback, or web-app payload cannot silently overwrite accepted source. |
| Cloudflare Pages/static Markdown | **Generate for publication** | Low-cost public read path for `airvio.co/agentic-graph` from an exact accepted revision | Published bytes are not an authoring root. |
| Cloudflare D1 | **Use as rebuildable structured projection** | Search, relationship, document metadata, cursors, and runtime queries | D1 content is not canonical Source Files content. |
| Cloudflare R2 | **Use for large or content-addressed bytes** | Media, exports, snapshots, and content-addressed artifacts | Immutability applies only where an owning route proves it; object existence does not prove source acceptance or delivery readiness. |
| Cloudflare KV | **Use narrowly** | Small caches, configuration, and revision pointers | KV is not for relational authority or concurrent document edits. |
| Cloudflare Durable Objects | **Use for live coordination only when needed** | One selected per-document room, ordering, and ephemeral collaboration state | Room history does not become durable authoring authority. |
| CSV/JSON | **Use for interchange** | Bulk import/export, backups, and deterministic transforms | An exchange file is a candidate until provenance and review bind it to Git. |
| PostgreSQL/other database | **Defer** | Future workloads that prove D1/source projections insufficient | Do not add a second database before measured scale, query, or retention need. |

The Git-backed Markdown/frontmatter SSOT choice is formalized in **ADR-1**; the Lark boundary below is
formalized in **ADR-3**. The recommended Lark integration is host-mediated and review-first. A Lark web app may provide the
user experience under the
[Web App API boundary](https://open.larksuite.com/document/client-docs/gadget/-web-app-api/api-overview),
while a server-owned adapter applies the [Lark Docs/Base OpenAPI](https://open.larksuite.com/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN)
scopes and user/tenant access-token permissions. The browser receives no app secret or reusable
provider credential. Start with read-only Base/Wiki/Docs discovery and supplied-snapshot import;
add outbound write-back only after idempotency, conflict, audit, rollback, deletion, and cost VCCs
are evidenced.

For the current release topology, accepted Dev source in `huijoohwee/agentic-graph` generates the
`huijoohwee/content/agentic-graph` mirror, which is then published to `airvio.co/agentic-graph`. The mirror
and public route remain generated projections and are never authoring roots.

The proposed Lark knowledge-base integration must define one typed projection envelope that binds:

- source repository, repository-relative path, accepted Git revision, and content digest;
- projection provider, resource identifier, provider revision, schema version, and generation time;
- direction (`source-to-projection` or `projection-to-candidate`) and review state.

No current D1 row or Lark adapter is claimed to satisfy this target. Its schema, migration, and
verification owner must be admitted before remote integration work begins.

The only accepted external-edit flow is `Lark change -> immutable snapshot/event -> normalized
Markdown/frontmatter candidate -> reviewed protected merge -> regenerated Lark/Cloudflare
projections`. Concurrent providers never use last-write-wins against the source.

## Problem and personas

| Persona | Problem | First value |
|---|---|---|
| Solo author | browser refresh/offline work can lose context | save and reopen one local source |
| Multi-device author | revisions can diverge across devices | explicit push/pull result or conflict |
| Collaborator | concurrent edits can overwrite one another | one selected room provider and visible state |
| Operator | source, shared state, and delivery can be confused | exact store role, evidence, and rollback |

## User Stories

**As a** solo author, **I want** my edits saved to a recoverable local record before any network
transport, **so that** a browser refresh or offline stretch never loses my work.

**As a** multi-device author, **I want** an explicit push/pull result or a surfaced conflict instead
of a silent overwrite, **so that** I can trust which revision is authoritative across devices.

**As a** collaborator, **I want** exactly one room provider to own concurrent edits to a document,
**so that** two providers never dual-write and corrupt shared state.

**As an** operator, **I want** every store's role, evidence, and rollback path stated explicitly,
**so that** I never mistake a rebuildable projection (D1, R2, a mirror, a Lark page) for the
authoring source.

## Journey: Author — Save, reconnect, and reconcile

| Stage | Action | Touchpoint | Pain | Opportunity |
|---|---|---|---|---|
| Trigger | edits one source | workspace | fears loss | persist locally before transport |
| Discover | inspects save/sync state | Source Files | status can be ambiguous | expose local, queued, conflict, and failure |
| Engage | requests synchronization | sync adapter | network may fail and trust differs by adapter | bounded outbox, typed result, and explicit auth gap |
| Complete | reopens or reconciles | workspace | fears silent overwrite | retain canonical revision and conflict |
| Return | continues offline/online | local store | provider may be unavailable | local-first degraded mode |

## Requirements and VCCs

| ID | Given / When / Then | VCC: end state; stated check; constraint |
|---|---|---|
| S1 Local durability | Given a valid source edit, when saved, then a recoverable local record exists before optional transport. | End: save/reopen and fallback tests pass; Check: `npm test` exits 0; Constraint: source identity remains explicit and memory fallback is not called durable. |
| S2 Typed synchronization | Given queued mutations, when push/pull runs, then applied/conflict/rejected/deferred results are recorded with cursors. | End: storage/runtime suites pass; Check: `npm run runtime:test` exits 0; Constraint: conflict/rejection is never silently resent or overwritten. |
| S3 Source authority | Given local, shared, and mirror copies, when identities disagree, then the configured authored source and revision remain authoritative. | End: source-authority tests pass; Check: `npm test` exits 0; Constraint: no D1/browser/mirror record becomes an implicit authoring owner. |
| S4 Optional collaboration | Given concurrent editing is enabled, when a document opens, then exactly one room provider owns updates and recovery. | End: provider-specific room/replay tests pass; Check: `npm test` exits 0; Constraint: no dual-write between room providers. |
| S4a Collaboration CRDT engine | Given the Room provider is enabled for a document, when concurrent edits arrive, then updates merge via a CRDT engine without last-write-wins and the merged state squashes to a Markdown/frontmatter candidate through the existing S9 review path. | End: CRDT-merge fixtures pass and squash-to-candidate fixtures pass; Check: a future named CRDT suite exits 0; Constraint: CRDT room state is never treated as durable authoring authority; only the squashed Markdown candidate may enter Git review. Engine selection: ADR-2. |
| S5 Binary separation | Given generated/uploaded bytes, when stored or replayed, then binary-route auth/overwrite behavior matches the dedicated contract. | End: media/blob suites pass; Check: named binary tests exit 0; Constraint: no entitlement, immutability, or delivery claim beyond actual handlers. |
| S6 Protected delivery | Given a shared Worker or mirror candidate, when promotion is requested, then Source→Mirror→Delivery boundaries remain closed without evidence and instruction. | End: exact candidate/live/rollback receipt exists; Check: protected workflow reports it; Constraint: the Pages release does not implicitly deploy storage Workers. |
| S7 Shared authorization | Given a shared structured route, when authorization is missing or invalid, then the request is rejected before any read or write. | End: negative auth tests pass for push, pull, and export; Check: `storage-relay/storagePublicationBrowserSession.test.ts` and adjacent security suites pass; Constraint: source authorization does not prove deployed authorization, so shared delivery remains closed. |
| S8 Projection provenance | Given any Lark or Cloudflare projection, when it is read, then its accepted source revision and content digest are explicit and verifiable. | End: projection-envelope fixtures pass; Check: a future named projection suite exits 0; Constraint: provider timestamps, titles, and row IDs cannot substitute for source identity. |
| S9 External edit review | Given a Lark or interchange edit, when synchronization runs, then it produces a bounded candidate and never overwrites authored source directly. | End: candidate/conflict/idempotency fixtures pass; Check: a future named provider-adapter suite exits 0; Constraint: remote acquisition and write-back remain unimplemented and delivery-closed today. |

## Time-to-value and metrics

| Metric | Baseline | Target | Timeline |
|---|---:|---:|---|
| Local save/reopen TTV | unmeasured | ≤3 actions / ≤5 min | before baseline |
| Offline save recovery | unmeasured | 100% canonical fixtures | before baseline |
| Conflict visibility | unmeasured | 100% conflict fixtures produce explicit state | before enabling shared sync |
| Mandatory token cost | 0 by design | 0/run and $0/month | every run |
| Local cash TCO | $0 estimate | $0/month; $0/12 months | monthly |
| Shared cash TCO | unmeasured | operator-approved budget before use | before delivery |
| Local readiness rung | `spec-complete` | evidence-derived only | every revision |
| Delivered readiness rung | `undocumented` | evidence-derived only | every revision |

## MoSCoW Priority & ROI

Score is `(impact × monthly reach) / (build hours + 12-month cash TCO/100 + risk)`.

| Tier | Capability | Estimated ROI | 12-month TCO | Scope | Rationale |
|---|---|---:|---:|---|---|
| Must | local working store and recovery | 3.1 | $0 | minimum viable | highest-frequency pain (data loss on refresh/offline); zero cost to ship |
| Must | typed outbox/cursor/conflict | 2.2 | $0 local | minimum viable | prevents silent overwrite across devices; zero infra cost |
| Must | source-authority labels | 3.8 | $0 | minimum viable | cheapest highest-leverage fix: stops any store from being mistaken for SSOT |
| Should | optional shared structured sync | 0.9 | $0–540 | evidence-gated | real value, but only past S2/S7 evidence; not worth Must-tier risk yet |
| Should | one collaboration room provider (CRDT: Yjs, ADR-2) | 0.6 | $120–1,200 | evidence-gated | closes S4/S4a; ROI depends on real concurrent-editing demand materializing |
| Could | shared binary replay | 0.5 | $0–420 | blocked on security VCCs | S5's exact-candidate security evidence must be recorded first (see Readiness Gap Matrix) |
| Won't | hidden cloud authority or unbounded auto-sync | <0.1 | unbounded | excluded | violates source-authority (S3) and lane-closure defaults outright |

### Min-Viable Scope

Local save/reopen, explicit memory fallback, typed outbox/cursor/conflict, and zero-token operation.
This is the entire Must tier above; nothing in Should/Could/Won't is required to satisfy it.

### Out of Scope

Real-time collaboration, automatic Worker delivery, and claims of cross-device/public durability are
out of scope until separately evidenced. CRDT room state (ADR-2) is explicitly excluded from ever
becoming durable authoring authority. Hidden cloud authority and unbounded auto-sync are excluded
outright (Won't tier).

### Dependencies

Git-backed Markdown/frontmatter authoring workflow (ADR-1); a Cloudflare account with Workers, D1,
R2, KV, and Durable Objects bindings; browser IndexedDB/Dexie support for the working store; the
existing typed route-path and binary-contract modules named in Component Inventory; a Yjs-compatible
Durable Object provider package (Should tier, ADR-2); a scoped Lark tenant with Base/Wiki/Docs OpenAPI
access (Should tier, ADR-3, only if the collaboration-projection track is pursued).

## Topology: Storage roles v5.0 — 2026-08-06

| Node | Role | Type | Lane | Connects to | Connection | Data residency |
|---|---|---|---|---|---|---|
| Authored source | Store | Markdown/file or configured source | Authoring | Source Files | file/API | configured source root |
| Protected Git history | Authority/Audit | Git repository; GitHub is current forge | Authoring | authored source, build jobs | commit/review | configured repository |
| Source Files | Router/Consumer | client feature | Authoring | working store, sync client | in-process events | browser memory |
| Working store | Store | IndexedDB/Dexie or explicit memory adapter | Authoring | sync client | local transaction | user device |
| Sync client | Producer/Consumer | typed client adapter | Authoring | shared Worker | bounded HTTPS | request memory |
| Shared Worker source | Gateway | Worker source | Authoring | D1/R2/room binding | in-process binding | configured service region |
| Structured store | Store | D1-compatible database | Authoring until delivered separately | Worker | binding call | configured database region |
| Binary store | Store | R2-compatible object store | Authoring until delivered separately | Worker | binding call | configured bucket region |
| Room provider | Store/Gateway | optional collaboration service; CRDT engine: Yjs (reference implementation, MIT — ADR-2) | Authoring until delivered separately | Source Files | WebSocket/realtime | provider configuration |
| Lark collaboration | Producer/Consumer | optional Base + Wiki/Docs adapter | Authoring until evidenced | candidate review, projection publisher | host-mediated OpenAPI | configured tenant/region |
| Mirror | Store | immutable candidate | Mirror | Delivery | protected batch | mirror artifact store |
| Delivery | Consumer/Gateway | optional public/shared runtime | Delivery | clients | HTTPS/WebSocket | declared delivery region |

```mermaid
flowchart TB
  subgraph Device["User device · Authoring"]
    Source["Authored source"]
    Files["Source Files"]
    Local["Working store"]
    Sync["Sync client"]
  end
  subgraph SharedSource["Optional shared source · Authoring"]
    Worker["Shared Worker source"]
    D1["Structured store"]
    R2["Binary store"]
    Room["Room provider · Yjs CRDT (ADR-2)"]
  end
  subgraph MirrorLane["Mirror lane"]
    Mirror["Immutable candidate"]
  end
  subgraph DeliveryLane["Delivery lane"]
    Delivery["Delivered shared surface"]
  end
  Source -- "file/API" --> Files
  Files -- "local transaction" --> Local
  Local -- "bounded HTTPS" --> Sync
  Sync -- "bounded HTTPS" --> Worker
  Worker -- "binding" --> D1
  Worker -- "binding" --> R2
  Files -- "WebSocket/realtime" --> Room
  SharedSource -. "protected batch" .-> Mirror
  Mirror -. "protected publication" .-> Delivery
```

**Version note**: v5.0 preserves the v4.1 delivery boundary and SSOT model unchanged, and adds one
decision: the Room provider's CRDT engine is now named (Yjs, ADR-2) rather than left unspecified.
This closes a structural gap in S4 without raising S4's readiness rung — no evidence is recorded for
this revision. ADR ownership moves into this document (see Architectural Decision Records); the
prior long-form ADR narrative remains an archived, non-authoritative reference.

## Orchestration/Harness Flows

Not applicable. Every storage/sync operation in this document's scope runs at a zero-LLM-token
budget (see TCO comparison); there is no AI-powered pipeline to route through a dispatcher/executor/
observer/consumer chain. This section is deliberately closed empty rather than omitted, so its
absence is a stated fact rather than an undocumented gap.

## Data flows

### Local save and reopen

| Stage | Component | Input | Output | Persistence | Error handling |
|---|---|---|---|---|---|
| Ingest | Source Files | source edit + identity | typed source revision | active source | validation error |
| Transform | storage mapper | revision | document/chunk/snapshot/outbox records | none | typed mapping error |
| Store | working store | records | committed local transaction | device; user-controlled | explicit memory fallback/failure |
| Serve | workspace | reopened record | source/projection | active session | preserve unsaved state |

### Optional synchronization

| Stage | Component | Input | Output | Persistence | Error handling |
|---|---|---|---|---|---|
| Ingest | sync client | outbox + cursor | bounded request | request-scoped | retain outbox |
| Transform | shared Worker | typed mutations/base revisions | applied/conflict/rejected/deferred | transaction-scoped | typed revision/quota result; session authentication and workspace authorization |
| Store | structured/binary/room owner | accepted record/update | shared projection | declared retention/region | rollback/reconcile |
| Serve | reconciler | response + local state | updated cursor/conflict | local history | no silent overwrite |

### Room synchronization (CRDT, design-only — ADR-2)

| Stage | Component | Input | Output | Persistence | Error handling |
|---|---|---|---|---|---|
| Ingest | Room provider (Durable Object) | client Yjs update | applied update broadcast | active room, in-memory + hibernatable | reconnect-and-resync on drop |
| Transform | CRDT engine (Yjs) | concurrent updates | merged document state | none (ephemeral room state) | automatic conflict-free merge; no last-write-wins |
| Store | squash step | merged state | Markdown/frontmatter candidate | candidate worktree only, via S9 path | squash failure retains prior snapshot |
| Serve | protected Git workflow | candidate diff + source base | accepted revision or rejection | Git history | identical to Lark candidate flow's Review stage; no direct-write to canonical source |

This flow is unimplemented for this revision (S4a is `spec-complete`, not `dev-proven`); it is
documented ahead of the evidence per the guideline's Phase 2 authoring step, and its rung will not
move until the CRDT-merge and squash-to-candidate fixtures named in S4a exist and pass.

### Lark collaboration candidate flow

| Stage | Component | Input | Output | Persistence | Error handling |
|---|---|---|---|---|---|
| Discover | host-owned Lark adapter | scoped Base/Wiki/Docs selection | immutable provider snapshot + revision | request/evidence store | reject missing scope, token permission, or provider revision |
| Transform | deterministic mapper | snapshot + mapping version | Markdown/frontmatter candidate + diagnostics | candidate worktree only | preserve unsupported fields; no invented repair |
| Review | protected Git workflow | candidate diff + source base | accepted revision or explicit rejection/conflict | Git history | never direct-write canonical source |
| Project | bounded publisher | accepted revision + content digest | Lark and Cloudflare projections | declared provider stores | idempotent retry; retain prior projection on failure |

## Component Specifications

| Component | Responsibility and interfaces | Dependencies and configuration | FOSS / vendor | VCC, evidence, and readiness |
|---|---|---|---|---|
| Working store | Persists typed document/chunk/snapshot/outbox records in a committed local transaction before optional transport; exposes the Dexie/IndexedDB transactional API and an explicit memory-fallback adapter implementing the same typed contract. | `canvas/src/lib/storage/agentic-graph-storage-sync-contract.ts`; IndexedDB-versus-memory adapter selection and per-record retention policy. | FOSS: Dexie, MIT (reference implementation). | S1; no Evidence Reference recorded this revision; Local `spec-complete`, Delivered `undocumented`. |
| Sync client | Dispatches queued outbox mutations to the shared Worker source and records applied/conflict/rejected/deferred results against a cursor through the bounded HTTPS contract below. | Working store outbox and Shared Worker source; retry/backoff policy; request-scoped memory only. | FOSS: project-owned client module. | S2; no Evidence Reference recorded this revision; Local `spec-complete`, Delivered `undocumented`. |
| Room provider (CRDT) | Merges concurrent edits for exactly one open document through WebSocket/Durable Object and the Yjs sync protocol, then squashes merged state to a Markdown/frontmatter candidate; `y-indexeddb`-equivalent local persistence stays alongside, not in place of, the working store. | One Durable Object per document and the existing S9 review path; exactly one active provider per document; idle hibernation. | FOSS: Yjs, MIT (reference implementation; ADR-2 owns alternatives). | S4/S4a; no evidence recorded and the remote/live adapter is unimplemented; Local `spec-complete`, Delivered `undocumented`. |
| Lark configuration/import adapter | A host-owned adapter discovers scoped Base/Wiki/Docs resources and produces an immutable provider snapshot for the deterministic mapper through host-mediated OpenAPI; the browser receives no reusable credential. | `agentic-graph-mcp/agentic-graph-feishu-base-mcp-prd-tad-adr-mvp-gtm.md`, `agentic-graph-mcp/agentic-graph-lark-app-mcp-prd-tad-adr-mvp-gtm.md`; scope allowlist and snapshot retention window. | Proprietary Lark platform, project-owned adapter; ADR-3 owns the TCO/FOSS comparison. | S9; remote fetch/write-back is not evidenced; Local and Delivered `undocumented`. |

Current source authenticates snapshot push/pull/export and workspace blob/media requests, then checks
workspace membership. Browser sessions use same-origin HttpOnly cookies and require configured Access
settings. Private document reads use the same session and membership checks; anonymous document reads
require an explicit publication matching the current revision. Chat, relay, room and crawler routes retain
their existing credential contracts. Native coverage lives in `storage-relay/storagePublicationBrowserSession.test.ts`
and adjacent storage security tests. Source checks do not establish deployed S7 readiness or live KV bindings.
Binary route security is owned by `agentic-graph-artifact-media-storage-architecture.md`: public generic
blobs require workspace authorization; run media requires signed capabilities. Unsigned run tokens are
restricted to explicit local-runtime fallback. Authorized objects remain overwriteable at their scoped key.

## Integration Contracts

| Interface | Protocol and format | Error contract |
|---|---|---|
| Sync client ↔ Shared Worker source | Bounded HTTPS outbox push/pull; JSON using the typed document/chunk/snapshot/outbox/cursor schema. | Typed applied/conflict/rejected/deferred result; retry with backoff on network failure; no silent overwrite. |
| Source Files ↔ Room provider (CRDT, ADR-2) | WebSocket to a Durable Object; Yjs sync protocol reference implementation with binary Yjs update encoding v1. | Reconnect-and-resync on drop; awareness/presence is best-effort; squash failure retains the prior snapshot. |
| Host-owned Lark adapter ↔ Lark Base/Wiki/Docs OpenAPI | HTTPS with a server-owned tenant/user token; Lark JSON → deterministic mapper → Markdown/frontmatter candidate. | Reject missing scope, token permission, or provider revision; never invent repairs for unsupported fields. |

## Architectural Decisions

See ADR-1 (SSOT storage format), ADR-2 (collaboration CRDT engine), and ADR-3 (Lark integration
boundary) in **Architectural Decision Records** below.

## Quality Attributes

| Attribute | Scenario | Pattern | Validation |
|---|---|---|---|
| Performance | Local save/reopen under normal load → local write commit well under human-perceptible delay | IndexedDB/Dexie transactional writes; no network round-trip on the hot path | Local benchmark harness against S1 fixtures |
| Scalability | Growth to N concurrent collaborators per document room → sync latency must not degrade past target | One Durable Object instance per document (per-document sharding); hibernation when idle | Load test against Durable Object free-tier request/compute ceilings |
| Security | Unauthenticated request against structured/binary routes → request rejected before any read or write | Bearer/session auth gate on Worker routes; signed run-media tokens (S7) | Negative auth test suite named in S7 |
| Observability | Sync conflict or rejection occurs → operator can see conflict state, cursor, and surface | Typed outbox/cursor/conflict records surfaced to Source Files UI | Conflict-fixture pass; manual conflict-visibility walkthrough (see Time-to-value) |
| Token Cost | Any storage/sync operation → zero LLM token spend | No model calls anywhere on the storage/sync path, by design | Cost log sampling shows $0.00 across all named checks |
| Offline Behaviour | Network/provider unavailable → local save/reopen stays available in degraded mode | Local-first working store with deferred reconciliation; explicit memory fallback only as a last resort | Airplane-mode pass; reconciliation replay test |
| TCO | 12-month spend at solo-dev/small-team load → stays within the $0–$45/mo optional band stated below | Cloudflare free-tier-first (D1/R2/DO/KV); FOSS CRDT engine (Yjs); no proprietary KB database | Monthly cost audit against TCO comparison table |
| Device Reach | Browser-first, offline-capable client across desktop and mobile → same storage contract everywhere | IndexedDB/Dexie works across modern browsers; no native-only APIs on the storage path | Cross-device manual pass |

## Deployment Strategy

Promotion is rolling and strictly lane-gated: authoring → mirror → delivery, per the Deploy Boundary
Register below. No blue-green or canary infrastructure is added at this scale — Cloudflare Worker
deploys are effectively atomic per version already. Rollback restores the prior Worker, config, and
migrations, then reruns the sync, conflict, auth, and read-back probes named in each boundary's
Evidence Reference; this is the same rollback statement already recorded per boundary, not a second
mechanism.

## Component Inventory

*Status values are Readiness Ladder rungs only; local and delivered are separate columns.*

| Layer | Component | File / Module | Local rung | Delivered rung |
|---|---|---|---|---|
| Browser contract/types | Storage sync contract | `canvas/src/lib/storage/agentic-graph-storage-sync-contract.ts` | `spec-complete` | `undocumented` |
| Route identity source | Storage route paths | `canvas/src/lib/storage/agentic-graph-storage-route-paths.ts` | `spec-complete` | `undocumented` |
| Browser database | Working store (Dexie/IndexedDB + memory fallback) | storage-sync client modules | `spec-complete` | `undocumented` |
| Storage Worker | Shared Worker source dispatcher | `cloudflare/workers/agentic-graph-storage/index.ts` | `spec-complete` | `undocumented` |
| Structured persistence | D1 modules/migrations | Worker D1 modules | `spec-complete` | `undocumented` |
| Binary persistence | R2 blob/media handlers | `cloudflare/workers/agentic-graph-storage/blob.ts`, `media.ts` | `spec-complete` | `undocumented` |
| Collaboration | Room provider (CRDT: Yjs, ADR-2) | Source Files room adapters + Durable Object source | `spec-complete` | `undocumented` |
| Lark configuration/import | Lark adapter (config + supplied-snapshot only) | `agentic-graph-mcp/agentic-graph-feishu-base-mcp-prd-tad-adr-mvp-gtm.md`, `agentic-graph-mcp/agentic-graph-lark-app-mcp-prd-tad-adr-mvp-gtm.md` | `undocumented` | `undocumented` |
| Git/file relay | Authenticated source transport | `agentic-graph-storage-git-file-sync-runtime-api.md` | `spec-complete` | `undocumented` |
| Release | Documentation/Pages release seed | `.github/workflows/release.yml` | `spec-complete` | `undocumented` |

## VCC and Evidence Reference register

| VCC | Named check | Recorded result | Surface | Derived rung |
|---|---|---|---|---|
| S1, S3 | `npm run check && npm test` | not recorded for this revision | authoring | `spec-complete` |
| S2, S4 | `npm run runtime:test` | not recorded for this revision | authoring | `spec-complete` |
| S4a | CRDT-merge and squash-to-candidate fixtures (named suite not yet created) | no satisfying check exists | authoring | `spec-complete` |
| S5 | named media/blob unit tests in the binary contract | not recorded | authoring | `spec-complete` |
| S6 | exact storage Worker delivery/security/rollback check | not recorded | delivery | `undocumented` |
| S7 | negative authorization tests for structured push/pull/export | no satisfying check exists | authoring/delivery | `undocumented` |
| S8 | projection-envelope source revision/digest checks | no satisfying check exists | authoring | `spec-complete` |
| S9 | Lark candidate/conflict/idempotency checks | remote adapter is not implemented | authoring/delivery | `undocumented` |

## Readiness Gap Matrix

*Local rung and delivered rung are separate columns; both draw from the Readiness Ladder. Priority
is the highest severity among the findings linked to that workstream, or `none`.*

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criteria (VCC) |
|---|---|---|---|---|---|
| Local durability | `spec-complete` | `undocumented` | Local check exists but has no recorded result this revision | major | S1 |
| Typed synchronization | `spec-complete` | `undocumented` | Runtime suite exists but has no recorded result this revision | major | S2 |
| Source authority | `spec-complete` | `undocumented` | Same evidence gap as S1 (shared check) | major | S3 |
| Collaboration room (CRDT) | `spec-complete` | `undocumented` | Engine chosen (ADR-2) but merge/squash fixtures not yet built | minor | S4, S4a |
| Binary separation | `spec-complete` | `undocumented` | Source authorization exists; exact deployed binary security evidence is absent | blocker | S5 |
| Protected delivery | `undocumented` | `undocumented` | No exact live storage/auth/rollback check exists yet | blocker | S6 |
| Shared authorization | `undocumented` | `undocumented` | Session and membership gates exist in source; exact deployed authorization evidence is absent | blocker | S7 |
| Projection provenance | `spec-complete` | `undocumented` | Envelope fixtures not built | major | S8 |
| External edit review (Lark) | `undocumented` | `undocumented` | Remote adapter unimplemented; no fetch or write-back evidenced | minor | S9 |

## TCO comparison

*Each row states its deployment model explicitly, per the guideline's Deployment-Model TCO Variants
rule; Provisioned/Self-Managed and Hybrid/Consolidated are never blended into one figure.*

| Model [deployment model] | Infra/month | Egress/month | 12-month cash | Ops burden | Default |
|---|---:|---:|---:|---:|---|---|
| Local working store [device-local, N/A] | $0 | $0 | $0 | low | chosen minimum |
| Managed shared structured/object/room adapters [Managed/Serverless — Cloudflare D1/R2/DO/KV] | $0–45 | $0–15 | $0–720 | medium (near-zero per unit; provider patches/scales/hibernates) | optional |
| Lark collaboration projection [Managed/Serverless only — Lark offers no self-hosted variant] | plan-dependent/unmeasured | provider-dependent | unmeasured | low/medium (rate-limit backoff engineering) | optional after demand and permission review; see ADR-3 |
| FOSS self-hosted shared stack [Provisioned/Self-Managed — dedicated VPS] | $15–100 | $0–25 | $180–1,500 | high (patching, backup, failover, capacity planning) | portability fallback |
| FOSS self-hosted shared stack [Hybrid/Consolidated — shares existing Oracle A1 ARM free-tier box already running Ollama inference] | $0–20 incremental | $0–15 | $0–420 | medium/high, amortized against an already-operated box | preferred fallback over a new dedicated VPS |
| Hybrid local + selected managed adapters [mixed Managed/Serverless] | $0–35 | $0–15 | $0–600 | medium/high | only with measured value |

All storage/sync operations have a zero-LLM-token budget.

## Deploy Boundary Register

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement/check | State |
|---|---|---|---|---|---|---|
| `STORAGE-SOURCE-TO-MIRROR` | Authoring | Mirror | local/security candidate result `not recorded` | `none` | discard candidate; rerun local/runtime/security checks | `closed` |
| `STORAGE-MIRROR-TO-DELIVERY` | Mirror | Delivery | exact live storage/auth/rollback result `not recorded` | `none` | restore prior Worker/config/migrations; rerun sync, conflict, auth, and read-back probes | `closed` |

## Architectural Decision Records

### ADR-1: Git-backed Markdown/frontmatter as the sole SSOT
**Status**: Accepted
**Date**: 2026-08-06 *(formalizes a decision already reflected in the knowledge-base storage
boundary table above; this ADR records it as an addressable decision rather than changing it)*

**Context**: the storage boundary table must name exactly one canonical authoring format across
local, shared, and mirror stores, or capability ownership becomes ambiguous as more projections
(Lark, Cloudflare stores, future providers) are added.

**Decision**: Git-backed Markdown plus YAML frontmatter is the sole SSOT. GitHub is the current
protected forge, not an irreplaceable content database. All other stores (D1, R2, KV, Durable
Objects, Lark, mirrors) hold non-authoritative, rebuildable projections.

**Alternatives Considered**:
1. CRDT-document-as-truth (reference implementation pattern: a Y-Doc binary as canonical state, as
   used by document-collaboration platforms built on BlockSuite/Yjs): Pros — native real-time
   convergence, no separate review step for concurrent edits. Cons — canonical state becomes an
   opaque binary requiring conversion for human/Git review; self-hosting the reference stack
   requires a provisioned relational database, cache, and object store running together, adding
   ops burden this project's zero-infra posture rejects.
2. FOSS alternative — status quo, Git-backed Markdown/frontmatter (chosen): Pros — plain-text diffs,
   reviewable via existing Git tooling, zero additional runtime. Cons — no native real-time merge;
   concurrent-edit convergence must be added as a bounded, non-authoritative layer (see ADR-2).

**Rationale**: reviewability, provenance, and zero-infra TCO outweigh the convergence convenience of
a CRDT-native canonical format at current scale; convergence can be layered on top without changing
the SSOT.

**TCO Impact**:

| Dimension | Chosen: Git+Markdown [Managed/Serverless — GitHub free tier] | FOSS Alt: CRDT-canonical [Provisioned/Self-Managed — dedicated VPS] | FOSS Alt: CRDT-canonical [Hybrid/Consolidated — existing Oracle A1] | Delta / 12 months |
|---|---|---|---|---|
| Infra cost | $0/mo | $15–40/mo | $0/mo incremental | +$0 to +$480 |
| Egress cost | $0 | $0–10/mo | $0–10/mo | +$0 to +$120 |
| Token cost | $0 | $0 | $0 | $0 |
| Ops burden | Low (Git hosting managed) | High (patching, backup, failover across three services) | High, amortized against an already-operated box | — |
| Vendor risk | Low (Markdown is portable off GitHub) | Low | Low | — |

**Consequences**:
- **Positive**: every future projection stays disposable and regenerable from Git; no second
  authoritative store to reconcile.
- **Negative**: concurrent-edit UX requires the additional room-provider layer (ADR-2) rather than
  getting it for free from the canonical format.
- **Neutral**: this decision does not preclude a CRDT-canonical model later if scale or collaboration
  demand outgrows the review-gated model; that would require a superseding ADR.

