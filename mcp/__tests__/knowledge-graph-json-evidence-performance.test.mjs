import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  sha256,
  stableEdgeId,
} from "../knowledge-graph/contract.mjs";
import {
  JSON_CONFIG_PARSER_ID,
  JSON_CONFIG_PARSER_VERSION,
  parseKnowledgeSource,
} from "../knowledge-graph/parsers.mjs";
import { createKnowledgeGraphRuntime } from "../knowledge-graph/runtime.mjs";
import {
  readKnowledgeGraphRepositoryIndex,
  readKnowledgeGraphSnapshot,
  readKnowledgeGraphSourceShard,
  writeKnowledgeGraphSnapshotAtomic,
  writeKnowledgeGraphSourceShard,
} from "../knowledge-graph/store.mjs";

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-kg-json-evidence-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(base, "output");
  await fs.mkdir(corpusRoot, { recursive: true });
  const runtime = createKnowledgeGraphRuntime({
    knowgrphRoot: base,
    allowedRoots: [corpusRoot],
    outputRoot,
  });
  return { base, corpusRoot, outputRoot, runtime };
}

const pointerPath = (value, graphId) => path.join(
  value.outputRoot,
  "graphs",
  `${graphId.slice("kg:graph:".length)}.json`,
);

async function sourceSnapshot(value, ingest) {
  const graphPointer = pointerPath(value, ingest.graphId);
  const snapshot = await readKnowledgeGraphSnapshot(graphPointer, {
    allowedRoot: value.outputRoot,
    expectedGraphId: ingest.graphId,
  });
  const repository = snapshot.manifest.repositories[0];
  const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
  const entry = index.sources[0];
  const shard = await readKnowledgeGraphSourceShard(snapshot, entry);
  return { graphPointer, snapshot, entry, shard };
}

async function publishValidPriorParserSnapshot(value, current, parserVersion) {
  const parserDigest = sha256(`${current.entry.parserId}\0${parserVersion}`);
  const fragment = {
    ...current.shard,
    parserVersion,
    nodes: current.shard.nodes.map((node) => (
      node.type === "SourceFile"
        ? {
          ...node,
          properties: {
            ...node.properties,
            "corpus:parserVersion": parserVersion,
          },
        }
        : node
    )),
    edges: current.shard.edges.map((edge) => ({
      ...edge,
      properties: {
        ...edge.properties,
        "evidence:parserVersion": parserVersion,
        "evidence:parserDigest": parserDigest,
      },
    })),
  };
  const sourceEntry = await writeKnowledgeGraphSourceShard(
    current.graphPointer,
    {
      relativePath: current.entry.sourcePath,
      contentHash: current.entry.contentHash,
      byteSize: current.entry.byteSize,
      kind: current.entry.kind,
      repositoryId: current.entry.repositoryId,
      repositoryPath: current.entry.repositoryPath,
    },
    fragment,
    { allowedRoot: value.outputRoot },
  );
  const rootContentHash = sha256([
    sourceEntry,
  ].map((entry) => (
    `${entry.sourcePath}\0${entry.contentHash}\0${entry.parserId}\0${entry.parserVersion}`
  )).sort().join("\n"));
  await writeKnowledgeGraphSnapshotAtomic(current.graphPointer, {
    graphId: current.snapshot.pointer.graphId,
    sourceEntries: [sourceEntry],
    derivedEdgesByRepository: new Map(),
    diagnostics: current.snapshot.manifest.diagnostics,
    rootContentHash,
    admission: current.snapshot.manifest.admission,
    completeness: current.snapshot.manifest.completeness,
    parserRegistryDigest: current.snapshot.manifest.parserRegistryDigest,
  }, {
    allowedRoot: value.outputRoot,
  });
}

