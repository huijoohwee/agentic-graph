import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SkillEvolutionBatchPlanError,
  buildSkillEvolutionPlan,
  computeSkillEvolutionLearningRate,
  mutationBudgetForStep,
} from "../skill-evolution-batches.js";
import {
  SKILL_EVOLUTION_INVOCATION,
  SKILL_EVOLUTION_REQUEST_SCHEMA,
} from "../skill-evolution-tool-contract.js";
import {
  SKILL_EVOLUTION_CONTROL_CALL_TIMEOUT_CAP_MS,
  checkedSkillEvolutionEvidence,
  skillEvolutionTransitionClaimTtl,
  skillEvolutionUnitAt,
} from "../skill-evolution-transition-helpers.js";

function request(seed = "stable-seed") {
  const training = Array.from({ length: 7 }, (_, index) => ({
    id: `train-${index + 1}`,
    digest: (index + 1).toString(16).repeat(64),
    ref: `dataset://train/${index + 1}`,
  }));
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
      revision: "v1",
      digest: "b".repeat(64),
      artifactRef: "skill://support-triage/v1",
      normalizedChars: 1000,
    },
    executor: { id: "executor.local", revision: "v1", digest: "c".repeat(64) },
    candidateAdapter: { id: "adapter.text", revision: "v1", digest: "d".repeat(64) },
    dataset: {
      training,
      validation: [
        { id: "valid-1", digest: "8".repeat(64), ref: "dataset://valid/1" },
        { id: "valid-2", digest: "9".repeat(64), ref: "dataset://valid/2" },
      ],
    },
    evaluator: {
      id: "evaluator.local",
      revision: "v1",
      digest: "e".repeat(64),
      metric: { id: "task-quality", direction: "maximize", threshold: 0.8 },
    },
    schedule: {
      epochs: 3,
      batchSize: 4,
      miniBatchSize: 2,
      learningRate: { initial: 0.5, decay: 0.5, floor: 0.2 },
      seed,
    },
    validation: { minDelta: 0.01, patience: 2, requiredGates: ["schema.valid"] },
    bounds: {
      maxCandidates: 100,
      maxAdapterCalls: 300,
      maxMutationOperations: 100,
      maxChangedChars: 10000,
      maxTokens: 100000,
      maxCostUsd: 25,
      maxDurationMs: 60000,
    },
    idempotencyKey: `skill-evolve-${seed}`,
  };
}

function epochOrder(plan, epochIndex = 0) {
  return plan.training.epochPlans[epochIndex].batches
    .flatMap((batch) => batch.scenarioRefs.map((ref) => ref.id));
}

function planCheckpoint(plan, epochIndex) {
  return plan.validation.checkpoints.find((checkpoint) => checkpoint.epochIndex === epochIndex);
}

test("builds deterministic seeded epoch, batch, and mini-batch indices without loss", () => {
  const first = buildSkillEvolutionPlan(request());
  const replay = buildSkillEvolutionPlan(request());
  assert.deepEqual(replay, first);
  assert.notDeepEqual(epochOrder(buildSkillEvolutionPlan(request("another-seed"))), epochOrder(first));

  assert.equal(first.epochs, 3);
  assert.equal(first.batchesPerEpoch, 2);
  assert.equal(first.miniBatchesPerEpoch, 4);
  assert.equal(first.maxCandidateCalls, 12);
  assert.equal(first.totals.adapterCalls, 33);
  assert.equal(first.totals.trainingAdapterCalls, 24);
  assert.equal(first.totals.validationAdapterCalls, 9);
  assert.equal(first.totals.steps, 15);
  for (const epoch of first.training.epochPlans) {
    assert.deepEqual([...epochOrder(first, epoch.epochIndex)].sort(), request().dataset.training.map((ref) => ref.id).sort());
    assert.deepEqual(epoch.batches.map((batch) => batch.batchIndex), [0, 1]);
    assert.deepEqual(epoch.batches[0].miniBatches.map((mini) => mini.miniBatchIndex), [0, 1]);
    assert.deepEqual(epoch.batches[1].miniBatches.map((mini) => mini.miniBatchIndex), [0, 1]);
    const candidateSteps = epoch.batches.flatMap((batch) => batch.miniBatches.map((mini) => mini.stepIndex));
    assert.equal(planCheckpoint(first, epoch.epochIndex).stepIndex, candidateSteps.at(-1) + 1);
  }
  const miniBatches = first.training.epochPlans.flatMap((epoch) => epoch.batches.flatMap((batch) => batch.miniBatches));
  assert.ok(miniBatches.reduce((total, mini) => total + mini.mutationBudget.maxMutationOperations, 0) <= request().bounds.maxMutationOperations);
  assert.ok(miniBatches.reduce((total, mini) => total + mini.mutationBudget.maxChangedChars, 0) <= request().bounds.maxChangedChars);
});

