import { inferMediaKindFromResourceUrl } from '@/lib/graph/mediaUrlKind'

export const MEDIA_DRAG_PAYLOAD_MIME = 'application/x-agenticgraph-media+json'
export const MEDIA_POINTER_DRAG_PAYLOAD_CHANGE_EVENT = 'kg:media-pointer-drag-payload-change'
export const MEDIA_POINTER_DRAG_DROP_EVENT = 'kg:media-pointer-drag-drop'
export const MEDIA_DROP_CONSUMES_CANVAS_DROP_ATTRIBUTE = 'data-kg-media-drop-consumes-canvas-drop'
export const XR_SCENE_MEDIA_DRAG_SCHEMA = 'agenticgraph-xr-scene-media/v1'

export type XrSceneMediaDragProjection = Readonly<{
  schema: typeof XR_SCENE_MEDIA_DRAG_SCHEMA
  entityKind: 'environment' | 'asset'
  entityId: string
  label: string
  subjectLabel?: string
  description?: string
  category?: string
  transition?: 'linear' | 'hold'
}>

export type MediaDragPayload = {
  kind: 'image' | 'audio' | 'video'
  url: string
  label: string
  byteSize?: number
  displayHeight?: number
  displayWidth?: number
  durationSeconds?: number
  frameRate?: number
  mimeHint?: string
  thumbnailUrl?: string
  sourceKey?: string
  xrScene?: XrSceneMediaDragProjection
}

const normalizeText = (value: unknown): string => String(value || '').trim()

