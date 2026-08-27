// =============================================================================
// ApprovalGate + Approval_Token — canonical schemas + pure validators (SSOT)
// agenticgraph-acos-mcp-connector spec · Section 8 (Data models / shared contracts)
// Task 8.2 · Requirements R4.7, R11.6, R11.8 · design.md › Data Models
//          (ApprovalGate, Approval_Token)
// =============================================================================
//
// WHY THIS FILE EXISTS
// --------------------
// The ApprovalGate and Approval_Token shapes were previously defined ad-hoc:
//   - issuance:     mcp/video-remix/approval-token-issuer.js (mints tokens)
//   - verification: mcp/video-remix/gate-token.js (verifyGateToken predicate)
//   - manifest:     contracts/run-manifest.schema.js (validates the gate at the
//                   SSOT *shape* level only: token === object|null)
//
// This module is the SINGLE SOURCE OF TRUTH for both shapes. It MIRRORS EXACTLY
// the token object that `verifyGateToken` inspects and that the issuer mints —
// `{ gateId, issuedAt, consumed, signature|verified, tokenId?, estimatedCostUsd? }`
// — so the contracts package becomes the canonical definition the mcp modules
// (and AWS / web tiers) re-point to later, rather than a fork. It does NOT
// import from mcp/: the contracts package is framework-agnostic and
// dependency-free, and the gate-id / gate-state enums are reused from the
// sibling run-manifest SSOT so the enum is never duplicated.
//
// It is:
//   - dependency-free (no JSON-schema lib), plain ESM, reachable by every tier,
//   - PURE: `validateApprovalToken` / `validateApprovalGate` return
//     `{ valid, errors:[{path,reason}] }`, NEVER throw, make ZERO network
//     calls, and are fully deterministic.
//
// The 15-minute validity window (R4.7) is published as the canonical TTL
// constant `APPROVAL_TOKEN_TTL_MS` (15 * 60 * 1000) and as a pure, injectable-
// clock validity predicate `isApprovalTokenWithinValidity`. This matches
// `DEFAULT_GATE_TOKEN_TTL_MS` in mcp/video-remix/gate-token.js by value so
// issuance, verification, and this contract all agree on the window.
// =============================================================================

// Reuse the canonical gate-id + gate-state enums from the run-manifest SSOT
// (do NOT duplicate the enum). Re-export them so a caller can import all
// approval-related constants from this module.
import {
  APPROVAL_GATE_ID,
  APPROVAL_GATE_ID_VALUES,
  APPROVAL_GATE_STATE,
  APPROVAL_GATE_STATE_VALUES,
} from "./run-manifest.schema.js";

export {
  APPROVAL_GATE_ID,
  APPROVAL_GATE_ID_VALUES,
  APPROVAL_GATE_STATE,
  APPROVAL_GATE_STATE_VALUES,
};

// -----------------------------------------------------------------------------
// Canonical TTL (R4.7): an Approval_Token is valid only within 15 minutes of
// issuance. Mirrors mcp/video-remix/gate-token.js DEFAULT_GATE_TOKEN_TTL_MS by
// value so the SSOT, the issuer, and the verifier share one window.
// -----------------------------------------------------------------------------
export const APPROVAL_TOKEN_TTL_MS = 15 * 60 * 1000;

/** Canonical Approval_Token field names (stable for cross-tier use). */
export const APPROVAL_TOKEN_FIELDS = Object.freeze({
  GATE_ID: "gateId",
  ISSUED_AT: "issuedAt",
  CONSUMED: "consumed",
  SIGNATURE: "signature",
  VERIFIED: "verified",
  TOKEN_ID: "tokenId",
  ESTIMATED_COST_USD: "estimatedCostUsd",
});

/** Canonical ApprovalGate field names (stable for cross-tier use). */
export const APPROVAL_GATE_FIELDS = Object.freeze({
  GATE_ID: "gateId",
  APPROVAL_STATE: "approvalState",
  ESTIMATED_COST_USD: "estimatedCostUsd",
  TOKEN: "token",
});

// -----------------------------------------------------------------------------
// Small pure predicates (no throw, no I/O)
// -----------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeNumber(value) {
  return isFiniteNumber(value) && value >= 0;
}

/**
 * Coerce an `issuedAt` value (epoch ms number or ISO-8601 string) into epoch
 * milliseconds. Returns `null` when it cannot be parsed. Mirrors
 * mcp/video-remix/gate-token.js `toIssuedAtMs` so the SSOT agrees on the
 * accepted issuedAt domain (R4.7).
 *
 * @param {unknown} issuedAt
 * @returns {number|null}
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
 * Does the token carry a verifiable signature marker? Mirrors the
 * `hasSignature` check in mcp/video-remix/gate-token.js: a truthy `verified`
 * flag OR a non-empty `signature` string stands in for signature verification
 * at this layer (the real cryptographic check is wired at the
 * Hitl_Gate_Service).
 *
 * @param {object} token
 * @returns {boolean}
 */
