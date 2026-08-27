// Unit tests for the knowgrph control-plane McpAgent tool registry
// (knowgrph-acos-mcp-connector spec, task 1.1).
//
// These tests validate the structural guarantees needed for tasks beyond
// task 1.1 to build on:
//
//   - Property 26 / R14.4: every listed tool exposes both its inputSchema
//     and its outputSchema.
//   - Property 1 / R14.6 (narrow boundary slice): a remote invocation of an
//     approval-gated stage tool before approval returns "approval_required",
//     leaves Run_Manifest state unchanged, and records zero paid-provider
//     calls.
//
// Full property-based coverage of Properties 1 and 26 lives in spec task 9.1
// (fast-check). These tests are example-based smoke checks for task 1.1.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_MODEL_RUNTIME_SCHEMA,
  createRunningAgentAdapterRegistry,
} from "../../../../contracts/agent-model-runtime.js";

import {
  buildKnowgrphMcpToolDefinitions,
  collectApprovedGateIds,
  executeKnowgrphMcpTool,
  executeKnowgrphMcpToolAsync,
  AGENT_RUNTIME_TOOL_NAME,
  AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
  KNOWGRPH_MCP_DIRECTOR_TOOL_NAME,
  KNOWGRPH_MCP_STAGE_GATES,
  KNOWGRPH_MCP_STAGE_TOOL_NAMES,
  KNOWGRPH_OS_STATUS_TOOL_NAME,
  RUN_NOTE_TOOL_NAME,
} from "../tool-registry.mjs";

test("tool surface lists the agent runtime, Director, stage tools, run note, OS status, and docs", () => {
  const definitions = buildKnowgrphMcpToolDefinitions();
  const names = definitions.map((tool) => tool.name);
  assert.ok(names.includes(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME));
  assert.ok(names.includes(AGENT_RUNTIME_TOOL_NAME));
  for (const stageName of Object.values(KNOWGRPH_MCP_STAGE_TOOL_NAMES)) {
    assert.ok(names.includes(stageName), `missing stage tool: ${stageName}`);
  }
  assert.ok(names.includes(KNOWGRPH_OS_STATUS_TOOL_NAME));
  assert.ok(names.includes(RUN_NOTE_TOOL_NAME));
  assert.ok(names.includes(AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME));
  assert.equal(definitions.length, 10);
});

test("Property 26 / R14.4: every listed tool exposes a non-empty input schema AND output schema", () => {
  const definitions = buildKnowgrphMcpToolDefinitions();

  // The listing surface must cover the Director plus all five stage tools.
  const expectedNames = [
    KNOWGRPH_MCP_DIRECTOR_TOOL_NAME,
    AGENT_RUNTIME_TOOL_NAME,
    ...Object.values(KNOWGRPH_MCP_STAGE_TOOL_NAMES),
    RUN_NOTE_TOOL_NAME,
    KNOWGRPH_OS_STATUS_TOOL_NAME,
    AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
  ];
  const listedNames = definitions.map((tool) => tool.name);
  for (const expected of expectedNames) {
    assert.ok(
      listedNames.includes(expected),
      `tool surface is missing ${expected}`,
    );
  }

  const hasNonEmptyProperties = (schema, label) => {
    assert.ok(schema, `${label} is missing`);
    assert.equal(schema.type, "object", `${label} must be an object schema`);
    assert.equal(
      typeof schema.properties,
      "object",
      `${label} must declare properties`,
    );
    assert.ok(
      Object.keys(schema.properties).length > 0,
      `${label} must be non-empty`,
    );
  };

  for (const tool of definitions) {
    assert.equal(typeof tool.name, "string");
    // R14.4: each listed tool includes its input schema AND its output schema.
    hasNonEmptyProperties(tool.inputSchema, `${tool.name} inputSchema`);
    hasNonEmptyProperties(tool.outputSchema, `${tool.name} outputSchema`);
  }
});

test("generic agent runtime compiles each registered invocation through one zero-spend tool", () => {
  for (const invocation of ["/investment-research-agent", "/sme-care-agent", "/video-agent"]) {
    const result = executeKnowgrphMcpTool(AGENT_RUNTIME_TOOL_NAME, {
      invocation,
      brief: "Compile a deterministic dry-run plan.",
      mode: "dry-run",
      runId: `proof-${invocation.slice(1)}`,
    });
    assert.equal(result.ok, true);
    assert.equal(result.structuredContent.status, "planned");
    assert.equal(result.structuredContent.budgetMeters.paidProviderCalls, 0);
  }
});

