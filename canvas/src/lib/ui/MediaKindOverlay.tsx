import React from 'react'
import { Download, ExternalLink, Info, PencilLine } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MarkdownMediaDownloadKind } from '@/lib/markdown-core/ui/mediaDownload'
import { buildMarkdownMediaDownloadHref, deriveMarkdownMediaDownloadFilename } from '@/lib/markdown-core/ui/mediaDownload'
import { cn } from '@/lib/utils'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { getMediaOverlayAppearanceClassName, type MediaOverlayAppearance } from '@/lib/ui/mediaOverlayAppearance'

const MEDIA_TRANSLUCENT_OVERLAY_CLASSNAME = [
  'absolute z-10 inline-flex h-5 w-5 items-center justify-center rounded border shadow-none backdrop-blur-sm',
  UI_THEME_TOKENS.panel.border,
  'bg-[color:var(--kg-panel-bg)]/80',
  UI_THEME_TOKENS.text.secondary,
].join(' ')

export function MediaKindOverlay({
  Icon,
  label,
  appearance,
  className,
}: {
  Icon: LucideIcon
  label: string
  appearance?: MediaOverlayAppearance
  className?: string
}) {
  return (
    <span
      className={cn(
        MEDIA_TRANSLUCENT_OVERLAY_CLASSNAME,
        'pointer-events-none left-1 top-1',
        getMediaOverlayAppearanceClassName(appearance),
        className,
      )}
      title={label}
      aria-label={label}
      data-kg-media-kind-overlay-icon={label}
    >
      <Icon className="h-3 w-3" aria-hidden />
    </span>
  )
}

export function MediaOpenLinkOverlay({
  href,
  label = 'Open media link',
  appearance,
  className,
}: {
  href: string
  label?: string
  appearance?: MediaOverlayAppearance
  className?: string
}) {
  const normalizedHref = String(href || '').trim()
  if (!normalizedHref) return null
  return (
    <a
      href={normalizedHref}
      target="_blank"
      rel="noreferrer"
      className={cn(
        MEDIA_TRANSLUCENT_OVERLAY_CLASSNAME,
        'pointer-events-auto right-1 top-1',
        getMediaOverlayAppearanceClassName(appearance),
        className,
      )}
      title={label}
      aria-label={label}
      data-kg-media-open-link-overlay="1"
      data-kg-media-row-control="1"
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  )
}

export function MediaDownloadOverlay({
  href,
  kind,
  label = 'Download media',
  appearance,
  className,
}: {
  href: string
  kind: MarkdownMediaDownloadKind
  label?: string
  appearance?: MediaOverlayAppearance
  className?: string
}) {
  const downloadHref = buildMarkdownMediaDownloadHref(href)
  if (!downloadHref) return null
  return (
    <a
      href={downloadHref}
      download={deriveMarkdownMediaDownloadFilename(href, kind) || undefined}
      className={cn(
        MEDIA_TRANSLUCENT_OVERLAY_CLASSNAME,
        'pointer-events-auto bottom-1 right-1',
        getMediaOverlayAppearanceClassName(appearance),
        className,
      )}
      title={label}
      aria-label={label}
      data-kg-media-download-overlay="1"
      data-kg-media-row-control="1"
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <Download className="h-3 w-3" aria-hidden />
    </a>
  )
}

export function MediaInfoOverlay({
  label = 'Media info',
  appearance,
  className,
}: {
  label?: string
  appearance?: MediaOverlayAppearance
  className?: string
}) {
  return (
    <span
      className={cn(
        MEDIA_TRANSLUCENT_OVERLAY_CLASSNAME,
        'group pointer-events-auto bottom-1 left-1',
        getMediaOverlayAppearanceClassName(appearance),
        className,
      )}
      title={label}
      aria-label={label}
      data-kg-media-info-overlay="1"
      tabIndex={0}
    >
      <Info className="h-3 w-3" aria-hidden />
      <span
        className={cn(
          'pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-max max-w-[16rem] rounded border px-2 py-1 text-left text-xs leading-4 shadow-[var(--kg-shadow-overlay)] backdrop-blur-sm group-hover:block group-focus:block',
          UI_THEME_TOKENS.panel.border,
          'bg-[color:var(--kg-panel-bg)]/95',
          UI_THEME_TOKENS.text.secondary,
        )}
        data-kg-media-info-overlay-tooltip="1"
      >
        {label}
      </span>
    </span>
  )
}

export function MediaPromptActionOverlay({
  label = 'Modify prompt',
  appearance,
  className,
  onClick,
}: {
  label?: string
  appearance?: MediaOverlayAppearance
  className?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'absolute left-1/2 top-1/2 z-20 inline-flex h-7 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded border px-2 text-xs font-semibold shadow-none backdrop-blur-sm',
        UI_THEME_TOKENS.panel.border,
        'bg-[color:var(--kg-panel-bg)]/90',
        UI_THEME_TOKENS.text.secondary,
        getMediaOverlayAppearanceClassName(appearance),
        className,
      )}
      aria-label={label}
      title={label}
      data-kg-media-prompt-action-overlay="1"
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation()
        onClick?.()
      }}
    >
      <PencilLine className="h-3 w-3" aria-hidden />
      <span>{label}</span>
    </button>
  )
}
