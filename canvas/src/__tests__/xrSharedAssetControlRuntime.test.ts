import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GraphData } from '@/lib/graph/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import {
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  readXrMotionReferencePlan,
  serializeXrMotionReferencePlan,
} from '@/features/three/xrMotionReferenceModel'
import {
  hydrateCanonicalXrMotionReferenceRuntime,
  hydrateCanonicalXrPhysicsRuntime,
} from '@/features/three/XrMotionReferenceRuntimeBridge'
import {
  applyXrTimelineCastAnimationPreset,
  inspectXrSharedAssetControls,
  controlXrSharedAssetControls,
  readXrSharedAssetGameplayNpcControl,
} from '@/features/three/xrSharedAssetControlRuntime'
import {
  resolveXrObjectKeyboardMotionTarget,
} from '@/features/three/XrKeyboardChoreographyRuntime'
import { readXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { xrMotionReferenceTimelineDocumentKey } from '@/features/three/xrMotionReferenceTimeline'

const source = (...parts: string[]) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')

function buildSharedAssetGraph(): GraphData {
  const plan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    durationSeconds: 8,
    subjects: [
      { id: 'shared-performer', assetId: 'person-adult', label: 'Shared Performer', position: [0, 0, -5.2] },
      { id: 'shared-sedan', assetId: 'vehicle-sedan', label: 'Shared Sedan', position: [0, 0, 0] },
      { id: 'loose-performer', assetId: 'person-adult', label: 'Loose Performer', position: [2.2, 0, -3.8] },
      { id: 'loose-debris', assetId: 'prop-debris-cluster', label: 'Loose Debris', position: [-2.2, 0, -1.8] },
    ],
    cast: [
      { actorId: 'shared-performer', label: 'Shared Performer', marks: [{ timeSeconds: 0, position: [0, 0, -5.2], transition: 'hold', gait: 'hold' }] },
      { actorId: 'shared-sedan', label: 'Shared Sedan', marks: [{ timeSeconds: 0, position: [0, 0, 0], transition: 'hold', gait: 'hold' }] },
    ],
  })
  return {
    type: 'Graph',
    nodes: [],
    edges: [],
    metadata: { [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serializeXrMotionReferencePlan(plan) },
  }
}

