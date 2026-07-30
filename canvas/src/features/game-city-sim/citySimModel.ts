export const CITY_SIM_SCHEMA_ID = 'knowgrph-city-grid/v1' as const
export const CITY_SIM_FIXED_STEP_MS = 1_000
export const CITY_SIM_DOCUMENT_PATH = '/game-city-sim/city-grid.md' as const

export const CITY_ZONES = [
  'unzoned',
  'residential',
  'commercial',
  'industrial',
] as const

export const CITY_ZONING_TYPES = [
  'residential',
  'commercial',
  'industrial',
] as const

export type CityZone = (typeof CITY_ZONES)[number]
export type CityZoningType = (typeof CITY_ZONING_TYPES)[number]
export type CityAdviceScope = 'parcel' | 'district'

export type CityParcel = Readonly<{
  id: string
  row: number
  column: number
  zone: CityZone
  landValueCents: number
  population: number
  pollution: number
}>

export type CityGrid = Readonly<{
  schemaId: typeof CITY_SIM_SCHEMA_ID
  cityName: string
  rows: number
  columns: number
  tick: number
  treasuryCents: number
  taxRateBasisPoints: number
  population: number
  parcels: readonly CityParcel[]
}>

export type CityCostLog = Readonly<{
  operation: 'tick' | 'advisor'
  model: 'none'
  prompt_tokens: 0
  completion_tokens: 0
  cache_hits: 0
  estimated_cost_usd: 0
}>

export type CityAdvisorProposal = Readonly<{
  id: string
  parcelId: string
  recommendedZone: CityZoningType
  score: number
  clarifyRequired: boolean
  rationale: string
  round: 1 | 2
  currentLandValueCents: number
}>

export type CityAdvisorResult = Readonly<{
  scope: CityAdviceScope
  rounds: 1 | 2
  proposals: readonly CityAdvisorProposal[]
  recommendedProposalId: string | null
  clarifyRequired: boolean
  tieRetained: boolean
  tiedProposalIds: readonly string[]
  costLog: CityCostLog
}>

export type CityMutationErrorCode =
  | 'invalid-grid'
  | 'unknown-parcel'
  | 'unsupported-zone'

export type CityMutationResult =
  | Readonly<{ ok: true; city: CityGrid; parcel: CityParcel }>
  | Readonly<{
      ok: false
      city: CityGrid
      error: Readonly<{ code: CityMutationErrorCode; message: string }>
    }>

const CITY_ZONE_SET = new Set<string>(CITY_ZONES)
const CITY_ZONING_TYPE_SET = new Set<string>(CITY_ZONING_TYPES)
const PARCEL_ID_PATTERN = /^r(\d{2})c(\d{2})$/

export function isCityZone(value: unknown): value is CityZone {
  return typeof value === 'string' && CITY_ZONE_SET.has(value)
}

export function isCityZoningType(value: unknown): value is CityZoningType {
  return typeof value === 'string' && CITY_ZONING_TYPE_SET.has(value)
}

export function cityParcelId(row: number, column: number): string {
  if (
    !Number.isInteger(row)
    || !Number.isInteger(column)
    || row < 0
    || row > 99
    || column < 0
    || column > 99
  ) {
    throw new Error('City parcel coordinates must be integers between 0 and 99')
  }
  return `r${String(row).padStart(2, '0')}c${String(column).padStart(2, '0')}`
}

export function parseCityParcelId(
  parcelId: string,
): Readonly<{ row: number; column: number }> | null {
  const match = PARCEL_ID_PATTERN.exec(parcelId)
  if (!match) return null
  return Object.freeze({ row: Number(match[1]), column: Number(match[2]) })
}

function freezeParcel(parcel: CityParcel): CityParcel {
  return Object.freeze({ ...parcel })
}

export function freezeCityGrid(city: CityGrid): CityGrid {
  return Object.freeze({
    ...city,
    parcels: Object.freeze(city.parcels.map(freezeParcel)),
  })
}

function defaultParcel(row: number, column: number): CityParcel {
  const id = cityParcelId(row, column)
  if (id === 'r00c00') {
    return Object.freeze({
      id,
      row,
      column,
      zone: 'residential',
      landValueCents: 10_000,
      population: 10,
      pollution: 0,
    })
  }
  if (id === 'r00c01') {
    return Object.freeze({
      id,
      row,
      column,
      zone: 'commercial',
      landValueCents: 9_000,
      population: 5,
      pollution: 0,
    })
  }
  if (id === 'r01c00') {
    return Object.freeze({
      id,
      row,
      column,
      zone: 'industrial',
      landValueCents: 7_000,
      population: 0,
      pollution: 2,
    })
  }
  return Object.freeze({
    id,
    row,
    column,
    zone: 'unzoned',
    landValueCents: 5_000,
    population: 0,
    pollution: 0,
  })
}

export function createDefaultCityGrid(): CityGrid {
  const parcels: CityParcel[] = []
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      parcels.push(defaultParcel(row, column))
    }
  }
  return freezeCityGrid({
    schemaId: CITY_SIM_SCHEMA_ID,
    cityName: 'Civic Seed',
    rows: 4,
    columns: 4,
    tick: 0,
    treasuryCents: 100_000,
    taxRateBasisPoints: 1_000,
    population: 15,
    parcels,
  })
}

function safeIntegerIssue(value: number, label: string): string | null {
  return Number.isSafeInteger(value) ? null : `${label} must be a safe integer`
}

