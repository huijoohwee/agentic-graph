// Unit tests for the Commerce_Harness publish + checkout contracts
// (agentic-graph-acos-mcp-connector spec, task 3.14 / R9.1, R9.2 / Property 17 —
// the publish + gated-checkout side).
//
// R9.1: WHEN the checkout stage runs and the `payment-action` Approval_Gate
// state is `approved`, THE Commerce_Harness SHALL create a Stripe checkout
// session and return a non-empty session identifier within 10 seconds.
// R9.2: WHEN approved and a session exists, settle the payout and record a
// settlement confirmation observable to the caller.
//
// Property 17: For any checkout attempt, a Stripe checkout session is created
// and the payout is settled IFF the `payment-action` Approval_Gate is approved.
//
// These are example-based unit asserts of the publish contract
// `{ assets[] } -> { publishedUrls[] }`, the checkout contract
// `{ assetUrl, priceId, paymentGateToken } -> { sessionId }`, the 10s
// session-create deadline, that the session shape mirrors the reused
// payments.ts / stripeMcpSsot session fields, and that the injectable seams are
// used (so the local runtime makes ZERO live network calls). The consolidated
// property-based test for Property 17 lands in task 9.1.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runPublish,
  runCheckout,
  validatePublishInput,
  validateCheckoutInput,
  CommerceHarnessInputError,
  PAYMENT_GATE_ID,
  COMMERCE_CHECKOUT_DEADLINE_MS,
  STRIPE_SESSION_STATUS_OPEN,
  STRIPE_SESSION_PAYMENT_STATUS_UNPAID,
  STRIPE_CHECKOUT_MODE_PAYMENT,
  PAYOUT_STATE_SETTLED,
  PROVIDER_STRIPE,
  createDeterministicStripeClient,
  createDeterministicPayoutClient,
} from "../video-remix-runtime.js";

const NOW = 1_700_000_000_000;
const now = () => NOW;

// A valid, unexpired, unconsumed, signed `payment-action` Approval_Token. The
// gate is "approved" exactly when such a token is presented (Property 17).
function approvedPaymentToken(overrides = {}) {
  return {
    gateId: PAYMENT_GATE_ID,
    issuedAt: NOW,
    consumed: false,
    verified: true,
    ...overrides,
  };
}

const ASSETS = Object.freeze([
  { shotId: "shot-1", assetUrl: "r2://strytree-media/strytree/generation/job-1/video.json", objectKey: "strytree/generation/job-1/video.json" },
  { shotId: "shot-2", assetUrl: "r2://strytree-media/strytree/generation/job-2/video.json", objectKey: "strytree/generation/job-2/video.json" },
]);

// ---------------------------------------------------------------------------
// publish contract: { assets[] } -> { publishedUrls[] }
// ---------------------------------------------------------------------------

test("validatePublishInput accepts a valid assets[] and normalizes entries", () => {
  const { assets } = validatePublishInput({ assets: ASSETS });
  assert.equal(assets.length, 2);
  assert.equal(assets[0].assetUrl, ASSETS[0].assetUrl);
});

test("validatePublishInput accepts bare-string asset urls", () => {
  const { assets } = validatePublishInput({ assets: ["r2://bucket/a.json", "r2://bucket/b.json"] });
  assert.deepEqual(assets.map((a) => a.assetUrl), ["r2://bucket/a.json", "r2://bucket/b.json"]);
});

test("validatePublishInput rejects a missing/empty assets[], naming the field", () => {
  for (const bad of [undefined, null, [], "assets", {}]) {
    assert.throws(
      () => validatePublishInput({ assets: bad }),
      (err) => err instanceof CommerceHarnessInputError && err.field === "assets",
      `assets=${JSON.stringify(bad)} must be rejected`,
    );
  }
});

test("validatePublishInput rejects an asset without a url, naming the indexed field", () => {
  assert.throws(
    () => validatePublishInput({ assets: [{ shotId: "x" }] }),
    (err) => err instanceof CommerceHarnessInputError && err.field === "assets[0].assetUrl",
  );
});

