import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Ajv2020 from "ajv/dist/2020.js";

import {
  PAYMENT_TOOL_NAMES,
  PAYMENT_TOOL_NAME_VALUES,
} from "../payment-tool-contract.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("existing stdio MCP discovers and dispatches the canonical payment surface", async () => {
  const client = new Client({ name: "knowgrph-payment-stdio-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      KNOWGRPH_ROOT: repoRoot,
      PAYMENT_STRIPE_MODE: "",
      PAYMENT_STRIPE_SANDBOX_RESTRICTED_KEY: "",
      PAYMENT_STRIPE_MCP_SANDBOX_RESTRICTED_KEY: "",
      PAYMENT_STRIPE_SANDBOX_WEBHOOK_SECRET: "",
      STRAITSX_ENABLED: "false",
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });

  try {
    await client.connect(transport, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const listed = await client.listTools(undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const paymentTools = listed.tools.filter((tool) => tool.name.startsWith("knowgrph.payment."));
    assert.deepEqual(paymentTools.map((tool) => tool.name), PAYMENT_TOOL_NAME_VALUES, stderr);
    assert.equal(paymentTools.length, 8);

    const readOnlyNames = new Set([
      PAYMENT_TOOL_NAMES.railSelect,
      PAYMENT_TOOL_NAMES.status,
      PAYMENT_TOOL_NAMES.receiptProject,
      PAYMENT_TOOL_NAMES.readiness,
    ]);
    for (const tool of paymentTools) {
      assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
      assert.equal(tool.outputSchema.additionalProperties, false, tool.name);
      assert.equal(tool.annotations.readOnlyHint, readOnlyNames.has(tool.name), tool.name);
      assert.equal(tool.annotations.openWorldHint, !readOnlyNames.has(tool.name), tool.name);
    }

    const outputValidators = new Map();
    const ajv = new Ajv2020({ strict: false });
    for (const tool of paymentTools) outputValidators.set(tool.name, ajv.compile(tool.outputSchema));
    const assertAdvertisedOutput = (toolName, payload) => {
      const validate = outputValidators.get(toolName);
      assert.equal(validate(payload), true, ajv.errorsText(validate.errors));
    };

    const readinessResult = await client.callTool({
      name: PAYMENT_TOOL_NAMES.readiness,
      arguments: {},
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(readinessResult.isError, false, stderr);
    assertAdvertisedOutput(PAYMENT_TOOL_NAMES.readiness, readinessResult.structuredContent);
    assert.equal(readinessResult.structuredContent.ok, true);
    assert.equal(readinessResult.structuredContent.result.rails.every((rail) => rail.status === "blocked"), true);
    assert.equal(readinessResult.structuredContent.modelCallCount, 0);
    assert.equal(readinessResult.structuredContent.providerCallCount, 0);

    const selectionResult = await client.callTool({
      name: PAYMENT_TOOL_NAMES.railSelect,
      arguments: {
        currency: "usd",
        settlementAsset: "fiat",
        readiness: { stripe: true, straitsx: false, xsgd: false },
        cardSettledCurrencies: ["usd"],
      },
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(selectionResult.isError, false, stderr);
    assertAdvertisedOutput(PAYMENT_TOOL_NAMES.railSelect, selectionResult.structuredContent);
    assert.equal(selectionResult.structuredContent.result.rail, "stripe");
    assert.equal(selectionResult.structuredContent.providerCallCount, 0);

    const rejectedMutation = await client.callTool({
      name: PAYMENT_TOOL_NAMES.intentCreate,
      arguments: {
        clientIntentKey: "43fc1da7-d8f9-4a62-b284-e701d336bf81",
        amountMinor: 1250,
        currency: "sgd",
        settlementAsset: "fiat",
        origin: "agent",
      },
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(rejectedMutation.isError, true, stderr);
    assertAdvertisedOutput(PAYMENT_TOOL_NAMES.intentCreate, rejectedMutation.structuredContent);
    assert.equal(rejectedMutation.structuredContent.error.code, "approval_missing");
    assert.equal(rejectedMutation.structuredContent.providerCallCount, 0);
    assert.equal(rejectedMutation.structuredContent.modelCallCount, 0);

    const osReadiness = await client.callTool({
      name: "knowgrph.os.status",
      arguments: { view: "rail_readiness" },
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(osReadiness.isError, false, stderr);
    assert.equal(osReadiness.structuredContent.view, "rail_readiness");
    assert.equal(osReadiness.structuredContent.cost_log.model, "none");
    assert.equal(osReadiness.structuredContent.cost_log.estimated_cost_usd, 0);
  } finally {
    await client.close().catch(() => undefined);
  }
});
