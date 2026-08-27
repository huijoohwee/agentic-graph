//   * the tool list exposed at airvio.co/knowgrph/control-plane/mcp,
//   * approval-gate enforcement at the McpAgent boundary so a remote
//     invocation of an approval-gated stage tool before approval is withheld
//     and leaves Run_Manifest state unchanged (Property 1 / R14.6).
//
// Director semantics for `knowgrph.video_remix.run` are reused from
// `mcp/video-remix-runtime.js` (reuse-not-rebuild). Direct stage tools only
// enforce their McpAgent gate boundary, then hand execution back to the
// Director-owned pipeline so sequencing, retry, and manifest writes stay in one
// source owner.
import { runVideoRemix, runVideoRemixAsync, VIDEO_WORKFLOW_INPUT_SCHEMA } from "../../../mcp/video-remix-runtime.js";
import { AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME, AGENTIC_CANVAS_OS_DOCS_TOOL_DEFINITION } from "../../../mcp/agentic-canvas-os-docs-contract.mjs";
import { buildAgenticCanvasOsDocsStaticResolutionPayload, buildAgenticCanvasOsDocsDynamicResolutionPayload } from "../../../mcp/agentic-canvas-os-docs-core.mjs";
import { executeCloudflareOsStatusTool, KNOWGRPH_OS_STATUS_TOOL_NAME, OS_STATUS_TOOL_DEFINITION } from "./os-status-tool.mjs";
import { AGENT_RUNTIME_TOOL_DEFINITION, AGENT_RUNTIME_TOOL_NAME, executeAgentRuntimeTool, executeAgentRuntimeToolAsync } from "./agent-runtime-tool.mjs";
import { RUN_NOTE_TOOL_DEFINITION, RUN_NOTE_TOOL_NAME } from "./run-note-execution.mjs";
export const KNOWGRPH_MCP_CONTRACT_VERSION = "knowgrph.mcp.video_remix/v0.1";
export { AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME, AGENT_RUNTIME_TOOL_NAME, KNOWGRPH_OS_STATUS_TOOL_NAME, RUN_NOTE_TOOL_NAME };
export const KNOWGRPH_MCP_DIRECTOR_TOOL_NAME = "knowgrph.video_remix.run";

export const KNOWGRPH_MCP_STAGE_TOOL_NAMES = Object.freeze({
  research: "knowgrph.video_remix.research",
  storyboard: "knowgrph.video_remix.storyboard",
  render: "knowgrph.video_remix.render",
  publish: "knowgrph.video_remix.publish",
  checkout: "knowgrph.video_remix.checkout",
});
// Approval gate ids the McpAgent boundary enforces per stage tool (R14.6).
// These mirror the *runtime* gate ids the Director actually checks in
// `mcp/video-remix-runtime.js` (`APPROVAL_GATES` + `hasGate(...)`), so the
// boundary check and the Director agree on what counts as approved
// (reuse-not-rebuild).
//
// KNOWN GATE-ID DISCREPANCY (flagged for spec task 4.1 — HITL Gate Service
// reconciliation; do NOT resolve here, task 1.6 is the McpAgent-boundary slice
// only):
//   * The render stage maps to `render-action`. This matches the runtime's
//     `APPROVAL_GATES` in `mcp/video-remix-runtime.js`, but `render-action`
//     is NOT one of the five gate ids enumerated in design.md's Glossary
//     (`consumer-repo-write`, `cloud-deploy`, `paid-model-call`,
//     `payment-action`, `authenticated-browser`).
//   * Conversely, the design glossary's `consumer-repo-write` and
//     `authenticated-browser` gates have no stage tool mapped here.
// Enforcement is kept consistent with the runtime (so a withheld render call
// is correctly withheld today); reconciling the design-vs-runtime gate-id set
// is the explicit responsibility of task 4.1 and MUST NOT be silently
// rebuilt at the boundary.
export const KNOWGRPH_MCP_STAGE_GATES = Object.freeze({
  [KNOWGRPH_MCP_STAGE_TOOL_NAMES.research]: "paid-model-call",
  [KNOWGRPH_MCP_STAGE_TOOL_NAMES.storyboard]: "paid-model-call",
  // render-action: runtime gate id; reconcile vs design glossary in task 4.1.
  [KNOWGRPH_MCP_STAGE_TOOL_NAMES.render]: "render-action",
  [KNOWGRPH_MCP_STAGE_TOOL_NAMES.publish]: "cloud-deploy",
  [KNOWGRPH_MCP_STAGE_TOOL_NAMES.checkout]: "payment-action",
});

