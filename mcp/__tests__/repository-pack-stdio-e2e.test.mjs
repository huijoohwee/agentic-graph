import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Ajv2020 from "ajv/dist/2020.js";

import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const execFileAsync = promisify(execFile);
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("local stdio MCP lists and runs repository packing with metadata-only zero-cost output", async (t) => {
  const repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-pack-stdio-"));
  t.after(() => fs.rm(repositoryRoot, { recursive: true, force: true }));
  await execFileAsync("git", ["init", "-q", repositoryRoot]);
  await fs.writeFile(path.join(repositoryRoot, "hello.md"), "# Hello from stdio\n", "utf8");
  await execFileAsync("git", ["-C", repositoryRoot, "add", "hello.md"]);

  const client = new Client({ name: "repository-pack-stdio-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(sourceRoot, "mcp", "server.js")],
    cwd: sourceRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      AGENTIC_OS_ROOT: repositoryRoot,
      AGENTIC_OS_EXTERNAL_MCP_PROFILES_JSON: "",
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });

  try {
    await client.connect(transport, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const listed = await client.listTools(undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const descriptor = listed.tools.find((entry) => entry.name === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.repositoryPack);
    assert.ok(descriptor, stderr);
    assert.equal(descriptor.inputSchema.additionalProperties, false);
    assert.deepEqual(Object.keys(descriptor.inputSchema.properties), [
      "repositoryPath",
      "outputDirectory",
      "includePaths",
      "excludePaths",
      "maxFiles",
      "maxFileBytes",
      "maxTotalBytes",
    ]);
    assert.deepEqual(descriptor.annotations, {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    const validateOutput = new Ajv2020({ strict: false }).compile(descriptor.outputSchema);

    const called = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.repositoryPack,
      arguments: {},
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(called.isError, false, stderr);
    assert.equal(validateOutput(called.structuredContent), true, new Ajv2020().errorsText(validateOutput.errors));
    assert.equal(called.structuredContent.ok, true);
    assert.equal(called.structuredContent.networkCalls, 0);
    assert.equal(called.structuredContent.modelCalls, 0);
    assert.equal(called.structuredContent.inputTokens, 0);
    assert.equal(called.structuredContent.outputTokens, 0);
    assert.equal(called.structuredContent.costUsd, 0);
    assert.equal("content" in called.structuredContent, false);
    assert.match(called.structuredContent.artifactPath, /^data\/outputs\/repository-packs\/[0-9a-f]{64}\.md$/u);
    assert.equal(path.basename(called.structuredContent.artifactPath), `${called.structuredContent.artifactSha256}.md`);
    assert.equal(JSON.stringify(called.structuredContent).includes(repositoryRoot), false);

    const rejected = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.repositoryPack,
      arguments: { excludePaths: ["../escape"] },
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(rejected.isError, true);
    assert.equal(validateOutput(rejected.structuredContent), true, new Ajv2020().errorsText(validateOutput.errors));
    assert.equal(rejected.structuredContent.error.code, "INVALID_ARGUMENTS");
    assert.equal(JSON.stringify(rejected.structuredContent).includes(repositoryRoot), false);
  } finally {
    await client.close().catch(() => undefined);
  }
});
