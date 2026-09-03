import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMultiCameraSimulation,
  buildVideoAgentNegotiation,
  buildVisualReviewPackets,
  runVideoRemix,
} from "../video-remix-runtime.js";

test("multi-camera coverage varies cameras while preserving one action-beat blocking model", () => {
  const blocking = {
    characters: {
      lead: { x: -1, y: 0, z: 2, facingDegrees: 90 },
      witness: { x: 1, y: 0, z: 2, facingDegrees: 270 },
    },
    background: { location: "archive", practicalLights: ["desk-lamp", "window"] },
  };
  const result = buildMultiCameraSimulation({
    profile: { cameraCount: 3, actionAxisDegrees: 20 },
    plannedShots: [
      { shotId: "shot-1", sceneId: "archive", actionBeatId: "reveal", characterIds: ["lead", "witness"], spatialBlocking: blocking, renderPrompt: "master reveal" },
      { shotId: "shot-2", sceneId: "archive", actionBeatId: "reveal", characterIds: ["lead", "witness"], renderPrompt: "lead coverage" },
      { shotId: "shot-3", sceneId: "archive", actionBeatId: "reveal", characterIds: ["lead", "witness"], renderPrompt: "witness reaction" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.coverage.distinctCameraCount, 3);
  assert.deepEqual(result.shots[1].spatialBlocking, result.shots[0].spatialBlocking);
  assert.deepEqual(result.shots[2].spatialBlocking, result.shots[0].spatialBlocking);
  assert.match(result.shots[2].renderPrompt, /Preserve character blocking/);
  assert.match(result.shots[2].renderPrompt, /Preserve scene background/);
});

test("scene rig respects the action-axis side and minimum cut-angle bound", () => {
  const result = buildMultiCameraSimulation({
    profile: { cameraCount: 8, actionAxisDegrees: 0, minimumCutAngleDegrees: 30, allowAxisCrossing: false },
    plannedShots: Array.from({ length: 8 }, (_, index) => ({ shotId: `shot-${index + 1}`, sceneId: "stage", actionBeatId: "beat" })),
  });
  const rig = result.sceneRigs[0];
  assert.ok(rig.effectiveCameraCount <= rig.requestedCameraCount);
  assert.ok(rig.cameras.every((camera) => camera.sideOfActionAxis === "primary"));
  for (let index = 1; index < rig.cameras.length; index += 1) {
    const previous = rig.cameras[index - 1].azimuthDegrees;
    const current = rig.cameras[index].azimuthDegrees;
    const separation = (current - previous + 360) % 360;
    assert.ok(separation >= 30);
  }
});

test("character or background discontinuity within one scene blocks camera-director approval", () => {
  const result = buildMultiCameraSimulation({
    plannedShots: [
      {
        shotId: "shot-1",
        sceneId: "room",
        actionBeatId: "conversation",
        characterIds: ["lead"],
        spatialBlocking: { characters: { lead: { x: 0, y: 0, z: 0 } }, background: { wall: "blue" } },
      },
      {
        shotId: "shot-2",
        sceneId: "room",
        actionBeatId: "conversation",
        characterIds: ["lead"],
        spatialBlocking: { characters: { lead: { x: 4, y: 0, z: 0 } }, background: { wall: "red" } },
      },
    ],
  });
  const negotiation = buildVideoAgentNegotiation({
    multiCameraDesign: result,
    storyboardDesign: { ok: true, issues: [] },
    narrative: { coherence: { ok: true, unresolvedDependencies: [] }, scriptRetention: { ok: true }, retrieval: { coverage: 1 } },
    continuity: { ok: true, issues: [] },
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "character_blocking_discontinuity"));
  assert.ok(result.issues.some((issue) => issue.code === "scene_background_discontinuity"));
  assert.equal(negotiation.decision, "block");
});

test("Director persists camera rigs into AGENTIC_OS, checkpoints, provider prompts, and VLM expectations", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference",
    brief: "Multi-camera archive conversation",
    mode: "dry-run",
    budgetUsd: 1,
    sourceCards: [
      { sourceId: "source-1", url: "https://a.example" },
      { sourceId: "source-2", url: "https://b.example" },
      { sourceId: "source-3", url: "https://c.example" },
    ],
    shotCount: 3,
    workflow: { storyboardProfile: { multiCamera: { cameraCount: 2, actionAxisDegrees: 45 } } },
  });
  const shot = payload.storyboard.plannedShots[0];
  assert.equal(payload.workflow.multiCameraDesign.sceneRigs[0].cameras.length, 2);
  assert.equal(payload.workflow.checkpoint.multiCameraDesign.ok, true);
  assert.equal(payload.storyboard.flow.nodes[0].cameraAssignment.cameraId, shot.cameraAssignment.cameraId);
  assert.match(shot.renderPrompt, /remain on primary side of action axis/);

  const packets = buildVisualReviewPackets({
    plannedShots: [shot],
    assets: [{ shotId: shot.shotId, assetUrl: "https://asset.example/shot.mp4" }],
    continuity: { states: [{ shotId: shot.shotId, characterStates: {} }] },
  });
  assert.equal(packets[0].expectedContinuity.cameraAssignment.cameraId, shot.cameraAssignment.cameraId);
  assert.deepEqual(packets[0].expectedContinuity.spatialBlocking, shot.spatialBlocking);
});
