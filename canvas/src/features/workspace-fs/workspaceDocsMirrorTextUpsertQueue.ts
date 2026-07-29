import type { WorkspacePath } from './types'
import { normalizeWorkspacePath } from './path'
import { upsertWorkspaceDocsMirrorText } from './workspaceSeedProvider'

export const WORKSPACE_DOCS_MIRROR_FLUSH_DEBOUNCE_MS = 150

const flushTimers = new Map<WorkspacePath, number>()
const pendingTextByPath = new Map<WorkspacePath, string>()
const upsertTailByPath = new Map<WorkspacePath, Promise<boolean>>()

const startWorkspaceDocsMirrorTextUpsert = (
  workspacePath: WorkspacePath,
  text: string,
): Promise<boolean> => {
  const previous = upsertTailByPath.get(workspacePath) || Promise.resolve(true)
  const next = previous
    .catch(() => false)
    .then(() => upsertWorkspaceDocsMirrorText({ workspacePath, text }))
    .catch(() => false)
  upsertTailByPath.set(workspacePath, next)
  void next.finally(() => {
    if (upsertTailByPath.get(workspacePath) === next) upsertTailByPath.delete(workspacePath)
  })
  return next
}

const flushScheduledWorkspaceDocsMirrorTextUpsert = (
  workspacePath: WorkspacePath,
): Promise<boolean> | null => {
  const timer = flushTimers.get(workspacePath)
  if (timer !== undefined && typeof window !== 'undefined') window.clearTimeout(timer)
  flushTimers.delete(workspacePath)
  const nextText = pendingTextByPath.get(workspacePath)
  pendingTextByPath.delete(workspacePath)
  if (typeof nextText !== 'string') return null
  return startWorkspaceDocsMirrorTextUpsert(workspacePath, nextText)
}

export function scheduleWorkspaceDocsMirrorTextUpsert(
  workspacePath: WorkspacePath,
  text: string,
): void {
  if (typeof window === 'undefined') {
    void startWorkspaceDocsMirrorTextUpsert(workspacePath, text)
    return
  }
  pendingTextByPath.set(workspacePath, String(text ?? ''))
  const existingTimer = flushTimers.get(workspacePath)
  if (existingTimer) window.clearTimeout(existingTimer)
  const timer = window.setTimeout(() => {
    void flushScheduledWorkspaceDocsMirrorTextUpsert(workspacePath)
  }, WORKSPACE_DOCS_MIRROR_FLUSH_DEBOUNCE_MS)
  flushTimers.set(workspacePath, timer)
}

export async function flushPendingWorkspaceDocsMirrorTextUpserts(): Promise<void> {
  while (pendingTextByPath.size > 0 || flushTimers.size > 0 || upsertTailByPath.size > 0) {
    for (const workspacePath of [...pendingTextByPath.keys()]) {
      flushScheduledWorkspaceDocsMirrorTextUpsert(workspacePath)
    }
    const pendingUpserts = [...upsertTailByPath.values()]
    if (pendingUpserts.length > 0) await Promise.all(pendingUpserts)
  }
}

export function cancelWorkspaceDocsMirrorTextUpsertsUnderPath(
  workspacePath: WorkspacePath,
): void {
  const path = normalizeWorkspacePath(workspacePath)
  const matches = (candidate: WorkspacePath): boolean => (
    candidate === path || candidate.startsWith(`${path}/`)
  )
  for (const [candidate, timer] of flushTimers) {
    if (!matches(candidate)) continue
    if (typeof window !== 'undefined') window.clearTimeout(timer)
    flushTimers.delete(candidate)
    pendingTextByPath.delete(candidate)
  }
}
