import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'
import { LS_KEYS } from '@/lib/config'
import { lsBool } from '@/lib/persistence'
import {
  parseMermaidConfigFromFrontmatter,
  useRootThemeMode,
} from '@/features/panels/views/preview-panel/ui/mermaidConfig'
import { splitSlides } from '@/features/markdown/ui/markdownPreviewSlides'
import { buildSlidePreview } from '@/features/markdown/ui/markdownPresentationSlides'
import { splitMarkdownLines } from '@/lib/markdown'
import type {
  HighlightedLineRange,
  MarkdownGeoDatasetIntegration,
  MarkdownInlineDraftTextChangeOptions,
  MarkdownViewerMediaMode,
} from './MarkdownRendererTypes'
import { useMarkdownPresentation } from './useMarkdownPresentation'
import { MarkdownPreviewViewer } from '@/lib/markdown-core/ui/MarkdownPreviewViewer.impl'
import { MarkdownInlineSelectionActionsContext } from '@/lib/markdown-core/ui/markdownInlineSelectionActions'
import type { SsotSurface } from 'grph-shared/ssot/types'
import { findSelectionTarget } from '@/features/markdown/ui/markdownPreviewSelection'
import { findLineRangeFromTarget } from '@/features/markdown/ui/markdownPreviewContextMenuUtils'
import { useMarkdownPreviewLexedMarkdown } from '@/features/markdown/ui/useMarkdownPreviewTokens'
import { useSelectionFlash } from '@/features/markdown/ui/useSelectionFlash'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import type { MarkdownSourceFilesPanelIntegration } from '@/features/markdown/ui/markdownSourceFilesPanelTypes'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const MarkdownPreviewGallery = React.lazy(() => import('@/features/markdown/ui/MarkdownPreviewGallery').then(mod => ({ default: mod.MarkdownPreviewGallery })))
const MarkdownPreviewPresentation = React.lazy(() => import('@/features/markdown/ui/MarkdownPreviewPresentation').then(mod => ({ default: mod.MarkdownPreviewPresentation })))

export type MarkdownPreviewPresentationApi = {
  prev: () => void
  next: () => void
  enterFullscreen?: () => void
  setShowSlideThumbnails?: (show: boolean) => void
}

export type MarkdownPreviewPresentationSlideState = {
  activeSlideIndex: number
  slideCount: number
  activeSlideLine: number
}

type MarkdownPreviewProps = {
  markdownText: string
  activeDocumentPath: string
  highlightedLineRange: HighlightedLineRange
  markdownWordWrap: boolean
  markdownPresentationMode: boolean
  markdownTextHighlight: boolean
  sidebarPosition?: 'left' | 'right'
  selectionKind?: 'node' | 'edge' | null
  highlightBackgroundColor?: string | null
  highlightUnderlineColor?: string | null
  selectionId?: string | null
  stickyHeadingTopClass?: string
  stickyHeadingTopPx?: number
  presentationApiRef?: React.MutableRefObject<MarkdownPreviewPresentationApi | null>
  onPresentationSlideStateChange?: (state: MarkdownPreviewPresentationSlideState) => void
  uiPanelTextFontClass: string
  uiPanelMonospaceTextClass: string
  previewOverlayScope?: 'viewport' | 'container'
  previewOverlayPortalTarget?: HTMLElement | null
  previewScrollable?: boolean
  onScroll?: (event: React.UIEvent<HTMLElement>) => void
  onSlidesReordered?: (nextOrder: number[]) => void
  onPreviewClick?: (line: number) => void
  tokens?: TokenWithLines[]
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
  frontmatterMermaidCode?: string
  onShowInViewer?: (line: number) => void
  onShowInEditor?: (line: number) => void
  onShowInPresentation?: (line: number) => void
  onShowInGallery?: (line: number) => void
  onShowInGraphDataTable?: (line: number) => void
  annotateDisplayMode?: 'inline' | 'beside' | 'render'
  flashLine?: number | null
  markdownViewerWidthMode?: 'standard' | 'wide'
  viewMode?: 'viewer' | 'presentation' | 'gallery'
  sourceFiles?: Array<{ id: string; name: string; text?: string | null; active?: boolean }>
  onSourceFileSelect?: (id: string) => void
  sourceFilesPanelIntegration?: MarkdownSourceFilesPanelIntegration
  geoDatasetIntegration?: MarkdownGeoDatasetIntegration
  webpageLayoutWireframeAscii?: string | null
  markdownForcePlainTables?: boolean
  forbidCopy?: boolean
  onInlineEditStateChange?: (active: boolean) => void
  onInlineDraftTextChange?: (nextText: string, options?: MarkdownInlineDraftTextChangeOptions) => void
  markdownTokenStoreSync?: boolean
  contentClassName?: string
  markdownCardPreviewMode?: boolean
  markdownViewerMediaMode?: MarkdownViewerMediaMode
  galleryZoomScale?: number
}

