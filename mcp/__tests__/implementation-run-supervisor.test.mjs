import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import { createImplementationRunRuntime } from "../implementation-run-runtime.js";
import { processMarker } from "../implementation-run-managed-process.js";
import { createImplementationRunSupervisor } from "../implementation-run-supervisor.js";
import {
  createHappyLifecycle,
  createReviewControlLifecycle,
  fakeSupervisorSpawn,
  fixture,
  git,
  machinePayload,
  own,
  pathExistsForTest,
  prepareReviewReady,
  provisionLane,
  retryOwned,
} from "./implementation-run-supervisor-fixture.mjs";

test("supervisor reaches review-ready without publish and replays a lost review response", async (t) => {
  const fx = await fixture(t);
  let state = fx.created.state;
  let lease = null;
  let loseReview = true;
  const actions = [];
  const pullRequest = { url: "https://github.com/example/target/pull/42", number: 42 };
  const payload = (action, status, provisioned = false) => ({
    schema: "agentic-device-command-result/v1", ok: true, action, status,
    repoRoot: state.plan.derivedWorktreePath, worktreePath: state.plan.derivedWorktreePath,
    branch: lease.branch, provisioned, pullRequest: { ...pullRequest, isDraft: status !== "review_ready" }, lease: { ...lease, status },
  });
  const acosInvoker = async ({ action, sessionId }) => {
    actions.push(action);
    if (action === "start") {
      const branch = `agent/test/${state.plan.acosSemanticScope}`;
      await git(state.spec.repoRoot, ["worktree", "add", "--detach", state.plan.derivedWorktreePath, "refs/remotes/origin/main"]);
      await git(state.plan.derivedWorktreePath, ["switch", "--create", branch]);
      await git(state.plan.derivedWorktreePath, ["commit", "--allow-empty", "-m", "chore: claim"]);
      const fenceSha = (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim();
      await git(state.plan.derivedWorktreePath, ["push", "--set-upstream", "origin", branch]);
      lease = { schema: "agentic-writer-lease/v2", status: "active", epoch: 1, sessionId, device: "test", scope: state.plan.acosSemanticScope, branch, worktreePath: state.plan.derivedWorktreePath, baseSha: fx.sourceRevision, fenceSha, pullRequestUrl: pullRequest.url };
      return payload("start", "active", true);
    }
    if (action === "review") {
      await git(state.plan.derivedWorktreePath, ["push", "origin", lease.branch]);
      lease = { ...lease, status: "review_ready", reviewHeadSha: (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim() };
      if (loseReview) { loseReview = false; throw new Error("simulated lost review response"); }
      return payload("review", "review_ready");
    }
    if (action === "heartbeat") return payload("heartbeat", "active");
    throw new Error(`unexpected ACOS action: ${action}`);
  };

  let token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  let supervisor = createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker });
  await supervisor.run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "blocked", JSON.stringify({ error: state.error, result: state.result, activeProcesses: state.activeProcesses, actions }));
  assert.equal(state.coordinationIntent?.action, "review", JSON.stringify({ error: state.error, result: state.result, actions }));
  assert.equal(state.result.handoffPending, true);

  token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  supervisor = createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker });
  await supervisor.run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "delivery_ready");
  assert.equal(state.result.automaticMerge, false);
  assert.equal(state.result.deployment, false);
  assert.deepEqual(actions, ["start", "review", "review"]);
  assert.equal(actions.includes("publish"), false);
  assert.equal((await git(state.spec.repoRoot, ["rev-parse", "HEAD"])).stdout.trim(), fx.sourceRevision);
  assert.equal((await git(state.spec.repoRoot, ["ls-remote", "origin", "refs/heads/main"])).stdout.trim().split(/\s+/)[0], fx.sourceRevision);
  assert.equal((await git(state.plan.derivedWorktreePath, ["status", "--porcelain"])).stdout.trim(), "");
});

