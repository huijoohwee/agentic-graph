import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgentRegistry } from "../../src/registry/agent-registry.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";
import { validDefinition } from "../support/fixtures.mjs";

const validation = { status: "pass", passResultId: "pass-1", contentHash: "hash", schemaRevision: "schema-1" };

test(tag("knowgrph-agentic-commerce-platform", 8, "Registration Idempotence"), () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 16 }), (agentId) => {
      const once = createAgentRegistry();
      const twice = createAgentRegistry();
      const definition = validDefinition({ agentId, contentHash: `hash-${agentId}` });
      once.register(definition, validation);
      twice.register(definition, validation);
      twice.register(definition, validation);
      assert.deepEqual(twice.listDefinitions(), once.listDefinitions());
    }),
    propertyConfig(200),
  );
});
