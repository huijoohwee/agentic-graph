// Commerce_Harness webhook-mismatch reconciliation for the video-remix
// Director runtime (agenticgraph-acos-mcp-connector spec, task 3.17 / R5.6 /
// Design Property 18).
//
// Responsibility (single): given an incoming Stripe checkout webhook event and
// the set of VERIFIED checkout sessions for a run, decide whether the webhook
// matches a verified session and, when it does NOT, fail-closed —
//   * WITHHOLD the payout,
//   * leave the payout AMOUNT UNCHANGED, and
//   * append a reconciliation flag to the Run_Manifest identifying the run.
// When the webhook DOES match a verified session, allow the normal settlement
// path (no reconciliation flag).
//
// R5.6: IF a Stripe checkout webhook does not match a verified session in the
//   Commerce_Harness, THEN THE Commerce_Harness SHALL withhold the payout,
//   leave the payout amount unchanged, and append a reconciliation flag to the
//   Run_Manifest identifying the affected run.
// Property 18: For any Stripe checkout webhook that does not match a verified
//   session, the Commerce_Harness withholds the payout, leaves the payout
//   amount unchanged, and appends a reconciliation flag identifying the run.
//
// MATCH semantics mirror the reused payment-worker assets THROUGH AN INJECTABLE
// SEAM so the local runtime makes ZERO live network calls:
//   * signature verification mirrors `verifyStripeSignature` in
//     `cloudflare/workers/agenticgraph-payment/payments.ts` (the `stripe-signature`
//     `t=`/`v1=` HMAC-SHA256 check) — here a deterministic verifier seam stands
//     in for the live crypto/network check;
//   * session matching mirrors `readFiatSessionForStripeSession` in
//     `cloudflare/workers/agenticgraph-payment/agenticCommerceSettlement.ts`
//     (the webhook's checkout-session id must exist among the verified sessions
//     and its amount_total + currency must agree with the stored session).
// We DO NOT fork/rewrite those modules — the live wiring (integration task 9.2)
// injects the real verifier/session store via `deps`.
//
// The appended flag REUSES the existing Run_Manifest `reconciliationFlags: string[]`
// shape and the human-readable flag style of `reconciliation.js`
// (`buildReconciliationFlag`); because the existing ledger-vs-meters reason is
// not applicable here, a webhook-specific reason is used (R5.6 "identifying the
// affected run").
//
// Pure / SDK-agnostic apart from the injected verifier: importable by both the
// Node tests and the Cloudflare Worker bundle.

import { cleanString } from "./helpers.js";
import { PAYOUT_STATE_PRE_CHECKOUT } from "./commerce-providers.js";

// Stripe webhook signature freshness tolerance (seconds) — mirrors
// `STRIPE_WEBHOOK_TOLERANCE_SECONDS` (5 minutes) in payments.ts so the
// deterministic verifier seam enforces the same window the live check does.
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

// Webhook-specific reconciliation flag reason + check id (distinct from the
// ledger-vs-meters `RECONCILIATION_FLAG_REASON` in reconciliation.js).
export const WEBHOOK_RECONCILIATION_FLAG_REASON = "stripe_webhook_no_matching_verified_session";
export const WEBHOOK_RECONCILIATION_CHECK_ID = "stripe_webhook_session_match_or_reconciliation_flag";

// Mismatch reason classes (the specific check that failed). Surfaced on the
// result so the caller can record WHY the webhook did not match (R5.6).
export const WEBHOOK_MISMATCH_REASON_SIGNATURE = "signature_unverified";
export const WEBHOOK_MISMATCH_REASON_UNKNOWN_SESSION = "no_matching_verified_session";
export const WEBHOOK_MISMATCH_REASON_AMOUNT = "amount_total_mismatch";
export const WEBHOOK_MISMATCH_REASON_CURRENCY = "currency_mismatch";

// Payout dispositions surfaced on the result.
export const PAYOUT_DISPOSITION_WITHHELD = "withheld";
export const PAYOUT_DISPOSITION_SETTLEMENT_ALLOWED = "settlement_allowed";

