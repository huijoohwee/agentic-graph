import {
  VOICE_STUDIO_MAX_POLICY_COST_USD,
  VOICE_STUDIO_IDEMPOTENCY_TTL_MS,
  VOICE_STUDIO_OPERATIONS,
  VOICE_STUDIO_RESULT_SCHEMA_VERSION,
  VOICE_STUDIO_TOOL_NAME,
  validateVoiceStudioInput,
  voiceStudioRequestDigest,
} from "../contracts/voice-studio.schema.js";
import {
  approvalScopeFor,
  combineSignals,
  costExceedsPolicy,
  deepFreezeResult,
  dispatchFailureEvidence,
  prepareAdapterSuccess,
  resolveSourceArtifact,
  safeId,
  safeKey,
  settledCostExceedsPolicy,
  sha256Text,
  verifyAdapterEstimate,
  verifyApproval,
  verifyCostEvidence,
  verifyOutputArtifact,
  verifyRights,
  invokeWithSignal,
} from "./voice-studio-runtime-evidence.js";

const ZERO_SHA = "0".repeat(64);
const SHA_PATTERN = /^[a-f0-9]{64}$/;
const costPolicyFacts = input => ({
  maxActualCostUsd: Number.isFinite(input?.costPolicy?.maxActualCostUsd)
    && input.costPolicy.maxActualCostUsd >= 0
    && input.costPolicy.maxActualCostUsd <= VOICE_STUDIO_MAX_POLICY_COST_USD
    ? input.costPolicy.maxActualCostUsd : 0,
  maxProviderCalls: Number.isSafeInteger(input?.costPolicy?.maxProviderCalls)
    && input.costPolicy.maxProviderCalls >= 0
    && input.costPolicy.maxProviderCalls <= 1
    ? input.costPolicy.maxProviderCalls : 0,
  maxNetworkCalls: Number.isSafeInteger(input?.costPolicy?.maxNetworkCalls)
    && input.costPolicy.maxNetworkCalls >= 0
    && input.costPolicy.maxNetworkCalls <= 1
    ? input.costPolicy.maxNetworkCalls : 0,
});
const zeroCost = (input, estimatedCostUsd = input?.mode === "dry-run" ? 0 : null) => ({
  providerCalls: 0,
  actualCostUsd: 0,
  currency: "USD",
  incomplete: false,
  estimatedCostUsd,
  ...costPolicyFacts(input),
  evidenceReceiptId: null,
});

const operationFacts = input => {
  const source = input.operation === "create" ? input.sourceText : input.sourceAudio;
  const clone = input.operation === "clone" ? input.speakerAuthorization : null;
  const dictate = input.operation === "dictate" ? input.recordingAuthorization : null;
  return {
    sourceArtifactIds: [safeId(source?.artifactId, "invalid-source")],
    sourceDigests: [SHA_PATTERN.test(String(source?.sha256 || "")) ? source.sha256 : ZERO_SHA],
    profileId: input.operation === "clone"
      ? safeId(input.profileIntent?.profileId, "invalid-profile")
      : input.operation === "create"
        ? safeId(input.voiceProfile?.profileId, "invalid-profile")
        : null,
    profileRevision: input.operation === "create" ? safeKey(input.voiceProfile?.profileRevision, null) : null,
    consentReceiptId: clone ? safeId(clone.consentReceiptId, null) : null,
    rightsReceiptId: clone
      ? safeId(clone.rightsReceiptId, null)
      : dictate
        ? safeId(dictate.rightsReceiptId, null)
        : null,
    permittedUses: Array.isArray(clone?.permittedUses) ? [...clone.permittedUses] : [],
    participantNotice: dictate?.participantNotice || null,
    intendedUse: input.operation === "create" ? input.intendedUse : null,
    intendedAudience: input.operation === "create" ? input.disclosure?.intendedAudience || null : null,
    disclosureRequired: clone ? clone.disclosureRequired === true : input.operation === "create",
    disclosureLabel: input.operation === "create" ? input.disclosure?.label || null : null,
    retentionPolicy: clone?.retentionPolicy || null,
    usage: {
      durationMs: Number.isSafeInteger(input.sourceAudio?.durationMs) ? input.sourceAudio.durationMs : 0,
      bytes: Number.isSafeInteger(input.sourceAudio?.bytes) ? input.sourceAudio.bytes : 0,
      textCharacters: Number.isSafeInteger(input.sourceText?.characters) ? input.sourceText.characters : 0,
      adapterAttempts: 0,
    },
  };
};