const READ_ONLY_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
});

const APPROVAL_TOKEN_SCHEMA = Object.freeze({
  oneOf: [
    { type: "string", description: "Verified Approval_Token gate id." },
    {
      type: "object",
      additionalProperties: true,
      required: ["gateId"],
      properties: {
        gateId: { type: "string" },
        token: { type: "string" },
        approvalState: {
          type: "string",
          enum: ["approved", "rejected", "pending"],
        },
      },
    },
  ],
});

const APPROVALS_ARRAY_SCHEMA = Object.freeze({
  type: "array",
  items: APPROVAL_TOKEN_SCHEMA,
  description:
    "Approval_Token entries (issued by the HITL Gate Service). A stage tool invoked without its matching, unconsumed token is withheld at the McpAgent boundary (Property 1 / R14.6).",
});

const SOURCE_CARD_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["sourceId", "url"],
  properties: {
    sourceId: { type: "string" },
    url: { type: "string", format: "uri" },
    platform: { type: "string" },
    title: { type: "string" },
    evidenceLevel: { type: "string", enum: ["A", "B", "C"] },
    captureTime: { type: "string" },
    observedFields: { type: "array", items: { type: "string" } },
  },
});

const VIDEO_REMIX_RUN_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["referenceUrl", "brief"],
  properties: {
    referenceUrl: {
      type: "string",
      format: "uri",
      description: "Absolute reference video URL (R2.1).",
    },
    brief: {
      type: "string",
      minLength: 1,
      maxLength: 5000,
      description: "Creative brief (R2.1).",
    },
    mode: {
      type: "string",
      enum: ["live", "dry-run"],
      default: "dry-run",
      description: "Run mode (R2.1, R2.6).",
    },
    budgetUsd: {
      type: "number",
      minimum: 0.01,
      maximum: 100000.0,
      description: "Budget cap in USD; range follows R2.1.",
    },
    approvals: APPROVALS_ARRAY_SCHEMA,
    shotCount: { type: "number", minimum: 1, maximum: 500 },
    sourceCards: { type: "array", items: SOURCE_CARD_SCHEMA },
    runId: { type: "string" },
    failOnceTool: { type: "string" },
    maxIterations: { type: "number", minimum: 1, maximum: 100 },
    workflow: VIDEO_WORKFLOW_INPUT_SCHEMA,
    frontendUrl: { type: "string", format: "uri" },
    backendHealthUrl: { type: "string", format: "uri" },
  },
});

const VIDEO_REMIX_RUN_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: [
    "contractVersion",
    "runId",
    "state",
    "mode",
    "approvalGates",
    "evidencePack",
    "storyboard",
    "budgetMeters",
    "validation",
  ],
  properties: {
    contractVersion: { type: "string" },
    runId: { type: "string" },
    state: { type: "string" },
    mode: { type: "string" },
    approvalGates: { type: "array", items: { type: "object", additionalProperties: true } },
    stages: { type: "array", items: { type: "object", additionalProperties: true } },
    evidencePack: { type: "object", additionalProperties: true },
    storyboard: { type: "object", additionalProperties: true },
    render: { type: "object", additionalProperties: true },
    commerce: { type: "object", additionalProperties: true },
    failureHandling: { type: "object", additionalProperties: true },
    budgetMeters: { type: "object", additionalProperties: true },
    demoPack: { type: ["object", "null"], additionalProperties: true },
    validation: { type: "object", additionalProperties: true },
    stageTransitions: {
      type: "array",
      description:
        "Stage-transition diagnostics emitted on this run (R14.5): each entry carries { runId, fromStage, toStage, utcTimestamp, outcomeStatus }.",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["runId", "fromStage", "toStage", "utcTimestamp", "outcomeStatus"],
        properties: {
          runId: { type: ["string", "null"] },
          fromStage: { type: ["string", "null"] },
          toStage: { type: ["string", "null"] },
          utcTimestamp: { type: "string", format: "date-time" },
          outcomeStatus: { type: "string" },
        },
      },
    },
  },
});