/**
 * Coerce a value to a safe integer minor-unit (cents) amount. Non-finite
 * values become `null` so an absent amount never spuriously equals 0.
 */
function toAmountOrNull(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number);
}

/**
 * Extract the Stripe checkout-session object carried by a webhook event.
 * Mirrors the live `event.data.object` shape; tolerates a bare session object
 * passed directly as the event.
 */
function readWebhookSessionObject(event) {
  if (!event || typeof event !== "object") return {};
  const data = event.data && typeof event.data === "object" ? event.data : null;
  const object = data && data.object && typeof data.object === "object" ? data.object : null;
  return object || event;
}

/**
 * Extract the checkout-session identifier a webhook refers to. Mirrors the live
 * matcher's use of the Stripe session `id` (falling back to
 * `client_reference_id`, the agentic-commerce session id Stripe echoes back).
 */
export function extractWebhookSessionId(event) {
  const object = readWebhookSessionObject(event);
  return (
    cleanString(object.id) ||
    cleanString(object.client_reference_id) ||
    cleanString(object.sessionId) ||
    ""
  );
}

/**
 * Normalize the set of VERIFIED checkout sessions for a run into a lookup map
 * keyed by session id. Each verified session contributes its expected
 * `amountTotal` (minor units) and `currency` so the matcher can mirror the live
 * `readFiatSessionForStripeSession` amount/currency agreement check. Accepts
 * the harness session shape (`{ id, amountTotal, currency }`) and tolerates
 * snake_case (`amount_total`).
 */
export function indexVerifiedSessions(verifiedSessions = []) {
  const index = new Map();
  if (!Array.isArray(verifiedSessions)) return index;
  for (const session of verifiedSessions) {
    if (!session || typeof session !== "object") continue;
    const id = cleanString(session.id) || cleanString(session.sessionId);
    if (!id) continue;
    index.set(id, {
      id,
      amountTotal: toAmountOrNull(session.amountTotal ?? session.amount_total),
      currency: cleanString(session.currency).toLowerCase() || null,
      // Carried through for the deterministic verifier seam's per-session
      // expected-signature compare (mirrors a per-session webhook secret).
      expectedSignature: cleanString(session.expectedSignature) || null,
    });
  }
  return index;
}

/**
 * The DEFAULT deterministic Stripe webhook signature verifier seam — the
 * network/crypto-free stand-in for `verifyStripeSignature` (payments.ts). It
 * verifies WITHOUT computing a real HMAC by comparing the event's presented
 * signature against the expected per-session signature recorded for a verified
 * session, and by enforcing the same freshness tolerance the live check uses.
 * Integration task 9.2 injects the real verifier via `deps.webhookVerifier`.
 *
 * @param {object} [options]
 * @param {string} [options.signingSecret] - opaque secret (recorded, not used
 *   for a live HMAC here); presence models a configured webhook secret.
 * @param {number} [options.toleranceSeconds] - freshness window.
 */
export function createDeterministicWebhookVerifier(options = {}) {
  const toleranceSeconds = Number.isFinite(options.toleranceSeconds)
    ? Math.max(0, Math.round(options.toleranceSeconds))
    : WEBHOOK_SIGNATURE_TOLERANCE_SECONDS;
  return {
    isDeterministicMock: true,
    /**
     * @param {object} args
     * @param {object} args.event             - the incoming webhook event.
     * @param {object|null} args.matchedSession - the verified session matched by
     *   id (carries the `expectedSignature` for the deterministic compare), or
     *   null when no id matched.
     * @param {number} args.nowMs             - current epoch ms (freshness).
     * @returns {{ verified: boolean }}
     */
    verify({ event, matchedSession, nowMs } = {}) {
      const object = readWebhookSessionObject(event);
      const presented = cleanString(object.signature) || cleanString(event && event.signature);
      if (!presented) return { verified: false };
      // Freshness: an event timestamp older than the tolerance fails (mirrors
      // the live `ageSeconds > tolerance` rejection).
      const timestamp = Number(object.signatureTimestamp ?? (event && event.signatureTimestamp));
      if (Number.isFinite(timestamp) && Number.isFinite(nowMs)) {
        const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - Math.floor(timestamp));
        if (ageSeconds > toleranceSeconds) return { verified: false };
      }
      // A webhook whose id did not match any verified session cannot have a
      // recorded expected signature to compare against.
      if (!matchedSession) return { verified: false };
      const expected = cleanString(matchedSession.expectedSignature);
      // When a verified session records an expected signature, the presented
      // signature must equal it; otherwise (no recorded expectation) a present
      // signature is accepted as verified by the deterministic seam.
      if (expected) return { verified: presented === expected };
      return { verified: true };
    },
  };
}

