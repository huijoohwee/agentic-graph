import crypto from "node:crypto";
import { stableStringify } from "./semantic-key.js";

export const VOICE_STUDIO_REQUEST_SCHEMA_VERSION = "agenticgraph-voice-studio-request/v1";
export const VOICE_STUDIO_RESULT_SCHEMA_VERSION = "agenticgraph-voice-studio-result/v1";
export const VOICE_STUDIO_SCHEMA_VERSION = VOICE_STUDIO_REQUEST_SCHEMA_VERSION;
export const VOICE_STUDIO_TOOL_NAME = "agenticgraph.voice.studio";
export const VOICE_STUDIO_OPERATIONS = Object.freeze(["clone", "dictate", "create"]);
export const VOICE_STUDIO_MODES = Object.freeze(["dry-run", "live"]);
export const VOICE_STUDIO_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;
export const VOICE_STUDIO_INVOCATIONS = Object.freeze({
  clone: Object.freeze({
    command: "/voice.studio",
    semantic: "#voice-clone",
    bindings: Object.freeze(["@audio", "@voice-profile", "@approval-gate", "@cost-log", "@runtime-proof"]),
    text: "/voice.studio #voice-clone @audio @voice-profile @approval-gate @cost-log @runtime-proof",
  }),
  dictate: Object.freeze({
    command: "/voice.studio",
    semantic: "#speech-to-text",
    bindings: Object.freeze(["@audio", "@text", "@approval-gate", "@cost-log", "@runtime-proof"]),
    text: "/voice.studio #speech-to-text @audio @text @approval-gate @cost-log @runtime-proof",
  }),
  create: Object.freeze({
    command: "/voice.studio",
    semantic: "#text-to-speech",
    bindings: Object.freeze(["@text", "@voice-profile", "@audio", "@approval-gate", "@cost-log", "@runtime-proof"]),
    text: "/voice.studio #text-to-speech @text @voice-profile @audio @approval-gate @cost-log @runtime-proof",
  }),
});

export const VOICE_STUDIO_HARD_LIMITS = Object.freeze({
  clone: Object.freeze({ maxDurationMs: 300_000, maxBytes: 100_000_000, maxTextCharacters: 20_000, timeoutMs: 120_000 }),
  dictate: Object.freeze({ maxDurationMs: 3_600_000, maxBytes: 500_000_000, maxTextCharacters: 200_000, timeoutMs: 120_000 }),
  create: Object.freeze({ maxDurationMs: 900_000, maxBytes: 500_000_000, maxTextCharacters: 20_000, timeoutMs: 120_000 }),
});

const ID_PATTERN_TEXT = "^[A-Za-z0-9._:-]{3,128}$";
const KEY_PATTERN_TEXT = "^[A-Za-z0-9._:-]{8,128}$";
const SHA_PATTERN_TEXT = "^[a-f0-9]{64}$";
const ID = { type: "string", pattern: ID_PATTERN_TEXT };
const KEY = { type: "string", pattern: KEY_PATTERN_TEXT };
const SHA256 = { type: "string", pattern: SHA_PATTERN_TEXT };
const NULLABLE_ID = { oneOf: [ID, { type: "null" }] };
const BOUNDED_TEXT = { type: "string", minLength: 1, maxLength: 240 };
const AUDIO_MEDIA_TYPE = { type: "string", pattern: "^audio/[A-Za-z0-9.+-]+$" };
const RETENTION_POLICIES = ["session-only", "30-days", "max-90-days", "contract-bound"];
export const VOICE_STUDIO_MAX_POLICY_COST_USD = 1_000_000;
const COST_POLICY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["currency", "maxActualCostUsd", "maxProviderCalls", "maxNetworkCalls"],
  properties: {
    currency: { const: "USD" },
    maxActualCostUsd: { type: "number", minimum: 0, maximum: VOICE_STUDIO_MAX_POLICY_COST_USD },
    maxProviderCalls: { type: "integer", minimum: 0, maximum: 1 },
    maxNetworkCalls: { type: "integer", minimum: 0, maximum: 1 },
  },
};
const SOURCE_AUDIO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["artifactId", "sha256", "mediaType", "bytes", "durationMs"],
  properties: {
    artifactId: ID,
    sha256: SHA256,
    mediaType: AUDIO_MEDIA_TYPE,
    bytes: { type: "integer", minimum: 1, maximum: 500_000_000 },
    durationMs: { type: "integer", minimum: 1, maximum: 3_600_000 },
  },
};
const LIMITS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["maxDurationMs", "maxBytes", "maxTextCharacters", "timeoutMs"],
  properties: {
    maxDurationMs: { type: "integer", minimum: 1, maximum: 3_600_000 },
    maxBytes: { type: "integer", minimum: 1, maximum: 500_000_000 },
    maxTextCharacters: { type: "integer", minimum: 1, maximum: 200_000 },
    timeoutMs: { type: "integer", minimum: 1, maximum: 120_000 },
  },
};
const COMMON_PROPERTIES = {
  schemaVersion: { const: VOICE_STUDIO_REQUEST_SCHEMA_VERSION },
  operation: { enum: VOICE_STUDIO_OPERATIONS },
  mode: { enum: VOICE_STUDIO_MODES },
  requestId: ID,
  idempotencyKey: KEY,
  approvalReceiptId: ID,
  costPolicy: COST_POLICY_SCHEMA,
  limits: LIMITS_SCHEMA,
};
const closedOperation = (operation, required, properties) => ({
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "operation", "mode", "requestId", "idempotencyKey",
    "approvalReceiptId", "costPolicy", "limits", ...required,
  ],
  properties: { ...COMMON_PROPERTIES, operation: { const: operation }, ...properties },
});