const RESEARCH_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["referenceUrl"],
  properties: {
    referenceUrl: { type: "string", format: "uri" },
    query: { type: "string" },
    maxResults: { type: "number", minimum: 1, maximum: 10 },
    approvals: APPROVALS_ARRAY_SCHEMA,
    runId: { type: "string" },
  },
});

const RESEARCH_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["status", "evidencePack"],
  properties: {
    status: { type: "string" },
    gateId: { type: "string" },
    paidProviderCalls: { type: "number" },
    evidencePack: {
      type: "object",
      additionalProperties: true,
      properties: {
        sources: { type: "array", items: SOURCE_CARD_SCHEMA },
        citations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              sourceId: { type: "string" },
              url: { type: "string", format: "uri" },
            },
          },
        },
        summary: { type: "string" },
      },
    },
  },
});

const STORYBOARD_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["brief", "evidencePack"],
  properties: {
    brief: { type: "string", minLength: 1, maxLength: 5000 },
    evidencePack: { type: "object", additionalProperties: true },
    shotCount: { type: "number", minimum: 1, maximum: 500 },
    approvals: APPROVALS_ARRAY_SCHEMA,
    runId: { type: "string" },
  },
});

const STORYBOARD_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["status", "canvasDocumentMarkdown", "flow"],
  properties: {
    status: { type: "string" },
    gateId: { type: "string" },
    paidProviderCalls: { type: "number" },
    canvasDocumentMarkdown: { type: "string" },
    flow: {
      type: "object",
      additionalProperties: true,
      required: ["nodes", "edges"],
      properties: {
        nodes: { type: "array", items: { type: "object", additionalProperties: true } },
        edges: { type: "array", items: { type: "object", additionalProperties: true } },
      },
    },
  },
});

const RENDER_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["shots"],
  properties: {
    shots: {
      type: "array",
      minItems: 1,
      maxItems: 500,
      items: {
        type: "object",
        additionalProperties: true,
        required: ["shotId"],
        properties: {
          shotId: { type: "string" },
          prompt: { type: "string" },
          durationS: { type: "number", minimum: 1, maximum: 120 },
        },
      },
    },
    renderGateToken: { type: "string" },
    approvals: APPROVALS_ARRAY_SCHEMA,
    runId: { type: "string" },
  },
});

const RENDER_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["status", "assets"],
  properties: {
    status: { type: "string" },
    gateId: { type: "string" },
    paidProviderCalls: { type: "number" },
    assets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["shotId", "assetUrl", "ledgerEventId"],
        properties: {
          shotId: { type: "string" },
          assetUrl: { type: "string", format: "uri" },
          ledgerEventId: { type: "string" },
          costCents: { type: "number", minimum: 0 },
        },
      },
    },
  },
});

const PUBLISH_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["assets"],
  properties: {
    assets: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: true,
        required: ["assetUrl"],
        properties: {
          shotId: { type: "string" },
          assetUrl: { type: "string", format: "uri" },
        },
      },
    },
    approvals: APPROVALS_ARRAY_SCHEMA,
    runId: { type: "string" },
  },
});

const PUBLISH_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["status", "publishedUrls"],
  properties: {
    status: { type: "string" },
    gateId: { type: "string" },
    paidProviderCalls: { type: "number" },
    publishedUrls: {
      type: "array",
      items: { type: "string", format: "uri" },
    },
  },
});

const CHECKOUT_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["assetUrl", "priceId"],
  properties: {
    assetUrl: { type: "string", format: "uri" },
    priceId: { type: "string", minLength: 1 },
    paymentGateToken: { type: "string" },
    approvals: APPROVALS_ARRAY_SCHEMA,
    runId: { type: "string" },
  },
});

const CHECKOUT_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["status", "sessionId"],
  properties: {
    status: { type: "string" },
    gateId: { type: "string" },
    paidProviderCalls: { type: "number" },
    sessionId: { type: "string" },
    payoutSettled: { type: "boolean" },
  },
});

