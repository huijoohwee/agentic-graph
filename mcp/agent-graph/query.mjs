import {
  checkAgentGraphBudget,
  compareStableStrings,
  AgentGraphError,
  AGENT_GRAPH_SCHEMA_VERSION,
  sha256,
} from "./contract.mjs";
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

function createBoundedBest(capacity, compare) {
  const heap = [];
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
      const left = index * 2 + 1, right = left + 1;
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
      if (heap.length < capacity) { heap.push(entry); siftUp(heap.length - 1); }
      else if (capacity && compare(entry, heap[0]) < 0) { heap[0] = entry; siftDown(0); }
    },
    values() { return heap.sort(compare); },
  };
}

function retainConnectedProjectionWithinBytes({ nodes, edges, seeds, degreeByNodeId, limit, maxBytes }) {
  const baseBytes = Buffer.byteLength('{"context":"agentic-graph-agent-graph-projection","type":"Graph","nodes":[],"edges":[]}');
  const nodeBytes = new Map(nodes.map((node) => [node.id, Buffer.byteLength(JSON.stringify(node))]));
  const edgeBytes = new Map(edges.map((edge) => [edge.id, Buffer.byteLength(JSON.stringify(edge))]));
  const retainedNodes = new Map(), retainedEdges = new Map();
  let retainedNodeBytes = 0, retainedEdgeBytes = 0;
  const fits = (nodeCount, edgeCount, nodeCost, edgeCost) => baseBytes + nodeCost + Math.max(0, nodeCount - 1)
    + edgeCost + Math.max(0, edgeCount - 1) <= maxBytes;
  const addNode = (node) => {
    if (retainedNodes.has(node.id) || retainedNodes.size >= limit) return retainedNodes.has(node.id);
    const cost = nodeBytes.get(node.id);
    if (!Number.isFinite(cost) || !fits(retainedNodes.size + 1, retainedEdges.size, retainedNodeBytes + cost, retainedEdgeBytes)) return false;
    retainedNodes.set(node.id, node); retainedNodeBytes += cost; return true;
  };
  const addEdge = (edge) => {
    if (retainedEdges.has(edge.id) || !retainedNodes.has(edge.source) || !retainedNodes.has(edge.target)) return false;
    const cost = edgeBytes.get(edge.id);
    if (!Number.isFinite(cost) || !fits(retainedNodes.size, retainedEdges.size + 1, retainedNodeBytes, retainedEdgeBytes + cost)) return false;
    retainedEdges.set(edge.id, edge); retainedEdgeBytes += cost; return true;
  };
  const comparePriority = (left, right) => (
    (degreeByNodeId.get(right.id) || 0) - (degreeByNodeId.get(left.id) || 0)
      || compareStableStrings(left.id, right.id)
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const id of seeds) { const node = nodeById.get(id); if (node) addNode(node); }
  for (const edge of edges) {
    if (!retainedNodes.has(edge.source) && !retainedNodes.has(edge.target)) continue;
    const endpoints = [nodeById.get(edge.source), nodeById.get(edge.target)].filter(Boolean).sort(comparePriority);
    for (const node of endpoints) addNode(node);
    addEdge(edge);
  }
  for (const node of [...nodes].sort(comparePriority)) addNode(node);
  return {
    nodes: [...retainedNodes.values()],
    edges: [...retainedEdges.values()],
    truncated: retainedNodes.size !== nodes.length || retainedEdges.size !== edges.length,
  };
}

