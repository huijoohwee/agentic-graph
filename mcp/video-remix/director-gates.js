// Director-layer Approval_Gate enforcement wiring for the video-remix runtime
// (agenticgraph-acos-mcp-connector spec, task 4.5 / R4.2, R4.3, R9.3 /
// Correctness Property 1 + Property 17).
//
// Responsibility (single): thread the issued Approval_Token through the render
// and checkout/payout spend boundaries at the DIRECTOR orchestration layer, own
// single-use CONSUMPTION on a permitted use, and RECORD a rejection (reason +
// canonical error) into the Run_Manifest while leaving spend-bearing state
// unchanged. This is the orchestration-layer coherence piece that sits on top
// of the already-implemented Hitl_Gate_Service pieces:
//   * issuance + storage + single-use seam  -> approval-token-issuer.js
//   * verify-immediately-before-spend guard  -> approval-gate-guard.js
//   * the shared spend-boundary predicate    -> gate-token.js / render-token.js
//
// AVOID DOUBLE-VERIFICATION DRIFT (task 4.5 directive): the render harness
// (`runRenderHarnessAsync`) verifies `renderGateToken` internally and the
// commerce harness (`runCheckoutAsync`) verifies `paymentGateToken` internally
// — that harness check is the SINGLE spend-boundary verification. This module
// therefore does NOT re-run `verifyGateToken` (which would be a second,
// potentially divergent check). Instead it READS the harness's own
// permitted/rejected outcome and:
//   * on a PERMITTED use -> applies the issuer's single-use consume seam
//     strictly AFTER the spend so a second use of the same token fails closed
//     (R11.8 / Property 1) and attaches the harness result to the manifest;
//   * on a REJECTED use  -> records the rejection reason + canonical error and
//     preserves the prior Run_State and all spend-bearing state, performing no
//     consumption (a rejected token is never consumed) (R4.8 / R9.3 / R11.7).
//
// Pure / SDK-agnostic apart from the injected harness seams: importable by both
// the Node tests and the Cloudflare Worker bundle. The clock (`now`) and every
// provider client flow through the harness `deps`, so the local runtime makes
// ZERO live network calls.

import { runRenderHarnessAsync } from "./render-harness.js";
import { runCheckoutAsync } from "./commerce-harness.js";
import { RENDER_GATE_ID } from "./render-token.js";
import { PAYMENT_GATE_ID } from "./commerce-providers.js";

// Re-exported so the Director / McpAgent boundary names the same gate ids the
// harnesses verify against (single source of truth — no per-layer drift).
export const DIRECTOR_RENDER_GATE_ID = RENDER_GATE_ID;
export const DIRECTOR_PAYMENT_GATE_ID = PAYMENT_GATE_ID;

/**
 * Apply the issuer's single-use consume seam AFTER a permitted spend (R11.8 /
 * Property 1). The seam (`createApprovalTokenIssuer().consumeSeam()`) accepts
 * the guard-shaped `{ token }` argument and marks the stored token consumed so
 * a second use fails closed with reason `consumed`. A missing seam is a no-op
 * (the Director simply did not own consumption for this call). Returns whether
 * consumption was actually applied.
 *
 * @param {((args: { token: any, gateId: string, result: any }) => any)|undefined} consume
 * @param {{ token: any, gateId: string, result: any }} ctx
 * @returns {Promise<boolean>}
 */
async function applyConsumeSeam(consume, ctx) {
  if (typeof consume !== "function") return false;
  const consumed = await consume(ctx);
  // The seam returns the consumed token object on success, `undefined` when no
  // token is stored under the id. Treat a truthy return as consumption applied.
  return Boolean(consumed);
}

/**
 * Build the canonical Director-layer gate-enforcement outcome shared by the
 * render and checkout boundaries. `permitted` is derived from the harness's own
 * verification outcome (the single spend-boundary check), never from a second
 * verification here. On a rejection the harness's `reason`/`error` (naming the
 * failed approval check) are surfaced for recording into the Run_Manifest.
 *
 * @param {{ stage: string, gateId: string, permitted: boolean, result: object, tokenConsumed: boolean }} args
 */
