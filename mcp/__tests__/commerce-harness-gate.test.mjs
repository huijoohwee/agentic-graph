// Unit tests for the Commerce_Harness payment-gate FAILURE + post-approval
// failure paths (agenticgraph-acos-mcp-connector spec, task 3.14 / R9.3, R9.4 /
// Design Property 17, Property 1 — the gated-checkout fail-closed side).
//
// R9.3: IF the `payment-action` Approval_Gate state is any value other than
// `approved`, THEN THE Commerce_Harness SHALL NOT create a Stripe checkout
// session and SHALL NOT settle the payout, and SHALL leave the payout in its
// pre-checkout state.
// R9.4: IF creation of the Stripe checkout session or settlement of the payout
// fails after the gate is approved, THEN settle no payout, return an error
// naming the failed operation, and preserve the payout in its pre-checkout
// state.
//
// Property 17 (negative half): for every gate state OTHER than approved, no
// session is created, no payout is settled, and the payout remains in its
// pre-checkout state.
// Property 1: a paid action executes only with a verified, gate-matched,
// unexpired, unconsumed Approval_Token; a valid Auth_Token never substitutes.
//
// The deterministic injectable seams are wrapped with spies to prove ZERO
// Stripe-create / payout-settle calls occur on rejection (so the local runtime
// makes ZERO live network calls).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runCheckout,
  PAYMENT_GATE_ID,
  PAYOUT_STATE_PRE_CHECKOUT,
  GATE_TOKEN_REASON_ABSENT,
  GATE_TOKEN_REASON_MALFORMED,
  GATE_TOKEN_REASON_GATE_MISMATCH,
  GATE_TOKEN_REASON_INVALID_SIGNATURE,
  GATE_TOKEN_REASON_EXPIRED,
  GATE_TOKEN_REASON_CONSUMED,
  DEFAULT_GATE_TOKEN_TTL_MS,
  createDeterministicStripeClient,
  createDeterministicPayoutClient,
} from "../video-remix-runtime.js";

const NOW = 1_700_000_000_000;
const now = () => NOW;
const ASSET_URL = "r2://strytree-media/strytree/generation/job-1/video.json";

function approvedPaymentToken(overrides = {}) {
  return {
    gateId: PAYMENT_GATE_ID,
    issuedAt: NOW,
    consumed: false,
    verified: true,
    ...overrides,
  };
}

// Build spy seams that record every Stripe-create / payout-settle so a
// rejection can assert ZERO money movement.
function spySeams() {
  const calls = { stripeCreate: 0, payoutSettle: 0 };
  const stripe = createDeterministicStripeClient();
  const payout = createDeterministicPayoutClient();
  return {
    calls,
    stripeClient: {
      ...stripe,
      createCheckoutSession(args) {
        calls.stripeCreate += 1;
        return stripe.createCheckoutSession(args);
      },
    },
    payoutClient: {
      ...payout,
      settle(args) {
        calls.payoutSettle += 1;
        return payout.settle(args);
      },
    },
  };
}

// The full set of non-approved gate states for R9.3 / Property 17 / Property 1.
const GATE_FAILURE_CASES = [
  { name: "missing (undefined)", token: undefined, reason: GATE_TOKEN_REASON_ABSENT },
  { name: "missing (null)", token: null, reason: GATE_TOKEN_REASON_ABSENT },
  { name: "missing (false)", token: false, reason: GATE_TOKEN_REASON_ABSENT },
  { name: "malformed (non-object string)", token: "not-a-token", reason: GATE_TOKEN_REASON_MALFORMED },
  {
    name: "gate-mismatched (wrong gate)",
    token: approvedPaymentToken({ gateId: "render-action" }),
    reason: GATE_TOKEN_REASON_GATE_MISMATCH,
  },
  {
    name: "gate-mismatched (gate omitted)",
    token: approvedPaymentToken({ gateId: undefined }),
    reason: GATE_TOKEN_REASON_GATE_MISMATCH,
  },
  {
    name: "unsigned / unverified (no signature, not verified)",
    token: approvedPaymentToken({ verified: false, signature: "" }),
    reason: GATE_TOKEN_REASON_INVALID_SIGNATURE,
  },
  {
    name: "expired (issued > 15 min ago)",
    token: approvedPaymentToken({ issuedAt: NOW - (DEFAULT_GATE_TOKEN_TTL_MS + 1) }),
    reason: GATE_TOKEN_REASON_EXPIRED,
  },
  {
    name: "expired (issuedAt missing/unparseable)",
    token: approvedPaymentToken({ issuedAt: undefined }),
    reason: GATE_TOKEN_REASON_EXPIRED,
  },
  {
    name: "expired (future-dated issuance fails closed)",
    token: approvedPaymentToken({ issuedAt: NOW + 60_000 }),
    reason: GATE_TOKEN_REASON_EXPIRED,
  },
  {
    name: "consumed (single-use already spent)",
    token: approvedPaymentToken({ consumed: true }),
    reason: GATE_TOKEN_REASON_CONSUMED,
  },
];

