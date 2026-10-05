import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import {
  buildMaterializedWorkspaceActivePathKey, buildMaterializedWorkspaceForceIncludePaths,
  hydrateWorkspaceEntriesInlineText, materializeActiveWorkspaceEntryIntoSourceFiles, readWorkspaceActiveEntrySnapshot,
  readReusableWorkspaceEntriesSnapshot, resolveMaterializedWorkspaceActivePath,
} from '@/features/source-files/sourceFilesRuntimeShared'
import { areSourceFileRecordsEqual } from '@/features/source-files/sourceFileParsedState'
import { isMaterializedWorkspaceSourceProofCurrent, type MaterializedWorkspaceSourceProof } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { resolveWorkspaceSourceRootPaths } from '@/features/workspace-fs/workspaceSourceRoots'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { subscribeWorkspaceFsChanged } from '@/features/workspace-fs/workspaceFsEvents'
import { isWebsiteImportExplorerUpdate } from '@/features/workspace-fs/websiteImportRefreshGuard'
import { resolveWorkspaceSourceIndexSnapshot } from '@/features/workspace-fs/sourceIndex'
import { buildWorkspaceEntriesSemanticKey } from '@/features/workspace-fs/workspaceEntriesSemanticKey'
import { invalidateCachedWorkspaceActiveEntrySnapshot } from '@/features/source-files/workspaceActiveEntryCache'
import { createWorkspaceSeedSyncDeferredScheduler } from '@/lib/workspace/workspaceSeedSyncDeferredScheduler'
import { beginWorkspaceSeedSyncTask, runWorkspaceSeedSyncTask } from '@/lib/workspace/workspaceSeedSyncRuntime'
import { createActivePathSourceAuthorityCoordinator, materializeActivePathWithSourceAuthority, resolveActivePathMaterializationSourceAuthority, type ActivePathMaterializationRequest } from '@/features/source-files/sourceFilesActivePathAuthority'
import {
  WorkspaceFsMutationRequest, WorkspaceRematerializeRequest, PreparedWorkspaceSeedSyncRequest,
  ActivePathMaterializationSelection, SourceFilesSnapshot, SourceFilesSnapshotReader,
} from '@/features/source-files/sourceFilesPersistenceContracts'

const ACTIVE_PATH_SWITCH_COMPOSE_SUPPRESS_MS = 800
const hasNonWorkspaceSourceFile = (sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']): boolean => {
  const list = Array.isArray(sourceFiles) ? sourceFiles : []
  return list.some(file => {
    if (!file) return false
    const sourcePath = String(file.source?.path || '')
    return !sourcePath.startsWith('workspace:')
  })
}

const hasWorkspaceSourceFile = (sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']): boolean => {
  const list = Array.isArray(sourceFiles) ? sourceFiles : []
  return list.some(file => {
    if (!file) return false
    const sourcePath = String(file.source?.path || '')
    return sourcePath.startsWith('workspace:')
  })
}

type WorkspaceRuntimeInputs = {
  workspaceHydratedRef: React.MutableRefObject<boolean>
  workspaceSourceFilesDocsOnly: boolean
  workspaceSourceFilesSyncDebounceMs: number
  readCallerOwnedSourceFilesSnapshot: SourceFilesSnapshotReader
  readReusableWorkspaceFs: () => Promise<Awaited<ReturnType<typeof getWorkspaceFs>>>
  readReusableWorkspaceSourceIndexSnapshot: () => ReturnType<typeof resolveWorkspaceSourceIndexSnapshot>
  reusableWorkspaceFsRef: React.MutableRefObject<Awaited<ReturnType<typeof getWorkspaceFs>> | null>
  reusableWorkspaceEntriesRef: React.MutableRefObject<ReturnType<typeof readReusableWorkspaceEntriesSnapshot>>
  reusableWorkspaceSourcesByPathRef: React.MutableRefObject<ReturnType<typeof resolveWorkspaceSourceIndexSnapshot> | null>
  latestSourceFilesSnapshotRef: React.MutableRefObject<SourceFilesSnapshot>
  lastMaterializedActivePathRef: React.MutableRefObject<string>
  suppressComposeUntilMsRef: React.MutableRefObject<number>
  activePathSourceAuthorityRef: React.MutableRefObject<ReturnType<typeof createActivePathSourceAuthorityCoordinator>>
  workspaceSeedSyncLifecycleAbortControllerRef: React.MutableRefObject<AbortController>
  markWorkspaceSeedSyncDebug: (source: string) => void
}

