// Injectable Stripe / payout / publish seams for the video-remix
// Commerce_Harness (agenticgraph-acos-mcp-connector spec, task 3.14 / R9.1, R9.2,
// R9.3, R9.4 / Property 17). These are the SEAMS that integration task 9.2
// swaps for the live wiring into the reused payment-worker assets:
//   * `cloudflare/workers/agenticgraph-payment/payments.ts`
//     (`createStripeHostedCheckoutSessionForWorker` -> Stripe
//     `https://api.stripe.com/v1/checkout/sessions`),
//   * `cloudflare/workers/agenticgraph-payment/agenticCommerce*.ts`
//     (the ACP checkout-session + settlement flow), and
//   * `grph-shared/src/payments/stripeMcpSsot.ts` /
//     `grph-shared/src/payments/stripePaymentSsot.ts` (Stripe MCP + checkout
//     SSOTs).
// Here every default is a DETERMINISTIC, in-memory mock so the local runtime
// makes ZERO live network calls (reuse-not-rebuild: the live modules already
// own the real Stripe fetch / settlement logic).
//
// The seam shapes MIRROR the live wiring exactly so 9.2 is a drop-in swap:
//   * stripe client : `createCheckoutSession({ runId, assetUrl, priceId,
//     amountTotal, currency, workspaceId, agenticCommerceSessionId })` ->
//     `{ session, body }` where `session` mirrors the `StripeSessionWrite`
//     shape in payments.ts and `body` mirrors the
//     `StripeHostedCheckoutSessionCreateSuccess.body`
//     `{ id, url, status, paymentStatus }`.
//   * payout client : `settle({ sessionId, runId, amountTotal, currency })` ->
//     the settlement confirmation observable to the caller (mirrors
//     `settleAgenticCommerceSessionFromStripeSession`).
//   * publish client: `publish({ asset, runId })` -> `{ assetUrl, publishedUrl }`.
//
// Pure / SDK-agnostic apart from the injected clients: importable by both the
// Node tests and the Cloudflare Worker bundle.

import { cleanString, slugify } from "./helpers.js";

// Gate guarding the checkout/payout stage. Matches
// `SPEND_BEARING_STAGE_GATES.checkout` and the `payment-action` entry in the
// `APPROVAL_GATES` catalog (constants.js) so the harness, the runtime, and the
// McpAgent boundary agree (R9.1, R9.3).
export const PAYMENT_GATE_ID = "payment-action";

// Checkout-session creation deadline (R9.1): a non-empty session id must be
// returned within 10 seconds when `payment-action` is approved. Timer-free
// here — the deterministic seam returns synchronously; an injectable elapsed
// signal models a slow live Stripe call without a real timer. (The reused
// payments.ts uses a 15s LIVE checkout timeout for the raw Stripe fetch;
// R9.1 tightens the harness-observable session-create deadline to 10s.)
export const COMMERCE_CHECKOUT_DEADLINE_MS = 10000;

// Stripe checkout-session lifecycle values mirrored from the live
// `mapStripeSession` output (payments.ts): a freshly created hosted Checkout
// Session is `open` / `unpaid`, in `payment` mode.
export const STRIPE_SESSION_STATUS_OPEN = "open";
export const STRIPE_SESSION_PAYMENT_STATUS_UNPAID = "unpaid";
export const STRIPE_CHECKOUT_MODE_PAYMENT = "payment";
export const STRIPE_DEFAULT_CURRENCY = "usd";

// Payout lifecycle values (R9.2, R9.3): a payout starts in its pre-checkout
// state and is only moved to `settled` once an approved session is created and
// settlement succeeds.
export const PAYOUT_STATE_PRE_CHECKOUT = "pre_checkout";
export const PAYOUT_STATE_SETTLED = "settled";

// Provider identity recorded on the produced session (parallels the render
// PROVIDER_* identities).
export const PROVIDER_STRIPE = "stripe";

// Default per-asset checkout amount (integer minor units / cents) charged on
// the deterministic seam so the success path exercises a concrete amount.
// Stripe `amount_total` is an integer minor-unit amount (payments.ts).
export const DEFAULT_CHECKOUT_AMOUNT_TOTAL = 1999;

// Hosted Stripe Checkout base URL — mirrors the live hosted-checkout URL host
// so a produced `session.url` is shaped like the real one (payments.ts maps the
// Stripe `url` field straight through).
const STRIPE_HOSTED_CHECKOUT_BASE = "https://checkout.stripe.com/c/pay";

/**
 * Deterministic Stripe checkout-session id for a run. Mirrors the Stripe
 * `cs_*` Checkout Session id convention; the `_local` infix marks it as the
 * deterministic (network-free) seam value so it is never confused with a live
 * `cs_test_` / `cs_live_` id.
 */
