import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgentRegistry } from "../../src/registry/agent-registry.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";
import { validIntent } from "../support/fixtures.mjs";

test(tag("agentic-graph-agentic-commerce-platform", 11, "No_Match Totality"), () => {
  fc.assert(
    fc.property(fc.option(fc.string(), { nil: undefined }), (category) => {
      const registry = createAgentRegistry();
      const outcome = registry.route(validIntent({ category }), { sessionId: "session-property" });
      assert.equal(outcome.status, "no-match");
      assert.equal(typeof outcome.reason, "string");
      assert.equal(registry.sessionLog.readOrdered("session-property").filter((entry) => entry.eventType === "routing").length, 1);
    }),
    propertyConfig(300),
  );
});
