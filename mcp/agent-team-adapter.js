import crypto from "node:crypto";

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
const nonNegativeNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
export const AGENT_TEAM_PRIVATE_OUTPUT_MAX_BYTES = 64 * 1024;
const digestText = (value) => crypto.createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) => (
  isRecord(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key))
);

export const digestAgentTeamPrivateContext = (privateContext) => (
  digestText(JSON.stringify(privateContext))
);

export function createAgentTeamDelegateSynthesisReceipt({
  sourceParticipantId,
  privateOutput,
  output,
  privateContextDigest,
}) {
  const targetOutputDigest = digestText(privateOutput);
  const synthesisInputDigest = digestText(JSON.stringify({
    targetOutputDigest,
    priorPrivateContextDigest: privateContextDigest,
  }));
  return Object.freeze({
    synthesizedByParticipantId: sourceParticipantId,
    targetOutputDigest,
    priorPrivateContextDigest: privateContextDigest,
    synthesisInputDigest,
    outputDigest: digestText(output),
  });
}

export function createAgentTeamOutputAcceptanceReceipt({ ownerParticipant, output }) {
  return Object.freeze({
    accepted: true,
    finalAnswerOwnerParticipantId: ownerParticipant.participantId,
    agentId: ownerParticipant.agentId,
    agentRevision: ownerParticipant.agentRevision,
    outputDigest: digestText(output),
  });
}

export function validateAgentTeamBudgetEnvelope(value) {
  if (
    !isRecord(value)
    || !nonNegativeInteger(value.inputTokens)
    || !nonNegativeInteger(value.outputTokens)
    || !Number.isSafeInteger(value.inputTokens + value.outputTokens)
    || !nonNegativeNumber(value.costUsd)
    || !Number.isSafeInteger(value.timeMs)
    || value.timeMs < 1
  ) {
    throw Object.assign(new Error("Execution adapter must provide a reported non-negative budget envelope."), {
      code: "adapter_budget_envelope_unavailable",
    });
  }
  return {
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    totalTokens: value.inputTokens + value.outputTokens,
    costUsd: value.costUsd,
    timeMs: value.timeMs,
    costStatus: "reported",
  };
}

