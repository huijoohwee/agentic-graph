export const KNOWLEDGE_GRAPH_INVOCATION_SCHEMA_ID = "knowgrph-knowledge-graph-invocation/v1";
export const AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID = "agentic-canvas-os-docs-routing/v1";

const TOOL_BY_OPERATION = Object.freeze({
  ingest: "knowgrph.knowledge_graph.ingest",
  query: "knowgrph.knowledge_graph.query",
  explain: "knowgrph.knowledge_graph.explain_edge",
});

const stringArray = (description, maxItems = 128) => ({
  type: "array",
  items: { type: "string", minLength: 1, maxLength: 512 },
  maxItems,
  uniqueItems: true,
  description,
});

const TOKEN_BODY = "[A-Za-z0-9_.-]{1,96}";
const tokenArray = (sigil, description) => ({
  type: "array",
  items: { type: "string", pattern: `^${sigil}${TOKEN_BODY}$` },
  minItems: 1,
  maxItems: 12,
  uniqueItems: true,
  description,
});

const invocationSchema = (tool) => ({
  type: "object",
  additionalProperties: false,
  description:
    "Optional source-backed Agentic Canvas OS resolution proof. It binds well-formed invocation tokens and digest-verified routing metadata to the MCP tool without freezing aliases.",
  required: [
    "schema",
    "tool",
    "action",
    "semantics",
    "bindings",
    "sourceRevision",
    "catalogDigest",
    "routingSchema",
    "routingDigest",
  ],
  properties: {
    schema: { const: KNOWLEDGE_GRAPH_INVOCATION_SCHEMA_ID },
    tool: tool
      ? { const: tool }
      : { type: "string", pattern: "^knowgrph\\.[A-Za-z0-9_.-]{1,200}$" },
    action: { type: "string", pattern: `^/${TOKEN_BODY}$` },
    semantics: tokenArray("#", "Source-backed semantic aliases resolved by Agentic Canvas OS."),
    bindings: tokenArray("@", "Source-backed binding aliases resolved by Agentic Canvas OS."),
    sourceRevision: { type: "string", pattern: "^[0-9a-f]{40}$" },
    catalogDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
    routingSchema: { const: AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID },
    routingDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
  },
});

export const KNOWLEDGE_GRAPH_INVOCATION_PROOF_SCHEMA = Object.freeze(invocationSchema());

const GRAPH_ID_SCHEMA = { type: "string", pattern: "^kg:graph:[0-9a-f]{32}$" };
const SNAPSHOT_DIGEST_SCHEMA = { type: "string", pattern: "^[0-9a-f]{64}$" };
const GRAPH_DATA_SCHEMA = {
  type: "object",
  additionalProperties: true,
  required: ["type", "nodes", "edges"],
  properties: {
    type: { const: "Graph" },
    nodes: { type: "array", maxItems: 1000 },
    edges: { type: "array", maxItems: 1000 },
  },
};

const commonOutputSchema = (operation) => ({
  type: "object",
  additionalProperties: true,
  required: ["schema", "ok", "operation"],
  properties: {
    schema: { type: "string", pattern: "^knowgrph-knowledge-graph(?:-[a-z-]+)?/v[0-9]+$" },
    ok: { type: "boolean" },
    operation: { const: operation },
    graphId: GRAPH_ID_SCHEMA,
    snapshotDigest: SNAPSHOT_DIGEST_SCHEMA,
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: { type: "string", minLength: 1 },
        message: { type: "string", minLength: 1 },
        details: { type: "object", additionalProperties: true },
      },
    },
  },
  oneOf: [
    {
      properties: { ok: { const: false } },
      required: ["error"],
    },
    {
      properties: {
        ok: { const: true },
        ...(operation === "ingest" ? {
          complete: { type: "boolean" },
          counts: { type: "object", additionalProperties: { type: "number" } },
          projection: {
            type: "object",
            additionalProperties: false,
            required: ["token", "readOnly", "graphData", "complete", "truncated", "limit"],
            properties: {
              token: { type: "string", pattern: "^kg:projection:[0-9a-f]{24}$" },
              readOnly: { const: true },
              graphData: GRAPH_DATA_SCHEMA,
              complete: { type: "boolean" },
              truncated: { type: "boolean" },
              limit: { type: "integer", minimum: 1, maximum: 1000 },
              reason: { type: "string", minLength: 1, maxLength: 200 },
            },
          },
        } : {}),
      },
      required: operation === "ingest"
        ? ["graphId", "snapshotDigest", "complete", "counts", "projection"]
        : ["graphId", "snapshotDigest"],
    },
  ],
});

