import crypto from "node:crypto";

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, expected) => (
  isRecord(value)
  && Object.keys(value).length === expected.length
  && expected.every((key) => Object.hasOwn(value, key))
);
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const invalid = () => {
  throw Object.assign(
    new Error("The host reference verifier did not return the exact closed Agent Definition, Agent Orchestration, and review-policy projection."),
    { code: "team_reference_verification_failed" },
  );
};

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

export function validateAgentTeamReferenceProjection(team, verified) {
  if (!exactKeys(verified, ["ok", "participants", "workflow", "reviewPolicy"]) || verified.ok !== true) invalid();
  const sourceParticipants = [team.manager, ...team.specialists];
  if (!Array.isArray(verified.participants) || verified.participants.length !== sourceParticipants.length) invalid();
  const participants = verified.participants.map((candidate, index) => {
    if (!exactKeys(candidate, ["participantId", "agentId", "agentRevision"])) invalid();
    const expected = sourceParticipants[index];
    const projection = {
      participantId: candidate.participantId,
      agentId: candidate.agentId,
      agentRevision: candidate.agentRevision,
    };
    if (!sameJson(projection, {
      participantId: expected.participantId,
      agentId: expected.agentId,
      agentRevision: expected.agentRevision,
    })) invalid();
    return projection;
  });
  const participantIds = new Set(participants.map((participant) => participant.participantId));
  const workflow = verified.workflow;
  if (!exactKeys(workflow, ["workflowId", "workflowRevision", "branches"])) invalid();
  if (
    workflow.workflowId !== team.workflow.workflowId
    || workflow.workflowRevision !== team.workflow.workflowRevision
    || !Array.isArray(workflow.branches)
    || workflow.branches.length !== team.workflow.allowedBranchIds.length
  ) invalid();
  let currentOwnerParticipantId = team.manager.participantId;
  const branches = workflow.branches.map((candidate, index) => {
    if (!exactKeys(candidate, ["branchId", "mode", "sourceParticipantId", "targetParticipantId"])) invalid();
    const branch = {
      branchId: candidate.branchId,
      mode: candidate.mode,
      sourceParticipantId: candidate.sourceParticipantId,
      targetParticipantId: candidate.targetParticipantId,
    };
    if (
      branch.branchId !== team.workflow.allowedBranchIds[index]
      || !["delegate", "handoff"].includes(branch.mode)
      || branch.sourceParticipantId !== currentOwnerParticipantId
      || branch.sourceParticipantId === branch.targetParticipantId
      || !participantIds.has(branch.sourceParticipantId)
      || !participantIds.has(branch.targetParticipantId)
    ) invalid();
    if (branch.mode === "handoff") currentOwnerParticipantId = branch.targetParticipantId;
    return branch;
  });
  const review = verified.reviewPolicy;
  if (
    !exactKeys(review, ["policyId", "policyRevision"])
    || review.policyId !== team.reviewPolicy.policyId
    || review.policyRevision !== team.reviewPolicy.policyRevision
  ) invalid();
  return deepFreeze({
    participants,
    workflow: {
      workflowId: workflow.workflowId,
      workflowRevision: workflow.workflowRevision,
      branches,
    },
    reviewPolicy: {
      policyId: review.policyId,
      policyRevision: review.policyRevision,
    },
  });
}

export const agentTeamReferenceEvidence = (projection) => [{
  kind: "team_reference_projection",
  status: "verified",
  digest: crypto.createHash("sha256").update(JSON.stringify(projection)).digest("hex"),
  participantCount: projection.participants.length,
  workflowId: projection.workflow.workflowId,
  workflowRevision: projection.workflow.workflowRevision,
  branchCount: projection.workflow.branches.length,
  policyId: projection.reviewPolicy.policyId,
  policyRevision: projection.reviewPolicy.policyRevision,
}];
