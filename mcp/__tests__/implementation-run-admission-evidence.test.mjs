import assert from "node:assert/strict";
import test from "node:test";

import {
  IMPLEMENTATION_RUN_ADMISSION_OBSERVATION_RECEIPT_SCHEMA,
  IMPLEMENTATION_RUN_ADMISSION_OBSERVATION_SCHEMA,
  bindImplementationRunAdmissionObservation,
  buildImplementationRunAdmissionObservation,
  implementationRunAdmissionResultFields,
  reconcileImplementationRunAdmissionObservation,
} from "../implementation-run-admission-evidence.js";
import { digestEvidence } from "../implementation-run-evidence.js";

const runId = "ir_0123456789abcdef01234567";
const supervisorToken = "supervisor-token";
const evaluationTime = "2026-07-30T02:00:00.000Z";
const branch = "agent/device/admission-observation";
const worktreePath = "/workspace/.worktrees/project/admission-observation";

function state({ ledger = true } = {}) {
  return {
    runId,
    revision: 12,
    attempt: 1,
    specDigest: "1".repeat(64),
    planDigest: "2".repeat(64),
    spec: {
      ...(ledger ? {
        agenticSdlcLedgerPath: "evidence/agentic-sdlc-run.json",
      } : {}),
    },
    plan: {
      sourceRevision: "a".repeat(40),
      originIdentity: {
        fetchUrls: ["https://github.com/example/project.git"],
        pushUrls: ["https://github.com/example/project.git"],
      },
      acosRevision: "b".repeat(40),
      acosScriptProof: { sha256: "3".repeat(64) },
      executableProofs: [
        { role: "runner", sha256: "4".repeat(64) },
      ],
      verifierConfigDigest: "5".repeat(64),
      policy: { policyDigest: "6".repeat(64) },
    },
    coordination: {
      status: "active",
      branch,
      worktreePath,
      pullRequest: {
        number: 42,
        url: "https://github.com/example/project/pull/42",
        isDraft: true,
      },
      lease: {
        status: "active",
        sessionId: `knowgrph-${runId}`,
        device: "device",
        scope: "admission-observation",
        branch,
        worktreePath,
        epoch: 7,
        baseSha: "a".repeat(40),
        fenceSha: "c".repeat(40),
        pullRequestUrl: "https://github.com/example/project/pull/42",
      },
    },
    supervisor: { token: supervisorToken },
    result: null,
  };
}

function harness(initialState, { failFirstWrite = false } = {}) {
  const artifacts = new Map();
  const events = [];
  let current = structuredClone(initialState);
  let rejectWrite = failFirstWrite;
  return {
    artifacts,
    events,
    get current() {
      return current;
    },
    store: {
      async writeArtifact(observedRunId, artifact, content, options) {
        assert.equal(observedRunId, runId);
        assert.equal(options.supervisorToken, supervisorToken);
        if (rejectWrite) {
          rejectWrite = false;
          throw new Error("simulated crash before artifact write");
        }
        if (artifacts.has(artifact)) {
          throw Object.assign(new Error("immutable"), {
            code: "ARTIFACT_EXISTS",
          });
        }
        artifacts.set(artifact, String(content));
        return `/artifacts/${artifact}`;
      },
      async readArtifact(observedRunId, artifact, expected) {
        assert.equal(observedRunId, runId);
        const content = artifacts.get(artifact);
        assert.equal(expected.expectedDigest, digestEvidence(content));
        assert.equal(expected.expectedBytes, Buffer.byteLength(content));
        assert.equal(expected.requireUtf8, true);
        return { artifact, content };
      },
    },
    async updateOwned(eventType, eventData, mutate) {
      events.push({ eventType, eventData });
      current = mutate(structuredClone(current));
      current.revision += 1;
      return structuredClone(current);
    },
  };
}

