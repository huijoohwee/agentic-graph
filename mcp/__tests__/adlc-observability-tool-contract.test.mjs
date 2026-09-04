import assert from "node:assert/strict";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  ADLC_CANVAS_PROJECTION_SCHEMA,
  ADLC_OBSERVABILITY_INVOCATION,
  ADLC_OBSERVABILITY_TOOL_NAME,
  ADLC_OBSERVATION_FAILURE_CODES,
  ADLC_OBSERVATION_INPUT_SCHEMA,
  ADLC_OBSERVATION_OUTPUT_SCHEMA,
  ADLC_OBSERVATION_SCHEMA,
  ADLC_OBSERVATION_VIEWS,
} from "../adlc-observability-tool-contract.js";
import {
  buildAgenticGraphLocalMcpToolDefinitions,
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES,
} from "../local-tool-contract.js";

const sha = "a".repeat(64);
const prefixedSha = `sha256:${sha}`;
const gitSha = "b".repeat(40);

const request = {
  invocation: {
    action: "/adlc.observe",
    semantic: "#adlc-observability",
    bindings: ["@implementation-run", "@canvas", "@runtime-proof"],
  },
  runId: "ir_0123456789abcdef01234567",
  view: "execution",
  expectedRevision: 7,
  expectedLedgerDigest: prefixedSha,
  limit: 100,
};

const economics = {
  modelCalls: 0,
  networkCalls: 0,
  promptTokens: 0,
  completionTokens: 0,
  estimatedCostUsd: 0,
  providerSpendUsd: 0,
};

const success = {
  schema: ADLC_OBSERVATION_SCHEMA,
  ok: true,
  source: {
    implementationRunId: request.runId,
    implementationRunRevision: request.expectedRevision,
    implementationRunState: "delivery_ready",
    canonicalRunId: "sdlc-run-1",
    canonicalSchema: "agentic-sdlc-run/v1",
    receiptSchema: "adlc-ledger-receipt/v1",
    ledgerArtifact: "adlc-run.json",
    ledgerRevision: 7,
    ledgerDigest: prefixedSha,
    acosRevision: gitSha,
  },
  status: {
    runtimeReady: true,
    localReadiness: "runtime-ready",
    verified: true,
    verifiedTaskCount: 3,
    deliveryReady: true,
    deployed: false,
    deployBoundary: "closed",
  },
  conformance: {
    schema: "agentic-graph-adlc-conformance-summary/v1",
    runId: "sdlc-run-1",
    valid: true,
    runtimeReady: true,
    admissionReady: true,
    localReadiness: "runtime-ready",
    deliveredReadiness: "undocumented",
    controlFailures: [],
    findingCounts: {},
    severityCounts: { blocker: 0, major: 0, minor: 0 },
    findings: [],
    metrics: {
      taskCount: 3,
      vccCount: 3,
      coveredVccCount: 3,
      verifiedTaskCount: 3,
      evidenceReferenceCount: 3,
      bridgeCoverageRatio: 1,
      boundaryClosed: true,
      persistenceComplete: true,
      humanGatesClosed: true,
      economicsWithinEstimate: true,
      totalTokenConsumption: 0,
    },
  },
  projection: {
    schema: ADLC_CANVAS_PROJECTION_SCHEMA,
    projectionDigest: sha,
    pageDigest: sha,
    view: "execution",
    ordering: "type_rank_then_id",
    page: {
      cursor: null,
      nextCursor: null,
      offset: 0,
      limit: 100,
      count: 2,
      total: 2,
      stubCount: 0,
      truncated: false,
    },
    graphData: {
      type: "Graph",
      context: "adlc-observability",
      metadata: {
        schema: ADLC_CANVAS_PROJECTION_SCHEMA,
        invocation: ADLC_OBSERVABILITY_INVOCATION,
        runId: "sdlc-run-1",
        view: "execution",
        recordSetDigest: sha,
        projectionDigest: sha,
        status: { verified: true, deliveryReady: true, deployed: false },
      },
      nodes: [
        { id: "sdlc-run-one", label: "Run", type: "run", properties: { state: "verified" } },
        { id: "sdlc-task-one", label: "Task 1", type: "task", properties: { ordinal: 1 } },
      ],
      edges: [
        {
          id: "sdlc-edge-one",
          source: "sdlc-run-one",
          target: "sdlc-task-one",
          label: "defines",
          type: "defines",
          properties: {},
        },
      ],
    },
    agenticOsMarkdown: "---\nschema: adlc-canvas-projection/v1\n---\n",
  },
  cache: { key: prefixedSha, status: "miss", policy: "content-addressed-lru" },
  economics,
};

