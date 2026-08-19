import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@cloudflare/containers': fileURLToPath(new URL('./test/container-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['./cloudflare/workers/knowgrph-travel-ollama-overflow/test/**/*.test.ts'],
  },
})