export function stripeSessionId(runId, suffix = "") {
  const tail = suffix ? `_${slugify(suffix, "asset")}` : "";
  return `cs_local_${slugify(runId, "run")}${tail}`;
}

/**
 * Build the hosted Stripe Checkout URL for a session id (mirrors the live
 * `session.url` shape passed straight through by payments.ts).
 */
export function stripeCheckoutUrl(sessionId) {
  return `${STRIPE_HOSTED_CHECKOUT_BASE}/${encodeURIComponent(sessionId)}`;
}

/**
 * Build the DEFAULT deterministic Stripe checkout client (the live-path
 * `createStripeHostedCheckoutSessionForWorker` seam). It performs NO network
 * call: it synchronously returns a session object whose fields mirror the live
 * `StripeSessionWrite` + success `body` shapes. Integration task 9.2 injects
 * the real client via `deps.stripeClient`.
 *
 * @param {object} [options]
 * @param {number} [options.amountTotal] - default checkout amount (minor units).
 * @param {string} [options.currency]    - default currency code.
 */
export function createDeterministicStripeClient(options = {}) {
  const defaultAmount = Number.isFinite(options.amountTotal)
    ? Math.max(0, Math.round(options.amountTotal))
    : DEFAULT_CHECKOUT_AMOUNT_TOTAL;
  const defaultCurrency = cleanString(options.currency, STRIPE_DEFAULT_CURRENCY).toLowerCase();
  return {
    isDeterministicMock: true,
    provider: PROVIDER_STRIPE,
    createCheckoutSession({
      runId,
      assetUrl,
      priceId,
      amountTotal,
      currency,
      workspaceId,
      agenticCommerceSessionId,
    } = {}) {
      const amount = Number.isFinite(amountTotal) ? Math.max(0, Math.round(amountTotal)) : defaultAmount;
      const cur = cleanString(currency, defaultCurrency).toLowerCase();
      const id = stripeSessionId(runId, assetUrl || priceId);
      const url = stripeCheckoutUrl(id);
      // `session` mirrors the live `StripeSessionWrite` shape (payments.ts).
      const session = {
        id,
        url,
        status: STRIPE_SESSION_STATUS_OPEN,
        paymentStatus: STRIPE_SESSION_PAYMENT_STATUS_UNPAID,
        mode: STRIPE_CHECKOUT_MODE_PAYMENT,
        amountTotal: amount,
        currency: cur,
        workspaceId: cleanString(workspaceId) || null,
        agenticCommerceSessionId: cleanString(agenticCommerceSessionId) || null,
        priceId: cleanString(priceId) || null,
        assetUrl: cleanString(assetUrl) || null,
        provider: PROVIDER_STRIPE,
      };
      // `body` mirrors the live `StripeHostedCheckoutSessionCreateSuccess.body`.
      const body = {
        id: session.id,
        url: session.url,
        status: session.status,
        paymentStatus: session.paymentStatus,
      };
      return { session, body };
    },
  };
}

/**
 * Build the DEFAULT deterministic payout / settlement client (the
 * `settleAgenticCommerceSessionFromStripeSession` seam, R9.2). It records the
 * settlement in memory and returns an observable confirmation; the live client
 * (task 9.2) settles the ACP session against the verified Stripe session.
 */
export function createDeterministicPayoutClient() {
  const settlements = [];
  return {
    isDeterministicMock: true,
    settle({ sessionId, runId, amountTotal, currency } = {}) {
      const confirmation = {
        settled: true,
        payoutState: PAYOUT_STATE_SETTLED,
        sessionId: cleanString(sessionId),
        runId: cleanString(runId, "video-remix-run"),
        amountTotal: Number.isFinite(amountTotal) ? Math.max(0, Math.round(amountTotal)) : 0,
        currency: cleanString(currency, STRIPE_DEFAULT_CURRENCY).toLowerCase(),
      };
      settlements.push(confirmation);
      return confirmation;
    },
    // Test/inspection helper — the in-memory record of everything settled.
    settlements,
  };
}

/**
 * Build the DEFAULT deterministic publish client. It maps a rendered asset
 * reference (an `r2://` media-bucket reference produced by the Render_Harness)
 * to a resolvable published URL WITHOUT a network call. The live client
 * (task 9.2) would publish through the configured CDN / public-bucket mapping.
 */
export function createDeterministicPublishClient(options = {}) {
  const base = cleanString(options.publicBaseUrl, "https://media.agenticgraph.dev");
  return {
    isDeterministicMock: true,
    publish({ asset, runId } = {}) {
      const assetUrl = cleanString(asset && asset.assetUrl);
      const shotId = cleanString(asset && asset.shotId, "asset");
      const objectKey = cleanString(asset && asset.objectKey) || `${slugify(runId, "run")}/${slugify(shotId, "asset")}`;
      const publishedUrl = `${base}/${objectKey}`;
      return { assetUrl, shotId, publishedUrl };
    },
  };
}
