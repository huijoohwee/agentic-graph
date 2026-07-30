import React from 'react'
import type { TokensGeneric } from './MarkdownTokens'
import type { MermaidInitConfig } from '@/features/panels/views/preview-panel/ui/mermaidConfig'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import { MarkdownHeadingBlock } from './MarkdownHeadingBlock'
import { MarkdownTableBlock } from './MarkdownTableBlock'
import { MarkdownCodeBlock } from './MarkdownCodeBlock'
import { MarkdownBlockquoteBlock } from './MarkdownBlockquoteBlock'
import { MarkdownCalloutBlock } from './MarkdownCalloutBlock'
import { MarkdownListBlock } from './MarkdownListBlock'
import { MarkdownHtmlBlock } from './MarkdownHtmlBlock'
import { MarkdownParagraphBlock } from './MarkdownParagraphBlock'
import { MarkdownBlockContainer } from './MarkdownBlockContainer'
import { MarkdownFootnoteBlock } from './MarkdownFootnoteBlock'
import { buildStandaloneMediaRenderLineSetFromTokens } from './standaloneMediaBudget'
import type { MarkdownGeoDatasetIntegration, MarkdownViewerMediaMode, RenderOpts } from './MarkdownRendererTypes'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { applyMediaProxySrc, isSafeMediaSrc, resolveHref } from '@/features/markdown/ui/markdownPreviewLinks'
import { MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS } from './markdownEditSurfaceLayout'
import {
  buildSemanticTextHighlightStyle,
  getSemanticTextHighlightClassName,
  SEMANTIC_HIGHLIGHT_SURFACES,
} from '@/lib/ui/semanticHighlight'

export type MarkdownTokenRendererProps = {
  tokens: TokenWithLines[]
  activeDocumentPath: string
  highlightedLineRange: { start: number; end: number } | null
  markdownWordWrap: boolean
  markdownPresentationMode: boolean
  uiPanelTextFontClass: string
  uiPanelMonospaceTextClass: string
  stickyHeadingTopClass?: string
  stickyHeadingTopPx?: number
  mermaidFrontmatterConfig: MermaidInitConfig | null
  rootThemeMode: 'light' | 'dark'
  previewOverlayScope: 'viewport' | 'container'
  previewOverlayPortalTarget?: HTMLElement | null
  markdownTextHighlight?: boolean
  selectionKind?: 'node' | 'edge' | null
  highlightBackgroundColor?: string | null
  highlightUnderlineColor?: string | null
  fragmentsEnabled?: boolean
  fragmentStep?: number
  fragmentClassNames?: string[]
  fragmentTags?: string[]
  collapsedIds?: Set<string>
  onToggleCollapse?: (id: string) => void
  viewerBlockEditingEnabled?: boolean
  onMoveHeadingSection?: (id: string, direction: 'up' | 'down') => void
  onReorderHeadingSection?: (sourceId: string, targetId: string, position: 'before' | 'after') => void
  onInsertLineAfter?: (afterLine: number) => void
  onReorderLineBlock?: (
    source: { startLine: number; endLine: number },
    target: { startLine: number; endLine: number },
    position: 'before' | 'after',
  ) => void
  onReplaceLineRange?: (args: { startLine: number; endLine: number; replacementLines: string[] }) => void
  codeAnnotations?: Record<string, string> | null
  annotateDisplayMode?: 'inline' | 'beside' | 'render'
  flashLine?: number | null
  geoDatasetIntegration?: MarkdownGeoDatasetIntegration
  blockNestingLevel?: number
  webpageLayoutWireframeAscii?: string | null
  markdownForcePlainTables?: boolean
  markdownSourceLines?: string[]
  markdownParagraphEditStripLinePrefix?: (line: string) => { prefix: string; content: string }
  markdownParagraphEditDefaultLinePrefix?: string
  forbidCopy?: boolean
  onInlineEditStateChange?: (active: boolean) => void
  onInlineDraftTextChange?: (nextText: string) => void
  deferMermaidRender?: boolean
  markdownLargeDocumentMode?: boolean
  markdownCardPreviewMode?: boolean
  markdownViewerMediaMode?: MarkdownViewerMediaMode
  markdownVariablePreviewByKey?: RenderOpts['markdownVariablePreviewByKey']
}

