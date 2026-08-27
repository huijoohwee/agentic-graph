import assert from "node:assert/strict";
import test from "node:test";
import Ajv from "ajv/dist/2020.js";
import {
  VOICE_STUDIO_OUTPUT_SCHEMA,
  VOICE_STUDIO_REQUEST_SCHEMA_VERSION,
  VOICE_STUDIO_TOOL_NAME,
  voiceStudioRequestDigest,
} from "../../contracts/voice-studio.schema.js";
import { createVoiceStudioRuntime } from "../voice-studio-runtime.js";

const NOW = 2_000_000_000_000;
const validateOutput = new Ajv({ strict: false }).compile(VOICE_STUDIO_OUTPUT_SCHEMA);
const inputFor = (suffix, maxActualCostUsd = 1.25) => ({
  schemaVersion: VOICE_STUDIO_REQUEST_SCHEMA_VERSION,
  operation: "clone",
  mode: "live",
  requestId: `request-cost-${suffix}`,
  idempotencyKey: `voice-cost-${suffix}-0001`,
  approvalReceiptId: `approval-cost-${suffix}`,
  costPolicy: {
    currency: "USD",
    maxActualCostUsd,
    maxProviderCalls: 1,
    maxNetworkCalls: 1,
  },
  limits: {
    maxDurationMs: 300_000,
    maxBytes: 100_000_000,
    maxTextCharacters: 20_000,
    timeoutMs: 1_000,
  },
  sourceAudio: {
    artifactId: "audio-cost-source",
    sha256: "a".repeat(64),
    mediaType: "audio/webm",
    bytes: 1024,
    durationMs: 20_000,
  },
  speakerAuthorization: {
    consentReceiptId: "consent-cost-owner",
    rightsReceiptId: "rights-cost-owner",
    permittedUses: ["private studio creation"],
    disclosureRequired: true,
    retentionPolicy: "session-only",
  },
  profileIntent: {
    profileId: "profile-cost-owner",
    displayName: "Cost owner",
  },
});

const runtimeFor = ({
  adapter,
  ledger = new Map(),
  costEvidenceVerifier = async request => ({
    ...request,
    ok: true,
    settled: true,
    revoked: false,
    receiptId: `cost-receipt-${request.requestId}`,
  }),
}) => createVoiceStudioRuntime({
  adapter,
  ledger,
  now: () => NOW,
  approvalVerifier: async request => ({
    ...request,
    ok: true,
    approved: true,
    revoked: false,
    expiresAt: NOW + 60_000,
  }),
  rightsVerifier: async request => ({
    ...request,
    ok: true,
    status: "active",
    revoked: false,
    publicFigure: false,
    permitted: true,
    disclosureRequired: true,
    disclosureLabel: null,
    intendedAudience: null,
    retentionPolicy: request.retentionPolicy,
    expiresAt: NOW + 60_000,
  }),
  sourceArtifactResolver: async expected => ({ ...expected }),
  outputArtifactVerifier: async (_artifact, { expected }) => ({ ...expected }),
  costEvidenceVerifier,
});

const adapterFor = ({ estimate = 1.25, actual = 1.25, onRun = () => {} } = {}) => ({
  estimate: async input => ({
    ok: true,
    zeroSpend: true,
    requestDigest: voiceStudioRequestDigest(input),
    currency: "USD",
    estimatedActualCostUsd: estimate,
    estimatedProviderCalls: 1,
    estimatedNetworkCalls: 1,
  }),
  run: async () => {
    onRun();
    return {
      ok: true,
      adapterId: "cost-test-adapter",
      capabilityRevision: "cost-test-v1",
      providerCalls: 1,
      networkCalls: 1,
      actualCostUsd: actual,
      currency: "USD",
      costIncomplete: false,
      profileRevision: "profile-cost-revision",
      artifact: {
        artifactId: "profile-cost-artifact",
        sha256: "b".repeat(64),
        kind: "voice-profile",
        mediaType: "application/vnd.agenticgraph.voice-profile+json",
        bytes: 512,
      },
    };
  },
});

test("verified zero-spend estimate blocks over-budget execution before dispatch", async () => {
  let runCalls = 0;
  const input = inputFor("estimate-block", 1);
  const result = await runtimeFor({
    adapter: adapterFor({ estimate: 1.01, onRun: () => { runCalls += 1; } }),
  }).run(VOICE_STUDIO_TOOL_NAME, input);
  assert.equal(validateOutput(result), true, JSON.stringify(validateOutput.errors));
  assert.equal(result.error.code, "cost_policy_exceeded");
  assert.equal(result.state, "blocked");
  assert.equal(result.proof.costEstimateVerified, true);
  assert.equal(result.proof.externalCallAttempted, false);
  assert.equal(result.cost.estimatedCostUsd, 1.01);
  assert.equal(runCalls, 0);
});

test("malformed requests still return a closed schema-valid failure receipt", async () => {
  const malformed = inputFor("malformed");
  delete malformed.speakerAuthorization.permittedUses;
  const result = await runtimeFor({ adapter: adapterFor() })
    .run(VOICE_STUDIO_TOOL_NAME, malformed);
  assert.equal(validateOutput(result), true, JSON.stringify(validateOutput.errors));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "speaker_authorization_required");
  assert.equal(result.proof.externalCallAttempted, false);
});

test("exact cost cap completes with independent settlement evidence", async () => {
  const result = await runtimeFor({ adapter: adapterFor() })
    .run(VOICE_STUDIO_TOOL_NAME, inputFor("exact-cap"));
  assert.equal(validateOutput(result), true, JSON.stringify(validateOutput.errors));
  assert.equal(result.ok, true);
  assert.equal(result.cost.actualCostUsd, 1.25);
  assert.equal(result.cost.estimatedCostUsd, 1.25);
  assert.equal(result.cost.evidenceReceiptId, "cost-receipt-request-cost-exact-cap");
  assert.equal(result.proof.costEstimateVerified, true);
  assert.equal(result.proof.costEvidenceVerified, true);
});

test("settled overage is terminal, reconciliation-required, and replay-safe", async () => {
  const ledger = new Map();
  let runCalls = 0;
  const input = inputFor("settled-overage");
  const runtime = runtimeFor({
    ledger,
    adapter: adapterFor({ actual: 1.26, onRun: () => { runCalls += 1; } }),
  });
  const first = await runtime.run(VOICE_STUDIO_TOOL_NAME, input);
  const replay = await runtime.run(VOICE_STUDIO_TOOL_NAME, structuredClone(input));
  for (const result of [first, replay]) {
    assert.equal(validateOutput(result), true, JSON.stringify(validateOutput.errors));
    assert.equal(result.error.code, "cost_policy_exceeded");
    assert.equal(result.state, "failed");
    assert.equal(result.cost.incomplete, false);
    assert.equal(result.cost.actualCostUsd, 1.26);
    assert.equal(result.proof.costEvidenceVerified, true);
    assert.equal(result.proof.reconciliationRequired, true);
  }
  assert.equal(first.cached, false);
  assert.equal(replay.cached, true);
  assert.equal(runCalls, 1);
});
