import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createImplementationRunRuntime } from "../implementation-run-runtime.js";
import { processMarker } from "../implementation-run-managed-process.js";

const fakeSpawn = () => {
  const child = new EventEmitter();
  child.pid = process.pid;
  child.exitCode = null;
  child.unref = () => undefined;
  child.kill = () => true;
  queueMicrotask(() => child.emit("spawn"));
  return child;
};
const spec = (key) => ({ idempotencyKey: key, bounds: { maxAttempts: 2 }, workItem: { id: key } });
const plan = { schema: "agenticgraph-implementation-run-plan/v1" };

async function createState(runtime, key, stateName, values = {}) {
  const created = await runtime.store.create({ spec: spec(key), plan });
  return runtime.store.update(created.state.runId, { expectedRevision: 1, eventType: "test.state" }, (state) => {
    state.state = stateName;
    state.attempt = values.attempt ?? 0;
    state.supervisor = {
      pid: values.pid ?? 99999999,
      token: values.token || `token-${key}`,
      epoch: 1,
      status: "active",
      heartbeatAt: values.heartbeatAt || new Date().toISOString(),
      processMarker: values.processMarker || "missing",
    };
    return state;
  });
}

test("recovery relaunches only eligible dead supervisors and ignores idle states", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-recovery-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  let spawns = 0;
  const runtime = createImplementationRunRuntime({ rootDir, spawnImpl: () => { spawns += 1; return fakeSpawn(); } });
  const queued = await createState(runtime, "queued-key", "queued");
  await createState(runtime, "paused-key", "paused");
  await createState(runtime, "failed-key", "failed");
  await createState(runtime, "canceled-key", "canceled");
  const recovered = await runtime.recover();
  assert.equal(spawns, 1);
  assert.equal(recovered.length, 1);
  const queuedAfter = await runtime.store.read(queued.runId);
  assert.equal(queuedAfter.supervisor.status, "active");
  assert.notEqual(queuedAfter.supervisor.token, queued.supervisor.token);
});

test("recovery fences a live PID whose process marker does not match", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-recovery-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const runtime = createImplementationRunRuntime({ rootDir, spawnImpl: fakeSpawn });
  const stale = await createState(runtime, "marker-key", "running", { pid: process.pid, token: "old-token", processMarker: `${process.pid}:not-this-process` });
  const recovered = await runtime.recover();
  assert.equal(recovered.length, 1);
  const state = await runtime.store.read(stale.runId);
  assert.equal(state.state, "blocked");
  assert.equal(state.supervisor.status, "fenced");
  assert.notEqual(state.supervisor.token, "old-token");
  await assert.rejects(
    runtime.store.writeArtifact(state.runId, "late.log", "late", { supervisorToken: "old-token" }),
    /fenced/,
  );
});

test("recovery fences exhausted runs instead of exceeding attempt bounds", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-recovery-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  let spawns = 0;
  const runtime = createImplementationRunRuntime({ rootDir, spawnImpl: () => { spawns += 1; return fakeSpawn(); } });
  const exhausted = await createState(runtime, "exhausted-key", "running", { attempt: 2 });
  await runtime.recover();
  const state = await runtime.store.read(exhausted.runId);
  assert.equal(spawns, 0);
  assert.equal(state.state, "blocked");
  assert.equal(state.error.code, "attempt_limit");
  assert.equal(state.supervisor.status, "fenced");
});

test("an unexpected supervisor exit is reconciled without restarting the MCP server", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-recovery-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const children = [];
  const runtime = createImplementationRunRuntime({ rootDir, recoveryIntervalMs: 0, spawnImpl: () => {
    const child = fakeSpawn();
    children.push(child);
    return child;
  } });
  const run = await createState(runtime, "exit-key", "queued");
  await runtime.recover();
  assert.equal(children.length, 1);
  const firstToken = (await runtime.store.read(run.runId)).supervisor.token;
  children[0].exitCode = 1;
  children[0].emit("exit", 1, null);
  const deadline = Date.now() + 5000;
  while (children.length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(children.length, 2);
  while (Date.now() < deadline) { const state = await runtime.store.read(run.runId); if (state.supervisor.status === "active" && state.supervisor.token !== firstToken) break; await new Promise((resolve) => setTimeout(resolve, 25)); }
  assert.notEqual((await runtime.store.read(run.runId)).supervisor.token, firstToken);
});

