import { createHash, randomUUID } from "node:crypto";

import { buildSkillEvolutionPlan } from "./skill-evolution-batches.js";
import {
  verifySkillEvolutionCandidateProposal,
} from "./skill-evolution-adapter-control.js";
import {
  invokeSkillEvolutionAdapter,
  remainingSkillEvolutionBudget,
} from "./skill-evolution-call-runner.js";
import {
  checkedSkillEvolutionEvidence,
  checkedSkillEvolutionValidation,
  isSkillEvolutionPromotion,
  skillEvolutionTransitionClaimTtl,
  skillEvolutionUnitAt,
  verifySkillEvolutionSources,
} from "./skill-evolution-transition-helpers.js";
import { createSkillEvolutionMemoryStore } from "./skill-evolution-store.js";
import {
  SKILL_EVOLUTION_INVOCATION,
  SKILL_EVOLUTION_REQUEST_SCHEMA,
  SKILL_EVOLUTION_RESULT_SCHEMA,
  SKILL_EVOLUTION_TOOL_NAME,
} from "./skill-evolution-tool-contract.js";
import { validateSkillEvolutionRequest } from "./skill-evolution-validation.js";

const OPERATIONS = new Set(["plan", "start", "step", "status", "cancel"]);
const TERMINAL = new Set(["review_pending", "stopped", "canceled", "failed"]);
const TRANSITION_ERROR_CODES = new Set([
  "bound_exceeded",
  "canceled",
  "cost_unverified",
  "gate_failed",
  "lease_lost",
  "source_drift",
  "timeout",
]);
const SAFETY = Object.freeze({
  applied: false,
  modelWeightsMutated: false,
  deploymentAttempted: false,
});

const clone = (value) => structuredClone(value);
const digest = (value) => createHash("sha256").update(stableJson(value)).digest("hex");
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const boundedText = (value, max, fallback) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) || fallback;
const errorEntry = (code, message, field = null) => ({
  code: /^[a-z][a-z0-9._-]{0,159}$/.test(code || "") ? code : "runtime_failed",
  field: field === null ? null : boundedText(field, 512, "request"),
  message: boundedText(message, 4096, "Skill-evolution request failed."),
});
const publicTransitionMessage = (code) => ({
  adapter_unavailable: "A required skill-evolution adapter is unavailable.",
  adapter_failed: "A configured skill-evolution adapter failed.",
  bound_exceeded: "The admitted skill-evolution budget was exceeded.",
  canceled: "The skill-evolution step was canceled by its host.",
  cost_unverified: "A skill-evolution adapter did not return exact bounded usage.",
  gate_failed: "A required skill-evolution validation gate is unavailable or failed.",
  lease_lost: "The skill-evolution transition lost its state fence.",
  source_drift: "A source, dataset, policy, or adapter identity drifted.",
  timeout: "The skill-evolution transition exceeded its admitted deadline.",
}[code] || "The skill-evolution transition failed closed.");
const transitionErrorCode = (error) => TRANSITION_ERROR_CODES.has(error?.code) ? error.code : "adapter_failed";
const initialCost = () => ({
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
});
const invocation = () => ({
  command: SKILL_EVOLUTION_INVOCATION.command,
  semantics: [...SKILL_EVOLUTION_INVOCATION.semantics],
  bindings: [...SKILL_EVOLUTION_INVOCATION.bindings],
});
const compactPlan = (plan) => ({
  epochs: plan.epochs,
  batchSize: plan.batchSize,
  miniBatchSize: plan.miniBatchSize,
  learningRate: clone(plan.learningRate),
  batchesPerEpoch: plan.batchesPerEpoch,
  miniBatchesPerEpoch: plan.miniBatchesPerEpoch,
  maxCandidateCalls: plan.maxCandidateCalls,
});
const baselineCandidate = (baseline) => ({
  candidateRef: baseline.artifactRef,
  diffRef: null,
  digest: baseline.digest,
  parentDigest: null,
});
const replayCore = (state) => ({
  revision: state.revision,
  status: state.status,
  progress: clone(state.progress),
  workingCandidate: clone(state.workingCandidate),
  champion: clone(state.champion),
  promotedCandidate: clone(state.promotedCandidate),
  metrics: clone(state.metrics),
  validation: clone(state.validation),
  cost: clone(state.cost),
  stopReason: state.stopReason,
  proposal: clone(state.proposal),
  errors: clone(state.errors),
});

