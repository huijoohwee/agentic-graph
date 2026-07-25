import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildKnowgrphLocalMcpToolDefinitions, KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";
import {
  listCircuitBreakerRegistry,
  listCapabilityRegistry,
  listGateCatalog,
  listProcessRegistry,
  runOsStatusTool,
  summarizeCostLedger,
} from "../os-status-runtime.js";

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-os-status-"));
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("Feature: knowgrph-agentic-os, process_list normalizes readable harness state and records unavailable sources", async () => {
  const rootDir = await tempRoot();
  const showrunnerStatePath = path.join(rootDir, "showrunner/runs/show-1/state.json");
  const superagentStatePath = path.join(rootDir, "data/superagent-runs/super-1/state.json");
  const videoRemixManifestPath = path.join(rootDir, "data/video-remix-runs/video-1/run-manifest.json");
  await writeJson(showrunnerStatePath, {
    run_id: "show-1",
    run_status: "awaiting_review",
    startedAt: "2026-07-02T09:00:00.000Z",
  });
  await writeJson(superagentStatePath, {
    run: {
      run_id: "super-1",
      status: "running",
      created_at: "2026-07-02T10:00:00.000Z",
    },
  });
  await writeJson(videoRemixManifestPath, {
    runId: "video-1",
    state: "approval_required",
    createdAt: "2026-07-02T11:00:00.000Z",
  });
  await fs.mkdir(path.join(rootDir, "data/superagent-runs/no-state"), { recursive: true });

  const beforeShowrunner = await fs.readFile(showrunnerStatePath, "utf8");
  const beforeSuperagent = await fs.readFile(superagentStatePath, "utf8");
  const beforeVideoRemix = await fs.readFile(videoRemixManifestPath, "utf8");
  const result = await listProcessRegistry({ rootDir });

  assert.equal(result.ok, true);
  assert.equal(result.truncated, false);
  assert.deepEqual(
    result.entries.map((entry) => `${entry.harness}:${entry.processId}:${entry.status}`),
    ["video_remix:video-1:approval_required", "superagent:super-1:running", "showrunner:show-1:awaiting_review"],
  );
  assert.ok(result.unavailableSources.some((source) => source.harness === "superagent" && source.sourceRef.includes("no-state")));
  assert.equal(await fs.readFile(showrunnerStatePath, "utf8"), beforeShowrunner);
  assert.equal(await fs.readFile(superagentStatePath, "utf8"), beforeSuperagent);
  assert.equal(await fs.readFile(videoRemixManifestPath, "utf8"), beforeVideoRemix);
});

test("Feature: knowgrph-agentic-os, capability registry unions local MCP and vdeoxpln catalogs by tool id", async () => {
  const result = await listCapabilityRegistry({ cloudflareMcpUrl: "" });
  const byId = new Map(result.entries.map((entry) => [entry.toolId, entry]));

  assert.equal(result.ok, true);
  assert.ok(result.unreachableCatalogs.includes("cloudflare_mcp_agent"));
  assert.ok(byId.has(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.osStatus));
  assert.equal(byId.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.osStatus).owningHarness, "agentic_os");
  assert.equal(byId.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.agenticCanvasOsDocsInvoke).owningHarness, "agentic_canvas_os_docs");
  assert.equal(byId.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.skillEvolve).owningHarness, "skill_evolution");
  assert.equal(byId.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.agentTeamPlan).owningHarness, "agent_team");
  assert.equal(byId.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.sandboxPolicyValidate).owningHarness, "agent_sandbox_policy");
  assert.equal(byId.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.sandboxPolicyAuthorize).owningHarness, "agent_sandbox_policy");
  assert.equal(byId.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.gitRun).owningHarness, "storage_sync");
  assert.equal(byId.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.fileSyncRun).owningHarness, "storage_sync");
  assert.ok(byId.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.vdeoxplnList).sourceCatalogs.includes("local_mcp"));
  assert.ok(byId.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.vdeoxplnList).sourceCatalogs.includes("vdeoxpln"));
});

test("Feature: knowgrph-agentic-os, local MCP descriptor exposes knowgrph.os.status as read-only", () => {
  const definitions = buildKnowgrphLocalMcpToolDefinitions();
  const descriptor = definitions.find((tool) => tool.name === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.osStatus);

  assert.ok(descriptor, "knowgrph.os.status descriptor must exist");
  assert.deepEqual(descriptor.inputSchema.properties.view.enum, [
    "process_list",
    "capabilities",
    "cost_summary",
    "gate_catalog",
    "circuit_breakers",
  ]);
  assert.equal(descriptor.annotations.readOnlyHint, true);
  assert.equal(descriptor.annotations.idempotentHint, true);
});

test("Feature: knowgrph-agentic-os, runOsStatusTool returns structured errors for unsupported views", async () => {
  const result = await runOsStatusTool("unknown_view", {}, { rootDir: await tempRoot() });

  assert.equal(result.ok, false);
  assert.equal(result.view, "unknown_view");
  assert.equal(result.errorCode, "invalid_view");
});

