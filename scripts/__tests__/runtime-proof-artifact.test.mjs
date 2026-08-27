import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHostedDemoPackArtifact,
  buildReachabilityFromProof,
  extractManifestFromProof,
} from "../lib/runtime-proof-artifact.js";

function sampleManifest(overrides = {}) {
  return {
    runId: "run-proof-1",
    state: "blocked",
    mode: "live",
    stages: [
      { id: "research", status: "completed", retryCount: 0, costLog: null, artifact: null },
    ],
    approvalGates: [
      { gateId: "paid-model-call", approvalState: "pending", estimatedCostUsd: 0, token: null },
    ],
    budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0, providerSpendUsd: 0 },
    demoPack: null,
    failures: [],
    reconciliationFlags: [],
    ...overrides,
  };
}

function sampleProof(overrides = {}) {
  const manifest = sampleManifest();
  return {
    proofVersion: "1",
    generatedAt: "2026-06-10T00:00:00.000Z",
    agentApiUrl: "https://api.example.aws",
    frontendUrl: "https://app.example.vercel.app",
    mcpEndpoint: "https://airvio.co/agenticgraph/control-plane/mcp",
    authSession: { status: 201, subject: "sess_1", entitledRunIds: [] },
    runSubmission: {
      status: 202,
      runId: manifest.runId,
      state: manifest.state,
      mode: manifest.mode,
      responseBody: { result: { structuredContent: manifest } },
      manifest,
    },
    readback: {
      status: 200,
      persistedAt: "2026-06-10T00:00:10.000Z",
      contractVersion: null,
      sameRunId: true,
      sameState: true,
      sameMode: true,
      responseBody: { manifest },
      manifest,
    },
    demoPackUrls: [
      { url: "https://app.example.vercel.app", kind: "frontend" },
      { url: "https://api.example.aws", kind: "worker" },
      { url: "https://api.example.aws/health", kind: "worker_health" },
      { url: "https://airvio.co/agenticgraph/control-plane/mcp/health", kind: "control_plane" },
    ],
    ...overrides,
  };
}

test("extractManifestFromProof prefers the read-back manifest", () => {
  const proof = sampleProof();
  const manifest = extractManifestFromProof(proof);
  assert.equal(manifest.runId, "run-proof-1");
});

test("buildReachabilityFromProof marks frontend and agent-api urls reachable", () => {
  const reachability = buildReachabilityFromProof(sampleProof());
  assert.equal(reachability["https://app.example.vercel.app"].status, 200);
  assert.equal(reachability["https://api.example.aws"].status, 200);
  assert.equal(reachability["https://api.example.aws/health"].status, 200);
});

test("buildHostedDemoPackArtifact generates a contract-valid Demo_Pack from proof output", () => {
  const artifact = buildHostedDemoPackArtifact(sampleProof());
  assert.equal(artifact.runId, "run-proof-1");
  assert.equal(artifact.demoPackValidation.valid, true);
  assert.equal(artifact.demoPack.sections.length, 7);
  assert.ok(artifact.demoPack.urls.some((entry) => entry.kind === "frontend"));
  assert.ok(artifact.demoPack.urls.some((entry) => entry.kind === "worker"));
  assert.ok(artifact.demoPack.urls.some((entry) => entry.kind === "worker-health"));
});
