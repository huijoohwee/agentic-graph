import {
  DISCOVERY_CONTRACT,
  EXPERIENCE_AGENT_ID,
  EXPERIENCE_CATEGORY,
  MAX_REQUEST_BYTES,
  PROVIDER_CONTRACT,
  experienceIdentityKey,
  parseJsonBytes,
  parseRouteCatalogue,
  parseSearchResponse,
  parseVerifyResponse,
  readBoundedBytes,
  type DiscoveryRequest,
  type ExperienceIdentity,
  type ExperienceQuote,
  type ExperienceRoute,
  type ProviderOffer,
  type VerifiedProviderOffer,
} from './contract'

const MIN_TIMEOUT_MS = 100
const MAX_TIMEOUT_MS = 5_500
const MIN_RESPONSE_BYTES = 1_024
const MAX_RESPONSE_BYTES = 1024 * 1024
const MIN_TOKEN_BYTES = 16
const MAX_TOKEN_BYTES = 4_096
const SENTINEL_PATTERN = /(?:^|[._-])(?:change-?me|example|invalid|placeholder|replace-?with|sentinel|todo|unconfigured)(?:$|[._-])/i

export type ExperienceDiscoveryRuntimeEnv = ExperienceDiscoveryEnv & Readonly<{
  /** Configure out of band with `wrangler secret put`; never commit this value. */
  EXPERIENCE_PROVIDER_API_TOKEN?: string
}>

export type ProviderFetch = (request: Request) => Promise<Response>

export type ExperienceProviderConfig = Readonly<{
  providerId: string
  agentId: typeof EXPERIENCE_AGENT_ID
  searchEndpoint: URL
  verifyEndpoint: URL
  apiToken: string
  routes: Readonly<Record<string, ExperienceRoute>>
  timeoutMs: number
  readinessTimeoutMs: number
  maxResponseBytes: number
}>

export type ConfigurationResult = Readonly<
  | { ok: true; config: ExperienceProviderConfig }
  | { ok: false; fields: readonly string[] }
>

export type DiscoveryResult = Readonly<
  | { ok: true; quote: ExperienceQuote; attempted: 2; receivedOffers: number }
  | { ok: false; status: number; code: string; attempted: 0 | 1 | 2; receivedOffers?: number; fields?: readonly string[] }
>

const readString = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

const parsePositiveInteger = (value: unknown, minimum: number, maximum: number): number | null => {
  const text = readString(value)
  if (!/^(?:0|[1-9][0-9]*)$/.test(text)) return null
  const number = Number(text)
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null
}

const isSafeToken = (value: string): boolean => {
  const size = new TextEncoder().encode(value).byteLength
  return size >= MIN_TOKEN_BYTES && size <= MAX_TOKEN_BYTES
    && /^[\x21-\x7e]+$/.test(value) && !SENTINEL_PATTERN.test(value)
}

const isPublicProviderOrigin = (value: string): URL | null => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (
    url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.pathname !== '/'
    || url.search !== ''
    || url.hash !== ''
    || host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.endsWith('.invalid')
    || host.endsWith('.test')
    || host.endsWith('.example')
    || SENTINEL_PATTERN.test(host)
  ) return null
  return url
}

const resolveEndpoint = (base: URL | null, pathValue: unknown): URL | null => {
  if (!base) return null
  const path = readString(pathValue)
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,255}$/.test(path)
    || path.includes('..') || path.includes('//')) return null
  const endpoint = new URL(path, base)
  return endpoint.origin === base.origin && !endpoint.search && !endpoint.hash ? endpoint : null
}

