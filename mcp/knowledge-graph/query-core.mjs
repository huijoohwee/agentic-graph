import {
  checkKnowledgeGraphBudget,
  compareStableStrings,
  KnowledgeGraphError,
} from "./contract.mjs";

const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const normalized = (value) => String(value || "").trim().toLowerCase();
const tokenize = (value) => normalized(value).slice(0, 4000)
  .split(/[^\p{L}\p{N}_.$/@-]+/u).filter(Boolean).slice(0, 64);

function createCheckpoint(options = {}, stage = "materialized-query") {
  let operations = 0;
  const checkpoint = () => {
    operations += 1;
    if (operations % 128 === 0) {
      checkKnowledgeGraphBudget({ ...options, stage, details: { operations } });
    }
  };
  checkKnowledgeGraphBudget({ ...options, stage, details: { operations } });
  return checkpoint;
}

function clippedJson(value, maxLength = 2000) {
  try { return JSON.stringify(value).slice(0, maxLength); } catch { return ""; }
}

const configSearchText = (node) => (
  String(
    asRecord(node.properties)["config:searchText"] || "",
  ).slice(0, 128 * 1024)
);

const nodeSearchText = (node) => {
  return [
    node.id,
    node.label,
    node.type,
    configSearchText(node),
    clippedJson(node.properties),
    clippedJson(node.metadata, 500),
  ].join(" ").toLowerCase();
};

const edgeSearchText = (edge, nodeById) => {
  const targetNode = nodeById.get(edge.target);
  return [
    edge.id,
    edge.label,
    nodeById.get(edge.source)?.label,
    targetNode?.label,
    edge.properties?.["evidence:explanation"],
    edge.properties?.["evidence:sourcePath"],
    configSearchText(targetNode),
  ].join(" ").toLowerCase();
};

function lexicalScore(text, terms, exactLabel = "") {
  if (!terms.length) return 0;
  let score = 0;
  const normalizedLabel = normalized(exactLabel);
  const exactTokens = new Set(
    text.split(/[^\p{L}\p{N}_.$/@-]+/u).filter(Boolean),
  );
  for (const term of terms) {
    if (normalizedLabel === term) score += 100;
    else if (normalizedLabel.startsWith(term)) score += 30;
    else if (normalizedLabel.includes(term)) score += 15;
    if (exactTokens.has(term)) score += 10;
    else if (term.length >= 4 && text.includes(term)) score += 5;
  }
  return score;
}

function graphAccess(artifact, checkpoint) {
  const nodes = Array.isArray(artifact?.nodes) ? artifact.nodes : [];
  const edges = Array.isArray(artifact?.edges) ? artifact.edges : [];
  const nodeById = new Map();
  const edgeById = new Map();
  for (const node of nodes) {
    checkpoint();
    nodeById.set(node.id, node);
  }
  for (const edge of edges) {
    checkpoint();
    edgeById.set(edge.id, edge);
  }
  return { nodes, edges, nodeById, edgeById };
}

function evidenceForEdge(edge) {
  const properties = asRecord(edge?.properties);
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
  };
}

function retainBest(entries, entry, limit, compare) {
  entries.push(entry);
  entries.sort(compare);
  if (entries.length > limit) entries.pop();
}

function rankedNodes(access, query, limit, checkpoint) {
  const terms = tokenize(query);
  const ranked = [];
  for (const node of access.nodes) {
    checkpoint();
    const score = lexicalScore(nodeSearchText(node), terms, node.label);
    if (score > 0) retainBest(ranked, { node, score }, limit, (
      left,
      right,
    ) => right.score - left.score || compareStableStrings(left.node.id, right.node.id));
  }
  return ranked;
}

function rankedEdges(access, query, limit, checkpoint) {
  const terms = tokenize(query);
  const ranked = [];
  for (const edge of access.edges) {
    checkpoint();
    const score = lexicalScore(edgeSearchText(edge, access.nodeById), terms, edge.label);
    if (score > 0) retainBest(ranked, { edge, score }, limit, (
      left,
      right,
    ) => right.score - left.score || compareStableStrings(left.edge.id, right.edge.id));
  }
  return ranked;
}