const basePayload = (input, overrides = {}) => {
  const operation = VOICE_STUDIO_OPERATIONS.includes(input?.operation) ? input.operation : "dictate";
  const normalized = {
    ...input,
    operation,
    requestId: safeId(input?.requestId, "invalid-request"),
    idempotencyKey: safeKey(input?.idempotencyKey, "invalid-key"),
    approvalReceiptId: safeId(input?.approvalReceiptId, "invalid-approval"),
    mode: input?.mode === "live" ? "live" : "dry-run",
  };
  const facts = operationFacts(normalized);
  return {
    ok: overrides.ok ?? false,
    schemaVersion: VOICE_STUDIO_RESULT_SCHEMA_VERSION,
    operation,
    requestId: normalized.requestId,
    idempotencyKey: normalized.idempotencyKey,
    state: overrides.state || "blocked",
    artifacts: overrides.artifacts || [],
    provenance: {
      operation,
      sourceArtifactIds: facts.sourceArtifactIds,
      sourceDigests: facts.sourceDigests,
      profileId: facts.profileId,
      profileRevision: facts.profileRevision,
      adapterId: overrides.adapterId || "none",
      capabilityRevision: overrides.capabilityRevision || null,
    },
    rights: {
      approvalReceiptId: normalized.approvalReceiptId,
      approvalScope: approvalScopeFor(normalized),
      consentReceiptId: facts.consentReceiptId,
      rightsReceiptId: facts.rightsReceiptId,
      permittedUses: facts.permittedUses,
      participantNotice: facts.participantNotice,
      intendedUse: facts.intendedUse,
      intendedAudience: facts.intendedAudience,
      status: overrides.rightsStatus || "structurally-validated",
      expiresAt: null,
      revoked: null,
      publicFigure: null,
      permitted: null,
      disclosureRequired: facts.disclosureRequired,
      disclosureLabel: facts.disclosureLabel,
      retentionPolicy: facts.retentionPolicy,
      ...(overrides.rights || {}),
    },
    usage: { ...facts.usage, ...(overrides.usage || {}) },
    cost: overrides.cost || zeroCost(normalized),
    proof: {
      mode: normalized.mode,
      requestDigest: voiceStudioRequestDigest(input || {}),
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
      ...(overrides.proof || {}),
    },
    cached: overrides.cached === true,
  };
};

const failure = (input, code, message, overrides = {}) => ({
  ...basePayload(input, overrides),
  ok: false,
  error: { code, message, retryEligible: overrides.retryEligible === true },
});

const dryRunResult = input => {
  const base = basePayload(input, {
    ok: true,
    state: "validated",
    adapterId: "knowgrph-deterministic-dry-run",
  });
  if (input.operation !== "clone") {
    return { ...base, result: { kind: "plan", next: "live-adapter-required" } };
  }
  const profileRevision = `manifest-${base.proof.requestDigest}`;
  return {
    ...base,
    artifacts: [{
      artifactId: `${input.profileIntent.profileId}:manifest`,
      sha256: sha256Text(base.proof.requestDigest),
      kind: "voice-profile",
      state: "validated",
      mediaType: "application/vnd.knowgrph.voice-profile+json",
      bytes: 0,
    }],
    provenance: { ...base.provenance, profileRevision },
    result: {
      kind: "voice-profile",
      profileId: input.profileIntent.profileId,
      profileRevision,
      verification: "manifest-only",
    },
  };
};