function buildGateEnforcement({ stage, gateId, permitted, result, tokenConsumed }) {
  const reason = permitted ? null : (result && result.reason) || null;
  const error = permitted ? null : (result && result.error) || null;
  return {
    stage,
    gateId,
    permitted,
    blocked: !permitted,
    reason,
    error,
    tokenConsumed,
    result,
    // Compact record appended to the Run_Manifest so the gate decision is
    // observable on the durable manifest (the rejection reason is recorded per
    // R4.8 / R9.3 / R11.7; a permit records that the token was consumed).
    record: { stage, gateId, permitted, reason, tokenConsumed },
  };
}

/**
 * Enforce the render Approval_Gate (`render-action`) at the Director layer
 * (R4.2 / Property 1). Threads the issued Approval_Token into the render harness
 * as `renderGateToken`; the harness performs the single spend-boundary
 * verification before any provider dispatch. On a permitted dispatch the
 * supplied `consume` seam marks the token consumed (single-use); on a rejection
 * no dispatch and no consumption occur.
 *
 * @param {object} params
 * @param {object|string|null} [params.token] - the issued render Approval_Token.
 * @param {Array} [params.shots] - shots to dispatch (render harness contract).
 * @param {((args: object) => any)} [params.consume] - issuer single-use seam.
 * @param {object} [params.deps] - render harness deps (clock + provider seams).
 * @returns {Promise<object>} the gate-enforcement outcome.
 */
export async function enforceRenderGate({ token, shots, consume, deps = {} } = {}) {
  // The harness owns the single spend-boundary verification (R8.2 / Property 1).
  // The ASYNC harness variant (task 12.4a) is used so an injected LIVE render
  // client (an async `dispatch` seam, task 12.4) is awaited; awaiting the
  // deterministic sync seam is a no-op (parity-guaranteed).
  const result = await runRenderHarnessAsync({ shots, renderGateToken: token }, deps);
  // Permitted IFF the harness did not fail-closed on the token (a `failed`
  // dispatch still means the token was verified valid — it authorized a spend).
  const permitted = result.rejected !== true;
  // Single-use consumption is applied strictly AFTER the permitted spend so it
  // can never be an operation between verification and the paid action.
  const tokenConsumed = permitted
    ? await applyConsumeSeam(consume, { token, gateId: RENDER_GATE_ID, result })
    : false;
  return buildGateEnforcement({
    stage: "render",
    gateId: RENDER_GATE_ID,
    permitted,
    result,
    tokenConsumed,
  });
}

/**
 * Enforce the `payment-action` Approval_Gate at the Director layer for the
 * checkout/payout boundary (R4.3 / R9.3 / Property 1 / Property 17). Threads the
 * issued Approval_Token into the commerce harness as `paymentGateToken`; the
 * harness performs the single spend-boundary verification before creating a
 * Stripe session or settling a payout. On a permitted checkout the `consume`
 * seam marks the token consumed (single-use); on a rejection no session, no
 * settlement, and no consumption occur and the payout stays in its pre-checkout
 * state.
 *
 * @param {object} params
 * @param {object|string|null} [params.token] - the issued payment Approval_Token.
 * @param {object} [params.checkout] - checkout input `{ assetUrl, priceId }`.
 * @param {((args: object) => any)} [params.consume] - issuer single-use seam.
 * @param {object} [params.deps] - commerce harness deps (clock + provider seams).
 * @returns {Promise<object>} the gate-enforcement outcome.
 */
export async function enforceCheckoutGate({ token, checkout = {}, consume, deps = {} } = {}) {
  // ASYNC commerce harness variant (task 12.4a) so an injected LIVE Stripe /
  // payout client (async seams, task 12.4) is awaited; awaiting the
  // deterministic sync seam is a no-op (parity-guaranteed).
  const result = await runCheckoutAsync({ ...checkout, paymentGateToken: token }, deps);
  // Permitted IFF the gate was approved (a post-approval `failed` checkout still
  // means the gate was verified approved — R9.4 — and the token authorized it).
  const permitted = result.gateApproved === true;
  const tokenConsumed = permitted
    ? await applyConsumeSeam(consume, { token, gateId: PAYMENT_GATE_ID, result })
    : false;
  return buildGateEnforcement({
    stage: "checkout",
    gateId: PAYMENT_GATE_ID,
    permitted,
    result,
    tokenConsumed,
  });
}

/**
 * Append a gate-enforcement record to a Run_Manifest's `gateEnforcements[]`
 * (created if absent), copying the manifest rather than mutating it. Shared by
 * the render and checkout recorders below.
 */
