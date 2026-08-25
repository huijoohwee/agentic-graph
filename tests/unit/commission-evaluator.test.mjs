import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateCommission } from "../../src/commission/commission-evaluator.mjs";

const flatRule = bps => ({ commissionRuleId: "rule-flat", revision: "r1", kind: "flat", bps });
const tieredRule = {
  commissionRuleId: "rule-tiered",
  revision: "r2",
  kind: "tiered",
  tiers: [{ upToMinor: 1_000, bps: 100 }, { upToMinor: 5_000, bps: 200 }, { upToMinor: null, bps: 300 }],
};

test("commission evaluator handles flat, tier boundaries, zero, and full rates", () => {
  assert.deepEqual(evaluateCommission({ grossMinor: 10_000, rule: flatRule(250), currency: "SGD" }), {
    ok: true, commissionMinor: 250, netMinor: 9_750, ruleRevision: "r1",
  });
  assert.equal(evaluateCommission({ grossMinor: 1_000, rule: tieredRule, currency: "SGD" }).commissionMinor, 10);
  assert.equal(evaluateCommission({ grossMinor: 1_001, rule: tieredRule, currency: "SGD" }).commissionMinor, 20);
  assert.equal(evaluateCommission({ grossMinor: 5_000, rule: tieredRule, currency: "SGD" }).commissionMinor, 100);
  assert.equal(evaluateCommission({ grossMinor: 5_001, rule: tieredRule, currency: "SGD" }).commissionMinor, 150);
  assert.equal(evaluateCommission({ grossMinor: 100, rule: flatRule(0), currency: "SGD" }).commissionMinor, 0);
  assert.equal(evaluateCommission({ grossMinor: 100, rule: flatRule(10_000), currency: "SGD" }).netMinor, 0);
});

test("commission evaluator rejects invalid and unresolvable rules without a default", () => {
  assert.equal(evaluateCommission({ grossMinor: 0, rule: flatRule(1), currency: "SGD" }).reason, "invalid-gross-minor");
  assert.equal(evaluateCommission({ grossMinor: 1, rule: null, currency: "SGD" }).reason, "unresolvable-rule");
  assert.equal(evaluateCommission({ grossMinor: 1, rule: flatRule(10_001), currency: "SGD" }).reason, "rate-out-of-range");
  assert.equal(evaluateCommission({ grossMinor: 1, rule: { ...tieredRule, tiers: [] }, currency: "SGD" }).reason, "malformed-rule");
});
