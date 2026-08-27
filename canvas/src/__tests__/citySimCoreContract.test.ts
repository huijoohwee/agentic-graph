import assert from 'node:assert/strict'
import {
  adviseCityZoning,
} from '@/features/game-city-sim/citySimAdvisor'
import {
  parseCityGridDocument,
  serializeCityGridDocument,
  verifyCityGridRoundTrip,
} from '@/features/game-city-sim/citySimCodec'
import { advanceCityTick } from '@/features/game-city-sim/citySimEconomy'
import { parseCitySimInvocation } from '@/features/game-city-sim/citySimInvocation'
import {
  freezeCityGrid,
  zoneCityGridParcel,
} from '@/features/game-city-sim/citySimModel'
import { parseCitySimAuthoredSource } from '@/features/game-city-sim/citySimAuthoredSource'
import {
  readAuthoritativeCitySimDocument,
  readAuthoritativeCitySimSource,
} from './citySimAuthoritativeSource'

export function testCitySimAuthoredSourceInitializesCanonicalPoiZoning() {
  const document = readAuthoritativeCitySimDocument()
  const parsed = parseCitySimAuthoredSource(document)
  assert.equal(parsed.ok, true)
  const { city } = parsed.source
  assert.equal(city.regionalPoiProfileId, 'adm0:SGP:major-pois/v1')
  assert.equal(city.rows, 2)
  assert.equal(city.columns, 3)
  assert.equal(city.parcels.length, 6)
  assert.deepEqual(city.parcels.map(parcel => parcel.id), [
    'marina-bay-sands',
    'singapore-flyer',
    'gardens-by-the-bay',
    'esplanade-theatres-on-the-bay',
    'the-fullerton-hotel',
    'raffles-hotel',
  ])
  assert.equal(city.tick, 0)
  assert.equal(city.treasuryCents, 100_000)
  assert.equal(city.taxRateBasisPoints, 1_000)
  assert.equal(city.population, 15)
  assert.equal(
    serializeCityGridDocument(readAuthoritativeCitySimSource().city),
    serializeCityGridDocument(city),
  )
  assert.equal(Object.isFrozen(city), true)

  for (const malformed of [
    document.replace('  id: "city-sim"', '  id: "flight-sim"'),
    document.replace(/^  regional_poi_profile_id: [^\n]+\n/m, ''),
    document.replace('  rows: 2', '  rows: 3'),
    document.replace('marina-bay-sands,0,0', 'r00c00,0,0'),
    document.replace('singapore-flyer,0,1', 'marina-bay-sands,0,1'),
  ]) {
    const rejected = parseCitySimAuthoredSource(malformed)
    assert.equal(rejected.ok, false)
  }
}

export function testCitySimTickIsDeterministicAndAtomicOnOverflow() {
  const source = readAuthoritativeCitySimSource().city
  const sourceBytes = serializeCityGridDocument(source)
  const first = advanceCityTick(source)
  const second = advanceCityTick(source)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  if (!first.ok || !second.ok) return
  assert.equal(serializeCityGridDocument(first.city), serializeCityGridDocument(second.city))
  assert.equal(serializeCityGridDocument(source), sourceBytes, 'tick must not mutate its input')
  assert.deepEqual(first.delta, {
    tick: 1,
    treasuryCents: 680,
    population: 3,
  })
  assert.equal(first.city.tick, 1)
  assert.equal(first.city.treasuryCents, 100_680)
  assert.equal(first.city.population, 18)
  assert.deepEqual(
    first.city.parcels.slice(0, 5).map(parcel => ({
      id: parcel.id,
      landValueCents: parcel.landValueCents,
      population: parcel.population,
      pollution: parcel.pollution,
    })),
    [
      { id: 'marina-bay-sands', landValueCents: 10_200, population: 12, pollution: 0 },
      { id: 'singapore-flyer', landValueCents: 9_100, population: 6, pollution: 0 },
      { id: 'gardens-by-the-bay', landValueCents: 5_000, population: 0, pollution: 0 },
      { id: 'esplanade-theatres-on-the-bay', landValueCents: 6_950, population: 0, pollution: 3 },
      { id: 'the-fullerton-hotel', landValueCents: 5_000, population: 0, pollution: 0 },
    ],
  )
  assert.deepEqual(first.costLog, {
    operation: 'tick',
    model: 'none',
    prompt_tokens: 0,
    completion_tokens: 0,
    cache_hits: 0,
    estimated_cost_usd: 0,
  })

  const overflowSource = freezeCityGrid({
    ...source,
    treasuryCents: Number.MAX_SAFE_INTEGER,
  })
  const overflowBytes = serializeCityGridDocument(overflowSource)
  const overflow = advanceCityTick(overflowSource)
  assert.equal(overflow.ok, false)
  assert.equal(overflow.city, overflowSource, 'failed tick must retain the original snapshot')
  assert.equal(serializeCityGridDocument(overflow.city), overflowBytes)
  if (!overflow.ok) assert.equal(overflow.error.code, 'unsafe-candidate')
}

