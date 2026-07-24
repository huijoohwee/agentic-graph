import {
  createZeroCostLog,
  freezeCityGrid,
  validateCityGrid,
  type CityCostLog,
  type CityGrid,
  type CityParcel,
  type CityZone,
} from './citySimModel'

type CityTickCoefficient = Readonly<{
  populationDelta: number
  landValueDeltaCents: number
  pollutionDelta: number
}>

const CITY_TICK_COEFFICIENTS: Readonly<Record<CityZone, CityTickCoefficient>> =
  Object.freeze({
    unzoned: Object.freeze({
      populationDelta: 0,
      landValueDeltaCents: 0,
      pollutionDelta: 0,
    }),
    residential: Object.freeze({
      populationDelta: 2,
      landValueDeltaCents: 200,
      pollutionDelta: 0,
    }),
    commercial: Object.freeze({
      populationDelta: 1,
      landValueDeltaCents: 100,
      pollutionDelta: 0,
    }),
    industrial: Object.freeze({
      populationDelta: 0,
      landValueDeltaCents: -50,
      pollutionDelta: 1,
    }),
  })

export type CityTickDelta = Readonly<{
  tick: 1
  treasuryCents: number
  population: number
}>

export type CityTickError = Readonly<{
  code: 'invalid-source' | 'unsafe-candidate'
  message: string
}>

export type CityTickResult =
  | Readonly<{
      ok: true
      city: CityGrid
      delta: CityTickDelta
      costLog: CityCostLog
    }>
  | Readonly<{
      ok: false
      city: CityGrid
      error: CityTickError
      costLog: CityCostLog
    }>

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} is not a safe integer`)
  return value
}

function safeAdd(left: number, right: number, label: string): number {
  return requireSafeInteger(left + right, label)
}

function safeMultiply(left: number, right: number, label: string): number {
  return requireSafeInteger(left * right, label)
}

function advanceParcel(parcel: CityParcel): CityParcel {
  const coefficient = CITY_TICK_COEFFICIENTS[parcel.zone]
  return Object.freeze({
    ...parcel,
    landValueCents: safeAdd(
      parcel.landValueCents,
      coefficient.landValueDeltaCents,
      `${parcel.id} land value`,
    ),
    population: safeAdd(
      parcel.population,
      coefficient.populationDelta,
      `${parcel.id} population`,
    ),
    pollution: safeAdd(
      parcel.pollution,
      coefficient.pollutionDelta,
      `${parcel.id} pollution`,
    ),
  })
}

function failure(
  city: CityGrid,
  code: CityTickError['code'],
  message: string,
  costLog: CityCostLog,
): CityTickResult {
  return Object.freeze({
    ok: false,
    city,
    error: Object.freeze({ code, message }),
    costLog,
  })
}

export function advanceCityTick(city: CityGrid): CityTickResult {
  const costLog = createZeroCostLog('tick')
  const sourceIssues = validateCityGrid(city)
  if (sourceIssues.length > 0) {
    return failure(
      city,
      'invalid-source',
      `City tick was not applied: ${sourceIssues[0]}`,
      costLog,
    )
  }

  try {
    const parcels = city.parcels.map(advanceParcel)
    let population = 0
    let commercialCount = 0
    let industrialCount = 0
    let zonedCount = 0
    for (const parcel of parcels) {
      population = safeAdd(population, parcel.population, 'Total population')
      if (parcel.zone !== 'unzoned') zonedCount += 1
      if (parcel.zone === 'commercial') commercialCount += 1
      if (parcel.zone === 'industrial') industrialCount += 1
    }

    const taxProduct = safeMultiply(
      population,
      city.taxRateBasisPoints,
      'Population tax product',
    )
    const taxRevenueCents = requireSafeInteger(
      Math.floor(taxProduct / 100),
      'Tax revenue',
    )
    const commercialRevenueCents = safeMultiply(
      300,
      commercialCount,
      'Commercial revenue',
    )
    const industrialRevenueCents = safeMultiply(
      500,
      industrialCount,
      'Industrial revenue',
    )
    const zonedUpkeepCents = safeMultiply(100, zonedCount, 'Zoned upkeep')
    const treasuryDeltaCents = safeAdd(
      safeAdd(
        taxRevenueCents,
        commercialRevenueCents,
        'Tax and commercial revenue',
      ),
      safeAdd(
        industrialRevenueCents,
        -zonedUpkeepCents,
        'Industrial revenue and zoned upkeep',
      ),
      'Treasury delta',
    )
    const treasuryCents = safeAdd(
      city.treasuryCents,
      treasuryDeltaCents,
      'Treasury',
    )
    const tick = safeAdd(city.tick, 1, 'Tick')
    const candidate = freezeCityGrid({
      ...city,
      tick,
      treasuryCents,
      population,
      parcels,
    })
    const candidateIssues = validateCityGrid(candidate)
    if (candidateIssues.length > 0) {
      return failure(
        city,
        'unsafe-candidate',
        `City tick was not applied: ${candidateIssues[0]}`,
        costLog,
      )
    }
    return Object.freeze({
      ok: true,
      city: candidate,
      delta: Object.freeze({
        tick: 1 as const,
        treasuryCents: treasuryDeltaCents,
        population: population - city.population,
      }),
      costLog,
    })
  } catch (error) {
    return failure(
      city,
      'unsafe-candidate',
      `City tick was not applied: ${
        error instanceof Error ? error.message : String(error || 'unsafe candidate')
      }`,
      costLog,
    )
  }
}
