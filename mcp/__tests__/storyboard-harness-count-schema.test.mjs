// Unit tests for the Storyboard_Harness exact-N count + schema-reject gate
// (agentic-graph-acos-mcp-connector spec, task 3.6 / R7.2 / R7.4 / Property 12).
//
// Task 3.6 — exact-N node count + reject-on-invalid-schema (R7.2 / R7.4 /
// Property 12). The success path (task 3.5) lives in storyboard-harness.test.mjs
// and stays intact; these asserts add the count guarantee and the
// rejection/empty-nodes path. The consolidated property-based test lands in
// task 9.1.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runStoryboardHarness,
  emitValidatedStoryboard,
  StoryboardSchemaValidationError,
  AGENTIC_OS_COMPUTING_FLOW_SCHEMA,
  STORYBOARD_MAX_SHOTS,
  STORYBOARD_MIN_SHOTS,
  STORYBOARD_STATUS_COMPLETE,
  STORYBOARD_STATUS_REJECTED,
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
// R7.2: exactly one flow.nodes[] entry per planned shot, count == N (1<=N<=500)
// ---------------------------------------------------------------------------

test("R7.2: N planned shots -> exactly N flow.nodes[] entries (varied N)", async () => {
  for (const n of [1, 2, 3, 7, 50, 250, 500]) {
    const result = await runStoryboardHarness({ ...VALID_INPUT, shotCount: n });
    assert.equal(result.status, STORYBOARD_STATUS_COMPLETE);
    assert.equal(result.shotCount, n, `shotCount must equal N=${n}`);
    assert.equal(result.flow.nodes.length, n, `flow.nodes must have exactly N=${n} entries`);
    // edges chain consecutive shots: N-1 edges.
    assert.equal(result.flow.edges.length, n - 1);
    assert.equal(result.schemaValid, true, JSON.stringify(result.schemaErrors));
  }
});

test("R7.2 boundary N=1: exactly one node, zero edges, valid document", async () => {
  const result = await runStoryboardHarness({ ...VALID_INPUT, shotCount: STORYBOARD_MIN_SHOTS });
  assert.equal(result.shotCount, 1);
  assert.equal(result.flow.nodes.length, 1);
  assert.equal(result.flow.edges.length, 0);
  assert.equal(result.schemaValid, true, JSON.stringify(result.schemaErrors));
});

test("R7.2 boundary N=500: exactly 500 nodes, 499 edges, valid document", async () => {
  const result = await runStoryboardHarness({ ...VALID_INPUT, shotCount: STORYBOARD_MAX_SHOTS });
  assert.equal(result.shotCount, 500);
  assert.equal(result.flow.nodes.length, 500);
  assert.equal(result.flow.edges.length, 499);
  assert.equal(result.schemaValid, true, JSON.stringify(result.schemaErrors));
});

test("R7.2: a requested shotCount above 500 is clamped to exactly 500 nodes", async () => {
  const result = await runStoryboardHarness({ ...VALID_INPUT, shotCount: 99999 });
  assert.equal(result.flow.nodes.length, STORYBOARD_MAX_SHOTS);
});

// ---------------------------------------------------------------------------
// emitValidatedStoryboard gate (the reusable task 3.6 gate)
// ---------------------------------------------------------------------------

const WELL_FORMED_DOC = Object.freeze({
  canvasDocumentMarkdown: `---\nkgSchema: "${AGENTIC_OS_COMPUTING_FLOW_SCHEMA}"\n---\n# x`,
  flow: {
    nodes: [
      { id: "shot-1", label: "Shot 1", type: "video-remix-shot", status: "planned" },
      { id: "shot-2", label: "Shot 2", type: "video-remix-shot", status: "planned" },
    ],
    edges: [{ id: "edge-1", source: "shot-1", target: "shot-2" }],
  },
});

test("emitValidatedStoryboard accepts a well-formed document with matching count", () => {
  const out = emitValidatedStoryboard(WELL_FORMED_DOC, 2);
  assert.equal(out.ok, true);
  assert.equal(out.schemaValid, true);
  assert.equal(out.validationError, null);
  assert.equal(out.flow.nodes.length, 2);
});

