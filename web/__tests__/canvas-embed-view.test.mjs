// Tests for the embedded-canvas view-model (agentic-graph-acos-mcp-connector —
// capability "agentic-canvas-os calls agentic-graph MCP for the canvas").
//
// Covers: availability gating (base URL configured + run id + storyboard ready),
// the run-scoped doc-view src, the cross-origin embed security attributes, and
// graceful unavailable reasons. The URL scheme MIRRORS the control-plane SSOT
// `mcp/video-remix/canvas-embed.js`. ZERO network / ZERO browser.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCanvasEmbedView,
  resolveCanvasDocViewUrl,
  CANVAS_EMBED_SANDBOX,
  CANVAS_EMBED_REFERRER_POLICY,
} from "../src/lib/canvas-embed-view.js";

const BASE = "https://airvio.co/agentic-graph";

function readyManifest(overrides = {}) {
  return {
    runId: "run-1",
    stages: [{ id: "storyboard", status: "complete" }],
    ...overrides,
  };
}

// --- Available path ---------------------------------------------------------

test("builds an available embed when base + runId + ready storyboard are present", () => {
  const view = buildCanvasEmbedView(readyManifest(), { canvasBaseUrl: BASE });
  assert.equal(view.available, true);
  assert.equal(view.src, "https://airvio.co/agentic-graph/doc-view?run=run-1");
  assert.equal(view.runId, "run-1");
  assert.equal(view.sandbox, CANVAS_EMBED_SANDBOX);
  assert.equal(view.referrerPolicy, CANVAS_EMBED_REFERRER_POLICY);
  assert.match(view.title, /run-1/);
});

test("pins the storyboard doc id into the src when present", () => {
  const manifest = readyManifest({ agenticOsDocument: { graphId: "md:sb", flow: { nodes: [{ id: "s1" }] } } });
  const view = buildCanvasEmbedView(manifest, { canvasBaseUrl: BASE });
  assert.equal(view.available, true);
  assert.equal(view.docId, "md:sb");
  assert.match(view.src, /doc=md%3Asb/);
});

test("availability is driven by AgenticOs_Document shot nodes too", () => {
  const manifest = { runId: "run-2", agenticOsDocument: { flow: { nodes: [{ id: "s1" }], edges: [] } } };
  const view = buildCanvasEmbedView(manifest, { canvasBaseUrl: BASE });
  assert.equal(view.available, true);
  assert.equal(view.src, "https://airvio.co/agentic-graph/doc-view?run=run-2");
});

test("an explicit runId overrides the manifest runId", () => {
  const view = buildCanvasEmbedView(readyManifest(), { canvasBaseUrl: BASE, runId: "explicit" });
  assert.match(view.src, /run=explicit/);
});

// --- Unavailable paths (graceful) -------------------------------------------

test("unavailable with reason when no canvas base is configured", () => {
  const view = buildCanvasEmbedView(readyManifest(), { canvasBaseUrl: "" });
  assert.equal(view.available, false);
  assert.equal(view.src, "");
  assert.match(view.reason, /not configured/);
});

test("unavailable with reason when there is no run id", () => {
  const view = buildCanvasEmbedView({ stages: [{ id: "storyboard", status: "complete" }] }, { canvasBaseUrl: BASE });
  assert.equal(view.available, false);
  assert.match(view.reason, /run id/);
});

test("unavailable with reason before the storyboard is ready", () => {
  const manifest = { runId: "run-1", stages: [{ id: "research", status: "complete" }] };
  const view = buildCanvasEmbedView(manifest, { canvasBaseUrl: BASE });
  assert.equal(view.available, false);
  assert.match(view.reason, /storyboard/);
});

test("malformed input never throws and is unavailable", () => {
  for (const bad of [null, undefined, 5, "x", [], true, NaN]) {
    const view = buildCanvasEmbedView(bad, { canvasBaseUrl: BASE });
    assert.equal(view.available, false);
    assert.equal(view.src, "");
  }
});

test("resolves a manifest nested under runManifest/manifest envelopes", () => {
  const view = buildCanvasEmbedView({ runManifest: readyManifest() }, { canvasBaseUrl: BASE });
  assert.equal(view.available, true);
  assert.match(view.src, /run=run-1/);
});

// --- URL helper -------------------------------------------------------------

test("resolveCanvasDocViewUrl returns '' without base or runId", () => {
  assert.equal(resolveCanvasDocViewUrl({ runId: "r" }), "");
  assert.equal(resolveCanvasDocViewUrl({ baseUrl: BASE }), "");
});
