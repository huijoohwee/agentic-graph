---
title: "Reference implementation: Lark Read-only Knowledge Source-to-Canvas Companion"
id: "md:knowgrph-lark-app-mcp-prd-tad.companion"
doc_type: "Technical Companion"
version: "0.4.0"
date: "2026-08-06"
lang: "en-US"
owner: "docs.mcp.lark-app.companion"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-mcp/knowgrph-lark-app-mcp-prd-tad.companion.md"
guideline_version: "1.7.0"
reference_implementation_label: "reference implementation"
parent: "knowgrph-lark-app-mcp-prd-tad.md"
parent_version: "0.5.0"
---

# Reference implementation: Lark Read-only Knowledge Source-to-Canvas Companion

## Reference implementation ownership detail

This companion supplies file-level detail for
[the parent contract](knowgrph-lark-app-mcp-prd-tad.md). It does not redefine
product requirements, own an endpoint, or create a second Invocation Register.

| Scope | Local rung | Delivered rung | Basis |
|---|---|---|---|
| Companion detail | `spec-complete` | `undocumented` | Read-only source owners and deterministic VCC hosts are named; concrete Lark configuration and delivery Evidence References are absent. |

### Source-owner matrix

| Concern | Canonical source owner | Source-present behavior | Boundary |
|---|---|---|---|
| UI constants | `grph-shared/src/search/larkAppMcpSsot.ts` | Names Lark surfaces, Canvas handoff, local import, and blocked publish-preview concepts. | Phase/status-shaped strings remain display data and do not set readiness. |
| MainPanel rows/config | `canvas/src/features/panels/views/larkAppMcpApiDocs.ts` | Projects constants into the existing MCP view and builds config text. | No route availability test. |
| Row aggregation | `canvas/src/features/panels/views/settingsMcpDocEntries.ts` | Includes the Lark row family. | No browser MCP execution. |
| Handoff contract | `canvas/src/features/canvas/larkAppCanvasHandoff.ts` | Builds/parses legacy review/import payloads plus `kgKnowledgeSourceHandoff` and rejects forbidden material. | Legacy base64url provides no identity proof; the knowledge-source token is a scoped five-minute AEAD bearer capability. |
| Query bootstrap | `canvas/src/features/canvas/CanvasQueryBootstrapRuntime.tsx` | Consumes handoff state and installs local commands. | Browser lifecycle only. |
| Mutation types | `canvas/src/features/canvas/larkAppRemoteMutationBridge.ts` | Requires identity-shaped context, idempotency, conflict, audit, artifact, target, and dry-run fields. | Structural validation is not cryptographic verification. |
| Mutation runtime | `canvas/src/features/canvas/larkAppRemoteMutationBridgeRuntime.ts` | Delegates local import, creates blocked publish preview, rejects publish apply. | No remote transport or write service. |
| Import command | `canvas/src/features/source-files/feishuBaseSourceImportCommand.ts` | Delegates supplied snapshot to existing source-file ingest. | No Lark network fetch. |
| Source adapter | `canvas/src/features/source-files/feishuBaseSourceAdapter.ts` | Sanitizes and serializes a supplied Base snapshot. | Caller supplies the snapshot. |
| Public storage contract | `canvas/src/lib/storage/knowgrphStorageSyncContract.ts`, `knowgrphStorageRoutePaths.ts`, and `knowgrphStorageWorkerEnvContract.ts` | Defines the stable API/schema, handoff/read routes, complete envelope, and server env boundary. | Does not make Canvas a provider client. |
| Read-only server runtime | `cloudflare/workers/knowgrph-storage/knowledge-source/` | Resolves identity/allowlist, performs exact Lark reads, emits complete digested snapshots, and signs opaque handoffs. | No Lark write, source acceptance, or deploy authority. |
| Knowledge-source client | `canvas/src/features/source-files/knowledge-source/` | Bounded-streams/cancels the response, validates counts/schema, recomputes both canonical digests, sanitizes snapshots, and creates a new Source File. | No Lark credential, configured resource identifier/OpenAPI override, long-lived `VITE_*` bearer, overwrite behavior, or second persistence owner. |
| Handoff location owner | `canvas/src/features/canvas/larkAppCanvasHandoff.ts` and `canvas/src/lib/routing/queryParams.ts` | Keeps legacy handoffs in query state but builds/parses/removes `kgKnowledgeSourceHandoff` in the URL fragment. | The fragment payload is source alias plus scoped bearer capability, not provider auth or browser identity. |

### Canonical route rule

The source UI currently owns an endpoint-shaped configuration constant. That
source fact is not repeated here and does not establish delivery. Operators and
future source reconciliation must use
[the MCP installation contract](../knowgrph-mcp-install-contract.md) as the
sole route and Invocation Register owner.

