import assert from 'node:assert/strict'
import test from 'node:test'
import storageWorkerModule from '../../../cloudflare/workers/knowgrph-storage/index.ts'
import { createFakeKnowgrphStorageWorkerEnv } from '@/__tests__/helpers/fakeKnowgrphStorageD1'
import {
  loadKnowgrphStorageRuntimeDependencies,
} from '@/features/source-files/sourceFilesKnowgrphStorageRuntime'
import {
  runSourceFilesInboundStorageApplyDescendant,
} from '@/features/source-files/sourceFilesInboundStorageApply'
import {
  __resetKnowgrphStorageDbForTests,
  getKnowgrphStorageDb,
} from '@/lib/storage/knowgrphStorageDb'
import {
  __resetKnowgrphStorageRouteAvailabilityForTests,
  cancelKnowgrphStorageSync,
  queueKnowgrphStorageMutation,
  scheduleKnowgrphStorageSync,
  startKnowgrphStorageSyncLoop,
  syncKnowgrphStorageNow,
} from '@/lib/storage/knowgrphStorageClientSync'
import {
  acquireWorkspaceSeedSyncSuspension,
  readWorkspaceSeedSyncRuntimeSnapshot,
  resetWorkspaceSeedSyncRuntimeForTests,
} from '@/lib/workspace/workspaceSeedSyncRuntime'

const worker = (
  typeof (storageWorkerModule as { fetch?: unknown }).fetch === 'function'
    ? storageWorkerModule
    : (storageWorkerModule as unknown as {
      default: typeof storageWorkerModule
    }).default
) as typeof storageWorkerModule

function deferred<Value = void>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function resetStorageBarrierState(): Promise<void> {
  resetWorkspaceSeedSyncRuntimeForTests()
  __resetKnowgrphStorageRouteAvailabilityForTests()
  await __resetKnowgrphStorageDbForTests()
}

