import React from 'react'
import { Plane } from 'lucide-react'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import { resolveXrMotionReferenceStage } from '@/features/three/xrSceneLibrary'
import {
  completeFlightSimReadyFrame,
} from './flightSimDeadlineRuntime'
import {
  projectFlightSimNavigation,
} from './flightSimNavigationProjection'
import {
  readFlightSimSnapshot,
  readFlightSimStageRuntimeController,
  subscribeFlightSimPresentation,
} from './flightSimRuntime'
import {
  completeFlightSimStagePreparation,
  readCurrentFlightSimStagePreparationRequest,
} from './flightSimStagePreparationRuntime'
import { readFlightSimXrSpatialProfile } from './flightSimSpatialProfile'
import { useFlightSimSurfaceControls } from './useFlightSimSurfaceControls'

function markerColor(state: 'active' | 'pending' | 'visited'): string {
  if (state === 'active') return '#22d3ee'
  if (state === 'visited') return '#34d399'
  return '#94a3b8'
}

const subscribeFlightSimSurfacePresentation = (listener: () => void) => (
  subscribeFlightSimPresentation('surface', listener)
)

export function FlightSimGeoSurfaceOverlay() {
  const flight = React.useSyncExternalStore(
    subscribeFlightSimSurfacePresentation,
    readFlightSimSnapshot,
    readFlightSimSnapshot,
  )
  const environmentRuntime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const environment = resolveXrMotionReferenceStage(environmentRuntime.plan.stageId)
  const runtimeController = React.useMemo(readFlightSimStageRuntimeController, [])
  const [inputElement, setInputElement] = React.useState<HTMLButtonElement | null>(null)
  const requestPresentationFrame = React.useCallback(() => {
    if (typeof window !== 'undefined') window.requestAnimationFrame(() => undefined)
  }, [])
  useFlightSimSurfaceControls({
    inputElement,
    requestPresentationFrame,
    runtimeController,
  })

  const navigation = React.useMemo(() => {
    try {
      return projectFlightSimNavigation(flight, readFlightSimXrSpatialProfile())
    } catch {
      return null
    }
  }, [flight])

  React.useLayoutEffect(() => {
    const requestId = readCurrentFlightSimStagePreparationRequest()
    if (
      requestId !== null
      && flight.active
      && flight.phase === 'stopped'
      && !runtimeController.isHydrationPending()
      && !flight.runtimeError
    ) {
      completeFlightSimStagePreparation(requestId)
    }
    if (
      flight.active
      && flight.phase === 'ready'
      && flight.tick === 0
      && flight.runId > 0
      && !flight.runtimeError
    ) {
      completeFlightSimReadyFrame(flight.runId, flight.tick)
    }
  }, [flight, runtimeController])

  if (!navigation) return null
  const routePolyline = navigation.route
    .map(point => `${point.x * 100},${point.y * 100}`)
    .join(' ')
  const aircraftHeading = navigation.aircraft.headingDegrees
    + (flight.aircraft.roll * 180 / Math.PI) * 0.35

  return (
    <section
      className="pointer-events-none absolute inset-0 z-[45] overflow-hidden"
      aria-label="Flight Sim Geo overlay"
      data-kg-flight-sim-geo-overlay="1"
      data-kg-flight-sim-geo-environment={environment.id}
      data-kg-flight-sim-geo-geography-boundary="not-rendered"
      data-kg-flight-sim-geo-phase={flight.phase}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Flight route over the ${environment.label} local XR stage`}
      >
        <polyline
          points={routePolyline}
          fill="none"
          stroke="rgba(8, 47, 73, 0.78)"
          strokeDasharray="2.4 1.6"
          strokeWidth="0.65"
          vectorEffect="non-scaling-stroke"
          data-kg-flight-sim-geo-route="1"
        />
        {navigation.objective ? (
          <line
            x1={navigation.aircraft.x * 100}
            y1={navigation.aircraft.y * 100}
            x2={navigation.objective.x * 100}
            y2={navigation.objective.y * 100}
            stroke="#fde047"
            strokeDasharray="1.2 1.4"
            strokeLinecap="round"
            strokeWidth="0.9"
            vectorEffect="non-scaling-stroke"
            data-kg-flight-sim-geo-objective-guide={navigation.objective.id}
          />
        ) : null}
        {navigation.route.map(point => (
          <circle
            key={point.id}
            cx={point.x * 100}
            cy={point.y * 100}
            r={point.kind === 'landing' ? 1.25 : 0.9}
            fill={markerColor(point.state)}
            stroke="#f8fafc"
            strokeWidth="0.35"
            vectorEffect="non-scaling-stroke"
            data-kg-flight-sim-geo-route-point={point.id}
            data-kg-flight-sim-geo-route-state={point.state}
          />
        ))}
      </svg>
      <output className="absolute left-3 top-28 rounded-full border border-cyan-200/70 bg-slate-950/75 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100 shadow-lg backdrop-blur-sm">
        Flight on Geo · {environment.label} local stage
      </output>
      <button
        ref={setInputElement}
        type="button"
        className="pointer-events-auto absolute grid size-12 place-items-center rounded-full border-2 border-white bg-cyan-600 text-white shadow-[0_0_0_5px_rgba(8,47,73,0.28),0_8px_22px_rgba(8,47,73,0.45)] transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
        style={{
          left: `${navigation.aircraft.x * 100}%`,
          top: `${navigation.aircraft.y * 100}%`,
          transform: `translate(-50%, -50%) rotate(${aircraftHeading}deg)`,
        }}
        aria-label="Flight aircraft control on Geo"
        title="Flight aircraft · click for pointer control"
        data-kg-flight-sim-geo-aircraft="1"
        data-kg-flight-sim-geo-heading={navigation.aircraft.headingDegrees.toFixed(3)}
      >
        <Plane className="size-7" aria-hidden="true" />
      </button>
    </section>
  )
}
