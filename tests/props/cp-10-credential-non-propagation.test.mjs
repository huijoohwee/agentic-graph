import assert from "node:assert/strict";
import { test } from "node:test";

import { assertPaymentCaller } from "../../src/runtime/payment-caller-guard.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("agenticgraph-agentic-commerce-platform", 10, "Credential Non-Propagation"), () => {
  fc.assert(
    fc.property(fc.dictionary(fc.string({ minLength: 1, maxLength: 12 }), fc.string()), (payload) => {
      const crossingPayload = Object.fromEntries(Object.entries(payload).filter(([key]) => !/credential|secret|token|password/i.test(key)));
      assert.equal(Object.keys(crossingPayload).some((key) => /credential|secret|token|password/i.test(key)), false);
      assert.equal(assertPaymentCaller("Issuance_Service").ok, true);
      assert.equal(assertPaymentCaller("Agent_Registry").ok, false);
    }),
    propertyConfig(300),
  );
});
