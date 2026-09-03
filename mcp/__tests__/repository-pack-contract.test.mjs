import assert from "node:assert/strict";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  REPOSITORY_PACK_DEFAULT_REQUEST,
  REPOSITORY_PACK_HARD_BOUNDS,
  REPOSITORY_PACK_INPUT_SCHEMA,
  REPOSITORY_PACK_INVOCATION,
  REPOSITORY_PACK_OUTPUT_SCHEMA,
  REPOSITORY_PACK_SCHEMA_VERSION,
  REPOSITORY_PACK_TOOL_NAME,
} from "../repository-pack-contract.js";
import {
  buildAgenticGraphLocalMcpToolDefinitions,
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES,
} from "../local-tool-contract.js";

test("repository pack descriptor matches the canonical seven-field ACOS request", () => {
  const definitions = buildAgenticGraphLocalMcpToolDefinitions();
  const descriptor = definitions.find((entry) => entry.name === REPOSITORY_PACK_TOOL_NAME);
  assert.deepEqual(definitions.map((entry) => entry.name), Object.values(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES));
  assert.equal(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.repositoryPack, "agentic-graph.repository.pack");
  assert.equal(REPOSITORY_PACK_INVOCATION, "/repository.pack #repository-packing @repository-root @runtime-proof");
  assert.deepEqual(Object.keys(REPOSITORY_PACK_INPUT_SCHEMA.properties), [
    "repositoryPath",
    "outputDirectory",
    "includePaths",
    "excludePaths",
    "maxFiles",
    "maxFileBytes",
    "maxTotalBytes",
  ]);
  assert.deepEqual(REPOSITORY_PACK_DEFAULT_REQUEST, {
    repositoryPath: ".",
    outputDirectory: "data/outputs/repository-packs",
    includePaths: [],
    excludePaths: [],
    maxFiles: 12_000,
    maxFileBytes: 2_097_152,
    maxTotalBytes: 134_217_728,
  });
  assert.deepEqual(REPOSITORY_PACK_HARD_BOUNDS, {
    maxFiles: 20_000,
    maxFileBytes: 8_388_608,
    maxTotalBytes: 268_435_456,
    maxPolicyPaths: 256,
    maxPathBytes: 1_024,
    defaultMaxOutputBytes: 268_435_456,
    hardMaxOutputBytes: 536_870_912,
    defaultRuntimeMs: 60_000,
    hardRuntimeMs: 120_000,
    maxResponseBytes: 65_536,
  });
  assert.ok(descriptor);
  assert.equal(descriptor.inputSchema, REPOSITORY_PACK_INPUT_SCHEMA);
  assert.equal(descriptor.outputSchema, REPOSITORY_PACK_OUTPUT_SCHEMA);
  assert.equal(descriptor.inputSchema.additionalProperties, false);
  assert.equal(descriptor.outputSchema.additionalProperties, false);
  assert.deepEqual(descriptor.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  });
  assert.equal(descriptor.securitySchemes[0].type, "noauth");
});

test("repository pack result is a closed metadata-only zero-use contract", () => {
  assert.equal(REPOSITORY_PACK_SCHEMA_VERSION, "agentic-graph-repository-pack-result/v1");
  assert.deepEqual(Object.keys(REPOSITORY_PACK_OUTPUT_SCHEMA.properties), [
    "schemaVersion",
    "ok",
    "status",
    "tool",
    "invocation",
    "artifactPath",
    "artifactSha256",
    "sourceSetSha256",
    "gitRevision",
    "counts",
    "bounds",
    "omissions",
    "reused",
    "networkCalls",
    "modelCalls",
    "inputTokens",
    "outputTokens",
    "costUsd",
    "error",
  ]);
  for (const key of ["networkCalls", "modelCalls", "inputTokens", "outputTokens", "costUsd"]) {
    assert.equal(REPOSITORY_PACK_OUTPUT_SCHEMA.properties[key].const, 0);
  }
  assert.equal("content" in REPOSITORY_PACK_OUTPUT_SCHEMA.properties, false);
  assert.doesNotThrow(() => new Ajv2020({ strict: false }).compile(REPOSITORY_PACK_OUTPUT_SCHEMA));
});

test("repository pack schema accepts bounded policy input and rejects legacy or host-only fields", () => {
  const ajv = new Ajv2020({ strict: false });
  const validate = ajv.compile(REPOSITORY_PACK_INPUT_SCHEMA);
  assert.equal(validate({
    repositoryPath: ".",
    outputDirectory: "artifacts/packs",
    includePaths: ["src", "README.md"],
    excludePaths: ["src/generated"],
    maxFiles: 20_000,
    maxFileBytes: 8_388_608,
    maxTotalBytes: 268_435_456,
  }), true, ajv.errorsText(validate.errors));
  for (const invalid of [
    { includeUntracked: false },
    { maxRuntimeMs: 1000 },
    { maxOutputBytes: 1000 },
    { maxFiles: 20_001 },
  ]) {
    assert.equal(validate(invalid), false, JSON.stringify(invalid));
  }
});
