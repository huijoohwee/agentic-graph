import { AGENT_TEAM_RESULT_SCHEMA } from "../contracts/agent-team.schema.js";

export const ZERO_AGENT_TEAM_USAGE = Object.freeze({
  turns: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  costStatus: "reported",
});

const clipped = (value, maximum = 500) => {
  const normalized = String(value || "");
  return normalized.length > maximum ? `${normalized.slice(0, Math.max(0, maximum - 1))}…` : normalized;
};

const base = (operation, fields = {}) => ({
  schema: AGENT_TEAM_RESULT_SCHEMA,
  ok: true,
  operation,
  teamId: fields.teamId ?? null,
  teamRevision: fields.teamRevision ?? null,
  runId: fields.runId ?? null,
  state: fields.state ?? null,
  stateVersion: Number.isInteger(fields.stateVersion) ? fields.stateVersion : null,
  planDigest: fields.planDigest ?? null,
  evidence: Array.isArray(fields.evidence) ? fields.evidence.slice(0, 64) : [],
  usage: fields.usage || ZERO_AGENT_TEAM_USAGE,
});

export function agentTeamError(operation, error, fields = {}) {
  const requestedCode = String(error?.code || "");
  const publicCode = /^[a-z][a-z0-9_]{0,119}$/.test(requestedCode)
    ? requestedCode
    : "agent_team_runtime_error";
  return {
    ...base(operation, fields),
    ok: false,
    error: {
      code: publicCode,
      message: `Agent-team ${operation} failed safely. Inspect the typed error code and trusted details.`,
      ...(error?.trustedDetails === true && Array.isArray(error?.details) ? {
        details: error.details.slice(0, 64).map((entry) => ({
          path: clipped(entry?.path, 4_096),
          reason: clipped(entry?.reason, 2_000),
        })),
      } : {}),
    },
  };
}

export const publicAgentTeamPlan = (plan) => ({
  ...base("plan", {
    teamId: plan.teamId,
    teamRevision: plan.teamRevision,
    state: "planned",
    stateVersion: 1,
    planDigest: plan.planDigest,
    evidence: plan.evidence,
  }),
  result: {
    planId: plan.planId,
    planDigest: plan.planDigest,
    state: "planned",
    stateVersion: 1,
    sourceRevision: plan.sourceRevision,
    source: plan.source,
    participants: plan.participants.map((participant) => ({
      participantId: participant.participantId,
      agentId: participant.agentId,
      agentRevision: participant.agentRevision,
      role: participant.descriptiveMetadata.role,
      personaAuthority: false,
    })),
    workflow: plan.workflow,
    reviewPolicy: plan.reviewPolicy,
    resolvedReferences: plan.resolvedReferences,
    owners: plan.owners,
    effectiveBounds: plan.bounds,
    requestedTaskDigest: plan.requestedTaskDigest,
  },
});

export const publicAgentTeamRunSummary = (state, { includeFinalAnswer = false } = {}) => ({
  runId: state.runId,
  teamId: state.plan.teamId,
  teamRevision: state.plan.teamRevision,
  state: state.state,
  stateVersion: state.stateVersion,
  checkpointId: state.checkpointId,
  planDigest: state.planDigest,
  currentBranchId: state.currentBranchId,
  currentConversationOwnerParticipantId: state.currentConversationOwnerParticipantId,
  finalAnswerOwnerParticipantId: state.finalAnswerOwnerParticipantId,
  completedBranchCount: state.completedBranchIds.length,
  totalBranchCount: state.plan.workflow.allowedBranchIds.length,
  lastSettlement: state.lastSettlement,
  maxDelegationDepthObserved: state.maxDelegationDepthObserved,
  maxFanoutObserved: state.maxFanoutObserved,
  usage: state.usage,
  review: state.review,
  updatedAt: state.updatedAt,
  error: state.error ? { code: clipped(state.error.code, 120), message: clipped(state.error.message, 500) } : null,
  ...(includeFinalAnswer && state.state === "completed" ? { finalAnswer: state.finalAnswer } : {}),
});

export function publicAgentTeamRun(state, operation = "start", extraEvidence = []) {
  const evidence = [
    ...state.plan.evidence,
    ...(state.publicEvidence || []),
    ...state.trace.map((entry) => ({
      kind: "transition",
      sequence: entry.sequence,
      type: entry.type,
      at: entry.at,
      branchId: entry.branchId,
      participantId: entry.participantId,
    })),
    ...extraEvidence,
  ].slice(-64);
  const ok = !["failed", "blocked"].includes(state.state);
  return {
    ...base(operation, {
      teamId: state.plan.teamId,
      teamRevision: state.plan.teamRevision,
      runId: state.runId,
      state: state.state,
      stateVersion: state.stateVersion,
      planDigest: state.planDigest,
      evidence,
      usage: state.usage,
    }),
    ok,
    result: {
      checkpointId: state.checkpointId,
      transitionSequence: state.transitionSequence,
      currentBranchId: state.currentBranchId,
      currentConversationOwnerParticipantId: state.currentConversationOwnerParticipantId,
      finalAnswerOwnerParticipantId: state.finalAnswerOwnerParticipantId,
      completedBranchIds: [...state.completedBranchIds],
      lastSettlement: state.lastSettlement,
      maxDelegationDepthObserved: state.maxDelegationDepthObserved,
      maxFanoutObserved: state.maxFanoutObserved,
      review: state.review,
      ...(state.state === "completed"
        ? {
            finalAnswer: state.finalAnswer,
            finalAnswerOwnerParticipantId: state.finalAnswerOwnerParticipantId,
          }
        : {}),
    },
    ...(state.error ? { error: { code: state.error.code, message: clipped(state.error.message, 2_000) } } : {}),
  };
}

