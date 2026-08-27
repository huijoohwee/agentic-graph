// Focused unit tests for the Commerce_Harness post-approval SESSION-CREATE
// failure path (agenticgraph-acos-mcp-connector spec, task 3.16 / R9.4 / Design
// Property 17).
//
// R9.4: IF creation of the Stripe checkout session OR settlement of the payout
// FAILS after the `payment-action` Approval_Gate is approved, THEN the
// Commerce_Harness SHALL NOT settle the payout, SHALL return an error
// indication identifying the FAILED OPERATION, and SHALL preserve the payout in
// its pre-checkout state.
//
// commerce-harness-gate.test.mjs already exercises R9.4 for: a session-create
// failure signalled by the injectable `outcome.sessionCreate.failed` flag, a
// settlement failure signalled by `outcome.settlement.failed`, and a
// settlement seam that THROWS. The one R9.4 seam left uncovered is a
// session-create seam that THROWS (a live Stripe create raising mid-call) — and
// the symmetric case where the create seam returns a malformed envelope. This
// file narrows in on exactly those, so the post-approval failure surface is
// fully covered from BOTH the returned-failure-flag AND the thrown-seam angles
// for session-create, with ZERO live network calls (deterministic seams only).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runCheckout,
  PAYMENT_GATE_ID,
  PAYOUT_STATE_PRE_CHECKOUT,
  createDeterministicStripeClient,
  createDeterministicPayoutClient,
} from "../video-remix-runtime.js";

const NOW = 1_700_000_000_000;
const now = () => NOW;
const ASSET_URL = "r2://strytree-media/strytree/generation/job-1/video.json";

// A valid, unexpired, unconsumed, signed `payment-action` Approval_Token — so
// the gate IS approved and we are genuinely on the post-approval failure path.
function approvedPaymentToken(overrides = {}) {
  return {
    gateId: PAYMENT_GATE_ID,
    issuedAt: NOW,
    consumed: false,
    verified: true,
    ...overrides,
  };
}

// Spy seams that count every Stripe-create / payout-settle so we can prove the
// payout never settles once the session create fails.
function spySeams(overrides = {}) {
  const calls = { stripeCreate: 0, payoutSettle: 0 };
  const stripe = createDeterministicStripeClient();
  const payout = createDeterministicPayoutClient();
  return {
    calls,
    stripeClient: {
      ...stripe,
      createCheckoutSession(args) {
        calls.stripeCreate += 1;
        if (overrides.createImpl) return overrides.createImpl(args);
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

// Common post-approval session-create failure assertions (R9.4): failed status,
// the gate was approved, the error names the session_create operation, no
// payout settled, payout preserved in its pre-checkout state, and the
// settlement seam never fired.
function assertSessionCreateFailure(result, seams) {
  assert.equal(result.status, "failed", "checkout must report a failed status");
  assert.equal(result.gateApproved, true, "the gate WAS approved (post-approval path)");
  assert.ok(result.error, "an error indication must be returned");
  assert.equal(result.error.code, "session_create_failed");
  assert.equal(result.error.operation, "session_create", "the error must NAME the failed operation");
  assert.equal(result.error.gateId, PAYMENT_GATE_ID);
  assert.equal(result.reason, "session_create_failed");
  // No payout is settled and it is preserved in its pre-checkout state.
  assert.equal(result.payoutSettled, false);
  assert.equal(result.settlement, null);
  assert.equal(result.payoutState, PAYOUT_STATE_PRE_CHECKOUT);
  assert.equal(seams.calls.payoutSettle, 0, "the settlement seam must never fire");
}

// ---------------------------------------------------------------------------
// (1) Thrown session-create seam (the previously-uncovered R9.4 angle)
// ---------------------------------------------------------------------------

test("R9.4: a session-create seam that THROWS after approval settles no payout and preserves pre-checkout state", () => {
  const seams = spySeams({
    createImpl() {
      throw new Error("stripe create network down");
    },
  });
  const result = runCheckout(
    { assetUrl: ASSET_URL, priceId: "price_123", paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-create-throw", stripeClient: seams.stripeClient, payoutClient: seams.payoutClient },
  );

  assertSessionCreateFailure(result, seams);
  // The create seam WAS attempted exactly once before it threw.
  assert.equal(seams.calls.stripeCreate, 1);
  assert.equal(result.sessionCreated, false, "no session exists when create throws");
  assert.equal(result.sessionId, null);
});

// ---------------------------------------------------------------------------
// (2) Returned-failure-flag parity (the injectable outcome flag)
// ---------------------------------------------------------------------------

test("R9.4: a session-create failure signalled by the outcome flag never invokes the Stripe seam", () => {
  const seams = spySeams();
  const result = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    {
      now,
      runId: "run-create-flag",
      stripeClient: seams.stripeClient,
      payoutClient: seams.payoutClient,
      outcome: { sessionCreate: { failed: true } },
    },
  );

  assertSessionCreateFailure(result, seams);
  // The flag short-circuits BEFORE the seam is touched: zero create calls.
  assert.equal(seams.calls.stripeCreate, 0, "the flag fails closed before dispatching the create seam");
  assert.equal(result.sessionCreated, false);
});

// ---------------------------------------------------------------------------
// (3) A create seam that returns a malformed (empty-id) envelope
// ---------------------------------------------------------------------------

test("R9.4: a create seam returning an empty session id is treated as a failed create with no payout", () => {
  const seams = spySeams({
    createImpl() {
      // A create that resolves but yields no usable session id is a failed
      // create — money must not move.
      return { session: { id: "   " }, body: null };
    },
  });
  const result = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-create-empty", stripeClient: seams.stripeClient, payoutClient: seams.payoutClient },
  );

  assertSessionCreateFailure(result, seams);
  assert.equal(seams.calls.stripeCreate, 1, "the create seam was invoked once");
  assert.equal(result.sessionCreated, false);
});

// ---------------------------------------------------------------------------
// (4) The pre-checkout payout state is identical across every R9.4 create-fail
// ---------------------------------------------------------------------------

test("R9.4: every session-create failure mode leaves the SAME unchanged pre-checkout payout state", () => {
  const thrown = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    {
      now,
      runId: "run-parity-throw",
      stripeClient: {
        ...createDeterministicStripeClient(),
        createCheckoutSession() {
          throw new Error("boom");
        },
      },
    },
  );
  const flagged = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-parity-flag", outcome: { sessionCreate: { failed: true } } },
  );
  const emptyId = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    {
      now,
      runId: "run-parity-empty",
      stripeClient: {
        ...createDeterministicStripeClient(),
        createCheckoutSession() {
          return { session: { id: "" }, body: null };
        },
      },
    },
  );

  const states = [thrown, flagged, emptyId].map((r) => r.payoutState);
  assert.deepEqual(new Set(states), new Set([PAYOUT_STATE_PRE_CHECKOUT]));
  // All three are failed checkouts that name the session_create operation.
  for (const r of [thrown, flagged, emptyId]) {
    assert.equal(r.status, "failed");
    assert.equal(r.error.operation, "session_create");
    assert.equal(r.payoutSettled, false);
  }
});
