import {
  KNOWGRPH_STORAGE_API_VERSION,
  KNOWGRPH_STORAGE_ROUTE_PATHS,
  type KnowgrphStorageMutation,
  type KnowgrphStorageOutboxRecord,
  type KnowgrphStoragePushResponse,
} from '@/lib/storage/knowgrphStorageSyncContract'
import {
  commitKnowgrphStorageMutationUnit,
  type KnowgrphStorageCollections,
  type KnowgrphStorageDb,
} from '@/lib/storage/knowgrphStorageDb'
import { buildKnowgrphStorageBackoffDelayMs } from '@/lib/storage/knowgrphStorageBounds'
import type {
  KnowgrphStorageFetchLike,
  KnowgrphStorageSyncNowArgs,
  KnowgrphStorageSyncRunResult,
  QueueKnowgrphStorageMutationArgs,
} from '@/lib/storage/knowgrphStorageClientTypes'
import {
  bumpOutboxAttemptCount,
  ensureKnowgrphStorageNumericRepair,
  getDbState,
  normalizeNonNegativeInt,
  normalizeString,
  readPendingOutboxDocs,
  recordsEqual,
  sanitizeOutboxRecord,
} from '@/lib/storage/knowgrphStorageClientSupport'
import { createKnowgrphStorageOutboxRecord } from '@/lib/storage/knowgrphStorageOutboxRecord'
import {
  KnowgrphStorageRetryableTransportError,
  KnowgrphStorageRetryExhaustedError,
  buildApiOriginKey,
  buildKnowgrphStorageSyncAuthHeaders,
  fetchWithTimeout,
  getClientFetch,
  isNetworkLoadFailure,
  parseStorageResponseJson,
  resolveKnowgrphStorageApiUrl,
  sleep,
} from '@/lib/storage/knowgrphStorageClientTransport'

export type SyncPushOutcome = {
  pushedCount: number
  appliedCount: number
  conflictCount: number
  rejectedCount: number
  deferredCount: number
  conflictEntries: KnowgrphStorageSyncRunResult['conflictEntries']
  ackCursor: string | null
}

export const queueKnowgrphStorageMutation = async (
  args: QueueKnowgrphStorageMutationArgs,
): Promise<string> => {
  const dbState = await getDbState(args.dbState)
  await ensureKnowgrphStorageNumericRepair(dbState)
  const outboxRecord = createKnowgrphStorageOutboxRecord(args)
  await dbState.collections.syncOutbox.incrementalUpsert(outboxRecord)
  return outboxRecord.id
}

export const requestKnowgrphStoragePushWithRetry = async (args: {
  workspaceId: string
  deviceId: string
  mutations: KnowgrphStorageMutation[]
  baseUrl?: string | null
  sessionToken?: string | null
  fetchImpl?: KnowgrphStorageFetchLike
  maxRetryCount: number
  requestTimeoutMs?: number
  sleepImpl?: KnowgrphStorageSyncNowArgs['sleepImpl']
}): Promise<KnowgrphStoragePushResponse> => {
  const fetchImpl = getClientFetch(args.fetchImpl)
  const apiOrigin = buildApiOriginKey(args.baseUrl)
  let lastError: unknown = null
  for (let attemptIndex = 0; attemptIndex < args.maxRetryCount; attemptIndex += 1) {
    try {
      const response = await fetchWithTimeout({
        fetchImpl,
        input: resolveKnowgrphStorageApiUrl(KNOWGRPH_STORAGE_ROUTE_PATHS.push, args.baseUrl),
        timeoutMs: args.requestTimeoutMs,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...buildKnowgrphStorageSyncAuthHeaders(args.sessionToken),
          },
          body: JSON.stringify({
            apiVersion: KNOWGRPH_STORAGE_API_VERSION,
            workspaceId: args.workspaceId,
            deviceId: args.deviceId,
            mutations: args.mutations,
          }),
        },
      })
      if (response.status >= 500) {
        throw new KnowgrphStorageRetryableTransportError(
          `knowgrph storage push failed with ${response.status}`,
        )
      }
      const payload = await parseStorageResponseJson<
        KnowgrphStoragePushResponse | { ok?: false; error?: string }
      >(response, {
        requestLabel: 'knowgrph storage push',
        apiOrigin,
      })
      if (!response.ok || !('ok' in payload) || payload.ok !== true) {
        throw new Error(
          `knowgrph storage push failed: ${
            'error' in payload ? String(payload.error || 'request failed') : 'request failed'
          }`,
        )
      }
      return payload
    } catch (error) {
      lastError = error
      const retryable = error instanceof KnowgrphStorageRetryableTransportError
        || isNetworkLoadFailure(error)
      if (!retryable) throw error
      if (attemptIndex + 1 >= args.maxRetryCount) break
      await sleep(buildKnowgrphStorageBackoffDelayMs(attemptIndex), args.sleepImpl)
    }
  }
  throw new KnowgrphStorageRetryExhaustedError(
    `knowgrph storage push exhausted ${args.maxRetryCount} attempts: ${normalizeString(
      lastError instanceof Error ? lastError.message : lastError,
    ) || 'transport failed'}`,
  )
}

export const readConflictCanonicalPath = async (
  collections: KnowgrphStorageCollections,
  mutation: KnowgrphStorageMutation,
): Promise<string | null> => {
  if (mutation.entity === 'document') return normalizeString(mutation.record.canonicalPath) || null
  const documentId = normalizeString(mutation.record.documentId)
  if (!documentId) return null
  const document = await collections.documents.findOne(documentId).exec()
  return normalizeString(document?.get('canonicalPath')) || null
}

