// Unit tests for the Storyboard_Harness reasoning-failure FALLBACK path
// (agentic-graph-acos-mcp-connector spec, task 3.7 / R7.5 / Property 14).
//
// R7.5: IF storyboard reasoning fails, THEN THE Storyboard_Harness SHALL emit a
// fallback Kgc_Document containing exactly ONE `flow.nodes[]` entry that
// validates against `kgc-computing-flow/v1` and satisfies the round-trip
// property of R7.3, and SHALL return an indication that fallback content was
// substituted.
//
// These example-based asserts cover the fallback path added in task 3.7: a
// reasoning FAILURE (the injected chat client THROWS or its result SIGNALS
// failure) emits a single-node Kgc_Document that validates + round-trips, with
// `fallbackSubstituted:true`. The success path (3.5) and the reject path (3.6)
// live in `storyboard-harness.test.mjs` and stay intact. This is the
// implementation seam for Property 14; the consolidated property-based test
// lands in task 9.1. (Split into its own file so each test file stays under the
// 600-line ceiling.)

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runStoryboardHarness,
  validateKgcComputingFlowV1,
  STORYBOARD_STATUS_COMPLETE,
  STORYBOARD_STATUS_REJECTED,
  STORYBOARD_STATUS_FALLBACK,
  FALLBACK_SHOT_COUNT,
  reasoningSignaledFailure,
  buildFallbackStoryboardDocument,
  flowRoundTripEquivalent,
  KGC_COMPUTING_FLOW_SCHEMA,
} from "../video-remix-runtime.js";

function evidencePackOf(count) {
  const sources = Array.from({ length: count }, (_, index) => ({
    sourceId: `src-${index + 1}`,
    url: `https://example.com/evidence/${index + 1}`,
  }));
  return {
    sources,
    citations: sources.map((s) => ({ sourceId: s.sourceId, url: s.url })),
    summary: "Source-backed evidence is ready for storyboard planning.",
  };
}

const VALID_INPUT = Object.freeze({
  brief: "Launch teaser remix with bold kinetic typography",
  evidencePack: evidencePackOf(4),
  shotCount: 5,
});

// ---------------------------------------------------------------------------
// reasoningSignaledFailure — the non-throwing failure channel
// ---------------------------------------------------------------------------

test("reasoningSignaledFailure detects explicit failure flags only", () => {
  assert.equal(reasoningSignaledFailure({ reasoningFailed: true }), true);
  assert.equal(reasoningSignaledFailure({ failed: true }), true);
  // A normal/empty/partial result is NOT a failure (success path unchanged).
  assert.equal(reasoningSignaledFailure({ shots: [] }), false);
  assert.equal(reasoningSignaledFailure({}), false);
  assert.equal(reasoningSignaledFailure(null), false);
  assert.equal(reasoningSignaledFailure(undefined), false);
});

// ---------------------------------------------------------------------------
// R7.5: reasoning THROWS -> single-node fallback that validates + round-trips
// ---------------------------------------------------------------------------

