import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { MarkdownExplorerSection } from './MarkdownExplorerSection'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { loadWorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import type { WorkspaceBacklink } from '@/features/workspace-fs/types'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { WorkspaceHeaderRow } from '@/components/ui/WorkspaceHeader'
import { UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_CONTENT_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { MarkdownWorkspaceBacklinksList } from './MarkdownWorkspaceBacklinksList'
import { MarkdownWorkspaceTocList } from './MarkdownWorkspaceTocList'
import { MarkdownWorkspaceExplorerHeaderActions } from './MarkdownWorkspaceExplorerHeaderActions'
import { MarkdownWorkspaceSourceFilesList } from './MarkdownWorkspaceSourceFilesList'
import { matchesAgentMissionSource } from '@/features/agent-ready/agentMissionSourceFiles'
import { useAgentRunInspection } from '@/features/agent-ready/agentRunInspectionStore'
import { MarkdownWorkspaceTocTree } from './MarkdownWorkspaceTocTree'
import { MarkdownExplorerSectionResizeHandle } from './MarkdownExplorerSectionResizeHandle'
import {
  MARKDOWN_EXPLORER_SECTION_MIN_HEIGHT_PX,
  readMarkdownExplorerSectionHeightsPx,
  type MarkdownExplorerSectionHeightsPx,
  type MarkdownExplorerSectionId,
} from './markdownExplorerSectionResize'
import { useMarkdownTocModelState } from '@/features/markdown/ui/useMarkdownTocModelState'

export type MarkdownWorkspaceExplorerProps = {
  uiPanelTextFontClass: string

  sidebarWidthPx: number
  sidebarWidthMinPx: number
  sidebarWidthMaxPx: number

  entries: WorkspaceEntry[]
  filteredEntries: WorkspaceEntry[]
  sourcesByPath: WorkspaceSourceIndex | null
  loading: boolean
  loadError: string
  expandedPaths: Set<string>
  toggleExpanded: (path: WorkspacePath) => void
  activePath: WorkspacePath | null
  onSelectFile: (path: WorkspacePath) => void
  onSelectFolder: (path: WorkspacePath) => void

  search: string
  setSearch: (next: string) => void

  sourceFilesCollapsed: boolean
  setSourceFilesCollapsed: (next: boolean) => void
  tocCollapsed: boolean
  setTocCollapsed: (next: boolean) => void
  backlinksCollapsed: boolean
  setBacklinksCollapsed: (next: boolean) => void

  tocTokens: TokenWithLines[]
  backlinks: WorkspaceBacklink[]
  onRevealLine: (line: number) => void
  onOpenBacklink: (args: { path: WorkspacePath; line: number }) => void

  onTocReorder: (parentId: string | null, fromIndex: number, toIndex: number) => void

  onCreateNewFile: (parentPath?: WorkspacePath) => void
  onRefresh: () => void

  canRefreshActiveFromSource: boolean
  onRefreshActiveFromSource: () => void
  onRevealInFinder: (path: WorkspacePath) => void
  onClearFile: (path: WorkspacePath) => void
  onRenameEntry: (path: WorkspacePath, nextName: string) => void
  onDeleteEntry: (path: WorkspacePath) => void

  renderSourceFileRight?: (args: { entry: WorkspaceEntry; isActive: boolean }) => React.ReactNode
}

export const MarkdownWorkspaceExplorer = React.memo(function MarkdownWorkspaceExplorer(props: MarkdownWorkspaceExplorerProps) {
  const {
    uiPanelTextFontClass,
    sidebarWidthPx,
    sidebarWidthMinPx,
    sidebarWidthMaxPx,
    entries,
    filteredEntries,
    sourcesByPath,
    loading,
    loadError,
    expandedPaths,
    toggleExpanded,
    activePath,
    onSelectFile,
    onSelectFolder,
    search,
    setSearch,
    sourceFilesCollapsed,
    setSourceFilesCollapsed,
    tocCollapsed,
    setTocCollapsed,
    backlinksCollapsed,
    setBacklinksCollapsed,
    tocTokens,
    backlinks,
    onRevealLine,
    onOpenBacklink,
    onTocReorder,
    onCreateNewFile,
    onRefresh,
    canRefreshActiveFromSource,
    onRefreshActiveFromSource,
    onRevealInFinder,
    onClearFile,
    onRenameEntry,
    onDeleteEntry,
    renderSourceFileRight,
  } = props
  const panelTypography = usePanelTypography()
  const missionInspection = useAgentRunInspection()
  const sourceFilesSectionRef = React.useRef<HTMLElement | null>(null)
  const tocSectionRef = React.useRef<HTMLElement | null>(null)
  const backlinksSectionRef = React.useRef<HTMLElement | null>(null)
  const [sectionHeightsPx, setSectionHeightsPx] = React.useState<MarkdownExplorerSectionHeightsPx | null>(null)

  const readCurrentSectionHeightsPx = React.useCallback((): MarkdownExplorerSectionHeightsPx | null => {
    return readMarkdownExplorerSectionHeightsPx({
      sourceFilesElement: sourceFilesSectionRef.current,
      tocElement: tocSectionRef.current,
      backlinksElement: backlinksSectionRef.current,
    })
  }, [])

  const setPreviewSectionHeightsPx = React.useCallback((next: MarkdownExplorerSectionHeightsPx) => {
    setSectionHeightsPx(next)
  }, [])

  const commitSectionHeightsPx = React.useCallback((next: MarkdownExplorerSectionHeightsPx) => {
    setSectionHeightsPx(next)
  }, [])

  const resolveSectionStyle = React.useCallback((sectionId: MarkdownExplorerSectionId, collapsed: boolean): React.CSSProperties | undefined => {
    if (collapsed) return undefined
    const heightPx = sectionHeightsPx?.[sectionId]
    if (!Number.isFinite(heightPx) || !heightPx) return undefined
    return {
      flex: `0 0 ${Math.max(MARKDOWN_EXPLORER_SECTION_MIN_HEIGHT_PX, Math.round(heightPx))}px`,
      minHeight: `${MARKDOWN_EXPLORER_SECTION_MIN_HEIGHT_PX}px`,
    }
  }, [sectionHeightsPx])

  const canRefreshActivePathFromSource = React.useCallback(() => {
    const path = activePath
    if (!path) return false
    const source = sourcesByPath?.[path] || loadWorkspaceSourceIndex()[path]
    return !!(source && source.kind === 'url' && String(source.url || '').trim())
  }, [activePath, sourcesByPath])

  const handleRefresh = React.useCallback(() => {
    if (canRefreshActiveFromSource || canRefreshActivePathFromSource()) {
      onRefreshActiveFromSource()
      return
    }
    onRefresh()
  }, [canRefreshActiveFromSource, canRefreshActivePathFromSource, onRefresh, onRefreshActiveFromSource])
  const sourceFileCount = React.useMemo(() => entries.reduce((count, e) => (e.kind === 'file' ? count + 1 : count), 0), [entries])
  const {
    activeItemId: activeTocId,
    baseDepth: tocBaseDepth,
    collapsedIds: tocCollapsedIds,
    headingNumberById: tocHnById,
    items: tocItems,
    onNavRefChange,
    onReorderByIds: handleTocReorderByIds,
    onSelectItem: handleTocSelect,
    toggleExpanded: toggleTocExpanded,
  } = useMarkdownTocModelState({
    resetKey: activePath,
    tocCollapsed,
    tokens: tocTokens,
    onRevealLine,
    onReorder: onTocReorder,
  })

  return (
    <aside
      className={`kg-markdown-workspace-explorer h-full min-h-0 flex flex-col ${UI_THEME_TOKENS.panel.bg}`}
      style={{ width: Math.max(sidebarWidthMinPx, Math.min(sidebarWidthMaxPx, sidebarWidthPx)) }}
      aria-label="Markdown Explorer"
    >
      <WorkspaceHeaderRow className="kg-markdown-workspace-panel-toolbar-row kg-markdown-workspace-explorer-toolbar-row gap-2 px-2 !py-0" ariaLabel="Explorer header">
        <section className="min-w-0 max-w-full flex-1 flex items-center gap-2 overflow-hidden" aria-label="Explorer title">
          <h2 className={`${panelTypography.microLabelClass} font-semibold tracking-wide uppercase ${UI_THEME_TOKENS.text.secondary} ${UI_TEXT_TRUNCATE}`}>Explorer</h2>
        </section>
        <MarkdownWorkspaceExplorerHeaderActions
          panelTextClass={panelTypography.panelTextClass}
          onRefresh={handleRefresh}
          search={search}
          setSearch={setSearch}
        />
      </WorkspaceHeaderRow>

      <section className={UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_CONTENT_CLASSNAME} aria-label="Explorer content">
        <MarkdownExplorerSection
          title="Source Files"
          collapsed={sourceFilesCollapsed}
          setCollapsed={setSourceFilesCollapsed}
          sectionRef={element => {
            sourceFilesSectionRef.current = element
          }}
          sectionStyle={resolveSectionStyle('sourceFiles', sourceFilesCollapsed)}
          scrollMode="primary"
          right={<span className={`${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.secondary}`}>{sourceFileCount + (matchesAgentMissionSource(search) ? 1 + Number(!!missionInspection) : 0)}</span>}
        >
          <MarkdownWorkspaceSourceFilesList
            search={search}
            loading={loading}
            loadError={loadError}
            textSizeClass={panelTypography.textSizeClass}
            entries={filteredEntries}
            expandedPaths={expandedPaths}
            activePath={activePath}
            toggleExpanded={toggleExpanded}
            onSelectFile={onSelectFile}
            onSelectFolder={onSelectFolder}
            sourcesByPath={sourcesByPath}
            onCreateNewFile={onCreateNewFile}
            onRevealInFinder={onRevealInFinder}
            onClearFile={onClearFile}
            onRenameEntry={onRenameEntry}
            onDeleteEntry={onDeleteEntry}
            renderFileRight={renderSourceFileRight}
          />
        </MarkdownExplorerSection>

        {!sourceFilesCollapsed && !tocCollapsed ? (
          <MarkdownExplorerSectionResizeHandle
            ariaLabel="Resize Source Files and TOC"
            boundary="sourceFiles-toc"
            readCurrentHeightsPx={readCurrentSectionHeightsPx}
            setPreviewHeightsPx={setPreviewSectionHeightsPx}
            commitHeightsPx={commitSectionHeightsPx}
          />
        ) : null}

        <MarkdownExplorerSection
          title="TOC"
          collapsed={tocCollapsed}
          setCollapsed={setTocCollapsed}
          sectionRef={element => {
            tocSectionRef.current = element
          }}
          sectionStyle={resolveSectionStyle('toc', tocCollapsed)}
          scrollMode={tocItems.length > 0 || sectionHeightsPx ? 'secondary' : 'auto'}
        >
          <MarkdownWorkspaceTocList
            items={tocItems}
            panelTextClass={panelTypography.panelTextClass}
            onNavRefChange={onNavRefChange}
          >
            <MarkdownWorkspaceTocTree
              items={tocItems}
              collapsedIds={tocCollapsedIds}
              activeItemId={activeTocId}
              headingNumbersById={tocHnById}
              baseDepth={tocBaseDepth}
              onToggleExpanded={toggleTocExpanded}
              onSelect={handleTocSelect}
              onReorder={handleTocReorderByIds}
              uiPanelTextFontClass={uiPanelTextFontClass}
              uiPanelKeyValueTextSizeClass={panelTypography.textSizeClass}
            />
          </MarkdownWorkspaceTocList>
        </MarkdownExplorerSection>

        {!tocCollapsed && !backlinksCollapsed ? (
          <MarkdownExplorerSectionResizeHandle
            ariaLabel="Resize TOC and Backlinks"
            boundary="toc-backlinks"
            readCurrentHeightsPx={readCurrentSectionHeightsPx}
            setPreviewHeightsPx={setPreviewSectionHeightsPx}
            commitHeightsPx={commitSectionHeightsPx}
          />
        ) : null}

        <MarkdownExplorerSection
          title="Backlinks"
          collapsed={backlinksCollapsed}
          setCollapsed={setBacklinksCollapsed}
          sectionRef={element => {
            backlinksSectionRef.current = element
          }}
          sectionStyle={resolveSectionStyle('backlinks', backlinksCollapsed)}
          scrollMode={backlinks.length > 0 || sectionHeightsPx ? 'secondary' : 'auto'}
        >
          <MarkdownWorkspaceBacklinksList
            activePath={activePath}
            backlinks={backlinks}
            textSizeClass={panelTypography.textSizeClass}
            panelTextClass={panelTypography.panelTextClass}
            onOpenBacklink={onOpenBacklink}
          />
        </MarkdownExplorerSection>
      </section>
    </aside>
  )
})
