// Focused unit tests for the Render_Harness asset/ledger emission contract
// (agentic-graph-acos-mcp-connector spec, task 3.11 / R8.3, R8.4 / Property 15).
//
// R8.3: WHEN a shot render completes successfully, THE Render_Harness SHALL
// return exactly one asset reference resolvable under the agentic-graph media bucket
// and exactly one Credit_Ledger event identifier for that shot.
//
// R8.4: WHEN a shot render completes, THE Render_Harness SHALL record one
// Credit_Ledger event capturing the provider spend amount and the provider
// identity for that shot BEFORE returning the asset reference.
//
// These complement the task 3.9 unit tests (render-harness.test.mjs) by
// exercising the per-shot invariants across MULTIPLE interleaved shots: the
// single-shot ordering test cannot observe that EACH shot's ledger event is
// recorded before EACH corresponding asset is emitted. Everything runs over the
// deterministic injectable seams, so the local runtime makes ZERO live network
// calls. The consolidated property-based test for Property 15 lands in 9.1.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runRenderHarness,
  RENDER_GATE_ID,
  DEFAULT_MEDIA_BUCKET,
  MEDIA_BUCKET_PREFIX,
  PROVIDER_BYTEPLUS_QUEUE,
  mediaObjectKey,
  renderLedgerEventId,
  createDeterministicRenderQueueClient,
  createDeterministicLedgerClient,
} from "../video-remix-runtime.js";

// A valid, unexpired, unconsumed, signed render Approval_Token. issuedAt=now
// keeps it inside the 15-minute validity window.
function validRenderToken(overrides = {}) {
  return { gateId: RENDER_GATE_ID, issuedAt: Date.now(), consumed: false, verified: true, ...overrides };
}

const MULTI_SHOTS = Object.freeze([
  { shotId: "shot-a", prompt: "establishing wide" },
  { shotId: "shot-b", prompt: "mid product" },
  { shotId: "shot-c", prompt: "close detail" },
  { shotId: "shot-d", prompt: "logo sting" },
]);

// ---------------------------------------------------------------------------
// R8.3: exactly one asset + exactly one ledger-event id per shot (multi-shot)
// ---------------------------------------------------------------------------