export const VOICE_STUDIO_INPUT_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  oneOf: [
    closedOperation("clone", ["sourceAudio", "speakerAuthorization", "profileIntent"], {
      sourceAudio: SOURCE_AUDIO_SCHEMA,
      speakerAuthorization: {
        type: "object",
        additionalProperties: false,
        required: ["consentReceiptId", "rightsReceiptId", "permittedUses", "disclosureRequired", "retentionPolicy"],
        properties: {
          consentReceiptId: ID,
          rightsReceiptId: ID,
          permittedUses: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            uniqueItems: true,
            items: { type: "string", minLength: 1, maxLength: 120 },
          },
          disclosureRequired: { const: true },
          retentionPolicy: { enum: RETENTION_POLICIES },
        },
      },
      profileIntent: {
        type: "object",
        additionalProperties: false,
        required: ["profileId", "displayName"],
        properties: { profileId: ID, displayName: { type: "string", minLength: 1, maxLength: 80 } },
      },
    }),
    closedOperation("dictate", ["sourceAudio", "recordingAuthorization", "transcription"], {
      sourceAudio: SOURCE_AUDIO_SCHEMA,
      recordingAuthorization: {
        type: "object",
        additionalProperties: false,
        required: ["rightsReceiptId", "participantNotice"],
        properties: { rightsReceiptId: ID, participantNotice: BOUNDED_TEXT },
      },
      transcription: {
        type: "object",
        additionalProperties: false,
        required: ["language", "timestamps", "diarization"],
        properties: {
          language: { type: "string", minLength: 2, maxLength: 35 },
          timestamps: { type: "boolean" },
          diarization: { type: "boolean" },
        },
      },
    }),
    closedOperation("create", ["sourceText", "voiceProfile", "intendedUse", "disclosure", "output"], {
      sourceText: {
        type: "object",
        additionalProperties: false,
        required: ["artifactId", "sha256", "characters"],
        properties: {
          artifactId: ID,
          sha256: SHA256,
          characters: { type: "integer", minimum: 1, maximum: 20_000 },
        },
      },
      voiceProfile: {
        type: "object",
        additionalProperties: false,
        required: ["profileId", "profileRevision"],
        properties: { profileId: ID, profileRevision: KEY },
      },
      intendedUse: { type: "string", minLength: 1, maxLength: 120 },
      disclosure: {
        type: "object",
        additionalProperties: false,
        required: ["label", "intendedAudience"],
        properties: { label: BOUNDED_TEXT, intendedAudience: BOUNDED_TEXT },
      },
      output: {
        type: "object",
        additionalProperties: false,
        required: ["mediaType", "sampleRateHz", "channels"],
        properties: {
          mediaType: { enum: ["audio/wav", "audio/mpeg", "audio/ogg"] },
          sampleRateHz: { type: "integer", minimum: 8_000, maximum: 96_000 },
          channels: { type: "integer", minimum: 1, maximum: 2 },
        },
      },
    }),
  ],
});

const ARTIFACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["artifactId", "sha256", "kind", "state", "mediaType", "bytes"],
  properties: {
    artifactId: ID,
    sha256: SHA256,
    kind: { enum: ["audio", "text", "voice-profile"] },
    state: { enum: ["validated", "adapter-verified"] },
    mediaType: { type: "string", minLength: 1, maxLength: 120 },
    bytes: { type: "integer", minimum: 0, maximum: 500_000_000 },
    durationMs: { type: "integer", minimum: 0, maximum: 3_600_000 },
    sampleRateHz: { type: "integer", minimum: 8_000, maximum: 96_000 },
    channels: { type: "integer", minimum: 1, maximum: 2 },
  },
};
const PLAN_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "next"],
  properties: { kind: { const: "plan" }, next: { const: "live-adapter-required" } },
};
const PROFILE_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "profileId", "profileRevision", "verification"],
  properties: {
    kind: { const: "voice-profile" },
    profileId: ID,
    profileRevision: KEY,
    verification: { enum: ["manifest-only", "adapter-verified"] },
  },
};
const TRANSCRIPT_SEGMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: {
    text: { type: "string", minLength: 1, maxLength: 2_000 },
    startMs: { type: "integer", minimum: 0, maximum: 3_600_000 },
    endMs: { type: "integer", minimum: 1, maximum: 3_600_000 },
    speaker: { type: "string", minLength: 1, maxLength: 80 },
  },
};
const TRANSCRIPT_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "artifactId", "text", "language", "confidencePosture", "segments"],
  properties: {
    kind: { const: "transcript" },
    artifactId: ID,
    text: { type: "string", minLength: 1, maxLength: 200_000 },
    language: { type: "string", minLength: 2, maxLength: 35 },
    confidencePosture: { enum: ["provider-reported", "unavailable"] },
    segments: { type: "array", minItems: 1, maxItems: 2_000, items: TRANSCRIPT_SEGMENT_SCHEMA },
  },
};
const AUDIO_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "artifactId", "durationMs", "mediaType", "disclosureLabel"],
  properties: {
    kind: { const: "audio" },
    artifactId: ID,
    durationMs: { type: "integer", minimum: 1, maximum: 900_000 },
    mediaType: AUDIO_MEDIA_TYPE,
    disclosureLabel: BOUNDED_TEXT,
  },
};

