import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VENDOR_LIFECYCLE_STATES,
  VENDOR_LIFECYCLE_TABLE,
  VENDOR_LIFECYCLE_TRANSITIONS,
  decideVendorTransition,
} from "../../src/marketplace/vendor-lifecycle-state.mjs";

test("vendor lifecycle accepts every declared transition", () => {
  for (const [currentState, transitions] of Object.entries(VENDOR_LIFECYCLE_TABLE)) {
    for (const [requestedTransition, nextState] of Object.entries(transitions)) {
      assert.deepEqual(decideVendorTransition(currentState, requestedTransition), {
        ok: true,
        currentState,
        requestedTransition,
        nextState,
      });
    }
  }
});

test("vendor lifecycle rejects every absent transition without changing state", () => {
  for (const currentState of VENDOR_LIFECYCLE_STATES) {
    for (const requestedTransition of VENDOR_LIFECYCLE_TRANSITIONS) {
      if (VENDOR_LIFECYCLE_TABLE[currentState][requestedTransition]) continue;
      assert.deepEqual(decideVendorTransition(currentState, requestedTransition), {
        ok: false,
        reason: "vendor-state-transition-rejected",
        currentState,
        requestedTransition,
      });
    }
  }
  assert.equal(Object.isFrozen(VENDOR_LIFECYCLE_TABLE), true);
});
