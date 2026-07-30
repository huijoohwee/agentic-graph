export type MapLibreFlightBootstrapStyleIdentity = Readonly<{
  backgroundColor: string
  layerId: string
  layerType: string
  name: string
  version: number | null
}>

const MAPLIBRE_FLIGHT_BOOTSTRAP_BACKGROUND_LAYER_ID =
  'kg-flight-sim:geo-bootstrap-background'

function stableStyleValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStyleValue).join(',')}]`
  }
  const record = value as Readonly<Record<string, unknown>>
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStyleValue(record[key])}`)
    .join(',')}}`
}

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
  const paint = bootstrapLayer?.paint
  const backgroundColor = (
    paint
    && typeof paint === 'object'
    && !Array.isArray(paint)
  )
    ? (paint as Readonly<Record<string, unknown>>)['background-color']
    : undefined
  return {
    backgroundColor: stableStyleValue(backgroundColor),
    layerId: String(bootstrapLayer?.id || firstLayer?.id || ''),
    layerType: String(bootstrapLayer?.type || firstLayer?.type || ''),
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
  return isCurrentMapLibreStyleLoaded(map)
    && hasExpectedMapLibreFlightBootstrapStyleIdentity(map, expected)
}

export function hasExpectedMapLibreFlightBootstrapStyleIdentity(
  map: any,
  expected: MapLibreFlightBootstrapStyleIdentity | null,
): boolean {
  if (!expected) return false
  const current = readCurrentMapLibreStyleIdentity(map)
  return Boolean(
    current
    && current.name === expected.name
    && current.version === expected.version
    && current.layerId === expected.layerId
    && current.layerType === expected.layerType
    && current.backgroundColor === expected.backgroundColor
  )
}
