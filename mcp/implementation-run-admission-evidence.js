import path from "node:path";

import { digestEvidence } from "./implementation-run-evidence.js";
import { stableJson } from "./implementation-run-store.js";

export const IMPLEMENTATION_RUN_ADMISSION_OBSERVATION_SCHEMA =
  "knowgrph-agentic-sdlc-admission-observation/v1";
export const IMPLEMENTATION_RUN_ADMISSION_OBSERVATION_RECEIPT_SCHEMA =
  "knowgrph-agentic-sdlc-admission-observation-receipt/v1";

const MECHANISM_ID =
  "knowgrph-implementation-run-supervisor/admission-observer/v1";
const LIFECYCLE_STAGES = Object.freeze([
  "admission",
  "review",
  "integration",
  "runtime",
  "candidate",
  "authorization",
  "deployment",
  "publication",
]);
const MISSING_FIELDS = Object.freeze([
  "actorIdentity",
  "authoringBaseline",
  "authoringBlockerFindings",
  "capabilityGrants",
  "dependencyAdmission",
  "dependencyClosureIdentity",
  "evaluatorIdentity",
  "evaluatorIndependence",
  "evidenceSchemaIdentity",
  "guidelinePolicyIdentity",
  "taskBudgets",
  "taskCircuitBreakers",
  "taskDependencyGraph",
  "vccTaskClosure",
]);
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const RUN_ID = /^ir_[a-f0-9]{24}$/;
const DEVICE_BRANCH =
  /^agent\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/;

const prefixedDigest = (value) => {
  const normalized = String(value || "");
  if (!SHA256.test(normalized)) {
    throw new Error("Admission observation requires an exact SHA-256 digest.");
  }
  return normalized.startsWith("sha256:")
    ? normalized
    : `sha256:${normalized}`;
};
const digestRecord = (value) => digestEvidence(stableJson(value));
const exactIsoTime = (value) => {
  const normalized = String(value || "");
  let canonical = "";
  try {
    canonical = new Date(normalized).toISOString();
  } catch {
    canonical = "";
  }
  if (!normalized || canonical !== normalized) {
    throw new Error("Admission observation requires an explicit ISO evaluationTime.");
  }
  return normalized;
};
const evidenceReferences = (state) => [
  `acos:${state.plan.acosRevision}`,
  `lease:${state.coordination.lease.epoch}:${state.coordination.lease.fenceSha}`,
  `plan:${prefixedDigest(state.planDigest)}`,
  `pull-request:${state.coordination.pullRequest.number}`,
  `source:${state.plan.sourceRevision}`,
  `spec:${prefixedDigest(state.specDigest)}`,
].sort();
const validUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

function assertObservationState(state) {
  const lease = state?.coordination?.lease;
  const pullRequest = state?.coordination?.pullRequest;
  const branchIdentity = String(state?.coordination?.branch || "")
    .match(DEVICE_BRANCH);
  if (
    !RUN_ID.test(String(state?.runId || ""))
    || !Number.isSafeInteger(state.revision) || state.revision < 1
    || !Number.isSafeInteger(state.attempt) || state.attempt < 1
    || !SHA256.test(String(state.specDigest || ""))
    || !SHA256.test(String(state.planDigest || ""))
    || !SHA.test(String(state.plan?.sourceRevision || ""))
    || !SHA.test(String(state.plan?.acosRevision || ""))
    || !state.plan?.originIdentity
    || !SHA256.test(String(state.plan?.acosScriptProof?.sha256 || ""))
    || !SHA256.test(String(state.plan?.policy?.policyDigest || ""))
    || !SHA256.test(String(state.plan?.verifierConfigDigest || ""))
    || !SHA256.test(String(state.plan?.executableProofs
      ?.find((proof) => proof.role === "runner")?.sha256 || ""))
    || state.coordination?.status !== "active"
    || !branchIdentity
    || !path.isAbsolute(String(state.coordination?.worktreePath || ""))
    || !Number.isSafeInteger(pullRequest?.number) || pullRequest.number < 1
    || !validUrl(pullRequest?.url)
    || pullRequest?.isDraft !== true
    || lease?.status !== "active"
    || lease.sessionId !== `knowgrph-${state.runId}`
    || lease.device !== branchIdentity?.[1]
    || lease.scope !== branchIdentity?.[2]
    || lease.branch !== state.coordination.branch
    || lease.worktreePath !== state.coordination.worktreePath
    || !Number.isSafeInteger(lease.epoch) || lease.epoch < 1
    || !SHA.test(String(lease.baseSha || ""))
    || !SHA.test(String(lease.fenceSha || ""))
    || lease.pullRequestUrl !== pullRequest.url
  ) {
    throw new Error(
      "Admission observation requires exact durable run, source, and active collaboration evidence.",
    );
  }
}

