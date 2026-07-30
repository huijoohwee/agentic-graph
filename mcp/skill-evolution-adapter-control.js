import { verifySkillEvolutionMutationBoundary } from "./skill-evolution-mutation-verification.js";

const SHA256 = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9](?:[A-Za-z0-9._:/-]*[A-Za-z0-9])?$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const USAGE_METHODS = Object.freeze([
  "executeTraining",
  "proposeCandidate",
  "executeValidation",
  "evaluateValidation",
]);

const normalizeUsd = (value) => Number(value.toFixed(12));
const normalizeText = (value) => value.replace(/\r\n?/g, "\n");
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const exactKeys = (value, keys) => isPlainObject(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => hasOwn(value, key));
const freezeClone = (value) => {
  const cloned = structuredClone(value);
  const visit = (entry) => {
    if (!entry || typeof entry !== "object" || Object.isFrozen(entry)) return entry;
    for (const child of Object.values(entry)) visit(child);
    return Object.freeze(entry);
  };
  return visit(cloned);
};
const runtimeError = (code, message, field = null) => Object.assign(new Error(message), { code, field });

function validateUsageLimit(value, method) {
  if (!exactKeys(value, ["maxTokens", "maxCostUsd", "maxDurationMs"])) {
    throw runtimeError("source_drift", `Source verification returned an invalid ${method} usage envelope.`);
  }
  if (!Number.isSafeInteger(value.maxTokens) || value.maxTokens < 0) {
    throw runtimeError("source_drift", `${method}.maxTokens must be a non-negative safe integer.`);
  }
  if (!Number.isFinite(value.maxCostUsd) || value.maxCostUsd < 0) {
    throw runtimeError("source_drift", `${method}.maxCostUsd must be finite and non-negative.`);
  }
  if (!Number.isSafeInteger(value.maxDurationMs) || value.maxDurationMs < 1) {
    throw runtimeError("source_drift", `${method}.maxDurationMs must be a positive safe integer.`);
  }
  return {
    maxTokens: value.maxTokens,
    maxCostUsd: normalizeUsd(value.maxCostUsd),
    maxDurationMs: value.maxDurationMs,
  };
}

export function assertSkillEvolutionSourceVerification(result, request, plan) {
  const keys = ["ok", "sourceRevision", "digestsVerified", "registeredGates", "usageEnvelope"];
  if (!exactKeys(result, keys)
    || result.ok !== true
    || result.sourceRevision !== request.sourceRevision
    || result.digestsVerified !== true) {
    throw runtimeError("source_drift", "Source verification did not prove the exact admitted revision and digests.");
  }
  if (!Array.isArray(result.registeredGates) || result.registeredGates.length > 64) {
    throw runtimeError("source_drift", "Source verification returned an invalid gate registry.");
  }
  const registeredGates = [];
  const gateSet = new Set();
  for (const gate of result.registeredGates) {
    if (typeof gate !== "string" || gate.length > 160 || !TOKEN.test(gate) || gateSet.has(gate)) {
      throw runtimeError("source_drift", "Source verification returned malformed or duplicate gate ids.");
    }
    gateSet.add(gate);
    registeredGates.push(gate);
  }
  for (const gate of request.validation.requiredGates) {
    if (!gateSet.has(gate)) throw runtimeError("gate_failed", `Required gate ${gate} is not registered.`, "validation.requiredGates");
  }
  if (!exactKeys(result.usageEnvelope, USAGE_METHODS)) {
    throw runtimeError("source_drift", "Source verification returned an incomplete usage envelope.");
  }
  const usageEnvelope = Object.fromEntries(USAGE_METHODS.map((method) => [
    method,
    validateUsageLimit(result.usageEnvelope[method], method),
  ]));
  const calls = {
    executeTraining: plan.totals.trainingRolloutCalls,
    proposeCandidate: plan.totals.candidateCalls,
    executeValidation: plan.totals.validationRolloutCalls,
    evaluateValidation: plan.totals.evaluatorCalls,
  };
  const worstCase = USAGE_METHODS.reduce((total, method) => ({
    tokens: total.tokens + (calls[method] * usageEnvelope[method].maxTokens),
    costUsd: normalizeUsd(total.costUsd + (calls[method] * usageEnvelope[method].maxCostUsd)),
    durationMs: total.durationMs + (calls[method] * usageEnvelope[method].maxDurationMs),
  }), { tokens: 0, costUsd: 0, durationMs: 0 });
  for (const [actual, maximum, field] of [
    [worstCase.tokens, request.bounds.maxTokens, "bounds.maxTokens"],
    [worstCase.costUsd, request.bounds.maxCostUsd, "bounds.maxCostUsd"],
    [worstCase.durationMs, request.bounds.maxDurationMs, "bounds.maxDurationMs"],
  ]) {
    if (actual > maximum) throw runtimeError("bound_exceeded", `Source-bound usage envelopes exceed ${field}.`, field);
  }
  return freezeClone({ registeredGates, usageEnvelope, worstCase });
}

