import { useGanttTimelineTransportPlaybackModel } from './useGanttTimelineTransportPlaybackModel'
import { useGanttTimelineTransportSession } from './useGanttTimelineTransportSession'
import { useMermaidGanttDocument } from './useMermaidGanttDocument'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useSourceGeospatialTimeline } from '@/features/evidence-analysis/geospatialSource'

export function GanttTimelineTransportPlaybackRuntime({
  active = true,
}: {
  active?: boolean
}) {
  const sourceTimeline = useSourceGeospatialTimeline()
  const sourceTimelineOwnsClock = useGraphStore(state => Boolean(sourceTimeline && state.timelineTransportDocumentKey === sourceTimeline.documentKey))
  const { code } = useMermaidGanttDocument({ purpose: 'media' })
  const xrBottomTimelineOwnsClock = useGraphStore(state => state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr')
  if (!active || xrBottomTimelineOwnsClock || sourceTimelineOwnsClock || !code) return null
  return <GanttTimelineTransportPlaybackRuntimeController code={code} />
}

function GanttTimelineTransportPlaybackRuntimeController({
  code,
}: {
  code: string
}) {
  const transportSession = useGanttTimelineTransportSession({ code, mode: 'media' })
  useGanttTimelineTransportPlaybackModel({
    clockActive: true,
    disabled: transportSession.disabled,
    documentKey: transportSession.documentKey,
    maxMinutes: transportSession.maxMinutes,
    onPositionChange: transportSession.setTransportPlaybackPosition,
    playbackRate: transportSession.playbackRate,
    playbackUnitsPerMs: transportSession.playbackUnitsPerMs,
    playing: transportSession.playing,
    positionMinutes: transportSession.positionMinutes,
    setTransportPlaying: transportSession.setTransportPlaying,
  })
  return null
}
