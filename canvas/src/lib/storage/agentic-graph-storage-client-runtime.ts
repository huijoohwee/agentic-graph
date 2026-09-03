import { cancelWorkspaceSyncTask, scheduleWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import { getAgenticGraphStorageDeviceId } from '@/lib/storage/agentic-graph-storage-device-identity'
import {
  buildAgenticGraphStorageCursorId,
  buildAgenticGraphStoragePullRequest,
  AGENTIC_OS_STORAGE_API_VERSION,
  AGENTIC_OS_STORAGE_ROUTE_PATHS,
  type AgenticGraphStoragePullResponse,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import type { AgenticGraphStorageDb } from '@/lib/storage/agentic-graph-storage-db'
import { AGENTIC_OS_STORAGE_SYNC_BOUNDS } from '@/lib/storage/agentic-graph-storage-bounds'
import type { AgenticGraphStorageSyncNowArgs, AgenticGraphStorageSyncRunResult } from '@/lib/storage/agentic-graph-storage-client-types'
import {
  DEFAULT_CHUNK_REFERENCE_LIMIT,
  DEFAULT_MAX_RETRY_COUNT,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_PUSH_BATCH_SIZE,
  DEFAULT_SCHEDULE_DELAY_MS,
  AGENTIC_OS_STORAGE_SYNC_POLL_PREFIX,
  AGENTIC_OS_STORAGE_SYNC_TASK_PREFIX,
  applyPulledDocumentChunks,
  applyPulledDocuments,
  applyPulledGraphSnapshots,
  ensureAgenticGraphStorageNumericRepair,
  getDbState,
  inFlightSyncByWorkspace,
  normalizePositiveInt,
  normalizeString,
  pollTimerByWorkspace,
  readCursorRow,
  readRetainedOutboxStatusCounts,
  upsertCursorRow,
} from '@/lib/storage/agentic-graph-storage-client-support'
import {
  AgenticGraphStorageRetryableTransportError,
  AgenticGraphStorageRetryExhaustedError,
  AgenticGraphStorageRouteUnavailableError,
  buildApiOriginKey,
  buildAgenticGraphStorageSyncAuthHeaders,
  buildSkippedSyncResult,
  fetchWithTimeout,
  getClientFetch,
  isNetworkLoadFailure,
  isRouteUnavailableForApiOrigin,
  markRouteUnavailableForApiOrigin,
  parseStorageResponseJson,
  resolveAgenticGraphStorageApiUrl,
} from '@/lib/storage/agentic-graph-storage-client-transport'
import { pushAgenticGraphStorageOutbox } from '@/lib/storage/agentic-graph-storage-client-push'
import { needsAgenticGraphStorageConflictCandidateRefresh, partitionPulledAgenticGraphStorageChanges, readAgenticGraphStorageConflictEntries, recordAgenticGraphStoragePushConflictCandidates } from '@/lib/storage/agentic-graph-storage-conflict-store'
import { runWorkspaceSeedSyncTask, type WorkspaceSeedSyncTaskContext } from '@/lib/workspace/workspaceSeedSyncRuntime'
type AgenticGraphStorageSyncLifecycleArgs = AgenticGraphStorageSyncNowArgs & { runAfterInFlight?: boolean; signal?: AbortSignal }
type ScheduledAgenticGraphStorageSyncArgs = AgenticGraphStorageSyncLifecycleArgs & { delayMs?: number; signature?: string | null }
type AgenticGraphStorageSyncLoopArgs = AgenticGraphStorageSyncLifecycleArgs & { pollIntervalMs?: number; initialDelayMs?: number; signature?: string | null }
type LinkedAbortController = Readonly<{ controller: AbortController; parentSignal?: AbortSignal; unlink: () => void }>
type ScheduledSyncLifecycle = LinkedAbortController & { generation: number }
const scheduledSyncLifecycleByTaskKey = new Map<string, ScheduledSyncLifecycle>()
const loopLifecycleByTimerKey = new Map<string, LinkedAbortController>()
let storageSyncLoopScheduleSequence = 0
function nextStorageSyncLoopSignature(base: string): string { return `${base}:loop-run:${++storageSyncLoopScheduleSequence}` }
function storageSyncAbortedError(signal: AbortSignal): unknown {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('agentic-graph storage sync was cancelled')
}
function throwIfStorageSyncAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw storageSyncAbortedError(signal)
}
function createLinkedAbortController(parentSignal?: AbortSignal): LinkedAbortController {
  const controller = new AbortController()
  const handleParentAbort = () => {
    controller.abort(storageSyncAbortedError(parentSignal!))
  }
  if (parentSignal?.aborted) {
    handleParentAbort()
  } else {
    parentSignal?.addEventListener('abort', handleParentAbort, { once: true })
  }
  return Object.freeze({
    controller,
    parentSignal,
    unlink: () => parentSignal?.removeEventListener('abort', handleParentAbort),
  })
}
function abortLinkedController(lifecycle: LinkedAbortController | undefined, reason: string): void {
  if (!lifecycle) return
  lifecycle.unlink()
  if (!lifecycle.controller.signal.aborted) {
    lifecycle.controller.abort(new Error(reason))
  }
}
function raceStorageSyncAbort<Result>(signal: AbortSignal, operation: Promise<Result>): Promise<Result> {
  throwIfStorageSyncAborted(signal)
  return new Promise<Result>((resolve, reject) => {
    const handleAbort = () => {
      signal.removeEventListener('abort', handleAbort)
      reject(storageSyncAbortedError(signal))
    }
    signal.addEventListener('abort', handleAbort, { once: true })
    operation.then(
      value => {
        signal.removeEventListener('abort', handleAbort)
        resolve(value)
      },
      error => {
        signal.removeEventListener('abort', handleAbort)
        reject(error)
      },
    )
  })
}
function createLifecycleFetch(
  fetchValue: AgenticGraphStorageSyncNowArgs['fetchImpl'],
  signal?: AbortSignal,
): AgenticGraphStorageSyncNowArgs['fetchImpl'] {
  if (!signal) return fetchValue
  const fetchImpl = getClientFetch(fetchValue)
  return async (input, init) => {
    throwIfStorageSyncAborted(signal)
    const controller = new AbortController()
    const requestSignal = init?.signal
    const abortFromRequest = () => controller.abort(requestSignal?.reason)
    const abortFromLifecycle = () => controller.abort(storageSyncAbortedError(signal))
    requestSignal?.addEventListener('abort', abortFromRequest, { once: true })
    signal.addEventListener('abort', abortFromLifecycle, { once: true })
    try {
      return await raceStorageSyncAbort(
        signal,
        fetchImpl(input, { ...init, signal: controller.signal }),
      )
    } finally {
      requestSignal?.removeEventListener('abort', abortFromRequest)
      signal.removeEventListener('abort', abortFromLifecycle)
    }
  }
}
function createLifecycleSleep(
  sleepImpl: AgenticGraphStorageSyncNowArgs['sleepImpl'],
  signal?: AbortSignal,
): AgenticGraphStorageSyncNowArgs['sleepImpl'] {
  if (!signal) return sleepImpl
  return async delayMs => {
    if (sleepImpl) {
      // Custom sleepers own their underlying work; this wrapper only cancels the awaited result.
      await raceStorageSyncAbort(signal, sleepImpl(delayMs))
      return
    }
    throwIfStorageSyncAborted(signal)
    await new Promise<void>((resolve, reject) => {
      const handleAbort = () => {
        globalThis.clearTimeout(timerId)
        signal.removeEventListener('abort', handleAbort)
        reject(storageSyncAbortedError(signal))
      }
      const timerId = globalThis.setTimeout(() => {
        signal.removeEventListener('abort', handleAbort)
        resolve()
      }, delayMs)
      signal.addEventListener('abort', handleAbort, { once: true })
      if (signal.aborted) handleAbort()
    })
  }
}
const pullAgenticGraphStorageChanges = async (
  args: Required<Pick<AgenticGraphStorageSyncNowArgs, 'workspaceId'>> &
    Pick<AgenticGraphStorageSyncNowArgs, 'baseUrl' | 'sessionToken' | 'fetchImpl' | 'requestTimeoutMs'> & {
      deviceId: string
      since: string | null
      dbState: AgenticGraphStorageDb
      signal: AbortSignal
      taskContext: WorkspaceSeedSyncTaskContext
      onPulledChangesApplied: AgenticGraphStorageSyncNowArgs['onPulledChangesApplied']
    },
) => {
  const fetchImpl = getClientFetch(args.fetchImpl)
  const apiOrigin = buildApiOriginKey(args.baseUrl)
  const chunkRows = await args.dbState.collections.documentChunks
    .find({ selector: { workspaceId: args.workspaceId } })
    .limit(DEFAULT_CHUNK_REFERENCE_LIMIT)
    .exec()
  const knownChunks = chunkRows.map(row => ({
    id: normalizeString(row.get('id')),
    documentId: normalizeString(row.get('documentId')),
    chunkKey: normalizeString(row.get('chunkKey')),
    contentHash: normalizeString(row.get('contentHash')),
  })).filter(chunk => chunk.id && chunk.documentId && chunk.chunkKey && chunk.contentHash)
  let pageCursor: string | null = null
  let finalResponse: AgenticGraphStoragePullResponse | null = null
  let cacheWriteCount = 0
  let reusedChunkCount = 0
  let pulledDocumentCount = 0
  let pulledChunkCount = 0
  let pulledGraphSnapshotCount = 0
  let hasPulledChanges = false
  for (let pageIndex = 0; pageIndex < 10_000; pageIndex += 1) {
    throwIfStorageSyncAborted(args.signal)
    const response = await fetchWithTimeout({
      fetchImpl,
      input: resolveAgenticGraphStorageApiUrl(AGENTIC_OS_STORAGE_ROUTE_PATHS.pull, args.baseUrl),
      timeoutMs: args.requestTimeoutMs,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...buildAgenticGraphStorageSyncAuthHeaders(args.sessionToken) },
        body: JSON.stringify(buildAgenticGraphStoragePullRequest({
          workspaceId: args.workspaceId,
          deviceId: args.deviceId,
          since: args.since,
          pageCursor,
          knownChunks,
        })),
      },
    })
    const json = await parseStorageResponseJson<AgenticGraphStoragePullResponse | { ok?: false; error?: string }>(response, {
      requestLabel: 'agentic-graph storage pull',
      apiOrigin,
    })
    if (!response.ok || !('ok' in json) || json.ok !== true) {
      throw new Error(`agentic-graph storage pull failed: ${'error' in json ? String(json.error || 'request failed') : 'request failed'}`)
    }
    finalResponse = json
    pulledDocumentCount += json.changes.documents.length
    pulledChunkCount += json.changes.documentChunks.length
    pulledGraphSnapshotCount += json.changes.graphSnapshots.length
    const pageHasChanges = json.changes.documents.length > 0
      || json.changes.documentChunks.length > 0
      || json.changes.graphSnapshots.length > 0
    hasPulledChanges ||= pageHasChanges
    if (pageHasChanges) {
      const { applicableChanges } = await partitionPulledAgenticGraphStorageChanges({
        dbState: args.dbState,
        workspaceId: args.workspaceId,
        changes: json.changes,
      })
      const documentWriteCount = await applyPulledDocuments(args.dbState, applicableChanges.documents)
      const chunkApply = await applyPulledDocumentChunks(args.dbState.collections, applicableChanges.documentChunks)
      const graphWriteCount = await applyPulledGraphSnapshots(args.dbState.collections, applicableChanges.graphSnapshots)
      cacheWriteCount += documentWriteCount + chunkApply.writtenCount + graphWriteCount
      reusedChunkCount += chunkApply.reusedCount
      const pageHasApplicableChanges = applicableChanges.documents.length > 0
        || applicableChanges.documentChunks.length > 0
        || applicableChanges.graphSnapshots.length > 0
      if (pageHasApplicableChanges && typeof args.onPulledChangesApplied === 'function') {
        await args.onPulledChangesApplied({
          workspaceId: args.workspaceId,
          deviceId: args.deviceId,
          changes: applicableChanges,
          signal: args.signal,
          taskContext: args.taskContext,
        })
      }
    }
    const next = normalizeString(json.nextPageCursor) || null
    if (json.pageComplete !== false || !next) break
    if (next === pageCursor) throw new Error('agentic-graph storage pull returned a non-advancing page cursor')
    pageCursor = next
  }
  if (!finalResponse) throw new Error('agentic-graph storage pull returned no page')
  if (finalResponse.pageComplete === false && normalizeString(finalResponse.nextPageCursor)) {
    throw new Error('agentic-graph storage pull exceeded the 10000-page safety limit')
  }
  return {
    response: finalResponse,
    cacheWriteCount,
    reusedChunkCount,
    hasPulledChanges,
    pulledDocumentCount,
    pulledChunkCount,
    pulledGraphSnapshotCount,
  }
}

