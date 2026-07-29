export type GeospatialFitRequest = {
  mode: 'data' | 'selection'
} | {
  mode: 'currentLocation'
  lat: number
  lng: number
  zoom?: number
} | {
  mode: 'bounds'
  bounds: readonly [number, number, number, number]
}

export type GeospatialViewMode = '2d-svg' | '2d' | '2d-modern' | '3d' | '3d-modern'

export type GeospatialInteractionMode = 'always' | 'holdSpace'
