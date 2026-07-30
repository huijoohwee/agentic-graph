import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { createSkillEvolutionRuntime } from "../skill-evolution-runtime.js";
import { SKILL_EVOLUTION_CONTROL_CALL_TIMEOUT_CAP_MS } from "../skill-evolution-transition-helpers.js";
import { createSkillEvolutionMemoryStore } from "../skill-evolution-store.js";
import {
  SKILL_EVOLUTION_INVOCATION,
  SKILL_EVOLUTION_REQUEST_SCHEMA,
  SKILL_EVOLUTION_RESULT_SCHEMA,
  buildSkillEvolutionToolDefinition,
} from "../skill-evolution-tool-contract.js";
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const invocation = () => ({
  command: SKILL_EVOLUTION_INVOCATION.command,
  semantics: [...SKILL_EVOLUTION_INVOCATION.semantics],
  bindings: [...SKILL_EVOLUTION_INVOCATION.bindings],
});

function spec(operation = "start", overrides = {}) {
  return {
    schema: SKILL_EVOLUTION_REQUEST_SCHEMA,
    operation,
    invocation: invocation(),
    sourceRevision: "a".repeat(40),
    baseline: {
      skillId: "support-triage",
      revision: "skill-v1",
      digest: sha("baseline"),
      artifactRef: "skill://support-triage/v1",
      normalizedChars: 1000,
    },
    executor: { id: "executor.local", revision: "v1", digest: sha("executor") },
    candidateAdapter: { id: "candidate.local", revision: "v1", digest: sha("candidate-adapter") },
    dataset: {
      training: [
        { id: "train-a", digest: sha("train-a"), ref: "dataset://training/a" },
        { id: "train-b", digest: sha("train-b"), ref: "dataset://training/b" },
      ],
      validation: [{ id: "holdout-a", digest: sha("holdout-a"), ref: "dataset://validation/a" }],
    },
    evaluator: {
      id: "evaluator.local",
      revision: "v1",
      digest: sha("evaluator"),
      metric: { id: "quality", direction: "maximize", threshold: 0.6 },
    },
    schedule: {
      epochs: 2,
      batchSize: 2,
      miniBatchSize: 1,
      learningRate: { initial: 0.1, decay: 0.5, floor: 0.01 },
      seed: "runtime-seed",
    },
    validation: { minDelta: 0.05, patience: 2, requiredGates: ["schema.valid", "semantic.preserved"] },
    bounds: {
      maxCandidates: 10,
      maxAdapterCalls: 20,
      maxMutationOperations: 20,
      maxChangedChars: 1000,
      maxTokens: 10000,
      maxCostUsd: 10,
      maxDurationMs: 60000,
    },
    idempotencyKey: "start-runtime-1",
    ...overrides,
  };
}

