import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateCommission } from "../../src/commission/commission-evaluator.mjs";
import { projectVendorSplits } from "../../src/ledger/vendor-split-projector.mjs";
import { serializeVendorSplitRows } from "../../src/ledger/vendor-split-records.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("agentic-graph-native-marketplace-layer", 18, "Split Reprojection Idempotence"), () => {
  fc.assert(fc.property(
    fc.array(fc.record({ vendor: fc.integer({ min: 0, max: 4 }), amountMinor: fc.integer({ min: 1, max: 10_000 }) }), { minLength: 1, maxLength: 15 }),
    legs => {
      const input = {
        bundleId: "bundle-property",
        legBreakdown: legs.map((leg, index) => ({ legId: `leg-${index}`, vendorId: `vendor-${leg.vendor}`, amountMinor: leg.amountMinor })),
        settledTotalMinor: 50_000,
        currency: "SGD",
        vendorLookup: vendorId => ({ vendorId, settlementCurrency: "SGD", commissionRuleId: "rule", commissionRuleRevision: "r1",
          commissionRule: { commissionRuleId: "rule", revision: "r1", kind: "flat", bps: 375 } }),
        evaluate: evaluateCommission,
      };
      assert.equal(serializeVendorSplitRows(projectVendorSplits(input).splits), serializeVendorSplitRows(projectVendorSplits({
        ...input,
        legBreakdown: input.legBreakdown.map(leg => ({ ...leg })),
      }).splits));
    },
  ), propertyConfig(300));
});
