import React from 'react'
import type { GeospatialBounds } from 'grph-shared/geospatial/enhancedLayerContract'
import { readCityGeoOverlay } from '../../cityGeoOverlay.js'
import { fitMapToCityPresentation } from '../../cityGeoOverlayMapLibreController.js'
import {
  applyGeospatialFitRequestForPresentation,
} from '../../geospatialFitRuntime.js'
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
        padding: args.fitPadding,
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
        padding: args.fitPadding,
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
