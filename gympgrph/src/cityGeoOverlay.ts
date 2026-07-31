export const CITY_GEO_ZONES = Object.freeze([
  'unzoned',
  'residential',
  'commercial',
  'industrial',
] as const)

export type CityGeoZone = (typeof CITY_GEO_ZONES)[number]
export type CityGeoViewMode = '2d' | '3d'
export type CityGeoCoordinate = readonly [
  longitude: number,
  latitude: number,
]

export type CityGeoParcelState = Readonly<{
  column: number
  id: string
  landValueCents: number
  pollution: number
  population: number
  row: number
  zone: CityGeoZone
}>

export type CityGeoZoneStyle = Readonly<{
  baseHeightMeters: number
  fillColor: string
  landValueCentsPerHeightMeter: number | null
  maxHeightMeters: number
  outlineColor: string
  populationPerHeightMeter: number | null
}>

export type CityGeoFraming = Readonly<{
  bearingDegrees: number
  maxZoom: number
  paddingPixels: number
  pitchDegrees: number
}>

export type CityGeographicProfile = Readonly<{
  bearingDegrees: number
  center: CityGeoCoordinate
  columnGapMeters: number
  framing: Readonly<Record<CityGeoViewMode, CityGeoFraming>>
  id: string
  parcelDepthMeters: number
  parcelWidthMeters: number
  revision: string
  rowGapMeters: number
  selectedOutlineColor: string
  zoneStyles: Readonly<Record<CityGeoZone, CityGeoZoneStyle>>
}>

export type CityGeoOverlaySnapshot = Readonly<{
  active: boolean
  columns: number
  parcels: readonly CityGeoParcelState[]
  profile: CityGeographicProfile | null
  revision: string
  rows: number
  selectedParcelId: string | null
}>

export type CityGeoOverlayListener = (
  snapshot: CityGeoOverlaySnapshot,
) => void

const CITY_GEO_ZONE_SET = new Set<string>(CITY_GEO_ZONES)

export const EMPTY_CITY_GEO_OVERLAY: CityGeoOverlaySnapshot = Object.freeze({
  active: false,
  columns: 0,
  parcels: Object.freeze([]),
  profile: null,
  revision: 'inactive',
  rows: 0,
  selectedParcelId: null,
})

let snapshot = EMPTY_CITY_GEO_OVERLAY
const listeners = new Set<CityGeoOverlayListener>()

function requireNonEmptyString(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`)
  }
  return value
}

function requireFiniteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`)
  return value
}

function requireNonNegativeNumber(value: number, label: string): number {
  requireFiniteNumber(value, label)
  if (value < 0) throw new Error(`${label} must not be negative.`)
  return value
}

