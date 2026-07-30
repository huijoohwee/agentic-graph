---
title: "Reference implementation: Feishu Base Contract Companion"
id: "md:knowgrph-feishu-base-mcp-prd-tad.companion"
doc_type: "Technical Companion"
version: "0.2.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.mcp.feishu-base.companion"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-mcp/knowgrph-feishu-base-mcp-prd-tad.companion.md"
guideline_version: "1.7.0"
reference_implementation_label: "reference implementation"
parent: "knowgrph-feishu-base-mcp-prd-tad.md"
parent_version: "0.3.0"
---

# Reference implementation: Feishu Base Contract Companion

## Reference implementation ownership detail

This companion supplies file-level detail for
[the parent contract](knowgrph-feishu-base-mcp-prd-tad.md). It is not a second
product contract and does not own a route or Invocation Register.

| Scope | Local rung | Delivered rung | Basis |
|---|---|---|---|
| Companion detail | `spec-complete` | `undocumented` | Source seams and VCC hosts are locatable; no satisfying remote/delivery Evidence Reference is attached. |

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

The configuration SSOT's phase labels describe only its own MainPanel concern.
They must not be used to deny or promote the separately source-present
supplied-snapshot adapter. Neither concern has delivery evidence.

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

The adapter does not call Feishu, dereference a Base token, validate provider
permissions, paginate records, or refresh a snapshot.

### Persistence and mutation contract

| Operation | Current owner | Side effect | Remote effect |
|---|---|---|---|
| Adapt snapshot | Source adapter | None | None |
| Import snapshot | Existing source-file ingest | Creates/updates app-owned source-file state | None |
| Render workspace/canvas | Existing app owners | App-local projection after validation | None |
| Refresh from Base | Absent | None | None |
| Publish/write back to Base | Absent | None | None |

The browser command's global name and DOM events are local integration seams.
They are not network endpoints.

### Security and privacy invariants

| Invariant | Check surface |
|---|---|
| MainPanel stores only non-secret labels. | Registry/default test |
| Full source identifiers are not emitted in generated metadata. | Adapter test |
| Source URL path/query is not copied into frontmatter metadata. | Adapter output |
| Imported content passes the shared Markdown sanitizer. | Adapter implementation/test |
| Credential names or host guidance cannot be treated as authorization. | Source review |
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
| Remote operation requested | Capability unavailable |

### Economics and bounds

| Path | Model tokens | Bound | Incremental TCO |
|---|---:|---|---|
| MainPanel projection | 0 | Eleven source rows | USD 0 |
| Snapshot adaptation | 0 | One finite traversal of supplied fields/records | Existing app cost |
| Import command | 0 | One delegated ingest request | Existing app cost |
| Remote read/write | Not authorized | No retry loop | No approved budget |

Before a remote owner is added, the parent requires separate managed,
self-managed, and hybrid 12-month TCO, a numeric request/retry bound, and a
higher ROI than the current zero-infrastructure path.

### Delivery reach and boundaries

| Capability | Browser | Mobile | Offline |
|---|---|---|---|
| Configuration rows | Source-present | Not separately evidenced | Readable |
| Supplied-snapshot adapter/import | Source-present | Not separately evidenced | Usable with supplied data |
| Remote Base read/write | Absent | Absent | Absent |

| Boundary | State | Required closure evidence |
|---|---|---|
| Authoring → mirror | `closed` | Operator instruction, evidence, target, rollback |
| Mirror → delivery | `closed` | Operator instruction, evidence, target, rollback |
| Supplied snapshot → remote Base | `closed` | Auth, pagination, idempotency/conflict/audit, cost, rollback |

Canonical Knowgrph endpoint selection remains in
[the MCP installation contract](../knowgrph-mcp-install-contract.md).

### Planned evidence hosts

| VCC | Host | Expected result | Evidence Reference |
|---|---|---|---|
| `VCC-FB-C-01` | `canvas/src/__tests__/mainPanelMcpFeishuBase.test.tsx` | Non-secret configuration rows retain exact defaults. | None recorded |
| `VCC-FB-C-02` | `canvas/src/__tests__/feishuBaseSourceAdapter.test.ts` | Required fields, redaction, sanitization, warnings, and counts hold. | None recorded |
| `VCC-FB-C-03` | `canvas/src/__tests__/feishuBaseSourceImport.test.ts` | Generated document enters the existing source-file path. | None recorded |
| `VCC-FB-C-04` | `canvas/src/__tests__/feishuBaseSourceImportCommand.test.ts` | Window/event command delegates and summarizes explicit results. | None recorded |
| `VCC-FB-C-05` | Future provider integration test | Authenticated paginated read returns typed snapshots. | None recorded |
| `VCC-FB-C-06` | Future write-back integration test | Idempotency, conflict, audit, rollback, and negative auth paths hold. | None recorded |

These VCCs are definitions only. Source-test success can support local evidence
when recorded, but cannot by itself prove a Feishu host or delivered route.
