import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  adapterRecord,
  createFixture,
  delegateResponse,
  planAndStart,
  runtimeFor,
} from "./agent-team-test-kit.mjs";

async function completedFixture(t, key) {
  const fixture = await createFixture(t);
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: adapterRecord({ execute: async () => delegateResponse }),
  });
  const { started } = await planAndStart(runtime, fixture.planInput, key);
  assert.equal(started.state, "completed");
  return { ...fixture, runtime, started };
}

async function advanceTo(store, runId, targetVersion) {
  let state = await store.read(runId);
  while (state.stateVersion < targetVersion) {
    state = await store.update(runId, {
      expectedStateVersion: state.stateVersion,
      eventType: "test.checkpoint_advance",
      eventData: { targetVersion },
    }, (current) => current);
  }
  return state;
}

test("list and missing-run reads are non-mutating and never expose local paths", async (t) => {
  const fixture = await createFixture(t);
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
  });
  const workspace = path.join(fixture.rootDir, ".knowgrph-workspace");
  assert.deepEqual((await runtime.list({})).result.runs, []);
  assert.equal(await runtime.store.readOptional(`atr_${"0".repeat(24)}`), null);
  const missing = await runtime.list({ runId: `atr_${"0".repeat(24)}` });
  assert.equal(missing.error.code, "run_not_found");
  assert.equal(JSON.stringify(missing).includes(fixture.rootDir), false);
  await assert.rejects(fs.lstat(workspace), { code: "ENOENT" });
});

test("checkpoint and event-ledger tampering fails closed and recovery counts corruption", async (t) => {
  const cases = [
    ["state", async ({ runtime, started }) => {
      const statePath = runtime.store.statePath(started.runId);
      const state = JSON.parse(await fs.readFile(statePath, "utf8"));
      state.finalAnswer = "TAMPERED";
      await fs.writeFile(statePath, JSON.stringify(state));
    }],
    ["intermediate type", async ({ runtime, started }) => {
      const eventPath = runtime.store.eventPath(started.runId, 2);
      const event = JSON.parse(await fs.readFile(eventPath, "utf8"));
      event.type = "tampered.type";
      await fs.writeFile(eventPath, JSON.stringify(event));
    }],
    ["intermediate data", async ({ runtime, started }) => {
      const eventPath = runtime.store.eventPath(started.runId, 2);
      const event = JSON.parse(await fs.readFile(eventPath, "utf8"));
      event.data = { forged: true };
      await fs.writeFile(eventPath, JSON.stringify(event));
    }],
    ["missing event", async ({ runtime, started }) => {
      await fs.unlink(runtime.store.eventPath(started.runId, 2));
    }],
    ["forked event", async ({ runtime, started }) => {
      const eventPath = runtime.store.eventPath(started.runId, 3);
      const event = JSON.parse(await fs.readFile(eventPath, "utf8"));
      event.previousEventDigest = "f".repeat(64);
      await fs.writeFile(eventPath, JSON.stringify(event));
    }],
    ["invalid orphan", async ({ runtime, started }) => {
      const state = await runtime.store.read(started.runId);
      await fs.writeFile(
        runtime.store.eventPath(started.runId, state.stateVersion + 1),
        JSON.stringify({ stateVersion: state.stateVersion + 1 }),
      );
    }],
    ["oversized orphan", async ({ runtime, started }) => {
      const state = await runtime.store.read(started.runId);
      await fs.writeFile(
        runtime.store.eventPath(started.runId, state.stateVersion + 1),
        "x".repeat((128 * 1024) + 1),
      );
    }],
  ];
  for (const [name, tamper] of cases) {
    await t.test(name, async (subtest) => {
      const subject = await completedFixture(subtest, `integrity-${name}`);
      await tamper(subject);
      const listed = await subject.runtime.list({ runId: subject.started.runId });
      assert.equal(listed.error.code, "invalid_durable_state");
      const recovered = await subject.runtime.recover();
      assert.equal(recovered.corrupt, 1);
    });
  }
});

