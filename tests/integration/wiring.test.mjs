import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgenticCommerceRuntime } from "../../src/registry/wiring.mjs";
import { validDefinition, validIntent } from "../support/fixtures.mjs";

test("runtime wires MCP registration, routing, and operator canvas", async () => {
  const runtime = createAgenticCommerceRuntime({ schemaProvider: () => ({ allowedTools: ["discoverOffers"] }) });
  const registered = await runtime.mcp("registerAgent", { definition: validDefinition() });
  assert.equal(registered.status, "registered");
  assert.equal((await runtime.mcp("routeIntent", { intent: validIntent(), sessionId: "session-1" })).status, "dispatch");
  assert.equal(runtime.registryCanvas().rows.length, 1);
});
