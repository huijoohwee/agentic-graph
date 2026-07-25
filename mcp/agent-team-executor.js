import crypto from "node:crypto";
import {
  AGENT_TEAM_PRIVATE_OUTPUT_MAX_BYTES,
  validateAgentTeamBranchResult,
  validateAgentTeamBudgetEnvelope,
} from "./agent-team-adapter.js";
import {
  accumulateAgentTeamUsage,
  agentTeamPrivateContextBytes,
  agentTeamUsageWouldExceed,
  unreportedAgentTeamUsage,
} from "./agent-team-accounting.js";
import { buildAgentTeamBranchAdmission } from "./agent-team-admission.js";
import {
  composeAgentTeamStageSignal,
  settleAgentTeamAdapterCall,
} from "./agent-team-stage.js";
import {
  AGENT_TEAM_MAX_CHECKPOINTS,
  digestAgentTeamValue,
} from "./agent-team-store.js";
import {
  foldAgentTeamActiveInterval,
  normalizeAgentTeamTimestamp,
  projectedAgentTeamActiveMs,
  remainingAgentTeamActiveMs,
  saturatingAgentTeamCounterAdd,
} from "./agent-team-time.js";
const STOPPED_STATES = new Set(["paused", "review_pending", "completed", "failed", "blocked", "canceled"]);
const MAX_PRIVATE_CONTEXT_BYTES = 256 * 1024;
const effectIdFor = (runId, planDigest, branchId, attempt) => (
  `ate_${crypto.createHash("sha256").update(`${runId}:${planDigest}:${branchId}:${attempt}`).digest("hex").slice(0, 24)}`
);

const failure = (code, message) => ({ code, message });
async function failRun(store, state, code, message, eventType = "run.failed", {
  reportedUsage,
  atMs,
  minimumActiveMs = 0,
  markUnreported = false,
  forceState,
} = {}) {
  try {
    return await store.update(state.runId, {
      expectedStateVersion: state.stateVersion,
      eventType,
      eventData: { code },
    }, (current) => {
      current.state = forceState
        || (code.includes("unavailable") || code.includes("budget") || code.includes("envelope") ? "blocked" : "failed");
      current.currentBranchId = null;
      current.executionClaim = null;
      if (reportedUsage) current.usage = accumulateAgentTeamUsage(current.usage, reportedUsage);
      if (markUnreported) current.usage = unreportedAgentTeamUsage(current.usage);
      foldAgentTeamActiveInterval(current, atMs, {
        minimumIntervalMs: minimumActiveMs,
        continueActive: false,
      });
      current.error = failure(code, message);
      return current;
    });
  } catch (error) {
    if (error?.code !== "state_version_conflict") throw error;
    return store.read(state.runId);
  }
}

async function beginRunning(store, state, nowMs) {
  if (state.state === "running") return state;
  if (state.state !== "queued") return state;
  const startedAtMs = normalizeAgentTeamTimestamp(nowMs());
  return store.update(state.runId, {
    expectedStateVersion: state.stateVersion,
    eventType: "run.running",
  }, (current) => {
    current.state = "running";
    current.activeSince = startedAtMs;
    current.error = null;
    return current;
  });
}

async function completeRun(store, state, nowMs) {
  if (!state.finalAnswer || !state.finalAnswerOwnerParticipantId) {
    return failRun(
      store,
      state,
      "final_answer_unavailable",
      "The exact final-answer owner did not settle a public answer.",
      "run.failed",
      { atMs: nowMs() },
    );
  }
  const completedAtMs = normalizeAgentTeamTimestamp(nowMs());
  return store.update(state.runId, {
    expectedStateVersion: state.stateVersion,
    eventType: "run.completed",
  }, (current) => {
    current.state = "completed";
    current.currentBranchId = null;
    current.executionClaim = null;
    foldAgentTeamActiveInterval(current, completedAtMs);
    current.error = null;
    return current;
  });
}

