import {
  compareStableStrings,
  KnowledgeGraphError,
} from "./contract.mjs";
import { assertExplainedEdges } from "./store-records.mjs";

export const KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA = "agenticgraph-knowledge-graph-repository-index/v3";
export const KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V2 = "agenticgraph-knowledge-graph-repository-index/v2";
export const KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V1 = "agenticgraph-knowledge-graph-repository-index/v1";
export const KNOWLEDGE_GRAPH_RESOLUTION_SHARD_SCHEMA = "agenticgraph-knowledge-graph-resolution-shard/v1";
export const MAX_RESOLUTION_SHARD_DIGESTS = 200_000;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const validDigest = (value) => /^[a-f0-9]{64}$/.test(String(value || ""));
const validCount = (value) => Number.isSafeInteger(value) && value >= 0;

function invalid(code, repositoryId, reason) {
  return new KnowledgeGraphError(
    code,
    `${reason}: ${String(repositoryId || "")}`,
    { repositoryId: String(repositoryId || "") },
  );
}

export function resolutionShardDigestsForIndex(index, options = {}) {
  const code = options.code || "repository_index_invalid";
  const repositoryId = index?.repositoryId;
  const hasSingular = hasOwn(index, "resolutionShardDigest");
  const hasPlural = hasOwn(index, "resolutionShardDigests");
  let digests;
  if (index?.schema === KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA
    || index?.schema === KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V2) {
    if (!hasPlural || hasSingular || !Array.isArray(index.resolutionShardDigests)) {
      throw invalid(code, repositoryId, "Repository index has an invalid v2 resolution shape");
    }
    digests = index.resolutionShardDigests;
  } else if (index?.schema === KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V1) {
    if (!hasSingular || hasPlural || typeof index.resolutionShardDigest !== "string") {
      throw invalid(code, repositoryId, "Repository index has an invalid v1 resolution shape");
    }
    digests = [index.resolutionShardDigest];
  } else {
    throw invalid(code, repositoryId, "Repository index schema is invalid");
  }
  if (!digests.length || digests.length > MAX_RESOLUTION_SHARD_DIGESTS
    || digests.some((digest) => !validDigest(digest))
    || new Set(digests).size !== digests.length) {
    throw invalid(code, repositoryId, "Repository index resolution digests are invalid");
  }
  return [...digests];
}

export function expectedResolutionEdgeCount(index, repository = null, options = {}) {
  const code = options.code || "repository_index_invalid";
  const repositoryId = index?.repositoryId;
  if (!Array.isArray(index?.sources) || !validCount(index?.graph?.nodes)
    || !validCount(index?.graph?.edges)) {
    throw invalid(code, repositoryId, "Repository index graph counts are invalid");
  }
  if (repository && (!validCount(repository.sourceCount)
    || index.graph.nodes !== repository.graph?.nodes
    || index.graph.edges !== repository.graph?.edges
    || repository.sourceCount !== index.sources.length)) {
    throw invalid(code, repositoryId, "Repository index does not match its manifest entry");
  }
  let sourceNodes = 0;
  let sourceEdges = 0;
  for (const source of index.sources) {
    if (!validCount(source?.nodeCount) || !validCount(source?.edgeCount)) {
      throw invalid(code, repositoryId, "Repository source graph counts are invalid");
    }
    sourceNodes += source.nodeCount;
    sourceEdges += source.edgeCount;
    if (!Number.isSafeInteger(sourceNodes) || !Number.isSafeInteger(sourceEdges)
      || sourceNodes > index.graph.nodes || sourceEdges > index.graph.edges) {
      throw invalid(code, repositoryId, "Repository resolution edge count is invalid");
    }
  }
  if (sourceNodes !== index.graph.nodes) {
    throw invalid(code, repositoryId, "Repository source node count does not match the index");
  }
  return index.graph.edges - sourceEdges;
}

export function createResolutionShardValidation(index, repository = null) {
  return {
    digests: resolutionShardDigestsForIndex(index, { code: "resolution_shard_invalid" }),
    edgeCount: 0,
    expectedEdges: expectedResolutionEdgeCount(index, repository, {
      code: "resolution_shard_invalid",
    }),
    lastEdgeId: "",
    repositoryId: index.repositoryId,
  };
}

export function validateResolutionShard(shard, state, checkpoint = () => {}) {
  if (shard?.schema !== KNOWLEDGE_GRAPH_RESOLUTION_SHARD_SCHEMA
    || shard.repositoryId !== state.repositoryId
    || !Array.isArray(shard.nodes)
    || shard.nodes.length !== 0
    || !Array.isArray(shard.edges)) {
    throw invalid("resolution_shard_invalid", state.repositoryId, "Resolution shard is invalid");
  }
  if (!shard.edges.length && (state.expectedEdges > 0 || state.digests.length !== 1)) {
    throw invalid("resolution_shard_invalid", state.repositoryId, "Resolution shard is unexpectedly empty");
  }
  assertExplainedEdges(shard.edges, null, checkpoint, {
    duplicateCode: "resolution_shard_invalid",
  });
  for (const edge of shard.edges) {
    checkpoint();
    if (state.lastEdgeId
      && compareStableStrings(state.lastEdgeId, edge.id) >= 0) {
      throw invalid(
        "resolution_shard_invalid",
        state.repositoryId,
        "Resolution shard edge order or uniqueness is invalid",
      );
    }
    state.lastEdgeId = edge.id;
    state.edgeCount += 1;
    if (state.edgeCount > state.expectedEdges) {
      throw invalid(
        "resolution_shard_invalid",
        state.repositoryId,
        "Resolution shard edge count exceeds the repository index",
      );
    }
  }
}

export function finishResolutionShardValidation(state) {
  if (state.edgeCount !== state.expectedEdges) {
    throw invalid(
      "resolution_shard_invalid",
      state.repositoryId,
      "Resolution shard edge count does not match the repository index",
    );
  }
}

export async function* validatedResolutionShards(
  index,
  repository,
  readShard,
  checkpoint = () => {},
) {
  const state = createResolutionShardValidation(index, repository);
  let position = 0;
  let complete = false;
  let failed = false;
  const readNext = async () => {
    const shard = await readShard(state.digests[position]);
    validateResolutionShard(shard, state, checkpoint);
    position += 1;
    return shard;
  };
  try {
    while (position < state.digests.length) yield await readNext();
    finishResolutionShardValidation(state);
    complete = true;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (!complete && !failed) {
      while (position < state.digests.length) await readNext();
      finishResolutionShardValidation(state);
    }
  }
}
