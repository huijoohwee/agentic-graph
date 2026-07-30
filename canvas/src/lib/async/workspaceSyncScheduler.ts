import { cancelCoalescedTask, scheduleCoalescedTask } from '@/lib/async/coalescedScheduler'

const WORKSPACE_SYNC_SCHEDULER_KEY = 'workspace:sync:runtime-persistence'
const WORKSPACE_SYNC_SIGNATURE_LIMIT = 400
const WORKSPACE_SYNC_SIGNATURE_MAX_CHARS = 180
type WorkspaceSyncTaskEntry = {
  fn: () => void
  signature: string | null
  scopeKey: string
}

export type WorkspaceSyncTaskOptions = {
  signature?: string | null
  scopeKey?: string | null
}

const pendingWorkspaceSyncTasks = new Map<string, WorkspaceSyncTaskEntry>()
const lastExecutedWorkspaceSyncTaskSignature = new Map<string, string>()
const pendingWorkspaceSyncSignatureOwner = new Map<string, string>()
let workspaceSyncFlushScheduled = false
let workspaceSyncFlushDelayMs = 0

const signatureOwnerKey = (scopeKey: string, signature: string): string => `${scopeKey}::${signature}`
const normalizeSignature = (raw: string | null): string | null => {
  if (!raw) return null
  const signature = raw.trim()
  if (!signature) return null
  if (signature.length <= WORKSPACE_SYNC_SIGNATURE_MAX_CHARS) return signature
  let hash = 2166136261
  for (let i = 0; i < signature.length; i += 1) {
    hash ^= signature.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `h:${(hash >>> 0).toString(16)}:${signature.length}`
}

const setLastExecutedSignature = (key: string, signature: string): void => {
  if (!key || !signature) return
  if (lastExecutedWorkspaceSyncTaskSignature.has(key)) {
    lastExecutedWorkspaceSyncTaskSignature.delete(key)
  }
  lastExecutedWorkspaceSyncTaskSignature.set(key, signature)
  if (lastExecutedWorkspaceSyncTaskSignature.size <= WORKSPACE_SYNC_SIGNATURE_LIMIT) return
  const oldestKey = lastExecutedWorkspaceSyncTaskSignature.keys().next().value
  if (typeof oldestKey === 'string' && oldestKey) {
    lastExecutedWorkspaceSyncTaskSignature.delete(oldestKey)
  }
}

const getOrCreatePendingTaskEntry = (key: string): WorkspaceSyncTaskEntry => {
  const existing = pendingWorkspaceSyncTasks.get(key)
  if (existing) return existing
  const next: WorkspaceSyncTaskEntry = { fn: () => void 0, signature: null, scopeKey: key }
  pendingWorkspaceSyncTasks.set(key, next)
  return next
}

const flushWorkspaceSyncTasks = (): void => {
  workspaceSyncFlushScheduled = false
  workspaceSyncFlushDelayMs = 0

  const run = [...pendingWorkspaceSyncTasks.entries()]
  pendingWorkspaceSyncTasks.clear()
  pendingWorkspaceSyncSignatureOwner.clear()
  const executedSignatures = new Set<string>()

  for (let i = 0; i < run.length; i += 1) {
    const [taskName, task] = run[i]
    const signature = task.signature
    const scopeKey = task.scopeKey || taskName
    if (signature) {
      const token = signatureOwnerKey(scopeKey, signature)
      if (executedSignatures.has(token)) continue
      if (lastExecutedWorkspaceSyncTaskSignature.get(scopeKey) === signature) continue
      executedSignatures.add(token)
    }
    try {
      task.fn()
      if (signature) {
        setLastExecutedSignature(scopeKey, signature)
      }
    } catch {
      void 0
    } finally {
      // Release references eagerly (avoid retaining closures across flush cycles).
      task.fn = () => void 0
      task.signature = null
      task.scopeKey = taskName
    }
  }
}

export const scheduleWorkspaceSyncTask = (
  taskKey: string,
  fn: () => void,
  delayMs: number,
  options?: WorkspaceSyncTaskOptions,
): boolean => {
  const key = String(taskKey || '').trim() || 'default'
  const scopeKey = String(options?.scopeKey || '').trim() || key
  const signatureRaw = typeof options?.signature === 'string' ? options.signature : null
  const signature = normalizeSignature(signatureRaw)
  if (signature && lastExecutedWorkspaceSyncTaskSignature.get(scopeKey) === signature) return false
  const entry = getOrCreatePendingTaskEntry(key)
  const hasSamePendingSignature = entry.signature === signature && entry.scopeKey === scopeKey
  if (!hasSamePendingSignature) {
    if (signature) {
      const token = signatureOwnerKey(scopeKey, signature)
      const ownerTaskKey = pendingWorkspaceSyncSignatureOwner.get(token)
      if (ownerTaskKey && ownerTaskKey !== key) {
        pendingWorkspaceSyncTasks.delete(ownerTaskKey)
      }
      pendingWorkspaceSyncSignatureOwner.set(token, key)
    }
    if (entry.signature) {
      const prevToken = signatureOwnerKey(entry.scopeKey || key, entry.signature)
      const ownerTaskKey = pendingWorkspaceSyncSignatureOwner.get(prevToken)
      if (ownerTaskKey === key) {
        pendingWorkspaceSyncSignatureOwner.delete(prevToken)
      }
    }
  }
  entry.fn = fn
  entry.signature = signature
  entry.scopeKey = scopeKey
  const normalizedDelay = Number.isFinite(delayMs) && delayMs >= 0 ? Math.floor(delayMs) : 0
  if (!workspaceSyncFlushScheduled) {
    workspaceSyncFlushScheduled = true
    workspaceSyncFlushDelayMs = normalizedDelay
    scheduleCoalescedTask(WORKSPACE_SYNC_SCHEDULER_KEY, flushWorkspaceSyncTasks, normalizedDelay)
    return true
  }
  if (normalizedDelay < workspaceSyncFlushDelayMs) {
    workspaceSyncFlushDelayMs = normalizedDelay
    scheduleCoalescedTask(WORKSPACE_SYNC_SCHEDULER_KEY, flushWorkspaceSyncTasks, normalizedDelay)
  }
  return true
}

export const cancelWorkspaceSyncTask = (taskKey: string): void => {
  const key = String(taskKey || '').trim() || 'default'
  const pending = pendingWorkspaceSyncTasks.get(key)
  if (pending?.signature) {
    const token = signatureOwnerKey(pending.scopeKey || key, pending.signature)
    const ownerTaskKey = pendingWorkspaceSyncSignatureOwner.get(token)
    if (ownerTaskKey === key) {
      pendingWorkspaceSyncSignatureOwner.delete(token)
    }
  }
  pendingWorkspaceSyncTasks.delete(key)
  if (pendingWorkspaceSyncTasks.size > 0) return
  pendingWorkspaceSyncSignatureOwner.clear()
  workspaceSyncFlushScheduled = false
  workspaceSyncFlushDelayMs = 0
  cancelCoalescedTask(WORKSPACE_SYNC_SCHEDULER_KEY)
}