export const snapshotAgentTeamRun = (state, overrides = {}) => ({
  state: state.state,
  stateVersion: overrides.stateVersion ?? state.stateVersion,
  checkpointId: overrides.checkpointId ?? state.checkpointId,
  transitionSequence: overrides.transitionSequence ?? state.transitionSequence,
  currentBranchId: state.currentBranchId,
  currentConversationOwnerParticipantId: state.currentConversationOwnerParticipantId,
  finalAnswerOwnerParticipantId: state.finalAnswerOwnerParticipantId,
  completedBranchIds: [...state.completedBranchIds],
  lastSettlement: state.lastSettlement,
  maxDelegationDepthObserved: state.maxDelegationDepthObserved,
  maxFanoutObserved: state.maxFanoutObserved,
  review: structuredClone(state.review),
  usage: structuredClone(state.usage),
  finalAnswer: state.state === "completed" ? state.finalAnswer : null,
  error: state.error ? {
    code: clipped(state.error.code, 120),
    message: clipped(state.error.message, 2_000),
  } : null,
});

export function publicAgentTeamStartSnapshot(state, snapshot) {
  const ok = !["failed", "blocked"].includes(snapshot.state);
  return {
    ...base("start", {
      teamId: state.plan.teamId,
      teamRevision: state.plan.teamRevision,
      runId: state.runId,
      state: snapshot.state,
      stateVersion: snapshot.stateVersion,
      planDigest: state.planDigest,
      evidence: [
        ...state.plan.evidence,
        { kind: "start_receipt", resultStateVersion: snapshot.stateVersion },
      ].slice(-64),
      usage: snapshot.usage,
    }),
    ok,
    result: {
      checkpointId: snapshot.checkpointId,
      transitionSequence: snapshot.transitionSequence,
      currentBranchId: snapshot.currentBranchId,
      currentConversationOwnerParticipantId: snapshot.currentConversationOwnerParticipantId,
      finalAnswerOwnerParticipantId: snapshot.finalAnswerOwnerParticipantId,
      completedBranchIds: [...snapshot.completedBranchIds],
      lastSettlement: snapshot.lastSettlement,
      maxDelegationDepthObserved: snapshot.maxDelegationDepthObserved,
      maxFanoutObserved: snapshot.maxFanoutObserved,
      review: structuredClone(snapshot.review),
      ...(snapshot.state === "completed" ? { finalAnswer: snapshot.finalAnswer } : {}),
    },
    ...(snapshot.error ? { error: structuredClone(snapshot.error) } : {}),
  };
}

export function publicAgentTeamControlSnapshot(state, snapshot) {
  const evidence = [
    ...state.plan.evidence,
    {
      kind: "control_receipt",
      action: snapshot.action,
      resultStateVersion: snapshot.stateVersion,
      authorizationDigest: snapshot.authorizationDigest,
    },
  ].slice(-64);
  const ok = !["failed", "blocked"].includes(snapshot.state);
  return {
    ...base("control", {
      teamId: state.plan.teamId,
      teamRevision: state.plan.teamRevision,
      runId: state.runId,
      state: snapshot.state,
      stateVersion: snapshot.stateVersion,
      planDigest: state.planDigest,
      evidence,
      usage: snapshot.usage,
    }),
    ok,
    result: {
      checkpointId: snapshot.checkpointId,
      transitionSequence: snapshot.transitionSequence,
      currentBranchId: snapshot.currentBranchId,
      currentConversationOwnerParticipantId: snapshot.currentConversationOwnerParticipantId,
      finalAnswerOwnerParticipantId: snapshot.finalAnswerOwnerParticipantId,
      completedBranchIds: [...snapshot.completedBranchIds],
      review: structuredClone(snapshot.review),
    },
    ...(snapshot.error ? { error: structuredClone(snapshot.error) } : {}),
  };
}

export function publicAgentTeamList(states, { includeCompletedResult = false } = {}) {
  const runs = states.map((state) => publicAgentTeamRunSummary(state, {
    includeFinalAnswer: includeCompletedResult,
  }));
  const exact = includeCompletedResult && runs.length === 1;
  return {
    ...base("list", {
      teamId: exact ? runs[0].teamId : null,
      teamRevision: exact ? runs[0].teamRevision : null,
      runId: exact ? runs[0].runId : null,
      state: exact ? runs[0].state : null,
      stateVersion: exact ? runs[0].stateVersion : null,
      planDigest: exact ? runs[0].planDigest : null,
      usage: exact ? runs[0].usage : ZERO_AGENT_TEAM_USAGE,
    }),
    result: { runs },
  };
}
