import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";

import { hydrateAgenticOsDocument } from "../hydration.js";
import { snapshotWorld } from "../world.js";

const RUNS = 100;

const nodes = Object.freeze([
  {
    id: "schema-vitality",
    type: "EcsComponentSchema",
    properties: { ecsComponent: { name: "Vitality", fields: { health: "u16" } } },
  },
  {
    id: "entity-z",
    type: "EcsEntity",
    properties: {
      ecsEntity: {
        entityRef: "npc.z",
        components: { Position: { x: 9, y: 8 }, Vitality: { health: 7 } },
      },
    },
  },
  { id: "unrelated", type: "MarkdownNote", properties: { text: "ignored" } },
  {
    id: "schema-position",
    type: "EcsComponentSchema",
    properties: { ecsComponent: { name: "Position", fields: { x: "f64", y: "f64" } } },
  },
  {
    id: "decision-existing",
    type: "EcsDecision",
    properties: {
      ecsDecision: {
        decisionId: "existing",
        decisionType: "world_tick_result",
        entityRef: "npc.a",
        payload: { accepted: true },
        producedAt: "2026-07-20T00:00:00.000Z",
      },
    },
  },
  {
    id: "entity-a",
    type: "EcsEntity",
    properties: {
      ecsEntity: { entityRef: "npc.a", components: { Position: { x: 1, y: 2 } } },
    },
  },
]);

function observe(result) {
  return {
    decisions: [...result.decisionIndex.entries()],
    world: JSON.parse(JSON.stringify(snapshotWorld(result.world))),
  };
}

const baseline = hydrateAgenticOsDocument({
  schema: "agentic-os-computing-flow/v1",
  flow: { nodes, edges: [] },
});
assert.equal(baseline.ok, true);
const expected = observe(baseline);

test("Property: equivalent ECS node permutations hydrate to equal observations", () => {
  const permutation = fc.uniqueArray(fc.integer({ min: 0, max: nodes.length - 1 }), {
    minLength: nodes.length,
    maxLength: nodes.length,
  });

  fc.assert(
    fc.property(permutation, (order) => {
      const result = hydrateAgenticOsDocument({
        schema: "agentic-os-computing-flow/v1",
        flow: { nodes: order.map((index) => nodes[index]), edges: [] },
      });
      assert.equal(result.ok, true);
      assert.deepEqual(observe(result), expected);
    }),
    { numRuns: RUNS },
  );
});
