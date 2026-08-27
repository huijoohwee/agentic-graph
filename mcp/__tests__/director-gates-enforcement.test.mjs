// Tests for Director-layer Approval_Gate enforcement wiring
// (agenticgraph-acos-mcp-connector spec, task 4.5 / R4.2, R4.3, R9.3 /
// Correctness Property 1 + Property 17).
//
// Covers the orchestration-layer coherence the Director owns ON TOP of the
// harnesses' internal token verification:
//   * render gated by a render-action token: permitted -> render runs + token
//     consumed at the Director layer; rejected -> render blocked, Run_Manifest
//     spend state + Run_State unchanged, rejection reason recorded;
//   * checkout/payout gated by a payment-action token: permitted -> checkout
//     runs + token consumed; rejected -> no session/settlement, payout left in
//     its pre-checkout state, Run_Manifest unchanged, rejection reason recorded;
//   * single-use consumption applied at the Director layer (a consumed token
//     fails closed on a second use).
//
// Everything runs over the deterministic injectable harness seams, so the local
// runtime makes ZERO live network calls.

import test from "node:test";
import assert from "node:assert/strict";

import {
  enforceRenderGate,
  enforceCheckoutGate,
  recordRenderGate,
  recordCheckoutGate,
  enforceDirectorRenderGate,
  enforceDirectorCheckoutGate,
  DIRECTOR_RENDER_GATE_ID,
  DIRECTOR_PAYMENT_GATE_ID,
  createApprovalTokenIssuer,
  RENDER_GATE_ID,
  PAYMENT_GATE_ID,
  PAYOUT_STATE_PRE_CHECKOUT,
} from "../video-remix-runtime.js";

const FIXED_NOW = 1_700_000_000_000;

function freshIssuer() {
  return createApprovalTokenIssuer({ now: FIXED_NOW });
}

const SHOTS = Object.freeze([
  { shotId: "shot-a", prompt: "establishing wide" },
  { shotId: "shot-b", prompt: "close detail" },
]);

const CHECKOUT_INPUT = Object.freeze({ assetUrl: "r2://agenticgraph-media/run-x/shot-a.mp4" });

// --- gate-id agreement ------------------------------------------------------

test("Director gate ids match the harness gate ids (no per-layer drift)", () => {
  assert.equal(DIRECTOR_RENDER_GATE_ID, RENDER_GATE_ID);
  assert.equal(DIRECTOR_PAYMENT_GATE_ID, PAYMENT_GATE_ID);
});

// --- Render gate: permitted -------------------------------------------------

test("render permitted -> render runs and the token is consumed at the Director layer", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(RENDER_GATE_ID);
  const consume = issuer.consumeSeam();

  const enforcement = await enforceRenderGate({
    token,
    shots: SHOTS,
    consume,
    deps: { now: FIXED_NOW, providerKeyAvailable: true, runId: "run-render-ok" },
  });

  assert.equal(enforcement.permitted, true, "a valid render token permits the dispatch");
  assert.equal(enforcement.blocked, false);
  assert.equal(enforcement.reason, null);
  assert.equal(enforcement.result.status, "complete");
  assert.equal(enforcement.result.assets.length, SHOTS.length, "render produced one asset per shot");
  assert.equal(enforcement.tokenConsumed, true, "the Director consumed the token on permit");
  // Single-use: the stored token is now consumed.
  assert.equal(issuer.get(token.tokenId).consumed, true);
});

test("render permitted -> manifest gains render assets + an enforcement record", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(RENDER_GATE_ID);
  const manifest = { state: "running", render: { assets: [] } };

  const { manifest: next, enforcement } = await enforceDirectorRenderGate(manifest, {
    token,
    shots: SHOTS,
    consume: issuer.consumeSeam(),
    deps: { now: FIXED_NOW, providerKeyAvailable: true, runId: "run-render-rec" },
  });

  assert.equal(enforcement.permitted, true);
  assert.equal(next.render.assets.length, SHOTS.length);
  assert.equal(next.gateEnforcements.length, 1);
  assert.deepEqual(next.gateEnforcements[0], {
    stage: "render",
    gateId: RENDER_GATE_ID,
    permitted: true,
    reason: null,
    tokenConsumed: true,
  });
  // The input manifest is not mutated.
  assert.deepEqual(manifest.render.assets, []);
});

// --- Render gate: rejected --------------------------------------------------

