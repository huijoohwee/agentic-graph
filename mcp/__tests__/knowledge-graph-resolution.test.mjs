import assert from "node:assert/strict";
import test from "node:test";

import { sha256 } from "../knowledge-graph/contract.mjs";
import { buildRepositoryScopedResolutionEdges } from "../knowledge-graph/resolution.mjs";

const repositoryId = "repository:fixture";
const repositoryPath = ".";

function source(relativePath) {
  return {
    relativePath,
    contentHash: sha256(relativePath),
    repositoryId,
    repositoryPath,
  };
}

function sourceNode(relativePath) {
  return {
    id: `source:${relativePath}`,
    type: "SourceFile",
    label: relativePath,
    properties: { "corpus:sourcePath": relativePath },
  };
}

function premiseEdge(id, dependencyId, lineStart, targetReads) {
  return {
    id,
    source: "source:premise",
    get target() {
      targetReads.count += 1;
      return dependencyId;
    },
    label: "imports",
    properties: {
      "evidence:lineStart": lineStart,
      "evidence:lineEnd": lineStart,
      "evidence:columnStart": 1,
      "evidence:columnEnd": 2,
      "evidence:excerpt": `line ${lineStart}`,
    },
  };
}

function resolutionFixture(importCount = 32) {
  const targetReads = { count: 0 };
  const sources = [source("src/target.ts")];
  const fragments = new Map([
    ["src/target.ts", { nodes: [sourceNode("src/target.ts")], edges: [] }],
  ]);
  for (let index = 0; index < importCount; index += 1) {
    const relativePath = `src/importer-${String(index).padStart(2, "0")}.ts`;
    const dependencyId = `dependency:${index}`;
    sources.push(source(relativePath));
    const edges = [premiseEdge(`premise:${index}:z`, dependencyId, 9, targetReads)];
    if (index === 0) edges.push(premiseEdge("premise:0:a", dependencyId, 2, targetReads));
    fragments.set(relativePath, {
      nodes: [
        sourceNode(relativePath),
        {
          id: dependencyId,
          type: "CodeDependency",
          label: "./target",
          properties: {
            "code:module": "./target",
            "corpus:sourcePath": relativePath,
          },
        },
      ],
      edges,
    });
  }
  return { fragments, sources, targetReads };
}

test("repository resolution indexes premise targets once and preserves stable premise evidence", () => {
  const fixture = resolutionFixture();
  const resolved = buildRepositoryScopedResolutionEdges(fixture.sources, fixture.fragments);
  const edges = resolved.get(repositoryId);
  assert.equal(edges.length, 32);
  assert.ok(fixture.targetReads.count <= 32 * 4, `target read ${fixture.targetReads.count} times`);
  const first = edges.find((edge) => edge.source === "dependency:0");
  assert.equal(first.properties["evidence:lineStart"], 2);
  assert.deepEqual(first.properties["evidence:premiseEdgeIds"], ["premise:0:a", "premise:0:z"]);
});

test("repository resolution applies one shared derived-edge cap", () => {
  const fixture = resolutionFixture(2);
  assert.throws(
    () => buildRepositoryScopedResolutionEdges(fixture.sources, fixture.fragments, { maxEdges: 1 }),
    (error) => error?.code === "resolution_edge_limit_exceeded"
      && error?.details?.maxEdges === 1,
  );
});

test("ambiguous SQL resolution bounds candidate evidence and derived bytes", () => {
  const candidateCount = 1_000;
  const relativePath = "schema.sql";
  const referenceId = "sql-reference:shared";
  const tables = Array.from({ length: candidateCount }, (_, index) => ({
    id: `sql-table:${String(index).padStart(4, "0")}`,
    type: "SqlTable",
    label: `schema_${index}.shared`,
    properties: {
      "corpus:sourcePath": relativePath,
      "sql:qualifiedName": `schema_${index}.shared`,
    },
  }));
  const sources = [source(relativePath)];
  const fragments = new Map([[
    relativePath,
    {
      nodes: [
        sourceNode(relativePath),
        ...tables,
        {
          id: referenceId,
          type: "SqlTableReference",
          label: "shared",
          properties: {
            "corpus:sourcePath": relativePath,
            "sql:qualifiedName": "shared",
          },
        },
      ],
      edges: [],
    },
  ]]);
  const resolved = buildRepositoryScopedResolutionEdges(sources, fragments, {
    maxResolutionBytes: 32_000_000,
    maxResolutionRecords: 2_000,
  });
  const edges = resolved.get(repositoryId);
  assert.equal(edges.length, candidateCount);
  for (const edge of edges) {
    assert.equal(edge.properties["evidence:candidateCount"], candidateCount);
    assert.ok(edge.properties["evidence:candidateIds"].length <= 64);
    assert.ok(edge.properties["evidence:candidateIds"].includes(edge.target));
  }

  assert.throws(
    () => buildRepositoryScopedResolutionEdges(sources, fragments, {
      maxResolutionBytes: 1_000,
      maxResolutionRecords: 2_000,
    }),
    (error) => error?.code === "resolution_byte_limit_exceeded"
      && error?.details?.recordKind === "derived-edge",
  );
});
