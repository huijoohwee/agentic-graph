import assert from "node:assert/strict";
import { test } from "node:test";

import { createPayoutDispatchCoordinator } from "../../src/payout/payout-dispatch-coordinator.mjs";
import { createSessionLogStore } from "../../src/registry/session-log.mjs";

const split = { splitId: "split-1", bundleId: "bundle-1", vendorId: "vendor-1", sessionId: "session-1",
  netPayoutAmountMinor: 950, settlementCurrency: "SGD" };

function harness({ vendorVerdict = { allowed: true }, railResults = [{ ok: true, settlementRef: "settlement-1" }] } = {}) {
  const sessionLog = createSessionLogStore();
  const calls = [];
  let now = 1_800_000_000_000;
  const coordinator = createPayoutDispatchCoordinator({
    sessionLog,
    vendorRegistry: { dispatchVerdict: () => vendorVerdict },
    railPort: { async dispatch(request) { calls.push(request); return railResults.shift() ?? railResults.at(-1); } },
    clock: () => now,
  });
  return { coordinator, sessionLog, calls, advance: milliseconds => { now += milliseconds; } };
}

function verifySettlement(sessionLog) {
  sessionLog.append("session-1", { eventType: "settlement-verified", splitId: "split-1", bundleId: "bundle-1", agentId: null,
    recordedAt: "2026-08-22T00:00:00.000Z" });
}

test("payout coordinator blocks absent settlement and inactive vendors", async () => {
  const absent = harness();
  assert.equal((await absent.coordinator.attempt(split)).terminalReason, "settlement-verification-absent");
  assert.equal(absent.calls.length, 0);
  const inactive = harness({ vendorVerdict: { allowed: false, reason: "vendor-approved" } });
  verifySettlement(inactive.sessionLog);
  assert.equal((await inactive.coordinator.attempt(split)).terminalReason, "vendor-approved");
  assert.equal(inactive.calls.length, 0);
});

test("payout coordinator requires verification for the exact split", async () => {
  const value = harness();
  value.sessionLog.append("session-1", {
    eventType: "settlement-verified",
    splitId: "split-sibling",
    bundleId: "bundle-1",
    agentId: null,
    recordedAt: "2026-08-22T00:00:00.000Z",
  });
  const result = await value.coordinator.attempt(split);
  assert.equal(result.terminalReason, "settlement-verification-absent");
  assert.equal(value.calls.length, 0);
});

test("payout coordinator settles once and returns the prior result", async () => {
  const value = harness();
  verifySettlement(value.sessionLog);
  const first = await value.coordinator.attempt(split);
  const replay = await value.coordinator.attempt(split);
  assert.equal(first.state, "settled");
  assert.deepEqual(replay, first);
  assert.equal(value.calls.length, 1);
  assert.equal(value.calls[0].idempotencyKey, "marketplace-payout:split-1");
});

test("payout coordinator reuses its key and trips the unchanged-result breaker", async () => {
  const failure = { ok: false, retryable: true, reason: "rail-busy" };
  const value = harness({ railResults: [failure, failure] });
  verifySettlement(value.sessionLog);
  assert.equal((await value.coordinator.attempt(split)).state, "pending");
  value.advance(30_000);
  const terminal = await value.coordinator.attempt(split);
  assert.equal(terminal.state, "failed");
  assert.equal(terminal.terminalReason, "unchanged-result-circuit-breaker");
  assert.equal(value.calls[0].idempotencyKey, value.calls[1].idempotencyKey);
});
