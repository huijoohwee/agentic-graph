// Focused unit tests for the Render_Harness keyless / over-budget routing path
// (agenticgraph-acos-mcp-connector spec, task 3.12 / R8.5 / Design Property 16 —
// the deterministic zero-spend mock-provider fallback side).
//
// R8.5: IF no provider key is available OR the cumulative recorded provider
// spend for the current run meets or exceeds the configured budget cap, THEN
// THE Render_Harness SHALL route the shot to the deterministic mock provider
// and record a Credit_Ledger event with provider spend equal to zero.
//
// Design Property 16 (keyless/over-budget routing): for any shot rendered with
// no available provider key OR once cumulative provider spend has reached the
// budget cap, the shot routes to the deterministic mock provider, a
// Credit_Ledger event with provider spend == 0 is recorded, NO paid-provider
// call occurs, and an asset is still emitted.
//
// These are example-based unit asserts at BOTH the pure routing predicate
// (`selectRenderProvider`) and the harness-envelope (`runRenderHarness`)
// layers. Spy seams wrap the deterministic injectable clients (so the local
// runtime makes ZERO live network calls) to prove the live/paid queue is never
// dispatched while the zero-spend mock produces the asset + ledger event.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runRenderHarness,
  selectRenderProvider,
  RENDER_GATE_ID,
  DEFAULT_MEDIA_BUCKET,
  MEDIA_BUCKET_PREFIX,
  PROVIDER_MOCK,
  PROVIDER_BYTEPLUS_QUEUE,
  DEFAULT_SHOT_SPEND_CENTS,
  createDeterministicRenderQueueClient,
  createDeterministicMockProviderClient,
  createDeterministicLedgerClient,
} from "../video-remix-runtime.js";

// A valid, unexpired, unconsumed, signed render Approval_Token. issuedAt=now
// keeps it inside the 15-minute validity window so routing — not the token
// gate — is what is under test here.
function validRenderToken(overrides = {}) {
  return { gateId: RENDER_GATE_ID, issuedAt: Date.now(), consumed: false, verified: true, ...overrides };
}

const SHOTS = Object.freeze([
  { shotId: "shot-1", prompt: "open on skyline" },
  { shotId: "shot-2", prompt: "cut to product" },
  { shotId: "shot-3", prompt: "logo sting" },
]);

