import React from 'react'
import { beginSourceFilesDocumentIntent, completeSourceFilesBootstrap, failSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { __canvasStartupDebug } from '@/features/canvas/canvasStartupDebug'
import { buildDocDeepLinkIntentKey } from '@/features/canvas/canvasDocDeepLink'
import { loadPersistedSourceFiles, loadPersistedSourceFilesWorkspace, persistSourceFiles, persistSourceFilesWorkspace } from '@/features/source-files/sourceFilesDb'
import { scheduleApplyComposedGraphFromSourceFiles } from '@/features/source-files/applyComposedGraphFromSourceFiles'
import { scheduleWorkspaceSyncTask, cancelWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import { WORKSPACE_SYNC_SCOPE_SOURCE_FILES_RUNTIME_PERSISTENCE, WORKSPACE_SYNC_SCOPE_AGENTIC_OS_STORAGE_RUNTIME_PERSISTENCE, WORKSPACE_SYNC_TASK_SOURCE_FILES_PERSIST, WORKSPACE_SYNC_TASK_SOURCE_FILES_WORKSPACE } from '@/lib/async/workspaceSyncKeys'
import { readReusableWorkspaceEntriesSnapshot } from '@/features/source-files/sourceFilesRuntimeShared'
import {
  materializeBootstrapWorkspaceSourceFiles, restoreBootstrapPersistedSourceFiles, restoreBootstrapWorkspaceState,
  runBootstrapSourceFileHydration, applyBootstrapComposedGraphSync,
} from '@/features/source-files/sourceFilesBootstrapStartup'
import {
  areSourceFilesEqualByIdAndHash, areRuntimeSourceFilesEqualByIdAndHash, buildSourceFilesCompositionSignature,
  buildSourceFilesPersistenceSignature, type SourceFilesCompositionSignatureOptions,
} from '@/features/source-files/sourceFilesSignatures'
import { areSourceFilesWorkspaceStatesEqual, buildSourceFilesWorkspaceStateSignature, normalizeSourceFilesWorkspaceState, type SourceFilesWorkspaceState } from '@/features/source-files/sourceFilesWorkspaceState'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { resolveWorkspaceSourceIndexSnapshot } from '@/features/workspace-fs/sourceIndex'
import {
  readWorkspaceSeedSyncEnabledSetting, readWorkspaceCloudSyncEnabledSetting, readWorkspaceSeedSyncIdleMaxMsSetting,
  readWorkspaceSeedSyncPollMsSetting, readWorkspaceSourceFilesDocsOnlySetting, readWorkspaceSourceFilesSyncDebounceMsSetting,
  subscribeWorkspaceStoreSyncSettingsChanged,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import { runWorkspaceSeedSyncTask } from '@/lib/workspace/workspaceSeedSyncRuntime'
import { type AgenticGraphStorageRuntimeDependencies } from '@/features/source-files/source-files-agentic-graph-storage-runtime'
import { createAgenticGraphStorageLatestOperationRunner, createAgenticGraphStorageOperationTracker, createAgenticGraphStorageWorkspaceLifecycle, type AgenticGraphStorageWorkspaceOwnership } from '@/features/source-files/source-files-agentic-graph-storage-lifecycle'
import { createActivePathSourceAuthorityCoordinator, type ActivePathMaterializationRequest } from '@/features/source-files/sourceFilesActivePathAuthority'
import {
  SOURCE_FILES_PERSIST_DELAY_MS, WorkspaceRematerializeRequest, BootstrapMountRequest,
  AgenticGraphStorageOwnedQueueRequest, SourceFilesPersistenceEffectRequest, SourceFilesComposeRequest,
  BootstrapMountSideEffectsRequest, SourceFilesCloudQueueRunner,
} from '@/features/source-files/sourceFilesPersistenceContracts'
import { useSourceFilesWorkspaceRuntime } from '@/features/source-files/useSourceFilesWorkspaceRuntime'
import { useSourceFilesSeedSync } from '@/features/source-files/useSourceFilesSeedSync'
import { useSourceFilesCloudSync } from '@/features/source-files/useSourceFilesCloudSync'

const markWorkspaceSeedSyncDebug = (source: string): void => {
  __canvasStartupDebug.workspaceSeedLastSyncAtMs = Date.now()
  __canvasStartupDebug.workspaceSeedLastSyncSource = String(source || '').trim()
}
function schedulePersistedSnapshotIfChanged<Snapshot>(args: {
  taskKey: string
  scopeKey: string
  signature: string
  lastPersistedRef: React.MutableRefObject<Snapshot | null>
  equalityFn: (left: Snapshot | null, right: Snapshot | null) => boolean
  readSnapshot: () => Snapshot
  persist: (snapshot: Snapshot) => Promise<void>
}): void {
  scheduleWorkspaceSyncTask(args.taskKey, () => {
    const nextSnapshot = args.readSnapshot()
    const prevSnapshot = args.lastPersistedRef.current
    if (args.equalityFn(prevSnapshot, nextSnapshot)) return
    args.lastPersistedRef.current = nextSnapshot
    void args.persist(nextSnapshot)
  }, SOURCE_FILES_PERSIST_DELAY_MS, { signature: args.signature, scopeKey: args.scopeKey })
}
function subscribeCoalescedStorePersistence<Snapshot>(args: {
  taskKey: string
  scopeKey: string
  hydratedRef: React.MutableRefObject<boolean>
  lastPersistedRef: React.MutableRefObject<Snapshot | null>
  selector: (state: ReturnType<typeof useGraphStore.getState>) => Snapshot
  equalityFn: (left: Snapshot | null, right: Snapshot | null) => boolean
  buildSignature: (snapshot: Snapshot) => string
  persist: (snapshot: Snapshot) => Promise<void>
  onSnapshot?: (snapshot: Snapshot) => void
}): () => void {
  return useGraphStore.subscribe(
    args.selector,
    snapshot => {
      if (!args.hydratedRef.current) return
      const prevSnapshot = args.lastPersistedRef.current
      if (args.equalityFn(prevSnapshot, snapshot)) return
      args.onSnapshot?.(snapshot)
      schedulePersistedSnapshotIfChanged({
        taskKey: args.taskKey,
        scopeKey: args.scopeKey,
        signature: args.buildSignature(snapshot),
        lastPersistedRef: args.lastPersistedRef,
        equalityFn: args.equalityFn,
        readSnapshot: () => args.selector(useGraphStore.getState()),
        persist: args.persist,
      })
    },
    { equalityFn: args.equalityFn },
  )
}
function stripPersistedWorkspaceBackedSourceFiles(value: unknown) {
  const items = Array.isArray(value) ? value : []
  return items.filter(entry => {
    const sourcePath = String((entry as { source?: { path?: unknown } } | null)?.source?.path || '')
    return !sourcePath.startsWith('workspace:')
  })
}

const hasEnabledNonWorkspaceSourceFile = (sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']): boolean => {
  const list = Array.isArray(sourceFiles) ? sourceFiles : []
  return list.some(file => {
    if (!file?.enabled) return false
    const sourcePath = String(file.source?.path || '')
    return !sourcePath.startsWith('workspace:')
  })
}

export function SourceFilesPersistenceBootstrap() {
  const runtimePersistenceScopeKey = WORKSPACE_SYNC_SCOPE_SOURCE_FILES_RUNTIME_PERSISTENCE
  const agenticGraphStorageScopeKey = WORKSPACE_SYNC_SCOPE_AGENTIC_OS_STORAGE_RUNTIME_PERSISTENCE
  const hydratedRef = React.useRef(false)
  const lastPersistedRef = React.useRef<ReturnType<typeof useGraphStore.getState>['sourceFiles'] | null>(null)
  const lastComposeSignatureRef = React.useRef('')
  const workspaceHydratedRef = React.useRef(false)
  const lastWorkspacePersistedRef = React.useRef<unknown>(null)
  const lastMaterializedActivePathRef = React.useRef('')
  const activePathSourceAuthorityRef = React.useRef(createActivePathSourceAuthorityCoordinator())
  const lastQueuedAgenticGraphStorageSignatureRef = React.useRef('')
  const lastQueuedAgenticGraphStorageSourceFilesRef = React.useRef<ReturnType<typeof useGraphStore.getState>['sourceFiles']>([])
  const latestSourceFilesSnapshotRef = React.useRef<ReturnType<typeof useGraphStore.getState>['sourceFiles']>([])
  const activeAgenticGraphWorkspaceIdRef = React.useRef('')
  const agenticGraphInboundApplyOperations = React.useMemo(createAgenticGraphStorageOperationTracker, [])
  const agenticGraphStorageQueueOperations = React.useMemo(() => createAgenticGraphStorageLatestOperationRunner<AgenticGraphStorageOwnedQueueRequest>(), [])
  const suppressComposeUntilMsRef = React.useRef(0)
  const reusableWorkspaceFsRef = React.useRef<Awaited<ReturnType<typeof getWorkspaceFs>> | null>(null)
  const reusableWorkspaceEntriesRef = React.useRef<ReturnType<typeof readReusableWorkspaceEntriesSnapshot>>(undefined)
  const reusableWorkspaceSourcesByPathRef = React.useRef<ReturnType<typeof resolveWorkspaceSourceIndexSnapshot> | null>(null)
  const agenticGraphStorageWorkspaceLifecycle = React.useMemo(createAgenticGraphStorageWorkspaceLifecycle, [])
  const workspaceSeedSyncLifecycleAbortControllerRef = React.useRef(new AbortController())
  React.useEffect(() => {
    const controller = new AbortController()
    workspaceSeedSyncLifecycleAbortControllerRef.current = controller
    return () => {
      controller.abort(new Error('Source Files workspace seed sync lifecycle ended'))
      activePathSourceAuthorityRef.current.clear()
    }
  }, [])
  const [workspaceSyncSettingsRev, setWorkspaceSyncSettingsRev] = React.useState(0)
  React.useEffect(() => {
    return subscribeWorkspaceStoreSyncSettingsChanged(() => {
      setWorkspaceSyncSettingsRev(prev => prev + 1)
    })
  }, [])
  const [workspaceSeedSyncEnabled, setWorkspaceSeedSyncEnabled] = React.useState(() => readWorkspaceSeedSyncEnabledSetting())
  const [workspaceCloudSyncEnabled, setWorkspaceCloudSyncEnabled] = React.useState(() => readWorkspaceCloudSyncEnabledSetting())
  const [workspaceSeedSyncPollMs, setWorkspaceSeedSyncPollMs] = React.useState(() => readWorkspaceSeedSyncPollMsSetting())
  const [workspaceSeedSyncIdleMaxMs, setWorkspaceSeedSyncIdleMaxMs] = React.useState(() => readWorkspaceSeedSyncIdleMaxMsSetting())
  const [workspaceSourceFilesDocsOnly, setWorkspaceSourceFilesDocsOnly] = React.useState(() => readWorkspaceSourceFilesDocsOnlySetting())
  const [workspaceSourceFilesSyncDebounceMs, setWorkspaceSourceFilesSyncDebounceMs] = React.useState(() => readWorkspaceSourceFilesSyncDebounceMsSetting())
  const readReusableWorkspaceSourceIndexSnapshot = React.useCallback(() => {
    const cached = reusableWorkspaceSourcesByPathRef.current
    if (cached) return cached
    const snapshot = resolveWorkspaceSourceIndexSnapshot(undefined)
    reusableWorkspaceSourcesByPathRef.current = snapshot
    return snapshot
  }, [])

  const readReusableWorkspaceFs = React.useCallback(async () => {
    const cached = reusableWorkspaceFsRef.current
    if (cached) return cached
    const fs = await getWorkspaceFs()
    reusableWorkspaceFsRef.current = fs
    return fs
  }, [])

  const readCurrentSourceFilesSnapshot = React.useCallback((
    sourceFiles?: ReturnType<typeof useGraphStore.getState>['sourceFiles'],
  ): ReturnType<typeof useGraphStore.getState>['sourceFiles'] => {
    return Array.isArray(sourceFiles) ? sourceFiles : (Array.isArray(useGraphStore.getState().sourceFiles) ? useGraphStore.getState().sourceFiles : [])
  }, [])

  React.useEffect(() => {
    latestSourceFilesSnapshotRef.current = readCurrentSourceFilesSnapshot()
    const unsubscribe = useGraphStore.subscribe(
      state => state.sourceFiles,
      sourceFiles => {
        latestSourceFilesSnapshotRef.current = readCurrentSourceFilesSnapshot(sourceFiles as ReturnType<typeof useGraphStore.getState>['sourceFiles'])
      },
      { equalityFn: areRuntimeSourceFilesEqualByIdAndHash },
    )
    return () => {
      latestSourceFilesSnapshotRef.current = []
      unsubscribe()
    }
  }, [readCurrentSourceFilesSnapshot])

  const readCallerOwnedSourceFilesSnapshot = React.useCallback((
    sourceFiles?: ReturnType<typeof useGraphStore.getState>['sourceFiles'],
  ): ReturnType<typeof useGraphStore.getState>['sourceFiles'] => {
    if (Array.isArray(sourceFiles)) return sourceFiles
    if (Array.isArray(latestSourceFilesSnapshotRef.current)) return latestSourceFilesSnapshotRef.current
    return readCurrentSourceFilesSnapshot(sourceFiles)
  }, [readCurrentSourceFilesSnapshot])

  const ensureAgenticGraphStorageRuntimeDependencies = React.useCallback((ownership?: AgenticGraphStorageWorkspaceOwnership | null): Promise<AgenticGraphStorageRuntimeDependencies> => (
    agenticGraphStorageWorkspaceLifecycle.loadDependencies(ownership)
  ), [agenticGraphStorageWorkspaceLifecycle])

  const readSourceFilesCompositionSignature = React.useCallback((args: {
    sourceFilesSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
    compositionSignature?: string
    compositionSignatureOptions?: SourceFilesCompositionSignatureOptions
  }): string => (
    String(args.compositionSignature || '').trim()
    || buildSourceFilesCompositionSignature(args.sourceFilesSnapshot, args.compositionSignatureOptions)
  ), [])

  const resolveSourceFilesComposeRequest = React.useCallback((args: {
    sourceFilesSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
    shouldScheduleCompose?: boolean
    compositionSignature?: string
    compositionSignatureOptions?: SourceFilesCompositionSignatureOptions
  }): SourceFilesComposeRequest => {
    const shouldScheduleCompose = args.shouldScheduleCompose ?? hasEnabledNonWorkspaceSourceFile(args.sourceFilesSnapshot)
    return {
      shouldScheduleCompose,
      compositionSignature: shouldScheduleCompose ? readSourceFilesCompositionSignature({
        sourceFilesSnapshot: args.sourceFilesSnapshot,
        compositionSignature: args.compositionSignature,
        compositionSignatureOptions: args.compositionSignatureOptions,
      }) : '',
    }
  }, [readSourceFilesCompositionSignature])

  const {
    resolveWorkspaceRematerializeRequest, resolveActivePathMaterializationRequest, shouldSkipActivePathMaterializationRequest,
    workspaceRematerializeSeedSyncScheduler, scheduleWorkspaceRematerializeRef, prepareEnsureSeedMutationRequest,
    clearPreparedEnsureSeedMutationRequest, applyPreparedWorkspaceSeedSyncRequest, subscribeWorkspaceFsRuntime,
    subscribeActiveWorkspacePath,
  } = useSourceFilesWorkspaceRuntime({
    workspaceHydratedRef, workspaceSourceFilesDocsOnly, workspaceSourceFilesSyncDebounceMs,
    readCallerOwnedSourceFilesSnapshot, readReusableWorkspaceFs, readReusableWorkspaceSourceIndexSnapshot,
    reusableWorkspaceFsRef, reusableWorkspaceEntriesRef, reusableWorkspaceSourcesByPathRef,
    latestSourceFilesSnapshotRef, lastMaterializedActivePathRef, suppressComposeUntilMsRef,
    activePathSourceAuthorityRef, workspaceSeedSyncLifecycleAbortControllerRef, markWorkspaceSeedSyncDebug
  })

  const subscribeWorkspaceSeedSync = useSourceFilesSeedSync({
    workspaceSeedSyncEnabled, workspaceSeedSyncPollMs, workspaceSeedSyncIdleMaxMs,
    workspaceSourceFilesDocsOnly, readCallerOwnedSourceFilesSnapshot, readReusableWorkspaceFs,
    prepareEnsureSeedMutationRequest, clearPreparedEnsureSeedMutationRequest, applyPreparedWorkspaceSeedSyncRequest
  })

  const readBootstrapMountSourceFilesSnapshot = React.useCallback((args: {
    bootstrapMaterialization: Awaited<ReturnType<typeof materializeBootstrapWorkspaceSourceFiles>> | null
  }): ReturnType<typeof useGraphStore.getState>['sourceFiles'] => {
    return args.bootstrapMaterialization?.sourceFiles
      || readCallerOwnedSourceFilesSnapshot(lastPersistedRef.current as ReturnType<typeof useGraphStore.getState>['sourceFiles'])
  }, [readCallerOwnedSourceFilesSnapshot])

  const resolveBootstrapMountRequest = React.useCallback((args: {
    persistedWorkspace: SourceFilesWorkspaceState
    bootstrapMaterialization: Awaited<ReturnType<typeof materializeBootstrapWorkspaceSourceFiles>> | null
  }): BootstrapMountRequest => {
    const sourceFilesSnapshot = readBootstrapMountSourceFilesSnapshot({
      bootstrapMaterialization: args.bootstrapMaterialization,
    })
    const workspaceEntriesSnapshot = args.bootstrapMaterialization?.workspaceEntries
      ?? reusableWorkspaceEntriesRef.current
    const initialActivePathRequest = resolveActivePathMaterializationRequest({
      sourceFilesSnapshot,
      workspaceEntriesSnapshot,
    })
    return {
      persistedWorkspace: args.persistedWorkspace,
      bootstrapMaterialization: args.bootstrapMaterialization,
      bootstrapSideEffectsRequest: {
        sourceFilesSnapshot,
        composeRequest: args.bootstrapMaterialization && !initialActivePathRequest
          ? resolveSourceFilesComposeRequest({
              sourceFilesSnapshot,
              shouldScheduleCompose: true,
              compositionSignatureOptions: {
                includeWorkspaceBacked: true,
                intent: 'explicit-graph-owner',
              },
            })
          : null,
        rematerializeRequest: resolveWorkspaceRematerializeRequest({
          sourceFilesSnapshot,
        }),
      },
      initialActivePathRequest,
    }
  }, [readBootstrapMountSourceFilesSnapshot, resolveActivePathMaterializationRequest, resolveSourceFilesComposeRequest, resolveWorkspaceRematerializeRequest])

  const applyBootstrapInitialActivePathRequest = React.useCallback((request: ActivePathMaterializationRequest | null): void => {
    if (!request) return
    if (shouldSkipActivePathMaterializationRequest(request)) return
    throw new Error('Canvas source selection changed after graph-owning startup materialization')
  }, [shouldSkipActivePathMaterializationRequest])

  const applyBootstrapInitialRematerializeRequest = React.useCallback((request: WorkspaceRematerializeRequest | null): boolean => {
    if (!request) return false
    workspaceRematerializeSeedSyncScheduler.retainPending(request)
    scheduleWorkspaceRematerializeRef.current?.(request)
    return true
  }, [scheduleWorkspaceRematerializeRef, workspaceRematerializeSeedSyncScheduler])

  const applyBootstrapFallbackRematerializeRequest = React.useCallback(() => {
    scheduleWorkspaceRematerializeRef.current?.()
  }, [scheduleWorkspaceRematerializeRef])

  const applyBootstrapComposeRequest = React.useCallback((args: {
    composeRequest: SourceFilesComposeRequest | null
    sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  }): string => {
    if (!args.composeRequest?.shouldScheduleCompose) return ''
    return applyBootstrapComposedGraphSync({
      sourceFiles: args.sourceFilesSnapshot,
      precomputedSignature: args.composeRequest.compositionSignature,
    })
  }, [])

  const applyBootstrapSideEffectsRequest = React.useCallback((request: BootstrapMountSideEffectsRequest) => {
    lastComposeSignatureRef.current = applyBootstrapComposeRequest({
      composeRequest: request.composeRequest,
      sourceFilesSnapshot: request.sourceFilesSnapshot,
    })
    if (applyBootstrapInitialRematerializeRequest(request.rematerializeRequest)) return
    applyBootstrapFallbackRematerializeRequest()
  }, [applyBootstrapComposeRequest, applyBootstrapFallbackRematerializeRequest, applyBootstrapInitialRematerializeRequest])

  const applyBootstrapMaterializationResult = React.useCallback((bootstrapMaterialization: BootstrapMountRequest['bootstrapMaterialization']) => {
    if (!bootstrapMaterialization) return
    reusableWorkspaceFsRef.current = bootstrapMaterialization.workspaceFs
    reusableWorkspaceEntriesRef.current = bootstrapMaterialization.workspaceEntries
    reusableWorkspaceSourcesByPathRef.current = bootstrapMaterialization.sourcesByPath
    lastMaterializedActivePathRef.current = bootstrapMaterialization.activePathKey
  }, [])

  const applyBootstrapWorkspaceState = React.useCallback((persistedWorkspace: SourceFilesWorkspaceState) => {
    restoreBootstrapWorkspaceState(persistedWorkspace)
    workspaceHydratedRef.current = true
    lastWorkspacePersistedRef.current = persistedWorkspace
  }, [])

  const applyBootstrapMountRequest = React.useCallback(async (request: BootstrapMountRequest): Promise<void> => {
    applyBootstrapMaterializationResult(request.bootstrapMaterialization)
    applyBootstrapWorkspaceState(request.persistedWorkspace)
    applyBootstrapInitialActivePathRequest(request.initialActivePathRequest)
    applyBootstrapSideEffectsRequest(request.bootstrapSideEffectsRequest)
  }, [applyBootstrapInitialActivePathRequest, applyBootstrapMaterializationResult, applyBootstrapSideEffectsRequest, applyBootstrapWorkspaceState])

  React.useEffect(() => {
    setWorkspaceSeedSyncEnabled(readWorkspaceSeedSyncEnabledSetting())
    setWorkspaceCloudSyncEnabled(readWorkspaceCloudSyncEnabledSetting())
    setWorkspaceSeedSyncPollMs(readWorkspaceSeedSyncPollMsSetting())
    setWorkspaceSeedSyncIdleMaxMs(readWorkspaceSeedSyncIdleMaxMsSetting())
    setWorkspaceSourceFilesDocsOnly(readWorkspaceSourceFilesDocsOnlySetting())
    setWorkspaceSourceFilesSyncDebounceMs(readWorkspaceSourceFilesSyncDebounceMsSetting())
    reusableWorkspaceSourcesByPathRef.current = null
  }, [workspaceSyncSettingsRev])

  const runAgenticGraphStorageQueueRequest = React.useCallback<SourceFilesCloudQueueRunner>((request, handleAgenticGraphStorageQueueRequestSuccess, handleAgenticGraphStorageQueueRequestFailure) => {
    const ownership = agenticGraphStorageWorkspaceLifecycle.readOwnership()
    if (!ownership) return
    agenticGraphStorageQueueOperations.enqueue({ ownership, request }, async ownedRequest => {
      const { ownership: capturedOwnership, request: queuedRequest } = ownedRequest
      if (!agenticGraphStorageWorkspaceLifecycle.isCurrent(capturedOwnership)) return
      if (!queuedRequest.workspaceId) return
      if (activeAgenticGraphWorkspaceIdRef.current && activeAgenticGraphWorkspaceIdRef.current !== queuedRequest.workspaceId) return
      if (lastQueuedAgenticGraphStorageSignatureRef.current === queuedRequest.signature) return
      try {
        const deps = await ensureAgenticGraphStorageRuntimeDependencies(capturedOwnership)
        const result = await runWorkspaceSeedSyncTask(capturedOwnership.signal, () => (
          deps.syncSourceFilesToAgenticGraphStorage({
            workspaceId: queuedRequest.workspaceId,
            sourceFiles: queuedRequest.sourceFilesSnapshot,
            previousSourceFiles: lastQueuedAgenticGraphStorageSourceFilesRef.current,
          })
        ))
        if (!agenticGraphStorageWorkspaceLifecycle.isCurrent(capturedOwnership)) return
        handleAgenticGraphStorageQueueRequestSuccess({
          request: queuedRequest,
          queuedMutationCount: result.queuedMutationCount,
        })
      } catch {
        if (!agenticGraphStorageWorkspaceLifecycle.isCurrent(capturedOwnership)) return
        handleAgenticGraphStorageQueueRequestFailure(queuedRequest)
      }
    })
  }, [ensureAgenticGraphStorageRuntimeDependencies, agenticGraphStorageQueueOperations, agenticGraphStorageWorkspaceLifecycle])

  const { readAgenticGraphStorageSyncSignature, resolveAgenticGraphStorageQueueRequest, scheduleAgenticGraphStorageQueueRequest, subscribeCloudWorkspace } = useSourceFilesCloudSync({
    workspaceCloudSyncEnabled, agenticGraphStorageScopeKey, readCallerOwnedSourceFilesSnapshot,
    latestSourceFilesSnapshotRef, lastQueuedAgenticGraphStorageSignatureRef, lastQueuedAgenticGraphStorageSourceFilesRef,
    activeAgenticGraphWorkspaceIdRef, agenticGraphInboundApplyOperations, agenticGraphStorageQueueOperations,
    agenticGraphStorageWorkspaceLifecycle, ensureAgenticGraphStorageRuntimeDependencies, runAgenticGraphStorageQueueRequest
  })

  const resolveSourceFilesPersistenceEffectRequest = React.useCallback((
    sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles'],
  ): SourceFilesPersistenceEffectRequest => {
    const snapshot = readCallerOwnedSourceFilesSnapshot(sourceFilesSnapshot)
    const storageSyncSignature = readAgenticGraphStorageSyncSignature({
      sourceFilesSnapshot: snapshot,
    })
    return {
      sourceFilesSnapshot: snapshot,
      agenticGraphStorageQueueRequest: resolveAgenticGraphStorageQueueRequest({
        sourceFilesSnapshot: snapshot,
        storageSyncSignature,
      }),
      composeRequest: resolveSourceFilesComposeRequest({
        sourceFilesSnapshot: snapshot,
      }),
    }
  }, [readCallerOwnedSourceFilesSnapshot, readAgenticGraphStorageSyncSignature, resolveAgenticGraphStorageQueueRequest, resolveSourceFilesComposeRequest])

  const applySourceFilesPersistenceStorageRequest = React.useCallback((request: SourceFilesPersistenceEffectRequest) => {
    if (agenticGraphInboundApplyOperations.isActive()) return
    scheduleAgenticGraphStorageQueueRequest(request.agenticGraphStorageQueueRequest)
  }, [agenticGraphInboundApplyOperations, scheduleAgenticGraphStorageQueueRequest])

  const applySuppressedSourceFilesPersistenceComposeRequest = React.useCallback((compositionSignature: string): boolean => {
    if (Date.now() >= suppressComposeUntilMsRef.current) return false
    lastComposeSignatureRef.current = compositionSignature
    return true
  }, [])

  const scheduleSourceFilesPersistenceComposeRequest = React.useCallback((compositionSignature: string) => {
    if (compositionSignature === lastComposeSignatureRef.current) return
    lastComposeSignatureRef.current = compositionSignature
    try {
      scheduleApplyComposedGraphFromSourceFiles({ precomputedSignature: compositionSignature })
    } catch {
      void 0
    }
  }, [])

  const applySourceFilesPersistenceComposeRequest = React.useCallback((request: SourceFilesPersistenceEffectRequest) => {
    if (!request.composeRequest.shouldScheduleCompose) return
    const compositionSignature = request.composeRequest.compositionSignature
    if (applySuppressedSourceFilesPersistenceComposeRequest(compositionSignature)) return
    scheduleSourceFilesPersistenceComposeRequest(compositionSignature)
  }, [applySuppressedSourceFilesPersistenceComposeRequest, scheduleSourceFilesPersistenceComposeRequest])

  const applySourceFilesPersistenceEffectRequest = React.useCallback((request: SourceFilesPersistenceEffectRequest) => {
    applySourceFilesPersistenceStorageRequest(request)
    applySourceFilesPersistenceComposeRequest(request)
  }, [applySourceFilesPersistenceComposeRequest, applySourceFilesPersistenceStorageRequest])

  React.useEffect(() => {
    __canvasStartupDebug.sourceBootstrapMounted = true
    return () => {
      __canvasStartupDebug.sourceBootstrapMounted = false
    }
  }, [])

  React.useEffect(subscribeWorkspaceSeedSync, [subscribeWorkspaceSeedSync])

  React.useEffect(subscribeCloudWorkspace, [subscribeCloudWorkspace])

  React.useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    void runWorkspaceSeedSyncTask(controller.signal, async () => {
      const [persistedRaw, persistedWorkspace] = await Promise.all([
        loadPersistedSourceFiles(),
        loadPersistedSourceFilesWorkspace(),
      ])
      const persisted = stripPersistedWorkspaceBackedSourceFiles(persistedRaw)
      if (cancelled) return
      lastPersistedRef.current = restoreBootstrapPersistedSourceFiles({
        persistedSourceFiles: persisted,
      })
      hydratedRef.current = true

      await runBootstrapSourceFileHydration()
      if (cancelled) return
      const bootstrapMaterialization = await materializeBootstrapWorkspaceSourceFiles({
        signal: controller.signal,
        existingSourceFiles: lastPersistedRef.current,
        sourcesByPath: readReusableWorkspaceSourceIndexSnapshot(),
      })
      if (cancelled) return
      const bootstrapMountRequest = resolveBootstrapMountRequest({
        persistedWorkspace,
        bootstrapMaterialization,
      })
      await applyBootstrapMountRequest(bootstrapMountRequest)
      if (cancelled) return
      const currentSearch = typeof window === 'undefined' ? '' : String(window.location.search || '')
      const documentIntentKey = buildDocDeepLinkIntentKey(currentSearch)
      if (documentIntentKey) beginSourceFilesDocumentIntent(documentIntentKey)
      completeSourceFilesBootstrap()
    }).catch(error => {
      if (controller.signal.aborted) return
      hydratedRef.current = true
      workspaceHydratedRef.current = true
      if (!cancelled) failSourceFilesBootstrap(error)
    })

    return () => {
      cancelled = true
      controller.abort(new Error('Source Files bootstrap lifecycle ended'))
    }
  }, [applyBootstrapMountRequest, readReusableWorkspaceSourceIndexSnapshot, resolveBootstrapMountRequest])

  React.useEffect(subscribeWorkspaceFsRuntime, [subscribeWorkspaceFsRuntime])
  React.useEffect(subscribeActiveWorkspacePath, [subscribeActiveWorkspacePath])

  React.useEffect(() => {
    const taskKey = WORKSPACE_SYNC_TASK_SOURCE_FILES_PERSIST
    const unsubscribe = subscribeCoalescedStorePersistence({
      taskKey,
      scopeKey: runtimePersistenceScopeKey,
      hydratedRef,
      lastPersistedRef: lastPersistedRef as React.MutableRefObject<unknown[] | null>,
      selector: s => s.sourceFiles,
      equalityFn: areSourceFilesEqualByIdAndHash,
      buildSignature: next => buildSourceFilesPersistenceSignature(next),
      persist: next => persistSourceFiles(next as never),
      onSnapshot: next => {
        const request = resolveSourceFilesPersistenceEffectRequest(next as never)
        applySourceFilesPersistenceEffectRequest(request)
      },
    })
    return () => {
      cancelWorkspaceSyncTask(taskKey)
      unsubscribe()
    }
  }, [applySourceFilesPersistenceEffectRequest, resolveSourceFilesPersistenceEffectRequest, runtimePersistenceScopeKey])

  React.useEffect(() => {
    const taskKey = WORKSPACE_SYNC_TASK_SOURCE_FILES_WORKSPACE
    const unsubscribe = subscribeCoalescedStorePersistence({
      taskKey,
      scopeKey: runtimePersistenceScopeKey,
      hydratedRef: workspaceHydratedRef,
      lastPersistedRef: lastWorkspacePersistedRef as React.MutableRefObject<SourceFilesWorkspaceState | null>,
      selector: s =>
        normalizeSourceFilesWorkspaceState({
          folderName: s.localMarkdownFolderName,
          accessMode: s.localMarkdownFolderAccessMode,
          folderCacheId: s.localMarkdownFolderCacheId,
          selectedFolderPath: s.localMarkdownSelectedFolderPath,
        }),
      equalityFn: areSourceFilesWorkspaceStatesEqual,
      buildSignature: snapshot => buildSourceFilesWorkspaceStateSignature(snapshot),
      persist: nextSnapshot => persistSourceFilesWorkspace(nextSnapshot),
    })
    return () => {
      cancelWorkspaceSyncTask(taskKey)
      unsubscribe()
    }
  }, [runtimePersistenceScopeKey])

  return null
}
