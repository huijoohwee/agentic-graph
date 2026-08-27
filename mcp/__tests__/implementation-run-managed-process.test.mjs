import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import { cleanupManagedProcesses, executableProof, pidAlive, processMarker, runManagedProcess } from "../implementation-run-managed-process.js";
import { createImplementationRunRuntime } from "../implementation-run-runtime.js";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pathExistsForTest = async (candidate) => fs.lstat(candidate).then(() => true, (error) => error?.code === "ENOENT" ? false : Promise.reject(error));

async function waitFor(read, predicate, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await delay(25);
  }
  throw new Error("Timed out waiting for managed-process state.");
}

const fakeSpawn = () => {
  const child = new EventEmitter();
  child.pid = process.pid;
  child.exitCode = null;
  child.unref = () => undefined;
  child.kill = () => true;
  queueMicrotask(() => child.emit("spawn"));
  return child;
};

test("executable proof rejects a same-inode content overwrite", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-proof-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const executable = path.join(root, "runner.sh");
  await fs.writeFile(executable, "#!/bin/sh\nexit 0\n");
  await fs.chmod(executable, 0o755);
  const proof = await executableProof(executable);
  await fs.writeFile(executable, "#!/bin/sh\nexit 1\n");
  const after = await fs.stat(executable);
  assert.equal(String(after.ino), proof.inode, "fixture must preserve the inode");
  await assert.rejects(import("../implementation-run-managed-process.js").then(({ assertExecutableProof }) => assertExecutableProof(proof)), /content changed/);
});

test("oversized process spawn input is rejected before a child or artifact exists", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-spawn-bound-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = createImplementationRunRuntime({ rootDir: root, recoveryIntervalMs: 0 });
  const created = await runtime.store.create({ spec: { idempotencyKey: "spawn-bound-key", bounds: { maxAttempts: 2 }, workItem: { id: "spawn" } }, plan: { schema: "agenticgraph-implementation-run-plan/v1" } });
  let spawned = 0;
  await assert.rejects(runManagedProcess({ store: runtime.store, rootDir: root, runId: created.state.runId, token: "none", phase: "runner", executable: process.execPath, argv: ["--version"], cwd: root, env: { HUGE: "x".repeat(256 * 1024) }, timeoutMs: 5000, maxOutputBytes: 4096, proof: await executableProof(process.execPath), spawnImpl: () => { spawned += 1; return fakeSpawn(); } }), (error) => error.code === "PROCESS_INPUT_TOO_LARGE");
  assert.equal(spawned, 0);
  assert.equal((await fs.readdir(runtime.store.runDir(created.state.runId))).some((name) => name.startsWith("process-")), false);
});

test("recovery proves a live managed runner group stopped before relaunch", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-orphan-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runner = path.join(root, "runner.mjs");
  await fs.writeFile(runner, "setInterval(() => {}, 1000);\n");
  const proof = await executableProof(process.execPath);
  const runtime = createImplementationRunRuntime({ rootDir: root, spawnImpl: fakeSpawn, recoveryIntervalMs: 0 });
  const created = await runtime.store.create({
    spec: { idempotencyKey: "managed-orphan-key", bounds: { maxAttempts: 3 }, workItem: { id: "orphan" } },
    plan: { schema: "agenticgraph-implementation-run-plan/v1" },
  });
  const token = "supervisor-token";
  const supervisorMarker = await processMarker(process.pid);
  let state = await runtime.store.update(created.state.runId, { expectedRevision: 1, eventType: "test.running" }, (current) => {
    current.state = "running";
    current.supervisor = { pid: process.pid, processMarker: supervisorMarker, token, epoch: 1, status: "active", heartbeatAt: new Date().toISOString() };
    return current;
  });
  const running = runManagedProcess({
    store: runtime.store, rootDir: root, runId: state.runId, token, phase: "runner", executable: process.execPath, argv: [runner], cwd: root,
    env: { PATH: process.env.PATH, HOME: process.env.HOME }, timeoutMs: 30000, maxOutputBytes: 4096, proof,
  });
  state = await waitFor(() => runtime.store.read(state.runId), (value) => Object.values(value.activeProcesses || {}).some((entry) => entry.status === "running"));
  const orphan = Object.values(state.activeProcesses)[0];
  assert.equal(await processMarker(orphan.managerPid), orphan.managerMarker);
  assert.equal(await processMarker(orphan.childPid), orphan.childMarker);
  state = await runtime.store.update(state.runId, { expectedRevision: state.revision, eventType: "test.supervisor_crashed" }, (current) => {
    current.supervisor.pid = 99999999;
    current.supervisor.processMarker = "dead";
    current.supervisor.heartbeatAt = new Date(0).toISOString();
    return current;
  });
  const recovered = await runtime.recover();
  assert.equal(recovered.length, 1);
  await running;
  assert.notEqual(await processMarker(orphan.managerPid), orphan.managerMarker);
  assert.notEqual(await processMarker(orphan.childPid), orphan.childMarker);
  state = await runtime.store.read(state.runId);
  assert.deepEqual(state.activeProcesses, {});
  assert.equal(state.supervisor.status, "active");
});

