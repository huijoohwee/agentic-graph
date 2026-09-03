import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const configUrl = new URL('../wrangler.toml', import.meta.url)

test('production fails closed without travel experience bindings while staging retains its isolated adapter', async () => {
  const config = await readFile(configUrl, 'utf8')
  const stagingAt = config.indexOf('[env.staging]')
  const devAt = config.indexOf('[env.dev]')
  assert(stagingAt > 0 && devAt > stagingAt)
  const production = config.slice(0, stagingAt)
  const staging = config.slice(stagingAt, devAt)
  const dev = config.slice(devAt)

  assert.doesNotMatch(production, /TRAVEL_EXPERIENCE_DISCOVERY_HARNESS/)
  assert.match(staging, /binding = "TRAVEL_EXPERIENCE_DISCOVERY_HARNESS"\s+service = "agentic-travel-experience-discovery-staging"/)
  assert.match(production, /TRAVEL_DISCOVERY_MODE = "live"/)
  assert.match(staging, /TRAVEL_DISCOVERY_MODE = "live"/)
  assert.match(dev, /TRAVEL_DISCOVERY_MODE = "deterministic-demo"/)
  assert.doesNotMatch(dev, /TRAVEL_EXPERIENCE_DISCOVERY_HARNESS/)
})
