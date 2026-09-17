/** Pure deterministic traversal shared by local queries and browser inspection. */
const compareStableStrings = (a, b) => a < b ? -1 : a > b ? 1 : 0;

const allowedEdge = (edge, edgeLabels) => (
  !edgeLabels || edgeLabels.has(String(edge.label || ""))
);

function nextStep(edge, currentNodeId, direction) {
  if ((direction === "outgoing" || direction === "both") && edge.source === currentNodeId) return edge.target;
  if ((direction === "incoming" || direction === "both") && edge.target === currentNodeId) return edge.source;
  return "";
}

function adjacencyFor(access, direction, edgeLabels, checkpoint) {
  const adjacency = new Map();
  for (const edge of access.edges) {
    checkpoint();
    if (!allowedEdge(edge, edgeLabels)) continue;
    if (direction === "outgoing" || direction === "both") {
      const outgoing = adjacency.get(edge.source);
      if (outgoing) outgoing.push(edge);
      else adjacency.set(edge.source, [edge]);
    }
    if (direction === "incoming" || direction === "both") {
      const incoming = adjacency.get(edge.target);
      if (incoming) incoming.push(edge);
      else adjacency.set(edge.target, [edge]);
    }
  }
  for (const list of adjacency.values()) {
    checkpoint();
    list.sort((left, right) => (checkpoint(), compareStableStrings(left.id, right.id)));
  }
  return adjacency;
}

export function shortestPath(access, startNodeId, targetNodeId, {
  direction,
  edgeLabels,
  maxDepth,
  checkpoint = () => {},
}) {
  const adjacency = adjacencyFor(access, direction, edgeLabels, checkpoint);
  const queue = [{ nodeId: startNodeId, nodeIds: [startNodeId], edgeIds: [] }];
  const visited = new Set([startNodeId]);
  let depthLimited = false;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    checkpoint();
    const current = queue[cursor];
    if (current.nodeId === targetNodeId) return { path: current, depthLimited: false };
    if (current.edgeIds.length >= maxDepth) {
      if ((adjacency.get(current.nodeId) || []).some((edge) => {
        checkpoint();
        const nextNodeId = nextStep(edge, current.nodeId, direction);
        return nextNodeId && !visited.has(nextNodeId);
      })) depthLimited = true;
      continue;
    }
    for (const edge of adjacency.get(current.nodeId) || []) {
      checkpoint();
      const nextNodeId = nextStep(edge, current.nodeId, direction);
      if (!nextNodeId || visited.has(nextNodeId)) continue;
      visited.add(nextNodeId);
      queue.push({
        nodeId: nextNodeId,
        nodeIds: [...current.nodeIds, nextNodeId],
        edgeIds: [...current.edgeIds, edge.id],
      });
    }
  }
  return { path: null, depthLimited };
}

export function traverseNeighborhood(access, startNodeId, {
  direction,
  edgeLabels,
  maxDepth,
  limit,
  checkpoint = () => {},
}) {
  const adjacency = adjacencyFor(access, direction, edgeLabels, checkpoint);
  const nodeIds = new Set([startNodeId]);
  const depths = Object.create(null);
  depths[startNodeId] = 0;
  const edgeIds = [];
  const seenEdgeIds = new Set();
  const queue = [{ nodeId: startNodeId, depth: 0 }];
  let depthLimited = false;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    checkpoint();
    const current = queue[cursor];
    if (current.depth >= maxDepth) {
      if ((adjacency.get(current.nodeId) || []).some((edge) => (
        checkpoint(), !seenEdgeIds.has(edge.id)
      ))) depthLimited = true;
      continue;
    }
    for (const edge of adjacency.get(current.nodeId) || []) {
      checkpoint();
      if (seenEdgeIds.has(edge.id)) continue;
      if (edgeIds.length >= limit) {
        return { nodeIds: [...nodeIds], edgeIds, depths, limitTruncated: true, depthLimited };
      }
      seenEdgeIds.add(edge.id);
      edgeIds.push(edge.id);
      const nextNodeId = nextStep(edge, current.nodeId, direction);
      if (nextNodeId && !nodeIds.has(nextNodeId)) {
        nodeIds.add(nextNodeId);
        depths[nextNodeId] = current.depth + 1;
        queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
      }
    }
  }
  return { nodeIds: [...nodeIds], edgeIds, depths, limitTruncated: false, depthLimited };
}

