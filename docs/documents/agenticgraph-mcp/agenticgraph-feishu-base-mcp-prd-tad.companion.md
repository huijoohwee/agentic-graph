---
title: "Reference implementation: Feishu Base Contract Companion"
id: "md:agenticgraph-feishu-base-mcp-prd-tad.companion"
doc_type: "Technical Companion"
version: "0.4.0"
date: "2026-08-06"
lang: "en-US"
owner: "docs.mcp.feishu-base.companion"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/agenticgraph-mcp/agenticgraph-feishu-base-mcp-prd-tad.companion.md"
guideline_version: "1.7.0"
reference_implementation_label: "reference implementation"
parent: "agenticgraph-feishu-base-mcp-prd-tad.md"
parent_version: "0.5.0"
---

# Reference implementation: Feishu Base Contract Companion

## Reference implementation ownership detail

This companion supplies file-level detail for
[the parent contract](agenticgraph-feishu-base-mcp-prd-tad.md). It is not a second
product contract and does not own a route or Invocation Register.

| Scope | Local rung | Delivered rung | Basis |
|---|---|---|---|
| Companion detail | `spec-complete` | `undocumented` | Read-only source seams and deterministic VCC hosts are locatable; concrete Lark configuration and delivery Evidence References are absent. |

### Concern separation

| Concern | Canonical owner | Current source behavior | Not provided |
|---|---|---|---|
| Configuration labels | `grph-shared/src/search/feishuBaseMcpSsot.ts` | Host-managed/auth-boundary/phase/operator strings. | Credential resolution or Base call |
| Browser settings | `canvas/src/features/settings/registry-feishu-base-mcp.ts` | Seven non-secret local string settings. | Secret store |
| MainPanel projection | `canvas/src/features/panels/views/feishuBaseMcpApiDocs.ts` | Eleven virtual rows. | MCP client |
| Snapshot contract | `canvas/src/features/source-files/feishuBaseSourceImportContract.ts` | Typed caller-supplied request/result. | Snapshot acquisition |
| Snapshot adapter | `canvas/src/features/source-files/feishuBaseSourceAdapter.ts` | Validation, redaction, sanitization, Markdown serialization. | Network read |
| Import integration | `canvas/src/features/source-files/sourceFilesIngestIntegration.ts` | Existing source-file persistence path. | Base write-back |
| Browser command | `canvas/src/features/source-files/feishuBaseSourceImportCommand.ts` | Window command and event bridge for `importSnapshot`. | Remote transport |
| Server public contract | `canvas/src/lib/storage/agenticgraphStorageSyncContract.ts` and `agenticgraphStorageRoutePaths.ts` | `agenticgraph-knowledge-source/v1`, complete snapshot types, and the handoff/read paths. | Lark-specific source authority |
| Server runtime | `cloudflare/workers/agenticgraph-storage/knowledge-source/` | Server identity, versioned allowlist, Lark read provider, provenance/digests, opaque handoff, and typed block/failure results. | Write-back or source acceptance |
| Browser read/import | `canvas/src/features/source-files/knowledge-source/` | Bounded-streams the response, validates counts/schema, recomputes both digests, builds sanitized Markdown, and creates a new Source File. | Lark credentials, configured provider IDs/OpenAPI overrides, long-lived `VITE_*` bearers, overwrite behavior, or a second persistence owner |

The configuration SSOT's phase labels describe only its own MainPanel concern.
They must not be used to deny or promote the separately source-present
supplied-snapshot adapter or server read runtime. The contract can be proven
with deterministic fixtures; no concern has live or delivery evidence.

### Snapshot input/output contract

Required input:

- `selection.baseToken`
- `selection.tableId`

Optional input:

- `viewId`, Base/table/view display names, and source URL
- field schema records
- Base record objects

The adapter:

1. validates required selection values;
2. filters null field/record entries;
3. redacts long Base, table, view, and record identifiers;
4. stores only the source URL origin when valid;
5. serializes field schema and record summaries;
6. sanitizes the complete Markdown result;
7. returns warnings for empty schema or record sets.

This legacy adapter does not call Feishu, dereference a Base token, validate
provider permissions, paginate records, or refresh a snapshot. Those read-only
responsibilities belong only to the server runtime below.

