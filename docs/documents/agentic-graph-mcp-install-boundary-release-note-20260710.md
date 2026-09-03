# agentic-graph MCP Install Boundary Release Note 2026-07-10

## Summary

agentic-graph now publishes one explicit operator-facing MCP install rule for remote hosts.

Map intent. Orchestrate agents. Prove outcomes.

A source-backed canvas where `/` routes work, `#` sets meaning, and `@` binds context.

- Public install and discovery stay on `https://airvio.co/agentic-graph/mcp`
- Approval-gated orchestration and live `/`, `#`, `@` grammar invocation stay on
  `https://airvio.co/agentic-os/control-plane/mcp`
- The canonical onboarding and host recipes now live in
  `docs/documents/agentic-graph-mcp-install-contract.md`
- The Live Canvas Hero Markdown discovery contract now lives in
  `docs/documents/markdown-convertible-agent-discovery-document.md`
- The cheapest proof path before hosted setup is the source-side offline deterministic route in
  `huijoohwee/agentic-graph` `README.md` or `docs/documents/agentic-graph-superagent-harness.md`

This update is documentation-only. It does not change runtime ownership, route behavior, or MCP
tool registration.

For the one-page onboarding path across the install contract, agent-ready context, and MCP
overview, open `docs/documents/agentic-graph-mcp-onboarding-index.md`.

## Shipped Change

- Added a dedicated install contract for ChatGPT, Claude, Vercel, Lovable, and generic MCP clients
- Linked that install contract from the repo README, the canonical agent-ready document, and the
  MCP overview
- Mirrored the same install-boundary note into the published docs overview
- Mirrored the template-only `#promotion.retry <path...>` recovery contract into the shared
  browser-published MCP Apps card instead of creating a second publish-only recovery path
- Logged the new install boundary and doc-routing follow-ups in the planning history now centralized under `agentic-canvas-os/todo/2026-07.md`

## Latest Release Evidence (2026-07-11)

- Pages preview: `https://8ccfa5b7.joohwee.pages.dev`
- Live route: `https://airvio.co/agentic-graph/`
- Live verify: `npm run runtime:verify` passed
- Canonical docs seed: `node ./scripts/seed-storage-docs-to-cloudflare.mjs` passed
- Canonical docs seed proof:
  - `source-files=41`
  - `chunked-source-files=15`
  - `before-seed` export: `825ms`
  - `direct-d1-verification` export: `736ms`
  - final verification: `documents=41`
  - terminal result: `direct D1 seed complete`

## Why This Matters

Remote hosts should not have to guess which endpoint owns installation versus orchestration.

The new boundary keeps the public path simple and low-friction while preserving the separate
control-plane trust boundary for approval-gated or sessioned operations.
It also keeps time-to-value high by pointing cost-sensitive evaluators to the offline harness path
before they wire hosted MCP clients.
For the landing-surface discovery route and public Markdown proof, use
`docs/documents/markdown-convertible-agent-discovery-document.md`.

## Canonical Rule

Use:

- Map intent: `https://airvio.co/agentic-graph/mcp` for basic remote MCP installation, discovery,
  read-only retrieval, prompt discovery, resource discovery, and inspection
- Orchestrate agents: `https://airvio.co/agentic-os/control-plane/mcp` only when the host can
  manage the MCP session flow and needs approval-gated orchestration or live
  `agentic-graph.agentic_canvas_os.docs.invoke`

To prove outcomes before setup, use the local harness path first. If a host cannot manage the
second sessioned MCP surface, keep discovery on the public endpoint and route grammar invocation
through an app-owned forwarder.

## Fastest Grammar Path

When an operator needs live grammar rather than read-only discovery:

1. install `https://airvio.co/agentic-graph/mcp` first
2. add `https://airvio.co/agentic-os/control-plane/mcp` only for session-capable hosts
3. execute grammar through `agentic-graph.agentic_canvas_os.docs.invoke`

Current live examples:

- `/mcp.capabilities`
- `#mcp`
- `@mcp-gateway`

## Source Of Truth

- Canonical install contract:
  `docs/documents/agentic-graph-mcp-install-contract.md`
- Canonical Markdown discovery contract:
  `docs/documents/markdown-convertible-agent-discovery-document.md`
- Canonical agent-ready landing doc:
  `docs/documents/agentic-graph-agent-ready-prd-tad.md`
- Canonical MCP overview:
  `docs/documents/agentic-graph-mcp/agentic-graph-mcp.md`
- Planning ledger:
  `agentic-canvas-os/docs/TODO.md` plus `agentic-canvas-os/todo/2026-07.md`

## Published Recovery Surface

For publish-side promotion retry semantics, use:

- `https://airvio.co/agentic-graph/.well-known/mcp/apps/agentic-graph-agent-ready.html`

That card reuses the shared MCP Apps source owner and shows the template-only
`#promotion.retry <path...>` contract. Exact path-bearing retry commands still come from
browser-local finalize inspection after a real mirroring failure.

## Guardrails

- Do not document `/agentic-graph/mcp` as if it already exposes the control-plane grammar tool.
- Do not collapse public discovery and approval-gated orchestration into one install URL by copy.
- Do not claim universal one-URL plug-and-play grammar invocation for hosts that cannot manage MCP
  session lifecycle.
