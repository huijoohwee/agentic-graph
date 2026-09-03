import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("local stdio MCP discovers and executes the full SME risk-copilot path at zero cost", async () => {
  const client = new Client({ name: "agentic-graph-sme-risk-copilot-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      AGENTIC_OS_ROOT: repoRoot,
      AGENTIC_OS_PYTHON: String(process.env.AGENTIC_OS_PYTHON || "python3"),
    },
    stderr: "pipe",
  });
  let stderrText = "";
  transport.stderr?.on("data", (chunk) => { stderrText += String(chunk); });

  try {
    await client.connect(transport, { timeout: 10_000 });
    const listed = await client.listTools(undefined, { timeout: 10_000 });
    const names = new Set(listed.tools.map((tool) => tool.name));
    for (const name of [
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.smeSourceNormalize,
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.smeTriggerEvaluate,
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.smeBrokerDraftNudge,
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.smeMarketplaceMatch,
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.smeMultilingualAdapt,
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.smeCareAgentStatus,
    ]) assert.equal(names.has(name), true, `missing ${name}; stderr=${stderrText}`);

    const normalized = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.smeSourceNormalize,
      arguments: { profile: { profile_id: "synthetic-growth", industry: "logistics", size: 12, growth_stage: "growth" } },
    }, undefined, { timeout: 10_000 });
    assert.equal(normalized.isError, false, stderrText);
    assert.equal(normalized.structuredContent?.ok, true);
    assert.equal(normalized.structuredContent?.cost_log?.estimated_cost_usd, 0);

    const trigger = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.smeTriggerEvaluate,
      arguments: { reg_delta: { changes: [{ element: "node", milestone: "first_hire", source_field: "size", operation: "added" }] } },
    }, undefined, { timeout: 10_000 });
    assert.equal(trigger.isError, false, stderrText);
    assert.equal(trigger.structuredContent?.trigger_event?.rule_id, "first-hire");
    assert.equal(trigger.structuredContent?.cost_log?.estimated_cost_usd, 0);

    const nudge = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.smeBrokerDraftNudge,
      arguments: { trigger_event: trigger.structuredContent?.trigger_event, target_lang: "ms" },
    }, undefined, { timeout: 10_000 });
    assert.equal(nudge.isError, false, stderrText);
    assert.equal(nudge.structuredContent?.approval_state, "pending");
    assert.deepEqual(nudge.structuredContent?.send_events, []);

    const localized = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.smeMultilingualAdapt,
      arguments: { text: nudge.structuredContent?.nudge_draft, target_lang: "ms", adapter_available: false },
    }, undefined, { timeout: 10_000 });
    assert.equal(localized.isError, false, stderrText);
    assert.equal(localized.structuredContent?.lang, "en-SG");
    assert.ok(localized.structuredContent?.fallback_reason);

    const matched = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.smeMarketplaceMatch,
      arguments: {
        approved_gap_id: "synthetic-first-hire",
        gap: { domain: trigger.structuredContent?.trigger_event?.domain },
        approval_token: { gateId: "sme-marketplace-match", issuedAt: Date.now(), consumed: false, verified: true, tokenId: "stdio-e2e" },
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(matched.isError, false, stderrText);
    assert.equal(matched.structuredContent?.approval_state, "approved");
    assert.ok(matched.structuredContent?.handoff_packet?.id);
    assert.equal(matched.structuredContent?.cost_log?.estimated_cost_usd, 0);

    const status = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.smeCareAgentStatus,
      arguments: { view: "capabilities" },
    }, undefined, { timeout: 10_000 });
    assert.equal(status.isError, false, stderrText);
    assert.equal(status.structuredContent?.ok, true);
    assert.equal(status.structuredContent?.mutation_performed, false);
    assert.equal(status.structuredContent?.cost_log?.estimated_cost_usd, 0);
  } finally {
    await client.close().catch(() => undefined);
  }
});
