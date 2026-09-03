// Render Approval_Token verification for the video-remix Render_Harness
// (agentic-graph-acos-mcp-connector spec, task 3.9 / R8.2 / R4.2 / Property 1 —
// the render spend-boundary side).
//
// Responsibility (single): decide whether a presented render Approval_Token
// authorizes a render dispatch. The token authorizes execution ONLY when it is
// present, matches the render gate (`render-action`), is unexpired (issuance
// age <= 15 minutes, R4.7), is unconsumed (single-use, R11.8), and carries a
// verified signature. In every other case the dispatch must be blocked with a
// reason naming the failed check (R8.2 / R11.7).
//
// Reuse-not-rebuild: the verification predicate is now the SHARED
// `gate-token.js` helper (so the render gate and the payment-action gate
// enforce identical Approval_Token semantics instead of duplicating them). This
// module specializes the shared helper to the render gate + 15-minute TTL and
// preserves the original public surface (RENDER_GATE_ID, RENDER_TOKEN_TTL_MS,
// the RENDER_TOKEN_REASON_* codes, verifyRenderToken) so no importing file or
// test changes.
//
// Boundary / reuse notes (do not overstep adjacent tasks):
//   * Marking a permitted token consumed (so it cannot authorize a second paid
//     action, R11.8) is the CALLER's job once it proceeds — this module is a
//     pure predicate and never mutates the token.
//   * Property 1 also requires that a valid Auth_Token never substitutes for an
//     Approval_Token at a spend boundary. The shared helper only ever inspects
//     the render Approval_Token against the render gate; an Auth_Token can never
//     satisfy it. The Director/McpAgent boundary keeps the two credentials
//     separate (R15.9).
//   * The 15-minute window is evaluated against an INJECTABLE `now` (no real
//     timer) so the decision is deterministic and unit/property testable.
//
// Pure / SDK-agnostic: importable by both the Node tests and the Cloudflare
// Worker bundle.

import {
  DEFAULT_GATE_TOKEN_TTL_MS,
  GATE_TOKEN_REASON_ABSENT,
  GATE_TOKEN_REASON_MALFORMED,
  GATE_TOKEN_REASON_GATE_MISMATCH,
  GATE_TOKEN_REASON_INVALID_SIGNATURE,
  GATE_TOKEN_REASON_EXPIRED,
  GATE_TOKEN_REASON_CONSUMED,
  verifyGateToken,
} from "./gate-token.js";

// Gate guarding the render stage. Matches `SPEND_BEARING_STAGE_GATES.render`
// and the `render-action` entry in the `APPROVAL_GATES` catalog (constants.js)
// so the harness, the runtime, and the McpAgent boundary agree.
export const RENDER_GATE_ID = "render-action";

// Approval_Token validity window: 15 minutes since issuance (R4.7).
export const RENDER_TOKEN_TTL_MS = DEFAULT_GATE_TOKEN_TTL_MS;

// Reason codes surfaced when verification fails (re-exported from the shared
// gate-token helper so the render-gate public surface is unchanged).
export const RENDER_TOKEN_REASON_ABSENT = GATE_TOKEN_REASON_ABSENT;
export const RENDER_TOKEN_REASON_MALFORMED = GATE_TOKEN_REASON_MALFORMED;
export const RENDER_TOKEN_REASON_GATE_MISMATCH = GATE_TOKEN_REASON_GATE_MISMATCH;
export const RENDER_TOKEN_REASON_INVALID_SIGNATURE = GATE_TOKEN_REASON_INVALID_SIGNATURE;
export const RENDER_TOKEN_REASON_EXPIRED = GATE_TOKEN_REASON_EXPIRED;
export const RENDER_TOKEN_REASON_CONSUMED = GATE_TOKEN_REASON_CONSUMED;

/**
 * Verify a render Approval_Token (R8.2 / R4.2 / R4.7 / R11.6-11.8 /
 * Property 1). Specializes the shared `verifyGateToken` predicate to the render
 * gate and the 15-minute TTL. See `gate-token.js` for the token shape.
 *
 * @param {object|null|undefined} token - the presented render Approval_Token.
 * @param {object} [options]
 * @param {() => number | number} [options.now] - injectable clock (epoch ms).
 * @param {string} [options.gateId] - the requested action's gate (defaults to
 *   the render gate); lets the caller assert the token matches THIS action.
 * @returns {{ valid: boolean, reason: string|null, gateId: string }}
 */
export function verifyRenderToken(token, options = {}) {
  return verifyGateToken(token, {
    gateId: options.gateId || RENDER_GATE_ID,
    now: options.now,
    ttlMs: RENDER_TOKEN_TTL_MS,
  });
}
