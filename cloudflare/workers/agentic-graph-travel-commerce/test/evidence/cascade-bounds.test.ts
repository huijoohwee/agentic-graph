import { createExecutionContext, reset } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfferCache } from '../../../../../src/cache/offer-cache'
import { dispatchAffectedSet } from '../../../../../src/bundle/reopt-dispatch'
import { demoSeed, emitEvidence, readIntentLegId } from './_support'
import { initialize } from './_runtime'

afterEach(() => { vi.restoreAllMocks(); return reset() })

describe('check:cascade-bounds evidence', () => {
  it('fans out before waiting, records counts, and fails closed at the wall-clock cap', async () => {
    const seed = demoSeed('cascade-bounds')
    const { graph } = await initialize(seed)
    const begin = await graph.beginCascade({ bundleId: seed.bundleId, legId: 'flight-sin-nrt', eventId: 'bounds-success' })
    expect(begin.kind).toBe('plan')
    if (begin.kind !== 'plan') throw new Error('expected cascade plan')
    const delays = new Map([['experience-tsukiji', 80], ['transfer-ginza', 120]])
    const concurrency = { active: 0, maximum: 0 }
    const fetcher = discoveryDouble(delays, concurrency)
    const started = performance.now()
    const result = await dispatchAffectedSet(
      begin.record,
      seed.legs,
      fetcher,
      createExecutionContext(),
      Date.now() + 1_000,
      new OfferCache('bounds-success-cache'),
    )
    const elapsedMs = performance.now() - started
    expect(result).toMatchObject({ kind: 'quoted', quoteCount: 2, rejectCount: 0 })
    expect(concurrency.maximum).toBe(2)
    expect(await graph.rollbackCascade(begin.record.cascadeId, 'evidence-success-cleanup')).toMatchObject({ kind: 'rolled-back' })
    await graph.confirmRollbackRelease(begin.record.cascadeId)

    const timeoutBegin = await graph.beginCascade({ bundleId: seed.bundleId, legId: 'flight-sin-nrt', eventId: 'bounds-timeout' })
    expect(timeoutBegin.kind).toBe('plan')
    if (timeoutBegin.kind !== 'plan') throw new Error('expected timeout cascade plan')
    let expiredFetches = 0
    const expired = await dispatchAffectedSet(timeoutBegin.record, seed.legs, {
      fetch: async () => { expiredFetches += 1; return Response.json({}) },
      connect() { throw new Error('not-supported') },
    }, createExecutionContext(), Date.now() - 1)
    expect(expired).toMatchObject({ kind: 'rejected', reason: 'cascade-timeout' })
    expect(expiredFetches).toBe(0)
    const stopped = { active: 0, maximum: 0, aborted: 0 }
    const timeout = await dispatchAffectedSet(
      timeoutBegin.record,
      seed.legs,
      discoveryDouble(new Map([['experience-tsukiji', 100], ['transfer-ginza', 100]]), stopped),
      createExecutionContext(),
      Date.now() + 40,
      new OfferCache('bounds-timeout-cache'),
    )
    expect(timeout).toMatchObject({ kind: 'rejected', reason: 'cascade-timeout', quoteCount: 2 })
    expect(stopped).toEqual({ active: 0, maximum: 2, aborted: 2 })
    expect(await graph.rollbackCascade(timeoutBegin.record.cascadeId, 'evidence-timeout-cleanup')).toMatchObject({ kind: 'rolled-back' })
    await graph.confirmRollbackRelease(timeoutBegin.record.cascadeId)
    emitEvidence('check:cascade-bounds', ['6.1', '6.2', '6.3', '6.4', '6.5', '6.7'], {
      quoteCount: result.quoteCount,
      rejectCount: result.rejectCount,
      slowestQuoteMs: 120,
      sequentialQuoteSumMs: 200,
      observedFanOutElapsedMs: Number(elapsedMs.toFixed(3)),
      maxConcurrentQuoteRequests: concurrency.maximum,
      timeoutReason: timeout.kind === 'rejected' ? timeout.reason : null,
      perLegRetries: 0,
    })
  })

  it('keeps shared discovery alive for the remaining subscriber', async () => {
    const matched = Promise.withResolvers<void>()
    let matches = 0
    const put = vi.fn(async () => undefined)
    await installCache({
      match: async () => { if (++matches === 2) matched.resolve(); await matched.promise; return undefined },
      put,
    })
    const entered = Promise.withResolvers<Request>()
    const response = Promise.withResolvers<Response>()
    const discovery = { fetch: vi.fn(async (request: Request) => {
      entered.resolve(request)
      return response.promise
    }), connect() { throw new Error('not-supported') } }
    const cache = new OfferCache('subscriber-isolation')
    const left = new AbortController(), right = new AbortController()
    const first = cache.requote(cacheInput, discovery, createExecutionContext(), left.signal)
    const second = cache.requote(cacheInput, discovery, createExecutionContext(), right.signal)
    const firstRejected = expect(first).rejects.toThrow('caller-left')
    const request = await entered.promise
    left.abort(new Error('caller-left'))
    await firstRejected
    expect(request.signal.aborted).toBe(false)
    response.resolve(quoteResponse())
    expect(await second).toMatchObject({ kind: 'offer', offerId: 'hotel-current' })
    expect(discovery.fetch).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('evicts an abandoned refresh and prevents its late response from entering the cache', async () => {
    const put = vi.fn(async () => undefined)
    await installCache({ match: async () => undefined, put })
    const entered = Promise.withResolvers<Request>()
    const late = Promise.withResolvers<Response>()
    const cache = new OfferCache('abandoned-refresh')
    let calls = 0
    const discovery = { fetch: async (request: Request) => {
      if (++calls > 1) return quoteResponse()
      entered.resolve(request)
      return late.promise
    }, connect() { throw new Error('not-supported') } }
    const controller = new AbortController()
    const pending = cache.requote(cacheInput, discovery, createExecutionContext(), controller.signal)
    const rejected = expect(pending).rejects.toThrow('caller-gone')
    const request = await entered.promise
    controller.abort(new Error('caller-gone'))
    await rejected
    expect(request.signal.aborted).toBe(true)
    expect(await cache.requote(cacheInput, discovery, createExecutionContext()))
      .toMatchObject({ kind: 'offer', offerId: 'hotel-current' })
    late.resolve(quoteResponse('hotel-obsolete'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toBe(2)
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch after cancellation while cache lookup is pending', async () => {
    const entered = Promise.withResolvers<void>()
    const lookup = Promise.withResolvers<Response | undefined>()
    await installCache({
      match: async () => { entered.resolve(); return lookup.promise },
      put: async () => undefined,
    })
    const fetch = vi.fn(async () => quoteResponse())
    const controller = new AbortController()
    const pending = new OfferCache('lookup-cancellation').requote(cacheInput, {
      fetch, connect() { throw new Error('not-supported') },
    }, createExecutionContext(), controller.signal)
    const rejected = expect(pending).rejects.toThrow('lookup-expired')
    await entered.promise
    controller.abort(new Error('lookup-expired'))
    lookup.resolve(undefined)
    await rejected
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([false, true])('fences a pending cache publication after cancellation (cleanup failure: %s)', async (cleanupFails) => {
    const writing = Promise.withResolvers<void>(), finishWrite = Promise.withResolvers<void>()
    const cleaned = Promise.withResolvers<void>()
    let stored: Response | undefined
    let writes = 0, calls = 0
    await installCache({
      match: async () => stored?.clone(),
      put: async (_key, response) => {
        if (++writes === 1) { writing.resolve(); await finishWrite.promise }
        stored = response.clone()
      },
      delete: async () => {
        cleaned.resolve()
        if (cleanupFails) throw new Error('cache-delete-unavailable')
        stored = undefined
        return true
      },
    })
    const discovery = { fetch: async () => quoteResponse(++calls === 1 ? 'hotel-obsolete' : 'hotel-current'),
      connect() { throw new Error('not-supported') } }
    const cache = new OfferCache('publication-fence')
    const controller = new AbortController()
    const pending = cache.requote(cacheInput, discovery, createExecutionContext(), controller.signal)
    const rejected = expect(pending).rejects.toThrow('publication-expired')
    await writing.promise
    controller.abort(new Error('publication-expired'))
    await rejected
    expect(await cache.requote(cacheInput, discovery, createExecutionContext())).toMatchObject({ offerId: 'hotel-current' })
    expect(writes).toBe(1)
    finishWrite.resolve()
    await cleaned.promise
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(await cache.requote(cacheInput, discovery, createExecutionContext())).toMatchObject({ offerId: 'hotel-current' })
    expect(calls).toBe(3)
    expect(writes).toBe(cleanupFails ? 1 : 2)
  })

  it('rejects a cache response captured before canceled-publication cleanup', async () => {
    const writing = Promise.withResolvers<Response>(), finishWrite = Promise.withResolvers<void>()
    const reading = Promise.withResolvers<void>(), finishRead = Promise.withResolvers<Response>()
    const cleaned = Promise.withResolvers<void>()
    let matches = 0, calls = 0, writes = 0
    await installCache({
      match: async () => {
        if (++matches === 3) { reading.resolve(); return finishRead.promise }
        return undefined
      },
      put: async (_key, response) => {
        if (++writes === 1) { writing.resolve(response.clone()); await finishWrite.promise }
      },
      delete: async () => { cleaned.resolve(); return true },
    })
    const discovery = { fetch: async () => quoteResponse(++calls === 1 ? 'hotel-obsolete' : 'hotel-current'),
      connect() { throw new Error('not-supported') } }
    const cache = new OfferCache('read-publication-fence')
    const controller = new AbortController()
    const pending = cache.requote(cacheInput, discovery, createExecutionContext(), controller.signal)
    const rejected = expect(pending).rejects.toThrow('writer-expired')
    const obsolete = await writing.promise
    controller.abort(new Error('writer-expired'))
    await rejected
    const fresh = cache.requote(cacheInput, discovery, createExecutionContext())
    await reading.promise
    finishWrite.resolve()
    await cleaned.promise
    await new Promise((resolve) => setTimeout(resolve, 0))
    finishRead.resolve(obsolete)
    expect(await fresh).toMatchObject({ offerId: 'hotel-current' })
    expect(calls).toBe(2)
  })
})

const cacheInput = {
  event: { bundleId: 'subscriber-bundle', legId: 'flight', eventId: 'subscriber-event' },
  legId: 'hotel', category: 'hotel', priorOfferId: 'hotel-old', priorAmountMinor: 90,
}

async function installCache(overrides: Pick<Cache, 'match' | 'put'> & Partial<Pick<Cache, 'delete'>>): Promise<void> {
  const cache = await caches.open('cancellation-test-cache')
  vi.spyOn(cache, 'match').mockImplementation(overrides.match)
  vi.spyOn(cache, 'put').mockImplementation(overrides.put)
  if (overrides.delete) vi.spyOn(cache, 'delete').mockImplementation(overrides.delete)
  vi.spyOn(caches, 'open').mockResolvedValue(cache)
}

function quoteResponse(offerId = 'hotel-current'): Response {
  return Response.json({
    kind: 'offer', legId: 'hotel', offerId, amountMinor: 100, currency: 'SGD',
    priceVerification: 'deterministic-demo', agentId: 'cache-test',
    promptTokens: 0, completionTokens: 0, dollarCost: 0, provenance: {},
  })
}

function discoveryDouble(
  delays: ReadonlyMap<string, number>,
  concurrency?: { active: number; maximum: number; aborted?: number },
): Fetcher {
  return {
    async fetch(request: Request): Promise<Response> {
      const legId = await readIntentLegId(request)
      const delay = delays.get(legId) ?? 0
      if (concurrency) {
        concurrency.active += 1
        concurrency.maximum = Math.max(concurrency.maximum, concurrency.active)
      }
      try {
        if (delay > 0) await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer)
            if (concurrency) concurrency.aborted = (concurrency.aborted ?? 0) + 1
            reject(request.signal.reason)
          }
          const timer = setTimeout(() => { request.signal.removeEventListener('abort', abort); resolve() }, delay)
          request.signal.addEventListener('abort', abort, { once: true })
          if (request.signal.aborted) abort()
        })
        return Response.json({
          kind: 'offer', legId, offerId: `${legId}-bounded`, amountMinor: 250,
          currency: 'SGD',
          priceVerification: 'deterministic-demo',
          agentId: 'local-bounds-double', promptTokens: 0, completionTokens: 0, dollarCost: 0,
          provenance: { mode: 'deterministic-local-demo-double', currency: 'SGD' },
        })
      } finally {
        if (concurrency) concurrency.active -= 1
      }
    },
    connect() { throw new Error('not-supported-by-local-demo-double') },
  }
}
