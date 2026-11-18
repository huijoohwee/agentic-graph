import React from 'react'
import type { TokensHeading } from './MarkdownTokens'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import { renderInlineTokens } from '@/lib/markdown-core/ui/MarkdownInlineRenderer.impl'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { RenderOpts } from './MarkdownRendererTypes'
import { MarkdownBlockContainer } from './MarkdownBlockContainer'
import { HeadingActions } from 'agentic-design-system/react/panels'
import { slugify } from 'grph-shared/markdown/slugify'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { UI_COPY } from '@/lib/config'
import { getStickyHeadingCascadeOffsets } from './markdownSectionUtils'
import { getMarkdownHeadingTextSizeClass } from '@/features/markdown/ui/markdownTypography'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_BASE_CLASS,
  MARKDOWN_NORMAL_TEXT_READ_SURFACE_BASE_CLASS,
} from './markdownEditSurfaceLayout'
import {
  LINE_BLOCK_TRANSFER_TYPE,
  MARKDOWN_BLOCK_GUTTER_PADDING_LEFT_CLASS,
  MARKDOWN_BLOCK_GUTTER_PADDING_RIGHT_CLASS,
  MarkdownBlockDropMarkers,
  MarkdownBlockGutterControls,
} from './MarkdownBlockGutter'

type MarkdownHeadingBlockProps = {
  token: TokenWithLines
  highlightClass: string
  highlightStyle?: React.CSSProperties
  opts: RenderOpts
  fragmentsEnabled?: boolean
  fragmentStep?: number
  fragmentClassNames?: string[]
  fragmentTags?: string[]
}