test("an indeterminate starting command blocks cleanup and relaunch", async () => {
  const result = await cleanupManagedProcesses({ activeProcesses: { ambiguous: { phase: "runner", status: "starting", managerPid: 99999997, managerMarker: "dead", childPid: null, childMarker: null } } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "process_identity_unproven");
  assert.equal(pidAlive(99999997), false);
});

test("SIGTERM during the durable starting gate cannot launch an untracked command", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-start-gate-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sentinel = path.join(root, "command-started.txt");
  const command = path.join(root, "command.mjs");
  await fs.writeFile(command, `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(sentinel)}, "started"); setInterval(() => {}, 1000);\n`);
  const proof = await executableProof(process.execPath);
  const runtime = createImplementationRunRuntime({ rootDir: root, recoveryIntervalMs: 0 });
  const created = await runtime.store.create({ spec: { idempotencyKey: "starting-gate-key", bounds: { maxAttempts: 2 }, workItem: { id: "gate" } }, plan: { schema: "agenticgraph-implementation-run-plan/v1" } });
  const token = "starting-gate-owner";
  const marker = await processMarker(process.pid);
  let state = await runtime.store.update(created.state.runId, { expectedRevision: 1, eventType: "test.owner" }, (current) => {
    current.state = "running";
    current.supervisor = { pid: process.pid, processMarker: marker, token, epoch: 1, status: "active", heartbeatAt: new Date().toISOString() };
    return current;
  });
  const running = runManagedProcess({ store: runtime.store, rootDir: root, runId: state.runId, token, phase: "runner", executable: process.execPath, argv: [command], cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME }, timeoutMs: 30000, maxOutputBytes: 4096, proof });
  state = await waitFor(() => runtime.store.read(state.runId), (value) => Object.values(value.activeProcesses || {}).some((entry) => entry.status === "starting" && !entry.childPid));
  const entry = Object.values(state.activeProcesses)[0];
  process.kill(entry.managerPid, "SIGTERM");
  const result = await running;
  assert.notEqual(result.code, 0);
  assert.equal(await pathExistsForTest(sentinel), false);
  assert.deepEqual((await runtime.store.read(state.runId)).activeProcesses, {});
});

test("mixed stdout and stderr remain within one durable output bound", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-output-bound-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const command = path.join(root, "output.mjs");
  await fs.writeFile(command, `process.stdout.write("a".repeat(10000)); process.stderr.write("b".repeat(10000));\n`);
  const proof = await executableProof(process.execPath);
  const runtime = createImplementationRunRuntime({ rootDir: root, recoveryIntervalMs: 0 });
  const created = await runtime.store.create({ spec: { idempotencyKey: "output-bound-key", bounds: { maxAttempts: 2 }, workItem: { id: "output" } }, plan: { schema: "agenticgraph-implementation-run-plan/v1" } });
  const token = "output-bound-owner", marker = await processMarker(process.pid);
  const state = await runtime.store.update(created.state.runId, { expectedRevision: 1, eventType: "test.owner" }, (current) => { current.state = "running"; current.supervisor = { pid: process.pid, processMarker: marker, token, epoch: 1, status: "active", heartbeatAt: new Date().toISOString() }; return current; });
  const result = await runManagedProcess({ store: runtime.store, rootDir: root, runId: state.runId, token, phase: "runner", executable: process.execPath, argv: [command], cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME }, timeoutMs: 30000, maxOutputBytes: 4096, proof });
  assert.equal(result.ok, true);
  assert.equal(result.outputTruncated, true);
  assert.ok(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 4096);
  assert.match(result.stderr, /bounded output truncated/);
});

