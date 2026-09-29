import React from 'react'
import { type LucideIcon } from 'lucide-react'
import type { CommandMenuRichMediaItem } from '@/lib/command-menu/commandMenuRichMediaInventory'
import { readUploadedMediaPanelDedupeKey, readUploadedMediaPanelItemRuntimeUrl, type UploadedMediaPanelItem } from '@/lib/storage/uploadedMediaPanelItems'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { beginMediaPointerDragPayload, finishMediaPointerDragPayloadForEvent, writeMediaDragPayload, type MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import { MediaDownloadOverlay, MediaInfoOverlay, MediaKindOverlay, MediaOpenLinkOverlay } from '@/lib/ui/MediaKindOverlay'
import { resolveMediaKindOverlayIcon } from '@/lib/ui/mediaKindOverlayIcon'
import {
  FLOATING_PANEL_CATALOG_COMPACT_ICON_FRAME_CLASSNAME,
  FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT,
  FLOATING_PANEL_CATALOG_THREE_ROW_GRID_CLASSNAME,
  FLOATING_PANEL_CATALOG_THREE_ROW_THUMBNAIL_FRAME_CLASSNAME,
  floatingPanelCatalogCompactIconFrameClassName,
  floatingPanelCatalogCompactRowClassName,
  floatingPanelCatalogThreeRowClassName,
  floatingPanelCatalogThreeRowThumbnailFrameClassName,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { isPreferredRasterImageFormat, readPreferredImageFormat } from '@/lib/media/mediaFormatPreference'
import { buildRuntimeStorageMediaAccessUrl, normalizeRuntimeStorageMediaUrl } from '@/lib/storage/runtimeMediaUrl'
import { useTimelineMediaReaderSummary } from '@/components/timeline/timelineMediaReader'
import { cn } from '@/lib/utils'
import { LOW_PRIORITY_MEDIA_THUMBNAIL_IMAGE_PROPS } from './mediaCatalogTypes'

export const isMediaRowControlTarget = (target: EventTarget | null): boolean => {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false
  return !!target.closest('a, button, input, textarea, select, [data-kg-media-row-control="1"]')
}

export const shouldHandleMediaRowPointer = (event: React.PointerEvent<HTMLElement>): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && !isMediaRowControlTarget(event.target)

export const shouldPrimeMediaRowDragPayload = (
  event: React.MouseEvent<HTMLElement> | React.PointerEvent<HTMLElement>,
): boolean => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  if (typeof Element === 'undefined' || !(event.target instanceof Element)) return false
  if (event.target.closest('input, textarea, select, [data-kg-media-upload-rename], [data-kg-media-upload-delete], [data-kg-media-open-link-overlay], [data-kg-media-download-overlay]')) return false
  return !!event.target.closest('[data-kg-media-draggable="1"], [data-kg-media-drag-affordance="frame"], [data-kg-command-menu-media-thumbnail="1"]')
}

const isOpenableMediaHref = (value: string): boolean =>
  /^(https?:|blob:|data:|\/|\.\/|\.\.\/|docs\/)/i.test(value.trim())

const readFirstOpenableMediaHref = (candidates: ReadonlyArray<unknown>): string => {
  for (const candidate of candidates) {
    const href = String(candidate || '').trim()
    if (href && isOpenableMediaHref(href)) return buildRuntimeMediaHref(href)
  }
  return ''
}

const buildRuntimeMediaHref = (href: string): string => {
  const normalized = normalizeRuntimeStorageMediaUrl(href)
  return buildRuntimeStorageMediaAccessUrl({ publicUrl: normalized }) || normalized
}

export const readRichMediaInsertUrl = (item: CommandMenuRichMediaItem): string =>
  readFirstOpenableMediaHref([item.openUrl, item.src, item.thumbnailUrl])

export const readRichMediaPreviewUrl = (item: CommandMenuRichMediaItem): string =>
  readFirstOpenableMediaHref([item.src, item.openUrl, item.thumbnailUrl])

export function readRichMediaOpenHref(item: CommandMenuRichMediaItem): string {
  return readFirstOpenableMediaHref([item.openUrl, item.src, item.thumbnailUrl])
}

export function getMediaNameSyncKey(item: CommandMenuRichMediaItem): string {
  const owner = item.renameOwner
  if (owner?.type === 'markdownLine') return String(owner.href || '').trim()
  return String(item.openUrl || item.src || '').trim()
}

export function useNativeVideoMediaThumbnail(args: {
  contentType?: string
  explicitThumbnailUrl: string
  kind: string
  url: string
}): {
  audioChannelCount: number
  audioCodec: string
  audioSampleRate: number
  audioTrackCount: number
  averageVideoBitrate: number
  averageVideoFrameRate: number
  byteSize: number
  bytesRead: number
  containerBrand: string
  durationSeconds: number
  format: string
  formatName: string
  metadataLabel: string
  mimeType: string
  rasterFormat: string
  resolution: string
  timestampSeconds: number | null
  url: string
  videoCodec: string
  videoTrackCount: number
} {
  const explicitFormat = readPreferredImageFormat(args.explicitThumbnailUrl, args.contentType || '')
  const active = args.kind === 'video' && !args.explicitThumbnailUrl && !!args.url
  const summary = useTimelineMediaReaderSummary({
    active,
    url: args.url,
  })
  const thumbnail = summary.thumbnails[0] || null
  const resolution = summary.displayWidth > 0 && summary.displayHeight > 0 ? `${summary.displayWidth}x${summary.displayHeight}` : ''
  const metadataLabel = [
    summary.formatName,
    summary.mimeType,
    resolution,
    summary.durationSeconds > 0 ? `${summary.durationSeconds.toFixed(2)}s` : '',
    summary.primaryVideoCodec,
    summary.primaryAudioCodec,
    summary.averageVideoFrameRate > 0 ? `${Number.isInteger(summary.averageVideoFrameRate) ? summary.averageVideoFrameRate : summary.averageVideoFrameRate.toFixed(2)}fps` : '',
  ].filter(Boolean).join(' ')
  return {
    audioChannelCount: summary.audioChannelCount,
    audioCodec: summary.primaryAudioCodec,
    audioSampleRate: summary.audioSampleRate,
    audioTrackCount: summary.audioTrackCount,
    averageVideoBitrate: summary.averageVideoBitrate,
    averageVideoFrameRate: summary.averageVideoFrameRate,
    byteSize: summary.byteSize,
    bytesRead: summary.bytesRead,
    containerBrand: summary.containerBrand,
    durationSeconds: summary.durationSeconds,
    format: thumbnail?.format || explicitFormat,
    formatName: summary.formatName,
    metadataLabel,
    mimeType: summary.mimeType,
    rasterFormat: thumbnail?.rasterFormat || (isPreferredRasterImageFormat(explicitFormat) ? explicitFormat : ''),
    resolution,
    timestampSeconds: thumbnail ? thumbnail.timestampSeconds : null,
    url: args.explicitThumbnailUrl || thumbnail?.dataUrl || '',
    videoCodec: summary.primaryVideoCodec,
    videoTrackCount: summary.videoTrackCount,
  }
}

export type UploadedMediaDragMetadata = {
  averageVideoFrameRate?: number
  byteSize?: number
  displayHeight?: number
  displayWidth?: number
  durationSeconds?: number
  mimeType?: string
}

const readNativeVideoMediaThumbnailMetadataAttrs = (thumbnail: ReturnType<typeof useNativeVideoMediaThumbnail>): React.ImgHTMLAttributes<HTMLImageElement> => ({
  'data-kg-command-menu-media-metadata': thumbnail.metadataLabel ? 'native' : undefined,
  'data-kg-command-menu-media-metadata-audio-channels': thumbnail.audioChannelCount > 0 ? thumbnail.audioChannelCount : undefined,
  'data-kg-command-menu-media-metadata-audio-codec': thumbnail.audioCodec || undefined,
  'data-kg-command-menu-media-metadata-audio-sample-rate': thumbnail.audioSampleRate > 0 ? thumbnail.audioSampleRate : undefined,
  'data-kg-command-menu-media-metadata-audio-tracks': thumbnail.audioTrackCount > 0 ? thumbnail.audioTrackCount : undefined,
  'data-kg-command-menu-media-metadata-bitrate': thumbnail.averageVideoBitrate > 0 ? thumbnail.averageVideoBitrate : undefined,
  'data-kg-command-menu-media-metadata-byte-size': thumbnail.byteSize > 0 ? thumbnail.byteSize : undefined,
  'data-kg-command-menu-media-metadata-bytes-read': thumbnail.bytesRead > 0 ? thumbnail.bytesRead : undefined,
  'data-kg-command-menu-media-metadata-container-brand': thumbnail.containerBrand || undefined,
  'data-kg-command-menu-media-metadata-duration': thumbnail.durationSeconds > 0 ? thumbnail.durationSeconds : undefined,
  'data-kg-command-menu-media-metadata-format': thumbnail.formatName || undefined,
  'data-kg-command-menu-media-metadata-frame-rate': thumbnail.averageVideoFrameRate > 0 ? thumbnail.averageVideoFrameRate : undefined,
  'data-kg-command-menu-media-metadata-mime-type': thumbnail.mimeType || undefined,
  'data-kg-command-menu-media-metadata-resolution': thumbnail.resolution || undefined,
  'data-kg-command-menu-media-metadata-video-codec': thumbnail.videoCodec || undefined,
  'data-kg-command-menu-media-metadata-video-tracks': thumbnail.videoTrackCount > 0 ? thumbnail.videoTrackCount : undefined,
}) as React.ImgHTMLAttributes<HTMLImageElement>

export const MEDIA_LIST_THUMBNAIL_COLUMN_CLASSNAME = FLOATING_PANEL_CATALOG_THREE_ROW_GRID_CLASSNAME
export const MEDIA_LIST_THUMBNAIL_FRAME_CLASSNAME = FLOATING_PANEL_CATALOG_THREE_ROW_THUMBNAIL_FRAME_CLASSNAME
export const MEDIA_COMPACT_LIST_ROW_LAYOUT = FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT
export const MEDIA_COMPACT_LIST_ICON_FRAME_CLASSNAME = FLOATING_PANEL_CATALOG_COMPACT_ICON_FRAME_CLASSNAME

export function mediaListThumbnailFrameClassName(extraClassName?: string): string {
  return floatingPanelCatalogThreeRowThumbnailFrameClassName(extraClassName)
}

export function mediaCompactListIconFrameClassName(extraClassName?: string): string {
  return floatingPanelCatalogCompactIconFrameClassName(extraClassName)
}

export function MediaThumbnailCaption(props: {
  format: string
  metadataLabel?: string
  rasterFormat: string
  timestampSeconds: number | null
}) {
  const formatLabel = [props.format, props.rasterFormat && props.rasterFormat !== props.format ? props.rasterFormat : '']
    .filter(Boolean)
    .join('/')
  const timeLabel = props.timestampSeconds === null ? '' : `${props.timestampSeconds.toFixed(2)}s`
  const label = [timeLabel, formatLabel, props.metadataLabel].filter(Boolean).join(' ')
  if (!label) return null
  return (
    <span
      className="pointer-events-none absolute bottom-1 left-1 z-20 max-w-[calc(100%-0.5rem)] truncate rounded bg-slate-950/75 px-1.5 py-0.5 text-xs font-semibold leading-3 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      data-kg-command-menu-media-thumbnail-caption="1"
    >
      {label}
    </span>
  )
}

export function MediaListThumbnailIconFrame({ Icon, label, infoLabel }: { Icon: LucideIcon; label: string; infoLabel?: string }) {
  return (
    <span className={mediaListThumbnailFrameClassName('items-center justify-center')}>
      <MediaKindOverlay Icon={Icon} label={label} appearance="hover" />
      <MediaInfoOverlay label={infoLabel || label} appearance="hover" />
      <Icon className={cn('h-4 w-4', UI_THEME_TOKENS.text.tertiary)} strokeWidth={1.7} aria-hidden />
    </span>
  )
}

export function MediaCandidateThumb({
  item,
  onDragStart,
}: {
  item: CommandMenuRichMediaItem
  onDragStart: (event: React.DragEvent<HTMLElement>, item: CommandMenuRichMediaItem) => void
}) {
  const previewUrl = readRichMediaPreviewUrl(item)
  const explicitThumbnail = readFirstOpenableMediaHref([
    item.thumbnailUrl,
    item.kind === 'image' ? previewUrl : '',
  ])
  const generatedThumbnail = useNativeVideoMediaThumbnail({
    explicitThumbnailUrl: explicitThumbnail,
    kind: item.kind,
    url: previewUrl || readRichMediaOpenHref(item),
  })
  const thumbnail = generatedThumbnail.url
  const openHref = readRichMediaOpenHref(item)
  const infoLabel = [getCommandMenuMediaDescription(item), generatedThumbnail.metadataLabel].filter(Boolean).join(' | ')
  if (thumbnail) {
    return (
      <span
        className={mediaListThumbnailFrameClassName('cursor-grab active:cursor-grabbing')}
        draggable={true}
        data-kg-media-drag-affordance="frame"
        data-kg-media-draggable="1"
        data-kg-media-row-control="1"
        onPointerDown={event => startMediaPointerDrag(event, buildCommandMenuMediaDragPayload(item))}
        onPointerMove={event => continueMediaPointerDrag(event, buildCommandMenuMediaDragPayload(item))}
        onMouseDown={event => startMediaMouseDrag(event, buildCommandMenuMediaDragPayload(item))}
        onMouseMove={event => continueMediaMouseDrag(event, buildCommandMenuMediaDragPayload(item))}
        onDragStart={event => onDragStart(event, item)}
        onDragEnd={finishMediaDrag}
      >
        <MediaKindOverlay Icon={resolveMediaKindOverlayIcon(item.kind)} label={item.kind} appearance="hover" />
        <MediaInfoOverlay label={infoLabel} appearance="hover" />
        <MediaOpenLinkOverlay href={openHref} appearance="hover" />
        <img src={thumbnail} alt="" className="h-full w-full rounded object-cover" data-kg-command-menu-media-thumbnail="1" data-kg-command-menu-media-thumbnail-format={generatedThumbnail.format || undefined} data-kg-command-menu-media-thumbnail-raster-format={generatedThumbnail.rasterFormat || undefined} data-kg-command-menu-media-thumbnail-time={generatedThumbnail.timestampSeconds ?? undefined} {...readNativeVideoMediaThumbnailMetadataAttrs(generatedThumbnail)} loading="lazy" decoding="async" {...LOW_PRIORITY_MEDIA_THUMBNAIL_IMAGE_PROPS} draggable={false} />
        <MediaThumbnailCaption format={generatedThumbnail.format} metadataLabel={generatedThumbnail.metadataLabel} rasterFormat={generatedThumbnail.rasterFormat} timestampSeconds={generatedThumbnail.timestampSeconds} />
      </span>
    )
  }
  const Icon = resolveMediaKindOverlayIcon(item.kind)
  return (
    <span
      draggable={true}
      data-kg-media-drag-affordance="frame"
      data-kg-media-draggable="1"
      data-kg-media-row-control="1"
      onPointerDown={event => startMediaPointerDrag(event, buildCommandMenuMediaDragPayload(item))}
      onPointerMove={event => continueMediaPointerDrag(event, buildCommandMenuMediaDragPayload(item))}
      onMouseDown={event => startMediaMouseDrag(event, buildCommandMenuMediaDragPayload(item))}
      onMouseMove={event => continueMediaMouseDrag(event, buildCommandMenuMediaDragPayload(item))}
      onDragStart={event => onDragStart(event, item)}
      onDragEnd={finishMediaDrag}
    >
      <MediaListThumbnailIconFrame Icon={Icon} label={item.kind} infoLabel={infoLabel} />
    </span>
  )
}

export function MediaCandidatePreview({
  item,
  onDragStart,
}: {
  item: CommandMenuRichMediaItem
  onDragStart: (event: React.DragEvent<HTMLElement>, item: CommandMenuRichMediaItem) => void
}) {
  const previewUrl = readRichMediaPreviewUrl(item)
  const explicitThumbnail = readFirstOpenableMediaHref([
    item.thumbnailUrl,
    item.kind === 'image' ? previewUrl : '',
  ])
  const generatedThumbnail = useNativeVideoMediaThumbnail({
    explicitThumbnailUrl: explicitThumbnail,
    kind: item.kind,
    url: previewUrl || readRichMediaOpenHref(item),
  })
  const thumbnail = generatedThumbnail.url
  const Icon = resolveMediaKindOverlayIcon(item.kind)
  const openHref = readRichMediaOpenHref(item)
  const infoLabel = [getCommandMenuMediaDescription(item), generatedThumbnail.metadataLabel].filter(Boolean).join(' | ')
  if (thumbnail) {
    return (
      <figure
        className={cn('group relative m-0 aspect-[16/9] w-full cursor-grab overflow-hidden border-b active:cursor-grabbing', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
        draggable={true}
        data-kg-media-drag-affordance="frame"
        data-kg-media-draggable="1"
        data-kg-media-row-control="1"
        onPointerDown={event => startMediaPointerDrag(event, buildCommandMenuMediaDragPayload(item))}
        onPointerMove={event => continueMediaPointerDrag(event, buildCommandMenuMediaDragPayload(item))}
        onMouseDown={event => startMediaMouseDrag(event, buildCommandMenuMediaDragPayload(item))}
        onMouseMove={event => continueMediaMouseDrag(event, buildCommandMenuMediaDragPayload(item))}
        onDragStart={event => onDragStart(event, item)}
        onDragEnd={finishMediaDrag}
      >
        <MediaKindOverlay Icon={Icon} label={item.kind} appearance="hover" />
        <MediaInfoOverlay label={infoLabel} appearance="hover" />
        <MediaOpenLinkOverlay href={openHref} appearance="hover" />
        <img src={thumbnail} alt="" className="h-full w-full object-cover" data-kg-command-menu-media-thumbnail="1" data-kg-command-menu-media-thumbnail-format={generatedThumbnail.format || undefined} data-kg-command-menu-media-thumbnail-raster-format={generatedThumbnail.rasterFormat || undefined} data-kg-command-menu-media-thumbnail-time={generatedThumbnail.timestampSeconds ?? undefined} {...readNativeVideoMediaThumbnailMetadataAttrs(generatedThumbnail)} loading="lazy" decoding="async" {...LOW_PRIORITY_MEDIA_THUMBNAIL_IMAGE_PROPS} draggable={false} />
        <MediaThumbnailCaption format={generatedThumbnail.format} metadataLabel={generatedThumbnail.metadataLabel} rasterFormat={generatedThumbnail.rasterFormat} timestampSeconds={generatedThumbnail.timestampSeconds} />
      </figure>
    )
  }
  return (
    <figure
      className={cn('group relative m-0 grid aspect-[16/9] w-full cursor-grab place-items-center border-b active:cursor-grabbing', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
      draggable={true}
      data-kg-media-drag-affordance="frame"
      data-kg-media-draggable="1"
      data-kg-media-row-control="1"
      onPointerDown={event => startMediaPointerDrag(event, buildCommandMenuMediaDragPayload(item))}
      onPointerMove={event => continueMediaPointerDrag(event, buildCommandMenuMediaDragPayload(item))}
      onMouseDown={event => startMediaMouseDrag(event, buildCommandMenuMediaDragPayload(item))}
      onMouseMove={event => continueMediaMouseDrag(event, buildCommandMenuMediaDragPayload(item))}
      onDragStart={event => onDragStart(event, item)}
      onDragEnd={finishMediaDrag}
    >
      <MediaKindOverlay Icon={Icon} label={item.kind} appearance="hover" />
      <MediaInfoOverlay label={infoLabel} appearance="hover" />
      <MediaOpenLinkOverlay href={openHref} appearance="hover" />
      <Icon className={cn('h-7 w-7', UI_THEME_TOKENS.text.tertiary)} strokeWidth={1.7} aria-hidden />
    </figure>
  )
}

export function UploadedMediaPreview({
  item,
  infoLabel,
  onDragStart,
  onPreview,
}: {
  item: UploadedMediaPanelItem
  infoLabel: string
  onDragStart: (event: React.DragEvent<HTMLElement>, item: UploadedMediaPanelItem, metadata?: UploadedMediaDragMetadata) => void
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
  return (
    <button
      type="button"
      className={cn('group relative m-0 grid aspect-[16/9] w-full cursor-zoom-in place-items-center overflow-hidden border-x-0 border-b border-t-0 p-0 text-left', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
      title={`Preview ${item.name}`}
      aria-label={`Preview ${item.name}`}
      draggable={true}
      data-kg-media-thumbnail-fullscreen={item.id}
      data-kg-media-draggable="1"
      data-kg-media-row-control="1"
      onPointerDown={event => startMediaPointerDrag(event, buildDragPayload())}
      onPointerMove={event => continueMediaPointerDrag(event, buildDragPayload())}
      onMouseDown={event => startMediaMouseDrag(event, buildDragPayload())}
      onMouseMove={event => continueMediaMouseDrag(event, buildDragPayload())}
      onDragStart={event => onDragStart(event, item, generatedThumbnail)}
      onDragEnd={finishMediaDrag}
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
        <>
          <img
            src={generatedThumbnail.url}
            alt=""
            className="h-full w-full object-cover"
            data-kg-command-menu-media-thumbnail="1"
            data-kg-command-menu-media-thumbnail-format={generatedThumbnail.format || undefined}
            data-kg-command-menu-media-thumbnail-raster-format={generatedThumbnail.rasterFormat || undefined}
            data-kg-command-menu-media-thumbnail-time={generatedThumbnail.timestampSeconds ?? undefined}
            {...readNativeVideoMediaThumbnailMetadataAttrs(generatedThumbnail)}
            loading="lazy"
            decoding="async"
            {...LOW_PRIORITY_MEDIA_THUMBNAIL_IMAGE_PROPS}
            draggable={true}
            onPointerDown={event => startMediaPointerDrag(event, buildDragPayload())}
            onPointerMove={event => continueMediaPointerDrag(event, buildDragPayload())}
            onMouseDown={event => startMediaMouseDrag(event, buildDragPayload())}
            onMouseMove={event => continueMediaMouseDrag(event, buildDragPayload())}
            onDragStart={event => onDragStart(event, item, generatedThumbnail)}
            onDragEnd={finishMediaDrag}
          />
          <MediaThumbnailCaption format={generatedThumbnail.format} metadataLabel={generatedThumbnail.metadataLabel} rasterFormat={generatedThumbnail.rasterFormat} timestampSeconds={generatedThumbnail.timestampSeconds} />
        </>
      ) : (
        <Icon className={cn('h-7 w-7', UI_THEME_TOKENS.text.tertiary)} strokeWidth={1.7} aria-hidden />
      )}
    </button>
  )
}

export function mediaCardClassName(): string {
  return cn(
    'min-w-0 cursor-grab overflow-hidden rounded border text-left shadow-sm transition-colors active:cursor-grabbing',
    UI_THEME_TOKENS.panel.border,
    UI_THEME_TOKENS.panel.bg,
    UI_THEME_TOKENS.button.hoverBg,
  )
}

export function mediaListItemClassName(): string {
  return floatingPanelCatalogThreeRowClassName('cursor-grab active:cursor-grabbing')
}

export function mediaCompactListItemClassName(): string {
  return floatingPanelCatalogCompactRowClassName()
}

export function getCommandMenuMediaSourceLabel(item: CommandMenuRichMediaItem): string {
  return item.source === 'graph' ? (item.panelTitle || 'Graph node media') : 'Markdown media'
}

export function getCommandMenuMediaDescription(item: CommandMenuRichMediaItem): string {
  return item.openUrl || item.src || item.srcDoc || item.label
}

export function getUploadedMediaDescriptionKey(item: UploadedMediaPanelItem): string {
  return String(item.storage?.contentHash || item.id || readUploadedMediaPanelDedupeKey(item)).trim()
}

export function buildCommandMenuMediaDragPayload(item: CommandMenuRichMediaItem): MediaDragPayload | null {
  if (item.kind !== 'image' && item.kind !== 'audio' && item.kind !== 'video') return null
  const url = readRichMediaInsertUrl(item)
  if (!url) return null
  return {
    kind: item.kind,
    url,
    label: item.label || item.kind,
    thumbnailUrl: item.thumbnailUrl || undefined,
    sourceKey: item.key,
  }
}

export function buildUploadedMediaDragPayload(item: UploadedMediaPanelItem, metadata: UploadedMediaDragMetadata = {}): MediaDragPayload | null {
  if (item.kind !== 'image' && item.kind !== 'audio' && item.kind !== 'video') return null
  const url = readUploadedMediaPanelItemRuntimeUrl(item)
  if (!url) return null
  return {
    kind: item.kind,
    url,
    label: item.name || item.kind,
    byteSize: item.sizeBytes > 0 ? item.sizeBytes : metadata.byteSize,
    displayHeight: item.displayHeight || metadata.displayHeight,
    displayWidth: item.displayWidth || metadata.displayWidth,
    durationSeconds: item.durationSeconds || metadata.durationSeconds,
    frameRate: item.frameRate || metadata.averageVideoFrameRate,
    mimeHint: item.contentType || metadata.mimeType || undefined,
    sourceKey: item.storage?.contentHash || item.id,
  }
}

export function startMediaDrag(event: React.DragEvent<HTMLElement>, payload: MediaDragPayload | null): void {
  if (!payload) return
  event.stopPropagation()
  writeMediaDragPayload(event.dataTransfer, payload)
  beginMediaPointerDragPayload(payload, { clientX: event.clientX, clientY: event.clientY })
}

export function startMediaPointerDrag(event: React.PointerEvent<HTMLElement>, payload: MediaDragPayload | null): void {
  if (!payload) return
  event.stopPropagation()
  beginMediaPointerDragPayload(payload, { clientX: event.clientX, clientY: event.clientY })
}

export function primeMediaPointerDrag(event: React.PointerEvent<HTMLElement>, payload: MediaDragPayload | null): void {
  if (!payload) return
  beginMediaPointerDragPayload(payload, { clientX: event.clientX, clientY: event.clientY })
}

export function startMediaMouseDrag(event: React.MouseEvent<HTMLElement>, payload: MediaDragPayload | null): void {
  if (!payload) return
  event.stopPropagation()
  beginMediaPointerDragPayload(payload, { clientX: event.clientX, clientY: event.clientY })
}

export function primeMediaMouseDrag(event: React.MouseEvent<HTMLElement>, payload: MediaDragPayload | null): void {
  if (!payload) return
  beginMediaPointerDragPayload(payload, { clientX: event.clientX, clientY: event.clientY })
}

export function continueMediaPointerDrag(event: React.PointerEvent<HTMLElement>, payload: MediaDragPayload | null): void {
  if (!payload || event.buttons !== 1) return
  event.stopPropagation()
  beginMediaPointerDragPayload(payload)
}

export function continueMediaMouseDrag(event: React.MouseEvent<HTMLElement>, payload: MediaDragPayload | null): void {
  if (!payload || event.buttons !== 1) return
  event.stopPropagation()
  beginMediaPointerDragPayload(payload)
}

export function finishMediaDrag(event: React.DragEvent<HTMLElement> | React.MouseEvent<HTMLElement> | React.PointerEvent<HTMLElement>): void {
  event.stopPropagation()
  finishMediaPointerDragPayloadForEvent(event.nativeEvent)
}
