import { cancelWorkspaceSyncTask, scheduleWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import { getKnowgrphStorageDeviceId } from '@/lib/storage/knowgrphStorageDeviceIdentity'
import {
  buildKnowgrphStorageExportPath,
  buildKnowgrphStorageCursorId,
  buildKnowgrphStoragePullRequest,
  KNOWGRPH_STORAGE_API_VERSION,
  KNOWGRPH_STORAGE_ROUTE_PATHS,
  type KnowgrphStorageExportResponse,
  type KnowgrphStoragePullResponse,
} from '@/lib/storage/knowgrphStorageSyncContract'
import type { KnowgrphStorageDb } from '@/lib/storage/knowgrphStorageDb'
import { KNOWGRPH_STORAGE_SYNC_BOUNDS } from '@/lib/storage/knowgrphStorageBounds'
import type {
  KnowgrphStorageSyncNowArgs,
  KnowgrphStorageSyncRunResult,
} from '@/lib/storage/knowgrphStorageClientTypes'
import {
  DEFAULT_CHUNK_REFERENCE_LIMIT,
  DEFAULT_MAX_RETRY_COUNT,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_PUSH_BATCH_SIZE,
  DEFAULT_SCHEDULE_DELAY_MS,
  KNOWGRPH_STORAGE_SYNC_POLL_PREFIX,
  KNOWGRPH_STORAGE_SYNC_TASK_PREFIX,
  applyPulledDocumentChunks,
  applyPulledDocuments,
  applyPulledGraphSnapshots,
  autoClearStaleOutboxConflicts,
  ensureKnowgrphStorageNumericRepair,
  getDbState,
  inFlightSyncByWorkspace,
  normalizePositiveInt,
  normalizeString,
  pollTimerByWorkspace,
  readCursorRow,
  readUnresolvedConflictCount,
  upsertCursorRow,
} from '@/lib/storage/knowgrphStorageClientSupport'
import {
  KnowgrphStorageRetryableTransportError,
  KnowgrphStorageRetryExhaustedError,
  KnowgrphStorageRouteUnavailableError,
  buildApiOriginKey,
  buildSkippedSyncResult,
  fetchWithTimeout,
  getClientFetch,
  isNetworkLoadFailure,
  isRouteUnavailableForApiOrigin,
  markRouteUnavailableForApiOrigin,
  parseStorageResponseJson,
  resolveKnowgrphStorageApiUrl,
} from '@/lib/storage/knowgrphStorageClientTransport'
import { pushKnowgrphStorageOutbox } from '@/lib/storage/knowgrphStorageClientPush'
import { runWorkspaceSeedSyncTask } from '@/lib/workspace/workspaceSeedSyncRuntime'
type KnowgrphStorageSyncLifecycleArgs = KnowgrphStorageSyncNowArgs & { runAfterInFlight?: boolean; signal?: AbortSignal }
type ScheduledKnowgrphStorageSyncArgs = KnowgrphStorageSyncLifecycleArgs & {
  delayMs?: number
  signature?: string | null
}
type KnowgrphStorageSyncLoopArgs = KnowgrphStorageSyncLifecycleArgs & {
  pollIntervalMs?: number
  initialDelayMs?: number
  signature?: string | null
}
type LinkedAbortController = Readonly<{
  controller: AbortController
  parentSignal?: AbortSignal
  unlink: () => void
}>
type ScheduledSyncLifecycle = LinkedAbortController & { generation: number }
const scheduledSyncLifecycleByTaskKey = new Map<string, ScheduledSyncLifecycle>()
const loopLifecycleByTimerKey = new Map<string, LinkedAbortController>()
let storageSyncLoopScheduleSequence = 0
function nextStorageSyncLoopSignature(base: string): string { return `${base}:loop-run:${++storageSyncLoopScheduleSequence}` }
function storageSyncAbortedError(signal: AbortSignal): unknown {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Knowgrph storage sync was cancelled')
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

function abortLinkedController(
  lifecycle: LinkedAbortController | undefined,
  reason: string,
): void {
  if (!lifecycle) return
  lifecycle.unlink()
  if (!lifecycle.controller.signal.aborted) {
    lifecycle.controller.abort(new Error(reason))
  }
}

function raceStorageSyncAbort<Result>(
  signal: AbortSignal,
  operation: Promise<Result>,
): Promise<Result> {
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
  fetchValue: KnowgrphStorageSyncNowArgs['fetchImpl'],
  signal?: AbortSignal,
): KnowgrphStorageSyncNowArgs['fetchImpl'] {
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
  sleepImpl: KnowgrphStorageSyncNowArgs['sleepImpl'],
  signal?: AbortSignal,
): KnowgrphStorageSyncNowArgs['sleepImpl'] {
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

const pullKnowgrphStorageChanges = async (
  args: Required<Pick<KnowgrphStorageSyncNowArgs, 'workspaceId'>> &
    Pick<KnowgrphStorageSyncNowArgs, 'baseUrl' | 'fetchImpl' | 'requestTimeoutMs'> & {
      deviceId: string
      since: string | null
      dbState: KnowgrphStorageDb
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
  const response = await fetchWithTimeout({
    fetchImpl,
    input: resolveKnowgrphStorageApiUrl(KNOWGRPH_STORAGE_ROUTE_PATHS.pull, args.baseUrl),
    timeoutMs: args.requestTimeoutMs,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        buildKnowgrphStoragePullRequest({
          workspaceId: args.workspaceId,
          deviceId: args.deviceId,
          since: args.since,
          knownChunks,
        }),
      ),
    },
  })
  const json = await parseStorageResponseJson<KnowgrphStoragePullResponse | { ok?: false; error?: string }>(response, {
    requestLabel: 'knowgrph storage pull',
    apiOrigin,
  })
  if (!response.ok || !('ok' in json) || json.ok !== true) {
    throw new Error(`knowgrph storage pull failed: ${'error' in json ? String(json.error || 'request failed') : 'request failed'}`)
  }
  const hasChanges =
    json.changes.documents.length > 0
    || json.changes.documentChunks.length > 0
    || json.changes.graphSnapshots.length > 0
  if (!hasChanges) {
    return { response: json, cacheWriteCount: 0, reusedChunkCount: 0 }
  }
  const documentWriteCount = await applyPulledDocuments(args.dbState, json.changes.documents)
  const chunkApply = await applyPulledDocumentChunks(
    args.dbState.collections,
    json.changes.documentChunks,
  )
  const graphWriteCount = await applyPulledGraphSnapshots(
    args.dbState.collections,
    json.changes.graphSnapshots,
  )
  await autoClearStaleOutboxConflicts(
    args.dbState.collections,
    args.workspaceId,
    json.changes.documents,
    json.changes.graphSnapshots,
  )
  return {
    response: json,
    cacheWriteCount: documentWriteCount + chunkApply.writtenCount + graphWriteCount,
    reusedChunkCount: chunkApply.reusedCount,
  }
}

export const syncKnowgrphStorageNow = async (
  args: KnowgrphStorageSyncLifecycleArgs,
): Promise<KnowgrphStorageSyncRunResult> => {
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) throw new Error('workspaceId is required for knowgrph storage sync')
  const deviceId = normalizeString(args.deviceId) || getKnowgrphStorageDeviceId()
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
    return ready.then(() => syncKnowgrphStorageNow({
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
      await ensureKnowgrphStorageNumericRepair(dbState)
      throwIfStorageSyncAborted(signal)
      const { collections } = dbState
      const currentCursor = await readCursorRow(collections, workspaceId, deviceId)
      throwIfStorageSyncAborted(signal)
      const finishSkippedSync = async (transportError?: string | null) => {
        const result = buildSkippedSyncResult({
          workspaceId,
          deviceId,
          currentCursor,
          unresolvedConflictCount: await readUnresolvedConflictCount(collections, workspaceId),
          transportError,
        })
        throwIfStorageSyncAborted(signal)
        if (typeof args.onSyncCompleted === 'function') {
          await args.onSyncCompleted(result)
        }
        throwIfStorageSyncAborted(signal)
        return result
      }
      if (isRouteUnavailableForApiOrigin(apiOrigin)) {
        console.warn(`[knowgrph-storage] sync skipped — route unavailable for ${apiOrigin}`)
        return finishSkippedSync(`Storage route is unavailable for ${apiOrigin}.`)
      }
      const pushBatchSize = normalizePositiveInt(args.pushBatchSize, DEFAULT_PUSH_BATCH_SIZE)
      const maxRetryCount = Math.min(
        normalizePositiveInt(args.maxRetryCount, DEFAULT_MAX_RETRY_COUNT),
        KNOWGRPH_STORAGE_SYNC_BOUNDS.maxRetryAttempts,
      )
      try {
        const pushOutcome = await pushKnowgrphStorageOutbox({
          workspaceId,
          deviceId,
          baseUrl: args.baseUrl,
          fetchImpl: lifecycleFetch,
          maxRetryCount,
          pushBatchSize,
          requestTimeoutMs: args.requestTimeoutMs,
          sleepImpl: lifecycleSleep,
          collections,
        })
        throwIfStorageSyncAborted(signal)
        const pull = await pullKnowgrphStorageChanges({
          workspaceId,
          deviceId,
          since: normalizeString(currentCursor?.get('lastPullCursor')) || null,
          baseUrl: args.baseUrl,
          fetchImpl: lifecycleFetch,
          requestTimeoutMs: args.requestTimeoutMs,
          dbState,
        })
        throwIfStorageSyncAborted(signal)
        const pullResponse = pull.response
        const hasPulledChanges =
          pullResponse.changes.documents.length > 0
          || pullResponse.changes.documentChunks.length > 0
          || pullResponse.changes.graphSnapshots.length > 0
        if (hasPulledChanges && typeof args.onPulledChangesApplied === 'function') {
          const pulledChanges = {
            workspaceId,
            deviceId,
            changes: pullResponse.changes,
            signal,
            taskContext,
          }
          await args.onPulledChangesApplied(pulledChanges)
          throwIfStorageSyncAborted(signal)
        }
        if (hasPulledChanges || pushOutcome.ackCursor) {
          const nowMs = Date.now()
          await upsertCursorRow(collections, {
            id: buildKnowgrphStorageCursorId(workspaceId, deviceId),
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
        const result: KnowgrphStorageSyncRunResult = {
          transportStatus: 'synced',
          workspaceId,
          deviceId,
          pushedCount: pushOutcome.pushedCount,
          pulledDocumentCount: pullResponse.changes.documents.length,
          pulledChunkCount: pullResponse.changes.documentChunks.length,
          pulledGraphSnapshotCount: pullResponse.changes.graphSnapshots.length,
          appliedCount: pushOutcome.appliedCount,
          conflictCount: pushOutcome.conflictCount,
          rejectedCount: pushOutcome.rejectedCount,
          deferredCount: pushOutcome.deferredCount,
          unresolvedConflictCount: await readUnresolvedConflictCount(collections, workspaceId),
          conflictEntries: pushOutcome.conflictEntries,
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
        console.log(`[knowgrph-storage] sync ok: pushed=${result.pushedCount} pulled=${result.pulledDocumentCount} reusedChunks=${pull.reusedChunkCount} conflicts=${result.conflictCount} workspace=${workspaceId}`)
        return result
      } catch (error) {
        if (error instanceof KnowgrphStorageRouteUnavailableError) {
          markRouteUnavailableForApiOrigin(error.apiOrigin)
          return finishSkippedSync(error.message)
        }
        if (
          error instanceof KnowgrphStorageRetryableTransportError
          || error instanceof KnowgrphStorageRetryExhaustedError
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

export const scheduleKnowgrphStorageSync = (args: ScheduledKnowgrphStorageSyncArgs): void => {
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) return
  const deviceId = normalizeString(args.deviceId) || getKnowgrphStorageDeviceId()
  const taskKey = `${KNOWGRPH_STORAGE_SYNC_TASK_PREFIX}:${workspaceId}:${deviceId}`
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
    cancelScheduledSyncLifecycle(taskKey, 'Knowgrph storage sync was superseded', current)
  }
  scheduledSyncLifecycleByTaskKey.set(taskKey, lifecycle)
  const cancelAbortedSchedule = () => {
    cancelScheduledSyncLifecycle(taskKey, 'Knowgrph storage sync lifecycle ended', lifecycle)
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
      void syncKnowgrphStorageNow({
        ...args,
        workspaceId,
        deviceId,
        runAfterInFlight: true,
        signal: lifecycle.controller.signal,
      }).catch(error => {
        if (!lifecycle.controller.signal.aborted) console.error('[knowgrph-storage-sync]', error)
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
      'Knowgrph storage sync signature was already executed',
      lifecycle,
    )
  } else if (!admitted) {
    lifecycle.generation = previousGeneration
  }
}

export const cancelKnowgrphStorageSync = (workspaceId: string, deviceId?: string | null): void => {
  const safeWorkspaceId = normalizeString(workspaceId)
  if (!safeWorkspaceId) return
  const safeDeviceId = normalizeString(deviceId) || getKnowgrphStorageDeviceId()
  const taskKey = `${KNOWGRPH_STORAGE_SYNC_TASK_PREFIX}:${safeWorkspaceId}:${safeDeviceId}`
  const timerKey = `${KNOWGRPH_STORAGE_SYNC_POLL_PREFIX}:${safeWorkspaceId}:${safeDeviceId}`
  const loopLifecycle = loopLifecycleByTimerKey.get(timerKey)
  if (loopLifecycle) {
    loopLifecycleByTimerKey.delete(timerKey)
    const timerId = pollTimerByWorkspace.get(timerKey)
    if (typeof timerId === 'number' && typeof window !== 'undefined') window.clearInterval(timerId)
    pollTimerByWorkspace.delete(timerKey)
    abortLinkedController(loopLifecycle, 'Knowgrph storage sync loop was cancelled')
  }
  cancelScheduledSyncLifecycle(taskKey, 'Knowgrph storage sync was cancelled')
}

export const startKnowgrphStorageSyncLoop = (
  args: KnowgrphStorageSyncLoopArgs,
): (() => void) => {
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) return () => void 0
  const deviceId = normalizeString(args.deviceId) || getKnowgrphStorageDeviceId()
  const timerKey = `${KNOWGRPH_STORAGE_SYNC_POLL_PREFIX}:${workspaceId}:${deviceId}`
  cancelKnowgrphStorageSync(workspaceId, deviceId)
  const lifecycle = createLinkedAbortController(args.signal)
  loopLifecycleByTimerKey.set(timerKey, lifecycle)
  const cancelAbortedLoop = () => {
    if (loopLifecycleByTimerKey.get(timerKey) === lifecycle) {
      cancelKnowgrphStorageSync(workspaceId, deviceId)
    }
  }
  if (lifecycle.controller.signal.aborted) {
    cancelAbortedLoop()
    return () => void 0
  }
  lifecycle.controller.signal.addEventListener('abort', cancelAbortedLoop, { once: true })
  const intervalMs = normalizePositiveInt(args.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS)
  const schedule = (delayMs: number, signature: string) => {
    scheduleKnowgrphStorageSync({
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
    if (!lifecycle.controller.signal.aborted) console.error('[knowgrph-storage-loop]', error)
  })
  return () => {
    if (loopLifecycleByTimerKey.get(timerKey) !== lifecycle) return
    cancelKnowgrphStorageSync(workspaceId, deviceId)
  }
}

export const exportKnowgrphStorageWorkspace = async (
  args: Pick<KnowgrphStorageSyncNowArgs, 'workspaceId' | 'baseUrl' | 'fetchImpl'>,
): Promise<KnowgrphStorageExportResponse> => {
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) throw new Error('workspaceId is required for storage export')
  const fetchImpl = getClientFetch(args.fetchImpl)
  const apiOrigin = buildApiOriginKey(args.baseUrl)
  const response = await fetchImpl(resolveKnowgrphStorageApiUrl(buildKnowgrphStorageExportPath(workspaceId), args.baseUrl), { method: 'GET' })
  const json = await parseStorageResponseJson<KnowgrphStorageExportResponse | { ok?: false; error?: string }>(response, {
    requestLabel: 'knowgrph storage export',
    apiOrigin,
  })
  if (!response.ok || !json || json.ok !== true) {
    throw new Error(`knowgrph storage export failed: ${String((json as { error?: unknown })?.error || 'request failed')}`)
  }
  return json as KnowgrphStorageExportResponse
}
