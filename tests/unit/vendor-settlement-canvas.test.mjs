import assert from "node:assert/strict";
import { test } from "node:test";

import { projectVendorSettlementCanvas, renderVendorSettlementCanvas } from "../../src/marketplace/vendor-settlement-canvas.mjs";

const vendors = [{ vendorId: "vendor-1", lifecycleState: "active", commissionRuleRevision: "r1", contentHash: "hash-1" }];
const payouts = [{ vendorId: "vendor-1", state: "pending", contentHash: "payout-hash" }];

test("vendor settlement canvas projects stored rows and complete render fields", () => {
  const projection = projectVendorSettlementCanvas(vendors, payouts);
  assert.equal(projection.rows.length, vendors.length);
  assert.deepEqual(projection.rows[0].value, {
    vendorId: "vendor-1",
    lifecycleState: "active",
    commissionRuleRevision: "r1",
    outstandingPayoutPosition: "pending",
  });
  const rendered = renderVendorSettlementCanvas(projection, { widthCssPx: 360 });
  assert.equal(rendered.hasHorizontalOverflow, false);
  assert.equal(rendered.rows[0].element, "article");
  assert.deepEqual(rendered.rows[0].fields.map(field => field.key), [
    "vendorId", "lifecycleState", "commissionRuleRevision", "outstandingPayoutPosition",
  ]);
});

test("vendor settlement canvas refuses non-operator scope", () => {
  assert.deepEqual(projectVendorSettlementCanvas(vendors, payouts, { subscriptionScope: "Shopper_Scope" }), {
    ok: false,
    reason: "operator-scope-required",
  });
});
