import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgentRegistry } from "../../src/registry/agent-registry.mjs";
import { validDefinition, validIntent } from "../support/fixtures.mjs";

const validation = { status: "pass", passResultId: "pass-1", contentHash: "hash-flight", schemaRevision: "schema-1" };

test("registry dispatches exactly one registered matching agent", () => {
  const registry = createAgentRegistry();
  registry.register(validDefinition(), validation);
  const outcome = registry.route(validIntent({ category: " Flights " }), { sessionId: "session-1" });
  assert.equal(outcome.status, "dispatch");
  assert.equal(outcome.agentId, "agent-flight");
  assert.equal(outcome.discoveryInput.category, "flights");
});

test("registry fails closed on ambiguous and missing categories", () => {
  const registry = createAgentRegistry();
  registry.register(validDefinition(), validation);
  registry.register(validDefinition({ agentId: "agent-shopping", contentHash: "hash-shopping" }), validation);
  assert.equal(registry.route(validIntent(), { sessionId: "session-1" }).reason, "ambiguous-category");
  assert.equal(registry.route(validIntent({ category: "hotels" }), { sessionId: "session-1" }).reason, "unmatched-category");
});

test("registry rejects unrecognized offer agents", () => {
  const registry = createAgentRegistry();
  const result = registry.admitOffer({ agentId: "missing", offer: { offerId: "offer-1" } }, { sessionId: "session-1" });
  assert.deepEqual(result, { status: "fail-closed", reason: "unrecognized-agent" });
});
