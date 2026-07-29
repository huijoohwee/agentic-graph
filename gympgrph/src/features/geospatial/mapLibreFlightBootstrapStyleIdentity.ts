export type MapLibreFlightBootstrapStyleIdentity = Readonly<{
  layerId: string
  name: string
  version: number | null
}>

const MAPLIBRE_FLIGHT_BOOTSTRAP_BACKGROUND_LAYER_ID =
  'kg-flight-sim:geo-bootstrap-background'

export function readMapLibreFlightBootstrapStyleIdentity(
  style: Readonly<Record<string, unknown>>,
): MapLibreFlightBootstrapStyleIdentity {
  const layers = Array.isArray(style.layers) ? style.layers : []
  const bootstrapLayer = layers.find(layer => (
    layer
    && typeof layer === 'object'
    && (layer as Record<string, unknown>).id
      === MAPLIBRE_FLIGHT_BOOTSTRAP_BACKGROUND_LAYER_ID
  )) as Readonly<Record<string, unknown>> | undefined
  const firstLayer = layers.find(layer => (
    layer && typeof layer === 'object'
  )) as Readonly<Record<string, unknown>> | undefined
  const version = Number(style.version)
  return {
    layerId: String(bootstrapLayer?.id || firstLayer?.id || ''),
    name: String(style.name || ''),
    version: Number.isFinite(version) ? version : null,
  }
}

function readCurrentMapLibreStyleIdentity(
  map: any,
): MapLibreFlightBootstrapStyleIdentity | null {
  try {
    const style = map?.getStyle?.()
    if (!style || typeof style !== 'object' || Array.isArray(style)) return null
    return readMapLibreFlightBootstrapStyleIdentity(
      style as Readonly<Record<string, unknown>>,
    )
  } catch {
    return null
  }
}

function isCurrentMapLibreStyleLoaded(map: any): boolean {
  try {
    if (typeof map?.isStyleLoaded === 'function') {
      return map.isStyleLoaded() === true
    }
    return map?.style?._loaded === true
  } catch {
    return false
  }
}

export function hasExpectedMapLibreFlightBootstrapStyle(
  map: any,
  expected: MapLibreFlightBootstrapStyleIdentity | null,
): boolean {
  if (!expected || !isCurrentMapLibreStyleLoaded(map)) return false
  const current = readCurrentMapLibreStyleIdentity(map)
  return Boolean(
    current
    && current.name === expected.name
    && current.version === expected.version
    && current.layerId === expected.layerId,
  )
}