test("cancel before the initial claim completes as canceled without lifecycle cleanup", async (t) => {
  const fx = await fixture(t);
  let state = fx.created.state;
  const token = crypto.randomUUID();
  state = await fx.runtime.store.update(state.runId, { expectedRevision: state.revision, eventType: "test.cancel" }, (current) => {
    current.control = { action: "cancel", requestedAt: new Date().toISOString(), requestId: "preclaim-cancel" };
    return current;
  });
  state = await own(fx.runtime.store, state, token);
  const supervisor = createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker: async () => { throw new Error("ACOS must not be called before a claim exists"); } });
  await supervisor.run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "canceled");
  assert.equal(state.coordination.status, "not_created");
  assert.equal(await fs.lstat(state.plan.derivedWorktreePath).then(() => true, (error) => error.code === "ENOENT" ? false : Promise.reject(error)), false);
});

test("no-worktree cancel succeeds while host registries are unavailable", async (t) => {
  const fx = await fixture(t);
  let state = fx.created.state;
  state = await fx.runtime.store.update(state.runId, { expectedRevision: state.revision, eventType: "test.cancel" }, (current) => { current.control = { action: "cancel", requestedAt: new Date().toISOString(), requestId: "offline-cancel" }; return current; });
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  const unavailableEnv = { ...fx.env, KNOWGRPH_IMPLEMENTATION_ACOS_ROOT: "/missing/acos", KNOWGRPH_IMPLEMENTATION_RUNNERS_JSON: "not-json", KNOWGRPH_IMPLEMENTATION_VERIFIERS_JSON: "not-json", KNOWGRPH_IMPLEMENTATION_REPOSITORIES_JSON: "not-json" };
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: unavailableEnv, acosInvoker: async () => { throw new Error("must not run"); } }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "canceled");
  assert.equal(state.coordination.status, "not_created");
});

test("active pause parks after execution authority is revoked and replays a lost park response", async (t) => {
  const fx = await fixture(t);
  let state = fx.created.state;
  const { lease, pullRequest } = await provisionLane(fx, state, `knowgrph-${state.runId}`, "revoked-pause");
  state = await fx.runtime.store.update(state.runId, { expectedRevision: state.revision, eventType: "test.active_pause" }, (current) => { current.state = "running"; current.coordination = machinePayload(state, lease, pullRequest, "heartbeat", "active"); current.control = { action: "pause", requestedAt: new Date().toISOString(), requestId: "revoked-pause" }; return current; });
  const lifecycle = createReviewControlLifecycle(state, lease, pullRequest, { losePark: true });
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  await fs.writeFile(path.join(state.spec.repoRoot, state.spec.sandboxPolicyPath), "{}\n");
  const revokedEnv = { ...fx.env, KNOWGRPH_IMPLEMENTATION_RUNNERS_JSON: "{}", KNOWGRPH_IMPLEMENTATION_VERIFIERS_JSON: "{}" };
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: revokedEnv, acosInvoker: lifecycle.invoke }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "paused", JSON.stringify(state.error));
  assert.equal(state.coordination.status, "parked");
  assert.deepEqual(lifecycle.actions, ["park", "park"]);
});

test("supervisor rejects a pushurl-only origin mutation before ACOS can push", async (t) => {
  const fx = await fixture(t);
  await git(fx.created.state.spec.repoRoot, ["remote", "set-url", "--add", "--push", "origin", path.join(path.dirname(fx.origin), "substituted.git")]);
  let state = fx.created.state;
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  const actions = [];
  const supervisor = createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker: async ({ action }) => { actions.push(action); throw new Error("must not execute"); } });
  await supervisor.run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "blocked");
  assert.match(state.error.message, /origin identity changed/);
  assert.deepEqual(actions, []);
});

