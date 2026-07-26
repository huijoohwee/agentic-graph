import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import Ajv from "ajv/dist/2020.js";
import { stableStringify } from "../semantic-key.js";
import {
  VOICE_STUDIO_INPUT_SCHEMA,
  VOICE_STUDIO_INVOCATIONS,
  VOICE_STUDIO_OPERATIONS,
  VOICE_STUDIO_OUTPUT_SCHEMA,
  VOICE_STUDIO_REQUEST_SCHEMA_VERSION,
  VOICE_STUDIO_RESULT_SCHEMA_VERSION,
  VOICE_STUDIO_TOOL_NAME,
  validateVoiceStudioInput,
  voiceStudioRequestDigest,
} from "../voice-studio.schema.js";

const sha = "a".repeat(64);
const limits = {
  maxDurationMs: 300_000,
  maxBytes: 100_000_000,
  maxTextCharacters: 20_000,
  timeoutMs: 120_000,
};
const costPolicy = {
  currency: "USD",
  maxActualCostUsd: 10,
  maxProviderCalls: 1,
  maxNetworkCalls: 1,
};
const cloneInput = (overrides = {}) => ({
  schemaVersion: VOICE_STUDIO_REQUEST_SCHEMA_VERSION,
  operation: "clone",
  mode: "dry-run",
  requestId: "request-clone",
  idempotencyKey: "voice-clone-0001",
  approvalReceiptId: "approval-clone-0001",
  costPolicy,
  limits,
  sourceAudio: {
    artifactId: "audio-sample-1",
    sha256: sha,
    mediaType: "audio/webm",
    bytes: 1024,
    durationMs: 20_000,
  },
  speakerAuthorization: {
    consentReceiptId: "consent-owner-0001",
    rightsReceiptId: "rights-owner-0001",
    permittedUses: ["private studio creation"],
    disclosureRequired: true,
    retentionPolicy: "session-only",
  },
  profileIntent: { profileId: "profile-owner", displayName: "Owner voice" },
  ...overrides,
});
const createInput = (overrides = {}) => ({
  schemaVersion: VOICE_STUDIO_REQUEST_SCHEMA_VERSION,
  operation: "create",
  mode: "live",
  requestId: "request-create",
  idempotencyKey: "voice-create-0001",
  approvalReceiptId: "approval-create-0001",
  costPolicy,
  limits: { ...limits, maxDurationMs: 900_000, maxBytes: 500_000_000 },
  sourceText: { artifactId: "text-create-1", sha256: "b".repeat(64), characters: 24 },
  voiceProfile: { profileId: "profile-owner", profileRevision: "profile-revision-0001" },
  intendedUse: "private accessibility narration",
  disclosure: { label: "Synthetic voice", intendedAudience: "Private review" },
  output: { mediaType: "audio/wav", sampleRateHz: 24_000, channels: 1 },
  ...overrides,
});

test("voice studio publishes one MCP tool and three exact ACOS routes", () => {
  assert.equal(VOICE_STUDIO_TOOL_NAME, "knowgrph.voice.studio");
  assert.deepEqual(VOICE_STUDIO_OPERATIONS, ["clone", "dictate", "create"]);
  assert.deepEqual(Object.values(VOICE_STUDIO_INVOCATIONS).map(entry => entry.text), [
    "/voice.studio #voice-clone @audio @voice-profile @approval-gate @cost-log @runtime-proof",
    "/voice.studio #speech-to-text @audio @text @approval-gate @cost-log @runtime-proof",
    "/voice.studio #text-to-speech @text @voice-profile @audio @approval-gate @cost-log @runtime-proof",
  ]);
});

test("closed schema accepts exact requests and rejects unsafe fields, cost drift, and missing intended use", () => {
  const validate = new Ajv({ strict: false }).compile(VOICE_STUDIO_INPUT_SCHEMA);
  assert.equal(validate(cloneInput()), true, JSON.stringify(validate.errors));
  assert.equal(validate(createInput()), true, JSON.stringify(validate.errors));
  for (const forbidden of [
    { providerApiKey: "secret" },
    { sourcePath: "/tmp/sample.wav" },
    { audioBase64: "AAAA" },
    { adapter: { endpoint: "https://provider.invalid" } },
    { costPolicy: { ...costPolicy, maxActualCostUsd: Number.POSITIVE_INFINITY } },
    { costPolicy: { ...costPolicy, maxProviderCalls: 2 } },
  ]) {
    const candidate = { ...cloneInput(), ...forbidden };
    assert.equal(validate(candidate), false);
    assert.equal(validateVoiceStudioInput(candidate).valid, false);
  }
  const withoutUse = createInput();
  delete withoutUse.intendedUse;
  assert.equal(validate(withoutUse), false);
  assert.equal(validateVoiceStudioInput(withoutUse).valid, false);
  const undisclosedClone = cloneInput({
    speakerAuthorization: { ...cloneInput().speakerAuthorization, disclosureRequired: false },
  });
  assert.equal(validate(undisclosedClone), false);
  assert.equal(validateVoiceStudioInput(undisclosedClone).valid, false);
});