export const readExperienceConfiguration = (
  env: ExperienceDiscoveryRuntimeEnv,
): ConfigurationResult => {
  const fields: string[] = []
  const providerId = readString(env.EXPERIENCE_PROVIDER_ID)
  const agentId = readString(env.EXPERIENCE_AGENT_ID)
  const base = isPublicProviderOrigin(readString(env.EXPERIENCE_PROVIDER_BASE_URL))
  const searchEndpoint = resolveEndpoint(base, env.EXPERIENCE_PROVIDER_SEARCH_PATH)
  const verifyEndpoint = resolveEndpoint(base, env.EXPERIENCE_PROVIDER_VERIFY_PATH)
  const apiToken = readString(env.EXPERIENCE_PROVIDER_API_TOKEN)
  const timeoutMs = parsePositiveInteger(env.EXPERIENCE_PROVIDER_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const readinessTimeoutMs = parsePositiveInteger(
    env.EXPERIENCE_READINESS_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  )
  const maxResponseBytes = parsePositiveInteger(
    env.EXPERIENCE_MAX_RESPONSE_BYTES,
    MIN_RESPONSE_BYTES,
    MAX_RESPONSE_BYTES,
  )
  if (!providerId || SENTINEL_PATTERN.test(providerId)) fields.push('EXPERIENCE_PROVIDER_ID')
  if (agentId !== EXPERIENCE_AGENT_ID) fields.push('EXPERIENCE_AGENT_ID')
  if (!base) fields.push('EXPERIENCE_PROVIDER_BASE_URL')
  if (!searchEndpoint) fields.push('EXPERIENCE_PROVIDER_SEARCH_PATH')
  if (!verifyEndpoint) fields.push('EXPERIENCE_PROVIDER_VERIFY_PATH')
  if (!isSafeToken(apiToken)) fields.push('EXPERIENCE_PROVIDER_API_TOKEN')
  if (timeoutMs === null) fields.push('EXPERIENCE_PROVIDER_TIMEOUT_MS')
  if (readinessTimeoutMs === null) fields.push('EXPERIENCE_READINESS_TIMEOUT_MS')
  if (maxResponseBytes === null) fields.push('EXPERIENCE_MAX_RESPONSE_BYTES')
  const catalogue = providerId && !SENTINEL_PATTERN.test(providerId)
    ? parseRouteCatalogue(readString(env.EXPERIENCE_ROUTE_CATALOGUE_JSON), providerId)
    : null
  if (!catalogue) fields.push('EXPERIENCE_ROUTE_CATALOGUE_JSON')
  if (fields.length > 0 || !searchEndpoint || !verifyEndpoint || !catalogue
    || timeoutMs === null || readinessTimeoutMs === null || maxResponseBytes === null) {
    return Object.freeze({ ok: false, fields: Object.freeze([...new Set(fields)]) })
  }
  return Object.freeze({
    ok: true,
    config: Object.freeze({
      providerId,
      agentId: EXPERIENCE_AGENT_ID,
      searchEndpoint,
      verifyEndpoint,
      apiToken,
      routes: catalogue,
      timeoutMs,
      readinessTimeoutMs,
      maxResponseBytes,
    }),
  })
}

const withDeadline = async <T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T | null> => {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(null)
    }, timeoutMs)
  })
  try {
    return await Promise.race([operation(controller.signal), timeout])
  } catch {
    return null
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

const providerJson = async (
  response: Response,
  maxBytes: number,
): Promise<unknown | null> => {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    if (response.body) await response.body.cancel('unsupported-content-type').catch(() => undefined)
    return null
  }
  const bytes = await readBoundedBytes(response.body, response.headers.get('content-length'), maxBytes)
  return bytes ? parseJsonBytes(bytes) : null
}

type ProviderCallResult = Readonly<{
  response: Response
  value: unknown | null
}>

