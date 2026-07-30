import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

import { createImplementationRunRuntime } from "../implementation-run-runtime.js";

const exec = promisify(execFile);
const git = (root, args) => exec("git", ["-C", root, ...args], { encoding: "utf8" });

async function initializeRepository(root, files) {
  await fs.mkdir(root, { recursive: true });
  await git(root, ["init", "-b", "main"]);
  await git(root, ["remote", "add", "origin", `https://example.invalid/${path.basename(root)}.git`]);
  await git(root, ["config", "user.email", "runtime-test@example.invalid"]);
  await git(root, ["config", "user.name", "Runtime Test"]);
  for (const [fileName, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, fileName)), { recursive: true });
    await fs.writeFile(path.join(root, fileName), content, "utf8");
  }
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "test fixture"]);
  await git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
}

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-run-runtime-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const repoRoot = path.join(base, "target");
  const worktreeRoot = path.join(base, ".worktrees", "target");
  const acosRoot = path.join(base, "agentic-canvas-os");
  const executable = await fs.realpath(process.execPath);
  const policy = JSON.stringify({
    schema: "knowgrph-agent-sandbox-policy/v1",
    policy_id: "implementation-run-test",
    filesystem: { read: ["."], write: ["src"] },
    process: { executables: [executable], max_runtime_ms: 60000, max_output_bytes: 65536 },
    network: { default: "deny", rules: [] },
    credentials: { environment: [] },
    audit: { decision_log: "required", redact_values: true },
  });
  const sourceRevision = await initializeRepository(repoRoot, {
    ".gitignore": ".knowgrph-workspace/\n",
    "README.md": "# Target\n",
    "policy.json": policy,
  });
  await fs.mkdir(worktreeRoot, { recursive: true });
  const acosRevision = await initializeRepository(acosRoot, {
    "docs/FACTS.md": "---\ndictionary_entries: []\n---\n",
    "docs/DICTIONARY-COMMAND.md": "---\ndictionary_entries:\n  - \"/implementation.run\"\n---\n| `/implementation.run` | Managed implementation run |\n",
    "docs/DICTIONARY-SEMANTIC.md": "---\ndictionary_entries:\n  - \"#managed-implementation-run\"\n---\n| `#managed-implementation-run` | Managed implementation run |\n",
    "docs/DICTIONARY-BINDING.md": "---\ndictionary_entries:\n  - \"@work-item\"\n  - \"@implementation-run\"\n---\n| `@work-item` | Work item |\n| `@implementation-run` | Implementation run |\n",
    "scripts/device-branch.mjs": "// test fixture\n",
  });
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    KNOWGRPH_IMPLEMENTATION_ACOS_ROOT: acosRoot,
    KNOWGRPH_IMPLEMENTATION_RUNNERS_JSON: JSON.stringify({
      fixture: { executable, args: ["{{requestPath}}"], environment: [] },
    }),
    KNOWGRPH_IMPLEMENTATION_VERIFIERS_JSON: JSON.stringify({
      node_version: { executable, args: ["--version"], environment: [], timeoutMs: 10000 },
    }),
    KNOWGRPH_IMPLEMENTATION_REPOSITORIES_JSON: JSON.stringify([{ repoRoot, worktreeRoot }]),
  };
  const spec = {
    invocation: { action: "/implementation.run", semantic: "#managed-implementation-run", bindings: ["@work-item", "@implementation-run"] },
    workItem: { id: "fixture", objective: "Create a bounded fixture change", acceptance: ["Focused verification passes"] },
    repoRoot,
    worktreeRoot,
    agenticCanvasOsRoot: acosRoot,
    semanticScope: "fixture-implementation-run",
    runnerId: "fixture",
    sandboxPolicyPath: "policy.json",
    allowedPaths: ["src"],
    verification: [{ profileId: "node_version" }],
    idempotencyKey: "fixture-idempotency-key",
    bounds: { maxAttempts: 2, maxRuntimeMs: 60000, maxOutputBytes: 65536, leaseTtlSeconds: 600 },
  };
  return { base, repoRoot, worktreeRoot, sourceRevision, acosRevision, env, spec };
}

