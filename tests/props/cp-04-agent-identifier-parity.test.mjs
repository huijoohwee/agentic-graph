import assert from "node:assert/strict";
import { test } from "node:test";

import { fc, propertyConfig, tag } from "../support/pbt.mjs";

function guardrailGate(offer) {
  return offer.amountMinor <= offer.budgetMinor ? "gate-pass" : "gate-fail";
}

test(tag("agentic-graph-agentic-commerce-platform", 4, "Agent-Identifier Parity"), () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 0, max: 100_000 }), (amountMinor, budgetMinor) => {
      const left = guardrailGate({ agentId: "agent-a", amountMinor, budgetMinor });
      const right = guardrailGate({ agentId: "agent-b", amountMinor, budgetMinor });
      assert.equal(left, right);
    }),
    propertyConfig(300),
  );
});
