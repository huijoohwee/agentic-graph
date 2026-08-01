import type { GeospatialBounds } from 'grph-shared/geospatial/enhancedLayerContract'
import type { GeospatialFitRequest } from './hooks/store/types.js'
import type { GeospatialPresentationCameraOwner } from './features/geospatial/geospatialPresentationCameraOwner.js'

export type GeospatialFitRequestRoute =
  | 'city-presentation'
  | 'generic'
  | 'ignore'

type GeospatialFitRequestArgs = Readonly<{
  map: any
  request: GeospatialFitRequest
  selectedBounds: GeospatialBounds | null
  graphBounds: GeospatialBounds | null
  enhancedBounds: GeospatialBounds | null
  padding: number
}>

/**
 * Automatic fit requests defer to the active gameplay camera. Explicit user
 * bounds and current-location requests remain authoritative in every mode.
 */
export function resolveGeospatialFitRequestRoute(
  request: GeospatialFitRequest,
  presentationOwner: GeospatialPresentationCameraOwner,
): GeospatialFitRequestRoute {
  if (
    presentationOwner === null
    || request.mode === 'bounds'
    || request.mode === 'currentLocation'
  ) return 'generic'
  if (presentationOwner === 'city' && request.mode === 'data') {
    return 'city-presentation'
  }
  return 'ignore'
}

const fit = (map: any, bounds: GeospatialBounds | null, padding: number): void => {
  if (!bounds) return
  try {
    map.fitBounds(bounds, { padding, duration: 0 })
  } catch {
    void 0
  }
}

export function applyGeospatialFitRequest(
  args: GeospatialFitRequestArgs,
): void {
  if (args.request.mode === 'bounds') {
    fit(args.map, args.request.bounds, args.padding)
    return
  }
  if (args.request.mode === 'currentLocation') {
    const zoom = Number.isFinite(args.request.zoom)
      ? args.request.zoom
      : Math.max(12, Number(args.map.getZoom?.() || 0))
    try {
      args.map.flyTo?.({ center: [args.request.lng, args.request.lat], zoom, duration: 0 })
    } catch {
      try {
        args.map.jumpTo?.({ center: [args.request.lng, args.request.lat], zoom })
      } catch {
        void 0
      }
    }
    return
  }
  if (args.request.mode === 'selection') {
    fit(args.map, args.selectedBounds || args.graphBounds || args.enhancedBounds, args.padding)
    return
  }
  fit(args.map, args.graphBounds || args.enhancedBounds, args.padding)
}

export function applyGeospatialFitRequestForPresentation(
  args: GeospatialFitRequestArgs & Readonly<{
    applyCityPresentation: () => void
    presentationOwner: GeospatialPresentationCameraOwner
  }>,
): GeospatialFitRequestRoute {
  const route = resolveGeospatialFitRequestRoute(
    args.request,
    args.presentationOwner,
  )
  if (route === 'city-presentation') {
    args.applyCityPresentation()
  } else if (route === 'generic') {
    applyGeospatialFitRequest(args)
  }
  return route
}
