import fs from "node:fs/promises";
import path from "node:path";

import { COST_LOG_UNKNOWN } from "../contracts/cost-log.schema.js";
import { APPROVAL_GATE_ID_VALUES, APPROVAL_TOKEN_TTL_MS } from "../contracts/approval.schema.js";
import { buildKnowgrphVdeoxplnRegistry } from "../canvas/src/features/agent-ready/knowgrphVdeoxplnContract.mjs";
import { DEFAULT_MAX_ITERATIONS, RETRY_BACKOFF_BASE_MS, RETRY_BACKOFF_CAP_MS } from "./video-remix/constants.js";
import { computeRetryBackoffMs } from "./video-remix-runtime.js";
import { buildKnowgrphLocalMcpToolDefinitions } from "./local-tool-contract.js";
import { summarizeCostLedger } from "./os-status-cost-ledger.js";
import {
  OS_STATUS_COUNT_UNAVAILABLE,
  OS_STATUS_RUN_DIRS,
  OS_STATUS_TOOL_NAME,
  OS_STATUS_VIEWS,
  OS_STATUS_ZERO_COST_LOG,
  SHOWRUNNER_STAGE_APPROVAL_GATE_ID,
} from "./os-status-contract.js";

export { summarizeCostLedger };

const SUPERAGENT_DEFAULT_BUDGET = Object.freeze({ maxSteps: 80, maxRetriesPerTask: 2, maxWallSeconds: 900 });
const VIDEODB_CIRCUIT_BREAKER = Object.freeze({ maxIterations: 36, pollIntervalMs: 10000 });

const SOURCE_CATALOGS = Object.freeze({
  vdeoxpln: "vdeoxpln",
  localMcp: "local_mcp",
  cloudflareMcpAgent: "cloudflare_mcp_agent",
});

const text = (value) => String(value || "").trim();

const stableIsoOrUnknown = (value) => {
  const candidate = text(value);
  if (!candidate) return "unknown";
  const time = Date.parse(candidate);
  return Number.isNaN(time) ? candidate : new Date(time).toISOString();
};

const entryTime = (entry) => {
  const time = Date.parse(entry.startedAt);
  return Number.isNaN(time) ? 0 : time;
};

const cloneCostLog = () => ({ ...OS_STATUS_ZERO_COST_LOG });

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

const numericValue = (value, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : fallback;
};
const countOrUnavailable = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.floor(numberValue) : OS_STATUS_COUNT_UNAVAILABLE;
};
const sourceState = (state) => state?.run && typeof state.run === "object" && !Array.isArray(state.run) ? state.run : state;

