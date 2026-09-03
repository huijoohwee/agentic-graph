// =============================================================================
// Property-based tests — agentic-graph Agentic OS status registries.
// One generated test per property in .kiro/specs/agentic-graph-agentic-os/design.md.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";

import { APPROVAL_GATE_ID_VALUES } from "../../contracts/approval.schema.js";
import { COST_LOG_UNKNOWN } from "../../contracts/cost-log.schema.js";
import { buildAgenticGraphVdeoxplnRegistry } from "../../canvas/src/features/agent-ready/agentic-graph-vdeoxpln-contract.mjs";
import { buildAgenticGraphLocalMcpToolDefinitions } from "../local-tool-contract.js";
import {
  listCapabilityRegistry,
  listCircuitBreakerRegistry,
  listGateCatalog,
  listProcessRegistry,
  runOsStatusTool,
  summarizeCostLedger,
} from "../os-status-runtime.js";
import {
  OS_STATUS_COUNT_UNAVAILABLE,
  OS_STATUS_TOOL_NAME,
  OS_STATUS_VIEWS,
  OS_STATUS_ZERO_COST_LOG,
  SHOWRUNNER_STAGE_APPROVAL_GATE_ID,
} from "../os-status-contract.js";

const RUNS = 100;
const HARNESSES = ["showrunner", "superagent", "video_remix"];
const RUN_DIRS = {
  showrunner: "showrunner/runs",
  superagent: "data/superagent-runs",
  video_remix: "data/video-remix-runs",
};
const VALID_VIEWS = Object.values(OS_STATUS_VIEWS);

const safeId = (value) => String(value || "x").replace(/[^A-Za-z0-9_-]/g, "x") || "x";
const iso = (offset) => new Date(Date.UTC(2025, 0, 1, 0, 0, offset)).toISOString();
const sumMoney = (values) => Number(values.reduce((total, value) => total + value, 0).toFixed(6));
const validCostLog = (estimatedCostUsd, model = "test-model") => ({
  model,
  prompt_tokens: 1,
  completion_tokens: 1,
  cache_hits: 0,
  estimated_cost_usd: estimatedCostUsd,
  incomplete: false,
});
const invalidCostLog = () => ({
  model: "",
  prompt_tokens: -1,
  completion_tokens: 0,
  cache_hits: 0,
  estimated_cost_usd: -1,
  incomplete: false,
});

async function withRoot(callback) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-os-pbt-"));
  try {
    await Promise.all(Object.values(RUN_DIRS).map((dir) => fs.mkdir(path.join(rootDir, dir), { recursive: true })));
    return await callback(rootDir);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeRun(rootDir, harness, runId, record) {
  const runDir = path.join(rootDir, RUN_DIRS[harness], runId);
  await fs.mkdir(runDir, { recursive: true });
  if (record === null) return;
  const fileName = harness === "video_remix" ? "run-manifest.json" : "state.json";
  await writeJson(path.join(runDir, fileName), record);
}

const creditLedgerEvent = (runId, estimatedCostUsd) => ({
  ledgerEventId: `ledger-${runId}`,
  runId,
  shotId: `shot-${runId}`,
  provider: "mock",
  providerSpendUsd: estimatedCostUsd,
});

async function writeCostRecord(rootDir, harness, runId, costLog, sourceKind = "cost_log") {
  const runDir = path.join(rootDir, RUN_DIRS[harness], runId);
  await fs.mkdir(runDir, { recursive: true });
  if (sourceKind === "credit_ledger") {
    if (harness === "video_remix") {
      await writeJson(path.join(runDir, "run-manifest.json"), {
        run_id: runId,
        state: "running",
        render: {
          assets: [{
            ledgerEventId: `ledger-${runId}`,
            shotId: `shot-${runId}`,
            provider: "mock",
            providerSpendCents: Math.round(costLog.estimated_cost_usd * 100),
          }],
        },
      });
      return;
    }
    await writeJson(path.join(runDir, "state.json"), { run_id: runId, status: "running", created_at: iso(0) });
    await fs.writeFile(path.join(runDir, "credit-ledger.jsonl"), `${JSON.stringify(creditLedgerEvent(runId, costLog.estimated_cost_usd))}\n`);
    return;
  }
  if (harness === "video_remix") {
    await writeJson(path.join(runDir, "run-manifest.json"), { run_id: runId, state: "running", rawCostLogs: [costLog] });
  } else {
    await writeJson(path.join(runDir, "state.json"), { run_id: runId, status: "running", created_at: iso(0) });
    await fs.writeFile(path.join(runDir, "cost-log.jsonl"), `${JSON.stringify(costLog)}\n`);
  }
}

async function withFetch(stub, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function snapshotFiles(rootDir) {
  const snapshot = {};
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath);
      } else {
        snapshot[path.relative(rootDir, filePath)] = await fs.readFile(filePath, "utf8");
      }
    }
  }
  await visit(rootDir);
  return snapshot;
}

