import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import { projectWorldToCanvas } from "../renderingLayer.js";
import { query, worldTick } from "../index.js";
import { allocateEntity, createWorld, registerComponent, snapshotWorld } from "../world.js";

function createFixtureWorld(entityCount = 1) {
  const world = createWorld();
  registerComponent(world, "Position", { x: "f32", y: "f32" });
  for (let index = 0; index < entityCount; index += 1) {
    allocateEntity(world, {
      entityRef: `npc.${index}`,
      components: { Position: { x: index, y: index + 0.5 } },
    });
  }
  return world;
}

test("projectWorldToCanvas applies ephemeral AGENTIC_OS Markdown without mutating the World", async () => {
  const world = createFixtureWorld();
  const before = snapshotWorld(world);
  let applied = null;
  const result = await projectWorldToCanvas(world, {
    applyDocument: async (document) => {
      applied = document;
      return { ok: true };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.entityCount, 1);
  assert.deepEqual(applied, { name: result.name, text: result.text });
  assert.match(result.text, /kgSchema: "agentic-os-computing-flow\/v1"/);
  assert.match(result.text, /type: "EcsEntityProjection"/);
  assert.deepEqual(snapshotWorld(world), before);
});

test("projection renders [absent] for requested missing fields and keeps present data", async () => {
  const world = createFixtureWorld();
  const result = await projectWorldToCanvas(world, {
    applyDocument: async () => ({ ok: true }),
    projection: { components: [{ name: "Position", fields: ["x", "y", "z"] }] },
  });

  assert.equal(result.ok, true);
  assert.match(result.text, /"x":0/);
  assert.match(result.text, /"y":0\.5/);
  assert.match(result.text, /"z":"\[absent\]"/);
});

test("projection distinguishes present non-finite values from absent fields", async () => {
  const world = createWorld();
  registerComponent(world, "Metric", {
    nan: "f64",
    negativeInfinity: "f64",
    positiveInfinity: "f64",
  });
  allocateEntity(world, {
    entityRef: "metric.one",
    components: {
      Metric: {
        nan: Number.NaN,
        negativeInfinity: Number.NEGATIVE_INFINITY,
        positiveInfinity: Number.POSITIVE_INFINITY,
      },
    },
  });
  const result = await projectWorldToCanvas(world, {
    applyDocument: async () => true,
    projection: {
      components: [{
        name: "Metric",
        fields: ["nan", "negativeInfinity", "positiveInfinity", "missing"],
      }],
    },
  });

  assert.equal(result.ok, true);
  assert.match(result.text, /"nan":"\[NaN\]"/);
  assert.match(result.text, /"negativeInfinity":"\[-Infinity\]"/);
  assert.match(result.text, /"positiveInfinity":"\[Infinity\]"/);
  assert.match(result.text, /"missing":"\[absent\]"/);
});

test("projection preserves reserved component and field names as own data keys", async () => {
  const world = createWorld();
  const fieldSpec = Object.create(null);
  fieldSpec.__proto__ = "f64";
  registerComponent(world, "__proto__", fieldSpec);
  const values = Object.create(null);
  values.__proto__ = 42;
  const components = Object.create(null);
  components.__proto__ = values;
  allocateEntity(world, { entityRef: "reserved.keys", components });

  const result = await projectWorldToCanvas(world, {
    applyDocument: async () => true,
  });
  assert.equal(result.ok, true);
  assert.match(result.text, /"components":\{"__proto__":\{"__proto__":42\}\}/);
});

test("apply-path failure is structured and leaves the read-only snapshot unchanged", async () => {
  const world = createFixtureWorld();
  const before = snapshotWorld(world);
  const result = await projectWorldToCanvas(world, {
    applyDocument: async () => {
      throw new Error("injected Canvas failure");
    },
  });

  assert.deepEqual(result, {
    ok: false,
    errorCode: "ECS_PROJECTION_APPLY_FAILED",
    message: "Canvas apply path rejected the ECS projection",
    failedPortion: "applyDocument",
  });
  assert.deepEqual(snapshotWorld(world), before);
});

test("a literal false from the Canvas text apply seam is a projection failure", async () => {
  const world = createFixtureWorld();
  const before = snapshotWorld(world);
  const result = await projectWorldToCanvas(world, {
    applyDocument: async () => false,
  });

  assert.deepEqual(result, {
    ok: false,
    errorCode: "ECS_PROJECTION_APPLY_FAILED",
    message: "Canvas apply path rejected the ECS projection",
    failedPortion: "applyDocument",
  });
  assert.deepEqual(snapshotWorld(world), before);
});

test("projection and public query cannot observe an uncommitted System journal", async () => {
  let releaseSystem;
  let signalWrite;
  const wrote = new Promise((resolve) => { signalWrite = resolve; });
  const blocked = new Promise((resolve) => { releaseSystem = resolve; });
  const world = createWorld({
    systems: [async (context) => {
      context.write(0, "Position", "x", 99);
      signalWrite();
      await blocked;
      throw new Error("roll back the provisional projection value");
    }],
  });
  registerComponent(world, "Position", { x: "f32", y: "f32" });
  allocateEntity(world, {
    entityRef: "npc.transaction",
    components: { Position: { x: 1, y: 2 } },
  });

  const tick = worldTick(world, {});
  await wrote;
  assert.throws(
    () => query(world, ["Position"]),
    (error) => error.code === "ECS_TICK_IN_PROGRESS",
  );
  let applyCalls = 0;
  const projection = await projectWorldToCanvas(world, {
    applyDocument: async () => {
      applyCalls += 1;
      return true;
    },
  });
  assert.equal(projection.ok, false);
  assert.equal(projection.errorCode, "ECS_PROJECTION_SNAPSHOT_FAILED");
  assert.equal(applyCalls, 0);

  releaseSystem();
  assert.equal((await tick).ok, false);
  assert.equal(snapshotWorld(world).entities[0].components.Position.x, 1);
});

test("10,000-Entity offline projection completes within 500 ms", async () => {
  const world = createFixtureWorld(10_000);
  const startedAt = performance.now();
  const result = await projectWorldToCanvas(world, {
    applyDocument: async () => ({ ok: true }),
  });
  const elapsedMs = performance.now() - startedAt;

  assert.equal(result.ok, true);
  assert.equal(result.entityCount, 10_000);
  assert.ok(elapsedMs <= 500, `projection took ${elapsedMs.toFixed(1)} ms`);
});
