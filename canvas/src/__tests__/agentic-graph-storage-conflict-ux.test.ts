import { useGraphStore } from '@/hooks/useGraphStore'
import {
  __resetAgenticGraphStorageConflictUxForTests,
  notifyAgenticGraphStorageConflictUx,
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
