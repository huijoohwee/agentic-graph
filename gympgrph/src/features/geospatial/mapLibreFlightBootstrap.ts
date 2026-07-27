import {
  markFlightGeoOverlayReadyFramePresented,
  readFlightGeoOverlayReadyFramePresented,
} from '../../flightGeoOverlay.js'

type MapLibreFlightBootstrapState = {
  bootstrapApplied: boolean
  cancelProviderStyleApply: (() => void) | null
  disposed: boolean
  generation: number
  map: any
  readyFramePresented: boolean
  removeRenderBinding: (() => void) | null
}

type MapLibreStyle = string | Readonly<Record<string, unknown>>
type ProviderStyleApplyScheduler = (apply: () => void) => () => void

const MAPLIBRE_FLIGHT_PROVIDER_PROMOTION_IDLE_TIMEOUT_MS = 1_000

const bootstrapStateByMap = new WeakMap<object, MapLibreFlightBootstrapState>()

function readState(map: any): MapLibreFlightBootstrapState | null {
  if (!map || (typeof map !== 'object' && typeof map !== 'function')) return null
  let state = bootstrapStateByMap.get(map)
  if (!state) {
    state = {
      bootstrapApplied: false,
      cancelProviderStyleApply: null,
      disposed: false,
      generation: 0,
      map,
      readyFramePresented: false,
      removeRenderBinding: null,
    }
    bootstrapStateByMap.set(map, state)
  }
  return state
}

function removeRenderBinding(state: MapLibreFlightBootstrapState): void {
  try {
    state.removeRenderBinding?.()
  } catch {
    void 0
  }
  state.removeRenderBinding = null
}

function cancelProviderStyleApply(state: MapLibreFlightBootstrapState): void {
  try {
    state.cancelProviderStyleApply?.()
  } catch {
    void 0
  }
  state.cancelProviderStyleApply = null
}

function scheduleProviderStyleApply(apply: () => void): () => void {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const requestId = globalThis.requestIdleCallback(apply, {
      timeout: MAPLIBRE_FLIGHT_PROVIDER_PROMOTION_IDLE_TIMEOUT_MS,
    })
    return () => globalThis.cancelIdleCallback(requestId)
  }
  if (typeof globalThis.requestAnimationFrame === 'function') {
    let secondFrame: number | null = null
    const firstFrame = globalThis.requestAnimationFrame(() => {
      secondFrame = globalThis.requestAnimationFrame(apply)
    })
    return () => {
      globalThis.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) globalThis.cancelAnimationFrame(secondFrame)
    }
  }
  const timeout = setTimeout(apply, 0)
  return () => clearTimeout(timeout)
}

function waitForProviderStyleApplyOpportunity(options: Readonly<{
  generation: number
  schedule: ProviderStyleApplyScheduler
  state: MapLibreFlightBootstrapState
}>): Promise<boolean> {
  const { generation, schedule, state } = options
  cancelProviderStyleApply(state)
  return new Promise(resolve => {
    let settled = false
    let cancelScheduled: () => void = () => void 0
    const settle = (scheduled: boolean) => {
      if (settled) return
      settled = true
      if (state.cancelProviderStyleApply === cancel) {
        state.cancelProviderStyleApply = null
      }
      resolve(
        scheduled
        && !state.disposed
        && state.generation === generation,
      )
    }
    const cancel = () => {
      cancelScheduled()
      settle(false)
    }
    state.cancelProviderStyleApply = cancel
    cancelScheduled = schedule(() => settle(true))
  })
}

function reportError(
  state: MapLibreFlightBootstrapState,
  generation: number,
  onError: ((error: unknown) => void) | undefined,
  error: unknown,
): void {
  if (state.disposed || state.generation !== generation) return
  onError?.(error)
}

