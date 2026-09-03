import type { GraphData } from '@/lib/graph/types'
import { buildMermaidGanttTimelineModel } from '@/lib/mermaid/mermaidGanttBarInteraction'
import {
  readFrontmatterMermaidDiagramCodes,
  resolveMermaidDiagramCode,
} from '@/lib/mermaid/mermaidDiagramCode'

export const RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_MESSAGE = 'agentic-graph:timeline-transport-frame'
export const RICH_MEDIA_TIMELINE_TRANSPORT_READY_MESSAGE = 'agentic-graph:timeline-transport-ready'
export const RICH_MEDIA_TIMELINE_TRANSPORT_BROADCAST_CHANNEL = 'agentic-graph:rich-media-timeline-transport'
export const RICH_MEDIA_TIMELINE_TRANSPORT_EVENT = 'agentic-graph:rich-media-timeline-transport-frame'
export const RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_ATTR = 'data-kg-timeline-transport-frame'
export const RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY = '__AGENTIC_OS_RICH_MEDIA_TIMELINE_TRANSPORT_FRAME__'
export const RICH_MEDIA_TIMELINE_TRANSPORT_MS_PER_UNIT = 1000

export type RichMediaTimelineTransportFrame = {
  type: typeof RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_MESSAGE
  documentKey: string
  position: number
  timeMs: number
  playing: boolean
  playbackRate: number
  sourcePlayback: boolean
}

const cleanTimelineTransportKey = (value: unknown): string => String(value || '').trim()

export function buildRichMediaTimelineTransportFrame(args: {
  localDocumentKey: string
  transportDocumentKey: string
  transportPlaybackRate: number
  transportPlaying: boolean
  transportPosition: number
  override?: {
    documentKey?: unknown
    playbackRate?: unknown
    playing?: unknown
    position?: unknown
    sourcePlayback?: unknown
    timeMs?: unknown
  }
}): RichMediaTimelineTransportFrame | null {
  const overrideDocumentKey = cleanTimelineTransportKey(args.override?.documentKey)
  const transportDocumentKey = cleanTimelineTransportKey(overrideDocumentKey || args.transportDocumentKey)
  const localDocumentKey = cleanTimelineTransportKey(args.localDocumentKey)
  const documentKey = localDocumentKey || transportDocumentKey
  if (!documentKey) return null
  if (localDocumentKey && transportDocumentKey && localDocumentKey !== transportDocumentKey) return null
  const positionSource = typeof args.override?.position === 'number'
    ? args.override.position
    : args.transportPosition
  const playbackRateSource = typeof args.override?.playbackRate === 'number'
    ? args.override.playbackRate
    : args.transportPlaybackRate
  const position = Number.isFinite(positionSource) ? Math.max(0, positionSource) : 0
  const timeMsSource = typeof args.override?.timeMs === 'number'
    ? args.override.timeMs
    : position * RICH_MEDIA_TIMELINE_TRANSPORT_MS_PER_UNIT
  const timeMs = Number.isFinite(timeMsSource) ? Math.max(0, timeMsSource) : 0
  const playbackRate = Number.isFinite(playbackRateSource) && playbackRateSource > 0
    ? playbackRateSource
    : 1
  return {
    type: RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_MESSAGE,
    documentKey,
    position,
    timeMs,
    playing: typeof args.override?.playing === 'boolean' ? args.override.playing : args.transportPlaying,
    playbackRate,
    sourcePlayback: args.override?.sourcePlayback !== false,
  }
}

export function publishRichMediaTimelineTransportFrame(payload: RichMediaTimelineTransportFrame): void {
  if (typeof window === 'undefined') return
  try {
    ;(window as unknown as Record<string, unknown>)[RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY] = payload
    window.dispatchEvent(new CustomEvent(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, { detail: payload }))
  } catch {
    void 0
  }
  try {
    if (typeof BroadcastChannel !== 'function') return
    const channel = new BroadcastChannel(RICH_MEDIA_TIMELINE_TRANSPORT_BROADCAST_CHANNEL)
    channel.postMessage(payload)
    channel.close()
  } catch {
    void 0
  }
}

export function resolveRichMediaTimelineDurationUnits(graphData: GraphData | null | undefined): number {
  if (!graphData) return 0
  const ganttCode = resolveMermaidDiagramCode(
    readFrontmatterMermaidDiagramCodes(graphData, 'gantt'),
    'gantt',
  )
  if (!ganttCode) return 0
  return buildMermaidGanttTimelineModel(ganttCode).durationMinutes
}

export function resolveRichMediaTimelineMediaTargetSeconds(args: {
  mediaDurationSeconds: number
  positionUnits: number
  timelineDurationUnits: number
  unitMs?: number
}): number {
  const unitMs = Number.isFinite(args.unitMs) && Number(args.unitMs) > 0
    ? Number(args.unitMs)
    : RICH_MEDIA_TIMELINE_TRANSPORT_MS_PER_UNIT
  const positionUnits = Number.isFinite(args.positionUnits) ? Math.max(0, args.positionUnits) : 0
  const timelineDurationUnits = Number.isFinite(args.timelineDurationUnits) ? Math.max(0, args.timelineDurationUnits) : 0
  const timelineDurationSeconds = timelineDurationUnits * (unitMs / 1000)
  const positionSeconds = positionUnits * (unitMs / 1000)
  const mediaDurationSeconds = Number.isFinite(args.mediaDurationSeconds) && args.mediaDurationSeconds > 0
    ? args.mediaDurationSeconds
    : 0
  if (timelineDurationSeconds > 0 && mediaDurationSeconds > timelineDurationSeconds + 0.5) {
    return (Math.min(positionUnits, timelineDurationUnits) / timelineDurationUnits) * mediaDurationSeconds
  }
  return positionSeconds
}