export const VOICE_STUDIO_OUTPUT_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "ok", "schemaVersion", "operation", "requestId", "idempotencyKey", "state",
    "artifacts", "provenance", "rights", "usage", "cost", "proof", "cached",
  ],
  properties: {
    ok: { type: "boolean" },
    schemaVersion: { const: VOICE_STUDIO_RESULT_SCHEMA_VERSION },
    operation: { enum: VOICE_STUDIO_OPERATIONS },
    requestId: ID,
    idempotencyKey: KEY,
    state: { enum: ["validated", "awaiting_approval", "running", "completed", "blocked", "canceled", "failed"] },
    artifacts: { type: "array", maxItems: 1, items: ARTIFACT_SCHEMA },
    provenance: {
      type: "object",
      additionalProperties: false,
      required: ["operation", "sourceArtifactIds", "sourceDigests", "profileId", "profileRevision", "adapterId", "capabilityRevision"],
      properties: {
        operation: { enum: VOICE_STUDIO_OPERATIONS },
        sourceArtifactIds: { type: "array", minItems: 1, maxItems: 5, uniqueItems: true, items: ID },
        sourceDigests: { type: "array", minItems: 1, maxItems: 5, uniqueItems: true, items: SHA256 },
        profileId: NULLABLE_ID,
        profileRevision: { oneOf: [KEY, { type: "null" }] },
        adapterId: { type: "string", minLength: 1, maxLength: 120 },
        capabilityRevision: { oneOf: [{ type: "string", minLength: 1, maxLength: 120 }, { type: "null" }] },
      },
    },
    rights: {
      type: "object",
      additionalProperties: false,
      required: [
        "approvalReceiptId", "approvalScope", "consentReceiptId", "rightsReceiptId",
        "permittedUses", "participantNotice", "intendedUse", "intendedAudience", "status",
        "expiresAt", "revoked", "publicFigure", "permitted",
        "disclosureRequired", "disclosureLabel", "retentionPolicy",
      ],
      properties: {
        approvalReceiptId: ID,
        approvalScope: { type: "string", minLength: 1, maxLength: 160 },
        consentReceiptId: NULLABLE_ID,
        rightsReceiptId: NULLABLE_ID,
        permittedUses: {
          type: "array",
          maxItems: 20,
          uniqueItems: true,
          items: { type: "string", minLength: 1, maxLength: 120 },
        },
        participantNotice: { oneOf: [BOUNDED_TEXT, { type: "null" }] },
        intendedUse: { oneOf: [{ type: "string", minLength: 1, maxLength: 120 }, { type: "null" }] },
        intendedAudience: { oneOf: [BOUNDED_TEXT, { type: "null" }] },
        status: { enum: ["structurally-validated", "adapter-verified"] },
        expiresAt: { oneOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
        revoked: { type: ["boolean", "null"] },
        publicFigure: { type: ["boolean", "null"] },
        permitted: { type: ["boolean", "null"] },
        disclosureRequired: { type: "boolean" },
        disclosureLabel: { oneOf: [BOUNDED_TEXT, { type: "null" }] },
        retentionPolicy: { oneOf: [{ type: "string", minLength: 1, maxLength: 80 }, { type: "null" }] },
      },
    },
    usage: {
      type: "object",
      additionalProperties: false,
      required: ["durationMs", "bytes", "textCharacters", "adapterAttempts"],
      properties: {
        durationMs: { type: "integer", minimum: 0, maximum: 3_600_000 },
        bytes: { type: "integer", minimum: 0, maximum: 500_000_000 },
        textCharacters: { type: "integer", minimum: 0, maximum: 200_000 },
        adapterAttempts: { type: "integer", minimum: 0, maximum: 1 },
      },
    },
    cost: {
      type: "object",
      additionalProperties: false,
      required: [
        "providerCalls", "actualCostUsd", "currency", "incomplete",
        "estimatedCostUsd", "maxActualCostUsd", "maxProviderCalls",
        "maxNetworkCalls", "evidenceReceiptId",
      ],
      properties: {
        providerCalls: { type: "integer", minimum: 0, maximum: 1 },
        actualCostUsd: { type: "number", minimum: 0 },
        currency: { const: "USD" },
        incomplete: { type: "boolean" },
        estimatedCostUsd: { oneOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
        maxActualCostUsd: { type: "number", minimum: 0, maximum: VOICE_STUDIO_MAX_POLICY_COST_USD },
        maxProviderCalls: { type: "integer", minimum: 0, maximum: 1 },
        maxNetworkCalls: { type: "integer", minimum: 0, maximum: 1 },
        evidenceReceiptId: NULLABLE_ID,
      },
    },
    proof: {
      type: "object",
      additionalProperties: false,
      required: [
        "mode", "requestDigest", "networkCalls", "paidProviderCalls", "repositoryWrites",
        "externalCallAttempted", "costEstimateVerified", "costEvidenceVerified",
        "sourceArtifactVerified", "readBackVerified",
        "cancellationRequested", "reconciliationRequired", "sensitivePayloadReturned",
      ],
      properties: {
        mode: { enum: VOICE_STUDIO_MODES },
        requestDigest: SHA256,
        networkCalls: { type: "integer", minimum: 0, maximum: 1 },
        paidProviderCalls: { type: "integer", minimum: 0, maximum: 1 },
        repositoryWrites: { const: 0 },
        externalCallAttempted: { type: "boolean" },
        costEstimateVerified: { type: "boolean" },
        costEvidenceVerified: { type: "boolean" },
        sourceArtifactVerified: { type: "boolean" },
        readBackVerified: { type: "boolean" },
        cancellationRequested: { type: "boolean" },
        reconciliationRequired: { type: "boolean" },
        sensitivePayloadReturned: { const: false },
      },
    },
    cached: { type: "boolean" },
    result: { oneOf: [PLAN_RESULT_SCHEMA, PROFILE_RESULT_SCHEMA, TRANSCRIPT_RESULT_SCHEMA, AUDIO_RESULT_SCHEMA] },
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "retryEligible"],
      properties: {
        code: { type: "string", minLength: 1, maxLength: 80 },
        message: { type: "string", minLength: 1, maxLength: 300 },
        retryEligible: { type: "boolean" },
      },
    },
  },
  oneOf: [
    { required: ["result"], not: { required: ["error"] } },
    { required: ["error"], not: { required: ["result"] } },
  ],
});

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, allowed) => isObject(value)
  && Object.keys(value).every(key => allowed.includes(key))
  && allowed.every(key => Object.hasOwn(value, key));
const stringInRange = (value, minimum, maximum) =>
  typeof value === "string" && value.length >= minimum && value.length <= maximum;
