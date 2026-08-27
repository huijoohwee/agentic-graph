import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['./cloudflare/workers/agenticgraph-travel-ollama-overflow/test/**/*.test.ts'],
  },
})
