import assert from "node:assert/strict";
import test from "node:test";

import { projectAgentGraphSnapshot } from "../agent-graph/query.mjs";
import { AGENT_GRAPH_INPUT_SCHEMAS } from "../agent-graph-tool-contract.js";
import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES, buildAgenticGraphLocalMcpToolDefinitions } from "../local-tool-contract.js";
import { normalizeGraphNeighborsRequest } from "../../canvas/src/features/observability-workspace/host.mjs";
import { createFixture, ingestFixture, materializeFixture } from "./agent-graph-runtime-test-support.mjs";

const node = id => ({ id: `node:${id}`, label: id, type: "Symbol", properties: {} });
const edge = (id, source, target) => ({ id: `edge:${id}`, source: `node:${source}`, target: `node:${target}`, label: "links", properties: {} });

test("native codebase projection starts from highly connected nodes and closes visible relationships", async () => {
  const nodes = [node("a"), node("b"), node("c"), node("z")];
  const edges = [edge("za", "z", "a"), edge("zb", "z", "b"), edge("zc", "z", "c"), edge("ab", "a", "b")];
  const snapshot = { pointer: { snapshotDigest: "a".repeat(64) }, manifest: {
    graph: { nodes: nodes.length, edges: edges.length }, completeness: { complete: true },
  } };
  const projection = await projectAgentGraphSnapshot(snapshot, 3, {
    projectionByteLimit: 450_000,
    iterateSnapshotShards: async function* () { yield { repository: { repositoryId: "repository:test" }, shard: { nodes, edges } }; },
  });
  const ids = new Set(projection.graphData.nodes.map(item => item.id));
  assert.ok(ids.has("node:z"), "the high-degree node wins over the lexically earlier isolated ordering");
  assert.equal(projection.graphData.nodes.length, 3);
  assert.ok(projection.graphData.edges.length >= 2);
  assert.ok(projection.graphData.edges.every(item => ids.has(item.source) && ids.has(item.target)));
  assert.equal(projection.truncated, true);
  const tightBytes = Buffer.byteLength(JSON.stringify({ context: "agentic-graph-agent-graph-projection", type: "Graph",
    nodes: [node("z"), node("a")], edges: [edge("za", "z", "a")] }));
  const tight = await projectAgentGraphSnapshot(snapshot, 3, {
    projectionByteLimit: tightBytes,
    iterateSnapshotShards: async function* () { yield { repository: { repositoryId: "repository:test" }, shard: { nodes, edges } }; },
  });
  assert.deepEqual(new Set(tight.graphData.nodes.map(item => item.id)), new Set(["node:z", "node:a"]));
  assert.deepEqual(tight.graphData.edges.map(item => item.id), ["edge:za"]);
  assert.equal(tight.reason, "projection_byte_limit");
});

test("connected-first projection grows around its strongest hub before adding another component", async () => {
  const nodes = [node("main"), ...Array.from({ length: 6 }, (_, index) => node(`main-leaf-${index}`)),
    node("side"), ...Array.from({ length: 4 }, (_, index) => node(`side-leaf-${index}`))];
  const edges = [...Array.from({ length: 6 }, (_, index) => edge(`main-${index}`, "main", `main-leaf-${index}`)),
    ...Array.from({ length: 4 }, (_, index) => edge(`side-${index}`, "side", `side-leaf-${index}`))];
  const snapshot = { pointer: { snapshotDigest: "b".repeat(64) }, manifest: {
    graph: { nodes: nodes.length, edges: edges.length }, completeness: { complete: true },
  } };
  const projection = await projectAgentGraphSnapshot(snapshot, 5, {
    projectionByteLimit: 450_000,
    iterateSnapshotShards: async function* () { yield { repository: { repositoryId: "repository:test" }, shard: { nodes, edges } }; },
  });
  assert.deepEqual(new Set(projection.graphData.nodes.map(item => item.id)), new Set([
    "node:main", "node:main-leaf-0", "node:main-leaf-1", "node:main-leaf-2", "node:main-leaf-3",
  ]));
  assert.equal(projection.graphData.edges.length, 4);
});

test("ingest applies the requested byte ceiling to its initial graph projection", async t => {
  const fixture = await createFixture(t);
  const byteLimit = 8_000;
  const result = await ingestFixture(fixture, { projectionLimit: 1_000, projectionByteLimit: byteLimit });
  assert.ok(Buffer.byteLength(JSON.stringify(result.projection.graphData)) <= byteLimit);
  assert.equal(result.projection.reason, "projection_byte_limit");
  assert.ok(result.projection.graphData.nodes.length > 0);
});

test("one-hop neighbor cursors load a connected node's remaining edges without duplicate pages", async t => {
  const fixture = await createFixture(t);
  const ingest = await ingestFixture(fixture, { projectionLimit: 4 });
  const graph = await materializeFixture(fixture, ingest);
  const degree = new Map();
  for (const item of graph.edges) for (const id of [item.source, item.target]) degree.set(id, (degree.get(id) || 0) + 1);
  const start = [...degree].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  assert.ok(start && start[1] > 1);
  const expected = graph.edges.filter(item => item.source === start[0] || item.target === start[0]).map(item => item.id).sort();
  const request = { graphId: ingest.graphId, expectedSnapshotDigest: ingest.snapshotDigest, mode: "neighbors", from: start[0], maxDepth: 1, limit: 1 };
  const found = [];
  let afterEdgeId;
  for (let page = 0; page < expected.length + 1; page++) {
    const result = await fixture.runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.agentGraphQuery, { ...request, ...(afterEdgeId ? { afterEdgeId } : {}) });
    assert.equal(result.ok, true, JSON.stringify(result));
    found.push(...result.traversal.edgeIds);
    afterEdgeId = result.traversal.nextCursor ?? undefined;
    if (!afterEdgeId) break;
  }
  assert.deepEqual(found.sort(), expected);
  assert.equal(new Set(found).size, found.length);
  const stale = await fixture.runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.agentGraphQuery, {
    ...request, afterEdgeId: "not-an-edge", expectedSnapshotDigest: "0".repeat(64),
  });
  assert.equal(stale.ok, false);
});

test("expansion endpoint binds a small cursor query to a native snapshot and rejects extra fields", () => {
  const request = normalizeGraphNeighborsRequest({ graphId: `kg:graph:${"a".repeat(32)}`,
    snapshotDigest: "b".repeat(64), from: "symbol:one", afterEdgeId: "edge:previous", limit: 24 });
  assert.deepEqual(request, { graphId: `kg:graph:${"a".repeat(32)}`, expectedSnapshotDigest: "b".repeat(64),
    mode: "neighbors", from: "symbol:one", direction: "both", maxDepth: 1, limit: 24, maxDurationMs: 15000,
    afterEdgeId: "edge:previous" });
  assert.throws(() => normalizeGraphNeighborsRequest({ ...request, rootPath: "/tmp/source" }), /Invalid graph-neighbors request/);
  const query = buildAgenticGraphLocalMcpToolDefinitions().find(tool => tool.name === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.agentGraphQuery);
  assert.equal(query.inputSchema.properties.afterEdgeId.maxLength, 1024);
  assert.equal(AGENT_GRAPH_INPUT_SCHEMAS.ingest.properties.projectionByteLimit.maximum, 2 * 1024 * 1024);
});
