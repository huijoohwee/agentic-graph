import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createSkillEvolutionHostAdapter,
  SKILL_EVOLUTION_HOST_ADAPTER_METHODS,
} from "../skill-evolution-host-adapter.js";
import { verifySkillEvolutionMutationBoundary } from "../skill-evolution-mutation-verification.js";
import {
  SKILL_EVOLUTION_FIXTURE_BASELINE_TEXT,
  SKILL_EVOLUTION_FIXTURE_CANDIDATE_TEXT,
} from "./fixtures/skill-evolution-adapter.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixture = path.join(repoRoot, "mcp", "__tests__", "fixtures", "skill-evolution-adapter.mjs");
const fileDigest = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const envFor = async (file, requestedDigest) => ({
  KNOWGRPH_SKILL_EVOLUTION_ADAPTER_MODULE: path.relative(repoRoot, file),
  KNOWGRPH_SKILL_EVOLUTION_ADAPTER_SHA256: requestedDigest ?? await fileDigest(file),
});

test("loads only a repository-contained adapter at its exact configured digest", async () => {
  const adapter = createSkillEvolutionHostAdapter({ rootDir: repoRoot, env: await envFor(fixture) });
  const verified = await adapter.sourceVerifier.verifySources({ sourceRevision: "a".repeat(40) });
  assert.equal(verified.ok, true);
  assert.equal(verified.sourceRevision, "a".repeat(40));
  assert.deepEqual(verified.registeredGates, ["schema.valid"]);
});

test("rechecks the configured digest before every repeated capability call", async (t) => {
  const directory = await mkdtemp(path.join(repoRoot, ".skill-evolution-host-test-"));
  const copiedFixture = path.join(directory, "adapter.mjs");
  await copyFile(fixture, copiedFixture);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const adapter = createSkillEvolutionHostAdapter({ rootDir: repoRoot, env: await envFor(copiedFixture) });

  const first = await adapter.sourceVerifier.verifySources({ sourceRevision: "a".repeat(40) });
  assert.equal(first.ok, true);
  await appendFile(copiedFixture, "\n// deliberate digest drift\n");
  await assert.rejects(
    adapter.sourceVerifier.verifySources({ sourceRevision: "a".repeat(40) }),
    (error) => error.code === "source_drift",
  );
});

test("fails closed for missing configuration, digest drift, and external paths", async () => {
  const missing = createSkillEvolutionHostAdapter({ rootDir: repoRoot, env: {} });
  await assert.rejects(missing.sourceVerifier.verifySources({}), (error) => error.code === "adapter_unavailable");

  const drifted = createSkillEvolutionHostAdapter({ rootDir: repoRoot, env: await envFor(fixture, "0".repeat(64)) });
  await assert.rejects(drifted.sourceVerifier.verifySources({}), (error) => error.code === "source_drift");

  const outside = createSkillEvolutionHostAdapter({
    rootDir: repoRoot,
    env: {
      KNOWGRPH_SKILL_EVOLUTION_ADAPTER_MODULE: process.execPath,
      KNOWGRPH_SKILL_EVOLUTION_ADAPTER_SHA256: "0".repeat(64),
    },
  });
  await assert.rejects(outside.sourceVerifier.verifySources({}), (error) => error.code === "adapter_unavailable");
});

test("rejects a configured module that names the forbidden external runtime", async () => {
  const forbiddenFixture = path.join(
    repoRoot,
    "mcp",
    "__tests__",
    "fixtures",
    "skill-evolution-forbidden-adapter.mjs",
  );
  const adapter = createSkillEvolutionHostAdapter({
    rootDir: repoRoot,
    env: await envFor(forbiddenFixture),
  });
  await assert.rejects(
    adapter.sourceVerifier.verifySources({}),
    (error) => error.code === "adapter_unavailable" && /clean-room/i.test(error.message),
  );
});

