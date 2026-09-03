import { createHash } from "node:crypto";

export const DEPLOYMENT_RECEIPT_SCHEMA = "agentic-deployment-receipt/v1";
export const STATE_RECONCILIATION_RECEIPT_SCHEMA =
  "agentic-state-reconciliation-receipt/v1";
export const LIVE_VERIFICATION_RECEIPT_SCHEMA =
  "agentic-live-verification-receipt/v1";
export const LIVE_VERIFICATION_RECEIPT_V2_SCHEMA =
  "agentic-live-verification-receipt/v2";
export const PUBLICATION_RECEIPT_SCHEMA = "agentic-publication-receipt/v1";
export const PUBLICATION_RECEIPT_V2_SCHEMA = "agentic-publication-receipt/v2";
export const ROLLBACK_RECEIPT_SCHEMA = "agentic-rollback-receipt/v1";

const CANDIDATE_MANIFEST_SCHEMA = "agentic-candidate-manifest/v1";
const HUMAN_AUTHORIZATION_RECEIPT_SCHEMA =
  "agentic-human-authorization-receipt/v2";
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const STATE_COUNT_FIELDS = ["documentCount", "chunkCount", "graphCount"];
const MAX_STATE_OPERATIONS = 10_000;
const ROLLBACK_FAILURE_STAGES = [
  "deployment",
  "state-reconciliation",
  "live-verification",
  "publication",
  "receipt-persistence",
];

export function createDeploymentReceipt(candidate, consumedAuthorization, input) {
  validateDeploymentCandidateManifest(candidate);
  validateConsumedDeploymentAuthorizationReceipt(consumedAuthorization);
  requireExact(input, [
    "deploymentAdapterId",
    "deployedArtifactDigest",
    "immutableDeploymentId",
    "immutableDeploymentOrigin",
    "rollbackTargetDigest",
    "deployedAt",
  ], "Deployment Receipt input");
  requireText(input.deploymentAdapterId, "deploymentAdapterId");
  requireText(input.immutableDeploymentId, "immutableDeploymentId");
  requireText(input.immutableDeploymentOrigin, "immutableDeploymentOrigin");
  requireDigest(input.deployedArtifactDigest, "deployedArtifactDigest");
  requireDigest(input.rollbackTargetDigest, "rollbackTargetDigest");
  requireInstant(input.deployedAt, "deployedAt");
  if (
    consumedAuthorization.candidateDigest !== candidate.receiptDigest
    || consumedAuthorization.targetDigest !== candidate.targetDigest
    || consumedAuthorization.releaseKey !== releaseKey(candidate)
  ) {
    throw new Error("Deployment authorization is unjoined from its candidate or target.");
  }
  if (Date.parse(consumedAuthorization.consumedAt) > Date.parse(consumedAuthorization.expiresAt)) {
    throw new Error("Deployment authorization was consumed after expiry.");
  }
  if (Date.parse(input.deployedAt) < Date.parse(consumedAuthorization.consumedAt)) {
    throw new Error("Deployment cannot predate authorization consumption.");
  }
  if (
    input.deployedArtifactDigest !== candidate.artifactDigest
    || input.rollbackTargetDigest !== candidate.rollbackTargetDigest
  ) {
    throw new Error("Deployment artifact or rollback target drifted from the candidate.");
  }
  return receipt({
    schema: DEPLOYMENT_RECEIPT_SCHEMA,
    status: "deployed",
    consumedAuthorizationReceiptDigest: consumedAuthorization.receiptDigest,
    candidateDigest: candidate.receiptDigest,
    targetDigest: candidate.targetDigest,
    releaseKey: consumedAuthorization.releaseKey,
    controllerId: consumedAuthorization.controllerId,
    ...input,
  });
}