export const syncAgenticGraphStorageNow = async (
  args: AgenticGraphStorageSyncLifecycleArgs,
): Promise<AgenticGraphStorageSyncRunResult> => {
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) throw new Error('workspaceId is required for agentic-graph storage sync')
  const deviceId = normalizeString(args.deviceId) || getAgenticGraphStorageDeviceId()
  const apiOrigin = buildApiOriginKey(args.baseUrl)
  const inFlightKey = `${workspaceId}::${deviceId}`
  const existingInFlight = inFlightSyncByWorkspace.get(inFlightKey)
  if (existingInFlight) {
    const canReuse = !existingInFlight.signal?.aborted && existingInFlight.signal === args.signal && !args.runAfterInFlight
    if (canReuse) return existingInFlight.promise
    const settled = existingInFlight.promise.then(() => undefined, () => undefined)
    const ready = args.signal
      ? raceStorageSyncAbort(args.signal, settled)
      : settled
    return ready.then(() => syncAgenticGraphStorageNow({
      ...args,
      runAfterInFlight: false,
    }))
  }
  const run = runWorkspaceSeedSyncTask(args.signal, async taskContext => {
      const signal = taskContext.signal
      throwIfStorageSyncAborted(signal)
      const lifecycleFetch = createLifecycleFetch(args.fetchImpl, signal)
      const lifecycleSleep = createLifecycleSleep(args.sleepImpl, signal)
      const dbState = await getDbState(args.dbState)
      throwIfStorageSyncAborted(signal)
      await ensureAgenticGraphStorageNumericRepair(dbState)
      throwIfStorageSyncAborted(signal)
      const { collections } = dbState
      const currentCursor = await readCursorRow(collections, workspaceId, deviceId)
      throwIfStorageSyncAborted(signal)
      const finishSkippedSync = async (transportError?: string | null) => {
        const persistence = dbState.persistence.getState()
        const retained = await readRetainedOutboxStatusCounts(collections, workspaceId)
        const conflicts = await readAgenticGraphStorageConflictEntries(dbState, workspaceId)
        const result: AgenticGraphStorageSyncRunResult = {
          ...buildSkippedSyncResult({
            workspaceId,
            deviceId,
            currentCursor,
            unresolvedConflictCount: conflicts.length,
            transportError,
          }),
          ...retained,
          conflictEntries: conflicts,
          durableLocalQueue: persistence.mode === 'indexeddb' && persistence.status === 'active',
        }
        throwIfStorageSyncAborted(signal)
        if (typeof args.onSyncCompleted === 'function') {
          await args.onSyncCompleted(result)
        }
        throwIfStorageSyncAborted(signal)
        return result
      }
      const persistence = dbState.persistence.getState()
      const usesRuntimeOwnedDb = !args.dbState
      if (usesRuntimeOwnedDb && typeof window !== 'undefined'
        && (persistence.mode !== 'indexeddb' || persistence.status !== 'active')) {
        return finishSkippedSync('IndexedDB is unavailable; storage changes remain volatile for this browser session.')
      }
      if (isRouteUnavailableForApiOrigin(apiOrigin)) {
        console.warn(`[agentic-graph-storage] sync skipped — route unavailable for ${apiOrigin}`)
        return finishSkippedSync(`Storage route is unavailable for ${apiOrigin}.`)
      }
      const pushBatchSize = normalizePositiveInt(args.pushBatchSize, DEFAULT_PUSH_BATCH_SIZE)
      const maxRetryCount = Math.min(
        normalizePositiveInt(args.maxRetryCount, DEFAULT_MAX_RETRY_COUNT),
        AGENTIC_OS_STORAGE_SYNC_BOUNDS.maxRetryAttempts,
      )
      try {
        const pushOutcome = await pushAgenticGraphStorageOutbox({
          workspaceId,
          deviceId,
          baseUrl: args.baseUrl,
          sessionToken: args.sessionToken,
          fetchImpl: lifecycleFetch,
          maxRetryCount,
          pushBatchSize,
          requestTimeoutMs: args.requestTimeoutMs,
          sleepImpl: lifecycleSleep,
          dbState,
        })
        await recordAgenticGraphStoragePushConflictCandidates({
          dbState,
          workspaceId,
          entries: pushOutcome.conflictEntries,
        })
        const refreshConflictCandidates = await needsAgenticGraphStorageConflictCandidateRefresh(dbState, workspaceId)
        throwIfStorageSyncAborted(signal)
        const pull = await pullAgenticGraphStorageChanges({
          workspaceId,
          deviceId,
          since: refreshConflictCandidates
            ? null
            : normalizeString(currentCursor?.get('lastPullCursor')) || null,
          baseUrl: args.baseUrl,
          sessionToken: args.sessionToken,
          fetchImpl: lifecycleFetch,
          requestTimeoutMs: args.requestTimeoutMs,
          dbState,
          signal,
          taskContext,
          onPulledChangesApplied: args.onPulledChangesApplied,
        })
        throwIfStorageSyncAborted(signal)
        const pullResponse = pull.response
        const hasPulledChanges = pull.hasPulledChanges
        if (hasPulledChanges || pushOutcome.ackCursor) {
          const nowMs = Date.now()
          await upsertCursorRow(collections, {
            id: buildAgenticGraphStorageCursorId(workspaceId, deviceId),
            workspaceId,
            deviceId,
            lastPullCursor: hasPulledChanges
              ? pullResponse.nextCursor || null
              : normalizeString(currentCursor?.get('lastPullCursor')) || null,
            lastPushCursor: pushOutcome.ackCursor
              || normalizeString(currentCursor?.get('lastPushCursor'))
              || null,
            serverClockMs: Number.isFinite(pullResponse.serverTimeMs)
              ? Math.floor(pullResponse.serverTimeMs)
              : nowMs,
            updatedAtMs: nowMs,
          })
        }
        const finalPersistence = dbState.persistence.getState()
        const retained = await readRetainedOutboxStatusCounts(collections, workspaceId)
        const conflicts = await readAgenticGraphStorageConflictEntries(dbState, workspaceId)
        const result: AgenticGraphStorageSyncRunResult = {
          transportStatus: 'synced',
          durableLocalQueue: finalPersistence.mode === 'indexeddb' && finalPersistence.status === 'active',
          workspaceId,
          deviceId,
          pushedCount: pushOutcome.pushedCount,
          pulledDocumentCount: pull.pulledDocumentCount,
          pulledChunkCount: pull.pulledChunkCount,
          pulledGraphSnapshotCount: pull.pulledGraphSnapshotCount,
          appliedCount: pushOutcome.appliedCount,
          conflictCount: pushOutcome.conflictCount,
          rejectedCount: retained.rejectedCount,
          deferredCount: retained.deferredCount,
          unresolvedConflictCount: conflicts.length,
          conflictEntries: conflicts,
          transportError: null,
          lastPushCursor: pushOutcome.ackCursor,
          lastPullCursor: hasPulledChanges
            ? pullResponse.nextCursor || null
            : normalizeString(currentCursor?.get('lastPullCursor')) || null,
        }
        if (typeof args.onSyncCompleted === 'function') {
          await args.onSyncCompleted(result)
        }
        throwIfStorageSyncAborted(signal)
        console.log(`[agentic-graph-storage] sync ok: pushed=${result.pushedCount} pulled=${result.pulledDocumentCount} reusedChunks=${pull.reusedChunkCount} conflicts=${result.conflictCount} workspace=${workspaceId}`)
        return result
      } catch (error) {
        if (error instanceof AgenticGraphStorageRouteUnavailableError) {
          markRouteUnavailableForApiOrigin(error.apiOrigin)
          return finishSkippedSync(error.message)
        }
        if (
          error instanceof AgenticGraphStorageRetryableTransportError
          || error instanceof AgenticGraphStorageRetryExhaustedError
          || isNetworkLoadFailure(error)
        ) {
          const apiOrigin = buildApiOriginKey(args.baseUrl)
          markRouteUnavailableForApiOrigin(apiOrigin)
          return finishSkippedSync(
            error instanceof Error ? error.message : 'Storage transport failed after bounded retries.',
          )
        }
        throw error
      }
  })
  const inFlightEntry = { promise: run, signal: args.signal }
  inFlightSyncByWorkspace.set(inFlightKey, inFlightEntry)
  return run.finally(() => {
    if (inFlightSyncByWorkspace.get(inFlightKey) === inFlightEntry) {
      inFlightSyncByWorkspace.delete(inFlightKey)
    }
  })
}

