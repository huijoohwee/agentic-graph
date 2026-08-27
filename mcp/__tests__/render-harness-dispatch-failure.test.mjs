// Focused unit tests for the Render_Harness dispatch-failure / no-asset-timeout
// path (agenticgraph-acos-mcp-connector spec, task 3.13 / R8.6 / Design Property 1 —
// the render-failure semantics side).
//
// R8.6: IF the provider dispatch fails OR returns no asset within 120 seconds of
// dispatch, THEN THE Render_Harness SHALL return an error indication identifying
// the failed shot, record a Credit_Ledger event reflecting the actual provider
// spend incurred, and leave previously rendered shot assets unchanged.
//
// The local runtime makes ZERO live network calls and uses NO real 120s timer:
// the failure / no-asset-within-timeout condition is modeled through the
// injectable per-shot `deps.outcomes` override and through injected queue
// clients whose dispatch throws or resolves without an asset reference. Spy
// seams count every dispatch so we can prove the harness STOPS after a failure
// and never dispatches subsequent shots.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runRenderHarness,
  RENDER_GATE_ID,
  RENDER_COMPLETION_TIMEOUT_MS,
  PROVIDER_BYTEPLUS_QUEUE,
  DEFAULT_SHOT_SPEND_CENTS,
  createDeterministicRenderQueueClient,
  createDeterministicMockProviderClient,
  createDeterministicLedgerClient,
} from "../video-remix-runtime.js";

// A valid, unexpired, unconsumed, signed render Approval_Token (issuedAt=now is
// inside the 15-minute validity window) so the failure path — not the token
// gate — is what is under test here.
function validRenderToken(overrides = {}) {
  return { gateId: RENDER_GATE_ID, issuedAt: Date.now(), consumed: false, verified: true, ...overrides };
}

const SHOTS = Object.freeze([
  { shotId: "shot-1", prompt: "open on skyline" },
  { shotId: "shot-2", prompt: "cut to product" },
  { shotId: "shot-3", prompt: "logo sting" },
]);

// Spy seams that count every dispatch / ledger write so a failure can assert
// that the harness stops and never dispatches the shots after the failed one.
function spySeams(overrides = {}) {
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
        if (overrides.queueDispatch) return overrides.queueDispatch(args, queue);
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
// R8.6: dispatch failure on a shot via the injectable per-shot outcome override
// ---------------------------------------------------------------------------

test("R8.6: a dispatch error on a shot returns failed status identifying the failed shot", () => {
  const seams = spySeams();
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      runId: "run-dispatch-fail",
      providerKeyAvailable: true,
      queueClient: seams.queueClient,
      mockClient: seams.mockClient,
      ledgerClient: seams.ledgerClient,
      // Model a provider dispatch error on the second shot with partial spend.
      outcomes: { "shot-2": { failed: true, reason: "dispatch_error", spentCents: 7 } },
    },
  );

  // Status is failed and the failure record names the failed shot (R8.6).
  assert.equal(result.status, "failed");
  assert.ok(result.failure, "a failure record is present");
  assert.equal(result.failure.shotId, "shot-2", "failure identifies the failed shot");
  assert.equal(result.failure.reason, "dispatch_error");
});

test("R8.6: the failed shot records a Credit_Ledger event reflecting the actual spend incurred", () => {
  const seams = spySeams();
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      runId: "run-dispatch-fail",
      providerKeyAvailable: true,
      queueClient: seams.queueClient,
      mockClient: seams.mockClient,
      ledgerClient: seams.ledgerClient,
      outcomes: { "shot-2": { failed: true, reason: "dispatch_error", spentCents: 7 } },
    },
  );

  // A ledger event for the failed shot records the ACTUAL spend incurred (7c).
  assert.equal(result.failure.providerSpendCents, 7);
  const failedEvent = result.ledgerEvents.find((e) => e.shotId === "shot-2");
  assert.ok(failedEvent, "a ledger event was recorded for the failed shot");
  assert.equal(failedEvent.ledgerEventId, result.failure.ledgerEventId);
  assert.equal(failedEvent.providerSpendCents, 7, "ledger reflects actual provider spend incurred");
  assert.equal(failedEvent.provider, PROVIDER_BYTEPLUS_QUEUE);

  // Cumulative spend = shot-1 success (12c) + shot-2 partial failure spend (7c).
  assert.equal(result.providerSpendCents, DEFAULT_SHOT_SPEND_CENTS + 7);
});

test("R8.6: previously rendered shot assets are left unchanged after a failure", () => {
  const seams = spySeams();
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      runId: "run-dispatch-fail",
      providerKeyAvailable: true,
      queueClient: seams.queueClient,
      mockClient: seams.mockClient,
      ledgerClient: seams.ledgerClient,
      outcomes: { "shot-2": { failed: true, reason: "dispatch_error", spentCents: 7 } },
    },
  );

  // Only the shot rendered BEFORE the failure remains; it is intact/unchanged.
  assert.equal(result.assets.length, 1, "prior rendered shot assets are unchanged");
  assert.equal(result.assets[0].shotId, "shot-1");
  assert.equal(result.assets[0].costCents, DEFAULT_SHOT_SPEND_CENTS);
  assert.equal(result.assets[0].provider, PROVIDER_BYTEPLUS_QUEUE);
  assert.ok(result.assets[0].assetUrl, "the prior asset reference is preserved");
  // The failed shot produced NO asset reference.
  assert.equal(result.assets.find((a) => a.shotId === "shot-2"), undefined);
});