function hasVerifiableMarker(token) {
  return (
    token.verified === true ||
    (typeof token.signature === "string" && token.signature.trim().length > 0)
  );
}

// -----------------------------------------------------------------------------
// Approval_Token validator — pure, never throws, structured {path, reason}.
// -----------------------------------------------------------------------------

/**
 * Validate an Approval_Token against the canonical SSOT schema (design Data
 * Models › Approval_Token; R4.7, R11.6, R11.8).
 *
 * Required canonical fields (mirrors verifyGateToken / the issuer):
 *   * `gateId`   — one of the canonical Approval_Gate ids (R11.6 gate-match).
 *   * `issuedAt` — epoch ms (finite number) or ISO-8601 string; basis for the
 *                  15-minute validity window (R4.7).
 *   * `consumed` — boolean single-use flag (R11.8); single-use enforcement
 *                  flips it true after a permitted spend.
 *   * signature  — a verifiable marker: a non-empty `signature` string OR a
 *                  truthy `verified` flag.
 *
 * Optional fields validated when present:
 *   * `tokenId`          — non-empty string (issuer storage key).
 *   * `estimatedCostUsd` — number >= 0 (shown in the approval prompt, R1.6).
 *
 * Pure and total: any input (including `undefined`, `null`, primitives) yields
 * a result object and never throws.
 *
 * @param {unknown} token
 * @returns {{ valid: boolean, errors: Array<{ path: string, reason: string }> }}
 */
export function validateApprovalToken(token) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });

  if (!isPlainObject(token)) {
    add("", "Approval_Token must be a non-null object");
    return { valid: false, errors };
  }

  validateApprovalTokenInto(token, "", add);
  return { valid: errors.length === 0, errors };
}

/**
 * Shared Approval_Token field validation, writing errors at `prefix` (so it can
 * be reused for `ApprovalGate.token` with a `token` path prefix). Pure.
 *
 * @param {object} token
 * @param {string} prefix - "" for a top-level token, "token" when nested.
 * @param {(path: string, reason: string) => void} add
 */
function validateApprovalTokenInto(token, prefix, add) {
  const at = (field) => (prefix ? `${prefix}.${field}` : field);

  // gateId — required, canonical gate-id enum (R11.6 gate-match).
  if (!("gateId" in token)) add(at("gateId"), "required field is missing");
  else if (!APPROVAL_GATE_ID_VALUES.includes(token.gateId)) {
    add(at("gateId"), `must be one of ${APPROVAL_GATE_ID_VALUES.join(", ")}`);
  }

  // issuedAt — required, epoch ms or ISO string (R4.7 validity basis).
  if (!("issuedAt" in token)) add(at("issuedAt"), "required field is missing");
  else if (toIssuedAtMs(token.issuedAt) === null) {
    add(at("issuedAt"), "must be epoch milliseconds or an ISO-8601 timestamp string");
  }

  // consumed — required, boolean single-use flag (R11.8).
  if (!("consumed" in token)) add(at("consumed"), "required field is missing");
  else if (typeof token.consumed !== "boolean") {
    add(at("consumed"), "must be a boolean single-use flag");
  }

  // signature / verified — at least one verifiable marker required.
  if (!hasVerifiableMarker(token)) {
    add(
      at("signature"),
      "must carry a verifiable marker: a non-empty signature string or verified:true",
    );
  }

  // tokenId — optional; when present must be a non-empty string.
  if ("tokenId" in token && !isNonEmptyString(token.tokenId)) {
    add(at("tokenId"), "when present must be a non-empty string");
  }

  // estimatedCostUsd — optional; when present must be a number >= 0.
  if ("estimatedCostUsd" in token && !isNonNegativeNumber(token.estimatedCostUsd)) {
    add(at("estimatedCostUsd"), "when present must be a number >= 0");
  }
}

/**
 * Pure validity-window predicate (R4.7): is the token within `ttlMs` of its
 * issuance, evaluated against an injectable clock? Does NOT mutate the token
 * and makes ZERO calls beyond reading the clock. A missing/unparseable or
 * future-dated issuedAt is treated as outside the window (fail-closed), exactly
 * as mcp/video-remix/gate-token.js does.
 *
 * @param {object} token - an Approval_Token-shaped object.
 * @param {object} [options]
 * @param {() => number | number} [options.now] - injectable clock (epoch ms).
 * @param {number} [options.ttlMs] - validity window (defaults to 15 min).
 * @returns {boolean}
 */
export function isApprovalTokenWithinValidity(token, options = {}) {
  if (!isPlainObject(token)) return false;
  const ttlMs = Number.isFinite(options.ttlMs) ? Number(options.ttlMs) : APPROVAL_TOKEN_TTL_MS;
  const nowMs =
    typeof options.now === "function"
      ? Number(options.now())
      : Number.isFinite(options.now)
        ? Number(options.now)
        : Date.now();
  const issuedAtMs = toIssuedAtMs(token.issuedAt);
  if (issuedAtMs === null) return false;
  const ageMs = nowMs - issuedAtMs;
  return ageMs >= 0 && ageMs <= ttlMs;
}

