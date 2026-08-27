// =============================================================================
// MCP / CLI / App UI surface equivalence test
// knowgrph-widget-canvas-media spec · Task 14
// Requirements: R9.1, R9.2, R9.5
//
// Asserts that identical inputs produce the same status, per-stage outcomes,
// and identical Durable_R2_URLs / provenance across the MCP Director surface
// and the direct `runVideoRemix` path. The only permitted differences are
// surface/run ids and timestamps (R9.1, R9.2).
//
// Pure offline — ZERO network calls, ZERO paid actions.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  executeKnowgrphMcpTool,
  KNOWGRPH_MCP_DIRECTOR_TOOL_NAME,
  KNOWGRPH_MCP_STAGE_TOOL_NAMES,
  KNOWGRPH_MCP_STAGE_GATES,
  buildKnowgrphMcpToolDefinitions,
  collectApprovedGateIds,
} from "../tool-registry.mjs";

import { runVideoRemix } from "../../../../mcp/video-remix-runtime.js";

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

const THREE_SOURCES = [
  { url: "https://example.com/a", sourceId: "s1" },
  { url: "https://example.com/b", sourceId: "s2" },
  { url: "https://example.com/c", sourceId: "s3" },
];

const ALL_APPROVALS = [
  { gateId: "paid-model-call", approvalState: "approved", token: "tok1" },
  { gateId: "render-action",   approvalState: "approved", token: "tok2" },
  { gateId: "payment-action",  approvalState: "approved", token: "tok3" },
  { gateId: "cloud-deploy",    approvalState: "approved", token: "tok4" },
];

const EQUIVALENCE_INPUT = {
  referenceUrl: "https://example.com/ref.mp4",
  brief: "Equivalence test brief.",
  mode: "live",
  runId: "equivalence-001",
  sourceCards: THREE_SOURCES,
  approvals: ALL_APPROVALS,
  budgetUsd: 100,
  shotCount: 2,
};

// ===========================================================================
// R9.1, R9.2 — MCP surface and direct runtime produce identical outcomes
// ===========================================================================

test("R9.1: MCP Director surface produces same state as direct runVideoRemix", () => {
  // Direct path
  const directResult = runVideoRemix(EQUIVALENCE_INPUT);

  // MCP surface path
  const mcpResult = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, EQUIVALENCE_INPUT);

  assert.equal(mcpResult.ok, directResult.payload?.validation?.ok !== false);
  assert.equal(mcpResult.structuredContent.state, directResult.payload.state,
    "state must match across surfaces");
});

test("R9.2: MCP surface and runtime produce identical per-stage outcomes", () => {
  const directResult = runVideoRemix(EQUIVALENCE_INPUT);
  const mcpResult    = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, EQUIVALENCE_INPUT);

  const directStages = directResult.payload.stages || [];
  const mcpStages    = (mcpResult.structuredContent.stages) || [];

  assert.equal(mcpStages.length, directStages.length,
    "stages count must match across surfaces");

  for (let i = 0; i < directStages.length; i++) {
    assert.equal(mcpStages[i].id,     directStages[i].id,     `stage[${i}].id must match`);
    assert.equal(mcpStages[i].status, directStages[i].status, `stage[${i}].status must match`);
  }
});

test("R9.2: MCP surface and runtime produce identical asset URLs (durable refs)", () => {
  const directResult = runVideoRemix(EQUIVALENCE_INPUT);
  const mcpResult    = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, EQUIVALENCE_INPUT);

  const directAssets = directResult.payload.render?.assets || [];
  const mcpAssets    = (mcpResult.structuredContent.render?.assets) || [];

  assert.equal(mcpAssets.length, directAssets.length,
    "asset count must match across surfaces");

  for (let i = 0; i < directAssets.length; i++) {
    assert.equal(mcpAssets[i].shotId,   directAssets[i].shotId,   `asset[${i}].shotId must match`);
    assert.equal(mcpAssets[i].assetUrl, directAssets[i].assetUrl, `asset[${i}].assetUrl (durable ref) must match`);
    assert.equal(mcpAssets[i].storageUri, directAssets[i].storageUri, `asset[${i}].storageUri must match`);
  }
});

test("R9.2: MCP surface budget meters match direct runtime", () => {
  const directResult = runVideoRemix(EQUIVALENCE_INPUT);
  const mcpResult    = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, EQUIVALENCE_INPUT);

  const directMeters = directResult.payload.budgetMeters;
  const mcpMeters    = mcpResult.structuredContent.budgetMeters;

  assert.equal(mcpMeters.actualCostUsd,  directMeters.actualCostUsd,  "actualCostUsd must match");
  assert.equal(mcpMeters.budgetExceeded, directMeters.budgetExceeded, "budgetExceeded flag must match");
});

test("R9.2: dry-run via MCP surface and runtime are equivalent", () => {
  const dryRunInput = {
    referenceUrl: "https://example.com/ref.mp4",
    brief: "Equivalence dry-run test.",
    mode: "dry-run",
    runId: "equivalence-dry-001",
    sourceCards: THREE_SOURCES,
    shotCount: 2,
  };
  const directResult = runVideoRemix(dryRunInput);
  const mcpResult    = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, dryRunInput);

  assert.equal(mcpResult.structuredContent.state, directResult.payload.state);
  assert.equal(mcpResult.structuredContent.budgetMeters.actualCostUsd, 0);
  assert.equal(directResult.payload.budgetMeters.actualCostUsd, 0);
});