test("supervisor rejects an ACOS branch outside the pinned run scope", async (t) => {
  const fx = await fixture(t);
  let state = fx.created.state;
  const lifecycle = createHappyLifecycle(fx, state);
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker: async (input) => {
    const result = await lifecycle.invoke(input);
    return { ...result, branch: "agent/test/wrong-scope", lease: { ...result.lease, branch: "agent/test/wrong-scope", scope: "wrong-scope" } };
  } }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "blocked");
  assert.match(state.error.message, /run-owned semantic scope/);
  assert.equal((await fs.readdir(fx.runtime.store.runDir(state.runId))).some((name) => name.includes("runner-request")), false);
});

test("supervisor blocks a same-inode sandbox-policy swap before lifecycle or runner launch", async (t) => {
  const fx = await fixture(t);
  let state = fx.created.state;
  const policyPath = path.join(state.spec.repoRoot, state.spec.sandboxPolicyPath);
  const before = await fs.stat(policyPath);
  const policy = await fs.readFile(policyPath, "utf8");
  await fs.writeFile(policyPath, policy.replace("supervisor-test", "supervisor-evil"));
  assert.equal(String((await fs.stat(policyPath)).ino), String(before.ino));
  const actions = [], token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker: async ({ action }) => { actions.push(action); throw new Error("must not run"); } }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "blocked");
  assert.match(state.error.message, /content changed|policy/i);
  assert.deepEqual(actions, []);
});

test("partial provision retries start against the existing task worktree without provisioning again", async (t) => {
  const fx = await fixture(t);
  let state = fx.created.state;
  const token = crypto.randomUUID();
  const sessionId = `knowgrph-${state.runId}`;
  let { lease, pullRequest } = await provisionLane(fx, state, sessionId, "partial-start");
  const actions = [];
  const acosInvoker = async ({ action, provision, repository }) => {
    actions.push(action);
    if (action === "heartbeat") throw new Error("partial lease has no ownership PR yet");
    if (action === "start") {
      assert.equal(provision, false);
      assert.equal(repository, state.plan.derivedWorktreePath);
      return machinePayload(state, lease, pullRequest, "start", "active", false);
    }
    if (action === "review") {
      await git(state.plan.derivedWorktreePath, ["push", "origin", lease.branch]);
      lease = { ...lease, status: "review_ready", reviewHeadSha: (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim() };
      return machinePayload(state, lease, pullRequest, "review", "review_ready");
    }
    throw new Error(`unexpected action ${action}`);
  };
  state = await own(fx.runtime.store, state, token);
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "delivery_ready", JSON.stringify({ error: state.error, actions }));
  assert.deepEqual(actions, ["heartbeat", "start", "review"]);
});

