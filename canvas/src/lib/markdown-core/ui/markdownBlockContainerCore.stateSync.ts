import { cancelWorkspaceSyncTask, scheduleWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import {
  WORKSPACE_SYNC_SCOPE_MARKDOWN_BLOCK_INLINE_EDIT_STATE_RUNTIME_PERSISTENCE,
  WORKSPACE_SYNC_TASK_MARKDOWN_BLOCK_INLINE_EDIT_STATE,
} from '@/lib/async/workspaceSyncKeys'

const toLineNumber = (value: number): number => {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.floor(value))
}

export const toMarkdownBlockInlineEditRangeToken = (startLine: number, endLine?: number): string => {
  const start = toLineNumber(startLine)
  const endCandidate = typeof endLine === 'number' && Number.isFinite(endLine) ? toLineNumber(endLine) : start
  const end = Math.max(start, endCandidate)
  return `${start}:${end}`
}

export const toMarkdownBlockInlineSelectionToolbarScheduleKey = (rangeToken: string): string => `markdown:inlineEdit:inlineSelectionToolbar:${rangeToken}`

export const toMarkdownBlockMouseUpSyncScheduleKey = (rangeToken: string): string => `markdown:inlineEdit:mouseup-sync:${rangeToken}`

export const toMarkdownBlockInlineEditStateTaskKey = (rangeToken: string): string =>
  `${WORKSPACE_SYNC_TASK_MARKDOWN_BLOCK_INLINE_EDIT_STATE}:${rangeToken}`

export const toMarkdownBlockInlineEditStateSignature = (active: boolean): string =>
  `markdown-inline-edit:${active ? '1' : '0'}`

export const scheduleMarkdownBlockInlineEditStateSync = (
  taskKey: string,
  active: boolean,
  notify: (active: boolean) => void,
): void => {
  scheduleWorkspaceSyncTask(taskKey, () => notify(active), 0, {
    signature: toMarkdownBlockInlineEditStateSignature(active),
    scopeKey: WORKSPACE_SYNC_SCOPE_MARKDOWN_BLOCK_INLINE_EDIT_STATE_RUNTIME_PERSISTENCE,
  })
}

export const cancelMarkdownBlockInlineEditStateSync = (taskKey: string): void => {
  cancelWorkspaceSyncTask(taskKey)
}
