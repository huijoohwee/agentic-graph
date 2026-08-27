import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { EXPORT_PUBLISH_CONTRACT_VERSION } from "../export-publish-contract.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("local stdio MCP lists export.publish and fails closed before egress without credentials", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-export-stdio-"));
  const ledgerPath = path.join(tempRoot, "FLEET.md");
  const client = new Client({ name: "agenticgraph-export-stdio-e2e", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      AGENTICGRAPH_ROOT: repoRoot,
      AGENTICGRAPH_EXPORT_FLEET_PATH: ledgerPath,
      AGENTICGRAPH_GOOGLE_ACCESS_TOKEN: "",
      AGENTICGRAPH_GOOGLE_CLIENT_ID: "",
      AGENTICGRAPH_GOOGLE_CLIENT_SECRET: "",
      AGENTICGRAPH_GOOGLE_REFRESH_TOKEN: "",
      AGENTICGRAPH_GOOGLE_SERVICE_ACCOUNT_JSON: "",
      AGENTICGRAPH_MICROSOFT_ACCESS_TOKEN: "",
      AGENTICGRAPH_MICROSOFT_CLIENT_ID: "",
      AGENTICGRAPH_MICROSOFT_REFRESH_TOKEN: "",
    },
    stderr: "pipe",
  });
  let stderrText = "";
  transport.stderr?.on("data", (chunk) => { stderrText += String(chunk); });

  try {
    await client.connect(transport, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const listed = await client.listTools(undefined, { timeout: 10_000 });
    const tool = listed.tools.find((entry) => entry.name === "export.publish");
    assert.ok(tool, `missing export.publish; stderr=${stderrText}`);
    assert.deepEqual(tool.inputSchema.required, ["artifact_id", "kind"]);
    assert.deepEqual(tool.inputSchema.properties?.kind?.enum, ["spreadsheet", "slides"]);
    assert.equal(tool.annotations?.readOnlyHint, false);
    assert.equal(tool.annotations?.destructiveHint, true);
    assert.equal(tool.annotations?.openWorldHint, true);
    assert.equal(tool.annotations?.idempotentHint, false);

    const result = await client.callTool({
      name: "export.publish",
      arguments: {
        artifact_id: "docs/documents/agenticgraph-docs-sheets-slides-prd-tad.md",
        kind: "spreadsheet",
      },
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.equal(result.structuredContent?.schema, EXPORT_PUBLISH_CONTRACT_VERSION);
    assert.equal(result.structuredContent?.error?.code, "PROVIDER_NOT_CONFIGURED");
    assert.equal(await fs.stat(ledgerPath).then(() => true).catch(() => false), false);
  } finally {
    await client.close().catch(() => undefined);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