test("periodic recovery adopts a live supervisor and notices its later death", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-recovery-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  let spawns = 0;
  const runtime = createImplementationRunRuntime({ rootDir, recoveryIntervalMs: 25, spawnImpl: () => { spawns += 1; return fakeSpawn(); } });
  t.after(() => runtime.stopMonitoring());
  let adopted = await createState(runtime, "adopted-key", "running", { pid: process.pid, processMarker: await processMarker(process.pid) });
  assert.deepEqual(await runtime.recover(), []);
  adopted = await runtime.store.update(adopted.runId, { expectedRevision: adopted.revision, eventType: "test.adopted_exit" }, (state) => {
    state.supervisor.pid = 99999996;
    state.supervisor.processMarker = "dead";
    return state;
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const current = await runtime.store.read(adopted.runId);
    if (spawns === 1 && current.supervisor.status === "active") break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(spawns, 1);
  assert.equal((await runtime.store.read(adopted.runId)).supervisor.status, "active");
});

test("control fences a reused live PID instead of launching a duplicate supervisor", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-recovery-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  let spawns = 0;
  const runtime = createImplementationRunRuntime({ rootDir, recoveryIntervalMs: 0, spawnImpl: () => { spawns += 1; return fakeSpawn(); } });
  const stale = await createState(runtime, "control-marker-key", "running", { pid: process.pid, processMarker: `${process.pid}:reused` });
  const result = await runtime.control({ runId: stale.runId, action: "pause", expectedRevision: stale.revision });
  assert.equal(result.ok, true);
  assert.equal(result.state, "blocked");
  assert.equal(result.error.code, "supervisor_identity_unproven");
  assert.equal(spawns, 0);
});

test("recovery isolates a corrupt run and still recovers healthy runs", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-recovery-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  let spawns = 0;
  const runtime = createImplementationRunRuntime({ rootDir, recoveryIntervalMs: 0, spawnImpl: () => { spawns += 1; return fakeSpawn(); } });
  const healthy = await createState(runtime, "healthy-key", "queued");
  const corrupt = path.join(rootDir, ".agenticgraph-workspace", "implementation-runs", "ir_aaaaaaaaaaaaaaaaaaaaaaaa");
  await fs.mkdir(path.join(corrupt, "events"), { recursive: true });
  await fs.writeFile(path.join(corrupt, "state.json"), "{not-json\n");
  const recovered = await runtime.recover();
  assert.equal(recovered.length, 1);
  assert.equal(spawns, 1);
  const aggregate = await runtime.list({});
  assert.equal(aggregate.ok, true);
  assert.ok(aggregate.runs.some((run) => run.runId === healthy.runId));
  assert.equal(aggregate.unreadableRunCount, 1);
  assert.deepEqual(aggregate.unreadableRuns, [{ runId: "ir_aaaaaaaaaaaaaaaaaaaaaaaa", code: "unreadable_run" }]);
  assert.equal((await runtime.list({ runId: "ir_aaaaaaaaaaaaaaaaaaaaaaaa" })).ok, false);
  assert.equal((await runtime.control({ runId: "ir_aaaaaaaaaaaaaaaaaaaaaaaa", action: "pause", expectedRevision: 1 })).ok, false);
});

