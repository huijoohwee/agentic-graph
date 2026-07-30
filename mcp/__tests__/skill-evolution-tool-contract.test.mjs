import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import {
  SKILL_EVOLUTION_INVOCATION,
  SKILL_EVOLUTION_REQUEST_SCHEMA,
  SKILL_EVOLUTION_RESULT_SCHEMA,
  SKILL_EVOLUTION_TOOL_NAME,
  buildSkillEvolutionToolDefinition,
} from "../skill-evolution-tool-contract.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const invocation = () => ({
  command: SKILL_EVOLUTION_INVOCATION.command,
  semantics: [...SKILL_EVOLUTION_INVOCATION.semantics],
  bindings: [...SKILL_EVOLUTION_INVOCATION.bindings],
});

function planRequest(operation = "plan") {
  return {
    schema: SKILL_EVOLUTION_REQUEST_SCHEMA,
    operation,
    invocation: invocation(),
    sourceRevision: "a".repeat(40),
    baseline: {
      skillId: "support-triage",
      revision: "skill-v1",
      digest: "b".repeat(64),
      artifactRef: "skill://catalog/support-triage/v1",
      normalizedChars: 1000,
    },
    executor: { id: "executor.local", revision: "v1", digest: "c".repeat(64) },
    candidateAdapter: { id: "adapter.text", revision: "v1", digest: "d".repeat(64) },
    dataset: {
      training: [{ id: "train-1", digest: "1".repeat(64), ref: "dataset://train/1" }],
      validation: [{ id: "valid-1", digest: "2".repeat(64), ref: "dataset://validation/1" }],
    },
    evaluator: {
      id: "evaluator.local",
      revision: "v1",
      digest: "e".repeat(64),
      metric: { id: "task-quality", direction: "maximize", threshold: 0.8 },
    },
    schedule: {
      epochs: 2,
      batchSize: 4,
      miniBatchSize: 2,
      learningRate: { initial: 0.2, decay: 0.5, floor: 0.05 },
      seed: "stable-seed",
    },
    validation: { minDelta: 0.01, patience: 2, requiredGates: ["schema.valid"] },
    bounds: {
      maxCandidates: 20,
      maxAdapterCalls: 50,
      maxMutationOperations: 20,
      maxChangedChars: 5000,
      maxTokens: 100000,
      maxCostUsd: 25,
      maxDurationMs: 60000,
    },
    idempotencyKey: "skill-evolve-001",
  };
}

function resultFixture(overrides = {}) {
  const request = planRequest();
  const candidate = {
    candidateRef: request.baseline.artifactRef,
    diffRef: null,
    digest: request.baseline.digest,
    parentDigest: null,
  };
  return {
    schema: SKILL_EVOLUTION_RESULT_SCHEMA,
    operation: "plan",
    status: "planned",
    runId: null,
    revision: 0,
    invocation: request.invocation,
    sourceRevision: request.sourceRevision,
    baseline: request.baseline,
    executor: request.executor,
    candidateAdapter: request.candidateAdapter,
    dataset: request.dataset,
    evaluator: request.evaluator,
    plan: {
      epochs: request.schedule.epochs,
      batchSize: request.schedule.batchSize,
      miniBatchSize: request.schedule.miniBatchSize,
      learningRate: request.schedule.learningRate,
      batchesPerEpoch: 1,
      miniBatchesPerEpoch: 1,
      maxCandidateCalls: 2,
    },
    progress: { epoch: 0, batch: 0, miniBatch: 0, candidatesEvaluated: 0 },
    workingCandidate: candidate,
    champion: candidate,
    promotedCandidate: null,
    metrics: { baseline: null, workingCandidate: null, champion: null, promotedCandidate: null },
    validation: { disjoint: true, gateResults: [], staleEpochs: 0 },
    cost: {
      adapterCalls: 0,
      mutationOperations: 0,
      changedChars: 0,
      tokens: 0,
      costUsd: 0,
      durationMs: 0,
      byPhase: {
        training: { adapterCalls: 0, tokens: 0, costUsd: 0, durationMs: 0 },
        validation: { adapterCalls: 0, tokens: 0, costUsd: 0, durationMs: 0 },
      },
    },
    stopReason: null,
    proposal: null,
    errors: [],
    applied: false,
    modelWeightsMutated: false,
    deploymentAttempted: false,
    ...overrides,
  };
}

test("tool definition exposes the singular canonical MCP tool and safety annotations", () => {
  const definition = buildSkillEvolutionToolDefinition();
  assert.equal(definition.name, SKILL_EVOLUTION_TOOL_NAME);
  assert.equal(definition.inputSchema.type, "object");
  assert.deepEqual(definition.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  });
  assert.match(definition.description, /no model-weight updates/i);
});

