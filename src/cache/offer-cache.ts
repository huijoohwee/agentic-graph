import { readQuote, stableJson } from '../bundle/bundle-runtime'
import type { MutationEvent, Quote, Rejection } from '../bundle/bundle-types'
import { readBoundedJson } from '../runtime/bounded-json'

type CachedOffer = Readonly<{ quote: Quote; fetchedAt: number; requestDigest: string }>
type BackgroundContext = Pick<ExecutionContext, 'waitUntil'> | Pick<DurableObjectState, 'waitUntil'>
const MAX_QUOTE_RESPONSE_BYTES = 64 * 1024

export type RequoteInput = Readonly<{
  event: MutationEvent
  legId: string
  category: string
  priorOfferId: string | null
  priorAmountMinor: number | null
}>

export class OfferCache {
  private readonly refreshes = new Map<string, Promise<Quote | Rejection>>()

  constructor(
    private readonly cacheName = 'agenticgraph-travel-offers-v1',
    private readonly softTtlMs = 30_000,
    private readonly hardTtlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {
    if (softTtlMs < 30_000 || hardTtlMs > 60_000 || softTtlMs > hardTtlMs) {
      throw new RangeError('Offer cache TTL must stay within 30–60 seconds.')
    }
  }

  async requote(input: RequoteInput, discovery: Fetcher, ctx: BackgroundContext): Promise<Quote | Rejection> {
    return this.resolve(input, discovery, ctx, false)
  }

  async advisoryRequote(
    input: RequoteInput,
    discovery: Fetcher,
    ctx: BackgroundContext,
  ): Promise<Quote | Rejection> {
    return this.resolve(input, discovery, ctx, true)
  }

  private async resolve(
    input: RequoteInput,
    discovery: Fetcher,
    ctx: BackgroundContext,
    allowStale: boolean,
  ): Promise<Quote | Rejection> {
    const identity = stableJson(input)
    const requestDigest = await sha256(identity)
    const key = new Request(`https://offer-cache.invalid/${requestDigest}`)
    let cache: Cache
    try {
      cache = await caches.open(this.cacheName)
    } catch {
      return dispatchRequote(discovery, input)
    }
    let cachedResponse: Response | undefined
    try { cachedResponse = await cache.match(key) } catch { /* advisory cache miss */ }
    if (cachedResponse) {
      const cached = await readCachedOffer(cachedResponse, requestDigest)
      if (cached) {
        const age = this.now() - cached.fetchedAt
        if (age >= 0 && age < this.softTtlMs) return cached.quote
        if (allowStale && age >= 0 && age < this.hardTtlMs) {
          const revalidation = this.refresh(input, discovery, cache, key, requestDigest)
          ctx.waitUntil(revalidation.then(() => undefined, (error: unknown) => {
            console.error(JSON.stringify({
              level: 'error', message: 'offer cache revalidation failed', requestDigest,
              reason: error instanceof Error ? error.message : 'cache-revalidation-failed',
            }))
          }))
          return cached.quote
        }
      }
    }
    return this.refresh(input, discovery, cache, key, requestDigest)
  }

  private refresh(
    input: RequoteInput,
    discovery: Fetcher,
    cache: Cache,
    key: Request,
    requestDigest: string,
  ): Promise<Quote | Rejection> {
    const refreshKey = `${this.cacheName}:${requestDigest}`
    const existing = this.refreshes.get(refreshKey)
    if (existing) return existing
    const refresh = this.fetchAndStore(input, discovery, cache, key, requestDigest)
    this.refreshes.set(refreshKey, refresh)
    const cleanup = () => {
      if (this.refreshes.get(refreshKey) === refresh) this.refreshes.delete(refreshKey)
    }
    void refresh.then(cleanup, cleanup)
    return refresh
  }

  private async fetchAndStore(
    input: RequoteInput,
    discovery: Fetcher,
    cache: Cache,
    key: Request,
    requestDigest: string,
  ): Promise<Quote | Rejection> {
    const quote = await dispatchRequote(discovery, input)
    if (quote.kind === 'rejected') return quote
    const cached: CachedOffer = Object.freeze({ quote, fetchedAt: this.now(), requestDigest })
    const response = Response.json(cached, {
      headers: {
        'cache-control': `public, max-age=${Math.floor(this.hardTtlMs / 1000)}, stale-while-revalidate=${Math.floor((this.hardTtlMs - this.softTtlMs) / 1000)}`,
      },
    })
    try {
      const current = await cache.match(key)
      const currentOffer = current ? await readCachedOffer(current, requestDigest) : null
      if (!currentOffer || currentOffer.fetchedAt <= cached.fetchedAt) await cache.put(key, response)
    } catch { /* Cache API is advisory; the fresh discovery result still wins. */ }
    return quote
  }
}

async function dispatchRequote(discovery: Fetcher, input: RequoteInput): Promise<Quote | Rejection> {
  const response = await discovery.fetch(new Request('https://agent-registry.internal/v1/route-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agenticgraph-component': 'Reopt_Worker' },
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
  return readQuote(await readBoundedJson(response, MAX_QUOTE_RESPONSE_BYTES), input.legId)
}

async function readCachedOffer(response: Response, digest: string): Promise<CachedOffer | null> {
  try {
    const value = await readBoundedJson(response, MAX_QUOTE_RESPONSE_BYTES)
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
