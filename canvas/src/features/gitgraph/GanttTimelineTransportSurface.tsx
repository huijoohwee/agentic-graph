import React from 'react'
import { GanttTimelineTransportAudioPlaybackBridge } from './GanttTimelineTransportAudioPlaybackBridge'
import { GanttTimelineTransportShell } from './GanttTimelineTransportShell'
import type { GanttTimelineTransportSurfaceModel } from './useGanttTimelineTransportSurfaceModel'
import type { VideoSequenceTimelineClipOverlayRenderer, VideoSequenceTimelineInsertedLane } from '@/components/timeline/VideoSequenceTimelineRuler'

export type GanttTimelineTransportSurfaceProps = {
  model: GanttTimelineTransportSurfaceModel
  renderClipOverlay?: VideoSequenceTimelineClipOverlayRenderer
  supplementalLanes?: React.ReactNode
  timeAxisControls?: React.ReactNode
  timeRulerOverlay?: React.ReactNode
  timelineInsertedLanes?: readonly VideoSequenceTimelineInsertedLane[]
}

export function GanttTimelineTransportSurface(args: GanttTimelineTransportSurfaceProps) {
  return (
    <>
      <GanttTimelineTransportShell
        chromeModel={args.model.chromeModel}
        mediaPlayerModel={args.model.mediaPlayerModel}
        renderClipOverlay={args.renderClipOverlay}
        rulerModel={args.model.rulerModel}
        shellModel={args.model.shellModel}
        supplementalLanes={args.supplementalLanes}
        timeAxisControls={args.timeAxisControls}
        timeRulerOverlay={args.timeRulerOverlay}
        timelineInsertedLanes={args.timelineInsertedLanes}
      />
      <GanttTimelineTransportAudioPlaybackBridge model={args.model.audioPlaybackBridgeModel} />
    </>
  )
}
