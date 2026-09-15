// Native Graph local-review and human-prompt owner. Candidate validation stays in the existing release contract.
import { fileURLToPath } from "node:url";
import { canonicalizeJson } from "agentic-os/context/json";
import { LOCAL_REVIEW_CANDIDATE_SCHEMA, validateLocalReviewCandidate, validateProductionReleaseCandidate,
  digestProductionEvidence, assertReleaseSourceIdentity as assertShaTree } from "./production-release-authorization.mjs";
export const PRODUCTION_AUTHORIZATION_PROMPT_SCHEMA = "agentic-production-authorization-prompt/v1";
export const PRODUCTION_AUTHORIZATION_FORMATTER_PATH = "agentic-graph/scripts/local-review-contract.mjs";
export const PRODUCTION_AUTHORIZATION_LOCAL_FORMATTER_PATH = fileURLToPath(import.meta.url);
export { validateProductionReleaseCandidate } from "./production-release-authorization.mjs";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const digest = value => digestProductionEvidence(canonicalizeJson(value));

export function createLocalReviewCandidate(runtime, trees) {
  if (runtime?.status !== "runtime-ready" || runtime.ready !== true) {
    throw new Error("Local review requires runtime-ready evidence.");
  }
  const localhostReviewUrl = resolveLocalhostReviewUrl(runtime);
  if (runtime.source?.revision !== trees?.source?.revision ||
      runtime.agenticCanvasOs?.revision !== trees?.agenticCanvasOs?.revision ||
      runtime.catalogRevision !== trees?.agenticCanvasOs?.revision) {
    throw new Error("Local review runtime identity drifted from the canonical candidate.");
  }
  assertShaTree(trees.source, "source");
  assertShaTree(trees.agenticCanvasOs, "Agentic Canvas OS");
  if (Object.values(runtime.probes || {}).some(status => status !== 200) ||
      Object.keys(runtime.probes || {}).length < 3) {
    throw new Error("Local review requires all canonical runtime probes to return HTTP 200.");
  }
  const evidence = {
    schema: LOCAL_REVIEW_CANDIDATE_SCHEMA,
    status: "review-ready",
    source: {
      repository: runtime.source.repository,
      revision: trees.source.revision,
      tree: trees.source.tree,
    },
    agenticCanvasOs: {
      repository: runtime.agenticCanvasOs.repository,
      revision: trees.agenticCanvasOs.revision,
      tree: trees.agenticCanvasOs.tree,
    },
    catalogRevision: runtime.catalogRevision,
    runtimeEvidenceDigest: digest({
      source: runtime.source,
      agenticCanvasOs: runtime.agenticCanvasOs,
      catalogRevision: runtime.catalogRevision,
      probes: runtime.probes,
      protectedChecks: runtime.protectedChecks,
      ownershipTokenDigest: runtime.ownershipTokenDigest,
      localhostReviewUrl,
    }),
  };
  return Object.freeze({ ...evidence, candidateDigest: digest(evidence) });
}
export function createProductionAuthorizationPrompt(runtime, localReview, candidate, input) {
  if (!isExactObject(input, ["runRef"])) {
    throw new Error("Production authorization prompt input is malformed.");
  }
  validateLocalReviewCandidate(localReview);
  validateProductionReleaseCandidate(candidate);
  validatePromptRuntimeIdentity(runtime, localReview);
  if (candidate.localReviewCandidateDigest !== localReview.candidateDigest ||
      candidate.source.revision !== localReview.source.revision ||
      candidate.agenticCanvasOs.revision !== localReview.agenticCanvasOs.revision) {
    throw new Error("Production authorization prompt drifted from runtime-ready localhost review.");
  }
  const runRef = requirePromptReference(input.runRef);
  const evidence = {
    schema: PRODUCTION_AUTHORIZATION_PROMPT_SCHEMA,
    status: "awaiting-human-authorization",
    candidateDigest: candidate.candidateDigest,
    sourceRevision: candidate.source.revision,
    runRef,
    localhostReviewUrl: resolveLocalhostReviewUrl(runtime),
    authorizationReply: `authorize ${candidate.candidateDigest}`,
  };
  return Object.freeze({ ...evidence, promptDigest: digest(evidence) });
}
export function formatProductionAuthorizationPrompt(value) {
  validateProductionAuthorizationPrompt(value);
  return [
    "The release is verified and awaiting fresh human authorization.",
    "",
    `Candidate: \`${value.candidateDigest}\``,
    `Source: \`${value.sourceRevision}\``,
    `Run: \`${value.runRef}\``,
    `localhost: \`${value.localhostReviewUrl}\``,
    `Local formatter source: \`${PRODUCTION_AUTHORIZATION_LOCAL_FORMATTER_PATH}\``,
    "",
    `Template: \`${PRODUCTION_AUTHORIZATION_FORMATTER_PATH}\``,
    "",
    "Reply exactly:",
    "",
    `\`${value.authorizationReply}\``,
  ].join("\n");
}
export function validateProductionAuthorizationPrompt(value) {
  if (!isExactObject(value, [
    "schema",
    "status",
    "candidateDigest",
    "sourceRevision",
    "runRef",
    "localhostReviewUrl",
    "authorizationReply",
    "promptDigest",
  ]) ||
      value.schema !== PRODUCTION_AUTHORIZATION_PROMPT_SCHEMA ||
      value.status !== "awaiting-human-authorization" ||
      !SHA256_PATTERN.test(String(value.candidateDigest || "")) ||
      !SHA_PATTERN.test(String(value.sourceRevision || "")) ||
      value.localhostReviewUrl !== requireLocalhostUrl(value.localhostReviewUrl) ||
      value.runRef !== requirePromptReference(value.runRef) ||
      value.authorizationReply !== `authorize ${value.candidateDigest}`) {
    throw new Error("Production authorization prompt is malformed.");
  }
  const { promptDigest, ...evidence } = value;
  if (promptDigest !== digest(evidence)) {
    throw new Error("Production authorization prompt digest does not match its evidence.");
  }
  return value;
}
function validatePromptRuntimeIdentity(runtime, localReview) {
  if (runtime?.status !== "runtime-ready" || runtime.ready !== true) {
    throw new Error("Production authorization prompt requires runtime-ready localhost review.");
  }
  resolveLocalhostReviewUrl(runtime);
  if (runtime.source?.repository !== localReview.source.repository ||
      runtime.source?.revision !== localReview.source.revision ||
      runtime.agenticCanvasOs?.repository !== localReview.agenticCanvasOs.repository ||
      runtime.agenticCanvasOs?.revision !== localReview.agenticCanvasOs.revision ||
      runtime.catalogRevision !== localReview.catalogRevision) {
    throw new Error("Production authorization prompt drifted from runtime-ready localhost review.");
  }
  if (Object.values(runtime.probes || {}).some(status => status !== 200) ||
      Object.keys(runtime.probes || {}).length < 3) {
    throw new Error("Production authorization prompt requires all localhost probes to return HTTP 200.");
  }
}
function resolveLocalhostReviewUrl(runtime) {
  const host = runtime?.host;
  const port = runtime?.ports?.apex;
  if (!["127.0.0.1", "localhost", "::1"].includes(host) ||
      !Number.isSafeInteger(port) ||
      port < 1 ||
      port > 65535) {
    throw new Error("Local review requires a bound loopback Apex surface.");
  }
  return `http://${host === "::1" ? "[::1]" : host}:${port}/`;
}
function requireLocalhostUrl(value) {
  const match = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):([1-9][0-9]{0,4})\/$/.exec(String(value || ""));
  if (!match) {
    throw new Error("Production authorization prompt requires a loopback localhost URL.");
  }
  const port = Number(match[1]);
  if (!Number.isSafeInteger(port) || port > 65535) {
    throw new Error("Production authorization prompt requires a valid localhost port.");
  }
  return value;
}
function requirePromptReference(value) {
  if (typeof value !== "string" ||
      value.length < 1 ||
      value.length > 2048 ||
      /[\s`]/.test(value)) {
    throw new Error("Production authorization prompt requires one bounded run reference.");
  }
  return value;
}
function isExactObject(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
