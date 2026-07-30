import { checkKnowledgeGraphBudget, compareStableStrings, KnowledgeGraphError, sha256 } from "./contract.mjs";
import {
  readKnowledgeGraphRepositoryIndex,
  readKnowledgeGraphResolutionShards,
  readKnowledgeGraphSourceShard,
} from "./store.mjs";
import { materializeKnowledgeGraphRepository } from "./materialize.mjs";
import {
  explainKnowledgeGraphEdgeFromArtifact,
  queryKnowledgeGraph,
} from "./query-core.mjs";

export { explainKnowledgeGraphEdgeFromArtifact, queryKnowledgeGraph };

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
      checkKnowledgeGraphBudget({ ...options, stage, details: { operations } });
    }
  };
  checkpoint.force = () => checkKnowledgeGraphBudget({
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

function nodeSearchText(node) {
  return [node.id, node.label, node.type, clippedJson(node.properties), clippedJson(node.metadata, 500)].join(" ").toLowerCase();
}

function edgeSearchText(edge, nodeById) {
  return [
    edge.id,
    edge.label,
    nodeById.get(edge.source)?.label,
    nodeById.get(edge.target)?.label,
    edge.properties?.["evidence:explanation"],
    edge.properties?.["evidence:sourcePath"],
  ].join(" ").toLowerCase();
}

function lexicalScore(text, terms, exactLabel = "") {
  if (!terms.length) return 0;
  let score = 0;
  const normalizedLabel = normalized(exactLabel);
  for (const term of terms) {
    if (normalizedLabel === term) score += 100;
    else if (normalizedLabel.startsWith(term)) score += 30;
    else if (normalizedLabel.includes(term)) score += 15;
    if (text.includes(term)) score += term.length >= 4 ? 5 : 2;
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
  };
}

async function* snapshotShards(snapshot, options = {}) {
  for (const repository of snapshot.manifest.repositories || []) {
    options.checkpoint?.();
    const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
    options.checkpoint?.();
    for (const entry of index.sources || []) {
      options.checkpoint?.();
      const shard = await readKnowledgeGraphSourceShard(snapshot, entry);
      options.checkpoint?.();
      yield { repository, shard };
    }
    for await (const shard of readKnowledgeGraphResolutionShards(snapshot, index)) {
      options.checkpoint?.();
      yield { repository, shard };
    }
  }
}

function retainBest(entries, entry, limit, compare) {
  entries.push(entry);
  entries.sort(compare);
  if (entries.length > limit) entries.pop();
}

export async function projectKnowledgeGraphSnapshot(snapshot, limitRaw = 200, options = {}) {
  const checkpoint = createQueryCheckpoint(options, "snapshot-projection");
  const limit = boundedInteger(limitRaw, 200, 1, 1000);
  const candidateNodes = [];
  const candidateEdges = [];
  for await (const { shard } of snapshotShards(snapshot, { checkpoint })) {
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
  for await (const { shard } of snapshotShards(snapshot, { checkpoint })) {
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
  const truncated = graph.nodes > nodes.length || graph.edges > projectedEdges.length;
  const corpusComplete = (snapshot.manifest.completeness?.complete
    ?? snapshot.manifest.admission?.complete) === true;
  return {
    token: `kg:projection:${sha256(`${snapshot.pointer.snapshotDigest}\0${limit}`).slice(0, 24)}`,
    readOnly: true,
    graphData: {
      context: "knowgrph-knowledge-graph-projection",
      type: "Graph",
      nodes,
      edges: projectedEdges,
    },
    complete: corpusComplete && !truncated,
    truncated,
    limit,
    reason: !corpusComplete ? "ingest_incomplete" : truncated ? "projection_limit" : "full_projection",
  };
}

async function resolveSnapshotNode(snapshot, selector, options = {}) {
  const checkpoint = options.checkpoint || createQueryCheckpoint(options, "snapshot-node-resolution");
  const value = String(selector || "").trim().slice(0, 1000);
  if (!value) throw new KnowledgeGraphError("node_selector_required", "A node id or lexical selector is required.");
  const exact = [];
  let exactCount = 0;
  const ranked = [];
  const terms = tokenize(value);
  for await (const { repository, shard } of snapshotShards(snapshot, { checkpoint })) {
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
    throw new KnowledgeGraphError("node_selector_ambiguous", `Node selector matches ${exactCount} exact labels.`, {
      candidates: exact.slice(0, 64).map((entry) => entry.node.id),
      truncated: exactCount > 64,
    });
  }
  if (!ranked.length) throw new KnowledgeGraphError("node_not_found", `No graph node matches ${value}.`);
  return { ...ranked[0], candidates: ranked.map((entry) => entry.node.id), basis: "lexical" };
}

async function searchSnapshot(snapshot, args, options = {}) {
  const checkpoint = options.checkpoint || createQueryCheckpoint(options, "snapshot-search");
  const limit = boundedInteger(args.limit, 20, 1, 200);
  const query = String(args.query || "").trim().slice(0, 4000);
  if (!query) throw new KnowledgeGraphError("query_required", "query is required for search mode.");
  const terms = tokenize(query);
  const nodes = [];
  const edges = [];
  for await (const { shard } of snapshotShards(snapshot, { checkpoint })) {
    const localNodes = new Map();
    for (const node of shard.nodes || []) {
      checkpoint();
      localNodes.set(node.id, node);
    }
    for (const node of shard.nodes || []) {
      checkpoint();
      const score = lexicalScore(nodeSearchText(node), terms, node.label);
      if (score > 0) retainBest(nodes, { node, score }, limit + 1, (
        left,
        right,
      ) => right.score - left.score || compareStableStrings(left.node.id, right.node.id));
    }
    for (const edge of shard.edges || []) {
      checkpoint();
      const score = lexicalScore(edgeSearchText(edge, localNodes), terms, edge.label);
      if (score > 0) retainBest(edges, { edge, score }, limit + 1, (
        left,
        right,
      ) => right.score - left.score || compareStableStrings(left.edge.id, right.edge.id));
    }
  }
  const nodesTruncated = nodes.length > limit;
  const edgesTruncated = edges.length > limit;
  const resultEdges = edges.slice(0, limit).map((entry) => ({ ...entry, evidence: evidenceForEdge(entry.edge) }));
  return {
    mode: "search",
    snapshotDigest: snapshot.pointer.snapshotDigest,
    query,
    results: { nodes: nodes.slice(0, limit), edges: resultEdges },
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

export async function explainKnowledgeGraphSnapshotEdge(snapshot, edgeIdRaw, options = {}) {
  const checkpoint = options.checkpoint || createQueryCheckpoint(options, "snapshot-explain");
  const edgeId = String(edgeIdRaw || "").trim();
  for (const repository of snapshot.manifest.repositories || []) {
    checkpoint();
    const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
    checkpoint();
    let edge;
    for (const entry of index.sources || []) {
      checkpoint();
      const shard = await readKnowledgeGraphSourceShard(snapshot, entry);
      edge = (shard.edges || []).find((candidate) => (checkpoint(), candidate.id === edgeId));
      if (edge) break;
    }
    if (!edge) {
      for await (const resolution of readKnowledgeGraphResolutionShards(snapshot, index)) {
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
      const shard = await readKnowledgeGraphSourceShard(snapshot, entry);
      for (const node of shard.nodes || []) {
        checkpoint();
        if (required.has(node.id)) nodes.push(node);
      }
      if (nodes.length === required.size) break;
    }
    return explainKnowledgeGraphEdgeFromArtifact({
      nodes,
      edges: [edge],
      metadata: { knowledgeGraph: { digest: snapshot.pointer.snapshotDigest } },
    }, edgeId, { checkpoint });
  }
  throw new KnowledgeGraphError("edge_not_found", `Knowledge graph edge was not found: ${edgeId}`);
}

export async function queryKnowledgeGraphSnapshot(snapshot, args = {}, options = {}) {
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
  const start = await resolveSnapshotNode(
    snapshot,
    args.nodeId || args.from || args.query,
    { checkpoint },
  );
  const artifact = await materializeKnowledgeGraphRepository(snapshot, start.repositoryId, options);
  const adjusted = { ...args, ...(mode === "path" ? { from: start.node.id } : { nodeId: start.node.id }) };
  if (mode === "path") {
    const target = await resolveSnapshotNode(snapshot, args.to, { checkpoint });
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
    adjusted.to = target.node.id;
  }
  return withCorpusCompleteness(snapshot, queryKnowledgeGraph(artifact, adjusted, { checkpoint }));
}
