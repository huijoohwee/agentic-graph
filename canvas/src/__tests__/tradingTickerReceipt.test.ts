import assert from 'node:assert/strict'
import test from 'node:test'
import { parseTradingTickerReceipt } from '../features/panels/views/tradingTickerReceipt'

// Produced by Trading's loopback HTTP/MCP exporter. The checksum fixes the cross-repository wire format.
const fixture = {
  "schema": "trading-ticker-fixture/v1",
  "operation": "read.ticker",
  "source": "synthetic-market/v1",
  "symbol": "ALD.USD",
  "price": "30.8608",
  "currency": "USD",
  "market_time_utc": "2026-11-19T09:00:00.000Z",
  "observed_utc": "2026-11-23T04:46:40.541Z",
  "delay_class": "unknown",
  "request_id": "5f3bde3a-353f-4aa4-87f6-bf0185d1d01d",
  "ledger_revision": 2,
  "digest": "d2961deca48422bee134b87110f2c2c85cf61a62c3a1b85496c13e4cb4666b46"
}

test('reopens the exported ticker with exact precision, source time and digest', async () => {
  assert.deepEqual(await parseTradingTickerReceipt(JSON.stringify(fixture)), fixture)
  const reordered = Object.fromEntries(Object.entries(fixture).reverse())
  assert.deepEqual(await parseTradingTickerReceipt(JSON.stringify(reordered)), fixture)
})

test('refuses edited, non-synthetic, oversized and incomplete receipts before saving them', async () => {
  await assert.rejects(parseTradingTickerReceipt(JSON.stringify({ ...fixture, price: '30.8609' })), /checksum/)
  for (const change of [{ price: 30.8608 }, { market_time_utc: null }, { source: 'PROVIDER' },
    { observed_utc: '2020-01-01T00:00:00.000Z' }, { account_id: 'unexpected' }]) {
    await assert.rejects(parseTradingTickerReceipt(JSON.stringify({ ...fixture, ...change })), /Expected/)
  }
  await assert.rejects(parseTradingTickerReceipt(' '.repeat(4097)), /4 KiB/)
})
