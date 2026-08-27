// Tests for the canonical Approval_Gate REJECTION PATH across the
// Hitl_Gate_Service (agenticgraph-acos-mcp-connector spec, task 4.4 / R4.8 / R11.7 /
// Correctness Property 1).
//
// R11.7: IF a paid action is requested in Live_Mode with an Approval_Token that
// is missing, expired, already consumed, or does not match the requested
// action, THEN THE Hitl_Gate_Service SHALL block execution, leave all
// spend-bearing state unchanged, and return an error indication identifying the
// failed approval check to the caller.
// R4.8: IF the Approval_Token presented before a paid action is absent, invalid,
// or expired, THEN block the paid action, record the rejection reason, preserve
// prior state, and perform zero paid-provider calls.
//
// This suite proves the rejection path is COMPLETE and CONSISTENT: a single
// canonical `buildApprovalRejectionError` names the failed check, the
// `withApprovalGate` guard surfaces that structured error (and keeps the bare
// `reason` for backward compatibility), and the Render_Harness +
// Commerce_Harness rejection envelopes are consistent with it. Each of the five
// rejection classes (missing, invalid/unsigned, expired, consumed, mismatched)
// is asserted to: block execution (no spend fn / no provider dispatch), leave
// spend-bearing state unchanged, and return an error identifying the failed
// approval check (reason + gateId).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildApprovalRejectionError,
  describeApprovalRejection,
  APPROVAL_REJECTION_ERROR_CODE,
  APPROVAL_REJECTION_DESCRIPTIONS,
  withApprovalGate,
  createApprovalTokenIssuer,
  runRenderHarness,
  runCheckout,
  RENDER_GATE_ID,
  PAYMENT_GATE_ID,
  PAYOUT_STATE_PRE_CHECKOUT,
  DEFAULT_GATE_TOKEN_TTL_MS,
  GATE_TOKEN_REASON_ABSENT,
  GATE_TOKEN_REASON_MALFORMED,
  GATE_TOKEN_REASON_GATE_MISMATCH,
  GATE_TOKEN_REASON_INVALID_SIGNATURE,
  GATE_TOKEN_REASON_EXPIRED,
  GATE_TOKEN_REASON_CONSUMED,
  createDeterministicRenderQueueClient,
  createDeterministicMockProviderClient,
  createDeterministicLedgerClient,
  createDeterministicStripeClient,
  createDeterministicPayoutClient,
} from "../video-remix-runtime.js";

const NOW = 1_700_000_000_000;
const now = () => NOW;
const ASSET_URL = "r2://strytree-media/strytree/generation/job-1/video.json";
const SHOTS = Object.freeze([{ shotId: "shot-1", prompt: "open on skyline" }]);

// The FIVE canonical rejection classes (Property 1 / R11.7). Each entry maps a
// human class label to (a) how to perturb a valid render/payment token to hit
// it and (b) the `verifyGateToken` reason code it must surface.
function buildRejectionClasses(gateId) {
  const valid = (overrides = {}) => ({
    gateId,
    issuedAt: NOW,
    consumed: false,
    verified: true,
    ...overrides,
  });
  return [
    { klass: "missing", token: undefined, reason: GATE_TOKEN_REASON_ABSENT },
    {
      klass: "invalid/unsigned",
      token: valid({ verified: false, signature: "" }),
      reason: GATE_TOKEN_REASON_INVALID_SIGNATURE,
    },
    {
      klass: "expired",
      token: valid({ issuedAt: NOW - (DEFAULT_GATE_TOKEN_TTL_MS + 1) }),
      reason: GATE_TOKEN_REASON_EXPIRED,
    },
    {
      klass: "consumed",
      token: valid({ consumed: true }),
      reason: GATE_TOKEN_REASON_CONSUMED,
    },
    {
      klass: "mismatched",
      token: valid({ gateId: "some-other-gate" }),
      reason: GATE_TOKEN_REASON_GATE_MISMATCH,
    },
  ];
}

// ---------------------------------------------------------------------------
// Canonical builder: names the failed check for every reason, one shape
// ---------------------------------------------------------------------------

test("buildApprovalRejectionError names the failed check (reason + gateId + message)", () => {
  const error = buildApprovalRejectionError({ reason: GATE_TOKEN_REASON_EXPIRED, gateId: RENDER_GATE_ID });
  assert.equal(error.code, APPROVAL_REJECTION_ERROR_CODE);
  assert.equal(error.gateId, RENDER_GATE_ID);
  assert.equal(error.reason, GATE_TOKEN_REASON_EXPIRED);
  assert.equal(error.reasonDescription, APPROVAL_REJECTION_DESCRIPTIONS[GATE_TOKEN_REASON_EXPIRED]);
  assert.match(error.message, new RegExp(GATE_TOKEN_REASON_EXPIRED));
  assert.match(error.message, new RegExp(RENDER_GATE_ID));
});

