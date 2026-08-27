import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { EVIDENCE_FIELDS, sha256 } from "../knowledge-graph/contract.mjs";
import { createKnowledgeGraphRuntime, KNOWLEDGE_GRAPH_TOOL_NAMES } from "../knowledge-graph/runtime.mjs";
import {
  readKnowledgeGraphRepositoryIndex,
  readKnowledgeGraphResolutionShards,
  readKnowledgeGraphSnapshot,
  readKnowledgeGraphSourceShard,
} from "../knowledge-graph/store.mjs";
import { parseSqlSource } from "../knowledge-graph/sql-parser.mjs";

const execFileAsync = promisify(execFile);

async function writeFile(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, contents);
  return target;
}

async function initializeRepository(repositoryPath) {
  await fs.mkdir(repositoryPath, { recursive: true });
  await execFileAsync("git", ["init", "--quiet", repositoryPath], {
    env: {
      PATH: String(process.env.PATH || ""),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
    },
  });
}

async function writeFakePythonRuntime(target, versionInfo, { failSources = false } = {}) {
  const encodedVersion = JSON.stringify(versionInfo);
  const sourceFailure = failSources
    ? [
        "  if (request.sourcePath !== '<python-runtime-probe>') {",
        "    process.stderr.write('synthetic source parse failure\\n');",
        "    process.exitCode = 2;",
        "    return;",
        "  }",
      ]
    : [];
  await fs.writeFile(target, [
    "#!/usr/bin/env node",
    "let input = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => { input += chunk; });",
    "process.stdin.on('end', () => {",
    "  const request = JSON.parse(input);",
    ...sourceFailure,
    `  process.stdout.write(JSON.stringify({ pythonVersionInfo: ${encodedVersion}, declarations: [], imports: [], calls: [], inherits: [], diagnostics: [] }));`,
    "});",
    "",
  ].join("\n"));
  await fs.chmod(target, 0o700);
}

async function createFixture(t, { withPdfConverter = true } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-kg-runtime-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const agenticgraphRoot = path.join(base, "host");
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(agenticgraphRoot, "outputs");
  await fs.mkdir(agenticgraphRoot, { recursive: true });
  await initializeRepository(corpusRoot);
  await writeFile(corpusRoot, "src/db.ts", "export function load() { return 1; }\n");
  await writeFile(corpusRoot, "src/db/index.ts", "export function alternate() { return 2; }\n");
  await writeFile(corpusRoot, "src/app.ts", [
    'import { load } from "./db";',
    "export const multiline =",
    "  async () => load();",
    "",
  ].join("\n"));
  await writeFile(corpusRoot, "src/Service.java", [
    "public class Service",
    "{",
    "  public void run()",
    "  {",
    "  }",
    "}",
    "",
  ].join("\n"));
  await writeFile(corpusRoot, "lib.py", "class Service:\n    def run(self):\n        return 1\n");
  await writeFile(corpusRoot, "sql/accounts.sql", [
    "/* schema preface */",
    "CREATE TABLE IF NOT EXISTS accounts (",
    "  tenant_id INTEGER,",
    "  id INTEGER,",
    "  CONSTRAINT accounts_pk PRIMARY KEY (tenant_id, id)",
    ");",
    "",
  ].join("\n"));
  await writeFile(corpusRoot, "sql/users.sql", [
    "CREATE TABLE IF NOT EXISTS users (",
    "  tenant_id INTEGER,",
    "  account_id INTEGER,",
    "  CONSTRAINT users_fk FOREIGN KEY (tenant_id, account_id)",
    "    REFERENCES accounts(tenant_id, id)",
    ");",
    "",
  ].join("\n"));
  await writeFile(corpusRoot, "README.md", "# Corpus\n## Schema\n[Accounts](sql/accounts.sql)\n");
  await writeFile(corpusRoot, "config.json", '{"constructor":{"toString":"kept"},"credentials":{"value":"secret"}}\n');
  await writeFile(corpusRoot, "wrangler.toml", 'name = "fixture"\n[credentials]\nvalue = "secret"\n');
  await writeFile(corpusRoot, "paper.pdf", Buffer.from("%PDF-1.4\nlocal fixture\n%%EOF\n"));
  await writeFile(corpusRoot, "README.rst", "Corpus inventory fallback\n");
  await writeFile(corpusRoot, "assets/opaque.bin", Buffer.from([0, 1, 2, 3]));
  await initializeRepository(path.join(corpusRoot, "nested"));
  await writeFile(corpusRoot, "nested/schema.sql", "CREATE TABLE accounts (id INTEGER PRIMARY KEY);\n");
  let pdfCalls = 0;
  const runtime = createKnowledgeGraphRuntime({
    agenticgraphRoot,
    allowedRoots: [corpusRoot],
    outputRoot,
    pdfConverter: withPdfConverter
      ? async () => {
        pdfCalls += 1;
        return "# Research\n## Page 1\nDeterministic PDF evidence\n";
      }
      : null,
    pdfConverterVersion: withPdfConverter ? "fixture-v1" : "pending",
  });
  return { base, agenticgraphRoot, corpusRoot, outputRoot, runtime, pdfCalls: () => pdfCalls };
}

