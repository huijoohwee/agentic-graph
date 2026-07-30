import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkspaceSeedSyncDeferredScheduler } from '@/lib/workspace/workspaceSeedSyncDeferredScheduler'
import {
  acquireWorkspaceSeedSyncSuspension,
  readWorkspaceSeedSyncRuntimeSnapshot,
  resetWorkspaceSeedSyncRuntimeForTests,
} from '@/lib/workspace/workspaceSeedSyncRuntime'

function createFakeTimerRuntime() {
  let nextId = 1
  const active = new Map<number, () => void>()
  const history = new Map<number, () => void>()
  return {
    runtime: {
      clearTimeout(handle: unknown) {
        active.delete(Number(handle))
      },
      setTimeout(callback: () => void) {
        const id = nextId
        nextId += 1
        active.set(id, callback)
        history.set(id, callback)
        return id
      },
    },
    activeCount: () => active.size,
    fire(id: number) {
      const callback = active.get(id)
      assert.ok(callback)
      active.delete(id)
      callback()
    },
    ids: () => [...active.keys()],
    replay(id: number) {
      const callback = history.get(id)
      assert.ok(callback)
      callback()
    },
  }
}

async function flushScheduler(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

test('debounce replacement retains only the latest request and one timer', async () => {
  resetWorkspaceSeedSyncRuntimeForTests()
  const timers = createFakeTimerRuntime()
  const scheduler = createWorkspaceSeedSyncDeferredScheduler<{ id: number }>(timers.runtime)
  const visited: number[] = []
  scheduler.configure({
    delayMs: 25,
    run: async request => {
      visited.push(request.id)
    },
  })
  try {
    scheduler.schedule({ id: 1 })
    const firstTimer = timers.ids()[0]
    assert.ok(firstTimer)
    scheduler.schedule({ id: 2 })
    const secondTimer = timers.ids()[0]
    assert.ok(secondTimer)
    assert.notEqual(secondTimer, firstTimer)
    assert.equal(timers.activeCount(), 1)

    timers.fire(secondTimer)
    await flushScheduler()
    assert.deepEqual(visited, [2])
    assert.deepEqual(scheduler.readSnapshot(), {
      inFlight: false,
      pending: false,
      timerScheduled: false,
    })

    scheduler.configure({
      delayMs: 0,
      run: async request => {
        visited.push(request.id)
      },
    })
    scheduler.schedule({ id: 3 })
    await flushScheduler()
    assert.deepEqual(visited, [2, 3])
    assert.equal(timers.activeCount(), 0)
  } finally {
    scheduler.cleanup()
    resetWorkspaceSeedSyncRuntimeForTests()
  }
})

test('failed in-flight request drains a concurrent enqueue without an orphan timer or duplicate run', async () => {
  resetWorkspaceSeedSyncRuntimeForTests()
  const timers = createFakeTimerRuntime()
  const scheduler = createWorkspaceSeedSyncDeferredScheduler<{ id: number }>(timers.runtime)
  let rejectFirst!: (error: Error) => void
  const firstRun = new Promise<void>((_resolve, reject) => {
    rejectFirst = reject
  })
  let finishSecond!: () => void
  const secondFinished = new Promise<void>(resolve => {
    finishSecond = resolve
  })
  const visited: number[] = []
  scheduler.configure({
    delayMs: 25,
    run: request => {
      visited.push(request.id)
      if (request.id === 1) return firstRun
      finishSecond()
      return Promise.resolve()
    },
  })
  try {
    scheduler.schedule({ id: 1 })
    const originalTimer = timers.ids()[0]
    assert.ok(originalTimer)
    timers.fire(originalTimer)
    await Promise.resolve()
    assert.equal(scheduler.readSnapshot().inFlight, true)

    scheduler.schedule({ id: 2 })
    assert.equal(timers.activeCount(), 0)
    assert.equal(scheduler.readSnapshot().pending, true)
    rejectFirst(new Error('injected current request failure'))
    await secondFinished
    await flushScheduler()
    assert.deepEqual(visited, [1, 2])
    assert.equal(readWorkspaceSeedSyncRuntimeSnapshot().activeTaskCount, 0)

    timers.replay(originalTimer)
    await flushScheduler()
    assert.deepEqual(visited, [1, 2])
    assert.equal(readWorkspaceSeedSyncRuntimeSnapshot().activeTaskCount, 0)
  } finally {
    rejectFirst(new Error('test cleanup'))
    scheduler.cleanup()
    resetWorkspaceSeedSyncRuntimeForTests()
  }
})

test('suspended request resumes exactly once and cleanup cancels an idle timer lease', async () => {
  resetWorkspaceSeedSyncRuntimeForTests()
  const timers = createFakeTimerRuntime()
  const scheduler = createWorkspaceSeedSyncDeferredScheduler<{ id: number }>(timers.runtime)
  const visited: number[] = []
  scheduler.configure({
    delayMs: 0,
    run: async request => {
      visited.push(request.id)
    },
  })
  const unsubscribe = scheduler.subscribeResume()
  try {
    const release = await acquireWorkspaceSeedSyncSuspension()
    scheduler.schedule({ id: 1 })
    assert.deepEqual(scheduler.readSnapshot(), {
      inFlight: false,
      pending: true,
      timerScheduled: false,
    })
    release()
    await flushScheduler()
    assert.deepEqual(visited, [1])
    assert.equal(readWorkspaceSeedSyncRuntimeSnapshot().activeTaskCount, 0)

    scheduler.configure({
      delayMs: 25,
      run: async request => {
        visited.push(request.id)
      },
    })
    scheduler.schedule({ id: 2 })
    const cancelledTimer = timers.ids()[0]
    assert.ok(cancelledTimer)
    scheduler.cleanup()
    assert.equal(timers.activeCount(), 0)
    assert.deepEqual(scheduler.readSnapshot(), {
      inFlight: false,
      pending: false,
      timerScheduled: false,
    })
    timers.replay(cancelledTimer)
    await flushScheduler()
    assert.deepEqual(visited, [1])
  } finally {
    unsubscribe()
    scheduler.cleanup()
    resetWorkspaceSeedSyncRuntimeForTests()
  }
})