test("every reason code has a stable human description", () => {
  for (const reason of [
    GATE_TOKEN_REASON_ABSENT,
    GATE_TOKEN_REASON_MALFORMED,
    GATE_TOKEN_REASON_GATE_MISMATCH,
    GATE_TOKEN_REASON_INVALID_SIGNATURE,
    GATE_TOKEN_REASON_EXPIRED,
    GATE_TOKEN_REASON_CONSUMED,
  ]) {
    const description = describeApprovalRejection(reason);
    assert.equal(typeof description, "string");
    assert.ok(description.length > 0, `reason '${reason}' must have a description`);
    assert.equal(description, APPROVAL_REJECTION_DESCRIPTIONS[reason]);
  }
});

test("buildApprovalRejectionError supports a domain code override + optional operation", () => {
  const error = buildApprovalRejectionError(
    { reason: GATE_TOKEN_REASON_CONSUMED, gateId: PAYMENT_GATE_ID },
    { code: "payment_approval_gate_not_approved", operation: "checkout" },
  );
  assert.equal(error.code, "payment_approval_gate_not_approved");
  assert.equal(error.operation, "checkout");
  assert.equal(error.reason, GATE_TOKEN_REASON_CONSUMED);
});

// ---------------------------------------------------------------------------
// withApprovalGate: each rejection class blocks execution + structured error
// ---------------------------------------------------------------------------

for (const { klass, token, reason } of buildRejectionClasses(RENDER_GATE_ID)) {
  test(`withApprovalGate(${klass}) blocks the spend and returns a structured error naming the failed check`, async () => {
    let spendCalls = 0;
    const outcome = await withApprovalGate(
      RENDER_GATE_ID,
      token,
      () => {
        spendCalls += 1;
        return { dispatched: true };
      },
      { now: NOW },
    );

    // Blocks execution: spendFn never runs, spend-bearing state unchanged.
    assert.equal(outcome.permitted, false, `${klass} must not permit the paid action`);
    assert.equal(spendCalls, 0, `${klass} must not invoke the spend-bearing function`);
    assert.equal(outcome.result, null);

    // Bare reason retained for backward compatibility.
    assert.equal(outcome.reason, reason);

    // Structured error identifies the failed approval check (reason + gateId).
    assert.ok(outcome.error, "a structured error must be surfaced on rejection");
    assert.equal(outcome.error.code, APPROVAL_REJECTION_ERROR_CODE);
    assert.equal(outcome.error.reason, reason);
    assert.equal(outcome.error.gateId, RENDER_GATE_ID);
    assert.match(outcome.error.message, new RegExp(reason));
  });
}

test("withApprovalGate: a valid token still permits the spend (gate blocks only on failure)", async () => {
  const issuer = createApprovalTokenIssuer({ now: NOW });
  const token = issuer.issue(RENDER_GATE_ID);
  let spendCalls = 0;
  const outcome = await withApprovalGate(RENDER_GATE_ID, token, () => {
    spendCalls += 1;
    return "ok";
  }, { now: NOW });
  assert.equal(outcome.permitted, true);
  assert.equal(outcome.error, undefined, "no error object on a permitted action");
  assert.equal(spendCalls, 1);
});

// ---------------------------------------------------------------------------
// Render_Harness: each rejection class blocks dispatch + unchanged state
// ---------------------------------------------------------------------------

function renderSpySeams() {
  const calls = { queueDispatch: 0, mockDispatch: 0, ledgerRecord: 0 };
  const queue = createDeterministicRenderQueueClient();
  const mock = createDeterministicMockProviderClient();
  const ledger = createDeterministicLedgerClient();
  return {
    calls,
    queueClient: { ...queue, dispatch: (a) => (calls.queueDispatch++, queue.dispatch(a)) },
    mockClient: { ...mock, dispatch: (a) => (calls.mockDispatch++, mock.dispatch(a)) },
    ledgerClient: { ...ledger, record: (a) => (calls.ledgerRecord++, ledger.record(a)) },
  };
}

