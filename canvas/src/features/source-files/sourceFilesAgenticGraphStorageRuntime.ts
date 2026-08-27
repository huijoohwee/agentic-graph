import { readKnowgrphStorageBaseUrl } from '@/features/source-files/sourceFilesKnowgrphStorageSettings'
import { runWorkspaceSeedSyncTask } from '@/lib/workspace/workspaceSeedSyncRuntime'

type SourceFilesStorageSyncModule = typeof import('@/features/source-files/sourceFilesStorageSync')
type SourceFilesInboundStorageApplyModule = typeof import('@/features/source-files/sourceFilesInboundStorageApply')
type KnowgrphStorageClientSyncModule = typeof import('@/lib/storage/knowgrphStorageClientSync')
type KnowgrphStorageConflictUxModule = typeof import('@/lib/storage/knowgrphStorageConflictUx')

export type KnowgrphStorageRuntimeDependencies = {
  baseUrl: string | null
  syncSourceFilesToKnowgrphStorage: SourceFilesStorageSyncModule['syncSourceFilesToKnowgrphStorage']
  applyPulledKnowgrphStorageChangesToSourceFiles: SourceFilesInboundStorageApplyModule['applyPulledKnowgrphStorageChangesToSourceFiles']
  cancelKnowgrphStorageSync: KnowgrphStorageClientSyncModule['cancelKnowgrphStorageSync']
  scheduleKnowgrphStorageSync: KnowgrphStorageClientSyncModule['scheduleKnowgrphStorageSync']
  startKnowgrphStorageSyncLoop: KnowgrphStorageClientSyncModule['startKnowgrphStorageSyncLoop']
  syncKnowgrphStorageNow: KnowgrphStorageClientSyncModule['syncKnowgrphStorageNow']
  notifyKnowgrphStorageConflictUx: KnowgrphStorageConflictUxModule['notifyKnowgrphStorageConflictUx']
}

let cachedKnowgrphStorageRuntimeDependenciesPromise: Promise<KnowgrphStorageRuntimeDependencies> | null = null

function waitForKnowgrphStorageRuntimeDependencies(
  promise: Promise<KnowgrphStorageRuntimeDependencies>,
  signal?: AbortSignal,
): Promise<KnowgrphStorageRuntimeDependencies> {
  if (!signal) return promise
  const cancellationError = () => signal.reason instanceof Error
    ? signal.reason
    : new Error('Knowgrph storage runtime loading was cancelled')
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

const resolveKnowgrphStorageRuntimeBaseUrl = (): string | null => {
  const raw = readKnowgrphStorageBaseUrl()
  return raw || null
}

export const loadKnowgrphStorageRuntimeDependencies = async (
  signal?: AbortSignal,
): Promise<KnowgrphStorageRuntimeDependencies> => {
  if (!cachedKnowgrphStorageRuntimeDependenciesPromise) {
    const requestedPromise = runWorkspaceSeedSyncTask(signal, async () => {
      const [
        storageSyncModule,
        inboundApplyModule,
        clientSyncModule,
        conflictUxModule,
      ] = await Promise.all([
        import('@/features/source-files/sourceFilesStorageSync'),
        import('@/features/source-files/sourceFilesInboundStorageApply'),
        import('@/lib/storage/knowgrphStorageClientSync'),
        import('@/lib/storage/knowgrphStorageConflictUx'),
      ])
      return {
        baseUrl: resolveKnowgrphStorageRuntimeBaseUrl(),
        syncSourceFilesToKnowgrphStorage: storageSyncModule.syncSourceFilesToKnowgrphStorage,
        applyPulledKnowgrphStorageChangesToSourceFiles: inboundApplyModule.applyPulledKnowgrphStorageChangesToSourceFiles,
        cancelKnowgrphStorageSync: clientSyncModule.cancelKnowgrphStorageSync,
        scheduleKnowgrphStorageSync: clientSyncModule.scheduleKnowgrphStorageSync,
        startKnowgrphStorageSyncLoop: clientSyncModule.startKnowgrphStorageSyncLoop,
        syncKnowgrphStorageNow: clientSyncModule.syncKnowgrphStorageNow,
        notifyKnowgrphStorageConflictUx: conflictUxModule.notifyKnowgrphStorageConflictUx,
      }
    })
    cachedKnowgrphStorageRuntimeDependenciesPromise = requestedPromise
    void requestedPromise.catch(() => {
      if (cachedKnowgrphStorageRuntimeDependenciesPromise === requestedPromise) {
        cachedKnowgrphStorageRuntimeDependenciesPromise = null
      }
    })
  }
  return waitForKnowgrphStorageRuntimeDependencies(
    cachedKnowgrphStorageRuntimeDependenciesPromise,
    signal,
  )
}