const readPositiveNumber = (value: unknown): number | undefined => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const readNonNegativeInteger = (value: unknown): number | undefined => {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

type MediaDragWindow = Window & {
  __kgMediaPointerDragPayload?: MediaDragPayload
  __kgMediaPointerDragClear?: () => void
  __kgMediaPointerDragClearTimer?: number
  __kgMediaPointerDragReleased?: boolean
  __kgMediaPointerDragStartClientX?: number
  __kgMediaPointerDragStartClientY?: number
  __kgMediaPointerDragLastClientX?: number
  __kgMediaPointerDragLastClientY?: number
}

export type MediaPointerDragDropDetail = {
  payload: MediaDragPayload
  clientX: number
  clientY: number
  startClientX?: number
  startClientY?: number
  __kgMediaPointerDropClaimed?: boolean
}

export function isMediaPointerDragDropClaimed(detail: MediaPointerDragDropDetail | null | undefined): boolean {
  return detail?.__kgMediaPointerDropClaimed === true
}

export function claimMediaPointerDragDrop(detail: MediaPointerDragDropDetail | null | undefined): void {
  if (!detail) return
  detail.__kgMediaPointerDropClaimed = true
}

export function isMediaPointerDragDistanceAccepted(
  detail: Pick<MediaPointerDragDropDetail, 'clientX' | 'clientY' | 'startClientX' | 'startClientY'>,
  minimumDistancePx = 6,
): boolean {
  if (!Number.isFinite(detail.startClientX) || !Number.isFinite(detail.startClientY)) return true
  const dx = detail.clientX - Number(detail.startClientX)
  const dy = detail.clientY - Number(detail.startClientY)
  return Math.hypot(dx, dy) >= minimumDistancePx
}

export function isMediaDropClaimedByNestedTarget(clientX: number, clientY: number): boolean {
  if (typeof document === 'undefined') return false
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false
  const target = document.elementFromPoint(clientX, clientY)
  if (target instanceof Element && !!target.closest(`[${MEDIA_DROP_CONSUMES_CANVAS_DROP_ATTRIBUTE}="1"]`)) return true
  return Array.from(document.querySelectorAll(`[${MEDIA_DROP_CONSUMES_CANVAS_DROP_ATTRIBUTE}="1"]`))
    .some(element => isMediaDragPointInsideElement(element, clientX, clientY))
}

export function isMediaDragPointInsideElement(element: Element | null | undefined, clientX: number, clientY: number): boolean {
  if (!element || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return false
  const rect = element.getBoundingClientRect()
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

const readFirstDraggedUrl = (value: unknown): string => {
  const text = normalizeText(value)
  if (!text) return ''
  return text
    .split(/\r?\n/g)
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#')) || ''
}

const buildFallbackMediaDragPayload = (url: string): MediaDragPayload | null => {
  const cleanUrl = normalizeText(url)
  if (!cleanUrl) return null
  const kind = inferMediaKindFromResourceUrl(cleanUrl)
  if (kind === 'svg') {
    return {
      kind: 'image',
      url: cleanUrl,
      label: 'image',
    }
  }
  if (kind !== 'image' && kind !== 'audio' && kind !== 'video') return null
  return {
    kind,
    url: cleanUrl,
    label: kind,
  }
}

export function normalizeXrSceneMediaDragProjection(value: unknown): XrSceneMediaDragProjection | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Partial<XrSceneMediaDragProjection>
  const schema = normalizeText(record.schema)
  const entityKind = normalizeText(record.entityKind)
  const entityId = normalizeText(record.entityId)
  const label = normalizeText(record.label)
  const subjectLabel = normalizeText(record.subjectLabel)
  if (schema !== XR_SCENE_MEDIA_DRAG_SCHEMA) return undefined
  if (entityKind !== 'environment' && entityKind !== 'asset') return undefined
  if (!entityId || !label) return undefined
  const transition = normalizeText(record.transition)
  return {
    schema: XR_SCENE_MEDIA_DRAG_SCHEMA,
    entityKind,
    entityId,
    label,
    subjectLabel: subjectLabel && Array.from(subjectLabel).length <= 80 ? subjectLabel : undefined,
    description: normalizeText(record.description) || undefined,
    category: normalizeText(record.category) || undefined,
    transition: transition === 'hold' || transition === 'linear' ? transition : undefined,
  }
}

export function normalizeMediaDragPayload(value: unknown): MediaDragPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<MediaDragPayload>
  const kind = normalizeText(record.kind)
  const url = normalizeText(record.url)
  if (kind !== 'image' && kind !== 'audio' && kind !== 'video') return null
  if (!url) return null
  return {
    kind,
    url,
    label: normalizeText(record.label) || kind,
    byteSize: readNonNegativeInteger(record.byteSize),
    displayHeight: readPositiveNumber(record.displayHeight),
    displayWidth: readPositiveNumber(record.displayWidth),
    durationSeconds: readPositiveNumber(record.durationSeconds),
    frameRate: readPositiveNumber(record.frameRate),
    mimeHint: normalizeText(record.mimeHint) || undefined,
    thumbnailUrl: normalizeText(record.thumbnailUrl) || undefined,
    sourceKey: normalizeText(record.sourceKey) || undefined,
    xrScene: normalizeXrSceneMediaDragProjection(record.xrScene),
  }
}

export function writeMediaDragPayload(dataTransfer: DataTransfer, payload: MediaDragPayload): void {
  const normalized = normalizeMediaDragPayload(payload)
  if (!normalized) return
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(MEDIA_DRAG_PAYLOAD_MIME, JSON.stringify(normalized))
  dataTransfer.setData('text/uri-list', normalized.url)
  dataTransfer.setData('text/plain', normalized.url)
}

export function readMediaDragPayload(dataTransfer: DataTransfer): MediaDragPayload | null {
  const raw = dataTransfer.getData(MEDIA_DRAG_PAYLOAD_MIME)
  if (raw) {
    try {
      return normalizeMediaDragPayload(JSON.parse(raw))
    } catch {
      // Fall through to URL formats exposed by the same native drag operation.
    }
  }
  return buildFallbackMediaDragPayload(
    readFirstDraggedUrl(dataTransfer.getData('text/uri-list'))
    || readFirstDraggedUrl(dataTransfer.getData('text/plain')),
  )
}

export function hasMediaDragPayload(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types || [])
  return types.includes(MEDIA_DRAG_PAYLOAD_MIME) || types.includes('text/uri-list') || types.includes('text/plain')
}

