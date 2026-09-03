import test from "node:test";
import assert from "node:assert/strict";

import {
  buildParallelShotPlan,
  buildVideoAgentNegotiation,
  projectParallelShotPlan,
  runParallelShotGeneration,
} from "../video-remix-runtime.js";
import { runVideoRemixAsync } from "../video-remix/director-live-run.js";

function shot(shotId, cameraId, sceneId = "scene-1", extra = {}) {
  return { shotId, prompt: shotId, cameraAssignment: { cameraId }, sceneId, ...extra };
}

function renderToken(now = Date.now()) {
  return { gateId: "render-action", issuedAt: now, consumed: false, verified: true };
}

test("planner batches only contiguous same-camera shots and preserves dependency boundaries", () => {
  const plan = buildParallelShotPlan({
    plannedShots: [
      shot("shot-1", "camera-a"),
      shot("shot-2", "camera-a"),
      shot("shot-3", "camera-b"),
      shot("shot-4", "camera-b", "scene-1", { dependencyShotIds: ["shot-3"] }),
      shot("shot-5", "camera-b"),
      shot("shot-6", "camera-b", "scene-2"),
    ],
    policy: { maxBatchSize: 4, maxConcurrency: 4 },
  });

  assert.deepEqual(plan.batches.map((batch) => batch.shotIds), [
    ["shot-1", "shot-2"],
    ["shot-3"],
    ["shot-4", "shot-5"],
    ["shot-6"],
  ]);
  assert.equal(plan.batches[0].mode, "parallel");
  assert.equal(plan.shots[1].parallelShot.batchId, "render-batch-1");
  const reused = buildParallelShotPlan({ plannedShots: plan.shots, policy: plan.policy, priorPlan: plan });
  assert.equal(reused.reused, true);
  assert.deepEqual(reused.batches, plan.batches);

  const invalid = buildParallelShotPlan({ plannedShots: [
    shot("shot-1", "camera-a", "scene-1", { dependencyShotIds: ["shot-2"] }),
    shot("shot-2", "camera-a"),
  ] });
  const negotiation = buildVideoAgentNegotiation({ parallelShotPlan: invalid });
  assert.equal(invalid.issues[0].code, "forward_render_dependency");
  assert.equal(negotiation.proposals.find((entry) => entry.agentId === "render_scheduler").status, "block");
});

test("same-camera batch renders concurrently while preserving storyboard result order", async () => {
  const shots = [shot("shot-1", "camera-a"), shot("shot-2", "camera-a"), shot("shot-3", "camera-a")];
  const plan = buildParallelShotPlan({ plannedShots: shots, policy: { maxConcurrency: 3, maxCostCentsPerShot: 10 } });
  let active = 0;
  let maxActive = 0;
  const now = Date.now();
  const result = await runParallelShotGeneration({
    shots,
    plan,
    runId: "parallel-run",
    now,
    budgetCapCents: 100,
    renderTokenFactory: () => renderToken(now),
    renderDeps: {
      providerKeyAvailable: true,
      queueClient: {
        provider: "test-video",
        async dispatch({ shot: dispatchedShot }) {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await Promise.resolve();
          active -= 1;
          return { assetUrl: `https://assets.example/${dispatchedShot.shotId}.mp4`, provider: "test-video", costCents: 10 };
        },
      },
    },
  });

  assert.equal(result.status, "complete");
  assert.equal(maxActive, 3);
  assert.equal(result.parallelExecution.maxObservedConcurrency, 3);
  assert.deepEqual(result.assets.map((asset) => asset.shotId), ["shot-1", "shot-2", "shot-3"]);
  assert.equal(result.providerSpendCents, 30);
});

test("parallel failure settles its in-flight batch and prevents later batches", async () => {
  const shots = [shot("shot-1", "camera-a"), shot("shot-2", "camera-a"), shot("shot-3", "camera-b")];
  const plan = buildParallelShotPlan({ plannedShots: shots, policy: { maxConcurrency: 2, maxCostCentsPerShot: 10 } });
  const calls = [];
  const now = Date.now();
  const result = await runParallelShotGeneration({
    shots,
    plan,
    runId: "parallel-failure",
    now,
    budgetCapCents: 100,
    renderTokenFactory: () => renderToken(now),
    renderDeps: {
      providerKeyAvailable: true,
      queueClient: {
        provider: "test-video",
        async dispatch({ shot: dispatchedShot }) {
          calls.push(dispatchedShot.shotId);
          if (dispatchedShot.shotId === "shot-2") throw new Error("candidate failed");
          return { assetUrl: `https://assets.example/${dispatchedShot.shotId}.mp4`, provider: "test-video", costCents: 10 };
        },
      },
    },
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(calls, ["shot-1", "shot-2"]);
  assert.deepEqual(result.assets.map((asset) => asset.shotId), ["shot-1"]);
  assert.equal(result.failure.shotId, "shot-2");
});

test("resume projection retains original batch boundaries and removes completed shots", () => {
  const shots = [shot("shot-1", "camera-a"), shot("shot-2", "camera-a"), shot("shot-3", "camera-a"), shot("shot-4", "camera-b")];
  const plan = buildParallelShotPlan({ plannedShots: shots, policy: { maxBatchSize: 4 } });
  const projected = projectParallelShotPlan(plan, shots.slice(2));

  assert.deepEqual(projected.batches.map((batch) => batch.shotIds), [["shot-3"], ["shot-4"]]);
  assert.equal(projected.coverage.parallelShotCount, 0);
  assert.equal(projected.shots.some((entry) => entry.shotId === "shot-1"), false);
});

test("Director checkpoints parallel execution and AGENTIC_OS batch assignments", async () => {
  let active = 0;
  let maxActive = 0;
  const renderClient = {
    isDeterministicMock: false,
    requiresAsyncHarness: true,
    provider: "test-video",
    maxCostCentsPerShot: 10,
    async dispatch({ shot: dispatchedShot }) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return { assetUrl: `https://assets.example/${dispatchedShot.shotId}.mp4`, provider: "test-video", costCents: 10 };
    },
  };
  const { payload } = await runVideoRemixAsync({
    referenceUrl: "https://example.com/reference",
    brief: "Parallel same-camera sequence",
    mode: "live",
    budgetUsd: 10,
    approvals: ["paid-model-call", "render-action", "cloud-deploy", "payment-action"],
    sourceCards: [
      { sourceId: "source-1", url: "https://a.example" },
      { sourceId: "source-2", url: "https://b.example" },
      { sourceId: "source-3", url: "https://c.example" },
    ],
    shotCount: 3,
    workflow: {
      storyboardProfile: { multiCamera: { cameraCount: 1 } },
      parallelShotPolicy: { maxConcurrency: 3, maxBatchSize: 3 },
    },
  }, {
    clients: { live: true, renderClient, imageGenerationClient: null, visualReviewClient: null, commerceClient: null },
    mediaPersister: {
      async persist({ stageId, shotId }) {
        return { durableR2Url: `https://assets.example/${stageId}/${shotId}`, objectKey: `${stageId}/${shotId}` };
      },
    },
  });

  assert.equal(maxActive, 3);
  assert.equal(payload.videoAgent.parallelShotExecution.maxObservedConcurrency, 3);
  assert.equal(payload.workflow.checkpoint.parallelShotExecution.parallelShotCount, 3);
  assert.ok(payload.storyboard.flow.nodes.every((node) => node.parallelShot.mode === "parallel"));
  assert.deepEqual(payload.render.assets.map((asset) => asset.shotId), ["shot-1", "shot-2", "shot-3"]);
});