test("manager exit is observed before authorization and close drains trailing output", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-exit-window-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = createImplementationRunRuntime({ rootDir: root, recoveryIntervalMs: 0 });
  const created = await runtime.store.create({ spec: { idempotencyKey: "exit-window-key", bounds: { maxAttempts: 2 }, workItem: { id: "exit" } }, plan: { schema: "agenticgraph-implementation-run-plan/v1" } });
  const token = "exit-window-owner", marker = await processMarker(process.pid);
  const state = await runtime.store.update(created.state.runId, { expectedRevision: 1, eventType: "test.owner" }, (current) => { current.state = "running"; current.supervisor = { pid: process.pid, processMarker: marker, token, epoch: 1, status: "active", heartbeatAt: new Date().toISOString() }; return current; });
  let manager;
  const originalUpdate = runtime.store.update.bind(runtime.store);
  runtime.store.update = async (runId, options, mutate) => {
    if (options.eventType === "process.authorized" && manager?.exitCode === null) {
      manager.exitCode = 0;
      manager.emit("exit", 0, null);
      queueMicrotask(() => { manager.stdout.write("tail-out"); manager.stderr.write("tail-err"); manager.stdout.end(); manager.stderr.end(); manager.emit("close", 0, null); });
    }
    return originalUpdate(runId, options, mutate);
  };
  const spawnImpl = (_command, argv) => {
    manager = new EventEmitter(); manager.pid = process.pid; manager.exitCode = null; manager.signalCode = null; manager.stdout = new PassThrough(); manager.stderr = new PassThrough();
    const operationId = argv[argv.indexOf("--operation") + 1];
    queueMicrotask(async () => {
      manager.emit("spawn");
      await originalUpdate(state.runId, { eventType: "fake.register" }, (current) => { current.activeProcesses[operationId] = { operationId, phase: "runner", status: "registered", managerPid: process.pid, managerMarker: marker, childPid: null, childMarker: null }; return current; });
    });
    return manager;
  };
  const proof = await executableProof(process.execPath);
  const result = await runManagedProcess({ store: runtime.store, rootDir: root, runId: state.runId, token, phase: "runner", executable: process.execPath, argv: ["--version"], cwd: root, env: { PATH: process.env.PATH }, timeoutMs: 5000, maxOutputBytes: 4096, proof, spawnImpl });
  assert.equal(result.ok, true);
  assert.match(result.stdout, /tail-out/);
  assert.match(result.stderr, /tail-err/);
});

test("manager exit with inherited open pipes fails on the bounded stdio drain grace", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-drain-timeout-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = createImplementationRunRuntime({ rootDir: root, recoveryIntervalMs: 0 });
  const created = await runtime.store.create({ spec: { idempotencyKey: "drain-timeout-key", bounds: { maxAttempts: 2 }, workItem: { id: "drain" } }, plan: { schema: "agenticgraph-implementation-run-plan/v1" } });
  const token = "drain-owner", marker = await processMarker(process.pid);
  const state = await runtime.store.update(created.state.runId, { expectedRevision: 1, eventType: "test.owner" }, (current) => { current.state = "running"; current.supervisor = { pid: process.pid, processMarker: marker, token, epoch: 1, status: "active", heartbeatAt: new Date().toISOString() }; return current; });
  let manager;
  const originalUpdate = runtime.store.update.bind(runtime.store);
  runtime.store.update = async (runId, options, mutate) => {
    if (options.eventType === "process.authorized" && manager?.exitCode === null) { manager.exitCode = 0; manager.emit("exit", 0, null); }
    return originalUpdate(runId, options, mutate);
  };
  const spawnImpl = (_command, argv) => {
    manager = new EventEmitter(); manager.pid = process.pid; manager.exitCode = null; manager.signalCode = null; manager.stdout = new PassThrough(); manager.stderr = new PassThrough();
    const operationId = argv[argv.indexOf("--operation") + 1];
    queueMicrotask(async () => { manager.emit("spawn"); await originalUpdate(state.runId, { eventType: "fake.register" }, (current) => { current.activeProcesses[operationId] = { operationId, phase: "runner", status: "registered", managerPid: process.pid, managerMarker: marker, childPid: null, childMarker: null }; return current; }); });
    return manager;
  };
  const proof = await executableProof(process.execPath);
  const startedAt = Date.now();
  const result = await runManagedProcess({ store: runtime.store, rootDir: root, runId: state.runId, token, phase: "runner", executable: process.execPath, argv: ["--version"], cwd: root, env: { PATH: process.env.PATH }, timeoutMs: 10000, maxOutputBytes: 4096, proof, spawnImpl });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "PROCESS_STDIO_DRAIN_TIMEOUT");
  assert.equal(result.outputTruncated, true);
  assert.ok(Date.now() - startedAt < 5000);
});

