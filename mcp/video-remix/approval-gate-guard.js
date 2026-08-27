// Verification-immediately-precedes-paid-action guard for the video-remix
// Hitl_Gate_Service (agenticgraph-acos-mcp-connector spec, task 4.2 / R4.2 / R4.7 /
// Correctness Property 1).
//
// Responsibility (single): enforce the *structural* invariant that an
// Approval_Token is verified in the SAME operation that immediately precedes a
// paid (spend-bearing) action, with NO intervening spend-bearing operation
// between the verification and the paid action. The shared `verifyGateToken`
// predicate (gate-token.js) already encodes WHAT makes a token valid (gate
// match, 15-minute TTL since issuance — R4.7, single-use `consumed`, signature,
// and that an Auth_Token can never satisfy a gate — R15.9). This module encodes
// WHEN the check runs relative to the spend: verify first, then — only if the
// token is valid — invoke the supplied spend-bearing function; on any failure
// return the rejection WITHOUT ever calling the spend function.
//
// Reuse-not-rebuild: the validity decision is delegated to the SHARED
// `verifyGateToken` (or an injectable `verify` seam, e.g. an issuer's `verify`
// convenience), so this guard adds zero duplicate token semantics. It is the
// thin sequencing wrapper the Director's render boundary (task 4.5) and the
// Commerce checkout/payout boundary wrap their spend calls in.
//
// No-intervening-spend guarantee: `withApprovalGate` performs exactly two
// observable steps in order — (1) verify, (2) if-valid spend — with nothing
// spend-bearing in between. The optional `onVerify`/`onReject` hooks are
// observability seams only (no spend). The optional `consume` seam (wired by
// task 4.3 for single-use enforcement) runs strictly AFTER the spend completes,
// never between verify and spend, so it cannot become an intervening
// spend-bearing operation.
//
// Pure orchestration / SDK-agnostic + deterministic seams: the clock (`now`),
// the validity predicate (`verify`), and the TTL window (`ttlMs`) are all
// INJECTABLE so the local runtime makes zero live calls and the behavior is
// unit/property testable.

import {
  DEFAULT_GATE_TOKEN_TTL_MS,
  verifyGateToken,
} from "./gate-token.js";
import { buildApprovalRejectionError } from "./approval-rejection.js";

// The guard treats a token as valid only within 15 minutes of issuance (R4.7),
// reusing the shared default TTL so issuance, verification, and this guard all
// agree on the window.
export const APPROVAL_GATE_GUARD_TTL_MS = DEFAULT_GATE_TOKEN_TTL_MS;

/**
 * Verify an Approval_Token for the action that is ABOUT to spend, in the same
 * operation that immediately precedes the paid action (R4.2 / R4.7 /
 * Property 1). This is a thin, side-effect-free wrapper over the shared
 * `verifyGateToken` predicate (or an injectable `verify` seam) that fixes the
 * verification to a single named gate and the 15-minute TTL.
 *
 * It performs NO spend itself — callers invoke it as the last gate immediately
 * before the spend-bearing call (see `withApprovalGate`, which composes this
 * with the spend so nothing can run in between).
 *
 * @param {object|null|undefined} token - the presented Approval_Token.
 * @param {object} options
 * @param {string} options.gateId - the requested paid action's gate (REQUIRED).
 * @param {() => number | number} [options.now] - injectable clock (epoch ms).
 * @param {number} [options.ttlMs] - validity window (defaults to 15 min).
 * @param {(token: object|null|undefined, opts: object) => {valid: boolean, reason: string|null, gateId: string}} [options.verify]
 *   - injectable validity predicate (defaults to the shared `verifyGateToken`).
 * @returns {{ valid: boolean, reason: string|null, gateId: string }}
 */
export function verifyImmediatelyBeforeSpend(token, options = {}) {
  const ttlMs = Number.isFinite(options.ttlMs)
    ? Number(options.ttlMs)
    : APPROVAL_GATE_GUARD_TTL_MS;
  const verify = typeof options.verify === "function" ? options.verify : verifyGateToken;
  return verify(token, { gateId: options.gateId, now: options.now, ttlMs });
}

/**
 * Run a paid (spend-bearing) function ONLY after verifying its Approval_Token
 * in the same operation that immediately precedes it, with no intervening
 * spend-bearing operation (R4.2 / R4.7 / Property 1).
 *
 * Sequence (and the ONLY observable steps):
 *   1. verify the token for `gateId` (15-minute TTL, gate match, single-use,
 *      signature) via the shared predicate / injectable `verify` seam;
 *   2. IF valid  -> invoke `spendFn` immediately (awaited if it returns a
 *      promise) and, only after it resolves, optionally run the `consume` seam;
 *      IF invalid -> return the rejection and NEVER call `spendFn`.
 *
 * The spend-bearing state is therefore unchanged on any rejection (no provider
 * call occurs), and a valid token causes exactly one spend invocation directly
 * after the check.
 *
 * @param {string} gateId - the requested paid action's gate.
 * @param {object|null|undefined} token - the presented Approval_Token.
 * @param {(verification: object) => any} spendFn - the spend-bearing function;
 *   invoked exactly once, immediately after a successful verification. Receives
 *   the verification result for convenience.
 * @param {object} [options]
 * @param {() => number | number} [options.now] - injectable clock (epoch ms).
 * @param {number} [options.ttlMs] - validity window (defaults to 15 min).
 * @param {function} [options.verify] - injectable validity predicate.
 * @param {(args: {token: object|null|undefined, gateId: string, result: any}) => void|Promise<void>} [options.consume]
 *   - OPTIONAL single-use seam (task 4.3): runs strictly AFTER the spend
 *     completes on a permitted action; never between verify and spend.
 * @param {(verification: object) => void} [options.onVerify] - observability
 *   seam invoked with the verification result before the spend (no spend).
 * @param {(verification: object) => void} [options.onReject] - observability
 *   seam invoked with the verification result when the action is blocked.
 * @returns {Promise<{ permitted: boolean, reason: string|null, gateId: string, error: object|null, result: any }>}
 */
export async function withApprovalGate(gateId, token, spendFn, options = {}) {
  if (typeof spendFn !== "function") {
    throw new TypeError("withApprovalGate requires a spend-bearing function (spendFn).");
  }

  // Step 1 — verify in the same operation immediately before the spend.
  const verification = verifyImmediatelyBeforeSpend(token, {
    gateId,
    now: options.now,
    ttlMs: options.ttlMs,
    verify: options.verify,
  });

  if (!verification.valid) {
    // Blocked: do NOT call spendFn; spend-bearing state is left unchanged and
    // a canonical structured error NAMING the failed approval check is returned
    // (R4.8 / R11.7 / Property 1). No intervening or subsequent spend occurs.
    // `reason` is retained alongside the structured `error` for backward
    // compatibility with callers that read the bare reason string.
    if (typeof options.onReject === "function") options.onReject(verification);
    return {
      permitted: false,
      reason: verification.reason,
      gateId: verification.gateId,
      error: buildApprovalRejectionError(verification),
      result: null,
    };
  }

  if (typeof options.onVerify === "function") options.onVerify(verification);

  // Step 2 — the paid action runs immediately after the check, with nothing
  // spend-bearing in between.
  const result = await spendFn(verification);

  // Single-use consumption (task 4.3) is deferred to AFTER the spend so it can
  // never be an operation that runs between verification and the paid action.
  if (typeof options.consume === "function") {
    await options.consume({ token, gateId: verification.gateId, result });
  }

  return {
    permitted: true,
    reason: null,
    gateId: verification.gateId,
    result,
  };
}
