import { cancelWorkspaceSyncTask, scheduleWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import {
  WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_INDEX_START,
  WORKSPACE_SYNC_SCOPE_MARKDOWN_WORKSPACE_RUNTIME_PERSISTENCE_SHARED,
  WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_AUTOSAVE,
  WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_INLINE_EDIT_STATE,
  WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_PREFS,
  WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_REFRESH,
} from '@/lib/async/workspaceSyncKeys'
import { hashRecordSignature, hashSignatureParts, hashStringArraySignature } from '@/lib/hash/signature'

const toStringArray = (value: string[] | Set<string>): string[] => {
  if (Array.isArray(value)) return value
  return Array.from(value)
}

export const MARKDOWN_WORKSPACE_INDEX_START_DELAY_MS = 120

export const scheduleMarkdownWorkspaceIndexStart = (
  fn: () => void,
  args: { path: string; sourceUrl: string; sourceFileName: string },
): void => {
  const signature = `index-start:${hashSignatureParts([
    'v1',
    String(args.path || ''),
    String(args.sourceUrl || ''),
    String(args.sourceFileName || ''),
  ])}`
  scheduleWorkspaceSyncTask(WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_INDEX_START, fn, MARKDOWN_WORKSPACE_INDEX_START_DELAY_MS, {
    signature,
    scopeKey: WORKSPACE_SYNC_SCOPE_MARKDOWN_WORKSPACE_RUNTIME_PERSISTENCE_SHARED,
  })
}

export const cancelMarkdownWorkspaceIndexStart = (): void => {
  cancelWorkspaceSyncTask(WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_INDEX_START)
}

export const scheduleMarkdownWorkspaceAutosaveSync = (
  fn: () => void,
  args: { path: string; text: string },
): void => {
  const signature = `autosave:${hashSignatureParts([
    'v2',
    String(args.path || ''),
    String(args.text || '').length,
    // Every authored byte participates: same-size edits in the middle of a
    // document must not be mistaken for an already persisted autosave.
    String(args.text || ''),
  ])}`
  const taskKey = `${WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_AUTOSAVE}:${String(args.path || '')}`
  scheduleWorkspaceSyncTask(taskKey, fn, 0, {
    signature,
    scopeKey: WORKSPACE_SYNC_SCOPE_MARKDOWN_WORKSPACE_RUNTIME_PERSISTENCE_SHARED,
  })
}

export const cancelMarkdownWorkspaceAutosaveSync = (path: string): void => {
  const taskKey = `${WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_AUTOSAVE}:${String(path || '')}`
  cancelWorkspaceSyncTask(taskKey)
}

export const scheduleMarkdownWorkspaceRefreshSync = (
  fn: () => void,
  args: { activePath: string | null; changedPath: string | null; operation: string; isDirty: boolean },
): void => {
  const signature = `refresh:${String(args.activePath || '')}|${String(args.changedPath || '')}|${String(args.operation || '')}|${args.isDirty ? '1' : '0'}`
  scheduleWorkspaceSyncTask(WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_REFRESH, fn, 180, {
    signature,
    scopeKey: WORKSPACE_SYNC_SCOPE_MARKDOWN_WORKSPACE_RUNTIME_PERSISTENCE_SHARED,
  })
}

export const cancelMarkdownWorkspaceRefreshSync = (): void => {
  cancelWorkspaceSyncTask(WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_REFRESH)
}

export const scheduleMarkdownWorkspacePrefsSync = (
  fn: () => void,
  args: {
    sidebarWidthPx: number
    explorerOpen: boolean
    sourceFilesCollapsed: boolean
    tocCollapsed: boolean
    backlinksCollapsed: boolean
    markdownWordWrap: boolean
    markdownTextHighlight: boolean
    folderModeContract: Record<string, unknown>
    layoutMode: string
    expandedPaths: string[] | Set<string>
  },
): void => {
  const signature = `prefs:${hashSignatureParts([
    'v1',
    args.sidebarWidthPx,
    args.explorerOpen,
    args.sourceFilesCollapsed,
    args.tocCollapsed,
    args.backlinksCollapsed,
    args.markdownWordWrap,
    args.markdownTextHighlight,
    hashRecordSignature(args.folderModeContract),
    String(args.layoutMode || ''),
    hashStringArraySignature(toStringArray(args.expandedPaths), { maxSamples: 40, includeTail: true }),
  ])}`
  scheduleWorkspaceSyncTask(WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_PREFS, fn, 120, {
    signature,
    scopeKey: WORKSPACE_SYNC_SCOPE_MARKDOWN_WORKSPACE_RUNTIME_PERSISTENCE_SHARED,
  })
}

export const cancelMarkdownWorkspacePrefsSync = (): void => {
  cancelWorkspaceSyncTask(WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_PREFS)
}

export const scheduleMarkdownWorkspaceInlineEditStateSync = (active: boolean, fn: () => void): void => {
  scheduleWorkspaceSyncTask(WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_INLINE_EDIT_STATE, fn, 0, {
    signature: `inline-edit:${active ? '1' : '0'}`,
    scopeKey: WORKSPACE_SYNC_SCOPE_MARKDOWN_WORKSPACE_RUNTIME_PERSISTENCE_SHARED,
  })
}

export const cancelMarkdownWorkspaceInlineEditStateSync = (): void => {
  cancelWorkspaceSyncTask(WORKSPACE_SYNC_TASK_MARKDOWN_WORKSPACE_INLINE_EDIT_STATE)
}
