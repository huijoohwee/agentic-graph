import React from 'react'
import type { Group } from 'three'
import type { GraphData } from '@/lib/graph/types'
import { XrMotionReferenceStage } from '@/features/three/XrMotionReferenceStage'
import { XrPhysicsStageRuntime } from '@/features/three/XrPhysicsStageRuntime'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import {
  XR_MOTION_STAGE_GROUND_Y,
  XR_MOTION_STAGE_SPAN,
} from '@/features/three/xrMotionReferenceCoordinates'
import { resolveXrCanonicalSceneSpatialSource } from '@/features/three/xrCanonicalSceneSpatialSource'
import { useXrStageMotionControlCleanup } from '@/features/three/useXrStageMotionControlCleanup'

export function XrMotionReferenceGraphStage({ data, paused = false }: { data: GraphData; paused?: boolean }) {
  useXrStageMotionControlCleanup()
  const stageRootRef = React.useRef<Group | null>(null)
  const runtime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const { stage } = resolveXrCanonicalSceneSpatialSource({
    projection: 'authored',
    stageId: runtime.plan.stageId,
  })
  const stageScale = XR_MOTION_STAGE_SPAN / Math.max(stage.sizeMeters[0], stage.sizeMeters[1], 1)
  return (
    <group ref={stageRootRef} name="agentic_os_graph_xr_stage">
      <XrMotionReferenceStage
        graphData={data}
        span={XR_MOTION_STAGE_SPAN}
        groundY={XR_MOTION_STAGE_GROUND_Y}
        coordinateRootRef={stageRootRef}
        paused={paused}
      />
      <XrPhysicsStageRuntime
        stageScale={stageScale}
        groundY={XR_MOTION_STAGE_GROUND_Y}
        paused={paused}
      />
    </group>
  )
}
