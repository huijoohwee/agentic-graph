import {
  checkKnowledgeGraphBudget,
  KnowledgeGraphError,
} from "./contract.mjs";
import {
  readKnowledgeGraphRepositoryIndex,
  readKnowledgeGraphResolutionShards,
  readKnowledgeGraphSourceParts,
} from "./store.mjs";

const boundedInteger = (value, fallback, maximum) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
};

export async function materializeKnowledgeGraphRepository(snapshot, repositoryId, options = {}) {
  const { maxNodes = 250_000, maxEdges = 1_000_000 } = options;
  const budget = { ...snapshot.readBudget, ...options };
  let operations = 0;
  const checkpoint = () => {
    operations += 1;
    if (operations % 128 === 0) {
      checkKnowledgeGraphBudget({ ...budget, stage: "snapshot-materialization" });
    }
  };
  checkKnowledgeGraphBudget({ ...budget, stage: "snapshot-materialization" });
  const repository = (snapshot.manifest.repositories || [])
    .find((entry) => entry.repositoryId === repositoryId);
  if (!repository) {
    throw new KnowledgeGraphError("repository_not_found", `Repository is not in this graph: ${repositoryId}`);
  }
  const nodeLimit = boundedInteger(maxNodes, 250_000, 1_000_000);
  const edgeLimit = boundedInteger(maxEdges, 1_000_000, 4_000_000);
  if (repository.graph.nodes > nodeLimit || repository.graph.edges > edgeLimit) {
    throw new KnowledgeGraphError(
      "repository_projection_limit",
      "Repository graph exceeds the bounded traversal projection.",
      {
        repositoryId,
        graph: repository.graph,
        limits: { maxNodes: nodeLimit, maxEdges: edgeLimit },
      },
    );
  }
  const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
  const nodes = [];
  const edges = [];
  for (const entry of index.sources) {
    checkpoint();
    for await (const part of readKnowledgeGraphSourceParts(snapshot, entry)) {
      for (const node of part.nodes) {
        checkpoint();
        nodes.push(node);
      }
      for (const edge of part.edges) {
        checkpoint();
        edges.push(edge);
      }
    }
  }
  for await (const resolution of readKnowledgeGraphResolutionShards(snapshot, index)) {
    for (const edge of resolution.edges) {
      checkpoint();
      edges.push(edge);
    }
  }
  checkKnowledgeGraphBudget({ ...budget, stage: "snapshot-materialization" });
  return {
    context: "knowgrph-knowledge-graph",
    type: "Graph",
    nodes,
    edges,
    metadata: {
      knowledgeGraph: {
        digest: snapshot.pointer.snapshotDigest,
        parserCoverage: snapshot.manifest.parserCoverage,
        vectorStore: false,
        modelCalls: 0,
      },
    },
    manifest: { sources: index.sources },
    diagnostics: snapshot.manifest.diagnostics,
  };
}
