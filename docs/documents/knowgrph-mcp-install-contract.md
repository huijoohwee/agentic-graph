---
title: "Knowgrph MCP Install Contract"
schema: kgc-computing-flow/v1
id: "md:knowgrph-mcp-install-contract"
doc_type: "Install Contract"
version: "1.1.3"
date: "2026-07-30"
lang: "en-US"
owner: "docs.mcp.install-contract"
local_rung: "dev-proven"
delivered_rung: "runtime-ready"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-mcp-install-contract.md"
canonical_service_url: "https://airvio.co/knowgrph/"
public_read_mcp_url: "https://airvio.co/knowgrph/mcp"
control_plane_mcp_url: "https://airvio.co/knowgrph/control-plane/mcp"
tags: [mcp, install, discovery, control-plane, agentic-os, cmdk, public-remote, streamable-http]
constraints:
  - solo-dev
  - token-efficient
  - source-owned
  - fail-closed
related:
  - README.md
  - docs/documents/knowgrph-next-step-priorities.md
  - docs/documents/knowgrph-agent-ready-prd-tad.md
  - docs/documents/markdown-convertible-agent-discovery-document.md
  - docs/documents/knowgrph-mcp/knowgrph-mcp.md
  - docs/documents/knowgrph-superagent-harness.md
  - docs/knowgrph-acos-deploy-runbook.md
---

# Knowgrph MCP Install Contract

## Purpose

This document is the canonical install contract for third-party MCP hosts that want to use
Knowgrph remotely.

If you want the shortest guided reading path across the install contract, release note,
agent-ready context, and MCP overview, start with `docs/documents/knowgrph-mcp-onboarding-index.md`.
For the source-backed Live Canvas Hero Markdown discovery route behind the landing surface, use
`docs/documents/markdown-convertible-agent-discovery-document.md`.

The boundary is explicit:

- Install `https://airvio.co/knowgrph/mcp` for public discovery, read-only retrieval, prompts, resources, and inspection.
- Use `https://airvio.co/knowgrph/control-plane/mcp` only for approval-gated orchestration and live Agentic Canvas OS grammar invocation through `knowgrph.agentic_canvas_os.docs.invoke`.

Map intent. Orchestrate agents. Prove outcomes.

A source-backed canvas where `/` routes work, `#` sets meaning, and `@` binds context.

One canonical operator contract: install and discovery stay on the public endpoint, while live `/`, `#`, and `@` grammar stays on the approval-gated control plane or an app-owned forwarder until the host proves MCP session support.

Canonicalize the contract first, not the transport. Keep the current runtime split underneath this contract until hosted proof supports a single runtime claim.

## Fastest Decision Path

If you only need one quick setup answer, use this order:

1. map intent: install `https://airvio.co/knowgrph/mcp`
2. orchestrate agents: add `https://airvio.co/knowgrph/control-plane/mcp` only if the host can keep MCP session state across calls
3. if the host cannot do sessioned control-plane MCP, keep public discovery on `/knowgrph/mcp` and route `/`, `#`, and `@` grammar through an app-owned forwarder
4. inspect landing discovery: open `docs/documents/markdown-convertible-agent-discovery-document.md` for the public Markdown route, publish contract, and live proof

To prove outcomes with a local, offline, deterministic evaluation before any hosted MCP setup,
start with the source-side `README.md` quick start or
`docs/documents/knowgrph-superagent-harness.md` in the `knowgrph` repository.

## Host Decision Matrix

| Host situation | Install choice | Why |
|---|---|---|
| Need the fastest working remote MCP install | `https://airvio.co/knowgrph/mcp` | Lowest-friction read-only discovery surface |
| Need live `/`, `#`, `@` grammar invocation and can preserve MCP session headers | Add `https://airvio.co/knowgrph/control-plane/mcp` | Grammar is exposed only on the control plane |
| Need grammar lookup but the host cannot manage sessioned MCP | Keep `/knowgrph/mcp` and use an app-owned forwarder | Preserves install simplicity without pretending one-URL grammar support |
| Need offline evaluation before wiring any remote host | Use local parser/harness path first | Fastest proof, zero provider spend, lower setup cost |

## Topology

| Surface | URL | Role | Remote grammar (`/`, `#`, `@`) |
|---|---|---|---|
| Public discovery | `https://airvio.co/knowgrph/mcp` | Canonical install URL for remote MCP hosts | Not exposed here |
| Control plane | `https://airvio.co/knowgrph/control-plane/mcp` | Approval-gated orchestration surface | Live via `knowgrph.agentic_canvas_os.docs.invoke` |

## Operator Rule

Keep one canonical operator-facing contract even when the runtime stays split underneath:

