import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_COPY } from '@/lib/config'
import type { TokenWithLines } from './markdownPreviewLex'
import { slugify } from 'grph-shared/markdown/slugify'
import { bindResizeSeparatorDragRuntime } from '@/lib/ui/resizeSeparatorDrag'
import type {
  MarkdownSourceFilesPanelIntegration,
  MarkdownSourceFileListItem,
} from './markdownSourceFilesPanelTypes'
import { MarkdownSidebarFrame } from './MarkdownSidebarFrame'
import { buildMarkdownSidebarTitleClassName } from './markdownSidebarText'
import { VerticalResizeSeparatorHr } from '@/components/ui/VerticalResizeSeparatorHr'
import { MarkdownSourceFilesSidebarSection } from './MarkdownSourceFilesSidebarSection'
import { MarkdownBacklinksSidebarSection } from './MarkdownBacklinksSidebarSection'
import { MarkdownOutlineSidebarSection } from './MarkdownOutlineSidebarSection'
import { useMarkdownExplorerSectionCollapseState } from './useMarkdownExplorerSectionCollapseState'
import { persistMarkdownExplorerChromeState, readMarkdownExplorerChromeState } from './markdownExplorerChromePersistence'
import { normalizeDocumentVersionPath } from '@/features/document-versioning/documentVersioning'
import { useDocumentVersionRecords } from '@/features/document-versioning/useDocumentVersions'

const SIDEBAR_MIN_PX = 160
const SIDEBAR_MAX_PX = 560

export type MarkdownPanelLayoutProps = {
  children: React.ReactNode
  tokens?: TokenWithLines[]
  uiPanelTextFontClass: string
  uiPanelKeyValueTextSizeClass?: string
  uiPanelMicroLabelTextSizeClass?: string
  showSidebar: boolean
  onTocSelect?: (id: string) => void
  onTocDoubleClick?: (id: string) => void
  onTocReorder?: (parentId: string | null, fromIndex: number, toIndex: number) => void
  sidebarContent?: React.ReactNode
  sidebarAppendContent?: React.ReactNode
  className?: string
  sidebarPosition?: 'left' | 'right'
  collapsedIds?: Set<string>
  onToggleCollapse?: (id: string) => void
  onExpandAll?: () => void
  onCollapseAll?: () => void
  allCollapsed?: boolean
  hideSidebarHeader?: boolean
  sourceFiles?: Array<{ id: string; name: string; text?: string | null; active?: boolean }>
  onSourceFileSelect?: (id: string) => void
  sourceFilesPanelIntegration?: MarkdownSourceFilesPanelIntegration
}

export type MarkdownViewerWidthMode = 'standard' | 'wide'