const successResult = (input, adapterResult, prepared, rights, estimate) => {
  const common = basePayload(input, {
    ok: true,
    state: "completed",
    artifacts: [prepared.artifact],
    adapterId: safeId(adapterResult.adapterId, "host-injected"),
    capabilityRevision: safeKey(adapterResult.capabilityRevision, null),
    rightsStatus: "adapter-verified",
    rights,
    usage: { adapterAttempts: 1 },
    cost: {
      providerCalls: prepared.cost.providerCalls,
      actualCostUsd: prepared.cost.actualCostUsd,
      currency: "USD",
      incomplete: false,
      estimatedCostUsd: estimate.estimatedCostUsd,
      ...costPolicyFacts(input),
      evidenceReceiptId: prepared.cost.evidenceReceiptId,
    },
    proof: {
      networkCalls: prepared.cost.networkCalls,
      paidProviderCalls: prepared.cost.providerCalls,
      externalCallAttempted: true,
      costEstimateVerified: true,
      costEvidenceVerified: true,
      sourceArtifactVerified: true,
      readBackVerified: true,
    },
  });
  if (input.operation === "clone") {
    return {
      ...common,
      provenance: { ...common.provenance, profileRevision: prepared.profileRevision },
      result: {
        kind: "voice-profile",
        profileId: input.profileIntent.profileId,
        profileRevision: prepared.profileRevision,
        verification: "adapter-verified",
      },
    };
  }
  if (input.operation === "dictate") {
    return {
      ...common,
      usage: { ...common.usage, textCharacters: prepared.transcript.length },
      result: {
        kind: "transcript",
        artifactId: prepared.artifact.artifactId,
        text: prepared.transcript,
        language: prepared.language,
        confidencePosture: adapterResult.confidenceReported === true ? "provider-reported" : "unavailable",
        segments: prepared.segments,
      },
    };
  }
  return {
    ...common,
    usage: { ...common.usage, durationMs: prepared.durationMs, bytes: prepared.artifact.bytes },
    result: {
      kind: "audio",
      artifactId: prepared.artifact.artifactId,
      durationMs: prepared.durationMs,
      mediaType: prepared.artifact.mediaType,
      disclosureLabel: input.disclosure.label,
    },
  };
};

const afterDispatchFailure = (
  input,
  code,
  message,
  adapterResult,
  rights,
  { estimate = null, settledCost = null, ...extraProof } = {},
) => {
  const observed = dispatchFailureEvidence(adapterResult);
  const cost = settledCost ? {
    providerCalls: settledCost.providerCalls,
    actualCostUsd: settledCost.actualCostUsd,
    currency: "USD",
    incomplete: false,
    estimatedCostUsd: estimate?.estimatedCostUsd ?? null,
    ...costPolicyFacts(input),
    evidenceReceiptId: settledCost.evidenceReceiptId,
  } : {
    ...observed.cost,
    estimatedCostUsd: estimate?.estimatedCostUsd ?? null,
    ...costPolicyFacts(input),
    evidenceReceiptId: null,
  };
  return failure(input, code, message, {
    state: extraProof.cancellationRequested ? "canceled" : "failed",
    cost,
    usage: { adapterAttempts: 1 },
    rightsStatus: rights ? "adapter-verified" : "structurally-validated",
    ...(rights ? { rights } : {}),
    proof: {
      ...observed.proof,
      externalCallAttempted: true,
      costEstimateVerified: Boolean(estimate),
      costEvidenceVerified: Boolean(settledCost),
      sourceArtifactVerified: true,
      reconciliationRequired: true,
      ...extraProof,
    },
  });
};

