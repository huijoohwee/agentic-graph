import { checkAgentGraphBudget, compareStableStrings, AgentGraphError, sha256 } from "./contract.mjs";
import {
  readAgentGraphRepositoryIndex,
  readAgentGraphResolutionShards,
  readAgentGraphSourceParts,
} from "./store.mjs";
import {
  explainAgentGraphEdgeFromArtifact,
  queryAgentGraph,
  selectPairedSearchEdges,
} from "./query-core.mjs";
import { iterateAgentGraphSnapshotShards } from "./query-shards.mjs";
import { queryAgentGraphSnapshotTraversal } from "./query-traversal.mjs";
import {
  fitAgentGraphProjectionRecords,
  normalizeAgentGraphProjectionByteLimit,
} from "./projection-budget.mjs";

export { explainAgentGraphEdgeFromArtifact, queryAgentGraph };

const normalized = (value) => String(value || "").trim().toLowerCase();
const tokenize = (value) => normalized(value).slice(0, 4000).split(/[^\p{L}\p{N}_.$/@-]+/u).filter(Boolean).slice(0, 64);

const boundedInteger = (value, fallback, minimum, maximum) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.floor(number))) : fallback;
};

function createQueryCheckpoint(options = {}, stage = "snapshot-query") {
  let operations = 0;
  const checkpoint = () => {
    operations += 1;
    if (operations % 128 === 0) {
      checkAgentGraphBudget({ ...options, stage, details: { operations } });
    }
  };
  checkpoint.force = () => checkAgentGraphBudget({
    ...options,
    stage,
    details: { operations },
  });
  checkpoint.force();
  return checkpoint;
}

function withCorpusCompleteness(snapshot, result) {
  const stored = snapshot.manifest.completeness || {
    complete: snapshot.manifest.admission?.complete === true,
  };
  const operation = result.completeness || { complete: true, truncated: false, reason: "complete" };
  const corpusComplete = stored.complete === true;
  const resultComplete = operation.complete === true;
  return {
    ...result,
    completeness: {
      ...stored,
      ...operation,
      complete: corpusComplete && resultComplete,
      truncated: operation.truncated === true,
      reason: corpusComplete ? operation.reason : "ingest_incomplete",
      corpusComplete,
      resultComplete,
      resultTruncated: operation.truncated === true,
      ...(!corpusComplete ? {
        corpusReasons: stored.reasons || [],
        incompleteSources: stored.incompleteSources || [],
      } : {}),
    },
  };
}

function clippedJson(value, maxLength = 2000) {
  try { return JSON.stringify(value).slice(0, maxLength); } catch { return ""; }
}

const configSearchText = (node) => (
  String(node?.properties?.["config:searchText"] || "").slice(0, 128 * 1024)
);

function nodeSearchText(node) {
  return [
    node.id,
    node.label,
    node.type,
    configSearchText(node),
    clippedJson(node.properties),
    clippedJson(node.metadata, 500),
  ].join(" ").toLowerCase();
}

function edgeSearchText(edge, nodeById) {
  const targetNode = nodeById.get(edge.target);
  return [
    edge.id,
    edge.label,
    nodeById.get(edge.source)?.label,
    nodeById.get(edge.target)?.label,
    edge.properties?.["evidence:explanation"],
    edge.properties?.["evidence:sourcePath"],
    configSearchText(targetNode),
  ].join(" ").toLowerCase();
}

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

function retainBest(entries, entry, limit, compare) {
  entries.push(entry);
  entries.sort(compare);
  if (entries.length > limit) entries.pop();
}

