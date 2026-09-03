// =============================================================================
// Property-based tests — commerce + cost/ledger accounting logic
// (spec task 9.1). Properties 17, 18, 20, 21. fast-check, >=100 runs each,
// external deps mocked via the runtime's deterministic injectable seams
// (Stripe / payout / webhook verifier) — ZERO live network calls.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  // commerce checkout gate (Property 17)
  runCheckout,
  PAYMENT_GATE_ID,
  PAYOUT_STATE_PRE_CHECKOUT,
  createDeterministicStripeClient,
  createDeterministicPayoutClient,
  // webhook reconciliation (Property 18)
  reconcileStripeWebhook,
  webhookReconciliationHolds,
  WEBHOOK_MISMATCH_REASON_UNKNOWN_SESSION,
  // cost-log aggregation (Property 20)
  buildCostLogAccounting,
  costLogAggregationHolds,
  MODEL_BEARING_STAGE_IDS,
  // reconciliation (Property 21)
  buildLedgerReconciliation,
  ledgerReconciliationHolds,
  RECONCILIATION_TOLERANCE_CENTS,
} from "../video-remix-runtime.js";
import { NOW_MS, GATE_TTL_MS, wordArb, ledgerReconciliationCaseArb } from "./arbitraries.mjs";

const RUNS = 200;
const now = () => NOW_MS;
const ASSET_URL = "r2://strytree-media/strytree/generation/job-1/video.json";

function paymentToken(overrides = {}) {
  return { gateId: PAYMENT_GATE_ID, issuedAt: NOW_MS, consumed: false, verified: true, ...overrides };
}

