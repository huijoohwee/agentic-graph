import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Ajv2020 from "ajv/dist/2020.js";

import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";
import {
  SKILL_EVOLUTION_INVOCATION,
  SKILL_EVOLUTION_REQUEST_SCHEMA,
  SKILL_EVOLUTION_RESULT_SCHEMA,
} from "../skill-evolution-tool-contract.js";
import { createSkillEvolutionFileStore } from "../skill-evolution-file-store.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureBaselineText = "x".repeat(100);
const invocation = () => ({
  command: SKILL_EVOLUTION_INVOCATION.command,
  semantics: [...SKILL_EVOLUTION_INVOCATION.semantics],
  bindings: [...SKILL_EVOLUTION_INVOCATION.bindings],
});
const planRequest = () => ({
  schema: SKILL_EVOLUTION_REQUEST_SCHEMA,
  operation: "plan",
  invocation: invocation(),
  sourceRevision: "a".repeat(40),
  baseline: { skillId: "stdio-skill", revision: "v1", digest: createHash("sha256").update(fixtureBaselineText).digest("hex"), artifactRef: "skill://stdio/v1", normalizedChars: 100 },
  executor: { id: "executor.local", revision: "v1", digest: "c".repeat(64) },
  candidateAdapter: { id: "candidate.local", revision: "v1", digest: "d".repeat(64) },
  dataset: {
    training: [{ id: "train", digest: "1".repeat(64), ref: "dataset://train" }],
    validation: [{ id: "validate", digest: "2".repeat(64), ref: "dataset://validate" }],
  },
  evaluator: { id: "evaluator.local", revision: "v1", digest: "e".repeat(64), metric: { id: "quality", direction: "maximize", threshold: 0.5 } },
  schedule: { epochs: 1, batchSize: 1, miniBatchSize: 1, learningRate: { initial: 0.1, decay: 1, floor: 0 }, seed: "stdio" },
  validation: { minDelta: 0, patience: 1, requiredGates: ["schema.valid"] },
  bounds: { maxCandidates: 1, maxAdapterCalls: 5, maxMutationOperations: 1, maxChangedChars: 10, maxTokens: 100, maxCostUsd: 1, maxDurationMs: 10000 },
  idempotencyKey: "stdio-plan",
});

