// Tests that the Director gate enforcers (now backed by the async harness
// variants, task 12.4a) consume LIVE async render/commerce clients injected via
// `deps`, and that `resolveGateClientDeps` (task 12.5) maps env-resolved live
// clients into those deps. ZERO live network calls — async seams are fakes.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  enforceRenderGate,
  enforceCheckoutGate,
  enforceDirectorRenderGate,
  enforceDirectorCheckoutGate,
  RENDER_GATE_ID,
  PAYMENT_GATE_ID,
} from "../video-remix-runtime.js";
import { resolveStageClients, resolveGateClientDeps } from "../video-remix/live-clients.js";

const NOW = 1_700_000_000_000;
const now = () => NOW;

function validRenderToken(overrides = {}) {
  return { gateId: RENDER_GATE_ID, issuedAt: NOW, consumed: false, verified: true, ...overrides };
}
function approvedPaymentToken(overrides = {}) {
  return { gateId: PAYMENT_GATE_ID, issuedAt: NOW, consumed: false, verified: true, ...overrides };
}

const SHOTS = Object.freeze([{ shotId: "shot-1", prompt: "open" }]);
const CHECKOUT_INPUT = Object.freeze({ assetUrl: "https://airvio.co/agenticgraph/assets/x.mp4", priceId: "price_1" });

// ── enforceRenderGate awaits a live async render client ─────────────────────

test("enforceRenderGate consumes an async live render client (queueClient via deps)", async () => {
  let dispatched = 0;
  const queueClient = {
    isDeterministicMock: false,
    provider: "byteplus-video",
    async dispatch({ shot }) {
      dispatched += 1;
      return {
        assetUrl: `r2://agenticgraph-media/run-live/${shot.shotId}/video.json`,
        provider: "byteplus-video",
        costCents: 9,
      };
    },
  };
  const enforcement = await enforceRenderGate({
    token: validRenderToken(),
    shots: SHOTS,
    deps: { now, providerKeyAvailable: true, runId: "run-live-render", queueClient },
  });
  assert.equal(enforcement.permitted, true);
  assert.equal(dispatched, 1, "the live async dispatch was awaited");
  assert.equal(enforcement.result.assets.length, 1);
  assert.equal(enforcement.result.assets[0].costCents, 9);
});

test("enforceDirectorRenderGate records live render assets into the manifest", async () => {
  const queueClient = {
    isDeterministicMock: false,
    provider: "byteplus-video",
    async dispatch({ shot }) {
      return { assetUrl: `r2://agenticgraph-media/r/${shot.shotId}/v.json`, provider: "byteplus-video", costCents: 3 };
    },
  };
  const manifest = { state: "running", render: { assets: [] } };
  const { manifest: next, enforcement } = await enforceDirectorRenderGate(manifest, {
    token: validRenderToken(),
    shots: SHOTS,
    deps: { now, providerKeyAvailable: true, runId: "run-live-render2", queueClient },
  });
  assert.equal(enforcement.permitted, true);
  assert.equal(next.render.assets.length, 1);
  assert.equal(next.render.providerSpendCents, 3);
});

// ── enforceCheckoutGate awaits live async Stripe + payout clients ───────────

test("enforceCheckoutGate consumes async live Stripe + payout clients (via deps)", async () => {
  let created = 0;
  let settled = 0;
  const stripeClient = {
    isDeterministicMock: false,
    async createCheckoutSession() {
      created += 1;
      return { session: { id: "cs_live_gate", amountTotal: 500, currency: "usd" }, body: {} };
    },
  };
  const payoutClient = {
    isDeterministicMock: false,
    async settle() {
      settled += 1;
      return { settled: true, payoutState: "settled" };
    },
  };
  const enforcement = await enforceCheckoutGate({
    token: approvedPaymentToken(),
    checkout: CHECKOUT_INPUT,
    deps: { now, runId: "run-live-checkout", stripeClient, payoutClient },
  });
  assert.equal(enforcement.permitted, true);
  assert.equal(enforcement.result.sessionId, "cs_live_gate");
  assert.equal(enforcement.result.payoutSettled, true);
  assert.equal(created, 1);
  assert.equal(settled, 1);
});

