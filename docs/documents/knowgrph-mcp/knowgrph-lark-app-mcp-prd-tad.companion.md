---
title: "Reference implementation: Lark App-to-Canvas Contract Companion"
id: "md:knowgrph-lark-app-mcp-prd-tad.companion"
doc_type: "Technical Companion"
version: "0.2.0"
date: "2026-07-30"
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
parent_version: "0.3.0"
---

# Reference implementation: Lark App-to-Canvas Contract Companion

## Reference implementation ownership detail

This companion supplies file-level detail for
[the parent contract](knowgrph-lark-app-mcp-prd-tad.md). It does not redefine
product requirements, own an endpoint, or create a second Invocation Register.

| Scope | Local rung | Delivered rung | Basis |
|---|---|---|---|
| Companion detail | `spec-complete` | `undocumented` | Source owners and planned VCC hosts are named; no satisfying delivery Evidence Reference is attached. |

### Source-owner matrix

| Concern | Canonical source owner | Source-present behavior | Boundary |
|---|---|---|---|
| UI constants | `grph-shared/src/search/larkAppMcpSsot.ts` | Names Lark surfaces, Canvas handoff, local import, and blocked publish-preview concepts. | Phase/status-shaped strings remain display data and do not set readiness. |
| MainPanel rows/config | `canvas/src/features/panels/views/larkAppMcpApiDocs.ts` | Projects constants into the existing MCP view and builds config text. | No route availability test. |
| Row aggregation | `canvas/src/features/panels/views/settingsMcpDocEntries.ts` | Includes the Lark row family. | No browser MCP execution. |
| Handoff contract | `canvas/src/features/canvas/larkAppCanvasHandoff.ts` | Builds/parses review/import payloads and rejects forbidden material. | No identity proof. |
| Query bootstrap | `canvas/src/features/canvas/CanvasQueryBootstrapRuntime.tsx` | Consumes handoff state and installs local commands. | Browser lifecycle only. |
| Mutation types | `canvas/src/features/canvas/larkAppRemoteMutationBridge.ts` | Requires identity-shaped context, idempotency, conflict, audit, artifact, target, and dry-run fields. | Structural validation is not cryptographic verification. |
| Mutation runtime | `canvas/src/features/canvas/larkAppRemoteMutationBridgeRuntime.ts` | Delegates local import, creates blocked publish preview, rejects publish apply. | No remote transport or write service. |
| Import command | `canvas/src/features/source-files/feishuBaseSourceImportCommand.ts` | Delegates supplied snapshot to existing source-file ingest. | No Lark network fetch. |
| Source adapter | `canvas/src/features/source-files/feishuBaseSourceAdapter.ts` | Sanitizes and serializes a supplied Base snapshot. | Caller supplies the snapshot. |

### Canonical route rule

The source UI currently owns an endpoint-shaped configuration constant. That
source fact is not repeated here and does not establish delivery. Operators and
future source reconciliation must use
[the MCP installation contract](../knowgrph-mcp-install-contract.md) as the
sole route and Invocation Register owner.

The Lark `baseinfo` and `webpage` URLs in source are administration/launch
surfaces, not MCP endpoints.

### Handoff invariants

| Invariant | Enforced by |
|---|---|
| Supported surfaces are `webpage`, `baseinfo`, and `backend`. | Handoff and mutation normalizers |
| Supported handoff intents are `read-only`, `review`, and `import`. | Handoff normalizer |
| Import intent requires a structured snapshot. | Handoff builder |
| Secret-like keys/values are rejected recursively. | Handoff and mutation guards |
| Endpoint override keys are rejected recursively. | Handoff and mutation guards |
| Query state is removed after consumption. | Handoff query consumer |
| Review handoff defaults to Canvas/editor opening. | Review query builder |

A base64url payload is encoding, not encryption, authentication, or
authorization.

### Local bridge result contract

| Action | Dry run | Current result | Remote side effect |
|---|---:|---|---|
| `import-source-document` | `true` | Accepted result after structural validation. | None |
| `import-source-document` | `false` | Delegates to the existing local import command and returns its summarized result. | None; app-local source state only |
| `publish-approved-artifact` | `true` | Preview result with `publishReadiness: blocked`, explicit reason, host capability, checklist, and next step. | None |
| `publish-approved-artifact` | `false` | Error result; retry is not authorized. | None |

The request's `actorId`, `sessionMode`, and `auditReason` fields are preserved
data. The current browser runtime does not verify a signature, fetch a host
session, consult an authorization policy, or write an audit log.

### Security gap register

| Gap | Current disposition | Required evidence before closure |
|---|---|---|
| Host identity verification | Absent | Negative/positive signature or session verification test |
| Authorization policy | Absent | Actor/action/target policy test |
| Durable idempotency | Absent | Duplicate-request test against a durable owner |
| Conflict comparison | Typed choice only | Stale/matching revision integration tests |
| Audit persistence | Reason field only | Append-only audit-record test |
| Remote publish endpoint | Absent | Authenticated clean-host invocation plus rollback |
| Public route verification | Not attached | Evidence from the canonical install-contract route owner |

### Error and rollback contract

| Condition | Required response | Rollback |
|---|---|---|
| Invalid handoff | Typed parse/build error; no import | Discard query token |
| Forbidden material | Reject before state mutation | Remove payload and review caller |
| Import failure | Preserve explicit error and warning count | Existing source-file owner controls app-local recovery |
| Publish preview | Keep blocked and preview-only | No state to roll back |
| Publish apply | Return failure | No write occurred |
| Future remote partial failure | No success-shaped response | Service-specific compensating action required before launch |

### Economics and execution bounds

| Path | Model tokens | Loop bound | Incremental TCO |
|---|---:|---|---|
| Handoff parse | 0 | Single parse | USD 0 |
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
| Remote publish | Absent | Absent | Absent |

| Boundary | State | Four required parts |
|---|---|---|
| Authoring → mirror | `closed` | Operator instruction, evidence, target surface, rollback |
| Mirror → delivery | `closed` | Operator instruction, evidence, target surface, rollback |
| Browser-local → remote mutation | `closed` | Verified auth, idempotency/conflict/audit evidence, target, rollback |

### Planned evidence hosts

| VCC | Host | Expected result | Evidence Reference |
|---|---|---|---|
| `VCC-LARK-C-01` | `canvas/src/__tests__/larkAppCanvasHandoff.test.ts` | Forbidden payloads fail; supported review/import payloads normalize. | None recorded |
| `VCC-LARK-C-02` | `canvas/src/__tests__/larkAppRemoteMutationBridge.test.ts` | Request/result variants enforce typed invariants. | None recorded |
| `VCC-LARK-C-03` | `canvas/src/__tests__/larkAppRemoteMutationBridgeRuntime.test.ts` | Local import delegates; publish preview stays blocked; publish apply fails. | None recorded |
| `VCC-LARK-C-04` | Future host auth test | Forged/missing identity is rejected cryptographically. | None recorded |
| `VCC-LARK-C-05` | Future remote integration test | Duplicate/conflicting requests fail safely and audit evidence persists. | None recorded |
| `VCC-LARK-C-06` | Canonical route-owner check | Target resolves through one Invocation Register. | None recorded |

These are VCC definitions only. A result must name the exact invocation,
commit, lane, time, and distinct evaluator before it can advance readiness.
