import ownerRegistry from "../data/config/agents/agent-team-workflows.json" with { type: "json" };
import { resolveAgentDefinition } from "../contracts/agent-runtime.schema.js";

export const LOCAL_AGENT_TEAM_OWNER_REGISTRY_SCHEMA = "agenticgraph.agent-team-owner-registry/v1";

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const exactKeys = (value, keys) => (
  isRecord(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key))
);

const validateRegistry = (registry) => {
  if (
    !isRecord(registry)
    || registry.schemaVersion !== LOCAL_AGENT_TEAM_OWNER_REGISTRY_SCHEMA
    || !nonEmpty(registry.registryVersion)
    || !Array.isArray(registry.workflows)
    || !Array.isArray(registry.reviewPolicies)
  ) throw new TypeError("Invalid local Agent Team owner registry.");
  const workflowKeys = new Set();
  for (const workflow of registry.workflows) {
    if (
      !exactKeys(workflow, ["workflowId", "workflowRevision", "branches"])
      || !nonEmpty(workflow.workflowId)
      || !nonEmpty(workflow.workflowRevision)
      || !Array.isArray(workflow.branches)
      || workflow.branches.length < 1
    ) throw new TypeError("Invalid local Agent Team workflow registration.");
    const workflowKey = `${workflow.workflowId}:${workflow.workflowRevision}`;
    if (workflowKeys.has(workflowKey)) throw new TypeError(`Duplicate local Agent Team workflow: ${workflowKey}`);
    workflowKeys.add(workflowKey);
    const branchIds = new Set();
    for (const branch of workflow.branches) {
      if (
        !exactKeys(branch, ["branchId", "mode", "sourceParticipantId", "targetParticipantId"])
        || !nonEmpty(branch.branchId)
        || !["delegate", "handoff"].includes(branch.mode)
        || !nonEmpty(branch.sourceParticipantId)
        || !nonEmpty(branch.targetParticipantId)
        || branch.sourceParticipantId === branch.targetParticipantId
        || branchIds.has(branch.branchId)
      ) throw new TypeError(`Invalid branch in local Agent Team workflow: ${workflowKey}`);
      branchIds.add(branch.branchId);
    }
  }
  const policyKeys = new Set();
  for (const policy of registry.reviewPolicies) {
    if (
      !exactKeys(policy, [
        "policyId", "policyRevision", "mode", "allowedDecisions", "receiptOwner",
      ])
      || !nonEmpty(policy.policyId)
      || !nonEmpty(policy.policyRevision)
      || policy.mode !== "on-request"
      || JSON.stringify(policy.allowedDecisions) !== JSON.stringify(["approve", "revise", "reject"])
      || !nonEmpty(policy.receiptOwner)
    ) throw new TypeError("Invalid local Agent Team review policy registration.");
    const policyKey = `${policy.policyId}:${policy.policyRevision}`;
    if (policyKeys.has(policyKey)) throw new TypeError(`Duplicate local Agent Team review policy: ${policyKey}`);
    policyKeys.add(policyKey);
  }
};

validateRegistry(ownerRegistry);

const workflowByKey = new Map(ownerRegistry.workflows.map((workflow) => [
  `${workflow.workflowId}:${workflow.workflowRevision}`,
  workflow,
]));
const policyByKey = new Map(ownerRegistry.reviewPolicies.map((policy) => [
  `${policy.policyId}:${policy.policyRevision}`,
  policy,
]));

export const LOCAL_AGENT_TEAM_OWNER_REGISTRY = Object.freeze(structuredClone(ownerRegistry));

const fail = (code, message) => {
  throw Object.assign(new Error(message), { code });
};

export async function verifyLocalAgentTeamReferences(document) {
  const sourceParticipants = [document?.manager, ...(document?.specialists || [])];
  const participantIds = new Set();
  const participants = sourceParticipants.map((participant) => {
    const definition = resolveAgentDefinition(participant?.agentId);
    if (
      !definition
      || definition.version !== participant?.agentRevision
      || participantIds.has(participant?.participantId)
    ) fail("agent_definition_revision_unavailable", "An exact registered Agent Definition revision is unavailable.");
    participantIds.add(participant.participantId);
    return {
      participantId: participant.participantId,
      agentId: definition.id,
      agentRevision: definition.version,
    };
  });
  const workflow = workflowByKey.get(
    `${document?.workflow?.workflowId}:${document?.workflow?.workflowRevision}`,
  );
  if (!workflow) fail("agent_workflow_revision_unavailable", "The exact registered Agent Orchestration workflow is unavailable.");
  if (
    JSON.stringify(workflow.branches.map((branch) => branch.branchId))
    !== JSON.stringify(document.workflow.allowedBranchIds)
    || workflow.branches.some((branch) => (
      !participantIds.has(branch.sourceParticipantId)
      || !participantIds.has(branch.targetParticipantId)
    ))
  ) fail("agent_workflow_branch_mismatch", "The requested Agent Orchestration branch set is not registered for this team.");
  const policy = policyByKey.get(
    `${document?.reviewPolicy?.policyId}:${document?.reviewPolicy?.policyRevision}`,
  );
  if (!policy) fail("review_policy_revision_unavailable", "The exact registered Agent Team review policy is unavailable.");
  return {
    ok: true,
    participants,
    workflow: {
      workflowId: workflow.workflowId,
      workflowRevision: workflow.workflowRevision,
      branches: structuredClone(workflow.branches),
    },
    reviewPolicy: {
      policyId: policy.policyId,
      policyRevision: policy.policyRevision,
    },
  };
}
