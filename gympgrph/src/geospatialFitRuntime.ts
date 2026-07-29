import type { GeospatialBounds } from 'grph-shared/geospatial/enhancedLayerContract'
import type { GeospatialFitRequest } from './hooks/store/types.js'

const fit = (map: any, bounds: GeospatialBounds | null, padding: number): void => {
  if (!bounds) return
  try {
    map.fitBounds(bounds, { padding, duration: 0 })
  } catch {
    void 0
  }
}

export function applyGeospatialFitRequest(args: {
  map: any
  request: GeospatialFitRequest
  selectedBounds: GeospatialBounds | null
  graphBounds: GeospatialBounds | null
  enhancedBounds: GeospatialBounds | null
  padding: number
}): void {
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
