import React from 'react'
import { LayoutPanelTop } from 'lucide-react'
import { UI_COPY } from '@/lib/config'
import MarkdownTokenRenderer from '@/features/markdown/ui/MarkdownTokenRenderer'
import { splitMarkdownLines } from '@/lib/markdown'
import { lexMarkdownContent, type TokenWithLines } from './markdownPreviewLex'
import { selectTokensInLineRange } from './markdownPreviewLexUtils'
import type { HighlightedLineRange, MarkdownGeoDatasetIntegration } from './MarkdownRendererTypes'
import type { MarkdownFragmentConfig } from './markdownPreviewFragments'
import { parseMermaidConfigFromFrontmatter } from '@/features/panels/views/preview-panel/ui/mermaidConfig'
import { SlideHeader, SlideFooter } from './SlideParts'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { 
  getSlideVisualMeta, 
  buildBackgroundStyle 
} from './markdownSlideVisuals'

export { 
  getSlideVisualMeta, 
  buildBackgroundStyle, 
  normalizeThemeStyle, 
  type SlideVisualMeta 
} from './markdownSlideVisuals'

const markdownSlidePreviewShellClassName = `w-full h-full min-w-0 min-h-0 rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} overflow-hidden`
export const MARKDOWN_PRESENTATION_TWO_COLUMN_GRID_CLASS_NAME = 'w-full h-full grid min-w-0 grid-cols-2 gap-8'
export const MARKDOWN_PRESENTATION_PREVIEW_TWO_COLUMN_GRID_CLASS_NAME = 'w-full h-full grid min-w-0 grid-cols-2 gap-2'
type MarkdownSlidePreviewDensity = 'presentation' | 'gallery-card'