export function validateAgentTeamBranchResult(value, {
  branchRoute,
  participants,
  currentOwnerParticipantId,
  privateContextDigest,
}) {
  if (!isRecord(value) || value.ok !== true) {
    throw Object.assign(new Error("Agent Orchestration adapter did not return a valid branch receipt."), {
      code: "branch_execution_failed",
    });
  }
  const participantIds = new Set(participants.map((participant) => participant.participantId));
  if (
    value.branchId !== branchRoute.branchId
    || value.mode !== branchRoute.mode
    || value.sourceParticipantId !== branchRoute.sourceParticipantId
    || value.targetParticipantId !== branchRoute.targetParticipantId
  ) {
    throw Object.assign(new Error("Execution adapter returned an unexpected branch identity or mode."), { code: "invalid_branch_result" });
  }
  for (const field of [
    "sourceParticipantId", "targetParticipantId",
    "conversationOwnerParticipantId", "finalAnswerOwnerParticipantId",
  ]) {
    if (!participantIds.has(value[field])) {
      throw Object.assign(new Error(`Execution adapter returned an unknown participant in ${field}.`), { code: "invalid_branch_result" });
    }
  }
  if (value.sourceParticipantId !== currentOwnerParticipantId || value.sourceParticipantId === value.targetParticipantId) {
    throw Object.assign(new Error("Execution adapter returned a stale owner or self-route."), { code: "invalid_branch_result" });
  }
  const expectedOwner = value.mode === "delegate" ? value.sourceParticipantId : value.targetParticipantId;
  if (
    value.conversationOwnerParticipantId !== expectedOwner
    || value.finalAnswerOwnerParticipantId !== expectedOwner
  ) {
    throw Object.assign(new Error("Execution adapter violated delegate or handoff ownership."), { code: "invalid_branch_ownership" });
  }
  if (
    typeof value.output !== "string"
    || !value.output.trim()
    || value.output.length > 200_000
    || (
      value.privateOutput !== undefined
      && (
        typeof value.privateOutput !== "string"
        || Buffer.byteLength(value.privateOutput, "utf8") > AGENT_TEAM_PRIVATE_OUTPUT_MAX_BYTES
      )
    )
  ) {
    throw Object.assign(new Error("Execution adapter returned an invalid bounded output."), { code: "invalid_branch_result" });
  }
  const ownerParticipant = participants.find((participant) => participant.participantId === expectedOwner);
  const outputAcceptance = createAgentTeamOutputAcceptanceReceipt({
    ownerParticipant,
    output: value.output,
  });
  if (
    !exactKeys(value.outputAcceptance, Object.keys(outputAcceptance))
    || Object.entries(outputAcceptance).some(([key, expected]) => value.outputAcceptance[key] !== expected)
  ) {
    throw Object.assign(new Error("Final-answer owner output-guardrail acceptance receipt is missing or stale."), {
      code: "output_guardrail_receipt_mismatch",
    });
  }
  if (
    !Number.isInteger(value.delegationDepth)
    || value.delegationDepth < 0
    || !Number.isInteger(value.fanout)
    || value.fanout < 1
  ) {
    throw Object.assign(new Error("Execution adapter must report delegation depth and fanout."), { code: "invalid_branch_result" });
  }
  let delegateSynthesis;
  if (value.mode === "delegate") {
    if (typeof value.privateOutput !== "string" || !value.privateOutput.trim()) {
      throw Object.assign(new Error("Delegate execution must return a bounded private target output."), { code: "delegate_synthesis_receipt_missing" });
    }
    const expectedSynthesis = createAgentTeamDelegateSynthesisReceipt({
      sourceParticipantId: value.sourceParticipantId,
      privateOutput: value.privateOutput,
      output: value.output,
      privateContextDigest,
    });
    if (
      !exactKeys(value.delegateSynthesis, Object.keys(expectedSynthesis))
      || Object.entries(expectedSynthesis).some(([key, expected]) => value.delegateSynthesis[key] !== expected)
    ) {
      throw Object.assign(new Error("Delegate synthesis receipt did not bind target output to source synthesis."), {
        code: "delegate_synthesis_receipt_mismatch",
      });
    }
    delegateSynthesis = expectedSynthesis;
  } else if (value.privateOutput !== undefined || value.delegateSynthesis !== undefined) {
    throw Object.assign(new Error("Handoff execution cannot return a delegate synthesis receipt."), { code: "invalid_branch_result" });
  }
  return {
    branchId: branchRoute.branchId,
    mode: value.mode,
    sourceParticipantId: value.sourceParticipantId,
    targetParticipantId: value.targetParticipantId,
    conversationOwnerParticipantId: value.conversationOwnerParticipantId,
    finalAnswerOwnerParticipantId: value.finalAnswerOwnerParticipantId,
    output: value.output,
    ...(value.privateOutput === undefined ? {} : { privateOutput: value.privateOutput }),
    ...(delegateSynthesis ? { delegateSynthesis } : {}),
    outputAcceptance,
    delegationDepth: value.delegationDepth,
    fanout: value.fanout,
    usage: validateAgentTeamBudgetEnvelope(value.usage),
    requiresReview: value.requiresReview === true,
    evidence: Array.isArray(value.evidence)
      ? value.evidence.slice(0, 16).map((entry) => ({
          kind: "adapter_evidence_digest",
          digest: crypto.createHash("sha256").update(JSON.stringify({
            kind: String(entry?.kind || "adapter").slice(0, 120),
            reference: String(entry?.reference || "").slice(0, 500),
          })).digest("hex"),
        }))
      : [],
  };
}

export function createDeterministicAgentTeamAdapter({
  id = "knowgrph.agent-team.deterministic/v1",
  revision = "deterministic-v1",
  responses = {},
} = {}) {
  if (!isRecord(responses)) throw new TypeError("Deterministic agent-team adapter responses must be an object.");
  const receipts = new Map();
  return Object.freeze({
    id,
    revision,
    configured: true,
    replaySafe: true,
    estimateZeroSpend: true,
    zeroSpend: true,
    async estimate({ input }) {
      const response = responses[input.branchId];
      if (!response) throw Object.assign(new Error(`No deterministic response is registered for ${input.branchId}.`), { code: "branch_not_configured" });
      const usage = response.usage || { inputTokens: 0, outputTokens: 0, costUsd: 0, timeMs: 1 };
      return validateAgentTeamBudgetEnvelope({ ...usage, timeMs: Math.max(1_000, Number(usage.timeMs) || 0) });
    },
    async execute({ input, effectId }) {
      if (receipts.has(effectId)) return structuredClone(receipts.get(effectId));
      const response = responses[input.branchId];
      if (!response) return { ok: false, error: { code: "branch_not_configured", message: `No deterministic response is registered for ${input.branchId}.` } };
      const settled = structuredClone(typeof response === "function" ? await response(input) : response);
      receipts.set(effectId, settled);
      return structuredClone(settled);
    },
  });
}
