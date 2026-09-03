import test from "node:test";
import assert from "node:assert/strict";

import {
  runVideoRemix,
  runVideoRemixAsync,
} from "../video-remix-runtime.js";
import {
  EDIT_GATE_ID,
  buildEditManifest,
  validateEditManifestTrims,
  runEditingHarness,
} from "../video-remix-runtime.js";
import {
  adaptBytePlusVideoProviderToRenderClient,
  resolveStageClients,
  resolveGateClientDeps,
} from "../video-remix/live-clients.js";
import {
  APPROVAL_GATES,
  SPEND_BEARING_STAGE_GATES,
} from "../video-remix/constants.js";

const sourceCards = [
  { sourceId: "s1", url: "https://a.example" },
  { sourceId: "s2", url: "https://b.example" },
  { sourceId: "s3", url: "https://c.example" },
];

test("runVideoRemix emits fixed Video_Agent stage order with edit manifest", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/ref",
    brief: "Launch film",
    mode: "live",
    budgetUsd: 10,
    approvals: ["paid-model-call", "render-action", "cloud-deploy", "payment-action"],
    sourceCards,
    runId: "video-agent-order",
  });

  assert.deepEqual(payload.stages.map((stage) => stage.id), [
    "research",
    "storyboard",
    "render",
    "edit",
    "publish",
    "checkout",
  ]);
  assert.equal(payload.edit.status, "complete");
  assert.equal(payload.edit.manifest.entries.length, payload.storyboard.plannedShots.length);
  assert.equal(payload.videoAgent.editManifestPersistCallCount, 1);
  assert.deepEqual(payload.commerce.publish.publishedUrls, [payload.edit.editedVideoReference.durableR2Url]);
  assert.equal(payload.storyboard.narrativeCoherence.ok, true);
});

test("edit-manifest-assembly is catalog-only and never spend-bearing", () => {
  assert.ok(APPROVAL_GATES.some((gate) => gate.id === EDIT_GATE_ID && gate.actionKind === "zero_spend_edit"));
  assert.equal(Object.values(SPEND_BEARING_STAGE_GATES).includes(EDIT_GATE_ID), false);
});

test("buildEditManifest preserves storyboard order and most-recent render asset wins", () => {
  const manifest = buildEditManifest({
    plannedShots: [{ shotId: "a" }, { shotId: "b" }],
    renderAssets: [
      { shotId: "a", assetUrl: "r2://old", durationMs: 100 },
      { shotId: "b", assetUrl: "r2://b", durationMs: 200 },
      { shotId: "a", assetUrl: "r2://new", durationMs: 300 },
    ],
    assetDurationsMs: { a: 300, b: 200 },
  });

  assert.deepEqual(manifest.entries.map((entry) => entry.shotId), ["a", "b"]);
  assert.equal(manifest.entries[0].assetUrl, "r2://new");
  assert.deepEqual(manifest.entries[0].trim, { startMs: 0, endMs: 300 });
});

test("validateEditManifestTrims rejects invalid trim boundaries", () => {
  assert.deepEqual(
    validateEditManifestTrims({
      entries: [{ shotId: "a", trim: { startMs: 10, endMs: 5 } }],
    }, { a: 100 }),
    { valid: false, shotId: "a", reason: "endMs_must_exceed_startMs" },
  );
});

test("runEditingHarness preserves manifest on persist failure", async () => {
  const result = await runEditingHarness(
    {
      plannedShots: [{ shotId: "a" }],
      renderAssets: [{ shotId: "a", assetUrl: "r2://a", durationMs: 100 }],
      assetDurationsMs: { a: 100 },
    },
    {
      runId: "edit-failure",
      mediaPersister: { persist: async () => { throw new Error("r2 down"); } },
    },
  );

  assert.equal(result.status, "failed");
  assert.equal(result.blocksPublish, true);
  assert.equal(result.manifest.entries.length, 1);
  assert.equal(result.failure.reason, "r2 down");
});

