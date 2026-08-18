import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from "../canvas/src/features/agent-ready/knowgrphLocalMcpToolNames.mjs";

export const EXTERNAL_TOOL_GATEWAY_TOOL_NAMES = Object.freeze({
  catalog: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.toolCatalog,
  search: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.toolSearch,
  describe: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.toolDescribe,
  call: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.toolCall,
});

export const EXTERNAL_TOOL_ARTIFACT_KINDS = Object.freeze(["slides", "spreadsheet"]);

const ARTIFACT_KIND_FILTER_SCHEMA = Object.freeze({
  type: "array",
  items: { type: "string", enum: EXTERNAL_TOOL_ARTIFACT_KINDS },
  uniqueItems: true,
  maxItems: EXTERNAL_TOOL_ARTIFACT_KINDS.length,
});

const CAPABILITY_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "capabilityId",
    "capabilityRevision",
    "label",
    "profileLabel",
    "artifactKind",
    "transportType",
    "approvalRequired",
  ],
  properties: {
    capabilityId: { type: "string" },
    capabilityRevision: { type: "string" },
    label: { type: "string" },
    profileLabel: { type: "string" },
    description: { type: "string" },
    artifactKind: { type: "string", enum: EXTERNAL_TOOL_ARTIFACT_KINDS },
    transportType: { type: "string", enum: ["stdio", "streamable-http", "sse"] },
    approvalRequired: { type: "boolean" },
  },
});

const LIST_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["ok", "capabilities", "count"],
  properties: {
    ok: { type: "boolean" },
    capabilities: { type: "array", items: CAPABILITY_SCHEMA },
    count: { type: "integer", minimum: 0 },
  },
});

const APPROVAL_TOKEN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["gateId", "tokenId", "actionDigest", "issuedAt", "expiresAt", "signature"],
  properties: {
    gateId: { type: "string", const: "external-file-write" },
    tokenId: { type: "string", minLength: 16, maxLength: 128 },
    actionDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
    issuedAt: { type: "integer", minimum: 0 },
    expiresAt: { type: "integer", minimum: 0 },
    signature: { type: "string", pattern: "^[0-9a-f]{64}$" },
  },
});

export const EXTERNAL_TOOL_CANONICAL_ARTIFACT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["title", "content", "contentType"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 300 },
    content: { type: "string", minLength: 1, maxLength: 131072 },
    contentType: { type: "string", minLength: 1, maxLength: 160 },
    fileName: { type: "string", minLength: 1, maxLength: 255, pattern: "^[^/\\\\\\u0000]+$" },
    workspacePath: { type: "string", minLength: 12, maxLength: 1024, pattern: "^workspace:/" },
    sourceUrl: { type: "string", minLength: 8, maxLength: 2048, pattern: "^https://" },
  },
});

const CALL_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["ok"],
  properties: {
    ok: { type: "boolean" },
    cached: { type: "boolean" },
    actionDigest: { type: "string" },
    receipt: {
      type: "object",
      additionalProperties: false,
      required: ["externalId", "webUrl", "title", "mimeType", "artifactKind", "capabilityId", "capabilityRevision", "idempotencyKey", "digest"],
      properties: {
        externalId: { type: ["string", "null"] },
        webUrl: { type: "string" },
        title: { type: "string" },
        mimeType: { type: "string" },
        artifactKind: { type: "string", enum: EXTERNAL_TOOL_ARTIFACT_KINDS },
        capabilityId: { type: "string" },
        capabilityRevision: { type: "string" },
        idempotencyKey: { type: "string" },
        digest: { type: "string" },
      },
    },
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: { code: { type: "string" }, message: { type: "string" } },
    },
  },
});

const EXTERNAL_MUTATION_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
  idempotentHint: true,
});

export function isExternalToolGatewayToolName(name) {
  return Object.values(EXTERNAL_TOOL_GATEWAY_TOOL_NAMES).includes(name);
}

export function buildExternalToolGatewayDefinitions(args = {}) {
  const toolNames = args.toolNames || EXTERNAL_TOOL_GATEWAY_TOOL_NAMES;
  const withDefaults = typeof args.withDefaults === "function" ? args.withDefaults : (tool, annotations) => ({ ...tool, annotations });
  const readOnlyAnnotations = args.readOnlyAnnotations || {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  };
  return [
    withDefaults({
      name: toolNames.toolCatalog || toolNames.catalog,
      description: "Use this when a local MCP host needs to list host-approved external Slides and Sheets capabilities without exposing transport configuration or secrets.",
      outputSchema: LIST_OUTPUT_SCHEMA,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          artifactKinds: ARTIFACT_KIND_FILTER_SCHEMA,
          limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        },
      },
    }, readOnlyAnnotations),
    withDefaults({
      name: toolNames.toolSearch || toolNames.search,
      description: "Use this when a local MCP host needs to search the host-approved external Slides and Sheets capability catalog before requesting one bounded schema.",
      outputSchema: LIST_OUTPUT_SCHEMA,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 200 },
          artifactKinds: ARTIFACT_KIND_FILTER_SCHEMA,
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
      },
    }, readOnlyAnnotations),
    withDefaults({
      name: toolNames.toolDescribe || toolNames.describe,
      description: "Use this when a local MCP host needs the bounded argument schema for one opaque host-approved external Slides or Sheets capability.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["capabilityId"],
        properties: {
          capabilityId: { type: "string", minLength: 16, maxLength: 128 },
        },
      },
      outputSchema: {
        type: "object",
        additionalProperties: true,
        required: ["ok"],
        properties: {
          ok: { type: "boolean" },
          capability: CAPABILITY_SCHEMA,
          inputSchema: { type: "object", additionalProperties: true },
        },
      },
    }, readOnlyAnnotations),
    withDefaults({
      name: toolNames.toolCall || toolNames.call,
      description: "Use this when a local MCP host needs to invoke one exact host-approved external Slides or Sheets capability with a canonical artifact, idempotency, and a digest-bound single-use approval token.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["capabilityId", "capabilityRevision", "artifact", "idempotencyKey", "approvalToken"],
        properties: {
          capabilityId: { type: "string", minLength: 16, maxLength: 128 },
          capabilityRevision: { type: "string", pattern: "^[0-9a-f]{64}$" },
          artifact: EXTERNAL_TOOL_CANONICAL_ARTIFACT_SCHEMA,
          idempotencyKey: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" },
          approvalToken: APPROVAL_TOKEN_SCHEMA,
        },
      },
      outputSchema: CALL_OUTPUT_SCHEMA,
    }, EXTERNAL_MUTATION_ANNOTATIONS),
  ];
}