export function testSharedXrAssetControlsDriveMediaMotionTimelineAndGroundedGameMode(): void {
  const previousState = useGraphStore.getState()
  const previousSurface = {
    markdownDocumentName: previousState.markdownDocumentName,
    markdownDocumentText: previousState.markdownDocumentText,
    graphData: previousState.graphData,
    selectedNodeId: previousState.selectedNodeId,
    canvasRenderMode: previousState.canvasRenderMode,
    canvas3dMode: previousState.canvas3dMode,
    floatingPanelOpen: previousState.floatingPanelOpen,
    floatingPanelView: previousState.floatingPanelView,
    bottomSurfaceCollapsed: previousState.bottomSurfaceCollapsed,
    bottomSurfaceTab: previousState.bottomSurfaceTab,
    timelineTransportDocumentKey: previousState.timelineTransportDocumentKey,
    timelineTransportPosition: previousState.timelineTransportPosition,
    timelineTransportPlaying: previousState.timelineTransportPlaying,
  }
  try {
    completeSourceFilesBootstrap()
    useGraphStore.setState({
      markdownDocumentName: 'Shared XR Asset Controls.md',
      markdownDocumentText: '# Shared XR Asset Controls',
      graphData: buildSharedAssetGraph(),
      selectedNodeId: null,
      canvasRenderMode: '3d',
      canvas3dMode: 'xr',
      floatingPanelOpen: true,
      floatingPanelView: 'gameMode',
      bottomSurfaceCollapsed: false,
      bottomSurfaceTab: 'timeline',
      timelineTransportDocumentKey: '',
      timelineTransportPosition: 0,
      timelineTransportPlaying: false,
    } as never)
    hydrateCanonicalXrMotionReferenceRuntime()
    hydrateCanonicalXrPhysicsRuntime()

    const selected = controlXrSharedAssetControls({ operation: 'select-target', targetId: 'shared-performer' })
    const applied = controlXrSharedAssetControls({ operation: 'apply-animation', presetId: 'dance' })
    const timelineLaneApplied = applyXrTimelineCastAnimationPreset({ targetId: 'shared-performer', presetId: 'fight' })
    const runtimeAfterDance = readXrMotionReferenceRuntime()
    const savedAfterDance = readXrMotionReferencePlan(useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY])
    if (!selected.ok
      || !applied.ok
      || !timelineLaneApplied.ok
      || runtimeAfterDance.plan.cast.find(track => track.actorId === 'shared-performer')?.animation?.presetId !== 'fight'
      || savedAfterDance.cast.find(track => track.actorId === 'shared-performer')?.animation?.presetId !== 'fight'
      || useGraphStore.getState().floatingPanelView !== 'gameMode') {
      throw new Error(`expected shared XR controls and the timeline lane dropdown to animate the selected humanoid without stealing the Game Mode panel, got ${JSON.stringify({ selected, applied, timelineLaneApplied, floatingPanelView: useGraphStore.getState().floatingPanelView })}`)
    }

    const armed = controlXrSharedAssetControls({ operation: 'arm-gesture-mark' })
    if (!armed.ok || !readXrMotionReferenceRuntime().castMarkArmed) {
      throw new Error(`expected shared gesture mark arming to use the canonical cast-mark state, got ${JSON.stringify(armed)}`)
    }

    const timelineKey = xrMotionReferenceTimelineDocumentKey('Shared XR Asset Controls.md')
    const played = controlXrSharedAssetControls({ operation: 'play-timeline' })
    const scrubbed = controlXrSharedAssetControls({ operation: 'scrub-timeline', timeSeconds: 1.5 })
    const stateAfterTimeline = useGraphStore.getState()
    if (!played.ok
      || !scrubbed.ok
      || stateAfterTimeline.timelineTransportDocumentKey !== timelineKey
      || !stateAfterTimeline.timelineTransportPlaying
      || readXrMotionReferenceRuntime().playheadSeconds !== 1.5) {
      throw new Error(`expected shared controls to drive the BottomPanel Timeline transport, got ${JSON.stringify({ played, scrubbed, timelineTransportDocumentKey: stateAfterTimeline.timelineTransportDocumentKey, timelineTransportPlaying: stateAfterTimeline.timelineTransportPlaying })}`)
    }

    const selectedVehicle = controlXrSharedAssetControls({ operation: 'select-target', targetId: 'shared-sedan' })
    const vehicleInspection = inspectXrSharedAssetControls()
    const appliedVehicle = controlXrSharedAssetControls({ operation: 'apply-animation', presetId: 'car-chase' })
    const vehicleTrack = readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === 'shared-sedan')
    if (!selectedVehicle.ok
      || !vehicleInspection.compatiblePresetIds.includes('car-chase')
      || !appliedVehicle.ok
      || vehicleTrack?.animation?.presetId !== 'car-chase'
      || vehicleTrack.marks.length <= 1) {
      throw new Error(`expected shared controls to animate mobile 3D for XR assets through action paths, got ${JSON.stringify({ selectedVehicle, vehicleInspection, appliedVehicle, vehicleTrack })}`)
    }

    const selectedLooseProp = controlXrSharedAssetControls({ operation: 'select-target', targetId: 'loose-debris' })
    const loosePropInspection = inspectXrSharedAssetControls()
    const loosePropTrack = readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === 'loose-debris')
    const loosePropKeyboardTarget = resolveXrObjectKeyboardMotionTarget(readXrMotionReferenceRuntime(), { key: 'd' })
    const savedAfterLoosePropSelect = readXrMotionReferencePlan(useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY])
    if (!selectedLooseProp.ok
      || loosePropInspection.selectedActorId !== 'loose-debris'
      || !loosePropInspection.compatiblePresetIds.includes('collapsing-debris')
      || loosePropTrack?.marks[0]?.position[0] !== -2.2
      || loosePropKeyboardTarget?.actorId !== 'loose-debris'
      || loosePropKeyboardTarget.markId !== loosePropTrack?.marks[0]?.id
      || Math.abs(Number(loosePropKeyboardTarget.nextPosition?.[0]) - -1.95) > 0.000001
      || !savedAfterLoosePropSelect.cast.some(track => track.actorId === 'loose-debris')) {
      throw new Error(`expected selecting a placed XR prop lane without cast metadata to promote it for animation and WASD Motion Control, got ${JSON.stringify({ selectedLooseProp, loosePropInspection, loosePropTrack, loosePropKeyboardTarget, savedAfterLoosePropSelect })}`)
    }

    const looseTimelineLaneApplied = applyXrTimelineCastAnimationPreset({ targetId: 'loose-performer', presetId: 'dance' })
    const loosePerformerTrack = readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === 'loose-performer')
    const savedAfterLooseTimelineApply = readXrMotionReferencePlan(useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY])
    if (!looseTimelineLaneApplied.ok
      || loosePerformerTrack?.animation?.presetId !== 'dance'
      || !savedAfterLooseTimelineApply.cast.some(track => track.actorId === 'loose-performer' && track.animation?.presetId === 'dance')) {
      throw new Error(`expected BottomPanel Timeline object lanes without cast metadata to promote and animate, got ${JSON.stringify({ looseTimelineLaneApplied, loosePerformerTrack, savedAfterLooseTimelineApply })}`)
    }

    const selectedNpc = controlXrSharedAssetControls({ operation: 'select-target', targetId: 'npc-scout' })
    const npcInspection = inspectXrSharedAssetControls()
    const animatedNpc = controlXrSharedAssetControls({ operation: 'apply-animation', presetId: 'dance' })
    const rejectedNpcActionPath = controlXrSharedAssetControls({ operation: 'apply-animation', presetId: 'car-chase' })
    const npcControl = readXrSharedAssetGameplayNpcControl('npc-scout')
    if (!selectedNpc.ok
      || npcInspection.selectedKind !== 'npc'
      || npcInspection.selectedTargetId !== 'npc-scout'
      || !npcInspection.targets.some(target => target.kind === 'npc' && target.id === 'npc-scout')
      || !animatedNpc.ok
      || rejectedNpcActionPath.ok
      || npcControl.assignedPresetId !== 'dance'
      || useGraphStore.getState().floatingPanelView !== 'gameMode') {
      throw new Error(`expected shared controls to select and animate gameplay npc-* targets without stealing the Game Mode panel, got ${JSON.stringify({ selectedNpc, npcInspection, animatedNpc, rejectedNpcActionPath, npcControl, floatingPanelView: useGraphStore.getState().floatingPanelView })}`)
    }

    const componentSource = source('features', 'three', 'XrSharedAssetControls.tsx')
    const sharedRuntimeSource = source('features', 'three', 'xrSharedAssetControlRuntime.ts')
    const mediaSource = source('features', 'command-menu', 'XrMediaLibraryPanel.tsx')
    const motionSource = source('features', 'three', 'MotionControlTargetCards.tsx')
    const motionRuntimeSource = source('features', 'three', 'xrMotionReferenceRuntime.ts')
    const timelineSource = source('features', 'three', 'XrCameraMotionSection.tsx')
    const retimeSource = source('features', 'three', 'CameraMotionMarkRetime.tsx')
    const gameModeSource = source('features', 'game-fps', 'GameModeFloatingPanelView.tsx')
    const gameStageSource = source('features', 'game-fps', 'GameFpsMissionStage.tsx')
    const nativeStageSource = source('features', 'three', 'XrNativeControllerDemoStage.tsx')
    const nativeAuthoredSubjectsSource = source('features', 'three', 'XrNativeControllerAuthoredSubjects.tsx')
    const sceneLibrarySubjectSource = source('features', 'three', 'XrSceneLibrarySubject.tsx')
    const npcHighlightSource = source('features', 'game-fps', 'GameFpsSharedNpcHighlights.tsx')
    const xrMotionStageSource = source('features', 'three', 'XrMotionReferenceStage.tsx')
    for (const marker of [
      'data-kg-xr-shared-asset-controls={surface}',
      'data-kg-xr-shared-asset-animate={surface}',
      'data-kg-xr-shared-asset-gesture-mark={surface}',
      'data-kg-xr-shared-asset-hand-keyframe={surface}',
      'data-kg-xr-shared-asset-playback={surface}',
      'data-kg-xr-shared-asset-playback-owner',
      'data-kg-xr-shared-asset-target-selector={surface}',
      'data-kg-xr-shared-asset-target-kind={snapshot.selectedKind}',
      'data-kg-xr-shared-gameplay-npc-selected={snapshot.selectedKind === \'npc\'',
      "target.kind === 'object' || target.kind === 'npc'",
      "run('capture-hand-pose')",
    ]) {
      if (!componentSource.includes(marker)) throw new Error(`expected reusable shared XR asset controls to expose ${marker}`)
    }
    for (const marker of [
      'ensureXrMotionReferenceCastTrackForSubject',
      "target?.kind === 'object' && runtime.plan.subjects.some",
      'if (!track && !subject) return []',
    ]) {
      if (!sharedRuntimeSource.includes(marker)) throw new Error(`expected shared XR asset controls to promote non-cast object lanes through ${marker}`)
    }
    for (const marker of [
      'function resolveSelectedCastMarkTarget',
      'runtime.selectedShotTargetId',
      'nearestCastMark(targetTrack.marks, runtime.playheadSeconds)',
      'resolveSelectedCastMarkTarget(runtime) ? \'object\' : \'camera\'',
      'function isSelectedXrObjectTimelineLane',
      '[data-kg-xr-shot-target-lane][data-kg-xr-timeline-lane-selected="1"]',
      '[data-kg-xr-shot-target-lane-label][aria-pressed="true"]',
    ]) {
      if (!source('features', 'three', 'XrKeyboardChoreographyRuntime.tsx').includes(marker)) throw new Error(`expected selected XR object lanes to retain WASD object choreography after timeline focus through ${marker}`)
    }
    for (const marker of [
      'export function ensureXrMotionReferenceCastTrackForSubject',
      'XR_MOTION_REFERENCE_MAX_CAST_TRACKS',
      'defaultXrChoreographyGait(subject)',
    ]) {
      if (!motionRuntimeSource.includes(marker)) throw new Error(`expected XR motion runtime to promote placed subjects into cast tracks through ${marker}`)
    }
    for (const marker of [
      'data-kg-game-mode-npc-shared-target={npc.id}',
      'data-kg-xr-shared-gameplay-npc-selected={sharedAssetControls.selectedKind === \'npc\'',
      'controlXrSharedAssetControls({ operation: \'select-target\', targetId: npcId })',
    ]) {
      if (!gameModeSource.includes(marker)) throw new Error(`expected Game Mode NPC rows to expose shared npc-* targeting through ${marker}`)
    }
    for (const marker of [
      'readXrSharedAssetGameplayNpcControl',
      'sampleXrAnimationPose',
      'mesh.userData.kgXrSharedAssetTarget = npc.id',
      'mesh.userData.kgXrSharedAssetHandPose = sharedControl.handPoseActive',
    ]) {
      if (!gameStageSource.includes(marker)) throw new Error(`expected Game Mode stage NPCs to render shared animation and hand-pose state through ${marker}`)
    }
    for (const marker of [
      'data-kg-xr-gameplay-npc-lane={npc.id}',
      'data-kg-xr-gameplay-npc-bar={npc.id}',
      'data-kg-xr-shared-asset-target={npc.id}',
      "controlXrSharedAssetControls({ operation: 'select-target', targetId: npcId })",
      "controlXrSharedAssetControls({ operation: 'select-target', targetId })",
    ]) {
      if (!timelineSource.includes(marker)) throw new Error(`expected BottomPanel Timeline to expose selectable npc-* lanes through ${marker}`)
    }
    for (const marker of [
      '<GameFpsSharedNpcHighlights />',
      'kg_game_fps_shared_npc_highlights',
      "kgXrStageHighlightTarget: 'npc-selected'",
      "kgXrTimelineHighlight: 'npc-selected'",
    ]) {
      if (!nativeStageSource.includes(marker) && !npcHighlightSource.includes(marker)) throw new Error(`expected inactive XR stage npc-* highlights to expose ${marker}`)
    }
    for (const marker of [
      "sharedAssetControls.selectedKind !== 'npc' && runtime.selectedShotTargetId === subject.id",
      'inspectXrSharedAssetControls',
      "controlXrSharedAssetControls({ operation: 'select-target', targetId: subjectId })",
    ]) {
      if (!nativeAuthoredSubjectsSource.includes(marker)) throw new Error(`expected native authored subject highlights to yield to shared npc-* selection through ${marker}`)
    }
    for (const marker of [
      "controlXrSharedAssetControls({ operation: 'select-target', targetId: subjectId })",
      'onSelect={!paused ? () => selectSubject(subject.id) : undefined}',
    ]) {
      if (!xrMotionStageSource.includes(marker)) throw new Error(`expected canvas-selected XR subjects to promote into shared motion controls through ${marker}`)
    }
    for (const marker of [
      'kgXrSharedAssetTarget: subject.id',
      'kgXrSharedAssetSelected: selected',
      "kgXrTimelineHighlight: selected ? 'shared-asset' : ''",
    ]) {
      if (!sceneLibrarySubjectSource.includes(marker)) throw new Error(`expected authored XR subjects to expose shared timeline highlight metadata through ${marker}`)
    }
    for (const marker of [
      "kgXrTimelineHighlight: 'npc-selected'",
      'npcHighlightRefs',
      'kg_game_fps_npc_shared_highlight_',
    ]) {
      if (!gameStageSource.includes(marker)) throw new Error(`expected active Game Mode npc-* meshes to expose selected timeline highlights through ${marker}`)
    }
    for (const marker of [
      "selectedActor={sharedAssetControls.selectedKind !== 'npc' && runtime.selectedShotTargetId === track.actorId}",
      'kg_xr_motion_cast_live_highlight_',
      "kgXrTimelineHighlight: selectedActor ? 'shared-asset' : ''",
    ]) {
      if (!xrMotionStageSource.includes(marker)) throw new Error(`expected graph-only XR cast actors to expose shared timeline highlight metadata through ${marker}`)
    }
    for (const marker of [
      'data-kg-xr-shared-asset-actions="individual-lane"',
      'data-kg-xr-shared-asset-action-cluster="individual-lane"',
      'data-kg-xr-shared-asset-animate="individual-lane"',
      'data-kg-xr-shared-asset-clear-animation="individual-lane"',
      'data-kg-xr-shared-asset-gesture-mark="individual-lane"',
      'data-kg-xr-shared-asset-hand-keyframe="individual-lane"',
      'data-kg-xr-shared-asset-playback="individual-lane"',
      'data-kg-xr-shared-asset-playback-owner="individual-lane"',
      'applyXrTimelineCastAnimationPreset',
      'onPointerDownCapture={stopTimelineEditorEvent}',
      'onMouseDownCapture={stopTimelineEditorEvent}',
      "runSelectedCastSharedAssetAction('capture-hand-pose')",
    ]) {
      if (!retimeSource.includes(marker)) throw new Error(`expected individual BottomPanel Timeline lanes to expose ${marker}`)
    }
    for (const staleTimelineList of ['data-kg-xr-shared-asset-target-buttons={surface}', 'data-kg-xr-shared-asset-target-button={target.id}', 'aria-label="Shared 3D for XR object targets"', 'aria-label="Shared 3D for XR animation presets"', 'data-kg-xr-shared-asset-preset-button={preset.id}', 'data-kg-xr-shared-asset-preset-buttons={surface}', 'data-kg-xr-shared-asset-preset-buttons="timeline-label"', 'export function XrSharedAssetPresetLaneLabel', 'data-kg-xr-shared-asset-layout="timeline-lane"', "className={cn('flex h-full min-h-0 min-w-0 items-center overflow-hidden px-2 py-1'", 'data-kg-xr-shared-asset-actions="consolidated"', 'data-kg-xr-shared-asset-action-cluster="timeline"', 'aria-label="Shared XR asset lane actions"']) {
      if (componentSource.includes(staleTimelineList) || timelineSource.includes(staleTimelineList)) throw new Error(`expected BottomPanel Timeline XR asset controls to live in individual lanes without duplicate aggregate lists, found ${staleTimelineList}`)
    }
    for (const staleTimelineActionText of ['<Clapperboard className="size-3" aria-hidden /> Apply', '<Eraser className="size-3" aria-hidden /> Clear', '<MapPin className="size-3" aria-hidden /> Mark', '<Hand className="size-3" aria-hidden /> Hand']) {
      if (componentSource.includes(staleTimelineActionText)) throw new Error(`expected BottomPanel Timeline XR Assets lane to declutter actions into icon buttons, found ${staleTimelineActionText}`)
    }
    for (const aggregateTimelineLane of ["id: 'xr-asset-control'", 'data-kg-xr-timeline-control-lane="shared-asset"', 'data-kg-xr-timeline-control-lane-label="shared-asset"', '<XrSharedAssetControls surface="timeline"']) {
      if (timelineSource.includes(aggregateTimelineLane)) throw new Error(`expected BottomPanel Timeline to remove aggregate XR asset action lane, found ${aggregateTimelineLane}`)
    }
    if (!mediaSource.includes('<XrSharedAssetControls surface="media" />')
      || !motionSource.includes('<XrSharedAssetControls surface="motion-control" />')
      || !motionSource.includes("controlXrSharedAssetControls({ operation: 'select-target', targetId })")
      || !gameModeSource.includes('<XrSharedAssetControls surface="game-mode" embedded />')
      || !retimeSource.includes('data-kg-xr-shared-asset-actions="individual-lane"')) {
      throw new Error('expected Media, Motion Control, grounded Game Mode, and individual BottomPanel Timeline lanes to mount the shared XR asset control bridge')
    }
    for (const separatePresetLane of ['compatibleSharedAssetPresets.map(preset => {', 'data-kg-xr-shared-asset-preset-lane={preset.id}', 'data-kg-xr-shared-asset-preset-lane-label={preset.id}', "id: `xr-preset:${preset.id}`"]) {
      if (timelineSource.includes(separatePresetLane)) throw new Error(`expected XR animation presets to remain tied to individual XR asset lanes, found separate lane marker ${separatePresetLane}`)
    }
  } finally {
    useGraphStore.setState(previousSurface as never)
    hydrateCanonicalXrMotionReferenceRuntime()
    hydrateCanonicalXrPhysicsRuntime()
  }
}