test("JSON evidence preserves multiline coordinates, redaction, query, explain, and parser cache identity", async (t) => {
  const value = await fixture(t);
  const sourcePath = "config/runtime.json";
  const jsonText = [
    "{",
    '  "service": {',
    '    "pipelines": [',
    "      {",
    '        "displayName":',
    '          "alpha",',
    '        "apiToken":',
    '          "never-store"',
    "      }",
    "    ]",
    "  },",
    '  "newlineBoundary":',
    "    true",
    "}",
    "",
  ].join("\n");
  await fs.mkdir(path.join(value.corpusRoot, "config"), { recursive: true });
  await fs.writeFile(path.join(value.corpusRoot, sourcePath), jsonText);

  const initial = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
  });
  assert.equal(initial.ok, true, JSON.stringify(initial));
  assert.equal(initial.counts.parsed, 1);
  const current = await sourceSnapshot(value, initial);
  assert.equal(current.entry.parserId, JSON_CONFIG_PARSER_ID);
  assert.equal(current.entry.parserVersion, JSON_CONFIG_PARSER_VERSION);
  assert.match(current.entry.parserVersion, /^1\.1\.0\+typescript-/);

  const expectedEvidence = new Map([
    ["service", [2, 11, 3, 4, '"service": <omitted>']],
    ["service.pipelines", [3, 10, 5, 6, '"pipelines": <omitted>']],
    ["service.pipelines.[0]", [4, 9, 7, 8, "[0]"]],
    ["service.pipelines.[0].displayName", [5, 6, 9, 18, '"displayName": <omitted>']],
    ["service.pipelines.[0].apiToken", [7, 8, 9, 24, "apiToken=<redacted>"]],
    ["newlineBoundary", [12, 13, 3, 9, '"newlineBoundary": <omitted>']],
  ]);
  for (const [label, expected] of expectedEvidence) {
    const node = current.shard.nodes.find((candidate) => candidate.label === label);
    assert.ok(node, label);
    const edge = current.shard.edges.find((candidate) => candidate.target === node.id);
    assert.ok(edge, label);
    const [
      lineStart,
      lineEnd,
      columnStart,
      columnEnd,
      excerpt,
    ] = expected;
    assert.deepEqual([
      edge.properties["evidence:lineStart"],
      edge.properties["evidence:lineEnd"],
      edge.properties["evidence:columnStart"],
      edge.properties["evidence:columnEnd"],
      edge.properties["evidence:excerpt"],
    ], expected);
    assert.equal(edge.properties["evidence:excerptHash"], sha256(excerpt));
    assert.equal(edge.properties["evidence:sourceDigest"], sha256(jsonText));
    assert.equal(edge.properties["evidence:parserVersion"], JSON_CONFIG_PARSER_VERSION);
    assert.equal(
      edge.properties["evidence:parserDigest"],
      sha256(`${JSON_CONFIG_PARSER_ID}\0${JSON_CONFIG_PARSER_VERSION}`),
    );
    assert.equal(
      edge.id,
      stableEdgeId({
        label: edge.label,
        source: edge.source,
        target: edge.target,
        ruleId: "json.config-key.ast",
        sourcePath,
        anchor: `${lineStart}:${columnStart}`,
      }),
    );
    assert.ok(lineEnd >= lineStart);
    assert.ok(columnEnd > 0);
  }

  const tokenNode = current.shard.nodes.find(
    (node) => node.label === "service.pipelines.[0].apiToken",
  );
  const tokenEdge = current.shard.edges.find((edge) => edge.target === tokenNode.id);
  assert.equal(tokenNode.properties["config:redacted"], true);
  assert.equal(JSON.stringify(tokenEdge).includes("never-store"), false);

  const search = await value.runtime.query({
    graphId: initial.graphId,
    expectedSnapshotDigest: initial.snapshotDigest,
    mode: "search",
    query: "apiToken",
  });
  assert.equal(search.ok, true, JSON.stringify(search));
  assert.ok(search.results.nodes.some((result) => result.node.id === tokenNode.id));
  const explanation = await value.runtime.explainEdge({
    graphId: initial.graphId,
    expectedSnapshotDigest: initial.snapshotDigest,
    edgeId: tokenEdge.id,
  });
  assert.equal(explanation.ok, true, JSON.stringify(explanation));
  assert.equal(explanation.evidence.sourceSpan.lineStart, 7);
  assert.equal(explanation.evidence.sourceSpan.lineEnd, 8);
  assert.equal(explanation.evidence.excerpt, "apiToken=<redacted>");
  assert.equal(explanation.evidence.excerptHash, sha256("apiToken=<redacted>"));

  const priorVersion = JSON_CONFIG_PARSER_VERSION.replace(/^1\.1\.0/, "1.0.0");
  await publishValidPriorParserSnapshot(value, current, priorVersion);
  const prior = await sourceSnapshot(value, initial);
  assert.equal(prior.entry.parserVersion, priorVersion);
  assert.equal(prior.shard.parserVersion, priorVersion);

  const reparsed = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
  });
  assert.equal(reparsed.ok, true, JSON.stringify(reparsed));
  assert.equal(reparsed.counts.parsed, 1);
  assert.equal(reparsed.counts.reused, 0);
  const reparsedSource = await sourceSnapshot(value, reparsed);
  assert.equal(reparsedSource.entry.parserVersion, JSON_CONFIG_PARSER_VERSION);

  const warm = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
  });
  assert.equal(warm.ok, true, JSON.stringify(warm));
  assert.equal(warm.snapshotDigest, reparsed.snapshotDigest);
  assert.equal(warm.counts.parsed, 0);
  assert.equal(warm.counts.reused, 1);
});

