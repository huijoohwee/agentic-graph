import assert from 'node:assert/strict'
import test from 'node:test'
import storageWorkerModule from '../../../cloudflare/workers/agenticgraph-storage/index.ts'
import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fakeAgenticGraphStorageD1'
import {
  applyPulledAgenticGraphStorageChangesToSourceFiles,
} from '@/features/source-files/sourceFilesInboundStorageApply'
import {
  createAgenticGraphStorageCurrentOwnershipHandler,
  createAgenticGraphStorageWorkspaceLifecycle,
} from '@/features/source-files/sourceFilesAgenticGraphStorageLifecycle'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  __resetAgenticGraphStorageDbForTests,
  getAgenticGraphStorageDb,
} from '@/lib/storage/agenticgraphStorageDb'
import {
  __resetAgenticGraphStorageRouteAvailabilityForTests,
  startAgenticGraphStorageSyncLoop,
  syncAgenticGraphStorageNow,
} from '@/lib/storage/agenticgraphStorageClientSync'
import type {
  AgenticGraphStoragePulledChangesApplyArgs,
} from '@/lib/storage/agenticgraphStorageClientTypes'
import {
  AGENTICGRAPH_STORAGE_API_VERSION,
  hashAgenticGraphStorageContent,
} from '@/lib/storage/agenticgraphStorageSyncContract'
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

async function resetStorageRaceState(): Promise<void> {
  resetWorkspaceSeedSyncRuntimeForTests()
  __resetAgenticGraphStorageRouteAvailabilityForTests()
  await __resetAgenticGraphStorageDbForTests()
}

function createWorkerFetch(
  env: ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv>,
) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    return worker.fetch(request, env as never)
  }
}

test('stale same-device cleanup cannot delete an immediately restarted in-flight sync', async t => {
  await resetStorageRaceState()
  t.after(resetStorageRaceState)
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const dbState = await getAgenticGraphStorageDb()
  const workspaceId = 'wk_flight_storage_restart_race'
  const deviceId = 'dev_flight_storage_restart_race'
  const oldTransportStarted = deferred()
  const releaseOldTransport = deferred()
  const freshTransportStarted = deferred()
  const releaseFreshTransport = deferred()
  const oldLifecycle = new AbortController()
  const freshLifecycle = new AbortController()
  let freshTransportCount = 0
  let duplicateTransportCount = 0

  const oldSync = syncAgenticGraphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    signal: oldLifecycle.signal,
    fetchImpl: async (input, init) => {
      oldTransportStarted.resolve()
      await releaseOldTransport.promise
      return createWorkerFetch(env)(input, init)
    },
  })
  const oldRejection = assert.rejects(oldSync, /old storage ownership ended/)
  await oldTransportStarted.promise

  oldLifecycle.abort(new Error('old storage ownership ended'))
  const freshSync = syncAgenticGraphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    signal: freshLifecycle.signal,
    fetchImpl: async (input, init) => {
      freshTransportCount += 1
      freshTransportStarted.resolve()
      await releaseFreshTransport.promise
      return createWorkerFetch(env)(input, init)
    },
  })

  await freshTransportStarted.promise
  await oldRejection
  const duplicateOfFreshSync = syncAgenticGraphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    signal: freshLifecycle.signal,
    fetchImpl: async (input, init) => {
      duplicateTransportCount += 1
      return createWorkerFetch(env)(input, init)
    },
  })

  releaseOldTransport.resolve()
  releaseFreshTransport.resolve()
  const [freshResult, duplicateResult] = await Promise.all([
    freshSync,
    duplicateOfFreshSync,
  ])
  const releaseDrain = await acquireWorkspaceSeedSyncSuspension()

  assert.equal(freshTransportCount, 1)
  assert.equal(duplicateTransportCount, 0)
  assert.equal(freshResult.transportStatus, 'synced')
  assert.deepEqual(duplicateResult, freshResult)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 1,
  })
  releaseDrain()
})

test('fresh same-device sync waits for an aborted owner callback to settle', async t => {
  await resetStorageRaceState()
  t.after(resetStorageRaceState)
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const dbState = await getAgenticGraphStorageDb()
  const workspaceId = 'wk_flight_storage_callback_serialization'
  const deviceId = 'dev_flight_storage_callback_serialization'
  const oldCompletionStarted = deferred()
  const releaseOldCompletion = deferred()
  const oldLifecycle = new AbortController()
  const freshLifecycle = new AbortController()
  let freshTransportCount = 0

  const oldSync = syncAgenticGraphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    signal: oldLifecycle.signal,
    fetchImpl: createWorkerFetch(env),
    onSyncCompleted: async () => {
      oldCompletionStarted.resolve()
      await releaseOldCompletion.promise
    },
  })
  await oldCompletionStarted.promise

  oldLifecycle.abort(new Error('old callback ownership ended'))
  const oldRejection = assert.rejects(oldSync, /old callback ownership ended/)
  const freshSync = syncAgenticGraphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    signal: freshLifecycle.signal,
    fetchImpl: async (input, init) => {
      freshTransportCount += 1
      return createWorkerFetch(env)(input, init)
    },
  })

  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(freshTransportCount, 0)
  releaseOldCompletion.resolve()
  await oldRejection
  const freshResult = await freshSync
  const releaseDrain = await acquireWorkspaceSeedSyncSuspension()

  assert.equal(freshTransportCount, 1)
  assert.equal(freshResult.transportStatus, 'synced')
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 1,
  })
  releaseDrain()
})

