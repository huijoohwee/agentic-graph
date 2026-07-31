import React from 'react'
import {
  readFlightGeoOverlay,
  subscribeFlightGeoOverlay,
  type FlightGeoOverlayPresentation,
  type FlightGeoOverlayPresentationOwner,
  type FlightGeoOverlaySnapshot,
} from '../../flightGeoOverlay.js'
import {
  applyFlightGeoOverlayCameraToMap,
  applyFlightGeoOverlayToMap,
  clearFlightGeoOverlayFromMap,
  fitMapToFlightGeoOverlay,
} from '../../flightGeoOverlayMapLibre.js'
import {
  geoMapViewportPaddingKey,
  observeGeoMapOcclusionChanges,
  readGeoMapViewportPadding,
} from '../../geoMapViewport.js'
import {
  applyFlightGeoEnvironmentToMap,
  clearFlightGeoEnvironmentFromMap,
  removeFlightGeoEnvironmentFromMap,
} from '../../flightGeoEnvironmentMapLibre.js'
import {
  canMapLibreFlightOverlayPresent,
  requestMapLibreFlightPresentationBootstrap,
  subscribeMapLibreFlightBootstrapSettled,
} from './mapLibreFlightBootstrap.js'
import {
  clearFlightGeoPresentationAttemptDebug,
  clearFlightGeoPresentationDebug,
} from './flightGeoPresentationDebug.js'
import {
  readSavedFlightGeoMapPadding,
} from './flightGeoOverlayPresentationCamera.js'
import {
  createFlightGeoOverlayPresentationGate,
} from './flightGeoOverlayPresentationGate.js'
import {
  isMapLibreMapPreparingForDisposal,
  subscribeMapLibreMapDisposalPreparation,
} from './mapLibreHostLease.js'
import {
  type FlightOverlayPresentationGate,
  type PresentedFlightOverlay,
  type SavedMapPadding,
} from './flightGeoOverlayPresentationContracts.js'
export {
  createFlightGeoOverlayPresentationGate,
} from './flightGeoOverlayPresentationGate.js'
export {
  FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT,
  FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT,
  type FlightOverlayPresentationGate,
} from './flightGeoOverlayPresentationContracts.js'

export function deferFlightGeoPresentationForBootstrapRecovery(
  map: any,
  overlay: FlightGeoOverlayPresentation,
  canReuseCommittedStoppedFrame: boolean,
): boolean {
  const requiresBootstrapPresentation = (
    overlay.phase === 'stopped'
    || (overlay.phase === 'ready' && overlay.tick === 0)
  )
  if (
    !requiresBootstrapPresentation
    || canMapLibreFlightOverlayPresent(map, overlay)
    || canReuseCommittedStoppedFrame
  ) return false
  requestMapLibreFlightPresentationBootstrap(map, overlay)
  return true
}

