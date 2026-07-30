import {
  readFlightGeoOverlay,
  readFlightGeoOverlayReadyFramePresented,
  type FlightGeoOverlaySnapshot,
} from '../../flightGeoOverlay.js'
import {
  canMapLibreFlightOverlayPresent,
  markMapLibreFlightOverlayPresented,
  markMapLibreFlightReadyFramePresented,
} from './mapLibreFlightBootstrap.js'
import {
  recordFlightGeoStoppedPresentation,
  writeFlightGeoPresentationDebug,
} from './flightGeoPresentationDebug.js'
import {
  readFlightGeoOverlayPresentationCamera,
} from './flightGeoOverlayPresentationCamera.js'
import {
  createFlightGeoStoppedFrameProof,
  hasEquivalentStoppedFrameVisuals,
  type FlightGeoStoppedFrameProof,
} from './flightGeoStoppedFrameReuse.js'
import {
  defaultIsCanvasElement,
  FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT,
  FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT,
  mapHasExactFlightLayerState,
  mapHasExactFlightOverlay,
  type FlightOverlayPresentationGate,
  type FlightOverlayPresentationGateOptions,
} from './flightGeoOverlayPresentationContracts.js'
import {
  markFlightGeoSourceDataEventSettled,
  markFlightGeoSourceEventUnsettled,
  mapHasLoadedFlightGeoSources,
} from './flightGeoOverlaySourceSettlement.js'

export {
  isFlightGeoPresentationSourceDataEvent,
  mapHasLoadedFlightGeoSources,
} from './flightGeoOverlaySourceSettlement.js'

