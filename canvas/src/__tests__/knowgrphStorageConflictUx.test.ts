import { useGraphStore } from '@/hooks/useGraphStore'
import {
  __resetKnowgrphStorageConflictUxForTests,
  notifyKnowgrphStorageConflictUx,
} from '@/lib/storage/knowgrphStorageConflictUx'

export function testKnowgrphStorageConflictUxUsesSharedToastAndLogWithoutDuplicates() {
  useGraphStore.getState().resetAll()
  __resetKnowgrphStorageConflictUxForTests()

  notifyKnowgrphStorageConflictUx({
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

  notifyKnowgrphStorageConflictUx({
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

export function testKnowgrphStorageConflictUxDismissesToastWhenConflictsResolve() {
  useGraphStore.getState().resetAll()
  __resetKnowgrphStorageConflictUxForTests()

  notifyKnowgrphStorageConflictUx({
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

  notifyKnowgrphStorageConflictUx({
    transportStatus: 'synced',
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

  const state = useGraphStore.getState()
  const stillVisible = (state.uiToasts || []).find(toast => toast.id === 'knowgrph-storage-conflict:kgws:conflict-resolve') || null
  if (stillVisible) throw new Error('expected resolved conflicts to dismiss the shared conflict toast')
}
