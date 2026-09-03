// Commerce_Harness for the video-remix Director runtime
// (agentic-graph-acos-mcp-connector spec, task 3.14 / R9.1-R9.4 / Property 17,
// Property 1 — the publish + gated-checkout side).
//
// Responsibility (single): implement the two Commerce_Harness stage operations
// `agentic-graph.video_remix.publish` and `agentic-graph.video_remix.checkout`. Publish
// turns rendered asset references into resolvable published URLs; checkout
// creates a gated Stripe checkout session and settles the payout. The harness
// wires the checkout/payout contract onto the reused payment-worker assets
// (`payments.ts`, `agenticCommerce*.ts`, `stripeMcpSsot.ts`) THROUGH INJECTABLE
// SEAMS (commerce-providers.js) so the local runtime makes ZERO live network
// calls; the live wiring is integration task 9.2.
//
// Contracts (design Components table):
//   publish  : { assets[] }                          -> { publishedUrls[] }
//   checkout : { assetUrl, priceId, paymentGateToken } -> { sessionId }
//
// Behavior:
//   * R9.1 / Property 17: WHEN the `payment-action` Approval_Gate is approved,
//     checkout creates a Stripe checkout session and returns a NON-EMPTY
//     session id within 10s. "Approved" is established by a verified, unexpired,
//     unconsumed `payment-action` Approval_Token (reusing the shared gate-token
//     verification approach from render-token.js). The 10s deadline is recorded
//     as metadata and asserted structurally (an injectable elapsed signal
//     models a slow live Stripe call without a real timer).
//   * R9.2 / Property 17: WHEN approved and a session exists, checkout settles
//     the payout and records a settlement confirmation observable to the caller.
//   * R9.3 / Property 1 / Property 17: IF the `payment-action` gate is any value
//     OTHER than approved (missing / invalid / expired / consumed / mismatched
//     token), checkout creates NO session, settles NO payout, leaves the payout
//     in its pre-checkout state, and returns an error naming the failed check.
//     A valid Auth_Token never substitutes for the Approval_Token (R15.9).
//   * R9.4: IF session creation OR settlement FAILS after the gate is approved,
//     checkout settles no payout, returns an error naming the failed operation,
//     and preserves the payout in its pre-checkout state. (Modeled via an
//     injectable per-operation outcome — no real network/ timer.)
//
// Pure / SDK-agnostic apart from the injected clients: importable by both the
// Node tests and the Cloudflare Worker bundle.

import { cleanString } from "./helpers.js";
import { verifyGateToken } from "./gate-token.js";
import { buildApprovalRejectionError } from "./approval-rejection.js";
import {
  PAYMENT_GATE_ID,
  COMMERCE_CHECKOUT_DEADLINE_MS,
  PAYOUT_STATE_PRE_CHECKOUT,
  createDeterministicStripeClient,
  createDeterministicPayoutClient,
  createDeterministicPublishClient,
} from "./commerce-providers.js";

const PUBLISH_STATUS_COMPLETE = "complete";
const CHECKOUT_STATUS_COMPLETE = "complete";
const CHECKOUT_STATUS_REJECTED = "rejected";
const CHECKOUT_STATUS_FAILED = "failed";

const CHECKOUT_FAILURE_SESSION_CREATE = "session_create_failed";
const CHECKOUT_FAILURE_SETTLEMENT = "settlement_failed";

/**
 * Typed input-validation error for the Commerce_Harness contracts. Mirrors
 * `RenderHarnessInputError` (a `field` naming the offending input) so the
 * McpAgent / Agent_Api boundary can surface the bad field to callers. NOTE: a
 * payment-gate failure is NOT an input error — it is a fail-closed REJECTION
 * result (R9.3), so checkout returns a rejection envelope rather than throwing.
 */
export class CommerceHarnessInputError extends Error {
  constructor(field, message) {
    super(message || `Invalid commerce input: ${field}`);
    this.name = "CommerceHarnessInputError";
    this.code = "invalid_commerce_input";
    this.field = field;
  }
}

