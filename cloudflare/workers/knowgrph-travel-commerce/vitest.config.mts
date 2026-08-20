import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

process.env.TRAVEL_COMMERCE_API_TOKEN ??= 'test-travel-token'
process.env.RECONCILIATION_OPERATOR_TOKEN ??= 'test-reconciliation-token'
process.env.INFERENCE_OVERFLOW_TOKEN ??= 'test-overflow-token'

export default defineConfig({
  plugins: [cloudflareTest({
    remoteBindings: false,
    wrangler: { configPath: './cloudflare/workers/knowgrph-travel-commerce/wrangler.jsonc' },
    miniflare: {
      bindings: {
        TRAVEL_COMMERCE_API_TOKEN: 'test-travel-token',
        RECONCILIATION_OPERATOR_TOKEN: 'test-reconciliation-token',
        INFERENCE_OVERFLOW_TOKEN: 'test-overflow-token',
      },
      serviceBindings: {
        DISCOVERY_SERVICE: () => Response.json({ ok: false }, { status: 501 }),
        ISSUANCE_SERVICE: () => Response.json({ ok: false }, { status: 501 }),
        INFERENCE_OVERFLOW: () => Response.json({ ok: false }, { status: 501 }),
      },
    },
  })],
  test: {
    globals: false,
    testTimeout: 15_000,
    include: ['./cloudflare/workers/knowgrph-travel-commerce/test/**/*.test.ts'],
  },
})
