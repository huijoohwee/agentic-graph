import React from 'react'
import type { VideoSequenceTimelineClipOverlayRenderArgs } from '@/components/timeline/VideoSequenceTimelineRuler'
import {
  resolveVideoSequenceRulerInsetLeft,
  resolveVideoSequenceRulerInsetPixelMetrics,
} from '@/components/timeline/videoSequenceTimelineRulerGeometry'
import { resolveVideoSequenceTimelineScaleDurationSeconds } from '@/components/timeline/videoSequenceTimelineZoom'
import { requestXrSimulationWorkbenchOpen } from '@/features/command-menu/xrSimulationWorkbenchOpenRequest'
import { useShallow } from 'zustand/react/shallow'
import { TimelineTransportTimeAxisClip } from '@/components/timeline/TimelineTransportControls'
import { GanttTimelineTransportPanel } from '@/features/gitgraph/GanttTimelineTransportPanel'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useTimelineTransportStoreBinding } from '@/components/timeline/timelineTransport'
import {
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  XR_MOTION_REFERENCE_STAGE_PRESETS,
  serializeXrMotionReferencePlan,
} from './xrMotionReferenceModel'
import { buildXrMotionReferencePackage, xrMotionReferencePackageBlob, xrMotionReferencePackageFilename } from './xrMotionReferencePackage'
import {
  markXrMotionReferenceSaved,
  readXrMotionReferenceRuntime,
  setXrMotionReferenceDuration,
  setXrMotionReferenceFps,
  setXrMotionReferencePlayhead,
  subscribeXrMotionReferenceRuntime,
} from './xrMotionReferenceRuntime'
import { controlLocalXrScene } from './xrSceneMcpRuntime'
import { readXrPhysicsRuntime, subscribeXrPhysicsRuntime } from './xrPhysicsRuntime'
import {
  readSharedXrNativeControllerDemoFrame,
  readXrNativeControllerDemo,
  subscribeXrNativeControllerDemo,
} from './xrNativeControllerDemoRuntime'
import { buildXrMotionReferenceTimelineCode, xrMotionReferenceTimelineDocumentKey } from './xrMotionReferenceTimeline'
import { CameraMotionMarkRetime } from './CameraMotionMarkRetime'
import { controlLocalAnimation } from './xrAnimationMcpRuntime'
import {
  controlXrSharedAssetControls,
  inspectXrSharedAssetControls,
  readXrSharedAssetControlRevision,
  subscribeXrSharedAssetControlRuntime,
} from './xrSharedAssetControlRuntime'
import { resolveXrPanelSourceProfile } from './xrPanelModel'
import { resolveXrChoreographySpeedWarnings } from './xrChoreographyDiagnostics'
import { selectBoundXrShotTarget } from './xrSelectedActorBinding'
import {
  buildXrShotTargets,
  XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID,
} from './xrShotTargets'
import { downloadBlob } from '@/lib/graph/save'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { activateXrSceneSurface } from './xrSceneSurfaceRuntime'
import {
  readGameFpsSnapshot,
  subscribeGameFpsSnapshot,
} from '@/features/game-fps/gameFpsRuntime'

type XrTimelineLaneSelection = 'scene' | 'simulation' | 'camera' | `object:${string}` | `npc:${string}`

type XrTimelineLaneBarDragState = {
  input: 'mouse' | 'pointer'
  laneId: XrTimelineLaneSelection
  pointerId?: number
  originClientX: number
  originClientY: number
  rectLeft: number
  rectWidth: number
}

const SELECTED_INSERTED_TIMELINE_CLIP_STYLE = Object.freeze({
  borderColor: 'transparent',
  borderWidth: 0,
  boxShadow: 'none',
}) satisfies React.CSSProperties

const XR_TIMELINE_LANE_DRAG_THRESHOLD_PX = 3
const GAME_FPS_NPC_TIMELINE_COLORS = Object.freeze({
  hold: '#60a5fa',
  alert: '#facc15',
  engage: '#ef4444',
  flee: '#c084fc',
})

