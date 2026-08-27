// Tests for the Kgc_Document shot-plan display view-model
// (agenticgraph-acos-mcp-connector spec, task 7.5 / R1.5 / design Correctness
// Property 32 / design Frontend `renderManifest`).
//
// Covers:
//   - EXACTLY ONE visual node per planned shot (N flow nodes -> N rendered
//     nodes; shotCount == flow.nodes[].length), including the single-node
//     fallback document (R7.5 -> exactly 1 rendered node)
//   - node ids + flow order preserved (no dropping, no dedup, no reordering)
//   - edges are surfaced for connection rendering, with endpoints resolved
//   - both a raw Kgc_Document and the Storyboard_Harness envelope are accepted
//   - a malformed / empty document never throws and renders zero nodes
//
// The `kgc-computing-flow/v1` flow shape MIRRORS the Storyboard_Harness output
// in `mcp/video-remix/storyboard-harness.js` + `mcp/video-remix/storyboard.js`.
//
// ZERO network / ZERO browser.

import test from "node:test";
import assert from "node:assert/strict";

import { buildShotPlanView, resolveKgcFlow } from "../src/lib/shot-plan-view.js";

// --- Fixtures ---------------------------------------------------------------

/**
 * A `kgc-computing-flow/v1` flow as `buildStoryboardFlow` emits it: one node per
 * shot (`{ id, label, type, status }`, in order) and edges chaining consecutive
 * shots (`{ id, source, target }`).
 */
function kgcFlow(shotCount = 4) {
  const nodes = [];
  const edges = [];
  for (let i = 1; i <= shotCount; i += 1) {
    nodes.push({
      id: `shot-${i}`,
      label: `Shot ${i}`,
      type: "video-remix-shot",
      status: "planned",
    });
    if (i > 1) {
      edges.push({ id: `edge-${i - 1}`, source: `shot-${i - 1}`, target: `shot-${i}` });
    }
  }
  return { nodes, edges };
}

/** A raw Kgc_Document `{ canvasDocumentMarkdown, flow }`. */
function kgcDocument(shotCount = 4) {
  return {
    canvasDocumentMarkdown: `---\nkgSchema: "kgc-computing-flow/v1"\n---\n# Storyboard`,
    flow: kgcFlow(shotCount),
  };
}

/** The Storyboard_Harness result envelope wrapping a Kgc_Document. */
function harnessEnvelope(shotCount = 4, overrides = {}) {
  return {
    status: "complete",
    gateId: "paid-model-call",
    paidProviderCalls: 0,
    schema: "kgc-computing-flow/v1",
    shotCount,
    sourceReferences: [],
    fallbackSubstituted: false,
    schemaValid: true,
    canvasDocumentMarkdown: `---\nkgSchema: "kgc-computing-flow/v1"\n---\n# Storyboard`,
    flow: kgcFlow(shotCount),
    ...overrides,
  };
}

/** The single-node reasoning-failure fallback document (R7.5). */
function fallbackEnvelope() {
  return harnessEnvelope(1, {
    status: "fallback",
    fallbackSubstituted: true,
    fallbackReason: "reasoning_failed",
    flow: {
      nodes: [{ id: "shot-1", label: "Shot 1", type: "video-remix-shot", status: "planned" }],
      edges: [],
    },
  });
}

// --- Exactly one visual node per planned shot -------------------------------

test("renders exactly one visual node per planned shot (N nodes -> N rendered)", () => {
  for (const n of [1, 2, 4, 7, 25, 100, 500]) {
    const view = buildShotPlanView(kgcDocument(n));
    assert.equal(view.shotCount, n);
    assert.equal(view.nodes.length, n);
  }
});

test("rendered node count equals the Kgc_Document flow node count", () => {
  const doc = kgcDocument(9);
  const view = buildShotPlanView(doc);
  assert.equal(view.nodes.length, doc.flow.nodes.length);
  assert.equal(view.shotCount, doc.flow.nodes.length);
});

test("the single-node fallback document renders exactly one visual node", () => {
  const view = buildShotPlanView(fallbackEnvelope());
  assert.equal(view.shotCount, 1);
  assert.equal(view.nodes.length, 1);
  assert.equal(view.fallbackSubstituted, true);
  assert.equal(view.status, "fallback");
});

test("accepts the Storyboard_Harness envelope and renders one node per shot", () => {
  const view = buildShotPlanView(harnessEnvelope(6));
  assert.equal(view.shotCount, 6);
  assert.equal(view.nodes.length, 6);
  assert.equal(view.status, "complete");
  assert.equal(view.schema, "kgc-computing-flow/v1");
});

// --- Node ids + ordering preserved ------------------------------------------

test("preserves node ids one-to-one, in flow order", () => {
  const doc = kgcDocument(5);
  const view = buildShotPlanView(doc);
  assert.deepEqual(
    view.nodes.map((node) => node.id),
    doc.flow.nodes.map((node) => node.id),
  );
});

test("preserves node order via the order field", () => {
  const view = buildShotPlanView(kgcDocument(4));
  view.nodes.forEach((node, i) => assert.equal(node.order, i));
});

