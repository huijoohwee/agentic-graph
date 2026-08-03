import React from 'react'
import { useDebouncedValue } from '@/features/hooks/useDebouncedValue'
import type { HighlightedLineRange, MarkdownPresentationApi } from '@/features/markdown-workspace/markdownWorkspaceTypes'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { loadWorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { readMarkdownExplorerChromeState } from '@/features/markdown/ui/markdownExplorerChromePersistence'
import { readMarkdownExplorerModePreferences } from '@/features/markdown/ui/markdownExplorerModePreferencesPersistence'
import { readPersistedMarkdownSourceFolderPaths } from '@/features/markdown/ui/markdownSourceFilesPersistence'
import { readMarkdownExplorerViewPreferences } from '@/features/markdown/ui/markdownExplorerViewPreferencesPersistence'
import { readMarkdownExplorerSectionCollapseState } from '@/features/markdown/ui/useMarkdownExplorerSectionCollapseState'
import { resolveWorkspaceExplorerDefaultWidthPx } from '@/features/workspace-table/workspaceViewCanvasDefaults'
import { SIDEBAR_MAX_PX, SIDEBAR_MIN_PX } from '@/features/markdown-workspace/markdownWorkspaceUtils'
import { upsertWorkspaceEntryInlineText } from '@/features/workspace-fs/workspaceInlineText'
import type { FolderModeContract } from './markdownWorkspaceRuntime.shared'
import type { MarkdownWorkspaceLayoutMode } from '@/features/markdown-explorer/workspaceUi'

export function useMarkdownWorkspaceBootstrapState(args: {
  activePath: WorkspacePath | null
  effectiveBottomSurfaceCollapsed: boolean
}) {
  const setMarkdownWorkspaceIndexingInFlight = useGraphStore(s => s.setMarkdownWorkspaceIndexingInFlight)
  const [entries, setEntries] = React.useState<WorkspaceEntry[]>([])
  const [sourcesByPath, setSourcesByPath] = React.useState(() => loadWorkspaceSourceIndex())
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState('')
  const [search, setSearch] = React.useState('')

  const initialExplorerChromeState = React.useMemo(
    () =>
      readMarkdownExplorerChromeState({
        minWidthPx: SIDEBAR_MIN_PX,
        maxWidthPx: SIDEBAR_MAX_PX,
        defaultWidthPx: resolveWorkspaceExplorerDefaultWidthPx({ minPx: SIDEBAR_MIN_PX, maxPx: SIDEBAR_MAX_PX }),
      }),
    [],
  )
  const [sidebarWidthPx, setSidebarWidthPx] = React.useState(() => initialExplorerChromeState.sidebarWidthPx)
  const [explorerOpen, setExplorerOpen] = React.useState(() => initialExplorerChromeState.explorerOpen)

  const initialExplorerSectionCollapseState = React.useMemo(() => readMarkdownExplorerSectionCollapseState(), [])
  const [sourceFilesCollapsed, setSourceFilesCollapsed] = React.useState(() => initialExplorerSectionCollapseState.sourceFilesCollapsed)
  const [tocCollapsed, setTocCollapsed] = React.useState(() => initialExplorerSectionCollapseState.outlineCollapsed)
  const [backlinksCollapsed, setBacklinksCollapsed] = React.useState(() => initialExplorerSectionCollapseState.backlinksCollapsed)

  const initialExplorerViewPreferences = React.useMemo(() => readMarkdownExplorerViewPreferences(), [])
  const [markdownWordWrap, setMarkdownWordWrap] = React.useState(() => initialExplorerViewPreferences.markdownWordWrap)
  const [markdownTextHighlight, setMarkdownTextHighlight] = React.useState(() => initialExplorerViewPreferences.markdownTextHighlight)

  const initialExplorerModePreferences = React.useMemo(() => readMarkdownExplorerModePreferences(), [])
  const [folderModeContract, setFolderModeContract] = React.useState<FolderModeContract>(() => initialExplorerModePreferences.folderModeContract)
  const [layoutMode, setLayoutMode] = React.useState<MarkdownWorkspaceLayoutMode>(() => initialExplorerModePreferences.layoutMode)
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(() => {
    const arr = readPersistedMarkdownSourceFolderPaths()
    return new Set((arr || []).map(path => normalizeWorkspacePath(path)))
  })

  const patchWorkspaceEntryInlineText = React.useCallback((path: WorkspacePath, text: string) => {
    setEntries(prev =>
      upsertWorkspaceEntryInlineText({
        entries: prev,
        path,
        text,
        createIfMissing: true,
      }),
    )
  }, [])

  const editorRef = React.useRef<MonacoTextEditorHandle | null>(null)
  const [resizeHandleEl, setResizeHandleEl] = React.useState<HTMLHRElement | null>(null)
  const workspaceRootRef = React.useRef<HTMLElement | null>(null)
  const presentationApiRef = React.useRef<MarkdownPresentationApi | null>(null)
  const [highlightedLineRange, setHighlightedLineRange] = React.useState<HighlightedLineRange>(null)
  const lastLoadedRef = React.useRef<{ path: WorkspacePath; text: string } | null>(null)
  const activeTextRef = React.useRef('')
  const [activeText, setActiveTextState] = React.useState('')
  const setActiveText = React.useCallback<React.Dispatch<React.SetStateAction<string>>>(next => {
    if (typeof next === 'string') {
      activeTextRef.current = next
      setActiveTextState(next)
      return
    }
    setActiveTextState(previous => {
      const resolved = next(previous)
      activeTextRef.current = resolved
      return resolved
    })
  }, [])
  const [viewerInlineEditActive, setViewerInlineEditActive] = React.useState(false)
  const viewerInlineEditActiveRef = React.useRef(false)
  viewerInlineEditActiveRef.current = viewerInlineEditActive
  const userEditedActiveTextRef = React.useRef(false)
  const setActiveTextProgrammatic = React.useCallback((next: string) => {
    userEditedActiveTextRef.current = false
    setActiveText(next)
  }, [])
  const activeTextOwnedByActivePath = !!(
    args.activePath &&
    lastLoadedRef.current?.path === args.activePath
  )
  const outlineSourceText = activeTextOwnedByActivePath ? activeText : ''
  const outlineTextResetKey = `${String(args.activePath || '')}:${outlineSourceText ? 'ready' : 'pending'}`
  const debouncedText = useDebouncedValue(activeText, 450, args.activePath)
  const outlineText = useDebouncedValue(outlineSourceText, 160, outlineTextResetKey)
  const repairedMissingWorkspaceFilesRef = React.useRef<Set<WorkspacePath>>(new Set())
  const lastIndexedByPathRef = React.useRef<Map<WorkspacePath, string>>(new Map())
  const indexJobRef = React.useRef(0)
  const indexingInFlightRef = React.useRef(false)
  const indexingInFlightPathRef = React.useRef<WorkspacePath | null>(null)
  const [indexingInFlight, setIndexingInFlightState] = React.useState(false)
  const setIndexingInFlight = React.useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    next => {
      setIndexingInFlightState(prev => {
        const resolved = typeof next === 'function' ? next(prev) : next
        const normalized = resolved === true
        indexingInFlightRef.current = normalized
        if (!normalized) indexingInFlightPathRef.current = null
        return normalized
      })
    },
    [],
  )
  indexingInFlightRef.current = indexingInFlight
  React.useEffect(() => {
    setMarkdownWorkspaceIndexingInFlight(indexingInFlight === true)
    return () => {
      setMarkdownWorkspaceIndexingInFlight(false)
    }
  }, [indexingInFlight, setMarkdownWorkspaceIndexingInFlight])
  const collapsedSnapshotRef = React.useRef<{ path: WorkspacePath; text: string } | null>(null)
  const prevCollapsedRef = React.useRef<boolean>(args.effectiveBottomSurfaceCollapsed)
  const lastRequestedActivePathRef = React.useRef<{ path: WorkspacePath; atMs: number } | null>(null)
  const activePathRef = React.useRef<WorkspacePath | null>(null)
  activePathRef.current = args.activePath
  const layoutModeRef = React.useRef<MarkdownWorkspaceLayoutMode>(layoutMode)

  return {
    entries,
    setEntries,
    sourcesByPath,
    setSourcesByPath,
    loading,
    setLoading,
    loadError,
    setLoadError,
    search,
    setSearch,
    sidebarWidthPx,
    setSidebarWidthPx,
    explorerOpen,
    setExplorerOpen,
    sourceFilesCollapsed,
    setSourceFilesCollapsed,
    tocCollapsed,
    setTocCollapsed,
    backlinksCollapsed,
    setBacklinksCollapsed,
    markdownWordWrap,
    setMarkdownWordWrap,
    markdownTextHighlight,
    setMarkdownTextHighlight,
    folderModeContract,
    setFolderModeContract,
    layoutMode,
    setLayoutMode,
    expandedPaths,
    setExpandedPaths,
    patchWorkspaceEntryInlineText,
    editorRef,
    resizeHandleEl,
    setResizeHandleEl,
    workspaceRootRef,
    presentationApiRef,
    highlightedLineRange,
    setHighlightedLineRange,
    activeText,
    setActiveText,
    activeTextRef,
    viewerInlineEditActive,
    setViewerInlineEditActive,
    viewerInlineEditActiveRef,
    userEditedActiveTextRef,
    setActiveTextProgrammatic,
    debouncedText,
    outlineText,
    lastLoadedRef,
    repairedMissingWorkspaceFilesRef,
    lastIndexedByPathRef,
    indexJobRef,
    indexingInFlight,
    setIndexingInFlight,
    indexingInFlightRef,
    indexingInFlightPathRef,
    collapsedSnapshotRef,
    prevCollapsedRef,
    lastRequestedActivePathRef,
    activePathRef,
    layoutModeRef,
  }
}
