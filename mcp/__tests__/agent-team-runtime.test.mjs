import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createRunningAgentAdapterRegistry } from "../../contracts/agent-model-runtime.js";
import {
  AGENT_TEAM_HARD_BOUNDS,
  AGENT_TEAM_INVOCATION,
  AGENT_TEAM_SOURCE_SCHEMA,
} from "../../contracts/agent-team.schema.js";
import {
  createAgentTeamDelegateSynthesisReceipt,
  createAgentTeamOutputAcceptanceReceipt,
  createDeterministicAgentTeamAdapter,
  digestAgentTeamPrivateContext,
} from "../agent-team-adapter.js";
import { createAgentTeamRuntime } from "../agent-team-runtime.js";
import { digestAgentTeamSourceDocument } from "../agent-team-source.js";

const SOURCE_REVISION = "a".repeat(40);
const TEAM_URI = "teams/analysis.json";

const docsResolver = async () => ({
  ok: true,
  sourceRevision: SOURCE_REVISION,
  catalog: [
    { token: AGENT_TEAM_INVOCATION.command, kind: "command", sourcePath: "AGENT-TEAM.md", sourceUrl: "source:command" },
    { token: AGENT_TEAM_INVOCATION.semantic, kind: "semantic", sourcePath: "AGENT-TEAM.md", sourceUrl: "source:semantic" },
    { token: AGENT_TEAM_INVOCATION.binding, kind: "binding", sourcePath: "AGENT-TEAM.md", sourceUrl: "source:binding" },
  ],
});

const referenceVerifier = async (document) => {
  let owner = document.manager.participantId;
  const target = document.specialists[0].participantId;
  const branches = document.workflow.allowedBranchIds.map((branchId) => {
    const mode = branchId.startsWith("handoff-") ? "handoff" : "delegate";
    const branch = {
      branchId,
      mode,
      sourceParticipantId: owner,
      targetParticipantId: target,
    };
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
const controlAuthorizer = async (authorization) => ({ ok: true, authorization });
const reviewReceiptVerifier = async (receipt) => ({ ok: true, receipt });

const teamDocument = (allowedBranchIds = ["delegate-research"]) => ({
  schema: AGENT_TEAM_SOURCE_SCHEMA,
  teamId: "team.analysis",
  teamRevision: "team-revision-1",
  source: { uri: TEAM_URI, digest: "0".repeat(64) },
  manager: {
    participantId: "lead",
    agentId: "agent.lead",
    agentRevision: "agent-revision-1",
    role: "Coordinator",
    goal: "Own the registered workflow result.",
    persona: "Concise and methodical.",
  },
  specialists: [{
    participantId: "research",
    agentId: "agent.research",
    agentRevision: "agent-revision-3",
    role: "Research specialist",
    goal: "Return source-grounded evidence.",
    persona: "Skeptical and precise.",
  }],
  workflow: {
    workflowId: "workflow.analysis",
    workflowRevision: "workflow-revision-2",
    allowedBranchIds,
  },
  reviewPolicy: {
    policyId: "review.standard",
    policyRevision: "review-revision-1",
  },
  bounds: { ...AGENT_TEAM_HARD_BOUNDS },
});

async function fixture(t, allowedBranchIds = ["delegate-research"]) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-agent-team-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const team = teamDocument(allowedBranchIds);
  team.source.digest = digestAgentTeamSourceDocument(team);
  await fs.mkdir(path.join(rootDir, "teams"), { recursive: true });
  await fs.writeFile(path.join(rootDir, TEAM_URI), `${JSON.stringify(team, null, 2)}\n`);
  const planInput = {
    invocation: {
      command: AGENT_TEAM_INVOCATION.command,
      semantic: AGENT_TEAM_INVOCATION.semantic,
      binding: AGENT_TEAM_INVOCATION.binding,
      sourceRevision: SOURCE_REVISION,
    },
    teamSource: { ...team.source },
    requestedTask: "Compare the exact evidence and return one bounded answer.",
    bounds: { ...AGENT_TEAM_HARD_BOUNDS },
    idempotencyKey: "plan-idempotency-0001",
  };
  return { rootDir, team, planInput };
}

const delegateResponse = {
  ok: true,
  branchId: "delegate-research",
  mode: "delegate",
  sourceParticipantId: "lead",
  targetParticipantId: "research",
  conversationOwnerParticipantId: "lead",
  finalAnswerOwnerParticipantId: "lead",
  privateOutput: "PRIVATE SPECIALIST EVIDENCE",
  output: "Manager-owned public synthesis.",
  delegationDepth: 1,
  fanout: 1,
  usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, timeMs: 1 },
  evidence: [{ kind: "workflow_receipt", reference: "delegate-research:1" }],
};
delegateResponse.delegateSynthesis = createAgentTeamDelegateSynthesisReceipt({
  sourceParticipantId: delegateResponse.sourceParticipantId,
  privateOutput: delegateResponse.privateOutput,
  output: delegateResponse.output,
  privateContextDigest: digestAgentTeamPrivateContext([]),
});
delegateResponse.outputAcceptance = createAgentTeamOutputAcceptanceReceipt({
  ownerParticipant: {
    participantId: "lead",
    agentId: "agent.lead",
    agentRevision: "agent-revision-1",
  },
  output: delegateResponse.output,
});

const handoffResponse = {
  ok: true,
  branchId: "handoff-research",
  mode: "handoff",
  sourceParticipantId: "lead",
  targetParticipantId: "research",
  conversationOwnerParticipantId: "research",
  finalAnswerOwnerParticipantId: "research",
  output: "Specialist-owned public answer.",
  delegationDepth: 1,
  fanout: 1,
  usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, timeMs: 1 },
  evidence: [{ kind: "workflow_receipt", reference: "handoff-research:1" }],
};
handoffResponse.outputAcceptance = createAgentTeamOutputAcceptanceReceipt({
  ownerParticipant: {
    participantId: "research",
    agentId: "agent.research",
    agentRevision: "agent-revision-3",
  },
  output: handoffResponse.output,
});