test("local MCP publishes the exact read-only ADLC observation descriptor", () => {
  const definitions = buildAgenticGraphLocalMcpToolDefinitions();
  const descriptor = definitions.find((entry) => entry.name === ADLC_OBSERVABILITY_TOOL_NAME);
  assert.equal(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.adlcObserve, ADLC_OBSERVABILITY_TOOL_NAME);
  assert.equal(
    ADLC_OBSERVABILITY_INVOCATION,
    "/adlc.observe #adlc-observability @implementation-run @canvas @runtime-proof",
  );
  assert.deepEqual(definitions.map((entry) => entry.name), Object.values(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES));
  assert.ok(descriptor);
  assert.equal(descriptor.inputSchema, ADLC_OBSERVATION_INPUT_SCHEMA);
  assert.equal(descriptor.outputSchema, ADLC_OBSERVATION_OUTPUT_SCHEMA);
  assert.deepEqual(descriptor.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  });
  assert.equal(descriptor.securitySchemes[0].type, "noauth");
});

test("request schema fences invocation, revision, digest, views, cursor, and page bounds", () => {
  const validate = new Ajv2020({ strict: false }).compile(ADLC_OBSERVATION_INPUT_SCHEMA);
  assert.deepEqual(ADLC_OBSERVATION_VIEWS, [
    "overview", "plan", "execution", "evidence", "economics", "recovery", "receipts", "full",
  ]);
  assert.equal(validate(request), true, JSON.stringify(validate.errors));
  for (const invalid of [
    {
      ...request,
      invocation: { ...request.invocation, semantic: "#canvas" },
    },
    {
      ...request,
      invocation: {
        ...request.invocation,
        bindings: ["@canvas", "@implementation-run", "@runtime-proof"],
      },
    },
    { ...request, expectedRevision: 0 },
    { ...request, expectedLedgerDigest: sha },
    { ...request, view: "delivery" },
    { ...request, cursor: "not+a+base64url" },
    { ...request, limit: 201 },
    { ...request, unknown: true },
  ]) {
    assert.equal(validate(invalid), false, JSON.stringify(invalid));
  }
});

test("output schema accepts closed typed success and failure envelopes", () => {
  const validate = new Ajv2020({ strict: false }).compile(ADLC_OBSERVATION_OUTPUT_SCHEMA);
  assert.equal(validate(success), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...success, unexpected: true }), false);
  const { verified: _verified, ...statusWithoutVerified } = success.status;
  assert.equal(validate({ ...success, status: statusWithoutVerified }), false);
  assert.equal(validate({
    schema: ADLC_OBSERVATION_SCHEMA,
    ok: false,
    economics,
    error: {
      code: "ledger_digest_mismatch",
      message: "The canonical ledger digest changed.",
      retryable: true,
    },
  }), true, JSON.stringify(validate.errors));
  assert.equal(validate({
    schema: ADLC_OBSERVATION_SCHEMA,
    ok: false,
    economics,
    error: { code: "untyped_failure", message: "No.", retryable: false },
  }), false);
  assert.deepEqual(ADLC_OBSERVATION_FAILURE_CODES, [
    "run_not_found",
    "revision_conflict",
    "canonical_ledger_unavailable",
    "ledger_digest_mismatch",
    "ledger_schema_invalid",
    "ledger_conformance_failed",
    "adlc_evaluator_unavailable",
    "stale_cursor",
    "unsupported_view",
    "projection_too_large",
    "acos_revision_mismatch",
    "invalid_request",
    "internal_error",
  ]);
});

test("economics and action authority stay closed while deployment evidence remains observable", () => {
  const validate = new Ajv2020({ strict: false }).compile(ADLC_OBSERVATION_OUTPUT_SCHEMA);
  assert.equal(validate({
    ...success,
    economics: { ...economics, modelCalls: 1 },
  }), false);
  assert.equal(validate({
    ...success,
    status: { ...success.status, deployed: true },
  }), true);
  assert.equal(validate({
    ...success,
    economics: { ...economics, promptTokens: 1 },
  }), false);
  assert.equal(validate({
    ...success,
    projection: {
      ...success.projection,
      graphData: {
        ...success.projection.graphData,
        nodes: [{
          ...success.projection.graphData.nodes[0],
          type: "stub",
        }],
      },
    },
  }), false);
  assert.equal(validate({
    ...success,
    cache: { ...success.cache, path: "/tmp/cache" },
  }), false);
});