function spySeams() {
  const calls = { stripeCreate: 0, payoutSettle: 0 };
  const stripe = createDeterministicStripeClient();
  const payout = createDeterministicPayoutClient();
  return {
    calls,
    stripeClient: { ...stripe, createCheckoutSession(a) { calls.stripeCreate += 1; return stripe.createCheckoutSession(a); } },
    payoutClient: { ...payout, settle(a) { calls.payoutSettle += 1; return payout.settle(a); } },
  };
}

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 17: For any checkout attempt, a Stripe checkout session is created and the payout is settled (with a settlement confirmation observable to the caller) iff the payment-action Approval_Gate state is approved; for every other gate state no session is created, no payout is settled, and the payout remains in its pre-checkout state.
// -----------------------------------------------------------------------------
test("Property 17: payment gate governs all money movement", () => {
  // The payment token state matrix: only a verified, gate-matched, unexpired,
  // unconsumed token is "approved".
  const tokenArb = fc.oneof(
    fc.integer({ min: 0, max: GATE_TTL_MS }).map((age) => ({ token: paymentToken({ issuedAt: NOW_MS - age }), valid: true })),
    fc.constantFrom(null, undefined, false, "nope", 7).map((token) => ({ token, valid: false })),
    fc.constant({ token: paymentToken({ gateId: "render-action" }), valid: false }),
    fc.constant({ token: paymentToken({ consumed: true }), valid: false }),
    fc.constant({ token: paymentToken({ verified: false, signature: "" }), valid: false }),
    fc.integer({ min: GATE_TTL_MS + 1, max: GATE_TTL_MS + 1_000_000 }).map((age) => ({ token: paymentToken({ issuedAt: NOW_MS - age }), valid: false })),
  );
  fc.assert(
    fc.property(tokenArb, wordArb, ({ token, valid }, runId) => {
      const seams = spySeams();
      const result = runCheckout(
        { assetUrl: ASSET_URL, priceId: "price_123", paymentGateToken: token },
        { now, runId: `p17-${runId}`, stripeClient: seams.stripeClient, payoutClient: seams.payoutClient },
      );
      if (valid) {
        assert.equal(result.gateApproved, true);
        assert.equal(result.sessionCreated, true);
        assert.equal(result.payoutSettled, true);
        assert.ok(result.sessionId, "non-empty session id");
        assert.equal(seams.calls.stripeCreate, 1);
        assert.equal(seams.calls.payoutSettle, 1);
      } else {
        assert.equal(result.gateApproved, false);
        assert.equal(result.sessionCreated, false);
        assert.equal(result.payoutSettled, false);
        assert.equal(result.payoutState, PAYOUT_STATE_PRE_CHECKOUT);
        assert.equal(seams.calls.stripeCreate, 0);
        assert.equal(seams.calls.payoutSettle, 0);
      }
    }),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 18: For any Stripe checkout webhook that does not match a verified session, the Commerce_Harness withholds the payout, leaves the payout amount unchanged, and appends a reconciliation flag identifying the affected run.
// -----------------------------------------------------------------------------
test("Property 18: Stripe webhook mismatch withholds payout", () => {
  const nowSeconds = Math.floor(NOW_MS / 1000);
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.integer({ min: 0, max: 100000 }),
      wordArb,
      fc.array(wordArb, { maxLength: 3 }),
      (matches, payoutAmountCents, runId, priorFlags) => {
        const verifiedSession = { id: `cs_${runId}`, amountTotal: 1999, currency: "usd", expectedSignature: "sig_ok" };
        const object = matches
          ? { id: `cs_${runId}`, amount_total: 1999, currency: "usd", signature: "sig_ok", signatureTimestamp: nowSeconds }
          : { id: "cs_UNKNOWN", amount_total: 1999, currency: "usd", signature: "sig_ok", signatureTimestamp: nowSeconds };
        const event = { type: "checkout.session.completed", data: { object } };
        const result = reconcileStripeWebhook(
          { event, verifiedSessions: [verifiedSession], runId: `p18-${runId}`, payoutAmountCents, reconciliationFlags: [...priorFlags] },
          { now },
        );
        if (matches) {
          assert.equal(result.matched, true);
          assert.equal(result.settlementAllowed, true);
          assert.equal(result.flagAppended, false);
        } else {
          assert.equal(result.matched, false);
          assert.equal(result.payoutWithheld, true);
          assert.equal(result.reason, WEBHOOK_MISMATCH_REASON_UNKNOWN_SESSION);
          // Amount unchanged; exactly one reconciliation flag appended, run id named.
          assert.equal(result.payoutAmountCents, payoutAmountCents);
          assert.equal(result.flagAppended, true);
          assert.equal(result.reconciliationFlags.length, priorFlags.length + 1);
          assert.ok(result.reconciliationFlag.includes(`run=p18-${runId}`));
        }
        assert.equal(webhookReconciliationHolds(result, priorFlags.length), true);
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 20: For any set of emitted Cost_Logs in a run, the Director aggregates them into Budget_Meters such that the aggregated estimated/actual costs equal the sums of the corresponding Cost_Log fields, and each model-bearing stage has exactly one Cost_Log entry carrying its stage id, estimated cost, and actual cost.
// -----------------------------------------------------------------------------
test("Property 20: Cost_Log aggregation correctness and one entry per model-bearing stage", () => {
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: 100000, noNaN: true, noDefaultInfinity: true }).map((n) => Number(n.toFixed(2))),
      fc.double({ min: 0, max: 100000, noNaN: true, noDefaultInfinity: true }).map((n) => Number(n.toFixed(2))),
      (plannedEstimateUsd, modelActualCostUsd) => {
        const accounting = buildCostLogAccounting({ plannedEstimateUsd, modelActualCostUsd });
        // Exactly one Cost_Log per model-bearing stage, each carrying the three fields.
        assert.equal(accounting.costLogs.length, MODEL_BEARING_STAGE_IDS.length);
        const seenStages = new Set();
        for (const entry of accounting.costLogs) {
          assert.ok(MODEL_BEARING_STAGE_IDS.includes(entry.stageId));
          assert.equal(seenStages.has(entry.stageId), false);
          seenStages.add(entry.stageId);
          assert.equal(typeof entry.estimatedCostUsd, "number");
          assert.equal(typeof entry.actualCostUsd, "number");
        }
        // Aggregate equals the sum of the per-entry fields (cents-exact).
        const sumEstimated = accounting.costLogs.reduce((t, e) => t + Math.round(e.estimatedCostUsd * 100), 0);
        const sumActual = accounting.costLogs.reduce((t, e) => t + Math.round(e.actualCostUsd * 100), 0);
        assert.equal(Math.round(accounting.aggregate.estimatedCostUsd * 100), sumEstimated);
        assert.equal(Math.round(accounting.aggregate.actualCostUsd * 100), sumActual);
        assert.equal(accounting.aggregationOk, true);
        assert.equal(costLogAggregationHolds(accounting.costLogs, accounting.aggregate), true);
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 21: For any run, either the sum of recorded Credit_Ledger events equals the total provider spend reported in Budget_Meters within +/-0.01 USD, or -- when the deviation exceeds +/-0.01 USD -- the Director flags a reconciliation discrepancy and preserves both the Credit_Ledger events and the Budget_Meters values without modification.
// -----------------------------------------------------------------------------
test("Property 21: credit-ledger consistency or reconciliation flag", () => {
  // Meters provider-spend is derived from the ledger sum offset by a deviation
  // focused on the +/-0.01 (== +/-1 cent) boundary, so the consistency threshold
  // is straddled deterministically via the shared generator (spec task 9.4).
  fc.assert(
    fc.property(ledgerReconciliationCaseArb, ({ assets, metersProviderSpendCents, runId }) => {
      const result = buildLedgerReconciliation({
        assets,
        simulatedMetersProviderSpendCents: metersProviderSpendCents,
        runId: `p21-${runId}`,
      });
      const ledgerSum = assets
        .filter((a) => a.ledgerEventId)
        .reduce((t, a) => t + a.costCents, 0);
      const deviation = Math.abs(ledgerSum - metersProviderSpendCents);
      const consistent = deviation <= RECONCILIATION_TOLERANCE_CENTS;
      if (consistent) {
        assert.equal(result.summary.consistent, true);
        assert.equal(result.flags.length, 0);
      } else {
        assert.equal(result.summary.consistent, false);
        // Exactly one discrepancy flag; both records preserved (ledger events untouched).
        assert.equal(result.flags.length, 1);
        assert.equal(result.ledgerEvents.length, assets.filter((a) => a.ledgerEventId).length);
      }
      assert.equal(ledgerReconciliationHolds({ consistent: result.summary.consistent, flags: result.flags }), true);
      assert.equal(result.guardrailOk, true);
    }),
    { numRuns: RUNS },
  );
});
