import assert from "node:assert/strict";
import { test } from "node:test";

import { validateAgentDefinition } from "../../src/registry/definition-validator.mjs";
import { validDefinition } from "../support/fixtures.mjs";

test("definition validator returns one pass verdict for a valid definition", async () => {
  const result = await validateAgentDefinition(validDefinition(), { schemaProvider: () => ({ allowedTools: ["discoverOffers"] }) });
  assert.equal(result.status, "pass");
  assert.equal(result.contentHash, "hash-flight");
});

test("definition validator names every malformed field", async () => {
  const result = await validateAgentDefinition({ agentId: "", trustStatus: "verified" });
  assert.equal(result.status, "reject");
  assert.deepEqual(
    [...new Set(result.violations.map((violation) => violation.fieldId))].sort(),
    ["agentId", "contentHash", "declaredCategory", "declaredToolAllowlist", "schemaRevision", "trustStatus"],
  );
});

test("definition validator rejects schema unavailability", async () => {
  const result = await validateAgentDefinition(validDefinition(), { schemaProvider: () => { throw new Error("offline"); } });
  assert.deepEqual(result, { status: "reject", violations: [{ fieldId: "schema", reason: "schema-unavailable" }] });
});
