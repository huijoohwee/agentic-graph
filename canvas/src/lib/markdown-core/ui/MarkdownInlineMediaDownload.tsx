import React from 'react'
import { Download } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_ICON_CLASSNAME,
  UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_SMALL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { buildMarkdownMediaDownloadHref, deriveMarkdownMediaDownloadFilename, type MarkdownMediaDownloadKind } from './mediaDownload'

const DOWNLOAD_CLASS = [
  `${UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_SMALL_CLASSNAME} absolute right-1 top-1 z-10 rounded border shadow-none`,
  UI_THEME_TOKENS.panel.border,
  UI_THEME_TOKENS.panel.bg,
  UI_THEME_TOKENS.text.primary,
  'opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100',
].join(' ')

export const renderInlineMediaWithDownload = (args: {
  children: React.ReactElement
  insideLink: boolean
  kind: MarkdownMediaDownloadKind
  nodeKey: React.Key
  src: string
  cardPreviewMode?: boolean
}): React.ReactNode => {
  if (args.cardPreviewMode === true) return args.children
  const href = args.insideLink ? '' : buildMarkdownMediaDownloadHref(args.src)
  if (!href) return args.children
  return (
    <span key={args.nodeKey} className="relative inline-block group align-middle max-w-full">
      {args.children}
      <a
        href={href}
        download={deriveMarkdownMediaDownloadFilename(args.src, args.kind) || undefined}
        title="Download media"
        aria-label="Download media"
        className={DOWNLOAD_CLASS}
        onClick={event => {
          try { event.stopPropagation() } catch { void 0 }
        }}
      >
        <Download className={UI_RESPONSIVE_MEDIA_OVERLAY_ACTION_ICON_CLASSNAME} aria-hidden="true" />
      </a>
    </span>
  )
}
