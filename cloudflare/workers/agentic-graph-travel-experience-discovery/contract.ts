export const DISCOVERY_CONTRACT = 'agentic-graph.travel-discovery/v1'
export const PROVIDER_CONTRACT = 'agentic-graph.live-experience-provider/v1'
export const DISCOVERY_PATH = '/v1/requote'
export const LIVE_PATH = '/livez'
export const READY_PATH = '/readyz'
export const EXPERIENCE_CATEGORY = 'experience'
export const EXPERIENCE_AGENT_ID = 'agent-experience'
export const REGISTRY_COMPONENT = 'Agent_Registry'

export const MAX_REQUEST_BYTES = 16 * 1024
export const MAX_CATALOGUE_BYTES = 64 * 1024
export const MAX_PROVIDER_OFFERS = 50

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const INTENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,256}$/
const PROVIDER_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:~/-]{0,511}$/
const COUNTRY_PATTERN = /^[A-Z]{2}$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const TIME_ZONE_PATTERN = /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/

export type ExperienceParty = Readonly<{
  adults: number
  children: number
  infants: number
}>

export type ExperienceLocation = Readonly<{
  locationId: string
  countryCode: string
  locality: string
  timeZone: string
}>

export type ExperienceIdentity = Readonly<{
  catalogueId: string
  location: ExperienceLocation
  serviceDate: string
  startTimeLocal: string
  providerId: string
  productId: string
  party: ExperienceParty
}>

export type ExperienceRoute = ExperienceIdentity & Readonly<{
  expectedCurrency: string
}>

export type DiscoveryRequest = Readonly<{
  operation: 'discoverOffers'
  contractVersion: typeof DISCOVERY_CONTRACT
  agentId: typeof EXPERIENCE_AGENT_ID
  legId: string
  intent: Readonly<{
    intentId: string
    category: typeof EXPERIENCE_CATEGORY
    constraints: Readonly<{
      bundle_id: string
      changed_leg_id: string
      prior_offer_id: string | null
      prior_amount_minor: number | null
    }>
  }>
}>

export type ProviderOffer = Readonly<{
  offerReference: string
  identity: ExperienceIdentity
  currency: string
  amountMinor: number
  available: true
}>

export type VerifiedProviderOffer = Readonly<{
  verificationReference: string
  verificationValidUntil: string
  offer: ProviderOffer
}>

export type ExperienceQuote = Readonly<{
  kind: 'offer'
  legId: string
  offerId: string
  amountMinor: number
  currency: string
  priceVerification: 'verified'
  agentId: typeof EXPERIENCE_AGENT_ID
  promptTokens: 0
  completionTokens: 0
  dollarCost: 0
  provenance: Readonly<Record<string, string>>
}>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value)
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key))
}

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && IDENTIFIER_PATTERN.test(value)

const isProviderReference = (value: unknown): value is string =>
  typeof value === 'string' && PROVIDER_REFERENCE_PATTERN.test(value)

const isRealDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const normalized = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0))
  return normalized.getUTCFullYear() === year
    && normalized.getUTCMonth() === month - 1
    && normalized.getUTCDate() === day
}

const parseParty = (value: unknown): ExperienceParty | null => {
  if (!isRecord(value) || !hasExactKeys(value, ['adults', 'children', 'infants'])) return null
  const counts = [value.adults, value.children, value.infants]
  if (counts.some((count) => typeof count !== 'number' || !Number.isSafeInteger(count))) return null
  const adults = value.adults as number
  const children = value.children as number
  const infants = value.infants as number
  const total = adults + children + infants
  if (adults < 1 || adults > 20 || children < 0 || children > 20
    || infants < 0 || infants > 20 || total > 20) return null
  return Object.freeze({ adults, children, infants })
}

const parseLocation = (value: unknown): ExperienceLocation | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'locationId', 'countryCode', 'locality', 'timeZone',
  ])) return null
  if (
    !isIdentifier(value.locationId)
    || typeof value.countryCode !== 'string'
    || !COUNTRY_PATTERN.test(value.countryCode)
    || typeof value.locality !== 'string'
    || value.locality !== value.locality.trim()
    || value.locality.length < 1
    || value.locality.length > 128
    || /[\u0000-\u001f\u007f]/.test(value.locality)
    || typeof value.timeZone !== 'string'
    || !TIME_ZONE_PATTERN.test(value.timeZone)
  ) return null
  return Object.freeze({
    locationId: value.locationId,
    countryCode: value.countryCode,
    locality: value.locality,
    timeZone: value.timeZone,
  })
}

