import assert from "node:assert/strict";
import test from "node:test";

import { projectAgentGraphSnapshot } from "../agent-graph/query.mjs";

const CONTEXT = "agentic-graph-agent-graph-projection";

function graphBytes(nodes, edges) {
  return Buffer.byteLength(JSON.stringify({
    context: CONTEXT,
    type: "Graph",
    nodes,
    edges,
  }));
}

function projectionFixture() {
  const nodes = ["a", "b", "c", "d"].map((suffix) => ({
    id: `node:${suffix}`,
    label: `Node ${suffix}`,
    type: "Symbol",
    properties: { payload: "node-payload".repeat(100) },
  }));
  const edges = [
    ["edge:a-b", "node:a", "node:b"],
    ["edge:c-d", "node:c", "node:d"],
  ].map(([id, source, target]) => ({
    id,
    source,
    target,
    label: "depends_on",
    properties: { evidence: "edge-evidence".repeat(100) },
  }));
  return { nodes, edges };
}

function iterableSnapshotShards(nodes, edges) {
  return async function* () {
    yield {
      repository: { repositoryId: "repository:projection-fixture" },
      shard: { nodes, edges },
    };
  };
}

test("snapshot projection deterministically fits byte-bounded records with endpoint closure", async () => {
  const { nodes, edges } = projectionFixture();
  const oneEdgeBytes = graphBytes(nodes, edges.slice(0, 1));
  const fullBytes = graphBytes(nodes, edges);
  const projectionByteLimit = Math.floor((oneEdgeBytes + fullBytes) / 2);
  const snapshot = {
    pointer: { snapshotDigest: "a".repeat(64) },
    manifest: {
      graph: { nodes: nodes.length, edges: edges.length },
      completeness: { complete: true },
      admission: { complete: true },
    },
  };

  assert.ok(oneEdgeBytes <= projectionByteLimit && projectionByteLimit < fullBytes);
  const forward = await projectAgentGraphSnapshot(snapshot, 10, {
    projectionByteLimit,
    iterateSnapshotShards: iterableSnapshotShards(nodes, edges),
  });
  const reverse = await projectAgentGraphSnapshot(snapshot, 10, {
    projectionByteLimit,
    iterateSnapshotShards: iterableSnapshotShards([...nodes].reverse(), [...edges].reverse()),
  });

  assert.equal(forward.complete, false);
  assert.equal(forward.truncated, true);
  assert.equal(forward.reason, "projection_byte_limit");
  assert.ok(graphBytes(forward.graphData.nodes, forward.graphData.edges) <= projectionByteLimit);
  assert.deepEqual(reverse, forward, "projection selection must be stable across shard ordering");
  assert.deepEqual(forward.graphData.edges.map((edge) => edge.id), ["edge:a-b"]);
  const projectedNodeIds = new Set(forward.graphData.nodes.map((node) => node.id));
  for (const edge of forward.graphData.edges) {
    assert.ok(projectedNodeIds.has(edge.source));
    assert.ok(projectedNodeIds.has(edge.target));
  }
});
