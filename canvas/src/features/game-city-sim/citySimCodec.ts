import {
  CITY_SIM_SCHEMA_ID,
  assertValidCityGrid,
  freezeCityGrid,
  isCityZone,
  type CityGrid,
  type CityParcel,
} from './citySimModel'

export const CITY_SIM_CSV_HEADER =
  'parcel_id,row,column,zone,land_value_cents,population,pollution' as const

export type CityGridParseError = Readonly<{
  code: 'malformed-document' | 'unsupported-schema' | 'invalid-grid'
  message: string
}>

export type CityGridParseResult =
  | Readonly<{ ok: true; city: CityGrid }>
  | Readonly<{ ok: false; error: CityGridParseError }>

function encodeFrontmatterString(value: string): string {
  return /^[A-Za-z0-9 _.-]+$/.test(value) && value.trim() === value
    ? value
    : JSON.stringify(value)
}

function canonicalParcels(city: CityGrid): readonly CityParcel[] {
  return [...city.parcels].sort((left, right) => (
    left.row - right.row || left.column - right.column
  ))
}

function parcelRow(parcel: CityParcel): string {
  return [
    parcel.id,
    parcel.row,
    parcel.column,
    parcel.zone,
    parcel.landValueCents,
    parcel.population,
    parcel.pollution,
  ].join(',')
}

export function serializeCityGridDocument(city: CityGrid): string {
  assertValidCityGrid(city)
  return [
    '---',
    `schema_id: ${CITY_SIM_SCHEMA_ID}`,
    `city_name: ${encodeFrontmatterString(city.cityName)}`,
    `regional_poi_profile_id: ${encodeFrontmatterString(city.regionalPoiProfileId)}`,
    `tick: ${city.tick}`,
    `treasury_cents: ${city.treasuryCents}`,
    `tax_rate_basis_points: ${city.taxRateBasisPoints}`,
    '---',
    '',
    CITY_SIM_CSV_HEADER,
    ...canonicalParcels(city).map(parcelRow),
    '',
  ].join('\n')
}

function parseCanonicalInteger(value: string, label: string): number {
  if (!/^-?(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${label} must use canonical base-10 integer text`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be a safe integer`)
  return parsed
}

function parseFrontmatterString(value: string, label: string): string {
  if (!value) throw new Error(`${label} must not be empty`)
  if (!value.startsWith('"')) return value
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed !== 'string' || !parsed) throw new Error()
    return parsed
  } catch {
    throw new Error(`${label} contains invalid quoted text`)
  }
}

function parseFrontmatter(lines: readonly string[]): Readonly<{
  schemaId: string
  cityName: string
  regionalPoiProfileId: string
  tick: number
  treasuryCents: number
  taxRateBasisPoints: number
}> {
  if (lines.length !== 8 || lines[0] !== '---' || lines[7] !== '---') {
    throw new Error('City document must contain the ordered KGC frontmatter block')
  }
  const expectedKeys = [
    'schema_id',
    'city_name',
    'regional_poi_profile_id',
    'tick',
    'treasury_cents',
    'tax_rate_basis_points',
  ] as const
  const values = new Map<string, string>()
  expectedKeys.forEach((expectedKey, index) => {
    const line = lines[index + 1]
    const prefix = `${expectedKey}: `
    if (!line.startsWith(prefix)) {
      throw new Error(`City frontmatter key ${expectedKey} is missing or out of order`)
    }
    values.set(expectedKey, line.slice(prefix.length))
  })
  return Object.freeze({
    schemaId: String(values.get('schema_id') || ''),
    cityName: parseFrontmatterString(String(values.get('city_name') || ''), 'City name'),
    regionalPoiProfileId: parseFrontmatterString(
      String(values.get('regional_poi_profile_id') || ''),
      'Regional POI profile id',
    ),
    tick: parseCanonicalInteger(String(values.get('tick') || ''), 'City tick'),
    treasuryCents: parseCanonicalInteger(
      String(values.get('treasury_cents') || ''),
      'City treasury',
    ),
    taxRateBasisPoints: parseCanonicalInteger(
      String(values.get('tax_rate_basis_points') || ''),
      'City tax rate',
    ),
  })
}

