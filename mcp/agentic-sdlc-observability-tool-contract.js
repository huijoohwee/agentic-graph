export const AGENTIC_SDLC_OBSERVABILITY_TOOL_NAME = "agenticgraph.agentic_sdlc.observe";
export const AGENTIC_SDLC_OBSERVABILITY_INVOCATION =
  "/sdlc.observe #agentic-sdlc-observability @implementation-run @canvas @runtime-proof";
export const AGENTIC_SDLC_OBSERVATION_SCHEMA = "agenticgraph-agentic-sdlc-observation/v1";
export const AGENTIC_SDLC_CANVAS_PROJECTION_SCHEMA = "agentic-sdlc-canvas-projection/v1";

export const AGENTIC_SDLC_OBSERVATION_VIEWS = Object.freeze([
  "overview",
  "plan",
  "execution",
  "evidence",
  "economics",
  "recovery",
  "receipts",
  "full",
]);

export const AGENTIC_SDLC_OBSERVATION_FAILURE_CODES = Object.freeze([
  "run_not_found",
  "revision_conflict",
  "canonical_ledger_unavailable",
  "ledger_digest_mismatch",
  "ledger_schema_invalid",
  "ledger_conformance_failed",
  "stale_cursor",
  "unsupported_view",
  "projection_too_large",
  "acos_revision_mismatch",
  "invalid_request",
  "internal_error",
]);

const GIT_REVISION = Object.freeze({ type: "string", pattern: "^[0-9a-f]{40}$" });
const SHA256 = Object.freeze({ type: "string", pattern: "^[0-9a-f]{64}$" });
const PREFIXED_SHA256 = Object.freeze({ type: "string", pattern: "^sha256:[0-9a-f]{64}$" });
const IMPLEMENTATION_RUN_ID = Object.freeze({ type: "string", pattern: "^ir_[a-f0-9]{24}$" });
const NONEMPTY_TEXT = Object.freeze({ type: "string", minLength: 1, maxLength: 4096 });
const CURSOR = Object.freeze({
  type: "string",
  pattern: "^[A-Za-z0-9_-]+$",
  minLength: 1,
  maxLength: 4096,
});

export const AGENTIC_SDLC_OBSERVATION_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "invocation",
    "runId",
    "view",
    "expectedRevision",
    "expectedLedgerDigest",
  ],
  properties: {
    invocation: {
      type: "object",
      additionalProperties: false,
      required: ["action", "semantic", "bindings"],
      properties: {
        action: { const: "/sdlc.observe" },
        semantic: { const: "#agentic-sdlc-observability" },
        bindings: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          prefixItems: [
            { const: "@implementation-run" },
            { const: "@canvas" },
            { const: "@runtime-proof" },
          ],
          items: false,
        },
      },
    },
    runId: IMPLEMENTATION_RUN_ID,
    view: { type: "string", enum: AGENTIC_SDLC_OBSERVATION_VIEWS },
    expectedRevision: { type: "integer", minimum: 1 },
    expectedLedgerDigest: PREFIXED_SHA256,
    cursor: CURSOR,
    limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
  },
});

const STATUS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "runtimeReady",
    "localReadiness",
    "verified",
    "verifiedTaskCount",
    "deliveryReady",
    "deployed",
    "deployBoundary",
  ],
  properties: {
    runtimeReady: { type: "boolean" },
    verified: { type: "boolean" },
    localReadiness: {
      type: "string",
      enum: [
        "undocumented",
        "spec-complete",
        "dev-proven",
        "runtime-ready",
        "production-verified",
      ],
    },
    verifiedTaskCount: { type: "integer", minimum: 0 },
    deliveryReady: { type: "boolean" },
    deployed: { type: "boolean" },
    deployBoundary: { const: "closed" },
  },
});

