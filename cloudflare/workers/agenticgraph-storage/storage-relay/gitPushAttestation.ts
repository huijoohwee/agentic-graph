import { StorageRelayError } from './storageRelaySafety'

type GitCommitGraph = {
  treeOid: string
  parentOids: readonly string[]
}

export const assertAppliedCommitGraph = (
  commit: GitCommitGraph,
  expectedParentOid: string,
  expectedTreeOid: string,
): void => {
  const hasExpectedParent = commit.parentOids.length === 1
    && commit.parentOids[0] === expectedParentOid
  if (commit.treeOid !== expectedTreeOid || !hasExpectedParent) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
}