// -----------------------------------------------------------------------------
// ApprovalGate validator — pure, never throws, structured {path, reason}.
// -----------------------------------------------------------------------------

/**
 * Validate an ApprovalGate against the canonical SSOT schema (design Data
 * Models › ApprovalGate).
 *
 * Required fields:
 *   * `gateId`           — canonical Approval_Gate id enum.
 *   * `approvalState`    — one of pending | approved | rejected.
 *   * `estimatedCostUsd` — number >= 0 (shown in the UI, R1.6 / R13.1).
 *   * `token`            — an Approval_Token object or null. When non-null it
 *                          is validated with `validateApprovalToken` and its
 *                          errors are reported under the `token` path prefix.
 *
 * Pure and total: any input yields a result object and never throws.
 *
 * @param {unknown} gate
 * @returns {{ valid: boolean, errors: Array<{ path: string, reason: string }> }}
 */
export function validateApprovalGate(gate) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });

  if (!isPlainObject(gate)) {
    add("", "ApprovalGate must be a non-null object");
    return { valid: false, errors };
  }

  if (!("gateId" in gate)) add("gateId", "required field is missing");
  else if (!APPROVAL_GATE_ID_VALUES.includes(gate.gateId)) {
    add("gateId", `must be one of ${APPROVAL_GATE_ID_VALUES.join(", ")}`);
  }

  if (!("approvalState" in gate)) add("approvalState", "required field is missing");
  else if (!APPROVAL_GATE_STATE_VALUES.includes(gate.approvalState)) {
    add("approvalState", `must be one of ${APPROVAL_GATE_STATE_VALUES.join(", ")}`);
  }

  if (!("estimatedCostUsd" in gate)) add("estimatedCostUsd", "required field is missing");
  else if (!isNonNegativeNumber(gate.estimatedCostUsd)) {
    add("estimatedCostUsd", "must be a number >= 0");
  }

  // token: Approval_Token object or null. Compose the token validator at the
  // `token` path prefix when a non-null object is present.
  if (!("token" in gate)) add("token", "required field is missing");
  else if (gate.token === null) {
    // null is valid — a pending gate has no issued token yet.
  } else if (!isPlainObject(gate.token)) {
    add("token", "must be an Approval_Token object or null");
  } else {
    validateApprovalTokenInto(gate.token, "token", add);
  }

  return { valid: errors.length === 0, errors };
}

// -----------------------------------------------------------------------------
// Convenience factory — a minimal, schema-valid ApprovalGate skeleton (pending,
// no token). Mirrors the Run_Manifest live-without-approvals baseline.
// -----------------------------------------------------------------------------

/**
 * Build a canonical, schema-valid pending ApprovalGate (no token yet).
 * @param {string} gateId - one of APPROVAL_GATE_ID_VALUES.
 * @param {{ estimatedCostUsd?: number }} [init]
 * @returns {object} an ApprovalGate that passes validateApprovalGate
 */
export function createApprovalGate(gateId, init = {}) {
  return {
    gateId: APPROVAL_GATE_ID_VALUES.includes(gateId) ? gateId : APPROVAL_GATE_ID.PAID_MODEL_CALL,
    approvalState: APPROVAL_GATE_STATE.PENDING,
    estimatedCostUsd: isNonNegativeNumber(init.estimatedCostUsd) ? init.estimatedCostUsd : 0,
    token: null,
  };
}

// =============================================================================
// RECONCILIATION NOTES (kept consistent with run-manifest.schema.js)
// =============================================================================
// 1. gateId enum: reused verbatim from run-manifest.schema.js (six gate ids,
//    including `render-action`). The enum is NOT duplicated here — it is
//    imported and re-exported so this module and the Run_Manifest validator can
//    never drift.
// 2. Token shape: mirrors EXACTLY the object minted by
//    mcp/video-remix/approval-token-issuer.js and inspected by
//    mcp/video-remix/gate-token.js `verifyGateToken`
//    (`{ gateId, issuedAt, consumed, signature|verified, tokenId?,
//    estimatedCostUsd? }`). `tokenId` (storage key) and `estimatedCostUsd`
//    (approval-prompt estimate) are OPTIONAL because the issuer adds them but
//    the design Data Models Approval_Token core is
//    `{ gateId, issuedAt, consumed, signature }`. Both are accepted so the SSOT
//    validates the live token without forcing a fork.
// 3. signature/verified marker: a non-empty `signature` string OR `verified:
//    true` satisfies the verifiable-marker check, matching `verifyGateToken`'s
//    `hasSignature` logic, so a token that verifies at the spend boundary also
//    validates here, and vice-versa.
// 4. TTL: `APPROVAL_TOKEN_TTL_MS` (15 * 60 * 1000) equals
//    `DEFAULT_GATE_TOKEN_TTL_MS` / `APPROVAL_TOKEN_TTL_MS` in the mcp modules by
//    value; the 15-minute validity window (R4.7) has one canonical source here.
// =============================================================================