test("each node entry carries its id + display fields", () => {
  const view = buildShotPlanView(kgcDocument(3));
  for (const node of view.nodes) {
    assert.equal(typeof node.id, "string");
    assert.ok(node.id.length > 0);
    assert.equal(typeof node.label, "string");
    assert.ok(node.label.length > 0);
    assert.equal(typeof node.type, "string");
    assert.equal(typeof node.status, "string");
  }
});

test("does NOT dedup colliding node ids (every planned shot renders)", () => {
  // The harness would have enforced unique ids, but the Frontend must not
  // silently collapse entries: every flow node renders as a distinct node.
  const doc = {
    flow: {
      nodes: [
        { id: "dup", label: "A", type: "video-remix-shot", status: "planned" },
        { id: "dup", label: "B", type: "video-remix-shot", status: "planned" },
        { id: "dup", label: "C", type: "video-remix-shot", status: "planned" },
      ],
      edges: [],
    },
  };
  const view = buildShotPlanView(doc);
  assert.equal(view.shotCount, 3);
  assert.equal(view.nodes.length, 3);
});

test("a blank/missing node id falls back to a stable positional id (no drop)", () => {
  const doc = {
    flow: {
      nodes: [{ label: "A", type: "video-remix-shot", status: "planned" }, {}],
      edges: [],
    },
  };
  const view = buildShotPlanView(doc);
  assert.equal(view.shotCount, 2);
  assert.equal(view.nodes[0].id, "shot-1");
  assert.equal(view.nodes[1].id, "shot-2");
});

// --- Edges surfaced for connection rendering --------------------------------

test("surfaces edges for connection rendering, resolved to node ids", () => {
  const doc = kgcDocument(4);
  const view = buildShotPlanView(doc);
  assert.equal(view.edgeCount, 3);
  assert.equal(view.edges.length, 3);
  for (const edge of view.edges) {
    assert.equal(typeof edge.id, "string");
    assert.equal(typeof edge.source, "string");
    assert.equal(typeof edge.target, "string");
    assert.equal(edge.connected, true);
  }
});

test("an edge with an unresolved endpoint is surfaced but marked not connected", () => {
  const doc = {
    flow: {
      nodes: [{ id: "shot-1", label: "A", type: "video-remix-shot", status: "planned" }],
      edges: [{ id: "edge-1", source: "shot-1", target: "ghost" }],
    },
  };
  const view = buildShotPlanView(doc);
  assert.equal(view.edgeCount, 1);
  assert.equal(view.edges[0].connected, false);
});

test("a single-node plan has zero edges", () => {
  const view = buildShotPlanView(kgcDocument(1));
  assert.equal(view.shotCount, 1);
  assert.equal(view.edgeCount, 0);
  assert.deepEqual(view.edges, []);
});

// --- Empty / malformed document renders gracefully --------------------------

test("an empty flow renders gracefully with zero nodes", () => {
  const view = buildShotPlanView({ flow: { nodes: [], edges: [] } });
  assert.equal(view.shotCount, 0);
  assert.deepEqual(view.nodes, []);
  assert.equal(view.hasNodes, false);
});

test("a document with no flow field is tolerated (zero nodes)", () => {
  const view = buildShotPlanView({ canvasDocumentMarkdown: "no flow" });
  assert.equal(view.shotCount, 0);
  assert.equal(view.hasNodes, false);
});

test("malformed input never throws and yields an empty view", () => {
  for (const bad of [null, undefined, 5, "x", [], true, NaN]) {
    const view = buildShotPlanView(bad);
    assert.equal(view.shotCount, 0);
    assert.deepEqual(view.nodes, []);
    assert.equal(view.hasNodes, false);
    assert.equal(view.edgeCount, 0);
  }
});

test("malformed node / edge entries are tolerated without throwing", () => {
  const view = buildShotPlanView({
    flow: {
      nodes: [null, 5, "x", { id: "ok", label: "OK", type: "video-remix-shot", status: "planned" }],
      edges: [null, 7, { id: "e", source: "ok", target: "ok" }],
    },
  });
  // Every entry in nodes[] still renders (4), even the malformed ones.
  assert.equal(view.shotCount, 4);
  const ok = view.nodes.find((node) => node.id === "ok");
  assert.ok(ok);
});

// --- resolveKgcFlow unwrapping ----------------------------------------------

test("resolveKgcFlow unwraps a nested Kgc_Document carrier", () => {
  const doc = kgcDocument(2);
  assert.equal(resolveKgcFlow({ kgcDocument: doc }), doc.flow);
  assert.equal(resolveKgcFlow({ document: doc }), doc.flow);
});

test("resolveKgcFlow returns the top-level flow unchanged", () => {
  const doc = kgcDocument(2);
  assert.equal(resolveKgcFlow(doc), doc.flow);
});

test("resolveKgcFlow returns null for malformed input", () => {
  for (const bad of [null, undefined, 5, "x", [], { nope: true }]) {
    assert.equal(resolveKgcFlow(bad), null);
  }
});