export const readMutationRevision = (mutation: KnowgrphStorageMutation): number | null => {
  if (mutation.entity === 'document') return normalizeNonNegativeInt(mutation.record.revision, 0)
  if (mutation.entity === 'graphSnapshot') return normalizeNonNegativeInt(mutation.record.graphRevision, 0)
  return null
}

export const pushKnowgrphStorageOutbox = async (
  args: Required<Pick<KnowgrphStorageSyncNowArgs, 'workspaceId'>> &
    Pick<KnowgrphStorageSyncNowArgs, 'baseUrl' | 'sessionToken' | 'fetchImpl' | 'requestTimeoutMs' | 'sleepImpl'> & {
      deviceId: string
      maxRetryCount: number
      pushBatchSize: number
      dbState: KnowgrphStorageDb
    },
): Promise<SyncPushOutcome> => {
  const { collections } = args.dbState
  const outboxDocs = await readPendingOutboxDocs(
    collections,
    args.workspaceId,
    args.maxRetryCount,
    args.pushBatchSize,
  )
  if (outboxDocs.length === 0) {
    return {
      pushedCount: 0,
      appliedCount: 0,
      conflictCount: 0,
      rejectedCount: 0,
      deferredCount: 0,
      conflictEntries: [],
      ackCursor: null,
    }
  }
  const mutations: KnowgrphStorageMutation[] = []
  for (const doc of outboxDocs) {
    const rawOutbox = doc.toJSON() as KnowgrphStorageOutboxRecord
    const sanitizedOutbox = sanitizeOutboxRecord(rawOutbox)
    if (!recordsEqual(rawOutbox, sanitizedOutbox)) {
      await doc.incrementalPatch({
        baseRevision: sanitizedOutbox.baseRevision,
        payload: sanitizedOutbox.payload,
        payloadHash: sanitizedOutbox.payloadHash,
        attemptCount: sanitizedOutbox.attemptCount,
        createdAtMs: sanitizedOutbox.createdAtMs,
        updatedAtMs: Date.now(),
      })
    }
    mutations.push(sanitizedOutbox.payload as unknown as KnowgrphStorageMutation)
  }
  const response = await requestKnowgrphStoragePushWithRetry({
    workspaceId: args.workspaceId,
    deviceId: args.deviceId,
    mutations,
    baseUrl: args.baseUrl,
    sessionToken: args.sessionToken,
    fetchImpl: args.fetchImpl,
    maxRetryCount: args.maxRetryCount,
    requestTimeoutMs: args.requestTimeoutMs,
    sleepImpl: args.sleepImpl,
  })
  let appliedCount = 0
  let conflictCount = 0
  let rejectedCount = 0
  const conflictEntries: KnowgrphStorageSyncRunResult['conflictEntries'] = []
  const handledMutationIds = new Set<string>()
  const nowMs = Date.now()
  for (const acknowledgement of response.acknowledgements) {
    handledMutationIds.add(acknowledgement.mutationId)
    const outboxDoc = outboxDocs.find(doc => doc.get('id') === acknowledgement.mutationId)
    if (!outboxDoc) continue
    if (acknowledgement.status === 'applied') {
      appliedCount += 1
      await commitKnowgrphStorageMutationUnit(args.dbState, { mutations: [
        { kind: 'remove', collectionName: 'syncOutbox', id: acknowledgement.mutationId },
        { kind: 'remove', collectionName: 'syncConflicts', id: acknowledgement.mutationId },
      ] })
      continue
    }
    const attemptCount = normalizeNonNegativeInt(outboxDoc.get('attemptCount'), 0) + 1
    if (acknowledgement.status === 'conflict') {
      const mutation = outboxDoc.get('payload') as unknown as KnowgrphStorageMutation
      await bumpOutboxAttemptCount(collections, acknowledgement.mutationId, {
        nextAttemptCount: attemptCount,
        nowMs,
        lastAckStatus: 'conflict',
        lastAckMessage: acknowledgement.message || null,
      })
      conflictCount += 1
      conflictEntries.push({
        mutationId: acknowledgement.mutationId,
        entity: acknowledgement.entity,
        recordId: acknowledgement.recordId,
        canonicalPath: await readConflictCanonicalPath(collections, mutation),
        localRevision: readMutationRevision(mutation),
        serverRevision: acknowledgement.serverRevision,
        message: acknowledgement.message || null,
      })
      continue
    }
    await bumpOutboxAttemptCount(collections, acknowledgement.mutationId, {
      nextAttemptCount: attemptCount,
      nowMs,
      lastAckStatus: 'rejected',
      lastAckMessage: acknowledgement.message || null,
    })
    rejectedCount += 1
  }
  let deferredCount = 0
  for (const doc of outboxDocs) {
    const id = normalizeString(doc.get('id'))
    if (!id || handledMutationIds.has(id)) continue
    await bumpOutboxAttemptCount(collections, id, {
      nextAttemptCount: normalizeNonNegativeInt(doc.get('attemptCount'), 0) + 1,
      nowMs,
      lastAckStatus: 'deferred',
      lastAckMessage: 'No acknowledgement received for queued mutation during the latest sync attempt.',
    })
    deferredCount += 1
  }
  return {
    pushedCount: outboxDocs.length,
    appliedCount,
    conflictCount,
    rejectedCount,
    deferredCount,
    conflictEntries,
    ackCursor: response.ackCursor || null,
  }
}
