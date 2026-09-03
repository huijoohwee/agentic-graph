import assert from "node:assert/strict";
import { test } from "node:test";

import { validateAgentDefinition } from "../../src/registry/definition-validator.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("agentic-graph-agentic-commerce-platform", 9, "Malformed Definition Error Conditions"), () => {
  fc.assert(
    fc.asyncProperty(fc.array(fc.constantFrom("agentId", "declaredCategory", "declaredToolAllowlist", "trustStatus", "schemaRevision", "contentHash"), { minLength: 1 }), async (fields) => {
      const submitted = { agentId: "agent", declaredCategory: "flights", declaredToolAllowlist: ["discoverOffers"], trustStatus: "declared-and-present", schemaRevision: "schema-1", contentHash: "hash" };
      for (const field of new Set(fields)) {
        delete submitted[field];
      }
      const result = await validateAgentDefinition(submitted);
      assert.equal(result.status, "reject");
      for (const field of new Set(fields)) {
        assert.ok(result.violations.some((violation) => violation.fieldId === field));
      }
    }),
    propertyConfig(400),
  );
});
