import assert from "node:assert/strict";
import { test } from "node:test";

import { AgentDefinitionCache } from "../agent-definition-cache.mjs";

test("Agent Definition lookups use memory and KV and invalidate only for registration changes", async () => {
  const values = new Map();
  const writes = [];
  const kv = {
    async get(key) { return values.get(key) ?? null; },
    async put(key, value, options) {
      writes.push({ key, options });
      values.set(key, value);
    },
  };
  const parse = (value) => JSON.parse(value).map((definition) => Object.freeze({
    ...definition,
    declaredToolAllowlist: Object.freeze(["discoverOffers"]),
    trustStatus: "declared-and-present",
    schemaRevision: "agenticgraph.travel-discovery/v1",
    contentHash: `runtime:${definition.agentId}`,
  }));
  const initial = parse(JSON.stringify([{ agentId: "agent-flight", declaredCategory: "flight" }]));
  const registered = parse(JSON.stringify([
    { agentId: "agent-flight", declaredCategory: "flight" },
    { agentId: "agent-hotel", declaredCategory: "hotel" },
  ]));

  const warm = new AgentDefinitionCache();
  const initialResult = await warm.resolve(initial, kv);
  assert.equal(initialResult.ok, true);
  assert.equal(initialResult.source, "configuration");
  assert.equal(initialResult.invalidation, "initial-registration");
  const memory = await warm.resolve(initial, kv);
  assert.equal(memory.source, "memory");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].options, undefined, "definition cache must not expire on a timer");

  const cold = new AgentDefinitionCache();
  const fromKv = await cold.resolve(initial, kv);
  assert.equal(fromKv.source, "kv");
  assert.equal(writes.length, 1);

  const afterRegistration = await cold.resolve(registered, kv);
  assert.equal(afterRegistration.invalidation, "registration");
  assert.equal(writes.length, 2);
  const afterDeregistration = await cold.resolve(initial, kv);
  assert.equal(afterDeregistration.invalidation, "deregistration");
  assert.equal(writes.length, 3);
});
