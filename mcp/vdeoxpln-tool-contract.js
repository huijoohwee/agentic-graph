import {
  buildAgenticGraphMcpAppsToolMeta,
  buildAgenticGraphMcpNoauthSecuritySchemes,
} from "../canvas/src/features/agent-ready/mcpAppsReadyContract.mjs";

const VDEOXPLN_LIST_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["contractVersion", "validation", "vdeoxplnEntries", "routingPlan"],
  properties: {
    contractVersion: { type: "string" },
    validation: { type: "object", additionalProperties: true },
    vdeoxplnEntries: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    routingPlan: { type: "object", additionalProperties: true },
  },
});

export const buildVdeoxplnLocalToolDefinition = (toolName) => ({
  name: toolName,
  description:
    "Use this when a local MCP host needs to list the canonical AgenticGraph vdeoxpln registry with semantic keys, source owners, tool projections, and optional generated skill markdown.",
  securitySchemes: buildAgenticGraphMcpNoauthSecuritySchemes(),
  _meta: buildAgenticGraphMcpAppsToolMeta(),
  outputSchema: VDEOXPLN_LIST_OUTPUT_SCHEMA,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      includeMarkdown: {
        type: "boolean",
        default: false,
        description: "If true, include generated SKILL.md-style markdown for each vdeoxpln.",
      },
      vdeoxplnId: {
        type: "string",
        description: "Optional vdeoxpln id filter, e.g. agenticgraph-source-files.",
      },
      intentText: {
        type: "string",
        description: "Optional neutral user intent to route against the canonical vdeoxpln registry. Route names and file paths are ignored.",
      },
      contentTypes: {
        type: "array",
        items: { type: "string" },
        description: "Optional neutral content types, such as kgc markdown, source evidence, workspace document, or media metadata.",
      },
      requestedOutputs: {
        type: "array",
        items: { type: "string" },
        description: "Optional artifact families requested by the user, such as workspace artifact, GraphData, report, or canvas topology snapshot.",
      },
      stateSignals: {
        type: "array",
        items: { type: "string" },
        description: "Optional current-state signals from the host workspace; do not pass absolute paths or route-only labels.",
      },
      chatStorageTarget: {
        type: "string",
        enum: ["chatHistory", "chatAgenticGraph"],
        description: "Optional chat storage target used as a state signal for chat-backed vdeoxpln planning.",
      },
      sourceFileCount: {
        type: "number",
        description: "Optional count of active source files in the current workspace.",
      },
      hasGraphData: {
        type: "boolean",
        description: "Optional current-state signal indicating the host has graph topology available.",
      },
      hasSelection: {
        type: "boolean",
        description: "Optional current-state signal indicating there is a current canvas or document selection.",
      },
      hasWorkspaceDocument: {
        type: "boolean",
        description: "Optional current-state signal indicating there is an active workspace document.",
      },
    },
  },
});
