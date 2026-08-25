import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VENDOR_LIFECYCLE_STATES,
  VENDOR_LIFECYCLE_TABLE,
  VENDOR_LIFECYCLE_TRANSITIONS,
  decideVendorTransition,
} from "../../src/marketplace/vendor-lifecycle-state.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("knowgrph-native-marketplace-layer", 21, "Vendor Lifecycle Error Condition"), () => {
  fc.assert(fc.property(fc.constant(null), () => {
    for (const currentState of VENDOR_LIFECYCLE_STATES) {
      for (const requestedTransition of VENDOR_LIFECYCLE_TRANSITIONS) {
        if (VENDOR_LIFECYCLE_TABLE[currentState][requestedTransition]) continue;
        const result = decideVendorTransition(currentState, requestedTransition);
        assert.equal(result.ok, false);
        assert.equal(result.currentState, currentState);
      }
    }
  }), propertyConfig(100));
});