function parseParcel(line: string): CityParcel {
  const columns = line.split(',')
  if (columns.length !== 7) throw new Error('City parcel row must contain 7 columns')
  const [
    id,
    rowValue,
    columnValue,
    zone,
    landValueValue,
    populationValue,
    pollutionValue,
  ] = columns
  if (!id) throw new Error('City parcel id must not be empty')
  if (!isCityZone(zone)) throw new Error(`Parcel ${id} has unsupported zone ${zone}`)
  return Object.freeze({
    id,
    row: parseCanonicalInteger(rowValue, `Parcel ${id} row`),
    column: parseCanonicalInteger(columnValue, `Parcel ${id} column`),
    zone,
    landValueCents: parseCanonicalInteger(
      landValueValue,
      `Parcel ${id} land value`,
    ),
    population: parseCanonicalInteger(
      populationValue,
      `Parcel ${id} population`,
    ),
    pollution: parseCanonicalInteger(
      pollutionValue,
      `Parcel ${id} pollution`,
    ),
  })
}

function parseDocument(document: string): CityGrid {
  if (document.includes('\r')) throw new Error('City document line endings must be LF')
  if (!document.endsWith('\n') || document.endsWith('\n\n')) {
    throw new Error('City document must end with exactly one newline')
  }
  const lines = document.slice(0, -1).split('\n')
  const separatorIndex = lines.indexOf('')
  if (separatorIndex !== 8 || lines.slice(9).includes('')) {
    throw new Error('City document must contain one blank line before its CSV table')
  }
  const frontmatter = parseFrontmatter(lines.slice(0, 8))
  if (frontmatter.schemaId !== CITY_SIM_SCHEMA_ID) {
    throw new Error(`Unsupported city schema ${frontmatter.schemaId}`)
  }
  if (lines[9] !== CITY_SIM_CSV_HEADER) {
    throw new Error(`City CSV header must be ${CITY_SIM_CSV_HEADER}`)
  }
  const parcels = lines.slice(10).map(parseParcel)
  if (parcels.length === 0) throw new Error('City document must contain at least one parcel')
  const rows = Math.max(...parcels.map(parcel => parcel.row)) + 1
  const columns = Math.max(...parcels.map(parcel => parcel.column)) + 1
  const population = parcels.reduce((total, parcel) => total + parcel.population, 0)
  if (!Number.isSafeInteger(population)) throw new Error('City population is not a safe integer')
  const city = freezeCityGrid({
    schemaId: CITY_SIM_SCHEMA_ID,
    cityName: frontmatter.cityName,
    regionalPoiProfileId: frontmatter.regionalPoiProfileId,
    rows,
    columns,
    tick: frontmatter.tick,
    treasuryCents: frontmatter.treasuryCents,
    taxRateBasisPoints: frontmatter.taxRateBasisPoints,
    population,
    parcels,
  })
  assertValidCityGrid(city)
  if (serializeCityGridDocument(city) !== document) {
    throw new Error('City document bytes are not in canonical schema order and formatting')
  }
  return city
}

function classifyError(error: unknown): CityGridParseError {
  const message = error instanceof Error
    ? error.message
    : String(error || 'Malformed city document')
  return Object.freeze({
    code: message.startsWith('Unsupported city schema')
      ? 'unsupported-schema'
      : message.startsWith('Invalid city grid')
        ? 'invalid-grid'
        : 'malformed-document',
    message,
  })
}

export function parseCityGridDocument(document: string): CityGridParseResult {
  try {
    return Object.freeze({ ok: true, city: parseDocument(String(document)) })
  } catch (error) {
    return Object.freeze({ ok: false, error: classifyError(error) })
  }
}

export function cityGridReadBackEquals(left: CityGrid, right: CityGrid): boolean {
  return serializeCityGridDocument(left) === serializeCityGridDocument(right)
}

export type CityGridRoundTripResult =
  | Readonly<{ ok: true; document: string; city: CityGrid }>
  | Readonly<{ ok: false; document: string; error: CityGridParseError }>

export function verifyCityGridRoundTrip(city: CityGrid): CityGridRoundTripResult {
  const document = serializeCityGridDocument(city)
  const parsed = parseCityGridDocument(document)
  if (parsed.ok === false) {
    return Object.freeze({ ok: false, document, error: parsed.error })
  }
  if (serializeCityGridDocument(parsed.city) !== document) {
    return Object.freeze({
      ok: false,
      document,
      error: Object.freeze({
        code: 'invalid-grid',
        message: 'City document did not produce byte-identical serialization after read-back',
      }),
    })
  }
  return Object.freeze({ ok: true, document, city: parsed.city })
}
