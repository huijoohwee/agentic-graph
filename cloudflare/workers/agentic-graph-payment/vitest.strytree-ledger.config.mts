import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const checkoutMigrations = (await readD1Migrations('./cloudflare/d1/migrations'))
  .filter(({ name }) => ['0004_strytree_storytree.sql', '0014_strytree_ledger_authority.sql'].includes(name))
if (checkoutMigrations.length !== 2) throw new Error('Strytree checkout migrations are incomplete')

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: './cloudflare/workers/agentic-graph-payment/wrangler.toml' },
    miniflare: {
      bindings: { STRYTREE_TEST_MIGRATIONS: checkoutMigrations },
      serviceBindings: {
        NET_SETTLEMENT_EXECUTOR: () => Response.json({ ok: false }, { status: 503 }),
        TRAVEL_DISCOVERY_HARNESS: () => Response.json({ ok: false }, { status: 503 }),
      },
    },
  })],
  test: {
    globals: false,
    testTimeout: 15_000,
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['ripple-address-codec'],
        },
      },
    },
    include: [
      './cloudflare/workers/agentic-graph-payment/__tests__/strytree-ledger.contract.vitest.ts',
      './cloudflare/workers/agentic-graph-payment/__tests__/strytree-api.contract.vitest.ts',
      './cloudflare/workers/agentic-graph-payment/__tests__/strytree-checkout.contract.vitest.ts',
      './cloudflare/workers/agentic-graph-payment/__tests__/strytree-generation.contract.vitest.ts',
      './cloudflare/workers/agentic-graph-payment/__tests__/strytree-candidates.contract.vitest.ts',
      './cloudflare/workers/agentic-graph-payment/__tests__/strytree-candidate-publish.contract.vitest.ts',
    ],
  },
})
