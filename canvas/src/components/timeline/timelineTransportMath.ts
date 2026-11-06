/** Store-free timeline values shared by Graph and portable consumers. */
export const TIMELINE_TRANSPORT_PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2, 4, 8, 10, 15, 20] as const
export const TIMELINE_TRANSPORT_ZOOM_LEVELS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6] as const
export const TIMELINE_TRANSPORT_GESTURE_ZOOM_DELTA = 24
export const TIMELINE_TRANSPORT_GESTURE_MAX_STEPS = 3
export const TIMELINE_TRANSPORT_WHEEL_LINE_DELTA = 16
export const TIMELINE_TRANSPORT_AUTOMATION_INTENTS = [
  'zoom-out',
  'zoom-in',
  'fit-timeline',
  'center-playhead',
] as const

export type TimelineTransportPlaybackRate = (typeof TIMELINE_TRANSPORT_PLAYBACK_RATES)[number]
export type TimelineTransportZoomLevel = (typeof TIMELINE_TRANSPORT_ZOOM_LEVELS)[number]
export type TimelineTransportAutomationIntent = (typeof TIMELINE_TRANSPORT_AUTOMATION_INTENTS)[number]

export function clampTimelineTransportValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function resolveTimelineTransportPlaybackRate(
  value: unknown,
  fallback: TimelineTransportPlaybackRate,
): TimelineTransportPlaybackRate {
  const parsed = Number(value)
  return TIMELINE_TRANSPORT_PLAYBACK_RATES.includes(parsed as TimelineTransportPlaybackRate)
    ? (parsed as TimelineTransportPlaybackRate)
    : fallback
}

export function clampTimelineTransportZoomIndex(index: number): number {
  if (!Number.isFinite(index)) return 0
  return Math.min(TIMELINE_TRANSPORT_ZOOM_LEVELS.length - 1, Math.max(0, Math.round(index)))
}

export function resolveTimelineTransportZoom(index: number): TimelineTransportZoomLevel {
  return TIMELINE_TRANSPORT_ZOOM_LEVELS[clampTimelineTransportZoomIndex(index)] || 1
}

export function resolveTimelineTransportGestureZoomStepCount(delta: number): number {
  const steps = Math.floor(Math.abs(Number.isFinite(delta) ? delta : 0) / TIMELINE_TRANSPORT_GESTURE_ZOOM_DELTA)
  return Math.min(TIMELINE_TRANSPORT_GESTURE_MAX_STEPS, Math.max(1, steps))
}

export function resolveTimelineTransportNextZoomIndex(index: number, direction: -1 | 1, stepCount = 1): number {
  const steps = Number.isFinite(stepCount) ? Math.max(1, Math.round(stepCount)) : 1
  return clampTimelineTransportZoomIndex(clampTimelineTransportZoomIndex(index) + direction * steps)
}

export function resolveTimelineTransportPlayheadPercent(position: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 0
  return (clampTimelineTransportValue(position, 0, max) / max) * 100
}

export function resolveTimelineTransportPlayheadScrollLeft(args: {
  contentWidth: number
  max: number
  position: number
  viewportWidth: number
}): number {
  const contentWidth = Number.isFinite(args.contentWidth) && args.contentWidth > 0 ? args.contentWidth : 0
  const viewportWidth = Number.isFinite(args.viewportWidth) && args.viewportWidth > 0 ? args.viewportWidth : 0
  if (contentWidth <= 0 || viewportWidth <= 0 || args.max <= 0) return 0
  const playheadX = (resolveTimelineTransportPlayheadPercent(args.position, args.max) / 100) * contentWidth
  return clampTimelineTransportValue(playheadX - viewportWidth / 2, 0, Math.max(0, contentWidth - viewportWidth))
}

export function resolveTimelineTransportUnitsPerMs(args: {
  usesAbsoluteTiming: boolean
  ordinalUnitMs: number
}): number {
  if (args.usesAbsoluteTiming) return 1
  const safeUnitMs = Number.isFinite(args.ordinalUnitMs) && args.ordinalUnitMs > 0 ? args.ordinalUnitMs : 1000
  return 1 / safeUnitMs
}

export function splitTimelineTransportCurrentTotalLabel(label: string): {
  currentLabel: string
  totalLabel?: string
} {
  const normalizedLabel = String(label || '').trim()
  if (!normalizedLabel) return { currentLabel: '' }
  const parts = normalizedLabel.split(/\s*[|/]\s*/).map(part => part.trim()).filter(Boolean)
  if (parts.length !== 2) return { currentLabel: normalizedLabel }
  return {
    currentLabel: parts[0] || normalizedLabel,
    totalLabel: parts[1],
  }
}

