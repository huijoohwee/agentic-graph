import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  createAgentTeamDelegateSynthesisReceipt,
  createAgentTeamOutputAcceptanceReceipt,
} from "../agent-team-adapter.js";
import {
  adapterRecord,
  createFixture,
  delegateResponse,
  planAndStart,
  runtimeFor,
} from "./agent-team-test-kit.mjs";

const startInput = (planned, idempotencyKey) => ({
  planId: planned.result.planId,
  planDigest: planned.planDigest,
  teamRevision: planned.teamRevision,
  expectedStateVersion: 1,
  idempotencyKey,
});

const controlInput = (state, action, key) => ({
  runId: state.runId,
  expectedStateVersion: state.stateVersion,
  action,
  idempotencyKey: key,
  reason: `Exercise the exact ${action} race fence.`,
});

test("awaited correctness deadlines keep an otherwise idle process alive", () => {
  const stageUrl = new URL("../agent-team-stage.js", import.meta.url).href;
  const planUrl = new URL("../agent-team-plan-runtime.js", import.meta.url).href;
  const reviewUrl = new URL("../agent-team-review.js", import.meta.url).href;
  const source = `
    const stage = await import(${JSON.stringify(stageUrl)});
    const composed = stage.composeAgentTeamStageSignal(undefined, 25);
    const outcome = await stage.settleAgentTeamAdapterCall(
      () => new Promise(() => {}),
      composed.signal,
    );
    composed.dispose();
    if (outcome.kind !== "aborted") throw new Error("stage deadline did not settle");

    const { createAgentTeamPlanResolver } = await import(${JSON.stringify(planUrl)});
    const resolver = createAgentTeamPlanResolver({
      resolveInvocation: () => new Promise(() => {}),
      resolveSource: () => new Promise(() => {}),
      referenceVerifier: () => new Promise(() => {}),
    });
    let planCode = null;
    try {
      await resolver.resolve({}, {}, 25);
    } catch (error) {
      planCode = error?.code;
    }
    if (planCode !== "plan_source_resolution_timeout") {
      throw new Error("plan deadline did not settle");
    }

    const { authorizeAgentTeamControl } = await import(${JSON.stringify(reviewUrl)});
    let reviewCode = null;
    try {
      await authorizeAgentTeamControl({
        authorizer: () => new Promise(() => {}),
        state: {
          runId: "run",
          planDigest: "${"a".repeat(64)}",
          checkpointId: "checkpoint",
          stateVersion: 1,
          plan: {
            bounds: { maxStageTimeMs: 25 },
            reviewPolicy: { policyId: "review", policyRevision: "1" },
          },
        },
        input: { action: "pause", reason: "liveness regression", reviewReceipt: null },
      });
    } catch (error) {
      reviewCode = error?.code;
    }
    if (reviewCode !== "control_authorization_timeout") {
      throw new Error("review deadline did not settle");
    }
    process.stdout.write("deadlines-settled");
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 5_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, "deadlines-settled");
});

test("active estimate time cannot be discarded by repeated pause and resume races", async (t) => {
  const fixture = await createFixture(t, {
    bounds: { maxStageTimeMs: 250, maxRunTimeMs: 250 },
  });
  let clock = 0;
  let firstEstimate;
  let secondEstimate;
  const firstStarted = new Promise((resolve) => { firstEstimate = resolve; });
  const secondStarted = new Promise((resolve) => { secondEstimate = resolve; });
  let estimates = 0;
  let effects = 0;
  const adapter = adapterRecord({
    estimate: async () => {
      estimates += 1;
      (estimates === 1 ? firstEstimate : secondEstimate)?.();
      return new Promise(() => {});
    },
    execute: async () => {
      effects += 1;
      return delegateResponse;
    },
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
    nowMs: () => clock,
  });
  const planned = await runtime.plan(fixture.planInput);
  const starting = runtime.start(startInput(planned, "active-time-race-start"));
  await firstStarted;

  clock = 120;
  const firstRunning = (await runtime.store.list({ states: ["running"] }))[0];
  await runtime.control(controlInput(firstRunning, "pause", "active-time-pause-one"));
  await starting;
  const firstPaused = await runtime.store.read(firstRunning.runId);

  const resuming = runtime.control(controlInput(firstPaused, "resume", "active-time-resume-one"));
  await secondStarted;
  clock = 260;
  const secondRunning = await runtime.store.read(firstRunning.runId);
  await runtime.control(controlInput(secondRunning, "pause", "active-time-pause-two"));
  await resuming;
  const secondPaused = await runtime.store.read(firstRunning.runId);

  await runtime.control(controlInput(secondPaused, "resume", "active-time-resume-two"));
  const blocked = await runtime.store.read(firstRunning.runId);
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.error.code, "run_time_budget_exhausted");
  assert.equal(blocked.activeExecutionMs, 260);
  assert.equal(estimates, 2);
  assert.equal(effects, 0);
});

test("pause during an estimate can resume without stranding the run queued", async (t) => {
  const fixture = await createFixture(t, {
    bounds: { maxStageTimeMs: 500, maxRunTimeMs: 2_000 },
  });
  let clock = 0;
  let firstEstimate;
  const firstStarted = new Promise((resolve) => { firstEstimate = resolve; });
  let estimates = 0;
  let effects = 0;
  const adapter = adapterRecord({
    estimate: async () => {
      estimates += 1;
      if (estimates === 1) {
        firstEstimate();
        return new Promise(() => {});
      }
      return { inputTokens: 10, outputTokens: 10, costUsd: 0.1, timeMs: 100 };
    },
    execute: async () => {
      effects += 1;
      return delegateResponse;
    },
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
    nowMs: () => clock,
  });
  const planned = await runtime.plan(fixture.planInput);
  const starting = runtime.start(startInput(planned, "estimate-resume-liveness"));
  await firstStarted;
  clock = 10;
  const running = (await runtime.store.list({ states: ["running"] }))[0];
  await runtime.control(controlInput(running, "pause", "estimate-liveness-pause"));
  await starting;
  const paused = await runtime.store.read(running.runId);
  await runtime.control(controlInput(paused, "resume", "estimate-liveness-resume"));

  const completed = await runtime.store.read(running.runId);
  assert.equal(completed.state, "completed");
  assert.equal(estimates, 2);
  assert.equal(effects, 1);
});

test("unsafe state paths and arbitrary internal errors never expose local path text", async (t) => {
  const fixture = await createFixture(t);
  const workspace = path.join(fixture.rootDir, ".agentic-graph-workspace");
  const sentinelPath = path.join(fixture.rootDir, "secret-local-path-sentinel");
  await fs.mkdir(workspace, { recursive: true });
  await fs.mkdir(sentinelPath);
  await fs.symlink(sentinelPath, path.join(workspace, "agent-team-runs"));
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
  });
  const output = await runtime.list({ runId: `atr_${"0".repeat(24)}` });
  assert.equal(output.error.code, "unsafe_state_path");
  assert.equal(JSON.stringify(output).includes(fixture.rootDir), false);
  assert.equal(JSON.stringify(output).includes("secret-local-path-sentinel"), false);
});

test("cumulative adapter counters saturate safely before durable persistence", async (t) => {
  const fixture = await createFixture(t, {
    allowedBranchIds: ["delegate-research", "delegate-overflow"],
  });
  let effects = 0;
  const adapter = adapterRecord({
    estimate: async () => ({ inputTokens: 10, outputTokens: 10, costUsd: 0.1, timeMs: 100 }),
    execute: async ({ input }) => {
      effects += 1;
      const usage = effects === 1
        ? { inputTokens: 5, outputTokens: 0, costUsd: 0.01, timeMs: 1 }
        : { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0, costUsd: 0.01, timeMs: 1 };
      const privateOutput = `private-${input.branchId}`;
      const output = `public-${input.branchId}`;
      return {
        ...delegateResponse,
        branchId: input.branchId,
        privateOutput,
        output,
        usage,
        delegateSynthesis: createAgentTeamDelegateSynthesisReceipt({
          sourceParticipantId: "lead",
          privateOutput,
          output,
          privateContextDigest: input.privateContextDigest,
        }),
        outputAcceptance: createAgentTeamOutputAcceptanceReceipt({
          ownerParticipant: {
            participantId: "lead",
            agentId: "agent.lead",
            agentRevision: "agent-revision-1",
          },
          output,
        }),
      };
    },
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "counter-overflow-start");
  const durable = await runtime.store.read(started.runId);
  assert.equal(durable.state, "blocked");
  assert.equal(durable.error.code, "adapter_envelope_exceeded");
  assert.equal(durable.usage.inputTokens, Number.MAX_SAFE_INTEGER);
  assert.equal(durable.usage.totalTokens, Number.MAX_SAFE_INTEGER);
  assert.equal(Number.isSafeInteger(durable.usage.totalTokens), true);
});

async function exerciseClaimedRecoveryFence(t, { referenceDrift }) {
  const fixture = await createFixture(t, {
    bounds: { maxStageTimeMs: 60_000, maxRunTimeMs: 100_000 },
  });
  let clock = 0;
  let effectStarted;
  let settleEffect;
  const effectGate = new Promise((resolve) => { effectStarted = resolve; });
  const effectResult = new Promise((resolve) => { settleEffect = resolve; });
  let effects = 0;
  const adapterId = referenceDrift ? "test.recovery-reference" : "test.recovery-adapter";
  const adapter = adapterRecord({
    id: adapterId,
    execute: async () => {
      effects += 1;
      effectStarted();
      return effectResult;
    },
  });
  const first = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
    supervisorId: "recovery-owner-a",
    nowMs: () => clock,
  });
  const planned = await first.plan(fixture.planInput);
  const input = startInput(planned, `claimed-recovery-${referenceDrift ? "reference" : "adapter"}`);
  const starting = first.start(input);
  await effectGate;
  const claimed = (await first.store.list({ states: ["running"] }))[0];

  const replacement = adapterRecord({
    id: adapterId,
    revision: referenceDrift ? adapter.revision : "test-v2",
    execute: async () => {
      effects += 1;
      return delegateResponse;
    },
  });
  const restarted = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: replacement,
    referenceVerifier: referenceDrift ? async () => ({ ok: false }) : undefined,
    supervisorId: "recovery-owner-b",
    nowMs: () => clock,
  });
  const live = await restarted.recover();
  assert.equal(live.pending, 1);
  assert.equal((await restarted.store.read(claimed.runId)).state, "running");
  assert.equal(effects, 1);

  await assert.rejects(
    restarted.store.update(claimed.runId, {
      expectedStateVersion: claimed.stateVersion,
      eventType: "test.invalid_claim_orphan",
    }, (state) => {
      state.currentBranchId = null;
      return state;
    }),
    (error) => error?.code === "invalid_transition",
  );
  clock = 65_001;
  await restarted.recover();
  const blocked = await restarted.store.read(claimed.runId);
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.currentBranchId, null);
  assert.equal(blocked.executionClaim, null);
  assert.equal(blocked.usage.costStatus, "unreported");
  assert.equal(Boolean(blocked.startReceipt.snapshot), true);
  assert.equal(effects, 1);

  settleEffect(delegateResponse);
  await starting;
  const replay = await first.start(input);
  assert.equal(replay.state, "blocked");
  assert.notEqual(replay.error.code, "start_replay_snapshot_unavailable");
}

test("recovery defers live claims and safely blocks expired adapter or reference drift", async (t) => {
  await t.test("adapter fence", (subtest) => exerciseClaimedRecoveryFence(subtest, {
    referenceDrift: false,
  }));
  await t.test("reference fence", (subtest) => exerciseClaimedRecoveryFence(subtest, {
    referenceDrift: true,
  }));
});

test("abort before an expired claim replay clears uncertainty as unreported", async (t) => {
  const fixture = await createFixture(t, {
    bounds: { maxStageTimeMs: 60_000, maxRunTimeMs: 100_000 },
  });
  let clock = 0;
  let effectStarted;
  let settleEffect;
  const effectGate = new Promise((resolve) => { effectStarted = resolve; });
  const effectResult = new Promise((resolve) => { settleEffect = resolve; });
  let effects = 0;
  const adapter = adapterRecord({
    id: "test.abort-reclaim",
    execute: async () => {
      effects += 1;
      effectStarted();
      return effectResult;
    },
  });
  const first = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
    supervisorId: "abort-owner-a",
    nowMs: () => clock,
  });
  const planned = await first.plan(fixture.planInput);
  const input = startInput(planned, "abort-before-reclaim");
  const starting = first.start(input);
  await effectGate;

  clock = 65_001;
  const restarted = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
    supervisorId: "abort-owner-b",
    nowMs: () => clock,
  });
  const controller = new AbortController();
  controller.abort(new Error("operator canceled replay admission"));
  const interrupted = await restarted.start(input, { signal: controller.signal });
  const durable = await restarted.store.read(interrupted.runId);
  assert.equal(interrupted.error.code, "execution_interrupted");
  assert.equal(durable.executionClaim, null);
  assert.equal(durable.currentBranchId, null);
  assert.equal(durable.usage.costStatus, "unreported");
  assert.equal(effects, 1);

  settleEffect(delegateResponse);
  await starting;
});