const runtimeWithResponses = ({ rootDir, responses }) => {
  const adapter = createDeterministicAgentTeamAdapter({ responses });
  return {
    adapter,
    runtime: createAgentTeamRuntime({
      rootDir,
      docsResolver,
      referenceVerifier,
      controlAuthorizer,
      reviewReceiptVerifier,
      adapterRegistry: createRunningAgentAdapterRegistry([adapter]),
      defaultAdapterId: adapter.id,
    }),
  };
};

test("plan is zero-model, source-revision-fenced, deterministic, and idempotency-conflict safe", async (t) => {
  const { rootDir, planInput } = await fixture(t);
  let referenceCalls = 0;
  const runtime = createAgentTeamRuntime({
    rootDir,
    docsResolver,
    referenceVerifier: async (document) => {
      referenceCalls += 1;
      return referenceVerifier(document);
    },
  });
  const first = await runtime.plan(planInput);
  const replay = await runtime.plan(planInput);
  assert.equal(first.ok, true);
  assert.equal(first.state, "planned");
  assert.equal(first.usage.turns, 0);
  assert.equal(first.usage.totalTokens, 0);
  assert.equal(first.usage.costUsd, 0);
  assert.equal(first.result.personaAuthority ?? first.result.participants[0].personaAuthority, false);
  assert.equal(first.result.planId, replay.result.planId);
  assert.equal(first.planDigest, replay.planDigest);
  assert.equal(referenceCalls, 2);

  const conflict = await runtime.plan({ ...planInput, requestedTask: "Different task." });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, "idempotency_conflict");

  const stale = await runtime.plan({
    ...planInput,
    idempotencyKey: "plan-idempotency-stale",
    invocation: { ...planInput.invocation, sourceRevision: "b".repeat(40) },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, "invocation_source_revision_mismatch");
});

test("plan fails typed before admission when no host reference verifier is configured", async (t) => {
  const { rootDir, planInput } = await fixture(t);
  const runtime = createAgentTeamRuntime({ rootDir, docsResolver });
  const planned = await runtime.plan(planInput);
  assert.equal(planned.ok, false);
  assert.equal(planned.error.code, "reference_verifier_unavailable");
  assert.deepEqual((await runtime.list({})).result.runs, []);
});

test("start fails typed before durable mutation when no host execution adapter is configured", async (t) => {
  const { rootDir, planInput } = await fixture(t);
  const runtime = createAgentTeamRuntime({ rootDir, docsResolver, referenceVerifier });
  const planned = await runtime.plan(planInput);
  const started = await runtime.start({
    planId: planned.result.planId,
    planDigest: planned.planDigest,
    teamRevision: planned.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "start-idempotency-0001",
  });
  assert.equal(started.ok, false);
  assert.equal(started.error.code, "execution_adapter_unavailable");
  const listed = await runtime.list({});
  assert.deepEqual(listed.result.runs, []);
});

