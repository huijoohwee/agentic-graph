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
import { queryKnowledgeGraph } from "../knowledge-graph/query-core.mjs";
import { createKnowledgeGraphRuntime } from "../knowledge-graph/runtime.mjs";
import {
  readKnowledgeGraphRepositoryIndex,
  readKnowledgeGraphSnapshot,
  readKnowledgeGraphSourceShard,
  writeKnowledgeGraphSnapshotAtomic,
  writeKnowledgeGraphSourceShard,
} from "../knowledge-graph/store.mjs";

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-kg-json-evidence-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(base, "output");
  await fs.mkdir(corpusRoot, { recursive: true });
  const runtime = createKnowledgeGraphRuntime({
    agenticgraphRoot: base,
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

const sourceOffset = (text, line, column) => (
  text.split("\n").slice(0, line - 1).reduce(
    (offset, value) => offset + value.length + 1,
    0,
  ) + column - 1
);

const exactEvidenceSlice = (text, edge) => {
  const properties = edge.properties;
  return text.slice(
    sourceOffset(
      text,
      properties["evidence:lineStart"],
      properties["evidence:columnStart"],
    ),
    sourceOffset(
      text,
      properties["evidence:lineEnd"],
      properties["evidence:columnEnd"],
    ),
  );
};

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
  assert.match(current.entry.parserVersion, /^1\.3\.0\+typescript-/);

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

  const priorVersion = JSON_CONFIG_PARSER_VERSION.replace(/^1\.3\.0/, "1.2.0");
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

test("oversized JSON arrays use deterministic explained AST ranges", { timeout: 15_000 }, async () => {
  const itemCount = 10_001;
  const jsonText = `[${Array.from(
    { length: itemCount },
    (_, index) => `{"id":${index},"city":"city_${index}","iata":"${index === 0 ? "SIN" : "NONE"}","region":"${index === 1 ? "Wisconsin" : "NONE"}","apiToken":"secret_${index}","a":1,"b":2,"c":3,"d":4,"e":5,"f":6,"g":7,"h":8,"i":9}`,
  ).join(",")}]`;
  const source = {
    relativePath: "test-data/large-array.json",
    text: jsonText,
    contentHash: sha256(jsonText),
    byteSize: Buffer.byteLength(jsonText),
    kind: "json-config",
    status: "ready",
    diagnostics: [],
  };
  const first = await parseKnowledgeSource(source);
  const second = await parseKnowledgeSource(source);

  assert.deepEqual(second, first);
  assert.equal(first.status, "parsed");
  assert.equal(first.nodes.filter((node) => node.type === "SourceFile").length, 1);
  const ranges = first.nodes.filter((node) => node.type === "ConfigItemRange");
  assert.equal(ranges.length, Math.ceil(itemCount / 1_000));
  assert.equal(
    ranges.reduce((count, node) => count + node.properties["config:itemCount"], 0),
    itemCount,
  );
  assert.deepEqual(
    ranges.map((node) => [
      node.properties["config:itemStart"],
      node.properties["config:itemEnd"],
    ]),
    Array.from({ length: ranges.length }, (_, index) => [
      index * 1_000,
      Math.min(itemCount - 1, ((index + 1) * 1_000) - 1),
    ]),
  );
  assert.ok(ranges.every((node) => (
    node.properties["config:representation"] === "deterministic-ast-range"
    && node.properties["config:redacted"] === true
    && /^[0-9a-f]{64}$/u.test(node.properties["config:integrityDigest"])
    && node.properties["config:subtreeDigest"] === undefined
  )));
  const rangeEdges = first.edges.filter((edge) => edge.label === "hasConfigItemRange");
  assert.equal(rangeEdges.length, ranges.length);
  assert.ok(rangeEdges.every((edge) => (
    edge.label === "hasConfigItemRange"
    && edge.properties["evidence:ruleId"] === "json.array-range.ast"
    && edge.properties["evidence:explanation"].includes("redacted sensitive value")
    && /^[0-9a-f]{64}$/u.test(edge.properties["evidence:sourceDigest"])
  )));
  const searchChunks = first.nodes.filter((node) => node.type === "ConfigSearchChunk");
  const searchText = searchChunks.map(
    (node) => node.properties["config:searchText"],
  ).join(" ");
  assert.ok(searchChunks.length > 0);
  assert.match(searchText, /city_10000/u);
  assert.match(searchText, /apiToken/u);
  assert.doesNotMatch(searchText, /secret_0|secret_10000/u);
  assert.equal(
    first.edges.filter((edge) => edge.label === "indexesConfigTokens").length,
    searchChunks.length,
  );
  for (const edge of first.edges.filter(
    (candidate) => candidate.label === "indexesConfigTokens",
  )) {
    assert.equal(
      edge.properties["evidence:excerpt"],
      exactEvidenceSlice(jsonText, edge),
    );
    assert.ok(edge.properties["evidence:excerpt"].length <= 280);
    assert.doesNotMatch(edge.properties["evidence:excerpt"], /secret_[0-9]+/u);
  }
  const shortTokenSearch = queryKnowledgeGraph({
    ...first,
    metadata: { knowledgeGraph: { digest: sha256("short-token") } },
  }, {
    mode: "search",
    query: "SIN",
  });
  assert.equal(shortTokenSearch.results.nodes.length, 1);
  assert.equal(shortTokenSearch.results.edges.length, 1);
  assert.equal(shortTokenSearch.citations.length, 1);
  assert.match(shortTokenSearch.citations[0].excerpt, /\bSIN\b/u);

  const objectText = `{${Array.from(
    { length: itemCount },
    (_, index) => `"item_${index}":{"a":1,"b":2,"c":3,"d":4,"e":5,"f":6,"g":7,"h":8,"i":9}`,
  ).join(",")}}`;
  const objectSource = {
    ...source,
    relativePath: "test-data/large-object.json",
    text: objectText,
    contentHash: sha256(objectText),
    byteSize: Buffer.byteLength(objectText),
  };
  const objectFragment = await parseKnowledgeSource(objectSource);
  const propertyRanges = objectFragment.nodes.filter(
    (node) => node.type === "ConfigKeyRange",
  );
  assert.equal(propertyRanges.length, Math.ceil(itemCount / 1_000));
  assert.equal(
    propertyRanges.reduce(
      (count, node) => count + node.properties["config:propertyCount"],
      0,
    ),
    itemCount,
  );
  const propertyRangeEdges = objectFragment.edges.filter(
    (edge) => edge.label === "hasConfigKeyRange",
  );
  assert.equal(propertyRangeEdges.length, propertyRanges.length);
  assert.ok(propertyRangeEdges.every((edge) => (
    edge.label === "hasConfigKeyRange"
    && edge.properties["evidence:ruleId"] === "json.object-range.ast"
    && edge.properties["evidence:explanation"].includes("exact local subtree")
  )));
  assert.match(
    objectFragment.nodes
      .filter((node) => node.type === "ConfigSearchChunk")
      .map((node) => node.properties["config:searchText"])
      .join(" "),
    /item_10000/u,
  );

  const rangedParentText = `{"target":${objectText},${Array.from(
    { length: itemCount - 1 },
    (_, index) => `"padding_${index}":${index}`,
  ).join(",")}}`;
  const rangedParentFragment = await parseKnowledgeSource({
    ...source,
    relativePath: "test-data/ranged-parent-nested-object.json",
    text: rangedParentText,
    contentHash: sha256(rangedParentText),
    byteSize: Buffer.byteLength(rangedParentText),
  });
  const rangedParentIds = new Set(rangedParentFragment.nodes
    .filter((node) => node.type === "ConfigKeyRange"
      && node.properties["config:keyPath"].startsWith("[properties:"))
    .map((node) => node.id));
  const rangedTarget = rangedParentFragment.nodes.find(
    (node) => node.type === "ConfigKey"
      && node.properties["config:keyPath"] === "target",
  );
  assert.ok(rangedTarget);
  const rangedTargetEdge = rangedParentFragment.edges.find(
    (edge) => edge.label === "hasConfigKey" && edge.target === rangedTarget.id,
  );
  assert.ok(rangedParentIds.has(rangedTargetEdge.source));
  assert.ok(rangedParentFragment.edges.some((edge) => (
    edge.source === rangedTarget.id
    && edge.label === "hasConfigKeyRange"
  )));

  const nestedText = [
    `{"root":${objectText},`,
    "// apiToken: commentsecret",
    '"password":{"apiToken":"low-entropy-secret"},',
    "/* privateKey: blocksecret */",
    '"api":{"key":"lowentropy"},"private":{"key":"secondsecret"}}',
    "// token: trailingsecret",
  ].join("\n");
  const nestedFragment = await parseKnowledgeSource({
    ...source,
    relativePath: "test-data/large-nested-object.json",
    text: nestedText,
    contentHash: sha256(nestedText),
    byteSize: Buffer.byteLength(nestedText),
  });
  const nestedRoot = nestedFragment.nodes.find(
    (node) => node.type === "ConfigKey" && node.properties["config:keyPath"] === "root",
  );
  assert.ok(nestedRoot);
  const nestedRanges = nestedFragment.nodes.filter(
    (node) => node.type === "ConfigKeyRange"
      && node.properties["config:keyPath"].startsWith("root.[properties:"),
  );
  assert.equal(nestedRanges.length, Math.ceil(itemCount / 1_000));
  const nestedRangeIds = new Set(nestedRanges.map((node) => node.id));
  assert.ok(nestedFragment.edges.some((edge) => (
    edge.source === nestedRoot.id
    && nestedRangeIds.has(edge.target)
    && edge.label === "hasConfigKeyRange"
  )));
  const itemSearchChunk = nestedFragment.nodes.find(
    (node) => node.type === "ConfigSearchChunk"
      && node.properties["config:searchText"].includes("item_10000"),
  );
  assert.ok(itemSearchChunk);
  const itemSearchEdge = nestedFragment.edges.find(
    (edge) => edge.label === "indexesConfigTokens" && edge.target === itemSearchChunk.id,
  );
  assert.ok(itemSearchEdge);
  assert.ok(nestedRangeIds.has(itemSearchEdge.source));
  for (const edge of nestedFragment.edges.filter(
    (candidate) => candidate.label === "indexesConfigTokens",
  )) {
    assert.equal(
      edge.properties["evidence:excerpt"],
      exactEvidenceSlice(nestedText, edge),
    );
    assert.ok(edge.properties["evidence:excerpt"].length <= 280);
    assert.doesNotMatch(
      edge.properties["evidence:excerpt"],
      /low-entropy-secret|lowentropy|secondsecret|commentsecret|blocksecret|trailingsecret/u,
    );
  }
  const nestedSearch = queryKnowledgeGraph({
    ...nestedFragment,
    metadata: { knowledgeGraph: { digest: sha256("nested") } },
  }, {
    mode: "search",
    query: "item_10000",
  });
  assert.ok(nestedSearch.results.nodes.length > 0);
  assert.ok(nestedSearch.results.edges.length > 0);
  assert.ok(nestedSearch.citations.some((citation) => (
    citation.excerpt.includes("item_10000")
  )));
  const secretSearch = queryKnowledgeGraph({
    ...nestedFragment,
    metadata: { knowledgeGraph: { digest: sha256("nested") } },
  }, {
    mode: "search",
    query: "low-entropy-secret",
  });
  assert.equal(secretSearch.results.nodes.length, 0);
  assert.equal(secretSearch.results.edges.length, 0);
  for (const secret of [
    "lowentropy",
    "secondsecret",
    "commentsecret",
    "blocksecret",
    "trailingsecret",
  ]) {
    const result = queryKnowledgeGraph({
      ...nestedFragment,
      metadata: { knowledgeGraph: { digest: sha256("nested") } },
    }, {
      mode: "search",
      query: secret,
    });
    assert.equal(result.results.nodes.length, 0);
    assert.equal(result.results.edges.length, 0);
  }
  const passwordNode = nestedFragment.nodes.find(
    (node) => node.type === "ConfigKey" && node.properties["config:key"] === "password",
  );
  assert.equal(passwordNode.properties["config:redacted"], true);
  assert.match(passwordNode.properties["config:integrityDigest"], /^[0-9a-f]{64}$/u);
  assert.equal(passwordNode.properties["config:subtreeDigest"], undefined);
  for (const key of ["api", "private"]) {
    const redacted = nestedFragment.nodes.find(
      (node) => node.type === "ConfigKey" && node.properties["config:key"] === key,
    );
    assert.equal(redacted.properties["config:redacted"], true);
    assert.equal(redacted.properties["config:subtreeDigest"], undefined);
  }
});

test("large JSON AST construction is isolated and abortable", { timeout: 10_000 }, async () => {
  const assertPromptAbort = async (relativePath, jsonText) => {
    const source = {
      relativePath,
      text: jsonText,
      contentHash: sha256(jsonText),
      byteSize: Buffer.byteLength(jsonText),
      kind: "json-config",
      status: "ready",
      diagnostics: [],
    };
    const controller = new AbortController();
    const startedAt = performance.now();
    const parsing = parseKnowledgeSource(source, { abortSignal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(
      parsing,
      (error) => error?.code === "aborted",
    );
    assert.ok(
      performance.now() - startedAt < 1_000,
      "isolated JSON parser did not honor cancellation promptly",
    );
  };
  await assertPromptAbort(
    "test-data/abortable-large.json",
    `{"payload":"${"x".repeat(5 * 1024 * 1024)}"}`,
  );
  await assertPromptAbort(
    "test-data/abortable-dense.json",
    `[${Array.from({ length: 200_000 }, () => "0").join(",")}]`,
  );
  await assertPromptAbort(
    "test-data/abortable-malformed-dense.json",
    "{".repeat(200_000),
  );
});
