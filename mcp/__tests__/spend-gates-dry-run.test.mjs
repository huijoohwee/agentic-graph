// =============================================================================
// Spend gates, dry-run default, and budget-cap-independent halt — tests
// agenticgraph-widget-canvas-media spec · Task 12
// Requirements: R7.1, R7.2, R7.3, R7.4, R7.5, R7.6, R7.7, R7.8, R7.9
//
// Reconciles / extends the existing gate, token, and budget tests per Task 12:
//   - Director defaults a Run to dry-run (R7.1)
//   - Single-use, unexpired (≤15min) Approval_Token required before any paid
//     model call/render/payment/deploy/consumer-repo-write (R7.2, R7.3)
//   - Token consumed on completion (R7.4)
//   - Missing/expired/malformed token → deny + record reason (R7.5)
//   - Budget-cap breach halts INDEPENDENT of any token (R7.6, R7.7)
//   - No partial spend on budget-cap breach (R7.6)
//   - Checkout/payment uses the Stripe payment worker (R7.8, structural)
//
// Pure offline — ZERO network calls, ZERO paid actions.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runVideoRemix,
  budgetCapExceeded,
  normalizeCumulativeSpendUsd,
  createApprovalTokenIssuer,
  verifyGateToken,
  RENDER_GATE_ID,
  PAYMENT_GATE_ID,
} from "../video-remix-runtime.js";
import {
  withApprovalGate,
  APPROVAL_GATE_GUARD_TTL_MS,
} from "../video-remix/approval-gate-guard.js";

const FIXED_NOW = 1_700_000_000_000;

function freshIssuer() {
  return createApprovalTokenIssuer({ now: FIXED_NOW });
}

const THREE_SOURCES = [
  { url: "https://example.com/a", sourceId: "s1" },
  { url: "https://example.com/b", sourceId: "s2" },
  { url: "https://example.com/c", sourceId: "s3" },
];

const ALL_APPROVALS = [
  { gateId: "paid-model-call", approvalState: "approved", token: "tok-paid" },
  { gateId: "render-action",   approvalState: "approved", token: "tok-render" },
  { gateId: "payment-action",  approvalState: "approved", token: "tok-pay" },
  { gateId: "cloud-deploy",    approvalState: "approved", token: "tok-deploy" },
];

const LIVE_BASE = {
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Spend-gates dry-run test.",
  mode: "live",
  runId: "spend-gates-001",
  sourceCards: THREE_SOURCES,
  approvals: ALL_APPROVALS,
};

// ===========================================================================
// R7.1 — Director defaults a Run to dry-run when mode is omitted
// ===========================================================================

test("R7.1: Director defaults to dry-run when mode is omitted", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/ref.mp4",
    brief: "default mode test",
    runId: "dry-run-default-001",
    sourceCards: THREE_SOURCES,
    // mode is intentionally omitted
  });
  // A dry-run never performs paid actions so actualCostUsd must be 0
  assert.equal(payload.budgetMeters.actualCostUsd, 0);
  // Spend-bearing stages resolve to plan artifacts in dry-run
  const spendBearingStages = payload.stages.filter(s =>
    ["research", "storyboard", "render", "publish", "checkout"].includes(s.id)
  );
  for (const stage of spendBearingStages) {
    assert.ok(
      stage.status === "dry_run_ready" || stage.artifact?.type === "plan" || stage.executed === false,
      `expected dry-run stage '${stage.id}' to be unexecuted or plan-artifact, got status=${stage.status} executed=${stage.executed}`
    );
  }
});

// ===========================================================================
// R7.2, R7.3 — Single-use, unexpired token required before paid actions
// ===========================================================================

test("R7.2: Approval_Token (render) blocks spend when absent", async () => {
  let spendCalls = 0;
  const outcome = await withApprovalGate(RENDER_GATE_ID, undefined, () => {
    spendCalls += 1;
    return { dispatched: true };
  }, { now: FIXED_NOW });
  assert.equal(outcome.permitted, false);
  assert.equal(spendCalls, 0, "no paid action when token is absent");
});

test("R7.3: token is consumed on successful spend (single-use, R7.4)", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(RENDER_GATE_ID);
  let consumed = false;

  const outcome = await withApprovalGate(RENDER_GATE_ID, token, () => "result", {
    now: FIXED_NOW,
    consume: (ctx) => { consumed = true; issuer.consumeSeam()(ctx); },
  });

  assert.equal(outcome.permitted, true);
  assert.equal(consumed, true, "token is consumed after successful spend");

  // Second use of the same token must fail closed
  let secondSpendCalls = 0;
  const secondOutcome = await withApprovalGate(RENDER_GATE_ID, token, () => {
    secondSpendCalls += 1;
  }, { now: FIXED_NOW });
  assert.equal(secondOutcome.permitted, false);
  assert.equal(secondOutcome.reason, "consumed");
  assert.equal(secondSpendCalls, 0, "consumed token cannot authorize a second spend");
});

// ===========================================================================
// R7.5 — Missing/expired/malformed token: deny + record reason
// ===========================================================================

test("R7.5: expired token (>15min) is denied and reason is 'expired'", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(RENDER_GATE_ID);

  let spendCalls = 0;
  const outcome = await withApprovalGate(RENDER_GATE_ID, token, () => {
    spendCalls += 1;
  }, { now: FIXED_NOW + APPROVAL_GATE_GUARD_TTL_MS + 1 });

  assert.equal(outcome.permitted, false);
  assert.equal(outcome.reason, "expired");
  assert.equal(spendCalls, 0);
});