async function ingestFixture(fixture, extra = {}) {
  const result = await fixture.runtime.run(KNOWLEDGE_GRAPH_TOOL_NAMES.ingest, {
    rootPath: fixture.corpusRoot,
    strict: true,
    ...extra,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

function pointerPathFor(fixture, graphId) {
  return path.join(fixture.outputRoot, "graphs", `${graphId.slice("kg:graph:".length)}.json`);
}

async function materializeFixture(fixture, ingest) {
  const snapshot = await readKnowledgeGraphSnapshot(pointerPathFor(fixture, ingest.graphId), {
    allowedRoot: fixture.outputRoot,
    expectedGraphId: ingest.graphId,
  });
  const nodes = [];
  const edges = [];
  const sources = [];
  for (const repository of snapshot.manifest.repositories) {
    const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
    sources.push(...index.sources);
    for (const entry of index.sources) {
      const shard = await readKnowledgeGraphSourceShard(snapshot, entry);
      nodes.push(...shard.nodes);
      edges.push(...shard.edges);
    }
    for await (const resolution of readKnowledgeGraphResolutionShards(snapshot, index)) {
      edges.push(...resolution.edges);
    }
  }
  return { snapshot, nodes, edges, sources };
}

test("ingest writes content-addressed shards and returns only opaque graph identity", async (t) => {
  const fixture = await createFixture(t);
  const first = await ingestFixture(fixture, { projectionLimit: 5 });
  assert.match(first.graphId, /^kg:graph:[a-f0-9]{32}$/);
  assert.match(first.snapshotDigest, /^[a-f0-9]{64}$/);
  assert.match(first.parserRegistryDigest, /^[a-f0-9]{64}$/);
  assert.equal(first.complete, true);
  assert.equal(first.acquisition.networkRequests, 0);
  assert.equal(first.retrieval.vectorStore, false);
  assert.equal(first.cost.modelCalls, 0);
  assert.equal(first.projection.limit, 5);
  assert.equal(first.projection.truncated, true);
  assert.equal(first.projection.readOnly, true);
  assert.equal(first.projection.graphData.type, "Graph");
  assert.match(first.projection.token, /^kg:projection:[a-f0-9]{24}$/);
  const projectedNodeIds = new Set(first.projection.graphData.nodes.map((node) => node.id));
  assert.ok(first.projection.graphData.edges.every((edge) => (
    projectedNodeIds.has(edge.source) && projectedNodeIds.has(edge.target)
  )));
  assert.equal(JSON.stringify(first).includes("artifactPath"), false);
  assert.equal(JSON.stringify(first).includes("outputPath"), false);

  const pointerRaw = await fs.readFile(pointerPathFor(fixture, first.graphId), "utf8");
  const pointer = JSON.parse(pointerRaw);
  assert.deepEqual(Object.keys(pointer).sort(), ["graphId", "manifestDigest", "schema", "snapshotDigest"]);
  assert.equal(pointerRaw.includes('"nodes"'), false);
  const graph = await materializeFixture(fixture, first);
  assert.equal(graph.snapshot.manifest.schema, "agenticgraph-knowledge-graph-sharded-manifest/v1");
  assert.ok(graph.snapshot.manifest.repositories.length >= 2);
  assert.ok(graph.nodes.some((node) => node.type === "CodeFunction" && node.label === "multiline"));
  assert.ok(!graph.nodes.some((node) => node.type === "CodeCallReference" && node.label === "async"));
  assert.ok(graph.nodes.some((node) => node.type === "CodeClass" && node.label === "Service"
    && node.properties["corpus:sourcePath"] === "src/Service.java"));
  assert.ok(graph.nodes.some((node) => node.type === "ConfigKey" && node.label === "constructor.toString"));
  assert.ok(graph.nodes.some((node) => node.type === "SqlTable" && node.label === "accounts"));
  assert.ok(graph.nodes.some((node) => node.type === "DocumentText" && node.label.includes("PDF evidence")));
  for (const sourcePath of ["README.rst", "assets/opaque.bin"]) {
    const inventory = graph.nodes.find((node) => node.type === "SourceFile"
      && node.properties["corpus:sourcePath"] === sourcePath);
    assert.equal(inventory?.properties["corpus:parserFidelity"], "inventory-only");
    assert.equal(inventory?.properties["corpus:sourceStatus"], "ready");
  }
  const importResolutions = graph.edges.filter((edge) => edge.label === "resolvesToSource"
    && edge.properties["evidence:ruleId"] === "resolve.relative-code-import.repository");
  assert.equal(importResolutions.length, 2);
  assert.ok(importResolutions.every((edge) => edge.properties["evidence:certainty"] === "ambiguous"));
  assert.ok(importResolutions.every((edge) => edge.properties["evidence:candidateCount"] === 2));
  const rootAccounts = graph.nodes.find((node) => node.type === "SqlTable" && node.label === "accounts"
    && node.properties["corpus:repositoryPath"] === ".");
  const nestedAccounts = graph.nodes.find((node) => node.type === "SqlTable" && node.label === "accounts"
    && node.properties["corpus:repositoryPath"] === "nested");
  assert.ok(rootAccounts && nestedAccounts);
  const sqlResolutions = graph.edges.filter((edge) => edge.label === "resolvesTo");
  assert.ok(sqlResolutions.some((edge) => edge.target === rootAccounts.id));
  assert.ok(!sqlResolutions.some((edge) => edge.target === nestedAccounts.id));
  for (const edge of graph.edges) {
    for (const field of EVIDENCE_FIELDS) assert.notEqual(edge.properties[field], undefined, `${edge.id} ${field}`);
    assert.equal(edge.properties["evidence:excerptHash"], sha256(edge.properties["evidence:excerpt"]));
    assert.match(edge.properties["evidence:sourceDigest"], /^[a-f0-9]{64}$/);
    assert.match(edge.properties["evidence:parserDigest"], /^[a-f0-9]{64}$/);
  }

  const second = await ingestFixture(fixture);
  assert.equal(second.graphId, first.graphId);
  assert.equal(second.snapshotDigest, first.snapshotDigest);
  assert.equal(second.counts.parsed, 0);
  assert.equal(second.counts.reused, second.counts.sources);
  assert.equal(fixture.pdfCalls(), 1);
});

test("ingest emits deterministic persisted-source progress fragments", async (t) => {
  const fixture = await createFixture(t);
  const progress = [];
  const result = await fixture.runtime.run(KNOWLEDGE_GRAPH_TOOL_NAMES.ingest, {
    rootPath: fixture.corpusRoot,
    strict: true,
  }, {
    onProgress: (frame) => progress.push(frame),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(progress.length, result.counts.sources);
  assert.deepEqual(progress.map((frame) => frame.sourceIndex), progress.map((_, index) => index + 1));
  assert.ok(progress.every((frame) => (
    frame.schema === "agenticgraph-knowledge-graph-import-progress/v1"
    && frame.kind === "source-parsed"
    && frame.graphId === result.graphId
    && frame.parserRegistryDigest === result.parserRegistryDigest
    && frame.sourceTotal === result.counts.sources
    && typeof frame.sourcePath === "string"
    && !frame.sourcePath.startsWith("/")
    && !frame.sourcePath.includes("..")
    && Array.isArray(frame.fragment?.nodes)
    && Array.isArray(frame.fragment?.edges)
  )));
  assert.deepEqual(
    progress.map((frame) => frame.sourcePath),
    progress.map((frame) => frame.sourcePath).slice().sort(),
  );
  for (const frame of progress) {
    for (const edge of frame.fragment.edges) {
      for (const field of EVIDENCE_FIELDS) assert.notEqual(edge.properties[field], undefined, `${edge.id} ${field}`);
    }
  }
});

test("generated parser registry is verified and fences discovery, snapshot identity, and cache reuse", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-kg-generated-parser-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const agenticgraphRoot = path.join(base, "host");
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(agenticgraphRoot, "outputs");
  await fs.mkdir(agenticgraphRoot, { recursive: true });
  await initializeRepository(corpusRoot);
  await writeFile(corpusRoot, "config/app.schema.json", '{"title":"App"}\n');
  await writeFile(corpusRoot, "config/app.json", '{"enabled":true}\n');
  const runtime = createKnowledgeGraphRuntime({
    agenticgraphRoot,
    allowedRoots: [corpusRoot],
    outputRoot,
  });
  const descriptors = (suffix) => [
    {
      id: `general-json-${suffix}`,
      kind: `general-json-${suffix}`,
      adapter: "json-config",
      fidelity: "ast",
      extensions: [".json"],
      basenames: [],
      basenameFamilies: [],
      priority: 100,
    },
    {
      id: `schema-json-${suffix}`,
      kind: `schema-json-${suffix}`,
      adapter: "json-config",
      fidelity: "ast",
      extensions: [".schema.json"],
      basenames: [],
      basenameFamilies: [],
      priority: 1,
    },
  ];
  const generatedA = runtime.generateKnowledgeGraphParser({ descriptors: descriptors("a") });
  assert.equal(generatedA.ok, true, JSON.stringify(generatedA));
  const ingestWith = (generated) => runtime.ingest({
    rootPath: corpusRoot,
    strict: true,
    useCache: true,
    parserRegistry: generated.parserRegistry,
    expectedParserRegistryDigest: generated.parserRegistryDigest,
  });
  const first = await ingestWith(generatedA);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.parserRegistryDigest, generatedA.parserRegistryDigest);
  assert.equal(first.counts.parsed, 2);
  assert.equal(first.counts.reused, 0);
  const firstGraph = await materializeFixture({ outputRoot }, first);
  assert.equal(firstGraph.snapshot.manifest.parserRegistryDigest, generatedA.parserRegistryDigest);
  assert.ok(firstGraph.nodes.some((node) => (
    node.type === "SourceFile"
    && node.label === "config/app.schema.json"
    && node.properties["corpus:parserDescriptorId"] === "schema-json-a"
    && node.properties["corpus:parserRegistryDigest"] === generatedA.parserRegistryDigest
  )));

  const warm = await ingestWith(generatedA);
  assert.equal(warm.ok, true, JSON.stringify(warm));
  assert.equal(warm.snapshotDigest, first.snapshotDigest);
  assert.equal(warm.counts.parsed, 0);
  assert.equal(warm.counts.reused, 2);

  const generatedB = runtime.generateKnowledgeGraphParser({ descriptors: descriptors("b") });
  assert.equal(generatedB.ok, true, JSON.stringify(generatedB));
  assert.notEqual(generatedB.parserRegistryDigest, generatedA.parserRegistryDigest);
  const changedRegistry = await ingestWith(generatedB);
  assert.equal(changedRegistry.ok, true, JSON.stringify(changedRegistry));
  assert.equal(changedRegistry.graphId, first.graphId);
  assert.notEqual(changedRegistry.snapshotDigest, first.snapshotDigest);
  assert.equal(changedRegistry.counts.parsed, 2);
  assert.equal(changedRegistry.counts.reused, 0);

  const tampered = await runtime.ingest({
    rootPath: corpusRoot,
    strict: true,
    parserRegistry: {
      ...generatedB.parserRegistry,
      digest: "0".repeat(64),
    },
    expectedParserRegistryDigest: generatedB.parserRegistryDigest,
  });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.error.code, "parser_registry_digest_mismatch");
  const currentPointer = JSON.parse(await fs.readFile(
    pointerPathFor({ outputRoot }, changedRegistry.graphId),
    "utf8",
  ));
  assert.equal(currentPointer.snapshotDigest, changedRegistry.snapshotDigest);
});

test("Python runtime identity fences cache reuse and invalidates exact-version changes", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-kg-python-cache-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const agenticgraphRoot = path.join(base, "host");
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(agenticgraphRoot, "outputs");
  const pythonBin = path.join(base, "fake-python");
  await fs.mkdir(agenticgraphRoot, { recursive: true });
  await initializeRepository(corpusRoot);
  await writeFile(corpusRoot, "module.py", "def stable():\n    return 1\n");
  await writeFakePythonRuntime(pythonBin, [3, 9, 6, "final", 0]);
  const runtime = createKnowledgeGraphRuntime({
    agenticgraphRoot,
    allowedRoots: [corpusRoot],
    outputRoot,
    pythonBin,
  });
  const ingest = () => runtime.ingest({
    rootPath: corpusRoot,
    strict: true,
    useCache: true,
  });

  const first = await ingest();
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.counts.parsed, 1);
  assert.equal(first.counts.reused, 0);

  const warmA = await ingest();
  assert.equal(warmA.ok, true, JSON.stringify(warmA));
  assert.equal(warmA.snapshotDigest, first.snapshotDigest);
  assert.equal(warmA.counts.parsed, 0);
  assert.equal(warmA.counts.reused, 1);

  await writeFakePythonRuntime(pythonBin, [3, 10, 0, "final", 0]);
  const changedRuntime = await ingest();
  assert.equal(changedRuntime.ok, true, JSON.stringify(changedRuntime));
  assert.notEqual(changedRuntime.snapshotDigest, first.snapshotDigest);
  assert.equal(changedRuntime.counts.parsed, 1);
  assert.equal(changedRuntime.counts.reused, 0);

  const warmB = await ingest();
  assert.equal(warmB.ok, true, JSON.stringify(warmB));
  assert.equal(warmB.snapshotDigest, changedRuntime.snapshotDigest);
  assert.equal(warmB.counts.parsed, 0);
  assert.equal(warmB.counts.reused, 1);
});

