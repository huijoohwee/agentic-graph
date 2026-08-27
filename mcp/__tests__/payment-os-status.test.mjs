import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PAYMENT_TOOL_NAME_VALUES } from "../payment-tool-contract.js";
import {
  listCapabilityRegistry,
  runOsStatusTool,
} from "../os-status-runtime.js";

test("OS capability discovery assigns every canonical payment tool to the payments harness", async () => {
  const registry = await listCapabilityRegistry({ cloudflareMcpUrl: "" });
  const payments = registry.entries.filter((entry) => entry.owningHarness === "payments");

  assert.deepEqual(payments.map((entry) => entry.toolId), [...PAYMENT_TOOL_NAME_VALUES].sort());
  assert.equal(payments.every((entry) => entry.sourceCatalogs.includes("local_mcp")), true);
});

test("rail_readiness is typed, read-only, zero-model, and fail-closed without evidence", async () => {
  const result = await runOsStatusTool("rail_readiness", {}, {
    env: {
      PAYMENT_STRIPE_MODE: "sandbox",
      PAYMENT_STRIPE_SANDBOX_RESTRICTED_KEY: "rk_test_hidden",
      PAYMENT_STRIPE_MCP_SANDBOX_RESTRICTED_KEY: "rk_test_mcp_hidden",
      PAYMENT_STRIPE_SANDBOX_WEBHOOK_SECRET: "whsec_hidden",
      STRAITSX_ENABLED: "false",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.view, "rail_readiness");
  assert.deepEqual(result.rails.map((entry) => entry.rail), ["stripe", "straitsx"]);
  assert.equal(result.rails.every((entry) => entry.status === "blocked"), true);
  assert.ok(result.unavailableSources.some((entry) => entry.source === "stripe.sandboxSettlementVerified"));
  assert.equal(result.cost_log.model, "none");
  assert.equal(result.cost_log.prompt_tokens, 0);
  assert.equal(result.cost_log.completion_tokens, 0);
  assert.equal(result.cost_log.estimated_cost_usd, 0);
  assert.doesNotMatch(JSON.stringify(result), /rk_test_hidden|rk_test_mcp_hidden|whsec_hidden/);
});

test("agentic_purchase_readiness exposes only deterministic-local evidence", async () => {
  const result = await runOsStatusTool("agentic_purchase_readiness");

  assert.equal(result.ok, true);
  assert.equal(result.view, "agentic_purchase_readiness");
  assert.equal(result.boundary, "deterministic-local");
  assert.equal(result.readiness.runtimeReady, false);
  assert.equal(result.readiness.providerCallCount, 0);
  assert.ok(result.readiness.unavailableSources.includes("kycAccountGrant"));
  assert.ok(result.readiness.unavailableSources.includes("secureCardBroker"));
  assert.deepEqual(result.claims, {
    providerSandboxProven: false,
    browserProven: false,
    protectedIntegrationProven: false,
    deployed: false,
  });
  assert.equal(result.cost_log.model, "none");
  assert.equal(result.cost_log.estimated_cost_usd, 0);
});

test("cost_summary remains available after adding rail_readiness", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-payment-os-status-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));

  const result = await runOsStatusTool("cost_summary", {}, { rootDir });

  assert.equal(result.ok, true);
  assert.equal(result.view, "cost_summary");
  assert.equal(result.cost_log.model, "none");
  assert.equal(result.cost_log.estimated_cost_usd, 0);
});
