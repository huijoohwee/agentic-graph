import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import storageWorkerModule from '../../../cloudflare/workers/knowgrph-storage/index.ts'
import { createFakeKnowgrphStorageWorkerEnv } from '@/__tests__/helpers/fakeKnowgrphStorageD1'
import {
  applyPulledKnowgrphStorageChangesToSourceFiles,
  runSourceFilesInboundStorageApplyDescendant,
} from '@/features/source-files/sourceFilesInboundStorageApply'
import {
  createKnowgrphStorageCurrentOwnershipHandler,
  createKnowgrphStorageWorkspaceLifecycle,
} from '@/features/source-files/sourceFilesKnowgrphStorageLifecycle'
import { useGraphStore } from '@/hooks/useGraphStore'
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
import { inFlightSyncByWorkspace } from '@/lib/storage/knowgrphStorageClientSupport'
import type { KnowgrphStoragePulledChangesApplyArgs } from '@/lib/storage/knowgrphStorageClientTypes'
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

async function resetStorageContextState(): Promise<void> {
  resetWorkspaceSeedSyncRuntimeForTests()
  __resetKnowgrphStorageRouteAvailabilityForTests()
  await __resetKnowgrphStorageDbForTests()
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setSourceFiles([])
}

function installControlledWindow(t: TestContext): Map<number, () => void> {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const intervalCallbacks = new Map<number, () => void>()
  let nextIntervalId = 1
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      clearInterval(intervalId: number) {
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
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  return intervalCallbacks
}

async function waitForLiveInFlightSync(
  key: string,
  maxImmediateTurns = 20,
) {
  for (let turn = 0; turn < maxImmediateTurns; turn += 1) {
    const entry = inFlightSyncByWorkspace.get(key)
    if (entry && !entry.signal?.aborted) return entry
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  return undefined
}

test('fresh same-key lifecycle does not inherit an aborted in-flight sync', async t => {
  await resetStorageContextState()
  t.after(resetStorageContextState)
  const releaseSuspension = await acquireWorkspaceSeedSyncSuspension()
  const env = createFakeKnowgrphStorageWorkerEnv()
  const dbState = await getKnowgrphStorageDb()
  const staleLifecycle = new AbortController()
  let staleTransportCount = 0
  const staleSync = syncKnowgrphStorageNow({
    workspaceId: 'wk_flight_context_same_key',
    deviceId: 'dev_flight_context_same_key',
    baseUrl: 'https://example.com',
    dbState,
    signal: staleLifecycle.signal,
    fetchImpl: async () => {
      staleTransportCount += 1
      throw new Error('stale lifecycle reached transport')
    },
  })
  const staleRejection = assert.rejects(staleSync, /stale lifecycle aborted/)
  staleLifecycle.abort(new Error('stale lifecycle aborted'))

  const freshLifecycle = new AbortController()
  const freshTransportPaths: string[] = []
  const freshSync = syncKnowgrphStorageNow({
    workspaceId: 'wk_flight_context_same_key',
    deviceId: 'dev_flight_context_same_key',
    baseUrl: 'https://example.com',
    dbState,
    signal: freshLifecycle.signal,
    fetchImpl: async (input, init) => {
      const request = input instanceof Request ? input : new Request(String(input), init)
      freshTransportPaths.push(new URL(request.url).pathname)
      return worker.fetch(request, env as never)
    },
  })

  releaseSuspension()
  await staleRejection
  await freshSync
  assert.equal(staleTransportCount, 0)
  assert.deepEqual(freshTransportPaths, ['/api/storage/pull'])
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('loop pull reuses live task context for awaited inbound completion during drain', async t => {
  await resetStorageContextState()
  t.after(resetStorageContextState)
  const env = createFakeKnowgrphStorageWorkerEnv()
  const dbState = await getKnowgrphStorageDb()
  const workspaceId = 'wk_flight_context_loop_pull'
  const deviceId = 'dev_flight_context_loop_pull'
  await queueKnowgrphStorageMutation({
    workspaceId,
    deviceId,
    entity: 'document',
    op: 'upsert',
    record: {
      id: 'sf:flight_context_loop',
      workspaceId,
      canonicalPath: 'workspace:/flight-context-loop.md',
      title: 'flight-context-loop.md',
      docType: 'markdown',
      lang: 'en-US',
      graphId: null,
      sourceKind: 'markdown',
      contentMd: '# Flight context loop',
      contentHash: 'sha256:flight-context-loop',
      parserVersion: '1.0.0',
      revision: 1,
      updatedAtMs: 1_777_200_000_000,
      deleted: false,
    },
    dbState,
  })
  const firstTransportStarted = deferred()
  const allowFirstTransport = deferred()
  const nestedStarted = deferred()
  const allowNested = deferred()
  const inboundCompleted = deferred()
  const syncCompleted = deferred()
  const workspaceLifecycle = createKnowgrphStorageWorkspaceLifecycle()
  const capturedOwnership = workspaceLifecycle.begin()
  let firstTransport = true
  const stopLoop = startKnowgrphStorageSyncLoop({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    signal: capturedOwnership.signal,
    fetchImpl: async (input, init) => {
      const request = input instanceof Request ? input : new Request(String(input), init)
      if (firstTransport) {
        firstTransport = false
        firstTransportStarted.resolve()
        await allowFirstTransport.promise
      }
      return worker.fetch(request, env as never)
    },
    onPulledChangesApplied: createKnowgrphStorageCurrentOwnershipHandler(
      workspaceLifecycle,
      capturedOwnership,
      async ({ changes, signal, taskContext }: KnowgrphStoragePulledChangesApplyArgs) => {
        assert.equal(workspaceLifecycle.isCurrent(capturedOwnership), true)
        assert.equal(signal, taskContext.signal)
        assert.notEqual(signal, capturedOwnership.signal)
        assert.equal(signal.aborted, false)
        assert.equal(changes.documents.length, 1)
        await runSourceFilesInboundStorageApplyDescendant(async () => {
          nestedStarted.resolve()
          await allowNested.promise
        }, signal, taskContext)
        const result = applyPulledKnowgrphStorageChangesToSourceFiles({
          workspaceId,
          changes,
          signal,
          taskContext,
        })
        assert.equal(result.applied, true)
        await result.completion
        inboundCompleted.resolve()
      },
    ),
    onSyncCompleted: () => syncCompleted.resolve(),
  })
  await firstTransportStarted.promise
  let suspensionSettled = false
  const suspension = acquireWorkspaceSeedSyncSuspension().then(release => {
    suspensionSettled = true
    return release
  })
  await Promise.resolve()
  allowFirstTransport.resolve()
  await nestedStarted.promise
  assert.equal(suspensionSettled, false)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 1,
    suspensionCount: 1,
  })

  allowNested.resolve()
  await inboundCompleted.promise
  await syncCompleted.promise
  const releaseSuspension = await suspension
  stopLoop()
  workspaceLifecycle.stop()
  releaseSuspension()
  const visible = useGraphStore.getState().sourceFiles.find(file => (
    file.id === 'flight_context_loop'
  ))
  assert.equal(visible?.text, '# Flight context loop')
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('stopping after overlap scheduling cancels the successor before transport', async t => {
  await resetStorageContextState()
  const intervalCallbacks = installControlledWindow(t)
  const env = createFakeKnowgrphStorageWorkerEnv()
  const dbState = await getKnowgrphStorageDb()
  const firstCompletion = deferred()
  const transportPaths: string[] = []
  let completionCount = 0
  let releaseSuspension: (() => void) | undefined
  const stopLoop = startKnowgrphStorageSyncLoop({
    workspaceId: 'wk_flight_context_overlap_stop',
    deviceId: 'dev_flight_context_overlap_stop',
    baseUrl: 'https://example.com',
    dbState,
    fetchImpl: async (input, init) => {
      const request = input instanceof Request ? input : new Request(String(input), init)
      transportPaths.push(new URL(request.url).pathname)
      return worker.fetch(request, env as never)
    },
    onSyncCompleted: () => {
      completionCount += 1
      if (completionCount !== 1) return
      const poll = [...intervalCallbacks.values()][0]
      assert.equal(typeof poll, 'function')
      poll()
      firstCompletion.resolve()
    },
  })
  t.after(async () => {
    stopLoop()
    releaseSuspension?.()
    await new Promise<void>(resolve => setImmediate(resolve))
    await resetStorageContextState()
  })

  await firstCompletion.promise
  const inFlightKey = 'wk_flight_context_overlap_stop::dev_flight_context_overlap_stop'
  releaseSuspension = await acquireWorkspaceSeedSyncSuspension()
  const successorEntry = await waitForLiveInFlightSync(inFlightKey)
  assert.ok(successorEntry, 'successor did not acquire the in-flight owner')
  assert.equal(successorEntry?.signal?.aborted, false)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 1,
  })
  stopLoop()
  releaseSuspension()
  releaseSuspension = undefined
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(completionCount, 1)
  assert.deepEqual(transportPaths, ['/api/storage/pull'])
  assert.equal(inFlightSyncByWorkspace.has(inFlightKey), false)
  assert.equal(intervalCallbacks.size, 0)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('rejected signature releases its child before a fresh schedule', async t => {
  await resetStorageContextState()
  t.after(resetStorageContextState)
  const env = createFakeKnowgrphStorageWorkerEnv()
  const dbState = await getKnowgrphStorageDb()
  const workspaceId = 'wk_flight_context_rejected_signature'
  const deviceId = 'dev_flight_context_rejected_signature'
  const firstCompletion = deferred()
  const freshCompletion = deferred()
  let duplicateTransportCount = 0
  let transportCount = 0
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    transportCount += 1
    const request = input instanceof Request ? input : new Request(String(input), init)
    return worker.fetch(request, env as never)
  }
  scheduleKnowgrphStorageSync({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    delayMs: 0,
    signature: 'executed-signature',
    fetchImpl,
    onSyncCompleted: () => firstCompletion.resolve(),
  })
  await firstCompletion.promise
  const releaseFirstDrain = await acquireWorkspaceSeedSyncSuspension()
  releaseFirstDrain()

  scheduleKnowgrphStorageSync({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    delayMs: 0,
    signature: 'executed-signature',
    fetchImpl: async () => {
      duplicateTransportCount += 1
      throw new Error('rejected signature reached transport')
    },
  })
  scheduleKnowgrphStorageSync({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    delayMs: 0,
    signature: 'fresh-signature',
    fetchImpl,
    onSyncCompleted: () => freshCompletion.resolve(),
  })
  await freshCompletion.promise
  cancelKnowgrphStorageSync(workspaceId, deviceId)
  const releaseFreshDrain = await acquireWorkspaceSeedSyncSuspension()
  releaseFreshDrain()

  assert.equal(duplicateTransportCount, 0)
  assert.equal(transportCount, 2)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('aborted loop child cannot transport or apply after Flight exits', async t => {
  await resetStorageContextState()
  t.after(resetStorageContextState)
  const releaseSuspension = await acquireWorkspaceSeedSyncSuspension()
  const lifecycle = new AbortController()
  let applyCount = 0
  let transportCount = 0
  startKnowgrphStorageSyncLoop({
    workspaceId: 'wk_flight_context_aborted_child',
    deviceId: 'dev_flight_context_aborted_child',
    baseUrl: 'https://example.com',
    signal: lifecycle.signal,
    fetchImpl: async () => {
      transportCount += 1
      throw new Error('aborted child reached transport')
    },
    onPulledChangesApplied: () => {
      applyCount += 1
    },
  })
  lifecycle.abort(new Error('loop child cancelled'))
  releaseSuspension()
  await new Promise<void>(resolve => setImmediate(resolve))
  const releaseDrainCheck = await acquireWorkspaceSeedSyncSuspension()
  releaseDrainCheck()

  assert.equal(transportCount, 0)
  assert.equal(applyCount, 0)
  assert.deepEqual(useGraphStore.getState().sourceFiles, [])
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})
