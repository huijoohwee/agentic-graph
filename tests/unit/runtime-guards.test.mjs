import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateDeployOperation } from "../../src/runtime/deploy-boundary.mjs";
import { issueAfterOrderingCheck } from "../../src/runtime/payment-caller-guard.mjs";
import { REQUIRED_CONFIG_KEYS, validateStartupConfig } from "../../src/runtime/startup-config.mjs";
import { createSessionLogStore } from "../../src/registry/session-log.mjs";
import { createMockStraitsXClient } from "../support/mocks/payment-clients.mjs";

test("startup config fails closed and names missing keys", () => {
  const result = validateStartupConfig({});
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingKeys, REQUIRED_CONFIG_KEYS);
});

test("deploy boundary rejects production mutations", () => {
  assert.equal(evaluateDeployOperation({ capability: "environment mutate", targetBoundary: "Cloudflare_Routes" }).ok, false);
  assert.equal(evaluateDeployOperation({ capability: "local write", targetBoundary: "Dev_Lane" }).ok, true);
});

test("payment caller guard allows only issuance service after ordered evidence", () => {
  const store = createSessionLogStore();
  store.append("session-1", { eventType: "gate-pass", offerId: "offer-1", agentId: "agent-1", recordedAt: "2026-08-19T00:00:00.000Z" });
  store.append("session-1", { eventType: "human-confirm", offerId: "offer-1", agentId: "agent-1", recordedAt: "2026-08-19T00:00:01.000Z" });
  const client = createMockStraitsXClient();
  assert.equal(issueAfterOrderingCheck({ caller: "Other", sessionEntries: [], offerId: "offer-1", paymentClient: client, payload: {} }).status, "fail-closed");
  assert.equal(issueAfterOrderingCheck({ caller: "Issuance_Service", sessionEntries: store.readOrdered("session-1"), offerId: "offer-1", paymentClient: client, payload: {} }).status, "issued");
});