test("R7.5: a chat client that THROWS yields a single-node fallback Kgc_Document (valid + round-trips + flagged)", async () => {
  const chatClient = {
    plan() {
      throw new Error("BytePlus reasoning unavailable");
    },
  };
  const result = await runStoryboardHarness(VALID_INPUT, { chatClient, paidProviderCalls: 1 });

  // Observable indication that fallback content was substituted (R7.5).
  assert.equal(result.status, STORYBOARD_STATUS_FALLBACK);
  assert.equal(result.fallbackSubstituted, true);
  assert.ok(result.fallbackReason && /unavailable/.test(result.fallbackReason));

  // Exactly ONE flow.nodes[] entry (R7.5).
  assert.equal(result.flow.nodes.length, FALLBACK_SHOT_COUNT);
  assert.equal(result.flow.nodes.length, 1);
  assert.equal(result.flow.edges.length, 0);
  assert.equal(result.shotCount, 1);

  // Validates against kgc-computing-flow/v1.
  assert.equal(result.schemaValid, true, JSON.stringify(result.schemaErrors));
  assert.equal(result.schema, KGC_COMPUTING_FLOW_SCHEMA);
  const validation = validateKgcComputingFlowV1({
    canvasDocumentMarkdown: result.canvasDocumentMarkdown,
    flow: result.flow,
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  // Satisfies the round-trip property (R7.3 clause of Property 14).
  assert.equal(result.roundTripOk, true);
  assert.equal(flowRoundTripEquivalent(result.flow), true);
});

// ---------------------------------------------------------------------------
// R7.5: reasoning result SIGNALS failure (non-throwing) -> same fallback
// ---------------------------------------------------------------------------

test("R7.5: a chat client RESULT that signals failure yields the single-node fallback", async () => {
  const chatClient = {
    plan() {
      return { reasoningFailed: true, reason: "degraded ai gateway response" };
    },
  };
  const result = await runStoryboardHarness(VALID_INPUT, { chatClient });
  assert.equal(result.status, STORYBOARD_STATUS_FALLBACK);
  assert.equal(result.fallbackSubstituted, true);
  assert.equal(result.fallbackReason, "degraded ai gateway response");
  assert.equal(result.flow.nodes.length, 1);
  assert.equal(result.schemaValid, true, JSON.stringify(result.schemaErrors));
  assert.equal(result.roundTripOk, true);
});

test("R7.5: an async chat client that REJECTS triggers the fallback", async () => {
  const chatClient = {
    async plan() {
      throw new Error("timeout");
    },
  };
  const result = await runStoryboardHarness(VALID_INPUT, { chatClient });
  assert.equal(result.status, STORYBOARD_STATUS_FALLBACK);
  assert.equal(result.fallbackSubstituted, true);
  assert.equal(result.flow.nodes.length, 1);
  assert.equal(result.schemaValid, true);
  assert.equal(result.roundTripOk, true);
});

test("R7.5: the single fallback node references one Evidence_Pack sourceId when available", async () => {
  const chatClient = {
    plan() {
      throw new Error("reasoning failed");
    },
  };
  const result = await runStoryboardHarness(VALID_INPUT, { chatClient });
  const packIds = new Set(VALID_INPUT.evidencePack.sources.map((s) => s.sourceId));
  assert.equal(result.plannedShots.length, 1);
  for (const id of result.plannedShots[0].sourceCardIds) {
    assert.ok(packIds.has(id), `fallback source ${id} must resolve to the Evidence_Pack`);
  }
});

test("R7.5: a fallback with no evidence sources still emits a valid single-node document", async () => {
  const chatClient = {
    plan() {
      throw new Error("reasoning failed");
    },
  };
  const input = { brief: VALID_INPUT.brief, evidencePack: { sources: [], citations: [], summary: "" } };
  const result = await runStoryboardHarness(input, { chatClient });
  assert.equal(result.status, STORYBOARD_STATUS_FALLBACK);
  assert.equal(result.flow.nodes.length, 1);
  assert.deepEqual(result.plannedShots[0].sourceCardIds, []);
  assert.equal(result.schemaValid, true, JSON.stringify(result.schemaErrors));
  assert.equal(result.roundTripOk, true);
});

// ---------------------------------------------------------------------------
// buildFallbackStoryboardDocument is usable standalone (Property 14 seam)
// ---------------------------------------------------------------------------

test("buildFallbackStoryboardDocument builds a valid, round-tripping single-node document", () => {
  const doc = buildFallbackStoryboardDocument({
    brief: "Launch teaser",
    sourceIds: ["src-1", "src-2"],
    runId: "run-fallback",
    referenceUrl: "https://example.com/ref.mp4",
  });
  assert.equal(doc.flow.nodes.length, 1);
  assert.equal(doc.flow.edges.length, 0);
  assert.ok(doc.canvasDocumentMarkdown.includes(`kgSchema: "${KGC_COMPUTING_FLOW_SCHEMA}"`));
  const validation = validateKgcComputingFlowV1(doc);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(flowRoundTripEquivalent(doc.flow), true);
});

// ---------------------------------------------------------------------------
// Fallback (R7.5) is DISTINCT from the reject path (R7.4 / task 3.6)
// ---------------------------------------------------------------------------

test("fallback (R7.5) and reject (R7.4) are distinct: failure -> one node, malformed produced doc -> zero nodes", async () => {
  // Reasoning failure -> fallback: exactly one node, fallbackSubstituted true.
  const fallback = await runStoryboardHarness(VALID_INPUT, {
    chatClient: {
      plan() {
        throw new Error("reasoning failed");
      },
    },
  });
  assert.equal(fallback.status, STORYBOARD_STATUS_FALLBACK);
  assert.equal(fallback.fallbackSubstituted, true);
  assert.equal(fallback.flow.nodes.length, 1);
  assert.notEqual(fallback.canvasDocumentMarkdown, null);

  // Malformed PRODUCED document (reasoning succeeded) -> reject: zero nodes,
  // fallback NOT substituted.
  const reject = await runStoryboardHarness(VALID_INPUT, {
    beforeEmit: ({ flow }) => ({
      flow: {
        nodes: flow.nodes,
        edges: [...flow.edges, { id: "edge-bad", source: flow.nodes[0].id, target: "ghost" }],
      },
    }),
  });
  assert.equal(reject.status, STORYBOARD_STATUS_REJECTED);
  assert.equal(reject.fallbackSubstituted, false);
  assert.deepEqual(reject.flow, { nodes: [], edges: [] });
  assert.equal(reject.canvasDocumentMarkdown, null);
});

test("the default success path remains unaffected by the fallback path (3.5/3.6 intact)", async () => {
  const result = await runStoryboardHarness(VALID_INPUT);
  assert.equal(result.status, STORYBOARD_STATUS_COMPLETE);
  assert.equal(result.fallbackSubstituted, false);
  assert.equal(result.schemaValid, true);
  assert.ok(result.flow.nodes.length > 0);
});
