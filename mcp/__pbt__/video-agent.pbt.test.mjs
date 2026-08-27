import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  RENDER_GATE_ID,
  checkNarrativeCoherence,
  wrapChatClientWithTokenCeiling,
  buildEditManifest,
  validateEditManifestTrims,
  runRenderHarness,
  runVideoRemix,
} from "../video-remix-runtime.js";
import {
  adaptBytePlusVideoProviderToRenderClient,
  resolveStageClients,
  resolveGateClientDeps,
} from "../video-remix/live-clients.js";
import { validateCostLog } from "../../contracts/cost-log.schema.js";
import { validateCreditLedgerEvent } from "../../contracts/credit-ledger.schema.js";

const RUNS = 100;
const sourceCards = [
  { sourceId: "s1", url: "https://a.example" },
  { sourceId: "s2", url: "https://b.example" },
  { sourceId: "s3", url: "https://c.example" },
];
const approvals = ["paid-model-call", "render-action", "cloud-deploy", "payment-action"];

function liveArgs(extra = {}) {
  return {
    referenceUrl: "https://example.com/ref",
    brief: "Video agent property run",
    mode: "live",
    budgetUsd: 10,
    approvals,
    sourceCards,
    runId: "video-agent-pbt",
    ...extra,
  };
}

function renderToken() {
  return { gateId: RENDER_GATE_ID, issuedAt: Date.now(), consumed: false, verified: true };
}

test("Property 1: Narrative_Coherence_Check correctness", () => {
  fc.assert(fc.property(
    fc.array(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 0, maxLength: 30 }),
    (ids) => {
      const shots = ids.map((shotId) => ({ shotId }));
      const result = checkNarrativeCoherence(shots);
      const normalized = ids.map((value) => value.trim()).filter(Boolean);
      const repeated = new Set();
      for (let index = 1; index < normalized.length; index += 1) {
        if (normalized[index] === normalized[index - 1]) repeated.add(normalized[index]);
      }
      assert.equal(result.ok, repeated.size === 0);
      assert.deepEqual(new Set(result.repeatedShotIds), repeated);
    },
  ), { numRuns: RUNS });
});

test("Property 2: Render dispatch prompt is byte-identical and unplanned shots are logged", async () => {
  await fc.assert(fc.asyncProperty(
    fc.string({ minLength: 1, maxLength: 80 }),
    async (prompt) => {
      const calls = [];
      const client = adaptBytePlusVideoProviderToRenderClient({
        provider: "byteplus-queue",
        async dispatch(args) {
          calls.push(args);
          return { ok: true, durableR2Url: "r2://asset", objectKey: "asset", bucket: "agenticgraph-media" };
        },
      });
      await client.dispatch({ runId: "r", shot: { shotId: "unplanned", prompt, unplanned: true } });
      assert.equal(calls[0].prompt, prompt);
      assert.equal(client.dispatchLog[0].type, "unplannedShotDispatch");
      assert.equal(client.dispatchLog[0].prompt, prompt);
    },
  ), { numRuns: RUNS });
});

test("Property 3: BytePlus is default live render route and Strytree stays explicit", () => {
  const byteplus = resolveStageClients(
    { AGENTICGRAPH_LIVE_CLIENTS: "1", AI_GATEWAY_VIDEO_URL: "https://gateway.example/video", BYTEPLUS_API_KEY: "k" },
    { fetchImpl: async () => ({ status: 200 }), mediaPersister: { persist: async () => ({ durableR2Url: "r2://x", objectKey: "x" }) } },
  );
  const strytree = resolveStageClients(
    { AGENTICGRAPH_LIVE_CLIENTS: "1", RENDER_PROVIDER: "strytree", STRYTREE_RENDER_URL: "https://render.example" },
    { fetchImpl: async () => ({ status: 200 }) },
  );
  assert.equal(byteplus.renderClient.provider, "byteplus-queue");
  assert.notEqual(strytree.renderClient.provider, "byteplus-queue");
});

test("Property 4: resolveStageClients constructs no second video-generation client", () => {
  const clients = resolveStageClients(
    { AGENTICGRAPH_LIVE_CLIENTS: "1", AI_GATEWAY_VIDEO_URL: "https://gateway.example/video", BYTEPLUS_API_KEY: "k" },
    { fetchImpl: async () => ({ status: 200 }), mediaPersister: { persist: async () => ({ durableR2Url: "r2://x", objectKey: "x" }) } },
  );
  const deps = resolveGateClientDeps(clients);
  assert.ok(clients.renderClient);
  assert.equal(deps.renderDeps.queueClient, clients.renderClient);
  assert.equal("secondaryRenderClient" in clients, false);
});

