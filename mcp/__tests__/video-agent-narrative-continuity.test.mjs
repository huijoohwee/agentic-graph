import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildHierarchicalNarrativePlan,
  buildLongScriptDesign,
  buildScriptCorpus,
  buildStoryboardScriptContext,
  buildVideoAgentNegotiation,
  buildVisualContinuityLedger,
  runVideoRemix,
  runVideoRemixAsync,
  runVisualQualityMonitor,
} from "../video-remix-runtime.js";

const sourceCards = [
  { sourceId: "source-a", url: "https://a.example", title: "harbor arrival evidence" },
  { sourceId: "source-b", url: "https://b.example", title: "warehouse discovery evidence" },
  { sourceId: "source-c", url: "https://c.example", title: "departure evidence" },
];

test("long-script corpus preserves exact plot and dialogue source spans", () => {
  const script = [
    "EXT. HARBOR - NIGHT",
    "Mira reaches the flooded pier and discovers the signal lamp is still burning.",
    "Mira: We were told this light went dark ten years ago.",
    "Jon answers, “Then someone has been waiting for us.”",
  ].join("\n");
  const corpus = buildScriptCorpus(script);

  assert.equal(corpus.dialogueCount, 2);
  assert.ok(corpus.plotBeatCount >= 1);
  for (const unit of corpus.units) {
    assert.equal(script.slice(unit.sourceRange.start, unit.sourceRange.end), unit.text);
  }
  assert.ok(corpus.units.some((unit) => unit.speaker === "Mira" && unit.spokenText === "We were told this light went dark ten years ago."));
});

test("long-script design segments novel-scale input and retains every plot beat and dialogue", () => {
  const chapters = Array.from({ length: 18 }, (_, index) => [
    `SCENE ${index + 1}`,
    `Mira follows clue ${index + 1} through the archive while the approaching storm changes the stakes.`,
    `Mira: Keep clue ${index + 1}; it connects the harbor to the final chamber.`,
  ].join("\n"));
  const script = chapters.join("\n\n");
  const plannedShots = Array.from({ length: 6 }, (_, index) => ({ shotId: `shot-${index + 1}`, prompt: `clue ${index + 1}` }));
  const design = buildLongScriptDesign({ script, plannedShots, policy: { segmentCharacters: 400 } });

  assert.ok(design.segments.length > 1);
  assert.equal(design.retention.plotBeatCoverage, 1);
  assert.equal(design.retention.dialogueCoverage, 1);
  assert.equal(design.retention.ok, true);
  assert.equal(new Set(design.shotMappings.flatMap((entry) => entry.segmentIds)).size, design.segments.length);
});

test("storyboard script context compacts only on segment boundaries and reports omissions", () => {
  const design = buildLongScriptDesign({
    script: Array.from({ length: 30 }, (_, index) => `Beat ${index + 1} changes the investigation.\nLead: Dialogue ${index + 1} must remain exact.`).join("\n"),
    plannedShots: [{ shotId: "shot-1", prompt: "investigation" }],
    policy: { segmentCharacters: 400 },
  });
  const context = buildStoryboardScriptContext(design, 700);
  assert.ok(context.retainedSegmentCount > 0);
  assert.ok(context.retainedSegmentCount < context.sourceSegmentCount);
  assert.equal(context.omittedSegmentIds.length, context.sourceSegmentCount - context.retainedSegmentCount);
  assert.ok(context.entries.every((entry) => entry.content.startsWith(entry.segmentId)));
});

test("hierarchical narrative planning retrieves evidence and resolves temporal dependencies", () => {
  const result = buildHierarchicalNarrativePlan({
    script: "A lead arrives at a harbor, investigates a warehouse, then departs.",
    sourceCards,
    policy: { shotsPerAct: 2, retrievalTopK: 1 },
    plannedShots: [
      { shotId: "shot-1", prompt: "lead harbor arrival" },
      { shotId: "shot-2", prompt: "warehouse discovery" },
      { shotId: "shot-3", prompt: "departure" },
    ],
  });

  assert.deepEqual(result.hierarchy.acts.map((act) => act.sceneIds.length), [2, 1]);
  assert.equal(result.hierarchy.scenes[1].dependencies[0], "shot-1");
  assert.equal(result.hierarchy.scenes[1].retrievedSources[0].sourceId, "source-b");
  assert.equal(result.coherence.ok, true);
});

test("Director preserves extended multi-scene plans beyond the former short-clip clamp", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference",
    brief: "Extended multi-scene narrative",
    mode: "dry-run",
    budgetUsd: 1,
    sourceCards,
    shotCount: 24,
    runId: "extended-narrative",
  });
  assert.equal(payload.storyboard.plannedShots.length, 24);
  assert.equal(payload.workflow.narrative.hierarchy.acts.length, 6);
  assert.equal(payload.workflow.longScript.retention.ok, true);
  assert.ok(payload.storyboard.plannedShots.every((shot) => Array.isArray(shot.scriptUnitIds)));
});

