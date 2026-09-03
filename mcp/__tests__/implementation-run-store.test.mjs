import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { readStableBoundedFile } from "../bounded-file-reader.js";
import { ImplementationRunStore } from "../implementation-run-store.js";

const spec = (idempotencyKey = "store-test-key") => ({
  idempotencyKey,
  workItem: { id: "store-test", objective: "Exercise durable state", acceptance: ["State is atomic"] },
});
const plan = { schema: "agentic-graph-implementation-run-plan/v1", sourceRevision: "a".repeat(40) };

test("implementation-run store provides atomic idempotent create and revision CAS", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-run-store-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const store = new ImplementationRunStore({ rootDir });
  const first = await store.create({ spec: spec(), plan });
  assert.equal(first.created, true);
  assert.equal(first.state.revision, 1);
  const replay = await store.create({ spec: spec(), plan });
  assert.equal(replay.created, false);
  assert.equal(replay.state.runId, first.state.runId);

  const updated = await store.update(first.state.runId, { expectedRevision: 1, eventType: "test.updated", eventData: { token: "must-redact", safe: true } }, (state) => {
    state.state = "running";
    return state;
  });
  assert.equal(updated.revision, 2);
  await assert.rejects(
    store.update(first.state.runId, { expectedRevision: 1, eventType: "test.stale" }, (state) => state),
    (error) => error.code === "REVISION_CONFLICT",
  );
  const events = await store.events(first.state.runId);
  assert.equal(events.length, 2);
  assert.equal(events[1].data.token, "[REDACTED]");
});

test("implementation-run store rejects idempotency conflicts and tampered plans", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-run-store-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const store = new ImplementationRunStore({ rootDir });
  const created = await store.create({ spec: spec(), plan });
  await assert.rejects(store.create({ spec: { ...spec(), changed: true }, plan }), (error) => error.code === "IDEMPOTENCY_CONFLICT");
  const statePath = path.join(store.runDir(created.state.runId), "state.json");
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  state.plan.sourceRevision = "b".repeat(40);
  await fs.writeFile(statePath, JSON.stringify(state), "utf8");
  await assert.rejects(store.read(created.state.runId), /plan digest mismatch/);
});

test("implementation-run store rejects symlinked state parents and token-fenced artifacts", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-run-store-"));
  const escapeDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-run-store-escape-"));
  t.after(() => Promise.all([fs.rm(rootDir, { recursive: true, force: true }), fs.rm(escapeDir, { recursive: true, force: true })]));
  await fs.symlink(escapeDir, path.join(rootDir, ".agentic-graph-workspace"));
  const unsafeStore = new ImplementationRunStore({ rootDir });
  await assert.rejects(unsafeStore.create({ spec: spec(), plan }), /Unsafe implementation-run directory/);

  await fs.unlink(path.join(rootDir, ".agentic-graph-workspace"));
  const store = new ImplementationRunStore({ rootDir });
  const created = await store.create({ spec: spec("artifact-key"), plan });
  const owned = await store.update(created.state.runId, { expectedRevision: 1, eventType: "supervisor.owned" }, (state) => {
    state.supervisor = { token: "current-token", pid: 1, status: "active" };
    return state;
  });
  assert.equal(owned.revision, 2);
  await assert.rejects(store.writeArtifact(created.state.runId, "runner.log", "secret", { supervisorToken: "stale-token" }), /fenced/);
  await store.writeArtifact(created.state.runId, "runner.log", "safe", { supervisorToken: "current-token" });
  await assert.rejects(store.writeArtifact(created.state.runId, "runner.log", "replacement", { supervisorToken: "current-token" }), /immutable and already exists/);
  assert.equal(await fs.readFile(path.join(store.runDir(created.state.runId), "runner.log"), "utf8"), "safe");
});

test("state read and initial persistence enforce hard bounds with growth headroom", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-run-store-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const store = new ImplementationRunStore({ rootDir });
  const accepted = await store.create({ spec: { ...spec("growth-headroom-key"), payload: "x".repeat(350000) }, plan });
  const grown = await store.update(accepted.state.runId, { expectedRevision: 1, eventType: "test.growth" }, (state) => { state.result = { evidence: "y".repeat(300000) }; return state; });
  assert.equal(grown.revision, 2);
  await assert.rejects(store.create({ spec: { ...spec("initial-oversize-key"), payload: "x".repeat(600000) }, plan }), (error) => error.code === "DURABLE_STATE_TOO_LARGE");
  const statePath = store.statePath(accepted.state.runId);
  await fs.writeFile(statePath, "x".repeat(1024 * 1024 + 1));
  await assert.rejects(store.read(accepted.state.runId), (error) => error.code === "DURABLE_STATE_TOO_LARGE");
});

