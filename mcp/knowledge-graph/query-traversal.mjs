import { compareStableStrings, KnowledgeGraphError } from "./contract.mjs";
import { iterateKnowledgeGraphSnapshotShards } from "./query-shards.mjs";

const boundedInteger = (value, fallback, minimum, maximum) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.floor(number))) : fallback;
};

const allowedEdge = (edge, edgeLabels) => (
  !edgeLabels || edgeLabels.has(String(edge.label || ""))
);

function frontierMatch(edge, frontierRank, direction) {
  let match = null;
  if (direction === "outgoing" || direction === "both") {
    const rank = frontierRank.get(edge.source);
    if (rank !== undefined) {
      match = { currentNodeId: edge.source, nextNodeId: edge.target, rank };
    }
  }
  if (direction === "incoming" || direction === "both") {
    const rank = frontierRank.get(edge.target);
    const incoming = rank === undefined
      ? null
      : { currentNodeId: edge.target, nextNodeId: edge.source, rank };
    if (incoming && (!match
      || incoming.rank < match.rank
      || (incoming.rank === match.rank
        && compareStableStrings(incoming.currentNodeId, match.currentNodeId) < 0)
      || (incoming.rank === match.rank
        && incoming.currentNodeId === match.currentNodeId
        && compareStableStrings(incoming.nextNodeId, match.nextNodeId) < 0))) {
      match = incoming;
    }
  }
  return match;
}

const compareTraversalCandidates = (left, right) => (
  left.rank - right.rank
  || compareStableStrings(left.edgeId, right.edgeId)
  || compareStableStrings(left.nextNodeId, right.nextNodeId)
);

function boundedBest(capacity, compare) {
  const heap = [];
  let count = 0;
  const worse = (left, right) => compare(left, right) > 0;
  const siftUp = (index) => {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!worse(heap[index], heap[parent])) break;
      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
  };
  const siftDown = (index) => {
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let worst = index;
      if (left < heap.length && worse(heap[left], heap[worst])) worst = left;
      if (right < heap.length && worse(heap[right], heap[worst])) worst = right;
      if (worst === index) break;
      [heap[index], heap[worst]] = [heap[worst], heap[index]];
      index = worst;
    }
  };
  return {
    add(entry) {
      count += 1;
      if (heap.length < capacity) {
        heap.push(entry);
        siftUp(heap.length - 1);
      } else if (capacity > 0 && compare(entry, heap[0]) < 0) {
        heap[0] = entry;
        siftDown(0);
      }
    },
    get count() {
      return count;
    },
    values() {
      return heap.sort(compare);
    },
  };
}

async function scanRepositoryEdges(snapshot, repositoryId, options, visit) {
  for await (const { shard } of iterateKnowledgeGraphSnapshotShards(snapshot, {
    ...options,
    repositoryId,
  })) {
    for (const edge of shard.edges || []) {
      options.checkpoint();
      if (visit(edge) === false) return false;
    }
  }
  return true;
}

