import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import Ajv from "ajv/dist/2020.js";
import {
  VOICE_STUDIO_OUTPUT_SCHEMA,
  VOICE_STUDIO_REQUEST_SCHEMA_VERSION,
  VOICE_STUDIO_TOOL_NAME,
  voiceStudioRequestDigest,
} from "../../contracts/voice-studio.schema.js";
import { buildKnowgrphLocalMcpToolDefinitions } from "../local-tool-contract.js";
import { createVoiceStudioRuntime } from "../voice-studio-runtime.js";

const NOW = 2_000_000_000_000;
const hash = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const repeatedSha = value => value.repeat(64);
const validateOutput = new Ajv({ strict: false }).compile(VOICE_STUDIO_OUTPUT_SCHEMA);
const assertValidOutput = output =>
  assert.equal(validateOutput(output), true, JSON.stringify(validateOutput.errors));
const common = (operation, suffix) => ({
  schemaVersion: VOICE_STUDIO_REQUEST_SCHEMA_VERSION,
  operation,
  mode: "dry-run",
  requestId: `request-${suffix}`,
  idempotencyKey: `voice-${suffix}-0001`,
  approvalReceiptId: `approval-${suffix}-0001`,
  costPolicy: {
    currency: "USD",
    maxActualCostUsd: 10,
    maxProviderCalls: 1,
    maxNetworkCalls: 1,
  },
  limits: {
    maxDurationMs: operation === "dictate" ? 3_600_000 : operation === "create" ? 900_000 : 300_000,
    maxBytes: operation === "clone" ? 100_000_000 : 500_000_000,
    maxTextCharacters: operation === "dictate" ? 200_000 : 20_000,
    timeoutMs: 1_000,
  },
});
const cloneInput = (overrides = {}) => ({
  ...common("clone", "clone"),
  sourceAudio: {
    artifactId: "audio-clone-1",
    sha256: repeatedSha("a"),
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
const dictateInput = (overrides = {}) => ({
  ...common("dictate", "dictate"),
  sourceAudio: {
    artifactId: "audio-dictate-1",
    sha256: repeatedSha("b"),
    mediaType: "audio/webm",
    bytes: 2048,
    durationMs: 30_000,
  },
  recordingAuthorization: {
    rightsReceiptId: "rights-recording-0001",
    participantNotice: "All participants were notified.",
  },
  transcription: { language: "en-SG", timestamps: true, diarization: false },
  ...overrides,
});
const createInput = (overrides = {}) => ({
  ...common("create", "create"),
  sourceText: { artifactId: "text-create-1", sha256: repeatedSha("c"), characters: 24 },
  voiceProfile: { profileId: "profile-owner", profileRevision: "profile-revision-0001" },
  intendedUse: "private accessibility narration",
  disclosure: { label: "Synthetic voice", intendedAudience: "Private review" },
  output: { mediaType: "audio/wav", sampleRateHz: 24_000, channels: 1 },
  ...overrides,
});

const approvalVerifier = async request => ({
  ...request,
  ok: true,
  approved: true,
  revoked: false,
  expiresAt: NOW + 60_000,
});
const rightsVerifier = async request => ({
  ...request,
  ok: true,
  status: "active",
  revoked: false,
  publicFigure: false,
  permitted: true,
  consentReceiptId: request.consentReceiptId || null,
  rightsReceiptId: request.rightsReceiptId || "rights-profile-0001",
  permittedUses: request.permittedUses || [],
  participantNotice: request.participantNotice || null,
  intendedUse: request.intendedUse || null,
  disclosureRequired: request.operation !== "dictate",
  disclosureLabel: request.disclosureLabel || null,
  intendedAudience: request.intendedAudience || null,
  retentionPolicy: request.retentionPolicy || "session-only",
  expiresAt: NOW + 60_000,
});
const sourceArtifactResolver = async expected => ({ ...expected });
const outputArtifactVerifier = async (_artifact, { expected }) => ({ ...expected });
const costEvidenceVerifier = async request => ({
  ...request,
  ok: true,
  settled: true,
  revoked: false,
  receiptId: `cost-${request.requestId}`,
});

const adapterFor = (onCall = () => {}) => ({
  estimate: async input => ({
    ok: true,
    zeroSpend: true,
    requestDigest: voiceStudioRequestDigest(input),
    currency: "USD",
    estimatedActualCostUsd: 0,
    estimatedProviderCalls: 0,
    estimatedNetworkCalls: 0,
  }),
  run: async input => {
    onCall(input);
    const base = {
      ok: true,
      adapterId: "deterministic-test-adapter",
      capabilityRevision: "capability-revision-0001",
      providerCalls: 0,
      actualCostUsd: 0,
      networkCalls: 0,
      currency: "USD",
      costIncomplete: false,
      privateProviderToken: "must-not-leak",
      rawEmbedding: "must-not-leak",
    };
    if (input.operation === "clone") {
      return {
        ...base,
        profileRevision: "profile-revision-0002",
        artifact: {
          artifactId: "profile-owner:revision-2",
          sha256: repeatedSha("d"),
          kind: "voice-profile",
          mediaType: "application/vnd.knowgrph.voice-profile+json",
          bytes: 512,
        },
      };
    }
    if (input.operation === "dictate") {
      const transcript = "A bounded adapter transcript.";
      return {
        ...base,
        transcript,
        language: "en-SG",
        confidenceReported: false,
        segments: [{ text: transcript, startMs: 0, endMs: 2_000 }],
        artifact: {
          artifactId: "transcript-dictate-1",
          sha256: hash(transcript),
          kind: "text",
          mediaType: "text/plain",
          bytes: Buffer.byteLength(transcript),
        },
      };
    }
    return {
      ...base,
      artifact: {
        artifactId: "audio-create-1",
        sha256: repeatedSha("f"),
        kind: "audio",
        mediaType: "audio/wav",
        bytes: 4096,
        durationMs: 2_000,
        sampleRateHz: 24_000,
        channels: 1,
      },
    };
  },
});
const liveRuntime = (overrides = {}) => createVoiceStudioRuntime({
  adapter: adapterFor(),
  approvalVerifier,
  rightsVerifier,
  sourceArtifactResolver,
  outputArtifactVerifier,
  costEvidenceVerifier,
  now: () => NOW,
  ...overrides,
});

test("local MCP definitions expose exactly one three-operation voice facade", () => {
  const definitions = buildKnowgrphLocalMcpToolDefinitions()
    .filter(tool => tool.name === VOICE_STUDIO_TOOL_NAME);
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0].annotations.idempotentHint, true);
  assert.equal(definitions[0].inputSchema.oneOf.length, 3);
});

test("dry-run is deterministic, zero-call, zero-write, schema-valid, and replay-safe", async () => {
  let adapterCalls = 0;
  const runtime = createVoiceStudioRuntime({ adapter: adapterFor(() => { adapterCalls += 1; }) });
  const first = await runtime.run(VOICE_STUDIO_TOOL_NAME, cloneInput());
  const replay = await runtime.run(VOICE_STUDIO_TOOL_NAME, structuredClone(cloneInput()));
  assertValidOutput(first);
  assertValidOutput(replay);
  assert.equal(first.ok, true);
  assert.match(first.proof.requestDigest, /^[a-f0-9]{64}$/);
  assert.equal(first.proof.networkCalls, 0);
  assert.equal(first.proof.repositoryWrites, 0);
  assert.equal(first.proof.sourceArtifactVerified, false);
  assert.equal(replay.cached, true);
  assert.deepEqual({ ...replay, cached: false }, first);
  assert.equal(adapterCalls, 0);
});

test("dry-run dictates and creates plans without fabricated output", async () => {
  const runtime = createVoiceStudioRuntime();
  for (const input of [dictateInput(), createInput()]) {
    const result = await runtime.run(VOICE_STUDIO_TOOL_NAME, input);
    assertValidOutput(result);
    assert.deepEqual(result.result, { kind: "plan", next: "live-adapter-required" });
    assert.deepEqual(result.artifacts, []);
    assert.equal(result.proof.externalCallAttempted, false);
  }
});

test("every live dependency fails closed separately before provider work", async () => {
  const input = cloneInput({ mode: "live" });
  const configurations = [
    [{}, "approval_verifier_unavailable"],
    [{ approvalVerifier }, "rights_verifier_unavailable"],
    [{ approvalVerifier, rightsVerifier }, "source_artifact_resolver_unavailable"],
    [{ approvalVerifier, rightsVerifier, sourceArtifactResolver }, "output_artifact_verifier_unavailable"],
    [{ approvalVerifier, rightsVerifier, sourceArtifactResolver, outputArtifactVerifier }, "cost_evidence_verifier_unavailable"],
    [{
      approvalVerifier,
      rightsVerifier,
      sourceArtifactResolver,
      outputArtifactVerifier,
      costEvidenceVerifier,
    }, "voice_adapter_unavailable"],
  ];
  for (const [configuration, code] of configurations) {
    const result = await createVoiceStudioRuntime(configuration)
      .run(VOICE_STUDIO_TOOL_NAME, input);
    assertValidOutput(result);
    assert.equal(result.error.code, code);
    assert.equal(result.proof.externalCallAttempted, false);
  }
});

test("expired, revoked, or mismatched approval receipts never reach rights or adapter work", async () => {
  const mutations = [
    { expiresAt: NOW },
    { revoked: true },
    { receiptId: "approval-wrong-0001" },
    { operation: "create" },
    { requestId: "request-wrong" },
    { requestDigest: repeatedSha("9") },
    { mode: "dry-run" },
    { scope: "wrong:scope" },
    { costPolicy: { currency: "USD", maxActualCostUsd: 9, maxProviderCalls: 1, maxNetworkCalls: 1 } },
  ];
  for (const mutation of mutations) {
    let adapterCalls = 0;
    let rightsCalls = 0;
    const runtime = liveRuntime({
      adapter: adapterFor(() => { adapterCalls += 1; }),
      approvalVerifier: async request => ({ ...(await approvalVerifier(request)), ...mutation }),
      rightsVerifier: async request => {
        rightsCalls += 1;
        return rightsVerifier(request);
      },
    });
    const result = await runtime.run(VOICE_STUDIO_TOOL_NAME, cloneInput({ mode: "live" }));
    assertValidOutput(result);
    assert.equal(result.error.code, "approval_denied");
    assert.equal(rightsCalls, 0);
    assert.equal(adapterCalls, 0);
  }
});

test("rights bind expiry, revocation, public-figure state, request digest, and operation-specific scope", async () => {
  const cloneMutations = [
    { expiresAt: NOW },
    { revoked: true },
    { publicFigure: true },
    { permitted: false },
    { requestDigest: repeatedSha("8") },
    { consentReceiptId: "consent-wrong-0001" },
    { rightsReceiptId: "rights-wrong-0001" },
    { permittedUses: ["public impersonation"] },
    { disclosureRequired: false },
    { retentionPolicy: "30-days" },
  ];
  for (const mutation of cloneMutations) {
    let calls = 0;
    const result = await liveRuntime({
      adapter: adapterFor(() => { calls += 1; }),
      rightsVerifier: async request => ({ ...(await rightsVerifier(request)), ...mutation }),
    }).run(VOICE_STUDIO_TOOL_NAME, cloneInput({ mode: "live" }));
    assert.equal(result.error.code, "voice_rights_denied");
    assert.equal(calls, 0);
  }
  const dictateDenied = await liveRuntime({
    rightsVerifier: async request => ({
      ...(await rightsVerifier(request)),
      participantNotice: "Notice mismatch",
    }),
  }).run(VOICE_STUDIO_TOOL_NAME, dictateInput({ mode: "live" }));
  assert.equal(dictateDenied.error.code, "voice_rights_denied");
  for (const mutation of [
    { intendedUse: "deceptive impersonation" },
    { disclosureRequired: false },
    { disclosureLabel: "Undisclosed" },
    { intendedAudience: "Public broadcast" },
  ]) {
    const createDenied = await liveRuntime({
      rightsVerifier: async request => ({ ...(await rightsVerifier(request)), ...mutation }),
    }).run(VOICE_STUDIO_TOOL_NAME, createInput({ mode: "live" }));
    assert.equal(createDenied.error.code, "voice_rights_denied");
  }
});

test("source artifact resolver compares exact digest and metadata before adapter dispatch", async () => {
  let calls = 0;
  const result = await liveRuntime({
    adapter: adapterFor(() => { calls += 1; }),
    sourceArtifactResolver: async expected => ({ ...expected, sha256: repeatedSha("0") }),
  }).run(VOICE_STUDIO_TOOL_NAME, cloneInput({ mode: "live" }));
  assertValidOutput(result);
  assert.equal(result.error.code, "source_artifact_verification_failed");
  assert.equal(result.proof.externalCallAttempted, false);
  assert.equal(calls, 0);
});

test("injected adapter proves all operations: clone, dictate, and create with exact evidence", async () => {
  let calls = 0;
  const runtime = liveRuntime({ adapter: adapterFor(() => { calls += 1; }) });
  const inputs = [
    cloneInput({ mode: "live" }),
    dictateInput({ mode: "live" }),
    createInput({ mode: "live" }),
  ];
  const results = [];
  for (const input of inputs) results.push(await runtime.run(VOICE_STUDIO_TOOL_NAME, input));
  assert.deepEqual(results.map(result => result.result.kind), ["voice-profile", "transcript", "audio"]);
  for (const result of results) {
    assertValidOutput(result);
    assert.equal(result.ok, true);
    assert.equal(result.state, "completed");
    assert.equal(result.proof.sourceArtifactVerified, true);
    assert.equal(result.proof.readBackVerified, true);
    assert.equal(result.proof.costEstimateVerified, true);
    assert.equal(result.proof.costEvidenceVerified, true);
    assert.equal(result.cost.incomplete, false);
    assert.match(result.cost.evidenceReceiptId, /^cost-/);
    assert.equal(result.rights.expiresAt, NOW + 60_000);
    assert.equal(result.rights.revoked, false);
    assert.equal(result.rights.publicFigure, false);
    assert.equal(result.rights.permitted, true);
    assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
  }
  assert.equal(results[1].result.segments.map(segment => segment.text).join(""), results[1].result.text);
  assert.equal(results[2].rights.intendedUse, createInput().intendedUse);
  assert.equal(results[2].provenance.profileRevision, createInput().voiceProfile.profileRevision);
  assert.equal(calls, 3);
});

test("transcript segments must reconstruct text and honor timestamps and diarization", async () => {
  const transcript = "first second";
  const invalidAdapter = adapterFor();
  invalidAdapter.run = async () => ({
    ok: true,
    adapterId: "deterministic-test-adapter",
    capabilityRevision: "capability-revision-0001",
    providerCalls: 0,
    networkCalls: 0,
    actualCostUsd: 0,
    currency: "USD",
    costIncomplete: false,
    transcript,
    language: "en-SG",
    segments: [
      { text: "first", startMs: 0, endMs: 500 },
      { text: "second", startMs: 400, endMs: 900 },
    ],
    artifact: {
      artifactId: "transcript-invalid-1",
      sha256: hash(transcript),
      kind: "text",
      mediaType: "text/plain",
      bytes: Buffer.byteLength(transcript),
    },
  });
  const result = await liveRuntime({ adapter: invalidAdapter })
    .run(VOICE_STUDIO_TOOL_NAME, dictateInput({ mode: "live" }));
  assertValidOutput(result);
  assert.equal(result.error.code, "adapter_result_invalid");
  assert.equal(result.cost.incomplete, false);
  assert.equal(result.proof.costEvidenceVerified, true);
  assert.equal(result.proof.reconciliationRequired, true);
});

test("missing, incomplete, and overreported cost evidence cannot produce completed output", async () => {
  for (const mutation of [
    { providerCalls: undefined },
    { networkCalls: undefined },
    { actualCostUsd: undefined },
    { costIncomplete: true },
    { providerCalls: 2 },
    { networkCalls: 2 },
  ]) {
    const adapter = adapterFor();
    const original = adapter.run;
    adapter.run = async input => ({ ...(await original(input)), ...mutation });
    const result = await liveRuntime({ adapter }).run(
      VOICE_STUDIO_TOOL_NAME,
      createInput({ mode: "live" }),
    );
    assertValidOutput(result);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "cost_evidence_verification_failed");
    assert.equal(result.cost.incomplete, true);
    assert.equal(result.proof.reconciliationRequired, true);
  }
});

