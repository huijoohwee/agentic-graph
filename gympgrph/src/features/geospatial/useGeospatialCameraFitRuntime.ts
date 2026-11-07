import React from 'react'
import type { GeospatialBounds } from 'grph-shared/geospatial/enhancedLayerContract'
import { readCityGeoOverlay } from '../../cityGeoOverlay.js'
import { fitMapToCityPresentation } from '../../cityGeoOverlayMapLibreController.js'
import {
  applyGeospatialFitRequestForPresentation,
} from '../../geospatialFitRuntime.js'
import {
  observeGeoMapViewportOcclusion,
  readGeoMapPresentationPadding,
} from '../../geoMapViewport.js'
import type { GeospatialFitRequest } from '../../hooks/store/types.js'
import type { GeospatialPresentationCameraAuthority } from './useGeospatialPresentationCameraOwner.js'

export function useGeospatialCameraFitRuntime(args: Readonly<{
  active: boolean
  autoFitEnabled: boolean
  clearFitRequest: () => void
  enhancedBounds: GeospatialBounds | null
  fitPadding: number
  graphBounds: GeospatialBounds | null
  graphDataKey: string
  graphFeatureCount: number
  map: any | null
  presentationCamera: GeospatialPresentationCameraAuthority
  request: GeospatialFitRequest | null
  selectedBounds: GeospatialBounds | null
  show3d: boolean
}>): void {
  const autoFitAppliedForDataKeyRef = React.useRef('')
  const presentationFitRef = React.useRef(args)
  presentationFitRef.current = args
  React.useEffect(() => {
    if (
      !args.map
      || !args.active
      || args.presentationCamera.hasClaim()
      || args.show3d
      || !args.autoFitEnabled
      || !args.graphBounds
    ) return
    const autoFitKey = `2d:${args.graphDataKey}`
    if (autoFitAppliedForDataKeyRef.current === autoFitKey) return
    autoFitAppliedForDataKeyRef.current = autoFitKey
    try {
      args.map.fitBounds(args.graphBounds, {
        padding: typeof args.map.getContainer === 'function'
          ? readGeoMapPresentationPadding(args.map, args.fitPadding)
          : args.fitPadding,
        duration: 0,
      })
    } catch {
      void 0
    }
  }, [
    args.active,
    args.autoFitEnabled,
    args.fitPadding,
    args.graphBounds,
    args.graphDataKey,
    args.map,
    args.presentationCamera,
    args.show3d,
  ])

  React.useEffect(() => {
    if (
      !args.map
      || !args.active
      || args.presentationCamera.hasClaim()
      || args.show3d
      || !args.autoFitEnabled
      || !args.graphBounds
      || args.graphFeatureCount <= 0
    ) return

    const viewport = args.map.getContainer?.() as HTMLElement | null | undefined
    if (!viewport) return

    const fitVisibleGraph = () => {
      const current = presentationFitRef.current
      if (
        !current.map
        || !current.active
        || current.presentationCamera.hasClaim()
        || current.show3d
        || !current.autoFitEnabled
        || !current.graphBounds
        || current.graphFeatureCount <= 0
      ) return
      try {
        current.map.fitBounds(current.graphBounds, {
          padding: readGeoMapPresentationPadding(current.map, current.fitPadding),
          duration: 0,
        })
      } catch {
        void 0
      }
    }

    const stopObserving = observeGeoMapViewportOcclusion(viewport, fitVisibleGraph)
    // Run after the first committed layout as Canvas overlays and their panels
    // mount alongside the map host. Subsequent panel changes use the shared
    // observer so the graph remains in the camera's visible aperture.
    const initialFitFrame = window.requestAnimationFrame(fitVisibleGraph)
    return () => {
      window.cancelAnimationFrame(initialFitFrame)
      stopObserving()
    }
  }, [
    args.active,
    args.autoFitEnabled,
    args.graphDataKey,
    args.graphFeatureCount,
    args.map,
    args.presentationCamera,
    args.show3d,
  ])

  const initialDataFitDoneRef = React.useRef(false)
  React.useEffect(() => {
    if (
      !args.map
      || !args.active
      || args.presentationCamera.hasClaim()
      || args.show3d
    ) return
    if (args.graphFeatureCount <= 0) {
      initialDataFitDoneRef.current = false
      return
    }
    if (!args.graphBounds || initialDataFitDoneRef.current) return
    initialDataFitDoneRef.current = true
    try {
      args.map.fitBounds(args.graphBounds, {
        padding: typeof args.map.getContainer === 'function'
          ? readGeoMapPresentationPadding(args.map, args.fitPadding)
          : args.fitPadding,
        duration: 0,
      })
    } catch {
      void 0
    }
  }, [
    args.active,
    args.fitPadding,
    args.graphBounds,
    args.graphFeatureCount,
    args.map,
    args.presentationCamera,
    args.show3d,
  ])

  React.useEffect(() => {
    if (!args.map || !args.active || !args.request) return
    // Keep a requested data fit pending while the shared graph is still
    // hydrating. Clearing it before bounds exist leaves the map at its prior
    // camera and hides newly authored sites behind workspace panels.
    if (
      (args.request.mode === 'data' || args.request.mode === 'selection')
      && !args.selectedBounds
      && !args.graphBounds
      && !args.enhancedBounds
    ) return
    applyGeospatialFitRequestForPresentation({
      map: args.map,
      request: args.request,
      selectedBounds: args.selectedBounds,
      graphBounds: args.graphBounds,
      enhancedBounds: args.enhancedBounds,
      padding: args.fitPadding,
      presentationOwner: args.presentationCamera.readOwner(),
      applyCityPresentation: () => {
        fitMapToCityPresentation(
          args.map,
          readCityGeoOverlay(),
          args.show3d ? '3d' : '2d',
        )
      },
    })
    args.clearFitRequest()
  }, [
    args.active,
    args.clearFitRequest,
    args.enhancedBounds,
    args.fitPadding,
    args.graphBounds,
    args.map,
    args.presentationCamera,
    args.request,
    args.selectedBounds,
    args.show3d,
  ])
}