test("render rejected (absent token) -> render blocked, manifest unchanged, reason recorded", async () => {
  const issuer = freshIssuer();
  let consumeCalls = 0;
  const consume = (args) => {
    consumeCalls += 1;
    return issuer.consumeSeam()(args);
  };

  const priorRender = { assets: [{ shotId: "pre-existing", assetUrl: "r2://x" }] };
  const manifest = { state: "approval_required", render: priorRender };
  const snapshot = JSON.parse(JSON.stringify(manifest));

  const { manifest: next, enforcement } = await enforceDirectorRenderGate(manifest, {
    token: undefined, // absent Approval_Token
    shots: SHOTS,
    consume,
    deps: { now: FIXED_NOW, providerKeyAvailable: true, runId: "run-render-reject" },
  });

  assert.equal(enforcement.permitted, false, "an absent token blocks the render");
  assert.equal(enforcement.blocked, true);
  assert.equal(enforcement.reason, "absent");
  assert.ok(enforcement.error, "a canonical rejection error is surfaced");
  assert.equal(enforcement.tokenConsumed, false, "a rejected token is never consumed");
  assert.equal(consumeCalls, 0, "the consume seam is not called on rejection");

  // Spend-bearing state + Run_State are unchanged; only the reason is recorded.
  assert.equal(next.state, snapshot.state, "Run_State is preserved on rejection");
  assert.deepEqual(next.render, snapshot.render, "render spend state is unchanged");
  assert.equal(next.gateRejections.length, 1);
  assert.equal(next.gateRejections[0].reason, "absent");
  assert.equal(next.gateRejections[0].stage, "render");
});

test("render rejected (gate-mismatched token) -> blocked with gate_mismatch", async () => {
  const issuer = freshIssuer();
  const paymentToken = issuer.issue(PAYMENT_GATE_ID); // wrong gate for render

  const enforcement = await enforceRenderGate({
    token: paymentToken,
    shots: SHOTS,
    consume: issuer.consumeSeam(),
    deps: { now: FIXED_NOW, providerKeyAvailable: true, runId: "run-render-mismatch" },
  });

  assert.equal(enforcement.permitted, false);
  assert.equal(enforcement.reason, "gate_mismatch");
  assert.equal(enforcement.result.assets.length, 0, "no dispatch on a mismatched gate");
  assert.equal(issuer.get(paymentToken.tokenId).consumed, false, "the payment token stays unconsumed");
});

// --- Render gate: single-use across two uses --------------------------------

test("render single-use -> a token consumed on the first permitted use fails closed on a second", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(RENDER_GATE_ID);
  const consume = issuer.consumeSeam();
  const deps = { now: FIXED_NOW, providerKeyAvailable: true, runId: "run-render-single" };

  const first = await enforceRenderGate({ token, shots: SHOTS, consume, deps });
  assert.equal(first.permitted, true);
  assert.equal(first.tokenConsumed, true);

  // The SAME token can no longer authorize a second render.
  const second = await enforceRenderGate({ token, shots: SHOTS, consume, deps });
  assert.equal(second.permitted, false, "a consumed token cannot authorize a second render");
  assert.equal(second.reason, "consumed");
  assert.equal(second.result.assets.length, 0);
});

// --- Checkout gate: permitted -----------------------------------------------

test("checkout permitted -> session created, payout settled, token consumed", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(PAYMENT_GATE_ID);

  const enforcement = await enforceCheckoutGate({
    token,
    checkout: CHECKOUT_INPUT,
    consume: issuer.consumeSeam(),
    deps: { now: FIXED_NOW, runId: "run-checkout-ok" },
  });

  assert.equal(enforcement.permitted, true, "an approved payment gate permits checkout");
  assert.equal(enforcement.result.status, "complete");
  assert.ok(enforcement.result.sessionId, "a non-empty Stripe session id is returned");
  assert.equal(enforcement.result.payoutSettled, true, "the payout is settled");
  assert.equal(enforcement.tokenConsumed, true);
  assert.equal(issuer.get(token.tokenId).consumed, true);
});

test("checkout permitted -> manifest gains commerce.checkout + an enforcement record", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(PAYMENT_GATE_ID);
  const manifest = { state: "running", commerce: { publish: { publishedUrls: [] }, checkout: { sessionId: "", payoutSettled: false } } };

  const { manifest: next, enforcement } = await enforceDirectorCheckoutGate(manifest, {
    token,
    checkout: CHECKOUT_INPUT,
    consume: issuer.consumeSeam(),
    deps: { now: FIXED_NOW, runId: "run-checkout-rec" },
  });

  assert.equal(enforcement.permitted, true);
  assert.ok(next.commerce.checkout.sessionId);
  assert.equal(next.commerce.checkout.payoutSettled, true);
  // publish state is preserved alongside the new checkout state.
  assert.deepEqual(next.commerce.publish, { publishedUrls: [] });
  assert.equal(next.gateEnforcements.length, 1);
  assert.equal(next.gateEnforcements[0].stage, "checkout");
});

