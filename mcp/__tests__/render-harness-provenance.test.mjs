// Tests for provenance + Durable_R2_URL attachment in the Render_Harness
// agenticgraph-widget-canvas-media spec · Task 6
// Requirements: 3.1, 3.2, 3.7, 6.1, 6.3, 6.6
//
// Covers:
//   1. When provenanceBuilder is provided, assets carry a `provenance` field.
//   2. When provenanceBuilder returns an incomplete chain + failIfProvenanceIncomplete=true,
//      the shot fails with RENDER_STATUS_FAILED and a descriptive reason.
//   3. When provenanceBuilder is absent, existing behavior is preserved (no `provenance`
//      field, no breakage) — backward compatibility.
//   4. When dispatchResult.durableR2Url is present, it is recorded on the asset.
//   5. When dispatchResult.durableR2Url is absent, assetUrl is used as the fallback.
//   6. Persist-before-complete: assets carry durableR2Url (from mock) before step completes.
//
// Both the sync (runRenderHarness) and async (runRenderHarnessAsync) variants are
// exercised to ensure parity (the async variant mirrors every sync change).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runRenderHarness,
  runRenderHarnessAsync,
  RENDER_GATE_ID,
} from "../video-remix-runtime.js";

import {
  buildProvenanceChain,
} from "../video-remix/provenance.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function validRenderToken(overrides = {}) {
  return { gateId: RENDER_GATE_ID, issuedAt: Date.now(), consumed: false, verified: true, ...overrides };
}

const SHOTS = Object.freeze([
  { shotId: "shot-prov-1", prompt: "opening" },
  { shotId: "shot-prov-2", prompt: "cutaway" },
]);

/** Complete provenance chain builder — satisfies assertComplete. */
function completeProvenanceBuilder(shot, runId, _dispatchResult) {
  return buildProvenanceChain({
    goalRef:  `goal:${runId}`,
    briefRef: `brief:${shot.shotId}`,
    planRef:  `plan:${shot.shotId}`,
    toolCalls: [{ tool: "render", inputHash: shot.shotId }],
    verificationChecks: [{ checkId: "persist", status: "passed" }],
  });
}

/** Incomplete provenance builder — returns a chain missing goalRef. */
function incompleteProvenanceBuilder(_shot, _runId, _dispatchResult) {
  return buildProvenanceChain({ goalRef: "", briefRef: "b", planRef: "p" });
}

/** A queue client whose dispatch result includes durableR2Url. */
function queueClientWithDurableUrl(durableR2Url) {
  return {
    isDeterministicMock: true,
    provider: "byteplus-queue",
    dispatch({ shot }) {
      return {
        assetUrl: `r2://agenticgraph-media/strytree/generation/job-${shot.shotId}/video.json`,
        durableR2Url,
        provider: "byteplus-queue",
        costCents: 10,
        objectKey: `runs/run-test/render/${shot.shotId}.mp4`,
        bucket: "agenticgraph-media",
      };
    },
  };
}

/** A queue client whose dispatch result has NO durableR2Url. */
function queueClientWithoutDurableUrl() {
  return {
    isDeterministicMock: true,
    provider: "byteplus-queue",
    dispatch({ shot }) {
      return {
        assetUrl: `r2://agenticgraph-media/strytree/generation/job-${shot.shotId}/video.json`,
        provider: "byteplus-queue",
        costCents: 10,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// 1. provenanceBuilder present → assets carry provenance
// ---------------------------------------------------------------------------

test("1. provenance field is attached to each asset when provenanceBuilder is provided (sync)", () => {
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      providerKeyAvailable: true,
      runId: "run-prov",
      provenanceBuilder: completeProvenanceBuilder,
    },
  );
  assert.equal(result.status, "complete");
  assert.equal(result.assets.length, 2);
  for (const asset of result.assets) {
    assert.ok("provenance" in asset, `asset ${asset.shotId} must carry provenance`);
    assert.ok(asset.provenance !== null && typeof asset.provenance === "object");
    assert.equal(typeof asset.provenance.goalRef, "string");
    assert.ok(asset.provenance.goalRef.length > 0, "goalRef must be non-empty");
    assert.ok(Array.isArray(asset.provenance.toolCalls));
    assert.ok(Array.isArray(asset.provenance.verificationChecks));
  }
});

test("1. provenance field is attached to each asset when provenanceBuilder is provided (async)", async () => {
  const result = await runRenderHarnessAsync(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      providerKeyAvailable: true,
      runId: "run-prov-async",
      provenanceBuilder: completeProvenanceBuilder,
    },
  );
  assert.equal(result.status, "complete");
  assert.equal(result.assets.length, 2);
  for (const asset of result.assets) {
    assert.ok("provenance" in asset, `asset ${asset.shotId} must carry provenance`);
    assert.ok(asset.provenance.goalRef.length > 0);
  }
});

test("1. provenance object is per-shot and correctly scoped (sync)", () => {
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      providerKeyAvailable: true,
      runId: "run-scope",
      provenanceBuilder: completeProvenanceBuilder,
    },
  );
  assert.equal(result.status, "complete");
  const [a1, a2] = result.assets;
  assert.notEqual(a1.provenance.briefRef, a2.provenance.briefRef, "provenance is per-shot");
  assert.equal(a1.provenance.briefRef, `brief:${SHOTS[0].shotId}`);
  assert.equal(a2.provenance.briefRef, `brief:${SHOTS[1].shotId}`);
});

