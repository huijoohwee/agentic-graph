# AgenticGraph Agent-Ready WebMCP Release Note

## Summary

AgenticGraph now ships a hardened, implementation-accurate agent-ready surface across:

- browser WebMCP via `navigator.modelContext`
- HTML-injected WebMCP fallback on the published Pages surface
- read-only HTTP MCP on `/agenticgraph/mcp`
- implementation-accurate MCP and agent-ready PRD/TAD documentation

This rollout keeps the existing MainPanel `mcp` / `integrations` -> FloatingPanel Chat ->
YAML frontmatter or MCP structured response -> Editor Workspace -> Canvas pipeline as the
canonical upstream flow. No second MCP-only graph pipeline was introduced.

## Shipped Contract

### Browser WebMCP

- App runtime registers `agenticgraph.list_source_files`, `agenticgraph.read_source_file`, `agenticgraph.read_shared_document`, `agenticgraph.inspect_shared_document_structure`, `agenticgraph.inspect_local_mainpanel_chat_canvas_pipeline`, `agenticgraph.inspect_local_workspace_document`, `agenticgraph.inspect_local_canvas_topology`, `agenticgraph.inspect_local_canvas_snapshot`, `agenticgraph.inspect_local_3d_camera_pose`, `agenticgraph.inspect_local_3d_layout_positions`, `agenticgraph.inspect_local_2d_zoom_viewport`, `agenticgraph.inspect_local_source_files_snapshot`, and `agenticgraph.inspect_agent_surface`
- Reuses the shared upstream tool contract in
  `canvas/src/features/agent-ready/agenticgraphAgentReadyToolContract.mjs`
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

- Serves read-only JSON-RPC transport on `https://airvio.co/agenticgraph/mcp`
- Supports `initialize`, `tools/list`, and `tools/call`
- Shares tool names and input schemas with browser WebMCP

## Deployed URLs

- Live app: [airvio.co/agenticgraph](https://airvio.co/agenticgraph)
- Live MCP: [airvio.co/agenticgraph/mcp](https://airvio.co/agenticgraph/mcp)
- Preview alias used for rollout verification:
  [agent-ready-webmcp-preview.joohwee.pages.dev/agenticgraph](https://agent-ready-webmcp-preview.joohwee.pages.dev/agenticgraph)

## Commits

- Source repo `agenticgraph`
  - `d666208d` `Harden WebMCP lifecycle and align MCP docs`
  - `43f1a9eb` `Log agent-ready WebMCP rollout`
- Publish repo `huijoohwee`
  - `321e4b4d` `Publish agenticgraph agent-ready WebMCP update`

## Verification

### Focused local checks

```bash
cd $GITHUB_ROOT/agenticgraph/canvas
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs -e "Promise.all([import('./src/__tests__/webMcpRuntime.test.ts'), import('./src/__tests__/agentReadyWebMcpHtmlFallback.test.ts')]).then(async ([runtimeTest, htmlTest]) => { await runtimeTest.testWebMcpRuntimeLateBindsAndUsesSameOriginStoragePaths(); await htmlTest.testAgentReadyHtmlWebMcpFallbackLateBindsAndUsesSameOriginStoragePaths(); })"
```

### Preview smoke

```bash
cd $GITHUB_ROOT/agenticgraph
AGENTICGRAPH_AGENT_READY_BASE_URL=https://agent-ready-webmcp-preview.joohwee.pages.dev/agenticgraph node ./scripts/check-agent-ready.mjs
```

Expected result:

```text
[agenticgraph] agent-ready smoke passed: 27/27
```

### Live smoke

```bash
cd $GITHUB_ROOT/agenticgraph
node ./scripts/check-agent-ready.mjs
```

Expected result:

```text
[agenticgraph] agent-ready smoke passed: 27/27
```

## Source Of Truth

- Agent-ready Pages route owner:
  `cloudflare/pages/agenticgraph-agent-ready.mjs`
- Browser WebMCP runtime owner:
  `canvas/src/features/agent-ready/webMcpRuntime.ts`
- Shared read-only tool contract:
  `canvas/src/features/agent-ready/agenticgraphAgentReadyToolContract.mjs`
- Agent-ready smoke owner:
  `scripts/check-agent-ready.mjs`
- Canonical implementation-accurate PRD/TAD:
  `docs/documents/agenticgraph-agent-ready-prd-tad.md`
- Canonical MCP PRD/TAD:
  `docs/documents/agenticgraph-mcp/agenticgraph-mcp-service-prd-tad.md`

## Guardrails

- Do not add write-capable tools to browser WebMCP or Pages HTTP MCP without explicit auth and
  workspace-write design
- Do not fork a second LLM output -> Markdown or MCP structured response -> Editor Workspace ->
  Canvas pipeline outside the existing chat submit, validation, finalize, parser, and apply chain
- Do not reintroduce parallel grouping authoring aliases beside canonical `flow.subgraphs`
- Do not treat the publish mirror as a source-authoritative implementation surface
