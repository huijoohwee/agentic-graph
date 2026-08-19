import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_RETRY_ATTEMPTS, MAX_RETRY_INTERVAL_MS, createPendingQueue } from "../../src/registry/pending-queue.mjs";

test("pending queue submits head-first and removes only acknowledged entries", () => {
  const queue = createPendingQueue("client-1");
  queue.append({ id: "first" });
  queue.append({ id: "second" });
  assert.equal(queue.submitHead(() => ({ acknowledged: true })).entry.change.id, "first");
  assert.deepEqual(queue.pendingEntries().map((entry) => entry.change.id), ["second"]);
});

test("pending queue bounds retry and retains unavailable entries", () => {
  const queue = createPendingQueue("client-1");
  queue.append({ id: "first" });
  for (let i = 0; i < MAX_RETRY_ATTEMPTS; i += 1) {
    assert.equal(queue.submitHead(() => ({ acknowledged: false })).nextRetryMs, MAX_RETRY_INTERVAL_MS);
  }
  const unavailable = queue.submitHead(() => ({ acknowledged: true }));
  assert.equal(unavailable.status, "unavailable");
  assert.equal(queue.pendingEntries().length, 1);
});
