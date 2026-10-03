import { readFileSync } from 'node:fs'
import { testTimelinePlayhead } from './timelinePlayhead.test'
import { resolve } from 'node:path'
import { buildVideoSequenceTimelineZoomTicks, resolveVideoSequenceTimelineAppendSpacePercent, resolveVideoSequenceTimelineContentZoom, resolveVideoSequenceTimelineFrameRate, resolveVideoSequenceTimelineScaleDurationSeconds, resolveVideoSequenceTimelineScaleMaxMinutes, resolveVideoSequenceTimelineWorkspaceLayout, resolveVideoSequenceTimelineZoomTickStepSeconds } from '@/components/timeline/videoSequenceTimelineZoom'
import { resolveTimelineTransportGestureZoomStepCount, resolveTimelineTransportNextZoomIndex, resolveTimelineTransportZoom } from '@/components/timeline/timelineTransport'
const root = process.cwd()
function readSource(...parts: string[]): string {
  return readFileSync(resolve(root, 'src', ...parts), 'utf8')
}
function expectSourceIncludes(sourceText: string, tokens: readonly string[], message: string): void {
  for (const token of tokens) if (!sourceText.includes(token)) throw new Error(`${message}: ${token}`)
}
export function testVideoSequenceTimelineEditorEnhancementContracts() {
  testTimelinePlayhead()
  const rulerText = readSource('components', 'timeline', 'VideoSequenceTimelineRuler.tsx')
  const rulerCssText = readSource('components', 'timeline', 'VideoSequenceTimelineRuler.css')
  const rulerTicksText = readSource('components', 'timeline', 'VideoSequenceTimelineRulerTicks.tsx')
  const rulerTimeAxisCssText = readSource('components', 'timeline', 'VideoSequenceTimelineRulerTimeAxis.css')
  const rulerZoomText = readSource('components', 'timeline', 'videoSequenceTimelineZoom.ts')
  const clipThumbnailStripText = readSource('components', 'timeline', 'VideoSequenceClipThumbnailStrip.tsx')
  const clipMetaText = readSource('components', 'timeline', 'VideoSequenceTimelineClipMeta.tsx')
  const clipMetaCssText = readSource('components', 'timeline', 'VideoSequenceTimelineClipMeta.css')
  const denseFbfCssText = readSource('components', 'timeline', 'VideoSequenceTimelineDenseFbf.css')
  const rulerGeometryText = readSource('components', 'timeline', 'videoSequenceTimelineRulerGeometry.ts')
  const mermaidTransportCssText = readSource('components', 'timeline', 'TimelineTransportControlsMermaidGantt.css')
  const laneCssText = readSource('components', 'timeline', 'TimelineTransportLane.css')
  const transportCssText = ['TimelineTransportControls.css', 'TimelinePlayhead.css', 'TimelineTransportPlayer.css', 'TimelineTransportControlsMermaidGantt.css', 'TimelineTransportLane.css'].map(file => readSource('components', 'timeline', file)).join('\n')
  const timelineTransportText = readSource('components', 'timeline', 'timelineTransport.ts')
  const videoSequenceToolButtonText = readSource('components', 'timeline', 'VideoSequenceTimelineToolButton.tsx')
  const transportText = readSource('components', 'timeline', 'TimelineTransportControls.tsx')
  const transportHeaderToolsText = readSource('features', 'gitgraph', 'GanttTimelineTransportHeaderTools.tsx')
  const transportChromeModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportChromeModel.ts')
  const transportInteractionsText = readSource('features', 'gitgraph', 'useGanttTimelineInteractions.ts')
  const transportInteractionModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportInteractionModel.ts')
  const transportRulerModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportRulerModel.ts')
  const transportSurfaceModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportSurfaceModel.ts')
  const transportViewText = readSource('features', 'gitgraph', 'useGanttTimelineTransportView.ts')
  const contextControlsText = readSource('features', 'gitgraph', 'GanttTimelineTransportContextControls.tsx')
  const contextCssText = readSource('features', 'gitgraph', 'GanttTimelineTransportClipContext.css')
  const mediaPlayerText = readSource('features', 'gitgraph', 'GanttTimelineTransportMediaPlayer.tsx')
  const shellText = readSource('features', 'gitgraph', 'GanttTimelineTransportShell.tsx')
  const editRailCssText = `${laneCssText}\n${denseFbfCssText}\n${rulerCssText}`
  if (!transportText.includes("import './TimelineTransportLane.css'") || [denseFbfCssText, mermaidTransportCssText].some(css => css.includes('.timeline-transport-time-axis-bar'))) throw new Error('expected one shared transport lane/bar style owner')
  expectSourceIncludes(rulerText, [
    'data-kg-video-sequence-active-track', 'data-kg-video-sequence-drag-mode={dragging ? draggingMode',
    'data-kg-compact-source-placeholder={compactSourcePlaceholder ?',
    'data-kg-video-sequence-source-window',
    'VideoSequenceTimelineClipMeta',
    'VideoSequenceTimelineRulerTicks',
    'resolveVideoSequenceRulerInsetLeft',
    'resolveVideoSequenceRulerInsetWidth',
    'buildVideoSequenceTimelineZoomTicks({ displayTicks, frameRate: mediaFrameRate, maxMinutes: timelineScaleMaxMinutes, mediaDurationSeconds, timelineZoom })',
    'resolveVideoSequenceTimelineScaleMaxMinutes({ maxMinutes, mediaDurationSeconds })',
    'resolveVideoSequenceTimelineAppendSpacePercent(timelineZoom)',
    'resolveVideoSequenceTimelineContentZoom({ frameRate: mediaFrameRate, mediaDurationSeconds, timelineZoom })',
    'resolveVideoSequenceTimelineWorkspaceLayout({ appendSpacePercent, timelineContentZoom })', 'width: `${workspaceLayout.workspaceWidthPercent}%`', 'flexBasis: `${workspaceLayout.viewportFlexPercent}%`',
    'sourceThumbnailSet?.sourceUrl',
    'compactSourceMedia && !sourceThumbnailSet ? []',
    'compactSourcePlaceholder ? null :',
    '(compactSourceImage || compactSourceVideo)',
    'data-kg-video-sequence-content-zoom',
    'timeline-video-sequence-editor timeline-video-sequence-grid',
    'timeline-video-sequence-ruler-scroll timeline-video-sequence-ruler-surface',
    'timeline-video-sequence-ruler-scroll-content',
    'timeline-video-sequence-ruler-viewport',
    'ref={viewportRef}',
    'timeline-video-sequence-ruler-axis',
    'data-kg-video-sequence-ruler-axis="1"',
    'data-kg-video-sequence-ruler-body="1"',
    'data-kg-video-sequence-ruler-playhead="1"',
    'data-kg-video-sequence-ruler-playhead-marker="1"',
    'timeline-video-sequence-ruler-playhead-marker',
    'aria-label="Timeline playhead marker"',
    'const bodyMinHeight = Math.max(1, minHeight - VIDEO_SEQUENCE_LANE_TOP_OFFSET_PX)',
    'timeline-video-sequence-ruler-append-space',
    'data-kg-video-sequence-append-space="1"',
    'resolveVideoSequenceSourceWindowLabel(thumbnailWindow)',
  ], 'expected enhanced ruler token')
  const forbiddenPlaceholderThumbnailSelector = [
    '[data-kg-compact-source-placeholder="1"]',
    '.timeline-video-sequence-clip-thumbnail-strip',
  ].join(' ')
  if (denseFbfCssText.includes(forbiddenPlaceholderThumbnailSelector)) {
    throw new Error('expected empty compact source placeholders to omit thumbnail strips instead of hiding them in CSS')
  }
  expectSourceIncludes(rulerGeometryText, [
    'VIDEO_SEQUENCE_RULER_AXIS_EDGE_INSET_PX = 14',
    'resolveVideoSequenceRulerInsetLeft',
    'resolveVideoSequenceRulerInsetWidth',
    '100% - ${VIDEO_SEQUENCE_RULER_AXIS_EDGE_INSET_PX * 2}px',
  ], 'expected ruler geometry token')
  for (const token of [
    'TimelineVideoSequenceEmptyState',
    'timeline-video-sequence-surface--empty',
    'timeline-video-sequence-empty-dropzone',
    '<span className="sr-only">{scope.label}</span>',
  ]) {
    if (rulerText.includes(token)) throw new Error(`expected empty Timeline to reuse shared transport instead of stale ruler token: ${token}`)
  }
  expectSourceIncludes(rulerTicksText, [
    'formatVideoSequenceTimeAxisLabel',
    "padStart(2, '0')",
    'resolveVideoSequenceTickMajor',
    'data-kg-video-sequence-major-tick',
    "/^\\d+f$/i",
    '<time className="timeline-transport-ruler-tick-label"',
    'dateTime={resolveVideoSequenceTickDateTime(tick)}',
    'aria-hidden="true"',
  ], 'expected semantic time-axis tick token');
  expectSourceIncludes(rulerTimeAxisCssText, [
    '.timeline-transport-ruler--video-sequence .timeline-transport-ruler-tick',
    'height: var(--kg-video-sequence-axis-height)',
    'justify-content: flex-start',
    'font-size: var(--kg-text-xs)',
    'font-variant-numeric: tabular-nums',
    '.timeline-transport-ruler--video-sequence .timeline-transport-ruler-tick-line',
    'height: 5px',
    ':not([data-kg-video-sequence-major-tick="1"])',
    'border-left-width: 2px',
    '.timeline-transport-ruler--video-sequence .timeline-transport-ruler-tick-label',
    '.timeline-transport-ruler--video-sequence .timeline-video-sequence-ruler-append-space',
    'border-top: 1px dashed',
  ], 'expected lean time-axis style')
  expectSourceIncludes(transportCssText, [
    '.timeline-video-sequence-grid',
    '--kg-video-sequence-lane-sidebar-width: 112px',
    'grid-template-columns: var(--kg-video-sequence-lane-sidebar-width, 112px) minmax(0, 1fr)',
    'repeat-x 0 var(--kg-video-sequence-axis-height, 24px) / 25% calc(100% - var(--kg-video-sequence-axis-height, 24px))',
    '.timeline-video-sequence-ruler-scroll',
    'overflow: auto',
    '-webkit-overflow-scrolling: touch',
    'overscroll-behavior: contain',
    '.timeline-video-sequence-ruler-scroll-content',
    'min-height: 100%',
    '.timeline-video-sequence-ruler-viewport',
    '.timeline-video-sequence-ruler-axis',
    'position: sticky',
    'top: 0',
    '.timeline-video-sequence-lane-sidebar-scroll',
    '--kg-video-sequence-sidebar-scroll-top',
    'transform: translateY(calc(var(--kg-video-sequence-sidebar-scroll-top, 0px) * -1))',
    '.timeline-video-sequence-ruler-content',
    'overflow: visible',
    'border-bottom: var(--kg-surface-border)',
    'cursor: ew-resize',
    'pointer-events: auto',
    'touch-action: none',
    'z-index: 20', 'top: 0', 'transform: translateX(-50%)', '.timeline-playhead-control.timeline-transport-playhead-marker',
    'padding-inline: 18px 12px',
    'border-bottom: var(--kg-surface-border)',
    'margin-top: 0',
    '.timeline-video-sequence-ruler-surface',
  ], 'expected shared empty/source timeline visual style')
  if (transportCssText.includes('.timeline-video-sequence-empty-dropzone')) {
    throw new Error('expected shared transport CSS to drop the old empty Timeline dropzone styling')
  }
  if (mermaidTransportCssText.includes('repeating-linear-gradient(90deg, transparent 0, transparent 39px')) {
    throw new Error('expected BottomPanel timeline body to avoid dense stacked vertical grid layers')
  }
  if (mermaidTransportCssText.includes('repeating-linear-gradient(180deg, transparent 0, transparent calc(var(--kg-video-sequence-lane-height')) {
    throw new Error('expected BottomPanel timeline lane rail to avoid stacked repeated lane separators')
  }
  expectSourceIncludes(rulerZoomText, [
    'VIDEO_SEQUENCE_TIMELINE_ZOOM_TICK_TARGET_PER_ZOOM',
    'VIDEO_SEQUENCE_TIMELINE_ZOOM_TICK_STEPS_SECONDS',
    'resolveVideoSequenceTimelineZoomTickStepSeconds',
    'buildVideoSequenceTimelineZoomTicks',
    'formatVideoSequenceTimelineSecondsOffset(seconds)',
    'resolveVideoSequenceTimelineScaleDurationSeconds',
    'resolveVideoSequenceTimelineScaleMaxMinutes',
    'resolveVideoSequenceTimelineAppendSpacePercent',
    'VIDEO_SEQUENCE_TIMELINE_APPEND_SPACE_MAX_PERCENT',
    'VIDEO_SEQUENCE_TIMELINE_FRAME_LABEL_ZOOM', 'VIDEO_SEQUENCE_TIMELINE_FRAME_TICK_STEP_FRAMES', 'VIDEO_SEQUENCE_TIMELINE_FRAME_LABEL_TARGETS_PER_SECOND',
    'VIDEO_SEQUENCE_TIMELINE_FRAME_LABEL_STEPS', 'resolveVideoSequenceTimelineFrameLabelStepFrames', 'VIDEO_SEQUENCE_TIMELINE_FRAME_RULER_MIN_LABEL_SPACING_PX',
    'VIDEO_SEQUENCE_TIMELINE_DEFAULT_FRAME_RATE', 'resolveVideoSequenceTimelineFrameRate', 'resolveVideoSequenceTimelineContentZoom', 'resolveVideoSequenceTimelineWorkspaceLayout',
    'formatVideoSequenceTimelineFrameLabel',
  ], 'expected shared zoom-axis helper token')
  if (resolveVideoSequenceTimelineZoomTickStepSeconds({ durationSeconds: resolveVideoSequenceTimelineScaleDurationSeconds(52), timelineZoom: 4 }) !== 2) {
    throw new Error('expected max zoom to expose two-second timeline ticks for sub-minute media')
  }
  const defaultTicks = buildVideoSequenceTimelineZoomTicks({ displayTicks: [], maxMinutes: 30, mediaDurationSeconds: 30, timelineZoom: 1 })
  if (defaultTicks.map(tick => tick.label).join(',') !== '0:00,0:10,0:20,0:30') {
    throw new Error(`expected default BottomPanel source timeline ticks to use ten-second major labels, got ${JSON.stringify(defaultTicks)}`)
  }
  const scaleMaxMinutes = resolveVideoSequenceTimelineScaleMaxMinutes({ maxMinutes: 52, mediaDurationSeconds: 52 })
  const zoomTicks = buildVideoSequenceTimelineZoomTicks({ displayTicks: [], maxMinutes: scaleMaxMinutes, mediaDurationSeconds: 52, timelineZoom: 4 })
  if (Math.abs(scaleMaxMinutes - 60) > 0.0001 || zoomTicks[1]?.label !== '0:02' || Math.abs((zoomTicks[1]?.percent || 0) - (2 / 60) * 100) > 0.0001 || zoomTicks[zoomTicks.length - 1]?.label !== '1:00') {
    throw new Error(`expected zoom ticks to use rounded 60-second scale, got ${JSON.stringify({ scaleMaxMinutes, ticks: zoomTicks.slice(0, 3), last: zoomTicks.at(-1) })}`)
  }
  if (resolveVideoSequenceTimelineAppendSpacePercent(1) !== 0 || resolveVideoSequenceTimelineAppendSpacePercent(4) <= 0) {
    throw new Error('expected right-side append workspace only when the timeline is zoomed in')
  }
  if (resolveVideoSequenceTimelineFrameRate(0) !== 24 || resolveVideoSequenceTimelineFrameRate(240) !== 120) {
    throw new Error('expected max-zoom frame ticks to use a bounded source frame-rate hint')
  }
  const referenceFrameLabels = buildVideoSequenceTimelineZoomTicks({ displayTicks: [], frameRate: 24, maxMinutes: 30, mediaDurationSeconds: 30, timelineZoom: 6 }).filter(tick => tick.label).slice(0, 8).map(tick => tick.label)
  if (referenceFrameLabels.join(',') !== '00:00,5f,10f,15f,20f,0:01,5f,10f') {
    throw new Error(`expected 24fps time-axis labels to use sparse frame anchors, got ${JSON.stringify(referenceFrameLabels)}`)
  }
  const frameTickRate = 30
  const expectedFrameLabels = ['00:00', '5f', '10f', '15f', '20f', '25f', '0:01']
  const maxZoomFrameTicks = buildVideoSequenceTimelineZoomTicks({ displayTicks: [], frameRate: frameTickRate, maxMinutes: 30, mediaDurationSeconds: 30, timelineZoom: 6 })
  if (maxZoomFrameTicks.filter(tick => tick.label).slice(0, expectedFrameLabels.length).map(tick => tick.label).join(',') !== expectedFrameLabels.join(',')) {
    throw new Error(`expected max-zoom BottomPanel source timeline labels to use bounded frame anchors, got ${JSON.stringify(maxZoomFrameTicks.slice(0, 80).map(tick => tick.label))}`)
  }
  if (maxZoomFrameTicks.some(tick => /^(2f|4f|6f|8f|12f|14f)$/i.test(tick.label))) {
    throw new Error(`expected max-zoom frame ticks to avoid dense low-value frame labels, got ${JSON.stringify(maxZoomFrameTicks.slice(0, 80).map(tick => tick.label))}`)
  }
  if (resolveVideoSequenceTimelineContentZoom({ frameRate: 30, mediaDurationSeconds: 30, timelineZoom: 6 }) !== 7) {
    throw new Error('expected bounded max-zoom frame labels to get one collision-safe content expansion')
  }
  const scrollWorkspaceLayout = resolveVideoSequenceTimelineWorkspaceLayout({ appendSpacePercent: 40, timelineContentZoom: 2 })
  if (scrollWorkspaceLayout.workspaceWidthPercent !== 240 || Math.abs(scrollWorkspaceLayout.viewportFlexPercent - 83.3333) > 0.01 || Math.abs(scrollWorkspaceLayout.appendFlexPercent - 16.6667) > 0.01) throw new Error(`expected zoomed BottomPanel source timeline to own real scrollable workspace width, got ${JSON.stringify(scrollWorkspaceLayout)}`)
  expectSourceIncludes(clipThumbnailStripText, [
    'aria-label={`${span.label} thumbnail ${formatVideoSequenceTimelineSecondsOffset(thumbnail.timestampSeconds)} ${thumbnail.format}/${thumbnail.rasterFormat}`}',
    'buildVideoSequenceThumbnailDragPayload',
    'beginMediaPointerDragPayload',
    'writeMediaDragPayload(event.dataTransfer, payload)',
    'finishMediaPointerDragPayloadForEvent(event.nativeEvent)',
    'data-kg-media-draggable="1"',
    'timeline-video-sequence-clip-thumbnail-drag-affordance',
    'data-kg-video-sequence-clip-thumbnail-drag-affordance="1"',
    'data-kg-video-sequence-clip-thumbnail-drag-kind="image"',
    'onMovePointerStart: (event: React.PointerEvent<HTMLElement>, span: MermaidGanttTimelineTaskSpan) => void', 'suppressPreview?: boolean',
    'const [activeThumbnailIndex, setActiveThumbnailIndex] = React.useState<number | null>(null)',
    'THUMBNAIL_MOVE_DRAG_THRESHOLD_PX',
    'moveIntentRef',
    'Math.hypot(deltaX, deltaY) < THUMBNAIL_MOVE_DRAG_THRESHOLD_PX',
    'onMovePointerStart(event, span)',
    'suppressClickRef.current',
    'timeline-video-sequence-clip-thumbnail-strip-preview',
    '--kg-video-sequence-clip-thumbnail-preview-left',
    'data-kg-video-sequence-clip-thumbnail-preview-active', 'data-kg-video-sequence-clip-thumbnail-preview-suppressed', 'if (!suppressPreview) setActiveThumbnailIndex(thumbnailIndex)',
    'data-kg-video-sequence-clip-thumbnail-caption-format',
    'data-kg-video-sequence-clip-thumbnail-caption-time',
    'data-kg-video-sequence-clip-thumbnail-preview-caption',
  ], 'expected text-neutral thumbnail metadata token')
  if (clipThumbnailStripText.includes('onPointerDown={event => onMovePointerStart(event, span)}')) throw new Error('expected thumbnail frame clicks to avoid delegating pointer-down into whole-bar move drag')
  if (!rulerText.includes("onMovePointerStart={(event, targetSpan) => onTrackPointerStart(event, targetSpan, 'move')}")) throw new Error('expected compact source thumbnail pointer-down to delegate to the whole-bar move handler')
  expectSourceIncludes(transportInteractionsText, ['const primaryButtonActive = event.button === 0 || event.buttons === 1', 'if (!primaryButtonActive || args.maxMinutes <= 0) return'], 'expected thumbnail move promotion to start whole-bar drag from active pointermove events')
  expectSourceIncludes(transportInteractionModelText, ["draggingMode: ReturnType<typeof useGanttTimelineInteractions>['draggingMode']", 'draggingMode: interactions.draggingMode'], 'expected transport interactions to expose active drag mode for resize-safe compact thumbnails')
  if (clipThumbnailStripText.includes('{thumbnail.format}/{thumbnail.rasterFormat}</span>') || clipThumbnailStripText.includes('{formatVideoSequenceTimelineSecondsOffset(thumbnail.timestampSeconds)} {thumbnail.format}/{thumbnail.rasterFormat}')) throw new Error('expected thumbnail metadata to stay out of visible ruler text')
  expectSourceIncludes(clipMetaText, [
    'timeline-video-sequence-clip-meta',
    'data-kg-video-sequence-clip-source-window',
    'durationLabel: string',
    'resolveVideoSequenceSourceWindowLabel',
  ], 'expected clip metadata token')
  expectSourceIncludes(clipMetaCssText, [
    '.timeline-video-sequence-clip-meta',
    'flex-wrap: wrap',
    'text-overflow: ellipsis',
  ], 'expected clip metadata style')
  expectSourceIncludes(editRailCssText, [
    '--kg-compact-source-media-bar-height: var(--kg-timeline-bar-height, var(--kg-toolbar-compact-surface-height))',
    '--kg-compact-source-placeholder-bar-height: var(--kg-compact-source-media-bar-height)',
    '.timeline-transport-track-clip[data-kg-timeline-clip-compact="1"]:not(.timeline-transport-track-clip--lane-fbf)',
    'height: var(--kg-compact-source-media-bar-height)',
    'translate: 0 calc((var(--kg-video-sequence-lane-height, 61px) - var(--kg-timeline-bar-height)) / 2)',
    'border-radius: var(--island-radius)', 'border: var(--kg-surface-border)', 'background: var(--island-bg)', 'color: var(--kg-text-secondary)',
    'border-color: var(--kg-canvas-accent, rgb(59 130 246 / 1))',
    'box-shadow: none',
    'z-index: 9',
    'contain: layout style',
    '.timeline-transport-chrome--mermaid-gantt:has(.timeline-video-sequence-clip-thumbnail-strip[data-kg-video-sequence-clip-thumbnail-preview-active="1"])',
    'z-index: 12',
    'overflow: visible',
    'inset: 0',
    'pointer-events: none',
    'flex: 1 1 0',
    'min-width: 0',
    'cursor: move',
    '.timeline-video-sequence-clip-thumbnail-drag-affordance',
    'inset-block-start: 2px',
    'width: 8px',
    'height: 8px',
    '.timeline-video-sequence-clip-thumbnail:hover .timeline-video-sequence-clip-thumbnail-drag-affordance',
    'cursor: grab',
    'cursor: grabbing',
    'background: transparent',
    'top: calc(100% + 6px)',
    'overflow: visible',
    'transform-origin: top center',
    '[data-kg-video-sequence-clip-thumbnail-preview-active="1"] .timeline-video-sequence-clip-thumbnail-strip-preview',
    '.timeline-video-sequence-clip-thumbnail-strip-preview',
    'left: var(--kg-video-sequence-clip-thumbnail-preview-left, 50%)',
    'inset: 0',
    '.timeline-transport-track-handle',
    'position: static', 'top: -3px', 'bottom: -3px', 'data-kg-video-sequence-drag-mode="resize-start"', 'data-kg-video-sequence-clip-thumbnail-preview-suppressed="1"',
    'z-index: 14',
    'width: 6px',
    'cursor: ew-resize',
    'pointer-events: auto',
    'transition: none',
    '.timeline-transport-track-handle--end',
    'right: 0',
    'padding-inline-end: 0',
    'background: transparent',
    'opacity: 1',
    '.timeline-transport-track-handle-grip',
    'display: none',
  ], 'expected edit rail style')
  if (denseFbfCssText.includes('[data-kg-timeline-clip-compact="1"] .timeline-transport-track-handle {\n  display: none;')) {
    throw new Error('expected compact media resize handles to stay interactive while their grips stay hidden')
  }
  if (denseFbfCssText.includes('border-color: rgb(0 153 255')) {
    throw new Error('expected compact timeline chrome to use design token canvas accent')
  }
  if (denseFbfCssText.includes('height: var(--kg-control-height,')) {
    throw new Error('expected compact timeline bar height to use the main-toolbar-derived timeline bar token')
  }
  if (
    transportCssText.includes('rgb(130 130 226 / 0.88)') ||
    transportCssText.includes('rgb(59 130 246 / 0.88)') ||
    transportCssText.includes('rgb(214 211 255 / 0.42)') ||
    transportCssText.includes('.timeline-transport-track-handle::after') ||
    rulerCssText.includes('linear-gradient(180deg, rgb(96 165 250 / 0.82), rgb(37 99 235 / 0.84))') ||
    rulerCssText.includes('rgb(37 99 235 / 0.7)')
  ) {
    throw new Error('expected Timeline transport CSS to remove legacy solid blue bars and visible resize grips')
  }
  if (denseFbfCssText.includes('background: rgb(2 6 23 / 0.58);')) {
    throw new Error('expected compact media bar labels to render as direct top-left text without a badge background')
  }
  if (denseFbfCssText.includes('background: color-mix(in srgb, var(--kg-text-primary, #0f172a) 12%, transparent)')) {
    throw new Error('expected compact media bezel to reuse the toolbar bezel palette')
  }
  if (denseFbfCssText.includes('linear-gradient(180deg, rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.02))')) {
    throw new Error('expected compact media source bars to avoid a second wash tone')
  }
  if (denseFbfCssText.includes('background: rgb(3 7 18 / 0.66);')) {
    throw new Error('expected compact media source bars to keep a translucent background')
  }
  if (denseFbfCssText.includes('0 0 0 1px rgb(37 99 235 / 0.32)')) {
    throw new Error('expected compact media selected chrome to use a subtle border line instead of an outer glow')
  }
  if (
    denseFbfCssText.includes('inset 0 1px 0 rgb(255 255 255 / 0.76)') ||
    denseFbfCssText.includes('inset 0 -1px 0 color-mix(in srgb, var(--kg-border, #e5e7eb) 72%, transparent)') ||
    mermaidTransportCssText.includes('border-inline-color: transparent') ||
    mermaidTransportCssText.includes('0 1px 2px rgb(15 23 42 / 0.1)')
  ) {
    throw new Error('expected compact media selected chrome to keep only the accent border line')
  }
  if (
    denseFbfCssText.includes('inset: 2px 5px') ||
    denseFbfCssText.includes('background: rgb(2 6 23 / 0.72);') ||
    denseFbfCssText.includes('box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);') ||
    denseFbfCssText.includes('box-shadow: inset -1px 0 0 rgb(255 255 255 / 0.08);') ||
    denseFbfCssText.includes('0 2px 8px rgb(15 23 42 / 0.28)')
  ) {
    throw new Error('expected compact media thumbnails to avoid redundant inner border chrome')
  }
  if (
    denseFbfCssText.includes(':hover .timeline-video-sequence-clip-thumbnail:first-child .timeline-video-sequence-clip-thumbnail-preview {\n  opacity: 0;') ||
    denseFbfCssText.includes(':focus-within .timeline-video-sequence-clip-thumbnail:first-child .timeline-video-sequence-clip-thumbnail-preview {\n  opacity: 0;') ||
    denseFbfCssText.includes('.timeline-video-sequence-clip-thumbnail:first-child .timeline-video-sequence-clip-thumbnail-preview') ||
    denseFbfCssText.includes('.timeline-video-sequence-clip-thumbnail:hover .timeline-video-sequence-clip-thumbnail-preview')
  ) {
    throw new Error('expected compact media thumbnail hover to use the strip-level active preview state')
  }
  if (mermaidTransportCssText.includes('0 0 0 2px rgb(37 99 235 / 0.44)')) {
    throw new Error('expected scoped compact media selected chrome to avoid the heavy outer ring')
  }
  if (denseFbfCssText.includes('[data-kg-compact-source-placeholder="1"]') || denseFbfCssText.includes('backdrop-filter: blur(2px)')) throw new Error('expected compact clips to reuse neutral shared surfaces without placeholder or label-chip variants')
  if (
    denseFbfCssText.includes('inset 0 0 0 1px color-mix(in srgb, var(--kg-canvas-accent') ||
    mermaidTransportCssText.includes('inset 0 0 0 1px color-mix(in srgb, var(--kg-canvas-accent')
  ) {
    throw new Error('expected compact media selected chrome to avoid redundant inset frames')
  }
  if (mermaidTransportCssText.includes('linear-gradient(180deg, color-mix(in srgb, var(--kg-panel-bg, #fff) 76%, var(--kg-canvas-accent, #2563eb) 24%), var(--kg-canvas-accent, rgb(37 99 235 / 1)))')) {
    throw new Error('expected compact source handles to stay removed under scoped transport styling')
  }
  if (denseFbfCssText.includes('.timeline-transport-track-clip--lane-audio[data-kg-timeline-clip-compact="1"]')) {
    throw new Error('expected compact source audio to reuse the shared source bar chrome')
  }
  if (
    !denseFbfCssText.includes('[data-kg-video-sequence-dense-fbf="1"] .timeline-video-sequence-clip-meta') ||
    !denseFbfCssText.includes('[data-kg-timeline-clip-compact="1"] .timeline-video-sequence-clip-meta')
  ) {
    throw new Error('expected dense and compact media lanes to suppress clip metadata')
  }
  expectSourceIncludes(contextControlsText, [
    'timeline-transport-clip-context',
    'data-kg-video-sequence-clip-context',
    'selectedSpan ? args.model.clipEdit.detailsLabel',
  ], 'expected clip context token')
  if (contextControlsText.includes('if (!args.model.exportSessions.items.length) return null')) {
    throw new Error('expected selected-clip context to render without export sessions')
  }
  if (!shellText.includes('const contextControls = <GanttTimelineTransportContextControls')) {
    throw new Error('expected shell to always mount transport context controls')
  }
  if (!contextCssText.includes('.timeline-transport-clip-context-time')) {
    throw new Error('expected clip context styles to live in the focused sibling stylesheet')
  }
  expectSourceIncludes(contextCssText, [
    'min-height: 22px',
    'border: 1px solid var(--kg-border',
    'background: color-mix(in srgb, var(--kg-panel-bg-hover',
    'color: var(--kg-text-primary',
    'clip-path: inset(50%)',
    'background: color-mix(in srgb, var(--kg-canvas-accent',
  ], 'expected clip context to reuse design tokens')
  if (!transportText.includes("import './TimelineTransportControlsMermaidGantt.css'")) {
    throw new Error('expected focused Mermaid Gantt transport chrome CSS to be imported after base transport CSS')
  }
  expectSourceIncludes(mermaidTransportCssText, [
    '.timeline-transport-chrome--mermaid-gantt .timeline-player',
    'height: calc(var(--kg-control-height) + 8px)',
    'flex: 0 0 var(--kg-control-height)',
    'isolation: isolate',
    'min-height: 100%',
    'gap: 0',
    'padding: 0',
    'box-shadow: none',
    'height: 100%',
    'border-bottom: var(--kg-surface-border)',
    '.timeline-transport-chrome--mermaid-gantt .timeline-transport-zoom-controls',
    'height: var(--kg-control-height)',
    '.timeline-transport-chrome--mermaid-gantt .timeline-transport-zoom-label',
    'min-width: 0',
    '.timeline-transport-chrome--mermaid-gantt .timeline-video-sequence-tool-strip',
    'border-inline: var(--kg-surface-border)',
    '.timeline-transport-chrome--mermaid-gantt .timeline-transport-header-tools',
    'justify-content: flex-start',
    '.timeline-transport-chrome--mermaid-gantt .timeline-transport-ruler-layout',
    'flex: 1 1 auto',
    '.timeline-transport-chrome--mermaid-gantt .timeline-transport-ruler--video-sequence',
    'border-top: 0',
    'min-height: 0',
    '.timeline-transport-chrome--mermaid-gantt .timeline-video-sequence-ruler-scroll-content',
    '.timeline-transport-chrome--mermaid-gantt .timeline-video-sequence-ruler-surface',
    '.timeline-transport-chrome--mermaid-gantt .timeline-transport-ruler-tick:not([data-kg-video-sequence-major-tick="1"]) .timeline-transport-ruler-tick-label',
    'color-mix(in srgb, var(--kg-panel-bg-hover, #f9fafb) 62%, var(--kg-panel-bg, #fff))',
    '.timeline-transport-chrome--mermaid-gantt .timeline-tool-menu:not([open]) > .timeline-tool-menu-panel',
    '.timeline-transport-chrome--mermaid-gantt .timeline-player-context:empty',
    '.timeline-transport-chrome--mermaid-gantt .timeline-transport-status-bar',
    '.timeline-transport-chrome--mermaid-gantt .timeline-transport-status-details',
    '.timeline-transport-chrome--mermaid-gantt .timeline-transport-media-player-slot',
    '.timeline-transport-chrome--mermaid-gantt .timeline-transport-media-player-frame',
    '.timeline-transport-chrome--mermaid-gantt .timeline-transport-media-player-media',
    'flex-wrap: nowrap',
    'gap: 2px',
    'color-mix(in srgb, var(--kg-canvas-accent',
    'background: color-mix(in srgb, var(--kg-panel-bg-hover',
  ], 'expected transport chrome tokenized finetune')
  if (mermaidTransportCssText.includes('data-kg-timeline-clip-compact') || mermaidTransportCssText.includes('data-kg-compact-source-placeholder')) throw new Error('expected canonical Timeline clip styling to have one owner outside the transport chrome shell')
  if (
    mermaidTransportCssText.includes('aspect-ratio: 16 / 9') ||
    mermaidTransportCssText.includes('width: min(100%, 640px)') ||
    mermaidTransportCssText.includes('max-height: 240px')
  ) {
    throw new Error('expected BottomPanel media player to resize with the panel instead of using legacy fixed aspect-ratio caps')
  }
  expectSourceIncludes(transportHeaderToolsText, [
    'timeline-transport-zoom-controls',
    'data-kg-timeline-zoom-control',
    'timeline-transport-zoom-label',
    'timeline-tool-menu--edit',
    'timeline-tool-menu--zoom',
    'MonitorPlay',
    'data-kg-video-sequence-tool="media-player"',
    'data-kg-video-sequence-media-player-toggle="1"',
    'aria-label="Video sequence edit tools"',
    'aria-label="Timeline fit and center tools"',
    'renderZoomButton',
    "renderZoomButton('zoom-out')",
    "renderZoomButton('zoom-in')",
  ], 'expected promoted zoom control token')
  expectSourceIncludes(videoSequenceToolButtonText, [
    'export function TimelineVideoSequenceToolButton',
    'const VIDEO_SEQUENCE_TOOL_ICONS',
    'Record<VideoSequenceTimelineToolId, LucideIcon>',
    'data-kg-video-sequence-tool={id}',
  ], 'expected shared video-sequence tool button token')
  if (
    !transportHeaderToolsText.includes('@/components/timeline/VideoSequenceTimelineToolButton') ||
    transportHeaderToolsText.indexOf('args.model.syncModeButton.ariaLabel') > transportHeaderToolsText.indexOf('timeline-tool-menu--edit') ||
    transportHeaderToolsText.indexOf('timeline-tool-menu--edit') > transportHeaderToolsText.indexOf('args.model.clipActionButtons.map') ||
    rulerText.includes('TimelineVideoSequenceToolButton') ||
    rulerText.includes('VIDEO_SEQUENCE_TOOL_ICONS') ||
    rulerText.includes('VIDEO_SEQUENCE_TIMELINE_TOOLS.map')
  ) {
    throw new Error('expected BottomPanel Timeline tool strip to stay compact in the transport header without ruler-local duplicates')
  }
  if (
    transportChromeModelText.includes("icon: 'audio' | 'center' | 'download'") ||
    transportChromeModelText.includes("key: 'audio' | 'center' | 'fit'")
  ) {
    throw new Error('expected zoom actions to be promoted out of the export utility action button collection type')
  }
  expectSourceIncludes(transportChromeModelText, [
    'zoomControls: {',
    'label: `${Math.round(args.timelineZoom * 100)}%`',
    'percent: Math.max(0, Math.min(100, args.timelineZoomPercent))',
    'timelineZoom: number',
    'timelineZoomPercent: number',
    'mediaPlayerButton: {',
    'mediaPlayerAvailable: boolean',
    'mediaPlayerEnabled: boolean',
    'onToggleMediaPlayer: () => void',
  ], 'expected zoom control model token')
  expectSourceIncludes(transportSurfaceModelText, [
    'const timelinePlanSourceFrameRate = React.useMemo',
    ': selectedPreviewEmpty ? 0 : (timelinePlanSourceFrameRate || thumbnailSummary.averageVideoFrameRate)',
    'const [mediaPlayerVisible, setMediaPlayerVisible] = React.useState(false)',
    'const mediaPlayerSourceSegment = React.useMemo',
    'readTimelineTransportMediaPreviewKind',
    'const mediaPlayerModel = React.useMemo<GanttTimelineTransportMediaPlayerModel>',
    'mediaPlayerAvailable',
    'mediaPlayerEnabled',
  ], 'expected source-backed frame-rate ruler token')
  expectSourceIncludes(transportText, [
    'mediaPlayer?: React.ReactNode',
    'timeline-transport-media-player-slot',
  ], 'expected shared transport media player slot token')
  expectSourceIncludes(shellText, [
    'GanttTimelineTransportMediaPlayer',
    'mediaPlayerModel: GanttTimelineTransportMediaPlayerModel',
    'mediaPlayer={args.mediaPlayerModel.active ?',
  ], 'expected shell media player token')
  for (const token of [
    'CardMediaPreview',
    'useTimelineVideoPreviewSyncController',
    'data-kg-video-sequence-media-player="1"',
    'data-kg-video-sequence-media-player-kind',
    'videoControls={false}',
    'mediaThumbnailDataAttr={true}',
    'readTransportSnapshot',
  ]) {
    if (!mediaPlayerText.includes(token)) throw new Error(`expected media player reuse token: ${token}`)
  }
  for (const token of [
    'TIMELINE_TRANSPORT_GESTURE_ZOOM_DELTA',
    'TIMELINE_TRANSPORT_WHEEL_LINE_DELTA',
    'captureZoomScrollAnchor',
    'resolveTimelineTransportRailScroller',
    'rulerViewportRef',
    'wheelZoomClientXRef',
    'zoomScrollAnchorRef',
    'wheelZoomDeltaRef',
    'wheelZoomFrameRef',
    'gestureScaleRef',
    "scroller.addEventListener('gesturestart'",
    "scroller.addEventListener('gesturechange'",
    'window.requestAnimationFrame(flushWheelZoom)',
    'window.cancelAnimationFrame(wheelZoomFrameRef.current)',
    'handleRulerWheelZoom',
    'event.preventDefault()',
    'event.stopPropagation()',
    'event.ctrlKey && !event.metaKey',
    'resolveTimelineTransportGestureZoomStepCount(delta)',
    'applyZoomStep(direction, wheelZoomClientXRef.current, stepCount)',
  ]) {
    if (!transportViewText.includes(token)) throw new Error(`expected pinch-to-zoom view token: ${token}`)
  }
  if (!timelineTransportText.includes('export const TIMELINE_TRANSPORT_GESTURE_ZOOM_DELTA')) {
    throw new Error('expected pinch-to-zoom gesture threshold to live in shared timeline transport constants')
  }
  if (!timelineTransportText.includes('export const TIMELINE_TRANSPORT_WHEEL_LINE_DELTA')) {
    throw new Error('expected pinch-to-zoom wheel normalization to live in shared timeline transport constants')
  }
  if (!timelineTransportText.includes('export const TIMELINE_TRANSPORT_GESTURE_MAX_STEPS')) {
    throw new Error('expected pinch-to-zoom burst step cap to live in shared timeline transport constants')
  }
  if (resolveTimelineTransportZoom(999) !== 6) {
    throw new Error('expected native timeline pinch zoom to expose the deeper append-workspace zoom ceiling')
  }
  if (resolveTimelineTransportGestureZoomStepCount(96) !== 3 || resolveTimelineTransportNextZoomIndex(0, 1, 3) !== 3) {
    throw new Error('expected large pinch deltas to resolve bounded multi-step timeline zoom')
  }
  for (const token of [
    'handleRulerWheelZoom: (event: React.WheelEvent<HTMLElement>) => void',
    'disabled: args.disabled',
    'handleRulerWheelZoom: transportView.handleRulerWheelZoom',
  ]) {
    if (!transportInteractionModelText.includes(token)) throw new Error(`expected interaction pinch-to-zoom token: ${token}`)
  }
  for (const token of [
    "'data-kg-gantt-timeline-pinch-zoom': '1'",
    'onWheel: args.onRulerWheel',
    'onRulerWheel: (event: React.WheelEvent<HTMLElement>) => void',
  ]) {
    if (!transportRulerModelText.includes(token)) throw new Error(`expected ruler pinch-to-zoom token: ${token}`)
  }
  for (const token of [
    'disabled: transportSession.disabled',
    'onRulerWheel: transportInteractionModel.handleRulerWheelZoom',
  ]) {
    if (!transportSurfaceModelText.includes(token)) throw new Error(`expected surface pinch-to-zoom token: ${token}`)
  }
}