export const MARKDOWN_IMAGE_GRID_BASE_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-3 items-start'
export const resolveMarkdownImageGridColumnClassName = (imageCount: number): string =>
  imageCount >= 6 ? 'sm:grid-cols-3 lg:grid-cols-4' : imageCount >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'

const CODEBLOCK_BOX_DRAWING_RE = /[┌┐└┘┬┴┼│─╔╗╚╝╦╩╬║═]/

const shouldDisableCodeWrap = (t: TokenWithLines): boolean => {
  const code = t as unknown as { text?: unknown; lang?: unknown; info?: unknown }
  const text = String(code.text ?? '')
  if (CODEBLOCK_BOX_DRAWING_RE.test(text)) return true
  const lang = String(code.lang ?? '').trim().toLowerCase()
  if (lang === 'ascii' || lang === 'grid' || lang === 'diagram') return true
  if (!lang) {
    const lines = text.split(/\r?\n/)
    const pipeLines = lines.filter(l => /\s\|\s/.test(l)).length
    const hasMdHeading = lines.some(l => /^\s*#{1,6}\s+\S/.test(l) || /\|\s*#{1,6}\s+\S/.test(l))
    if (pipeLines >= 2 && hasMdHeading) return true
  }
  return false
}

const MarkdownTokenRenderer = React.memo(function MarkdownTokenRenderer(props: MarkdownTokenRendererProps) {
  const {
    tokens,
    activeDocumentPath,
    highlightedLineRange,
    markdownWordWrap,
    markdownPresentationMode,
    uiPanelTextFontClass,
    uiPanelMonospaceTextClass,
    stickyHeadingTopClass,
    stickyHeadingTopPx,
    mermaidFrontmatterConfig,
    rootThemeMode,
    previewOverlayScope,
    previewOverlayPortalTarget,
    markdownTextHighlight,
    selectionKind,
    highlightBackgroundColor,
    highlightUnderlineColor,
    fragmentsEnabled,
    fragmentStep,
    fragmentClassNames,
    fragmentTags,
    collapsedIds,
    onToggleCollapse,
    viewerBlockEditingEnabled,
    onMoveHeadingSection,
    onReorderHeadingSection,
    onInsertLineAfter,
    onReorderLineBlock,
    onReplaceLineRange,
    codeAnnotations,
    annotateDisplayMode,
    flashLine,
    geoDatasetIntegration,
    blockNestingLevel,
    webpageLayoutWireframeAscii,
    markdownForcePlainTables,
    markdownSourceLines,
    markdownParagraphEditStripLinePrefix,
    markdownParagraphEditDefaultLinePrefix,
    forbidCopy,
    onInlineEditStateChange,
    onInlineDraftTextChange,
    deferMermaidRender,
    markdownLargeDocumentMode,
    markdownCardPreviewMode,
    markdownViewerMediaMode = 'chip',
    markdownVariablePreviewByKey,
  } = props

  const nestingLevel = typeof blockNestingLevel === 'number' && Number.isFinite(blockNestingLevel) ? blockNestingLevel : 0
  const topLevelBlock = nestingLevel <= 0
  const cardPreviewMode = markdownCardPreviewMode === true
  const standaloneMediaEnabled = markdownPresentationMode || cardPreviewMode || markdownViewerMediaMode === 'image'
  const blockControlsEnabled = topLevelBlock && !cardPreviewMode
  const blockChromeEnabled = topLevelBlock && !markdownLargeDocumentMode && !cardPreviewMode
  const standaloneMediaRenderLineSet = React.useMemo(() => buildStandaloneMediaRenderLineSetFromTokens({
    markdownLargeDocumentMode: !!markdownLargeDocumentMode,
    tokens,
  }), [markdownLargeDocumentMode, tokens])

  let stickyHeadingCascadeBaseDepth = 7
  for (const t of tokens) {
    if (t.type !== 'heading') continue
    const depth = Math.min(6, Math.max(1, t.depth || 1))
    stickyHeadingCascadeBaseDepth = Math.min(stickyHeadingCascadeBaseDepth, depth)
    if (stickyHeadingCascadeBaseDepth === 1) break
  }
  if (stickyHeadingCascadeBaseDepth === 7) stickyHeadingCascadeBaseDepth = 1

  const opts: RenderOpts = React.useMemo(
    () => ({
      activeDocumentPath,
      highlightedLineRange,
      markdownWordWrap,
      markdownPresentationMode,
      uiPanelTextFontClass,
      uiPanelMonospaceTextClass,
      stickyHeadingTopClass,
      stickyHeadingTopPx,
      stickyHeadingCascadeBaseDepth,
      mermaidFrontmatterConfig,
      rootThemeMode,
      previewOverlayScope,
      previewOverlayPortalTarget,
      webpageLayoutWireframeAscii: webpageLayoutWireframeAscii || null,
      codeAnnotations,
      collapsedIds,
      onToggleCollapse,
      viewerBlockEditingEnabled,
      onMoveHeadingSection: blockChromeEnabled ? onMoveHeadingSection : undefined,
      onReorderHeadingSection: blockChromeEnabled ? onReorderHeadingSection : undefined,
      onInsertLineAfter: blockChromeEnabled ? onInsertLineAfter : undefined,
      onReorderLineBlock: blockChromeEnabled ? onReorderLineBlock : undefined,
      onReplaceLineRange,
      geoDatasetIntegration,
      markdownBlockControlsEnabled: blockControlsEnabled,
      markdownBlockGutterEnabled: blockChromeEnabled,
      markdownCardPreviewMode: cardPreviewMode,
      markdownViewerMediaMode,
      markdownVariablePreviewByKey,
      markdownForcePlainTables: !!markdownForcePlainTables,
      markdownSourceLines,
      markdownParagraphEditStripLinePrefix,
      markdownParagraphEditDefaultLinePrefix,
      standaloneMediaRenderLineSet,
      forbidCopy: !!forbidCopy,
      onInlineEditStateChange,
      onInlineDraftTextChange,
      deferMermaidRender: !!deferMermaidRender,
      markdownLargeDocumentMode: !!markdownLargeDocumentMode,
    }),
    [
      activeDocumentPath,
      blockChromeEnabled,
      blockControlsEnabled,
      cardPreviewMode,
      codeAnnotations,
      collapsedIds,
      geoDatasetIntegration,
      highlightedLineRange,
      markdownPresentationMode,
      markdownForcePlainTables,
      markdownSourceLines,
      markdownParagraphEditStripLinePrefix,
      markdownParagraphEditDefaultLinePrefix,
      standaloneMediaRenderLineSet,
      markdownWordWrap,
      forbidCopy,
      onInlineEditStateChange,
      onInlineDraftTextChange,
      deferMermaidRender,
      markdownLargeDocumentMode,
      markdownViewerMediaMode,
      markdownVariablePreviewByKey,
      mermaidFrontmatterConfig,
      onInsertLineAfter,
      onMoveHeadingSection,
      onReorderHeadingSection,
      onReorderLineBlock,
      onReplaceLineRange,
      onToggleCollapse,
      previewOverlayPortalTarget,
      previewOverlayScope,
      rootThemeMode,
      stickyHeadingCascadeBaseDepth,
      stickyHeadingTopClass,
      stickyHeadingTopPx,
      uiPanelMonospaceTextClass,
      uiPanelTextFontClass,
      viewerBlockEditingEnabled,
      webpageLayoutWireframeAscii,
    ],
  )

  let injectedWebpageWireframe = false

  const baseTextClass = markdownPresentationMode ? 'text-lg leading-relaxed' : 'text-sm leading-normal'
  
  // In presentation mode, we want to override the default panel text size (usually text-xs/text-sm)
  // but keep the font family.
  const commonBlockClass = markdownPresentationMode 
    ? uiPanelTextFontClass.replace(/text-(xs|sm|base|lg|xl)/g, '').trim() 
    : uiPanelTextFontClass

  const isIgnorableHtmlSpacer = (t: TokenWithLines): boolean => {
    if (t.type !== 'html') return false
    const raw = String((t as unknown as { text?: unknown; raw?: unknown }).text ?? (t as unknown as { raw?: unknown }).raw ?? '').trim()
    if (!raw) return true
    if (/^<!--[\s\S]*-->$/.test(raw)) return true
    return false
  }

  const extractSingleImageParagraph = (t: TokenWithLines): { href: string; alt: string } | null => {
    if (t.type !== 'paragraph') return null
    const inner = (t as unknown as { tokens?: unknown }).tokens
    const tokens = Array.isArray(inner) ? (inner as unknown as Array<{ type?: unknown; text?: unknown; href?: unknown }>) : []
    const meaningful = tokens.filter(tok => {
      const type = String(tok?.type || '')
      if (type && type !== 'text') return true
      const s = typeof tok?.text === 'string' ? tok.text : ''
      return !!s.trim()
    })
    if (meaningful.length !== 1) return null
    const only = meaningful[0]
    if (String(only?.type || '') !== 'image') return null
    const href = typeof only?.href === 'string' ? only.href.trim() : ''
    const alt = typeof only?.text === 'string' ? only.text : ''
    if (!href) return null
    if (!/^data:image\//i.test(href) && !/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?|#|$)/i.test(href)) return null
    return { href, alt }
  }

  const renderBlockTokens = (list: TokenWithLines[]) => {
    const out: React.ReactNode[] = []
    for (let i = 0; i < list.length; i += 1) {
      const t = list[i]
      const tt = t as unknown as TokensGeneric
      const key = `${activeDocumentPath}:${tt.type}:${t.startLine}:${t.endLine || t.startLine}:${i}`

      let highlightClass = ''
      let highlightStyle: React.CSSProperties | undefined

      if (markdownTextHighlight && highlightedLineRange) {
        const tStart = t.startLine
        const tEnd = t.endLine || t.startLine
        const hStart = highlightedLineRange.start
        const hEnd = highlightedLineRange.end
        const overlap = Math.max(tStart, hStart) <= Math.min(tEnd, hEnd)
        if (overlap) {
          highlightClass = getSemanticTextHighlightClassName(SEMANTIC_HIGHLIGHT_SURFACES.markdownTextHighlight)
          highlightStyle = buildSemanticTextHighlightStyle({
            background: highlightBackgroundColor,
            color: highlightUnderlineColor,
            defaultHighlight: true,
            underline: selectionKind === 'edge',
          })
        }
      }

      if (flashLine) {
        const tStart = t.startLine
        const tEnd = t.endLine || t.startLine
        if (tStart <= flashLine && flashLine <= tEnd) {
          highlightClass = `${highlightClass} markdown-flash-highlight -mx-1 px-1 rounded`.trim()
        }
      }

      const singleImage = standaloneMediaEnabled ? extractSingleImageParagraph(t) : null
      if (singleImage) {
        const images: Array<{ href: string; alt: string }> = [singleImage]
        const consumed: TokenWithLines[] = [t]
        let j = i + 1
        while (j < list.length) {
          const next = list[j]
          if (isIgnorableHtmlSpacer(next)) {
            consumed.push(next)
            j += 1
            continue
          }
          const nextImg = extractSingleImageParagraph(next)
          if (!nextImg) break
          images.push(nextImg)
          consumed.push(next)
          j += 1
        }

        if (images.length >= 2) {
          const last = consumed[consumed.length - 1]
          const gridKey = `${activeDocumentPath}:imageGrid:${t.startLine}:${last.endLine || last.startLine || t.startLine}:${i}`
          const gridColsClass = resolveMarkdownImageGridColumnClassName(images.length)
          out.push(
            <MarkdownBlockContainer
              key={gridKey}
              as="section"
              className="my-3"
              highlightClass={highlightClass}
              highlightStyle={highlightStyle}
              startLine={t.startLine}
              endLine={last.endLine || last.startLine || t.startLine}
              data-kg-image-grid="1"
            >
              <section className={[MARKDOWN_IMAGE_GRID_BASE_CLASS_NAME, gridColsClass].filter(Boolean).join(' ')}>
                {images.map((img, k) => {
                  const resolved = isSafeMediaSrc(img.href) ? resolveHref(img.href, opts.activeDocumentPath) : ''
                  const src = resolved ? applyMediaProxySrc(resolved) : ''
                  const alt = img.alt || ''
                  return (
                    <img
                      key={`${gridKey}:${k}`}
                      src={src || undefined}
                      alt={alt}
                      loading="lazy"
                      decoding="async"
                      className={['w-full h-auto rounded border object-contain', UI_THEME_TOKENS.panel.border].filter(Boolean).join(' ')}
                    />
                  )
                })}
              </section>
            </MarkdownBlockContainer>,
          )
          i = j - 1
          continue
        }
      }

      switch (tt.type) {
        case 'heading':
          {
            const headingText = String((t as unknown as { text?: unknown }).text || '').trim()
            const headingDepth = Math.min(6, Math.max(1, Number((t as unknown as { depth?: unknown }).depth || 1)))
            const isToc = headingDepth === 2 && /^table\s+of\s+contents$/i.test(headingText.replace(/^📋\s*/i, ''))
            const shouldInject =
              !injectedWebpageWireframe &&
              isToc &&
              typeof webpageLayoutWireframeAscii === 'string' &&
              webpageLayoutWireframeAscii.trim().length > 0
            if (shouldInject) injectedWebpageWireframe = true
            out.push(
              <React.Fragment key={key}>
                <MarkdownHeadingBlock
                  token={t}
                  highlightClass={highlightClass}
                  highlightStyle={highlightStyle}
                  opts={opts}
                  fragmentsEnabled={!!fragmentsEnabled}
                  fragmentStep={fragmentStep || 0}
                  fragmentClassNames={fragmentClassNames}
                  fragmentTags={fragmentTags}
                />
                {shouldInject ? (
                  <section className="my-3">
                    <pre
                      className={`overflow-x-auto whitespace-pre ${uiPanelMonospaceTextClass} text-[10px] leading-4 rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3 select-none`}
                      aria-label="Webpage layout wireframe"
                      data-kg-webpage-wireframe="1"
                      data-kg-derived="1"
                    >
                      {webpageLayoutWireframeAscii}
                    </pre>
                  </section>
                ) : null}
              </React.Fragment>
            )
            continue
          }
        case 'hr':
          out.push(
            <MarkdownBlockContainer
              key={key}
              as="section"
              className="my-8"
              highlightClass=""
              startLine={t.startLine}
              endLine={t.endLine}
              inlineEditable={!opts.markdownPresentationMode && !!opts.viewerBlockEditingEnabled && !!opts.onReplaceLineRange}
              sourceLines={opts.markdownSourceLines}
              onReplaceLineRange={opts.onReplaceLineRange}
              onInlineEditStateChange={opts.onInlineEditStateChange}
        onInlineDraftTextChange={opts.onInlineDraftTextChange}
              forbidCopy={!!opts.forbidCopy}
              editorClassName={MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS}
              editPresentation="html"
              editHtmlRender="block"
              editHtmlDisableDefaultBlockFlow
            >
              <hr data-kg-hr="1" className={`border-t-2 ${UI_THEME_TOKENS.panel.divider}`} />
            </MarkdownBlockContainer>
          )
          continue
        case 'blockquote':
          out.push(
            <MarkdownBlockquoteBlock
              key={key}
              token={t}
              highlightClass={highlightClass}
              highlightStyle={highlightStyle}
              opts={opts}
              baseTextClass={baseTextClass}
              commonBlockClass={commonBlockClass}
              fragmentsEnabled={!!fragmentsEnabled}
              fragmentStep={fragmentStep || 0}
              fragmentClassNames={fragmentClassNames}
              fragmentTags={fragmentTags}
            />
          )
          continue
        case 'callout':
          out.push(
            <MarkdownCalloutBlock
              key={key}
              token={t}
              highlightClass={highlightClass}
              highlightStyle={highlightStyle}
              opts={opts}
              baseTextClass={baseTextClass}
              commonBlockClass={commonBlockClass}
              fragmentsEnabled={!!fragmentsEnabled}
              fragmentStep={fragmentStep || 0}
              fragmentClassNames={fragmentClassNames}
              fragmentTags={fragmentTags}
            />
          )
          continue
        case 'code':
          out.push(
            <MarkdownCodeBlock
              key={key}
              token={t}
              annotateDisplayMode={annotateDisplayMode}
              highlightClass={highlightClass}
              highlightStyle={highlightStyle}
              opts={opts}
              wrapClass={markdownWordWrap && !shouldDisableCodeWrap(t) ? 'whitespace-pre-wrap break-words' : ''}
              fragmentStep={fragmentStep}
              fragmentsEnabled={!!fragmentsEnabled}
              fragmentClassNames={fragmentClassNames}
              fragmentTags={fragmentTags}
            />
          )
          continue
        case 'table':
          out.push(
            <MarkdownTableBlock
              key={key}
              token={t}
              highlightClass={highlightClass}
              highlightStyle={highlightStyle}
              opts={opts}
              fragmentsEnabled={!!fragmentsEnabled}
              fragmentStep={fragmentStep || 0}
              fragmentClassNames={fragmentClassNames}
              fragmentTags={fragmentTags}
            />
          )
          continue
        case 'list':
          out.push(
            <MarkdownListBlock
              key={key}
              token={t}
              highlightClass={highlightClass}
              highlightStyle={highlightStyle}
              opts={opts}
              baseTextClass={baseTextClass}
              wrapClass={markdownWordWrap ? 'whitespace-pre-wrap' : ''}
              fragmentsEnabled={!!fragmentsEnabled}
              fragmentStep={fragmentStep || 0}
              fragmentClassNames={fragmentClassNames}
              fragmentTags={fragmentTags}
            />
          )
          continue
        case 'html':
          out.push(
            <MarkdownHtmlBlock
              key={key}
              token={t}
              highlightClass={highlightClass}
              highlightStyle={highlightStyle}
              opts={opts}
              fragmentsEnabled={!!fragmentsEnabled}
              fragmentStep={fragmentStep || 0}
              fragmentClassNames={fragmentClassNames}
              fragmentTags={fragmentTags}
            />
          )
          continue
        case 'paragraph':
          out.push(
            <MarkdownParagraphBlock
              key={key}
              token={t}
              highlightClass={highlightClass}
              highlightStyle={highlightStyle}
              opts={opts}
              baseTextClass={baseTextClass}
              commonBlockClass={commonBlockClass}
              fragmentsEnabled={!!fragmentsEnabled}
              fragmentStep={fragmentStep || 0}
              fragmentClassNames={fragmentClassNames}
              fragmentTags={fragmentTags}
            />
          )
          continue
        case 'footnote_block':
          out.push(
            <MarkdownFootnoteBlock
              key={key}
              token={t}
              highlightClass={highlightClass}
              highlightStyle={highlightStyle}
              opts={opts}
            />
          )
          continue
        default: {
          const className = ['mt-2 mb-2', baseTextClass, commonBlockClass].filter(Boolean).join(' ')
          out.push(
            <MarkdownBlockContainer
              key={key}
              as="section"
              className={className}
              highlightClass={highlightClass}
              highlightStyle={highlightStyle}
              startLine={t.startLine}
              endLine={t.endLine}
            >
              {String((t as unknown as { raw?: unknown }).raw || '')}
            </MarkdownBlockContainer>
          )
          continue
        }
      }
    }
    return out
  }

  return <>{renderBlockTokens(tokens)}</>
})

export default MarkdownTokenRenderer