function project(state, operation, replay = null) {
  const dynamic = replay || replayCore(state);
  return {
    schema: SKILL_EVOLUTION_RESULT_SCHEMA,
    runId: state.runId,
    revision: dynamic.revision,
    operation,
    status: dynamic.status,
    invocation: clone(state.request.invocation),
    sourceRevision: state.request.sourceRevision,
    baseline: clone(state.request.baseline),
    executor: clone(state.request.executor),
    candidateAdapter: clone(state.request.candidateAdapter),
    dataset: clone(state.request.dataset),
    evaluator: clone(state.request.evaluator),
    plan: compactPlan(state.plan),
    progress: clone(dynamic.progress),
    workingCandidate: clone(dynamic.workingCandidate),
    champion: clone(dynamic.champion),
    promotedCandidate: clone(dynamic.promotedCandidate),
    metrics: clone(dynamic.metrics),
    validation: clone(dynamic.validation),
    cost: clone(dynamic.cost),
    stopReason: dynamic.stopReason,
    proposal: clone(dynamic.proposal),
    errors: clone(dynamic.errors),
    ...SAFETY,
  };
}
function failed(operation, errors, request = {}, state = null) {
  const boundedErrors = (Array.isArray(errors) ? errors : [errorEntry("runtime_failed", "Skill-evolution request failed.")]).slice(0, 100);
  if (state) return { ...project(state, operation), status: "failed", stopReason: null, proposal: null, errors: boundedErrors };
  const validated = validateSkillEvolutionRequest(request);
  const source = validated.ok && ["plan", "start"].includes(validated.request.operation)
    ? validated.request
    : null;
  return {
    schema: SKILL_EVOLUTION_RESULT_SCHEMA,
    runId: null,
    revision: 0,
    operation,
    status: "failed",
    invocation: invocation(),
    sourceRevision: source?.sourceRevision || null,
    baseline: source ? clone(source.baseline) : null,
    executor: source ? clone(source.executor) : null,
    candidateAdapter: source ? clone(source.candidateAdapter) : null,
    dataset: source ? clone(source.dataset) : null,
    evaluator: source ? clone(source.evaluator) : null,
    plan: null,
    progress: { epoch: 0, batch: 0, miniBatch: 0, candidatesEvaluated: 0 },
    workingCandidate: source ? baselineCandidate(source.baseline) : null,
    champion: source ? baselineCandidate(source.baseline) : null,
    promotedCandidate: null,
    metrics: { baseline: null, workingCandidate: null, champion: null, promotedCandidate: null },
    validation: { disjoint: false, gateResults: [], staleEpochs: 0 },
    cost: initialCost(),
    stopReason: null,
    proposal: null,
    errors: boundedErrors,
    ...SAFETY,
  };
}
function planResult(request, plan) {
  const state = {
    runId: null,
    revision: 0,
    status: "planned",
    request,
    plan,
    progress: { epoch: 0, batch: 0, miniBatch: 0, candidatesEvaluated: 0 },
    champion: baselineCandidate(request.baseline),
    workingCandidate: baselineCandidate(request.baseline),
    promotedCandidate: null,
    metrics: { baseline: null, workingCandidate: null, champion: null, promotedCandidate: null },
    validation: { disjoint: true, gateResults: [], staleEpochs: 0 },
    cost: initialCost(),
    stopReason: null,
    proposal: null,
    errors: [],
  };
  return project(state, "plan");
}
function initialState(request, plan, sourceVerification, runId, now) {
  const champion = baselineCandidate(request.baseline);
  return {
    schema: "knowgrph-skill-evolution-run/v1",
    runId,
    revision: 1,
    status: "ready",
    request: clone(request),
    requestDigest: digest({ ...request, operation: "start" }),
    plan: clone(plan),
    sourceVerification: clone(sourceVerification),
    nextStepIndex: 0,
    progress: { epoch: 0, batch: 0, miniBatch: 0, candidatesEvaluated: 0 },
    champion,
    workingCandidate: clone(champion),
    championNormalizedChars: request.baseline.normalizedChars,
    workingCandidateNormalizedChars: request.baseline.normalizedChars,
    promotedCandidate: null,
    metrics: { baseline: null, workingCandidate: null, champion: null, promotedCandidate: null },
    validation: { disjoint: true, gateResults: [], staleEpochs: 0 },
    cost: initialCost(),
    stopReason: null,
    proposal: null,
    errors: [],
    inFlight: null,
    startedAt: now(),
    updatedAt: now(),
    ...SAFETY,
  };
}
function transitionKey(_operation, idempotencyKey) {
  return digest(idempotencyKey);
}

