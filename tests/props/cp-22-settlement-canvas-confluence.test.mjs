import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeVendorSettlementStates, projectVendorSettlementCanvas } from "../../src/marketplace/vendor-settlement-canvas.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("knowgrph-native-marketplace-layer", 22, "Settlement Canvas Confluence"), () => {
  fc.assert(fc.property(
    fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 12 }),
    fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 12 }),
    (leftIds, rightIds) => {
      const project = ids => projectVendorSettlementCanvas(ids.map(vendorId => ({
        vendorId, lifecycleState: "active", commissionRuleRevision: "r1", contentHash: `hash:${vendorId}`,
      })), []);
      const left = project(leftIds);
      const right = project(rightIds);
      const first = mergeVendorSettlementStates(left, right);
      const second = mergeVendorSettlementStates(right, left);
      assert.deepEqual(first.rows, second.rows);
      assert.deepEqual(mergeVendorSettlementStates(first, first).rows, first.rows);
    },
  ), propertyConfig(300));
});