test("R7.4: a AgenticOs_Document failing schema validation is rejected with no nodes emitted", () => {
  const malformed = {
    canvasDocumentMarkdown: `---\nkgSchema: "${AGENTIC_OS_COMPUTING_FLOW_SCHEMA}"\n---\n# x`,
    flow: {
      // edge points to a non-existent node id -> schema validation failure.
      nodes: [{ id: "shot-1", label: "Shot 1", type: "video-remix-shot", status: "planned" }],
      edges: [{ id: "edge-1", source: "shot-1", target: "ghost" }],
    },
  };
  const out = emitValidatedStoryboard(malformed, 1);
  assert.equal(out.ok, false);
  assert.equal(out.schemaValid, false);
  assert.ok(out.validationError && /does not resolve/.test(out.validationError));
  // No nodes emitted (R7.4): empty flow, no partial/invalid canvas.
  assert.deepEqual(out.flow, { nodes: [], edges: [] });
  assert.equal(out.canvasDocumentMarkdown, null);
});

test("R7.2 gate: a node count != planned N is rejected with no nodes emitted", () => {
  // Two nodes but caller planned N=3 -> count invariant violation.
  const out = emitValidatedStoryboard(WELL_FORMED_DOC, 3);
  assert.equal(out.ok, false);
  assert.equal(out.schemaValid, false);
  assert.ok(out.validationError && /does not equal planned shot count 3/.test(out.validationError));
  assert.deepEqual(out.flow, { nodes: [], edges: [] });
});

test("R7.1/R7.4 gate: an empty flow.nodes[] is rejected (non-empty requirement)", () => {
  const out = emitValidatedStoryboard(
    {
      canvasDocumentMarkdown: `---\nkgSchema: "${AGENTIC_OS_COMPUTING_FLOW_SCHEMA}"\n---\n# x`,
      flow: { nodes: [], edges: [] },
    },
    0,
  );
  assert.equal(out.ok, false);
  assert.ok(out.schemaErrors.some((e) => /non-empty/.test(e)));
  assert.deepEqual(out.flow, { nodes: [], edges: [] });
});

test("StoryboardSchemaValidationError carries the failed-check list and a typed code", () => {
  const err = new StoryboardSchemaValidationError(["check a failed", "check b failed"]);
  assert.equal(err.name, "StoryboardSchemaValidationError");
  assert.equal(err.code, "invalid_agenticOs_document");
  assert.deepEqual(err.errors, ["check a failed", "check b failed"]);
  assert.ok(err.message.includes(AGENTIC_OS_COMPUTING_FLOW_SCHEMA));
});

// ---------------------------------------------------------------------------
// R7.4 through the harness: a produced document that fails validation rejects,
// returns the validation error, and emits no flow.nodes[].
// ---------------------------------------------------------------------------

test("R7.4: runStoryboardHarness rejects a malformed produced document and emits no nodes", async () => {
  // The beforeEmit seam corrupts the built graph (an edge to a missing node),
  // simulating a reasoning/post-processing output that fails the schema gate.
  const result = await runStoryboardHarness(VALID_INPUT, {
    beforeEmit: ({ flow }) => ({
      flow: {
        nodes: flow.nodes,
        edges: [...flow.edges, { id: "edge-bad", source: flow.nodes[0].id, target: "ghost" }],
      },
    }),
  });
  assert.equal(result.status, STORYBOARD_STATUS_REJECTED);
  assert.equal(result.schemaValid, false);
  assert.ok(result.validationError && /does not resolve/.test(result.validationError));
  // No flow.nodes[] surfaced to the canvas (R7.4).
  assert.equal(result.shotCount, 0);
  assert.deepEqual(result.flow, { nodes: [], edges: [] });
  assert.equal(result.canvasDocumentMarkdown, null);
  // The fallback (task 3.7) is NOT taken here.
  assert.equal(result.fallbackSubstituted, false);
  // Still zero paid-provider calls on the reject path.
  assert.equal(result.paidProviderCalls, 0);
});

test("R7.4: the default success path is unaffected by the reject gate (3.5 intact)", async () => {
  const result = await runStoryboardHarness(VALID_INPUT);
  assert.equal(result.status, STORYBOARD_STATUS_COMPLETE);
  assert.equal(result.schemaValid, true);
  assert.equal(result.validationError, null);
  assert.ok(result.flow.nodes.length > 0);
});