The Lark `baseinfo` and `webpage` URLs in source are administration/launch
surfaces, not MCP endpoints.

`knowgrph-storage` is the provider-neutral runtime authority for read access,
normalization, provenance, and handoff. It is not the authored content
authority. Git-backed Markdown/frontmatter remains canonical; an imported Lark
snapshot is a review candidate until protected source acceptance.

### Handoff invariants

| Invariant | Enforced by |
|---|---|
| Supported surfaces are `webpage`, `baseinfo`, and `backend`. | Handoff and mutation normalizers |
| Supported handoff intents are `read-only`, `review`, and `import`. | Handoff normalizer |
| Import intent requires a structured snapshot. | Handoff builder |
| Secret-like keys/values are rejected recursively. | Handoff and mutation guards |
| Endpoint override keys are rejected recursively. | Handoff and mutation guards |
| Legacy query state or the knowledge-source fragment is removed after consumption. | Handoff location consumer |
| Review handoff defaults to Canvas/editor opening. | Review query builder |
| Authenticated session and active workspace membership precede handoff issuance. | Storage handoff authorizer |
| `kgKnowledgeSourceHandoff` carries only `sourceId` and a five-minute AEAD bearer capability. | Knowledge-source handoff builder/parser |
| The capability is fragment-only, absent from the initial HTTP request and `Referer`, and removed immediately after consumption. | Knowledge-source location builder/parser/consumer |
| Redemption rebinds the capability to user/session/workspace/source/identity/allowlist; no `VITE_*` provider or long-lived storage bearer is accepted. | Knowledge-source runtime |
| Canvas bounded-streams and accepts only a closed `knowgrph-knowledge-source-snapshot/v1` with `complete: true`, consistent counts, and recomputed digests. | Knowledge-source read client |
| Server-snapshot import is create-only; filename collision receives a suffix. | Knowledge-source import command |

A legacy base64url payload is encoding, not encryption, authentication, or
authorization. The knowledge-source token is separately AES-GCM sealed and acts
only as the scoped, expiring bearer capability described above.

### Server-only identity, resources, and exact reads

| Contract | Value |
|---|---|
| API | `knowgrph-knowledge-source/v1` |
| Handoff/read | `POST /api/storage/knowledge-source/handoff`; `POST /api/storage/knowledge-source/read` |
| Identity | `KNOWGRPH_STORAGE_LARK_IDENTITY_MODE`; tenant-app app ID/secret or externally managed user OAuth access token plus expiry remains server-only |
| Allowlist | `KNOWGRPH_STORAGE_LARK_SOURCE_ALLOWLIST_JSON` using `knowgrph-knowledge-source-allowlist/v1` |
| Opaque-token custody | Existing server-only `KNOWGRPH_STORAGE_SIGNING_SECRET`; five-minute AES-GCM AEAD bearer capability |
| Base resource | `{ sourceId, workspaceId, provider: "lark", kind: "base", appToken, tableId, viewId, fieldNames, minimumRecordCount }`; `fieldNames` has 1–100 unique approved names and minimum is 1–2000 |
| Wiki resource | `{ sourceId, workspaceId, provider: "lark", kind: "wiki", spaceId, nodeToken, documentId }` |
| Doc resource | `{ sourceId, workspaceId, provider: "lark", kind: "doc", documentId }` |

The handoff request is exactly
`{ apiVersion, workspaceId, sourceId }`; success is
`{ ok: true, apiVersion, workspaceId, sourceId, provider: "lark", kind, token,
expiresAtMs }`. The read request adds only `{ token }`. Public failures are
`{ ok: false, apiVersion, code, retryable, operationId }`; no raw provider body,
credential, configured identifier, or provider endpoint is returned.

The public error-code set is `auth_required`, `membership_forbidden`,
`identity_unresolved`, `identity_not_available`, `resources_unresolved`,
`source_not_allowlisted`, `source_config_drift`, `provider_auth_failed`,
`not_found`, `rate_limited`, `timeout`, `limit_exceeded`,
`upstream_unavailable`, `invalid_request`, and `invalid_response`.

The read set is closed: pre/post
`GET /open-apis/bitable/v1/apps/{app_token}/tables` revision reads;
`GET /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields` for the
pinned table/view; and
`POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/search` with body
`{ view_id, field_names, automatic_fields: false }` and query pagination;
`GET /open-apis/wiki/v2/spaces/get_node?token={node_token}` followed by exact
space/node/`docx` object/pinned document validation; and Doc raw content for the
pinned document. A tenant-app token exchange may use
`POST /open-apis/auth/v3/tenant_access_token/internal`; it is an auth step, not
a knowledge read. No request field may supply or override provider
credentials/resources.

