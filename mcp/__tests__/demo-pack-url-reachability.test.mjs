// Unit tests for Demo_Pack URL reachability marking
// (agenticgraph-acos-mcp-connector spec, task 2.14 - R3.3 / Property 23).
//
// Property 23 (URL half): "any Demo_Pack URL that does not return HTTP 200
// within 5 seconds causes its corresponding section to be marked unverified
// with the failing URL recorded."
//
// These tests inject the reachability result set (no network, no real 5s
// timer). They assert:
//   * a failing/timed-out URL marks its backing section unverified and records
//     the failing URL (on the section and in `demoPack.failingUrls[]`),
//   * an all-200 set leaves the backing section verified with no failing URLs,
//   * the runtime default (no probe) records NO confirmed failures (an unprobed
//     URL is not a confirmed failure), preserving the 2.13 seam.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDemoPack,
  buildDemoUrls,
  markReachability,
  FRONTEND_URL_KIND,
} from "../video-remix/demo-pack.js";

const DEMO_SECTION_ID = "demo_presentation";

const TERMINAL_ARGS = Object.freeze({
  state: "complete",
  sources: [{ sourceId: "s1", url: "https://example.com/a" }],
  assets: [{ shotId: "shot-1", assetUrl: "https://airvio.co/assets/shot-1.mp4" }],
  checkout: { sessionId: "cs_test_demo", payoutSettled: true },
});

function demoSection(demoPack) {
  return demoPack.sections.find((s) => s.id === DEMO_SECTION_ID);
}

// ---------------------------------------------------------------------------
// All-200 set leaves the url-backed section verified.
// ---------------------------------------------------------------------------

test("an all-200 reachability set flips urls reachable and leaves the section verified", () => {
  // Probe every url as a confirmed HTTP 200.
  const demoPack = buildDemoPack({ ...TERMINAL_ARGS, reachability: () => ({ status: 200 }) });

  assert.ok(demoPack.urls.length >= 2, "terminal run lists demo urls");
  for (const entry of demoPack.urls) {
    assert.equal(entry.reachable, true, `${entry.url} marked reachable`);
  }
  assert.deepEqual(demoPack.failingUrls, [], "no failing urls when all return 200");

  const section = demoSection(demoPack);
  assert.equal(section.verified, true, "demo_presentation section verified when all urls reachable");
  assert.deepEqual(section.failingUrls, [], "no failing urls recorded on the section");
});

// ---------------------------------------------------------------------------
// A failing URL marks its section unverified and records the failing URL.
// ---------------------------------------------------------------------------

test("a non-200 URL marks its section unverified and records the failing URL", () => {
  const urls = buildDemoUrls({ state: "complete" });
  const frontend = urls.find((u) => u.kind === FRONTEND_URL_KIND).url;
  const agentApi = urls.find((u) => u.kind === "worker").url;
  const health = urls.find((u) => u.kind === "worker-health").url;

  // Frontend + health OK; the agent-api base returns 503.
  const reachability = {
    [frontend]: { status: 200 },
    [agentApi]: { status: 503 },
    [health]: { status: 200 },
  };
  const demoPack = buildDemoPack({ ...TERMINAL_ARGS, reachability });

  assert.deepEqual(demoPack.failingUrls, [agentApi], "the failing url is recorded at the top level");

  const section = demoSection(demoPack);
  assert.equal(section.verified, false, "section unverified when any backing url fails");
  assert.deepEqual(section.failingUrls, [agentApi], "the failing url is recorded on the section");

  const failingEntry = demoPack.urls.find((u) => u.url === agentApi);
  assert.equal(failingEntry.reachable, false, "the failing url entry is marked unreachable");
});

// ---------------------------------------------------------------------------
// A timed-out URL (no 200 within 5s) is treated as a failure.
// ---------------------------------------------------------------------------

test("a timed-out URL is recorded as a failing URL and unverifies its section", () => {
  const urls = buildDemoUrls({ state: "complete" });
  const health = urls.find((u) => u.kind === "worker-health").url;

  const reachability = urls.map((u) => ({
    url: u.url,
    timedOut: u.url === health, // health probe exceeds the 5s deadline
    status: u.url === health ? undefined : 200,
  }));
  const demoPack = buildDemoPack({ ...TERMINAL_ARGS, reachability });

  assert.deepEqual(demoPack.failingUrls, [health]);
  const section = demoSection(demoPack);
  assert.equal(section.verified, false);
  assert.deepEqual(section.failingUrls, [health]);
});

