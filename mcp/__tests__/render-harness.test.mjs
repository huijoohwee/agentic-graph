// Unit tests for the Render_Harness contract + 5s dispatch
// (agentic-graph-acos-mcp-connector spec, task 3.9 / R8.1 / Property 15 —
// the render-dispatch + asset/ledger side).
//
// R8.1: WHEN the render stage runs with a valid, unexpired render
// Approval_Token, THE Render_Harness SHALL dispatch generation through the
// existing Strytree/BytePlus queue within 5 seconds of stage invocation.
//
// Property 15: For any successfully rendered shot, the Render_Harness returns
// exactly one asset reference resolvable under the agentic-graph media bucket and
// records exactly one Credit_Ledger event — capturing provider spend and
// provider identity — before returning the asset reference.
//
// These are example-based unit asserts of the harness contract
// `{ shots[], renderGateToken } -> { assets:[{ shotId, assetUrl,
// ledgerEventId, costCents }] }`, the injectable queue/ledger seams (so the
// local runtime makes ZERO live network calls), and the 5s dispatch deadline.
// The consolidated property-based test for Property 15 lands in task 9.1.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runRenderHarness,
  validateRenderInput,
  RenderHarnessInputError,
  RENDER_DISPATCH_DEADLINE_MS,
  RENDER_COMPLETION_TIMEOUT_MS,
  RENDER_GATE_ID,
  DEFAULT_MEDIA_BUCKET,
  MEDIA_BUCKET_PREFIX,
  PROVIDER_BYTEPLUS_QUEUE,
  createDeterministicRenderQueueClient,
  createDeterministicLedgerClient,
} from "../video-remix-runtime.js";

// A valid, unexpired, unconsumed, signed render Approval_Token targeting the
// render gate. `now` in the harness defaults to Date.now(); issuedAt=now keeps
// the token inside the 15-minute window.
function validRenderToken(overrides = {}) {
  return {
    gateId: RENDER_GATE_ID,
    issuedAt: Date.now(),
    consumed: false,
    verified: true,
    ...overrides,
  };
}

const SHOTS = Object.freeze([
  { shotId: "shot-1", prompt: "open on skyline" },
  { shotId: "shot-2", prompt: "cut to product" },
]);

// ---------------------------------------------------------------------------
// Input contract: { shots[], renderGateToken }
// ---------------------------------------------------------------------------

test("validateRenderInput accepts a valid shots[] and normalizes entries", () => {
  const { shots } = validateRenderInput({ shots: SHOTS, renderGateToken: validRenderToken() });
  assert.equal(shots.length, 2);
  assert.equal(shots[0].shotId, "shot-1");
  assert.equal(shots[0].prompt, "open on skyline");
});

test("validateRenderInput accepts bare-string shot ids", () => {
  const { shots } = validateRenderInput({ shots: ["a", "b"], renderGateToken: validRenderToken() });
  assert.deepEqual(shots.map((s) => s.shotId), ["a", "b"]);
});

test("validateRenderInput rejects a missing/empty shots[], naming the field", () => {
  for (const bad of [undefined, null, [], "shots", {}]) {
    assert.throws(
      () => validateRenderInput({ shots: bad, renderGateToken: validRenderToken() }),
      (err) =>
        err instanceof RenderHarnessInputError &&
        err.field === "shots" &&
        err.code === "invalid_render_input",
      `shots=${JSON.stringify(bad)} must be rejected`,
    );
  }
});

test("validateRenderInput rejects a shot without an id, naming the indexed field", () => {
  assert.throws(
    () => validateRenderInput({ shots: [{ prompt: "no id" }], renderGateToken: validRenderToken() }),
    (err) => err instanceof RenderHarnessInputError && err.field === "shots[0].shotId",
  );
});

test("validateRenderInput rejects duplicate shot ids", () => {
  assert.throws(
    () => validateRenderInput({ shots: ["dup", "dup"], renderGateToken: validRenderToken() }),
    (err) => err instanceof RenderHarnessInputError && err.field === "shots",
  );
});

// ---------------------------------------------------------------------------
// R8.1: dispatch within 5s of stage invocation given a valid token
// ---------------------------------------------------------------------------

test("R8.1: a valid token dispatches and reports the 5s deadline metadata", () => {
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-dispatch" },
  );

  assert.equal(result.status, "complete");
  assert.equal(result.gateId, RENDER_GATE_ID);
  assert.equal(result.dispatched, true);
  assert.equal(result.dispatchDeadlineMs, RENDER_DISPATCH_DEADLINE_MS);
  assert.equal(RENDER_DISPATCH_DEADLINE_MS, 5000);
  assert.equal(result.completionTimeoutMs, RENDER_COMPLETION_TIMEOUT_MS);
  // Synchronous deterministic seam dispatches immediately -> within the 5s window.
  assert.equal(result.dispatchWithinDeadline, true);
  assert.ok(result.dispatchElapsedMs <= RENDER_DISPATCH_DEADLINE_MS);
});

test("R8.1: an injected slow dispatch beyond 5s is flagged as past-deadline", () => {
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, dispatchElapsedMs: RENDER_DISPATCH_DEADLINE_MS + 1 },
  );
  assert.equal(result.dispatchWithinDeadline, false);
  assert.equal(result.dispatchElapsedMs, RENDER_DISPATCH_DEADLINE_MS + 1);
});

