import React from 'react'
import { Image as ImageIcon, Minimize2 } from 'lucide-react'
import { InlineMediaCommandThumbnail } from '@/lib/command-menu/InlineMediaCommandThumbnail'
import type { InlineMediaKind } from '@/lib/command-menu/inlineCommandMenuCatalog'
import {
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_MEDIA_CLASS_NAME,
  readCardMarkdownPreviewMediaLabel,
} from '@/lib/cards/cardMarkdownPreviewUtils'

const stopInlineMediaToggleEvent = (event: React.SyntheticEvent) => {
  event.preventDefault()
  event.stopPropagation()
}

export function CardPreviewInlineMediaPill(props: {
  children: React.ReactElement
  label: string
  fallbackLabel: string
  displayLabel?: string
  fullMedia?: React.ReactElement | null
  sourceTitle?: string
  sourceToken?: string
  sourceValue?: string
  thumbnailKind?: InlineMediaKind
  thumbnailUrl?: string
  toggleEnabled?: boolean
}) {
  const [renderMode, setRenderMode] = React.useState<'chip' | 'media'>('chip')
  const label = readCardMarkdownPreviewMediaLabel(props.label, props.fallbackLabel)
  const displayLabel = String(props.displayLabel || '').trim() || label
  const title = String(props.sourceTitle || '').trim() || label
  const canToggle = props.toggleEnabled === true && props.fullMedia
  const thumbnailKind = props.thumbnailKind || (props.thumbnailUrl ? 'image' : undefined)

  if (canToggle && renderMode === 'media') {
    return (
      <span
        className="relative my-1 inline-block max-w-full align-top"
        data-kg-card-inline-media-expanded="1"
        title={title}
      >
        <span className={CARD_MARKDOWN_PREVIEW_MEDIA_CLASS_NAME}>
          {props.fullMedia}
        </span>
        <button
          type="button"
          className="absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded border border-[color:var(--kg-border)] bg-[color:var(--kg-surface)] text-[color:var(--kg-text-secondary)] shadow-none"
          aria-label={`Render ${label} as inline media chip`}
          title="Inline chip"
          data-kg-card-inline-media-collapse="1"
          onMouseDown={stopInlineMediaToggleEvent}
          onClick={(event) => {
            stopInlineMediaToggleEvent(event)
            setRenderMode('chip')
          }}
        >
          <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>
    )
  }

  return (
    <span
      className={[
        CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME,
        canToggle ? 'group/kg-inline-media relative isolate !overflow-visible' : '',
      ].filter(Boolean).join(' ')}
      title={title}
      data-kg-card-inline-media-pill="1"
      data-kg-card-inline-media-source={props.sourceTitle || undefined}
      data-kg-card-inline-media-token={props.sourceToken || undefined}
      data-kg-card-inline-media-value={props.sourceValue || undefined}
    >
      {thumbnailKind ? (
        <InlineMediaCommandThumbnail
          kind={thumbnailKind}
          thumbnailUrl={props.thumbnailUrl}
          thumbnailAlt={displayLabel}
          variant="inline"
        />
      ) : props.children}
      <span className={CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME}>{displayLabel}</span>
      {canToggle ? (
        <button
          type="button"
          className="absolute right-0 top-0 z-30 inline-flex h-5 w-5 translate-x-1/3 -translate-y-1/3 items-center justify-center rounded-full border border-[color:var(--kg-border)] bg-[color:var(--kg-surface)] text-[color:var(--kg-text-secondary)] opacity-0 shadow-none ring-1 ring-white/80 transition-opacity group-hover/kg-inline-media:opacity-100 focus:opacity-100 dark:ring-black/50"
          aria-label={`Render ${label} as full media`}
          title="Full media"
          data-kg-card-inline-media-toggle="1"
          onMouseDown={stopInlineMediaToggleEvent}
          onClick={(event) => {
            stopInlineMediaToggleEvent(event)
            setRenderMode('media')
          }}
        >
          <ImageIcon className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  )
}
