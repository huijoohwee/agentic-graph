import { hashStringToHex } from '@/lib/hash/stringHash'
import { getKnowgrphStorageDeviceId } from '@/lib/storage/knowgrphStorageDeviceIdentity'
import {
  buildKnowgrphStorageOutboxId,
  KNOWGRPH_STORAGE_API_VERSION,
  KNOWGRPH_STORAGE_ROUTE_PATHS,
  type KnowgrphStorageMutation,
  type KnowgrphStorageOutboxRecord,
  type KnowgrphStoragePushResponse,
} from '@/lib/storage/knowgrphStorageSyncContract'
import type { KnowgrphStorageCollections } from '@/lib/storage/knowgrphStorageDb'
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
  removeOutboxDocById,
  sanitizeMutationRecord,
  sanitizeOutboxRecord,
} from '@/lib/storage/knowgrphStorageClientSupport'
import {
  KnowgrphStorageRetryableTransportError,
  KnowgrphStorageRetryExhaustedError,
  buildApiOriginKey,
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
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) throw new Error('workspaceId is required to queue a storage mutation')
  const dbState = await getDbState(args.dbState)
  await ensureKnowgrphStorageNumericRepair(dbState)
  const deviceId = normalizeString(args.deviceId) || getKnowgrphStorageDeviceId()
  const mutationId = buildKnowgrphStorageOutboxId('mut')
  const recordId = normalizeString(args.recordId) || normalizeString(args.record.id)
  if (!recordId) throw new Error('recordId is required to queue a storage mutation')
  const sanitizedRecord = sanitizeMutationRecord(args.entity, args.record as KnowgrphStorageMutation['record'])
  const payload: KnowgrphStorageMutation = {
    mutationId,
    workspaceId,
    entity: args.entity,
    op: args.op,
    recordId,
    baseRevision: args.baseRevision ?? null,
    record: sanitizedRecord as never,
  }
  const payloadText = JSON.stringify(payload)
  const nowMs = Date.now()
  await dbState.collections.syncOutbox.incrementalUpsert(sanitizeOutboxRecord({
    id: mutationId,
    workspaceId,
    deviceId,
    entity: args.entity,
    op: args.op,
    recordId,
    baseRevision: args.baseRevision ?? null,
    payload: payload as unknown as Record<string, unknown>,
    payloadHash: hashStringToHex(payloadText),
    attemptCount: 0,
    lastAckStatus: '',
    lastAckMessage: null,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  }))
  return mutationId
}

export const requestKnowgrphStoragePushWithRetry = async (args: {
  workspaceId: string
  deviceId: string
  mutations: KnowgrphStorageMutation[]
  baseUrl?: string | null
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
          headers: { 'content-type': 'application/json' },
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
    Pick<KnowgrphStorageSyncNowArgs, 'baseUrl' | 'fetchImpl' | 'requestTimeoutMs' | 'sleepImpl'> & {
      deviceId: string
      maxRetryCount: number
      pushBatchSize: number
      collections: KnowgrphStorageCollections
    },
): Promise<SyncPushOutcome> => {
  const outboxDocs = await readPendingOutboxDocs(
    args.collections,
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
      await removeOutboxDocById(args.collections, acknowledgement.mutationId)
      continue
    }
    const attemptCount = normalizeNonNegativeInt(outboxDoc.get('attemptCount'), 0) + 1
    if (acknowledgement.status === 'conflict') {
      const mutation = outboxDoc.get('payload') as unknown as KnowgrphStorageMutation
      await bumpOutboxAttemptCount(args.collections, acknowledgement.mutationId, {
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
        canonicalPath: await readConflictCanonicalPath(args.collections, mutation),
        localRevision: readMutationRevision(mutation),
        serverRevision: acknowledgement.serverRevision,
        message: acknowledgement.message || null,
      })
      continue
    }
    await bumpOutboxAttemptCount(args.collections, acknowledgement.mutationId, {
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
    await bumpOutboxAttemptCount(args.collections, id, {
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
