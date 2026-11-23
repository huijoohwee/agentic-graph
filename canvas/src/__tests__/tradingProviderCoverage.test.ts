import assert from 'node:assert/strict'
import test from 'node:test'
import { TRADING_PROVIDER_COVERAGE, COVERAGE_INDEX, coverageSummary } from '../features/panels/views/tradingCoverageInventory'

const statuses = ['mapped', 'candidate', 'paper-candidate', 'excluded']
const transports = ['MCP', 'REST', 'MCP+REST', 'PUSH']
const hex = (value: string) => /^[a-f0-9]{64}$/.test(value)

test('the Integrations coverage inventory is evidence-led and excludes live dispatch', () => {
  assert.ok(TRADING_PROVIDER_COVERAGE.length >= 20)
  assert.ok(hex(COVERAGE_INDEX.index_sha256))
  assert.equal(COVERAGE_INDEX.known_sources, COVERAGE_INDEX.imported_sources + COVERAGE_INDEX.incomplete_sources)
  const ids = new Set<string>()
  for (const entry of TRADING_PROVIDER_COVERAGE) {
    assert.ok(!ids.has(entry.id)); ids.add(entry.id)
    assert.ok(statuses.includes(entry.status))
    assert.ok(transports.includes(entry.transport))
    for (const item of entry.sources) {
      assert.ok(hex(item.sha256), item.path)
      assert.ok(item.url.startsWith('https://open.moomoo.com/'))
    }
    if (entry.status === 'excluded') {
      assert.deepEqual(entry.operations, [])
      assert.deepEqual(entry.mcp, [])
    }
  }
})

test('mapped reads mirror the Trading runtime: MCP market family and REST-only earnings calendar', () => {
  const summary = coverageSummary()
  assert.ok(summary.mappedOperations.includes('read.calendar'))
  assert.ok(summary.mappedOperations.includes('read.ticker'))
  assert.deepEqual(summary.restOnlyMapped, ['calendar'])
  assert.ok(summary.excluded.includes('trading') && summary.excluded.includes('crypto-trading'))
  const calendar = TRADING_PROVIDER_COVERAGE.find(entry => entry.id === 'calendar')!
  assert.equal(calendar.transport, 'REST')
  assert.deepEqual(calendar.mcp, [])
  assert.equal(calendar.sources[0].sha256, '36da3343d16f677f29c49f8194f6c645b5ce273bda0ccc2a1c442c8f29bf4bc2')
  assert.equal(summary.families, TRADING_PROVIDER_COVERAGE.length)
})