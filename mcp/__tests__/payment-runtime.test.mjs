import assert from "node:assert/strict";
import test from "node:test";

import {
  PAYMENT_APPROVAL_GATE_ID,
  PAYMENT_TOOL_NAMES,
} from "../payment-tool-contract.js";
import {
  buildPaymentRailReadinessSnapshot,
  createPaymentRuntime,
} from "../payment-runtime.js";

const NOW = Date.parse("2026-07-29T04:00:00.000Z");
const VALID_APPROVAL_TOKEN = Object.freeze({
  tokenId: "approval-payment-1",
  gateId: PAYMENT_APPROVAL_GATE_ID,
  issuedAt: new Date(NOW).toISOString(),
  verified: true,
  consumed: false,
});

const paidMutationResult = () => ({
  ok: true,
  intent: {
    intentId: "pay_123",
    state: "paid",
    amountMinor: 1250,
    currency: "sgd",
  },
  rail: "stripe",
  instruction: null,
  idempotentReplay: false,
  operationReference: "op_123",
  providerCallCount: 1,
});

test("rail selection is deterministic and makes zero provider or model calls", async () => {
  const runtime = createPaymentRuntime({ env: {} });
  const input = {
    currency: "sgd",
    settlementAsset: "fiat",
    readiness: { stripe: true, straitsx: true, xsgd: false },
    cardSettledCurrencies: ["sgd", "usd"],
  };

  const first = await runtime.run(PAYMENT_TOOL_NAMES.railSelect, input);
  const second = await runtime.run(PAYMENT_TOOL_NAMES.railSelect, structuredClone(input));

  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.deepEqual(first.result, {
    rail: "straitsx",
    reason: "sgd_fiat",
    compatibleRails: ["stripe", "straitsx"],
  });
  assert.equal(first.providerCallCount, 0);
  assert.equal(first.modelCallCount, 0);
  assert.equal(first.modelCostUsd, 0);

  const unavailable = await runtime.run(PAYMENT_TOOL_NAMES.railSelect, {
    ...input,
    settlementAsset: "xsgd",
    readiness: { stripe: true, straitsx: true, xsgd: false },
  });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.error.code, "rail_unavailable");
  assert.deepEqual(unavailable.result, {
    rail: null,
    reason: "no_ready_compatible_rail",
    compatibleRails: ["straitsx"],
  });
  assert.equal(unavailable.providerCallCount, 0);
});

test("all payment mutations reject before their adapter when approval is absent", async () => {
  const adapterCalls = [];
  const adapter = async (args) => {
    adapterCalls.push(args);
    return paidMutationResult();
  };
  const runtime = createPaymentRuntime({
    now: NOW,
    adapters: {
      intentCreate: adapter,
      eventSettle: adapter,
      reconcile: adapter,
      refund: adapter,
    },
  });
  const calls = [
    [PAYMENT_TOOL_NAMES.intentCreate, { clientIntentKey: "43fc1da7-d8f9-4a62-b284-e701d336bf81" }],
    [PAYMENT_TOOL_NAMES.eventSettle, { intentId: "pay_123", rail: "stripe", eventId: "evt_123" }],
    [PAYMENT_TOOL_NAMES.reconcile, { intentId: "pay_123" }],
    [PAYMENT_TOOL_NAMES.refund, { intentId: "pay_123" }],
  ];

  for (const [toolName, args] of calls) {
    const result = await runtime.run(toolName, args);
    assert.equal(result.ok, false, toolName);
    assert.equal(result.error.code, "approval_missing", toolName);
    assert.equal(result.error.reason, "absent", toolName);
    assert.equal(result.providerCallCount, 0, toolName);
  }
  assert.deepEqual(adapterCalls, []);
});

