import assert from "node:assert/strict";
import { test } from "node:test";

import { hydrateAgenticOsDocument } from "../hydration.js";
import { snapshotWorld } from "../world.js";

function componentSchema(name, fields) {
  return {
    id: `schema:${name}`,
    label: name,
    type: "EcsComponentSchema",
    status: "ready",
    properties: { ecsComponent: { name, fields } },
  };
}

function entity(entityRef, components) {
  return {
    id: `entity:${entityRef}`,
    label: entityRef,
    type: "EcsEntity",
    status: "ready",
    properties: { ecsEntity: { entityRef, components } },
  };
}

function decisionNode(decisionId, payload = { accepted: true }) {
  return {
    id: `ecs-decision:${decisionId}`,
    label: decisionId,
    type: "EcsDecision",
    status: "recorded",
    properties: {
      ecsDecision: {
        decisionId,
        decisionType: "dialogue_outcome",
        entityRef: "npc.a",
        payload,
        producedAt: "2026-07-20T00:00:00.000Z",
      },
    },
  };
}

function document(nodes) {
  return { schema: "agentic-os-computing-flow/v1", flow: { nodes, edges: [] } };
}

test("Hydration validates first, sorts schemas/entities, and ignores unrelated nodes", () => {
  const input = document([
    entity("npc.z", { Position: { x: 9, y: 8 }, Vitality: { health: 7 } }),
    { id: "note", type: "MarkdownNote", properties: { anything: true } },
    componentSchema("Vitality", { health: "u16" }),
    entity("npc.a", { Position: { x: 1, y: 2 } }),
    componentSchema("Position", { x: "f32", y: "f32" }),
    decisionNode("dialogue-1"),
  ]);

  const result = hydrateAgenticOsDocument(input);
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshotWorld(result.world))), {
    components: [
      { name: "Position", fields: { x: "f32", y: "f32" } },
      { name: "Vitality", fields: { health: "u16" } },
    ],
    entities: [
      { entityId: 0, entityRef: "npc.a", components: { Position: { x: 1, y: 2 } } },
      {
        entityId: 1,
        entityRef: "npc.z",
        components: { Position: { x: 9, y: 8 }, Vitality: { health: 7 } },
      },
    ],
  });
  assert.deepEqual([...result.decisionIndex.keys()], ["dialogue-1"]);
  assert.equal(snapshotWorld(result.world).entities.length, 2);
});

test("byte-identical nested YAML hydrates to equal ephemeral Worlds", () => {
  const markdown = [
    "---",
    'kgSchema: "agentic-os-computing-flow/v1"',
    "flow:",
    "  nodes:",
    '    - id: "schema-position"',
    '      type: "EcsComponentSchema"',
    "      properties:",
    "        ecsComponent:",
    '          name: "Position"',
    "          fields:",
    '            x: "f32"',
    '            y: "f32"',
    '    - id: "entity-one"',
    '      type: "EcsEntity"',
    "      properties:",
    "        ecsEntity:",
    '          entityRef: "npc.one"',
    "          components:",
    "            Position:",
    "              x: 4",
    "              y: 5",
    "  edges: []",
    "---",
    "",
  ].join("\n");
  const first = hydrateAgenticOsDocument(markdown);
  const second = hydrateAgenticOsDocument(markdown);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(snapshotWorld(first.world), snapshotWorld(second.world));
});

test("an Entity may hydrate without attachments while schemas remain authoritative", () => {
  const result = hydrateAgenticOsDocument(
    document([componentSchema("Position", { x: "f32" }), entity("npc.unplaced", {})]),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshotWorld(result.world))).entities, [
    { entityId: 0, entityRef: "npc.unplaced", components: {} },
  ]);
});