test("Property 5: incomplete BytePlus config produces zero render client invocations", () => {
  const clients = resolveStageClients(
    { AGENTICGRAPH_LIVE_CLIENTS: "1", AI_GATEWAY_VIDEO_URL: "https://gateway.example/video" },
    { fetchImpl: async () => { throw new Error("must not call"); } },
  );
  assert.equal(clients.renderClient, null);
  assert.equal(resolveGateClientDeps(clients).renderDeps.queueClient, undefined);
});

test("Property 6: complete Video_Agent run returns durable render/edit references", () => {
  const { payload } = runVideoRemix(liveArgs());
  assert.ok(payload.render.assets.length > 0);
  assert.ok(payload.render.assets.every((asset) => asset.assetUrl || asset.durableR2Url || asset.storageUri));
  assert.ok(payload.edit.editedVideoReference.durableR2Url.includes("/api/storage/media/runs/"));
});

test("Property 7: every Credit_Ledger event emitted by render validates", () => {
  const { payload } = runVideoRemix(liveArgs());
  assert.ok(payload.videoAgent.creditLedgerEvents.length > 0);
  assert.ok(payload.videoAgent.creditLedgerEvents.every((event) => validateCreditLedgerEvent(event).valid));
});

test("Property 8: render dispatch reports the 5s deadline invariant", () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 10_000 }), (elapsedMs) => {
    const result = runRenderHarness(
      { shots: [{ shotId: "s", prompt: "p" }], renderGateToken: renderToken() },
      { providerKeyAvailable: true, dispatchElapsedMs: elapsedMs },
    );
    assert.equal(result.dispatchWithinDeadline, elapsedMs <= result.dispatchDeadlineMs);
  }), { numRuns: RUNS });
});

test("Property 9: Edit_Manifest order and trim defaults", () => {
  fc.assert(fc.property(
    fc.array(fc.string({ minLength: 1, maxLength: 8 }).filter((value) => value.trim()), { minLength: 1, maxLength: 20 }),
    (ids) => {
      const uniqueIds = [...new Set(ids.map((value) => value.trim()))];
      const manifest = buildEditManifest({
        plannedShots: uniqueIds.map((shotId) => ({ shotId })),
        renderAssets: uniqueIds.flatMap((shotId) => [
          { shotId, assetUrl: `r2://old/${shotId}`, durationMs: 10 },
          { shotId, assetUrl: `r2://new/${shotId}`, durationMs: 20 },
        ]),
      });
      assert.deepEqual(manifest.entries.map((entry) => entry.shotId), uniqueIds);
      assert.ok(manifest.entries.every((entry) => entry.assetUrl.startsWith("r2://new/")));
      assert.ok(manifest.entries.every((entry) => entry.trim.startMs === 0 && entry.trim.endMs === 20));
    },
  ), { numRuns: RUNS });
});

test("Property 10: Edit_Manifest trim validation returns structured invalid results", () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 10_000 }),
    fc.integer({ min: -1000, max: 20_000 }),
    fc.integer({ min: -1000, max: 20_000 }),
    (durationMs, startMs, endMs) => {
      const result = validateEditManifestTrims({ entries: [{ shotId: "shot", trim: { startMs, endMs } }] }, { shot: durationMs });
      const valid = startMs >= 0 && endMs > startMs && startMs <= durationMs && endMs <= durationMs;
      assert.equal(result.valid, valid);
      if (!valid) assert.equal(result.shotId, "shot");
    },
  ), { numRuns: RUNS });
});

test("Property 11: blocked edit blocks publish", () => {
  const { payload } = runVideoRemix(liveArgs({
    mediaPersister: { persist: () => { throw new Error("persist failed"); } },
  }));
  assert.equal(payload.edit.blocksPublish, true);
  assert.deepEqual(payload.commerce.publish.publishedUrls, []);
  assert.equal(payload.stages.find((stage) => stage.id === "publish").status, "blocked");
});