Base pagination continues to completion with stable safe-integer provider
totals and exact final equality. Approved fields must be present and non-hidden,
record count must meet `minimumRecordCount`, and the exact table revision must
match before/after; these checks detect advanced-permission empty/hidden success.
A Wiki identity mismatch fails as `source_config_drift` before the document
read. Any page/content error, limit breach, truncation, malformed response, or
config drift invalidates the whole read.

Only complete normalized results use
`knowgrph-knowledge-source-snapshot/v1`. The envelope binds identity mode,
allowlist revision/digest, optional provider revision, fetch time, counts,
`contentDigest`, `envelopeDigest`, sanitized snapshot, and warnings. It contains
no provider credentials, configured Lark resource identifiers, or OpenAPI
endpoint overrides. For Base, non-approved fields, nested
ID/token/email/avatar/download/link/URL metadata, and provider-shaped identifier
strings are removed recursively within hard depth/entry/string bounds. Approved
primitive business content—including user-authored links—may remain and passes
through normal Markdown sanitization.

Tenant-app acquisition is bounded, request-local single-flight, cached, and
self-refreshing before expiry. `user-oauth` is an external broker/operator-managed access
token plus required absolute expiry, fails closed within five minutes of expiry,
and is terminal after auth invalidation. This lane does not select
`offline_access`, store or rotate a refresh token, call
`/open-apis/authen/v2/oauth/token`, or implement one-time refresh-token rotation
and reauthorization within the provider's 365-day limit; exact
scopes/permissions remain an operator decision.

Cloudflare currently caps each Worker variable or secret at 5 KB, while this
parser admits at most 100 sources. Env JSON is an MVP small-set allowlist. A
larger centralized catalog requires D1, KV, or generated configuration and a
separate versioned promotion digest.

The literal values `<tenant-app|user-oauth>` and
`<Base/table/view and Wiki/Doc identifiers>` are unresolved placeholders. They
map to typed `identity_unresolved`, `identity_not_available`, or
`resources_unresolved` blocks before any Lark content fetch; unknown aliases
and drift use `source_not_allowlisted` and `source_config_drift` with the same
zero-fetch guarantee.

### Local bridge result contract

| Action | Dry run | Current result | Remote side effect |
|---|---:|---|---|
| Resolve `sourceId` | N/A | Authenticated member receives a five-minute AEAD bearer capability or typed zero-fetch block. | None on block; handoff itself performs no Lark content read |
| Read knowledge source | N/A | Complete digested Base/document snapshot or typed failure. | Read-only allowlisted Lark calls only |
| Import knowledge source | N/A | Bounded/digest-validated/sanitized document delegated create-only to Source Files; collision gets a suffix. | None; app-local candidate source state only |
| `import-source-document` | `true` | Accepted result after structural validation. | None |
| `import-source-document` | `false` | Delegates to the existing local import command and returns its summarized result. | None; app-local source state only |
| `publish-approved-artifact` | `true` | Preview result with `publishReadiness: blocked`, explicit reason, host capability, checklist, and next step. | None |
| `publish-approved-artifact` | `false` | Error result; retry is not authorized. | None |

The mutation request's `actorId`, `sessionMode`, and `auditReason` fields are
preserved data. The current browser mutation runtime does not verify a
signature, fetch a host session, consult an authorization policy, or write an
audit log. This write-side gap is separate from authenticated
`knowgrph-storage` read-route admission and grants no publish authority.

### Security gap register

| Gap | Current disposition | Required evidence before closure |
|---|---|---|
| Mutation/publish host identity verification | Absent | Negative/positive signature or session verification test |
| Mutation/publish authorization policy | Absent | Actor/action/target policy test |
| Durable idempotency | Absent | Duplicate-request test against a durable owner |
| Conflict comparison | Typed choice only | Stale/matching revision integration tests |
| Audit persistence | Reason field only | Append-only audit-record test |
| Remote publish endpoint | Absent | Authenticated clean-host invocation plus rollback |
| Public route verification | Not attached | Evidence from the canonical install-contract route owner |
| Production handoff issuer/caller | No trusted host call site or clean-client evidence attached | Authenticated issuance and capability redemption from the intended Production caller |
| Live Lark read configuration | Placeholder identity/resources plus unresolved scopes/advanced-permission invariant | Secret-backed server identity, exact Base/Wiki/Doc IDs plus Base fields/minimum, operator-selected permissions, and live negative/positive VCC |

### Error and rollback contract

| Condition | Required response | Rollback |
|---|---|---|
| Invalid handoff | Typed parse/build error; no import | Discard consumed legacy query or capability fragment |
| Forbidden material | Reject before state mutation | Remove payload and review caller |
| Unresolved identity/resources or unknown/drifted alias | Typed zero-fetch block | Fix server env/allowlist; do not retry from browser with provider values |
| Base total/revision/approved-field/minimum invariant or provider read is partial/invalid | No complete envelope or import | Discard candidate; preserve prior source state |
| Invalid bounded stream/count/digest/schema/completeness | Reject before Source Files mutation | Discard handoff response |
| Import failure | Preserve explicit error and warning count | Existing source-file owner controls app-local recovery |
| Publish preview | Keep blocked and preview-only | No state to roll back |
| Publish apply | Return failure | No write occurred |
| Future remote partial failure | No success-shaped response | Service-specific compensating action required before launch |

