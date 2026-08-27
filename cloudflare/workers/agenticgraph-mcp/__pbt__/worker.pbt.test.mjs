// =============================================================================
// Property-based tests — knowgrph control-plane McpAgent worker tier
// (spec task 9.1). Properties 25, 26, 27. fast-check, >=100 runs each. Durable
// storage is an in-memory shim (the RunManifestPersistence seam), so ZERO live
// network / Durable Object calls occur.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  RunManifestPersistence,
  deriveStageTransitionDiagnostics,
} from "../run-manifest-store.mjs";
import {
  buildKnowgrphMcpToolDefinitions,
  KNOWGRPH_MCP_DIRECTOR_TOOL_NAME,
  KNOWGRPH_MCP_STAGE_TOOL_NAMES,
} from "../tool-registry.mjs";

const RUNS = 200;
const wordArb = fc.string({ minLength: 1, maxLength: 16 }).map((s) => s.replace(/[^A-Za-z0-9]/g, "x") || "x");

/** Deterministic in-memory storage shim compatible with DurableObjectStorage. */
function createMemoryStorage() {
  const map = new Map();
  return {
    async get(key) { return map.get(key); },
    async put(entries) { for (const [k, v] of Object.entries(entries)) map.set(k, v); },
  };
}

// -----------------------------------------------------------------------------
// Feature: knowgrph-acos-mcp-connector, Property 25: For any Director run state change, after the Mcp_Agent persists the updated Run_Manifest a subsequent GET /runs/{id} for that run returns the latest persisted state.
// -----------------------------------------------------------------------------
test("Property 25: durable manifest persistence read-back consistency", async () => {
  await fc.assert(
    fc.asyncProperty(
      wordArb,
      fc.array(fc.constantFrom("running", "approval_required", "blocked", "completed", "budget_exceeded"), { minLength: 1, maxLength: 6 }),
      async (runId, stateSequence) => {
        const persistence = new RunManifestPersistence({ storage: createMemoryStorage() });
        let last;
        // Apply a sequence of state changes, persisting each (R14.2).
        for (const state of stateSequence) {
          last = { runId: `run-${runId}`, state, stages: [], approvalGates: [], budgetMeters: { estimatedCostUsd: 0 } };
          await persistence.put(last);
        }
        // A subsequent read returns the LATEST persisted state.
        const record = await persistence.get();
        assert.ok(record, "a persisted record is readable");
        assert.equal(record.runId, `run-${runId}`);
        assert.equal(record.manifest.state, last.state);
        assert.deepEqual(record.manifest, JSON.parse(JSON.stringify(last)));
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: knowgrph-acos-mcp-connector, Property 26: For any remote client request for the tool surface, the returned list includes knowgrph.video_remix.run and each stage tool, and every listed tool includes both its input schema and its output schema.
// -----------------------------------------------------------------------------
test("Property 26: tool listing exposes input and output schemas", () => {
  const expectedNames = [KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, ...Object.values(KNOWGRPH_MCP_STAGE_TOOL_NAMES)];
  // The tool registry is static; the property is that EVERY listed tool — for
  // any (idempotent) request — carries both schemas and the full set is present.
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1000 }), () => {
      const tools = buildKnowgrphMcpToolDefinitions();
      const names = tools.map((t) => t.name);
      for (const expected of expectedNames) {
        assert.ok(names.includes(expected), `tool ${expected} is listed`);
      }
      for (const tool of tools) {
        assert.ok(tool.inputSchema && typeof tool.inputSchema === "object", `${tool.name} has an inputSchema`);
        assert.ok(tool.outputSchema && typeof tool.outputSchema === "object", `${tool.name} has an outputSchema`);
      }
    }),
    { numRuns: 100 },
  );
});

// -----------------------------------------------------------------------------
// Feature: knowgrph-acos-mcp-connector, Property 27: For any stage transition during a Director run, the Mcp_Agent emits an observability diagnostic containing the run identifier, the originating stage id, the destination stage id, a UTC timestamp, and the transition outcome status.
// -----------------------------------------------------------------------------
test("Property 27: stage-transition diagnostics are complete", () => {
  const stageArb = fc.record({
    id: fc.constantFrom("ingest", "research", "storyboard", "render", "publish", "checkout"),
    status: fc.constantFrom("complete", "approval_required", "weak_signal", "blocked", "pending"),
  });
  fc.assert(
    fc.property(
      wordArb,
      fc.array(stageArb, { minLength: 0, maxLength: 8 }),
      fc.integer({ min: 0, max: 2_000_000_000_000 }),
      (runId, stages, nowMs) => {
        const manifest = { runId: `run-${runId}`, stages };
        const diagnostics = deriveStageTransitionDiagnostics(manifest, { nowMs });
        // One diagnostic per consecutive transition (N stages -> N-1).
        const orderedCount = stages.filter((s) => s && s.id != null && String(s.id).length > 0).length;
        assert.equal(diagnostics.length, Math.max(0, orderedCount - 1));
        for (const d of diagnostics) {
          assert.equal(d.runId, `run-${runId}`);
          assert.ok(typeof d.fromStage === "string" && d.fromStage.length > 0);
          assert.ok(typeof d.toStage === "string" && d.toStage.length > 0);
          // A valid ISO-8601 UTC timestamp.
          assert.ok(!Number.isNaN(Date.parse(d.utcTimestamp)));
          assert.ok(d.utcTimestamp.endsWith("Z"));
          // Outcome status present (falls back to "unknown").
          assert.ok(typeof d.outcomeStatus === "string" && d.outcomeStatus.length > 0);
        }
      },
    ),
    { numRuns: RUNS },
  );
});
