import React from 'react'
import {
  readFlightGeoOverlay,
  readFlightGeoOverlayReadyFramePresented,
  subscribeFlightGeoOverlay,
  type FlightGeoOverlayPresentation,
  type FlightGeoOverlaySnapshot,
} from '../../flightGeoOverlay.js'
import {
  applyFlightGeoOverlayCameraToMap,
  applyFlightGeoOverlayToMap,
  clearFlightGeoOverlayFromMap,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
  fitMapToFlightGeoOverlay,
  mapHasExactFlightGeoOverlay,
} from '../../flightGeoOverlayMapLibre.js'
import {
  flightGeoMapViewportPaddingKey,
  readFlightGeoMapViewportPadding,
  type FlightGeoMapViewportPadding,
} from '../../flightGeoMapViewport.js'
import {
  applyFlightGeoEnvironmentToMap,
  clearFlightGeoEnvironmentFromMap,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  mapHasExactFlightGeoEnvironment,
} from '../../flightGeoEnvironmentMapLibre.js'
import {
  canMapLibreFlightOverlayPresent,
  markMapLibreFlightOverlayPresented,
  markMapLibreFlightReadyFramePresented,
  subscribeMapLibreFlightBootstrapSettled,
} from './mapLibreFlightBootstrap.js'
import {
  clearFlightGeoPresentationDebug,
  recordFlightGeoStoppedPresentation,
  writeFlightGeoPresentationDebug,
} from './flightGeoPresentationDebug.js'
import {
  readFlightGeoOverlayPresentationCamera,
  readSavedFlightGeoMapPadding,
} from './flightGeoOverlayPresentationCamera.js'
import {
  createFlightGeoStoppedFrameProof,
  hasEquivalentStoppedFrameVisuals,
  type FlightGeoStoppedFrameProof,
} from './flightGeoStoppedFrameReuse.js'

export const FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT = 8
export const FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT = 180

type PresentedFlightOverlay = { map: any | null; readyFrameRequestId: number | null; revision: string }

type SavedMapPadding = Readonly<{ map: any | null; padding: FlightGeoMapViewportPadding | null }>

type FlightOverlayPresentationGateOptions = Readonly<{
  active: () => boolean
  map: any
  onPresented?: (presentation: FlightGeoOverlayPresentation) => void
  presented: { current: PresentedFlightOverlay }
  readOverlay?: () => FlightGeoOverlaySnapshot
  readRoot: () => HTMLElement | null
  viewMode: string
  isCanvasElement?: (value: unknown) => value is HTMLCanvasElement
}>

export type FlightOverlayPresentationGate = Readonly<{
  cancel: () => void
  clearCanvas: () => void
  dispose: () => void
  request: (overlay: FlightGeoOverlaySnapshot) => void
  resetPresented: () => void
}>

function defaultIsCanvasElement(value: unknown): value is HTMLCanvasElement {
  return (
    typeof HTMLCanvasElement !== 'undefined'
    && value instanceof HTMLCanvasElement
  )
}

function mapHasExactFlightOverlay(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
): boolean {
  return mapHasExactFlightGeoOverlay(map, overlay)
    && mapHasExactFlightGeoEnvironment(map, overlay)
}

