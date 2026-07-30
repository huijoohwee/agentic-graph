import {
  markFlightGeoOverlayReadyFramePresented,
  readFlightGeoOverlay,
  readFlightGeoOverlayReadyFramePresented,
  type FlightGeoOverlayPresentation,
  type FlightGeoOverlaySnapshot,
} from '../../flightGeoOverlay.js'
import {
  hasEquivalentStoppedFrameVisuals,
  type FlightGeoStoppedFrameProof,
} from './flightGeoStoppedFrameReuse.js'
import { readFlightGeoOverlayPresentationCamera } from './flightGeoOverlayPresentationCamera.js'
import {
  mapHasExactFlightOverlay,
} from './flightGeoOverlayPresentationContracts.js'
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
  promoteMapLibreFlightProviderStyle,
  scheduleMapLibreFlightProviderStyleApply,
  type MapLibreFlightProviderStyle,
  type MapLibreFlightProviderStyleApplyScheduler,
} from './mapLibreFlightProviderPromotion.js'
import {
  isMapLibreMapPreparingForDisposal,
} from './mapLibreHostLease.js'

function hasCurrentProviderPresentation(
  state: MapLibreFlightBootstrapState,
): boolean {
  if (isMapLibreMapPreparingForDisposal(state.map)) return false
  const presentation = state.providerPresentation
  const current = readFlightGeoOverlay()
  if (
    !presentation
    || !current.active
    || current.profileId !== presentation.profileId
    || current.runId !== presentation.runId
  ) return false
  if (presentation.phase === 'stopped') {
    return current.phase === 'stopped'
      && current.readyFrameRequestId === null
      && current.revision === presentation.revision
      && current.tick === presentation.tick
  }
  const readyRequestMatches = (
    current.readyFrameRequestId === presentation.readyFrameRequestId
    || current.readyFrameRequestId === null
  )
  if (!readyRequestMatches) return false
  if (
    current.phase === 'ready'
    && current.revision === presentation.revision
    && current.tick === presentation.tick
  ) return true
  // Provider I/O and its idle apply opportunity may outlive tick zero. Once
  // this map earned the Ready frame, the same run may advance while the
  // just-before-setStyle exactness check validates its latest visual payload.
  return state.deadlineFramePresented && current.phase !== 'stopped'
}

export function mapHasCurrentFlightProviderPresentation(map: any): boolean {
  const state = readMapLibreFlightBootstrapState(map)
  return Boolean(
    state
    && !state.disposed
    && hasCurrentProviderPresentation(state),
  )
}

function hasExactCommittedStoppedFrameProof(
  state: MapLibreFlightBootstrapState,
  current: FlightGeoOverlaySnapshot,
  proof: FlightGeoStoppedFrameProof | undefined,
): boolean {
  if (!proof) return false
  try {
    const canvas = state.map.getCanvas?.()
    if (canvas !== proof.canvas) return false
    const camera = readFlightGeoOverlayPresentationCamera(
      state.map,
      current,
      proof.viewMode,
    )
    return camera.exact
      && mapHasExactFlightOverlay(state.map, current)
      && hasEquivalentStoppedFrameVisuals(
        proof,
        state.map,
        canvas,
        current,
        camera.signature,
        proof.viewMode,
      )
  } catch {
    return false
  }
}

function removeRenderBinding(state: MapLibreFlightBootstrapState): void {
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

function clearPendingBootstrap(state: MapLibreFlightBootstrapState): void {
  state.bootstrapPending = false
  state.bootstrapExpectedStyle = null
  state.bootstrapGeneration += 1
  cancelBootstrapSettlementBindings(state)
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
    || isMapLibreMapPreparingForDisposal(state.map)
    || !state.bootstrapPending
    || state.bootstrapGeneration !== bootstrapGeneration
    || !hasExpectedBootstrapStyle(state)
  ) return
  state.bootstrapPending = false
  state.bootstrapExpectedStyle = null
  cancelBootstrapSettlementBindings(state)
  state.bootstrapApplied = true
  state.deadlineFramePresented = readFlightGeoOverlayReadyFramePresented()
  state.providerPresentation = null
  requestMapRepaint(state)
  notifyBootstrapSettled(state)
}

