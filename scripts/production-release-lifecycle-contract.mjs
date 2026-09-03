import { createHash } from "node:crypto";

export {
  DEPLOYMENT_RECEIPT_SCHEMA,
  LIVE_VERIFICATION_RECEIPT_SCHEMA,
  LIVE_VERIFICATION_RECEIPT_V2_SCHEMA,
  PUBLICATION_RECEIPT_SCHEMA,
  PUBLICATION_RECEIPT_V2_SCHEMA,
  ROLLBACK_RECEIPT_SCHEMA,
  STATE_RECONCILIATION_RECEIPT_SCHEMA,
  createDeploymentReceipt,
  createLegacyLiveObservationReceipt,
  createLegacyPublicationObservationReceipt,
  createLiveVerificationReceipt,
  createLiveVerificationReceiptV2,
  createPublicationReceipt,
  createPublicationReceiptV2,
  createRollbackReceipt,
  createStateReconciliationReceipt,
  validateDeploymentReceipt,
  validateDeploymentCandidateManifest,
  validateConsumedDeploymentAuthorizationReceipt,
  validateLiveVerificationReceipt,
  validateLiveVerificationReceiptV2,
  validatePublicationReceipt,
  validatePublicationReceiptV2,
  validateRollbackReceipt,
  validateStateReconciliationReceipt,
} from "./production-release-terminal-receipts.mjs";

export const OVERLAP_PRESERVATION_RECEIPT_SCHEMA = "agentic-overlap-preservation-receipt/v1";
export const OVERLAP_DISPOSITION_RECEIPT_SCHEMA = "agentic-overlap-disposition-receipt/v1";
export const INTEGRATION_RECEIPT_SCHEMA = "agentic-integration-receipt/v2";
export const RUNTIME_REVIEW_RECEIPT_SCHEMA = "agentic-runtime-review-receipt/v1";
export const CANDIDATE_MANIFEST_SCHEMA = "agentic-candidate-manifest/v1";
export const AUTHORIZATION_INTERACTION_RECEIPT_SCHEMA = "agentic-authorization-interaction-receipt/v1";
export const HUMAN_AUTHORIZATION_RECEIPT_SCHEMA = "agentic-human-authorization-receipt/v2";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COLLABORATION_FIELDS = [
  "actorId",
  "deviceId",
  "sessionId",
  "worktreeId",
  "branchId",
  "scopeId",
  "leaseEpoch",
  "fenceRevision",
];

export function createOverlapPreservationReceipt(input) {
  requireExact(input, [
    "convergenceBaseDigest",
    "protectedTipDigest",
    "captureAdapterId",
    "entries",
    "capturedAt",
  ], "Overlap Preservation Receipt input");
  requireDigest(input.convergenceBaseDigest, "convergenceBaseDigest");
  requireDigest(input.protectedTipDigest, "protectedTipDigest");
  requireText(input.captureAdapterId, "captureAdapterId");
  requireInstant(input.capturedAt, "capturedAt");
  const entries = normalizePreservationEntries(input.entries);
  return receipt({
    schema: OVERLAP_PRESERVATION_RECEIPT_SCHEMA,
    status: "preserved",
    ...input,
    entries,
  });
}