const INGEST_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  oneOf: [
    { required: ["rootPath"], not: { required: ["repositoryUrl"] } },
    { required: ["repositoryUrl"], not: { required: ["rootPath"] } },
  ],
  properties: {
    rootPath: {
      type: "string",
      minLength: 1,
      description:
        "Codebase or corpus root. It must resolve inside the host-owned allowed-root set after realpath and symlink checks.",
    },
    repositoryUrl: {
      type: "string",
      minLength: 1,
      maxLength: 2048,
      pattern: "^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\\.git)?(?:/tree/.+)?$",
      description:
        "Optional credential-free GitHub repository or tree URL. The host resolves one immutable commit into its private local acquisition cache before deterministic parsing.",
    },
    repositoryRef: { type: "string", minLength: 1, maxLength: 512 },
    acquisitionTimeoutMs: { type: "integer", minimum: 1000, maximum: 600000, default: 120000 },
    include: stringArray("Optional repo-relative include globs or suffixes."),
    exclude: stringArray("Optional repo-relative exclude globs or path prefixes."),
    maxFiles: { type: "integer", minimum: 1, maximum: 250000, default: 100000 },
    maxFileBytes: { type: "integer", minimum: 1, maximum: 100000000, default: 2000000 },
    maxTotalBytes: { type: "integer", minimum: 1, maximum: 4000000000, default: 1000000000 },
    maxDurationMs: { type: "integer", minimum: 100, maximum: 3600000, default: 300000 },
    projectionLimit: { type: "integer", minimum: 1, maximum: 1000, default: 200 },
    useCache: { type: "boolean", default: true },
    strict: {
      type: "boolean",
      default: true,
      description:
        "Require explained, source-backed edges and refuse replacement after parser errors, partial syntax extraction, or invalid output. Typed unsupported and size-limited omissions remain in the manifest.",
    },
    invocation: invocationSchema(TOOL_BY_OPERATION.ingest),
  },
});

const QUERY_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["graphId", "expectedSnapshotDigest", "mode"],
  properties: {
    graphId: GRAPH_ID_SCHEMA,
    expectedSnapshotDigest: {
      ...SNAPSHOT_DIGEST_SCHEMA,
      description: "Exact snapshot digest returned by ingestion; mismatch fails closed instead of selecting a replaced snapshot.",
    },
    mode: { enum: ["search", "path", "neighbors", "impact", "summary"] },
    query: { type: "string", maxLength: 4000 },
    from: { type: "string", maxLength: 1000 },
    to: { type: "string", maxLength: 1000 },
    direction: { enum: ["outgoing", "incoming", "both"], default: "both" },
    edgeLabels: stringArray("Optional exact edge-label allowlist for traversal.", 64),
    maxDepth: { type: "integer", minimum: 0, maximum: 12, default: 3 },
    limit: { type: "integer", minimum: 1, maximum: 200, default: 20 },
    maxDurationMs: { type: "integer", minimum: 100, maximum: 3600000, default: 300000 },
    invocation: invocationSchema(TOOL_BY_OPERATION.query),
  },
});

const EXPLAIN_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["graphId", "expectedSnapshotDigest", "edgeId"],
  properties: {
    graphId: GRAPH_ID_SCHEMA,
    expectedSnapshotDigest: {
      ...SNAPSHOT_DIGEST_SCHEMA,
      description: "Exact snapshot digest returned by ingestion; mismatch fails closed instead of selecting a replaced snapshot.",
    },
    edgeId: { type: "string", minLength: 1, maxLength: 2000 },
    maxDurationMs: { type: "integer", minimum: 100, maximum: 3600000, default: 300000 },
    invocation: invocationSchema(TOOL_BY_OPERATION.explain),
  },
});

export const KNOWLEDGE_GRAPH_INPUT_SCHEMAS = Object.freeze({
  ingest: INGEST_INPUT_SCHEMA,
  query: QUERY_INPUT_SCHEMA,
  explain_edge: EXPLAIN_INPUT_SCHEMA,
});

export function buildKnowledgeGraphToolDefinitions({ toolNames, withDefaults, readOnlyAnnotations, processAnnotations }) {
  return [
    withDefaults({
      name: toolNames.knowledgeGraphIngest,
      title: "Ingest deterministic knowledge graph",
      description:
        "Inventories a bounded local directory or strictly acquired repository commit into a sharded deterministic explained-edge graph. An optional source-backed invocation proof may carry current slash-command, semantic, and binding aliases without freezing them here. URL acquisition is the only network-capable phase; parsing makes zero model calls and uses no vector store.",
      inputSchema: INGEST_INPUT_SCHEMA,
      outputSchema: commonOutputSchema("ingest"),
    }, processAnnotations),
    withDefaults({
      name: toolNames.knowledgeGraphQuery,
      title: "Query deterministic knowledge graph",
      description:
        "Provides bounded local lexical search, directed paths, neighborhoods, impact traversal, or summaries over an opaque graph identity. An optional source-backed invocation proof may carry current slash-command, semantic, and binding aliases without freezing them here. Query performs no network access and retains exact source and edge evidence.",
      inputSchema: QUERY_INPUT_SCHEMA,
      outputSchema: commonOutputSchema("query"),
    }, readOnlyAnnotations),
    withDefaults({
      name: toolNames.knowledgeGraphExplainEdge,
      title: "Explain knowledge graph edge",
      description:
        "Reads the deterministic rule, parser and source digests, source span, excerpt hash, certainty, premises, and ambiguity for one edge. An optional source-backed invocation proof may carry current slash-command, semantic, and binding aliases without freezing them here. Explanation uses no network, model, or vector retrieval.",
      inputSchema: EXPLAIN_INPUT_SCHEMA,
      outputSchema: commonOutputSchema("explain_edge"),
    }, readOnlyAnnotations),
  ];
}
