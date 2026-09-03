import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const toolNames = [
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.implementationRunPlan,
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.implementationRunStart,
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.implementationRunList,
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.implementationRunControl,
];

test("official SDK lists and invokes the four implementation-run tools over stdio", async (t) => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-run-stdio-"));
  t.after(() => fs.rm(runtimeRoot, { recursive: true, force: true }));
  const client = new Client({ name: "implementation-run-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: { PATH: String(process.env.PATH || ""), HOME: String(process.env.HOME || ""), NODE_ENV: "test", AGENTIC_OS_ROOT: runtimeRoot },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await client.connect(transport, { timeout: 10000 });
    const listed = await client.listTools(undefined, { timeout: 10000 });
    assert.deepEqual(listed.tools.filter((tool) => tool.name.startsWith("agentic-graph.implementation_run.")).map((tool) => tool.name), toolNames, stderr);
    assert.equal(listed.tools.find((tool) => tool.name === toolNames[0]).annotations.readOnlyHint, true);
    assert.equal(listed.tools.find((tool) => tool.name === toolNames[1]).annotations.readOnlyHint, false);

    const empty = await client.callTool({ name: toolNames[2], arguments: {} }, undefined, { timeout: 10000 });
    assert.equal(empty.isError, false, stderr);
    assert.deepEqual(empty.structuredContent.runs, []);
    const invalidPlan = await client.callTool({ name: toolNames[0], arguments: {} }, undefined, { timeout: 10000 });
    assert.equal(invalidPlan.isError, true);
    assert.equal(invalidPlan.structuredContent.error.code, "invalid_arguments");
    const invalidStart = await client.callTool({ name: toolNames[1], arguments: {} }, undefined, { timeout: 10000 });
    assert.equal(invalidStart.isError, true);
    assert.equal(invalidStart.structuredContent.error.code, "invalid_arguments");
    const invalidControl = await client.callTool({ name: toolNames[3], arguments: {} }, undefined, { timeout: 10000 });
    assert.equal(invalidControl.isError, true);
    assert.equal(invalidControl.structuredContent.error.code, "invalid_arguments");
  } finally { await client.close().catch(() => undefined); }
});
