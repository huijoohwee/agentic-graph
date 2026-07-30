import { createHash } from "node:crypto";

const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const cost = () => ({ tokens: 1, costUsd: 0, durationMs: 0 });
export const SKILL_EVOLUTION_FIXTURE_BASELINE_TEXT = "x".repeat(100);
export const SKILL_EVOLUTION_FIXTURE_CANDIDATE_TEXT = `skill${SKILL_EVOLUTION_FIXTURE_BASELINE_TEXT}`;
const artifactText = new Map([
  ["skill://stdio/v1", SKILL_EVOLUTION_FIXTURE_BASELINE_TEXT],
  ["candidate://stdio/1", SKILL_EVOLUTION_FIXTURE_CANDIDATE_TEXT],
]);
let callCount = 0;
let validationSecret = null;

const probe = (payload) => {
  callCount += 1;
  return payload.__probe
    ? {
        workerPid: process.pid,
        callCount,
        inheritedSecret: process.env.SKILL_EVOLUTION_TEST_SECRET ?? null,
        filesystemWriteAllowed: process.permission?.has("fs.write") ?? true,
        signalPresent: payload.signal instanceof AbortSignal,
        validationSecret,
      }
    : {};
};

const abortableDelay = (durationMs, signal) => new Promise((resolve, reject) => {
  if (!durationMs) {
    resolve();
    return;
  }
  const timer = setTimeout(resolve, durationMs);
  signal?.addEventListener("abort", () => {
    clearTimeout(timer);
    reject(Object.assign(new Error("fixture abort details must stay private"), { code: "canceled" }));
  }, { once: true });
});

function verifiedMutation(payload) {
  const normalize = (value) => String(value).replace(/\r\n?/g, "\n");
  const parentText = artifactText.get(payload.parent?.candidateRef ?? payload.parent?.artifactRef);
  const candidateText = artifactText.get(payload.candidate?.candidateRef);
  let cursor = 0;
  let applied = "";
  let changedChars = 0;
  let valid = typeof parentText === "string" && typeof candidateText === "string";
  for (const hunk of payload.mutation?.hunks || []) {
    const deleted = normalize(hunk.deleteText);
    const inserted = normalize(hunk.insertText);
    valid &&= hunk.start >= cursor
      && parentText.slice(hunk.start, hunk.start + deleted.length) === deleted;
    applied += parentText.slice(cursor, hunk.start) + inserted;
    cursor = hunk.start + deleted.length;
    changedChars += deleted.length + inserted.length;
  }
  applied += parentText?.slice(cursor) || "";
  valid &&= applied === candidateText
    && sha(parentText) === payload.parent.digest
    && sha(candidateText) === payload.candidate.digest;
  return {
    ok: valid,
    sourceRevision: payload.sourceRevision,
    parentDigest: payload.parent?.digest,
    candidateDigest: payload.candidate?.digest,
    candidateRef: payload.candidate?.candidateRef,
    parentNormalizedChars: parentText?.length ?? -1,
    candidateNormalizedChars: candidateText?.length ?? -1,
    mutationOperations: payload.mutation?.hunks?.length ?? -1,
    changedChars,
    artifactVerified: valid,
  };
}

export function createSkillEvolutionAdapter({ role } = {}) {
  const capabilities = {
    authorization: {
      async authorize(payload) {
        if (payload.throwSecret) {
          throw Object.assign(new Error(`private:${payload.throwSecret}`), {
            code: "not_a_public_code",
            data: { private: payload.throwSecret },
          });
        }
        if (payload.oversized) return { blob: "x".repeat(300 * 1024) };
        if (payload.__probe) return probe(payload);
        return true;
      },
    },
    sourceVerifier: {
      async verifySources(payload) {
        return {
          ok: true,
          sourceRevision: payload.sourceRevision,
          digestsVerified: true,
          registeredGates: ["schema.valid"],
          usageEnvelope: {
            executeTraining: { maxTokens: 1, maxCostUsd: 0, maxDurationMs: 1000 },
            proposeCandidate: { maxTokens: 1, maxCostUsd: 0, maxDurationMs: 1000 },
            executeValidation: { maxTokens: 1, maxCostUsd: 0, maxDurationMs: 1000 },
            evaluateValidation: { maxTokens: 1, maxCostUsd: 0, maxDurationMs: 1000 },
          },
          ...probe(payload),
        };
      },
      async verifyMutation(payload) {
        return verifiedMutation(payload);
      },
    },
    trainingExecutor: {
      async executeTraining(payload) {
        await abortableDelay(payload.delayMs, payload.signal);
        return {
          evidence: { ref: `evidence://training/${payload.epochIndex}`, digest: sha(JSON.stringify(payload.scenarioRefs)) },
          cost: cost(),
          ...probe(payload),
        };
      },
    },
    candidate: {
      async proposeCandidate(payload) {
        return {
          candidate: {
            candidateRef: "candidate://stdio/1",
            diffRef: "diff://stdio/1",
            digest: sha(SKILL_EVOLUTION_FIXTURE_CANDIDATE_TEXT),
            parentDigest: payload.candidate.digest,
          },
          mutation: { hunks: [{ start: 0, deleteText: "", insertText: "skill" }] },
          cost: cost(),
          ...probe(payload),
        };
      },
    },
    heldOut: {
      async executeValidation(payload) {
        validationSecret = payload.validationSecret ?? validationSecret;
        return {
          evidence: { ref: `evidence://validation/${payload.candidateRole}`, digest: sha(payload.candidate.digest) },
          cost: cost(),
          ...probe(payload),
        };
      },
      async evaluateValidation(payload) {
        return {
          metrics: { champion: 0.5, candidate: 0.8 },
          gateResults: payload.requiredGates.map((id) => ({ id, passed: true, evidenceDigest: sha(id) })),
          cost: cost(),
          ...probe(payload),
        };
      },
    },
  };
  return Object.freeze(capabilities[role] || {});
}
