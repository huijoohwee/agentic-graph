import { readWorkspaceActiveDocumentResolvedText, readWorkspaceActiveDocumentObservedText, type WorkspaceActiveDocumentTextObservation } from '@/features/source-files/sourceFilesRuntimeActive'
import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { hashSignatureParts } from '@/lib/hash/signature'
import { hashStringToHexSharedContentCached } from '@/lib/hash/textHashCache'
import type { MarkdownWorkspaceRuntimeGetFs } from './markdownWorkspaceRuntime.types'
import { normalizeMarkdownWorkspaceSelectionPath } from './markdownWorkspaceSelectionPath'
import { captureWorkspaceSourceTextRevision } from '@/features/workspace-fs/workspaceSourceTextTransaction'

export type MarkdownWorkspaceSelectionResolvedTextCache = {
  key: string
  text?: string
  promise?: Promise<string>
  observationPromise?: Promise<WorkspaceActiveDocumentTextObservation>
  fs?: WorkspaceFs
  storageFallbackByPath?: Map<string, string>
}

export function readWorkspaceSelectionEntryTextForActivePath(args: {
  activePath: WorkspacePath | null
  activeEntry?: WorkspaceEntry | null
}): string {
  const activePath = normalizeMarkdownWorkspaceSelectionPath(args.activePath)
  if (!activePath) return ''
  const entry = args.activeEntry || null
  if (!entry || entry.kind !== 'file') return ''
  if (normalizeMarkdownWorkspaceSelectionPath(entry.path) !== activePath) return ''
  return typeof entry.text === 'string' ? entry.text : ''
}

export async function readWorkspaceSelectionResolvedTextForActivePath(args: {
  activePath: WorkspacePath | null
  activeEntry?: WorkspaceEntry | null
  fs?: WorkspaceFs | Awaited<ReturnType<MarkdownWorkspaceRuntimeGetFs>>
  storageFallbackByPath?: Map<string, string>
  preferPathResolvedText?: boolean
}): Promise<string> {
  const activePath = normalizeMarkdownWorkspaceSelectionPath(args.activePath)
  if (!activePath) return ''
  const entryText = readWorkspaceSelectionEntryTextForActivePath({
    activePath,
    activeEntry: args.activeEntry,
  })
  if (args.preferPathResolvedText === true) {
    const resolvedText = await readWorkspaceActiveDocumentResolvedText({
      activePath,
      currentText: '',
      fs: args.fs,
      storageFallbackByPath: args.storageFallbackByPath,
      preferCanonicalPathText: true,
    })
    return String(resolvedText || '').trim() ? resolvedText : entryText
  }
  if (entryText.trim()) return entryText
  return readWorkspaceActiveDocumentResolvedText({
    activePath,
    currentText: entryText,
    fs: args.fs,
    storageFallbackByPath: args.storageFallbackByPath,
  })
}

const buildWorkspaceSelectionResolvedTextCacheKey = (args: {
  activePath: WorkspacePath | null
  activeEntry?: WorkspaceEntry | null
  preferPathResolvedText?: boolean
}): string => {
  const activePath = normalizeMarkdownWorkspaceSelectionPath(args.activePath)
  if (!activePath) return ''
  const entry = args.activeEntry || null
  const entryPath = normalizeMarkdownWorkspaceSelectionPath(entry?.path || null)
  const entryText = readWorkspaceSelectionEntryTextForActivePath({
    activePath,
    activeEntry: entry,
  })
  return hashSignatureParts([
    'markdown-workspace-selection-resolved-text',
    activePath,
    args.preferPathResolvedText === true,
    String(entry?.kind || ''),
    entryPath,
    typeof entry?.updatedAtMs === 'number' ? entry.updatedAtMs : 0,
    entryText.length,
    entryText ? hashStringToHexSharedContentCached(entryText, 'markdown-workspace-selection-entry') : '',
  ])
}

type CachedSelectionReadArgs = {
  activePath: WorkspacePath | null
  activeEntry?: WorkspaceEntry | null
  fs?: WorkspaceFs | Awaited<ReturnType<MarkdownWorkspaceRuntimeGetFs>>
  storageFallbackByPath?: Map<string, string>
  preferPathResolvedText?: boolean
  cacheRef: { current: MarkdownWorkspaceSelectionResolvedTextCache | null }
}
export function readCachedWorkspaceSelectionResolvedTextForActivePath(args: CachedSelectionReadArgs & { observeWorkspaceText: true }): Promise<WorkspaceActiveDocumentTextObservation>
export function readCachedWorkspaceSelectionResolvedTextForActivePath(args: CachedSelectionReadArgs & { observeWorkspaceText?: false }): Promise<string>
export async function readCachedWorkspaceSelectionResolvedTextForActivePath(args: CachedSelectionReadArgs & { observeWorkspaceText?: boolean }): Promise<string | WorkspaceActiveDocumentTextObservation> {
  const key = buildWorkspaceSelectionResolvedTextCacheKey(args)
    + (args.observeWorkspaceText && args.activePath ? `:${captureWorkspaceSourceTextRevision(args.activePath).revision}` : '')
  if (args.observeWorkspaceText) {
    const activePath = normalizeMarkdownWorkspaceSelectionPath(args.activePath)
    if (!activePath) throw new Error('A workspace text observation requires an active file path')
    const cached = args.cacheRef.current
    if (cached?.key === key && cached.fs === args.fs && cached.storageFallbackByPath === args.storageFallbackByPath && cached.observationPromise) {
      return cached.observationPromise
    }
    const promise = readWorkspaceActiveDocumentObservedText({ activePath, fs: args.fs, storageFallbackByPath: args.storageFallbackByPath, fallbackText: readWorkspaceSelectionEntryTextForActivePath(args), preferCanonicalPathText: args.preferPathResolvedText })
    args.cacheRef.current = { key, observationPromise: promise, fs: args.fs, storageFallbackByPath: args.storageFallbackByPath }
    try { return await promise }
    finally {
      // Observations coalesce only active reads on the same FS; never retain R.
      if (args.cacheRef.current?.observationPromise === promise) args.cacheRef.current = null
    }
  }
  if (!key) return ''
  const retainResolvedText = args.preferPathResolvedText !== true
  const cached = args.cacheRef.current
  if (cached?.key === key && cached.fs === args.fs && cached.storageFallbackByPath === args.storageFallbackByPath) {
    if (retainResolvedText && typeof cached.text === 'string') return cached.text
    if (cached.promise) return cached.promise
  }
  const promise = readWorkspaceSelectionResolvedTextForActivePath(args)
  args.cacheRef.current = { key, promise, fs: args.fs, storageFallbackByPath: args.storageFallbackByPath }
  try {
    const text = await promise
    if (args.cacheRef.current?.promise === promise) {
      // File switches must reread path authority after a completed write. Keep
      // only the in-flight coalescing window because the explorer entry
      // revision can legitimately lag the Workspace FS mutation event.
      args.cacheRef.current = retainResolvedText ? { key, text, fs: args.fs, storageFallbackByPath: args.storageFallbackByPath } : null
    }
    return text
  } catch (error) {
    if (args.cacheRef.current?.promise === promise) {
      args.cacheRef.current = null
    }
    throw error
  }
}