### Economics and execution bounds

| Path | Model tokens | Loop bound | Incremental TCO |
|---|---:|---|---|
| Handoff parse | 0 | Single parse | USD 0 |
| Server Base/Wiki/Doc read | 0 | Bounded revision/field/search/content pages, stable totals, bytes, and timeout | Lark/Worker cost unmeasured; no delivery budget approved |
| Local snapshot transform/import | 0 | Finite record traversal bounded by supplied snapshot size; no retry loop | Existing app cost |
| Publish preview | 0 | Single deterministic build | USD 0 |
| Future remote mutation | Not authorized | Numeric retry/time bound required | Managed/self-managed/hybrid 12-month comparison required |

The parent owns the TTV and ROI targets. This companion adds no separate
economic claim.

### Delivery reach and lanes

| Capability | Browser | Mobile | Offline |
|---|---|---|---|
| Handoff parse | Source-present | Not separately evidenced | Works on supplied payload |
| Local import | Source-present | Not separately evidenced | Works on supplied snapshot |
| Read-only Lark ingestion | Contract source-present; live blocked by placeholders | Not separately evidenced | Requires server/Lark network |
| Remote publish | Absent | Absent | Absent |

| Boundary | State | Four required parts |
|---|---|---|
| Authoring → mirror | `closed` | Operator instruction, evidence, target surface, rollback |
| Mirror → delivery | `closed` | Operator instruction, evidence, target surface, rollback |
| Browser-local → remote mutation | `closed` | Verified auth, idempotency/conflict/audit evidence, target, rollback |
| Contract → live Lark read | `closed` | Trusted Production issuer/caller, concrete identity, exact allowlisted IDs/Base fields/minimum, selected scopes/permissions, and live negative/positive evidence |
| Authoring → Production deployment | `closed` | Exact revalidated candidate digest and explicit operator authorization |

### Planned evidence hosts

| VCC | Host | Expected result | Evidence Reference |
|---|---|---|---|
| `VCC-LARK-C-01` | `canvas/src/__tests__/larkAppCanvasHandoff.test.ts` | Forbidden payloads fail; supported review/import payloads normalize. | None recorded |
| `VCC-LARK-C-02` | `canvas/src/__tests__/larkAppRemoteMutationBridge.test.ts` | Request/result variants enforce typed invariants. | None recorded |
| `VCC-LARK-C-03` | `canvas/src/__tests__/larkAppRemoteMutationBridgeRuntime.test.ts` | Local import delegates; publish preview stays blocked; publish apply fails. | None recorded |
| `VCC-LARK-C-04` | Standalone `cloudflare/workers/knowgrph-storage/knowledge-source/*.test.ts` invocation | Membership-gated issuance, identity behavior, exact Base revision/total/field/minimum plus POST search, pinned Wiki/Doc reads, zero-fetch blocks, redaction, AEAD handoff, and complete digests hold. This file set is not yet wired into `storage:relay:test`. | None recorded |
| `VCC-LARK-C-05` | `canvas/src/__tests__/knowledgeSource*.test.ts` plus focused `knowledgeSource` registry case | The distinct registered critical path proves fragment-only capability placement/removal with no initial-request/referrer exposure, bounded streaming, closed counts/schema, client digest recomputation, sanitization, and create-only Source Files delegation without Lark credentials/configured identifiers. | None recorded |
| `VCC-LARK-C-06` | Future live Lark read test | Trusted Production issuer/caller plus concrete identity, exact resources/Base fields/minimum, and selected scopes produce one complete snapshot; negative auth/advanced-permission paths remain fail-closed. | None recorded |
| `VCC-LARK-C-07` | Future mutation host auth test | Forged/missing mutation identity is rejected cryptographically. | None recorded |
| `VCC-LARK-C-08` | Future remote write integration test | Duplicate/conflicting requests fail safely and audit evidence persists. | None recorded |
| `VCC-LARK-C-09` | Canonical route-owner check | Target resolves through one Invocation Register. | None recorded |

These are VCC definitions only. Deterministic results can prove the implemented
contract when they name the exact invocation, commit, lane, time, and distinct
evaluator. The Worker files are not yet included by `storage:relay:test`, and the
Canvas registry proof is separate. They cannot prove live readiness without a
trusted Production issuer/caller, concrete identity/resources/Base
fields/minimum, selected scopes/permissions, and live VCCs; they grant no
Production deploy authority. Production is forbidden until exact
candidate-digest authorization.
