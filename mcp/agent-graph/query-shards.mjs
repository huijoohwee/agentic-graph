import {
  readAgentGraphRepositoryIndex,
  readAgentGraphResolutionShards,
  readAgentGraphSourceParts,
} from "./store.mjs";

export async function* iterateAgentGraphSnapshotShards(snapshot, options = {}) {
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
    const index = await readAgentGraphRepositoryIndex(snapshot, repository);
    options.checkpoint?.();
    for (const entry of index.sources || []) {
      options.checkpoint?.();
      for await (const shard of readAgentGraphSourceParts(snapshot, entry)) {
        options.checkpoint?.();
        yield { repository, shard };
      }
    }
    for await (const shard of readAgentGraphResolutionShards(snapshot, index)) {
      options.checkpoint?.();
      yield { repository, shard };
    }
  }
}