test("signal-fast command returns without losing the managed CLI exit", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-signal-exit-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const command = path.join(root, "signal.mjs");
  await fs.writeFile(command, "process.kill(process.pid, 'SIGTERM');\n");
  const runtime = createImplementationRunRuntime({ rootDir: root, recoveryIntervalMs: 0 });
  const created = await runtime.store.create({ spec: { idempotencyKey: "signal-exit-key", bounds: { maxAttempts: 2 }, workItem: { id: "signal" } }, plan: { schema: "agenticgraph-implementation-run-plan/v1" } });
  const token = "signal-owner", marker = await processMarker(process.pid);
  const state = await runtime.store.update(created.state.runId, { expectedRevision: 1, eventType: "test.owner" }, (current) => { current.state = "running"; current.supervisor = { pid: process.pid, processMarker: marker, token, epoch: 1, status: "active", heartbeatAt: new Date().toISOString() }; return current; });
  const proof = await executableProof(process.execPath);
  const result = await runManagedProcess({ store: runtime.store, rootDir: root, runId: state.runId, token, phase: "runner", executable: process.execPath, argv: [command], cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME }, timeoutMs: 5000, maxOutputBytes: 4096, proof });
  assert.equal(result.ok, false);
  assert.ok(result.code !== 0 || result.signal === "SIGTERM");
});

test("managed CLI terminates a SIGTERM-ignoring descendant in the command process group", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-process-group-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const descendant = path.join(root, "descendant.mjs"), pidFile = path.join(root, "descendant.pid"), leader = path.join(root, "leader.mjs");
  await fs.writeFile(descendant, "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\n");
  await fs.writeFile(leader, `import { spawn } from "node:child_process"; import fs from "node:fs"; const child = spawn(process.execPath, [${JSON.stringify(descendant)}], { stdio: "inherit" }); fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));\n`);
  const runtime = createImplementationRunRuntime({ rootDir: root, recoveryIntervalMs: 0 });
  const created = await runtime.store.create({ spec: { idempotencyKey: "process-group-key", bounds: { maxAttempts: 2 }, workItem: { id: "group" } }, plan: { schema: "agenticgraph-implementation-run-plan/v1" } });
  const token = "group-owner", marker = await processMarker(process.pid);
  const state = await runtime.store.update(created.state.runId, { expectedRevision: 1, eventType: "test.owner" }, (current) => { current.state = "running"; current.supervisor = { pid: process.pid, processMarker: marker, token, epoch: 1, status: "active", heartbeatAt: new Date().toISOString() }; return current; });
  const proof = await executableProof(process.execPath);
  const result = await runManagedProcess({ store: runtime.store, rootDir: root, runId: state.runId, token, phase: "runner", executable: process.execPath, argv: [leader], cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME }, timeoutMs: 5000, maxOutputBytes: 4096, proof });
  const descendantPid = Number(await fs.readFile(pidFile, "utf8"));
  assert.equal(pidAlive(descendantPid), false, JSON.stringify(result));
  assert.equal(result.errorCode, null);
});
