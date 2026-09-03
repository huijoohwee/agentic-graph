// Parity + async-path tests for the task 12.4a async harness variants
// (`runRenderHarnessAsync`, `runCheckoutAsync`, `runPublishAsync`).
//
// Two guarantees:
//   1. PARITY — on the SAME deterministic seams, each async variant returns a
//      result identical to its sync sibling, so the two cannot drift.
//   2. LIVE ASYNC — each async variant correctly consumes an ASYNC (Promise-
//      returning) client seam, which the sync variants cannot, and preserves
//      the defined fallback/fail-closed semantics.
// ZERO live network calls — async seams are fake in-memory promises.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runRenderHarness,
  runRenderHarnessAsync,
  runPublish,
  runPublishAsync,
  runCheckout,
  runCheckoutAsync,
  RENDER_GATE_ID,
  PAYMENT_GATE_ID,
} from "../video-remix-runtime.js";

const NOW = 1_700_000_000_000;
const now = () => NOW;

function validRenderToken(overrides = {}) {
  return { gateId: RENDER_GATE_ID, issuedAt: NOW, consumed: false, verified: true, ...overrides };
}
function approvedPaymentToken(overrides = {}) {
  return { gateId: PAYMENT_GATE_ID, issuedAt: NOW, consumed: false, verified: true, ...overrides };
}

const SHOTS = Object.freeze([
  { shotId: "shot-1", prompt: "open" },
  { shotId: "shot-2", prompt: "cut" },
]);
const ASSET_URL = "https://airvio.co/agentic-graph/assets/x.mp4";

// ── 1. Render parity (deterministic seams) ──────────────────────────────────

test("parity: runRenderHarnessAsync matches runRenderHarness (complete)", async () => {
  const input = { shots: SHOTS, renderGateToken: validRenderToken() };
  const deps = { now, providerKeyAvailable: true, runId: "run-parity" };
  const sync = runRenderHarness(input, deps);
  const asyncResult = await runRenderHarnessAsync(input, deps);
  assert.deepEqual(asyncResult, sync);
});

test("parity: runRenderHarnessAsync matches on token rejection", async () => {
  const input = { shots: SHOTS, renderGateToken: validRenderToken({ consumed: true }) };
  const deps = { now, providerKeyAvailable: true, runId: "run-parity-reject" };
  const sync = runRenderHarness(input, deps);
  const asyncResult = await runRenderHarnessAsync(input, deps);
  assert.equal(asyncResult.status, "rejected");
  assert.deepEqual(asyncResult, sync);
});

test("parity: runRenderHarnessAsync matches on keyless zero-spend routing", async () => {
  const input = { shots: SHOTS, renderGateToken: validRenderToken() };
  const deps = { now, providerKeyAvailable: false, runId: "run-parity-keyless" };
  assert.deepEqual(await runRenderHarnessAsync(input, deps), runRenderHarness(input, deps));
});

// ── 1b. Render consumes an ASYNC live dispatch client ───────────────────────

test("runRenderHarnessAsync consumes an async dispatch client", async () => {
  let dispatched = 0;
  const queueClient = {
    isDeterministicMock: false,
    provider: "byteplus-video",
    async dispatch({ shot }) {
      dispatched += 1;
      return {
        assetUrl: `r2://agentic-graph-media/run-live/${shot.shotId}/video.json`,
        provider: "byteplus-video",
        costCents: 11,
        objectKey: `run-live/${shot.shotId}`,
        bucket: "agentic-graph-media",
      };
    },
  };
  const result = await runRenderHarnessAsync(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    { now, providerKeyAvailable: true, runId: "run-live", queueClient },
  );
  assert.equal(result.status, "complete");
  assert.equal(dispatched, 2);
  assert.equal(result.assets.length, 2);
  assert.equal(result.assets[0].costCents, 11);
});

test("runRenderHarnessAsync: an async dispatch that rejects fails closed (R8.6)", async () => {
  const queueClient = {
    isDeterministicMock: false,
    provider: "byteplus-video",
    async dispatch({ shot }) {
      if (shot.shotId === "shot-2") throw new Error("provider 503");
      return { assetUrl: `r2://agentic-graph-media/r/${shot.shotId}/v.json`, provider: "byteplus-video", costCents: 5 };
    },
  };
  const result = await runRenderHarnessAsync(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    { now, providerKeyAvailable: true, runId: "run-live-fail", queueClient },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.failure.shotId, "shot-2");
  assert.equal(result.failure.reason, "provider 503");
  assert.equal(result.assets.length, 1, "prior asset preserved");
});

// ── 2. Publish parity + async ───────────────────────────────────────────────

test("parity: runPublishAsync matches runPublish", async () => {
  const input = { assets: [{ shotId: "s1", assetUrl: ASSET_URL }] };
  const deps = { runId: "run-pub" };
  assert.deepEqual(await runPublishAsync(input, deps), runPublish(input, deps));
});

test("runPublishAsync consumes an async publish client", async () => {
  const publishClient = {
    isDeterministicMock: false,
    async publish({ asset }) {
      return { publishedUrl: `https://cdn/${encodeURIComponent(asset.assetUrl)}` };
    },
  };
  const result = await runPublishAsync({ assets: [{ assetUrl: ASSET_URL }] }, { runId: "r", publishClient });
  assert.equal(result.status, "complete");
  assert.equal(result.publishedUrls.length, 1);
  assert.match(result.publishedUrls[0], /^https:\/\/cdn\//);
});

// ── 3. Checkout parity + async ───────────────────────────────────────────────

test("parity: runCheckoutAsync matches runCheckout (approved → settled)", async () => {
  const input = { assetUrl: ASSET_URL, priceId: "price_1", paymentGateToken: approvedPaymentToken() };
  const deps = { now, runId: "run-ck" };
  const sync = runCheckout(input, deps);
  const asyncResult = await runCheckoutAsync(input, deps);
  assert.deepEqual(asyncResult, sync);
});

test("parity: runCheckoutAsync matches on gate rejection (no session, no payout)", async () => {
  const input = { assetUrl: ASSET_URL, paymentGateToken: { gateId: PAYMENT_GATE_ID, issuedAt: NOW, consumed: true, verified: true } };
  const deps = { now, runId: "run-ck-reject" };
  const sync = runCheckout(input, deps);
  const asyncResult = await runCheckoutAsync(input, deps);
  assert.equal(asyncResult.status, "rejected");
  assert.deepEqual(asyncResult, sync);
});

test("runCheckoutAsync consumes async Stripe + payout clients", async () => {
  let created = 0;
  let settled = 0;
  const stripeClient = {
    isDeterministicMock: false,
    async createCheckoutSession() {
      created += 1;
      return { session: { id: "cs_live_async", amountTotal: 500, currency: "usd" }, body: {} };
    },
  };
  const payoutClient = {
    isDeterministicMock: false,
    async settle() {
      settled += 1;
      return { settled: true, payoutState: "settled" };
    },
  };
  const result = await runCheckoutAsync(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-live-ck", stripeClient, payoutClient },
  );
  assert.equal(result.status, "complete");
  assert.equal(result.sessionId, "cs_live_async");
  assert.equal(result.payoutSettled, true);
  assert.equal(created, 1);
  assert.equal(settled, 1);
});

test("runCheckoutAsync: an async settlement rejection preserves pre-checkout payout (R9.4)", async () => {
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
  const result = await runCheckoutAsync(
    { assetUrl: ASSET_URL, paymentGateToken: approvedPaymentToken() },
    { now, runId: "run-live-settle-fail", stripeClient, payoutClient },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.payoutSettled, false);
  assert.equal(result.reason, "settlement_failed");
});
