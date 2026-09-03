import crypto from "node:crypto";
import { VOICE_STUDIO_TOOL_NAME } from "../contracts/voice-studio.schema.js";

const ID_PATTERN = /^[A-Za-z0-9._:-]{3,128}$/;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const SHA_PATTERN = /^[a-f0-9]{64}$/;
const sameStrings = (left, right) =>
  Array.isArray(left) && Array.isArray(right)
  && left.length === right.length
  && left.every((value, index) => value === right[index]);
const sameCostPolicy = (left, right) =>
  left?.currency === right?.currency
  && left?.maxActualCostUsd === right?.maxActualCostUsd
  && left?.maxProviderCalls === right?.maxProviderCalls
  && left?.maxNetworkCalls === right?.maxNetworkCalls;

export const safeId = (value, fallback) => ID_PATTERN.test(String(value || "")) ? String(value) : fallback;
export const safeKey = (value, fallback) => KEY_PATTERN.test(String(value || "")) ? String(value) : fallback;
export const sha256Text = value => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
export const approvalScopeFor = input => `${VOICE_STUDIO_TOOL_NAME}:${input.operation}:${input.mode}`;
export const deepFreezeResult = value => {
  const clone = structuredClone(value);
  const freeze = item => {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      Object.freeze(item);
      for (const child of Object.values(item)) freeze(child);
    }
    return item;
  };
  return freeze(clone);
};