function requirePositiveNumber(value: number, label: string): number {
  requireFiniteNumber(value, label)
  if (value <= 0) throw new Error(`${label} must be greater than zero.`)
  return value
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`)
  }
  return value
}

function freezeFraming(
  framing: CityGeoFraming,
  label: string,
): CityGeoFraming {
  requireFiniteNumber(framing.bearingDegrees, `${label} bearing`)
  requireNonNegativeNumber(framing.maxZoom, `${label} max zoom`)
  requireNonNegativeNumber(framing.paddingPixels, `${label} padding`)
  requireNonNegativeNumber(framing.pitchDegrees, `${label} pitch`)
  if (framing.pitchDegrees > 85) {
    throw new Error(`${label} pitch must not exceed 85 degrees.`)
  }
  return Object.freeze({ ...framing })
}

function freezeZoneStyle(
  style: CityGeoZoneStyle,
  zone: CityGeoZone,
): CityGeoZoneStyle {
  requireNonNegativeNumber(style.baseHeightMeters, `${zone} base height`)
  requireNonNegativeNumber(style.maxHeightMeters, `${zone} max height`)
  if (style.maxHeightMeters < style.baseHeightMeters) {
    throw new Error(`${zone} max height must include its base height.`)
  }
  if (style.landValueCentsPerHeightMeter !== null) {
    requirePositiveNumber(
      style.landValueCentsPerHeightMeter,
      `${zone} land-value height divisor`,
    )
  }
  if (style.populationPerHeightMeter !== null) {
    requirePositiveNumber(
      style.populationPerHeightMeter,
      `${zone} population height divisor`,
    )
  }
  requireNonEmptyString(style.fillColor, `${zone} fill color`)
  requireNonEmptyString(style.outlineColor, `${zone} outline color`)
  return Object.freeze({ ...style })
}

function freezeGeographicProfile(
  profile: CityGeographicProfile,
): CityGeographicProfile {
  const [longitude, latitude] = profile.center
  requireFiniteNumber(longitude, 'City geographic center longitude')
  requireFiniteNumber(latitude, 'City geographic center latitude')
  if (longitude < -180 || longitude > 180) {
    throw new Error('City geographic center longitude must be within [-180, 180].')
  }
  if (latitude < -85 || latitude > 85) {
    throw new Error('City geographic center latitude must be within [-85, 85].')
  }
  requireNonEmptyString(profile.id, 'City geographic profile id')
  requireNonEmptyString(profile.revision, 'City geographic profile revision')
  requireFiniteNumber(profile.bearingDegrees, 'City geographic profile bearing')
  requirePositiveNumber(profile.parcelDepthMeters, 'City parcel depth')
  requirePositiveNumber(profile.parcelWidthMeters, 'City parcel width')
  requireNonNegativeNumber(profile.columnGapMeters, 'City column gap')
  requireNonNegativeNumber(profile.rowGapMeters, 'City row gap')
  requireNonEmptyString(
    profile.selectedOutlineColor,
    'City selected-parcel outline color',
  )
  const zoneStyleKeys = Object.keys(profile.zoneStyles)
  if (
    zoneStyleKeys.length !== CITY_GEO_ZONES.length
    || !zoneStyleKeys.every(zone => CITY_GEO_ZONE_SET.has(zone))
  ) {
    throw new Error('City geographic profile must author exactly one style per City zone.')
  }
  return Object.freeze({
    ...profile,
    center: Object.freeze([longitude, latitude] as const),
    framing: Object.freeze({
      '2d': freezeFraming(profile.framing['2d'], 'City 2D framing'),
      '3d': freezeFraming(profile.framing['3d'], 'City 3D framing'),
    }),
    zoneStyles: Object.freeze(Object.fromEntries(
      CITY_GEO_ZONES.map(zone => [
        zone,
        freezeZoneStyle(profile.zoneStyles[zone], zone),
      ]),
    ) as Record<CityGeoZone, CityGeoZoneStyle>),
  })
}

function freezeParcel(
  parcel: CityGeoParcelState,
  rows: number,
  columns: number,
): CityGeoParcelState {
  requireNonEmptyString(parcel.id, 'City parcel id')
  requireNonNegativeInteger(parcel.row, `${parcel.id} row`)
  requireNonNegativeInteger(parcel.column, `${parcel.id} column`)
  requireNonNegativeInteger(parcel.landValueCents, `${parcel.id} land value`)
  requireNonNegativeInteger(parcel.population, `${parcel.id} population`)
  requireNonNegativeInteger(parcel.pollution, `${parcel.id} pollution`)
  if (parcel.row >= rows || parcel.column >= columns) {
    throw new Error(`${parcel.id} coordinates must be inside the City grid.`)
  }
  if (!CITY_GEO_ZONE_SET.has(parcel.zone)) {
    throw new Error(`${parcel.id} has unsupported City zone ${String(parcel.zone)}.`)
  }
  return Object.freeze({ ...parcel })
}

export function createCityGeoOverlaySnapshot(
  input: CityGeoOverlaySnapshot,
): CityGeoOverlaySnapshot {
  requireNonEmptyString(input.revision, 'City Geo overlay revision')
  if (!input.active) {
    if (
      input.profile !== null
      || input.rows !== 0
      || input.columns !== 0
      || input.parcels.length !== 0
      || input.selectedParcelId !== null
    ) {
      throw new Error('Inactive City Geo overlay state must not retain profile or parcel data.')
    }
    return Object.freeze({
      ...EMPTY_CITY_GEO_OVERLAY,
      revision: input.revision,
    })
  }
  if (!input.profile) {
    throw new Error('Active City Geo overlay state requires an authored geographic profile.')
  }
  requirePositiveNumber(input.rows, 'City grid row count')
  requirePositiveNumber(input.columns, 'City grid column count')
  if (!Number.isSafeInteger(input.rows) || !Number.isSafeInteger(input.columns)) {
    throw new Error('City grid dimensions must be safe integers.')
  }
  if (input.parcels.length !== input.rows * input.columns) {
    throw new Error('Active City Geo overlay state requires one live parcel per grid cell.')
  }
  const parcels = input.parcels.map(parcel => (
    freezeParcel(parcel, input.rows, input.columns)
  ))
  const parcelIds = new Set(parcels.map(parcel => parcel.id))
  const parcelCells = new Set(
    parcels.map(parcel => `${parcel.row}:${parcel.column}`),
  )
  if (parcelIds.size !== parcels.length || parcelCells.size !== parcels.length) {
    throw new Error('City Geo overlay parcels must have unique ids and grid cells.')
  }
  if (
    input.selectedParcelId !== null
    && !parcelIds.has(input.selectedParcelId)
  ) {
    throw new Error('Selected City Geo parcel must exist in the live parcel state.')
  }
  return Object.freeze({
    active: true,
    columns: input.columns,
    parcels: Object.freeze(parcels),
    profile: freezeGeographicProfile(input.profile),
    revision: input.revision,
    rows: input.rows,
    selectedParcelId: input.selectedParcelId,
  })
}

export function readCityGeoOverlay(): CityGeoOverlaySnapshot {
  return snapshot
}

export function subscribeCityGeoOverlay(
  listener: CityGeoOverlayListener,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setCityGeoOverlay(
  next: CityGeoOverlaySnapshot,
): CityGeoOverlaySnapshot {
  snapshot = createCityGeoOverlaySnapshot(next)
  for (const listener of [...listeners]) listener(snapshot)
  return snapshot
}

export function clearCityGeoOverlay(): void {
  if (snapshot === EMPTY_CITY_GEO_OVERLAY) return
  snapshot = EMPTY_CITY_GEO_OVERLAY
  for (const listener of [...listeners]) listener(snapshot)
}
