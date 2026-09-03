// CONNECTIVITY SMOKE — the MCP tool surface is reachable + enumerable over the
// Streamable HTTP transport (agentic-graph-acos-mcp-connector spec, task 9.3 / R14.1
// / design Mcp_Agent "Tool surface (R14.1, R14.4)": expose the Director tool +
// each stage tool to remote clients over MCP Streamable HTTP transport).
//
// WHAT THIS EXERCISES (ZERO live network/socket): an injectable IN-PROCESS
// Streamable HTTP transport seam wires a minimal MCP client to the deployed
// Worker's REAL code paths — `tools/list` -> `buildAgenticGraphMcpToolDefinitions`
// and `tools/call` -> `dispatchAgenticGraphMcpToolCall`. The same JSON-RPC envelope
// shape a remote client POSTs to airvio.co/agentic-graph/mcp is used here, so task
// 11.4 can swap the seam for a real `fetch` with no caller changes.
//
// REUSE-NOT-REBUILD: the seam reuses the integration harness's in-memory
// RUN_MANIFEST_STORE namespace (real DO class) and the Worker's shared dispatch
// + tool-surface modules.

import test from "node:test";
import assert from "node:assert/strict";

import {
  createInProcessStreamableHttpTransport,
  createStreamableHttpClient,
  MCP_STREAMABLE_HTTP_URL,
} from "./lib/in-process-tool-surface.mjs";

const EXPECTED_TOOLS = [
  "agentic-graph.video_remix.run",
  "agentic-graph.video_remix.research",
  "agentic-graph.video_remix.storyboard",
  "agentic-graph.video_remix.render",
  "agentic-graph.video_remix.publish",
  "agentic-graph.video_remix.checkout",
];

// --- 1. The tool surface is reachable + enumerable over Streamable HTTP ------

test("tools/list enumerates the full tool surface over the Streamable HTTP seam (R14.1)", async () => {
  const { transport, calls } = createInProcessStreamableHttpTransport();
  const client = createStreamableHttpClient(transport);

  const result = await client.listTools();

  // The transport was reached exactly once at the MCP Streamable HTTP endpoint.
  assert.equal(calls.length, 1, "exactly one Streamable HTTP request was made");
  assert.equal(calls[0].url, MCP_STREAMABLE_HTTP_URL);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body.method, "tools/list");

  // Every Director + stage tool is enumerable, each with input + output schema.
  assert.ok(Array.isArray(result.tools), "tools/list returns a tools array");
  const names = result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [...EXPECTED_TOOLS].sort(), "the full tool surface is listed");
  for (const tool of result.tools) {
    assert.ok(tool.inputSchema, `${tool.name} exposes an inputSchema (R14.4)`);
    assert.ok(tool.outputSchema, `${tool.name} exposes an outputSchema (R14.4)`);
  }
});

// --- 2. tools/call is routable across the same transport seam ----------------

test("tools/call reaches the Director through the Streamable HTTP seam", async () => {
  const { transport } = createInProcessStreamableHttpTransport();
  const client = createStreamableHttpClient(transport);

  const result = await client.callTool("agentic-graph.video_remix.run", {
    referenceUrl: "https://example.com/reference-video.mp4",
    brief: "Connectivity smoke: dry-run plan across the Streamable HTTP seam.",
    mode: "dry-run",
    budgetUsd: 10,
    approvals: [],
  });

  // The MCP result envelope shape a remote client receives.
  assert.ok(Array.isArray(result.content) && result.content.length >= 1, "content[] is returned");
  assert.equal(result.content[0].type, "text");
  const manifest = result.structuredContent;
  assert.ok(manifest && manifest.runId, "the Director produced a Run_Manifest runId");
  assert.equal(manifest.mode, "dry-run");
  assert.equal(result.isError, false, "a valid dry-run call is not an error");
});

test("a withheld (un-approved) stage tool is reachable but returns approval_required (R14.6)", async () => {
  const { transport } = createInProcessStreamableHttpTransport();
  const client = createStreamableHttpClient(transport);

  // No approvals[] -> the render gate is not approved: the surface is reachable
  // but the call is withheld at the McpAgent boundary with state unchanged.
  const result = await client.callTool("agentic-graph.video_remix.render", {
    shots: [{ shotId: "s1", prompt: "a shot" }],
    approvals: [],
  });

  assert.equal(result.isError, true, "the withheld stage call is surfaced as an error");
  assert.equal(result.structuredContent.status, "approval_required");
  assert.equal(result.structuredContent.paidProviderCalls, 0);
  assert.equal(result.structuredContent.runManifestStateChanged, false);
});

// --- 3. Transport-level robustness (still no network) ------------------------

test("an unknown JSON-RPC method is rejected by the transport seam", async () => {
  const { transport } = createInProcessStreamableHttpTransport();
  const response = await transport({
    url: MCP_STREAMABLE_HTTP_URL,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { jsonrpc: "2.0", id: 99, method: "tools/unknown", params: {} },
  });
  assert.ok(response.error, "an unknown method returns a JSON-RPC error");
  assert.equal(response.id, 99, "the JSON-RPC id is echoed back");
});

test("a malformed tools/call envelope is rejected without dispatch", async () => {
  const { transport } = createInProcessStreamableHttpTransport();
  const response = await transport({
    url: MCP_STREAMABLE_HTTP_URL,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { jsonrpc: "2.0", id: 7, method: "tools/call", params: {} },
  });
  assert.ok(response.error, "a params-less tools/call is rejected");
  assert.equal(response.id, 7);
});
