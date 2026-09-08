import type { MarkdownWorkspaceLoadedSnapshot } from './markdownWorkspaceRuntime.types'
import type { MutableRefObject } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import {
  resolveWorkspaceSourceIndexSnapshot,
  type WorkspaceSourceIndex,
} from '@/features/workspace-fs/sourceIndex'
import { resolveWorkspaceEntryInlineText } from '@/features/workspace-fs/workspaceInlineText'
import type { GraphEdge, GraphNode } from '@/lib/graph/types'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { WorkspaceRefreshSnapshot } from '@/features/markdown-workspace/useWorkspaceFileActions/types'

export type FolderModeContract = 'sitemap' | 'user-journey'

export const MARKDOWN_LAYOUT_REQUEST_EVENT = 'kg:markdown-workspace-layout-request' as const
export type MarkdownLayoutRequestMode = 'split' | 'editor'
export const WORKSPACE_REALTIME_APPLY_DEBOUNCE_MS = 180
export const WORKSPACE_TOC_PARSE_MAX_CHARS = 320_000
export type RuntimeTimeoutHandle = ReturnType<typeof setTimeout>

export const EMPTY_WIDGET_REGISTRY: WidgetRegistryEntry[] = []
export const EMPTY_GRAPH_NODES: GraphNode[] = []
export const EMPTY_GRAPH_EDGES: GraphEdge[] = []
export const EMPTY_TOC_TOKENS: TokenWithLines[] = []

export const parseStringArray = (raw: unknown): string[] | null => {
  if (!Array.isArray(raw)) return null
  const out = raw.map(v => String(v || '').trim()).filter(Boolean)
  return out
}

export function scheduleRuntimeTimeout(callback: () => void, delayMs: number): RuntimeTimeoutHandle {
  return setTimeout(callback, delayMs)
}

export function clearRuntimeTimeout(timer: RuntimeTimeoutHandle | null | undefined): void {
  if (timer != null) clearTimeout(timer)
}

export type MarkdownWorkspaceIndexingFlightBindings = {
  activePathRef: MutableRefObject<WorkspacePath | null>
  indexJobRef: MutableRefObject<number>
  indexingInFlightRef: MutableRefObject<boolean>
  indexingInFlightPathRef: MutableRefObject<WorkspacePath | null>
  setIndexingInFlight: (next: boolean) => void
}

export function markMarkdownWorkspaceIndexingInFlight(args: MarkdownWorkspaceIndexingFlightBindings, scheduledFor: WorkspacePath, cancelled: boolean): void {
  if (cancelled || args.activePathRef.current !== scheduledFor) return
  args.indexingInFlightRef.current = true
  args.indexingInFlightPathRef.current = scheduledFor
  args.setIndexingInFlight(true)
}

export function clearMarkdownWorkspaceIndexingInFlight(args: MarkdownWorkspaceIndexingFlightBindings, scheduledFor: WorkspacePath, jobId?: number): void {
  if (typeof jobId === 'number' && args.indexJobRef.current !== jobId) return
  if (args.indexingInFlightPathRef.current !== scheduledFor) return
  args.indexingInFlightRef.current = false
  args.indexingInFlightPathRef.current = null
  args.setIndexingInFlight(false)
}

export function emitMarkdownLayoutRequest(mode: MarkdownLayoutRequestMode): void {
  const normalizedMode = mode === 'split' ? 'split' : 'editor'
  if (typeof window === 'undefined') return
  try {
    const CustomEventCtor = typeof window.CustomEvent === 'function' ? window.CustomEvent : CustomEvent
    window.dispatchEvent(new CustomEventCtor(MARKDOWN_LAYOUT_REQUEST_EVENT, { detail: { mode: normalizedMode } }))
  } catch {
    void 0
  }
}

export function readMarkdownLayoutRequestEventDetail(
  event: Event | null | undefined,
): { mode: MarkdownLayoutRequestMode } | null {
  if (!event || typeof event !== 'object' || !('detail' in event)) return null
  const detail = (event as CustomEvent<unknown>).detail
  if (!detail || typeof detail !== 'object') return null
  const mode = String((detail as { mode?: unknown }).mode || '').trim().toLowerCase()
  if (mode !== 'split' && mode !== 'editor') return null
  return { mode }
}