/**
 * Normalize one asset entry into `{ shotId, assetUrl, objectKey, raw }`.
 * Accepts a bare string (treated as the assetUrl) or an object carrying
 * `assetUrl`. Throws a typed `CommerceHarnessInputError` naming the field when
 * an asset lacks a resolvable url.
 */
function normalizeAsset(asset, index) {
  if (typeof asset === "string") {
    const assetUrl = cleanString(asset);
    if (!assetUrl) throw new CommerceHarnessInputError(`assets[${index}].assetUrl`, "asset url must be a non-empty string");
    return { shotId: "", assetUrl, objectKey: "", raw: asset };
  }
  if (asset && typeof asset === "object") {
    const assetUrl = cleanString(asset.assetUrl);
    if (!assetUrl) {
      throw new CommerceHarnessInputError(`assets[${index}].assetUrl`, "each asset requires a non-empty assetUrl");
    }
    return {
      shotId: cleanString(asset.shotId),
      assetUrl,
      objectKey: cleanString(asset.objectKey),
      raw: asset,
    };
  }
  throw new CommerceHarnessInputError(`assets[${index}]`, "each asset must be a url string or an object with an assetUrl");
}

/**
 * Enforce the publish input contract `{ assets[] }`. Validates and normalizes a
 * non-empty `assets[]` array and returns `{ assets }`.
 */
export function validatePublishInput(args = {}) {
  const input = args && typeof args === "object" ? args : {};
  if (!Array.isArray(input.assets) || input.assets.length === 0) {
    throw new CommerceHarnessInputError("assets", "assets must be a non-empty array");
  }
  const assets = input.assets.map((asset, index) => normalizeAsset(asset, index));
  return { assets };
}

/**
 * Enforce the checkout input contract `{ assetUrl, priceId, paymentGateToken }`.
 * Validates `assetUrl` (a non-empty string). `priceId` is optional (the reused
 * checkout config may supply a server-side price). The `paymentGateToken` is
 * NOT validated here — it is verified at the spend boundary so a bad token
 * yields a fail-closed rejection (R9.3), not an input error.
 */
export function validateCheckoutInput(args = {}) {
  const input = args && typeof args === "object" ? args : {};
  const assetUrl = cleanString(input.assetUrl);
  if (!assetUrl) {
    throw new CommerceHarnessInputError("assetUrl", "assetUrl must be a non-empty string");
  }
  return { assetUrl, priceId: cleanString(input.priceId) || null };
}

/**
 * Run the publish stage operation (`agentic-graph.video_remix.publish`).
 * Contract: `{ assets[] } -> { publishedUrls[] }`. Deterministic and
 * network-free locally; an injected publish client (9.2) may publish for real.
 *
 * @param {object} input - `{ assets[] }`.
 * @param {object} [deps]
 * @param {string} [deps.runId]          - run id (scopes published urls).
 * @param {object} [deps.publishClient]  - injectable publish seam.
 * @returns {{ status, publishedUrls, published }} the publish result envelope.
 */
export function runPublish(input, deps = {}) {
  const { assets } = validatePublishInput(input);
  const runId = cleanString(deps.runId, "video-remix-run");
  const publishClient = deps.publishClient || createDeterministicPublishClient();

  const published = assets.map((asset) => publishClient.publish({ asset, runId }));
  const publishedUrls = published.map((entry) => entry.publishedUrl);

  return {
    status: PUBLISH_STATUS_COMPLETE,
    gateId: PAYMENT_GATE_ID,
    published,
    publishedUrls,
  };
}

/**
 * Build the fail-closed rejection envelope for a non-approved `payment-action`
 * gate (R9.3 / Property 1 / Property 17). No session, no settlement, payout
 * left in its pre-checkout state, an error naming the failed check.
 */
