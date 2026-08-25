import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgenticCommerceRuntime } from "../../src/registry/wiring.mjs";

test("native marketplace reconstructs register-to-payout from stored rows", async () => {
  let railCalls = 0;
  const runtime = createAgenticCommerceRuntime({
    commissionRules: [{ commissionRuleId: "rule-1", revision: "r1", kind: "flat", bps: 500 }],
    payoutRailPort: { async dispatch({ splitId }) { railCalls += 1; return { ok: true, settlementRef: `settled:${splitId}` }; } },
    marketplaceClock: () => 1_800_000_000_000,
    marketplaceIsoClock: () => "2026-08-22T00:00:00.000Z",
  });
  for (const vendorId of ["vendor-a", "vendor-b"]) {
    assert.equal(runtime.marketplace.registerVendor({
      vendorId,
      displayName: vendorId,
      commissionRuleId: "rule-1",
      commissionRuleRevision: "r1",
      settlementCurrency: "SGD",
    }).status, "registered");
    runtime.marketplace.transitionVendor({ vendorId, requestedTransition: "approve", actor: "operator-1", sessionId: "session-1" });
    runtime.marketplace.transitionVendor({ vendorId, requestedTransition: "activate", actor: "operator-1", sessionId: "session-1" });
  }
  const projected = runtime.marketplace.projectSplits({
    sessionId: "session-1",
    bundleId: "bundle-1",
    legBreakdown: [
      { legId: "leg-a", vendorId: "vendor-a", amountMinor: 400 },
      { legId: "leg-b", vendorId: "vendor-b", amountMinor: 600 },
    ],
    settledTotalMinor: 1_000,
    currency: "SGD",
  });
  runtime.marketplace.recordSettlementVerification({
    sessionId: "session-1",
    bundleId: "bundle-1",
    splitIds: projected.splits.map(split => split.splitId),
  });
  const payouts = await runtime.marketplace.dispatchPayouts("session-1", projected.splits);
  const canvas = runtime.marketplace.settlementCanvas();

  assert.equal(railCalls, 2);
  assert.equal(payouts.every(payout => payout.state === "settled"), true);
  assert.equal(canvas.rows.length, 2);
  const evidence = {
    vendors: runtime.marketplace.vendorRegistry.list(),
    splits: projected.splits,
    payouts: runtime.marketplace.payoutCoordinator.all(),
    events: runtime.marketplace.sessionLog.readOrdered("session-1"),
  };
  for (const split of evidence.splits) {
    const payout = evidence.payouts.find(record => record.splitId === split.splitId);
    assert.equal(typeof payout.settlementReference, "string");
    assert.equal(evidence.events.some(event => event.splitId === split.splitId && event.eventType === "payout-settled"), true);
    assert.equal(split.grossAmountMinor, split.commissionAmountMinor + split.netPayoutAmountMinor);
  }
});
