export const tickerReceiptByteLimit = 4096

export type TradingTickerReceipt = {
  schema: 'trading-ticker-fixture/v1'
  operation: 'read.ticker'
  source: 'synthetic-market/v1'
  symbol: string
  price: string
  currency: 'USD'
  market_time_utc: string
  observed_utc: string
  delay_class: 'unknown'
  request_id: string
  ledger_revision: number
  digest: string
}

const fields = [
  'currency', 'delay_class', 'ledger_revision', 'market_time_utc', 'observed_utc',
  'operation', 'price', 'request_id', 'schema', 'source', 'symbol',
] as const

function isInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false
  const ms = Date.parse(value)
  return Number.isFinite(ms) && new Date(ms).toISOString() === value
}

export async function parseTradingTickerReceipt(text: string): Promise<TradingTickerReceipt> {
  if (text.length > tickerReceiptByteLimit) throw Error('Ticker receipt exceeds 4 KiB.')
  const row = JSON.parse(text)
  if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== fields.length + 1
      || !fields.every(key => Object.prototype.hasOwnProperty.call(row, key)) || row.schema !== 'trading-ticker-fixture/v1'
      || row.operation !== 'read.ticker' || row.source !== 'synthetic-market/v1'
      || typeof row.digest !== 'string' || !/^[a-f0-9]{64}$/.test(row.digest)
      || typeof row.symbol !== 'string' || !/^[A-Z]{3}\.USD$/.test(row.symbol)
      || row.currency !== 'USD' || typeof row.price !== 'string' || !/^(?:0|[1-9]\d{0,11})\.\d{4}$/.test(row.price)
      || Number(row.price) <= 0 || row.delay_class !== 'unknown'
      || !isInstant(row.market_time_utc) || !isInstant(row.observed_utc) || row.market_time_utc > row.observed_utc
      || typeof row.request_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.request_id)
      || !Number.isSafeInteger(row.ledger_revision) || row.ledger_revision < 1) {
    throw Error('Expected a synthetic Trading read.ticker receipt with valid price, times and revision.')
  }
  // Trading hashes the flat projection using sorted JSON keys, excluding the digest itself.
  const canonical = JSON.stringify(row, [...fields])
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)))
  const digest = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')
  if (digest !== row.digest) throw Error('Ticker receipt checksum mismatch.')
  return row
}
