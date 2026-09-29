import React from 'react'
import { ImageIcon, Link, Pencil, Upload, Video, Wand2 } from 'lucide-react'
import { INLINE_MEDIA_INSERT_KIND_BY_VARIABLE_ACTION_ID, INLINE_UPLOAD_MEDIA_VARIABLE_ACTION_ID } from '@/lib/command-menu/inlineCommandMenuCatalog'
import type { CommandMenuRichMediaItem } from '@/lib/command-menu/commandMenuRichMediaInventory'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { ResponsiveInlineIconBadge } from '@/lib/ui/ResponsiveInlineIconBadge'
import { MediaInfoOverlay, MediaKindOverlay } from '@/lib/ui/MediaKindOverlay'
import { resolveMediaKindOverlayIcon } from '@/lib/ui/mediaKindOverlayIcon'
import { cn } from '@/lib/utils'
import { LOW_PRIORITY_MEDIA_THUMBNAIL_IMAGE_PROPS, MEDIA_GENERATE_MEDIA_ACTION_ID, MEDIA_IMPORT_URL_ACTION_ID, type MediaCatalogSourceMetadataItem, type MediaPanelActionSpec } from './mediaCatalogTypes'
import {
  MediaCandidatePreview,
  MediaCandidateThumb,
  MediaListThumbnailIconFrame,
  finishMediaDrag,
  getCommandMenuMediaDescription,
  getCommandMenuMediaSourceLabel,
  isMediaRowControlTarget,
  mediaCardClassName,
  mediaListItemClassName,
  mediaListThumbnailFrameClassName,
  shouldHandleMediaRowPointer,
  useNativeVideoMediaThumbnail,
} from './mediaCatalogShared'

export function MediaCandidateRow({
  item,
  displayName,
  onDragStart,
  onSelect,
  onNameDraftChange,
  onRename,
}: {
  item: CommandMenuRichMediaItem
  displayName: string
  onDragStart: (event: React.DragEvent<HTMLElement>, item: CommandMenuRichMediaItem) => void
  onSelect: (item: CommandMenuRichMediaItem) => void
  onNameDraftChange: (item: CommandMenuRichMediaItem, nextName: string) => void
  onRename: (item: CommandMenuRichMediaItem, nextName: string) => void
}) {
  const source = getCommandMenuMediaSourceLabel(item)
  const description = getCommandMenuMediaDescription(item)
  return (
    <article
      role="button"
      tabIndex={0}
      draggable={true}
      className={mediaListItemClassName()}
      onDragStart={event => onDragStart(event, item)}
      onDragEnd={finishMediaDrag}
      onPointerDownCapture={event => {
        if (!shouldHandleMediaRowPointer(event)) return
        event.preventDefault()
        event.stopPropagation()
        onSelect(item)
      }}
      onClick={event => {
        if (event.detail !== 0 || isMediaRowControlTarget(event.target)) return
        onSelect(item)
      }}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect(item)
      }}
      data-kg-command-menu-media-candidate={item.key}
      data-kg-media-draggable="1"
      data-kg-command-menu-media-kind={item.kind}
      data-kg-command-menu-media-source={item.source}
      data-kg-media-list-row-layout="3-rows"
    >
      <MediaCandidateThumb item={item} onDragStart={onDragStart} />
      <section className="grid min-w-0 grid-rows-[auto_auto_auto] gap-1" aria-label={`${displayName} media summary`}>
        <header className="flex min-w-0 items-center justify-between gap-2" data-kg-media-list-row-section="title">
          <MediaCandidateNameEditor
            item={item}
            displayName={displayName}
            onDraftChange={onNameDraftChange}
            onRename={onRename}
          />
          <span className={cn('shrink-0 font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>@</span>
        </header>
        <section className="flex min-w-0 items-center gap-1" data-kg-media-list-row-section="meta">
          <span className={cn('min-w-0 truncate text-xs', UI_THEME_TOKENS.text.secondary)} title={source}>{source}</span>
        </section>
        <p className={cn('m-0 truncate text-xs', UI_THEME_TOKENS.text.tertiary)} title={description} data-kg-media-list-row-section="description">
          {description}
        </p>
      </section>
    </article>
  )
}

