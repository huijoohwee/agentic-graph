import {
  readFlightGeoOverlayReadyFramePresented,
} from '../../flightGeoOverlay.js'
import {
  hasExpectedMapLibreFlightBootstrapStyle,
  hasExpectedMapLibreFlightBootstrapStyleIdentity,
  readMapLibreFlightBootstrapStyleIdentity,
} from './mapLibreFlightBootstrapStyleIdentity.js'
import {
  deleteMapLibreFlightBootstrapState,
  ensureMapLibreFlightBootstrapState,
  readMapLibreFlightBootstrapState,
  type MapLibreFlightBootstrapState,
} from './mapLibreFlightBootstrapState.js'
import {
  cancelMapLibreFlightProviderStyleApply,
  cancelMapLibreFlightProviderStyleLoad,
} from './mapLibreFlightProviderPromotion.js'
import {
  isMapLibreMapPreparingForDisposal,
} from './mapLibreHostLease.js'

export function removeMapLibreFlightBootstrapRenderBinding(
  state: MapLibreFlightBootstrapState,
): void {
  try {
    state.removeRenderBinding?.()
  } catch {
    void 0
  }
  state.queueProviderAdmission = null
  state.rearmProviderPromotion = null
  state.removeRenderBinding = null
}

function cancelBootstrapSettlementBindings(
  state: MapLibreFlightBootstrapState,
): void {
  try {
    state.cancelBootstrapSettlementBindings?.()
  } catch {
    void 0
  }
  state.cancelBootstrapSettlementBindings = null
}

export function clearPendingMapLibreFlightBootstrap(
  state: MapLibreFlightBootstrapState,
): void {
  state.bootstrapPending = false
  state.bootstrapExpectedStyle = null
  state.bootstrapGeneration += 1
  cancelBootstrapSettlementBindings(state)
}

export function requestMapLibreFlightBootstrapRepaint(
  state: MapLibreFlightBootstrapState,
): void {
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
  styleCommitObserved = false,
): boolean {
  return styleCommitObserved
    ? hasExpectedMapLibreFlightBootstrapStyleIdentity(
        state.map,
        state.bootstrapExpectedStyle,
      )
    : hasExpectedMapLibreFlightBootstrapStyle(
        state.map,
        state.bootstrapExpectedStyle,
      )
}

export function settlePendingMapLibreFlightBootstrap(
  state: MapLibreFlightBootstrapState,
  bootstrapGeneration: number,
  styleCommitObserved = false,
): void {
  if (
    state.disposed
    || isMapLibreMapPreparingForDisposal(state.map)
    || !state.bootstrapPending
    || state.bootstrapGeneration !== bootstrapGeneration
    || !hasExpectedBootstrapStyle(state, styleCommitObserved)
  ) return
  state.bootstrapPending = false
  state.bootstrapExpectedStyle = null
  cancelBootstrapSettlementBindings(state)
  state.bootstrapApplied = true
  state.deadlineFramePresented = readFlightGeoOverlayReadyFramePresented()
  state.providerPresentation = null
  requestMapLibreFlightBootstrapRepaint(state)
  notifyBootstrapSettled(state)
}

