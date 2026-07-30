---
title: "Knowgrph MCP Onboarding Index"
schema: kgc-computing-flow/v1
id: "md:knowgrph-mcp-onboarding-index"
doc_type: "Onboarding Index"
version: "1.0.5"
date: "2026-07-30"
lang: "en-US"
owner: "docs.mcp.onboarding-index"
local_rung: "dev-proven"
delivered_rung: "runtime-ready"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-mcp-onboarding-index.md"
canonical_service_url: "https://airvio.co/knowgrph/"
public_read_mcp_url: "https://airvio.co/knowgrph/mcp"
control_plane_mcp_url: "https://airvio.co/knowgrph/control-plane/mcp"
tags: [mcp, onboarding, index, discovery, control-plane, operator]
constraints:
  - solo-dev
  - source-owned
  - token-efficient
  - fail-closed
related:
  - docs/documents/knowgrph-mcp-install-contract.md
  - docs/documents/knowgrph-mcp-install-boundary-release-note-20260710.md
  - docs/documents/knowgrph-agent-ready-prd-tad.md
  - docs/documents/knowgrph-xr-invocation-runtime-api.md
  - docs/documents/knowgrph-native-physics-engines-prd-tad.md
  - docs/documents/markdown-convertible-agent-discovery-document.md
  - docs/documents/knowgrph-superagent-harness.md
  - docs/documents/knowgrph-mcp/knowgrph-mcp.md
  - docs/documents/knowgrph-mcp-service-prd-tad.md
  - docs/documents/knowgrph-mcp-agentic-os-prd-tad.md
  - docs/documents/knowgrph-mcp-service-prd-tad.companion.md
  - docs/documents/knowgrph-mcp-agentic-os-prd-tad.companion.md
---

# Knowgrph MCP Onboarding Index

## Purpose

This is the one-stop landing page for remote MCP onboarding.

Use it when you need one short path to:

- choose the correct Knowgrph MCP endpoint
- understand the public discovery vs control-plane split
- find the source-backed Markdown discovery contract behind the Live Canvas Hero
- find the canonical install contract
- inspect XR Mode, Media, Skills & Commands, and native-physics runtime boundaries
- scan the latest install-boundary release note
- jump straight to the latest evidence-backed release proof

## Quick Answer

Map intent. Orchestrate agents. Prove outcomes.

A source-backed canvas where `/` routes work, `#` sets meaning, and `@` binds context.

One canonical operator contract: install and discovery stay on `https://airvio.co/knowgrph/mcp`, while live `/`, `#`, and `@` grammar stays on `https://airvio.co/knowgrph/control-plane/mcp` or an app-owned forwarder until the host proves MCP session support.

- Install `https://airvio.co/knowgrph/mcp` for public discovery and read-only MCP usage
- Use `https://airvio.co/knowgrph/control-plane/mcp` only for approval-gated orchestration and
  live `/`, `#`, `@` grammar invocation

## Fastest Path

1. Map intent: start with `https://airvio.co/knowgrph/mcp` for public discovery, retrieval, and
   inspection.
2. Orchestrate agents: add `https://airvio.co/knowgrph/control-plane/mcp` only if the host can
   preserve MCP session state across calls and needs live grammar lookup.
3. Prove outcomes: if you want the cheapest proof path before hosted setup, use the source-side
   offline deterministic route in `README.md` or `docs/documents/knowgrph-superagent-harness.md`
   in the `knowgrph` repository.

## Fastest Grammar Path

Use this path when you need live Agentic Canvas OS grammar, not just read-only discovery:

1. Map intent: install `https://airvio.co/knowgrph/mcp` first for discovery, retrieval, prompts, resources, and inspection
2. Orchestrate agents: add `https://airvio.co/knowgrph/control-plane/mcp` only when the host can preserve MCP session state
3. Prove outcomes: resolve live grammar on the control plane through `knowgrph.agentic_canvas_os.docs.invoke`

Concrete grammar examples:

- `/mcp.capabilities`
- `#mcp`
- `@mcp-gateway`

## Recommended Reading Order

1. `docs/documents/knowgrph-mcp-install-contract.md`
   - Canonical install rule, host recipes, and dual-surface boundary
2. `docs/documents/knowgrph-mcp-install-boundary-release-note-20260710.md`
   - Recent-change summary plus the latest evidence-backed release proof
