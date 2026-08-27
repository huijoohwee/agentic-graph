import assert from "node:assert/strict";
import { test } from "node:test";

import { validateAgentDefinition } from "../../src/registry/definition-validator.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";
import { validDefinition } from "../support/fixtures.mjs";

test(tag("agenticgraph-agentic-commerce-platform", 5, "Agent Definition Round Trip"), () => {
  fc.assert(
    fc.asyncProperty(fc.string({ minLength: 1, maxLength: 20 }), async (agentId) => {
      const definition = validDefinition({ agentId, contentHash: `hash-${agentId}` });
      const reparsed = JSON.parse(JSON.stringify(definition));
      assert.deepEqual(reparsed, definition);
      assert.deepEqual(await validateAgentDefinition(definition), await validateAgentDefinition(reparsed));
    }),
    propertyConfig(300),
  );
});
