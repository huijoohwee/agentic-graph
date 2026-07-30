import React from 'react'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { UI_TOAST_TTL_MS } from '@/lib/ui/toastTiming'
import { WorkspaceModeSelect } from '@/features/markdown-workspace/WorkspaceModeSelect'
import {
  cancelMarkdownWorkspaceInlineEditStateSync,
  scheduleMarkdownWorkspaceInlineEditStateSync,
} from './markdownWorkspaceRuntime.stateSync'
import type { FolderModeContract } from './markdownWorkspaceRuntime.shared'
import { applyMarkdownWorkspaceSuccessStatus } from './markdownWorkspaceStatusTransitions'
import { buildWorkspaceEntriesIndex, hasWorkspaceFileEntry } from './workspaceEntriesIndex'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'

export function useMarkdownWorkspaceViewShell(args: {
  entries: WorkspaceEntry[]
  sourcesByPath: WorkspaceSourceIndex
  folderModeContract: FolderModeContract
  setFolderModeContract: React.Dispatch<React.SetStateAction<FolderModeContract>>
  activePath: WorkspacePath | null
  selectionPath: WorkspacePath | null
  selectionEntryKind: WorkspaceEntry['kind'] | null
  setActivePathSafe: (path: WorkspacePath) => void
  setSelectionPathSafe: (path: WorkspacePath) => void | Promise<void>
  setSelectionSource: (source: null | 'canvas' | 'menu' | 'toolbar' | 'editor' | 'unknown') => void
  setExpandedPaths: React.Dispatch<React.SetStateAction<Set<string>>>
  resolveFolderContractDocPath: (folderPath: WorkspacePath, mode: FolderModeContract) => WorkspacePath
  pickFolderContractTargetPath: (folderPath: WorkspacePath, preferredMode: FolderModeContract) => WorkspacePath | null
  revealLineInEditor: (line: number) => void
  setStatusWithAutoClear: (label: string, ttlMs?: number) => void
  streamingWorkspacePath?: WorkspacePath | null
}) {
  const {
    entries,
    sourcesByPath,
    folderModeContract,
    setFolderModeContract,
    activePath,
    selectionPath,
    selectionEntryKind,
    setActivePathSafe,
    setSelectionPathSafe,
    setSelectionSource,
    setExpandedPaths,
    resolveFolderContractDocPath,
    pickFolderContractTargetPath,
    revealLineInEditor,
    setStatusWithAutoClear,
    streamingWorkspacePath,
  } = args

  const applyShellStatus = React.useCallback(
    (label: string, ttlMs?: number) => {
      applyMarkdownWorkspaceSuccessStatus({
        setStatusWithAutoClear,
        label,
        ttlMs,
      })
    },
    [setStatusWithAutoClear],
  )
  const entriesIndex = React.useMemo(() => buildWorkspaceEntriesIndex(entries), [entries])

  React.useEffect(() => {
    if (!selectionPath || selectionEntryKind !== 'folder') return
    const target = pickFolderContractTargetPath(selectionPath, folderModeContract)
    if (!target || target === activePath) return
    setActivePathSafe(target)
  }, [activePath, folderModeContract, pickFolderContractTargetPath, selectionEntryKind, selectionPath, setActivePathSafe])

  const toggleExpanded = React.useCallback((path: WorkspacePath) => {
    const normalized = normalizeWorkspacePath(path)
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(normalized)) next.delete(normalized)
      else next.add(normalized)
      return next
    })
  }, [setExpandedPaths])

  const onSelectFile = React.useCallback(
    (path: WorkspacePath) => {
      const normalized = normalizeWorkspacePath(path)
      setSelectionSource('editor')
      const applyActivePath = () => setActivePathSafe(normalized)
      const pendingSelection = setSelectionPathSafe(normalized)
      if (pendingSelection) {
        void pendingSelection.then(applyActivePath, applyActivePath)
        return
      }
      applyActivePath()
    },
    [setActivePathSafe, setSelectionPathSafe, setSelectionSource],
  )

  const onSelectFolder = React.useCallback(
    (path: WorkspacePath) => {
      setSelectionSource('editor')
      setSelectionPathSafe(path)
      const target = pickFolderContractTargetPath(path, folderModeContract)
      if (target) setActivePathSafe(target)
    },
    [folderModeContract, pickFolderContractTargetPath, setActivePathSafe, setSelectionPathSafe, setSelectionSource],
  )

  const renderSourceFileRight = React.useCallback(
    (renderArgs: { entry: WorkspaceEntry; isActive: boolean }) => {
      if (renderArgs.entry.kind === 'file') {
        const text = String(renderArgs.entry.text || '')
        const normalizedStreamingPath = normalizeWorkspacePath(String(streamingWorkspacePath || '').trim())
        if (normalizedStreamingPath && normalizedStreamingPath === normalizeWorkspacePath(renderArgs.entry.path)) {
          return null
        }
        const warnings = text.startsWith('---') ? (parseMarkdownFrontmatter(splitMarkdownLines(text)).warnings || []) : []
        const summary = warnings[0] || ''
        if (summary) {
          return (
            <span
              className="inline-flex items-center rounded border border-amber-300/70 bg-amber-500/10 px-1.5 py-0.5 text-[10px] leading-none text-amber-700"
              aria-label={`Frontmatter warning in ${renderArgs.entry.name}`}
              title={summary}
            >
              YAML
            </span>
          )
        }
      }
      if (!renderArgs.isActive) return null
      if (renderArgs.entry.kind === 'folder') {
        const sitemapPath = resolveFolderContractDocPath(renderArgs.entry.path, 'sitemap')
        const journeyPath = resolveFolderContractDocPath(renderArgs.entry.path, 'user-journey')
        const hasSitemap = hasWorkspaceFileEntry(entriesIndex, sitemapPath)
        const hasJourney = hasWorkspaceFileEntry(entriesIndex, journeyPath)
        if (!hasSitemap && !hasJourney) return null
        return (
          <WorkspaceModeSelect<FolderModeContract>
            ariaLabel="Folder mode contract"
            value={folderModeContract}
            isActive={renderArgs.isActive}
            options={[
              { value: 'sitemap', label: 'Sitemap' },
              { value: 'user-journey', label: 'User Journey' },
            ]}
            onChange={next => {
              setSelectionSource('editor')
              setFolderModeContract(next)
              const target = pickFolderContractTargetPath(renderArgs.entry.path, next)
              if (target) setActivePathSafe(target)
            }}
          />
        )
      }
      return null
    },
    [
      entriesIndex,
      folderModeContract,
      pickFolderContractTargetPath,
      resolveFolderContractDocPath,
      setActivePathSafe,
      setFolderModeContract,
      setSelectionSource,
      streamingWorkspacePath,
    ],
  )

  const revealInFinder = React.useCallback(
    (path: WorkspacePath) => {
      const normalized = normalizeWorkspacePath(path)
      const source = sourcesByPath[normalized]
      if (source && source.kind === 'url' && String(source.url || '').trim()) {
        try {
          window.open(String(source.url || '').trim(), '_blank', 'noopener,noreferrer')
          applyShellStatus('Opened source URL', UI_TOAST_TTL_MS.statusAutoClose)
          return
        } catch {
          void 0
        }
      }
      const localName = source && source.kind === 'local' ? String(source.originalName || '').trim() : ''
      const localLooksAbsolute = !!localName && (localName.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(localName))
      if (localLooksAbsolute) {
        try {
          window.open(`file://${localName.replace(/\\/g, '/')}`, '_blank', 'noopener,noreferrer')
          applyShellStatus('Opened local file URL', UI_TOAST_TTL_MS.statusAutoCloseMedium)
          return
        } catch {
          void 0
        }
      }
      if (source && source.kind === 'local') {
        try {
          void navigator.clipboard?.writeText(normalized.replace(/^\/+/, '') || normalized)
          applyShellStatus('Copied workspace-relative path', UI_TOAST_TTL_MS.statusAutoCloseSlow)
        } catch {
          void 0
        }
      }
      setSelectionSource('editor')
      setSelectionPathSafe(normalized)
      setActivePathSafe(normalized)
      applyShellStatus('Revealed in Source Files explorer', UI_TOAST_TTL_MS.statusAutoCloseSlow)
    },
    [applyShellStatus, setActivePathSafe, setSelectionPathSafe, setSelectionSource, sourcesByPath],
  )

  const openBacklink = React.useCallback(
    (backlink: { path: WorkspacePath; line: number }) => {
      setSelectionSource('editor')
      setActivePathSafe(backlink.path)
      setSelectionPathSafe(backlink.path)
      revealLineInEditor(backlink.line)
    },
    [revealLineInEditor, setActivePathSafe, setSelectionPathSafe, setSelectionSource],
  )

  const lastViewerInlineEditSignalRef = React.useRef<boolean | null>(null)
  const handleViewerInlineEditStateChange = React.useCallback((active: boolean, setViewerInlineEditActive: (fn: (prev: boolean) => boolean) => void) => {
    if (lastViewerInlineEditSignalRef.current === active) return
    lastViewerInlineEditSignalRef.current = active
    scheduleMarkdownWorkspaceInlineEditStateSync(active, () => {
      setViewerInlineEditActive(prev => (prev === active ? prev : active))
    })
  }, [])

  React.useEffect(() => {
    return () => {
      cancelMarkdownWorkspaceInlineEditStateSync()
    }
  }, [])

  const canRefreshActiveFromSource = React.useMemo(() => {
    if (!selectionPath || selectionEntryKind !== 'file') return false
    const source = sourcesByPath[selectionPath]
    return !!(source && source.kind === 'url' && String(source.url || '').trim())
  }, [selectionEntryKind, selectionPath, sourcesByPath])

  return {
    toggleExpanded,
    onSelectFile,
    onSelectFolder,
    renderSourceFileRight,
    revealInFinder,
    openBacklink,
    handleViewerInlineEditStateChange,
    canRefreshActiveFromSource,
  }
}
