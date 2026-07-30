import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SKILL_EVOLUTION_INVOCATION,
  SKILL_EVOLUTION_REQUEST_SCHEMA,
} from "../skill-evolution-tool-contract.js";
import {
  SkillEvolutionValidationError,
  assertSkillEvolutionRequest,
  validateSkillEvolutionRequest,
} from "../skill-evolution-validation.js";

function request() {
  return {
    schema: SKILL_EVOLUTION_REQUEST_SCHEMA,
    operation: "plan",
    invocation: {
      command: SKILL_EVOLUTION_INVOCATION.command,
      semantics: [...SKILL_EVOLUTION_INVOCATION.semantics],
      bindings: [...SKILL_EVOLUTION_INVOCATION.bindings],
    },
    sourceRevision: "a".repeat(40),
    baseline: {
      skillId: "support-triage",
      revision: "skill-v1",
      digest: "b".repeat(64),
      artifactRef: "skill://support-triage/v1",
      normalizedChars: 1000,
    },
    executor: { id: "executor.local", revision: "v1", digest: "c".repeat(64) },
    candidateAdapter: { id: "adapter.text", revision: "v1", digest: "d".repeat(64) },
    dataset: {
      training: [
        { id: "train-1", digest: "1".repeat(64), ref: "dataset://train/1" },
        { id: "train-2", digest: "2".repeat(64), ref: "dataset://train/2" },
      ],
      validation: [{ id: "valid-1", digest: "3".repeat(64), ref: "dataset://valid/1" }],
    },
    evaluator: {
      id: "evaluator.local",
      revision: "v1",
      digest: "e".repeat(64),
      metric: { id: "task-quality", direction: "maximize", threshold: 0.8 },
    },
    schedule: {
      epochs: 3,
      batchSize: 2,
      miniBatchSize: 1,
      learningRate: { initial: 0.4, decay: 0.5, floor: 0 },
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

test("validates and freezes the exact canonical top-level plan request", () => {
  const raw = request();
  const result = validateSkillEvolutionRequest(raw);
  assert.equal(result.ok, true);
  assert.notEqual(result.request, raw);
  assert.equal(Object.isFrozen(result.request), true);
  assert.equal(result.request.baseline.normalizedChars, 1000);

  const negativeThreshold = request();
  negativeThreshold.evaluator.metric.threshold = -0.25;
  assert.equal(validateSkillEvolutionRequest(negativeThreshold).ok, true);
});

test("rejects invocation, revision, unknown-field, and learning-rate drift", () => {
  const cases = [
    (value) => { value.invocation.bindings.reverse(); },
    (value) => { value.sourceRevision = "A".repeat(40); },
    (value) => { value.modelWeights = { train: true }; },
    (value) => { value.schedule.learningRate.optimizer = "adam"; },
    (value) => { value.schedule.learningRate.floor = 0.5; },
    (value) => { value.schedule.miniBatchSize = 3; },
    (value) => { value.validation.minDelta = Number.POSITIVE_INFINITY; },
  ];
  for (const mutate of cases) {
    const value = request();
    mutate(value);
    const result = validateSkillEvolutionRequest(value);
    assert.equal(result.ok, false, JSON.stringify(value));
    assert.ok(result.errors.length > 0);
  }
});

test("rejects duplicate and cross-split dataset identities by normalized id, digest, or ref", () => {
  const duplicate = request();
  duplicate.dataset.training.push({ ...duplicate.dataset.training[0] });
  assert.equal(validateSkillEvolutionRequest(duplicate).ok, false);

  const overlapId = request();
  overlapId.dataset.validation[0].id = "TRAIN-1";
  assert.match(validateSkillEvolutionRequest(overlapId).errors.join(" "), /disjoint/i);

  const overlapDigest = request();
  overlapDigest.dataset.validation[0].digest = overlapDigest.dataset.training[0].digest;
  assert.match(validateSkillEvolutionRequest(overlapDigest).errors.join(" "), /disjoint/i);

  const overlapRef = request();
  overlapRef.dataset.validation[0].ref = "DATASET://TRAIN/1";
  assert.match(validateSkillEvolutionRequest(overlapRef).errors.join(" "), /disjoint/i);
});

test("validates common schema and invocation on status, step, and cancel", () => {
  const common = {
    schema: SKILL_EVOLUTION_REQUEST_SCHEMA,
    invocation: request().invocation,
    runId: "skill-run-1",
  };
  assert.equal(validateSkillEvolutionRequest({ ...common, operation: "status" }).ok, true);
  assert.equal(validateSkillEvolutionRequest({
    ...common,
    operation: "step",
    expectedRevision: 1,
    idempotencyKey: "step-1",
  }).ok, true);
  assert.equal(validateSkillEvolutionRequest({
    ...common,
    operation: "step",
    expectedRevision: Number.MAX_SAFE_INTEGER + 1,
    idempotencyKey: "step-unsafe",
  }).ok, false);
  assert.equal(validateSkillEvolutionRequest({
    ...common,
    operation: "cancel",
    expectedRevision: 1,
    idempotencyKey: "cancel-1",
  }).ok, true);
  assert.equal(validateSkillEvolutionRequest({ operation: "status", runId: "skill-run-1" }).ok, false);
});

test("assertion API throws a typed validation error", () => {
  assert.throws(
    () => assertSkillEvolutionRequest({}),
    (error) => error instanceof SkillEvolutionValidationError
      && error.code === "invalid_skill_evolution_request"
      && error.errors.length > 0,
  );
});

test("rejects required fields supplied only through an object prototype", () => {
  const value = request();
  value.invocation = Object.assign(
    Object.create({ command: "/skill.evolve" }),
    {
      semantics: ["#skill-evolution"],
      bindings: ["@skill-catalog", "@skill-policy", "@runtime-proof", "@operator"],
    },
  );
  assert.equal(validateSkillEvolutionRequest(value).ok, false);
});