const CONFORMANCE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "runId",
    "valid",
    "runtimeReady",
    "admissionReady",
    "localReadiness",
    "deliveredReadiness",
    "controlFailures",
    "findingCounts",
    "severityCounts",
    "findings",
    "metrics",
  ],
  properties: {
    schema: { const: "agenticgraph-agentic-sdlc-conformance-summary/v1" },
    runId: NONEMPTY_TEXT,
    valid: { const: true },
    runtimeReady: { type: "boolean" },
    admissionReady: { type: "boolean" },
    localReadiness: {
      type: "string",
      enum: [
        "undocumented",
        "spec-complete",
        "dev-proven",
        "runtime-ready",
        "production-verified",
      ],
    },
    deliveredReadiness: {
      type: "string",
      enum: [
        "undocumented",
        "spec-complete",
        "dev-proven",
        "runtime-ready",
        "production-verified",
      ],
    },
    controlFailures: {
      type: "array",
      maxItems: 200,
      uniqueItems: true,
      items: NONEMPTY_TEXT,
    },
    findingCounts: {
      type: "object",
      maxProperties: 200,
      propertyNames: {
        type: "string",
        pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
        maxLength: 120,
      },
      additionalProperties: { type: "integer", minimum: 0 },
    },
    severityCounts: {
      type: "object",
      additionalProperties: false,
      required: ["blocker", "major", "minor"],
      properties: {
        blocker: { type: "integer", minimum: 0 },
        major: { type: "integer", minimum: 0 },
        minor: { type: "integer", minimum: 0 },
      },
    },
    findings: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "findingType",
          "severity",
          "guidelineAnchor",
          "artifactReference",
          "evidenceExcerpt",
        ],
        properties: {
          findingType: {
            type: "string",
            pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
            maxLength: 120,
          },
          severity: { type: "string", enum: ["blocker", "major", "minor"] },
          guidelineAnchor: NONEMPTY_TEXT,
          artifactReference: NONEMPTY_TEXT,
          evidenceExcerpt: NONEMPTY_TEXT,
        },
      },
    },
    metrics: {
      type: "object",
      additionalProperties: false,
      required: [
        "taskCount",
        "vccCount",
        "coveredVccCount",
        "verifiedTaskCount",
        "evidenceReferenceCount",
        "bridgeCoverageRatio",
        "boundaryClosed",
        "persistenceComplete",
        "humanGatesClosed",
        "economicsWithinEstimate",
        "totalTokenConsumption",
      ],
      properties: {
        taskCount: { type: "integer", minimum: 0 },
        vccCount: { type: "integer", minimum: 0 },
        coveredVccCount: { type: "integer", minimum: 0 },
        verifiedTaskCount: { type: "integer", minimum: 0 },
        evidenceReferenceCount: { type: "integer", minimum: 0 },
        bridgeCoverageRatio: { type: "number", minimum: 0, maximum: 1 },
        boundaryClosed: { type: "boolean" },
        persistenceComplete: { type: "boolean" },
        humanGatesClosed: { type: "boolean" },
        economicsWithinEstimate: { type: "boolean" },
        totalTokenConsumption: { type: "integer", minimum: 0 },
      },
    },
  },
});

const PROJECTION_STATUS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["verified", "deliveryReady", "deployed"],
  properties: {
    verified: { type: ["boolean", "null"] },
    deliveryReady: { type: ["boolean", "null"] },
    deployed: { type: ["boolean", "null"] },
  },
});

const PAGE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "cursor",
    "nextCursor",
    "offset",
    "limit",
    "count",
    "total",
    "stubCount",
    "truncated",
  ],
  properties: {
    cursor: { oneOf: [CURSOR, { type: "null" }] },
    nextCursor: { oneOf: [CURSOR, { type: "null" }] },
    offset: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1, maximum: 200 },
    count: { type: "integer", minimum: 0, maximum: 200 },
    total: { type: "integer", minimum: 0 },
    stubCount: { type: "integer", minimum: 0 },
    truncated: { type: "boolean" },
  },
});