test("a transient Python parser error is reparsed after same-runtime recovery", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-kg-python-recovery-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const agenticgraphRoot = path.join(base, "host");
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(agenticgraphRoot, "outputs");
  const pythonBin = path.join(base, "fake-python");
  await fs.mkdir(agenticgraphRoot, { recursive: true });
  await initializeRepository(corpusRoot);
  await writeFile(corpusRoot, "module.py", "def recoverable():\n    return 1\n");
  const versionInfo = [3, 9, 6, "final", 0];
  await writeFakePythonRuntime(pythonBin, versionInfo, { failSources: true });
  const runtime = createKnowledgeGraphRuntime({
    agenticgraphRoot,
    allowedRoots: [corpusRoot],
    outputRoot,
    pythonBin,
  });

  const failed = await runtime.ingest({
    rootPath: corpusRoot,
    strict: false,
    useCache: true,
  });
  assert.equal(failed.ok, true, JSON.stringify(failed));
  assert.equal(failed.complete, false);
  assert.equal(failed.counts.parsed, 1);
  assert.equal(failed.counts.reused, 0);

  await writeFakePythonRuntime(pythonBin, versionInfo);
  const recovered = await runtime.ingest({
    rootPath: corpusRoot,
    strict: true,
    useCache: true,
  });
  assert.equal(recovered.ok, true, JSON.stringify(recovered));
  assert.equal(recovered.complete, true);
  assert.equal(recovered.counts.parsed, 1);
  assert.equal(recovered.counts.reused, 0);
  assert.notEqual(recovered.snapshotDigest, failed.snapshotDigest);

  const warm = await runtime.ingest({
    rootPath: corpusRoot,
    strict: true,
    useCache: true,
  });
  assert.equal(warm.ok, true, JSON.stringify(warm));
  assert.equal(warm.snapshotDigest, recovered.snapshotDigest);
  assert.equal(warm.counts.parsed, 0);
  assert.equal(warm.counts.reused, 1);
});

