import React from 'react'
import { ImageIcon, Link, Trash2, Upload, Video, Wand2 } from 'lucide-react'
import { INLINE_MEDIA_INSERT_KIND_BY_VARIABLE_ACTION_ID, INLINE_UPLOAD_MEDIA_VARIABLE_ACTION_ID } from '@/lib/command-menu/inlineCommandMenuCatalog'
import type { CommandMenuRichMediaItem } from '@/lib/command-menu/commandMenuRichMediaInventory'
import { readUploadedMediaPanelItemRuntimeUrl, type UploadedMediaPanelItem } from '@/lib/storage/uploadedMediaPanelItems'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MediaDownloadOverlay, MediaInfoOverlay, MediaKindOverlay, MediaOpenLinkOverlay } from '@/lib/ui/MediaKindOverlay'
import { resolveMediaKindOverlayIcon } from '@/lib/ui/mediaKindOverlayIcon'
import {
  floatingPanelCatalogCompactRowMetaClassName,
  floatingPanelCatalogCompactRowTitleClassName,
  floatingPanelCatalogCompactRowTokenClassName,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { cn } from '@/lib/utils'
import { LOW_PRIORITY_MEDIA_THUMBNAIL_IMAGE_PROPS, MEDIA_GENERATE_MEDIA_ACTION_ID, MEDIA_IMPORT_URL_ACTION_ID, type MediaCatalogSourceMetadataItem, type MediaPanelActionSpec } from './mediaCatalogTypes'
import {
  MEDIA_COMPACT_LIST_ROW_LAYOUT,
  buildUploadedMediaDragPayload,
  continueMediaMouseDrag,
  continueMediaPointerDrag,
  finishMediaDrag,
  getCommandMenuMediaDescription,
  getCommandMenuMediaSourceLabel,
  isMediaRowControlTarget,
  mediaCompactListIconFrameClassName,
  mediaCompactListItemClassName,
  primeMediaMouseDrag,
  primeMediaPointerDrag,
  shouldHandleMediaRowPointer,
  shouldPrimeMediaRowDragPayload,
  startMediaMouseDrag,
  startMediaPointerDrag,
  useNativeVideoMediaThumbnail,
  type UploadedMediaDragMetadata,
} from './mediaCatalogShared'

const formatSourceMetadataDuration = (value: number): string => value > 0 ? `${value.toFixed(2)}s` : ''
const formatSourceMetadataBytes = (value: number | null | undefined): string => {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}mb` : `${Math.ceil(bytes / 1024)}kb`
}

const buildSourceMetadataTags = (item: MediaCatalogSourceMetadataItem): string[] => {
  const summary = item.summary
  return [
    summary.formatName,
    summary.mimeType || item.mimeHint,
    summary.primaryVideoCodec,
    summary.displayWidth > 0 && summary.displayHeight > 0 ? `${summary.displayWidth}x${summary.displayHeight}` : '',
    formatSourceMetadataDuration(summary.durationSeconds),
    formatSourceMetadataBytes(summary.byteSize || item.byteSize),
  ].filter(Boolean)
}

export function MediaCandidateListRow({
  item,
  displayName,
  onDragStart,
  onSelect,
}: {
  item: CommandMenuRichMediaItem
  displayName: string
  onDragStart: (event: React.DragEvent<HTMLElement>, item: CommandMenuRichMediaItem) => void
  onSelect: (item: CommandMenuRichMediaItem) => void
}) {
  const Icon = resolveMediaKindOverlayIcon(item.kind)
  const source = getCommandMenuMediaSourceLabel(item)
  const description = getCommandMenuMediaDescription(item)
  return (
    <article
      role="button"
      tabIndex={0}
      draggable={true}
      className={mediaCompactListItemClassName()}
      data-kg-command-menu-media-candidate={item.key}
      data-kg-media-draggable="1"
      data-kg-command-menu-media-kind={item.kind}
      data-kg-command-menu-media-source={item.source}
      data-kg-media-list-row-layout={MEDIA_COMPACT_LIST_ROW_LAYOUT}
      data-kg-media-list-view-row="1"
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
    >
      <span className={mediaCompactListIconFrameClassName()} aria-hidden>
        <Icon className={cn('h-3.5 w-3.5', UI_THEME_TOKENS.text.tertiary)} />
      </span>
      <section className="min-w-0" aria-label={`${displayName} media compact summary`}>
        <h3 className={floatingPanelCatalogCompactRowTitleClassName()} title={displayName} data-kg-media-list-row-section="title">{displayName}</h3>
        <p className={floatingPanelCatalogCompactRowMetaClassName()} title={description} data-kg-media-list-row-section="meta">{source}</p>
      </section>
      <span className={floatingPanelCatalogCompactRowTokenClassName()}>@</span>
    </article>
  )
}

export function MediaSourceMetadataListRow({ item }: { item: MediaCatalogSourceMetadataItem }) {
  const tags = buildSourceMetadataTags(item)
  return (
    <article className={mediaCompactListItemClassName()} data-kg-media-source-metadata="video-sequence" data-kg-command-menu-media-kind="video" data-kg-media-list-row-layout={MEDIA_COMPACT_LIST_ROW_LAYOUT} data-kg-media-list-view-row="1">
      <span className={mediaCompactListIconFrameClassName()} aria-hidden>
        <Video className={cn('h-3.5 w-3.5', UI_THEME_TOKENS.text.tertiary)} />
      </span>
      <section className="min-w-0" aria-label={`${item.name} source compact metadata`}>
        <h3 className={floatingPanelCatalogCompactRowTitleClassName()} title={item.name} data-kg-media-list-row-section="title">{item.name}</h3>
        <p className={floatingPanelCatalogCompactRowMetaClassName()} title={tags.join(' ')} data-kg-media-list-row-section="meta">{tags.join(' ') || 'Source-backed video sequence metadata'}</p>
      </section>
      <span className={floatingPanelCatalogCompactRowTokenClassName()}>source</span>
    </article>
  )
}

export function MediaActionListRow({
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
      className={mediaCompactListItemClassName()}
      data-kg-command-menu-media-action={action.id}
      data-kg-command-menu-prefix={prefix}
      data-kg-media-list-row-layout={MEDIA_COMPACT_LIST_ROW_LAYOUT}
      data-kg-media-list-view-row="1"
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
      <span className={mediaCompactListIconFrameClassName()} aria-hidden>
        <Icon className={cn('h-3.5 w-3.5', UI_THEME_TOKENS.text.tertiary)} />
      </span>
      <section className="min-w-0" aria-label={`${action.label} compact action`}>
        <h3 className={floatingPanelCatalogCompactRowTitleClassName()} data-kg-media-list-row-section="title">{action.label}</h3>
        <p className={floatingPanelCatalogCompactRowMetaClassName()} title={action.description} data-kg-media-list-row-section="meta">{action.group}</p>
      </section>
      <span className={floatingPanelCatalogCompactRowTokenClassName()}>{prefix}</span>
    </article>
  )
}

export function UploadedMediaListRow({
  item,
  infoLabel,
  onDelete,
  onDragStart,
  onSelect,
  onPreview,
}: {
  item: UploadedMediaPanelItem
  infoLabel: string
  onDelete: (item: UploadedMediaPanelItem) => void
  onDragStart: (event: React.DragEvent<HTMLElement>, item: UploadedMediaPanelItem, metadata?: UploadedMediaDragMetadata) => void
  onSelect: (item: UploadedMediaPanelItem) => void
  onPreview: (item: UploadedMediaPanelItem) => void
}) {
  const Icon = resolveMediaKindOverlayIcon(item.kind)
  const runtimeUrl = readUploadedMediaPanelItemRuntimeUrl(item)
  const generatedThumbnail = useNativeVideoMediaThumbnail({
    contentType: item.contentType,
    explicitThumbnailUrl: item.kind === 'image' ? runtimeUrl : '',
    kind: item.kind,
    url: runtimeUrl,
  })
  const generatedInfoLabel = [infoLabel, generatedThumbnail.metadataLabel].filter(Boolean).join(' | ')
  const buildDragPayload = () => buildUploadedMediaDragPayload(item, generatedThumbnail)
  const meta = [item.kind, item.contentType, item.status, item.sizeBytes > 0 ? `${Math.ceil(item.sizeBytes / 1024)}kb` : ''].filter(Boolean).join(' ')

  return (
    <article
      role="button"
      tabIndex={0}
      draggable={true}
      className={mediaCompactListItemClassName()}
      data-kg-media-upload-item={item.id}
      data-kg-media-draggable="1"
      data-kg-media-upload-kind={item.kind}
      data-kg-media-upload-status={item.status}
      data-kg-media-list-row-layout={MEDIA_COMPACT_LIST_ROW_LAYOUT}
      data-kg-media-list-view-row="1"
      onDragStart={event => onDragStart(event, item, generatedThumbnail)}
      onDragEnd={finishMediaDrag}
      onPointerDownCapture={event => {
        if (!shouldPrimeMediaRowDragPayload(event)) return
        primeMediaPointerDrag(event, buildDragPayload())
      }}
      onPointerDown={event => {
        if (!shouldHandleMediaRowPointer(event)) return
        startMediaPointerDrag(event, buildDragPayload())
      }}
      onPointerMove={event => {
        if (isMediaRowControlTarget(event.target)) return
        continueMediaPointerDrag(event, buildDragPayload())
      }}
      onMouseDownCapture={event => {
        if (!shouldPrimeMediaRowDragPayload(event)) return
        primeMediaMouseDrag(event, buildDragPayload())
      }}
      onMouseDown={event => {
        if (isMediaRowControlTarget(event.target)) return
        startMediaMouseDrag(event, buildDragPayload())
      }}
      onMouseMove={event => {
        if (isMediaRowControlTarget(event.target)) return
        continueMediaMouseDrag(event, buildDragPayload())
      }}
      onClick={event => {
        if (isMediaRowControlTarget(event.target)) return
        onSelect(item)
      }}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect(item)
      }}
    >
      <button
        type="button"
        className={mediaCompactListIconFrameClassName('group relative overflow-hidden p-0')}
        title={`Preview ${item.name}`}
        aria-label={`Preview ${item.name}`}
        data-kg-media-row-control="1"
        data-kg-media-thumbnail-fullscreen={item.id}
        onClick={event => {
          event.stopPropagation()
          onPreview(item)
        }}
      >
        <MediaKindOverlay Icon={Icon} label={item.kind} appearance="hover" />
        <MediaInfoOverlay label={generatedInfoLabel} appearance="hover" />
        <MediaOpenLinkOverlay href={runtimeUrl} appearance="hover" />
        <MediaDownloadOverlay href={runtimeUrl} kind={item.kind} appearance="hover" />
        {generatedThumbnail.url ? (
          <img src={generatedThumbnail.url} alt="" className="h-full w-full rounded object-cover" data-kg-command-menu-media-thumbnail="1" loading="lazy" decoding="async" {...LOW_PRIORITY_MEDIA_THUMBNAIL_IMAGE_PROPS} draggable={false} />
        ) : (
          <Icon className={cn('h-3.5 w-3.5', UI_THEME_TOKENS.text.tertiary)} aria-hidden />
        )}
      </button>
      <section className="min-w-0" aria-label={`${item.name} uploaded media compact summary`}>
        <h3 className={floatingPanelCatalogCompactRowTitleClassName()} title={item.name} data-kg-media-list-row-section="title">{item.name}</h3>
        <p className={floatingPanelCatalogCompactRowMetaClassName()} title={meta} data-kg-media-list-row-section="meta">{meta}</p>
      </section>
      <button
        type="button"
        className={cn('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
        title="Delete media"
        aria-label={`Delete ${item.name}`}
        data-kg-media-upload-delete={item.id}
        data-kg-media-row-control="1"
        onClick={event => {
          event.stopPropagation()
          onDelete(item)
        }}
      >
        <Trash2 className="h-3 w-3" aria-hidden />
      </button>
    </article>
  )
}
