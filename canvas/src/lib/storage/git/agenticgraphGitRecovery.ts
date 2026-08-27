import type {
  KnowgrphGitPersistedCache,
  KnowgrphGitRemoteRequest,
} from './knowgrphGitContracts'
import {
  buildKnowgrphGitRemoteTrackingRefName,
  listReachableKnowgrphGitObjects,
} from './knowgrphGitRepository'

export const acknowledgeMaterializedKnowgrphGitClone = async (args: {
  cache: KnowgrphGitPersistedCache
  request: KnowgrphGitRemoteRequest
  operationId: string
  claimToken: string
}): Promise<{ headObjectId: string; objectsReused: number } | null> => {
  const existing = await args.cache.getRepository(
    args.request.workspaceId,
    args.request.repositoryId,
  )
  if (!existing) return null
  const [localRef, trackingRef, headRef] = await Promise.all([
    args.cache.getRef(
      args.request.workspaceId,
      args.request.repositoryId,
      args.request.refName,
    ),
    args.cache.getRef(
      args.request.workspaceId,
      args.request.repositoryId,
      buildKnowgrphGitRemoteTrackingRefName(args.request.remoteId, args.request.refName),
    ),
    args.cache.getRef(args.request.workspaceId, args.request.repositoryId, 'HEAD'),
  ])
  const headMatches = headRef?.targetKind === 'symbolic'
    ? headRef.target === args.request.refName
    : headRef?.targetKind === 'direct' && headRef.target === localRef?.target
  if (
    existing.remoteId !== args.request.remoteId
    || existing.canonicalPathScope !== args.request.canonicalPathScope
    || existing.headRefName !== args.request.refName
    || localRef?.targetKind !== 'direct'
    || trackingRef?.targetKind !== 'direct'
    || trackingRef.target !== localRef.target
    || !headMatches
  ) throw new Error('Clone target repository already exists')
  const objects = await listReachableKnowgrphGitObjects({
    cache: args.cache,
    workspaceId: args.request.workspaceId,
    repositoryId: args.request.repositoryId,
    commitObjectId: localRef.target,
  })
  if (!await args.cache.acknowledgeClaimedOutbox(args.operationId, args.claimToken)) {
    throw new Error('Git clone acknowledgement was rejected')
  }
  return { headObjectId: localRef.target, objectsReused: objects.length }
}