export function applyCityGeoXrAerialOverlayToMap(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
): boolean {
  if (
    overlay.presentationOwner !== 'city'
    || overlay.environment !== null
    || !removeFlightGeoEnvironmentFromMap(map)
  ) return false
  return applyFlightGeoOverlayToMap(map, overlay)
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
  const presentationOwnerRef = React.useRef<{
    map: any | null
    owner: FlightGeoOverlayPresentationOwner
  }>({ map: null, owner: null })

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
      presentationOwnerRef.current = { map: null, owner: null }
      fitRef.current = { key: '', map: null }
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
      clearFlightGeoPresentationAttemptDebug(root)
    }
    restoreMapPadding(map)
    presentationOwnerRef.current = { map: null, owner: null }
    fitRef.current = { key: '', map: null }
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
    let gate: FlightOverlayPresentationGate | null = null
    const disposeGate = () => {
      gate?.cancel()
      gate?.clearCanvas()
      gate?.resetPresented()
      gate?.dispose()
      gate = null
    }
    const ensureGate = (): FlightOverlayPresentationGate | null => {
      if (!map) return null
      if (!gate) {
        gate = createFlightGeoOverlayPresentationGate({
          active: () => options.active,
          map,
          onPresented: options.onPresented,
          presented: presentedRef,
          readRoot: () => options.rootRef.current,
          viewMode: options.viewMode,
        })
      }
      return gate
    }
    const transitionPresentationOwner = (
      owner: FlightGeoOverlayPresentationOwner,
    ) => {
      const previous = presentationOwnerRef.current
      if (previous.map === map && previous.owner === owner) return
      restoreMapPadding(previous.map)
      presentationOwnerRef.current = { map, owner }
      fitRef.current = { key: '', map: null }
      presentedRef.current = {
        map: null,
        readyFrameRequestId: null,
        revision: '',
      }
      if (map && owner === 'flight') captureMapPadding(map)
    }
    const apply = () => {
      const overlay = readFlightGeoOverlay()
      const presentationOwner = overlay.active
        ? overlay.presentationOwner
        : null
      const visible = options.active && presentationOwner !== null
      const root = options.rootRef.current
      if (root) {
        if (visible) {
          root.dataset.kgFlightGeospatialOverlay = 'active'
          root.dataset.kgFlightGeospatialRevision = overlay.revision
          if (overlay.environment) {
            root.dataset.kgFlightGeospatialEnvironment =
              overlay.environment.id
          } else {
            delete root.dataset.kgFlightGeospatialEnvironment
          }
        } else {
          delete root.dataset.kgFlightGeospatialOverlay
          delete root.dataset.kgFlightGeospatialRevision
          delete root.dataset.kgFlightGeospatialEnvironment
          delete root.dataset.kgFlightGeospatialCameraPadding
          clearFlightGeoPresentationDebug(root)
        }
      }
      if (!map || !options.mapLibreRuntimeEnabled) {
        disposeGate()
        return
      }
      if (!visible) {
        disposeGate()
        transitionPresentationOwner(null)
        clearFlightGeoOverlayFromMap(map)
        clearFlightGeoEnvironmentFromMap(map)
        return
      }
      if (isMapLibreMapPreparingForDisposal(map)) {
        gate?.cancel()
        return
      }
      transitionPresentationOwner(presentationOwner)
      const flightPresentation = presentationOwner === 'flight'
      const flightGate = flightPresentation ? ensureGate() : null
      if (!flightPresentation) disposeGate()
      // A retained provider map stays mounted while Flight installs its local
      // bootstrap style. Only the settled bootstrap may receive the stopped
      // preparation payload; `style.load` replays this apply after handoff.
      if (
        flightGate
        && deferFlightGeoPresentationForBootstrapRecovery(
          map,
          overlay,
          flightGate.canReuseCommittedStoppedFrame(overlay),
        )
      ) {
        flightGate.cancel()
        flightGate.clearCanvas()
        return
      }
      if (flightGate && overlay.phase === 'stopped') flightGate.clearCanvas()
      if (!flightPresentation) {
        if (!applyCityGeoXrAerialOverlayToMap(map, overlay)) return
        if (root) {
          delete root.dataset.kgFlightGeospatialCameraPadding
        }
        return
      }
      const environmentApplied = applyFlightGeoEnvironmentToMap(
        map,
        overlay,
        options.viewMode,
      )
      const applied = applyFlightGeoOverlayToMap(map, overlay)
      const completePresentation = environmentApplied && applied
      const cameraPadding = readGeoMapViewportPadding(map)
      if (root) {
        root.dataset.kgFlightGeospatialCameraPadding =
          geoMapViewportPaddingKey(cameraPadding)
      }
      const fitKey = [
        options.styleRevision,
        options.viewMode,
        presentationOwner,
        overlay.profileId,
        overlay.environment?.revision || 'no-environment',
        geoMapViewportPaddingKey(cameraPadding),
      ].join(':')
      if (
        completePresentation
        && (
          fitRef.current.map !== map
          || fitRef.current.key !== fitKey
        )
        && fitMapToFlightGeoOverlay(map, overlay, cameraPadding)
      ) {
        fitRef.current = { key: fitKey, map }
      }
      if (!completePresentation || !flightGate) return
      const cameraApplied = overlay.camera.effectiveOwner === 'free-orbit'
        || applyFlightGeoOverlayCameraToMap(
          map,
          overlay,
          options.viewMode,
          cameraPadding,
          { stageStopped: overlay.phase === 'stopped' },
        )
      // Stopped preparation first fits the full local environment, then stages
      // the deterministic tick-zero follow camera and waits for that painter
      // frame. Ready can therefore re-arm its request without another camera
      // transform or GeoJSON worker update.
      if (cameraApplied) flightGate.request(overlay)
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
    const unsubscribeDisposalPreparation = map ? subscribeMapLibreMapDisposalPreparation(map, scheduleFinalApply) : () => void 0
    apply()
    scheduleFinalApply()
    const unsubscribe = subscribeFlightGeoOverlay(apply)
    map?.on?.('style.load', scheduleFinalApply)
    map?.on?.('load', scheduleFinalApply)
    map?.on?.('resize', scheduleFinalApply)
    const root = options.rootRef.current
    const observedRoot = root || map?.getContainer?.()
    const stopObservingOcclusion = observeGeoMapOcclusionChanges(observedRoot || null, scheduleFinalApply)
    return () => {
      unsubscribe()
      unsubscribeBootstrapSettled()
      unsubscribeDisposalPreparation()
      map?.off?.('style.load', scheduleFinalApply)
      map?.off?.('load', scheduleFinalApply)
      map?.off?.('resize', scheduleFinalApply)
      stopObservingOcclusion()
      disposeGate()
      transitionPresentationOwner(null)
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