const getSlidePrimaryHeading = (slideText: string): string => {
  const lines = splitMarkdownLines(slideText)
  for (const line of lines) {
    if (line.trim().startsWith('# ')) {
      return line.trim().replace(/^#\s+/, '')
    }
  }
  return ''
}

const buildTokenRendererProps = (
  tokens: TokenWithLines[],
  common: Omit<BuildSlideBodyArgs, 'twoColumnTokens' | 'slideTokens' | 'slides' | 'safeActiveSlideId' | 'hasSlides' | 'headMeta'>,
  _highlights: unknown,
  stickyHeadingTopClass?: string,
  stickyHeadingTopPx?: number,
) => ({
  tokens,
  activeDocumentPath: common.activeDocumentPath,
  highlightedLineRange: common.highlightedLineRange,
  markdownWordWrap: common.markdownWordWrap,
  markdownPresentationMode: common.markdownPresentationMode ?? true,
  markdownCardPreviewMode: common.markdownCardPreviewMode,
  uiPanelTextFontClass: common.uiPanelTextFontClass,
  uiPanelMonospaceTextClass: common.uiPanelMonospaceTextClass,
  mermaidFrontmatterConfig: common.mermaidFrontmatterConfig,
  rootThemeMode: common.rootThemeMode,
  previewOverlayScope: common.previewOverlayScope,
  previewOverlayPortalTarget: common.previewOverlayPortalTarget,
  markdownTextHighlight: common.markdownTextHighlight,
  selectionKind: common.selectionKind,
  highlightBackgroundColor: common.effectiveHighlightBackgroundColor,
  highlightUnderlineColor: common.effectiveHighlightUnderlineColor,
  fragmentsEnabled: common.activeFragmentConfig.enabled,
  fragmentStep: common.activeFragmentStep,
  fragmentClassNames: common.activeFragmentConfig.classNames,
  fragmentTags: common.activeFragmentConfig.tags,
  geoDatasetIntegration: common.geoDatasetIntegration,
  stickyHeadingTopClass,
  stickyHeadingTopPx,
})

export const getSlideTextBodyAndNotes = (
  slide: { text: string; notes: string | null },
): { text: string; body: string; notes: string } => {
  const text = String(slide.text || '')
  const notes = String(slide.notes || '').trim()
  const body = text.trim()
  return { text, body, notes }
}

export const buildSlideTransitionStyle = (
  activeTransitionKey: string,
  slideTransitionPhase: 'from' | 'to',
): React.CSSProperties => {
  const key = (activeTransitionKey || '').toLowerCase()
  if (!key || key === 'none') return {}
  const phase = slideTransitionPhase
  const base: React.CSSProperties = {
    transitionProperty: 'opacity, transform',
    transitionDuration: '280ms',
    transitionTimingFunction: 'cubic-bezier(0.33, 1, 0.68, 1)',
  }
  if (key === 'fade') {
    return {
      ...base,
      opacity: phase === 'from' ? 0 : 1,
      transform: 'none',
    }
  }
  if (key === 'slide-left') {
    return {
      ...base,
      opacity: phase === 'from' ? 0 : 1,
      transform: phase === 'from' ? 'translateX(48px)' : 'translateX(0px)',
    }
  }
  if (key === 'slide-right') {
    return {
      ...base,
      opacity: phase === 'from' ? 0 : 1,
      transform: phase === 'from' ? 'translateX(-48px)' : 'translateX(0px)',
    }
  }
  if (key === 'slide-up') {
    return {
      ...base,
      opacity: phase === 'from' ? 0 : 1,
      transform: phase === 'from' ? 'translateY(48px)' : 'translateY(0px)',
    }
  }
  if (key === 'slide-down') {
    return {
      ...base,
      opacity: phase === 'from' ? 0 : 1,
      transform: phase === 'from' ? 'translateY(-48px)' : 'translateY(0px)',
    }
  }
  if (key === 'zoom') {
    return {
      ...base,
      opacity: phase === 'from' ? 0 : 1,
      transform: phase === 'from' ? 'scale(0.94)' : 'scale(1)',
    }
  }
  return {
    ...base,
    opacity: phase === 'from' ? 0 : 1,
    transform: 'none',
  }
}

type Slide = {
  index: number
  text: string
  startLine: number
  endLine: number
  notes: string | null
  meta?: Record<string, unknown>
}

type TwoColumnTokens = {
  left: TokenWithLines[]
  right: TokenWithLines[]
} | null

export const buildTwoColumnTokens = (args: {
  slide: Slide
  headMeta: Record<string, unknown>
  fullDocTokens?: TokenWithLines[]
}): TwoColumnTokens => {
  const { slide, headMeta, fullDocTokens } = args
  const slideMeta = (slide.meta || {}) as Record<string, unknown>
  const headMetaRecord = headMeta as Record<string, unknown>
  const layoutRaw = String(slideMeta.layout || headMetaRecord.layout || '').trim().toLowerCase()
  if (layoutRaw !== 'two-cols') return null
  const { text, body } = getSlideTextBodyAndNotes(slide)
  if (!body) return null
  const lines = splitMarkdownLines(text)
  let splitIndex = -1
  for (let i = 0; i < lines.length; i += 1) {
    if ((lines[i] || '').trim() === '::right::') {
      splitIndex = i
      break
    }
  }
  const baseOffset = Math.max(0, (slide.startLine || 1) - 1)
  
  if (fullDocTokens) {
    if (splitIndex < 0) {
      const start = slide.startLine
      const end = slide.endLine
      const left = selectTokensInLineRange(fullDocTokens, start, end)
      return { left, right: [] }
    }
    const absSplitLine = baseOffset + 1 + splitIndex
    const start = slide.startLine
    const end = slide.endLine
    const left = selectTokensInLineRange(fullDocTokens, start, absSplitLine - 1)
    const right = selectTokensInLineRange(fullDocTokens, absSplitLine + 1, end)
    return { left, right }
  }

  if (splitIndex < 0) {
    const { tokens: leftTokens } = lexMarkdownContent(text, baseOffset)
    return { left: leftTokens, right: [] as TokenWithLines[] }
  }
  const leftLines = lines.slice(0, splitIndex)
  const rightLines = lines.slice(splitIndex + 1)
  const leftText = leftLines.join('\n')
  const rightText = rightLines.join('\n')
  const leftOffset = baseOffset
  const rightOffset = baseOffset + splitIndex + 1
  const { tokens: leftTokens } = lexMarkdownContent(leftText, leftOffset)
  const { tokens: rightTokens } = lexMarkdownContent(rightText, rightOffset)
  return { left: leftTokens, right: rightTokens }
}

type BuildSlideBodyArgs = {
  hasSlides: boolean
  slides: Slide[]
  safeActiveSlideId: number
  twoColumnTokens: TwoColumnTokens
  slideTokens: TokenWithLines[] | null
  headMeta: Record<string, unknown>
  activeDocumentPath: string
  highlightedLineRange: HighlightedLineRange
  markdownWordWrap: boolean
  markdownTextHighlight: boolean
  selectionKind: 'node' | 'edge' | null
  markdownPresentationMode?: boolean
  markdownCardPreviewMode?: boolean
  uiPanelTextFontClass: string
  uiPanelMonospaceTextClass: string
  uiPanelMicroLabelTextSizeClass: string
  previewOverlayScope: 'viewport' | 'container'
  previewOverlayPortalTarget: HTMLElement | null
  activeFragmentConfig: MarkdownFragmentConfig
  activeFragmentStep: number
  mermaidFrontmatterConfig: Record<string, unknown> | null
  rootThemeMode: 'light' | 'dark'
  effectiveHighlightBackgroundColor: string | null
  effectiveHighlightUnderlineColor: string | null
  geoDatasetIntegration?: MarkdownGeoDatasetIntegration
  headerFooterPositionMode?: 'viewport-fixed' | 'slide-absolute' | 'slide-flow'
}

export const buildSlideBody = (args: BuildSlideBodyArgs): React.ReactNode => {
  const {
    hasSlides,
    slides,
    safeActiveSlideId,
    twoColumnTokens,
    slideTokens,
    headMeta,
    uiPanelTextFontClass,
    uiPanelMonospaceTextClass,
    uiPanelMicroLabelTextSizeClass,
    mermaidFrontmatterConfig,
    headerFooterPositionMode = 'slide-absolute',
  } = args

  if (!hasSlides) {
    return (
      <section className={`w-full h-full flex items-center justify-center px-8 py-10 ${UI_THEME_TOKENS.panel.bg}`} aria-label="Presentation Empty State">
        <section
          className={[
            `inline-flex flex-col items-center justify-center rounded-md border border-dashed border-blue-200/80 ${UI_THEME_TOKENS.panel.overlayBg} px-4 py-3 text-center text-xs ${UI_THEME_TOKENS.text.secondary}`,
            uiPanelTextFontClass,
          ].join(' ')}
        >
          <section className="flex items-center gap-2">
            <section className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
              <LayoutPanelTop className="h-3.5 w-3.5" aria-hidden={true} />
            </section>
            <section className="font-medium text-blue-700">
              {UI_COPY.markdownPresentationEmptyTitle}
            </section>
          </section>
          <section className={`mt-1 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
            {UI_COPY.markdownPresentationEmptyBody}
          </section>
        </section>
      </section>
    )
  }

  const currentSlide = slides[safeActiveSlideId]
  if (!currentSlide) return null
  const slideMeta = (currentSlide.meta || {}) as Record<string, unknown>
  const headMetaRecord = headMeta as Record<string, unknown>
  
  const visualMeta = getSlideVisualMeta(slideMeta, headMetaRecord, uiPanelTextFontClass)
  const { layout } = visualMeta
  const slideHeading = getSlidePrimaryHeading(currentSlide.text)
  const headerNode = (
    <SlideHeader
      meta={visualMeta}
      heading={slideHeading}
      page={safeActiveSlideId + 1}
      total={slides.length}
      uiPanelTextFontClass={uiPanelTextFontClass}
      uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
      uiPanelMonospaceTextClass={uiPanelMonospaceTextClass}
      positionMode={headerFooterPositionMode}
    />
  )
  const footerNode = (
    <SlideFooter
      meta={visualMeta}
      page={safeActiveSlideId + 1}
      total={slides.length}
      uiPanelTextFontClass={uiPanelTextFontClass}
      uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
      uiPanelMonospaceTextClass={uiPanelMonospaceTextClass}
      positionMode={headerFooterPositionMode}
    />
  )
  const hasHeaderChrome = Boolean(headerNode)
  const hasFooterChrome = Boolean(footerNode)
  const sharedChromePx = visualMeta.themeStyle === 'academic' ? 40 : 32
  const headerChromePx = hasHeaderChrome ? sharedChromePx : 0
  const footerChromePx = hasFooterChrome ? sharedChromePx : 0
  
  let stickyHeadingTopPx = 0
  if (headerNode && headerFooterPositionMode === 'viewport-fixed') {
    stickyHeadingTopPx = headerChromePx
  }

  const slideMermaidConfig = parseMermaidConfigFromFrontmatter(currentSlide.meta || {})
  const effectiveMermaidConfig = slideMermaidConfig || mermaidFrontmatterConfig
  
  let content: React.ReactNode = null
  const isFlowChrome = headerFooterPositionMode === 'slide-flow'
  const isAbsoluteChrome = headerFooterPositionMode === 'slide-absolute'

  if (layout === 'two-cols' && twoColumnTokens) {
    content = (
      <section className={MARKDOWN_PRESENTATION_TWO_COLUMN_GRID_CLASS_NAME} aria-label="Slide Columns">
        <section
          className={`w-full h-full px-8 ${isFlowChrome ? 'py-6 overflow-visible' : isAbsoluteChrome ? 'pt-6 pb-6 overflow-auto' : 'pt-10 pb-14 overflow-auto'}`}
          aria-label="Slide Left Column"
        >
          <MarkdownTokenRenderer
            {...buildTokenRendererProps(twoColumnTokens.left, args, null, undefined, stickyHeadingTopPx)}
            mermaidFrontmatterConfig={effectiveMermaidConfig}
          />
        </section>
        <section
          className={`w-full h-full px-8 ${isFlowChrome ? 'py-6 overflow-visible' : isAbsoluteChrome ? 'pt-6 pb-6 overflow-auto' : 'pt-10 pb-14 overflow-auto'}`}
          aria-label="Slide Right Column"
        >
          <MarkdownTokenRenderer
            {...buildTokenRendererProps(twoColumnTokens.right, args, null, undefined, stickyHeadingTopPx)}
            mermaidFrontmatterConfig={effectiveMermaidConfig}
          />
        </section>
      </section>
    )
  } else if (slideTokens) {
    const slideOuterClass =
      layout === 'center'
        ? `w-full ${isFlowChrome ? 'min-h-0' : 'h-full'} flex flex-col items-center justify-center relative`
        : `w-full ${isFlowChrome ? 'min-h-0' : 'h-full'} flex flex-col relative`
    const slideContentClass =
      layout === 'center'
        ? `flex-1 min-h-0 w-full max-w-full ${isFlowChrome ? 'overflow-visible px-16 py-8' : isAbsoluteChrome ? 'overflow-y-auto px-16 py-8' : 'overflow-y-auto px-16 py-12 pb-16'} mx-auto flex flex-col items-center justify-center`
        : `flex-1 min-h-0 w-full ${isFlowChrome ? 'overflow-visible px-16 py-8' : isAbsoluteChrome ? 'overflow-y-auto px-16 py-8' : 'overflow-y-auto px-16 py-12 pb-16'}`

    content = (
      <section className={slideOuterClass} aria-label="Slide Body">
        <main className={slideContentClass} aria-label="Slide Content">
          <MarkdownTokenRenderer
            {...buildTokenRendererProps(
              slideTokens,
              args,
              null,
              undefined,
              stickyHeadingTopPx,
            )}
            mermaidFrontmatterConfig={effectiveMermaidConfig}
          />
        </main>
      </section>
    )
  }

  if (!content) return null

  const slideDocumentStyle =
    isAbsoluteChrome
      ? {
          height: '100%',
          paddingTop: `${headerChromePx}px`,
          paddingBottom: `${footerChromePx}px`,
          boxSizing: 'border-box' as const,
          overflow: 'hidden',
        }
      : undefined
  const slideDocumentClass = headerFooterPositionMode === 'slide-absolute'
    ? 'w-full h-full relative'
    : headerFooterPositionMode === 'slide-flow'
      ? 'w-full h-full relative flex flex-col'
      : 'w-full h-full relative pb-14'
  const slideContentNode = headerFooterPositionMode === 'slide-flow'
    ? <section className="flex-1 min-h-0 w-full">{content}</section>
    : content

  return (
    <section className={slideDocumentClass} style={slideDocumentStyle} aria-label="Slide Document">
      {headerNode}
      {slideContentNode}
      {footerNode}
    </section>
  )
}

type BuildSlidePreviewArgs = {
  slideIdx: number
  slides: Slide[]
  headMeta: Record<string, unknown>
  activeDocumentPath: string
  uiPanelTextFontClass: string
  uiPanelMonospaceTextClass: string
  uiPanelMicroLabelTextSizeClass?: string
  mermaidFrontmatterConfig: Record<string, unknown> | null
  rootThemeMode: 'light' | 'dark'
  previewOverlayScope: 'viewport' | 'container'
  previewOverlayPortalTarget: HTMLElement | null
  fullDocTokens?: TokenWithLines[]
  previewDensity?: MarkdownSlidePreviewDensity
}

const isGalleryPreviewLeadInToken = (token: TokenWithLines): boolean => {
  if (token.type === 'heading') return false
  if (token.type === 'hr') return false
  const text = String((token as unknown as { text?: unknown; raw?: unknown }).text ?? (token as unknown as { raw?: unknown }).raw ?? '')
    .replace(/<!--kg:keep-->/g, '')
    .trim()
  return text.length > 0
}

const removeLeadingGalleryPreviewHeading = (tokens: TokenWithLines[], compactCardPreview: boolean): TokenWithLines[] => {
  if (!compactCardPreview || tokens.length === 0) return tokens
  const firstHeadingIndex = tokens.findIndex(token => token.type === 'heading')
  if (firstHeadingIndex < 0) return tokens
  if (tokens.slice(0, firstHeadingIndex).some(isGalleryPreviewLeadInToken)) return tokens
  return tokens.filter((_, index) => index !== firstHeadingIndex)
}

export const buildSlidePreview = (args: BuildSlidePreviewArgs): React.ReactNode => {
  const {
    slideIdx,
    slides,
    headMeta,
    activeDocumentPath,
    uiPanelTextFontClass,
    uiPanelMonospaceTextClass,
    uiPanelMicroLabelTextSizeClass: uiPanelMicroLabelTextSizeClassRaw,
    mermaidFrontmatterConfig,
    rootThemeMode,
    previewOverlayScope,
    previewOverlayPortalTarget,
    fullDocTokens,
    previewDensity = 'presentation',
  } = args
  const uiPanelMicroLabelTextSizeClass = uiPanelMicroLabelTextSizeClassRaw || 'text-xs'
  const compactCardPreview = previewDensity === 'gallery-card'

  const slide = slides[slideIdx]
  if (!slide) return null
  const slideMeta = (slide.meta || {}) as Record<string, unknown>
  const headMetaRecord = headMeta as Record<string, unknown>
  const {
    slideClass,
    layout: layoutPreview,
    backgroundRaw: backgroundRawPreview,
    backgroundSize: backgroundSizePreview,
    backgroundPosition: backgroundPositionPreview,
  } = getSlideVisualMeta(slideMeta, headMetaRecord, uiPanelTextFontClass)
  const stickyHeadingTopClass = 'top-0'
  const stickyHeadingTopPx = 0
  const slideStylePreview = buildBackgroundStyle(
    activeDocumentPath,
    backgroundRawPreview,
    backgroundSizePreview,
    backgroundPositionPreview,
  )
  const slideClassPreview = slideClass
  const { text, body } = getSlideTextBodyAndNotes(slide)
  if (!body) return null
  const commonProps = {
    activeDocumentPath,
    highlightedLineRange: null,
    markdownWordWrap: false,
    markdownPresentationMode: !compactCardPreview,
    markdownCardPreviewMode: compactCardPreview,
    uiPanelTextFontClass,
    uiPanelMonospaceTextClass,
    uiPanelMicroLabelTextSizeClass,
    mermaidFrontmatterConfig,
    rootThemeMode,
    previewOverlayScope,
    previewOverlayPortalTarget,
    markdownTextHighlight: false,
    selectionKind: null as 'node' | 'edge' | null,
    effectiveHighlightBackgroundColor: null,
    effectiveHighlightUnderlineColor: null,
    activeFragmentConfig: { enabled: false, classNames: [], tags: [], steps: 0 },
    activeFragmentStep: 0,
  }

  if (layoutPreview === 'two-cols') {
    const twoColumnTokens = buildTwoColumnTokens({ slide, headMeta, fullDocTokens })
    if (!twoColumnTokens) return null
    const leftTokens = removeLeadingGalleryPreviewHeading(twoColumnTokens.left, compactCardPreview)
    const rightTokens = twoColumnTokens.right
    if (!leftTokens.length && !rightTokens.length) return null
    const twoColumnGridClassName = compactCardPreview
      ? 'w-full h-full grid min-w-0 grid-cols-2 gap-1'
      : MARKDOWN_PRESENTATION_PREVIEW_TWO_COLUMN_GRID_CLASS_NAME
    const twoColumnPaneClassName = compactCardPreview
      ? 'w-full h-full min-w-0 px-2 py-1.5 overflow-hidden'
      : 'w-full h-full px-2 py-2 overflow-hidden'
    return (
      <section
        className={[
          markdownSlidePreviewShellClassName,
          slideClassPreview,
        ].filter(Boolean).join(' ')}
        style={slideStylePreview}
        data-kg-markdown-slide-preview-density={previewDensity}
      >
        <section className={twoColumnGridClassName}>
          <section className={twoColumnPaneClassName}>
            <MarkdownTokenRenderer
              {...buildTokenRendererProps(leftTokens, commonProps, null, stickyHeadingTopClass, stickyHeadingTopPx)}
            />
          </section>
          <section className={twoColumnPaneClassName}>
            <MarkdownTokenRenderer
              {...buildTokenRendererProps(rightTokens, commonProps, null, stickyHeadingTopClass, stickyHeadingTopPx)}
            />
          </section>
        </section>
      </section>
    )
  }
  const slideOuterClassPreview =
    layoutPreview === 'center'
      ? 'w-full h-full flex items-center justify-center'
      : 'w-full h-full flex'
  const slideContentClassPreview =
    compactCardPreview
      ? layoutPreview === 'center'
        ? 'max-w-full max-h-full min-w-0 min-h-0 px-3 py-2 overflow-hidden mx-auto flex items-center justify-center'
        : 'w-full h-full min-w-0 min-h-0 px-3 py-2 overflow-hidden'
      : layoutPreview === 'center'
      ? 'max-w-full max-h-full px-4 py-3 overflow-hidden mx-auto flex items-center justify-center pb-8'
      : 'w-full h-full px-4 py-3 overflow-hidden pb-8'
  const sourceTokens = fullDocTokens
    ? selectTokensInLineRange(fullDocTokens, slide.startLine, slide.endLine)
    : lexMarkdownContent(text, Math.max(0, (slide.startLine || 1) - 1)).tokens
  const tokens = removeLeadingGalleryPreviewHeading(sourceTokens, compactCardPreview)
  if (!tokens || !tokens.length) return null
  return (
    <section
      className={[
        markdownSlidePreviewShellClassName,
        slideClassPreview,
      ].filter(Boolean).join(' ')}
      style={slideStylePreview}
      data-kg-markdown-slide-preview-density={previewDensity}
    >
      <section className={slideOuterClassPreview}>
        <section className={slideContentClassPreview}>
          <MarkdownTokenRenderer
            {...buildTokenRendererProps(tokens, commonProps, null, stickyHeadingTopClass, stickyHeadingTopPx)}
          />
        </section>
      </section>
    </section>
  )
}
