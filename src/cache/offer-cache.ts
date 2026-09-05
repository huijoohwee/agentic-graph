import { readQuote, stableJson } from '../bundle/bundle-runtime'
import type { MutationEvent, Quote, Rejection } from '../bundle/bundle-types'
import { readBoundedJson } from '../runtime/bounded-json'

type CachedOffer = Readonly<{ quote: Quote; fetchedAt: number; requestDigest: string }>
type Refresh = { promise: Promise<Quote | Rejection>; controller: AbortController; subscribers: number }
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
  private readonly refreshes = new Map<string, Refresh>()
  private readonly publications = new Set<string>()
  private publicationEpoch = {}
  private cacheUsable = true

  constructor(
    private readonly cacheName = 'agentic-graph-travel-offers-v1',
    private readonly softTtlMs = 30_000,
    private readonly hardTtlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {
    if (softTtlMs < 30_000 || hardTtlMs > 60_000 || softTtlMs > hardTtlMs) {
      throw new RangeError('Offer cache TTL must stay within 30–60 seconds.')
    }
  }

  async requote(
    input: RequoteInput, discovery: Fetcher, ctx: BackgroundContext, signal?: AbortSignal,
  ): Promise<Quote | Rejection> {
    return this.resolve(input, discovery, ctx, false, signal)
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
    signal?: AbortSignal,
  ): Promise<Quote | Rejection> {
    signal?.throwIfAborted()
    if (!this.cacheUsable) return dispatchRequote(discovery, input, signal)
    const identity = stableJson(input)
    const requestDigest = await sha256(identity)
    signal?.throwIfAborted()
    const key = new Request(`https://offer-cache.invalid/${requestDigest}`)
    let cache: Cache
    try {
      cache = await caches.open(this.cacheName)
    } catch {
      return dispatchRequote(discovery, input, signal)
    }
    signal?.throwIfAborted()
    let cachedResponse: Response | undefined
    const readEpoch = this.publicationEpoch
    try { cachedResponse = await cache.match(key) } catch { /* advisory cache miss */ }
    signal?.throwIfAborted()
    if (cachedResponse && readEpoch === this.publicationEpoch && !this.publications.has(requestDigest) && this.cacheUsable) {
      const cached = await readCachedOffer(cachedResponse, requestDigest)
      signal?.throwIfAborted()
      if (cached && readEpoch === this.publicationEpoch && !this.publications.has(requestDigest) && this.cacheUsable) {
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
    return this.refresh(input, discovery, cache, key, requestDigest, signal)
  }

  private refresh(
    input: RequoteInput,
    discovery: Fetcher,
    cache: Cache,
    key: Request,
    requestDigest: string,
    signal?: AbortSignal,
  ): Promise<Quote | Rejection> {
    signal?.throwIfAborted()
    const refreshKey = `${this.cacheName}:${requestDigest}`
    let refresh = this.refreshes.get(refreshKey)
    if (!refresh) {
      const controller = new AbortController()
      refresh = {
        controller, subscribers: 0,
        promise: Promise.resolve().then(() =>
          this.fetchAndStore(input, discovery, cache, key, requestDigest, controller.signal)),
      }
      this.refreshes.set(refreshKey, refresh)
      const cleanup = () => {
        if (this.refreshes.get(refreshKey) === refresh) this.refreshes.delete(refreshKey)
      }
      void refresh.promise.then(cleanup, cleanup)
    }
    return this.subscribe(refreshKey, refresh, signal)
  }

  private subscribe(key: string, refresh: Refresh, signal?: AbortSignal): Promise<Quote | Rejection> {
    refresh.subscribers += 1
    return new Promise((resolve, reject) => {
      let active = true
      const release = () => {
        if (!active) return false
        active = false
        signal?.removeEventListener('abort', abort)
        refresh.subscribers -= 1
        return true
      }
      const abort = () => {
        if (!release()) return
        reject(signal?.reason)
        if (refresh.subscribers === 0) {
          if (this.refreshes.get(key) === refresh) this.refreshes.delete(key)
          refresh.controller.abort(signal?.reason)
        }
      }
      signal?.addEventListener('abort', abort, { once: true })
      void refresh.promise.then(
        (quote) => { if (release()) resolve(quote) },
        (error: unknown) => { if (release()) reject(error) },
      )
    })
  }

  private async fetchAndStore(
    input: RequoteInput,
    discovery: Fetcher,
    cache: Cache,
    key: Request,
    requestDigest: string,
    signal: AbortSignal,
  ): Promise<Quote | Rejection> {
    const quote = await dispatchRequote(discovery, input, signal)
    signal.throwIfAborted()
    if (quote.kind === 'rejected') return quote
    // Cache.put cannot be canceled. Do not queue fresh callers behind an older
    // publication, or let them race its eventual write/cleanup.
    if (this.publications.has(requestDigest) || !this.cacheUsable) return quote
    const cached: CachedOffer = Object.freeze({ quote, fetchedAt: this.now(), requestDigest })
    const response = Response.json(cached, {
      headers: {
        'cache-control': `public, max-age=${Math.floor(this.hardTtlMs / 1000)}, stale-while-revalidate=${Math.floor((this.hardTtlMs - this.softTtlMs) / 1000)}`,
      },
    })
    this.publications.add(requestDigest)
    this.publicationEpoch = {}
    let writeStarted = false
    try {
      const current = await cache.match(key)
      const currentOffer = current ? await readCachedOffer(current, requestDigest) : null
      signal.throwIfAborted()
      if (this.cacheUsable && (!currentOffer || currentOffer.fetchedAt <= cached.fetchedAt)) {
        writeStarted = true
        await cache.put(key, response)
      }
    } catch { /* Cache API is advisory; the fresh discovery result still wins. */ }
    finally {
      if (signal.aborted && writeStarted) {
        try { await cache.delete(key) } catch {
          // Uncertain cleanup disables cache reuse for this instance; discovery
          // remains available and the questionable value cannot satisfy a quote.
          this.cacheUsable = false
        }
      }
      this.publications.delete(requestDigest)
      this.publicationEpoch = {}
    }
    signal.throwIfAborted()
    return quote
  }
}

async function dispatchRequote(
  discovery: Fetcher, input: RequoteInput, signal?: AbortSignal,
): Promise<Quote | Rejection> {
  signal?.throwIfAborted()
  const response = await discovery.fetch(new Request('https://agent-registry.internal/v1/route-intent', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-agentic-graph-component': 'Reopt_Worker' },
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
  signal?.throwIfAborted()
  if (!response.ok) return { kind: 'rejected', reason: `requote-service-${response.status}` }
  const value = await readBoundedJson(response, MAX_QUOTE_RESPONSE_BYTES)
  signal?.throwIfAborted()
  return readQuote(value, input.legId)
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
