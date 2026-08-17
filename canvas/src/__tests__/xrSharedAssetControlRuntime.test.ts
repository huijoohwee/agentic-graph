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
  inspectXrSharedAssetControls,
  controlXrSharedAssetControls,
} from '@/features/three/xrSharedAssetControlRuntime'
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
    const runtimeAfterDance = readXrMotionReferenceRuntime()
    const savedAfterDance = readXrMotionReferencePlan(useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY])
    if (!selected.ok
      || !applied.ok
      || runtimeAfterDance.plan.cast.find(track => track.actorId === 'shared-performer')?.animation?.presetId !== 'dance'
      || savedAfterDance.cast.find(track => track.actorId === 'shared-performer')?.animation?.presetId !== 'dance'
      || useGraphStore.getState().floatingPanelView !== 'gameMode') {
      throw new Error(`expected shared XR controls to animate the selected humanoid without stealing the Game Mode panel, got ${JSON.stringify({ selected, applied, floatingPanelView: useGraphStore.getState().floatingPanelView })}`)
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

    const componentSource = source('features', 'three', 'XrSharedAssetControls.tsx')
    const mediaSource = source('features', 'command-menu', 'XrMediaLibraryPanel.tsx')
    const motionSource = source('features', 'three', 'MotionControlTargetCards.tsx')
    const timelineSource = source('features', 'three', 'XrCameraMotionSection.tsx')
    const gameModeSource = source('features', 'game-fps', 'GameModeFloatingPanelView.tsx')
    for (const marker of [
      'data-kg-xr-shared-asset-controls={surface}',
      'data-kg-xr-shared-asset-animate={surface}',
      'data-kg-xr-shared-asset-gesture-mark={surface}',
      'data-kg-xr-shared-asset-hand-keyframe={surface}',
      'data-kg-xr-shared-asset-playback={surface}',
      'data-kg-xr-shared-asset-playback-owner',
      'data-kg-xr-shared-asset-layout="timeline-lane"',
      'data-kg-xr-shared-asset-preset-button={preset.id}',
      'data-kg-xr-shared-asset-preset-buttons={surface}',
      'data-kg-xr-shared-asset-target-selector={surface}',
      "run('capture-hand-pose')",
    ]) {
      if (!componentSource.includes(marker)) throw new Error(`expected reusable shared XR asset controls to expose ${marker}`)
    }
    for (const staleTimelineTargetList of ['data-kg-xr-shared-asset-target-buttons={surface}', 'data-kg-xr-shared-asset-target-button={target.id}', 'aria-label="Shared 3D for XR object targets"']) {
      if (componentSource.includes(staleTimelineTargetList)) throw new Error(`expected BottomPanel Timeline XR Assets lane to use left lane labels as the only 3D target list, found ${staleTimelineTargetList}`)
    }
    if (!mediaSource.includes('<XrSharedAssetControls surface="media" />')
      || !motionSource.includes('<XrSharedAssetControls surface="motion-control" />')
      || !timelineSource.includes('<XrSharedAssetControls surface="timeline" embedded layout="timeline-lane" />')
      || !gameModeSource.includes('<XrSharedAssetControls surface="game-mode" embedded />')
      || !timelineSource.includes('data-kg-xr-timeline-control-lane="shared-asset"')) {
      throw new Error('expected Media, Motion Control, BottomPanel Timeline, and grounded Game Mode to mount the same shared XR asset control bridge')
    }
  } finally {
    useGraphStore.setState(previousSurface as never)
    hydrateCanonicalXrMotionReferenceRuntime()
    hydrateCanonicalXrPhysicsRuntime()
  }
}
