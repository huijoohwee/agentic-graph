// Tests for the verification-immediately-precedes-paid-action guard
// (agenticgraph-acos-mcp-connector spec, task 4.2 / R4.2 / R4.7 / Property 1).
//
// Covers the verify-then-spend invariant:
//   * valid token  -> spendFn invoked exactly once, immediately after verify,
//     with nothing spend-bearing in between;
//   * invalid/expired/mismatched/absent token -> spendFn NOT invoked, rejection
//     returned with the failing-check reason, spend-bearing state unchanged;
//   * the 15-minute issuance boundary (valid at <=15 min, invalid past 15 min);
//   * an Auth_Token never substitutes for an Approval_Token at the boundary.

import test from "node:test";
import assert from "node:assert/strict";

import {
  APPROVAL_GATE_GUARD_TTL_MS,
  verifyImmediatelyBeforeSpend,
  withApprovalGate,
  verifyGateToken,
  createApprovalTokenIssuer,
  RENDER_GATE_ID,
  PAYMENT_GATE_ID,
} from "../video-remix-runtime.js";

const FIXED_NOW = 1_700_000_000_000; // deterministic clock for the suite

function freshIssuer(extra = {}) {
  return createApprovalTokenIssuer({ now: FIXED_NOW, ...extra });
}

// --- TTL window constant agreement -----------------------------------------

test("guard TTL window is the shared 15-minute Approval_Token window", () => {
  assert.equal(APPROVAL_GATE_GUARD_TTL_MS, 15 * 60 * 1000);
});

// --- Valid token: spendFn invoked exactly once, immediately after verify ----

test("valid token -> spendFn invoked exactly once, immediately after verification", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(RENDER_GATE_ID);

  const order = [];
  let spendCalls = 0;

  const outcome = await withApprovalGate(RENDER_GATE_ID, token, () => {
    spendCalls += 1;
    order.push("spend");
    return { dispatched: true };
  }, {
    now: FIXED_NOW,
    // observability seam records the verify step ordering (no spend here)
    onVerify: () => order.push("verify"),
  });

  assert.equal(outcome.permitted, true, "a valid token permits the paid action");
  assert.equal(outcome.reason, null);
  assert.equal(outcome.gateId, RENDER_GATE_ID);
  assert.deepEqual(outcome.result, { dispatched: true }, "spend result is returned");
  assert.equal(spendCalls, 1, "spendFn is invoked exactly once");
  assert.deepEqual(order, ["verify", "spend"], "verify happens immediately before spend");
});

test("no intervening spend-bearing operation runs between verify and the paid action", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(PAYMENT_GATE_ID);

  // The injectable `verify` seam and `consume` seam record their ordering
  // alongside the spend. The guard must produce exactly: verify -> spend ->
  // consume, with nothing spend-bearing between verify and spend.
  const order = [];

  const outcome = await withApprovalGate(PAYMENT_GATE_ID, token, () => {
    order.push("spend");
    return "session_123";
  }, {
    now: FIXED_NOW,
    verify: (tok, opts) => {
      order.push("verify");
      return verifyGateToken(tok, opts);
    },
    consume: () => {
      order.push("consume");
    },
  });

  assert.equal(outcome.permitted, true);
  assert.equal(outcome.result, "session_123");
  assert.deepEqual(
    order,
    ["verify", "spend", "consume"],
    "verification immediately precedes the paid action; consumption follows it",
  );
});

// --- Invalid / expired / mismatched / absent: spendFn NOT invoked -----------

test("absent token -> spendFn NOT invoked, rejection returned (state unchanged)", async () => {
  let spendCalls = 0;
  const outcome = await withApprovalGate(RENDER_GATE_ID, undefined, () => {
    spendCalls += 1;
  }, { now: FIXED_NOW });

  assert.equal(outcome.permitted, false);
  assert.equal(outcome.reason, "absent");
  assert.equal(outcome.result, null);
  assert.equal(spendCalls, 0, "no paid action occurs when the token is absent");
});

test("gate-mismatched token -> spendFn NOT invoked, gate_mismatch rejection", async () => {
  const issuer = freshIssuer();
  const renderToken = issuer.issue(RENDER_GATE_ID);

  let spendCalls = 0;
  const outcome = await withApprovalGate(PAYMENT_GATE_ID, renderToken, () => {
    spendCalls += 1;
  }, { now: FIXED_NOW });

  assert.equal(outcome.permitted, false);
  assert.equal(outcome.reason, "gate_mismatch");
  assert.equal(spendCalls, 0, "a token for another gate never authorizes this spend");
});