function buildGateRejection(verification) {
  return {
    status: CHECKOUT_STATUS_REJECTED,
    rejected: true,
    gateId: verification.gateId,
    gateApproved: false,
    reason: verification.reason,
    // Canonical rejection error (shared with the gate guard + render harness)
    // naming the failed approval check; the payment-specific code and message
    // stay owned here while the envelope shape comes from one builder.
    error: buildApprovalRejectionError(verification, {
      code: "payment_approval_gate_not_approved",
      message:
        `Payment Approval_Gate '${verification.gateId}' is not approved ` +
        `(${verification.reason}); no Stripe checkout session created and no payout settled.`,
    }),
    sessionId: null,
    session: null,
    settlement: null,
    payoutState: PAYOUT_STATE_PRE_CHECKOUT,
    sessionCreated: false,
    payoutSettled: false,
    stripeCreateCalls: 0,
    payoutSettleCalls: 0,
    paidProviderCalls: 0,
    checkoutDeadlineMs: COMMERCE_CHECKOUT_DEADLINE_MS,
  };
}

/**
 * Build the fail-closed failure envelope for a session-create / settlement
 * failure AFTER the gate is approved (R9.4). No payout is settled and the
 * payout is preserved in its pre-checkout state.
 */
function buildOperationFailure(reason, operation, extra = {}) {
  return {
    status: CHECKOUT_STATUS_FAILED,
    gateId: PAYMENT_GATE_ID,
    gateApproved: true,
    reason,
    error: {
      code: reason,
      gateId: PAYMENT_GATE_ID,
      operation,
      message: `Checkout ${operation} failed after approval (${reason}); payout preserved in its pre-checkout state.`,
    },
    sessionId: extra.sessionId ?? null,
    session: extra.session ?? null,
    settlement: null,
    payoutState: PAYOUT_STATE_PRE_CHECKOUT,
    sessionCreated: Boolean(extra.session),
    payoutSettled: false,
    stripeCreateCalls: extra.stripeCreateCalls ?? 0,
    payoutSettleCalls: extra.payoutSettleCalls ?? 0,
    paidProviderCalls: extra.stripeCreateCalls ?? 0,
    checkoutDeadlineMs: COMMERCE_CHECKOUT_DEADLINE_MS,
  };
}

/**
 * Run the checkout stage operation (`agentic-graph.video_remix.checkout`).
 * Contract: `{ assetUrl, priceId, paymentGateToken } -> { sessionId }`.
 *
 * Money moves IFF the `payment-action` Approval_Gate is approved
 * (Property 17): a verified, unexpired, unconsumed `payment-action`
 * Approval_Token establishes "approved". On approval the harness creates a
 * Stripe checkout session (returning a non-empty session id within 10s, R9.1)
 * and settles the payout (R9.2). For every other gate state it creates no
 * session and settles no payout (R9.3).
 *
 * @param {object} input - `{ assetUrl, priceId, paymentGateToken }`.
 * @param {object} [deps]
 * @param {string} [deps.runId]          - run id (scopes session/settlement).
 * @param {object} [deps.stripeClient]   - injectable Stripe checkout seam.
 * @param {object} [deps.payoutClient]   - injectable payout/settlement seam.
 * @param {() => number|number} [deps.now] - injectable clock (epoch ms).
 * @param {number} [deps.checkoutElapsedMs] - models live Stripe latency for the
 *   10s deadline assertion (default 0 — synchronous).
 * @param {number} [deps.amountTotal]    - checkout amount (minor units).
 * @param {string} [deps.currency]       - checkout currency code.
 * @param {string} [deps.workspaceId]    - checkout workspace id (metadata).
 * @param {string} [deps.agenticCommerceSessionId] - ACP session id (metadata).
 * @param {object} [deps.outcome]        - `{ sessionCreate?: { failed } ,
 *   settlement?: { failed } }` to model an R9.4 post-approval failure.
 * @returns {{ status, sessionId, session, settlement, ... }} the envelope.
 */
