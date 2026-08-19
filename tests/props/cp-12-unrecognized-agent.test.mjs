import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgentRegistry } from "../../src/registry/agent-registry.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("knowgrph-agentic-commerce-platform", 12, "Unrecognized Agent Identifier Rejection"), () => {
  fc.assert(
    fc.property(fc.string(), (agentId) => {
      const registry = createAgentRegistry();
      const result = registry.admitOffer({ agentId, offer: { offerId: "offer-1" } }, { sessionId: "session-property" });
      assert.deepEqual(result, { status: "fail-closed", reason: "unrecognized-agent" });
    }),
    propertyConfig(300),
  );
});