test('optional storage loader cancels a stale wait, retries, and defers imports until Flight exits', async t => {
  await resetStorageBarrierState()
  t.after(resetStorageBarrierState)
  const releaseSuspension = await acquireWorkspaceSeedSyncSuspension()
  const staleLifecycle = new AbortController()
  let settled = false
  const staleLoading = loadKnowgrphStorageRuntimeDependencies(staleLifecycle.signal)
  const staleRejection = assert.rejects(staleLoading, /workspace switched/)

  await new Promise<void>(resolve => setImmediate(resolve))
  staleLifecycle.abort(new Error('workspace switched'))
  await staleRejection
  await Promise.resolve()
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 1,
  })

  const currentLifecycle = new AbortController()
  const loading = loadKnowgrphStorageRuntimeDependencies(currentLifecycle.signal).then(dependencies => {
    settled = true
    return dependencies
  })

  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(settled, false)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 1,
  })

  releaseSuspension()
  const dependencies = await loading
  assert.equal(typeof dependencies.syncKnowgrphStorageNow, 'function')
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('stopped storage loop never resumes its old workspace after Flight exits', async t => {
  await resetStorageBarrierState()
  t.after(resetStorageBarrierState)
  const releaseSuspension = await acquireWorkspaceSeedSyncSuspension()
  const env = createFakeKnowgrphStorageWorkerEnv()
  const dbState = await getKnowgrphStorageDb()
  const oldTransportPaths: string[] = []
  const currentTransportPaths: string[] = []
  const currentCompletion = deferred()
  const fetchFor = (
    paths: string[],
    onTransport?: () => void,
  ) => async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    paths.push(new URL(request.url).pathname)
    onTransport?.()
    return worker.fetch(request, env as never)
  }
  const staleLifecycle = new AbortController()
  const stopStaleLoop = startKnowgrphStorageSyncLoop({
    workspaceId: 'wk_flight_barrier_restart_loop',
    deviceId: 'dev_flight_barrier_loop',
    baseUrl: 'https://example.com',
    dbState,
    fetchImpl: fetchFor(oldTransportPaths),
    pollIntervalMs: 60_000,
    signal: staleLifecycle.signal,
  })
  await new Promise<void>(resolve => setImmediate(resolve))
  staleLifecycle.abort(new Error('stale workspace stopped'))
  stopStaleLoop()

  const currentLifecycle = new AbortController()
  const stopCurrentLoop = startKnowgrphStorageSyncLoop({
    workspaceId: 'wk_flight_barrier_restart_loop',
    deviceId: 'dev_flight_barrier_loop',
    baseUrl: 'https://example.com',
    dbState,
    fetchImpl: fetchFor(currentTransportPaths),
    pollIntervalMs: 60_000,
    signal: currentLifecycle.signal,
    onSyncCompleted: () => currentCompletion.resolve(),
  })
  assert.equal(oldTransportPaths.length, 0)
  assert.equal(currentTransportPaths.length, 0)

  releaseSuspension()
  await currentCompletion.promise
  stopCurrentLoop()
  const releaseDrainCheck = await acquireWorkspaceSeedSyncSuspension()
  releaseDrainCheck()
  assert.deepEqual(oldTransportPaths, [])
  assert.deepEqual(currentTransportPaths, ['/api/storage/pull'])
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('cancelled scheduled sync cannot transport after Flight releases its waiter', async t => {
  await resetStorageBarrierState()
  t.after(resetStorageBarrierState)
  const releaseSuspension = await acquireWorkspaceSeedSyncSuspension()
  let requestCount = 0
  scheduleKnowgrphStorageSync({
    workspaceId: 'wk_flight_barrier_cancelled_schedule',
    deviceId: 'dev_flight_barrier_cancelled_schedule',
    baseUrl: 'https://example.com',
    delayMs: 0,
    signature: 'cancelled-waiter',
    fetchImpl: async () => {
      requestCount += 1
      throw new Error('cancelled sync reached transport')
    },
  })
  await new Promise<void>(resolve => setTimeout(resolve, 20))
  cancelKnowgrphStorageSync(
    'wk_flight_barrier_cancelled_schedule',
    'dev_flight_barrier_cancelled_schedule',
  )

  releaseSuspension()
  await new Promise<void>(resolve => setTimeout(resolve, 20))
  const releaseDrainCheck = await acquireWorkspaceSeedSyncSuspension()
  releaseDrainCheck()
  assert.equal(requestCount, 0)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('same-workspace loop admits every poll and clears its owned timer', async t => {
  await resetStorageBarrierState()
  t.after(resetStorageBarrierState)
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const intervalCallbacks = new Map<number, () => void>()
  const clearedIntervalIds: number[] = []
  let nextIntervalId = 1
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      clearInterval(intervalId: number) {
        clearedIntervalIds.push(intervalId)
        intervalCallbacks.delete(intervalId)
      },
      setInterval(callback: () => void) {
        const intervalId = nextIntervalId
        nextIntervalId += 1
        intervalCallbacks.set(intervalId, callback)
        return intervalId
      },
    },
  })
  t.after(() => {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow)
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  })
  const env = createFakeKnowgrphStorageWorkerEnv()
  const dbState = await getKnowgrphStorageDb()
  const completions = [deferred(), deferred(), deferred()]
  const transportPaths: string[] = []
  let completionCount = 0
  const stopLoop = startKnowgrphStorageSyncLoop({
    workspaceId: 'wk_flight_barrier_poll_loop',
    deviceId: 'dev_flight_barrier_poll_loop',
    baseUrl: 'https://example.com',
    dbState,
    initialDelayMs: 0,
    pollIntervalMs: 60_000,
    fetchImpl: async (input, init) => {
      const request = input instanceof Request ? input : new Request(String(input), init)
      transportPaths.push(new URL(request.url).pathname)
      return worker.fetch(request, env as never)
    },
    onSyncCompleted: () => {
      completions[completionCount]?.resolve()
      completionCount += 1
    },
  })

  await completions[0].promise
  const poll = [...intervalCallbacks.values()][0]
  assert.equal(typeof poll, 'function')
  poll()
  await completions[1].promise
  poll()
  await completions[2].promise
  stopLoop()
  const releaseDrainCheck = await acquireWorkspaceSeedSyncSuspension()
  releaseDrainCheck()

  assert.equal(completionCount, 3)
  assert.deepEqual(transportPaths, [
    '/api/storage/pull',
    '/api/storage/pull',
    '/api/storage/pull',
  ])
  assert.equal(intervalCallbacks.size, 0)
  assert.deepEqual(clearedIntervalIds, [1])
})