test("runs five roles in sanitized subprocesses with a dedicated worker for every call", async () => {
  const adapter = createSkillEvolutionHostAdapter({
    rootDir: repoRoot,
    env: {
      ...await envFor(fixture),
      SKILL_EVOLUTION_TEST_SECRET: "must-not-cross-process-boundary",
    },
  });

  const authorization1 = await adapter.authorize({ __probe: true });
  const authorization2 = await adapter.authorize({ __probe: true });
  const sourceVerifier = await adapter.sourceVerifier.verifySources({
    __probe: true,
    sourceRevision: "b".repeat(40),
  });
  const trainingExecutor = await adapter.trainingExecutor.executeTraining({
    __probe: true,
    epochIndex: 0,
    scenarioRefs: ["scenario://training/1"],
  });
  const candidate = await adapter.candidate.proposeCandidate({
    __probe: true,
    candidate: { digest: "c".repeat(64) },
  });
  const heldOut1 = await adapter.heldOut.executeValidation({
    __probe: true,
    validationSecret: "held-out-only",
    candidateRole: "candidate",
    candidate: { digest: "d".repeat(64) },
  });
  const heldOut2 = await adapter.heldOut.evaluateValidation({
    __probe: true,
    requiredGates: ["schema.valid"],
  });

  assert.notEqual(authorization1.workerPid, authorization2.workerPid);
  assert.equal(authorization1.callCount, 1);
  assert.equal(authorization2.callCount, 1);
  assert.notEqual(heldOut1.workerPid, heldOut2.workerPid);
  assert.equal(heldOut2.validationSecret, null);
  assert.equal(candidate.validationSecret, null);

  const results = [
    authorization1,
    authorization2,
    sourceVerifier,
    trainingExecutor,
    candidate,
    heldOut1,
    heldOut2,
  ];
  assert.equal(new Set(results.map(({ workerPid }) => workerPid)).size, results.length);
  for (const result of results) {
    assert.equal(result.inheritedSecret, null);
    assert.equal(result.filesystemWriteAllowed, false);
    assert.equal(result.signalPresent, true);
  }
});

test("rejects unpinned imports and builtin-mediated repository reads", async (t) => {
  const directory = await mkdtemp(path.join(repoRoot, ".skill-evolution-import-test-"));
  const helper = path.join(directory, "helper.mjs");
  const staticAdapter = path.join(directory, "static-adapter.mjs");
  const bareAdapter = path.join(directory, "bare-adapter.mjs");
  const dynamicAdapter = path.join(directory, "dynamic-adapter.mjs");
  const moduleAdapter = path.join(directory, "module-adapter.mjs");
  const fsVmAdapter = path.join(directory, "fs-vm-adapter.mjs");
  const processAdapter = path.join(directory, "process-adapter.mjs");
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(helper, "export default true;\n");
  await writeFile(staticAdapter, [
    'import helper from "./helper.mjs";',
    "export function createSkillEvolutionAdapter() {",
    "  return { authorize: async () => helper };",
    "}",
  ].join("\n"));
  await writeFile(bareAdapter, [
    'import helper from "untrusted-helper-package";',
    "export function createSkillEvolutionAdapter() {",
    "  return { authorize: async () => helper };",
    "}",
  ].join("\n"));
  await writeFile(dynamicAdapter, [
    "export function createSkillEvolutionAdapter() {",
    "  return { authorize: async ({ loadHelper }) => loadHelper ? import('./helper.mjs') : true };",
    "}",
  ].join("\n"));
  await writeFile(moduleAdapter, [
    'import { createRequire } from "node:module";',
    "const require = createRequire(import.meta.url);",
    "export function createSkillEvolutionAdapter() {",
    '  return { authorize: async () => require("./helper.mjs") };',
    "}",
  ].join("\n"));
  await writeFile(fsVmAdapter, [
    'import fs from "node:fs";',
    'import vm from "node:vm";',
    "export function createSkillEvolutionAdapter() {",
    `  return { authorize: async () => vm.runInThisContext(fs.readFileSync(${JSON.stringify(helper)}, "utf8")) };`,
    "}",
  ].join("\n"));
  await writeFile(processAdapter, [
    "export function createSkillEvolutionAdapter() {",
    "  return { authorize: async () => {",
    '    const fs = process.getBuiltinModule("node:fs");',
    `    return fs.readFileSync(${JSON.stringify(helper)}, "utf8");`,
    "  } };",
    "}",
  ].join("\n"));

  const entryDigest = await fileDigest(staticAdapter);
  const staticImport = createSkillEvolutionHostAdapter({
    rootDir: repoRoot,
    env: await envFor(staticAdapter, entryDigest),
  });
  await assert.rejects(staticImport.authorize({}), (error) => error.code === "adapter_unavailable");
  await writeFile(helper, "export default false;\n");
  assert.equal(await fileDigest(staticAdapter), entryDigest);
  const afterHelperDrift = createSkillEvolutionHostAdapter({
    rootDir: repoRoot,
    env: await envFor(staticAdapter, entryDigest),
  });
  await assert.rejects(afterHelperDrift.authorize({}), (error) => error.code === "adapter_unavailable");

  const bareImport = createSkillEvolutionHostAdapter({ rootDir: repoRoot, env: await envFor(bareAdapter) });
  await assert.rejects(bareImport.authorize({}), (error) => error.code === "adapter_unavailable");

  const dynamicImport = createSkillEvolutionHostAdapter({ rootDir: repoRoot, env: await envFor(dynamicAdapter) });
  assert.equal(await dynamicImport.authorize({ loadHelper: false }), true);
  await assert.rejects(dynamicImport.authorize({ loadHelper: true }), (error) => error.code === "adapter_failed");

  for (const adapterPath of [moduleAdapter, fsVmAdapter]) {
    const adapter = createSkillEvolutionHostAdapter({ rootDir: repoRoot, env: await envFor(adapterPath) });
    await assert.rejects(adapter.authorize({}), (error) => error.code === "adapter_unavailable");
  }

  const processImport = createSkillEvolutionHostAdapter({ rootDir: repoRoot, env: await envFor(processAdapter) });
  await assert.rejects(processImport.authorize({}), (error) => error.code === "adapter_failed");
});

