import {
  EVIDENCE_FIELDS,
  KnowledgeGraphError,
  compareStableStrings,
  sha256,
} from "./contract.mjs";

export function countBy(values, checkpoint = () => {}) {
  const counts = new Map();
  for (const value of values) {
    checkpoint();
    counts.set(String(value), (counts.get(String(value)) || 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => compareStableStrings(left, right)),
  );
}

export function sortedDiagnostics(diagnostics, checkpoint = () => {}) {
  const safeMessage = (value) => String(value || "")
    .replace(/(^|\s)\/(?:[^/\s:]+\/)*[^/\s:]*/g, "$1<absolute-path>")
    .replace(/\b[A-Za-z]:\\(?:[^\\\s:]+\\)*[^\\\s:]*/g, "<absolute-path>")
    .slice(0, 2000);
  return [...(diagnostics || [])]
    .filter((item) => (checkpoint(), item && typeof item === "object"))
    .map((item) => ({
      code: String(item.code || "diagnostic"),
      sourcePath: String(item.sourcePath || ""),
      message: safeMessage(item.message),
      ...(Number.isInteger(item.lineStart) ? { lineStart: item.lineStart } : {}),
      ...(Number.isInteger(item.columnStart) ? { columnStart: item.columnStart } : {}),
    }))
    .sort((left, right) => compareStableStrings(
      `${left.sourcePath}\0${left.code}\0${left.message}`,
      `${right.sourcePath}\0${right.code}\0${right.message}`,
    ));
}

export function assertExplainedEdges(
  edges,
  nodeIds = null,
  checkpoint = () => {},
  options = {},
) {
  const ids = new Set();
  for (const edge of edges || []) {
    checkpoint();
    if (!edge?.id || ids.has(edge.id)) {
      throw new KnowledgeGraphError(
        options.duplicateCode || "source_shard_invalid",
        "Stored graph shard contains a missing or duplicate edge id.",
      );
    }
    ids.add(edge.id);
    if (nodeIds && (!nodeIds.has(edge.source) || !nodeIds.has(edge.target))) {
      throw new KnowledgeGraphError(
        "source_shard_invalid",
        `Stored graph shard contains a dangling edge: ${edge.id}`,
      );
    }
    for (const field of EVIDENCE_FIELDS) {
      const value = edge.properties?.[field];
      if (value === undefined || value === null || value === "") {
        throw new KnowledgeGraphError(
          "edge_evidence_invalid",
          `Stored graph edge is missing ${field}: ${edge.id}`,
        );
      }
    }
    const excerpt = edge.properties["evidence:excerpt"];
    if (excerpt.length > 320 || sha256(excerpt) !== edge.properties["evidence:excerptHash"]) {
      throw new KnowledgeGraphError(
        "edge_evidence_invalid",
        `Stored graph edge excerpt evidence is invalid: ${edge.id}`,
      );
    }
  }
}
