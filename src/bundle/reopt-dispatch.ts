import { OfferCache, type RequoteInput } from '../cache/offer-cache'
import type { CascadeRecord, Leg, Quote, Rejection } from './bundle-types'

export type DispatchResult =
  | Readonly<{ kind: 'quoted'; quotes: readonly Quote[]; quoteCount: number; rejectCount: 0 }>
  | Readonly<{ kind: 'rejected'; reason: string; quoteCount: number; rejectCount: number }>

export async function dispatchAffectedSet(
  record: CascadeRecord,
  legs: readonly Leg[],
  discovery: Fetcher,
  ctx: ExecutionContext,
  deadlineAt: number,
  cache = new OfferCache(),
): Promise<DispatchResult> {
  const byLeg = new Map(legs.map((leg) => [leg.legId, leg]))
  const requests: RequoteInput[] = record.affected.map((legId) => {
    const leg = byLeg.get(legId)
    if (!leg) throw new Error('unknown-affected-leg')
    return Object.freeze({
      event: Object.freeze({ bundleId: record.bundleId, legId: record.changedLegId, eventId: record.eventId }),
      legId,
      category: leg.category,
      priorOfferId: leg.committedOfferId,
      priorAmountMinor: leg.committedAmountMinor,
    })
  })
  try {
    const results = await Promise.all(requests.map((request) => withDeadline(
      cache.requote(request, discovery, ctx), deadlineAt,
    )))
    const rejected = results.filter((result): result is Rejection => result.kind === 'rejected')
    if (rejected.length > 0) {
      return Object.freeze({
        kind: 'rejected', reason: rejected[0].reason,
        quoteCount: results.length, rejectCount: rejected.length,
      })
    }
    return Object.freeze({
      kind: 'quoted', quotes: Object.freeze(results as Quote[]),
      quoteCount: results.length, rejectCount: 0 as const,
    })
  } catch (error) {
    return Object.freeze({
      kind: 'rejected',
      reason: error instanceof Error ? error.message : 'requote-failed',
      quoteCount: requests.length,
      rejectCount: 1,
    })
  }
}

async function withDeadline<T>(promise: Promise<T>, deadlineAt: number): Promise<T> {
  const remaining = deadlineAt - Date.now()
  if (remaining <= 0) throw new Error('cascade-timeout')
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('cascade-timeout')), remaining)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
