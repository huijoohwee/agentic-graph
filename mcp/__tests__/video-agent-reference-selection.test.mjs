import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReferenceImageSelection,
  buildVideoAgentNegotiation,
  buildVisualReviewPackets,
  runVideoRemix,
} from "../video-remix-runtime.js";
import { adaptBytePlusVideoProviderToRenderClient } from "../video-remix/live-clients.js";

test("reference selection covers multiple characters and the current environment", () => {
  const result = buildReferenceImageSelection({
    characters: [
      { id: "lead", referenceImageId: "lead-ref" },
      { id: "guide", referenceImageId: "guide-ref" },
    ],
    referenceImages: [
      { id: "lead-ref", kind: "character", assetUrl: "https://assets.example/lead.png", entityIds: ["lead"] },
      { id: "guide-ref", kind: "character", assetUrl: "https://assets.example/guide.png", entityIds: ["guide"] },
      { id: "archive-ref", kind: "environment", assetUrl: "https://assets.example/archive.png", environmentState: { location: "archive", lighting: "night" } },
    ],
    plannedShots: [{
      shotId: "shot-1",
      sceneId: "archive",
      characterIds: ["lead", "guide"],
      spatialBlocking: { background: { location: "archive", lighting: "night" } },
      renderPrompt: "Enter the archive",
    }],
  });
  const selection = result.selections[0];

  assert.equal(result.ok, true);
  assert.deepEqual(new Set(selection.coverage.coveredCharacterIds), new Set(["lead", "guide"]));
  assert.equal(selection.coverage.environmentCovered, true);
  assert.equal(selection.selectedReferences.length, 3);
  assert.match(result.shots[0].renderPrompt, /Preserve referenced character identities/);
});

test("immediate completed storyboard asset becomes the next shot first-frame reference", () => {
  const result = buildReferenceImageSelection({
    priorAssets: [{ shotId: "shot-1", durableR2Url: "https://assets.example/timeline/shot-1.mp4" }],
    plannedShots: [
      { shotId: "shot-1", sceneId: "room", actionBeatId: "beat", renderPrompt: "master" },
      { shotId: "shot-2", sceneId: "room", actionBeatId: "beat", renderPrompt: "coverage" },
      { shotId: "shot-3", sceneId: "room", actionBeatId: "beat", renderPrompt: "reaction" },
    ],
  });

  assert.equal(result.selections[0].selectedReferences.length, 0);
  assert.equal(result.selections[1].primaryReferenceId, "timeline:shot-1");
  assert.ok(result.selections[1].selectedReferences[0].reasons.includes("immediate_previous_timeline"));
  assert.equal(result.shots[1].primaryReference.assetUrl, "https://assets.example/timeline/shot-1.mp4");
});

test("missing character or environment coverage blocks reference-curator approval", () => {
  const referenceSelection = buildReferenceImageSelection({
    policy: { requireCharacterCoverage: true, requireEnvironmentCoverage: true },
    plannedShots: [{
      shotId: "shot-1",
      characterIds: ["lead"],
      spatialBlocking: { background: { location: "unknown-room" } },
    }],
  });
  const negotiation = buildVideoAgentNegotiation({
    referenceSelection,
    multiCameraDesign: { ok: true, issues: [] },
    storyboardDesign: { ok: true, issues: [] },
    narrative: { coherence: { ok: true, unresolvedDependencies: [] }, scriptRetention: { ok: true }, retrieval: { coverage: 1 } },
    continuity: { ok: true, issues: [] },
  });

  assert.equal(referenceSelection.ok, false);
  assert.ok(referenceSelection.issues.some((issue) => issue.code === "missing_character_reference_coverage"));
  assert.ok(referenceSelection.issues.some((issue) => issue.code === "missing_environment_reference_coverage"));
  assert.equal(negotiation.decision, "block");
});

test("Director persists first-frame selection through AGENTIC_OS, provider dispatch, and VLM expectations", async () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference",
    brief: "Reference-conditioned scene",
    mode: "dry-run",
    budgetUsd: 1,
    sourceCards: [
      { sourceId: "source-1", url: "https://a.example" },
      { sourceId: "source-2", url: "https://b.example" },
      { sourceId: "source-3", url: "https://c.example" },
    ],
    shotCount: 2,
    workflow: {
      referenceImages: [{ id: "style-ref", width: 1920, height: 1080, assetUrl: "https://assets.example/style.png", kind: "style" }],
    },
  });
  const shot = payload.storyboard.plannedShots[0];
  assert.equal(payload.workflow.referenceSelection.ok, true);
  assert.equal(payload.workflow.checkpoint.referenceSelection.selections[0].primaryReferenceId, "style-ref");
  assert.equal(payload.storyboard.flow.nodes[0].primaryReference.referenceId, "style-ref");

  let providerArgs;
  const client = adaptBytePlusVideoProviderToRenderClient({
    async dispatch(args) {
      providerArgs = args;
      return { ok: true, durableR2Url: "r2://asset", objectKey: "asset", bucket: "agentic-graph-media" };
    },
  });
  await client.dispatch({ runId: "reference-run", shot });
  assert.equal(providerArgs.firstFrameImage, "https://assets.example/style.png");
  assert.deepEqual(providerArgs.referenceImages, ["https://assets.example/style.png"]);

  const packets = buildVisualReviewPackets({
    plannedShots: [shot],
    assets: [{ shotId: shot.shotId, assetUrl: "https://assets.example/output.mp4" }],
    continuity: { states: [{ shotId: shot.shotId }] },
  });
  assert.equal(packets[0].expectedContinuity.referenceSelection.primaryReferenceId, "style-ref");
});
