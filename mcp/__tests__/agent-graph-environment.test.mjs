import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { runAgentGraphTool } from "../agent-graph-host.js";
import { RETIRED_AGENT_GRAPH_ENVIRONMENT_KEYS } from "../agent-graph/environment.mjs";
import { AGENT_GRAPH_TOOL_NAMES } from "../agent-graph/runtime.mjs";
import { SOURCE_PARSER_DESCRIPTORS } from "../agent-graph/source-parser-registry.mjs";

test("MCP host rejects every retired agent-graph environment key before runtime selection", async () => {
  assert.equal(RETIRED_AGENT_GRAPH_ENVIRONMENT_KEYS.length, 7);
  for (const key of RETIRED_AGENT_GRAPH_ENVIRONMENT_KEYS) {
    const result = await runAgentGraphTool(AGENT_GRAPH_TOOL_NAMES.query, {}, {
      rootDir: process.cwd(),
      env: {
        AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT: path.join("data", "outputs", "agent-graph-test"),
        [key]: "",
      },
    });
    assert.equal(result.ok, false, key);
    assert.equal(result.error.code, "retired_environment", key);
    assert.match(result.error.message, new RegExp(key), key);
  }
});

test("MCP host preserves canonical agent-graph environment configuration", async () => {
  const result = await runAgentGraphTool(AGENT_GRAPH_TOOL_NAMES.parserGenerate, {
    descriptors: SOURCE_PARSER_DESCRIPTORS,
  }, {
    rootDir: process.cwd(),
    env: { AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT: path.join("data", "outputs", "agent-graph-test") },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
});