export function createOverlapDispositionReceipt(preservation, input) {
  validateOverlapPreservationReceipt(preservation);
  requireExact(input, [
    "preservationReceiptDigest",
    "convergenceBaseDigest",
    "protectedTipDigest",
    "observations",
    "observedAt",
  ], "Overlap Disposition Receipt input");
  for (const field of ["preservationReceiptDigest", "convergenceBaseDigest", "protectedTipDigest"]) {
    requireDigest(input[field], field);
  }
  requireInstant(input.observedAt, "observedAt");
  if (input.preservationReceiptDigest !== preservation.receiptDigest ||
      input.convergenceBaseDigest !== preservation.convergenceBaseDigest ||
      input.protectedTipDigest !== preservation.protectedTipDigest) {
    throw new Error("Overlap disposition drifted from its preservation receipt.");
  }
  if (Date.parse(input.observedAt) < Date.parse(preservation.capturedAt)) {
    throw new Error("Overlap disposition cannot predate preservation.");
  }
  const observations = normalizeDispositionObservations(input.observations);
  if (observations.length !== preservation.entries.length) {
    throw new Error("Overlap disposition must account for every preserved entry exactly once.");
  }
  for (let index = 0; index < preservation.entries.length; index += 1) {
    const entry = preservation.entries[index];
    const observation = observations[index];
    if (preservationEntryKey(entry) !== dispositionObservationKey(observation) ||
        observation.stateDigest !== entry.stateDigest ||
        observation.recoveryHandle !== entry.recoveryHandle) {
      throw new Error("Overlapping work state or recovery identity drifted before convergence.");
    }
    if (entry.overlapClass === "overlapping" && observation.disposition !== "retained") {
      throw new Error("Overlapping work must remain retained in its owning lane or recovery object.");
    }
  }
  return receipt({
    schema: OVERLAP_DISPOSITION_RECEIPT_SCHEMA,
    status: "accounted",
    ...input,
    observations,
  });
}

export function createIntegrationReceipt(preservation, disposition, input) {
  validateOverlapPreservationReceipt(preservation);
  validateOverlapDispositionReceipt(disposition);
  validateJoinedOverlapDisposition(preservation, disposition);
  requireExact(input, [
    "sourceRevision",
    "sourceDigest",
    "dependencyClosureDigest",
    "checksDigest",
    "evaluatorId",
    "collaboration",
    "integrationTargetDigest",
    "integratedAt",
  ], "Integration Receipt input");
  requireText(input.sourceRevision, "sourceRevision");
  for (const field of ["sourceDigest", "dependencyClosureDigest", "checksDigest", "integrationTargetDigest"]) {
    requireDigest(input[field], field);
  }
  requireText(input.evaluatorId, "evaluatorId");
  requireCollaboration(input.collaboration);
  requireInstant(input.integratedAt, "integratedAt");
  if (Date.parse(input.integratedAt) < Date.parse(disposition.observedAt)) {
    throw new Error("Integration cannot predate overlap disposition.");
  }
  return receipt({
    schema: INTEGRATION_RECEIPT_SCHEMA,
    status: "integrated",
    preservationReceiptDigest: preservation.receiptDigest,
    overlapDispositionReceiptDigest: disposition.receiptDigest,
    ...input,
  });
}

export function createRuntimeReviewReceipt(integration, input) {
  validateIntegrationReceipt(integration);
  requireExact(input, [
    "reviewSurfaceDigest",
    "policyDigest",
    "probesDigest",
    "reviewerId",
    "issuedAt",
    "expiresAt",
  ], "Runtime Review Receipt input");
  for (const field of ["reviewSurfaceDigest", "policyDigest", "probesDigest"]) requireDigest(input[field], field);
  requireText(input.reviewerId, "reviewerId");
  requireWindow(input.issuedAt, input.expiresAt, "Runtime Review Receipt");
  if (Date.parse(input.issuedAt) < Date.parse(integration.integratedAt)) {
    throw new Error("Runtime review cannot predate integration.");
  }
  return receipt({
    schema: RUNTIME_REVIEW_RECEIPT_SCHEMA,
    status: "reviewed",
    integrationReceiptDigest: integration.receiptDigest,
    sourceDigest: integration.sourceDigest,
    dependencyClosureDigest: integration.dependencyClosureDigest,
    ...input,
  });
}

