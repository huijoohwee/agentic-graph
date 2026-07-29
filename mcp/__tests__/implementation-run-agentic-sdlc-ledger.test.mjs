import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  evaluateAgenticSdlcLedger,
  loadAgenticSdlcEvaluator,
} from "../agentic-sdlc-ledger-runtime.js";
import { digestEvidence } from "../implementation-run-evidence.js";
import {
  agenticSdlcLedgerResultFields,
  agenticSdlcRunnerRequestFields,
  bindAgenticSdlcLedger,
} from "../implementation-run-agentic-sdlc-ledger.js";

const runId = "ir_0123456789abcdef01234567";
const supervisorToken = "supervisor-token";
const execFileAsync = promisify(execFile);
const ledger = {
  schema: "agentic-sdlc-run/v1",
  runId: "canonical-run-1",
  runtimeReady: true,
};
const content = `${JSON.stringify(ledger)}\n`;
const FIXTURE_REVISION = "a".repeat(40);
const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const EVALUATOR_DEPENDENCIES = Object.freeze([
  "ajv",
  "fast-deep-equal",
  "fast-uri",
  "json-schema-traverse",
  "require-from-string",
]);

const createState = (
  worktreePath,
  acosRevision,
  ledgerPath = "artifacts/agentic-sdlc-run.json",
) => ({
  runId,
  revision: 7,
  attempt: 1,
  spec: {
    agenticSdlcLedgerPath: ledgerPath,
    allowedPaths: ["artifacts"],
    agenticCanvasOsRoot: path.join(worktreePath, "agentic-canvas-os"),
  },
  plan: { acosRevision },
  coordination: { worktreePath },
  supervisor: { token: supervisorToken },
  result: { runner: { ok: true } },
});