export function createSkillEvolutionRuntime({
  adapter,
  store = createSkillEvolutionMemoryStore(),
  authorize = async () => false,
  now = Date.now,
  idFactory = randomUUID,
} = {}) {
  if (!store || typeof store.put !== "function" || typeof store.getReplay !== "function" || typeof store.claim !== "function" || typeof store.checkpoint !== "function") throw new TypeError("Skill-evolution runtime requires a compatible store.");
  if (typeof authorize !== "function" || typeof now !== "function" || typeof idFactory !== "function") throw new TypeError("Skill-evolution runtime dependencies are invalid.");

  const auth = async (request, context = {}) => {
    const signal = context?.signal || null;
    if (signal?.aborted) throw Object.assign(new Error("Operator authorization was canceled by its host."), { code: "canceled" });
    const decision = await authorize({ operation: request.operation, request: clone(request), context, signal });
    if (signal?.aborted) throw Object.assign(new Error("Operator authorization was canceled by its host."), { code: "canceled" });
    return decision === true || decision?.ok === true;
  };
  const activeTransitions = new Map();
  const plan = async (request) => planResult(request, buildSkillEvolutionPlan(request));
  const start = async (request, context) => {
    if (!await auth(request, context)) return failed("start", [errorEntry("unauthorized", "Operator authority is required.")], request);
    const runId = `se_${digest(request.idempotencyKey).slice(0, 24)}`;
    const requestDigest = digest({ ...request, operation: "start" });
    const existing = await store.get(runId);
    if (existing) {
      if (existing.requestDigest !== requestDigest) return failed("start", [errorEntry("idempotency_conflict", "The start key is already bound to a different request.")], request, existing);
      const key = transitionKey("start", request.idempotencyKey);
      const replay = await store.getReplay(runId, key);
      return project(existing, "start", replay?.result || replayCore(existing));
    }
    let batchPlan;
    let sourceVerification;
    try {
      batchPlan = buildSkillEvolutionPlan(request);
      sourceVerification = await verifySkillEvolutionSources(adapter, request, batchPlan, null, context?.signal);
    }
    catch (error) { return failed("start", [errorEntry(error.code || "invalid_request", error.message, error.field || null)], request); }
    const state = initialState(request, batchPlan, sourceVerification, runId, now);
    const key = transitionKey("start", request.idempotencyKey);
    const startReplay = { operation: "start", expectedRevision: 0, result: replayCore(state) };
    const inserted = await store.put(runId, state, { replayKey: key, replay: startReplay });
    if (!inserted.created) {
      if (inserted.state.requestDigest !== state.requestDigest) return failed("start", [errorEntry("idempotency_conflict", "The start key is already bound to a different request.")], request, inserted.state);
      const replay = await store.getReplay(runId, key);
      return project(inserted.state, "start", replay?.result || replayCore(inserted.state));
    }
    return project(inserted.state, "start");
  };
  const status = async (request) => {
    const state = await store.get(request.runId);
    return state ? project(state, "status") : failed("status", [errorEntry("not_found", `Run ${request.runId} was not found.`)], request);
  };
  const mutate = async (request, context, signal) => {
    if (!await auth(request, context)) return failed(request.operation, [errorEntry("unauthorized", "Operator authority is required.")], request);
    const current = await store.get(request.runId);
    if (!current) return failed(request.operation, [errorEntry("not_found", `Run ${request.runId} was not found.`)], request);
    const key = transitionKey(request.operation, request.idempotencyKey);
    const replay = await store.getReplay(request.runId, key);
    if (replay) {
      if (replay.operation !== request.operation || replay.expectedRevision !== request.expectedRevision) return failed(request.operation, [errorEntry("idempotency_conflict", "The idempotency key is bound to another transition.")], request, current);
      return project(current, request.operation, replay.result);
    }
    if (current.revision !== request.expectedRevision) return failed(request.operation, [errorEntry("stale_revision", `Expected revision ${request.expectedRevision}; current revision is ${current.revision}.`)], request, current);
    if (request.operation === "cancel" && current.inFlight?.operation === "step") {
      const active = activeTransitions.get(request.runId);
      if (!active) {
        const latest = await store.get(request.runId);
        if (latest && latest.revision !== request.expectedRevision) {
          const code = TERMINAL.has(latest.status) ? "invalid_state" : "stale_revision";
          return failed("cancel", [errorEntry(code, `Run is already ${latest.status} at revision ${latest.revision}.`)], request, latest);
        }
        return failed("cancel", [errorEntry("transition_in_progress", "The active transition is owned by another runtime process.")], request, latest || current);
      }
      if (active.key === key) return failed("cancel", [errorEntry("idempotency_conflict", "The idempotency key is already bound to the active step.")], request, current);
      if (active.cancel && active.cancel.key !== key) {
        return failed("cancel", [errorEntry("transition_in_progress", "A different cancel transition already owns this revision.")], request, current);
      }
      if (!active.cancel) {
        active.cancel = { key, expectedRevision: request.expectedRevision };
        active.controller.abort("operator cancel");
      }
      await active.done;
      const latest = await store.get(request.runId);
      const canceledReplay = await store.getReplay(request.runId, key);
      if (latest && canceledReplay) return project(latest, "cancel", canceledReplay.result);
      if (latest && latest.revision !== request.expectedRevision) {
        const code = TERMINAL.has(latest.status) ? "invalid_state" : "stale_revision";
        return failed("cancel", [errorEntry(code, `Run is already ${latest.status} at revision ${latest.revision}.`)], request, latest);
      }
      return failed("cancel", [errorEntry("transition_in_progress", "The active transition ended without this cancel transition.")], request, latest || current);
    }
    if (TERMINAL.has(current.status)) return failed(request.operation, [errorEntry("invalid_state", `Run is already ${current.status}.`)], request, current);
    const transitionId = digest({
      runId: request.runId,
      expectedRevision: request.expectedRevision,
      operation: request.operation,
      idempotencyKey: request.idempotencyKey,
      requestDigest: current.requestDigest,
    });
    const intentExpired = current.inFlight && current.inFlight.deadlineAt <= now();
    if (current.inFlight && !intentExpired && current.inFlight.transitionId !== transitionId) {
      return failed(request.operation, [errorEntry("transition_in_progress", "The current revision is bound to another transition intent.")], request, current);
    }
    const owner = `${request.operation}:${digest(request.idempotencyKey).slice(0, 24)}:${idFactory()}`;
    const claimTtlMs = skillEvolutionTransitionClaimTtl(current, request.operation);
    const claim = await store.claim(request.runId, { expectedRevision: request.expectedRevision, owner, ttlMs: claimTtlMs });
    if (!claim.ok) return failed(request.operation, [errorEntry(claim.code, "Run mutation could not acquire its exact revision claim.")], request, claim.state || current);
    let next = clone(claim.state);
    if (!next.inFlight || intentExpired) {
      next.inFlight = {
        transitionId,
        operation: request.operation,
        idempotencyKeyDigest: key,
        expectedRevision: request.expectedRevision,
        deadlineAt: now() + claimTtlMs,
      };
      try {
        next = await store.checkpoint(request.runId, {
          expectedRevision: request.expectedRevision,
          token: claim.token,
          state: next,
          ttlMs: claimTtlMs,
        });
      } catch {
        await store.release(request.runId, { token: claim.token });
        return failed(request.operation, [errorEntry("lease_lost", publicTransitionMessage("lease_lost"))], request, current);
      }
    }
    let activeTransition = null;
    let executionSignal = signal;
    if (request.operation === "step") {
      let resolveDone;
      activeTransition = {
        controller: new AbortController(),
        key,
        cancel: null,
        done: new Promise((resolve) => { resolveDone = resolve; }),
        resolveDone,
      };
      activeTransitions.set(request.runId, activeTransition);
      executionSignal = signal
        ? AbortSignal.any([signal, activeTransition.controller.signal])
        : activeTransition.controller.signal;
    }
    const finishActive = () => {
      if (!activeTransition) return;
      if (activeTransitions.get(request.runId) === activeTransition) activeTransitions.delete(request.runId);
      activeTransition.resolveDone();
    };
    try {
      next.errors = [];
      if (request.operation === "cancel") {
        next.status = "canceled";
        next.stopReason = "canceled";
      } else {
        const sourceVerification = await verifySkillEvolutionSources(
          adapter,
          next.request,
          next.plan,
          { workingCandidate: next.workingCandidate, champion: next.champion },
          executionSignal,
        );
        if (digest(sourceVerification) !== digest(next.sourceVerification)) {
          throw Object.assign(new Error("The source-bound gate registry or usage envelope drifted."), { code: "source_drift" });
        }
        const unit = skillEvolutionUnitAt(next.plan, next.nextStepIndex);
        if (!unit) throw Object.assign(new Error("Run schedule has no remaining step."), { code: "invalid_state" });
        let callOrdinal = 0;
        const callAdapter = async (method, phase, payload) => {
          const ordinal = callOrdinal++;
          const result = await invokeSkillEvolutionAdapter({ state: next, adapter, method, phase, payload, signal: executionSignal, call: {
            transitionId,
            callId: digest(`${transitionId}\0${unit.stepIndex}\0${ordinal}\0${method}`),
            stepIndex: unit.stepIndex,
            ordinal,
            fence: digest(claim.token),
          } });
          const renewed = await store.claim(request.runId, {
            expectedRevision: request.expectedRevision,
            owner,
            ttlMs: claimTtlMs,
          });
          if (!renewed.ok || renewed.token !== claim.token) {
            throw Object.assign(new Error("Skill-evolution transition lost its state fence."), { code: "lease_lost" });
          }
          return result;
        };
        if (unit.kind === "candidate") {
          const execution = await callAdapter("executeTraining", "training", {
            candidate: clone(next.workingCandidate),
            executor: clone(next.request.executor),
            scenarioRefs: clone(unit.scenarioRefs),
            epochIndex: unit.epochIndex,
            batchIndex: unit.batchIndex,
            miniBatchIndex: unit.miniBatchIndex,
          });
          const evidence = checkedSkillEvolutionEvidence(execution, "Training executor");
          const proposal = await callAdapter("proposeCandidate", "training", {
            candidate: clone(next.workingCandidate),
            candidateAdapter: clone(next.request.candidateAdapter),
            trainingEvidence: evidence,
            mutationBudget: clone(unit.mutationBudget),
            epochIndex: unit.epochIndex,
            batchIndex: unit.batchIndex,
            miniBatchIndex: unit.miniBatchIndex,
          });
          const checked = await verifySkillEvolutionCandidateProposal(proposal, {
            adapter,
            sourceRevision: next.request.sourceRevision,
            signal: executionSignal,
            parent: next.workingCandidate,
            parentNormalizedChars: next.workingCandidateNormalizedChars,
            budget: unit.mutationBudget,
            remaining: remainingSkillEvolutionBudget(next),
          });
          next.cost.mutationOperations += checked.mutationOperations;
          next.cost.changedChars += checked.changedChars;
          next.workingCandidate = checked.candidate;
          next.workingCandidateNormalizedChars = checked.normalizedChars;
          next.promotedCandidate = null;
          next.metrics.workingCandidate = null;
          next.metrics.promotedCandidate = null;
          next.progress = { epoch: unit.epochIndex + 1, batch: unit.batchIndex + 1, miniBatch: unit.miniBatchIndex + 1, candidatesEvaluated: next.progress.candidatesEvaluated + 1 };
        } else {
          const championRollout = await callAdapter("executeValidation", "validation", {
            candidate: clone(next.champion),
            evaluator: clone(next.request.evaluator),
            validationScenarioRefs: clone(unit.scenarioRefs),
            candidateRole: "champion",
            epochIndex: unit.epochIndex,
          });
          const workingRollout = await callAdapter("executeValidation", "validation", {
            candidate: clone(next.workingCandidate),
            evaluator: clone(next.request.evaluator),
            validationScenarioRefs: clone(unit.scenarioRefs),
            candidateRole: "workingCandidate",
            epochIndex: unit.epochIndex,
          });
          const evaluation = await callAdapter("evaluateValidation", "validation", {
            championEvidence: checkedSkillEvolutionEvidence(championRollout, "Champion validation rollout"),
            workingCandidateEvidence: checkedSkillEvolutionEvidence(workingRollout, "Working-candidate validation rollout"),
            evaluator: clone(next.request.evaluator),
            requiredGates: [...unit.requiredGates],
            epochIndex: unit.epochIndex,
          });
          const scores = checkedSkillEvolutionValidation(evaluation, unit.requiredGates, next.sourceVerification.registeredGates);
          if (next.metrics.baseline === null) next.metrics.baseline = scores.champion;
          const promoted = isSkillEvolutionPromotion(next.request.evaluator.metric, next.request.validation, scores, scores.gateResults);
          if (promoted) {
            next.champion = clone(next.workingCandidate);
            next.championNormalizedChars = next.workingCandidateNormalizedChars;
            next.promotedCandidate = clone(next.workingCandidate);
            next.metrics.workingCandidate = scores.candidate;
            next.metrics.champion = scores.candidate;
            next.metrics.promotedCandidate = scores.candidate;
            next.validation.staleEpochs = 0;
          } else {
            next.workingCandidate = clone(next.champion);
            next.workingCandidateNormalizedChars = next.championNormalizedChars;
            next.promotedCandidate = null;
            next.metrics.workingCandidate = scores.champion;
            next.metrics.champion = scores.champion;
            next.metrics.promotedCandidate = null;
            next.validation.staleEpochs += 1;
          }
          next.validation.gateResults = scores.gateResults;
          next.progress.epoch = unit.epochIndex + 1;
        }
        next.nextStepIndex += 1;
        const finished = next.nextStepIndex >= next.plan.totals.steps;
        const plateau = unit.kind === "validation" && next.validation.staleEpochs >= next.request.validation.patience;
        if (finished || plateau) {
          next.stopReason = plateau ? "plateau" : "completed";
          if (next.champion.digest !== next.request.baseline.digest) {
            next.status = "review_pending";
            next.proposal = { status: "review_pending", candidateRef: next.champion.candidateRef, diffRef: next.champion.diffRef, digest: next.champion.digest };
          } else next.status = "stopped";
        } else next.status = "running";
        if (executionSignal?.aborted) {
          throw Object.assign(new Error("Skill-evolution step was canceled by its host."), { code: "canceled" });
        }
      }
    } catch (error) {
      const code = transitionErrorCode(error);
      next.status = code === "canceled" ? "canceled" : "failed";
      next.stopReason = code;
      next.proposal = null;
      next.errors = code === "canceled" ? [] : [errorEntry(code, publicTransitionMessage(code), error?.field || null)];
    }
    let finalFence;
    try {
      finalFence = await store.claim(request.runId, { expectedRevision: request.expectedRevision, owner, ttlMs: claimTtlMs });
    } catch (error) {
      finishActive();
      throw error;
    }
    if (!finalFence.ok || finalFence.token !== claim.token) {
      await store.release(request.runId, { token: claim.token });
      finishActive();
      return failed(request.operation, [errorEntry("lease_lost", publicTransitionMessage("lease_lost"))], request, current);
    }
    if (activeTransition?.cancel) {
      next.status = "canceled";
      next.stopReason = "canceled";
      next.proposal = null;
      next.errors = [];
    }
    next.revision = request.expectedRevision + 1;
    next.updatedAt = now();
    next.inFlight = null;
    const replayRecord = { operation: request.operation, expectedRevision: request.expectedRevision, result: replayCore(next) };
    const cancelReplay = activeTransition?.cancel
      ? [{ key: activeTransition.cancel.key, replay: { operation: "cancel", expectedRevision: activeTransition.cancel.expectedRevision, result: replayCore(next) } }]
      : [];
    let stored;
    try {
      stored = await store.replace(request.runId, {
        expectedRevision: request.expectedRevision,
        token: claim.token,
        state: next,
        replayKey: key,
        replay: replayRecord,
        replayRecords: cancelReplay,
      });
    }
    finally {
      await store.release(request.runId, { token: claim.token });
      finishActive();
    }
    return project(stored, request.operation);
  };

  const run = async (args, context = {}) => {
    const validation = validateSkillEvolutionRequest(args);
    const operation = OPERATIONS.has(args?.operation) ? args.operation : "plan";
    if (!validation.ok) return failed(operation, validation.errors.map((message) => errorEntry("invalid_request", message)), args || {});
    const request = validation.request;
    try {
      if (request.operation === "plan") return await plan(request);
      if (request.operation === "start") return await start(request, context);
      if (request.operation === "status") return await status(request);
      return await mutate(request, context, context.signal);
    } catch (error) {
      return failed(request.operation, [errorEntry(error.code || "runtime_failed", error instanceof Error ? error.message : String(error), error.field || null)], request);
    }
  };
  return Object.freeze({ run, plan, start, status, store });
}

export const isSkillEvolutionToolName = (name) => name === SKILL_EVOLUTION_TOOL_NAME;
export async function runSkillEvolutionTool(args, { runtime, context = {} } = {}) {
  if (!runtime || typeof runtime.run !== "function") throw new TypeError("A skill-evolution runtime is required.");
  return runtime.run(args, context);
}
export const SKILL_EVOLUTION_RUNTIME_REQUEST_SCHEMA = SKILL_EVOLUTION_REQUEST_SCHEMA;