test('admitted storage sync retains one task through push, pull, and completion descendants', async t => {
  await resetStorageBarrierState()
  t.after(resetStorageBarrierState)
  const env = createFakeKnowgrphStorageWorkerEnv()
  const dbState = await getKnowgrphStorageDb()
  const workspaceId = 'wk_flight_barrier_drain'
  const deviceId = 'dev_flight_barrier_drain'
  await queueKnowgrphStorageMutation({
    workspaceId,
    deviceId,
    entity: 'document',
    op: 'upsert',
    record: {
      id: 'doc_flight_barrier_drain',
      workspaceId,
      canonicalPath: 'docs/flight-barrier-drain.md',
      title: 'Flight barrier drain',
      docType: 'note',
      lang: 'en-US',
      graphId: null,
      sourceKind: 'markdown',
      contentMd: '# Flight barrier drain',
      contentHash: 'sha256:flight-barrier-drain',
      parserVersion: '1.0.0',
      revision: 1,
      updatedAtMs: 1_777_200_000_000,
      deleted: false,
    },
    dbState,
  })
  const firstTransportStarted = deferred()
  const allowFirstTransport = deferred()
  const completionStarted = deferred()
  const allowCompletion = deferred()
  const transportPaths: string[] = []
  let firstTransport = true
  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    transportPaths.push(new URL(request.url).pathname)
    if (firstTransport) {
      firstTransport = false
      firstTransportStarted.resolve()
      await allowFirstTransport.promise
    }
    return worker.fetch(request, env as never)
  }

  const syncing = syncKnowgrphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    fetchImpl,
    dbState,
    onSyncCompleted: async () => {
      completionStarted.resolve()
      await allowCompletion.promise
    },
  })
  await firstTransportStarted.promise
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 1,
    suspensionCount: 0,
  })

  let suspensionSettled = false
  const suspension = acquireWorkspaceSeedSyncSuspension().then(release => {
    suspensionSettled = true
    return release
  })
  await Promise.resolve()
  assert.equal(suspensionSettled, false)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 1,
    suspensionCount: 1,
  })

  allowFirstTransport.resolve()
  await completionStarted.promise
  assert.deepEqual(transportPaths, [
    '/api/storage/push',
    '/api/storage/pull',
  ])
  assert.equal(suspensionSettled, false)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 1,
    suspensionCount: 1,
  })

  allowCompletion.resolve()
  await syncing
  const releaseSuspension = await suspension
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 1,
  })
  releaseSuspension()
})

