import { digestAgentTeamPrivateContext } from "./agent-team-adapter.js";
import { digestAgentTeamValue } from "./agent-team-store.js";

export function buildAgentTeamBranchAdmission({
  state,
  branchRoute,
  reclaim,
  priorClaim,
}) {
  const privateContext = state.privateMessages
    .filter((message) => message.toParticipantId === state.currentConversationOwnerParticipantId)
    .map((message) => ({
      branchId: message.branchId,
      fromParticipantId: message.fromParticipantId,
      toParticipantId: message.toParticipantId,
      content: message.content,
    }));
  const privateContextDigest = digestAgentTeamPrivateContext(privateContext);
  const privateContextBytes = Buffer.byteLength(JSON.stringify(privateContext), "utf8");
  const inputActiveExecutionMs = reclaim
    ? priorClaim.inputActiveExecutionMs
    : state.activeExecutionMs;
  if (!Number.isSafeInteger(inputActiveExecutionMs) || inputActiveExecutionMs < 0) {
    throw Object.assign(new Error("The durable branch execution claim has invalid time accounting."), {
      code: "invalid_execution_claim",
    });
  }
  const bounds = state.plan.bounds;
  const input = {
    runId: state.runId,
    planId: state.plan.planId,
    planDigest: state.planDigest,
    sourceRevision: state.plan.sourceRevision,
    teamId: state.plan.teamId,
    teamRevision: state.plan.teamRevision,
    participants: structuredClone(state.plan.participants),
    workflow: structuredClone(state.plan.workflow),
    resolvedReferences: structuredClone(state.plan.resolvedReferences),
    reviewPolicy: structuredClone(state.plan.reviewPolicy),
    branchId: branchRoute.branchId,
    branchRoute: structuredClone(branchRoute),
    requestedTask: state.plan.requestedTask,
    currentConversationOwnerParticipantId: state.currentConversationOwnerParticipantId,
    privateContext,
    privateContextDigest,
    privateContextBytes,
    remainingBounds: {
      ...bounds,
      maxTurns: bounds.maxTurns - state.usage.turns - (reclaim ? 0 : 1),
      maxTokens: bounds.maxTokens - state.usage.totalTokens,
      maxCostUsd: bounds.maxCostUsd - state.usage.costUsd,
      maxRunTimeMs: bounds.maxRunTimeMs - inputActiveExecutionMs,
    },
  };
  return Object.freeze({
    input,
    inputDigest: digestAgentTeamValue(input),
    privateContextDigest,
  });
}