export function MediaCandidateCard({
  item,
  displayName,
  onDragStart,
  onSelect,
  onNameDraftChange,
  onRename,
}: {
  item: CommandMenuRichMediaItem
  displayName: string
  onDragStart: (event: React.DragEvent<HTMLElement>, item: CommandMenuRichMediaItem) => void
  onSelect: (item: CommandMenuRichMediaItem) => void
  onNameDraftChange: (item: CommandMenuRichMediaItem, nextName: string) => void
  onRename: (item: CommandMenuRichMediaItem, nextName: string) => void
}) {
  const Icon = resolveMediaKindOverlayIcon(item.kind)
  const source = getCommandMenuMediaSourceLabel(item)
  const description = getCommandMenuMediaDescription(item)
  return (
    <article
      role="button"
      tabIndex={0}
      draggable={true}
      className={mediaCardClassName()}
      onDragStart={event => onDragStart(event, item)}
      onDragEnd={finishMediaDrag}
      onPointerDownCapture={event => {
        if (!shouldHandleMediaRowPointer(event)) return
        event.preventDefault()
        event.stopPropagation()
        onSelect(item)
      }}
      onClick={event => {
        if (event.detail !== 0 || isMediaRowControlTarget(event.target)) return
        onSelect(item)
      }}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect(item)
      }}
      data-kg-command-menu-media-candidate={item.key}
      data-kg-media-draggable="1"
      data-kg-command-menu-media-kind={item.kind}
      data-kg-command-menu-media-source={item.source}
    >
      <MediaCandidatePreview item={item} onDragStart={onDragStart} />
      <header className="min-w-0 px-2 pt-2">
        <MediaCandidateNameEditor
          item={item}
          displayName={displayName}
          onDraftChange={onNameDraftChange}
          onRename={onRename}
        />
      </header>
      <section className="min-w-0 px-2 pt-1">
        <p className={cn('m-0 mt-2 truncate text-xs', UI_THEME_TOKENS.text.secondary)} title={source}>{source}</p>
        <p className={cn('m-0 mt-1 line-clamp-2 text-xs leading-4', UI_THEME_TOKENS.text.tertiary)} title={description}>{description}</p>
      </section>
      <footer className={cn('mt-2 flex items-center justify-between gap-2 border-t px-2 py-2', UI_THEME_TOKENS.panel.border)}>
        <span className={cn('truncate font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>{item.source}</span>
        <span className={cn('font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>@</span>
      </footer>
    </article>
  )
}

function MediaCandidateNameEditor({
  item,
  displayName,
  onDraftChange,
  onRename,
}: {
  item: CommandMenuRichMediaItem
  displayName: string
  onDraftChange: (item: CommandMenuRichMediaItem, nextName: string) => void
  onRename: (item: CommandMenuRichMediaItem, nextName: string) => void
}) {
  const [editing, setEditing] = React.useState(false)
  const commitValue = React.useCallback((value: string) => {
    const next = String(value || '').trim()
    if (!next) {
      onDraftChange(item, item.label)
      setEditing(false)
      return
    }
    if (next === item.label) {
      setEditing(false)
      return
    }
    onRename(item, next)
    setEditing(false)
  }, [item, onDraftChange, onRename])

  if (!editing) {
    return (
      <span className="flex min-w-0 items-center gap-1">
        <span
          className={cn('min-w-0 truncate px-1 text-xs font-semibold', UI_THEME_TOKENS.text.primary)}
          title={displayName}
          data-kg-command-menu-media-name-text={item.key}
        >
          {displayName}
        </span>
        <button
          type="button"
          className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border opacity-70 hover:opacity-100', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
          title={`Rename ${displayName}`}
          aria-label={`Rename ${displayName}`}
          data-kg-command-menu-media-rename={item.key}
          data-kg-media-row-control="1"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation()
            setEditing(true)
          }}
        >
          <Pencil className="h-3 w-3" strokeWidth={1.7} aria-hidden />
        </button>
      </span>
    )
  }

  return (
    <input
      type="text"
      value={displayName}
      aria-label={`Rename ${displayName}`}
      className={cn(
        'min-w-0 max-w-full truncate rounded border border-transparent bg-transparent px-1 py-0 text-xs font-semibold outline-none',
        UI_THEME_TOKENS.text.primary,
        'focus:border-[color:var(--kg-border)] focus:bg-[color:var(--kg-panel-bg)]',
      )}
      data-kg-command-menu-media-name-input={item.key}
      data-kg-media-row-control="1"
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      onChange={event => onDraftChange(item, event.target.value)}
      onInput={event => onDraftChange(item, event.currentTarget.value)}
      onBlur={event => commitValue(event.currentTarget.value)}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commitValue(event.currentTarget.value)
          event.currentTarget.blur()
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          onDraftChange(item, item.label)
          setEditing(false)
          event.currentTarget.blur()
        }
      }}
      autoFocus
    />
  )
}

