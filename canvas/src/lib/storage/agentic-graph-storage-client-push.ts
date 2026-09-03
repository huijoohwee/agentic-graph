import {
  AGENTIC_OS_STORAGE_API_VERSION,
  AGENTIC_OS_STORAGE_ROUTE_PATHS,
  type AgenticGraphStorageMutation,
  type AgenticGraphStorageOutboxRecord,
  type AgenticGraphStoragePushResponse,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  commitAgenticGraphStorageMutationUnit,
  type AgenticGraphStorageCollections,
  type AgenticGraphStorageDb,
} from '@/lib/storage/agentic-graph-storage-db'
import { buildAgenticGraphStorageBackoffDelayMs } from '@/lib/storage/agentic-graph-storage-bounds'
import type {
  AgenticGraphStorageFetchLike,
  AgenticGraphStorageSyncNowArgs,
  AgenticGraphStorageSyncRunResult,
  QueueAgenticGraphStorageMutationArgs,
} from '@/lib/storage/agentic-graph-storage-client-types'
import {
  bumpOutboxAttemptCount,
  ensureAgenticGraphStorageNumericRepair,
  getDbState,
  normalizeNonNegativeInt,
  normalizeString,
  readPendingOutboxDocs,
  recordsEqual,
  sanitizeOutboxRecord,
} from '@/lib/storage/agentic-graph-storage-client-support'
import { createAgenticGraphStorageOutboxRecord } from '@/lib/storage/agentic-graph-storage-outbox-record'
import {
  AgenticGraphStorageRetryableTransportError,
  AgenticGraphStorageRetryExhaustedError,
  buildApiOriginKey,
  buildAgenticGraphStorageSyncAuthHeaders,
  fetchWithTimeout,
  getClientFetch,
  isNetworkLoadFailure,
  parseStorageResponseJson,
  resolveAgenticGraphStorageApiUrl,
  sleep,
} from '@/lib/storage/agentic-graph-storage-client-transport'

export type SyncPushOutcome = {
  pushedCount: number
  appliedCount: number
  conflictCount: number
  rejectedCount: number
  deferredCount: number
  conflictEntries: AgenticGraphStorageSyncRunResult['conflictEntries']
  ackCursor: string | null
}

export const queueAgenticGraphStorageMutation = async (
  args: QueueAgenticGraphStorageMutationArgs,
): Promise<string> => {
  const dbState = await getDbState(args.dbState)
  await ensureAgenticGraphStorageNumericRepair(dbState)
  const outboxRecord = createAgenticGraphStorageOutboxRecord(args)
  await dbState.collections.syncOutbox.incrementalUpsert(outboxRecord)
  return outboxRecord.id
}

export const requestAgenticGraphStoragePushWithRetry = async (args: {
  workspaceId: string
  deviceId: string
  mutations: AgenticGraphStorageMutation[]
  baseUrl?: string | null
  sessionToken?: string | null
  fetchImpl?: AgenticGraphStorageFetchLike
  maxRetryCount: number
  requestTimeoutMs?: number
  sleepImpl?: AgenticGraphStorageSyncNowArgs['sleepImpl']
}): Promise<AgenticGraphStoragePushResponse> => {
  const fetchImpl = getClientFetch(args.fetchImpl)
  const apiOrigin = buildApiOriginKey(args.baseUrl)
  let lastError: unknown = null
  for (let attemptIndex = 0; attemptIndex < args.maxRetryCount; attemptIndex += 1) {
    try {
      const response = await fetchWithTimeout({
        fetchImpl,
        input: resolveAgenticGraphStorageApiUrl(AGENTIC_OS_STORAGE_ROUTE_PATHS.push, args.baseUrl),
        timeoutMs: args.requestTimeoutMs,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...buildAgenticGraphStorageSyncAuthHeaders(args.sessionToken),
          },
          body: JSON.stringify({
            apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
            workspaceId: args.workspaceId,
            deviceId: args.deviceId,
            mutations: args.mutations,
          }),
        },
      })
      if (response.status >= 500) {
        throw new AgenticGraphStorageRetryableTransportError(
          `agentic-graph storage push failed with ${response.status}`,
        )
      }
      const payload = await parseStorageResponseJson<
        AgenticGraphStoragePushResponse | { ok?: false; error?: string }
      >(response, {
        requestLabel: 'agentic-graph storage push',
        apiOrigin,
      })
      if (!response.ok || !('ok' in payload) || payload.ok !== true) {
        throw new Error(
          `agentic-graph storage push failed: ${
            'error' in payload ? String(payload.error || 'request failed') : 'request failed'
          }`,
        )
      }
      return payload
    } catch (error) {
      lastError = error
      const retryable = error instanceof AgenticGraphStorageRetryableTransportError
        || isNetworkLoadFailure(error)
      if (!retryable) throw error
      if (attemptIndex + 1 >= args.maxRetryCount) break
      await sleep(buildAgenticGraphStorageBackoffDelayMs(attemptIndex), args.sleepImpl)
    }
  }
  throw new AgenticGraphStorageRetryExhaustedError(
    `agentic-graph storage push exhausted ${args.maxRetryCount} attempts: ${normalizeString(
      lastError instanceof Error ? lastError.message : lastError,
    ) || 'transport failed'}`,
  )
}

