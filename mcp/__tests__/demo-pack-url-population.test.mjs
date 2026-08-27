// Unit tests for Demo_Pack urls[] population + the EXPLICIT, INJECTABLE 5s
// reachability-timeout seam (agenticgraph-acos-mcp-connector spec, task 10.2 —
// R3.2, R3.4 / Property 22, 23).
//
// Task 10.2 is verify-and-extend over the existing demo-pack.js assembler. It
// asserts the four behaviors the task calls out, with ZERO live network (the
// URL probe + 5s deadline are deterministic, injectable seams):
//   1. urls[] always carries >=1 Frontend URL and >=1 Agent_Api endpoint;
//   2. a non-200 URL marks its section unverified and records the failing URL;
//   3. a URL that does NOT return 200 within the explicit 5s deadline (a
//      reported latency over 5s — even with status 200) is a timeout failure
//      that unverifies its section and is recorded;
//   4. a 200 within 5s verifies its section.
//
// The 5s deadline is the explicit, injectable, deterministic seam
// `URL_REACHABILITY_DEADLINE_MS` (default 5000), overridable per call via
// `reachabilityDeadlineMs`. No socket is opened and no timer runs here.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDemoPack,
  buildDemoUrls,
  markReachability,
  FRONTEND_URL_KIND,
  AGENT_API_URL_KINDS,
  URL_REACHABILITY_DEADLINE_MS,
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
// (a) Both-tier URL presence: >=1 Frontend + >=1 Agent_Api endpoint (R3.2).
// ---------------------------------------------------------------------------

