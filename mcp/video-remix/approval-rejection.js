// Canonical Approval_Gate rejection-error builder for the video-remix
// Hitl_Gate_Service (agentic-graph-acos-mcp-connector spec, task 4.4 / R4.8 / R11.7 /
// Correctness Property 1 — the rejection path).
//
// Responsibility (single): turn a FAILED `verifyGateToken` verification
// (`{ valid:false, reason, gateId }`) into ONE canonical, structured error
// object that NAMES the failed approval check (R4.8 / R11.7). Every spend
// boundary in the Hitl_Gate_Service — the `withApprovalGate` guard, the
// Render_Harness render gate, and the Commerce_Harness `payment-action` gate —
// builds its rejection error THROUGH this single function so the rejection
// shape and the reason -> human-message mapping cannot drift across the five
// rejection classes (missing, invalid/unsigned, expired, consumed, mismatched).
//
// The returned error carries:
//   * `code`   — a stable machine code (default `approval_check_failed`; a
//                domain boundary may override it, e.g. `render_approval_token_failed`);
//   * `gateId` — the requested action's gate (which check failed *for*);
//   * `reason` — the mutually-exclusive failed-check code from `gate-token.js`
//                (`absent` | `malformed` | `gate_mismatch` | `invalid_signature`
//                | `expired` | `consumed`);
//   * `reasonDescription` — a stable human phrase for that reason;
//   * `message` — a full human-readable sentence naming the failed check.
//
// Reuse-not-rebuild: the reason CODES are owned by `gate-token.js`; this module
// only maps them to human text and assembles the error envelope, so there is
// one source of truth for what makes a token invalid and one source of truth
// for how a rejection is surfaced.
//
// Pure / SDK-agnostic: no I/O, no clock, no mutation of the verification or the
// token. Importable by both the Node tests and the Cloudflare Worker bundle.

import {
  GATE_TOKEN_REASON_ABSENT,
  GATE_TOKEN_REASON_MALFORMED,
  GATE_TOKEN_REASON_GATE_MISMATCH,
  GATE_TOKEN_REASON_INVALID_SIGNATURE,
  GATE_TOKEN_REASON_EXPIRED,
  GATE_TOKEN_REASON_CONSUMED,
} from "./gate-token.js";

// Default machine code for a fail-closed approval rejection. Domain boundaries
// (render / commerce) may override it while keeping the same canonical shape.
export const APPROVAL_REJECTION_ERROR_CODE = "approval_check_failed";

// Stable human phrasing for each mutually-exclusive failed-check reason. Keyed
// by the reason codes owned by `gate-token.js` so the two stay in lockstep.
export const APPROVAL_REJECTION_DESCRIPTIONS = Object.freeze({
  [GATE_TOKEN_REASON_ABSENT]: "no Approval_Token was presented",
  [GATE_TOKEN_REASON_MALFORMED]: "the Approval_Token was malformed",
  [GATE_TOKEN_REASON_GATE_MISMATCH]:
    "the Approval_Token does not match the requested gate",
  [GATE_TOKEN_REASON_INVALID_SIGNATURE]:
    "the Approval_Token signature could not be verified",
  [GATE_TOKEN_REASON_EXPIRED]:
    "the Approval_Token is expired (issued more than 15 minutes ago)",
  [GATE_TOKEN_REASON_CONSUMED]:
    "the Approval_Token was already consumed and cannot authorize a second paid action",
});

/**
 * Map a failed-check reason code to its stable human phrase. Falls back to a
 * generic phrase naming the unknown reason (fail-closed: never throws).
 *
 * @param {string|null|undefined} reason
 * @returns {string}
 */
export function describeApprovalRejection(reason) {
  if (reason && Object.prototype.hasOwnProperty.call(APPROVAL_REJECTION_DESCRIPTIONS, reason)) {
    return APPROVAL_REJECTION_DESCRIPTIONS[reason];
  }
  return `the approval check failed (${reason ?? "unknown"})`;
}

/**
 * Build the ONE canonical structured rejection error for a failed Approval_Gate
 * verification (R4.8 / R11.7 / Property 1). Names the failed approval check via
 * `reason` + `gateId` and a human `message`.
 *
 * @param {{ reason?: string|null, gateId?: string|null }} [verification]
 *   the failed `verifyGateToken` result.
 * @param {object} [options]
 * @param {string} [options.code] - override the machine code (default
 *   `approval_check_failed`).
 * @param {string} [options.gateId] - fallback gate id when the verification
 *   omits one.
 * @param {string} [options.message] - override the full human message (a domain
 *   boundary may keep its own wording; it should still name the reason).
 * @param {string} [options.operation] - optional operation label for boundaries
 *   that distinguish the spend operation that was blocked.
 * @returns {{ code: string, gateId: string|null, reason: string|null,
 *   reasonDescription: string, message: string, operation?: string }}
 */
export function buildApprovalRejectionError(verification = {}, options = {}) {
  const reason = verification && verification.reason != null ? verification.reason : null;
  const gateId =
    verification && verification.gateId != null
      ? verification.gateId
      : options.gateId != null
        ? options.gateId
        : null;
  const reasonDescription = describeApprovalRejection(reason);
  const code = options.code || APPROVAL_REJECTION_ERROR_CODE;
  const message =
    options.message ||
    `Approval check failed for gate '${gateId}' (${reason}): ${reasonDescription}. ` +
      "Execution blocked; spend-bearing state unchanged and no paid-provider call performed.";

  const error = { code, gateId, reason, reasonDescription, message };
  if (typeof options.operation === "string" && options.operation) {
    error.operation = options.operation;
  }
  return error;
}