test('multiple same-device successors serialize without a promise cycle', { timeout: 2_000 }, async t => {
  await resetStorageRaceState()
  t.after(resetStorageRaceState)
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const dbState = await getAgenticGraphStorageDb()
  const workspaceId = 'wk_flight_storage_successor_queue'
  const deviceId = 'dev_flight_storage_successor_queue'
  const releaseFirstCompletion = deferred()
  const firstCompletionStarted = deferred()
  const transportOwners: string[] = []
  const fetchFor = (owner: string) => async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    transportOwners.push(owner)
    return createWorkerFetch(env)(input, init)
  }

  const first = syncAgenticGraphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    fetchImpl: fetchFor('first'),
    onSyncCompleted: async () => {
      firstCompletionStarted.resolve()
      await releaseFirstCompletion.promise
    },
  })
  await firstCompletionStarted.promise

  const secondLifecycle = new AbortController()
  const thirdLifecycle = new AbortController()
  const second = syncAgenticGraphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    signal: secondLifecycle.signal,
    fetchImpl: fetchFor('second'),
  })
  const third = syncAgenticGraphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    signal: thirdLifecycle.signal,
    fetchImpl: fetchFor('third'),
  })
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.deepEqual(transportOwners, ['first'])

  releaseFirstCompletion.resolve()
  const results = await Promise.all([first, second, third])
  const releaseDrain = await acquireWorkspaceSeedSyncSuspension()

  assert.deepEqual(transportOwners, ['first', 'second', 'third'])
  assert.deepEqual(results.map(result => result.transportStatus), [
    'synced',
    'synced',
    'synced',
  ])
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 1,
  })
  releaseDrain()
})

test('loop applies a non-empty pull through captured workspace ownership and drains', async t => {
  await resetStorageRaceState()
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setSourceFiles([])
  t.after(async () => {
    useGraphStore.getState().resetAll()
    await resetStorageRaceState()
  })
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'wk_flight_storage_owned_pull'
  const deviceId = 'dev_flight_storage_owned_pull'
  const remoteDocumentId = 'sf:flight_storage_owned_pull'
  const markdown = '# Flight storage owned pull'
  const seedResponse = await worker.fetch(
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
        workspaceId,
        deviceId: 'dev_flight_storage_remote_seed',
        mutations: [{
          mutationId: 'mut_flight_storage_owned_pull',
          workspaceId,
          entity: 'document',
          op: 'upsert',
          recordId: remoteDocumentId,
          baseRevision: null,
          record: {
            id: remoteDocumentId,
            workspaceId,
            canonicalPath: 'workspace:/flight-storage-owned-pull.md',
            title: 'flight-storage-owned-pull.md',
            docType: 'markdown',
            lang: null,
            graphId: null,
            sourceKind: 'markdown',
            contentMd: markdown,
            contentHash: hashAgenticGraphStorageContent(markdown),
            parserVersion: 'markdown-frontmatter',
            revision: 1,
            updatedAtMs: 1_777_300_000_000,
            deleted: false,
          },
        }],
      }),
    }),
    env as never,
  )
  assert.equal(seedResponse.ok, true)

  const lifecycle = createAgenticGraphStorageWorkspaceLifecycle()
  const ownership = lifecycle.begin()
  const dbState = await getAgenticGraphStorageDb()
  const syncCompleted = deferred()
  let appliedCount = 0
  let callbackTaskSignal: AbortSignal | null = null
  const applyPulledChanges = createAgenticGraphStorageCurrentOwnershipHandler(
    lifecycle,
    ownership,
    async (args: AgenticGraphStoragePulledChangesApplyArgs, capturedOwnership) => {
      assert.equal(capturedOwnership, ownership)
      assert.equal(args.workspaceId, workspaceId)
      assert.equal(args.changes.documents.length, 1)
      assert.equal(args.signal, args.taskContext.signal)
      assert.equal(args.signal.aborted, false)
      callbackTaskSignal = args.taskContext.signal
      const applied = applyPulledAgenticGraphStorageChangesToSourceFiles({
        workspaceId: args.workspaceId,
        changes: args.changes,
        signal: args.signal,
        taskContext: args.taskContext,
      })
      assert.equal(applied.applied, true)
      appliedCount += 1
      await applied.completion
    },
  )
  const stopLoop = startAgenticGraphStorageSyncLoop({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    dbState,
    initialDelayMs: 0,
    pollIntervalMs: 60_000,
    signal: ownership.signal,
    fetchImpl: createWorkerFetch(env),
    onPulledChangesApplied: applyPulledChanges,
    onSyncCompleted: () => syncCompleted.resolve(),
  })

  await syncCompleted.promise
  const releaseDrain = await acquireWorkspaceSeedSyncSuspension()
  const sourceFile = useGraphStore.getState().sourceFiles.find(
    entry => entry.id === 'flight_storage_owned_pull',
  )

  assert.equal(appliedCount, 1)
  assert.equal(callbackTaskSignal?.aborted, true)
  assert.equal(sourceFile?.text, markdown)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 1,
  })
  stopLoop()
  lifecycle.stop()
  releaseDrain()
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})
