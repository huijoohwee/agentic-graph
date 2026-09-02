import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const TEST_SOURCE_REVISION = '1234567890abcdef1234567890abcdef12345678'
process.env.MARKETPLACE_PROVIDER_AUTH_SECRET ??= 'marketplace-provider-graph-test-secret'

export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    remoteBindings: false,
    wrangler: { configPath: './cloudflare/workers/agenticgraph-marketplace/wrangler.jsonc' },
    miniflare: {
      // The installed workerd test binary currently supports through this date.
      compatibilityDate: '2026-08-22',
      bindings: {
        COMMERCE_PROVIDER_SOURCE_REVISION: TEST_SOURCE_REVISION,
        COMMERCE_PROVIDER_STORAGE_REVISION: 'marketplace-d1-0017',
        COMMERCE_PROVIDER_VERSION_ID: 'marketplace-test-v1',
        MARKETPLACE_PROVIDER_AUTH_SECRET: 'marketplace-provider-graph-test-secret',
        TEST_MIGRATIONS: await readD1Migrations('./cloudflare/d1/migrations'),
      },
    },
  }))],
  test: {
    globals: false,
    fileParallelism: false,
    testTimeout: 15_000,
    include: ['./cloudflare/workers/agenticgraph-marketplace/test/**/*.test.ts'],
  },
})
