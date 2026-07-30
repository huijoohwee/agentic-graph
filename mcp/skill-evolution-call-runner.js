import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import {
  conservativeSkillEvolutionUsage,
  validateSkillEvolutionUsage,
} from "./skill-evolution-adapter-control.js";

const ADAPTER_ROLES = Object.freeze({
  executeTraining: "trainingExecutor",
  proposeCandidate: "candidate",
  executeValidation: "heldOut",
  evaluateValidation: "heldOut",
});
const clone = (value) => structuredClone(value);
const normalizeUsd = (value) => Number(value.toFixed(12));
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const digest = (value) => createHash("sha256").update(stableJson(value)).digest("hex");

export function remainingSkillEvolutionBudget(state) {
  const { bounds } = state.request;
  return {
    adapterCalls: bounds.maxAdapterCalls - state.cost.adapterCalls,
    tokens: bounds.maxTokens - state.cost.tokens,
    costUsd: normalizeUsd(bounds.maxCostUsd - state.cost.costUsd),
    durationMs: bounds.maxDurationMs - state.cost.durationMs,
    mutationOperations: bounds.maxMutationOperations - state.cost.mutationOperations,
    changedChars: bounds.maxChangedChars - state.cost.changedChars,
  };
}

function addUsage(state, usage, phase) {
  const phaseCost = state.cost.byPhase[phase];
  const nextPhase = {
    adapterCalls: phaseCost.adapterCalls + usage.adapterCalls,
    tokens: phaseCost.tokens + usage.tokens,
    costUsd: normalizeUsd(phaseCost.costUsd + usage.costUsd),
    durationMs: phaseCost.durationMs + usage.durationMs,
  };
  const { training, validation } = state.cost.byPhase;
  const otherPhase = phase === "training" ? validation : training;
  const nextCost = {
    adapterCalls: nextPhase.adapterCalls + otherPhase.adapterCalls,
    tokens: nextPhase.tokens + otherPhase.tokens,
    costUsd: normalizeUsd(nextPhase.costUsd + otherPhase.costUsd),
    durationMs: nextPhase.durationMs + otherPhase.durationMs,
  };
  if (usage.adapterCalls !== 1
    || !Number.isSafeInteger(nextCost.adapterCalls)
    || !Number.isSafeInteger(nextCost.tokens)
    || !Number.isFinite(nextCost.costUsd)
    || !Number.isSafeInteger(nextCost.durationMs)
    || nextCost.adapterCalls > state.request.bounds.maxAdapterCalls
    || nextCost.tokens > state.request.bounds.maxTokens
    || nextCost.costUsd > state.request.bounds.maxCostUsd
    || nextCost.durationMs > state.request.bounds.maxDurationMs) {
    throw Object.assign(new Error("An adapter exceeded the admitted run budget."), { code: "bound_exceeded" });
  }
  Object.assign(phaseCost, nextPhase);
  Object.assign(state.cost, nextCost);
}

function checkedUsage(cost, envelope, startedAt) {
  const elapsedMs = Math.max(0, Math.ceil(performance.now() - startedAt));
  const usage = validateSkillEvolutionUsage(cost, envelope, elapsedMs);
  if (elapsedMs > envelope.maxDurationMs) {
    throw Object.assign(new Error("Adapter wall duration exceeded its source-bound envelope."), { code: "timeout" });
  }
  return { ...usage, durationMs: Math.max(usage.durationMs, elapsedMs) };
}

function usageError(error) {
  return error?.code
    ? error
    : Object.assign(new Error("Adapter usage could not be safely measured."), { code: "cost_unverified" });
}

export async function invokeSkillEvolutionAdapter({
  state,
  adapter,
  method,
  phase,
  payload,
  signal,
  call,
}) {
  const capability = adapter?.[ADAPTER_ROLES[method]];
  if (typeof capability?.[method] !== "function") {
    throw Object.assign(new Error(`Skill-evolution adapter method ${method} is unavailable.`), { code: "adapter_unavailable" });
  }
  const remaining = remainingSkillEvolutionBudget(state);
  const envelope = state.sourceVerification.usageEnvelope[method];
  if (remaining.adapterCalls < 1
    || remaining.tokens < envelope.maxTokens
    || remaining.costUsd < envelope.maxCostUsd
    || remaining.durationMs < envelope.maxDurationMs) {
    throw Object.assign(new Error("No adapter capacity remains for the source-bound call envelope."), { code: "bound_exceeded" });
  }
  if (signal?.aborted) throw Object.assign(new Error("Skill-evolution step was canceled by its host."), { code: "canceled" });
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutMs = Math.max(1, Math.min(envelope.maxDurationMs, remaining.durationMs));
  const deadlineAt = Date.now() + timeoutMs;
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    controller.abort(signal?.reason);
    rejectAbort(Object.assign(new Error("Skill-evolution step was canceled by its host."), { code: "canceled" }));
  };
  signal?.addEventListener?.("abort", onAbort, { once: true });
  let timeout;
  let deadlineExpired = false;
  const timedOut = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      deadlineExpired = true;
      reject(Object.assign(new Error("Skill-evolution adapter deadline exceeded."), { code: "timeout" }));
      controller.abort("skill-evolution deadline exceeded");
    }, timeoutMs);
  });
  let result;
  try {
    result = await Promise.race([
      capability[method]({
        ...payload,
        remainingBudget: remaining,
        usageLimit: clone(envelope),
        call: { ...call, deadlineAt, inputDigest: digest(payload) },
        signal: controller.signal,
      }),
      timedOut,
      aborted,
    ]);
    if (signal?.aborted) throw Object.assign(new Error("Skill-evolution step was canceled by its host."), { code: "canceled", cost: result?.cost });
  } catch (error) {
    if (deadlineExpired && error?.code === "canceled") {
      error = Object.assign(new Error("Skill-evolution adapter deadline exceeded."), { code: "timeout" });
    }
    let usage;
    let meterError = null;
    try {
      usage = checkedUsage(error?.cost, envelope, startedAt);
    } catch (cause) {
      usage = conservativeSkillEvolutionUsage(envelope);
      meterError = usageError(cause);
    }
    addUsage(state, usage, phase);
    if (meterError && !["canceled", "timeout"].includes(error?.code)) throw meterError;
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.("abort", onAbort);
  }
  let usage;
  try {
    usage = checkedUsage(result?.cost, envelope, startedAt);
  } catch (error) {
    addUsage(state, conservativeSkillEvolutionUsage(envelope), phase);
    throw usageError(error);
  }
  addUsage(state, usage, phase);
  return result;
}