const compareRankedEdgeEntries = (left, right) => (
  right.score - left.score || compareStableStrings(left.edge.id, right.edge.id)
);

function configSearchSupportEntries(access, rankedNodeEntries, query, checkpoint) {
  const targetIds = new Set(
    rankedNodeEntries
      .filter(({ node }) => node.type === "ConfigSearchChunk")
      .map(({ node }) => node.id),
  );
  if (!targetIds.size) return new Map();
  const terms = tokenize(query);
  const supportByTarget = new Map();
  for (const edge of access.edges) {
    checkpoint();
    if (edge.label !== "indexesConfigTokens" || !targetIds.has(edge.target)) continue;
    const existing = supportByTarget.get(edge.target);
    if (existing && compareStableStrings(existing.edge.id, edge.id) <= 0) continue;
    supportByTarget.set(edge.target, {
      edge,
      score: lexicalScore(edgeSearchText(edge, access.nodeById), terms, edge.label),
    });
  }
  return supportByTarget;
}

export function selectPairedSearchEdges({
  rankedNodeEntries,
  rankedEdgeEntries,
  supportByTarget,
  limit,
}) {
  const selectedById = new Map();
  const candidateEdgeIds = new Set(rankedEdgeEntries.map(({ edge }) => edge.id));
  for (const { node } of rankedNodeEntries) {
    if (node.type !== "ConfigSearchChunk") continue;
    const support = supportByTarget.get(node.id);
    if (!support) {
      throw new KnowledgeGraphError(
        "config_search_support_edge_missing",
        "A configuration search result is missing its source-backed evidence edge.",
        { nodeId: node.id },
      );
    }
    candidateEdgeIds.add(support.edge.id);
    selectedById.set(support.edge.id, support);
  }
  for (const entry of rankedEdgeEntries) {
    if (selectedById.size >= limit) break;
    if (!selectedById.has(entry.edge.id)) selectedById.set(entry.edge.id, entry);
  }
  return {
    entries: [...selectedById.values()].sort(compareRankedEdgeEntries),
    truncated: rankedEdgeEntries.length > limit || candidateEdgeIds.size > limit,
  };
}

function resolveNode(access, selector, checkpoint) {
  const value = String(selector || "").trim().slice(0, 1000);
  if (!value) throw new KnowledgeGraphError("node_selector_required", "A node id or lexical selector is required.");
  const byId = access.nodeById.get(value);
  if (byId) return { node: byId, candidates: [byId.id], basis: "id" };
  const exact = access.nodes
    .filter((node) => (checkpoint(), normalized(node.label) === normalized(value)))
    .sort((left, right) => {
      checkpoint();
      const leftReference = /Reference$/.test(String(left.type || "")) ? 1 : 0;
      const rightReference = /Reference$/.test(String(right.type || "")) ? 1 : 0;
      return leftReference - rightReference || compareStableStrings(left.id, right.id);
    });
  if (exact.length) {
    return {
      node: exact[0],
      candidates: exact.map((node) => node.id),
      basis: exact.length === 1 ? "exact-label" : "ambiguous-exact-label",
    };
  }
  const ranked = rankedNodes(access, value, 8, checkpoint);
  if (!ranked.length) throw new KnowledgeGraphError("node_not_found", `No graph node matches ${value}.`);
  return { node: ranked[0].node, candidates: ranked.map((entry) => entry.node.id), basis: "lexical" };
}

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

function shortestPath(access, startNodeId, targetNodeId, {
  direction,
  edgeLabels,
  maxDepth,
  checkpoint,
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

function traverseNeighborhood(access, startNodeId, {
  direction,
  edgeLabels,
  maxDepth,
  limit,
  checkpoint,
}) {
  const adjacency = adjacencyFor(access, direction, edgeLabels, checkpoint);
  const nodeIds = new Set([startNodeId]);
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
        return { nodeIds: [...nodeIds], edgeIds, limitTruncated: true, depthLimited };
      }
      seenEdgeIds.add(edge.id);
      edgeIds.push(edge.id);
      const nextNodeId = nextStep(edge, current.nodeId, direction);
      if (nextNodeId && !nodeIds.has(nextNodeId)) {
        nodeIds.add(nextNodeId);
        queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
      }
    }
  }
  return { nodeIds: [...nodeIds], edgeIds, limitTruncated: false, depthLimited };
}