function mapHasExactFlightLayerState(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
  viewMode: string,
): boolean {
  if (typeof map?.getLayoutProperty !== 'function') return false
  const overlayLayers = FLIGHT_GEO_OVERLAY_LAYER_ORDER
  const styleLayers = map.getStyle?.()?.layers
  if (!Array.isArray(styleLayers)) return false
  const topLayerIds = styleLayers
    .slice(-overlayLayers.length)
    .map((layer: { id?: unknown }) => String(layer?.id || ''))
  if (!overlayLayers.every((layerId, index) => topLayerIds[index] === layerId)) {
    return false
  }
  const visible = (layerId: string, expected: 'none' | 'visible') => {
    if (!map.getLayer?.(layerId)) return false
    const current = map.getLayoutProperty(layerId, 'visibility')
    return expected === 'visible'
      ? current === undefined || current === null || current === 'visible'
      : current === 'none'
  }
  if (!overlayLayers.every(layerId => visible(layerId, 'visible'))) return false
  if (!overlay.environment) return true
  const mode3d = viewMode === '3d' || viewMode === '3d-modern'
  return visible(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d, mode3d ? 'none' : 'visible')
    && visible(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d, mode3d ? 'visible' : 'none')
    && visible(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline, 'visible')
}

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
    readyFrameRequestId: number | null
    revision: string
  } | null = null
  let stoppedFrameProof: FlightGeoStoppedFrameProof | null = null
  const invalidateStoppedFrameProof = () => {
    stoppedFrameProof = null
  }
  try {
    map.on?.('style.load', invalidateStoppedFrameProof)
  } catch {
    void 0
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

  const canCommit = (
    current: FlightGeoOverlaySnapshot,
    camera: ReturnType<typeof readFlightGeoOverlayPresentationCamera>,
    canvas: HTMLCanvasElement | null,
  ): boolean => (
    canMapLibreFlightOverlayPresent(map, current)
    && mapHasExactFlightOverlay(map, current)
    && mapHasExactFlightLayerState(map, current, viewMode)
    && camera.exact
    && canvasIsVisible(canvas)
  )

  const commitPresentation = (
    current: FlightGeoOverlaySnapshot,
    camera: ReturnType<typeof readFlightGeoOverlayPresentationCamera>,
    canvas: HTMLCanvasElement,
  ) => {
    const readyTickZero = current.phase === 'ready' && current.tick === 0
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
    if (readyTickZero) {
      markMapLibreFlightOverlayPresented(map, presentation)
    }
    if (readyTickZero && current.readyFrameRequestId !== null) {
      markMapLibreFlightReadyFramePresented(
        map,
        current.revision,
        current.readyFrameRequestId,
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
    } catch {
      void 0
    }
  }

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

    const current = readOverlay()
    const camera = readFlightGeoOverlayPresentationCamera(map, current, viewMode)
    const canvas = readCanvas()
    const canReuseStoppedFrame = (
      canvas !== null
      && current.phase === 'ready'
      && current.tick === 0
      && current.readyFrameRequestId !== null
      && !readFlightGeoOverlayReadyFramePresented()
      && sameRequest(current, overlay)
      && hasEquivalentStoppedFrameVisuals(
        stoppedFrameProof,
        map,
        canvas,
        current,
        camera.signature,
        viewMode,
      )
      && canCommit(current, camera, canvas)
    )
    if (canReuseStoppedFrame && canvas) {
      // No source write, camera transform, render listener, or repaint is
      // needed: the exact stopped painter frame already committed these pixels.
      commitPresentation(current, camera, canvas)
      return
    }

    const listener = () => {
      if (pending?.listener !== listener) return
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
          map.triggerRepaint?.()
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
      readyFrameRequestId: overlay.readyFrameRequestId,
      revision: overlay.revision,
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
      map.triggerRepaint?.()
    } catch {
      cancel()
    }
  }

  return Object.freeze({
    cancel,
    clearCanvas,
    dispose,
    request,
    resetPresented,
  })
}