async function executeOneBranch({
  store,
  state,
  adapter,
  branchRoute,
  participants,
  outerSignal,
  onController,
  nowMs,
  supervisorId,
  effectLeaseMs,
}) {
  const branchId = branchRoute.branchId;
  const bounds = state.plan.bounds;
  const stop = (code, message, eventType = "run.failed", options = {}) => failRun(
    store,
    state,
    code,
    message,
    eventType,
    {
      atMs: nowMs(),
      ...(reclaim && !options.reportedUsage && !Object.hasOwn(options, "markUnreported")
        ? { markUnreported: true }
        : {}),
      ...options,
    },
  );
  const priorClaim = state.currentBranchId === branchId ? state.executionClaim : null;
  const reclaim = Boolean(priorClaim);
  if (reclaim && Number(priorClaim.leaseExpiresAt || 0) > nowMs()) return state;
  const attempts = Number(state.attemptsByBranchId[branchId] || 0);
  const attempt = reclaim ? Number(priorClaim.attempt) : attempts + 1;
  const effectId = reclaim
    ? String(priorClaim.effectId || "")
    : effectIdFor(state.runId, state.planDigest, branchId, attempt);
  if (!effectId || !Number.isInteger(attempt) || attempt < 1) {
    return stop("invalid_execution_claim", "The durable branch execution claim is invalid.");
  }
  if (!reclaim && attempts > bounds.maxRetriesPerTurn) {
    return stop("branch_retries_exhausted", `Branch ${branchId} exhausted its bounded retries.`);
  }
  const remainingBeforeEstimateMs = remainingAgentTeamActiveMs(state, nowMs(), bounds.maxRunTimeMs);
  if (remainingBeforeEstimateMs < 1) {
    return stop(
      "run_time_budget_exhausted",
      "The durable active run-time bound is exhausted before another adapter stage.",
      "run.blocked",
      { forceState: "blocked" },
    );
  }
  const remainingBranches = state.plan.workflow.allowedBranchIds.filter(
    (candidate) => !state.completedBranchIds.includes(candidate),
  ).length;
  const requiredCheckpoints = (remainingBranches * 2) + 1 + (state.startReceipt?.snapshot ? 0 : 1);
  if (state.stateVersion + requiredCheckpoints > AGENT_TEAM_MAX_CHECKPOINTS) {
    if (state.stateVersion >= AGENT_TEAM_MAX_CHECKPOINTS) return state;
    return stop(
      "checkpoint_budget_insufficient",
      "The run cannot reserve enough durable checkpoints before the next adapter effect.",
      "run.blocked",
      { forceState: "blocked" },
    );
  }
  let admission;
  try {
    admission = buildAgentTeamBranchAdmission({ state, branchRoute, reclaim, priorClaim });
  } catch (error) {
    return stop(error.code || "invalid_execution_claim", error.message || "Branch admission is invalid.");
  }
  const {
    input: branchInput,
    inputDigest: branchInputDigest,
    privateContextDigest,
  } = admission;
  let estimate;
  let estimateElapsedMs = 0;
  if (reclaim) {
    if (priorClaim.inputDigest !== branchInputDigest) {
      return stop(
        "execution_input_fence_mismatch",
        "The reclaimed effect input no longer matches its durable admission digest.",
        "run.blocked",
        { forceState: "blocked" },
      );
    }
    try {
      estimate = validateAgentTeamBudgetEnvelope(priorClaim.admittedEnvelope);
    } catch {
      return stop(
        "execution_envelope_fence_mismatch",
        "The reclaimed effect has no valid durable admitted envelope.",
        "run.blocked",
        { forceState: "blocked" },
      );
    }
  } else {
    const estimateStartedAt = normalizeAgentTeamTimestamp(nowMs());
    const estimateStage = composeAgentTeamStageSignal(
      outerSignal,
      Math.min(bounds.maxStageTimeMs, remainingBeforeEstimateMs),
    );
    onController?.(estimateStage);
    try {
      const outcome = await settleAgentTeamAdapterCall(() => adapter.estimate({
        effectId,
        input: structuredClone(branchInput),
        inputDigest: branchInputDigest,
        signal: estimateStage.signal,
      }), estimateStage.signal);
      if (outcome.kind !== "value") {
        throw Object.assign(new Error("The adapter estimate did not settle within the bounded stage."), {
          code: "adapter_budget_envelope_unavailable",
        });
      }
      estimate = validateAgentTeamBudgetEnvelope(outcome.value);
    } catch {
      estimateElapsedMs = normalizeAgentTeamTimestamp(Math.max(0, nowMs() - estimateStartedAt));
      return stop(
        "adapter_budget_envelope_unavailable",
        "The zero-spend adapter estimate did not return a valid bounded envelope.",
        "run.failed",
        { minimumActiveMs: estimateElapsedMs },
      );
    } finally {
      estimateStage.dispose();
      onController?.(null);
    }
    estimateElapsedMs = normalizeAgentTeamTimestamp(Math.max(0, nowMs() - estimateStartedAt));
  }
  const preflightAtMs = normalizeAgentTeamTimestamp(nowMs());
  if (
    estimate.timeMs > bounds.maxStageTimeMs
    || projectedAgentTeamActiveMs(state, preflightAtMs, estimateElapsedMs) + estimate.timeMs > bounds.maxRunTimeMs
    || state.usage.turns >= bounds.maxTurns
    || agentTeamUsageWouldExceed(state.usage, estimate, bounds)
  ) {
    return stop(
      "budget_preflight_blocked",
      "The next exact branch cannot begin within the remaining run bounds.",
      "run.failed",
      { minimumActiveMs: estimateElapsedMs },
    );
  }
  const remainingForExecutionMs = remainingAgentTeamActiveMs(
    state,
    preflightAtMs,
    bounds.maxRunTimeMs,
  );
  const composed = composeAgentTeamStageSignal(
    outerSignal,
    Math.min(bounds.maxStageTimeMs, estimate.timeMs, remainingForExecutionMs),
  );
  onController?.(composed);
  try {
    if (composed.signal.aborted) {
      composed.dispose();
      onController?.(null);
      return store.read(state.runId);
    }
    try {
      state = await store.update(state.runId, {
        expectedStateVersion: state.stateVersion,
        eventType: reclaim ? "branch.reclaimed" : "branch.started",
        eventData: {
          branchId,
          attempt,
          effectId,
          inputDigest: branchInputDigest,
          admittedEnvelopeDigest: digestAgentTeamValue(estimate),
        },
      }, (current) => {
        const claimedAtMs = normalizeAgentTeamTimestamp(nowMs());
        const accountedEstimateMs = foldAgentTeamActiveInterval(current, claimedAtMs, {
          minimumIntervalMs: reclaim ? 0 : estimateElapsedMs,
          continueActive: true,
        });
        current.currentBranchId = branchId;
        current.executionClaim = {
          effectId,
          ownerId: supervisorId,
          leaseExpiresAt: saturatingAgentTeamCounterAdd(
            claimedAtMs,
            Math.max(effectLeaseMs, bounds.maxStageTimeMs + 5_000),
          ),
          branchId,
          attempt,
          inputDigest: branchInputDigest,
          admittedEnvelope: structuredClone(estimate),
          estimateElapsedMs: reclaim ? priorClaim.estimateElapsedMs : accountedEstimateMs,
          inputActiveExecutionMs: reclaim
            ? priorClaim.inputActiveExecutionMs
            : state.activeExecutionMs,
        };
        if (!reclaim) {
          current.attemptsByBranchId[branchId] = attempt;
          current.usage.turns += 1;
        }
        return current;
      });
    } catch (error) {
      if (error?.code !== "state_version_conflict") throw error;
      composed.dispose();
      onController?.(null);
      return store.read(state.runId);
    }
    if (composed.signal.aborted) {
      const latest = await store.read(state.runId);
      composed.dispose();
      onController?.(null);
      if (latest.stateVersion !== state.stateVersion || latest.state !== "running") return latest;
      return stop("stage_admission_timeout", "The branch stage expired before adapter invocation.");
    }
    const latestAdmission = await store.read(state.runId);
    if (latestAdmission.stateVersion !== state.stateVersion || latestAdmission.state !== "running") {
      composed.dispose();
      onController?.(null);
      return latestAdmission;
    }
  } catch (error) {
    composed.dispose();
    onController?.(null);
    throw error;
  }
  const startedAt = normalizeAgentTeamTimestamp(nowMs());
  let raw;
  try {
    const outcome = await settleAgentTeamAdapterCall(() => adapter.execute({
      effectId,
      input: structuredClone(branchInput),
      inputDigest: branchInputDigest,
      signal: composed.signal,
    }), composed.signal);
    if (outcome.kind === "value") {
      try {
        raw = structuredClone(outcome.value);
      } catch {
        raw = {
          ok: false,
          error: {
            code: "invalid_branch_receipt",
            message: "Agent Orchestration returned a non-cloneable branch receipt.",
          },
        };
      }
    }
    else if (outcome.kind === "error") {
      raw = { ok: false, error: { code: "branch_execution_failed", message: "Agent Orchestration execution failed without a public receipt." } };
    } else {
      raw = {
        ok: false,
        error: {
          code: outerSignal?.aborted ? "branch_interrupted" : "branch_settlement_timeout",
          message: outerSignal?.aborted
            ? "Agent-team execution was interrupted."
            : "Agent Orchestration did not settle before the bounded stage deadline.",
        },
      };
    }
  } finally {
    composed.dispose();
    onController?.(null);
  }
  const elapsed = normalizeAgentTeamTimestamp(Math.max(0, nowMs() - startedAt));
  const latest = await store.read(state.runId);
  if (latest.stateVersion !== state.stateVersion || latest.state !== "running") return latest;
  let reportedUsage;
  try {
    reportedUsage = validateAgentTeamBudgetEnvelope(raw?.usage);
  } catch {
    reportedUsage = null;
  }
  let result;
  try {
    result = validateAgentTeamBranchResult(raw, {
      branchRoute,
      participants,
      currentOwnerParticipantId: state.currentConversationOwnerParticipantId,
      privateContextDigest,
    });
  } catch (error) {
    const accountedElapsedMs = reportedUsage
      ? Math.max(elapsed, reportedUsage.timeMs)
      : elapsed;
    return stop(
      reportedUsage ? (error?.code || "branch_execution_failed") : "branch_usage_unreported",
      reportedUsage
        ? (error?.message || "Branch execution failed.")
        : "The adapter effect did not provide a validated usage receipt; additional spend is blocked.",
      "branch.failed",
      {
        reportedUsage,
        minimumActiveMs: accountedElapsedMs,
        markUnreported: !reportedUsage,
        forceState: reportedUsage ? "failed" : "blocked",
      },
    );
  }
  const settledTimeMs = Math.max(elapsed, result.usage.timeMs);
  if (
    result.privateOutput !== undefined
    && (
      Buffer.byteLength(result.privateOutput, "utf8") > AGENT_TEAM_PRIVATE_OUTPUT_MAX_BYTES
      || agentTeamPrivateContextBytes(state.privateMessages) + Buffer.byteLength(result.privateOutput, "utf8") > MAX_PRIVATE_CONTEXT_BYTES
    )
  ) {
    return stop("private_context_bound_exceeded", "Private specialist output exceeded the bounded durable context.", "branch.failed", {
      reportedUsage: result.usage,
      minimumActiveMs: settledTimeMs,
      forceState: "blocked",
    });
  }
  if (
    result.usage.inputTokens > estimate.inputTokens
    || result.usage.outputTokens > estimate.outputTokens
    || result.usage.costUsd > estimate.costUsd
    || settledTimeMs > estimate.timeMs
    || result.delegationDepth > bounds.maxDelegationDepth
    || result.fanout > bounds.maxFanout
    || agentTeamUsageWouldExceed(state.usage, result.usage, bounds)
    || projectedAgentTeamActiveMs(state, nowMs(), settledTimeMs) > bounds.maxRunTimeMs
  ) {
    return stop("adapter_envelope_exceeded", "The branch exceeded its source-fenced budget or delegation envelope.", "branch.failed", {
      reportedUsage: result.usage,
      minimumActiveMs: settledTimeMs,
      forceState: "blocked",
    });
  }
  const settlementReceipt = {
    effectId,
    attempt,
    adapterId: state.adapterId,
    adapterRevision: state.adapterRevision,
    branchId,
    inputDigest: branchInputDigest,
    admittedEnvelope: estimate,
    mode: result.mode,
    sourceParticipantId: result.sourceParticipantId,
    targetParticipantId: result.targetParticipantId,
    conversationOwnerParticipantId: result.conversationOwnerParticipantId,
    finalAnswerOwnerParticipantId: result.finalAnswerOwnerParticipantId,
    usage: result.usage,
    outputDigest: crypto.createHash("sha256").update(result.output).digest("hex"),
    delegateSynthesis: result.delegateSynthesis || null,
    outputAcceptance: result.outputAcceptance,
  };
  const settlementReceiptDigest = crypto.createHash("sha256")
    .update(JSON.stringify(settlementReceipt))
    .digest("hex");
  const settledAtMs = normalizeAgentTeamTimestamp(nowMs());
  return store.update(state.runId, {
    expectedStateVersion: state.stateVersion,
    eventType: result.requiresReview ? "branch.review_pending" : "branch.completed",
    eventData: {
      branchId,
      mode: result.mode,
      effectId,
      attempt,
      adapterId: state.adapterId,
      adapterRevision: state.adapterRevision,
      settlementReceiptDigest,
      inputDigest: branchInputDigest,
      admittedEnvelopeDigest: digestAgentTeamValue(estimate),
    },
  }, (current) => {
    foldAgentTeamActiveInterval(current, settledAtMs, {
      minimumIntervalMs: settledTimeMs,
      continueActive: !result.requiresReview,
    });
    current.currentBranchId = null;
    current.executionClaim = null;
    current.completedBranchIds.push(branchId);
    current.usage = accumulateAgentTeamUsage(current.usage, result.usage);
    current.currentConversationOwnerParticipantId = result.conversationOwnerParticipantId;
    current.finalAnswerOwnerParticipantId = result.finalAnswerOwnerParticipantId;
    current.finalAnswer = result.output;
    current.lastSettlement = {
      branchId,
      mode: result.mode,
      sourceParticipantId: result.sourceParticipantId,
      targetParticipantId: result.targetParticipantId,
      delegationDepth: result.delegationDepth,
      fanout: result.fanout,
      effectId,
      attempt,
      adapterId: current.adapterId,
      adapterRevision: current.adapterRevision,
      settlementReceiptDigest,
      inputDigest: branchInputDigest,
      admittedEnvelope: structuredClone(estimate),
      synthesisReceiptDigest: result.delegateSynthesis
        ? crypto.createHash("sha256").update(JSON.stringify(result.delegateSynthesis)).digest("hex")
        : null,
      outputAcceptanceReceiptDigest: crypto.createHash("sha256")
        .update(JSON.stringify(result.outputAcceptance))
        .digest("hex"),
      usage: structuredClone(result.usage),
    };
    current.maxDelegationDepthObserved = Math.max(current.maxDelegationDepthObserved || 0, result.delegationDepth);
    current.maxFanoutObserved = Math.max(current.maxFanoutObserved || 0, result.fanout);
    current.publicEvidence = [...(current.publicEvidence || []), ...result.evidence].slice(-32);
    if (result.privateOutput !== undefined) {
      current.privateMessages = [...current.privateMessages, {
        branchId,
        fromParticipantId: result.targetParticipantId,
        toParticipantId: result.sourceParticipantId,
        content: result.privateOutput,
      }].slice(-24);
    }
    if (result.requiresReview) {
      current.state = "review_pending";
      current.review = {
        status: "pending",
        policyId: current.plan.reviewPolicy.policyId,
        policyRevision: current.plan.reviewPolicy.policyRevision,
        question: `Review the exact sanitized settlement for branch ${branchId}.`,
        allowedDecisions: ["approve", "revise", "reject"],
        evidenceReferences: [
          { kind: "plan_digest", digest: current.planDigest },
          { kind: "branch", branchId },
        ],
        receiptId: null,
        decision: null,
        verificationDigest: null,
      };
    }
    current.error = null;
    return current;
  });
}

