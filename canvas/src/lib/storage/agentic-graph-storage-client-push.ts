import {
  AGENTIC_OS_STORAGE_SYNC_API_VERSION,
  AGENTIC_OS_STORAGE_ROUTE_PATHS,
  type AgenticGraphStorageMutation,
  type AgenticGraphStorageOutboxRecord,
  type AgenticGraphStoragePushResponse,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import { planAgenticGraphStorageAcknowledgedChild, readAgenticGraphStorageAcknowledgedChildState } from '@/lib/storage/agentic-graph-storage-child-state'
import {
  compareAndCommitAgenticGraphStorageMutationUnit,
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
  cancelStorageStream,
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
            apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION,
            workspaceId: args.workspaceId,
            deviceId: args.deviceId,
            mutations: args.mutations,
          }),
        },
      })
      if (response.status >= 500) {
        cancelStorageStream(response.body, 'storage push response will be retried')
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
      if (payload.apiVersion !== AGENTIC_OS_STORAGE_SYNC_API_VERSION) {
        throw new Error('Storage acknowledgement protocol version is unsupported.')
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
  return mutation.record.syncRevision ?? null
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
  const emptyOutcome: SyncPushOutcome = { pushedCount: 0, appliedCount: 0, conflictCount: 0,
    rejectedCount: 0, deferredCount: 0, conflictEntries: [], ackCursor: null }
  if (outboxDocs.length === 0) return emptyOutcome
  const mutations: AgenticGraphStorageMutation[] = []
  const sentById = new Map<string, AgenticGraphStorageOutboxRecord>()
  for (const doc of outboxDocs) {
    const raw = doc.toJSON() as AgenticGraphStorageOutboxRecord
    if (raw.entity !== 'document' && raw.syncApiVersion !== AGENTIC_OS_STORAGE_SYNC_API_VERSION) {
      const message = 'This offline child edit predates sync revisions. Review the remote candidate before retrying.'
      const committed = await compareAndCommitAgenticGraphStorageMutationUnit(args.dbState, {
        conditions: [{ collectionName: 'syncOutbox', selector: { id: raw.id }, records: [raw] }],
        mutations: [{ kind: 'upsert', collectionName: 'syncOutbox', record: { ...raw,
          lastAckStatus: 'conflict', lastAckMessage: message, updatedAtMs: Date.now() } }],
      })
      if (committed) {
        emptyOutcome.conflictCount += 1
        emptyOutcome.conflictEntries.push({ mutationId: raw.id, entity: raw.entity, recordId: raw.recordId,
          canonicalPath: await readConflictCanonicalPath(collections, raw.payload as unknown as AgenticGraphStorageMutation),
          localRevision: null, serverRevision: null, message })
      }
      continue
    }
    let sent = sanitizeOutboxRecord(raw)
    if (!recordsEqual(raw, sent)) {
      sent = { ...sent, updatedAtMs: Date.now() }
      const committed = await compareAndCommitAgenticGraphStorageMutationUnit(args.dbState, {
        conditions: [{ collectionName: 'syncOutbox', selector: { id: raw.id }, records: [raw] }],
        mutations: [{ kind: 'upsert', collectionName: 'syncOutbox', record: sent }],
      })
      if (!committed) continue
    }
    sentById.set(sent.id, sent)
    mutations.push(sent.payload as unknown as AgenticGraphStorageMutation)
  }
  if (mutations.length === 0) return emptyOutcome
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
  if (response.workspaceId !== args.workspaceId || !Array.isArray(response.acknowledgements)) {
    throw new Error('Storage acknowledgements do not match the sent workspace.')
  }
  const handledMutationIds = new Set<string>()
  const childStates = new Map<string, ReturnType<typeof readAgenticGraphStorageAcknowledgedChildState>>()
  for (const acknowledgement of response.acknowledgements) {
    if (!acknowledgement || typeof acknowledgement !== 'object') throw new Error('Invalid storage acknowledgement')
    const sent = sentById.get(acknowledgement.mutationId)
    if (!sent || handledMutationIds.has(sent.id) || acknowledgement.entity !== sent.entity
      || acknowledgement.recordId !== sent.recordId || !['applied', 'conflict', 'rejected'].includes(acknowledgement.status)) {
      throw new Error('Storage acknowledgement does not match one sent mutation.')
    }
    childStates.set(sent.id, readAgenticGraphStorageAcknowledgedChildState(
      sent.payload as unknown as AgenticGraphStorageMutation, acknowledgement))
    handledMutationIds.add(sent.id)
  }
  let appliedCount = 0, conflictCount = emptyOutcome.conflictCount, rejectedCount = 0, deferredCount = 0
  const conflictEntries = emptyOutcome.conflictEntries
  const nowMs = Date.now()
  const recordStatus = (sent: AgenticGraphStorageOutboxRecord, status: 'conflict' | 'rejected' | 'deferred', message: string | null) =>
    compareAndCommitAgenticGraphStorageMutationUnit(args.dbState, {
      conditions: [{ collectionName: 'syncOutbox', selector: { id: sent.id }, records: [sent] }],
      mutations: [{ kind: 'upsert', collectionName: 'syncOutbox', record: { ...sent,
        attemptCount: normalizeNonNegativeInt(sent.attemptCount, 0) + 1, updatedAtMs: nowMs,
        lastAckStatus: status, lastAckMessage: message } }],
    })
  for (const acknowledgement of response.acknowledgements) {
    const sent = sentById.get(acknowledgement.mutationId)!
    if (acknowledgement.status === 'applied') {
      const state = childStates.get(sent.id) ?? null
      const child = sent.entity !== 'document' ? await planAgenticGraphStorageAcknowledgedChild(args.dbState,
        sent.payload as unknown as AgenticGraphStorageMutation, state) : { conditions: [], mutations: [] }
      const conflict = (await collections.syncConflicts.findOne(sent.id).exec())?.toJSON()
      const committed = await compareAndCommitAgenticGraphStorageMutationUnit(args.dbState, {
        conditions: [...child.conditions,
          { collectionName: 'syncOutbox', selector: { id: sent.id }, records: [sent] },
          { collectionName: 'syncConflicts', selector: { id: sent.id }, records: conflict ? [conflict] : [] }],
        mutations: [
          ...child.mutations,
          { kind: 'remove', collectionName: 'syncOutbox', id: sent.id },
          { kind: 'remove', collectionName: 'syncConflicts', id: sent.id },
        ],
      })
      if (committed) appliedCount += 1
      continue
    }
    if (!await recordStatus(sent, acknowledgement.status, acknowledgement.message || null)) continue
    if (acknowledgement.status === 'conflict') {
      const mutation = sent.payload as unknown as AgenticGraphStorageMutation
      conflictCount += 1
      conflictEntries.push({
        mutationId: sent.id, entity: sent.entity, recordId: sent.recordId,
        canonicalPath: await readConflictCanonicalPath(collections, mutation),
        localRevision: readMutationRevision(mutation), serverRevision: acknowledgement.serverRevision,
        childState: childStates.get(sent.id) ?? null,
        message: acknowledgement.message || null,
      })
    } else rejectedCount += 1
  }
  for (const sent of sentById.values()) {
    if (handledMutationIds.has(sent.id)) continue
    if (await recordStatus(sent, 'deferred', 'No acknowledgement received for queued mutation during the latest sync attempt.')) {
      deferredCount += 1
    }
  }
  return {
    pushedCount: mutations.length,
    appliedCount,
    conflictCount,
    rejectedCount,
    deferredCount,
    conflictEntries,
    ackCursor: response.ackCursor || null,
  }
}
