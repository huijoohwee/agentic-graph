import { readQuote, stableJson, type MutationEvent, type Quote, type Rejection } from '../bundle/bundle-types'

type CachedOffer = Readonly<{ quote: Quote; fetchedAt: number; requestDigest: string }>

export type RequoteInput = Readonly<{
  event: MutationEvent
  legId: string
  category: string
  priorOfferId: string | null
  priorAmountMinor: number | null
}>

export class OfferCache {
  constructor(
    private readonly cacheName = 'knowgrph-travel-offers-v1',
    private readonly softTtlMs = 30_000,
    private readonly hardTtlMs = 60_000,
  ) {
    if (softTtlMs < 30_000 || hardTtlMs > 60_000 || softTtlMs > hardTtlMs) {
      throw new RangeError('Offer cache TTL must stay within 30–60 seconds.')
    }
  }

  async requote(input: RequoteInput, discovery: Fetcher, ctx: ExecutionContext): Promise<Quote | Rejection> {
    const identity = stableJson(input)
    const requestDigest = await sha256(identity)
    const cache = await caches.open(this.cacheName)
    const key = new Request(`https://offer-cache.invalid/${requestDigest}`)
    const cachedResponse = await cache.match(key)
    if (cachedResponse) {
      const cached = await readCachedOffer(cachedResponse, requestDigest)
      if (cached && Date.now() - cached.fetchedAt < this.softTtlMs) return cached.quote
    }
    const quote = await dispatchRequote(discovery, input)
    if (quote.kind === 'rejected') return quote
    const cached: CachedOffer = Object.freeze({ quote, fetchedAt: Date.now(), requestDigest })
    const response = Response.json(cached, {
      headers: { 'cache-control': `public, max-age=${Math.floor(this.hardTtlMs / 1000)}` },
    })
    ctx.waitUntil(cache.put(key, response))
    return quote
  }
}

async function dispatchRequote(discovery: Fetcher, input: RequoteInput): Promise<Quote | Rejection> {
  const response = await discovery.fetch(new Request('https://agent-registry.internal/v1/route-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-knowgrph-component': 'Reopt_Worker' },
    body: JSON.stringify({
      operation: 'routeIntent',
      intent: {
        intentId: `${input.event.eventId}:${input.legId}`,
        category: input.category,
        constraints: {
          bundle_id: input.event.bundleId,
          changed_leg_id: input.event.legId,
          prior_offer_id: input.priorOfferId,
          prior_amount_minor: input.priorAmountMinor,
        },
      },
    }),
  }))
  if (!response.ok) return { kind: 'rejected', reason: `requote-service-${response.status}` }
  return readQuote(await response.json(), input.legId)
}

async function readCachedOffer(response: Response, digest: string): Promise<CachedOffer | null> {
  try {
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    if (record.requestDigest !== digest || typeof record.fetchedAt !== 'number') return null
    if (!record.quote || typeof record.quote !== 'object' || Array.isArray(record.quote)) return null
    const legId = (record.quote as Record<string, unknown>).legId
    if (typeof legId !== 'string') return null
    const quote = readQuote(record.quote, legId)
    return quote.kind === 'offer'
      ? Object.freeze({ quote, fetchedAt: record.fetchedAt, requestDigest: digest })
      : null
  } catch {
    return null
  }
}

async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