function appendEnforcementRecord(manifest, enforcement) {
  const base = manifest && typeof manifest === "object" ? manifest : {};
  const gateEnforcements = Array.isArray(base.gateEnforcements)
    ? [...base.gateEnforcements, enforcement.record]
    : [enforcement.record];
  return { ...base, gateEnforcements };
}

/**
 * Append a rejection note to a Run_Manifest's `gateRejections[]` (created if
 * absent). This is the "record the rejection reason" half of R4.8 / R9.3 /
 * R11.7 — it is metadata only and never touches spend-bearing state.
 */
function appendRejectionNote(manifest, enforcement) {
  const note = {
    stage: enforcement.stage,
    gateId: enforcement.gateId,
    reason: enforcement.reason,
    error: enforcement.error,
  };
  const gateRejections = Array.isArray(manifest.gateRejections)
    ? [...manifest.gateRejections, note]
    : [note];
  return { ...manifest, gateRejections };
}

/**
 * Record the render gate enforcement into a Run_Manifest (copy, never mutate).
 *
 *   * PERMITTED -> attach the produced render assets/ledger events under
 *     `render` (the spend ran) and append the enforcement record.
 *   * REJECTED  -> preserve the prior Run_State and the existing `render` state
 *     unchanged, append the enforcement record, and record the rejection note
 *     (R4.2 / R4.8 / R11.7 / Property 1).
 *
 * @param {object} manifest
 * @param {object} enforcement - result of `enforceRenderGate`.
 * @returns {object} the next manifest.
 */
export function recordRenderGate(manifest, enforcement) {
  let next = appendEnforcementRecord(manifest, enforcement);
  if (enforcement.permitted) {
    next = {
      ...next,
      render: {
        assets: enforcement.result.assets || [],
        ledgerEvents: enforcement.result.ledgerEvents || [],
        providerSpendCents: enforcement.result.providerSpendCents || 0,
      },
    };
    return next;
  }
  // Rejected: spend-bearing state (`render`) and Run_State are left unchanged;
  // only the rejection reason is recorded.
  return appendRejectionNote(next, enforcement);
}

/**
 * Record the checkout/payout gate enforcement into a Run_Manifest (copy, never
 * mutate).
 *
 *   * PERMITTED -> attach the created session + settlement under
 *     `commerce.checkout` (money moved) and append the enforcement record.
 *   * REJECTED  -> preserve the prior Run_State and the existing
 *     `commerce.checkout` payout state unchanged (no session, no settlement),
 *     append the enforcement record, and record the rejection note
 *     (R9.3 / R4.8 / R11.7 / Property 1 / Property 17).
 *
 * @param {object} manifest
 * @param {object} enforcement - result of `enforceCheckoutGate`.
 * @returns {object} the next manifest.
 */
export function recordCheckoutGate(manifest, enforcement) {
  let next = appendEnforcementRecord(manifest, enforcement);
  if (enforcement.permitted) {
    const commerce = next.commerce && typeof next.commerce === "object" ? next.commerce : {};
    next = {
      ...next,
      commerce: {
        ...commerce,
        checkout: {
          sessionId: enforcement.result.sessionId || "",
          payoutSettled: Boolean(enforcement.result.payoutSettled),
          payoutState: enforcement.result.payoutState,
          settlement: enforcement.result.settlement || null,
        },
      },
    };
    return next;
  }
  // Rejected: spend-bearing state (`commerce.checkout` / payout) and Run_State
  // are left unchanged; only the rejection reason is recorded.
  return appendRejectionNote(next, enforcement);
}

/**
 * One-call Director render boundary: enforce the render gate and record the
 * outcome into the Run_Manifest, returning the next manifest plus the
 * enforcement detail. Convenience for the orchestration layer.
 *
 * @returns {Promise<{ manifest: object, enforcement: object }>}
 */
export async function enforceDirectorRenderGate(manifest, params = {}) {
  const enforcement = await enforceRenderGate(params);
  return { manifest: recordRenderGate(manifest, enforcement), enforcement };
}

/**
 * One-call Director checkout/payout boundary: enforce the `payment-action` gate
 * and record the outcome into the Run_Manifest, returning the next manifest plus
 * the enforcement detail.
 *
 * @returns {Promise<{ manifest: object, enforcement: object }>}
 */
export async function enforceDirectorCheckoutGate(manifest, params = {}) {
  const enforcement = await enforceCheckoutGate(params);
  return { manifest: recordCheckoutGate(manifest, enforcement), enforcement };
}