test("a valid uncommitted successor is recoverable and overwritten on the next update", async (t) => {
  const subject = await completedFixture(t, "integrity-crash-window");
  const { runtime, started } = subject;
  const before = await runtime.store.read(started.runId);
  const originalWrite = runtime.store.writeAtomic.bind(runtime.store);
  let failStateWrite = true;
  runtime.store.writeAtomic = async (filePath, value, maximumBytes) => {
    if (failStateWrite && filePath === runtime.store.statePath(started.runId)) {
      failStateWrite = false;
      throw Object.assign(new Error("simulated power loss"), { code: "EIO" });
    }
    return originalWrite(filePath, value, maximumBytes);
  };
  await assert.rejects(runtime.store.update(started.runId, {
    expectedStateVersion: before.stateVersion,
    eventType: "test.uncommitted",
  }, (state) => state), { code: "EIO" });
  runtime.store.writeAtomic = originalWrite;

  const afterCrash = await runtime.store.read(started.runId);
  assert.equal(afterCrash.stateVersion, before.stateVersion);
  const tempResidue = path.join(runtime.store.runDir(started.runId), ".000999.json.tmp-crash");
  await fs.writeFile(tempResidue, "uncommitted temporary bytes");
  assert.equal((await runtime.store.read(started.runId)).stateVersion, before.stateVersion);
  const repaired = await runtime.store.update(started.runId, {
    expectedStateVersion: before.stateVersion,
    eventType: "test.repaired",
  }, (state) => state);
  assert.equal(repaired.stateVersion, before.stateVersion + 1);
  assert.equal((await runtime.store.read(started.runId)).stateVersion, repaired.stateVersion);
});

test("checkpoint capacity blocks before an adapter effect and the hard cap is immutable", async (t) => {
  const fixture = await createFixture(t, {
    allowedBranchIds: [
      "delegate-one", "delegate-two", "delegate-three", "delegate-four", "delegate-five",
    ],
  });
  const adapterId = "test.capacity-adapter";
  const blockedRuntime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: adapterRecord({
      id: adapterId,
      estimate: async () => ({ inputTokens: 120_001, outputTokens: 0, costUsd: 0, timeMs: 1 }),
      execute: async () => { throw new Error("must not execute"); },
    }),
  });
  const { started } = await planAndStart(blockedRuntime, fixture.planInput, "checkpoint-capacity-start");
  assert.equal(started.state, "blocked");
  await advanceTo(blockedRuntime.store, started.runId, 55);

  let estimates = 0;
  let effects = 0;
  const ready = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: adapterRecord({
      id: adapterId,
      estimate: async () => {
        estimates += 1;
        return { inputTokens: 1, outputTokens: 1, costUsd: 0, timeMs: 1 };
      },
      execute: async () => {
        effects += 1;
        return delegateResponse;
      },
    }),
  });
  const resumed = await ready.control({
    runId: started.runId,
    expectedStateVersion: 55,
    action: "retry",
    idempotencyKey: "checkpoint-capacity-retry",
    reason: "Reserve all remaining checkpoint transitions before any effect.",
  });
  assert.equal(resumed.state, "queued");
  const capacityBlocked = await ready.store.read(started.runId);
  assert.equal(capacityBlocked.state, "blocked");
  assert.equal(capacityBlocked.error.code, "checkpoint_budget_insufficient");
  assert.equal(estimates, 0);
  assert.equal(effects, 0);

  const atCap = await advanceTo(ready.store, started.runId, 64);
  const rejected = await ready.control({
    runId: started.runId,
    expectedStateVersion: atCap.stateVersion,
    action: "cancel",
    idempotencyKey: "checkpoint-cap-cancel",
    reason: "No checkpoint may be written beyond the hard cap.",
  });
  assert.equal(rejected.error.code, "checkpoint_limit_exceeded");
  assert.equal((await ready.store.read(started.runId)).stateVersion, 64);
  await assert.rejects(fs.lstat(ready.store.eventPath(started.runId, 65)), { code: "ENOENT" });
});

