import assert from "node:assert/strict";
import { test } from "node:test";

import { allocateMinorUnits } from "../../src/commission/minor-unit-allocation.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("agenticgraph-native-marketplace-layer", 17, "Integer-Only Amount Invariant"), () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 1_000_000_000 }),
    fc.array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 1, maxLength: 20 }),
    (totalMinor, rawWeights) => {
      const result = allocateMinorUnits({
        totalMinor,
        weights: rawWeights.map((weight, index) => ({ id: `vendor-${index}`, weight })),
      });
      assert.equal(result.ok, true);
      assert.equal(result.shares.reduce((sum, share) => sum + share.amountMinor, 0), totalMinor);
      assert.equal(result.shares.every(share => Number.isSafeInteger(share.amountMinor) && share.amountMinor >= 0), true);
    },
  ), propertyConfig(400));
});