const formatSourceMetadataDuration = (value: number): string => value > 0 ? `${value.toFixed(2)}s` : ''
const formatSourceMetadataBytes = (value: number | null | undefined): string => {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}mb`
  return `${Math.ceil(bytes / 1024)}kb`
}
const formatSourceMetadataBitrate = (value: number): string => value > 0 ? `${(value / 1_000_000).toFixed(1)}mbps` : ''
const formatSourceMetadataFrameRate = (value: number): string => value > 0 ? `${Number.isInteger(value) ? value : value.toFixed(2)}fps` : ''
const formatSourceMetadataSampleRate = (value: number): string => value > 0 ? `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)}khz` : ''

const buildSourceMetadataTags = (item: MediaCatalogSourceMetadataItem): string[] => {
  const summary = item.summary
  return [
    summary.formatName,
    summary.mimeType || item.mimeHint,
    summary.primaryVideoCodec,
    summary.primaryAudioCodec,
    summary.displayWidth > 0 && summary.displayHeight > 0 ? `${summary.displayWidth}x${summary.displayHeight}` : '',
    formatSourceMetadataFrameRate(summary.averageVideoFrameRate),
    formatSourceMetadataDuration(summary.durationSeconds),
    summary.audioChannelCount > 0 ? `${summary.audioChannelCount}ch` : '',
    formatSourceMetadataSampleRate(summary.audioSampleRate),
    formatSourceMetadataBitrate(summary.averageVideoBitrate),
    formatSourceMetadataBytes(summary.byteSize || item.byteSize),
  ].filter(Boolean)
}

const sourceMetadataAttrs = (item: MediaCatalogSourceMetadataItem): React.HTMLAttributes<HTMLElement> => ({
  'data-kg-command-menu-media-metadata': item.summary.status === 'ready' ? 'native' : item.summary.status,
  'data-kg-command-menu-media-metadata-audio-channels': item.summary.audioChannelCount > 0 ? item.summary.audioChannelCount : undefined,
  'data-kg-command-menu-media-metadata-audio-codec': item.summary.primaryAudioCodec || undefined,
  'data-kg-command-menu-media-metadata-audio-sample-rate': item.summary.audioSampleRate > 0 ? item.summary.audioSampleRate : undefined,
  'data-kg-command-menu-media-metadata-audio-tracks': item.summary.audioTrackCount > 0 ? item.summary.audioTrackCount : undefined,
  'data-kg-command-menu-media-metadata-bitrate': item.summary.averageVideoBitrate > 0 ? item.summary.averageVideoBitrate : undefined,
  'data-kg-command-menu-media-metadata-byte-size': item.summary.byteSize > 0 ? item.summary.byteSize : item.byteSize || undefined,
  'data-kg-command-menu-media-metadata-bytes-read': item.summary.bytesRead > 0 ? item.summary.bytesRead : undefined,
  'data-kg-command-menu-media-metadata-container-brand': item.summary.containerBrand || undefined,
  'data-kg-command-menu-media-metadata-duration': item.summary.durationSeconds > 0 ? item.summary.durationSeconds : undefined,
  'data-kg-command-menu-media-metadata-format': item.summary.formatName || undefined,
  'data-kg-command-menu-media-metadata-frame-rate': item.summary.averageVideoFrameRate > 0 ? item.summary.averageVideoFrameRate : undefined,
  'data-kg-command-menu-media-metadata-mime-type': item.summary.mimeType || item.mimeHint || undefined,
  'data-kg-command-menu-media-metadata-read-ratio': item.summary.metadataReadRatio > 0 ? item.summary.metadataReadRatio : undefined,
  'data-kg-command-menu-media-metadata-resolution': item.summary.displayWidth > 0 && item.summary.displayHeight > 0 ? `${item.summary.displayWidth}x${item.summary.displayHeight}` : undefined,
  'data-kg-command-menu-media-metadata-video-codec': item.summary.primaryVideoCodec || undefined,
  'data-kg-command-menu-media-metadata-video-tracks': item.summary.videoTrackCount > 0 ? item.summary.videoTrackCount : undefined,
}) as React.HTMLAttributes<HTMLElement>

function MediaSourceMetadataThumbnail({ item, rounded = true }: { item: MediaCatalogSourceMetadataItem; rounded?: boolean }) {
  const thumbnail = item.summary.thumbnails[0] || null
  const fallbackThumbnail = useNativeVideoMediaThumbnail({
    explicitThumbnailUrl: thumbnail?.dataUrl || '',
    kind: 'video',
    url: item.sourceUrl,
  })
  const thumbnailUrl = thumbnail?.dataUrl || fallbackThumbnail.url
  const metadataAttrs = sourceMetadataAttrs(item)
  if (thumbnailUrl) {
    return (
      <span className={rounded ? mediaListThumbnailFrameClassName('items-center justify-center') : 'block h-full w-full'} data-kg-media-source-metadata-thumbnail="1">
        <MediaKindOverlay Icon={Video} label="video" appearance="hover" />
        <MediaInfoOverlay label={buildSourceMetadataTags(item).join(' | ') || item.sourceUrl} appearance="hover" />
        <img src={thumbnailUrl} alt="" className={cn('h-full w-full object-cover', rounded && 'rounded')} data-kg-command-menu-media-thumbnail="1" data-kg-command-menu-media-thumbnail-format={thumbnail?.format || fallbackThumbnail.format || undefined} data-kg-command-menu-media-thumbnail-raster-format={thumbnail?.rasterFormat || fallbackThumbnail.rasterFormat || undefined} data-kg-command-menu-media-thumbnail-time={thumbnail?.timestampSeconds ?? fallbackThumbnail.timestampSeconds ?? undefined} {...(metadataAttrs as React.ImgHTMLAttributes<HTMLImageElement>)} loading="lazy" decoding="async" {...LOW_PRIORITY_MEDIA_THUMBNAIL_IMAGE_PROPS} draggable={false} />
      </span>
    )
  }
  return <MediaListThumbnailIconFrame Icon={Video} label="video" infoLabel={buildSourceMetadataTags(item).join(' | ') || item.sourceUrl} />
}

export function MediaSourceMetadataRow({ item }: { item: MediaCatalogSourceMetadataItem }) {
  const tags = buildSourceMetadataTags(item)
  return (
    <article className={cn('grid min-w-0 gap-2 rounded border p-2 text-left shadow-sm', 'grid-cols-[6.875rem_minmax(0,1fr)]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} data-kg-media-source-metadata="video-sequence" data-kg-command-menu-media-kind="video" {...sourceMetadataAttrs(item)}>
      <MediaSourceMetadataThumbnail item={item} />
      <section className="grid min-w-0 grid-rows-[auto_auto_auto] gap-1" aria-label={`${item.name} source metadata`}>
        <header className="flex min-w-0 items-center justify-between gap-2" data-kg-media-list-row-section="title">
          <h3 className={cn('m-0 truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)} title={item.name}>{item.name}</h3>
          <span className={cn('shrink-0 font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>source</span>
        </header>
        <section className="flex min-w-0 flex-wrap items-center gap-1" data-kg-media-list-row-section="meta">
          {tags.map(tag => <span key={tag} className={cn('rounded border px-1.5 py-0.5 text-xs', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.secondary)}>{tag}</span>)}
        </section>
        <p className={cn('m-0 truncate text-xs', UI_THEME_TOKENS.text.tertiary)} title={item.sourceUrl} data-kg-media-list-row-section="description">
          Source-backed video sequence metadata
        </p>
      </section>
    </article>
  )
}

export function MediaSourceMetadataCard({ item }: { item: MediaCatalogSourceMetadataItem }) {
  const tags = buildSourceMetadataTags(item)
  return (
    <article className={mediaCardClassName()} data-kg-media-source-metadata="video-sequence" data-kg-command-menu-media-kind="video" {...sourceMetadataAttrs(item)}>
      <figure className={cn('group relative m-0 aspect-[16/9] w-full overflow-hidden border-b', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}>
        <MediaSourceMetadataThumbnail item={item} rounded={false} />
      </figure>
      <header className="flex min-w-0 items-start justify-between gap-2 px-2 pt-2">
        <section className="min-w-0">
          <h3 className={cn('m-0 truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)} title={item.name}>{item.name}</h3>
          <p className={cn('m-0 mt-1 truncate font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>source-backed</p>
        </section>
        <ResponsiveInlineIconBadge Icon={Video} label="video" />
      </header>
      <section className="flex min-w-0 flex-wrap gap-1 px-2 pt-2">
        {tags.map(tag => <span key={tag} className={cn('rounded border px-1.5 py-0.5 text-xs', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.secondary)}>{tag}</span>)}
      </section>
      <p className={cn('m-0 mt-2 truncate px-2 pb-2 text-xs', UI_THEME_TOKENS.text.tertiary)} title={item.sourceUrl}>Source-backed video sequence metadata</p>
    </article>
  )
}

export function MediaActionRow({
  action,
  onSelect,
}: {
  action: MediaPanelActionSpec
  onSelect: (action: MediaPanelActionSpec) => void
}) {
  const mediaKind = INLINE_MEDIA_INSERT_KIND_BY_VARIABLE_ACTION_ID[action.id as keyof typeof INLINE_MEDIA_INSERT_KIND_BY_VARIABLE_ACTION_ID]
  const prefix = action.kind === 'slash' ? '/' : action.kind === 'keyword' ? '#' : '@'
  const Icon = action.id === INLINE_UPLOAD_MEDIA_VARIABLE_ACTION_ID
    ? Upload
    : action.id === MEDIA_IMPORT_URL_ACTION_ID
      ? Link
      : action.id === MEDIA_GENERATE_MEDIA_ACTION_ID
        ? Wand2
        : mediaKind === 'video' ? Video : ImageIcon
  return (
    <article
      role="button"
      tabIndex={0}
      className={mediaListItemClassName()}
      data-kg-command-menu-media-action={action.id}
      data-kg-command-menu-prefix={prefix}
      data-kg-media-list-row-layout="3-rows"
      onPointerDownCapture={event => {
        if (!shouldHandleMediaRowPointer(event)) return
        event.preventDefault()
        event.stopPropagation()
        onSelect(action)
      }}
      onClick={event => {
        if (event.detail !== 0 || isMediaRowControlTarget(event.target)) return
        onSelect(action)
      }}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect(action)
      }}
    >
      <MediaListThumbnailIconFrame Icon={Icon} label={mediaKind || action.label} infoLabel={action.description} />
      <section className="grid min-w-0 grid-rows-[auto_auto_auto] gap-1" aria-label={`${action.label} action summary`}>
        <header className="flex min-w-0 items-center justify-between gap-2" data-kg-media-list-row-section="title">
          <span className={cn('truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>{action.label}</span>
          <span className={cn('shrink-0 font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>{prefix}</span>
        </header>
        <section className="flex min-w-0 items-center gap-1" data-kg-media-list-row-section="meta">
          <span className={cn('min-w-0 truncate text-xs', UI_THEME_TOKENS.text.secondary)}>{action.group}</span>
        </section>
        <p className={cn('m-0 truncate text-xs', UI_THEME_TOKENS.text.tertiary)} title={action.description} data-kg-media-list-row-section="description">
          {action.description}
        </p>
      </section>
    </article>
  )
}

export function MediaActionCard({
  action,
  onSelect,
}: {
  action: MediaPanelActionSpec
  onSelect: (action: MediaPanelActionSpec) => void
}) {
  const mediaKind = INLINE_MEDIA_INSERT_KIND_BY_VARIABLE_ACTION_ID[action.id as keyof typeof INLINE_MEDIA_INSERT_KIND_BY_VARIABLE_ACTION_ID]
  const prefix = action.kind === 'slash' ? '/' : action.kind === 'keyword' ? '#' : '@'
  const Icon = action.id === INLINE_UPLOAD_MEDIA_VARIABLE_ACTION_ID
    ? Upload
    : action.id === MEDIA_IMPORT_URL_ACTION_ID
      ? Link
      : action.id === MEDIA_GENERATE_MEDIA_ACTION_ID
        ? Wand2
        : mediaKind === 'video' ? Video : ImageIcon
  return (
    <article
      role="button"
      tabIndex={0}
      className={mediaCardClassName()}
      data-kg-command-menu-media-action={action.id}
      data-kg-command-menu-prefix={prefix}
      onPointerDownCapture={event => {
        if (!shouldHandleMediaRowPointer(event)) return
        event.preventDefault()
        event.stopPropagation()
        onSelect(action)
      }}
      onClick={event => {
        if (event.detail !== 0 || isMediaRowControlTarget(event.target)) return
        onSelect(action)
      }}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect(action)
      }}
    >
      <figure className={cn('group relative m-0 grid aspect-[16/9] w-full place-items-center border-b', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}>
        <MediaKindOverlay Icon={Icon} label={mediaKind || action.label} appearance="hover" />
        <MediaInfoOverlay label={action.description} appearance="hover" />
        <Icon className={cn('h-7 w-7', UI_THEME_TOKENS.text.tertiary)} strokeWidth={1.7} aria-hidden />
      </figure>
      <header className="flex min-w-0 items-start justify-between gap-2 px-2 pt-2">
        <section className="min-w-0">
          <h3 className={cn('m-0 truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>{action.label}</h3>
          <p className={cn('m-0 mt-1 truncate font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>{action.id}</p>
        </section>
        <ResponsiveInlineIconBadge Icon={Icon} label={prefix} />
      </header>
      <p className={cn('m-0 mt-2 truncate px-2 text-xs', UI_THEME_TOKENS.text.secondary)}>{action.group}</p>
      <p className={cn('m-0 mt-1 line-clamp-2 px-2 pb-2 text-xs leading-4', UI_THEME_TOKENS.text.tertiary)} title={action.description}>
        {action.description}
      </p>
    </article>
  )
}
