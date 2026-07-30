import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

import {
  KNOWGRPH_LOCAL_MCP_TOOL_NAMES,
  buildKnowgrphLocalMcpToolDefinitions,
} from "../local-tool-contract.js";
import {
  AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID,
  KNOWLEDGE_GRAPH_INVOCATION_SCHEMA_ID,
} from "../knowledge-graph-tool-contract.js";

const expected = [
  KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
  KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery,
  KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphExplainEdge,
];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const invocationProof = (tool, overrides = {}) => ({
  schema: KNOWLEDGE_GRAPH_INVOCATION_SCHEMA_ID,
  tool,
  action: "/Future.graph.Route-v2",
  semantics: ["#Future-Graph", "#deterministic-runtime"],
  bindings: ["@Future-Corpus", "@runtime-proof-v2"],
  sourceRevision: "1".repeat(40),
  catalogDigest: "2".repeat(64),
  routingSchema: AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID,
  routingDigest: "3".repeat(64),
  ...overrides,
});

test("local MCP exposes one deterministic knowledge-graph tool family", () => {
  const byName = new Map(buildKnowgrphLocalMcpToolDefinitions().map((tool) => [tool.name, tool]));
  for (const name of expected) assert.ok(byName.has(name), `missing ${name}`);

  const ingest = byName.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest);
  const query = byName.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery);
  const explain = byName.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphExplainEdge);
  assert.equal(ingest.annotations.idempotentHint, true);
  assert.equal(ingest.annotations.destructiveHint, true);
  assert.equal(ingest.annotations.openWorldHint, false);
  assert.equal(query.annotations.readOnlyHint, true);
  assert.equal(explain.annotations.readOnlyHint, true);
  assert.equal(ingest.inputSchema.oneOf.length, 2);
  assert.equal(ingest.inputSchema.properties.maxResolutionRecords.default, 1_000_000);
  assert.equal(ingest.inputSchema.properties.maxResolutionBytes.default, 256_000_000);
  assert.deepEqual(query.inputSchema.required, ["graphId", "expectedSnapshotDigest", "mode"]);
  assert.deepEqual(explain.inputSchema.required, ["graphId", "expectedSnapshotDigest", "edgeId"]);
  assert.equal(query.inputSchema.properties.maxDurationMs.default, 300000);
  assert.equal(explain.inputSchema.properties.maxDurationMs.default, 300000);
});

test("tool descriptions and invocation proof schemas keep aliases source-backed and zero-vector", () => {
  const definitions = buildKnowgrphLocalMcpToolDefinitions()
    .filter((tool) => expected.includes(tool.name));
  const contractText = JSON.stringify(definitions);
  assert.match(contractText, /no vector store/i);
  assert.match(contractText, /no network access/i);
  assert.doesNotMatch(contractText, /\/knowledge\.graph\./);
  assert.equal(KNOWLEDGE_GRAPH_INVOCATION_SCHEMA_ID, "knowgrph-knowledge-graph-invocation/v1");
  assert.equal(AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID, "agentic-canvas-os-docs-routing/v1");
  for (const definition of definitions) {
    const proof = definition.inputSchema.properties.invocation;
    assert.equal(proof.properties.tool.const, definition.name);
    assert.deepEqual(proof.required, [
      "schema",
      "tool",
      "action",
      "semantics",
      "bindings",
      "sourceRevision",
      "catalogDigest",
      "routingSchema",
      "routingDigest",
    ]);
  }
});

test("schemas require digest fencing, source-backed invocation proofs, and typed error details", () => {
  const ajv = new Ajv({ strict: false });
  const byName = new Map(buildKnowgrphLocalMcpToolDefinitions().map((tool) => [tool.name, tool]));
  const ingest = byName.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest);
  const query = byName.get(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery);
  const validateIngest = ajv.compile(ingest.inputSchema);
  assert.equal(validateIngest({ rootPath: "/workspace" }), true, JSON.stringify(validateIngest.errors));
  assert.equal(validateIngest({ rootPath: "/workspace", maxResolutionRecords: 1, maxResolutionBytes: 1 }), true);
  assert.equal(validateIngest({ rootPath: "/workspace", maxResolutionRecords: 1_000_001 }), false);
  assert.equal(validateIngest({ rootPath: "/workspace", maxResolutionBytes: 256_000_001 }), false);
  assert.equal(validateIngest({ repositoryUrl: "https://github.com/example/project" }), true, JSON.stringify(validateIngest.errors));
  assert.equal(validateIngest({ rootPath: "/workspace", repositoryUrl: "https://github.com/example/project" }), false);
  const validateInput = ajv.compile(query.inputSchema);
  const validInput = {
    graphId: `kg:graph:${"a".repeat(32)}`,
    expectedSnapshotDigest: "a".repeat(64),
    mode: "summary",
    invocation: invocationProof(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery),
  };
  assert.equal(validateInput(validInput), true, JSON.stringify(validateInput.errors));
  assert.equal(validateInput({ ...validInput, maxDurationMs: 100 }), true);
  assert.equal(validateInput({ ...validInput, maxDurationMs: 99 }), false);
  assert.equal(validateInput({ ...validInput, expectedSnapshotDigest: undefined }), false);
  assert.equal(validateInput({
    ...validInput,
    invocation: { ...validInput.invocation, tool: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest },
  }), false);
  assert.equal(validateInput({
    ...validInput,
    invocation: { ...validInput.invocation, semantics: ["future-graph"] },
  }), false);
  assert.equal(validateInput({
    ...validInput,
    invocation: { ...validInput.invocation, routingDigest: "not-a-digest" },
  }), false);

  const validateOutput = ajv.compile(query.outputSchema);
  assert.equal(validateOutput({
    schema: "knowgrph-knowledge-graph-query/v1",
    ok: false,
    operation: "query",
    error: { code: "artifact_invalid", message: "invalid", details: { errors: ["digest mismatch"] } },
  }), true, JSON.stringify(validateOutput.errors));
});

test("package manifests contain no vector-store runtime dependency", () => {
  const manifests = ["package.json", "mcp/package.json", "package-lock.json"]
    .map((file) => JSON.parse(readFileSync(path.join(repoRoot, file), "utf8")));
  const names = new Set();
  for (const manifest of manifests) {
    for (const record of [manifest, ...Object.values(manifest.packages || {})]) {
      for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
        for (const name of Object.keys(record?.[field] || {})) names.add(name);
      }
    }
  }
  const forbidden = /(?:chromadb|pinecone|weaviate|qdrant|milvus|lancedb|pgvector|faiss)/i;
  assert.deepEqual([...names].filter((name) => forbidden.test(name)), []);
});
