// Focused tests for the Commerce_Harness webhook-mismatch reconciliation
// (agentic-graph-acos-mcp-connector spec, task 3.17 / R5.6 / Design Property 18).
//
// Property 18: For any Stripe checkout webhook that does NOT match a verified
//   session, the Commerce_Harness withholds the payout, leaves the payout
//   amount unchanged, and appends a reconciliation flag identifying the run.
//   For a MATCHING webhook, the normal settlement path is allowed and no
//   reconciliation flag is appended.
//
// Match semantics mirror the reused payment-worker assets THROUGH AN INJECTABLE
// SEAM (createDeterministicWebhookVerifier / deps.webhookVerifier) so the local
// runtime makes ZERO live network calls. Every test below routes verification
// through a deterministic seam — no real Stripe / network / timer.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  reconcileStripeWebhook,
  matchWebhookToVerifiedSession,
  buildWebhookReconciliationFlag,
  createDeterministicWebhookVerifier,
  webhookReconciliationHolds,
  extractWebhookSessionId,
  indexVerifiedSessions,
  WEBHOOK_RECONCILIATION_FLAG_REASON,
  WEBHOOK_MISMATCH_REASON_SIGNATURE,
  WEBHOOK_MISMATCH_REASON_UNKNOWN_SESSION,
  WEBHOOK_MISMATCH_REASON_AMOUNT,
  WEBHOOK_MISMATCH_REASON_CURRENCY,
  PAYOUT_DISPOSITION_WITHHELD,
  PAYOUT_DISPOSITION_SETTLEMENT_ALLOWED,
  PAYOUT_STATE_PRE_CHECKOUT,
} from "../video-remix-runtime.js";

const NOW = 1_700_000_000_000;
const now = () => NOW;
const NOW_SECONDS = Math.floor(NOW / 1000);

// A verified checkout session for a run (the harness session shape).
function verifiedSession(overrides = {}) {
  return {
    id: "cs_local_run-1_asset",
    amountTotal: 1999,
    currency: "usd",
    expectedSignature: "sig_verified",
    ...overrides,
  };
}

// A Stripe webhook event whose data.object mirrors the live event shape.
function webhookEvent(overrides = {}) {
  const object = {
    id: "cs_local_run-1_asset",
    amount_total: 1999,
    currency: "usd",
    signature: "sig_verified",
    signatureTimestamp: NOW_SECONDS,
    ...(overrides.object || {}),
  };
  return { type: "checkout.session.completed", data: { object }, ...(overrides.event || {}) };
}

// ---------------------------------------------------------------------------
// Matching webhook → settlement allowed, no reconciliation flag
// ---------------------------------------------------------------------------

test("R5.6/Property 18: a matching webhook allows settlement and appends NO reconciliation flag", () => {
  const result = reconcileStripeWebhook(
    {
      event: webhookEvent(),
      verifiedSessions: [verifiedSession()],
      runId: "run-1",
      payoutAmountCents: 1999,
      reconciliationFlags: [],
    },
    { now },
  );

  assert.equal(result.matched, true);
  assert.equal(result.settlementAllowed, true);
  assert.equal(result.payoutWithheld, false);
  assert.equal(result.payoutDisposition, PAYOUT_DISPOSITION_SETTLEMENT_ALLOWED);
  assert.equal(result.flagAppended, false);
  assert.equal(result.reconciliationFlag, null);
  assert.deepEqual(result.reconciliationFlags, []);
  // Amount unchanged.
  assert.equal(result.payoutAmountCents, 1999);
  assert.equal(webhookReconciliationHolds(result, 0), true);
});

test("R5.6: a matching webhook preserves pre-existing reconciliation flags unchanged", () => {
  const prior = ["some-earlier-flag"];
  const result = reconcileStripeWebhook(
    { event: webhookEvent(), verifiedSessions: [verifiedSession()], runId: "run-1", reconciliationFlags: prior },
    { now },
  );
  assert.equal(result.matched, true);
  assert.deepEqual(result.reconciliationFlags, ["some-earlier-flag"]);
  // The input array was not mutated.
  assert.deepEqual(prior, ["some-earlier-flag"]);
});

// ---------------------------------------------------------------------------
// Non-matching webhook → payout withheld, amount unchanged, flag appended
// One representative case per distinct mismatch class (Property 18 coverage).
// ---------------------------------------------------------------------------