export function markMapLibreFlightBootstrapApplied(map: any): void {
  const state = ensureMapLibreFlightBootstrapState(map)
  if (!state || isMapLibreMapPreparingForDisposal(map)) return
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
  const state = ensureMapLibreFlightBootstrapState(map)
  if (
    !state
    || state.disposed
    || isMapLibreMapPreparingForDisposal(map)
  ) return
  state.bootstrapStyle = bootstrapStyle
  clearPendingBootstrap(state)
  state.bootstrapApplied = false
  state.bootstrapPending = true
  state.deadlineFramePresented = false
  state.providerPresentation = null
  state.bootstrapExpectedStyle = readMapLibreFlightBootstrapStyleIdentity(
    bootstrapStyle,
  )
  const bootstrapGeneration = ++state.bootstrapGeneration
  const onSettlementOpportunity = () =>
    settlePendingBootstrap(state, bootstrapGeneration)
  const bindings = [
    ['style.load', onSettlementOpportunity],
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
  queueMicrotask(() => settlePendingBootstrap(state, bootstrapGeneration))
}

/**
 * Attempt to settle the current bootstrap. Production callers should use
 * `beginMapLibreFlightBootstrap()`, which owns the tokenized style listener;
 * this export keeps focused lifecycle tests able to exercise a real settle.
 */
export function settleMapLibreFlightBootstrap(map: any): void {
  const state = ensureMapLibreFlightBootstrapState(map)
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
  const state = readMapLibreFlightBootstrapState(map)
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
 * A provider style is still an allowed presenter for the exact stopped or ready
 * identity which authorized its promotion. Provider promotion deliberately
 * clears `bootstrapApplied`, so a later run cannot borrow that presentation.
 */
export function canMapLibreFlightOverlayPresent(
  map: any,
  presentation: FlightGeoOverlayPresentation,
): boolean {
  if (!map || (typeof map !== 'object' && typeof map !== 'function')) {
    return false
  }
  const state = readMapLibreFlightBootstrapState(map)
  const providerPresentation = state?.providerPresentation
  return Boolean(
    state
    && !state.disposed
    && !isMapLibreMapPreparingForDisposal(map)
    && (
      state.bootstrapApplied
      || (
        (
          presentation.phase === 'stopped'
          || state.deadlineFramePresented
        )
        && providerPresentation
        && presentation.phase === providerPresentation.phase
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
  options: Readonly<{
    committedStoppedFrameProof?: FlightGeoStoppedFrameProof
  }> = {},
): void {
  const state = ensureMapLibreFlightBootstrapState(map)
  const current = readFlightGeoOverlay()
  const stoppedPresentation = (
    presentation.phase === 'stopped'
    && presentation.readyFrameRequestId === null
    && presentation.runId === 0
    && presentation.tick === 0
  )
  const readyPresentation = (
    presentation.phase === 'ready'
    && presentation.tick === 0
    && presentation.runId > 0
  )
  if (
    !state
    || state.disposed
    || isMapLibreMapPreparingForDisposal(map)
    || (!stoppedPresentation && !readyPresentation)
    || !current.active
    || current.phase !== presentation.phase
    || current.profileId !== presentation.profileId
    || current.readyFrameRequestId !== presentation.readyFrameRequestId
    || current.revision !== presentation.revision
    || current.runId !== presentation.runId
    || current.tick !== presentation.tick
  ) return
  if (stoppedPresentation) {
    // A committed stopped frame starts a new run on this same map. Re-arm the
    // map-local one-shot alongside the global stopped publication.
    state.deadlineFramePresented = false
  }
  const previousPresentation = state.providerPresentation
  const frameAlreadyCommitted = Boolean(
    readyPresentation
    && previousPresentation?.phase === 'stopped'
    && previousPresentation.profileId === presentation.profileId
    && hasExactCommittedStoppedFrameProof(
      state,
      current,
      options.committedStoppedFrameProof,
    ),
  )
  state.providerPresentation = {
    phase: presentation.phase,
    profileId: presentation.profileId,
    readyFrameRequestId: presentation.readyFrameRequestId,
    revision: presentation.revision,
    runId: presentation.runId,
    tick: presentation.tick,
  }
  if (
    previousPresentation?.phase === presentation.phase
    && previousPresentation.profileId === presentation.profileId
    && previousPresentation.revision === presentation.revision
    && previousPresentation.runId === presentation.runId
  ) return
  // Provider loading is authorized by this map's exact visual overlay, not
  // by another surface's one-shot playable-frame deadline.
  state.queueProviderAdmission?.()
  if (!frameAlreadyCommitted) requestMapRepaint(state)
}

/**
 * Recover a bootstrap-required tick-zero presentation after provider style
 * ownership is no longer exact. This includes stopped preparation and a Ready
 * request whose deadline marker was already consumed; the latter repairs only
 * the visual map and never re-acknowledges the old request.
 */
export function requestMapLibreFlightPresentationBootstrap(
  map: any,
  presentation: FlightGeoOverlayPresentation,
): boolean {
  const state = ensureMapLibreFlightBootstrapState(map)
  const current = readFlightGeoOverlay()
  const stoppedPresentation = (
    presentation.phase === 'stopped'
    && presentation.readyFrameRequestId === null
    && presentation.runId === 0
    && presentation.tick === 0
  )
  const readyPresentation = (
    presentation.phase === 'ready'
    && presentation.runId > 0
    && presentation.tick === 0
  )
  if (
    !state
    || state.disposed
    || isMapLibreMapPreparingForDisposal(map)
    || !state.bootstrapStyle
    || (!stoppedPresentation && !readyPresentation)
    || !current.active
    || current.phase !== presentation.phase
    || current.profileId !== presentation.profileId
    || current.readyFrameRequestId !== presentation.readyFrameRequestId
    || current.revision !== presentation.revision
    || current.runId !== presentation.runId
    || current.tick !== presentation.tick
  ) return false
  if (state.bootstrapApplied) return true
  if (state.bootstrapPending) {
    settlePendingBootstrap(state, state.bootstrapGeneration)
    if (state.bootstrapApplied) return true
    if (hasExpectedMapLibreFlightBootstrapStyleIdentity(
      state.map,
      state.bootstrapExpectedStyle,
    )) return true
    // A provider style.load can overtake the local setStyle request. Its
    // identity must not leave this map permanently "pending", even while
    // unrelated provider/host sources keep global style.loaded() false:
    // reserve a new token below and reissue the exact bootstrap on this map.
  }
  try {
    const bootstrapStyle = state.bootstrapStyle
    beginMapLibreFlightBootstrap(map, bootstrapStyle)
    map.setStyle?.(bootstrapStyle, { diff: true })
    requestMapRepaint(state)
    return true
  } catch {
    clearPendingBootstrap(state)
    return false
  }
}

export function markMapLibreFlightReadyFramePresented(
  map: any,
  expectedRevision: string,
  expectedReadyFrameRequestId: number,
  options: Readonly<{
    committedStoppedFrameProof?: FlightGeoStoppedFrameProof
  }> = {},
): void {
  const state = ensureMapLibreFlightBootstrapState(map)
  const committedProviderFrame = Boolean(
    state
    && !state.bootstrapPending
    && hasCurrentProviderPresentation(state)
    && hasExactCommittedStoppedFrameProof(
      state,
      readFlightGeoOverlay(),
      options.committedStoppedFrameProof,
    ),
  )
  if (
    !state
    || state.disposed
    || isMapLibreMapPreparingForDisposal(map)
    || (!state.bootstrapApplied && !committedProviderFrame)
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
  hasLiveFlightStyleOwner: () => boolean
  loadProviderStyle: (
    signal: AbortSignal,
  ) => Promise<MapLibreFlightProviderStyle>
  map: any
  onError?: (error: unknown) => void
  scheduleProviderStyleApply?: MapLibreFlightProviderStyleApplyScheduler
  retainFlightOverlay: (
    previousStyle: Readonly<Record<string, any>> | undefined,
    nextStyle: Readonly<Record<string, any>>,
  ) => Record<string, any> | null
}>): void {
  const state = ensureMapLibreFlightBootstrapState(options.map)
  if (!state || state.disposed) return
  // A render-captured host override can briefly lag the source-owned Flight
  // publication. Only the canonical inactive overlay may release bootstrap
  // ownership and authorize a non-retaining provider-style restoration.
  if (!options.bootstrapStyle && options.hasLiveFlightStyleOwner()) return
  const resumeCurrentReconciliation = () => {
    if (
      state.disposed
      || isMapLibreMapPreparingForDisposal(state.map)
    ) return
    reconcileMapLibreFlightBootstrap(options)
  }
  const previousBootstrapStyle = state.bootstrapStyle
  if (options.bootstrapStyle) {
    state.bootstrapStyle = options.bootstrapStyle
    state.resumeReconciliation = resumeCurrentReconciliation
  }
  if (isMapLibreMapPreparingForDisposal(state.map)) {
    suspendMapLibreFlightBootstrapForDisposal(state.map)
    return
  }
  const generation = ++state.generation
  cancelMapLibreFlightProviderStyleLoad(state)
  cancelMapLibreFlightProviderStyleApply(state)
  removeRenderBinding(state)
  const scheduleProviderApply = (
    options.scheduleProviderStyleApply
    || scheduleMapLibreFlightProviderStyleApply
  )
  const finalizeProviderOwnership = () => {
    state.bootstrapStyle = null
    state.bootstrapApplied = false
    state.deadlineFramePresented = false
    state.providerPresentation = null
    clearPendingBootstrap(state)
    state.resumeReconciliation = resumeCurrentReconciliation
  }
  const promoteProvider = (
    retainOverlay: boolean,
    onApplied: () => void = () => {
      state.bootstrapApplied = false
      clearPendingBootstrap(state)
    },
  ) => (
    promoteMapLibreFlightProviderStyle({
      generation,
      hasExactFlightOverlay: () =>
        options.hasExactFlightOverlay(state.map),
      hasCurrentStyleOwnership: () => retainOverlay
        ? (
            options.hasLiveFlightStyleOwner()
            && hasCurrentProviderPresentation(state)
          )
        : !options.hasLiveFlightStyleOwner(),
      loadProviderStyle: options.loadProviderStyle,
      onApplied,
      onError: options.onError,
      retainFlightOverlay: options.retainFlightOverlay,
      retainOverlay,
      scheduleProviderApply,
      state,
    })
  )

  if (!options.bootstrapStyle) {
    const releaseResume = () => {
      if (
        state.disposed
        || isMapLibreMapPreparingForDisposal(state.map)
      ) return
      reconcileMapLibreFlightBootstrap({
        ...options,
        bootstrapStyle: options.hasLiveFlightStyleOwner()
          ? previousBootstrapStyle
          : null,
      })
    }
    state.resumeReconciliation = releaseResume
    const shouldRestoreProvider = Boolean(
      state.bootstrapStyle
      || state.bootstrapApplied
      || state.bootstrapPending
      || state.providerPresentation,
    )
    if (!shouldRestoreProvider) {
      finalizeProviderOwnership()
      return
    }
    void promoteProvider(false, finalizeProviderOwnership).then(result => {
      if (
        state.disposed
        || state.generation !== generation
        || result === 'applied'
      ) return
      if (
        result === 'identity-changed'
        || options.hasLiveFlightStyleOwner()
      ) {
        releaseResume()
      }
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
      if (!state.disposed && state.generation === generation) {
        options.onError?.(error)
      }
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
    void promoteProvider(true).then(result => {
      if (state.disposed || state.generation !== generation) return
      if (
        result === 'identity-changed'
        || result === 'admission-changed'
      ) {
        promotionStarted = false
        requestMapRepaint(state)
      }
    })
  }
  state.rearmProviderPromotion = () => {
    if (state.disposed || state.generation !== generation) return
    promotionStarted = false
    requestMapRepaint(state)
    state.queueProviderAdmission?.()
  }
  state.queueProviderAdmission = () => {
    if (state.disposed || state.generation !== generation) return
    queueMicrotask(promoteWhenPresented)
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

/**
 * Install a non-Flight fallback through the same map-local writer state used
 * by bootstrap/provider reconciliation. This prevents an older asynchronous
 * provider restore from overwriting a newer fallback after Flight exits.
 */
export function applyMapLibreNonFlightStyle(options: Readonly<{
  apply: () => void
  hasLiveFlightStyleOwner: () => boolean
  map: any
}>): boolean {
  const state = ensureMapLibreFlightBootstrapState(options.map)
  if (
    !state
    || state.disposed
    || isMapLibreMapPreparingForDisposal(state.map)
    || options.hasLiveFlightStyleOwner()
  ) return false
  const previousResumeReconciliation = state.resumeReconciliation
  const generation = ++state.generation
  cancelMapLibreFlightProviderStyleLoad(state)
  cancelMapLibreFlightProviderStyleApply(state)
  removeRenderBinding(state)
  state.bootstrapApplied = false
  state.deadlineFramePresented = false
  state.providerPresentation = null
  clearPendingBootstrap(state)
  const resumePreviousOwner = () => {
    if (
      state.disposed
      || state.generation !== generation
      || isMapLibreMapPreparingForDisposal(state.map)
    ) return
    const resume = state.resumeReconciliation
      || previousResumeReconciliation
    if (resume) queueMicrotask(resume)
  }
  try {
    options.apply()
  } catch (error) {
    resumePreviousOwner()
    throw error
  }
  if (
    state.disposed
    || state.generation !== generation
    || isMapLibreMapPreparingForDisposal(state.map)
  ) return false
  if (options.hasLiveFlightStyleOwner()) {
    resumePreviousOwner()
    return false
  }
  state.bootstrapStyle = null
  state.resumeReconciliation = null
  return true
}

export function disposeMapLibreFlightBootstrap(map: any): void {
  const state = ensureMapLibreFlightBootstrapState(map)
  if (!state) return
  state.disposed = true
  state.bootstrapStyle = null
  state.generation += 1
  state.resumeReconciliation = null
  clearPendingBootstrap(state)
  cancelMapLibreFlightProviderStyleLoad(state)
  cancelMapLibreFlightProviderStyleApply(state)
  removeRenderBinding(state)
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
  clearPendingBootstrap(state)
  cancelMapLibreFlightProviderStyleLoad(state)
  cancelMapLibreFlightProviderStyleApply(state)
  removeRenderBinding(state)
}

export function resumeMapLibreFlightBootstrapAfterDisposal(
  map: any,
): void {
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
