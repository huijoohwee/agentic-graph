import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateCommission } from "../../src/commission/commission-evaluator.mjs";
import { projectVendorSplits } from "../../src/ledger/vendor-split-projector.mjs";

const rule = { commissionRuleId: "rule", revision: "r1", kind: "flat", bps: 500 };
const vendors = new Map(["a", "b"].map(vendorId => [vendorId, {
  vendorId,
  settlementCurrency: "SGD",
  commissionRuleId: "rule",
  commissionRuleRevision: "r1",
  commissionRule: rule,
}]));

function project(overrides = {}) {
  return projectVendorSplits({
    bundleId: "bundle-1",
    legBreakdown: [
      { legId: "leg-1", vendorId: "a", amountMinor: 200 },
      { legId: "leg-2", vendorId: "b", amountMinor: 300 },
      { legId: "leg-3", vendorId: "b", amountMinor: 500 },
    ],
    settledTotalMinor: 1_000,
    currency: "SGD",
    vendorLookup: vendorId => vendors.get(vendorId) ?? null,
    evaluate: evaluateCommission,
    ...overrides,
  });
}

test("split projector emits one deterministic row per vendor and one bundle event", () => {
  const result = project();
  assert.equal(result.ok, true);
  assert.deepEqual(result.splits.map(split => [split.vendorId, split.coveredLegIds, split.grossAmountMinor]), [
    ["a", ["leg-1"], 200],
    ["b", ["leg-2", "leg-3"], 800],
  ]);
  assert.deepEqual(result.event, { eventType: "split-committed", bundleId: "bundle-1", splitCount: 2 });
  for (const split of result.splits) {
    assert.equal(split.grossAmountMinor, split.commissionAmountMinor + split.netPayoutAmountMinor);
  }
});

test("split projector aborts invalid, unresolved, and mixed-currency inputs", () => {
  assert.equal(project({ vendorLookup: () => null }).reason, "vendor-unresolvable");
  assert.equal(project({ vendorLookup: vendorId => ({ ...vendors.get(vendorId), settlementCurrency: "USD" }) }).reason, "vendor-unresolvable");
  assert.equal(project({ settledTotalMinor: 0 }).reason, "invalid-settled-total");
  assert.equal(project({ legBreakdown: [{ legId: "leg", vendorId: "a", amountMinor: 1.5 }] }).reason, "invalid-leg-breakdown");
});