export async function projectAgentGraphSnapshot(snapshot, limitRaw = 200, options = {}) {
  const checkpoint = createQueryCheckpoint(options, "snapshot-projection");
  const limit = boundedInteger(limitRaw, 200, 1, 1000);
  const projectionByteLimit = normalizeAgentGraphProjectionByteLimit(options.projectionByteLimit);
  const candidateNodes = [];
  const candidateEdges = [];
  for await (const { shard } of iterateAgentGraphSnapshotShards(snapshot, {
    ...options,
    checkpoint,
  })) {
    for (const node of shard.nodes || []) {
      checkpoint();
      retainBest(candidateNodes, node, limit, (left, right) => compareStableStrings(left.id, right.id));
    }
    for (const edge of shard.edges || []) {
      checkpoint();
      retainBest(candidateEdges, edge, limit, (left, right) => compareStableStrings(left.id, right.id));
    }
  }
  const endpointIds = new Set();
  const edges = [];
  for (const edge of candidateEdges) {
    checkpoint();
    const nextIds = new Set([...endpointIds, edge.source, edge.target]);
    if (nextIds.size > limit) continue;
    edges.push(edge);
    endpointIds.add(edge.source);
    endpointIds.add(edge.target);
  }
  const nodeById = new Map();
  for await (const { shard } of iterateAgentGraphSnapshotShards(snapshot, {
    ...options,
    checkpoint,
  })) {
    for (const node of shard.nodes || []) {
      checkpoint();
      if (endpointIds.has(node.id)) nodeById.set(node.id, node);
    }
  }
  for (const node of candidateNodes) {
    if (nodeById.size >= limit) break;
    nodeById.set(node.id, node);
  }
  const nodes = [...nodeById.values()].sort((left, right) => compareStableStrings(left.id, right.id));
  const projectedEdges = edges.filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target));
  const graph = snapshot.manifest.graph;
  const byteBounded = fitAgentGraphProjectionRecords({
    nodes,
    edges: projectedEdges,
    maxBytes: projectionByteLimit,
  });
  const countTruncated = graph.nodes > nodes.length || graph.edges > projectedEdges.length;
  const truncated = countTruncated || byteBounded.truncated;
  const corpusComplete = (snapshot.manifest.completeness?.complete
    ?? snapshot.manifest.admission?.complete) === true;
  return {
    token: `kg:projection:${sha256(`${snapshot.pointer.snapshotDigest}\0${limit}\0${projectionByteLimit}`).slice(0, 24)}`,
    readOnly: true,
    graphData: {
      context: "agentic-graph-agent-graph-projection",
      type: "Graph",
      nodes: byteBounded.nodes,
      edges: byteBounded.edges,
    },
    complete: corpusComplete && !truncated,
    truncated,
    limit,
    reason: !corpusComplete
      ? "ingest_incomplete"
      : byteBounded.truncated
        ? "projection_byte_limit"
        : countTruncated
          ? "projection_limit"
          : "full_projection",
  };
}

async function resolveSnapshotNode(snapshot, selector, options = {}) {
  const checkpoint = options.checkpoint || createQueryCheckpoint(options, "snapshot-node-resolution");
  const value = String(selector || "").trim().slice(0, 1000);
  if (!value) throw new AgentGraphError("node_selector_required", "A node id or lexical selector is required.");
  const exact = [];
  let exactCount = 0;
  const ranked = [];
  const terms = tokenize(value);
  for await (const { repository, shard } of iterateAgentGraphSnapshotShards(snapshot, {
    ...options,
    checkpoint,
  })) {
    for (const node of shard.nodes || []) {
      checkpoint();
      if (node.id === value) return { node, repositoryId: repository.repositoryId, candidates: [node.id], basis: "id" };
      if (normalized(node.label) === normalized(value)) {
        exactCount += 1;
        retainBest(exact, { node, repositoryId: repository.repositoryId }, 65, (
          left,
          right,
        ) => compareStableStrings(left.node.id, right.node.id));
      }
      const score = lexicalScore(nodeSearchText(node), terms, node.label);
      if (score > 0) retainBest(ranked, { node, repositoryId: repository.repositoryId, score }, 8, (
        left,
        right,
      ) => right.score - left.score || compareStableStrings(left.node.id, right.node.id));
    }
  }
  if (exactCount === 1) return { ...exact[0], candidates: [exact[0].node.id], basis: "exact-label" };
  if (exactCount > 1) {
    throw new AgentGraphError("node_selector_ambiguous", `Node selector matches ${exactCount} exact labels.`, {
      candidates: exact.slice(0, 64).map((entry) => entry.node.id),
      truncated: exactCount > 64,
    });
  }
  if (!ranked.length) throw new AgentGraphError("node_not_found", `No graph node matches ${value}.`);
  return { ...ranked[0], candidates: ranked.map((entry) => entry.node.id), basis: "lexical" };
}

