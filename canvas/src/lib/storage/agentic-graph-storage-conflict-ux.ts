import { useGraphStore } from '@/hooks/useGraphStore'
import { LRUCache } from '@/lib/cache/LRUCache'
import type { AgenticGraphStorageSyncRunResult } from '@/lib/storage/agentic-graph-storage-client-sync'
import {
  buildAgenticGraphStorageConflictAcceptRemoteActionId,
  buildAgenticGraphStorageConflictFamilyActionId,
  buildAgenticGraphStorageConflictKeepLocalActionId,
  buildAgenticGraphStorageConflictReviewLogActionId,
} from '@/lib/storage/agentic-graph-storage-conflict-actions'

const CONFLICT_TOAST_ID_PREFIX = 'agentic-graph-storage-conflict'
// Notification hints only: authoritative records and visible actions never depend on this cache.
// At most 128 * (512 + 1024) UTF-16 code units of retained key/signature payload.
const loggedNotifications = new LRUCache<string, string>(128)
type MemoValue = string | number | boolean | null | undefined
type NotificationMemo = { key: string; signature: string | null }
const boundedFrame = (parts: MemoValue[], limit: number): string | null => {
  if (parts.some(part => typeof part === 'string' && part.length > limit)) return null
  const framed = JSON.stringify(parts)
  return framed.length <= limit ? framed : null
}
const notificationMemo = (identity: MemoValue[], details: MemoValue[]): NotificationMemo | null => {
  const key = boundedFrame(identity, 512), signature = boundedFrame(details, 1024)
  return key !== null ? { key, signature } : null
}
const repeatedNotification = (memo: NotificationMemo | null, priorHits?: Map<string, string>): boolean => {
  if (!memo) return false
  if (memo.signature === null) {
    loggedNotifications.delete(memo.key)
    priorHits?.delete(memo.key)
    return false
  }
  if (priorHits?.get(memo.key) === memo.signature) return true
  // A changed event invalidates its earlier match, including A -> B -> A within one scan.
  priorHits?.delete(memo.key)
  if (loggedNotifications.get(memo.key) === memo.signature) return true
  loggedNotifications.set(memo.key, memo.signature)
  return false
}
const conflictMemo = (workspaceId: string, durable: boolean,
  entry: AgenticGraphStorageSyncRunResult['conflictEntries'][number]): NotificationMemo | null => {
  const parent = entry.parentRecovery, child = entry.childState
  return notificationMemo([workspaceId, 'conflict', entry.mutationId], [
    durable, entry.entity, entry.recordId, entry.canonicalPath, entry.message, entry.localRevision, entry.serverRevision,
    parent?.documentId, parent?.parentRevision, parent?.retainedChildCount,
    child?.workspaceId, child?.entity, child?.recordId, child?.documentId, child?.syncRevision, child?.deleted, child?.updatedAtMs,
    child?.entity === 'documentChunk' ? child.chunkKey : child?.graphRevision,
  ])
}

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

const conflictActions = (workspaceId: string, entry: AgenticGraphStorageSyncRunResult['conflictEntries'][number]) => [
  ...(entry.parentRecovery ? [
    { id: buildAgenticGraphStorageConflictFamilyActionId(workspaceId, entry.mutationId, 'restore-family'),
      label: 'Restore document and edits', tone: 'warning' as const },
    { id: buildAgenticGraphStorageConflictFamilyActionId(workspaceId, entry.mutationId, 'discard-family'),
      label: 'Discard retained edits', tone: 'warning' as const },
  ] : [
    { id: buildAgenticGraphStorageConflictKeepLocalActionId(workspaceId, entry.mutationId), label: 'Keep Local', tone: 'warning' as const },
    { id: buildAgenticGraphStorageConflictAcceptRemoteActionId(workspaceId, entry.mutationId), label: 'Accept Remote', tone: 'neutral' as const },
  ]),
  { id: buildAgenticGraphStorageConflictReviewLogActionId(workspaceId), label: 'Review Log', tone: 'neutral' as const },
]

export const notifyAgenticGraphStorageConflictUx = (result: AgenticGraphStorageSyncRunResult): void => {
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
          id: buildAgenticGraphStorageConflictReviewLogActionId(workspaceId),
          label: 'Review Log',
          tone: 'neutral',
        }],
      })
      if (!repeatedNotification(notificationMemo([workspaceId, 'transport'], [transportError, durable]))) {
        store.pushUiLog({
          kind: 'warning',
          source: 'storage:sync:transport',
          message: `${transportError} No queued mutation was discarded.`,
          actions: [{
            id: buildAgenticGraphStorageConflictReviewLogActionId(workspaceId),
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
          id: buildAgenticGraphStorageConflictReviewLogActionId(workspaceId),
          label: 'Review Log',
          tone: 'neutral',
        }],
      })
      if (!repeatedNotification(notificationMemo([workspaceId, 'outbox'], [retainedSummary, durable]))) {
        store.pushUiLog({
          kind: 'warning',
          source: 'storage:sync:outbox',
          message: `${retainedSummary} storage sync changes remain retained; no queued mutation was discarded.`,
          actions: [{
            id: buildAgenticGraphStorageConflictReviewLogActionId(workspaceId),
            label: 'Review Log',
            tone: 'neutral',
          }],
        })
      }
      return
    }
    store.dismissUiToast(toastId)
    const prefix = boundedFrame([workspaceId], 512)?.slice(0, -1)
    if (prefix) loggedNotifications.deleteWhere(({ key }) =>
      key.startsWith(`${prefix},`) && !key.startsWith(`${prefix},"engine",`))
    return
  }
  store.upsertUiToast({
    id: toastId,
    kind: 'warning',
    message: result.conflictEntries.length === 1 && result.conflictEntries[0]?.parentRecovery
      ? result.conflictEntries[0].message || buildConflictSummaryMessage(result.unresolvedConflictCount, durable)
      : buildConflictSummaryMessage(result.unresolvedConflictCount, durable),
    ttlMs: null,
    dismissible: true,
    log: false,
    actions:
      result.conflictEntries.length === 1
        ? conflictActions(workspaceId, result.conflictEntries[0]!)
        : [
            {
              id: buildAgenticGraphStorageConflictReviewLogActionId(workspaceId),
              label: 'Review Log',
              tone: 'neutral',
            },
          ],
  })
  // Snapshot existing matches before admitting misses: an oversized ordered scan must
  // not evict a later match and turn every unchanged conflict into another log row.
  const priorHits = new Map<string, string>()
  for (const entry of result.conflictEntries) {
    const memo = conflictMemo(workspaceId, durable, entry)
    if (memo && memo.signature !== null && loggedNotifications.get(memo.key) === memo.signature) priorHits.set(memo.key, memo.signature)
  }
  for (let i = 0; i < result.conflictEntries.length; i += 1) {
    const conflict = result.conflictEntries[i]
    if (!conflict) continue
    const mutationId = normalizeString(conflict.mutationId)
    if (!mutationId || repeatedNotification(conflictMemo(workspaceId, durable, conflict), priorHits)) continue
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
      actions: conflictActions(workspaceId, conflict),
    })
  }
}

export const notifyAgenticGraphStorageEngineIssue = (issue: {
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
    id: buildAgenticGraphStorageConflictReviewLogActionId(workspaceId),
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
  if (repeatedNotification(notificationMemo([workspaceId, 'engine', issue.engine, operationId], [message]))) return
  store.pushUiLog({
    kind: 'warning',
    source: `storage:${issue.engine}`,
    message,
    actions: [action],
  })
}

export const __resetAgenticGraphStorageConflictUxForTests = (): void => {
  loggedNotifications.clear()
}
