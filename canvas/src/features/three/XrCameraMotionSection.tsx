import { persistXrSceneToAuthoredSource } from './xrScenePersistence'
import React from 'react'
import type { VideoSequenceTimelineClipOverlayRenderArgs } from '@/components/timeline/VideoSequenceTimelineRuler'
import {
  resolveVideoSequenceRulerInsetLeft, resolveVideoSequenceRulerInsetWidth,
} from '@/components/timeline/videoSequenceTimelineRulerGeometry'
import { resolveVideoSequenceTimelineScaleDurationSeconds } from '@/components/timeline/videoSequenceTimelineZoom'
import { requestXrSimulationWorkbenchOpen } from '@/features/command-menu/xrSimulationWorkbenchOpenRequest'
import { useShallow } from 'zustand/react/shallow'
import { GanttTimelineTransportPanel } from '@/features/gitgraph/GanttTimelineTransportPanel'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useTimelineTransportStoreBinding } from '@/components/timeline/timelineTransport'
import { buildXrMotionReferencePackage, xrMotionReferencePackageBlob, xrMotionReferencePackageFilename } from './xrMotionReferencePackage'
import {
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
import { buildXrTimelineInsertedLanes } from './XrTimelineInsertedLanes'
import { controlLocalAnimation } from './xrAnimationMcpRuntime'
import { selectXrTimelineRow } from './xrTimelineCueRuntime'
import {
  resolveXrRehearsalTimelineBeatAt,
  resolveXrRehearsalTimelineBeats,
} from './xrRehearsalTimelineBeats'
import { XrRehearsalTimelineBeatMarks } from './XrRehearsalTimelineBeatMarks'
import { XrTimelineSceneStageControls } from './XrTimelineSceneStageControls'
import { useXrTimelineLaneSelection, type XrTimelineLaneSelection } from './useXrTimelineLaneSelection'
import { xrTimelineCommandAdapter } from './xrTimelineCommandAdapter'
import { XrTimelineRehearsalControls } from './XrTimelineRehearsalControls'
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
  } = useGraphStore(
    useShallow(state => ({
      canvas3dMode: state.canvas3dMode,
      canvasRenderMode: state.canvasRenderMode,
      graphData: state.graphData,
      markdownDocumentName: state.markdownDocumentName,
      markdownDocumentText: state.markdownDocumentText,
      pushUiToast: state.pushUiToast,
      selectedNodeId: state.selectedNodeId,
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
  const [selectedTimelineLaneId, setSelectedTimelineLaneId] = useXrTimelineLaneSelection(timelineCode, selectedShotTarget.id,
    sharedAssetControls.selectedKind || '', sharedAssetControls.selectedTargetId || '', JSON.stringify(runtime.selectedMark))
  const [savingScene, setSavingScene] = React.useState(false)
  const edges = Array.isArray(graphData?.edges) ? graphData.edges.length : 0
  const sceneScaleDurationSeconds = resolveVideoSequenceTimelineScaleDurationSeconds(runtime.plan.durationSeconds)
  const rehearsalBeats = React.useMemo(() => resolveXrRehearsalTimelineBeats(runtime.plan), [runtime.plan])
  const currentRehearsalBeat = React.useMemo(
    () => resolveXrRehearsalTimelineBeatAt(runtime.plan, runtime.playheadSeconds),
    [runtime.plan, runtime.playheadSeconds],
  )
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

  const savePlan = React.useCallback(async () => {
    if (!graphData || savingScene) return
    setSavingScene(true)
    const result = await persistXrSceneToAuthoredSource()
    setSavingScene(false)
    pushUiToast({
      id: result.ok ? 'xr:motion-reference:save' : 'xr:motion-reference:save-error',
      kind: result.ok ? 'success' : 'error',
      message: result.message,
    })
  }, [graphData, pushUiToast, savingScene])

  const exportPackage = React.useCallback(() => {
    if (!graphData) return
    const bundle = buildXrMotionReferencePackage({
      plan: readXrMotionReferenceRuntime().plan,
      graphData: useGraphStore.getState().graphData || graphData,
      documentName: useGraphStore.getState().markdownDocumentName || 'Untitled',
    })
    downloadBlob(xrMotionReferencePackageBlob(bundle), xrMotionReferencePackageFilename(bundle))
    pushUiToast({
      id: 'xr:motion-reference:export',
      kind: 'success',
      message: `Exported ${bundle.timeline.frameCount} deterministic motion samples.`,
    })
  }, [graphData, pushUiToast])

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
  }, [setSelectedTimelineLaneId])
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
  }, [documentLoaded, pushUiToast, setSelectedTimelineLaneId])
  const selectObjectTimelineLaneSurface = React.useCallback((targetId: string) => {
    setSelectedTimelineLaneId(`object:${targetId}`)
    const result = controlXrSharedAssetControls({ operation: 'select-target', targetId })
    if (!result.ok) selectBoundXrShotTarget(targetId)
  }, [setSelectedTimelineLaneId])
  const selectSimulationTimelineLane = React.useCallback(() => {
    setSelectedTimelineLaneId('simulation')
    openSimulationWorkbench()
  }, [openSimulationWorkbench, setSelectedTimelineLaneId])
  const selectSimulationTimelineLaneSurface = React.useCallback(() => {
    setSelectedTimelineLaneId('simulation')
  }, [setSelectedTimelineLaneId])
  const selectCameraTimelineLane = React.useCallback(() => {
    setSelectedTimelineLaneId('camera')
  }, [setSelectedTimelineLaneId])
  const selectNpcTimelineLane = React.useCallback((npcId: string) => {
    setSelectedTimelineLaneId(`npc:${npcId}`)
    const result = controlXrSharedAssetControls({ operation: 'select-target', targetId: npcId })
    pushUiToast({
      id: `xr:timeline:npc-target:${npcId}:${result.ok ? 'ok' : 'error'}`,
      kind: result.ok ? 'success' : documentLoaded ? 'error' : 'warning',
      message: result.message,
    })
  }, [documentLoaded, pushUiToast, setSelectedTimelineLaneId])
  const selectNpcTimelineLaneSurface = React.useCallback((npcId: string) => {
    setSelectedTimelineLaneId(`npc:${npcId}`)
    controlXrSharedAssetControls({ operation: 'select-target', targetId: npcId })
  }, [setSelectedTimelineLaneId])
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
    const durationSeconds = runtime.plan.durationSeconds
    const beatMarks = (
      <XrRehearsalTimelineBeatMarks
        beats={rehearsalBeats}
        activeMarkId={currentRehearsalBeat?.markId}
        durationSeconds={durationSeconds}
      />
    )
    if (!args.selected || selectedTimelineLaneId !== 'scene') return beatMarks
    return (
      <>
        {beatMarks}
        <XrTimelineSceneStageControls
          applyStage={applyStage}
          beatLabel={currentRehearsalBeat?.label || (runtime.plan.stageId === 'tropical-playground' ? 'Tropical Playground' : 'SCENE')}
          cameraMarkCount={runtime.plan.camera.length}
          documentLoaded={documentLoaded}
          durationSeconds={runtime.plan.durationSeconds}
          edges={edges}
          exportPackage={exportPackage}
          fps={runtime.plan.fps}
          graphReady={Boolean(graphData)}
          objectCount={objectTargets.length}
          playheadSeconds={runtime.playheadSeconds}
          saveDisabled={!graphData || savingScene}
          savingScene={savingScene}
          savePlan={savePlan}
          sceneEditorStyle={sceneEditorStyle}
          scrubPlayhead={scrubPlayhead}
          speedWarningCount={speedWarnings.length}
          stageId={runtime.plan.stageId}
        />
      </>
    )
  }, [applyStage, currentRehearsalBeat, documentLoaded, edges, exportPackage, graphData, objectTargets.length, rehearsalBeats, runtime.plan.camera.length, runtime.plan.durationSeconds, runtime.plan.fps, runtime.plan.stageId, runtime.playheadSeconds, savePlan, savingScene, sceneEditorStyle, scrubPlayhead, selectedTimelineLaneId, speedWarnings.length])

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
      <section aria-label="XR animation timeline" data-kg-xr-timeline-transport="reused-gantt-player" style={{ '--kg-xr-scene-span-width': resolveVideoSequenceRulerInsetWidth(runtime.plan.durationSeconds / sceneScaleDurationSeconds * 100) } as React.CSSProperties}>
        <GanttTimelineTransportPanel
          transportControls={<XrTimelineRehearsalControls durationSeconds={runtime.plan.durationSeconds} fps={runtime.plan.fps} disabled={!documentLoaded} />}
          code={timelineCode}
          clockActive
          compact
          editable={false}
          commandAdapter={xrTimelineCommandAdapter}
          mode="media"
          publishPlaybackRequest={false}
          renderClipOverlay={renderXrSceneStageClipOverlay}
          runtimeDocumentKey={xrTransportDocumentKey}
          runtimeDurationSeconds={runtime.plan.durationSeconds}
          runtimeFrameRate={runtime.plan.fps}
          onSelectedRowKeyChange={rowKey => {
            if (rowKey?.startsWith('xr-lane:object:')) selectObjectTimelineLaneSurface(rowKey.slice('xr-lane:object:'.length))
            else if (rowKey?.startsWith('xr-lane:npc:')) selectNpcTimelineLaneSurface(rowKey.slice('xr-lane:npc:'.length))
            else if (rowKey === 'xr-lane:camera') selectCameraTimelineLane()
            else if (rowKey === 'xr-lane:simulation') selectSimulationTimelineLaneSurface()
            else selectXrTimelineRow(runtime.plan, rowKey, selectSceneTimelineLane)
          }}
          timelineInsertedLanes={buildXrTimelineInsertedLanes({
            runtime, gameMission, objectTargets, currentRehearsalBeat, selectedTimelineLaneId,
            sceneScaleDurationSeconds, documentLoaded, simulationPhase, simulationBodyCount, simulationRuntime,
            selectObjectTimelineLane, selectCameraTimelineLane, selectSimulationTimelineLane, selectNpcTimelineLane,
          })}
          timeAxisControls={(
            <section className="flex min-w-0 flex-wrap items-center gap-2" aria-label="XR timeline scale controls" data-kg-timeline-axis-controls-layout="duration-fps">
              <label className="flex min-w-0 items-center gap-1 text-xs" data-kg-xr-timeline-seconds-control="time-axis">
                <span className={UI_THEME_TOKENS.text.tertiary}>Seconds</span>
                <PanelTextInput
                  aria-label="XR timeline seconds"
                  className="h-5 w-12 px-1 py-0 text-xs"
                  type="number" min={1} max={30} step={0.5}
                  value={runtime.plan.durationSeconds}
                  onChange={event => setXrMotionReferenceDuration(Number(event.target.value))}
                />
              </label>
              <label className="flex min-w-0 items-center gap-1 text-xs" data-kg-xr-timeline-fps-control="time-axis">
                <span className={UI_THEME_TOKENS.text.tertiary}>FPS</span>
                <PanelTextInput
                  aria-label="XR timeline FPS"
                  className="h-5 w-12 px-1 py-0 text-xs"
                  type="number" min={6} max={30} step={1}
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
