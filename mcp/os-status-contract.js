import { KNOWGRPH_OS_STATUS_TOOL_NAME } from "../canvas/src/features/agent-ready/knowgrphVdeoxplnContract.mjs";
import { PAYMENT_READINESS_RESULT_SCHEMA } from "./payment-tool-contract.js";

export const OS_STATUS_TOOL_NAME = KNOWGRPH_OS_STATUS_TOOL_NAME;
export const OS_STATUS_COUNT_UNAVAILABLE = "unavailable";
export const SHOWRUNNER_STAGE_APPROVAL_GATE_ID = "showrunner-stage-approval";

export const OS_STATUS_RUN_DIRS = Object.freeze({
  videoRemix: "data/video-remix-runs",
  showrunner: "showrunner/runs",
  superagent: "data/superagent-runs",
});

export const OS_STATUS_VIEWS = Object.freeze({
  processList: "process_list",
  capabilities: "capabilities",
  railReadiness: "rail_readiness",
  agenticPurchaseReadiness: "agentic_purchase_readiness",
  costSummary: "cost_summary",
  gateCatalog: "gate_catalog",
  circuitBreakers: "circuit_breakers",
});

export const OS_STATUS_MODEL_BEARING_HARNESSES = Object.freeze([
  "floating_panel_chat_kgc",
  "visual_annotation_engine",
  "video_intelligence",
  "showrunner",
  "superagent",
  "video_remix",
]);

export const OS_STATUS_ZERO_COST_LOG = Object.freeze({
  model: "none",
  prompt_tokens: 0,
  completion_tokens: 0,
  cache_hits: 0,
  estimated_cost_usd: 0,
  incomplete: false,
});

export const OS_STATUS_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["view"],
  properties: {
    view: {
      type: "string",
      enum: ["process_list", "capabilities", "rail_readiness", "agentic_purchase_readiness", "cost_summary", "gate_catalog", "circuit_breakers"],
      description: "Read-only Agentic OS view to return.",
    },
    cloudflareMcpUrl: {
      type: "string",
      description: "Optional Cloudflare McpAgent endpoint for tools/list discovery. Unset is reported as unreachable, not fatal.",
    },
  },
});

export const OS_STATUS_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["ok"],
  properties: {
    ok: { type: "boolean" },
    view: { type: "string" },
    entries: { type: "array", items: { type: "object", additionalProperties: true } },
    rails: PAYMENT_READINESS_RESULT_SCHEMA.properties.rails,
    capability: PAYMENT_READINESS_RESULT_SCHEMA.properties.capability,
    boundary: { type: "string" },
    readiness: { type: "object", additionalProperties: true },
    claims: { type: "object", additionalProperties: { type: "boolean" } },
    truncated: { type: "boolean" },
    unavailableSources: { type: "array", items: { type: "object", additionalProperties: true } },
    unreachableCatalogs: { type: "array", items: { type: "string" } },
    totalsByHarness: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: true,
        required: ["estimated_cost_usd"],
        properties: { estimated_cost_usd: { type: "number" } },
      },
    },
    validationFailures: { type: "array", items: { type: "object", additionalProperties: true } },
    costEmissionGaps: { type: "array", items: { type: "object", additionalProperties: true } },
    gates: { type: "array", items: { type: "object", additionalProperties: true } },
    approvalTokenTtlMs: { type: "number" },
    breakers: { type: "array", items: { type: "object", additionalProperties: true } },
    cost_log: { type: "object", additionalProperties: true },
    errorCode: { type: "string" },
    message: { type: "string" },
  },
});

export const buildOsStatusToolDefinition = () => ({
  name: OS_STATUS_TOOL_NAME,
  description:
    "Use this when a local MCP host needs a zero-token Agentic OS read view over existing harness process state or capability catalogs without creating a second store.",
  outputSchema: OS_STATUS_OUTPUT_SCHEMA,
  inputSchema: OS_STATUS_INPUT_SCHEMA,
});