// ---------------------------------------------------------------------------
// 2. Incomplete provenance + failIfProvenanceIncomplete=true → shot fails
// ---------------------------------------------------------------------------

test("2. incomplete provenance with failIfProvenanceIncomplete=true fails the shot (sync)", () => {
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      providerKeyAvailable: true,
      runId: "run-fail-prov",
      provenanceBuilder: incompleteProvenanceBuilder,
      failIfProvenanceIncomplete: true,
    },
  );
  assert.equal(result.status, "failed", "status must be failed");
  assert.ok(result.failure, "failure object must be present");
  assert.equal(result.failure.shotId, SHOTS[0].shotId, "first shot should fail");
  assert.ok(
    typeof result.failure.reason === "string" && result.failure.reason.length > 0,
    "failure must carry a descriptive reason",
  );
  // Descriptive — mentions provenance or the missing field
  assert.match(result.failure.reason, /provenance|goalRef|incomplete|missing/i,
    "reason should describe the provenance failure");
  // No assets were added for the failing shot
  assert.equal(result.assets.length, 0, "no assets when first shot fails on provenance");
});

test("2. incomplete provenance with failIfProvenanceIncomplete=true fails the shot (async)", async () => {
  const result = await runRenderHarnessAsync(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      providerKeyAvailable: true,
      runId: "run-fail-prov-async",
      provenanceBuilder: incompleteProvenanceBuilder,
      failIfProvenanceIncomplete: true,
    },
  );
  assert.equal(result.status, "failed");
  assert.ok(result.failure);
  assert.match(result.failure.reason, /provenance|goalRef|incomplete|missing/i);
});

test("2. when the second shot has incomplete provenance, the first shot's asset is preserved (sync)", () => {
  // Only the second shot has incomplete provenance.
  const mixedBuilder = (shot, runId, dr) =>
    shot.shotId === SHOTS[1].shotId
      ? incompleteProvenanceBuilder(shot, runId, dr)
      : completeProvenanceBuilder(shot, runId, dr);

  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      providerKeyAvailable: true,
      runId: "run-partial-prov",
      provenanceBuilder: mixedBuilder,
      failIfProvenanceIncomplete: true,
    },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.failure.shotId, SHOTS[1].shotId, "second shot fails");
  assert.equal(result.assets.length, 1, "first shot asset is preserved");
  assert.ok("provenance" in result.assets[0], "first asset has provenance");
});

// ---------------------------------------------------------------------------
// 3. No provenanceBuilder → backward compatibility (no provenance field)
// ---------------------------------------------------------------------------

test("3. without provenanceBuilder, assets have no provenance field (sync)", () => {
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-no-prov" },
  );
  assert.equal(result.status, "complete");
  for (const asset of result.assets) {
    assert.ok(!("provenance" in asset), `asset ${asset.shotId} must NOT carry provenance`);
  }
});

test("3. without provenanceBuilder, assets have no provenance field (async)", async () => {
  const result = await runRenderHarnessAsync(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-no-prov-async" },
  );
  assert.equal(result.status, "complete");
  for (const asset of result.assets) {
    assert.ok(!("provenance" in asset));
  }
});

test("3. without provenanceBuilder, existing fields are unchanged (backward compat)", () => {
  const result = runRenderHarness(
    { shots: ["x"], renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-compat" },
  );
  const [asset] = result.assets;
  assert.equal(typeof asset.shotId, "string");
  assert.equal(typeof asset.assetUrl, "string");
  assert.equal(typeof asset.ledgerEventId, "string");
  assert.equal(typeof asset.costCents, "number");
  assert.equal(typeof asset.durableR2Url, "string");
});

test("3. failIfProvenanceIncomplete=true without a provenanceBuilder has no effect", () => {
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      providerKeyAvailable: true,
      runId: "run-flag-no-builder",
      failIfProvenanceIncomplete: true,
    },
  );
  assert.equal(result.status, "complete");
  assert.equal(result.assets.length, 2);
});