test("dense minified JSON parsing has a bounded offset-free evidence path", { timeout: 10_000 }, async () => {
  const parserSource = await fs.readFile(
    new URL("../knowledge-graph/parsers.mjs", import.meta.url),
    "utf8",
  );
  const jsonParserStart = parserSource.indexOf("function parseJsonConfigSource");
  const jsonParserEnd = parserSource.indexOf("function parseStructuralConfigSource");
  assert.ok(jsonParserStart >= 0 && jsonParserEnd > jsonParserStart);
  const jsonParserSource = parserSource.slice(jsonParserStart, jsonParserEnd);
  assert.match(jsonParserSource, /getLineAndCharacterOfPosition/);
  assert.doesNotMatch(jsonParserSource, /startOffset\s*:/);
  assert.doesNotMatch(jsonParserSource, /endOffset\s*:/);

  const propertyCount = 60_000;
  const jsonText = `{${Array.from(
    { length: propertyCount },
    (_, index) => `"generated_setting_${String(index).padStart(5, "0")}_padding":${index}`,
  ).join(",")}}`;
  const source = {
    relativePath: "dist/generated-config.json",
    text: jsonText,
    contentHash: sha256(jsonText),
    byteSize: Buffer.byteLength(jsonText),
    kind: "json-config",
    status: "ready",
    diagnostics: [],
  };
  assert.ok(source.byteSize > 2_000_000);
  const startedAt = performance.now();
  const fragment = await parseKnowledgeSource(source);
  const elapsedMs = performance.now() - startedAt;
  assert.ok(elapsedMs < 5_000, `dense JSON parse took ${elapsedMs.toFixed(1)}ms`);
  assert.equal(fragment.parserVersion, JSON_CONFIG_PARSER_VERSION);
  assert.equal(fragment.nodes.length, propertyCount + 1);
  assert.equal(fragment.edges.length, propertyCount);
  const lastNode = fragment.nodes.find(
    (node) => node.label === "generated_setting_59999_padding",
  );
  const lastEdge = fragment.edges.find((edge) => edge.target === lastNode.id);
  assert.equal(lastEdge.properties["evidence:lineStart"], 1);
  assert.equal(lastEdge.properties["evidence:lineEnd"], 1);
  assert.equal(
    lastEdge.properties["evidence:excerpt"],
    '"generated_setting_59999_padding": <omitted>',
  );
  assert.equal(
    lastEdge.properties["evidence:excerptHash"],
    sha256('"generated_setting_59999_padding": <omitted>'),
  );

  await assert.rejects(
    parseKnowledgeSource(source, { maxParserRecords: 4 }),
    (error) => {
      assert.equal(error?.code, "parser_record_limit_exceeded");
      assert.equal(error?.details?.attemptedRecords, 5);
      assert.equal(error?.details?.stage, "json.property-edges");
      return true;
    },
  );
});