test("lease recovery reuses the exact effect id without starting a second logical effect", async (t) => {
  const fixture = await createFixture(t, {
    bounds: { maxStageTimeMs: 1_000, maxRunTimeMs: 10_000 },
  });
  let clock = 0;
  let firstStarted;
  let settleFirst;
  const firstGate = new Promise((resolve) => { firstStarted = resolve; });
  const firstResult = new Promise((resolve) => { settleFirst = resolve; });
  const effectIds = [];
  const logicalEffects = new Set();
  let estimateCalls = 0;
  const adapter = adapterRecord({
    id: "test.lease-replay",
    estimate: async () => {
      estimateCalls += 1;
      return { inputTokens: 10, outputTokens: 10, costUsd: 0.1, timeMs: 1_000 };
    },
    execute: async ({ effectId }) => {
      effectIds.push(effectId);
      logicalEffects.add(effectId);
      if (effectIds.length === 1) {
        firstStarted();
        return firstResult;
      }
      return delegateResponse;
    },
  });
  const first = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
    supervisorId: "lease-owner-a",
    nowMs: () => clock,
    effectLeaseMs: 1,
  });
  const planned = await first.plan(fixture.planInput);
  const startPromise = first.start({
    planId: planned.result.planId,
    planDigest: planned.planDigest,
    teamRevision: planned.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "lease-recovery-start",
  });
  await firstGate;
  const second = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
    supervisorId: "lease-owner-b",
    nowMs: () => clock,
    effectLeaseMs: 1,
  });
  clock = 5_999;
  const beforeExpiry = await second.recover();
  assert.equal(beforeExpiry.pending, 1);
  assert.equal(effectIds.length, 1);
  assert.equal(estimateCalls, 1);
  clock = 6_001;
  const afterExpiry = await second.recover();
  assert.equal(afterExpiry.recovered, 1);
  assert.equal(effectIds.length, 2);
  assert.equal(effectIds[0], effectIds[1]);
  assert.equal(logicalEffects.size, 1);
  assert.equal(estimateCalls, 1);
  const recoveredState = (await second.store.list({}))[0];
  assert.equal(Boolean(recoveredState.startReceipt.snapshot), true);
  settleFirst(delegateResponse);
  const completed = await startPromise;
  assert.equal(completed.state, "completed");
  const durable = await second.store.read(completed.runId);
  assert.equal(durable.attemptsByBranchId["delegate-research"], 1);
  assert.equal((await second.list({ runId: completed.runId })).result.runs[0].finalAnswer, delegateResponse.output);
});

test("reclaim blocks when the durable branch-input admission digest drifts", async (t) => {
  const fixture = await createFixture(t, {
    bounds: { maxStageTimeMs: 500, maxRunTimeMs: 10_000 },
  });
  let clock = 0;
  let effectStarted;
  const effectGate = new Promise((resolve) => { effectStarted = resolve; });
  let estimates = 0;
  let effects = 0;
  const adapter = adapterRecord({
    id: "test.input-fence",
    estimate: async () => {
      estimates += 1;
      return { inputTokens: 10, outputTokens: 10, costUsd: 0.1, timeMs: 500 };
    },
    execute: async () => {
      effects += 1;
      effectStarted();
      return new Promise(() => {});
    },
  });
  const first = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
    supervisorId: "input-owner-a",
    nowMs: () => clock,
    effectLeaseMs: 1,
  });
  const planned = await first.plan(fixture.planInput);
  const startPromise = first.start({
    planId: planned.result.planId,
    planDigest: planned.planDigest,
    teamRevision: planned.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "input-fence-start",
  });
  await effectGate;
  const claimed = (await first.store.list({ states: ["running"] }))[0];
  await first.store.update(claimed.runId, {
    expectedStateVersion: claimed.stateVersion,
    eventType: "test.input_digest_drift",
  }, (state) => {
    state.executionClaim.inputDigest = "f".repeat(64);
    return state;
  });
  clock = 6_000;
  const restarted = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
    supervisorId: "input-owner-b",
    nowMs: () => clock,
    effectLeaseMs: 1,
  });
  const recovered = await restarted.recover();
  const blocked = await restarted.store.read(claimed.runId);
  assert.equal(recovered.recovered, 1);
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.error.code, "execution_input_fence_mismatch");
  assert.equal(blocked.usage.costStatus, "unreported");
  assert.equal(estimates, 1);
  assert.equal(effects, 1);
  assert.equal((await startPromise).state, "blocked");
});
