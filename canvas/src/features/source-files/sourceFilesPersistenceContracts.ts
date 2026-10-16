import type { useGraphStore } from '@/hooks/useGraphStore'
import type { readReusableWorkspaceEntriesSnapshot } from '@/features/source-files/sourceFilesRuntimeShared'
import type { materializeBootstrapWorkspaceSourceFiles } from '@/features/source-files/sourceFilesBootstrapStartup'
import type { SourceFilesWorkspaceState } from '@/features/source-files/sourceFilesWorkspaceState'
import type { AgenticGraphStorageWorkspaceOwnership } from '@/features/source-files/source-files-agentic-graph-storage-lifecycle'
import type { ActivePathMaterializationRequest } from '@/features/source-files/sourceFilesActivePathAuthority'

export const SOURCE_FILES_PERSIST_DELAY_MS = 600
export type WorkspaceFsMutationRequest = {
  op: string
  changedPath: string
  sourceFilesSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  activePathRequest: ActivePathMaterializationRequest | null
}

export type WorkspaceRematerializeRequest = {
  sourceFilesSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
}

export type BootstrapMountRequest = {
  persistedWorkspace: SourceFilesWorkspaceState
  bootstrapMaterialization: Awaited<ReturnType<typeof materializeBootstrapWorkspaceSourceFiles>> | null
  bootstrapSideEffectsRequest: BootstrapMountSideEffectsRequest
  initialActivePathRequest: ActivePathMaterializationRequest | null
}

export type WorkspaceSeedSyncRequest = {
  source: string
}

export type PreparedWorkspaceSeedSyncRequest = WorkspaceSeedSyncRequest & {
  sourceFilesSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
}

export type WorkspaceSeedSyncLifecycleState = {
  cancelled: boolean
  timer: number | null
  idleStreak: number
}

export type AgenticGraphStorageQueueRequest = {
  workspaceId: string
  sourceFilesSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  signature: string
}

export type AgenticGraphStorageOwnedQueueRequest = { ownership: AgenticGraphStorageWorkspaceOwnership; request: AgenticGraphStorageQueueRequest }
export type AgenticGraphStorageWorkspaceRequest = {
  workspaceId: string
  workspaceState: SourceFilesWorkspaceState
  sourceFilesSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  initialQueueRequest: AgenticGraphStorageQueueRequest | null
}

export type AgenticGraphStorageWorkspaceSelection = {
  workspaceState: SourceFilesWorkspaceState
  sourceFilesSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
}

export type SourceFilesPersistenceEffectRequest = {
  sourceFilesSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  agenticGraphStorageQueueRequest: AgenticGraphStorageQueueRequest | null
  composeRequest: SourceFilesComposeRequest
}

export type AgenticGraphStorageQueueSyncFollowUpRequest = {
  workspaceId: string
  delayMs: number
  signature: string
}

export type SourceFilesComposeRequest = {
  shouldScheduleCompose: boolean
  compositionSignature: string
}
export type BootstrapMountSideEffectsRequest = {
  sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  composeRequest: SourceFilesComposeRequest | null
  rematerializeRequest: WorkspaceRematerializeRequest | null
}

export type ActivePathMaterializationSelection = {
  activePathSnapshot: string | null
  sourceFilesSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  workspaceEntriesSnapshot: ReturnType<typeof readReusableWorkspaceEntriesSnapshot>
}


export type SourceFilesSnapshot = ReturnType<typeof useGraphStore.getState>['sourceFiles']
export type SourceFilesSnapshotReader = (files?: SourceFilesSnapshot) => SourceFilesSnapshot
export type SourceFilesCloudQueueRunner = (
  request: AgenticGraphStorageQueueRequest,
  handleAgenticGraphStorageQueueRequestSuccess: (args: { request: AgenticGraphStorageQueueRequest; queuedMutationCount: number }) => void,
  handleAgenticGraphStorageQueueRequestFailure: (request: AgenticGraphStorageQueueRequest) => void,
) => void