test("expired retry fails closed, then reconciles a lost successful resume by heartbeat", async (t) => {
  const fx = await fixture(t);
  let state = fx.created.state;
  const sessionId = `knowgrph-${state.runId}`;
  let { lease, pullRequest } = await provisionLane(fx, state, sessionId, "expired-retry");
  let remoteStatus = "expired";
  let loseResume = true;
  const actions = [];
  const acosInvoker = async ({ action }) => {
    actions.push(action);
    if (action === "heartbeat") {
      if (remoteStatus !== "active") throw new Error(`lease is ${remoteStatus}`);
      return machinePayload(state, lease, pullRequest, "heartbeat", "active");
    }
    if (action === "resume") {
      if (remoteStatus === "expired") throw new Error("attached expired lease must be parked before resume");
      await git(state.plan.derivedWorktreePath, ["switch", lease.branch]);
      await git(state.plan.derivedWorktreePath, ["commit", "--allow-empty", "-m", "chore: resumed claim"]);
      lease = { ...lease, status: "active", epoch: lease.epoch + 1, fenceSha: (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim() };
      await git(state.plan.derivedWorktreePath, ["push", "origin", lease.branch]);
      remoteStatus = "active";
      if (loseResume) { loseResume = false; throw new Error("simulated lost resume response"); }
      return machinePayload(state, lease, pullRequest, "resume", "active");
    }
    if (action === "park") {
      await git(state.plan.derivedWorktreePath, ["switch", "--detach", "origin/main"]);
      remoteStatus = "parked";
      lease = { ...lease, status: "parked" };
      return machinePayload(state, lease, pullRequest, "park", "parked");
    }
    if (action === "review") {
      await git(state.plan.derivedWorktreePath, ["push", "origin", lease.branch]);
      lease = { ...lease, status: "review_ready", reviewHeadSha: (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim() };
      remoteStatus = "review_ready";
      return machinePayload(state, lease, pullRequest, "review", "review_ready");
    }
    throw new Error(`unexpected action ${action}`);
  };
  state = await fx.runtime.store.update(state.runId, { expectedRevision: state.revision, eventType: "test.expired" }, (current) => {
    current.state = "blocked";
    current.coordination = machinePayload(state, lease, pullRequest, "heartbeat", "active");
    current.error = { code: "verification_failed", message: "retry after delay" };
    current.supervisor.status = "stopped";
    return current;
  });
  let owned = await retryOwned(fx.runtime.store, state);
  state = owned.state;
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token: owned.token, env: fx.env, acosInvoker }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.error.code, "lease_reactivation_required");
  owned = await retryOwned(fx.runtime.store, state);
  state = owned.state;
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token: owned.token, env: fx.env, acosInvoker }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.error.code, "lease_reactivation_required", JSON.stringify({ error: state.error, actions }));
  owned = await retryOwned(fx.runtime.store, state);
  state = owned.state;
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token: owned.token, env: fx.env, acosInvoker }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "delivery_ready", JSON.stringify({ error: state.error, actions }));
  assert.deepEqual(actions, ["heartbeat", "heartbeat", "resume", "heartbeat", "park", "resume", "heartbeat", "review"]);
});

test("expired retry refuses to auto-park a dirty task worktree", async (t) => {
  const fx = await fixture(t);
  let state = fx.created.state;
  const sessionId = `knowgrph-${state.runId}`;
  const { lease, pullRequest } = await provisionLane(fx, state, sessionId, "dirty-expired");
  await fs.mkdir(path.join(state.plan.derivedWorktreePath, "src"), { recursive: true });
  await fs.writeFile(path.join(state.plan.derivedWorktreePath, "src", "partial.txt"), "preserve me\n");
  const actions = [];
  state = await fx.runtime.store.update(state.runId, { expectedRevision: state.revision, eventType: "test.dirty_expired" }, (current) => {
    current.state = "blocked";
    current.coordination = machinePayload(state, lease, pullRequest, "heartbeat", "active");
    current.error = { code: "lease_reactivation_required", message: "expired" };
    current.supervisor.status = "stopped";
    return current;
  });
  const owned = await retryOwned(fx.runtime.store, state);
  state = owned.state;
  const acosInvoker = async ({ action }) => { actions.push(action); throw new Error("expired attached lease"); };
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token: owned.token, env: fx.env, acosInvoker }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "blocked");
  assert.equal(state.error.code, "manual_recovery_required");
  assert.match(state.error.message, /clean task worktree/);
  assert.equal(await fs.readFile(path.join(state.plan.derivedWorktreePath, "src", "partial.txt"), "utf8"), "preserve me\n");
  assert.deepEqual(actions, ["heartbeat", "resume", "heartbeat"]);
});

test("allowed deletion remains valid when its immediate parent directory disappears", async (t) => {
  const runnerSource = `#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const request = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
fs.rmSync(request.workspacePath + "/src", { recursive: true });
execFileSync("git", ["-C", request.workspacePath, "add", "-A"]);
execFileSync("git", ["-C", request.workspacePath, "commit", "-m", "fix: remove obsolete source"]);
`;
  const fx = await fixture(t, { runnerSource, targetFiles: { "src/only.txt": "obsolete\n" } });
  let state = fx.created.state;
  const lifecycle = createHappyLifecycle(fx, state);
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker: lifecycle.invoke }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "delivery_ready", JSON.stringify(state.error));
  assert.deepEqual(state.result.changedPaths, ["src/only.txt"]);
  assert.equal(await pathExistsForTest(path.join(state.plan.derivedWorktreePath, "src")), false);
});