test("state reads reject continuous pathname churn after the durable file is opened", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-run-store-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  let armed = false;
  let swaps = 0;
  const store = new ImplementationRunStore({
    rootDir,
    stableFileReader: (options) => readStableBoundedFile({
      ...options,
      afterOpen: async () => {
        if (!armed || path.basename(options.filePath) !== "state.json") return;
        swaps += 1;
        await fs.rename(options.filePath, `${options.filePath}.opened-${swaps}`);
        await fs.writeFile(options.filePath, "{}\n", { mode: 0o600 });
      },
    }),
  });
  const created = await store.create({ spec: spec("state-pathname-swap"), plan });
  armed = true;
  await assert.rejects(
    store.read(created.state.runId),
    (error) => error.code === "DURABLE_STATE_UNSAFE",
  );
  assert.equal(swaps, 4);
});

test("state reads retry a bounded transient atomic replacement", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-run-store-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const writer = new ImplementationRunStore({ rootDir });
  const created = await writer.create({ spec: spec("state-atomic-replacement"), plan });
  let armed = true;
  const reader = new ImplementationRunStore({
    rootDir,
    stableFileReader: (options) => readStableBoundedFile({
      ...options,
      afterOpen: async () => {
        if (!armed || path.basename(options.filePath) !== "state.json") return;
        armed = false;
        await writer.update(created.state.runId, { expectedRevision: 1, eventType: "test.concurrent-update" }, (state) => {
          state.state = "running";
          return state;
        });
      },
    }),
  });
  const state = await reader.read(created.state.runId);
  assert.equal(state.revision, 2);
  assert.equal(state.state, "running");
});

test("implementation-run event reads are bounded to the newest 200 committed revisions", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-run-store-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const store = new ImplementationRunStore({ rootDir });
  let { state } = await store.create({ spec: spec("event-bound-key"), plan });
  for (let index = 0; index < 205; index += 1) {
    state = await store.update(state.runId, { expectedRevision: state.revision, eventType: "test.event", eventData: { index } }, (current) => current);
  }
  const events = await store.events(state.runId);
  assert.equal(events.length, 200);
  assert.equal(events.at(-1).revision, state.revision);
});

test("event reads reject a pathname swap after the durable file is opened", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-run-store-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  let armed = false;
  const store = new ImplementationRunStore({
    rootDir,
    stableFileReader: (options) => readStableBoundedFile({
      ...options,
      afterOpen: async () => {
        if (!armed || !/^\d{10}\.json$/.test(path.basename(options.filePath))) return;
        armed = false;
        await fs.rename(options.filePath, `${options.filePath}.opened`);
        await fs.writeFile(
          options.filePath,
          `${JSON.stringify({ revision: 999, type: "swapped" })}\n`,
          { mode: 0o600 },
        );
      },
    }),
  });
  const created = await store.create({ spec: spec("event-pathname-swap"), plan });
  armed = true;
  await assert.rejects(
    store.events(created.state.runId),
    (error) => error.code === "DURABLE_EVENT_UNSAFE",
  );
});

test("implementation-run updates reject state-parent replacement before creating a lock", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-run-store-"));
  const escapeDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-run-store-escape-"));
  t.after(() => Promise.all([fs.rm(rootDir, { recursive: true, force: true }), fs.rm(escapeDir, { recursive: true, force: true })]));
  const store = new ImplementationRunStore({ rootDir });
  const created = await store.create({ spec: spec("parent-swap-key"), plan });
  const workspace = path.join(rootDir, ".agentic-graph-workspace");
  await fs.rename(workspace, `${workspace}.saved`);
  await fs.symlink(escapeDir, workspace);
  await assert.rejects(
    store.update(created.state.runId, { expectedRevision: 1, eventType: "unsafe.update" }, (state) => state),
    /Unsafe implementation-run directory|escapes runtime root/,
  );
  assert.equal(await fs.lstat(path.join(escapeDir, "implementation-runs", created.state.runId, ".state.lock")).then(() => true, () => false), false);
});
