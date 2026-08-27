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
const loggedRetainedOutboxIssueByWorkspace = new Map<string, string>()
const loggedEngineIssueIds = new Set<string>()

const normalizeString = (value: unknown): string => String(value || '').trim()

const buildConflictToastId = (workspaceId: string): string =>
  `${CONFLICT_TOAST_ID_PREFIX}:${normalizeString(workspaceId)}`

const buildConflictSummaryMessage = (count: number, durable: boolean): string => {
  const location = durable ? 'retained change' : 'change held only for this browser session'
  if (count <= 1) {
    return `1 storage sync conflict is waiting for resolution. Open History > Log to review the ${location} before retrying sync.`
  }
  const pluralLocation = durable ? 'retained changes' : 'changes held only for this browser session'
  return `${count} storage sync conflicts are waiting for resolution. Open History > Log to review the ${pluralLocation} before retrying sync.`
}

export const notifyKnowgrphStorageConflictUx = (result: KnowgrphStorageSyncRunResult): void => {
  const workspaceId = normalizeString(result.workspaceId)
  if (!workspaceId) return
  const store = useGraphStore.getState()
  const toastId = buildConflictToastId(workspaceId)
  const transportError = normalizeString(result.transportError)
  const durable = result.durableLocalQueue === true
  if (result.unresolvedConflictCount <= 0) {
    if (transportError) {
      store.upsertUiToast({
        id: toastId,
        kind: 'warning',
        message: durable
          ? `${transportError} Local changes remain saved in the IndexedDB outbox.`
          : `${transportError} Local changes remain only for this browser session.`,
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
    if (result.rejectedCount > 0 || result.deferredCount > 0) {
      const retainedSummary = [
        result.rejectedCount > 0 ? `${result.rejectedCount} rejected` : '',
        result.deferredCount > 0 ? `${result.deferredCount} deferred` : '',
      ].filter(Boolean).join(' and ')
      const retention = durable ? 'remain saved in the IndexedDB outbox' : 'remain only for this browser session'
      const message = `Storage sync needs attention (${retainedSummary}). Queued changes ${retention}. Open History > Log to review them.`
      store.upsertUiToast({
        id: toastId,
        kind: 'warning',
        message,
        ttlMs: null,
        dismissible: true,
        log: false,
        actions: [{
          id: buildKnowgrphStorageConflictReviewLogActionId(workspaceId),
          label: 'Review Log',
          tone: 'neutral',
        }],
      })
      if (loggedRetainedOutboxIssueByWorkspace.get(workspaceId) !== retainedSummary) {
        loggedRetainedOutboxIssueByWorkspace.set(workspaceId, retainedSummary)
        store.pushUiLog({
          kind: 'warning',
          source: 'storage:sync:outbox',
          message: `${retainedSummary} storage sync changes remain retained; no queued mutation was discarded.`,
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
    loggedRetainedOutboxIssueByWorkspace.delete(workspaceId)
    return
  }
  store.upsertUiToast({
    id: toastId,
    kind: 'warning',
    message: buildConflictSummaryMessage(result.unresolvedConflictCount, durable),
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
  loggedRetainedOutboxIssueByWorkspace.clear()
  loggedEngineIssueIds.clear()
}