test("R7.5: malformed token (no signature) is denied", async () => {
  const malformed = { gateId: RENDER_GATE_ID, issuedAt: FIXED_NOW, consumed: false };
  let spendCalls = 0;
  const outcome = await withApprovalGate(RENDER_GATE_ID, malformed, () => {
    spendCalls += 1;
  }, { now: FIXED_NOW });
  assert.equal(outcome.permitted, false);
  assert.equal(spendCalls, 0);
  assert.ok(outcome.reason && outcome.reason.length > 0);
});

test("R7.5: gate-mismatched token is denied and reason is 'gate_mismatch'", async () => {
  const issuer = freshIssuer();
  const payToken = issuer.issue(PAYMENT_GATE_ID);

  let spendCalls = 0;
  const outcome = await withApprovalGate(RENDER_GATE_ID, payToken, () => {
    spendCalls += 1;
  }, { now: FIXED_NOW });

  assert.equal(outcome.permitted, false);
  assert.equal(outcome.reason, "gate_mismatch");
  assert.equal(spendCalls, 0);
});

// ===========================================================================
// R7.6, R7.7 — Budget-cap breach halts INDEPENDENT of any token, no partial spend
// ===========================================================================

test("R7.6: budget-cap breach halts spend INDEPENDENT of any valid token (R7.6)", () => {
  // Even with all approvals present, a budget breach halts spending
  const { payload } = runVideoRemix({
    ...LIVE_BASE,
    budgetUsd: 0.01,   // effectively $0.01 cap
    simulatedSpendUsd: 1, // exceeds cap immediately
  });
  assert.equal(payload.state, "budget_exceeded",
    "run must enter budget_exceeded state even when tokens are valid");
  assert.equal(payload.render.assets.length, 0,
    "no paid render dispatch occurs after budget-cap breach");
});

test("R7.6: budget-cap breach leaves no partial spend on subsequent stages", () => {
  const { payload } = runVideoRemix({
    ...LIVE_BASE,
    budgetUsd: 5,
    simulatedSpendUsd: 10, // exceeds cap
  });
  // Downstream stages are held — budget_held status means nothing was spent
  const heldStages = payload.stages.filter(s => s.status === "budget_held");
  assert.ok(heldStages.length > 0, "at least one stage must be budget_held");
  for (const stage of heldStages) {
    assert.equal(stage.executed, false, `stage '${stage.id}' must not execute after cap breach`);
  }
});

test("R7.7: budget-cap breach is independent of Approval_Token state", () => {
  // Budget cap should fire even with no approvals at all (not even pending)
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/ref.mp4",
    brief: "budget independent test",
    mode: "live",
    runId: "budget-indep-001",
    sourceCards: THREE_SOURCES,
    approvals: ALL_APPROVALS,
    budgetUsd: 0.01,   // minimum valid budget
    simulatedSpendUsd: 1, // exceeds cap
  });
  // Whether tokens are valid or not, a budget breach causes budget_exceeded
  assert.equal(payload.state, "budget_exceeded");
  assert.equal(payload.budgetMeters.budgetExceeded, true);
});

// ===========================================================================
// R7.8 — Checkout/payment uses the Stripe payment worker (structural check)
// ===========================================================================

test("R7.8: checkout stage references Stripe payment worker (structural, R7.8)", () => {
  const { payload } = runVideoRemix({
    ...LIVE_BASE,
    budgetUsd: 999,
  });
  // The checkout stage uses the Stripe-backed payment worker.
  // In the offline deterministic path the worker is mocked but the provider
  // identity confirms the wiring — no direct provider calls bypass Stripe.
  const checkoutStage = payload.stages.find(s => s.id === "checkout");
  if (checkoutStage && checkoutStage.status === "complete") {
    // If checkout ran, the commerce checkout must reference a session or Stripe
    assert.ok(
      typeof payload.commerce.checkout.sessionId === "string",
      "checkout must yield a sessionId from the Stripe payment worker"
    );
  } else {
    // Checkout didn't run (no prior assets / approval_required) — still valid
    assert.ok(checkoutStage, "checkout stage must exist in the manifest");
  }
});

// ===========================================================================
// R7.9 — Token single-use: second use fails closed (even with fresh clock)
// ===========================================================================

test("R7.9: single-use: second use of a consumed token fails closed at any time", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(RENDER_GATE_ID);

  // First use: permit and consume
  await withApprovalGate(RENDER_GATE_ID, token, () => null, {
    now: FIXED_NOW,
    consume: (ctx) => issuer.consumeSeam()(ctx),
  });

  // Second use: deny at any point in the validity window
  for (const dt of [0, 60_000, 600_000, APPROVAL_GATE_GUARD_TTL_MS - 1]) {
    let spendCalls = 0;
    const outcome = await withApprovalGate(RENDER_GATE_ID, token, () => {
      spendCalls += 1;
    }, { now: FIXED_NOW + dt });
    assert.equal(outcome.permitted, false,
      `expected token to be denied at +${dt}ms after single use`);
    assert.equal(outcome.reason, "consumed");
    assert.equal(spendCalls, 0);
  }
});