export function resolveMediaPointerReleaseClientPoint(args: {
  eventType: string
  eventClientX: number
  eventClientY: number
  lastClientX: number
  lastClientY: number
}): { clientX: number; clientY: number } {
  const hasEventPoint = Number.isFinite(args.eventClientX) && Number.isFinite(args.eventClientY)
  const hasLastPoint = Number.isFinite(args.lastClientX) && Number.isFinite(args.lastClientY)
  const releaseUsesTrackedDragPoint = args.eventType === 'mouseup' || args.eventType === 'dragend' || args.eventType === 'drop'
  const eventPointIsZeroPlaceholder = releaseUsesTrackedDragPoint && args.eventClientX === 0 && args.eventClientY === 0 && hasLastPoint
  const useEventPoint = !releaseUsesTrackedDragPoint && hasEventPoint && !eventPointIsZeroPlaceholder
  return {
    clientX: useEventPoint || !hasLastPoint ? args.eventClientX : args.lastClientX,
    clientY: useEventPoint || !hasLastPoint ? args.eventClientY : args.lastClientY,
  }
}

export function resolveMediaDragEventReleaseClientPoint(event: Pick<DragEvent, 'type' | 'clientX' | 'clientY'>): { clientX: number; clientY: number } {
  const mediaWindow = typeof window !== 'undefined' ? window as MediaDragWindow : null
  return resolveMediaPointerReleaseClientPoint({
    eventType: event.type,
    eventClientX: event.clientX,
    eventClientY: event.clientY,
    lastClientX: mediaWindow?.__kgMediaPointerDragLastClientX ?? Number.NaN,
    lastClientY: mediaWindow?.__kgMediaPointerDragLastClientY ?? Number.NaN,
  })
}

export function finishMediaPointerDragPayloadForEvent(event: Pick<DragEvent, 'type' | 'clientX' | 'clientY'>): void {
  const release = resolveMediaDragEventReleaseClientPoint(event)
  finishMediaPointerDragPayloadAt(release.clientX, release.clientY)
}

export function beginMediaPointerDragPayload(payload: MediaDragPayload, origin?: { clientX: number; clientY: number }): void {
  const normalized = normalizeMediaDragPayload(payload)
  if (!normalized || typeof window === 'undefined') return
  const mediaWindow = window as MediaDragWindow
  const hasOrigin = Number.isFinite(origin?.clientX) && Number.isFinite(origin?.clientY)
  if (!hasOrigin && mediaWindow.__kgMediaPointerDragPayload && mediaWindow.__kgMediaPointerDragClear) {
    mediaWindow.__kgMediaPointerDragPayload = normalized
    window.dispatchEvent(new CustomEvent(MEDIA_POINTER_DRAG_PAYLOAD_CHANGE_EVENT))
    return
  }
  mediaWindow.__kgMediaPointerDragClear?.()
  const startClientX = hasOrigin ? origin!.clientX : Number.NaN
  const startClientY = hasOrigin ? origin!.clientY : Number.NaN
  const rememberPointer = (event: PointerEvent | MouseEvent) => {
    const currentWindow = window as MediaDragWindow
    currentWindow.__kgMediaPointerDragLastClientX = event.clientX
    currentWindow.__kgMediaPointerDragLastClientY = event.clientY
  }
  const rememberNativeDrag = (event: DragEvent) => {
    const currentWindow = window as MediaDragWindow
    currentWindow.__kgMediaPointerDragLastClientX = event.clientX
    currentWindow.__kgMediaPointerDragLastClientY = event.clientY
  }
  const clearSoon = () => {
    const currentWindow = window as MediaDragWindow
    if (currentWindow.__kgMediaPointerDragClearTimer) window.clearTimeout(currentWindow.__kgMediaPointerDragClearTimer)
    currentWindow.__kgMediaPointerDragClearTimer = window.setTimeout(() => {
      currentWindow.__kgMediaPointerDragClear?.()
    }, 250)
  }
  const clear = () => {
    const currentWindow = window as MediaDragWindow
    if (currentWindow.__kgMediaPointerDragClearTimer) window.clearTimeout(currentWindow.__kgMediaPointerDragClearTimer)
    delete currentWindow.__kgMediaPointerDragPayload
    delete currentWindow.__kgMediaPointerDragClear
    delete currentWindow.__kgMediaPointerDragClearTimer
    delete currentWindow.__kgMediaPointerDragReleased
    delete currentWindow.__kgMediaPointerDragStartClientX
    delete currentWindow.__kgMediaPointerDragStartClientY
    delete currentWindow.__kgMediaPointerDragLastClientX
    delete currentWindow.__kgMediaPointerDragLastClientY
    window.removeEventListener('pointerup', handleRelease, true)
    window.removeEventListener('mouseup', handleRelease, true)
    window.removeEventListener('dragend', handleRelease, true)
    window.removeEventListener('pointermove', rememberPointer, true)
    window.removeEventListener('mousemove', rememberPointer, true)
    window.removeEventListener('dragover', rememberNativeDrag, true)
    window.removeEventListener('mouseup', clearSoon)
    window.dispatchEvent(new CustomEvent(MEDIA_POINTER_DRAG_PAYLOAD_CHANGE_EVENT))
  }
  const handleRelease = (event: PointerEvent | MouseEvent | DragEvent) => {
    finishMediaPointerDragPayloadForEvent(event)
  }
  mediaWindow.__kgMediaPointerDragPayload = normalized
  mediaWindow.__kgMediaPointerDragClear = clear
  mediaWindow.__kgMediaPointerDragReleased = false
  mediaWindow.__kgMediaPointerDragStartClientX = startClientX
  mediaWindow.__kgMediaPointerDragStartClientY = startClientY
  mediaWindow.__kgMediaPointerDragLastClientX = Number.NaN
  mediaWindow.__kgMediaPointerDragLastClientY = Number.NaN
  window.addEventListener('pointerup', handleRelease, { capture: true, once: true })
  window.addEventListener('mouseup', handleRelease, { capture: true, once: true })
  window.addEventListener('dragend', handleRelease, { capture: true, once: true })
  window.addEventListener('pointermove', rememberPointer, true)
  window.addEventListener('mousemove', rememberPointer, true)
  window.addEventListener('dragover', rememberNativeDrag, true)
  window.addEventListener('mouseup', clearSoon, { once: true })
  window.dispatchEvent(new CustomEvent(MEDIA_POINTER_DRAG_PAYLOAD_CHANGE_EVENT))
}

