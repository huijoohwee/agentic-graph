import React from 'react'
import {
  readFlightGeoOverlay,
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
import { readGeoJsonSourceData } from '../../maplibreLayers.js'

export const FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT = 8
export const FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT = 180

type PresentedFlightOverlay = {
  map: any | null
  readyFrameRequestId: number | null
  revision: string
}

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
    return features.length === overlay.route.length + 2
      && exactRevision
      && kindCount('route') === 1
      && kindCount('route-point') === overlay.route.length
      && kindCount('aircraft') === 1
      && Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS)
        .every(layerId => Boolean(map.getLayer?.(layerId)))
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
    const presentable = overlay.phase === 'stopped'
      || (
        overlay.phase === 'ready'
        && overlay.tick === 0
        && overlay.runId > 0
        && overlay.readyFrameRequestId !== null
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
      if (!mapHasExactFlightOverlay(map, current) || !canvas || !canvasVisible) {
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
      if (current.phase === 'ready' && current.tick === 0) {
        canvas.dataset.kgFlightSimFirstFrameSurface = 'maplibre'
        canvas.dataset.kgFlightSimFirstFrame = '1'
      } else {
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
      limit: overlay.phase === 'stopped'
        ? FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT
        : FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT,
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
        } else {
          delete root.dataset.kgFlightGeospatialOverlay
          delete root.dataset.kgFlightGeospatialRevision
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
        clearFlightGeoOverlayFromMap(map)
        return
      }
      if (overlay.phase === 'stopped') gate.clearCanvas()
      const applied = applyFlightGeoOverlayToMap(map, overlay)
      const fitKey = [
        options.styleRevision,
        options.viewMode,
        overlay.profileId,
      ].join(':')
      if (
        applied
        && (
          fitRef.current.map !== map
          || fitRef.current.key !== fitKey
        )
        && fitMapToFlightGeoOverlay(map, overlay)
      ) {
        fitRef.current = { key: fitKey, map }
      }
      if (!applied) return
      const cameraApplied = overlay.camera.effectiveOwner === 'free-orbit'
        || applyFlightGeoOverlayCameraToMap(map, overlay)
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
    apply()
    scheduleFinalApply()
    const unsubscribe = subscribeFlightGeoOverlay(apply)
    map?.on?.('load', scheduleFinalApply)
    return () => {
      unsubscribe()
      map?.off?.('load', scheduleFinalApply)
      gate?.cancel()
      gate?.clearCanvas()
      const root = options.rootRef.current
      if (root) delete root.dataset.kgFlightGeospatialPresentedRevision
      gate?.resetPresented()
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
    options.styleRevision,
    options.viewMode,
  ])
}
