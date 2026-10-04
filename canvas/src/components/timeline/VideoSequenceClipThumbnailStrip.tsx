import React from 'react'
import type { TimelineMediaReaderThumbnail } from './timelineMediaReader'
import type { VideoSequenceGeneratedFrameThumbnailOrigin } from './videoSequenceGeneratedFrameThumbnails'
import { formatVideoSequenceTimelineSecondsOffset } from './videoSequenceTimeline'
import type { MermaidGanttTimelineTaskSpan } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { MEDIA_IMAGE_FORMAT_PREFERENCE_ATTR, MEDIA_VIDEO_FORMAT_PREFERENCE_ATTR } from '@/lib/media/mediaFormatPreference'
import { beginMediaPointerDragPayload, clearMediaPointerDragPayload, finishMediaPointerDragPayloadForEvent, writeMediaDragPayload, type MediaDragPayload } from '@/lib/ui/mediaDragPayload'

type VideoSequenceClipThumbnailWindow = {
  sourceEndSeconds: number
  sourceStartSeconds: number
}

const THUMBNAIL_MOVE_DRAG_THRESHOLD_PX = 4

type ThumbnailMoveIntent = {
  clientX: number
  clientY: number
  pointerId: number
}

export function resolveVideoSequenceThumbnailRenderUrl(thumbnail: TimelineMediaReaderThumbnail): string {
  return thumbnail.rasterDataUrl || thumbnail.dataUrl
}

function resolveVideoSequenceThumbnailTimelinePosition(args: {
  span: MermaidGanttTimelineTaskSpan
  thumbnail: TimelineMediaReaderThumbnail
  window: VideoSequenceClipThumbnailWindow | null
}): number {
  if (!args.window) return args.span.startMinutes
  const sourceStart = Math.min(args.window.sourceStartSeconds, args.window.sourceEndSeconds)
  const sourceEnd = Math.max(args.window.sourceStartSeconds, args.window.sourceEndSeconds)
  const sourceSpan = Math.max(0.0001, sourceEnd - sourceStart)
  const sourceRatio = Math.min(1, Math.max(0, (args.thumbnail.timestampSeconds - sourceStart) / sourceSpan))
  return args.span.startMinutes + Math.max(0, args.span.durationMinutes) * sourceRatio
}

function buildVideoSequenceThumbnailDragPayload(args: {
  span: MermaidGanttTimelineTaskSpan
  thumbnail: TimelineMediaReaderThumbnail
}): MediaDragPayload {
  const timestampLabel = formatVideoSequenceTimelineSecondsOffset(args.thumbnail.timestampSeconds)
  const renderUrl = resolveVideoSequenceThumbnailRenderUrl(args.thumbnail)
  return {
    kind: 'image',
    url: renderUrl,
    label: `${args.span.label} frame ${timestampLabel}`,
    displayHeight: args.thumbnail.height,
    displayWidth: args.thumbnail.width,
    mimeHint: `image/${args.thumbnail.rasterFormat || args.thumbnail.format || 'png'}`,
    sourceKey: `${args.span.rowKey}:${Math.max(0, Math.round(args.thumbnail.timestampSeconds * 1_000_000))}`,
    thumbnailUrl: renderUrl,
  }
}