export function createStateReconciliationReceipt(deployment, input) {
  validateDeploymentReceipt(deployment);
  requireExact(input, [
    "stateContractDigest",
    "operationsDigest",
    "operationCount",
    "operationLimit",
    "readbackAdapterId",
    "readbackKind",
    "readbackDigest",
    "expectedCounts",
    "observedCounts",
    "pathHashParity",
    "contentParity",
    "reconciledAt",
  ], "State Reconciliation Receipt input");
  for (const field of ["stateContractDigest", "operationsDigest", "readbackDigest"]) {
    requireDigest(input[field], field);
  }
  requireText(input.readbackAdapterId, "readbackAdapterId");
  requireStateOperationBounds(input.operationCount, input.operationLimit);
  requireExactText(input.readbackKind, "direct-authoritative", "readbackKind");
  const expectedCounts = normalizeStateCounts(input.expectedCounts, "expectedCounts");
  const observedCounts = normalizeStateCounts(input.observedCounts, "observedCounts");
  for (const field of STATE_COUNT_FIELDS) {
    if (expectedCounts[field] !== observedCounts[field]) {
      throw new Error(`State reconciliation ${field} does not match direct readback.`);
    }
  }
  requireTrue(input.pathHashParity, "pathHashParity");
  requireTrue(input.contentParity, "contentParity");
  requireInstant(input.reconciledAt, "reconciledAt");
  if (Date.parse(input.reconciledAt) < Date.parse(deployment.deployedAt)) {
    throw new Error("State reconciliation cannot predate deployment.");
  }
  return receipt({
    schema: STATE_RECONCILIATION_RECEIPT_SCHEMA,
    status: "reconciled",
    deploymentReceiptDigest: deployment.receiptDigest,
    candidateDigest: deployment.candidateDigest,
    targetDigest: deployment.targetDigest,
    controllerId: deployment.controllerId,
    ...input,
    expectedCounts,
    observedCounts,
  });
}

export function createLegacyLiveObservationReceipt(consumedAuthorization, input) {
  validateConsumedDeploymentAuthorizationReceipt(consumedAuthorization);
  requireExact(input, [
    "deployedArtifactDigest",
    "observedRuntimeDigest",
    "probesDigest",
    "rollbackTargetDigest",
    "verifiedAt",
  ], "Legacy Live Verification Receipt input");
  for (const field of [
    "deployedArtifactDigest", "observedRuntimeDigest", "probesDigest", "rollbackTargetDigest",
  ]) requireDigest(input[field], field);
  requireInstant(input.verifiedAt, "verifiedAt");
  if (Date.parse(input.verifiedAt) < Date.parse(consumedAuthorization.consumedAt)) {
    throw new Error("Legacy live observation cannot predate authorization consumption.");
  }
  return receipt({
    schema: LIVE_VERIFICATION_RECEIPT_SCHEMA,
    status: "verified",
    authorizationReceiptDigest: consumedAuthorization.receiptDigest,
    candidateDigest: consumedAuthorization.candidateDigest,
    targetDigest: consumedAuthorization.targetDigest,
    controllerId: consumedAuthorization.controllerId,
    ...input,
  });
}

export function createLiveVerificationReceipt(consumedAuthorization, input) {
  return createLegacyLiveObservationReceipt(consumedAuthorization, input);
}

export function createLiveVerificationReceiptV2(deployment, stateReconciliation, input) {
  validateDeploymentReceipt(deployment);
  validateStateReconciliationReceipt(stateReconciliation);
  assertStateJoinsDeployment(deployment, stateReconciliation);
  requireExact(input, [
    "observedRuntimeDigest",
    "immutableOriginProbesDigest",
    "publicRouteProbesDigest",
    "browserFidelityDigest",
    "clientCacheConvergenceDigest",
    "markerParityDigest",
    "markerBytesParity",
    "verifiedAt",
  ], "Live Verification Receipt input");
  for (const field of [
    "observedRuntimeDigest",
    "immutableOriginProbesDigest",
    "publicRouteProbesDigest",
    "browserFidelityDigest",
    "clientCacheConvergenceDigest",
    "markerParityDigest",
  ]) requireDigest(input[field], field);
  requireTrue(input.markerBytesParity, "markerBytesParity");
  requireInstant(input.verifiedAt, "verifiedAt");
  if (Date.parse(input.verifiedAt) < Date.parse(stateReconciliation.reconciledAt)) {
    throw new Error("Live verification cannot predate state reconciliation.");
  }
  return receipt({
    schema: LIVE_VERIFICATION_RECEIPT_V2_SCHEMA,
    status: "verified",
    deploymentReceiptDigest: deployment.receiptDigest,
    stateReconciliationReceiptDigest: stateReconciliation.receiptDigest,
    candidateDigest: deployment.candidateDigest,
    targetDigest: deployment.targetDigest,
    controllerId: deployment.controllerId,
    deployedArtifactDigest: deployment.deployedArtifactDigest,
    rollbackTargetDigest: deployment.rollbackTargetDigest,
    ...input,
  });
}

