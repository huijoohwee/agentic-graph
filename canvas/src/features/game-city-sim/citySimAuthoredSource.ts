import { cityGeoGridProjectedBounds } from 'gympgrph'
import {
  CITY_SIM_SCHEMA_ID,
  validateCityGrid,
  type CityGrid,
} from './citySimModel'
import { parseCityGridDocument } from './citySimCodec'
import {
  resolveRegionalPoiProfile,
} from '@/features/geospatial/regionalPoiProfileCatalog'

export type CitySimGeographicCoordinate = readonly [
  longitude: number,
  latitude: number,
]

export type CitySimGeographicProfile = Readonly<{
  id: string
  anchor: CitySimGeographicCoordinate
  regionalPoiProfileId: string
  parcelWidthMeters: number
  parcelDepthMeters: number
  parcelGapMeters: number
  parcelBearingDegrees: number
  aerialInspection: Readonly<{
    routeCoordinates: readonly CitySimGeographicCoordinate[]
    aircraft: Readonly<{
      coordinate: CitySimGeographicCoordinate
      headingDegrees: number
      altitudeMeters: number
    }>
  }>
}>

export type CitySimAuthoredSource = Readonly<{
  city: CityGrid
  geographicProfile: CitySimGeographicProfile
}>

export type CitySimAuthoredSourceError = Readonly<{
  code:
    | 'malformed-source'
    | 'unsupported-schema'
    | 'invalid-city'
    | 'invalid-geographic-profile'
  message: string
}>

export type CitySimAuthoredSourceResult =
  | Readonly<{ ok: true; source: CitySimAuthoredSource }>
  | Readonly<{ ok: false; error: CitySimAuthoredSourceError }>

const CITY_GRID_HEADING = '## Authored initial parcel grid'

function sourceFrontmatter(document: string): string {
  if (document.includes('\r')) {
    throw new Error('City source line endings must be LF')
  }
  if (!document.startsWith('---\n')) {
    throw new Error('City source must begin with YAML frontmatter')
  }
  const closingIndex = document.indexOf('\n---\n', 4)
  if (closingIndex < 0) throw new Error('City source frontmatter is not closed')
  return document.slice(4, closingIndex)
}

function section(frontmatter: string, name: string): readonly string[] {
  const lines = frontmatter.split('\n')
  const header = `${name}:`
  const headerIndexes = lines.flatMap((line, index) => line === header ? [index] : [])
  if (headerIndexes.length !== 1) {
    throw new Error(`City source must contain exactly one ${name} section`)
  }
  const start = headerIndexes[0] + 1
  let end = start
  while (end < lines.length && (lines[end].startsWith('  ') || !lines[end])) end += 1
  return Object.freeze(lines.slice(start, end))
}

function sectionValue(lines: readonly string[], key: string): string {
  const prefix = `  ${key}: `
  const values = lines
    .filter(line => line.startsWith(prefix))
    .map(line => line.slice(prefix.length))
  if (values.length !== 1 || !values[0]) {
    throw new Error(`City source field ${key} must appear exactly once`)
  }
  return values[0]
}

function canonicalInteger(value: string, label: string): number {
  if (!/^-?(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${label} must use canonical base-10 integer text`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be a safe integer`)
  return parsed
}

function finiteNumber(value: string, label: string): number {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new Error(`${label} must use canonical finite number text`)
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be finite`)
  return parsed
}

function quotedString(value: string, label: string): string {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'string' || !parsed.trim()) throw new Error()
    return parsed
  } catch {
    throw new Error(`${label} must be a non-empty JSON string`)
  }
}

function jsonValue(value: string, label: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${label} must be canonical inline JSON`)
  }
}

function coordinate(value: unknown, label: string): CitySimGeographicCoordinate {
  if (
    !Array.isArray(value)
    || value.length !== 2
    || !value.every(item => typeof item === 'number' && Number.isFinite(item))
  ) {
    throw new Error(`${label} must be a finite [longitude, latitude] coordinate`)
  }
  return Object.freeze([value[0], value[1]]) as CitySimGeographicCoordinate
}

