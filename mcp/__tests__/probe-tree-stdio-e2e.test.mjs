import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION } from "../../canvas/src/features/agent-ready/probeTreeContract.mjs";
import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("local stdio MCP fails closed with a Canvas-ready empty Probe-Tree response when no model is configured", async () => {
  const client = new Client({ name: "agentic-graph-probe-tree-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      AGENTIC_OS_ROOT: repoRoot,
      AGENTIC_OS_PROBE_TREE_MODEL: "",
    },
    stderr: "pipe",
  });
  let stderrText = "";
  transport.stderr?.on("data", (chunk) => { stderrText += String(chunk); });

  try {
    await client.connect(transport, { timeout: 10_000 });
    const listed = await client.listTools(undefined, { timeout: 10_000 });
    const tool = listed.tools.find((entry) => entry.name === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.probeGenerate);
    assert.ok(tool, `missing Probe-Tree tool; stderr=${stderrText}`);
    assert.equal(tool.inputSchema.properties?.k?.minimum, 2);
    assert.equal(tool.outputSchema?.required?.includes("response"), true);

    const result = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.probeGenerate,
      arguments: {
        thread_root_id: "care-agent",
        current_node_id: "widget-card",
        context_text: "Compare the selected care card across member goal, caregiver need, source evidence, and unresolved gap.",
        k: 3,
        recall_top_k: 0,
        token_budget: 1200,
      },
    }, undefined, { timeout: 10_000 });

    assert.equal(result.isError, false, stderrText);
    const payload = result.structuredContent;
    const surface = payload?.response?.structuredContent;
    assert.equal(surface?.contractVersion, PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION);
    assert.equal(surface?.widgets?.[0]?.id, "widget-card");
    assert.equal(payload?.ok, false);
    assert.equal(payload?.degraded, true);
    assert.equal(payload?.degraded_reason, "insufficient_user_input_context");
    assert.equal(surface?.cards?.length, 0);
    assert.equal(surface?.panels?.length, 1);
    assert.equal(payload?.cost_log?.model, "none");
    assert.equal(payload?.cost_log?.estimated_cost_usd, 0);
    assert.doesNotMatch(JSON.stringify(payload), /which relationship between|compare current evidence|resolve the dependency|choose the decision order/i);
  } finally {
    await client.close().catch(() => undefined);
  }
});

test("local stdio MCP does not echo authored alternatives without a model", async () => {
  const client = new Client({ name: "agentic-graph-probe-tree-no-echo-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      AGENTIC_OS_ROOT: repoRoot,
      AGENTIC_OS_PROBE_TREE_MODEL: "",
    },
    stderr: "pipe",
  });
  let stderrText = "";
  transport.stderr?.on("data", (chunk) => { stderrText += String(chunk); });

  try {
    await client.connect(transport, { timeout: 10_000 });
    const result = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.probeGenerate,
      arguments: {
        thread_root_id: "investment-comparison",
        current_node_id: "investment-widget",
        context_text: "/agentic-graph.probe-tree recommend invest in India, China, or SE Asia",
        k: 3,
        recall_top_k: 0,
        token_budget: 1200,
      },
    }, undefined, { timeout: 10_000 });

    assert.equal(result.isError, false, stderrText);
    const payload = result.structuredContent;
    const cards = payload?.response?.structuredContent?.cards;
    assert.equal(payload?.ok, false);
    assert.equal(payload?.degraded_reason, "insufficient_user_input_context");
    assert.equal(cards?.length, 0);
    assert.equal(payload?.cost_log?.model, "none");
    assert.doesNotMatch(JSON.stringify(cards), /recommend invest|which relationship between|scope choice|priority choice|compare current evidence|resolve the dependency|choose the decision order/i);
  } finally {
    await client.close().catch(() => undefined);
  }
});