for (const { klass, token, reason } of buildRejectionClasses(RENDER_GATE_ID)) {
  test(`Render_Harness(${klass}) blocks dispatch, leaves spend state unchanged, names the failed check`, () => {
    const seams = renderSpySeams();
    const result = runRenderHarness(
      { shots: SHOTS, renderGateToken: token },
      {
        now,
        runId: `run-render-${reason}`,
        providerKeyAvailable: true, // tempt a regression toward a paid dispatch
        queueClient: seams.queueClient,
        mockClient: seams.mockClient,
        ledgerClient: seams.ledgerClient,
      },
    );

    // Execution blocked.
    assert.equal(result.status, "rejected");
    assert.equal(result.dispatched, false);
    assert.equal(seams.calls.queueDispatch, 0);
    assert.equal(seams.calls.mockDispatch, 0);

    // Spend-bearing state unchanged: zero spend, no ledger events, no assets.
    assert.equal(result.providerSpendCents, 0);
    assert.equal(result.paidProviderCalls, 0);
    assert.equal(seams.calls.ledgerRecord, 0);
    assert.deepEqual(result.ledgerEvents, []);
    assert.deepEqual(result.assets, []);

    // Error names the failed approval check, consistent with the canonical shape.
    assert.equal(result.error.code, "render_approval_token_failed");
    assert.equal(result.error.reason, reason);
    assert.equal(result.error.gateId, RENDER_GATE_ID);
    assert.equal(result.error.reasonDescription, describeApprovalRejection(reason));
    assert.match(result.error.message, new RegExp(reason));
  });
}

// ---------------------------------------------------------------------------
// Commerce_Harness checkout: each rejection class blocks money movement
// ---------------------------------------------------------------------------

function commerceSpySeams() {
  const calls = { stripeCreate: 0, payoutSettle: 0 };
  const stripe = createDeterministicStripeClient();
  const payout = createDeterministicPayoutClient();
  return {
    calls,
    stripeClient: {
      ...stripe,
      createCheckoutSession: (a) => (calls.stripeCreate++, stripe.createCheckoutSession(a)),
    },
    payoutClient: { ...payout, settle: (a) => (calls.payoutSettle++, payout.settle(a)) },
  };
}

for (const { klass, token, reason } of buildRejectionClasses(PAYMENT_GATE_ID)) {
  test(`Commerce checkout(${klass}) creates no session/payout, leaves payout pre-checkout, names the failed check`, () => {
    const seams = commerceSpySeams();
    const result = runCheckout(
      { assetUrl: ASSET_URL, priceId: "price_123", paymentGateToken: token },
      { now, runId: `run-checkout-${reason}`, stripeClient: seams.stripeClient, payoutClient: seams.payoutClient },
    );

    // Execution blocked.
    assert.equal(result.status, "rejected");
    assert.equal(result.gateApproved, false);
    assert.equal(seams.calls.stripeCreate, 0);
    assert.equal(seams.calls.payoutSettle, 0);

    // Spend-bearing state unchanged: no session, no settlement, pre-checkout payout.
    assert.equal(result.sessionId, null);
    assert.equal(result.session, null);
    assert.equal(result.settlement, null);
    assert.equal(result.payoutSettled, false);
    assert.equal(result.payoutState, PAYOUT_STATE_PRE_CHECKOUT);

    // Error names the failed approval check, consistent with the canonical shape.
    assert.equal(result.error.code, "payment_approval_gate_not_approved");
    assert.equal(result.error.reason, reason);
    assert.equal(result.error.gateId, PAYMENT_GATE_ID);
    assert.equal(result.error.reasonDescription, describeApprovalRejection(reason));
  });
}

// ---------------------------------------------------------------------------
// Cross-boundary consistency: the same reason yields the same canonical
// description everywhere a rejection is surfaced.
// ---------------------------------------------------------------------------

test("the failed-check description is identical across guard, render, and commerce rejections", async () => {
  const reason = GATE_TOKEN_REASON_CONSUMED;

  const guard = await withApprovalGate(
    RENDER_GATE_ID,
    { gateId: RENDER_GATE_ID, issuedAt: NOW, consumed: true, verified: true },
    () => "spend",
    { now: NOW },
  );

  const render = runRenderHarness(
    { shots: SHOTS, renderGateToken: { gateId: RENDER_GATE_ID, issuedAt: NOW, consumed: true, verified: true } },
    { now, runId: "run-consistency" },
  );

  const checkout = runCheckout(
    { assetUrl: ASSET_URL, paymentGateToken: { gateId: PAYMENT_GATE_ID, issuedAt: NOW, consumed: true, verified: true } },
    { now, runId: "run-consistency" },
  );

  const expected = describeApprovalRejection(reason);
  assert.equal(guard.error.reason, reason);
  assert.equal(guard.error.reasonDescription, expected);
  assert.equal(render.error.reason, reason);
  assert.equal(render.error.reasonDescription, expected);
  assert.equal(checkout.error.reason, reason);
  assert.equal(checkout.error.reasonDescription, expected);
});
