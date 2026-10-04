import React from 'react'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { computeWorkspaceSeedSyncNextDelayMs } from '@/lib/workspace/workspaceSeedSyncBackoff'
import { beginWorkspaceSeedSyncTask } from '@/lib/workspace/workspaceSeedSyncRuntime'
import {
  WorkspaceFsMutationRequest, WorkspaceSeedSyncRequest, PreparedWorkspaceSeedSyncRequest,
  WorkspaceSeedSyncLifecycleState, SourceFilesSnapshot, SourceFilesSnapshotReader,
} from '@/features/source-files/sourceFilesPersistenceContracts'

const WORKSPACE_SEED_SYNC_POLL_REQUEST: WorkspaceSeedSyncRequest = { source: 'bootstrap:poll' }
const WORKSPACE_SEED_SYNC_WAKE_REQUEST: WorkspaceSeedSyncRequest = { source: 'bootstrap:wake' }
const WORKSPACE_SEED_SYNC_MOUNT_REQUEST: WorkspaceSeedSyncRequest = { source: 'bootstrap:mount' }

type SeedSyncInputs = {
  workspaceSeedSyncEnabled: boolean
  workspaceSeedSyncPollMs: number
  workspaceSeedSyncIdleMaxMs: number
  workspaceSourceFilesDocsOnly: boolean
  readCallerOwnedSourceFilesSnapshot: SourceFilesSnapshotReader
  readReusableWorkspaceFs: () => Promise<Awaited<ReturnType<typeof getWorkspaceFs>>>
  prepareEnsureSeedMutationRequest: (args?: { sourceFilesSnapshot?: SourceFilesSnapshot }) => WorkspaceFsMutationRequest | null
  clearPreparedEnsureSeedMutationRequest: () => void
  applyPreparedWorkspaceSeedSyncRequest: (request: PreparedWorkspaceSeedSyncRequest) => void
}

