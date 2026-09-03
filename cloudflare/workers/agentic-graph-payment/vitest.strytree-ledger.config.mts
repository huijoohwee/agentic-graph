import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: './cloudflare/workers/agentic-graph-payment/wrangler.toml' },
    miniflare: {
      serviceBindings: {
        NET_SETTLEMENT_EXECUTOR: () => Response.json({ ok: false }, { status: 503 }),
      },
    },
  })],
  test: {
    globals: false,
    testTimeout: 15_000,
    include: ['./cloudflare/workers/agentic-graph-payment/__tests__/strytree-ledger.contract.vitest.ts'],
  },
})