async function searchSnapshot(snapshot, args, options = {}) {
  const checkpoint = options.checkpoint || createQueryCheckpoint(options, "snapshot-search");
  const limit = boundedInteger(args.limit, 20, 1, 200);
  const query = String(args.query || "").trim().slice(0, 4000);
  if (!query) throw new AgentGraphError("query_required", "query is required for search mode.");
  const terms = tokenize(query);
  const nodes = [];
  const edges = [];
  const supportByTarget = new Map();
  for (const repository of snapshot.manifest.repositories || []) {
    checkpoint();
    const index = await readAgentGraphRepositoryIndex(snapshot, repository);
    for (const entry of index.sources || []) {
      const sourceNodes = new Map();
      for await (const part of readAgentGraphSourceParts(snapshot, entry)) {
        for (const node of part.nodes || []) {
          checkpoint();
          sourceNodes.set(node.id, node);
          const score = lexicalScore(nodeSearchText(node), terms, node.label);
          if (score > 0) retainBest(nodes, { node, score }, limit + 1, (
            left,
            right,
          ) => right.score - left.score || compareStableStrings(left.node.id, right.node.id));
        }
        const rankedNodeIds = new Set(nodes.map(({ node }) => node.id));
        for (const edge of part.edges || []) {
          checkpoint();
          const score = lexicalScore(edgeSearchText(edge, sourceNodes), terms, edge.label);
          if (score > 0) retainBest(edges, { edge, score }, limit + 1, (
            left,
            right,
          ) => right.score - left.score || compareStableStrings(left.edge.id, right.edge.id));
          if (edge.label === "indexesConfigTokens" && rankedNodeIds.has(edge.target)) {
            const existing = supportByTarget.get(edge.target);
            if (!existing || compareStableStrings(edge.id, existing.edge.id) < 0) {
              supportByTarget.set(edge.target, { edge, score });
            }
          }
        }
      }
      const retainedNodeIds = new Set(nodes.map(({ node }) => node.id));
      for (const targetId of supportByTarget.keys()) {
        if (!retainedNodeIds.has(targetId)) supportByTarget.delete(targetId);
      }
    }
    for await (const shard of readAgentGraphResolutionShards(snapshot, index)) {
      for (const edge of shard.edges || []) {
        checkpoint();
        const score = lexicalScore(edgeSearchText(edge, new Map()), terms, edge.label);
        if (score > 0) retainBest(edges, { edge, score }, limit + 1, (
          left,
          right,
        ) => right.score - left.score || compareStableStrings(left.edge.id, right.edge.id));
      }
    }
  }
  const nodesTruncated = nodes.length > limit;
  const selectedNodeEntries = nodes.slice(0, limit);
  const pairedEdges = selectPairedSearchEdges({
    rankedNodeEntries: selectedNodeEntries,
    rankedEdgeEntries: edges,
    supportByTarget,
    limit,
  });
  const edgesTruncated = pairedEdges.truncated;
  const resultEdges = pairedEdges.entries
    .map((entry) => ({ ...entry, evidence: evidenceForEdge(entry.edge) }));
  return {
    mode: "search",
    snapshotDigest: snapshot.pointer.snapshotDigest,
    query,
    results: { nodes: selectedNodeEntries, edges: resultEdges },
    citations: resultEdges.map((entry) => entry.evidence),
    retrieval: snapshot.manifest.retrieval,
    cost: snapshot.manifest.cost,
    completeness: {
      complete: !nodesTruncated && !edgesTruncated,
      truncated: nodesTruncated || edgesTruncated,
      reason: nodesTruncated || edgesTruncated ? "result_limit" : "all_lexical_matches",
      limit,
      nodesTruncated,
      edgesTruncated,
    },
  };
}

