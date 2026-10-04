export type ExtrusionKind = 'building' | 'road'

export type FetchBound = {
  timeoutMs: number
  maxBytes: number
}

export type ExtrusionLayerConfig = {
  id: string
  datasetId: string
  url: string
  kind: ExtrusionKind
  heightProperty: string
  defaultHeightMeters: number
  baseHeightMeters: number
  fillColor: string
  fillOpacity: number
  tags: readonly string[]
  visible: boolean
  fetchBound: FetchBound
}

export type Asset3DConfig = {
  id: string
  url: string
  lat: number
  lng: number
  altitudeMeters: number
  scale: number
  rotationDegrees: number
  tags: readonly string[]
  visible: boolean
  fetchBound: FetchBound
}

export type ConfigDiagnostic =
  | { code: 'invalid-coordinate'; assetId: string; field: 'lat' | 'lng'; value: unknown }
  | { code: 'invalid-paint'; layerId: string; field: string; value: unknown }
  | { code: 'missing-fetch-bound'; target: string; key: 'timeoutMs' | 'maxBytes' }
  | { code: 'invalid-config'; target: string; field: string; value: unknown }

export type NormalizedEnhancedConfig = {
  extrusions: readonly ExtrusionLayerConfig[]
  assets: readonly Asset3DConfig[]
  diagnostics: readonly ConfigDiagnostic[]
}

export type GeospatialBounds = readonly [west: number, south: number, east: number, north: number]

export type GeoCommand =
  | { kind: 'mode.set'; enabled: boolean }
  | { kind: 'extrusion.visibility'; layerId: string; visible: boolean }
  | { kind: 'asset.visibility'; assetId: string; visible: boolean }
  | { kind: 'tag.visibility'; tag: string; visible: boolean }
  | { kind: 'fit.node'; nodeId: string }

export type GeoCommandEnvelope = {
  schemaId: 'agentic-graph-geospatial-command/v1'
  command: GeoCommand
}

export type GeoCommandRejection = {
  code: 'unknown-action' | 'unknown-target' | 'no-geo-bounds' | 'no-tag-match'
  message: string
}

export const GEO_COMMAND_SCHEMA_ID = 'agentic-graph-geospatial-command/v1' as const
export const EXTRUSION_MAX_HEIGHT_METERS = 10_000
export const ENHANCED_LAYER_STATUS_MESSAGE_MAX_LENGTH = 140

export type SourceGeospatialProperties = Readonly<{
  role: 'surface' | 'volume' | 'path' | 'point'
  label: string
  color: string
  sourceId: string
  sourceHash: string
  sourcePointer: string
  observedAtUtc?: string
  lastObservedAtUtc?: string
  altitudeLabel?: string
  gapSeconds?: number
  status?: string
  // Only resolved geometric heights above the rendered ground may be extruded.
  baseMeters?: number
  heightMeters?: number
  heightReference?: 'map-ground-geometric'
}>
export type SourceGeospatialCoordinate = readonly [longitude: number, latitude: number]
export type SourceGeospatialFeature = Readonly<{
  type: 'Feature'
  id: string
  geometry:
    | Readonly<{ type: 'Point'; coordinates: SourceGeospatialCoordinate }>
    | Readonly<{ type: 'LineString'; coordinates: readonly SourceGeospatialCoordinate[] }>
    | Readonly<{ type: 'Polygon'; coordinates: readonly (readonly SourceGeospatialCoordinate[])[] }>
  properties: SourceGeospatialProperties
}>
export type SourceGeospatialSnapshot = Readonly<{
  schema: 'source-geospatial/v1'
  sourceKey: string
  atUtc: string
  collection: Readonly<{ type: 'FeatureCollection'; features: readonly SourceGeospatialFeature[] }>
}>