### Server-only read and envelope contract

| Surface | Stable contract |
|---|---|
| API | `agenticgraph-knowledge-source/v1` |
| Allowlist | `agenticgraph-knowledge-source-allowlist/v1` with `{ schema, revision, sources[] }` |
| Base entry | `{ sourceId, workspaceId, provider: "lark", kind: "base", appToken, tableId, viewId, fieldNames, minimumRecordCount }`; `fieldNames` has 1–100 unique approved names, minimum is 1–2000, display labels optional |
| Handoff | `POST /api/storage/knowledge-source/handoff`; authenticated session plus active workspace membership precede five-minute AEAD bearer-capability issuance |
| Read | `POST /api/storage/knowledge-source/read`; input is workspace/source plus the scoped bearer capability, never Lark identifiers |
| Snapshot | `agenticgraph-knowledge-source-snapshot/v1`, `complete: true`, with allowlist provenance, page/field/record/document/byte counts, content/envelope digests, sanitized snapshot, and warnings |

Identity is selected only by `AGENTICGRAPH_STORAGE_LARK_IDENTITY_MODE`. A
`tenant-app` configuration uses server-held
`AGENTICGRAPH_STORAGE_LARK_APP_ID`/`AGENTICGRAPH_STORAGE_LARK_APP_SECRET`; a
`user-oauth` configuration uses an external broker/operator-managed server-held
`AGENTICGRAPH_STORAGE_LARK_USER_ACCESS_TOKEN` plus required absolute expiry and
fails terminally on an auth rejection. It does not select `offline_access`,
store/rotate refresh tokens, call `/open-apis/authen/v2/oauth/token`, or own
one-time refresh-token rotation and reauthorization within the provider's
365-day limit; exact scopes/permissions remain an operator decision. Resources
are resolved only from
`AGENTICGRAPH_STORAGE_LARK_SOURCE_ALLOWLIST_JSON`. The browser cannot select an
identity mode or replace a Base/table/view binding. The server-only
`AGENTICGRAPH_STORAGE_SIGNING_SECRET` seals the five-minute AES-GCM AEAD handoff.
Tenant-app tokens are cached single-flight and self-refresh before expiry. No
Lark or long-lived storage bearer is sourced from a `VITE_*` variable.

The Lark provider may perform only:

1. tenant-app credential exchange at
   `POST /open-apis/auth/v3/tenant_access_token/internal` when that identity is
   configured;
2. pre/post revision reads at
   `GET /open-apis/bitable/v1/apps/{app_token}/tables`;
3. fields reads at
   `GET /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields` with
   the allowlisted `view_id`; and
4. record search at
   `POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/search`
   with `{ view_id, field_names, automatic_fields: false }` and bounded query
   pagination.

Every requested page must finish before success. Each paginated family must keep
a stable provider `total` and finish at exactly that count; pre/post table
revisions must match; every approved field must be present and non-hidden; and
records must meet `minimumRecordCount`. These checks defend against advanced
permissions returning successful-looking empty/hidden results. Canonical
normalized content receives a SHA-256 `contentDigest`; the provenance-bearing
envelope receives a SHA-256 `envelopeDigest`. A partial, over-limit, malformed,
drifted, or failed page does not receive a success envelope.

The Worker environment currently caps each variable or secret at 5 KB, while
the parser admits at most 100 sources. This env-JSON allowlist is therefore an
MVP small-set source. A larger centralized catalog requires D1, KV, or generated
configuration plus a separately authorized promotion digest.

The literal user-supplied values `<tenant-app|user-oauth>` and
`<Base/table/view and Wiki/Doc identifiers>` are placeholders. They cannot
select identity/resources and must return a typed zero-fetch block.

### Persistence and mutation contract

