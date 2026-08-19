import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgentRegistry } from "../../src/registry/agent-registry.mjs";
import { handleMcpCommand } from "../../src/registry/mcp-surface.mjs";
import { validDefinition } from "../support/fixtures.mjs";

test("mcp surface exposes only supported registry commands", async () => {
  const registry = createAgentRegistry();
  const runtime = { registry, validator: async () => ({ status: "pass", passResultId: "pass-1", contentHash: "hash-flight", schemaRevision: "schema-1" }) };
  assert.equal((await handleMcpCommand("unsupported", {}, runtime)).status, "rejected");
  assert.equal((await handleMcpCommand("registerAgent", { definition: validDefinition() }, runtime)).status, "registered");
  assert.equal((await handleMcpCommand("listRegistry", {}, runtime)).definitions.length, 1);
});
