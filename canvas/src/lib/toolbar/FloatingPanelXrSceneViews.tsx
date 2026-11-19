import React from 'react'
import { useWarehouseInspectionMode } from '@/features/python-learning/useWarehouseInspectionMode'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  CitySimPanelProjection,
  type CitySimProjectionSurface,
} from '@/features/game-city-sim/CitySimPanelProjection'
import type { ImmersiveMediaProjectionSurface } from '@/features/immersive-media/ImmersiveMediaPanelProjection'
import type { FloatingPanelView } from '@/hooks/store/store-types/graph-state-chat-import'

const XrWorkspaceMediaPanelLazy = React.lazy(() => import('@/features/xr-v2/XrWorkspaceMediaPanel'))
const MediaCatalogPanelLazy = React.lazy(() => import('@/features/command-menu/CommandMenuCatalogPanel'))
const XrAnimationFloatingPanelViewLazy = React.lazy(() => import('@/features/three/XrAnimationFloatingPanelView'))
const MotionControlFloatingPanelViewLazy = React.lazy(() => import('@/features/three/MotionControlFloatingPanelView'))
const GameModeFloatingPanelViewLazy = React.lazy(() => import('@/features/game-fps/GameModeFloatingPanelView'))
const FlightSimFloatingPanelViewLazy = React.lazy(() => import('@/features/game-flight-sim/FlightSimFloatingPanelView'))
const CitySimFloatingPanelViewLazy = React.lazy(() =>
  import('@/features/game-city-sim/CitySimFloatingPanelView').then(mod => ({
    default: mod.CitySimFloatingPanelView,
  })),
)
const StrybldrCameraFloatingPanelViewLazy = React.lazy(() =>
  import('@/features/strybldr/StrybldrCameraFloatingPanelView').then(mod => ({
    default: mod.StrybldrCameraFloatingPanelView,
  })),
)
const ImmersiveMediaPanelProjectionLazy = React.lazy(() =>
  import('@/features/immersive-media/ImmersiveMediaPanelProjection').then(mod => ({
    default: mod.ImmersiveMediaPanelProjection,
  })),
)

export function FloatingPanelXrSceneView({ view }: { view: FloatingPanelView }) {
  const { available: warehouseAvailable } = useWarehouseInspectionMode()
  const xr = useGraphStore(state => state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr')
  const projectionSurface = (
    view === 'media'
    || view === 'animation'
    || view === 'motionControl'
    || view === 'gameMode'
    || view === 'flightSim'
    || view === 'camera'
  ) ? view as CitySimProjectionSurface : null
  const immersiveMediaSurface = projectionSurface as ImmersiveMediaProjectionSurface | null
  const projections = projectionSurface && immersiveMediaSurface ? (
    <div data-kg-city-sim-panel-composition={projectionSurface} data-kg-immersive-media-panel-composition={immersiveMediaSurface}>
      <ImmersiveMediaPanelProjectionLazy surface={immersiveMediaSurface} />
      <CitySimPanelProjection surface={projectionSurface} />
    </div>
  ) : null
  const panel = view === 'media' ? <MediaCatalogPanelLazy>{projections}</MediaCatalogPanelLazy>
    : view === 'animation' ? <XrAnimationFloatingPanelViewLazy>{projections}</XrAnimationFloatingPanelViewLazy>
      : view === 'motionControl' ? <MotionControlFloatingPanelViewLazy>{projections}</MotionControlFloatingPanelViewLazy>
        : view === 'gameMode' ? <GameModeFloatingPanelViewLazy>{projections}</GameModeFloatingPanelViewLazy>
          : view === 'flightSim' ? <FlightSimFloatingPanelViewLazy>{projections}</FlightSimFloatingPanelViewLazy>
            : view === 'cityBuilder' ? <CitySimFloatingPanelViewLazy />
              : view === 'camera' ? <StrybldrCameraFloatingPanelViewLazy>{projections}</StrybldrCameraFloatingPanelViewLazy>
                : null
  return <React.Suspense fallback={null}>{view === 'media' && (xr || warehouseAvailable)
    ? <XrWorkspaceMediaPanelLazy>{panel}</XrWorkspaceMediaPanelLazy> : panel}</React.Suspense>
}
