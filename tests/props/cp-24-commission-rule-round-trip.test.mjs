import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateCommission } from "../../src/commission/commission-evaluator.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("agenticgraph-native-marketplace-layer", 24, "Commission Rule Round Trip"), () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 1_000_000_000 }),
    fc.integer({ min: 0, max: 10_000 }),
    (grossMinor, bps) => {
      const rule = { commissionRuleId: "stored-rule", revision: "stored-revision", kind: "flat", bps };
      const stored = evaluateCommission({ grossMinor, currency: "SGD", rule });
      const replay = evaluateCommission({ grossMinor, currency: "SGD", rule: JSON.parse(JSON.stringify(rule)) });
      assert.deepEqual(replay, stored);
    },
  ), propertyConfig(300));
});
