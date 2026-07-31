import assert from "node:assert/strict";
import test from "node:test";

import {
  makeEdge,
  makeNode,
  sha256,
} from "../knowledge-graph/contract.mjs";
import { queryKnowledgeGraphSnapshot } from "../knowledge-graph/query.mjs";

const NODE_COUNT = 250_001;
const BATCH_SIZE = 4_096;
const REPOSITORY_ID = "repo:large-streaming-query";
const SOURCE_PATH = "fixtures/large-graph.json";
const SOURCE_DIGEST = sha256("large graph traversal fixture");
const SNAPSHOT_DIGEST = sha256("large graph traversal snapshot");

const startNode = makeNode({
  id: "node:start",
  label: "Start",
  type: "FixtureNode",
  sourcePath: SOURCE_PATH,
});
const middleNode = makeNode({
  id: "node:middle",
  label: "Middle",
  type: "FixtureNode",
  sourcePath: SOURCE_PATH,
});
const targetNode = makeNode({
  id: "node:target",
  label: "Target",
  type: "FixtureNode",
  sourcePath: SOURCE_PATH,
});

const fixtureEvidence = (excerpt) => ({
  kind: "extracted",
  ruleId: "fixture.large-streaming-query",
  explanation: "Fixture edge deterministically records a local graph relationship.",
  parserId: "fixture.large-streaming-query",
  parserVersion: "1",
  sourcePath: SOURCE_PATH,
  sourceDigest: SOURCE_DIGEST,
  lineStart: 1,
  lineEnd: 1,
  columnStart: 1,
  columnEnd: excerpt.length,
  excerpt,
  confidence: "high",
  certainty: "exact",
  premiseEdgeIds: ["edge:premise:streaming"],
  candidateCount: 2,
  candidateIds: ["node:candidate:beta", "node:candidate:alpha"],
});

const firstEdge = makeEdge({
  source: startNode.id,
  target: middleNode.id,
  label: "links",
  evidence: fixtureEvidence("start -> middle"),
});
const secondEdge = makeEdge({
  source: middleNode.id,
  target: targetNode.id,
  label: "links",
  evidence: fixtureEvidence("middle -> target"),
});

const repository = {
  repositoryId: REPOSITORY_ID,
  graph: { nodes: NODE_COUNT, edges: 2 },
};

const snapshot = {
  pointer: {
    graphId: "kg:graph:large-streaming-query",
    snapshotDigest: SNAPSHOT_DIGEST,
  },
  manifest: {
    graph: { nodes: NODE_COUNT, edges: 2, nodeTypes: {}, edgeLabels: { links: 2 } },
    repositories: [repository],
    sourceCount: 1,
    parserCoverage: {},
    diagnostics: [],
    admission: { complete: true },
    completeness: { complete: true, incompleteSources: [], reasons: [] },
    retrieval: { mode: "lexical-graph", vectorStore: false },
    cost: { modelCalls: 0, promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 },
  },
};

function largeShardReader() {
  const completedNodeCounts = [];
  return {
    completedNodeCounts,
    async *iterate({ repositoryId }) {
      assert.equal(repositoryId || REPOSITORY_ID, REPOSITORY_ID);
      let emittedNodes = 0;
      try {
        for (let offset = 0; offset < NODE_COUNT; offset += BATCH_SIZE) {
          const length = Math.min(BATCH_SIZE, NODE_COUNT - offset);
          const nodes = Array.from({ length }, (_, batchIndex) => {
            const index = offset + batchIndex;
            if (index === 0) return startNode;
            if (index === 1) return middleNode;
            if (index === 2) return targetNode;
            return {
              id: `node:filler:${String(index).padStart(6, "0")}`,
              label: `Filler ${index}`,
              type: "FixtureNode",
              properties: { "corpus:sourcePath": SOURCE_PATH },
            };
          });
          emittedNodes += nodes.length;
          yield {
            repository,
            shard: {
              nodes,
              edges: offset === 0 ? [secondEdge, firstEdge] : [],
            },
          };
        }
      } finally {
        completedNodeCounts.push(emittedNodes);
      }
    },
  };
}

function assertCommonResult(result) {
  assert.equal(result.snapshotDigest, SNAPSHOT_DIGEST);
  assert.deepEqual(result.retrieval, { mode: "lexical-graph", vectorStore: false });
  assert.equal(result.cost.modelCalls, 0);
  assert.equal(result.completeness.complete, true);
  assert.equal(result.completeness.truncated, false);
  for (const citation of result.citations) {
    assert.equal(citation.explanation, fixtureEvidence("").explanation);
    assert.equal(citation.sourceDigest, SOURCE_DIGEST);
    assert.match(citation.parserDigest, /^[a-f0-9]{64}$/);
    assert.deepEqual(citation.premiseEdgeIds, ["edge:premise:streaming"]);
    assert.equal(citation.candidateCount, 2);
    assert.deepEqual(citation.candidateIds, ["node:candidate:alpha", "node:candidate:beta"]);
  }
}

