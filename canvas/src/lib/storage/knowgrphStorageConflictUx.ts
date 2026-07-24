import { useGraphStore } from '@/hooks/useGraphStore'
import type { KnowgrphStorageSyncRunResult } from '@/lib/storage/knowgrphStorageClientSync'
import {
  buildKnowgrphStorageConflictAcceptRemoteActionId,
  buildKnowgrphStorageConflictKeepLocalActionId,
  buildKnowgrphStorageConflictReviewLogActionId,
} from '@/lib/storage/knowgrphStorageConflictActions'

const CONFLICT_TOAST_ID_PREFIX = 'knowgrph-storage-conflict'
const loggedConflictIdsByWorkspace = new Map<string, Set<string>>()
const loggedTransportErrorByWorkspace = new Map<string, string>()
const loggedEngineIssueIds = new Set<string>()

const normalizeString = (value: unknown): string => String(value || '').trim()

const buildConflictToastId = (workspaceId: string): string =>
  `${CONFLICT_TOAST_ID_PREFIX}:${normalizeString(workspaceId)}`

const buildConflictSummaryMessage = (count: number): string => {
  if (count <= 1) {
    return '1 storage sync conflict is waiting for resolution. Open History > Log to review the retained change before retrying sync.'
  }
  return `${count} storage sync conflicts are waiting for resolution. Open History > Log to review the retained changes before retrying sync.`
}

export const notifyKnowgrphStorageConflictUx = (result: KnowgrphStorageSyncRunResult): void => {
  const workspaceId = normalizeString(result.workspaceId)
  if (!workspaceId) return
  const store = useGraphStore.getState()
  const toastId = buildConflictToastId(workspaceId)
  const transportError = normalizeString(result.transportError)
  if (result.unresolvedConflictCount <= 0) {
    if (transportError) {
      store.upsertUiToast({
        id: toastId,
        kind: 'warning',
        message: `${transportError} Local changes remain saved in the retained outbox.`,
        ttlMs: null,
        dismissible: true,
        log: false,
        actions: [{
          id: buildKnowgrphStorageConflictReviewLogActionId(workspaceId),
          label: 'Review Log',
          tone: 'neutral',
        }],
      })
      if (loggedTransportErrorByWorkspace.get(workspaceId) !== transportError) {
        loggedTransportErrorByWorkspace.set(workspaceId, transportError)
        store.pushUiLog({
          kind: 'warning',
          source: 'storage:sync:transport',
          message: `${transportError} No queued mutation was discarded.`,
          actions: [{
            id: buildKnowgrphStorageConflictReviewLogActionId(workspaceId),
            label: 'Review Log',
            tone: 'neutral',
          }],
        })
      }
      return
    }
    store.dismissUiToast(toastId)
    loggedConflictIdsByWorkspace.delete(workspaceId)
    loggedTransportErrorByWorkspace.delete(workspaceId)
    return
  }
  store.upsertUiToast({
    id: toastId,
    kind: 'warning',
    message: buildConflictSummaryMessage(result.unresolvedConflictCount),
    ttlMs: null,
    dismissible: true,
    log: false,
    actions:
      result.conflictEntries.length === 1
        ? [
            {
              id: buildKnowgrphStorageConflictKeepLocalActionId(workspaceId, result.conflictEntries[0]!.mutationId),
              label: 'Keep Local',
              tone: 'warning',
            },
            {
              id: buildKnowgrphStorageConflictAcceptRemoteActionId(workspaceId, result.conflictEntries[0]!.mutationId),
              label: 'Accept Remote',
              tone: 'neutral',
            },
            {
              id: buildKnowgrphStorageConflictReviewLogActionId(workspaceId),
              label: 'Review Log',
              tone: 'neutral',
            },
          ]
        : [
            {
              id: buildKnowgrphStorageConflictReviewLogActionId(workspaceId),
              label: 'Review Log',
              tone: 'neutral',
            },
          ],
  })
  let seen = loggedConflictIdsByWorkspace.get(workspaceId)
  if (!seen) {
    seen = new Set<string>()
    loggedConflictIdsByWorkspace.set(workspaceId, seen)
  }
  for (let i = 0; i < result.conflictEntries.length; i += 1) {
    const conflict = result.conflictEntries[i]
    if (!conflict) continue
    const mutationId = normalizeString(conflict.mutationId)
    if (!mutationId || seen.has(mutationId)) continue
    seen.add(mutationId)
    const entity = normalizeString(conflict.entity) || 'record'
    const recordId = normalizeString(conflict.canonicalPath)
      || normalizeString(conflict.recordId)
      || 'unknown'
    const suffix = normalizeString(conflict.message)
    store.pushUiLog({
      kind: 'warning',
      source: 'storage:conflict',
      message: suffix
        ? `Storage sync conflict retained ${entity} ${recordId}. ${suffix}`
        : `Storage sync conflict retained ${entity} ${recordId}.`,
      actions: [
        {
          id: buildKnowgrphStorageConflictKeepLocalActionId(workspaceId, mutationId),
          label: 'Keep Local',
          tone: 'warning',
        },
        {
          id: buildKnowgrphStorageConflictAcceptRemoteActionId(workspaceId, mutationId),
          label: 'Accept Remote',
          tone: 'neutral',
        },
        {
          id: buildKnowgrphStorageConflictReviewLogActionId(workspaceId),
          label: 'Review Log',
          tone: 'neutral',
        },
      ],
    })
  }
}

export const notifyKnowgrphStorageEngineIssue = (issue: {
  workspaceId: string
  operationId: string
  engine: 'git' | 'file-sync'
  message: string
}): void => {
  const workspaceId = normalizeString(issue.workspaceId)
  const operationId = normalizeString(issue.operationId)
  const message = normalizeString(issue.message)
  if (!workspaceId || !operationId || !message) return
  const store = useGraphStore.getState()
  const action = {
    id: buildKnowgrphStorageConflictReviewLogActionId(workspaceId),
    label: 'Review Log',
    tone: 'neutral' as const,
  }
  store.upsertUiToast({
    id: `${buildConflictToastId(workspaceId)}:engine`,
    kind: 'warning',
    message,
    ttlMs: null,
    dismissible: true,
    log: false,
    actions: [action],
  })
  const issueId = `${workspaceId}\u0000${operationId}`
  if (loggedEngineIssueIds.has(issueId)) return
  loggedEngineIssueIds.add(issueId)
  store.pushUiLog({
    kind: 'warning',
    source: `storage:${issue.engine}`,
    message,
    actions: [action],
  })
}

export const __resetKnowgrphStorageConflictUxForTests = (): void => {
  loggedConflictIdsByWorkspace.clear()
  loggedTransportErrorByWorkspace.clear()
  loggedEngineIssueIds.clear()
}