test('held Flight suspension prevents storage transport and failed sync releases task ownership', async t => {
  await resetStorageBarrierState()
  t.after(resetStorageBarrierState)
  const dbState = await getKnowgrphStorageDb()
  const releaseSuspension = await acquireWorkspaceSeedSyncSuspension()
  let requestCount = 0
  const syncing = syncKnowgrphStorageNow({
    workspaceId: 'wk_flight_barrier_deferred',
    deviceId: 'dev_flight_barrier_deferred',
    baseUrl: 'https://example.com',
    dbState,
    fetchImpl: async () => {
      requestCount += 1
      throw new Error('injected storage transport failure')
    },
  })

  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(requestCount, 0)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 1,
  })

  releaseSuspension()
  await assert.rejects(syncing, /injected storage transport failure/)
  assert.equal(requestCount, 1)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('aborting retry backoff clears the default sleeper timer', async t => {
  await resetStorageBarrierState()
  t.after(resetStorageBarrierState)
  const nativeSetTimeout = globalThis.setTimeout
  const nativeClearTimeout = globalThis.clearTimeout
  const backoffScheduled = deferred()
  let backoffTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  let backoffTimerCleared = false
  globalThis.setTimeout = ((callback, delayMs, ...args) => {
    const timer = nativeSetTimeout(callback, delayMs, ...args)
    if (delayMs === 1_000) {
      backoffTimer = timer
      backoffScheduled.resolve()
    }
    return timer
  }) as typeof globalThis.setTimeout
  globalThis.clearTimeout = ((timer) => {
    if (timer === backoffTimer) backoffTimerCleared = true
    nativeClearTimeout(timer)
  }) as typeof globalThis.clearTimeout
  t.after(() => {
    globalThis.setTimeout = nativeSetTimeout
    globalThis.clearTimeout = nativeClearTimeout
  })
  const dbState = await getKnowgrphStorageDb()
  const workspaceId = 'wk_flight_barrier_retry_backoff'
  const deviceId = 'dev_flight_barrier_retry_backoff'
  await queueKnowgrphStorageMutation({
    workspaceId,
    deviceId,
    entity: 'document',
    op: 'upsert',
    record: {
      id: 'doc_flight_barrier_retry_backoff',
      workspaceId,
      canonicalPath: 'docs/retry-backoff.md',
      title: 'Retry backoff',
      docType: 'note',
      lang: 'en-US',
      graphId: null,
      sourceKind: 'markdown',
      contentMd: '# Retry backoff',
      contentHash: 'sha256:retry-backoff',
      parserVersion: '1.0.0',
      revision: 1,
      updatedAtMs: 1_777_200_000_000,
      deleted: false,
    },
    dbState,
  })
  const lifecycle = new AbortController()
  const syncing = syncKnowgrphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    maxRetryCount: 2,
    signal: lifecycle.signal,
    fetchImpl: async () => new Response('{}', { status: 503 }),
  })
  const rejection = assert.rejects(syncing, /backoff cancelled/)

  await backoffScheduled.promise
  lifecycle.abort(new Error('backoff cancelled'))
  await rejection
  assert.equal(backoffTimerCleared, true)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('inbound apply descendants retain task ownership through completion and failure', async t => {
  await resetStorageBarrierState()
  t.after(resetStorageBarrierState)
  const descendantStarted = deferred()
  const allowDescendantCompletion = deferred()
  const descendant = runSourceFilesInboundStorageApplyDescendant(async () => {
    descendantStarted.resolve()
    await allowDescendantCompletion.promise
  })
  await descendantStarted.promise

  let suspensionSettled = false
  const suspension = acquireWorkspaceSeedSyncSuspension().then(release => {
    suspensionSettled = true
    return release
  })
  await Promise.resolve()
  assert.equal(suspensionSettled, false)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 1,
    suspensionCount: 1,
  })

  allowDescendantCompletion.resolve()
  await descendant
  const releaseSuspension = await suspension
  releaseSuspension()

  await assert.rejects(
    runSourceFilesInboundStorageApplyDescendant(async () => {
      throw new Error('injected inbound descendant failure')
    }),
    /injected inbound descendant failure/,
  )
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('cancelled inbound apply descendant cannot resume after Flight exits', async t => {
  await resetStorageBarrierState()
  t.after(resetStorageBarrierState)
  const releaseSuspension = await acquireWorkspaceSeedSyncSuspension()
  const staleLifecycle = new AbortController()
  let invocationCount = 0
  const applying = runSourceFilesInboundStorageApplyDescendant(async () => {
    invocationCount += 1
  }, staleLifecycle.signal)
  const rejection = assert.rejects(applying, /workspace switched/)

  await new Promise<void>(resolve => setImmediate(resolve))
  staleLifecycle.abort(new Error('workspace switched'))
  await rejection
  releaseSuspension()
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(invocationCount, 0)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})
