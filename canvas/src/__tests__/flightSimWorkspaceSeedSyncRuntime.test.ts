import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acquireWorkspaceSeedSyncTask,
  acquireWorkspaceSeedSyncSuspension,
  beginWorkspaceSeedSyncTask,
  readWorkspaceSeedSyncRuntimeSnapshot,
  resetWorkspaceSeedSyncRuntimeForTests,
  runWorkspaceSeedSyncTask,
  runWorkspaceSeedSyncTaskWithContext,
  subscribeWorkspaceSeedSyncResumed,
  type WorkspaceSeedSyncTaskContext,
} from '@/lib/workspace/workspaceSeedSyncRuntime'
import {
  createWorkspaceSeedSyncDeferredTask,
  drainWorkspaceSeedSyncDeferredRequests,
} from '@/lib/workspace/workspaceSeedSyncDeferredTask'

test('suspension drains admitted seed tasks and suppresses new tasks until release', async t => {
  resetWorkspaceSeedSyncRuntimeForTests()
  t.after(resetWorkspaceSeedSyncRuntimeForTests)
  const finishTask = beginWorkspaceSeedSyncTask()
  assert.ok(finishTask)

  const suspension = acquireWorkspaceSeedSyncSuspension()
  await Promise.resolve()
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 1,
    suspensionCount: 1,
  })
  assert.equal(beginWorkspaceSeedSyncTask(), null)

  finishTask()
  const release = await suspension
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 1,
  })
  assert.equal(beginWorkspaceSeedSyncTask(), null)

  release()
  release()
  const finishResumedTask = beginWorkspaceSeedSyncTask()
  assert.ok(finishResumedTask)
  finishResumedTask()
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('aborted suspension wait removes only its suspension ownership', async t => {
  resetWorkspaceSeedSyncRuntimeForTests()
  t.after(resetWorkspaceSeedSyncRuntimeForTests)
  const finishTask = beginWorkspaceSeedSyncTask()
  assert.ok(finishTask)
  const controller = new AbortController()
  let resumeNotifications = 0
  const unsubscribe = subscribeWorkspaceSeedSyncResumed(() => {
    resumeNotifications += 1
  })
  const suspension = acquireWorkspaceSeedSyncSuspension(controller.signal)
  await Promise.resolve()

  controller.abort(new Error('injected seed-sync drain abort'))
  await assert.rejects(suspension, /injected seed-sync drain abort/)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 1,
    suspensionCount: 0,
  })
  assert.equal(resumeNotifications, 1)
  unsubscribe()

  const finishConcurrentTask = beginWorkspaceSeedSyncTask()
  assert.ok(finishConcurrentTask)
  finishConcurrentTask()
  finishTask()
})

test('nested suspensions retain suppression until the final owner releases', async t => {
  resetWorkspaceSeedSyncRuntimeForTests()
  t.after(resetWorkspaceSeedSyncRuntimeForTests)
  const releaseFirst = await acquireWorkspaceSeedSyncSuspension()
  const releaseSecond = await acquireWorkspaceSeedSyncSuspension()
  let resumeNotifications = 0
  const unsubscribe = subscribeWorkspaceSeedSyncResumed(() => {
    resumeNotifications += 1
  })
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 2,
  })

  releaseFirst()
  assert.equal(resumeNotifications, 0)
  assert.equal(beginWorkspaceSeedSyncTask(), null)
  releaseSecond()
  assert.equal(resumeNotifications, 1)
  const finishTask = beginWorkspaceSeedSyncTask()
  assert.ok(finishTask)
  finishTask()
  unsubscribe()
})

