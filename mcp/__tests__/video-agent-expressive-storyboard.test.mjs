import test from "node:test";
import assert from "node:assert/strict";

import {
  CINEMATOGRAPHY_GRAMMAR,
  buildExpressiveStoryboard,
  buildVideoAgentNegotiation,
  runVideoRemix,
} from "../video-remix-runtime.js";
import { adaptBytePlusVideoProviderToRenderClient } from "../video-remix/live-clients.js";

test("expressive storyboard conditions cinematography and render direction on operator and audience input", () => {
  const result = buildExpressiveStoryboard({
    profile: {
      userRequirements: "Keep the mystery legible without rapid camera changes",
      targetAudience: {
        description: "museum visitors encountering the story without prior context",
        viewingContext: "large silent gallery display",
        accessibilityNeeds: ["reduced camera motion"],
      },
      tone: "restrained suspense",
      visualStyle: "naturalistic",
      aspectRatio: "16:9",
      pace: "measured",
      motionIntensity: 0.15,
    },
    plannedShots: [
      { shotId: "shot-1", prompt: "Establish the archive" },
      { shotId: "shot-2", prompt: "The curator reveals the letter", dialogueUnitIds: ["script-unit-2"] },
      { shotId: "shot-3", prompt: "Resolve on the sealed room" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.profile.targetAudience.viewingContext, "large silent gallery display");
  assert.equal(result.shots[1].cinematography.cameraAngle, "over-the-shoulder");
  assert.match(result.shots[1].renderPrompt, /restrained suspense/);
  assert.match(result.shots[1].renderPrompt, /museum visitors/);
  assert.ok(result.shots.every((shot) => CINEMATOGRAPHY_GRAMMAR.shotSizes.includes(shot.cinematography.shotSize)));
});

test("accelerating pace creates an explicit decreasing-duration rhythm curve", () => {
  const result = buildExpressiveStoryboard({
    profile: { pace: "accelerating", shotDuration: { minSeconds: 1, maxSeconds: 10 } },
    plannedShots: Array.from({ length: 5 }, (_, index) => ({ shotId: `shot-${index + 1}`, prompt: `beat ${index + 1}` })),
  });
  const durations = result.rhythm.intensityCurve.map((entry) => entry.durationSeconds);
  assert.ok(durations.every((duration, index) => index === 0 || duration <= durations[index - 1]));
  assert.equal(result.rhythm.totalDurationSeconds, Number(durations.reduce((sum, duration) => sum + duration, 0).toFixed(2)));
});

test("unsupported cinematography language blocks specialist approval", () => {
  const storyboardDesign = buildExpressiveStoryboard({
    profile: { pace: "chaotic" },
    plannedShots: [{ shotId: "shot-1", prompt: "opening", cinematography: { shotSize: "impossible-shot" } }],
  });
  const negotiation = buildVideoAgentNegotiation({
    storyboardDesign,
    narrative: { coherence: { ok: true, unresolvedDependencies: [] }, scriptRetention: { ok: true }, retrieval: { coverage: 1 } },
    continuity: { ok: true, issues: [] },
  });

  assert.equal(storyboardDesign.ok, false);
  assert.ok(storyboardDesign.issues.some((issue) => issue.code === "unsupported_storyboard_pace"));
  assert.ok(storyboardDesign.issues.some((issue) => issue.code === "unsupported_cinematography_term"));
  assert.equal(negotiation.decision, "block");
});

test("Director checkpoints expressive design and render adapter uses its composed prompt", async () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference",
    brief: "Audience-shaped storyboard",
    mode: "dry-run",
    budgetUsd: 1,
    sourceCards: [
      { sourceId: "source-1", url: "https://a.example" },
      { sourceId: "source-2", url: "https://b.example" },
      { sourceId: "source-3", url: "https://c.example" },
    ],
    shotCount: 3,
    workflow: {
      storyboardProfile: {
        userRequirements: "Prioritize environmental scale",
        targetAudience: { description: "science center families" },
        pace: "dynamic",
      },
    },
  });
  const shot = payload.storyboard.plannedShots[0];
  assert.equal(payload.workflow.storyboardDesign.rhythm.beatCount, 3);
  assert.equal(payload.workflow.checkpoint.storyboardDesign.profile.targetAudience.description, "science center families");
  assert.match(shot.renderPrompt, /Prioritize environmental scale/);
  assert.match(payload.storyboard.canvasDocumentMarkdown, /cinematography:/);
  assert.equal(payload.storyboard.flow.nodes[0].cinematography.shotSize, shot.cinematography.shotSize);

  let dispatchedPrompt = "";
  const client = adaptBytePlusVideoProviderToRenderClient({
    async dispatch(args) {
      dispatchedPrompt = args.prompt;
      return { ok: true, durableR2Url: "r2://asset", objectKey: "asset", bucket: "agentic-graph-media" };
    },
  });
  await client.dispatch({ runId: "expressive", shot });
  assert.equal(dispatchedPrompt, shot.renderPrompt);
  assert.notEqual(dispatchedPrompt, shot.prompt);
});
