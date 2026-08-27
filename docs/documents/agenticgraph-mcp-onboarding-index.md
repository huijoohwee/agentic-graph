---
title: "MCP Onboarding Index"
id: "md:agenticgraph-mcp-onboarding-index"
doc_type: "Onboarding Index"
version: "1.1.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.mcp.onboarding"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/agenticgraph-mcp-onboarding-index.md"
guideline_version: "1.7.0"
reference_implementation_label: "reference implementation"
---

# MCP Onboarding Index

## Reference implementation: choose the smallest truthful MCP surface

Start here to select a surface. Endpoint values, trust, and token cost are
declared only in the
[authoritative Invocation Register](agenticgraph-mcp-install-contract.md).
Repository source does not prove endpoint reachability.

### Readiness declaration

| Scope | Local rung | Delivered rung | Basis |
|---|---|---|---|
| Onboarding guidance | `spec-complete` | `undocumented` | The setup VCCs are stated; no delivery Evidence Reference is attached. |

### Fast path — read-only source context

1. Open the Pages HTTP row in the authoritative Invocation Register.
2. Configure that endpoint in an MCP-capable client.
3. Initialize the connection and request tool discovery.
4. Confirm exactly 7 read-only tools:
   `search`, `fetch`, `list_source_files`, `read_source_file`,
   `read_shared_document`, `inspect_shared_document_structure`, and
   `inspect_agent_surface`.
5. Invoke the smallest read that supplies the needed context.
6. Treat any different count, control tool, or unreachable endpoint as drift,
   not as permission to guess another surface.

The read path requires zero model calls.

### Control-plane path — remote Worker

Use this path only when a capability in the separate 10-tool Worker source
registry is required.

1. Select the Worker row from the authoritative Invocation Register.
2. Obtain the environment-issued bearer secret through the operator-approved
   secret channel; never place it in source or documentation.
3. Initialize with `Authorization: Bearer <token>`.
4. Capture the returned `mcp-session-id`.
5. Preserve bearer authorization and that session id on every subsequent MCP
   request.
6. Confirm discovery returns exactly 10 source registry tools.
7. Obtain the tool-owner approval and spend declaration before a guarded
   execution.

The Worker is a separate deployment. A registry file, tool count, or successful
Pages read does not prove Worker delivery. A missing token or session id fails
closed.

### Browser-local path

The app WebMCP source contract contains exactly 42 tools:

- 30 read-only tools.
- 12 guarded controls.

These browser-local capabilities are not the Pages 7-tool registry and are not
the Worker 10-tool registry. Guarded controls remain conditional on their
runtime owners and approvals.

### Local stdio path

The local stdio catalog is broader than the HTTP surfaces and intentionally
configuration-gated. Use it for local owners and pipelines. Discovery does not
guarantee that credentials, files, processes, or harnesses are available;
missing prerequisites fail closed.

### Document map

| Need | Canonical document |
|---|---|
| Endpoint values, trust, auth/session sequence, token cost | [MCP install contract](agenticgraph-mcp-install-contract.md) |
| Four-surface overview | [MCP surface overview](agenticgraph-mcp/agenticgraph-mcp.md) |
| Product, architecture, five flows, and readiness gaps | [MCP service PRD/TAD](agenticgraph-mcp/agenticgraph-mcp-service-prd-tad.md) |
| Exact tool names and source owners | [MCP service companion](agenticgraph-mcp/agenticgraph-mcp-service-prd-tad.companion.md) |
| Pages/browser agent-ready contract | [Agent-ready PRD/TAD](agenticgraph-agent-ready-prd-tad.md) |
| File-level agent-ready invariants | [Agent-ready companion](agenticgraph-agent-ready-prd-tad.companion.md) |
| Conditional delivery verification | [Post-delivery verification checklist](../agenticgraph-post-deploy-verification-checklist.md) |

### Surface decision table

| Need | Surface | Count | Trust | Readiness in this document set |
|---|---|---:|---|---|
| Public source reading | Pages HTTP | 7 | Read-only | Local `spec-complete`; delivered `undocumented` |
| Browser context/control | App WebMCP | 42 | 30 reads + 12 guarded controls | Local `spec-complete`; delivered `undocumented` |
| Broad local integration | Local stdio | Configuration-dependent | Local process and credentials | Local `spec-complete`; delivered `undocumented` |
| Remote control plane | Separate Worker MCP | 10 | Bearer auth + preserved session + tool approval | Local `spec-complete`; delivered `undocumented` |

### Onboarding VCCs

| ID | End state | Stated check | Constraint | Evidence Reference |
|---|---|---|---|---|
| `VCC-ONBOARD-01` | A clean reader client discovers the seven exact Pages read tools. | Run the install-contract Pages handshake and surface count/names. | No bearer secret or control call; one session. | None recorded |
| `VCC-ONBOARD-02` | A clean Worker client preserves auth and session across initialization and discovery. | Run the install-contract Worker handshake and surface redacted headers plus the 10-tool count. | Never surface the secret; one session. | None recorded |
| `VCC-ONBOARD-03` | A reader reaches first value in at most 3 manual actions after endpoint configuration. | Time choose/initialize/read on a clean supported client and surface steps and elapsed time. | At most 5 minutes; one attempt. | None recorded |

These are planned checks, so readiness remains `spec-complete` /
`undocumented`.

### Boundary

This index authorizes no mirror, endpoint publication, secret change, or
production verification. Operator instruction: none. Rollback is a source
revert followed by link, count, and frontmatter validation.
