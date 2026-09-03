import { readAgenticGraphStorageBaseUrl } from '@/features/source-files/source-files-agentic-graph-storage-settings'
import { runWorkspaceSeedSyncTask } from '@/lib/workspace/workspaceSeedSyncRuntime'

type SourceFilesStorageSyncModule = typeof import('@/features/source-files/sourceFilesStorageSync')
type SourceFilesInboundStorageApplyModule = typeof import('@/features/source-files/sourceFilesInboundStorageApply')
type AgenticGraphStorageClientSyncModule = typeof import('@/lib/storage/agentic-graph-storage-client-sync')
type AgenticGraphStorageConflictUxModule = typeof import('@/lib/storage/agentic-graph-storage-conflict-ux')

export type AgenticGraphStorageRuntimeDependencies = {
  baseUrl: string | null
  syncSourceFilesToAgenticGraphStorage: SourceFilesStorageSyncModule['syncSourceFilesToAgenticGraphStorage']
  applyPulledAgenticGraphStorageChangesToSourceFiles: SourceFilesInboundStorageApplyModule['applyPulledAgenticGraphStorageChangesToSourceFiles']
  cancelAgenticGraphStorageSync: AgenticGraphStorageClientSyncModule['cancelAgenticGraphStorageSync']
  scheduleAgenticGraphStorageSync: AgenticGraphStorageClientSyncModule['scheduleAgenticGraphStorageSync']
  startAgenticGraphStorageSyncLoop: AgenticGraphStorageClientSyncModule['startAgenticGraphStorageSyncLoop']
  syncAgenticGraphStorageNow: AgenticGraphStorageClientSyncModule['syncAgenticGraphStorageNow']
  notifyAgenticGraphStorageConflictUx: AgenticGraphStorageConflictUxModule['notifyAgenticGraphStorageConflictUx']
}

let cachedAgenticGraphStorageRuntimeDependenciesPromise: Promise<AgenticGraphStorageRuntimeDependencies> | null = null

function waitForAgenticGraphStorageRuntimeDependencies(
  promise: Promise<AgenticGraphStorageRuntimeDependencies>,
  signal?: AbortSignal,
): Promise<AgenticGraphStorageRuntimeDependencies> {
  if (!signal) return promise
  const cancellationError = () => signal.reason instanceof Error
    ? signal.reason
    : new Error('agentic-graph storage runtime loading was cancelled')
  if (signal.aborted) return Promise.reject(cancellationError())
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      signal.removeEventListener('abort', handleAbort)
      reject(cancellationError())
    }
    signal.addEventListener('abort', handleAbort, { once: true })
    promise.then(
      value => {
        signal.removeEventListener('abort', handleAbort)
        resolve(value)
      },
      error => {
        signal.removeEventListener('abort', handleAbort)
        reject(error)
      },
    )
  })
}

const resolveAgenticGraphStorageRuntimeBaseUrl = (): string | null => {
  const raw = readAgenticGraphStorageBaseUrl()
  return raw || null
}

export const loadAgenticGraphStorageRuntimeDependencies = async (
  signal?: AbortSignal,
): Promise<AgenticGraphStorageRuntimeDependencies> => {
  if (!cachedAgenticGraphStorageRuntimeDependenciesPromise) {
    const requestedPromise = runWorkspaceSeedSyncTask(signal, async () => {
      const [
        storageSyncModule,
        inboundApplyModule,
        clientSyncModule,
        conflictUxModule,
      ] = await Promise.all([
        import('@/features/source-files/sourceFilesStorageSync'),
        import('@/features/source-files/sourceFilesInboundStorageApply'),
        import('@/lib/storage/agentic-graph-storage-client-sync'),
        import('@/lib/storage/agentic-graph-storage-conflict-ux'),
      ])
      return {
        baseUrl: resolveAgenticGraphStorageRuntimeBaseUrl(),
        syncSourceFilesToAgenticGraphStorage: storageSyncModule.syncSourceFilesToAgenticGraphStorage,
        applyPulledAgenticGraphStorageChangesToSourceFiles: inboundApplyModule.applyPulledAgenticGraphStorageChangesToSourceFiles,
        cancelAgenticGraphStorageSync: clientSyncModule.cancelAgenticGraphStorageSync,
        scheduleAgenticGraphStorageSync: clientSyncModule.scheduleAgenticGraphStorageSync,
        startAgenticGraphStorageSyncLoop: clientSyncModule.startAgenticGraphStorageSyncLoop,
        syncAgenticGraphStorageNow: clientSyncModule.syncAgenticGraphStorageNow,
        notifyAgenticGraphStorageConflictUx: conflictUxModule.notifyAgenticGraphStorageConflictUx,
      }
    })
    cachedAgenticGraphStorageRuntimeDependenciesPromise = requestedPromise
    void requestedPromise.catch(() => {
      if (cachedAgenticGraphStorageRuntimeDependenciesPromise === requestedPromise) {
        cachedAgenticGraphStorageRuntimeDependenciesPromise = null
      }
    })
  }
  return waitForAgenticGraphStorageRuntimeDependencies(
    cachedAgenticGraphStorageRuntimeDependenciesPromise,
    signal,
  )
}
