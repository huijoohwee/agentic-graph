import {
  preloadGeospatialMapRuntime,
} from '@/features/geospatial/gympgrphBridge'
import {
  commitCanvasGeospatialSurfaceOwnership,
} from '@/features/geospatial/geospatialSurfaceOwnershipRuntime'
import {
  waitForActiveCanvasFrontmatterSurfaceTransition,
} from '@/features/parsers/canvasFrontmatterSurfaceTransition'
import { activateXrSceneSurface } from '@/features/three/xrSceneSurfaceRuntime'
import {
  isFlightSimSurfaceOpenCurrent,
  throwIfFlightSimSurfaceOpenStale,
} from './flightSimSurfaceOpenLifecycle'

type FlightSimSurfacePresentationOptions = Readonly<{
  geospatialComposite?: boolean
  openPanel?: boolean
  signal?: AbortSignal
}>

export function throwIfFlightSimOperationAborted(
  signal?: AbortSignal,
): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Flight Sim operation was aborted')
}

export async function preloadFlightSimSurfacePresentation(
  options: FlightSimSurfacePresentationOptions,
): Promise<void> {
  if (!options.geospatialComposite) return
  await waitForActiveCanvasFrontmatterSurfaceTransition()
  await preloadGeospatialMapRuntime()
}

export async function activateFlightSimSurfacePresentation(
  options: FlightSimSurfacePresentationOptions,
  expectedGeneration: number,
): Promise<boolean> {
  if (options.geospatialComposite) {
    await commitCanvasGeospatialSurfaceOwnership(true, {
      isCurrent: () => (
        isFlightSimSurfaceOpenCurrent(expectedGeneration)
        && options.signal?.aborted !== true
      ),
    })
    throwIfFlightSimSurfaceOpenStale(expectedGeneration)
    throwIfFlightSimOperationAborted(options.signal)
  }
  return activateXrSceneSurface({
    gameplaySurface: 'flightSim',
    ...(options.geospatialComposite
      ? { geospatialComposite: true }
      : {}),
    ...(options.openPanel === false
      ? {}
      : { panelView: 'flightSim', openPanel: true }),
  })
}
