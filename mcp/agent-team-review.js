import crypto from "node:crypto";

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => (
  isRecord(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key))
);

const fail = (code, message) => {
  throw Object.assign(new Error(message), { code });
};

const verifyWithDeadline = async (verifier, expected, timeoutMs, timeoutCode, rejectCode, label) => {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new Error(`${label} timed out.`));
      reject(Object.assign(new Error(`${label} timed out.`), { code: timeoutCode }));
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => verifier(structuredClone(expected), { signal: controller.signal })),
      timeout,
    ]);
  } catch (error) {
    if (error?.code === timeoutCode) throw error;
    fail(rejectCode, `The host owner rejected the exact ${label.toLowerCase()}.`);
  } finally {
    clearTimeout(timer);
  }
};

export async function authorizeAgentTeamControl({ authorizer, state, input }) {
  if (typeof authorizer !== "function") {
    fail("control_authorizer_unavailable", "No host-owned agent-team control authorizer is configured.");
  }
  const expected = {
    runId: state.runId,
    planDigest: state.planDigest,
    checkpointId: state.checkpointId,
    stateVersion: state.stateVersion,
    action: input.action,
    reasonDigest: crypto.createHash("sha256").update(input.reason).digest("hex"),
    policyId: state.plan.reviewPolicy.policyId,
    policyRevision: state.plan.reviewPolicy.policyRevision,
    decision: input.reviewReceipt?.decision || null,
    receiptId: input.reviewReceipt?.receiptId || null,
  };
  const verified = await verifyWithDeadline(
    authorizer,
    expected,
    state.plan.bounds.maxStageTimeMs,
    "control_authorization_timeout",
    "control_not_authorized",
    "Control authorization",
  );
  if (
    !exactKeys(verified, ["ok", "authorization"])
    || verified.ok !== true
    || !exactKeys(verified.authorization, Object.keys(expected))
    || JSON.stringify(verified.authorization) !== JSON.stringify(expected)
  ) fail("control_not_authorized", "The host owner rejected the exact control authorization.");
  return crypto.createHash("sha256").update(JSON.stringify(expected)).digest("hex");
}

export async function verifyAgentTeamReviewReceipt({
  verifier,
  state,
  input,
}) {
  if (typeof verifier !== "function") {
    fail("review_receipt_verifier_unavailable", "No host-owned review receipt verifier is configured.");
  }
  const expected = {
    runId: state.runId,
    planDigest: state.planDigest,
    checkpointId: state.checkpointId,
    stateVersion: state.stateVersion,
    policyId: state.plan.reviewPolicy.policyId,
    policyRevision: state.plan.reviewPolicy.policyRevision,
    decision: input.reviewReceipt.decision,
    receiptId: input.reviewReceipt.receiptId,
  };
  const verified = await verifyWithDeadline(
    verifier,
    expected,
    state.plan.bounds.maxStageTimeMs,
    "review_receipt_verification_timeout",
    "review_receipt_rejected",
    "Review receipt verification",
  );
  if (
    !exactKeys(verified, ["ok", "receipt"])
    || verified.ok !== true
    || !exactKeys(verified.receipt, Object.keys(expected))
    || JSON.stringify(verified.receipt) !== JSON.stringify(expected)
  ) {
    fail("review_receipt_rejected", "The host review owner rejected the exact durable receipt.");
  }
  const digest = crypto.createHash("sha256").update(JSON.stringify(expected)).digest("hex");
  return Object.freeze({
    digest,
    evidence: Object.freeze({
      kind: "review_receipt",
      digest,
      policyId: expected.policyId,
      policyRevision: expected.policyRevision,
      decision: expected.decision,
    }),
  });
}