export async function explainAgentGraphSnapshotEdge(snapshot, edgeIdRaw, options = {}) {
  const checkpoint = options.checkpoint || createQueryCheckpoint(options, "snapshot-explain");
  const edgeId = String(edgeIdRaw || "").trim();
  for (const repository of snapshot.manifest.repositories || []) {
    checkpoint();
    const index = await readAgentGraphRepositoryIndex(snapshot, repository);
    checkpoint();
    let edge;
    for (const entry of index.sources || []) {
      checkpoint();
      for await (const shard of readAgentGraphSourceParts(snapshot, entry)) {
        edge = (shard.edges || []).find((candidate) => (checkpoint(), candidate.id === edgeId));
        if (edge) break;
      }
      if (edge) break;
    }
    if (!edge) {
      for await (const resolution of readAgentGraphResolutionShards(snapshot, index)) {
        edge = (resolution.edges || [])
          .find((candidate) => (checkpoint(), candidate.id === edgeId));
        if (edge) break;
      }
    }
    if (!edge) continue;
    const nodes = [];
    const required = new Set([edge.source, edge.target]);
    for (const entry of index.sources || []) {
      checkpoint();
      for await (const shard of readAgentGraphSourceParts(snapshot, entry)) {
        for (const node of shard.nodes || []) {
          checkpoint();
          if (required.has(node.id)) nodes.push(node);
        }
      }
      if (nodes.length === required.size) break;
    }
    return explainAgentGraphEdgeFromArtifact({
      nodes,
      edges: [edge],
      metadata: { knowledgeGraph: { digest: snapshot.pointer.snapshotDigest } },
    }, edgeId, { checkpoint });
  }
  throw new AgentGraphError("edge_not_found", `Knowledge graph edge was not found: ${edgeId}`);
}

export async function queryAgentGraphSnapshot(snapshot, args = {}, options = {}) {
  const checkpoint = options.checkpoint || createQueryCheckpoint(options, "snapshot-query");
  const mode = String(args.mode || "search");
  if (mode === "summary") {
    return withCorpusCompleteness(snapshot, {
      mode,
      snapshotDigest: snapshot.pointer.snapshotDigest,
      graph: { nodes: snapshot.manifest.graph.nodes, edges: snapshot.manifest.graph.edges },
      nodeTypes: snapshot.manifest.graph.nodeTypes,
      edgeLabels: snapshot.manifest.graph.edgeLabels,
      sources: snapshot.manifest.sourceCount,
      repositories: snapshot.manifest.repositories.length,
      parserCoverage: snapshot.manifest.parserCoverage,
      diagnostics: snapshot.manifest.diagnostics,
      retrieval: snapshot.manifest.retrieval,
      cost: snapshot.manifest.cost,
      completeness: {
        complete: true,
        truncated: false,
        reason: "full_graph_summary",
      },
    });
  }
  if (mode === "search") {
    return withCorpusCompleteness(snapshot, await searchSnapshot(snapshot, args, { checkpoint }));
  }
  if (!["path", "neighbors", "impact"].includes(mode)) {
    throw new AgentGraphError("query_mode_invalid", `Unsupported knowledge graph query mode: ${mode}`);
  }
  const start = await resolveSnapshotNode(
    snapshot,
    args.nodeId || args.from || args.query,
    { ...options, checkpoint },
  );
  let target;
  if (mode === "path") {
    target = await resolveSnapshotNode(snapshot, args.to, { ...options, checkpoint });
    if (target.repositoryId !== start.repositoryId) {
      return withCorpusCompleteness(snapshot, {
        mode,
        snapshotDigest: snapshot.pointer.snapshotDigest,
        found: false,
        resolution: {
          from: { id: start.node.id, basis: start.basis, candidates: start.candidates },
          to: { id: target.node.id, basis: target.basis, candidates: target.candidates },
        },
        path: null,
        citations: [],
        retrieval: snapshot.manifest.retrieval,
        cost: snapshot.manifest.cost,
        completeness: { complete: true, truncated: false, reason: "repository_boundary" },
      });
    }
  }
  return withCorpusCompleteness(snapshot, await queryAgentGraphSnapshotTraversal(
    snapshot,
    {
      mode,
      repositoryId: start.repositoryId,
      start,
      target,
      args,
    },
    { ...options, checkpoint },
  ));
}