test("aggregate listing is byte-bounded, cursor-complete, and isolates oversized state", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-list-page-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const runtime = createImplementationRunRuntime({ rootDir, recoveryIntervalMs: 0, spawnImpl: fakeSpawn });
  const expected = new Set();
  for (let index = 0; index < 150; index += 1) {
    const created = await runtime.store.create({ spec: { idempotencyKey: `large-list-key-${index}`, bounds: { maxAttempts: 2 }, workItem: { id: `item-${index}`, objective: "x".repeat(4096), acceptance: Array.from({ length: 50 }, () => "y".repeat(1000)) } }, plan });
    expected.add(created.state.runId);
  }
  const invalidTimestampId = expected.values().next().value;
  expected.delete(invalidTimestampId);
  const invalidStatePath = runtime.store.statePath(invalidTimestampId);
  const invalidState = JSON.parse(await fs.readFile(invalidStatePath, "utf8"));
  invalidState.updatedAt = "not-a-timestamp";
  await fs.writeFile(invalidStatePath, `${JSON.stringify(invalidState)}\n`);
  const oversizedId = "ir_ffffffffffffffffffffffff";
  const oversizedDir = path.join(rootDir, ".agenticgraph-workspace", "implementation-runs", oversizedId);
  await fs.mkdir(path.join(oversizedDir, "events"), { recursive: true });
  await fs.writeFile(path.join(oversizedDir, "state.json"), "x".repeat(1024 * 1024 + 1));
  const seen = new Set();
  let cursor;
  let sawOversized = false;
  let sawInvalidTimestamp = false;
  do {
    const listed = await runtime.list({ limit: 200, ...(cursor ? { cursor } : {}) });
    assert.equal(listed.ok, true);
    assert.ok(Buffer.byteLength(JSON.stringify(listed)) <= 128 * 1024);
    for (const run of listed.runs) { assert.equal(seen.has(run.runId), false); seen.add(run.runId); }
    sawOversized ||= listed.unreadableRuns.some((entry) => entry.runId === oversizedId && entry.code === "state_too_large");
    sawInvalidTimestamp ||= listed.unreadableRuns.some((entry) => entry.runId === invalidTimestampId && entry.code === "invalid_updated_at");
    cursor = listed.nextCursor || undefined;
  } while (cursor);
  assert.deepEqual(seen, expected);
  assert.equal(sawOversized, true);
  assert.equal(sawInvalidTimestamp, true);
  assert.equal((await runtime.list({ includeEvents: true })).error.code, "invalid_arguments");
});

test("detached supervisor receives only its runner allowlist and lifecycle auth", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-recovery-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  let launchedEnv = null;
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, RUNNER_A_SECRET: "a-value", RUNNER_B_SECRET: "b-value", UNREGISTERED_SECRET: "hidden", GH_TOKEN: "gh-value",
    AGENTICGRAPH_IMPLEMENTATION_ACOS_ROOT: rootDir,
    AGENTICGRAPH_IMPLEMENTATION_REPOSITORIES_JSON: "[]",
    AGENTICGRAPH_IMPLEMENTATION_VERIFIERS_JSON: "{}",
    AGENTICGRAPH_IMPLEMENTATION_RUNNERS_JSON: JSON.stringify({
      runner_a: { executable: process.execPath, args: ["{{requestPath}}"], environment: ["RUNNER_A_SECRET"] },
      runner_b: { executable: process.execPath, args: ["{{requestPath}}"], environment: ["RUNNER_B_SECRET"] },
    }),
  };
  const runtime = createImplementationRunRuntime({ rootDir, env, recoveryIntervalMs: 0, spawnImpl: (_command, _argv, options) => { launchedEnv = options.env; return fakeSpawn(); } });
  const created = await runtime.store.create({
    spec: { idempotencyKey: "environment-scope-key", bounds: { maxAttempts: 2 }, workItem: { id: "env" }, runnerId: "runner_a" },
    plan: { schema: "agenticgraph-implementation-run-plan/v1", runner: { executable: process.execPath, args: ["{{requestPath}}"], environment: ["RUNNER_A_SECRET"] }, verifiers: [] },
  });
  await runtime.store.update(created.state.runId, { expectedRevision: 1, eventType: "test.queued" }, (state) => {
    state.supervisor = { pid: 99999995, token: "old", epoch: 1, status: "active", heartbeatAt: new Date(0).toISOString(), processMarker: "dead" };
    return state;
  });
  await runtime.recover();
  assert.equal(launchedEnv.RUNNER_A_SECRET, "a-value");
  assert.equal(launchedEnv.GH_TOKEN, "gh-value");
  assert.equal("RUNNER_B_SECRET" in launchedEnv, false);
  assert.equal("UNREGISTERED_SECRET" in launchedEnv, false);
});

test("early supervisor exit storms exhaust a durable automatic-restart bound", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-recovery-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const children = [];
  const runtime = createImplementationRunRuntime({ rootDir, recoveryIntervalMs: 0, spawnImpl: () => { const child = fakeSpawn(); children.push(child); return child; } });
  const run = await createState(runtime, "storm-key", "queued");
  await runtime.recover();
  for (let index = 0; index < 4; index += 1) {
    const child = children[index];
    child.exitCode = 1;
    child.emit("exit", 1, null);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const state = await runtime.store.read(run.runId);
      if (children.length > index + 1 || state.error?.code === "supervisor_launch_limit") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  const state = await runtime.store.read(run.runId);
  assert.equal(children.length, 4);
  assert.equal(state.state, "blocked");
  assert.equal(state.error.code, "supervisor_launch_limit");
  assert.equal(state.automaticRestarts, 4);
});
