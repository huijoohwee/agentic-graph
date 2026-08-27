import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { createImplementationRunRuntime } from "../implementation-run-runtime.js";
import { processMarker } from "../implementation-run-managed-process.js";

const exec = promisify(execFile);

export const git = (root, args) => exec("git", ["-C", root, ...args], { encoding: "utf8" });

export const pathExistsForTest = async (candidate) => fs.lstat(candidate).then(
  () => true,
  (error) => error?.code === "ENOENT" ? false : Promise.reject(error),
);

export const fakeSupervisorSpawn = () => {
  const child = new EventEmitter();
  child.pid = process.pid;
  child.exitCode = null;
  child.unref = () => undefined;
  child.kill = () => true;
  queueMicrotask(() => child.emit("spawn"));
  return child;
};

async function initializeLocalRepo(root, files) {
  await fs.mkdir(root, { recursive: true });
  await git(root, ["init", "-b", "main"]);
  await git(root, ["config", "user.email", "supervisor-test@example.invalid"]);
  await git(root, ["config", "user.name", "Supervisor Test"]);
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content, "utf8");
  }
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "fixture"]);
  await git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
}

export async function fixture(t, options = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-supervisor-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const origin = path.join(base, "origin.git");
  await exec("git", ["init", "--bare", origin]);
  const repoRoot = path.join(base, "target");
  await exec("git", ["clone", origin, repoRoot]);
  await git(repoRoot, ["switch", "--create", "main"]);
  await git(repoRoot, ["config", "user.email", "supervisor-test@example.invalid"]);
  await git(repoRoot, ["config", "user.name", "Supervisor Test"]);
  const runner = path.join(base, "managed-runner.mjs");
  await fs.writeFile(runner, options.runnerSource || `#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const request = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
fs.mkdirSync(path.join(request.workspacePath, "src"), { recursive: true });
fs.writeFileSync(path.join(request.workspacePath, "src", "managed-result.txt"), "review ready\\n");
execFileSync("git", ["-C", request.workspacePath, "add", "src/managed-result.txt"]);
execFileSync("git", ["-C", request.workspacePath, "commit", "-m", "feat: managed result"]);
`, "utf8");
  await fs.chmod(runner, 0o755);
  const runnerReal = await fs.realpath(runner);
  let trueExecutable = await fs.realpath("/usr/bin/true");
  if (options.verifierSource) {
    trueExecutable = path.join(base, "verifier.mjs");
    await fs.writeFile(trueExecutable, options.verifierSource, "utf8");
    await fs.chmod(trueExecutable, 0o755);
    trueExecutable = await fs.realpath(trueExecutable);
  }
  const policy = JSON.stringify({
    schema: "agenticgraph-agent-sandbox-policy/v1", policy_id: "supervisor-test",
    filesystem: { read: ["."], write: ["src"] },
    process: { executables: [runnerReal, trueExecutable], max_runtime_ms: 120000, max_output_bytes: 65536 },
    network: { default: "deny", rules: [] }, credentials: { environment: [] },
    audit: { decision_log: "required", redact_values: true },
  });
  await fs.writeFile(path.join(repoRoot, ".gitignore"), ".agenticgraph-workspace/\n", "utf8");
  await fs.writeFile(path.join(repoRoot, "policy.json"), policy, "utf8");
  await fs.writeFile(path.join(repoRoot, "README.md"), "# Target\n", "utf8");
  for (const [name, content] of Object.entries(options.targetFiles || {})) {
    await fs.mkdir(path.dirname(path.join(repoRoot, name)), { recursive: true });
    await fs.writeFile(path.join(repoRoot, name), content, "utf8");
  }
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-m", "target fixture"]);
  await git(repoRoot, ["push", "--set-upstream", "origin", "main"]);
  const sourceRevision = (await git(repoRoot, ["rev-parse", "HEAD"])).stdout.trim();
  const worktreeRoot = path.join(base, ".worktrees", "target");
  await fs.mkdir(worktreeRoot, { recursive: true });
  const acosRoot = path.join(base, "agentic-canvas-os");
  await initializeLocalRepo(acosRoot, {
    "docs/FACTS.md": "---\ndictionary_entries: []\n---\n",
    "docs/DICTIONARY-COMMAND.md": "---\ndictionary_entries:\n  - \"/implementation.run\"\n---\n| `/implementation.run` | Run |\n",
    "docs/DICTIONARY-SEMANTIC.md": "---\ndictionary_entries:\n  - \"#managed-implementation-run\"\n---\n| `#managed-implementation-run` | Run |\n",
    "docs/DICTIONARY-BINDING.md": "---\ndictionary_entries:\n  - \"@work-item\"\n  - \"@implementation-run\"\n---\n| `@work-item` | Item |\n| `@implementation-run` | Run |\n",
    "scripts/device-branch.mjs": "// trusted fixture\n",
  });
  const acosRevision = (await git(acosRoot, ["rev-parse", "HEAD"])).stdout.trim();
  const verifierProfiles = Object.fromEntries(Array.from(
    { length: options.verificationCount || 1 },
    (_, index) => [`fixture_verify_${index}`, { executable: trueExecutable, args: [], environment: [], timeoutMs: 10000 }],
  ));
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    AGENTICGRAPH_IMPLEMENTATION_ACOS_ROOT: acosRoot,
    AGENTICGRAPH_IMPLEMENTATION_RUNNERS_JSON: JSON.stringify({ fixture: { executable: runnerReal, args: ["{{requestPath}}"], environment: [] } }),
    AGENTICGRAPH_IMPLEMENTATION_VERIFIERS_JSON: JSON.stringify(verifierProfiles),
    AGENTICGRAPH_IMPLEMENTATION_REPOSITORIES_JSON: JSON.stringify([{ repoRoot, worktreeRoot }]),
  };
  const spec = {
    invocation: { action: "/implementation.run", semantic: "#managed-implementation-run", bindings: ["@work-item", "@implementation-run"] },
    workItem: { id: "supervisor", objective: "Create a committed review handoff", acceptance: ["Result is committed"] },
    repoRoot,
    worktreeRoot,
    agenticCanvasOsRoot: acosRoot,
    semanticScope: "supervisor-test",
    runnerId: "fixture",
    sandboxPolicyPath: "policy.json",
    allowedPaths: ["src"],
    verification: Object.keys(verifierProfiles).map((profileId) => ({ profileId })),
    idempotencyKey: "supervisor-integration-key",
    bounds: { maxAttempts: options.maxAttempts || 3, maxRuntimeMs: 120000, maxOutputBytes: 65536, leaseTtlSeconds: 600 },
  };
  const runtime = createImplementationRunRuntime({ rootDir: repoRoot, env, supportedAcosRevision: acosRevision });
  const planned = await runtime.plan(spec);
  assert.equal(planned.ok, true, JSON.stringify(planned.diagnostics));
  const created = await runtime.store.create({ spec: planned.normalizedSpec, plan: { ...planned, normalizedSpec: undefined } });
  return { runtime, env, sourceRevision, origin, created };
}

