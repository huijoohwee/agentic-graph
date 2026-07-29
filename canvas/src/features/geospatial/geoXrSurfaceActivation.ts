import {
  preloadGeospatialMapRuntime,
} from '@/features/geospatial/gympgrphBridge'
import {
  commitCanvasGeospatialModeEnabled,
} from '@/features/geospatial/geospatialModeCommit'
import { activateXrSceneSurface } from '@/features/three/xrSceneSurfaceRuntime'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'

export type GeoXrSurfaceActivationDependencies = Readonly<{
  readGeospatialEnabled: () => boolean
  preloadGeospatial: () => Promise<void>
  commitGeospatialEnabled: (enabled: boolean) => Promise<boolean>
  activateXr: () => boolean
}>

const DEFAULT_DEPENDENCIES: GeoXrSurfaceActivationDependencies = {
  readGeospatialEnabled: readGeospatialOverlayEnabledPreference,
  preloadGeospatial: preloadGeospatialMapRuntime,
  commitGeospatialEnabled: commitCanvasGeospatialModeEnabled,
  activateXr: () => activateXrSceneSurface({
    geospatialComposite: true,
    preserveGameplay: true,
  }),
}

let activationInFlight: Promise<boolean> | null = null

const restoreGeospatialOwner = async (
  previousEnabled: boolean,
  dependencies: GeoXrSurfaceActivationDependencies,
): Promise<void> => {
  const restored = await dependencies.commitGeospatialEnabled(previousEnabled)
  if (restored !== previousEnabled) {
    throw new Error(
      `The native geospatial Canvas owner could not be restored to ${String(previousEnabled)}.`,
    )
  }
}

/**
 * Commits Geo before XR so Flight never becomes a standalone replacement
 * while a composite transition is still pending.
 */
async function performGeoXrSurfaceActivation(
  dependencyOverrides: Partial<GeoXrSurfaceActivationDependencies> = {},
): Promise<boolean> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides }

  await dependencies.preloadGeospatial()
  const previousEnabled = dependencies.readGeospatialEnabled()

  try {
    const enabled = await dependencies.commitGeospatialEnabled(true)
    if (!enabled) {
      throw new Error('The native geospatial Canvas owner remained disabled.')
    }
    if (!dependencies.activateXr()) {
      throw new Error('The shared Geo+XR Mode surface is unavailable for this document.')
    }
    return true
  } catch (activationError) {
    try {
      await restoreGeospatialOwner(previousEnabled, dependencies)
    } catch (rollbackError) {
      throw new AggregateError(
        [activationError, rollbackError],
        'Geo+XR Mode activation and geospatial rollback both failed.',
      )
    }
    throw activationError
  }
}

export function activateGeoXrSurfaceAtomically(
  dependencyOverrides: Partial<GeoXrSurfaceActivationDependencies> = {},
): Promise<boolean> {
  if (activationInFlight) return activationInFlight

  const activation = performGeoXrSurfaceActivation(dependencyOverrides)
  let trackedActivation: Promise<boolean>
  trackedActivation = activation.finally(() => {
    if (activationInFlight === trackedActivation) activationInFlight = null
  })
  activationInFlight = trackedActivation
  return trackedActivation
}
