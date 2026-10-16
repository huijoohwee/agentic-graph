import fs from 'node:fs'
import path from 'node:path'
import {
  TIMELINE_TRANSPORT_AUTOMATION_INTENTS,
  TIMELINE_TRANSPORT_ZOOM_LEVELS,
  resolveTimelineTransportNextZoomIndex,
  resolveTimelineTransportPlayheadPercent,
  resolveTimelineTransportPlayheadScrollLeft,
  resolveTimelineTransportZoom,
} from '@/components/timeline/timelineTransport'

const readUtf8 = (relativePath: string): string => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

export function testTimelineTransportRateSelectUsesSharedResponsiveCssOwner() {
  const transportText = readUtf8('src/components/timeline/TimelineTransportControls.tsx')
  const cssText = ['TimelineTransportControls.css', 'TimelineTransportPlayer.css', 'TimelineTransportControlsMermaidGantt.css'].map(file => readUtf8(`src/components/timeline/${file}`)).join('\n')

  if (!transportText.includes('timeline-rate-button') || transportText.includes('<select')) {
    throw new Error('expected timeline transport rate control to use the shared compact button owner without hidden select options')
  }
  if (!cssText.includes('.timeline-rate-button') || !cssText.includes('.timeline-rate-button-value')) {
    throw new Error('expected timeline rate button width and value styling to live in the timeline transport CSS owner')
  }
  if (!cssText.includes('min-width: 44px') || !cssText.includes('font-variant-numeric: tabular-nums')) {
    throw new Error('expected timeline rate button to stay stable on narrow viewports')
  }
  for (const snippet of [
    'export function TimelineTransportChrome',
    'const nextPlaybackRate = React.useMemo(() =>',
    'totalLabel?: string',
    'timeline-timecode-current',
    'timeline-timecode-divider',
    'timeline-timecode-total',
    'timeline-transport-chrome',
    'timeline-transport-ruler',
    'timeline-transport-ruler-tick',
    'timeline-player-range-rail',
    'timeline-video-sequence-tool-strip',
    'timeline-video-sequence-lane-sidebar',
    'timeline-transport-ruler--video-sequence',
    'data-kg-video-sequence-tool',
    '--kg-timeline-progress',
  ]) {
    if (!transportText.includes(snippet) && !cssText.includes(snippet)) {
      throw new Error(`expected timeline transport to retain shared responsive shell snippet: ${snippet}`)
    }
  }
  for (const snippet of [
    '.timeline-transport-chrome--mermaid-gantt',
    'var(--kg-panel-bg-hover) 12px',
    'background: var(--kg-panel-bg)',
    'var(--kg-canvas-accent)',
    '.timeline-transport-track-clip--lane-mask',
    '.timeline-transport-track-clip--lane-grade',
    '--kg-main-toolbar-height: var(--kg-toolbar-compact-surface-height)',
    '--kg-timeline-toolbar-button-size: var(--kg-control-height)',
    '--kg-timeline-bar-height: var(--kg-main-toolbar-height)',
    '.timeline-transport-track-clip--milestone .timeline-transport-track-handle',
    'opacity: 0;',
  ]) {
    if (!cssText.includes(snippet)) {
      throw new Error(`expected BottomPanel Gantt transport to retain canvas-aligned Mermaid visual snippet: ${snippet}`)
    }
  }
  if (transportText.includes('style={{ width: 90 }}')) {
    throw new Error('expected timeline transport component to avoid local fixed rate-select width literals')
  }
  if (cssText.includes('.timeline-video-sequence-empty-dropzone')) {
    throw new Error('expected BottomPanel Timeline empty state to reuse the shared transport shell instead of old dropzone CSS')
  }
  if (
    cssText.includes('rgb(130 130 226 / 0.88)') ||
    cssText.includes('rgb(59 130 246 / 0.88)') ||
    cssText.includes('rgb(214 211 255 / 0.42)') ||
    cssText.includes('.timeline-transport-track-handle::after')
  ) {
    throw new Error('expected shared transport timeline bars to avoid legacy solid fills and visible resize handles')
  }
  const transportUtilsText = readUtf8('src/components/timeline/timelineTransport.ts')
  if (!transportUtilsText.includes('splitTimelineTransportCurrentTotalLabel')) {
    throw new Error('expected current/total label splitting to live in the shared timeline transport helper')
  }
  for (const snippet of [
    'TimelineDocumentTransportStateUpdate',
    'TIMELINE_TRANSPORT_ZOOM_LEVELS',
    'TIMELINE_TRANSPORT_AUTOMATION_INTENTS',
    'resolveTimelineTransportNextZoomIndex',
    'resolveTimelineTransportPlayheadPercent',
    'resolveTimelineTransportPlayheadScrollLeft',
    'useTimelineDocumentTransportController',
    'updateDocumentTransportState',
    'setTransportPlaybackPosition',
    'setTransportPlaying',
    'setTransportPlaybackRate',
  ]) {
    if (!transportUtilsText.includes(snippet)) {
      throw new Error(`expected timeline transport interaction helper to stay centralized: ${snippet}`)
    }
  }
  if (TIMELINE_TRANSPORT_ZOOM_LEVELS.join(',') !== '1,1.25,1.5,2,2.5,3,4,5,6') {
    throw new Error('expected shared transport zoom levels to remain stable')
  }
  if (!TIMELINE_TRANSPORT_AUTOMATION_INTENTS.includes('center-playhead')) {
    throw new Error('expected shared transport automation intents to include playhead centering')
  }
  if (resolveTimelineTransportZoom(99) !== 6 || resolveTimelineTransportNextZoomIndex(0, -1) !== 0) {
    throw new Error('expected shared transport zoom helpers to clamp safely')
  }
  if (resolveTimelineTransportPlayheadPercent(25, 100) !== 25) {
    throw new Error('expected shared transport playhead percent helper to normalize timeline positions')
  }
  if (resolveTimelineTransportPlayheadScrollLeft({
    contentWidth: 1000,
    max: 100,
    position: 50,
    viewportWidth: 200,
  }) !== 400) {
    throw new Error('expected shared transport playhead centering helper to resolve scrollLeft')
  }
}