const STAGE_TOOL_DEFINITIONS = Object.freeze([
  {
    name: KNOWGRPH_MCP_STAGE_TOOL_NAMES.research,
    title: "Knowgrph Video Remix - Research Stage",
    description:
      "Run the Research_Harness over Exa via Cloudflare AI Gateway. Gated by `paid-model-call`; without a verified Approval_Token the McpAgent withholds execution and returns approval_required.",
    inputSchema: RESEARCH_INPUT_SCHEMA,
    outputSchema: RESEARCH_OUTPUT_SCHEMA,
  },
  {
    name: KNOWGRPH_MCP_STAGE_TOOL_NAMES.storyboard,
    title: "Knowgrph Video Remix - Storyboard Stage",
    description:
      "Run the Storyboard_Harness, emitting a kgc-computing-flow/v1 canvas document. Gated by `paid-model-call`.",
    inputSchema: STORYBOARD_INPUT_SCHEMA,
    outputSchema: STORYBOARD_OUTPUT_SCHEMA,
  },
  {
    name: KNOWGRPH_MCP_STAGE_TOOL_NAMES.render,
    title: "Knowgrph Video Remix - Render Stage",
    description:
      "Dispatch per-shot media generation via the Strytree external video provider queue. Gated by `render-action`.",
    inputSchema: RENDER_INPUT_SCHEMA,
    outputSchema: RENDER_OUTPUT_SCHEMA,
  },
  {
    name: KNOWGRPH_MCP_STAGE_TOOL_NAMES.publish,
    title: "Knowgrph Video Remix - Publish Stage",
    description:
      "Publish rendered assets behind the consumer surface. Gated by `cloud-deploy`.",
    inputSchema: PUBLISH_INPUT_SCHEMA,
    outputSchema: PUBLISH_OUTPUT_SCHEMA,
  },
  {
    name: KNOWGRPH_MCP_STAGE_TOOL_NAMES.checkout,
    title: "Knowgrph Video Remix - Checkout Stage",
    description:
      "Create the Stripe checkout session and settle payout. Gated by `payment-action`.",
    inputSchema: CHECKOUT_INPUT_SCHEMA,
    outputSchema: CHECKOUT_OUTPUT_SCHEMA,
  },
]);

const DIRECTOR_TOOL_DEFINITION = Object.freeze({
  name: KNOWGRPH_MCP_DIRECTOR_TOOL_NAME,
  title: "Knowgrph Video Remix - Director Run",
  description:
    "Reference URL + brief + budget -> approval-gated research/storyboard/render/publish/checkout pipeline returning a Run_Manifest. Reuses `mcp/video-remix-runtime.js`.",
  inputSchema: VIDEO_REMIX_RUN_INPUT_SCHEMA,
  outputSchema: VIDEO_REMIX_RUN_OUTPUT_SCHEMA,
});

/**
 * Returns the canonical tool list this McpAgent exposes at
 * airvio.co/knowgrph/control-plane/mcp. Property 26 / R14.4: every entry carries both
 * `inputSchema` and `outputSchema`.
 */
export function buildKnowgrphMcpToolDefinitions() {
  const decorate = (tool) => ({
    ...tool,
    annotations: { ...READ_ONLY_TOOL_ANNOTATIONS },
    _meta: {
      contractVersion: KNOWGRPH_MCP_CONTRACT_VERSION,
      gateId: KNOWGRPH_MCP_STAGE_GATES[tool.name] ?? null,
    },
  });
  return [AGENT_RUNTIME_TOOL_DEFINITION, DIRECTOR_TOOL_DEFINITION, ...STAGE_TOOL_DEFINITIONS, RUN_NOTE_TOOL_DEFINITION, OS_STATUS_TOOL_DEFINITION, AGENTIC_CANVAS_OS_DOCS_TOOL_DEFINITION].map((tool) => {
    const decorated = decorate(tool);
    return tool.name === KNOWGRPH_OS_STATUS_TOOL_NAME || tool.name === AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME
      ? { ...decorated, annotations: { ...decorated.annotations, readOnlyHint: true } }
      : decorated;
  });
}

/**
 * Returns the gate id required for a given stage tool, or null for the
 * Director tool / unknown names. Used by the McpAgent boundary to enforce
 * Property 1.
 */
export function gateIdForTool(toolName) {
  return KNOWGRPH_MCP_STAGE_GATES[toolName] ?? null;
}

/**
 * Normalize the `approvals[]` entries on stage tool args into a Set of
 * approved gate ids. Mirrors the same normalization rules used by
 * `mcp/video-remix-runtime.js` so the McpAgent boundary and the Director run
 * agree on what counts as approved.
 */