export function finishMediaPointerDragPayloadAt(clientX: number, clientY: number): void {
  if (typeof window === 'undefined') return
  const mediaWindow = window as MediaDragWindow
  const payload = normalizeMediaDragPayload(mediaWindow.__kgMediaPointerDragPayload)
  if (!payload || mediaWindow.__kgMediaPointerDragReleased) return
  mediaWindow.__kgMediaPointerDragReleased = true
  const releaseClientX = Number.isFinite(clientX) ? clientX : Number.isFinite(mediaWindow.__kgMediaPointerDragLastClientX) ? mediaWindow.__kgMediaPointerDragLastClientX! : Number.NaN
  const releaseClientY = Number.isFinite(clientY) ? clientY : Number.isFinite(mediaWindow.__kgMediaPointerDragLastClientY) ? mediaWindow.__kgMediaPointerDragLastClientY! : Number.NaN
  window.dispatchEvent(new CustomEvent<MediaPointerDragDropDetail>(MEDIA_POINTER_DRAG_DROP_EVENT, {
    detail: {
      payload,
      clientX: releaseClientX,
      clientY: releaseClientY,
      startClientX: mediaWindow.__kgMediaPointerDragStartClientX,
      startClientY: mediaWindow.__kgMediaPointerDragStartClientY,
    },
  }))
  if (mediaWindow.__kgMediaPointerDragClearTimer) window.clearTimeout(mediaWindow.__kgMediaPointerDragClearTimer)
  mediaWindow.__kgMediaPointerDragClearTimer = window.setTimeout(() => {
    mediaWindow.__kgMediaPointerDragClear?.()
  }, 250)
}

export function readMediaPointerDragPayload(): MediaDragPayload | null {
  if (typeof window === 'undefined') return null
  return normalizeMediaDragPayload((window as MediaDragWindow).__kgMediaPointerDragPayload)
}

export function clearMediaPointerDragPayload(): void {
  if (typeof window === 'undefined') return
  const mediaWindow = window as MediaDragWindow
  mediaWindow.__kgMediaPointerDragClear?.()
}
