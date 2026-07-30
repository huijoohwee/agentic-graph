import { createHash } from "node:crypto";

import { SKILL_EVOLUTION_LEARNING_RATE_SEMANTIC } from "./skill-evolution-tool-contract.js";
import { assertSkillEvolutionRequest } from "./skill-evolution-validation.js";

export const SKILL_EVOLUTION_BATCH_PLAN_SCHEMA = "knowgrph-skill-evolution-batch-plan/v1";

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

const preciseNumber = (value) => Number(value.toPrecision(15));

export class SkillEvolutionBatchPlanError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = "SkillEvolutionBatchPlanError";
    this.code = code;
    this.field = field;
  }
}

function checkedEpochIndex(epochIndex) {
  if (!Number.isSafeInteger(epochIndex) || epochIndex < 0) {
    throw new SkillEvolutionBatchPlanError(
      "schedule_invalid",
      "epochIndex must be a non-negative safe integer.",
      "epochIndex",
    );
  }
  return epochIndex;
}

export function computeSkillEvolutionLearningRate(schedule, epochIndex) {
  const index = checkedEpochIndex(epochIndex);
  const learningRate = schedule?.learningRate;
  if (
    !learningRate
    || !Number.isFinite(learningRate.initial)
    || learningRate.initial <= 0
    || learningRate.initial > 1
    || !Number.isFinite(learningRate.decay)
    || learningRate.decay <= 0
    || learningRate.decay > 1
    || !Number.isFinite(learningRate.floor)
    || learningRate.floor < 0
    || learningRate.floor > learningRate.initial
  ) {
    throw new SkillEvolutionBatchPlanError(
      "schedule_invalid",
      "schedule.learningRate must contain valid initial, decay, and floor values.",
      "schedule.learningRate",
    );
  }
  return preciseNumber(Math.max(
    learningRate.floor,
    learningRate.initial * (learningRate.decay ** index),
  ));
}

export function mutationBudgetForStep(schedule, bounds, stepIndex, normalizedChars = bounds?.normalizedChars) {
  const learningRate = computeSkillEvolutionLearningRate(schedule, stepIndex);
  const sourceChars = normalizedChars ?? bounds?.maxChangedChars;
  if (!Number.isSafeInteger(sourceChars) || sourceChars <= 0) {
    throw new SkillEvolutionBatchPlanError(
      "bound_invalid",
      "normalizedChars must be a positive safe integer.",
      "baseline.normalizedChars",
    );
  }
  if (
    !Number.isSafeInteger(bounds?.maxMutationOperations)
    || bounds.maxMutationOperations <= 0
    || !Number.isSafeInteger(bounds?.maxChangedChars)
    || bounds.maxChangedChars <= 0
  ) {
    throw new SkillEvolutionBatchPlanError(
      "bound_invalid",
      "Mutation-operation and changed-character bounds must be positive safe integers.",
      "bounds",
    );
  }
  return deepFreeze({
    semantic: SKILL_EVOLUTION_LEARNING_RATE_SEMANTIC,
    learningRate,
    maxMutationOperations: bounds.maxMutationOperations,
    maxChangedChars: Math.min(
      bounds.maxChangedChars,
      Math.max(1, Math.floor(sourceChars * learningRate)),
    ),
  });
}

function seededUint32(seedMaterial) {
  const digest = createHash("sha256").update(seedMaterial).digest();
  let state = digest.readUInt32LE(0) ^ digest.readUInt32LE(4) ^ digest.readUInt32LE(8);
  return state === 0 ? 0x9e3779b9 : state >>> 0;
}

