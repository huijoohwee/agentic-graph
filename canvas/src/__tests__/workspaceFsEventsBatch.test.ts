import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  notifyWorkspaceFsChanged,
  runWorkspaceFsChangedBatch,
  suppressNextWorkspaceFsChangedEvent,
  subscribeWorkspaceFsChanged,
  type WorkspaceFsChangedDetail,
} from '@/features/workspace-fs/workspaceFsEvents'

export async function testWorkspaceFsChangedBatchCoalescesNotifications() {
  const { restore } = initJsdomHarness()
  let unsubscribe = () => {}
  try {
    notifyWorkspaceFsChanged({ op: 'ensureSeed' })
    const received: WorkspaceFsChangedDetail[] = []
    unsubscribe = subscribeWorkspaceFsChanged(detail => {
      received.push(detail)
    })
    if (received.length !== 1 || !received.some(detail => detail.op === 'ensureSeed')) {
      throw new Error(`expected exactly one retained ensureSeed replay, got ${JSON.stringify(received)}`)
    }
    received.length = 0

    notifyWorkspaceFsChanged({ op: 'createFile', path: '/a.md' })
    if (received.length !== 1) throw new Error(`expected 1 event, got ${received.length}`)
    received.length = 0

    await runWorkspaceFsChangedBatch(async () => {
      notifyWorkspaceFsChanged({ op: 'createFile', path: '/b.md' })
      notifyWorkspaceFsChanged({ op: 'writeFileText', path: '/b.md' })
      await runWorkspaceFsChangedBatch(async () => {
        notifyWorkspaceFsChanged({ op: 'createFolder', path: '/x' })
      })
    })

    if (received.length !== 1) throw new Error(`expected 1 batched event, got ${received.length}`)
    if (received[0]?.op !== 'batch') throw new Error(`expected op=batch, got ${String(received[0]?.op || '')}`)

  } finally {
    try { unsubscribe() } finally { restore() }
  }
}

export async function testWorkspaceFsChangedBatchCanSuppressManualRefreshFollowUpEvent() {
  const { restore } = initJsdomHarness()
  let unsubscribe = () => {}
  try {
    notifyWorkspaceFsChanged({ op: 'ensureSeed' })
    const received: WorkspaceFsChangedDetail[] = []
    unsubscribe = subscribeWorkspaceFsChanged(detail => {
      received.push(detail)
    })
    if (received.length !== 1 || !received.some(detail => detail.op === 'ensureSeed')) {
      throw new Error(`expected exactly one retained ensureSeed replay, got ${JSON.stringify(received)}`)
    }
    received.length = 0

    const result = await runWorkspaceFsChangedBatch(async () => {
      suppressNextWorkspaceFsChangedEvent()
      notifyWorkspaceFsChanged({ op: 'createFile', path: '/manual-refresh.md' })
      notifyWorkspaceFsChanged({ op: 'writeFileText', path: '/manual-refresh.md' })
      return 'kept-result'
    })

    if (result !== 'kept-result') {
      throw new Error(`expected suppressed batch to preserve callback result, got ${String(result)}`)
    }
    if (received.length !== 0) {
      throw new Error(`expected suppressed manual-refresh batch to emit 0 events, got ${received.length}`)
    }

  } finally {
    try { unsubscribe() } finally { restore() }
  }
}
