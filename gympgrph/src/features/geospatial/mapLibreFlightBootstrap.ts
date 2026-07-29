import {
  markFlightGeoOverlayReadyFramePresented,
  readFlightGeoOverlay,
  readFlightGeoOverlayReadyFramePresented,
  type FlightGeoOverlayPresentation,
} from '../../flightGeoOverlay.js'
import {
  hasExpectedMapLibreFlightBootstrapStyle,
  readMapLibreFlightBootstrapStyleIdentity,
  type MapLibreFlightBootstrapStyleIdentity,
} from './mapLibreFlightBootstrapStyleIdentity.js'

type MapLibreFlightProviderPresentation = Readonly<{
  profileId: string
  readyFrameRequestId: number | null
  revision: string
  runId: number
  tick: number
}>

type MapLibreFlightBootstrapState = {
  bootstrapApplied: boolean
  bootstrapExpectedStyle: MapLibreFlightBootstrapStyleIdentity | null
  bootstrapGeneration: number
  bootstrapPending: boolean
  bootstrapSettledListeners: Set<() => void>
  cancelBootstrapStyleLoad: (() => void) | null
  cancelProviderStyleApply: (() => void) | null
  deadlineFramePresented: boolean
  disposed: boolean
  generation: number
  map: any
  providerPresentation: MapLibreFlightProviderPresentation | null
  removeRenderBinding: (() => void) | null
}

type MapLibreStyle = string | Readonly<Record<string, unknown>>
type ProviderStyleApplyScheduler = (apply: () => void) => () => void
type ProviderStylePromotionResult =
  | 'applied'
  | 'identity-changed'
  | 'terminated'

const MAPLIBRE_FLIGHT_PROVIDER_PROMOTION_IDLE_TIMEOUT_MS = 1_000

const bootstrapStateByMap = new WeakMap<object, MapLibreFlightBootstrapState>()

function readState(map: any): MapLibreFlightBootstrapState | null {
  if (!map || (typeof map !== 'object' && typeof map !== 'function')) return null
  let state = bootstrapStateByMap.get(map)
  if (!state) {
    state = {
      bootstrapApplied: false,
      bootstrapExpectedStyle: null,
      bootstrapGeneration: 0,
      bootstrapPending: false,
      bootstrapSettledListeners: new Set(),
      cancelBootstrapStyleLoad: null,
      cancelProviderStyleApply: null,
      deadlineFramePresented: false,
      disposed: false,
      generation: 0,
      map,
      providerPresentation: null,
      removeRenderBinding: null,
    }
    bootstrapStateByMap.set(map, state)
  }
  return state
}

function hasCurrentProviderPresentation(
  state: MapLibreFlightBootstrapState,
): boolean {
  const presentation = state.providerPresentation
  const current = readFlightGeoOverlay()
  return Boolean(
    presentation
    && current.active
    && current.profileId === presentation.profileId
    && current.runId === presentation.runId,
  )
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

function cancelBootstrapStyleLoad(state: MapLibreFlightBootstrapState): void {
  try {
    state.cancelBootstrapStyleLoad?.()
  } catch {
    void 0
  }
  state.cancelBootstrapStyleLoad = null
}

function clearPendingBootstrap(state: MapLibreFlightBootstrapState): void {
  state.bootstrapPending = false
  state.bootstrapExpectedStyle = null
  state.bootstrapGeneration += 1
  cancelBootstrapStyleLoad(state)
}

function requestMapRepaint(state: MapLibreFlightBootstrapState): void {
  try {
    state.map.triggerRepaint?.()
  } catch {
    void 0
  }
}

function notifyBootstrapSettled(state: MapLibreFlightBootstrapState): void {
  for (const listener of state.bootstrapSettledListeners) {
    try {
      listener()
    } catch {
      void 0
    }
  }
}

function hasExpectedBootstrapStyle(
  state: MapLibreFlightBootstrapState,
): boolean {
  return hasExpectedMapLibreFlightBootstrapStyle(
    state.map,
    state.bootstrapExpectedStyle,
  )
}

function settlePendingBootstrap(
  state: MapLibreFlightBootstrapState,
  bootstrapGeneration: number,
): void {
  if (
    state.disposed
    || !state.bootstrapPending
    || state.bootstrapGeneration !== bootstrapGeneration
    || !hasExpectedBootstrapStyle(state)
  ) return
  state.bootstrapPending = false
  state.bootstrapExpectedStyle = null
  cancelBootstrapStyleLoad(state)
  state.bootstrapApplied = true
  state.deadlineFramePresented = readFlightGeoOverlayReadyFramePresented()
  state.providerPresentation = null
  requestMapRepaint(state)
  notifyBootstrapSettled(state)
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
}>): Promise<ProviderStylePromotionResult> {
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
    if (state.disposed || state.generation !== generation) return 'terminated'
    if (retainOverlay && !hasCurrentProviderPresentation(state)) {
      return 'identity-changed'
    }
    if (
      retainOverlay
      && !await waitForProviderStyleApplyOpportunity({
        generation,
        schedule: scheduleProviderApply,
        state,
      })
    ) return 'terminated'
    if (retainOverlay && !hasCurrentProviderPresentation(state)) {
      return 'identity-changed'
    }
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
    clearPendingBootstrap(state)
    return 'applied'
  } catch (error) {
    reportError(state, generation, onError, error)
    return 'terminated'
  }
}