const GRAPH_NODE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "type", "properties"],
  properties: {
    id: NONEMPTY_TEXT,
    label: NONEMPTY_TEXT,
    type: {
      type: "string",
      enum: [
        "run",
        "criterion",
        "vcc",
        "task",
        "transition",
        "dispatch",
        "return",
        "check",
        "evidence",
        "finding",
        "budget",
        "receipt",
        "gate",
        "checkpoint",
      ],
    },
    properties: {
      type: "object",
      additionalProperties: { $ref: "#/$defs/jsonValue" },
      maxProperties: 100,
    },
  },
});

const GRAPH_EDGE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["id", "source", "target", "label", "type", "properties"],
  properties: {
    id: NONEMPTY_TEXT,
    source: NONEMPTY_TEXT,
    target: NONEMPTY_TEXT,
    label: NONEMPTY_TEXT,
    type: {
      type: "string",
      enum: [
        "defines",
        "covers",
        "dependsOn",
        "transitionsTo",
        "dispatchedAs",
        "returnedAs",
        "verifiedBy",
        "evidencedBy",
        "consumes",
        "gatedBy",
        "persistedAs",
      ],
    },
    properties: {
      type: "object",
      additionalProperties: { $ref: "#/$defs/jsonValue" },
      maxProperties: 50,
    },
  },
});

const GRAPH_DATA_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["type", "context", "metadata", "nodes", "edges"],
  properties: {
    type: { const: "Graph" },
    context: { const: "agentic-sdlc-observability" },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: [
        "schema",
        "invocation",
        "runId",
        "view",
        "recordSetDigest",
        "projectionDigest",
        "status",
      ],
      properties: {
        schema: { const: AGENTIC_SDLC_CANVAS_PROJECTION_SCHEMA },
        invocation: { const: AGENTIC_SDLC_OBSERVABILITY_INVOCATION },
        runId: NONEMPTY_TEXT,
        view: { type: "string", enum: AGENTIC_SDLC_OBSERVATION_VIEWS },
        recordSetDigest: SHA256,
        projectionDigest: SHA256,
        status: PROJECTION_STATUS_SCHEMA,
      },
    },
    nodes: { type: "array", maxItems: 400, items: GRAPH_NODE_SCHEMA },
    edges: { type: "array", maxItems: 1200, items: GRAPH_EDGE_SCHEMA },
  },
});

const PROJECTION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "projectionDigest",
    "pageDigest",
    "view",
    "ordering",
    "page",
    "graphData",
    "kgcMarkdown",
  ],
  properties: {
    schema: { const: AGENTIC_SDLC_CANVAS_PROJECTION_SCHEMA },
    projectionDigest: SHA256,
    pageDigest: SHA256,
    view: { type: "string", enum: AGENTIC_SDLC_OBSERVATION_VIEWS },
    ordering: { const: "type_rank_then_id" },
    page: PAGE_SCHEMA,
    graphData: GRAPH_DATA_SCHEMA,
    kgcMarkdown: { type: "string", minLength: 1, maxLength: 2_000_000 },
  },
});

const SOURCE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "implementationRunId",
    "implementationRunRevision",
    "implementationRunState",
    "canonicalRunId",
    "canonicalSchema",
    "ledgerArtifact",
    "ledgerRevision",
    "ledgerDigest",
    "acosRevision",
  ],
  properties: {
    implementationRunId: IMPLEMENTATION_RUN_ID,
    implementationRunRevision: { type: "integer", minimum: 1 },
    implementationRunState: {
      type: "string",
      enum: [
        "queued",
        "claiming",
        "provisioning",
        "running",
        "verifying",
        "delivery_ready",
        "review_ready",
        "paused",
        "blocked",
        "failed",
        "canceled",
      ],
    },
    canonicalRunId: NONEMPTY_TEXT,
    canonicalSchema: { const: "agentic-sdlc-run/v1" },
    ledgerArtifact: {
      type: "string",
      pattern: "^[a-z0-9][a-z0-9._-]{0,119}$",
    },
    ledgerRevision: { type: "integer", minimum: 1 },
    ledgerDigest: PREFIXED_SHA256,
    acosRevision: GIT_REVISION,
  },
});