export function buildImplementationRunAdmissionObservation({
  state,
  evaluationTime,
}) {
  assertObservationState(state);
  const observedAt = exactIsoTime(evaluationTime);
  const lease = state.coordination.lease;
  const collaboration = {
    sessionId: lease.sessionId,
    deviceId: lease.device,
    scopeId: lease.scope,
    worktreePath: state.coordination.worktreePath,
    branchId: state.coordination.branch,
    leaseEpoch: lease.epoch,
    baseRevision: lease.baseSha,
    fenceRevision: lease.fenceSha,
    pullRequest: {
      number: state.coordination.pullRequest.number,
      url: state.coordination.pullRequest.url,
      isDraft: state.coordination.pullRequest.isDraft,
    },
  };
  const sourceFacts = {
    specDigest: prefixedDigest(state.specDigest),
    planDigest: prefixedDigest(state.planDigest),
    sourceRevision: state.plan.sourceRevision,
    originIdentityDigest: digestRecord(state.plan.originIdentity),
    dependencyClosureDigest: null,
    acosRevision: state.plan.acosRevision,
    acosDeviceScriptDigest: prefixedDigest(state.plan.acosScriptProof?.sha256),
    sandboxPolicyDigest: prefixedDigest(state.plan.policy.policyDigest),
    runnerExecutableDigest: prefixedDigest(
      state.plan.executableProofs?.find((proof) => proof.role === "runner")?.sha256,
    ),
    verifierConfigurationDigest: prefixedDigest(
      state.plan.verifierConfigDigest,
    ),
    collaboration,
  };
  const operationInput = {
    runId: state.runId,
    runRevision: state.revision,
    attempt: state.attempt,
    requestedStage: "admission",
    evaluationTime: observedAt,
    sourceFacts,
  };
  const operationResult = {
    status: "unevaluated",
    code: "AGENTIC_SDLC_EVIDENCE_ADAPTER_UNAVAILABLE",
    coordination: state.coordination,
    inventoryComplete: false,
    missingFields: [...MISSING_FIELDS],
  };
  return Object.freeze({
    schema: IMPLEMENTATION_RUN_ADMISSION_OBSERVATION_SCHEMA,
    runId: state.runId,
    requestedStage: "admission",
    evaluationTime: observedAt,
    status: "unevaluated",
    enforcedStages: [],
    unevaluatedStages: [...LIFECYCLE_STAGES],
    inventoryComplete: false,
    sourceFacts,
    operations: [{
      operationId:
        `${state.runId}:admission:a${state.attempt}:r${state.revision}`,
      stage: "admission",
      mechanismId: MECHANISM_ID,
      actorRole: "orchestrator",
      inputDigest: digestRecord(operationInput),
      resultDigest: digestRecord(operationResult),
      terminalResult: {
        status: operationResult.status,
        code: operationResult.code,
      },
      evidenceReferences: evidenceReferences(state),
    }],
    predecessorReceipts: [],
    missingFields: [...MISSING_FIELDS],
  });
}

function describeObservationArtifact(state, content) {
  const digest = digestEvidence(content);
  const artifact = [
    "agentic-sdlc-admission",
    `a${String(state.attempt).padStart(4, "0")}`,
    `r${String(state.revision).padStart(10, "0")}`,
    digest.slice("sha256:".length, "sha256:".length + 16),
    "json",
  ].join(".");
  return {
    artifact,
    digest,
    bytes: Buffer.byteLength(content),
  };
}

async function persistObservation({
  store,
  runId,
  supervisorToken,
  content,
  artifact,
}) {
  try {
    await store.writeArtifact(
      runId,
      artifact.artifact,
      content,
      { supervisorToken },
    );
  } catch (error) {
    if (error?.code !== "ARTIFACT_EXISTS") throw error;
    await store.readArtifact(runId, artifact.artifact, {
      expectedDigest: artifact.digest,
      expectedBytes: artifact.bytes,
      requireUtf8: true,
    });
  }
  return artifact;
}

export const implementationRunAdmissionResultFields = (result) =>
  result?.agenticSdlcAdmissionObservation
    ? {
        agenticSdlcAdmissionObservation:
          result.agenticSdlcAdmissionObservation,
      }
    : {};

