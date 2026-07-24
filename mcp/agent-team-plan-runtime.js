import {
  AGENT_TEAM_HARD_BOUNDS,
  AGENT_TEAM_INVOCATION,
  AGENT_TEAM_PLAN_SCHEMA,
} from "../contracts/agent-team.schema.js";
import {
  agentTeamReferenceEvidence,
  validateAgentTeamReferenceProjection,
} from "./agent-team-reference.js";
import {
  digestAgentTeamPlan,
  digestAgentTeamValue,
} from "./agent-team-store.js";

const boundedStage = async (callback, timeoutMs, code) => {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new Error("Agent-team no-model resolution timed out."));
      reject(Object.assign(new Error("Agent-team no-model resolution timed out."), { code }));
    }, Math.max(100, Number(timeoutMs) || 100));
  });
  try {
    return await Promise.race([Promise.resolve().then(() => callback(controller.signal)), timeout]);
  } finally {
    clearTimeout(timer);
  }
};

const participantProjection = (participant) => Object.freeze({
  participantId: participant.participantId,
  agentId: participant.agentId,
  agentRevision: participant.agentRevision,
  descriptiveMetadata: Object.freeze({
    role: participant.role,
    goal: participant.goal,
    persona: participant.persona,
  }),
  personaAuthority: false,
});

export const buildAgentTeamPlanCore = ({
  team,
  sourceRevision,
  requestedTask,
  bounds,
  evidence,
  resolvedReferences,
}) => {
  const manager = participantProjection(team.manager);
  const specialists = team.specialists.map(participantProjection);
  return {
    schema: AGENT_TEAM_PLAN_SCHEMA,
    sourceRevision,
    teamId: team.teamId,
    teamRevision: team.teamRevision,
    source: { ...team.source },
    manager,
    specialists,
    participants: [manager, ...specialists],
    workflow: structuredClone(team.workflow),
    reviewPolicy: structuredClone(team.reviewPolicy),
    resolvedReferences: structuredClone(resolvedReferences),
    requestedTask,
    requestedTaskDigest: digestAgentTeamValue(requestedTask),
    bounds,
    owners: {
      initialConversationOwnerParticipantId: manager.participantId,
      initialFinalAnswerOwnerParticipantId: manager.participantId,
      finalOwnershipSource: "agent-orchestration-branch-result",
    },
    personaAuthority: false,
    evidence,
  };
};

export function createAgentTeamPlanResolver({
  resolveInvocation,
  resolveSource,
  referenceVerifier,
}) {
  const resolve = async (invocation, sourceIdentity, timeoutMs) => {
    if (typeof referenceVerifier !== "function") {
      throw Object.assign(new Error("No host-owned exact-reference verifier is configured."), {
        code: "reference_verifier_unavailable",
      });
    }
    const sourceResolutionTimeoutMs = Math.min(
      AGENT_TEAM_HARD_BOUNDS.maxStageTimeMs,
      Math.max(100, Number(timeoutMs) || 100),
    );
    const [invocationEvidence, source] = await boundedStage(
      () => Promise.all([resolveInvocation(invocation), resolveSource(sourceIdentity)]),
      sourceResolutionTimeoutMs,
      "plan_source_resolution_timeout",
    );
    const referenceTimeoutMs = Math.min(
      sourceResolutionTimeoutMs,
      Number(source.document?.bounds?.maxStageTimeMs) || sourceResolutionTimeoutMs,
    );
    let verified;
    try {
      verified = await boundedStage(
        (signal) => referenceVerifier(structuredClone(source.document), { signal }),
        referenceTimeoutMs,
        "reference_verification_timeout",
      );
    } catch (error) {
      if (error?.code?.endsWith("_timeout")) throw error;
      verified = null;
    }
    const resolvedReferences = validateAgentTeamReferenceProjection(source.document, verified);
    const evidence = [
      ...invocationEvidence.entries.map((entry) => ({
        kind: "invocation_token",
        token: entry.token,
        sourceRevision: invocationEvidence.sourceRevision,
        sourcePath: entry.sourcePath,
      })),
      source.evidence,
      ...agentTeamReferenceEvidence(resolvedReferences),
    ];
    return { invocationEvidence, source, resolvedReferences, evidence };
  };

  const revalidate = async (compiled) => {
    const resolved = await resolve({
      command: AGENT_TEAM_INVOCATION.command,
      semantic: AGENT_TEAM_INVOCATION.semantic,
      binding: AGENT_TEAM_INVOCATION.binding,
      sourceRevision: compiled.sourceRevision,
    }, compiled.source, compiled.bounds.maxStageTimeMs);
    const rebuilt = buildAgentTeamPlanCore({
      team: resolved.source.document,
      sourceRevision: resolved.invocationEvidence.sourceRevision,
      requestedTask: compiled.requestedTask,
      bounds: compiled.bounds,
      evidence: resolved.evidence,
      resolvedReferences: resolved.resolvedReferences,
    });
    if (digestAgentTeamPlan(rebuilt) !== compiled.planDigest) {
      throw Object.assign(new Error("The exact agent-team plan changed after source and owner revalidation."), {
        code: "plan_revalidation_failed",
      });
    }
    return resolved;
  };

  return Object.freeze({ resolve, revalidate });
}
