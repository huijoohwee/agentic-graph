import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutomatedImageGeneration,
  buildVideoAgentNegotiation,
  buildVisualReviewPackets,
  runVideoRemix,
} from "../video-remix-runtime.js";
import { adaptBytePlusVideoProviderToRenderClient } from "../video-remix/live-clients.js";

test("automated image prompt arranges multiple characters against environment anchors", () => {
  const result = buildAutomatedImageGeneration({
    characters: [{ id: "lead", name: "Lead" }, { id: "guide", name: "Guide" }],
    plannedShots: [{
      shotId: "shot-1",
      renderPrompt: "Reveal the archive",
      spatialBlocking: {
        characters: {
          lead: { x: -1, y: 0, z: 0, facingDegrees: 15 },
          guide: { x: 1, y: 0, z: 0.5, facingDegrees: 195 },
        },
        background: { doorway: "rear", desk: "center" },
      },
    }],
    referenceSelection: { selections: [{ shotId: "shot-1", selectedReferences: [{ referenceId: "archive-ref" }] }] },
  });

  assert.equal(result.ok, true);
  assert.match(result.shots[0].imagePrompt, /Condition the first frame on archive-ref/);
  assert.match(result.shots[0].imagePrompt, /Lead at \(-1, 0, 0\)/);
  assert.match(result.shots[0].imagePrompt, /Lead is left of, in front of, and within interaction distance of Guide/);
  assert.deepEqual(result.prompts[0].spatialPlan.environment, { doorway: "rear", desk: "center" });
});

test("prior-timeline visual order produces an explicit spatial transition", () => {
  const result = buildAutomatedImageGeneration({
    characters: [{ id: "lead", name: "Lead" }],
    plannedShots: [
      { shotId: "shot-1", spatialBlocking: { characters: { lead: { x: 0, y: 0, z: 0 } }, background: { room: "archive" } } },
      { shotId: "shot-2", spatialBlocking: { characters: { lead: { x: 2, y: 0, z: 1 } }, background: { room: "archive" } } },
    ],
    referenceSelection: {
      selections: [
        { shotId: "shot-1", selectedReferences: [] },
        { shotId: "shot-2", selectedReferences: [{ referenceId: "timeline:shot-1", origin: "previous_timeline", sourceShotId: "shot-1" }] },
      ],
    },
  });

  assert.equal(result.prompts[1].sourceShotId, "shot-1");
  assert.equal(result.coverage.priorTimelineConditionedCount, 1);
  assert.match(result.shots[1].imagePrompt, /Lead moves logically from \(0, 0, 0\) to \(2, 0, 1\)/);

  const resumed = buildAutomatedImageGeneration({
    characters: [{ id: "lead", name: "Lead" }],
    plannedShots: result.shots,
    referenceSelection: {
      selections: [
        { shotId: "shot-1", selectedReferences: [] },
        { shotId: "shot-2", selectedReferences: [{ referenceId: "timeline:shot-1", origin: "previous_timeline", sourceShotId: "shot-1" }] },
      ],
    },
    priorGeneration: result,
  });
  assert.equal(resumed.coverage.reusedPromptCount, 2);
  assert.equal(resumed.prompts[1].imagePrompt, result.prompts[1].imagePrompt);
});

test("strict spatial policy blocks the image prompt specialist when blocking is absent", () => {
  const imageGeneration = buildAutomatedImageGeneration({
    policy: { requireSpatialBlocking: true },
    plannedShots: [{ shotId: "shot-1", prompt: "Unblocked shot" }],
  });
  const negotiation = buildVideoAgentNegotiation({
    imageGeneration,
    referenceSelection: { ok: true, issues: [] },
    multiCameraDesign: { ok: true, issues: [] },
    storyboardDesign: { ok: true, issues: [] },
    narrative: { coherence: { ok: true, unresolvedDependencies: [] }, scriptRetention: { ok: true }, retrieval: { coverage: 1 } },
    continuity: { ok: true, issues: [] },
  });

  assert.equal(imageGeneration.ok, false);
  assert.equal(imageGeneration.issues[0].code, "missing_image_prompt_spatial_blocking");
  assert.equal(negotiation.proposals.find((entry) => entry.agentId === "image_prompt_designer").status, "block");
  assert.equal(negotiation.decision, "block");
});

test("Director persists and dispatches the generated image prompt for VLM review", async () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference",
    brief: "Spatially grounded scene",
    mode: "dry-run",
    budgetUsd: 1,
    sourceCards: [
      { sourceId: "source-1", url: "https://a.example" },
      { sourceId: "source-2", url: "https://b.example" },
      { sourceId: "source-3", url: "https://c.example" },
    ],
    shotCount: 2,
    workflow: { referenceImages: [{ id: "style-ref", width: 1920, height: 1080, assetUrl: "https://assets.example/style.png" }] },
  });
  const shot = payload.storyboard.plannedShots[0];

  assert.equal(payload.workflow.imageGeneration.ok, true);
  assert.equal(payload.workflow.checkpoint.imageGeneration.prompts[0].imagePrompt, shot.imagePrompt);
  assert.equal(payload.storyboard.flow.nodes[0].imageGeneration.imagePrompt, shot.imagePrompt);

  let providerArgs;
  const client = adaptBytePlusVideoProviderToRenderClient({
    async dispatch(args) {
      providerArgs = args;
      return { ok: true, durableR2Url: "r2://asset", objectKey: "asset", bucket: "agenticgraph-media" };
    },
  });
  await client.dispatch({ runId: "image-prompt-run", shot });
  assert.equal(providerArgs.prompt, shot.imagePrompt);
  assert.equal(providerArgs.imagePrompt, shot.imagePrompt);

  const packets = buildVisualReviewPackets({
    plannedShots: [shot],
    assets: [{ shotId: shot.shotId, assetUrl: "https://assets.example/output.mp4" }],
    continuity: { states: [{ shotId: shot.shotId }] },
  });
  assert.equal(packets[0].expectedContinuity.imageGeneration.imagePrompt, shot.imagePrompt);
});