| Operation | Current owner | Side effect | Remote effect |
|---|---|---|---|
| Adapt snapshot | Source adapter | None | None |
| Import snapshot | Existing source-file ingest | Legacy path creates/updates app-owned source-file state | None |
| Resolve source handoff | `agenticgraph-storage` knowledge-source runtime | Authenticated member receives a five-minute AEAD bearer capability | No Lark content read when configuration blocks |
| Read allowlisted Base | `agenticgraph-storage` Lark provider | Creates one complete in-memory snapshot envelope | Read-only Lark API calls |
| Import server snapshot | Knowledge-source adapter + existing Source Files ingest | Create-only app candidate; filename collision receives a suffix | None |
| Render workspace/canvas | Existing app owners | App-local projection after validation | None |
| Refresh from Base | Same read-only storage runtime | New complete candidate snapshot | Read only; no last-write-wins acceptance |
| Publish/write back to Base | Absent | None | None |

The browser commands and DOM events are local integration seams. They are not
network endpoints. `agenticgraph-storage` is the provider-neutral read authority;
Git-backed Markdown/frontmatter remains the authored knowledge authority.

### Security and privacy invariants

| Invariant | Check surface |
|---|---|
| MainPanel stores only non-secret labels. | Registry/default test |
| Full source identifiers are not emitted in generated metadata. | Adapter test |
| Source URL path/query is not copied into frontmatter metadata. | Adapter output |
| Imported content passes the shared Markdown sanitizer. | Adapter implementation/test |
| Credential names or host guidance cannot be treated as authorization. | Source review |
| Identity credentials and configured resource identifiers stay server-only. | Runtime response fixtures plus secret/identifier scans |
| Nested provider ID/token/email/avatar/download/link/URL metadata and provider-shaped identifier strings are removed recursively; only allowlisted field names are projected. | Provider sanitization fixtures |
| Authorized primitive business values, including user-authored links, may remain and are passed through the Markdown sanitizer. | Provider and document-adapter fixtures |
| Caller source aliases cannot override the allowlist binding or revision. | Registry/runtime negative tests |
| A zero-fetch block precedes token exchange or content read for unresolved configuration. | Provider fetch counters in focused tests |
| Canvas accepts only `complete: true` snapshot envelopes. | Knowledge-source read client test |
| Content/envelope digests bind normalized content and provenance separately. | Provenance fixtures |
| Canvas bounded-streams/cancels over-limit responses and recomputes both canonical SHA-256 digests. | Knowledge-source read client test plus registered critical-path case |
| Server snapshot import is create-only; a name collision cannot overwrite an existing Source File. | Knowledge-source import test |
| `kgKnowledgeSourceHandoff` uses a URL fragment, never the query; it is absent from the initial HTTP request and `Referer`, then removed immediately after consumption. | Handoff location/parser and registered critical-path case |
| No write occurs to Base from this path. | Call graph and absent owner |

The supplied input still contains raw identifiers while the adapter runs.
Callers must keep that input within the trusted browser/host boundary and avoid
logging it.

### Error contract

| Condition | Result |
|---|---|
| Missing Base token | `{ ok: false, error: "Missing Feishu Base token." }` |
| Missing table id | `{ ok: false, error: "Missing Feishu Base table id." }` |
| Empty fields | Successful document plus warning |
| Empty records | Successful document plus warning |
| Import integration failure | Explicit import error; no success-shaped result |
| Unsupported event action | Command error |
| Identity placeholder/missing credential | `identity_unresolved` or `identity_not_available`; zero provider fetches |
| Resource placeholder/empty allowlist | `resources_unresolved`; zero provider fetches |
| Unknown source alias | `source_not_allowlisted`; zero provider fetches |
| Token/allowlist binding changed | `source_config_drift`; no content snapshot |
| Approved field is missing/hidden, stable total changes, final count differs, minimum count fails, or pre/post table revision changes | Drift/invalid response; no complete envelope |
| Provider page/auth/rate/timeout/limit failure | Typed error; no complete envelope |
| Invalid digest/schema/incomplete Canvas response | Reject before Source Files ingest |
| Remote write requested | Capability unavailable |

### Economics and bounds

| Path | Model tokens | Bound | Incremental TCO |
|---|---:|---|---|
| MainPanel projection | 0 | Eleven source rows | USD 0 |
| Snapshot adaptation | 0 | One finite traversal of supplied fields/records | Existing app cost |
| Import command | 0 | One delegated ingest request | Existing app cost |
| Server Base read | 0 | Bounded pre/post revision, fields/search pages, stable totals, approved fields, minimum count, bytes, and timeout | Lark/Worker cost unmeasured; no delivery budget approved |
| Remote write | Not authorized | No retry loop | No approved budget |