// ---------------------------------------------------------------------------
// 4. dispatchResult.durableR2Url present → recorded on asset
// ---------------------------------------------------------------------------

const DURABLE_URL = "https://airvio.co/api/storage/media/runs/r1/render/shot-prov-1.mp4";

test("4. durableR2Url from dispatchResult is recorded on the asset (sync)", () => {
  const queueClient = queueClientWithDurableUrl(DURABLE_URL);
  const result = runRenderHarness(
    { shots: [SHOTS[0]], renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-durable", queueClient },
  );
  assert.equal(result.status, "complete");
  assert.equal(result.assets[0].durableR2Url, DURABLE_URL);
});

test("4. durableR2Url from dispatchResult is recorded on the asset (async)", async () => {
  const queueClient = {
    ...queueClientWithDurableUrl(DURABLE_URL),
    dispatch: async function({ shot }) {
      return queueClientWithDurableUrl(DURABLE_URL).dispatch({ shot });
    },
  };
  const result = await runRenderHarnessAsync(
    { shots: [SHOTS[0]], renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-durable-async", queueClient },
  );
  assert.equal(result.status, "complete");
  assert.equal(result.assets[0].durableR2Url, DURABLE_URL);
});

// ---------------------------------------------------------------------------
// 5. dispatchResult.durableR2Url absent → assetUrl used as fallback
// ---------------------------------------------------------------------------

test("5. when durableR2Url is absent from dispatchResult, assetUrl is used as the fallback (sync)", () => {
  const queueClient = queueClientWithoutDurableUrl();
  const result = runRenderHarness(
    { shots: [SHOTS[0]], renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-no-durable", queueClient },
  );
  assert.equal(result.status, "complete");
  const asset = result.assets[0];
  assert.equal(asset.durableR2Url, asset.assetUrl, "durableR2Url must fall back to assetUrl");
});

test("5. when durableR2Url is absent from dispatchResult, assetUrl is used as the fallback (async)", async () => {
  const queueClient = {
    ...queueClientWithoutDurableUrl(),
    dispatch: async function({ shot }) {
      return queueClientWithoutDurableUrl().dispatch({ shot });
    },
  };
  const result = await runRenderHarnessAsync(
    { shots: [SHOTS[0]], renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-no-durable-async", queueClient },
  );
  assert.equal(result.status, "complete");
  const asset = result.assets[0];
  assert.equal(asset.durableR2Url, asset.assetUrl);
});

// ---------------------------------------------------------------------------
// 6. Persist-before-complete: assets carry durableR2Url before step completes
// ---------------------------------------------------------------------------

test("6. assets carry durableR2Url from mock before the step is marked complete (sync)", () => {
  const durable = "https://airvio.co/api/storage/media/runs/r6/render/s1.mp4";
  const queueClient = queueClientWithDurableUrl(durable);
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-persist-before", queueClient },
  );
  assert.equal(result.status, "complete");
  for (const asset of result.assets) {
    assert.equal(asset.durableR2Url, durable, "durableR2Url must be present on every asset before step completes");
  }
});

test("6. assets carry durableR2Url from mock before the step is marked complete (async)", async () => {
  const durable = "https://airvio.co/api/storage/media/runs/r6/render/s1-async.mp4";
  const queueClient = {
    isDeterministicMock: true,
    provider: "byteplus-queue",
    async dispatch({ shot }) {
      return {
        assetUrl: `r2://agenticgraph-media/strytree/generation/job-${shot.shotId}/video.json`,
        durableR2Url: durable,
        provider: "byteplus-queue",
        costCents: 10,
      };
    },
  };
  const result = await runRenderHarnessAsync(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    { providerKeyAvailable: true, runId: "run-persist-before-async", queueClient },
  );
  assert.equal(result.status, "complete");
  for (const asset of result.assets) {
    assert.equal(asset.durableR2Url, durable);
  }
});

test("6. durableR2Url is present on all assets even with provenanceBuilder attached (sync)", () => {
  const durable = "https://airvio.co/api/storage/media/runs/r6prov/render/s.mp4";
  const queueClient = queueClientWithDurableUrl(durable);
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: validRenderToken() },
    {
      providerKeyAvailable: true,
      runId: "run-both",
      queueClient,
      provenanceBuilder: completeProvenanceBuilder,
    },
  );
  assert.equal(result.status, "complete");
  for (const asset of result.assets) {
    assert.equal(asset.durableR2Url, durable);
    assert.ok("provenance" in asset);
  }
});