test("exposes only the methods allowed for each process role", async () => {
  const adapter = createSkillEvolutionHostAdapter({ rootDir: repoRoot, env: await envFor(fixture) });
  assert.deepEqual(Object.keys(adapter), ["authorize", "sourceVerifier", "trainingExecutor", "candidate", "heldOut"]);
  assert.deepEqual(Object.keys(adapter.sourceVerifier), ["verifySources", "verifyMutation"]);
  assert.deepEqual(Object.keys(adapter.trainingExecutor), ["executeTraining"]);
  assert.deepEqual(Object.keys(adapter.candidate), ["proposeCandidate"]);
  assert.deepEqual(Object.keys(adapter.heldOut), ["executeValidation", "evaluateValidation"]);
  assert.deepEqual(SKILL_EVOLUTION_HOST_ADAPTER_METHODS, {
    authorization: ["authorize"],
    sourceVerifier: ["verifySources", "verifyMutation"],
    trainingExecutor: ["executeTraining"],
    candidate: ["proposeCandidate"],
    heldOut: ["executeValidation", "evaluateValidation"],
  });
});

test("trusted source verification applies hunks to canonical artifacts and rejects forged accounting", async () => {
  const adapter = createSkillEvolutionHostAdapter({ rootDir: repoRoot, env: await envFor(fixture) });
  const payload = {
    sourceRevision: "a".repeat(40),
    parent: {
      candidateRef: "skill://stdio/v1",
      diffRef: null,
      digest: createHash("sha256").update(SKILL_EVOLUTION_FIXTURE_BASELINE_TEXT).digest("hex"),
      parentDigest: null,
    },
    candidate: {
      candidateRef: "candidate://stdio/1",
      diffRef: "diff://stdio/1",
      digest: createHash("sha256").update(SKILL_EVOLUTION_FIXTURE_CANDIDATE_TEXT).digest("hex"),
      parentDigest: createHash("sha256").update(SKILL_EVOLUTION_FIXTURE_BASELINE_TEXT).digest("hex"),
    },
    mutation: { hunks: [{ start: 0, deleteText: "", insertText: "skill" }] },
    expected: {
      parentNormalizedChars: 100,
      candidateNormalizedChars: 105,
      mutationOperations: 1,
      changedChars: 5,
    },
  };
  assert.deepEqual(await verifySkillEvolutionMutationBoundary(adapter, payload), {
    mutationOperations: 1,
    changedChars: 5,
    normalizedChars: 105,
  });
  await assert.rejects(
    verifySkillEvolutionMutationBoundary(adapter, {
      ...payload,
      mutation: { hunks: [{ start: 0, deleteText: "x", insertText: "y" }] },
      expected: { ...payload.expected, candidateNormalizedChars: 100, changedChars: 2 },
    }),
    (error) => error.code === "source_drift",
  );
});

