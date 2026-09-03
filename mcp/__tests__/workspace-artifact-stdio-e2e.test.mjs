import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("local stdio lists both tools and performs a digest-fenced import", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-artifact-stdio-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "workspace")); await fs.mkdir(path.join(root, "external"));
  const workspace = await fs.realpath(path.join(root, "workspace")); const external = await fs.realpath(path.join(root, "external"));
  await fs.mkdir(path.join(workspace, "guidelines"));
  const sourcePath = path.join(external, "source.md"); await fs.writeFile(sourcePath, "# stdio\n");
  const client = new Client({ name: "workspace-artifact-stdio-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [path.join(sourceRoot, "mcp", "server.js")], cwd: sourceRoot,
    env: {
      PATH: String(process.env.PATH || ""), HOME: String(process.env.HOME || ""), NODE_ENV: "test",
      AGENTIC_OS_ROOT: sourceRoot,
      AGENTIC_OS_WORKSPACE_ARTIFACT_ROOTS: JSON.stringify([workspace]),
      AGENTIC_OS_WORKSPACE_ARTIFACT_EXTERNAL_ROOTS: JSON.stringify([external]),
      AGENTIC_OS_EXTERNAL_MCP_PROFILES_JSON: "",
    }, stderr: "pipe",
  });
  let stderr = ""; transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await client.connect(transport, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const listed = await client.listTools(undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.ok(listed.tools.some(({ name }) => name === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.workspaceArtifactPlan), stderr);
    assert.ok(listed.tools.some(({ name }) => name === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.workspaceArtifactApply), stderr);
    const request = { operation: "import-file", workspaceRoot: workspace, path: "guidelines/imported.md", sourcePath };
    const planned = await client.callTool({ name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.workspaceArtifactPlan, arguments: request });
    assert.equal(planned.isError, false, stderr);
    const applied = await client.callTool({ name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.workspaceArtifactApply, arguments: { ...request, planDigest: planned.structuredContent.planDigest, operatorAuthorized: true } });
    assert.equal(applied.isError, false, stderr);
    assert.equal(await fs.readFile(path.join(workspace, "guidelines", "imported.md"), "utf8"), "# stdio\n");
    assert.deepEqual(applied.structuredContent.economics, { networkCalls: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 });
  } finally { await client.close().catch(() => undefined); }
});
