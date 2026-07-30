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
