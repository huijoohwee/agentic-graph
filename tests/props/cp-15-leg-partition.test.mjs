import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateCommission } from "../../src/commission/commission-evaluator.mjs";
import { projectVendorSplits } from "../../src/ledger/vendor-split-projector.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("agentic-graph-native-marketplace-layer", 15, "Leg Partition Invariant"), () => {
  fc.assert(fc.property(
    fc.array(fc.integer({ min: 0, max: 7 }), { minLength: 1, maxLength: 30 }),
    (vendorIndexes) => {
      const legBreakdown = vendorIndexes.map((vendor, index) => ({ legId: `leg-${index}`, vendorId: `vendor-${vendor}`, amountMinor: index + 1 }));
      const result = projectVendorSplits({
        bundleId: "bundle-property",
        legBreakdown,
        settledTotalMinor: 10_000,
        currency: "SGD",
        vendorLookup: vendorId => ({ vendorId, settlementCurrency: "SGD", commissionRuleId: "rule", commissionRuleRevision: "r1",
          commissionRule: { commissionRuleId: "rule", revision: "r1", kind: "flat", bps: 0 } }),
        evaluate: evaluateCommission,
      });
      const covered = result.splits.flatMap(split => split.coveredLegIds).sort();
      assert.deepEqual(covered, legBreakdown.map(leg => leg.legId).sort());
      assert.equal(new Set(covered).size, covered.length);
    },
  ), propertyConfig(300));
});