export function runCheckout(input, deps = {}) {
  const { assetUrl, priceId } = validateCheckoutInput(input);
  const runId = cleanString(deps.runId, "video-remix-run");

  // Spend boundary (R9.1 / R9.3 / Property 1 / Property 17): the gate is
  // approved IFF a verified, unexpired, unconsumed `payment-action`
  // Approval_Token is presented. A failed check is a fail-closed rejection —
  // no session, no payout, payout left in its pre-checkout state.
  const verification = verifyGateToken(input.paymentGateToken, {
    gateId: PAYMENT_GATE_ID,
    now: deps.now,
  });
  if (!verification.valid) {
    return buildGateRejection(verification);
  }

  const stripeClient = deps.stripeClient || createDeterministicStripeClient();
  const payoutClient = deps.payoutClient || createDeterministicPayoutClient();
  const outcome = deps.outcome && typeof deps.outcome === "object" ? deps.outcome : {};

  const checkoutElapsedMs = Number.isFinite(deps.checkoutElapsedMs)
    ? Math.max(0, deps.checkoutElapsedMs)
    : 0;

  // R9.4: model an injected session-create failure BEFORE calling the seam.
  if (outcome.sessionCreate && outcome.sessionCreate.failed) {
    return buildOperationFailure(
      CHECKOUT_FAILURE_SESSION_CREATE,
      "session_create",
      { stripeCreateCalls: 0 },
    );
  }

  // Create the Stripe checkout session through the (injectable) seam (R9.1).
  let created;
  try {
    created = stripeClient.createCheckoutSession({
      runId,
      assetUrl,
      priceId,
      amountTotal: deps.amountTotal,
      currency: deps.currency,
      workspaceId: deps.workspaceId,
      agenticCommerceSessionId: deps.agenticCommerceSessionId,
    });
  } catch (error) {
    return buildOperationFailure(CHECKOUT_FAILURE_SESSION_CREATE, "session_create", {
      stripeCreateCalls: 1,
    });
  }

  const session = created && created.session ? created.session : null;
  const sessionId = session && cleanString(session.id) ? session.id : "";
  // A create that returns no non-empty session id is a failed create (R9.4).
  if (!sessionId) {
    return buildOperationFailure(CHECKOUT_FAILURE_SESSION_CREATE, "session_create", {
      stripeCreateCalls: 1,
      session: null,
    });
  }

  // R9.4: model an injected settlement failure AFTER the session is created —
  // payout must remain in its pre-checkout state.
  if (outcome.settlement && outcome.settlement.failed) {
    return buildOperationFailure(CHECKOUT_FAILURE_SETTLEMENT, "settlement", {
      stripeCreateCalls: 1,
      session,
      sessionId,
    });
  }

  // R9.2: settle the payout and record an observable settlement confirmation.
  let settlement;
  try {
    settlement = payoutClient.settle({
      sessionId,
      runId,
      amountTotal: session.amountTotal,
      currency: session.currency,
    });
  } catch (error) {
    return buildOperationFailure(CHECKOUT_FAILURE_SETTLEMENT, "settlement", {
      stripeCreateCalls: 1,
      session,
      sessionId,
    });
  }

  return {
    status: CHECKOUT_STATUS_COMPLETE,
    gateId: PAYMENT_GATE_ID,
    gateApproved: true,
    // R9.1 contract output: a non-empty session id.
    sessionId,
    session,
    body: created.body || null,
    settlement,
    payoutState: settlement.payoutState,
    sessionCreated: true,
    payoutSettled: Boolean(settlement.settled),
    // 10s deadline metadata (R9.1) — asserted structurally.
    checkoutElapsedMs,
    sessionCreatedWithinDeadline: checkoutElapsedMs <= COMMERCE_CHECKOUT_DEADLINE_MS,
    checkoutDeadlineMs: COMMERCE_CHECKOUT_DEADLINE_MS,
    stripeCreateCalls: 1,
    payoutSettleCalls: 1,
    paidProviderCalls: 1,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Async variants (task 12.4a) — identical semantics to `runPublish` /
// `runCheckout` but `await` the publish / Stripe / payout seams so the LIVE
// async commerce clients (`createStripeCommerceClients`, task 12.4) can be
// consumed. The sync variants above remain the default for the deterministic
// Director / test path. A parity test (`commerce-harness-async.test.mjs`)
// asserts the sync and async variants agree on the same deterministic seams so
// they cannot drift; keep any change to one mirrored in the other.
// ───────────────────────────────────────────────────────────────────────────

/** Async sibling of {@link runPublish}; awaits the publish seam. */
export async function runPublishAsync(input, deps = {}) {
  const { assets } = validatePublishInput(input);
  const runId = cleanString(deps.runId, "video-remix-run");
  const publishClient = deps.publishClient || createDeterministicPublishClient();

  const published = await Promise.all(
    assets.map((asset) => publishClient.publish({ asset, runId })),
  );
  const publishedUrls = published.map((entry) => entry.publishedUrl);

  return {
    status: PUBLISH_STATUS_COMPLETE,
    gateId: PAYMENT_GATE_ID,
    published,
    publishedUrls,
  };
}

/**
 * Async sibling of {@link runCheckout}; awaits the Stripe create + payout settle
 * seams. Same gate rejection (R9.3), same R9.4 post-approval failure semantics,
 * same 10s deadline metadata — awaiting a synchronous mock seam is a no-op, so
 * behavior matches the sync variant exactly.
 */
export async function runCheckoutAsync(input, deps = {}) {
  const { assetUrl, priceId } = validateCheckoutInput(input);
  const runId = cleanString(deps.runId, "video-remix-run");

  const verification = verifyGateToken(input.paymentGateToken, {
    gateId: PAYMENT_GATE_ID,
    now: deps.now,
  });
  if (!verification.valid) {
    return buildGateRejection(verification);
  }

  const stripeClient = deps.stripeClient || createDeterministicStripeClient();
  const payoutClient = deps.payoutClient || createDeterministicPayoutClient();
  const outcome = deps.outcome && typeof deps.outcome === "object" ? deps.outcome : {};

  const checkoutElapsedMs = Number.isFinite(deps.checkoutElapsedMs)
    ? Math.max(0, deps.checkoutElapsedMs)
    : 0;

  if (outcome.sessionCreate && outcome.sessionCreate.failed) {
    return buildOperationFailure(CHECKOUT_FAILURE_SESSION_CREATE, "session_create", {
      stripeCreateCalls: 0,
    });
  }

  let created;
  try {
    created = await stripeClient.createCheckoutSession({
      runId,
      assetUrl,
      priceId,
      amountTotal: deps.amountTotal,
      currency: deps.currency,
      workspaceId: deps.workspaceId,
      agenticCommerceSessionId: deps.agenticCommerceSessionId,
    });
  } catch (error) {
    return buildOperationFailure(CHECKOUT_FAILURE_SESSION_CREATE, "session_create", {
      stripeCreateCalls: 1,
    });
  }

  const session = created && created.session ? created.session : null;
  const sessionId = session && cleanString(session.id) ? session.id : "";
  if (!sessionId) {
    return buildOperationFailure(CHECKOUT_FAILURE_SESSION_CREATE, "session_create", {
      stripeCreateCalls: 1,
      session: null,
    });
  }

  if (outcome.settlement && outcome.settlement.failed) {
    return buildOperationFailure(CHECKOUT_FAILURE_SETTLEMENT, "settlement", {
      stripeCreateCalls: 1,
      session,
      sessionId,
    });
  }

  let settlement;
  try {
    settlement = await payoutClient.settle({
      sessionId,
      runId,
      amountTotal: session.amountTotal,
      currency: session.currency,
    });
  } catch (error) {
    return buildOperationFailure(CHECKOUT_FAILURE_SETTLEMENT, "settlement", {
      stripeCreateCalls: 1,
      session,
      sessionId,
    });
  }

  return {
    status: CHECKOUT_STATUS_COMPLETE,
    gateId: PAYMENT_GATE_ID,
    gateApproved: true,
    sessionId,
    session,
    body: created.body || null,
    settlement,
    payoutState: settlement.payoutState,
    sessionCreated: true,
    payoutSettled: Boolean(settlement.settled),
    checkoutElapsedMs,
    sessionCreatedWithinDeadline: checkoutElapsedMs <= COMMERCE_CHECKOUT_DEADLINE_MS,
    checkoutDeadlineMs: COMMERCE_CHECKOUT_DEADLINE_MS,
    stripeCreateCalls: 1,
    payoutSettleCalls: 1,
    paidProviderCalls: 1,
  };
}
