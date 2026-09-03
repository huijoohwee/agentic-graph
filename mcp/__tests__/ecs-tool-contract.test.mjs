import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ECS_EXECUTION_BOUNDARY,
  ECS_INVOCATION_GRAMMAR,
  ECS_TOOL_NAMES,
} from "../ecs-tool-contract.js";
import {
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES,
  buildAgenticGraphLocalMcpToolDefinitions,
} from "../local-tool-contract.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("the local MCP catalog exposes exactly the three bounded Agentic ECS descriptors", () => {
  const ecsTools = buildAgenticGraphLocalMcpToolDefinitions().filter((tool) => ECS_TOOL_NAMES.includes(tool.name));
  assert.deepEqual(ecsTools.map((tool) => tool.name), [
    AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart,
    AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
    AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
  ]);
  assert.equal(new Set(ecsTools.map((tool) => tool.name)).size, 3);

  for (const tool of ecsTools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.match(tool.description, new RegExp(ECS_INVOCATION_GRAMMAR[tool.name].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.deepEqual(tool.outputSchema.required, ["ok", "execution_boundary"]);
    assert.equal(tool.outputSchema.properties.execution_boundary.const, ECS_EXECUTION_BOUNDARY);
    assert.equal(tool.annotations.openWorldHint, false);
  }
});

test("ECS descriptors accept only the exact scope, binding, and caller-owned inputs", () => {
  const byName = new Map(
    buildAgenticGraphLocalMcpToolDefinitions()
      .filter((tool) => ECS_TOOL_NAMES.includes(tool.name))
      .map((tool) => [tool.name, tool]),
  );
  const start = byName.get(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart);
  const tick = byName.get(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick);
  const persist = byName.get(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist);

  assert.deepEqual(start.inputSchema.required, ["kgcPath"]);
  assert.deepEqual(Object.keys(start.inputSchema.properties).sort(), ["binding", "kgcPath", "scope"]);
  assert.deepEqual(start.inputSchema.properties.scope.enum, ["#agentic-ecs"]);
  assert.deepEqual(start.inputSchema.properties.binding.enum, ["@source.frontmatter"]);

  assert.deepEqual(tick.inputSchema.required, ["sessionId"]);
  assert.deepEqual(Object.keys(tick.inputSchema.properties).sort(), ["binding", "input", "scope", "sessionId"]);
  assert.deepEqual(tick.inputSchema.properties.binding.enum, ["@ecs-session"]);

  assert.deepEqual(persist.inputSchema.required, ["sessionId"]);
  assert.deepEqual(Object.keys(persist.inputSchema.properties).sort(), ["binding", "scope", "sessionId"]);
  assert.equal(Object.hasOwn(persist.inputSchema.properties, "decisions"), false);

  const serialized = JSON.stringify([...byName.values()]);
  assert.doesNotMatch(serialized, /"(?:deploy|network|cloudflare)[^"]*"\s*:/i);
});

test("ECS dispatch delegates through the existing stdio server without adding a transport", async () => {
  const serverText = await readFile(path.join(repoRoot, "mcp", "server.js"), "utf8");
  assert.match(serverText, /isEcsToolName\(toolName\)/);
  assert.equal((serverText.match(/new StdioServerTransport\(/g) ?? []).length, 1);
  assert.equal((serverText.match(/new Server\(/g) ?? []).length, 1);
});
