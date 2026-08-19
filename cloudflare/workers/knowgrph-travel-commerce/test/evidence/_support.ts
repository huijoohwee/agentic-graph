import fc, { type IAsyncProperty, type IProperty } from 'fast-check'
import { minorUnits, signedMinorUnits } from '../../../../../src/bundle/bundle-runtime'
import type { BundleSeed, Quote, RuntimeCascadeOutcome } from '../../../../../src/bundle/bundle-types'

export type EvidenceValue = string | number | boolean | null | readonly string[] | readonly number[]

export type EvidenceRecord = Readonly<{
  schema: 'knowgrph-travel-commerce-check-evidence/v1'
  check: string
  requirements: readonly string[]
  properties: readonly string[]
  status: 'passed'
  runtime: 'cloudflare-vitest-local'
  metrics: Readonly<Record<string, EvidenceValue>>
  seed?: number
  numRuns?: number
}>

export const DEMO_SEED: BundleSeed = Object.freeze({
  bundleId: 'demo-bundle-sin-nrt',
  principalId: 'demo-principal-local-only',
  totalBudgetMinor: minorUnits(5_000),
  legs: Object.freeze([
    leg('flight-sin-nrt', 'flight', 'flight-original', 1_200),
    leg('experience-tsukiji', 'experience', 'experience-original', 300),
    leg('transfer-ginza', 'transfer', 'transfer-original', 200),
    leg('hotel-shinjuku', 'hotel', 'hotel-original', 800),
  ]),
  edges: Object.freeze([
    Object.freeze({ fromLegId: 'flight-sin-nrt', toLegId: 'experience-tsukiji' }),
    Object.freeze({ fromLegId: 'experience-tsukiji', toLegId: 'transfer-ginza' }),
  ]),
})

export const DEMO_EVENT = Object.freeze({
  bundleId: DEMO_SEED.bundleId,
  legId: 'flight-sin-nrt',
  eventId: 'demo-flight-delay-001',
})

export function demoSeed(label: string, totalBudgetMinor: number = DEMO_SEED.totalBudgetMinor): BundleSeed {
  return Object.freeze({
    ...DEMO_SEED,
    bundleId: `${DEMO_SEED.bundleId}-${label}`,
    principalId: `${DEMO_SEED.principalId}-${label}`,
    totalBudgetMinor: minorUnits(totalBudgetMinor),
    legs: Object.freeze(DEMO_SEED.legs.map((item) => Object.freeze({
      ...item,
      principalId: `${DEMO_SEED.principalId}-${label}`,
    }))),
  })
}

export function emptyDemoSeed(label: string, totalBudgetMinor: number): BundleSeed {
  const seeded = demoSeed(label, totalBudgetMinor)
  return Object.freeze({
    ...seeded,
    legs: Object.freeze(seeded.legs.map((item) => Object.freeze({
      ...item,
      committedOfferId: null,
      committedAmountMinor: null,
    }))),
  })
}

export function quote(
  legId: string,
  amountMinor: number,
  suffix = 'replacement',
): Quote {
  return Object.freeze({
    kind: 'offer',
    legId,
    offerId: `${legId}-${suffix}`,
    amountMinor: minorUnits(amountMinor),
    currency: 'SGD',
    priceVerification: 'deterministic-demo',
    agentId: 'local-demo-discovery-double',
    promptTokens: 0,
    completionTokens: 0,
    dollarCost: 0,
    provenance: Object.freeze({ mode: 'deterministic-local-demo-double', currency: 'SGD' }),
  })
}

export function outcome(
  overrides: Omit<Partial<RuntimeCascadeOutcome>, 'netAmountMinor'> & { netAmountMinor?: number } = {},
): RuntimeCascadeOutcome {
  return Object.freeze({
    kind: 'committed',
    cascadeId: 'demo-bundle-sin-nrt:flight-sin-nrt:demo-flight-delay-001',
    bundleId: DEMO_SEED.bundleId,
    changedLegId: 'flight-sin-nrt',
    affected: Object.freeze(['experience-tsukiji', 'transfer-ginza']),
    changes: Object.freeze([
      Object.freeze({
        legId: 'experience-tsukiji', priorOfferId: 'experience-original', priorAmountMinor: minorUnits(300),
        newOfferId: 'experience-replacement', newAmountMinor: minorUnits(350), currency: 'SGD',
        priceVerification: 'deterministic-demo',
      }),
      Object.freeze({
        legId: 'transfer-ginza', priorOfferId: 'transfer-original', priorAmountMinor: minorUnits(200),
        newOfferId: 'transfer-replacement', newAmountMinor: minorUnits(225), currency: 'SGD',
        priceVerification: 'deterministic-demo',
      }),
    ]),
    settlementCalls: 1,
    reason: null,
    archiveDeferred: false,
    elapsedMs: 4,
    ...overrides,
    netAmountMinor: signedMinorUnits(overrides.netAmountMinor ?? 75),
  })
}

export function emitEvidence(
  check: string,
  requirements: readonly string[],
  metrics: Readonly<Record<string, EvidenceValue>>,
  properties: readonly string[] = [],
  propertyRun?: Readonly<{ seed: number; numRuns: number }>,
): EvidenceRecord {
  const record: EvidenceRecord = Object.freeze({
    schema: 'knowgrph-travel-commerce-check-evidence/v1',
    check,
    requirements: Object.freeze([...requirements]),
    properties: Object.freeze([...properties]),
    status: 'passed',
    runtime: 'cloudflare-vitest-local',
    metrics: Object.freeze({ ...metrics }),
    ...(propertyRun ? propertyRun : {}),
  })
  console.info(`TRAVEL_COMMERCE_EVIDENCE ${JSON.stringify(record)}`)
  return record
}

export function checkProperty<Ts>(
  check: string,
  numRuns: number,
  property: IProperty<Ts>,
): Readonly<{ seed: number; numRuns: number }> {
  const seed = seedFor(check)
  fc.assert(property, { seed, numRuns, verbose: true })
  return Object.freeze({ seed, numRuns })
}

export async function checkAsyncProperty<Ts>(
  check: string,
  numRuns: number,
  property: IAsyncProperty<Ts>,
): Promise<Readonly<{ seed: number; numRuns: number }>> {
  const seed = seedFor(check)
  await fc.assert(property, { seed, numRuns, verbose: true })
  return Object.freeze({ seed, numRuns })
}

export function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  return Number(sorted[Math.max(0, index)].toFixed(3))
}

export async function readIntentLegId(request: Request): Promise<string> {
  const value: unknown = await request.json()
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('route-intent-body-malformed')
  const intent = (value as Record<string, unknown>).intent
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw new Error('route-intent-missing')
  const intentId = (intent as Record<string, unknown>).intentId
  if (typeof intentId !== 'string') throw new Error('route-intent-id-missing')
  return intentId.split(':').at(-1) ?? ''
}

export class MapStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function leg(legId: string, category: string, committedOfferId: string, committedAmountMinor: number) {
  return Object.freeze({
    legId,
    principalId: 'demo-principal-local-only',
    category,
    committedOfferId,
    committedAmountMinor: minorUnits(committedAmountMinor),
    lastCascadeId: null,
  })
}

function seedFor(check: string): number {
  let value = 0x45d9f3b
  for (const character of check) value = Math.imul(value ^ character.charCodeAt(0), 0x45d9f3b)
  return Math.abs(value | 0) || 1
}