export function MarkdownPanelLayout(props: MarkdownPanelLayoutProps) {
  const {
    children,
    tokens,
    uiPanelTextFontClass,
    uiPanelKeyValueTextSizeClass,
    uiPanelMicroLabelTextSizeClass,
    showSidebar,
    onTocSelect,
    onTocDoubleClick,
    onTocReorder,
    sidebarContent,
    sidebarAppendContent,
    className,
    sidebarPosition = 'left',
    collapsedIds,
    onToggleCollapse,
    onExpandAll,
    onCollapseAll,
    allCollapsed: propsAllCollapsed,
    hideSidebarHeader,
    sourceFiles,
    onSourceFileSelect,
    sourceFilesPanelIntegration,
  } = props

  const documentVersionSnapshot = useDocumentVersionRecords()
  const derivedAllCollapsed = React.useMemo(() => {
    if (!onExpandAll && !onCollapseAll) return undefined
    if (!tokens || !collapsedIds) return undefined

    const allHeadingIds = new Set<string>()
    tokens.forEach(t => {
      if (t.type !== 'heading') return
      const rawId = typeof t.id === 'string' ? t.id.trim() : ''
      const id = rawId || slugify(String(t.text || ''))
      if (id) allHeadingIds.add(id)
    })

    if (allHeadingIds.size === 0) return false
    for (const id of allHeadingIds) {
      if (!collapsedIds.has(id)) return false
    }
    return true
  }, [collapsedIds, onCollapseAll, onExpandAll, tokens])

  const allCollapsed = propsAllCollapsed ?? derivedAllCollapsed ?? false

  const sidebarBorderClass = sidebarPosition === 'right' ? 'border-l' : 'border-r'
  const sourceFilesList: MarkdownSourceFileListItem[] | undefined = React.useMemo(() => {
    const list = Array.isArray(sourceFiles) ? sourceFiles : []
    return list.map(f => {
      const name = String(f.name || '')
      return {
        id: String(f.id || ''),
        name,
        active: !!f.active,
        versionCount: documentVersionSnapshot.countsByPath[normalizeDocumentVersionPath(name)] || 0,
      }
    })
  }, [documentVersionSnapshot.countsByPath, sourceFiles])

  const activeSourceFileKey = React.useMemo(() => {
    const list = Array.isArray(sourceFiles) ? sourceFiles : []
    const active = list.find(f => f.active)
    if (active?.name) return String(active.name)
    return list.length === 1 ? String(list[0]?.name || '') : ''
  }, [sourceFiles])

  const [sidebarWidthPx, setSidebarWidthPx] = React.useState(() => {
    return readMarkdownExplorerChromeState({
      minWidthPx: SIDEBAR_MIN_PX,
      maxWidthPx: SIDEBAR_MAX_PX,
      defaultWidthPx: 256,
    }).sidebarWidthPx
  })

  const [resizeHandleEl, setResizeHandleEl] = React.useState<HTMLHRElement | null>(null)
  React.useEffect(() => {
    if (!resizeHandleEl || !showSidebar) return
    return bindResizeSeparatorDragRuntime<number>({
      resizeHandleEl, cursor: 'col-resize', readCurrentValue: () => sidebarWidthPx,
      setPreviewValue: setSidebarWidthPx,
      commitValue: next => persistMarkdownExplorerChromeState(
        { sidebarWidthPx: next },
        { minWidthPx: SIDEBAR_MIN_PX, maxWidthPx: SIDEBAR_MAX_PX, defaultWidthPx: 256 },
      ),
      resolveNextValueFromPointerDrag: ({ startValue, deltaX }) => Math.max(SIDEBAR_MIN_PX,
        Math.min(SIDEBAR_MAX_PX, Math.round(startValue + (sidebarPosition === 'right' ? -deltaX : deltaX)))),
    })
  }, [resizeHandleEl, showSidebar, sidebarPosition, sidebarWidthPx])
  const sidebarFrameTitleClassName = buildMarkdownSidebarTitleClassName({
    uiPanelTextFontClass,
    uiPanelMicroLabelTextSizeClass,
    uiPanelKeyValueTextSizeClass,
    textColorClassName: UI_THEME_TOKENS.text.tertiary,
  })

  const {
    sourceFilesCollapsed: sourceFilesSectionCollapsed,
    outlineCollapsed: outlineSectionCollapsed,
    backlinksCollapsed: backlinksSectionCollapsed,
    toggleSourceFilesCollapsed,
    toggleOutlineCollapsed,
    toggleBacklinksCollapsed,
  } = useMarkdownExplorerSectionCollapseState()

  const renderAside = (
    <MarkdownSidebarFrame
      ariaLabel="Markdown sidebar"
      className={`relative z-10 flex-shrink-0 flex flex-col h-full ${sidebarBorderClass} ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg} transition-all duration-300 ${
        showSidebar ? '' : 'w-0 overflow-hidden'
      }`}
      style={showSidebar ? { width: `${Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, sidebarWidthPx))}px` } : undefined}
      hideHeader={hideSidebarHeader}
      title={UI_COPY.markdownExplorerLabel || 'Explorer'}
      titleClassName={sidebarFrameTitleClassName}
      headerRight={null}
    >
      {sidebarContent ? (
        sidebarContent
      ) : (
        <section className="flex-1 flex flex-col min-h-0 overflow-hidden" aria-label="Markdown panel sidebar">
          <nav className="flex-1 overflow-auto" aria-label="Explorer">
            {sourceFilesPanelIntegration ? (
              <MarkdownSourceFilesSidebarSection
                uiPanelTextFontClass={uiPanelTextFontClass}
                uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
                uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
                sourceFiles={sourceFilesList}
                onSourceFileSelect={onSourceFileSelect}
                integration={sourceFilesPanelIntegration}
                collapsed={sourceFilesSectionCollapsed}
                onToggleCollapsed={toggleSourceFilesCollapsed}
              />
            ) : null}

            {tokens ? (
              <MarkdownOutlineSidebarSection
                tokens={tokens}
                uiPanelTextFontClass={uiPanelTextFontClass}
                uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
                uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
                onTocSelect={onTocSelect}
                onTocDoubleClick={onTocDoubleClick}
                onTocReorder={onTocReorder}
                allCollapsed={allCollapsed}
                collapsedIds={collapsedIds}
                onToggleCollapse={onToggleCollapse}
                collapsed={outlineSectionCollapsed}
                onToggleCollapsed={toggleOutlineCollapsed}
              />
            ) : null}

            {Array.isArray(sourceFiles) && sourceFiles.length > 0 ? (
              <MarkdownBacklinksSidebarSection
                uiPanelTextFontClass={uiPanelTextFontClass}
                uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
                uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
                activeDocumentKey={activeSourceFileKey || null}
                sourceFiles={sourceFiles}
                onSourceFileSelect={onSourceFileSelect}
                collapsed={backlinksSectionCollapsed}
                onToggleCollapsed={toggleBacklinksCollapsed}
              />
            ) : null}

            {sidebarAppendContent}
          </nav>
        </section>
      )}
    </MarkdownSidebarFrame>
  )

  return (
    <section className={`flex flex-1 min-h-0 relative h-full ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary} ${className || ''}`}>
      {sidebarPosition === 'left' ? renderAside : null}
      {sidebarPosition === 'left' && showSidebar ? (
        <VerticalResizeSeparatorHr
          ariaLabel="Resize explorer"
          tabIndex={0}
          ref={setResizeHandleEl}
          visualStyle="centerGrip"
          className="relative z-20 flex-shrink-0 self-stretch pointer-events-auto"
        />
      ) : null}
      <main className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      {sidebarPosition === 'right' && showSidebar ? (
        <VerticalResizeSeparatorHr
          ariaLabel="Resize explorer"
          tabIndex={0}
          ref={setResizeHandleEl}
          visualStyle="centerGrip"
          className="relative z-20 flex-shrink-0 self-stretch pointer-events-auto"
        />
      ) : null}
      {sidebarPosition === 'right' ? renderAside : null}
    </section>
  )
}
