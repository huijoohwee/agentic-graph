import assert from "node:assert/strict";
import { test } from "node:test";

import { createSessionLogStore, payoutOrderingVerdict } from "../../src/registry/session-log.mjs";

test("session log appends monotonic per-session seq and reads ordered entries", () => {
  const store = createSessionLogStore();
  store.append("session-1", { eventType: "routing", intentId: "intent-1", agentId: null, recordedAt: "2026-08-19T00:00:00.000Z" });
  store.append("session-1", { eventType: "gate-pass", offerId: "offer-1", agentId: "agent-1", recordedAt: "2026-08-19T00:00:01.000Z" });
  assert.deepEqual(store.readOrdered("session-1").map((entry) => entry.seq), [1, 2]);
});

test("session log accepts marketplace events and evaluates payout ordering", () => {
  const store = createSessionLogStore();
  store.append("session-1", { eventType: "settlement-verified", splitId: "split-1", bundleId: "bundle-1", agentId: null,
    recordedAt: "2026-08-22T00:00:00.000Z" });
  for (const eventType of ["payout-dispatched", "payout-settled"]) {
    store.append("session-1", { eventType, splitId: "split-1", bundleId: "bundle-1", vendorId: "vendor-1", agentId: null,
      recordedAt: "2026-08-22T00:00:01.000Z" });
  }
  store.append("session-1", { eventType: "vendor-activated", vendorId: "vendor-1", agentId: null,
    recordedAt: "2026-08-22T00:00:02.000Z" });
  store.append("session-1", { eventType: "split-committed", bundleId: "bundle-1", splitCount: 1, agentId: null,
    recordedAt: "2026-08-22T00:00:03.000Z" });
  assert.deepEqual(payoutOrderingVerdict(store.readOrdered("session-1"), "split-1"), {
    settlementVerifiedBeforeFirstDispatch: true,
    atMostOneSettledPayout: true,
    dispatchAllowed: true,
  });
});

test("session log rejects payout events without vendor identity", () => {
  const store = createSessionLogStore();
  for (const eventType of ["payout-dispatched", "payout-settled", "payout-failed"]) {
    assert.throws(() => store.append("session-1", { eventType, splitId: "split-1", agentId: null,
      recordedAt: "2026-08-22T00:00:00.000Z" }), /requires a non-empty vendorId/);
  }
});

test("session log requires agent ids for payment-adjacent events", () => {
  const store = createSessionLogStore();
  assert.throws(
    () => store.append("session-1", { eventType: "issuance", offerId: "offer-1", agentId: "", recordedAt: "2026-08-19T00:00:00.000Z" }),
    /requires a non-empty agentId/,
  );
});