export function createLegacyPublicationObservationReceipt(liveVerification, input) {
  validateLiveVerificationReceipt(liveVerification);
  return createJoinedPublicationReceipt(liveVerification, input, PUBLICATION_RECEIPT_SCHEMA);
}

export function createPublicationReceipt(liveVerification, input) {
  return createLegacyPublicationObservationReceipt(liveVerification, input);
}

export function createPublicationReceiptV2(liveVerification, input) {
  validateLiveVerificationReceiptV2(liveVerification);
  return createJoinedPublicationReceipt(liveVerification, input, PUBLICATION_RECEIPT_V2_SCHEMA);
}

function createJoinedPublicationReceipt(liveVerification, input, schema) {
  requireExact(input, ["publicationIdentitiesDigest", "publishedAt"], "Publication Receipt input");
  requireDigest(input.publicationIdentitiesDigest, "publicationIdentitiesDigest");
  requireInstant(input.publishedAt, "publishedAt");
  if (Date.parse(input.publishedAt) < Date.parse(liveVerification.verifiedAt)) {
    throw new Error("Publication cannot predate live verification.");
  }
  return receipt({
    schema,
    status: "published",
    liveVerificationReceiptDigest: liveVerification.receiptDigest,
    candidateDigest: liveVerification.candidateDigest,
    targetDigest: liveVerification.targetDigest,
    publicationIdentitiesDigest: input.publicationIdentitiesDigest,
    publishedAt: input.publishedAt,
  });
}

export function createRollbackReceipt(deployment, input) {
  validateDeploymentReceipt(deployment);
  requireExact(input, [
    "failedStage",
    "failureDigest",
    "lastKnownGoodIdentityDigest",
    "restoredDeploymentIdentityDigest",
    "stateDisposition",
    "stateDispositionDigest",
    "restoredProbesDigest",
    "mirrorDisposition",
    "lastKnownGoodMirrorIdentityDigest",
    "observedMirrorIdentityDigest",
    "terminalResult",
    "rolledBackAt",
  ], "Rollback Receipt input");
  requireEnum(input.failedStage, ROLLBACK_FAILURE_STAGES, "failedStage");
  for (const field of [
    "failureDigest",
    "lastKnownGoodIdentityDigest",
    "restoredDeploymentIdentityDigest",
    "stateDispositionDigest",
    "restoredProbesDigest",
    "lastKnownGoodMirrorIdentityDigest",
    "observedMirrorIdentityDigest",
  ]) requireDigest(input[field], field);
  requireEnum(input.stateDisposition, ["restored", "retained-compatible"], "stateDisposition");
  requireExactText(
    input.mirrorDisposition,
    "unchanged-last-known-good",
    "mirrorDisposition",
  );
  requireExactText(
    input.terminalResult,
    "restored-last-known-good",
    "terminalResult",
  );
  requireInstant(input.rolledBackAt, "rolledBackAt");
  if (
    input.lastKnownGoodIdentityDigest !== deployment.rollbackTargetDigest
    || input.restoredDeploymentIdentityDigest !== input.lastKnownGoodIdentityDigest
  ) {
    throw new Error("Rollback did not restore the deployment's exact last-known-good identity.");
  }
  if (input.observedMirrorIdentityDigest !== input.lastKnownGoodMirrorIdentityDigest) {
    throw new Error("Rollback advanced the mirror beyond its last-known-good identity.");
  }
  if (Date.parse(input.rolledBackAt) < Date.parse(deployment.deployedAt)) {
    throw new Error("Rollback cannot predate deployment.");
  }
  return receipt({
    schema: ROLLBACK_RECEIPT_SCHEMA,
    status: "rolled-back",
    deploymentReceiptDigest: deployment.receiptDigest,
    candidateDigest: deployment.candidateDigest,
    targetDigest: deployment.targetDigest,
    controllerId: deployment.controllerId,
    deployedArtifactDigest: deployment.deployedArtifactDigest,
    rollbackTargetDigest: deployment.rollbackTargetDigest,
    ...input,
  });
}