test("learning rate is only a textual mutation budget and honors decay, floor, and normalized chars", () => {
  const value = request();
  assert.equal(computeSkillEvolutionLearningRate(value.schedule, 0), 0.5);
  assert.equal(computeSkillEvolutionLearningRate(value.schedule, 1), 0.25);
  assert.equal(computeSkillEvolutionLearningRate(value.schedule, 2), 0.2);
  const budget = mutationBudgetForStep(value.schedule, value.bounds, 1, value.baseline.normalizedChars);
  assert.deepEqual(budget, {
    semantic: "textual-mutation-budget",
    learningRate: 0.25,
    maxMutationOperations: 100,
    maxChangedChars: 250,
  });
  assert.equal("maxTokens" in budget, false);
  assert.equal("maxCostUsd" in budget, false);
  assert.equal("modelWeights" in budget, false);
});

test("keeps candidate-adapter training refs separate from evaluator validation refs", () => {
  const value = request();
  const plan = buildSkillEvolutionPlan(value);
  const validationIds = new Set(value.dataset.validation.map((entry) => entry.id));
  for (const epoch of plan.training.epochPlans) {
    for (const miniBatch of epoch.batches.flatMap((batch) => batch.miniBatches)) {
      assert.equal(miniBatch.scenarioRefs.some((ref) => validationIds.has(ref.id)), false);
    }
  }
  assert.equal(value.dataset.validation.some((ref) => JSON.stringify(plan.training).includes(ref.id)), false);
  for (const checkpoint of plan.validation.checkpoints) {
    assert.deepEqual(checkpoint.scenarioRefs, value.dataset.validation);
    assert.equal("candidateAdapter" in checkpoint, false);
  }
});

test("fails before work when exact candidate or adapter-call totals exceed bounds", () => {
  const value = request();
  value.bounds.maxCandidates = 11;
  assert.throws(
    () => buildSkillEvolutionPlan(value),
    (error) => error instanceof SkillEvolutionBatchPlanError
      && error.code === "bound_exceeded"
      && error.field === "bounds.maxCandidates",
  );
});

test("near-limit plans use bounded direct cursor lookup and transition-sized leases", () => {
  const value = request("near-limit-seed");
  value.dataset.training = Array.from({ length: 1000 }, (_, index) => ({
    id: `train-${index}`,
    digest: (index + 1).toString(16).padStart(64, "0"),
    ref: `dataset://near-limit/${index}`,
  }));
  value.schedule = { ...value.schedule, epochs: 10, batchSize: 1, miniBatchSize: 1 };
  value.bounds = {
    ...value.bounds,
    maxCandidates: 10000,
    maxAdapterCalls: 20100,
    maxMutationOperations: 10000,
    maxChangedChars: 10000,
  };
  const plan = structuredClone(buildSkillEvolutionPlan(value));
  const finalEpoch = plan.training.epochPlans.at(-1);
  let indexedBatchReads = 0;
  finalEpoch.batches = new Proxy(finalEpoch.batches, {
    get(target, key, receiver) {
      if (/^\d+$/.test(String(key))) indexedBatchReads += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  const state = {
    plan,
    nextStepIndex: plan.totals.steps - 2,
    sourceVerification: { usageEnvelope: {
      executeTraining: { maxDurationMs: 10 }, proposeCandidate: { maxDurationMs: 10 },
      executeValidation: { maxDurationMs: 10 }, evaluateValidation: { maxDurationMs: 10 },
    } },
  };
  assert.equal(skillEvolutionUnitAt(plan, state.nextStepIndex).batchIndex, 999);
  assert.ok(indexedBatchReads <= 1, `expected direct cursor lookup, observed ${indexedBatchReads} indexed reads`);
  assert.equal(skillEvolutionTransitionClaimTtl(state, "step"),
    (2 * SKILL_EVOLUTION_CONTROL_CALL_TIMEOUT_CAP_MS) + 20 + 30_000);
});

test("individual evidence is capped below half of the host RPC exchange", () => {
  assert.doesNotThrow(() => checkedSkillEvolutionEvidence({ evidence: { blob: "x".repeat(95 * 1024) } }));
  assert.throws(
    () => checkedSkillEvolutionEvidence({ evidence: { blob: "x".repeat(96 * 1024) } }),
    /exceeds the bounded adapter exchange/,
  );
});