function adapterFixture({ gate = true, drift = false, changedChars = 10, scores, usageEnvelope } = {}) {
  const calls = [];
  let candidateIndex = 0;
  const epochScores = scores || [
    { champion: 0.5, candidate: 0.7 },
    { champion: 0.7, candidate: 0.69 },
  ];
  const envelopes = usageEnvelope || {
    executeTraining: { maxTokens: 2, maxCostUsd: 0.01, maxDurationMs: 10 },
    proposeCandidate: { maxTokens: 3, maxCostUsd: 0.02, maxDurationMs: 10 },
    executeValidation: { maxTokens: 2, maxCostUsd: 0.003, maxDurationMs: 10 },
    evaluateValidation: { maxTokens: 4, maxCostUsd: 0.004, maxDurationMs: 10 },
  };
  return {
    calls,
    adapter: {
      sourceVerifier: {
        async verifySources(payload) {
          calls.push({ method: "verifySources", payload: structuredClone(payload) });
          return drift()
            ? { ok: false, code: "source_drift", message: "fixture drift" }
            : {
                ok: true,
                sourceRevision: payload.sourceRevision,
                digestsVerified: true,
                registeredGates: ["schema.valid", "semantic.preserved"],
                usageEnvelope: structuredClone(envelopes),
              };
        },
        async verifyMutation(payload) { calls.push({ method: "verifyMutation", payload: structuredClone(payload) }); return { ok: true, sourceRevision: payload.sourceRevision, parentDigest: payload.parent.digest, candidateDigest: payload.candidate.digest, candidateRef: payload.candidate.candidateRef, parentNormalizedChars: payload.expected.parentNormalizedChars, candidateNormalizedChars: payload.expected.candidateNormalizedChars, mutationOperations: payload.expected.mutationOperations, changedChars: payload.expected.changedChars, artifactVerified: true }; },
      },
      trainingExecutor: {
        async executeTraining(payload) {
          calls.push({ method: "executeTraining", payload: structuredClone(payload) });
          return { evidence: { ref: `evidence://training/${payload.epochIndex}/${payload.miniBatchIndex}`, digest: sha(JSON.stringify(payload.scenarioRefs)) }, cost: { tokens: 2, costUsd: 0.01, durationMs: 1 } };
        },
      },
      candidate: {
        async proposeCandidate(payload) {
          calls.push({ method: "proposeCandidate", payload: structuredClone(payload) });
          candidateIndex += 1;
          return {
            candidate: {
              candidateRef: `candidate://skill/${candidateIndex}`,
              diffRef: `diff://skill/${candidateIndex}`,
              digest: sha(`candidate-${candidateIndex}`),
              parentDigest: payload.candidate.digest,
            },
            mutation: {
              hunks: [{ start: 0, deleteText: "", insertText: "x".repeat(changedChars) }],
            },
            cost: { tokens: 3, costUsd: 0.02, durationMs: 1 },
          };
        },
      },
      heldOut: {
        async executeValidation(payload) {
          calls.push({ method: "executeValidation", payload: structuredClone(payload) });
          return {
            evidence: { ref: `evidence://validation/${payload.epochIndex}/${payload.candidateRole}`, digest: sha(`${payload.candidate.digest}-${payload.epochIndex}`) },
            cost: { tokens: 2, costUsd: 0.003, durationMs: 1 },
          };
        },
        async evaluateValidation(payload) {
          calls.push({ method: "evaluateValidation", payload: structuredClone(payload) });
          return {
            metrics: epochScores[payload.epochIndex],
            gateResults: payload.requiredGates.map((id) => ({ id, passed: gate, evidenceDigest: sha(`${id}-${payload.epochIndex}`) })),
            cost: { tokens: 4, costUsd: 0.004, durationMs: 1 },
          };
        },
      },
    },
  };
}

const transition = (runId, revision, key, operation = "step") => ({
  schema: SKILL_EVOLUTION_REQUEST_SCHEMA,
  operation,
  invocation: invocation(),
  runId,
  expectedRevision: revision,
  idempotencyKey: key,
});
const statusRequest = (runId) => ({
  schema: SKILL_EVOLUTION_REQUEST_SCHEMA,
  operation: "status",
  invocation: invocation(),
  runId,
});
const createAuthorizedRuntime = (options = {}) => createSkillEvolutionRuntime({
  ...options,
  authorize: async () => true,
});