export function useSourceFilesWorkspaceRuntime({
  workspaceHydratedRef, workspaceSourceFilesDocsOnly, workspaceSourceFilesSyncDebounceMs,
  readCallerOwnedSourceFilesSnapshot, readReusableWorkspaceFs, readReusableWorkspaceSourceIndexSnapshot,
  reusableWorkspaceFsRef, reusableWorkspaceEntriesRef, reusableWorkspaceSourcesByPathRef,
  latestSourceFilesSnapshotRef, lastMaterializedActivePathRef, suppressComposeUntilMsRef,
  activePathSourceAuthorityRef, workspaceSeedSyncLifecycleAbortControllerRef, markWorkspaceSeedSyncDebug
}: WorkspaceRuntimeInputs) {
  const workspaceMaterializeQueuedRef = React.useRef(false)
  const workspaceRematerializeSeedSyncScheduler = React.useMemo(
    () => createWorkspaceSeedSyncDeferredScheduler<WorkspaceRematerializeRequest>({
      clearTimeout: handle => window.clearTimeout(handle as number),
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    }), [],
  )
  const scheduleWorkspaceRematerializeRef = React.useRef<((request?: WorkspaceRematerializeRequest | null) => void) | null>(null)
  const activePathMaterializeInFlightRef = React.useRef(false)
  const queuedActivePathMaterializeRef = React.useRef<ActivePathMaterializationRequest | null>(null)
  const pendingEnsureSeedMutationRequestRef = React.useRef<WorkspaceFsMutationRequest | null>(null)
  const lastWorkspaceEntriesSignatureRef = React.useRef('')
  const lastWorkspaceMaterializationProofRef = React.useRef<MaterializedWorkspaceSourceProof | null>(null)
  const hasWorkspaceRematerializeCandidates = React.useCallback((
    sourceFiles?: ReturnType<typeof useGraphStore.getState>['sourceFiles'],
  ): boolean => {
    const snapshot = readCallerOwnedSourceFilesSnapshot(sourceFiles)
    return hasNonWorkspaceSourceFile(snapshot) || hasWorkspaceSourceFile(snapshot)
  }, [readCallerOwnedSourceFilesSnapshot])

  const resolveWorkspaceRematerializeRequest = React.useCallback((args?: {
    sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  }): WorkspaceRematerializeRequest | null => {
    if (!workspaceHydratedRef.current) {
      workspaceMaterializeQueuedRef.current = true
      return null
    }
    const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot(args?.sourceFilesSnapshot)
    if (!hasWorkspaceRematerializeCandidates(sourceFilesSnapshot)) {
      workspaceMaterializeQueuedRef.current = true
      return null
    }
    return {
      sourceFilesSnapshot,
    }
  }, [hasWorkspaceRematerializeCandidates, readCallerOwnedSourceFilesSnapshot, workspaceHydratedRef])

  const rematerializeWorkspaceBackedSourceFilesOnce = React.useCallback(async (args?: {
    sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  }): Promise<ReturnType<typeof useGraphStore.getState>['sourceFiles']> => {
    const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot(args?.sourceFilesSnapshot)
    const baseline = useGraphStore.getState(), explorerPath = useMarkdownExplorerStore.getState().activePath
    const lifecycle = workspaceSeedSyncLifecycleAbortControllerRef.current
    const stale = () => Object.assign(new Error('Workspace rematerialization source authority changed.'),
      { code: 'SOURCE_FILES_MATERIALIZATION_STALE', retryable: false })
    const assertCurrent = () => {
      const current = useGraphStore.getState()
      if (lifecycle.signal.aborted || lifecycle !== workspaceSeedSyncLifecycleAbortControllerRef.current
        || current.sourceFiles !== baseline.sourceFiles || useMarkdownExplorerStore.getState().activePath !== explorerPath
        || current.markdownDocumentName !== baseline.markdownDocumentName || current.markdownDocumentText !== baseline.markdownDocumentText
        || current.markdownDocumentApplyViewPreset !== baseline.markdownDocumentApplyViewPreset) throw stale()
    }
    // A caller may retain a distinct but fully equivalent array; graph-cache drift is not equivalent.
    if (sourceFilesSnapshot.length !== baseline.sourceFiles.length
      || sourceFilesSnapshot.some((file, index) => !areSourceFileRecordsEqual(file, baseline.sourceFiles[index]))) throw stale()
    assertCurrent()
    const activePath = resolveMaterializedWorkspaceActivePath({ explorerActivePath: explorerPath })
    if (!activePath) return baseline.sourceFiles
    const fs = await readReusableWorkspaceFs()
    assertCurrent()
    const forceIncludePaths = buildMaterializedWorkspaceForceIncludePaths({ activePathOverride: activePath })
    const workspaceEntries = await readWorkspaceActiveEntrySnapshot({
      fs, activePath, workspaceEntries: reusableWorkspaceEntriesRef.current,
    })
    assertCurrent()
    const hydratedWorkspaceEntries = await hydrateWorkspaceEntriesInlineText({ fs, workspaceEntries, forceIncludePaths })
    assertCurrent()
    const signature = buildWorkspaceEntriesSemanticKey({
      entries: hydratedWorkspaceEntries,
      docsOnly: workspaceSourceFilesDocsOnly,
      forceIncludePaths,
      forceIncludeOnly: true,
      workspaceSourceRootPaths: resolveWorkspaceSourceRootPaths({ chatLocalStorageRootPath: baseline.chatLocalStorageRootPath }),
    })
    const previousProof = lastWorkspaceMaterializationProofRef.current
    if (signature === lastWorkspaceEntriesSignatureRef.current && previousProof && isMaterializedWorkspaceSourceProofCurrent(previousProof)) return previousProof.sourceFiles
    // Read provenance without publishing its cache until the source proof succeeds.
    const sourcesByPath = resolveWorkspaceSourceIndexSnapshot(reusableWorkspaceSourcesByPathRef.current || undefined)
    assertCurrent()
    // Publication belongs to the guarded materializer, never this deferred hydration callback.
    const proof = await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: activePath, fs,
      activeWorkspaceEntriesSnapshot: readReusableWorkspaceEntriesSnapshot(hydratedWorkspaceEntries),
      sourceFilesSnapshot: baseline.sourceFiles, sourcesByPath,
    })
    if (!proof || lifecycle.signal.aborted || lifecycle !== workspaceSeedSyncLifecycleAbortControllerRef.current
      || !isMaterializedWorkspaceSourceProofCurrent(proof)) throw stale()
    lastWorkspaceEntriesSignatureRef.current = signature
    lastWorkspaceMaterializationProofRef.current = proof
    reusableWorkspaceEntriesRef.current = readReusableWorkspaceEntriesSnapshot(hydratedWorkspaceEntries)
    reusableWorkspaceSourcesByPathRef.current = sourcesByPath
    return proof.sourceFiles
  }, [readCallerOwnedSourceFilesSnapshot, readReusableWorkspaceFs, readReusableWorkspaceSourceIndexSnapshot, reusableWorkspaceEntriesRef, reusableWorkspaceSourcesByPathRef, workspaceSeedSyncLifecycleAbortControllerRef, workspaceSourceFilesDocsOnly])

  const isWorkspaceSourceRootMutationPath = React.useCallback((path: string): boolean => {
    if (!path) return false
    const roots = resolveWorkspaceSourceRootPaths({
      chatLocalStorageRootPath: useGraphStore.getState().chatLocalStorageRootPath,
    })
    for (let i = 0; i < roots.length; i += 1) {
      const root = String(roots[i] || '').trim()
      if (!root || root === '/') continue
      if (path === root || path.startsWith(`${root}/`)) return true
    }
    return false
  }, [])

  const runWorkspaceRematerializeRequest = React.useCallback(async (request: WorkspaceRematerializeRequest) => {
    return rematerializeWorkspaceBackedSourceFilesOnce({
      sourceFilesSnapshot: request.sourceFilesSnapshot,
    })
  }, [rematerializeWorkspaceBackedSourceFilesOnce])

  React.useEffect(() => {
    workspaceRematerializeSeedSyncScheduler.configure({
      delayMs: workspaceSourceFilesSyncDebounceMs,
      run: request => {
        workspaceMaterializeQueuedRef.current = false
        return runWorkspaceRematerializeRequest(request)
      },
    })
  }, [runWorkspaceRematerializeRequest, workspaceRematerializeSeedSyncScheduler, workspaceSourceFilesSyncDebounceMs])

  const scheduleWorkspaceRematerializeRequest = React.useCallback((request: WorkspaceRematerializeRequest | null) => {
    workspaceRematerializeSeedSyncScheduler.schedule(request)
  }, [workspaceRematerializeSeedSyncScheduler])

  const scheduleWorkspaceRematerialize = React.useCallback((args?: {
    sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  }) => {
    scheduleWorkspaceRematerializeRequest(resolveWorkspaceRematerializeRequest(args))
  }, [resolveWorkspaceRematerializeRequest, scheduleWorkspaceRematerializeRequest])

  const resolveActivePathMaterializationRequest = React.useCallback((args?: {
    activePathSnapshot?: string | null
    sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
    workspaceEntriesSnapshot?: ReturnType<typeof readReusableWorkspaceEntriesSnapshot>
  }): ActivePathMaterializationRequest | null => {
    const activePath = resolveMaterializedWorkspaceActivePath({
      activePathOverride: args?.activePathSnapshot ?? null,
      explorerActivePath: args?.activePathSnapshot == null ? useMarkdownExplorerStore.getState().activePath : null,
    })
    if (!activePath) return null
    const store = useGraphStore.getState()
    const workspaceEntriesSnapshot = args?.workspaceEntriesSnapshot === undefined
      ? reusableWorkspaceEntriesRef.current
      : args.workspaceEntriesSnapshot
    const activePathKey = buildMaterializedWorkspaceActivePathKey({
      activePathOverride: activePath,
      workspaceEntriesSnapshot,
      markdownDocumentName: store.markdownDocumentName,
      markdownDocumentText: store.markdownDocumentText,
      markdownDocumentApplyViewPreset: store.markdownDocumentApplyViewPreset,
    })
    return {
      activePath,
      activePathKey,
      ...resolveActivePathMaterializationSourceAuthority(activePath),
      sourceFilesSnapshot: readCallerOwnedSourceFilesSnapshot(args?.sourceFilesSnapshot),
      workspaceEntriesSnapshot,
    }
  }, [readCallerOwnedSourceFilesSnapshot, reusableWorkspaceEntriesRef])

  const clearActivePathMaterializationRequest = React.useCallback(() => {
    lastMaterializedActivePathRef.current = ''
    queuedActivePathMaterializeRef.current = null
    activePathSourceAuthorityRef.current.clear()
  }, [activePathSourceAuthorityRef, lastMaterializedActivePathRef])

  const queueActivePathMaterializationRequest = React.useCallback((request: ActivePathMaterializationRequest) => {
    queuedActivePathMaterializeRef.current = request
  }, [])

  const shouldSkipActivePathMaterializationRequest = React.useCallback((request: ActivePathMaterializationRequest): boolean => {
    const activePathKey = request.activePathKey
    if (lastMaterializedActivePathRef.current === activePathKey) return true
    return false
  }, [lastMaterializedActivePathRef])

  const runActivePathMaterialization = React.useCallback(async (request: ActivePathMaterializationRequest): Promise<void> => {
    activePathMaterializeInFlightRef.current = true
    suppressComposeUntilMsRef.current = Date.now() + ACTIVE_PATH_SWITCH_COMPOSE_SUPPRESS_MS
    lastMaterializedActivePathRef.current = request.activePathKey
    const signal = workspaceSeedSyncLifecycleAbortControllerRef.current.signal
    try {
      await runWorkspaceSeedSyncTask(signal, async () => {
        await materializeActivePathWithSourceAuthority(request, {
          activeWorkspaceEntriesSnapshot: request.workspaceEntriesSnapshot,
          fs: reusableWorkspaceFsRef.current || undefined,
          sourcesByPath: reusableWorkspaceSourcesByPathRef.current || undefined,
        })
      })
    } catch (error) {
      if (lastMaterializedActivePathRef.current === request.activePathKey) {
        lastMaterializedActivePathRef.current = ''
      }
      if (signal.aborted) return
      throw error
    } finally {
      activePathMaterializeInFlightRef.current = false
      const queuedRequest = queuedActivePathMaterializeRef.current
      queuedActivePathMaterializeRef.current = null
      if (!signal.aborted && queuedRequest && !shouldSkipActivePathMaterializationRequest(queuedRequest)) {
        activePathSourceAuthorityRef.current.launch(queuedRequest, runActivePathMaterialization)
      }
    }
  }, [activePathSourceAuthorityRef, lastMaterializedActivePathRef, reusableWorkspaceFsRef, reusableWorkspaceSourcesByPathRef, shouldSkipActivePathMaterializationRequest, suppressComposeUntilMsRef, workspaceSeedSyncLifecycleAbortControllerRef])

  const syncActivePathMaterialization = React.useCallback((args?: {
    activePathSnapshot?: string | null
    sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
    workspaceEntriesSnapshot?: ReturnType<typeof readReusableWorkspaceEntriesSnapshot>
  }) => {
    if (!workspaceHydratedRef.current) return
    const request = resolveActivePathMaterializationRequest(args)
    if (!request) {
      clearActivePathMaterializationRequest()
      return
    }
    if (activePathMaterializeInFlightRef.current) {
      activePathSourceAuthorityRef.current.begin(request)
      queueActivePathMaterializationRequest(request)
      return
    }
    if (shouldSkipActivePathMaterializationRequest(request)) return
    activePathSourceAuthorityRef.current.launch(request, runActivePathMaterialization)
  }, [activePathSourceAuthorityRef, clearActivePathMaterializationRequest, queueActivePathMaterializationRequest, resolveActivePathMaterializationRequest, runActivePathMaterialization, shouldSkipActivePathMaterializationRequest, workspaceHydratedRef])

  const resolveWorkspaceFsMutationRequest = React.useCallback((detail?: {
    op?: unknown
    path?: unknown
  }, args?: {
    sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
    activePathRequest?: ActivePathMaterializationRequest | null
  }): WorkspaceFsMutationRequest | null => {
    if (!workspaceHydratedRef.current) {
      workspaceMaterializeQueuedRef.current = true
      return null
    }
    const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot(args?.sourceFilesSnapshot)
    if (!hasWorkspaceRematerializeCandidates(sourceFilesSnapshot)) {
      workspaceMaterializeQueuedRef.current = true
      return null
    }
    const op = String(detail?.op || '')
    if (!op) return null
    const changedPath = String(detail?.path || '').trim()
    if (op !== 'ensureSeed' && op !== 'batch' && op !== 'writeFileText' && op !== 'createFile' && op !== 'deleteEntry') {
      return null
    }
    if (op === 'ensureSeed' && !changedPath) {
      const preparedRequest = pendingEnsureSeedMutationRequestRef.current
      if (preparedRequest) {
        pendingEnsureSeedMutationRequestRef.current = null
        return preparedRequest
      }
    }
    return {
      op,
      changedPath,
      sourceFilesSnapshot,
      activePathRequest: args?.activePathRequest === undefined
        ? resolveActivePathMaterializationRequest({
            sourceFilesSnapshot,
            workspaceEntriesSnapshot: reusableWorkspaceEntriesRef.current,
          })
        : args.activePathRequest,
    }
  }, [hasWorkspaceRematerializeCandidates, readCallerOwnedSourceFilesSnapshot, resolveActivePathMaterializationRequest, reusableWorkspaceEntriesRef, workspaceHydratedRef])
  const handleWorkspaceFsMutation = React.useCallback((request: WorkspaceFsMutationRequest) => {
    if (request.op === 'batch' || (request.op === 'ensureSeed' && !request.changedPath)) {
      invalidateCachedWorkspaceActiveEntrySnapshot()
    } else if (request.changedPath) {
      invalidateCachedWorkspaceActiveEntrySnapshot(request.changedPath)
    }
    reusableWorkspaceSourcesByPathRef.current = null
    if (isWebsiteImportExplorerUpdate(request.changedPath)) return
    const activePath = request.activePathRequest?.activePath || ''
    if ((request.op === 'writeFileText' || request.op === 'batch') && !!request.changedPath && !!activePath && request.changedPath === activePath) {
      return
    }
    if (workspaceSourceFilesDocsOnly) {
      const hasPath = !!request.changedPath
      const isSourceRootPath = hasPath && isWorkspaceSourceRootMutationPath(request.changedPath)
      if (hasPath && !isSourceRootPath) return
    }
    if (request.op === 'ensureSeed') {
      const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot()
      const finishSeedSyncTask = beginWorkspaceSeedSyncTask()
      if (finishSeedSyncTask) {
        void materializeActiveWorkspaceEntryIntoSourceFiles({
          activePathOverride: request.activePathRequest?.activePath,
          fs: reusableWorkspaceFsRef.current || undefined,
          sourceFilesSnapshot,
          sourcesByPath: readReusableWorkspaceSourceIndexSnapshot(),
          refreshActiveText: true,
        }).catch(() => {
          void 0
        }).finally(finishSeedSyncTask)
      }
    }
    markWorkspaceSeedSyncDebug(`workspace-fs:${request.op}`)
    scheduleWorkspaceRematerializeRef.current?.({ sourceFilesSnapshot: request.sourceFilesSnapshot })
  }, [isWorkspaceSourceRootMutationPath, markWorkspaceSeedSyncDebug, readCallerOwnedSourceFilesSnapshot, readReusableWorkspaceSourceIndexSnapshot, reusableWorkspaceFsRef, reusableWorkspaceSourcesByPathRef, workspaceSourceFilesDocsOnly])

  const prepareEnsureSeedMutationRequest = React.useCallback((args?: {
    sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  }): WorkspaceFsMutationRequest | null => {
    const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot(args?.sourceFilesSnapshot)
    const activePathRequest = resolveActivePathMaterializationRequest({
      sourceFilesSnapshot,
      workspaceEntriesSnapshot: reusableWorkspaceEntriesRef.current,
    })
    pendingEnsureSeedMutationRequestRef.current = null
    const request = resolveWorkspaceFsMutationRequest(
      { op: 'ensureSeed' },
      { sourceFilesSnapshot, activePathRequest },
    )
    pendingEnsureSeedMutationRequestRef.current = request
    return request
  }, [readCallerOwnedSourceFilesSnapshot, resolveActivePathMaterializationRequest, resolveWorkspaceFsMutationRequest, reusableWorkspaceEntriesRef])

  const clearPreparedEnsureSeedMutationRequest = React.useCallback(() => {
    pendingEnsureSeedMutationRequestRef.current = null
  }, [])

  const applyPreparedWorkspaceSeedSyncRequest = React.useCallback((request: PreparedWorkspaceSeedSyncRequest) => {
    markWorkspaceSeedSyncDebug(request.source)
    prepareEnsureSeedMutationRequest({
      sourceFilesSnapshot: request.sourceFilesSnapshot,
    })
  }, [markWorkspaceSeedSyncDebug, prepareEnsureSeedMutationRequest])

  const readActivePathMaterializationSelection = React.useCallback((
    state?: ReturnType<typeof useMarkdownExplorerStore.getState>,
  ): ActivePathMaterializationSelection => {
    const snapshot = state || useMarkdownExplorerStore.getState()
    return {
      activePathSnapshot: snapshot.activePath ?? null,
      sourceFilesSnapshot: latestSourceFilesSnapshotRef.current,
      workspaceEntriesSnapshot: reusableWorkspaceEntriesRef.current,
    }
  }, [latestSourceFilesSnapshotRef, reusableWorkspaceEntriesRef])

  const subscribeWorkspaceFsRuntime = React.useCallback(() => {
    scheduleWorkspaceRematerializeRef.current = request => {
      if (request) {
        scheduleWorkspaceRematerializeRequest(request)
        return
      }
      scheduleWorkspaceRematerialize()
    }
    lastWorkspaceEntriesSignatureRef.current = ''
    lastWorkspaceMaterializationProofRef.current = null
    scheduleWorkspaceRematerialize()
    const unsubscribe = subscribeWorkspaceFsChanged(detail => {
      const request = resolveWorkspaceFsMutationRequest(detail)
      if (!request) return
      handleWorkspaceFsMutation(request)
    })
    const unsubscribeWorkspaceSeedSyncResumed =
      workspaceRematerializeSeedSyncScheduler.subscribeResume()
    return () => {
      if (scheduleWorkspaceRematerializeRef.current) {
        scheduleWorkspaceRematerializeRef.current = null
      }
      unsubscribe()
      unsubscribeWorkspaceSeedSyncResumed()
      workspaceRematerializeSeedSyncScheduler.cleanup()
    }
  }, [handleWorkspaceFsMutation, resolveWorkspaceFsMutationRequest, scheduleWorkspaceRematerialize, scheduleWorkspaceRematerializeRequest, workspaceRematerializeSeedSyncScheduler])

  const subscribeActiveWorkspacePath = React.useCallback(() => {
    let lastObservedActivePath = useMarkdownExplorerStore.getState().activePath
    const syncForActivePathSelection = (selection: ActivePathMaterializationSelection) => {
      syncActivePathMaterialization({
        activePathSnapshot: selection.activePathSnapshot,
        sourceFilesSnapshot: selection.sourceFilesSnapshot,
        workspaceEntriesSnapshot: selection.workspaceEntriesSnapshot,
      })
    }
    const unsubscribeActivePath = useMarkdownExplorerStore.subscribe(state => {
      const activePath = state.activePath
      if (Object.is(activePath, lastObservedActivePath)) return
      lastObservedActivePath = activePath
      syncForActivePathSelection(readActivePathMaterializationSelection(state))
    })
    return () => {
      unsubscribeActivePath()
    }
  }, [readActivePathMaterializationSelection, syncActivePathMaterialization])

  return { resolveWorkspaceRematerializeRequest, resolveActivePathMaterializationRequest, shouldSkipActivePathMaterializationRequest, workspaceRematerializeSeedSyncScheduler, scheduleWorkspaceRematerializeRef, prepareEnsureSeedMutationRequest, clearPreparedEnsureSeedMutationRequest, applyPreparedWorkspaceSeedSyncRequest, subscribeWorkspaceFsRuntime, subscribeActiveWorkspacePath }
}
