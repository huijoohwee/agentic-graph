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
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
  fitMapToFlightGeoOverlay,
} from '../../flightGeoOverlayMapLibre.js'
import {
  flightGeoMapViewportPaddingKey,
  readFlightGeoMapViewportPadding,
  type FlightGeoMapViewportPadding,
} from '../../flightGeoMapViewport.js'
import {
  applyFlightGeoEnvironmentToMap,
  clearFlightGeoEnvironmentFromMap,
  mapHasExactFlightGeoEnvironment,
} from '../../flightGeoEnvironmentMapLibre.js'
import { readGeoJsonSourceData } from '../../maplibreLayers.js'
import {
  canMapLibreFlightOverlayPresent,
  markMapLibreFlightOverlayPresented,
  markMapLibreFlightReadyFramePresented,
} from './mapLibreFlightBootstrap.js'

export const FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT = 8
export const FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT = 180

type PresentedFlightOverlay = {
  map: any | null
  readyFrameRequestId: number | null
  revision: string
}

type SavedMapPadding = Readonly<{
  map: any | null
  padding: FlightGeoMapViewportPadding | null
}>

type FlightOverlayFeature = Readonly<{
  properties?: Readonly<{
    kgFlightOverlayKind?: unknown
    kgFlightOverlayRevision?: unknown
  }>
}>

type FlightOverlayPresentationGateOptions = Readonly<{
  active: () => boolean
  map: any
  onPresented?: (presentation: FlightGeoOverlayPresentation) => void
  presented: { current: PresentedFlightOverlay }
  readOverlay?: () => FlightGeoOverlaySnapshot
  readRoot: () => HTMLElement | null
  isCanvasElement?: (value: unknown) => value is HTMLCanvasElement
}>

export type FlightOverlayPresentationGate = Readonly<{
  cancel: () => void
  clearCanvas: () => void
  request: (overlay: FlightGeoOverlaySnapshot) => void
  resetPresented: () => void
}>

function defaultIsCanvasElement(value: unknown): value is HTMLCanvasElement {
  return (
    typeof HTMLCanvasElement !== 'undefined'
    && value instanceof HTMLCanvasElement
  )
}

function readSavedMapPadding(map: any): FlightGeoMapViewportPadding | null {
  const padding = map?.getPadding?.()
  if (!padding || typeof padding !== 'object') return null
  const bottom = Number(padding.bottom)
  const left = Number(padding.left)
  const right = Number(padding.right)
  const top = Number(padding.top)
  if (![bottom, left, right, top].every(Number.isFinite)) return null
  return Object.freeze({ bottom, left, right, top })
}

function mapHasExactFlightOverlay(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
): boolean {
  try {
    const source = map.getSource?.(FLIGHT_GEO_OVERLAY_SOURCE_ID)
    const sourceData = readGeoJsonSourceData(source)
    const features = (
      sourceData?.features || []
    ) as readonly FlightOverlayFeature[]
    const exactRevision = features.every(
      feature => (
        feature?.properties?.kgFlightOverlayRevision === overlay.revision
      ),
    )
    const kindCount = (kind: string) => features.filter(
      feature => feature?.properties?.kgFlightOverlayKind === kind,
    ).length
    const objectiveGuideCount = overlay.objective ? 1 : 0
    return features.length === overlay.route.length + 2 + objectiveGuideCount
      && exactRevision
      && kindCount('route') === 1
      && kindCount('objective-guide') === objectiveGuideCount
      && kindCount('route-point') === overlay.route.length
      && kindCount('aircraft') === 1
      && Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS)
        .every(layerId => Boolean(map.getLayer?.(layerId)))
      && mapHasExactFlightGeoEnvironment(map, overlay)
  } catch {
    return false
  }
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
    isCanvasElement = defaultIsCanvasElement,
  } = options
  let pending: {
    attempts: number
    listener: () => void
    limit: number
    readyFrameRequestId: number | null
    revision: string
  } | null = null

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

  const resetPresented = () => {
    if (presented.current.map === map) {
      presented.current = {
        map: null,
        readyFrameRequestId: null,
        revision: '',
      }
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

    const listener = () => {
      if (pending?.listener !== listener) return
      const current = readOverlay()
      const exact = (
        active()
        && current.active
        && current.revision === overlay.revision
        && current.phase === overlay.phase
        && current.profileId === overlay.profileId
        && current.readyFrameRequestId === overlay.readyFrameRequestId
        && current.runId === overlay.runId
        && current.tick === overlay.tick
      )
      if (!exact) {
        cancel()
        return
      }
      const canvas = readCanvas()
      let canvasVisible = false
      if (canvas) {
        try {
          const rect = canvas.getBoundingClientRect()
          canvasVisible = rect.width > 0 && rect.height > 0
        } catch {
          canvasVisible = false
        }
      }
      if (
        !canMapLibreFlightOverlayPresent(map, current)
        || !mapHasExactFlightOverlay(map, current)
        || !canvas
        || !canvasVisible
      ) {
        if (!pending) return
        pending.attempts += 1
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
      const readyTickZero = (
        current.phase === 'ready'
        && current.tick === 0
      )
      // A consumed ready-frame request may revalidate the provider style.
      // It neither creates nor erases the one-shot proof already earned by
      // this same map canvas.
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
      if (
        readyTickZero
        && current.readyFrameRequestId !== null
      ) {
        markMapLibreFlightReadyFramePresented(
          map,
          current.revision,
          current.readyFrameRequestId,
        )
      }
      onPresented?.(presentation)
      const root = readRoot()
      if (root) {
        root.dataset.kgFlightGeospatialPresentedRevision = current.revision
      }
      presented.current = {
        map,
        readyFrameRequestId: current.readyFrameRequestId,
        revision: current.revision,
      }
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
      padding: readSavedMapPadding(map),
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
        delete root.dataset.kgFlightGeospatialPresentedRevision
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
      delete root.dataset.kgFlightGeospatialPresentedRevision
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
          delete root.dataset.kgFlightGeospatialPresentedRevision
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
      // An existing provider map remains mounted while React commits Flight's
      // bootstrap style. Do not write or acknowledge the stopped frame on that
      // old style: its sources would be discarded by the imminent handoff.
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
          if (overlay.phase === 'stopped') return false
          captureMapPadding(map)
          return applyFlightGeoOverlayCameraToMap(
            map,
            overlay,
            options.viewMode,
            cameraPadding,
          )
        })()
      // A stopped mission deliberately retains its padded union fit instead
      // of issuing a fixed-follow jump. It still has to acknowledge the
      // rendered MapLibre frame so source-authored stage preparation can
      // complete before Flight becomes playable.
      if (cameraApplied || overlay.phase === 'stopped') gate.request(overlay)
    }
    const scheduleFinalApply = () => {
      if (typeof window === 'undefined') return
      if (pendingCameraFrame) window.cancelAnimationFrame(pendingCameraFrame)
      pendingCameraFrame = window.requestAnimationFrame(() => {
        pendingCameraFrame = 0
        apply()
      })
    }
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
      map?.off?.('style.load', scheduleFinalApply)
      map?.off?.('load', scheduleFinalApply)
      map?.off?.('resize', scheduleFinalApply)
      panelResizeObserver?.disconnect()
      gate?.cancel()
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
