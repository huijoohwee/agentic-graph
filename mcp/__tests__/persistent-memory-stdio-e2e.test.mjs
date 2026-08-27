import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { resolveAgenticCanvasOsDocsRoot } from "../agentic-canvas-os-docs-runtime.js";
import { mintPersistentMemoryAuthorization } from "../persistent-memory-authorization.js";
import { PERSISTENT_MEMORY_TOOL_NAMES } from "../persistent-memory-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const docsEnvironment = process.env.AGENTICGRAPH_AGENTIC_CANVAS_OS_DOCS_ROOT
  ? {
      AGENTICGRAPH_AGENTIC_CANVAS_OS_DOCS_ROOT: path.resolve(
        process.env.AGENTICGRAPH_AGENTIC_CANVAS_OS_DOCS_ROOT,
      ),
    }
  : {};
let docsRoot = "";
try {
  docsRoot = resolveAgenticCanvasOsDocsRoot({ rootDir: repoRoot, env: docsEnvironment });
} catch (error) {
  if (docsEnvironment.AGENTICGRAPH_AGENTIC_CANVAS_OS_DOCS_ROOT) throw error;
  docsRoot = "";
}
const docsAvailable = Boolean(docsRoot)
  && await fs.stat(path.join(docsRoot, "FACTS.md")).then(() => true, () => false);

const hostSecret = "persistent-memory-e2e-host-secret-32-bytes-minimum";

async function connectClient(stateDirectory) {
  const client = new Client({ name: "persistent-memory-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      AGENTICGRAPH_ROOT: repoRoot,
      AGENTICGRAPH_MEMORY_STATE_DIR: stateDirectory,
      AGENTICGRAPH_MEMORY_APPROVAL_HMAC_KEY: hostSecret,
      AGENTICGRAPH_AGENTIC_CANVAS_OS_DOCS_ROOT: docsRoot,
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });
  await client.connect(transport, { timeout: 10_000, maxTotalTimeout: 10_000 });
  return { client, stderr: () => stderr };
}

const scope = Object.freeze({
  tenant_id: "tenant-e2e",
  workspace_id: "workspace-e2e",
  agent_id: "agent-e2e",
  subject_id: "operator-e2e",
});

test("stdio MCP executes an exact ACOS tuple and recalls it after process restart", {
  skip: !docsAvailable,
}, async (t) => {
  const stateDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-persistent-memory-e2e-"));
  t.after(() => fs.rm(stateDirectory, { recursive: true, force: true }));

  const first = await connectClient(stateDirectory);
  let memoryId;
  let sourceRevision;
  try {
    const listed = await first.client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    for (const toolName of Object.values(PERSISTENT_MEMORY_TOOL_NAMES)) {
      assert.equal(names.has(toolName), true, `${toolName} missing\n${first.stderr()}`);
    }

    const docs = await first.client.callTool({
      name: "agenticgraph.agentic_canvas_os.docs.invoke",
      arguments: { token: "/memory.write" },
    });
    assert.equal(docs.isError, false, first.stderr());
    sourceRevision = docs.structuredContent.sourceRevision;

    const writeArguments = {
      scope,
      target: "memory",
      action: "add",
      content: "The release checklist requires a focused restart proof.",
      kind: "decision",
      tags: ["release", "restart-proof"],
      evidence: {
        source_type: "operator",
        source_id: "operator-e2e",
        excerpt: "The release checklist requires a focused restart proof.",
        explicit: true,
      },
      operator: { id: "operator-e2e", approved: true },
      expected_revision: 0,
      idempotency_key: "persistent-memory-e2e-write-0001",
    };
    const authorization = mintPersistentMemoryAuthorization({
      hostSecret,
      toolName: PERSISTENT_MEMORY_TOOL_NAMES.write,
      request: writeArguments,
    });
    const invoked = await first.client.callTool({
      name: PERSISTENT_MEMORY_TOOL_NAMES.invoke,
      arguments: {
        invocation:
          "/memory.write #persistent-memory #memory-capacity #vcc @memory-store @memory-entry @memory-policy @operator",
        source_revision: sourceRevision,
        arguments: {
          ...writeArguments,
          authorization_token: authorization.authorization_token,
        },
      },
    }, undefined, { timeout: 20_000, maxTotalTimeout: 20_000 });
    assert.equal(invoked.isError, false, JSON.stringify(invoked.structuredContent));
    assert.equal(invoked.structuredContent.ok, true);
    assert.equal(invoked.structuredContent.deploymentAttempted, false);
    assert.equal(invoked.structuredContent.result.authorization.status, "authorized");
    assert.match(invoked.structuredContent.result.authorization.receipt_digest, /^[a-f0-9]{64}$/);
    memoryId = invoked.structuredContent.result.entry.id;
  } finally {
    await first.client.close().catch(() => undefined);
  }

  const second = await connectClient(stateDirectory);
  try {
    const direct = await second.client.callTool({
      name: PERSISTENT_MEMORY_TOOL_NAMES.search,
      arguments: { scope, query: "restart proof", target: "memory", limit: 5 },
    });
    assert.equal(direct.isError, false, second.stderr());
    assert.equal(direct.structuredContent.results.some((entry) => entry.id === memoryId), true);
    assert.equal(direct.structuredContent.economics.model_calls, 0);
    assert.equal(JSON.stringify(direct.structuredContent).includes(stateDirectory), false);

    const invokedSearch = await second.client.callTool({
      name: PERSISTENT_MEMORY_TOOL_NAMES.invoke,
      arguments: {
        invocation: "/memory.search #memory-search #truth #vcc @agent @memory-store @operator",
        source_revision: sourceRevision,
        arguments: { scope, query: "release checklist", target: "memory", limit: 5 },
      },
    }, undefined, { timeout: 20_000, maxTotalTimeout: 20_000 });
    assert.equal(invokedSearch.isError, false, JSON.stringify(invokedSearch.structuredContent));
    assert.equal(
      invokedSearch.structuredContent.result.results.some((entry) => entry.id === memoryId),
      true,
    );
  } finally {
    await second.client.close().catch(() => undefined);
  }
});