export function useSourceFilesSeedSync({
  workspaceSeedSyncEnabled, workspaceSeedSyncPollMs, workspaceSeedSyncIdleMaxMs,
  workspaceSourceFilesDocsOnly, readCallerOwnedSourceFilesSnapshot, readReusableWorkspaceFs,
  prepareEnsureSeedMutationRequest, clearPreparedEnsureSeedMutationRequest, applyPreparedWorkspaceSeedSyncRequest
}: SeedSyncInputs) {
  const resolvePreparedWorkspaceSeedSyncRequest = React.useCallback((
    request: WorkspaceSeedSyncRequest,
  ): PreparedWorkspaceSeedSyncRequest => ({
    source: String(request.source || '').trim(),
    sourceFilesSnapshot: readCallerOwnedSourceFilesSnapshot(),
  }), [readCallerOwnedSourceFilesSnapshot])

  const clearWorkspaceSeedSyncTimer = React.useCallback((lifecycleState: WorkspaceSeedSyncLifecycleState) => {
    if (lifecycleState.timer == null) return
    window.clearTimeout(lifecycleState.timer)
    lifecycleState.timer = null
  }, [])

  const resetWorkspaceSeedSyncWakeLifecycle = React.useCallback((lifecycleState: WorkspaceSeedSyncLifecycleState) => {
    lifecycleState.idleStreak = 0
    clearWorkspaceSeedSyncTimer(lifecycleState)
  }, [clearWorkspaceSeedSyncTimer])

  const scheduleNextWorkspaceSeedSync = React.useCallback((args: {
    changed: boolean
    nextRequest: WorkspaceSeedSyncRequest
    lifecycleState: WorkspaceSeedSyncLifecycleState
    runWorkspaceSeedSync: (request: WorkspaceSeedSyncRequest) => void
  }) => {
    const { lifecycleState } = args
    const next = computeWorkspaceSeedSyncNextDelayMs({
      basePollMs: workspaceSeedSyncPollMs,
      idleMaxMs: workspaceSeedSyncIdleMaxMs,
      docsOnly: workspaceSourceFilesDocsOnly,
      changed: args.changed,
      idleStreak: lifecycleState.idleStreak,
    })
    lifecycleState.idleStreak = next.nextIdleStreak
    if (lifecycleState.cancelled) return
    lifecycleState.timer = window.setTimeout(() => {
      lifecycleState.timer = null
      args.runWorkspaceSeedSync(args.nextRequest)
    }, next.nextDelayMs)
  }, [workspaceSeedSyncIdleMaxMs, workspaceSeedSyncPollMs, workspaceSourceFilesDocsOnly])

  const scheduleNextWorkspaceSeedSyncPoll = React.useCallback((args: {
    changed: boolean
    lifecycleState: WorkspaceSeedSyncLifecycleState
    runWorkspaceSeedSync: (request: WorkspaceSeedSyncRequest) => void
  }) => {
    scheduleNextWorkspaceSeedSync({
      changed: args.changed,
      nextRequest: WORKSPACE_SEED_SYNC_POLL_REQUEST,
      lifecycleState: args.lifecycleState,
      runWorkspaceSeedSync: args.runWorkspaceSeedSync,
    })
  }, [scheduleNextWorkspaceSeedSync])

  const handleWorkspaceSeedSyncRequestSuccess = React.useCallback((args: {
    changed: boolean
    preparedRequest: PreparedWorkspaceSeedSyncRequest
    lifecycleState: WorkspaceSeedSyncLifecycleState
    runWorkspaceSeedSync: (request: WorkspaceSeedSyncRequest) => void
  }) => {
    if (args.changed) {
      applyPreparedWorkspaceSeedSyncRequest(args.preparedRequest)
    }
    scheduleNextWorkspaceSeedSyncPoll({
      changed: args.changed,
      lifecycleState: args.lifecycleState,
      runWorkspaceSeedSync: args.runWorkspaceSeedSync,
    })
  }, [applyPreparedWorkspaceSeedSyncRequest, scheduleNextWorkspaceSeedSyncPoll])

  const handleWorkspaceSeedSyncRequestFailure = React.useCallback((args: {
    lifecycleState: WorkspaceSeedSyncLifecycleState
    runWorkspaceSeedSync: (request: WorkspaceSeedSyncRequest) => void
  }) => {
    clearPreparedEnsureSeedMutationRequest()
    scheduleNextWorkspaceSeedSyncPoll({
      changed: false,
      lifecycleState: args.lifecycleState,
      runWorkspaceSeedSync: args.runWorkspaceSeedSync,
    })
  }, [clearPreparedEnsureSeedMutationRequest, scheduleNextWorkspaceSeedSyncPoll])

  const cleanupWorkspaceSeedSyncLifecycle = React.useCallback((lifecycleState: WorkspaceSeedSyncLifecycleState) => {
    lifecycleState.cancelled = true
    clearPreparedEnsureSeedMutationRequest()
    clearWorkspaceSeedSyncTimer(lifecycleState)
  }, [clearPreparedEnsureSeedMutationRequest, clearWorkspaceSeedSyncTimer])

  const subscribeWorkspaceSeedSync = React.useCallback(() => {
    if (!workspaceSeedSyncEnabled) return
    const lifecycleState: WorkspaceSeedSyncLifecycleState = {
      cancelled: false,
      timer: null,
      idleStreak: 0,
    }
    const runWorkspaceSeedSync = async (request: WorkspaceSeedSyncRequest) => {
      if (lifecycleState.cancelled) return
      const runNextWorkspaceSeedSync = (nextRequest: WorkspaceSeedSyncRequest) => {
        void runWorkspaceSeedSync(nextRequest)
      }
      const finishSeedSyncTask = beginWorkspaceSeedSyncTask()
      if (!finishSeedSyncTask) {
        scheduleNextWorkspaceSeedSyncPoll({
          changed: false,
          lifecycleState,
          runWorkspaceSeedSync: runNextWorkspaceSeedSync,
        })
        return
      }
      try {
        const preparedRequest = resolvePreparedWorkspaceSeedSyncRequest(request)
        const fs = await readReusableWorkspaceFs()
        const changed = await fs.ensureSeed()
        handleWorkspaceSeedSyncRequestSuccess({
          changed,
          preparedRequest,
          lifecycleState,
          runWorkspaceSeedSync: runNextWorkspaceSeedSync,
        })
      } catch {
        handleWorkspaceSeedSyncRequestFailure({
          lifecycleState,
          runWorkspaceSeedSync: runNextWorkspaceSeedSync,
        })
      } finally {
        finishSeedSyncTask()
      }
    }
    const handleWorkspaceSeedSyncWake = () => {
      if (document.visibilityState === 'hidden') return
      resetWorkspaceSeedSyncWakeLifecycle(lifecycleState)
      void runWorkspaceSeedSync(WORKSPACE_SEED_SYNC_WAKE_REQUEST)
    }
    void runWorkspaceSeedSync(WORKSPACE_SEED_SYNC_MOUNT_REQUEST)
    window.addEventListener('focus', handleWorkspaceSeedSyncWake)
    document.addEventListener('visibilitychange', handleWorkspaceSeedSyncWake)
    return () => {
      cleanupWorkspaceSeedSyncLifecycle(lifecycleState)
      window.removeEventListener('focus', handleWorkspaceSeedSyncWake)
      document.removeEventListener('visibilitychange', handleWorkspaceSeedSyncWake)
    }
  }, [workspaceSeedSyncEnabled, scheduleNextWorkspaceSeedSyncPoll, resolvePreparedWorkspaceSeedSyncRequest, readReusableWorkspaceFs, handleWorkspaceSeedSyncRequestSuccess, handleWorkspaceSeedSyncRequestFailure, resetWorkspaceSeedSyncWakeLifecycle, cleanupWorkspaceSeedSyncLifecycle])

  return subscribeWorkspaceSeedSync
}