test("admission observation deterministically maps only host-observed run facts", () => {
  const input = state();
  const observation = buildImplementationRunAdmissionObservation({
    state: input,
    evaluationTime,
  });
  assert.deepEqual(
    buildImplementationRunAdmissionObservation({
      state: structuredClone(input),
      evaluationTime,
    }),
    observation,
  );
  assert.equal(
    observation.schema,
    IMPLEMENTATION_RUN_ADMISSION_OBSERVATION_SCHEMA,
  );
  assert.equal(observation.status, "unevaluated");
  assert.equal(observation.inventoryComplete, false);
  assert.deepEqual(observation.enforcedStages, []);
  assert.deepEqual(observation.unevaluatedStages, [
    "admission",
    "review",
    "integration",
    "runtime",
    "candidate",
    "authorization",
    "deployment",
    "publication",
  ]);
  assert.deepEqual(
    observation.missingFields,
    [...observation.missingFields].sort(),
  );
  assert.equal(observation.sourceFacts.sourceRevision, "a".repeat(40));
  assert.equal(observation.sourceFacts.dependencyClosureDigest, null);
  assert.deepEqual(observation.sourceFacts.collaboration, {
    sessionId: `knowgrph-${runId}`,
    deviceId: "device",
    scopeId: "admission-observation",
    worktreePath,
    branchId: branch,
    leaseEpoch: 7,
    baseRevision: "a".repeat(40),
    fenceRevision: "c".repeat(40),
    pullRequest: {
      number: 42,
      url: "https://github.com/example/project/pull/42",
      isDraft: true,
    },
  });
  assert.match(observation.operations[0].inputDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(observation.operations[0].resultDigest, /^sha256:[a-f0-9]{64}$/);
  const changedResult = structuredClone(input);
  changedResult.coordination.pullRequest.url =
    "https://github.com/example/project/pull/43";
  changedResult.coordination.lease.pullRequestUrl =
    changedResult.coordination.pullRequest.url;
  assert.notEqual(
    buildImplementationRunAdmissionObservation({
      state: changedResult,
      evaluationTime,
    }).operations[0].resultDigest,
    observation.operations[0].resultDigest,
  );
  assert.notEqual(
    buildImplementationRunAdmissionObservation({
      state: changedResult,
      evaluationTime,
    }).operations[0].inputDigest,
    observation.operations[0].inputDigest,
  );
  const changedCoordinationResult = structuredClone(input);
  changedCoordinationResult.coordination.lease.heartbeatAt =
    "2026-07-30T01:59:00.000Z";
  const changedCoordinationObservation =
    buildImplementationRunAdmissionObservation({
      state: changedCoordinationResult,
      evaluationTime,
    });
  assert.equal(
    changedCoordinationObservation.operations[0].inputDigest,
    observation.operations[0].inputDigest,
  );
  assert.notEqual(
    changedCoordinationObservation.operations[0].resultDigest,
    observation.operations[0].resultDigest,
  );
  assert.equal(
    observation.operations[0].terminalResult.code,
    "AGENTIC_SDLC_EVIDENCE_ADAPTER_UNAVAILABLE",
  );
  assert.equal("receipt" in observation, false);
  assert.deepEqual(observation.predecessorReceipts, []);
  const continuedLease = structuredClone(input);
  continuedLease.coordination.lease.baseSha = "d".repeat(40);
  assert.equal(
    buildImplementationRunAdmissionObservation({
      state: continuedLease,
      evaluationTime,
    }).sourceFacts.collaboration.baseRevision,
    "d".repeat(40),
  );
  assert.throws(
    () => buildImplementationRunAdmissionObservation({
      state: input,
      evaluationTime: "not-a-time",
    }),
  );
  const malformed = structuredClone(input);
  malformed.plan.verifierConfigDigest = "not-a-digest";
  assert.throws(
    () => buildImplementationRunAdmissionObservation({
      state: malformed,
      evaluationTime,
    }),
    /exact durable run, source, and active collaboration evidence/,
  );
});

test("binder persists an immutable receipt before failing closed", async () => {
  const input = state();
  const fx = harness(input);
  await assert.rejects(
    bindImplementationRunAdmissionObservation({
      state: input,
      store: fx.store,
      runId,
      supervisorToken,
      evaluationTime,
      updateOwned: fx.updateOwned.bind(fx),
    }),
    (error) =>
      error.code === "AGENTIC_SDLC_EVIDENCE_ADAPTER_UNAVAILABLE"
      && error.receipt.status === "unevaluated",
  );
  assert.equal(fx.artifacts.size, 1);
  assert.equal(fx.events.length, 2);
  assert.equal(
    fx.events[0].eventType,
    "agentic_sdlc.admission_observation_pending",
  );
  assert.equal(fx.events[0].eventData.artifactStatus, "pending");
  assert.equal(fx.events[1].eventType, "agentic_sdlc.admission_observed");
  const receipt = fx.current.result.agenticSdlcAdmissionObservation;
  assert.equal(
    receipt.schema,
    IMPLEMENTATION_RUN_ADMISSION_OBSERVATION_RECEIPT_SCHEMA,
  );
  assert.equal(receipt.runId, runId);
  assert.equal(receipt.artifactStatus, "bound");
  assert.equal(receipt.inventoryComplete, false);
  assert.match(
    receipt.artifact,
    /^agentic-sdlc-admission\.a0001\.r0000000012\.[a-f0-9]{16}\.json$/,
  );
  assert.equal(
    receipt.digest,
    digestEvidence(fx.artifacts.get(receipt.artifact)),
  );
  assert.deepEqual(implementationRunAdmissionResultFields(fx.current.result), {
    agenticSdlcAdmissionObservation: receipt,
  });
  assert.equal("verdict" in receipt, false);
  assert.equal("receiptDigest" in receipt, false);

  await assert.rejects(
    bindImplementationRunAdmissionObservation({
      state: input,
      store: fx.store,
      runId,
      supervisorToken,
      evaluationTime,
      updateOwned: fx.updateOwned.bind(fx),
    }),
    (error) => error.code === "AGENTIC_SDLC_EVIDENCE_ADAPTER_UNAVAILABLE",
  );
  assert.equal(fx.artifacts.size, 1);
  assert.equal(fx.events.length, 4);
});

test("pending observation recovery binds the exact sealed artifact", async () => {
  const input = state();
  const interrupted = harness(input, { failFirstWrite: true });
  await assert.rejects(
    bindImplementationRunAdmissionObservation({
      state: input,
      store: interrupted.store,
      runId,
      supervisorToken,
      evaluationTime,
      updateOwned: interrupted.updateOwned.bind(interrupted),
    }),
    /simulated crash before artifact write/,
  );
  assert.equal(interrupted.artifacts.size, 0);
  assert.equal(
    interrupted.current.result.agenticSdlcAdmissionObservation.artifactStatus,
    "pending",
  );
  assert.equal(
    typeof interrupted.current.agenticSdlcAdmissionObservationPending.content,
    "string",
  );

  const recovered = harness(interrupted.current);
  await assert.rejects(
    reconcileImplementationRunAdmissionObservation({
      state: interrupted.current,
      store: recovered.store,
      runId,
      supervisorToken,
      updateOwned: recovered.updateOwned.bind(recovered),
    }),
    (error) =>
      error.code === "AGENTIC_SDLC_EVIDENCE_ADAPTER_UNAVAILABLE"
      && error.receipt.artifactStatus === "bound",
  );
  assert.equal(recovered.artifacts.size, 1);
  assert.equal(recovered.events.length, 1);
  assert.equal(
    recovered.events[0].eventType,
    "agentic_sdlc.admission_observed",
  );
  assert.equal(
    recovered.current.result.agenticSdlcAdmissionObservation.artifactStatus,
    "bound",
  );
  assert.equal(
    "agenticSdlcAdmissionObservationPending" in recovered.current,
    false,
  );
});

test("bound observation recovery revalidates immutable artifact bytes", async () => {
  for (const failure of ["missing", "corrupt"]) {
    const input = state();
    const fx = harness(input);
    await assert.rejects(
      bindImplementationRunAdmissionObservation({
        state: input,
        store: fx.store,
        runId,
        supervisorToken,
        evaluationTime,
        updateOwned: fx.updateOwned.bind(fx),
      }),
      (error) => error.code === "AGENTIC_SDLC_EVIDENCE_ADAPTER_UNAVAILABLE",
    );
    const receipt = fx.current.result.agenticSdlcAdmissionObservation;
    if (failure === "missing") fx.artifacts.delete(receipt.artifact);
    else fx.artifacts.set(receipt.artifact, "corrupt\n");
    await assert.rejects(
      reconcileImplementationRunAdmissionObservation({
        state: fx.current,
        store: fx.store,
        runId,
        supervisorToken,
        updateOwned: fx.updateOwned.bind(fx),
      }),
      (error) =>
        error.code === "AGENTIC_SDLC_EVIDENCE_ADAPTER_UNAVAILABLE"
        && /artifact integrity cannot be proven/.test(error.message),
    );
  }
});

test("runs outside the conformance boundary are unchanged", async () => {
  const input = state({ ledger: false });
  const fx = harness(input);
  assert.equal(
    await bindImplementationRunAdmissionObservation({
      state: input,
      store: fx.store,
      runId,
      supervisorToken,
      evaluationTime,
      updateOwned: fx.updateOwned.bind(fx),
    }),
    input,
  );
  assert.equal(fx.artifacts.size, 0);
  assert.equal(fx.events.length, 0);
});
