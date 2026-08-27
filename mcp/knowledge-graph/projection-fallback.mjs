import { sha256 } from "./contract.mjs";
import { normalizeKnowledgeGraphProjectionByteLimit } from "./projection-budget.mjs";

export function unavailableProjection(snapshot, limitRaw, projectionByteLimitRaw) {
  const numericLimit = Number(limitRaw);
  const limit = Number.isFinite(numericLimit)
    ? Math.max(1, Math.min(1000, Math.floor(numericLimit)))
    : 200;
  const projectionByteLimit = normalizeKnowledgeGraphProjectionByteLimit(projectionByteLimitRaw);
  return {
    token: `kg:projection:${sha256(`${snapshot.pointer.snapshotDigest}\0${limit}\0${projectionByteLimit}`).slice(0, 24)}`,
    readOnly: true,
    graphData: {
      context: "agenticgraph-knowledge-graph-projection",
      type: "Graph",
      nodes: [],
      edges: [],
    },
    complete: false,
    truncated: true,
    limit,
    reason: "projection_unavailable",
  };
}
