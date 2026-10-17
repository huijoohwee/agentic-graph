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

export function FloatingPanelSceneContext({ view, children }: {
  view: FloatingPanelView
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = React.useState(false)
  React.useEffect(() => setExpanded(false), [view])
  if (view !== 'flightSim') return <>{children}</>
  return <details
    className="min-w-0 max-h-[40%] shrink-0 overflow-auto"
    aria-label="Optional scene context"
    data-kg-flight-context="1"
    onToggle={event => setExpanded(event.currentTarget.open)}
  >
    <summary className="min-h-[44px] cursor-pointer content-center px-2 text-xs font-semibold">Panorama and city tools</summary>
    {expanded ? <React.Suspense fallback={<p role="status" className="px-2 text-xs">Loading scene context…</p>}>{children}</React.Suspense> : null}
  </details>
}

export function FloatingPanelXrSceneView({ view }: { view: FloatingPanelView }) {
  const { available: warehouseAvailable } = useWarehouseInspectionMode()
  const xr = useGraphStore(state => state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr')
  const panel = view === 'media' ? <MediaCatalogPanelLazy />
    : view === 'animation' ? <XrAnimationFloatingPanelViewLazy />
      : view === 'motionControl' ? <MotionControlFloatingPanelViewLazy />
        : view === 'gameMode' ? <GameModeFloatingPanelViewLazy />
          : view === 'flightSim' ? <FlightSimFloatingPanelViewLazy />
            : view === 'cityBuilder' ? <CitySimFloatingPanelViewLazy />
              : view === 'camera' ? <StrybldrCameraFloatingPanelViewLazy />
                : null
  if (!panel) return null
  const projectionSurface = (
    view === 'media'
    || view === 'animation'
    || view === 'motionControl'
    || view === 'gameMode'
    || view === 'flightSim'
    || view === 'camera'
  ) ? view as CitySimProjectionSurface : null
  const immersiveMediaSurface = projectionSurface as ImmersiveMediaProjectionSurface | null
  const content = (
      <section
        className="flex h-full min-h-0 min-w-0 flex-col"
        data-kg-city-sim-panel-composition={projectionSurface || undefined}
        data-kg-immersive-media-panel-composition={immersiveMediaSurface || undefined}
      >
        <FloatingPanelSceneContext view={view}>
          {immersiveMediaSurface ? <ImmersiveMediaPanelProjectionLazy surface={immersiveMediaSurface} /> : null}
          {projectionSurface ? <CitySimPanelProjection surface={projectionSurface} /> : null}
        </FloatingPanelSceneContext>
        <section
          className={`min-h-0 min-w-0 flex-1 ${view === 'media' ? 'overflow-auto' : 'overflow-hidden'}`}
          data-kg-city-sim-panel-scroll-owner={view === 'media' ? 'media' : undefined}
        >
          {panel}
        </section>
      </section>
  )
  return <React.Suspense fallback={null}>{view === 'media' && (xr || warehouseAvailable)
    ? <XrWorkspaceMediaPanelLazy>{content}</XrWorkspaceMediaPanelLazy> : content}</React.Suspense>
}