async function listRunDirs(rootDir, relativeDir, harness, unavailableSources) {
  const absoluteDir = path.join(rootDir, relativeDir);
  try {
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        runId: entry.name,
        statePath: path.join(absoluteDir, entry.name, "state.json"),
        sourceRef: path.join(relativeDir, entry.name, "state.json"),
      }));
  } catch (error) {
    unavailableSources.push({
      harness,
      sourceRef: relativeDir,
      reason: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function normalizeProcessEntry({ harness, runId, state, sourceRef }) {
  const record = sourceState(state);
  return {
    processId: text(record.run_id) || text(record.runId) || text(record.id) || runId,
    harness,
    status:
      text(record.status) ||
      text(record.run_status) ||
      text(record.state) ||
      text(record.phase) ||
      "unknown",
    startedAt: stableIsoOrUnknown(
      record.startedAt ||
      record.started_at ||
      record.createdAt ||
      record.created_at ||
      record.updatedAt ||
      record.updated_at,
    ),
    sourceRef,
  };
}

async function readStateRunEntries({ rootDir, relativeDir, harness, unavailableSources }) {
  const candidates = await listRunDirs(rootDir, relativeDir, harness, unavailableSources);
  const entries = [];
  for (const candidate of candidates) {
    try {
      const state = await readJson(candidate.statePath);
      entries.push(normalizeProcessEntry({
        harness,
        runId: candidate.runId,
        state,
        sourceRef: candidate.sourceRef,
      }));
    } catch (error) {
      unavailableSources.push({
        harness,
        sourceRef: candidate.sourceRef,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return entries;
}

async function readVideoRemixEntries({ rootDir, unavailableSources }) {
  const candidates = await listRunDirs(rootDir, OS_STATUS_RUN_DIRS.videoRemix, "video_remix", unavailableSources);
  const entries = [];
  for (const candidate of candidates) {
    const manifestRefs = ["run-manifest.json", "manifest.json"].map((fileName) => ({
      statePath: path.join(rootDir, OS_STATUS_RUN_DIRS.videoRemix, candidate.runId, fileName),
      sourceRef: path.join(OS_STATUS_RUN_DIRS.videoRemix, candidate.runId, fileName),
    }));
    let readAny = false;
    for (const manifestRef of manifestRefs) {
      try {
        const manifest = await readJson(manifestRef.statePath);
        entries.push(normalizeProcessEntry({
          harness: "video_remix",
          runId: candidate.runId,
          state: manifest,
          sourceRef: manifestRef.sourceRef,
        }));
        readAny = true;
        break;
      } catch {
        /* Try the next conventional manifest filename. */
      }
    }
    if (!readAny) {
      unavailableSources.push({
        harness: "video_remix",
        sourceRef: path.join(OS_STATUS_RUN_DIRS.videoRemix, candidate.runId),
        reason: "No readable run-manifest.json or manifest.json file found.",
      });
    }
  }
  return entries;
}

async function readVideoRemixManifests({ rootDir, unavailableSources = [] }) {
  const candidates = await listRunDirs(rootDir, OS_STATUS_RUN_DIRS.videoRemix, "video_remix", unavailableSources);
  const manifests = [];
  for (const candidate of candidates) {
    for (const fileName of ["run-manifest.json", "manifest.json"]) {
      const sourceRef = path.join(OS_STATUS_RUN_DIRS.videoRemix, candidate.runId, fileName);
      try {
        manifests.push({ runId: candidate.runId, sourceRef, manifest: await readJson(path.join(rootDir, sourceRef)) });
        break;
      } catch {
        /* Conventional filenames are tried in order. */
      }
    }
  }
  return manifests;
}

async function readRunStates({ rootDir, relativeDir, harness }) {
  const unavailableSources = [];
  const candidates = await listRunDirs(rootDir, relativeDir, harness, unavailableSources);
  const states = [];
  for (const candidate of candidates) {
    try {
      states.push({ runId: candidate.runId, sourceRef: candidate.sourceRef, state: await readJson(candidate.statePath) });
    } catch (error) {
      unavailableSources.push({ harness, sourceRef: candidate.sourceRef, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { states, unavailableSources };
}

function capProcessEntries(entries) {
  const sorted = [...entries].sort((left, right) => {
    const delta = entryTime(right) - entryTime(left);
    return delta || left.harness.localeCompare(right.harness) || left.processId.localeCompare(right.processId);
  });
  return {
    entries: sorted.slice(0, 200),
    truncated: sorted.length > 200,
  };
}

export async function listProcessRegistry({ rootDir = process.cwd() } = {}) {
  const unavailableSources = [];
  const showrunnerEntries = await readStateRunEntries({
    rootDir,
    relativeDir: OS_STATUS_RUN_DIRS.showrunner,
    harness: "showrunner",
    unavailableSources,
  });
  const superagentEntries = await readStateRunEntries({
    rootDir,
    relativeDir: OS_STATUS_RUN_DIRS.superagent,
    harness: "superagent",
    unavailableSources,
  });
  const videoRemixEntries = await readVideoRemixEntries({ rootDir, unavailableSources });
  const capped = capProcessEntries([...showrunnerEntries, ...superagentEntries, ...videoRemixEntries]);
  return {
    ok: true,
    ...capped,
    unavailableSources,
  };
}

function owningHarnessForTool(toolId, fallback = "unknown") {
  if (toolId === OS_STATUS_TOOL_NAME) return "agentic_os";
  if (toolId.startsWith("knowgrph.git.") || toolId.startsWith("knowgrph.file.")) return "storage_sync";
  if (toolId.startsWith("knowgrph.showrunner.")) return "showrunner";
  if (toolId.startsWith("knowgrph.sandbox.policy.")) return "agent_sandbox_policy";
  if (toolId.startsWith("knowgrph.video_remix.")) return "video_remix";
  if (toolId.startsWith("knowgrph.superagent.")) return "superagent";
  if (toolId.startsWith("knowgrph.memory.")) return "memory_layer";
  if (toolId.startsWith("knowgrph.probe.")) return "probe_tree";
  if (toolId.startsWith("knowgrph.agentic_canvas_os.docs.")) return "agentic_canvas_os_docs";
  if (toolId.startsWith("knowgrph.agent_team.")) return "agent_team";
  if (toolId.startsWith("knowgrph.skill.")) return "skill_evolution";
  if (toolId.startsWith("knowgrph.html_video.")) return "html_video_renderer";
  if (toolId.startsWith("knowgrph.annotate.")) return "visual_annotation_engine";
  if (toolId.startsWith("knowgrph.vdeoxpln.")) return "vdeoxpln";
  if (toolId.startsWith("knowgrph.")) return "local_mcp";
  return fallback;
}

function upsertCapability(catalog, { toolId, owningHarness, schemaRef, sourceCatalog }) {
  const normalizedToolId = text(toolId);
  if (!normalizedToolId) return;
  const semanticOwner = owningHarnessForTool(normalizedToolId, "");
  const existing = catalog.get(normalizedToolId);
  if (existing) {
    if (semanticOwner) existing.owningHarness = semanticOwner;
    if (!existing.sourceCatalogs.includes(sourceCatalog)) {
      existing.sourceCatalogs.push(sourceCatalog);
      existing.sourceCatalogs.sort();
    }
    return;
  }
  catalog.set(normalizedToolId, {
    toolId: normalizedToolId,
    owningHarness: semanticOwner || text(owningHarness) || "unknown",
    schemaRef: text(schemaRef) || "schema:unknown",
    sourceCatalogs: [sourceCatalog],
  });
}

function addVdeoxplnCapabilities(catalog) {
  for (const vdeoxpln of buildKnowgrphVdeoxplnRegistry()) {
    for (const tools of Object.values(vdeoxpln.tools || {})) {
      for (const toolId of Array.isArray(tools) ? tools : []) {
        upsertCapability(catalog, {
          toolId,
          owningHarness: vdeoxpln.id,
          schemaRef: `vdeoxpln:${vdeoxpln.id}:tools`,
          sourceCatalog: SOURCE_CATALOGS.vdeoxpln,
        });
      }
    }
  }
}

function addLocalMcpCapabilities(catalog, localMcpArgs) {
  for (const tool of buildKnowgrphLocalMcpToolDefinitions(localMcpArgs)) {
    upsertCapability(catalog, {
      toolId: tool.name,
      owningHarness: owningHarnessForTool(tool.name),
      schemaRef: `local_mcp:${tool.name}:input_output_schema`,
      sourceCatalog: SOURCE_CATALOGS.localMcp,
    });
  }
}

async function fetchCloudflareMcpTools(cloudflareMcpUrl) {
  const url = text(cloudflareMcpUrl);
  if (!url) throw new Error("KNOWGRPH_MCP_AGENT_URL is not configured.");
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "knowgrph-os-status-tools-list", method: "tools/list" }),
  });
  if (!response.ok) throw new Error(`Cloudflare McpAgent returned HTTP ${response.status}.`);
  const payload = await response.json();
  const tools = payload?.result?.tools || payload?.tools;
  if (!Array.isArray(tools)) throw new Error("Cloudflare McpAgent tools/list response did not include tools[].");
  return tools;
}

async function addCloudflareMcpCapabilities(catalog, { cloudflareMcpUrl, unreachableCatalogs }) {
  try {
    const tools = await fetchCloudflareMcpTools(cloudflareMcpUrl);
    for (const tool of tools) {
      upsertCapability(catalog, {
        toolId: tool.name,
        owningHarness: owningHarnessForTool(tool.name, "cloudflare_mcp_agent"),
        schemaRef: `cloudflare_mcp_agent:${tool.name}:input_output_schema`,
        sourceCatalog: SOURCE_CATALOGS.cloudflareMcpAgent,
      });
    }
  } catch {
    unreachableCatalogs.push(SOURCE_CATALOGS.cloudflareMcpAgent);
  }
}

export async function listCapabilityRegistry({
  cloudflareMcpUrl = process.env.KNOWGRPH_MCP_AGENT_URL,
  localMcpArgs = {},
} = {}) {
  const catalog = new Map();
  const unreachableCatalogs = [];
  addVdeoxplnCapabilities(catalog);
  addLocalMcpCapabilities(catalog, localMcpArgs);
  await addCloudflareMcpCapabilities(catalog, { cloudflareMcpUrl, unreachableCatalogs });
  return {
    ok: true,
    entries: [...catalog.values()].sort((left, right) => left.toolId.localeCompare(right.toolId)),
    unreachableCatalogs,
  };
}

const baseGateEntry = (gateId) => ({
  gateId,
  approvalState: "n/a",
  estimatedCostUsd: COST_LOG_UNKNOWN,
  token: null,
  sourceRunRef: null,
  harness: "agentic_os",
});

function normalizeGate(gate, fallback = {}) {
  return {
    ...baseGateEntry(text(gate?.gateId) || fallback.gateId),
    approvalState: text(gate?.approvalState || gate?.state) || fallback.approvalState || "pending",
    estimatedCostUsd: Number.isFinite(Number(gate?.estimatedCostUsd)) ? Number(gate.estimatedCostUsd) : COST_LOG_UNKNOWN,
    token: gate?.token ?? null,
    sourceRunRef: fallback.sourceRunRef || null,
    harness: fallback.harness || "unknown",
  };
}

export async function listGateCatalog({ rootDir = process.cwd() } = {}) {
  const unavailableSources = [];
  const gates = [...APPROVAL_GATE_ID_VALUES, SHOWRUNNER_STAGE_APPROVAL_GATE_ID].map((gateId) => baseGateEntry(gateId));
  const showrunner = await readRunStates({ rootDir, relativeDir: OS_STATUS_RUN_DIRS.showrunner, harness: "showrunner" });
  unavailableSources.push(...showrunner.unavailableSources);
  for (const { sourceRef, state } of showrunner.states) {
    const record = sourceState(state);
    if (text(record.status || record.run_status) === "awaiting_review") {
      gates.push(normalizeGate(null, {
        gateId: SHOWRUNNER_STAGE_APPROVAL_GATE_ID,
        approvalState: "pending",
        sourceRunRef: sourceRef,
        harness: "showrunner",
      }));
    }
  }
  for (const { sourceRef, manifest } of await readVideoRemixManifests({ rootDir, unavailableSources })) {
    for (const gate of Array.isArray(manifest.approvalGates) ? manifest.approvalGates : []) {
      const normalized = normalizeGate(gate, { sourceRunRef: sourceRef, harness: "video_remix" });
      if (normalized.gateId && normalized.approvalState === "pending") gates.push(normalized);
    }
  }
  return {
    ok: true,
    gates: gates.sort((left, right) => left.gateId.localeCompare(right.gateId) || String(left.sourceRunRef || "").localeCompare(String(right.sourceRunRef || ""))),
    approvalTokenTtlMs: APPROVAL_TOKEN_TTL_MS,
    unavailableSources,
  };
}

function breakerEntry({ harness, processId, configuredBounds, configuredBound, exitCondition, currentIterationCount, sourceRef }) {
  return { harness, processId: text(processId) || "all", configuredBounds, configuredBound, exitCondition, currentIterationCount, sourceRef: sourceRef || null };
}

export async function listCircuitBreakerRegistry({ rootDir = process.cwd() } = {}) {
  const unavailableSources = [];
  const breakers = [
    breakerEntry({
      harness: "showrunner",
      configuredBounds: { tokenBudget: "state.token_budget", runStatusGate: "awaiting_review" },
      configuredBound: "max_retries/token_budget from Pipeline_Run state",
      exitCondition: "awaiting_review, token budget exhausted, or role retry exhausted",
      currentIterationCount: OS_STATUS_COUNT_UNAVAILABLE,
    }),
    breakerEntry({
      harness: "superagent",
      configuredBounds: SUPERAGENT_DEFAULT_BUDGET,
      configuredBound: `max_steps=${SUPERAGENT_DEFAULT_BUDGET.maxSteps}; max_retries_per_task=${SUPERAGENT_DEFAULT_BUDGET.maxRetriesPerTask}; max_wall_seconds=${SUPERAGENT_DEFAULT_BUDGET.maxWallSeconds}`,
      exitCondition: "max steps, per-task retries, wall time, or no ready task",
      currentIterationCount: OS_STATUS_COUNT_UNAVAILABLE,
    }),
    breakerEntry({
      harness: "video_intelligence",
      configuredBounds: VIDEODB_CIRCUIT_BREAKER,
      configuredBound: `${VIDEODB_CIRCUIT_BREAKER.maxIterations}x${VIDEODB_CIRCUIT_BREAKER.pollIntervalMs}ms poll`,
      exitCondition: "VideoDB async response completed, failed, or poll bound exhausted",
      currentIterationCount: OS_STATUS_COUNT_UNAVAILABLE,
    }),
    breakerEntry({
      harness: "video_remix",
      configuredBounds: { maxIterations: DEFAULT_MAX_ITERATIONS, retryBackoffMs: [RETRY_BACKOFF_BASE_MS, RETRY_BACKOFF_CAP_MS] },
      configuredBound: `${DEFAULT_MAX_ITERATIONS} iterations; ${RETRY_BACKOFF_BASE_MS}ms->${RETRY_BACKOFF_CAP_MS}ms backoff`,
      exitCondition: "complete, approval_required, blocked, budget_exceeded, or verification_failed",
      currentIterationCount: OS_STATUS_COUNT_UNAVAILABLE,
    }),
  ];
  const showrunner = await readRunStates({ rootDir, relativeDir: OS_STATUS_RUN_DIRS.showrunner, harness: "showrunner" });
  const superagent = await readRunStates({ rootDir, relativeDir: OS_STATUS_RUN_DIRS.superagent, harness: "superagent" });
  unavailableSources.push(...showrunner.unavailableSources, ...superagent.unavailableSources);
  for (const { runId, sourceRef, state } of showrunner.states.filter(({ state }) => !["complete", "completed"].includes(text(sourceState(state).status || sourceState(state).run_status)))) {
    const record = sourceState(state);
    const tokenBudget = countOrUnavailable(record.token_budget);
    const maxRetries = countOrUnavailable(record.max_retries ?? record.maxRetries);
    breakers.push(breakerEntry({
      harness: "showrunner",
      processId: runId,
      configuredBounds: { maxRetries, tokenBudget, runStatusGate: "awaiting_review" },
      configuredBound: `max_retries=${maxRetries}; token_budget=${tokenBudget}`,
      exitCondition: "awaiting_review, token budget exhausted, or role retry exhausted",
      currentIterationCount: countOrUnavailable(record.run_token_total ?? record.step_count),
      sourceRef,
    }));
  }
  for (const { runId, sourceRef, state } of superagent.states.filter(({ state }) => !["complete", "completed"].includes(text(sourceState(state).status || sourceState(state).run_status)))) {
    const record = sourceState(state);
    const budget = record.budget && typeof record.budget === "object" ? record.budget : record;
    const configuredBounds = {
      maxSteps: numericValue(budget.max_steps, SUPERAGENT_DEFAULT_BUDGET.maxSteps),
      maxRetriesPerTask: numericValue(budget.max_retries_per_task, SUPERAGENT_DEFAULT_BUDGET.maxRetriesPerTask),
      maxWallSeconds: numericValue(budget.max_wall_seconds, SUPERAGENT_DEFAULT_BUDGET.maxWallSeconds),
    };
    breakers.push(breakerEntry({
      harness: "superagent",
      processId: runId,
      configuredBounds,
      configuredBound: `max_steps=${configuredBounds.maxSteps}; max_retries_per_task=${configuredBounds.maxRetriesPerTask}; max_wall_seconds=${configuredBounds.maxWallSeconds}`,
      exitCondition: "max steps, per-task retries, wall time, or no ready task",
      currentIterationCount: countOrUnavailable(record.step_count ?? record.current_step),
      sourceRef,
    }));
  }
  for (const { runId, sourceRef, manifest } of await readVideoRemixManifests({ rootDir, unavailableSources })) {
    if (["complete", "completed"].includes(text(manifest.state || manifest.status))) continue;
    const failures = Array.isArray(manifest.failureHandling?.failures) ? manifest.failureHandling.failures : [];
    const retryCount = failures.reduce((max, failure) => Math.max(max, numericValue(failure.retryCount ?? failure.finalRetryCount)), 0);
    const maxIterations = numericValue(manifest.maxIterations, DEFAULT_MAX_ITERATIONS);
    breakers.push(breakerEntry({
      harness: "video_remix",
      processId: runId,
      configuredBounds: { maxIterations, retryBackoffMs: [computeRetryBackoffMs(0), computeRetryBackoffMs(50)] },
      configuredBound: `${maxIterations} iterations; ${RETRY_BACKOFF_BASE_MS}ms->${RETRY_BACKOFF_CAP_MS}ms backoff`,
      exitCondition: "complete, approval_required, blocked, budget_exceeded, or verification_failed",
      currentIterationCount: retryCount,
      sourceRef,
    }));
  }
  return { ok: true, breakers, unavailableSources };
}

export async function runOsStatusTool(view, args = {}, { rootDir } = {}) {
  const normalizedView = text(view || args.view);
  try {
    if (normalizedView === OS_STATUS_VIEWS.processList) {
      return {
        view: normalizedView,
        ...(await listProcessRegistry({ rootDir })),
        cost_log: cloneCostLog(),
      };
    }
    if (normalizedView === OS_STATUS_VIEWS.capabilities) {
      return {
        view: normalizedView,
        ...(await listCapabilityRegistry({
          cloudflareMcpUrl: args.cloudflareMcpUrl,
          localMcpArgs: args.localMcpArgs,
        })),
        cost_log: cloneCostLog(),
      };
    }
    if (normalizedView === OS_STATUS_VIEWS.costSummary) {
      return { view: normalizedView, ...(await summarizeCostLedger({ rootDir })), cost_log: cloneCostLog() };
    }
    if (normalizedView === OS_STATUS_VIEWS.gateCatalog) {
      return { view: normalizedView, ...(await listGateCatalog({ rootDir })), cost_log: cloneCostLog() };
    }
    if (normalizedView === OS_STATUS_VIEWS.circuitBreakers) {
      return { view: normalizedView, ...(await listCircuitBreakerRegistry({ rootDir })), cost_log: cloneCostLog() };
    }
    return {
      ok: false,
      view: normalizedView || "unknown",
      errorCode: "invalid_view",
      message: `Unsupported Agentic OS status view: ${normalizedView || "(missing)"}.`,
    };
  } catch (error) {
    return {
      ok: false,
      view: normalizedView || "unknown",
      errorCode: "registry_failure",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