export function validateDeploymentReceipt(value) {
  validateReceipt(value, DEPLOYMENT_RECEIPT_SCHEMA, "deployed", [
    "consumedAuthorizationReceiptDigest", "candidateDigest", "targetDigest",
    "releaseKey", "controllerId", "deploymentAdapterId", "deployedArtifactDigest",
    "immutableDeploymentId", "immutableDeploymentOrigin", "rollbackTargetDigest", "deployedAt",
  ]);
  for (const field of [
    "consumedAuthorizationReceiptDigest", "candidateDigest", "targetDigest", "releaseKey",
    "deployedArtifactDigest", "rollbackTargetDigest",
  ]) requireDigest(value[field], field);
  for (const field of [
    "controllerId", "deploymentAdapterId", "immutableDeploymentId", "immutableDeploymentOrigin",
  ]) requireText(value[field], field);
  requireInstant(value.deployedAt, "deployedAt");
  if (value.releaseKey !== digest({
    targetDigest: value.targetDigest,
    candidateDigest: value.candidateDigest,
  })) throw new Error("Deployment release key is invalid.");
  return true;
}

export function validateStateReconciliationReceipt(value) {
  validateReceipt(value, STATE_RECONCILIATION_RECEIPT_SCHEMA, "reconciled", [
    "deploymentReceiptDigest", "candidateDigest", "targetDigest", "controllerId",
    "stateContractDigest", "operationsDigest", "operationCount", "operationLimit",
    "readbackAdapterId", "readbackKind", "readbackDigest", "expectedCounts",
    "observedCounts", "pathHashParity", "contentParity", "reconciledAt",
  ]);
  for (const field of [
    "deploymentReceiptDigest", "candidateDigest", "targetDigest", "stateContractDigest",
    "operationsDigest", "readbackDigest",
  ]) requireDigest(value[field], field);
  requireText(value.controllerId, "controllerId");
  requireText(value.readbackAdapterId, "readbackAdapterId");
  requireStateOperationBounds(value.operationCount, value.operationLimit);
  requireExactText(value.readbackKind, "direct-authoritative", "readbackKind");
  const expected = normalizeStateCounts(value.expectedCounts, "expectedCounts");
  const observed = normalizeStateCounts(value.observedCounts, "observedCounts");
  for (const field of STATE_COUNT_FIELDS) {
    if (expected[field] !== observed[field]) throw new Error(`State reconciliation ${field} parity failed.`);
  }
  requireTrue(value.pathHashParity, "pathHashParity");
  requireTrue(value.contentParity, "contentParity");
  requireInstant(value.reconciledAt, "reconciledAt");
  return true;
}

export function validateLiveVerificationReceipt(value) {
  validateReceipt(value, LIVE_VERIFICATION_RECEIPT_SCHEMA, "verified", [
    "authorizationReceiptDigest", "candidateDigest", "targetDigest", "controllerId",
    "deployedArtifactDigest", "observedRuntimeDigest", "probesDigest", "rollbackTargetDigest",
    "verifiedAt",
  ]);
  for (const field of [
    "authorizationReceiptDigest", "candidateDigest", "targetDigest", "deployedArtifactDigest",
    "observedRuntimeDigest", "probesDigest", "rollbackTargetDigest",
  ]) requireDigest(value[field], field);
  requireText(value.controllerId, "controllerId");
  requireInstant(value.verifiedAt, "verifiedAt");
  return true;
}

export function validateLiveVerificationReceiptV2(value) {
  validateReceipt(value, LIVE_VERIFICATION_RECEIPT_V2_SCHEMA, "verified", [
    "deploymentReceiptDigest", "stateReconciliationReceiptDigest", "candidateDigest",
    "targetDigest", "controllerId", "deployedArtifactDigest", "rollbackTargetDigest",
    "observedRuntimeDigest", "immutableOriginProbesDigest", "publicRouteProbesDigest",
    "browserFidelityDigest", "clientCacheConvergenceDigest", "markerParityDigest",
    "markerBytesParity", "verifiedAt",
  ]);
  for (const field of [
    "deploymentReceiptDigest", "stateReconciliationReceiptDigest", "candidateDigest",
    "targetDigest", "deployedArtifactDigest", "rollbackTargetDigest", "observedRuntimeDigest",
    "immutableOriginProbesDigest", "publicRouteProbesDigest", "browserFidelityDigest",
    "clientCacheConvergenceDigest", "markerParityDigest",
  ]) requireDigest(value[field], field);
  requireText(value.controllerId, "controllerId");
  requireTrue(value.markerBytesParity, "markerBytesParity");
  requireInstant(value.verifiedAt, "verifiedAt");
  return true;
}