test("duplicate schemas and entities fail closed with the unreadable reference", () => {
  const duplicateSchema = hydrateAgenticOsDocument(
    document([
      componentSchema("Position", { x: "f32" }),
      componentSchema("Position", { x: "f32" }),
      entity("npc.one", { Position: { x: 1 } }),
    ]),
  );
  assert.equal(duplicateSchema.ok, false);
  assert.equal(duplicateSchema.errorCode, "ECS_AGENTIC_OS_DUPLICATE_COMPONENT_SCHEMA");
  assert.equal(duplicateSchema.unreadableRef, "Position");

  const duplicateEntity = hydrateAgenticOsDocument(
    document([
      componentSchema("Position", { x: "f32" }),
      entity("npc.one", { Position: { x: 1 } }),
      entity("npc.one", { Position: { x: 2 } }),
    ]),
  );
  assert.equal(duplicateEntity.ok, false);
  assert.equal(duplicateEntity.errorCode, "ECS_AGENTIC_OS_DUPLICATE_ENTITY");
});

test("unknown components and missing, extra, or unrepresentable fields reject Hydration", () => {
  const cases = [
    {
      expected: "ECS_AGENTIC_OS_UNSUPPORTED_FIELD_TYPE",
      nodes: [componentSchema("Position", { x: "string" }), entity("npc", { Position: { x: 1 } })],
    },
    {
      expected: "ECS_AGENTIC_OS_UNKNOWN_COMPONENT",
      nodes: [componentSchema("Position", { x: "f32" }), entity("npc", { Missing: { x: 1 } })],
    },
    {
      expected: "ECS_AGENTIC_OS_COMPONENT_FIELDS_MISMATCH",
      nodes: [componentSchema("Position", { x: "f32", y: "f32" }), entity("npc", { Position: { x: 1 } })],
    },
    {
      expected: "ECS_AGENTIC_OS_COMPONENT_FIELDS_MISMATCH",
      nodes: [componentSchema("Position", { x: "f32" }), entity("npc", { Position: { x: 1, y: 2 } })],
    },
    {
      expected: "ECS_AGENTIC_OS_UNREPRESENTABLE_VALUE",
      nodes: [componentSchema("Health", { value: "u8" }), entity("npc", { Health: { value: 256 } })],
    },
  ];
  for (const fixture of cases) {
    const result = hydrateAgenticOsDocument(document(fixture.nodes));
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, fixture.expected);
  }
});

test("missing ECS schemas/entities and duplicate decision audit entries are rejected", () => {
  const noSchemas = hydrateAgenticOsDocument(document([entity("npc", { Position: { x: 1 } })]));
  assert.equal(noSchemas.errorCode, "ECS_AGENTIC_OS_COMPONENT_SCHEMAS_REQUIRED");

  const noEntities = hydrateAgenticOsDocument(document([componentSchema("Position", { x: "f32" })]));
  assert.equal(noEntities.errorCode, "ECS_AGENTIC_OS_ENTITIES_REQUIRED");

  const conflict = hydrateAgenticOsDocument(
    document([
      componentSchema("Position", { x: "f32" }),
      entity("npc.a", { Position: { x: 1 } }),
      decisionNode("same", { value: 1 }),
      decisionNode("same", { value: 2 }),
    ]),
  );
  assert.equal(conflict.errorCode, "ECS_AGENTIC_OS_DUPLICATE_DECISION");

  const identical = hydrateAgenticOsDocument(
    document([
      componentSchema("Position", { x: "f32" }),
      entity("npc.a", { Position: { x: 1 } }),
      decisionNode("same"),
      decisionNode("same"),
    ]),
  );
  assert.equal(identical.errorCode, "ECS_AGENTIC_OS_DUPLICATE_DECISION");
});

test("Hydration rejects calendar-invalid persisted Decision timestamps", () => {
  const invalidDecision = decisionNode("bad-date");
  invalidDecision.properties.ecsDecision.producedAt = "2026-02-31T00:00:00.000Z";
  const result = hydrateAgenticOsDocument(
    document([
      componentSchema("Position", { x: "f32" }),
      entity("npc.a", { Position: { x: 1 } }),
      invalidDecision,
    ]),
  );
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "ECS_DECISION_INVALID_TIMESTAMP");
});