const fakeSpawn = () => {
  const child = new EventEmitter();
  child.pid = process.pid;
  child.unref = () => undefined;
  child.kill = () => true;
  queueMicrotask(() => child.emit("spawn"));
  return child;
};
const fixtureRuntime = (fx, options = {}) => createImplementationRunRuntime({
  rootDir: fx.repoRoot,
  env: fx.env,
  supportedAcosRevision: fx.acosRevision,
  ...options,
});

test("implementation-run plan is non-mutating and validates exact catalog membership", async (t) => {
  const fx = await fixture(t);
  const runtime = fixtureRuntime(fx, { spawnImpl: fakeSpawn });
  const planned = await runtime.plan(fx.spec);
  assert.equal(planned.ok, true, JSON.stringify(planned.diagnostics));
  assert.equal(planned.ready, true);
  assert.equal(planned.supervisorReady, true);
  assert.equal(planned.implementationReady, true);
  assert.equal(planned.admissionStatus, "not_requested");
  assert.equal(planned.mutation, "none");
  assert.equal(planned.sourceRevision, fx.sourceRevision);
  assert.deepEqual(planned.containment, { filesystem: "git-worktree-only", applicationPreflight: true, kernelOrContainerIsolation: "not-supplied" });
  assert.equal(await fs.lstat(path.join(fx.repoRoot, ".knowgrph-workspace")).then(() => true, () => false), false);
  assert.equal(await fs.lstat(planned.derivedWorktreePath).then(() => true, () => false), false);

  const unknown = await runtime.plan({ ...fx.spec, invocation: { ...fx.spec.invocation, bindings: [...fx.spec.invocation.bindings, "@invented"] } });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.diagnostics.some((entry) => entry.code === "invocation_token_unknown"));
  const traversal = await runtime.plan({ ...fx.spec, allowedPaths: ["../outside"] });
  assert.equal(traversal.ok, false);
  assert.equal(traversal.error.code, "invalid_arguments");
  const withLedger = await runtime.plan({
    ...fx.spec,
    agenticSdlcLedgerPath: "src/evidence/agentic-sdlc-run.json",
  });
  assert.equal(withLedger.ok, true, JSON.stringify(withLedger.diagnostics));
  assert.equal(withLedger.ready, false);
  assert.equal(withLedger.supervisorReady, true);
  assert.equal(withLedger.implementationReady, false);
  assert.equal(withLedger.admissionStatus, "unevaluated");
  const ledgerOutsideScope = await runtime.plan({
    ...fx.spec,
    agenticSdlcLedgerPath: "evidence/agentic-sdlc-run.json",
  });
  assert.equal(ledgerOutsideScope.ok, false);
  assert.equal(ledgerOutsideScope.error.code, "invalid_arguments");
});

test("token-complete ACOS at an older revision is rejected before durable or worktree mutation", async (t) => {
  const fx = await fixture(t);
  const unsupportedRevision = fx.acosRevision === "f".repeat(40) ? "e".repeat(40) : "f".repeat(40);
  const runtime = fixtureRuntime(fx, { spawnImpl: fakeSpawn, supportedAcosRevision: unsupportedRevision });
  const planned = await runtime.plan(fx.spec);
  assert.equal(planned.ok, false);
  assert.equal(planned.mutation, "none");
  assert.ok(planned.diagnostics.some((entry) => entry.code === "acos_revision_unsupported"));
  const started = await runtime.start(fx.spec);
  assert.equal(started.ok, false);
  assert.equal(started.error.code, "acos_revision_unsupported");
  assert.equal(await fs.lstat(path.join(fx.repoRoot, ".knowgrph-workspace")).then(() => true, () => false), false);
  assert.equal(await fs.lstat(path.join(fx.worktreeRoot, `implementation-${fx.spec.workItem.id}-${crypto.createHash("sha256").update(fx.spec.idempotencyKey).digest("hex").slice(0, 24)}`)).then(() => true, () => false), false);
});