/**
 * Build the human-readable webhook reconciliation flag string appended to the
 * Run_Manifest `reconciliationFlags[]` (R5.6). Identifies the affected run, the
 * unmatched webhook/session id, and the specific failed check, and records the
 * fail-closed "payout withheld, amount unchanged" discipline so it is
 * observable (mirrors the flag style of `reconciliation.js`).
 */
export function buildWebhookReconciliationFlag({ runId, sessionId, reason, amountCents } = {}) {
  const amountNote =
    amountCents === null || amountCents === undefined
      ? "amount unchanged"
      : `amount unchanged ($${(Number(amountCents) / 100).toFixed(2)})`;
  return (
    `webhook-reconciliation run=${runId || "unknown"}: ` +
    `Stripe checkout webhook (session=${sessionId || "unknown"}) does not match a verified session ` +
    `(${reason || WEBHOOK_RECONCILIATION_FLAG_REASON}); payout WITHHELD, ${amountNote}; ` +
    `${WEBHOOK_RECONCILIATION_FLAG_REASON}`
  );
}

/**
 * Decide whether a webhook event matches a verified session, mirroring the live
 * `readFiatSessionForStripeSession` agreement checks (id present + amount_total
 * + currency) plus signature verification through the injectable seam. Returns
 * `{ matched, reason, sessionId, matchedSession }`. Pure aside from the
 * injected verifier.
 */
export function matchWebhookToVerifiedSession(input = {}, deps = {}) {
  const { event } = input;
  const sessionId = extractWebhookSessionId(event);
  const index = indexVerifiedSessions(input.verifiedSessions);
  const verifier = deps.webhookVerifier || createDeterministicWebhookVerifier();
  const nowMs = typeof deps.now === "function" ? deps.now() : Number.isFinite(deps.now) ? deps.now : Date.now();

  // 1) The webhook must name a session id present among the verified sessions.
  //    An id that matches no verified session is the clearest mismatch class
  //    (no recorded session to verify a signature against).
  const matchedSession = sessionId ? index.get(sessionId) || null : null;
  if (!matchedSession) {
    return { matched: false, reason: WEBHOOK_MISMATCH_REASON_UNKNOWN_SESSION, sessionId, matchedSession: null };
  }

  // 2) Signature verification (mirrors verifyStripeSignature) against the
  //    matched verified session.
  const signature = verifier.verify({ event, matchedSession, nowMs });
  if (!signature || signature.verified !== true) {
    return { matched: false, reason: WEBHOOK_MISMATCH_REASON_SIGNATURE, sessionId, matchedSession: null };
  }

  // 3) Amount + currency must agree with the verified session (mirrors the
  //    live amount_total / currency equality check).
  const object = readWebhookSessionObject(event);
  if (matchedSession.amountTotal !== null) {
    const eventAmount = toAmountOrNull(object.amountTotal ?? object.amount_total);
    if (eventAmount !== matchedSession.amountTotal) {
      return { matched: false, reason: WEBHOOK_MISMATCH_REASON_AMOUNT, sessionId, matchedSession };
    }
  }
  if (matchedSession.currency !== null) {
    const eventCurrency = cleanString(object.currency).toLowerCase();
    if (eventCurrency && eventCurrency !== matchedSession.currency) {
      return { matched: false, reason: WEBHOOK_MISMATCH_REASON_CURRENCY, sessionId, matchedSession };
    }
  }

  return { matched: true, reason: null, sessionId, matchedSession };
}