export const invokeWithSignal = async (invoke, signal) => {
  if (!signal) return invoke();
  signal.throwIfAborted();
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(signal.reason || Object.assign(new Error("aborted"), { name: "AbortError" }));
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([invoke(), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
};

export const combineSignals = (signal, timeoutMs) => {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
};
const validExpiry = (expiresAt, now) => Number.isSafeInteger(expiresAt) && expiresAt > now;

export const verifyApproval = async (verifier, input, requestDigest, signal, now) => {
  const expected = {
    receiptId: input.approvalReceiptId,
    operation: input.operation,
    requestId: input.requestId,
    requestDigest,
    mode: input.mode,
    scope: approvalScopeFor(input),
    costPolicy: { ...input.costPolicy },
  };
  const receipt = await invokeWithSignal(() => verifier(structuredClone(expected), { signal }), signal);
  return receipt?.ok === true
    && receipt.approved === true
    && receipt.revoked === false
    && receipt.receiptId === expected.receiptId
    && receipt.operation === expected.operation
    && receipt.requestId === expected.requestId
    && receipt.requestDigest === expected.requestDigest
    && receipt.mode === expected.mode
    && receipt.scope === expected.scope
    && sameCostPolicy(receipt.costPolicy, expected.costPolicy)
    && validExpiry(receipt.expiresAt, now());
};

const rightsRequirements = (input, requestDigest) => ({
  operation: input.operation,
  requestId: input.requestId,
  requestDigest,
  mode: input.mode,
  ...(input.operation === "clone" ? {
    consentReceiptId: input.speakerAuthorization.consentReceiptId,
    rightsReceiptId: input.speakerAuthorization.rightsReceiptId,
    permittedUses: [...input.speakerAuthorization.permittedUses],
    disclosureRequired: input.speakerAuthorization.disclosureRequired,
    retentionPolicy: input.speakerAuthorization.retentionPolicy,
  } : {}),
  ...(input.operation === "dictate" ? {
    rightsReceiptId: input.recordingAuthorization.rightsReceiptId,
    participantNotice: input.recordingAuthorization.participantNotice,
  } : {}),
  ...(input.operation === "create" ? {
    profileId: input.voiceProfile.profileId,
    profileRevision: input.voiceProfile.profileRevision,
    intendedUse: input.intendedUse,
    disclosureRequired: true,
    disclosureLabel: input.disclosure.label,
    intendedAudience: input.disclosure.intendedAudience,
  } : {}),
});

export const verifyRights = async (verifier, input, requestDigest, signal, now) => {
  const expected = rightsRequirements(input, requestDigest);
  const receipt = await invokeWithSignal(() => verifier(structuredClone(expected), { signal }), signal);
  if (receipt?.ok !== true
    || receipt.status !== "active"
    || receipt.revoked !== false
    || receipt.publicFigure !== false
    || receipt.permitted !== true
    || receipt.operation !== expected.operation
    || receipt.requestId !== expected.requestId
    || receipt.requestDigest !== expected.requestDigest
    || receipt.mode !== expected.mode
    || !validExpiry(receipt.expiresAt, now())) return null;
  if (input.operation === "clone"
    && (receipt.consentReceiptId !== expected.consentReceiptId
      || receipt.rightsReceiptId !== expected.rightsReceiptId
      || !sameStrings(receipt.permittedUses, expected.permittedUses)
      || receipt.disclosureRequired !== expected.disclosureRequired
      || receipt.retentionPolicy !== expected.retentionPolicy)) return null;
  if (input.operation === "dictate"
    && (receipt.rightsReceiptId !== expected.rightsReceiptId
      || receipt.participantNotice !== expected.participantNotice)) return null;
  if (input.operation === "create"
    && (!ID_PATTERN.test(String(receipt.rightsReceiptId || ""))
      || receipt.profileId !== expected.profileId
      || receipt.profileRevision !== expected.profileRevision
      || receipt.intendedUse !== expected.intendedUse
      || receipt.disclosureRequired !== true
      || receipt.disclosureLabel !== expected.disclosureLabel
      || receipt.intendedAudience !== expected.intendedAudience)) return null;
  if (typeof receipt.disclosureRequired !== "boolean"
    || typeof receipt.retentionPolicy !== "string"
    || receipt.retentionPolicy.length < 1
    || receipt.retentionPolicy.length > 80) return null;
  return {
    consentReceiptId: receipt.consentReceiptId || null,
    rightsReceiptId: receipt.rightsReceiptId || null,
    permittedUses: input.operation === "clone" ? [...receipt.permittedUses] : [],
    participantNotice: input.operation === "dictate" ? receipt.participantNotice : null,
    intendedUse: input.operation === "create" ? receipt.intendedUse : null,
    intendedAudience: input.operation === "create" ? receipt.intendedAudience : null,
    expiresAt: receipt.expiresAt,
    revoked: receipt.revoked,
    publicFigure: receipt.publicFigure,
    permitted: receipt.permitted,
    disclosureRequired: receipt.disclosureRequired,
    disclosureLabel: input.operation === "create" ? input.disclosure.label : null,
    retentionPolicy: receipt.retentionPolicy,
  };
};

export const sourceDescriptor = input => input.operation === "create"
  ? { kind: "text", ...input.sourceText }
  : { kind: "audio", ...input.sourceAudio };
const sourceRecordMatches = (record, expected) =>
  record?.kind === expected.kind
  && record.artifactId === expected.artifactId
  && record.sha256 === expected.sha256
  && (expected.kind !== "audio"
    || (record.mediaType === expected.mediaType
      && record.bytes === expected.bytes
      && record.durationMs === expected.durationMs))
  && (expected.kind !== "text" || record.characters === expected.characters);

export const resolveSourceArtifact = async (resolver, input, requestDigest, signal) => {
  const expected = sourceDescriptor(input);
  const record = await invokeWithSignal(
    () => resolver(structuredClone(expected), {
      operation: input.operation,
      requestId: input.requestId,
      requestDigest,
      signal,
    }),
    signal,
  );
  return sourceRecordMatches(record, expected) ? Object.freeze({ ...expected }) : null;
};

const validAdapterArtifact = artifact => artifact
  && typeof artifact === "object"
  && ID_PATTERN.test(String(artifact.artifactId || ""))
  && SHA_PATTERN.test(String(artifact.sha256 || ""))
  && ["audio", "text", "voice-profile"].includes(artifact.kind)
  && typeof artifact.mediaType === "string"
  && artifact.mediaType.length >= 1
  && artifact.mediaType.length <= 120
  && Number.isSafeInteger(artifact.bytes)
  && artifact.bytes >= 0
  && artifact.bytes <= 500_000_000
  && (!Object.hasOwn(artifact, "durationMs")
    || (Number.isSafeInteger(artifact.durationMs) && artifact.durationMs >= 0 && artifact.durationMs <= 3_600_000))
  && (!Object.hasOwn(artifact, "sampleRateHz")
    || (Number.isSafeInteger(artifact.sampleRateHz) && artifact.sampleRateHz >= 8_000 && artifact.sampleRateHz <= 96_000))
  && (!Object.hasOwn(artifact, "channels")
    || (Number.isSafeInteger(artifact.channels) && artifact.channels >= 1 && artifact.channels <= 2));

const MAX_SETTLED_COST_USD = 1_000_000_000;
export const completeCostEvidence = adapterResult => {
  if (!Number.isSafeInteger(adapterResult?.providerCalls)
    || adapterResult.providerCalls < 0
    || adapterResult.providerCalls > 1
    || !Number.isSafeInteger(adapterResult?.networkCalls)
    || adapterResult.networkCalls < 0
    || adapterResult.networkCalls > 1
    || !Number.isFinite(adapterResult?.actualCostUsd)
    || adapterResult.actualCostUsd < 0
    || adapterResult.actualCostUsd > MAX_SETTLED_COST_USD
    || adapterResult.currency !== "USD"
    || adapterResult.costIncomplete !== false) return null;
  return {
    currency: "USD",
    providerCalls: adapterResult.providerCalls,
    networkCalls: adapterResult.networkCalls,
    actualCostUsd: adapterResult.actualCostUsd,
  };
};

export const verifyAdapterEstimate = async (adapter, input, requestDigest, context, signal) => {
  if (typeof adapter?.estimate !== "function") return null;
  const estimate = await invokeWithSignal(
    () => adapter.estimate(structuredClone(input), {
      ...context,
      phase: "zero-spend-estimate",
      signal,
    }),
    signal,
  );
  if (estimate?.ok !== true
    || estimate.zeroSpend !== true
    || estimate.requestDigest !== requestDigest
    || estimate.currency !== "USD"
    || !Number.isFinite(estimate.estimatedActualCostUsd)
    || estimate.estimatedActualCostUsd < 0
    || estimate.estimatedActualCostUsd > MAX_SETTLED_COST_USD
    || !Number.isSafeInteger(estimate.estimatedProviderCalls)
    || estimate.estimatedProviderCalls < 0
    || estimate.estimatedProviderCalls > 1
    || !Number.isSafeInteger(estimate.estimatedNetworkCalls)
    || estimate.estimatedNetworkCalls < 0
    || estimate.estimatedNetworkCalls > 1) return null;
  return {
    estimatedCostUsd: estimate.estimatedActualCostUsd,
    providerCalls: estimate.estimatedProviderCalls,
    networkCalls: estimate.estimatedNetworkCalls,
  };
};

export const costExceedsPolicy = (evidence, policy) =>
  evidence.estimatedCostUsd > policy.maxActualCostUsd
  || evidence.providerCalls > policy.maxProviderCalls
  || evidence.networkCalls > policy.maxNetworkCalls;

export const settledCostExceedsPolicy = (evidence, policy) =>
  evidence.actualCostUsd > policy.maxActualCostUsd
  || evidence.providerCalls > policy.maxProviderCalls
  || evidence.networkCalls > policy.maxNetworkCalls;

export const verifyCostEvidence = async (
  verifier,
  input,
  requestDigest,
  adapterResult,
  signal,
) => {
  const observed = completeCostEvidence(adapterResult);
  if (!observed) return null;
  const expected = {
    operation: input.operation,
    requestId: input.requestId,
    requestDigest,
    currency: observed.currency,
    providerCalls: observed.providerCalls,
    networkCalls: observed.networkCalls,
    actualCostUsd: observed.actualCostUsd,
    costPolicy: { ...input.costPolicy },
  };
  const receipt = await invokeWithSignal(
    () => verifier(structuredClone(expected), { signal }),
    signal,
  );
  if (receipt?.ok !== true
    || receipt.settled !== true
    || receipt.revoked !== false
    || !ID_PATTERN.test(String(receipt.receiptId || ""))
    || receipt.operation !== expected.operation
    || receipt.requestId !== expected.requestId
    || receipt.requestDigest !== expected.requestDigest
    || receipt.currency !== expected.currency
    || receipt.providerCalls !== expected.providerCalls
    || receipt.networkCalls !== expected.networkCalls
    || receipt.actualCostUsd !== expected.actualCostUsd
    || !sameCostPolicy(receipt.costPolicy, expected.costPolicy)) return null;
  return { ...observed, evidenceReceiptId: receipt.receiptId };
};

const validateSegments = (input, segments) => {
  if (!Array.isArray(segments) || segments.length < 1 || segments.length > 2_000) return null;
  let previousEnd = 0;
  const sanitized = [];
  for (const segment of segments) {
    if (!segment || typeof segment !== "object"
      || typeof segment.text !== "string"
      || segment.text.length < 1
      || segment.text.length > 2_000) return null;
    const clean = { text: segment.text };
    if (input.transcription.timestamps) {
      if (!Number.isSafeInteger(segment.startMs)
        || !Number.isSafeInteger(segment.endMs)
        || segment.startMs < previousEnd
        || segment.endMs <= segment.startMs
        || segment.endMs > input.sourceAudio.durationMs) return null;
      clean.startMs = segment.startMs;
      clean.endMs = segment.endMs;
      previousEnd = segment.endMs;
    } else if (Object.hasOwn(segment, "startMs") || Object.hasOwn(segment, "endMs")) return null;
    if (input.transcription.diarization) {
      if (typeof segment.speaker !== "string"
        || segment.speaker.length < 1
        || segment.speaker.length > 80) return null;
      clean.speaker = segment.speaker;
    } else if (Object.hasOwn(segment, "speaker")) return null;
    sanitized.push(clean);
  }
  return sanitized;
};

export const prepareAdapterSuccess = (input, adapterResult, settledCost) => {
  if (adapterResult?.ok !== true) {
    return { error: ["adapter_execution_failed", "The host voice adapter returned a typed failure."] };
  }
  const cost = settledCost;
  if (!validAdapterArtifact(adapterResult.artifact)) {
    return { error: ["adapter_result_invalid", "The adapter did not return one bounded digest-bound artifact."], cost };
  }
  const artifact = {
    artifactId: adapterResult.artifact.artifactId,
    sha256: adapterResult.artifact.sha256,
    kind: adapterResult.artifact.kind,
    state: "adapter-verified",
    mediaType: adapterResult.artifact.mediaType,
    bytes: adapterResult.artifact.bytes,
    ...(Number.isSafeInteger(adapterResult.artifact.durationMs) ? { durationMs: adapterResult.artifact.durationMs } : {}),
    ...(Number.isSafeInteger(adapterResult.artifact.sampleRateHz) ? { sampleRateHz: adapterResult.artifact.sampleRateHz } : {}),
    ...(Number.isSafeInteger(adapterResult.artifact.channels) ? { channels: adapterResult.artifact.channels } : {}),
  };
  if (input.operation === "clone") {
    const profileRevision = safeKey(adapterResult.profileRevision, "");
    if (!profileRevision
      || artifact.kind !== "voice-profile"
      || artifact.mediaType !== "application/vnd.agentic-graph.voice-profile+json"
      || artifact.bytes > 100_000_000
      || Object.hasOwn(artifact, "durationMs")
      || Object.hasOwn(artifact, "sampleRateHz")
      || Object.hasOwn(artifact, "channels")) {
      return { error: ["adapter_result_invalid", "The cloning adapter omitted one exact profile revision."], cost };
    }
    return { artifact, cost, profileRevision };
  }
  if (input.operation === "dictate") {
    const transcript = typeof adapterResult.transcript === "string" ? adapterResult.transcript : "";
    const language = typeof adapterResult.language === "string" ? adapterResult.language : "";
    const segments = validateSegments(input, adapterResult.segments);
    if (transcript.length < 1
      || transcript.length > input.limits.maxTextCharacters
      || language.length < 2
      || language.length > 35
      || artifact.kind !== "text"
      || artifact.mediaType !== "text/plain"
      || artifact.bytes > input.limits.maxTextCharacters * 4
      || artifact.sha256 !== sha256Text(transcript)
      || artifact.bytes !== Buffer.byteLength(transcript, "utf8")
      || !segments
      || segments.map(segment => segment.text).join("") !== transcript
      || Object.hasOwn(artifact, "durationMs")
      || Object.hasOwn(artifact, "sampleRateHz")
      || Object.hasOwn(artifact, "channels")) {
      return { error: ["adapter_result_invalid", "The dictation adapter omitted an exact bounded transcript and segment artifact."], cost };
    }
    return { artifact, cost, transcript, language, segments };
  }
  const durationMs = adapterResult.artifact.durationMs;
  if (artifact.kind !== "audio"
    || artifact.mediaType !== input.output.mediaType
    || artifact.sampleRateHz !== input.output.sampleRateHz
    || artifact.channels !== input.output.channels
    || artifact.bytes > input.limits.maxBytes
    || !Number.isSafeInteger(durationMs)
    || durationMs < 1
    || durationMs > input.limits.maxDurationMs) {
    return { error: ["adapter_result_invalid", "The synthesis adapter omitted one exact bounded audio artifact."], cost };
  }
  return { artifact, cost, durationMs };
};

const expectedOutputEvidence = (input, requestDigest, prepared, rights) => ({
  ...prepared.artifact,
  operation: input.operation,
  requestDigest,
  sourceArtifactIds: [sourceDescriptor(input).artifactId],
  sourceDigests: [sourceDescriptor(input).sha256],
  ...(input.operation === "clone" ? {
    profileId: input.profileIntent.profileId,
    profileRevision: prepared.profileRevision,
    permittedUses: [...rights.permittedUses],
    disclosureRequired: rights.disclosureRequired,
    retentionPolicy: rights.retentionPolicy,
  } : {}),
  ...(input.operation === "dictate" ? {
    timestamps: input.transcription.timestamps,
    diarization: input.transcription.diarization,
  } : {}),
  ...(input.operation === "create" ? {
    profileId: input.voiceProfile.profileId,
    profileRevision: input.voiceProfile.profileRevision,
    intendedUse: input.intendedUse,
    disclosureRequired: true,
    disclosureLabel: input.disclosure.label,
    intendedAudience: input.disclosure.intendedAudience,
  } : {}),
});

const outputEvidenceMatches = (record, expected, operation) => {
  if (!record || typeof record !== "object") return false;
  for (const key of ["artifactId", "sha256", "kind", "mediaType", "bytes", "operation", "requestDigest"]) {
    if (record[key] !== expected[key]) return false;
  }
  for (const key of ["durationMs", "sampleRateHz", "channels"]) {
    if (Object.hasOwn(expected, key) && record[key] !== expected[key]) return false;
  }
  if (!sameStrings(record.sourceArtifactIds, expected.sourceArtifactIds)
    || !sameStrings(record.sourceDigests, expected.sourceDigests)) return false;
  if (operation === "clone") {
    return record.profileId === expected.profileId
      && record.profileRevision === expected.profileRevision
      && sameStrings(record.permittedUses, expected.permittedUses)
      && record.disclosureRequired === expected.disclosureRequired
      && record.retentionPolicy === expected.retentionPolicy;
  }
  if (operation === "dictate") {
    return record.timestamps === expected.timestamps && record.diarization === expected.diarization;
  }
  return record.profileId === expected.profileId
    && record.profileRevision === expected.profileRevision
    && record.intendedUse === expected.intendedUse
    && record.disclosureRequired === true
    && record.disclosureLabel === expected.disclosureLabel
    && record.intendedAudience === expected.intendedAudience;
};

export const verifyOutputArtifact = async (
  verifier,
  input,
  requestDigest,
  prepared,
  rights,
  signal,
) => {
  const expected = expectedOutputEvidence(input, requestDigest, prepared, rights);
  const record = await invokeWithSignal(
    () => verifier(structuredClone(prepared.artifact), { expected: structuredClone(expected), signal }),
    signal,
  );
  return outputEvidenceMatches(record, expected, input.operation);
};

export const dispatchFailureEvidence = adapterResult => {
  const complete = completeCostEvidence(adapterResult);
  return {
    cost: {
      providerCalls: complete?.providerCalls ?? 1,
      actualCostUsd: complete?.actualCostUsd ?? 0,
      currency: "USD",
      incomplete: true,
    },
    proof: {
      networkCalls: complete?.networkCalls ?? 1,
      paidProviderCalls: complete?.providerCalls ?? 1,
    },
  };
};