export function markMapLibreFlightBootstrapApplied(map: any): void {
  const state = readState(map)
  if (!state) return
  clearPendingBootstrap(state)
  state.bootstrapApplied = true
  state.deadlineFramePresented = readFlightGeoOverlayReadyFramePresented()
  state.providerPresentation = null
}

/**
 * Reserve a Flight bootstrap before its local MapLibre style is installed.
 * A tokenized listener verifies that the emitted style is the exact local
 * bootstrap, rather than an already-mounted provider style racing this handoff.
 */
export function beginMapLibreFlightBootstrap(
  map: any,
  bootstrapStyle: Readonly<Record<string, unknown>>,
): void {
  const state = readState(map)
  if (!state || state.disposed) return
  clearPendingBootstrap(state)
  state.bootstrapApplied = false
  state.bootstrapPending = true
  state.deadlineFramePresented = false
  state.providerPresentation = null
  state.bootstrapExpectedStyle = readMapLibreFlightBootstrapStyleIdentity(
    bootstrapStyle,
  )
  const bootstrapGeneration = ++state.bootstrapGeneration
  const onStyleLoad = () => settlePendingBootstrap(state, bootstrapGeneration)
  try {
    state.map.on?.('style.load', onStyleLoad)
    state.cancelBootstrapStyleLoad = () => {
      state.map.off?.('style.load', onStyleLoad)
    }
  } catch {
    state.cancelBootstrapStyleLoad = null
  }
  queueMicrotask(() => settlePendingBootstrap(state, bootstrapGeneration))
}

/**
 * Attempt to settle the current bootstrap. Production callers should use
 * `beginMapLibreFlightBootstrap()`, which owns the tokenized style listener;
 * this export keeps focused lifecycle tests able to exercise a real settle.
 */
export function settleMapLibreFlightBootstrap(map: any): void {
  const state = readState(map)
  if (!state || state.disposed || !state.bootstrapPending) return
  settlePendingBootstrap(state, state.bootstrapGeneration)
}

/**
 * Subscribe to the one transition which makes stopped/ready Flight payloads
 * eligible for MapLibre writes. An already-settled state is replayed in a
 * microtask so a late React effect cannot strand the first-frame gate.
 */
export function subscribeMapLibreFlightBootstrapSettled(
  map: any,
  listener: () => void,
): () => void {
  const state = bootstrapStateByMap.get(map)
  if (!state || state.disposed) return () => void 0
  state.bootstrapSettledListeners.add(listener)
  if (state.bootstrapApplied) {
    queueMicrotask(() => {
      if (!state.disposed && state.bootstrapSettledListeners.has(listener)) {
        try {
          listener()
        } catch {
          void 0
        }
      }
    })
  }
  return () => state.bootstrapSettledListeners.delete(listener)
}

/**
 * The Flight publisher can synchronously request a stopped presentation while
 * React is still committing the bootstrap-style handoff for an already-mounted
 * provider map. Do not let that old map acknowledge the preparation frame: the
 * bootstrap style would immediately discard its source and make ready wait for
 * another GeoJSON worker settlement.
 *
 * A provider style is still an allowed presenter after this map earned the
 * exact ready frame. Provider promotion deliberately clears `bootstrapApplied`,
 * so retain that narrower ready-only path without allowing a new stopped run to
 * prepare against the provider map.
 */