test("failed verifier persists a bounded receipt and redacted output artifact", async (t) => {
  const verifierSource = `#!/usr/bin/env node
process.stdout.write("token=very-secret-value\\n" + "x".repeat(100000));
process.stderr.write("verification diagnostic\\n");
process.exitCode = 1;
`;
  const fx = await fixture(t, { verifierSource });
  let state = fx.created.state;
  const lifecycle = createHappyLifecycle(fx, state);
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker: lifecycle.invoke }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "failed");
  const evidence = state.result.failureEvidence.verification;
  assert.ok(Buffer.byteLength(JSON.stringify(evidence)) <= 32768);
  assert.equal(evidence.length, 1);
  assert.match(evidence[0].outputArtifact, /^attempt-0001-revision-\d{10}-verification-000\.log$/);
  assert.match(evidence[0].outputDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(evidence[0].outputTruncated, true);
  assert.equal(JSON.stringify(evidence).includes("very-secret-value"), false);
  const artifact = await fs.readFile(path.join(state.spec.repoRoot, ".knowgrph-workspace", "implementation-runs", state.runId, evidence[0].outputArtifact), "utf8");
  assert.equal(artifact.includes("very-secret-value"), false);
  assert.match(artifact, /\[REDACTED\]/);
  assert.equal(Buffer.byteLength(artifact), evidence[0].outputBytes);
  assert.equal(`sha256:${crypto.createHash("sha256").update(artifact).digest("hex")}`, evidence[0].outputDigest);
});

test("code-zero runner manager with a stdio drain timeout blocks with a durable receipt", async (t) => {
  const fx = await fixture(t);
  let state = fx.created.state;
  const lifecycle = createHappyLifecycle(fx, state);
  const marker = await processMarker(process.pid);
  const spawnImpl = (_command, argv) => {
    const child = new EventEmitter(); child.pid = process.pid; child.exitCode = null; child.signalCode = null; child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const operationId = argv[argv.indexOf("--operation") + 1], managedRunId = argv[argv.indexOf("--run") + 1];
    queueMicrotask(async () => {
      child.emit("spawn");
      await fx.runtime.store.update(managedRunId, { eventType: "fake.register" }, (current) => { current.activeProcesses[operationId] = { operationId, phase: "runner", status: "registered", managerPid: process.pid, managerMarker: marker, childPid: null, childMarker: null }; return current; });
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) { if ((await fx.runtime.store.read(managedRunId)).activeProcesses[operationId]?.status === "authorized") break; await new Promise((resolve) => setTimeout(resolve, 10)); }
      child.exitCode = 0; child.emit("exit", 0, null);
    });
    return child;
  };
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker: lifecycle.invoke, spawnImpl }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "blocked");
  assert.equal(state.error.code, "PROCESS_STDIO_DRAIN_TIMEOUT");
  assert.equal(state.result.failureEvidence.runner.processErrorCode, "PROCESS_STDIO_DRAIN_TIMEOUT");
  assert.equal(state.result.failureEvidence.runner.outputTruncated, true);
});

test("retry evidence uses immutable attempt-scoped artifacts and events retain prior receipts", async (t) => {
  const fx = await fixture(t, { runnerSource: "#!/usr/bin/env node\nprocess.stdout.write('attempt output\\n'); process.exitCode = 1;\n" });
  let state = fx.created.state;
  const lifecycle = createHappyLifecycle(fx, state);
  let token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker: lifecycle.invoke }).run();
  state = await fx.runtime.store.read(state.runId);
  const first = state.result.failureEvidence.runner;
  assert.match(first.requestDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(first.outputDigest, /^sha256:[a-f0-9]{64}$/);
  ({ state, token } = await retryOwned(fx.runtime.store, state));
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker: lifecycle.invoke }).run();
  state = await fx.runtime.store.read(state.runId);
  const second = state.result.failureEvidence.runner;
  assert.notEqual(second.requestArtifact, first.requestArtifact);
  assert.notEqual(second.outputArtifact, first.outputArtifact);
  for (const artifact of [first.requestArtifact, first.outputArtifact, second.requestArtifact, second.outputArtifact]) await fs.access(path.join(fx.runtime.store.runDir(state.runId), artifact));
  const events = await fx.runtime.store.events(state.runId);
  const serialized = JSON.stringify(events);
  assert.match(serialized, new RegExp(first.outputArtifact));
  assert.match(serialized, new RegExp(second.outputArtifact));
});