test("R8.6: shots after a failure are never dispatched (the harness stops)", () => {
  const seams = spySeams();
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      runId: "run-dispatch-fail",
      providerKeyAvailable: true,
      queueClient: seams.queueClient,
      mockClient: seams.mockClient,
      ledgerClient: seams.ledgerClient,
      outcomes: { "shot-2": { failed: true, reason: "dispatch_error", spentCents: 7 } },
    },
  );

  // shot-1 dispatched on the live queue; shot-2 short-circuits via the outcome
  // override (no dispatch); shot-3 is NEVER reached.
  assert.equal(seams.calls.queueDispatch, 1, "only the pre-failure shot dispatched");
  assert.equal(seams.calls.mockDispatch, 0);
  assert.equal(result.assets.find((a) => a.shotId === "shot-3"), undefined);
  // Ledger writes: shot-1 success + shot-2 failure = 2 (shot-3 never recorded).
  assert.equal(seams.calls.ledgerRecord, 2);
  assert.equal(result.ledgerEvents.find((e) => e.shotId === "shot-3"), undefined);
});

// ---------------------------------------------------------------------------
// R8.6: no-asset-within-120s timeout (modeled by a dispatch resolving without
// an asset reference — no real timer).
// ---------------------------------------------------------------------------

test("R8.6: a dispatch that returns no asset within the timeout fails identifying the shot", () => {
  // Inject a queue client whose dispatch resolves WITHOUT an assetUrl on the
  // second shot, modeling a no-asset-within-120s timeout deterministically.
  const seams = spySeams({
    queueDispatch(args, queue) {
      if (args.shot.shotId === "shot-2") return { provider: PROVIDER_BYTEPLUS_QUEUE, costCents: 0 };
      return queue.dispatch(args);
    },
  });
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      runId: "run-no-asset",
      providerKeyAvailable: true,
      queueClient: seams.queueClient,
      mockClient: seams.mockClient,
      ledgerClient: seams.ledgerClient,
    },
  );

  assert.equal(result.status, "failed");
  assert.equal(result.failure.shotId, "shot-2", "failure identifies the timed-out shot");
  assert.equal(result.failure.reason, "no_asset_within_timeout");
  // The 120s completion deadline is surfaced as metadata (timer-free locally).
  assert.equal(result.completionTimeoutMs, RENDER_COMPLETION_TIMEOUT_MS);
  assert.equal(RENDER_COMPLETION_TIMEOUT_MS, 120000);
});

test("R8.6: a no-asset timeout records a ledger event and leaves prior assets unchanged", () => {
  const seams = spySeams({
    queueDispatch(args, queue) {
      if (args.shot.shotId === "shot-2") return null; // no result at all -> timeout
      return queue.dispatch(args);
    },
  });
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      runId: "run-no-asset",
      providerKeyAvailable: true,
      queueClient: seams.queueClient,
      mockClient: seams.mockClient,
      ledgerClient: seams.ledgerClient,
    },
  );

  assert.equal(result.status, "failed");
  assert.equal(result.failure.reason, "no_asset_within_timeout");

  // A ledger event is recorded for the failed shot (actual spend = 0 incurred).
  const failedEvent = result.ledgerEvents.find((e) => e.shotId === "shot-2");
  assert.ok(failedEvent, "a ledger event is recorded for the no-asset shot");
  assert.equal(failedEvent.providerSpendCents, 0);
  assert.equal(result.failure.providerSpendCents, 0);

  // Prior rendered asset (shot-1) is unchanged; shot-3 never dispatched.
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].shotId, "shot-1");
  assert.equal(seams.calls.queueDispatch, 2, "shot-1 + the timed-out shot-2 only");
  assert.equal(result.assets.find((a) => a.shotId === "shot-3"), undefined);
});

// ---------------------------------------------------------------------------
// R8.6: a thrown provider dispatch is treated as a dispatch failure.
// ---------------------------------------------------------------------------

test("R8.6: a thrown provider dispatch fails closed identifying the shot and its reason", () => {
  const seams = spySeams({
    queueDispatch(args) {
      if (args.shot.shotId === "shot-2") throw new Error("provider 503");
      return createDeterministicRenderQueueClient().dispatch(args);
    },
  });
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      runId: "run-throw",
      providerKeyAvailable: true,
      queueClient: seams.queueClient,
      mockClient: seams.mockClient,
      ledgerClient: seams.ledgerClient,
    },
  );

  assert.equal(result.status, "failed");
  assert.equal(result.failure.shotId, "shot-2");
  assert.equal(result.failure.reason, "provider 503", "the thrown error message names the reason");

  // A ledger event is still recorded for the failed shot and prior assets stay.
  assert.ok(result.ledgerEvents.find((e) => e.shotId === "shot-2"));
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].shotId, "shot-1");
  assert.equal(result.assets.find((a) => a.shotId === "shot-3"), undefined);
});
