import {
  preloadGeospatialMapRuntime,
  setGeospatialModeEnabled,
} from '@/features/geospatial/gympgrphBridge'
import { activateXrSceneSurface } from '@/features/three/xrSceneSurfaceRuntime'
import { throwIfFlightSimSurfaceOpenStale } from './flightSimSurfaceOpenLifecycle'

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
  await preloadGeospatialMapRuntime()
}

export async function activateFlightSimSurfacePresentation(
  options: FlightSimSurfacePresentationOptions,
  expectedGeneration: number,
): Promise<boolean> {
  if (options.geospatialComposite) {
    const enabled = await setGeospatialModeEnabled(true)
    if (!enabled) {
      throw new Error('The native geospatial Canvas owner remained disabled.')
    }
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
