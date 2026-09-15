import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCTION_AUTHORIZATION_LOCAL_FORMATTER_PATH, createProductionAuthorizationPrompt,
  createLocalReviewCandidate, formatProductionAuthorizationPrompt, validateProductionAuthorizationPrompt } from "../local-review-contract.mjs";
import { createProductionReleaseCandidate } from "../production-release-authorization.mjs";
const sourceRevision = "a".repeat(40);
const sourceTree = "b".repeat(40);
const docsRevision = "c".repeat(40);
const docsTree = "d".repeat(40);
const runtime = {
  status: "runtime-ready",
  ready: true,
  source: { repository: "huijoohwee/agentic-graph", revision: sourceRevision },
  agenticCanvasOs: { repository: "huijoohwee/agentic-os", revision: docsRevision },
  catalogRevision: docsRevision,
  probes: { apex: 200, storage: 200, storageProxy: 200 },
  protectedChecks: { "agentic-graph": ["Integration Gate"], "agentic-os": ["test"] },
  ownershipTokenDigest: "e".repeat(64),
  host: "127.0.0.1",
  ports: { apex: 5173, storage: 8787 },
};
const trees = {
  source: { repository: "huijoohwee/agentic-graph", revision: sourceRevision, tree: sourceTree },
  agenticCanvasOs: { repository: "huijoohwee/agentic-os", revision: docsRevision, tree: docsTree },
};
const readiness = {
  schema: "agentic-os-production-runtime-readiness/v2",
  status: "verified-build",
  source: { repository: "huijoohwee/agentic-graph", revision: sourceRevision, tree: sourceTree },
  agenticCanvasOs: { repository: "huijoohwee/agentic-os", revision: docsRevision },
  catalogRevision: docsRevision,
  artifact: { algorithm: "sha256", digest: "f".repeat(64) },
  immutableManifest: { algorithm: "sha256", digest: "1".repeat(64) },
  mirror: { repository: "huijoohwee/huijoohwee" },
  surfaces: ["/", "/agentic-graph"],
};
test("runtime-ready localhost review emits the exact future human authorization template", async () => {
  const localReview = createLocalReviewCandidate(runtime, trees);
  const candidate = await createProductionReleaseCandidate({localReview, readiness, sourceRevision, sourceTree, agenticCanvasOsRevision: docsRevision, agenticCanvasOsTree: docsTree});
  const prompt = createProductionAuthorizationPrompt(runtime, localReview, candidate, {
    runRef: "run:30426035584",
  });
  assert.equal(validateProductionAuthorizationPrompt(prompt), prompt);
  assert.equal(
    formatProductionAuthorizationPrompt(prompt),
    [
      "The release is verified and awaiting fresh human authorization.",
      "",
      `Candidate: \`${candidate.candidateDigest}\``,
      `Source: \`${sourceRevision}\``,
      "Run: `run:30426035584`",
      "localhost: `http://127.0.0.1:5173/`",
      `Local formatter source: \`${PRODUCTION_AUTHORIZATION_LOCAL_FORMATTER_PATH}\``,
      "",
      "Template: `agentic-graph/scripts/local-review-contract.mjs`",
      "",
      "Reply exactly:",
      "",
      `\`authorize ${candidate.candidateDigest}\``,
    ].join("\n"),
  );
});
test("authorization prompt accepts a redacted runtime ownership token when the reviewed identity still matches", async () => {
  const localReview = createLocalReviewCandidate(runtime, trees);
  const candidate = await createProductionReleaseCandidate({localReview, readiness, sourceRevision, sourceTree, agenticCanvasOsRevision: docsRevision, agenticCanvasOsTree: docsTree});
  const prompt = createProductionAuthorizationPrompt({
    ...runtime,
    ownershipTokenDigest: "[redacted]",
  }, localReview, candidate, {
    runRef: "run:30426035584",
  });
  assert.equal(prompt.candidateDigest, candidate.candidateDigest);
});
test("authorization prompt fails closed without current runtime readiness or a bound loopback review surface", async () => {
  const localReview = createLocalReviewCandidate(runtime, trees);
  const candidate = await createProductionReleaseCandidate({localReview, readiness, sourceRevision, sourceTree, agenticCanvasOsRevision: docsRevision, agenticCanvasOsTree: docsTree});
  for (const drift of [
    { status: "blocked", ready: false },
    { host: "review.example.test" },
    { ports: { ...runtime.ports, apex: 0 } },
    { probes: { ...runtime.probes, apex: 503 } },
  ]) {
    assert.throws(
      () => createProductionAuthorizationPrompt(
        { ...runtime, ...drift },
        localReview,
        candidate,
        { runRef: "run:30426035584" },
      ),
      /runtime-ready|loopback|probes|drifted/,
    );
  }
});
test("authorization prompt rejects candidate, source, run-reference, and rendered-evidence drift", async () => {
  const localReview = createLocalReviewCandidate(runtime, trees);
  const candidate = await createProductionReleaseCandidate({localReview, readiness, sourceRevision, sourceTree, agenticCanvasOsRevision: docsRevision, agenticCanvasOsTree: docsTree});
  assert.throws(
    () => createProductionAuthorizationPrompt(runtime, localReview, {
      ...candidate,
      localReviewCandidateDigest: "2".repeat(64),
    }, { runRef: "run:30426035584" }),
    /digest|drifted/,
  );
  assert.throws(
    () => createProductionAuthorizationPrompt(runtime, localReview, candidate, {
      runRef: "run with whitespace",
    }),
    /bounded run reference/,
  );
  const prompt = createProductionAuthorizationPrompt(runtime, localReview, candidate, {
    runRef: "run:30426035584",
  });
  assert.throws(
    () => validateProductionAuthorizationPrompt({
      ...prompt,
      localhostReviewUrl: "https://review.example.test/",
    }),
    /localhost|malformed/,
  );
});