export function validatePublicationReceipt(value) {
  return validateJoinedPublicationReceipt(value, PUBLICATION_RECEIPT_SCHEMA);
}

export function validatePublicationReceiptV2(value) {
  return validateJoinedPublicationReceipt(value, PUBLICATION_RECEIPT_V2_SCHEMA);
}

function validateJoinedPublicationReceipt(value, schema) {
  validateReceipt(value, schema, "published", [
    "liveVerificationReceiptDigest", "candidateDigest", "targetDigest",
    "publicationIdentitiesDigest", "publishedAt",
  ]);
  for (const field of [
    "liveVerificationReceiptDigest", "candidateDigest", "targetDigest",
    "publicationIdentitiesDigest",
  ]) requireDigest(value[field], field);
  requireInstant(value.publishedAt, "publishedAt");
  return true;
}

export function validateRollbackReceipt(value) {
  validateReceipt(value, ROLLBACK_RECEIPT_SCHEMA, "rolled-back", [
    "deploymentReceiptDigest", "candidateDigest", "targetDigest", "controllerId",
    "deployedArtifactDigest", "rollbackTargetDigest", "failedStage", "failureDigest",
    "lastKnownGoodIdentityDigest", "restoredDeploymentIdentityDigest", "stateDisposition",
    "stateDispositionDigest", "restoredProbesDigest", "mirrorDisposition",
    "lastKnownGoodMirrorIdentityDigest", "observedMirrorIdentityDigest",
    "terminalResult", "rolledBackAt",
  ]);
  for (const field of [
    "deploymentReceiptDigest", "candidateDigest", "targetDigest", "deployedArtifactDigest",
    "rollbackTargetDigest", "failureDigest", "lastKnownGoodIdentityDigest",
    "restoredDeploymentIdentityDigest", "stateDispositionDigest", "restoredProbesDigest",
    "lastKnownGoodMirrorIdentityDigest", "observedMirrorIdentityDigest",
  ]) requireDigest(value[field], field);
  requireText(value.controllerId, "controllerId");
  requireEnum(value.failedStage, ROLLBACK_FAILURE_STAGES, "failedStage");
  requireEnum(value.stateDisposition, ["restored", "retained-compatible"], "stateDisposition");
  requireExactText(value.mirrorDisposition, "unchanged-last-known-good", "mirrorDisposition");
  requireExactText(value.terminalResult, "restored-last-known-good", "terminalResult");
  if (
    value.lastKnownGoodIdentityDigest !== value.rollbackTargetDigest
    || value.restoredDeploymentIdentityDigest !== value.lastKnownGoodIdentityDigest
  ) throw new Error("Rollback receipt identities are not terminally restored.");
  if (value.observedMirrorIdentityDigest !== value.lastKnownGoodMirrorIdentityDigest) {
    throw new Error("Rollback receipt mirror identity advanced.");
  }
  requireInstant(value.rolledBackAt, "rolledBackAt");
  return true;
}

function assertStateJoinsDeployment(deployment, state) {
  if (
    state.deploymentReceiptDigest !== deployment.receiptDigest
    || state.candidateDigest !== deployment.candidateDigest
    || state.targetDigest !== deployment.targetDigest
    || state.controllerId !== deployment.controllerId
  ) throw new Error("State reconciliation is unjoined from its deployment controller or candidate.");
  if (Date.parse(state.reconciledAt) < Date.parse(deployment.deployedAt)) {
    throw new Error("State reconciliation cannot predate its joined deployment.");
  }
}

export function validateDeploymentCandidateManifest(value) {
  validateReceipt(value, CANDIDATE_MANIFEST_SCHEMA, "awaiting-human-authorization", [
    "runtimeReviewReceiptDigest", "sourceDigest", "dependencyClosureDigest", "policyDigest",
    "targetDigest", "artifactDigest", "manifestDigest", "rollbackTargetDigest", "builtAt",
  ]);
  for (const field of [
    "runtimeReviewReceiptDigest", "sourceDigest", "dependencyClosureDigest", "policyDigest",
    "targetDigest", "artifactDigest", "manifestDigest", "rollbackTargetDigest",
  ]) requireDigest(value[field], field);
  requireInstant(value.builtAt, "builtAt");
}