test("runPublish returns one published URL per asset", () => {
  const result = runPublish({ assets: ASSETS }, { runId: "run-pub" });
  assert.equal(result.status, "complete");
  assert.equal(result.publishedUrls.length, ASSETS.length);
  for (const url of result.publishedUrls) {
    assert.equal(typeof url, "string");
    assert.match(url, /^https:\/\//);
  }
});

// ---------------------------------------------------------------------------
// checkout contract: { assetUrl, priceId, paymentGateToken } -> { sessionId }
// ---------------------------------------------------------------------------

test("validateCheckoutInput requires a non-empty assetUrl", () => {
  assert.throws(
    () => validateCheckoutInput({ priceId: "price_123" }),
    (err) => err instanceof CommerceHarnessInputError && err.field === "assetUrl",
  );
  const { assetUrl, priceId } = validateCheckoutInput({ assetUrl: "r2://b/a.json", priceId: "price_123" });
  assert.equal(assetUrl, "r2://b/a.json");
  assert.equal(priceId, "price_123");
});

test("R9.1/Property 17: an approved gate creates a session and returns a non-empty id within 10s", () => {
  const result = runCheckout(
    { assetUrl: ASSETS[0].assetUrl, priceId: "price_123", paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-checkout" },
  );

  assert.equal(result.status, "complete");
  assert.equal(result.gateId, PAYMENT_GATE_ID);
  assert.equal(result.gateApproved, true);
  // R9.1: non-empty session id.
  assert.equal(typeof result.sessionId, "string");
  assert.ok(result.sessionId.length > 0, "session id must be non-empty");
  assert.equal(result.sessionCreated, true);
  // 10s deadline metadata.
  assert.equal(result.checkoutDeadlineMs, COMMERCE_CHECKOUT_DEADLINE_MS);
  assert.equal(COMMERCE_CHECKOUT_DEADLINE_MS, 10000);
  assert.equal(result.sessionCreatedWithinDeadline, true);
  assert.ok(result.checkoutElapsedMs <= COMMERCE_CHECKOUT_DEADLINE_MS);
});

test("R9.1: an injected slow Stripe call beyond 10s is flagged as past-deadline", () => {
  const result = runCheckout(
    { assetUrl: ASSETS[0].assetUrl, paymentGateToken: approvedPaymentToken() },
    { now, checkoutElapsedMs: COMMERCE_CHECKOUT_DEADLINE_MS + 1 },
  );
  assert.equal(result.status, "complete");
  assert.equal(result.sessionCreatedWithinDeadline, false);
  assert.equal(result.checkoutElapsedMs, COMMERCE_CHECKOUT_DEADLINE_MS + 1);
});

test("R9.2/Property 17: an approved checkout settles the payout with an observable confirmation", () => {
  const result = runCheckout(
    { assetUrl: ASSETS[0].assetUrl, paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-settle" },
  );
  assert.equal(result.payoutSettled, true);
  assert.equal(result.payoutState, PAYOUT_STATE_SETTLED);
  assert.ok(result.settlement, "a settlement confirmation must be observable to the caller");
  assert.equal(result.settlement.settled, true);
  assert.equal(result.settlement.sessionId, result.sessionId);
});

// ---------------------------------------------------------------------------
// Session shape mirrors the reused payments.ts / stripeMcpSsot session fields
// ---------------------------------------------------------------------------

test("the created session mirrors the reused StripeSessionWrite + success body shape", () => {
  const result = runCheckout(
    { assetUrl: ASSETS[0].assetUrl, priceId: "price_123", paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-shape", workspaceId: "ws_1", agenticCommerceSessionId: "acp_abc" },
  );

  const { session } = result;
  // StripeSessionWrite-mirrored fields (payments.ts mapStripeSession).
  for (const field of [
    "id",
    "url",
    "status",
    "paymentStatus",
    "mode",
    "amountTotal",
    "currency",
    "workspaceId",
    "agenticCommerceSessionId",
  ]) {
    assert.ok(field in session, `session must carry the mirrored field '${field}'`);
  }
  assert.equal(session.status, STRIPE_SESSION_STATUS_OPEN);
  assert.equal(session.paymentStatus, STRIPE_SESSION_PAYMENT_STATUS_UNPAID);
  assert.equal(session.mode, STRIPE_CHECKOUT_MODE_PAYMENT);
  assert.equal(session.provider, PROVIDER_STRIPE);
  assert.equal(session.workspaceId, "ws_1");
  assert.equal(session.agenticCommerceSessionId, "acp_abc");
  assert.match(session.url, /^https:\/\/checkout\.stripe\.com\/c\/pay\//);
  // The success body mirrors StripeHostedCheckoutSessionCreateSuccess.body.
  assert.deepEqual(result.body, {
    id: session.id,
    url: session.url,
    status: session.status,
    paymentStatus: session.paymentStatus,
  });
});

// ---------------------------------------------------------------------------
// ZERO live network calls — deterministic injectable seams are used
// ---------------------------------------------------------------------------

test("checkout uses the injectable Stripe + payout seams (live wiring lands in task 9.2)", () => {
  let createCalls = 0;
  let settleCalls = 0;
  const stripeClient = {
    ...createDeterministicStripeClient(),
    createCheckoutSession(args) {
      createCalls += 1;
      return createDeterministicStripeClient().createCheckoutSession(args);
    },
  };
  const payoutClient = {
    ...createDeterministicPayoutClient(),
    settle(args) {
      settleCalls += 1;
      return { settled: true, payoutState: PAYOUT_STATE_SETTLED, sessionId: args.sessionId };
    },
  };

  const result = runCheckout(
    { assetUrl: ASSETS[0].assetUrl, paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-seam", stripeClient, payoutClient },
  );

  assert.equal(createCalls, 1, "the injected Stripe seam must be used exactly once");
  assert.equal(settleCalls, 1, "the injected payout seam must be used exactly once");
  assert.equal(result.status, "complete");
});

test("the deterministic default is reproducible for the same (runId, assetUrl)", () => {
  const input = { assetUrl: ASSETS[0].assetUrl, paymentGateToken: approvedPaymentToken() };
  const a = runCheckout(input, { now, runId: "run-stable" });
  const b = runCheckout(input, { now, runId: "run-stable" });
  assert.equal(a.sessionId, b.sessionId);
  assert.deepEqual(a.session, b.session);
});
