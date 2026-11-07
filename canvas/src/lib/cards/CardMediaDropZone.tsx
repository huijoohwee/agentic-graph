import React from 'react'
import {
  MEDIA_DROP_CONSUMES_CANVAS_DROP_ATTRIBUTE,
  MEDIA_POINTER_DRAG_DROP_EVENT,
  claimMediaPointerDragDrop,
  clearMediaPointerDragPayload,
  hasMediaDragPayload,
  isMediaDragPointInsideElement,
  isMediaPointerDragDropClaimed,
  readMediaDragPayload,
  readMediaPointerDragPayload,
  type MediaDragPayload,
  type MediaPointerDragDropDetail,
} from '@/lib/ui/mediaDragPayload'
import { cn } from '@/lib/utils'

export const CARD_MEDIA_DROP_ZONE_FRAME_CLASS_NAME = 'relative m-0 flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded border bg-[color:var(--kg-input-bg)]'
export const CARD_MEDIA_DROP_ZONE_EMPTY_PLACEHOLDER_CLASS_NAME = 'text-lg font-semibold text-[color:var(--kg-text-tertiary)]'

export function useCardMediaDropZone(args: {
  onDropMedia?: (payload: MediaDragPayload) => void
}) {
  const { onDropMedia } = args
  const mediaDropRef = React.useRef<HTMLElement | null>(null)

  const handleMediaDragOver = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!onDropMedia || (!hasMediaDragPayload(event.dataTransfer) && !readMediaPointerDragPayload())) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }, [onDropMedia])

  const handleMediaDrop = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!onDropMedia) return
    const payload = readMediaDragPayload(event.dataTransfer) || readMediaPointerDragPayload()
    if (!payload) return
    event.preventDefault()
    event.stopPropagation()
    onDropMedia(payload)
    clearMediaPointerDragPayload()
  }, [onDropMedia])

  const handlePointerMediaDrop = React.useCallback((event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    if (!onDropMedia) return
    const payload = readMediaPointerDragPayload()
    if (!payload) return
    event.preventDefault()
    event.stopPropagation()
    onDropMedia(payload)
    clearMediaPointerDragPayload()
  }, [onDropMedia])

  React.useEffect(() => {
    if (!onDropMedia || typeof window === 'undefined') return
    const handlePointerDragDrop = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail as Partial<MediaPointerDragDropDetail> | null
      if (isMediaPointerDragDropClaimed(detail as MediaPointerDragDropDetail | null | undefined)) return
      const payload = detail?.payload
      const clientX = Number(detail?.clientX)
      const clientY = Number(detail?.clientY)
      const element = mediaDropRef.current
      if (!payload || !Number.isFinite(clientX) || !Number.isFinite(clientY) || !element) return
      if (!isMediaDragPointInsideElement(element, clientX, clientY)) return
      claimMediaPointerDragDrop(detail as MediaPointerDragDropDetail | null | undefined)
      onDropMedia(payload)
      clearMediaPointerDragPayload()
      try {
        event.preventDefault()
        event.stopPropagation()
        ;(event as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      } catch {
        void 0
      }
    }
    window.addEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, handlePointerDragDrop)
    return () => window.removeEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, handlePointerDragDrop)
  }, [onDropMedia])

  React.useEffect(() => {
    if (!onDropMedia || typeof document === 'undefined') return
    const isInsideDropSlot = (clientX: number, clientY: number): boolean => isMediaDragPointInsideElement(mediaDropRef.current, clientX, clientY)
    const handleDocumentDragOver = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer
      if (!dataTransfer || !hasMediaDragPayload(dataTransfer) || !isInsideDropSlot(event.clientX, event.clientY)) return
      event.preventDefault()
      event.stopPropagation()
      dataTransfer.dropEffect = 'copy'
    }
    const handleDocumentDrop = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer
      if (!dataTransfer || !hasMediaDragPayload(dataTransfer) || !isInsideDropSlot(event.clientX, event.clientY)) return
      const payload = readMediaDragPayload(dataTransfer)
      if (!payload) return
      event.preventDefault()
      event.stopPropagation()
      ;(event as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      onDropMedia(payload)
      clearMediaPointerDragPayload()
    }
    document.addEventListener('dragover', handleDocumentDragOver, true)
    document.addEventListener('drop', handleDocumentDrop, true)
    return () => {
      document.removeEventListener('dragover', handleDocumentDragOver, true)
      document.removeEventListener('drop', handleDocumentDrop, true)
    }
  }, [onDropMedia])

  return {
    mediaDropRef,
    mediaDropZoneProps: {
      [MEDIA_DROP_CONSUMES_CANVAS_DROP_ATTRIBUTE]: onDropMedia ? '1' : undefined,
      'data-kg-card-media-drop-zone': '1',
      onDragEnter: handleMediaDragOver,
      onDragOver: handleMediaDragOver,
      onDrop: handleMediaDrop,
      onMouseUp: handlePointerMediaDrop,
      onPointerUp: handlePointerMediaDrop,
    },
  } as const
}

export function CardMediaDropZoneFrame(props: {
  ariaLabel?: string
  children?: React.ReactNode
  className?: string
  dataAttributes?: Record<string, string | undefined>
  onDropMedia?: (payload: MediaDragPayload) => void
  style?: React.CSSProperties
}) {
  const { mediaDropRef, mediaDropZoneProps } = useCardMediaDropZone({ onDropMedia: props.onDropMedia })
  return (
    <figure
      ref={mediaDropRef}
      aria-label={props.ariaLabel}
      className={cn(CARD_MEDIA_DROP_ZONE_FRAME_CLASS_NAME, props.className)}
      style={{ borderColor: 'var(--kg-border)', ...props.style }}
      {...mediaDropZoneProps}
      {...(props.dataAttributes || {})}
    >
      {props.children}
    </figure>
  )
}