export function createCandidateManifest(review, input) {
  validateRuntimeReviewReceipt(review);
  requireExact(input, [
    "targetDigest",
    "artifactDigest",
    "manifestDigest",
    "rollbackTargetDigest",
    "builtAt",
  ], "Candidate Manifest input");
  for (const field of ["targetDigest", "artifactDigest", "manifestDigest", "rollbackTargetDigest"]) {
    requireDigest(input[field], field);
  }
  requireInstant(input.builtAt, "builtAt");
  if (Date.parse(input.builtAt) < Date.parse(review.issuedAt) ||
      Date.parse(input.builtAt) > Date.parse(review.expiresAt)) {
    throw new Error("Candidate preparation must occur within the Runtime Review Receipt window.");
  }
  return receipt({
    schema: CANDIDATE_MANIFEST_SCHEMA,
    status: "awaiting-human-authorization",
    runtimeReviewReceiptDigest: review.receiptDigest,
    sourceDigest: review.sourceDigest,
    dependencyClosureDigest: review.dependencyClosureDigest,
    policyDigest: review.policyDigest,
    ...input,
  });
}

export function createAuthorizationInteractionReceipt(candidate, input) {
  validateCandidateManifest(candidate);
  requireExact(input, [
    "humanActorId", "interactionAdapterId", "transportClass", "browserRequired",
    "challengeDigest", "responseDigest", "recordedAt",
  ], "Authorization Interaction Receipt input");
  for (const field of ["humanActorId", "interactionAdapterId", "transportClass"]) requireText(input[field], field);
  requireBoolean(input.browserRequired, "browserRequired");
  requireDigest(input.challengeDigest, "challengeDigest");
  requireDigest(input.responseDigest, "responseDigest");
  requireInstant(input.recordedAt, "recordedAt");
  if (Date.parse(input.recordedAt) < Date.parse(candidate.builtAt)) throw new Error(
    "Authorization interaction cannot predate the Candidate Manifest.",
  );
  return receipt({
    schema: AUTHORIZATION_INTERACTION_RECEIPT_SCHEMA,
    status: "observed",
    candidateDigest: candidate.receiptDigest,
    targetDigest: candidate.targetDigest,
    ...input,
  });
}

export function createHumanAuthorizationReceipt(candidate, interaction, input) {
  validateCandidateManifest(candidate);
  validateAuthorizationInteractionReceipt(interaction);
  requireExact(input, [
    "decisionKind", "humanActorId", "decisionRef", "authorityAdapterId", "issuedAt", "expiresAt",
  ], "Human Authorization Receipt input");
  if (input.decisionKind !== "human") throw new Error("Forward deployment requires an authenticated human decision.");
  for (const field of ["humanActorId", "decisionRef", "authorityAdapterId"]) requireText(input[field], field);
  requireWindow(input.issuedAt, input.expiresAt, "Human Authorization Receipt");
  if (interaction.candidateDigest !== candidate.receiptDigest ||
      interaction.targetDigest !== candidate.targetDigest ||
      interaction.humanActorId !== input.humanActorId) {
    throw new Error("Human authorization interaction is bound to another candidate, target, or actor.");
  }
  if (Date.parse(input.issuedAt) < Date.parse(interaction.recordedAt)) throw new Error(
    "Human authorization cannot predate its interaction evidence.",
  );
  return receipt({
    schema: HUMAN_AUTHORIZATION_RECEIPT_SCHEMA,
    status: "authorized",
    candidateDigest: candidate.receiptDigest,
    targetDigest: candidate.targetDigest,
    releaseKey: releaseKey(candidate.targetDigest, candidate.receiptDigest),
    interactionReceiptDigest: interaction.receiptDigest,
    ...input,
    consumedAt: null,
  });
}