// ---------------------------------------------------------------------------
// Property 15: exactly one asset + exactly one ledger event per completed shot
// ---------------------------------------------------------------------------

test("Property 15: each completed shot yields exactly one asset and one ledger event", () => {
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-15" },
  );

  assert.equal(result.status, "complete");
  // One asset per shot.
  assert.equal(result.assets.length, SHOTS.length);
  // One ledger event per shot.
  assert.equal(result.ledgerEvents.length, SHOTS.length);

  const assetShotIds = result.assets.map((a) => a.shotId);
  assert.deepEqual(assetShotIds, ["shot-1", "shot-2"]);

  // Each asset carries exactly one ledger event id, and each ledger event id
  // is unique (exactly one event per asset).
  const ledgerIds = result.assets.map((a) => a.ledgerEventId);
  assert.equal(new Set(ledgerIds).size, ledgerIds.length);
  for (const asset of result.assets) {
    const matching = result.ledgerEvents.filter((e) => e.ledgerEventId === asset.ledgerEventId);
    assert.equal(matching.length, 1, "exactly one ledger event per asset");
  }
});

test("Property 15: the contract output fields are { shotId, assetUrl, ledgerEventId, costCents }", () => {
  const result = runRenderHarness(
    { shots: ["only"], renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-contract" },
  );
  const [asset] = result.assets;
  assert.equal(typeof asset.shotId, "string");
  assert.equal(typeof asset.assetUrl, "string");
  assert.equal(typeof asset.ledgerEventId, "string");
  assert.equal(typeof asset.costCents, "number");
  for (const field of ["shotId", "assetUrl", "ledgerEventId", "costCents"]) {
    assert.ok(field in asset, `asset must carry the contract field '${field}'`);
  }
});

test("Property 15: asset references resolve under the agentic-graph media bucket", () => {
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-bucket" },
  );
  for (const asset of result.assets) {
    assert.match(asset.assetUrl, new RegExp(`^r2://${DEFAULT_MEDIA_BUCKET}/${MEDIA_BUCKET_PREFIX}/`));
    assert.match(asset.assetUrl, /\/video\.json$/);
  }
});

test("Property 15: each ledger event captures provider identity and provider spend", () => {
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-ledger" },
  );
  for (const event of result.ledgerEvents) {
    assert.equal(event.provider, PROVIDER_BYTEPLUS_QUEUE);
    assert.ok(Number.isFinite(event.providerSpendCents) && event.providerSpendCents >= 0);
    assert.equal(typeof event.shotId, "string");
  }
  // Asset costCents agrees with the recorded ledger spend (cents-exact).
  result.assets.forEach((asset, i) => {
    assert.equal(asset.costCents, result.ledgerEvents[i].providerSpendCents);
  });
});

test("Property 15: the ledger event is recorded BEFORE the asset is returned", () => {
  const recordOrder = [];
  const ledgerClient = createDeterministicLedgerClient();
  const wrappedLedger = {
    ...ledgerClient,
    record(args) {
      recordOrder.push(`ledger:${args.shotId}`);
      return ledgerClient.record(args);
    },
  };
  const queueClient = createDeterministicRenderQueueClient();
  const wrappedQueue = {
    ...queueClient,
    dispatch(args) {
      recordOrder.push(`dispatch:${args.shot.shotId}`);
      return queueClient.dispatch(args);
    },
  };

  const result = runRenderHarness(
    { shots: ["shot-1"], renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-order", queueClient: wrappedQueue, ledgerClient: wrappedLedger },
  );

  assert.equal(result.assets.length, 1);
  // dispatch happens, then the ledger event is recorded before the asset push.
  assert.deepEqual(recordOrder, ["dispatch:shot-1", "ledger:shot-1"]);
});

// ---------------------------------------------------------------------------
// Local runtime makes ZERO live network calls (deterministic injectable seams)
// ---------------------------------------------------------------------------

test("the deterministic default is reproducible for the same (runId, shots)", () => {
  const input = { shots: SHOTS, renderGateToken: validRenderToken() };
  const a = runRenderHarness(input, { providerKeyAvailable: true, runId: "run-stable" });
  const b = runRenderHarness(input, { providerKeyAvailable: true, runId: "run-stable" });
  assert.deepEqual(a.assets, b.assets);
  assert.deepEqual(a.ledgerEvents, b.ledgerEvents);
});

test("an injected queue client is used for dispatch (live wiring lands in task 9.2)", () => {
  let called = 0;
  const queueClient = {
    isDeterministicMock: true,
    provider: PROVIDER_BYTEPLUS_QUEUE,
    dispatch({ shot }) {
      called += 1;
      return {
        assetUrl: `r2://${DEFAULT_MEDIA_BUCKET}/${MEDIA_BUCKET_PREFIX}/injected-${shot.shotId}/video.json`,
        objectKey: `injected-${shot.shotId}`,
        bucket: DEFAULT_MEDIA_BUCKET,
        provider: PROVIDER_BYTEPLUS_QUEUE,
        costCents: 7,
      };
    },
  };
  const result = runRenderHarness(
    { shots: ["a"], renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-inj", queueClient },
  );
  assert.equal(called, 1);
  assert.equal(result.assets[0].costCents, 7);
  assert.match(result.assets[0].assetUrl, /injected-a/);
});
