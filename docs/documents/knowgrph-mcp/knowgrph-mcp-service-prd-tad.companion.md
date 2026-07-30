---
title: "MCP Service Contract Companion"
id: "md:knowgrph-mcp-service-prd-tad-companion"
doc_type: "Technical Companion"
version: "0.5.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.mcp.service.companion"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-mcp/knowgrph-mcp-service-prd-tad.companion.md"
guideline_version: "1.7.0"
reference_implementation_label: "reference implementation"
parent: "knowgrph-mcp-service-prd-tad.md"
parent_version: "0.5.0"
---

# MCP Service Contract Companion

## Reference implementation: capability, security, and ownership detail

This companion supplies file-level detail for
[the service contract](knowgrph-mcp-service-prd-tad.md). It is not a second
product contract or an Invocation Register.

### Readiness declaration

| Scope | Local rung | Delivered rung | Basis |
|---|---|---|---|
| Companion detail | `spec-complete` | `undocumented` | Verification conditions exist; no recorded Evidence Reference is attached. |

### Capability catalog

#### Pages HTTP source contract — 7 read-only tools

| Tool | Purpose |
|---|---|
| `search` | Find agent-ready source records. |
| `fetch` | Fetch a known agent-ready record. |
| `list_source_files` | List indexed source files. |
| `read_source_file` | Read one allowed source file. |
| `read_shared_document` | Read the shared document projection. |
| `inspect_shared_document_structure` | Inspect its structured outline. |
| `inspect_agent_surface` | Inspect the declared agent-ready surface. |

The canonical definition is
`canvas/src/features/agent-ready/knowgrphAgentReadyToolContract.mjs`; the Pages
adapter consumes the read-only subset through
`cloudflare/pages/knowgrph-agent-ready.mjs`.

#### App WebMCP source contract — 42 tools

The browser registration includes exactly 42 source tools:

- 30 tools annotated read-only.
- 12 guarded controls.

The count and split are the contract. Browser-local controls are not part of the
seven-tool Pages surface. Registration is owned by
`canvas/src/features/agent-ready/webMcpRuntime.ts` and the shared tool contract.
A guarded tool remains unavailable until its runtime owner and approval
conditions are satisfied.

#### Local stdio source contract — broad and configuration-gated

`mcp/server.js` and `mcp/local-tool-contract.js` compose a broader local catalog.
Individual tools depend on local owners, files, processes, configuration, or
credentials. Discovery must not be interpreted as executability. Missing
requirements produce an unavailable or denied result instead of silently
falling back to a different transport.

#### Remote Worker source registry — 10 tools

`cloudflare/workers/knowgrph-mcp/tool-registry.mjs` contains exactly:

1. `knowgrph.superagent.run`
2. `knowgrph.video_remix.run`
3. `knowgrph.video_remix.research`
4. `knowgrph.video_remix.storyboard`
5. `knowgrph.video_remix.render`
6. `knowgrph.video_remix.publish`
7. `knowgrph.video_remix.checkout`
8. `knowgrph.run_manifest.note.update`
9. `knowgrph.os.status`
10. `knowgrph.agentic_canvas_os.docs.invoke`

This is a source registry inventory, not an assertion of remote availability.
The Worker is a separate delivery unit from Pages.

### Security and session contract

For the remote Worker MCP transport:

1. The client sends bearer `Authorization` on initialization.
2. The client accepts the transport response type expected by MCP.
3. The client captures the `mcp-session-id` returned by initialization.
4. Every later MCP request sends both bearer authorization and that same session
   id.
5. Missing or invalid authorization, unknown session state, invalid arguments,
   or denied approval fails closed with a typed error.

Secrets are environment-owned and must not appear in documentation, source
fixtures, logs, or client screenshots. Session identity is correlation state,
not a substitute for authorization.

The authoritative endpoint, trust, and token-cost rows are in
[the install contract](../knowgrph-mcp-install-contract.md).

### Source-to-canvas contract

| Step | Owner | Input | Output | Side effect |
|---|---|---|---|---|
| Discover | Agent-ready source contract | Search/fetch arguments | Typed metadata or document record | None |
| Read | Source-file/shared-document readers | Allowed identifier | Source text or structured document | None |
| Inspect | Agent-surface inspectors | Current source projection | Typed readiness/context description | None |
| Present | App state and canvas owners | Validated structured content | Editor/canvas projection | App-local state only |
| Control | Guarded runtime owner | Approved typed arguments | Owner-defined result | Explicit and owner-bounded |

Read paths consume zero model tokens. A control path may invoke a harness, but
the harness owns its token budget, loop bound, cost log, and circuit breaker.

### Source ownership and invariants

| Concern | Canonical source owner | Invariant |
|---|---|---|
| Shared tool definitions | `canvas/src/features/agent-ready/knowgrphAgentReadyToolContract.mjs` | Pages remains the seven-tool read subset; browser totals remain 42. |
| Browser registration | `canvas/src/features/agent-ready/webMcpRuntime.ts` | 30 read-only annotations and 12 guarded controls. |
| Pages adapter | `cloudflare/pages/knowgrph-agent-ready.mjs` | No guarded controls in Pages tool discovery. |
| Local adapter | `mcp/server.js` | Configuration gates are explicit and fail closed. |
| Local tool catalog | `mcp/local-tool-contract.js` | Source discovery does not promise executability. |
| Worker transport | `cloudflare/workers/knowgrph-mcp/index.ts` | Bearer authorization precedes MCP dispatch; session semantics are preserved. |
| Worker registry | `cloudflare/workers/knowgrph-mcp/tool-registry.mjs` | Exactly 10 unique source tool names. |

### Error contract

| Condition | Required outcome |
|---|---|
| Unknown tool | Typed method/tool error; no fallback execution. |
| Invalid arguments | Typed validation error; no side effect. |
| Missing local owner/configuration | Typed unavailable result; no cross-surface projection. |
| Missing/invalid Worker bearer authorization | Unauthorized result; no tool dispatch. |
| Missing/stale Worker session id after initialization | Session error; client reinitializes rather than guessing. |
| Guarded control lacks approval | Denied result; no side effect or model spend. |
| Partial source read | Explicit partial/error metadata; never a success-shaped empty result. |

### Planned VCC hosts

| VCC | Stated check | End state | Constraint | Evidence Reference |
|---|---|---|---|---|
| `VCC-MCP-C-01` | Focused Pages parity test | Seven exact read-only names are surfaced. | No browser/local/Worker controls. | None recorded |
| `VCC-MCP-C-02` | Focused WebMCP runtime test | 42 exact names classify as 30 read-only and 12 guarded. | No duplicate name. | None recorded |
| `VCC-MCP-C-03` | Worker registry test | Ten exact names above are surfaced. | No duplicate name. | None recorded |
| `VCC-MCP-C-04` | Focused Worker client/session test | Bearer auth is required and the initialized session id is reused. | No unauthenticated dispatch. | None recorded |
| `VCC-MCP-C-05` | Local tool contract test with missing configuration | Configuration-gated tools fail closed. | No alternate transport fallback. | None recorded |

These are verification conditions only. Without an exact invocation, recorded
result, and named lane, they do not advance readiness.

### Boundary statement

This companion authorizes source-document edits only. It does not authorize a
mirror, Pages publication, Worker publication, secret mutation, or production
verification. Rollback is a source revert followed by frontmatter, link, and
contract validation.