3. `docs/documents/knowgrph-agent-ready-prd-tad.md`
   - Broader agent-ready surface, trust boundary, and discovery context
4. `docs/documents/knowgrph-xr-invocation-runtime-api.md`
   - Exact-revision `/`, `@`, `#` hydration, literal XR invocation, panel continuity, WebMCP lifecycle, and Source Files authority
5. `docs/documents/knowgrph-native-physics-engines-prd-tad.md`
   - Independent native 2D/3D engines and the Rapier principles-only, no-copy, no-dependency boundary
6. `docs/documents/markdown-convertible-agent-discovery-document.md`
   - Live Canvas Hero Markdown-discovery contract, publish route, and live proof
7. `huijoohwee/knowgrph` `README.md` or `docs/documents/knowgrph-superagent-harness.md`
   - Lowest-cost local evaluation path before hosted setup
8. `docs/documents/knowgrph-mcp/knowgrph-mcp.md`
   - Full MCP topology, readiness scope, and current implementation truth
9. `docs/documents/knowgrph-mcp-service-prd-tad.md`
   - Publish-side mirror entry for the implemented MCP baseline and shipped-vs-planned boundary
10. `docs/documents/knowgrph-mcp-agentic-os-prd-tad.md`
   - Publish-side mirror entry for the Agentic Canvas OS dashboard and orchestration contract
11. `docs/documents/knowgrph-mcp-service-prd-tad.companion.md` or
   `docs/documents/knowgrph-mcp-agentic-os-prd-tad.companion.md`
   - Publish-side mirror entries for file-owner detail, lane payloads, and companion guardrails
12. `https://airvio.co/knowgrph/.well-known/mcp/apps/knowgrph-agent-ready.html`
   - Browser-published MCP Apps card for template-only `#promotion.retry <path...>` recovery semantics

## Which Doc To Open

| Need | Open |
|---|---|
| I just need the right install URL | `docs/documents/knowgrph-mcp-install-contract.md` |
| I want the shortest update summary | `docs/documents/knowgrph-mcp-install-boundary-release-note-20260710.md` |
| I want the latest release proof with preview URL and docs-seed verification | `docs/documents/knowgrph-mcp-install-boundary-release-note-20260710.md` |
| I want the larger discovery and readiness context | `docs/documents/knowgrph-agent-ready-prd-tad.md` |
| I want XR Mode, panel, invocation, WebMCP, and Source Files readiness | `docs/documents/knowgrph-xr-invocation-runtime-api.md` |
| I want the independent 2D/3D physics and Rapier clean-room boundary | `docs/documents/knowgrph-native-physics-engines-prd-tad.md` |
| I want the Live Canvas Hero Markdown route and discovery contract | `docs/documents/markdown-convertible-agent-discovery-document.md` |
| I want the cheapest evaluation path before hosted setup | `huijoohwee/knowgrph` `README.md` or `docs/documents/knowgrph-superagent-harness.md` |
| I want the MCP-specific architecture and scope | `docs/documents/knowgrph-mcp/knowgrph-mcp.md` |
| I want the implemented MCP baseline in the publish docs tree | `docs/documents/knowgrph-mcp-service-prd-tad.md` |
| I want the Agentic Canvas OS contract in the publish docs tree | `docs/documents/knowgrph-mcp-agentic-os-prd-tad.md` |
| I want the companion-level ownership or lane detail in the publish docs tree | `docs/documents/knowgrph-mcp-service-prd-tad.companion.md` or `docs/documents/knowgrph-mcp-agentic-os-prd-tad.companion.md` |
| I want published promotion retry semantics without opening source docs | `https://airvio.co/knowgrph/.well-known/mcp/apps/knowgrph-agent-ready.html` |

## Canonical Endpoint Rule

| Surface | URL | Use |
|---|---|---|
| Public discovery | `https://airvio.co/knowgrph/mcp` | Install, discovery, read-only retrieval, prompts, resources, inspection |
| Control plane | `https://airvio.co/knowgrph/control-plane/mcp` | Approval-gated orchestration, live grammar invocation, sessioned MCP flows |

Canonicalize the contract first, not the transport. The current dual-surface runtime stays intentional until hosted proof supports a single-runtime claim.

## Guardrails

- Do not treat `/knowgrph/mcp` as if it already exposes the control-plane grammar tool.
- Do not document both URLs as interchangeable install targets.
- Do not claim one-URL plug-and-play grammar invocation for hosts that cannot manage MCP session flow.
