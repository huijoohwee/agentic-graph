import React from 'react'
import {
  createCityGeoOverlayMapLibreController,
  type CityGeoOverlayMapLibreController,
} from '../../cityGeoOverlayMapLibreController.js'
import { FLIGHT_GEO_OVERLAY_LAYER_IDS } from '../../flightGeoOverlayMapLibre.js'

export function useCityGeoOverlayMapLibrePresentation(options: Readonly<{
  active: boolean
  map: any | null
  mapLibreRuntimeEnabled: boolean
  onParcelSelect?: (parcelId: string) => void
  viewMode: '2d' | '3d'
}>): void {
  const controllerRef = React.useRef<CityGeoOverlayMapLibreController | null>(null)
  const parcelSelectRef = React.useRef(options.onParcelSelect)
  const viewModeRef = React.useRef(options.viewMode)
  parcelSelectRef.current = options.onParcelSelect
  viewModeRef.current = options.viewMode

  React.useEffect(() => {
    if (!options.active || !options.mapLibreRuntimeEnabled || !options.map) {
      return
    }
    const controller = createCityGeoOverlayMapLibreController({
      beforeLayerId: FLIGHT_GEO_OVERLAY_LAYER_IDS.route,
      clearOnDispose: true,
      frameCity: true,
      map: options.map,
      onParcelSelect: parcelId => parcelSelectRef.current?.(parcelId),
      viewMode: viewModeRef.current,
    })
    controllerRef.current = controller
    return () => {
      if (controllerRef.current === controller) controllerRef.current = null
      controller.dispose()
    }
  }, [
    options.active,
    options.map,
    options.mapLibreRuntimeEnabled,
  ])

  React.useEffect(() => {
    controllerRef.current?.setViewMode(options.viewMode)
  }, [
    options.viewMode,
  ])
}