export function createVoiceStudioRuntime({
  adapter = null,
  approvalVerifier = null,
  rightsVerifier = null,
  sourceArtifactResolver = null,
  outputArtifactVerifier = null,
  costEvidenceVerifier = null,
  ledger = new Map(),
  idempotencyTtlMs = VOICE_STUDIO_IDEMPOTENCY_TTL_MS,
  now = () => Date.now(),
} = {}) {
  if (!Number.isSafeInteger(idempotencyTtlMs)
    || idempotencyTtlMs < 1
    || idempotencyTtlMs > VOICE_STUDIO_IDEMPOTENCY_TTL_MS) {
    throw new TypeError("idempotencyTtlMs must be between 1 and 24 hours.");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function.");

  const execute = async (input, signal) => {
    if (signal?.aborted) {
      return failure(input, "voice_operation_cancelled", "The voice operation was cancelled before dispatch.", {
        state: "canceled",
        proof: { cancellationRequested: true },
      });
    }
    if (input.mode === "dry-run") return dryRunResult(input);
    if (typeof approvalVerifier !== "function") {
      return failure(input, "approval_verifier_unavailable", "Live execution requires a host-owned scoped approval verifier.");
    }
    if (typeof rightsVerifier !== "function") {
      return failure(input, "rights_verifier_unavailable", "Live execution requires a host-owned consent and rights verifier.");
    }
    if (typeof sourceArtifactResolver !== "function") {
      return failure(input, "source_artifact_resolver_unavailable", "Live execution requires host-owned source artifact read-back.");
    }
    if (typeof outputArtifactVerifier !== "function") {
      return failure(input, "output_artifact_verifier_unavailable", "Live execution requires independent output artifact read-back.");
    }
    if (typeof costEvidenceVerifier !== "function") {
      return failure(input, "cost_evidence_verifier_unavailable", "Live execution requires independent settled-cost evidence verification.");
    }
    if (!adapter || typeof adapter.estimate !== "function" || typeof adapter.run !== "function") {
      return failure(input, "voice_adapter_unavailable", "Live execution requires host-injected estimate and execution adapters; no provider call was attempted.");
    }
    const requestDigest = voiceStudioRequestDigest(input);
    const combinedSignal = combineSignals(signal, input.limits.timeoutMs);
    let adapterStarted = false;
    let sourceVerified = false;
    let adapterResult = null;
    let verifiedRights = null;
    let estimate = null;
    let settledCost = null;
    try {
      if (!await verifyApproval(approvalVerifier, input, requestDigest, combinedSignal, now)) {
        return failure(input, "approval_denied", "The approval receipt is not exactly scoped, current, and unrevoked for this voice request.");
      }
      verifiedRights = await verifyRights(rightsVerifier, input, requestDigest, combinedSignal, now);
      if (!verifiedRights) {
        return failure(input, "voice_rights_denied", "Voice rights are expired, revoked, mismatched, disallowed, or public-figure restricted.");
      }
      const sourceArtifact = await resolveSourceArtifact(
        sourceArtifactResolver,
        input,
        requestDigest,
        combinedSignal,
      );
      if (!sourceArtifact) {
        return failure(input, "source_artifact_verification_failed", "The source owner did not resolve exact digest-bound artifact metadata.");
      }
      sourceVerified = true;
      const adapterContext = {
        sourceArtifact,
        authorization: {
          approvalReceiptId: input.approvalReceiptId,
          approvalScope: approvalScopeFor(input),
          costPolicy: { ...input.costPolicy },
          ...verifiedRights,
        },
      };
      estimate = await verifyAdapterEstimate(
        adapter,
        input,
        requestDigest,
        adapterContext,
        combinedSignal,
      );
      if (!estimate) {
        return failure(input, "adapter_cost_estimate_invalid", "The host adapter did not return exact zero-spend cost evidence.", {
          rightsStatus: "adapter-verified",
          rights: verifiedRights,
          proof: { sourceArtifactVerified: true },
        });
      }
      if (costExceedsPolicy(estimate, input.costPolicy)) {
        return failure(input, "cost_policy_exceeded", "The verified estimate exceeds the approved cost or call ceiling.", {
          state: "blocked",
          rightsStatus: "adapter-verified",
          rights: verifiedRights,
          cost: {
            ...zeroCost(input, estimate.estimatedCostUsd),
            incomplete: false,
          },
          proof: {
            costEstimateVerified: true,
            sourceArtifactVerified: true,
          },
        });
      }
      adapterStarted = true;
      adapterResult = await invokeWithSignal(
        () => adapter.run(structuredClone(input), {
          signal: combinedSignal,
          ...adapterContext,
          costEstimate: { ...estimate },
        }),
        combinedSignal,
      );
      combinedSignal.throwIfAborted();
      settledCost = await verifyCostEvidence(
        costEvidenceVerifier,
        input,
        requestDigest,
        adapterResult,
        combinedSignal,
      );
      if (!settledCost) {
        return afterDispatchFailure(
          input,
          "cost_evidence_verification_failed",
          "Independent settled-cost evidence did not exactly match the adapter receipt.",
          adapterResult,
          verifiedRights,
          { estimate },
        );
      }
      if (settledCostExceedsPolicy(settledCost, input.costPolicy)) {
        return afterDispatchFailure(
          input,
          "cost_policy_exceeded",
          "Verified settled cost exceeds the approved cost or call ceiling; reconcile before retry.",
          adapterResult,
          verifiedRights,
          { estimate, settledCost },
        );
      }
      const prepared = prepareAdapterSuccess(input, adapterResult, settledCost);
      if (prepared.error) {
        return afterDispatchFailure(
          input,
          prepared.error[0],
          prepared.error[1],
          adapterResult,
          verifiedRights,
          { estimate, settledCost },
        );
      }
      if (!await verifyOutputArtifact(
        outputArtifactVerifier,
        input,
        requestDigest,
        prepared,
        verifiedRights,
        combinedSignal,
      )) {
        return afterDispatchFailure(
          input,
          "output_artifact_verification_failed",
          "Independent read-back did not match the exact output digest and provenance.",
          adapterResult,
          verifiedRights,
          { estimate, settledCost },
        );
      }
      combinedSignal.throwIfAborted();
      return successResult(input, adapterResult, prepared, verifiedRights, estimate);
    } catch {
      const canceled = combinedSignal.aborted;
      if (!adapterStarted) {
        return failure(
          input,
          canceled ? "voice_operation_cancelled" : "voice_preflight_failed",
          canceled
            ? "The voice operation was cancelled before adapter dispatch."
            : "A host-owned approval, rights, or source verifier failed safely.",
          {
            state: canceled ? "canceled" : "blocked",
            proof: { cancellationRequested: canceled, sourceArtifactVerified: sourceVerified },
            retryEligible: !canceled,
          },
        );
      }
      return afterDispatchFailure(
        input,
        canceled ? "voice_operation_cancelled" : "adapter_execution_failed",
        canceled
          ? "The voice operation was cancelled after dispatch; reconcile the existing receipt before retry."
          : "The voice adapter or output verifier failed without exposing private provider details.",
        adapterResult,
        verifiedRights,
        { cancellationRequested: canceled, sourceArtifactVerified: sourceVerified, estimate, settledCost },
      );
    }
  };

  return Object.freeze({
    canHandle: toolName => toolName === VOICE_STUDIO_TOOL_NAME,
    async run(toolName, input = {}, { signal } = {}) {
      if (toolName !== VOICE_STUDIO_TOOL_NAME) {
        return failure(input, "unknown_tool", "Unknown voice-studio tool.");
      }
      const validation = validateVoiceStudioInput(input);
      if (!validation.valid) {
        const first = validation.errors[0];
        return failure(input, first.code, first.message);
      }
      const requestDigest = voiceStudioRequestDigest(input);
      let prior = ledger.get(input.idempotencyKey);
      if (prior?.state === "terminal" && prior.expiresAt <= now()) {
        ledger.delete(input.idempotencyKey);
        prior = null;
      }
      if (prior) {
        if (prior.requestDigest !== requestDigest) {
          return failure(input, "idempotency_conflict", "The idempotency key is already bound to another exact voice action.");
        }
        const result = prior.state === "in-flight" ? await prior.promise : prior.result;
        return deepFreezeResult({ ...result, cached: true });
      }
      const entry = { state: "in-flight", requestDigest, promise: null };
      entry.promise = Promise.resolve()
        .then(() => execute(structuredClone(input), signal))
        .catch(() => failure(input, "voice_runtime_failed", "The voice runtime failed safely before returning a terminal receipt."))
        .then(result => {
          const terminal = deepFreezeResult({ ...result, cached: false });
          ledger.set(input.idempotencyKey, {
            state: "terminal",
            requestDigest,
            result: terminal,
            expiresAt: now() + idempotencyTtlMs,
          });
          return terminal;
        });
      ledger.set(input.idempotencyKey, entry);
      return entry.promise;
    },
  });
}
