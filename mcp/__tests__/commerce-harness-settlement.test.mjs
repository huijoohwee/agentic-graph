// Focused unit tests for the Commerce_Harness SETTLEMENT-specific invariants
// (agenticgraph-acos-mcp-connector spec, task 3.15 / R9.2, R9.3 / Design
// Property 17).
//
// These tests narrow in on the *settlement* half of the gated-checkout
// contract, complementing commerce-harness.test.mjs (R9.1 session-create) and
// commerce-harness-gate.test.mjs (R9.3 fail-closed gate-state matrix + R9.4
// post-approval failures). The invariants under test:
//
//   (1) Settle the payout ONLY when BOTH the `payment-action` gate is approved
//       AND a Stripe checkout session exists — the settlement seam is invoked
//       strictly after a non-empty session id is produced, and never before
//       (R9.2 precondition / Property 17 "iff" forward direction).
//   (2) The settlement confirmation is OBSERVABLE to the caller and is LINKED
//       to the created session (sessionId / amount / currency carried through),
//       with the payout moved to its settled state (R9.2).
//   (3) For any gate state OTHER than approved, no payout is settled and the
//       payout is left UNCHANGED in its pre-checkout state (R9.3 / Property 17
//       negative direction).
//
// Every Stripe-create / payout-settle is routed through ordered spy seams so
// the precondition ordering (session-before-settlement) is observable and the
// local runtime makes ZERO live network calls.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runCheckout,
  PAYMENT_GATE_ID,
  PAYOUT_STATE_PRE_CHECKOUT,
  PAYOUT_STATE_SETTLED,
  GATE_TOKEN_REASON_ABSENT,
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

// A valid, unexpired, unconsumed, signed `payment-action` Approval_Token — the
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

