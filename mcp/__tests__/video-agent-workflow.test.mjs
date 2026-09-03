import { test } from "node:test";
import assert from "node:assert/strict";

import {
  compactWorkflowContext,
  runVideoRemix,
  runVideoRemixAsync,
  runWithBoundedRetry,
} from "../video-remix-runtime.js";

const sourceCards = [
  { sourceId: "source-a", url: "https://a.example" },
  { sourceId: "source-b", url: "https://b.example" },
  { sourceId: "source-c", url: "https://c.example" },
];

function liveArgs(extra = {}) {
  return {
    referenceUrl: "https://example.com/reference",
    brief: "A source-backed short film",
    mode: "live",
    budgetUsd: 10,
    approvals: ["paid-model-call", "render-action", "cloud-deploy", "payment-action"],
    sourceCards,
    shotCount: 2,
    runId: "workflow-test",
    ...extra,
  };
}

test("planning and revision pause before render while preserving editable prompts", () => {
  const { payload } = runVideoRemix(liveArgs({
    workflow: {
      action: "revise",
      sessionId: "creative-session",
      revision: { note: "Tighten the opening", shotPrompts: { "shot-1": "Open on the decisive visual beat" } },
      context: {
        characterBudget: 20,
        entries: [
          { role: "operator", content: "discard this older context" },
          { role: "operator", content: "retain latest" },
        ],
      },
    },
  }));

  assert.equal(payload.state, "awaiting_review");
  assert.equal(payload.render.assets.length, 0);
  assert.equal(payload.budgetMeters.providerSpendCents, 0);
  assert.equal(payload.storyboard.plannedShots[0].prompt, "Open on the decisive visual beat");
  assert.equal(payload.workflow.revisionNumber, 1);
  assert.equal(payload.workflow.context.droppedCount, 1);
  assert.equal(payload.workflow.checkpoint.pendingShotCount, 2);
});

test("portrait reference metadata fails closed before render dispatch", () => {
  let dispatchCalls = 0;
  const { payload } = runVideoRemix(liveArgs({
    workflow: {
      action: "render",
      referenceImages: [{ id: "character-reference", width: 900, height: 1600 }],
    },
    renderDeps: {
      providerKeyAvailable: true,
      queueClient: {
        provider: "test-renderer",
        dispatch() {
          dispatchCalls += 1;
          return { assetUrl: "r2://unexpected", costCents: 1 };
        },
      },
    },
  }));

  assert.equal(payload.state, "blocked");
  assert.equal(dispatchCalls, 0);
  assert.equal(payload.workflow.renderGuard.ok, false);
  assert.equal(payload.validation.checks.find((check) => check.id === "landscape_reference_guard_blocks_render").ok, true);
});

test("resume reuses completed assets and dispatches only pending shots", () => {
  const dispatchedShotIds = [];
  const { payload } = runVideoRemix(liveArgs({
    workflow: {
      action: "resume",
      sessionId: "resume-session",
      checkpoint: {
        sessionId: "resume-session",
        revisionNumber: 2,
        renderAssets: [{ shotId: "shot-1", assetUrl: "r2://existing/shot-1", durationMs: 1000 }],
      },
    },
    renderDeps: {
      providerKeyAvailable: true,
      queueClient: {
        provider: "test-renderer",
        dispatch({ shot }) {
          dispatchedShotIds.push(shot.shotId);
          return { assetUrl: `r2://new/${shot.shotId}`, costCents: 5, provider: "test-renderer" };
        },
      },
    },
  }));

  assert.deepEqual(dispatchedShotIds, ["shot-2"]);
  assert.deepEqual(payload.render.assets.map((asset) => asset.shotId), ["shot-1", "shot-2"]);
  assert.equal(payload.workflow.resume.reusedShotCount, 1);
  assert.equal(payload.workflow.checkpoint.completeShotCount, 2);
  assert.equal(payload.workflow.checkpoint.pendingShotCount, 0);
});

test("bounded retry records transient attempts and stops after success", async () => {
  let calls = 0;
  const result = await runWithBoundedRetry(async () => {
    calls += 1;
    if (calls < 3) throw new Error("transient");
    return "ok";
  }, { maxIterations: 5, wait: async () => {} });

  assert.equal(result.ok, true);
  assert.equal(result.value, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(result.attempts.map((entry) => entry.status), ["retry_scheduled", "retry_scheduled", "complete"]);
});

test("live planning produces script, characters, storyboard, and rendered shots through native clients", async () => {
  const mediaPersister = {
    async persist({ runId, stageId, shotId, ext, contentType }) {
      return {
        durableR2Url: `https://storage.example/runs/${runId}/${stageId}/${shotId}.${ext}`,
        objectKey: `runs/${runId}/${stageId}/${shotId}.${ext}`,
        contentHash: `${stageId}-${shotId}`,
        contentType,
      };
    },
  };
  const result = await runVideoRemixAsync(liveArgs({ shotCount: 1 }), {
    mediaPersister,
    env: {
      AGENTIC_OS_LIVE_CLIENTS: "1",
      AI_GATEWAY_CHAT_URL: "https://gateway.example/chat",
      AI_GATEWAY_VIDEO_URL: "https://gateway.example/video",
      BYTEPLUS_API_KEY: "test-key",
    },
    async fetchImpl(url, init = {}) {
      if (String(url).includes("/chat")) {
        const body = JSON.parse(init.body);
        if (Array.isArray(body.messages?.[0]?.content)) {
          return {
            ok: true,
            status: 200,
            async json() {
              return { choices: [{ message: { content: JSON.stringify({ narrativeScore: 0.9, visualScore: 0.9, findings: [], proposedPrompt: "" }) } }], usage: { prompt_tokens: 8, completion_tokens: 3, cache_hits: 0 } };
            },
          };
        }
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              choices: [{ message: { content: JSON.stringify({
                script: "A character follows the evidence-backed objective.",
                characters: [{ id: "lead", name: "Lead", description: "Continuity anchor" }],
                shots: [{ prompt: "Lead enters the landscape frame", sourceCardIds: ["source-a"] }],
              }) } }],
            };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return init.method === "POST"
            ? { taskId: "video-task" }
            : { status: "complete", url: "https://provider.example/video.mp4" };
        },
      };
    },
  });

  assert.equal(result.payload.workflow.creativePlan.script.source, "model");
  assert.equal(result.payload.workflow.creativePlan.characters[0].id, "lead");
  assert.equal(result.payload.storyboard.plannedShots[0].prompt, "Lead enters the landscape frame");
  assert.equal(result.payload.render.assets.length, 1);
});

test("context compaction is deterministic and retains recent entries without summarization", () => {
  const compacted = compactWorkflowContext([
    { role: "user", content: "12345" },
    { role: "assistant", content: "67890" },
    { role: "user", content: "latest" },
  ], 11);
  assert.deepEqual(compacted.entries.map((entry) => entry.content), ["67890", "latest"]);
  assert.equal(compacted.retainedCharacters, 11);
  assert.equal(compacted.droppedCount, 1);
});
