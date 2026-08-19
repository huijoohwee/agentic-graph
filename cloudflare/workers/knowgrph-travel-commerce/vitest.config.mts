import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: './cloudflare/workers/knowgrph-travel-commerce/wrangler.jsonc' },
    miniflare: {
      bindings: { TRAVEL_COMMERCE_API_TOKEN: 'test-travel-token' },
      serviceBindings: {
        DISCOVERY_SERVICE: () => Response.json({ ok: false }, { status: 501 }),
        ISSUANCE_SERVICE: () => Response.json({ ok: false }, { status: 501 }),
        INFERENCE_PRIMARY: () => Response.json({ ok: false }, { status: 501 }),
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
