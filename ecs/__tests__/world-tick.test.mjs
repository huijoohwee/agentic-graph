import assert from "node:assert/strict";
import { test } from "node:test";

import { allocateEntity, createWorld, registerComponent, worldTick } from "../index.js";
import { snapshotWorld } from "../world.js";

const modelCostLog = (overrides = {}) => ({
  model: "test/model",
  prompt_tokens: 12,
  completion_tokens: 5,
  cache_hits: 0,
  estimated_cost_usd: 0.01,
  incomplete: false,
  ...overrides,
});

const decision = (decisionId, payload = {}) => ({
  decisionId,
  decisionType: "world_tick_result",
  entityRef: "counter:one",
  payload,
  producedAt: "2026-07-20T00:00:00.000Z",
});

function counterValue(world) {
  return snapshotWorld(world).entities[0].components.Counter.value;
}

function createCounterWorld(options = {}) {
  const world = createWorld(options);
  registerComponent(world, "Counter", { value: "i32" });
  allocateEntity(world, {
    entityRef: "counter:one",
    components: { Counter: { value: 1 } },
  });
  return world;
}

test("an empty zero-model tick emits exactly one canonical zero Cost_Log", async () => {
  const world = createWorld();
  const result = await worldTick(world, { frame: 1 });
  assert.deepEqual(result, {
    ok: true,
    decisions: [],
    deferred_decisions: [],
    cost_logs: [
      {
        model: "none",
        prompt_tokens: 0,
        completion_tokens: 0,
        cache_hits: 0,
        estimated_cost_usd: 0,
        incomplete: false,
      },
    ],
  });
});

test("Systems receive only the restricted context and observe prior writes", async () => {
  const calls = [];
  let receivedContext;
  const world = createCounterWorld({
    systems: [
      (context) => {
        receivedContext = context;
        calls.push("first");
        context.write(0, "Counter", "value", 4);
      },
      (context, input) => {
        calls.push("second");
        assert.equal(input.frame, 7);
        assert.equal(context.read(0, "Counter", "value"), 4);
        context.write(0, "Counter", "value", 9);
      },
    ],
  });

  const result = await worldTick(world, { frame: 7 });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["first", "second"]);
  assert.deepEqual(Object.keys(receivedContext).sort(), [
    "emitDecision",
    "query",
    "read",
    "requestReasoning",
    "setComponent",
    "write",
  ]);
  assert.equal(counterValue(world), 9);
  assert.throws(
    () => receivedContext.query([]),
    (error) => error.code === "ECS_INACTIVE_SYSTEM_CONTEXT",
  );
});

test("a failing System rolls back only its journal and skips later work", async () => {
  let laterRan = false;
  const firstSystem = (context) => {
    context.write(0, "Counter", "value", 2);
    context.emitDecision(decision("prior"));
    context.requestReasoning({ decisionId: "reason-after-systems" });
  };
  const failingSystem = (context) => {
    context.write(0, "Counter", "value", 99);
    context.emitDecision(decision("discard-me"));
    throw new Error("deliberate failure");
  };
  const world = createCounterWorld({
    systems: [
      firstSystem,
      failingSystem,
      () => {
        laterRan = true;
      },
    ],
  });

  const result = await worldTick(world, {});
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "ECS_TICK_FAILED");
  assert.equal(result.failingSystemIndex, 1);
  assert.equal(result.failingSystemName, "system-1");
  assert.deepEqual(result.decisions, [decision("prior")]);
  assert.equal(result.deferred_decisions[0].deferred_reason, "system_failure");
  assert.deepEqual(result.cost_logs, []);
  assert.equal(counterValue(world), 2);
  assert.equal(laterRan, false);
});

test("reasoning runs after Systems and contributes one validated harness log", async () => {
  const events = [];
  const expectedCostLog = modelCostLog();
  const world = createCounterWorld({
    systems: [
      (context) => {
        events.push("system");
        context.emitDecision(decision("local"));
        context.requestReasoning({ decisionId: "model", prompt: "choose" });
      },
    ],
    clock: () => 1234,
    decisionExecutor: async (request, metadata) => {
      events.push("executor");
      assert.equal(request.prompt, "choose");
      assert.equal(metadata.requestedAt, 1234);
      assert.equal(metadata.signal.aborted, false);
      return {
        decision: decision("model", { outcome: "accept" }),
        cost_logs: [expectedCostLog],
      };
    },
  });

  const result = await worldTick(world, { frame: 1 });
  assert.deepEqual(events, ["system", "executor"]);
  assert.deepEqual(result.decisions, [
    decision("local"),
    decision("model", { outcome: "accept" }),
  ]);
  assert.deepEqual(result.deferred_decisions, []);
  assert.deepEqual(result.cost_logs, [expectedCostLog]);
});