export function testCitySimInvalidZoningDoesNotMutate() {
  const source = readAuthoritativeCitySimSource().city
  const sourceBytes = serializeCityGridDocument(source)
  const unsupported = zoneCityGridParcel(source, 'gardens-by-the-bay', 'unzoned')
  const unknown = zoneCityGridParcel(source, 'unknown-poi', 'residential')
  assert.equal(unsupported.ok, false)
  assert.equal(unknown.ok, false)
  assert.equal(unsupported.city, source)
  assert.equal(unknown.city, source)
  assert.equal(serializeCityGridDocument(source), sourceBytes)
  if (!unsupported.ok) assert.equal(unsupported.error.code, 'unsupported-zone')
  if (!unknown.ok) assert.equal(unknown.error.code, 'unknown-parcel')
}

export function testCitySimCodecCanonicalRoundTripRejectsMalformedBytes() {
  const source = readAuthoritativeCitySimSource().city
  const canonical = serializeCityGridDocument(source)
  const roundTrip = verifyCityGridRoundTrip(source)
  assert.equal(roundTrip.ok, true)
  if (roundTrip.ok) {
    assert.equal(roundTrip.document, canonical)
    assert.equal(serializeCityGridDocument(roundTrip.city), canonical)
  }

  const malformedDocuments = [
    canonical.replace(/\n/g, '\r\n'),
    `${canonical}\n`,
    canonical.replace('tick: 0\ntreasury_cents:', 'treasury_cents: 100000\ntick:'),
    canonical.replace('schema_id: agenticgraph-city-poi-zoning/v1', 'schema_id: unsupported/v2'),
    canonical.replace('tick: 0', 'tick: 00'),
    canonical.replace(
      'marina-bay-sands,0,0,residential,10000,10,0',
      'marina-bay-sands,0,0,residential,10000,10',
    ),
    canonical.replace(
      'marina-bay-sands,0,0,residential,10000,10,0',
      'marina-bay-sands,0,0,residential,10000,10,0\nmarina-bay-sands,0,0,residential,10000,10,0',
    ),
  ]
  for (const malformed of malformedDocuments) {
    const before = String(malformed)
    const parsed = parseCityGridDocument(malformed)
    assert.equal(parsed.ok, false, `expected malformed city bytes to fail: ${malformed}`)
    assert.equal(malformed, before, 'parser must preserve malformed input bytes')
  }
}

export function testCitySimAdvisorIsBoundedZeroCostAndClarifiesWithoutMutation() {
  const source = readAuthoritativeCitySimSource().city
  const sourceBytes = serializeCityGridDocument(source)
  const advice = adviseCityZoning(source, {
    scope: 'district',
    tieEpsilon: 1_000_000,
  })
  const repeated = adviseCityZoning(source, {
    scope: 'district',
    tieEpsilon: 1_000_000,
  })
  assert.ok(advice.rounds >= 1 && advice.rounds <= 2)
  assert.ok(advice.proposals.length > 0 && advice.proposals.length <= 12)
  assert.ok(advice.proposals.every(proposal => proposal.round <= 2))
  assert.equal(advice.clarifyRequired, true)
  assert.equal(advice.tieRetained, true)
  assert.ok(advice.tiedProposalIds.length > 1)
  assert.deepEqual(advice, repeated, 'local advisor must be deterministic')
  assert.deepEqual(advice.costLog, {
    operation: 'advisor',
    model: 'none',
    prompt_tokens: 0,
    completion_tokens: 0,
    cache_hits: 0,
    estimated_cost_usd: 0,
  })
  assert.equal(serializeCityGridDocument(source), sourceBytes)
}

export function testCitySimInvocationStrictlyRejectsAdversarialPayloads() {
  const accepted = parseCitySimInvocation(
    '/game.city @canvas #civic operation=zone parcel=gardens-by-the-bay type=residential',
  )
  assert.equal(accepted.ok, true)
  if (accepted.ok) {
    assert.deepEqual(accepted.invocation, {
      operation: 'zone',
      parcelId: 'gardens-by-the-bay',
      zoningType: 'residential',
      scope: null,
    })
  }

  const adversarialCases = [
    ['/game.city @canvas #civic operation=open {}', 'mixed-payload'],
    ['/game.city /game.city @canvas #civic operation=open', 'duplicate-sigil'],
    ['@canvas /game.city #civic operation=open', 'invalid-prefix'],
    ['/game.city @canvas #civic', 'missing-operation'],
    ['/game.city @canvas #civic operation=open operation=stop', 'duplicate-argument'],
    ['/game.city @canvas #civic operation==open', 'malformed-argument'],
    ['/game.city @canvas #civic operation=open extra=value', 'unknown-argument'],
    ['/game.city @canvas #civic operation=unknown', 'unsupported-operation'],
    ['/game.city @canvas #civic operation=zone parcel=Gardens-by-the-bay type=residential', 'invalid-parcel'],
    ['/game.city @canvas #civic operation=zone parcel=gardens-by-the-bay type=unzoned', 'unsupported-zone'],
    ['/game.city @canvas #civic operation=zone parcel=gardens-by-the-bay', 'missing-argument'],
    ['/game.city @canvas #civic operation=advise', 'missing-argument'],
    ['/game.city @canvas #civic operation=advise scope=region', 'unsupported-scope'],
    ['/game.city @canvas #civic operation=open parcel=marina-bay-sands', 'unexpected-argument'],
  ] as const
  for (const [input, expectedCode] of adversarialCases) {
    const result = parseCitySimInvocation(input)
    assert.equal(result.ok, false, `expected invocation rejection for ${input}`)
    if (!result.ok) assert.equal(result.error.code, expectedCode)
  }
}