async function promoteProviderStyle(options: Readonly<{
  generation: number
  loadProviderStyle: () => Promise<MapLibreStyle>
  onError?: (error: unknown) => void
  retainFlightOverlay: (
    previousStyle: Readonly<Record<string, any>> | undefined,
    nextStyle: Readonly<Record<string, any>>,
  ) => Record<string, any>
  retainOverlay: boolean
  scheduleProviderApply: ProviderStyleApplyScheduler
  state: MapLibreFlightBootstrapState
}>): Promise<void> {
  const {
    generation,
    loadProviderStyle,
    onError,
    retainFlightOverlay,
    retainOverlay,
    scheduleProviderApply,
    state,
  } = options
  try {
    const providerStyle = await loadProviderStyle()
    if (state.disposed || state.generation !== generation) return
    if (
      retainOverlay
      && !await waitForProviderStyleApplyOpportunity({
        generation,
        schedule: scheduleProviderApply,
        state,
      })
    ) return
    state.map.setStyle?.(
      providerStyle,
      retainOverlay
        ? {
            diff: true,
            transformStyle: retainFlightOverlay,
          }
        : { diff: true },
    )
    state.bootstrapApplied = false
  } catch (error) {
    reportError(state, generation, onError, error)
  }
}

export function markMapLibreFlightBootstrapApplied(map: any): void {
  const state = readState(map)
  if (!state) return
  state.bootstrapApplied = true
  state.readyFramePresented = readFlightGeoOverlayReadyFramePresented()
}

export function markMapLibreFlightReadyFramePresented(
  map: any,
  expectedRevision: string,
  expectedReadyFrameRequestId: number,
): void {
  const state = readState(map)
  if (
    !state
    || state.disposed
    || !state.bootstrapApplied
    || state.readyFramePresented
  ) return
  if (!markFlightGeoOverlayReadyFramePresented(
    expectedRevision,
    expectedReadyFrameRequestId,
  )) return
  state.readyFramePresented = true
  try {
    // Provider promotion begins on the render after the local ready frame was
    // acknowledged, so its style swap cannot consume the playable deadline.
    state.map.triggerRepaint?.()
  } catch {
    void 0
  }
}

export function reconcileMapLibreFlightBootstrap(options: Readonly<{
  bootstrapStyle: Readonly<Record<string, unknown>> | null
  hasExactFlightOverlay: (map: any) => boolean
  loadProviderStyle: () => Promise<MapLibreStyle>
  map: any
  onError?: (error: unknown) => void
  scheduleProviderStyleApply?: ProviderStyleApplyScheduler
  retainFlightOverlay: (
    previousStyle: Readonly<Record<string, any>> | undefined,
    nextStyle: Readonly<Record<string, any>>,
  ) => Record<string, any>
}>): void {
  const state = readState(options.map)
  if (!state || state.disposed) return
  const generation = ++state.generation
  cancelProviderStyleApply(state)
  removeRenderBinding(state)
  const scheduleProviderApply = (
    options.scheduleProviderStyleApply
    || scheduleProviderStyleApply
  )

  if (!options.bootstrapStyle) {
    state.readyFramePresented = false
    if (!state.bootstrapApplied) return
    void promoteProviderStyle({
      ...options,
      generation,
      retainOverlay: false,
      scheduleProviderApply,
      state,
    })
    return
  }

  if (readFlightGeoOverlayReadyFramePresented()) {
    state.readyFramePresented = true
  }

  if (!state.bootstrapApplied && !state.readyFramePresented) {
    try {
      // The source-owned style is installed before provider resolution starts,
      // so the first playable Flight frame never waits on remote style I/O.
      state.map.setStyle?.(options.bootstrapStyle, { diff: true })
      state.bootstrapApplied = true
      state.readyFramePresented = false
    } catch (error) {
      reportError(state, generation, options.onError, error)
      return
    }
  }

  let promotionStarted = false
  const promoteWhenPresented = () => {
    if (
      promotionStarted
      || state.disposed
      || state.generation !== generation
      || !state.readyFramePresented
      || !options.hasExactFlightOverlay(state.map)
    ) return
    promotionStarted = true
    removeRenderBinding(state)
    void promoteProviderStyle({
      ...options,
      generation,
      retainOverlay: true,
      scheduleProviderApply,
      state,
    })
  }
  if (typeof state.map.on === 'function') {
    state.map.on('render', promoteWhenPresented)
    state.removeRenderBinding = () => {
      state.map.off?.('render', promoteWhenPresented)
    }
  }
  state.map.triggerRepaint?.()
  queueMicrotask(promoteWhenPresented)
}

export function disposeMapLibreFlightBootstrap(map: any): void {
  const state = readState(map)
  if (!state) return
  state.disposed = true
  state.generation += 1
  cancelProviderStyleApply(state)
  removeRenderBinding(state)
  bootstrapStateByMap.delete(map)
}
