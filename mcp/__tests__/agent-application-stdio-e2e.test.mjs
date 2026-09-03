import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Ajv2020 from "ajv/dist/2020.js";

import {
  APPLICATION_INVOCATION,
  APPLICATION_MANIFEST_SCHEMA_ID,
  digestApplicationManifestSource,
} from "../../contracts/agent-application.schema.js";
import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const toolNames = [
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationCatalog,
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationPlan,
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute,
];
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const EXECUTE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

const componentRevision = (catalog, id) => {
  const component = catalog.components.find((entry) => entry.id === id);
  assert.ok(component, `catalog omitted ${id}`);
  return { id: component.id, revision: component.revision };
};

test("canonical stdio MCP catalogs, plans, and executes an offline agent application", async () => {
  const client = new Client({ name: "agent-application-stdio-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      AGENTIC_OS_ROOT: repoRoot,
      AGENTIC_OS_EXTERNAL_MCP_PROFILES_JSON: "",
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });

  try {
    await client.connect(transport, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const listed = await client.listTools(undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const applicationTools = listed.tools.filter((tool) => tool.name.startsWith("agentic-graph.application."));
    assert.deepEqual(applicationTools.map((tool) => tool.name), toolNames, stderr);
    assert.deepEqual(applicationTools[0].annotations, READ_ONLY);
    assert.deepEqual(applicationTools[1].annotations, READ_ONLY);
    assert.deepEqual(applicationTools[2].annotations, EXECUTE);
    assert.equal(applicationTools.every((tool) => tool.inputSchema.additionalProperties === false), true);
    const ajv = new Ajv2020({ strict: false });
    const outputValidators = new Map(applicationTools.map((tool) => [tool.name, ajv.compile(tool.outputSchema)]));
    const assertAdvertisedOutput = (toolName, payload) => {
      const validator = outputValidators.get(toolName);
      assert.equal(validator(payload), true, ajv.errorsText(validator.errors));
    };

    const catalogResult = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationCatalog,
      arguments: {},
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(catalogResult.isError, false, stderr);
    const catalog = catalogResult.structuredContent;
    assert.equal(catalog.ok, true);
    assertAdvertisedOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationCatalog, catalog);
    assert.deepEqual(catalog.integrations, [], "sanitized stdio environment must expose no external integration");
    assert.match(catalog.catalogDigest, /^[0-9a-f]{64}$/);
    assert.match(catalog.adapterPolicyDigest, /^[0-9a-f]{64}$/);

    const manifest = {
      schemaVersion: APPLICATION_MANIFEST_SCHEMA_ID,
      invocation: structuredClone(APPLICATION_INVOCATION),
      application: { id: "stdio-offline-agent", revision: "1.0.0" },
      source: { uri: "workspace:/stdio-offline-agent.json", sha256: "0".repeat(64) },
      runtimeProof: { catalogDigest: catalog.catalogDigest, adapterPolicyDigest: catalog.adapterPolicyDigest },
      nodes: [
        { id: "input", component: componentRevision(catalog, "core.input"), config: { value: { kind: "text", value: "Plan an SME review without a provider call." } } },
        { id: "agent", component: componentRevision(catalog, "agent.registered"), config: { agentDefinitionId: "agent.sme-care" } },
        { id: "output", component: componentRevision(catalog, "core.output"), config: {} },
      ],
      edges: [
        { from: { node: "input", port: "value" }, to: { node: "agent", port: "prompt" } },
        { from: { node: "agent", port: "plan" }, to: { node: "output", port: "value" } },
      ],
      entrypoints: [{ node: "input", port: "value" }],
      outputs: [{ name: "result", node: "output", port: "result" }],
      bounds: { maxSteps: 3, maxRuntimeMs: 5_000, maxOutputBytes: 1_048_576 },
    };
    manifest.source.sha256 = digestApplicationManifestSource(manifest);

    const planResult = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationPlan,
      arguments: { manifest, mode: "dry-run" },
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(planResult.isError, false, stderr);
    const planned = planResult.structuredContent;
    assert.equal(planned.ok, true, JSON.stringify(planned));
    assertAdvertisedOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationPlan, planned);
    assert.equal(planned.plan.mode, "dry-run");
    assert.deepEqual(planned.plan.executionOrder, ["input", "agent", "output"]);
    assert.equal(planned.plan.nodes.every((node) => node.sideEffect === "none"), true);

    const executeArgs = {
      manifest,
      expectedPlanDigest: planned.plan.planDigest,
      idempotencyKey: "stdio-offline-agent-0001",
      mode: "dry-run",
    };
    const executeResult = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute,
      arguments: executeArgs,
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(executeResult.isError, false, stderr);
    const executed = executeResult.structuredContent;
    assert.equal(executed.ok, true, JSON.stringify(executed));
    assertAdvertisedOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute, executed);
    assert.equal(executed.status, "completed");
    assert.equal(executed.outputs.result.kind, "agent-plan");
    assert.equal(executed.outputs.result.value.status, "planned");
    assert.equal(executed.outputs.result.value.budgetMeters.paidProviderCalls, 0);
    assert.equal(executed.steps.find((step) => step.nodeId === "agent").evidence.paidProviderCalls, 0);
    assert.equal(executed.steps.some((step) => step.ownerId === "agentic-graph.external-tool-gateway"), false);

    const replay = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute,
      arguments: executeArgs,
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(replay.isError, false, stderr);
    assertAdvertisedOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute, replay.structuredContent);
    assert.equal(replay.structuredContent.cached, true);
    assert.equal(replay.structuredContent.executionDigest, executed.executionDigest);
  } finally {
    await client.close().catch(() => undefined);
  }
});

test("malformed host integration configuration returns a typed schema-valid private startup failure", async () => {
  const privateSentinel = "private-startup-sentinel-must-not-leak";
  const client = new Client({ name: "agent-application-invalid-host-config", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      AGENTIC_OS_ROOT: repoRoot,
      AGENTIC_OS_EXTERNAL_MCP_PROFILES_JSON: JSON.stringify({ profiles: [{ [privateSentinel]: true }] }),
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });

  try {
    await client.connect(transport, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const listed = await client.listTools(undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const descriptor = listed.tools.find((tool) => tool.name === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationCatalog);
    assert.ok(descriptor);
    const validateOutput = new Ajv2020({ strict: false }).compile(descriptor.outputSchema);
    const result = await client.callTool({ name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationCatalog, arguments: {} }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent, {
      ok: false,
      error: {
        code: "application_runtime_unavailable",
        message: "Application runtime is unavailable because host-owned configuration did not pass validation.",
      },
    });
    assert.equal(validateOutput(result.structuredContent), true, new Ajv2020().errorsText(validateOutput.errors));
    assert.equal(JSON.stringify(result).includes(privateSentinel), false);
    assert.equal(stderr.includes(privateSentinel), false);
  } finally {
    await client.close().catch(() => undefined);
  }
});
