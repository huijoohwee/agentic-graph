import { createExecutionContext, env } from 'cloudflare:test'
import { minorUnits } from '../../../../../src/bundle/bundle-runtime'
import type { BundleSeed, CascadeRecord, Quote } from '../../../../../src/bundle/bundle-types'
import type { DispatchResult } from '../../../../../src/bundle/reopt-dispatch'

export type LocalDemoMetrics = {
  discoveryDispatches: number
  settlementCalls: number
  archiveWrites: number
  gatewayCallers: string[]
}

export function runtimeEnv(): TravelCommerceEnv {
  return {
    ...env,
    TRAVEL_COMMERCE_API_TOKEN: 'deterministic-local-demo-unconfigured',
    INFERENCE_OVERFLOW_TOKEN: 'deterministic-local-demo-unconfigured',
    CHECKOUT_PROVIDER_AUTH_SECRET: 'deterministic-checkout-provider-secret',
    MARKETPLACE_PROVIDER_AUTH_SECRET: 'deterministic-marketplace-provider-secret',
  } satisfies TravelCommerceEnv
}

export async function initialize(seed: BundleSeed) {
  const localEnv = runtimeEnv()
  const graph = localEnv.BUNDLE_GRAPH.getByName(seed.bundleId)
  const ledger = localEnv.ENVELOPE_LEDGER.getByName(seed.principalId)
  const graphInit = await graph.initBundle(seed)
  const commitments = seed.legs.flatMap((leg) => (
    leg.committedOfferId && leg.committedAmountMinor != null
      ? [{
          bundleId: seed.bundleId,
          legId: leg.legId,
          offerId: leg.committedOfferId,
          amountMinor: leg.committedAmountMinor,
        }]
      : []
  ))
  const ledgerInit = await ledger.init(seed.principalId, seed.totalBudgetMinor, commitments)
  return { localEnv, graph, ledger, graphInit, ledgerInit }
}

export function localDemoAdapters(
  quoteAmounts: Readonly<Record<string, number>>,
  options: Readonly<{
    rejectLegId?: string
    delayByLegMs?: Readonly<Record<string, number>>
    settlementFails?: boolean
  }> = {},
) {
  const metrics: LocalDemoMetrics = {
    discoveryDispatches: 0,
    settlementCalls: 0,
    archiveWrites: 0,
    gatewayCallers: [],
  }
  const dispatch = async (record: CascadeRecord): Promise<DispatchResult> => {
    const results = await Promise.all(record.affected.map(async (legId) => {
      metrics.discoveryDispatches += 1
      const delay = options.delayByLegMs?.[legId] ?? 0
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
      if (legId === options.rejectLegId) return null
      const amountMinor = quoteAmounts[legId]
      if (!Number.isSafeInteger(amountMinor)) return null
      return Object.freeze({
        kind: 'offer' as const,
        legId,
        offerId: `${legId}-${record.eventId}`,
        amountMinor: minorUnits(amountMinor),
        currency: 'SGD',
        priceVerification: 'deterministic-demo',
        agentId: 'local-demo-discovery-double',
        promptTokens: 0,
        completionTokens: 0,
        dollarCost: 0,
        provenance: Object.freeze({ mode: 'deterministic-local-demo-double', currency: 'SGD' }),
      }) satisfies Quote
    }))
    const rejected = results.filter((result) => result == null).length
    return rejected > 0
      ? Object.freeze({ kind: 'rejected', reason: 'requote-rejected', quoteCount: results.length, rejectCount: rejected })
      : Object.freeze({ kind: 'quoted', quotes: results as Quote[], quoteCount: results.length, rejectCount: 0 })
  }
  return {
    metrics,
    adapters: Object.freeze({
      dispatch,
      settle: async (record: CascadeRecord) => {
        metrics.settlementCalls += 1
        metrics.gatewayCallers.push('Issuance_Service')
        return options.settlementFails
          ? { kind: 'rejected' as const, reason: 'settlement-failed-local-demo-double' }
          : { kind: 'settled' as const, settlementId: `local-${record.cascadeId}`, idempotencyKey: record.cascadeId }
      },
      archive: async (_bucket: R2Bucket, _snapshot: unknown, result: { bundleId: string; cascadeId: string }) => {
        metrics.archiveWrites += 1
        return Object.freeze({
          kind: 'written' as const,
          key: `provenance/${result.bundleId}/${result.cascadeId}.json`,
          digest: `local-demo-${result.cascadeId}`,
        })
      },
    }),
  }
}

export function executionContext(): ExecutionContext {
  return createExecutionContext()
}
