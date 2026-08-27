import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import teamSource from "../../data/config/agents/agent-teams/collaborative-intelligence.json" with { type: "json" };
import { createLocalAgentTeamHost } from "../agent-team-local-host.js";
import { LocalAgentTeamEffectStore } from "../agent-team-local-effect-store.js";
import { createLocalAgentTeamModelAdapter } from "../agent-team-local-model-adapter.js";
import { verifyLocalAgentTeamReferences } from "../agent-team-local-owner-registry.js";
import { LocalAgentTeamReviewStore } from "../agent-team-local-review-store.js";
import { digestAgentTeamPrivateContext } from "../agent-team-adapter.js";
import { digestAgentTeamSourceDocument } from "../agent-team-source.js";

const tempRoot = async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-agent-team-host-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  return rootDir;
};

const branchInput = () => {
  const participants = [teamSource.manager, ...teamSource.specialists].map((participant) => ({
    participantId: participant.participantId,
    agentId: participant.agentId,
    agentRevision: participant.agentRevision,
    descriptiveMetadata: {
      role: participant.role,
      goal: participant.goal,
      persona: participant.persona,
    },
    personaAuthority: false,
  }));
  const branchRoute = {
    branchId: "delegate-investment-research",
    mode: "delegate",
    sourceParticipantId: "manager",
    targetParticipantId: "investment-research",
  };
  return {
    runId: "atr_111111111111111111111111",
    planId: "atp_222222222222222222222222",
    planDigest: "3".repeat(64),
    sourceRevision: "4".repeat(40),
    teamId: teamSource.teamId,
    teamRevision: teamSource.teamRevision,
    participants,
    workflow: structuredClone(teamSource.workflow),
    resolvedReferences: {
      participants: participants.map(({ participantId, agentId, agentRevision }) => ({
        participantId,
        agentId,
        agentRevision,
      })),
      workflow: {
        workflowId: teamSource.workflow.workflowId,
        workflowRevision: teamSource.workflow.workflowRevision,
        branches: [branchRoute],
      },
      reviewPolicy: structuredClone(teamSource.reviewPolicy),
    },
    reviewPolicy: structuredClone(teamSource.reviewPolicy),
    branchId: branchRoute.branchId,
    branchRoute,
    requestedTask: "Assess a bounded collaboration decision.",
    currentConversationOwnerParticipantId: "manager",
    privateContext: [],
    privateContextDigest: digestAgentTeamPrivateContext([]),
    privateContextBytes: 2,
    remainingBounds: structuredClone(teamSource.bounds),
  };
};

test("local owner registry verifies exact agent, workflow, branch, and review revisions", async () => {
  assert.equal(digestAgentTeamSourceDocument(teamSource), teamSource.source.digest);
  const verified = await verifyLocalAgentTeamReferences(teamSource);
  assert.equal(verified.ok, true);
  assert.deepEqual(
    verified.participants.map((participant) => participant.agentRevision),
    ["1.0.0", "1.0.0", "1.0.0"],
  );
  assert.deepEqual(
    verified.workflow.branches.map((branch) => branch.branchId),
    teamSource.workflow.allowedBranchIds,
  );
  await assert.rejects(
    () => verifyLocalAgentTeamReferences({
      ...structuredClone(teamSource),
      manager: { ...teamSource.manager, agentRevision: "drifted" },
    }),
    { code: "agent_definition_revision_unavailable" },
  );
});

