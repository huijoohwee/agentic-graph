import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgentRegistry } from "../../src/registry/agent-registry.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";
import { validDefinition, validIntent } from "../support/fixtures.mjs";

const validation = { status: "pass", passResultId: "pass-1", contentHash: "hash", schemaRevision: "schema-1" };

test(tag("agentic-graph-agentic-commerce-platform", 1, "Routing Exclusivity"), () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 3 }), (matchingAgents) => {
      const registry = createAgentRegistry();
      for (let i = 0; i < matchingAgents; i += 1) {
        registry.register(validDefinition({ agentId: `agent-${i}`, contentHash: `hash-${i}` }), validation);
      }
      const outcome = registry.route(validIntent(), { sessionId: "session-property" });
      assert.equal(outcome.status === "dispatch", matchingAgents === 1);
      assert.equal(registry.dispatches.length, matchingAgents === 1 ? 1 : 0);
    }),
    propertyConfig(200),
  );
});
