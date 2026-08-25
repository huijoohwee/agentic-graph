import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateCommission } from "../../src/commission/commission-evaluator.mjs";
import { projectVendorSplits } from "../../src/ledger/vendor-split-projector.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("knowgrph-native-marketplace-layer", 14, "Split Conservation Invariant"), () => {
  fc.assert(fc.property(
    fc.array(fc.record({ vendor: fc.integer({ min: 0, max: 5 }), amountMinor: fc.integer({ min: 1, max: 100_000 }) }), { minLength: 1, maxLength: 20 }),
    legs => {
      const settledTotalMinor = legs.reduce((sum, leg) => sum + leg.amountMinor, 0);
      const result = projectVendorSplits({
        bundleId: "bundle-property",
        legBreakdown: legs.map((leg, index) => ({ legId: `leg-${index}`, vendorId: `vendor-${leg.vendor}`, amountMinor: leg.amountMinor })),
        settledTotalMinor,
        currency: "SGD",
        vendorLookup: vendorId => ({ vendorId, settlementCurrency: "SGD", commissionRuleId: "rule", commissionRuleRevision: "r1",
          commissionRule: { commissionRuleId: "rule", revision: "r1", kind: "flat", bps: 250 } }),
        evaluate: evaluateCommission,
      });
      assert.equal(result.ok, true);
      assert.equal(result.splits.reduce((sum, split) => sum + split.grossAmountMinor, 0), settledTotalMinor);
    },
  ), propertyConfig(400));
});