function baseResult(artifact, mode) {
  return {
    mode,
    snapshotDigest: artifact.metadata.knowledgeGraph.digest,
    retrieval: { mode: "lexical-graph", vectorStore: false },
    cost: { modelCalls: 0, promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 },
  };
}

function summarize(access, artifact, checkpoint) {
  const countBy = (values, select) => {
    const counts = new Map();
    for (const value of values) {
      checkpoint();
      const key = select(value);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Object.fromEntries([...counts.entries()].sort(([left], [right]) => (
      checkpoint(), compareStableStrings(left, right)
    )));
  };
  const degree = new Map();
  for (const node of access.nodes) {
    checkpoint();
    degree.set(node.id, 0);
  }
  for (const edge of access.edges) {
    checkpoint();
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  const connected = access.nodes
    .map((node) => (checkpoint(), {
      id: node.id,
      label: node.label,
      type: node.type,
      degree: degree.get(node.id) || 0,
    }))
    .sort((left, right) => (
      checkpoint(), right.degree - left.degree || compareStableStrings(left.id, right.id)
    ))
    .slice(0, 20);
  return {
    ...baseResult(artifact, "summary"),
    graph: { nodes: access.nodes.length, edges: access.edges.length },
    nodeTypes: countBy(access.nodes, (node) => String(node.type || "Entity")),
    edgeLabels: countBy(access.edges, (edge) => String(edge.label || "relatedTo")),
    sources: artifact.manifest?.sources?.length || 0,
    parserCoverage: artifact.metadata.knowledgeGraph.parserCoverage || {},
    diagnostics: artifact.diagnostics || [],
    mostConnected: connected,
    completeness: { complete: true, truncated: false, reason: "full_graph_summary" },
  };
}

const boundedInteger = (value, fallback, minimum, maximum) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.floor(number))) : fallback;
};