export function validateConsumedDeploymentAuthorizationReceipt(value) {
  validateReceipt(value, HUMAN_AUTHORIZATION_RECEIPT_SCHEMA, "consumed", [
    "candidateDigest", "targetDigest", "releaseKey", "decisionKind", "humanActorId",
    "decisionRef", "authorityAdapterId", "interactionReceiptDigest", "issuedAt", "expiresAt",
    "consumedAt", "controllerId", "authorizationReceiptDigest",
  ]);
  for (const field of [
    "candidateDigest", "targetDigest", "releaseKey", "interactionReceiptDigest",
    "authorizationReceiptDigest",
  ]) requireDigest(value[field], field);
  requireExactText(value.decisionKind, "human", "decisionKind");
  for (const field of ["humanActorId", "decisionRef", "authorityAdapterId", "controllerId"]) {
    requireText(value[field], field);
  }
  requireWindow(value.issuedAt, value.expiresAt, "Human Authorization Receipt");
  requireInstant(value.consumedAt, "consumedAt");
  if (
    Date.parse(value.consumedAt) < Date.parse(value.issuedAt)
    || Date.parse(value.consumedAt) > Date.parse(value.expiresAt)
  ) throw new Error("Authorization consumption must occur within its validity window.");
  if (value.releaseKey !== digest({
    targetDigest: value.targetDigest,
    candidateDigest: value.candidateDigest,
  })) throw new Error("Consumed authorization release key is invalid.");
  const {
    receiptDigest: _consumedDigest,
    controllerId: _controllerId,
    authorizationReceiptDigest: _authorizationDigest,
    ...authorized
  } = value;
  const derivedAuthorizationDigest = digest({
    ...authorized,
    status: "authorized",
    consumedAt: null,
  });
  if (value.authorizationReceiptDigest !== derivedAuthorizationDigest) {
    throw new Error("Consumed authorization is unjoined from its authorized predecessor.");
  }
}

function validateReceipt(value, schema, status, evidenceFields) {
  requireExact(value, ["schema", "status", ...evidenceFields, "receiptDigest"], schema);
  requireExactText(value.schema, schema, `${schema} schema`);
  requireExactText(value.status, status, `${schema} status`);
  const { receiptDigest, ...evidence } = value;
  requireDigest(receiptDigest, "receiptDigest");
  if (receiptDigest !== digest(evidence)) throw new Error(`${schema} digest does not match its evidence.`);
}

function receipt(evidence) {
  return Object.freeze({ ...evidence, receiptDigest: digest(evidence) });
}

function releaseKey(candidate) {
  return digest({ targetDigest: candidate.targetDigest, candidateDigest: candidate.receiptDigest });
}

function normalizeStateCounts(value, label) {
  requireExact(value, STATE_COUNT_FIELDS, label);
  for (const field of STATE_COUNT_FIELDS) requireNonNegativeInteger(value[field], `${label}.${field}`);
  return Object.freeze({ ...value });
}

function requireStateOperationBounds(operationCount, operationLimit) {
  requireNonNegativeInteger(operationCount, "operationCount");
  if (!Number.isSafeInteger(operationLimit) || operationLimit < 1 || operationLimit > MAX_STATE_OPERATIONS) {
    throw new Error(`operationLimit must be between 1 and ${MAX_STATE_OPERATIONS}.`);
  }
  if (operationCount > operationLimit) throw new Error("operationCount exceeds its bounded operationLimit.");
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
}

function requireEnum(value, options, label) {
  if (!options.includes(value)) throw new Error(`${label} must be one of: ${options.join(", ")}.`);
}

function requireExactText(value, expected, label) {
  if (value !== expected) throw new Error(`${label} must be ${expected}.`);
}

function requireTrue(value, label) {
  if (value !== true) throw new Error(`${label} must be true.`);
}

function requireWindow(issuedAt, expiresAt, label) {
  requireInstant(issuedAt, `${label} issuedAt`);
  requireInstant(expiresAt, `${label} expiresAt`);
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) throw new Error(`${label} expiry must follow issue time.`);
}

function requireInstant(value, label) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
}

function requireDigest(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a SHA-256 digest.`);
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-empty.`);
}

function requireExact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} contains missing or unknown fields.`);
  }
}

function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
