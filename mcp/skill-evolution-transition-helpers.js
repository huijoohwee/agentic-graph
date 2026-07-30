import { assertSkillEvolutionSourceVerification } from "./skill-evolution-adapter-control.js";

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_EVIDENCE_BYTES = 96 * 1024;
export const SKILL_EVOLUTION_CONTROL_CALL_TIMEOUT_CAP_MS = 10 * 60 * 1000;
const SETTLEMENT_GRACE_MS = 30_000;
const clone = (value) => structuredClone(value);

export function checkedSkillEvolutionEvidence(result, label = "Adapter") {
  const evidence = result?.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error(`${label} returned no evidence.`);
  }
  if (Buffer.byteLength(JSON.stringify(evidence)) > MAX_EVIDENCE_BYTES) {
    throw new Error(`${label} evidence exceeds the bounded adapter exchange.`);
  }
  return clone(evidence);
}

export function checkedSkillEvolutionValidation(result, requiredGates, registeredGates) {
  const champion = result?.metrics?.champion;
  const candidate = result?.metrics?.candidate;
  if (!Number.isFinite(champion) || !Number.isFinite(candidate)) {
    throw new Error("Evaluator returned invalid champion or candidate metrics.");
  }
  if (!Array.isArray(result.gateResults) || result.gateResults.length > 64) {
    throw new Error("Evaluator returned invalid gate results.");
  }
  const gates = new Map();
  const required = new Set(requiredGates);
  const registered = new Set(registeredGates);
  for (const gate of result.gateResults) {
    if (!gate || typeof gate.id !== "string" || typeof gate.passed !== "boolean" || gates.has(gate.id)
      || !registered.has(gate.id) || !required.has(gate.id)) {
      throw Object.assign(new Error("Evaluator returned malformed, duplicate, extra, or unregistered gates."), { code: "gate_failed" });
    }
    const evidenceDigest = SHA256.test(gate.evidenceDigest || "") ? gate.evidenceDigest : null;
    gates.set(gate.id, { id: gate.id, passed: gate.passed && evidenceDigest !== null, evidenceDigest });
  }
  return {
    champion,
    candidate,
    gateResults: requiredGates.map((id) => gates.get(id) || { id, passed: false, evidenceDigest: null }),
  };
}

export function isSkillEvolutionPromotion(metric, rules, scores, gates) {
  const directionalGain = metric.direction === "maximize"
    ? scores.candidate - scores.champion
    : scores.champion - scores.candidate;
  const thresholdPassed = metric.direction === "maximize"
    ? scores.candidate >= metric.threshold
    : scores.candidate <= metric.threshold;
  return directionalGain > 0
    && directionalGain >= rules.minDelta
    && thresholdPassed
    && gates.every((gate) => gate.passed);
}

export function skillEvolutionUnitAt(plan, stepIndex) {
  if (!Number.isSafeInteger(stepIndex) || stepIndex < 0 || stepIndex >= plan.totals.steps) return null;
  const unitsPerEpoch = plan.miniBatchesPerEpoch + 1;
  const epochIndex = Math.floor(stepIndex / unitsPerEpoch);
  const epochOffset = stepIndex % unitsPerEpoch;
  if (epochOffset === plan.miniBatchesPerEpoch) {
    return plan.validation.checkpoints[epochIndex] || null;
  }
  const miniBatchesPerFullBatch = Math.ceil(plan.batchSize / plan.miniBatchSize);
  const batchIndex = Math.floor(epochOffset / miniBatchesPerFullBatch);
  const miniBatchIndex = epochOffset % miniBatchesPerFullBatch;
  return plan.training.epochPlans[epochIndex]?.batches[batchIndex]?.miniBatches[miniBatchIndex] || null;
}

export function skillEvolutionUnits(plan) {
  const units = new Array(plan.totals.steps);
  for (const epoch of plan.training.epochPlans) {
    for (const batch of epoch.batches) {
      for (const miniBatch of batch.miniBatches) units[miniBatch.stepIndex] = miniBatch;
    }
  }
  for (const checkpoint of plan.validation.checkpoints) units[checkpoint.stepIndex] = checkpoint;
  return units;
}

export function skillEvolutionTransitionClaimTtl(state, operation) {
  if (operation !== "step") return SETTLEMENT_GRACE_MS;
  const unit = skillEvolutionUnitAt(state.plan, state.nextStepIndex);
  const envelope = state.sourceVerification.usageEnvelope;
  const callDurationMs = unit?.kind === "candidate"
    ? envelope.executeTraining.maxDurationMs + envelope.proposeCandidate.maxDurationMs
    : unit?.kind === "validation"
      ? (2 * envelope.executeValidation.maxDurationMs) + envelope.evaluateValidation.maxDurationMs
      : 0;
  const controlCallDurationMs = SKILL_EVOLUTION_CONTROL_CALL_TIMEOUT_CAP_MS
    + (unit?.kind === "candidate" ? SKILL_EVOLUTION_CONTROL_CALL_TIMEOUT_CAP_MS : 0);
  return controlCallDurationMs + callDurationMs + SETTLEMENT_GRACE_MS;
}

export async function verifySkillEvolutionSources(adapter, request, plan, candidates = null, signal = null) {
  if (typeof adapter?.sourceVerifier?.verifySources !== "function") {
    throw Object.assign(new Error("No source-verifying skill-evolution adapter is configured."), { code: "adapter_unavailable" });
  }
  if (signal?.aborted) {
    throw Object.assign(new Error("Skill-evolution source verification was canceled by its host."), { code: "canceled" });
  }
  const result = await adapter.sourceVerifier.verifySources({
    sourceRevision: request.sourceRevision,
    baseline: clone(request.baseline),
    executor: clone(request.executor),
    candidateAdapter: clone(request.candidateAdapter),
    dataset: clone(request.dataset),
    evaluator: clone(request.evaluator),
    candidates: candidates ? clone(candidates) : null,
    signal,
  });
  if (result?.code === "adapter_unavailable") {
    throw Object.assign(new Error("A required skill-evolution adapter is unavailable."), { code: "adapter_unavailable" });
  }
  return assertSkillEvolutionSourceVerification(result, request, plan);
}
