import { useGraphStore } from '@/hooks/useGraphStore'
import { readSourceGeospatialState, setSourceGeospatialTime, subscribeSourceGeospatial } from './geospatialSource'

type Timeline = { documentKey: string; startUtc: string; durationSeconds: number }
type SourceState = { timeline: Timeline | null; atUtc: string; snapshot: unknown; loading?: boolean }
type Transport = { timelineTransportDocumentKey: string; timelineTransportPosition: number; setTimelineTransportState: (next: { documentKey?: string; position?: number; playing?: boolean }) => void }
type Dependencies = { readSource: () => SourceState; readTransport: () => Transport; subscribe: (listener: () => void) => () => void; subscribeSource?: (listener: () => void) => () => void; setTime: (atUtc: string) => Promise<void> }
const positionAt = (timeline: Timeline, utc: string) => Math.max(0, Math.min(timeline.durationSeconds, (Date.parse(utc) - Date.parse(timeline.startUtc)) / 1000)) / 60

/** The existing Timeline is the only clock. This adapter projects its cursor into source UTC. */
export function bindSourceTimeline(timeline: Timeline, deps: Dependencies) {
  const current = () => deps.readSource().timeline === timeline && Boolean(deps.readSource().snapshot)
  const owns = () => current() && !deps.readSource().loading
  if (!current()) return () => {}
  const initial = deps.readSource().atUtc
  deps.readTransport().setTimelineTransportState({ documentKey: timeline.documentKey, position: positionAt(timeline, initial), playing: false })
  let lastUtc = initial, alive = true
  const update = () => {
    if (!alive || !owns()) return
    const transport = deps.readTransport()
    if (transport.timelineTransportDocumentKey !== timeline.documentKey || !Number.isFinite(transport.timelineTransportPosition)) return
    const offset = Math.max(0, Math.min(timeline.durationSeconds * 1000, Math.round(transport.timelineTransportPosition * 60000)))
    const atUtc = new Date(Date.parse(timeline.startUtc) + offset).toISOString()
    if (atUtc !== lastUtc) { lastUtc = atUtc; void deps.setTime(atUtc) }
  }
  const unsubscribe = deps.subscribe(update), unsubscribeSource = deps.subscribeSource?.(update)
  update()
  return () => {
    alive = false; unsubscribe(); unsubscribeSource?.()
    const transport = deps.readTransport()
    if (transport.timelineTransportDocumentKey === timeline.documentKey) transport.setTimelineTransportState({ playing: false })
  }
}

export const connectSourceTimeline = (timeline: Timeline) => bindSourceTimeline(timeline, {
  readSource: readSourceGeospatialState, readTransport: useGraphStore.getState,
  subscribe: listener => useGraphStore.subscribe(listener), subscribeSource: subscribeSourceGeospatial, setTime: setSourceGeospatialTime,
})

export function seekSourceTimeline(atUtc: string) {
  const source = readSourceGeospatialState(), timeline = source.timeline
  if (!timeline || !source.snapshot) throw new Error('Open an accepted source Timeline first.')
  const ms = Date.parse(atUtc)
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== atUtc || ms < Date.parse(timeline.startUtc) || ms > Date.parse(timeline.endUtc)) throw new Error('Use canonical UTC within the authored Timeline window.')
  useGraphStore.getState().setTimelineTransportState({ documentKey: timeline.documentKey, position: positionAt(timeline, atUtc), playing: false })
}