test("runs deterministic mini-batch epochs, gates validation, and returns only a review proposal", async () => {
  const ajv = new Ajv2020({ strict: false });
  const validateOutput = ajv.compile(buildSkillEvolutionToolDefinition().outputSchema);
  const fixture = adapterFixture({ drift: () => false });
  const runtime = createAuthorizedRuntime({ adapter: fixture.adapter, idFactory: () => "worker" });
  const planned = await runtime.run(spec("plan", { idempotencyKey: "plan-runtime-1" }));
  assert.equal(planned.schema, SKILL_EVOLUTION_RESULT_SCHEMA);
  assert.equal(planned.status, "planned");
  assert.equal(planned.runId, null);
  assert.equal(planned.revision, 0);
  assert.equal(planned.plan.epochs, 2);
  assert.equal(planned.plan.miniBatchesPerEpoch, 2);
  assert.deepEqual(planned.plan.learningRate, { initial: 0.1, decay: 0.5, floor: 0.01 });
  assert.equal(validateOutput(planned), true, ajv.errorsText(validateOutput.errors));
  assert.equal(fixture.calls.length, 0, "plan must not call a source or execution adapter");

  const started = await runtime.run(spec());
  assert.equal(started.status, "ready");
  assert.equal(started.revision, 1);
  assert.equal(validateOutput(started), true, ajv.errorsText(validateOutput.errors));
  let result = started;
  for (let index = 0; index < 6; index += 1) {
    result = await runtime.run(transition(started.runId, result.revision, `step-${index + 1}`));
  }
  assert.equal(result.status, "review_pending");
  assert.equal(result.revision, 7);
  assert.equal(result.stopReason, "completed");
  assert.equal(result.metrics.baseline, 0.5);
  assert.equal(result.metrics.champion, 0.7);
  assert.equal(result.metrics.promotedCandidate, null);
  assert.equal(result.validation.staleEpochs, 1);
  assert.equal(result.proposal.status, "review_pending");
  assert.equal(result.proposal.digest, sha("candidate-2"));
  assert.equal(result.cost.adapterCalls, result.cost.byPhase.training.adapterCalls + result.cost.byPhase.validation.adapterCalls);
  assert.equal(result.cost.tokens, result.cost.byPhase.training.tokens + result.cost.byPhase.validation.tokens);
  assert.equal(
    result.cost.costUsd,
    Number((result.cost.byPhase.training.costUsd + result.cost.byPhase.validation.costUsd).toFixed(12)),
  );
  assert.equal(result.cost.durationMs, result.cost.byPhase.training.durationMs + result.cost.byPhase.validation.durationMs);
  assert.deepEqual({ applied: result.applied, weights: result.modelWeightsMutated, deployed: result.deploymentAttempted }, { applied: false, weights: false, deployed: false });
  assert.equal(validateOutput(result), true, ajv.errorsText(validateOutput.errors));

  const trainingCalls = fixture.calls.filter((entry) => entry.method === "executeTraining");
  const proposalCalls = fixture.calls.filter((entry) => entry.method === "proposeCandidate");
  const validationRollouts = fixture.calls.filter((entry) => entry.method === "executeValidation");
  const validationCalls = fixture.calls.filter((entry) => entry.method === "evaluateValidation");
  assert.equal(trainingCalls.length, 4);
  assert.equal(proposalCalls.length, 4);
  assert.equal(fixture.calls.filter((entry) => entry.method === "verifyMutation").length, 4);
  assert.equal(validationRollouts.length, 4);
  assert.equal(validationCalls.length, 2);
  assert.equal(trainingCalls.flatMap((entry) => entry.payload.scenarioRefs).some((entry) => entry.ref.includes("validation")), false);
  assert.equal(proposalCalls.some((entry) => "validationScenarioRefs" in entry.payload), false);
  assert.deepEqual(proposalCalls.map((entry) => entry.payload.mutationBudget.learningRate), [0.1, 0.1, 0.05, 0.05]);
  assert.ok(validationRollouts.every((entry) => entry.payload.validationScenarioRefs.every((item) => item.ref.includes("validation"))));
  assert.equal(validationCalls.some((entry) => "validationScenarioRefs" in entry.payload), false);
  const executionCalls = fixture.calls.filter((entry) => !["verifySources", "verifyMutation"].includes(entry.method));
  const callIds = executionCalls.map((entry) => entry.payload.call?.callId);
  assert.ok(callIds.every((callId) => /^[a-f0-9]{64}$/.test(callId)));
  assert.equal(new Set(callIds).size, callIds.length);
  assert.ok(executionCalls.every((entry) => /^[a-f0-9]{64}$/.test(entry.payload.call?.inputDigest)));

  const callsBeforeStatus = fixture.calls.length;
  assert.equal((await runtime.run(statusRequest(started.runId))).revision, 7);
  assert.equal(fixture.calls.length, callsBeforeStatus, "status must not call an adapter");
  const replayedStart = await runtime.run(spec());
  assert.equal(replayedStart.revision, 1, "start replay returns its original transition");
  assert.equal(replayedStart.status, "ready");
  const conflictedStart = await runtime.run(spec("start", { sourceRevision: "b".repeat(40) }));
  assert.equal(conflictedStart.status, "failed");
  assert.equal(conflictedStart.errors[0].code, "idempotency_conflict");
});
test("failed required gates roll back the working candidate and stop at patience", async () => {
  const fixture = adapterFixture({ gate: false, drift: () => false, scores: [{ champion: 0.5, candidate: 0.9 }] });
  const request = spec("start", {
    schedule: { ...spec().schedule, epochs: 3, batchSize: 2, miniBatchSize: 2 },
    validation: { ...spec().validation, patience: 1 },
  });
  const runtime = createAuthorizedRuntime({ adapter: fixture.adapter });
  const started = await runtime.run(request);
  const candidate = await runtime.run(transition(started.runId, 1, "candidate-step"));
  const checkpoint = await runtime.run(transition(started.runId, candidate.revision, "validation-step"));
  assert.equal(checkpoint.status, "stopped");
  assert.equal(checkpoint.stopReason, "plateau");
  assert.equal(checkpoint.proposal, null);
  assert.equal(checkpoint.champion.digest, request.baseline.digest);
  assert.equal(checkpoint.promotedCandidate, null);
  assert.equal(checkpoint.validation.staleEpochs, 1);
  assert.ok(checkpoint.validation.gateResults.every((entry) => entry.passed === false));
});
test("step replay is idempotent while stale revisions and source drift fail closed", async () => {
  let drifted = false;
  const fixture = adapterFixture({ drift: () => drifted });
  const runtime = createAuthorizedRuntime({ adapter: fixture.adapter, idFactory: () => "worker" });
  const started = await runtime.run(spec());
  drifted = true;
  const replayedStart = await runtime.run(spec());
  assert.equal(replayedStart.status, "ready");
  assert.equal(replayedStart.revision, 1);
  drifted = false;
  const step = transition(started.runId, 1, "step-replay");
  const first = await runtime.run(step);
  const callCount = fixture.calls.length;
  assert.deepEqual(await runtime.run(step), first);
  assert.equal(fixture.calls.length, callCount);

  const reusedAcrossOperations = await runtime.run(transition(started.runId, 2, "step-replay", "cancel"));
  assert.equal(reusedAcrossOperations.status, "failed");
  assert.equal(reusedAcrossOperations.errors[0].code, "idempotency_conflict");
  assert.equal((await runtime.run(statusRequest(started.runId))).revision, 2);

  const stale = await runtime.run(transition(started.runId, 1, "different-step"));
  assert.equal(stale.status, "failed");
  assert.equal(stale.errors[0].code, "stale_revision");
  assert.equal((await runtime.run(statusRequest(started.runId))).revision, 2);

  drifted = true;
  const drift = await runtime.run(transition(started.runId, 2, "drift-step"));
  assert.equal(drift.status, "failed");
  assert.equal(drift.stopReason, "source_drift");
  assert.equal(drift.revision, 3);
  assert.equal(drift.modelWeightsMutated, false);
});
test("textual learning-rate overages fail without promotion or model state", async () => {
  const fixture = adapterFixture({ drift: () => false, changedChars: 101 });
  const proposeCandidate = fixture.adapter.candidate.proposeCandidate;
  fixture.adapter.candidate.proposeCandidate = async (payload) => ({
    ...await proposeCandidate(payload),
    mutationOperations: 0,
    changedChars: 0,
  });
  const runtime = createAuthorizedRuntime({ adapter: fixture.adapter });
  const started = await runtime.run(spec());
  const result = await runtime.run(transition(started.runId, 1, "over-budget"));
  assert.equal(result.status, "failed");
  assert.equal(result.stopReason, "bound_exceeded");
  assert.equal(result.proposal, null);
  assert.equal(result.champion.digest, spec().baseline.digest);
  assert.equal(result.modelWeightsMutated, false);
});
test("USD accounting uses canonical precision at exact decimal caps", async () => {
  const fixture = adapterFixture({
    drift: () => false,
    usageEnvelope: {
      executeTraining: { maxTokens: 0, maxCostUsd: 0.1, maxDurationMs: 50 },
      proposeCandidate: { maxTokens: 0, maxCostUsd: 0.2, maxDurationMs: 10 },
      executeValidation: { maxTokens: 2, maxCostUsd: 0, maxDurationMs: 10 },
      evaluateValidation: { maxTokens: 4, maxCostUsd: 0, maxDurationMs: 10 },
    },
  });
  const executeTraining = fixture.adapter.trainingExecutor.executeTraining;
  const proposeCandidate = fixture.adapter.candidate.proposeCandidate;
  fixture.adapter.trainingExecutor.executeTraining = async (payload) => {
    const output = await executeTraining(payload);
    await new Promise((resolve) => setTimeout(resolve, 8));
    return { ...output, cost: { tokens: 0, costUsd: 0.1, durationMs: 0 } };
  };
  fixture.adapter.candidate.proposeCandidate = async (payload) => ({
    ...await proposeCandidate(payload),
    cost: { tokens: 0, costUsd: 0.2, durationMs: 0 },
  });
  const request = spec("start", {
    schedule: { ...spec().schedule, epochs: 1, batchSize: 2, miniBatchSize: 2 },
    bounds: { ...spec().bounds, maxCostUsd: 0.3 },
    idempotencyKey: "decimal-cost-start",
  });
  const runtime = createAuthorizedRuntime({ adapter: fixture.adapter });
  const started = await runtime.run(request);
  const result = await runtime.run(transition(started.runId, 1, "decimal-cost-step"));
  assert.equal(result.status, "running");
  assert.equal(result.cost.costUsd, 0.3);
  assert.ok(result.cost.durationMs >= 8, "measured wall duration must override an underreported meter");
});
test("invalid candidate references and unevidenced passing gates fail closed", async () => {
  const invalidRefFixture = adapterFixture({ drift: () => false });
  const proposeCandidate = invalidRefFixture.adapter.candidate.proposeCandidate;
  invalidRefFixture.adapter.candidate.proposeCandidate = async (payload) => {
    const result = await proposeCandidate(payload);
    result.candidate.candidateRef = " \t ";
    return result;
  };
  const invalidRefRuntime = createAuthorizedRuntime({ adapter: invalidRefFixture.adapter });
  const invalidRefStart = await invalidRefRuntime.run(spec());
  const invalidRef = await invalidRefRuntime.run(transition(invalidRefStart.runId, 1, "invalid-ref"));
  assert.equal(invalidRef.status, "failed");
  assert.equal(invalidRef.errors[0].code, "adapter_failed");

  const gateFixture = adapterFixture({
    drift: () => false,
    scores: [{ champion: 0.5, candidate: 0.9 }],
  });
  const evaluateValidation = gateFixture.adapter.heldOut.evaluateValidation;
  gateFixture.adapter.heldOut.evaluateValidation = async (payload) => {
    const result = await evaluateValidation(payload);
    result.gateResults = result.gateResults.map((gate) => ({ ...gate, evidenceDigest: null }));
    return result;
  };
  const gateRuntime = createAuthorizedRuntime({ adapter: gateFixture.adapter });
  const gateRequest = spec("start", {
    schedule: { ...spec().schedule, epochs: 1, batchSize: 2, miniBatchSize: 2 },
    validation: { ...spec().validation, patience: 1 },
    idempotencyKey: "unevidenced-gate-start",
  });
  const gateStart = await gateRuntime.run(gateRequest);
  const trained = await gateRuntime.run(transition(gateStart.runId, 1, "unevidenced-gate-train"));
  const gated = await gateRuntime.run(transition(gateStart.runId, trained.revision, "unevidenced-gate-validate"));
  assert.equal(gated.status, "stopped");
  assert.equal(gated.champion.digest, gateRequest.baseline.digest);
  assert.ok(gated.validation.gateResults.every((gate) => gate.passed === false));
});
test("source-bound gates and per-call envelopes fail before execution spend", async () => {
  const gateFixture = adapterFixture({ drift: () => false });
  const gateRuntime = createAuthorizedRuntime({ adapter: gateFixture.adapter });
  const unknownGate = await gateRuntime.run(spec("start", {
    validation: { ...spec().validation, requiredGates: ["caller.claimed"] },
    idempotencyKey: "unknown-gate-start",
  }));
  assert.equal(unknownGate.status, "failed");
  assert.equal(unknownGate.errors[0].code, "gate_failed");
  assert.equal(gateFixture.calls.some((entry) => entry.method !== "verifySources"), false);

  const boundFixture = adapterFixture({ drift: () => false });
  const boundRuntime = createAuthorizedRuntime({ adapter: boundFixture.adapter });
  const overEnvelope = await boundRuntime.run(spec("start", {
    bounds: { ...spec().bounds, maxTokens: 1 },
    idempotencyKey: "usage-envelope-start",
  }));
  assert.equal(overEnvelope.status, "failed");
  assert.equal(overEnvelope.errors[0].code, "bound_exceeded");
  assert.equal(boundFixture.calls.some((entry) => entry.method !== "verifySources"), false);
});