export function validateAuthorizedDeployment({
  integration,
  review,
  candidate,
  authorization,
  current,
  now,
}) {
  validateIntegrationReceipt(integration);
  validateRuntimeReviewReceipt(review);
  validateCandidateManifest(candidate);
  validateHumanAuthorizationReceipt(authorization);
  requireExact(current, [
    "preservationReceiptDigest",
    "overlapDispositionReceiptDigest",
    "integrationReceiptDigest",
    "runtimeReviewReceiptDigest",
    "candidateDigest",
    "authorizationReceiptDigest",
    "sourceDigest",
    "dependencyClosureDigest",
    "policyDigest",
    "targetDigest",
    "artifactDigest",
    "manifestDigest",
  ], "current deployment identity");
  requireInstant(now, "now");
  if (review.integrationReceiptDigest !== integration.receiptDigest ||
      candidate.runtimeReviewReceiptDigest !== review.receiptDigest ||
      authorization.candidateDigest !== candidate.receiptDigest) {
    throw new Error("Release receipt chain is unjoined.");
  }
  if (authorization.targetDigest !== candidate.targetDigest ||
      authorization.releaseKey !== releaseKey(candidate.targetDigest, candidate.receiptDigest)) {
    throw new Error("Human authorization is bound to another target or candidate.");
  }
  if (authorization.consumedAt !== null) throw new Error("Human authorization was already consumed.");
  if (Date.parse(now) > Date.parse(authorization.expiresAt)) throw new Error("Human authorization expired.");
  const expected = {
    preservationReceiptDigest: integration.preservationReceiptDigest,
    overlapDispositionReceiptDigest: integration.overlapDispositionReceiptDigest,
    integrationReceiptDigest: integration.receiptDigest,
    runtimeReviewReceiptDigest: review.receiptDigest,
    candidateDigest: candidate.receiptDigest,
    authorizationReceiptDigest: authorization.receiptDigest,
    sourceDigest: candidate.sourceDigest,
    dependencyClosureDigest: candidate.dependencyClosureDigest,
    policyDigest: candidate.policyDigest,
    targetDigest: candidate.targetDigest,
    artifactDigest: candidate.artifactDigest,
    manifestDigest: candidate.manifestDigest,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (current[field] !== value) throw new Error(`Forward deployment blocked by ${field} drift.`);
  }
  return true;
}

export function dispatchReleaseController(ledger = {}, input) {
  requireExact(input, ["targetDigest", "candidateDigest", "controllerId"], "release dispatch");
  requireDigest(input.targetDigest, "targetDigest");
  requireDigest(input.candidateDigest, "candidateDigest");
  requireText(input.controllerId, "controllerId");
  const key = releaseKey(input.targetDigest, input.candidateDigest);
  const active = ledger[input.targetDigest];
  if (active) {
    if (active.candidateDigest !== input.candidateDigest) {
      throw new Error("Target is fenced by a competing release candidate.");
    }
    return Object.freeze({
      status: "coalesced",
      releaseKey: key,
      ownerControllerId: active.controllerId,
      ledger,
    });
  }
  const next = Object.freeze({
    ...ledger,
    [input.targetDigest]: Object.freeze({
      status: "in-progress",
      releaseKey: key,
      candidateDigest: input.candidateDigest,
      controllerId: input.controllerId,
    }),
  });
  return Object.freeze({
    status: "claimed",
    releaseKey: key,
    ownerControllerId: input.controllerId,
    ledger: next,
  });
}

export function consumeHumanAuthorizationReceipt(authorization, { consumedAt, controllerId }) {
  validateHumanAuthorizationReceipt(authorization);
  if (authorization.consumedAt !== null) throw new Error("Human authorization was already consumed.");
  requireInstant(consumedAt, "consumedAt");
  requireText(controllerId, "controllerId");
  const { receiptDigest: _priorDigest, ...prior } = authorization;
  return receipt({
    ...prior,
    status: "consumed",
    consumedAt,
    controllerId,
    authorizationReceiptDigest: authorization.receiptDigest,
  });
}

export function releaseKey(targetDigest, candidateDigest) {
  requireDigest(targetDigest, "targetDigest");
  requireDigest(candidateDigest, "candidateDigest");
  return digest({ targetDigest, candidateDigest });
}

export function validateIntegrationReceipt(value) {
  validateReceipt(value, INTEGRATION_RECEIPT_SCHEMA, "integrated", [
    "preservationReceiptDigest", "overlapDispositionReceiptDigest",
    "sourceRevision", "sourceDigest", "dependencyClosureDigest", "checksDigest",
    "evaluatorId", "collaboration", "integrationTargetDigest", "integratedAt",
  ]);
  requireCollaboration(value.collaboration);
}

