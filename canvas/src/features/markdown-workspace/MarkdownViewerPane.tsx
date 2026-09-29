import React from 'react'
import MarkdownPreview, {
  type MarkdownPreviewPresentationApi,
  type MarkdownPreviewPresentationSlideState,
} from '@/features/markdown/ui/MarkdownPreview'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_COPY } from '@/lib/config'
import type { MarkdownSelectionInfo } from './markdownUtils'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import type { MarkdownGeoDatasetIntegration } from '@/features/markdown/ui/MarkdownRendererTypes'
import type { MarkdownSourceFilesPanelIntegration } from '@/features/markdown/ui/markdownSourceFilesPanelTypes'

type MarkdownViewerPaneProps = {
  viewerRef: React.RefObject<HTMLElement>
  handleViewerScroll: (event: React.UIEvent<HTMLElement>) => void
  markdownPreviewText: string
  previewBasePath: string
  highlightedLineRange: { start: number; end: number } | null
  markdownWordWrap: boolean
  markdownPresentationMode: boolean
  markdownTextHighlight: boolean
  sidebarPosition?: 'left' | 'right'
  stickyHeadingTopPx?: number
  selectionInfo: MarkdownSelectionInfo | null
  flashSelectionId: string | null
  presentationApiRef: React.RefObject<MarkdownPreviewPresentationApi | null>
  setPresentationSlideState: (next: MarkdownPreviewPresentationSlideState | null) => void
  uiPanelTextFontClass: string
  uiPanelMonospaceTextClass: string
  annotateDisplayMode: 'inline' | 'beside' | 'render'
  onShowInGraphDataTable?: (line: number) => void
  onShowInGallery?: (line: number) => void
  onShowInEditor: (line: number) => void
  isMarkdownPreviewTruncated: boolean
  uiPanelKeyValueTextSizeClass: string
  flashLine?: number | null
  tokens?: TokenWithLines[]
  markdownViewerWidthMode?: 'standard' | 'wide'
  viewMode?: 'viewer' | 'presentation' | 'gallery'
  showSidebar?: boolean
  onToggleSidebar?: (show: boolean) => void
  collapsedIds?: Set<string>
  onToggleCollapse?: (id: string) => void
  onExpandAll?: () => void
  onCollapseAll?: () => void
  onTocSelect?: (id: string) => void
  onTocDoubleClick?: (id: string) => void
  onTocReorder?: (parentId: string | null, fromIndex: number, toIndex: number) => void
  onInsertLineAfter?: (afterLine: number) => void
  onReorderLineBlock?: (
    source: { startLine: number; endLine: number },
    target: { startLine: number; endLine: number },
    position: 'before' | 'after',
  ) => void
  onReplaceLineRange?: (args: { startLine: number; endLine: number; replacementLines: string[] }) => void
  sourceFiles?: Array<{ id: string; name: string; active?: boolean }>
  onSourceFileSelect?: (id: string) => void
  sourceFilesPanelIntegration?: MarkdownSourceFilesPanelIntegration
  geoDatasetIntegration?: MarkdownGeoDatasetIntegration
}