function deterministicShuffle(entries, seedMaterial) {
  let state = seededUint32(seedMaterial);
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  const shuffled = entries.map((entry) => structuredClone(entry));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function chunks(entries, size) {
  const result = [];
  for (let index = 0; index < entries.length; index += size) {
    result.push(entries.slice(index, index + size));
  }
  return result;
}

function enforcePlanBounds(bounds, totals) {
  const checks = [
    [totals.candidateCalls, bounds.maxCandidates, "bounds.maxCandidates", "candidate calls"],
    [totals.adapterCalls, bounds.maxAdapterCalls, "bounds.maxAdapterCalls", "adapter calls"],
    [totals.candidateCalls, bounds.maxMutationOperations, "bounds.maxMutationOperations", "minimum mutation operations"],
    [totals.candidateCalls, bounds.maxChangedChars, "bounds.maxChangedChars", "minimum changed characters"],
  ];
  for (const [required, available, field, label] of checks) {
    if (required > available) {
      throw new SkillEvolutionBatchPlanError(
        "bound_exceeded",
        `Schedule requires ${required} ${label}, exceeding ${field}=${available}.`,
        field,
      );
    }
  }
}

export function buildSkillEvolutionPlan(rawRequest) {
  const request = assertSkillEvolutionRequest(rawRequest);
  if (request.operation !== "plan" && request.operation !== "start") {
    throw new SkillEvolutionBatchPlanError(
      "operation_invalid",
      "Only plan and start requests contain a batch schedule.",
      "operation",
    );
  }

  const manifestDigest = createHash("sha256")
    .update(JSON.stringify(request.dataset.training))
    .digest("hex");
  const batchesPerEpoch = chunks(request.dataset.training, request.schedule.batchSize).length;
  const miniBatchesPerEpoch = chunks(request.dataset.training, request.schedule.batchSize)
    .reduce((total, batch) => total + chunks(batch, request.schedule.miniBatchSize).length, 0);
  const totals = {
    batches: batchesPerEpoch * request.schedule.epochs,
    steps: (miniBatchesPerEpoch + 1) * request.schedule.epochs,
    candidateCalls: miniBatchesPerEpoch * request.schedule.epochs,
    trainingRolloutCalls: miniBatchesPerEpoch * request.schedule.epochs,
    validationCalls: request.schedule.epochs,
    validationRolloutCalls: request.schedule.epochs * 2,
    evaluatorCalls: request.schedule.epochs,
    trainingAdapterCalls: miniBatchesPerEpoch * request.schedule.epochs * 2,
    validationAdapterCalls: request.schedule.epochs * 3,
    adapterCalls: (miniBatchesPerEpoch * request.schedule.epochs * 2) + (request.schedule.epochs * 3),
    scenarioExecutions: request.dataset.training.length * request.schedule.epochs,
    validationScenarioExecutions: request.dataset.validation.length * request.schedule.epochs * 2,
  };
  enforcePlanBounds(request.bounds, totals);

  const epochPlans = [];
  const validationCheckpoints = [];
  let candidateCallIndex = 0;
  let transitionStepIndex = 0;
  let globalBatchIndex = 0;
  let remainingMutationOperations = request.bounds.maxMutationOperations;
  let remainingChangedChars = request.bounds.maxChangedChars;

  const allocateMutationBudget = (ceiling) => {
    const remainingCandidates = totals.candidateCalls - candidateCallIndex;
    const budget = {
      ...ceiling,
      maxMutationOperations: Math.min(
        ceiling.maxMutationOperations,
        Math.max(1, Math.floor(remainingMutationOperations / remainingCandidates)),
      ),
      maxChangedChars: Math.min(
        ceiling.maxChangedChars,
        Math.max(1, Math.floor(remainingChangedChars / remainingCandidates)),
      ),
    };
    remainingMutationOperations -= budget.maxMutationOperations;
    remainingChangedChars -= budget.maxChangedChars;
    return budget;
  };

  for (let epochIndex = 0; epochIndex < request.schedule.epochs; epochIndex += 1) {
    const learningRate = computeSkillEvolutionLearningRate(request.schedule, epochIndex);
    const mutationBudgetCeiling = mutationBudgetForStep(
      request.schedule,
      request.bounds,
      epochIndex,
      request.baseline.normalizedChars,
    );
    const orderedTraining = deterministicShuffle(
      request.dataset.training,
      `${request.schedule.seed}\0${request.sourceRevision}\0${manifestDigest}\0${epochIndex}`,
    );
    const batches = chunks(orderedTraining, request.schedule.batchSize).map((scenarioRefs, batchIndex) => {
      const miniBatches = chunks(scenarioRefs, request.schedule.miniBatchSize).map((miniScenarioRefs, miniBatchIndex) => {
        const mutationBudget = allocateMutationBudget(mutationBudgetCeiling);
        return {
          kind: "candidate",
          stepIndex: transitionStepIndex++,
          candidateIndex: candidateCallIndex++,
          epochIndex,
          batchIndex,
          globalBatchIndex,
          miniBatchIndex,
          learningRate,
          mutationBudget,
          scenarioRefs: miniScenarioRefs,
        };
      });
      const batch = {
        epochIndex,
        batchIndex,
        globalBatchIndex,
        learningRate,
        mutationBudgetCeiling,
        scenarioRefs,
        miniBatches,
      };
      globalBatchIndex += 1;
      return batch;
    });
    epochPlans.push({
      epochIndex,
      learningRate,
      mutationBudgetCeiling,
      batches,
    });
    validationCheckpoints.push({
      kind: "validation",
      stepIndex: transitionStepIndex++,
      epochIndex,
      evaluator: structuredClone(request.evaluator),
      scenarioRefs: structuredClone(request.dataset.validation),
      requiredGates: [...request.validation.requiredGates],
    });
  }

  totals.mutationOperationsBudgeted = request.bounds.maxMutationOperations - remainingMutationOperations;
  totals.changedCharsBudgeted = request.bounds.maxChangedChars - remainingChangedChars;

  return deepFreeze({
    schema: SKILL_EVOLUTION_BATCH_PLAN_SCHEMA,
    sourceRevision: request.sourceRevision,
    seed: request.schedule.seed,
    learningRateSemantic: SKILL_EVOLUTION_LEARNING_RATE_SEMANTIC,
    epochs: request.schedule.epochs,
    batchSize: request.schedule.batchSize,
    miniBatchSize: request.schedule.miniBatchSize,
    learningRate: structuredClone(request.schedule.learningRate),
    batchesPerEpoch,
    miniBatchesPerEpoch,
    maxCandidateCalls: totals.candidateCalls,
    totals,
    meterCaps: structuredClone(request.bounds),
    training: {
      baseline: structuredClone(request.baseline),
      executor: structuredClone(request.executor),
      candidateAdapter: structuredClone(request.candidateAdapter),
      epochPlans,
    },
    validation: {
      evaluator: structuredClone(request.evaluator),
      minDelta: request.validation.minDelta,
      patience: request.validation.patience,
      requiredGates: [...request.validation.requiredGates],
      disjoint: true,
      checkpoints: validationCheckpoints,
    },
  });
}

export const planSkillEvolutionBatches = buildSkillEvolutionPlan;
