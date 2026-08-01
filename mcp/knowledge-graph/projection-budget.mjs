/**
 * Transport-safe projection limits shared by the local runtime, Vite host, and
 * Canvas. The canonical snapshot is never changed; these limits apply only to
 * a read-only visual projection.
 */
export const KNOWLEDGE_GRAPH_PROJECTION_MAX_BYTES = 2 * 1024 * 1024;
export const KNOWLEDGE_GRAPH_PROJECTION_METADATA_HEADROOM_BYTES = 16 * 1024;
export const KNOWLEDGE_GRAPH_PROJECTION_GRAPH_DATA_MAX_BYTES = (
  KNOWLEDGE_GRAPH_PROJECTION_MAX_BYTES - KNOWLEDGE_GRAPH_PROJECTION_METADATA_HEADROOM_BYTES
);

export function knowledgeGraphProjectionByteLength(value) {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string"
      ? new TextEncoder().encode(serialized).byteLength
      : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function compareKnowledgeGraphProjectionIds(left, right) {
  const leftId = String(left?.id || "");
  const rightId = String(right?.id || "");
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

export function normalizeKnowledgeGraphProjectionByteLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return KNOWLEDGE_GRAPH_PROJECTION_GRAPH_DATA_MAX_BYTES;
  return Math.max(1, Math.min(
    KNOWLEDGE_GRAPH_PROJECTION_MAX_BYTES,
    Math.floor(numeric),
  ));
}

export function retainBoundedKnowledgeGraphProjectionRecord(records, value, limit) {
  if (records.has(value.id)) return false;
  if (records.size < limit) {
    records.set(value.id, value);
    return false;
  }
  let greatestId = "";
  for (const id of records.keys()) {
    if (!greatestId || id > greatestId) greatestId = id;
  }
  if (!greatestId || value.id > greatestId) return true;
  records.delete(greatestId);
  records.set(value.id, value);
  return true;
}

function largestFittingPrefix(records, fits) {
  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(records.slice(0, middle))) low = middle;
    else high = middle - 1;
  }
  return low;
}

/**
 * Deterministically keeps a connected, read-only graph sample within a byte
 * budget. Edges are reduced before nodes; all ordering is by canonical id.
 * `buildGraphData` may include Canvas metadata so callers budget the exact
 * decorated object that they will publish.
 */
export function fitKnowledgeGraphProjectionRecords({
  nodes = [],
  edges = [],
  context = "knowgrph-knowledge-graph-projection",
  maxBytes,
  buildGraphData,
} = {}) {
  const byteLimit = normalizeKnowledgeGraphProjectionByteLimit(maxBytes);
  const orderedNodes = [...nodes].sort(compareKnowledgeGraphProjectionIds);
  const nodeIds = new Set(orderedNodes.map((node) => node.id));
  const sourceEdges = [...edges];
  const orderedEdges = sourceEdges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .sort(compareKnowledgeGraphProjectionIds);
  const build = typeof buildGraphData === "function"
    ? buildGraphData
    : (nextNodes, nextEdges) => ({
      context,
      type: "Graph",
      nodes: nextNodes,
      edges: nextEdges,
    });
  const fits = (nextNodes, nextEdges) => (
    knowledgeGraphProjectionByteLength(build(nextNodes, nextEdges)) <= byteLimit
  );

  let retainedNodes = orderedNodes;
  let retainedEdges = orderedEdges;
  if (!fits(retainedNodes, retainedEdges)) {
    const edgeCount = largestFittingPrefix(
      retainedEdges,
      (candidateEdges) => fits(retainedNodes, candidateEdges),
    );
    retainedEdges = retainedEdges.slice(0, edgeCount);
  }
  if (!fits(retainedNodes, retainedEdges)) {
    const nodeCount = largestFittingPrefix(
      retainedNodes,
      (candidateNodes) => fits(candidateNodes, []),
    );
    retainedNodes = retainedNodes.slice(0, nodeCount);
    const retainedNodeIds = new Set(retainedNodes.map((node) => node.id));
    const compatibleEdges = orderedEdges.filter((edge) => (
      retainedNodeIds.has(edge.source) && retainedNodeIds.has(edge.target)
    ));
    const edgeCount = largestFittingPrefix(
      compatibleEdges,
      (candidateEdges) => fits(retainedNodes, candidateEdges),
    );
    retainedEdges = compatibleEdges.slice(0, edgeCount);
  }

  return {
    nodes: retainedNodes,
    edges: retainedEdges,
    truncated: orderedEdges.length !== sourceEdges.length
      || retainedNodes.length !== orderedNodes.length
      || retainedEdges.length !== orderedEdges.length,
    byteLength: knowledgeGraphProjectionByteLength(build(retainedNodes, retainedEdges)),
    maxBytes: byteLimit,
  };
}
