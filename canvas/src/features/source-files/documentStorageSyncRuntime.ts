import { useGraphStore } from '@/hooks/useGraphStore'
import {
  buildKnowgrphWorkspaceIdFromSourceFilesWorkspaceState,
} from '@/features/source-files/sourceFilesStorageSync'
import {
  loadKnowgrphStorageRuntimeDependencies,
} from '@/features/source-files/sourceFilesKnowgrphStorageRuntime'
import {
  readKnowgrphStorageRuntimeSyncAvailable,
} from '@/features/source-files/sourceFilesKnowgrphStorageSettings'
import {
  readWorkspaceCloudSyncEnabledSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'

export type DocumentStorageSyncNowResult = {
  status: 'synced' | 'offline-queued' | 'offline-only' | 'unavailable'
  workspaceId: string
  queuedMutationCount: number
  pushedCount: number
  pulledDocumentCount: number
  conflictCount: number
}

const readWorkspaceId = (): string => {
  const state = useGraphStore.getState()
  return buildKnowgrphWorkspaceIdFromSourceFilesWorkspaceState({
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
  }
  const state = useGraphStore.getState()
  const dependencies = await loadKnowgrphStorageRuntimeDependencies()
  const queued = await dependencies.syncSourceFilesToKnowgrphStorage({
    workspaceId,
    sourceFiles: state.sourceFiles,
  })
  if (!readWorkspaceCloudSyncEnabledSetting()) {
    return {
      ...emptyResult,
      status: 'offline-only',
      queuedMutationCount: queued.queuedMutationCount,
    }
  }
  if (!readKnowgrphStorageRuntimeSyncAvailable()) {
    return {
      ...emptyResult,
      status: 'unavailable',
      queuedMutationCount: queued.queuedMutationCount,
    }
  }
  const syncResult = await dependencies.syncKnowgrphStorageNow({
    workspaceId,
    baseUrl: dependencies.baseUrl,
    onPulledChangesApplied: async ({ changes, signal, taskContext }) => {
      const result = dependencies.applyPulledKnowgrphStorageChangesToSourceFiles({
        workspaceId,
        changes,
        signal,
        taskContext,
      })
      await result.completion
    },
  })
  return {
    status: syncResult.transportStatus,
    workspaceId,
    queuedMutationCount: queued.queuedMutationCount,
    pushedCount: syncResult.pushedCount,
    pulledDocumentCount: syncResult.pulledDocumentCount,
    conflictCount: syncResult.conflictCount,
  }
}
