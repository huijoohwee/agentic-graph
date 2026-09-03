import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['./cloudflare/workers/agentic-graph-travel-ollama-overflow/test/**/*.test.ts'],
  },
})