export const MarkdownHeadingBlock = React.memo(function MarkdownHeadingBlock({
  token: t,
  highlightClass,
  highlightStyle,
  opts,
  fragmentsEnabled = false,
  fragmentStep = 0,
  fragmentClassNames,
  fragmentTags,
}: MarkdownHeadingBlockProps) {
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const h = t as unknown as TokensHeading
  const id = h.id || slugify(h.text || '')
  const depth = Math.min(6, Math.max(1, h.depth || 1))
  const startLine = t.startLine
  const endLine = t.endLine || t.startLine
  const baseSize = getMarkdownHeadingTextSizeClass({ depth, presentation: opts.markdownPresentationMode })
  const size =
    depth === 1 && !opts.markdownPresentationMode
      ? `${baseSize} pb-1`
      : depth === 2 && !opts.markdownPresentationMode
      ? `${baseSize} pb-0.5`
      : baseSize
  
  const color =
    depth === 1
      ? UI_THEME_TOKENS.text.primary
      : depth === 2
      ? UI_THEME_TOKENS.text.primary
      : UI_THEME_TOKENS.text.secondary
  const stickyTopClass = opts.stickyHeadingTopClass || 'top-0'
  const baseTopPx =
    typeof opts.stickyHeadingTopPx === 'number' && Number.isFinite(opts.stickyHeadingTopPx)
      ? opts.stickyHeadingTopPx
      : 0
  const cascadeBaseDepth =
    typeof opts.stickyHeadingCascadeBaseDepth === 'number' && Number.isFinite(opts.stickyHeadingCascadeBaseDepth)
      ? Math.min(6, Math.max(1, opts.stickyHeadingCascadeBaseDepth))
      : 1
  const { topPx, zIndex, heightPx } = getStickyHeadingCascadeOffsets({
    depth,
    cascadeBaseDepth,
    baseTopPx,
    markdownPresentationMode: opts.markdownPresentationMode,
  })
  const stickyHeadingEnabled = !opts.markdownLargeDocumentMode && !opts.markdownCardPreviewMode

  const stickyStyle = {
    top: `${topPx}px`,
    zIndex,
    height: `${heightPx}px`,
  } as React.CSSProperties
  const mergedStyle = {
    ...(highlightStyle || {}),
    scrollMarginTop: stickyHeadingEnabled ? `${Math.max(0, topPx + heightPx + 8)}px` : '8px',
  } as React.CSSProperties
  const headingTypographyClass = ['font-semibold', baseSize, color, opts.uiPanelTextFontClass].filter(Boolean).join(' ')
  const cls = ['font-semibold', size, color, opts.uiPanelTextFontClass].filter(Boolean).join(' ')
  const headingEditorClassName = [
    MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_BASE_CLASS,
    'block',
    headingTypographyClass,
    'overflow-x-auto whitespace-nowrap',
  ].filter(Boolean).join(' ')
  const content = renderInlineTokens(h.tokens, {
    activeDocumentPath: opts.activeDocumentPath,
    uiPanelTextFontClass: opts.uiPanelTextFontClass,
    uiPanelMonospaceTextClass: opts.uiPanelMonospaceTextClass,
    markdownPresentationMode: opts.markdownPresentationMode,
    markdownLargeDocumentMode: opts.markdownLargeDocumentMode,
    markdownCardPreviewMode: opts.markdownCardPreviewMode,
    markdownViewerMediaMode: opts.markdownViewerMediaMode,
    markdownVariablePreviewByKey: opts.markdownVariablePreviewByKey,
    fragmentOptions:
      opts.markdownPresentationMode && fragmentsEnabled
        ? {
            enabled: true,
            currentStep: fragmentStep,
            classNames: fragmentClassNames || [],
            tags: fragmentTags || [],
          }
        : null,
  })
  const Tag = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'][depth - 1] || 'h6') as
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'

  const isCollapsed = opts.collapsedIds && id ? opts.collapsedIds.has(id) : false
  const canCollapse = !!opts.onToggleCollapse && !!id
  const blockControlsAllowed =
    !opts.markdownPresentationMode &&
    !!opts.viewerBlockEditingEnabled &&
    opts.markdownBlockControlsEnabled !== false
  const canReorder = blockControlsAllowed && (!!opts.onReorderHeadingSection || !!opts.onReorderLineBlock) && !!id
  const canInsertLine = blockControlsAllowed && !!opts.onInsertLineAfter && !!id
  const gutterAvailable =
    blockControlsAllowed
    && opts.markdownBlockGutterEnabled !== false
    && (
      !!opts.onInsertLineAfter
      || !!opts.onReorderLineBlock
      || !!opts.onReorderHeadingSection
    )
  const gutterReserved = gutterAvailable
  const gutterControlsEnabled = gutterAvailable && (canInsertLine || canReorder)

  const [dragState, setDragState] = React.useState<'none' | 'top' | 'bottom'>('none')
  const [isDragging, setIsDragging] = React.useState(false)

  const handleDragStart = React.useCallback(
    (e: React.DragEvent) => {
      if (!canReorder || !id) return
      setIsDragging(true)
      e.dataTransfer.effectAllowed = 'move'
      if (opts.onReorderHeadingSection) {
        e.dataTransfer.setData('text/plain', id)
      }
      if (opts.onReorderLineBlock) {
        try {
          e.dataTransfer.setData(LINE_BLOCK_TRANSFER_TYPE, JSON.stringify({ startLine, endLine }))
        } catch { void 0 }
      }
    },
    [canReorder, endLine, id, opts.onReorderHeadingSection, opts.onReorderLineBlock, startLine],
  )

  const handleDragEnd = React.useCallback(() => {
    setIsDragging(false)
    setDragState('none')
  }, [])

  const handleDragOver = React.useCallback(
    (e: React.DragEvent) => {
      if (!canReorder || !id) return
      if (!e.dataTransfer.types.includes(LINE_BLOCK_TRANSFER_TYPE) && !e.dataTransfer.types.includes('text/plain')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const rect = e.currentTarget.getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      if (e.clientY < midY) {
        setDragState('top')
      } else {
        setDragState('bottom')
      }
    },
    [canReorder, id],
  )

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDragState('none')
  }, [])

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      if (!canReorder || !id) return
      e.preventDefault()
      e.stopPropagation()
      setDragState('none')
      const position = dragState === 'bottom' ? 'after' : 'before'
      if (opts.onReorderHeadingSection) {
        const sourceId = e.dataTransfer.getData('text/plain')
        if (sourceId && sourceId !== id) {
          opts.onReorderHeadingSection(sourceId, id, position)
          return
        }
      }
      if (opts.onReorderLineBlock) {
        const raw = e.dataTransfer.getData(LINE_BLOCK_TRANSFER_TYPE)
        if (!raw) return
        let parsed: { startLine?: number; endLine?: number } | null = null
        try { parsed = JSON.parse(raw) } catch { parsed = null }
        if (!parsed || !parsed.startLine) return
        opts.onReorderLineBlock(
          { startLine: Number(parsed.startLine), endLine: Number(parsed.endLine || parsed.startLine) },
          { startLine, endLine },
          position,
        )
      }
    },
    [canReorder, dragState, endLine, id, opts, startLine],
  )
  const stripHeadingPrefix = React.useCallback((line: string) => {
    const m = line.match(/^(\s*#{1,6}\s+)([\s\S]*)$/)
    if (!m) return { prefix: '', content: line }
    return { prefix: m[1] || '', content: m[2] || '' }
  }, [])
  return (
    <section
      className={[
        stickyHeadingEnabled ? 'sticky' : 'relative',
        stickyHeadingEnabled ? stickyTopClass : '',
        stickyHeadingEnabled ? UI_THEME_TOKENS.panel.bg : '',
        stickyHeadingEnabled ? 'backdrop-blur-md' : '',
        'mb-0 border-b-0',
      ].filter(Boolean).join(' ')}
      style={stickyHeadingEnabled ? stickyStyle : undefined}
      data-kg-sticky-heading={stickyHeadingEnabled ? '1' : '0'}
    >
      <MarkdownBlockContainer
        as={Tag}
        className={`${stickyHeadingEnabled ? `${UI_THEME_TOKENS.panel.bg} backdrop-blur-md h-full py-0.5` : 'py-1'} ${cls} ${MARKDOWN_NORMAL_TEXT_READ_SURFACE_BASE_CLASS} agentic-action-heading group min-w-0 relative ${gutterReserved ? `${MARKDOWN_BLOCK_GUTTER_PADDING_LEFT_CLASS} ${MARKDOWN_BLOCK_GUTTER_PADDING_RIGHT_CLASS}` : ''} ${isDragging ? `${UI_THEME_TOKENS.button.activeBg} opacity-60` : ''}`}
        highlightClass={highlightClass}
        highlightStyle={mergedStyle}
        startLine={startLine}
        endLine={endLine}
        id={id}
        inlineEditable={!opts.markdownPresentationMode && !!opts.viewerBlockEditingEnabled && !!opts.onReplaceLineRange}
        sourceLines={opts.markdownSourceLines}
        onReplaceLineRange={opts.onReplaceLineRange}
        onInlineEditStateChange={opts.onInlineEditStateChange}
        onInlineDraftTextChange={opts.onInlineDraftTextChange}
        forbidCopy={!!opts.forbidCopy}
        editorClassName={headingEditorClassName}
        editPresentation="html"
        editHtmlRender="inline"
        editStripLinePrefix={stripHeadingPrefix}
        editPreserveBlockHeight={false}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {gutterControlsEnabled ? (
          <>
            <MarkdownBlockDropMarkers dragState={dragState} withArrow />
            <MarkdownBlockGutterControls
              canInsertLine={canInsertLine}
              onInsertLine={() => opts.onInsertLineAfter?.(endLine)}
              canReorder={canReorder}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              iconSizeClass={iconSizeClass}
              iconStrokeWidth={uiIconStrokeWidth}
              labelReorder="Reorder section"
              labelInsert={UI_COPY.markdownBlockInsertLineLabel}
            />
          </>
        ) : null}
        <bdi className={UI_TEXT_TRUNCATE}>{content}</bdi>
        {id && (
          <HeadingActions headingId={id} expanded={!isCollapsed}
            onToggle={canCollapse ? () => opts.onToggleCollapse?.(id) : undefined} />
        )}
      </MarkdownBlockContainer>
    </section>
  )
})