export const parseExperienceIdentity = (value: unknown): ExperienceIdentity | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'catalogueId', 'location', 'serviceDate', 'startTimeLocal',
    'providerId', 'productId', 'party',
  ])) return null
  const location = parseLocation(value.location)
  const party = parseParty(value.party)
  if (
    !isIdentifier(value.catalogueId)
    || !location
    || !isRealDate(value.serviceDate)
    || typeof value.startTimeLocal !== 'string'
    || !LOCAL_TIME_PATTERN.test(value.startTimeLocal)
    || !isIdentifier(value.providerId)
    || !isIdentifier(value.productId)
    || !party
  ) return null
  return Object.freeze({
    catalogueId: value.catalogueId,
    location,
    serviceDate: value.serviceDate,
    startTimeLocal: value.startTimeLocal,
    providerId: value.providerId,
    productId: value.productId,
    party,
  })
}

export const experienceIdentityKey = (identity: ExperienceIdentity): string => JSON.stringify({
  catalogueId: identity.catalogueId,
  location: identity.location,
  serviceDate: identity.serviceDate,
  startTimeLocal: identity.startTimeLocal,
  providerId: identity.providerId,
  productId: identity.productId,
  party: identity.party,
})

export const parseRouteCatalogue = (
  encoded: string,
  providerId: string,
): Readonly<Record<string, ExperienceRoute>> | null => {
  if (new TextEncoder().encode(encoded).byteLength > MAX_CATALOGUE_BYTES) return null
  let value: unknown
  try {
    value = JSON.parse(encoded)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const entries = Object.entries(value)
  if (entries.length < 1 || entries.length > 100) return null
  const routes: Record<string, ExperienceRoute> = {}
  for (const [legId, candidate] of entries) {
    if (!isIdentifier(legId) || !isRecord(candidate) || !hasExactKeys(candidate, [
      'catalogueId', 'location', 'serviceDate', 'startTimeLocal',
      'providerId', 'productId', 'party', 'expectedCurrency',
    ])) return null
    const identity = parseExperienceIdentity({
      catalogueId: candidate.catalogueId,
      location: candidate.location,
      serviceDate: candidate.serviceDate,
      startTimeLocal: candidate.startTimeLocal,
      providerId: candidate.providerId,
      productId: candidate.productId,
      party: candidate.party,
    })
    if (!identity || identity.providerId !== providerId
      || typeof candidate.expectedCurrency !== 'string'
      || !CURRENCY_PATTERN.test(candidate.expectedCurrency)) return null
    routes[legId] = Object.freeze({ ...identity, expectedCurrency: candidate.expectedCurrency })
  }
  return Object.freeze(routes)
}

export const parseDiscoveryRequest = (value: unknown): DiscoveryRequest | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'operation', 'contractVersion', 'agentId', 'legId', 'intent',
  ])) return null
  if (
    value.operation !== 'discoverOffers'
    || value.contractVersion !== DISCOVERY_CONTRACT
    || value.agentId !== EXPERIENCE_AGENT_ID
    || !isIdentifier(value.legId)
    || !isRecord(value.intent)
    || !hasExactKeys(value.intent, ['intentId', 'category', 'constraints'])
  ) return null
  const intent = value.intent
  if (
    typeof intent.intentId !== 'string'
    || !INTENT_ID_PATTERN.test(intent.intentId)
    || !intent.intentId.endsWith(`:${value.legId}`)
    || intent.category !== EXPERIENCE_CATEGORY
    || !isRecord(intent.constraints)
    || !hasExactKeys(intent.constraints, [
      'bundle_id', 'changed_leg_id', 'prior_offer_id', 'prior_amount_minor',
    ])
  ) return null
  const constraints = intent.constraints
  const priorAmount = constraints.prior_amount_minor
  if (
    !isIdentifier(constraints.bundle_id)
    || !isIdentifier(constraints.changed_leg_id)
    || !(constraints.prior_offer_id === null || isIdentifier(constraints.prior_offer_id))
    || !(priorAmount === null || (
      typeof priorAmount === 'number' && Number.isSafeInteger(priorAmount) && priorAmount >= 0
    ))
  ) return null
  return Object.freeze({
    operation: 'discoverOffers',
    contractVersion: DISCOVERY_CONTRACT,
    agentId: EXPERIENCE_AGENT_ID,
    legId: value.legId,
    intent: Object.freeze({
      intentId: intent.intentId,
      category: EXPERIENCE_CATEGORY,
      constraints: Object.freeze({
        bundle_id: constraints.bundle_id,
        changed_leg_id: constraints.changed_leg_id,
        prior_offer_id: constraints.prior_offer_id,
        prior_amount_minor: priorAmount,
      }),
    }),
  })
}