const MISMATCH_CASES = [
  {
    name: "unverified signature",
    event: webhookEvent({ object: { signature: "sig_WRONG" } }),
    reason: WEBHOOK_MISMATCH_REASON_SIGNATURE,
  },
  {
    name: "missing signature",
    event: webhookEvent({ object: { signature: "" } }),
    reason: WEBHOOK_MISMATCH_REASON_SIGNATURE,
  },
  {
    name: "stale signature (outside tolerance window)",
    event: webhookEvent({ object: { signatureTimestamp: NOW_SECONDS - (6 * 60) } }),
    reason: WEBHOOK_MISMATCH_REASON_SIGNATURE,
  },
  {
    name: "unknown session id (not among verified sessions)",
    event: webhookEvent({ object: { id: "cs_local_UNKNOWN" } }),
    reason: WEBHOOK_MISMATCH_REASON_UNKNOWN_SESSION,
  },
  {
    name: "amount_total mismatch",
    event: webhookEvent({ object: { amount_total: 4200 } }),
    reason: WEBHOOK_MISMATCH_REASON_AMOUNT,
  },
  {
    name: "currency mismatch",
    event: webhookEvent({ object: { currency: "eur" } }),
    reason: WEBHOOK_MISMATCH_REASON_CURRENCY,
  },
];

for (const { name, event, reason } of MISMATCH_CASES) {
  test(`R5.6/Property 18: a non-matching webhook (${name}) withholds payout, leaves amount unchanged, appends a flag`, () => {
    const result = reconcileStripeWebhook(
      {
        event,
        verifiedSessions: [verifiedSession()],
        runId: "run-1",
        payoutAmountCents: 1999,
        reconciliationFlags: [],
      },
      { now },
    );

    assert.equal(result.matched, false, "webhook must not match a verified session");
    assert.equal(result.reason, reason);
    // Payout withheld.
    assert.equal(result.payoutWithheld, true);
    assert.equal(result.settlementAllowed, false);
    assert.equal(result.payoutDisposition, PAYOUT_DISPOSITION_WITHHELD);
    assert.equal(result.payoutState, PAYOUT_STATE_PRE_CHECKOUT);
    // Amount UNCHANGED.
    assert.equal(result.payoutAmountCents, 1999);
    // Exactly one reconciliation flag appended, identifying the run.
    assert.equal(result.flagAppended, true);
    assert.equal(result.reconciliationFlags.length, 1);
    assert.ok(result.reconciliationFlag.includes("run=run-1"), "flag identifies the affected run");
    assert.ok(result.reconciliationFlag.includes(WEBHOOK_RECONCILIATION_FLAG_REASON));
    assert.equal(webhookReconciliationHolds(result, 0), true);
  });
}

test("R5.6: a non-matching webhook APPENDS to existing flags without dropping or mutating them", () => {
  const prior = ["earlier-flag-a", "earlier-flag-b"];
  const result = reconcileStripeWebhook(
    {
      event: webhookEvent({ object: { id: "cs_local_UNKNOWN" } }),
      verifiedSessions: [verifiedSession()],
      runId: "run-7",
      payoutAmountCents: 5000,
      reconciliationFlags: prior,
    },
    { now },
  );
  assert.equal(result.matched, false);
  assert.equal(result.reconciliationFlags.length, 3);
  assert.deepEqual(result.reconciliationFlags.slice(0, 2), ["earlier-flag-a", "earlier-flag-b"]);
  assert.ok(result.reconciliationFlags[2].includes("run=run-7"));
  // Amount unchanged and input array untouched.
  assert.equal(result.payoutAmountCents, 5000);
  assert.deepEqual(prior, ["earlier-flag-a", "earlier-flag-b"]);
  assert.equal(webhookReconciliationHolds(result, 2), true);
});

// ---------------------------------------------------------------------------
// Injectable seam: ZERO live network calls; verifier is the only authority
// ---------------------------------------------------------------------------

