export const AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME = "agenticgraph.agentic_canvas_os.docs.invoke";
export const AGENTIC_CANVAS_OS_DOCS_CONTROL_PLANE_PATH = "/agenticgraph/control-plane/mcp";
export const AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA = "agentic-canvas-os-docs-routing/v1";

export const AGENTIC_CANVAS_OS_DOCS_WORKSPACE_ROOT = "agentic-canvas-os/docs";
export const AGENTIC_CANVAS_OS_DOCS_SOURCE_ROOT_URL =
  "https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs";
export const AGENTIC_CANVAS_OS_LIVE_AGENT_PROOF_FILE = "LIVE-AGENT-PROVIDER-PROOF.md";
export const AGENTIC_CANVAS_OS_PROGRESSIVE_AGENTS_FILE = "PROGRESSIVE-AGENTS.md";
export const AGENTIC_CANVAS_OS_DOCS_CATALOG_DIGEST_PATTERN = "^[0-9a-f]{64}$";

export const AGENTIC_CANVAS_OS_DOCS_KIND_FILES = Object.freeze({
  command: "DICTIONARY-COMMAND.md",
  semantic: "DICTIONARY-SEMANTIC.md",
  binding: "DICTIONARY-BINDING.md",
});

export const AGENTIC_CANVAS_OS_DOCS_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    token: {
      type: "string",
      description: "Optional invocation token to resolve, such as /query, #runtime-ready, or @mcp-gateway.",
    },
    query: {
      type: "string",
      description: "Optional case-insensitive filter over tokens, source paths, and summaries.",
    },
    includeContent: {
      type: "boolean",
      default: false,
      description: "When true on the local stdio MCP server, include the matching source row or section snippet.",
    },
    limit: {
      type: "number",
      minimum: 1,
      maximum: 500,
      default: 120,
      description: "Maximum catalog entries returned when token is omitted.",
    },
  },
});

const PROGRESSIVE_AGENTS_READINESS_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "schema", "status", "sourceRevision", "sourcePath", "sourceUrl", "contractSchema",
    "runtimeScope", "runtimeOwner", "runtimeProof", "contractReady", "configured",
    "progressionPolicy", "growthStages", "externalSdkDependency", "providerExecutionStatus",
    "defaultWorkerConfigured", "deployPolicy",
  ],
  properties: {
    schema: { const: "progressive-agents-readiness-summary/v1" },
    status: { enum: ["runtime-ready-dev", "unavailable"] },
    sourceRevision: { type: "string", pattern: "^[0-9a-f]{40}$" },
    sourcePath: { const: "docs/PROGRESSIVE-AGENTS.md" },
    sourceUrl: { type: "string" },
    contractSchema: { type: "string" },
    runtimeScope: { type: "string" },
    runtimeOwner: { type: "string" },
    runtimeProof: { type: "string" },
    contractReady: { type: "boolean" },
    configured: { type: ["boolean", "null"] },
    progressionPolicy: { enum: ["single-agent-then-tools-then-specialists", "unavailable"] },
    growthStages: { type: "array", items: { type: "string" }, maxItems: 3 },
    externalSdkDependency: { type: ["boolean", "null"] },
    providerExecutionStatus: { enum: ["unverified", "unavailable"] },
    defaultWorkerConfigured: { type: ["boolean", "null"] },
    deployPolicy: { type: "string" },
  },
});