for (const { name, token, reason } of GATE_FAILURE_CASES) {
  test(`R9.3/Property 17: a non-approved gate (${name}) creates no session and settles no payout`, () => {
    const seams = spySeams();
    const result = runCheckout(
      { assetUrl: ASSET_URL, priceId: "price_123", paymentGateToken: token },
      { now, runId: `run-reject-${reason}`, stripeClient: seams.stripeClient, payoutClient: seams.payoutClient },
    );

    // Fail-closed rejection envelope.
    assert.equal(result.status, "rejected", "checkout must be rejected");
    assert.equal(result.rejected, true);
    assert.equal(result.gateApproved, false);

    // No money movement of any kind.
    assert.equal(seams.calls.stripeCreate, 0, "no Stripe checkout session may be created");
    assert.equal(seams.calls.payoutSettle, 0, "no payout may be settled");
    assert.equal(result.sessionCreated, false);
    assert.equal(result.payoutSettled, false);
    assert.equal(result.sessionId, null, "no session id");
    assert.equal(result.session, null);
    assert.equal(result.settlement, null);

    // Payout left in its pre-checkout state.
    assert.equal(result.payoutState, PAYOUT_STATE_PRE_CHECKOUT);

    // The error names the failed gate check.
    assert.ok(result.error, "an error indication must be returned");
    assert.equal(result.error.code, "payment_approval_gate_not_approved");
    assert.equal(result.error.reason, reason);
    assert.equal(result.error.gateId, PAYMENT_GATE_ID);
    assert.equal(result.reason, reason);
  });
}

test("Property 1: an Auth_Token-shaped credential never authorizes checkout", () => {
  // An Auth_Token carries subject/entitledRunIds/exp — NOT a payment gateId or
  // a payment Approval_Token signature. Presented as the payment token it must
  // be rejected as gate-mismatched (fail-closed), with zero money movement.
  const authTokenShaped = {
    subject: "session-123",
    entitledRunIds: ["run-reject-auth"],
    issuedAt: NOW,
    expiryWindowSeconds: 3600,
    signature: "hs256-auth-signature",
  };
  const seams = spySeams();
  const result = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: authTokenShaped },
    { now, runId: "run-reject-auth", stripeClient: seams.stripeClient, payoutClient: seams.payoutClient },
  );
  assert.equal(result.status, "rejected");
  assert.equal(result.reason, GATE_TOKEN_REASON_GATE_MISMATCH);
  assert.equal(seams.calls.stripeCreate, 0);
  assert.equal(seams.calls.payoutSettle, 0);
  assert.equal(result.payoutState, PAYOUT_STATE_PRE_CHECKOUT);
});

// ---------------------------------------------------------------------------
// R9.4: post-approval session-create / settlement failure -> no payout
// ---------------------------------------------------------------------------

test("R9.4: a session-create failure after approval settles no payout and preserves pre-checkout state", () => {
  const seams = spySeams();
  const result = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    {
      now,
      runId: "run-create-fail",
      stripeClient: seams.stripeClient,
      payoutClient: seams.payoutClient,
      outcome: { sessionCreate: { failed: true } },
    },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.gateApproved, true);
  assert.equal(result.error.code, "session_create_failed");
  assert.equal(result.error.operation, "session_create");
  assert.equal(result.payoutSettled, false);
  assert.equal(result.payoutState, PAYOUT_STATE_PRE_CHECKOUT);
  assert.equal(seams.calls.payoutSettle, 0, "no payout may settle when session creation fails");
});

test("R9.4: a settlement failure after the session is created preserves the pre-checkout payout state", () => {
  const seams = spySeams();
  const result = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    {
      now,
      runId: "run-settle-fail",
      stripeClient: seams.stripeClient,
      payoutClient: seams.payoutClient,
      outcome: { settlement: { failed: true } },
    },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "settlement_failed");
  assert.equal(result.error.operation, "settlement");
  // The session WAS created, but the payout is NOT settled.
  assert.equal(result.sessionCreated, true);
  assert.ok(result.sessionId, "the created session id is observable");
  assert.equal(result.payoutSettled, false);
  assert.equal(result.payoutState, PAYOUT_STATE_PRE_CHECKOUT);
  assert.equal(seams.calls.stripeCreate, 1);
  assert.equal(seams.calls.payoutSettle, 0, "settlement seam must not succeed");
});

test("a settlement seam that throws is caught and preserves the pre-checkout payout state", () => {
  const stripeClient = createDeterministicStripeClient();
  const payoutClient = {
    ...createDeterministicPayoutClient(),
    settle() {
      throw new Error("network down");
    },
  };
  const result = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-throw", stripeClient, payoutClient },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "settlement_failed");
  assert.equal(result.payoutSettled, false);
  assert.equal(result.payoutState, PAYOUT_STATE_PRE_CHECKOUT);
});