test("canonical stdio MCP advertises and dispatches the source-fenced Skill Evolution tool", async (t) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), "skill-evolution-stdio-unconfigured-"));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const client = new Client({ name: "skill-evolution-stdio-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: { PATH: String(process.env.PATH || ""), HOME: String(process.env.HOME || ""), NODE_ENV: "test", KNOWGRPH_ROOT: repoRoot, KNOWGRPH_SKILL_EVOLUTION_STATE_DIR: stateDirectory },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await client.connect(transport, { timeout: 10000, maxTotalTimeout: 10000 });
    const listed = await client.listTools(undefined, { timeout: 10000, maxTotalTimeout: 10000 });
    const descriptors = listed.tools.filter((tool) => tool.name === "knowgrph.skill.evolve");
    assert.equal(descriptors.length, 1, stderr);
    assert.equal(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.skillEvolve, "knowgrph.skill.evolve");
    assert.deepEqual(descriptors[0].annotations, { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    const ajv = new Ajv2020({ strict: false });
    const validateInput = ajv.compile(descriptors[0].inputSchema);
    const validateOutput = ajv.compile(descriptors[0].outputSchema);
    const request = planRequest();
    assert.equal(validateInput(request), true, ajv.errorsText(validateInput.errors));

    const planned = await client.callTool({ name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.skillEvolve, arguments: request }, undefined, { timeout: 10000, maxTotalTimeout: 10000 });
    assert.notEqual(planned.isError, true);
    assert.equal(validateOutput(planned.structuredContent), true, ajv.errorsText(validateOutput.errors));
    assert.equal(planned.structuredContent.status, "planned");
    assert.deepEqual(await readdir(stateDirectory), [], "plan must not initialize durable state");

    const unavailable = await client.callTool({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.skillEvolve,
      arguments: { ...request, operation: "start", idempotencyKey: "stdio-unconfigured-start" },
    }, undefined, { timeout: 10000, maxTotalTimeout: 10000 });
    assert.equal(unavailable.isError, true);
    assert.equal(validateOutput(unavailable.structuredContent), true, ajv.errorsText(validateOutput.errors));
    assert.equal(unavailable.structuredContent.schema, SKILL_EVOLUTION_RESULT_SCHEMA);
    assert.equal(unavailable.structuredContent.errors[0].code, "adapter_unavailable");
    assert.equal(unavailable.structuredContent.modelWeightsMutated, false);

    const missing = await client.callTool({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.skillEvolve,
      arguments: { schema: SKILL_EVOLUTION_REQUEST_SCHEMA, operation: "status", invocation: invocation(), runId: "se_missing" },
    }, undefined, { timeout: 10000, maxTotalTimeout: 10000 });
    assert.equal(missing.isError, true);
    assert.equal(validateOutput(missing.structuredContent), true, ajv.errorsText(validateOutput.errors));
    assert.equal(missing.structuredContent.errors[0].code, "not_found");
    assert.deepEqual(missing.structuredContent.invocation, invocation());
  } finally {
    await client.close().catch(() => undefined);
  }
});

test("SHA-pinned host adapter completes a durable review-only run through canonical stdio MCP", async (t) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), "skill-evolution-stdio-configured-"));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const adapterPath = path.join(repoRoot, "mcp", "__tests__", "fixtures", "skill-evolution-adapter.mjs");
  const adapterDigest = createHash("sha256").update(await readFile(adapterPath)).digest("hex");
  const client = new Client({ name: "skill-evolution-configured-stdio-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      KNOWGRPH_ROOT: repoRoot,
      KNOWGRPH_SKILL_EVOLUTION_ADAPTER_MODULE: path.relative(repoRoot, adapterPath),
      KNOWGRPH_SKILL_EVOLUTION_ADAPTER_SHA256: adapterDigest,
      KNOWGRPH_SKILL_EVOLUTION_STATE_DIR: stateDirectory,
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });
  let completedRunId;
  try {
    await client.connect(transport, { timeout: 10000, maxTotalTimeout: 10000 });
    const descriptor = (await client.listTools()).tools.find((tool) => tool.name === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.skillEvolve);
    assert.ok(descriptor, stderr);
    const ajv = new Ajv2020({ strict: false });
    const validateOutput = ajv.compile(descriptor.outputSchema);
    const start = { ...planRequest(), operation: "start", idempotencyKey: "stdio-start" };
    const started = (await client.callTool({ name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.skillEvolve, arguments: start })).structuredContent;
    assert.equal(started.status, "ready", JSON.stringify(started));
    assert.equal(started.revision, 1);
    assert.equal(validateOutput(started), true, ajv.errorsText(validateOutput.errors));

    const step = (revision, idempotencyKey) => ({
      schema: SKILL_EVOLUTION_REQUEST_SCHEMA,
      operation: "step",
      invocation: invocation(),
      runId: started.runId,
      expectedRevision: revision,
      idempotencyKey,
    });
    const candidate = (await client.callTool({ name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.skillEvolve, arguments: step(1, "stdio-step-1") })).structuredContent;
    assert.equal(candidate.status, "running");
    assert.equal(candidate.revision, 2);
    const completed = (await client.callTool({ name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.skillEvolve, arguments: step(2, "stdio-step-2") })).structuredContent;
    assert.equal(completed.status, "review_pending", JSON.stringify(completed));
    assert.equal(completed.revision, 3);
    assert.equal(completed.proposal.digest, completed.champion.digest);
    completedRunId = completed.runId;
    assert.equal(completed.cost.byPhase.training.adapterCalls, 2);
    assert.equal(completed.cost.byPhase.validation.adapterCalls, 3);
    assert.deepEqual({ applied: completed.applied, weights: completed.modelWeightsMutated, deployed: completed.deploymentAttempted }, { applied: false, weights: false, deployed: false });
    assert.equal(validateOutput(completed), true, ajv.errorsText(validateOutput.errors));
  } finally {
    await client.close().catch(() => undefined);
  }
  const restartedStore = createSkillEvolutionFileStore({ directory: stateDirectory });
  const persisted = await restartedStore.get(completedRunId);
  assert.equal(persisted.revision, 3);
  assert.equal(persisted.status, "review_pending");
});
