import {
  activateGeoXrSurfaceAtomically,
  type GeoXrSurfaceActivationDependencies,
} from '@/features/geospatial/geoXrSurfaceActivation'

const createDependencies = (
  overrides: Partial<GeoXrSurfaceActivationDependencies> = {},
): GeoXrSurfaceActivationDependencies => ({
  readGeospatialEnabled: () => false,
  preloadGeospatial: async () => {},
  commitGeospatialEnabled: async enabled => enabled,
  activateXr: () => true,
  ...overrides,
})

const readError = async (operation: Promise<unknown>): Promise<unknown> => {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected Geo+XR activation to fail')
}

export async function testGeoXrSurfaceActivationWaitsForGeospatialOwner() {
  const actions: string[] = []
  let releasePreload = () => {}
  const preloadBarrier = new Promise<void>(resolve => {
    releasePreload = resolve
  })
  const activation = activateGeoXrSurfaceAtomically(createDependencies({
    readGeospatialEnabled: () => {
      actions.push('read')
      return false
    },
    preloadGeospatial: async () => {
      actions.push('preload')
      await preloadBarrier
    },
    commitGeospatialEnabled: async enabled => {
      actions.push(`geo:${String(enabled)}`)
      return enabled
    },
    activateXr: () => {
      actions.push('xr')
      return true
    },
  }))

  await Promise.resolve()
  if (actions.join('|') !== 'preload') {
    throw new Error(`XR must remain untouched while MapLibre preloads, got ${actions.join('|')}`)
  }
  const concurrentActivation = activateGeoXrSurfaceAtomically(createDependencies({
    preloadGeospatial: async () => {
      actions.push('concurrent-preload')
    },
    commitGeospatialEnabled: async enabled => {
      actions.push(`concurrent-geo:${String(enabled)}`)
      return enabled
    },
    activateXr: () => {
      actions.push('concurrent-xr')
      return true
    },
  }))
  if (concurrentActivation !== activation) {
    throw new Error('Concurrent Geo+XR requests must share one activation transaction')
  }
  releasePreload()
  if (
    !await activation
    || !await concurrentActivation
    || actions.join('|') !== 'preload|read|geo:true|xr'
  ) {
    throw new Error(`Expected atomic Geo-first activation, got ${actions.join('|')}`)
  }
}

export async function testGeoXrSurfaceActivationRollsBackFailures() {
  const unavailableActions: string[] = []
  const unavailableError = await readError(activateGeoXrSurfaceAtomically(createDependencies({
    preloadGeospatial: async () => {
      unavailableActions.push('preload')
    },
    commitGeospatialEnabled: async enabled => {
      unavailableActions.push(`geo:${String(enabled)}`)
      return enabled
    },
    activateXr: () => {
      unavailableActions.push('xr')
      return false
    },
  })))
  if (
    !(unavailableError instanceof Error)
    || unavailableActions.join('|') !== 'preload|geo:true|xr|geo:false'
  ) {
    throw new Error(`Expected unavailable XR to restore disabled Geo, got ${JSON.stringify({
      error: unavailableError instanceof Error ? unavailableError.message : unavailableError,
      unavailableActions,
    })}`)
  }

  const originalError = new Error('xr-commit-failed')
  const previousEnabledActions: string[] = []
  const thrownError = await readError(activateGeoXrSurfaceAtomically(createDependencies({
    readGeospatialEnabled: () => true,
    commitGeospatialEnabled: async enabled => {
      previousEnabledActions.push(`geo:${String(enabled)}`)
      return enabled
    },
    activateXr: () => {
      previousEnabledActions.push('xr')
      throw originalError
    },
  })))
  if (
    thrownError !== originalError
    || previousEnabledActions.join('|') !== 'geo:true|xr|geo:true'
    || previousEnabledActions.includes('geo:false')
  ) {
    throw new Error(`Expected XR error identity and enabled Geo ownership to survive rollback, got ${JSON.stringify({
      sameError: thrownError === originalError,
      previousEnabledActions,
    })}`)
  }
}

export async function testGeoXrSurfaceActivationFailsClosedBeforeXrAndReportsRollbackFailure() {
  const preloadActions: string[] = []
  const preloadError = await readError(activateGeoXrSurfaceAtomically(createDependencies({
    preloadGeospatial: async () => {
      preloadActions.push('preload')
      throw new Error('maplibre-preload-failed')
    },
    commitGeospatialEnabled: async enabled => {
      preloadActions.push(`geo:${String(enabled)}`)
      return enabled
    },
    activateXr: () => {
      preloadActions.push('xr')
      return true
    },
  })))
  if (
    !(preloadError instanceof Error)
    || preloadError.message !== 'maplibre-preload-failed'
    || preloadActions.join('|') !== 'preload'
  ) {
    throw new Error(`Expected failed MapLibre preload to leave both owners untouched, got ${JSON.stringify({
      error: preloadError instanceof Error ? preloadError.message : preloadError,
      preloadActions,
    })}`)
  }

  const enableActions: string[] = []
  const enableError = await readError(activateGeoXrSurfaceAtomically(createDependencies({
    commitGeospatialEnabled: async enabled => {
      enableActions.push(`geo:${String(enabled)}`)
      return false
    },
    activateXr: () => {
      enableActions.push('xr')
      return true
    },
  })))
  if (
    !(enableError instanceof Error)
    || enableActions.join('|') !== 'geo:true|geo:false'
    || enableActions.includes('xr')
  ) {
    throw new Error(`Expected failed Geo enablement to leave XR untouched, got ${JSON.stringify({
      error: enableError instanceof Error ? enableError.message : enableError,
      enableActions,
    })}`)
  }

  let setCallCount = 0
  const aggregate = await readError(activateGeoXrSurfaceAtomically(createDependencies({
    commitGeospatialEnabled: async enabled => {
      setCallCount += 1
      if (setCallCount === 1) return enabled
      throw new Error('geo-rollback-failed')
    },
    activateXr: () => false,
  })))
  if (
    !(aggregate instanceof AggregateError)
    || aggregate.errors.length !== 2
    || !aggregate.errors.some(error => error instanceof Error && error.message === 'geo-rollback-failed')
  ) {
    throw new Error(`Expected combined activation and rollback failure, got ${String(aggregate)}`)
  }
}
