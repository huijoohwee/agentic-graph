import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

import {
  AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES,
  buildAgenticGraphLocalMcpToolDefinitions,
} from "../local-tool-contract.js";
import {
  AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID,
  KNOWLEDGE_GRAPH_INVOCATION_SCHEMA_ID,
} from "../knowledge-graph-tool-contract.js";
import {
  KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE,
  KNOWLEDGE_GRAPH_PARSER_REGISTRY_SCHEMA_ID,
} from "../knowledge-graph-parser-contract.js";

const expected = [
  AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphParserGenerate,
  AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
  AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery,
  AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphExplainEdge,
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
  const byName = new Map(buildAgenticGraphLocalMcpToolDefinitions().map((tool) => [tool.name, tool]));
  for (const name of expected) assert.ok(byName.has(name), `missing ${name}`);

  const ingest = byName.get(AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest);
  const parserGenerate = byName.get(AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphParserGenerate);
  const query = byName.get(AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery);
  const explain = byName.get(AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphExplainEdge);
  assert.equal(parserGenerate.annotations.readOnlyHint, true);
  assert.equal(parserGenerate.annotations.destructiveHint, false);
  assert.equal(parserGenerate.inputSchema.oneOf.length, 2);
  assert.equal(
    parserGenerate.inputSchema.properties.profile.const,
    KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE,
  );
  assert.equal(ingest.annotations.idempotentHint, true);
  assert.equal(ingest.annotations.destructiveHint, true);
  assert.equal(ingest.annotations.openWorldHint, false);
  assert.equal(query.annotations.readOnlyHint, true);
  assert.equal(explain.annotations.readOnlyHint, true);
  assert.equal(ingest.inputSchema.oneOf.length, 2);
  assert.equal(ingest.inputSchema.properties.maxResolutionRecords.default, 1_000_000);
  assert.equal(ingest.inputSchema.properties.maxResolutionBytes.default, 256_000_000);
  assert.deepEqual(ingest.inputSchema.dependencies, {
    parserRegistry: ["expectedParserRegistryDigest"],
    expectedParserRegistryDigest: ["parserRegistry"],
  });
  assert.deepEqual(query.inputSchema.required, ["graphId", "expectedSnapshotDigest", "mode"]);
  assert.deepEqual(explain.inputSchema.required, ["graphId", "expectedSnapshotDigest", "edgeId"]);
  assert.equal(query.inputSchema.properties.maxDurationMs.default, 300000);
  assert.equal(explain.inputSchema.properties.maxDurationMs.default, 300000);
});