const admissionUnavailable = (
  receipt,
  message = "Agentic SDLC admission is unevaluated: the exact policy, evaluator, schema, dependency closure, and authoring evidence adapters are unavailable.",
) => Object.assign(
  new Error(message),
  {
    code: "AGENTIC_SDLC_EVIDENCE_ADAPTER_UNAVAILABLE",
    receipt,
  },
);

function createObservationReceipt({
  state,
  observation,
  artifact,
  artifactStatus,
}) {
  return Object.freeze({
    schema: IMPLEMENTATION_RUN_ADMISSION_OBSERVATION_RECEIPT_SCHEMA,
    runId: state.runId,
    ...artifact,
    artifactStatus,
    runRevision: state.revision,
    attempt: state.attempt,
    evaluationTime: observation.evaluationTime,
    requestedStage: observation.requestedStage,
    status: observation.status,
    enforcedStages: observation.enforcedStages,
    unevaluatedStages: observation.unevaluatedStages,
    inventoryComplete: observation.inventoryComplete,
    missingFields: observation.missingFields,
  });
}

function assertObservationReceipt(state, receipt) {
  let validEvaluationTime = false;
  try {
    validEvaluationTime =
      exactIsoTime(receipt?.evaluationTime) === receipt?.evaluationTime;
  } catch {
    validEvaluationTime = false;
  }
  if (
    receipt?.schema !== IMPLEMENTATION_RUN_ADMISSION_OBSERVATION_RECEIPT_SCHEMA
    || receipt.runId !== state.runId
    || !["pending", "bound"].includes(receipt.artifactStatus)
    || !Number.isSafeInteger(receipt.runRevision) || receipt.runRevision < 1
    || !Number.isSafeInteger(receipt.attempt) || receipt.attempt < 1
    || !validEvaluationTime
    || receipt.requestedStage !== "admission"
    || receipt.status !== "unevaluated"
    || receipt.inventoryComplete !== false
    || !/^[a-z0-9][a-z0-9._-]{0,119}$/.test(String(receipt.artifact || ""))
    || !SHA256.test(String(receipt.digest || ""))
    || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 1
    || JSON.stringify(receipt.enforcedStages) !== "[]"
    || JSON.stringify(receipt.unevaluatedStages) !== JSON.stringify(LIFECYCLE_STAGES)
    || JSON.stringify(receipt.missingFields) !== JSON.stringify(MISSING_FIELDS)
  ) {
    throw admissionUnavailable(
      receipt,
      "Agentic SDLC admission observation recovery found an invalid durable receipt.",
    );
  }
  return receipt;
}

const pendingObservation = (current) =>
  current.agenticSdlcAdmissionObservationPending;

const assertSameReceipt = (left, right) => {
  if (stableJson(left) !== stableJson(right)) {
    throw admissionUnavailable(
      right,
      "Agentic SDLC admission observation ownership changed before artifact binding.",
    );
  }
};

const storeObservationReceipt = (current, receipt) => {
  current.result = {
    ...(current.result || {}),
    agenticSdlcAdmissionObservation: receipt,
  };
  delete current.agenticSdlcAdmissionObservationPending;
  return current;
};

export async function bindImplementationRunAdmissionObservation({
  state,
  store,
  runId,
  supervisorToken,
  evaluationTime,
  updateOwned,
}) {
  if (!state.spec.agenticSdlcLedgerPath) return state;
  const observation = buildImplementationRunAdmissionObservation({
    state,
    evaluationTime,
  });
  const content = `${stableJson(observation)}\n`;
  const artifact = describeObservationArtifact(state, content);
  const pendingReceipt = createObservationReceipt({
    state,
    observation,
    artifact,
    artifactStatus: "pending",
  });
  await updateOwned(
    "agentic_sdlc.admission_observation_pending",
    pendingReceipt,
    (current) => {
      current.result = {
        ...(current.result || {}),
        agenticSdlcAdmissionObservation: pendingReceipt,
      };
      current.agenticSdlcAdmissionObservationPending = {
        receipt: pendingReceipt,
        content,
      };
      return current;
    },
  );
  await persistObservation({
    store,
    runId,
    supervisorToken,
    content,
    artifact,
  });
  const receipt = createObservationReceipt({
    state,
    observation,
    artifact,
    artifactStatus: "bound",
  });
  await updateOwned(
    "agentic_sdlc.admission_observed",
    receipt,
    (current) => {
      assertSameReceipt(pendingObservation(current)?.receipt, pendingReceipt);
      return storeObservationReceipt(current, receipt);
    },
  );
  throw admissionUnavailable(receipt);
}

