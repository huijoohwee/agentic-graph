import {
  CITY_GEO_OVERLAY_LAYER_ORDER,
} from './cityGeoOverlayMapLibre.js'
import {
  FLIGHT_GEO_OVERLAY_LAYER_ORDER,
} from './flightGeoOverlayMapLibre.js'

export const CITY_GEO_XR_LAYER_ORDER = Object.freeze([
  ...CITY_GEO_OVERLAY_LAYER_ORDER,
  ...FLIGHT_GEO_OVERLAY_LAYER_ORDER,
])

const CITY_GEO_XR_LAYER_ID_SET = new Set<string>(CITY_GEO_XR_LAYER_ORDER)

export function readCityGeoXrLayerOrder(
  styleLayerIds: readonly string[],
): readonly string[] {
  return styleLayerIds.filter(layerId => CITY_GEO_XR_LAYER_ID_SET.has(layerId))
}

export function hasExactCityGeoXrLayerOrder(
  styleLayerIds: readonly string[],
): boolean {
  const indexes = CITY_GEO_XR_LAYER_ORDER.map(layerId => (
    styleLayerIds.indexOf(layerId)
  ))
  return indexes.every((styleIndex, index) => (
    styleIndex >= 0
    && (
      index === 0
      || styleIndex === indexes[index - 1] + 1
    )
  ))
}