export function validateCityGrid(city: CityGrid): readonly string[] {
  const issues: string[] = []
  if (city.schemaId !== CITY_SIM_SCHEMA_ID) {
    issues.push(`Unsupported city schema ${String(city.schemaId)}`)
  }
  if (!city.cityName.trim()) issues.push('City name must not be empty')
  if (!Number.isSafeInteger(city.rows) || city.rows < 1 || city.rows > 100) {
    issues.push('City rows must be an integer between 1 and 100')
  }
  if (!Number.isSafeInteger(city.columns) || city.columns < 1 || city.columns > 100) {
    issues.push('City columns must be an integer between 1 and 100')
  }
  for (const issue of [
    safeIntegerIssue(city.tick, 'City tick'),
    safeIntegerIssue(city.treasuryCents, 'City treasury'),
    safeIntegerIssue(city.taxRateBasisPoints, 'City tax rate'),
    safeIntegerIssue(city.population, 'City population'),
  ]) {
    if (issue) issues.push(issue)
  }
  if (city.tick < 0) issues.push('City tick must not be negative')
  if (city.taxRateBasisPoints < 0 || city.taxRateBasisPoints > 10_000) {
    issues.push('City tax rate must be between 0 and 10000 basis points')
  }
  if (city.population < 0) issues.push('City population must not be negative')
  if (city.parcels.length !== city.rows * city.columns) {
    issues.push(`City parcel count must equal ${city.rows * city.columns}`)
  }

  const ids = new Set<string>()
  let expectedPreviousId = ''
  let aggregatePopulation = 0
  for (const parcel of city.parcels) {
    if (ids.has(parcel.id)) issues.push(`Duplicate parcel id ${parcel.id}`)
    ids.add(parcel.id)
    if (expectedPreviousId && parcel.id <= expectedPreviousId) {
      issues.push('City parcels must be sorted by ascending parcel id')
    }
    expectedPreviousId = parcel.id
    if (
      !Number.isSafeInteger(parcel.row)
      || !Number.isSafeInteger(parcel.column)
      || parcel.row < 0
      || parcel.row >= city.rows
      || parcel.column < 0
      || parcel.column >= city.columns
    ) {
      issues.push(`Parcel ${parcel.id} is outside the rectangular grid`)
    } else if (parcel.id !== cityParcelId(parcel.row, parcel.column)) {
      issues.push(`Parcel ${parcel.id} does not match its row and column`)
    }
    if (!isCityZone(parcel.zone)) {
      issues.push(`Parcel ${parcel.id} has unsupported zone ${String(parcel.zone)}`)
    }
    for (const issue of [
      safeIntegerIssue(parcel.landValueCents, `Parcel ${parcel.id} land value`),
      safeIntegerIssue(parcel.population, `Parcel ${parcel.id} population`),
      safeIntegerIssue(parcel.pollution, `Parcel ${parcel.id} pollution`),
    ]) {
      if (issue) issues.push(issue)
    }
    if (parcel.population < 0) issues.push(`Parcel ${parcel.id} population must not be negative`)
    if (parcel.pollution < 0) issues.push(`Parcel ${parcel.id} pollution must not be negative`)
    aggregatePopulation += parcel.population
  }
  if (!Number.isSafeInteger(aggregatePopulation) || aggregatePopulation !== city.population) {
    issues.push('City population must equal the sum of parcel populations')
  }
  return Object.freeze(issues)
}

export function assertValidCityGrid(city: CityGrid): void {
  const issues = validateCityGrid(city)
  if (issues.length > 0) throw new Error(`Invalid city grid: ${issues.join('; ')}`)
}

export function findCityParcel(city: CityGrid, parcelId: string): CityParcel | null {
  return city.parcels.find(parcel => parcel.id === parcelId) ?? null
}

export function zoneCityGridParcel(
  city: CityGrid,
  parcelId: string,
  requestedZone: unknown,
): CityMutationResult {
  const gridIssues = validateCityGrid(city)
  if (gridIssues.length > 0) {
    return Object.freeze({
      ok: false,
      city,
      error: Object.freeze({
        code: 'invalid-grid',
        message: `Zoning was not applied because the city grid is invalid: ${gridIssues[0]}`,
      }),
    })
  }
  const parcelIndex = city.parcels.findIndex(parcel => parcel.id === parcelId)
  if (parcelIndex < 0) {
    return Object.freeze({
      ok: false,
      city,
      error: Object.freeze({
        code: 'unknown-parcel',
        message: `Zoning was not applied because parcel ${parcelId || '(empty)'} does not exist.`,
      }),
    })
  }
  if (!isCityZoningType(requestedZone)) {
    return Object.freeze({
      ok: false,
      city,
      error: Object.freeze({
        code: 'unsupported-zone',
        message: `Zoning was not applied because ${String(requestedZone)} is not a supported zoning type.`,
      }),
    })
  }
  const current = city.parcels[parcelIndex]
  if (current.zone === requestedZone) {
    return Object.freeze({ ok: true, city, parcel: current })
  }
  const parcel = freezeParcel({ ...current, zone: requestedZone })
  const parcels = city.parcels.slice()
  parcels[parcelIndex] = parcel
  return Object.freeze({
    ok: true,
    city: freezeCityGrid({ ...city, parcels }),
    parcel,
  })
}

export function createZeroCostLog(operation: CityCostLog['operation']): CityCostLog {
  return Object.freeze({
    operation,
    model: 'none',
    prompt_tokens: 0,
    completion_tokens: 0,
    cache_hits: 0,
    estimated_cost_usd: 0,
  })
}