test("local model adapter executes delegate plus source synthesis once and replays the durable receipt", async (t) => {
  const rootDir = await tempRoot(t);
  const requests = [];
  const adapter = createLocalAgentTeamModelAdapter({
    rootDir,
    env: {
      AGENTICGRAPH_AGENT_TEAM_MODEL: "local-test",
      AGENTICGRAPH_AGENT_TEAM_MODEL_URL: "http://127.0.0.1:11434",
      AGENTICGRAPH_AGENT_TEAM_MODEL_TIMEOUT_MS: "5000",
      AGENTICGRAPH_AGENT_TEAM_MODEL_MAX_OUTPUT_TOKENS: "256",
    },
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return {
        ok: true,
        async json() {
          return {
            model: "local-test",
            message: {
              content: JSON.stringify({
                output: requests.length === 1 ? "Private specialist evidence." : "Manager synthesis.",
              }),
            },
            prompt_eval_count: 12,
            eval_count: 6,
          };
        },
      };
    },
  });
  const input = branchInput();
  const effectId = "ate_555555555555555555555555";
  const inputDigest = "6".repeat(64);
  const estimate = await adapter.estimate({ input });
  assert.equal(estimate.costUsd, 0);
  assert.equal(estimate.outputTokens, 512);
  const first = await adapter.execute({ effectId, input, inputDigest });
  assert.equal(first.privateOutput, "Private specialist evidence.");
  assert.equal(first.output, "Manager synthesis.");
  assert.equal(first.finalAnswerOwnerParticipantId, "manager");
  assert.equal(first.usage.costUsd, 0);
  assert.equal(requests.length, 2);
  const replay = await adapter.execute({ effectId, input, inputDigest });
  assert.deepEqual(replay, first);
  assert.equal(requests.length, 2);
});

test("a prior unsettled local effect blocks replay without a second model call", async (t) => {
  const rootDir = await tempRoot(t);
  const effectStore = new LocalAgentTeamEffectStore({ rootDir });
  const effectId = "ate_777777777777777777777777";
  const inputDigest = "8".repeat(64);
  await effectStore.begin(effectId, inputDigest);
  let calls = 0;
  const adapter = createLocalAgentTeamModelAdapter({
    rootDir,
    effectStore,
    env: { AGENTICGRAPH_AGENT_TEAM_MODEL: "local-test" },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not call");
    },
  });
  await assert.rejects(
    () => adapter.execute({ effectId, input: branchInput(), inputDigest }),
    { code: "local_model_effect_unsettled" },
  );
  assert.equal(calls, 0);
});

test("local model output rejects properties outside the closed output contract", async (t) => {
  const rootDir = await tempRoot(t);
  const adapter = createLocalAgentTeamModelAdapter({
    rootDir,
    env: { AGENTICGRAPH_AGENT_TEAM_MODEL: "local-test" },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          message: { content: JSON.stringify({ output: "Result.", extra: "not admitted" }) },
        };
      },
    }),
  });
  await assert.rejects(
    () => adapter.execute({
      effectId: "ate_999999999999999999999999",
      input: branchInput(),
      inputDigest: "a".repeat(64),
    }),
    { code: "invalid_local_model_output" },
  );
});

test("local review receipts bind one exact pending checkpoint and expire closed", async (t) => {
  const rootDir = await tempRoot(t);
  let now = 1_000_000;
  const store = new LocalAgentTeamReviewStore({ rootDir, nowMs: () => now });
  const expected = {
    runId: "atr_111111111111111111111111",
    planDigest: "2".repeat(64),
    checkpointId: "atc_333333333333333333333333",
    stateVersion: 7,
    policyId: "review.local-operator",
    policyRevision: "1.0.0",
    decision: "approve",
  };
  const issued = await store.issue(expected);
  const verificationInput = { ...expected, receiptId: issued.reviewReceipt.receiptId };
  assert.deepEqual(await store.verify(verificationInput), {
    ok: true,
    receipt: verificationInput,
  });
  await assert.rejects(
    () => store.verify({ ...verificationInput, stateVersion: 8 }),
    { code: "review_receipt_rejected" },
  );
  now = issued.expiresAtMs;
  await assert.rejects(
    () => store.verify(verificationInput),
    { code: "review_receipt_rejected" },
  );
});

test("local host wires all four capabilities and reports explicit model configuration state", async (t) => {
  const rootDir = await tempRoot(t);
  const unconfigured = createLocalAgentTeamHost({ rootDir, env: {} });
  assert.equal(unconfigured.readiness.referenceVerifier, "ready");
  assert.equal(unconfigured.readiness.controlAuthorizer, "ready");
  assert.equal(unconfigured.readiness.reviewReceiptVerifier, "ready");
  assert.equal(unconfigured.readiness.executionAdapter, "configuration_required");
  const configured = createLocalAgentTeamHost({
    rootDir,
    env: { AGENTICGRAPH_AGENT_TEAM_MODEL: "local-test" },
  });
  assert.equal(configured.readiness.status, "runtime_ready");
  assert.equal(configured.readiness.loopbackOnly, true);
});