const CACHE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["key", "status", "policy"],
  properties: {
    key: PREFIXED_SHA256,
    status: { type: "string", enum: ["hit", "miss"] },
    policy: { const: "content-addressed-lru" },
  },
});

const ECONOMICS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "modelCalls",
    "networkCalls",
    "promptTokens",
    "completionTokens",
    "estimatedCostUsd",
    "providerSpendUsd",
  ],
  properties: {
    modelCalls: { const: 0 },
    networkCalls: { const: 0 },
    promptTokens: { const: 0 },
    completionTokens: { const: 0 },
    estimatedCostUsd: { const: 0 },
    providerSpendUsd: { const: 0 },
  },
});

const ERROR_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["code", "message", "retryable"],
  properties: {
    code: { type: "string", enum: AGENTIC_SDLC_OBSERVATION_FAILURE_CODES },
    message: { type: "string", minLength: 1, maxLength: 2000 },
    retryable: { type: "boolean" },
  },
});

export const AGENTIC_SDLC_OBSERVATION_OUTPUT_SCHEMA = Object.freeze({
  $defs: {
    jsonValue: {
      oneOf: [
        { type: "null" },
        { type: "boolean" },
        { type: "number" },
        { type: "string", maxLength: 16_384 },
        {
          type: "array",
          maxItems: 200,
          items: { $ref: "#/$defs/jsonValue" },
        },
        {
          type: "object",
          maxProperties: 100,
          additionalProperties: { $ref: "#/$defs/jsonValue" },
        },
      ],
    },
  },
  type: "object",
  additionalProperties: false,
  required: ["schema", "ok", "economics"],
  properties: {
    schema: { const: AGENTIC_SDLC_OBSERVATION_SCHEMA },
    ok: { type: "boolean" },
    source: SOURCE_SCHEMA,
    status: STATUS_SCHEMA,
    conformance: CONFORMANCE_SCHEMA,
    projection: PROJECTION_SCHEMA,
    cache: CACHE_SCHEMA,
    economics: ECONOMICS_SCHEMA,
    error: ERROR_SCHEMA,
  },
  oneOf: [
    {
      properties: { ok: { const: true } },
      required: ["source", "status", "conformance", "projection", "cache"],
      not: { required: ["error"] },
    },
    {
      properties: { ok: { const: false } },
      required: ["error"],
      not: {
        anyOf: [
          { required: ["source"] },
          { required: ["status"] },
          { required: ["conformance"] },
          { required: ["projection"] },
        ],
      },
    },
  ],
});

const READ_ONLY_LOCAL = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
});

export function buildAgenticSdlcObservabilityToolDefinitions({ toolNames, withDefaults }) {
  if (toolNames.agenticSdlcObserve !== AGENTIC_SDLC_OBSERVABILITY_TOOL_NAME) {
    throw new Error("Shared local MCP tool name drifted for Agentic SDLC observability.");
  }
  const definition = {
    name: toolNames.agenticSdlcObserve,
    title: "Agentic SDLC Observability",
    description:
      "Use this read-only local tool to project one exact revision- and ledger-digest-fenced agentic-sdlc-run/v1 into deterministic paged AgenticGraph Canvas evidence without model calls, network calls, deployment, or a second graph store.",
    inputSchema: AGENTIC_SDLC_OBSERVATION_INPUT_SCHEMA,
    outputSchema: AGENTIC_SDLC_OBSERVATION_OUTPUT_SCHEMA,
    annotations: READ_ONLY_LOCAL,
  };
  return [withDefaults(definition, READ_ONLY_LOCAL)];
}