test("approved SME Care execution prepares a model packet and dispatches through its exact registered adapter", async () => {
  let adapterCalls = 0;
  const result = await executeKnowgrphMcpToolAsync(
    AGENT_RUNTIME_TOOL_NAME,
    {
      invocation: "/sme-care-agent",
      brief: "Assess the protection gap.",
      mode: "live",
      runId: "registered-adapter-proof",
      approvals: ["paid-model-call"],
    },
    {
      agentModelResolver: async () => ({
        status: "ready",
        packet: {
          schemaVersion: AGENT_MODEL_RUNTIME_SCHEMA,
          provider: { id: "cloudflare-workers-ai", revision: "test/v1", adapterId: "cloudflare-workers-ai" },
          model: { id: "operator-selected-model", features: ["text"] },
          transport: { id: "test-binding", delivery: "complete", connection: "per-run" },
        },
      }),
      runningAgentAdapters: createRunningAgentAdapterRegistry([
        {
          id: "cloudflare-workers-ai",
          execute: async ({ preparedAgent }) => {
            adapterCalls += 1;
            assert.equal(preparedAgent.id, "agent.sme-care");
            assert.equal(preparedAgent.modelRuntime.model.id, "operator-selected-model");
            return { text: "review-ready result" };
          },
        },
      ]),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.structuredContent.status, "completed");
  assert.equal(result.structuredContent.result.text, "review-ready result");
  assert.equal(adapterCalls, 1);
});

test("collectApprovedGateIds normalizes string and object entries", () => {
  const approved = collectApprovedGateIds([
    "paid-model-call",
    { gateId: "render-action", token: "tok-render", approvalState: "approved" },
    { gateId: "payment-action", approvalState: "rejected", token: "tok-payment" },
    { gateId: "cloud-deploy" },
    "  ",
    null,
  ]);
  assert.deepEqual(
    [...approved].sort(),
    ["cloud-deploy", "paid-model-call", "render-action"].sort(),
  );
});

for (const [stageName, gateId] of Object.entries(KNOWGRPH_MCP_STAGE_GATES)) {
  test(`Property 1: ${stageName} pre-approval invocation returns approval_required and records 0 paid calls`, () => {
    const result = executeKnowgrphMcpTool(stageName, { approvals: [] });
    assert.equal(result.ok, false);
    const envelope = result.structuredContent;
    assert.ok(envelope, "structuredContent must be present");
    assert.equal(envelope.status, "approval_required");
    assert.equal(envelope.gateId, gateId);
    assert.equal(envelope.paidProviderCalls, 0);
    assert.equal(envelope.runManifestStateChanged, false);
    assert.equal(envelope.error?.code, "approval_required");
  });
}

test("Property 1 boundary: an approved stage call passes the McpAgent boundary without a paid call", () => {
  const result = executeKnowgrphMcpTool(
    KNOWGRPH_MCP_STAGE_TOOL_NAMES.research,
    { approvals: ["paid-model-call"], referenceUrl: "https://example.com/clip" },
  );
  assert.equal(result.ok, true);
  assert.equal(result.structuredContent?.status, "deferred_to_director");
  assert.equal(result.structuredContent?.paidProviderCalls, 0);
  assert.equal(result.structuredContent?.runManifestStateChanged, false);
});

test("Director tool runs the existing video-remix runtime end-to-end (dry-run)", () => {
  const result = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, {
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Remix the reference clip with three shots highlighting the hero.",
    mode: "dry-run",
    shotCount: 3,
  });
  assert.equal(result.ok, true);
  const payload = result.structuredContent;
  assert.equal(payload.mode, "dry-run");
  assert.ok(Array.isArray(payload.approvalGates));
  assert.ok(payload.approvalGates.length >= 5);
  assert.equal(payload.budgetMeters.estimatedCostUsd, 0);
});

test("OS status tool is cataloged remotely and returns zero-cost read views", () => {
  const result = executeKnowgrphMcpTool(KNOWGRPH_OS_STATUS_TOOL_NAME, { view: "process_list" });

  assert.equal(result.ok, true);
  assert.equal(result.structuredContent?.ok, true);
  assert.ok(Array.isArray(result.structuredContent?.unavailableSources));
  assert.equal(result.structuredContent?.cost_log?.estimated_cost_usd, 0);
  assert.equal(result.structuredContent?.cost_log?.model, "none");
});

