import { useGraphStore } from '@/hooks/useGraphStore'
import {
  __resetAgenticGraphStorageConflictUxForTests,
  notifyAgenticGraphStorageConflictUx,
  notifyAgenticGraphStorageEngineIssue,
} from '@/lib/storage/agentic-graph-storage-conflict-ux'

export function testAgenticGraphStorageConflictUxUsesSharedToastAndLogWithoutDuplicates() {
  useGraphStore.getState().resetAll()
  __resetAgenticGraphStorageConflictUxForTests()

  notifyAgenticGraphStorageConflictUx({
    transportStatus: 'synced',
    workspaceId: 'kgws:conflict-ux',
    deviceId: 'dev_a',
    pushedCount: 1,
    pulledDocumentCount: 0,
    pulledChunkCount: 0,
    pulledGraphSnapshotCount: 0,
    appliedCount: 0,
    conflictCount: 1,
    rejectedCount: 0,
    deferredCount: 0,
    unresolvedConflictCount: 1,
    conflictEntries: [
      {
        mutationId: 'mut_conflict_1',
        entity: 'document',
        recordId: 'sf:demo',
        message: 'document revision conflict: expected 1, found 2',
      },
    ],
    lastPushCursor: null,
    lastPullCursor: null,
  })

  let state = useGraphStore.getState()
  if ((state.uiToasts || []).length !== 1) throw new Error('expected one shared toast for storage conflicts')
  const toastActions = state.uiToasts[0]?.actions || []
  if (toastActions.length !== 3) throw new Error('expected single-conflict toast to attach shared resolution actions')
  if ((state.uiLogEntries || []).filter(entry => entry.source === 'storage:conflict').length !== 1) {
    throw new Error('expected one shared ui log entry for the new conflict')
  }
  const conflictLog = (state.uiLogEntries || []).find(entry => entry.source === 'storage:conflict') || null
  if (!conflictLog || (conflictLog.actions || []).length !== 3) {
    throw new Error('expected conflict ui log entry to attach shared resolution actions')
  }

  notifyAgenticGraphStorageConflictUx({
    transportStatus: 'synced',
    workspaceId: 'kgws:conflict-ux',
    deviceId: 'dev_a',
    pushedCount: 1,
    pulledDocumentCount: 0,
    pulledChunkCount: 0,
    pulledGraphSnapshotCount: 0,
    appliedCount: 0,
    conflictCount: 1,
    rejectedCount: 0,
    deferredCount: 0,
    unresolvedConflictCount: 1,
    conflictEntries: [
      {
        mutationId: 'mut_conflict_1',
        entity: 'document',
        recordId: 'sf:demo',
        message: 'document revision conflict: expected 1, found 2',
      },
    ],
    lastPushCursor: null,
    lastPullCursor: null,
  })

  state = useGraphStore.getState()
  if ((state.uiToasts || []).length !== 1) throw new Error('expected conflict toast upsert to stay deduped by id')
  if ((state.uiLogEntries || []).filter(entry => entry.source === 'storage:conflict').length !== 1) {
    throw new Error('expected duplicate conflict retries to avoid duplicate ui log rows')
  }
}

export function testAgenticGraphStorageConflictUxDismissesToastWhenConflictsResolve() {
  useGraphStore.getState().resetAll()
  __resetAgenticGraphStorageConflictUxForTests()

  notifyAgenticGraphStorageConflictUx({
    transportStatus: 'synced',
    workspaceId: 'kgws:conflict-resolve',
    deviceId: 'dev_a',
    pushedCount: 1,
    pulledDocumentCount: 0,
    pulledChunkCount: 0,
    pulledGraphSnapshotCount: 0,
    appliedCount: 0,
    conflictCount: 1,
    rejectedCount: 0,
    deferredCount: 0,
    unresolvedConflictCount: 1,
    conflictEntries: [
      {
        mutationId: 'mut_conflict_2',
        entity: 'graphSnapshot',
        recordId: 'sf-graph:demo',
        message: 'graph snapshot revision conflict',
      },
    ],
    lastPushCursor: null,
    lastPullCursor: null,
  })

  notifyAgenticGraphStorageConflictUx({
    transportStatus: 'synced',
    durableLocalQueue: true,
    workspaceId: 'kgws:conflict-resolve',
    deviceId: 'dev_a',
    pushedCount: 0,
    pulledDocumentCount: 0,
    pulledChunkCount: 0,
    pulledGraphSnapshotCount: 0,
    appliedCount: 0,
    conflictCount: 0,
    rejectedCount: 1,
    deferredCount: 0,
    unresolvedConflictCount: 0,
    conflictEntries: [],
    lastPushCursor: null,
    lastPullCursor: null,
  })

  let state = useGraphStore.getState()
  const retainedToast = (state.uiToasts || []).find(toast => toast.id === 'agentic-graph-storage-conflict:kgws:conflict-resolve') || null
  if (!retainedToast?.message.includes('1 rejected') || !retainedToast.message.includes('IndexedDB outbox')) {
    throw new Error('expected resolved conflicts to keep retained rejected changes visible and truthfully durable')
  }
  if ((retainedToast.actions || []).length !== 1) {
    throw new Error('expected retained rejected changes to expose the shared Review Log action')
  }

  notifyAgenticGraphStorageConflictUx({
    transportStatus: 'synced',
    durableLocalQueue: true,
    workspaceId: 'kgws:conflict-resolve',
    deviceId: 'dev_a',
    pushedCount: 0,
    pulledDocumentCount: 0,
    pulledChunkCount: 0,
    pulledGraphSnapshotCount: 0,
    appliedCount: 0,
    conflictCount: 0,
    rejectedCount: 0,
    deferredCount: 0,
    unresolvedConflictCount: 0,
    conflictEntries: [],
    lastPushCursor: null,
    lastPullCursor: null,
  })

  state = useGraphStore.getState()
  const stillVisible = (state.uiToasts || []).find(toast => toast.id === 'agentic-graph-storage-conflict:kgws:conflict-resolve') || null
  if (stillVisible) throw new Error('expected clearing every retained issue to dismiss the shared conflict toast')
}