export function validateSkillEvolutionUsage(cost, envelope, elapsedMs = 0) {
  if (!exactKeys(cost, ["tokens", "costUsd", "durationMs"])) {
    throw runtimeError("cost_unverified", "Adapter usage must contain exact tokens, costUsd, and durationMs fields.");
  }
  const usage = {
    adapterCalls: 1,
    tokens: cost.tokens,
    costUsd: Number.isFinite(cost.costUsd) ? normalizeUsd(cost.costUsd) : cost.costUsd,
    durationMs: cost.durationMs,
  };
  if (!Number.isSafeInteger(usage.tokens) || usage.tokens < 0
    || !Number.isFinite(usage.costUsd) || usage.costUsd < 0
    || !Number.isSafeInteger(usage.durationMs) || usage.durationMs < 0) {
    throw runtimeError("cost_unverified", "Adapter usage values must be finite non-negative canonical meters.");
  }
  if (usage.tokens > envelope.maxTokens
    || usage.costUsd > envelope.maxCostUsd
    || usage.durationMs > envelope.maxDurationMs) {
    throw Object.assign(runtimeError("bound_exceeded", "Adapter usage exceeded its source-bound per-call envelope."), { usage });
  }
  return usage;
}

export function conservativeSkillEvolutionUsage(envelope) {
  return {
    adapterCalls: 1,
    tokens: envelope.maxTokens,
    costUsd: envelope.maxCostUsd,
    durationMs: envelope.maxDurationMs,
  };
}

function isOpaqueRef(value) {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 4096
    && /\S/.test(value)
    && !CONTROL_CHARACTERS.test(value);
}

export async function verifySkillEvolutionCandidateProposal(result, {
  adapter,
  sourceRevision,
  signal,
  parent,
  parentNormalizedChars,
  budget,
  remaining,
} = {}) {
  const candidate = result?.candidate;
  if (!exactKeys(candidate, ["candidateRef", "diffRef", "digest", "parentDigest"])
    || !isOpaqueRef(candidate.candidateRef)
    || !isOpaqueRef(candidate.diffRef)
    || !SHA256.test(candidate.digest || "")
    || candidate.parentDigest !== parent?.digest
    || candidate.digest === parent?.digest) {
    throw runtimeError("adapter_failed", "Candidate identity, references, or lineage are invalid.");
  }
  if (!exactKeys(result?.mutation, ["hunks"])
    || !Array.isArray(result.mutation.hunks)
    || result.mutation.hunks.length === 0) {
    throw runtimeError("adapter_failed", "Candidate adapter must return canonical mutation hunks.");
  }
  if (!Number.isSafeInteger(parentNormalizedChars) || parentNormalizedChars < 1) {
    throw runtimeError("source_drift", "Working-candidate normalized length is invalid.");
  }
  let previousStart = -1;
  let previousEnd = 0;
  let insertedChars = 0;
  let deletedChars = 0;
  for (const hunk of result.mutation.hunks) {
    if (!exactKeys(hunk, ["start", "deleteText", "insertText"])
      || !Number.isSafeInteger(hunk.start)
      || hunk.start < 0
      || hunk.start > parentNormalizedChars
      || hunk.start < previousEnd
      || hunk.start === previousStart
      || typeof hunk.deleteText !== "string"
      || typeof hunk.insertText !== "string") {
      throw runtimeError("adapter_failed", "Candidate mutation hunks must be exact, ordered, and non-overlapping.");
    }
    const deleteText = normalizeText(hunk.deleteText);
    const insertText = normalizeText(hunk.insertText);
    if (deleteText.length === 0 && insertText.length === 0) {
      throw runtimeError("adapter_failed", "Candidate mutation hunks may not be empty.");
    }
    const end = hunk.start + deleteText.length;
    if (end > parentNormalizedChars) throw runtimeError("adapter_failed", "Candidate deletion exceeds its parent text.");
    previousStart = hunk.start;
    previousEnd = end;
    deletedChars += deleteText.length;
    insertedChars += insertText.length;
  }
  const mutationOperations = result.mutation.hunks.length;
  const changedChars = insertedChars + deletedChars;
  const normalizedChars = parentNormalizedChars - deletedChars + insertedChars;
  if (normalizedChars < 1 || normalizedChars > 10000000
    || mutationOperations > budget.maxMutationOperations
    || mutationOperations > remaining.mutationOperations
    || changedChars > budget.maxChangedChars
    || changedChars > remaining.changedChars) {
    throw runtimeError("bound_exceeded", "Candidate mutation exceeds the admitted textual budget.");
  }
  const verified = await verifySkillEvolutionMutationBoundary(adapter, {
    sourceRevision,
    parent,
    candidate,
    mutation: result.mutation,
    expected: { parentNormalizedChars, candidateNormalizedChars: normalizedChars, mutationOperations, changedChars },
  }, { signal });
  return freezeClone({ candidate, ...verified });
}

export const SKILL_EVOLUTION_USAGE_METHODS = USAGE_METHODS;
