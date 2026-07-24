import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentTeamDelegateSynthesisReceipt,
  createAgentTeamOutputAcceptanceReceipt,
} from "../agent-team-adapter.js";
import { digestAgentTeamValue } from "../agent-team-store.js";
import {
  adapterRecord,
  createFixture,
  delegateResponse,
  exactReferenceVerifier,
  planAndStart,
  runtimeFor,
} from "./agent-team-test-kit.mjs";

test("actual usage above the admitted envelope is accounted and permanently fences retry", async (t) => {
  const fixture = await createFixture(t);
  let executions = 0;
  const adapter = adapterRecord({
    estimate: async () => ({ inputTokens: 1, outputTokens: 1, costUsd: 0.001, timeMs: 1_000 }),
    execute: async () => {
      executions += 1;
      return delegateResponse;
    },
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-over-envelope");
  assert.equal(started.state, "blocked");
  assert.equal(started.error.code, "adapter_envelope_exceeded");
  assert.equal(started.usage.totalTokens, 5);
  assert.equal(started.usage.costUsd, 0.01);
  assert.equal(executions, 1);

  const retried = await runtime.control({
    runId: started.runId,
    expectedStateVersion: started.stateVersion,
    action: "retry",
    idempotencyKey: "retry-over-envelope",
    reason: "Attempt to retry an adapter that breached its exact envelope.",
  });
  assert.equal(retried.ok, false);
  assert.equal(retried.error.code, "execution_adapter_trust_fence_failed");
  assert.equal(executions, 1);
});

test("reported provider time above the admitted envelope is conservatively accounted", async (t) => {
  const fixture = await createFixture(t);
  const adapter = adapterRecord({
    estimate: async () => ({ inputTokens: 10, outputTokens: 10, costUsd: 0.1, timeMs: 1_000 }),
    execute: async () => ({
      ...delegateResponse,
      usage: { ...delegateResponse.usage, timeMs: 2_000 },
    }),
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-reported-time");
  const durable = await runtime.store.read(started.runId);
  assert.equal(started.state, "blocked");
  assert.equal(started.error.code, "adapter_envelope_exceeded");
  assert.ok(durable.activeExecutionMs >= 2_000);
  assert.equal(durable.usage.totalTokens, 5);
});

test("an adapter failure without usage marks spend unreported and blocks continuation", async (t) => {
  const fixture = await createFixture(t);
  let executions = 0;
  const adapter = adapterRecord({
    execute: async () => {
      executions += 1;
      throw new Error("provider secret that must not be returned");
    },
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-unreported-cost");
  assert.equal(started.state, "blocked");
  assert.equal(started.error.code, "branch_usage_unreported");
  assert.equal(started.usage.costStatus, "unreported");
  assert.equal(started.usage.costUsd, null);
  assert.equal(JSON.stringify(started).includes("provider secret"), false);

  const retried = await runtime.control({
    runId: started.runId,
    expectedStateVersion: started.stateVersion,
    action: "retry",
    idempotencyKey: "retry-unreported-cost",
    reason: "Retry must fail because exact spend is unknown.",
  });
  assert.equal(retried.error.code, "continuation_budget_unreported");
  assert.equal(executions, 1);
});

test("an adapter that ignores abort still settles at the stage deadline", async (t) => {
  const fixture = await createFixture(t, {
    bounds: { maxStageTimeMs: 100, maxRunTimeMs: 1_000 },
  });
  const adapter = adapterRecord({
    estimate: async () => ({ inputTokens: 1, outputTokens: 1, costUsd: 0, timeMs: 100 }),
    execute: async () => new Promise(() => {}),
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const before = Date.now();
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-ignored-abort");
  assert.ok(Date.now() - before < 2_000);
  assert.equal(started.state, "blocked");
  assert.equal(started.error.code, "branch_usage_unreported");
  assert.equal(started.usage.costStatus, "unreported");
});

test("zero-spend estimate time is persisted inside the total run-time fence", async (t) => {
  const fixture = await createFixture(t, {
    bounds: { maxStageTimeMs: 200, maxRunTimeMs: 250 },
  });
  let effects = 0;
  const adapter = adapterRecord({
    estimate: async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { inputTokens: 1, outputTokens: 1, costUsd: 0, timeMs: 160 };
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
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-estimate-time");
  const durable = await runtime.store.read(started.runId);
  assert.equal(started.state, "blocked");
  assert.equal(started.error.code, "budget_preflight_blocked");
  assert.ok(durable.activeExecutionMs >= 70);
  assert.equal(effects, 0);
});

test("reference verification honors the lower source-owned stage bound", async (t) => {
  const fixture = await createFixture(t, {
    bounds: { maxStageTimeMs: 100, maxRunTimeMs: 1_000 },
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    referenceVerifier: async () => new Promise(() => {}),
  });
  const input = {
    ...fixture.planInput,
    bounds: {
      ...fixture.planInput.bounds,
      maxStageTimeMs: 1_000,
      maxRunTimeMs: 2_000,
    },
    idempotencyKey: "source-stage-bound",
  };
  const before = Date.now();
  const planned = await runtime.plan(input);
  assert.ok(Date.now() - before < 600);
  assert.equal(planned.ok, false);
  assert.equal(planned.error.code, "reference_verification_timeout");
});

test("a control action wins admission before the adapter effect starts", async (t) => {
  const fixture = await createFixture(t);
  let executions = 0;
  let admit;
  let release;
  const atAdmission = new Promise((resolve) => { admit = resolve; });
  const admissionGate = new Promise((resolve) => { release = resolve; });
  const adapter = adapterRecord({
    execute: async () => {
      executions += 1;
      return delegateResponse;
    },
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const planned = await runtime.plan(fixture.planInput);
  const originalUpdate = runtime.store.update.bind(runtime.store);
  runtime.store.update = async (runId, transition, mutate) => {
    if (transition.eventType === "branch.started") {
      admit();
      await admissionGate;
    }
    return originalUpdate(runId, transition, mutate);
  };
  const startPromise = runtime.start({
    planId: planned.result.planId,
    planDigest: planned.planDigest,
    teamRevision: planned.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "safety-admission-race",
  });
  await atAdmission;
  const running = (await runtime.list({})).result.runs[0];
  const canceled = await runtime.control({
    runId: running.runId,
    expectedStateVersion: running.stateVersion,
    action: "cancel",
    idempotencyKey: "cancel-admission-race",
    reason: "Cancel before the branch claim can be durably admitted.",
  });
  release();
  const settledStart = await startPromise;
  assert.equal(canceled.state, "canceled");
  assert.equal(settledStart.state, "canceled");
  assert.equal(executions, 0);
});

test("review receipts are required only for record_review controls", async (t) => {
  const fixture = await createFixture(t);
  const adapter = adapterRecord({ execute: async () => delegateResponse });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-control-schema");
  const missing = await runtime.control({
    runId: started.runId,
    expectedStateVersion: started.stateVersion,
    action: "record_review",
    idempotencyKey: "missing-review-receipt",
    reason: "Receipt is intentionally omitted.",
  });
  assert.equal(missing.error.code, "invalid_input");
  const unrelated = await runtime.control({
    runId: started.runId,
    expectedStateVersion: started.stateVersion,
    action: "cancel",
    idempotencyKey: "unrelated-review-receipt",
    reason: "Receipt is forbidden for cancel.",
    reviewReceipt: {
      policyId: fixture.team.reviewPolicy.policyId,
      policyRevision: fixture.team.reviewPolicy.policyRevision,
      decision: "approve",
      receiptId: "receipt-unrelated",
    },
  });
  assert.equal(unrelated.error.code, "invalid_input");
});

test("adapter evidence and errors cannot exfiltrate provider-controlled text", async (t) => {
  const fixture = await createFixture(t);
  const sentinel = "ADAPTER_EVIDENCE_PRIVATE_SENTINEL";
  const adapter = adapterRecord({
    execute: async () => ({
      ...delegateResponse,
      evidence: [{ kind: "provider", reference: sentinel }],
    }),
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-evidence-bounds");
  const durable = await runtime.store.read(started.runId);
  assert.deepEqual(Object.keys(durable.publicEvidence[0]).sort(), ["digest", "kind"]);
  assert.equal(durable.publicEvidence[0].kind, "adapter_evidence_digest");
  assert.match(durable.publicEvidence[0].digest, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(durable).includes(sentinel), false);
  assert.equal(JSON.stringify(started).includes(sentinel), false);

  const errorSentinel = "ADAPTER_ERROR_PRIVATE_SENTINEL";
  const failingAdapter = adapterRecord({
    id: "test.sanitized-error-adapter",
    execute: async () => ({
      ok: false,
      error: { code: errorSentinel, message: errorSentinel },
      usage: delegateResponse.usage,
    }),
  });
  const failingRuntime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: failingAdapter,
  });
  const failingPlan = await failingRuntime.plan({
    ...fixture.planInput,
    idempotencyKey: "safety-adapter-error-plan",
  });
  const failed = await failingRuntime.start({
    planId: failingPlan.result.planId,
    planDigest: failingPlan.planDigest,
    teamRevision: failingPlan.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "safety-adapter-error-start",
  });
  assert.equal(failed.error.code, "branch_execution_failed");
  assert.equal(JSON.stringify(await failingRuntime.store.read(failed.runId)).includes(errorSentinel), false);
  assert.equal(JSON.stringify(failed).includes(errorSentinel), false);

  const rejectingRuntime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    referenceVerifier: async (document) => ({
      ...(await exactReferenceVerifier(document)),
      evidence: [{ secret: "REFERENCE_VERIFIER_SECRET" }],
    }),
  });
  const rejected = await rejectingRuntime.plan({
    ...fixture.planInput,
    idempotencyKey: "safety-extra-verifier-evidence",
  });
  assert.equal(rejected.error.code, "team_reference_verification_failed");
  assert.equal(JSON.stringify(rejected).includes("REFERENCE_VERIFIER_SECRET"), false);
});

test("oversized private output is not persisted and reported usage remains accounted", async (t) => {
  const fixture = await createFixture(t);
  const privateOutput = `PRIVATE_MARKER_${"x".repeat((64 * 1024) + 1)}`;
  const adapter = adapterRecord({
    execute: async () => ({ ...delegateResponse, privateOutput }),
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-private-bound");
  const durable = await runtime.store.read(started.runId);
  assert.equal(started.state, "failed");
  assert.equal(started.error.code, "invalid_branch_result");
  assert.equal(started.usage.totalTokens, 5);
  assert.deepEqual(durable.privateMessages, []);
  assert.equal(JSON.stringify(started).includes("PRIVATE_MARKER"), false);
});

test("an adapter cannot mutate a verifier-resolved branch route or ownership", async (t) => {
  const fixture = await createFixture(t);
  const adapter = adapterRecord({
    execute: async () => ({
      ...delegateResponse,
      mode: "handoff",
      conversationOwnerParticipantId: "research",
      finalAnswerOwnerParticipantId: "research",
    }),
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-route-mutation");
  const durable = await runtime.store.read(started.runId);
  assert.equal(started.state, "failed");
  assert.equal(started.error.code, "invalid_branch_result");
  assert.equal(durable.currentConversationOwnerParticipantId, "lead");
  assert.equal(durable.finalAnswerOwnerParticipantId, "lead");
  assert.equal(durable.completedBranchIds.length, 0);
  assert.equal(durable.usage.totalTokens, 5);
});

test("retry exhaustion blocks before another zero-spend estimate", async (t) => {
  const fixture = await createFixture(t, {
    bounds: { maxRetriesPerTurn: 0 },
  });
  let estimates = 0;
  let effects = 0;
  const adapter = adapterRecord({
    estimate: async () => {
      estimates += 1;
      return { inputTokens: 10, outputTokens: 10, costUsd: 0.1, timeMs: 1_000 };
    },
    execute: async () => {
      effects += 1;
      return { ...delegateResponse, branchId: "wrong-branch" };
    },
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-retry-exhaustion");
  assert.equal(started.state, "failed");
  await runtime.control({
    runId: started.runId,
    expectedStateVersion: started.stateVersion,
    action: "retry",
    idempotencyKey: "retry-exhausted-control",
    reason: "The source contract allows no retry after the first attempt.",
  });
  const durable = await runtime.store.read(started.runId);
  assert.equal(durable.error.code, "branch_retries_exhausted");
  assert.equal(estimates, 1);
  assert.equal(effects, 1);
});

test("estimate and execute receive the same owner-filtered immutable branch projection", async (t) => {
  const fixture = await createFixture(t, {
    allowedBranchIds: ["delegate-first", "delegate-second"],
  });
  const estimates = [];
  const executions = [];
  const adapter = adapterRecord({
    estimate: async ({ input, inputDigest }) => {
      estimates.push({ input: structuredClone(input), inputDigest });
      return { inputTokens: 10, outputTokens: 10, costUsd: 0.1, timeMs: 1_000 };
    },
    execute: async ({ input, inputDigest }) => {
      executions.push({ input: structuredClone(input), inputDigest });
      const privateOutput = `PRIVATE_${input.branchId}`;
      const output = `PUBLIC_${input.branchId}`;
      const response = {
        ok: true,
        ...input.branchRoute,
        conversationOwnerParticipantId: input.branchRoute.sourceParticipantId,
        finalAnswerOwnerParticipantId: input.branchRoute.sourceParticipantId,
        privateOutput,
        output,
        delegationDepth: 1,
        fanout: 1,
        usage: { inputTokens: 2, outputTokens: 3, costUsd: 0.01, timeMs: 1 },
        evidence: [],
      };
      response.delegateSynthesis = createAgentTeamDelegateSynthesisReceipt({
        sourceParticipantId: response.sourceParticipantId,
        privateOutput,
        output,
        privateContextDigest: input.privateContextDigest,
      });
      response.outputAcceptance = createAgentTeamOutputAcceptanceReceipt({
        ownerParticipant: input.participants.find(
          (participant) => participant.participantId === response.finalAnswerOwnerParticipantId,
        ),
        output,
      });
      return response;
    },
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-private-context");
  assert.equal(started.state, "completed");
  assert.equal(estimates.length, 2);
  assert.equal(executions.length, 2);
  for (let index = 0; index < 2; index += 1) {
    assert.deepEqual(estimates[index], executions[index]);
    assert.equal(estimates[index].inputDigest, digestAgentTeamValue(estimates[index].input));
  }
  assert.deepEqual(estimates[0].input.privateContext, []);
  assert.deepEqual(estimates[1].input.privateContext, [{
    branchId: "delegate-first",
    fromParticipantId: "research",
    toParticipantId: "lead",
    content: "PRIVATE_delegate-first",
  }]);
  const listed = await runtime.list({ runId: started.runId });
  assert.equal(JSON.stringify(started).includes("PRIVATE_delegate"), false);
  assert.equal(JSON.stringify(listed).includes("PRIVATE_delegate"), false);
});

test("adapter input mutation cannot alter the verifier-owned expected route", async (t) => {
  const fixture = await createFixture(t);
  let executeSawMode;
  const adapter = adapterRecord({
    estimate: async ({ input }) => {
      input.branchRoute.mode = "handoff";
      input.resolvedReferences.workflow.branches[0].mode = "handoff";
      return { inputTokens: 10, outputTokens: 10, costUsd: 0.1, timeMs: 1_000 };
    },
    execute: async ({ input }) => {
      executeSawMode = input.branchRoute.mode;
      input.branchRoute.mode = "handoff";
      return {
        ...delegateResponse,
        mode: "handoff",
        conversationOwnerParticipantId: "research",
        finalAnswerOwnerParticipantId: "research",
      };
    },
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-input-mutation");
  assert.equal(executeSawMode, "delegate");
  assert.equal(started.state, "failed");
  assert.equal(started.error.code, "invalid_branch_result");
});

test("adapter results are snapshotted before post-resolution mutation", async (t) => {
  const fixture = await createFixture(t);
  const adapter = adapterRecord({
    execute: async () => {
      const result = structuredClone(delegateResponse);
      setTimeout(() => {
        result.output = "POST_RESOLUTION_PRIVATE_SENTINEL";
        result.usage.inputTokens = 100_000;
      }, 0);
      return result;
    },
  });
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const { started } = await planAndStart(runtime, fixture.planInput, "safety-result-snapshot");
  assert.equal(started.state, "completed");
  assert.equal(started.result.finalAnswer, delegateResponse.output);
  const durable = await runtime.store.read(started.runId);
  assert.equal(durable.usage.inputTokens, delegateResponse.usage.inputTokens);
  assert.equal(JSON.stringify(durable).includes("POST_RESOLUTION_PRIVATE_SENTINEL"), false);
});

test("delegate synthesis and output-guardrail receipts fail closed", async (t) => {
  const cases = [
    ["missing synthesis", "delegate_synthesis_receipt_mismatch", (response) => {
      delete response.delegateSynthesis;
    }],
    ["mismatched synthesis", "delegate_synthesis_receipt_mismatch", (response) => {
      response.delegateSynthesis.priorPrivateContextDigest = "f".repeat(64);
    }],
    ["mismatched output acceptance", "output_guardrail_receipt_mismatch", (response) => {
      response.outputAcceptance.agentRevision = "forged-revision";
    }],
  ];
  for (const [name, expectedCode, mutate] of cases) {
    await t.test(name, async (subtest) => {
      const fixture = await createFixture(subtest);
      const response = structuredClone(delegateResponse);
      mutate(response);
      const runtime = runtimeFor({
        rootDir: fixture.rootDir,
        docsResolver: fixture.docs.resolver,
        adapter: adapterRecord({ execute: async () => response }),
      });
      const { started } = await planAndStart(runtime, fixture.planInput, `safety-${name}`);
      assert.equal(started.state, "failed");
      assert.equal(started.error.code, expectedCode);
      assert.equal(started.usage.totalTokens, 5);
    });
  }
});

test("an adapter without a zero-spend estimate capability is unavailable", async (t) => {
  const fixture = await createFixture(t);
  const adapter = {
    ...adapterRecord({ execute: async () => delegateResponse }),
    estimateZeroSpend: false,
  };
  const runtime = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
  });
  const planned = await runtime.plan(fixture.planInput);
  const started = await runtime.start({
    planId: planned.result.planId,
    planDigest: planned.planDigest,
    teamRevision: planned.teamRevision,
    expectedStateVersion: 1,
    idempotencyKey: "safety-nonzero-estimate",
  });
  assert.equal(started.error.code, "execution_adapter_unavailable");
  assert.deepEqual((await runtime.list({})).result.runs, []);
});
