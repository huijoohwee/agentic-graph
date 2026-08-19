import assert from "node:assert/strict";
import { test } from "node:test";

import { revalidateDefinitions, shouldBlockOnSchemaRevision } from "../../src/registry/revalidation.mjs";
import { validDefinition } from "../support/fixtures.mjs";

test("revalidation blocks stale or rejected definitions", async () => {
  assert.equal(shouldBlockOnSchemaRevision(validDefinition(), "schema-2"), true);
  const results = await revalidateDefinitions([validDefinition()], async () => ({ status: "reject", violations: [{ fieldId: "schema", reason: "invalid" }] }));
  assert.equal(results[0].blocked, true);
});
