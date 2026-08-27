import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID,
  KNOWLEDGE_GRAPH_INVOCATION_SCHEMA_ID,
} from "../knowledge-graph-tool-contract.js";
import { KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE } from "../knowledge-graph-parser-contract.js";
import { AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";
import { minimalTextPdf } from "./fixtures/minimal-text-pdf.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const invocationProof = (tool, route, overrides = {}) => ({
  schema: KNOWLEDGE_GRAPH_INVOCATION_SCHEMA_ID,
  tool,
  action: `/Future.${route}`,
  semantics: [`#Future-${route}`, "#deterministic-runtime"],
  bindings: [`@Future-${route}`, "@runtime-proof-v2"],
  sourceRevision: "1".repeat(40),
  catalogDigest: "2".repeat(64),
  routingSchema: AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID,
  routingDigest: "3".repeat(64),
  ...overrides,
});

async function writeFixture(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, contents);
}

test("official SDK ingests, queries, and explains one local graph over stdio", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-kg-stdio-"));
  const corpusRoot = path.join(temporaryRoot, "corpus");
  const outputRoot = path.join(temporaryRoot, "artifacts");
  await writeFixture(corpusRoot, "src/value.ts", "export const value = 7;\n");
  await writeFixture(corpusRoot, "src/main.ts", 'import { value } from "./value";\nexport const answer = () => value;\n');
  await writeFixture(corpusRoot, "schema.sql", "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);\n");
  await writeFixture(corpusRoot, "README.md", "# Fixture\n## Notes\n[Schema](schema.sql)\n");
  await writeFixture(corpusRoot, "config.json", '{"mode":"local","apiToken":"must-not-leak"}\n');
  await writeFixture(corpusRoot, "evidence.pdf", minimalTextPdf("Stdio PDF evidence"));

  const client = new Client({ name: "agenticgraph-knowledge-graph-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      AGENTICGRAPH_ROOT: repoRoot,
      AGENTICGRAPH_KNOWLEDGE_GRAPH_ALLOWED_ROOTS: corpusRoot,
      AGENTICGRAPH_KNOWLEDGE_GRAPH_OUTPUT_ROOT: outputRoot,
    },
    stderr: "pipe",
  });
  let stderrText = "";
  transport.stderr?.on("data", (chunk) => { stderrText += String(chunk); });

  try {
    await client.connect(transport, { timeout: 10_000 });
    const listed = await client.listTools(undefined, { timeout: 10_000 });
    const names = listed.tools.map((tool) => tool.name);
    for (const name of [
      AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphParserGenerate,
      AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
      AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery,
      AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphExplainEdge,
    ]) assert.ok(names.includes(name), `${name}; stderr=${stderrText}`);
    for (const name of [
      AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery,
      AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphExplainEdge,
    ]) {
      assert.equal(
        listed.tools.find((tool) => tool.name === name)?.inputSchema?.properties?.maxDurationMs?.default,
        300000,
      );
    }

    const parserGenerateResult = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphParserGenerate,
      arguments: {
        profile: KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE,
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(parserGenerateResult.isError, false, stderrText);
    const generated = parserGenerateResult.structuredContent;
    assert.equal(generated?.ok, true, JSON.stringify(generated));
    assert.equal(generated?.operation, "parser_generate");
    assert.equal(generated?.parserRegistry?.digest, generated?.parserRegistryDigest);
    assert.deepEqual(
      Object.keys(generated?.parserRegistry || {}).sort(),
      ["descriptors", "digest", "schema"],
    );
    assert.equal(JSON.stringify(generated).includes("modulePath"), false);
    assert.equal(JSON.stringify(generated).includes("executable"), false);

    const ingestResult = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
      arguments: {
        rootPath: corpusRoot,
        strict: true,
        parserRegistry: generated.parserRegistry,
        expectedParserRegistryDigest: generated.parserRegistryDigest,
      },
    }, undefined, { timeout: 30_000 });
    assert.equal(ingestResult.isError, false, stderrText);
    const ingest = ingestResult.structuredContent;
    assert.equal(ingest?.ok, true, JSON.stringify(ingest));
    assert.equal(ingest?.retrieval?.vectorStore, false);
    assert.equal(ingest?.cost?.modelCalls, 0);
    assert.ok(ingest?.parserCoverage?.["local-pdf-markdown-adapter"] > 0);
    assert.match(ingest?.graphId || "", /^kg:graph:[a-f0-9]{32}$/);
    assert.match(ingest?.snapshotDigest || "", /^[a-f0-9]{64}$/);
    assert.equal(ingest?.parserRegistryDigest, generated.parserRegistryDigest);
    assert.equal(ingest?.projection?.readOnly, true);
    assert.equal(JSON.stringify(ingest).includes("artifactPath"), false);
    const edge = ingest.projection.graphData.edges.find((candidate) => candidate.label === "resolvesToSource")
      || ingest.projection.graphData.edges[0];
    assert.ok(edge?.properties?.["evidence:explanation"]);

    const queryResult = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery,
      arguments: {
        graphId: ingest.graphId,
        expectedSnapshotDigest: ingest.snapshotDigest,
        mode: "search",
        query: "value",
        maxDurationMs: 1000,
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(queryResult.isError, false, stderrText);
    assert.equal(queryResult.structuredContent?.ok, true);
    assert.equal(queryResult.structuredContent?.graphId, ingest.graphId);
    assert.equal(queryResult.structuredContent?.snapshotDigest, ingest.snapshotDigest);
    assert.ok(queryResult.structuredContent?.results?.nodes?.length > 0);

    const pdfBodyQueryResult = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery,
      arguments: {
        graphId: ingest.graphId,
        expectedSnapshotDigest: ingest.snapshotDigest,
        mode: "search",
        query: "Stdio PDF evidence",
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(pdfBodyQueryResult.isError, false, stderrText);
    assert.equal(pdfBodyQueryResult.structuredContent?.ok, true);
    assert.ok(pdfBodyQueryResult.structuredContent?.results?.nodes?.some((entry) => (
      entry.node.type === "DocumentText" && entry.node.label.includes("Stdio PDF evidence")
    )));

    const explainResult = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphExplainEdge,
      arguments: {
        graphId: ingest.graphId,
        expectedSnapshotDigest: ingest.snapshotDigest,
        edgeId: edge.id,
        maxDurationMs: 1000,
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(explainResult.isError, false, stderrText);
    assert.equal(explainResult.structuredContent?.ok, true);
    assert.equal(explainResult.structuredContent?.graphId, ingest.graphId);
    assert.equal(explainResult.structuredContent?.snapshotDigest, ingest.snapshotDigest);
    assert.ok(explainResult.structuredContent?.evidence?.excerpt);

    const malformedInvocation = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery,
      arguments: {
        graphId: ingest.graphId,
        expectedSnapshotDigest: ingest.snapshotDigest,
        mode: "summary",
        invocation: invocationProof(
          AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery,
          "graph-lookup",
          { semantics: ["missing-sigil"] },
        ),
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(malformedInvocation.isError, true);
    assert.equal(malformedInvocation.structuredContent?.error?.code, "invalid_invocation");

    const wrongToolInvocation = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery,
      arguments: {
        graphId: ingest.graphId,
        expectedSnapshotDigest: ingest.snapshotDigest,
        mode: "summary",
        invocation: invocationProof(
          AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
          "graph-lookup",
        ),
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(wrongToolInvocation.isError, true);
    assert.equal(wrongToolInvocation.structuredContent?.error?.code, "invalid_invocation");

    const malformedProof = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery,
      arguments: {
        graphId: ingest.graphId,
        expectedSnapshotDigest: ingest.snapshotDigest,
        mode: "summary",
        invocation: invocationProof(
          AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery,
          "graph-lookup",
          { routingDigest: "not-a-digest" },
        ),
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(malformedProof.isError, true);
    assert.equal(malformedProof.structuredContent?.error?.code, "invalid_invocation");

    const invalidArguments = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphQuery,
      arguments: {
        graphId: ingest.graphId,
        expectedSnapshotDigest: ingest.snapshotDigest,
        mode: "summary",
        unexpected: true,
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(invalidArguments.isError, true);
    assert.equal(invalidArguments.structuredContent?.error?.code, "invalid_arguments");
  } finally {
    await client.close().catch(() => undefined);
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
