import {
  CITY_ZONING_TYPES,
  assertValidCityGrid,
  createZeroCostLog,
  findCityParcel,
  type CityAdviceScope,
  type CityAdvisorProposal,
  type CityAdvisorResult,
  type CityGrid,
  type CityParcel,
  type CityZoningType,
} from './citySimModel'

const DEFAULT_TIE_EPSILON = 25
const MAX_RETURNED_PROPOSALS = 12

export class CityAdvisorRequestError extends Error {
  readonly code: 'invalid-scope' | 'missing-parcel' | 'unknown-parcel'

  constructor(
    code: CityAdvisorRequestError['code'],
    message: string,
  ) {
    super(message)
    this.name = 'CityAdvisorRequestError'
    this.code = code
  }
}

type ScoredProposal = Omit<CityAdvisorProposal, 'clarifyRequired'>

function zoneCount(city: CityGrid, zone: CityZoningType): number {
  return city.parcels.filter(parcel => parcel.zone === zone).length
}

function immediateEconomyScore(
  city: CityGrid,
  zone: CityZoningType,
): number {
  if (zone === 'residential') {
    return 200 + Math.floor(2 * city.taxRateBasisPoints / 100) - 100
  }
  if (zone === 'commercial') {
    return 100 + Math.floor(city.taxRateBasisPoints / 100) + 300 - 100
  }
  return -50 + 500 - 100
}

function balanceScore(city: CityGrid, zone: CityZoningType): number {
  const counts = CITY_ZONING_TYPES.map(candidate => zoneCount(city, candidate))
  const current = zoneCount(city, zone)
  const leastRepresented = Math.min(...counts)
  return current === leastRepresented ? 120 : -40 * (current - leastRepresented)
}

function firstRoundScore(
  city: CityGrid,
  parcel: CityParcel,
  zone: CityZoningType,
): number {
  const pollutionPenalty = zone === 'industrial'
    ? (parcel.pollution + 1) * 75
    : parcel.pollution * 25
  return parcel.landValueCents
    + immediateEconomyScore(city, zone)
    + balanceScore(city, zone)
    - pollutionPenalty
}

function evolvedScore(
  city: CityGrid,
  parcel: CityParcel,
  zone: CityZoningType,
  score: number,
): number {
  const unzonedBonus = parcel.zone === 'unzoned' ? 50 : 0
  const existingZonePenalty = parcel.zone === zone ? 200 : 0
  const diversityBonus = zoneCount(city, zone) === 0 ? 100 : 0
  return score + unzonedBonus + diversityBonus - existingZonePenalty
}

function candidateParcels(
  city: CityGrid,
  scope: CityAdviceScope,
  selectedParcelId: string | null,
): readonly CityParcel[] {
  if (scope === 'district') return city.parcels
  if (!selectedParcelId) {
    throw new CityAdvisorRequestError(
      'missing-parcel',
      'Parcel advice requires a selected parcel.',
    )
  }
  const selected = findCityParcel(city, selectedParcelId)
  if (!selected) {
    throw new CityAdvisorRequestError(
      'unknown-parcel',
      `Parcel advice could not find ${selectedParcelId}.`,
    )
  }
  return Object.freeze([selected])
}

function rationale(
  parcel: CityParcel,
  zone: CityZoningType,
  score: number,
): string {
  return `Scores ${zone} for ${parcel.id} from land value ${parcel.landValueCents}, local zone balance, and the immediate v1 economy effect (${score}).`
}

function rankProposals(
  city: CityGrid,
  parcels: readonly CityParcel[],
  round: 1 | 2,
): readonly ScoredProposal[] {
  const proposals = parcels.flatMap(parcel =>
    CITY_ZONING_TYPES
      .filter(zone => zone !== parcel.zone)
      .map(zone => {
        const generated = firstRoundScore(city, parcel, zone)
        const score = round === 2
          ? evolvedScore(city, parcel, zone, generated)
          : generated
        if (!Number.isSafeInteger(score)) {
          throw new CityAdvisorRequestError(
            'invalid-scope',
            `Advisor score for ${parcel.id} is not a safe integer.`,
          )
        }
        return Object.freeze({
          id: `${parcel.id}:${zone}`,
          parcelId: parcel.id,
          recommendedZone: zone,
          score,
          rationale: rationale(parcel, zone, score),
          round,
          currentLandValueCents: parcel.landValueCents,
        })
      }),
  )
  return Object.freeze(proposals.sort((left, right) =>
    right.score - left.score || left.id.localeCompare(right.id),
  ))
}

function tieGroup(
  proposals: readonly ScoredProposal[],
  epsilon: number,
): readonly ScoredProposal[] {
  if (proposals.length < 2) return Object.freeze([])
  const topScore = proposals[0].score
  const tied = proposals.filter(proposal => topScore - proposal.score < epsilon)
  return tied.length > 1 ? Object.freeze(tied) : Object.freeze([])
}

function resolveTiedRecommendation(
  tied: readonly ScoredProposal[],
): ScoredProposal {
  return [...tied].sort((left, right) =>
    right.currentLandValueCents - left.currentLandValueCents
    || left.parcelId.localeCompare(right.parcelId)
    || left.id.localeCompare(right.id),
  )[0]
}

export function adviseCityZoning(
  city: CityGrid,
  input: Readonly<{
    scope: CityAdviceScope
    selectedParcelId?: string | null
    tieEpsilon?: number
  }>,
): CityAdvisorResult {
  assertValidCityGrid(city)
  if (input.scope !== 'parcel' && input.scope !== 'district') {
    throw new CityAdvisorRequestError(
      'invalid-scope',
      `Advisor scope ${String(input.scope)} is unsupported.`,
    )
  }
  const epsilon = input.tieEpsilon ?? DEFAULT_TIE_EPSILON
  if (!Number.isSafeInteger(epsilon) || epsilon < 0) {
    throw new CityAdvisorRequestError(
      'invalid-scope',
      'Advisor tie epsilon must be a non-negative safe integer.',
    )
  }
  const parcels = candidateParcels(
    city,
    input.scope,
    input.selectedParcelId ?? null,
  )
  const firstRound = rankProposals(city, parcels, 1)
  const firstTie = tieGroup(firstRound, epsilon)
  const rounds: 1 | 2 = firstTie.length > 0 ? 2 : 1
  const ranked = rounds === 2 ? rankProposals(city, parcels, 2) : firstRound
  const unresolvedTie = tieGroup(ranked, epsilon)
  const recommended = unresolvedTie.length > 0
    ? resolveTiedRecommendation(unresolvedTie)
    : ranked[0] ?? null
  const tiedIds = unresolvedTie.map(proposal => proposal.id)
  const proposals = ranked.slice(0, MAX_RETURNED_PROPOSALS).map(proposal =>
    Object.freeze({
      ...proposal,
      clarifyRequired: tiedIds.includes(proposal.id),
    }),
  )
  return Object.freeze({
    scope: input.scope,
    rounds,
    proposals: Object.freeze(proposals),
    recommendedProposalId: recommended?.id ?? null,
    clarifyRequired: unresolvedTie.length > 0,
    tieRetained: unresolvedTie.length > 0,
    tiedProposalIds: Object.freeze(tiedIds),
    costLog: createZeroCostLog('advisor'),
  })
}