test('async task admission waits for final suspension release and owns the full operation', async t => {
  resetWorkspaceSeedSyncRuntimeForTests()
  t.after(resetWorkspaceSeedSyncRuntimeForTests)
  const releaseFirst = await acquireWorkspaceSeedSyncSuspension()
  const releaseSecond = await acquireWorkspaceSeedSyncSuspension()
  let admitted = false
  const task = acquireWorkspaceSeedSyncTask().then(finish => {
    admitted = true
    return finish
  })

  await Promise.resolve()
  assert.equal(admitted, false)
  releaseFirst()
  await Promise.resolve()
  assert.equal(admitted, false)

  releaseSecond()
  const finish = await task
  assert.equal(admitted, true)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 1,
    suspensionCount: 0,
  })
  finish()
  finish()
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('runtime reset rejects private resume waiters instead of stranding them', async () => {
  resetWorkspaceSeedSyncRuntimeForTests()
  const release = await acquireWorkspaceSeedSyncSuspension()
  const task = acquireWorkspaceSeedSyncTask()
  await Promise.resolve()

  resetWorkspaceSeedSyncRuntimeForTests()
  await assert.rejects(task, /Workspace seed sync runtime was reset/)
  release()
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('runtime reset refuses a settled fast-path lease until its owner finishes', async () => {
  resetWorkspaceSeedSyncRuntimeForTests()
  const finish = await acquireWorkspaceSeedSyncTask()
  assert.equal(readWorkspaceSeedSyncRuntimeSnapshot().activeTaskCount, 1)

  try {
    assert.throws(
      () => resetWorkspaceSeedSyncRuntimeForTests(),
      /Finish active workspace seed sync tasks before resetting the runtime/,
    )
  } finally {
    finish()
  }
  resetWorkspaceSeedSyncRuntimeForTests()
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('reset before suspension admission settles rejects the removed ownership', async () => {
  resetWorkspaceSeedSyncRuntimeForTests()
  const suspension = acquireWorkspaceSeedSyncSuspension()
  assert.equal(readWorkspaceSeedSyncRuntimeSnapshot().suspensionCount, 1)

  resetWorkspaceSeedSyncRuntimeForTests()
  await assert.rejects(suspension, /Workspace seed sync runtime was reset/)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('release followed by reset cannot admit a stale task into the fresh runtime', async () => {
  resetWorkspaceSeedSyncRuntimeForTests()
  const release = await acquireWorkspaceSeedSyncSuspension()
  const task = acquireWorkspaceSeedSyncTask()

  release()
  resetWorkspaceSeedSyncRuntimeForTests()
  await assert.rejects(task, /Workspace seed sync runtime was reset/)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('abort and final release settle each private resume waiter exactly once', async t => {
  resetWorkspaceSeedSyncRuntimeForTests()
  t.after(resetWorkspaceSeedSyncRuntimeForTests)
  const releaseAbortedWait = await acquireWorkspaceSeedSyncSuspension()
  const abortedController = new AbortController()
  let abortedSettlements = 0
  const abortedTask = acquireWorkspaceSeedSyncTask(abortedController.signal).finally(() => {
    abortedSettlements += 1
  })
  await Promise.resolve()
  abortedController.abort(new Error('injected task admission abort'))
  releaseAbortedWait()
  await assert.rejects(abortedTask, /injected task admission abort/)
  await Promise.resolve()
  assert.equal(abortedSettlements, 1)

  const releaseResolvedWait = await acquireWorkspaceSeedSyncSuspension()
  const resolvedController = new AbortController()
  let resolvedSettlements = 0
  const resolvedTask = acquireWorkspaceSeedSyncTask(resolvedController.signal).finally(() => {
    resolvedSettlements += 1
  })
  await Promise.resolve()
  releaseResolvedWait()
  const finish = await resolvedTask
  resolvedController.abort(new Error('late task admission abort'))
  await Promise.resolve()
  assert.equal(resolvedSettlements, 1)
  finish()
})

test('task runner rejects an aborted operation result and releases ownership', async () => {
  resetWorkspaceSeedSyncRuntimeForTests()
  const controller = new AbortController()
  let finishOperation!: () => void
  const operation = new Promise<void>(resolve => {
    finishOperation = resolve
  })
  let markStarted!: () => void
  const started = new Promise<void>(resolve => {
    markStarted = resolve
  })
  const running = runWorkspaceSeedSyncTask(controller.signal, async () => {
    markStarted()
    await operation
    return 'stale-result'
  })
  await started
  assert.equal(readWorkspaceSeedSyncRuntimeSnapshot().activeTaskCount, 1)

  controller.abort(new Error('injected running operation abort'))
  finishOperation()
  await assert.rejects(running, /injected running operation abort/)
  assert.equal(readWorkspaceSeedSyncRuntimeSnapshot().activeTaskCount, 0)
  resetWorkspaceSeedSyncRuntimeForTests()
})

test('admitted outer task reuses its context while a suspension waits for exact release', async t => {
  resetWorkspaceSeedSyncRuntimeForTests()
  t.after(resetWorkspaceSeedSyncRuntimeForTests)
  let markOuterAdmitted!: () => void
  const outerAdmitted = new Promise<void>(resolve => {
    markOuterAdmitted = resolve
  })
  let allowNested!: () => void
  const nestedGate = new Promise<void>(resolve => {
    allowNested = resolve
  })
  let nestedCompleted = false
  const outer = runWorkspaceSeedSyncTask(undefined, async context => {
    markOuterAdmitted()
    await nestedGate
    await runWorkspaceSeedSyncTaskWithContext(context, async nestedContext => {
      assert.equal(nestedContext, context)
      nestedCompleted = true
    })
  })
  await outerAdmitted

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

  allowNested()
  await outer
  assert.equal(nestedCompleted, true)
  const releaseSuspension = await suspension
  assert.equal(suspensionSettled, true)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 1,
  })
  releaseSuspension()
})

test('nested task contexts reject closed, stale, foreign, and aborted ownership', async () => {
  resetWorkspaceSeedSyncRuntimeForTests()
  let closedContext!: WorkspaceSeedSyncTaskContext
  await runWorkspaceSeedSyncTask(undefined, context => {
    closedContext = context
  })
  await assert.rejects(
    runWorkspaceSeedSyncTaskWithContext(closedContext, () => undefined),
    /task context is closed/,
  )

  resetWorkspaceSeedSyncRuntimeForTests()
  await assert.rejects(
    runWorkspaceSeedSyncTaskWithContext(closedContext, () => undefined),
    /Workspace seed sync runtime was reset/,
  )
  const foreignContext = Object.freeze({
    signal: new AbortController().signal,
  }) as WorkspaceSeedSyncTaskContext
  await assert.rejects(
    runWorkspaceSeedSyncTaskWithContext(foreignContext, () => undefined),
    /task context is foreign/,
  )

  const controller = new AbortController()
  const aborted = runWorkspaceSeedSyncTask(controller.signal, async context => {
    await runWorkspaceSeedSyncTaskWithContext(context, async nestedContext => {
      assert.equal(nestedContext.signal.aborted, false)
      controller.abort(new Error('injected nested context abort'))
      await Promise.resolve()
    })
  })
  await assert.rejects(aborted, /injected nested context abort/)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
  resetWorkspaceSeedSyncRuntimeForTests()
})

test('deferred rematerialization keeps one lease while an in-flight drain consumes the latest request', () => {
  resetWorkspaceSeedSyncRuntimeForTests()
  const deferred = createWorkspaceSeedSyncDeferredTask<{ id: number }>()
  assert.equal(deferred.admit({ id: 1 }), true)
  assert.deepEqual(deferred.takePending(), { id: 1 })
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 1,
    suspensionCount: 0,
  })

  assert.equal(deferred.admit({ id: 2 }), true)
  assert.deepEqual(deferred.takePending(), { id: 2 })
  assert.equal(deferred.takePending(), null)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 1,
    suspensionCount: 0,
  })

  deferred.complete()
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 0,
  })
})

test('failed rematerialization still drains a request retained during the failed await', async () => {
  resetWorkspaceSeedSyncRuntimeForTests()
  const deferred = createWorkspaceSeedSyncDeferredTask<{ id: number }>()
  assert.equal(deferred.admit({ id: 1 }), true)
  const firstRequest = deferred.takePending()
  assert.ok(firstRequest)
  let rejectFirst!: (error: Error) => void
  const firstRun = new Promise<void>((_resolve, reject) => {
    rejectFirst = reject
  })
  const visited: number[] = []
  const draining = drainWorkspaceSeedSyncDeferredRequests({
    initialRequest: firstRequest,
    task: deferred,
    run: request => {
      visited.push(request.id)
      return request.id === 1 ? firstRun : Promise.resolve()
    },
  })

  await Promise.resolve()
  assert.equal(deferred.admit({ id: 2 }), true)
  rejectFirst(new Error('injected first rematerialization failure'))
  await draining
  assert.deepEqual(visited, [1, 2])
  assert.equal(deferred.peekPending(), null)
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 1,
    suspensionCount: 0,
  })
  deferred.complete()
  assert.equal(readWorkspaceSeedSyncRuntimeSnapshot().activeTaskCount, 0)
})
