import React from 'react'
import { useGympgrphExternalStore } from '@/lib/gympgrph/externalStore'
import { XrNativeControllerDemoStage } from '@/features/three/XrNativeControllerDemoStage'
import { XrNativeControllerDemoSceneAtmosphere } from '@/features/three/XrNativeControllerDemoEnvironment'
import {
  XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE,
  setSharedXrNativeControllerDemoTerrain,
} from '@/features/three/xrNativeControllerDemoRuntime'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import { XR_MOTION_STAGE_GROUND_Y } from '@/features/three/xrMotionReferenceCoordinates'
import { resolveXrCanonicalSceneSpatialSource } from '@/features/three/xrCanonicalSceneSpatialSource'
import { resolveGeoXrEnvironmentPresentation } from '@/features/three/xrGeoEnvironmentPresentation'
import { useXrStageMotionControlCleanup } from '@/features/three/useXrStageMotionControlCleanup'

export function XrCanonicalPhysicsStage({ geospatialComposite = false, paused = false }: { geospatialComposite?: boolean; paused?: boolean }) {
  useXrStageMotionControlCleanup()
  const runtime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const geospatialViewMode = useGympgrphExternalStore(
    state => state.geospatialViewMode,
  )
  const environmentPresentation = React.useMemo(
    () => geospatialComposite
      ? resolveGeoXrEnvironmentPresentation(geospatialViewMode)
      : null,
    [geospatialComposite, geospatialViewMode],
  )
  const { stage } = resolveXrCanonicalSceneSpatialSource({
    projection: 'native-controller',
    stageId: runtime.plan.stageId,
  })
  React.useEffect(() => {
    setSharedXrNativeControllerDemoTerrain(stage.id)
  }, [stage.id])
  return (
    <>
      {geospatialComposite ? null : <XrNativeControllerDemoSceneAtmosphere stageScale={XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE} />}
      <group
        name="kg_graph_xr_stage"
        userData={{
          geospatialComposite,
          environmentPresentation: environmentPresentation?.id || 'xr',
          environmentStage: stage.id,
        }}
      >
        <XrNativeControllerDemoStage
          inputEnabled={!paused}
          environmentPresentation={environmentPresentation}
          environmentVisible
          stageScale={XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE}
          groundY={XR_MOTION_STAGE_GROUND_Y}
          retainStage
          stage={stage}
        />
      </group>
    </>
  )
}
