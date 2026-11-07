import React from 'react'
import { Download } from 'lucide-react'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildMarkdownPreviewMediaKey } from '@/features/markdown/ui/markdownPreviewLinks'
import { UI_COPY } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_DEFAULT_CLASSNAME,
  UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_ICON_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import type { RenderOpts } from '@/features/markdown/ui/MarkdownRendererTypes'
import { getIconSizeClass } from '@/lib/ui'
import { buildMarkdownMediaDownloadHref, deriveMarkdownMediaDownloadFilename } from './mediaDownload'
import {
  MARKDOWN_BLOCK_GUTTER_PADDING_LEFT_CLASS,
  MARKDOWN_BLOCK_GUTTER_PADDING_RIGHT_CLASS,
  MarkdownBlockDropMarkers,
  MarkdownBlockGutterControls,
  useMarkdownLineBlockDnD,
} from '@/features/markdown/ui/MarkdownBlockGutter'

type MediaWrapperProps = {
  type: string
  srcRaw: string
  startLine: number
  endLine?: number
  highlightClass: string
  highlightStyle?: React.CSSProperties
  opts: RenderOpts
  children: React.ReactNode
  className?: string
}

export const MediaWrapper = ({
  type,
  srcRaw,
  startLine,
  endLine,
  highlightClass,
  highlightStyle,
  opts,
  children,
  className,
}: MediaWrapperProps) => {
  const setMarkdownPreviewActiveMediaKey = useGraphStore(s => s.setMarkdownPreviewActiveMediaKey)
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const safeEndLine = endLine || startLine
  const downloadHref = type === 'image' || type === 'video' ? buildMarkdownMediaDownloadHref(srcRaw) : ''
  const downloadFilename = downloadHref ? deriveMarkdownMediaDownloadFilename(srcRaw, type === 'video' ? 'video' : 'image') : ''

  const blockControlsAllowed =
    !opts.markdownPresentationMode &&
    !!opts.viewerBlockEditingEnabled &&
    opts.markdownBlockControlsEnabled !== false
  const canInsertLine = blockControlsAllowed && !!opts.onInsertLineAfter && Number.isFinite(safeEndLine)
  const canReorder = blockControlsAllowed && !!opts.onReorderLineBlock && Number.isFinite(startLine)
  const gutterEnabled = (canInsertLine || canReorder) && opts.markdownBlockGutterEnabled !== false

  const dnd = useMarkdownLineBlockDnD({
    enabled: canReorder,
    targetStartLine: startLine,
    targetEndLine: safeEndLine,
    onReorder: (source, target, position) => opts.onReorderLineBlock?.(source, target, position),
  })

  const openPreview = React.useCallback(() => {
    try {
      const key = buildMarkdownPreviewMediaKey(type, startLine, srcRaw)
      setMarkdownPreviewActiveMediaKey(key)
    } catch {
      void 0
    }
    try {
      emitMainPanelOpen({ tab: 'preview' as const })
    } catch {
      void 0
    }
  }, [setMarkdownPreviewActiveMediaKey, srcRaw, startLine, type])

  const openInNewTab = React.useCallback(() => {
    const href = String(srcRaw || '').trim()
    if (!href) return
    try {
      if (typeof window === 'undefined') return
      window.open(href, '_blank', 'noopener,noreferrer')
    } catch {
      void 0
    }
  }, [srcRaw])

  const handleDoubleClick = () => {
    if (opts.previewOverlayScope === 'container') return
    openPreview()
  }

  const handleClickCapture = (event: React.MouseEvent) => {
    const t = event.target as unknown
    const target = (t && typeof t === 'object' ? (t as Element) : null)
    const thumbEl = target?.closest?.('[data-kg-media-thumbnail="1"]')
    if (!thumbEl) return
    try {
      event.preventDefault()
    } catch {
      void 0
    }
    try {
      event.stopPropagation()
    } catch {
      void 0
    }
    if (opts.previewOverlayScope === 'container') {
      openInNewTab()
      return
    }
    openPreview()
  }

  return (
    <figure
      className={
        [
          'mt-4 mb-4 mx-0 relative group',
          gutterEnabled ? MARKDOWN_BLOCK_GUTTER_PADDING_LEFT_CLASS : '',
          gutterEnabled ? MARKDOWN_BLOCK_GUTTER_PADDING_RIGHT_CLASS : '',
          dnd.isDragging ? 'opacity-60' : '',
          highlightClass,
          className,
        ]
          .filter(Boolean)
          .join(' ')
      }
      data-start-line={startLine}
      data-end-line={safeEndLine}
      onDoubleClick={handleDoubleClick}
      onClickCapture={handleClickCapture}
      style={highlightStyle}
      onDragOver={dnd.handleDragOver}
      onDragLeave={dnd.handleDragLeave}
      onDrop={dnd.handleDrop}
    >
      {gutterEnabled && (
        <>
          <MarkdownBlockDropMarkers dragState={dnd.dragState} />
          <MarkdownBlockGutterControls
            canInsertLine={canInsertLine}
            onInsertLine={() => opts.onInsertLineAfter?.(safeEndLine)}
            canReorder={canReorder}
            onDragStart={dnd.handleDragStart}
            onDragEnd={dnd.handleDragEnd}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={uiIconStrokeWidth}
            labelReorder={UI_COPY.markdownBlockReorderLineLabel}
            labelInsert={UI_COPY.markdownBlockInsertLineLabel}
          />
        </>
      )}
      {children}
      {downloadHref && opts.markdownCardPreviewMode !== true ? (
        <a
          href={downloadHref}
          download={downloadFilename || undefined}
          title="Download media"
          aria-label="Download media"
          className={[
            `${UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_DEFAULT_CLASSNAME} absolute right-2 top-2 z-10 rounded border shadow-none`,
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
            UI_THEME_TOKENS.text.primary,
            'opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100',
          ].filter(Boolean).join(' ')}
          onClick={event => {
            try { event.stopPropagation() } catch { void 0 }
          }}
        >
          <Download className={UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_ICON_CLASSNAME} aria-hidden="true" />
        </a>
      ) : null}
    </figure>
  )
}