test("implementation-run start is durable, idempotent before fresh-target preflight, and CAS-controlled", async (t) => {
  const fx = await fixture(t);
  let spawnCount = 0;
  const runtime = fixtureRuntime(fx, { spawnImpl: (...args) => { spawnCount += 1; return fakeSpawn(...args); } });
  const started = await runtime.start(fx.spec);
  assert.equal(started.ok, true);
  assert.match(started.runId, /^ir_[a-f0-9]{24}$/);
  assert.equal(started.idempotent, false);
  assert.equal(spawnCount, 1);
  const run = await runtime.store.read(started.runId);
  await fs.mkdir(run.plan.derivedWorktreePath);

  const replay = await runtime.start(fx.spec);
  assert.equal(replay.ok, true);
  assert.equal(replay.idempotent, true);
  assert.equal(spawnCount, 1, "idempotent replay must not spawn or rerun fresh-target preflight");
  const conflict = await runtime.start({ ...fx.spec, workItem: { ...fx.spec.workItem, objective: "Different objective" } });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, "IDEMPOTENCY_CONFLICT");

  const stale = await runtime.control({ runId: started.runId, action: "pause", expectedRevision: 1 });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, "REVISION_CONFLICT");
  const listed = await runtime.list({ runId: started.runId, includeEvents: true });
  assert.equal(listed.ok, true);
  assert.equal(listed.count, 1);
  assert.ok(listed.runs[0].events.length >= 3);
  assert.equal("token" in listed.runs[0].supervisor, false);
});

test("distinct runs sharing a caller scope receive deterministic disjoint 96-bit ACOS identities", async (t) => {
  const fx = await fixture(t);
  const runtime = fixtureRuntime(fx, { spawnImpl: fakeSpawn });
  const secondSpec = { ...fx.spec, idempotencyKey: "fixture-idempotency-key-second" };
  const [firstPlan, secondPlan] = await Promise.all([runtime.plan(fx.spec), runtime.plan(secondSpec)]);
  assert.equal(firstPlan.ok, true);
  assert.equal(secondPlan.ok, true);
  const suffix = (key) => crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
  assert.ok(firstPlan.acosSemanticScope.endsWith(`-${suffix(fx.spec.idempotencyKey)}`));
  assert.ok(secondPlan.acosSemanticScope.endsWith(`-${suffix(secondSpec.idempotencyKey)}`));
  assert.ok(firstPlan.acosSemanticScope.length <= 48 && secondPlan.acosSemanticScope.length <= 48);
  assert.notEqual(firstPlan.acosSemanticScope, secondPlan.acosSemanticScope);
  assert.notEqual(firstPlan.derivedWorktreePath, secondPlan.derivedWorktreePath);
  assert.equal((await runtime.start(fx.spec)).ok, true);
  assert.equal((await runtime.start(secondSpec)).ok, true);
});

test("implementation-run preflight rejects symlinked allowed paths and unregistered runner fields", async (t) => {
  const fx = await fixture(t);
  await fs.symlink(os.tmpdir(), path.join(fx.repoRoot, "src"));
  const runtime = fixtureRuntime(fx, { spawnImpl: fakeSpawn });
  const symlinked = await runtime.plan(fx.spec);
  assert.equal(symlinked.ok, false);
  assert.ok(symlinked.diagnostics.some((entry) => entry.code === "allowed_path_symlink"));
  const invalidEnv = { ...fx.env, KNOWGRPH_IMPLEMENTATION_RUNNERS_JSON: JSON.stringify({ fixture: { executable: process.execPath, args: [], environment: [], command: "forbidden" } }) };
  const invalidRuntime = fixtureRuntime(fx, { env: invalidEnv, spawnImpl: fakeSpawn });
  const invalid = await invalidRuntime.plan(fx.spec);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.diagnostics.some((entry) => entry.code === "host_config_invalid"));
});

