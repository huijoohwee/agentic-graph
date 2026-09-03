// Tests for the canvas embed SSOT (agentic-graph-acos-mcp-connector — capability
// "agentic-canvas-os calls agentic-graph MCP for the canvas").
//
// Covers the doc-view URL scheme, the storyboard-canvas availability predicate,
// the storyboard doc-id derivation, and the run-scoped url-from-manifest helper.
// ZERO network / ZERO browser; pure string + object logic.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CANVAS_DOC_VIEW_PATH,
  CANVAS_URL_KIND,
  CANVAS_EMBED_SANDBOX,
  CANVAS_EMBED_REFERRER_POLICY,
  DEFAULT_CONTROL_PLANE_CANVAS_BASE,
  resolveCanvasDocViewUrl,
  storyboardCanvasAvailable,
  resolveStoryboardDocId,
  buildCanvasUrlFromManifest,
} from "../video-remix/canvas-embed.js";

// --- URL scheme -------------------------------------------------------------

test("resolveCanvasDocViewUrl builds a run-scoped doc-view url", () => {
  const url = resolveCanvasDocViewUrl({ baseUrl: "https://airvio.co/agentic-graph", runId: "run-1" });
  assert.equal(url, "https://airvio.co/agentic-graph/doc-view?run=run-1");
});

test("resolveCanvasDocViewUrl appends the optional doc id", () => {
  const url = resolveCanvasDocViewUrl({ baseUrl: "https://airvio.co/agentic-graph", runId: "run-1", docId: "md:sb" });
  assert.equal(url, "https://airvio.co/agentic-graph/doc-view?run=run-1&doc=md%3Asb");
});

test("resolveCanvasDocViewUrl strips trailing slashes from the base", () => {
  const url = resolveCanvasDocViewUrl({ baseUrl: "https://airvio.co/agentic-graph///", runId: "r" });
  assert.equal(url, "https://airvio.co/agentic-graph/doc-view?run=r");
});

test("resolveCanvasDocViewUrl falls back to the documented default base", () => {
  const url = resolveCanvasDocViewUrl({ runId: "r" });
  assert.ok(url.startsWith(`${DEFAULT_CONTROL_PLANE_CANVAS_BASE}${CANVAS_DOC_VIEW_PATH}`));
});

test("resolveCanvasDocViewUrl returns '' without a runId", () => {
  assert.equal(resolveCanvasDocViewUrl({ baseUrl: "https://airvio.co/agentic-graph" }), "");
  assert.equal(resolveCanvasDocViewUrl({ baseUrl: "https://airvio.co/agentic-graph", runId: "  " }), "");
});

test("run id is URL-encoded", () => {
  const url = resolveCanvasDocViewUrl({ baseUrl: "https://x.dev", runId: "a b/c" });
  assert.match(url, /run=a(\+|%20)b%2Fc/);
});

// --- Availability -----------------------------------------------------------

test("storyboardCanvasAvailable is true when the storyboard stage is complete", () => {
  assert.equal(storyboardCanvasAvailable({ stages: [{ id: "storyboard", status: "complete" }] }), true);
  assert.equal(storyboardCanvasAvailable({ stages: [{ id: "storyboard", status: "completed" }] }), true);
  assert.equal(storyboardCanvasAvailable({ stages: [{ id: "storyboard", status: "fallback" }] }), true);
});

test("storyboardCanvasAvailable is true when a Kgc_Document carries shot nodes", () => {
  const manifest = { kgcDocument: { flow: { nodes: [{ id: "shot-1" }], edges: [] } } };
  assert.equal(storyboardCanvasAvailable(manifest), true);
});

test("storyboardCanvasAvailable reads the storyboard stage artifact flow", () => {
  const manifest = { stages: [{ id: "storyboard", status: "running", artifact: { flow: { nodes: [{ id: "s1" }] } } }] };
  assert.equal(storyboardCanvasAvailable(manifest), true);
});

test("storyboardCanvasAvailable is false before storyboard / for malformed input", () => {
  assert.equal(storyboardCanvasAvailable({ stages: [{ id: "research", status: "complete" }] }), false);
  assert.equal(storyboardCanvasAvailable({ stages: [{ id: "storyboard", status: "running" }] }), false);
  for (const bad of [null, undefined, 5, "x", []]) assert.equal(storyboardCanvasAvailable(bad), false);
});

// --- Doc id derivation ------------------------------------------------------

test("resolveStoryboardDocId reads graphId/docId/id from a carrier", () => {
  assert.equal(resolveStoryboardDocId({ kgcDocument: { graphId: "md:sb" } }), "md:sb");
  assert.equal(resolveStoryboardDocId({ storyboard: { docId: "d2" } }), "d2");
  assert.equal(resolveStoryboardDocId({ stages: [{ id: "storyboard", artifact: { id: "a3" } }] }), "a3");
  assert.equal(resolveStoryboardDocId({}), "");
});

// --- url-from-manifest ------------------------------------------------------

test("buildCanvasUrlFromManifest yields a run-scoped url when storyboard is ready", () => {
  const manifest = { runId: "run-9", stages: [{ id: "storyboard", status: "complete" }] };
  const url = buildCanvasUrlFromManifest({ manifest, baseUrl: "https://airvio.co/agentic-graph" });
  assert.equal(url, "https://airvio.co/agentic-graph/doc-view?run=run-9");
});

test("buildCanvasUrlFromManifest pins the doc id when present", () => {
  const manifest = {
    runId: "run-9",
    kgcDocument: { graphId: "md:sb", flow: { nodes: [{ id: "s1" }] } },
  };
  const url = buildCanvasUrlFromManifest({ manifest, baseUrl: "https://x.dev" });
  assert.equal(url, "https://x.dev/doc-view?run=run-9&doc=md%3Asb");
});

test("buildCanvasUrlFromManifest returns '' before storyboard is ready", () => {
  const manifest = { runId: "run-9", stages: [{ id: "research", status: "complete" }] };
  assert.equal(buildCanvasUrlFromManifest({ manifest, baseUrl: "https://x.dev" }), "");
});

test("buildCanvasUrlFromManifest returns '' without a run id", () => {
  const manifest = { stages: [{ id: "storyboard", status: "complete" }] };
  assert.equal(buildCanvasUrlFromManifest({ manifest, baseUrl: "https://x.dev" }), "");
});

// --- Embed security attributes ----------------------------------------------

test("cross-origin embed attributes are conservative", () => {
  assert.equal(CANVAS_EMBED_SANDBOX, "allow-scripts allow-same-origin");
  assert.equal(CANVAS_EMBED_REFERRER_POLICY, "no-referrer");
  assert.equal(CANVAS_URL_KIND, "canvas");
});