test("deadlines abort hanging adapters and unverified usage is charged conservatively", async () => {
  const fixture = adapterFixture({
    drift: () => false,
    usageEnvelope: {
      executeTraining: { maxTokens: 2, maxCostUsd: 0.01, maxDurationMs: 20 },
      proposeCandidate: { maxTokens: 3, maxCostUsd: 0.02, maxDurationMs: 20 },
      executeValidation: { maxTokens: 2, maxCostUsd: 0.003, maxDurationMs: 20 },
      evaluateValidation: { maxTokens: 4, maxCostUsd: 0.004, maxDurationMs: 20 },
    },
  });
  fixture.adapter.trainingExecutor.executeTraining = ({ signal }) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), {
      code: "canceled",
      usage: { tokens: -9, costUsd: Number.NaN, durationMs: -9 },
      cost: { tokens: Number.POSITIVE_INFINITY, costUsd: -1, durationMs: -1 },
    })), { once: true });
  });
  const runtime = createAuthorizedRuntime({ adapter: fixture.adapter });
  const started = await runtime.run(spec("start", { idempotencyKey: "deadline-start" }));
  const before = Date.now();
  const result = await runtime.run(transition(started.runId, 1, "deadline-step"));
  assert.equal(result.status, "failed");
  assert.equal(result.stopReason, "timeout");
  assert.ok(Date.now() - before < 1000);
  assert.equal(result.cost.byPhase.training.tokens, 2);
  assert.equal(result.cost.byPhase.training.costUsd, 0.01);
  assert.equal(result.cost.byPhase.training.durationMs, 20);
});
test("over-envelope returned usage is rejected and charged conservatively", async () => {
  const fixture = adapterFixture({ drift: () => false });
  const executeTraining = fixture.adapter.trainingExecutor.executeTraining;
  fixture.adapter.trainingExecutor.executeTraining = async (payload) => ({
    ...await executeTraining(payload), cost: { tokens: 3, costUsd: 0.01, durationMs: 1 },
  });
  const runtime = createAuthorizedRuntime({ adapter: fixture.adapter });
  const started = await runtime.run(spec("start", { idempotencyKey: "over-meter-start" }));
  const result = await runtime.run(transition(started.runId, 1, "over-meter-step"));
  assert.equal(result.stopReason, "bound_exceeded");
  assert.equal(result.cost.byPhase.training.tokens, 2);
});
test("control-call-aware claim leases fence competitors through mutation verification and settlement", async () => {
  let clock = 0;
  let runId;
  let competitor;
  const store = createSkillEvolutionMemoryStore({ now: () => clock, tokenFactory: () => "runtime-claim" });
  const fixture = adapterFixture({ drift: () => false });
  const verifyMutation = fixture.adapter.sourceVerifier.verifyMutation;
  fixture.adapter.sourceVerifier.verifyMutation = async (payload) => {
    clock = (2 * SKILL_EVOLUTION_CONTROL_CALL_TIMEOUT_CAP_MS) + 20 + 30_000 - 1;
    competitor = await store.claim(runId, { expectedRevision: 1, owner: "competing-worker" });
    return verifyMutation(payload);
  };
  const runtime = createAuthorizedRuntime({ adapter: fixture.adapter, store, now: () => clock });
  const started = await runtime.run(spec("start", { idempotencyKey: "lease-start" }));
  runId = started.runId;
  const result = await runtime.run(transition(runId, 1, "lease-step"));
  assert.equal(result.status, "running");
  assert.equal(competitor.ok, false);
  assert.equal(competitor.code, "claim_conflict");
});
test("cancel aborts an active local step and atomically records both replays", async () => {
  let entered; const enteredCall = new Promise((resolve) => { entered = resolve; });
  let sawCancel; const cancelSeen = new Promise((resolve) => { sawCancel = resolve; });
  const fixture = adapterFixture({ drift: () => false });
  fixture.adapter.trainingExecutor.executeTraining = ({ signal }) => new Promise((_, reject) => {
    entered();
    signal.addEventListener("abort", () => {
      sawCancel(); setTimeout(() => reject(Object.assign(new Error("aborted"), { code: "canceled" })), 5);
    }, { once: true });
  });
  const runtime = createAuthorizedRuntime({ adapter: fixture.adapter });
  const started = await runtime.run(spec("start", { idempotencyKey: "active-cancel-start" }));
  const stepRequest = transition(started.runId, 1, "active-step"); const stepPromise = runtime.run(stepRequest);
  await enteredCall;
  const cancelRequest = transition(started.runId, 1, "active-cancel", "cancel");
  const cancelPromise = runtime.run(cancelRequest);
  await cancelSeen;
  const competing = await runtime.run(transition(started.runId, 1, "other-cancel", "cancel"));
  const [step, canceled] = await Promise.all([stepPromise, cancelPromise]);
  assert.equal(step.status, "canceled");
  assert.deepEqual([canceled.status, canceled.operation, canceled.revision], ["canceled", "cancel", 2]);
  assert.equal(competing.errors[0].code, "transition_in_progress");
  assert.deepEqual(canceled.errors, []);
  assert.deepEqual(await runtime.run(cancelRequest), canceled);
});
test("durable intent and deterministic call ids make a pre-commit retry spend-once", async () => {
  const baseStore = createSkillEvolutionMemoryStore();
  let failReplace = true;
  const store = {
    ...baseStore,
    async replace(...args) {
      if (failReplace) {
        failReplace = false;
        throw Object.assign(new Error("injected pre-commit crash"), { code: "injected_crash" });
      }
      return baseStore.replace(...args);
    },
  };
  const fixture = adapterFixture({ drift: () => false });
  const receipts = new Map();
  for (const [role, methods] of Object.entries({
    trainingExecutor: ["executeTraining"],
    candidate: ["proposeCandidate"],
    heldOut: ["executeValidation", "evaluateValidation"],
  })) {
    for (const method of methods) {
      const original = fixture.adapter[role][method];
      fixture.adapter[role][method] = async (payload) => {
        const prior = receipts.get(payload.call.callId);
        if (prior) return structuredClone(prior);
        const result = await original(payload);
        receipts.set(payload.call.callId, structuredClone(result));
        return result;
      };
    }
  }
  const runtime = createAuthorizedRuntime({ adapter: fixture.adapter, store });
  const started = await runtime.run(spec("start", { idempotencyKey: "crash-start" }));
  const request = transition(started.runId, 1, "crash-step");
  const crashed = await runtime.run(request);
  assert.equal(crashed.status, "failed");
  const blocked = await runtime.run(transition(started.runId, 1, "different-after-crash"));
  assert.equal(blocked.errors[0].code, "transition_in_progress");
  const retried = await runtime.run(request);
  assert.equal(retried.status, "running");
  assert.equal(fixture.calls.filter((entry) => entry.method === "executeTraining").length, 1);
  assert.equal(fixture.calls.filter((entry) => entry.method === "proposeCandidate").length, 1);
  assert.equal(receipts.size, 2);
});
test("cancel advances exactly one revision without adapter work", async () => {
  const fixture = adapterFixture({ drift: () => false });
  const runtime = createAuthorizedRuntime({ adapter: fixture.adapter });
  const started = await runtime.run(spec());
  const before = fixture.calls.length;
  const canceled = await runtime.run(transition(started.runId, 1, "cancel-1", "cancel"));
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.revision, 2);
  assert.equal(canceled.stopReason, "canceled");
  assert.equal(fixture.calls.length, before);
});
test("malformed admission returns a canonical schema-valid failure without echoing unsafe fields", async () => {
  const runtime = createSkillEvolutionRuntime();
  const result = await runtime.run({
    operation: "invented",
    invocation: { command: "/unsafe", semantics: [], bindings: [] },
    sourceRevision: "not-a-revision",
    baseline: { modelWeights: true },
  });
  const ajv = new Ajv2020({ strict: false });
  const validate = ajv.compile(buildSkillEvolutionToolDefinition().outputSchema);
  assert.equal(validate(result), true, ajv.errorsText(validate.errors));
  assert.equal(result.operation, "plan");
  assert.equal(result.sourceRevision, null);
  assert.equal(result.baseline, null);
  assert.deepEqual(result.invocation, invocation());
  assert.equal(result.modelWeightsMutated, false);

  const noisy = await runtime.run(Object.fromEntries([
    ["operation", "invented"],
    ...Array.from({ length: 200 }, (_, index) => [`unexpected${index}`, index]),
  ]));
  assert.ok(noisy.errors.length > 0 && noisy.errors.length <= 100);
  assert.equal(validate(noisy), true, ajv.errorsText(validate.errors));
});
test("mutation authorization defaults closed and runs before source verification", async () => {
  const fixture = adapterFixture({ drift: () => false });
  const runtime = createSkillEvolutionRuntime({ adapter: fixture.adapter });
  const result = await runtime.run(spec());
  assert.equal(result.status, "failed");
  assert.equal(result.errors[0].code, "unauthorized");
  assert.equal(fixture.calls.length, 0);
});
test("authorization is rechecked before returning a mutating replay", async () => {
  let allowed = true;
  let authorizationSignal;
  let sourceSignal;
  const fixture = adapterFixture({ drift: () => false });
  const verifySources = fixture.adapter.sourceVerifier.verifySources;
  fixture.adapter.sourceVerifier.verifySources = async (payload) => {
    sourceSignal = payload.signal;
    return verifySources(payload);
  };
  const runtime = createSkillEvolutionRuntime({
    adapter: fixture.adapter,
    authorize: async ({ signal }) => { authorizationSignal = signal; return allowed; },
  });
  const controller = new AbortController();
  const started = await runtime.run(spec("start", { idempotencyKey: "replay-auth-start" }), { signal: controller.signal });
  assert.equal(authorizationSignal, controller.signal);
  assert.equal(sourceSignal, controller.signal);
  const request = transition(started.runId, 1, "replay-auth-step");
  const first = await runtime.run(request);
  allowed = false;
  const replay = await runtime.run(request);
  const readableStatus = await runtime.run(statusRequest(started.runId));
  assert.equal(first.status, "running");
  assert.equal(replay.status, "failed");
  assert.equal(replay.errors[0].code, "unauthorized");
  assert.equal(readableStatus.runId, started.runId);
  assert.equal(readableStatus.status, first.status, "status remains read-only and adapter-free");
});