const callProvider = async (
  endpoint: URL,
  payload: unknown,
  config: ExperienceProviderConfig,
  timeoutMs: number,
  fetchProvider: ProviderFetch,
): Promise<ProviderCallResult | null> => {
  const body = JSON.stringify(payload)
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) return null
  return withDeadline(timeoutMs, async (signal) => {
    const response = await fetchProvider(new Request(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${config.apiToken}`,
        'cache-control': 'no-store',
        'content-type': 'application/json',
        'x-knowgrph-component': 'Experience_Discovery_Adapter',
      },
      body,
    }))
    const value = await providerJson(response, config.maxResponseBytes)
    return Object.freeze({ response, value })
  })
}

const identityFromRoute = (route: ExperienceRoute): ExperienceIdentity => Object.freeze({
  catalogueId: route.catalogueId,
  location: route.location,
  serviceDate: route.serviceDate,
  startTimeLocal: route.startTimeLocal,
  providerId: route.providerId,
  productId: route.productId,
  party: route.party,
})

const providerFailure = (status: number): Readonly<{ status: number; code: string }> => {
  if (status === 429) return Object.freeze({ status: 429, code: 'provider-rate-limited' })
  if (status >= 500) return Object.freeze({ status: 503, code: 'provider-unavailable' })
  return Object.freeze({ status: 502, code: 'provider-rejected' })
}

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const toQuote = async (
  request: DiscoveryRequest,
  route: ExperienceRoute,
  verified: VerifiedProviderOffer,
): Promise<ExperienceQuote> => {
  const providerReferenceDigest = await sha256(verified.offer.offerReference)
  const verificationReferenceDigest = await sha256(verified.verificationReference)
  const identityDigest = await sha256(experienceIdentityKey(verified.offer.identity))
  const offerIdentityDigest = await sha256(JSON.stringify({
    providerId: route.providerId,
    providerReference: verified.offer.offerReference,
    experienceIdentity: experienceIdentityKey(verified.offer.identity),
  }))
  const party = route.party
  return Object.freeze({
    kind: 'offer',
    legId: request.legId,
    offerId: `experience_${offerIdentityDigest.slice(0, 32)}`,
    amountMinor: verified.offer.amountMinor,
    currency: route.expectedCurrency,
    priceVerification: 'verified',
    agentId: EXPERIENCE_AGENT_ID,
    promptTokens: 0,
    completionTokens: 0,
    dollarCost: 0,
    provenance: Object.freeze({
      provider: route.providerId,
      providerReference: verified.offer.offerReference,
      providerReferenceDigest,
      verificationReferenceDigest,
      verificationValidUntil: verified.verificationValidUntil,
      experienceIdentityDigest: identityDigest,
      catalogueId: route.catalogueId,
      locationId: route.location.locationId,
      locality: route.location.locality,
      timeZone: route.location.timeZone,
      serviceDate: route.serviceDate,
      startTimeLocal: route.startTimeLocal,
      productId: route.productId,
      party: `adults:${party.adults},children:${party.children},infants:${party.infants}`,
      currency: route.expectedCurrency,
      priceVerification: 'verified',
      inventoryState: 'not-held-until-order',
      bookability: 'verified-not-ordered',
      contractVersion: DISCOVERY_CONTRACT,
      providerContractVersion: PROVIDER_CONTRACT,
    }),
  })
}

export const discoverVerifiedExperience = async ({
  request,
  config,
  fetchProvider,
  timeoutMs = config.timeoutMs,
  nowMs = Date.now,
}: Readonly<{
  request: DiscoveryRequest
  config: ExperienceProviderConfig
  fetchProvider: ProviderFetch
  timeoutMs?: number
  nowMs?: () => number
}>): Promise<DiscoveryResult> => {
  const route = config.routes[request.legId]
  if (!route) return Object.freeze({
    ok: false,
    status: 503,
    code: 'provider-unconfigured',
    attempted: 0,
    fields: Object.freeze([`EXPERIENCE_ROUTE_CATALOGUE_JSON.${request.legId}`]),
  })
  const identity = identityFromRoute(route)
  const deadlineAt = Date.now() + timeoutMs
  const remainingMs = (): number => Math.max(0, deadlineAt - Date.now())
  const searchBudget = remainingMs()
  if (searchBudget < 1) return Object.freeze({ ok: false, status: 503, code: 'provider-timeout', attempted: 0 })
  const search = await callProvider(config.searchEndpoint, Object.freeze({
    operation: 'searchExperiences',
    contractVersion: PROVIDER_CONTRACT,
    identity,
  }), config, searchBudget, fetchProvider)
  if (!search) return Object.freeze({ ok: false, status: 503, code: 'provider-timeout', attempted: 1 })
  if (!search.response.ok) {
    const failure = providerFailure(search.response.status)
    return Object.freeze({ ok: false, ...failure, attempted: 1 })
  }
  const parsedSearch = parseSearchResponse(search.value, route)
  if (!parsedSearch) return Object.freeze({ ok: false, status: 502, code: 'provider-contract-violation', attempted: 1 })
  const candidates = [...parsedSearch.valid].sort((left, right) => (
    left.amountMinor - right.amountMinor || left.offerReference.localeCompare(right.offerReference)
  ))
  const selected: ProviderOffer | undefined = candidates[0]
  if (!selected) return Object.freeze({
    ok: false,
    status: parsedSearch.received === 0 ? 404 : 502,
    code: parsedSearch.received === 0 ? 'no-experiences-found' : 'provider-contract-violation',
    attempted: 1,
    receivedOffers: parsedSearch.received,
  })
  const verifyBudget = remainingMs()
  if (verifyBudget < 1) return Object.freeze({
    ok: false, status: 503, code: 'provider-timeout', attempted: 1, receivedOffers: parsedSearch.received,
  })
  const verification = await callProvider(config.verifyEndpoint, Object.freeze({
    operation: 'verifyExperience',
    contractVersion: PROVIDER_CONTRACT,
    offerReference: selected.offerReference,
    identity,
  }), config, verifyBudget, fetchProvider)
  if (!verification) return Object.freeze({
    ok: false, status: 503, code: 'provider-timeout', attempted: 2, receivedOffers: parsedSearch.received,
  })
  if (!verification.response.ok) {
    const failure = providerFailure(verification.response.status)
    return Object.freeze({ ok: false, ...failure, attempted: 2, receivedOffers: parsedSearch.received })
  }
  const verified = parseVerifyResponse(verification.value, route, selected, nowMs())
  if (!verified) return Object.freeze({
    ok: false,
    status: 502,
    code: 'provider-verification-invalid',
    attempted: 2,
    receivedOffers: parsedSearch.received,
  })
  return Object.freeze({
    ok: true,
    quote: await toQuote(request, route, verified),
    attempted: 2,
    receivedOffers: parsedSearch.received,
  })
}

export const probeExperienceCapability = async (
  config: ExperienceProviderConfig,
  fetchProvider: ProviderFetch,
  nowMs: () => number = Date.now,
): Promise<DiscoveryResult> => {
  const legId = Object.keys(config.routes).sort()[0]
  if (!legId) return Object.freeze({ ok: false, status: 503, code: 'provider-unconfigured', attempted: 0 })
  return discoverVerifiedExperience({
    request: Object.freeze({
      operation: 'discoverOffers',
      contractVersion: DISCOVERY_CONTRACT,
      agentId: EXPERIENCE_AGENT_ID,
      legId,
      intent: Object.freeze({
        intentId: `readiness:${legId}`,
        category: EXPERIENCE_CATEGORY,
        constraints: Object.freeze({
          bundle_id: 'readiness-probe',
          changed_leg_id: legId,
          prior_offer_id: null,
          prior_amount_minor: null,
        }),
      }),
    }),
    config,
    fetchProvider,
    timeoutMs: config.readinessTimeoutMs,
    nowMs,
  })
}