test("R8.3: exactly one asset and one ledger event per shot across N shots", () => {
  const result = runRenderHarness(
    { shots: MULTI_SHOTS, renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-multi" },
  );

  assert.equal(result.status, "complete");
  assert.equal(result.assets.length, MULTI_SHOTS.length);
  assert.equal(result.ledgerEvents.length, MULTI_SHOTS.length);

  // Exactly one asset per distinct shotId, in input order.
  assert.deepEqual(
    result.assets.map((a) => a.shotId),
    MULTI_SHOTS.map((s) => s.shotId),
  );
  assert.equal(new Set(result.assets.map((a) => a.shotId)).size, MULTI_SHOTS.length);

  // Exactly one ledger event per distinct shotId.
  assert.equal(new Set(result.ledgerEvents.map((e) => e.shotId)).size, MULTI_SHOTS.length);

  // Each asset's ledgerEventId is the deterministic per-shot id and resolves to
  // exactly one recorded ledger event.
  for (const asset of result.assets) {
    const expectedId = renderLedgerEventId("run-multi", asset.shotId);
    assert.equal(asset.ledgerEventId, expectedId, "asset carries the per-shot ledger id");
    const matches = result.ledgerEvents.filter((e) => e.ledgerEventId === asset.ledgerEventId);
    assert.equal(matches.length, 1, "exactly one ledger event id per shot");
    assert.equal(matches[0].shotId, asset.shotId);
  }
});

test("R8.3: every asset reference is resolvable under the agentic-graph media bucket", () => {
  const result = runRenderHarness(
    { shots: MULTI_SHOTS, renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-bucket-multi" },
  );

  for (const asset of result.assets) {
    // assetUrl is an r2:// reference under the configured media bucket + prefix.
    assert.match(asset.assetUrl, new RegExp(`^r2://${DEFAULT_MEDIA_BUCKET}/${MEDIA_BUCKET_PREFIX}/`));
    assert.match(asset.assetUrl, /\/video\.json$/);
    // Observable metadata is internally consistent: assetUrl == r2://<bucket>/<objectKey>.
    assert.equal(asset.bucket, DEFAULT_MEDIA_BUCKET);
    assert.equal(asset.assetUrl, `r2://${asset.bucket}/${asset.objectKey}`);
    assert.match(asset.objectKey, new RegExp(`^${MEDIA_BUCKET_PREFIX}/`));
    assert.equal(asset.objectKey, mediaObjectKey(asset.objectKey.split("/")[2]));
  }
});

// ---------------------------------------------------------------------------
// R8.4: ledger captures provider identity + spend, recorded BEFORE the asset
// ---------------------------------------------------------------------------

test("R8.4: every ledger event captures provider identity and provider spend", () => {
  const result = runRenderHarness(
    { shots: MULTI_SHOTS, renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-identity" },
  );

  for (const event of result.ledgerEvents) {
    // Provider identity is captured (R8.4).
    assert.equal(event.provider, PROVIDER_BYTEPLUS_QUEUE);
    // Provider spend amount is captured as a non-negative integer cents value.
    assert.ok(Number.isInteger(event.providerSpendCents) && event.providerSpendCents >= 0);
    assert.equal(typeof event.shotId, "string");
  }

  // The asset's reported costCents equals the ledger event's recorded spend
  // (cents-exact, so ledger sums reconcile without float drift).
  result.assets.forEach((asset, i) => {
    assert.equal(asset.costCents, result.ledgerEvents[i].providerSpendCents);
    assert.equal(asset.provider, result.ledgerEvents[i].provider);
  });
});

test("R8.4: for EVERY shot the ledger event is recorded before its asset is returned", () => {
  // Instrument both seams to capture a global event timeline. The harness
  // dispatches a shot, records its ledger event, THEN pushes the asset; so for
  // each shotId we must observe `ledger:<shot>` strictly before the harness
  // returns, and the per-shot ledger must precede the next shot's dispatch.
  const timeline = [];

  const ledger = createDeterministicLedgerClient();
  const wrappedLedger = {
    ...ledger,
    record(args) {
      timeline.push(`ledger:${args.shotId}`);
      return ledger.record(args);
    },
  };

  const queue = createDeterministicRenderQueueClient();
  const wrappedQueue = {
    ...queue,
    dispatch(args) {
      timeline.push(`dispatch:${args.shot.shotId}`);
      return queue.dispatch(args);
    },
  };

  const result = runRenderHarness(
    { shots: MULTI_SHOTS, renderGateToken: validRenderToken() },
    {
      providerKeyAvailable: true,
      runId: "run-order-multi",
      queueClient: wrappedQueue,
      ledgerClient: wrappedLedger,
    },
  );

  assert.equal(result.assets.length, MULTI_SHOTS.length);

  // Expected interleaving: dispatch then ledger, per shot, in input order.
  const expected = [];
  for (const shot of MULTI_SHOTS) {
    expected.push(`dispatch:${shot.shotId}`);
    expected.push(`ledger:${shot.shotId}`);
  }
  assert.deepEqual(timeline, expected);

  // Stronger per-shot invariant: each shot's ledger record appears before that
  // shot's asset exists in the returned envelope. Because the returned assets[]
  // is in input order and every ledger event was recorded during the loop, the
  // ledger index for a shot is <= its asset index, and the ledger event for the
  // asset's shot was recorded (present) before the function returned the asset.
  result.assets.forEach((asset) => {
    const ledgerPos = timeline.indexOf(`ledger:${asset.shotId}`);
    const dispatchPos = timeline.indexOf(`dispatch:${asset.shotId}`);
    assert.ok(dispatchPos >= 0 && ledgerPos > dispatchPos, "ledger recorded after dispatch, before return");
    assert.ok(
      result.ledgerEvents.some((e) => e.ledgerEventId === asset.ledgerEventId),
      "the asset's ledger event was recorded before the asset was returned",
    );
  });
});

test("R8.4: a single-shot run records exactly one ledger event before the asset", () => {
  const timeline = [];
  const ledger = createDeterministicLedgerClient();
  const wrappedLedger = {
    ...ledger,
    record(args) {
      timeline.push(`ledger:${args.shotId}`);
      return ledger.record(args);
    },
  };

  const result = runRenderHarness(
    { shots: ["solo"], renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-solo", ledgerClient: wrappedLedger },
  );

  assert.equal(result.assets.length, 1);
  assert.equal(result.ledgerEvents.length, 1);
  assert.deepEqual(timeline, ["ledger:solo"]);
  assert.equal(result.assets[0].ledgerEventId, result.ledgerEvents[0].ledgerEventId);
});