test("query, traversal, summaries, and explanations are digest-fenced and bounded", async (t) => {
  const fixture = await createFixture(t);
  const ingest = await ingestFixture(fixture);
  const common = { graphId: ingest.graphId, expectedSnapshotDigest: ingest.snapshotDigest };
  const search = await fixture.runtime.query({ ...common, mode: "search", query: "accounts", limit: 10 });
  assert.equal(search.ok, true);
  assert.equal(search.graphId, ingest.graphId);
  assert.equal(search.snapshotDigest, ingest.snapshotDigest);
  assert.ok(search.results.nodes.length > 0);
  const limited = await fixture.runtime.query({ ...common, mode: "search", query: "sourcefile", limit: 1 });
  assert.equal(limited.completeness.reason, "result_limit");
  const pathResult = await fixture.runtime.query({
    ...common,
    mode: "path",
    from: "src/app.ts",
    to: "src/db.ts",
    direction: "outgoing",
    edgeLabels: ["imports", "resolvesToSource"],
    maxDepth: 3,
  });
  assert.equal(pathResult.found, true, JSON.stringify(pathResult));
  const resolutionCitation = pathResult.citations.find((citation) => (
    citation.ruleId === "resolve.relative-code-import.repository"
  ));
  assert.ok(resolutionCitation, JSON.stringify(pathResult));
  const summary = await fixture.runtime.query({ ...common, mode: "summary" });
  assert.equal(summary.ok, true);
  assert.equal(summary.completeness.complete, true);
  const graph = await materializeFixture(fixture, ingest);
  const edge = graph.edges.find((candidate) => candidate.label === "referencesTable");
  const explanation = await fixture.runtime.explainEdge({ ...common, edgeId: edge.id });
  assert.equal(explanation.ok, true);
  assert.equal(explanation.graphId, ingest.graphId);
  assert.equal(explanation.snapshotDigest, ingest.snapshotDigest);
  assert.match(explanation.evidence.explanation, /references table/i);
  assert.match(explanation.evidence.sourceDigest, /^[a-f0-9]{64}$/);
  assert.match(explanation.evidence.parserDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(explanation.evidence.premiseEdgeIds, []);
  assert.equal(explanation.evidence.candidateCount, 1);
  assert.deepEqual(explanation.evidence.candidateIds, []);
  const resolutionExplanation = await fixture.runtime.explainEdge({
    ...common,
    edgeId: resolutionCitation.edgeId,
  });
  assert.equal(resolutionExplanation.ok, true);
  assert.deepEqual(
    {
      premiseEdgeIds: resolutionCitation.premiseEdgeIds,
      candidateCount: resolutionCitation.candidateCount,
      candidateIds: resolutionCitation.candidateIds,
    },
    {
      premiseEdgeIds: resolutionExplanation.evidence.premiseEdgeIds,
      candidateCount: resolutionExplanation.evidence.candidateCount,
      candidateIds: resolutionExplanation.evidence.candidateIds,
    },
  );
  const stale = await fixture.runtime.query({ ...common, expectedSnapshotDigest: "0".repeat(64), mode: "summary" });
  assert.equal(stale.error.code, "stale_snapshot_digest");
  const missing = await fixture.runtime.query({ graphId: ingest.graphId, mode: "summary" });
  assert.equal(missing.error.code, "expected_snapshot_digest_required");
});

test("strict failure and admission limits preserve the previous ready pointer", async (t) => {
  const fixture = await createFixture(t);
  const ingest = await ingestFixture(fixture);
  const pointerPath = pointerPathFor(fixture, ingest.graphId);
  const before = await fs.readFile(pointerPath, "utf8");
  await writeFile(fixture.corpusRoot, "lib.py", "def changed(:\n");
  const failed = await fixture.runtime.ingest({ rootPath: fixture.corpusRoot, strict: true });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "strict_ingest_incomplete");
  assert.match(failed.error.message, /local parser returned an incomplete result/i);
  assert.match(failed.error.message, /lib\.py/);
  assert.doesNotMatch(failed.error.message, /source parsing was incomplete/i);
  assert.equal(failed.error.details.previousReadySnapshotPreserved, true);
  assert.equal(await fs.readFile(pointerPath, "utf8"), before);
  const limited = await fixture.runtime.ingest({ rootPath: fixture.corpusRoot, maxFiles: 1, strict: true });
  assert.equal(limited.ok, false);
  assert.equal(limited.error.code, "max_files_exceeded");
  assert.equal(limited.error.details.complete, false);
  assert.equal(await fs.readFile(pointerPath, "utf8"), before);
});

