import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { HASH_PINNED_FORWARD_DATA_CONVERGENCE_MIGRATIONS, assertAdditiveBootstrapMigrations } from '../travel-mesh-release-plan.mjs'

const migrationDirectory = fileURLToPath(new URL('../../cloudflare/d1/migrations/', import.meta.url))
const historicalSeed = readFileSync(`${migrationDirectory}0016_native_marketplace_settlement.sql`, 'utf8')
const forwardConvergence = readFileSync(`${migrationDirectory}0017_agentic-graph_vendor_display_names.sql`, 'utf8')

const applyMigrations = (beforeForwardMigration = '') => {
  const result = spawnSync('sqlite3', ['-json', ':memory:'], {
    encoding: 'utf8',
    input: [
      historicalSeed,
      beforeForwardMigration,
      forwardConvergence,
      forwardConvergence,
      'SELECT vendor_id, display_name, content_hash, updated_at FROM marketplace_vendor ORDER BY vendor_id;',
    ].join('\n'),
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

test('forward marketplace display-name migration converges historical seed labels idempotently', () => {
  assert.deepEqual(applyMigrations(), [
    { vendor_id: 'agent-experience', display_name: 'agentic-graph Experience Agent', content_hash: 'sha256:agent-experience-marketplace-v2-agentic-graph', updated_at: '2026-09-03T00:00:00.000Z' },
    { vendor_id: 'agent-flight', display_name: 'agentic-graph Flight Agent', content_hash: 'sha256:agent-flight-marketplace-v2-agentic-graph', updated_at: '2026-09-03T00:00:00.000Z' },
    { vendor_id: 'agent-hotel', display_name: 'agentic-graph Hotel Agent', content_hash: 'sha256:agent-hotel-marketplace-v2-agentic-graph', updated_at: '2026-09-03T00:00:00.000Z' },
    { vendor_id: 'agent-shopping', display_name: 'agentic-graph Shopping Agent', content_hash: 'sha256:agent-shopping-marketplace-v2-agentic-graph', updated_at: '2026-09-03T00:00:00.000Z' },
  ])
})

test('forward marketplace display-name migration preserves an operator-customized label', () => {
  const rows = applyMigrations("UPDATE marketplace_vendor SET display_name = 'Curated Flight Agent', content_hash = 'operator-curated', updated_at = '2026-09-02T00:00:00.000Z' WHERE vendor_id = 'agent-flight';")
  assert.deepEqual(rows.find((row) => row.vendor_id === 'agent-flight'), {
    vendor_id: 'agent-flight',
    display_name: 'Curated Flight Agent',
    content_hash: 'operator-curated',
    updated_at: '2026-09-02T00:00:00.000Z',
  })
})

test('only the hash-pinned forward data migration is admitted beyond additive D1 changes', () => {
  const migrationName = '0017_agentic-graph_vendor_display_names.sql'
  assert.equal(HASH_PINNED_FORWARD_DATA_CONVERGENCE_MIGRATIONS[migrationName], '10082d30cb0dee859f2d842d3cc5b45a3a6c121276e670c69ef2896ff01b0a2c')
  const applied = new Set(readdirSync(migrationDirectory).filter(name => name.endsWith('.sql') && name !== migrationName))
  assert.doesNotThrow(() => assertAdditiveBootstrapMigrations(applied))
})