Before a remote owner is added, the parent requires separate managed,
self-managed, and hybrid 12-month TCO, a numeric request/retry bound, and a
higher ROI than the current zero-infrastructure path.

### Delivery reach and boundaries

| Capability | Browser | Mobile | Offline |
|---|---|---|---|
| Configuration rows | Source-present | Not separately evidenced | Readable |
| Supplied-snapshot adapter/import | Source-present | Not separately evidenced | Usable with supplied data |
| Read-only Base ingestion | Contract source-present; live blocked by placeholders | Not separately evidenced | Requires server/Lark network |
| Remote Base write | Absent | Absent | Absent |

| Boundary | State | Required closure evidence |
|---|---|---|
| Authoring → mirror | `closed` | Operator instruction, evidence, target, rollback |
| Mirror → delivery | `closed` | Operator instruction, evidence, target, rollback |
| Contract → live Base read | `closed` | Trusted Production handoff issuer/caller, concrete server identity, exact allowlisted resource IDs/approved fields/minimum count, operator-selected scopes/permissions, live negative/positive evidence |
| Authoring → Production deployment | `closed` | Exact revalidated candidate digest and explicit operator authorization |
| Candidate → remote Base write | `closed` | Separate auth, idempotency/conflict/audit, cost, and rollback contract |

Canonical AgenticGraph endpoint selection remains in
[the MCP installation contract](../agenticgraph-mcp-install-contract.md).

### Planned evidence hosts

| VCC | Host | Expected result | Evidence Reference |
|---|---|---|---|
| `VCC-FB-C-01` | `canvas/src/__tests__/mainPanelMcpFeishuBase.test.tsx` | Non-secret configuration rows retain exact defaults. | None recorded |
| `VCC-FB-C-02` | `canvas/src/__tests__/feishuBaseSourceAdapter.test.ts` | Required fields, redaction, sanitization, warnings, and counts hold. | None recorded |
| `VCC-FB-C-03` | `canvas/src/__tests__/feishuBaseSourceImport.test.ts` | Generated document enters the existing source-file path. | None recorded |
| `VCC-FB-C-04` | `canvas/src/__tests__/feishuBaseSourceImportCommand.test.ts` | Window/event command delegates and summarizes explicit results. | None recorded |
| `VCC-FB-C-05` | Standalone `cloudflare/workers/agenticgraph-storage/knowledge-source/*.test.ts` invocation | Membership-gated issuance, Base revision/total/approved-field/minimum invariants, exact POST search, zero-fetch blockers, redaction, complete digests, and AEAD handoff hold under fixtures. This file set is not yet wired into `storage:relay:test`. | None recorded |
| `VCC-FB-C-06` | `canvas/src/__tests__/knowledgeSource*.test.ts` plus the focused `knowledgeSource` registry case | The distinct registered critical path proves fragment-only capability placement/removal, bounded streaming, closed-envelope/count validation, client digest recomputation, and create-only Source Files delegation without Lark credentials/configured IDs. | None recorded |
| `VCC-FB-C-07` | Future live provider VCC with trusted Production issuer/caller, concrete secret-backed identity, exact resources/fields/minimum, and selected scopes | Negative auth/advanced-permission cases plus one complete Base snapshot are observed without exposing credentials or claiming delivery. | None recorded |
| `VCC-FB-C-08` | Future write-back integration test | Idempotency, conflict, audit, rollback, and negative auth paths hold. | None recorded |

These VCCs are definitions only. Deterministic source-test success can prove the
read contract when recorded, but cannot prove live Lark readiness or a delivered
route. The Worker files are not yet included by `storage:relay:test`, and the
Canvas registry proof remains distinct. Live readiness stays blocked until a
trusted Production issuer/caller, concrete identity, exact resources/approved
fields/minimum, selected scopes/permissions, and live negative/positive VCCs
exist. Production deployment is forbidden until exact candidate-digest
authorization.