test("a valid approval immediately precedes one adapter call and the token is not forwarded", async () => {
  const events = [];
  let receivedArgs;
  const runtime = createPaymentRuntime({
    now: NOW,
    verifyApproval: (token, options) => {
      events.push(`verify:${options.gateId}`);
      return { valid: token === VALID_APPROVAL_TOKEN, reason: null, gateId: options.gateId };
    },
    consumeApproval: async () => {
      events.push("consume");
    },
    adapters: {
      intentCreate: async (args) => {
        events.push("adapter");
        receivedArgs = args;
        return paidMutationResult();
      },
    },
  });

  const result = await runtime.run(PAYMENT_TOOL_NAMES.intentCreate, {
    clientIntentKey: "43fc1da7-d8f9-4a62-b284-e701d336bf81",
    amountMinor: 1250,
    currency: "sgd",
    settlementAsset: "fiat",
    origin: "agent",
    approvalToken: VALID_APPROVAL_TOKEN,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(events, [`verify:${PAYMENT_APPROVAL_GATE_ID}`, "adapter", "consume"]);
  assert.equal(Object.hasOwn(receivedArgs, "approvalToken"), false);
  assert.equal(
    receivedArgs.approvalRef,
    `${PAYMENT_APPROVAL_GATE_ID}:${VALID_APPROVAL_TOKEN.tokenId}`,
  );
  assert.deepEqual(result.result.intent, {
    intentId: "pay_123",
    state: "paid",
    amountMinor: 1250,
    currency: "sgd",
  });
  assert.equal(result.providerCallCount, 1);
  assert.equal(result.modelCallCount, 0);
});

test("StraitsX provider instructions project a usable allowlisted reference", async () => {
  const runtime = createPaymentRuntime({
    now: NOW,
    adapters: {
      intentCreate: async () => ({
        ...paidMutationResult(),
        intent: {
          intentId: "pay_123",
          state: "pending_provider",
          amountMinor: 1250,
          currency: "sgd",
        },
        rail: "straitsx",
        instruction: {
          kind: "provider_instruction",
          value: {
            id: "paynow_123",
            qrCodeData: "PAYNOW-QR-DATA",
            buyerEmail: "must-not-cross@example.com",
          },
        },
      }),
    },
  });

  const result = await runtime.run(PAYMENT_TOOL_NAMES.intentCreate, {
    clientIntentKey: "43fc1da7-d8f9-4a62-b284-e701d336bf81",
    amountMinor: 1250,
    currency: "sgd",
    settlementAsset: "fiat",
    origin: "agent",
    approvalToken: VALID_APPROVAL_TOKEN,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.result.instruction, {
    kind: "provider_instruction",
    reference: "PAYNOW-QR-DATA",
  });
  assert.doesNotMatch(JSON.stringify(result), /buyerEmail|must-not-cross/);
  assert.notEqual(result.result.instruction.reference, "[object Object]");
});

test("adapter exceptions stay buyer-safe and indeterminate", async () => {
  const runtime = createPaymentRuntime({
    now: NOW,
    adapters: {
      refund: async () => {
        throw new Error("sk_test_secret provider request req_private");
      },
    },
  });
  const result = await runtime.run(PAYMENT_TOOL_NAMES.refund, {
    intentId: "pay_123",
    approvalToken: VALID_APPROVAL_TOKEN,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "provider_outcome_unknown");
  assert.equal(result.providerCallCount, 1);
  assert.doesNotMatch(JSON.stringify(result), /sk_test_secret|req_private/);
});

test("read adapters expose only local status and receipt projections", async () => {
  const runtime = createPaymentRuntime({
    adapters: {
      status: async () => ({
        intentId: "pay_123",
        state: "paid",
        amountMinor: 1250,
        currency: "SGD",
        providerObjectId: "cs_secret",
        buyerEmail: "private@example.com",
      }),
      receiptProject: async () => ({
        document: "{\"intent_id\":\"pay_123\"}\n",
        recordCount: 1,
        providerSecret: "never expose",
      }),
    },
  });

  const status = await runtime.run(PAYMENT_TOOL_NAMES.status, { intentId: "pay_123" });
  assert.equal(status.ok, true);
  assert.deepEqual(Object.keys(status.result), ["intentId", "state", "amountMinor", "currency"]);
  assert.doesNotMatch(JSON.stringify(status), /cs_secret|private@example/);
  assert.equal(status.providerCallCount, 0);

  const receipt = await runtime.run(PAYMENT_TOOL_NAMES.receiptProject, { intentId: "pay_123" });
  assert.deepEqual(receipt.result, {
    document: "{\"intent_id\":\"pay_123\"}\n",
    recordCount: 1,
  });
  assert.equal(receipt.providerCallCount, 0);
});

test("refunded remains distinct from paid in the public status projection", async () => {
  const runtime = createPaymentRuntime({
    adapters: {
      status: async () => ({
        intentId: "pay_refunded",
        state: "refunded",
        amountMinor: 1250,
        currency: "sgd",
      }),
    },
  });

  const status = await runtime.run(PAYMENT_TOOL_NAMES.status, {
    intentId: "pay_refunded",
  });

  assert.equal(status.ok, true);
  assert.deepEqual(status.result, {
    intentId: "pay_refunded",
    state: "refunded",
    amountMinor: 1250,
    currency: "sgd",
  });
});

test("readiness reports credential names but never values and remains blocked without runtime evidence", () => {
  const secretValues = [
    "rk_test_runtime_never_leak",
    "rk_test_mcp_never_leak",
    "whsec_never_leak",
  ];
  const snapshot = buildPaymentRailReadinessSnapshot({
    env: {
      PAYMENT_STRIPE_MODE: "sandbox",
      PAYMENT_STRIPE_SANDBOX_RESTRICTED_KEY: secretValues[0],
      PAYMENT_STRIPE_MCP_SANDBOX_RESTRICTED_KEY: secretValues[1],
      PAYMENT_STRIPE_SANDBOX_WEBHOOK_SECRET: secretValues[2],
    },
  });
  const serialized = JSON.stringify(snapshot);
  const stripe = snapshot.rails.find((entry) => entry.rail === "stripe");

  assert.equal(stripe.enabled, true);
  assert.equal(stripe.runtimeReady, false);
  assert.equal(stripe.checks.buyerProductConfigured, false);
  assert.equal(stripe.checks.checkoutPriceAuthorityConfigured, false);
  assert.deepEqual(stripe.configuredCredentialNames, [
    "PAYMENT_STRIPE_SANDBOX_RESTRICTED_KEY",
    "PAYMENT_STRIPE_MCP_SANDBOX_RESTRICTED_KEY",
    "PAYMENT_STRIPE_SANDBOX_WEBHOOK_SECRET",
  ]);
  for (const secret of secretValues) assert.doesNotMatch(serialized, new RegExp(secret));
  assert.deepEqual(snapshot.capability.rails, ["stripe", "straitsx"]);
  assert.deepEqual(snapshot.capability.settlementAssets, ["fiat", "xsgd"]);
  assert.equal(snapshot.capability.schemaSource, "mcp_tools_list");
  assert.equal(snapshot.capability.transports.every((transport) => transport.localProxy === false), true);
});

test("readiness rejects unresolved StraitsX fund flow and server product authority", () => {
  const snapshot = buildPaymentRailReadinessSnapshot({
    env: {
      STRAITSX_ENABLED: "true",
      STRAITSX_MODE: "sandbox",
      STRAITSX_AUTHENTICATION_MODE: "api_key",
      STRAITSX_SANDBOX_APP_API_KEY: "sandbox-key",
      STRAITSX_SANDBOX_CALLBACK_SIGNING_SECRET: "callback-secret",
      STRAITSX_INTEGRATION_MODEL: "regular_transfer",
      STRAITSX_FUND_FLOW: "customer_third_party_collection",
      STRAITSX_PAYMENT_METHOD: "dynamic_paynow",
      STRAITSX_GRANTED_PRODUCTS: "dynamic_paynow",
      STRAITSX_PAYMENT_CREATE_PATH: "/v1/payments/paynow",
      STRAITSX_PAYMENT_READ_PATH_TEMPLATE: "/v1/payments/paynow/{paymentId}",
    },
    evidence: {
      straitsx: {
        providerContractBound: true,
        signingClockHealthy: true,
        helloVerified: true,
        providerReadVerified: true,
        sandboxSettlementVerified: true,
      },
    },
    rail: "straitsx",
  });
  const straitsx = snapshot.rails[0];

  assert.equal(straitsx.runtimeReady, false);
  assert.equal(straitsx.checks.buyerProductConfigured, false);
  assert.equal(straitsx.checks.fundFlowBound, true);
  assert.equal(straitsx.checks.integrationModelCompatible, false);
  assert.ok(snapshot.unavailableSources.some(
    (entry) => entry.source === "straitsx.integrationModelCompatible",
  ));
});
