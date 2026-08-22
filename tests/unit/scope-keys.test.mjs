import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OPERATOR_SCOPE,
  agentDefinitionKey,
  commissionRuleKey,
  normalizeCategoryLabel,
  payoutKey,
  registryCanvasOperatorKey,
  registryPendingKey,
  routingEntryKey,
  sessionLogKey,
  vendorKey,
  vendorSettlementCanvasOperatorKey,
  vendorSplitKey,
} from "../../src/registry/scope-keys.mjs";

test("scope key constructors follow table_name:record_id", () => {
  assert.equal(agentDefinitionKey("agent-1"), "agent_definition:agent-1");
  assert.deepEqual(routingEntryKey(" Flights "), { ok: true, value: "routing_entry:flights", normalizedCategory: "flights" });
  assert.deepEqual(registryCanvasOperatorKey(OPERATOR_SCOPE), { ok: true, value: "registry_canvas:operator" });
  assert.equal(registryPendingKey("client-1"), "registry_pending:client-1");
  assert.equal(sessionLogKey("session-1"), "session_log:session-1");
  assert.equal(vendorKey("vendor-1"), "vendor:vendor-1");
  assert.equal(commissionRuleKey("rule-1", "r1"), "commission_rule:rule-1:r1");
  assert.equal(vendorSplitKey("bundle-1", "vendor-1"), "vendor_split:bundle-1:vendor-1");
  assert.equal(payoutKey("split-1"), "payout:split-1");
  assert.deepEqual(vendorSettlementCanvasOperatorKey(OPERATOR_SCOPE), {
    ok: true,
    value: "vendor_settlement_canvas:operator",
  });
});

test("operator canvas key is refused outside Operator_Scope", () => {
  for (const scope of ["Shopper_Scope", "Agent_Scope", "", null, undefined]) {
    assert.deepEqual(registryCanvasOperatorKey(scope), { ok: false, reason: "operator-scope-required" });
    assert.deepEqual(vendorSettlementCanvasOperatorKey(scope), { ok: false, reason: "operator-scope-required" });
  }
});

test("category normalization trims, case-folds, and rejects invalid labels", () => {
  assert.deepEqual(normalizeCategoryLabel("  ShOpPiNg  "), { ok: true, value: "shopping" });
  assert.deepEqual(normalizeCategoryLabel("旅行"), { ok: true, value: "旅行" });
  assert.equal(normalizeCategoryLabel("x".repeat(64)).ok, true);
  assert.deepEqual(normalizeCategoryLabel(""), { ok: false, reason: "invalid-category" });
  assert.deepEqual(normalizeCategoryLabel("   "), { ok: false, reason: "invalid-category" });
  assert.deepEqual(normalizeCategoryLabel("x".repeat(65)), { ok: false, reason: "invalid-category" });
});