test("independent output read-back must match exact digest, metadata, and provenance", async () => {
  const result = await liveRuntime({
    outputArtifactVerifier: async (_artifact, { expected }) => ({
      ...expected,
      sourceDigests: [repeatedSha("0")],
    }),
  }).run(VOICE_STUDIO_TOOL_NAME, createInput({ mode: "live" }));
  assertValidOutput(result);
  assert.equal(result.error.code, "output_artifact_verification_failed");
  assert.equal(result.cost.incomplete, false);
  assert.equal(result.proof.costEvidenceVerified, true);
  assert.equal(result.proof.readBackVerified, false);
  assert.equal(result.proof.reconciliationRequired, true);
});

test("concurrent exact requests share one in-flight terminal result and dispatch once", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const adapter = adapterFor();
  const original = adapter.run;
  adapter.run = async input => {
    calls += 1;
    await gate;
    return original(input);
  };
  const runtime = liveRuntime({ adapter });
  const input = createInput({ mode: "live", idempotencyKey: "voice-concurrent-0001" });
  const firstPending = runtime.run(VOICE_STUDIO_TOOL_NAME, input);
  const secondPending = runtime.run(VOICE_STUDIO_TOOL_NAME, structuredClone(input));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  const [first, second] = await Promise.all([firstPending, secondPending]);
  assertValidOutput(first);
  assertValidOutput(second);
  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.deepEqual({ ...second, cached: false }, first);
});