test("pointer tampering, root escape, symlinks, and incomplete PDFs fail closed", async (t) => {
  const fixture = await createFixture(t);
  const otherRoot = path.join(fixture.base, "other");
  await fs.mkdir(otherRoot);
  const outside = await writeFile(otherRoot, "outside.ts", "export const leaked = true;\n");
  await fs.symlink(outside, path.join(fixture.corpusRoot, "linked.ts"));
  const ingest = await ingestFixture(fixture);
  assert.ok(ingest.diagnostics.some((item) => item.code === "symlink_skipped"));
  const escaped = await fixture.runtime.ingest({ rootPath: otherRoot, strict: true });
  assert.equal(escaped.error.code, "root_outside_allowed_roots");
  const pointerPath = pointerPathFor(fixture, ingest.graphId);
  const pointer = JSON.parse(await fs.readFile(pointerPath, "utf8"));
  pointer.manifestDigest = "0".repeat(64);
  await fs.writeFile(pointerPath, `${JSON.stringify(pointer)}\n`);
  const tampered = await fixture.runtime.query({
    graphId: ingest.graphId,
    expectedSnapshotDigest: ingest.snapshotDigest,
    mode: "summary",
  });
  assert.equal(tampered.error.code, "graph_pointer_invalid");

  const pendingFixture = await createFixture(t, { withPdfConverter: false });
  const pending = await pendingFixture.runtime.ingest({ rootPath: pendingFixture.corpusRoot, strict: true });
  assert.equal(pending.error.code, "strict_ingest_incomplete");
});