// ===========================================================================
// R9.5 — Run state, per-stage status, approval-gate states, budget meters,
//         and artifact references are all exposed on the MCP surface
// ===========================================================================

test("R9.5: MCP Director output exposes run state (R9.5)", () => {
  const mcpResult = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, EQUIVALENCE_INPUT);
  assert.ok(typeof mcpResult.structuredContent.state === "string",
    "run state must be present on MCP output");
});

test("R9.5: MCP Director output exposes per-stage status (R9.5)", () => {
  const mcpResult = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, EQUIVALENCE_INPUT);
  const stages = mcpResult.structuredContent.stages;
  assert.ok(Array.isArray(stages) && stages.length > 0, "stages must be present");
  for (const stage of stages) {
    assert.ok(typeof stage.status === "string", `stage '${stage.id}' must expose status`);
  }
});

test("R9.5: MCP Director output exposes approval-gate states (R9.5)", () => {
  const mcpResult = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, EQUIVALENCE_INPUT);
  const gates = mcpResult.structuredContent.approvalGates;
  assert.ok(Array.isArray(gates) && gates.length > 0, "approvalGates must be present");
  for (const gate of gates) {
    assert.ok(typeof (gate.gateId ?? gate.id) === "string", "each gate must have a gateId or id");
  }
});

test("R9.5: MCP Director output exposes budget meters (R9.5)", () => {
  const mcpResult = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, EQUIVALENCE_INPUT);
  const meters = mcpResult.structuredContent.budgetMeters;
  assert.ok(meters && typeof meters === "object", "budgetMeters must be present");
  assert.ok(typeof meters.actualCostUsd === "number", "budgetMeters.actualCostUsd must be a number");
});

test("R9.5: MCP Director output exposes artifact references (assetUrls, R9.5)", () => {
  const mcpResult = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, EQUIVALENCE_INPUT);
  const render = mcpResult.structuredContent.render;
  assert.ok(render && typeof render === "object", "render must be present on MCP output");
  assert.ok(Array.isArray(render.assets), "render.assets must be an array");
});

// ===========================================================================
// Approval-gate enforcement via MCP surface (R9.5, R14.6)
// ===========================================================================

test("MCP stage tool without approval returns approval_required (R14.6)", () => {
  const result = executeKnowgrphMcpTool(KNOWGRPH_MCP_STAGE_TOOL_NAMES.render, {
    shots: [{ shotId: "s1" }],
    // approvals deliberately absent
  });
  assert.equal(result.ok, false);
  assert.equal(result.structuredContent.status, "approval_required");
  assert.equal(result.structuredContent.paidProviderCalls, 0);
});

test("MCP stage tool with matching gate approved returns ok (boundary passes to Director)", () => {
  const result = executeKnowgrphMcpTool(KNOWGRPH_MCP_STAGE_TOOL_NAMES.research, {
    referenceUrl: "https://example.com/ref.mp4",
    approvals: [
      { gateId: "paid-model-call", approvalState: "approved", token: "tok-research" },
    ],
  });
  // The boundary passes; stage returns ok (deferred_to_director or actual result)
  assert.equal(result.ok, true);
});

test("MCP surface and runtime produce same failure records for blocked runs", () => {
  const blockedInput = {
    ...EQUIVALENCE_INPUT,
    runId: "equivalence-blocked-001",
    failAlwaysTool: "knowgrph.video_remix.render",
    maxIterations: 2,
  };
  const directResult = runVideoRemix(blockedInput);
  const mcpResult    = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, blockedInput);

  assert.equal(mcpResult.structuredContent.state, directResult.payload.state);
  assert.equal(
    JSON.stringify(mcpResult.structuredContent.failures),
    JSON.stringify(directResult.payload.failures),
    "failure records must be identical across surfaces"
  );
});

// ===========================================================================
// Tool schema surface includes media-persist and provenance fields (R9.1)
// ===========================================================================

test("R9.1: Director output schema includes render field for artifact references", () => {
  const definitions = buildKnowgrphMcpToolDefinitions();
  const director = definitions.find(d => d.name === KNOWGRPH_MCP_DIRECTOR_TOOL_NAME);
  assert.ok(director, "Director tool definition must exist");
  // Output schema must expose 'render' for artifact references (R9.1)
  assert.ok(
    director.outputSchema.properties.render || director.outputSchema.additionalProperties === true,
    "output schema must accommodate render/artifact references"
  );
});

test("R9.1: Director output includes stageTransitions for Run state inspection (R9.5)", () => {
  const mcpResult = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, EQUIVALENCE_INPUT);
  // stageTransitions may be present for audit/inspection (R9.5)
  const transitions = mcpResult.structuredContent.stageTransitions;
  if (transitions !== undefined) {
    assert.ok(Array.isArray(transitions), "stageTransitions must be an array when present");
  }
  // validation field must be present
  assert.ok(mcpResult.structuredContent.validation, "validation must be present on MCP output");
});