test("mid-dispatch cancellation terminal reconciliation survives runtime restart and never redispatches", async () => {
  const ledger = new Map();
  const controller = new AbortController();
  let started;
  const began = new Promise(resolve => { started = resolve; });
  let initialCalls = 0;
  const firstRuntime = liveRuntime({
    ledger,
    adapter: {
      ...adapterFor(),
      run: async () => {
        initialCalls += 1;
        started();
        return new Promise(() => {});
      },
    },
  });
  const input = createInput({
    mode: "live",
    idempotencyKey: "voice-midflight-cancel-0001",
  });
  const pending = firstRuntime.run(
    VOICE_STUDIO_TOOL_NAME,
    input,
    { signal: controller.signal },
  );
  await began;
  controller.abort();
  const canceled = await pending;
  assertValidOutput(canceled);
  assert.equal(canceled.state, "canceled");
  assert.equal(canceled.proof.reconciliationRequired, true);
  assert.equal(canceled.cost.incomplete, true);
  let restartedCalls = 0;
  const restarted = liveRuntime({
    ledger,
    adapter: adapterFor(() => { restartedCalls += 1; }),
  });
  const replay = await restarted.run(VOICE_STUDIO_TOOL_NAME, structuredClone(input));
  assertValidOutput(replay);
  assert.equal(replay.cached, true);
  assert.equal(replay.state, "canceled");
  assert.equal(replay.proof.reconciliationRequired, true);
  assert.equal(initialCalls, 1);
  assert.equal(restartedCalls, 0);
  const conflict = await restarted.run(
    VOICE_STUDIO_TOOL_NAME,
    createInput({
      mode: "live",
      requestId: "request-changed",
      idempotencyKey: input.idempotencyKey,
    }),
  );
  assert.equal(conflict.error.code, "idempotency_conflict");
  assert.equal(restartedCalls, 0);
});

