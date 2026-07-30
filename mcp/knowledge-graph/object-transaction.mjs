import {
  KnowledgeGraphError,
  compareStableStrings,
} from "./contract.mjs";
import {
  readKnowledgeGraphRepositoryIndex,
  readKnowledgeGraphSnapshotIfPresent,
  removeKnowledgeGraphObject,
} from "./store.mjs";
import { withKnowledgeGraphIngestLock } from "./ingest-lock.mjs";

async function reachableObjectDigests(pointerPath, options) {
  const reachable = new Set();
  const snapshot = await readKnowledgeGraphSnapshotIfPresent(pointerPath, options);
  if (!snapshot) return reachable;
  reachable.add(snapshot.pointer.manifestDigest);
  for (const repository of snapshot.manifest.repositories || []) {
    reachable.add(repository.indexDigest);
    const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
    reachable.add(index.resolutionShardDigest);
    for (const source of index.sources || []) reachable.add(source.shardDigest);
  }
  return reachable;
}

async function rollbackObjectTransaction(pointerPath, transaction, options) {
  if (transaction.committed || !transaction.createdDigests.size) return;
  const reachable = await reachableObjectDigests(pointerPath, options);
  for (const digest of [...transaction.createdDigests].sort(compareStableStrings)) {
    if (!reachable.has(digest)) {
      await removeKnowledgeGraphObject(pointerPath, digest, options);
    }
  }
  transaction.createdDigests.clear();
}

export async function runKnowledgeGraphObjectTransaction(
  pointerPath,
  options,
  operation,
) {
  return withKnowledgeGraphIngestLock(pointerPath, options, async () => {
    const transaction = { committed: false, createdDigests: new Set() };
    try {
      return await operation(transaction);
    } catch (error) {
      try {
        await rollbackObjectTransaction(pointerPath, transaction, {
          allowedRoot: options.allowedRoot,
        });
      } catch (rollbackError) {
        throw new KnowledgeGraphError(
          "artifact_rollback_failed",
          "Knowledge graph ingestion failed and its unpublished object rollback could not be completed.",
          {
            causeCode: String(error?.code || "knowledge_graph_error"),
            rollbackCode: String(rollbackError?.code || "rollback_failed"),
          },
        );
      }
      throw error;
    }
  });
}