export function subscribeMarkdownLayoutRequest(
  listener: (detail: { mode: MarkdownLayoutRequestMode }) => void,
): () => void {
  if (typeof window === 'undefined') return () => void 0
  const handle = (event: Event) => {
    const detail = readMarkdownLayoutRequestEventDetail(event)
    if (!detail) return
    listener(detail)
  }
  window.addEventListener(MARKDOWN_LAYOUT_REQUEST_EVENT, handle as EventListener)
  return () => {
    window.removeEventListener(MARKDOWN_LAYOUT_REQUEST_EVENT, handle as EventListener)
  }
}

export function findWorkspaceSourceFileByPath(path: WorkspacePath) {
  const key = resolveWorkspaceSourcePathKey(path)
  const sourceFiles = Array.isArray(useGraphStore.getState().sourceFiles) ? useGraphStore.getState().sourceFiles : []
  return sourceFiles.find(file => String(file?.source?.path || '') === key) || null
}

export const areWorkspaceEntriesEqual = (a: WorkspaceEntry[], b: WorkspaceEntry[]): boolean => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const aa = a[i]
    const bb = b[i]
    if (aa === bb) continue
    if (!aa || !bb) return false
    if (aa.kind !== bb.kind) return false
    if (aa.path !== bb.path) return false
    if (String(aa.parentPath || '') !== String(bb.parentPath || '')) return false
    if (aa.name !== bb.name) return false
    if (String(aa.text || '') !== String(bb.text || '')) return false
    if (aa.updatedAtMs !== bb.updatedAtMs) return false
  }
  return true
}

export const areWorkspaceSourcesEqual = (a: WorkspaceSourceIndex, b: WorkspaceSourceIndex): boolean => {
  if (a === b) return true
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    const aa = a[key]
    const bb = b[key]
    if (!aa || !bb) return false
    if (aa.kind !== bb.kind) return false
    if (aa.kind === 'url' && aa.url !== (bb.kind === 'url' ? bb.url : '')) return false
    if (aa.kind === 'local' && String(aa.originalName || '') !== String(bb.kind === 'local' ? bb.originalName || '' : '')) {
      return false
    }
  }
  return true
}

export function buildWorkspaceRefreshSnapshot(args: {
  entries: WorkspaceEntry[]
  sourcesByPath?: WorkspaceSourceIndex | null
}): WorkspaceRefreshSnapshot {
  return {
    entries: args.entries,
    sourcesByPath: resolveWorkspaceSourceIndexSnapshot(args.sourcesByPath),
  }
}

export function buildFailedWorkspaceRefreshSnapshot(): WorkspaceRefreshSnapshot {
  return buildWorkspaceRefreshSnapshot({
    entries: [],
  })
}

export function pruneWorkspaceEntriesForInlineSnapshot(
  entries: WorkspaceEntry[],
  maxInlineChars?: number,
): WorkspaceEntry[] {
  let changed = false
  const next = entries.map(entry => {
    if (!entry || entry.kind !== 'file') return entry
    if (typeof entry.text !== 'string') return entry
    if (typeof resolveWorkspaceEntryInlineText(entry.text, maxInlineChars) === 'string') return entry
    changed = true
    return { ...entry, text: undefined }
  })
  return changed ? next : entries
}

export const resolveWorkspaceDirtyState = (args: {
  path: WorkspacePath
  lastLoadedRef: MutableRefObject<MarkdownWorkspaceLoadedSnapshot | null>
  activeTextRef: MutableRefObject<string>
  userEditedActiveTextRef: MutableRefObject<boolean>
}): boolean => {
  const lastLoaded = args.lastLoadedRef.current
  return !!(
    args.userEditedActiveTextRef.current &&
    lastLoaded &&
    lastLoaded.path === args.path &&
    lastLoaded.text !== args.activeTextRef.current
  )
}