test("start rejects a registry result that is not the exact configured adapter", async (t) => {
  const { rootDir, planInput } = await fixture(t);
  const runtime = createAgentTeamRuntime({
    rootDir,
    docsResolver,
    referenceVerifier,
    adapterRegistry: {
      resolve: () => ({
        id: "test.different-adapter",
        revision: "test-v1",
        configured: true,
        replaySafe: true,
        estimateZeroSpend: true,
        estimate: async () => ({ inputTokens: 0, outputTokens: 0, costUsd: 0, timeMs: 1 }),
        execute: async () => delegateResponse,
      }),
    },
    defaultAdapterId: "test.expected-adapter",
  });
  const planned = await runtime.plan(planInput);
  const started = await runtime.start({
    planId: planned.result.planId,
    planDigest: planned.planDigest,
    teamRevision: planned.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "start-adapter-identity-fence",
  });

  assert.equal(started.error.code, "execution_adapter_unavailable");
  assert.deepEqual((await runtime.list({})).result.runs, []);
});

test("delegate execution keeps specialist output private, persists checkpoints, and replays start once", async (t) => {
  const { rootDir, planInput } = await fixture(t);
  let calls = 0;
  const response = async () => {
    calls += 1;
    return delegateResponse;
  };
  response.usage = delegateResponse.usage;
  const { adapter, runtime } = runtimeWithResponses({ rootDir, responses: { "delegate-research": response } });
  const planned = await runtime.plan(planInput);
  const startInput = {
    planId: planned.result.planId,
    planDigest: planned.planDigest,
    teamRevision: planned.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "start-idempotency-0002",
  };
  const completed = await runtime.start(startInput);
  const replay = await runtime.start(startInput);
  assert.equal(completed.ok, true);
  assert.equal(completed.state, "completed");
  assert.equal(completed.result.finalAnswer, delegateResponse.output);
  assert.equal(completed.result.finalAnswerOwnerParticipantId, "lead");
  assert.equal(JSON.stringify(completed).includes(delegateResponse.privateOutput), false);
  assert.equal(calls, 1);
  assert.equal(replay.state, "completed");

  const state = await runtime.store.read(completed.runId);
  assert.equal(state.privateMessages[0].content, delegateResponse.privateOutput);
  assert.equal(state.checkpointId.startsWith("atc_"), true);
  const restarted = createAgentTeamRuntime({
    rootDir,
    docsResolver,
    referenceVerifier,
    controlAuthorizer,
    reviewReceiptVerifier,
    adapterRegistry: createRunningAgentAdapterRegistry([adapter]),
    defaultAdapterId: adapter.id,
  });
  const listed = await restarted.list({ runId: completed.runId });
  assert.equal(listed.result.runs[0].state, "completed");
  assert.equal(JSON.stringify(listed).includes(delegateResponse.privateOutput), false);
});

