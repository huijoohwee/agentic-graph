import assert from "node:assert/strict";
import { promises as fileSystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { ECS_TOOL_NAMES } from "../ecs-tool-contract.js";
import { AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function fixtureMarkdown() {
  return [
    "---",
    'kgSchema: "kgc-computing-flow/v1"',
    "flow:",
    "  nodes:",
    '    - id: "position-schema"',
    '      label: "Position schema"',
    '      type: "EcsComponentSchema"',
    '      status: "authored"',
    '      properties: {"ecsComponent":{"name":"Position","fields":{"x":"f32"}}}',
    '    - id: "npc-guide"',
    '      label: "Guide"',
    '      type: "EcsEntity"',
    '      status: "authored"',
    '      properties: {"ecsEntity":{"entityRef":"npc.guide","components":{"Position":{"x":1}}}}',
    "  edges:",
    "    []",
    "---",
    "",
    "# Agentic ECS fixture",
    "",
  ].join("\n");
}

test("official SDK drives the complete dev-only ECS session over the existing stdio server", async () => {
  const rootDir = await fileSystem.mkdtemp(path.join(tmpdir(), "agenticgraph-ecs-stdio-"));
  await fileSystem.writeFile(path.join(rootDir, "world.md"), fixtureMarkdown(), "utf8");
  const client = new Client({ name: "agenticgraph-ecs-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      AGENTICGRAPH_ROOT: rootDir,
    },
    stderr: "pipe",
  });
  let stderrText = "";
  transport.stderr?.on("data", (chunk) => { stderrText += String(chunk); });

  try {
    await client.connect(transport, { timeout: 10_000 });
    const listed = await client.listTools(undefined, { timeout: 10_000 });
    const ecsTools = listed.tools.filter((tool) => ECS_TOOL_NAMES.includes(tool.name));
    assert.deepEqual(ecsTools.map((tool) => tool.name), ECS_TOOL_NAMES, stderrText);
    assert.equal(ecsTools.length, 3);

    const startedResult = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.ecsSessionStart,
      arguments: {
        kgcPath: "world.md",
        scope: "#agentic-ecs",
        binding: "@source.frontmatter",
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(startedResult.isError, false, stderrText);
    const started = startedResult.structuredContent;
    assert.equal(started?.ok, true);
    assert.equal(started?.execution_boundary, "dev-only");
    assert.equal(started?.kgcPath, "world.md");
    assert.equal(typeof started?.sessionId, "string");

    const tickResult = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      arguments: {
        sessionId: started.sessionId,
        input: { elapsedMs: 16 },
        scope: "#agentic-ecs",
        binding: "@ecs-session",
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(tickResult.isError, false, stderrText);
    const ticked = tickResult.structuredContent;
    assert.equal(ticked?.ok, true);
    assert.equal(ticked?.execution_boundary, "dev-only");
    assert.equal(ticked?.pendingDecisionCount, 0);
    assert.deepEqual(ticked?.decisions, []);
    assert.equal(ticked?.cost_logs?.length, 1);
    assert.equal(ticked?.cost_logs?.[0]?.model, "none");

    const authoredResult = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      arguments: {
        sessionId: started.sessionId,
        scope: "#agentic-ecs",
        binding: "@ecs-session",
        decisions: [],
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(authoredResult.isError, true);
    assert.equal(authoredResult.structuredContent?.errorCode, "ECS_INVALID_ARGUMENTS");
    assert.equal(authoredResult.structuredContent?.execution_boundary, "dev-only");

    const persistResult = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      arguments: {
        sessionId: started.sessionId,
        scope: "#agentic-ecs",
        binding: "@ecs-session",
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(persistResult.isError, false, stderrText);
    assert.deepEqual(persistResult.structuredContent, {
      ok: true,
      execution_boundary: "dev-only",
      sessionId: started.sessionId,
      persistedCount: 0,
      idempotentCount: 0,
      sessionClosed: true,
    });

    const closedResult = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      arguments: {
        sessionId: started.sessionId,
        scope: "#agentic-ecs",
        binding: "@ecs-session",
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(closedResult.isError, true);
    assert.equal(closedResult.structuredContent?.errorCode, "ECS_SESSION_NOT_FOUND");
  } finally {
    await client.close().catch(() => undefined);
    await fileSystem.rm(rootDir, { force: true, recursive: true });
  }
});