test("urls[] always includes at least one Frontend URL and one Agent_Api endpoint", () => {
  const demoPack = buildDemoPack({ ...TERMINAL_ARGS });

  const frontend = demoPack.urls.filter((u) => u.kind === FRONTEND_URL_KIND);
  const agentApi = demoPack.urls.filter((u) => AGENT_API_URL_KINDS.includes(u.kind));
  assert.ok(frontend.length >= 1, ">=1 Frontend URL present");
  assert.ok(agentApi.length >= 1, ">=1 Agent_Api endpoint present");
  for (const entry of frontend.concat(agentApi)) {
    assert.match(entry.url, /^https?:\/\//, `${entry.kind} url is a real http(s) url`);
  }
});

test("deployed Frontend + Agent_Api endpoint hints flow into urls[]", () => {
  const demoPack = buildDemoPack({
    ...TERMINAL_ARGS,
    frontendUrl: "https://airvio.co/agenticgraph",
    workerUrl: "https://airvio.co/agenticgraph/mcp",
    workerHealthUrl: "https://airvio.co/agenticgraph/mcp/health",
  });
  assert.ok(demoPack.urls.some((u) => u.kind === FRONTEND_URL_KIND && u.url === "https://airvio.co/agenticgraph"));
  assert.ok(demoPack.urls.some((u) => u.kind === "worker" && u.url === "https://airvio.co/agenticgraph/mcp"));
  assert.ok(demoPack.urls.some((u) => u.kind === "worker-health" && u.url === "https://airvio.co/agenticgraph/mcp/health"));
});

// ---------------------------------------------------------------------------
// (b) 200 within 5s → verified section, no failing urls (R3.2).
// ---------------------------------------------------------------------------

test("a 200 returned within the 5s deadline verifies the section", () => {
  // Every url answers 200 after 1.2s — comfortably within the 5s deadline.
  const demoPack = buildDemoPack({
    ...TERMINAL_ARGS,
    reachability: () => ({ status: 200, latencyMs: 1200 }),
  });

  for (const entry of demoPack.urls) assert.equal(entry.reachable, true, `${entry.url} reachable`);
  assert.deepEqual(demoPack.failingUrls, [], "no failing urls for 200-within-5s");
  assert.equal(demoSection(demoPack).verified, true, "section verified when all urls 200 within 5s");
});

// ---------------------------------------------------------------------------
// (c) non-200 → unverified + failing url recorded (R3.3).
// ---------------------------------------------------------------------------

test("a non-200 URL marks its section unverified and records the failing URL", () => {
  const urls = buildDemoUrls({ state: "complete" });
  const agentApi = urls.find((u) => u.kind === "worker").url;

  const reachability = urls.map((u) => ({
    url: u.url,
    status: u.url === agentApi ? 500 : 200,
    latencyMs: 800,
  }));
  const demoPack = buildDemoPack({ ...TERMINAL_ARGS, reachability });

  assert.deepEqual(demoPack.failingUrls, [agentApi]);
  const section = demoSection(demoPack);
  assert.equal(section.verified, false);
  assert.deepEqual(section.failingUrls, [agentApi]);
  assert.equal(demoPack.urls.find((u) => u.url === agentApi).reachable, false);
});

// ---------------------------------------------------------------------------
// (d) timeout (>5s) → unverified + failing url recorded, EVEN for status 200.
// This exercises the explicit 5s-deadline seam: a 200 that arrives after the
// deadline is a timeout failure (R3.2 "within 5 seconds", R3.3).
// ---------------------------------------------------------------------------

test("a 200 that arrives AFTER the 5s deadline is a timeout failure", () => {
  const urls = buildDemoUrls({ state: "complete" });
  const health = urls.find((u) => u.kind === "worker-health").url;

  // The health route answers 200 but only after 5.5s — past the 5s deadline.
  const reachability = urls.map((u) => ({
    url: u.url,
    status: 200,
    latencyMs: u.url === health ? 5500 : 900,
  }));
  const demoPack = buildDemoPack({ ...TERMINAL_ARGS, reachability });

  assert.deepEqual(demoPack.failingUrls, [health], "late 200 is recorded as a failing url");
  const section = demoSection(demoPack);
  assert.equal(section.verified, false, "section unverified when a backing url misses the 5s deadline");
  assert.equal(demoPack.urls.find((u) => u.url === health).reachable, false);
});

test("an explicit timedOut flag is a timeout failure regardless of latency field", () => {
  const urls = buildDemoUrls({ state: "complete" });
  const agentApi = urls.find((u) => u.kind === "worker").url;

  const reachability = urls.map((u) => ({
    url: u.url,
    timedOut: u.url === agentApi,
    status: u.url === agentApi ? undefined : 200,
  }));
  const demoPack = buildDemoPack({ ...TERMINAL_ARGS, reachability });

  assert.deepEqual(demoPack.failingUrls, [agentApi]);
  assert.equal(demoSection(demoPack).verified, false);
});

// ---------------------------------------------------------------------------
// The 5s deadline is the published, injectable seam — and it is overridable.
// ---------------------------------------------------------------------------

test("URL_REACHABILITY_DEADLINE_MS is the explicit 5-second deadline", () => {
  assert.equal(URL_REACHABILITY_DEADLINE_MS, 5000);
});

test("the reachability deadline is injectable per call", () => {
  const urls = buildDemoUrls({ state: "complete" });
  // Every url answers 200 at 3s.
  const reachability = urls.map((u) => ({ url: u.url, status: 200, latencyMs: 3000 }));

  // Under the default 5s deadline, 3s is reachable -> verified.
  const dflt = buildDemoPack({ ...TERMINAL_ARGS, reachability });
  assert.deepEqual(dflt.failingUrls, []);
  assert.equal(demoSection(dflt).verified, true);

  // Inject a tighter 2s deadline: the same 3s responses now time out.
  const tight = buildDemoPack({ ...TERMINAL_ARGS, reachability, reachabilityDeadlineMs: 2000 });
  assert.equal(tight.failingUrls.length, tight.urls.length, "all urls fail the 2s deadline");
  assert.equal(demoSection(tight).verified, false);
});

test("markReachability honors an injected deadline on a probe function", () => {
  const urls = [
    { kind: FRONTEND_URL_KIND, url: "https://fe.example", reachable: false },
    { kind: "worker", url: "https://airvio.co/agenticgraph/mcp", reachable: false },
  ];
  const sections = [{ id: DEMO_SECTION_ID, dimension: "Demo & Presentation", verified: false }];

  // fe answers fast (1s), api answers slow (6s) — only worker should fail @5s.
  const probe = (url) => ({ status: 200, latencyMs: url === "https://airvio.co/agenticgraph/mcp" ? 6000 : 1000 });
  const marked = markReachability({ urls, sections, reachability: probe, deadlineMs: URL_REACHABILITY_DEADLINE_MS });

  assert.deepEqual(marked.failingUrls, ["https://airvio.co/agenticgraph/mcp"]);
  assert.equal(marked.sections[0].verified, false);
});