test("handoff execution transfers conversation and final-answer ownership together", async (t) => {
  const { rootDir, planInput } = await fixture(t, ["handoff-research"]);
  const { runtime } = runtimeWithResponses({
    rootDir,
    responses: { "handoff-research": handoffResponse },
  });
  const planned = await runtime.plan(planInput);
  const completed = await runtime.start({
    planId: planned.result.planId,
    planDigest: planned.planDigest,
    teamRevision: planned.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "start-idempotency-handoff",
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.result.currentConversationOwnerParticipantId, "research");
  assert.equal(completed.result.finalAnswerOwnerParticipantId, "research");
  assert.equal(completed.result.finalAnswer, handoffResponse.output);
});

test("budget envelope blocks before adapter execution", async (t) => {
  const { rootDir, planInput } = await fixture(t);
  let executions = 0;
  const adapter = {
    id: "test.expensive-adapter",
    revision: "test-v1",
    configured: true,
    replaySafe: true,
    estimateZeroSpend: true,
    async estimate() {
      return { inputTokens: 120_001, outputTokens: 0, costUsd: 0, timeMs: 1_000 };
    },
    async execute() {
      executions += 1;
      return delegateResponse;
    },
  };
  const runtime = createAgentTeamRuntime({
    rootDir,
    docsResolver,
    referenceVerifier,
    controlAuthorizer,
    reviewReceiptVerifier,
    adapterRegistry: createRunningAgentAdapterRegistry([adapter]),
    defaultAdapterId: adapter.id,
  });
  const planned = await runtime.plan(planInput);
  const started = await runtime.start({
    planId: planned.result.planId,
    planDigest: planned.planDigest,
    teamRevision: planned.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "start-idempotency-budget",
  });
  assert.equal(started.ok, false);
  assert.equal(started.state, "blocked");
  assert.equal(started.error.code, "budget_preflight_blocked");
  assert.equal(executions, 0);
});

test("a new runtime resumes the exact durable blocked checkpoint without replanning", async (t) => {
  const { rootDir, planInput } = await fixture(t);
  const adapterId = "test.recovery-adapter";
  const blockedAdapter = {
    id: adapterId,
    revision: "test-v1",
    configured: true,
    replaySafe: true,
    estimateZeroSpend: true,
    async estimate() {
      return { inputTokens: 120_001, outputTokens: 0, costUsd: 0, timeMs: 1_000 };
    },
    async execute() {
      throw new Error("must not execute while blocked");
    },
  };
  const firstRuntime = createAgentTeamRuntime({
    rootDir,
    docsResolver,
    referenceVerifier,
    controlAuthorizer,
    reviewReceiptVerifier,
    adapterRegistry: createRunningAgentAdapterRegistry([blockedAdapter]),
    defaultAdapterId: adapterId,
  });
  const planned = await firstRuntime.plan(planInput);
  const blocked = await firstRuntime.start({
    planId: planned.result.planId,
    planDigest: planned.planDigest,
    teamRevision: planned.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "start-idempotency-recovery",
  });
  assert.equal(blocked.state, "blocked");

  const readyAdapter = createDeterministicAgentTeamAdapter({
    id: adapterId,
    revision: "test-v1",
    responses: { "delegate-research": delegateResponse },
  });
  const restarted = createAgentTeamRuntime({
    rootDir,
    docsResolver,
    referenceVerifier,
    controlAuthorizer,
    reviewReceiptVerifier,
    adapterRegistry: createRunningAgentAdapterRegistry([readyAdapter]),
    defaultAdapterId: adapterId,
  });
  const retried = await restarted.control({
    runId: blocked.runId,
    expectedStateVersion: blocked.stateVersion,
    action: "retry",
    idempotencyKey: "control-retry-recovery",
    reason: "The exact host execution adapter is now ready.",
  });
  assert.equal(retried.ok, true);
  assert.equal(retried.state, "queued");
  const completed = await restarted.store.read(blocked.runId);
  assert.equal(completed.state, "completed");
  assert.equal(completed.finalAnswer, delegateResponse.output);
  assert.equal(completed.planDigest, planned.planDigest);
});

test("pause and cancel win the state fence over an in-flight branch", async (t) => {
  const { rootDir, planInput } = await fixture(t);
  let executionStarted;
  const startedSignal = new Promise((resolve) => { executionStarted = resolve; });
  const adapter = {
    id: "test.interruptible-adapter",
    revision: "test-v1",
    configured: true,
    replaySafe: true,
    estimateZeroSpend: true,
    async estimate() {
      return { inputTokens: 0, outputTokens: 0, costUsd: 0, timeMs: 10_000 };
    },
    async execute({ signal }) {
      executionStarted();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 10_000);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason);
        }, { once: true });
      });
      return delegateResponse;
    },
  };
  const runtime = createAgentTeamRuntime({
    rootDir,
    docsResolver,
    referenceVerifier,
    controlAuthorizer,
    reviewReceiptVerifier,
    adapterRegistry: createRunningAgentAdapterRegistry([adapter]),
    defaultAdapterId: adapter.id,
  });
  const planned = await runtime.plan(planInput);
  const startPromise = runtime.start({
    planId: planned.result.planId,
    planDigest: planned.planDigest,
    teamRevision: planned.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "start-idempotency-control",
  });
  await startedSignal;
  const running = (await runtime.list({})).result.runs[0];
  const pauseInput = {
    runId: running.runId,
    expectedStateVersion: running.stateVersion,
    action: "pause",
    idempotencyKey: "control-pause-0001",
    reason: "Operator requested a bounded pause.",
  };
  const paused = await runtime.control(pauseInput);
  assert.equal(paused.ok, true);
  assert.equal(paused.state, "paused");
  assert.equal((await startPromise).state, "paused");

  const canceled = await runtime.control({
    runId: paused.runId,
    expectedStateVersion: paused.stateVersion,
    action: "cancel",
    idempotencyKey: "control-cancel-0001",
    reason: "Operator canceled the paused run.",
  });
  assert.equal(canceled.state, "canceled");
  assert.deepEqual(await runtime.control(pauseInput), paused);
  const stale = await runtime.control({
    runId: paused.runId,
    expectedStateVersion: paused.stateVersion,
    action: "resume",
    idempotencyKey: "control-resume-stale",
    reason: "Stale continuation.",
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, "state_version_conflict");
});