const cancelScheduledSyncLifecycle = (
  taskKey: string,
  reason: string,
  expected?: ScheduledSyncLifecycle,
): void => {
  const lifecycle = scheduledSyncLifecycleByTaskKey.get(taskKey)
  if (!lifecycle || (expected && lifecycle !== expected)) return
  scheduledSyncLifecycleByTaskKey.delete(taskKey)
  cancelWorkspaceSyncTask(taskKey)
  abortLinkedController(lifecycle, reason)
}

export const scheduleAgenticGraphStorageSync = (args: ScheduledAgenticGraphStorageSyncArgs): void => {
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) return
  const deviceId = normalizeString(args.deviceId) || getAgenticGraphStorageDeviceId()
  const taskKey = `${AGENTIC_OS_STORAGE_SYNC_TASK_PREFIX}:${workspaceId}:${deviceId}`
  const delayMs = Number.isFinite(args.delayMs) ? Math.max(0, Math.floor(args.delayMs || 0)) : DEFAULT_SCHEDULE_DELAY_MS
  const current = scheduledSyncLifecycleByTaskKey.get(taskKey)
  const lifecycle = current && current.parentSignal === args.signal && !current.controller.signal.aborted
    ? current
    : { ...createLinkedAbortController(args.signal), generation: 0 }
  const createdLifecycle = lifecycle !== current
  const previousGeneration = lifecycle.generation
  const generation = previousGeneration + 1
  lifecycle.generation = generation
  if (current && current !== lifecycle) {
    cancelScheduledSyncLifecycle(taskKey, 'agentic-graph storage sync was superseded', current)
  }
  scheduledSyncLifecycleByTaskKey.set(taskKey, lifecycle)
  const cancelAbortedSchedule = () => {
    cancelScheduledSyncLifecycle(taskKey, 'agentic-graph storage sync lifecycle ended', lifecycle)
  }
  if (lifecycle.controller.signal.aborted) {
    cancelAbortedSchedule()
    return
  }
  lifecycle.controller.signal.addEventListener('abort', cancelAbortedSchedule, { once: true })
  const admitted = scheduleWorkspaceSyncTask(
    taskKey,
    () => {
      if (scheduledSyncLifecycleByTaskKey.get(taskKey) !== lifecycle
        || lifecycle.generation !== generation) return
      void syncAgenticGraphStorageNow({
        ...args,
        workspaceId,
        deviceId,
        runAfterInFlight: true,
        signal: lifecycle.controller.signal,
      }).catch(error => {
        if (!lifecycle.controller.signal.aborted) console.error('[agentic-graph-storage-sync]', error)
      }).finally(() => {
        if (scheduledSyncLifecycleByTaskKey.get(taskKey) !== lifecycle
          || lifecycle.generation !== generation) return
        scheduledSyncLifecycleByTaskKey.delete(taskKey)
        lifecycle.unlink()
      })
    },
    delayMs,
    {
      scopeKey: `${workspaceId}:${deviceId}`,
      signature: args.signature || `${workspaceId}:${deviceId}`,
    },
  )
  if (!admitted && createdLifecycle) {
    cancelScheduledSyncLifecycle(
      taskKey,
      'agentic-graph storage sync signature was already executed',
      lifecycle,
    )
  } else if (!admitted) {
    lifecycle.generation = previousGeneration
  }
}