export async function own(store, state, token) {
  const marker = await processMarker(process.pid);
  return store.update(state.runId, { expectedRevision: state.revision, eventType: "test.supervisor_owned" }, (current) => {
    current.supervisor = { pid: process.pid, token, epoch: Number(current.supervisor?.epoch || 0) + 1, status: "active", heartbeatAt: new Date().toISOString(), processMarker: marker };
    return current;
  });
}

export const machinePayload = (state, lease, pullRequest, action, status, provisioned = false) => {
  let projectedLease = { ...lease, status };
  if (action === "park") {
    const hasStash = Boolean(projectedLease.parkStashSha);
    projectedLease = {
      ...projectedLease,
      parkHeadSha: projectedLease.parkHeadSha || state.plan.sourceRevision,
      parkBranchHeadSha: projectedLease.parkBranchHeadSha || projectedLease.fenceSha,
      parkSourceEpoch: projectedLease.epoch,
      parkSourceFenceSha: projectedLease.fenceSha,
      parkStashRef: hasStash ? `refs/agentic-canvas-os/parked/${projectedLease.branch}/epoch-${projectedLease.epoch}` : null,
      parkStashSha: hasStash ? projectedLease.parkStashSha : null,
      parkStashMessage: hasStash ? `park: ${projectedLease.branch} epoch ${projectedLease.epoch} fence ${projectedLease.fenceSha}` : null,
      parkStashStatus: hasStash ? projectedLease.parkStashStatus || "pending" : null,
    };
  }
  return {
    schema: "agentic-device-command-result/v1", ok: true, action, status,
    repoRoot: state.plan.derivedWorktreePath, worktreePath: state.plan.derivedWorktreePath,
    branch: projectedLease.branch, provisioned, pullRequest: { ...pullRequest, isDraft: status !== "review_ready" }, lease: projectedLease,
    ...(action === "park" ? { headSha: projectedLease.parkHeadSha, stashRef: projectedLease.parkStashRef, stashSha: projectedLease.parkStashSha, stashStatus: projectedLease.parkStashStatus } : {}),
  };
};

