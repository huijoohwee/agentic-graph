// Tests for the Demo_Pack canvas-url integration (agentic-graph-acos-mcp-connector —
// capability "agentic-canvas-os calls agentic-graph MCP for the canvas").
//
// The embedded agentic-graph canvas is an opt-in judge-facing artifact: when a
// run-scoped canvas doc-view URL is available it is added to urls[] with kind
// `canvas` and backs the Actions & Tool Use section (combining with that
// section's rendered-asset artifact). Absent a canvas URL the urls[] shape is
// unchanged (backward compatible). ZERO network / ZERO browser.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDemoPack,
  buildDemoUrls,
  CANVAS_URL_KIND,
  FRONTEND_URL_KIND,
  AGENT_API_URL_KINDS,
} from "../video-remix/demo-pack.js";

const ACTIONS_SECTION_ID = "actions_tool_use";

const TERMINAL_ARGS = Object.freeze({
  state: "complete",
  sources: [{ sourceId: "s1", url: "https://example.com/a" }],
  assets: [{ shotId: "shot-1", assetUrl: "https://airvio.co/assets/shot-1.mp4", ledgerEventId: "led-1" }],
  checkout: { sessionId: "cs_test_demo", payoutSettled: true },
});

function actionsSection(demoPack) {
  return demoPack.sections.find((s) => s.id === ACTIONS_SECTION_ID);
}

// --- Backward compatibility: no canvas url by default -----------------------

test("no canvas url is emitted when none is provided (backward compatible)", () => {
  const demoPack = buildDemoPack({ ...TERMINAL_ARGS });
  assert.equal(demoPack.urls.some((u) => u.kind === CANVAS_URL_KIND), false);
  // Frontend + Agent_Api endpoints still present and unchanged.
  assert.ok(demoPack.urls.some((u) => u.kind === FRONTEND_URL_KIND));
  assert.ok(demoPack.urls.some((u) => AGENT_API_URL_KINDS.includes(u.kind)));
});

test("buildDemoUrls omits the canvas entry without a canvasUrl", () => {
  const urls = buildDemoUrls({ state: "complete" });
  assert.equal(urls.some((u) => u.kind === CANVAS_URL_KIND), false);
  assert.equal(urls.length, 3);
});

// --- Opt-in canvas url (explicit) -------------------------------------------

test("an explicit canvasUrl adds a canvas entry to urls[]", () => {
  const canvasUrl = "https://airvio.co/agentic-graph/doc-view?run=run-1";
  const demoPack = buildDemoPack({ ...TERMINAL_ARGS, canvasUrl });
  const canvas = demoPack.urls.find((u) => u.kind === CANVAS_URL_KIND);
  assert.ok(canvas, "canvas url present");
  assert.equal(canvas.url, canvasUrl);
});

// --- Derivation from base + runId -------------------------------------------

test("canvas url is derived from canvasBaseUrl + runId when not explicit", () => {
  const demoPack = buildDemoPack({
    ...TERMINAL_ARGS,
    canvasBaseUrl: "https://airvio.co/agentic-graph",
    runId: "run-42",
  });
  const canvas = demoPack.urls.find((u) => u.kind === CANVAS_URL_KIND);
  assert.ok(canvas);
  assert.equal(canvas.url, "https://airvio.co/agentic-graph/doc-view?run=run-42");
});

// --- Section binding + verification -----------------------------------------

test("a reachable canvas + rendered asset verifies the Actions & Tool Use section", () => {
  const canvasUrl = "https://airvio.co/agentic-graph/doc-view?run=run-1";
  const demoPack = buildDemoPack({
    ...TERMINAL_ARGS,
    canvasUrl,
    // All urls (incl. the canvas) answer 200 within the 5s deadline.
    reachability: () => ({ status: 200, latencyMs: 900 }),
  });
  const section = actionsSection(demoPack);
  assert.equal(section.verified, true, "verified when canvas reachable AND asset present");
  assert.equal(demoPack.urls.find((u) => u.kind === CANVAS_URL_KIND).reachable, true);
});

test("an unreachable canvas leaves Actions & Tool Use unverified and records the failing url", () => {
  const canvasUrl = "https://airvio.co/agentic-graph/doc-view?run=run-1";
  const demoPack = buildDemoPack({
    ...TERMINAL_ARGS,
    canvasUrl,
    reachability: (url) => ({ status: url === canvasUrl ? 502 : 200, latencyMs: 800 }),
  });
  const section = actionsSection(demoPack);
  assert.equal(section.verified, false);
  assert.ok(demoPack.failingUrls.includes(canvasUrl));
  assert.deepEqual(section.failingUrls, [canvasUrl]);
});

test("a canvas reachable but with NO rendered asset stays unverified (artifact half)", () => {
  const canvasUrl = "https://airvio.co/agentic-graph/doc-view?run=run-1";
  const demoPack = buildDemoPack({
    state: "complete",
    sources: [{ sourceId: "s1", url: "https://example.com/a" }],
    assets: [], // no rendered asset
    checkout: {},
    canvasUrl,
    reachability: () => ({ status: 200, latencyMs: 500 }),
  });
  const section = actionsSection(demoPack);
  assert.equal(section.verified, false, "verified requires BOTH canvas reachable and asset present");
});
