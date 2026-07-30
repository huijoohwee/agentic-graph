const SHA256 = /^[a-f0-9]{64}$/;

const clone = (value) => structuredClone(value);
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => isObject(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const verificationError = (message) => Object.assign(new Error(message), { code: "source_drift" });

export async function verifySkillEvolutionMutationBoundary(adapter, payload, { signal } = {}) {
  if (typeof adapter?.sourceVerifier?.verifyMutation !== "function") {
    throw Object.assign(
      new Error("No artifact-verifying skill-evolution mutation capability is configured."),
      { code: "adapter_unavailable" },
    );
  }
  const result = await adapter.sourceVerifier.verifyMutation({ ...clone(payload), signal });
  const expectedKeys = [
    "ok",
    "sourceRevision",
    "parentDigest",
    "candidateDigest",
    "candidateRef",
    "parentNormalizedChars",
    "candidateNormalizedChars",
    "mutationOperations",
    "changedChars",
    "artifactVerified",
  ];
  if (!exactKeys(result, expectedKeys)
    || result.ok !== true
    || result.artifactVerified !== true
    || result.sourceRevision !== payload.sourceRevision
    || !SHA256.test(result.parentDigest || "")
    || result.parentDigest !== payload.parent.digest
    || !SHA256.test(result.candidateDigest || "")
    || result.candidateDigest !== payload.candidate.digest
    || result.candidateRef !== payload.candidate.candidateRef
    || result.parentNormalizedChars !== payload.expected.parentNormalizedChars
    || result.candidateNormalizedChars !== payload.expected.candidateNormalizedChars
    || result.mutationOperations !== payload.expected.mutationOperations
    || result.changedChars !== payload.expected.changedChars) {
    throw verificationError("Trusted artifact verification rejected the candidate mutation or its accounting.");
  }
  return Object.freeze({
    mutationOperations: result.mutationOperations,
    changedChars: result.changedChars,
    normalizedChars: result.candidateNormalizedChars,
  });
}