test("dirty runner pause parks exact partial work and retry restores it", async (t) => {
  const runnerSource = `#!/usr/bin/env node
import { execFileSync } from "node:child_process"; import fs from "node:fs"; import path from "node:path";
const request = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); const target = path.join(request.workspacePath, "src", "partial.txt");
if (!fs.existsSync(target)) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, "partial survives pause\\n"); setInterval(() => {}, 1000); }
else { fs.appendFileSync(target, "resumed\\n"); execFileSync("git", ["-C", request.workspacePath, "add", "src/partial.txt"]); execFileSync("git", ["-C", request.workspacePath, "commit", "-m", "feat: finish restored partial"]); }
`;
  const fx = await fixture(t, { runnerSource });
  let state = fx.created.state, lease, stashSha = "", remoteStatus = "none";
  const pullRequest = { url: "https://github.com/example/target/pull/96", number: 96 };
  const actions = [];
  const acosInvoker = async ({ action, sessionId }) => {
    actions.push(action);
    if (action === "start") {
      const branch = `agent/test/${state.plan.acosSemanticScope}`;
      await git(state.spec.repoRoot, ["worktree", "add", "--detach", state.plan.derivedWorktreePath, "refs/remotes/origin/main"]); await git(state.plan.derivedWorktreePath, ["switch", "--create", branch]); await git(state.plan.derivedWorktreePath, ["commit", "--allow-empty", "-m", "chore: claim"]);
      const fenceSha = (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim(); await git(state.plan.derivedWorktreePath, ["push", "--set-upstream", "origin", branch]);
      lease = { schema: "agentic-writer-lease/v2", status: "active", epoch: 1, sessionId, device: "test", scope: state.plan.acosSemanticScope, branch, worktreePath: state.plan.derivedWorktreePath, baseSha: fx.sourceRevision, fenceSha, pullRequestUrl: pullRequest.url }; remoteStatus = "active";
      return machinePayload(state, lease, pullRequest, "start", "active", true);
    }
    if (action === "heartbeat") { if (remoteStatus !== "active") throw new Error(`lease is ${remoteStatus}`); return machinePayload(state, lease, pullRequest, "heartbeat", "active"); }
    if (action === "park") {
      await git(state.plan.derivedWorktreePath, ["stash", "push", "--include-untracked", "-m", `pause-${state.runId}`]); stashSha = (await git(state.plan.derivedWorktreePath, ["rev-parse", "stash@{0}"])).stdout.trim(); await git(state.plan.derivedWorktreePath, ["switch", "--detach", "origin/main"]);
      lease = { ...lease, status: "parked", parkStashSha: stashSha }; remoteStatus = "parked"; return machinePayload(state, lease, pullRequest, "park", "parked");
    }
    if (action === "resume") {
      await git(state.plan.derivedWorktreePath, ["switch", lease.branch]); await git(state.plan.derivedWorktreePath, ["stash", "apply", stashSha]); lease = { ...lease, status: "active", epoch: lease.epoch + 1, parkStashSha: stashSha }; remoteStatus = "active"; return machinePayload(state, lease, pullRequest, "resume", "active");
    }
    if (action === "review") { await git(state.plan.derivedWorktreePath, ["push", "origin", lease.branch]); lease = { ...lease, status: "review_ready", reviewHeadSha: (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim() }; remoteStatus = "review_ready"; return machinePayload(state, lease, pullRequest, "review", "review_ready"); }
    throw new Error(`unexpected action ${action}`);
  };
  let token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  const firstRun = createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker }).run();
  const partialPath = path.join(state.plan.derivedWorktreePath, "src", "partial.txt"), deadline = Date.now() + 10000;
  while (!await pathExistsForTest(partialPath) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(await pathExistsForTest(partialPath), true);
  let current = await fx.runtime.store.read(state.runId);
  await fx.runtime.store.update(state.runId, { expectedRevision: current.revision, eventType: "test.pause_dirty" }, (owned) => { owned.control = { action: "pause", requestedAt: new Date().toISOString(), requestId: "pause-dirty" }; return owned; });
  await firstRun;
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "paused", JSON.stringify(state.error));
  assert.equal(state.coordination.status, "parked");
  assert.match(state.coordination.lease.parkStashSha, /^[a-f0-9]{40}$/);
  assert.match(state.result.failureEvidence.runner.outputArtifact, /^attempt-0001-/);
  ({ state, token } = await retryOwned(fx.runtime.store, state));
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "delivery_ready", JSON.stringify(state.error));
  assert.equal(await fs.readFile(partialPath, "utf8"), "partial survives pause\nresumed\n");
  assert.deepEqual(actions, ["start", "park", "heartbeat", "resume", "review"]);
});