const ID_PATTERN = new RegExp(ID_PATTERN_TEXT);
const KEY_PATTERN = new RegExp(KEY_PATTERN_TEXT);
const SHA_PATTERN = new RegExp(SHA_PATTERN_TEXT);
const validId = value => typeof value === "string" && ID_PATTERN.test(value);
const validKey = value => typeof value === "string" && KEY_PATTERN.test(value);
const validSha = value => typeof value === "string" && SHA_PATTERN.test(value);
const validInteger = (value, minimum, maximum) =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const COMMON_KEYS = [
  "schemaVersion", "operation", "mode", "requestId", "idempotencyKey",
  "approvalReceiptId", "costPolicy", "limits",
];
const LIMIT_KEYS = ["maxDurationMs", "maxBytes", "maxTextCharacters", "timeoutMs"];

const validSourceAudio = value => exactKeys(value, ["artifactId", "sha256", "mediaType", "bytes", "durationMs"])
  && validId(value.artifactId)
  && validSha(value.sha256)
  && typeof value.mediaType === "string"
  && /^audio\/[A-Za-z0-9.+-]+$/.test(value.mediaType)
  && validInteger(value.bytes, 1, 500_000_000)
  && validInteger(value.durationMs, 1, 3_600_000);
const validLimits = value => exactKeys(value, LIMIT_KEYS)
  && validInteger(value.maxDurationMs, 1, 3_600_000)
  && validInteger(value.maxBytes, 1, 500_000_000)
  && validInteger(value.maxTextCharacters, 1, 200_000)
  && validInteger(value.timeoutMs, 1, 120_000);
const validCostPolicy = value =>
  exactKeys(value, ["currency", "maxActualCostUsd", "maxProviderCalls", "maxNetworkCalls"])
  && value.currency === "USD"
  && typeof value.maxActualCostUsd === "number"
  && Number.isFinite(value.maxActualCostUsd)
  && value.maxActualCostUsd >= 0
  && value.maxActualCostUsd <= VOICE_STUDIO_MAX_POLICY_COST_USD
  && validInteger(value.maxProviderCalls, 0, 1)
  && validInteger(value.maxNetworkCalls, 0, 1);