test("caller-shaped and deployment-like verifier commands fail before durable mutation", async (t) => {
  const fx = await fixture(t);
  const runtime = fixtureRuntime(fx, { spawnImpl: fakeSpawn });
  for (const argv of [["/usr/bin/npm", "publish"], ["/usr/bin/git", "push"], ["/usr/bin/node", "-e", "process.exit()"]]) {
    const rejected = await runtime.start({ ...fx.spec, verification: [{ argv, timeoutMs: 10000 }] });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, "invalid_arguments");
  }
  for (const [profileId, config] of Object.entries({ npm_publish: { executable: "/usr/bin/npm", args: ["publish"] }, git_push: { executable: "/usr/bin/git", args: ["push"] }, node_eval: { executable: "/usr/bin/node", args: ["-e", "process.exit()"] } })) {
    const env = { ...fx.env, KNOWGRPH_IMPLEMENTATION_VERIFIERS_JSON: JSON.stringify({ [profileId]: { ...config, environment: [], timeoutMs: 10000 } }) };
    const rejected = await fixtureRuntime(fx, { env, spawnImpl: fakeSpawn }).start({ ...fx.spec, verification: [{ profileId }], idempotencyKey: `blocked-${profileId}` });
    assert.equal(rejected.ok, false);
    assert.ok(rejected.error.details.some((entry) => entry.code === "host_config_invalid"));
  }
  const oversizedSpec = { ...fx.spec, workItem: { ...fx.spec.workItem, acceptance: Array.from({ length: 50 }, () => "z".repeat(4096)) }, idempotencyKey: "oversized-caller-spec" };
  assert.equal((await runtime.start(oversizedSpec)).error.code, "invalid_arguments");
  const oversizedRegistryEnv = { ...fx.env, KNOWGRPH_IMPLEMENTATION_VERIFIERS_JSON: JSON.stringify({ node_version: { executable: process.execPath, args: ["a".repeat(4096), "b".repeat(4096)], environment: [], timeoutMs: 10000 } }) };
  const oversizedRegistry = await fixtureRuntime(fx, { env: oversizedRegistryEnv, spawnImpl: fakeSpawn }).start(fx.spec);
  assert.equal(oversizedRegistry.ok, false);
  assert.ok(oversizedRegistry.error.details.some((entry) => entry.code === "host_config_invalid"));
  assert.equal(await fs.lstat(path.join(fx.repoRoot, ".knowgrph-workspace")).then(() => true, () => false), false);
});

test("implementation-run preflight rejects username-only HTTP origin credentials", async (t) => {
  const fx = await fixture(t);
  await git(fx.repoRoot, ["remote", "set-url", "origin", "https://token-value@example.invalid/org/repo.git"]);
  const runtime = fixtureRuntime(fx, { spawnImpl: fakeSpawn });
  const planned = await runtime.plan(fx.spec);
  assert.equal(planned.ok, false);
  assert.ok(planned.diagnostics.some((entry) => entry.code === "origin_identity_invalid"));
  assert.equal(JSON.stringify(planned).includes("token-value"), false, "credential-bearing origin must not be projected in a failed plan");
});

test("implementation-run preflight rejects ignored untracked and oversized policies without mutation", async (t) => {
  const fx = await fixture(t);
  const policyPath = path.join(fx.repoRoot, "policy.json");
  const original = await fs.readFile(policyPath, "utf8");
  await git(fx.repoRoot, ["rm", "policy.json"]);
  await fs.appendFile(path.join(fx.repoRoot, ".gitignore"), "policy.json\n");
  await git(fx.repoRoot, ["add", ".gitignore"]);
  await git(fx.repoRoot, ["commit", "-m", "ignore local policy"]);
  await git(fx.repoRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  await fs.writeFile(policyPath, original);
  let runtime = fixtureRuntime(fx, { spawnImpl: fakeSpawn });
  let planned = await runtime.plan(fx.spec);
  assert.equal(planned.ok, false);
  assert.ok(planned.diagnostics.some((entry) => entry.code === "sandbox_policy_source_invalid"));
  await fs.rm(policyPath);
  await fs.writeFile(path.join(fx.repoRoot, ".gitignore"), ".knowgrph-workspace/\n");
  const exact = `${original}${" ".repeat(256 * 1024 - Buffer.byteLength(original))}`;
  await fs.writeFile(policyPath, exact);
  await git(fx.repoRoot, ["add", ".gitignore", "policy.json"]);
  await git(fx.repoRoot, ["commit", "-m", "track bounded policy"]);
  await git(fx.repoRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  planned = await runtime.plan(fx.spec);
  assert.equal(planned.ok, true, JSON.stringify(planned.diagnostics));
  await fs.appendFile(policyPath, " ");
  await git(fx.repoRoot, ["add", "policy.json"]);
  await git(fx.repoRoot, ["commit", "-m", "oversize policy"]);
  await git(fx.repoRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  runtime = fixtureRuntime(fx, { spawnImpl: fakeSpawn });
  planned = await runtime.start({ ...fx.spec, idempotencyKey: "oversized-policy-key" });
  assert.equal(planned.ok, false);
  assert.equal(await fs.lstat(path.join(fx.repoRoot, ".knowgrph-workspace")).then(() => true, () => false), false);
});