export async function projectAgentGraphSnapshot(snapshot, limitRaw = 200, options = {}) {
  const checkpoint = createQueryCheckpoint(options, "snapshot-projection");
  const limit = boundedInteger(limitRaw, 200, 1, 1000);
  const projectionByteLimit = normalizeAgentGraphProjectionByteLimit(options.projectionByteLimit);
  // Seed a small connected core, then spend the remaining projection budget
  // on its strongest neighbors instead of unrelated global hubs.
  const seedLimit = snapshot.manifest.graph.nodes <= limit
    ? limit
    : Math.min(limit, Math.max(1, Math.min(16, Math.ceil(limit * 0.05))));
  const degreeByNodeId = new Map();
  for await (const { shard } of iterateAgentGraphSnapshotShards(snapshot, {
    ...options,
    checkpoint,
  })) {
    for (const edge of shard.edges || []) {
      checkpoint();
      degreeByNodeId.set(edge.source, (degreeByNodeId.get(edge.source) || 0) + 1);
      degreeByNodeId.set(edge.target, (degreeByNodeId.get(edge.target) || 0) + 1);
    }
  }
  const compareConnectedNodes = (left, right) => (
    right[1] - left[1] || compareStableStrings(left[0], right[0])
  );
  const seedIds = new Set([...degreeByNodeId.entries()]
    .sort(compareConnectedNodes).slice(0, seedLimit).map(([id]) => id));
  if (seedIds.size < seedLimit) {
    const isolated = createBoundedBest(seedLimit - seedIds.size,
      (left, right) => compareStableStrings(left.id, right.id));
    for await (const { shard } of iterateAgentGraphSnapshotShards(snapshot, { ...options, checkpoint })) {
      for (const node of shard.nodes || []) {
        checkpoint();
        if (!degreeByNodeId.has(node.id)) isolated.add(node);
      }
    }
    for (const node of isolated.values()) seedIds.add(node.id);
  }

  const compareConnectedEdges = (left, right) => {
    const rank = edge => {
      const source = degreeByNodeId.get(edge.source) || 0, target = degreeByNodeId.get(edge.target) || 0;
      return [Number(seedIds.has(edge.source)) + Number(seedIds.has(edge.target)), Math.max(source, target), Math.min(source, target)];
    };
    const a = rank(left), b = rank(right);
    return b[0] - a[0] || b[1] - a[1] || b[2] - a[2] || compareStableStrings(left.id, right.id);
  };
  const candidateEdges = createBoundedBest(limit, compareConnectedEdges);
  const nodeById = new Map();
  for await (const { shard } of iterateAgentGraphSnapshotShards(snapshot, {
    ...options,
    checkpoint,
  })) {
    for (const node of shard.nodes || []) {
      checkpoint();
      if (seedIds.has(node.id)) nodeById.set(node.id, node);
    }
    for (const edge of shard.edges || []) {
      checkpoint();
      if (seedIds.has(edge.source) || seedIds.has(edge.target)) candidateEdges.add(edge);
    }
  }
  const nodeIds = new Set(seedIds), edges = [];
  for (const edge of candidateEdges.values()) {
    const added = Number(!nodeIds.has(edge.source)) + Number(!nodeIds.has(edge.target));
    if (nodeIds.size + added > limit) continue;
    edges.push(edge); nodeIds.add(edge.source); nodeIds.add(edge.target);
  }
  if (nodeById.size < nodeIds.size) {
    for await (const { shard } of iterateAgentGraphSnapshotShards(snapshot, { ...options, checkpoint })) {
      for (const node of shard.nodes || []) {
        checkpoint();
        if (nodeIds.has(node.id) && !nodeById.has(node.id)) nodeById.set(node.id, node);
      }
      if (nodeById.size === nodeIds.size) break;
    }
  }
  const candidateNodes = [...nodeById.values()];
  const candidateEdgeList = candidateEdges.values().filter((edge) => (
    nodeById.has(edge.source) && nodeById.has(edge.target)
  ));
  const connectedFit = retainConnectedProjectionWithinBytes({ nodes: candidateNodes, edges: candidateEdgeList,
    seeds: [...seedIds].sort((left, right) => compareConnectedNodes(
      [left, degreeByNodeId.get(left) || 0], [right, degreeByNodeId.get(right) || 0])),
    degreeByNodeId, limit, maxBytes: projectionByteLimit });
  const nodes = connectedFit.nodes.sort((left, right) => compareStableStrings(left.id, right.id));
  const retainedNodeIds = new Set(nodes.map((node) => node.id));
  const projectedEdges = connectedFit.edges.filter((edge) => retainedNodeIds.has(edge.source) && retainedNodeIds.has(edge.target));
  const graph = snapshot.manifest.graph;
  const byteBounded = fitAgentGraphProjectionRecords({
    nodes,
    edges: projectedEdges,
    maxBytes: projectionByteLimit,
  });
  const countTruncated = graph.nodes > nodes.length || graph.edges > projectedEdges.length;
  const byteTruncated = connectedFit.truncated || byteBounded.truncated;
  const truncated = countTruncated || byteTruncated;
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
      : byteTruncated
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
      metadata: {
        agentGraph: {
          schemaVersion: AGENT_GRAPH_SCHEMA_VERSION,
          snapshotDigest: snapshot.pointer.snapshotDigest,
        },
      },
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
