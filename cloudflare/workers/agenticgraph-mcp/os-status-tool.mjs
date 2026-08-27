import { APPROVAL_GATE_ID_VALUES, APPROVAL_TOKEN_TTL_MS } from "../../../contracts/approval.schema.js";
import {
  buildOsStatusToolDefinition,
  OS_STATUS_COUNT_UNAVAILABLE,
  OS_STATUS_TOOL_NAME,
  OS_STATUS_ZERO_COST_LOG,
  SHOWRUNNER_STAGE_APPROVAL_GATE_ID,
} from "../../../mcp/os-status-contract.js";
import { DEFAULT_MAX_ITERATIONS, RETRY_BACKOFF_BASE_MS, RETRY_BACKOFF_CAP_MS } from "../../../mcp/video-remix/constants.js";

export const KNOWGRPH_OS_STATUS_TOOL_NAME = OS_STATUS_TOOL_NAME;

export const OS_STATUS_TOOL_DEFINITION = Object.freeze({
  ...buildOsStatusToolDefinition(),
  title: "Knowgrph Agentic OS Status",
  description:
    "Read-only Agentic OS status catalog. The Worker returns Cloudflare-owned views and reports non-enumerable local sources as unavailable.",
});

const zeroCostLog = () => ({ ...OS_STATUS_ZERO_COST_LOG });
const text = (value) => String(value || "").trim();
const result = (payload) => ({ ok: payload.ok !== false, structuredContent: payload, text: JSON.stringify(payload, null, 2) });

const unavailableLocalSources = () => [
  { harness: "showrunner", sourceRef: "showrunner/runs", reason: "Local filesystem source is not enumerable from the Cloudflare Worker." },
  { harness: "superagent", sourceRef: "data/superagent-runs", reason: "Local filesystem source is not enumerable from the Cloudflare Worker." },
  { harness: "video_remix", sourceRef: "RUN_MANIFEST_STORE", reason: "Durable Object namespace supports run-id readback but no key enumeration without a separate index." },
];

function capabilityEntries(toolDefinitions) {
  return toolDefinitions.map((tool) => ({
    toolId: tool.name,
    owningHarness: tool.name === OS_STATUS_TOOL_NAME ? "agentic_os" : "video_remix",
    schemaRef: `cloudflare_mcp_agent:${tool.name}:input_output_schema`,
    sourceCatalogs: ["cloudflare_mcp_agent"],
  })).sort((left, right) => left.toolId.localeCompare(right.toolId));
}

function gateCatalog() {
  return [...APPROVAL_GATE_ID_VALUES, SHOWRUNNER_STAGE_APPROVAL_GATE_ID]
    .map((gateId) => ({
      gateId,
      approvalState: "n/a",
      estimatedCostUsd: "unknown",
      token: null,
      sourceRunRef: null,
      harness: "agentic_os",
    }))
    .sort((left, right) => left.gateId.localeCompare(right.gateId));
}

function circuitBreakers() {
  return [
    {
      harness: "video_intelligence",
      processId: "all",
      configuredBounds: { maxIterations: 36, pollIntervalMs: 10000 },
      configuredBound: "36x10000ms poll",
      exitCondition: "VideoDB async response completed, failed, or poll bound exhausted",
      currentIterationCount: OS_STATUS_COUNT_UNAVAILABLE,
      sourceRef: "canvas/src/features/panels/views/videodbMcpApiDocs.ts",
    },
    {
      harness: "video_remix",
      processId: "all",
      configuredBounds: { maxIterations: DEFAULT_MAX_ITERATIONS, retryBackoffMs: [RETRY_BACKOFF_BASE_MS, RETRY_BACKOFF_CAP_MS] },
      configuredBound: `${DEFAULT_MAX_ITERATIONS} iterations; ${RETRY_BACKOFF_BASE_MS}ms->${RETRY_BACKOFF_CAP_MS}ms backoff`,
      exitCondition: "complete, approval_required, blocked, budget_exceeded, or verification_failed",
      currentIterationCount: OS_STATUS_COUNT_UNAVAILABLE,
      sourceRef: "mcp/video-remix/constants.js",
    },
  ];
}

export function executeCloudflareOsStatusTool(rawArgs = {}, { toolDefinitions = [] } = {}) {
  const view = text(rawArgs.view);
  const cost_log = zeroCostLog();
  if (view === "process_list") {
    return result({ ok: true, view, entries: [], truncated: false, unavailableSources: unavailableLocalSources(), cost_log });
  }
  if (view === "capabilities") {
    return result({ ok: true, view, entries: capabilityEntries(toolDefinitions), unreachableCatalogs: [], cost_log });
  }
  if (view === "cost_summary") {
    return result({
      ok: true,
      view,
      totalsByHarness: {},
      validationFailures: [],
      costEmissionGaps: unavailableLocalSources().map((source) => ({ harness: source.harness, reason: source.reason })),
      unavailableSources: unavailableLocalSources(),
      cost_log,
    });
  }
  if (view === "gate_catalog") {
    return result({ ok: true, view, gates: gateCatalog(), approvalTokenTtlMs: APPROVAL_TOKEN_TTL_MS, unavailableSources: unavailableLocalSources(), cost_log });
  }
  if (view === "circuit_breakers") {
    return result({ ok: true, view, breakers: circuitBreakers(), unavailableSources: unavailableLocalSources(), cost_log });
  }
  return result({ ok: false, view: view || "unknown", errorCode: "invalid_view", message: `Unsupported Agentic OS status view: ${view || "(missing)"}.`, cost_log });
}
