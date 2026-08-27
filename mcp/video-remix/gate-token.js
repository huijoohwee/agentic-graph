// Shared Approval_Token verification helper for the video-remix Director
// runtime spend boundaries (agenticgraph-acos-mcp-connector spec).
//
// Responsibility (single): decide whether a presented Approval_Token authorizes
// a paid action at a NAMED Approval_Gate. The token authorizes execution ONLY
// when it is present, matches the requested gate, is unexpired (issuance age <=
// the gate TTL, default 15 minutes — R4.7), is unconsumed (single-use, R11.8),
// and carries a verified signature. In every other case the action must be
// blocked with a reason naming the failed check (R8.2 / R9.3 / R11.7 /
// Property 1).
//
// Reuse-not-rebuild: this is the generalized predicate that `render-token.js`
// (render gate) and `commerce-harness.js` (payment-action gate) BOTH delegate
// to, so the same gate-token semantics are enforced everywhere instead of being
// duplicated per gate. It is a PURE predicate and NEVER mutates the token —
// marking a permitted token consumed (R11.8) is the caller's job once it
// proceeds. The TTL window is evaluated against an INJECTABLE `now` (no real
// timer) so the decision is deterministic and unit/property testable.
//
// Property 1 also requires that a valid Auth_Token never substitutes for an
// Approval_Token at a spend boundary. This module only ever inspects the
// presented Approval_Token against a specific gate id; an Auth_Token (which
// carries subject/entitledRunIds/exp, not a gate id + Approval_Token signature)
// can never satisfy the gate-match check, so it fails closed.
//
// Pure / SDK-agnostic: importable by both the Node tests and the Cloudflare
// Worker bundle.

// Default Approval_Token validity window: 15 minutes since issuance (R4.7).
export const DEFAULT_GATE_TOKEN_TTL_MS = 15 * 60 * 1000;

// Reason codes surfaced when verification fails, so the caller can name the
// failed check on the Run_Manifest (R8.2 / R9.3 / R11.7). Mutually exclusive;
// the FIRST failing check wins, checked in the order below.
export const GATE_TOKEN_REASON_ABSENT = "absent";
export const GATE_TOKEN_REASON_MALFORMED = "malformed";
export const GATE_TOKEN_REASON_GATE_MISMATCH = "gate_mismatch";
export const GATE_TOKEN_REASON_INVALID_SIGNATURE = "invalid_signature";
export const GATE_TOKEN_REASON_EXPIRED = "expired";
export const GATE_TOKEN_REASON_CONSUMED = "consumed";

/**
 * Coerce an `issuedAt` value (epoch ms number or ISO-8601 string) into epoch
 * milliseconds. Returns `null` when it cannot be parsed.
 */
export function toIssuedAtMs(issuedAt) {
  if (typeof issuedAt === "number") {
    return Number.isFinite(issuedAt) ? issuedAt : null;
  }
  if (typeof issuedAt === "string" && issuedAt.trim()) {
    const ms = Date.parse(issuedAt);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/**
 * Resolve the injectable clock to epoch milliseconds.
 */
export function resolveNowMs(now) {
  if (typeof now === "function") return Number(now());
  if (Number.isFinite(now)) return Number(now);
  return Date.now();
}

/**
 * Verify an Approval_Token against a NAMED gate (R4.2 / R4.3 / R4.7 /
 * R11.6-11.8 / Property 1).
 *
 * Accepts a token-shaped object
 * `{ gateId, issuedAt, consumed, verified|signature }`:
 *   * `gateId`    — must equal the requested gate (gate-match, R11.7). An
 *                   omitted/different gateId is treated as a mismatch at a real
 *                   spend boundary (fail-closed): the token must explicitly
 *                   target the requested gate.
 *   * `issuedAt`  — epoch ms or ISO string; the token is valid only within
 *                   `ttlMs` of issuance (R4.7). A future-dated or unparseable
 *                   issuedAt fails closed as expired.
 *   * `consumed`  — a truthy `consumed` flag means the single-use token was
 *                   already spent (R11.8) and cannot authorize a second action.
 *   * verified    — a truthy `verified` flag OR a non-empty `signature` string
 *                   stands in for signature verification at this layer; the
 *                   real cryptographic check is wired at the Hitl_Gate_Service.
 *
 * @param {object|null|undefined} token - the presented Approval_Token.
 * @param {object} options
 * @param {string} options.gateId - the requested action's gate (REQUIRED).
 * @param {() => number | number} [options.now] - injectable clock (epoch ms).
 * @param {number} [options.ttlMs] - validity window (defaults to 15 min).
 * @returns {{ valid: boolean, reason: string|null, gateId: string }}
 */
export function verifyGateToken(token, options = {}) {
  const requestedGateId = options.gateId;
  const ttlMs = Number.isFinite(options.ttlMs) ? Number(options.ttlMs) : DEFAULT_GATE_TOKEN_TTL_MS;
  const nowMs = resolveNowMs(options.now);

  if (token === null || token === undefined || token === false) {
    return { valid: false, reason: GATE_TOKEN_REASON_ABSENT, gateId: requestedGateId };
  }
  if (typeof token !== "object") {
    return { valid: false, reason: GATE_TOKEN_REASON_MALFORMED, gateId: requestedGateId };
  }

  // Gate match (R11.7): the token must explicitly target the requested action's
  // gate. Fail-closed when the gate is absent or different.
  if (token.gateId !== requestedGateId) {
    return { valid: false, reason: GATE_TOKEN_REASON_GATE_MISMATCH, gateId: requestedGateId };
  }

  // Signature / verified flag. A valid Auth_Token never reaches here, and a
  // bare object without a verified signal cannot authorize spend (R15.9).
  const hasSignature =
    Boolean(token.verified) ||
    (typeof token.signature === "string" && token.signature.trim().length > 0);
  if (!hasSignature) {
    return { valid: false, reason: GATE_TOKEN_REASON_INVALID_SIGNATURE, gateId: requestedGateId };
  }

  // Expiry window (R4.7): valid only within `ttlMs` of issuance. A missing /
  // unparseable or future-dated issuance fails closed as expired.
  const issuedAtMs = toIssuedAtMs(token.issuedAt);
  if (issuedAtMs === null) {
    return { valid: false, reason: GATE_TOKEN_REASON_EXPIRED, gateId: requestedGateId };
  }
  const ageMs = nowMs - issuedAtMs;
  if (ageMs < 0 || ageMs > ttlMs) {
    return { valid: false, reason: GATE_TOKEN_REASON_EXPIRED, gateId: requestedGateId };
  }

  // Single-use (R11.8): a consumed token cannot authorize a second paid action.
  if (token.consumed === true) {
    return { valid: false, reason: GATE_TOKEN_REASON_CONSUMED, gateId: requestedGateId };
  }

  return { valid: true, reason: null, gateId: requestedGateId };
}
