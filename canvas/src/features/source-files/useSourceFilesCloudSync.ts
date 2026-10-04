import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { scheduleWorkspaceSyncTask, cancelWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import { WORKSPACE_SYNC_TASK_AGENTIC_OS_STORAGE_QUEUE } from '@/lib/async/workspaceSyncKeys'
import { areSourceFilesWorkspaceStatesEqual, normalizeSourceFilesWorkspaceState, type SourceFilesWorkspaceState } from '@/features/source-files/sourceFilesWorkspaceState'
import { buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState, buildSourceFilesStorageSyncSignature } from '@/features/source-files/sourceFilesStorageSync'
import { type AgenticGraphStorageRuntimeDependencies } from '@/features/source-files/source-files-agentic-graph-storage-runtime'
import {
  createAgenticGraphStorageCurrentOwnershipHandler, createAgenticGraphStorageLatestOperationRunner, createAgenticGraphStorageOperationTracker,
  createAgenticGraphStorageWorkspaceLifecycle, type AgenticGraphStorageWorkspaceOwnership,
} from '@/features/source-files/source-files-agentic-graph-storage-lifecycle'
import type { AgenticGraphStoragePulledChangesApplyArgs } from '@/lib/storage/agentic-graph-storage-client-types'
import { readAgenticGraphStorageRuntimeSyncEnabled } from '@/features/source-files/source-files-agentic-graph-storage-settings'
import {
  SOURCE_FILES_PERSIST_DELAY_MS, AgenticGraphStorageQueueRequest, AgenticGraphStorageOwnedQueueRequest,
  AgenticGraphStorageWorkspaceRequest, AgenticGraphStorageWorkspaceSelection, AgenticGraphStorageQueueSyncFollowUpRequest,
  SourceFilesSnapshot, SourceFilesSnapshotReader, SourceFilesCloudQueueRunner,
} from '@/features/source-files/sourceFilesPersistenceContracts'

const readCurrentSourceFilesWorkspaceState = (): SourceFilesWorkspaceState =>
  normalizeSourceFilesWorkspaceState({
    folderName: useGraphStore.getState().localMarkdownFolderName,
    accessMode: useGraphStore.getState().localMarkdownFolderAccessMode,
    folderCacheId: useGraphStore.getState().localMarkdownFolderCacheId,
    selectedFolderPath: useGraphStore.getState().localMarkdownSelectedFolderPath,
  })

type CloudSyncInputs = {
  workspaceCloudSyncEnabled: boolean
  agenticGraphStorageScopeKey: string
  readCallerOwnedSourceFilesSnapshot: SourceFilesSnapshotReader
  latestSourceFilesSnapshotRef: React.MutableRefObject<SourceFilesSnapshot>
  lastQueuedAgenticGraphStorageSignatureRef: React.MutableRefObject<string>
  lastQueuedAgenticGraphStorageSourceFilesRef: React.MutableRefObject<SourceFilesSnapshot>
  activeAgenticGraphWorkspaceIdRef: React.MutableRefObject<string>
  agenticGraphInboundApplyOperations: ReturnType<typeof createAgenticGraphStorageOperationTracker>
  agenticGraphStorageQueueOperations: ReturnType<typeof createAgenticGraphStorageLatestOperationRunner<AgenticGraphStorageOwnedQueueRequest>>
  agenticGraphStorageWorkspaceLifecycle: ReturnType<typeof createAgenticGraphStorageWorkspaceLifecycle>
  ensureAgenticGraphStorageRuntimeDependencies: (ownership?: AgenticGraphStorageWorkspaceOwnership | null) => Promise<AgenticGraphStorageRuntimeDependencies>
  runAgenticGraphStorageQueueRequest: SourceFilesCloudQueueRunner
}

export function useSourceFilesCloudSync({
  workspaceCloudSyncEnabled, agenticGraphStorageScopeKey, readCallerOwnedSourceFilesSnapshot,
  latestSourceFilesSnapshotRef, lastQueuedAgenticGraphStorageSignatureRef, lastQueuedAgenticGraphStorageSourceFilesRef,
  activeAgenticGraphWorkspaceIdRef, agenticGraphInboundApplyOperations, agenticGraphStorageQueueOperations,
  agenticGraphStorageWorkspaceLifecycle, ensureAgenticGraphStorageRuntimeDependencies, runAgenticGraphStorageQueueRequest
}: CloudSyncInputs) {
  const pendingAgenticGraphStorageQueueRequestRef = React.useRef<AgenticGraphStorageQueueRequest | null>(null)
  const agenticGraphStorageLoopCleanupRef = React.useRef<(() => void) | null>(null)
  const readAgenticGraphStorageWorkspaceId = React.useCallback((args?: {
    workspaceId?: string
    workspaceState?: SourceFilesWorkspaceState
  }): string => (
    String(args?.workspaceId || '').trim()
    || activeAgenticGraphWorkspaceIdRef.current
    || buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState(args?.workspaceState || readCurrentSourceFilesWorkspaceState())
  ), [activeAgenticGraphWorkspaceIdRef])

  const readAgenticGraphStorageSyncSignature = React.useCallback((args: {
    sourceFilesSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
    storageSyncSignature?: string
  }): string => (
    String(args.storageSyncSignature || '').trim()
    || buildSourceFilesStorageSyncSignature(args.sourceFilesSnapshot)
  ), [])

  const resolveAgenticGraphStorageQueueRequest = React.useCallback((args?: {
    workspaceId?: string
    workspaceState?: SourceFilesWorkspaceState
    sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
    storageSyncSignature?: string
  }): AgenticGraphStorageQueueRequest | null => {
    const workspaceId = readAgenticGraphStorageWorkspaceId({
      workspaceId: args?.workspaceId,
      workspaceState: args?.workspaceState,
    })
    if (!workspaceId) return null
    const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot(args?.sourceFilesSnapshot)
    const storageSyncSignature = readAgenticGraphStorageSyncSignature({
      sourceFilesSnapshot,
      storageSyncSignature: args?.storageSyncSignature,
    })
    return {
      workspaceId,
      sourceFilesSnapshot,
      signature: `${workspaceId}:${storageSyncSignature}`,
    }
  }, [readCallerOwnedSourceFilesSnapshot, readAgenticGraphStorageSyncSignature, readAgenticGraphStorageWorkspaceId])

  const rememberAgenticGraphStorageQueuedSnapshot = React.useCallback((request: AgenticGraphStorageQueueRequest) => {
    lastQueuedAgenticGraphStorageSignatureRef.current = request.signature
    lastQueuedAgenticGraphStorageSourceFilesRef.current = request.sourceFilesSnapshot
  }, [lastQueuedAgenticGraphStorageSignatureRef, lastQueuedAgenticGraphStorageSourceFilesRef])

  const applyAgenticGraphStorageQueueTransition = React.useCallback((args?: {
    workspaceId?: string
    workspaceState?: SourceFilesWorkspaceState
    sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  }): AgenticGraphStorageQueueRequest | null => {
    const request = resolveAgenticGraphStorageQueueRequest(args)
    if (!request) return null
    rememberAgenticGraphStorageQueuedSnapshot(request)
    return request
  }, [rememberAgenticGraphStorageQueuedSnapshot, resolveAgenticGraphStorageQueueRequest])

  const clearAgenticGraphStorageQueueState = React.useCallback(() => {
    pendingAgenticGraphStorageQueueRequestRef.current = null
    agenticGraphStorageQueueOperations.clearPending()
    lastQueuedAgenticGraphStorageSignatureRef.current = ''
    lastQueuedAgenticGraphStorageSourceFilesRef.current = []
  }, [agenticGraphStorageQueueOperations, lastQueuedAgenticGraphStorageSignatureRef, lastQueuedAgenticGraphStorageSourceFilesRef])

  const handleAgenticGraphStorageSyncCompleted = React.useCallback((result: {
    workspaceId: string
  }) => {
    if (activeAgenticGraphWorkspaceIdRef.current !== result.workspaceId) return
    const ownership = agenticGraphStorageWorkspaceLifecycle.readOwnership()
    if (!ownership) return
    const deps = agenticGraphStorageWorkspaceLifecycle.readDependencies()
    if (deps) {
      deps.notifyAgenticGraphStorageConflictUx(result as Parameters<AgenticGraphStorageRuntimeDependencies['notifyAgenticGraphStorageConflictUx']>[0])
      return
    }
    void ensureAgenticGraphStorageRuntimeDependencies(ownership).then(runtimeDeps => {
      if (!agenticGraphStorageWorkspaceLifecycle.isCurrent(ownership)) return
      if (activeAgenticGraphWorkspaceIdRef.current !== result.workspaceId) return
      runtimeDeps.notifyAgenticGraphStorageConflictUx(result as Parameters<AgenticGraphStorageRuntimeDependencies['notifyAgenticGraphStorageConflictUx']>[0])
    }).catch(() => undefined)
  }, [activeAgenticGraphWorkspaceIdRef, agenticGraphStorageWorkspaceLifecycle, ensureAgenticGraphStorageRuntimeDependencies])

  const createAgenticGraphStoragePulledChangesHandler = React.useCallback((
    ownership: AgenticGraphStorageWorkspaceOwnership,
  ) => createAgenticGraphStorageCurrentOwnershipHandler(
    agenticGraphStorageWorkspaceLifecycle,
    ownership,
    async (args: AgenticGraphStoragePulledChangesApplyArgs) => {
      if (activeAgenticGraphWorkspaceIdRef.current !== args.workspaceId) return
      if (!readAgenticGraphStorageRuntimeSyncEnabled()) return
      const deps = agenticGraphStorageWorkspaceLifecycle.readDependencies()
      if (!deps) return
      const operation = agenticGraphInboundApplyOperations.begin()
      try {
        const result = deps.applyPulledAgenticGraphStorageChangesToSourceFiles({
          workspaceId: args.workspaceId,
          changes: args.changes,
          signal: args.signal,
          taskContext: args.taskContext,
        })
        if (result.applied) {
          applyAgenticGraphStorageQueueTransition({
            workspaceId: args.workspaceId,
            sourceFilesSnapshot: result.sourceFilesSnapshot,
          })
        }
        await result.completion
      } finally {
        agenticGraphInboundApplyOperations.finish(operation)
      }
    },
  ), [agenticGraphStorageWorkspaceLifecycle, activeAgenticGraphWorkspaceIdRef, agenticGraphInboundApplyOperations, applyAgenticGraphStorageQueueTransition])

  const resolveAgenticGraphStorageQueueSyncFollowUpRequest = React.useCallback((args: {
    request: AgenticGraphStorageQueueRequest
    queuedMutationCount: number
  }): AgenticGraphStorageQueueSyncFollowUpRequest | null => {
    const { request, queuedMutationCount } = args
    if (queuedMutationCount <= 0) return null
    if (!readAgenticGraphStorageRuntimeSyncEnabled() || !workspaceCloudSyncEnabled) return null
    return {
      workspaceId: request.workspaceId,
      delayMs: 0,
      signature: `${request.signature}:${queuedMutationCount}`,
    }
  }, [workspaceCloudSyncEnabled])

  const runAgenticGraphStorageQueueSyncFollowUpRequest = React.useCallback((request: AgenticGraphStorageQueueSyncFollowUpRequest) => {
    const ownership = agenticGraphStorageWorkspaceLifecycle.readOwnership()
    if (!ownership) return
    void ensureAgenticGraphStorageRuntimeDependencies(ownership).then(deps => {
      if (!agenticGraphStorageWorkspaceLifecycle.isCurrent(ownership)) return
      deps.scheduleAgenticGraphStorageSync({
        workspaceId: request.workspaceId,
        delayMs: request.delayMs,
        signature: request.signature,
        signal: ownership.signal,
        onSyncCompleted: handleAgenticGraphStorageSyncCompleted,
        onPulledChangesApplied: createAgenticGraphStoragePulledChangesHandler(ownership),
      })
    }).catch(() => undefined)
  }, [createAgenticGraphStoragePulledChangesHandler, ensureAgenticGraphStorageRuntimeDependencies, handleAgenticGraphStorageSyncCompleted, agenticGraphStorageWorkspaceLifecycle])

  const scheduleAgenticGraphStorageQueueSyncFollowUp = React.useCallback((args: {
    request: AgenticGraphStorageQueueRequest
    queuedMutationCount: number
  }) => {
    const request = resolveAgenticGraphStorageQueueSyncFollowUpRequest(args)
    if (!request) return
    runAgenticGraphStorageQueueSyncFollowUpRequest(request)
  }, [resolveAgenticGraphStorageQueueSyncFollowUpRequest, runAgenticGraphStorageQueueSyncFollowUpRequest])

  const handleAgenticGraphStorageQueueRequestSuccess = React.useCallback((args: {
    request: AgenticGraphStorageQueueRequest
    queuedMutationCount: number
  }) => {
    const { request, queuedMutationCount } = args
    rememberAgenticGraphStorageQueuedSnapshot(request)
    scheduleAgenticGraphStorageQueueSyncFollowUp({
      request,
      queuedMutationCount,
    })
  }, [rememberAgenticGraphStorageQueuedSnapshot, scheduleAgenticGraphStorageQueueSyncFollowUp])

  const handleAgenticGraphStorageQueueRequestFailure = React.useCallback((request: AgenticGraphStorageQueueRequest) => {
    if (lastQueuedAgenticGraphStorageSignatureRef.current === request.signature) {
      lastQueuedAgenticGraphStorageSignatureRef.current = ''
    }
  }, [lastQueuedAgenticGraphStorageSignatureRef])

  const drainAgenticGraphStorageQueueRequest = React.useCallback(() => {
    const nextRequest = pendingAgenticGraphStorageQueueRequestRef.current
    pendingAgenticGraphStorageQueueRequestRef.current = null
    if (!nextRequest) return
    runAgenticGraphStorageQueueRequest(nextRequest, handleAgenticGraphStorageQueueRequestSuccess, handleAgenticGraphStorageQueueRequestFailure)
  }, [runAgenticGraphStorageQueueRequest, handleAgenticGraphStorageQueueRequestSuccess, handleAgenticGraphStorageQueueRequestFailure])

  const scheduleAgenticGraphStorageQueueRequest = React.useCallback((request: AgenticGraphStorageQueueRequest | null) => {
    if (!request) return
    if (lastQueuedAgenticGraphStorageSignatureRef.current === request.signature) return
    if (pendingAgenticGraphStorageQueueRequestRef.current?.signature === request.signature) return
    pendingAgenticGraphStorageQueueRequestRef.current = request
    const taskKey = WORKSPACE_SYNC_TASK_AGENTIC_OS_STORAGE_QUEUE
    scheduleWorkspaceSyncTask(
      taskKey,
      drainAgenticGraphStorageQueueRequest,
      SOURCE_FILES_PERSIST_DELAY_MS,
      { signature: request.signature, scopeKey: agenticGraphStorageScopeKey },
    )
  }, [lastQueuedAgenticGraphStorageSignatureRef, drainAgenticGraphStorageQueueRequest, agenticGraphStorageScopeKey])

  const readAgenticGraphStorageWorkspaceSelection = React.useCallback((
    state?: ReturnType<typeof useGraphStore.getState>,
  ): AgenticGraphStorageWorkspaceSelection => {
    const snapshot = state || useGraphStore.getState()
    return {
      workspaceState: normalizeSourceFilesWorkspaceState({
        folderName: snapshot.localMarkdownFolderName,
        accessMode: snapshot.localMarkdownFolderAccessMode,
        folderCacheId: snapshot.localMarkdownFolderCacheId,
        selectedFolderPath: snapshot.localMarkdownSelectedFolderPath,
      }),
      sourceFilesSnapshot: latestSourceFilesSnapshotRef.current,
    }
  }, [latestSourceFilesSnapshotRef])

  const resolveAgenticGraphStorageWorkspaceRequest = React.useCallback((args: {
    workspaceState: SourceFilesWorkspaceState
    sourceFilesSnapshot?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  }): AgenticGraphStorageWorkspaceRequest | null => {
    const workspaceId = readAgenticGraphStorageWorkspaceId({
      workspaceState: args.workspaceState,
    })
    if (!workspaceId) return null
    const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot(args.sourceFilesSnapshot)
    const storageSyncSignature = readAgenticGraphStorageSyncSignature({
      sourceFilesSnapshot,
    })
    return {
      workspaceId,
      workspaceState: args.workspaceState,
      sourceFilesSnapshot,
      initialQueueRequest: resolveAgenticGraphStorageQueueRequest({
        workspaceId,
        workspaceState: args.workspaceState,
        sourceFilesSnapshot,
        storageSyncSignature,
      }),
    }
  }, [readCallerOwnedSourceFilesSnapshot, readAgenticGraphStorageSyncSignature, readAgenticGraphStorageWorkspaceId, resolveAgenticGraphStorageQueueRequest])

  const stopAgenticGraphStorageWorkspaceRuntime = React.useCallback((args?: {
    clearActiveWorkspaceId?: boolean
  }) => {
    const workspaceId = activeAgenticGraphWorkspaceIdRef.current
    const deps = agenticGraphStorageWorkspaceLifecycle.readDependencies()
    agenticGraphStorageWorkspaceLifecycle.stop()
    cancelWorkspaceSyncTask(WORKSPACE_SYNC_TASK_AGENTIC_OS_STORAGE_QUEUE)
    if (agenticGraphStorageLoopCleanupRef.current) {
      agenticGraphStorageLoopCleanupRef.current()
      agenticGraphStorageLoopCleanupRef.current = null
    }
    if (workspaceId && deps) deps.cancelAgenticGraphStorageSync(workspaceId)
    if (args?.clearActiveWorkspaceId !== false) {
      activeAgenticGraphWorkspaceIdRef.current = ''
    }
    clearAgenticGraphStorageQueueState()
  }, [activeAgenticGraphWorkspaceIdRef, agenticGraphStorageWorkspaceLifecycle, clearAgenticGraphStorageQueueState])

  const startAgenticGraphStorageWorkspaceRuntime = React.useCallback((request: AgenticGraphStorageWorkspaceRequest) => {
    const ownership = agenticGraphStorageWorkspaceLifecycle.begin()
    void ensureAgenticGraphStorageRuntimeDependencies(ownership).then(deps => {
      if (!agenticGraphStorageWorkspaceLifecycle.isCurrent(ownership)) return
      if (!readAgenticGraphStorageRuntimeSyncEnabled()) return
      agenticGraphStorageLoopCleanupRef.current = deps.startAgenticGraphStorageSyncLoop({
        workspaceId: request.workspaceId,
        baseUrl: deps.baseUrl,
        initialDelayMs: 0,
        signal: ownership.signal,
        onSyncCompleted: handleAgenticGraphStorageSyncCompleted,
        onPulledChangesApplied: createAgenticGraphStoragePulledChangesHandler(ownership),
      })
    }).catch(() => undefined)
  }, [
    ensureAgenticGraphStorageRuntimeDependencies,
    createAgenticGraphStoragePulledChangesHandler,
    handleAgenticGraphStorageSyncCompleted,
    agenticGraphStorageWorkspaceLifecycle,
  ])

  const applyAgenticGraphStorageWorkspaceRequest = React.useCallback((request: AgenticGraphStorageWorkspaceRequest) => {
    if (activeAgenticGraphWorkspaceIdRef.current === request.workspaceId) return
    stopAgenticGraphStorageWorkspaceRuntime({
      clearActiveWorkspaceId: false,
    })
    activeAgenticGraphWorkspaceIdRef.current = request.workspaceId
    startAgenticGraphStorageWorkspaceRuntime(request)
    scheduleAgenticGraphStorageQueueRequest(request.initialQueueRequest)
  }, [activeAgenticGraphWorkspaceIdRef, scheduleAgenticGraphStorageQueueRequest, startAgenticGraphStorageWorkspaceRuntime, stopAgenticGraphStorageWorkspaceRuntime])
  const subscribeCloudWorkspace = React.useCallback(() => {
    if (!readAgenticGraphStorageRuntimeSyncEnabled() || !workspaceCloudSyncEnabled) {
      stopAgenticGraphStorageWorkspaceRuntime()
      return
    }
    const startForWorkspaceSelection = (selection: AgenticGraphStorageWorkspaceSelection) => {
      const request = resolveAgenticGraphStorageWorkspaceRequest({
        workspaceState: selection.workspaceState,
        sourceFilesSnapshot: selection.sourceFilesSnapshot,
      })
      if (!request) {
        stopAgenticGraphStorageWorkspaceRuntime()
        return
      }
      applyAgenticGraphStorageWorkspaceRequest(request)
    }
    startForWorkspaceSelection(readAgenticGraphStorageWorkspaceSelection())
    const unsubscribe = useGraphStore.subscribe(
      s => readAgenticGraphStorageWorkspaceSelection(s),
      selection => {
        startForWorkspaceSelection(selection)
      },
      {
        equalityFn: (left, right) => areSourceFilesWorkspaceStatesEqual(left?.workspaceState, right?.workspaceState),
      },
    )
    return () => {
      unsubscribe()
      stopAgenticGraphStorageWorkspaceRuntime()
    }
  }, [
    applyAgenticGraphStorageWorkspaceRequest,
    readAgenticGraphStorageWorkspaceSelection,
    resolveAgenticGraphStorageWorkspaceRequest,
    stopAgenticGraphStorageWorkspaceRuntime,
    workspaceCloudSyncEnabled,
  ])

  return { readAgenticGraphStorageSyncSignature, resolveAgenticGraphStorageQueueRequest, scheduleAgenticGraphStorageQueueRequest, subscribeCloudWorkspace }
}