- install and discovery stay on `https://airvio.co/knowgrph/mcp`
- live `/`, `#`, and `@` grammar stays on `https://airvio.co/knowgrph/control-plane/mcp` or an app-owned forwarder

If a host supports one simple public MCP install, give it `https://airvio.co/knowgrph/mcp`.

If a host also supports a second Streamable HTTP MCP endpoint with `initialize` plus session-header
handling, add `https://airvio.co/knowgrph/control-plane/mcp` for live `/`, `#`, and `@` lookup.

If a host cannot manage that second sessioned MCP surface, keep discovery on the public endpoint and
route grammar invocation through a thin app-owned forwarder such as `agentic-canvas-os /api/invoke`.

This rule exists to optimize time-to-value first, then grammar power second, without collapsing the intentional public-discovery vs control-plane boundary before hosted proof exists.

## Public Endpoint Contract

`https://airvio.co/knowgrph/mcp` is the public install URL because it is the low-friction,
stateless, read-only surface.

Shipped public capabilities:

- `search`
- `fetch`
- `list_source_files`
- `read_source_file`
- `read_shared_document`
- `inspect_shared_document_structure`
- `inspect_agent_surface`
- prompt discovery
- resource-template discovery

Do not document the public endpoint as if it exposes write-capable or approval-gated tools.

## Control-Plane Contract

`https://airvio.co/knowgrph/control-plane/mcp` is a separate MCP surface.

Use it when the remote host needs:

- live Agentic Canvas OS grammar lookup for `/`, `#`, and `@`
- approval-gated orchestration
- control-plane tools such as `knowgrph.video_remix.run`
- `knowgrph.os.status`

The control-plane surface requires normal MCP session flow:

1. `initialize`
2. read `mcp-session-id`
3. send `tools/list` or `tools/call` with that session id

## Host Recipes

### ChatGPT / OpenAI Apps

- Install `https://airvio.co/knowgrph/mcp`
- Use `inspect_agent_surface` for readiness and app metadata
- Use `search` then `fetch` for read-only research
- Add the control-plane endpoint only in flows that can manage MCP session lifecycle and need live grammar invocation

Evidence level: source-backed on the public MCP surface through shipped `clientSetups.openai-apps`
metadata.

### Claude MCP Connector

- Install `https://airvio.co/knowgrph/mcp`
- Use read-only retrieval from the public surface
- Add `https://airvio.co/knowgrph/control-plane/mcp` only when the connector path can maintain the MCP session id across calls and grammar lookup is required

Evidence level: source-backed on the public MCP surface through shipped `clientSetups.claude-mcp-connector`
metadata.

### Vercel

- Treat `https://airvio.co/knowgrph/mcp` as the default MCP server URL
- Use the public surface for discovery, retrieval, and inspection
- Default live `/`, `#`, and `@` to a thin app-owned forwarder
- Register the control-plane endpoint directly only if the Vercel-side MCP client supports a second sessioned Streamable HTTP server and can preserve `mcp-session-id`

Evidence level: generic integration recipe. The repo ships the control-plane-forwarder pattern and
does not claim a one-URL Vercel install for grammar invocation.

### Lovable

- Treat `https://airvio.co/knowgrph/mcp` as the default MCP server URL
- Use the public surface for discovery, retrieval, and inspection
- Default live `/`, `#`, and `@` to an app-owned forwarder
- Add the control plane only if the host can perform `initialize`, preserve `mcp-session-id`, and call `knowgrph.agentic_canvas_os.docs.invoke`

Evidence level: generic integration recipe. Public discovery is ready; direct two-surface grammar
support depends on host MCP session support.

## Compatibility Truth

Knowgrph is:

- plug-and-play for public MCP discovery
- coherent for remote install metadata
- remotely live for `/`, `#`, and `@` on the control plane
- forwarder-first for hosted live grammar when session support is unclear
- not a single-endpoint grammar-install surface

That distinction is intentional. It keeps public discovery low-friction and keeps spend-bearing or
approval-gated behavior on the control-plane boundary.

For startup execution, the priority order is:

1. shortest install path
2. clear grammar differentiation
3. proof-backed readiness
4. offline deterministic evaluation

## Verification Snapshot

Current operator-proof baseline:

- public `tools/list` succeeds on `https://airvio.co/knowgrph/mcp`
- control-plane `initialize` returns `mcp-session-id`
- control-plane `knowgrph.agentic_canvas_os.docs.invoke` resolves:
  - `/mcp.capabilities`
  - `#mcp`
  - `@mcp-gateway`

## Non-Goals

- Do not collapse public discovery and control-plane orchestration into one URL.
- Do not claim public `tools/list` exposes grammar invocation today.
- Do not imply every third-party host can perform two-surface grammar invocation without MCP session support.
