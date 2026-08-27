import assert from "node:assert/strict";
import { test } from "node:test";

import { createPayoutDispatchCoordinator } from "../../src/payout/payout-dispatch-coordinator.mjs";
import { createSessionLogStore } from "../../src/registry/session-log.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("agenticgraph-native-marketplace-layer", 19, "Payout Dispatch Idempotence"), async () => {
  await fc.assert(fc.asyncProperty(fc.integer({ min: 2, max: 20 }), async repeats => {
    const sessionLog = createSessionLogStore();
    sessionLog.append("session", { eventType: "settlement-verified", splitId: "split", bundleId: "bundle", agentId: null,
      recordedAt: "2026-08-22T00:00:00.000Z" });
    let movements = 0;
    const coordinator = createPayoutDispatchCoordinator({
      sessionLog,
      vendorRegistry: { dispatchVerdict: () => ({ allowed: true }) },
      railPort: { async dispatch() { movements += 1; return { ok: true, settlementRef: "settled" }; } },
      clock: () => 1_800_000_000_000,
    });
    const split = { splitId: "split", bundleId: "bundle", vendorId: "vendor", sessionId: "session",
      netPayoutAmountMinor: 1, settlementCurrency: "SGD" };
    const outcomes = [];
    for (let index = 0; index < repeats; index += 1) outcomes.push(await coordinator.attempt(split));
    assert.equal(movements, 1);
    assert.equal(outcomes.every(outcome => outcome.state === "settled"), true);
  }), propertyConfig(200));
});