test("injectable seam: the webhook verifier is the sole signature authority (zero live calls)", () => {
  let verifyCalls = 0;
  const denyingVerifier = {
    verify() {
      verifyCalls += 1;
      return { verified: false };
    },
  };
  const result = reconcileStripeWebhook(
    { event: webhookEvent(), verifiedSessions: [verifiedSession()], runId: "run-seam", payoutAmountCents: 1999 },
    { now, webhookVerifier: denyingVerifier },
  );
  // Even with an otherwise perfectly matching event, an injected verifier that
  // denies forces a mismatch → payout withheld, flag appended.
  assert.equal(verifyCalls, 1, "the injected verifier seam was consulted");
  assert.equal(result.matched, false);
  assert.equal(result.reason, WEBHOOK_MISMATCH_REASON_SIGNATURE);
  assert.equal(result.payoutWithheld, true);
  assert.equal(result.payoutAmountCents, 1999);
});

test("injectable seam: a permitting verifier allows settlement for a matched session", () => {
  const allowingVerifier = { verify: () => ({ verified: true }) };
  const result = reconcileStripeWebhook(
    {
      // No expected-signature freshness data — the injected verifier decides.
      event: { data: { object: { id: "cs_x", amount_total: 100, currency: "usd" } } },
      verifiedSessions: [{ id: "cs_x", amountTotal: 100, currency: "usd" }],
      runId: "run-allow",
      payoutAmountCents: 100,
    },
    { now, webhookVerifier: allowingVerifier },
  );
  assert.equal(result.matched, true);
  assert.equal(result.settlementAllowed, true);
  assert.equal(result.flagAppended, false);
});

test("default deterministic verifier honors recorded per-session expected signature", () => {
  const verifier = createDeterministicWebhookVerifier();
  const matchedSession = { id: "cs_x", expectedSignature: "good" };
  assert.equal(
    verifier.verify({ event: { data: { object: { signature: "good" } } }, matchedSession, nowMs: NOW }).verified,
    true,
  );
  assert.equal(
    verifier.verify({ event: { data: { object: { signature: "bad" } } }, matchedSession, nowMs: NOW }).verified,
    false,
  );
  // No matched session → cannot verify.
  assert.equal(
    verifier.verify({ event: { data: { object: { signature: "good" } } }, matchedSession: null, nowMs: NOW }).verified,
    false,
  );
});

// ---------------------------------------------------------------------------
// Helpers: id extraction + verified-session indexing
// ---------------------------------------------------------------------------

test("extractWebhookSessionId reads data.object.id, falling back to client_reference_id", () => {
  assert.equal(extractWebhookSessionId({ data: { object: { id: "cs_a" } } }), "cs_a");
  assert.equal(
    extractWebhookSessionId({ data: { object: { client_reference_id: "acp_b" } } }),
    "acp_b",
  );
  assert.equal(extractWebhookSessionId({}), "");
});

test("indexVerifiedSessions keys by id and normalizes amount/currency", () => {
  const index = indexVerifiedSessions([
    { id: "cs_a", amountTotal: 1999, currency: "USD" },
    { id: "cs_b", amount_total: 500, currency: "eur" },
    { /* no id */ amountTotal: 1 },
  ]);
  assert.equal(index.size, 2);
  assert.deepEqual(index.get("cs_a"), { id: "cs_a", amountTotal: 1999, currency: "usd", expectedSignature: null });
  assert.deepEqual(index.get("cs_b"), { id: "cs_b", amountTotal: 500, currency: "eur", expectedSignature: null });
});

test("matchWebhookToVerifiedSession returns the matched session on full agreement", () => {
  const match = matchWebhookToVerifiedSession(
    { event: webhookEvent(), verifiedSessions: [verifiedSession()] },
    { now },
  );
  assert.equal(match.matched, true);
  assert.equal(match.sessionId, "cs_local_run-1_asset");
  assert.equal(match.matchedSession.amountTotal, 1999);
});

test("buildWebhookReconciliationFlag identifies the run and records amount-unchanged discipline", () => {
  const flag = buildWebhookReconciliationFlag({
    runId: "run-9",
    sessionId: "cs_z",
    reason: WEBHOOK_MISMATCH_REASON_UNKNOWN_SESSION,
    amountCents: 2500,
  });
  assert.ok(flag.includes("run=run-9"));
  assert.ok(flag.includes("cs_z"));
  assert.ok(flag.includes("WITHHELD"));
  assert.ok(flag.includes("amount unchanged"));
});
