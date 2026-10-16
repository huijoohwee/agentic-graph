import React from 'react'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { buildYouTubeTimestampPreviewDescriptor } from 'grph-shared/rich-media/providers'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { AnchorOverlay } from '@/lib/ui/overlay'
import {
  UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_BODY_CLASSNAME,
  UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

const normalizeCommentPreviewMarkdown = (text: string): string => {
  return String(text || '')
    .split('\n')
    .map((line) => {
      const raw = String(line || '')
      const trimmed = raw.trim()
      if (!/^https?:\/\/\S+$/i.test(trimmed)) return raw
      const preview = buildYouTubeTimestampPreviewDescriptor(trimmed)
      if (!preview?.timestampLabel) return raw
      const indent = raw.match(/^\s*/)?.[0] || ''
      return `${indent}[${preview.timestampLabel}](${preview.sourceUrl})<!-- kg-comment-inline-timestamp-link -->`
    })
    .join('\n')
}

export function MarkdownBlockContainerCommentPreviewOverlay(props: {
  show: boolean
  anchorRef: React.RefObject<HTMLSpanElement | null>
  text: string
  onClose: () => void
}) {
  if (!props.show || !props.text.trim()) return null
  const markdownText = normalizeCommentPreviewMarkdown(props.text)
  return (
    <AnchorOverlay
      anchorRef={props.anchorRef}
      open
      onClose={props.onClose}
      align="bottom-center"
      autoFocus={false}
      className={[
        `${UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_CLASSNAME} overflow-hidden rounded border shadow-[var(--kg-shadow-overlay)]`,
        UI_THEME_TOKENS.panel.bg,
        UI_THEME_TOKENS.panel.border,
      ].join(' ')}
    >
      <section
        data-kg-comment-rich-media-preview="1"
        data-kg-canvas-pointer-ignore="true"
        data-kg-canvas-wheel-ignore="true"
        className={UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_BODY_CLASSNAME}
        style={{
          width: 320,
          maxWidth: '100%',
          ['--kg-anchor-preview-max-height' as never]: '220px',
        }}
      >
        <section className={`border-b px-3 py-2 text-xs font-medium ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.text.secondary}`}>
          Comment
        </section>
        <section className="px-3 py-2">
          <MarkdownPreview
            markdownText={markdownText}
            activeDocumentPath="/comment-preview.md"
            highlightedLineRange={null}
            markdownWordWrap
            markdownPresentationMode={false}
            markdownTextHighlight={false}
            uiPanelTextFontClass="font-sans"
            uiPanelMonospaceTextClass="font-mono"
            previewOverlayScope="container"
            previewOverlayPortalTarget={null}
            previewScrollable={false}
            showSidebar={false}
            markdownTokenStoreSync={false}
          />
        </section>
      </section>
    </AnchorOverlay>
  )
}
