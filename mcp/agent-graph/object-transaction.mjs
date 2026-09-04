import {
  AgentGraphError,
  compareStableStrings,
} from "./contract.mjs";
import {
  readAgentGraphRepositoryIndex,
  readAgentGraphSnapshotIfPresent,
  removeAgentGraphObject,
  sourceObjectDigestsForEntry,
} from "./store.mjs";
import { resolutionShardDigestsForIndex } from "./resolution-store-validation.mjs";
import { withAgentGraphIngestLock } from "./ingest-lock.mjs";

async function reachableObjectDigests(pointerPath, options) {
  const reachable = new Set();
  const snapshot = await readAgentGraphSnapshotIfPresent(pointerPath, options);
  if (!snapshot) return reachable;
  reachable.add(snapshot.pointer.manifestDigest);
  for (const repository of snapshot.manifest.repositories || []) {
    reachable.add(repository.indexDigest);
    const index = await readAgentGraphRepositoryIndex(snapshot, repository);
    for (const digest of resolutionShardDigestsForIndex(index)) reachable.add(digest);
    for (const source of index.sources || []) {
      for (const digest of await sourceObjectDigestsForEntry(snapshot, source)) reachable.add(digest);
    }
  }
  return reachable;
}

async function rollbackObjectTransaction(pointerPath, transaction, options) {
  if (transaction.committed || !transaction.createdDigests.size) return;
  const reachable = await reachableObjectDigests(pointerPath, options);
  for (const digest of [...transaction.createdDigests].sort(compareStableStrings)) {
    if (!reachable.has(digest)) {
      await removeAgentGraphObject(pointerPath, digest, options);
    }
  }
  transaction.createdDigests.clear();
}

export async function runAgentGraphObjectTransaction(
  pointerPath,
  options,
  operation,
) {
  return withAgentGraphIngestLock(pointerPath, options, async () => {
    const transaction = { committed: false, createdDigests: new Set() };
    try {
      return await operation(transaction);
    } catch (error) {
      try {
        await rollbackObjectTransaction(pointerPath, transaction, {
          allowedRoot: options.allowedRoot,
        });
      } catch (rollbackError) {
        throw new AgentGraphError(
          "artifact_rollback_failed",
          "Knowledge graph ingestion failed and its unpublished object rollback could not be completed.",
          {
            causeCode: String(error?.code || "agent_graph_error"),
            rollbackCode: String(rollbackError?.code || "rollback_failed"),
          },
        );
      }
      throw error;
    }
  });
}