function parcelCsv(document: string): string {
  const fence = String.fromCharCode(96).repeat(3)
  const headingStart = document.indexOf(CITY_GRID_HEADING)
  if (
    headingStart < 0
    || document.lastIndexOf(CITY_GRID_HEADING) !== headingStart
  ) {
    throw new Error('City source must contain exactly one authored initial parcel CSV block')
  }
  const marker = `${fence}csv\n`
  const fenceStart = document.indexOf(marker, headingStart + CITY_GRID_HEADING.length)
  const nextHeading = document.indexOf('\n## ', headingStart + CITY_GRID_HEADING.length)
  if (fenceStart < 0 || (nextHeading >= 0 && fenceStart > nextHeading)) {
    throw new Error('City source authored initial parcel CSV block is missing')
  }
  const contentStart = fenceStart + marker.length
  const contentEnd = document.indexOf(`\n${fence}`, contentStart)
  if (contentEnd < 0) {
    throw new Error('City source authored initial parcel CSV block is not closed')
  }
  return document.slice(contentStart, contentEnd)
}

function encodeFrontmatterString(value: string): string {
  return /^[A-Za-z0-9 _.-]+$/.test(value) && value.trim() === value
    ? value
    : JSON.stringify(value)
}

function parseAuthoredCity(frontmatter: string, document: string): CityGrid {
  const runtime = section(frontmatter, 'city_runtime')
  const initial = section(frontmatter, 'city_initial')
  const schemaId = quotedString(sectionValue(runtime, 'schema_id'), 'City schema id')
  if (schemaId !== CITY_SIM_SCHEMA_ID) {
    throw new Error(`Unsupported city schema ${schemaId}`)
  }
  const cityName = quotedString(sectionValue(initial, 'city_name'), 'City name')
  const rows = canonicalInteger(sectionValue(initial, 'rows'), 'City rows')
  const columns = canonicalInteger(sectionValue(initial, 'columns'), 'City columns')
  const tick = canonicalInteger(sectionValue(initial, 'tick'), 'City tick')
  const treasuryCents = canonicalInteger(
    sectionValue(initial, 'treasury_cents'),
    'City treasury',
  )
  const taxRateBasisPoints = canonicalInteger(
    sectionValue(initial, 'tax_rate_basis_points'),
    'City tax rate',
  )
  const canonicalDocument = [
    '---',
    `schema_id: ${schemaId}`,
    `city_name: ${encodeFrontmatterString(cityName)}`,
    `tick: ${tick}`,
    `treasury_cents: ${treasuryCents}`,
    `tax_rate_basis_points: ${taxRateBasisPoints}`,
    '---',
    '',
    parcelCsv(document),
    '',
  ].join('\n')
  const parsed = parseCityGridDocument(canonicalDocument)
  if (parsed.ok === false) throw new Error(parsed.error.message)
  if (parsed.city.rows !== rows || parsed.city.columns !== columns) {
    throw new Error(
      `Authored City dimensions ${rows}x${columns} do not match its parcel table ${parsed.city.rows}x${parsed.city.columns}`,
    )
  }
  return parsed.city
}

