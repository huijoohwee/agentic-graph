// Unit tests for the Demo_Pack templating-from-Run_Manifest layer
// (agentic-graph-acos-mcp-connector spec, task 10.1 — R3.1 / Property 22).
//
// Verifies the task-10.1 deliverables:
//   * the seven Demo_Pack sections map EXPLICITLY to the seven judging
//     dimensions (one per dimension, in canonical order), each bound to the
//     terminal Run_Manifest field(s) it is templated from;
//   * `buildDemoPackFromManifest` deterministically pulls evidence (sources,
//     citations, assets, checkout session, deploy approval) out of a terminal
//     Run_Manifest OBJECT and feeds the existing `buildDemoPack` assembler;
//   * extraction is tolerant of BOTH the runtime payload shape and the slimmer
//     canonical SSOT Run_Manifest shape, and performs ZERO network calls.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runVideoRemix } from "../video-remix-runtime.js";
import {
  SECTION_DIMENSION_MAP,
  extractManifestEvidence,
  buildDemoPackFromManifest,
  assertSevenDimensionMapping,
} from "../video-remix/demo-pack-template.js";
import { FRONTEND_URL_KIND, AGENT_API_URL_KINDS } from "../video-remix/demo-pack.js";

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

const SEVEN_SECTION_IDS = [
  "agent_overview",
  "autonomy_decision_making",
  "actions_tool_use",
  "orchestration",
  "human_in_the_loop",
  "failure_handling",
  "demo_presentation",
];

