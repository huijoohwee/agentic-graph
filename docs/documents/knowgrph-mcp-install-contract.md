---
title: "MCP Endpoint Installation Contract"
id: "md:knowgrph-mcp-install-contract"
doc_type: "Operator Contract"
version: "2.0.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.mcp.install"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-mcp-install-contract.md"
guideline_version: "1.7.0"
reference_implementation_label: "reference implementation"
---

# MCP Endpoint Installation Contract

## Reference implementation: endpoint selection, trust, and session setup

This is the sole authoritative Invocation Register for the two repository
MCP HTTP endpoints. The configured endpoint values and source registries do not
establish reachability in a delivery environment.

### Readiness declaration

| Scope | Local rung | Delivered rung | Basis |
|---|---|---|---|
| Install contract | `spec-complete` | `undocumented` | Invocation and verification conditions are stated; no delivery Evidence Reference is attached. |

### Invocation Register

| Endpoint | Kind | Source owner | Source capability | Trust boundary | Model-token cost |
|---|---|---|---|---|---|
| `https://airvio.co/knowgrph/mcp` | Pages HTTP MCP | `cloudflare/pages/knowgrph-agent-ready.mjs` | Exactly 7 read-only tools. | Public read; no bearer credential in this source contract. | 0 for discovery and reads. |
| `https://airvio.co/knowgrph/control-plane/mcp` | Remote Worker MCP | `cloudflare/workers/knowgrph-mcp/index.ts` and `tool-registry.mjs` | Exactly 10 source registry tools. | Bearer-authenticated, session-preserving control plane; guarded operations remain owner-gated. | 0 for discovery/read tools; execution is harness-dependent and must surface spend. |

These rows declare invocation identity, not delivery status. The Worker is a
separate deployment from Pages and requires separate delivery evidence.

### Selection rule

| Need | Select | Do not infer |
|---|---|---|
| Search, fetch, source-file/shared-document reading, or surface inspection | Pages HTTP MCP | Browser controls, local stdio tools, or Worker execution |
| Remote status, orchestration, or other Worker registry capability | Remote Worker MCP | That discovery guarantees the downstream harness, approval, or credential |
| Browser-local inspection/control | App WebMCP, documented in the service contract | That the HTTP endpoints expose all 42 browser tools |
| Broad local integration | Local stdio MCP | That every discovered tool is configured or remotely available |

### Generic client sequence — Pages read surface

1. Configure the Pages endpoint from the register.
2. Send an MCP `initialize` request with `Content-Type: application/json` and an
   `Accept` value that permits JSON and event-stream responses.
3. Complete the MCP initialized handshake required by the client.
4. Request tool discovery.
5. Confirm exactly the seven read-only names in the agent-ready contract.
6. Invoke a read with typed arguments and surface partial or typed errors.

No bearer token is required by the Pages source contract. A particular client
may still keep its own local credential store; that does not change endpoint
trust.

### Generic client sequence — remote Worker

1. Configure the Worker endpoint from the register.
2. Store the environment-issued secret outside source and documentation.
3. Send `Authorization: Bearer <token>` on `initialize`, together with
   `Content-Type: application/json` and an `Accept` value that permits JSON and
   event-stream responses.
4. Capture the `mcp-session-id` response header from initialization.
5. Complete the initialized handshake using both bearer authorization and that
   session id when the transport requires it.
6. Send every later MCP request with the same bearer authorization and
   `mcp-session-id`.
7. Confirm exactly 10 discovered source registry tools.
8. Treat a guarded execution request as a new approval and spend decision; tool
   discovery is not that approval.

On reconnect, initialize a new session. Do not guess, synthesize, or reuse a
stale session id. Session identity correlates requests but never replaces bearer
authorization.

### Fail-closed outcomes

| Condition | Required client behavior |
|---|---|
| Missing or invalid Worker bearer token | Stop; surface unauthorized; do not retry without corrected credentials. |
| Missing or stale Worker session id after initialization | Reinitialize; do not dispatch against guessed state. |
| Pages discovery differs from 7 read-only tools | Surface contract drift; do not assume controls. |
| Worker discovery differs from 10 tools | Surface contract drift; do not attempt an unknown control. |
| Tool exists but owner/harness is unavailable | Surface unavailable/partial result; do not report success. |
| Guarded operation lacks approval or spend declaration | Deny before side effect or model spend. |
| Endpoint is unreachable | Record a delivery failure; do not use source presence as fallback evidence. |

### Token and cost contract

- Endpoint discovery, tool discovery, source reads, and status inspection use
  zero model tokens.
- A control may call a model or paid dependency only through its named runtime
  owner after approval.
- That owner records input/output tokens, cache behavior where available,
  estimated cost, maximum iterations, and circuit-breaker reason.
- The MCP dispatcher adds no implicit retry loop. A downstream harness owns and
  bounds every retry.
- No new persistent service is required by this install contract; environment,
  network, and model TCO must be recorded by the deployment that incurs them.

### Planned VCC register

| ID | End state | Stated check | Constraint | Evidence Reference |
|---|---|---|---|---|
| `VCC-INSTALL-01` | Pages initialization and discovery return the seven exact read-only names. | Run a clean-client handshake against the selected surface and surface response status, tool count, and names. | No bearer secret and no control invocation; one session. | None recorded |
| `VCC-INSTALL-02` | Worker rejects a missing bearer token. | Run an unauthenticated initialize attempt and surface the unauthorized result. | No valid secret is logged; one attempt. | None recorded |
| `VCC-INSTALL-03` | Authenticated Worker initialization returns a session id that is reused for discovery. | Run initialize and tool discovery, surfacing redacted headers plus the 10-name count. | Same session id; secret redacted; one session. | None recorded |
| `VCC-INSTALL-04` | Worker execution remains guarded. | Attempt a control without its required approval and surface denial plus unchanged state. | Zero side effects and zero unintended model spend. | None recorded |

The checks are VCC hosts only. A delivery rung can advance only after an exact
invocation, recorded result, tested endpoint/revision, and delivery lane are
attached as Evidence References.

### Lane and rollback contract

| Lane transition | Entry gate | Exit evidence | Rollback |
|---|---|---|---|
| Authoring → mirror | Explicit operator-selected revision. | Mirrored revision plus reproducible source checks. | Restore prior mirror revision. |
| Mirror → Pages delivery | Explicit Pages publication instruction. | Pages endpoint handshake and seven-tool result. | Restore prior Pages revision. |
| Mirror → Worker delivery | Separate explicit Worker publication instruction and binding review. | Authenticated session handshake and 10-tool result. | Restore prior Worker revision/bindings and invalidate affected sessions. |

The deploy boundary is closed. Operator instruction: none. No endpoint
Evidence Reference is recorded in this document.