// ---------------------------------------------------------------------------
// Runtime default (no injected probe) records NO confirmed failures and leaves
// the section unverified — preserving the 2.13 seam without false positives.
// ---------------------------------------------------------------------------

test("with no injected probe, no urls are confirmed and no failing urls are recorded", () => {
  const demoPack = buildDemoPack({ ...TERMINAL_ARGS });
  for (const entry of demoPack.urls) {
    assert.equal(entry.reachable, false, "unprobed urls stay unreachable");
  }
  assert.deepEqual(demoPack.failingUrls, [], "an unprobed url is NOT a confirmed failure");
  const section = demoSection(demoPack);
  assert.equal(section.verified, false, "section stays unverified until a probe confirms 200");
  assert.deepEqual(section.failingUrls, [], "no confirmed failures recorded without a probe");
});

// ---------------------------------------------------------------------------
// Non-terminal states carry no demo urls, so reachability marking is inert.
// ---------------------------------------------------------------------------

test("non-terminal state has no urls so reachability marking is a no-op", () => {
  const demoPack = buildDemoPack({ state: "approval_required", reachability: () => true });
  assert.deepEqual(demoPack.urls, []);
  assert.deepEqual(demoPack.failingUrls, []);
});

// ---------------------------------------------------------------------------
// markReachability directly: probe-function, array, object, and Map shapes.
// ---------------------------------------------------------------------------

test("markReachability accepts boolean / array / object / Map result shapes", () => {
  const urls = [
    { kind: FRONTEND_URL_KIND, url: "https://fe.example", reachable: false },
    { kind: "worker", url: "https://airvio.co/agenticgraph/mcp", reachable: false },
  ];
  const sections = [{ id: "demo_presentation", dimension: "Demo & Presentation", verified: false }];

  // Boolean probe fn.
  const byFn = markReachability({ urls, sections, reachability: (u) => u === "https://fe.example" });
  assert.deepEqual(byFn.failingUrls, ["https://airvio.co/agenticgraph/mcp"]);
  assert.equal(byFn.sections[0].verified, false);

  // Array of results.
  const byArr = markReachability({
    urls,
    sections,
    reachability: [
      { url: "https://fe.example", ok: true },
      { url: "https://airvio.co/agenticgraph/mcp", ok: true },
    ],
  });
  assert.deepEqual(byArr.failingUrls, []);
  assert.equal(byArr.sections[0].verified, true);

  // Object keyed by url.
  const byObj = markReachability({
    urls,
    sections,
    reachability: { "https://fe.example": true, "https://airvio.co/agenticgraph/mcp": false },
  });
  assert.deepEqual(byObj.failingUrls, ["https://airvio.co/agenticgraph/mcp"]);

  // Map keyed by url.
  const byMap = markReachability({
    urls,
    sections,
    reachability: new Map([
      ["https://fe.example", { status: 200 }],
      ["https://airvio.co/agenticgraph/mcp", { status: 404 }],
    ]),
  });
  assert.deepEqual(byMap.failingUrls, ["https://airvio.co/agenticgraph/mcp"]);
  assert.equal(byMap.sections[0].verified, false);
});

// ---------------------------------------------------------------------------
// markReachability leaves non-url-backed sections untouched (the 2.15 seam).
// ---------------------------------------------------------------------------

test("markReachability does not touch sections that have no backing urls", () => {
  const urls = [{ kind: FRONTEND_URL_KIND, url: "https://fe.example", reachable: false }];
  const sections = [
    { id: "agent_overview", dimension: "Agent Overview", verified: false },
    { id: "demo_presentation", dimension: "Demo & Presentation", verified: false },
  ];
  const marked = markReachability({ urls, sections, reachability: () => true });

  const overview = marked.sections.find((s) => s.id === "agent_overview");
  assert.equal(overview.verified, false, "non-url-backed section untouched");
  assert.equal("failingUrls" in overview, false, "no failingUrls field added to a non-url-backed section");

  const demo = marked.sections.find((s) => s.id === "demo_presentation");
  assert.equal(demo.verified, true, "url-backed section verified when its url is reachable");
});