test("pure input validation matches JSON Schema for uniqueness, lengths, and numeric bounds", () => {
  const validate = new Ajv({ strict: false }).compile(VOICE_STUDIO_INPUT_SCHEMA);
  const candidates = [
    cloneInput(),
    cloneInput({
      speakerAuthorization: {
        ...cloneInput().speakerAuthorization,
        permittedUses: ["private studio creation", "private studio creation"],
      },
    }),
    cloneInput({ profileIntent: { profileId: "profile-owner", displayName: "x".repeat(81) } }),
    cloneInput({ sourceAudio: { ...cloneInput().sourceAudio, bytes: 500_000_001 } }),
    cloneInput({ limits: { ...limits, timeoutMs: 120_001 } }),
    createInput({ intendedUse: "x".repeat(121) }),
    createInput({ disclosure: { label: "x".repeat(241), intendedAudience: "Private review" } }),
    createInput({ sourceText: { ...createInput().sourceText, characters: 20_001 } }),
  ];
  for (const candidate of candidates) {
    const schemaValid = validate(candidate);
    const pureValid = validateVoiceStudioInput(candidate).valid;
    assert.equal(pureValid, schemaValid, JSON.stringify({ candidate, errors: validate.errors }));
  }
});

test("operation bounds fail before adapter selection", () => {
  assert.equal(validateVoiceStudioInput(cloneInput({
    sourceAudio: { ...cloneInput().sourceAudio, durationMs: 300_001 },
  })).errors.some(error => error.code === "source_duration_exceeded"), true);
  assert.equal(validateVoiceStudioInput(cloneInput({
    limits: { ...limits, maxBytes: 100 },
  })).errors.some(error => error.code === "source_bytes_exceeded"), true);
  assert.equal(validateVoiceStudioInput(createInput({
    limits: { ...createInput().limits, maxTextCharacters: 10 },
  })).errors.some(error => error.code === "source_text_exceeded"), true);
});

test("request digest is canonical full SHA-256 and security-field sensitive", () => {
  const input = cloneInput();
  const expected = crypto.createHash("sha256").update(stableStringify(input), "utf8").digest("hex");
  assert.equal(voiceStudioRequestDigest(input), expected);
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.equal(voiceStudioRequestDigest(input), voiceStudioRequestDigest(structuredClone(input)));
  const mutations = [
    { requestId: "request-other" },
    { approvalReceiptId: "approval-other-0001" },
    { mode: "live" },
    { costPolicy: { ...costPolicy, maxActualCostUsd: 5 } },
    { limits: { ...limits, timeoutMs: 10_000 } },
    { sourceAudio: { ...input.sourceAudio, sha256: "f".repeat(64) } },
    { speakerAuthorization: { ...input.speakerAuthorization, retentionPolicy: "30-days" } },
  ];
  for (const mutation of mutations) {
    assert.notEqual(voiceStudioRequestDigest(input), voiceStudioRequestDigest(cloneInput(mutation)));
  }
});

test("result schema requires exact provenance, rights, read-back proof, and exactly one terminal branch", () => {
  const validate = new Ajv({ strict: false }).compile(VOICE_STUDIO_OUTPUT_SCHEMA);
  const digest = voiceStudioRequestDigest(cloneInput());
  const output = {
    ok: true,
    schemaVersion: VOICE_STUDIO_RESULT_SCHEMA_VERSION,
    operation: "clone",
    requestId: "request-clone",
    idempotencyKey: "voice-clone-0001",
    state: "validated",
    artifacts: [{
      artifactId: "profile-owner:manifest",
      sha256: sha,
      kind: "voice-profile",
      state: "validated",
      mediaType: "application/vnd.knowgrph.voice-profile+json",
      bytes: 0,
    }],
    provenance: {
      operation: "clone",
      sourceArtifactIds: ["audio-sample-1"],
      sourceDigests: [sha],
      profileId: "profile-owner",
      profileRevision: `manifest-${digest}`,
      adapterId: "knowgrph-deterministic-dry-run",
      capabilityRevision: null,
    },
    rights: {
      approvalReceiptId: "approval-clone-0001",
      approvalScope: "knowgrph.voice.studio:clone:dry-run",
      consentReceiptId: "consent-owner-0001",
      rightsReceiptId: "rights-owner-0001",
      permittedUses: ["private studio creation"],
      participantNotice: null,
      intendedUse: null,
      intendedAudience: null,
      status: "structurally-validated",
      expiresAt: null,
      revoked: null,
      publicFigure: null,
      permitted: null,
      disclosureRequired: true,
      disclosureLabel: null,
      retentionPolicy: "session-only",
    },
    usage: { durationMs: 20_000, bytes: 1024, textCharacters: 0, adapterAttempts: 0 },
    cost: {
      providerCalls: 0,
      actualCostUsd: 0,
      currency: "USD",
      incomplete: false,
      estimatedCostUsd: 0,
      maxActualCostUsd: 10,
      maxProviderCalls: 1,
      maxNetworkCalls: 1,
      evidenceReceiptId: null,
    },
    proof: {
      mode: "dry-run",
      requestDigest: digest,
      networkCalls: 0,
      paidProviderCalls: 0,
      repositoryWrites: 0,
      externalCallAttempted: false,
      costEstimateVerified: false,
      costEvidenceVerified: false,
      sourceArtifactVerified: false,
      readBackVerified: false,
      cancellationRequested: false,
      reconciliationRequired: false,
      sensitivePayloadReturned: false,
    },
    cached: false,
    result: {
      kind: "voice-profile",
      profileId: "profile-owner",
      profileRevision: `manifest-${digest}`,
      verification: "manifest-only",
    },
  };
  assert.equal(validate(output), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...output, rawEmbedding: "forbidden" }), false);
  assert.equal(validate({ ...output, proof: { ...output.proof, requestDigest: "kg_voice_short" } }), false);
  assert.equal(validate({ ...output, error: { code: "bad", message: "bad", retryEligible: false } }), false);
});