test("rejects non-JSON requests and oversized results at the RPC boundary", async () => {
  const adapter = createSkillEvolutionHostAdapter({ rootDir: repoRoot, env: await envFor(fixture) });
  const circular = {};
  circular.self = circular;
  await assert.rejects(
    adapter.authorize(circular),
    (error) => error.code === "adapter_failed" && /bounded JSON/i.test(error.message),
  );
  await assert.rejects(
    adapter.authorize({ oversized: true }),
    (error) => error.code === "adapter_failed" && !error.message.includes("xxxxx"),
  );
});

test("propagates abort and deadline cancellation across the JSON-only process boundary", async () => {
  const adapter = createSkillEvolutionHostAdapter({
    rootDir: repoRoot,
    env: await envFor(fixture),
    callTimeoutMs: 2_000,
  });
  const coldController = new AbortController();
  const coldAborted = adapter.trainingExecutor.executeTraining({
    delayMs: 500,
    epochIndex: 0,
    scenarioRefs: [],
    signal: coldController.signal,
  });
  coldController.abort();
  await assert.rejects(coldAborted, (error) => error.code === "canceled");

  const warm = await adapter.trainingExecutor.executeTraining({
    __probe: true,
    epochIndex: 1,
    scenarioRefs: [],
  });
  assert.equal(warm.signalPresent, true);

  const controller = new AbortController();
  const aborted = adapter.trainingExecutor.executeTraining({
    delayMs: 500,
    epochIndex: 2,
    scenarioRefs: [],
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(aborted, (error) => error.code === "canceled");

  const afterAbort = await adapter.trainingExecutor.executeTraining({
    epochIndex: 3,
    scenarioRefs: [],
  });
  assert.match(afterAbort.evidence.ref, /\/3$/);

  await assert.rejects(
    adapter.trainingExecutor.executeTraining({
      delayMs: 500,
      epochIndex: 4,
      scenarioRefs: [],
      remainingBudget: { durationMs: 20 },
    }),
    (error) => error.code === "timeout",
  );
  const afterTimeout = await adapter.trainingExecutor.executeTraining({
    epochIndex: 5,
    scenarioRefs: [],
  });
  assert.match(afterTimeout.evidence.ref, /\/5$/);
});

test("cancel and timeout terminate only their own workers under concurrent calls", async () => {
  const adapter = createSkillEvolutionHostAdapter({
    rootDir: repoRoot,
    env: await envFor(fixture),
    callTimeoutMs: 2_000,
  });
  const controller = new AbortController();
  const canceled = adapter.trainingExecutor.executeTraining({
    delayMs: 500,
    epochIndex: 10,
    scenarioRefs: [],
    signal: controller.signal,
  });
  const cancelSibling = adapter.trainingExecutor.executeTraining({
    delayMs: 180,
    epochIndex: 11,
    scenarioRefs: [],
  });
  setTimeout(() => controller.abort(), 80);
  await assert.rejects(canceled, (error) => error.code === "canceled");
  assert.match((await cancelSibling).evidence.ref, /\/11$/);

  const timedOut = adapter.trainingExecutor.executeTraining({
    delayMs: 500,
    epochIndex: 12,
    scenarioRefs: [],
    remainingBudget: { durationMs: 30 },
  });
  const timeoutSibling = adapter.trainingExecutor.executeTraining({
    delayMs: 120,
    epochIndex: 13,
    scenarioRefs: [],
  });
  await assert.rejects(timedOut, (error) => error.code === "timeout");
  assert.match((await timeoutSibling).evidence.ref, /\/13$/);
});

test("does not surface child messages, data, or stacks on capability failure", async () => {
  const adapter = createSkillEvolutionHostAdapter({ rootDir: repoRoot, env: await envFor(fixture) });
  await assert.rejects(adapter.authorize({ throwSecret: "do-not-leak" }), (error) => {
    assert.equal(error.code, "adapter_failed");
    assert.equal(error.data, undefined);
    assert.doesNotMatch(error.message, /do-not-leak|private/i);
    assert.doesNotMatch(error.stack, /skill-evolution-adapter\.mjs|do-not-leak|private/i);
    return true;
  });
});