// Spy seams that count every dispatch / ledger write so a routing decision can
// assert ZERO paid-provider (live queue) dispatch while the zero-spend mock
// produces the asset + ledger event.
function spySeams() {
  const calls = { queueDispatch: 0, mockDispatch: 0, ledgerRecord: 0 };
  const queue = createDeterministicRenderQueueClient();
  const mock = createDeterministicMockProviderClient();
  const ledger = createDeterministicLedgerClient();
  return {
    calls,
    queueClient: {
      ...queue,
      dispatch(args) {
        calls.queueDispatch += 1;
        return queue.dispatch(args);
      },
    },
    mockClient: {
      ...mock,
      dispatch(args) {
        calls.mockDispatch += 1;
        return mock.dispatch(args);
      },
    },
    ledgerClient: {
      ...ledger,
      record(args) {
        calls.ledgerRecord += 1;
        return ledger.record(args);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// selectRenderProvider: the pure routing predicate (R8.5 / Property 16)
// ---------------------------------------------------------------------------

test("selectRenderProvider routes to the mock when no provider key is available", () => {
  const route = selectRenderProvider({ providerKeyAvailable: false, cumulativeSpendCents: 0 });
  assert.equal(route.useMock, true);
  assert.equal(route.reason, "no_provider_key");
});

test("selectRenderProvider routes to the mock once cumulative spend meets the cap", () => {
  const atCap = selectRenderProvider({ providerKeyAvailable: true, cumulativeSpendCents: 500, budgetCapCents: 500 });
  assert.equal(atCap.useMock, true);
  assert.equal(atCap.reason, "budget_cap_reached");

  const overCap = selectRenderProvider({ providerKeyAvailable: true, cumulativeSpendCents: 750, budgetCapCents: 500 });
  assert.equal(overCap.useMock, true);
  assert.equal(overCap.reason, "budget_cap_reached");
});

test("selectRenderProvider routes to the live queue with a key and spend below cap", () => {
  const route = selectRenderProvider({ providerKeyAvailable: true, cumulativeSpendCents: 100, budgetCapCents: 500 });
  assert.equal(route.useMock, false);
  assert.equal(route.reason, null);

  // No cap configured + key available -> live path.
  const noCap = selectRenderProvider({ providerKeyAvailable: true, cumulativeSpendCents: 9999 });
  assert.equal(noCap.useMock, false);
});

// ---------------------------------------------------------------------------
// R8.5 / Property 16: keyless routing -> zero-spend mock, asset still emitted
// ---------------------------------------------------------------------------

test("R8.5: keyless run routes every shot to the zero-spend mock provider", () => {
  const seams = spySeams();
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      runId: "run-keyless",
      providerKeyAvailable: false,
      queueClient: seams.queueClient,
      mockClient: seams.mockClient,
      ledgerClient: seams.ledgerClient,
    },
  );

  assert.equal(result.status, "complete");

  // An asset is still emitted for every shot (Property 16: asset still emitted).
  assert.equal(result.assets.length, SHOTS.length);
  assert.equal(result.ledgerEvents.length, SHOTS.length);

  // Every asset/ledger event is the zero-spend mock provider.
  for (const asset of result.assets) {
    assert.equal(asset.provider, PROVIDER_MOCK);
    assert.equal(asset.costCents, 0);
    // Asset still resolves under the agenticgraph media bucket.
    assert.match(asset.assetUrl, new RegExp(`^r2://${DEFAULT_MEDIA_BUCKET}/${MEDIA_BUCKET_PREFIX}/`));
  }
  for (const event of result.ledgerEvents) {
    assert.equal(event.provider, PROVIDER_MOCK);
    assert.equal(event.providerSpendCents, 0, "zero-spend ledger event");
  }

  // ZERO paid-provider calls: the live queue is never dispatched.
  assert.equal(seams.calls.queueDispatch, 0, "no paid-provider (live queue) dispatch");
  assert.equal(seams.calls.mockDispatch, SHOTS.length, "every shot routed to the mock");
  assert.equal(result.providerDispatchCalls, 0);
  assert.equal(result.paidProviderCalls, 0);
  assert.equal(result.providerSpendCents, 0, "cumulative provider spend is zero");
});

// ---------------------------------------------------------------------------
// R8.5 / Property 16: over-budget routing -> zero-spend mock once cap reached
// ---------------------------------------------------------------------------

test("R8.5: a run that reaches the budget cap routes remaining shots to the zero-spend mock", () => {
  const seams = spySeams();
  // Cap set so the FIRST live-path shot (DEFAULT_SHOT_SPEND_CENTS) reaches it,
  // forcing every subsequent shot to the zero-spend mock.
  const budgetCapCents = DEFAULT_SHOT_SPEND_CENTS;
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      runId: "run-over-budget",
      providerKeyAvailable: true,
      budgetCapCents,
      queueClient: seams.queueClient,
      mockClient: seams.mockClient,
      ledgerClient: seams.ledgerClient,
    },
  );

  assert.equal(result.status, "complete");
  assert.equal(result.assets.length, SHOTS.length);

  // First shot dispatches on the live path (spend below cap at decision time);
  // once cumulative spend reaches the cap, the remaining shots route to mock.
  assert.equal(result.assets[0].provider, PROVIDER_BYTEPLUS_QUEUE);
  assert.equal(result.assets[0].costCents, DEFAULT_SHOT_SPEND_CENTS);
  for (const asset of result.assets.slice(1)) {
    assert.equal(asset.provider, PROVIDER_MOCK, "over-cap shots route to the mock");
    assert.equal(asset.costCents, 0, "zero-spend over the cap");
  }

  // Exactly one paid-provider call (the pre-cap shot); the rest are zero-spend.
  assert.equal(seams.calls.queueDispatch, 1);
  assert.equal(seams.calls.mockDispatch, SHOTS.length - 1);
  assert.equal(result.providerDispatchCalls, 1);
  assert.equal(result.paidProviderCalls, 1);

  // Over-cap ledger events are all zero-spend.
  const overCapEvents = result.ledgerEvents.slice(1);
  for (const event of overCapEvents) {
    assert.equal(event.provider, PROVIDER_MOCK);
    assert.equal(event.providerSpendCents, 0);
  }
});

test("R8.5: a run already at/over the cap routes EVERY shot to the zero-spend mock with zero paid calls", () => {
  const seams = spySeams();
  // Cap of 0 means cumulative spend (0) already meets the cap at the first
  // decision, so every shot routes to the mock and no paid call ever occurs.
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      runId: "run-at-cap",
      providerKeyAvailable: true,
      budgetCapCents: 0,
      queueClient: seams.queueClient,
      mockClient: seams.mockClient,
      ledgerClient: seams.ledgerClient,
    },
  );

  assert.equal(result.status, "complete");
  assert.equal(result.assets.length, SHOTS.length);

  for (const asset of result.assets) {
    assert.equal(asset.provider, PROVIDER_MOCK);
    assert.equal(asset.costCents, 0);
  }
  for (const event of result.ledgerEvents) {
    assert.equal(event.providerSpendCents, 0, "zero-spend ledger event");
  }

  // ZERO paid-provider calls — the live queue is never touched.
  assert.equal(seams.calls.queueDispatch, 0);
  assert.equal(seams.calls.mockDispatch, SHOTS.length);
  assert.equal(result.providerDispatchCalls, 0);
  assert.equal(result.paidProviderCalls, 0);
  assert.equal(result.providerSpendCents, 0);
});
