import { useGraphStore } from '@/hooks/useGraphStore'
import {
  buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState,
} from '@/features/source-files/sourceFilesStorageSync'
import {
  loadAgenticGraphStorageRuntimeDependencies,
} from '@/features/source-files/sourceFilesAgenticGraphStorageRuntime'
import {
  readAgenticGraphStorageRuntimeSyncAvailable,
} from '@/features/source-files/sourceFilesAgenticGraphStorageSettings'
import {
  readWorkspaceCloudSyncEnabledSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import { getAgenticGraphStoragePersistenceState } from '@/lib/storage/agenticgraphStorageDb'

export type DocumentStorageSyncNowResult = {
  status: 'synced' | 'offline-queued' | 'offline-only' | 'volatile-session' | 'unavailable'
  workspaceId: string
  queuedMutationCount: number
  pushedCount: number
  pulledDocumentCount: number
  conflictCount: number
  unresolvedConflictCount: number
  rejectedCount: number
  deferredCount: number
}

const readWorkspaceId = (): string => {
  const state = useGraphStore.getState()
  return buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState({
    folderName: state.localMarkdownFolderName,
    accessMode: state.localMarkdownFolderAccessMode,
    folderCacheId: state.localMarkdownFolderCacheId,
    selectedFolderPath: state.localMarkdownSelectedFolderPath,
  })
}

export const runDocumentStorageSyncNow = async (): Promise<DocumentStorageSyncNowResult> => {
  const workspaceId = readWorkspaceId()
  const emptyResult = {
    workspaceId,
    queuedMutationCount: 0,
    pushedCount: 0,
    pulledDocumentCount: 0,
    conflictCount: 0,
    unresolvedConflictCount: 0,
    rejectedCount: 0,
    deferredCount: 0,
  }
  const state = useGraphStore.getState()
  const dependencies = await loadAgenticGraphStorageRuntimeDependencies()
  const queued = await dependencies.syncSourceFilesToAgenticGraphStorage({
    workspaceId,
    sourceFiles: state.sourceFiles,
  })
  const persistence = await getAgenticGraphStoragePersistenceState()
  if (persistence.mode !== 'indexeddb' || persistence.status !== 'active') {
    return {
      ...emptyResult,
      status: 'volatile-session',
      queuedMutationCount: queued.queuedMutationCount,
    }
  }
  if (!readWorkspaceCloudSyncEnabledSetting()) {
    return {
      ...emptyResult,
      status: 'offline-only',
      queuedMutationCount: queued.queuedMutationCount,
    }
  }
  if (!readAgenticGraphStorageRuntimeSyncAvailable()) {
    return {
      ...emptyResult,
      status: 'unavailable',
      queuedMutationCount: queued.queuedMutationCount,
    }
  }
  const syncResult = await dependencies.syncAgenticGraphStorageNow({
    workspaceId,
    baseUrl: dependencies.baseUrl,
    onPulledChangesApplied: async ({ changes, signal, taskContext }) => {
      const result = dependencies.applyPulledAgenticGraphStorageChangesToSourceFiles({
        workspaceId,
        changes,
        signal,
        taskContext,
      })
      await result.completion
    },
  })
  dependencies.notifyAgenticGraphStorageConflictUx(syncResult)
  return {
    status: syncResult.transportStatus,
    workspaceId,
    queuedMutationCount: queued.queuedMutationCount,
    pushedCount: syncResult.pushedCount,
    pulledDocumentCount: syncResult.pulledDocumentCount,
    conflictCount: syncResult.conflictCount,
    unresolvedConflictCount: syncResult.unresolvedConflictCount,
    rejectedCount: syncResult.rejectedCount,
    deferredCount: syncResult.deferredCount,
  }
}
