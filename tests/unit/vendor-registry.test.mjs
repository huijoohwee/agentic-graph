import assert from "node:assert/strict";
import { test } from "node:test";

import { createVendorRegistry } from "../../src/marketplace/vendor-registry.mjs";

const ruleKey = "commission_rule:rule-1:r1";
const candidate = {
  vendorId: "vendor-1",
  displayName: "Vendor One",
  lifecycleState: "active",
  commissionRuleId: "rule-1",
  commissionRuleRevision: "r1",
  settlementCurrency: "SGD",
};

function registry(rule = { kind: "flat", bps: 250 }) {
  return createVendorRegistry({
    commissionRuleLookup: key => key === ruleKey ? rule : null,
    clock: () => "2026-08-22T00:00:00.000Z",
  });
}

test("vendor registry validates references and forces pending review", () => {
  const accepted = registry();
  assert.equal(accepted.register(candidate).status, "registered");
  assert.equal(accepted.get("vendor-1").lifecycleState, "pending_review");
  const rejected = registry(null).register(candidate);
  assert.equal(rejected.status, "reject");
  assert.equal(rejected.violations[0].reason, "commission-rule-unresolvable");
});

test("vendor registry delegates transitions and exposes distinct dispatch verdicts", () => {
  const value = registry();
  value.register(candidate);
  assert.deepEqual(value.dispatchVerdict("vendor-1"), { allowed: false, reason: "vendor-pending-review" });
  assert.equal(value.transition("vendor-1", "approve", "operator-1").to, "approved");
  assert.deepEqual(value.dispatchVerdict("vendor-1"), { allowed: false, reason: "vendor-approved" });
  assert.equal(value.transition("vendor-1", "activate", "operator-1").to, "active");
  assert.deepEqual(value.dispatchVerdict("vendor-1"), { allowed: true });
  assert.equal(value.transition("vendor-1", "suspend", "operator-1").to, "suspended");
  assert.deepEqual(value.dispatchVerdict("vendor-1"), { allowed: false, reason: "vendor-suspended" });
  assert.equal(value.transition("vendor-1", "reinstate", "").reason, "operator-reference-required");
});