const MarkdownPreview = React.forwardRef<HTMLElement, MarkdownPreviewProps>(function MarkdownPreview(
  {
    markdownText,
    activeDocumentPath,
    highlightedLineRange,
    markdownWordWrap,
    markdownPresentationMode,
    markdownTextHighlight,
    sidebarPosition,
    selectionKind,
    highlightBackgroundColor,
    highlightUnderlineColor,
    selectionId,
    stickyHeadingTopClass,
    stickyHeadingTopPx,
    presentationApiRef,
    onPresentationSlideStateChange,
    uiPanelTextFontClass,
    uiPanelMonospaceTextClass,
    previewOverlayScope = 'viewport',
    previewOverlayPortalTarget,
    previewScrollable = true,
    onScroll,
    onSlidesReordered,
    onPreviewClick,
    tokens: providedTokens,
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
    frontmatterMermaidCode: frontmatterMermaidCodeProp,
    onShowInViewer,
    onShowInEditor,
    onShowInPresentation,
    onShowInGallery,
    onShowInGraphDataTable,
    annotateDisplayMode,
    flashLine,
    markdownViewerWidthMode,
    viewMode = 'viewer',
    sourceFiles,
    onSourceFileSelect,
    sourceFilesPanelIntegration,
    geoDatasetIntegration,
    webpageLayoutWireframeAscii,
    markdownForcePlainTables,
    forbidCopy,
    onInlineEditStateChange,
    onInlineDraftTextChange,
    markdownTokenStoreSync = true,
    contentClassName,
    markdownCardPreviewMode,
    markdownViewerMediaMode: markdownViewerMediaModeProp,
    galleryZoomScale,
  },
  ref,
) {
  const persistedMarkdownViewerMediaMode = useGraphStore(s => s.markdownViewerMediaMode || 'chip')
  const markdownViewerMediaMode = markdownViewerMediaModeProp || persistedMarkdownViewerMediaMode
  const { flashSelectionId, flashAlpha } = useSelectionFlash(selectionId)
  const rootThemeMode = useRootThemeMode()

  const rootElRef = React.useRef<HTMLElement | null>(null)
  const setRootRef = React.useCallback((el: HTMLElement | null) => {
    rootElRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = el
  }, [ref])

  const { tokens, meta: cachedHeadMeta, startLineOffset } = useMarkdownPreviewLexedMarkdown(
    markdownText || '',
    providedTokens,
    activeDocumentPath,
    markdownTokenStoreSync,
  )

  const frontmatterRawText = React.useMemo(() => {
    const lines = splitMarkdownLines(markdownText || '')
    if (!lines.length) return null
    if (String(lines[0] || '').trim() !== '---') return null
    if (!startLineOffset || startLineOffset <= 0) return null
    const raw = lines.slice(0, startLineOffset).join('\n')
    return raw.trim() ? raw : null
  }, [markdownText, startLineOffset])

  const { headMeta, slides } = React.useMemo(
    () =>
      splitSlides(markdownText || '', {
        headMeta: cachedHeadMeta,
        headStartIndex: startLineOffset,
      }),
    [markdownText, cachedHeadMeta, startLineOffset],
  )

  const codeAnnotations = React.useMemo(() => {
    const meta = headMeta as Record<string, unknown>
    const raw = (meta.codeAnnotations || meta.code_annotations) as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const source = raw as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(source)) {
      const key = String(k || '').trim()
      if (!key) continue
      let val: string | null = null
      if (typeof v === 'string') {
        val = v
      } else if (v != null) {
        try {
          val = JSON.stringify(v)
        } catch {
          val = String(v)
        }
      }
      if (val && val.trim()) {
        out[key] = val
      }
    }
    return Object.keys(out).length ? out : null
  }, [headMeta])

  const mermaidFrontmatterConfig = React.useMemo(
    () => parseMermaidConfigFromFrontmatter(headMeta),
    [headMeta],
  )
  const computedFrontmatterMermaidCode = React.useMemo(() => {
    const meta = headMeta as Record<string, unknown>
    const raw = String(meta.mermaid || '').trim()
    return raw
  }, [headMeta])

  const frontmatterMermaidCode = frontmatterMermaidCodeProp ?? computedFrontmatterMermaidCode
  const isPresentationMode = markdownPresentationMode || viewMode === 'presentation'

  const [showSlidesSidebar, setShowSlidesSidebar] = React.useState<boolean>(() =>
    lsBool(LS_KEYS.previewSlidesShowThumbnails, false),
  )

  const {
    setActiveSlideIndex,
    slideOrder,
    setSlideOrder,
    orderedSlideIndices,
    activeSlideId,
    activeFragmentConfig,
    activeFragmentStep,
    goPrev,
    goNext,
    handleRegisterFullscreenHandler,
    enterFullscreen,
  } = useMarkdownPresentation({
    slides,
    headMeta: headMeta as Record<string, unknown>,
    markdownPresentationMode: isPresentationMode,
    highlightedLineRange,
    presentationApiRef,
    onPresentationSlideStateChange,
    onSlidesReordered,
    setShowSlideThumbnails: setShowSlidesSidebar,
  })

  React.useEffect(() => {
    if (presentationApiRef) {
      presentationApiRef.current = {
        prev: goPrev,
        next: goNext,
        enterFullscreen,
        setShowSlideThumbnails: setShowSlidesSidebar,
      }
    }
  }, [presentationApiRef, goPrev, goNext, enterFullscreen, setShowSlidesSidebar])

  const graphData = useGraphStore(s => s.graphData)
  const setSelectionSource = useGraphStore(s => s.setSelectionSource)
  const selectNode = useGraphStore(s => s.selectNode)
  const selectEdge = useGraphStore(s => s.selectEdge)

  const inlineEditActiveRef = React.useRef(false)
  const handleInlineEditStateChange = React.useCallback((active: boolean) => {
    if (inlineEditActiveRef.current === active) return
    inlineEditActiveRef.current = active
    onInlineEditStateChange?.(active)
  }, [onInlineEditStateChange])

  const handleShowOnCanvas = React.useCallback(
    (startLine: number, endLine: number) => {
      const target = findSelectionTarget(graphData as GraphData | null, activeDocumentPath, startLine, endLine)
      if (!target) return
      setSelectionSource('editor')
      if (target.kind === 'node') {
        selectNode(target.id)
      } else {
        selectEdge(target.id)
      }
    },
    [activeDocumentPath, graphData, selectEdge, selectNode, setSelectionSource],
  )
  const canShowOnCanvas = React.useCallback(
    (startLine: number, endLine: number) =>
      Boolean(findSelectionTarget(graphData as GraphData | null, activeDocumentPath, startLine, endLine)),
    [activeDocumentPath, graphData],
  )

  const handleClick = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!event.metaKey) return
    const rootEl = rootElRef.current
    if (!rootEl) return
    const range = findLineRangeFromTarget(rootEl, event.target)
    if (!range) return
    event.preventDefault()
    event.stopPropagation()
    handleShowOnCanvas(range.startLine, range.endLine)
  }, [handleShowOnCanvas])

  const flashActive = !!flashSelectionId && !!selectionId && flashSelectionId === selectionId
  const flashBg = flashActive ? `rgba(249,115,22,${flashAlpha})` : null
  const flashUnderline = flashActive ? '#fbbf24' : null
  const effectiveHighlightBackgroundColor = flashBg || highlightBackgroundColor || null
  const effectiveHighlightUnderlineColor = flashUnderline || highlightUnderlineColor || null


  React.useEffect(() => {
    if (!isPresentationMode) return
    const el = rootElRef.current
    if (!el) return
    el.focus?.()
  }, [isPresentationMode])

  const scrollClass = previewScrollable ? 'overflow-auto' : 'overflow-hidden'

  const currentView: SsotSurface = viewMode === 'gallery' ? 'markdown.gallery' : markdownPresentationMode ? 'markdown.presentation' : 'markdown.viewer'
  const inlineSelectionActionsValue = React.useMemo(() => {
    return {
      onShowOnCanvas: handleShowOnCanvas,
      canShowOnCanvas,
      onShowInViewer,
      onShowInEditor,
      onShowInPresentation,
      onShowInGallery,
      onShowInGraphDataTable,
      currentView,
    }
  }, [canShowOnCanvas, currentView, handleShowOnCanvas, onShowInEditor, onShowInGraphDataTable, onShowInPresentation, onShowInGallery, onShowInViewer])

  const activeSlideHeading = React.useMemo(() => {
    const slide = slides[activeSlideId]
    if (!slide || !slide.text) return ''
    const lines = splitMarkdownLines(slide.text)
    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i] || ''
      const trimmed = raw.trim()
      if (!trimmed.startsWith('#')) continue
      const heading = trimmed.replace(/^#+\s*/, '').trim()
      if (!heading) continue
      if (heading.length <= 60) return heading
      return `${heading.slice(0, 57)}...`
    }
    return ''
  }, [activeSlideId, slides])

  const renderSlidePreview = React.useCallback(
    (slideIdx: number) =>
      buildSlidePreview({
        slideIdx,
        slides,
        headMeta: headMeta as Record<string, unknown>,
        activeDocumentPath,
        uiPanelTextFontClass,
        uiPanelMonospaceTextClass,
        mermaidFrontmatterConfig: mermaidFrontmatterConfig as Record<string, unknown> | null,
        rootThemeMode,
        previewOverlayScope,
        previewOverlayPortalTarget: previewOverlayPortalTarget || null,
        fullDocTokens: tokens,
        previewDensity: viewMode === 'gallery' ? 'gallery-card' : 'presentation',
      }),
    [
      slides,
      headMeta,
      activeDocumentPath,
      uiPanelTextFontClass,
      uiPanelMonospaceTextClass,
      mermaidFrontmatterConfig,
      rootThemeMode,
      previewOverlayScope,
      previewOverlayPortalTarget,
      tokens,
      viewMode,
    ],
  )

  if (viewMode === 'gallery') {
    return (
      <section className={`flex-1 min-h-0 flex flex-col overflow-hidden ${uiPanelTextFontClass} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`}>
        <React.Suspense fallback={null}>
          <MarkdownPreviewGallery
            slides={slides}
            orderedSlideIndices={orderedSlideIndices}
            activeSlideId={activeSlideId}
            slideOrder={slideOrder}
            slideCount={slides.length}
            activeSlideHeading={activeSlideHeading}
            showSlideThumbnails={true}
            onActiveSlideIndexChange={setActiveSlideIndex}
            onSlideOrderChange={setSlideOrder}
            renderSlidePreview={renderSlidePreview}
            uiPanelTextFontClass={uiPanelTextFontClass}
            zoomScale={galleryZoomScale}
            onSlideDoubleClick={(idx) => { const pos = orderedSlideIndices.indexOf(idx); if (pos >= 0) setActiveSlideIndex(pos); if (onShowInPresentation) onShowInPresentation(slides[idx]?.startLine || 0) }}
          />
        </React.Suspense>
      </section>
    )
  }

  if (markdownPresentationMode || viewMode === 'presentation') {
    return (
      <React.Suspense fallback={null}>
          <MarkdownPreviewPresentation
            rootRef={setRootRef}
            onClick={handleClick}
            onRegisterFullscreenHandler={handleRegisterFullscreenHandler}
            headMeta={headMeta as Record<string, unknown>}
            slides={slides as never}
            activeSlideId={activeSlideId}
            orderedSlideIndices={orderedSlideIndices}
            setActiveSlideIndex={setActiveSlideIndex}
            slideOrder={slideOrder}
            setSlideOrder={setSlideOrder}
            activeFragmentConfig={activeFragmentConfig}
            activeFragmentStep={activeFragmentStep}
            markdownWordWrap={markdownWordWrap}
            markdownTextHighlight={markdownTextHighlight}
            selectionKind={selectionKind || null}
            uiPanelTextFontClass={uiPanelTextFontClass}
            uiPanelMonospaceTextClass={uiPanelMonospaceTextClass}
            previewOverlayScope={previewOverlayScope}
            previewOverlayPortalTarget={previewOverlayPortalTarget || null}
            highlightedLineRange={highlightedLineRange}
            activeDocumentPath={activeDocumentPath}
            mermaidFrontmatterConfig={mermaidFrontmatterConfig as Record<string, unknown> | null}
            rootThemeMode={rootThemeMode}
            effectiveHighlightBackgroundColor={effectiveHighlightBackgroundColor}
            effectiveHighlightUnderlineColor={effectiveHighlightUnderlineColor}
            onPreviewClick={onPreviewClick}
            onShowInEditor={onShowInEditor}
            fullDocTokens={tokens}
            showSidebar={showSidebar || false}
            showSlidesSidebar={showSlidesSidebar}
            setShowSlidesSidebar={setShowSlidesSidebar}
            sidebarPosition={sidebarPosition}
            onTocSelect={onTocSelect}
            onTocDoubleClick={onTocDoubleClick}
            onTocReorder={onTocReorder}
            collapsedIds={collapsedIds}
            onToggleCollapse={onToggleCollapse}
            onExpandAll={onExpandAll}
            onCollapseAll={onCollapseAll}
            sourceFiles={sourceFiles}
            onSourceFileSelect={onSourceFileSelect}
            sourceFilesPanelIntegration={sourceFilesPanelIntegration}
            geoDatasetIntegration={geoDatasetIntegration}
          />
      </React.Suspense>
    )
  }

  return (
    <MarkdownInlineSelectionActionsContext.Provider value={inlineSelectionActionsValue}>
      <MarkdownPreviewViewer
      rootRef={setRootRef}
      tokens={tokens}
      sourceMarkdownText={markdownText}
      activeDocumentPath={activeDocumentPath}
      highlightedLineRange={highlightedLineRange}
      markdownWordWrap={markdownWordWrap}
      markdownTextHighlight={markdownTextHighlight}
      selectionKind={selectionKind || null}
      uiPanelTextFontClass={uiPanelTextFontClass}
      uiPanelMonospaceTextClass={uiPanelMonospaceTextClass}
      webpageLayoutWireframeAscii={webpageLayoutWireframeAscii}
      sidebarPosition={sidebarPosition}
      stickyHeadingTopClass={stickyHeadingTopClass}
      stickyHeadingTopPx={stickyHeadingTopPx}
      mermaidFrontmatterConfig={mermaidFrontmatterConfig as Record<string, unknown> | null}
      rootThemeMode={rootThemeMode}
      previewOverlayScope={previewOverlayScope}
      previewOverlayPortalTarget={previewOverlayPortalTarget || null}
      effectiveHighlightBackgroundColor={effectiveHighlightBackgroundColor}
      effectiveHighlightUnderlineColor={effectiveHighlightUnderlineColor}
      scrollClass={scrollClass}
      onScroll={onScroll}
      onClick={handleClick}
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
      frontmatterMermaidCode={frontmatterMermaidCode}
      frontmatterRawText={frontmatterRawText || undefined}
      frontmatterMeta={headMeta as Record<string, unknown>}
      codeAnnotations={codeAnnotations}
      geoDatasetIntegration={geoDatasetIntegration}
      annotateDisplayMode={annotateDisplayMode}
      flashLine={flashLine}
      markdownViewerWidthMode={markdownViewerWidthMode}
      sourceFiles={sourceFiles}
      onSourceFileSelect={onSourceFileSelect}
      onShowInEditor={onShowInEditor}
      sourceFilesPanelIntegration={sourceFilesPanelIntegration}
      markdownForcePlainTables={markdownForcePlainTables}
      forbidCopy={forbidCopy}
      onInlineEditStateChange={handleInlineEditStateChange}
      onInlineDraftTextChange={onInlineDraftTextChange}
      contentClassName={contentClassName}
      markdownCardPreviewMode={markdownCardPreviewMode}
      markdownViewerMediaMode={markdownViewerMediaMode}
      />
    </MarkdownInlineSelectionActionsContext.Provider>
  )
})

export default MarkdownPreview
