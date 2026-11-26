import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Group, Mesh } from 'three'
import { AgenticOsRemoteGrammarAutoHydrationBoundary } from '@/features/agentic-os/useAgenticOsRemoteGrammarAutoHydration'
import { applyGameFpsNpcSelectionHighlight } from '@/features/game-fps/GameFpsSharedNpcHighlights'
import { GameModeFloatingPanelView } from '@/features/game-fps/GameModeFloatingPanelView'
import { readGameFpsSnapshot } from '@/features/game-fps/gameFpsRuntime'
import { MotionControlTargetCards } from '@/features/three/MotionControlTargetCards'
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
  readXrSharedObjectControllerPrecisionMode,
  resolveXrSharedObjectControllerMotionTarget,
  setXrSharedObjectControllerPrecisionMode,
  readXrSharedAssetGameplayNpcControl,
} from '@/features/three/xrSharedAssetControlRuntime'
import { createXrNativeControllerInput } from '@/features/three/xrNativeControllerInput'
import {
  resolveXrObjectKeyboardMotionTarget,
} from '@/features/three/XrKeyboardChoreographyRuntime'
import { readXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { xrMotionReferenceTimelineDocumentKey } from '@/features/three/xrMotionReferenceTimeline'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

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

export async function testSharedXrAssetControlsDriveMediaMotionTimelineAndGroundedGameMode(): Promise<void> {
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
    assert.ok(selected.ok)
    assert.equal(readXrSharedObjectControllerPrecisionMode(), 'gesture', 'a fresh page starts in Gesture mode')
    const precisionMotionTarget = controlXrSharedAssetControls({ operation: 'select-target', targetId: 'shared-sedan' })
    assert.ok(precisionMotionTarget.ok)
    const metadataBeforePrecisionChoice = useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]
    const resolvedDistance = (mode: 'gesture' | 'fine' | 'standard', modifier: boolean, moveX = 1, moveZ = 0): number => {
      assert.equal(setXrSharedObjectControllerPrecisionMode(mode), true)
      const runtime = readXrMotionReferenceRuntime()
      const target = resolveXrSharedObjectControllerMotionTarget({
        controllerInput: createXrNativeControllerInput({ moveX, moveZ, modifier, source: 'keyboard' }),
        deltaSeconds: 0.01,
        runtime,
      })
      assert.ok(target, `expected ${mode} to resolve motion for the selected authored object`)
      const mark = runtime.plan.cast.find(track => track.actorId === target.actorId)?.marks.find(candidate => candidate.id === target.markId)
      assert.ok(mark, 'precision choice must keep the existing selected motion mark')
      return Math.hypot(target.nextPosition[0] - mark.position[0], target.nextPosition[2] - mark.position[2])
    }
    const gestureStandardDistance = resolvedDistance('gesture', false)
    const gestureFineDistance = resolvedDistance('gesture', true)
    const fixedFineDistance = resolvedDistance('fine', true)
    const fixedStandardDistance = resolvedDistance('standard', true)
    const diagonalStandardDistance = resolvedDistance('standard', false, 1, 1)
    assert.ok(Math.abs(gestureStandardDistance - 0.02) < 0.000001, `Gesture without its modifier preserves the 2.0 m/s standard pace; got ${gestureStandardDistance}`)
    assert.ok(Math.abs(gestureFineDistance - 0.004) < 0.000001, `Gesture with its modifier preserves the 0.4 m/s fine pace; got ${gestureFineDistance}`)
    assert.ok(Math.abs(fixedFineDistance - 0.004) < 0.000001, `Fine remains 0.4 m/s when the input modifier is held; got ${fixedFineDistance}`)
    assert.ok(Math.abs(fixedStandardDistance - 0.02) < 0.000001, `Standard remains 2.0 m/s when the input modifier is held; got ${fixedStandardDistance}`)
    assert.ok(Math.abs(diagonalStandardDistance - 0.02) < 0.000001, `diagonal input remains normalized to a bounded 2.0 m/s move; got ${diagonalStandardDistance}`)
    assert.equal(setXrSharedObjectControllerPrecisionMode('not-a-mode'), false, 'invalid modes fail closed')
    assert.equal(readXrSharedObjectControllerPrecisionMode(), 'standard', 'an invalid mode preserves the current selection')
    assert.equal(useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY], metadataBeforePrecisionChoice, 'speed choices do not write document metadata')
    assert.equal(setXrSharedObjectControllerPrecisionMode('fine'), true)
    const reselectedForPrecision = controlXrSharedAssetControls({ operation: 'select-target', targetId: 'shared-performer' })
    assert.ok(reselectedForPrecision.ok)
    assert.equal(setXrSharedObjectControllerPrecisionMode('gesture'), true)
    await assertMotionControlPrecisionSelector()

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

    await selectGameModeNpcInPanel()
    const npcInspection = inspectXrSharedAssetControls()
    const animatedNpc = controlXrSharedAssetControls({ operation: 'apply-animation', presetId: 'dance' })
    const rejectedNpcActionPath = controlXrSharedAssetControls({ operation: 'apply-animation', presetId: 'car-chase' })
    const npcControl = readXrSharedAssetGameplayNpcControl('npc-scout')
    if (npcInspection.selectedKind !== 'npc'
      || npcInspection.selectedTargetId !== 'npc-scout'
      || !npcInspection.targets.some(target => target.kind === 'npc' && target.id === 'npc-scout')
      || !animatedNpc.ok
      || rejectedNpcActionPath.ok
      || npcControl.assignedPresetId !== 'dance'
      || useGraphStore.getState().floatingPanelView !== 'gameMode') {
      throw new Error(`expected shared controls to select and animate gameplay npc-* targets without stealing the Game Mode panel, got ${JSON.stringify({ npcInspection, animatedNpc, rejectedNpcActionPath, npcControl, floatingPanelView: useGraphStore.getState().floatingPanelView })}`)
    }

    const componentSource = source('features', 'three', 'XrSharedAssetControls.tsx')
    const sharedRuntimeSource = source('features', 'three', 'xrSharedAssetControlRuntime.ts')
    const mediaSource = source('features', 'command-menu', 'XrMediaLibraryPanel.tsx')
    const animationSource = source('features', 'three', 'XrAnimationFloatingPanelView.tsx')
    const motionSource = source('features', 'three', 'MotionControlTargetCards.tsx')
    if (![
      "let sharedObjectControllerPrecisionMode: XrSharedObjectControllerPrecisionMode = 'gesture'",
      'const motion = resolveXrSubjectMotion({',
      "motion.status === 'physics-owned' || motion.status === 'obstructed'",
      'applyXrConstrainedCastMarkChoreography({',
    ].every(marker => sharedRuntimeSource.includes(marker))) throw new Error('expected page-memory speed choices to retain existing constraint and mark owners')
    const motionRuntimeSource = source('features', 'three', 'xrMotionReferenceRuntime.ts')
    const timelineSource = source('features', 'three', 'XrCameraMotionSection.tsx')
    const insertedLanesSource = source('features', 'three', 'XrTimelineInsertedLanes.tsx')
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
      'onClick={() => selectNpcTimelineLane(npc.id)}',
    ]) {
      if (!insertedLanesSource.includes(marker)) throw new Error(`expected BottomPanel Timeline NPC lanes to expose ${marker}`)
    }
    for (const marker of [
      "controlXrSharedAssetControls({ operation: 'select-target', targetId: npcId })",
      "controlXrSharedAssetControls({ operation: 'select-target', targetId })",
    ]) {
      if (!timelineSource.includes(marker)) throw new Error(`expected BottomPanel Timeline to expose selectable npc-* lanes through ${marker}`)
    }
    for (const marker of [
      '<GameFpsSharedNpcHighlights />',
      'agentic_os_game_fps_shared_npc_highlights',
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
    if (!gameStageSource.includes('<GameFpsSharedNpcHighlights highlightRef={npcHighlightRef} />')) {
      throw new Error('expected active NPC selection to reuse the shared highlight with already-rendered NPC poses')
    }
    for (const marker of ["kgXrTimelineHighlight: 'npc-selected'", 'agentic_os_game_fps_npc_shared_highlight_']) {
      if (!npcHighlightSource.includes(marker)) throw new Error(`expected the shared NPC renderer to expose ${marker}`)
    }
    if (!gameStageSource.includes('applyGameFpsNpcSelectionHighlight(highlight, npc, mesh)')) throw new Error('expected the active NPC loop to own highlight updates without a second animation pass')
    assertNpcSelectionHighlightTracksRenderedPose()
    for (const marker of [
      "selectedActor={sharedAssetControls.selectedKind !== 'npc' && runtime.selectedShotTargetId === track.actorId}",
      '<XrSelectionBounds selected={selectedActor} targetId={track.actorId}>',
      "kgXrTimelineHighlight: selectedActor ? 'shared-asset' : ''",
    ]) {
      if (!xrMotionStageSource.includes(marker)) throw new Error(`expected graph-only XR cast actors to expose shared timeline highlight metadata through ${marker}`)
    }
    for (const marker of [
      'data-kg-xr-shared-asset-actions="individual-lane"',
      'data-kg-xr-shared-asset-action-cluster="individual-lane"',
      'data-kg-xr-shared-asset-gesture-mark="individual-lane"',
      'data-kg-xr-shared-asset-hand-keyframe="individual-lane"',
      'data-kg-xr-shared-asset-playback="individual-lane"',
      'data-kg-xr-shared-asset-playback-owner="individual-lane"',
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
    if (!animationSource.includes('<XrSharedAssetControls surface="animation" />')
      || mediaSource.includes('<XrSharedAssetControls surface="media" />')
      || !motionSource.includes('<XrSharedAssetControls surface="motion-control" />')
      || !motionSource.includes("controlXrSharedAssetControls({ operation: 'select-target', targetId })")
      || gameModeSource.includes('<XrSharedAssetControls surface="game-mode" embedded />')
      || gameModeSource.includes('xrMotion.plan.subjects.map(subject => {')
      || !gameModeSource.includes('Open Media → 3D for XR → Subjects & Props')
      || !retimeSource.includes('data-kg-xr-shared-asset-actions="individual-lane"')) {
      throw new Error('expected Animation, Motion Control, and individual BottomPanel Timeline lanes to reuse the shared XR asset bridge while Game Mode links to Media without a duplicate asset list')
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

async function assertMotionControlPrecisionSelector(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.body.appendChild(dom.window.document.createElement('div'))
  let root = createRoot(container)
  const metadataBefore = useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]
  try {
    dom.window.history.replaceState(null, '', `/?studio-offline=${'1'.repeat(40)}`)
    const mount = () => React.createElement(
      AgenticOsRemoteGrammarAutoHydrationBoundary,
      { children: React.createElement(MotionControlTargetCards, { livePoseActive: false, onOpenTarget: () => {} }) },
    )
    await mountReactRoot(root, mount())
    const selector = container.querySelector<HTMLButtonElement>('[data-kg-motion-control-precision-selector="page-session"]')
    assert.ok(selector, 'expected the selected-object card to render its speed selector')
    assert.equal(selector.getAttribute('aria-label'), 'Object movement speed')
    assert.equal(selector.getAttribute('data-value'), 'gesture', 'Gesture is the first-use default')
    assert.match(container.querySelector('[data-kg-motion-control-precision-active-mode]')?.textContent || '', /Gesture .*0\.4 m\/s .*2\.0 m\/s/)

    const chooseMode = async (mode: 'fine' | 'standard') => {
      await act(async () => selector.click())
      const menu = dom.window.document.querySelector<HTMLMenuElement>('menu[role="menu"][aria-label="Object movement speed"]')
      assert.ok(menu, 'expected an accessible menu for the speed choices')
      const options = Array.from(menu.querySelectorAll('button[role="menuitemradio"]')) as HTMLButtonElement[]
      assert.deepEqual(options.map(option => option.textContent?.trim()), ['Gesture', 'Fine', 'Standard'], 'the selector exposes exactly the three named modes')
      const option = options.find(candidate => candidate.getAttribute('value') === mode)
      if (!option) throw new Error(`expected a ${mode} choice`)
      await act(async () => option.click())
      assert.equal(selector.getAttribute('data-value'), mode)
      assert.equal(readXrSharedObjectControllerPrecisionMode(), mode)
    }

    await chooseMode('fine')
    assert.match(container.querySelector('[data-kg-motion-control-precision-active-mode]')?.textContent || '', /Fine .*0\.4 m\/s/)
    await chooseMode('standard')
    assert.match(container.querySelector('[data-kg-motion-control-precision-active-mode]')?.textContent || '', /Standard .*2\.0 m\/s/)
    assert.equal(useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY], metadataBefore, 'changing the mode does not persist into document metadata')

    await unmountReactRoot(root)
    root = createRoot(container)
    await mountReactRoot(root, mount())
    const remountedSelector = container.querySelector<HTMLButtonElement>('[data-kg-motion-control-precision-selector="page-session"]')
    assert.equal(remountedSelector?.getAttribute('data-value'), 'standard', 'the choice survives a panel remount in this page session')
  } finally {
    try {
      await unmountReactRoot(root)
    } finally {
      setXrSharedObjectControllerPrecisionMode('gesture')
      restore()
    }
  }
}

async function selectGameModeNpcInPanel(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.body.appendChild(dom.window.document.createElement('div'))
  const root = createRoot(container)
  const { uiToasts, uiLogEntries } = useGraphStore.getState()
  try {
    dom.window.history.replaceState(null, '', `/?studio-offline=${'1'.repeat(40)}`)
    await mountReactRoot(root, React.createElement(
      AgenticOsRemoteGrammarAutoHydrationBoundary,
      { children: React.createElement(GameModeFloatingPanelView) },
    ))
    const button = container.querySelector<HTMLButtonElement>('[data-kg-game-mode-npc-shared-target="npc-scout"]')
    assert.ok(button, 'expected a shared targeting button for npc-scout')
    assert.equal(button.getAttribute('aria-pressed'), 'false')

    await act(async () => button.click())

    assert.equal(button.getAttribute('aria-pressed'), 'true')
    assert.equal(button.closest('[data-kg-game-mode-npc-row]')?.getAttribute('data-kg-xr-shared-gameplay-npc-selected'), '1')
  } finally {
    try {
      await unmountReactRoot(root)
    } finally {
      useGraphStore.setState({ uiToasts, uiLogEntries })
      restore()
    }
  }
}

function assertNpcSelectionHighlightTracksRenderedPose(): void {
  const before = readGameFpsSnapshot()
  const npc = { id: 'npc-scout', x: 3, z: -7, health: 50, action: 'hold' as const }
  const highlight = new Mesh(), renderedNpc = new Mesh(), stage = new Group()
  stage.position.set(4, 2, -1)
  stage.scale.setScalar(3)
  stage.add(highlight, renderedNpc)
  try {
    applyGameFpsNpcSelectionHighlight(highlight, npc)
    assert.equal(highlight.visible, true)
    assert.deepEqual(highlight.position.toArray(), [3, 0.9, -7])
    assert.equal(highlight.userData.kgXrSharedAssetTarget, npc.id)
    renderedNpc.position.set(8, 1.4, -2)
    renderedNpc.rotation.set(0.1, 0.8, -0.3)
    renderedNpc.scale.set(1.12, 0.4, 1.12)
    applyGameFpsNpcSelectionHighlight(highlight, npc, renderedNpc)
    stage.updateMatrixWorld(true)
    assert.deepEqual(highlight.matrixWorld.toArray(), renderedNpc.matrixWorld.toArray(), 'highlight must follow the existing animated pose and inherited stage scale')
    for (const target of [undefined, { ...npc, health: 0 }, { ...npc, health: NaN }]) {
      applyGameFpsNpcSelectionHighlight(highlight, target)
      assert.equal(highlight.visible, false)
      assert.equal(highlight.userData.kgXrSharedAssetSelected, false)
      assert.equal(highlight.userData.kgXrSharedAssetTarget, '')
    }
    applyGameFpsNpcSelectionHighlight(highlight, npc, null)
    assert.equal(highlight.visible, false, 'missing active NPC mesh must not fall back to an inactive-stage marker')
    renderedNpc.visible = false
    applyGameFpsNpcSelectionHighlight(highlight, npc, renderedNpc)
    assert.equal(highlight.visible, false, 'hidden active NPC must hide its highlight')
    assert.equal(readGameFpsSnapshot(), before, 'selection rendering must not advance or mutate gameplay')
  } finally {
    highlight.geometry.dispose(); renderedNpc.geometry.dispose()
    for (const mesh of [highlight, renderedNpc]) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose()
    }
  }
}