test("OS status Cloudflare capabilities view self-lists the OS tool", () => {
  const result = executeKnowgrphMcpTool(KNOWGRPH_OS_STATUS_TOOL_NAME, { view: "capabilities" });
  const ids = new Set(result.structuredContent?.entries?.map((entry) => entry.toolId));

  assert.equal(result.ok, true);
  assert.ok(ids.has(KNOWGRPH_OS_STATUS_TOOL_NAME));
});

test("Agentic Canvas OS docs invocation is cataloged remotely as read-only", () => {
  const definitions = buildKnowgrphMcpToolDefinitions();
  const descriptor = definitions.find((tool) => tool.name === AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME);

  assert.ok(descriptor, "docs invocation descriptor must exist");
  assert.equal(descriptor.annotations.readOnlyHint, true);
  assert.equal(descriptor.inputSchema.properties.token.type, "string");
});

test("Agentic Canvas OS docs invocation resolves prefixed tokens remotely", async () => {
  const sourceRevision = "a".repeat(40);
  const requestedUrls = [];
  const dictionaryCommand = [
    "---",
    "dictionary_entries:",
    "  - /query",
    "---",
    "",
    "| Token | Purpose |",
    "| --- | --- |",
    "| `/query` | Resolve one query through the docs invocation boundary. |",
  ].join("\n");
  const fetchImpl = async (input) => {
    const requestUrl = String(input);
    requestedUrls.push(requestUrl);
    if (requestUrl === "https://api.github.com/repos/huijoohwee/agentic-canvas-os/commits/main") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ sha: sourceRevision }),
      };
    }
    if (requestUrl.startsWith("https://api.github.com/repos/huijoohwee/agentic-canvas-os/commits?")) {
      return {
        ok: true,
        status: 200,
        json: async () => [],
      };
    }
    const rawDocsPrefix = `https://raw.githubusercontent.com/huijoohwee/agentic-canvas-os/${sourceRevision}/docs/`;
    if (requestUrl.startsWith(rawDocsPrefix)) {
      return {
        ok: true,
        status: 200,
        text: async () => requestUrl.endsWith("/DICTIONARY-COMMAND.md") ? dictionaryCommand : "",
      };
    }
    throw new Error(`Unexpected Agentic Canvas OS docs request: ${requestUrl}`);
  };
  const result = await executeKnowgrphMcpToolAsync(
    AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
    { token: "/query" },
    { fetchImpl },
  );

  assert.equal(result.ok, true);
  assert.equal(result.structuredContent?.sourceRevision, sourceRevision);
  assert.equal(result.structuredContent?.invocation?.token, "/query");
  assert.equal(result.structuredContent?.invocation?.sourcePath, "DICTIONARY-COMMAND.md#/query");
  assert.equal(requestedUrls[0], "https://api.github.com/repos/huijoohwee/agentic-canvas-os/commits/main");
  assert.equal(requestedUrls.length, 8);
  assert.ok(requestedUrls.includes(
    `https://raw.githubusercontent.com/huijoohwee/agentic-canvas-os/${sourceRevision}/docs/DICTIONARY-COMMAND.md`,
  ));
  assert.ok(requestedUrls.includes(
    `https://api.github.com/repos/huijoohwee/agentic-canvas-os/commits?sha=${sourceRevision}&path=docs/LIVE-AGENT-PROVIDER-PROOF.md&per_page=100`,
  ));
});

test("Director tool: live mode without approvals halts with zero paid calls (Property 2 / R2.3 sanity check)", () => {
  const result = executeKnowgrphMcpTool(KNOWGRPH_MCP_DIRECTOR_TOOL_NAME, {
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Live mode without any approval tokens.",
    mode: "live",
    approvals: [],
  });
  const payload = result.structuredContent;
  assert.equal(payload.state, "blocked");
  assert.equal(payload.budgetMeters.estimatedCostUsd, 0);
  assert.ok(Array.isArray(payload.approvalGates));
  assert.ok(payload.approvalGates.length >= 5);
});

test("unknown tool name yields an unknown_tool envelope", () => {
  const result = executeKnowgrphMcpTool("knowgrph.unknown.tool", {});
  assert.equal(result.ok, false);
  assert.equal(result.structuredContent?.status, "unknown_tool");
});
