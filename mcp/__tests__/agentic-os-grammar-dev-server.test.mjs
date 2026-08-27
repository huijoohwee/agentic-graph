import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { handleAgenticOsGrammarDevRpc } from "../../canvas/agenticOsGrammarDevServer.mjs";
import { AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME } from "../agentic-canvas-os-docs-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("local grammar forwarder projects all three source-backed invocation dictionaries", async () => {
  const initialized = await handleAgenticOsGrammarDevRpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, { rootDir: repoRoot });
  assert.equal(initialized.statusCode, 200);
  assert.ok(initialized.headers["mcp-session-id"]);

  const expectedTokens = {
    "/": "/superagent.run",
    "#": "#long-horizon-harness",
    "@": "@message-gateway",
  };
  for (const [query, expectedToken] of Object.entries(expectedTokens)) {
    const response = await handleAgenticOsGrammarDevRpc({
      jsonrpc: "2.0",
      id: query,
      method: "tools/call",
      params: {
        name: AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
        arguments: { query, limit: 500 },
      },
    }, {
      rootDir: repoRoot,
      sessionId: initialized.headers["mcp-session-id"],
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.result.structuredContent.absoluteDocsRoot, undefined);
    assert.match(response.body.result.structuredContent.sourceRevision, /^[0-9a-f]{40}$/);
    assert.equal(response.body.result.structuredContent.liveAgentProviderProof.status, "verified-bounded-live");
    assert.equal(response.body.result.structuredContent.progressiveAgentsReadiness.status, "runtime-ready-dev");
    assert.deepEqual(response.body.result.structuredContent.progressiveAgentsReadiness.growthStages, [
      "single-agent", "tool-enabled-agent", "specialist-workflow",
    ]);
    assert.equal(
      response.body.result.structuredContent.liveAgentProviderProof.proofRevision,
      "dae927d40f3e8e55687334ed47c2be5dffe14b36",
    );
    assert.ok(response.body.result.structuredContent.catalog.some(entry => entry.token === expectedToken));
  }

  for (const token of ["/agenticgraph.probe-tree", "#agenticgraph.probe-tree", "@agenticgraph.probe-tree"]) {
    const response = await handleAgenticOsGrammarDevRpc({
      jsonrpc: "2.0",
      id: token,
      method: "tools/call",
      params: {
        name: AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
        arguments: { query: token, limit: 10 },
      },
    }, {
      rootDir: repoRoot,
      sessionId: initialized.headers["mcp-session-id"],
    });
    const entry = response.body.result.structuredContent.catalog.find(candidate => candidate.token === token);
    assert.equal(response.statusCode, 200);
    assert.ok(entry, `expected docs-invoke MCP to resolve ${token}`);
    assert.match(entry.summary, /Probe-Tree|probe/i);
  }
});
