import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

import {
  EFFECT_CONTRACT,
  type NetSettlementRequest,
} from '../agenticgraph-travel-settlement-executor/contract'
import { createSettlementExecutor } from '../agenticgraph-travel-settlement-executor/index'
import type { SettlementExecutorRuntimeEnv } from '../agenticgraph-travel-settlement-executor/upstream'

const executorEnv = Object.freeze({
  ISSUANCE_SERVICE_BASE_URL: 'https://issuance-service-dev.invalid',
  ISSUANCE_SERVICE_TIMEOUT_MS: '5000',
  ISSUANCE_SERVICE_AUTH_TOKEN: 'payment-contract-test-secret',
}) satisfies SettlementExecutorRuntimeEnv

const providerFetch = async (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/readyz') {
    return Response.json({
      ok: true,
      contract: EFFECT_CONTRACT,
      providerBacked: true,
      capability: 'settleNet',
      authenticated: true,
      providerId: 'payment-contract-provider',
    })
  }
  if (request.method !== 'POST' || url.pathname !== '/v1/net-settlements') {
    return Response.json({ ok: false }, { status: 404 })
  }
  const body = await request.json() as NetSettlementRequest
  const safeCascadeId = body.cascadeId.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 96)
  if (body.cascadeId.endsWith(':ambiguous')) {
    return Response.json({
      ok: true,
      idempotencyKey: body.cascadeId,
      settlementId: 'journal_only_not_an_effect',
    })
  }
  if (body.cascadeId.endsWith(':rejected')) {
    return Response.json({
      ok: false,
      contract: EFFECT_CONTRACT,
      code: 'settlement-effect-rejected',
      idempotencyKey: body.cascadeId,
      definitive: true,
      effectApplied: false,
    }, { status: 422 })
  }
  return Response.json({
    ok: true,
    contract: EFFECT_CONTRACT,
    providerBacked: true,
    idempotencyKey: body.cascadeId,
    cascadeId: body.cascadeId,
    bundleId: body.bundleId,
    principalId: body.principalId,
    amountMinor: body.amountMinor,
    currency: body.currency,
    effect: body.amountMinor > 0 ? 'charged' : 'refunded',
    settlementId: `provider_${safeCascadeId}`,
    providerReference: `effect_${safeCascadeId}`,
  })
}

const executor = createSettlementExecutor(providerFetch)

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: './cloudflare/workers/agenticgraph-payment/wrangler.net-settlement.toml' },
    miniflare: {
      serviceBindings: {
        NET_SETTLEMENT_EXECUTOR: (request) => executor.fetch(request, executorEnv),
      },
    },
  })],
  test: {
    globals: false,
    testTimeout: 15_000,
    include: ['./cloudflare/workers/agenticgraph-payment/__tests__/net-settlement.contract.vitest.ts'],
  },
})