export function queryKnowledgeGraph(artifact, args = {}, options = {}) {
  const checkpoint = options.checkpoint || createCheckpoint(options);
  const access = graphAccess(artifact, checkpoint);
  const mode = String(args.mode || "search");
  const limit = boundedInteger(args.limit, 20, 1, 200);
  const maxDepth = boundedInteger(args.maxDepth, 3, 0, 12);
  const edgeLabels = Array.isArray(args.edgeLabels) && args.edgeLabels.length
    ? new Set(args.edgeLabels.slice(0, 64).map((value) => String(value).slice(0, 512)))
    : null;
  if (mode === "summary") return summarize(access, artifact, checkpoint);
  if (mode === "search") {
    const query = String(args.query || "").trim().slice(0, 4000);
    if (!query) throw new KnowledgeGraphError("query_required", "query is required for search mode.");
    const rankedNodeEntries = rankedNodes(access, query, limit + 1, checkpoint);
    const rankedEdgeEntries = rankedEdges(access, query, limit + 1, checkpoint);
    const nodesTruncated = rankedNodeEntries.length > limit;
    const selectedNodeEntries = rankedNodeEntries.slice(0, limit);
    const supportByTarget = configSearchSupportEntries(
      access,
      selectedNodeEntries,
      query,
      checkpoint,
    );
    const pairedEdges = selectPairedSearchEdges({
      rankedNodeEntries: selectedNodeEntries,
      rankedEdgeEntries,
      supportByTarget,
      limit,
    });
    const edgesTruncated = pairedEdges.truncated;
    const nodes = selectedNodeEntries.map(({ node, score }) => ({ score, node }));
    const edges = pairedEdges.entries
      .map(({ edge, score }) => ({ score, edge, evidence: evidenceForEdge(edge) }));
    const truncated = nodesTruncated || edgesTruncated;
    return {
      ...baseResult(artifact, mode),
      query,
      results: { nodes, edges },
      citations: edges.map((entry) => entry.evidence),
      completeness: {
        complete: !truncated,
        truncated,
        reason: truncated ? "result_limit" : "all_lexical_matches",
        limit,
        nodesTruncated,
        edgesTruncated,
      },
    };
  }
  if (mode === "path") {
    const start = resolveNode(access, args.from, checkpoint);
    const target = resolveNode(access, args.to, checkpoint);
    const direction = ["outgoing", "incoming", "both"].includes(args.direction) ? args.direction : "both";
    const pathSearch = shortestPath(access, start.node.id, target.node.id, {
      direction,
      edgeLabels,
      maxDepth,
      checkpoint,
    });
    const path = pathSearch.path;
    const edges = (path?.edgeIds || []).map((id) => access.edgeById.get(id)).filter(Boolean);
    return {
      ...baseResult(artifact, mode),
      found: Boolean(path),
      direction,
      resolution: {
        from: { id: start.node.id, basis: start.basis, candidates: start.candidates },
        to: { id: target.node.id, basis: target.basis, candidates: target.candidates },
      },
      path: path ? {
        nodeIds: path.nodeIds,
        edgeIds: path.edgeIds,
        nodes: path.nodeIds.map((id) => access.nodeById.get(id)),
        edges,
      } : null,
      citations: edges.map(evidenceForEdge),
      completeness: {
        complete: Boolean(path) || !pathSearch.depthLimited,
        truncated: !path && pathSearch.depthLimited,
        reason: path ? "shortest_path_found" : pathSearch.depthLimited ? "max_depth" : "no_path",
        maxDepth,
      },
    };
  }
  if (mode === "neighbors" || mode === "impact") {
    const start = resolveNode(access, args.nodeId || args.from || args.query, checkpoint);
    const direction = ["outgoing", "incoming", "both"].includes(args.direction)
      ? args.direction
      : mode === "impact" ? "incoming" : "both";
    const traversal = traverseNeighborhood(access, start.node.id, {
      direction,
      edgeLabels,
      maxDepth,
      limit,
      checkpoint,
    });
    const edges = traversal.edgeIds.map((id) => access.edgeById.get(id)).filter(Boolean);
    return {
      ...baseResult(artifact, mode),
      direction,
      resolution: { id: start.node.id, basis: start.basis, candidates: start.candidates },
      traversal: {
        ...traversal,
        nodes: traversal.nodeIds.map((id) => access.nodeById.get(id)),
        edges,
      },
      citations: edges.map(evidenceForEdge),
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
  throw new KnowledgeGraphError("query_mode_invalid", `Unsupported knowledge graph query mode: ${mode}`);
}

export function explainKnowledgeGraphEdgeFromArtifact(artifact, edgeIdRaw, options = {}) {
  const checkpoint = options.checkpoint || createCheckpoint(options, "materialized-explain");
  const access = graphAccess(artifact, checkpoint);
  const edgeId = String(edgeIdRaw || "").trim();
  const edge = access.edgeById.get(edgeId);
  if (!edge) throw new KnowledgeGraphError("edge_not_found", `Knowledge graph edge was not found: ${edgeId}`);
  const properties = asRecord(edge.properties);
  return {
    snapshotDigest: artifact.metadata.knowledgeGraph.digest,
    edge,
    source: access.nodeById.get(edge.source),
    target: access.nodeById.get(edge.target),
    evidence: {
      kind: properties["evidence:kind"],
      ruleId: properties["evidence:ruleId"],
      explanation: properties["evidence:explanation"],
      parserId: properties["evidence:parserId"],
      parserVersion: properties["evidence:parserVersion"],
      parserDigest: properties["evidence:parserDigest"],
      sourcePath: properties["evidence:sourcePath"],
      sourceDigest: properties["evidence:sourceDigest"],
      sourceSpan: {
        lineStart: properties["evidence:lineStart"],
        lineEnd: properties["evidence:lineEnd"],
        columnStart: properties["evidence:columnStart"],
        columnEnd: properties["evidence:columnEnd"],
      },
      excerpt: properties["evidence:excerpt"],
      excerptHash: properties["evidence:excerptHash"],
      confidence: properties["evidence:confidence"],
      certainty: properties["evidence:certainty"],
      premiseEdgeIds: properties["evidence:premiseEdgeIds"] || [],
      candidateCount: properties["evidence:candidateCount"] ?? 1,
      candidateIds: properties["evidence:candidateIds"] || [],
    },
    retrieval: { mode: "direct-edge-id", vectorStore: false },
    cost: { modelCalls: 0, promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 },
  };
}
