import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { hashExternalToolValue, stableExternalToolJson } from "./external-tool-profile-registry.js";

export const EXTERNAL_FILE_WRITE_GATE_ID = "external-file-write";
export const EXTERNAL_MCP_APPROVAL_SECRET_ENV = "AGENTICGRAPH_EXTERNAL_MCP_APPROVAL_SECRET";
export const EXTERNAL_MCP_APPROVAL_TTL_MS = 15 * 60 * 1000;

export class ExternalToolApprovalError extends Error {
  constructor(code, message, actionDigest = "") {
    super(message);
    this.name = "ExternalToolApprovalError";
    this.code = code;
    this.actionDigest = actionDigest;
  }
}

const readNowMs = (now) => {
  const value = typeof now === "function" ? now() : typeof now === "undefined" ? Date.now() : now;
  if (!Number.isFinite(value)) throw new TypeError("Approval clock must return epoch milliseconds.");
  return Math.floor(Number(value));
};

const assertApprovalSecret = (secret) => {
  const normalized = typeof secret === "string" ? secret : "";
  if (normalized.length < 32) {
    throw new ExternalToolApprovalError(
      "approval_not_configured",
      `${EXTERNAL_MCP_APPROVAL_SECRET_ENV} must contain at least 32 characters.`,
    );
  }
  return normalized;
};

const tokenPayload = (token) => ({
  gateId: token.gateId,
  tokenId: token.tokenId,
  actionDigest: token.actionDigest,
  issuedAt: token.issuedAt,
  expiresAt: token.expiresAt,
});

const signTokenPayload = (payload, secret) =>
  createHmac("sha256", secret).update(stableExternalToolJson(payload)).digest("hex");

const safeSignatureEqual = (left, right) => {
  if (typeof left !== "string" || typeof right !== "string" || !/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
};

export function computeExternalToolActionDigest(args = {}) {
  return hashExternalToolValue({
    gateId: EXTERNAL_FILE_WRITE_GATE_ID,
    capabilityId: String(args.capabilityId || "").trim(),
    capabilityRevision: String(args.capabilityRevision || "").trim(),
    artifact: args.artifact,
    idempotencyKey: String(args.idempotencyKey || "").trim(),
  });
}

export function createExternalToolApprovalToken(args = {}) {
  const secret = assertApprovalSecret(args.secret);
  const issuedAt = readNowMs(args.now);
  const ttlMs = Number(args.ttlMs ?? EXTERNAL_MCP_APPROVAL_TTL_MS);
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > EXTERNAL_MCP_APPROVAL_TTL_MS) {
    throw new TypeError(`Approval ttlMs must be an integer between 1000 and ${EXTERNAL_MCP_APPROVAL_TTL_MS}.`);
  }
  const actionDigest = typeof args.actionDigest === "string" && /^[0-9a-f]{64}$/.test(args.actionDigest)
    ? args.actionDigest
    : computeExternalToolActionDigest(args);
  const token = {
    gateId: EXTERNAL_FILE_WRITE_GATE_ID,
    tokenId: String(args.tokenId || randomUUID()).trim(),
    actionDigest,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
  };
  if (token.tokenId.length < 16 || token.tokenId.length > 128) throw new TypeError("Approval tokenId must contain 16-128 characters.");
  return Object.freeze({ ...token, signature: signTokenPayload(token, secret) });
}

export function verifyExternalToolApproval(args = {}) {
  const actionDigest = String(args.actionDigest || "").trim();
  const token = args.token;
  if (!token || typeof token !== "object" || Array.isArray(token)) {
    throw new ExternalToolApprovalError("approval_required", "External file creation requires an approval token.", actionDigest);
  }
  const secret = assertApprovalSecret(args.secret);
  if (token.gateId !== EXTERNAL_FILE_WRITE_GATE_ID) {
    throw new ExternalToolApprovalError("approval_gate_mismatch", `Approval token must target ${EXTERNAL_FILE_WRITE_GATE_ID}.`, actionDigest);
  }
  if (token.actionDigest !== actionDigest) {
    throw new ExternalToolApprovalError("approval_digest_mismatch", "Approval token does not match this exact external artifact action.", actionDigest);
  }
  const tokenId = typeof token.tokenId === "string" ? token.tokenId.trim() : "";
  const issuedAt = Number(token.issuedAt);
  const expiresAt = Number(token.expiresAt);
  if (tokenId.length < 16 || tokenId.length > 128 || !Number.isInteger(issuedAt) || !Number.isInteger(expiresAt)) {
    throw new ExternalToolApprovalError("approval_malformed", "Approval token fields are malformed.", actionDigest);
  }
  const nowMs = readNowMs(args.now);
  if (issuedAt > nowMs || expiresAt <= nowMs || expiresAt <= issuedAt || expiresAt - issuedAt > EXTERNAL_MCP_APPROVAL_TTL_MS) {
    throw new ExternalToolApprovalError("approval_expired", "Approval token is expired or outside the allowed validity window.", actionDigest);
  }
  const expectedSignature = signTokenPayload(tokenPayload(token), secret);
  if (!safeSignatureEqual(String(token.signature || "").toLowerCase(), expectedSignature)) {
    throw new ExternalToolApprovalError("approval_invalid_signature", "Approval token signature is invalid.", actionDigest);
  }
  const consumedTokenIds = args.consumedTokenIds;
  if (!(consumedTokenIds instanceof Set)) throw new TypeError("authorizeExternalToolAction requires a Set-backed consumedTokenIds ledger.");
  if (consumedTokenIds.has(tokenId)) {
    throw new ExternalToolApprovalError("approval_consumed", "Approval token has already been consumed.", actionDigest);
  }
  return Object.freeze({ ok: true, gateId: EXTERNAL_FILE_WRITE_GATE_ID, tokenId, actionDigest });
}

export function authorizeExternalToolAction(args = {}) {
  const verified = verifyExternalToolApproval(args);
  const consumedTokenIds = args.consumedTokenIds;
  // Reserve before the egressing mutation so concurrent calls cannot reuse the token.
  consumedTokenIds.add(verified.tokenId);
  return verified;
}