type SyncResult = Parameters<typeof notifyAgenticGraphStorageConflictUx>[0]
const syncResult = (overrides: Partial<SyncResult> = {}): SyncResult => ({
  workspaceId: 'memo-workspace', deviceId: 'device', transportStatus: 'synced', durableLocalQueue: true,
  pushedCount: 0, pulledDocumentCount: 0, pulledChunkCount: 0, pulledGraphSnapshotCount: 0,
  appliedCount: 0, conflictCount: 0, rejectedCount: 0, deferredCount: 0, unresolvedConflictCount: 0,
  conflictEntries: [], lastPushCursor: null, lastPullCursor: null, ...overrides,
})
const conflict = (mutationId: string): SyncResult['conflictEntries'][number] => ({
  mutationId, entity: 'document', recordId: 'document', message: 'revision changed', localRevision: 1, serverRevision: 2,
})
const withCapturedNotifications = (run: (logs: string[], toasts: string[]) => void) => {
  const { pushUiLog, upsertUiToast, dismissUiToast } = useGraphStore.getState()
  const logs: string[] = [], toasts: string[] = []
  __resetAgenticGraphStorageConflictUxForTests()
  useGraphStore.setState({
    pushUiLog: entry => { logs.push(`${entry.source}:${entry.message}`) },
    upsertUiToast: toast => { toasts.push(toast.message) }, dismissUiToast: () => {},
  })
  try { run(logs, toasts) }
  finally {
    useGraphStore.setState({ pushUiLog, upsertUiToast, dismissUiToast })
    __resetAgenticGraphStorageConflictUxForTests()
  }
}
const expectCount = (logs: string[], count: number, reason: string) => {
  if (logs.length !== count) throw new Error(`${reason}: expected ${count} notifications, got ${logs.length}`)
}

export function testStorageNotificationsBoundRetainedIdentitiesWithoutScanThrashing() {
  withCapturedNotifications((logs, toasts) => {
    const result = syncResult({ unresolvedConflictCount: 129,
      conflictEntries: Array.from({ length: 129 }, (_, index) => conflict(`mutation-${index}`)) })
    const before = JSON.stringify(result)
    notifyAgenticGraphStorageConflictUx(result)
    expectCount(logs, 129, 'first observation must expose every conflict')
    notifyAgenticGraphStorageConflictUx(result)
    expectCount(logs, 130, 'a 129-entry rescan must repeat only the one evicted identity')
    if (toasts.length !== 2 || JSON.stringify(result) !== before) throw new Error('memoization must preserve UI and input records')
    notifyAgenticGraphStorageConflictUx(syncResult({ unresolvedConflictCount: 1, conflictEntries: [conflict('mutation-0')] }))
    expectCount(logs, 130, 'most recently admitted identity should deduplicate')
    const engine = (index: number) => notifyAgenticGraphStorageEngineIssue({
      workspaceId: 'engine-workspace', operationId: `operation-${index}`, engine: 'git', message: 'retry required',
    })
    for (let index = 0; index < 129; index += 1) engine(index)
    expectCount(logs, 259, 'engine identities remain visible')
    engine(128)
    expectCount(logs, 259, 'recent engine retry deduplicates')
    engine(0)
    expectCount(logs, 260, 'old engine identity must be evicted')
  })
}