test("Property 12: fixed stage order is preserved", () => {
  fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 50 }).filter((value) => value.trim()), (brief) => {
    const { payload } = runVideoRemix({ referenceUrl: "https://example.com/ref", brief, mode: "dry-run", budgetUsd: 1 });
    assert.deepEqual(payload.stages.map((stage) => stage.id), ["research", "storyboard", "render", "edit", "publish", "checkout"]);
  }), { numRuns: RUNS });
});

test("Property 13: Token_Budget_Ceiling zero behaves as no ceiling", async () => {
  await fc.assert(fc.asyncProperty(fc.integer({ min: 0, max: 5000 }), async (tokens) => {
    let degraded = 0;
    const client = wrapChatClientWithTokenCeiling({
      async plan() { return { shots: [{ prompt: "x" }], costLog: { prompt_tokens: tokens, completion_tokens: tokens } }; },
    }, { ceiling: 0, onDegrade: () => { degraded += 1; } });
    const result = await client.plan({});
    assert.equal(result.shots.length, 1);
    assert.equal(degraded, 0);
  }), { numRuns: RUNS });
});

test("Property 14: Token_Budget_Ceiling enters degraded mode at ceiling", async () => {
  await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 1000 }), async (ceiling) => {
    let event = null;
    const client = wrapChatClientWithTokenCeiling({
      async plan() {
        return { shots: [{ prompt: "x" }, { prompt: "y" }], costLog: { prompt_tokens: "unknown", completion_tokens: 0 } };
      },
    }, { ceiling, onDegrade: (value) => { event = value; } });
    await client.plan({});
    assert.deepEqual(event, { plannedShotCountAtDegradation: 2 });
    assert.equal(client.tokenBudget.degraded(), true);
  }), { numRuns: RUNS });
});

test("Property 15: live without approvals halts before paid calls", () => {
  const { payload } = runVideoRemix(liveArgs({ approvals: [] }));
  assert.equal(payload.state, "blocked");
  assert.equal(payload.budgetMeters.paidProviderCalls, 0);
  assert.equal(payload.budgetMeters.estimatedCostUsd, 0);
});

test("Property 16: edit-manifest-assembly is zero-spend and catalog-only", () => {
  const { payload } = runVideoRemix(liveArgs());
  const editGate = payload.approvalGates.find((gate) => gate.id === "edit-manifest-assembly");
  assert.equal(editGate.actionKind, "zero_spend_edit");
  assert.equal(payload.stages.find((stage) => stage.id === "edit").artifact, undefined);
});

test("Property 17: Editing_Stage retry exhaustion uses the shared counter", () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), (maxIterations) => {
    const { payload } = runVideoRemix(liveArgs({
      mediaPersister: { persist: () => { throw new Error("edit persist unavailable"); } },
      maxIterations,
    }));
    const failure = payload.failureHandling.failures.find((entry) => entry.stageId === "edit");
    assert.equal(failure.finalRetryCount, maxIterations);
    assert.equal(failure.reason, "retry_exhausted_after_max_iterations");
    assert.equal(payload.state, "blocked");
    assert.deepEqual(payload.commerce.publish.publishedUrls, []);
  }), { numRuns: RUNS });
});

test("Property 18: video ledger introduces no second currency field", () => {
  const { payload } = runVideoRemix(liveArgs());
  assert.ok(payload.videoAgent.creditLedgerEvents.every((event) => !("currency" in event)));
});

test("Property 19: every emitted Video_Agent Cost_Log validates", () => {
  const { payload } = runVideoRemix(liveArgs());
  assert.ok(payload.videoAgent.costLogs.length > 0);
  assert.ok(payload.videoAgent.costLogs.every((entry) => validateCostLog(entry).valid));
});

test("Property 20: budget meters aggregate emitted spend events", () => {
  const { payload } = runVideoRemix(liveArgs());
  const check = payload.validation.checks.find((entry) => entry.id === "budget_meters_reflect_cumulative_spend_events");
  assert.equal(check.ok, true);
  assert.equal(payload.guardrails.budgetMetersUpdatedSynchronously, true);
});

test("Property 21: Video_Agent adds no datastore dependency and persists edit exactly once", () => {
  const { payload } = runVideoRemix(liveArgs());
  assert.equal(payload.videoAgent.editManifestPersistCallCount, 1);
  assert.equal(payload.edit.editedVideoReference.contentType, "application/json");
  assert.equal("databaseUrl" in payload.videoAgent, false);
});