test("tool descriptions and invocation proof schemas keep aliases source-backed and zero-vector", () => {
  const definitions = buildAgenticGraphLocalMcpToolDefinitions()
    .filter((tool) => expected.includes(tool.name));
  const contractText = JSON.stringify(definitions);
  assert.match(contractText, /no vector store/i);
  assert.match(contractText, /no network access/i);
  assert.doesNotMatch(contractText, /\/knowledge\.graph\./);
  assert.equal(KNOWLEDGE_GRAPH_INVOCATION_SCHEMA_ID, "agenticgraph-knowledge-graph-invocation/v1");
  assert.equal(AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID, "agentic-canvas-os-docs-routing/v1");
  assert.equal(KNOWLEDGE_GRAPH_PARSER_REGISTRY_SCHEMA_ID, "agenticgraph-knowledge-graph-parser-registry/v2");
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
  const byName = new Map(buildAgenticGraphLocalMcpToolDefinitions().map((tool) => [tool.name, tool]));
  const ingest = byName.get(AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest);
  const parserGenerate = byName.get(AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphParserGenerate);
  const query = byName.get(AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery);
  const validateParserGenerate = ajv.compile(parserGenerate.inputSchema);
  const descriptor = {
    id: "custom-json",
    kind: "custom-json",
    adapter: "json-config",
    fidelity: "ast",
    extensions: [".schema.json"],
    basenames: [],
    basenameFamilies: [],
    priority: 1,
  };
  assert.equal(validateParserGenerate({ descriptors: [descriptor] }), true, JSON.stringify(validateParserGenerate.errors));
  assert.equal(
    validateParserGenerate({ profile: KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE }),
    true,
    JSON.stringify(validateParserGenerate.errors),
  );
  assert.equal(validateParserGenerate({ profile: "other-source" }), false);
  assert.equal(validateParserGenerate({
    profile: KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE,
    descriptors: [descriptor],
  }), false);
  assert.equal(validateParserGenerate({
    descriptors: [{ ...descriptor, adapter: "unregistered-adapter" }],
  }), false);
  assert.equal(validateParserGenerate({
    descriptors: [{ ...descriptor, fidelity: "structural-parser" }],
  }), false);
  assert.equal(validateParserGenerate({
    descriptors: [{ ...descriptor, extensions: [], basenames: [], basenameFamilies: [] }],
  }), false);
  const registry = {
    schema: KNOWLEDGE_GRAPH_PARSER_REGISTRY_SCHEMA_ID,
    digest: "b".repeat(64),
    descriptors: [descriptor],
  };
  const validateIngest = ajv.compile(ingest.inputSchema);
  assert.equal(validateIngest({ rootPath: "/workspace" }), true, JSON.stringify(validateIngest.errors));
  assert.equal(validateIngest({ rootPath: "/workspace", maxResolutionRecords: 1, maxResolutionBytes: 1 }), true);
  assert.equal(validateIngest({ rootPath: "/workspace", maxResolutionRecords: 1_000_001 }), false);
  assert.equal(validateIngest({ rootPath: "/workspace", maxResolutionBytes: 256_000_001 }), false);
  assert.equal(validateIngest({ repositoryUrl: "https://code.example/research/project" }), true, JSON.stringify(validateIngest.errors));
  assert.equal(validateIngest({ rootPath: "/workspace", repositoryUrl: "https://code.example/research/project" }), false);
  assert.equal(validateIngest({
    rootPath: "/workspace",
    parserRegistry: registry,
    expectedParserRegistryDigest: registry.digest,
  }), true, JSON.stringify(validateIngest.errors));
  assert.equal(validateIngest({ rootPath: "/workspace", parserRegistry: registry }), false);
  assert.equal(validateIngest({
    rootPath: "/workspace",
    expectedParserRegistryDigest: registry.digest,
  }), false);
  const validateInput = ajv.compile(query.inputSchema);
  const validInput = {
    graphId: `kg:graph:${"a".repeat(32)}`,
    expectedSnapshotDigest: "a".repeat(64),
    mode: "summary",
    invocation: invocationProof(AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery),
  };
  assert.equal(validateInput(validInput), true, JSON.stringify(validateInput.errors));
  assert.equal(validateInput({ ...validInput, maxDurationMs: 100 }), true);
  assert.equal(validateInput({ ...validInput, maxDurationMs: 99 }), false);
  assert.equal(validateInput({ ...validInput, expectedSnapshotDigest: undefined }), false);
  assert.equal(validateInput({
    ...validInput,
    invocation: { ...validInput.invocation, tool: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest },
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
    schema: "agenticgraph-knowledge-graph-query/v1",
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

test("knowledge-graph docs retain the complete local tool catalog", () => {
  const documents = [
    "README.md",
    "mcp/README.md",
    "docs/documents/agenticgraph-deterministic-knowledge-graph-runtime.md",
  ].map((file) => readFileSync(path.join(repoRoot, file), "utf8"));
  for (const document of documents) {
    for (const tool of expected) assert.match(document, new RegExp(tool.replaceAll(".", "\\.")));
    assert.match(document, /default-source/);
  }
  assert.doesNotMatch(documents[0], /three direct tool identities/i);
});
