import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgentRegistry } from "../../src/registry/agent-registry.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";
import { validDefinition, validIntent } from "../support/fixtures.mjs";

test(tag("agentic-graph-agentic-commerce-platform", 2, "Registration Gate Invariant"), () => {
  fc.assert(
    fc.property(fc.boolean(), (hasPass) => {
      const registry = createAgentRegistry();
      const validation = hasPass ? { status: "pass", passResultId: "pass-1", contentHash: "hash-flight", schemaRevision: "schema-1" } : { status: "reject", violations: [{ fieldId: "agentId", reason: "invalid" }] };
      registry.register(validDefinition(), validation);
      const outcome = registry.route(validIntent(), { sessionId: "session-property" });
      assert.equal(outcome.status === "dispatch", hasPass);
    }),
    propertyConfig(200),
  );
});
