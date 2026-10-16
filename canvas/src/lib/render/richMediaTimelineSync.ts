import type { GraphData } from '@/lib/graph/types'
import { readNodeProperties } from '@/lib/graph/nodeProperties'
import { readNodeFieldString } from '@/lib/canvas/graph-elements/mediaSpecNodeFields'
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
  sourcePlaybackGap?: boolean
  frameSampleUrl?: string
  targetOverlayId?: string
  targetSourceUrl?: string
  targetRequestId?: number
}

export type RichMediaTimelineTargetRequest = {
  documentKey: string; overlayId: string; sourceUrl: string
  sourceTimestampMs: number; position: number; frameSampleUrl: string
}
export type RichMediaTimelineTargetScope = {
  documentKey: string; overlayId: string; sourceUrl: string
  playing: boolean; position: number; playbackRate: number
}

/** A local paused pin; it never enters the shared frame or BroadcastChannel. */
export function createRichMediaTimelineTargetController() {
  let pin: (RichMediaTimelineTargetRequest & { requestId: number }) | null = null
  let generation = 0
  const listeners = new Set<() => void>()
  const clear = (documentKey?: string) => { if (!documentKey || pin?.documentKey === documentKey) pin = null }
  return {
    request(request: RichMediaTimelineTargetRequest): number | null {
      const next = { ...request, documentKey: request.documentKey.trim(), overlayId: request.overlayId.trim(), sourceUrl: request.sourceUrl.trim(), frameSampleUrl: request.frameSampleUrl.trim() }
      if (!next.documentKey || !next.overlayId || !next.sourceUrl || !next.frameSampleUrl
        || !Number.isFinite(next.sourceTimestampMs) || next.sourceTimestampMs < 0
        || !Number.isFinite(next.position) || next.position < 0) return null
      pin = { ...next, requestId: ++generation }
      for (const listener of [...listeners]) listener()
      return generation
    },
    clear,
    observeTransportScope(scope: Pick<RichMediaTimelineTargetScope, 'documentKey' | 'playing' | 'position'>) {
      if (pin && (pin.documentKey !== scope.documentKey.trim() || scope.playing || pin.position !== scope.position)) clear(pin.documentKey)
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    resolve(scope: RichMediaTimelineTargetScope): RichMediaTimelineTransportFrame | null {
      if (!pin) return null
      if (pin.overlayId !== scope.overlayId) return null
      if (scope.playing || pin.documentKey !== scope.documentKey || pin.position !== scope.position) { clear(); return null }
      if (pin.sourceUrl !== scope.sourceUrl) { clear(); return null }
      return {
        type: RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_MESSAGE, documentKey: pin.documentKey,
        position: pin.position, timeMs: pin.sourceTimestampMs, playing: false,
        playbackRate: scope.playbackRate, sourcePlayback: false, frameSampleUrl: pin.frameSampleUrl,
        targetOverlayId: pin.overlayId, targetSourceUrl: pin.sourceUrl, targetRequestId: pin.requestId,
      }
    },
  }
}
const richMediaTimelineTargetController = createRichMediaTimelineTargetController()
export const requestRichMediaTimelineTargetFrame = richMediaTimelineTargetController.request
export const clearRichMediaTimelineTargetFrame = richMediaTimelineTargetController.clear
export const observeRichMediaTimelineTargetScope = richMediaTimelineTargetController.observeTransportScope
export const subscribeRichMediaTimelineTargetFrame = richMediaTimelineTargetController.subscribe
export const resolveRichMediaTimelineTargetFrame = richMediaTimelineTargetController.resolve

/** Exact source ownership from the current typed node, or its projected frame URL. */
export function resolveRichMediaTimelineTargetSourceUrl(args: { graphData?: GraphData | null; overlayId: string; srcDoc: string }): string {
  const node = args.graphData?.nodes.find(entry => String(entry.id) === args.overlayId)
  if (node) {
    const properties = readNodeProperties(node)
    if (readNodeFieldString(node, properties, 'kind') === 'video-agent-frame-analysis') return readNodeFieldString(node, properties, 'sourceUrl')
  }
  if (!args.srcDoc.includes('data-kg-video-agent-frame-analysis=')) return ''
  const match = /([^"'\s>]*\/__video_frame\?[^"'\s>]*)/i.exec(args.srcDoc)
  try { return match ? new URL(match[1].replace(/&amp;/g, '&'), 'http://localhost').searchParams.get('url') || '' : '' } catch { return '' }
}

/** Local-only boundary control; never stored or sent across BroadcastChannel. */
export type RichMediaTimelineClockAcknowledgement = {
  signal: AbortSignal
  hold: (ready: Promise<void>) => boolean
}
export type RichMediaTimelineLocalFrame = RichMediaTimelineTransportFrame & {
  clockStart?: RichMediaTimelineClockAcknowledgement
  clockEnd?: RichMediaTimelineClockAcknowledgement
}

export function publishRichMediaTimelineClockAcknowledgement(
  payload: RichMediaTimelineTransportFrame, signal: AbortSignal, phase: 'start' | 'end',
): Promise<void> | void {
  let ready: Promise<void> | undefined
  let accepting = true
  publishRichMediaTimelineTransportFrame(payload, { phase, control: {
    signal,
    hold: promise => {
      if (!accepting || ready || signal.aborted) return false
      ready = promise
      return true
    },
  } })
  accepting = false
  if (!ready) return
  return new Promise<void>((resolve, reject) => {
    const finish = (ok: boolean, error?: unknown) => {
      clearTimeout(timer); signal.removeEventListener('abort', aborted)
      if (ok) resolve(); else reject(error)
    }
    const aborted = () => finish(false, new DOMException(`Timeline ${phase} cancelled.`, 'AbortError'))
    const timer = setTimeout(() => finish(false, new Error(`Timeline ${phase} acknowledgement timed out.`)), 5_000)
    signal.addEventListener('abort', aborted, { once: true })
    void ready!.then(() => finish(true), error => finish(false, error))
    if (signal.aborted) aborted()
  })
}

export function publishRichMediaTimelineClockStart(payload: RichMediaTimelineTransportFrame, signal: AbortSignal): Promise<void> | void {
  return publishRichMediaTimelineClockAcknowledgement(payload, signal, 'start')
}

const cleanTimelineTransportKey = (value: unknown): string => String(value || '').trim()

/** Gantt followers replay their clock owner's calibrated frame; they do not infer its units. */
export function resolvePublishedRichMediaTimelineTransportFrame(frame: unknown, scope: {
  documentKey: string; transportDocumentKey: string; position: number; playing: boolean; playbackRate: number
}): RichMediaTimelineTransportFrame | null {
  if (!frame || typeof frame !== 'object') return null
  const value = frame as Partial<RichMediaTimelineTransportFrame>
  const documentKey = cleanTimelineTransportKey(scope.documentKey)
  const transportKey = cleanTimelineTransportKey(scope.transportDocumentKey)
  if (!documentKey || transportKey && transportKey !== documentKey
    || value.type !== RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_MESSAGE || value.documentKey !== documentKey
    || value.targetOverlayId || value.sourcePlayback !== false
    || !Number.isFinite(scope.position) || scope.position < 0 || value.position !== scope.position
    || value.playing !== scope.playing || value.playbackRate !== scope.playbackRate
    || !Number.isFinite(scope.playbackRate) || scope.playbackRate <= 0
    || typeof value.timeMs !== 'number' || !Number.isFinite(value.timeMs) || value.timeMs < 0) return null
  return { type: RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_MESSAGE, documentKey,
    position: scope.position, playing: scope.playing, playbackRate: scope.playbackRate,
    timeMs: value.timeMs, sourcePlayback: false }
}

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
    frameSampleUrl?: unknown
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
    ...(typeof args.override?.frameSampleUrl === 'string' && args.override.frameSampleUrl.trim()
      ? { frameSampleUrl: args.override.frameSampleUrl.trim() } : {}),
  }
}

export function publishRichMediaTimelineTransportFrame(payload: RichMediaTimelineTransportFrame, acknowledgement?: {
  phase: 'start' | 'end'; control: RichMediaTimelineClockAcknowledgement
}): void {
  if (typeof window === 'undefined') return
  if (payload.targetOverlayId) return
  try {
    ;(window as unknown as Record<string, unknown>)[RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY] = payload
    window.dispatchEvent(new CustomEvent(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, { detail: acknowledgement
      ? { ...payload, [acknowledgement.phase === 'start' ? 'clockStart' : 'clockEnd']: acknowledgement.control } : payload }))
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

/** Unsupported native rates stay on the shared clock's seek path, never a clamped second clock. */
const rejectedMediaRates = new WeakMap<HTMLMediaElement, number>()
export function isRichMediaTimelineRateSeekOnly(media: HTMLMediaElement): boolean {
  return rejectedMediaRates.has(media)
}
export function applyRichMediaTimelinePlaybackRate(media: HTMLMediaElement, rate: number): boolean {
  if (rejectedMediaRates.get(media) === rate) return false
  try {
    if (media.playbackRate !== rate) media.playbackRate = rate
    if (media.playbackRate === rate) {
      rejectedMediaRates.delete(media)
      media.removeAttribute('data-kg-timeline-rate-fallback')
      return true
    }
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'NotSupportedError') throw error
  }
  rejectedMediaRates.set(media, rate)
  media.setAttribute('data-kg-timeline-rate-fallback', 'seek')
  if (!media.paused) media.pause()
  return false
}