// A fully-approved live run that reaches terminal Run_State `complete`.
const COMPLETE_LIVE_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Remix the reference into a sellable launch teaser.",
  mode: "live",
  budgetUsd: 20,
  runId: "demo-template-complete-001",
  shotCount: 3,
  approvals: ["paid-model-call", "render-action", "payment-action", "cloud-deploy"],
  sourceCards: [
    { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
    { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
    { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
  ],
});

// ---------------------------------------------------------------------------
// 1. The explicit seven-section -> seven-dimension mapping (R3.1).
// ---------------------------------------------------------------------------

test("SECTION_DIMENSION_MAP binds exactly seven sections to the seven dimensions in order", () => {
  assert.equal(SECTION_DIMENSION_MAP.length, 7);
  assert.deepEqual(SECTION_DIMENSION_MAP.map((e) => e.sectionId), SEVEN_SECTION_IDS);
  assert.deepEqual(SECTION_DIMENSION_MAP.map((e) => e.dimension), SEVEN_DIMENSIONS);
  assert.equal(new Set(SECTION_DIMENSION_MAP.map((e) => e.dimension)).size, 7);
});

test("each mapped section declares the Run_Manifest evidence it is templated from", () => {
  for (const entry of SECTION_DIMENSION_MAP) {
    assert.ok(Array.isArray(entry.manifestEvidence), `${entry.sectionId} has manifestEvidence`);
    assert.ok(entry.manifestEvidence.length > 0, `${entry.sectionId} binds >=1 manifest field`);
    for (const field of entry.manifestEvidence) {
      assert.equal(typeof field, "string");
      assert.ok(field.length > 0);
    }
  }
});

test("assertSevenDimensionMapping passes (load-time invariant holds)", () => {
  assert.equal(assertSevenDimensionMapping(), true);
});

// ---------------------------------------------------------------------------
// 2. Templating pulls evidence from a terminal Run_Manifest (runtime payload).
// ---------------------------------------------------------------------------

test("buildDemoPackFromManifest assembles seven non-empty sections from a terminal manifest", () => {
  const { payload } = runVideoRemix(COMPLETE_LIVE_ARGS);
  assert.equal(payload.state, "complete");

  const demoPack = buildDemoPackFromManifest(payload);
  assert.equal(demoPack.terminal, true);
  assert.equal(demoPack.atTerminalRunState, true);

  // Seven non-empty dimension sections in canonical order (R3.1).
  assert.equal(demoPack.sections.length, 7);
  assert.deepEqual(demoPack.sections.map((s) => s.dimension), SEVEN_DIMENSIONS);
  for (const section of demoPack.sections) {
    assert.equal(typeof section.evidence, "string");
    assert.ok(section.evidence.trim().length > 0);
  }

  // urls[] carries >=1 Frontend + >=1 Agent_Api endpoint (R3.2).
  const frontend = demoPack.urls.filter((u) => u.kind === FRONTEND_URL_KIND);
  const agentApi = demoPack.urls.filter((u) => AGENT_API_URL_KINDS.includes(u.kind));
  assert.ok(frontend.length >= 1);
  assert.ok(agentApi.length >= 1);

  // The mapping rides along on the result for the judge surface.
  assert.deepEqual(demoPack.sectionDimensionMap, SECTION_DIMENSION_MAP);
});

test("extractManifestEvidence pulls sources, citations, assets, checkout, deploy from a terminal manifest", () => {
  const { payload } = runVideoRemix(COMPLETE_LIVE_ARGS);
  const evidence = extractManifestEvidence(payload);

  assert.equal(evidence.state, "complete");
  assert.equal(evidence.sources.length, 3);
  assert.ok(Array.isArray(evidence.citations));
  assert.equal(evidence.citations.length, 3);
  assert.ok(evidence.assets.length >= 1, "render assets pulled from manifest");
  assert.ok(typeof evidence.checkout.sessionId === "string" && evidence.checkout.sessionId.length > 0);
  assert.equal(evidence.deployApproved, true);
});

// ---------------------------------------------------------------------------
// 3. Evidence presence flows through to artifact references (R3.6 / R3.7).
// ---------------------------------------------------------------------------

test("templated Demo_Pack references the present artifacts; marks absent ones not available", () => {
  // Complete run: citations + asset + session all present.
  const { payload: complete } = runVideoRemix(COMPLETE_LIVE_ARGS);
  const present = buildDemoPackFromManifest(complete);
  assert.equal(present.artifactReferences.evidenceCitations.status, "present");
  assert.equal(present.artifactReferences.renderedAsset.status, "present");
  assert.equal(present.artifactReferences.stripeSession.status, "present");

  // A canonical-shape terminal manifest with NO render/checkout artifacts.
  const bareManifest = {
    runId: "bare-terminal-001",
    state: "completed",
    mode: "live",
    stages: [{ id: "research", status: "completed", retryCount: 0, costLog: null, artifact: null }],
    approvalGates: [{ gateId: "cloud-deploy", approvalState: "pending", estimatedCostUsd: 0, token: null }],
    budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0, providerSpendUsd: 0 },
    demoPack: null,
    failures: [],
    reconciliationFlags: [],
  };
  const bare = buildDemoPackFromManifest(bareManifest);
  assert.equal(bare.terminal, true);
  assert.equal(bare.artifactReferences.evidenceCitations.status, "not available");
  assert.equal(bare.artifactReferences.renderedAsset.status, "not available");
  assert.equal(bare.artifactReferences.stripeSession.status, "not available");
  // Still seven non-empty sections even with no artifacts (R3.1).
  assert.equal(bare.sections.length, 7);
  for (const section of bare.sections) assert.ok(section.evidence.trim().length > 0);
});

// ---------------------------------------------------------------------------
// 4. Canonical SSOT shape: evidence in stages[].artifact is pulled too.
// ---------------------------------------------------------------------------

