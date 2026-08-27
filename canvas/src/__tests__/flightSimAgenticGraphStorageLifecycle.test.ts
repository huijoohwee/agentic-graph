import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createKnowgrphStorageCurrentOwnershipHandler,
  createKnowgrphStorageLatestOperationRunner,
  createKnowgrphStorageOperationTracker,
  createKnowgrphStorageWorkspaceLifecycle,
} from '@/features/source-files/sourceFilesKnowgrphStorageLifecycle'
import type {
  KnowgrphStorageRuntimeDependencies,
} from '@/features/source-files/sourceFilesKnowgrphStorageRuntime'

const DEPENDENCIES = Object.freeze({}) as KnowgrphStorageRuntimeDependencies

function createDeferred(): {
  promise: Promise<void>
  resolve: () => void
} {
  let resolve!: () => void
  const promise = new Promise<void>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await Promise.resolve()
  }
  assert.fail('condition did not settle')
}

test('workspace switch aborts the old loader and retries a stale shared rejection', async () => {
  let rejectOld!: (error: Error) => void
  const oldRequest = new Promise<KnowgrphStorageRuntimeDependencies>((_resolve, reject) => {
    rejectOld = reject
  })
  let calls = 0
  const lifecycle = createKnowgrphStorageWorkspaceLifecycle(async () => {
    calls += 1
    if (calls === 1) return oldRequest
    if (calls === 2) throw new Error('injected stale shared loader rejection')
    return DEPENDENCIES
  })

  const oldOwnership = lifecycle.begin()
  const oldLoad = lifecycle.loadDependencies(oldOwnership)
  const freshOwnership = lifecycle.begin()
  const freshLoad = lifecycle.loadDependencies(freshOwnership)
  rejectOld(new Error('old workspace loader aborted'))

  await assert.rejects(oldLoad, /old workspace loader aborted/)
  assert.equal(await freshLoad, DEPENDENCIES)
  assert.equal(calls, 3)
  assert.equal(oldOwnership.signal.aborted, true)
  assert.equal(lifecycle.isCurrent(freshOwnership), true)
  assert.equal(lifecycle.readDependencies(), DEPENDENCIES)
  lifecycle.stop()
})

test('stopping a workspace prevents a late dependency result from becoming current', async () => {
  let resolveLoad!: (dependencies: KnowgrphStorageRuntimeDependencies) => void
  const pending = new Promise<KnowgrphStorageRuntimeDependencies>(resolve => {
    resolveLoad = resolve
  })
  const lifecycle = createKnowgrphStorageWorkspaceLifecycle(async () => pending)
  const ownership = lifecycle.begin()
  const loading = lifecycle.loadDependencies(ownership)

  lifecycle.stop(new Error('injected workspace stop'))
  resolveLoad(DEPENDENCIES)
  await assert.rejects(loading, /injected workspace stop/)
  assert.equal(ownership.signal.aborted, true)
  assert.equal(lifecycle.readDependencies(), null)
  assert.equal(lifecycle.readOwnership(), null)
})

test('captured ownership accepts a live child signal and rejects aborted or stale children', () => {
  const lifecycle = createKnowgrphStorageWorkspaceLifecycle()
  const capturedOwnership = lifecycle.begin()
  const visited: string[] = []
  const handle = createKnowgrphStorageCurrentOwnershipHandler(
    lifecycle,
    capturedOwnership,
    (args: { label: string; signal?: AbortSignal }, ownership) => {
      assert.equal(ownership, capturedOwnership)
      visited.push(args.label)
    },
  )
  const liveChild = new AbortController()
  assert.notEqual(liveChild.signal, capturedOwnership.signal)
  handle({ label: 'live-child', signal: liveChild.signal })
  liveChild.abort(new Error('child sync ended'))
  handle({ label: 'aborted-child', signal: liveChild.signal })

  const freshOwnership = lifecycle.begin()
  handle({ label: 'stale-owner', signal: new AbortController().signal })
  assert.deepEqual(visited, ['live-child'])
  assert.equal(lifecycle.isCurrent(freshOwnership), true)
  lifecycle.stop()
})