test("enforceCheckoutGate with an async settlement failure stays blocked, payout preserved (R9.4)", async () => {
  const stripeClient = {
    isDeterministicMock: false,
    async createCheckoutSession() {
      return { session: { id: "cs_x", amountTotal: 500, currency: "usd" }, body: {} };
    },
  };
  const payoutClient = {
    isDeterministicMock: false,
    async settle() {
      throw new Error("acquirer down");
    },
  };
  const manifest = { state: "running", commerce: { checkout: { sessionId: "", payoutSettled: false } } };
  const { manifest: next, enforcement } = await enforceDirectorCheckoutGate(manifest, {
    token: approvedPaymentToken(),
    checkout: CHECKOUT_INPUT,
    deps: { now, runId: "run-live-settle-fail", stripeClient, payoutClient },
  });
  // A post-approval settlement failure is NOT a gate rejection — the gate was
  // approved (R9.4), so it is "permitted" but the checkout result is failed and
  // the payout is preserved in its pre-checkout state.
  assert.equal(enforcement.permitted, true);
  assert.equal(enforcement.result.status, "failed");
  assert.equal(enforcement.result.payoutSettled, false);
  assert.equal(next.commerce.checkout.payoutSettled, false);
});

// ── rejection path still holds with the async harness ───────────────────────

test("enforceRenderGate rejects a consumed token with zero dispatch (async path)", async () => {
  let dispatched = 0;
  const queueClient = {
    isDeterministicMock: false,
    provider: "byteplus-video",
    async dispatch() {
      dispatched += 1;
      return { assetUrl: "r2://x/y.json", provider: "byteplus-video", costCents: 1 };
    },
  };
  const enforcement = await enforceRenderGate({
    token: validRenderToken({ consumed: true }),
    shots: SHOTS,
    deps: { now, providerKeyAvailable: true, runId: "run-reject", queueClient },
  });
  assert.equal(enforcement.permitted, false);
  assert.equal(enforcement.reason, "consumed");
  assert.equal(dispatched, 0, "a rejected token never dispatches the live client");
});

// ── resolveGateClientDeps maps live clients into harness deps ───────────────

test("resolveGateClientDeps injects live render/commerce clients into deps", () => {
  const clients = resolveStageClients(
    {
      AGENTICGRAPH_LIVE_CLIENTS: "1",
      RENDER_PROVIDER: "strytree",
      STRYTREE_RENDER_URL: "https://pay/render",
      AGENTICGRAPH_PAYMENT_URL: "https://pay.example",
    },
    { fetchImpl: async () => ({ status: 200, headers: { get: () => "application/json" }, json: async () => ({}) }) },
  );
  const { renderDeps, checkoutDeps } = resolveGateClientDeps(clients, { now, runId: "r" });

  assert.equal(renderDeps.runId, "r", "base deps preserved");
  assert.ok(renderDeps.queueClient, "live render client injected as queueClient");
  assert.equal(renderDeps.providerKeyAvailable, true);
  assert.ok(checkoutDeps.stripeClient && checkoutDeps.payoutClient && checkoutDeps.publishClient);
});

test("resolveGateClientDeps passes base deps through unchanged in mock mode", () => {
  const clients = resolveStageClients({}); // mock
  const { renderDeps, checkoutDeps } = resolveGateClientDeps(clients, { now, runId: "r" });
  assert.equal(renderDeps.queueClient, undefined, "no live render client in mock mode");
  assert.equal(checkoutDeps.stripeClient, undefined, "no live stripe client in mock mode");
  assert.equal(renderDeps.runId, "r");
});