export function testStorageNotificationsSurfaceSemanticChangesAndIdentityBoundaries() {
  withCapturedNotifications((logs) => {
    const base = conflict('semantic')
    const send = (entry = base) => notifyAgenticGraphStorageConflictUx(syncResult({ unresolvedConflictCount: 1, conflictEntries: [entry] }))
    send(); send({ ...base, message: 'different explanation' }); send()
    expectCount(logs, 3, 'message A to B to A must be visible')
    const parent = { ...base, parentRecovery: { documentId: 'parent', parentRevision: 3, retainedChildCount: 1 } }
    send(parent); send({ ...parent, parentRecovery: { ...parent.parentRecovery, retainedChildCount: 2 } }); send(parent)
    send({ ...parent, parentRecovery: { ...parent.parentRecovery, parentRevision: 4 } })
    send({ ...parent, localRevision: 4, serverRevision: 5 })
    expectCount(logs, 8, 'retained count and review revisions must be visible')
    const engine = { workspaceId: 'a\u0000b', operationId: 'c', engine: 'git' as const, message: 'retry' }
    notifyAgenticGraphStorageEngineIssue(engine)
    notifyAgenticGraphStorageEngineIssue({ ...engine, workspaceId: 'a', operationId: 'b\u0000c' })
    notifyAgenticGraphStorageEngineIssue({ ...engine, engine: 'file-sync' })
    notifyAgenticGraphStorageEngineIssue({ ...engine, message: 'new reason' })
    notifyAgenticGraphStorageEngineIssue(engine)
    expectCount(logs, 13, 'framed identity, engine and changed explanation must be distinct')
    const resolved = syncResult({ workspaceId: 'a' })
    notifyAgenticGraphStorageConflictUx({ ...resolved, transportError: 'unavailable' })
    notifyAgenticGraphStorageConflictUx({ ...resolved, workspaceId: 'a-neighbor', transportError: 'unavailable' })
    notifyAgenticGraphStorageConflictUx(resolved)
    notifyAgenticGraphStorageEngineIssue({ ...engine, workspaceId: 'a', operationId: 'b\u0000c' })
    notifyAgenticGraphStorageConflictUx({ ...resolved, workspaceId: 'a-neighbor', transportError: 'unavailable' })
    expectCount(logs, 15, 'resolved sync must preserve engine and neighboring workspace memoization')
    notifyAgenticGraphStorageConflictUx({ ...resolved, transportError: 'unavailable' })
    expectCount(logs, 16, 'resolved workspace sync memoization must clear')
  })
}

export function testStorageNotificationsBypassOversizedEventsAndTrackDurability() {
  withCapturedNotifications((logs, toasts) => {
    const notify = (overrides: Partial<SyncResult>) => notifyAgenticGraphStorageConflictUx(syncResult(overrides))
    for (let index = 0; index < 2; index += 1) notify({ workspaceId: 'w'.repeat(600), transportError: 'offline' })
    for (let index = 0; index < 2; index += 1) notify({ transportError: 'e'.repeat(1100) })
    expectCount(logs, 4, 'oversized identity or signature must bypass memoization')
    notify({ transportError: 'offline', durableLocalQueue: true })
    notify({ transportError: 'offline', durableLocalQueue: false })
    notify({ transportError: 'offline', durableLocalQueue: true })
    notify({ rejectedCount: 1, durableLocalQueue: true })
    notify({ rejectedCount: 1, durableLocalQueue: false })
    notify({ rejectedCount: 1, durableLocalQueue: true })
    expectCount(logs, 10, 'durability A to B to A must remain visible for transport and retained issues')
    notify({ transportError: 'e'.repeat(1100) })
    notify({ transportError: 'offline', durableLocalQueue: true })
    expectCount(logs, 12, 'oversized changed message must invalidate the earlier cached message')
    if (toasts.length !== 12 || !toasts.some(message => message.includes('only for this browser session'))) {
      throw new Error('bounded memoization must retain truthful durable and volatile UI notices')
    }
  })
}

export function testStorageNotificationsTrackChildStateAndInScanChanges() {
  withCapturedNotifications((logs) => {
    const entry = conflict('in-scan')
    const notify = (entries: SyncResult['conflictEntries']) => notifyAgenticGraphStorageConflictUx(syncResult({
      unresolvedConflictCount: entries.length, conflictEntries: entries,
    }))
    notify([entry])
    notify([entry, { ...entry, message: 'changed within scan' }, entry])
    expectCount(logs, 3, 'matching snapshot must not hide A to B to A within one scan')
    const child = { ...conflict('child'), entity: 'documentChunk', childState: {
      workspaceId: 'memo-workspace', entity: 'documentChunk' as const, recordId: 'child', documentId: 'parent',
      chunkKey: 'chunk', syncRevision: 1, updatedAtMs: 1, deleted: false,
    } }
    notify([child]); notify([child])
    notify([{ ...child, childState: { ...child.childState, syncRevision: 2 } }])
    notify([{ ...child, childState: { ...child.childState, deleted: true } }])
    expectCount(logs, 6, 'new child revision or deletion must surface without duplicate unchanged logs')
  })
}
