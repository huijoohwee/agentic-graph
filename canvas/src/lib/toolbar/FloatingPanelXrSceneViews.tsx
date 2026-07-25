import React from 'react'
import {
  CitySimPanelProjection,
  type CitySimProjectionSurface,
} from '@/features/game-city-sim/CitySimPanelProjection'
import type { FloatingPanelView } from '@/hooks/store/store-types/graph-state-chat-import'

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

export function FloatingPanelXrSceneView({ view }: { view: FloatingPanelView }) {
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
  return (
    <React.Suspense fallback={null}>
      <section
        className="flex h-full min-h-0 flex-col"
        data-kg-city-sim-panel-composition={projectionSurface || undefined}
      >
        {projectionSurface ? <CitySimPanelProjection surface={projectionSurface} /> : null}
        <div
          className={`min-h-0 flex-1 ${view === 'media' ? 'overflow-auto' : 'overflow-hidden'}`}
          data-kg-city-sim-panel-scroll-owner={view === 'media' ? 'media' : undefined}
        >
          {panel}
        </div>
      </section>
    </React.Suspense>
  )
}