export function validateOverlapPreservationReceipt(value) {
  validateReceipt(value, OVERLAP_PRESERVATION_RECEIPT_SCHEMA, "preserved", [
    "convergenceBaseDigest", "protectedTipDigest", "captureAdapterId", "entries", "capturedAt",
  ]);
  normalizePreservationEntries(value.entries);
}

export function validateOverlapDispositionReceipt(value) {
  validateReceipt(value, OVERLAP_DISPOSITION_RECEIPT_SCHEMA, "accounted", [
    "preservationReceiptDigest", "convergenceBaseDigest", "protectedTipDigest",
    "observations", "observedAt",
  ]);
  normalizeDispositionObservations(value.observations);
}

export function validateJoinedOverlapDisposition(preservation, disposition) {
  if (disposition.preservationReceiptDigest !== preservation.receiptDigest ||
      disposition.convergenceBaseDigest !== preservation.convergenceBaseDigest ||
      disposition.protectedTipDigest !== preservation.protectedTipDigest ||
      disposition.observations.length !== preservation.entries.length) {
    throw new Error("Integration overlap-preservation receipts are unjoined.");
  }
  for (let index = 0; index < preservation.entries.length; index += 1) {
    const entry = preservation.entries[index];
    const observation = disposition.observations[index];
    if (preservationEntryKey(entry) !== dispositionObservationKey(observation) ||
        observation.stateDigest !== entry.stateDigest ||
        observation.recoveryHandle !== entry.recoveryHandle ||
        (entry.overlapClass === "overlapping" && observation.disposition !== "retained")) {
      throw new Error("Integration overlap-preservation receipts are unjoined.");
    }
  }
}

export function validateRuntimeReviewReceipt(value) {
  validateReceipt(value, RUNTIME_REVIEW_RECEIPT_SCHEMA, "reviewed", [
    "integrationReceiptDigest", "sourceDigest", "dependencyClosureDigest",
    "reviewSurfaceDigest", "policyDigest", "probesDigest", "reviewerId", "issuedAt", "expiresAt",
  ]);
}

export function validateCandidateManifest(value) {
  validateReceipt(value, CANDIDATE_MANIFEST_SCHEMA, "awaiting-human-authorization", [
    "runtimeReviewReceiptDigest", "sourceDigest", "dependencyClosureDigest",
    "policyDigest", "targetDigest", "artifactDigest", "manifestDigest", "rollbackTargetDigest", "builtAt",
  ]);
}

export function validateAuthorizationInteractionReceipt(value) {
  validateReceipt(value, AUTHORIZATION_INTERACTION_RECEIPT_SCHEMA, "observed", [
    "candidateDigest", "targetDigest", "humanActorId", "interactionAdapterId",
    "transportClass", "browserRequired", "challengeDigest", "responseDigest", "recordedAt",
  ]);
  requireBoolean(value.browserRequired, "browserRequired");
}

export function validateHumanAuthorizationReceipt(value) {
  validateReceipt(value, HUMAN_AUTHORIZATION_RECEIPT_SCHEMA, "authorized", [
    "candidateDigest", "targetDigest", "releaseKey", "decisionKind", "humanActorId",
    "decisionRef", "authorityAdapterId", "interactionReceiptDigest",
    "issuedAt", "expiresAt", "consumedAt",
  ]);
  if (value.decisionKind !== "human" || value.consumedAt !== null) {
    throw new Error("Human Authorization Receipt is not an unconsumed human decision.");
  }
}

