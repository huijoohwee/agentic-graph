import { digestJson } from "./agentic-sdlc-observability-json.js";

const CANDIDATE_SCHEMA = "agentic-candidate-manifest/v1";
const INTERACTION_SCHEMA = "agentic-authorization-interaction-receipt/v1";
const AUTHORIZATION_SCHEMA = "agentic-human-authorization-receipt/v2";
const LIVE_SCHEMA = "agentic-live-verification-receipt/v1";
const DIGEST = /^[0-9a-f]{64}$/;

const CANDIDATE_FIELDS = Object.freeze([
  "runtimeReviewReceiptDigest", "sourceDigest", "dependencyClosureDigest",
  "policyDigest", "targetDigest", "artifactDigest", "manifestDigest",
  "rollbackTargetDigest", "builtAt",
]);
const INTERACTION_FIELDS = Object.freeze([
  "candidateDigest", "targetDigest", "humanActorId", "interactionAdapterId",
  "transportClass", "browserRequired", "challengeDigest", "responseDigest",
  "recordedAt",
]);
const AUTHORIZATION_FIELDS = Object.freeze([
  "candidateDigest", "targetDigest", "releaseKey", "decisionKind",
  "humanActorId", "decisionRef", "authorityAdapterId",
  "interactionReceiptDigest", "issuedAt", "expiresAt", "consumedAt",
  "controllerId", "authorizationReceiptDigest",
]);
const LIVE_FIELDS = Object.freeze([
  "authorizationReceiptDigest", "candidateDigest", "targetDigest",
  "controllerId", "deployedArtifactDigest", "observedRuntimeDigest",
  "probesDigest", "rollbackTargetDigest", "verifiedAt",
]);

const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : null;
const exactKeys = (value, fields) => {
  const expected = ["schema", "status", ...fields, "receiptDigest"].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
};
const validDigestFields = (value, fields) =>
  fields.every((field) => DIGEST.test(String(value[field] || "")));
const validInstant = (value) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));
const validText = (value) => typeof value === "string" && Boolean(value.trim());

function validReceipt(value, schema, status, fields) {
  if (!record(value) || !exactKeys(value, fields)
    || value.schema !== schema || value.status !== status
    || !DIGEST.test(String(value.receiptDigest || ""))) return false;
  const { receiptDigest, ...evidence } = value;
  return digestJson(evidence) === receiptDigest;
}

function validCandidate(value) {
  return validReceipt(value, CANDIDATE_SCHEMA, "awaiting-human-authorization", CANDIDATE_FIELDS)
    && validDigestFields(value, CANDIDATE_FIELDS.filter((field) => field !== "builtAt"))
    && validInstant(value.builtAt);
}

function validInteraction(value) {
  return validReceipt(value, INTERACTION_SCHEMA, "observed", INTERACTION_FIELDS)
    && validDigestFields(value, [
      "candidateDigest", "targetDigest", "challengeDigest", "responseDigest",
    ])
    && ["humanActorId", "interactionAdapterId", "transportClass"]
      .every((field) => validText(value[field]))
    && typeof value.browserRequired === "boolean"
    && validInstant(value.recordedAt);
}

function validConsumedAuthorization(value) {
  const {
    receiptDigest: _receiptDigest,
    controllerId: _controllerId,
    authorizationReceiptDigest,
    ...authorization
  } = value;
  return validReceipt(value, AUTHORIZATION_SCHEMA, "consumed", AUTHORIZATION_FIELDS)
    && validDigestFields(value, [
      "candidateDigest", "targetDigest", "releaseKey", "interactionReceiptDigest",
      "authorizationReceiptDigest",
    ])
    && value.decisionKind === "human"
    && ["humanActorId", "decisionRef", "authorityAdapterId", "controllerId"]
      .every((field) => validText(value[field]))
    && ["issuedAt", "expiresAt", "consumedAt"].every((field) => validInstant(value[field]))
    && Date.parse(value.expiresAt) > Date.parse(value.issuedAt)
    && Date.parse(value.consumedAt) >= Date.parse(value.issuedAt)
    && Date.parse(value.consumedAt) <= Date.parse(value.expiresAt)
    && authorizationReceiptDigest === digestJson({
      ...authorization,
      status: "authorized",
      consumedAt: null,
    })
    && value.releaseKey === digestJson({
      targetDigest: value.targetDigest,
      candidateDigest: value.candidateDigest,
    });
}

function validLiveVerification(value) {
  return validReceipt(value, LIVE_SCHEMA, "verified", LIVE_FIELDS)
    && validDigestFields(value, LIVE_FIELDS.filter((field) =>
      !["controllerId", "verifiedAt"].includes(field)))
    && validText(value.controllerId)
    && validInstant(value.verifiedAt);
}

export function deriveDeployedFromReceipts(entries) {
  const receipts = entries.map((entry) => record(entry?.value ?? entry)).filter(Boolean);
  const candidates = receipts.filter(validCandidate);
  const interactions = receipts.filter(validInteraction);
  const authorizations = receipts.filter(validConsumedAuthorization);
  const liveVerifications = receipts.filter(validLiveVerification);
  return candidates.some((candidate) => interactions.some((interaction) =>
    interaction.candidateDigest === candidate.receiptDigest
    && interaction.targetDigest === candidate.targetDigest
    && Date.parse(interaction.recordedAt) >= Date.parse(candidate.builtAt)
    && authorizations.some((authorization) =>
      authorization.candidateDigest === candidate.receiptDigest
      && authorization.targetDigest === candidate.targetDigest
      && authorization.interactionReceiptDigest === interaction.receiptDigest
      && authorization.humanActorId === interaction.humanActorId
      && Date.parse(authorization.issuedAt) >= Date.parse(interaction.recordedAt)
      && liveVerifications.some((live) =>
        live.authorizationReceiptDigest === authorization.receiptDigest
        && live.candidateDigest === candidate.receiptDigest
        && live.targetDigest === candidate.targetDigest
        && live.controllerId === authorization.controllerId
        && Date.parse(live.verifiedAt) >= Date.parse(authorization.consumedAt)
        && live.deployedArtifactDigest === candidate.artifactDigest
        && live.rollbackTargetDigest === candidate.rollbackTargetDigest))));
}