test('settling an old inbound apply cannot clear a fresh overlapping suppression window', () => {
  const operations = createKnowgrphStorageOperationTracker()
  const oldOperation = operations.begin()
  const freshOperation = operations.begin()
  assert.equal(operations.size(), 2)

  operations.finish(oldOperation)
  operations.finish(oldOperation)
  assert.equal(operations.isActive(), true)
  assert.equal(operations.size(), 1)

  operations.finish(freshOperation)
  assert.equal(operations.isActive(), false)
  assert.equal(operations.size(), 0)
})

test('outbound storage operations serialize and retain only the latest pending request', async () => {
  const runner = createKnowgrphStorageLatestOperationRunner<number>()
  const first = createDeferred()
  const latest = createDeferred()
  const started: number[] = []
  const operation = async (request: number) => {
    started.push(request)
    await (request === 1 ? first.promise : latest.promise)
  }

  runner.enqueue(1, operation)
  runner.enqueue(2, operation)
  runner.enqueue(3, operation)
  await waitFor(() => started.length === 1)
  assert.deepEqual(started, [1])

  first.resolve()
  await waitFor(() => started.length === 2)
  assert.deepEqual(started, [1, 3])
  latest.resolve()
  await waitFor(() => !runner.isActive())
})

test('clearing a stopped workspace drops stale pending storage work', async () => {
  const runner = createKnowgrphStorageLatestOperationRunner<string>()
  const old = createDeferred()
  const fresh = createDeferred()
  const started: string[] = []
  const operation = async (request: string) => {
    started.push(request)
    await (request === 'old' ? old.promise : fresh.promise)
  }

  runner.enqueue('old', operation)
  runner.enqueue('stale-pending', operation)
  await waitFor(() => started.length === 1)
  runner.clearPending()
  runner.enqueue('fresh', operation)
  old.resolve()
  await waitFor(() => started.length === 2)
  assert.deepEqual(started, ['old', 'fresh'])
  fresh.resolve()
  await waitFor(() => !runner.isActive())
})

test('queued storage work cannot borrow ownership from a synchronous workspace switch', async () => {
  const lifecycle = createKnowgrphStorageWorkspaceLifecycle()
  const runner = createKnowgrphStorageLatestOperationRunner<{
    label: string
    ownership: ReturnType<typeof lifecycle.begin>
  }>()
  const visited: string[] = []
  const enqueue = (label: string) => {
    const ownership = lifecycle.readOwnership()!
    runner.enqueue({ label, ownership }, async request => {
      if (!lifecycle.isCurrent(request.ownership)) return
      visited.push(request.label)
    })
  }

  lifecycle.begin()
  enqueue('stale')
  lifecycle.begin()
  runner.clearPending()
  enqueue('fresh')

  await waitFor(() => !runner.isActive())
  assert.deepEqual(visited, ['fresh'])
  lifecycle.stop()
})

test('workspace switch waits for active old storage before starting its captured fresh owner', async () => {
  const lifecycle = createKnowgrphStorageWorkspaceLifecycle()
  const runner = createKnowgrphStorageLatestOperationRunner<{
    label: string
    ownership: ReturnType<typeof lifecycle.begin>
  }>()
  const old = createDeferred()
  const started: string[] = []
  const completed: string[] = []
  const enqueue = (label: string, gate?: Promise<void>) => {
    const ownership = lifecycle.readOwnership()!
    runner.enqueue({ label, ownership }, async request => {
      if (!lifecycle.isCurrent(request.ownership)) return
      started.push(request.label)
      await gate
      if (!lifecycle.isCurrent(request.ownership)) return
      completed.push(request.label)
    })
  }

  lifecycle.begin()
  enqueue('old', old.promise)
  await waitFor(() => started.length === 1)
  lifecycle.begin()
  runner.clearPending()
  enqueue('fresh')
  old.resolve()

  await waitFor(() => !runner.isActive())
  assert.deepEqual(started, ['old', 'fresh'])
  assert.deepEqual(completed, ['fresh'])
  lifecycle.stop()
})
