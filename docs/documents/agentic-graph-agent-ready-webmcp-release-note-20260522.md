# agentic-graph Agent-Ready WebMCP Release Note

## Summary

agentic-graph now ships a hardened, implementation-accurate agent-ready surface across:

- browser WebMCP via `navigator.modelContext`
- HTML-injected WebMCP fallback on the published Pages surface
- read-only HTTP MCP on `/agentic-graph/mcp`
- implementation-accurate MCP and agent-ready PRD/TAD documentation

This rollout keeps the existing MainPanel `mcp` / `integrations` -> FloatingPanel Chat ->
YAML frontmatter or MCP structured response -> Editor Workspace -> Canvas pipeline as the
canonical upstream flow. No second MCP-only graph pipeline was introduced.

## Shipped Contract

### Browser WebMCP

- App runtime registers `agentic-graph.list_source_files`, `agentic-graph.read_source_file`, `agentic-graph.read_shared_document`, `agentic-graph.inspect_shared_document_structure`, `agentic-graph.inspect_local_mainpanel_chat_canvas_pipeline`, `agentic-graph.inspect_local_workspace_document`, `agentic-graph.inspect_local_canvas_topology`, `agentic-graph.inspect_local_canvas_snapshot`, `agentic-graph.inspect_local_3d_camera_pose`, `agentic-graph.inspect_local_3d_layout_positions`, `agentic-graph.inspect_local_2d_zoom_viewport`, `agentic-graph.inspect_local_source_files_snapshot`, and `agentic-graph.inspect_agent_surface`
- Reuses the shared upstream tool contract in
  `canvas/src/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs`
- Attempts `provideContext({ tools })`, then `registerTool(tool, { signal })`, then readable
  fallback `modelContext.tools`
- Supports bounded late binding when `navigator.modelContext` appears after startup
- Treats duplicate registration as duplicate-state handling instead of swallowing arbitrary errors
- Uses same-origin `/api/storage/*` paths on localhost and current-origin resolution with canonical
  fallback on preview/prod

### HTML Fallback WebMCP

- Injects the shared published five-tool read-only surface on the published Pages HTML shell
- Keeps lifecycle semantics aligned with the app runtime while excluding browser-local app-only tools
- Exposes `data-kg-webmcp-tools` and `data-kg-webmcp-context` for smoke verification

### HTTP MCP

- Serves read-only JSON-RPC transport on `https://airvio.co/agentic-graph/mcp`
- Supports `initialize`, `tools/list`, and `tools/call`
- Shares tool names and input schemas with browser WebMCP

## Deployed URLs

- Live app: [airvio.co/agentic-graph](https://airvio.co/agentic-graph)
- Live MCP: [airvio.co/agentic-graph/mcp](https://airvio.co/agentic-graph/mcp)
- Preview alias used for rollout verification:
  [agent-ready-webmcp-preview.joohwee.pages.dev/agentic-graph](https://agent-ready-webmcp-preview.joohwee.pages.dev/agentic-graph)

## Commits

- Source repo `agentic-graph`
  - `d666208d` `Harden WebMCP lifecycle and align MCP docs`
  - `43f1a9eb` `Log agent-ready WebMCP rollout`
- Publish repo `huijoohwee`
  - `321e4b4d` `Publish agentic-graph agent-ready WebMCP update`

## Verification

### Focused local checks

```bash
cd $GITHUB_ROOT/agentic-graph/canvas
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs -e "Promise.all([import('./src/__tests__/webMcpRuntime.test.ts'), import('./src/__tests__/agentReadyWebMcpHtmlFallback.test.ts')]).then(async ([runtimeTest, htmlTest]) => { await runtimeTest.testWebMcpRuntimeLateBindsAndUsesSameOriginStoragePaths(); await htmlTest.testAgentReadyHtmlWebMcpFallbackLateBindsAndUsesSameOriginStoragePaths(); })"
```

### Preview smoke

```bash
cd $GITHUB_ROOT/agentic-graph
AGENTIC_OS_AGENT_READY_BASE_URL=https://agent-ready-webmcp-preview.joohwee.pages.dev/agentic-graph node ./scripts/check-agent-ready.mjs
```

Expected result:

```text
[agentic-graph] agent-ready smoke passed: 27/27
```

### Live smoke

```bash
cd $GITHUB_ROOT/agentic-graph
node ./scripts/check-agent-ready.mjs
```

Expected result:

```text
[agentic-graph] agent-ready smoke passed: 27/27
```

## Source Of Truth

- Agent-ready Pages route owner:
  `cloudflare/pages/agentic-graph-agent-ready.mjs`
- Browser WebMCP runtime owner:
  `canvas/src/features/agent-ready/webMcpRuntime.ts`
- Shared read-only tool contract:
  `canvas/src/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs`
- Agent-ready smoke owner:
  `scripts/check-agent-ready.mjs`
- Canonical implementation-accurate PRD/TAD:
  `docs/documents/agentic-graph-agent-ready-prd-tad.md`
- Canonical MCP PRD/TAD:
  `docs/documents/agentic-graph-mcp/agentic-graph-mcp-service-prd-tad.md`

## Guardrails

- Do not add write-capable tools to browser WebMCP or Pages HTTP MCP without explicit auth and
  workspace-write design
- Do not fork a second LLM output -> Markdown or MCP structured response -> Editor Workspace ->
  Canvas pipeline outside the existing chat submit, validation, finalize, parser, and apply chain
- Do not reintroduce parallel grouping authoring aliases beside canonical `flow.subgraphs`
- Do not treat the publish mirror as a source-authoritative implementation surface