const parseProviderOffer = (
  value: unknown,
  route: ExperienceRoute,
): ProviderOffer | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'offerReference', 'identity', 'currency', 'amountMinor', 'available',
  ])) return null
  const identity = parseExperienceIdentity(value.identity)
  if (
    !isProviderReference(value.offerReference)
    || !identity
    || experienceIdentityKey(identity) !== experienceIdentityKey(route)
    || value.currency !== route.expectedCurrency
    || typeof value.amountMinor !== 'number'
    || !Number.isSafeInteger(value.amountMinor)
    || value.amountMinor < 0
    || value.available !== true
  ) return null
  return Object.freeze({
    offerReference: value.offerReference,
    identity,
    currency: route.expectedCurrency,
    amountMinor: value.amountMinor,
    available: true,
  })
}

export const parseSearchResponse = (
  value: unknown,
  route: ExperienceRoute,
): Readonly<{ valid: readonly ProviderOffer[]; received: number }> | null => {
  if (!isRecord(value) || !hasExactKeys(value, ['contractVersion', 'status', 'offers'])
    || value.contractVersion !== PROVIDER_CONTRACT || value.status !== 'ok'
    || !Array.isArray(value.offers) || value.offers.length > MAX_PROVIDER_OFFERS) return null
  const parsed = value.offers.map((offer) => parseProviderOffer(offer, route))
  if (parsed.some((offer) => offer === null)) return null
  return Object.freeze({
    valid: Object.freeze(parsed.filter((offer): offer is ProviderOffer => offer !== null)),
    received: value.offers.length,
  })
}

export const parseVerifyResponse = (
  value: unknown,
  route: ExperienceRoute,
  selected: ProviderOffer,
  nowMs: number,
): VerifiedProviderOffer | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'contractVersion', 'status', 'verificationReference', 'verificationValidUntil', 'offer',
  ])) return null
  const offer = parseProviderOffer(value.offer, route)
  const validUntilMs = typeof value.verificationValidUntil === 'string'
    ? Date.parse(value.verificationValidUntil)
    : Number.NaN
  if (
    value.contractVersion !== PROVIDER_CONTRACT
    || value.status !== 'verified'
    || !isProviderReference(value.verificationReference)
    || typeof value.verificationValidUntil !== 'string'
    || value.verificationValidUntil.length > 64
    || !Number.isFinite(validUntilMs)
    || validUntilMs <= nowMs
    || validUntilMs > nowMs + 24 * 60 * 60 * 1_000
    || !offer
    || offer.offerReference !== selected.offerReference
  ) return null
  return Object.freeze({
    verificationReference: value.verificationReference,
    verificationValidUntil: value.verificationValidUntil,
    offer,
  })
}

export const parseJsonBytes = (bytes: Uint8Array): unknown | null => {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return null
  }
}

export const readBoundedBytes = async (
  body: ReadableStream<Uint8Array> | null,
  contentLength: string | null,
  maxBytes: number,
): Promise<Uint8Array | null> => {
  const declared = contentLength === null ? null : Number(contentLength)
  if (declared !== null && (!Number.isSafeInteger(declared) || declared < 0 || declared > maxBytes)) {
    if (body) await body.cancel('declared-body-size-invalid').catch(() => undefined)
    return null
  }
  if (!body) return null
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > maxBytes) {
        await reader.cancel('body-too-large')
        return null
      }
      chunks.push(next.value)
    }
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
  if (declared !== null && declared !== size) return null
  const joined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined
}