async function hasUnvisitedStep(
  snapshot,
  repositoryId,
  frontier,
  visited,
  direction,
  edgeLabels,
  options,
) {
  const frontierRank = new Map(frontier.map((nodeId, index) => [nodeId, index]));
  let found = false;
  await scanRepositoryEdges(snapshot, repositoryId, options, (edge) => {
    if (!allowedEdge(edge, edgeLabels)) return true;
    const match = frontierMatch(edge, frontierRank, direction);
    if (match && match.nextNodeId && !visited.has(match.nextNodeId)) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

function reconstructPath(parentByNode, startNodeId, targetNodeId) {
  const nodeIds = [targetNodeId];
  const edgeIds = [];
  let current = targetNodeId;
  while (current !== startNodeId) {
    const parent = parentByNode.get(current);
    if (!parent) return null;
    nodeIds.push(parent.nodeId);
    edgeIds.push(parent.edgeId);
    current = parent.nodeId;
  }
  nodeIds.reverse();
  edgeIds.reverse();
  return { nodeIds, edgeIds };
}

async function shortestPath(snapshot, repositoryId, startNodeId, targetNodeId, config, options) {
  if (startNodeId === targetNodeId) {
    return {
      path: { nodeIds: [startNodeId], edgeIds: [] },
      depthLimited: false,
      stateLimited: false,
    };
  }
  let frontier = [startNodeId];
  const visited = new Set(frontier);
  const parentByNode = new Map();
  for (let depth = 0; depth < config.maxDepth && frontier.length; depth += 1) {
    options.checkpoint();
    const remainingState = config.maxTraversalNodes - visited.size;
    if (remainingState <= 0) {
      return { path: null, depthLimited: false, stateLimited: true };
    }
    const frontierRank = new Map(frontier.map((nodeId, index) => [nodeId, index]));
    const candidateByNode = new Map();
    let stateLimited = false;
    await scanRepositoryEdges(snapshot, repositoryId, options, (edge) => {
      if (!allowedEdge(edge, config.edgeLabels)) return;
      const match = frontierMatch(edge, frontierRank, config.direction);
      if (!match?.nextNodeId || visited.has(match.nextNodeId)) return;
      const candidate = {
        edgeId: edge.id,
        nextNodeId: match.nextNodeId,
        parentNodeId: match.currentNodeId,
        rank: match.rank,
      };
      const previous = candidateByNode.get(candidate.nextNodeId);
      if (!previous && candidateByNode.size >= remainingState) {
        stateLimited = true;
        return false;
      }
      if (!previous || compareTraversalCandidates(candidate, previous) < 0) {
        candidateByNode.set(candidate.nextNodeId, candidate);
      }
    });
    if (stateLimited) {
      return { path: null, depthLimited: false, stateLimited: true };
    }
    const candidates = [...candidateByNode.values()].sort(compareTraversalCandidates);
    frontier = [];
    for (const candidate of candidates) {
      options.checkpoint();
      if (visited.has(candidate.nextNodeId)) continue;
      visited.add(candidate.nextNodeId);
      parentByNode.set(candidate.nextNodeId, {
        nodeId: candidate.parentNodeId,
        edgeId: candidate.edgeId,
      });
      frontier.push(candidate.nextNodeId);
    }
    if (visited.has(targetNodeId)) {
      return {
        path: reconstructPath(parentByNode, startNodeId, targetNodeId),
        depthLimited: false,
        stateLimited: false,
      };
    }
  }
  const depthLimited = frontier.length > 0 && await hasUnvisitedStep(
    snapshot,
    repositoryId,
    frontier,
    visited,
    config.direction,
    config.edgeLabels,
    options,
  );
  return { path: null, depthLimited, stateLimited: false };
}

async function hasUnseenFrontierEdge(
  snapshot,
  repositoryId,
  frontier,
  seenEdgeIds,
  direction,
  edgeLabels,
  options,
) {
  const frontierRank = new Map(frontier.map((nodeId, index) => [nodeId, index]));
  let found = false;
  await scanRepositoryEdges(snapshot, repositoryId, options, (edge) => {
    if (seenEdgeIds.has(edge.id) || !allowedEdge(edge, edgeLabels)) return true;
    found = Boolean(frontierMatch(edge, frontierRank, direction));
    return found ? false : true;
  });
  return found;
}

async function traverseNeighborhood(snapshot, repositoryId, startNodeId, config, options) {
  const nodeIds = new Set([startNodeId]);
  const edgeIds = [];
  const seenEdgeIds = new Set();
  let frontier = [startNodeId];
  for (let depth = 0; depth < config.maxDepth && frontier.length; depth += 1) {
    options.checkpoint();
    const remaining = config.limit - edgeIds.length;
    if (remaining <= 0) {
      const limitTruncated = await hasUnseenFrontierEdge(
        snapshot,
        repositoryId,
        frontier,
        seenEdgeIds,
        config.direction,
        config.edgeLabels,
        options,
      );
      return { nodeIds: [...nodeIds], edgeIds, limitTruncated, depthLimited: false };
    }
    const frontierRank = new Map(frontier.map((nodeId, index) => [nodeId, index]));
    const candidates = boundedBest(remaining + 1, compareTraversalCandidates);
    await scanRepositoryEdges(snapshot, repositoryId, options, (edge) => {
      if (seenEdgeIds.has(edge.id) || !allowedEdge(edge, config.edgeLabels)) return;
      const match = frontierMatch(edge, frontierRank, config.direction);
      if (!match) return;
      candidates.add({
        edge,
        edgeId: edge.id,
        nextNodeId: match.nextNodeId,
        rank: match.rank,
      });
    });
    const selected = candidates.values().slice(0, remaining);
    const nextFrontier = [];
    for (const candidate of selected) {
      options.checkpoint();
      seenEdgeIds.add(candidate.edgeId);
      edgeIds.push(candidate.edgeId);
      if (candidate.nextNodeId && !nodeIds.has(candidate.nextNodeId)) {
        nodeIds.add(candidate.nextNodeId);
        nextFrontier.push(candidate.nextNodeId);
      }
    }
    if (candidates.count > remaining) {
      return {
        nodeIds: [...nodeIds],
        edgeIds,
        limitTruncated: true,
        depthLimited: false,
      };
    }
    frontier = nextFrontier;
  }
  const depthLimited = frontier.length > 0 && await hasUnseenFrontierEdge(
    snapshot,
    repositoryId,
    frontier,
    seenEdgeIds,
    config.direction,
    config.edgeLabels,
    options,
  );
  return { nodeIds: [...nodeIds], edgeIds, limitTruncated: false, depthLimited };
}

async function hydrateRecords(snapshot, repositoryId, nodeIds, edgeIds, options) {
  const requiredNodes = new Set(nodeIds);
  const requiredEdges = new Set(edgeIds);
  const nodeById = new Map();
  const edgeById = new Map();
  for await (const { shard } of iterateKnowledgeGraphSnapshotShards(snapshot, {
    ...options,
    repositoryId,
  })) {
    for (const node of shard.nodes || []) {
      options.checkpoint();
      if (requiredNodes.has(node.id)) nodeById.set(node.id, node);
    }
    for (const edge of shard.edges || []) {
      options.checkpoint();
      if (requiredEdges.has(edge.id)) edgeById.set(edge.id, edge);
    }
    if (nodeById.size === requiredNodes.size && edgeById.size === requiredEdges.size) break;
  }
  const missingNodeIds = nodeIds.filter((id) => !nodeById.has(id));
  const missingEdgeIds = edgeIds.filter((id) => !edgeById.has(id));
  if (missingNodeIds.length || missingEdgeIds.length) {
    throw new KnowledgeGraphError(
      "snapshot_traversal_record_missing",
      "Snapshot traversal referenced a record that is absent from its digest-fenced shards.",
      { repositoryId, missingNodeIds, missingEdgeIds },
    );
  }
  return {
    nodes: nodeIds.map((id) => nodeById.get(id)),
    edges: edgeIds.map((id) => edgeById.get(id)),
  };
}

function evidenceForEdge(edge) {
  const properties = edge?.properties || {};
  return {
    edgeId: edge.id,
    sourcePath: String(properties["evidence:sourcePath"] || ""),
    lineStart: Number(properties["evidence:lineStart"] || 1),
    lineEnd: Number(properties["evidence:lineEnd"] || properties["evidence:lineStart"] || 1),
    columnStart: Number(properties["evidence:columnStart"] || 1),
    columnEnd: Number(properties["evidence:columnEnd"] || properties["evidence:columnStart"] || 1),
    excerpt: String(properties["evidence:excerpt"] || ""),
    excerptHash: String(properties["evidence:excerptHash"] || ""),
    kind: String(properties["evidence:kind"] || ""),
    confidence: String(properties["evidence:confidence"] || ""),
    certainty: String(properties["evidence:certainty"] || ""),
    ruleId: String(properties["evidence:ruleId"] || ""),
    explanation: String(properties["evidence:explanation"] || ""),
    parserId: String(properties["evidence:parserId"] || ""),
    parserVersion: String(properties["evidence:parserVersion"] || ""),
    parserDigest: String(properties["evidence:parserDigest"] || ""),
    sourceDigest: String(properties["evidence:sourceDigest"] || ""),
    premiseEdgeIds: properties["evidence:premiseEdgeIds"] || [],
    candidateCount: properties["evidence:candidateCount"] ?? 1,
    candidateIds: properties["evidence:candidateIds"] || [],
  };
}

const baseResult = (snapshot, mode) => ({
  mode,
  snapshotDigest: snapshot.pointer.snapshotDigest,
  retrieval: snapshot.manifest.retrieval,
  cost: snapshot.manifest.cost,
});

export async function queryKnowledgeGraphSnapshotTraversal(
  snapshot,
  {
    mode,
    repositoryId,
    start,
    target,
    args,
  },
  options,
) {
  const limit = boundedInteger(args.limit, 20, 1, 200);
  const maxDepth = boundedInteger(args.maxDepth, 3, 0, 12);
  const maxTraversalNodes = boundedInteger(args.maxTraversalNodes, 250_000, 1, 1_000_000);
  const edgeLabels = Array.isArray(args.edgeLabels) && args.edgeLabels.length
    ? new Set(args.edgeLabels.slice(0, 64).map((value) => String(value).slice(0, 512)))
    : null;
  if (mode === "path") {
    const direction = ["outgoing", "incoming", "both"].includes(args.direction)
      ? args.direction
      : "both";
    const searched = await shortestPath(
      snapshot,
      repositoryId,
      start.node.id,
      target.node.id,
      { direction, edgeLabels, maxDepth, maxTraversalNodes },
      options,
    );
    const path = searched.path
      ? { ...searched.path, ...await hydrateRecords(
        snapshot,
        repositoryId,
        searched.path.nodeIds,
        searched.path.edgeIds,
        options,
      ) }
      : null;
    return {
      ...baseResult(snapshot, mode),
      found: Boolean(path),
      direction,
      resolution: {
        from: { id: start.node.id, basis: start.basis, candidates: start.candidates },
        to: { id: target.node.id, basis: target.basis, candidates: target.candidates },
      },
      path,
      citations: (path?.edges || []).map(evidenceForEdge),
      completeness: {
        complete: Boolean(path) || (!searched.depthLimited && !searched.stateLimited),
        truncated: !path && (searched.depthLimited || searched.stateLimited),
        reason: path
          ? "shortest_path_found"
          : searched.stateLimited ? "traversal_state_limit" : searched.depthLimited ? "max_depth" : "no_path",
        maxDepth,
        maxTraversalNodes,
      },
    };
  }
  const direction = ["outgoing", "incoming", "both"].includes(args.direction)
    ? args.direction
    : mode === "impact" ? "incoming" : "both";
  const traversal = await traverseNeighborhood(
    snapshot,
    repositoryId,
    start.node.id,
    { direction, edgeLabels, maxDepth, limit },
    options,
  );
  const records = await hydrateRecords(
    snapshot,
    repositoryId,
    traversal.nodeIds,
    traversal.edgeIds,
    options,
  );
  return {
    ...baseResult(snapshot, mode),
    direction,
    resolution: { id: start.node.id, basis: start.basis, candidates: start.candidates },
    traversal: { ...traversal, ...records },
    citations: records.edges.map(evidenceForEdge),
    completeness: {
      complete: !traversal.limitTruncated && !traversal.depthLimited,
      truncated: traversal.limitTruncated || traversal.depthLimited,
      reason: traversal.limitTruncated
        ? "result_limit"
        : traversal.depthLimited ? "max_depth" : "full_neighborhood",
      limit,
      maxDepth,
    },
  };
}