export function useFlightGeoOverlayMapLibrePresentation(options: Readonly<{
  active: boolean
  enhancedLayerBounds: unknown
  graphRevision: number
  map: any | null
  mapLibreRuntimeEnabled: boolean
  onPresented?: (presentation: FlightGeoOverlayPresentation) => void
  rootRef: React.RefObject<HTMLElement | null>
  styleRevision: number
  viewMode: string
}>): void {
  const fitRef = React.useRef<{ key: string; map: any | null }>({
    key: '',
    map: null,
  })
  const presentedRef = React.useRef<PresentedFlightOverlay>({
    map: null,
    readyFrameRequestId: null,
    revision: '',
  })
  const savedMapPaddingRef = React.useRef<SavedMapPadding>({
    map: null,
    padding: null,
  })

  const restoreMapPadding = React.useCallback((map: any | null) => {
    if (savedMapPaddingRef.current.map !== map) return
    const padding = savedMapPaddingRef.current.padding
    if (padding) map?.setPadding?.(padding)
    savedMapPaddingRef.current = { map: null, padding: null }
  }, [])

  const captureMapPadding = React.useCallback((map: any) => {
    if (savedMapPaddingRef.current.map === map) return
    savedMapPaddingRef.current = {
      map,
      padding: readSavedFlightGeoMapPadding(map),
    }
  }, [])

  React.useEffect(() => {
    const map = options.map
    return () => {
      try {
        const canvas = map?.getCanvas?.()
        if (
          typeof HTMLCanvasElement !== 'undefined'
          && canvas instanceof HTMLCanvasElement
        ) {
          delete canvas.dataset.kgFlightSimFirstFrame
          delete canvas.dataset.kgFlightSimFirstFrameSurface
        }
      } catch {
        void 0
      }
      const root = options.rootRef.current
      if (root) {
        delete root.dataset.kgFlightGeospatialEnvironment
        delete root.dataset.kgFlightGeospatialCameraPadding
        clearFlightGeoPresentationDebug(root)
      }
      restoreMapPadding(map)
      if (presentedRef.current.map === map) {
        presentedRef.current = {
          map: null,
          readyFrameRequestId: null,
          revision: '',
        }
      }
    }
  }, [
    options.map,
    options.rootRef,
    restoreMapPadding,
  ])

  React.useEffect(() => {
    const map = options.map
    const root = options.rootRef.current
    if (root) {
      delete root.dataset.kgFlightGeospatialEnvironment
      delete root.dataset.kgFlightGeospatialCameraPadding
      clearFlightGeoPresentationDebug(root)
    }
    restoreMapPadding(map)
    if (presentedRef.current.map === map) {
      presentedRef.current = {
        map: null,
        readyFrameRequestId: null,
        revision: '',
      }
    }
  }, [
    options.map,
    options.rootRef,
    restoreMapPadding,
    options.styleRevision,
    options.viewMode,
  ])

  React.useEffect(() => {
    const map = options.map
    let pendingCameraFrame = 0
    const gate = map
      ? createFlightGeoOverlayPresentationGate({
          active: () => options.active,
          map,
          onPresented: options.onPresented,
          presented: presentedRef,
          readRoot: () => options.rootRef.current,
          viewMode: options.viewMode,
        })
      : null
    const apply = () => {
      const overlay = readFlightGeoOverlay()
      const visible = options.active && overlay.active
      const root = options.rootRef.current
      if (root) {
        if (visible) {
          root.dataset.kgFlightGeospatialOverlay = 'active'
          root.dataset.kgFlightGeospatialRevision = overlay.revision
          if (overlay.environment) {
            root.dataset.kgFlightGeospatialEnvironment =
              overlay.environment.id
          }
        } else {
          delete root.dataset.kgFlightGeospatialOverlay
          delete root.dataset.kgFlightGeospatialRevision
          delete root.dataset.kgFlightGeospatialEnvironment
          delete root.dataset.kgFlightGeospatialCameraPadding
          clearFlightGeoPresentationDebug(root)
        }
      }
      if (!map || !options.mapLibreRuntimeEnabled || !gate) {
        gate?.cancel()
        gate?.clearCanvas()
        return
      }
      if (!visible) {
        gate.cancel()
        gate.clearCanvas()
        gate.resetPresented()
        fitRef.current = { key: '', map: null }
        restoreMapPadding(map)
        clearFlightGeoOverlayFromMap(map)
        clearFlightGeoEnvironmentFromMap(map)
        return
      }
      // A retained provider map stays mounted while Flight installs its local
      // bootstrap style. Only the settled bootstrap may receive the stopped
      // preparation payload; `style.load` replays this apply after handoff.
      const requiresBootstrapPresentation = (
        overlay.phase === 'stopped'
        || (overlay.phase === 'ready' && overlay.tick === 0)
      )
      if (
        requiresBootstrapPresentation
        && !canMapLibreFlightOverlayPresent(map, overlay)
      ) {
        gate.cancel()
        gate.clearCanvas()
        return
      }
      if (overlay.phase === 'stopped') gate.clearCanvas()
      const environmentApplied = applyFlightGeoEnvironmentToMap(
        map,
        overlay,
        options.viewMode,
      )
      const applied = environmentApplied
        && applyFlightGeoOverlayToMap(map, overlay)
      const cameraPadding = readFlightGeoMapViewportPadding(map)
      if (root) {
        root.dataset.kgFlightGeospatialCameraPadding =
          flightGeoMapViewportPaddingKey(cameraPadding)
      }
      const fitKey = [
        options.styleRevision,
        options.viewMode,
        overlay.profileId,
        overlay.environment?.revision || 'no-environment',
        flightGeoMapViewportPaddingKey(cameraPadding),
      ].join(':')
      if (
        applied
        && (
          fitRef.current.map !== map
          || fitRef.current.key !== fitKey
        )
        && fitMapToFlightGeoOverlay(map, overlay, cameraPadding)
      ) {
        fitRef.current = { key: fitKey, map }
      }
      if (!applied) return
      const cameraApplied = overlay.camera.effectiveOwner === 'free-orbit'
        || (() => {
          captureMapPadding(map)
          return applyFlightGeoOverlayCameraToMap(
            map,
            overlay,
            options.viewMode,
            cameraPadding,
            { stageStopped: overlay.phase === 'stopped' },
          )
        })()
      // Stopped preparation first fits the full local environment, then stages
      // the deterministic tick-zero follow camera and waits for that painter
      // frame. Ready can therefore re-arm its request without another camera
      // transform or GeoJSON worker update.
      if (cameraApplied) gate.request(overlay)
    }
    const scheduleFinalApply = () => {
      if (typeof window === 'undefined') return
      if (pendingCameraFrame) window.cancelAnimationFrame(pendingCameraFrame)
      pendingCameraFrame = window.requestAnimationFrame(() => {
        pendingCameraFrame = 0
        apply()
      })
    }
    const unsubscribeBootstrapSettled = map
      ? subscribeMapLibreFlightBootstrapSettled(map, () => {
          apply()
          scheduleFinalApply()
        })
      : () => void 0
    apply()
    scheduleFinalApply()
    const unsubscribe = subscribeFlightGeoOverlay(apply)
    map?.on?.('style.load', scheduleFinalApply)
    map?.on?.('load', scheduleFinalApply)
    map?.on?.('resize', scheduleFinalApply)
    const root = options.rootRef.current
    const panelResizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleFinalApply)
    const observedRoot = root || map?.getContainer?.()
    if (observedRoot) panelResizeObserver?.observe(observedRoot)
    for (const panel of Array.from(document.querySelectorAll(
      '[aria-label="Markdown Workspace"], [aria-label="Floating panel"], [aria-label="Geospatial panel"]',
    ))) {
      panelResizeObserver?.observe(panel)
    }
    return () => {
      unsubscribe()
      unsubscribeBootstrapSettled()
      map?.off?.('style.load', scheduleFinalApply)
      map?.off?.('load', scheduleFinalApply)
      map?.off?.('resize', scheduleFinalApply)
      panelResizeObserver?.disconnect()
      gate?.dispose()
      if (pendingCameraFrame && typeof window !== 'undefined') {
        window.cancelAnimationFrame(pendingCameraFrame)
      }
    }
  }, [
    options.active,
    options.enhancedLayerBounds,
    options.graphRevision,
    options.map,
    options.mapLibreRuntimeEnabled,
    options.onPresented,
    options.rootRef,
    captureMapPadding,
    restoreMapPadding,
    options.styleRevision,
    options.viewMode,
  ])
}
