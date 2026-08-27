// Unit tests for Demo_Pack assembly at a terminal Run_State
// (agenticgraph-acos-mcp-connector spec, task 2.13 - R3.1, R3.2 / Property 22).
//
// Asserts the task 2.13 ASSEMBLY guarantees:
//   * exactly seven NON-EMPTY evidence sections, one per judging dimension,
//   * `urls[]` carrying >=1 Frontend URL and >=1 Agent_Api endpoint,
// at a terminal Run_State. Reachability marking (2.14), artifact-reference
// completeness (2.15), and health retry/record (2.16) are explicitly NOT
// asserted here — those refine the Demo_Pack further and keep their seams.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runVideoRemix } from "../video-remix-runtime.js";
import {
  buildDemoPack,
  buildDemoUrls,
  isTerminalRunState,
  JUDGING_DIMENSIONS,
  AGENT_API_URL_KINDS,
  FRONTEND_URL_KIND,
} from "../video-remix/demo-pack.js";

// The seven judging dimensions in canonical order (design › Hackathon judge).
const SEVEN_DIMENSIONS = [
  "Agent Overview",
  "Autonomy & Decision-Making",
  "Actions & Tool Use",
  "Orchestration",
  "Human-in-the-Loop",
  "Failure Handling",
  "Demo & Presentation",
];

// A fully-approved live run that reaches terminal Run_State `complete`.
const COMPLETE_LIVE_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Remix the reference into a sellable launch teaser.",
  mode: "live",
  budgetUsd: 20,
  runId: "demo-pack-complete-001",
  shotCount: 3,
  approvals: ["paid-model-call", "render-action", "payment-action", "cloud-deploy"],
  sourceCards: [
    { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
    { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
    { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
  ],
});

function assertSevenNonEmptyDimensionSections(demoPack) {
  // Exactly seven sections (R3.1).
  assert.equal(demoPack.sections.length, 7, "Demo_Pack has exactly seven sections");

  // One per judging dimension, in canonical order, each non-empty (R3.1).
  const dimensions = demoPack.sections.map((s) => s.dimension);
  assert.deepEqual(dimensions, SEVEN_DIMENSIONS, "sections map to the seven judging dimensions in order");
  assert.equal(new Set(dimensions).size, 7, "each judging dimension appears exactly once");

  for (const section of demoPack.sections) {
    assert.equal(typeof section.evidence, "string");
    assert.ok(section.evidence.trim().length > 0, `section ${section.dimension} has non-empty evidence`);
  }
}

function assertRequiredUrls(urls) {
  const frontend = urls.filter((u) => u.kind === FRONTEND_URL_KIND);
  const agentApi = urls.filter((u) => AGENT_API_URL_KINDS.includes(u.kind));
  assert.ok(frontend.length >= 1, "urls[] contains >=1 Frontend URL");
  assert.ok(agentApi.length >= 1, "urls[] contains >=1 Agent_Api endpoint");
  for (const entry of urls) {
    assert.ok(typeof entry.url === "string" && entry.url.length > 0, "each url entry has a non-empty url");
  }
}

// ---------------------------------------------------------------------------
// Through the Director runtime: a terminal complete run.
// ---------------------------------------------------------------------------

test("complete live run assembles seven non-empty dimension sections + required urls", () => {
  const { payload } = runVideoRemix(COMPLETE_LIVE_ARGS);
  assert.equal(payload.state, "complete");
  const demoPack = payload.demoPack;

  assert.equal(demoPack.atTerminalRunState, true);
  assertSevenNonEmptyDimensionSections(demoPack);
  assertRequiredUrls(demoPack.urls);
});

// ---------------------------------------------------------------------------
// Direct buildDemoPack at each terminal Run_State (R3.1 covers ALL terminals,
// not only `complete`): blocked, budget_exceeded, dry_run_ready.
// ---------------------------------------------------------------------------

for (const state of ["complete", "completed", "blocked", "budget_exceeded", "dry_run_ready"]) {
  test(`buildDemoPack at terminal state "${state}" → 7 non-empty sections + required urls`, () => {
    const demoPack = buildDemoPack({
      state,
      sources: [{ sourceId: "s1", url: "https://example.com/a" }],
      assets: [{ shotId: "shot-1", assetUrl: "https://airvio.co/assets/shot-1.mp4" }],
      checkout: { sessionId: "cs_test_demo", payoutSettled: true },
    });
    assert.equal(demoPack.atTerminalRunState, true);
    assertSevenNonEmptyDimensionSections(demoPack);
    assertRequiredUrls(demoPack.urls);
  });
}

// ---------------------------------------------------------------------------
// Non-terminal halt states carry no demo urls (the run is still in flight);
// this leaves the urls seam closed until a terminal Run_State is reached.
// ---------------------------------------------------------------------------

test("non-terminal states emit no demo urls but still expose dimension sections", () => {
  for (const state of ["approval_required", "running"]) {
    assert.equal(isTerminalRunState(state), false);
    const demoPack = buildDemoPack({ state, sources: [], assets: [], checkout: {} });
    assert.equal(demoPack.atTerminalRunState, false);
    assert.deepEqual(demoPack.urls, [], `no urls at non-terminal state ${state}`);
    // Sections are still seven and non-empty (draft evidence).
    assertSevenNonEmptyDimensionSections(demoPack);
  }
});

// ---------------------------------------------------------------------------
// A live run halted at approval_required (non-terminal) carries no demo urls.
// ---------------------------------------------------------------------------

test("live run halted at approval_required (non-terminal) carries no demo urls", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Halt at the render gate.",
    mode: "live",
    budgetUsd: 20,
    runId: "demo-pack-approval-001",
    shotCount: 3,
    approvals: ["paid-model-call"],
    sourceCards: [
      { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
      { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
      { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
    ],
  });
  assert.equal(payload.state, "approval_required");
  assert.equal(payload.demoPack.atTerminalRunState, false);
  assert.deepEqual(payload.demoPack.urls, []);
});

// ---------------------------------------------------------------------------
// buildDemoUrls / JUDGING_DIMENSIONS sanity (catalog wiring).
// ---------------------------------------------------------------------------

test("JUDGING_DIMENSIONS enumerates exactly the seven dimensions", () => {
  assert.deepEqual(Object.values(JUDGING_DIMENSIONS), SEVEN_DIMENSIONS);
});

test("buildDemoUrls honors endpoint hint overrides at a terminal state", () => {
  const urls = buildDemoUrls({
    state: "complete",
    frontendUrl: "https://my-frontend.example",
    workerUrl: "https://airvio.co/agenticgraph/mcp",
    workerHealthUrl: "https://airvio.co/agenticgraph/mcp/health",
  });
  assertRequiredUrls(urls);
  assert.ok(urls.some((u) => u.kind === FRONTEND_URL_KIND && u.url === "https://my-frontend.example"));
  assert.ok(urls.some((u) => u.kind === "worker" && u.url === "https://airvio.co/agenticgraph/mcp"));
});