test("serialized verification receipt arrays remain within the 32 KiB aggregate cap", async (t) => {
  const verifierSource = `#!/usr/bin/env node
process.stdout.write("\\u0001".repeat(4096));
`;
  const fx = await fixture(t, { verifierSource, verificationCount: 25 });
  let state = fx.created.state;
  const lifecycle = createHappyLifecycle(fx, state);
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker: lifecycle.invoke }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "delivery_ready", JSON.stringify(state.error));
  assert.equal(state.result.verification.length, 25);
  assert.ok(Buffer.byteLength(JSON.stringify(state.result.verification)) <= 32768);
});

test("changes requested proves active draft ownership, including a lost resume response", async (t) => {
  const fx = await fixture(t);
  let prepared = await prepareReviewReady(fx);
  let state = prepared.state;
  state = await fx.runtime.store.update(state.runId, { expectedRevision: state.revision, eventType: "test.changes_requested" }, (current) => {
    current.state = "queued";
    current.review = { decision: "changes_requested", note: "revise", decidedAt: new Date().toISOString() };
    current.control = { action: "pause", requestedAt: new Date().toISOString(), requestId: "changes-requested" };
    current.result.controlDispositionPending = "pause";
    return current;
  });
  const lifecycle = createReviewControlLifecycle(state, prepared.lease, prepared.pullRequest, { loseResume: true });
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker: lifecycle.invoke }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "paused", JSON.stringify(state.error));
  assert.equal(state.coordination.status, "parked");
  assert.equal(state.coordination.lease.status, "parked");
  assert.equal(state.result.controlDispositionPending, null);
  assert.deepEqual(lifecycle.actions, ["heartbeat", "resume", "heartbeat", "park"]);
});

