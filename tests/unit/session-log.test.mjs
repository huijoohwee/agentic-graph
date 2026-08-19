import assert from "node:assert/strict";
import { test } from "node:test";

import { createSessionLogStore } from "../../src/registry/session-log.mjs";

test("session log appends monotonic per-session seq and reads ordered entries", () => {
  const store = createSessionLogStore();
  store.append("session-1", { eventType: "routing", intentId: "intent-1", agentId: null, recordedAt: "2026-08-19T00:00:00.000Z" });
  store.append("session-1", { eventType: "gate-pass", offerId: "offer-1", agentId: "agent-1", recordedAt: "2026-08-19T00:00:01.000Z" });
  assert.deepEqual(store.readOrdered("session-1").map((entry) => entry.seq), [1, 2]);
});

test("session log requires agent ids for payment-adjacent events", () => {
  const store = createSessionLogStore();
  assert.throws(
    () => store.append("session-1", { eventType: "issuance", offerId: "offer-1", agentId: "", recordedAt: "2026-08-19T00:00:00.000Z" }),
    /requires a non-empty agentId/,
  );
});