export async function executeAgentTeamRun({
  store,
  runId,
  adapter,
  signal,
  nowMs = () => Date.now(),
  onController,
  supervisorId,
  effectLeaseMs = 65_000,
}) {
  let state = await store.read(runId);
  if (STOPPED_STATES.has(state.state)) return state;
  state = await beginRunning(store, state, nowMs);
  const participants = [state.plan.manager, ...state.plan.specialists];
  while (state.state === "running") {
    if (signal?.aborted) {
      return failRun(
        store,
        state,
        "execution_interrupted",
        "Agent-team execution was interrupted.",
        "run.failed",
        {
          atMs: nowMs(),
          markUnreported: Boolean(state.executionClaim),
        },
      );
    }
    const branchId = state.plan.workflow.allowedBranchIds.find((candidate) => !state.completedBranchIds.includes(candidate));
    if (!branchId) return completeRun(store, state, nowMs);
    const branchRoute = state.plan.resolvedReferences.workflow.branches.find((candidate) => candidate.branchId === branchId);
    if (!branchRoute) {
      return failRun(
        store,
        state,
        "resolved_branch_unavailable",
        "The exact resolved Agent Orchestration branch is unavailable.",
        "run.failed",
        {
          atMs: nowMs(),
          markUnreported: Boolean(state.executionClaim),
        },
      );
    }
    const previousVersion = state.stateVersion;
    state = await executeOneBranch({
      store,
      state,
      adapter,
      branchRoute,
      participants,
      outerSignal: signal,
      onController,
      nowMs,
      supervisorId,
      effectLeaseMs,
    });
    if (state.state === "running" && state.stateVersion === previousVersion) return state;
  }
  return state;
}
