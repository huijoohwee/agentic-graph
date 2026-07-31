import {
  readKnowledgeGraphRepositoryIndex,
  readKnowledgeGraphResolutionShards,
  readKnowledgeGraphSourceParts,
} from "./store.mjs";

export async function* iterateKnowledgeGraphSnapshotShards(snapshot, options = {}) {
  if (typeof options.iterateSnapshotShards === "function") {
    for await (const entry of options.iterateSnapshotShards({
      snapshot,
      repositoryId: options.repositoryId,
    })) {
      options.checkpoint?.();
      if (!options.repositoryId || entry.repository?.repositoryId === options.repositoryId) {
        yield entry;
      }
    }
    return;
  }
  for (const repository of snapshot.manifest.repositories || []) {
    options.checkpoint?.();
    if (options.repositoryId && repository.repositoryId !== options.repositoryId) continue;
    const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
    options.checkpoint?.();
    for (const entry of index.sources || []) {
      options.checkpoint?.();
      for await (const shard of readKnowledgeGraphSourceParts(snapshot, entry)) {
        options.checkpoint?.();
        yield { repository, shard };
      }
    }
    for await (const shard of readKnowledgeGraphResolutionShards(snapshot, index)) {
      options.checkpoint?.();
      yield { repository, shard };
    }
  }
}