export function collectApprovedGateIds(approvals) {
  const out = new Set();
  if (!Array.isArray(approvals)) return out;
  for (const entry of approvals) {
    if (typeof entry === "string") {
      const id = entry.trim();
      if (id) out.add(id);
      continue;
    }
    if (entry && typeof entry === "object") {
      const id = String(entry.gateId || entry.id || "").trim();
      const stateValue = String(entry.approvalState || entry.state || "approved").trim();
      const tokenValue = String(entry.token || entry.approvalToken || id || "").trim();
      if (id && stateValue === "approved" && tokenValue) out.add(id);
    }
  }
  return out;
}

function buildApprovalRequiredEnvelope({ toolName, gateId, reason }) {
  return {
    status: "approval_required",
    ok: false,
    gateId,
    paidProviderCalls: 0,
    runManifestStateChanged: false,
    error: {
      code: "approval_required",
      message:
        reason ||
        `Stage tool ${toolName} is gated by ${gateId}. Present a verified, unexpired, unconsumed Approval_Token before invoking.`,
    },
  };
}

/**
 * Execute a registered tool. The Worker entry forwards `tools/call` here so
 * gate enforcement and Director invocation share a single code path with the
 * Node tests.
 *
 * Stage-tool calls return an `approval_required` envelope when the
 * corresponding `paid-model-call` / `render-action` / `cloud-deploy` /
 * `payment-action` gate is not approved in `args.approvals[]` (Property 1 /
 * R14.6). Approved direct stage calls stay deferred: the Director owns full
 * sequencing, retry, and harness execution.
 */
export function executeKnowgrphMcpTool(toolName, rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};

  if (toolName === AGENT_RUNTIME_TOOL_NAME) return executeAgentRuntimeTool(args);

  if (toolName === KNOWGRPH_MCP_DIRECTOR_TOOL_NAME) {
    const result = runVideoRemix(args);
    return {
      ok: result.payload?.validation?.ok !== false,
      structuredContent: result.payload,
      text: result.text,
    };
  }

  if (toolName === KNOWGRPH_OS_STATUS_TOOL_NAME) return executeCloudflareOsStatusTool(args, { toolDefinitions: buildKnowgrphMcpToolDefinitions() });

  const gateId = KNOWGRPH_MCP_STAGE_GATES[toolName];
  if (!gateId) {
    return {
      ok: false,
      structuredContent: {
        status: "unknown_tool",
        ok: false,
        paidProviderCalls: 0,
        error: { code: "unknown_tool", message: `Unknown tool: ${toolName}` },
      },
      text: `Unknown tool: ${toolName}`,
    };
  }

  const approved = collectApprovedGateIds(args.approvals);
  if (!approved.has(gateId)) {
    const envelope = buildApprovalRequiredEnvelope({ toolName, gateId });
    return {
      ok: false,
      structuredContent: envelope,
      text: envelope.error.message,
    };
  }

  // Approved at the McpAgent boundary: defer to the Director, which owns
  // sequencing, retry, and harness execution. Direct stage tools never mutate
  // Run_Manifest state outside the Director-owned pipeline.
  const envelope = {
    status: "deferred_to_director",
    ok: true,
    gateId,
    paidProviderCalls: 0,
    runManifestStateChanged: false,
    note:
      "Approval_Token accepted at the McpAgent boundary. Invoke `knowgrph.video_remix.run` to execute the Director-owned full pipeline.",
  };
  return {
    ok: true,
    structuredContent: envelope,
    text: envelope.note,
  };
}

export async function executeKnowgrphMcpToolAsync(toolName, rawArgs = {}, deps = {}) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  if (toolName === AGENT_RUNTIME_TOOL_NAME) return executeAgentRuntimeToolAsync(args, deps);
  if (toolName === KNOWGRPH_MCP_DIRECTOR_TOOL_NAME) {
    const result = await runVideoRemixAsync(args, deps);
    return {
      ok: result.payload?.validation?.ok !== false,
      structuredContent: result.payload,
      text: result.text,
    };
  }

  if (toolName === AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME) {
    const payload = await buildAgenticCanvasOsDocsDynamicResolutionPayload(args, { fetchImpl: deps?.fetchImpl });
    return { ok: payload.ok, structuredContent: payload, text: JSON.stringify(payload, null, 2) };
  }

  return executeKnowgrphMcpTool(toolName, args);
}