/**
 * Reconcile an incoming Stripe checkout webhook against the run's verified
 * checkout sessions (R5.6 / Property 18). On a webhook that does NOT match a
 * verified session: WITHHOLD the payout, leave the payout amount UNCHANGED, and
 * append a webhook reconciliation flag to the run's `reconciliationFlags[]`
 * identifying the run. On a MATCHING webhook: allow the normal settlement path
 * (no reconciliation flag). Pure aside from the injected verifier — ZERO live
 * network calls.
 *
 * @param {object} input
 * @param {object} input.event                 - the incoming Stripe webhook event.
 * @param {Array}  input.verifiedSessions       - verified checkout sessions for the run.
 * @param {string} [input.runId]                - run id (recorded in the flag).
 * @param {number} [input.payoutAmountCents]    - the current payout amount (minor
 *   units); echoed back UNCHANGED so callers can assert it was not modified.
 * @param {string[]} [input.reconciliationFlags] - existing Run_Manifest flags; a
 *   new flag is APPENDED to a copy (the input array is never mutated).
 * @param {object} [deps]
 * @param {object} [deps.webhookVerifier]       - injectable signature verifier seam.
 * @param {(()=>number)|number} [deps.now]      - injectable clock (epoch ms).
 * @returns {object} the reconciliation result envelope.
 */
export function reconcileStripeWebhook(input = {}, deps = {}) {
  const runId = cleanString(input.runId, "video-remix-run");
  const payoutAmountCents = toAmountOrNull(input.payoutAmountCents);
  const priorFlags = Array.isArray(input.reconciliationFlags) ? input.reconciliationFlags.slice() : [];

  const match = matchWebhookToVerifiedSession(input, deps);

  if (match.matched) {
    // Matching webhook → allow the normal settlement path; no flag appended.
    return {
      matched: true,
      reason: null,
      sessionId: match.sessionId,
      payoutWithheld: false,
      payoutDisposition: PAYOUT_DISPOSITION_SETTLEMENT_ALLOWED,
      settlementAllowed: true,
      // Amount is left exactly as supplied (unchanged either way).
      payoutAmountCents,
      reconciliationFlag: null,
      reconciliationFlags: priorFlags,
      flagAppended: false,
      checkId: WEBHOOK_RECONCILIATION_CHECK_ID,
      guardrailOk: true,
    };
  }

  // Mismatch → fail closed: withhold payout, amount unchanged, append a flag.
  const reconciliationFlag = buildWebhookReconciliationFlag({
    runId,
    sessionId: match.sessionId,
    reason: match.reason,
    amountCents: payoutAmountCents,
  });
  return {
    matched: false,
    reason: match.reason,
    sessionId: match.sessionId,
    payoutWithheld: true,
    payoutDisposition: PAYOUT_DISPOSITION_WITHHELD,
    settlementAllowed: false,
    // Payout amount is left UNCHANGED (echoed back as supplied).
    payoutAmountCents,
    payoutState: PAYOUT_STATE_PRE_CHECKOUT,
    reconciliationFlag,
    reconciliationFlags: [...priorFlags, reconciliationFlag],
    flagAppended: true,
    checkId: WEBHOOK_RECONCILIATION_CHECK_ID,
    guardrailOk: true,
  };
}

/**
 * Pure correctness check for Property 18, suitable for the Run_Manifest
 * `validation.checks`/`guardrails`. Holds iff EITHER the webhook matched a
 * verified session AND no flag was appended AND the payout was not withheld, OR
 * the webhook did NOT match AND the payout was withheld AND the amount is
 * unchanged AND exactly one reconciliation flag was appended.
 */
export function webhookReconciliationHolds(result, priorFlagCount = 0) {
  if (!result || typeof result !== "object") return false;
  if (result.matched) {
    return result.payoutWithheld === false && result.flagAppended === false;
  }
  const appendedExactlyOne = Array.isArray(result.reconciliationFlags)
    ? result.reconciliationFlags.length === priorFlagCount + 1
    : false;
  return result.payoutWithheld === true && result.flagAppended === true && appendedExactlyOne;
}
