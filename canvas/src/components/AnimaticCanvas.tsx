import React from 'react'
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowLeftToLine,
  ArrowRight,
  ArrowRightToLine,
  ArrowUp,
  CircleDot,
  Copy,
  EyeOff,
  FileText,
  GitMerge,
  Pencil,
  RotateCcw,
  Scissors,
  SkipBack,
  SkipForward,
  Tags,
  Trash2,
  VolumeX,
} from 'lucide-react'
import IconButton from '@/components/IconButton'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  uiToolbarResponsiveRowScrollClassName,
  uiToolbarRowScrollClassName,
  uiToolbarTouchRowScrollClassName,
} from '@/features/toolbar/ui/toolbarStyles'
import { UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { useMediaQuery } from '@/lib/ui/useMediaQuery'
import { TimelineTransportControls } from '@/components/timeline/TimelineTransportControls'
import {
  TIMELINE_TRANSPORT_PLAYBACK_RATES,
  clampTimelineTransportValue,
  resolveTimelineTransportUnitsPerMs,
  useTimelineDocumentTransportController,
  useTimelineDocumentStoreBinding,
  useTimelineTransportStoreBinding,
  type TimelineTransportPlaybackRate,
  useTimelineTransportPlayback,
} from '@/components/timeline/timelineTransport'
import {
  isAnimaticTimelineMutationHotkeyAction,
  resolveAnimaticTimelineHotkeyAction,
  shouldIgnoreAnimaticTimelineHotkeys,
} from '@/components/AnimaticCanvas/animaticKeyboard'
import { resolveAnimaticTimelineLanePresentation } from '@/components/AnimaticCanvas/animaticLaneControls'
import { useAnimaticTimelineModel } from '@/components/AnimaticCanvas/useAnimaticTimelineModel'
import { getIconSizeClass } from '@/lib/ui'
import { resolveTimelineEnabled } from '@/lib/timeline/timelineVisibility'
import {
  applyAnimaticTimelineBeatTimingOverrides,
  cloneAnimaticTimelineFrontmatterMeta,
  deleteAnimaticTimelineBeatRecord,
  duplicateAnimaticTimelineBeatRecord,
  findAnimaticTimelineBeatIndexAtPosition,
  formatAnimaticTimelineTimestamp,
  insertAnimaticTimelineBeatRecord,
  mergeAnimaticTimelineBeatWithNextRecord,
  readAnimaticTimelineLaneControlState,
  removeAnimaticTimelineGapBeforeBeatRecord,
  resolveAnimaticTimelineBeatTimingEdit,
  splitAnimaticTimelineBeatRecord,
  snapAnimaticTimelineValue,
  type AnimaticTimelineLaneId,
  type AnimaticTimelineLaneControlState,
  type AnimaticTimelineBeat,
  type AnimaticTimelineBeatTimingOverride,
  type AnimaticTimelineScaleConfig,
  updateAnimaticTimelineBeatTimingOverrideRecords,
  updateAnimaticTimelineBeatRecordField,
  updateAnimaticTimelineLaneControlStateRecord,
  updateAnimaticTimelineLaneOrderRecord,
} from '@/components/AnimaticCanvas/animaticTimeline'
import './AnimaticCanvas.css'

const ORDINAL_PLAYBACK_BEAT_MS = 1000
const SCALE_ROW_HEIGHT_PX = 32
const BEAT_HEADER_HEIGHT_PX = 72
const LANE_ROW_HEIGHT_PX = 32
const SNAP_STEP_OPTIONS_MS = [100, 250, 500, 1000] as const
const EDIT_MIN_DURATION_MS = 300
const DRAG_EDGE_SCROLL_THRESHOLD_PX = 72
const DRAG_EDGE_SCROLL_STEP_PX = 28
const DRAG_COMMIT_MIN_DELTA_PX = 4
const BEAT_LANE_SUMMARY_LIMIT = 3
const TIMELINE_COMPACT_HINT_CHIP_CLASS_NAME =
  'rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1 py-0 text-xs leading-3 text-cyan-100'

const SELECTED_LANE_HINTS = [
  { label: 'Arrows', title: 'Arrow Up/Down focus lane' },
  { label: 'Home/End', title: 'Jump to first or last lane' },
  { label: '[ / ]', title: 'Reorder the selected lane' },
  { label: 'H', title: 'Hide or show the selected lane' },
  { label: 'U', title: 'Mute or unmute the selected lane' },
  { label: 'O', title: 'Solo or unsolo the selected lane' },
] as const

const SELECTED_ITEM_HINTS = [
  { label: 'Arrows', title: 'Arrow Up/Down focus item' },
  { label: 'Home/End', title: 'Jump to first or last item' },
  { label: ',', title: 'Move the selected item to the previous beat' },
  { label: '.', title: 'Move the selected item to the next beat' },
] as const

const SELECTED_BEAT_HINTS = [
  { label: 'L', title: 'Rename beat (L)' },
  { label: 'N', title: 'Edit note (N)' },
  { label: 'M', title: 'Edit summary (M)' },
  { label: 'T', title: 'Edit tags (T)' },
  { label: 'D', title: 'Duplicate beat (D)' },
  { label: 'S', title: 'Split beat (S)' },
] as const

const LANE_ACCENT_CLASS: Record<AnimaticTimelineLaneId, string> = {
  clip: 'border-cyan-400/30 bg-cyan-500/8 text-cyan-50',
  overlay: 'border-fuchsia-400/30 bg-fuchsia-500/8 text-fuchsia-50',
  audio: 'border-amber-400/30 bg-amber-500/8 text-amber-50',
  scene: 'border-emerald-400/30 bg-emerald-500/8 text-emerald-50',
  node: 'border-slate-500/30 bg-slate-500/8 text-slate-100',
}

const LANE_LABEL: Record<AnimaticTimelineLaneId, string> = {
  clip: 'Clip',
  overlay: 'Overlay',
  audio: 'Audio',
  scene: 'Scene',
  node: 'Node',
}

type AnimaticBeatEditableField = 'label' | 'note' | 'summary' | 'tags'

type AnimaticBeatEditSession = {
  beatRef: string
  field: AnimaticBeatEditableField
  requestKey: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function shouldIgnoreTimelineActionPointerMoveStart(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null
  if (!element) return false
  return !!element.closest('button, a, input, textarea, select, [data-kg-timeline-action-ignore-drag="true"]')
}

function areTimingOverrideRecordsEqual(
  left: Record<string, AnimaticTimelineBeatTimingOverride>,
  right: Record<string, AnimaticTimelineBeatTimingOverride>,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    const leftOverride = left[key]
    const rightOverride = right[key]
    if (!leftOverride || !rightOverride) return false
    if (leftOverride.startMs !== rightOverride.startMs || leftOverride.endMs !== rightOverride.endMs) return false
  }
  return true
}

function buildScaleMarks(args: {
  totalSpan: number
  usesAbsoluteTiming: boolean
  scaleConfig: AnimaticTimelineScaleConfig
}): Array<{ key: string; left: number }> {
  const totalSpanUnits = resolveTimelineSpanUnits(args.totalSpan, args.usesAbsoluteTiming)
  if (totalSpanUnits <= 0) return []
  const majorScale = Math.max(0.0001, args.scaleConfig.scale)
  const markCount = Math.floor(totalSpanUnits / majorScale)
  return Array.from({ length: markCount + 1 }, (_, index) => ({
    key: `scale-mark:${index}`,
    left: args.scaleConfig.startLeft + index * args.scaleConfig.scaleWidth,
  }))
}

function buildTimelineEditorTimeUnits(args: {
  totalSpan: number
  usesAbsoluteTiming: boolean
  scaleConfig: AnimaticTimelineScaleConfig
}): Array<{ key: string; left: number; width: number; label: string | null; big: boolean }> {
  const totalSpanUnits = resolveTimelineSpanUnits(args.totalSpan, args.usesAbsoluteTiming)
  if (totalSpanUnits <= 0) return []
  const majorScale = Math.max(0.0001, args.scaleConfig.scale)
  const splitCount = Math.max(1, args.scaleConfig.scaleSplitCount)
  const minorScale = majorScale / splitCount
  const units: Array<{ key: string; left: number; width: number; label: string | null; big: boolean }> = []
  const unitCount = Math.ceil(totalSpanUnits / minorScale)
  for (let index = 0; index < unitCount; index += 1) {
    const start = index * minorScale
    const end = Math.min(totalSpanUnits, start + minorScale)
    const left = args.scaleConfig.startLeft + (start / majorScale) * args.scaleConfig.scaleWidth
    const nextLeft = args.scaleConfig.startLeft + (end / majorScale) * args.scaleConfig.scaleWidth
    const big = index % splitCount === 0
    units.push({
      key: `time-unit:${index}`,
      left,
      width: Math.max(1, nextLeft - left),
      label: big ? formatTimelineScaleLabel(start) : null,
      big,
    })
  }
  return units
}

function formatTimelineScaleLabel(value: number): string {
  const roundedValue = Math.round(value * 100) / 100
  return Number.isInteger(roundedValue) ? String(roundedValue) : roundedValue.toFixed(2).replace(/\.?0+$/, '')
}

function resolveTimelineSpanUnits(totalSpan: number, usesAbsoluteTiming: boolean): number {
  return usesAbsoluteTiming ? Math.max(0, totalSpan) / 1000 : Math.max(0, totalSpan)
}

function resolveTimelineSpanToPixels(totalSpan: number, usesAbsoluteTiming: boolean, pixelsPerUnit: number): number {
  return resolveTimelineSpanUnits(totalSpan, usesAbsoluteTiming) * pixelsPerUnit
}

type AnimaticBeatDragState = {
  kind: 'beat'
  sessionId: number
  beatRef: string
  beatIndex: number
  mode: 'move' | 'resize-start' | 'resize-end'
  pointerId: number
  originClientX: number
  originScrollLeft: number
  markdownDocumentName: string
  markdownText: string
  beatsSnapshot: AnimaticTimelineBeat[]
}

type AnimationLaneItemDragState = {
  kind: 'item'
  sessionId: number
  itemNodeId: string
  itemTitle: string
  laneId: AnimaticTimelineLaneId
  sourceBeatRef: string
  pointerId: number
  originClientX: number
  originScrollLeft: number
  markdownDocumentName: string
  markdownText: string
}

type AnimationDragState = AnimaticBeatDragState | AnimationLaneItemDragState

type AnimationLaneItemMoveSource = {
  nodeId: string
  title: string
  laneId: AnimaticTimelineLaneId
  beatRef: string
}

function buildSnapMarks(totalSpan: number, snapStepMs: number, enabled: boolean): number[] {
  if (!enabled || snapStepMs <= 0 || totalSpan <= 0) return []
  const marks: number[] = []
  for (let value = 0; value <= totalSpan; value += snapStepMs) marks.push(value)
  const last = marks[marks.length - 1] || 0
  if (last !== totalSpan) marks.push(totalSpan)
  return marks
}

function buildBeatLaneSummary(items: ReadonlyArray<AnimaticTimelineBeat['items'][number]>): Array<{ laneId: AnimaticTimelineLaneId; count: number }> {
  const countByLaneId = new Map<AnimaticTimelineLaneId, number>()
  for (const item of items) {
    countByLaneId.set(item.laneId, (countByLaneId.get(item.laneId) || 0) + 1)
  }
  return Array.from(countByLaneId.entries())
    .map(([laneId, count]) => ({ laneId, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      return LANE_LABEL[left.laneId].localeCompare(LANE_LABEL[right.laneId])
    })
}

function resolveTimelineEditorActionEffectClassName(laneId: AnimaticTimelineLaneId): 'effect0' | 'effect1' {
  return laneId === 'audio' ? 'effect0' : 'effect1'
}

function getTimelineIconButtonClassName(enabled: boolean, accent: 'default' | 'amber' | 'cyan' = 'default'): string {
  if (!enabled) return 'h-10 w-10 border border-slate-800 bg-slate-950 text-slate-500'
  if (accent === 'amber') return 'h-10 w-10 border border-amber-700 bg-amber-500/10 text-amber-200 hover:border-amber-600 hover:bg-amber-500/15'
  if (accent === 'cyan') return 'h-10 w-10 border border-cyan-700 bg-cyan-500/10 text-cyan-100 hover:border-cyan-600 hover:bg-cyan-500/15'
  return 'h-10 w-10 border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800'
}

function getTimelineCompactIconButtonClassName(
  enabled: boolean,
  accent: 'default' | 'amber' | 'cyan' = 'default',
): string {
  if (!enabled) return 'h-7 w-7 border border-slate-800 bg-slate-950 text-slate-500'
  if (accent === 'amber') return 'h-7 w-7 border border-amber-700 bg-amber-500/10 text-amber-200 hover:border-amber-600 hover:bg-amber-500/15'
  if (accent === 'cyan') return 'h-7 w-7 border border-cyan-700 bg-cyan-500/10 text-cyan-100 hover:border-cyan-600 hover:bg-cyan-500/15'
  return 'h-7 w-7 border border-slate-700 bg-slate-950/90 text-slate-200 hover:border-slate-600 hover:bg-slate-900'
}

function getTimelineInlineMoveIconButtonClassName(enabled: boolean): string {
  if (!enabled) return 'h-6 w-6 border border-slate-800 bg-slate-950 text-slate-500'
  return 'h-6 w-6 border border-slate-700 bg-slate-950/90 text-slate-200 hover:border-slate-600 hover:bg-slate-900'
}

function getTimelineBeatQuickIconButtonClassName(enabled: boolean): string {
  if (!enabled) return 'h-6 w-6 border border-slate-800 bg-slate-950/95 text-slate-500'
  return 'h-6 w-6 border border-slate-700 bg-slate-950/95 text-slate-200 hover:border-slate-600 hover:bg-slate-900'
}

function getTimelineCompactStatusChipClassName(
  tone: 'default' | 'muted' | 'amber' | 'cyan' = 'default',
): string {
  if (tone === 'muted') return 'rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-500'
  if (tone === 'amber') return 'rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-amber-200'
  if (tone === 'cyan') return 'rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-cyan-200'
  return 'rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-300'
}

export default function AnimaticCanvas({
  active = true,
}: {
  active?: boolean
}) {
  const isTouchLaneViewport = useMediaQuery('(max-width: 768px), (pointer: coarse)')
  const graphData = useActiveGraphRenderData(active)
  const { markdownDocumentName, markdownText } = useTimelineDocumentStoreBinding()
  const graphDataRevision = useGraphStore(s => s.graphDataRevision || 0)
  const updateGraphMetadata = useGraphStore(s => s.updateGraphMetadata)
  const updateNode = useGraphStore(s => s.updateNode)
  const timelineEnabled = useGraphStore(s => resolveTimelineEnabled(s.timelineEnabled))
  const {
    transportDocumentKey,
    transportPosition,
    transportPlaying,
    transportPlaybackRate,
    setTimelineTransportState,
  } = useTimelineTransportStoreBinding()
  const baseTimelineModel = useAnimaticTimelineModel({ graphData, graphDataRevision, markdownText })
  const [runtimeAutoScrollEnabled, setRuntimeAutoScrollEnabled] = React.useState(true)
  const [snapEnabled, setSnapEnabled] = React.useState(true)
  const [snapStepMs, setSnapStepMs] = React.useState<(typeof SNAP_STEP_OPTIONS_MS)[number]>(500)
  const [hiddenLaneIds, setHiddenLaneIds] = React.useState<AnimaticTimelineLaneId[]>([])
  const [mutedLaneIds, setMutedLaneIds] = React.useState<AnimaticTimelineLaneId[]>([])
  const [soloLaneId, setSoloLaneId] = React.useState<AnimaticTimelineLaneId | null>(null)
  const [beatEditSession, setBeatEditSession] = React.useState<AnimaticBeatEditSession | null>(null)
  const [highlightedLaneShortcutId, setHighlightedLaneShortcutId] = React.useState<AnimaticTimelineLaneId | null>(null)
  const [selectedLaneId, setSelectedLaneId] = React.useState<AnimaticTimelineLaneId | null>(null)
  const [selectedItemNodeId, setSelectedItemNodeId] = React.useState<string | null>(null)
  const [timingOverrides, setTimingOverrides] = React.useState<Record<string, AnimaticTimelineBeatTimingOverride>>({})
  const [dragState, setDragState] = React.useState<AnimationDragState | null>(null)
  const [laneItemDragPreviewOffsetPx, setLaneItemDragPreviewOffsetPx] = React.useState(0)
  const scrollRef = React.useRef<HTMLElement | null>(null)
  const laneRowRefs = React.useRef<Partial<Record<AnimaticTimelineLaneId, HTMLElement | null>>>({})
  const laneTrackOverlayRefs = React.useRef<Partial<Record<AnimaticTimelineLaneId, HTMLElement | null>>>({})
  const laneOptionRefs = React.useRef<Partial<Record<AnimaticTimelineLaneId, HTMLElement | null>>>({})
  const laneItemOptionRefs = React.useRef<Record<string, HTMLElement | null>>({})
  const beatOptionRefs = React.useRef<Record<string, HTMLElement | null>>({})
  const laneShortcutHighlightTimeoutRef = React.useRef<number | null>(null)
  const timingOverridesRef = React.useRef<Record<string, AnimaticTimelineBeatTimingOverride>>({})
  const dragSessionIdRef = React.useRef(0)
  const beatEditRequestKeyRef = React.useRef(0)
  const dragDeltaPxRef = React.useRef(0)
  const dragPointerClientXRef = React.useRef<number | null>(null)
  const dragEdgeScrollDirectionRef = React.useRef<-1 | 0 | 1>(0)
  const toolbarIconClassName = getIconSizeClass('default')
  const compactToolbarIconClassName = getIconSizeClass('compact')
  const laneInlineScrollClassName = React.useMemo(
    () =>
      [
        uiToolbarRowScrollClassName,
        uiToolbarResponsiveRowScrollClassName,
        isTouchLaneViewport ? uiToolbarTouchRowScrollClassName : '',
        'gap-0.5',
      ]
        .filter(Boolean)
        .join(' '),
    [isTouchLaneViewport],
  )
  React.useEffect(() => {
    timingOverridesRef.current = timingOverrides
  }, [timingOverrides])

  React.useEffect(() => {
    return () => {
      if (laneShortcutHighlightTimeoutRef.current != null) {
        window.clearTimeout(laneShortcutHighlightTimeoutRef.current)
      }
    }
  }, [])

  const timelineModel = React.useMemo(
    () => applyAnimaticTimelineBeatTimingOverrides(baseTimelineModel, timingOverrides),
    [baseTimelineModel, timingOverrides],
  )
  const {
    playbackPosition,
    playing,
    playbackRate,
    setTransportPlaybackPosition,
    setTransportPlaying,
    setTransportPlaybackRate,
  } = useTimelineDocumentTransportController({
    active,
    documentKey: markdownDocumentName,
    maxPosition: timelineModel.totalSpan,
    transportDocumentKey,
    transportPosition,
    transportPlaying,
    transportPlaybackRate,
    setTimelineTransportState,
  })
  const persistedLaneControls = React.useMemo(
    () => readAnimaticTimelineLaneControlState(markdownText),
    [markdownText],
  )

  React.useEffect(() => {
    setHiddenLaneIds(persistedLaneControls.hiddenLaneIds)
    setMutedLaneIds(persistedLaneControls.mutedLaneIds)
    setSoloLaneId(persistedLaneControls.soloLaneId)
  }, [persistedLaneControls])

  React.useEffect(() => {
    if (timelineModel.usesAbsoluteTiming) return
    dragSessionIdRef.current += 1
    dragDeltaPxRef.current = 0
    setTimingOverrides({})
    timingOverridesRef.current = {}
    setDragState(null)
    setLaneItemDragPreviewOffsetPx(0)
    dragPointerClientXRef.current = null
    dragEdgeScrollDirectionRef.current = 0
  }, [timelineModel.usesAbsoluteTiming])

  const timelinePlaybackUnitsPerMs = React.useMemo(
    () =>
      resolveTimelineTransportUnitsPerMs({
        usesAbsoluteTiming: timelineModel.usesAbsoluteTiming,
        ordinalUnitMs: ORDINAL_PLAYBACK_BEAT_MS,
      }),
    [timelineModel.usesAbsoluteTiming],
  )
  useTimelineTransportPlayback({
    active: active && timelineEnabled,
    playing,
    position: playbackPosition,
    max: timelineModel.totalSpan,
    playbackRate,
    unitsPerMs: timelinePlaybackUnitsPerMs,
    onPositionChange: setTransportPlaybackPosition,
    onPlaybackEnd: () => setTransportPlaying(false),
  })

  React.useEffect(() => {
    if (!timelineEnabled && playing) setTransportPlaying(false)
  }, [timelineEnabled, playing, setTransportPlaying])

  React.useEffect(() => {
    dragSessionIdRef.current += 1
    dragDeltaPxRef.current = 0
    setTimingOverrides({})
    timingOverridesRef.current = {}
    setDragState(null)
    setLaneItemDragPreviewOffsetPx(0)
    dragPointerClientXRef.current = null
    dragEdgeScrollDirectionRef.current = 0
  }, [markdownDocumentName, markdownText])

  const activeBeatIndex = React.useMemo(
    () => findAnimaticTimelineBeatIndexAtPosition(timelineModel, playbackPosition),
    [timelineModel, playbackPosition],
  )

  const timelinePixelsPerUnit = React.useMemo(
    () => timelineModel.scaleConfig.scaleWidth / Math.max(0.0001, timelineModel.scaleConfig.scale),
    [timelineModel.scaleConfig.scale, timelineModel.scaleConfig.scaleWidth],
  )
  const beatWidths = React.useMemo(
    () =>
      timelineModel.beats.map(beat =>
        Math.max(
          1,
          Math.round(
            resolveTimelineSpanToPixels(
              Math.max(0, beat.displayEnd - beat.displayStart),
              timelineModel.usesAbsoluteTiming,
              timelinePixelsPerUnit,
            ),
          ),
        ),
      ),
    [timelineModel.beats, timelineModel.usesAbsoluteTiming, timelinePixelsPerUnit],
  )

  const beatTrackOffsets = React.useMemo(() => {
    return timelineModel.beats.map(beat =>
      resolveTimelineSpanToPixels(beat.displayStart, timelineModel.usesAbsoluteTiming, timelinePixelsPerUnit),
    )
  }, [timelineModel.beats, timelineModel.usesAbsoluteTiming, timelinePixelsPerUnit])
  const laneActionWidths = React.useMemo(
    () => beatWidths.map(width => Math.max(width, timelineModel.scaleConfig.scaleWidth)),
    [beatWidths, timelineModel.scaleConfig.scaleWidth],
  )
  const resolveBeatAtLaneTrackClientX = React.useCallback(
    (laneId: AnimaticTimelineLaneId, clientX: number): AnimaticTimelineBeat | null => {
      const overlay = laneTrackOverlayRefs.current[laneId]
      if (!overlay || timelineModel.beats.length === 0) return null
      const rect = overlay.getBoundingClientRect()
      const relativeX = clamp(clientX - rect.left, 0, rect.width)
      let closestBeat: AnimaticTimelineBeat | null = null
      let closestDistance = Number.POSITIVE_INFINITY
      for (let i = 0; i < timelineModel.beats.length; i += 1) {
        const beat = timelineModel.beats[i]
        if (!beat) continue
        const beatOffset = beatTrackOffsets[i] ?? 0
        const beatWidth = beatWidths[i] ?? 0
        const beatCenter = beatOffset + beatWidth / 2
        const distance = Math.abs(relativeX - beatCenter)
        if (distance < closestDistance) {
          closestDistance = distance
          closestBeat = beat
        }
      }
      return closestBeat
    },
    [beatTrackOffsets, beatWidths, timelineModel.beats],
  )

  const totalTimelineTrackWidth = React.useMemo(
    () => resolveTimelineSpanToPixels(timelineModel.totalSpan, timelineModel.usesAbsoluteTiming, timelinePixelsPerUnit),
    [timelineModel.totalSpan, timelineModel.usesAbsoluteTiming, timelinePixelsPerUnit],
  )
  const totalTimelineWidth = React.useMemo(
    () => timelineModel.scaleConfig.startLeft + totalTimelineTrackWidth,
    [timelineModel.scaleConfig.startLeft, totalTimelineTrackWidth],
  )
  const timelineUnitsPerPixel = React.useMemo(
    () => (timelineModel.totalSpan > 0 && totalTimelineTrackWidth > 0 ? timelineModel.totalSpan / totalTimelineTrackWidth : 0),
    [timelineModel.totalSpan, totalTimelineTrackWidth],
  )

  const playheadOffsetPx = React.useMemo(() => {
    return (
      timelineModel.scaleConfig.startLeft +
      resolveTimelineSpanToPixels(playbackPosition, timelineModel.usesAbsoluteTiming, timelinePixelsPerUnit)
    )
  }, [playbackPosition, timelineModel.scaleConfig.startLeft, timelineModel.usesAbsoluteTiming, timelinePixelsPerUnit])

  React.useEffect(() => {
    if (!runtimeAutoScrollEnabled) return
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    const targetScrollLeft = Math.max(0, playheadOffsetPx - scrollEl.clientWidth * 0.5)
    scrollEl.scrollTo({
      left: targetScrollLeft,
      behavior: playing ? 'smooth' : 'auto',
    })
  }, [playheadOffsetPx, playing, runtimeAutoScrollEnabled])

  const activeBeat = activeBeatIndex >= 0 ? timelineModel.beats[activeBeatIndex] : null
  const currentEditingBeatRef = beatEditSession?.beatRef || null
  const getBeatFieldEditRequestKey = React.useCallback((beatRef: string, field: AnimaticBeatEditableField): number | null => {
    if (!beatEditSession) return null
    if (beatEditSession.beatRef !== beatRef) return null
    if (beatEditSession.field !== field) return null
    return beatEditSession.requestKey
  }, [beatEditSession])
  const currentTimeLabel = timelineModel.usesAbsoluteTiming ? formatAnimaticTimelineTimestamp(playbackPosition) : formatAnimaticTimelineTimestamp(playbackPosition * 1000)
  const totalTimeLabel = timelineModel.usesAbsoluteTiming ? formatAnimaticTimelineTimestamp(timelineModel.totalSpan) : formatAnimaticTimelineTimestamp(timelineModel.totalSpan * 1000)
  const timelineEditorTimeUnits = React.useMemo(
    () =>
      buildTimelineEditorTimeUnits({
        totalSpan: timelineModel.totalSpan,
        usesAbsoluteTiming: timelineModel.usesAbsoluteTiming,
        scaleConfig: timelineModel.scaleConfig,
      }),
    [timelineModel.scaleConfig, timelineModel.totalSpan, timelineModel.usesAbsoluteTiming],
  )
  const scaleMarks = React.useMemo(
    () =>
      buildScaleMarks({
        totalSpan: timelineModel.totalSpan,
        usesAbsoluteTiming: timelineModel.usesAbsoluteTiming,
        scaleConfig: timelineModel.scaleConfig,
      }),
    [timelineModel.scaleConfig, timelineModel.totalSpan, timelineModel.usesAbsoluteTiming],
  )
  const snapMarks = React.useMemo(
    () => buildSnapMarks(timelineModel.totalSpan, snapStepMs, timelineModel.usesAbsoluteTiming && snapEnabled),
    [snapEnabled, snapStepMs, timelineModel.totalSpan, timelineModel.usesAbsoluteTiming],
  )
  const lanePresentations = React.useMemo(
    () =>
      resolveAnimaticTimelineLanePresentation({
        lanes: timelineModel.lanes,
        controls: {
          hiddenLaneIds,
          mutedLaneIds,
          soloLaneId,
        },
      }),
    [hiddenLaneIds, mutedLaneIds, soloLaneId, timelineModel.lanes],
  )
  const selectedLane = React.useMemo(
    () => lanePresentations.find(lane => lane.id === selectedLaneId) || null,
    [lanePresentations, selectedLaneId],
  )
  const selectedOrActiveBeatRef = activeBeat?.beatRef || timelineModel.beats[0]?.beatRef || null
  const selectedOrFirstLaneId = selectedLaneId || lanePresentations[0]?.id || null
  const selectedLaneVisibleItemContexts = React.useMemo(() => {
    if (!selectedLane) return [] as Array<{
      nodeId: string
      title: string
      laneId: AnimaticTimelineLaneId
      beatRef: string
      previousBeat: AnimaticTimelineBeat | null
      nextBeat: AnimaticTimelineBeat | null
    }>
    if (!selectedLane.visibleItems) return []
    const contexts: Array<{
      nodeId: string
      title: string
      laneId: AnimaticTimelineLaneId
      beatRef: string
      previousBeat: AnimaticTimelineBeat | null
      nextBeat: AnimaticTimelineBeat | null
    }> = []
    for (let index = 0; index < timelineModel.beats.length; index += 1) {
      const beat = timelineModel.beats[index]
      if (!beat) continue
      const previousBeat = timelineModel.beats[index - 1] || null
      const nextBeat = timelineModel.beats[index + 1] || null
      for (const item of beat.items) {
        if (item.laneId !== selectedLane.id) continue
        contexts.push({
          nodeId: item.nodeId,
          title: item.title,
          laneId: item.laneId,
          beatRef: beat.beatRef,
          previousBeat,
          nextBeat,
        })
      }
    }
    return contexts
  }, [selectedLane, timelineModel.beats])
  const selectedItemContext = React.useMemo(
    () => selectedLaneVisibleItemContexts.find(item => item.nodeId === selectedItemNodeId) || null,
    [selectedItemNodeId, selectedLaneVisibleItemContexts],
  )
  const selectedOrFirstLaneItemNodeId = selectedItemNodeId || selectedLaneVisibleItemContexts[0]?.nodeId || null
  const canDeleteActiveBeat = !!activeBeat && activeBeat.items.length === 0
  const nextBeat = activeBeatIndex >= 0 ? timelineModel.beats[activeBeatIndex + 1] || null : null
  const previousBeat = activeBeatIndex > 0 ? timelineModel.beats[activeBeatIndex - 1] || null : null
  const snappedPlaybackPosition = React.useMemo(
    () => (snapEnabled ? snapAnimaticTimelineValue(playbackPosition, snapStepMs) : Math.round(playbackPosition)),
    [playbackPosition, snapEnabled, snapStepMs],
  )
  const canSplitActiveBeat =
    !!activeBeat &&
    activeBeat.startMs != null &&
    activeBeat.endMs != null &&
    snappedPlaybackPosition > activeBeat.startMs + EDIT_MIN_DURATION_MS &&
    snappedPlaybackPosition < activeBeat.endMs - EDIT_MIN_DURATION_MS
  const activeGapBeforeMs =
    activeBeat?.startMs != null && previousBeat?.endMs != null ? Math.max(0, activeBeat.startMs - previousBeat.endMs) : 0
  const canRemoveGapBeforeActiveBeat = timelineModel.usesAbsoluteTiming && activeGapBeforeMs > 0
  const canMergeActiveBeatWithNext =
    timelineModel.usesAbsoluteTiming &&
    !!activeBeat &&
    !!nextBeat &&
    activeBeat.startMs != null &&
    nextBeat.endMs != null &&
    nextBeat.items.length === 0
  const timelineRowStyle = React.useMemo<React.CSSProperties>(
    () => ({
      height: LANE_ROW_HEIGHT_PX,
      backgroundPositionX: `0px, ${timelineModel.scaleConfig.startLeft}px`,
      backgroundSize: `${timelineModel.scaleConfig.startLeft}px, ${timelineModel.scaleConfig.scaleWidth}px`,
      paddingLeft: timelineModel.scaleConfig.startLeft,
    }),
    [timelineModel.scaleConfig.scaleWidth, timelineModel.scaleConfig.startLeft],
  )

  React.useEffect(() => {
    if (!selectedLaneId) return
    if (lanePresentations.some(lane => lane.id === selectedLaneId)) return
    setSelectedLaneId(null)
  }, [lanePresentations, selectedLaneId])

  React.useEffect(() => {
    if (!selectedItemNodeId) return
    if (selectedLaneVisibleItemContexts.some(item => item.nodeId === selectedItemNodeId)) return
    setSelectedItemNodeId(null)
  }, [selectedItemNodeId, selectedLaneVisibleItemContexts])

  const commitTimelineFrontmatterMeta = React.useCallback((nextFrontmatterMeta: Record<string, unknown>) => {
    updateGraphMetadata({
      frontmatterMeta: nextFrontmatterMeta as never,
    })
  }, [updateGraphMetadata])

  const commitLaneControlState = React.useCallback(
    async (nextControls: AnimaticTimelineLaneControlState) => {
      const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
      updateAnimaticTimelineLaneControlStateRecord({
        frontmatterMeta: nextFrontmatterMeta,
        hiddenLaneIds: nextControls.hiddenLaneIds,
        mutedLaneIds: nextControls.mutedLaneIds,
        soloLaneId: nextControls.soloLaneId,
      })
      commitTimelineFrontmatterMeta(nextFrontmatterMeta)
    },
    [commitTimelineFrontmatterMeta, markdownText],
  )

  const handleToggleHiddenLane = React.useCallback(
    async (laneId: AnimaticTimelineLaneId) => {
      const nextHiddenLaneIds = hiddenLaneIds.includes(laneId)
        ? hiddenLaneIds.filter(entry => entry !== laneId)
        : [...hiddenLaneIds, laneId]
      setHiddenLaneIds(nextHiddenLaneIds)
      await commitLaneControlState({
        hiddenLaneIds: nextHiddenLaneIds,
        mutedLaneIds,
        soloLaneId,
      })
    },
    [commitLaneControlState, hiddenLaneIds, mutedLaneIds, soloLaneId],
  )

  const handleToggleMutedLane = React.useCallback(
    async (laneId: AnimaticTimelineLaneId) => {
      const nextMutedLaneIds = mutedLaneIds.includes(laneId)
        ? mutedLaneIds.filter(entry => entry !== laneId)
        : [...mutedLaneIds, laneId]
      setMutedLaneIds(nextMutedLaneIds)
      await commitLaneControlState({
        hiddenLaneIds,
        mutedLaneIds: nextMutedLaneIds,
        soloLaneId,
      })
    },
    [commitLaneControlState, hiddenLaneIds, mutedLaneIds, soloLaneId],
  )

  const handleToggleSoloLane = React.useCallback(
    async (laneId: AnimaticTimelineLaneId) => {
      const nextSoloLaneId = soloLaneId === laneId ? null : laneId
      setSoloLaneId(nextSoloLaneId)
      await commitLaneControlState({
        hiddenLaneIds,
        mutedLaneIds,
        soloLaneId: nextSoloLaneId,
      })
    },
    [commitLaneControlState, hiddenLaneIds, mutedLaneIds, soloLaneId],
  )

  const resolveLaneItemMoveNodeId = React.useCallback(
    (itemSource: AnimationLaneItemMoveSource) => {
      const requestedNodeId = String(itemSource.nodeId || '').trim()
      const sourceBeatRef = String(itemSource.beatRef || '').trim()
      const itemTitle = String(itemSource.title || '').trim()
      const sourceBeat = timelineModel.beats.find(beat => beat.beatRef === sourceBeatRef) || null
      if (!sourceBeat) return requestedNodeId
      const exactNodeMatch = sourceBeat.items.find(item => item.nodeId === requestedNodeId)
      if (exactNodeMatch?.nodeId) return exactNodeMatch.nodeId
      const titledLaneMatch = sourceBeat.items.find(
        item => item.laneId === itemSource.laneId && item.title === itemTitle && item.nodeId,
      )
      if (titledLaneMatch?.nodeId) return titledLaneMatch.nodeId
      const laneMatch = sourceBeat.items.find(item => item.laneId === itemSource.laneId && item.nodeId)
      return laneMatch?.nodeId || requestedNodeId
    },
    [timelineModel.beats],
  )

  const handleMoveItemToBeat = React.useCallback(
    async (itemSource: AnimationLaneItemMoveSource, nextBeat: AnimaticTimelineBeat | null | undefined) => {
      const targetBeatRef = String(nextBeat?.beatRef || '').trim()
      if (!targetBeatRef) return
      const resolvedNodeId = resolveLaneItemMoveNodeId(itemSource)
      if (!resolvedNodeId) return
      const targetNode = graphData?.nodes.find(node => node.id === resolvedNodeId) || null
      if (!targetNode) return
      const currentProperties =
        targetNode.properties && typeof targetNode.properties === 'object' && !Array.isArray(targetNode.properties)
          ? { ...(targetNode.properties as Record<string, unknown>) }
          : {}
      const currentParams =
        currentProperties.params && typeof currentProperties.params === 'object' && !Array.isArray(currentProperties.params)
          ? { ...(currentProperties.params as Record<string, unknown>) }
          : {}
      if (String(currentParams.beat_ref || '') === targetBeatRef) return
      currentParams.beat_ref = targetBeatRef
      updateNode(resolvedNodeId, {
        properties: {
          ...currentProperties,
          params: currentParams,
        } as never,
      })
      setTransportPlaying(false)
      setTransportPlaybackPosition(nextBeat?.displayStart ?? 0)
    },
    [graphData?.nodes, resolveLaneItemMoveNodeId, updateNode],
  )

  const handleReorderLane = React.useCallback(
    async (laneId: AnimaticTimelineLaneId, direction: -1 | 1) => {
      const currentLaneOrder = lanePresentations.map(lane => lane.id)
      const currentIndex = currentLaneOrder.indexOf(laneId)
      if (currentIndex < 0) return
      const nextIndex = clamp(currentIndex + direction, 0, currentLaneOrder.length - 1)
      if (nextIndex === currentIndex) return
      const nextLaneOrder = [...currentLaneOrder]
      const [movedLaneId] = nextLaneOrder.splice(currentIndex, 1)
      if (!movedLaneId) return
      nextLaneOrder.splice(nextIndex, 0, movedLaneId)
      const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
      updateAnimaticTimelineLaneOrderRecord({
        frontmatterMeta: nextFrontmatterMeta,
        laneOrder: nextLaneOrder,
      })
      commitTimelineFrontmatterMeta(nextFrontmatterMeta)
    },
    [commitTimelineFrontmatterMeta, lanePresentations, markdownText],
  )

  React.useEffect(() => {
    if (!activeBeat) {
      setBeatEditSession(null)
      return
    }
    if (currentEditingBeatRef === activeBeat.beatRef) return
    setBeatEditSession(null)
  }, [activeBeat, currentEditingBeatRef])

  const handleTogglePlayback = React.useCallback(() => {
    if (timelineModel.totalSpan <= 0) return
    if (playbackPosition >= timelineModel.totalSpan) {
      setTransportPlaybackPosition(0)
    }
    setTransportPlaying(!playing)
  }, [playbackPosition, playing, timelineModel.totalSpan, setTransportPlaybackPosition, setTransportPlaying])

  const handleReset = React.useCallback(() => {
    setTransportPlaying(false)
    setTransportPlaybackPosition(0)
  }, [setTransportPlaybackPosition, setTransportPlaying])

  const handleStepBeat = React.useCallback(
    (direction: -1 | 1) => {
      if (timelineModel.beats.length === 0) return
      const nextIndex = clamp(activeBeatIndex + direction, 0, timelineModel.beats.length - 1)
      const nextBeat = timelineModel.beats[nextIndex]
      if (!nextBeat) return
      setTransportPlaying(false)
      setTransportPlaybackPosition(nextBeat.displayStart)
    },
    [activeBeatIndex, timelineModel.beats, setTransportPlaybackPosition, setTransportPlaying],
  )

  const handleFocusBeat = React.useCallback((beat: AnimaticTimelineBeat) => {
    setTransportPlaying(false)
    setTransportPlaybackPosition(beat.displayStart)
  }, [setTransportPlaybackPosition, setTransportPlaying])

  const handleFocusLaneFromBeatCard = React.useCallback((laneId: AnimaticTimelineLaneId) => {
    const row = laneRowRefs.current[laneId]
    if (!row) return
    setSelectedLaneId(laneId)
    row.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    })
    setHighlightedLaneShortcutId(laneId)
    if (laneShortcutHighlightTimeoutRef.current != null) {
      window.clearTimeout(laneShortcutHighlightTimeoutRef.current)
    }
    laneShortcutHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedLaneShortcutId(current => (current === laneId ? null : current))
      laneShortcutHighlightTimeoutRef.current = null
    }, 1600)
  }, [])

  const handleFocusLaneOption = React.useCallback((laneId: AnimaticTimelineLaneId) => {
    setSelectedLaneId(laneId)
    laneOptionRefs.current[laneId]?.focus()
  }, [])

  const handleFocusBeatOption = React.useCallback((beat: AnimaticTimelineBeat | null | undefined) => {
    if (!beat) return
    handleFocusBeat(beat)
    beatOptionRefs.current[beat.beatRef]?.focus()
  }, [handleFocusBeat])

  const handleFocusLaneItemOption = React.useCallback((nodeId: string) => {
    setSelectedItemNodeId(nodeId)
    laneItemOptionRefs.current[nodeId]?.focus()
  }, [])

  const handleInsertBeatAtTarget = React.useCallback(
    async (targetBeat: AnimaticTimelineBeat | null | undefined, position: 'before' | 'after' = 'after') => {
      const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
      const insertResult = insertAnimaticTimelineBeatRecord({
        frontmatterMeta: nextFrontmatterMeta,
        model: timelineModel,
        insertAfterBeatRef:
          position === 'after'
            ? targetBeat?.beatRef || activeBeat?.beatRef || timelineModel.beats[timelineModel.beats.length - 1]?.beatRef || null
            : null,
        insertBeforeBeatRef:
          position === 'before'
            ? targetBeat?.beatRef || activeBeat?.beatRef || timelineModel.beats[0]?.beatRef || null
            : null,
        snapStepMs: timelineModel.usesAbsoluteTiming ? snapStepMs : null,
      })
      commitTimelineFrontmatterMeta(nextFrontmatterMeta)
      setTransportPlaying(false)
      const insertedBeat = applyAnimaticTimelineBeatTimingOverrides(baseTimelineModel, timingOverrides).beats.find(beat => beat.beatRef === insertResult.beatRef)
      if (insertedBeat) {
        setTransportPlaybackPosition(insertedBeat.displayStart)
      }
    },
    [activeBeat?.beatRef, baseTimelineModel, commitTimelineFrontmatterMeta, markdownText, setTransportPlaybackPosition, setTransportPlaying, snapStepMs, timelineModel, timingOverrides],
  )

  const handleInsertBeat = React.useCallback(
    async (position: 'before' | 'after' = 'after') => {
      await handleInsertBeatAtTarget(activeBeat, position)
    },
    [activeBeat, handleInsertBeatAtTarget],
  )

  const handleDeleteBeat = React.useCallback(async () => {
    if (!activeBeat || activeBeat.items.length > 0) return
    const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
    const deleted = deleteAnimaticTimelineBeatRecord({
      frontmatterMeta: nextFrontmatterMeta,
      model: timelineModel,
      beatRef: activeBeat.beatRef,
    })
    if (!deleted) return
    commitTimelineFrontmatterMeta(nextFrontmatterMeta)
    setTransportPlaying(false)
    const fallbackBeat = timelineModel.beats[Math.max(0, activeBeatIndex - 1)]
    setTransportPlaybackPosition(fallbackBeat?.displayStart ?? 0)
  }, [activeBeat, activeBeatIndex, commitTimelineFrontmatterMeta, markdownText, setTransportPlaybackPosition, setTransportPlaying, timelineModel])

  const handleDeleteBeatAtTarget = React.useCallback(
    async (targetBeat: AnimaticTimelineBeat | null | undefined) => {
      const beat = targetBeat || activeBeat
      if (!beat || beat.items.length > 0) return
      const beatIndex = timelineModel.beats.findIndex(entry => entry.beatRef === beat.beatRef)
      const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
      const deleted = deleteAnimaticTimelineBeatRecord({
        frontmatterMeta: nextFrontmatterMeta,
        model: timelineModel,
        beatRef: beat.beatRef,
      })
      if (!deleted) return
      commitTimelineFrontmatterMeta(nextFrontmatterMeta)
      setTransportPlaying(false)
      const fallbackBeat = timelineModel.beats[Math.max(0, beatIndex - 1)]
      setTransportPlaybackPosition(fallbackBeat?.displayStart ?? 0)
    },
    [activeBeat, commitTimelineFrontmatterMeta, markdownText, setTransportPlaybackPosition, setTransportPlaying, timelineModel],
  )

  const handleDuplicateBeatAtTarget = React.useCallback(
    async (targetBeat: AnimaticTimelineBeat | null | undefined) => {
      const beatRef = String(targetBeat?.beatRef || activeBeat?.beatRef || '').trim()
      if (!beatRef) return
      const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
      const duplicateResult = duplicateAnimaticTimelineBeatRecord({
        frontmatterMeta: nextFrontmatterMeta,
        model: timelineModel,
        beatRef,
        snapStepMs: timelineModel.usesAbsoluteTiming ? snapStepMs : null,
      })
      if (!duplicateResult.beatRef) return
      commitTimelineFrontmatterMeta(nextFrontmatterMeta)
      setTransportPlaying(false)
      const duplicatedBeat = applyAnimaticTimelineBeatTimingOverrides(baseTimelineModel, timingOverrides).beats.find(beat => beat.beatRef === duplicateResult.beatRef)
      if (duplicatedBeat) setTransportPlaybackPosition(duplicatedBeat.displayStart)
    },
    [activeBeat?.beatRef, baseTimelineModel, commitTimelineFrontmatterMeta, markdownText, setTransportPlaybackPosition, setTransportPlaying, snapStepMs, timelineModel, timingOverrides],
  )

  const handleDuplicateBeat = React.useCallback(async () => {
    await handleDuplicateBeatAtTarget(activeBeat)
  }, [activeBeat, handleDuplicateBeatAtTarget])

  const handleSplitBeatAtTarget = React.useCallback(
    async (targetBeat: AnimaticTimelineBeat | null | undefined) => {
      const beat = targetBeat || activeBeat
      if (!beat || beat.startMs == null || beat.endMs == null) return
      if (beat.endMs - beat.startMs < EDIT_MIN_DURATION_MS * 2) return
      const midpointMs = beat.startMs + (beat.endMs - beat.startMs) * 0.5
      const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
      const splitResult = splitAnimaticTimelineBeatRecord({
        frontmatterMeta: nextFrontmatterMeta,
        model: timelineModel,
        beatRef: beat.beatRef,
        splitAtMs: midpointMs,
        minDurationMs: EDIT_MIN_DURATION_MS,
        snapStepMs: snapEnabled ? snapStepMs : null,
      })
      if (!splitResult.beatRef) return
      commitTimelineFrontmatterMeta(nextFrontmatterMeta)
      setTransportPlaying(false)
      const splitBeat = applyAnimaticTimelineBeatTimingOverrides(baseTimelineModel, timingOverrides).beats.find(entry => entry.beatRef === splitResult.beatRef)
      if (splitBeat) setTransportPlaybackPosition(splitBeat.displayStart)
    },
    [activeBeat, baseTimelineModel, commitTimelineFrontmatterMeta, markdownText, setTransportPlaybackPosition, setTransportPlaying, snapEnabled, snapStepMs, timelineModel, timingOverrides],
  )

  const handleSplitBeat = React.useCallback(async () => {
    if (!activeBeat || !canSplitActiveBeat) return
    const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
    const splitResult = splitAnimaticTimelineBeatRecord({
      frontmatterMeta: nextFrontmatterMeta,
      model: timelineModel,
      beatRef: activeBeat.beatRef,
      splitAtMs: snappedPlaybackPosition,
      minDurationMs: EDIT_MIN_DURATION_MS,
      snapStepMs: snapEnabled ? snapStepMs : null,
    })
    if (!splitResult.beatRef) return
    commitTimelineFrontmatterMeta(nextFrontmatterMeta)
    setTransportPlaying(false)
    const splitBeat = applyAnimaticTimelineBeatTimingOverrides(baseTimelineModel, timingOverrides).beats.find(beat => beat.beatRef === splitResult.beatRef)
    if (splitBeat) setTransportPlaybackPosition(splitBeat.displayStart)
  }, [activeBeat, baseTimelineModel, canSplitActiveBeat, commitTimelineFrontmatterMeta, markdownText, setTransportPlaybackPosition, setTransportPlaying, snapEnabled, snapStepMs, snappedPlaybackPosition, timelineModel, timingOverrides])

  const handleMergeBeatWithNext = React.useCallback(async () => {
    if (!activeBeat || !canMergeActiveBeatWithNext) return
    const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
    const merged = mergeAnimaticTimelineBeatWithNextRecord({
      frontmatterMeta: nextFrontmatterMeta,
      model: timelineModel,
      beatRef: activeBeat.beatRef,
    })
    if (!merged) return
    commitTimelineFrontmatterMeta(nextFrontmatterMeta)
    setTransportPlaying(false)
    setTransportPlaybackPosition(activeBeat.displayStart)
  }, [activeBeat, canMergeActiveBeatWithNext, commitTimelineFrontmatterMeta, markdownText, setTransportPlaybackPosition, setTransportPlaying, timelineModel])

  const handleMergeBeatWithNextAtTarget = React.useCallback(
    async (targetBeat: AnimaticTimelineBeat | null | undefined) => {
      const beat = targetBeat || activeBeat
      if (!beat) return
      const beatIndex = timelineModel.beats.findIndex(entry => entry.beatRef === beat.beatRef)
      const nextBeat = beatIndex >= 0 ? timelineModel.beats[beatIndex + 1] || null : null
      const canMergeAtTarget =
        timelineModel.usesAbsoluteTiming &&
        beat.startMs != null &&
        nextBeat?.endMs != null &&
        (nextBeat?.items.length || 0) === 0
      if (!canMergeAtTarget) return
      const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
      const merged = mergeAnimaticTimelineBeatWithNextRecord({
        frontmatterMeta: nextFrontmatterMeta,
        model: timelineModel,
        beatRef: beat.beatRef,
      })
      if (!merged) return
      commitTimelineFrontmatterMeta(nextFrontmatterMeta)
      setTransportPlaying(false)
      setTransportPlaybackPosition(beat.displayStart)
    },
    [activeBeat, commitTimelineFrontmatterMeta, markdownText, setTransportPlaybackPosition, setTransportPlaying, timelineModel],
  )

  const handleRemoveGapBeforeBeat = React.useCallback(async () => {
    if (!activeBeat || !canRemoveGapBeforeActiveBeat) return
    const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
    const removed = removeAnimaticTimelineGapBeforeBeatRecord({
      frontmatterMeta: nextFrontmatterMeta,
      model: timelineModel,
      beatRef: activeBeat.beatRef,
    })
    if (!removed) return
    commitTimelineFrontmatterMeta(nextFrontmatterMeta)
    setTransportPlaying(false)
    setTransportPlaybackPosition(Math.max(0, playbackPosition - activeGapBeforeMs))
  }, [activeBeat, activeGapBeforeMs, canRemoveGapBeforeActiveBeat, commitTimelineFrontmatterMeta, markdownText, playbackPosition, setTransportPlaybackPosition, setTransportPlaying, timelineModel])

  const handleRemoveGapBeforeBeatAtTarget = React.useCallback(
    async (targetBeat: AnimaticTimelineBeat | null | undefined) => {
      const beat = targetBeat || activeBeat
      if (!beat || beat.startMs == null) return
      const beatIndex = timelineModel.beats.findIndex(entry => entry.beatRef === beat.beatRef)
      if (beatIndex <= 0) return
      const previousBeat = timelineModel.beats[beatIndex - 1] || null
      const gapBeforeBeatMs =
        timelineModel.usesAbsoluteTiming && previousBeat?.endMs != null ? Math.max(0, beat.startMs - previousBeat.endMs) : 0
      if (gapBeforeBeatMs <= 0) return
      const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
      const removed = removeAnimaticTimelineGapBeforeBeatRecord({
        frontmatterMeta: nextFrontmatterMeta,
        model: timelineModel,
        beatRef: beat.beatRef,
      })
      if (!removed) return
      commitTimelineFrontmatterMeta(nextFrontmatterMeta)
      setTransportPlaying(false)
      setTransportPlaybackPosition(Math.max(0, beat.displayStart - gapBeforeBeatMs))
    },
    [activeBeat, commitTimelineFrontmatterMeta, markdownText, setTransportPlaybackPosition, setTransportPlaying, timelineModel],
  )

  const beginBeatFieldEdit = React.useCallback((beat: AnimaticTimelineBeat, field: AnimaticBeatEditableField) => {
    beatEditRequestKeyRef.current += 1
    setBeatEditSession({
      beatRef: beat.beatRef,
      field,
      requestKey: beatEditRequestKeyRef.current,
    })
  }, [])

  const clearBeatFieldEdit = React.useCallback((args?: { beatRef?: string; field?: AnimaticBeatEditableField }) => {
    setBeatEditSession(current => {
      if (!current) return null
      if (args?.beatRef && current.beatRef !== args.beatRef) return current
      if (args?.field && current.field !== args.field) return current
      return null
    })
  }, [])

  const handleBeatFieldEditingChange = React.useCallback((args: {
    beatRef: string
    field: AnimaticBeatEditableField
    editing: boolean
  }) => {
    if (args.editing) return
    clearBeatFieldEdit({
      beatRef: args.beatRef,
      field: args.field,
    })
  }, [clearBeatFieldEdit])

  const handleCommitBeatFieldEdit = React.useCallback(async (args: {
    beatRef: string
    field: AnimaticBeatEditableField
    nextValue: string
  }) => {
    const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
    updateAnimaticTimelineBeatRecordField({
      frontmatterMeta: nextFrontmatterMeta,
      beatRef: args.beatRef,
      field: args.field,
      nextValue: args.nextValue,
    })
    updateGraphMetadata({
      frontmatterMeta: nextFrontmatterMeta as never,
    })
    clearBeatFieldEdit({
      beatRef: args.beatRef,
      field: args.field,
    })
  }, [clearBeatFieldEdit, markdownText, updateGraphMetadata])

  const handleStartBeatLabelEdit = React.useCallback((beat: AnimaticTimelineBeat) => {
    beginBeatFieldEdit(beat, 'label')
  }, [beginBeatFieldEdit])

  const handleStartBeatNoteEdit = React.useCallback((beat: AnimaticTimelineBeat) => {
    beginBeatFieldEdit(beat, 'note')
  }, [beginBeatFieldEdit])

  const handleStartBeatSummaryEdit = React.useCallback((beat: AnimaticTimelineBeat) => {
    beginBeatFieldEdit(beat, 'summary')
  }, [beginBeatFieldEdit])

  const handleStartBeatTagsEdit = React.useCallback((beat: AnimaticTimelineBeat) => {
    beginBeatFieldEdit(beat, 'tags')
  }, [beginBeatFieldEdit])

  const handleStartBeatSummaryQuickEdit = React.useCallback((beat: AnimaticTimelineBeat) => {
    handleFocusBeat(beat)
    handleStartBeatSummaryEdit(beat)
  }, [handleFocusBeat, handleStartBeatSummaryEdit])

  const handleStartBeatLabelQuickEdit = React.useCallback((beat: AnimaticTimelineBeat) => {
    handleFocusBeat(beat)
    handleStartBeatLabelEdit(beat)
  }, [handleFocusBeat, handleStartBeatLabelEdit])

  const handleInsertBeatBeforeQuick = React.useCallback((beat: AnimaticTimelineBeat) => {
    void handleInsertBeatAtTarget(beat, 'before')
  }, [handleInsertBeatAtTarget])

  const handleInsertBeatAfterQuick = React.useCallback((beat: AnimaticTimelineBeat) => {
    void handleInsertBeatAtTarget(beat, 'after')
  }, [handleInsertBeatAtTarget])

  const handleDeleteBeatQuick = React.useCallback((beat: AnimaticTimelineBeat) => {
    void handleDeleteBeatAtTarget(beat)
  }, [handleDeleteBeatAtTarget])

  const handleDuplicateBeatQuick = React.useCallback((beat: AnimaticTimelineBeat) => {
    void handleDuplicateBeatAtTarget(beat)
  }, [handleDuplicateBeatAtTarget])

  const handleSplitBeatQuick = React.useCallback((beat: AnimaticTimelineBeat) => {
    void handleSplitBeatAtTarget(beat)
  }, [handleSplitBeatAtTarget])

  const handleMergeBeatWithNextQuick = React.useCallback((beat: AnimaticTimelineBeat) => {
    void handleMergeBeatWithNextAtTarget(beat)
  }, [handleMergeBeatWithNextAtTarget])

  const handleRemoveGapBeforeBeatQuick = React.useCallback((beat: AnimaticTimelineBeat) => {
    void handleRemoveGapBeforeBeatAtTarget(beat)
  }, [handleRemoveGapBeforeBeatAtTarget])

  const handleStartBeatNoteQuickEdit = React.useCallback((beat: AnimaticTimelineBeat) => {
    handleFocusBeat(beat)
    handleStartBeatNoteEdit(beat)
  }, [handleFocusBeat, handleStartBeatNoteEdit])

  const handleStartBeatTagsQuickEdit = React.useCallback((beat: AnimaticTimelineBeat) => {
    handleFocusBeat(beat)
    handleStartBeatTagsEdit(beat)
  }, [handleFocusBeat, handleStartBeatTagsEdit])

  React.useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveAnimaticTimelineHotkeyAction(event)
      if (!action) return
      const targetElement =
        event.target instanceof HTMLElement
          ? (event.target.closest('input, textarea, select, button, a[href], [role="textbox"], [contenteditable="true"]') as HTMLElement | null) ||
            event.target
          : null
      if (
        shouldIgnoreAnimaticTimelineHotkeys({
          defaultPrevented: event.defaultPrevented,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          editingBeat: !!currentEditingBeatRef,
          dragging: !!dragState,
          targetTagName: targetElement?.tagName,
          targetRole: targetElement?.getAttribute('role'),
          targetContentEditable: targetElement?.isContentEditable,
        })
      ) {
        return
      }
      if (event.repeat && isAnimaticTimelineMutationHotkeyAction(action)) return
      event.preventDefault()
      if (action === 'toggle-playback') {
        handleTogglePlayback()
        return
      }
      if (action === 'step-prev-beat') {
        handleStepBeat(-1)
        return
      }
      if (action === 'step-next-beat') {
        handleStepBeat(1)
        return
      }
      if (action === 'reset-playhead') {
        handleReset()
        return
      }
      if (action === 'duplicate-beat') {
        void handleDuplicateBeat()
        return
      }
      if (action === 'split-beat') {
        void handleSplitBeat()
        return
      }
      if (!activeBeat) return
      if (action === 'edit-beat-label') {
        handleStartBeatLabelEdit(activeBeat)
        return
      }
      if (action === 'edit-beat-note') {
        handleStartBeatNoteEdit(activeBeat)
        return
      }
      if (action === 'edit-beat-summary') {
        handleStartBeatSummaryEdit(activeBeat)
        return
      }
      if (action === 'edit-beat-tags') {
        handleStartBeatTagsEdit(activeBeat)
        return
      }
      if (!selectedLane) return
      if (action === 'toggle-lane-hidden') {
        void handleToggleHiddenLane(selectedLane.id)
        return
      }
      if (action === 'toggle-lane-muted') {
        void handleToggleMutedLane(selectedLane.id)
        return
      }
      if (action === 'toggle-lane-solo') {
        void handleToggleSoloLane(selectedLane.id)
        return
      }
      if (action === 'move-lane-up') {
        void handleReorderLane(selectedLane.id, -1)
        return
      }
      if (action === 'move-lane-down') {
        void handleReorderLane(selectedLane.id, 1)
        return
      }
      if (!selectedItemContext) return
      if (action === 'move-selected-item-prev-beat') {
        void handleMoveItemToBeat(selectedItemContext, selectedItemContext.previousBeat)
        return
      }
      if (action === 'move-selected-item-next-beat') {
        void handleMoveItemToBeat(selectedItemContext, selectedItemContext.nextBeat)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    active,
    activeBeat,
    currentEditingBeatRef,
    dragState,
    handleDuplicateBeat,
    handleReset,
    handleSplitBeat,
    handleStartBeatLabelEdit,
    handleStartBeatNoteEdit,
    handleStartBeatSummaryEdit,
    handleStartBeatTagsEdit,
    handleReorderLane,
    handleMoveItemToBeat,
    handleStepBeat,
    handleToggleHiddenLane,
    handleToggleMutedLane,
    handleToggleSoloLane,
    handleTogglePlayback,
    selectedItemContext,
    selectedLane,
  ])

  const handleBeatPointerStart = React.useCallback(
    (event: React.PointerEvent<HTMLElement>, beat: AnimaticTimelineBeat, beatIndex: number, mode: AnimaticBeatDragState['mode']) => {
      if (!timelineModel.usesAbsoluteTiming) return
      if (beat.startMs == null || beat.endMs == null) return
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      const scrollLeft = scrollRef.current?.scrollLeft || 0
      dragDeltaPxRef.current = 0
      dragPointerClientXRef.current = event.clientX
      dragEdgeScrollDirectionRef.current = 0
      ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
      setTransportPlaying(false)
      setDragState({
        kind: 'beat',
        sessionId: dragSessionIdRef.current,
        beatRef: beat.beatRef,
        beatIndex,
        mode,
        pointerId: event.pointerId,
        originClientX: event.clientX,
        originScrollLeft: scrollLeft,
        markdownDocumentName,
        markdownText,
        beatsSnapshot: timelineModel.beats.map(entry => ({ ...entry, items: entry.items.slice() })),
      })
    },
    [markdownDocumentName, markdownText, setTransportPlaying, timelineModel.beats, timelineModel.usesAbsoluteTiming],
  )

  const handleLaneItemPointerStart = React.useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      laneId: AnimaticTimelineLaneId,
      beat: AnimaticTimelineBeat,
      itemNodeId: string,
      itemTitle: string,
    ) => {
      if (shouldIgnoreTimelineActionPointerMoveStart(event.target)) return
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      const scrollLeft = scrollRef.current?.scrollLeft || 0
      dragDeltaPxRef.current = 0
      dragPointerClientXRef.current = event.clientX
      dragEdgeScrollDirectionRef.current = 0
      ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
      setTransportPlaying(false)
      setSelectedLaneId(laneId)
      setSelectedItemNodeId(itemNodeId)
      setLaneItemDragPreviewOffsetPx(0)
      setDragState({
        kind: 'item',
        sessionId: dragSessionIdRef.current,
        itemNodeId,
        itemTitle,
        laneId,
        sourceBeatRef: beat.beatRef,
        pointerId: event.pointerId,
        originClientX: event.clientX,
        originScrollLeft: scrollLeft,
        markdownDocumentName,
        markdownText,
      })
    },
    [markdownDocumentName, markdownText, setTransportPlaying],
  )

  React.useEffect(() => {
    if (!dragState || !timelineModel.usesAbsoluteTiming || timelineUnitsPerPixel <= 0) return
    const updateDragPreview = (clientX: number) => {
      const scrollEl = scrollRef.current
      const currentScrollLeft = scrollEl?.scrollLeft || 0
      const deltaPx = clientX - dragState.originClientX + (currentScrollLeft - dragState.originScrollLeft)
      dragDeltaPxRef.current = Math.max(dragDeltaPxRef.current, Math.abs(deltaPx))
      if (dragState.kind === 'item') {
        setLaneItemDragPreviewOffsetPx(deltaPx)
        return
      }
      const deltaMs = deltaPx * timelineUnitsPerPixel
      const nextOverrides = resolveAnimaticTimelineBeatTimingEdit({
        beats: dragState.beatsSnapshot,
        beatIndex: dragState.beatIndex,
        mode: dragState.mode,
        deltaMs,
        minDurationMs: EDIT_MIN_DURATION_MS,
        snapStepMs: snapEnabled ? snapStepMs : null,
      })
      if (!nextOverrides) return
      setTimingOverrides(prev => {
        if (areTimingOverrideRecordsEqual(prev, nextOverrides)) return prev
        return nextOverrides
      })
    }
    const updateDragEdgeScrollDirection = (clientX: number) => {
      const scrollEl = scrollRef.current
      if (!scrollEl) {
        dragEdgeScrollDirectionRef.current = 0
        return
      }
      const rect = scrollEl.getBoundingClientRect()
      const maxScrollLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth)
      if (clientX < rect.left + DRAG_EDGE_SCROLL_THRESHOLD_PX && scrollEl.scrollLeft > 0) {
        dragEdgeScrollDirectionRef.current = -1
        return
      }
      if (clientX > rect.right - DRAG_EDGE_SCROLL_THRESHOLD_PX && scrollEl.scrollLeft < maxScrollLeft) {
        dragEdgeScrollDirectionRef.current = 1
        return
      }
      dragEdgeScrollDirectionRef.current = 0
    }
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return
      dragPointerClientXRef.current = event.clientX
      updateDragEdgeScrollDirection(event.clientX)
      updateDragPreview(event.clientX)
    }
    const commitDrag = async (pointerClientX: number | null) => {
      const overrides = timingOverridesRef.current
      setDragState(null)
      setLaneItemDragPreviewOffsetPx(0)
      if (dragState.sessionId !== dragSessionIdRef.current) {
        setTimingOverrides({})
        timingOverridesRef.current = {}
        dragDeltaPxRef.current = 0
        dragPointerClientXRef.current = null
        dragEdgeScrollDirectionRef.current = 0
        return
      }
      if (dragState.markdownDocumentName !== markdownDocumentName || dragState.markdownText !== markdownText) {
        setTimingOverrides({})
        timingOverridesRef.current = {}
        dragDeltaPxRef.current = 0
        dragPointerClientXRef.current = null
        dragEdgeScrollDirectionRef.current = 0
        return
      }
      if (dragDeltaPxRef.current < DRAG_COMMIT_MIN_DELTA_PX) {
        setTimingOverrides({})
        timingOverridesRef.current = {}
        dragDeltaPxRef.current = 0
        dragPointerClientXRef.current = null
        dragEdgeScrollDirectionRef.current = 0
        return
      }
      if (dragState.kind === 'item') {
        const nextBeat = resolveBeatAtLaneTrackClientX(dragState.laneId, pointerClientX ?? dragState.originClientX)
        dragDeltaPxRef.current = 0
        dragPointerClientXRef.current = null
        dragEdgeScrollDirectionRef.current = 0
        if (!nextBeat || nextBeat.beatRef === dragState.sourceBeatRef) return
        await handleMoveItemToBeat(
          {
            nodeId: dragState.itemNodeId,
            title: dragState.itemTitle,
            laneId: dragState.laneId,
            beatRef: dragState.sourceBeatRef,
          },
          nextBeat,
        )
        return
      }
      if (!overrides[dragState.beatRef]) {
        setTimingOverrides({})
        timingOverridesRef.current = {}
        dragDeltaPxRef.current = 0
        dragPointerClientXRef.current = null
        dragEdgeScrollDirectionRef.current = 0
        return
      }
      const nextFrontmatterMeta = cloneAnimaticTimelineFrontmatterMeta(markdownText)
      updateAnimaticTimelineBeatTimingOverrideRecords({
        frontmatterMeta: nextFrontmatterMeta,
        overrides,
      })
      commitTimelineFrontmatterMeta(nextFrontmatterMeta)
      setTimingOverrides({})
      timingOverridesRef.current = {}
      dragDeltaPxRef.current = 0
      dragPointerClientXRef.current = null
      dragEdgeScrollDirectionRef.current = 0
    }
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return
      const pointerClientX = dragPointerClientXRef.current ?? event.clientX
      void commitDrag(pointerClientX)
    }
    let animationFrameId = 0
    const tick = () => {
      const scrollEl = scrollRef.current
      const pointerClientX = dragPointerClientXRef.current
      const direction = dragEdgeScrollDirectionRef.current
      if (scrollEl && pointerClientX != null && direction !== 0) {
        const maxScrollLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth)
        const nextScrollLeft = clamp(scrollEl.scrollLeft + direction * DRAG_EDGE_SCROLL_STEP_PX, 0, maxScrollLeft)
        if (nextScrollLeft !== scrollEl.scrollLeft) {
          scrollEl.scrollLeft = nextScrollLeft
          updateDragEdgeScrollDirection(pointerClientX)
          updateDragPreview(pointerClientX)
        } else {
          dragEdgeScrollDirectionRef.current = 0
        }
      }
      animationFrameId = window.requestAnimationFrame(tick)
    }
    animationFrameId = window.requestAnimationFrame(tick)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerup', onPointerUp, { passive: true })
    window.addEventListener('pointercancel', onPointerUp, { passive: true })
    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [
    commitTimelineFrontmatterMeta,
    dragState,
    handleMoveItemToBeat,
    markdownText,
    resolveBeatAtLaneTrackClientX,
    snapEnabled,
    snapStepMs,
    timelineModel.usesAbsoluteTiming,
    timelineUnitsPerPixel,
  ])

  if (!timelineEnabled) {
    return (
      <section className="w-full h-full bg-[#0b0f17] text-slate-100" data-kg-timeline-disabled="1">
        <section className="h-full w-full flex items-center justify-center p-8">
          <section className="max-w-xl rounded border border-slate-800 bg-slate-900/85 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold">Timeline Off</h2>
          </section>
        </section>
      </section>
    )
  }

  if (!timelineModel.beats.length) {
    return (
      <section className="w-full h-full bg-[#0b0f17] text-slate-100">
        <section className="h-full w-full flex items-center justify-center p-8">
          <section className="max-w-xl rounded-2xl border border-slate-800 bg-slate-900/85 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold">2D Renderer: Animatic</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Add beat-linked graph nodes or provide <code> timeline.beats </code> in Markdown frontmatter to populate the native timeline surface.
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              This renderer reads the current workspace graph and Markdown document directly. It does not ship fixture-only demo rows.
            </p>
          </section>
        </section>
      </section>
    )
  }

  return (
    <section className="timeline-bottom-panel w-full h-full bg-[#0b0f17] text-slate-100 select-none">
      <section className="flex h-full min-h-0 flex-col">
        <header className="timeline-bottom-panel-header shrink-0 border-b border-slate-800 bg-[#0f1625]/95 px-4 pt-4 pb-2 backdrop-blur">
          <section className="player-config">
            <button
              type="button"
              role="switch"
              aria-checked={runtimeAutoScrollEnabled}
              className={runtimeAutoScrollEnabled ? 'ant-switch ant-switch-checked' : 'ant-switch'}
              ant-click-animating="true"
              onClick={() => setRuntimeAutoScrollEnabled(current => !current)}
            >
              <section className="ant-switch-handle"></section>
              <span className="ant-switch-inner">Enable Runtime Auto Scroll</span>
              <section className="ant-click-animating-node"></section>
            </button>
          </section>
          <TimelineTransportControls
            ariaLabel="Animation timeline playhead"
            currentLabel={currentTimeLabel}
            max={timelineModel.totalSpan || 0}
            playbackRate={playbackRate}
            playbackRates={TIMELINE_TRANSPORT_PLAYBACK_RATES}
            playing={playing}
            rangeClassName="mt-3"
            step={timelineModel.usesAbsoluteTiming ? 10 : 0.01}
            totalLabel={totalTimeLabel}
            value={playbackPosition}
            onPlaybackRateChange={setTransportPlaybackRate}
            onTogglePlayback={handleTogglePlayback}
            onValueChange={nextValue => {
              setTransportPlaying(false)
              setTransportPlaybackPosition(nextValue)
            }}
          />
          <section className="timeline-tool-strip mt-2 flex flex-wrap items-center gap-1.5">
            <IconButton title="Prev Beat (Left Arrow)" showTooltip className={getTimelineCompactIconButtonClassName(true)} onClick={() => handleStepBeat(-1)}>
              <SkipBack className={compactToolbarIconClassName} />
            </IconButton>
            <IconButton title="Next Beat (Right Arrow)" showTooltip className={getTimelineCompactIconButtonClassName(true)} onClick={() => handleStepBeat(1)}>
              <SkipForward className={compactToolbarIconClassName} />
            </IconButton>
            <IconButton title="Reset (R)" showTooltip className={getTimelineCompactIconButtonClassName(true)} onClick={handleReset}>
              <RotateCcw className={compactToolbarIconClassName} />
            </IconButton>
            <IconButton title="Insert Before" showTooltip className={getTimelineCompactIconButtonClassName(!!activeBeat || timelineModel.beats.length > 0)} onClick={() => void handleInsertBeat('before')}>
              <ArrowLeftToLine className={compactToolbarIconClassName} />
            </IconButton>
            <IconButton title="Insert After" showTooltip className={getTimelineCompactIconButtonClassName(!!activeBeat || timelineModel.beats.length > 0)} onClick={() => void handleInsertBeat('after')}>
              <ArrowRightToLine className={compactToolbarIconClassName} />
            </IconButton>
            <IconButton
              title={canSplitActiveBeat ? 'Split active beat at playhead (S)' : 'Move the playhead inside the active beat to split it (S)'}
              showTooltip
              className={getTimelineCompactIconButtonClassName(canSplitActiveBeat)}
              onClick={() => void handleSplitBeat()}
              disabled={!canSplitActiveBeat}
            >
              <Scissors className={compactToolbarIconClassName} />
            </IconButton>
            <IconButton
              title={activeBeat ? 'Duplicate active beat after the current beat (D)' : 'Select an active beat first (D)'}
              showTooltip
              className={getTimelineCompactIconButtonClassName(!!activeBeat)}
              onClick={() => void handleDuplicateBeat()}
              disabled={!activeBeat}
            >
              <Copy className={compactToolbarIconClassName} />
            </IconButton>
            <IconButton
              title={canMergeActiveBeatWithNext ? 'Merge active beat with next empty beat' : 'Merge is available only when the next beat is empty'}
              showTooltip
              className={getTimelineCompactIconButtonClassName(canMergeActiveBeatWithNext)}
              onClick={() => void handleMergeBeatWithNext()}
              disabled={!canMergeActiveBeatWithNext}
            >
              <GitMerge className={compactToolbarIconClassName} />
            </IconButton>
            <IconButton
              title={
                canRemoveGapBeforeActiveBeat
                  ? `Remove ${Math.round(activeGapBeforeMs)}ms gap before active beat`
                  : 'Remove Gap is available only when a positive gap exists before the active beat'
              }
              showTooltip
              className={getTimelineCompactIconButtonClassName(canRemoveGapBeforeActiveBeat)}
              onClick={() => void handleRemoveGapBeforeBeat()}
              disabled={!canRemoveGapBeforeActiveBeat}
            >
              <ArrowLeftToLine className={compactToolbarIconClassName} />
            </IconButton>
            <IconButton
              title={canDeleteActiveBeat ? 'Delete active beat' : 'Delete is available only for empty beats'}
              showTooltip
              className={getTimelineCompactIconButtonClassName(canDeleteActiveBeat)}
              onClick={() => void handleDeleteBeat()}
              disabled={!canDeleteActiveBeat}
            >
              <Trash2 className={compactToolbarIconClassName} />
            </IconButton>
            <section className="flex h-7 items-center overflow-hidden rounded-md border border-slate-800 bg-slate-950/80">
              <button
                type="button"
                className={`h-full px-2 text-xs font-medium transition ${
                  snapEnabled ? 'bg-cyan-500/18 text-cyan-50' : 'text-slate-400 hover:bg-slate-900'
                }`}
                onClick={() => setSnapEnabled(current => !current)}
              >
                Snap {snapEnabled ? 'On' : 'Off'}
              </button>
              {SNAP_STEP_OPTIONS_MS.map(step => (
                <button
                  key={step}
                  type="button"
                  className={`h-full px-2 text-xs font-medium transition ${
                    snapStepMs === step ? 'bg-cyan-500/18 text-cyan-50' : 'text-slate-300 hover:bg-slate-900'
                  }`}
                  onClick={() => setSnapStepMs(step)}
                >
                  {step}ms
                </button>
              ))}
            </section>
            <section className="timeline-status-strip ml-auto flex items-center gap-1.5 text-sm text-slate-300">
              {timelineModel.usesAbsoluteTiming ? (
                <span className={getTimelineCompactStatusChipClassName()}>
                  Grid {snapStepMs}ms
                </span>
              ) : null}
              {activeBeat ? (
                <section className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-300">
                  <IconButton title={`Rename ${activeBeat.label} (L)`} showTooltip className={getTimelineIconButtonClassName(true)} onClick={() => handleStartBeatLabelEdit(activeBeat)}>
                    <Pencil className={toolbarIconClassName} />
                  </IconButton>
                  <span className="max-w-32 truncate text-xs text-slate-400">{activeBeat.label}</span>
                </section>
              ) : null}
              {activeBeat ? (
                <section className="flex items-start gap-1 rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-300">
                  <IconButton title={activeBeat.note ? 'Edit beat note (N)' : 'Add beat note (N)'} showTooltip className={getTimelineIconButtonClassName(true)} onClick={() => handleStartBeatNoteEdit(activeBeat)}>
                    <FileText className={toolbarIconClassName} />
                  </IconButton>
                  <CardInlineTextEditor
                    value={activeBeat.note}
                    ariaLabel="Active beat note"
                    placeholder="Add beat note"
                    canEdit
                    editRequestKey={getBeatFieldEditRequestKey(activeBeat.beatRef, 'note')}
                    multiline
                    rows={3}
                    onCommit={nextValue => {
                      void handleCommitBeatFieldEdit({
                        beatRef: activeBeat.beatRef,
                        field: 'note',
                        nextValue,
                      })
                    }}
                    onEditingChange={editing => {
                      handleBeatFieldEditingChange({
                        beatRef: activeBeat.beatRef,
                        field: 'note',
                        editing,
                      })
                    }}
                    displayClassName="max-w-32 truncate text-xs leading-4 text-slate-400"
                    editorClassName="min-h-16 w-52 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none"
                  />
                </section>
              ) : null}
              {activeBeat ? (
                <section className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-300">
                  <IconButton title={activeBeat.summary ? 'Edit beat summary (M)' : 'Add beat summary (M)'} showTooltip className={getTimelineIconButtonClassName(true)} onClick={() => handleStartBeatSummaryEdit(activeBeat)}>
                    <AlignLeft className={toolbarIconClassName} />
                  </IconButton>
                  {activeBeat.summary ? <span className="max-w-36 truncate text-xs text-slate-400">{activeBeat.summary}</span> : null}
                </section>
              ) : null}
              {activeBeat ? (
                <section className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-300">
                  <IconButton title={activeBeat.tags.length > 0 ? 'Edit beat tags (T)' : 'Add beat tags (T)'} showTooltip className={getTimelineIconButtonClassName(true)} onClick={() => handleStartBeatTagsEdit(activeBeat)}>
                    <Tags className={toolbarIconClassName} />
                  </IconButton>
                  <CardInlineTextEditor
                    value={activeBeat.tags.join(', ')}
                    ariaLabel="Active beat tags"
                    placeholder="comma, separated, tags"
                    canEdit
                    editRequestKey={getBeatFieldEditRequestKey(activeBeat.beatRef, 'tags')}
                    onCommit={nextValue => {
                      void handleCommitBeatFieldEdit({
                        beatRef: activeBeat.beatRef,
                        field: 'tags',
                        nextValue,
                      })
                    }}
                    onEditingChange={editing => {
                      handleBeatFieldEditingChange({
                        beatRef: activeBeat.beatRef,
                        field: 'tags',
                        editing,
                      })
                    }}
                    displayClassName="max-w-32 truncate text-xs leading-4 text-slate-400"
                    editorClassName="w-56 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none"
                  />
                </section>
              ) : null}
              {!canDeleteActiveBeat && activeBeat ? (
                <span className={getTimelineCompactStatusChipClassName('muted')}>
                  Delete blocked
                </span>
              ) : null}
              {!canMergeActiveBeatWithNext && activeBeat && nextBeat ? (
                <span className={getTimelineCompactStatusChipClassName('muted')}>
                  Merge blocked
                </span>
              ) : null}
              {activeBeat ? (
                <span className={getTimelineCompactStatusChipClassName()}>
                  Beat {activeBeat.beatRef}
                </span>
              ) : null}
              {canRemoveGapBeforeActiveBeat ? (
                <span className={getTimelineCompactStatusChipClassName('amber')}>
                  Gap Before: {Math.round(activeGapBeforeMs)}ms
                </span>
              ) : null}
              {soloLaneId ? (
                <span className={getTimelineCompactStatusChipClassName('cyan')}>
                  Solo Lane: {soloLaneId}
                </span>
              ) : null}
            </section>
          </section>
        </header>
        <section className="timeline-bottom-panel-editor flex min-h-0 flex-1 overflow-hidden">
          <aside className="timeline-lane-sidebar w-44 shrink-0 border-r border-slate-800 bg-[#111827]">
            <section
              className="timeline-lane-sidebar-scale flex items-center border-b border-slate-800 px-4 text-xs font-semibold uppercase tracking-normal text-slate-500"
              style={{ height: SCALE_ROW_HEIGHT_PX }}
            >
              Scale
            </section>
            <section
              className="timeline-lane-sidebar-beats flex items-center border-b border-slate-800 px-4 text-xs font-semibold uppercase tracking-normal text-slate-400"
              style={{ height: BEAT_HEADER_HEIGHT_PX }}
            >
              Timeline
            </section>
            <section role="listbox" aria-label="Animation timeline lanes">
              {lanePresentations.map((lane, laneIndex) => (
                <section
                key={lane.id}
                ref={node => {
                  laneOptionRefs.current[lane.id] = node
                }}
                tabIndex={selectedOrFirstLaneId === lane.id ? 0 : -1}
                role="option"
                aria-selected={selectedLaneId === lane.id}
                className={`flex cursor-pointer items-center justify-between gap-2 border-b px-2 py-1 text-xs font-medium text-slate-200 transition focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300 ${
                  selectedLaneId === lane.id ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-slate-800'
                }`}
                style={{ minHeight: LANE_ROW_HEIGHT_PX }}
                onClick={() => setSelectedLaneId(lane.id)}
                onFocus={() => setSelectedLaneId(lane.id)}
                onKeyDown={event => {
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    const previousLane = lanePresentations[Math.max(0, laneIndex - 1)]
                    if (previousLane) handleFocusLaneOption(previousLane.id)
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    const nextLane = lanePresentations[Math.min(lanePresentations.length - 1, laneIndex + 1)]
                    if (nextLane) handleFocusLaneOption(nextLane.id)
                  }
                  if (event.key === 'Home') {
                    event.preventDefault()
                    const firstLane = lanePresentations[0]
                    if (firstLane) handleFocusLaneOption(firstLane.id)
                  }
                  if (event.key === 'End') {
                    event.preventDefault()
                    const lastLane = lanePresentations[lanePresentations.length - 1]
                    if (lastLane) handleFocusLaneOption(lastLane.id)
                  }
                }}
              >
                <section className="flex min-w-0 flex-1 items-center gap-1">
                  <IconButton
                    title={`Move ${lane.label} up`}
                    showTooltip
                    className={getTimelineCompactIconButtonClassName(lanePresentations[0]?.id !== lane.id)}
                    onClick={() => void handleReorderLane(lane.id, -1)}
                    disabled={lanePresentations[0]?.id === lane.id}
                  >
                    <ArrowUp className={compactToolbarIconClassName} />
                  </IconButton>
                  <IconButton
                    title={`Move ${lane.label} down`}
                    showTooltip
                    className={getTimelineCompactIconButtonClassName(lanePresentations[lanePresentations.length - 1]?.id !== lane.id)}
                    onClick={() => void handleReorderLane(lane.id, 1)}
                    disabled={lanePresentations[lanePresentations.length - 1]?.id === lane.id}
                  >
                    <ArrowDown className={compactToolbarIconClassName} />
                  </IconButton>
                  <section className={`flex min-w-0 flex-1 items-center gap-1 ${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME}`}>
                    <section
                      className={`min-w-0 truncate ${lane.solo ? 'text-cyan-200' : lane.hidden ? 'text-slate-500 line-through' : lane.muted ? 'text-slate-400' : 'text-slate-200'}`}
                      title={`Tab to focus ${lane.label}; use Arrow Up/Down, Home, End, [ / ], H, U, O`}
                    >
                      {lane.label}
                    </section>
                    {selectedLaneId === lane.id ? (
                      <section className={`${laneInlineScrollClassName} shrink-0`}>
                        {SELECTED_LANE_HINTS.map(hint => (
                          <span key={hint.label} className={TIMELINE_COMPACT_HINT_CHIP_CLASS_NAME} title={hint.title}>
                            {hint.label}
                          </span>
                        ))}
                      </section>
                    ) : null}
                  </section>
                </section>
                <section className="flex items-center gap-1">
                  <IconButton
                    title={lane.hidden && !lane.solo ? `Show ${lane.label}` : `Hide ${lane.label}`}
                    showTooltip
                    className={getTimelineCompactIconButtonClassName(true)}
                    onClick={() => void handleToggleHiddenLane(lane.id)}
                  >
                    <EyeOff className={compactToolbarIconClassName} />
                  </IconButton>
                  <IconButton
                    title={lane.muted ? `Unmute ${lane.label}` : `Mute ${lane.label}`}
                    showTooltip
                    className={getTimelineCompactIconButtonClassName(true, lane.muted ? 'amber' : 'default')}
                    onClick={() => void handleToggleMutedLane(lane.id)}
                  >
                    <VolumeX className={compactToolbarIconClassName} />
                  </IconButton>
                  <IconButton
                    title={lane.solo ? `Unsolo ${lane.label}` : `Solo ${lane.label}`}
                    showTooltip
                    className={getTimelineCompactIconButtonClassName(true, lane.solo ? 'cyan' : 'default')}
                    onClick={() => void handleToggleSoloLane(lane.id)}
                  >
                    <CircleDot className={compactToolbarIconClassName} />
                  </IconButton>
                </section>
                </section>
              ))}
            </section>
          </aside>
          <section ref={scrollRef} className="timeline-editor min-w-0 flex-1 overflow-auto bg-[#0b1020]">
            <section className="relative" style={{ width: Math.max(totalTimelineWidth, 1) }}>
              <section
                className="timeline-editor-cursor pointer-events-none absolute z-20"
                draggable={false}
                data-width="2"
                data-left={playheadOffsetPx}
                style={{
                  width: 2,
                  left: playheadOffsetPx,
                  top: 0,
                  height: SCALE_ROW_HEIGHT_PX + BEAT_HEADER_HEIGHT_PX + lanePresentations.length * LANE_ROW_HEIGHT_PX,
                }}
              >
                <svg className="timeline-editor-cursor-top" width="8" height="12" viewBox="0 0 8 12" fill="none">
                  <path d="M0 1C0 0.447715 0.447715 0 1 0H7C7.55228 0 8 0.447715 8 1V9.38197C8 9.76074 7.786 10.107 7.44721 10.2764L4.44721 11.7764C4.16569 11.9172 3.83431 11.9172 3.55279 11.7764L0.552786 10.2764C0.214002 10.107 0 9.76074 0 9.38197V1Z" fill="#5297FF"></path>
                </svg>
                <section className="timeline-editor-cursor-area"></section>
              </section>
              <header className="timeline-editor-header sticky top-0 z-10 bg-[#0f1625]/95 backdrop-blur">
                <section className="timeline-editor-time-area relative border-b border-slate-800" style={{ height: SCALE_ROW_HEIGHT_PX }}>
                  <ol className="timeline-editor-time-scale-list" aria-label="Animatic timeline scale">
                  {timelineEditorTimeUnits.map(unit => (
                    <li
                      key={unit.key}
                      role="gridcell"
                      className={`timeline-editor-time-unit ${unit.big ? 'timeline-editor-time-unit-big' : ''}`}
                      style={{ left: unit.left, width: unit.width, height: SCALE_ROW_HEIGHT_PX }}
                    >
                      {unit.label ? (
                        <time className="timeline-editor-time-unit-scale" dateTime={`PT${Math.max(0, Number(unit.label))}S`}>
                          {unit.label}
                        </time>
                      ) : null}
                    </li>
                  ))}
                  </ol>
                  <aside className="timeline-editor-time-mark-layer" aria-hidden="true">
                    {snapMarks.map(mark => {
                    const left =
                      timelineModel.scaleConfig.startLeft +
                      (timelineModel.totalSpan > 0 ? (mark / timelineModel.totalSpan) * totalTimelineTrackWidth : 0)
                    return (
                      <span key={`snap:${mark}`} aria-hidden="true" className="pointer-events-none absolute inset-y-0" style={{ left }}>
                        <span className="block h-full w-px bg-cyan-500/15" />
                      </span>
                    )
                  })}
                  {scaleMarks.map(mark => {
                    return (
                      <span key={mark.key} aria-hidden="true" className="timeline-editor-time-mark absolute inset-y-0" style={{ left: mark.left }}>
                        <span className="block h-full w-px bg-slate-700/80" />
                      </span>
                    )
                  })}
                  </aside>
                </section>
                <section
                  className="timeline-editor-edit-area flex border-b border-slate-800"
                  role="listbox"
                  aria-label="Animatic timeline beats"
                  style={{ paddingLeft: timelineModel.scaleConfig.startLeft }}
                >
                  {timelineModel.beats.map((beat, index) => {
                    const isActiveBeat = index === activeBeatIndex
                    const beatLaneSummary = buildBeatLaneSummary(beat.items)
                    const visibleBeatLaneSummary = beatLaneSummary.slice(0, BEAT_LANE_SUMMARY_LIMIT)
                    const previousBeatForCard = index > 0 ? timelineModel.beats[index - 1] || null : null
                    const nextBeatForCard = timelineModel.beats[index + 1] || null
                    const canQuickDeleteBeat = beat.items.length === 0
                    const gapBeforeCardMs =
                      timelineModel.usesAbsoluteTiming && beat.startMs != null && previousBeatForCard?.endMs != null
                        ? Math.max(0, beat.startMs - previousBeatForCard.endMs)
                        : 0
                    const canQuickSplitBeat =
                      timelineModel.usesAbsoluteTiming &&
                      beat.startMs != null &&
                      beat.endMs != null &&
                      beat.endMs - beat.startMs >= EDIT_MIN_DURATION_MS * 2
                    const canQuickRemoveGapBeforeBeat = gapBeforeCardMs > 0
                    const canQuickMergeBeatWithNext =
                      timelineModel.usesAbsoluteTiming &&
                      beat.startMs != null &&
                      nextBeatForCard?.endMs != null &&
                      (nextBeatForCard?.items.length || 0) === 0
                    return (
                      <section
                        key={beat.beatRef}
                        ref={node => {
                          beatOptionRefs.current[beat.beatRef] = node
                        }}
                        tabIndex={selectedOrActiveBeatRef === beat.beatRef ? 0 : -1}
                        role="option"
                        aria-selected={isActiveBeat}
                        title={`Tab to focus ${beat.label}; use Arrow Left/Right, Home, End`}
                        className={`group/beat relative flex shrink-0 flex-col justify-start overflow-hidden border-r border-slate-800 px-2 py-1 text-left transition focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300 ${
                          isActiveBeat ? 'bg-cyan-500/6' : 'bg-transparent hover:bg-slate-900/70'
                        }`}
                        style={{ width: beatWidths[index], height: BEAT_HEADER_HEIGHT_PX }}
                        onFocus={() => handleFocusBeat(beat)}
                        onKeyDown={event => {
                          if (event.key === 'ArrowLeft') {
                            event.preventDefault()
                            const previousBeat = timelineModel.beats[Math.max(0, index - 1)]
                            if (previousBeat) handleFocusBeatOption(previousBeat)
                          }
                          if (event.key === 'ArrowRight') {
                            event.preventDefault()
                            const nextBeat = timelineModel.beats[Math.min(timelineModel.beats.length - 1, index + 1)]
                            if (nextBeat) handleFocusBeatOption(nextBeat)
                          }
                          if (event.key === 'Home') {
                            event.preventDefault()
                            const firstBeat = timelineModel.beats[0]
                            if (firstBeat) handleFocusBeatOption(firstBeat)
                          }
                          if (event.key === 'End') {
                            event.preventDefault()
                            const lastBeat = timelineModel.beats[timelineModel.beats.length - 1]
                            if (lastBeat) handleFocusBeatOption(lastBeat)
                          }
                        }}
                      >
                        <section
                          className={`absolute inset-x-1.5 top-1 z-30 ${laneInlineScrollClassName} justify-end opacity-0 transition group-hover/beat:opacity-100 group-focus-within/beat:opacity-100`}
                        >
                          <IconButton
                            title={`Insert beat before ${beat.label}`}
                            showTooltip
                            className={getTimelineBeatQuickIconButtonClassName(true)}
                            onClick={() => handleInsertBeatBeforeQuick(beat)}
                          >
                            <ArrowLeftToLine className={compactToolbarIconClassName} />
                          </IconButton>
                          <IconButton
                            title={`Insert beat after ${beat.label}`}
                            showTooltip
                            className={getTimelineBeatQuickIconButtonClassName(true)}
                            onClick={() => handleInsertBeatAfterQuick(beat)}
                          >
                            <ArrowRightToLine className={compactToolbarIconClassName} />
                          </IconButton>
                          <IconButton
                            title={`Rename ${beat.label}`}
                            showTooltip
                            className={getTimelineBeatQuickIconButtonClassName(true)}
                            onClick={() => handleStartBeatLabelQuickEdit(beat)}
                          >
                            <Pencil className={compactToolbarIconClassName} />
                          </IconButton>
                          <IconButton
                            title={`Duplicate ${beat.label}`}
                            showTooltip
                            className={getTimelineBeatQuickIconButtonClassName(true)}
                            onClick={() => handleDuplicateBeatQuick(beat)}
                          >
                            <Copy className={compactToolbarIconClassName} />
                          </IconButton>
                          <IconButton
                            title={
                              canQuickRemoveGapBeforeBeat
                                ? `Remove ${Math.round(gapBeforeCardMs)}ms gap before ${beat.label}`
                                : `Remove Gap is available only when ${beat.label} has a positive leading gap`
                            }
                            showTooltip
                            className={getTimelineBeatQuickIconButtonClassName(canQuickRemoveGapBeforeBeat)}
                            onClick={() => handleRemoveGapBeforeBeatQuick(beat)}
                            disabled={!canQuickRemoveGapBeforeBeat}
                          >
                            <ArrowLeft className={compactToolbarIconClassName} />
                          </IconButton>
                          <IconButton
                            title={
                              canQuickMergeBeatWithNext
                                ? `Merge ${beat.label} with next empty beat`
                                : `Merge Next is available only when the next beat is empty`
                            }
                            showTooltip
                            className={getTimelineBeatQuickIconButtonClassName(canQuickMergeBeatWithNext)}
                            onClick={() => handleMergeBeatWithNextQuick(beat)}
                            disabled={!canQuickMergeBeatWithNext}
                          >
                            <GitMerge className={compactToolbarIconClassName} />
                          </IconButton>
                          <IconButton
                            title={
                              canQuickSplitBeat
                                ? `Split ${beat.label} at the midpoint`
                                : `Split is available only when ${beat.label} is long enough`
                            }
                            showTooltip
                            className={getTimelineBeatQuickIconButtonClassName(canQuickSplitBeat)}
                            onClick={() => handleSplitBeatQuick(beat)}
                            disabled={!canQuickSplitBeat}
                          >
                            <Scissors className={compactToolbarIconClassName} />
                          </IconButton>
                          <IconButton
                            title={canQuickDeleteBeat ? `Delete ${beat.label}` : `Delete is available only for empty beats`}
                            showTooltip
                            className={getTimelineBeatQuickIconButtonClassName(canQuickDeleteBeat)}
                            onClick={() => handleDeleteBeatQuick(beat)}
                            disabled={!canQuickDeleteBeat}
                          >
                            <Trash2 className={compactToolbarIconClassName} />
                          </IconButton>
                          <IconButton
                            title={beat.note ? `Edit note for ${beat.label}` : `Add note for ${beat.label}`}
                            showTooltip
                            className={getTimelineBeatQuickIconButtonClassName(true)}
                            onClick={() => handleStartBeatNoteQuickEdit(beat)}
                          >
                            <FileText className={compactToolbarIconClassName} />
                          </IconButton>
                          <IconButton
                            title={beat.summary ? `Edit summary for ${beat.label}` : `Add summary for ${beat.label}`}
                            showTooltip
                            className={getTimelineBeatQuickIconButtonClassName(true)}
                            onClick={() => handleStartBeatSummaryQuickEdit(beat)}
                          >
                            <AlignLeft className={compactToolbarIconClassName} />
                          </IconButton>
                          <IconButton
                            title={beat.tags.length > 0 ? `Edit tags for ${beat.label}` : `Add tags for ${beat.label}`}
                            showTooltip
                            className={getTimelineBeatQuickIconButtonClassName(true)}
                            onClick={() => handleStartBeatTagsQuickEdit(beat)}
                          >
                            <Tags className={compactToolbarIconClassName} />
                          </IconButton>
                        </section>
                        <button
                          type="button"
                          className="absolute inset-0 z-0"
                          onDoubleClick={() => handleStartBeatLabelEdit(beat)}
                          onClick={() => {
                            setTransportPlaying(false)
                            setTransportPlaybackPosition(beat.displayStart)
                          }}
                        />
                        {timelineModel.usesAbsoluteTiming ? (
                          <>
                            <button
                              type="button"
                              aria-label={`Move ${beat.label}`}
                              className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing"
                              onPointerDown={event => handleBeatPointerStart(event, beat, index, 'move')}
                              onClick={() => {
                                setTransportPlaying(false)
                                setTransportPlaybackPosition(beat.displayStart)
                              }}
                            />
                            <button
                              type="button"
                              aria-label={`Resize ${beat.label} start`}
                              className="absolute inset-y-0 left-0 z-20 w-2.5 cursor-ew-resize bg-cyan-300/0 hover:bg-cyan-300/12"
                              onPointerDown={event => handleBeatPointerStart(event, beat, index, 'resize-start')}
                            />
                            <button
                              type="button"
                              aria-label={`Resize ${beat.label} end`}
                              className="absolute inset-y-0 right-0 z-20 w-2.5 cursor-ew-resize bg-cyan-300/0 hover:bg-cyan-300/12"
                              onPointerDown={event => handleBeatPointerStart(event, beat, index, 'resize-end')}
                            />
                          </>
                        ) : (
                          <span />
                        )}
                        <span className="relative z-10 text-xs uppercase leading-3 tracking-normal text-slate-500">{beat.beatRef}</span>
                        <CardInlineTextEditor
                          value={beat.label}
                          ariaLabel={`Beat label for ${beat.beatRef}`}
                          placeholder="Add beat label"
                          canEdit
                          editRequestKey={getBeatFieldEditRequestKey(beat.beatRef, 'label')}
                          onCommit={nextValue => {
                            void handleCommitBeatFieldEdit({
                              beatRef: beat.beatRef,
                              field: 'label',
                              nextValue,
                            })
                          }}
                          onEditingChange={editing => {
                            handleBeatFieldEditingChange({
                              beatRef: beat.beatRef,
                              field: 'label',
                              editing,
                            })
                          }}
                          displayClassName="relative z-[25] text-xs font-semibold leading-3.5 text-slate-100"
                          editorClassName="relative z-[25] rounded border border-slate-700 bg-slate-950/95 px-1 py-0.5 text-xs font-semibold leading-4 text-slate-50 outline-none"
                        />
                        <section
                          className={`relative z-10 ${laneInlineScrollClassName} text-xs leading-3.5 text-slate-400`}
                        >
                          <span>
                            {timelineModel.usesAbsoluteTiming
                              ? `${formatAnimaticTimelineTimestamp(beat.startMs)} -> ${formatAnimaticTimelineTimestamp(beat.endMs)}`
                              : `${beat.items.length} item${beat.items.length === 1 ? '' : 's'}`}
                          </span>
                          <span className="rounded-full border border-slate-700 bg-slate-900/70 px-1 py-0 text-xs leading-3 text-slate-300">
                            {beat.items.length} item{beat.items.length === 1 ? '' : 's'}
                          </span>
                        </section>
                        {beatLaneSummary.length > 0 ? (
                          <section
                            className={`relative z-10 ${laneInlineScrollClassName} text-xs leading-3.5`}
                          >
                            {visibleBeatLaneSummary.map(({ laneId, count }) => (
                              <button
                                type="button"
                                key={`${beat.beatRef}:lane:${laneId}`}
                                className={`truncate rounded-full border px-1 py-0 text-xs leading-3 transition hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-cyan-300 ${LANE_ACCENT_CLASS[laneId]}`}
                                title={`${LANE_LABEL[laneId]}: ${count} item${count === 1 ? '' : 's'}`}
                                onClick={() => handleFocusLaneFromBeatCard(laneId)}
                              >
                                {LANE_LABEL[laneId]} {count}
                              </button>
                            ))}
                            {beatLaneSummary.length > BEAT_LANE_SUMMARY_LIMIT ? (
                              <span
                                className="rounded-full border border-slate-700 bg-slate-900/80 px-1 py-0 text-xs leading-3 text-slate-300"
                                title={`${beatLaneSummary.length - BEAT_LANE_SUMMARY_LIMIT} more lane summaries`}
                              >
                                +{beatLaneSummary.length - BEAT_LANE_SUMMARY_LIMIT}
                              </span>
                            ) : null}
                          </section>
                        ) : null}
                        {beat.summary || isActiveBeat ? (
                          <CardInlineTextEditor
                            value={beat.summary}
                            ariaLabel={`Beat summary for ${beat.beatRef}`}
                            placeholder="Add beat summary"
                            canEdit
                            editRequestKey={getBeatFieldEditRequestKey(beat.beatRef, 'summary')}
                            multiline
                            rows={3}
                            onCommit={nextValue => {
                              void handleCommitBeatFieldEdit({
                                beatRef: beat.beatRef,
                                field: 'summary',
                                nextValue,
                              })
                            }}
                            onEditingChange={editing => {
                              handleBeatFieldEditingChange({
                                beatRef: beat.beatRef,
                                field: 'summary',
                                editing,
                              })
                            }}
                            displayClassName="relative z-[25] truncate text-xs leading-3.5 text-slate-300"
                            editorClassName="relative z-[25] min-h-16 rounded border border-slate-700 bg-slate-950/95 px-1.5 py-1 text-xs leading-4 text-slate-50 outline-none"
                          />
                        ) : null}
                        {beat.tags.length > 0 ? (
                          <section
                            className={`relative z-10 ${laneInlineScrollClassName} text-xs leading-3.5`}
                          >
                            {beat.tags.slice(0, 3).map(tag => (
                              <span
                                key={`${beat.beatRef}:${tag}`}
                                className="truncate rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1 py-0 text-xs leading-3 text-cyan-100"
                                title={tag}
                              >
                                {tag}
                              </span>
                            ))}
                            {beat.tags.length > 3 ? (
                              <span
                                className="rounded-full border border-slate-700 bg-slate-900/90 px-1 py-0 text-xs leading-3 text-slate-400"
                                title={beat.tags.slice(3).join(', ')}
                              >
                                +{beat.tags.length - 3}
                              </span>
                            ) : null}
                          </section>
                        ) : null}
                        {isActiveBeat ? (
                          <section
                            className={`relative z-10 ${laneInlineScrollClassName} text-xs text-cyan-100`}
                          >
                            {SELECTED_BEAT_HINTS.map(hint => (
                              <span key={hint.label} className={TIMELINE_COMPACT_HINT_CHIP_CLASS_NAME} title={hint.title}>
                                {hint.label}
                              </span>
                            ))}
                          </section>
                        ) : null}
                      </section>
                    )
                  })}
                </section>
              </header>
              {lanePresentations.map(lane => (
                <section
                  key={lane.id}
                  ref={node => {
                    laneRowRefs.current[lane.id] = node
                  }}
                  className={`timeline-editor-edit-row relative flex border-b transition ${
                    highlightedLaneShortcutId === lane.id ? 'border-cyan-500/50 bg-cyan-500/4' : 'border-slate-900/80'
                  }`}
                  style={timelineRowStyle}
                >
                  <section className="pointer-events-none flex shrink-0" style={{ width: totalTimelineTrackWidth, minHeight: LANE_ROW_HEIGHT_PX - 1, height: LANE_ROW_HEIGHT_PX - 1 }}>
                    {timelineModel.beats.map((beat, index) => {
                      const isActiveBeat = index === activeBeatIndex
                      return (
                        <section
                          key={`${lane.id}:${beat.beatRef}`}
                          className={`shrink-0 border-r border-slate-800 ${isActiveBeat ? 'bg-slate-900/75' : 'bg-[#0b1020]'}`}
                          style={{ width: beatWidths[index], minHeight: LANE_ROW_HEIGHT_PX - 1, height: LANE_ROW_HEIGHT_PX - 1 }}
                        ></section>
                      )
                    })}
                  </section>
                  {(() => {
                    const laneItemContexts = timelineModel.beats.flatMap((beat, index) =>
                      beat.items
                        .filter(item => item.laneId === lane.id)
                        .map(item => ({
                          item,
                          beat,
                          beatIndex: index,
                          previousBeat: timelineModel.beats[index - 1] || null,
                          nextBeat: timelineModel.beats[index + 1] || null,
                        })),
                    )
                    if (!lane.visibleItems) {
                      return (
                        <section className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-2 text-xs text-slate-600">
                          {lane.soloFiltered ? 'Solo filtered' : lane.hidden ? 'Hidden lane' : lane.muted ? 'Muted lane' : `No ${lane.label.toLowerCase()} item`}
                        </section>
                      )
                    }
                    if (laneItemContexts.length === 0) {
                      return (
                        <section className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-2 text-xs text-slate-600">
                          No {lane.label.toLowerCase()} item
                        </section>
                      )
                    }
                    return (
                      <section
                        ref={node => {
                          laneTrackOverlayRefs.current[lane.id] = node
                        }}
                        className="pointer-events-none absolute inset-y-0 left-0"
                        style={{ width: totalTimelineTrackWidth }}
                      >
                        {laneItemContexts.map(({ item, beat, beatIndex, previousBeat, nextBeat }) => {
                          const actionEffectClassName = resolveTimelineEditorActionEffectClassName(item.laneId)
                          const isDraggingLaneItem = dragState?.kind === 'item' && dragState.itemNodeId === item.nodeId
                          return (
                            <article
                              key={item.id}
                              ref={node => {
                                laneItemOptionRefs.current[item.nodeId] = node
                              }}
                              tabIndex={selectedLaneId === lane.id && selectedOrFirstLaneItemNodeId === item.nodeId ? 0 : -1}
                              role="option"
                              aria-selected={selectedItemNodeId === item.nodeId}
                              title={`Focus ${item.title}; use Arrow Up/Down, Home, End, , and .`}
                              className={`group/item timeline-editor-action timeline-editor-action-movable timeline-editor-action-flexible timeline-editor-action-effect-${actionEffectClassName} pointer-events-auto absolute rounded-[4px] border px-0 py-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300 ${LANE_ACCENT_CLASS[item.laneId]} ${
                                lane.muted ? 'opacity-40 saturate-50' : ''
                              } ${
                                selectedItemNodeId === item.nodeId ? 'ring-1 ring-cyan-300' : ''
                              }`}
                              style={{
                                left: beatTrackOffsets[beatIndex],
                                top: 1,
                                width: laneActionWidths[beatIndex],
                                transform: isDraggingLaneItem ? `translateX(${laneItemDragPreviewOffsetPx}px)` : undefined,
                                zIndex: isDraggingLaneItem ? 20 : undefined,
                              }}
                              onPointerDown={event => handleLaneItemPointerStart(event, lane.id, beat, item.nodeId, item.title)}
                              onClick={() => {
                                setSelectedLaneId(lane.id)
                                setSelectedItemNodeId(item.nodeId)
                              }}
                              onFocus={() => {
                                setSelectedLaneId(lane.id)
                                setSelectedItemNodeId(item.nodeId)
                              }}
                              onKeyDown={event => {
                                const itemIndex = selectedLaneVisibleItemContexts.findIndex(entry => entry.nodeId === item.nodeId)
                                if (event.key === 'ArrowUp') {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  const previousItem = selectedLaneVisibleItemContexts[Math.max(0, itemIndex - 1)]
                                  if (previousItem) handleFocusLaneItemOption(previousItem.nodeId)
                                }
                                if (event.key === 'ArrowDown') {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  const nextItem = selectedLaneVisibleItemContexts[Math.min(selectedLaneVisibleItemContexts.length - 1, itemIndex + 1)]
                                  if (nextItem) handleFocusLaneItemOption(nextItem.nodeId)
                                }
                                if (event.key === 'Home') {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  const firstItem = selectedLaneVisibleItemContexts[0]
                                  if (firstItem) handleFocusLaneItemOption(firstItem.nodeId)
                                }
                                if (event.key === 'End') {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  const lastItem = selectedLaneVisibleItemContexts[selectedLaneVisibleItemContexts.length - 1]
                                  if (lastItem) handleFocusLaneItemOption(lastItem.nodeId)
                                }
                              }}
                            >
                              <section className={`timeline-editor-action-effect ${actionEffectClassName}`} aria-label={`${lane.label} action ${item.title}`}>
                                <section
                                  className={`${laneInlineScrollClassName} min-w-0 w-full justify-center px-2 ${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME}`}
                                >
                                  <span className={`${actionEffectClassName}-text min-w-0 truncate text-xs leading-3.5 font-normal`}>{item.title}</span>
                                  {selectedItemNodeId === item.nodeId ? (
                                    <section className={`${laneInlineScrollClassName} shrink-0`}>
                                      {SELECTED_ITEM_HINTS.map(hint => (
                                        <span key={hint.label} className={TIMELINE_COMPACT_HINT_CHIP_CLASS_NAME} title={hint.title}>
                                          {hint.label}
                                        </span>
                                      ))}
                                    </section>
                                  ) : null}
                                </section>
                                <nav
                                  aria-label={`Move ${item.title} between beats`}
                                  className={`absolute inset-y-0 right-0 z-10 flex items-center gap-0.5 pr-0.5 transition-opacity duration-150 ${selectedItemNodeId === item.nodeId ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100'}`}
                                >
                                  <IconButton
                                    title={previousBeat ? `Move ${item.title} to ${previousBeat.label}` : `No previous beat for ${item.title}`}
                                    showTooltip
                                    className={getTimelineInlineMoveIconButtonClassName(!!previousBeat)}
                                    onClick={() => void handleMoveItemToBeat({
                                      nodeId: item.nodeId,
                                      title: item.title,
                                      laneId: item.laneId,
                                      beatRef: beat.beatRef,
                                    }, previousBeat)}
                                    disabled={!previousBeat}
                                  >
                                    <ArrowLeft className={compactToolbarIconClassName} />
                                  </IconButton>
                                  <IconButton
                                    title={nextBeat ? `Move ${item.title} to ${nextBeat.label}` : `No next beat for ${item.title}`}
                                    showTooltip
                                    className={getTimelineInlineMoveIconButtonClassName(!!nextBeat)}
                                    onClick={() => void handleMoveItemToBeat({
                                      nodeId: item.nodeId,
                                      title: item.title,
                                      laneId: item.laneId,
                                      beatRef: beat.beatRef,
                                    }, nextBeat)}
                                    disabled={!nextBeat}
                                  >
                                    <ArrowRight className={compactToolbarIconClassName} />
                                  </IconButton>
                                </nav>
                              </section>
                              <button
                                type="button"
                                className="timeline-editor-action-left-stretch"
                                aria-label={`Resize ${item.title} start`}
                                tabIndex={-1}
                                data-kg-timeline-action-ignore-drag="true"
                                onPointerDown={event => {
                                  event.stopPropagation()
                                  handleBeatPointerStart(event, beat, beatIndex, 'resize-start')
                                }}
                              ></button>
                              <button
                                type="button"
                                className="timeline-editor-action-right-stretch"
                                aria-label={`Resize ${item.title} end`}
                                tabIndex={-1}
                                data-kg-timeline-action-ignore-drag="true"
                                onPointerDown={event => {
                                  event.stopPropagation()
                                  handleBeatPointerStart(event, beat, beatIndex, 'resize-end')
                                }}
                              ></button>
                            </article>
                          )
                        })}
                      </section>
                    )
                  })()}
                </section>
              ))}
            </section>
          </section>
        </section>
      </section>
    </section>
  )
}
