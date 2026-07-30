---
title: "MCP Surface Overview"
id: "md:knowgrph-mcp"
doc_type: "Reference Implementation Overview"
version: "1.0.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.mcp.index"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-mcp/knowgrph-mcp.md"
guideline_version: "1.7.0"
reference_implementation_label: "reference implementation"
service_contract: "knowgrph-mcp-service-prd-tad.md"
install_contract: "../knowgrph-mcp-install-contract.md"
---

# MCP Surface Overview

## Reference implementation: current repository MCP surfaces

This page is the concise map of the MCP contracts present in the repository. It
does not prove that a source-owned surface is reachable in any delivery
environment.

### Readiness declaration

| Scope | Local rung | Delivered rung | Reason |
|---|---|---|---|
| This overview | `spec-complete` | `undocumented` | The source contract and verification conditions are stated; no delivery Evidence Reference is recorded. |

`spec-complete` is not a delivery claim. The only permitted progression is
`undocumented` → `spec-complete` → `dev-proven` → `runtime-ready` →
`production-verified`.

### Surface inventory

| Surface | Source contract | Capability truth | Local rung | Delivered rung |
|---|---|---|---|---|
| Local stdio MCP | `mcp/server.js`, `mcp/local-tool-contract.js` | Broad local surface; availability is configuration-gated and operations fail closed when their owners or credentials are absent. | `spec-complete` | `undocumented` |
| Pages HTTP MCP | `cloudflare/pages/knowgrph-agent-ready.mjs` | Exactly 7 read-only source tools. | `spec-complete` | `undocumented` |
| App WebMCP | `canvas/src/features/agent-ready/webMcpRuntime.ts` and the shared contract | Exactly 42 source tools: 30 read-only and 12 guarded controls. | `spec-complete` | `undocumented` |
| Remote Worker MCP | `cloudflare/workers/knowgrph-mcp/tool-registry.mjs` | Exactly 10 source registry tools. The Worker is a separate delivery unit. | `spec-complete` | `undocumented` |

Source presence is not runtime availability, and runtime availability is not
production verification.

`knowgrph.control_local_import_url` is the guarded browser-local owner for
`/ingest-url @url:https://example.com @reference-policy #canvas`. It delegates
to the existing Launch Import URL workspace path; the Agentic Canvas OS docs
MCP remains read-only discovery and never performs the import. Because the
browser-local tool is destructive and non-idempotent, a failure after workspace
mutation returns the created and removed paths plus a `partial` mutation state;
inspect that evidence before retrying.

### Public read-only source tools

The Pages contract contains exactly:

1. `search`
2. `fetch`
3. `list_source_files`
4. `read_source_file`
5. `read_shared_document`
6. `inspect_shared_document_structure`
7. `inspect_agent_surface`

These names describe source contract truth only.

### Transport and trust boundaries

- Pages HTTP is the read-only discovery and retrieval surface.
- App WebMCP is browser-local and includes guarded controls; its 42-tool count
  must not be projected onto Pages HTTP.
- Local stdio is intentionally broader and configuration-gated; it must not be
  projected onto either HTTP surface.
- Remote Worker MCP has its own deployment, bearer authorization, and session
  lifecycle. After initialization, a client preserves and returns the
  `mcp-session-id` header.
- The Worker registry count does not establish Worker reachability.

The authoritative two-endpoint Invocation Register, including trust and token
costs, is owned only by
[the install contract](../knowgrph-mcp-install-contract.md). Other documents
reference that register and do not redefine it.

### Ownership map

| Concern | Owner |
|---|---|
| Product and architecture contract | [MCP service PRD/TAD](knowgrph-mcp-service-prd-tad.md) |
| Detailed capability and security supplement | [MCP service companion](knowgrph-mcp-service-prd-tad.companion.md) |
| Endpoint invocation, trust, session, and token-cost register | [MCP install contract](../knowgrph-mcp-install-contract.md) |
| Agent-ready retrieval and browser context | [Agent-ready PRD/TAD](../knowgrph-agent-ready-prd-tad.md) |
| Operator verification | [Post-delivery verification checklist](../../knowgrph-post-deploy-verification-checklist.md) |

### Verification condition contract

| ID | End state | Stated check | Constraint |
|---|---|---|---|
| `VCC-MCP-OV-01` | Pages source registry has 7 read-only tools. | Run the focused Pages parity test and inspect the returned names. | Exactly the seven names above; no controls. |
| `VCC-MCP-OV-02` | App WebMCP has 42 tools. | Run the focused browser runtime contract test and classify annotations. | Exactly 30 read-only and 12 guarded controls. |
| `VCC-MCP-OV-03` | Worker source registry has 10 tools. | Run the Worker registry test and inspect discovery output. | Exactly 10 unique names. |
| `VCC-MCP-OV-04` | Remote session requests are authenticated and correlated. | Initialize with bearer authorization, retain the returned session id, then list tools with both headers. | Missing or invalid authorization fails closed; the session id is preserved. |

No Evidence Reference with a recorded result and tested surface is attached to
this document. Therefore neither the overview nor any listed delivery surface
advances beyond the declared rungs.

### Lane and boundary register

| Lane | Included | Closed boundary |
|---|---|---|
| Authoring | This overview, the service contract, companions, and source-owned verification conditions. | Documentation changes do not mutate mirror or delivery state. |
| Mirror | A separate repository synchronization action, when explicitly invoked. | No mirror action is authorized by this document. |
| Delivery | Pages and Worker publication plus runtime verification. | No delivery action or production state is implied by source changes. |

The deploy boundary is closed. Operator instruction: none. Rollback for this
document is a source revert followed by re-validation of links and frontmatter.
