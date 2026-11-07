import React from 'react'
import {
  createCityGeoOverlayMapLibreController,
  type CityGeoOverlayMapLibreController,
} from '../../cityGeoOverlayMapLibreController.js'
import {
  EMPTY_CITY_GEO_OVERLAY,
  type CityGeoOverlaySnapshot,
} from '../../cityGeoOverlay.js'
import { FLIGHT_GEO_OVERLAY_LAYER_IDS } from '../../flightGeoOverlayMapLibre.js'

const NOOP_SUBSCRIBE = (): (() => void) => () => {}

/**
 * Reuses the complete City presentation, including its player and route, while
 * Game Mode adds its actors to the same Geo+XR map. Game Mode owns the camera
 * and derives its framing from the same City profile and route.
 */
export function useGameModeCityContextMapLibrePresentation(options: Readonly<{
  active: boolean
  map: any | null
  mapLibreRuntimeEnabled: boolean
  snapshot: CityGeoOverlaySnapshot | null
  viewMode: '2d' | '3d'
}>): void {
  const controllerRef = React.useRef<CityGeoOverlayMapLibreController | null>(null)
  const snapshotRef = React.useRef(options.snapshot)
  snapshotRef.current = options.snapshot

  React.useEffect(() => {
    const map = options.map
    if (
      !options.active
      || !options.mapLibreRuntimeEnabled
      || !map
      || !options.snapshot?.active
    ) return

    const controller = createCityGeoOverlayMapLibreController({
      beforeLayerId: FLIGHT_GEO_OVERLAY_LAYER_IDS.route,
      clearOnDispose: true,
      frameCity: false,
      map,
      readSnapshot: () => snapshotRef.current || EMPTY_CITY_GEO_OVERLAY,
      subscribe: NOOP_SUBSCRIBE,
      viewMode: options.viewMode,
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
    Boolean(options.snapshot?.active),
  ])

  React.useEffect(() => {
    controllerRef.current?.setViewMode(options.viewMode)
  }, [options.viewMode])

  React.useEffect(() => {
    if (
      !options.active
      || !options.mapLibreRuntimeEnabled
      || !options.map
      || !options.snapshot?.active
    ) return
    controllerRef.current?.apply()
  }, [
    options.active,
    options.map,
    options.mapLibreRuntimeEnabled,
    options.snapshot,
  ])
}