test("continuity ledger carries state forward and flags unexplained temporal changes", () => {
  const result = buildVisualContinuityLedger({
    characters: [{ id: "lead", name: "Lead", referenceImageId: "lead-ref" }],
    referenceImages: [{ id: "lead-ref", width: 1920, height: 1080 }],
    plannedShots: [
      {
        shotId: "shot-1",
        characterIds: ["lead"],
        characterStates: { lead: { wardrobe: "blue" } },
        environmentState: { location: "harbor", time: "day" },
      },
      { shotId: "shot-2", characterIds: ["lead"] },
      {
        shotId: "shot-3",
        characterIds: ["lead"],
        characterStates: { lead: { wardrobe: "red" } },
        environmentState: { location: "warehouse", time: "night" },
      },
    ],
  });

  assert.deepEqual(result.states[1].characterStates.lead, { wardrobe: "blue" });
  assert.deepEqual(result.states[1].environmentState, { location: "harbor", time: "day" });
  assert.ok(result.issues.some((issue) => issue.code === "unexplained_character_state_change"));
  assert.ok(result.issues.some((issue) => issue.code === "unexplained_environment_change"));
});

test("specialists negotiate one bounded production decision", () => {
  const negotiation = buildVideoAgentNegotiation({
    narrative: { coherence: { ok: true, unresolvedDependencies: [] }, retrieval: { coverage: 1 } },
    continuity: { ok: true, issues: [{ severity: "warning", code: "continuity_note" }] },
    qualityReview: { status: "complete", findings: [], proposedRevisions: {} },
    maxRounds: 3,
  });
  assert.equal(negotiation.decision, "revise");
  assert.equal(negotiation.roundsCompleted, 1);
  assert.equal(negotiation.maxRounds, 3);
  assert.equal(negotiation.bounded, true);
});

test("VLM review emits targeted revisions and retains valid cost logs", async () => {
  const result = await runVisualQualityMonitor({
    packets: [{ shotId: "shot-1", prompt: "p", assetUrl: "r2://asset", expectedContinuity: {} }],
    reviewClient: {
      async review() {
        return {
          narrativeScore: 0.9,
          visualScore: 0.4,
          findings: ["wardrobe mismatch"],
          proposedPrompt: "Preserve the blue wardrobe from the prior shot",
          costLog: {
            model: "vlm-test",
            prompt_tokens: 10,
            completion_tokens: 4,
            cache_hits: 0,
            estimated_cost_usd: 0.02,
            incomplete: false,
          },
        };
      },
    },
    wait: async () => {},
    maxIterations: 2,
  });

  assert.equal(result.status, "revise");
  assert.equal(result.proposedRevisions["shot-1"], "Preserve the blue wardrobe from the prior shot");
  assert.equal(result.costLogs.length, 1);
});

test("unresolved narrative dependency produces a blocking specialist decision", () => {
  const narrative = buildHierarchicalNarrativePlan({
    script: "Dependency guard",
    sourceCards,
    plannedShots: [{ shotId: "shot-1", prompt: "opening", dependencyShotIds: ["missing"] }],
  });
  const negotiation = buildVideoAgentNegotiation({
    narrative,
    continuity: { ok: true, issues: [] },
    qualityReview: { status: "unverified", findings: [], proposedRevisions: {} },
  });
  assert.equal(narrative.coherence.ok, false);
  assert.equal(negotiation.decision, "block");
});

test("low VLM score blocks edit and persists the next-shot revision proposal", async () => {
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
  const result = await runVideoRemixAsync({
    referenceUrl: "https://example.com/reference",
    brief: "Continuity-focused short film",
    mode: "live",
    budgetUsd: 10,
    approvals: ["paid-model-call", "render-action", "cloud-deploy", "payment-action"],
    sourceCards,
    shotCount: 1,
    runId: "vlm-quality-run",
  }, {
    mediaPersister,
    visualReviewClient: {
      async review() {
        return {
          narrativeScore: 0.9,
          visualScore: 0.5,
          findings: ["environment lighting drift"],
          proposedPrompt: "Match the prior environment lighting",
          costLog: { model: "vlm-test", prompt_tokens: 8, completion_tokens: 3, cache_hits: 0, estimated_cost_usd: 0.01, incomplete: false },
        };
      },
    },
    retryWait: async () => {},
    env: {
      AGENTIC_OS_LIVE_CLIENTS: "1",
      AI_GATEWAY_CHAT_URL: "https://gateway.example/chat",
      AI_GATEWAY_VIDEO_URL: "https://gateway.example/video",
      BYTEPLUS_API_KEY: "test-key",
    },
    async fetchImpl(url, init = {}) {
      if (String(url).includes("/chat")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { choices: [{ message: { content: JSON.stringify({
              script: "The lead maintains continuity across the scene.",
              characters: [{ id: "lead", name: "Lead", description: "continuity anchor" }],
              shots: [{
                prompt: "Lead enters the harbor at day",
                sourceCardIds: ["source-a"],
                characterIds: ["lead"],
                characterStates: { lead: { wardrobe: "blue" } },
                environmentState: { location: "harbor", time: "day" },
              }],
            }) } }] };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return init.method === "POST" ? { taskId: "video-task" } : { status: "complete", url: "https://provider.example/video.mp4" };
        },
      };
    },
  });

  assert.equal(result.payload.state, "awaiting_review");
  assert.equal(result.payload.edit.status, "awaiting_quality_revision");
  assert.deepEqual(result.payload.commerce.publish.publishedUrls, []);
  assert.equal(result.payload.workflow.checkpoint.proposedRevisions["shot-1"], "Match the prior environment lighting");
  assert.equal(result.payload.videoAgent.qualityReview.status, "revise");
  assert.equal(result.payload.budgetMeters.paidProviderCalls, 4);
});