function parseGeographicProfile(frontmatter: string): CitySimGeographicProfile {
  const geographic = section(frontmatter, 'city_geo_xr')
  const dimensions = jsonValue(
    sectionValue(geographic, 'parcel_dimensions_meters'),
    'City parcel dimensions',
  )
  if (
    !Array.isArray(dimensions)
    || dimensions.length !== 2
    || !dimensions.every(value => typeof value === 'number' && Number.isFinite(value))
  ) {
    throw new Error('City parcel dimensions must be finite [width, depth] metres')
  }
  const routeValue = jsonValue(
    sectionValue(geographic, 'aerial_route_coordinates'),
    'City aerial route coordinates',
  )
  if (!Array.isArray(routeValue)) {
    throw new Error('City aerial route coordinates must be an array')
  }
  const routeCoordinates = Object.freeze(routeValue.map((value, index) =>
    coordinate(value, `City aerial route coordinate ${index + 1}`),
  ))
  const aircraftValue = jsonValue(
    sectionValue(geographic, 'aerial_aircraft_coordinate'),
    'City aerial aircraft coordinate',
  )
  const profile: CitySimGeographicProfile = Object.freeze({
    id: quotedString(sectionValue(geographic, 'profile_id'), 'City geographic profile id'),
    anchor: coordinate(
      jsonValue(sectionValue(geographic, 'anchor'), 'City geographic anchor'),
      'City geographic anchor',
    ),
    regionalPoiProfileId: quotedString(
      sectionValue(geographic, 'regional_poi_profile_id'),
      'City regional POI profile id',
    ),
    parcelWidthMeters: dimensions[0],
    parcelDepthMeters: dimensions[1],
    parcelGapMeters: finiteNumber(
      sectionValue(geographic, 'parcel_gap_meters'),
      'City parcel gap',
    ),
    parcelBearingDegrees: finiteNumber(
      sectionValue(geographic, 'parcel_bearing_degrees'),
      'City parcel bearing',
    ),
    aerialInspection: Object.freeze({
      routeCoordinates,
      aircraft: Object.freeze({
        coordinate: coordinate(aircraftValue, 'City aerial aircraft coordinate'),
        headingDegrees: finiteNumber(
          sectionValue(geographic, 'aerial_aircraft_heading_degrees'),
          'City aerial aircraft heading',
        ),
        altitudeMeters: finiteNumber(
          sectionValue(geographic, 'aerial_aircraft_altitude_meters'),
          'City aerial aircraft altitude',
        ),
      }),
    }),
  })
  const issues = validateCitySimGeographicProfile(profile)
  if (issues.length > 0) throw new Error(`Invalid City geographic profile: ${issues.join('; ')}`)
  return profile
}

function coordinateIssues(
  value: CitySimGeographicCoordinate,
  label: string,
): readonly string[] {
  const issues: string[] = []
  if (!Number.isFinite(value[0]) || value[0] < -180 || value[0] > 180) {
    issues.push(`${label} longitude must be between -180 and 180`)
  }
  if (!Number.isFinite(value[1]) || value[1] < -90 || value[1] > 90) {
    issues.push(`${label} latitude must be between -90 and 90`)
  }
  return issues
}