// --- Checkout gate: rejected ------------------------------------------------

test("checkout rejected -> no session/settlement, payout unchanged, reason recorded", async () => {
  const issuer = freshIssuer();
  let consumeCalls = 0;
  const consume = (args) => {
    consumeCalls += 1;
    return issuer.consumeSeam()(args);
  };

  const priorCheckout = { sessionId: "", payoutSettled: false, payoutState: PAYOUT_STATE_PRE_CHECKOUT };
  const manifest = { state: "approval_required", commerce: { checkout: priorCheckout } };
  const snapshot = JSON.parse(JSON.stringify(manifest));

  const { manifest: next, enforcement } = await enforceDirectorCheckoutGate(manifest, {
    token: undefined, // absent payment Approval_Token
    checkout: CHECKOUT_INPUT,
    consume,
    deps: { now: FIXED_NOW, runId: "run-checkout-reject" },
  });

  assert.equal(enforcement.permitted, false, "an absent token blocks checkout");
  assert.equal(enforcement.reason, "absent");
  assert.equal(enforcement.result.sessionId, null, "no Stripe session is created");
  assert.equal(enforcement.result.payoutSettled, false, "no payout settles");
  assert.equal(enforcement.result.payoutState, PAYOUT_STATE_PRE_CHECKOUT, "payout left in pre-checkout state");
  assert.equal(enforcement.tokenConsumed, false);
  assert.equal(consumeCalls, 0);

  // Spend-bearing state + Run_State are unchanged; only the reason is recorded.
  assert.equal(next.state, snapshot.state);
  assert.deepEqual(next.commerce.checkout, snapshot.commerce.checkout, "payout state unchanged");
  assert.equal(next.gateRejections.length, 1);
  assert.equal(next.gateRejections[0].reason, "absent");
  assert.equal(next.gateRejections[0].stage, "checkout");
});

test("checkout single-use -> a token consumed on the first permitted use fails closed on a second", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(PAYMENT_GATE_ID);
  const consume = issuer.consumeSeam();
  const deps = { now: FIXED_NOW, runId: "run-checkout-single" };

  const first = await enforceCheckoutGate({ token, checkout: CHECKOUT_INPUT, consume, deps });
  assert.equal(first.permitted, true);
  assert.equal(first.tokenConsumed, true);

  const second = await enforceCheckoutGate({ token, checkout: CHECKOUT_INPUT, consume, deps });
  assert.equal(second.permitted, false, "a consumed payment token cannot authorize a second checkout");
  assert.equal(second.reason, "consumed");
  assert.equal(second.result.sessionId, null);
});

// --- Auth_Token never substitutes for an Approval_Token (R15.9) -------------

test("an Auth_Token-shaped credential never authorizes the checkout boundary", async () => {
  const authTokenShape = {
    subject: "session-abc",
    entitledRunIds: ["run-1"],
    issuedAt: FIXED_NOW,
    expiryWindowSeconds: 3600,
    signature: "auth-jwt-sig",
  };

  const enforcement = await enforceCheckoutGate({
    token: authTokenShape,
    checkout: CHECKOUT_INPUT,
    deps: { now: FIXED_NOW, runId: "run-authtoken" },
  });

  assert.equal(enforcement.permitted, false, "an Auth_Token cannot open the payment gate");
  assert.equal(enforcement.reason, "gate_mismatch");
  assert.equal(enforcement.result.sessionId, null);
});

// --- recorders are pure (copy, never mutate) --------------------------------

test("recordRenderGate / recordCheckoutGate copy the manifest and never mutate the input", async () => {
  const issuer = freshIssuer();
  const renderEnforcement = await enforceRenderGate({
    token: issuer.issue(RENDER_GATE_ID),
    shots: SHOTS,
    consume: issuer.consumeSeam(),
    deps: { now: FIXED_NOW, providerKeyAvailable: true, runId: "run-pure" },
  });
  const manifest = { state: "running" };
  const next = recordRenderGate(manifest, renderEnforcement);
  assert.notEqual(next, manifest, "a new manifest object is returned");
  assert.equal(manifest.gateEnforcements, undefined, "the input manifest is not mutated");

  const checkoutEnforcement = await enforceCheckoutGate({
    token: issuer.issue(PAYMENT_GATE_ID),
    checkout: CHECKOUT_INPUT,
    consume: issuer.consumeSeam(),
    deps: { now: FIXED_NOW, runId: "run-pure-2" },
  });
  const next2 = recordCheckoutGate(next, checkoutEnforcement);
  assert.equal(next2.gateEnforcements.length, 2, "records accumulate across boundaries");
});