export async function reconcileImplementationRunAdmissionObservation({
  state,
  store,
  runId,
  supervisorToken,
  updateOwned,
}) {
  if (!state.spec.agenticSdlcLedgerPath) return state;
  const receipt = state.result?.agenticSdlcAdmissionObservation;
  const pending = pendingObservation(state);
  if (!receipt && !pending) return state;
  if (!receipt || !pending && receipt.artifactStatus !== "bound") {
    throw admissionUnavailable(
      receipt,
      "Agentic SDLC admission observation recovery found an incomplete durable intent.",
    );
  }
  assertObservationReceipt(state, receipt);
  if (receipt.artifactStatus === "bound") {
    if (pending) {
      throw admissionUnavailable(
        receipt,
        "Agentic SDLC admission observation recovery found a bound receipt with stale pending content.",
      );
    }
    try {
      await store.readArtifact(runId, receipt.artifact, {
        expectedDigest: receipt.digest,
        expectedBytes: receipt.bytes,
        requireUtf8: true,
      });
    } catch (error) {
      throw admissionUnavailable(
        receipt,
        `Agentic SDLC admission observation artifact integrity cannot be proven: ${error.message}`,
      );
    }
    throw admissionUnavailable(receipt);
  }
  assertSameReceipt(pending.receipt, receipt);
  if (typeof pending.content !== "string") {
    throw admissionUnavailable(
      receipt,
      "Agentic SDLC admission observation recovery found invalid pending content.",
    );
  }
  const artifact = describeObservationArtifact(
    { attempt: receipt.attempt, revision: receipt.runRevision },
    pending.content,
  );
  if (
    artifact.artifact !== receipt.artifact
    || artifact.digest !== receipt.digest
    || artifact.bytes !== receipt.bytes
  ) {
    throw admissionUnavailable(
      receipt,
      "Agentic SDLC admission observation recovery found a pending artifact identity mismatch.",
    );
  }
  let observation;
  try {
    observation = JSON.parse(pending.content);
  } catch {
    observation = null;
  }
  if (
    observation?.schema !== IMPLEMENTATION_RUN_ADMISSION_OBSERVATION_SCHEMA
    || observation.runId !== state.runId
    || observation.evaluationTime !== receipt.evaluationTime
  ) {
    throw admissionUnavailable(
      receipt,
      "Agentic SDLC admission observation recovery found invalid sealed observation content.",
    );
  }
  await persistObservation({
    store,
    runId,
    supervisorToken,
    content: pending.content,
    artifact,
  });
  const boundReceipt = Object.freeze({
    ...receipt,
    artifactStatus: "bound",
  });
  await updateOwned(
    "agentic_sdlc.admission_observed",
    boundReceipt,
    (current) => {
      assertSameReceipt(pendingObservation(current)?.receipt, receipt);
      return storeObservationReceipt(current, boundReceipt);
    },
  );
  throw admissionUnavailable(boundReceipt);
}

export async function settleImplementationRunAdmissionUnavailable({
  state,
  message,
  park,
  updateOwned,
}) {
  const parked = state.coordination?.status === "parked"
    ? state.coordination
    : await park(state);
  return updateOwned(
    "run.failed",
    {
      code: "agentic_sdlc_admission_unavailable",
      parked: parked?.ok === true,
    },
    (current) => {
      const action = ["pause", "cancel"].includes(current.control?.action)
        ? current.control.action
        : "";
      const cleanupOk = parked?.ok === true;
      current.state = cleanupOk
        ? action === "pause"
          ? "paused"
          : action === "cancel"
            ? "canceled"
            : "blocked"
        : "blocked";
      current.error = cleanupOk
        ? {
            code: action
              ? `operator_${action}`
              : "agentic_sdlc_admission_unavailable",
            message: action
              ? `Run ${action} request applied after the admission observation.`
              : message,
          }
        : {
            code: "coordination_cleanup_failed",
            message:
              `${message} Cleanup also failed: ${parked?.error?.message || "unknown park failure"}`,
          };
      current.result = {
        ...(current.result || {}),
        parked,
        controlDispositionPending: null,
      };
      if (cleanupOk) current.coordination = parked;
      current.supervisor.status = "stopped";
      return current;
    },
  );
}