const readableRecord = (harness, runId, index = 0) => {
  if (harness === "video_remix") return { run_id: runId, state: "running", created_at: iso(index) };
  if (harness === "superagent") return { run: { run_id: runId, status: "running", created_at: iso(index) } };
  return { run_id: runId, status: "running", created_at: iso(index) };
};

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 1: Process_Registry coverage and partial-failure behavior
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 1: Process_Registry coverage and partial-failure behavior", async () => {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.record({ harness: fc.constantFrom(...HARNESSES), readable: fc.boolean() }), { maxLength: 20 }),
    async (sources) => withRoot(async (rootDir) => {
      await Promise.all(sources.map(({ harness, readable }, index) =>
        writeRun(rootDir, harness, `p1-${index}`, readable ? readableRecord(harness, `p1-${index}`, index) : null)));
      const result = await listProcessRegistry({ rootDir });
      assert.equal(result.ok, true);
      assert.equal(result.entries.length, sources.filter((source) => source.readable).length);
      assert.equal(result.unavailableSources.length, sources.filter((source) => !source.readable).length);
    }),
  ), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 2: Process_Entry normalization shape
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 2: Process_Entry normalization shape", async () => {
  await fc.assert(fc.asyncProperty(
    fc.constantFrom(...HARNESSES),
    fc.string({ minLength: 1, maxLength: 24 }),
    async (harness, rawId) => withRoot(async (rootDir) => {
      const runId = `p2-${safeId(rawId)}`;
      await writeRun(rootDir, harness, runId, readableRecord(harness, runId, 1));
      const result = await listProcessRegistry({ rootDir });
      assert.equal(result.entries.length, 1);
      assert.deepEqual(Object.keys(result.entries[0]).sort(), ["harness", "processId", "sourceRef", "startedAt", "status"]);
      assert.equal(result.entries[0].harness, harness);
      assert.equal(result.entries[0].processId, runId);
    }),
  ), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 3: Process_Registry 200-cap and truncation-by-recency
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 3: Process_Registry 200-cap and truncation-by-recency", async () => {
  await fc.assert(fc.asyncProperty(
    fc.oneof(fc.integer({ min: 0, max: 230 }), fc.constantFrom(199, 200, 201, 230)),
    async (count) => withRoot(async (rootDir) => {
      for (let index = 0; index < count; index += 1) {
        await writeRun(rootDir, "showrunner", `p3-${index}`, readableRecord("showrunner", `p3-${index}`, index));
      }
      const result = await listProcessRegistry({ rootDir });
      assert.equal(result.entries.length, Math.min(count, 200));
      assert.equal(result.truncated, count > 200);
      if (count > 0) assert.equal(result.entries[0].processId, `p3-${count - 1}`);
    }),
  ), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 4: Capability_Registry union over reachable catalogs
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 4: Capability_Registry union over reachable catalogs", async () => {
  await fc.assert(fc.asyncProperty(
    fc.uniqueArray(fc.string({ minLength: 1, maxLength: 18 }).map((id) => `agentic-graph.generated.${safeId(id)}`), { maxLength: 5 }),
    async (toolIds) => withFetch(async () => ({
      ok: true,
      json: async () => ({ result: { tools: toolIds.map((name) => ({ name })) } }),
    }), async () => {
      const result = await listCapabilityRegistry({ cloudflareMcpUrl: "https://worker.test/mcp" });
      const actual = new Set(result.entries.map((entry) => entry.toolId));
      assert.equal(result.ok, true);
      assert.equal(actual.has(OS_STATUS_TOOL_NAME), true);
      for (const toolId of toolIds) assert.equal(actual.has(toolId), true);
    }),
  ), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 5: Capability entry minimum-fields projection
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 5: Capability entry minimum-fields projection", async () => {
  await fc.assert(fc.asyncProperty(fc.boolean(), async (reachable) => withFetch(
    async () => {
      if (!reachable) throw new Error("catalog down");
      return { ok: true, json: async () => ({ result: { tools: [{ name: "agentic-graph.generated.capability" }] } }) };
    },
    async () => {
      const result = await listCapabilityRegistry({ cloudflareMcpUrl: "https://worker.test/mcp" });
      for (const entry of result.entries) {
        assert.ok(entry.toolId);
        assert.ok(entry.owningHarness);
        assert.ok(entry.schemaRef);
      }
    },
  )), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 6: Capability_Registry de-duplication by tool id
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 6: Capability_Registry de-duplication by tool id", async () => {
  await fc.assert(fc.asyncProperty(fc.constant(OS_STATUS_TOOL_NAME), async (duplicateToolId) => withFetch(async () => ({
    ok: true,
    json: async () => ({ result: { tools: [{ name: duplicateToolId }] } }),
  }), async () => {
    const result = await listCapabilityRegistry({ cloudflareMcpUrl: "https://worker.test/mcp" });
    const matches = result.entries.filter((entry) => entry.toolId === duplicateToolId);
    const expectedSources = new Set(["cloudflare_mcp_agent"]);
    if (buildAgenticGraphLocalMcpToolDefinitions().some((tool) => tool.name === duplicateToolId)) {
      expectedSources.add("local_mcp");
    }
    if (buildAgenticGraphVdeoxplnRegistry().some((entry) =>
      Object.values(entry.tools || {}).some((tools) => Array.isArray(tools) && tools.includes(duplicateToolId)))) {
      expectedSources.add("vdeoxpln");
    }
    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].sourceCatalogs.sort(), [...expectedSources].sort());
  })), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 7: Capability_Registry partial-unreachability behavior
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 7: Capability_Registry partial-unreachability behavior", async () => {
  await fc.assert(fc.asyncProperty(fc.boolean(), async (reachable) => withFetch(async () => {
    if (!reachable) throw new Error("catalog down");
    return { ok: true, json: async () => ({ result: { tools: [] } }) };
  }, async () => {
    const result = await listCapabilityRegistry({ cloudflareMcpUrl: "https://worker.test/mcp" });
    assert.equal(result.ok, true);
    assert.equal(result.entries.some((entry) => entry.toolId === OS_STATUS_TOOL_NAME), true);
    assert.equal(result.unreachableCatalogs.includes("cloudflare_mcp_agent"), !reachable);
  })), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 8: Cost_Ledger_Aggregator per-harness total correctness
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 8: Cost_Ledger_Aggregator per-harness total correctness", async () => {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.record({
      harness: fc.constantFrom(...HARNESSES),
      sourceKind: fc.constantFrom("cost_log", "credit_ledger"),
      cents: fc.integer({ min: 0, max: 100000 }),
    }), { minLength: 1, maxLength: 12 }),
    async (records) => withRoot(async (rootDir) => {
      for (const [index, record] of records.entries()) {
        await writeCostRecord(rootDir, record.harness, `p8-${index}`, validCostLog(record.cents / 100, `m-${index}`), record.sourceKind);
      }
      const result = await summarizeCostLedger({ rootDir });
      for (const harness of HARNESSES) {
        const expected = sumMoney(records.filter((record) => record.harness === harness).map((record) => record.cents / 100));
        if (expected > 0) assert.equal(result.totalsByHarness[harness].estimated_cost_usd, expected);
      }
    }),
  ), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 9: Cost_Ledger_Aggregator validation gate
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 9: Cost_Ledger_Aggregator validation gate", async () => {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.integer({ min: 0, max: 5000 }), { maxLength: 6 }),
    fc.integer({ min: 1, max: 6 }),
    async (validCents, invalidCount) => withRoot(async (rootDir) => {
      const runDir = path.join(rootDir, RUN_DIRS.showrunner, "p9");
      await writeRun(rootDir, "showrunner", "p9", readableRecord("showrunner", "p9"));
      const lines = [
        ...validCents.map((cents, index) => validCostLog(cents / 100, `valid-${index}`)),
        ...Array.from({ length: invalidCount }, invalidCostLog),
      ].map((entry) => JSON.stringify(entry)).join("\n");
      await fs.writeFile(path.join(runDir, "cost-log.jsonl"), `${lines}\n`);
      const result = await summarizeCostLedger({ rootDir });
      const expected = sumMoney(validCents.map((cents) => cents / 100));
      assert.equal(result.totalsByHarness.showrunner?.estimated_cost_usd || 0, expected);
      assert.equal(result.validationFailures.length, invalidCount);
    }),
  ), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 10: Cost_Emission_Gap detection correctness
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 10: Cost_Emission_Gap detection correctness", async () => {
  await fc.assert(fc.asyncProperty(
    fc.boolean(),
    fc.boolean(),
    async (hasProcess, hasCost) => fc.pre(hasProcess || hasCost) ?? withRoot(async (rootDir) => {
      if (hasProcess) await writeRun(rootDir, "showrunner", "p10", readableRecord("showrunner", "p10"));
      if (hasCost) await writeCostRecord(rootDir, "showrunner", hasProcess ? "p10" : "p10-cost", validCostLog(0.01));
      const result = await summarizeCostLedger({ rootDir });
      const hasGap = result.costEmissionGaps.some((gap) => gap.harness === "showrunner");
      assert.equal(hasGap, !hasCost);
    }),
  ), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 11: Gate_Catalog canonical-plus-one completeness
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 11: Gate_Catalog canonical-plus-one completeness", async () => {
  await fc.assert(fc.asyncProperty(fc.boolean(), async () => withRoot(async (rootDir) => {
    const result = await listGateCatalog({ rootDir });
    const gateIds = new Set(result.gates.map((gate) => gate.gateId));
    for (const gateId of APPROVAL_GATE_ID_VALUES) assert.equal(gateIds.has(gateId), true);
    assert.equal(gateIds.has(SHOWRUNNER_STAGE_APPROVAL_GATE_ID), true);
    assert.equal(gateIds.size, new Set([...APPROVAL_GATE_ID_VALUES, SHOWRUNNER_STAGE_APPROVAL_GATE_ID]).size);
  })), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 12: Gate_Catalog pending-entry reporting
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 12: Gate_Catalog pending-entry reporting", async () => {
  await fc.assert(fc.asyncProperty(
    fc.integer({ min: 1, max: 5 }),
    fc.boolean(),
    async (pendingVideoRemixCount, showrunnerAwaiting) => withRoot(async (rootDir) => {
      if (showrunnerAwaiting) await writeRun(rootDir, "showrunner", "p12-show", { run_id: "p12-show", status: "awaiting_review" });
      for (let index = 0; index < pendingVideoRemixCount; index += 1) {
        await writeRun(rootDir, "video_remix", `p12-${index}`, {
          run_id: `p12-${index}`,
          state: "blocked",
          approvalGates: [{ gateId: "paid-model-call", approvalState: "pending", estimatedCostUsd: index / 100, token: null }],
        });
      }
      const result = await listGateCatalog({ rootDir });
      const pending = result.gates.filter((gate) => gate.approvalState === "pending");
      assert.equal(pending.length, pendingVideoRemixCount + (showrunnerAwaiting ? 1 : 0));
      for (const gate of pending) for (const field of ["gateId", "approvalState", "estimatedCostUsd", "token"]) assert.equal(field in gate, true);
    }),
  ), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 13: Gate_Catalog unknown-cost indicator (no fabrication)
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 13: Gate_Catalog unknown-cost indicator (no fabrication)", async () => {
  await fc.assert(fc.asyncProperty(fc.string({ minLength: 1, maxLength: 20 }), async (runIdRaw) => withRoot(async (rootDir) => {
    const runId = `p13-${safeId(runIdRaw)}`;
    await writeRun(rootDir, "showrunner", runId, { run_id: runId, status: "awaiting_review" });
    const result = await listGateCatalog({ rootDir });
    const showrunnerGate = result.gates.find((gate) => gate.gateId === SHOWRUNNER_STAGE_APPROVAL_GATE_ID && gate.sourceRunRef);
    assert.equal(showrunnerGate.estimatedCostUsd, COST_LOG_UNKNOWN);
  })), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 14: Circuit_Breaker_Registry configured-bound transcription fidelity
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 14: Circuit_Breaker_Registry configured-bound transcription fidelity", async () => {
  await fc.assert(fc.asyncProperty(
    fc.record({
      max_steps: fc.integer({ min: 1, max: 500 }),
      max_retries_per_task: fc.integer({ min: 0, max: 20 }),
      max_wall_seconds: fc.integer({ min: 1, max: 3600 }),
    }),
    async (budget) => withRoot(async (rootDir) => {
      await writeRun(rootDir, "superagent", "p14", { run: { run_id: "p14", status: "running", budget, step_count: 1 } });
      const result = await listCircuitBreakerRegistry({ rootDir });
      const superagent = result.breakers.find((breaker) => breaker.harness === "superagent" && breaker.processId === "p14");
      const videodb = result.breakers.find((breaker) => breaker.harness === "video_intelligence");
      const remix = result.breakers.find((breaker) => breaker.harness === "video_remix" && breaker.processId === "all");
      assert.deepEqual(superagent.configuredBounds, { maxSteps: budget.max_steps, maxRetriesPerTask: budget.max_retries_per_task, maxWallSeconds: budget.max_wall_seconds });
      assert.equal(videodb.configuredBound, "36x10000ms poll");
      assert.match(remix.configuredBound, /iterations/);
      assert.ok(superagent.exitCondition);
      assert.ok(videodb.exitCondition);
      assert.ok(remix.exitCondition);
    }),
  ), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 15: Circuit_Breaker_Registry current-iteration-count always present
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 15: Circuit_Breaker_Registry current-iteration-count always present", async () => {
  await fc.assert(fc.asyncProperty(
    fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
    async (stepCount) => withRoot(async (rootDir) => {
      await writeRun(rootDir, "superagent", "p15", { run: { run_id: "p15", status: "running", ...(stepCount === undefined ? {} : { step_count: stepCount }) } });
      const result = await listCircuitBreakerRegistry({ rootDir });
      for (const breaker of result.breakers) {
        assert.equal("currentIterationCount" in breaker, true);
        assert.ok(Number.isInteger(breaker.currentIterationCount) || breaker.currentIterationCount === OS_STATUS_COUNT_UNAVAILABLE);
      }
    }),
  ), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 16: Os_Status_Tool structured-error-on-failure
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 16: Os_Status_Tool structured-error-on-failure", async () => {
  await fc.assert(fc.asyncProperty(
    fc.constantFrom(OS_STATUS_VIEWS.processList, OS_STATUS_VIEWS.costSummary, OS_STATUS_VIEWS.gateCatalog, OS_STATUS_VIEWS.circuitBreakers),
    async (view) => {
      const result = await runOsStatusTool(view, { cloudflareMcpUrl: "" }, { rootDir: null });
      assert.equal(result.ok, false);
      assert.equal(result.view, view);
      assert.equal(result.errorCode, "registry_failure");
      assert.ok(result.message);
    },
  ), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 17: Os_Status_Tool zero-cost self-accounting
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 17: Os_Status_Tool zero-cost self-accounting", async () => {
  await fc.assert(fc.asyncProperty(fc.constantFrom(...VALID_VIEWS), async (view) => withRoot(async (rootDir) => {
    const result = await runOsStatusTool(view, { cloudflareMcpUrl: "" }, { rootDir });
    assert.equal(result.ok, true);
    assert.deepEqual(result.cost_log, OS_STATUS_ZERO_COST_LOG);
  })), { numRuns: RUNS });
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-agentic-os, Property 18: Registry read-only invariant across all read views
// -----------------------------------------------------------------------------
test("Feature: agentic-graph-agentic-os, Property 18: Registry read-only invariant across all read views", async () => {
  await fc.assert(fc.asyncProperty(fc.integer({ min: 0, max: 10 }), async (costCents) => withRoot(async (rootDir) => {
    await writeRun(rootDir, "showrunner", "p18-show", { run_id: "p18-show", status: "awaiting_review", max_retries: 2, token_budget: 10 });
    await writeCostRecord(rootDir, "superagent", "p18-super", validCostLog(costCents / 100));
    await writeRun(rootDir, "video_remix", "p18-video", {
      run_id: "p18-video",
      state: "blocked",
      approvalGates: [{ gateId: "paid-model-call", approvalState: "pending", estimatedCostUsd: COST_LOG_UNKNOWN, token: null }],
    });
    const beforeFiles = await snapshotFiles(rootDir);
    const beforeConstants = JSON.stringify({ APPROVAL_GATE_ID_VALUES, OS_STATUS_ZERO_COST_LOG });
    await listProcessRegistry({ rootDir });
    await summarizeCostLedger({ rootDir });
    await listGateCatalog({ rootDir });
    await listCircuitBreakerRegistry({ rootDir });
    assert.deepEqual(await snapshotFiles(rootDir), beforeFiles);
    assert.equal(JSON.stringify({ APPROVAL_GATE_ID_VALUES, OS_STATUS_ZERO_COST_LOG }), beforeConstants);
  })), { numRuns: RUNS });
});