// Build spy seams that record an ORDERED call log so we can prove a session is
// created strictly BEFORE the payout is settled (and that neither fires on a
// rejected gate).
function orderedSpySeams() {
  const order = [];
  const stripe = createDeterministicStripeClient();
  const payout = createDeterministicPayoutClient();
  return {
    order,
    stripeClient: {
      ...stripe,
      createCheckoutSession(args) {
        order.push("create");
        return stripe.createCheckoutSession(args);
      },
    },
    payoutClient: {
      ...payout,
      settle(args) {
        order.push("settle");
        return payout.settle(args);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (1) Settle ONLY when approved AND a session exists (ordering precondition)
// ---------------------------------------------------------------------------

test("R9.2: settlement runs strictly AFTER a session is created (approved + session exists)", () => {
  const seams = orderedSpySeams();
  const result = runCheckout(
    { assetUrl: ASSET_URL, priceId: "price_123", paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-order", stripeClient: seams.stripeClient, payoutClient: seams.payoutClient },
  );

  assert.equal(result.status, "complete");
  assert.equal(result.gateApproved, true);
  assert.equal(result.sessionCreated, true);
  assert.equal(result.payoutSettled, true);
  // The session MUST exist before the payout settles: create precedes settle,
  // each happens exactly once.
  assert.deepEqual(seams.order, ["create", "settle"]);
});

test("R9.2: settlement is keyed to the SAME session id the checkout created", () => {
  const result = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-link" },
  );
  assert.ok(result.sessionId && result.sessionId.length > 0, "a session id must exist");
  // The settlement seam is called with the created session's id (precondition:
  // a session must exist to be settled).
  assert.equal(result.settlement.sessionId, result.sessionId);
});

test("R9.2: when session creation yields no id, the payout never settles", () => {
  // A Stripe seam that returns an empty session id models "no session exists".
  // Settlement must not run and the payout stays pre-checkout.
  let settleCalls = 0;
  const stripeClient = {
    ...createDeterministicStripeClient(),
    createCheckoutSession() {
      return { session: { id: "" }, body: null };
    },
  };
  const payoutClient = {
    ...createDeterministicPayoutClient(),
    settle(args) {
      settleCalls += 1;
      return createDeterministicPayoutClient().settle(args);
    },
  };
  const result = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-no-session", stripeClient, payoutClient },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.sessionCreated, false);
  assert.equal(result.payoutSettled, false);
  assert.equal(result.payoutState, PAYOUT_STATE_PRE_CHECKOUT);
  assert.equal(settleCalls, 0, "settlement must not run without an existing session");
});

// ---------------------------------------------------------------------------
// (2) Observable settlement confirmation linked to the session (R9.2)
// ---------------------------------------------------------------------------

test("R9.2/Property 17: an approved checkout records an observable settlement confirmation", () => {
  const result = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-confirm", amountTotal: 4200, currency: "usd" },
  );

  // The payout is moved to its settled state and the confirmation is observable.
  assert.equal(result.payoutSettled, true);
  assert.equal(result.payoutState, PAYOUT_STATE_SETTLED);
  assert.ok(result.settlement, "the caller must observe a settlement confirmation");
  assert.equal(result.settlement.settled, true);
  assert.equal(result.settlement.payoutState, PAYOUT_STATE_SETTLED);
  // Confirmation linkage: session id, amount, and currency tie back to the
  // created session.
  assert.equal(result.settlement.sessionId, result.sessionId);
  assert.equal(result.settlement.amountTotal, result.session.amountTotal);
  assert.equal(result.settlement.currency, result.session.currency);
  assert.equal(result.settlement.amountTotal, 4200);
});

test("R9.2: the settlement confirmation is recorded in the payout seam ledger", () => {
  const payoutClient = createDeterministicPayoutClient();
  const result = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-ledger", payoutClient },
  );
  assert.equal(result.payoutSettled, true);
  // The injectable payout seam keeps an observable in-memory record of every
  // settlement; exactly one confirmation matching the session was recorded.
  assert.equal(payoutClient.settlements.length, 1);
  assert.equal(payoutClient.settlements[0].sessionId, result.sessionId);
  assert.equal(payoutClient.settlements[0].payoutState, PAYOUT_STATE_SETTLED);
});

// ---------------------------------------------------------------------------
// (3) Non-approved gate → no settlement, payout unchanged (R9.3 / Property 17)
// ---------------------------------------------------------------------------

// One representative case per non-approved gate-state class, asserted from the
// SETTLEMENT angle: zero settle calls, payout left in pre-checkout state.
const NON_APPROVED_CASES = [
  { name: "absent token", token: undefined, reason: GATE_TOKEN_REASON_ABSENT },
  {
    name: "gate-mismatched token",
    token: approvedPaymentToken({ gateId: "render-action" }),
    reason: GATE_TOKEN_REASON_GATE_MISMATCH,
  },
  {
    name: "unsigned token",
    token: approvedPaymentToken({ verified: false, signature: "" }),
    reason: GATE_TOKEN_REASON_INVALID_SIGNATURE,
  },
  {
    name: "expired token",
    token: approvedPaymentToken({ issuedAt: NOW - (DEFAULT_GATE_TOKEN_TTL_MS + 1) }),
    reason: GATE_TOKEN_REASON_EXPIRED,
  },
  {
    name: "consumed token",
    token: approvedPaymentToken({ consumed: true }),
    reason: GATE_TOKEN_REASON_CONSUMED,
  },
];

for (const { name, token, reason } of NON_APPROVED_CASES) {
  test(`R9.3/Property 17: a non-approved gate (${name}) settles no payout and leaves it unchanged`, () => {
    const seams = orderedSpySeams();
    const result = runCheckout(
      { assetUrl: ASSET_URL, paymentGateToken: token },
      { now, runId: `run-unchanged-${reason}`, stripeClient: seams.stripeClient, payoutClient: seams.payoutClient },
    );

    assert.equal(result.status, "rejected");
    assert.equal(result.gateApproved, false);
    // No settlement of any kind — neither seam fired.
    assert.deepEqual(seams.order, [], "neither create nor settle may run on a rejected gate");
    assert.equal(result.payoutSettled, false);
    assert.equal(result.settlement, null, "no settlement confirmation is produced");
    // Payout is left UNCHANGED in its pre-checkout state.
    assert.equal(result.payoutState, PAYOUT_STATE_PRE_CHECKOUT);
    assert.equal(result.reason, reason);
  });
}

test("R9.3: the pre-checkout payout state is the SAME value regardless of which non-approved reason fired", () => {
  const states = NON_APPROVED_CASES.map(({ token }) =>
    runCheckout(
      { assetUrl: ASSET_URL, paymentGateToken: token },
      { now, runId: "run-invariant" },
    ).payoutState,
  );
  // Every non-approved path leaves the identical unchanged pre-checkout state.
  assert.deepEqual(new Set(states), new Set([PAYOUT_STATE_PRE_CHECKOUT]));
});
