// Tests for the async Director live stage-execution path (task 12.5a):
// `executeLiveStages` composes the gated render → checkout boundaries against a
// base Run_Manifest, using live async clients when configured and the
// deterministic mocks otherwise. ZERO live network calls.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runVideoRemix,
  executeLiveStages,
  plannedShotsFromManifest,
  RENDER_GATE_ID,
  PAYMENT_GATE_ID,
} from "../video-remix-runtime.js";
import { resolveStageClients } from "../video-remix/live-clients.js";

const NOW = 1_700_000_000_000;
const now = () => NOW;

function renderToken(overrides = {}) {
  return { gateId: RENDER_GATE_ID, issuedAt: NOW, consumed: false, verified: true, ...overrides };
}
function paymentToken(overrides = {}) {
  return { gateId: PAYMENT_GATE_ID, issuedAt: NOW, consumed: false, verified: true, ...overrides };
}

// A base manifest from the synchronous Director with a storyboard (planned shots).
function baseManifest() {
  const sourceCards = [
    { sourceId: "s-1", url: "https://a.example/1" },
    { sourceId: "s-2", url: "https://b.example/2" },
    { sourceId: "s-3", url: "https://c.example/3" },
  ];
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/ref",
    brief: "Promo remix",
    mode: "live",
    budgetUsd: 50,
    approvals: ["paid-model-call"],
    shotCount: 2,
    sourceCards,
    runId: "run-live-exec",
  });
  return payload;
}

// ── plannedShotsFromManifest ────────────────────────────────────────────────

test("plannedShotsFromManifest derives shots from the storyboard", () => {
  const shots = plannedShotsFromManifest(baseManifest());
  assert.equal(shots.length, 2);
  assert.ok(shots[0].shotId);
});

// ── live execution: render + checkout with live async clients ───────────────

test("executeLiveStages runs render+checkout against live async clients", async () => {
  let dispatched = 0;
  let created = 0;
  let settled = 0;
  const clients = {
    live: true,
    mode: "live",
    exaClient: null,
    storyboardClient: null,
    renderClient: {
      isDeterministicMock: false,
      provider: "byteplus-video",
      async dispatch({ shot }) {
        dispatched += 1;
        return { assetUrl: `r2://agenticgraph-media/run/${shot.shotId}/v.json`, provider: "byteplus-video", costCents: 4 };
      },
    },
    commerceClient: {
      stripeClient: {
        isDeterministicMock: false,
        async createCheckoutSession() {
          created += 1;
          return { session: { id: "cs_live", amountTotal: 500, currency: "usd" }, body: {} };
        },
      },
      payoutClient: {
        isDeterministicMock: false,
        async settle() {
          settled += 1;
          return { settled: true, payoutState: "settled" };
        },
      },
      publishClient: { isDeterministicMock: false, async publish({ asset }) { return { publishedUrl: asset.assetUrl }; } },
    },
  };

  const { manifest, render, checkout } = await executeLiveStages(baseManifest(), {
    clients,
    renderToken: renderToken(),
    paymentToken: paymentToken(),
    now,
    runId: "run-live-exec",
  });

  assert.equal(render.permitted, true);
  assert.equal(dispatched, 2, "both planned shots dispatched on the live client");
  assert.equal(manifest.render.assets.length, 2);
  assert.equal(manifest.render.assets[0].costCents, 4);

  assert.equal(checkout.permitted, true);
  assert.equal(created, 1);
  assert.equal(settled, 1);
  assert.equal(manifest.commerce.checkout.sessionId, "cs_live");
  assert.equal(manifest.commerce.checkout.payoutSettled, true);
});

// ── mock path: no live clients → deterministic execution ────────────────────

test("executeLiveStages runs against deterministic mocks when no live clients", async () => {
  const clients = resolveStageClients({}); // mock mode
  const { manifest, render, checkout } = await executeLiveStages(baseManifest(), {
    clients,
    renderToken: renderToken(),
    paymentToken: paymentToken(),
    now,
    runId: "run-mock-exec",
  });
  assert.equal(render.permitted, true);
  assert.equal(manifest.render.assets.length, 2);
  // Keyless deterministic path routes to the zero-spend mock provider.
  assert.equal(manifest.render.providerSpendCents, 0);
  assert.equal(checkout.permitted, true);
  assert.ok(manifest.commerce.checkout.sessionId);
});

// ── gated halt: missing render token → rejection, no spend, state unchanged ─

test("executeLiveStages with a missing render token records a rejection and no assets", async () => {
  const { manifest, render } = await executeLiveStages(baseManifest(), {
    clients: resolveStageClients({}),
    renderToken: undefined, // no approval
    paymentToken: undefined,
    now,
    runId: "run-no-approval",
    skipCheckout: true,
  });
  assert.equal(render.permitted, false);
  assert.equal(render.reason, "absent");
  assert.ok(Array.isArray(manifest.gateRejections) && manifest.gateRejections.length >= 1);
});

// ── consumed render token cannot authorize a second live render ─────────────

test("executeLiveStages: a consumed render token is rejected with zero dispatch", async () => {
  let dispatched = 0;
  const clients = {
    live: true,
    mode: "live",
    renderClient: {
      isDeterministicMock: false,
      provider: "byteplus-video",
      async dispatch() { dispatched += 1; return { assetUrl: "r2://x/y.json", provider: "byteplus-video", costCents: 1 }; },
    },
  };
  const { render } = await executeLiveStages(baseManifest(), {
    clients,
    renderToken: renderToken({ consumed: true }),
    skipCheckout: true,
    now,
    runId: "run-consumed",
  });
  assert.equal(render.permitted, false);
  assert.equal(render.reason, "consumed");
  assert.equal(dispatched, 0, "a rejected token never dispatches the live client");
});
