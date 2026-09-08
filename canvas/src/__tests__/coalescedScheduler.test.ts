import { scheduleCoalescedTask, cancelCoalescedTask } from '@/lib/async/coalescedScheduler'
import { cancelWorkspaceSyncTask, scheduleWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'

export async function testCoalescedSchedulerCoalescesLatestCallback() {
  const key = 'test:coalescedScheduler:coalesce'
  const calls: string[] = []

  scheduleCoalescedTask(key, () => {
    calls.push('first')
  }, 10)

  scheduleCoalescedTask(key, () => {
    calls.push('second')
  }, 10)

  await new Promise(resolve => setTimeout(resolve, 40))

  if (calls.length !== 1) {
    throw new Error(`expected 1 call, got ${calls.length}`)
  }
  if (calls[0] !== 'second') {
    throw new Error(`expected last callback to win, got ${calls[0]}`)
  }
}

export async function testCoalescedSchedulerCancelPreventsCallback() {
  const key = 'test:coalescedScheduler:cancel'
  let called = false

  scheduleCoalescedTask(key, () => {
    called = true
  }, 10)

  cancelCoalescedTask(key)

  await new Promise(resolve => setTimeout(resolve, 40))

  if (called) {
    throw new Error('expected cancelCoalescedTask to prevent callback execution')
  }
}

export async function testWorkspaceSyncSchedulerRunsLatestPerTaskUnderSharedKey() {
  const calls: string[] = []
  scheduleWorkspaceSyncTask('runtime:refresh', () => {
    calls.push('runtime:first')
  }, 10)
  scheduleWorkspaceSyncTask('runtime:refresh', () => {
    calls.push('runtime:latest')
  }, 10)
  scheduleWorkspaceSyncTask('persistence:source-files', () => {
    calls.push('persistence:latest')
  }, 10)

  await new Promise(resolve => setTimeout(resolve, 40))

  if (calls.length !== 2) {
    throw new Error(`expected 2 calls, got ${calls.length}`)
  }
  if (!calls.includes('runtime:latest')) {
    throw new Error('expected runtime task to keep only latest callback')
  }
  if (!calls.includes('persistence:latest')) {
    throw new Error('expected persistence task to execute once under shared scheduler key')
  }
}

export async function testWorkspaceSyncSchedulerSuppressesRepeatedSignature() {
  const calls: string[] = []
  scheduleWorkspaceSyncTask('runtime:refresh', () => {
    calls.push('runtime:once')
  }, 10, { signature: 'same' })
  scheduleWorkspaceSyncTask('runtime:refresh', () => {
    calls.push('runtime:twice')
  }, 10, { signature: 'same' })

  await new Promise(resolve => setTimeout(resolve, 40))

  if (calls.length !== 1) {
    throw new Error(`expected only one call for same signature, got ${calls.length}`)
  }
  if (calls[0] !== 'runtime:twice') {
    throw new Error(`expected latest callback to be retained for same signature, got ${calls[0]}`)
  }
}

export async function testWorkspaceSyncSchedulerDoesNotDelayExistingFlushForLaterTask() {
  const calls: string[] = []
  scheduleWorkspaceSyncTask('runtime:refresh', () => {
    calls.push('runtime')
  }, 25)

  await new Promise(resolve => setTimeout(resolve, 5))

  scheduleWorkspaceSyncTask('persistence:prefs', () => {
    calls.push('persistence')
  }, 80)

  await new Promise(resolve => setTimeout(resolve, 45))

  if (!calls.includes('runtime')) {
    throw new Error('expected runtime task to run on the original flush window')
  }
  if (!calls.includes('persistence')) {
    throw new Error('expected later task to join existing flush instead of delaying it')
  }
}

export async function testWorkspaceSyncSchedulerCancelDoesNotResetSignatureDedupe() {
  const calls: string[] = []
  const firstAdmitted = scheduleWorkspaceSyncTask('runtime:refresh', () => {
    calls.push('runtime:once')
  }, 10, { signature: 'stable-signature' })
  if (!firstAdmitted) throw new Error('expected the first signature to be admitted')

  await new Promise(resolve => setTimeout(resolve, 40))

  cancelWorkspaceSyncTask('runtime:refresh')

  const duplicateAdmitted = scheduleWorkspaceSyncTask('runtime:refresh', () => {
    calls.push('runtime:duplicate')
  }, 10, { signature: 'stable-signature' })
  if (duplicateAdmitted) throw new Error('expected the executed duplicate signature to be rejected')

  await new Promise(resolve => setTimeout(resolve, 40))

  if (calls.length !== 1) {
    throw new Error(`expected duplicate signature to stay suppressed after cancel, got ${calls.length}`)
  }
  if (calls[0] !== 'runtime:once') {
    throw new Error(`expected first call to remain the only execution, got ${calls[0]}`)
  }
}

export async function testWorkspaceSyncSchedulerScopeKeySuppressesRepeatedSignatureAcrossTaskKeys() {
  const calls: string[] = []
  const scopeKey = 'source-files:runtime-persistence'
  scheduleWorkspaceSyncTask('source-files:runtime', () => {
    calls.push('runtime:once')
  }, 10, { signature: 'same-signature', scopeKey })

  await new Promise(resolve => setTimeout(resolve, 40))

  scheduleWorkspaceSyncTask('source-files:persistence', () => {
    calls.push('persistence:duplicate')
  }, 10, { signature: 'same-signature', scopeKey })

  await new Promise(resolve => setTimeout(resolve, 40))

  if (calls.length !== 1) {
    throw new Error(`expected duplicate scoped signature to be suppressed across task keys, got ${calls.length}`)
  }
  if (calls[0] !== 'runtime:once') {
    throw new Error(`expected first scoped callback to remain the only execution, got ${calls[0]}`)
  }
}

export async function testWorkspaceSyncSchedulerScopeKeyKeepsLatestAcrossTaskKeysWithinSameFlush() {
  const calls: string[] = []
  const scopeKey = 'source-files:runtime-persistence:same-flush'
  scheduleWorkspaceSyncTask('source-files:runtime', () => {
    calls.push('runtime:first')
  }, 20, { signature: 'same-signature-same-flush', scopeKey })
  scheduleWorkspaceSyncTask('source-files:persistence', () => {
    calls.push('persistence:latest')
  }, 20, { signature: 'same-signature-same-flush', scopeKey })

  await new Promise(resolve => setTimeout(resolve, 60))

  if (calls.length !== 1) {
    throw new Error(`expected one scoped callback in same flush window, got ${calls.length}`)
  }
  if (calls[0] !== 'persistence:latest') {
    throw new Error(`expected latest scoped callback to win, got ${calls[0]}`)
  }
}

async function withSchedulerWindows(keys: string[], run: (create: () => { window: Window; close: () => void }) => Promise<void>) {
  const { initJsdomHarness } = await import('@/tests/lib/jsdomHarness')
  const closes: Array<() => void> = [], errors: unknown[] = []
  const create = () => {
    const harness = initJsdomHarness()
    let active = true
    const close = () => { if (active) { active = false; harness.restore() } }
    closes.push(close)
    return { window: harness.dom.window as unknown as Window, close }
  }
  try { await run(create) } catch (error) { errors.push(error) }
  finally {
    for (const key of keys) { cancelWorkspaceSyncTask(key); cancelCoalescedTask(key) }
    for (const close of closes.reverse()) { try { close() } catch (error) { errors.push(error) } }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length) throw Object.assign(new Error(errors.map(error => String((error as Error)?.message ?? error)).join('; ')), { errors })
}

export async function testWorkspaceSyncSchedulerRetiresClosedWindowWithoutStrandingNextOwner() {
  const keys = ['test:owner:a', 'test:owner:b'], calls: string[] = []
  await withSchedulerWindows(keys, async create => {
    const a = create()
    scheduleWorkspaceSyncTask(keys[0], () => calls.push('retired-a'), 10)
    a.close()
    create()
    scheduleWorkspaceSyncTask(keys[1], () => calls.push('b'), 10)
    await new Promise(resolve => setTimeout(resolve, 40))
    if (calls.join(',') !== 'b') throw new Error(`Expected only the new Window batch to run, got ${calls}`)
  })
}

export async function testCoalescedSchedulerCancelsThroughCreatingWindow() {
  const key = 'test:owner:cancel', calls: string[] = []
  await withSchedulerWindows([key], async create => {
    create()
    scheduleCoalescedTask(key, () => calls.push('canceled-a'), 10)
    const b = create()
    b.window.setTimeout(() => calls.push('unrelated-b'), 10)
    b.window.setTimeout(() => calls.push('control-b'), 10)
    cancelCoalescedTask(key)
    await new Promise(resolve => setTimeout(resolve, 40))
    if (calls.join(',') !== 'unrelated-b,control-b') throw new Error(`Cancellation touched another Window's timer: ${calls}`)
  })
}

export async function testCoalescedSchedulerFencesRetiredAndSupersededMicrotasks() {
  const keys = ['test:owner:microtask', 'test:owner:delayed', 'test:owner:reentrant'], calls: string[] = []
  await withSchedulerWindows(keys, async create => {
    create()
    scheduleCoalescedTask(keys[0], () => calls.push('retired-a'), 0)
    create()
    scheduleCoalescedTask(keys[0], () => calls.push('old-b'), 0)
    scheduleCoalescedTask(keys[0], () => calls.push('latest-b'), 0)
    scheduleCoalescedTask(keys[1], () => calls.push('superseded-immediate'), 0)
    scheduleCoalescedTask(keys[1], () => calls.push('delayed-b'), 20)
    scheduleCoalescedTask(keys[2], () => {
      calls.push('reentrant-first')
      scheduleCoalescedTask(keys[2], () => calls.push('reentrant-next'), 0)
    }, 0)
    await Promise.resolve(); await Promise.resolve()
    if (calls.join(',') !== 'latest-b,reentrant-first,reentrant-next') throw new Error(`Stale microtask consumed newer work or erased a reentrant schedule: ${calls}`)
    await new Promise(resolve => setTimeout(resolve, 40))
    if (calls.join(',') !== 'latest-b,reentrant-first,reentrant-next,delayed-b') throw new Error(`Delayed work did not retain its own callback generation: ${calls}`)
  })
}

export async function testWorkspaceSyncSchedulerKeepsAbsoluteExistingDeadline() {
  const keys = ['test:deadline:a', 'test:deadline:b'], calls: string[] = []
  await withSchedulerWindows(keys, async create => {
    create()
    const checkpoint = new Promise(resolve => setTimeout(resolve, 65))
    scheduleWorkspaceSyncTask(keys[0], () => calls.push('a'), 60)
    await new Promise(resolve => setTimeout(resolve, 30))
    scheduleWorkspaceSyncTask(keys[1], () => calls.push('b'), 40)
    await checkpoint
    if (calls.join(',') !== 'a,b') throw new Error(`A shorter interval joining later postponed the existing absolute deadline: ${calls}`)
  })
}

export async function testWorkspaceSyncSchedulerFencesReentrantOwnerAndSignature() {
  const keys = ['test:reentrant:a', 'test:reentrant:remaining-a', 'test:reentrant:b'], calls: string[] = []
  await withSchedulerWindows(keys, async create => {
    create()
    const scopeKey = 'test:reentrant:shared-scope', signature = 'same'
    scheduleWorkspaceSyncTask(keys[0], () => {
      calls.push('a')
      create()
      scheduleWorkspaceSyncTask(keys[2], () => calls.push('b'), 0, { scopeKey, signature })
    }, 0, { scopeKey, signature })
    scheduleWorkspaceSyncTask(keys[1], () => calls.push('retired-a'), 0)
    await Promise.resolve(); await Promise.resolve()
    if (calls.join(',') !== 'a,b') throw new Error(`Old-owner continuation or signature contaminated the reentrant Window: ${calls}`)
    const duplicate = scheduleWorkspaceSyncTask(keys[2], () => calls.push('duplicate-b'), 0, { scopeKey, signature })
    if (duplicate) throw new Error('Same-owner executed signatures must still suppress duplicates')
  })
}

export async function testWorkspaceSyncSchedulerResumesAfterTemporaryWindowRetiresTimer() {
  const keys = ['test:temporary:a', 'test:temporary:next-a'], calls: string[] = []
  await withSchedulerWindows(keys, async create => {
    create()
    scheduleWorkspaceSyncTask(keys[0], () => calls.push('retired-a'), 10)
    const temporary = create()
    await new Promise(resolve => setTimeout(resolve, 40))
    temporary.close()
    scheduleWorkspaceSyncTask(keys[1], () => calls.push('next-a'), 10)
    await new Promise(resolve => setTimeout(resolve, 40))
    if (calls.join(',') !== 'next-a') throw new Error(`Returning to a Window must detect its retired lower timer without replaying stale work: ${calls}`)
  })
}

// Registry entrypoints own a real Window so timer behavior does not depend on prior tests.
const withNativeSchedulerWindow = (fn: () => Promise<void>, keys: string[]) =>
  withSchedulerWindows(keys, async create => { create(); await fn() })

export const testCoalescedSchedulerCoalescesLatestCallbackInNativeWindow = () =>
  withNativeSchedulerWindow(testCoalescedSchedulerCoalescesLatestCallback, ['test:coalescedScheduler:coalesce'])

export const testCoalescedSchedulerCancelPreventsCallbackInNativeWindow = () =>
  withNativeSchedulerWindow(testCoalescedSchedulerCancelPreventsCallback, ['test:coalescedScheduler:cancel'])

export const testWorkspaceSyncSchedulerSuppressesRepeatedSignatureInNativeWindow = () =>
  withNativeSchedulerWindow(testWorkspaceSyncSchedulerSuppressesRepeatedSignature, ['runtime:refresh'])

export const testWorkspaceSyncSchedulerRunsLatestPerTaskUnderSharedKeyInNativeWindow = () =>
  withNativeSchedulerWindow(testWorkspaceSyncSchedulerRunsLatestPerTaskUnderSharedKey, ['runtime:refresh', 'persistence:source-files'])

export const testWorkspaceSyncSchedulerDoesNotDelayExistingFlushForLaterTaskInNativeWindow = () =>
  withNativeSchedulerWindow(testWorkspaceSyncSchedulerDoesNotDelayExistingFlushForLaterTask, ['runtime:refresh', 'persistence:prefs'])

export const testWorkspaceSyncSchedulerCancelDoesNotResetSignatureDedupeInNativeWindow = () =>
  withNativeSchedulerWindow(testWorkspaceSyncSchedulerCancelDoesNotResetSignatureDedupe, ['runtime:refresh'])

export const testWorkspaceSyncSchedulerScopeKeyKeepsLatestAcrossTaskKeysWithinSameFlushInNativeWindow = () =>
  withNativeSchedulerWindow(testWorkspaceSyncSchedulerScopeKeyKeepsLatestAcrossTaskKeysWithinSameFlush, ['source-files:runtime', 'source-files:persistence'])

export const testWorkspaceSyncSchedulerScopeKeySuppressesRepeatedSignatureAcrossTaskKeysInNativeWindow = () =>
  withNativeSchedulerWindow(testWorkspaceSyncSchedulerScopeKeySuppressesRepeatedSignatureAcrossTaskKeys, ['source-files:runtime', 'source-files:persistence'])
