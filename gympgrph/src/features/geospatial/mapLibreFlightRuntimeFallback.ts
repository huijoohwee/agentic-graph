import {
  cancelMapLibreFlightProviderStyleApply,
  cancelMapLibreFlightProviderStyleLoad,
  promoteMapLibreFlightProviderStyle,
  scheduleMapLibreFlightProviderStyleApply,
  type MapLibreFlightProviderPromotionState,
  type MapLibreFlightProviderStyle,
  type MapLibreFlightProviderStyleApplyScheduler,
} from './mapLibreFlightProviderPromotion.js'

type RuntimeFallbackCallbacks = Readonly<{
  key: string
  onApplied: () => void
  onRejected: (error: unknown) => void
}>

type PendingRuntimeFallback = {
  callbacks: Map<string, RuntimeFallbackCallbacks>
  generation: number
  map: any
  style: MapLibreFlightProviderStyle
}

export type MapLibreFlightRuntimeFallbackRequester = Readonly<{
  dispose: () => void
  request: (
    style: MapLibreFlightProviderStyle,
    callbacks: RuntimeFallbackCallbacks,
  ) => boolean
}>

/**
 * Runtime fallback keeps provider I/O outside MapLibre's URL-style swap.
 * Identical in-flight requests share one promotion so repeated provider errors
 * cannot starve the fallback by continuously aborting its own fetch.
 */
export function createMapLibreFlightRuntimeFallbackRequester(
  options: Readonly<{
    hasCurrentProviderPresentation: (map: any) => boolean
    hasExactFlightPresentation: (map: any) => boolean
    isDisposed: () => boolean
    loadResolvedStyle: (
      style: MapLibreFlightProviderStyle,
      signal: AbortSignal,
    ) => Promise<MapLibreFlightProviderStyle>
    readMap: () => any | null
    requiresFlightRetention: () => boolean
    resetNonFlightStyleRevision: () => void
    retainFlightOverlay: (
      previousStyle: Readonly<Record<string, any>> | undefined,
      nextStyle: Readonly<Record<string, any>>,
    ) => Record<string, any> | null
    scheduleProviderApply?: MapLibreFlightProviderStyleApplyScheduler
  }>,
): MapLibreFlightRuntimeFallbackRequester {
  const state: MapLibreFlightProviderPromotionState = {
    cancelProviderStyleApply: null,
    cancelProviderStyleLoad: null,
    disposed: false,
    generation: 0,
    map: null,
  }
  let pending: PendingRuntimeFallback | null = null

  const cancelPending = () => {
    state.generation += 1
    pending = null
    cancelMapLibreFlightProviderStyleApply(state)
    cancelMapLibreFlightProviderStyleLoad(state)
  }

  const request = (
    style: MapLibreFlightProviderStyle,
    callbacks: RuntimeFallbackCallbacks,
  ): boolean => {
    const map = options.readMap()
    if (
      !map
      || options.isDisposed()
      || state.disposed
      || typeof map.setStyle !== 'function'
    ) return false

    if (!options.requiresFlightRetention()) {
      cancelPending()
      options.resetNonFlightStyleRevision()
      try {
        map.setStyle(style)
        callbacks.onApplied()
        return true
      } catch (error) {
        callbacks.onRejected(error)
        return false
      }
    }

    if (
      pending
      && pending.map === map
      && Object.is(pending.style, style)
    ) {
      pending.callbacks.set(callbacks.key, callbacks)
      return true
    }

    cancelPending()
    const generation = state.generation
    state.map = map
    pending = {
      callbacks: new Map([[callbacks.key, callbacks]]),
      generation,
      map,
      style,
    }
    let resolutionError: unknown = null
    void promoteMapLibreFlightProviderStyle({
      generation,
      hasCurrentProviderPresentation: () => (
        !options.isDisposed()
        && options.readMap() === map
        && options.requiresFlightRetention()
        && options.hasCurrentProviderPresentation(map)
      ),
      hasExactFlightOverlay: () => (
        options.hasExactFlightPresentation(map)
      ),
      loadProviderStyle: signal =>
        options.loadResolvedStyle(style, signal),
      onApplied: () => {
        if (pending?.generation !== generation) return
        const callbacksToNotify = [...pending.callbacks.values()]
        pending = null
        for (const callback of callbacksToNotify) callback.onApplied()
      },
      onError: error => {
        resolutionError = error
      },
      retainFlightOverlay: options.retainFlightOverlay,
      retainOverlay: true,
      scheduleProviderApply: (
        options.scheduleProviderApply
        || scheduleMapLibreFlightProviderStyleApply
      ),
      state,
    }).then(result => {
      if (
        result === 'applied'
        || pending?.generation !== generation
        || options.isDisposed()
        || options.readMap() !== map
      ) return
      const callbacksToNotify = [...pending.callbacks.values()]
      pending = null
      if (!options.requiresFlightRetention()) return
      for (const callback of callbacksToNotify) {
        callback.onRejected(resolutionError)
      }
    })
    return true
  }

  const dispose = () => {
    if (state.disposed) return
    state.disposed = true
    cancelPending()
    state.map = null
  }

  return Object.freeze({ dispose, request })
}
