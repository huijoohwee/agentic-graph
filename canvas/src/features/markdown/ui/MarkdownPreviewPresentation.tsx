import React from 'react'
import { MarkdownPanelLayout } from '@/features/markdown/ui/MarkdownPanelLayout'
import { useGraphStore } from '@/hooks/useGraphStore'
import { LS_KEYS } from '@/lib/config'
import PreviewOverlay from '@/features/panels/views/preview-panel/ui/PreviewOverlay'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { splitMarkdownLines } from '@/lib/markdown'
import { lexMarkdownContent, type TokenWithLines } from './markdownPreviewLex'
import { selectTokensInLineRange } from './markdownPreviewLexUtils'
import type { HighlightedLineRange, MarkdownGeoDatasetIntegration } from './MarkdownRendererTypes'
import type { MarkdownFragmentConfig } from './markdownPreviewFragments'
import {
  buildBackgroundStyle,
  buildSlideBody,
  buildSlidePreview,
  buildSlideTransitionStyle,
  buildTwoColumnTokens,
  getSlideTextBodyAndNotes,
  getSlideVisualMeta,
} from './markdownPresentationSlides'
import { findLineRangeFromTarget } from '@/features/markdown/ui/markdownPreviewContextMenuUtils'
import { MarkdownPresentationViewport } from './MarkdownPresentationViewport'
import { SlidesSidebar } from './SlidesSidebar'
import type { MarkdownSourceFilesPanelIntegration } from './markdownSourceFilesPanelTypes'
import { MARKDOWN_SLIDES_SIDEBAR_CLASS_NAME } from './markdownPresentationResponsiveClasses'

import { usePresentationEffects } from './usePresentationEffects'
import { resolvePresentationFrameModel } from './markdownPresentationFrame'

export { SlidesSidebar }

type MarkdownPreviewPresentationProps = {
  rootRef: (el: HTMLElement | null) => void
  onClick?: (e: React.MouseEvent<HTMLElement>) => void
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void
  onRegisterFullscreenHandler?: (fn: (() => void) | null) => void
  headMeta: Record<string, unknown>
  slides: Array<{
    index: number
    text: string
    startLine: number
    endLine: number
    notes: string | null
    meta?: Record<string, unknown>
  }>
  activeSlideId: number
  orderedSlideIndices: number[]
  setActiveSlideIndex: (index: number) => void
  slideOrder: number[]
  setSlideOrder: (order: number[]) => void
  activeFragmentConfig: MarkdownFragmentConfig
  activeFragmentStep: number
  markdownWordWrap: boolean
  markdownTextHighlight: boolean
  selectionKind: 'node' | 'edge' | null
  uiPanelTextFontClass: string
  uiPanelMonospaceTextClass: string
  previewOverlayScope: 'viewport' | 'container'
  previewOverlayPortalTarget: HTMLElement | null
  highlightedLineRange: HighlightedLineRange
  activeDocumentPath: string
  mermaidFrontmatterConfig: Record<string, unknown> | null
  rootThemeMode: 'light' | 'dark'
  effectiveHighlightBackgroundColor: string | null
  effectiveHighlightUnderlineColor: string | null
  onPreviewClick?: (line: number) => void
  onShowInEditor?: (line: number) => void
  onSlideContextMenu?: (slideIdx: number, e: React.MouseEvent) => void
  fullDocTokens?: TokenWithLines[]
  showSidebar: boolean
  showSlidesSidebar: boolean
  setShowSlidesSidebar: (show: boolean) => void
  sidebarPosition?: 'left' | 'right'
  onTocSelect?: (id: string) => void
  onTocDoubleClick?: (id: string) => void
  onTocReorder?: (parentId: string | null, fromIndex: number, toIndex: number) => void
  collapsedIds?: Set<string>
  onToggleCollapse?: (id: string) => void
  onExpandAll?: () => void
  onCollapseAll?: () => void
  allCollapsed?: boolean
  sourceFiles?: Array<{ id: string; name: string; text?: string | null; active?: boolean }>
  onSourceFileSelect?: (id: string) => void
  sourceFilesPanelIntegration?: MarkdownSourceFilesPanelIntegration
  geoDatasetIntegration?: MarkdownGeoDatasetIntegration
}