test("extraction is tolerant of the canonical SSOT manifest shape (stage artifacts)", () => {
  const ssotManifest = {
    runId: "ssot-terminal-001",
    state: "completed",
    mode: "live",
    stages: [
      {
        id: "research",
        status: "completed",
        retryCount: 0,
        costLog: null,
        artifact: { sources: [{ sourceId: "x1", url: "https://example.com/x" }] },
      },
      {
        id: "render",
        status: "completed",
        retryCount: 0,
        costLog: null,
        artifact: { assets: [{ shotId: "shot-1", assetUrl: "https://airvio.co/a.mp4", ledgerEventId: "led-1" }] },
      },
      {
        id: "checkout",
        status: "completed",
        retryCount: 0,
        costLog: null,
        artifact: { checkout: { sessionId: "cs_ssot_1", payoutSettled: true } },
      },
    ],
    approvalGates: [{ gateId: "cloud-deploy", approvalState: "approved", estimatedCostUsd: 0, token: null }],
    budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0, providerSpendUsd: 0 },
    demoPack: null,
    failures: [],
    reconciliationFlags: [],
  };

  const evidence = extractManifestEvidence(ssotManifest);
  assert.equal(evidence.sources.length, 1);
  assert.equal(evidence.assets.length, 1);
  assert.equal(evidence.checkout.sessionId, "cs_ssot_1");
  assert.equal(evidence.deployApproved, true);

  const demoPack = buildDemoPackFromManifest(ssotManifest);
  assert.equal(demoPack.terminal, true);
  assert.equal(demoPack.artifactReferences.renderedAsset.status, "present");
  assert.equal(demoPack.artifactReferences.stripeSession.status, "present");
});

// ---------------------------------------------------------------------------
// 5. Endpoint hints + injected reachability flow through to buildDemoPack.
// ---------------------------------------------------------------------------

test("endpoint hints and injected reachability are forwarded to the assembler (no network)", () => {
  const { payload } = runVideoRemix(COMPLETE_LIVE_ARGS);
  const demoPack = buildDemoPackFromManifest(payload, {
    frontendUrl: "https://my-frontend.example",
    workerUrl: "https://airvio.co/agentic-graph/mcp",
    workerHealthUrl: "https://airvio.co/agentic-graph/mcp/health",
    // Deterministic injected probe: every url returns 503 (no socket opened).
    reachability: () => ({ status: 503 }),
  });

  assert.ok(demoPack.urls.some((u) => u.kind === FRONTEND_URL_KIND && u.url === "https://my-frontend.example"));
  assert.ok(demoPack.urls.some((u) => u.kind === "worker" && u.url === "https://airvio.co/agentic-graph/mcp"));
  // A confirmed non-200 marks the demo_presentation section unverified + records the failing url.
  assert.ok(demoPack.failingUrls.length >= 1);
  const demoSection = demoPack.sections.find((s) => s.id === "demo_presentation");
  assert.equal(demoSection.verified, false);
});

// ---------------------------------------------------------------------------
// 6. Non-terminal manifest: terminal:false, no demo urls emitted.
// ---------------------------------------------------------------------------

test("a non-terminal manifest yields terminal:false with no demo urls", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Halt at the render gate.",
    mode: "live",
    budgetUsd: 20,
    runId: "demo-template-approval-001",
    shotCount: 3,
    approvals: ["paid-model-call"],
    sourceCards: [
      { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
      { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
      { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
    ],
  });
  assert.equal(payload.state, "approval_required");

  const demoPack = buildDemoPackFromManifest(payload);
  assert.equal(demoPack.terminal, false);
  assert.deepEqual(demoPack.urls, []);
  assert.equal(demoPack.sections.length, 7);
});

// ---------------------------------------------------------------------------
// 7. Pure/total: junk input never throws.
// ---------------------------------------------------------------------------

test("extractManifestEvidence is total over junk input", () => {
  for (const junk of [undefined, null, 42, "x", [], { stages: "nope" }]) {
    const evidence = extractManifestEvidence(junk);
    assert.equal(typeof evidence, "object");
    assert.ok(Array.isArray(evidence.sources));
    assert.ok(Array.isArray(evidence.assets));
    assert.equal(typeof evidence.checkout, "object");
    assert.equal(evidence.deployApproved, false);
  }
});
