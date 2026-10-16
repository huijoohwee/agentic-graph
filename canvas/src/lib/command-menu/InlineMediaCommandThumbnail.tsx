import React from 'react'
import { FileAudio, Image, Video } from 'lucide-react'
import type { InlineMediaKind } from '@/lib/command-menu/inlineCommandMenuCatalog'
import { normalizeRuntimeStorageMediaAccessUrl } from '@/lib/storage/runtimeMediaUrl'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export const INLINE_MEDIA_COMMAND_THUMBNAIL_ATTR = 'data-kg-inline-command-thumbnail'
export const INLINE_MEDIA_COMMAND_THUMBNAIL_IMAGE_CLASS_NAME = 'h-full w-full rounded-full object-cover'

export function readInlineMediaCommandThumbnailClassName(args: {
  hasThumbnail: boolean
  kind: InlineMediaKind
  variant: 'menu' | 'inline'
}): string {
  const isInline = args.variant === 'inline'
  const base = isInline
    ? `m-0 h-3 w-3 shrink-0 rounded-full border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.input.bg}`
    : `m-0 h-8 w-14 shrink-0 rounded-full border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.input.bg} shadow-none`
  if (args.hasThumbnail) return `relative flex overflow-hidden ${base} p-[2px]`
  return `grid place-items-center ${base} ${UI_THEME_TOKENS.text.tertiary}`
}

export function InlineMediaCommandThumbnail(props: {
  kind?: InlineMediaKind
  thumbnailUrl?: string
  thumbnailAlt?: string
  variant?: 'menu' | 'inline'
}) {
  const kind = props.kind || 'image'
  const isInline = props.variant === 'inline'
  const iconClassName = isInline ? 'h-2 w-2' : 'h-4 w-4'
  const mediaLabel = String(props.thumbnailAlt || `${kind} media`).trim()
  const thumbnailUrl = normalizeRuntimeStorageMediaAccessUrl({ url: props.thumbnailUrl })
  if (thumbnailUrl) {
    const body = (
      <>
        <img
          src={thumbnailUrl}
          alt={props.thumbnailAlt || ''}
          className={INLINE_MEDIA_COMMAND_THUMBNAIL_IMAGE_CLASS_NAME}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        {kind === 'video' ? (
          <span className="absolute inset-0 grid place-items-center bg-black/15 text-white">
            <Video className={`${iconClassName} drop-shadow`} />
          </span>
        ) : null}
      </>
    )
    return isInline ? (
      <span
        className={readInlineMediaCommandThumbnailClassName({ hasThumbnail: true, kind, variant: 'inline' })}
        aria-label={mediaLabel}
        role="img"
        data-kg-inline-command-thumbnail={kind}
      >
        {body}
      </span>
    ) : (
      <figure
        className={readInlineMediaCommandThumbnailClassName({ hasThumbnail: true, kind, variant: 'menu' })}
        aria-label={mediaLabel}
        data-kg-inline-command-thumbnail={kind}
      >
        {body}
      </figure>
    )
  }
  const icon = kind === 'video'
    ? <Video className={iconClassName} />
    : kind === 'audio'
      ? <FileAudio className={iconClassName} />
      : <Image className={iconClassName} />
  return isInline ? (
    <span
      className={readInlineMediaCommandThumbnailClassName({ hasThumbnail: false, kind, variant: 'inline' })}
      aria-label={mediaLabel}
      role="img"
      data-kg-inline-command-thumbnail={kind}
    >
      {icon}
    </span>
  ) : (
    <figure
      className={readInlineMediaCommandThumbnailClassName({ hasThumbnail: false, kind, variant: 'menu' })}
      aria-label={mediaLabel}
      data-kg-inline-command-thumbnail={kind}
    >
      {icon}
    </figure>
  )
}