export function MarkdownViewerPane(props: MarkdownViewerPaneProps) {
  const {
    viewerRef,
    handleViewerScroll,
    markdownPreviewText,
    previewBasePath,
    highlightedLineRange,
    markdownWordWrap,
    markdownPresentationMode,
    markdownTextHighlight,
    sidebarPosition,
    stickyHeadingTopPx,
    selectionInfo,
    flashSelectionId,
    presentationApiRef,
    setPresentationSlideState,
    uiPanelTextFontClass,
    uiPanelMonospaceTextClass,
    annotateDisplayMode,
    onShowInGraphDataTable,
    onShowInGallery,
    onShowInEditor,
    isMarkdownPreviewTruncated,
    uiPanelKeyValueTextSizeClass,
    flashLine,
    tokens,
    markdownViewerWidthMode,
    viewMode,
    showSidebar,
    onToggleSidebar,
    collapsedIds,
    onToggleCollapse,
    onExpandAll,
    onCollapseAll,
    onTocSelect,
    onTocDoubleClick,
    onTocReorder,
    onInsertLineAfter,
    onReorderLineBlock,
    onReplaceLineRange,
    sourceFiles,
    onSourceFileSelect,
    sourceFilesPanelIntegration,
    geoDatasetIntegration,
  } = props

  const hasPreviewText = React.useMemo(() => {
    return !!String(markdownPreviewText || '').trim()
  }, [markdownPreviewText])

  const showMissingDocumentPathNote = React.useMemo(() => {
    if (hasPreviewText) return false
    if (!selectionInfo) return false
    const path = String(selectionInfo.documentPath || '').trim()
    return !path
  }, [hasPreviewText, selectionInfo])

  return (
    <article className="flex-1 min-h-0 flex flex-col w-full max-w-none">
      {isMarkdownPreviewTruncated && (
        <aside
          className={[
            uiPanelKeyValueTextSizeClass,
            `px-2 py-1 border-b ${UI_THEME_TOKENS.panel.divider} ${UI_THEME_TOKENS.panel.headerBg} text-xs ${UI_THEME_TOKENS.text.tertiary}`,
          ].join(' ')}
          role="note"
        >
          {UI_COPY.markdownPreviewTruncatedHelperText}
        </aside>
      )}
      {showMissingDocumentPathNote && (
        <aside
          className={[
            uiPanelKeyValueTextSizeClass,
            `px-2 py-1 border-b ${UI_THEME_TOKENS.panel.divider} ${UI_THEME_TOKENS.panel.headerBg} text-xs ${UI_THEME_TOKENS.text.tertiary}`,
          ].join(' ')}
          role="note"
        >
          {UI_COPY.markdownWorkspaceMissingDocumentPathLabel}
        </aside>
      )}
      <MarkdownPreview
        ref={viewerRef}
        markdownText={markdownPreviewText}
        activeDocumentPath={previewBasePath}
        highlightedLineRange={highlightedLineRange}
        markdownWordWrap={markdownWordWrap}
        markdownPresentationMode={markdownPresentationMode}
        markdownTextHighlight={markdownTextHighlight}
        sidebarPosition={sidebarPosition}
        stickyHeadingTopPx={stickyHeadingTopPx}
        selectionKind={selectionInfo?.kind}
        highlightBackgroundColor={selectionInfo?.highlightBackgroundColor}
        highlightUnderlineColor={selectionInfo?.highlightUnderlineColor}
        selectionId={flashSelectionId}
        presentationApiRef={presentationApiRef}
        onPresentationSlideStateChange={setPresentationSlideState}
        uiPanelTextFontClass={uiPanelTextFontClass}
        uiPanelMonospaceTextClass={uiPanelMonospaceTextClass}
        annotateDisplayMode={annotateDisplayMode}
        onShowInGraphDataTable={onShowInGraphDataTable}
        onShowInGallery={onShowInGallery}
        onShowInEditor={onShowInEditor}
        onScroll={handleViewerScroll}
        flashLine={flashLine}
        tokens={tokens}
        markdownViewerWidthMode={markdownViewerWidthMode}
        viewMode={viewMode}
        showSidebar={showSidebar}
        onToggleSidebar={onToggleSidebar}
        collapsedIds={collapsedIds}
        onToggleCollapse={onToggleCollapse}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
        onTocSelect={onTocSelect}
        onTocDoubleClick={onTocDoubleClick}
        onTocReorder={onTocReorder}
        onInsertLineAfter={onInsertLineAfter}
        onReorderLineBlock={onReorderLineBlock}
        onReplaceLineRange={onReplaceLineRange}
        sourceFiles={sourceFiles}
        onSourceFileSelect={onSourceFileSelect}
        sourceFilesPanelIntegration={sourceFilesPanelIntegration}
        geoDatasetIntegration={geoDatasetIntegration}
      />
    </article>
  )
}
