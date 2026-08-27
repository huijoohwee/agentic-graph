import { env, reset, runInDurableObject } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { dispatchPayout } from '../../../../src/bundle/bundle-marketplace/payout'
import type { PayoutRow } from '../../../../src/bundle/bundle-marketplace/storage'
import { minorUnits } from '../../../../src/bundle/bundle-runtime'
import type { BundleSeed, Quote } from '../../../../src/bundle/bundle-types'

afterEach(() => reset())

describe('native marketplace production runtime', () => {
  it('commits splits with the bundle and dispatches one durable vendor payout', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const seed = marketplaceSeed()
    const graph = runtime.BUNDLE_GRAPH.getByName(seed.bundleId)
    const ledger = runtime.ENVELOPE_LEDGER.getByName(seed.principalId)
    await graph.initBundle(seed)
    const begin = await graph.beginCascade({ bundleId: seed.bundleId, legId: 'flight', eventId: 'marketplace' })
    if (begin.kind !== 'plan') throw new Error('expected marketplace cascade')
    const quote = marketplaceQuote()
    await ledger.checkAndReserveCascade(begin.record.cascadeId, seed.bundleId, [quote])
    const prepared = await graph.prepareCommit(begin.record.cascadeId, [quote], [{
      splitId: `split:${seed.bundleId}:agent-hotel`, bundleId: seed.bundleId,
      vendorId: 'agent-hotel', payoutPrincipalId: 'agent-hotel', coveredLegIds: ['hotel'],
      settlementCurrency: 'SGD', grossAmountMinor: 125, commissionAmountMinor: 12,
      netPayoutAmountMinor: 113, commissionRuleId: 'travel-standard', commissionRuleRevision: '1',
    }])
    if ('kind' in prepared) throw new Error(prepared.reason)
    const owner = 'marketplace-test-owner'
    await graph.claimSettlement(begin.record.cascadeId, owner)
    await graph.recordSettlementAttempt(begin.record.cascadeId, owner)
    await graph.markSettlementComplete(begin.record.cascadeId, owner)
    await ledger.commitCascade(begin.record.cascadeId)
    await graph.commitPreparedCascade(begin.record.cascadeId)

    const committed = await graph.getMarketplaceState() as {
      splits: Record<string, unknown>[]; payouts: Record<string, unknown>[]; events: Record<string, unknown>[]
    }
    expect(committed.splits).toEqual([expect.objectContaining({
      vendor_id: 'agent-hotel', gross_amount_minor: 125,
      commission_amount_minor: 12, net_payout_amount_minor: 113,
    })])
    expect(committed.payouts).toEqual([expect.objectContaining({ payout_state: 'pending', attempt_count: 0 })])
    expect(committed.events.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      'settlement-verified', 'split-committed', 'bundle-committed',
    ]))
    await graph.finishCascade(begin.record.cascadeId, false)

    let settlementCalls = 0
    let settlementBody: Record<string, unknown> | null = null
    const fakeEnv = {
      ...runtime,
      MARKETPLACE_SERVICE: service(async (request) => {
        const path = new URL(request.url).pathname
        if (path === '/v1/payouts/authorize') return Response.json({ ok: true, allowed: true })
        if (path === '/v1/report') return Response.json({ ok: true })
        return Response.json({ ok: true })
      }),
      ISSUANCE_SERVICE: service(async (request) => {
        settlementCalls += 1
        settlementBody = await request.json() as Record<string, unknown>
        return Response.json({
          ok: true, idempotencyKey: settlementBody.cascadeId,
          settlementId: 'marketplace-settlement-1', idempotentReplay: false,
          amountMinor: settlementBody.amountMinor, currency: 'SGD', recordedAt: new Date().toISOString(),
          effect: 'refunded', providerReference: 'marketplace-provider-1',
        })
      }),
    } as TravelCommerceEnv
    await runInDurableObject(graph, async (instance, state) => {
      await state.storage.deleteAlarm()
      const payout = state.storage.sql.exec<PayoutRow>(
        `SELECT p.*, s.cascade_id, s.bundle_id, s.vendor_id, s.payout_principal_id,
          s.covered_leg_ids_json, s.settlement_currency, s.gross_amount_minor,
          s.commission_amount_minor, s.net_payout_amount_minor, s.commission_rule_id,
          s.commission_rule_revision
         FROM marketplace_payouts p JOIN vendor_splits s ON s.split_id = p.split_id`,
      ).one()
      const record = instance.getCascade(begin.record.cascadeId)
      if (!record) throw new Error('missing cascade')
      await dispatchPayout(state, fakeEnv, payout, record, Date.now())
      expect(state.storage.sql.exec<{ payout_state: string }>(
        'SELECT payout_state FROM marketplace_payouts WHERE payout_id = ?', payout.payout_id,
      ).one().payout_state).toBe('settled')
    })
    const settled = await graph.getMarketplaceState() as { payouts: Record<string, unknown>[] }
    expect(settlementCalls).toBe(1)
    expect(settlementBody).toMatchObject({
      operation: 'settleNet', cascadeId: `split:${seed.bundleId}:agent-hotel`,
      bundleId: seed.bundleId, principalId: 'agent-hotel', amountMinor: -113,
      currency: 'SGD', caller: 'Issuance_Service',
    })
    expect(settled.payouts).toEqual([expect.objectContaining({
      payout_state: 'settled', attempt_count: 1, settlement_reference: 'marketplace-settlement-1',
    })])
  })
})

function marketplaceSeed(): BundleSeed {
  return {
    bundleId: 'bundle-native-marketplace', principalId: 'principal-native-marketplace',
    totalBudgetMinor: minorUnits(1_000),
    legs: [
      { legId: 'flight', principalId: 'principal-native-marketplace', category: 'flight',
        committedOfferId: 'flight-old', committedAmountMinor: minorUnits(100), lastCascadeId: null },
      { legId: 'hotel', principalId: 'principal-native-marketplace', category: 'hotel',
        committedOfferId: 'hotel-old', committedAmountMinor: minorUnits(100), lastCascadeId: null },
    ],
    edges: [{ fromLegId: 'flight', toLegId: 'hotel' }],
  }
}

function marketplaceQuote(): Quote {
  return {
    kind: 'offer', legId: 'hotel', offerId: 'hotel-new', amountMinor: minorUnits(125), currency: 'SGD',
    priceVerification: 'deterministic-demo', agentId: 'agent-hotel', promptTokens: 0,
    completionTokens: 0, dollarCost: 0, provenance: { mode: 'runtime-test' },
  }
}

function service(fetch: (request: Request) => Promise<Response>): Fetcher {
  return { fetch, connect() { throw new Error('not-supported') } }
}
