import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateCommission } from "../../src/commission/commission-evaluator.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("knowgrph-native-marketplace-layer", 16, "Commission Decomposition Invariant"), () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
    fc.integer({ min: 0, max: 10_000 }),
    (grossMinor, bps) => {
      const result = evaluateCommission({
        grossMinor,
        currency: "SGD",
        rule: { commissionRuleId: "rule", revision: "r1", kind: "flat", bps },
      });
      assert.equal(result.ok, true);
      assert.equal(result.commissionMinor + result.netMinor, grossMinor);
      assert.equal(result.commissionMinor >= 0 && result.commissionMinor <= grossMinor, true);
      assert.equal(result.netMinor >= 0, true);
    },
  ), propertyConfig(500));
});