export function VideoSequenceClipThumbnailStrip({
  onSelectRowPosition,
  onMovePointerStart,
  span,
  suppressPreview = false,
  thumbnailWindow,
  thumbnailOrigin,
  thumbnails,
}: {
  onSelectRowPosition: (rowKey: string, positionMinutes: number) => void
  onMovePointerStart: (event: React.PointerEvent<HTMLElement>, span: MermaidGanttTimelineTaskSpan) => void
  span: MermaidGanttTimelineTaskSpan
  suppressPreview?: boolean
  thumbnailWindow: VideoSequenceClipThumbnailWindow | null
  thumbnailOrigin?: VideoSequenceGeneratedFrameThumbnailOrigin
  thumbnails: readonly TimelineMediaReaderThumbnail[]
}) {
  const [activeThumbnailIndex, setActiveThumbnailIndex] = React.useState<number | null>(null)
  const moveIntentRef = React.useRef<ThumbnailMoveIntent | null>(null)
  const frameDragIntentRef = React.useRef<ThumbnailMoveIntent | null>(null)
  const suppressClickRef = React.useRef(false)
  if (!thumbnails.length) return null
  const sourceStart = thumbnails[0]?.timestampSeconds
  const sourceEnd = thumbnails[thumbnails.length - 1]?.timestampSeconds
  const activeThumbnail = suppressPreview || activeThumbnailIndex == null ? null : thumbnails[activeThumbnailIndex] ?? null
  const activePreviewStyle = suppressPreview || activeThumbnailIndex == null
    ? undefined
    : { '--kg-video-sequence-clip-thumbnail-preview-left': `${((activeThumbnailIndex + 0.5) / thumbnails.length) * 100}%` } as React.CSSProperties
  return (
    <section
      className="timeline-video-sequence-clip-thumbnail-strip"
      aria-label={`${span.label} generated thumbnails`}
      data-kg-video-sequence-clip-thumbnail-strip="1"
      data-kg-video-sequence-clip-thumbnail-count={thumbnails.length}
      data-kg-video-sequence-clip-thumbnail-generated={thumbnailOrigin}
      data-kg-video-sequence-clip-thumbnail-image-format-preference={MEDIA_IMAGE_FORMAT_PREFERENCE_ATTR}
      data-kg-video-sequence-clip-thumbnail-video-format-preference={MEDIA_VIDEO_FORMAT_PREFERENCE_ATTR}
      data-kg-video-sequence-clip-thumbnail-source-start={sourceStart}
      data-kg-video-sequence-clip-thumbnail-source-end={sourceEnd}
      data-kg-video-sequence-clip-thumbnail-preview-active={activeThumbnail ? '1' : undefined}
      data-kg-video-sequence-clip-thumbnail-preview-suppressed={suppressPreview ? '1' : undefined}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setActiveThumbnailIndex(null)
      }}
      onMouseLeave={() => setActiveThumbnailIndex(null)}
    >
      {thumbnails.map((thumbnail, thumbnailIndex) => (
        <figure
          key={`thumbnail:${span.rowKey}:${thumbnail.timestampSeconds}:${thumbnail.width}x${thumbnail.height}`}
          className="timeline-video-sequence-clip-thumbnail"
          draggable={false}
          data-kg-video-sequence-clip-thumbnail="1"
          data-kg-video-sequence-clip-thumbnail-format={thumbnail.format}
          data-kg-video-sequence-clip-thumbnail-microsecond-time={Math.max(0, Math.round(thumbnail.timestampSeconds * 1_000_000))}
          data-kg-video-sequence-clip-thumbnail-raster-format={thumbnail.rasterFormat}
          data-kg-video-sequence-clip-thumbnail-time={thumbnail.timestampSeconds}
          onFocus={() => setActiveThumbnailIndex(thumbnailIndex)}
          onMouseEnter={() => {
            if (!suppressPreview) setActiveThumbnailIndex(thumbnailIndex)
          }}
          onPointerDown={event => {
            if (event.button !== 0) return
            event.stopPropagation()
            if (suppressPreview) return
            suppressClickRef.current = false
            moveIntentRef.current = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId }
            event.currentTarget.setPointerCapture?.(event.pointerId)
          }}
          onPointerMove={event => {
            const moveIntent = moveIntentRef.current
            if (!moveIntent || moveIntent.pointerId !== event.pointerId || event.buttons !== 1) return
            const deltaX = event.clientX - moveIntent.clientX
            const deltaY = event.clientY - moveIntent.clientY
            if (Math.hypot(deltaX, deltaY) < THUMBNAIL_MOVE_DRAG_THRESHOLD_PX) return
            suppressClickRef.current = true
            moveIntentRef.current = null
            onMovePointerStart(event, span)
          }}
          onPointerUp={event => {
            if (moveIntentRef.current?.pointerId === event.pointerId) moveIntentRef.current = null
          }}
          onPointerCancel={event => {
            if (moveIntentRef.current?.pointerId === event.pointerId) moveIntentRef.current = null
          }}
          onClick={event => {
            event.stopPropagation()
            if (suppressClickRef.current) {
              suppressClickRef.current = false
              return
            }
            onSelectRowPosition(span.rowKey, resolveVideoSequenceThumbnailTimelinePosition({ span, thumbnail, window: thumbnailWindow }))
          }}
        >
          <button
            type="button"
            className="timeline-video-sequence-clip-thumbnail-seek"
            aria-label={`${span.label} thumbnail ${formatVideoSequenceTimelineSecondsOffset(thumbnail.timestampSeconds)} ${thumbnail.format}/${thumbnail.rasterFormat}`}
          >
            <img alt="" decoding="async" draggable={false} height={thumbnail.height} loading="lazy" src={resolveVideoSequenceThumbnailRenderUrl(thumbnail)} width={thumbnail.width} />
          </button>
          <button
            type="button"
            className="timeline-video-sequence-clip-thumbnail-drag-affordance"
            aria-label={`Drag ${span.label} frame ${formatVideoSequenceTimelineSecondsOffset(thumbnail.timestampSeconds)} or activate to seek`}
            title="Drag frame image or activate to seek"
            draggable={true}
            data-kg-media-draggable="1"
            data-kg-video-sequence-clip-thumbnail-drag-affordance="1"
            data-kg-video-sequence-clip-thumbnail-drag-kind="image"
            onPointerDown={event => {
              event.stopPropagation()
              if (event.button !== 0) return
              clearMediaPointerDragPayload()
              suppressClickRef.current = false
              frameDragIntentRef.current = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId }
            }}
            onPointerMove={event => {
              event.stopPropagation()
              const intent = frameDragIntentRef.current
              if (!intent || intent.pointerId !== event.pointerId || event.buttons !== 1) return
              if (Math.hypot(event.clientX - intent.clientX, event.clientY - intent.clientY) < THUMBNAIL_MOVE_DRAG_THRESHOLD_PX) return
              frameDragIntentRef.current = null
              suppressClickRef.current = true
              beginMediaPointerDragPayload(buildVideoSequenceThumbnailDragPayload({ span, thumbnail }), intent)
            }}
            onPointerUp={event => { event.stopPropagation(); frameDragIntentRef.current = null }}
            onPointerCancel={event => { event.stopPropagation(); frameDragIntentRef.current = null; suppressClickRef.current = false; clearMediaPointerDragPayload() }}
            onDragStart={event => {
              const payload = buildVideoSequenceThumbnailDragPayload({ span, thumbnail })
              event.stopPropagation()
              frameDragIntentRef.current = null
              suppressClickRef.current = true
              writeMediaDragPayload(event.dataTransfer, payload)
              beginMediaPointerDragPayload(payload, { clientX: event.clientX, clientY: event.clientY })
            }}
            onDragEnd={event => {
              event.stopPropagation()
              finishMediaPointerDragPayloadForEvent(event.nativeEvent)
            }}
            onKeyDown={event => {
              event.stopPropagation()
              if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
                frameDragIntentRef.current = null
                suppressClickRef.current = false
                clearMediaPointerDragPayload()
              }
            }}
            onClick={event => {
              event.stopPropagation()
              if (suppressClickRef.current) { suppressClickRef.current = false; return }
              onSelectRowPosition(span.rowKey, resolveVideoSequenceThumbnailTimelinePosition({ span, thumbnail, window: thumbnailWindow }))
            }}
          >⠿</button>
          <figcaption
            className="timeline-video-sequence-clip-thumbnail-caption"
            data-kg-video-sequence-clip-thumbnail-caption-format={`${thumbnail.format}/${thumbnail.rasterFormat}`}
            data-kg-video-sequence-clip-thumbnail-caption-time={formatVideoSequenceTimelineSecondsOffset(thumbnail.timestampSeconds)}
          >
            <time dateTime={`PT${Math.max(0, thumbnail.timestampSeconds)}S`}>{formatVideoSequenceTimelineSecondsOffset(thumbnail.timestampSeconds)}</time>
          </figcaption>
        </figure>
      ))}
      {activeThumbnail ? (
        <figure
          className="timeline-video-sequence-clip-thumbnail-preview timeline-video-sequence-clip-thumbnail-strip-preview"
          data-kg-video-sequence-clip-thumbnail-preview="1"
          style={activePreviewStyle}
        >
          <img alt={`${span.label} frame ${formatVideoSequenceTimelineSecondsOffset(activeThumbnail.timestampSeconds)}`} decoding="async" draggable={false} height={activeThumbnail.height} loading="lazy" src={resolveVideoSequenceThumbnailRenderUrl(activeThumbnail)} width={activeThumbnail.width} />
          <figcaption
            className="timeline-video-sequence-clip-thumbnail-preview-caption"
            data-kg-video-sequence-clip-thumbnail-preview-caption={`${formatVideoSequenceTimelineSecondsOffset(activeThumbnail.timestampSeconds)} ${activeThumbnail.format}/${activeThumbnail.rasterFormat}`}
          >{formatVideoSequenceTimelineSecondsOffset(activeThumbnail.timestampSeconds)}</figcaption>
        </figure>
      ) : null}
    </section>
  )
}