export const cancelAgenticGraphStorageSync = (workspaceId: string, deviceId?: string | null): void => {
  const safeWorkspaceId = normalizeString(workspaceId)
  if (!safeWorkspaceId) return
  const safeDeviceId = normalizeString(deviceId) || getAgenticGraphStorageDeviceId()
  const taskKey = `${AGENTIC_OS_STORAGE_SYNC_TASK_PREFIX}:${safeWorkspaceId}:${safeDeviceId}`
  const timerKey = `${AGENTIC_OS_STORAGE_SYNC_POLL_PREFIX}:${safeWorkspaceId}:${safeDeviceId}`
  const loopLifecycle = loopLifecycleByTimerKey.get(timerKey)
  if (loopLifecycle) {
    loopLifecycleByTimerKey.delete(timerKey)
    const timerId = pollTimerByWorkspace.get(timerKey)
    if (typeof timerId === 'number' && typeof window !== 'undefined') window.clearInterval(timerId)
    pollTimerByWorkspace.delete(timerKey)
    abortLinkedController(loopLifecycle, 'agentic-graph storage sync loop was cancelled')
  }
  cancelScheduledSyncLifecycle(taskKey, 'agentic-graph storage sync was cancelled')
}

export const startAgenticGraphStorageSyncLoop = (
  args: AgenticGraphStorageSyncLoopArgs,
): (() => void) => {
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) return () => void 0
  const deviceId = normalizeString(args.deviceId) || getAgenticGraphStorageDeviceId()
  const timerKey = `${AGENTIC_OS_STORAGE_SYNC_POLL_PREFIX}:${workspaceId}:${deviceId}`
  cancelAgenticGraphStorageSync(workspaceId, deviceId)
  const lifecycle = createLinkedAbortController(args.signal)
  loopLifecycleByTimerKey.set(timerKey, lifecycle)
  const cancelAbortedLoop = () => {
    if (loopLifecycleByTimerKey.get(timerKey) === lifecycle) {
      cancelAgenticGraphStorageSync(workspaceId, deviceId)
    }
  }
  if (lifecycle.controller.signal.aborted) {
    cancelAbortedLoop()
    return () => void 0
  }
  lifecycle.controller.signal.addEventListener('abort', cancelAbortedLoop, { once: true })
  const intervalMs = normalizePositiveInt(args.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS)
  const schedule = (delayMs: number, signature: string) => {
    scheduleAgenticGraphStorageSync({
      ...args,
      workspaceId,
      deviceId,
      delayMs,
      signature,
      signal: lifecycle.controller.signal,
    })
  }
  void runWorkspaceSeedSyncTask(lifecycle.controller.signal, () => {
    if (loopLifecycleByTimerKey.get(timerKey) !== lifecycle) return
    schedule(
      Number.isFinite(args.initialDelayMs) ? Math.max(0, Math.floor(args.initialDelayMs || 0)) : 0,
      nextStorageSyncLoopSignature(args.signature || `${workspaceId}:${deviceId}:initial`),
    )
    if (typeof window === 'undefined') return
    const timerId = window.setInterval(() => {
      if (loopLifecycleByTimerKey.get(timerKey) !== lifecycle) return
      schedule(0, nextStorageSyncLoopSignature(`${workspaceId}:${deviceId}:poll`))
    }, intervalMs)
    pollTimerByWorkspace.set(timerKey, timerId)
  }).catch(error => {
    if (!lifecycle.controller.signal.aborted) console.error('[agentic-graph-storage-loop]', error)
  })
  return () => {
    if (loopLifecycleByTimerKey.get(timerKey) !== lifecycle) return
    cancelAgenticGraphStorageSync(workspaceId, deviceId)
  }
}