export function markMapLibreFlightBootstrapApplied(map: any): void {
  const state = ensureMapLibreFlightBootstrapState(map)
  if (!state || isMapLibreMapPreparingForDisposal(map)) return
  clearPendingMapLibreFlightBootstrap(state)
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
  const state = ensureMapLibreFlightBootstrapState(map)
  if (
    !state
    || state.disposed
    || isMapLibreMapPreparingForDisposal(map)
  ) return
  state.bootstrapStyle = bootstrapStyle
  clearPendingMapLibreFlightBootstrap(state)
  state.bootstrapApplied = false
  state.bootstrapPending = true
  state.deadlineFramePresented = false
  state.providerPresentation = null
  state.bootstrapExpectedStyle = readMapLibreFlightBootstrapStyleIdentity(
    bootstrapStyle,
  )
  const bootstrapGeneration = ++state.bootstrapGeneration
  const onStyleCommit = () =>
    settlePendingMapLibreFlightBootstrap(state, bootstrapGeneration, true)
  const onSettlementOpportunity = () =>
    settlePendingMapLibreFlightBootstrap(state, bootstrapGeneration)
  const bindings = [
    ['style.load', onStyleCommit],
    ['sourcedata', onSettlementOpportunity],
    ['idle', onSettlementOpportunity],
  ] as const
  const boundEvents: Array<readonly [string, () => void]> = []
  const cancelBindings = () => {
    for (const [event, listener] of boundEvents) {
      state.map.off?.(event, listener)
    }
    boundEvents.length = 0
  }
  state.cancelBootstrapSettlementBindings = cancelBindings
  try {
    for (const [event, listener] of bindings) {
      if (typeof state.map.on !== 'function') continue
      state.map.on(event, listener)
      boundEvents.push([event, listener])
    }
  } catch {
    cancelBindings()
    state.cancelBootstrapSettlementBindings = null
  }
  // Provider promotion is retained for this map's lifetime. Re-arm it for a
  // new Start after a stopped provider view returns to the local bootstrap.
  state.rearmProviderPromotion?.()
  queueMicrotask(() =>
    settlePendingMapLibreFlightBootstrap(state, bootstrapGeneration))
}

/**
 * Attempt to settle the current bootstrap. Production callers should use
 * `beginMapLibreFlightBootstrap()`, which owns the tokenized style listener;
 * this export keeps focused lifecycle tests able to exercise a real settle.
 */
export function settleMapLibreFlightBootstrap(map: any): void {
  const state = ensureMapLibreFlightBootstrapState(map)
  if (!state || state.disposed || !state.bootstrapPending) return
  settlePendingMapLibreFlightBootstrap(state, state.bootstrapGeneration)
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
  const state = ensureMapLibreFlightBootstrapState(map)
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

export function disposeMapLibreFlightBootstrap(map: any): void {
  const state = ensureMapLibreFlightBootstrapState(map)
  if (!state) return
  state.disposed = true
  state.bootstrapStyle = null
  state.generation += 1
  state.resumeReconciliation = null
  clearPendingMapLibreFlightBootstrap(state)
  cancelMapLibreFlightProviderStyleLoad(state)
  cancelMapLibreFlightProviderStyleApply(state)
  removeMapLibreFlightBootstrapRenderBinding(state)
  deleteMapLibreFlightBootstrapState(map)
}

/**
 * Stop every Flight-owned style writer while an exclusive surface handoff
 * empties this map. The state remains recoverable until the handoff commits.
 */
export function suspendMapLibreFlightBootstrapForDisposal(map: any): void {
  const state = readMapLibreFlightBootstrapState(map)
  if (!state || state.disposed) return
  state.generation += 1
  state.bootstrapApplied = false
  state.deadlineFramePresented = false
  state.providerPresentation = null
  clearPendingMapLibreFlightBootstrap(state)
  cancelMapLibreFlightProviderStyleLoad(state)
  cancelMapLibreFlightProviderStyleApply(state)
  removeMapLibreFlightBootstrapRenderBinding(state)
}

export function resumeMapLibreFlightBootstrapAfterDisposal(map: any): void {
  const state = readMapLibreFlightBootstrapState(map)
  if (
    !state
    || state.disposed
    || isMapLibreMapPreparingForDisposal(map)
  ) return
  if (state.resumeReconciliation) {
    state.resumeReconciliation()
    return
  }
  // A cold map can be fenced after its constructor receives the Flight style
  // but before the later reconciliation effect installs its recovery closure.
  // Re-arm that exact bootstrap listener so a failed handoff cannot strand the
  // still-owned map in a permanently ineligible state.
  if (state.bootstrapStyle) {
    beginMapLibreFlightBootstrap(map, state.bootstrapStyle)
  }
}