export function createFlightGeoOverlayPresentationGate(
  options: FlightOverlayPresentationGateOptions,
): FlightOverlayPresentationGate {
  const {
    active,
    map,
    onPresented,
    presented,
    readOverlay = readFlightGeoOverlay,
    readRoot,
    viewMode,
    isCanvasElement = defaultIsCanvasElement,
  } = options
  let pending: {
    attempts: number
    listener: () => void
    limit: number
    phase: FlightGeoOverlaySnapshot['phase']
    profileId: string
    repaintRequested: boolean
    readyFrameRequestId: number | null
    revision: string
    runId: number
    tick: number
  } | null = null
  let stoppedFrameProof: FlightGeoStoppedFrameProof | null = null
  const invalidateStoppedFrameProof = () => {
    stoppedFrameProof = null
  }

  const cancel = () => {
    if (!pending) return
    const listener = pending.listener
    pending = null
    try {
      map.off?.('render', listener)
    } catch {
      void 0
    }
  }

  const readCanvas = (): HTMLCanvasElement | null => {
    try {
      const canvas = map.getCanvas?.()
      return isCanvasElement(canvas) ? canvas : null
    } catch {
      return null
    }
  }

  const clearCanvas = () => {
    const canvas = readCanvas()
    if (!canvas) return
    delete canvas.dataset.kgFlightSimFirstFrame
    delete canvas.dataset.kgFlightSimFirstFrameSurface
  }

  const canvasIsVisible = (canvas: HTMLCanvasElement | null): boolean => {
    if (!canvas) return false
    try {
      const rect = canvas.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    } catch {
      return false
    }
  }

  const sameRequest = (
    current: FlightGeoOverlaySnapshot,
    requested: FlightGeoOverlaySnapshot,
  ): boolean => (
    active()
    && current.active
    && current.revision === requested.revision
    && current.phase === requested.phase
    && current.profileId === requested.profileId
    && current.readyFrameRequestId === requested.readyFrameRequestId
    && current.runId === requested.runId
    && current.tick === requested.tick
  )

  const currentMatchesPendingRequest = (
    current: FlightGeoOverlaySnapshot,
  ): boolean => Boolean(
    pending
    && active()
    && current.active
    && current.revision === pending.revision
    && current.phase === pending.phase
    && current.profileId === pending.profileId
    && current.readyFrameRequestId === pending.readyFrameRequestId
    && current.runId === pending.runId
    && current.tick === pending.tick,
  )

  const requestPendingRepaint = () => {
    if (!pending || pending.repaintRequested) return
    pending.repaintRequested = true
    try {
      map.triggerRepaint?.()
    } catch (error) {
      if (pending) pending.repaintRequested = false
      throw error
    }
  }

  const onFlightSourceLoading = (event: unknown) => {
    markFlightGeoSourceEventUnsettled(map, event)
  }

  const onFlightSourceError = (event: unknown) => {
    markFlightGeoSourceEventUnsettled(map, event)
  }

  const onFlightSourceData = (event: unknown) => {
    if (!markFlightGeoSourceDataEventSettled(map, event)) return
    if (!pending) return
    const current = readOverlay()
    if (!currentMatchesPendingRequest(current)) {
      cancel()
      return
    }
    // GeoJSON worker completion, not a paint loop, owns this retry. MapLibre's
    // source event is the first point at which both strict loaded() predicates
    // can be true; one repaint then validates the exact payload/layers/camera.
    if (!mapHasLoadedFlightGeoSources(map, current)) return
    try {
      requestPendingRepaint()
    } catch {
      void 0
    }
  }

  try {
    map.on?.('style.load', invalidateStoppedFrameProof)
    map.on?.('resize', invalidateStoppedFrameProof)
    map.on?.('sourcedataloading', onFlightSourceLoading)
    map.on?.('sourcedata', onFlightSourceData)
    map.on?.('error', onFlightSourceError)
  } catch {
    void 0
  }

  const canCommitVisuals = (
    current: FlightGeoOverlaySnapshot,
    camera: ReturnType<typeof readFlightGeoOverlayPresentationCamera>,
    canvas: HTMLCanvasElement | null,
  ): boolean => (
    mapHasLoadedFlightGeoSources(map, current)
    && mapHasExactFlightOverlay(map, current)
    && mapHasExactFlightLayerState(map, current, viewMode)
    && camera.exact
    && canvasIsVisible(canvas)
  )

  const canCommit = (
    current: FlightGeoOverlaySnapshot,
    camera: ReturnType<typeof readFlightGeoOverlayPresentationCamera>,
    canvas: HTMLCanvasElement | null,
  ): boolean => (
    canMapLibreFlightOverlayPresent(map, current)
    && canCommitVisuals(current, camera, canvas)
  )

  const commitPresentation = (
    current: FlightGeoOverlaySnapshot,
    camera: ReturnType<typeof readFlightGeoOverlayPresentationCamera>,
    canvas: HTMLCanvasElement,
    options: Readonly<{
      reusedCommittedStoppedFrame?: boolean
    }> = {},
  ) => {
    const readyTickZero = current.phase === 'ready' && current.tick === 0
    const committedStoppedFrameProof =
      options.reusedCommittedStoppedFrame === true
        ? stoppedFrameProof || undefined
        : undefined
    if (current.phase === 'stopped') {
      // This proof is deliberately captured only after MapLibre emitted the
      // stopped render event and every source/layer/camera predicate passed.
      stoppedFrameProof = createFlightGeoStoppedFrameProof(
        map,
        canvas,
        current,
        camera.signature,
        viewMode,
      )
    }
    // A consumed ready-frame request may revalidate the provider style. It
    // neither creates nor erases the one-shot proof already earned here.
    if (readyTickZero && current.readyFrameRequestId !== null) {
      canvas.dataset.kgFlightSimFirstFrameSurface = 'maplibre'
      canvas.dataset.kgFlightSimFirstFrame = '1'
    } else if (!readyTickZero) {
      delete canvas.dataset.kgFlightSimFirstFrame
      delete canvas.dataset.kgFlightSimFirstFrameSurface
    }
    const presentation = Object.freeze({
      phase: current.phase,
      profileId: current.profileId,
      readyFrameRequestId: current.readyFrameRequestId,
      revision: current.revision,
      runId: current.runId,
      tick: current.tick,
    })
    if (current.phase === 'stopped' || readyTickZero) {
      markMapLibreFlightOverlayPresented(map, presentation, {
        committedStoppedFrameProof,
      })
    }
    if (readyTickZero && current.readyFrameRequestId !== null) {
      markMapLibreFlightReadyFramePresented(
        map,
        current.revision,
        current.readyFrameRequestId,
        {
          committedStoppedFrameProof,
        },
      )
    }
    onPresented?.(presentation)
    const settledRoot = readRoot()
    if (settledRoot) {
      settledRoot.dataset.kgFlightGeospatialPresentedRevision = current.revision
      if (current.phase === 'stopped') {
        recordFlightGeoStoppedPresentation(
          settledRoot,
          current,
          camera.signature,
        )
      }
    }
    presented.current = {
      map,
      readyFrameRequestId: current.readyFrameRequestId,
      revision: current.revision,
    }
    if (readyTickZero) stoppedFrameProof = null
  }

  const resetPresented = () => {
    stoppedFrameProof = null
    if (presented.current.map === map) {
      presented.current = {
        map: null,
        readyFrameRequestId: null,
        revision: '',
      }
    }
  }

  const dispose = () => {
    cancel()
    stoppedFrameProof = null
    try {
      map.off?.('style.load', invalidateStoppedFrameProof)
      map.off?.('resize', invalidateStoppedFrameProof)
      map.off?.('sourcedataloading', onFlightSourceLoading)
      map.off?.('sourcedata', onFlightSourceData)
      map.off?.('error', onFlightSourceError)
    } catch {
      void 0
    }
  }

  const readReusableCommittedStoppedFrame = (
    overlay: FlightGeoOverlaySnapshot,
  ): Readonly<{
    camera: ReturnType<typeof readFlightGeoOverlayPresentationCamera>
    canvas: HTMLCanvasElement
    current: FlightGeoOverlaySnapshot
  }> | null => {
    const current = readOverlay()
    const camera = readFlightGeoOverlayPresentationCamera(map, current, viewMode)
    const canvas = readCanvas()
    if (
      canvas === null
      || current.phase !== 'ready'
      || current.tick !== 0
      || current.readyFrameRequestId === null
      || readFlightGeoOverlayReadyFramePresented()
      || !sameRequest(current, overlay)
      || !hasEquivalentStoppedFrameVisuals(
        stoppedFrameProof,
        map,
        canvas,
        current,
        camera.signature,
        viewMode,
      )
      || !canCommitVisuals(current, camera, canvas)
    ) return null
    return { camera, canvas, current }
  }

  const canReuseCommittedStoppedFrame = (
    overlay: FlightGeoOverlaySnapshot,
  ): boolean => readReusableCommittedStoppedFrame(overlay) !== null

  const request = (overlay: FlightGeoOverlaySnapshot) => {
    // Provider-style promotion can remount the same ready tick after its
    // one-shot deadline request was consumed. It still needs visual
    // acknowledgement, but must not recreate first-frame proof below.
    const presentable = overlay.phase === 'stopped'
      || (
        overlay.phase === 'ready'
        && overlay.tick === 0
        && overlay.runId > 0
      )
    if (!presentable || typeof map.on !== 'function') return
    // Stopped presentation is intentionally repeatable: an idempotent surface
    // open can create a fresh preparation request without changing simulation
    // state or the projection revision.
    if (
      overlay.phase !== 'stopped'
      && presented.current.map === map
      && presented.current.revision === overlay.revision
      && presented.current.readyFrameRequestId
        === overlay.readyFrameRequestId
    ) return
    if (
      pending?.revision === overlay.revision
      && pending.readyFrameRequestId === overlay.readyFrameRequestId
    ) return
    cancel()

    const reusableStoppedFrame =
      readReusableCommittedStoppedFrame(overlay)
    if (reusableStoppedFrame) {
      // No source write, camera transform, render listener, or repaint is
      // needed: the exact stopped painter frame already committed these pixels.
      commitPresentation(
        reusableStoppedFrame.current,
        reusableStoppedFrame.camera,
        reusableStoppedFrame.canvas,
        { reusedCommittedStoppedFrame: true },
      )
      return
    }

    const listener = () => {
      if (pending?.listener !== listener) return
      pending.repaintRequested = false
      const current = readOverlay()
      if (!sameRequest(current, overlay)) {
        cancel()
        return
      }
      const root = readRoot()
      const camera = readFlightGeoOverlayPresentationCamera(
        map,
        current,
        viewMode,
      )
      if (root) {
        writeFlightGeoPresentationDebug(
          root,
          current,
          pending.attempts,
          camera.signature,
        )
      }
      const canvas = readCanvas()
      if (!canCommit(current, camera, canvas)) {
        if (!pending) return
        // setData() can update serialized GeoJSON before the worker has
        // completed. Do not monopolize a slow painter with speculative frames;
        // the owned sourcedata listener will re-arm exactly once loaded().
        if (!mapHasLoadedFlightGeoSources(map, current)) return
        pending.attempts += 1
        if (root) {
          writeFlightGeoPresentationDebug(
            root,
            current,
            pending.attempts,
            camera.signature,
          )
        }
        if (pending.attempts >= pending.limit) {
          cancel()
          return
        }
        try {
          requestPendingRepaint()
        } catch {
          void 0
        }
        return
      }

      cancel()
      if (canvas) commitPresentation(current, camera, canvas)
    }

    pending = {
      attempts: 0,
      listener,
      // A ready overlay which has already earned its first frame is being
      // re-presented after a provider style swap. Its GeoJSON worker update
      // can settle after the one-shot 100 ms first-frame retry budget, so keep
      // that gate alive rather than stranding the provider on bootstrap.
      limit: (
        overlay.phase === 'ready'
        && overlay.tick === 0
        && overlay.readyFrameRequestId !== null
        && !readFlightGeoOverlayReadyFramePresented()
      )
        ? FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT
        : FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT,
      phase: overlay.phase,
      profileId: overlay.profileId,
      repaintRequested: false,
      readyFrameRequestId: overlay.readyFrameRequestId,
      revision: overlay.revision,
      runId: overlay.runId,
      tick: overlay.tick,
    }
    const root = readRoot()
    if (root) {
      writeFlightGeoPresentationDebug(
        root,
        overlay,
        pending.attempts,
        readFlightGeoOverlayPresentationCamera(map, overlay, viewMode).signature,
      )
    }
    try {
      map.on('render', listener)
      if (mapHasLoadedFlightGeoSources(map, overlay)) {
        requestPendingRepaint()
      }
    } catch {
      cancel()
    }
  }

  return Object.freeze({
    cancel,
    canReuseCommittedStoppedFrame,
    clearCanvas,
    dispose,
    request,
    resetPresented,
  })
}