export function validateCitySimGeographicProfile(
  profile: CitySimGeographicProfile,
): readonly string[] {
  const issues: string[] = []
  if (!profile.id.trim()) issues.push('Geographic profile id must not be empty')
  if (!profile.regionalPoiProfileId.trim()) {
    issues.push('Regional POI profile id must not be empty')
  } else {
    try {
      resolveRegionalPoiProfile(profile.regionalPoiProfileId)
    } catch (error) {
      issues.push(
        error instanceof Error
          ? error.message
          : 'Regional POI profile must resolve exactly',
      )
    }
  }
  issues.push(...coordinateIssues(profile.anchor, 'City anchor'))
  for (const [value, label] of [
    [profile.parcelWidthMeters, 'Parcel width'],
    [profile.parcelDepthMeters, 'Parcel depth'],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0 || value > 10_000) {
      issues.push(`${label} must be greater than zero and at most 10000 metres`)
    }
  }
  if (
    !Number.isFinite(profile.parcelGapMeters)
    || profile.parcelGapMeters < 0
    || profile.parcelGapMeters >= Math.min(
      profile.parcelWidthMeters,
      profile.parcelDepthMeters,
    )
  ) {
    issues.push('Parcel gap must be non-negative and smaller than each parcel dimension')
  }
  if (
    !Number.isFinite(profile.parcelBearingDegrees)
    || profile.parcelBearingDegrees < 0
    || profile.parcelBearingDegrees >= 360
  ) {
    issues.push('Parcel bearing must be between 0 inclusive and 360 exclusive')
  }
  if (
    profile.aerialInspection.routeCoordinates.length < 2
    || profile.aerialInspection.routeCoordinates.length > 64
  ) {
    issues.push('Aerial inspection route must contain between 2 and 64 coordinates')
  }
  profile.aerialInspection.routeCoordinates.forEach((value, index) => {
    issues.push(...coordinateIssues(value, `Aerial route coordinate ${index + 1}`))
  })
  issues.push(...coordinateIssues(
    profile.aerialInspection.aircraft.coordinate,
    'Aerial aircraft coordinate',
  ))
  if (
    !Number.isFinite(profile.aerialInspection.aircraft.headingDegrees)
    || profile.aerialInspection.aircraft.headingDegrees < 0
    || profile.aerialInspection.aircraft.headingDegrees >= 360
  ) {
    issues.push('Aerial aircraft heading must be between 0 inclusive and 360 exclusive')
  }
  if (
    !Number.isFinite(profile.aerialInspection.aircraft.altitudeMeters)
    || profile.aerialInspection.aircraft.altitudeMeters < 0
    || profile.aerialInspection.aircraft.altitudeMeters > 20_000
  ) {
    issues.push('Aerial aircraft altitude must be between 0 and 20000 metres')
  }
  return Object.freeze(issues)
}

export function validateCitySimAuthoredSource(
  source: CitySimAuthoredSource,
): readonly string[] {
  const issues = [
    ...validateCityGrid(source.city),
    ...validateCitySimGeographicProfile(source.geographicProfile),
  ]
  if (issues.length === 0) {
    try {
      cityGeoGridProjectedBounds({
        bearingDegrees: source.geographicProfile.parcelBearingDegrees,
        center: source.geographicProfile.anchor,
        columnGapMeters: source.geographicProfile.parcelGapMeters,
        columns: source.city.columns,
        parcelDepthMeters: source.geographicProfile.parcelDepthMeters,
        parcelWidthMeters: source.geographicProfile.parcelWidthMeters,
        rowGapMeters: source.geographicProfile.parcelGapMeters,
        rows: source.city.rows,
      })
    } catch (error) {
      issues.push(
        `City parcel footprint is outside MapLibre projection bounds: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
  return Object.freeze(issues)
}

function classifyError(error: unknown): CitySimAuthoredSourceError {
  const message = error instanceof Error ? error.message : String(error)
  return Object.freeze({
    code: message.startsWith('Unsupported city schema')
      ? 'unsupported-schema'
      : message.startsWith('Invalid city grid')
        ? 'invalid-city'
        : message.startsWith('Invalid City geographic profile')
          ? 'invalid-geographic-profile'
          : 'malformed-source',
    message,
  })
}

export function parseCitySimAuthoredSource(
  document: string,
): CitySimAuthoredSourceResult {
  try {
    const normalizedDocument = String(document)
    const frontmatter = sourceFrontmatter(normalizedDocument)
    const runReady = section(frontmatter, 'run_ready_demo')
    if (quotedString(sectionValue(runReady, 'id'), 'Run-ready demo id') !== 'city-sim') {
      throw new Error('City source run_ready_demo.id must be city-sim')
    }
    const source = Object.freeze({
      city: parseAuthoredCity(frontmatter, normalizedDocument),
      geographicProfile: parseGeographicProfile(frontmatter),
    })
    const issues = validateCitySimAuthoredSource(source)
    if (issues.length > 0) {
      throw new Error(`Invalid City geographic profile: ${issues.join('; ')}`)
    }
    return Object.freeze({ ok: true, source })
  } catch (error) {
    return Object.freeze({ ok: false, error: classifyError(error) })
  }
}