test("runVideoRemixAsync dispatches every planned shot through BytePlus video provider", async () => {
  const fetchCalls = [];
  const persistCalls = [];
  const mediaPersister = {
    async persist({ runId, stageId, shotId, ext, contentType }) {
      persistCalls.push({ runId, stageId, shotId, ext, contentType });
      return {
        durableR2Url: `https://airvio.co/api/storage/media/runs/${runId}/${stageId}/${shotId}.${ext}`,
        objectKey: `runs/${runId}/${stageId}/${shotId}.${ext}`,
        contentHash: `${stageId}-${shotId}-hash`,
        contentType,
      };
    },
  };
  const result = await runVideoRemixAsync({
    referenceUrl: "https://example.com/ref",
    brief: "BytePlus live run",
    mode: "live",
    budgetUsd: 10,
    approvals: ["paid-model-call", "render-action", "cloud-deploy", "payment-action"],
    sourceCards,
    runId: "video-agent-byteplus-live",
    shotCount: 2,
  }, {
    mediaPersister,
    env: {
      AGENTIC_OS_LIVE_CLIENTS: "1",
      AI_GATEWAY_VIDEO_URL: "https://gateway.example/video",
      BYTEPLUS_API_KEY: "test-key",
    },
    async fetchImpl(url, init = {}) {
      fetchCalls.push({ url: String(url), method: init.method || "GET" });
      return {
        ok: true,
        status: 200,
        async json() {
          return init.method === "POST"
            ? { taskId: `task-${fetchCalls.length}` }
            : { status: "complete", url: "https://provider.example/video.mp4" };
        },
      };
    },
  });
  const { payload } = result;
  const shotCount = payload.storyboard.plannedShots.length;

  assert.equal(fetchCalls.filter((call) => call.method === "POST").length, shotCount);
  assert.equal(fetchCalls.filter((call) => call.method === "GET").length, shotCount);
  assert.equal(payload.render.assets.length, shotCount);
  assert.ok(payload.render.assets.every((asset) => asset.provider === "byteplus-queue"));
  assert.ok(payload.render.assets.every((asset) => asset.durableR2Url.includes("/render/")));
  assert.equal(payload.edit.status, "complete");
  assert.equal(payload.budgetMeters.providerSpendCents > 0, true);
  assert.equal(payload.budgetMeters.paidProviderCalls, 2 + shotCount + 1);
  assert.equal(payload.videoAgent.creditLedgerEvents.length, shotCount);
  assert.equal(persistCalls.filter((call) => call.stageId === "render").length, shotCount);
  assert.equal(payload.validation.ok, true);
});

test("runVideoRemix routes real edit persist failure through shared retry exhaustion", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/ref",
    brief: "Edit failure run",
    mode: "live",
    budgetUsd: 10,
    approvals: ["paid-model-call", "render-action", "cloud-deploy", "payment-action"],
    sourceCards,
    runId: "video-agent-real-edit-failure",
    maxIterations: 7,
    mediaPersister: { persist: () => { throw new Error("r2 unavailable"); } },
  });
  const failure = payload.failureHandling.failures.find((entry) => entry.stageId === "edit");

  assert.equal(payload.state, "blocked");
  assert.equal(payload.edit.status, "failed");
  assert.equal(failure.finalRetryCount, 7);
  assert.equal(failure.reason, "retry_exhausted_after_max_iterations");
  assert.deepEqual(payload.commerce.publish.publishedUrls, []);
  assert.equal(payload.guardrails.failsClosedOnRetryExhaustion, true);
});

test("BytePlus video adapter maps render harness dispatch contract without fabricating prompt", async () => {
  const calls = [];
  const auditEvents = [];
  const client = adaptBytePlusVideoProviderToRenderClient({
    provider: "byteplus-queue",
    async dispatch(args) {
      calls.push(args);
      return {
        ok: true,
        durableR2Url: "r2://asset",
        objectKey: "runs/r/render/s.mp4",
        bucket: "agentic-graph-media",
        provider: "byteplus-queue",
      };
    },
  }, {
    onUnplannedShotDispatch(event) {
      auditEvents.push(event);
    },
  });
  const result = await client.dispatch({ runId: "r", shot: { shotId: "s", prompt: "use this", unplanned: true } });
  assert.equal(calls[0].prompt, "use this");
  assert.equal(calls[0].stageId, "render");
  assert.equal(result.assetUrl, "r2://asset");
  assert.equal(result.costCents > 0, true);
  assert.equal(client.dispatchLog[0].type, "unplannedShotDispatch");
  assert.equal(auditEvents[0].prompt, "use this");
});

test("resolveStageClients requires complete BytePlus render config before live render injection", () => {
  const partial = resolveStageClients(
    { AGENTIC_OS_LIVE_CLIENTS: "1", AI_GATEWAY_VIDEO_URL: "https://gateway.example/video" },
    { fetchImpl: async () => ({ ok: true }) },
  );
  assert.equal(partial.renderClient, null);
  assert.equal(resolveGateClientDeps(partial).renderDeps.providerKeyAvailable, undefined);

  const byteplus = resolveStageClients(
    { AGENTIC_OS_LIVE_CLIENTS: "1", AI_GATEWAY_VIDEO_URL: "https://gateway.example/video", BYTEPLUS_API_KEY: "key" },
    {
      fetchImpl: async () => ({ ok: true }),
      mediaPersister: { persist: async () => ({ durableR2Url: "r2://x", objectKey: "x", contentHash: "h" }) },
    },
  );
  assert.ok(byteplus.renderClient);
  assert.equal(resolveGateClientDeps(byteplus).renderDeps.providerKeyAvailable, true);

  const strytree = resolveStageClients(
    { AGENTIC_OS_LIVE_CLIENTS: "1", RENDER_PROVIDER: "strytree", STRYTREE_RENDER_URL: "https://render.example" },
    { fetchImpl: async () => ({ ok: true }) },
  );
  assert.ok(strytree.renderClient);
});