test("path, neighbors, and impact stream repositories above 250,000 nodes", async () => {
  const reader = largeShardReader();
  const options = { iterateSnapshotShards: reader.iterate };

  const path = await queryKnowledgeGraphSnapshot(snapshot, {
    mode: "path",
    from: startNode.id,
    to: targetNode.id,
    direction: "outgoing",
    edgeLabels: ["links"],
    maxDepth: 2,
  }, options);
  assertCommonResult(path);
  assert.equal(path.found, true);
  assert.deepEqual(path.path.nodeIds, [startNode.id, middleNode.id, targetNode.id]);
  assert.deepEqual(path.path.edgeIds, [firstEdge.id, secondEdge.id]);
  assert.deepEqual(path.path.edges.map((edge) => edge.id), [firstEdge.id, secondEdge.id]);
  assert.equal(path.completeness.reason, "shortest_path_found");

  const neighbors = await queryKnowledgeGraphSnapshot(snapshot, {
    mode: "neighbors",
    nodeId: startNode.id,
    direction: "outgoing",
    edgeLabels: ["links"],
    maxDepth: 3,
    limit: 10,
  }, options);
  assertCommonResult(neighbors);
  assert.deepEqual(neighbors.traversal.nodeIds, [startNode.id, middleNode.id, targetNode.id]);
  assert.deepEqual(neighbors.traversal.edgeIds, [firstEdge.id, secondEdge.id]);
  assert.equal(neighbors.completeness.reason, "full_neighborhood");

  const impact = await queryKnowledgeGraphSnapshot(snapshot, {
    mode: "impact",
    nodeId: targetNode.id,
    edgeLabels: ["links"],
    maxDepth: 3,
    limit: 10,
  }, options);
  assertCommonResult(impact);
  assert.equal(impact.direction, "incoming");
  assert.deepEqual(impact.traversal.nodeIds, [targetNode.id, middleNode.id, startNode.id]);
  assert.deepEqual(impact.traversal.edgeIds, [secondEdge.id, firstEdge.id]);
  assert.equal(impact.completeness.reason, "full_neighborhood");

  assert.ok(
    reader.completedNodeCounts.filter((count) => count === NODE_COUNT).length >= 3,
    "each traversal mode must complete at least one shard-streamed pass over the large graph",
  );
});

test("streamed shortest-path tie breaking is stable across shard edge order", async () => {
  const alternateNode = makeNode({
    id: "node:alternate",
    label: "Alternate",
    type: "FixtureNode",
    sourcePath: SOURCE_PATH,
  });
  const alternateFirst = makeEdge({
    source: startNode.id,
    target: alternateNode.id,
    label: "links",
    evidence: fixtureEvidence("start -> alternate"),
  });
  const alternateSecond = makeEdge({
    source: alternateNode.id,
    target: targetNode.id,
    label: "links",
    evidence: fixtureEvidence("alternate -> target"),
  });
  const nodes = [startNode, middleNode, alternateNode, targetNode];
  const edges = [firstEdge, secondEdge, alternateFirst, alternateSecond];
  let pass = 0;
  const iterateSnapshotShards = async function* () {
    pass += 1;
    yield {
      repository,
      shard: {
        nodes,
        edges: pass % 2 ? [...edges] : [...edges].reverse(),
      },
    };
  };
  const query = () => queryKnowledgeGraphSnapshot({
    ...snapshot,
    manifest: {
      ...snapshot.manifest,
      graph: { ...snapshot.manifest.graph, nodes: nodes.length, edges: edges.length },
      repositories: [{ ...repository, graph: { nodes: nodes.length, edges: edges.length } }],
    },
  }, {
    mode: "path",
    from: startNode.id,
    to: targetNode.id,
    direction: "outgoing",
    maxDepth: 2,
  }, { iterateSnapshotShards });

  const first = await query();
  const second = await query();
  assert.equal(first.found, true);
  assert.equal(second.found, true);
  assert.deepEqual(first.path.nodeIds, second.path.nodeIds);
  assert.deepEqual(first.path.edgeIds, second.path.edgeIds);
  assert.deepEqual(first.citations, second.citations);
});

test("streamed path traversal reports a typed state limit on high fanout", async () => {
  const isolatedTarget = makeNode({
    id: "node:isolated-target",
    label: "Isolated target",
    type: "FixtureNode",
    sourcePath: SOURCE_PATH,
  });
  const fanoutNodes = Array.from({ length: 8 }, (_, index) => makeNode({
    id: `node:fanout:${index}`,
    label: `Fanout ${index}`,
    type: "FixtureNode",
    sourcePath: SOURCE_PATH,
  }));
  const fanoutEdges = fanoutNodes.map((node, index) => makeEdge({
    source: startNode.id,
    target: node.id,
    label: "links",
    evidence: fixtureEvidence(`start -> fanout ${index}`),
  }));
  const nodes = [startNode, isolatedTarget, ...fanoutNodes];
  const boundedSnapshot = {
    ...snapshot,
    manifest: {
      ...snapshot.manifest,
      graph: { ...snapshot.manifest.graph, nodes: nodes.length, edges: fanoutEdges.length },
      repositories: [{
        ...repository,
        graph: { nodes: nodes.length, edges: fanoutEdges.length },
      }],
    },
  };
  const iterateSnapshotShards = async function* () {
    yield { repository, shard: { nodes, edges: fanoutEdges } };
  };
  const result = await queryKnowledgeGraphSnapshot(boundedSnapshot, {
    mode: "path",
    from: startNode.id,
    to: isolatedTarget.id,
    direction: "outgoing",
    maxDepth: 2,
    maxTraversalNodes: 4,
  }, { iterateSnapshotShards });

  assert.equal(result.found, false);
  assert.equal(result.path, null);
  assert.equal(result.completeness.complete, false);
  assert.equal(result.completeness.truncated, true);
  assert.equal(result.completeness.reason, "traversal_state_limit");
  assert.equal(result.completeness.maxTraversalNodes, 4);
});