test("terminal failures replay until configurable TTL expires", async () => {
  const ledger = new Map();
  let clock = NOW;
  let calls = 0;
  const runtime = liveRuntime({
    ledger,
    idempotencyTtlMs: 100,
    now: () => clock,
    adapter: adapterFor(() => { calls += 1; }),
    outputArtifactVerifier: async (_artifact, { expected }) => ({
      ...expected,
      requestDigest: repeatedSha("0"),
    }),
  });
  const input = createInput({ mode: "live", idempotencyKey: "voice-ttl-result-0001" });
  const first = await runtime.run(VOICE_STUDIO_TOOL_NAME, input);
  const replay = await runtime.run(VOICE_STUDIO_TOOL_NAME, input);
  assert.equal(first.ok, false);
  assert.equal(first.error.code, "output_artifact_verification_failed");
  assert.equal(replay.cached, true);
  assert.equal(calls, 1);
  clock += 101;
  const afterExpiry = await runtime.run(VOICE_STUDIO_TOOL_NAME, input);
  assert.equal(afterExpiry.ok, false);
  assert.equal(afterExpiry.cached, false);
  assert.equal(calls, 2);
  assert.throws(
    () => createVoiceStudioRuntime({ idempotencyTtlMs: 86_400_001 }),
    /between 1 and 24 hours/,
  );
});

test("request digest and explicit approval scope are bound into both verifiers", async () => {
  let approvalObserved;
  let rightsObserved;
  const runtime = liveRuntime({
    approvalVerifier: async request => {
      approvalObserved = request;
      return approvalVerifier(request);
    },
    rightsVerifier: async request => {
      rightsObserved = request;
      return rightsVerifier(request);
    },
  });
  const input = createInput({ mode: "live" });
  const result = await runtime.run(VOICE_STUDIO_TOOL_NAME, input);
  assert.equal(result.ok, true);
  assert.equal(approvalObserved.requestDigest, voiceStudioRequestDigest(input));
  assert.equal(approvalObserved.scope, "knowgrph.voice.studio:create:live");
  assert.equal(rightsObserved.requestDigest, voiceStudioRequestDigest(input));
  assert.equal(rightsObserved.profileId, input.voiceProfile.profileId);
  assert.equal(rightsObserved.profileRevision, input.voiceProfile.profileRevision);
  assert.equal(rightsObserved.intendedUse, input.intendedUse);
});