test("Feature: knowgrph-agentic-os, cost_summary validates cost logs and reports emission gaps", async () => {
  const rootDir = await tempRoot();
  await writeJson(path.join(rootDir, "showrunner/runs/show-cost/state.json"), {
    run_id: "show-cost",
    status: "complete",
  });
  await fs.writeFile(
    path.join(rootDir, "showrunner/runs/show-cost/cost-log.jsonl"),
    [
      JSON.stringify({
        model: "showrunner-local",
        prompt_tokens: 1,
        completion_tokens: 2,
        cache_hits: 0,
        estimated_cost_usd: 0.01,
        incomplete: false,
      }),
      JSON.stringify({ model: "", estimated_cost_usd: -1 }),
      "",
    ].join("\n"),
    "utf8",
  );
  await writeJson(path.join(rootDir, "data/video-remix-runs/video-cost/run-manifest.json"), {
    runId: "video-cost",
    state: "approval_required",
    costLogs: [{ stageId: "research", estimatedCostUsd: 0.02 }],
    render: {
      assets: [
        {
          ledgerEventId: "ledger-video-cost-shot-1",
          shotId: "shot-1",
          provider: "byteplus-queue",
          costCents: 123,
        },
      ],
    },
  });
  await writeJson(path.join(rootDir, "data/superagent-runs/super-gap/state.json"), {
    runId: "super-gap",
    status: "running",
  });

  const result = await summarizeCostLedger({ rootDir });

  assert.equal(result.ok, true);
  assert.equal(result.totalsByHarness.showrunner.estimated_cost_usd, 0.01);
  assert.equal(result.totalsByHarness.video_remix.estimated_cost_usd, 1.25);
  assert.ok(result.validationFailures.some((failure) => failure.harness === "showrunner"));
  assert.ok(result.costEmissionGaps.some((gap) => gap.harness === "superagent"));
  assert.ok(result.costEmissionGaps.some((gap) => gap.harness === "video_intelligence"));
});

test("Feature: knowgrph-agentic-os, gate_catalog lists canonical gates and pending boundaries", async () => {
  const rootDir = await tempRoot();
  await writeJson(path.join(rootDir, "showrunner/runs/show-review/state.json"), {
    run_id: "show-review",
    run_status: "awaiting_review",
  });
  await writeJson(path.join(rootDir, "data/video-remix-runs/video-gates/run-manifest.json"), {
    runId: "video-gates",
    approvalGates: [
      { gateId: "paid-model-call", approvalState: "pending", estimatedCostUsd: 0.03, token: null },
    ],
  });
  await writeJson(path.join(rootDir, "data/video-remix-runs/video-gates-2/run-manifest.json"), {
    runId: "video-gates-2",
    approvalGates: [
      { gateId: "paid-model-call", approvalState: "pending", estimatedCostUsd: 0.04, token: null },
    ],
  });

  const result = await listGateCatalog({ rootDir });
  const byId = new Map(result.gates.map((gate) => [gate.gateId, gate]));
  const pendingPaidGates = result.gates.filter((gate) => gate.gateId === "paid-model-call" && gate.approvalState === "pending");

  assert.equal(result.ok, true);
  assert.equal(byId.get("showrunner-stage-approval").approvalState, "pending");
  assert.equal(byId.get("paid-model-call").approvalState, "pending");
  assert.equal(pendingPaidGates.length, 2);
  assert.ok(byId.has("consumer-repo-write"));
  assert.equal(result.approvalTokenTtlMs, 15 * 60 * 1000);
});

test("Feature: knowgrph-agentic-os, circuit_breakers reports configured bounds and in-flight counts", async () => {
  const rootDir = await tempRoot();
  await writeJson(path.join(rootDir, "showrunner/runs/show-running/state.json"), {
    run_id: "show-running",
    run_status: "running",
    token_budget: 2000,
    run_token_total: 25,
  });
  await writeJson(path.join(rootDir, "data/superagent-runs/super-running/state.json"), {
    run: {
      run_id: "super-running",
      status: "running",
      step_count: 7,
      budget: { max_steps: 40, max_retries_per_task: 2, max_wall_seconds: 120 },
    },
  });
  await writeJson(path.join(rootDir, "data/superagent-runs/super-unavailable/state.json"), {
    run: {
      run_id: "super-unavailable",
      status: "running",
      budget: { max_steps: 40, max_retries_per_task: 2, max_wall_seconds: 120 },
    },
  });
  await writeJson(path.join(rootDir, "data/video-remix-runs/video-running/run-manifest.json"), {
    runId: "video-running",
    state: "blocked",
    maxIterations: 5,
    failureHandling: { failures: [{ retryCount: 3 }] },
  });

  const result = await listCircuitBreakerRegistry({ rootDir });

  assert.equal(result.ok, true);
  assert.ok(result.breakers.some((breaker) => breaker.harness === "showrunner" && breaker.processId === "show-running" && breaker.currentIterationCount === 25));
  assert.ok(result.breakers.some((breaker) => breaker.harness === "superagent" && breaker.processId === "super-running" && breaker.currentIterationCount === 7));
  assert.ok(result.breakers.some((breaker) => breaker.harness === "superagent" && breaker.processId === "super-unavailable" && breaker.currentIterationCount === "unavailable"));
  assert.ok(result.breakers.some((breaker) => breaker.harness === "video_intelligence" && breaker.configuredBound === "36x10000ms poll"));
  assert.ok(result.breakers.some((breaker) => breaker.harness === "video_remix" && breaker.processId === "video-running" && breaker.currentIterationCount === 3));
});

test("Feature: knowgrph-agentic-os, runOsStatusTool adds zero cost log on successful views", async () => {
  const rootDir = await tempRoot();
  await writeJson(path.join(rootDir, "showrunner/runs/show-2/state.json"), {
    run_id: "show-2",
    status: "complete",
  });

  const result = await runOsStatusTool("process_list", {}, { rootDir });

  assert.equal(result.ok, true);
  assert.deepEqual(result.cost_log, {
    model: "none",
    prompt_tokens: 0,
    completion_tokens: 0,
    cache_hits: 0,
    estimated_cost_usd: 0,
    incomplete: false,
  });
});