test("repository URL acquisition rejects unsafe or credential-bearing identities before network access", async (t) => {
  const fixture = await createFixture(t);
  for (const repositoryUrl of [
    "http://code.example.test/example/project",
    "https://user:secret@code.example.test/example/project",
    "https://localhost/example/project",
    "https://code.example.test/example/project?token=secret",
  ]) {
    const result = await fixture.runtime.ingest({ repositoryUrl, strict: true });
    assert.equal(result.ok, false);
    assert.ok(
      ["repository_url_invalid", "repository_host_not_allowed"].includes(result.error.code),
      JSON.stringify(result),
    );
  }
});

test("SQL parser handles comment prefixes, IF NOT EXISTS, and named composite constraints", () => {
  const text = [
    "/* preface */",
    "CREATE TABLE IF NOT EXISTS parent (a INT, b INT, CONSTRAINT parent_pk PRIMARY KEY (a, b));",
    "CREATE TABLE IF NOT EXISTS child (x INT, y INT, CONSTRAINT child_fk FOREIGN KEY (x, y) REFERENCES parent(a, b));",
  ].join("\n");
  const fragment = parseSqlSource({ sourcePath: "schema.sql", text, contentHash: sha256(text), byteSize: Buffer.byteLength(text) });
  assert.equal(fragment.status, "parsed");
  assert.deepEqual(fragment.nodes.filter((node) => node.type === "SqlTable").map((node) => node.label), ["parent", "child"]);
  assert.equal(fragment.edges.filter((edge) => edge.label === "hasPrimaryKey").length, 2);
  assert.equal(fragment.edges.filter((edge) => edge.label === "referencesColumn").length, 2);
});