export function MarkdownPreviewPresentation(props: MarkdownPreviewPresentationProps) {
  const uiPanelMicroLabelTextSizeClass = useGraphStore(s => s.uiPanelMicroLabelTextSizeClass || 'text-[10px]')
  const {
    rootRef,
    onClick,
    onContextMenu,
    onRegisterFullscreenHandler,
    headMeta,
    slides,
    activeSlideId,
    orderedSlideIndices,
    setActiveSlideIndex,
    slideOrder,
    setSlideOrder,
    activeFragmentConfig,
    activeFragmentStep,
    markdownWordWrap,
    markdownTextHighlight,
    selectionKind,
    uiPanelTextFontClass,
    uiPanelMonospaceTextClass,
    previewOverlayScope,
    previewOverlayPortalTarget,
    highlightedLineRange,
    activeDocumentPath,
    mermaidFrontmatterConfig,
    rootThemeMode,
    effectiveHighlightBackgroundColor,
    effectiveHighlightUnderlineColor,
    onPreviewClick,
    onShowInEditor,
    onSlideContextMenu,
    showSidebar,
    showSlidesSidebar,
    setShowSlidesSidebar,
    sidebarPosition,
    onTocSelect,
    onTocDoubleClick,
    onTocReorder,
    collapsedIds,
    onToggleCollapse,
    onExpandAll,
    onCollapseAll,
    allCollapsed,
    sourceFiles,
    onSourceFileSelect,
    sourceFilesPanelIntegration,
    geoDatasetIntegration,
  } = props

  const {
    isSlidesFullscreenOpen,
    setIsSlidesFullscreenOpen,
    showSpeakerNotes,
    slideTransitionPhase,
    isSidebarHovered,
    handleSidebarMouseEnter,
    handleSidebarMouseLeave,
    activeTransitionKey,
    previewOverlayContainerRef,
  } = usePresentationEffects({
    slides,
    activeSlideId,
    headMeta,
    onRegisterFullscreenHandler,
    setShowSlidesSidebar,
    showSlidesSidebar,
  })

  const baseSlideSize = React.useMemo(
    // Keep presentation viewport stable at 16:9 for consistent editor/presentation framing.
    () => ({ w: 1920, h: 1080 }),
    [],
  )

  const hasSlides = React.useMemo(
    () => slides.length > 0,
    [slides.length],
  )

  const safeActiveSlideId = React.useMemo(() => {
    if (!hasSlides) return 0
    if (activeSlideId >= 0 && activeSlideId < slides.length) return activeSlideId
    return 0
  }, [activeSlideId, hasSlides, slides.length])

  const slideTokens = React.useMemo(() => {
    if (!hasSlides) return null
    const currentSlide = slides[safeActiveSlideId]
    if (!currentSlide) return null

    // Optimization: Use shared tokens if available
    if (props.fullDocTokens) {
      const start = currentSlide.startLine
      const end = currentSlide.endLine
      const filtered = selectTokensInLineRange(props.fullDocTokens, start, end)
      // If we have tokens, return them.
      // If filtered is empty but the slide has text, it means line numbers might be misaligned or tokens are missing.
      // In that case, fall back to on-the-fly lexing.
      if (filtered.length > 0) return filtered
      
      // Fallback: If filtering returned nothing, check if we have content to lex.
      const { body } = getSlideTextBodyAndNotes(currentSlide)
      if (!body) return []
      // Fallthrough to lexing below
    }

    const { text, body } = getSlideTextBodyAndNotes(currentSlide)
    if (!body) return null
    // Ensure we pass a valid offset (0-based)
    const out = lexMarkdownContent(
      text,
      Math.max(0, (currentSlide.startLine || 1) - 1),
    )
    return out.tokens
  }, [hasSlides, safeActiveSlideId, slides, props.fullDocTokens])

  const twoColumnTokens = React.useMemo(() => {
    if (!hasSlides) return null
    const currentSlide = slides[safeActiveSlideId]
    if (!currentSlide) return null
    return buildTwoColumnTokens({
      slide: currentSlide as never,
      headMeta,
      fullDocTokens: props.fullDocTokens,
    }) as { left: TokenWithLines[]; right: TokenWithLines[] } | null
  }, [hasSlides, headMeta, safeActiveSlideId, slides, props.fullDocTokens])

  const slideBody = React.useMemo(
    () =>
      buildSlideBody({
        hasSlides,
        slides,
        safeActiveSlideId,
        twoColumnTokens,
        slideTokens,
        headMeta,
        activeDocumentPath,
        highlightedLineRange,
        markdownWordWrap,
        markdownTextHighlight,
        selectionKind,
        uiPanelTextFontClass,
        uiPanelMonospaceTextClass,
        uiPanelMicroLabelTextSizeClass,
        previewOverlayScope,
        previewOverlayPortalTarget,
        activeFragmentConfig,
        activeFragmentStep,
        mermaidFrontmatterConfig,
        rootThemeMode,
        effectiveHighlightBackgroundColor,
        effectiveHighlightUnderlineColor,
        geoDatasetIntegration,
      }),
    [
      hasSlides,
      slides,
      safeActiveSlideId,
      twoColumnTokens,
      slideTokens,
      headMeta,
      activeDocumentPath,
      uiPanelMicroLabelTextSizeClass,
      highlightedLineRange,
      markdownWordWrap,
      markdownTextHighlight,
      selectionKind,
      uiPanelTextFontClass,
      uiPanelMonospaceTextClass,
      previewOverlayScope,
      previewOverlayPortalTarget,
      activeFragmentConfig,
      activeFragmentStep,
      mermaidFrontmatterConfig,
      rootThemeMode,
      effectiveHighlightBackgroundColor,
      effectiveHighlightUnderlineColor,
      geoDatasetIntegration,
    ],
  )

  const slideMeta = (slides[safeActiveSlideId]?.meta || {}) as Record<string, unknown>
  const headMetaRecord = headMeta as Record<string, unknown>
  const {
    slideClass,
    backgroundRaw,
    backgroundSize,
    backgroundPosition,
    themeStyle,
  } = getSlideVisualMeta(slideMeta, headMetaRecord, uiPanelTextFontClass)
  const slideStyle = buildBackgroundStyle(activeDocumentPath, backgroundRaw, backgroundSize, backgroundPosition)

  const slideTransitionStyle: React.CSSProperties = React.useMemo(
    () => buildSlideTransitionStyle(activeTransitionKey, slideTransitionPhase),
    [activeTransitionKey, slideTransitionPhase],
  )
  const isAcademicTheme = themeStyle === 'academic'
  const slideContent = slideBody

  const frameModel = React.useMemo(
    () =>
      resolvePresentationFrameModel({
        slideMeta,
        headMeta: headMetaRecord,
        isAcademicTheme,
      }),
    [headMetaRecord, isAcademicTheme, slideMeta],
  )
  const slideFramePaddingPx = frameModel.slideFramePaddingPx
  const baseFrameClass = frameModel.baseFrameClass

  const [sidebarFocusSlideId, setSidebarFocusSlideId] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (!isSlidesFullscreenOpen) {
      setSidebarFocusSlideId(null)
    }
  }, [isSlidesFullscreenOpen])

  const slideCount = orderedSlideIndices.length

  const focusSlideId = sidebarFocusSlideId ?? activeSlideId

  const notesTokens = React.useMemo(() => {
    if (!showSpeakerNotes) return null
    const slide = slides[safeActiveSlideId]
    if (!slide || !slide.notes) return null
    const raw = String(slide.notes || '').trim()
    if (!raw) return null
    const cleaned = raw.replace(/<!--/g, '').replace(/-->/g, '').trim()
    if (!cleaned) return null
    return lexMarkdownContent(cleaned, 0).tokens
  }, [safeActiveSlideId, showSpeakerNotes, slides])

  const activeSlideHeading = React.useMemo(() => {
    const slide = slides[focusSlideId]
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
  }, [focusSlideId, slides])

  const renderSlidePreview = React.useCallback(
    (slideIdx: number) =>
      buildSlidePreview({
        slideIdx,
        slides,
        headMeta,
        activeDocumentPath,
        uiPanelTextFontClass,
        uiPanelMonospaceTextClass,
        uiPanelMicroLabelTextSizeClass,
        mermaidFrontmatterConfig,
        rootThemeMode,
        previewOverlayScope,
        previewOverlayPortalTarget,
        fullDocTokens: props.fullDocTokens,
      }),
    [
      slides,
      headMeta,
      activeDocumentPath,
      uiPanelTextFontClass,
      uiPanelMonospaceTextClass,
      uiPanelMicroLabelTextSizeClass,
      mermaidFrontmatterConfig,
      rootThemeMode,
      previewOverlayScope,
      previewOverlayPortalTarget,
      props.fullDocTokens,
    ],
  )

  const handleDoubleClick = React.useCallback(
    (e: React.MouseEvent) => {
      if (onShowInEditor) {
        const range = findLineRangeFromTarget(e.currentTarget as unknown as HTMLElement, e.target)
        if (range) {
          onShowInEditor(range.startLine)
          return
        }
        const currentSlide = slides[safeActiveSlideId]
        if (currentSlide) {
          onShowInEditor(currentSlide.startLine)
          return
        }
      }
      if (onPreviewClick) {
        const range = findLineRangeFromTarget(e.currentTarget as unknown as HTMLElement, e.target)
        if (range) {
          onPreviewClick(range.startLine)
          return
        }
        // Fallback to active slide start if clicking on slide background
        const currentSlide = slides[safeActiveSlideId]
        if (currentSlide) {
          onPreviewClick(currentSlide.startLine)
          return
        }
      }
      setIsSlidesFullscreenOpen(true)
    },
    [onShowInEditor, onPreviewClick, setIsSlidesFullscreenOpen, slides, safeActiveSlideId],
  )

  return (
    <>
      <MarkdownPanelLayout
        showSidebar={showSidebar}
        uiPanelTextFontClass={uiPanelTextFontClass}
        uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
        tokens={props.fullDocTokens}
        sidebarPosition={sidebarPosition}
        onTocSelect={onTocSelect}
        onTocDoubleClick={onTocDoubleClick}
        onTocReorder={onTocReorder}
        collapsedIds={collapsedIds}
        onToggleCollapse={onToggleCollapse}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
        allCollapsed={allCollapsed}
        sourceFiles={sourceFiles}
        onSourceFileSelect={onSourceFileSelect}
        sourceFilesPanelIntegration={sourceFilesPanelIntegration}
      >
        <section
          ref={rootRef}
          tabIndex={0}
          onClick={onClick}
          onContextMenu={onContextMenu}
          className={[
            `relative flex-1 min-h-0 w-full overflow-hidden outline-none flex flex-col ${UI_THEME_TOKENS.panel.bg}`,
            uiPanelTextFontClass,
          ].join(' ')}
          data-testid="markdown-presentation-root"
        >
          <main className="flex-1 min-h-0 flex flex-col items-center justify-center p-4">
            <MarkdownPresentationViewport
              isOpen={true}
              storageKey={LS_KEYS.previewZoomPanSlides}
              baseSlideSize={baseSlideSize}
              slideFramePaddingPx={slideFramePaddingPx}
              baseFrameClass={baseFrameClass}
              slideClass={slideClass}
              slideStyle={slideStyle}
              slideTransitionStyle={slideTransitionStyle}
              onDoubleClick={handleDoubleClick}
              disablePan={true}
              showControls={false}
              lockViewportAtFitScale={true}
            >
              {slideContent}
            </MarkdownPresentationViewport>
          </main>
        </section>
      </MarkdownPanelLayout>
      <PreviewOverlay
        open={isSlidesFullscreenOpen}
        onClose={() => setIsSlidesFullscreenOpen(false)}
        scope={previewOverlayScope}
        portalTarget={previewOverlayPortalTarget}
      >
        <section ref={previewOverlayContainerRef} className="w-full h-full bg-[color:var(--kg-panel-bg)] relative overflow-hidden">
          {/* Sidebar Trigger Area */}
          <section
            className={`absolute left-0 top-0 bottom-0 w-2 z-[60] bg-transparent ${UI_THEME_TOKENS.button.hoverBg} transition-colors duration-200`}
            title="Show Slides Sidebar"
            onMouseEnter={handleSidebarMouseEnter}
            onMouseLeave={handleSidebarMouseLeave}
          />
          <section className="w-full h-full flex" onContextMenu={onContextMenu}>
            <aside
              className={`absolute left-0 top-0 h-full z-[50] transition-transform duration-300 ease-in-out ${UI_THEME_TOKENS.panel.bg} border-r ${UI_THEME_TOKENS.panel.divider} shadow-xl ${
                showSlidesSidebar || isSidebarHovered ? 'translate-x-0' : '-translate-x-full'
              }`}
              onMouseEnter={handleSidebarMouseEnter}
              onMouseLeave={handleSidebarMouseLeave}
            >
              <section className={`${MARKDOWN_SLIDES_SIDEBAR_CLASS_NAME} h-full flex flex-col overflow-hidden`}>
                <SlidesSidebar
                  embedded={true}
                  orderedSlideIndices={orderedSlideIndices}
                  activeSlideId={activeSlideId}
                  slideOrder={slideOrder}
                  slideCount={slideCount}
                  activeSlideHeading={activeSlideHeading}
                  showSlideThumbnails={true}
                  onToggleShowSlideThumbnails={() => setShowSlidesSidebar(!showSlidesSidebar)}
                  onSidebarFocusSlideIdChange={setSidebarFocusSlideId}
                  onActiveSlideIndexChange={setActiveSlideIndex}
                  onSlideOrderChange={setSlideOrder}
                  renderSlidePreview={renderSlidePreview}
                  onSlideContextMenu={onSlideContextMenu}
                  width="w-full"
                />
              </section>
            </aside>
            <main className="flex-1 min-w-0 flex flex-col">
            <MarkdownPresentationViewport
              isOpen={isSlidesFullscreenOpen}
              storageKey={LS_KEYS.previewZoomPanSlides}
              baseSlideSize={baseSlideSize}
              slideFramePaddingPx={slideFramePaddingPx}
              baseFrameClass={baseFrameClass}
              slideClass={slideClass}
              slideStyle={slideStyle}
              slideTransitionStyle={slideTransitionStyle}
              onDoubleClick={handleDoubleClick}
              disablePan={true}
              showControls={false}
              showSpeakerNotes={showSpeakerNotes}
              notesTokens={notesTokens}
              activeDocumentPath={activeDocumentPath}
              uiPanelTextFontClass={uiPanelTextFontClass}
              uiPanelMonospaceTextClass={uiPanelMonospaceTextClass}
              mermaidFrontmatterConfig={mermaidFrontmatterConfig}
              rootThemeMode={rootThemeMode}
              previewOverlayScope={previewOverlayScope}
              previewOverlayPortalTarget={previewOverlayPortalTarget}
              lockViewportAtFitScale={true}
            >
              {slideContent}
            </MarkdownPresentationViewport>
          </main>
          </section>
        </section>
      </PreviewOverlay>
    </>
  )
}