export function validateConsumedAuthorizationReceipt(value) {
  validateReceipt(value, HUMAN_AUTHORIZATION_RECEIPT_SCHEMA, "consumed", [
    "candidateDigest", "targetDigest", "releaseKey", "decisionKind", "humanActorId",
    "decisionRef", "authorityAdapterId", "interactionReceiptDigest",
    "issuedAt", "expiresAt", "consumedAt",
    "controllerId", "authorizationReceiptDigest",
  ]);
  requireInstant(value.consumedAt, "consumedAt");
}

function validateReceipt(value, schema, status, evidenceFields) {
  requireExact(value, ["schema", "status", ...evidenceFields, "receiptDigest"], schema);
  if (value.schema !== schema || value.status !== status) throw new Error(`${schema} has invalid schema or status.`);
  const { receiptDigest, ...evidence } = value;
  requireDigest(receiptDigest, "receiptDigest");
  if (receiptDigest !== digest(evidence)) throw new Error(`${schema} digest does not match its evidence.`);
}

function receipt(evidence) {
  return Object.freeze({ ...evidence, receiptDigest: digest(evidence) });
}

function requireCollaboration(value) {
  requireExact(value, COLLABORATION_FIELDS, "collaboration identity");
  for (const field of COLLABORATION_FIELDS.filter(field => field !== "leaseEpoch")) requireText(value[field], field);
  if (!Number.isSafeInteger(value.leaseEpoch) || value.leaseEpoch < 1) {
    throw new Error("leaseEpoch must be a positive integer.");
  }
}

function normalizePreservationEntries(entries) {
  if (!Array.isArray(entries)) throw new Error("Preservation entries must be an array.");
  const normalized = entries.map(entry => {
    requireExact(entry, [
      "collaboration",
      "writeSetDigest",
      "stateDigest",
      "recoveryHandle",
      "preservationMode",
      "overlapClass",
    ], "preservation entry");
    requireCollaboration(entry.collaboration);
    requireDigest(entry.writeSetDigest, "writeSetDigest");
    requireDigest(entry.stateDigest, "stateDigest");
    requireText(entry.recoveryHandle, "recoveryHandle");
    requireEnum(entry.preservationMode, ["active-lane", "immutable-recovery-object"], "preservationMode");
    requireEnum(entry.overlapClass, ["disjoint", "overlapping"], "overlapClass");
    return Object.freeze({ ...entry, collaboration: Object.freeze({ ...entry.collaboration }) });
  }).sort((left, right) => compareKeys(preservationEntryKey(left), preservationEntryKey(right)));
  assertUnique(normalized.map(preservationEntryKey), "Preservation entries");
  return Object.freeze(normalized);
}

function normalizeDispositionObservations(observations) {
  if (!Array.isArray(observations)) throw new Error("Disposition observations must be an array.");
  const normalized = observations.map(observation => {
    requireExact(observation, [
      "collaboration",
      "stateDigest",
      "recoveryHandle",
      "disposition",
    ], "disposition observation");
    requireCollaboration(observation.collaboration);
    requireDigest(observation.stateDigest, "stateDigest");
    requireText(observation.recoveryHandle, "recoveryHandle");
    requireEnum(observation.disposition, ["retained", "restored"], "disposition");
    return Object.freeze({ ...observation, collaboration: Object.freeze({ ...observation.collaboration }) });
  }).sort((left, right) => compareKeys(dispositionObservationKey(left), dispositionObservationKey(right)));
  assertUnique(normalized.map(dispositionObservationKey), "Disposition observations");
  return Object.freeze(normalized);
}

function preservationEntryKey(entry) {
  return collaborationKey(entry.collaboration);
}

function dispositionObservationKey(observation) {
  return collaborationKey(observation.collaboration);
}

function collaborationKey(collaboration) {
  return COLLABORATION_FIELDS.map(field => String(collaboration[field])).join("\u0000");
}

function compareKeys(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertUnique(keys, label) {
  if (new Set(keys).size !== keys.length) throw new Error(`${label} must identify each owned work item exactly once.`);
}

function requireEnum(value, options, label) {
  if (!options.includes(value)) throw new Error(`${label} must be one of: ${options.join(", ")}.`);
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
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
