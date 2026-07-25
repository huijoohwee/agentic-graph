import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createRunningAgentAdapterRegistry } from "../../contracts/agent-model-runtime.js";
import {
  AGENT_TEAM_HARD_BOUNDS,
  AGENT_TEAM_INVOCATION,
  AGENT_TEAM_SOURCE_SCHEMA,
} from "../../contracts/agent-team.schema.js";
import {
  createAgentTeamDelegateSynthesisReceipt,
  createAgentTeamOutputAcceptanceReceipt,
  digestAgentTeamPrivateContext,
} from "../agent-team-adapter.js";
import { createAgentTeamRuntime } from "../agent-team-runtime.js";
import { digestAgentTeamSourceDocument } from "../agent-team-source.js";

export const SOURCE_REVISION = "c".repeat(40);
export const TEAM_URI = "teams/safety.json";

const delegateResponseCore = {
  ok: true,
  branchId: "delegate-research",
  mode: "delegate",
  sourceParticipantId: "lead",
  targetParticipantId: "research",
  conversationOwnerParticipantId: "lead",
  finalAnswerOwnerParticipantId: "lead",
  privateOutput: "PRIVATE INTERMEDIATE",
  output: "Manager synthesis.",
  delegationDepth: 1,
  fanout: 1,
  usage: { inputTokens: 2, outputTokens: 3, costUsd: 0.01, timeMs: 1 },
  evidence: [{ kind: "workflow_receipt", reference: "safe-ref" }],
};
export const delegateResponse = Object.freeze({
  ...delegateResponseCore,
  delegateSynthesis: createAgentTeamDelegateSynthesisReceipt({
    sourceParticipantId: delegateResponseCore.sourceParticipantId,
    privateOutput: delegateResponseCore.privateOutput,
    output: delegateResponseCore.output,
    privateContextDigest: digestAgentTeamPrivateContext([]),
  }),
  outputAcceptance: createAgentTeamOutputAcceptanceReceipt({
    ownerParticipant: {
      participantId: "lead",
      agentId: "agent.lead",
      agentRevision: "agent-revision-1",
    },
    output: delegateResponseCore.output,
  }),
});

export const exactReferenceVerifier = async (document) => {
  let owner = document.manager.participantId;
  const branches = document.workflow.allowedBranchIds.map((branchId) => {
    const mode = branchId.startsWith("handoff-") ? "handoff" : "delegate";
    const target = document.specialists[0].participantId;
    const branch = { branchId, mode, sourceParticipantId: owner, targetParticipantId: target };
    if (mode === "handoff") owner = target;
    return branch;
  });
  return {
    ok: true,
    participants: [document.manager, ...document.specialists].map((participant) => ({
      participantId: participant.participantId,
      agentId: participant.agentId,
      agentRevision: participant.agentRevision,
    })),
    workflow: {
      workflowId: document.workflow.workflowId,
      workflowRevision: document.workflow.workflowRevision,
      branches,
    },
    reviewPolicy: { ...document.reviewPolicy },
  };
};

export const controlAuthorizer = async (authorization) => ({ ok: true, authorization });
export const reviewReceiptVerifier = async (receipt) => ({ ok: true, receipt });

export const createDocsController = () => {
  const state = { revision: SOURCE_REVISION };
  return {
    state,
    resolver: async () => ({
      ok: true,
      sourceRevision: state.revision,
      catalog: [
        { token: AGENT_TEAM_INVOCATION.command, kind: "command", sourcePath: "AGENT-TEAM.md" },
        { token: AGENT_TEAM_INVOCATION.semantic, kind: "semantic", sourcePath: "AGENT-TEAM.md" },
        { token: AGENT_TEAM_INVOCATION.binding, kind: "binding", sourcePath: "AGENT-TEAM.md" },
      ],
    }),
  };
};

export async function createFixture(t, {
  allowedBranchIds = ["delegate-research"],
  bounds = {},
} = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-agent-team-safety-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const team = {
    schema: AGENT_TEAM_SOURCE_SCHEMA,
    teamId: "team.safety",
    teamRevision: "team-revision-1",
    source: { uri: TEAM_URI, digest: "0".repeat(64) },
    manager: {
      participantId: "lead",
      agentId: "agent.lead",
      agentRevision: "agent-revision-1",
      role: "Coordinator",
      goal: "Own the exact synthesis.",
      persona: "Concise.",
    },
    specialists: [{
      participantId: "research",
      agentId: "agent.research",
      agentRevision: "agent-revision-1",
      role: "Researcher",
      goal: "Return private evidence.",
      persona: "Precise.",
    }],
    workflow: {
      workflowId: "workflow.safety",
      workflowRevision: "workflow-revision-1",
      allowedBranchIds,
    },
    reviewPolicy: { policyId: "review.standard", policyRevision: "review-revision-1" },
    bounds: { ...AGENT_TEAM_HARD_BOUNDS, ...bounds },
  };
  team.source.digest = digestAgentTeamSourceDocument(team);
  await fs.mkdir(path.join(rootDir, "teams"), { recursive: true });
  const sourcePath = path.join(rootDir, TEAM_URI);
  await fs.writeFile(sourcePath, `${JSON.stringify(team, null, 2)}\n`);
  const docs = createDocsController();
  const planInput = {
    invocation: {
      command: AGENT_TEAM_INVOCATION.command,
      semantic: AGENT_TEAM_INVOCATION.semantic,
      binding: AGENT_TEAM_INVOCATION.binding,
      sourceRevision: SOURCE_REVISION,
    },
    teamSource: { ...team.source },
    requestedTask: "Return one bounded exact answer.",
    bounds: { ...AGENT_TEAM_HARD_BOUNDS, ...bounds },
    idempotencyKey: "safety-plan-idempotency",
  };
  return { rootDir, team, sourcePath, docs, planInput };
}

export const adapterRecord = ({
  id = "test.safety-adapter",
  revision = "test-v1",
  estimate,
  execute,
}) => ({
  id,
  revision,
  configured: true,
  replaySafe: true,
  estimateZeroSpend: true,
  estimate: estimate || (async () => ({
    inputTokens: 10,
    outputTokens: 10,
    costUsd: 0.1,
    timeMs: 1_000,
  })),
  execute,
});

export function runtimeFor({
  rootDir,
  docsResolver,
  referenceVerifier = exactReferenceVerifier,
  adapter,
  reviewVerifier = reviewReceiptVerifier,
  authorizer = controlAuthorizer,
  ...options
}) {
  return createAgentTeamRuntime({
    rootDir,
    docsResolver,
    referenceVerifier,
    reviewReceiptVerifier: reviewVerifier,
    controlAuthorizer: authorizer,
    ...(adapter ? {
      adapterRegistry: createRunningAgentAdapterRegistry([adapter]),
      defaultAdapterId: adapter.id,
    } : {}),
    ...options,
  });
}

export async function planAndStart(runtime, planInput, startKey = "safety-start-idempotency") {
  const planned = await runtime.plan(planInput);
  const started = await runtime.start({
    planId: planned.result.planId,
    planDigest: planned.planDigest,
    teamRevision: planned.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: startKey,
  });
  return { planned, started };
}