export const readConflictCanonicalPath = async (
  collections: AgenticGraphStorageCollections,
  mutation: AgenticGraphStorageMutation,
): Promise<string | null> => {
  if (mutation.entity === 'document') return normalizeString(mutation.record.canonicalPath) || null
  const documentId = normalizeString(mutation.record.documentId)
  if (!documentId) return null
  const document = await collections.documents.findOne(documentId).exec()
  return normalizeString(document?.get('canonicalPath')) || null
}

export const readMutationRevision = (mutation: AgenticGraphStorageMutation): number | null => {
  if (mutation.entity === 'document') return normalizeNonNegativeInt(mutation.record.revision, 0)
  if (mutation.entity === 'graphSnapshot') return normalizeNonNegativeInt(mutation.record.graphRevision, 0)
  return null
}

export const pushAgenticGraphStorageOutbox = async (
  args: Required<Pick<AgenticGraphStorageSyncNowArgs, 'workspaceId'>> &
    Pick<AgenticGraphStorageSyncNowArgs, 'baseUrl' | 'sessionToken' | 'fetchImpl' | 'requestTimeoutMs' | 'sleepImpl'> & {
      deviceId: string
      maxRetryCount: number
      pushBatchSize: number
      dbState: AgenticGraphStorageDb
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
  const mutations: AgenticGraphStorageMutation[] = []
  for (const doc of outboxDocs) {
    const rawOutbox = doc.toJSON() as AgenticGraphStorageOutboxRecord
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
    mutations.push(sanitizedOutbox.payload as unknown as AgenticGraphStorageMutation)
  }
  const response = await requestAgenticGraphStoragePushWithRetry({
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
  const conflictEntries: AgenticGraphStorageSyncRunResult['conflictEntries'] = []
  const handledMutationIds = new Set<string>()
  const nowMs = Date.now()
  for (const acknowledgement of response.acknowledgements) {
    handledMutationIds.add(acknowledgement.mutationId)
    const outboxDoc = outboxDocs.find(doc => doc.get('id') === acknowledgement.mutationId)
    if (!outboxDoc) continue
    if (acknowledgement.status === 'applied') {
      appliedCount += 1
      await commitAgenticGraphStorageMutationUnit(args.dbState, { mutations: [
        { kind: 'remove', collectionName: 'syncOutbox', id: acknowledgement.mutationId },
        { kind: 'remove', collectionName: 'syncConflicts', id: acknowledgement.mutationId },
      ] })
      continue
    }
    const attemptCount = normalizeNonNegativeInt(outboxDoc.get('attemptCount'), 0) + 1
    if (acknowledgement.status === 'conflict') {
      const mutation = outboxDoc.get('payload') as unknown as AgenticGraphStorageMutation
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