export async function provisionLane(fx, state, sessionId) {
  const branch = `agent/test/${state.plan.acosSemanticScope}`;
  await git(state.spec.repoRoot, ["worktree", "add", "--detach", state.plan.derivedWorktreePath, "refs/remotes/origin/main"]);
  await git(state.plan.derivedWorktreePath, ["switch", "--create", branch]);
  await git(state.plan.derivedWorktreePath, ["commit", "--allow-empty", "-m", "chore: claim"]);
  const fenceSha = (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim();
  await git(state.plan.derivedWorktreePath, ["push", "--set-upstream", "origin", branch]);
  const pullRequest = { url: "https://github.com/example/target/pull/73", number: 73 };
  const lease = { schema: "agentic-writer-lease/v2", status: "active", epoch: 1, sessionId, branch, worktreePath: state.plan.derivedWorktreePath, baseSha: fx.sourceRevision, fenceSha, pullRequestUrl: pullRequest.url };
  return { lease, pullRequest };
}

export function createHappyLifecycle(fx, state) {
  const actions = [];
  const pullRequest = { url: "https://github.com/example/target/pull/91", number: 91 };
  let lease = null;
  return {
    actions,
    invoke: async ({ action, sessionId }) => {
      actions.push(action);
      if (action === "start") {
        const branch = `agent/test/${state.plan.acosSemanticScope}`;
        await git(state.spec.repoRoot, ["worktree", "add", "--detach", state.plan.derivedWorktreePath, "refs/remotes/origin/main"]);
        await git(state.plan.derivedWorktreePath, ["switch", "--create", branch]);
        await git(state.plan.derivedWorktreePath, ["commit", "--allow-empty", "-m", "chore: claim"]);
        const fenceSha = (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim();
        await git(state.plan.derivedWorktreePath, ["push", "--set-upstream", "origin", branch]);
        lease = { schema: "agentic-writer-lease/v2", status: "active", epoch: 1, sessionId, branch, worktreePath: state.plan.derivedWorktreePath, baseSha: fx.sourceRevision, fenceSha, pullRequestUrl: pullRequest.url };
        return machinePayload(state, lease, pullRequest, "start", "active", true);
      }
      if (action === "review") {
        await git(state.plan.derivedWorktreePath, ["push", "origin", lease.branch]);
        lease = { ...lease, status: "review_ready", reviewHeadSha: (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim() };
        return machinePayload(state, lease, pullRequest, "review", "review_ready");
      }
      if (action === "heartbeat") return machinePayload(state, lease, pullRequest, "heartbeat", "active");
      throw new Error(`unexpected lifecycle action ${action}`);
    },
  };
}

export async function retryOwned(store, state) {
  const next = await store.update(state.runId, { expectedRevision: state.revision, eventType: "test.retry" }, (current) => {
    current.retryContext = { fromErrorCode: current.error?.code || null, requestedAt: new Date().toISOString() };
    current.state = "queued";
    current.control = null;
    current.error = null;
    return current;
  });
  const token = crypto.randomUUID();
  return { state: await own(store, next, token), token };
}

export async function prepareReviewReady(fx) {
  let state = fx.created.state;
  const sessionId = `agenticgraph-${state.runId}`;
  let { lease, pullRequest } = await provisionLane(fx, state, sessionId);
  lease = { ...lease, status: "review_ready", reviewHeadSha: lease.fenceSha };
  state = await fx.runtime.store.update(state.runId, { expectedRevision: state.revision, eventType: "test.review_ready" }, (current) => {
    current.state = "delivery_ready";
    current.attempt = 1;
    current.coordination = machinePayload(state, lease, pullRequest, "review", "review_ready");
    current.result = { pullRequest, handoffPending: false, automaticMerge: false, deployment: false };
    current.supervisor.status = "stopped";
    return current;
  });
  return { state, lease, pullRequest };
}

export function createReviewControlLifecycle(state, initialLease, pullRequest, { loseResume = false, losePark = false } = {}) {
  const actions = [];
  let lease = initialLease;
  let status = initialLease.status;
  let lose = loseResume;
  let loseParkResponse = losePark;
  return {
    actions,
    invoke: async ({ action }) => {
      actions.push(action);
      if (action === "heartbeat") {
        if (status !== "active") throw new Error(`lease is ${status}`);
        return machinePayload(state, lease, pullRequest, "heartbeat", "active");
      }
      if (action === "resume") {
        await git(state.plan.derivedWorktreePath, ["commit", "--allow-empty", "-m", "chore: resume review handoff as draft"]);
        lease = { ...lease, status: "active", epoch: lease.epoch + 1, fenceSha: (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"])).stdout.trim() };
        await git(state.plan.derivedWorktreePath, ["push", "origin", lease.branch]);
        status = "active";
        if (lose) { lose = false; throw new Error("simulated lost draft-resume response"); }
        return machinePayload(state, lease, pullRequest, "resume", "active");
      }
      if (action === "park") {
        if (status !== "parked") await git(state.plan.derivedWorktreePath, ["switch", "--detach", "origin/main"]);
        lease = { ...lease, status: "parked" };
        status = "parked";
        if (loseParkResponse) { loseParkResponse = false; throw new Error("simulated lost park response"); }
        return machinePayload(state, lease, pullRequest, "park", "parked");
      }
      throw new Error(`unexpected review-control action ${action}`);
    },
  };
}