export function validateVoiceStudioInput(value) {
  const errors = [];
  const fail = (code, message) => errors.push({ code, message });
  if (!isObject(value)) return { valid: false, errors: [{ code: "invalid_input", message: "Input must be an object." }] };
  if (value.schemaVersion !== VOICE_STUDIO_REQUEST_SCHEMA_VERSION) fail("invalid_schema_version", `schemaVersion must be ${VOICE_STUDIO_REQUEST_SCHEMA_VERSION}.`);
  if (!VOICE_STUDIO_OPERATIONS.includes(value.operation)) fail("invalid_operation", "operation must be clone, dictate, or create.");
  if (!VOICE_STUDIO_MODES.includes(value.mode)) fail("invalid_mode", "mode must be dry-run or live.");
  if (!validId(value.requestId)) fail("invalid_request_id", "requestId is invalid.");
  if (!validKey(value.idempotencyKey)) fail("invalid_idempotency_key", "idempotencyKey is invalid.");
  if (!validId(value.approvalReceiptId)) fail("approval_receipt_required", "approvalReceiptId is invalid.");
  if (!validCostPolicy(value.costPolicy)) fail("invalid_cost_policy", "costPolicy must contain exact bounded USD ceilings.");
  if (!validLimits(value.limits)) fail("invalid_limits", "limits must contain four bounded integers.");
  const operationKeys = {
    clone: [...COMMON_KEYS, "sourceAudio", "speakerAuthorization", "profileIntent"],
    dictate: [...COMMON_KEYS, "sourceAudio", "recordingAuthorization", "transcription"],
    create: [...COMMON_KEYS, "sourceText", "voiceProfile", "intendedUse", "disclosure", "output"],
  };
  if (operationKeys[value.operation] && !exactKeys(value, operationKeys[value.operation])) {
    fail("unexpected_field", "Input fields do not exactly match the selected operation.");
  }
  const hard = VOICE_STUDIO_HARD_LIMITS[value.operation];
  if (hard && validLimits(value.limits)) {
    for (const key of Object.keys(hard)) {
      if (value.limits[key] > hard[key]) fail("limit_exceeds_policy", `${key} exceeds the ${value.operation} policy.`);
    }
  }
  if (value.operation === "clone") {
    if (!validSourceAudio(value.sourceAudio)) fail("invalid_source_audio", "clone requires one immutable bounded audio reference.");
    const authorization = value.speakerAuthorization;
    const uses = authorization?.permittedUses;
    if (!exactKeys(authorization, ["consentReceiptId", "rightsReceiptId", "permittedUses", "disclosureRequired", "retentionPolicy"])
      || !validId(authorization?.consentReceiptId)
      || !validId(authorization?.rightsReceiptId)
      || !Array.isArray(uses)
      || uses.length < 1
      || uses.length > 20
      || uses.some(entry => !stringInRange(entry, 1, 120))
      || new Set(uses).size !== uses.length
      || authorization?.disclosureRequired !== true
      || !RETENTION_POLICIES.includes(authorization?.retentionPolicy)) {
      fail("speaker_authorization_required", "clone requires exact consent, rights, permitted-use, disclosure, and retention metadata.");
    }
    if (!exactKeys(value.profileIntent, ["profileId", "displayName"])
      || !validId(value.profileIntent?.profileId)
      || !stringInRange(value.profileIntent?.displayName, 1, 80)) {
      fail("invalid_profile_intent", "clone requires a bounded profile intent.");
    }
  }
  if (value.operation === "dictate") {
    if (!validSourceAudio(value.sourceAudio)) fail("invalid_source_audio", "dictate requires one immutable bounded audio reference.");
    if (!exactKeys(value.recordingAuthorization, ["rightsReceiptId", "participantNotice"])
      || !validId(value.recordingAuthorization?.rightsReceiptId)
      || !stringInRange(value.recordingAuthorization?.participantNotice, 1, 240)) {
      fail("recording_authorization_required", "dictate requires recording rights and a bounded participant notice.");
    }
    if (!exactKeys(value.transcription, ["language", "timestamps", "diarization"])
      || !stringInRange(value.transcription?.language, 2, 35)
      || typeof value.transcription?.timestamps !== "boolean"
      || typeof value.transcription?.diarization !== "boolean") {
      fail("invalid_transcription", "dictate requires exact bounded transcription options.");
    }
  }
  if (value.operation === "create") {
    if (!exactKeys(value.sourceText, ["artifactId", "sha256", "characters"])
      || !validId(value.sourceText?.artifactId)
      || !validSha(value.sourceText?.sha256)
      || !validInteger(value.sourceText?.characters, 1, 20_000)) {
      fail("invalid_source_text", "create requires one bounded digest-bound text artifact.");
    }
    if (!exactKeys(value.voiceProfile, ["profileId", "profileRevision"])
      || !validId(value.voiceProfile?.profileId)
      || !validKey(value.voiceProfile?.profileRevision)) {
      fail("invalid_voice_profile", "create requires an exact voice profile revision.");
    }
    if (!stringInRange(value.intendedUse, 1, 120)) fail("invalid_intended_use", "create requires one bounded intended use.");
    if (!exactKeys(value.disclosure, ["label", "intendedAudience"])
      || !stringInRange(value.disclosure?.label, 1, 240)
      || !stringInRange(value.disclosure?.intendedAudience, 1, 240)) {
      fail("disclosure_required", "create requires a bounded visible disclosure label and audience.");
    }
    if (!exactKeys(value.output, ["mediaType", "sampleRateHz", "channels"])
      || !["audio/wav", "audio/mpeg", "audio/ogg"].includes(value.output?.mediaType)
      || !validInteger(value.output?.sampleRateHz, 8_000, 96_000)
      || !validInteger(value.output?.channels, 1, 2)) {
      fail("invalid_output", "create requires bounded audio output options.");
    }
  }
  if (validSourceAudio(value.sourceAudio) && validLimits(value.limits)) {
    if (value.sourceAudio.durationMs > Math.min(value.limits.maxDurationMs, hard?.maxDurationMs ?? Infinity)) {
      fail("source_duration_exceeded", "source audio exceeds the admitted duration.");
    }
    if (value.sourceAudio.bytes > Math.min(value.limits.maxBytes, hard?.maxBytes ?? Infinity)) {
      fail("source_bytes_exceeded", "source audio exceeds the admitted byte count.");
    }
  }
  if (value.operation === "create"
    && validInteger(value.sourceText?.characters, 1, 20_000)
    && validLimits(value.limits)
    && value.sourceText.characters > value.limits.maxTextCharacters) {
    fail("source_text_exceeded", "source text exceeds the admitted character count.");
  }
  return { valid: errors.length === 0, errors };
}

export const voiceStudioRequestDigest = input =>
  crypto.createHash("sha256").update(stableStringify(input), "utf8").digest("hex");