async function writeExactEvaluatorFiles(root) {
  const moduleDirectory = path.join(root, "scripts", "agentic-sdlc");
  await fs.mkdir(moduleDirectory, { recursive: true });
  await fs.mkdir(path.join(root, "node_modules"), { recursive: true });
  const sourceLock = JSON.parse(
    await fs.readFile(path.join(sourceRoot, "package-lock.json"), "utf8"),
  );
  const dependencyLocks = Object.fromEntries(
    EVALUATOR_DEPENDENCIES.map((name) => {
      const lockKey = `node_modules/${name}`;
      assert.ok(sourceLock.packages?.[lockKey]);
      return [lockKey, sourceLock.packages[lockKey]];
    }),
  );
  await Promise.all([
    fs.writeFile(path.join(moduleDirectory, "index.mjs"), [
      "export const assertCanonicalRunSchema = value => {",
      "  if (value?.schema !== 'agentic-sdlc-run/v1') throw new Error('schema');",
      "};",
      "export const normalizeCanonicalRun = value => structuredClone(value);",
      "export const validateExecutionRun = value => ({",
      "  runId: value.runId,",
      "  runtimeReady: value.runtimeReady === true,",
      "});",
      "export const stableJson = value => JSON.stringify(value);",
      "",
    ].join("\n")),
    fs.writeFile(path.join(root, ".gitignore"), "node_modules/\n", "utf8"),
    fs.writeFile(path.join(root, "package.json"), `${JSON.stringify({
      name: "agentic-canvas-os-test",
      private: true,
      type: "module",
      devDependencies: { ajv: "8.17.1" },
    }, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(root, "package-lock.json"), `${JSON.stringify({
      name: "agentic-canvas-os-test",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "agentic-canvas-os-test",
          devDependencies: { ajv: "8.17.1" },
        },
        ...dependencyLocks,
      },
    }, null, 2)}\n`, "utf8"),
    ...EVALUATOR_DEPENDENCIES.map((name) => fs.cp(
      path.join(sourceRoot, "node_modules", name),
      path.join(root, "node_modules", name),
      { errorOnExist: true, recursive: true },
    )),
  ]);
  return {
    ajvEntryPath: path.join(root, "node_modules", "ajv", "dist", "2020.js"),
    modulePath: path.join(moduleDirectory, "index.mjs"),
  };
}

async function createExactEvaluator(worktreePath) {
  const root = path.join(worktreePath, "agentic-canvas-os");
  await writeExactEvaluatorFiles(root);
  await execFileAsync("git", ["init", "--quiet"], { cwd: root });
  await execFileAsync("git", [
    "add",
    ".gitignore",
    "package.json",
    "package-lock.json",
    "scripts/agentic-sdlc/index.mjs",
  ], { cwd: root });
  await execFileAsync("git", [
    "-c", "user.name=Knowgrph Test",
    "-c", "user.email=knowgrph-test@example.invalid",
    "commit", "--quiet", "-m", "fixture",
  ], { cwd: root });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  return { root, revision: stdout.trim() };
}

function createHarness(state) {
  const artifacts = new Map();
  const events = [];
  let current = structuredClone(state);
  const store = {
    async writeArtifact(observedRunId, fileName, value, options) {
      assert.equal(observedRunId, runId);
      assert.equal(options.supervisorToken, supervisorToken);
      if (artifacts.has(fileName)) {
        throw Object.assign(new Error("immutable"), { code: "ARTIFACT_EXISTS" });
      }
      artifacts.set(fileName, String(value));
      return path.join(state.coordination.worktreePath, ".artifacts", fileName);
    },
    async readArtifact(observedRunId, fileName, expected) {
      assert.equal(observedRunId, runId);
      const value = artifacts.get(fileName);
      assert.ok(value);
      assert.equal(expected.expectedDigest, digestEvidence(value));
      assert.equal(expected.expectedBytes, Buffer.byteLength(value));
      return {
        artifact: fileName,
        digest: digestEvidence(value),
        bytes: Buffer.byteLength(value),
        content: value,
      };
    },
  };
  const updateOwned = async (eventType, eventData, mutate) => {
    assert.equal(current.supervisor.token, supervisorToken);
    events.push({ eventType, eventData });
    current = mutate(structuredClone(current));
    current.revision += 1;
    return structuredClone(current);
  };
  return {
    artifacts,
    events,
    get current() { return current; },
    options: { store, updateOwned },
  };
}

test("ledger binder persists one immutable digest-bound receipt behind the supervisor fence", async (t) => {
  const worktreePath = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-sdlc-ledger-"));
  t.after(() => fs.rm(worktreePath, { recursive: true, force: true }));
  await fs.mkdir(path.join(worktreePath, "artifacts"));
  await fs.writeFile(path.join(worktreePath, "artifacts", "agentic-sdlc-run.json"), content);
  const evaluator = await createExactEvaluator(worktreePath);
  const state = createState(worktreePath, evaluator.revision);
  const harness = createHarness(state);

  const first = await bindAgenticSdlcLedger({
    state,
    runId,
    supervisorToken,
    ...harness.options,
  });
  const receipt = first.result.agenticSdlcLedger;
  assert.deepEqual(receipt, {
    schema: "agentic-sdlc-ledger-receipt/v1",
    artifact: `agentic-sdlc-run.a0001.${digestEvidence(content).slice(7, 23)}.json`,
    digest: digestEvidence(content),
    bytes: Buffer.byteLength(content),
    canonicalRunId: ledger.runId,
    ledgerRevision: 7,
    acosRevision: evaluator.revision,
  });
  assert.equal(harness.events[0].eventType, "agentic_sdlc.ledger_bound");
  assert.equal(harness.events[0].eventData.runtimeReady, true);
  assert.deepEqual(agenticSdlcLedgerResultFields(first.result), {
    agenticSdlcLedger: receipt,
  });
  assert.match(
    agenticSdlcRunnerRequestFields(state.spec.agenticSdlcLedgerPath).directive,
    /persist the exact canonical agentic-sdlc-run\/v1 ledger/,
  );

  const replay = await bindAgenticSdlcLedger({
    state: { ...state, revision: 7 },
    runId,
    supervisorToken,
    ...harness.options,
  });
  assert.deepEqual(replay.result.agenticSdlcLedger, receipt);
  assert.equal(harness.artifacts.size, 1);
});

test("ledger binder rejects out-of-scope paths before evaluation or durable mutation", async (t) => {
  const worktreePath = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-sdlc-ledger-scope-"));
  t.after(() => fs.rm(worktreePath, { recursive: true, force: true }));
  await fs.writeFile(path.join(worktreePath, "outside.json"), content);
  const state = createState(worktreePath, "a".repeat(40), "outside.json");
  const harness = createHarness(state);
  await assert.rejects(
    bindAgenticSdlcLedger({
      state,
      runId,
      supervisorToken,
      ...harness.options,
    }),
    (error) => error.code === "LEDGER_SCHEMA_INVALID",
  );
  assert.equal(harness.artifacts.size, 0);
  assert.equal(harness.events.length, 0);
});

test("ledger binder rejects invalid UTF-8 before evaluation or immutable persistence", async (t) => {
  const worktreePath = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-sdlc-ledger-utf8-"));
  t.after(() => fs.rm(worktreePath, { recursive: true, force: true }));
  await fs.mkdir(path.join(worktreePath, "artifacts"));
  await fs.writeFile(
    path.join(worktreePath, "artifacts", "agentic-sdlc-run.json"),
    Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]),
  );
  const state = createState(worktreePath, "a".repeat(40));
  const harness = createHarness(state);
  await assert.rejects(
    bindAgenticSdlcLedger({
      state,
      runId,
      supervisorToken,
      ...harness.options,
    }),
    (error) => error.code === "LEDGER_SCHEMA_INVALID",
  );
  assert.equal(harness.artifacts.size, 0);
  assert.equal(harness.events.length, 0);
});

test("non-runtime-ready conformance binds evidence then fails closed with its exact code", async (t) => {
  const worktreePath = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-sdlc-ledger-conformance-"));
  t.after(() => fs.rm(worktreePath, { recursive: true, force: true }));
  await fs.mkdir(path.join(worktreePath, "artifacts"));
  const rejectedContent = `${JSON.stringify({ ...ledger, runtimeReady: false })}\n`;
  await fs.writeFile(
    path.join(worktreePath, "artifacts", "agentic-sdlc-run.json"),
    rejectedContent,
  );
  const evaluator = await createExactEvaluator(worktreePath);
  const state = createState(worktreePath, evaluator.revision);
  const harness = createHarness(state);
  await assert.rejects(
    bindAgenticSdlcLedger({
      state,
      runId,
      supervisorToken,
      ...harness.options,
    }),
    (error) => error.code === "LEDGER_CONFORMANCE_FAILED",
  );
  assert.equal(harness.events.length, 1);
  assert.equal(harness.events[0].eventData.runtimeReady, false);
  assert.equal(
    harness.current.result.agenticSdlcLedger.digest,
    digestEvidence(rejectedContent),
  );
});

test("exact evaluator loader proves pinned offline archives and exposes canonical functions", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-acos-evaluator-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await writeExactEvaluatorFiles(root);
  const exec = async (_command, args) => ({
    stdout: args.includes("status") ? "" : `${FIXTURE_REVISION}\n`,
  });
  const loaded = await loadAgenticSdlcEvaluator({
    agenticCanvasOsRoot: root,
    expectedRevision: FIXTURE_REVISION,
    exec,
  });
  const result = evaluateAgenticSdlcLedger(ledger, loaded);
  assert.equal(result.normalizedRun.runId, ledger.runId);
  assert.equal(result.conformance.runtimeReady, true);
  await assert.rejects(
    loadAgenticSdlcEvaluator({
      agenticCanvasOsRoot: root,
      expectedRevision: FIXTURE_REVISION,
      exec: async (_command, args) => ({
        stdout: args.includes("status")
          ? " M scripts/agentic-sdlc/index.mjs\n"
          : `${FIXTURE_REVISION}\n`,
      }),
    }),
    (error) => error.code === "ACOS_REVISION_MISMATCH",
  );

  const symlink = `${root}-symlink`;
  await fs.symlink(root, symlink);
  t.after(() => fs.unlink(symlink).catch(() => undefined));
  await assert.rejects(
    loadAgenticSdlcEvaluator({
      agenticCanvasOsRoot: symlink,
      expectedRevision: FIXTURE_REVISION,
      exec,
    }),
    (error) => error.code === "ACOS_REVISION_MISMATCH",
  );

  let revisionReads = 0;
  await assert.rejects(
    loadAgenticSdlcEvaluator({
      agenticCanvasOsRoot: root,
      expectedRevision: FIXTURE_REVISION,
      exec: async (_command, args) => {
        if (args.includes("status")) return { stdout: "" };
        revisionReads += 1;
        return {
          stdout: `${revisionReads > 2 ? "b".repeat(40) : FIXTURE_REVISION}\n`,
        };
      },
    }),
    (error) => error.code === "ACOS_REVISION_MISMATCH",
  );
});

test("evaluator Git inspection excludes ambient authority redirects and config", async (t) => {
  const worktreePath = await fs.mkdtemp(
    path.join(os.tmpdir(), "knowgrph-acos-git-env-"),
  );
  t.after(() => fs.rm(worktreePath, { recursive: true, force: true }));
  const { root, revision } = await createExactEvaluator(worktreePath);
  const ambient = {
    GIT_DIR: path.join(worktreePath, "redirected-git-dir"),
    GIT_WORK_TREE: path.join(worktreePath, "redirected-work-tree"),
    GIT_CONFIG: path.join(worktreePath, "redirected-git-config"),
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.worktree",
    GIT_CONFIG_VALUE_0: path.join(worktreePath, "redirected-config-work-tree"),
  };
  const previous = Object.fromEntries(
    Object.keys(ambient).map((name) => [name, process.env[name]]),
  );
  const seenEnvironments = [];
  try {
    Object.assign(process.env, ambient);
    await loadAgenticSdlcEvaluator({
      agenticCanvasOsRoot: root,
      expectedRevision: revision,
      exec: async (command, args, options) => {
        seenEnvironments.push(options.env);
        return execFileAsync(command, args, options);
      },
    });
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  assert.ok(seenEnvironments.length > 0);
  for (const environment of seenEnvironments) {
    assert.equal(environment.GIT_DIR, undefined);
    assert.equal(environment.GIT_WORK_TREE, undefined);
    assert.equal(environment.GIT_CONFIG, undefined);
    assert.equal(environment.GIT_CONFIG_KEY_0, undefined);
    assert.equal(environment.GIT_CONFIG_VALUE_0, undefined);
    assert.equal(environment.GIT_CONFIG_COUNT, "0");
    assert.equal(environment.GIT_CONFIG_NOSYSTEM, "1");
    assert.equal(
      environment.GIT_CONFIG_GLOBAL,
      process.platform === "win32" ? "NUL" : "/dev/null",
    );
  }
});

test("evaluator loader rejects dependency bytes changed while loading", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-acos-dependency-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { ajvEntryPath } = await writeExactEvaluatorFiles(root);
  let statusReads = 0;
  await assert.rejects(
    loadAgenticSdlcEvaluator({
      agenticCanvasOsRoot: root,
      expectedRevision: FIXTURE_REVISION,
      exec: async (_command, args) => {
        if (args.includes("status")) {
          statusReads += 1;
          if (statusReads === 2) {
            await fs.writeFile(
              ajvEntryPath,
              "export default class MutatedAjv2020 {}\n",
              "utf8",
            );
          }
          return { stdout: "" };
        }
        return { stdout: `${FIXTURE_REVISION}\n` };
      },
    }),
    (error) => error.code === "ACOS_REVISION_MISMATCH",
  );
});

test("evaluator loader rejects stable pre-existing ignored dependency tampering", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-acos-tampered-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { ajvEntryPath } = await writeExactEvaluatorFiles(root);
  await fs.writeFile(
    ajvEntryPath,
    "export default class StableButTamperedAjv2020 {}\n",
    "utf8",
  );
  await assert.rejects(
    loadAgenticSdlcEvaluator({
      agenticCanvasOsRoot: root,
      expectedRevision: FIXTURE_REVISION,
      exec: async (_command, args) => ({
        stdout: args.includes("status") ? "" : `${FIXTURE_REVISION}\n`,
      }),
    }),
    (error) => error.code === "ACOS_REVISION_MISMATCH",
  );
});