test("consumed token -> spendFn NOT invoked, consumed rejection", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(RENDER_GATE_ID);
  token.consumed = true; // simulate a single-use token already spent

  let spendCalls = 0;
  const outcome = await withApprovalGate(RENDER_GATE_ID, token, () => {
    spendCalls += 1;
  }, { now: FIXED_NOW });

  assert.equal(outcome.permitted, false);
  assert.equal(outcome.reason, "consumed");
  assert.equal(spendCalls, 0);
});

test("unsigned/unverified token -> spendFn NOT invoked, invalid_signature rejection", async () => {
  const bareToken = { gateId: RENDER_GATE_ID, issuedAt: FIXED_NOW, consumed: false };

  let spendCalls = 0;
  const outcome = await withApprovalGate(RENDER_GATE_ID, bareToken, () => {
    spendCalls += 1;
  }, { now: FIXED_NOW });

  assert.equal(outcome.permitted, false);
  assert.equal(outcome.reason, "invalid_signature");
  assert.equal(spendCalls, 0);
});

test("onReject observability seam fires and onVerify does not when blocked", async () => {
  let rejected = null;
  let verified = false;
  const outcome = await withApprovalGate(RENDER_GATE_ID, undefined, () => {
    throw new Error("spendFn must not run on rejection");
  }, {
    now: FIXED_NOW,
    onReject: (v) => { rejected = v; },
    onVerify: () => { verified = true; },
  });

  assert.equal(outcome.permitted, false);
  assert.equal(verified, false, "onVerify is not called when verification fails");
  assert.ok(rejected && rejected.valid === false, "onReject receives the failed verification");
});

// --- 15-minute issuance boundary --------------------------------------------

test("token at exactly the 15-minute boundary is valid; one ms past is expired", async () => {
  const issuer = freshIssuer();

  // Issued at FIXED_NOW; evaluated exactly at the TTL edge -> still valid.
  const atEdge = issuer.issue(RENDER_GATE_ID);
  let spendCallsEdge = 0;
  const edgeOutcome = await withApprovalGate(RENDER_GATE_ID, atEdge, () => {
    spendCallsEdge += 1;
    return "ok";
  }, { now: FIXED_NOW + APPROVAL_GATE_GUARD_TTL_MS });
  assert.equal(edgeOutcome.permitted, true, "valid at exactly 15 minutes");
  assert.equal(spendCallsEdge, 1);

  // One millisecond past the window -> expired, no spend.
  const pastEdge = issuer.issue(RENDER_GATE_ID);
  let spendCallsPast = 0;
  const pastOutcome = await withApprovalGate(RENDER_GATE_ID, pastEdge, () => {
    spendCallsPast += 1;
  }, { now: FIXED_NOW + APPROVAL_GATE_GUARD_TTL_MS + 1 });
  assert.equal(pastOutcome.permitted, false, "invalid one ms past 15 minutes");
  assert.equal(pastOutcome.reason, "expired");
  assert.equal(spendCallsPast, 0, "no paid action once the token has expired");
});

test("verifyImmediatelyBeforeSpend mirrors verifyGateToken at the boundary", () => {
  const issuer = freshIssuer();
  const token = issuer.issue(RENDER_GATE_ID);

  const valid = verifyImmediatelyBeforeSpend(token, {
    gateId: RENDER_GATE_ID,
    now: FIXED_NOW + APPROVAL_GATE_GUARD_TTL_MS,
  });
  assert.equal(valid.valid, true);

  const expired = verifyImmediatelyBeforeSpend(token, {
    gateId: RENDER_GATE_ID,
    now: FIXED_NOW + APPROVAL_GATE_GUARD_TTL_MS + 1,
  });
  assert.equal(expired.valid, false);
  assert.equal(expired.reason, "expired");
});

// --- Auth_Token never substitutes for an Approval_Token (R15.9) -------------

test("an Auth_Token-shaped credential never authorizes a spend boundary", async () => {
  // Auth_Token carries subject/entitledRunIds/exp, not a gateId + Approval_Token
  // signature, so it can never satisfy the gate-match check (fails closed).
  const authTokenShape = {
    subject: "session-abc",
    entitledRunIds: ["run-1"],
    issuedAt: FIXED_NOW,
    expiryWindowSeconds: 3600,
    signature: "auth-jwt-sig",
  };

  let spendCalls = 0;
  const outcome = await withApprovalGate(PAYMENT_GATE_ID, authTokenShape, () => {
    spendCalls += 1;
  }, { now: FIXED_NOW });

  assert.equal(outcome.permitted, false, "an Auth_Token cannot open a spend gate");
  assert.equal(outcome.reason, "gate_mismatch");
  assert.equal(spendCalls, 0);
});

// --- Misuse guard -----------------------------------------------------------

test("withApprovalGate requires a spend-bearing function", async () => {
  await assert.rejects(
    () => withApprovalGate(RENDER_GATE_ID, null, undefined, { now: FIXED_NOW }),
    /spend-bearing function/,
  );
});
