import { isIdentifier } from '../bundle-runtime'
import type { CascadeRecord } from '../bundle-types'
import { appendSessionLog } from '../bundle-graph-observability'
import { authorizeMarketplacePayout, reportMarketplaceState } from './client'
import {
  mapSplit,
  claimPayoutDispatch,
  PAYOUT_MAX_ATTEMPTS,
  PAYOUT_RETRY_MS,
  type PayoutRow,
  reportablePayout,
  updatePayout,
} from './storage'

const MAX_RESULT_BYTES = 16_384

export async function dispatchPayout(
  ctx: DurableObjectState,
  env: TravelCommerceEnv,
  row: PayoutRow,
  record: CascadeRecord,
  now: number,
): Promise<void> {
  const split = mapSplit(row)
  if (!claimPayoutDispatch(ctx, row, now)) return
  const verdict = await authorizeMarketplacePayout(env.MARKETPLACE_SERVICE, split)
  if (!verdict.allowed) {
    const state = verdict.retryable ? 'pending' : 'blocked'
    ctx.storage.transactionSync(() => {
      updatePayout(ctx, row.payout_id, state, {
        attemptCount: row.attempt_count,
        terminalReason: verdict.reason,
        nextAttemptAt: verdict.retryable ? now + PAYOUT_RETRY_MS : null,
      }, now)
      appendEvent(ctx, record, `payout-${state}`, split.splitId, now, verdict.reason)
    })
    return report(ctx, env, split, row.payout_id)
  }
  if (split.netPayoutAmountMinor === 0) {
    ctx.storage.transactionSync(() => {
      updatePayout(ctx, row.payout_id, 'settled', {
        attemptCount: row.attempt_count, settlementReference: 'zero-net', nextAttemptAt: null,
      }, now)
      appendEvent(ctx, record, 'payout-settled', split.splitId, now, 'zero-net')
    })
    return report(ctx, env, split, row.payout_id)
  }
  const attemptCount = row.attempt_count + 1
  ctx.storage.transactionSync(() => {
    updatePayout(ctx, row.payout_id, 'dispatched', { attemptCount }, now)
    appendEvent(ctx, record, 'payout-dispatched', split.splitId, now)
  })
  const result = await callSettlement(env.ISSUANCE_SERVICE, split)
  const fingerprint = JSON.stringify(result)
  const repeated = fingerprint === row.last_result_fingerprint
  if (result.ok) {
    ctx.storage.transactionSync(() => {
      updatePayout(ctx, row.payout_id, 'settled', {
        attemptCount, settlementReference: result.settlementReference, nextAttemptAt: null,
        lastResultFingerprint: fingerprint,
      }, Date.now())
      appendEvent(ctx, record, 'payout-settled', split.splitId, Date.now())
    })
  } else {
    const terminal = !result.retryable || repeated || attemptCount >= PAYOUT_MAX_ATTEMPTS
    ctx.storage.transactionSync(() => {
      updatePayout(ctx, row.payout_id, terminal ? 'failed' : 'pending', {
        attemptCount,
        terminalReason: repeated ? 'unchanged-result-circuit-breaker' : result.reason,
        nextAttemptAt: terminal ? null : Date.now() + PAYOUT_RETRY_MS,
        lastResultFingerprint: fingerprint,
      }, Date.now())
      appendEvent(ctx, record, terminal ? 'payout-failed' : 'payout-pending', split.splitId, Date.now(), result.reason)
    })
  }
  await report(ctx, env, split, row.payout_id)
}

async function callSettlement(
  issuance: Fetcher,
  split: ReturnType<typeof mapSplit>,
): Promise<Readonly<{ ok: true; settlementReference: string }> | Readonly<{ ok: false; retryable: boolean; reason: string }>> {
  try {
    const response = await issuance.fetch(new Request('https://issuance-service.internal/v1/net-settlements', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': split.splitId,
        'x-agenticgraph-component': 'Issuance_Service',
      },
      body: JSON.stringify({
        operation: 'settleNet', cascadeId: split.splitId, bundleId: split.bundleId,
        principalId: split.payoutPrincipalId, amountMinor: -split.netPayoutAmountMinor,
        currency: split.settlementCurrency, caller: 'Issuance_Service',
      }),
    }))
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > MAX_RESULT_BYTES) {
      return { ok: false, retryable: true, reason: 'settlement-response-too-large' }
    }
    const value: unknown = text ? JSON.parse(text) : null
    if (response.ok && isRecord(value) && value.ok === true
      && value.idempotencyKey === split.splitId && value.amountMinor === -split.netPayoutAmountMinor
      && value.currency === split.settlementCurrency && value.effect === 'refunded'
      && isIdentifier(value.settlementId) && isIdentifier(value.providerReference)) {
      return { ok: true, settlementReference: value.settlementId }
    }
    const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500
    return { ok: false, retryable, reason: `settlement-failed-${response.status}` }
  } catch {
    return { ok: false, retryable: true, reason: 'settlement-outcome-unknown' }
  }
}

async function report(
  ctx: DurableObjectState, env: TravelCommerceEnv, split: ReturnType<typeof mapSplit>, payoutId: string,
): Promise<void> {
  const payout = reportablePayout(ctx, payoutId)
  if (payout) await reportMarketplaceState(env.MARKETPLACE_SERVICE, [split], [payout])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function appendEvent(
  ctx: DurableObjectState, record: CascadeRecord, eventType: string,
  splitId: string, now: number, reason: string | null = null,
): void {
  appendSessionLog(ctx, record, eventType, JSON.stringify({ splitId, reason }), now)
}