export const AGENTIC_CANVAS_OS_DOCS_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: [
    "ok", "docsRoot", "sourceRootUrl", "sourceRevision",
    "catalogDigest", "routingSchema", "routingDigest", "counts",
    "liveAgentProviderProof", "progressiveAgentsReadiness", "catalog",
  ],
  properties: {
    ok: { type: "boolean" },
    docsRoot: { type: "string" },
    sourceRootUrl: { type: "string" },
    sourceRevision: { type: "string", pattern: "^[0-9a-f]{40}$" },
    catalogDigest: { type: "string", pattern: AGENTIC_CANVAS_OS_DOCS_CATALOG_DIGEST_PATTERN },
    routingSchema: { const: AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA },
    routingDigest: { type: "string", pattern: AGENTIC_CANVAS_OS_DOCS_CATALOG_DIGEST_PATTERN },
    liveAgentProviderProof: { type: "object", additionalProperties: true },
    progressiveAgentsReadiness: PROGRESSIVE_AGENTS_READINESS_OUTPUT_SCHEMA,
    absoluteDocsRoot: { type: "string" },
    token: { type: "string" },
    invocation: { type: ["object", "null"], additionalProperties: true },
    catalog: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    counts: {
      type: "object",
      additionalProperties: false,
      required: ["command", "semantic", "binding"],
      properties: {
        command: { type: "integer", minimum: 0 },
        semantic: { type: "integer", minimum: 0 },
        binding: { type: "integer", minimum: 0 },
      },
    },
    truncated: { type: "boolean" },
    error: { type: "object", additionalProperties: true },
  },
});

export const AGENTIC_CANVAS_OS_DOCS_TOOL_DEFINITION = Object.freeze({
  name: AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
  title: "Agentic Canvas OS Docs Invocation",
  description:
    "Use this when you need to resolve /, #, and @ invocation tokens from the Agentic Canvas OS docs SSOT without running commands, spending model tokens, or mutating files.",
  inputSchema: AGENTIC_CANVAS_OS_DOCS_INPUT_SCHEMA,
  outputSchema: AGENTIC_CANVAS_OS_DOCS_OUTPUT_SCHEMA,
});

export const kindForAgenticCanvasOsToken = (token) => {
  const value = String(token || "").trim();
  if (value.startsWith("/")) return "command";
  if (value.startsWith("#")) return "semantic";
  if (value.startsWith("@")) return "binding";
  return "";
};

export const dictionaryFileForAgenticCanvasOsToken = (token) => {
  const kind = kindForAgenticCanvasOsToken(token);
  return kind ? AGENTIC_CANVAS_OS_DOCS_KIND_FILES[kind] : "";
};

const normalizeCatalogDigestText = (value) => String(value || "").trim();

export const serializeAgenticCanvasOsDocsCatalogForDigest = (catalog = []) => `${JSON.stringify(
  [...catalog]
    .map((entry) => ({
      token: normalizeCatalogDigestText(entry?.token),
      kind: normalizeCatalogDigestText(entry?.kind).toLowerCase(),
      label: normalizeCatalogDigestText(entry?.label),
      summary: normalizeCatalogDigestText(entry?.summary),
      sourcePath: normalizeCatalogDigestText(entry?.sourcePath),
    }))
    .sort((left, right) => left.token.localeCompare(right.token)),
)}\n`;

const normalizeRoutingTokens = (values, sigil = "") => [
  ...new Set((Array.isArray(values) ? values : [])
    .map(normalizeCatalogDigestText)
    .filter((value) => value && (!sigil || value.startsWith(sigil)))),
];

export const serializeAgenticCanvasOsDocsRoutingForDigest = (catalog = []) => `${JSON.stringify({
  schema: AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA,
  routes: [...catalog]
    .map((entry) => ({
      token: normalizeCatalogDigestText(entry?.token),
      kind: normalizeCatalogDigestText(entry?.kind).toLowerCase(),
      sourcePath: normalizeCatalogDigestText(entry?.sourcePath),
      mcpTools: normalizeRoutingTokens(
        Array.isArray(entry?.mcpTools)
          ? entry.mcpTools
          : normalizeCatalogDigestText(entry?.mcpTool) ? [entry.mcpTool] : [],
      ),
      semantics: normalizeRoutingTokens(entry?.semantics, "#"),
      bindings: normalizeRoutingTokens(entry?.bindings, "@"),
    }))
    .sort((left, right) => left.token.localeCompare(right.token)),
})}\n`;