test("input schema accepts the five canonical operation shapes and rejects drift", () => {
  const definition = buildSkillEvolutionToolDefinition();
  const validate = new Ajv2020({ strict: false }).compile(definition.inputSchema);
  const requests = [
    planRequest("plan"),
    planRequest("start"),
    {
      schema: SKILL_EVOLUTION_REQUEST_SCHEMA,
      operation: "step",
      invocation: invocation(),
      runId: "skill-run-1",
      expectedRevision: 1,
      idempotencyKey: "step-1",
    },
    {
      schema: SKILL_EVOLUTION_REQUEST_SCHEMA,
      operation: "status",
      invocation: invocation(),
      runId: "skill-run-1",
    },
    {
      schema: SKILL_EVOLUTION_REQUEST_SCHEMA,
      operation: "cancel",
      invocation: invocation(),
      runId: "skill-run-1",
      expectedRevision: 2,
      idempotencyKey: "cancel-1",
    },
  ];
  for (const request of requests) {
    assert.equal(validate(request), true, new Ajv2020().errorsText(validate.errors));
  }
  const negativeThreshold = planRequest();
  negativeThreshold.evaluator.metric.threshold = -1;
  assert.equal(validate(negativeThreshold), true, new Ajv2020().errorsText(validate.errors));

  const drifted = structuredClone(requests[4]);
  drifted.reason = "not in the canonical request";
  assert.equal(validate(drifted), false);
  delete drifted.reason;
  drifted.invocation.semantics = ["#training"];
  assert.equal(validate(drifted), false);
});

test("output schema requires immutable no-apply, no-weight, and no-deploy proof", () => {
  const validate = new Ajv2020({ strict: false }).compile(
    buildSkillEvolutionToolDefinition().outputSchema,
  );
  const result = resultFixture();
  const candidate = result.workingCandidate;
  assert.equal(validate(result), true, new Ajv2020().errorsText(validate.errors));
  assert.equal(validate({ ...result, modelWeightsMutated: true }), false);
  assert.equal(validate({ ...result, runId: "skill-run-1" }), false);
  assert.equal(validate({ ...result, operation: "start" }), false);
  assert.equal(validate({ ...result, workingCandidate: null }), false);
  assert.equal(validate({ ...result, workingCandidate: { ...candidate, modelWeights: true } }), false);
  assert.equal(validate({ ...result, operation: "status", status: "planned", runId: "skill-run-1", revision: 1 }), false);
  assert.equal(validate({ ...result, validation: { ...result.validation, disjoint: false } }), false);
  assert.equal(validate({ ...result, status: "failed", errors: [] }), false);
  assert.equal(validate({
    ...result,
    operation: "status",
    status: "failed",
    runId: "skill-run-1",
    revision: 2,
    workingCandidate: null,
    errors: [{ code: "adapter_failed", field: null, message: "Adapter failed." }],
  }), false);
  const withoutCost = structuredClone(result);
  delete withoutCost.cost;
  assert.equal(validate(withoutCost), false);
});

test("output schema fixes successful starts at revision one", () => {
  const validate = new Ajv2020({ strict: false }).compile(
    buildSkillEvolutionToolDefinition().outputSchema,
  );
  const started = resultFixture({
    operation: "start",
    status: "ready",
    runId: "skill-run-1",
    revision: 1,
  });

  assert.equal(validate(started), true, new Ajv2020().errorsText(validate.errors));
  assert.equal(validate({ ...started, revision: 2 }), false);
  assert.equal(validate({ ...started, status: "running" }), false);
});

test("output schema distinguishes unresolved and resolved failures", () => {
  const validate = new Ajv2020({ strict: false }).compile(
    buildSkillEvolutionToolDefinition().outputSchema,
  );
  const errors = [{ code: "adapter_failed", field: null, message: "Adapter failed." }];
  const unresolved = resultFixture({
    operation: "status",
    status: "failed",
    runId: null,
    revision: 0,
    sourceRevision: null,
    baseline: null,
    executor: null,
    candidateAdapter: null,
    dataset: null,
    evaluator: null,
    plan: null,
    workingCandidate: null,
    champion: null,
    promotedCandidate: null,
    validation: { disjoint: false, gateResults: [], staleEpochs: 0 },
    errors,
  });

  assert.equal(validate(unresolved), true, new Ajv2020().errorsText(validate.errors));
  assert.equal(validate({ ...unresolved, revision: 1 }), false);

  const resolved = resultFixture({
    operation: "status",
    status: "failed",
    runId: "skill-run-1",
    revision: 2,
    validation: { disjoint: false, gateResults: [], staleEpochs: 0 },
    errors,
  });
  assert.equal(validate(resolved), true, new Ajv2020().errorsText(validate.errors));
  assert.equal(validate({ ...resolved, revision: 0 }), false);
  assert.equal(validate({ ...resolved, baseline: null }), false);
  assert.equal(validate({ ...resolved, workingCandidate: null }), false);
});

test("published schema graphs are deeply immutable", () => {
  const definition = buildSkillEvolutionToolDefinition();
  assert.equal(Object.isFrozen(definition.inputSchema.oneOf), true);
  assert.equal(Object.isFrozen(definition.outputSchema.properties.cost.properties.byPhase), true);
  assert.throws(() => definition.inputSchema.oneOf.push({ type: "null" }), TypeError);
});

test("runtime and dependency manifests contain no SkillOpt implementation dependency", async () => {
  const runtimeFiles = (await readdir(path.join(repoRoot, "mcp")))
    .filter((name) => name.startsWith("skill-evolution-") && name.endsWith(".js"))
    .map((name) => path.join("mcp", name));
  const files = [
    "package.json",
    "package-lock.json",
    ...runtimeFiles,
  ];
  for (const file of files) {
    const source = await readFile(path.join(repoRoot, file), "utf8");
    assert.doesNotMatch(source, /skillopt/i, `${file} must not import, install, or name a SkillOpt runtime dependency`);
  }
});
