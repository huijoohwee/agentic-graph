import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

process.env.TRAVEL_COMMERCE_API_TOKEN ??= 'test-travel-token'
process.env.RECONCILIATION_OPERATOR_TOKEN ??= 'test-reconciliation-token'
process.env.INFERENCE_OVERFLOW_TOKEN ??= 'test-overflow-token'
process.env.CHECKOUT_PROVIDER_AUTH_SECRET ??= 'checkout-provider-graph-test-secret'
process.env.MARKETPLACE_PROVIDER_AUTH_SECRET ??= 'marketplace-provider-graph-test-secret'

export default defineConfig({
  plugins: [cloudflareTest({
    remoteBindings: false,
    wrangler: { configPath: './cloudflare/workers/agenticgraph-travel-commerce/wrangler.jsonc' },
    miniflare: {
      bindings: {
        TRAVEL_COMMERCE_API_TOKEN: 'test-travel-token',
        RECONCILIATION_OPERATOR_TOKEN: 'test-reconciliation-token',
        INFERENCE_OVERFLOW_TOKEN: 'test-overflow-token',
        CHECKOUT_PROVIDER_AUTH_SECRET: 'checkout-provider-graph-test-secret',
        MARKETPLACE_PROVIDER_AUTH_SECRET: 'marketplace-provider-graph-test-secret',
      },
      serviceBindings: {
        DISCOVERY_SERVICE: () => Response.json({ ok: false }, { status: 501 }),
        ISSUANCE_SERVICE: () => Response.json({ ok: false }, { status: 501 }),
        MARKETPLACE_SERVICE: async (request) => {
          const url = new URL(request.url)
          if (url.pathname === '/readyz') return Response.json({ ok: true })
          if (url.pathname === '/v1/vendors/resolve') {
            const body = await request.json() as { vendorIds: string[] }
            return Response.json({ ok: true, vendors: body.vendorIds.map((vendorId) => ({
              vendorId, payoutPrincipalId: vendorId, lifecycleState: 'active', settlementCurrency: 'SGD',
              commissionRuleId: 'travel-standard', commissionRuleRevision: '1',
              commissionRule: { kind: 'flat', bps: 1000 },
            })) })
          }
          if (url.pathname === '/v1/payouts/authorize') return Response.json({ ok: true, allowed: true })
          if (url.pathname === '/v1/report') return Response.json({ ok: true })
          return Response.json({ ok: false }, { status: 404 })
        },
        INFERENCE_OVERFLOW: () => Response.json({ ok: false }, { status: 501 }),
      },
    },
  })],
  test: {
    globals: false,
    fileParallelism: false,
    testTimeout: 15_000,
    include: ['./cloudflare/workers/agenticgraph-travel-commerce/test/**/*.test.ts'],
  },
})