export function XrCameraMotionSection() {
  const activeGraphData = useActiveGraphRenderData(true)
  const {
    canvas3dMode,
    canvasRenderMode,
    graphData: rawGraphData,
    markdownDocumentName,
    markdownDocumentText,
    pushUiToast,
    selectedNodeId,
    updateGraphMetadata,
  } = useGraphStore(
    useShallow(state => ({
      canvas3dMode: state.canvas3dMode,
      canvasRenderMode: state.canvasRenderMode,
      graphData: state.graphData,
      markdownDocumentName: state.markdownDocumentName,
      markdownDocumentText: state.markdownDocumentText,
      pushUiToast: state.pushUiToast,
      selectedNodeId: state.selectedNodeId,
      updateGraphMetadata: state.updateGraphMetadata,
    })),
  )
  const { transportDocumentKey, transportPosition } = useTimelineTransportStoreBinding()
  const runtime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const physics = React.useSyncExternalStore(
    subscribeXrPhysicsRuntime,
    readXrPhysicsRuntime,
    readXrPhysicsRuntime,
  )
  const nativeController = React.useSyncExternalStore(
    subscribeXrNativeControllerDemo,
    readXrNativeControllerDemo,
    readXrNativeControllerDemo,
  )
  const gameMission = React.useSyncExternalStore(
    subscribeGameFpsSnapshot,
    readGameFpsSnapshot,
    readGameFpsSnapshot,
  )
  const sharedAssetControlRevision = React.useSyncExternalStore(
    subscribeXrSharedAssetControlRuntime,
    readXrSharedAssetControlRevision,
    readXrSharedAssetControlRevision,
  )
  const xrActive = canvasRenderMode === '3d' && canvas3dMode === 'xr'

  const documentLoaded = Boolean(
    String(markdownDocumentName || '').trim()
    && String(markdownDocumentText || '').trim(),
  )
  const graphData = documentLoaded ? activeGraphData || rawGraphData : null
  const sourceProfile = React.useMemo(
    () => resolveXrPanelSourceProfile(markdownDocumentText || ''),
    [markdownDocumentText],
  )
  const xrTransportDocumentKey = xrMotionReferenceTimelineDocumentKey(markdownDocumentName)
  const timelineCode = React.useMemo(
    () => buildXrMotionReferenceTimelineCode(runtime.plan, { includeChoreographyCues: false }),
    [runtime.plan],
  )
  const speedWarnings = React.useMemo(() => resolveXrChoreographySpeedWarnings(runtime.plan), [runtime.plan])
  const shotTargets = React.useMemo(() => buildXrShotTargets(runtime.plan), [runtime.plan])
  const objectTargets = shotTargets.filter(target => target.kind === 'object')
  const selectedShotTarget = shotTargets.find(target => target.id === runtime.selectedShotTargetId) || shotTargets[0]!
  const sharedAssetControls = React.useMemo(
    () => inspectXrSharedAssetControls(),
    [gameMission.revision, runtime.revision, sharedAssetControlRevision],
  )
  const [selectedTimelineLaneId, setSelectedTimelineLaneId] = React.useState<XrTimelineLaneSelection>(() => (
    selectedShotTarget.id === XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID ? 'scene' : `object:${selectedShotTarget.id}`
  ))
  const [draggingTimelineLaneId, setDraggingTimelineLaneId] = React.useState<XrTimelineLaneSelection | null>(null)
  const timelineLaneDragStateRef = React.useRef<XrTimelineLaneBarDragState | null>(null)
  const timelineLaneDragMovedRef = React.useRef(false)
  const edges = Array.isArray(graphData?.edges) ? graphData.edges.length : 0
  const sceneScaleDurationSeconds = resolveVideoSequenceTimelineScaleDurationSeconds(runtime.plan.durationSeconds)
  const sceneEditorStyle = React.useMemo(() => {
    const scaleSeconds = sceneScaleDurationSeconds > 0 ? sceneScaleDurationSeconds : runtime.plan.durationSeconds
    const playheadSeconds = Number.isFinite(runtime.playheadSeconds) ? runtime.playheadSeconds : 0
    const playheadRatio = scaleSeconds > 0 ? Math.min(1, Math.max(0, playheadSeconds / scaleSeconds)) : 0
    return {
      '--kg-xr-retime-mark-left': resolveVideoSequenceRulerInsetLeft(playheadRatio * 100),
      '--kg-xr-mark-editor-translate-x': playheadRatio > 0.58 ? 'calc(-100% - 12px)' : '12px',
    } as React.CSSProperties
  }, [runtime.plan.durationSeconds, runtime.playheadSeconds, sceneScaleDurationSeconds])

  React.useEffect(() => {
    if (!xrActive) return
    if (transportDocumentKey !== xrTransportDocumentKey) return
    setXrMotionReferencePlayhead(transportPosition * 60)
  }, [transportDocumentKey, transportPosition, xrActive, xrTransportDocumentKey])

  React.useEffect(() => {
    setSelectedTimelineLaneId(
      selectedShotTarget.id === XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID ? 'scene' : `object:${selectedShotTarget.id}`,
    )
  }, [selectedShotTarget.id])

  React.useEffect(() => {
    if (sharedAssetControls.selectedKind !== 'npc' || !sharedAssetControls.selectedTargetId) return
    setSelectedTimelineLaneId(`npc:${sharedAssetControls.selectedTargetId}`)
  }, [sharedAssetControls.selectedKind, sharedAssetControls.selectedTargetId])

  const savePlan = React.useCallback(() => {
    if (!graphData) return
    const serialized = serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan)
    updateGraphMetadata({ [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serialized })
    const savedValue = useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]
    if (savedValue !== serialized) {
      pushUiToast({
        id: 'xr:motion-reference:save-error',
        kind: 'error',
        message: 'XR motion-reference plan could not be written to graph metadata.',
      })
      return
    }
    markXrMotionReferenceSaved(serialized)
    pushUiToast({
      id: 'xr:motion-reference:save',
      kind: 'success',
      message: 'XR motion-reference plan saved to graph metadata.',
    })
  }, [graphData, pushUiToast, updateGraphMetadata])

  const exportPackage = React.useCallback(() => {
    if (!graphData) return
    const bundle = buildXrMotionReferencePackage({
      plan: readXrMotionReferenceRuntime().plan,
      graphData,
      documentName: markdownDocumentName || 'Untitled',
    })
    downloadBlob(xrMotionReferencePackageBlob(bundle), xrMotionReferencePackageFilename(bundle))
    pushUiToast({
      id: 'xr:motion-reference:export',
      kind: 'success',
      message: `Exported ${bundle.timeline.frameCount} deterministic motion samples.`,
    })
  }, [graphData, markdownDocumentName, pushUiToast])

  const scrubPlayhead = React.useCallback((timeSeconds: number) => {
    const result = controlLocalAnimation({ operation: 'scrub', timeSeconds })
    if (result.ok) return
    pushUiToast({
      id: 'xr:animation:error',
      kind: documentLoaded ? 'error' : 'warning',
      message: result.message,
    })
  }, [documentLoaded, pushUiToast])

  const openSimulationWorkbench = React.useCallback(() => {
    if (!activateXrSceneSurface({ panelView: 'media', openPanel: true, timeline: true })) {
      pushUiToast({
        id: 'xr:simulation-workbench:surface-error',
        kind: 'error',
        message: 'XR simulation requires an available shared XR Mode surface.',
      })
      return
    }
    requestXrSimulationWorkbenchOpen()
  }, [pushUiToast])
  const selectSceneTimelineLane = React.useCallback(() => {
    setSelectedTimelineLaneId('scene')
    const result = controlXrSharedAssetControls({
      operation: 'select-target',
      targetId: XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID,
    })
    if (!result.ok) selectBoundXrShotTarget(XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID)
  }, [])
  const selectObjectTimelineLane = React.useCallback((targetId: string) => {
    setSelectedTimelineLaneId(`object:${targetId}`)
    const result = controlXrSharedAssetControls({ operation: 'select-target', targetId })
    if (!result.ok) {
      selectBoundXrShotTarget(targetId)
      pushUiToast({
        id: `xr:timeline:object-target:${targetId}:error`,
        kind: documentLoaded ? 'error' : 'warning',
        message: result.message,
      })
      return
    }
    pushUiToast({
      id: `xr:timeline:object-target:${targetId}:ok`,
      kind: 'success',
      message: result.message,
    })
  }, [documentLoaded, pushUiToast])
  const selectObjectTimelineLaneSurface = React.useCallback((targetId: string) => {
    setSelectedTimelineLaneId(`object:${targetId}`)
    const result = controlXrSharedAssetControls({ operation: 'select-target', targetId })
    if (!result.ok) selectBoundXrShotTarget(targetId)
  }, [])
  const selectSimulationTimelineLane = React.useCallback(() => {
    setSelectedTimelineLaneId('simulation')
    openSimulationWorkbench()
  }, [openSimulationWorkbench])
  const selectSimulationTimelineLaneSurface = React.useCallback(() => {
    setSelectedTimelineLaneId('simulation')
  }, [])
  const selectCameraTimelineLane = React.useCallback(() => {
    setSelectedTimelineLaneId('camera')
  }, [])
  const selectNpcTimelineLane = React.useCallback((npcId: string) => {
    setSelectedTimelineLaneId(`npc:${npcId}`)
    const result = controlXrSharedAssetControls({ operation: 'select-target', targetId: npcId })
    pushUiToast({
      id: `xr:timeline:npc-target:${npcId}:${result.ok ? 'ok' : 'error'}`,
      kind: result.ok ? 'success' : documentLoaded ? 'error' : 'warning',
      message: result.message,
    })
  }, [documentLoaded, pushUiToast])
  const selectNpcTimelineLaneSurface = React.useCallback((npcId: string) => {
    setSelectedTimelineLaneId(`npc:${npcId}`)
    controlXrSharedAssetControls({ operation: 'select-target', targetId: npcId })
  }, [])
  const simulationTimelineLaneSelected = selectedTimelineLaneId === 'simulation'
  const cameraTimelineLaneSelected = selectedTimelineLaneId === 'camera'

  const resolveTimelineLaneDragSeconds = React.useCallback((clientX: number, dragState: XrTimelineLaneBarDragState): number => {
    const insetMetrics = resolveVideoSequenceRulerInsetPixelMetrics(dragState.rectWidth)
    const ratio = Math.min(1, Math.max(0, (clientX - dragState.rectLeft - insetMetrics.insetLeftPx) / insetMetrics.widthPx))
    const scaleSeconds = sceneScaleDurationSeconds > 0 ? sceneScaleDurationSeconds : runtime.plan.durationSeconds
    return Math.min(runtime.plan.durationSeconds, Math.max(0, ratio * scaleSeconds))
  }, [runtime.plan.durationSeconds, sceneScaleDurationSeconds])

  React.useEffect(() => {
    const updateDrag = (clientX: number, clientY: number, preventDefault: () => void) => {
      const dragState = timelineLaneDragStateRef.current
      if (!dragState) return
      const deltaX = clientX - dragState.originClientX
      const deltaY = clientY - dragState.originClientY
      if (!timelineLaneDragMovedRef.current && Math.hypot(deltaX, deltaY) < XR_TIMELINE_LANE_DRAG_THRESHOLD_PX) return
      preventDefault()
      timelineLaneDragMovedRef.current = true
      scrubPlayhead(resolveTimelineLaneDragSeconds(clientX, dragState))
    }
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = timelineLaneDragStateRef.current
      if (!dragState || dragState.input !== 'pointer' || event.pointerId !== dragState.pointerId) return
      updateDrag(event.clientX, event.clientY, () => event.preventDefault())
    }
    const handlePointerEnd = (event: PointerEvent) => {
      const dragState = timelineLaneDragStateRef.current
      if (!dragState || dragState.input !== 'pointer' || event.pointerId !== dragState.pointerId) return
      timelineLaneDragStateRef.current = null
      setDraggingTimelineLaneId(null)
    }
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = timelineLaneDragStateRef.current
      if (!dragState || dragState.input !== 'mouse') return
      updateDrag(event.clientX, event.clientY, () => event.preventDefault())
    }
    const handleMouseEnd = () => {
      const dragState = timelineLaneDragStateRef.current
      if (!dragState || dragState.input !== 'mouse') return
      timelineLaneDragStateRef.current = null
      setDraggingTimelineLaneId(null)
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerEnd, { passive: true })
    window.addEventListener('pointercancel', handlePointerEnd, { passive: true })
    window.addEventListener('mousemove', handleMouseMove, { passive: false })
    window.addEventListener('mouseup', handleMouseEnd, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseEnd)
    }
  }, [resolveTimelineLaneDragSeconds, scrubPlayhead])

  const beginTimelineLaneBarDrag = React.useCallback((
    event: React.PointerEvent<HTMLElement>,
    laneId: XrTimelineLaneSelection,
    selectLane: () => void,
  ) => {
    const primaryButtonActive = event.button === 0 || event.buttons === 1
    if (!primaryButtonActive || runtime.plan.durationSeconds <= 0) return
    const rulerElement = event.currentTarget.closest('[data-kg-gantt-timeline-ruler-content="1"]') as HTMLElement | null
    const rect = rulerElement?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    timelineLaneDragMovedRef.current = false
    timelineLaneDragStateRef.current = {
      input: 'pointer',
      laneId,
      pointerId: event.pointerId,
      originClientX: event.clientX,
      originClientY: event.clientY,
      rectLeft: rect.left,
      rectWidth: rect.width,
    }
    setDraggingTimelineLaneId(laneId)
    selectLane()
  }, [runtime.plan.durationSeconds])

  const beginTimelineLaneBarMouseDrag = React.useCallback((
    event: React.MouseEvent<HTMLElement>,
    laneId: XrTimelineLaneSelection,
    selectLane: () => void,
  ) => {
    if (timelineLaneDragStateRef.current || event.button !== 0 || runtime.plan.durationSeconds <= 0) return
    const rulerElement = event.currentTarget.closest('[data-kg-gantt-timeline-ruler-content="1"]') as HTMLElement | null
    const rect = rulerElement?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    event.stopPropagation()
    timelineLaneDragMovedRef.current = false
    timelineLaneDragStateRef.current = {
      input: 'mouse',
      laneId,
      originClientX: event.clientX,
      originClientY: event.clientY,
      rectLeft: rect.left,
      rectWidth: rect.width,
    }
    setDraggingTimelineLaneId(laneId)
    selectLane()
  }, [runtime.plan.durationSeconds])

  const activateTimelineLaneBarClick = React.useCallback((
    event: React.MouseEvent<HTMLElement>,
    selectLane: () => void,
  ) => {
    if (timelineLaneDragMovedRef.current) {
      event.preventDefault()
      event.stopPropagation()
      timelineLaneDragMovedRef.current = false
      return
    }
    selectLane()
  }, [])

  const applyStage = React.useCallback((stageId: string) => {
    const keepTimelineOpen = () => {
      const state = useGraphStore.getState()
      state.setBottomSurfaceTab('timeline')
      state.setBottomSurfaceCollapsed(false)
    }
    const result = controlLocalXrScene({ action: 'stage', stageId })
    keepTimelineOpen()
    if (typeof window !== 'undefined') window.requestAnimationFrame(keepTimelineOpen)
    pushUiToast({
      id: result.ok ? 'xr:timeline:stage' : 'xr:timeline:stage-error',
      kind: result.ok ? 'success' : documentLoaded ? 'error' : 'warning',
      message: result.message,
    })
  }, [documentLoaded, pushUiToast])
  const renderXrSceneStageClipOverlay = React.useCallback((args: VideoSequenceTimelineClipOverlayRenderArgs) => {
    if (!args.span.rowKey.includes('xr_stage_scene')) return null
    if (!args.selected || selectedTimelineLaneId !== 'scene') return null
    return (
      <section
        className="xr-camera-motion-mark-selection-controls xr-camera-motion-mark-selection-controls--lane xr-timeline-scene-stage-control xr-timeline-scene-stage-control--selected"
        style={sceneEditorStyle}
        aria-label="XR scene stage selector"
        data-kg-xr-motion-stage-field="scene-clip"
        data-kg-xr-motion-scene-controls="click-appear"
        data-kg-xr-motion-scene-control-strip="click-appear"
        data-kg-xr-timeline-control-bar="scene-clip"
        data-kg-xr-timeline-control-lane="scene-clip"
        data-kg-xr-timeline-player-controls="1"
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        <output
          className="xr-camera-motion-mark-selection-label xr-timeline-scene-selection-label"
          aria-label="XR timeline scene or 3D object shot target"
          data-kg-camera-target="scene-or-object"
          data-kg-xr-timeline-shot-target="scene-clip"
        >
          SCENE
        </output>
        <label className="xr-timeline-control-field" data-kg-xr-timeline-playhead-control="scene-clip">
          <PanelTextInput
            className="h-5 w-12 px-1 py-0 text-[9px]"
            type="number"
            min={0}
            max={runtime.plan.durationSeconds}
            step={1 / runtime.plan.fps}
            value={runtime.playheadSeconds}
            onChange={event => scrubPlayhead(Number(event.target.value))}
            aria-label="XR timeline playhead seconds"
            data-kg-xr-timeline-playhead-input="scene-clip"
          />
        </label>
        <PanelSelect
          className="xr-timeline-scene-stage-select"
          aria-label="XR grey-box stage"
          value={runtime.plan.stageId}
          onChange={event => applyStage(event.target.value)}
          data-kg-xr-motion-stage-select="scene-clip"
          data-kg-xr-motion-stage-select-lane="scene"
        >
          {XR_MOTION_REFERENCE_STAGE_PRESETS.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </PanelSelect>
        <span className={cn('xr-timeline-control-status xr-timeline-scene-stage-summary-chip', UI_THEME_TOKENS.text.tertiary)} data-kg-xr-motion-stage-summary="scene-clip">
          {documentLoaded ? `${objectTargets.length} objects · ${edges} links` : 'World ready'} · {runtime.plan.camera.length} camera marks · {speedWarnings.length ? `${speedWarnings.length} speed warnings` : 'speed sane'}
        </span>
        <button type="button" className="App-toolbar__btn h-5 px-1.5 text-[9px]" disabled={!graphData || !runtime.dirty} onClick={savePlan} data-kg-xr-motion-save="1">
          Save
        </button>
        <button type="button" className="App-toolbar__btn h-5 px-1.5 text-[9px]" disabled={!graphData} onClick={exportPackage} data-kg-xr-motion-export="1">
          Export
        </button>
      </section>
    )
  }, [applyStage, documentLoaded, edges, exportPackage, graphData, objectTargets.length, runtime.dirty, runtime.plan.camera.length, runtime.plan.durationSeconds, runtime.plan.fps, runtime.plan.stageId, runtime.playheadSeconds, savePlan, sceneEditorStyle, scrubPlayhead, selectedTimelineLaneId, speedWarnings.length])

  const nativeControllerActive = nativeController.phase !== 'off'
  const simulationPhase = nativeControllerActive ? nativeController.phase : physics.phase
  const simulationBodyCount = nativeControllerActive
    ? readSharedXrNativeControllerDemoFrame().bodies.length
    : physics.world.bodies.length
  const simulationRuntime = nativeControllerActive ? 'native-controller' : 'scene'
  if (!xrActive) return null

  return (
    <section
      className="min-w-0 space-y-2"
      aria-label="XR Timeline player"
      data-kg-xr-timeline-player="1"
      data-kg-xr-timeline-lane="scene"
      data-kg-xr-timeline-document-loaded={documentLoaded ? '1' : '0'}
      data-kg-xr-timeline-source-format={sourceProfile.format}
      data-kg-xr-timeline-scene="player"
      data-kg-xr-timeline-runtime={xrActive ? 'active' : 'available'}
      data-kg-xr-timeline-shot-target={selectedShotTarget.id}
      onClickCapture={event => {
        const target = event.target instanceof HTMLElement ? event.target : null
        if (target?.closest('[data-kg-gantt-timeline-track-row-key*="xr_stage_scene"]')) {
          selectSceneTimelineLane()
        }
      }}
    >
      <section aria-label="XR animation timeline" data-kg-xr-timeline-transport="reused-gantt-player">
        <GanttTimelineTransportPanel
          code={timelineCode}
          clockActive
          compact
          editable={false}
          mode="media"
          publishPlaybackRequest={false}
          renderClipOverlay={renderXrSceneStageClipOverlay}
          runtimeDocumentKey={xrTransportDocumentKey}
          runtimeDurationSeconds={runtime.plan.durationSeconds}
          runtimeFrameRate={runtime.plan.fps}
          onSelectedRowKeyChange={rowKey => {
            if (rowKey?.includes('xr_stage_scene')) {
              selectSceneTimelineLane()
            }
          }}
          timelineInsertedLanes={[
            {
              id: 'xr-simulation',
              insertAfterLaneId: 'scene',
              selected: simulationTimelineLaneSelected,
              label: (
                <button
                  type="button"
                  className="xr-camera-motion-retime-lane-label xr-shot-target-lane-label"
                  aria-label="Open XR Simulation workbench"
                  aria-pressed={simulationTimelineLaneSelected}
                  onClick={selectSimulationTimelineLane}
                  data-kg-xr-simulation-lane-label="1"
                  data-kg-xr-timeline-lane-hit-target="simulation-label"
                >
                  <i aria-hidden style={{ backgroundColor: '#22c55e' }} />
                  <b>Simulation</b>
                  <small>{simulationBodyCount}</small>
                </button>
              ),
              content: (
                <TimelineTransportTimeAxisClip
                  laneStyle="audio"
                  className={cn(
                    'xr-camera-motion-retime-time-axis-rail',
                    simulationTimelineLaneSelected && 'timeline-transport-track-clip--selected',
                  )}
                  aria-label="XR Simulation runtime lane"
                  aria-current={simulationTimelineLaneSelected ? 'true' : undefined}
                  style={simulationTimelineLaneSelected ? SELECTED_INSERTED_TIMELINE_CLIP_STYLE : undefined}
                  data-kg-xr-simulation-lane="1"
                  data-kg-xr-timeline-lane-affordance="simulation"
                  data-kg-xr-timeline-lane-selected={simulationTimelineLaneSelected ? '1' : undefined}
                >
                  <section
                    className="xr-shot-target-timeline-lane"
                    data-kg-xr-simulation-phase={simulationPhase}
                    data-kg-xr-simulation-runtime={simulationRuntime}
                    data-kg-xr-timeline-lane-selected={simulationTimelineLaneSelected ? '1' : undefined}
                  >
                    <button
                      type="button"
                      className="xr-shot-target-timeline-bar"
                      style={{ '--kg-xr-shot-target-color': '#22c55e' } as React.CSSProperties}
                      aria-label={`Open XR Simulation workbench. ${simulationPhase}; ${simulationBodyCount} bodies. Drag to scrub XR timeline.`}
                      aria-pressed={simulationTimelineLaneSelected}
                      onClick={event => activateTimelineLaneBarClick(event, selectSimulationTimelineLane)}
                      onMouseDown={event => beginTimelineLaneBarMouseDrag(event, 'simulation', selectSimulationTimelineLaneSurface)}
                      onPointerDown={event => beginTimelineLaneBarDrag(event, 'simulation', selectSimulationTimelineLaneSurface)}
                      title={`${simulationPhase} · ${simulationBodyCount} bodies · drag to scrub`}
                      data-kg-xr-simulation-bar="full-scene"
                      data-kg-xr-timeline-lane-drag="scrub"
                      data-kg-xr-timeline-lane-dragging={draggingTimelineLaneId === 'simulation' ? '1' : undefined}
                      data-kg-xr-timeline-lane-hit-target="simulation"
                    >
                      <span>{simulationPhase} · {simulationBodyCount} bod{simulationBodyCount === 1 ? 'y' : 'ies'}</span>
                    </button>
                  </section>
                </TimelineTransportTimeAxisClip>
              ),
            },
            ...gameMission.npcs.map(npc => {
              const selected = selectedTimelineLaneId === `npc:${npc.id}`
              const npcColor = GAME_FPS_NPC_TIMELINE_COLORS[npc.action]
              return {
                id: `xr-gameplay-npc:${npc.id}`,
                insertAfterLaneId: 'scene',
                selected,
                label: (
                  <button
                    type="button"
                    className="xr-camera-motion-retime-lane-label xr-shot-target-lane-label"
                    aria-label={`Select gameplay NPC ${npc.id}`}
                    aria-pressed={selected}
                    onClick={() => selectNpcTimelineLane(npc.id)}
                    data-kg-xr-gameplay-npc-lane-label={npc.id}
                    data-kg-xr-timeline-lane-hit-target={`npc-label:${npc.id}`}
                  >
                    <i aria-hidden style={{ backgroundColor: npcColor }} />
                    <b title={npc.id}>{npc.id}</b>
                    <small>{Math.round(npc.health)}</small>
                  </button>
                ),
                content: (
                  <TimelineTransportTimeAxisClip
                    laneStyle="video"
                    className={cn(
                      'xr-camera-motion-retime-time-axis-rail',
                      selected && 'timeline-transport-track-clip--selected',
                    )}
                    aria-label={`${npc.id} gameplay NPC time rail`}
                    aria-current={selected ? 'true' : undefined}
                    style={selected ? SELECTED_INSERTED_TIMELINE_CLIP_STYLE : undefined}
                    data-kg-xr-gameplay-npc-shared-axis-rail={npc.id}
                    data-kg-xr-timeline-lane-affordance={`npc:${npc.id}`}
                    data-kg-xr-timeline-lane-selected={selected ? '1' : undefined}
                  >
                    <section
                      className="xr-shot-target-timeline-lane"
                      data-kg-xr-gameplay-npc-lane={npc.id}
                      data-kg-xr-gameplay-npc-action={npc.action}
                      data-kg-xr-gameplay-npc-selected={selected ? '1' : undefined}
                      data-kg-xr-timeline-lane-selected={selected ? '1' : undefined}
                    >
                      <button
                        type="button"
                        className="xr-shot-target-timeline-bar"
                        style={{ '--kg-xr-shot-target-color': npcColor } as React.CSSProperties}
                        aria-label={`Select ${npc.id} for shared 3D for XR controls. Drag to scrub XR timeline.`}
                        aria-pressed={selected}
                        onClick={event => activateTimelineLaneBarClick(event, () => selectNpcTimelineLane(npc.id))}
                        onMouseDown={event => beginTimelineLaneBarMouseDrag(event, `npc:${npc.id}`, () => selectNpcTimelineLaneSurface(npc.id))}
                        onPointerDown={event => beginTimelineLaneBarDrag(event, `npc:${npc.id}`, () => selectNpcTimelineLaneSurface(npc.id))}
                        title={`${npc.id} · ${npc.action} · ${Math.round(npc.health)} HP · drag to scrub`}
                        data-kg-xr-gameplay-npc-bar={npc.id}
                        data-kg-xr-shared-asset-target={npc.id}
                        data-kg-xr-timeline-lane-drag="scrub"
                        data-kg-xr-timeline-lane-dragging={draggingTimelineLaneId === `npc:${npc.id}` ? '1' : undefined}
                        data-kg-xr-timeline-lane-hit-target={`npc:${npc.id}`}
                      >
                        <span>{npc.id} · {npc.action} · {Math.round(npc.health)} HP</span>
                      </button>
                    </section>
                  </TimelineTransportTimeAxisClip>
                ),
              }
            }),
            ...objectTargets.map(target => {
              const track = target.castActorId
                ? runtime.plan.cast.find(candidate => candidate.actorId === target.castActorId) || null
                : null
              const selected = selectedTimelineLaneId === `object:${target.id}`
              return {
                id: `xr-object:${target.id}`,
                insertAfterLaneId: 'scene',
                selected,
                label: (
                  <button
                    type="button"
                    className="xr-camera-motion-retime-lane-label xr-shot-target-lane-label"
                    aria-label={`Link SHOOT to 3D Object ${target.label}`}
                    aria-pressed={selected}
                    onClick={() => selectObjectTimelineLane(target.id)}
                    data-kg-xr-shot-target-lane-label={target.id}
                    data-kg-xr-choreography-cast-lane-label={track?.actorId}
                    data-kg-xr-timeline-lane-hit-target={`object-label:${target.id}`}
                  >
                    <i aria-hidden style={{ backgroundColor: target.color }} />
                    <b title={target.label}>{target.label}</b>
                    <small>{track?.marks.length || 'shot'}</small>
                  </button>
                ),
                content: (
                  <TimelineTransportTimeAxisClip
                    laneStyle="video"
                    className={cn(
                      'xr-camera-motion-retime-time-axis-rail',
                      selected && 'timeline-transport-track-clip--selected',
                    )}
                    aria-label={`${target.label} linked SHOOT time rail`}
                    aria-current={selected ? 'true' : undefined}
                    style={selected ? SELECTED_INSERTED_TIMELINE_CLIP_STYLE : undefined}
                    data-kg-xr-choreography-shared-axis-rail={track ? 'cast' : 'object'}
                    data-kg-xr-timeline-lane-affordance={`object:${target.id}`}
                    data-kg-xr-timeline-lane-selected={selected ? '1' : undefined}
                  >
                    <section
                      className="xr-shot-target-timeline-lane"
                      data-kg-xr-shot-target-lane={target.id}
                      data-kg-xr-shot-target-selected={selected ? '1' : undefined}
                      data-kg-xr-timeline-lane-selected={selected ? '1' : undefined}
                    >
                      <button
                        type="button"
                        className="xr-shot-target-timeline-bar"
                        style={{ '--kg-xr-shot-target-color': target.color } as React.CSSProperties}
                        aria-label={`Link SHOOT to ${target.label} for the full scene. Drag to scrub XR timeline.`}
                        aria-pressed={selected}
                        onClick={event => activateTimelineLaneBarClick(event, () => selectObjectTimelineLane(target.id))}
                        onMouseDown={event => beginTimelineLaneBarMouseDrag(event, `object:${target.id}`, () => selectObjectTimelineLaneSurface(target.id))}
                        onPointerDown={event => beginTimelineLaneBarDrag(event, `object:${target.id}`, () => selectObjectTimelineLaneSurface(target.id))}
                        title={`${target.label} · drag to scrub`}
                        data-kg-xr-shot-target-bar={target.id}
                        data-kg-xr-timeline-lane-drag="scrub"
                        data-kg-xr-timeline-lane-dragging={draggingTimelineLaneId === `object:${target.id}` ? '1' : undefined}
                        data-kg-xr-timeline-lane-hit-target={`object:${target.id}`}
                      >
                        <span>{target.label}</span>
                      </button>
                      {track ? (
                        <CameraMotionMarkRetime
                          laneSurfaceDragging={draggingTimelineLaneId === `object:${target.id}`}
                          layout="lane"
                          laneTarget={{ kind: 'cast', actorId: track.actorId }}
                          onLaneSurfaceClick={event => activateTimelineLaneBarClick(event, () => selectObjectTimelineLane(target.id))}
                          onLaneSurfaceMouseDown={event => beginTimelineLaneBarMouseDrag(event, `object:${target.id}`, () => selectObjectTimelineLaneSurface(target.id))}
                          onLaneSurfacePointerDown={event => beginTimelineLaneBarDrag(event, `object:${target.id}`, () => selectObjectTimelineLaneSurface(target.id))}
                        />
                      ) : null}
                    </section>
                  </TimelineTransportTimeAxisClip>
                ),
              }
            }),
            {
              id: 'xr-camera',
              insertAfterLaneId: 'scene',
              selected: cameraTimelineLaneSelected,
              label: (
                <button
                  type="button"
                  className="xr-camera-motion-retime-lane-label xr-shot-target-lane-label"
                  aria-label="Select Camera choreography lane"
                  aria-pressed={cameraTimelineLaneSelected}
                  onClick={selectCameraTimelineLane}
                  data-kg-xr-choreography-camera-lane-label="1"
                  data-kg-xr-timeline-lane-hit-target="camera-label"
                >
                  <i aria-hidden className="xr-camera-motion-retime-camera-swatch" />
                  <b>Camera</b>
                  <small>{runtime.plan.camera.length}</small>
                </button>
              ),
              content: (
                <TimelineTransportTimeAxisClip
                  laneStyle="audio"
                  className={cn(
                    'xr-camera-motion-retime-time-axis-rail',
                    cameraTimelineLaneSelected && 'timeline-transport-track-clip--selected',
                  )}
                  aria-label="Camera choreography time rail"
                  aria-current={cameraTimelineLaneSelected ? 'true' : undefined}
                  style={cameraTimelineLaneSelected ? SELECTED_INSERTED_TIMELINE_CLIP_STYLE : undefined}
                  data-kg-xr-choreography-shared-axis-rail="camera"
                  data-kg-xr-timeline-lane-affordance="camera"
                  data-kg-xr-timeline-lane-selected={cameraTimelineLaneSelected ? '1' : undefined}
                >
                  <section
                    className="xr-shot-target-timeline-lane"
                    data-kg-xr-camera-lane="1"
                    data-kg-xr-timeline-lane-selected={cameraTimelineLaneSelected ? '1' : undefined}
                  >
                    <button
                      type="button"
                      className="xr-shot-target-timeline-bar xr-shot-target-timeline-bar--camera"
                      style={{ '--kg-xr-shot-target-color': '#64748b' } as React.CSSProperties}
                      aria-label="Select Camera choreography lane. Drag to scrub XR timeline."
                      aria-pressed={cameraTimelineLaneSelected}
                      onClick={event => activateTimelineLaneBarClick(event, selectCameraTimelineLane)}
                      onMouseDown={event => beginTimelineLaneBarMouseDrag(event, 'camera', selectCameraTimelineLane)}
                      onPointerDown={event => beginTimelineLaneBarDrag(event, 'camera', selectCameraTimelineLane)}
                      title="Camera marks · drag to scrub"
                      data-kg-xr-camera-lane-bar="1"
                      data-kg-xr-timeline-lane-drag="scrub"
                      data-kg-xr-timeline-lane-dragging={draggingTimelineLaneId === 'camera' ? '1' : undefined}
                      data-kg-xr-timeline-lane-hit-target="camera"
                    >
                      <span>Camera marks · {runtime.plan.camera.length}</span>
                    </button>
                    <CameraMotionMarkRetime
                      laneSurfaceDragging={draggingTimelineLaneId === 'camera'}
                      layout="lane"
                      laneTarget={{ kind: 'camera' }}
                      onLaneSurfaceClick={event => activateTimelineLaneBarClick(event, selectCameraTimelineLane)}
                      onLaneSurfaceMouseDown={event => beginTimelineLaneBarMouseDrag(event, 'camera', selectCameraTimelineLane)}
                      onLaneSurfacePointerDown={event => beginTimelineLaneBarDrag(event, 'camera', selectCameraTimelineLane)}
                    />
                  </section>
                </TimelineTransportTimeAxisClip>
              ),
            },
          ]}
          timeAxisControls={(
            <section className="flex min-w-0 items-center gap-2" aria-label="XR timeline scale controls" data-kg-timeline-axis-controls-layout="duration-fps">
              <label className="flex min-w-0 items-center gap-1 text-[9px]" data-kg-xr-timeline-seconds-control="time-axis">
                <span className={UI_THEME_TOKENS.text.tertiary}>Seconds</span>
                <PanelTextInput
                  aria-label="XR timeline seconds"
                  className="h-5 w-12 px-1 py-0 text-[10px]"
                  type="number"
                  min={1}
                  max={30}
                  step={0.5}
                  value={runtime.plan.durationSeconds}
                  onChange={event => setXrMotionReferenceDuration(Number(event.target.value))}
                />
              </label>
              <label className="flex min-w-0 items-center gap-1 text-[9px]" data-kg-xr-timeline-fps-control="time-axis">
                <span className={UI_THEME_TOKENS.text.tertiary}>FPS</span>
                <PanelTextInput
                  aria-label="XR timeline FPS"
                  className="h-5 w-12 px-1 py-0 text-[10px]"
                  type="number"
                  min={6}
                  max={30}
                  step={1}
                  value={runtime.plan.fps}
                  onChange={event => setXrMotionReferenceFps(Number(event.target.value))}
                />
              </label>
            </section>
          )}
        />
      </section>
    </section>
  )
}
