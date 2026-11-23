import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { parseTradingCalendarReceipt } from '../features/panels/views/tradingCalendarReceipt'

const base = {
  schema: 'trading-calendar-fixture/v1', operation: 'read.calendar', source: 'synthetic-market/v1',
  market: 'US', begin_date: '2026-11-19', end_date: '2026-11-21', code: 'US.BIR', name: 'Synthetic BIR',
  earnings_date: '2026-11-20', earnings_timestamp: 1795181400000000, pub_type: 'AFTER', period_text: '2026Q3',
  eps_actual: null, eps_predict: 1.3, price: '101.0000', published: false,
  request_id: '2b78a6e0-38fe-42f0-8ba8-8d09435e5c80', ledger_revision: 2,
}
function issue(body = base) {
  const canonical = JSON.stringify(body, Object.keys(body).sort())
  const digest = createHash('sha256').update(canonical).digest('hex')
  return { ...body, digest }
}

test('accepts the synthetic earnings calendar receipt with market-local date, microsecond time and null estimate', async () => {
  const receipt = issue()
  assert.equal(receipt.digest, '650181d835fc70503e3e2df7bc5b8273e2f8b243a578a3c4a25bb7828c21ac2f')
  assert.deepEqual(await parseTradingCalendarReceipt(JSON.stringify(receipt)), receipt)
  const reversed = Object.fromEntries(Object.entries(receipt).reverse())
  assert.deepEqual(await parseTradingCalendarReceipt(JSON.stringify(reversed)), receipt)
  const published = issue({ ...base, eps_actual: 1.25, published: true, code: 'US.ALD', earnings_date: '2026-11-19' })
  assert.deepEqual(await parseTradingCalendarReceipt(JSON.stringify(published)), published)
})

test('refuses malformed, out-of-window, precision-losing and forged calendar receipts', async () => {
  await assert.rejects(parseTradingCalendarReceipt(JSON.stringify(issue({ ...base, schema: 'trading-ticker-fixture/v1' }))), /read.calendar/)
  await assert.rejects(parseTradingCalendarReceipt(JSON.stringify(issue({ ...base, market: 'XX' }))), /read.calendar/)
  await assert.rejects(parseTradingCalendarReceipt(JSON.stringify(issue({ ...base, end_date: '2026-11-27' }))), /read.calendar/)
  await assert.rejects(parseTradingCalendarReceipt(JSON.stringify(issue({ ...base, earnings_date: '2026-11-22' }))), /read.calendar/)
  await assert.rejects(parseTradingCalendarReceipt(JSON.stringify(issue({ ...base, earnings_timestamp: 9007199254740993 }))), /read.calendar/)
  await assert.rejects(parseTradingCalendarReceipt(JSON.stringify(issue({ ...base, price: '1e500' }))), /read.calendar/)
  await assert.rejects(parseTradingCalendarReceipt(JSON.stringify(issue({ ...base, eps_actual: '1.2' as unknown as number }))), /read.calendar/)
  const { digest: _digest, ...withoutDigest } = issue()
  await assert.rejects(parseTradingCalendarReceipt(JSON.stringify(withoutDigest)), /read.calendar/)
  await assert.rejects(parseTradingCalendarReceipt(JSON.stringify({ ...issue(), digest: '0'.repeat(64) })), /checksum mismatch/)
  await assert.rejects(parseTradingCalendarReceipt(JSON.stringify({ ...issue(), account_alias: 'private' })), /read.calendar/)
  await assert.rejects(parseTradingCalendarReceipt('é'.repeat(2049)), /4 KiB/)
})