test("an invalid emitted Decision fails inside the System journal and rolls back its writes", async () => {
  const world = createCounterWorld({
    systems: [(context) => {
      context.write(0, "Counter", "value", 99);
      context.emitDecision({ decisionId: "incomplete" });
    }],
  });
  const result = await worldTick(world, {});
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "ECS_AGENTIC_OS_INVALID_NODE");
  assert.deepEqual(result.decisions, []);
  assert.equal(counterValue(world), 1);
});

test("valid model usage survives an invalid Decision and drops non-canonical Cost_Log fields", async () => {
  const world = createWorld({
    systems: [(context) => context.requestReasoning({ decisionId: "invalid-model-decision" })],
    decisionExecutor: async () => ({
      decision: null,
      cost_logs: [modelCostLog({ credential: "must-not-escape" })],
    }),
  });
  const result = await worldTick(world, {});
  assert.equal(result.ok, true);
  assert.deepEqual(result.decisions, []);
  assert.equal(result.deferred_decisions.length, 1);
  assert.equal(result.deferred_decisions[0].deferred_reason, "ECS_INVALID_REASONING_RESULT");
  assert.deepEqual(result.cost_logs, [modelCostLog()]);
  assert.equal(JSON.stringify(result).includes("must-not-escape"), false);
});

test("unavailable and timed-out reasoning is deferred without a fabricated log", async () => {
  const unavailable = createWorld({
    systems: [(context) => context.requestReasoning({ decisionId: "unavailable" })],
  });
  const unavailableResult = await worldTick(unavailable, {});
  assert.equal(unavailableResult.ok, true);
  assert.equal(unavailableResult.deferred_decisions[0].status, "deferred");
  assert.equal(
    unavailableResult.deferred_decisions[0].deferred_reason,
    "executor_unavailable",
  );
  assert.deepEqual(unavailableResult.cost_logs, []);

  const timedOut = createWorld({
    systems: [
      (context) => context.requestReasoning({ decisionId: "timeout", timeoutMs: 5 }),
    ],
    decisionExecutor: () => new Promise(() => {}),
  });
  const timeoutResult = await worldTick(timedOut, {});
  assert.equal(timeoutResult.ok, true);
  assert.equal(timeoutResult.deferred_decisions[0].deferred_reason, "ECS_REASONING_TIMEOUT");
  assert.deepEqual(timeoutResult.decisions, []);
  assert.deepEqual(timeoutResult.cost_logs, []);
});

test("singular, zero-log, and multi-log executor shapes defer without double counting", async () => {
  const invalidResults = [
    { cost_log: modelCostLog() },
    { cost_logs: [] },
    { cost_logs: [modelCostLog(), modelCostLog()] },
    { cost_log: modelCostLog(), cost_logs: [modelCostLog()] },
    { cost_logs: [modelCostLog({ model: "none" })] },
  ];

  for (const invalidResult of invalidResults) {
    const world = createWorld({
      systems: [(context) => context.requestReasoning({ decisionId: "model" })],
      decisionExecutor: async () => ({
        decision: { decisionId: "model" },
        ...invalidResult,
      }),
    });
    const result = await worldTick(world, {});
    assert.deepEqual(result.decisions, []);
    assert.equal(
      result.deferred_decisions[0].deferred_reason,
      "ECS_INVALID_REASONING_COST_LOG",
    );
    assert.deepEqual(result.cost_logs, []);
  }
});

test("concurrent ticks fail closed instead of interleaving World writes", async () => {
  let releaseSystem;
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const blocked = new Promise((resolve) => {
    releaseSystem = resolve;
  });
  const world = createCounterWorld({
    systems: [async (context) => {
      context.write(0, "Counter", "value", 2);
      markStarted();
      await blocked;
      context.write(0, "Counter", "value", 3);
    }],
  });

  const firstTick = worldTick(world, {});
  await started;
  const secondTick = await worldTick(world, {});
  assert.equal(secondTick.ok, false);
  assert.equal(secondTick.errorCode, "ECS_TICK_IN_PROGRESS");

  releaseSystem();
  const firstResult = await firstTick;
  assert.equal(firstResult.ok, true);
  assert.equal(counterValue(world), 3);
});
