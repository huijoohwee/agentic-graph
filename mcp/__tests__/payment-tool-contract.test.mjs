import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowgrphLocalMcpToolDefinitions } from "../local-tool-contract.js";
import {
  PAYMENT_APPROVAL_GATE_ID,
  PAYMENT_TOOL_NAMES,
  PAYMENT_TOOL_NAME_VALUES,
  buildPaymentToolDefinitions,
} from "../payment-tool-contract.js";

const EXPECTED_PAYMENT_TOOL_NAMES = [
  "knowgrph.payment.rail.select",
  "knowgrph.payment.intent.create",
  "knowgrph.payment.status",
  "knowgrph.payment.event.settle",
  "knowgrph.payment.reconcile",
  "knowgrph.payment.receipt.project",
  "knowgrph.payment.refund",
  "knowgrph.payment.readiness",
];

const READ_TOOLS = new Set([
  PAYMENT_TOOL_NAMES.railSelect,
  PAYMENT_TOOL_NAMES.status,
  PAYMENT_TOOL_NAMES.receiptProject,
  PAYMENT_TOOL_NAMES.readiness,
]);

test("payment MCP contract registers the eight canonical tool identities exactly once", () => {
  const paymentDefinitions = buildPaymentToolDefinitions();
  const localDefinitions = buildKnowgrphLocalMcpToolDefinitions()
    .filter((definition) => definition.name.startsWith("knowgrph.payment."));

  assert.deepEqual(PAYMENT_TOOL_NAME_VALUES, EXPECTED_PAYMENT_TOOL_NAMES);
  assert.deepEqual(paymentDefinitions.map((definition) => definition.name), EXPECTED_PAYMENT_TOOL_NAMES);
  assert.deepEqual(localDefinitions.map((definition) => definition.name), EXPECTED_PAYMENT_TOOL_NAMES);
  assert.equal(new Set(localDefinitions.map((definition) => definition.name)).size, 8);
  assert.equal(localDefinitions.every((definition) => definition.description.startsWith("Use this when")), true);
  assert.equal(localDefinitions.every((definition) => definition.securitySchemes?.[0]?.type === "noauth"), true);
});

test("payment MCP descriptors are closed, zero-model typed contracts with accurate side-effect annotations", () => {
  for (const definition of buildPaymentToolDefinitions()) {
    assert.equal(definition.inputSchema.additionalProperties, false, definition.name);
    assert.equal(definition.outputSchema.additionalProperties, false, definition.name);
    assert.ok(definition.outputSchema.required.includes("modelCallCount"), definition.name);
    assert.equal(definition.outputSchema.properties.modelCallCount.const, 0, definition.name);
    assert.equal(definition.outputSchema.properties.modelCostUsd.const, 0, definition.name);

    if (READ_TOOLS.has(definition.name)) {
      assert.deepEqual(definition.annotations, {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      });
    } else {
      assert.deepEqual(definition.annotations, {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
        idempotentHint: true,
      });
      const approvalProperty = definition.inputSchema.properties.approvalToken;
      assert.equal(approvalProperty.properties.gateId.const, PAYMENT_APPROVAL_GATE_ID);
    }
  }
});

test("status result schema permits only the four public payment fields", () => {
  const status = buildPaymentToolDefinitions()
    .find((definition) => definition.name === PAYMENT_TOOL_NAMES.status);
  const resultSchema = status.outputSchema.properties.result.anyOf[0];

  assert.deepEqual(Object.keys(resultSchema.properties), [
    "intentId",
    "state",
    "amountMinor",
    "currency",
  ]);
  assert.equal(resultSchema.properties.state.enum.includes("refunded"), true);
  assert.equal(resultSchema.additionalProperties, false);
});