test("pause racing the review response resumes the ready PR before becoming paused", async (t) => {
  const fx = await fixture(t);
  let state = fx.created.state;
  let lease = null;
  let remoteStatus = "none";
  const pullRequest = { url: "https://github.com/example/target/pull/94", number: 94 };
  const actions = [];
  const acosInvoker = async ({ action, sessionId }) => {
    actions.push(action);
    if (action === "start") {
      const branch = `agent/test/${state.plan.acosSemanticScope}`;
      await git(state.spec.repoRoot, ["worktree", "add", "--detach", state.plan.derivedWorktreePath, "refs/remotes/origin/main"]);
      await git(state.plan.derivedWorktreePath, ["switch", "--create", branch]);
      await git(state.plan.derivedWorktreePath, ["commit", "--allow-empty", "-m", "chore: claim"]);
      const fenceSha = (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim();
      await git(state.plan.derivedWorktreePath, ["push", "--set-upstream", "origin", branch]);
      lease = { schema: "agentic-writer-lease/v2", status: "active", epoch: 1, sessionId, device: "test", scope: state.plan.acosSemanticScope, branch, worktreePath: state.plan.derivedWorktreePath, baseSha: fx.sourceRevision, fenceSha, pullRequestUrl: pullRequest.url };
      remoteStatus = "active";
      return machinePayload(state, lease, pullRequest, "start", "active", true);
    }
    if (action === "review") {
      await git(state.plan.derivedWorktreePath, ["push", "origin", lease.branch]);
      lease = { ...lease, status: "review_ready", reviewHeadSha: (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim() };
      remoteStatus = "review_ready";
      const latest = await fx.runtime.store.read(state.runId);
      await fx.runtime.store.update(state.runId, { expectedRevision: latest.revision, eventType: "test.pause_race" }, (current) => {
        current.control = { action: "pause", requestedAt: new Date().toISOString(), requestId: "pause-race" };
        return current;
      });
      return machinePayload(state, lease, pullRequest, "review", "review_ready");
    }
    if (action === "heartbeat") {
      if (remoteStatus !== "active") throw new Error("review handoff is not active");
      return machinePayload(state, lease, pullRequest, "heartbeat", "active");
    }
    if (action === "resume") {
      await git(state.plan.derivedWorktreePath, ["commit", "--allow-empty", "-m", "chore: draft after pause race"]);
      lease = { ...lease, status: "active", epoch: lease.epoch + 1, fenceSha: (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim() };
      await git(state.plan.derivedWorktreePath, ["push", "origin", lease.branch]);
      remoteStatus = "active";
      return machinePayload(state, lease, pullRequest, "resume", "active");
    }
    if (action === "park") {
      lease = { ...lease, status: "parked" };
      remoteStatus = "parked";
      return machinePayload(state, lease, pullRequest, "park", "parked");
    }
    throw new Error(`unexpected action ${action}`);
  };
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "paused", JSON.stringify({ error: state.error, actions }));
  assert.equal(state.coordination.status, "parked");
  assert.deepEqual(actions, ["start", "review", "heartbeat", "resume", "park"]);
});

test("maxAttempts one still permits changes-requested demotion followed by cancel parking", async (t) => {
  const fx = await fixture(t, { maxAttempts: 1 });
  let prepared = await prepareReviewReady(fx);
  let state = prepared.state;
  let spawns = 0;
  const controlRuntime = createImplementationRunRuntime({ rootDir: state.spec.repoRoot, env: fx.env, recoveryIntervalMs: 0, spawnImpl: () => { spawns += 1; return fakeSupervisorSpawn(); } });
  let result = await controlRuntime.control({ runId: state.runId, action: "review", reviewDecision: "changes_requested", note: "revise", expectedRevision: state.revision });
  assert.equal(result.ok, true);
  state = await controlRuntime.store.read(state.runId);
  let lifecycle = createReviewControlLifecycle(state, prepared.lease, prepared.pullRequest);
  let token = crypto.randomUUID();
  state = await own(controlRuntime.store, state, token);
  await createImplementationRunSupervisor({ rootDir: state.spec.repoRoot, runId: state.runId, token, env: fx.env, acosInvoker: lifecycle.invoke }).run();
  state = await controlRuntime.store.read(state.runId);
  assert.equal(state.state, "paused");
  state = await controlRuntime.store.update(state.runId, { expectedRevision: state.revision, eventType: "test.worker_exited" }, (current) => { current.supervisor.pid = 99999994; current.supervisor.processMarker = "dead"; return current; });
  result = await controlRuntime.control({ runId: state.runId, action: "cancel", expectedRevision: state.revision });
  assert.equal(result.ok, true);
  state = await controlRuntime.store.read(state.runId);
  assert.equal(state.state, "canceled", JSON.stringify(state.error));
  assert.equal(state.coordination.status, "parked");
  assert.equal(spawns, 1);
});
