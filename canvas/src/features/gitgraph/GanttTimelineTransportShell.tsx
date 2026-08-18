import React from 'react'
import { TimelineTransportChrome } from '@/components/timeline/TimelineTransportControls'
import { type GanttTimelineTransportChromeModel } from './useGanttTimelineTransportChromeModel'
import { type GanttTimelineTransportRulerModel } from './useGanttTimelineTransportRulerModel'
import { type GanttTimelineTransportShellModel } from './useGanttTimelineTransportShellModel'
import { GanttTimelineTransportContextControls } from './GanttTimelineTransportContextControls'
import { GanttTimelineTransportHeaderTools } from './GanttTimelineTransportHeaderTools'
import { GanttTimelineTransportMediaPlayer, type GanttTimelineTransportMediaPlayerModel } from './GanttTimelineTransportMediaPlayer'
import { GanttTimelineTransportRuler } from './GanttTimelineTransportRuler'
import type { VideoSequenceTimelineClipOverlayRenderer, VideoSequenceTimelineInsertedLane } from '@/components/timeline/VideoSequenceTimelineRuler'

export type GanttTimelineTransportShellProps = {
  chromeModel: GanttTimelineTransportChromeModel
  mediaPlayerModel: GanttTimelineTransportMediaPlayerModel
  renderClipOverlay?: VideoSequenceTimelineClipOverlayRenderer
  rulerModel: GanttTimelineTransportRulerModel
  shellModel: GanttTimelineTransportShellModel
  supplementalLanes?: React.ReactNode
  timeAxisControls?: React.ReactNode
  timeRulerOverlay?: React.ReactNode
  timelineInsertedLanes?: readonly VideoSequenceTimelineInsertedLane[]
}

export function GanttTimelineTransportShell(args: GanttTimelineTransportShellProps) {
  const contextDetailsLabel = `Timeline context: ${args.rulerModel.chrome.subtitleLabel}. ${args.chromeModel.contextControls.clipEdit.detailsLabel}`
  const contextControls = <GanttTimelineTransportContextControls model={args.chromeModel.contextControls} />

  return (
    <TimelineTransportChrome
      ariaLabel={args.shellModel.ariaLabel}
      chromeClassName={args.shellModel.chromeClassName}
      contextDetailsLabel={contextDetailsLabel}
      contextLabel={args.rulerModel.chrome.subtitleLabel}
      currentLabel={args.shellModel.currentLabel}
      contextControls={contextControls}
      disabled={args.shellModel.disabled}
      max={args.shellModel.max}
      min={args.shellModel.min}
      playbackRate={args.shellModel.playbackRate}
      playing={args.shellModel.playing}
      shellClassName={args.shellModel.shellClassName}
      rootProps={args.shellModel.rootProps}
      headerAside={<GanttTimelineTransportHeaderTools model={args.chromeModel.headerTools} />}
      mediaPlayer={args.mediaPlayerModel.active ? <GanttTimelineTransportMediaPlayer model={args.mediaPlayerModel} /> : null}
      ruler={<GanttTimelineTransportRuler model={args.rulerModel.ruler} renderClipOverlay={args.renderClipOverlay} timeAxisControls={args.timeAxisControls} timeRulerOverlay={args.timeRulerOverlay} timelineInsertedLanes={args.timelineInsertedLanes} />}
      rulerClassName={args.rulerModel.chrome.rulerClassName}
      rulerProps={args.rulerModel.chrome.rulerProps}
      supplementalLanes={args.supplementalLanes}
      step={args.shellModel.step}
      showInlineProgress={args.shellModel.showInlineProgress}
      showRange={args.shellModel.showRange}
      totalLabel={args.rulerModel.chrome.totalLabel}
      value={args.rulerModel.chrome.value}
      onPlaybackRateChange={args.shellModel.onPlaybackRateChange}
      onTogglePlayback={args.shellModel.onTogglePlayback}
      onValueChange={args.shellModel.onValueChange}
    />
  )
}
