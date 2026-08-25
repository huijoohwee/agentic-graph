import { appendCostLog, appendSessionLog, readSessionLog } from '../bundle-graph-observability'
import { readCascade } from '../bundle-graph-storage'
import type { CascadeRecord, Quote } from '../bundle-types'
import { dispatchPayout } from './payout'
import { validateMarketplaceSplits } from './projection'
import {
  commitPreparedSplits, readDuePayout, readMarketplaceState,
} from './storage'
import type { MarketplaceSplit } from './contracts'

export function resolvePreparedMarketplaceSplits(
  record: CascadeRecord,
  quotes: readonly Quote[],
  candidate: readonly MarketplaceSplit[] | number | undefined,
): readonly MarketplaceSplit[] | null {
  // Direct DO calls without split input are retained only for the pre-marketplace
  // evidence harness. The production ReoptWorker always supplies resolved splits.
  if (!Array.isArray(candidate)) return Object.freeze([])
  const splits = candidate
  return splits && validateMarketplaceSplits(record.bundleId, quotes, splits) ? splits : null
}

export function commitMarketplaceTransaction(
  ctx: DurableObjectState, record: CascadeRecord, now: number,
): void {
  commitPreparedSplits(ctx, record, now)
  appendSessionLog(ctx, record, 'settlement-verified', null, now)
  const splits = (readMarketplaceState(ctx).splits as readonly Record<string, unknown>[])
    .filter((split) => split.cascade_id === record.cascadeId)
  for (const split of splits) {
    appendSessionLog(ctx, record, 'split-committed', JSON.stringify({ splitId: split.split_id }), now)
  }
}

export function marketplaceState(ctx: DurableObjectState): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...readMarketplaceState(ctx), events: readSessionLog(ctx) })
}

export function recordHarnessCostEntries(
  ctx: DurableObjectState, cascadeId: string, quotes: readonly Quote[], now: number,
): void {
  const totals = new Map<string, { prompt: number; completion: number; cost: number }>()
  for (const quote of quotes) {
    const component = `Discovery_Harness:${quote.agentId}`
    const current = totals.get(component) ?? { prompt: 0, completion: 0, cost: 0 }
    totals.set(component, {
      prompt: current.prompt + quote.promptTokens,
      completion: current.completion + quote.completionTokens,
      cost: current.cost + quote.dollarCost,
    })
  }
  for (const [component, total] of totals) {
    appendCostLog(ctx, cascadeId, component, total.prompt, total.completion, total.cost, now)
  }
}

export async function runMarketplacePayoutAlarm(
  ctx: DurableObjectState, env: TravelCommerceEnv,
): Promise<void> {
  const payout = readDuePayout(ctx, Date.now())
  if (!payout) return
  const record = readCascade(ctx, payout.cascade_id)
  if (record?.outcome?.kind !== 'committed') return
  try {
    await dispatchPayout(ctx, env, payout, record, Date.now())
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error', message: 'marketplace payout deferred', payoutId: payout.payout_id,
      reason: error instanceof Error ? error.message : 'payout-dispatch-failed',
    }))
  }
}