export function canMapLibreFlightOverlayPresent(
  map: any,
  presentation: FlightGeoOverlayPresentation,
): boolean {
  if (!map || (typeof map !== 'object' && typeof map !== 'function')) {
    return false
  }
  const state = bootstrapStateByMap.get(map)
  const providerPresentation = state?.providerPresentation
  return Boolean(
    state
    && !state.disposed
    && (
      state.bootstrapApplied
      || (
        presentation.phase === 'ready'
        && state.deadlineFramePresented
        && providerPresentation
        && presentation.profileId === providerPresentation.profileId
        && presentation.revision === providerPresentation.revision
        && presentation.runId === providerPresentation.runId
        && presentation.tick === providerPresentation.tick
        && (
          presentation.readyFrameRequestId
            === providerPresentation.readyFrameRequestId
          || presentation.readyFrameRequestId === null
        )
      )
    ),
  )
}

export function markMapLibreFlightOverlayPresented(
  map: any,
  presentation: FlightGeoOverlayPresentation,
): void {
  const state = readState(map)
  const current = readFlightGeoOverlay()
  if (
    !state
    || state.disposed
    || presentation.phase !== 'ready'
    || presentation.tick !== 0
    || presentation.runId <= 0
    || !current.active
    || current.phase !== presentation.phase
    || current.profileId !== presentation.profileId
    || current.readyFrameRequestId !== presentation.readyFrameRequestId
    || current.revision !== presentation.revision
    || current.runId !== presentation.runId
    || current.tick !== presentation.tick
  ) return
  const previousPresentation = state.providerPresentation
  state.providerPresentation = {
    profileId: presentation.profileId,
    readyFrameRequestId: presentation.readyFrameRequestId,
    revision: presentation.revision,
    runId: presentation.runId,
    tick: presentation.tick,
  }
  if (
    previousPresentation?.profileId === presentation.profileId
    && previousPresentation.runId === presentation.runId
  ) return
  // Provider loading is authorized by this map's exact visual overlay, not
  // by another surface's one-shot playable-frame deadline.
  requestMapRepaint(state)
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
    || state.deadlineFramePresented
  ) return
  if (!markFlightGeoOverlayReadyFramePresented(
    expectedRevision,
    expectedReadyFrameRequestId,
  )) return
  state.deadlineFramePresented = true
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
    state.deadlineFramePresented = false
    state.providerPresentation = null
    const shouldRestoreProvider = state.bootstrapApplied || state.bootstrapPending
    state.bootstrapApplied = false
    clearPendingBootstrap(state)
    if (!shouldRestoreProvider) return
    void promoteProviderStyle({
      ...options,
      generation,
      retainOverlay: false,
      scheduleProviderApply,
      state,
    })
    return
  }

  if (
    !state.bootstrapApplied
    && !state.bootstrapPending
    && !hasCurrentProviderPresentation(state)
  ) {
    try {
      // The source-owned style is installed before provider resolution starts,
      // so the first playable Flight frame never waits on remote style I/O.
      beginMapLibreFlightBootstrap(state.map, options.bootstrapStyle)
      state.map.setStyle?.(options.bootstrapStyle, { diff: true })
    } catch (error) {
      clearPendingBootstrap(state)
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
      || state.bootstrapPending
      || !hasCurrentProviderPresentation(state)
      || !options.hasExactFlightOverlay(state.map)
    ) return
    promotionStarted = true
    void promoteProviderStyle({
      ...options,
      generation,
      retainOverlay: true,
      scheduleProviderApply,
      state,
    }).then(result => {
      if (state.disposed || state.generation !== generation) return
      if (result === 'identity-changed') {
        promotionStarted = false
        requestMapRepaint(state)
        return
      }
      removeRenderBinding(state)
    })
  }
  if (typeof state.map.on === 'function') {
    state.map.on('render', promoteWhenPresented)
    state.removeRenderBinding = () => {
      state.map.off?.('render', promoteWhenPresented)
    }
  }
  requestMapRepaint(state)
  queueMicrotask(promoteWhenPresented)
}

export function disposeMapLibreFlightBootstrap(map: any): void {
  const state = readState(map)
  if (!state) return
  state.disposed = true
  state.generation += 1
  clearPendingBootstrap(state)
  cancelProviderStyleApply(state)
  removeRenderBinding(state)
  bootstrapStateByMap.delete(map)
}
